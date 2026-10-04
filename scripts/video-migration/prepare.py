from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True)
    parser.add_argument("--start", type=int, required=True)
    parser.add_argument("--limit", type=int, required=True)
    parser.add_argument("--per-job", type=int, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.start < 0:
        raise SystemExit("--start must be >= 0")
    if args.limit < 1:
        raise SystemExit("--limit must be >= 1")
    if args.per_job < 1:
        raise SystemExit("--per-job must be >= 1")

    csv_path = Path(args.csv)
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        total = sum(1 for _ in csv.DictReader(handle))

    start = min(args.start, total)
    end = min(total, start + args.limit)
    selected = max(0, end - start)
    shard_count = math.ceil(selected / args.per_job) if selected else 0

    if shard_count > 256:
        raise SystemExit(
            f"This selection needs {shard_count} matrix jobs; GitHub Actions allows at most 256. "
            "Lower --limit or increase --per-job."
        )

    include = []
    for shard in range(shard_count):
        shard_start = start + shard * args.per_job
        count = min(args.per_job, end - shard_start)
        include.append({"shard": shard, "start": shard_start, "count": count})

    print(json.dumps({"include": include}, separators=(",", ":")))


if __name__ == "__main__":
    main()
