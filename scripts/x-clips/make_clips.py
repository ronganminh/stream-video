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

@dataclass
class Source:
    name: str
    label: str
    watermark: bool
    # Returns (url, extra ffmpeg input options); raises with a reason.
    resolve: Callable[[], Tuple[str, List[str]]]


def drive_file_id(url: str) -> Optional[str]:
    match = re.search(r"/file/d/([A-Za-z0-9_-]+)", url) or re.search(r"[?&]id=([A-Za-z0-9_-]+)", url)
    return match.group(1) if match else None


def drive_folder_id(url: str) -> Optional[str]:
    match = re.search(r"/folders/([A-Za-z0-9_-]+)", url)
    return match.group(1) if match else None


class Drive:
    """Google Drive reads: the Drive API with a service account (no anonymous
    quota, folders listable), else the public download link (files only)."""

    def __init__(self, service_account_json: str = ""):
        self.info = json.loads(service_account_json) if service_account_json.strip() else None
        self._credentials = None

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

    def folder_video(self, folder_id: str) -> str:
        """The largest video file in a folder."""
        import requests

        response = requests.get(
            "https://www.googleapis.com/drive/v3/files",
            params={"q": f"'{folder_id}' in parents and trashed=false", "fields": "files(id,mimeType,size)",
                    "supportsAllDrives": "true", "includeItemsFromAllDrives": "true", "pageSize": "200"},
            headers={"Authorization": f"Bearer {self.token()}"}, timeout=60)
        if not response.ok:
            raise RuntimeError(f"Drive API HTTP {response.status_code} khi đọc thư mục")
        videos = [item for item in response.json().get("files", []) if VIDEO_MIME.match(item.get("mimeType", ""))]
        if not videos:
            raise RuntimeError("thư mục Drive không có file video")
        return max(videos, key=lambda item: int(item.get("size") or 0))["id"]

    def resolve(self, link: str) -> Tuple[str, List[str]]:
        file_id = drive_file_id(link)
        folder_id = None if file_id else drive_folder_id(link)
        if not file_id and not folder_id:
            raise RuntimeError("link Drive không có mã file/thư mục")
        if self.info:
            if folder_id:
                file_id = self.folder_video(folder_id)
            url = (f"https://www.googleapis.com/drive/v3/files/{file_id}"
                   "?alt=media&supportsAllDrives=true&acknowledgeAbuse=true")
            mask(url)
            return url, ["-headers", f"Authorization: Bearer {self.token()}\r\n"]
        if folder_id:
            raise RuntimeError("link thư mục cần GDRIVE_SERVICE_ACCOUNT_JSON")
        url = f"https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t"
        mask(url)
        return url, []


def earnvids_resolver(code: str) -> Callable[[], Tuple[str, List[str]]]:
    def resolve() -> Tuple[str, List[str]]:
        sys.path.insert(0, str(REPO / "scripts" / "video-migration"))
        from common import EarnVidsApi  # migration client: q=o (original), MP4

        key = os.environ.get("HOST_EARNVIDS_API_KEY", "")
        url = EarnVidsApi(key).direct_link(code)
        mask(url)
        return url, []

    return resolve


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
        sources.append(Source(host, label, False, earnvids_resolver(codes[host])))
    links = index.drive_links(row)
    if not row:
        skipped.append("Google Drive: không tìm thấy video trong migration-log.csv")
    elif not links:
        skipped.append("Google Drive: videos.csv không có link cho video này")
    elif drive is not None:
        for number, link in enumerate(links[:3], 1):
            sources.append(Source("drive", f"Google Drive #{number}", True,
                                  lambda link=link: drive.resolve(link)))
    return sources, skipped


# --- ffmpeg ----------------------------------------------------------------------

def filter_value(value: str) -> str:
    """Escape for both ffmpeg parsing levels (option string, then filter graph)."""
    for level in ("\\':", "\\'[],;"):
        value = "".join("\\" + char if char in level else char for char in value)
    return value


def ffmpeg_args(url: str, extra: List[str], start: float, seconds: float, output: Path,
                watermark: bool, preset: str = "medium") -> List[str]:
    """Same output as the notebook's clips: H.264 High yuv420p, AAC-LC stereo
    44.1 kHz, longest side <= 1280, <= 60 fps, +faststart."""
    args = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y"]
    if url.startswith(("http://", "https://")):
        args += ["-rw_timeout", "30000000", "-reconnect", "1", "-reconnect_on_network_error", "1",
                 "-reconnect_delay_max", "10"]
    args += extra
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


def probe_duration(path: Path) -> float:
    result = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                             str(path)], capture_output=True, text=True, timeout=120)
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0


def cut(source: Source, post: dict, output: Path, run=subprocess.run) -> float:
    url, extra = source.resolve()
    start = 0 if post["mode"] == "full" else post["start"]
    command = ffmpeg_args(url, extra, start, post["seconds"], output, source.watermark)
    result = run(command, capture_output=True, text=True, timeout=30 * 60)
    if result.returncode != 0:
        tail = " ".join((result.stderr or "").strip().splitlines()[-3:])
        raise RuntimeError(f"ffmpeg lỗi: {clean(tail, 300)}")
    seconds = probe_duration(output)
    if seconds < 1:
        raise RuntimeError("clip tạo ra không hợp lệ")
    return seconds


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
        for source in sources:
            output = work / f"{post['postId']}.mp4"
            try:
                seconds = cutter(source, post, output)
                clip = client.upload_clip(str(output))
                client._request("POST", f"/api/v1/social/{post['postId']}/clip",
                                {"clipId": clip["clipId"], "source": source.name})
                log(f"    ok from {source.label}: {seconds:.0f}s, {output.stat().st_size / 1048576:.1f} MB, "
                    f"{time.monotonic() - started:.0f}s")
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
    if not posts:
        return 0
    index = MigrationIndex.load(Path(os.environ.get("MIGRATION_DATA", "migration-data")))
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
