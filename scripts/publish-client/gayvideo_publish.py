"""Client for the GayVideo.fun publish API (docs/API.md).

Standard library only, so it runs as-is on Google Colab and on a laptop
(Python 3.8+). Two ways to use it:

    from gayvideo_publish import GayVideoClient
    client = GayVideoClient(token="gv_...")          # or env GAYVIDEO_API_TOKEN
    result = client.publish(
        title="Bevis Trần Đức Vương – My love story",
        mirrors={"dood": "abc123", "voe": "xyz789"},
        tags=["Bevis", "Couple"],
        category="couple",
        thumbnail="cover.jpg",                        # local file or https URL
        publish=False,                                # True = public right away
    )
    print(result["video"]["url"])

Also announce it on X (@Gayvideofun, through Buffer): pass an English
caption and the source video; a short clip (X_CLIP_SECONDS, from the
server) is cut here with ffmpeg, uploaded, and posted once the video is
public, with a link to its page:

    client.publish(..., publish=True,
                   x_caption="New: Bevis & Pinky's love story 🔥",
                   x_video="/content/full.mp4", x_clip_start=30)

    python gayvideo_publish.py --title "..." --mirror dood:abc123 --tag Bevis --publish \
        --x-caption "New video" --x-video full.mp4
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple, Union

DEFAULT_BASE_URL = "https://gayvideo.fun"
MAX_THUMBNAIL_BYTES = 8 * 1024 * 1024

Mirrors = Union[Mapping[str, str], Iterable[Tuple[str, str]]]


class PublishError(Exception):
    """The API refused the request. `status`, `code` and `body` say why."""

    def __init__(self, status: int, code: str, message: str, body: Optional[dict] = None):
        super().__init__(f"{status} {code}: {message}")
        self.status = status
        self.code = code
        self.body = body or {}


class GayVideoClient:
    def __init__(
        self,
        token: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 120,
    ) -> None:
        self.token = (token or os.environ.get("GAYVIDEO_API_TOKEN") or "").strip()
        if not self.token.startswith("gv_"):
            raise ValueError("Missing token: pass token='gv_...' or set GAYVIDEO_API_TOKEN")
        self.base_url = (base_url or os.environ.get("GAYVIDEO_API_URL") or DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout

    def _request(
        self,
        method: str,
        path: str,
        body: Optional[dict] = None,
        *,
        upload: Optional[str] = None,
    ) -> dict:
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json",
            "User-Agent": "gayvideo-publish/2",
        }
        data: Any = None
        handle = None
        if upload is not None:
            # Streamed from disk, not read into memory.
            handle = open(upload, "rb")
            data = handle
            headers["Content-Type"] = "video/mp4"
            headers["Content-Length"] = str(os.path.getsize(upload))
        elif body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.base_url + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            raw = error.read().decode("utf-8", "replace")
            try:
                payload = json.loads(raw)
            except ValueError:
                payload = {}
            info = payload.get("error", {}) if isinstance(payload, dict) else {}
            raise PublishError(
                error.code,
                info.get("code", "http_error"),
                info.get("message", raw[:200] or error.reason),
                payload if isinstance(payload, dict) else None,
            ) from None
        finally:
            if handle is not None:
                handle.close()

    def meta(self) -> dict:
        """Enabled hosts and category slugs; also checks the token works."""
        return self._request("GET", "/api/v1/meta")

    def get_video(self, video_id: str) -> dict:
        return self._request("GET", f"/api/v1/videos/{video_id}")["video"]

    def upload_clip(self, clip_path: str) -> dict:
        """Upload an MP4 made by cut_clip(); returns {"clipId", "bytes", "seconds"}."""
        return self._request("POST", "/api/v1/clips", upload=clip_path)

    def clip_seconds(self) -> int:
        """X_CLIP_SECONDS: from the environment if set, else the server's (0 = full video)."""
        local = os.environ.get("X_CLIP_SECONDS", "").strip()
        if local:
            return int(local)
        return int(self.meta().get("x", {}).get("clipSeconds", 120))

    def publish(
        self,
        title: str,
        mirrors: Mirrors,
        *,
        slug: Optional[str] = None,
        description: Optional[str] = None,
        category: Optional[str] = None,
        tags: Optional[Sequence[str]] = None,
        quality: Optional[str] = None,
        thumbnail: Optional[str] = None,
        publish: bool = False,
        x_caption: Optional[str] = None,
        x_video: Optional[str] = None,
        x_clip: Optional[str] = None,
        x_clip_start: float = 0,
        x_clip_seconds: Optional[int] = None,
        x_label: Optional[str] = "gayvideo.fun",
    ) -> dict:
        """Create the video, or update the draft its files already belong to.

        For X, pass x_caption (English) and either x_video (the source file;
        a clip is cut from x_clip_start, with x_label such as "gayvideo.fun"
        burned in at the bottom; None = no text) or x_clip (an MP4 you cut yourself).
        The X post goes out once the video is public; it never blocks the web.

        Returns {"created": bool, "video": {...}, "x": {...}?, "warnings": [...]}.
        Raises PublishError on refusal (e.g. 409 already_published).
        """
        clip_id = None
        if x_caption:
            if not (x_video or x_clip):
                raise ValueError("x_caption needs x_video (source to cut) or x_clip (ready MP4)")
            if x_clip:
                clip_id = self.upload_clip(x_clip)["clipId"]
            else:
                seconds = self.clip_seconds() if x_clip_seconds is None else x_clip_seconds
                workdir = tempfile.mkdtemp(prefix="gv-clip-")
                try:
                    clip_path = cut_clip(x_video, os.path.join(workdir, "clip.mp4"),
                                         start=x_clip_start, seconds=seconds, label=x_label)
                    clip_id = self.upload_clip(clip_path)["clipId"]
                finally:
                    shutil.rmtree(workdir, ignore_errors=True)

        pairs = list(mirrors.items()) if isinstance(mirrors, Mapping) else list(mirrors)
        body: Dict[str, Any] = {
            "title": title,
            "mirrors": [{"host": host, "fileCode": code} for host, code in pairs],
            "publish": publish,
        }
        if slug:
            body["slug"] = slug
        if description is not None:
            body["description"] = description
        if category:
            body["categorySlug"] = category
        if tags is not None:
            body["tags"] = list(tags)
        if quality:
            body["quality"] = quality
        if thumbnail:
            if thumbnail.startswith(("http://", "https://")):
                body["thumbnailUrl"] = thumbnail
            else:
                body["thumbnailDataUrl"] = image_data_url(thumbnail)
        if clip_id:
            body["x"] = {"caption": x_caption, "clipId": clip_id}
        return self._request("POST", "/api/v1/videos", body)


# Fonts tried for the clip label, in order; without one, ffmpeg's fontconfig
# picks a default sans font.
LABEL_FONTS = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
)


def _filter_value(value: str) -> str:
    """Escape a filter option value for both ffmpeg parsing levels: the
    option string (\\ ' :) and then the filter graph (\\ ' [ ] , ;)."""
    for level in ("\\':", "\\'[],;"):
        value = "".join("\\" + c if c in level else c for c in value)
    return value


def label_filter(label: str) -> str:
    """A drawtext filter that writes label at the bottom centre of the clip,
    white on a translucent box, sized to the frame (works for portrait too)."""
    font = next((f for f in LABEL_FONTS if os.path.exists(f)), None)
    font_opt = f"fontfile={_filter_value(font)}:" if font else "font=Sans:"
    return (
        f"drawtext={font_opt}expansion=none:text={_filter_value(label.strip())}:fontcolor=white:"
        "fontsize='max(16,min(w,h)/18)':box=1:boxcolor=black@0.45:boxborderw=10:"
        "x='(w-text_w)/2':y='h-text_h-min(w,h)/14'"
    )


def cut_clip(source: str, output: str, *, start: float = 0, seconds: int = 120,
             label: Optional[str] = None) -> str:
    """Cut and re-encode a clip X accepts: MP4, H.264 High (yuv420p), AAC-LC
    stereo 44.1 kHz, longest side at most 1280 and 60 fps, moov at the start
    (+faststart). seconds=0 keeps the whole video. label (e.g. "gayvideo.fun")
    is burned in at the bottom so the site stays visible if the clip is
    re-shared. Needs ffmpeg on PATH (Colab has it; Windows: winget install
    Gyan.FFmpeg; macOS: brew install ffmpeg).
    """
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg is not installed (see docs/API.md)")
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
    if start:
        command += ["-ss", str(start)]
    command += ["-i", source]
    if seconds:
        command += ["-t", str(seconds)]
    # Longest side at most 1280 (720p landscape or portrait), even sizes.
    video_filter = "scale='if(gte(iw,ih),min(1280,iw),-2)':'if(gte(iw,ih),-2,min(1280,ih))'"
    if label and label.strip():
        video_filter += "," + label_filter(label)
    command += [
        "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", video_filter,
        "-fpsmax", "60",
        "-c:v", "libx264", "-profile:v", "high", "-level:v", "4.1", "-pix_fmt", "yuv420p",
        "-preset", "medium", "-crf", "23", "-maxrate", "6M", "-bufsize", "12M",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
        "-movflags", "+faststart",
        output,
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0 or not os.path.exists(output):
        raise RuntimeError(f"ffmpeg failed: {result.stderr.strip()[-500:]}")
    return output


def image_data_url(path: str) -> str:
    size = os.path.getsize(path)
    if size > MAX_THUMBNAIL_BYTES:
        raise ValueError(f"{path} is {size} bytes; thumbnails are limited to 8 MB")
    mime = mimetypes.guess_type(path)[0] or ""
    if mime not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
        raise ValueError(f"{path}: use a .jpg, .png, .webp or .gif image")
    with open(path, "rb") as handle:
        return f"data:{mime};base64," + base64.b64encode(handle.read()).decode("ascii")


def _parse_mirror(value: str) -> Tuple[str, str]:
    host, sep, code = value.partition(":")
    if not sep or not host or not code:
        raise argparse.ArgumentTypeError("use host:fileCode, e.g. dood:abc123")
    return host.strip(), code.strip()


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Publish a video to GayVideo.fun")
    parser.add_argument("--title", required=True)
    parser.add_argument("--mirror", action="append", type=_parse_mirror, required=True,
                        help="host:fileCode, repeat per host (dood, voe, earnvids)")
    parser.add_argument("--slug")
    parser.add_argument("--description")
    parser.add_argument("--category", help="category slug (see --meta)")
    parser.add_argument("--tag", action="append", dest="tags")
    parser.add_argument("--quality", choices=["HD", "4K"])
    parser.add_argument("--thumbnail", help="local image file or https URL")
    parser.add_argument("--publish", action="store_true", help="make it public now (default: draft)")
    parser.add_argument("--x-caption", help="also post on X with this English caption")
    parser.add_argument("--x-video", help="source video to cut the X clip from")
    parser.add_argument("--x-clip", help="a ready MP4 clip (skips cutting)")
    parser.add_argument("--x-start", type=float, default=0, help="clip start, in seconds")
    parser.add_argument("--x-seconds", type=int, default=None,
                        help="clip length (default: X_CLIP_SECONDS from the server; 0 = full)")
    parser.add_argument("--x-label", default="gayvideo.fun",
                        help='text burned into the bottom of the X clip ("" = none)')
    parser.add_argument("--base-url", default=None)
    args = parser.parse_args(argv)

    client = GayVideoClient(base_url=args.base_url)
    try:
        result = client.publish(
            args.title,
            args.mirror,
            slug=args.slug,
            description=args.description,
            category=args.category,
            tags=args.tags,
            quality=args.quality,
            thumbnail=args.thumbnail,
            publish=args.publish,
            x_caption=args.x_caption,
            x_video=args.x_video,
            x_clip=args.x_clip,
            x_clip_start=args.x_start,
            x_clip_seconds=args.x_seconds,
            x_label=args.x_label or None,
        )
    except PublishError as error:
        print(f"Refused: {error}", file=sys.stderr)
        return 1
    video = result["video"]
    state = "published" if video["published"] else "draft (approve it in /admin/review)"
    print(f"{'Created' if result['created'] else 'Updated'}: {client.base_url}{video['url']} [{state}]")
    if "x" in result:
        print(f"X: {result['x']['status']} (posted through Buffer once public)")
    for warning in result.get("warnings", []):
        print(f"warning: {warning}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
