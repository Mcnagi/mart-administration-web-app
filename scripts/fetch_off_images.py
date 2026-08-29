#!/usr/bin/env python3
"""
Look up product photos on Open Food Facts for a list of barcodes read from a
CSV, download each photo, and save the results as JSON shaped like rows for
this project's `data` Firestore collection (see src/api/dataApi.js): a list
of {"barcode": ..., "photo": ...} objects where `photo` is a base64 JPEG data
URL -- the exact format savePhotoForBarcode() writes to Firestore -- ready to
be merged in by a future upload step.

Each photo is resized/re-encoded to match this project's own compression
budget (see src/services/imageService.js: max 900px, JPEG quality 0.7, capped
around 700KB so it fits well under Firestore's 1MiB document limit). This
requires Pillow (`pip install pillow`); without it, the script falls back to
base64-encoding the raw downloaded bytes as-is, which is usually fine for
Open Food Facts' default 400px photos but isn't guaranteed to fit the budget.

Lookups run in parallel (--workers), paced by a shared rate limiter (--delay)
so the overall request rate stays within Open Food Facts' limits (their
product API asks for at most ~100 requests/minute) regardless of worker
count -- more workers only lets requests overlap in flight, it does not
raise the enforced rate. Image downloads (from Open Food Facts' image CDN,
a separate host) are paced independently via --image-delay. Per-barcode "not
found" results are collected silently and reported in a summary at the end,
but a 429 (rate limited) response is retried with backoff and, if it keeps
happening, prints one visible warning and slows the whole run down rather
than staying silent about it.

A checkpoint file (--checkpoint, defaults to <output>.checkpoint) records how
many rows of the CSV have been fully attempted, so simply re-running the same
command later picks up where it left off -- no flag needed. Pass --restart to
ignore it and start from row 0 again.

Usage:
    python scripts/fetch_off_images.py --input barcodes.csv
    python scripts/fetch_off_images.py --input barcodes.csv --barcode-column gtin --output out.json
    python scripts/fetch_off_images.py --input barcodes.csv --limit 20   # quick test run
    python scripts/fetch_off_images.py --input barcodes.csv             # re-run: auto-resumes from checkpoint
    python scripts/fetch_off_images.py --input barcodes.csv --restart   # ignore checkpoint, start over
    python scripts/fetch_off_images.py --input barcodes.csv --resume    # also skip barcodes already in --output
"""
import argparse
import base64
import csv
import json
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

OFF_PRODUCT_ENDPOINT = "https://world.openfoodfacts.org/api/v2/product"
OFF_FIELDS = "image_url"
# Open Food Facts asks all API clients to identify themselves with a
# descriptive User-Agent; see
# https://openfoodfacts.github.io/openfoodfacts-server/api/ref-cheatsheet/
USER_AGENT = "emart-image-fetch-script/1.0 (+huanjie@protonmail.com)"
MAX_RETRIES = 3

# Mirrors src/services/imageService.js's compression budget, so a photo
# fetched here looks the same as one a user uploaded through the app.
MAX_DIMENSION = 900
JPEG_QUALITY = 70
MAX_BASE64_BYTES = 700 * 1024


def compress_to_base64(image_bytes: bytes, content_type: str) -> str:
    if not HAS_PIL:
        mime = (content_type or "image/jpeg").split(";")[0].strip() or "image/jpeg"
        data_url = f"data:{mime};base64,{base64.b64encode(image_bytes).decode('ascii')}"
        if len(data_url) > MAX_BASE64_BYTES:
            raise ValueError(f"image is {len(data_url)} bytes as base64 and Pillow isn't installed to shrink it -- run `pip install pillow`")
        return data_url

    image = Image.open(BytesIO(image_bytes)).convert("RGB")

    def encode(dimension, quality):
        resized = image.copy()
        resized.thumbnail((dimension, dimension), Image.LANCZOS)
        buffer = BytesIO()
        resized.save(buffer, format="JPEG", quality=quality)
        return f"data:image/jpeg;base64,{base64.b64encode(buffer.getvalue()).decode('ascii')}"

    dimension, quality = MAX_DIMENSION, JPEG_QUALITY
    data_url = encode(dimension, quality)
    attempts = 0
    while len(data_url) > MAX_BASE64_BYTES and attempts < 5:
        quality = max(40, quality - 15)
        dimension = round(dimension * 0.85)
        data_url = encode(dimension, quality)
        attempts += 1

    if len(data_url) > MAX_BASE64_BYTES:
        raise ValueError(f"image still {len(data_url)} bytes as base64 after compression")
    return data_url


def read_barcodes(csv_path: Path, column: str) -> list[str]:
    with csv_path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        actual_column = next((f for f in fieldnames if f.strip().lower() == column.strip().lower()), None)
        if actual_column is None:
            raise SystemExit(
                f"Column '{column}' not found in {csv_path}. Available columns: {', '.join(fieldnames)}"
            )
        seen = set()
        barcodes = []
        for row in reader:
            barcode = (row.get(actual_column) or "").strip()
            if barcode and barcode not in seen:
                seen.add(barcode)
                barcodes.append(barcode)
        return barcodes


def read_existing_barcodes(output_path: Path) -> set[str]:
    if not output_path.exists():
        return set()
    try:
        rows = json.loads(output_path.read_text(encoding="utf-8"))
        return {row["barcode"] for row in rows if row.get("barcode")}
    except (json.JSONDecodeError, KeyError, TypeError):
        return set()


class RateLimiter:
    """Paces request *starts* across all worker threads to a fixed minimum
    interval, so overall throughput stays within Open Food Facts' rate
    limits no matter how many workers are running, while still letting
    multiple requests be in flight (and thus overlap network latency).
    delay can be raised at runtime (see RateLimitMonitor) if the server
    starts throttling us anyway."""

    def __init__(self, delay: float):
        self.delay = delay
        self.lock = threading.Lock()
        self.next_time = 0.0

    def wait(self):
        with self.lock:
            now = time.monotonic()
            start_at = max(now, self.next_time)
            self.next_time = start_at + self.delay
        sleep_for = start_at - now
        if sleep_for > 0:
            time.sleep(sleep_for)

    def slow_down(self, factor: float):
        with self.lock:
            self.delay *= factor


class RateLimitMonitor:
    """Tracks HTTP 429 responses across all worker threads. A handful of
    429s can happen transiently and are just retried by fetch_image_url,
    but if they keep occurring it means the whole run is being throttled --
    that's worth breaking the "summarize at the end" silence for, since
    otherwise the run just crawls with no visible explanation."""

    THRESHOLD = 5

    def __init__(self, rate_limiter: RateLimiter):
        self.rate_limiter = rate_limiter
        self.lock = threading.Lock()
        self.hit_count = 0
        self.warned = False

    def record_hit(self):
        with self.lock:
            self.hit_count += 1
            should_warn = self.hit_count >= self.THRESHOLD and not self.warned
            if should_warn:
                self.warned = True
        if should_warn:
            self.rate_limiter.slow_down(3)
            print(
                f"\n[rate limit] Open Food Facts is throttling this run (HTTP 429 seen "
                f"{self.hit_count}+ times) -- slowing all requests down to 1 per "
                f"{self.rate_limiter.delay:.2f}s from here on. If it stays this slow, "
                f"stop (Ctrl-C, progress is saved) and resume later with --resume "
                f"and a lower --workers/higher --delay.\n",
                flush=True,
            )


@dataclass
class FetchResult:
    barcode: str
    photo: str | None  # base64 JPEG data URL, or None
    error: str | None  # set only on a request/parse/compression failure, not a plain "not found"


def _request_json(url: str, rate_limiter: RateLimiter, monitor: RateLimitMonitor):
    """GETs a JSON URL with retry/backoff on network errors and HTTP 429s.
    Returns the parsed body, or raises the underlying exception after the
    last retry is exhausted."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(MAX_RETRIES + 1):
        rate_limiter.wait()
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return json.load(response)
        except urllib.error.HTTPError as err:
            if err.code == 429:
                monitor.record_hit()
                if attempt < MAX_RETRIES:
                    retry_after = err.headers.get("Retry-After") if err.headers else None
                    wait_s = float(retry_after) if retry_after and retry_after.isdigit() else 2 ** attempt
                    time.sleep(wait_s)
                    continue
            raise
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            if attempt < MAX_RETRIES:
                time.sleep(2 ** attempt)
                continue
            raise
    raise RuntimeError("gave up after repeated HTTP 429s")


def _download_image(image_url: str, rate_limiter: RateLimiter) -> tuple[bytes, str]:
    """Downloads raw image bytes from Open Food Facts' image CDN, with the
    same retry/backoff as _request_json but without 429-monitor tracking --
    the CDN is a different host from the product API and isn't expected to
    throttle the way the API does."""
    request = urllib.request.Request(image_url, headers={"User-Agent": USER_AGENT})
    for attempt in range(MAX_RETRIES + 1):
        rate_limiter.wait()
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return response.read(), response.headers.get("Content-Type", "image/jpeg")
        except (urllib.error.URLError, TimeoutError):
            if attempt < MAX_RETRIES:
                time.sleep(2 ** attempt)
                continue
            raise
    raise RuntimeError("unreachable")


def fetch_product_photo(barcode: str, api_rate_limiter: RateLimiter, image_rate_limiter: RateLimiter, monitor: RateLimitMonitor) -> FetchResult:
    url = f"{OFF_PRODUCT_ENDPOINT}/{barcode}.json?fields={OFF_FIELDS}"
    try:
        data = _request_json(url, api_rate_limiter, monitor)
    except Exception as err:
        return FetchResult(barcode, None, str(err))

    if data.get("status") != 1:
        return FetchResult(barcode, None, None)
    image_url = ((data.get("product") or {}).get("image_url") or "").strip()
    if not image_url:
        return FetchResult(barcode, None, None)

    try:
        image_bytes, content_type = _download_image(image_url, image_rate_limiter)
        photo = compress_to_base64(image_bytes, content_type)
    except Exception as err:
        return FetchResult(barcode, None, f"image download/compress failed: {err}")
    return FetchResult(barcode, photo, None)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", required=True, type=Path, help="CSV file containing a barcode column")
    parser.add_argument("--output", default=Path("off_images.json"), type=Path, help="Where to write the JSON results (default: off_images.json)")
    parser.add_argument("--barcode-column", default="barcode", help="Name of the barcode column in the CSV (default: barcode)")
    parser.add_argument("--workers", type=int, default=8, help="Number of barcodes to look up in parallel (default: 8). Does not raise the enforced request rate, just lets requests overlap in flight.")
    parser.add_argument("--delay", type=float, default=0.65, help="Minimum seconds between product API request starts, shared across all workers (default: 0.65, i.e. ~90 requests/min total -- Open Food Facts asks for at most ~100/min)")
    parser.add_argument("--image-delay", type=float, default=0.1, help="Minimum seconds between image-download starts on the CDN host, shared across all workers (default: 0.1)")
    parser.add_argument("--limit", type=int, default=None, help="Only process the first N barcodes (useful for a quick test run)")
    parser.add_argument("--resume", action="store_true", help="Also skip barcodes that already have an entry in --output from a previous run (content-based, safe even if the CSV changes)")
    parser.add_argument("--checkpoint", type=Path, default=None, help="Where to record how many CSV rows have been attempted (default: <output>.checkpoint). Re-running the same command auto-resumes from here.")
    parser.add_argument("--restart", action="store_true", help="Ignore any existing checkpoint and start from row 0")
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"Input file not found: {args.input}")

    checkpoint_path = args.checkpoint or args.output.with_name(args.output.name + ".checkpoint")

    def save_checkpoint(row_number):
        checkpoint_path.write_text(str(row_number), encoding="utf-8")

    raw_barcodes = read_barcodes(args.input, args.barcode_column)
    start_index = 0
    if not args.restart and checkpoint_path.exists():
        try:
            start_index = int(checkpoint_path.read_text(encoding="utf-8").strip())
        except ValueError:
            start_index = 0
        if start_index:
            print(f"Resuming from checkpoint: skipping the first {start_index} row(s) already attempted (see {checkpoint_path})", flush=True)
    barcodes = raw_barcodes[start_index:]

    # Existing results are always carried forward and merged into, not just
    # under --resume -- otherwise a checkpoint-only resume (no --resume flag)
    # would overwrite the output file and lose everything from earlier runs.
    existing_barcodes = read_existing_barcodes(args.output)
    previous_results = json.loads(args.output.read_text(encoding="utf-8")) if existing_barcodes else []
    if args.resume and existing_barcodes:
        skipped_count = len([b for b in barcodes if b in existing_barcodes])
        barcodes = [b for b in barcodes if b not in existing_barcodes]
        print(f"--resume: skipping {skipped_count} more barcode(s) already in {args.output}", flush=True)
    if args.limit:
        barcodes = barcodes[: args.limit]
    total = len(barcodes)
    if total == 0:
        print("Nothing to do -- checkpoint already covers the whole file (pass --restart to redo it).", flush=True)
        return
    if not HAS_PIL:
        print("Note: Pillow isn't installed (`pip install pillow`) -- photos will be stored as raw bytes, uncompressed.", flush=True)
    print(f"Looking up {total} barcode(s) on Open Food Facts ({args.workers} workers)...", flush=True)

    rate_limiter = RateLimiter(args.delay)
    image_rate_limiter = RateLimiter(args.image_delay)
    monitor = RateLimitMonitor(rate_limiter)
    outcomes: dict[str, FetchResult] = {}
    completed = 0

    def save():
        # Preserve the input CSV's order and only emit barcodes that
        # actually resolved to a photo, regardless of how the parallel
        # workers finished. Merged onto whatever was already in the output
        # file (e.g. from earlier checkpointed runs), keyed by barcode so a
        # barcode re-attempted after --restart overwrites its old entry
        # rather than duplicating it.
        merged = {r["barcode"]: r for r in previous_results}
        for b in barcodes:
            if b in outcomes and outcomes[b].photo:
                merged[b] = {"barcode": b, "photo": outcomes[b].photo}
        results = list(merged.values())
        args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
        return results

    SAVE_EVERY = 250  # autosave periodically so a hard kill (not just Ctrl-C) can't lose a whole run

    # The checkpoint only ever advances past a *contiguous* run of fully
    # attempted rows (tracked via `watermark`), never past a row that's
    # still in flight -- otherwise, since workers finish out of order, a
    # checkpoint could skip a row that was never actually attempted.
    barcode_to_index = {b: i for i, b in enumerate(barcodes)}
    done_indices = set()
    watermark = 0

    executor = ThreadPoolExecutor(max_workers=args.workers)
    futures = {executor.submit(fetch_product_photo, b, rate_limiter, image_rate_limiter, monitor): b for b in barcodes}
    try:
        for future in as_completed(futures):
            result = future.result()
            outcomes[result.barcode] = result
            completed += 1
            done_indices.add(barcode_to_index[result.barcode])
            while watermark in done_indices:
                done_indices.discard(watermark)
                watermark += 1
            if completed % SAVE_EVERY == 0:
                save()
                save_checkpoint(start_index + watermark)
            if completed % 25 == 0 or completed == total:
                print(f"  {completed}/{total} checked", flush=True)
    except KeyboardInterrupt:
        # Save immediately, before doing anything that can block (like
        # waiting for in-flight requests to drain) -- a second Ctrl-C out of
        # impatience must not be able to skip past an unsaved save().
        results = save()
        save_checkpoint(start_index + watermark)
        print(f"\nInterrupted -- saved {len(results)} result(s) so far to {args.output}", flush=True)
        print(f"Checkpoint at row {start_index + watermark} saved to {checkpoint_path} -- just re-run the same command to resume.", flush=True)
        print("Cancelling pending lookups (already-running ones may take a few seconds to stop)...", flush=True)
        for f in futures:
            f.cancel()
        executor.shutdown(wait=False, cancel_futures=True)
    else:
        executor.shutdown(wait=True)
        results = save()
        save_checkpoint(start_index + watermark)

    not_found = sum(1 for r in outcomes.values() if r.error is None and r.photo is None)
    errors = [(r.barcode, r.error) for r in outcomes.values() if r.error is not None]
    skipped = total - len(outcomes)

    print(f"\nDone: {len(results)} total with an image, {not_found} not found on Open Food Facts, {len(errors)} failed" + (f", {skipped} not attempted" if skipped else ""))
    if errors:
        print(f"Failed lookups ({len(errors)}) -- consider retrying just these with --resume:")
        for barcode, err in errors:
            print(f"  {barcode}: {err}")
    print(f"Wrote {len(results)} result(s) to {args.output}")


if __name__ == "__main__":
    main()
