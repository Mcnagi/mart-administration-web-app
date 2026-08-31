#!/usr/bin/env python3
"""
Prints a readable preview of a JSON file without dumping huge string values
(e.g. this project's off_images.json, where a single "photo" field can be
~700KB of base64) into the terminal. The whole file is parsed (there's no
way around that with plain json.load), but only a slice of the top-level
list/dict is ever printed, and any long string is truncated.

Usage:
    python scripts/preview_json.py off_images.json
    python scripts/preview_json.py off_images.json --count 10
    python scripts/preview_json.py off_images.json --max-chars 60
"""
import argparse
import json
from pathlib import Path


def truncate(value, max_chars):
    if isinstance(value, str) and len(value) > max_chars:
        return f"{value[:max_chars]}... ({len(value):,} chars total)"
    if isinstance(value, dict):
        return {k: truncate(v, max_chars) for k, v in value.items()}
    if isinstance(value, list):
        return [truncate(v, max_chars) for v in value]
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("input", type=Path, help="JSON file to preview")
    parser.add_argument("--count", type=int, default=5, help="Number of top-level entries to show (default: 5)")
    parser.add_argument("--max-chars", type=int, default=120, help="Truncate any string value longer than this (default: 120)")
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"File not found: {args.input}")

    data = json.loads(args.input.read_text(encoding="utf-8"))

    if isinstance(data, list):
        print(f"{args.input}: JSON array, {len(data):,} entries")
        for i, row in enumerate(data[: args.count]):
            print(f"\n[{i}]")
            print(json.dumps(truncate(row, args.max_chars), indent=2, ensure_ascii=False))
        if len(data) > args.count:
            print(f"\n... and {len(data) - args.count:,} more entries")
    elif isinstance(data, dict):
        print(f"{args.input}: JSON object, {len(data):,} top-level keys")
        for k, v in list(data.items())[: args.count]:
            print(f"\n{k!r}:")
            print(json.dumps(truncate(v, args.max_chars), indent=2, ensure_ascii=False))
        if len(data) > args.count:
            print(f"\n... and {len(data) - args.count:,} more keys")
    else:
        print(json.dumps(truncate(data, args.max_chars), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
