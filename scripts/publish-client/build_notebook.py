"""Builds colab_publish.ipynb from the cells below plus the current
gayvideo_publish.py and colab_helpers.py (embedded with %%writefile, so the
notebook needs nothing from this private repo at run time).

    python3 scripts/publish-client/build_notebook.py          # write
    python3 scripts/publish-client/build_notebook.py --check  # fail if stale
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
NOTEBOOK = HERE / "colab_publish.ipynb"

GUIDE = """# Đăng video lên GayVideo.fun (web + X) từ Google Photos

Notebook này lấy video từ **link chia sẻ Google Photos** `photos.app.goo.gl/…` (một video hoặc một album) rồi xử lý từng video. Link Google Drive chỉ là **phương án phụ**, dùng khi Google Photos chặn.

1. tải **file gốc**:
   - theo redirect của link rút gọn tới trang chia sẻ;
   - đọc các URL `lh3.googleusercontent.com` của video;
   - tải bản gốc bằng hậu tố `=dv`;
   - kiểm tra bằng **ffprobe** rằng file là video thật, không phải ảnh xem trước.
2. gắn watermark GayVideo.fun (giống luồng migration hiện tại);
3. upload lên **host chính**, và các host phụ nếu bật, để lấy mã file;
4. tạo thumbnail;
5. gọi **publish API**: lên web, và nếu bật thì vào hàng đợi đăng **X @Gayvideofun** qua Buffer, với clip ngắn cắt bằng ffmpeg (có logo và chữ `gayvideo.fun` ở cạnh dưới) và caption tiếng Anh kèm link bài viết.

### Chuẩn bị (một lần)
- **Colab Secrets** (biểu tượng 🔑 bên trái, bật *Notebook access* cho từng secret):
  - `GAYVIDEO_API_TOKEN`: token tạo trên VPS (`npm run api-token -- create …`);
  - `HOST_DOOD_API_KEY`, `HOST_VOE_API_KEY`, `HOST_EARNVIDS_API_KEY`: key của các host. Bắt buộc có key của host chính; key host phụ chỉ cần khi bật `UPLOAD_MIRRORS`.
- **Link Google Photos** phải bật chia sẻ: *Chia sẻ → Tạo đường liên kết*.

### Cách dùng
1. Chạy ô **Cài đặt**.
2. Chỉnh ô **Cấu hình**.
3. Dán link vào ô **Danh sách video**, mỗi dòng một link, hoặc trỏ tới file CSV.
4. **Đánh dấu ô xác nhận.** Không xác nhận thì notebook không chạy.
5. Chạy ô **Đăng**. Cuối cùng có bảng kết quả cho từng video.

### Cam kết của notebook
- **Không đăng trùng:** mỗi video đã đăng được ghi vào sổ `publish_log.csv` trên Google Drive (theo link và theo sha256 của file). Chạy lại thì các video đó được bỏ qua.
- **Lỗi một video không dừng cả lô:** lỗi được ghi vào bảng, rồi notebook làm tiếp video sau.
- **Dọn file tạm:** file tạm của mỗi video bị xoá ngay sau khi xong video đó.
- **Không lộ key:** key được đọc từ Colab Secrets và **không in ra**; thông báo lỗi luôn che key.

### Nếu Google Photos chặn
Google Photos không có API công khai để tải video từ link chia sẻ, và yt-dlp cũng không hỗ trợ (chỉ hỗ trợ Google Drive). Notebook dùng bộ đọc riêng trong `colab_helpers.py`:
- mỗi bước tự thử lại 3 lần;
- báo lỗi rõ cho từng link: chưa chia sẻ hoặc bị chặn đăng nhập, link đã xoá, album không có video, hoặc trang đã đổi giao diện;
- khi Google đổi giao diện, sửa `photos_media_urls()` và HTML mẫu trong `testdata/`, rồi chạy test (`python3 -m unittest discover -s scripts/publish-client`).

Nếu một link vẫn báo lỗi tải:
1. tải video đó lên **Google Drive**;
2. chia sẻ *Bất kỳ ai có đường liên kết*;
3. dán link Drive vào danh sách thay cho link Photos.
"""

SETUP = """#@title 1. Cài đặt (chạy một lần mỗi phiên)
!apt-get -qq install -y librsvg2-bin > /dev/null
!pip -q install gdown requests pillow
import importlib, sys
sys.path.insert(0, "/content")
for name in ("colab_helpers", "gayvideo_publish"):
    if name in sys.modules:
        importlib.reload(sys.modules[name])
print("OK: ffmpeg", "có" if __import__("shutil").which("ffmpeg") else "THIẾU")
"""

CONFIG = """#@title 2. Cấu hình
API_URL = "https://gayvideo.fun"  #@param {type:"string"}
#@markdown Lên web ngay (bỏ chọn = bản nháp để duyệt trong /admin/review; bài X chờ tới khi duyệt).
PUBLISH = True  #@param {type:"boolean"}
#@markdown Đăng thêm lên X @Gayvideofun qua Buffer (clip ngắn + link). Độ dài clip theo `X_CLIP_SECONDS` trên server.
POST_TO_X = True  #@param {type:"boolean"}
#@markdown Caption X mặc định (tiếng Anh) khi dòng không có caption riêng; `{title}` = tiêu đề bỏ dấu.
X_CAPTION_TEMPLATE = "New video: {title} 🔥"  #@param {type:"string"}
#@markdown Clip X bắt đầu từ giây thứ (khi dòng không ghi riêng).
CLIP_START = 0  #@param {type:"number"}
#@markdown Chữ in ở cạnh dưới clip X (logo đã có sẵn nhờ watermark); để trống = không in.
X_LABEL = "gayvideo.fun"  #@param {type:"string"}
#@markdown Gắn watermark GayVideo.fun trước khi upload (giống luồng hiện tại).
WATERMARK = True  #@param {type:"boolean"}
#@markdown Logo watermark (SVG hoặc PNG): mặc định lấy từ GitHub, nhánh main. Có thể thay bằng URL khác hoặc đường dẫn file, ví dụ trên Drive.
LOGO_URL = "https://raw.githubusercontent.com/ronganminh/stream-video/main/scripts/publish-client/assets/logo-mark.svg"  #@param {type:"string"}
#@markdown Upload thêm lên các host phụ (cần key trong Secrets).
UPLOAD_MIRRORS = False  #@param {type:"boolean"}
#@markdown Lấy thumbnail ở giây thứ (-1 = tự chọn, khoảng 20% thời lượng).
THUMB_AT = -1  #@param {type:"number"}
#@markdown Sổ ghi các video đã đăng (để không đăng trùng). Nên để trên Drive.
MOUNT_DRIVE = True  #@param {type:"boolean"}
LEDGER_PATH = "/content/drive/MyDrive/gayvideo/publish_log.csv"  #@param {type:"string"}

if MOUNT_DRIVE:
    from google.colab import drive
    drive.mount("/content/drive")
elif LEDGER_PATH.startswith("/content/drive"):
    LEDGER_PATH = "/content/publish_log.csv"
    print("Cảnh báo: không mount Drive, sổ ghi chỉ tồn tại trong phiên này:", LEDGER_PATH)
"""

INPUT = '''#@title 3. Danh sách video
#@markdown Mỗi dòng: `link | tiêu đề | tag1, tag2 | category | caption X (tiếng Anh) | giây bắt đầu clip`. Chỉ link là bắt buộc. Album → mỗi video một bài, tiêu đề tự thêm "– P1, P2…". Dòng bắt đầu bằng `#` bị bỏ qua.
LINKS = """
# Dòng mẫu (bắt đầu bằng # nên không được đăng). Xoá dấu # và thay bằng nội dung thật:
# https://photos.app.goo.gl/XXXXXXXX | Tiêu đề video | tag1, tag2 | category | English caption | 0
"""
#@markdown Hoặc đọc từ CSV (cột: `link,title,tags,category,x_caption,clip_start`); để trống nếu dùng ô trên.
CSV_PATH = ""  #@param {type:"string"}

from colab_helpers import parse_csv, parse_lines
JOBS = parse_csv(CSV_PATH) if CSV_PATH.strip() else parse_lines(LINKS)
print(f"{len(JOBS)} link")
for job in JOBS:
    print(" -", job.link, "|", job.title or "(tiêu đề tự động)")
'''

CONSENT_MD = """### 4. Xác nhận (bắt buộc)
Trước khi đăng, bạn phải xác nhận **cả hai** điều sau cho **mọi** video trong danh sách:
1. Bạn có quyền đăng các video này (bạn là chủ sở hữu, hoặc được chủ sở hữu cho phép).
2. Mọi người xuất hiện trong video đều **từ 18 tuổi trở lên** và đã **đồng ý** quay và đăng video.

Không đánh dấu ô dưới đây thì ô Đăng sẽ dừng ngay. Thời điểm xác nhận được ghi vào sổ cùng với từng video.
"""

CONSENT = """#@title Tôi xác nhận có quyền đăng các video này; mọi người trong video đều trên 18 tuổi và đồng ý.
XAC_NHAN = False  #@param {type:"boolean"}
import datetime
XAC_NHAN_LUC = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if XAC_NHAN else ""
print("Đã xác nhận lúc", XAC_NHAN_LUC) if XAC_NHAN else print("Chưa xác nhận: ô Đăng sẽ không chạy.")
"""

RUN = """#@title 5. Đăng
import shutil, tempfile
from pathlib import Path

import pandas as pd
from google.colab import userdata
from IPython.display import display

from colab_helpers import (HostUploader, Ledger, LogoError, SourceError, ascii_text, load_logo,
                           make_thumbnail, probe, redact, register_secret, sha256_file, source_items,
                           watermark)
from gayvideo_publish import GayVideoClient, PublishError

if not globals().get("XAC_NHAN"):
    raise SystemExit("Dừng: hãy đánh dấu ô xác nhận ở bước 4 rồi chạy lại ô đó.")

# Kiểm tra logo trước khi đụng tới video nào.
logo = None
if WATERMARK:
    try:
        logo = load_logo(LOGO_URL, Path("/content/gv-logo"))
    except LogoError as error:
        raise SystemExit(f"Dừng: {error} Sửa LOGO_URL ở bước 2 (hoặc tắt WATERMARK) rồi chạy lại.")
    print("Logo OK:", logo.name)


def secret(name):
    try:
        return register_secret(userdata.get(name))
    except Exception:
        return None


client = GayVideoClient(token=secret("GAYVIDEO_API_TOKEN"), base_url=API_URL, timeout=900)
meta = client.meta()
primary = next(host["id"] for host in meta["hosts"] if host["isPrimary"])
targets = [primary] + ([h["id"] for h in meta["hosts"] if not h["isPrimary"]] if UPLOAD_MIRRORS else [])
uploaders = {}
for host in targets:
    key = secret({"dood": "HOST_DOOD_API_KEY", "voe": "HOST_VOE_API_KEY",
                  "earnvids": "HOST_EARNVIDS_API_KEY"}.get(host, ""))
    if key:
        uploaders[host] = HostUploader(host, key)
    elif host == primary:
        raise SystemExit(f"Thiếu key của host chính ({host}) trong Colab Secrets.")
    else:
        print(f"Bỏ qua host phụ {host}: chưa có key trong Secrets.")
categories = {c["slug"] for c in meta["categories"]}
if POST_TO_X and not meta.get("x", {}).get("enabled"):
    print("Lưu ý: server chưa cấu hình Buffer; bài X sẽ chờ trong hàng đợi.")
print(f"Host chính: {primary}; upload lên: {', '.join(uploaders)}")


ledger = Ledger(LEDGER_PATH)
results = []


def note(job, title, status, detail="", url="", x=""):
    results.append({"link": job.link, "tiêu đề": title, "trạng thái": status,
                    "link web": url, "X": x, "ghi chú": redact(detail, 300)})


for job in JOBS:
    try:
        album_title, items = source_items(job.link)
    except Exception as error:  # one bad link never stops the batch
        note(job, job.title, "lỗi", error)
        ledger.add(link=job.link, status="error", error=redact(error))
        continue
    if not items:
        note(job, job.title, "lỗi", "Không có video nào trong link.")
        continue

    for index, item in enumerate(items):
        base_title = job.title or album_title or f"Video {datetime.date.today():%d-%m-%Y}"
        title = f"{base_title} – P{index + 1}" if len(items) > 1 else base_title
        if item.key in ledger.done_keys():
            note(job, title, "bỏ qua", "Đã đăng trước đó (theo link).")
            continue
        work = Path(tempfile.mkdtemp(prefix="gv-job-"))
        codes, digest = {}, ""
        try:
            print(f"▶ {title}: tải video…")
            source = item.download(work / "source.mp4")
            digest = sha256_file(source)
            if digest in ledger.done_hashes():
                note(job, title, "bỏ qua", "Đã đăng trước đó (cùng file).")
                ledger.add(link=job.link, item_key=item.key, sha256=digest, title=title, status="duplicate")
                continue
            info = probe(source)
            upload_file = watermark(source, work / "upload.mp4", logo, info["width"]) if WATERMARK else source

            warnings = []
            for host, uploader in uploaders.items():
                print(f"  upload {host}…")
                try:
                    codes[host] = uploader.upload(upload_file, title, job.tags)
                except Exception as error:
                    if host == primary:
                        raise
                    warnings.append(f"{host}: {redact(error, 150)}")

            thumb = make_thumbnail(source, work / "thumb.jpg", info["duration"], None if THUMB_AT < 0 else THUMB_AT)
            category = job.category if job.category in categories else None
            if job.category and not category:
                warnings.append(f"category '{job.category}' không tồn tại, đã bỏ")
            caption = job.x_caption or X_CAPTION_TEMPLATE.format(title=ascii_text(title))
            print("  publish…")
            result = client.publish(
                title, codes, tags=job.tags or None, category=category, thumbnail=str(thumb), publish=PUBLISH,
                x_caption=caption if POST_TO_X else None, x_video=str(upload_file) if POST_TO_X else None,
                x_clip_start=job.clip_start if job.clip_start is not None else CLIP_START,
                x_label=X_LABEL.strip() or None,
            )
            video = result["video"]
            url = API_URL.rstrip("/") + video["url"]
            x_status = (result.get("x") or {}).get("status", "")
            ledger.add(link=job.link, item_key=item.key, sha256=digest, title=title, video_id=video["id"],
                       url=url, x=x_status, status="done", error=f"xác nhận {XAC_NHAN_LUC}")
            note(job, title, "đã đăng" if video["published"] else "bản nháp", "; ".join(warnings + result["warnings"]),
                 url, x_status)
        except Exception as error:
            detail = f"{error.code}: {error}" if isinstance(error, PublishError) else str(error)
            if codes:
                detail += f" (đã upload: {codes}; có thể đăng lại thủ công bằng mã file này)"
            note(job, title, "lỗi", detail)
            ledger.add(link=job.link, item_key=item.key, sha256=digest, title=title, status="error", error=redact(detail))
        finally:
            shutil.rmtree(work, ignore_errors=True)

pd.set_option("display.max_colwidth", 120)
display(pd.DataFrame(results))
print("Sổ ghi:", LEDGER_PATH)
"""

HELP_MD = """### Gặp lỗi?
- **"Google Photos …"**: link chưa chia sẻ công khai, hoặc Google chặn tải tự động. Dùng link Google Drive thay thế (xem đầu notebook).
- **"Thiếu key …"**: thêm secret tương ứng trong 🔑 Secrets và bật *Notebook access*.
- **`401 unauthorized`**: token sai hoặc đã bị thu hồi. Tạo token mới trên VPS: `npm run api-token -- create <email> colab`.
- **Lỗi sau khi đã upload host:** bảng kết quả có ghi mã file đã upload. Chạy lại notebook sẽ upload lại; muốn tránh thì đăng thủ công bằng mã file đó (xem `docs/API.md`).
- **Xem bài X:** `GET /api/v1/videos/<id>` (trường `social`), hoặc trên VPS chạy `npm run social:status`.
"""


def code_cell(source: str) -> dict:
    return {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": _lines(source)}


def markdown_cell(source: str) -> dict:
    return {"cell_type": "markdown", "metadata": {}, "source": _lines(source)}


def _lines(text: str) -> list:
    lines = text.splitlines(keepends=True)
    if lines and lines[-1].endswith("\n"):
        lines[-1] = lines[-1][:-1]
    return lines


def embedded(path: Path, title: str) -> dict:
    body = path.read_text(encoding="utf-8")
    return code_cell(f"%%writefile /content/{path.name}\n# {title}: tự sinh từ repo (build_notebook.py), đừng sửa ở đây.\n{body}")


def build() -> str:
    notebook = {
        "nbformat": 4,
        "nbformat_minor": 0,
        "metadata": {
            "colab": {"provenance": [], "toc_visible": True},
            "kernelspec": {"name": "python3", "display_name": "Python 3"},
            "language_info": {"name": "python"},
        },
        "cells": [
            markdown_cell(GUIDE),
            markdown_cell("### Thư viện (tự sinh: hai ô dưới ghi file client và helpers vào /content)"),
            embedded(HERE / "gayvideo_publish.py", "Client publish API"),
            embedded(HERE / "colab_helpers.py", "Helpers tải/upload"),
            code_cell(SETUP),
            code_cell(CONFIG),
            code_cell(INPUT),
            markdown_cell(CONSENT_MD),
            code_cell(CONSENT),
            code_cell(RUN),
            markdown_cell(HELP_MD),
        ],
    }
    return json.dumps(notebook, ensure_ascii=False, indent=1) + "\n"


def main(argv: list) -> int:
    content = build()
    if "--check" in argv:
        if not NOTEBOOK.exists() or NOTEBOOK.read_text(encoding="utf-8") != content:
            print("colab_publish.ipynb is stale: run python3 scripts/publish-client/build_notebook.py", file=sys.stderr)
            return 1
        return 0
    NOTEBOOK.write_text(content, encoding="utf-8")
    print(f"wrote {NOTEBOOK}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
