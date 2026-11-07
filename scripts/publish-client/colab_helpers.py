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
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence
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

class SourceError(RuntimeError):
    """The link could not be read; the message says what to do instead."""


@dataclass
class SourceItem:
    """One video found behind a link. `key` identifies it for the ledger."""

    key: str
    download: Callable[[Path], Path]
    label: str = ""


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


def _download_photos_video(base: str, session: requests.Session) -> Callable[[Path], Path]:
    def download(target: Path) -> Path:
        # "=dv" asks Google for the original video file (undocumented, stable for years).
        def fetch() -> Path:
            with session.get(base + "=dv", headers={"User-Agent": BROWSER_UA}, stream=True, timeout=(30, 600)) as response:
                if response.status_code == 429 or response.status_code >= 500:
                    raise _Retryable(f"HTTP {response.status_code}")
                kind = response.headers.get("content-type", "")
                if response.status_code >= 400 or not kind.startswith("video/"):
                    raise SourceError(
                        f"Google Photos không trả video gốc (HTTP {response.status_code}, {kind or 'không rõ loại'}). {PHOTOS_HELP}"
                    )
                with open(target, "wb") as handle:
                    for chunk in response.iter_content(chunk_size=8 * 1024 * 1024):
                        handle.write(chunk)
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
            SourceItem(key=f"drive:{item.id}", download=_drive_download(item.id), label=Path(item.path).name)
            for item in videos
        ]
    match = _DRIVE_FILE.search(link)
    if not match:
        raise SourceError("Link Google Drive không có mã file/thư mục.")
    file_id = match.group(1) or match.group(2)
    return "", [SourceItem(key=f"drive:{file_id}", download=_drive_download(file_id))]


def _drive_download(file_id: str) -> Callable[[Path], Path]:
    def download(target: Path) -> Path:
        import gdown

        result = gdown.download(id=file_id, output=str(target), quiet=True)
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


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
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


def watermark(source: Path, target: Path, logo_svg: Path, width: int) -> Path:
    """Same mark as the migration pipeline (scripts/video-migration/common.py):
    the logo with "GayVideo.fun" under it, top right, 82% opacity."""
    from PIL import Image, ImageDraw, ImageFont

    logo_size = max(48, min(150, round(width * 0.07)))
    font_size = max(12, min(28, round(width * 0.014)))
    margin = max(12, round(width * 0.0125))
    logo_png = target.with_name("logo.png")
    run(["rsvg-convert", "-w", str(logo_size), "-h", str(logo_size), "-o", str(logo_png), str(logo_svg)], timeout=120)

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

    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(source), "-i", str(mark),
         "-filter_complex", f"[1:v]format=rgba[wm];[0:v][wm]overlay=W-w-{margin}:{margin}[v]",
         "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
         "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(target)])
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

    def _curl(self, url: str, fields: Dict[str, str], path: Path) -> Any:
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
            result = subprocess.run(
                ["curl", "--silent", "--show-error", "--fail-with-body", "--connect-timeout", "60",
                 "--max-time", "21600", "--retry", "2", "--retry-delay", "10", "--retry-all-errors", "-K", config.name],
                capture_output=True, text=True,
            )
        finally:
            os.unlink(config.name)
        if result.returncode != 0:
            raise RuntimeError(f"{self.info['label']} upload lỗi: {redact(result.stderr or result.stdout, 300)}")
        try:
            return json.loads(result.stdout)
        except ValueError:
            raise RuntimeError(f"{self.info['label']} upload trả về không phải JSON: {redact(result.stdout, 200)}") from None

    def upload(self, path: Path, title: str, tags: Sequence[str] = ()) -> str:
        """Uploads the file and returns the host's file code."""
        server = _first_url(self._get("/upload/server"))
        if not server:
            raise RuntimeError(f"{self.info['label']} không trả về upload server.")
        if self.host == "dood":
            url = server if "?" in server else f"{server}?{self.key}"
            payload = self._curl(url, {"api_key": self.key}, path)
        elif self.host == "voe":
            payload = self._curl(f"{server}{'&' if '?' in server else '?'}key={self.key}", {}, path)
        else:
            payload = self._curl(server, {"key": self.key, "file_title": title, "tags": ",".join(tags),
                                          "file_public": "1", "file_adult": "1"}, path)
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
