from __future__ import annotations

import hashlib
import json
import os
import random
import re
import subprocess
import time
from pathlib import Path
from typing import Any

import requests


VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mov", ".m4v", ".webm", ".avi", ".ts", ".mpeg", ".mpg"}
DRIVE_URL_RE = re.compile(r"https://drive\.google\.com/[^\s;,\"']+")
TERMINAL_STATUSES = {"OK", "NO_SOURCE", "NO_VIDEO", "NEEDS_REVIEW"}

LOG_FIELDS = [
    "post_id",
    "title",
    "download_status",
    "watermark_status",
    "source_filename",
    "sha256",
    "earnvids_status",
    "earnvids_file_code",
    "dood_status",
    "dood_file_code",
    "voe_status",
    "voe_file_code",
    "overall_status",
    "error",
    "updated_at",
    "run_id",
]

SHARD_FIELDS = LOG_FIELDS + ["seed_direct_url"]


def clean_error(value: object, limit: int = 800) -> str:
    text = str(value).replace("\r", " ").replace("\n", " ").strip()
    return text[:limit]


def extract_drive_urls(value: str | None) -> list[str]:
    if not value:
        return []
    seen: set[str] = set()
    urls: list[str] = []
    for match in DRIVE_URL_RE.findall(value):
        url = match.rstrip(").]")
        if url not in seen:
            seen.add(url)
            urls.append(url)
    return urls


def video_candidates(root: Path) -> list[Path]:
    return sorted(
        p
        for p in root.rglob("*")
        if p.is_file()
        and p.suffix.lower() in VIDEO_EXTENSIONS
        and p.stat().st_size > 1_000_000
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run_checked(command: list[str], timeout: int | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
    )


def probe_video(path: Path) -> tuple[int, int]:
    result = run_checked(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "json",
            str(path),
        ],
        timeout=120,
    )
    payload = json.loads(result.stdout)
    streams = payload.get("streams") or []
    if not streams:
        raise RuntimeError("ffprobe found no video stream")
    return int(streams[0]["width"]), int(streams[0]["height"])


def build_watermark(logo_svg: Path, output: Path, video_width: int) -> tuple[Path, int]:
    logo_size = max(48, min(150, round(video_width * 0.07)))
    font_size = max(12, min(28, round(video_width * 0.014)))
    margin = max(12, round(video_width * 0.0125))
    text_width = round(font_size * 7.4)
    canvas_width = max(logo_size, text_width)
    canvas_height = logo_size + round(font_size * 1.65) + 4
    logo_png = output.with_name("logo-mark.png")

    run_checked(
        [
            "magick",
            "-background",
            "none",
            str(logo_svg),
            "-resize",
            f"{logo_size}x{logo_size}",
            str(logo_png),
        ],
        timeout=120,
    )
    run_checked(
        [
            "magick",
            "-size",
            f"{canvas_width}x{canvas_height}",
            "xc:none",
            str(logo_png),
            "-gravity",
            "north",
            "-geometry",
            "+0+0",
            "-composite",
            "-gravity",
            "south",
            "-font",
            "Arial",
            "-pointsize",
            str(font_size),
            "-fill",
            "white",
            "-stroke",
            "#00000099",
            "-strokewidth",
            "1",
            "-annotate",
            "+0+2",
            "GayVideo.fun",
            "-channel",
            "A",
            "-evaluate",
            "multiply",
            "0.82",
            str(output),
        ],
        timeout=120,
    )
    return output, margin


def watermark_video(source: Path, logo_svg: Path, output: Path) -> None:
    width, _ = probe_video(source)
    watermark_png, margin = build_watermark(
        logo_svg,
        output.with_name("watermark.png"),
        width,
    )
    filter_graph = f"[1:v]format=rgba[wm];[0:v][wm]overlay=W-w-{margin}:{margin}[v]"
    run_checked(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "warning",
            "-i",
            str(source),
            "-i",
            str(watermark_png),
            "-filter_complex",
            filter_graph,
            "-map",
            "[v]",
            "-map",
            "0:a?",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "21",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-movflags",
            "+faststart",
            str(output),
        ],
        timeout=5 * 60 * 60,
    )


def recursive_value(value: Any, keys: set[str]) -> Any | None:
    if isinstance(value, dict):
        for key, item in value.items():
            if key.lower() in keys and item not in (None, "", []):
                return item
        for item in value.values():
            found = recursive_value(item, keys)
            if found not in (None, "", []):
                return found
    elif isinstance(value, list):
        for item in value:
            found = recursive_value(item, keys)
            if found not in (None, "", []):
                return found
    return None


def recursive_http_url(value: Any) -> str | None:
    if isinstance(value, str) and value.startswith(("http://", "https://")):
        return value
    if isinstance(value, dict):
        preferred = recursive_value(value, {"url", "link", "direct_link", "download_url"})
        if isinstance(preferred, str) and preferred.startswith(("http://", "https://")):
            return preferred
        for item in value.values():
            found = recursive_http_url(item)
            if found:
                return found
    elif isinstance(value, list):
        for item in value:
            found = recursive_http_url(item)
            if found:
                return found
    return None


def require_file_code(payload: Any, label: str) -> str:
    code = recursive_value(payload, {"filecode", "file_code", "file_code", "code", "fileCode"})
    if not isinstance(code, str) or not code:
        raise RuntimeError(
            f"{label} upload returned no file code: {clean_error(payload, 300)}"
        )
    return code


class HostApi:
    def __init__(self, base: str, key: str, min_interval: float, label: str) -> None:
        if not key:
            raise RuntimeError(f"{label} API key is missing")
        self.base = base.rstrip("/")
        self.key = key
        self.min_interval = min_interval
        self.label = label
        self.session = requests.Session()
        self.last_started = 0.0

    def _pace(self) -> None:
        wait = self.last_started + self.min_interval - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self.last_started = time.monotonic()

    def get(self, path: str, **params: object) -> dict[str, Any]:
        params = {
            "key": self.key,
            **{key: value for key, value in params.items() if value is not None},
        }
        for attempt in range(7):
            self._pace()
            try:
                response = self.session.get(
                    f"{self.base}{path}",
                    params=params,
                    timeout=(20, 90),
                )
            except requests.RequestException as exc:
                if attempt == 6:
                    raise RuntimeError(
                        f"{self.label} request failed: {clean_error(exc)}"
                    ) from exc
                time.sleep(min(30, 2**attempt + random.random()))
                continue

            if response.status_code == 429 or response.status_code >= 500:
                if attempt == 6:
                    raise RuntimeError(f"{self.label} HTTP {response.status_code}")
                retry_after = response.headers.get("Retry-After")
                try:
                    delay = (
                        float(retry_after)
                        if retry_after
                        else min(45, 2**attempt)
                    )
                except ValueError:
                    delay = min(45, 2**attempt)
                time.sleep(delay + random.random())
                continue

            if not response.ok:
                raise RuntimeError(
                    f"{self.label} HTTP {response.status_code}: "
                    f"{clean_error(response.text, 300)}"
                )
            try:
                return response.json()
            except ValueError as exc:
                raise RuntimeError(
                    f"{self.label} returned non-JSON response"
                ) from exc
        raise RuntimeError(f"{self.label} request failed")

    def upload_server(self) -> str:
        payload = self.get("/upload/server")
        url = recursive_http_url(payload)
        if not url:
            raise RuntimeError(
                f"{self.label} upload/server returned no upload URL"
            )
        return url


class EarnVidsApi(HostApi):
    def __init__(self, key: str) -> None:
        super().__init__(
            "https://earnvidsapi.com/api",
            key,
            0.5,
            "EarnVids",
        )

    def local_upload(self, path: Path, title: str, tags: str) -> str:
        data = {
            "key": self.key,
            "file_title": title,
            "tags": tags,
            "file_public": "1",
            "file_adult": "1",
        }
        last_error = ""
        for attempt in range(1, 4):
            upload_url = self.upload_server()
            try:
                with path.open("rb") as handle:
                    response = self.session.post(
                        upload_url,
                        data=data,
                        files={"file": (path.name, handle, "video/mp4")},
                        timeout=(30, 5 * 60 * 60),
                    )
                if not response.ok:
                    raise RuntimeError(
                        f"EarnVids upload HTTP {response.status_code}: "
                        f"{clean_error(response.text, 300)}"
                    )
                try:
                    payload = response.json()
                except ValueError as exc:
                    raise RuntimeError(
                        "EarnVids upload returned non-JSON response"
                    ) from exc
                return require_file_code(payload, "EarnVids")
            except (
                TimeoutError,
                requests.RequestException,
                OSError,
            ) as exc:
                last_error = clean_error(exc)
                if attempt == 3:
                    break
                time.sleep((attempt * 10) + random.random())
        raise RuntimeError(f"EarnVids upload failed after retries: {last_error}")

    def direct_link(self, code: str) -> str:
        payload = self.get(
            "/file/direct_link",
            file_code=code,
            q="o",
            hls="0",
        )
        url = recursive_http_url(payload)
        if not url:
            raise RuntimeError("EarnVids direct_link returned no URL")
        return url


class DoodApi(HostApi):
    def __init__(self, key: str) -> None:
        super().__init__(
            "https://doodapi.co/api",
            key,
            0.12,
            "DoodStream",
        )

    def local_upload(self, path: Path, title: str) -> str:
        upload_url = self.upload_server()
        if "?" not in upload_url:
            upload_url = f"{upload_url}?{self.key}"
        with path.open("rb") as handle:
            response = self.session.post(
                upload_url,
                data={"api_key": self.key},
                files={"file": (path.name, handle, "video/mp4")},
                timeout=(30, 5 * 60 * 60),
            )
        if not response.ok:
            raise RuntimeError(
                f"DoodStream upload HTTP {response.status_code}: "
                f"{clean_error(response.text, 300)}"
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise RuntimeError(
                "DoodStream upload returned non-JSON response"
            ) from exc
        code = require_file_code(payload, "DoodStream")
        if title:
            try:
                self.rename(code, title)
            except Exception:
                pass
        return code

    def remote_upload(self, url: str, title: str) -> str:
        payload = self.get(
            "/upload/url",
            url=url,
            new_title=title,
        )
        return require_file_code(payload, "DoodStream remote")

    def ready(self, code: str) -> bool:
        payload = self.get("/file/info", file_code=code)
        item = recursive_value(payload, {"filecode", "file_code"})
        status = recursive_value(payload, {"status"})
        if status in (404, "404"):
            return False
        if isinstance(status, str) and "not found" in status.lower():
            return False
        return item is not None

    def rename(self, code: str, title: str) -> None:
        self.get("/file/rename", file_code=code, title=title)


class VoeApi(HostApi):
    def __init__(self, key: str) -> None:
        super().__init__(
            "https://voe.sx/api",
            key,
            0.35,
            "VOE",
        )

    def local_upload(self, path: Path, title: str) -> str:
        upload_url = self.upload_server()
        with path.open("rb") as handle:
            response = self.session.post(
                upload_url,
                params={"key": self.key},
                files={"file": (path.name, handle, "video/mp4")},
                timeout=(30, 5 * 60 * 60),
            )
        if not response.ok:
            raise RuntimeError(
                f"VOE upload HTTP {response.status_code}: "
                f"{clean_error(response.text, 300)}"
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise RuntimeError("VOE upload returned non-JSON response") from exc
        code = require_file_code(payload, "VOE")
        if title:
            try:
                self.rename(code, title)
            except Exception:
                pass
        return code

    def remote_upload(self, url: str) -> str:
        payload = self.get("/upload/url", url=url)
        return require_file_code(payload, "VOE remote")

    def rename(self, code: str, title: str) -> None:
        payload = self.get(
            "/file/rename",
            file_code=code,
            title=title,
        )
        success = recursive_value(payload, {"success"})
        status = recursive_value(payload, {"status"})
        if success is False or status in (400, 404, 500, "400", "404", "500"):
            message = recursive_value(payload, {"message", "msg"})
            raise RuntimeError(
                f"VOE rename failed: {clean_error(message or payload, 300)}"
            )

    def ready(self, code: str) -> bool:
        payload = self.get("/file/info", file_code=code)
        found = recursive_value(payload, {"filecode", "file_code", "fileCode"})
        if found is None:
            return False
        status = recursive_value(payload, {"status"})
        if status in (404, "404"):
            return False
        return True


def getenv_required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value
