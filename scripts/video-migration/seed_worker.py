from __future__ import annotations

import argparse
import csv
import os
import re
import shutil
import time
from urllib.parse import parse_qs, urlparse
from datetime import datetime, timezone
from pathlib import Path

import gdown

from common import (
    DoodApi,
    EarnVidsApi,
    SHARD_FIELDS,
    TERMINAL_STATUSES,
    VoeApi,
    clean_error,
    extract_drive_urls,
    getenv_required,
    sha256_file,
    video_candidates,
    watermark_video,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True)
    parser.add_argument("--log", required=True)
    parser.add_argument("--start", type=int, required=True)
    parser.add_argument("--count", type=int, required=True)
    parser.add_argument("--logo", required=True)
    parser.add_argument("--work-root", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--force", default="false")
    parser.add_argument("--skip-watermark", default="false")
    parser.add_argument(
        "--upload-strategy",
        choices=("remote_fanout", "local_all_hosts"),
        default="remote_fanout",
    )
    return parser.parse_args()


def is_truthy(value: str | bool | None) -> bool:
    return str(value).lower() in {"1", "true", "yes", "on"}


def load_existing(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return {
            row["post_id"]: row
            for row in csv.DictReader(handle)
            if row.get("post_id")
        }


def drive_file_id(url: str) -> str | None:
    match = re.search(r"/file/d/([^/?#]+)", url)
    if match:
        return match.group(1)

    parsed = urlparse(url)
    values = parse_qs(parsed.query).get("id")
    return values[0] if values else None


def download_sources(urls: list[str], target: Path) -> list[str]:
    errors: list[str] = []
    for index, url in enumerate(urls):
        destination = target / f"source-{index + 1}"
        destination.mkdir(parents=True, exist_ok=True)
        try:
            if "/drive/folders/" in url:
                result = gdown.download_folder(
                    url=url,
                    output=str(destination),
                    quiet=True,
                )
                if not result:
                    errors.append("folder download returned no files")
            else:
                file_id = drive_file_id(url)
                if not file_id:
                    errors.append("unsupported Google Drive file URL")
                    continue

                old_cwd = Path.cwd()
                try:
                    os.chdir(destination)
                    result = gdown.download(
                        id=file_id,
                        output=None,
                        quiet=True,
                    )
                finally:
                    os.chdir(old_cwd)
                if not result:
                    errors.append("file download returned no file")
        except Exception as exc:
            errors.append(clean_error(exc))
    return errors


def wait_for_direct_link(
    api: EarnVidsApi,
    code: str,
    timeout_seconds: int = 1800,
) -> str:
    deadline = time.monotonic() + timeout_seconds
    last_error = ""
    while time.monotonic() < deadline:
        try:
            return api.direct_link(code)
        except Exception as exc:
            last_error = clean_error(exc)
            time.sleep(15)
    raise RuntimeError(
        last_error or "EarnVids direct link did not become available"
    )


def append_error(result: dict[str, str], message: object) -> None:
    cleaned = clean_error(message)
    if not cleaned:
        return
    if result.get("error"):
        result["error"] = f"{result['error']} | {cleaned}"[:800]
    else:
        result["error"] = cleaned[:800]


def fresh_result(source: dict[str, str]) -> dict[str, str]:
    return {
        "post_id": source.get("post_id", ""),
        "title": source.get("title", ""),
        "download_status": "PENDING",
        "watermark_status": "PENDING",
        "source_filename": "",
        "sha256": "",
        "earnvids_status": "PENDING",
        "earnvids_file_code": "",
        "dood_status": "PENDING",
        "dood_file_code": "",
        "voe_status": "PENDING",
        "voe_file_code": "",
        "overall_status": "PENDING",
        "error": "",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "run_id": os.environ.get("GITHUB_RUN_ID", ""),
        "seed_direct_url": "",
    }


def main() -> None:
    args = parse_args()
    force = is_truthy(args.force)
    skip_watermark = is_truthy(args.skip_watermark)
    upload_strategy = args.upload_strategy
    csv_path = Path(args.csv)
    log_path = Path(args.log)
    logo_path = Path(args.logo)
    work_root = Path(args.work_root)
    output_path = Path(args.output)
    work_root.mkdir(parents=True, exist_ok=True)

    existing = load_existing(log_path)
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        all_rows = list(csv.DictReader(handle))
    rows = all_rows[args.start : args.start + args.count]

    earnvids = EarnVidsApi(getenv_required("HOST_EARNVIDS_API_KEY"))
    dood = (
        DoodApi(getenv_required("HOST_DOOD_API_KEY"))
        if upload_strategy == "local_all_hosts"
        else None
    )
    voe = (
        VoeApi(getenv_required("HOST_VOE_API_KEY"))
        if upload_strategy == "local_all_hosts"
        else None
    )
    output_rows: list[dict[str, str]] = []

    for source in rows:
        post_id = source.get("post_id", "").strip()
        previous = existing.get(post_id)
        if (
            previous
            and previous.get("overall_status") in TERMINAL_STATUSES
            and not force
        ):
            continue

        result = fresh_result(source)
        item_root = work_root / (post_id or "unknown")
        shutil.rmtree(item_root, ignore_errors=True)
        item_root.mkdir(parents=True, exist_ok=True)

        try:
            urls = extract_drive_urls(source.get("drive_links"))
            if not urls:
                result["download_status"] = "NO_SOURCE"
                result["watermark_status"] = "SKIPPED"
                result["earnvids_status"] = "SKIPPED"
                result["dood_status"] = "SKIPPED"
                result["voe_status"] = "SKIPPED"
                result["overall_status"] = "NO_SOURCE"
                continue

            download_errors = download_sources(
                urls,
                item_root / "download",
            )
            candidates = video_candidates(item_root / "download")

            if not candidates:
                result["download_status"] = (
                    "FAILED" if download_errors else "NO_VIDEO"
                )
                result["watermark_status"] = "SKIPPED"
                result["earnvids_status"] = "SKIPPED"
                result["dood_status"] = "SKIPPED"
                result["voe_status"] = "SKIPPED"
                result["overall_status"] = (
                    "DOWNLOAD_FAILED"
                    if download_errors
                    else "NO_VIDEO"
                )
                result["error"] = " | ".join(download_errors)[:800]
                continue

            if len(candidates) > 1:
                result["download_status"] = "OK"
                result["watermark_status"] = "SKIPPED"
                result["earnvids_status"] = "SKIPPED"
                result["dood_status"] = "SKIPPED"
                result["voe_status"] = "SKIPPED"
                result["overall_status"] = "NEEDS_REVIEW"
                names = ", ".join(
                    path.name for path in candidates[:8]
                )
                result["error"] = (
                    f"multiple video candidates ({len(candidates)}): "
                    f"{names}"
                )[:800]
                continue

            source_video = candidates[0]
            result["download_status"] = "OK"
            result["source_filename"] = source_video.name

            if skip_watermark:
                upload_file = source_video
                result["watermark_status"] = "SKIPPED"
            else:
                upload_file = item_root / (
                    f"{post_id or 'video'}-watermarked.mp4"
                )
                watermark_video(
                    source_video,
                    logo_path,
                    upload_file,
                )
                result["watermark_status"] = "OK"

            result["sha256"] = sha256_file(upload_file)
            title = source.get("title", "") or upload_file.stem
            tags = source.get("tags", "")

            code = earnvids.local_upload(upload_file, title, tags)
            result["earnvids_file_code"] = code
            result["earnvids_status"] = "OK"

            if upload_strategy == "local_all_hosts":
                if dood is None or voe is None:
                    raise RuntimeError("local_all_hosts requires Dood and VOE clients")
                try:
                    result["dood_file_code"] = dood.local_upload(upload_file, title)
                    result["dood_status"] = "QUEUED"
                except Exception as exc:
                    result["dood_status"] = "FAILED"
                    append_error(result, exc)
                try:
                    result["voe_file_code"] = voe.local_upload(upload_file, title)
                    result["voe_status"] = "QUEUED"
                except Exception as exc:
                    result["voe_status"] = "FAILED"
                    append_error(result, exc)

                result["overall_status"] = "SEED_OK"
                continue

            try:
                result["seed_direct_url"] = wait_for_direct_link(
                    earnvids,
                    code,
                )
                result["overall_status"] = "SEED_OK"
            except Exception as exc:
                result["overall_status"] = "SEED_OK_NO_DIRECT"
                result["error"] = clean_error(exc)

        except Exception as exc:
            if result["download_status"] == "PENDING":
                result["download_status"] = "FAILED"
            if result["watermark_status"] == "PENDING":
                result["watermark_status"] = "FAILED"
            if result["earnvids_status"] == "PENDING":
                result["earnvids_status"] = "FAILED"
            result["overall_status"] = "FAILED"
            result["error"] = clean_error(exc)
        finally:
            result["updated_at"] = datetime.now(
                timezone.utc
            ).isoformat()
            output_rows.append(result)
            shutil.rmtree(item_root, ignore_errors=True)

    with output_path.open(
        "w",
        encoding="utf-8-sig",
        newline="",
    ) as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=SHARD_FIELDS,
        )
        writer.writeheader()
        writer.writerows(output_rows)


if __name__ == "__main__":
    main()
