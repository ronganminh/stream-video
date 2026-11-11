"""Helpers for colab_publish.ipynb: get a source video, upload it to the
hosts, and keep a ledger so nothing is posted twice.

Kept separate from the notebook so it can be tested (test_colab_helpers.py);
build_notebook.py embeds this file into the notebook. Needs requests (on
Colab by default), curl, ffmpeg/ffprobe, and for watermarks rsvg-convert
(apt librsvg2-bin) and Pillow.

Secrets (host API keys) are never printed: they are passed to curl in a
config file readable only by this user, and redact() strips them from every
error message.
"""

from __future__ import annotations

import csv
import datetime as dt
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple
from urllib.parse import urlparse

import requests

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
_SECRETS: List[str] = []


# --- secrets -----------------------------------------------------------------

def register_secret(value: Optional[str]) -> Optional[str]:
    """Remember a secret so redact() hides it; returns it unchanged."""
    if value and len(value) >= 4 and value not in _SECRETS:
        _SECRETS.append(value)
    return value


def redact(text: object, limit: int = 600) -> str:
    out = str(text)
    for secret in _SECRETS:
        out = out.replace(secret, "***")
    out = re.sub(r"(?i)(key|api_key|token)=([^&\s\"']+)", r"\1=***", out)
    return out.replace("\r", " ").replace("\n", " ").strip()[:limit]


# --- input --------------------------------------------------------------------

@dataclass
class Job:
    """One line of input: a share link plus optional metadata."""

    link: str
    title: str = ""
    tags: List[str] = field(default_factory=list)
    category: str = ""
    x_caption: str = ""
    clip_start: Optional[float] = None


def _split_tags(value: str) -> List[str]:
    return [tag.strip() for tag in re.split(r"[;,]", value or "") if tag.strip()]


def parse_lines(text: str) -> List[Job]:
    """`link | title | tags | category | x caption | clip start`, all but the
    link optional; blank lines and lines starting with # are ignored."""
    jobs = []
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = [part.strip() for part in line.split("|")]
        parts += [""] * (6 - len(parts))
        start = parts[5]
        jobs.append(
            Job(
                link=parts[0],
                title=parts[1],
                tags=_split_tags(parts[2]),
                category=parts[3],
                x_caption=parts[4],
                clip_start=float(start) if start else None,
            )
        )
    return jobs


def parse_csv(path: str) -> List[Job]:
    """CSV with a header: link (required), title, tags, category, x_caption, clip_start."""
    jobs = []
    with open(path, newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            link = (row.get("link") or "").strip()
            if not link:
                continue
            start = (row.get("clip_start") or "").strip()
            jobs.append(
                Job(
                    link=link,
                    title=(row.get("title") or "").strip(),
                    tags=_split_tags(row.get("tags") or ""),
                    category=(row.get("category") or "").strip(),
                    x_caption=(row.get("x_caption") or "").strip(),
                    clip_start=float(start) if start else None,
                )
            )
    return jobs


def ascii_text(value: str) -> str:
    """Accents stripped, đ -> d: for English captions built from Vietnamese titles."""
    folded = unicodedata.normalize("NFD", value)
    folded = "".join(ch for ch in folded if unicodedata.category(ch) != "Mn")
    return folded.replace("đ", "d").replace("Đ", "D")


# --- sources: Google Photos and Google Drive -------------------------------------

# --- progress -----------------------------------------------------------------------

def _clock(seconds: float) -> str:
    seconds = max(0, int(round(seconds)))
    return f"{seconds // 3600}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}" if seconds >= 3600 \
        else f"{seconds // 60}:{seconds % 60:02d}"


def _mb(value: float) -> str:
    return f"{value / 1_048_576:.1f}"


class Step:
    """One step of one video, shown on a single line that is rewritten in
    place (carriage return), then replaced by "✓ name · 12.3 s" when done
    (or "✗ name · …" if it raised). unit "B" shows %, MB, MB/s and time
    left; unit "s" (ffmpeg) shows %, media time, speed (x real time) and
    time left. total may be set later (e.g. from Content-Length).

        with Step("Tải Google Photos") as step:
            step.total = 1_000_000
            step.update(65_536)       # or step.set(absolute)
    """

    def __init__(self, name: str, total: Optional[float] = None, unit: str = "B", out: Any = None,
                 clock: Callable[[], float] = time.monotonic, interval: float = 0.5, indent: str = "  "):
        import sys

        self.name, self.total, self.unit, self.indent = name, total, unit, indent
        self.out = out or sys.stdout
        self.clock, self.interval = clock, interval
        self.done = 0.0
        self.started = self.last_draw = 0.0
        self.width = 0
        self.extra = ""

    def __enter__(self) -> "Step":
        self.started = self.clock()
        self.last_draw = self.started - self.interval
        self._draw(f"{self.name}…")
        return self

    def __exit__(self, kind: Any, error: Any, trace: Any) -> bool:
        elapsed = self.clock() - self.started
        summary = f"{'✗' if kind else '✓'} {self.name} · {elapsed:.1f} s"
        if not kind and self.unit == "B" and self.done:
            summary += f" · {_mb(self.done)} MB"
            if elapsed > 0:
                summary += f" · {_mb(self.done / elapsed)} MB/s"
        if self.extra:
            summary += f" · {self.extra}"
        self._draw(summary, final=True)
        return False

    def update(self, amount: float) -> None:
        self.set(self.done + amount)

    def set(self, value: float) -> None:
        self.done = max(0.0, float(value))
        now = self.clock()
        if now - self.last_draw >= self.interval:
            self.last_draw = now
            self._draw(self.line(now))

    def line(self, now: Optional[float] = None) -> str:
        elapsed = max(1e-6, (self.clock() if now is None else now) - self.started)
        rate = self.done / elapsed
        parts = [self.name]
        total = self.total if self.total and self.total > 0 else None
        if total:
            parts.append(f"{min(100.0, 100 * self.done / total):3.0f}%")
        if self.unit == "B":
            parts.append(f"{_mb(self.done)}/{_mb(total)} MB" if total else f"{_mb(self.done)} MB")
            parts.append(f"{_mb(rate)} MB/s")
        else:
            parts.append(f"{_clock(self.done)}/{_clock(total)}" if total else _clock(self.done))
            parts.append(f"{rate:.1f}x")
        if total and rate > 0 and self.done < total:
            parts.append(f"còn {_clock((total - self.done) / rate)}")
        return " · ".join(parts)

    def _draw(self, text: str, final: bool = False) -> None:
        text = self.indent + text
        pad = max(0, self.width - len(text))
        self.width = 0 if final else len(text)
        self.out.write("\r" + text + " " * pad + ("\n" if final else ""))
        self.out.flush()


def batch_line(index: int, count: int, title: str, out: Any = None) -> None:
    """The batch header, e.g. "▶ video 2/5 · My title"."""
    import sys

    (out or sys.stdout).write(f"▶ video {index}/{count} · {title}\n")
    (out or sys.stdout).flush()


class SourceError(RuntimeError):
    """The link could not be read; the message says what to do instead."""


@dataclass
class SourceItem:
    """One video found behind a link. `key` identifies it for the ledger."""

    key: str
    download: Callable[..., Path]  # download(target, step=None) -> target
    label: str = ""
    source: str = "Google Photos"


_PHOTOS_MEDIA = re.compile(r"https://lh3\.googleusercontent\.com/pw/[A-Za-z0-9_-]{20,}")
_DRIVE_FILE = re.compile(r"/file/d/([A-Za-z0-9_-]{10,})|[?&]id=([A-Za-z0-9_-]{10,})")
_DRIVE_FOLDER = re.compile(r"/folders/([A-Za-z0-9_-]{10,})")

PHOTOS_HELP = (
    "Hãy kiểm tra link Google Photos đã bật chia sẻ công khai (ai có link đều xem được). "
    "Nếu vẫn lỗi, Google Photos có thể đang chặn tải tự động: hãy tải video lên Google Drive, "
    "chia sẻ 'Bất kỳ ai có đường liên kết', rồi dùng link Drive thay thế."
)


def link_kind(link: str) -> str:
    host = urlparse(link).netloc.lower()
    if host in ("photos.app.goo.gl", "photos.google.com", "goo.gl"):
        return "photos"
    if host in ("drive.google.com", "docs.google.com"):
        return "drive"
    return "unknown"


def photos_media_urls(page: str) -> List[str]:
    """Distinct lh3 media base URLs on a shared Google Photos page (video,
    photo or album), in page order, without size suffixes."""
    seen, out = set(), []
    for url in _PHOTOS_MEDIA.findall(html.unescape(page).replace("\\u003d", "=").replace("\\/", "/")):
        if url not in seen:
            seen.add(url)
            out.append(url)
    return out


def photos_album_title(page: str) -> str:
    match = re.search(r'<meta property="og:title" content="([^"]*)"', page)
    title = html.unescape(match.group(1)).strip() if match else ""
    return "" if title.lower() in ("", "google photos", "photo", "video") else title


def _retry(action: Callable[[], Any], what: str, attempts: int = 3, base_delay: float = 3.0) -> Any:
    """Runs `action`, retrying network errors and _Retryable (429/5xx) with backoff."""
    last: Optional[BaseException] = None
    for attempt in range(attempts):
        try:
            return action()
        except (requests.RequestException, _Retryable) as error:
            last = error
            if attempt < attempts - 1:
                time.sleep(base_delay * (2 ** attempt))
    raise SourceError(f"{what} thất bại sau {attempts} lần thử ({redact(last)}). {PHOTOS_HELP}")


class _Retryable(Exception):
    pass


def _photos_page(link: str, session: requests.Session) -> str:
    """Follows the short link (photos.app.goo.gl -> photos.google.com/share/…)
    and returns the share page, or explains why it can't."""

    def fetch() -> requests.Response:
        response = session.get(link, headers={"User-Agent": BROWSER_UA}, timeout=60, allow_redirects=True)
        if response.status_code == 429 or response.status_code >= 500:
            raise _Retryable(f"HTTP {response.status_code}")
        return response

    response = _retry(fetch, "Mở link Google Photos")
    final = urlparse(response.url)
    if final.netloc.startswith(("accounts.google.com", "consent.google.com")) or response.status_code in (401, 403):
        raise SourceError(f"Google Photos yêu cầu đăng nhập/đồng ý cookie (link chưa chia sẻ công khai hoặc bị chặn). {PHOTOS_HELP}")
    if response.status_code == 404:
        raise SourceError(f"Link Google Photos không tồn tại hoặc đã bị xoá (HTTP 404). {PHOTOS_HELP}")
    if response.status_code >= 400:
        raise SourceError(f"Google Photos trả HTTP {response.status_code}. {PHOTOS_HELP}")
    if final.netloc != "photos.google.com" or not final.path.startswith("/share/"):
        raise SourceError(f"Link không dẫn tới trang chia sẻ Google Photos (tới {final.netloc}{final.path[:40]}). {PHOTOS_HELP}")
    return response.text


IMAGE_CODECS = {"mjpeg", "png", "webp", "gif", "bmp", "tiff", "heif", "hevc_image", "av1_image"}


def verify_video(path: Path, min_seconds: float = 1.0) -> Dict[str, Any]:
    """ffprobe the download: it must hold a real video stream (not a still
    preview image) at least `min_seconds` long."""
    try:
        out = run(["ffprobe", "-v", "error", "-show_entries",
                   "stream=codec_type,codec_name,width,height:format=duration,format_name",
                   "-of", "json", str(path)], timeout=300)
        payload = json.loads(out)
    except Exception as error:
        raise SourceError(f"File tải về không đọc được bằng ffprobe ({redact(error, 200)}). {PHOTOS_HELP}") from None
    videos = [s for s in payload.get("streams", []) if s.get("codec_type") == "video"]
    duration = float(payload.get("format", {}).get("duration") or 0)
    if not videos or videos[0].get("codec_name") in IMAGE_CODECS or duration < min_seconds:
        kind = videos[0].get("codec_name") if videos else "không có luồng video"
        raise SourceError(f"File tải về là ảnh xem trước chứ không phải video ({kind}, {duration:.1f}s). {PHOTOS_HELP}")
    return {"duration": duration, "codec": videos[0].get("codec_name"),
            "width": videos[0].get("width"), "height": videos[0].get("height")}


def _download_photos_video(base: str, session: requests.Session) -> Callable[..., Path]:
    def download(target: Path, step: Optional[Step] = None) -> Path:
        # "=dv" asks Google for the original video file (undocumented, stable for years).
        def fetch() -> Path:
            if step:
                step.set(0)
            with session.get(base + "=dv", headers={"User-Agent": BROWSER_UA}, stream=True, timeout=(30, 600)) as response:
                if response.status_code == 429 or response.status_code >= 500:
                    raise _Retryable(f"HTTP {response.status_code}")
                kind = response.headers.get("content-type", "")
                if response.status_code >= 400 or not kind.startswith("video/"):
                    raise SourceError(
                        f"Google Photos không trả video gốc (HTTP {response.status_code}, {kind or 'không rõ loại'}). {PHOTOS_HELP}"
                    )
                length = response.headers.get("content-length", "")
                if response.headers.get("content-encoding", "identity") != "identity":
                    length = ""  # compressed: the length is not the file size
                if step and length.isdigit():
                    step.total = int(length)
                with open(target, "wb") as handle:
                    for chunk in response.iter_content(chunk_size=1024 * 1024):
                        handle.write(chunk)
                        if step:
                            step.update(len(chunk))
            if length.isdigit() and target.stat().st_size != int(length):
                raise _Retryable(f"tải thiếu ({target.stat().st_size}/{length} byte)")
            return target

        _retry(fetch, "Tải video gốc từ Google Photos")
        verify_video(target)
        return target

    return download


def _is_photos_video(base: str, session: requests.Session) -> bool:
    """Asks for one byte of "=dv": videos answer video/*, photos do not."""

    def fetch() -> bool:
        with session.get(base + "=dv", headers={"User-Agent": BROWSER_UA, "Range": "bytes=0-0"},
                         stream=True, timeout=60) as response:
            if response.status_code == 429 or response.status_code >= 500:
                raise _Retryable(f"HTTP {response.status_code}")
            return response.status_code < 400 and response.headers.get("content-type", "").startswith("video/")

    return bool(_retry(fetch, "Kiểm tra loại mục Google Photos"))


def photos_items(link: str, session: Optional[requests.Session] = None) -> tuple:
    """(album or item title, [SourceItem]) for every video behind a Photos link."""
    session = session or requests.Session()
    page = _photos_page(link, session)
    urls = photos_media_urls(page)
    if not urls:
        raise SourceError(
            "Không tìm thấy URL ảnh/video (lh3.googleusercontent.com/pw/…) trong trang chia sẻ: "
            "có thể Google đã đổi giao diện; cập nhật photos_media_urls() và HTML mẫu trong test. " + PHOTOS_HELP
        )
    videos = [url for url in urls if _is_photos_video(url, session)]
    if not videos:
        raise SourceError(f"Link Google Photos không có video nào tải được ({len(urls)} mục, đều là ảnh hoặc bị chặn). {PHOTOS_HELP}")
    items = [
        SourceItem(
            key="photos:" + hashlib.sha256(url.split("/pw/", 1)[1].encode()).hexdigest()[:24],
            download=_download_photos_video(url, session),
            label=f"{index + 1}/{len(videos)}",
        )
        for index, url in enumerate(videos)
    ]
    return photos_album_title(page), items


def drive_items(link: str) -> tuple:
    """A Drive file or folder shared as "anyone with the link" (uses gdown)."""
    try:
        import gdown  # noqa: F401  (pip install gdown; preinstalled on Colab)
    except ImportError:
        raise SourceError("Thiếu thư viện gdown: chạy `pip install gdown`.") from None
    import gdown

    folder = _DRIVE_FOLDER.search(link)
    if folder:
        workdir = Path(tempfile.mkdtemp(prefix="gv-drive-list-"))
        try:
            files = gdown.download_folder(url=link, output=str(workdir), quiet=True, skip_download=True)
        except Exception as error:  # gdown raises many types
            shutil.rmtree(workdir, ignore_errors=True)
            raise SourceError(f"Không đọc được thư mục Drive ({redact(error)}). Kiểm tra quyền 'Bất kỳ ai có đường liên kết'.") from None
        shutil.rmtree(workdir, ignore_errors=True)
        videos = [item for item in files or [] if re.search(r"\.(mp4|mov|m4v|mkv|webm|avi)$", item.path, re.I)]
        return "", [
            SourceItem(key=f"drive:{item.id}", download=_drive_download(item.id), label=Path(item.path).name,
                       source="Google Drive")
            for item in videos
        ]
    match = _DRIVE_FILE.search(link)
    if not match:
        raise SourceError("Link Google Drive không có mã file/thư mục.")
    file_id = match.group(1) or match.group(2)
    return "", [SourceItem(key=f"drive:{file_id}", download=_drive_download(file_id), source="Google Drive")]


def _drive_download(file_id: str) -> Callable[..., Path]:
    def download(target: Path, step: Optional[Step] = None) -> Path:
        import gdown

        if step:  # gdown draws its own one-line bar (%, MB, MB/s, time left)
            step.out.write("\n")
        result = gdown.download(id=file_id, output=str(target), quiet=step is None)
        if step and target.exists():
            step.set(target.stat().st_size)
        if not result or not target.exists() or target.stat().st_size < 10_000:
            raise SourceError("Tải file từ Google Drive thất bại (link chưa chia sẻ công khai, hoặc vượt hạn mức tải của Drive).")
        verify_video(target)
        return target

    return download


def source_items(link: str) -> tuple:
    kind = link_kind(link)
    if kind == "photos":
        return photos_items(link)
    if kind == "drive":
        return drive_items(link)
    raise SourceError("Chỉ hỗ trợ link Google Photos (photos.app.goo.gl/…) hoặc Google Drive.")


# --- video tools ------------------------------------------------------------------

def run(command: Sequence[str], timeout: int = 6 * 60 * 60) -> str:
    result = subprocess.run(list(command), capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(f"{Path(command[0]).name} failed: {redact(result.stderr[-800:])}")
    return result.stdout


def run_ffmpeg(command: Sequence[str], duration: float, step: Optional[Step] = None,
               timeout: int = 6 * 60 * 60) -> None:
    """Runs an ffmpeg command with -progress pipe:1 and moves step to
    out_time / duration as it encodes. Raises RuntimeError on failure."""
    import threading

    args = [command[0], "-nostats", "-progress", "pipe:1", *command[1:]]
    if step:
        step.unit, step.total = "s", duration
    with tempfile.TemporaryFile("w+", encoding="utf-8", errors="replace") as errors:
        process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=errors, text=True)
        timer = threading.Timer(timeout, process.kill)
        timer.start()
        try:
            for line in process.stdout:  # key=value lines, a block every ~0.5 s
                key, _, value = line.strip().partition("=")
                if step and key in ("out_time_us", "out_time_ms") and value.lstrip("-").isdigit():
                    step.set(min(duration, max(0, int(value)) / 1_000_000))
                elif step and key == "progress" and value == "end":
                    step.set(duration)
            code = process.wait()
        finally:
            timer.cancel()
        if code != 0:
            errors.seek(0)
            raise RuntimeError(f"ffmpeg failed: {redact(errors.read()[-800:])}")


def sha256_file(path: Path, step: Optional[Step] = None) -> str:
    digest = hashlib.sha256()
    if step:
        step.total = path.stat().st_size
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
            if step:
                step.update(len(chunk))
    return digest.hexdigest()


def probe(path: Path) -> Dict[str, Any]:
    """{"duration": seconds, "width", "height"}; raises if there is no video stream."""
    out = run(["ffprobe", "-v", "error", "-select_streams", "v:0",
               "-show_entries", "stream=width,height:format=duration", "-of", "json", str(path)], timeout=300)
    payload = json.loads(out)
    streams = payload.get("streams") or []
    if not streams:
        raise RuntimeError("Không có luồng video trong file tải về.")
    return {
        "duration": float(payload.get("format", {}).get("duration") or 0),
        "width": int(streams[0]["width"]),
        "height": int(streams[0]["height"]),
    }


def make_thumbnail(source: Path, target: Path, duration: float, at: Optional[float] = None) -> Path:
    """A JPEG frame (default: 20% into the video, at least 1 s in)."""
    second = at if at is not None else max(1.0, duration * 0.2)
    second = min(second, max(0.0, duration - 0.5))
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{second:.2f}", "-i", str(source),
         "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "2", str(target)], timeout=300)
    return target


LOGO_URL = ("https://raw.githubusercontent.com/ronganminh/stream-video/main/"
            "scripts/publish-client/assets/logo-mark.svg")
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


class LogoError(RuntimeError):
    pass


def render_logo(logo: Path, size: int, out_png: Path) -> Path:
    """The logo as a size x size PNG: SVG through rsvg-convert, PNG through Pillow."""
    from PIL import Image

    if logo.suffix.lower() == ".png":
        image = Image.open(logo).convert("RGBA")
        image.thumbnail((size, size))
        image.save(out_png)
    else:
        run(["rsvg-convert", "-w", str(size), "-h", str(size), "-o", str(out_png), str(logo)], timeout=120)
    return out_png


def load_logo(url: str, folder: Path, session: Any = None, attempts: int = 3, base_delay: float = 3.0) -> Path:
    """Download the watermark logo and prove it renders, before any video is
    touched. url may also be a local path (e.g. a file on Drive). Raises LogoError with the reason (HTTP error, an HTML page
    instead of an image, invalid SVG/PNG, rsvg-convert failing)."""
    import xml.etree.ElementTree as ET

    data = b""
    if not url.startswith(("http://", "https://")):
        try:
            data = Path(url).expanduser().read_bytes()
        except OSError as error:
            raise LogoError(f"Không đọc được file logo {url}: {error}.") from None
        attempts = 0
    session = session or requests.Session()
    for attempt in range(attempts):
        try:
            response = session.get(url, timeout=60)
        except requests.RequestException as error:
            problem = f"lỗi mạng ({redact(str(error), 200)})"
        else:
            if response.status_code == 200:
                data = response.content
                break
            problem = f"HTTP {response.status_code}"
            if response.status_code != 429 and response.status_code < 500:
                raise LogoError(f"Không tải được logo {url}: {problem}.")
        if attempt == attempts - 1:
            raise LogoError(f"Không tải được logo {url} sau {attempts} lần thử: {problem}.")
        time.sleep(base_delay * (2 ** attempt))

    folder.mkdir(parents=True, exist_ok=True)
    if data.startswith(PNG_MAGIC):
        path = folder / "gv-logo.png"
    else:
        try:
            root = ET.fromstring(data)
        except ET.ParseError as error:
            head = data[:200].decode("utf-8", "replace").strip().lower()
            kind = "một trang HTML" if head.startswith(("<!doctype html", "<html")) else "không phải SVG/PNG"
            raise LogoError(f"logo {url} là {kind}, không dùng được ({error}).") from None
        tag = root.tag.rsplit("}", 1)[-1].lower()
        if tag == "html":
            raise LogoError(f"logo {url} là một trang HTML, không dùng được.")
        if tag != "svg":
            raise LogoError(f"logo {url}: XML nhưng không phải SVG (thẻ gốc <{tag}>).")
        path = folder / "gv-logo.svg"
    path.write_bytes(data)
    try:
        render_logo(path, 150, folder / "gv-logo-check.png")
    except Exception as error:
        raise LogoError(f"logo {url} không render được: {redact(str(error), 300)}") from None
    return path


def watermark(source: Path, target: Path, logo: Path, width: int, duration: float = 0,
              step: Optional[Step] = None) -> Path:
    """Same mark as the migration pipeline (scripts/video-migration/common.py):
    the logo with "GayVideo.fun" under it, top right, 82% opacity. logo is
    an SVG or PNG file (see load_logo)."""
    from PIL import Image, ImageDraw, ImageFont

    logo_size = max(48, min(150, round(width * 0.07)))
    font_size = max(12, min(28, round(width * 0.014)))
    margin = max(12, round(width * 0.0125))
    logo_png = render_logo(logo, logo_size, target.with_name("logo.png"))

    text_width = round(font_size * 7.4)
    canvas = Image.new("RGBA", (max(logo_size, text_width), logo_size + round(font_size * 1.65) + 4), (0, 0, 0, 0))
    logo = Image.open(logo_png).convert("RGBA")
    canvas.alpha_composite(logo, ((canvas.width - logo.width) // 2, 0))
    font = None
    for candidate in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"):
        if os.path.exists(candidate):
            font = ImageFont.truetype(candidate, font_size)
            break
    draw = ImageDraw.Draw(canvas)
    text = "GayVideo.fun"
    box = draw.textbbox((0, 0), text, font=font)
    draw.text(((canvas.width - (box[2] - box[0])) // 2, canvas.height - (box[3] - box[1]) - 4), text,
              font=font, fill=(255, 255, 255, 255), stroke_width=1, stroke_fill=(0, 0, 0, 153))
    alpha = canvas.getchannel("A").point(lambda value: round(value * 0.82))
    canvas.putalpha(alpha)
    mark = target.with_name("watermark.png")
    canvas.save(mark)

    run_ffmpeg(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(source), "-i", str(mark),
                "-filter_complex", f"[1:v]format=rgba[wm];[0:v][wm]overlay=W-w-{margin}:{margin}[v]",
                "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(target)],
               duration, step)
    return target


def cut_x_clip(source: Path, target: Path, duration: float, start: float = 0, seconds: int = 120,
               label: Optional[str] = None, step: Optional[Step] = None) -> Path:
    """The X clip, cut exactly as gayvideo_publish.cut_clip() does, with progress."""
    from gayvideo_publish import clip_command

    start = max(0.0, min(float(start or 0), max(0.0, duration - 1)))
    length = max(0.1, duration - start)
    if seconds:
        length = min(length, float(seconds))
    run_ffmpeg(clip_command(str(source), str(target), start=start, seconds=seconds, label=label), length, step)
    if not target.exists():
        raise RuntimeError("ffmpeg không tạo được clip X.")
    return target


# --- hosts --------------------------------------------------------------------------

HOSTS = {
    "dood": {"label": "DoodStream", "api": "https://doodapi.co/api", "secret": "HOST_DOOD_API_KEY"},
    "voe": {"label": "VOE", "api": "https://voe.sx/api", "secret": "HOST_VOE_API_KEY"},
    "earnvids": {"label": "EarnVids", "api": "https://earnvidsapi.com/api", "secret": "HOST_EARNVIDS_API_KEY"},
}


def _find_value(value: Any, keys: Iterable[str]) -> Any:
    keys = set(keys)
    if isinstance(value, dict):
        for key, item in value.items():
            if key in keys and item not in (None, ""):
                return item
        for item in value.values():
            found = _find_value(item, keys)
            if found is not None:
                return found
    if isinstance(value, list):
        for item in value:
            found = _find_value(item, keys)
            if found is not None:
                return found
    return None


def _first_url(value: Any) -> Optional[str]:
    if isinstance(value, str) and value.startswith(("http://", "https://")):
        return value
    if isinstance(value, dict):
        for item in value.values():
            found = _first_url(item)
            if found:
                return found
    if isinstance(value, list):
        for item in value:
            found = _first_url(item)
            if found:
                return found
    return None


_SIZE = re.compile(r"^(\d+(?:\.\d+)?)([kMGTP]?)$")


def _curl_size(value: str) -> Optional[float]:
    """curl meter sizes: "512", "45.2M", "1024k" (1024-based)."""
    match = _SIZE.match(value)
    if not match:
        return None
    return float(match.group(1)) * 1024 ** "_kMGTP".index(match.group(2) or "_")


def parse_curl_meter(line: str) -> Optional[Tuple[float, float]]:
    """(bytes sent, upload speed in bytes/s) from one line of curl's default
    progress meter, or None for header and other lines. Columns:
    %Total Total %Recv Received %Xferd Xferd AvgDload AvgUpload TimeTotal TimeSpent TimeLeft Speed"""
    parts = line.split()
    if len(parts) < 12 or not parts[0].isdigit():
        return None
    sent, speed = _curl_size(parts[5]), _curl_size(parts[7])
    if sent is None or speed is None:
        return None
    return sent, speed


def _run_curl(args: Sequence[str], step: Optional[Step]) -> Tuple[int, str, str]:
    """Runs curl, feeding its progress meter (stderr) to step.
    Returns (exit code, stdout, non-meter stderr lines)."""
    import threading

    env = {**os.environ, "LC_ALL": "C"}
    process = subprocess.Popen(list(args), stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    out: List[bytes] = []
    reader = threading.Thread(target=lambda: out.append(process.stdout.read()), daemon=True)
    reader.start()
    messages: List[str] = []
    pending = b""
    while True:
        chunk = process.stderr.read1(4096) if hasattr(process.stderr, "read1") else process.stderr.read(4096)
        if not chunk:
            break
        pending += chunk
        *lines, pending = re.split(rb"[\r\n]", pending)
        for raw in lines:
            text = raw.decode("utf-8", "replace").strip()
            meter = parse_curl_meter(text)
            if meter:
                if step:
                    step.set(meter[0])
            elif text and not text.startswith(("% Total", "Dload")):
                messages.append(text)
    tail = pending.decode("utf-8", "replace").strip()
    if tail and not parse_curl_meter(tail):
        messages.append(tail)
    code = process.wait()
    reader.join()
    return code, b"".join(out).decode("utf-8", "replace"), "\n".join(messages[-5:])


class HostUploader:
    """Uploads like the migration pipeline does, without putting the key on a
    command line: curl reads the URL and form fields from a 0600 config file."""

    def __init__(self, host: str, key: str, session: Optional[requests.Session] = None):
        if host not in HOSTS:
            raise ValueError(f"Unknown host {host}")
        if not key:
            raise RuntimeError(f"Thiếu key {HOSTS[host]['secret']} trong Colab Secrets.")
        self.host, self.key, self.info = host, register_secret(key), HOSTS[host]
        self.session = session or requests.Session()

    def _get(self, path: str, **params: Any) -> Any:
        last = ""
        for attempt in range(5):
            try:
                response = self.session.get(self.info["api"] + path, params={"key": self.key, **params}, timeout=(20, 90))
                if response.status_code == 429 or response.status_code >= 500:
                    last = f"HTTP {response.status_code}"
                    time.sleep(2 ** attempt + 1)
                    continue
                if not response.ok:
                    raise RuntimeError(f"{self.info['label']} HTTP {response.status_code}: {redact(response.text, 200)}")
                return response.json()
            except (requests.RequestException, ValueError) as error:
                last = redact(error)
                time.sleep(2 ** attempt + 1)
        raise RuntimeError(f"{self.info['label']} API lỗi: {last}")

    def _curl(self, url: str, fields: Dict[str, str], path: Path, step: Optional[Step] = None) -> Any:
        if not shutil.which("curl"):
            raise RuntimeError("curl is not installed")

        def quote(value: str) -> str:
            return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'

        config = tempfile.NamedTemporaryFile("w", delete=False, prefix="gv-curl-", suffix=".cfg")
        try:
            os.chmod(config.name, 0o600)
            config.write(f"url = {quote(url)}\n")
            for name, value in fields.items():
                config.write(f"form = {quote(f'{name}={value}')}\n")
            config.write(f"form = {quote(f'file=@{path};filename={path.name};type=video/mp4')}\n")
            config.close()
            # No --silent: curl's progress meter goes to stderr (read below);
            # the response body goes to stdout. The key stays in the 0600 file.
            code, body, messages = _run_curl(
                ["curl", "--show-error", "--fail-with-body", "--connect-timeout", "60",
                 "--max-time", "21600", "--retry", "2", "--retry-delay", "10", "--retry-all-errors", "-K", config.name],
                step,
            )
        finally:
            os.unlink(config.name)
        if code != 0:
            raise RuntimeError(f"{self.info['label']} upload lỗi: {redact(messages or body, 300)}")
        try:
            return json.loads(body)
        except ValueError:
            raise RuntimeError(f"{self.info['label']} upload trả về không phải JSON: {redact(body, 200)}") from None

    def upload(self, path: Path, title: str, tags: Sequence[str] = (), step: Optional[Step] = None) -> str:
        """Uploads the file and returns the host's file code."""
        if step:
            step.unit, step.total = "B", path.stat().st_size
        server = _first_url(self._get("/upload/server"))
        if not server:
            raise RuntimeError(f"{self.info['label']} không trả về upload server.")
        if self.host == "dood":
            url = server if "?" in server else f"{server}?{self.key}"
            payload = self._curl(url, {"api_key": self.key}, path, step)
        elif self.host == "voe":
            payload = self._curl(f"{server}{'&' if '?' in server else '?'}key={self.key}", {}, path, step)
        else:
            payload = self._curl(server, {"key": self.key, "file_title": title, "tags": ",".join(tags),
                                          "file_public": "1", "file_adult": "1"}, path, step)
        code = _find_value(payload, ("filecode", "file_code", "fileCode", "code"))
        if not isinstance(code, str) or not code:
            raise RuntimeError(f"{self.info['label']} không trả về mã file: {redact(payload, 200)}")
        if title and self.host in ("dood", "voe"):
            try:
                self._get("/file/rename", file_code=code, title=title)
            except Exception:
                pass
        return code


# --- ledger -------------------------------------------------------------------------

LEDGER_FIELDS = ["time", "link", "item_key", "sha256", "title", "video_id", "url", "x", "status", "error"]


class Ledger:
    """A CSV of every item handled, so a link or file is never posted twice
    (kept on Google Drive so it survives Colab sessions)."""

    def __init__(self, path: str):
        self.path = path
        self.rows: List[Dict[str, str]] = []
        if os.path.exists(path):
            with open(path, newline="", encoding="utf-8") as handle:
                self.rows = list(csv.DictReader(handle))

    def done_keys(self) -> set:
        return {row["item_key"] for row in self.rows if row.get("status") == "done"}

    def done_hashes(self) -> set:
        return {row["sha256"] for row in self.rows if row.get("status") == "done" and row.get("sha256")}

    def add(self, **row: str) -> None:
        record = {name: str(row.get(name, "") or "") for name in LEDGER_FIELDS}
        record["time"] = record["time"] or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        self.rows.append(record)
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        new = not os.path.exists(self.path)
        with open(self.path, "a", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=LEDGER_FIELDS)
            if new:
                writer.writeheader()
            writer.writerow(record)
