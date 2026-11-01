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

    python gayvideo_publish.py --title "..." --mirror dood:abc123 --tag Bevis --publish
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import sys
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

    def _request(self, method: str, path: str, body: Optional[dict] = None) -> dict:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        request = urllib.request.Request(
            self.base_url + path,
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/json",
                "User-Agent": "gayvideo-publish/1",
                **({"Content-Type": "application/json"} if data is not None else {}),
            },
        )
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

    def meta(self) -> dict:
        """Enabled hosts and category slugs; also checks the token works."""
        return self._request("GET", "/api/v1/meta")

    def get_video(self, video_id: str) -> dict:
        return self._request("GET", f"/api/v1/videos/{video_id}")["video"]

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
    ) -> dict:
        """Create the video, or update the draft its files already belong to.

        Returns {"created": bool, "video": {...}, "warnings": [...]}.
        Raises PublishError on refusal (e.g. 409 already_published).
        """
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
        return self._request("POST", "/api/v1/videos", body)


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
        )
    except PublishError as error:
        print(f"Refused: {error}", file=sys.stderr)
        return 1
    video = result["video"]
    state = "published" if video["published"] else "draft (approve it in /admin/review)"
    print(f"{'Created' if result['created'] else 'Updated'}: {client.base_url}{video['url']} [{state}]")
    for warning in result.get("warnings", []):
        print(f"warning: {warning}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
