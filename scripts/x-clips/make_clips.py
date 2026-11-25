"""Makes the X clips for posts approved in /admin/review (GitHub Actions:
.github/workflows/x-clips.yml). One run handles every pending post:

1. GET /api/v1/social/pending: posts waiting for a clip, with their mirrors.
2. Find each video in the private migration data (stream-video-data), the
   same way the server's sync does: by host file code in migration-log.csv
   (dood/voe/earnvids_file_code) -> post_id -> videos.csv drive_links.
3. Sources, in order: the hosts (primary first) whose API gives a file URL
   (only EarnVids: /file/direct_link; DoodStream and VOE have none), then the
   Google Drive original (service account when GDRIVE_SERVICE_ACCOUNT_JSON is
   set, else the public download link). Drive originals get the site mark.
4. ffmpeg reads the URL directly and seeks with HTTP Range (-ss before -i),
   so only the part being cut is downloaded.
5. Upload the clip (/api/v1/clips), attach it (/api/v1/social/<id>/clip), or
   report why not (/api/v1/social/<id>/failure).

The repository is public, so nothing here prints a link, token or key:
source URLs are masked with ::add-mask:: and stripped from every message.

Env: GAYVIDEO_API_URL, GAYVIDEO_API_TOKEN, HOST_EARNVIDS_API_KEY,
GDRIVE_SERVICE_ACCOUNT_JSON (optional), MIGRATION_DATA (default migration-data).
"""

from __future__ import annotations

import csv
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional, Tuple

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(REPO / "scripts" / "publish-client"))

WATERMARK_PNG = HERE / "watermark.png"
# The mark is drawn for a 1280 px wide frame (see watermark.png).
WATERMARK_SCALE = 133 / 1280
LABEL = "gayvideo.fun"
LABEL_FONTS = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
)
HOSTS_WITH_DIRECT_LINK = {"earnvids"}
HOST_LABELS = {"dood": "DoodStream", "voe": "VOE", "earnvids": "EarnVids"}
DRIVE_LINK = re.compile(r"https://(?:drive|docs)\.google\.com/[^\s;,\"')\]]+")
VIDEO_MIME = re.compile(r"^video/")


# --- never print a link -------------------------------------------------------

_masked: set = set()


def mask(value: str) -> None:
    """Tells GitHub Actions to hide `value` in the log (no-op elsewhere)."""
    if value and value not in _masked and os.environ.get("GITHUB_ACTIONS") == "true":
        _masked.add(value)
        print(f"::add-mask::{value}", flush=True)


def clean(text: object, limit: int = 400) -> str:
    """A message safe for a public log and the admin: no URLs, ids or tokens."""
    value = str(text)
    value = re.sub(r"https?://\S+", "[link]", value)
    value = re.sub(r"\b(?:gv|ghp|github_pat|ya29|sk)[._-][A-Za-z0-9._-]{8,}", "[secret]", value)
    value = re.sub(r"\b[A-Za-z0-9_-]{25,}\b", "[id]", value)
    return re.sub(r"\s+", " ", value).strip()[:limit]


# --- migration data -------------------------------------------------------------

def read_csv(path: Path) -> List[Dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


@dataclass
class MigrationIndex:
    """host -> file code -> migration-log row, and post_id -> videos.csv row."""

    by_code: Dict[Tuple[str, str], Dict[str, str]] = field(default_factory=dict)
    sources: Dict[str, Dict[str, str]] = field(default_factory=dict)

    @classmethod
    def load(cls, root: Path) -> "MigrationIndex":
        index = cls()
        videos, log = root / "videos.csv", root / "migration-log.csv"
        if not videos.exists() or not log.exists():
            return index
        index.sources = {row["post_id"]: row for row in read_csv(videos) if row.get("post_id")}
        for row in read_csv(log):
            for host in HOST_LABELS:
                code = (row.get(f"{host}_file_code") or "").strip()
                if code and row.get("post_id"):
                    index.by_code[(host, code)] = row
        return index

    def find(self, mirrors: Iterable[dict]) -> Optional[Dict[str, str]]:
        """The log row of a video, matched on its mirrors (primary first)."""
        for mirror in mirrors:
            row = self.by_code.get((mirror["host"], mirror["fileCode"]))
            if row:
                return row
        return None

    def drive_links(self, row: Optional[Dict[str, str]]) -> List[str]:
        if not row:
            return []
        cell = self.sources.get(row["post_id"], {}).get("drive_links", "")
        return list(dict.fromkeys(match.rstrip(").]") for match in DRIVE_LINK.findall(cell or "")))


# --- sources ---------------------------------------------------------------------

class SourceError(RuntimeError):
    """A source cannot give the video; the message says why (no links)."""


@dataclass
class Opened:
    """Where ffmpeg reads a source from, and how to download it whole."""

    url: str
    headers: Dict[str, str] = field(default_factory=dict)
    kind: str = "file"  # "file" (MP4 over HTTP), "hls" (manifest) or "local"
    # download(target, timeout_seconds) -> path of the whole file on disk.
    download: Optional[Callable[[Path, float], Path]] = None
    # Why the preferred way (the Drive API) refused, when falling back.
    api_error: Optional[str] = None


@dataclass
class Source:
    name: str
    label: str
    watermark: bool
    open: Callable[[], Opened]


def http_session():
    import requests

    session = requests.Session()
    session.headers["User-Agent"] = "gayvideo-x-clips"
    return session


def download_to(url: str, headers: Dict[str, str], target: Path, timeout: float, session=None,
                free_bytes: Callable[[Path], int] = lambda path: shutil.disk_usage(path).free) -> Path:
    """Streams a whole file to disk, giving up after `timeout` seconds or
    when the runner's disk would drop under 2 GB."""
    session = session or http_session()
    deadline = time.monotonic() + timeout
    with session.get(url, headers=headers, stream=True, timeout=(30, 60)) as response:
        if response.status_code >= 400:
            raise SourceError(f"tải cả file: HTTP {response.status_code}{drive_reason(response)}")
        size = int(response.headers.get("content-length") or 0)
        if size and size > free_bytes(target.parent) - 2 * 1024**3:
            raise SourceError(f"file {size // 1048576} MB lớn hơn chỗ trống trên runner")
        with target.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=8 * 1024 * 1024):
                handle.write(chunk)
                if time.monotonic() > deadline:
                    raise SourceError(f"tải cả file quá {timeout:.0f} s")
    return target


# EarnVids (earnvidsapi.com/api.html): GET /file/direct_link?key&file_code&ip
# [&q=o|h|n|l][&hls=1]. Errors come back as HTTP 200 with {"status": != 200,
# "msg": ...}, so the JSON status is checked, not only the HTTP one. The link
# is bound to the IP given, so the runner sends its own.
EARNVIDS_API = "https://earnvidsapi.com/api"


def parse_direct_link(payload: object) -> Tuple[str, str]:
    """(url, "file"|"hls") from a direct_link answer, or SourceError with its msg."""
    if not isinstance(payload, dict):
        raise SourceError("EarnVids trả về không phải JSON object")
    status = payload.get("status")
    if status not in (200, "200"):
        raise SourceError(f"EarnVids status {status}: {clean(payload.get('msg') or 'không rõ', 160)}")
    result = payload.get("result")
    found: List[Tuple[int, str, str]] = []

    def walk(value: object, key: str = "") -> None:
        if isinstance(value, str) and value.startswith(("http://", "https://")):
            hls = ".m3u8" in value or "hls" in key.lower()
            rank = {"o": 0, "h": 1, "n": 2, "l": 3}.get(key, 4)
            found.append((10 + rank if hls else rank, value, "hls" if hls else "file"))
        elif isinstance(value, dict):
            name = str(value.get("name") or "")
            for child_key, child in value.items():
                walk(child, name if child_key in ("url", "link") and name else child_key)
        elif isinstance(value, list):
            for child in value:
                walk(child, key)

    walk(result)
    images = (".jpg", ".jpeg", ".png", ".webp")
    found = [item for item in found if not item[1].split("?")[0].lower().endswith(images)]
    if not found:
        keys = ", ".join(sorted(result)) if isinstance(result, dict) else type(result).__name__
        raise SourceError(f"EarnVids không trả URL video (result: {keys or 'trống'})")
    _rank, url, kind = sorted(found)[0]
    return url, kind


_public_ip: Optional[str] = None


def public_ip(session=None) -> Optional[str]:
    global _public_ip
    if _public_ip is None:
        try:
            text = (session or http_session()).get("https://api.ipify.org", timeout=10).text.strip()
            _public_ip = text if re.fullmatch(r"\d{1,3}(\.\d{1,3}){3}", text) else ""
        except Exception:
            _public_ip = ""
    return _public_ip or None


def earnvids_call(code: str, params: Dict[str, str], session=None) -> object:
    key = os.environ.get("HOST_EARNVIDS_API_KEY", "")
    session = session or http_session()
    response = session.get(f"{EARNVIDS_API}/file/direct_link", params={"key": key, "file_code": code, **params},
                           timeout=(20, 60))
    if response.status_code >= 400:
        raise SourceError(f"EarnVids HTTP {response.status_code}")
    try:
        return response.json()
    except ValueError:
        raise SourceError("EarnVids trả về không phải JSON") from None


def earnvids_open(code: str, session=None) -> Opened:
    ip = public_ip(session)
    attempts = [{"q": "o", "hls": "0"}, {}]
    errors: List[str] = []
    for params in attempts:
        if ip:
            params = {**params, "ip": ip}
        try:
            url, kind = parse_direct_link(earnvids_call(code, params, session))
        except SourceError as error:
            errors.append(str(error))
            continue
        mask(url)
        download = None if kind == "hls" else (lambda target, timeout, url=url: download_to(url, {}, target, timeout))
        return Opened(url, {}, kind, download)
    raise SourceError("; ".join(dict.fromkeys(errors)))


def drive_file_id(url: str) -> Optional[str]:
    match = re.search(r"/file/d/([A-Za-z0-9_-]+)", url) or re.search(r"[?&]id=([A-Za-z0-9_-]+)", url)
    return match.group(1) if match else None


def drive_folder_id(url: str) -> Optional[str]:
    match = re.search(r"/folders/([A-Za-z0-9_-]+)", url)
    return match.group(1) if match else None


def drive_resource_key(url: str) -> Optional[str]:
    """Files shared by link before 2021 need their resource key (?resourcekey=)."""
    match = re.search(r"[?&]resourcekey=([A-Za-z0-9_-]+)", url, flags=re.I)
    return match.group(1) if match else None


def drive_reason(response) -> str:
    """The Drive API's reason for an error (e.g. downloadQuotaExceeded), if any."""
    try:
        errors = response.json().get("error", {}).get("errors") or []
        reason = errors[0].get("reason") if errors else response.json().get("error", {}).get("status")
    except Exception:
        return ""
    return f" ({clean(reason, 60)})" if reason else ""


class Drive:
    """Google Drive reads. With a service account: the Drive API (no anonymous
    quota, folders listable), the resource key when the link has one, and a
    one-byte check first so a refusal comes with Google's reason. If the API
    refuses, the public link is tried, downloaded with gdown like the
    migration does."""

    API = "https://www.googleapis.com/drive/v3/files"

    def __init__(self, service_account_json: str = "", session=None):
        self.info = json.loads(service_account_json) if service_account_json.strip() else None
        self._credentials = None
        self._session = session

    @property
    def session(self):
        if self._session is None:
            self._session = http_session()
        return self._session

    def token(self) -> str:
        from google.auth.transport.requests import Request
        from google.oauth2 import service_account

        if self._credentials is None:
            self._credentials = service_account.Credentials.from_service_account_info(
                self.info, scopes=["https://www.googleapis.com/auth/drive.readonly"])
        if not self._credentials.valid:
            self._credentials.refresh(Request())
        token = self._credentials.token
        mask(token)
        return token

    def api_headers(self, file_id: str, resource_key: Optional[str]) -> Dict[str, str]:
        headers = {"Authorization": f"Bearer {self.token()}"}
        if resource_key:
            headers["X-Goog-Drive-Resource-Keys"] = f"{file_id}/{resource_key}"
        return headers

    def folder_video(self, folder_id: str, resource_key: Optional[str]) -> Tuple[str, Optional[str]]:
        """The largest video file in a folder, with its resource key."""
        response = self.session.get(
            self.API,
            params={"q": f"'{folder_id}' in parents and trashed=false", "fields": "files(id,mimeType,size,resourceKey)",
                    "supportsAllDrives": "true", "includeItemsFromAllDrives": "true", "pageSize": "200"},
            headers=self.api_headers(folder_id, resource_key), timeout=60)
        if not response.ok:
            raise SourceError(f"Drive API HTTP {response.status_code}{drive_reason(response)} khi đọc thư mục")
        videos = [item for item in response.json().get("files", []) if VIDEO_MIME.match(item.get("mimeType", ""))]
        if not videos:
            raise SourceError("thư mục Drive không có file video")
        best = max(videos, key=lambda item: int(item.get("size") or 0))
        return best["id"], best.get("resourceKey")

    def api_open(self, link: str) -> Opened:
        file_id, folder_id, resource_key = drive_file_id(link), drive_folder_id(link), drive_resource_key(link)
        if folder_id and not file_id:
            file_id, resource_key = self.folder_video(folder_id, resource_key)
        meta = self.session.get(f"{self.API}/{file_id}", params={
            "fields": "id,mimeType,size,resourceKey,capabilities/canDownload", "supportsAllDrives": "true"},
            headers=self.api_headers(file_id, resource_key), timeout=60)
        if not meta.ok:
            raise SourceError(f"Drive API HTTP {meta.status_code}{drive_reason(meta)}")
        info = meta.json()
        resource_key = resource_key or info.get("resourceKey")
        if info.get("capabilities", {}).get("canDownload") is False:
            raise SourceError("Drive: service account không được phép tải file này")
        url = f"{self.API}/{file_id}?alt=media&supportsAllDrives=true&acknowledgeAbuse=true"
        mask(url)
        headers = self.api_headers(file_id, resource_key)
        probe = self.session.get(url, headers={**headers, "Range": "bytes=0-0"}, timeout=60)
        if probe.status_code >= 400:
            raise SourceError(f"Drive API HTTP {probe.status_code}{drive_reason(probe)} khi tải")
        return Opened(url, headers, "file",
                      lambda target, timeout: download_to(url, self.api_headers(file_id, resource_key), target, timeout,
                                                          self.session))

    def public_open(self, link: str) -> Opened:
        file_id = drive_file_id(link)
        if not file_id:
            raise SourceError("link thư mục cần GDRIVE_SERVICE_ACCOUNT_JSON")
        url = f"https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t"
        resource_key = drive_resource_key(link)
        if resource_key:
            url += f"&resourcekey={resource_key}"
        mask(url)

        def download(target: Path, timeout: float) -> Path:
            import gdown  # handles Drive's confirm pages, like the migration

            result = gdown.download(url=link, output=str(target), quiet=True, fuzzy=True)
            if not result or not target.exists():
                raise SourceError("gdown không tải được file (chưa chia sẻ công khai, hoặc vượt hạn mức tải)")
            return target

        return Opened(url, {}, "file", download)

    def open(self, link: str) -> Opened:
        if not self.info:
            return self.public_open(link)
        try:
            return self.api_open(link)
        except SourceError as api_error:
            try:
                opened = self.public_open(link)
            except SourceError:
                raise api_error from None
            # The API refused: the direct read would too; only the public download is left.
            opened.kind = "download-only"
            opened.api_error = str(api_error)
            return opened


def plan_sources(post: dict, index: MigrationIndex, drive: Optional[Drive]) -> Tuple[List[Source], List[str]]:
    """Hosts (primary first) that can give a file, then Drive. Also returns
    why the others were skipped (shown in the admin if nothing works)."""
    sources: List[Source] = []
    skipped: List[str] = []
    row = index.find(post["mirrors"])
    codes = {(mirror["host"]): mirror["fileCode"] for mirror in post["mirrors"]}
    # The migration log knows the EarnVids copy even when the server has no mirror for it.
    if row and row.get("earnvids_file_code") and "earnvids" not in codes:
        codes["earnvids"] = row["earnvids_file_code"]
    order = [mirror["host"] for mirror in post["mirrors"]] + [host for host in codes if host not in
                                                             [m["host"] for m in post["mirrors"]]]
    for host in order:
        label = HOST_LABELS.get(host, host)
        if host not in HOSTS_WITH_DIRECT_LINK:
            skipped.append(f"{label}: API không có link tải trực tiếp")
            continue
        if not os.environ.get("HOST_EARNVIDS_API_KEY"):
            skipped.append(f"{label}: thiếu HOST_EARNVIDS_API_KEY")
            continue
        sources.append(Source(host, label, False, lambda code=codes[host]: earnvids_open(code)))
    links = index.drive_links(row)
    if not row:
        skipped.append("Google Drive: không tìm thấy video trong migration-log.csv")
    elif not links:
        skipped.append("Google Drive: videos.csv không có link cho video này")
    elif drive is not None:
        for number, link in enumerate(links[:3], 1):
            sources.append(Source("drive", f"Google Drive #{number}", True, lambda link=link: drive.open(link)))
    return sources, skipped


# --- ffmpeg ----------------------------------------------------------------------

# Reading the URL directly (HTTP Range) is tried first, for this long at most:
# Drive can serve ranges very slowly (22 min for one clip). Past it, the whole
# file is downloaded to the runner and cut there.
DIRECT_TIMEOUT = int(os.environ.get("X_CLIPS_DIRECT_TIMEOUT", "240"))
# Everything for one video (all sources) must finish within this.
VIDEO_TIMEOUT = int(os.environ.get("X_CLIPS_VIDEO_TIMEOUT", "1200"))
# A clip more than this much shorter than expected was cut off (a dropped read).
SHORT_TOLERANCE = 2.0


def filter_value(value: str) -> str:
    """Escape for both ffmpeg parsing levels (option string, then filter graph)."""
    for level in ("\\':", "\\'[],;"):
        value = "".join("\\" + char if char in level else char for char in value)
    return value


def ffmpeg_args(url: str, headers: Dict[str, str], start: float, seconds: float, output: Path,
                watermark: bool, preset: str = "medium") -> List[str]:
    """Same output as the notebook's clips: H.264 High yuv420p, AAC-LC stereo
    44.1 kHz, longest side <= 1280, <= 60 fps, +faststart."""
    args = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y"]
    if url.startswith(("http://", "https://")):
        args += ["-rw_timeout", "30000000", "-reconnect", "1", "-reconnect_on_network_error", "1",
                 "-reconnect_delay_max", "10"]
        if headers:
            args += ["-headers", "".join(f"{key}: {value}\r\n" for key, value in headers.items())]
    if start > 0:
        args += ["-ss", f"{start:g}"]
    args += ["-i", url]
    use_mark = watermark and WATERMARK_PNG.exists()
    if use_mark:
        args += ["-i", str(WATERMARK_PNG)]
    args += ["-t", f"{seconds:g}"]
    filters = ["[0:v]scale='if(gte(iw,ih),min(1280,iw),-2)':'if(gte(iw,ih),-2,min(1280,ih))'[v0]"]
    last = "v0"
    if use_mark:
        filters += [f"[1:v][v0]scale2ref=w='main_w*{WATERMARK_SCALE:.4f}':h='ow/mdar'[wm][base]",
                    "[base][wm]overlay=x='main_w-overlay_w-main_w*0.0125':y='main_w*0.0125'[v1]"]
        last = "v1"
    font = next((path for path in LABEL_FONTS if Path(path).exists()), None)
    if font:
        filters.append(
            f"[{last}]drawtext=fontfile={filter_value(font)}:expansion=none:text={filter_value(LABEL)}:"
            "fontcolor=white:fontsize='max(16,min(w,h)/18)':box=1:boxcolor=black@0.45:boxborderw=10:"
            "x='(w-text_w)/2':y='h-text_h-min(w,h)/14'[v2]")
        last = "v2"
    args += ["-filter_complex", ";".join(filters), "-map", f"[{last}]", "-map", "0:a:0?", "-fpsmax", "60",
             "-c:v", "libx264", "-preset", preset, "-profile:v", "high", "-level:v", "4.1", "-pix_fmt", "yuv420p",
             "-crf", "23", "-maxrate", "6M", "-bufsize", "12M",
             "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2", "-movflags", "+faststart", str(output)]
    return args


def probe_duration(path, headers: Optional[Dict[str, str]] = None, timeout: int = 120) -> float:
    command = ["ffprobe", "-v", "error"]
    if headers:
        command += ["-headers", "".join(f"{key}: {value}\r\n" for key, value in headers.items())]
    command += ["-show_entries", "format=duration", "-of", "csv=p=0", str(path)]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
        return float(result.stdout.strip())
    except (ValueError, subprocess.TimeoutExpired):
        return 0.0


def expected_seconds(post: dict, source_seconds: float = 0) -> Optional[float]:
    """How long the clip must be: the planned length, cut short only by the
    end of the video. None when the video's length is unknown."""
    start = 0 if post["mode"] == "full" else post["start"]
    duration = post.get("durationSeconds") or source_seconds or 0
    if not duration:
        return None
    return max(1.0, min(float(post["seconds"]), duration - start))


def encode(url: str, headers: Dict[str, str], post: dict, output: Path, watermark: bool, timeout: float,
           run=subprocess.run, source_seconds: float = 0) -> float:
    """One ffmpeg run, then a length check. Raises SourceError."""
    start = 0 if post["mode"] == "full" else post["start"]
    command = ffmpeg_args(url, headers, start, post["seconds"], output, watermark)
    try:
        result = run(command, capture_output=True, text=True, timeout=max(30, timeout))
    except subprocess.TimeoutExpired:
        output.unlink(missing_ok=True)
        raise SourceError(f"quá {timeout:.0f} s") from None
    if result.returncode != 0:
        tail = " ".join((result.stderr or "").strip().splitlines()[-3:])
        raise SourceError(f"ffmpeg lỗi: {clean(tail, 300)}")
    seconds = probe_duration(output)
    if seconds < 1:
        raise SourceError("clip tạo ra không hợp lệ")
    expected = expected_seconds(post, source_seconds)
    if expected and seconds < expected - SHORT_TOLERANCE:
        raise SourceError(f"clip bị ngắn {seconds:.0f}/{expected:.0f} s (đọc nguồn bị ngắt)")
    return seconds


def cut(source: Source, post: dict, output: Path, run=subprocess.run, deadline: Optional[float] = None,
        log=print) -> Tuple[float, str]:
    """Cuts the clip from one source: reading the URL directly first, then
    from a whole download. Returns (seconds, "direct"|"download")."""
    deadline = deadline or time.monotonic() + VIDEO_TIMEOUT
    opened = source.open()
    errors: List[str] = []
    if opened.kind in ("file", "hls", "local"):
        budget = min(DIRECT_TIMEOUT if opened.kind == "file" else VIDEO_TIMEOUT, deadline - time.monotonic())
        try:
            return encode(opened.url, opened.headers, post, output, source.watermark, budget, run), "direct"
        except SourceError as error:
            errors.append(f"đọc thẳng: {error}")
            log(f"    {source.label}: đọc thẳng không được ({error}); tải cả file")
    elif opened.api_error:
        errors.append(opened.api_error)
    if opened.download is None:
        raise SourceError("; ".join(errors) or "không đọc được")
    local = output.with_suffix(".source")
    try:
        remaining = deadline - time.monotonic()
        if remaining < 60:
            raise SourceError("hết thời gian cho video này")
        started = time.monotonic()
        opened.download(local, remaining - 30)
        log(f"    {source.label}: tải {local.stat().st_size / 1048576:.0f} MB trong {time.monotonic() - started:.0f} s")
        seconds = encode(str(local), {}, post, output, source.watermark, deadline - time.monotonic(), run,
                         source_seconds=probe_duration(local))
        return seconds, "download"
    except SourceError as error:
        errors.append(f"tải cả file: {error}")
        raise SourceError("; ".join(errors)) from None
    except Exception as error:  # requests/gdown errors
        errors.append(f"tải cả file: {clean(error)}")
        raise SourceError("; ".join(errors)) from None
    finally:
        local.unlink(missing_ok=True)


# --- main ------------------------------------------------------------------------

def process(client, posts: List[dict], index: MigrationIndex, drive: Optional[Drive], work: Path,
            cutter=cut, log=print) -> Dict[str, int]:
    summary = {"made": 0, "failed": 0}
    for number, post in enumerate(posts, 1):
        started = time.monotonic()
        log(f"[{number}/{len(posts)}] {post['slug']} ({post['mode']}, {post['start']}s +{post['seconds']}s)")
        sources, skipped = plan_sources(post, index, drive)
        reasons: List[str] = []
        done = False
        deadline = started + VIDEO_TIMEOUT
        for source in sources:
            output = work / f"{post['postId']}.mp4"
            if time.monotonic() > deadline - 60:
                reasons.append(f"{source.label}: hết {VIDEO_TIMEOUT // 60} phút cho video này")
                break
            try:
                seconds, method = cutter(source, post, output, deadline=deadline, log=log)
                clip = client.upload_clip(str(output))
                client._request("POST", f"/api/v1/social/{post['postId']}/clip",
                                {"clipId": clip["clipId"], "source": source.name})
                log(f"    ok from {source.label} ({method}): {seconds:.0f}s, "
                    f"{output.stat().st_size / 1048576:.1f} MB, {time.monotonic() - started:.0f}s")
                summary["made"] += 1
                done = True
                break
            except Exception as error:  # one source failing tries the next
                if getattr(error, "status", None) in (404, 409):
                    # Cancelled or changed in the admin meanwhile: nothing to do.
                    log(f"    skipped: {clean(error)}")
                    done = True
                    break
                reasons.append(f"{source.label}: {clean(error)}")
                log(f"    {source.label} failed: {clean(error)}")
            finally:
                output.unlink(missing_ok=True)
        if not done:
            reason = " · ".join(reasons + skipped) or "không có nguồn nào"
            try:
                client._request("POST", f"/api/v1/social/{post['postId']}/failure",
                                {"reason": reason, "final": not sources})
            except Exception as error:
                log(f"    could not report the failure: {clean(error)}")
            log(f"    no clip: {clean(reason)}")
            summary["failed"] += 1
    return summary


# --- diagnose (workflow input "diagnose") ------------------------------------------

def slugify(text: str) -> str:
    import unicodedata

    text = unicodedata.normalize("NFD", text.lower().replace("đ", "d"))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def find_rows_by_slug(index: MigrationIndex, slug: str) -> List[Dict[str, str]]:
    """Migration log rows whose source title slugifies to `slug` (ignoring a
    "-2" style suffix the site adds to duplicate slugs)."""
    base = re.sub(r"-\d+$", "", slug)
    post_ids = [post_id for post_id, row in index.sources.items()
                if slugify(row.get("title", "")) in (slug, base)]
    return [row for row in {id(row): row for row in index.by_code.values()}.values()
            if row.get("post_id") in post_ids]


def diagnose(slugs: List[str], index: MigrationIndex, drive: Drive, pending: List[dict], log=print) -> None:
    """Real calls to EarnVids and Drive for some videos, printing only
    statuses, reasons and shapes: never a link, key or file id."""
    by_slug = {post["slug"]: post for post in pending}
    for slug in slugs:
        log(f"== {slug}")
        post = by_slug.get(slug)
        rows = [index.find(post["mirrors"])] if post else find_rows_by_slug(index, slug)
        rows = [row for row in rows if row]
        log(f"   pending: {'yes' if post else 'no'}; migration rows: {len(rows)}; "
            f"durationSeconds: {post.get('durationSeconds') if post else '?'}")
        for row in rows[:2]:
            code = (row.get("earnvids_file_code") or "").strip()
            log(f"   EarnVids code: {'yes' if code else 'no'}")
            if code and os.environ.get("HOST_EARNVIDS_API_KEY"):
                for params in ({"q": "o", "hls": "0"}, {}, {"hls": "1"}):
                    for with_ip in (True, False):
                        call = dict(params)
                        if with_ip and public_ip():
                            call["ip"] = public_ip()
                        try:
                            payload = earnvids_call(code, call)
                        except SourceError as error:
                            log(f"   direct_link {sorted(call)}: {error}")
                            continue
                        result = payload.get("result") if isinstance(payload, dict) else None
                        shape = ({key: type(value).__name__ for key, value in result.items()}
                                 if isinstance(result, dict) else type(result).__name__)
                        try:
                            _url, kind = parse_direct_link(payload)
                            outcome = f"URL {kind}"
                        except SourceError as error:
                            outcome = str(error)
                        log(f"   direct_link {sorted(call)}: status={payload.get('status') if isinstance(payload, dict) else '?'} "
                            f"msg={clean(payload.get('msg', '') if isinstance(payload, dict) else '', 80)!r} "
                            f"result={shape} -> {outcome}")
            for number, link in enumerate(index.drive_links(row)[:3], 1):
                kind = "folder" if drive_folder_id(link) and not drive_file_id(link) else "file"
                log(f"   Drive #{number}: {kind}, resourcekey in link: {'yes' if drive_resource_key(link) else 'no'}")
                try:
                    opened = drive.open(link)
                    if opened.api_error:
                        log(f"     API refused: {opened.api_error}; public link left")
                    else:
                        log("     API: metadata ok, first byte ok")
                        started = time.monotonic()
                        response = drive.session.get(opened.url, headers={**opened.headers, "Range": "bytes=0-8388607"},
                                                     timeout=120)
                        size = len(response.content)
                        log(f"     Range read 8 MB: HTTP {response.status_code}, "
                            f"{size / 1048576 / max(0.01, time.monotonic() - started):.1f} MB/s")
                        seconds = probe_duration(opened.url, opened.headers, timeout=90)
                        log(f"     source duration (ffprobe): {seconds:.0f} s")
                except SourceError as error:
                    log(f"     {error}")
                except Exception as error:
                    log(f"     {clean(error)}")


def main() -> int:
    from gayvideo_publish import GayVideoClient

    token = os.environ.get("GAYVIDEO_API_TOKEN", "")
    if not token:
        print("GAYVIDEO_API_TOKEN is not set", file=sys.stderr)
        return 2
    client = GayVideoClient(token=token, base_url=os.environ.get("GAYVIDEO_API_URL") or "https://gayvideo.fun",
                            timeout=600)
    posts = client._request("GET", "/api/v1/social/pending")["posts"]
    print(f"{len(posts)} X post(s) waiting for a clip")
    slugs = [slug.strip() for slug in os.environ.get("DIAGNOSE_SLUGS", "").split(",") if slug.strip()]
    if not posts and not slugs:
        return 0
    index = MigrationIndex.load(Path(os.environ.get("MIGRATION_DATA", "migration-data")))
    if slugs:
        diagnose(slugs, index, Drive(os.environ.get("GDRIVE_SERVICE_ACCOUNT_JSON", "")), posts)
        return 0
    print(f"migration data: {len(index.by_code)} host codes, {len(index.sources)} sources")
    drive = Drive(os.environ.get("GDRIVE_SERVICE_ACCOUNT_JSON", ""))
    print("Drive: " + ("service account" if drive.info else "public links only"))
    work = Path(tempfile.mkdtemp(prefix="x-clips-"))
    try:
        summary = process(client, posts, index, drive, work)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    print(f"done: {summary['made']} clip(s), {summary['failed']} without a clip")
    return 0


if __name__ == "__main__":
    sys.exit(main())
