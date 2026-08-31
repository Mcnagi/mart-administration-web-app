#!/usr/bin/env python3
"""
Uploads the {"barcode": ..., "photo": ...} rows produced by
scripts/fetch_off_images.py into this project's `data` Firestore collection,
matching exactly what src/api/dataApi.js's savePhotoForBarcode() writes: each
row is merged onto the doc at data/{barcode}, not overwritten -- so any
existing fields on that doc (product, quantity, etc. from an admin Excel
import, see services/dataService.js) are preserved.

Requires the Firebase Admin SDK for Python and a service account key with
write access to this project's Firestore:
    pip install firebase-admin
Download a key from Firebase Console > Project Settings > Service Accounts >
Generate new private key, then either pass --credentials path/to/key.json or
set the GOOGLE_APPLICATION_CREDENTIALS environment variable to its path.

Writes are batched: Firestore's hard limit is 500 ops per batch, but photos
here run up to ~700KB each (see MAX_BASE64_BYTES in fetch_off_images.py) so
batches are also capped by total payload size, not just op count. A
checkpoint file records how many input rows have been fully committed, so
re-running the same command after an interruption resumes rather than
re-uploading everything.

This writes real data to your production Firestore project and counts
against its daily write quota (20,000/day on the free tier -- see
api/dataApi.js's upsertRowsByBarcode). By default this is a DRY RUN that only
prints what would happen; pass --commit to actually write.

Usage:
    python scripts/upload_off_images.py --input off_images.json --credentials key.json
    python scripts/upload_off_images.py --input off_images.json --credentials key.json --limit 20 --commit   # small test write
    python scripts/upload_off_images.py --input off_images.json --credentials key.json --commit
    python scripts/upload_off_images.py --input off_images.json --credentials key.json --commit   # re-run: auto-resumes from checkpoint
"""
import argparse
import json
import sys
import time
from pathlib import Path

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    sys.exit("firebase-admin isn't installed -- run `pip install firebase-admin` first.")

COLLECTION = "data"
MAX_BATCH_OPS = 400  # Firestore's hard cap is 500 ops/batch; leave headroom
MAX_BATCH_BYTES = 8 * 1024 * 1024  # stay well under the default gRPC message-size ceiling
MAX_RETRIES = 3


def load_rows(input_path: Path) -> list[dict]:
    raw_rows = json.loads(input_path.read_text(encoding="utf-8"))
    seen = set()
    rows = []
    skipped_invalid = 0
    for row in raw_rows:
        barcode = (row.get("barcode") or "").strip()
        photo = row.get("photo")
        if not barcode or not photo or barcode in seen:
            continue
        if "/" in barcode:
            # doc(dataCol, barcode) in the app itself would also mistake this
            # for a subcollection path -- not safe to write as a doc ID.
            skipped_invalid += 1
            continue
        seen.add(barcode)
        rows.append({"barcode": barcode, "photo": photo})
    if skipped_invalid:
        print(f"Skipped {skipped_invalid} row(s) with a '/' in the barcode (not a valid Firestore doc ID).", flush=True)
    return rows


def chunk_rows(rows: list[dict]):
    """Groups rows into batches under both MAX_BATCH_OPS and MAX_BATCH_BYTES
    -- a fixed op count alone isn't safe here since photo size varies widely
    (a few KB up to ~700KB), unlike a typical small-document import."""
    batch, batch_bytes = [], 0
    for row in rows:
        row_bytes = len(row["photo"].encode("utf-8"))
        if batch and (len(batch) >= MAX_BATCH_OPS or batch_bytes + row_bytes > MAX_BATCH_BYTES):
            yield batch
            batch, batch_bytes = [], 0
        batch.append(row)
        batch_bytes += row_bytes
    if batch:
        yield batch


def commit_with_retry(db, batch_rows: list[dict]):
    for attempt in range(MAX_RETRIES + 1):
        try:
            batch = db.batch()
            for row in batch_rows:
                ref = db.collection(COLLECTION).document(row["barcode"])
                batch.set(ref, {"barcode": row["barcode"], "photo": row["photo"]}, merge=True)
            batch.commit()
            return
        except Exception:
            if attempt < MAX_RETRIES:
                time.sleep(2**attempt)
                continue
            raise


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", required=True, type=Path, help="JSON file of {barcode, photo} rows, e.g. off_images.json from fetch_off_images.py")
    parser.add_argument("--credentials", type=Path, default=None, help="Path to a Firebase service account key JSON. Falls back to GOOGLE_APPLICATION_CREDENTIALS if not given.")
    parser.add_argument("--commit", action="store_true", help="Actually write to Firestore. Without this, only prints what would be uploaded (dry run).")
    parser.add_argument("--limit", type=int, default=None, help="Only upload the first N rows (useful for a small test write)")
    parser.add_argument("--checkpoint", type=Path, default=None, help="Where to record how many rows have been committed (default: <input>.upload_checkpoint). Re-running the same command auto-resumes from here.")
    parser.add_argument("--restart", action="store_true", help="Ignore any existing checkpoint and start from row 0")
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"Input file not found: {args.input}")

    checkpoint_path = args.checkpoint or args.input.with_name(args.input.name + ".upload_checkpoint")

    rows = load_rows(args.input)
    start_index = 0
    if not args.restart and checkpoint_path.exists():
        try:
            start_index = int(checkpoint_path.read_text(encoding="utf-8").strip())
        except ValueError:
            start_index = 0
        if start_index:
            print(f"Resuming from checkpoint: skipping the first {start_index} row(s) already committed (see {checkpoint_path})", flush=True)
    rows = rows[start_index:]
    if args.limit:
        rows = rows[: args.limit]
    if not rows:
        print("Nothing to do -- checkpoint already covers the whole file (pass --restart to redo it).", flush=True)
        return

    if not args.commit:
        print(f"DRY RUN: would upload {len(rows)} row(s) to Firestore collection '{COLLECTION}' -- pass --commit to actually write.", flush=True)
        for row in rows[:5]:
            print(f"  {row['barcode']}: photo ({len(row['photo']):,} chars)")
        if len(rows) > 5:
            print(f"  ...and {len(rows) - 5} more")
        return

    if args.credentials:
        cred = credentials.Certificate(str(args.credentials))
        firebase_admin.initialize_app(cred)
    else:
        firebase_admin.initialize_app()  # uses GOOGLE_APPLICATION_CREDENTIALS
    db = firestore.client()

    total = len(rows)
    committed = 0
    print(f"Uploading {total} row(s) to Firestore collection '{COLLECTION}'...", flush=True)
    for batch_rows in chunk_rows(rows):
        commit_with_retry(db, batch_rows)
        committed += len(batch_rows)
        checkpoint_path.write_text(str(start_index + committed), encoding="utf-8")
        print(f"  {committed}/{total} committed", flush=True)

    print(f"Done: {committed} row(s) written to Firestore.", flush=True)


if __name__ == "__main__":
    main()
