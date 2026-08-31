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

A barcode that still fails after retries because of a network problem or an
HTTP 429 (as opposed to a confirmed "not on Open Food Facts") is recorded to
--failed-output (defaults to <output>.failed.json) with its failure reason
and timestamp, so it can be targeted for a later retry instead of only
showing up in the end-of-run console summary. A barcode that later succeeds
or resolves to a confirmed miss is removed from this file.

A checkpoint file (--checkpoint, defaults to <output>.checkpoint) records how
many rows of the CSV have been fully attempted, so simply re-running the same
command later picks up where it left off -- no flag needed. Pass --restart to
ignore it and start from row 0 again.

Open Food Facts' product-read API is limited to 15 req/min per IP
(https://openfoodfacts.github.io/openfoodfacts-server/api/); exceeding it
risks an IP ban with no fixed cooldown. Pass --csv-export to sidestep this
for large barcode lists: it first streams OFF's bulk CSV export
(en.openfoodfacts.org.products.csv.gz, ~1.2GB compressed) in a single
request and pulls image_url for every barcode found there -- no per-barcode
API calls at all for those. Only barcodes the export doesn't cover (e.g.
added after it was generated) fall back to the live per-barcode API as
before. The export is streamed and decompressed on the fly, never written
to disk or held in memory in full. If you already have a copy of the export
on disk (e.g. the plain, uncompressed en.openfoodfacts.org.products.csv from
https://world.openfoodfacts.org/data), pass --csv-export-file pointing at it
instead -- this reads it directly with no network request for this step at
all, and implies --csv-export.

By default, a barcode the export doesn't cover still falls back to the live
per-barcode API. Pass --csv-export-only to skip that fallback instead --
such a barcode is then treated as not found with zero live API traffic,
at the cost of never resolving anything the export missed (added since it
was generated, or a barcode outside OFF's export in the first place).

Note the bulk export itself is tab-delimited despite the .csv extension --
--barcode-column for it is "code", not "barcode". This is auto-detected if
you point --input directly at it too.

Usage:
    python scripts/fetch_off_images.py --input barcodes.csv
    python scripts/fetch_off_images.py --input barcodes.csv --barcode-column gtin --output out.json
    python scripts/fetch_off_images.py --input barcodes.csv --limit 20   # quick test run
    python scripts/fetch_off_images.py --input barcodes.csv             # re-run: auto-resumes from checkpoint
    python scripts/fetch_off_images.py --input barcodes.csv --restart   # ignore checkpoint, start over
    python scripts/fetch_off_images.py --input barcodes.csv --resume    # also skip barcodes already in --output
    python scripts/fetch_off_images.py --input barcodes.csv --csv-export  # resolve most barcodes from a freshly streamed bulk export
    python scripts/fetch_off_images.py --input barcodes.csv --csv-export-file en.openfoodfacts.org.products.csv  # ...from an export already on disk
"""
import argparse
import base64
import contextlib
import csv
import gzip
import io
import json
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

OFF_PRODUCT_ENDPOINT = "https://world.openfoodfacts.org/api/v2/product"
OFF_FIELDS = "image_url"
# Open Food Facts' bulk data export (see https://world.openfoodfacts.org/data)
# -- one download resolves image_url for every barcode it covers, entirely
# avoiding the 15 req/min per-IP product-read limit that the live API enforces.
OFF_CSV_EXPORT_URL = "https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz"
_NOT_IN_CSV_EXPORT = object()  # sentinel: barcode wasn't in the export, fall back to the live API
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


def sniff_delimiter(csv_path: Path) -> str:
    """Open Food Facts' own bulk export (e.g. en.openfoodfacts.org.products.csv)
    is actually tab-delimited despite the .csv extension -- comma is only
    right for a barcode list someone exported themselves. Picks whichever
    character is more common in the header line."""
    with csv_path.open(encoding="utf-8-sig") as f:
        header = f.readline()
    return "\t" if header.count("\t") > header.count(",") else ","


def read_barcodes(csv_path: Path, column: str, delimiter: str) -> list[str]:
    with csv_path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=delimiter)
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


def read_failed_barcodes(failed_output_path: Path) -> dict:
    """Loads a previous run's --failed-output as {barcode: record}, so this
    run's save() can update it in place instead of clobbering failures that
    weren't retried this time (e.g. --limit or a checkpoint-resumed subset)."""
    if not failed_output_path.exists():
        return {}
    try:
        rows = json.loads(failed_output_path.read_text(encoding="utf-8"))
        return {row["barcode"]: row for row in rows if row.get("barcode")}
    except (json.JSONDecodeError, KeyError, TypeError):
        return {}


def classify_error(err: Exception) -> str:
    """Tags an exception as 'rate_limited' or 'network' -- the two reasons
    worth recording to --failed-output for a later targeted retry -- or
    'other' for anything else (bad JSON, image compression failure, a
    non-429 HTTP error), which isn't."""
    if isinstance(err, urllib.error.HTTPError):
        return "rate_limited" if err.code == 429 else "other"
    if isinstance(err, RuntimeError) and "429" in str(err):
        return "rate_limited"
    if isinstance(err, (urllib.error.URLError, TimeoutError)):
        return "network"
    return "other"


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
    error_reason: str | None = None  # 'rate_limited' | 'network' | 'other', set only alongside error


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


def _download_and_compress(barcode: str, image_url: str, image_rate_limiter: RateLimiter) -> FetchResult:
    try:
        image_bytes, content_type = _download_image(image_url, image_rate_limiter)
        photo = compress_to_base64(image_bytes, content_type)
    except Exception as err:
        return FetchResult(barcode, None, f"image download/compress failed: {err}", classify_error(err))
    return FetchResult(barcode, photo, None)


def fetch_product_photo(
    barcode: str,
    api_rate_limiter: RateLimiter,
    image_rate_limiter: RateLimiter,
    monitor: RateLimitMonitor,
    csv_image_url=_NOT_IN_CSV_EXPORT,
    csv_export_only: bool = False,
) -> FetchResult:
    """Resolves a barcode to its photo. If csv_image_url was already
    resolved from the bulk CSV export (see fetch_image_urls_from_csv_export),
    the per-barcode product API lookup is skipped entirely and only the
    image CDN is hit -- an empty string means the export confirmed the
    product has no photo, a real miss rather than something to retry. If the
    barcode wasn't in the export at all, csv_export_only decides whether that
    falls back to the live per-barcode API (default) or is treated as a
    miss with no live lookup at all -- see --csv-export-only."""
    if csv_image_url is not _NOT_IN_CSV_EXPORT:
        if not csv_image_url:
            return FetchResult(barcode, None, None)
        return _download_and_compress(barcode, csv_image_url, image_rate_limiter)

    if csv_export_only:
        return FetchResult(barcode, None, None)

    url = f"{OFF_PRODUCT_ENDPOINT}/{barcode}.json?fields={OFF_FIELDS}"
    try:
        data = _request_json(url, api_rate_limiter, monitor)
    except Exception as err:
        return FetchResult(barcode, None, str(err), classify_error(err))

    if data.get("status") != 1:
        return FetchResult(barcode, None, None)
    image_url = ((data.get("product") or {}).get("image_url") or "").strip()
    if not image_url:
        return FetchResult(barcode, None, None)

    return _download_and_compress(barcode, image_url, image_rate_limiter)


@contextlib.contextmanager
def _open_csv_export_lines(csv_url: str, local_path: Path | None):
    """Yields a text line iterator over the bulk export's TSV content, either
    reading it straight from an already-downloaded local copy (plain,
    uncompressed -- e.g. one saved by hand from
    https://world.openfoodfacts.org/data) or streaming and decompressing it
    from `csv_url` on the fly, never holding the ~9GB decompressed file in
    memory or writing it to disk."""
    if local_path is not None:
        print(f"Reading Open Food Facts' bulk CSV export from {local_path} (already downloaded, no network request)...", flush=True)
        with local_path.open(encoding="utf-8", errors="replace", newline="") as f:
            yield f
        return
    print(
        "Downloading Open Food Facts' bulk CSV export to resolve barcodes in one pass "
        "(streams a large file -- this can take a few minutes)...",
        flush=True,
    )
    request = urllib.request.Request(csv_url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        with gzip.GzipFile(fileobj=response) as gz:
            yield io.TextIOWrapper(gz, encoding="utf-8", errors="replace", newline="")


def normalize_barcode(code: str) -> str:
    """Strips leading zeros so e.g. "0000001234" and "00001234" -- the same
    GTIN with different zero-padding -- compare equal. Open Food Facts' live
    product API normalizes padding internally when you look a barcode up, but
    a literal string match against the bulk export's `code` column does not,
    so barcodes that only differ by padding would otherwise silently miss.
    Left as-is (including non-numeric barcodes) if stripping leaves nothing,
    so it never turns a real code into an empty string."""
    stripped = code.lstrip("0")
    return stripped or code


def fetch_image_urls_from_csv_export(
    barcodes: set[str], csv_url: str = OFF_CSV_EXPORT_URL, local_path: Path | None = None, export_only: bool = False
) -> dict[str, str]:
    """Scans Open Food Facts' bulk CSV export (see _open_csv_export_lines --
    either a local file or a fresh streamed download) and pulls image_url out
    for every barcode in `barcodes`. When streamed fresh, this is a single
    request rather than one per barcode, so it doesn't count against the
    product-read API's 15 req/min per-IP limit at all; a local copy makes no
    network request whatsoever. Matching is done on normalize_barcode() of
    both sides, so differing zero-padding between your input list and the
    export doesn't cause a miss.

    Returns {barcode: image_url}, image_url == "" for a product the export
    confirms has no photo. A barcode absent from the result simply wasn't in
    this export (e.g. added since it was generated, or not a food product)
    and needs the live per-barcode API as a fallback.
    """
    found: dict[str, str] = {}
    if not barcodes:
        return found
    # Keyed by normalized form -> original barcode string(s) as given in
    # --input, since that's what callers look results up by. A collision
    # (two input barcodes that only differ by padding) resolves to both.
    remaining: dict[str, list[str]] = {}
    for b in barcodes:
        remaining.setdefault(normalize_barcode(b), []).append(b)

    with _open_csv_export_lines(csv_url, local_path) as text_stream:
        delimiter = "\t" if local_path is None else sniff_delimiter(local_path)
        header = next(text_stream).rstrip("\n").split(delimiter)
        try:
            code_index = header.index("code")
            image_url_index = header.index("image_url")
        except ValueError:
            raise RuntimeError("CSV export is missing the expected 'code'/'image_url' columns -- format may have changed")

        rows_scanned = 0
        for line in text_stream:
            rows_scanned += 1
            if rows_scanned % 500_000 == 0:
                print(f"  ...scanned {rows_scanned:,} export rows, {len(found)}/{len(barcodes)} barcode(s) resolved so far", flush=True)
            fields = line.rstrip("\n").split(delimiter)
            if len(fields) <= image_url_index:
                continue
            norm_code = normalize_barcode(fields[code_index].strip())
            originals = remaining.pop(norm_code, None)
            if originals:
                image_url = fields[image_url_index].strip()
                for orig in originals:
                    found[orig] = image_url
                if not remaining:
                    break

    rest_note = "the rest are treated as not found (--csv-export-only)" if export_only else "the rest will use the live API"
    print(
        f"Resolved {len(found)}/{len(barcodes)} barcode(s) from the CSV export "
        f"({sum(1 for v in found.values() if v)} with a photo) -- {rest_note}.",
        flush=True,
    )
    return found


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
    parser.add_argument("--failed-output", type=Path, default=None, help="Where to record barcodes that failed due to a network problem or HTTP 429, for a later targeted retry (default: <output>.failed.json)")
    parser.add_argument("--csv-export", action="store_true", help="Resolve image_url for as many barcodes as possible from Open Food Facts' bulk CSV export (one ~1.2GB streamed download) before falling back to the per-barcode API -- avoids the 15 req/min per-IP rate limit for barcodes the export covers. Worth it mainly for large barcode lists.")
    parser.add_argument("--csv-export-file", type=Path, default=None, help="Use an already-downloaded copy of Open Food Facts' bulk export (the plain .csv, not .gz) instead of streaming a fresh one -- no network request for this step at all. Implies --csv-export.")
    parser.add_argument("--csv-export-only", action="store_true", help="Requires --csv-export/--csv-export-file. Treat a barcode missing from the export as not found instead of falling back to the live per-barcode API -- no live API traffic at all, at the cost of never resolving barcodes the export doesn't cover (e.g. added since it was generated).")
    parser.add_argument("--csv-export-url", default=OFF_CSV_EXPORT_URL, help=argparse.SUPPRESS)
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"Input file not found: {args.input}")
    if args.csv_export_only and not (args.csv_export or args.csv_export_file):
        raise SystemExit("--csv-export-only requires --csv-export or --csv-export-file")

    checkpoint_path = args.checkpoint or args.output.with_name(args.output.name + ".checkpoint")
    failed_output_path = args.failed_output or args.output.with_name(args.output.name + ".failed.json")

    def save_checkpoint(row_number):
        checkpoint_path.write_text(str(row_number), encoding="utf-8")

    delimiter = sniff_delimiter(args.input)
    raw_barcodes = read_barcodes(args.input, args.barcode_column, delimiter)
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
    previous_failed = read_failed_barcodes(failed_output_path)
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

    csv_image_urls: dict[str, str] = {}
    if args.csv_export or args.csv_export_file:
        if args.csv_export_file and not args.csv_export_file.exists():
            raise SystemExit(f"--csv-export-file not found: {args.csv_export_file}")
        try:
            csv_image_urls = fetch_image_urls_from_csv_export(
                set(barcodes), args.csv_export_url, args.csv_export_file, args.csv_export_only
            )
        except Exception as err:
            print(f"Warning: CSV export lookup failed ({err}) -- falling back to the per-barcode API for everything.", flush=True)

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

        # Track network/429 failures separately from confirmed hits and
        # misses, merged onto whatever --failed-output already had (from an
        # earlier run this one didn't re-attempt), so the file always
        # reflects each barcode's most recent outcome.
        for b in barcodes:
            result = outcomes.get(b)
            if result is None:
                continue
            if result.error is None:
                previous_failed.pop(b, None)  # succeeded, or confirmed not on Open Food Facts
            elif result.error_reason in ("rate_limited", "network"):
                previous_failed[b] = {
                    "barcode": b,
                    "reason": result.error_reason,
                    "error": result.error,
                    "lastFailedAt": datetime.now(timezone.utc).isoformat(),
                }
        failed_output_path.write_text(
            json.dumps(list(previous_failed.values()), ensure_ascii=False, indent=2), encoding="utf-8"
        )
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
    futures = {
        executor.submit(
            fetch_product_photo, b, rate_limiter, image_rate_limiter, monitor,
            csv_image_urls.get(b, _NOT_IN_CSV_EXPORT), args.csv_export_only,
        ): b
        for b in barcodes
    }
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
    network_or_rate_limited = sum(1 for r in outcomes.values() if r.error_reason in ("rate_limited", "network"))
    skipped = total - len(outcomes)

    print(f"\nDone: {len(results)} total with an image, {not_found} not found on Open Food Facts, {len(errors)} failed" + (f", {skipped} not attempted" if skipped else ""))
    if errors:
        print(f"Failed lookups ({len(errors)}) -- consider retrying just these with --resume:")
        for barcode, err in errors:
            print(f"  {barcode}: {err}")
    if network_or_rate_limited:
        print(f"{network_or_rate_limited} of those failed due to a network problem or HTTP 429 and were recorded to {failed_output_path} for a later targeted retry.")
    print(f"Wrote {len(results)} result(s) to {args.output}")


if __name__ == "__main__":
    main()
