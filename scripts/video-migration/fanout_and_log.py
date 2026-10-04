from __future__ import annotations

import argparse
import csv
import json
import time
from datetime import datetime, timezone
from pathlib import Path

from common import (
    DoodApi,
    EarnVidsApi,
    LOG_FIELDS,
    VoeApi,
    clean_error,
    getenv_required,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--results", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--existing", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--thumbnail-output", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--limit", type=int, default=1000)
    return parser.parse_args()


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as handle:
        return list(csv.DictReader(handle))


def load_shards(root: Path) -> list[dict[str, str]]:
    if not root.exists():
        return []
    rows: list[dict[str, str]] = []
    for path in sorted(root.rglob("*.csv")):
        rows.extend(read_csv(path))
    return rows


def migration_title(row: dict[str, str]) -> str:
    return (
        row.get("title", "")
        or row.get("source_filename", "")
        or row.get("post_id", "")
    )


def queue_remote(
    rows: list[dict[str, str]],
    earnvids: EarnVidsApi,
    dood: DoodApi,
    voe: VoeApi,
) -> None:
    for row in rows:
        if row.get("earnvids_status") != "OK":
            continue
        if row.get("overall_status") not in {
            "SEED_OK",
            "SEED_OK_NO_DIRECT",
            "PARTIAL",
        }:
            continue

        direct = row.get("seed_direct_url", "")
        if not direct:
            try:
                direct = earnvids.direct_link(
                    row["earnvids_file_code"]
                )
            except Exception as exc:
                row["dood_status"] = "BLOCKED"
                row["voe_status"] = "BLOCKED"
                row["overall_status"] = "PARTIAL"
                row["error"] = clean_error(exc)
                continue

        title = migration_title(row)

        if row.get("dood_status") != "OK":
            try:
                row["dood_file_code"] = dood.remote_upload(
                    direct,
                    title,
                )
                row["dood_status"] = "QUEUED"
            except Exception as exc:
                row["dood_status"] = "FAILED"
                row["error"] = clean_error(exc)

        if row.get("voe_status") != "OK":
            try:
                row["voe_file_code"] = voe.remote_upload(
                    direct
                )
                row["voe_status"] = "QUEUED"
            except Exception as exc:
                row["voe_status"] = "FAILED"
                row["error"] = clean_error(exc)


def poll_ready(
    rows: list[dict[str, str]],
    dood: DoodApi,
    voe: VoeApi,
    timeout_seconds: int = 2700,
) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        pending = False
        for row in rows:
            if (
                row.get("dood_status") == "QUEUED"
                and row.get("dood_file_code")
            ):
                pending = True
                try:
                    if dood.ready(row["dood_file_code"]):
                        row["dood_status"] = "OK"
                except Exception:
                    pass

            if (
                row.get("voe_status") == "QUEUED"
                and row.get("voe_file_code")
            ):
                pending = True
                try:
                    if voe.ready(row["voe_file_code"]):
                        voe.rename(
                            row["voe_file_code"],
                            migration_title(row),
                        )
                        row["voe_status"] = "OK"
                except Exception as exc:
                    row["error"] = clean_error(exc)

        if not pending:
            return
        time.sleep(15)

    for row in rows:
        if row.get("dood_status") == "QUEUED":
            row["dood_status"] = "TIMEOUT"
        if row.get("voe_status") == "QUEUED":
            row["voe_status"] = "TIMEOUT"


def finalize(
    rows: list[dict[str, str]],
    run_id: str,
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    for row in rows:
        if (
            row.get("download_status") == "OK"
            and row.get("watermark_status") == "OK"
            and row.get("earnvids_status") == "OK"
            and row.get("dood_status") == "OK"
            and row.get("voe_status") == "OK"
        ):
            row["overall_status"] = "OK"
            row["error"] = ""
        elif row.get("overall_status") in {
            "SEED_OK",
            "SEED_OK_NO_DIRECT",
        }:
            row["overall_status"] = "PARTIAL"
        row["updated_at"] = now
        row["run_id"] = run_id


def merge_log(
    source_rows: list[dict[str, str]],
    existing_rows: list[dict[str, str]],
    updates: list[dict[str, str]],
) -> list[dict[str, str]]:
    merged: dict[str, dict[str, str]] = {
        row["post_id"]: {
            field: row.get(field, "")
            for field in LOG_FIELDS
        }
        for row in existing_rows
        if row.get("post_id")
    }

    for row in updates:
        post_id = row.get("post_id", "")
        if not post_id:
            continue
        merged[post_id] = {
            field: row.get(field, "")
            for field in LOG_FIELDS
        }

    ordered: list[dict[str, str]] = []
    seen: set[str] = set()
    for source in source_rows:
        post_id = source.get("post_id", "")
        if post_id in merged:
            ordered.append(merged[post_id])
            seen.add(post_id)

    for post_id, row in merged.items():
        if post_id not in seen:
            ordered.append(row)

    return ordered


def build_thumbnail_payload(
    source_rows: list[dict[str, str]],
    log_rows: list[dict[str, str]],
    start: int = 0,
    limit: int | None = None,
) -> list[dict[str, object]]:
    log_by_id = {
        row.get("post_id", ""): row
        for row in log_rows
        if row.get("post_id")
    }

    first = max(0, start)
    if limit is None:
        selected_sources = source_rows[first:]
    else:
        selected_sources = source_rows[first : first + max(0, limit)]

    payload: list[dict[str, object]] = []

    for source in selected_sources:
        post_id = source.get("post_id", "").strip()
        if not post_id:
            continue

        thumbnail_url = source.get("thumbnail_url", "").strip()
        if not thumbnail_url.startswith(("https://", "http://")):
            continue

        row = log_by_id.get(post_id, {})
        mirrors: dict[str, str] = {}
        for field, raw_value in row.items():
            if not field.endswith("_file_code"):
                continue
            file_code = (raw_value or "").strip()
            if not file_code:
                continue
            host_id = field[: -len("_file_code")]
            if host_id:
                mirrors[host_id] = file_code

        if mirrors:
            payload.append(
                {
                    "postId": post_id,
                    "sourceThumbnailUrl": thumbnail_url,
                    "mirrors": mirrors,
                }
            )

    return payload


def main() -> None:
    args = parse_args()
    results_root = Path(args.results)
    source_path = Path(args.source)
    existing_path = Path(args.existing)
    output_path = Path(args.output)
    thumbnail_output_path = Path(args.thumbnail_output)

    shard_rows = load_shards(results_root)
    source_rows = read_csv(source_path)
    existing_rows = read_csv(existing_path)

    if shard_rows:
        earnvids = EarnVidsApi(
            getenv_required("HOST_EARNVIDS_API_KEY")
        )
        dood = DoodApi(
            getenv_required("HOST_DOOD_API_KEY")
        )
        voe = VoeApi(
            getenv_required("HOST_VOE_API_KEY")
        )

        queue_remote(
            shard_rows,
            earnvids,
            dood,
            voe,
        )
        poll_ready(
            shard_rows,
            dood,
            voe,
        )
        finalize(
            shard_rows,
            args.run_id,
        )

    merged = merge_log(
        source_rows,
        existing_rows,
        shard_rows,
    )
    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with output_path.open(
        "w",
        encoding="utf-8-sig",
        newline="",
    ) as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=LOG_FIELDS,
        )
        writer.writeheader()
        writer.writerows(merged)

    thumbnail_payload = build_thumbnail_payload(
        source_rows,
        merged,
        start=args.start,
        limit=args.limit,
    )
    thumbnail_output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )
    thumbnail_output_path.write_text(
        json.dumps(
            thumbnail_payload,
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
