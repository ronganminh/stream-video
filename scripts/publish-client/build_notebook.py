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
5. **caption AI** (nếu bật, cần GPU T4): JoyCaption xem 3–5 khung hình, mô hình chữ viết caption tiếng Anh kiểu nhá hàng theo giọng văn trong file caption mẫu của bạn, kèm gợi ý tag. Mô tả khung hình chỉ dùng nội bộ: không đăng, không gửi lên server. Mọi caption đều qua bộ lọc từ cấm và giới hạn ký tự của X;
6. **bạn duyệt** từng caption (sửa, hoặc bỏ chọn đăng X);
7. gọi **publish API**: lên web, và nếu bật thì vào hàng đợi đăng **X @Gayvideofun** qua Buffer, với clip ngắn cắt bằng ffmpeg (có logo và chữ `gayvideo.fun` ở cạnh dưới) và caption đã duyệt, kèm link bài viết.

### Chuẩn bị (một lần)
- **Colab Secrets** (biểu tượng 🔑 bên trái, bật *Notebook access* cho từng secret):
  - `GAYVIDEO_API_TOKEN`: token tạo trên VPS (`npm run api-token -- create …`);
  - `HOST_DOOD_API_KEY`, `HOST_VOE_API_KEY`, `HOST_EARNVIDS_API_KEY`: key của các host. Bắt buộc có key của host chính; key host phụ chỉ cần khi bật `UPLOAD_MIRRORS`;
  - chỉ khi dùng API để viết caption: `ANTHROPIC_API_KEY` hoặc `OPENAI_API_KEY`.
- **GPU cho caption AI:** *Runtime → Change runtime type → T4 GPU*. Lần đầu notebook tải JoyCaption (~17 GB) và Qwen3-8B (~16 GB) từ Hugging Face rồi nén 4-bit khi nạp, mất vài phút.
- **Caption mẫu:** `CAPTION_EXAMPLES` (mặc định `MyDrive/gayvideo/caption_examples.txt`), mỗi dòng một caption bạn chọn. Lần đầu notebook tự tạo file này từ mẫu khởi đầu để bạn sửa.
- **Link Google Photos** phải bật chia sẻ: *Chia sẻ → Tạo đường liên kết*.

### Cách dùng
1. Chạy ô **Cài đặt**.
2. Chỉnh ô **Cấu hình**.
3. Dán link vào ô **Danh sách video**, mỗi dòng một link, hoặc trỏ tới file CSV.
4. **Đánh dấu ô xác nhận.** Không xác nhận thì notebook không chạy.
5. Chạy ô **Chuẩn bị**: tải video, đề xuất caption (AI nếu bật).
6. Chạy ô **Duyệt caption**: sửa trực tiếp, hoặc bỏ chọn *Đăng X* (video vẫn lên web).
7. Chạy ô **Đăng**. Cuối cùng có bảng kết quả cho từng video.

### Cam kết của notebook
- **Không đăng trùng:** mỗi video đã đăng được ghi vào sổ `publish_log.csv` trên Google Drive (theo link và theo sha256 của file). Chạy lại thì các video đó được bỏ qua.
- **Lỗi một video không dừng cả lô:** lỗi được ghi vào bảng, rồi notebook làm tiếp video sau.
- **Dọn file tạm:** video tải về nằm trong `/content/gv-work` từ lúc Chuẩn bị tới lúc Đăng xong, rồi bị xoá.
- **Caption an toàn cho Buffer:** caption có từ cấm hoặc có link thì không được đăng X (ô Duyệt báo đỏ); caption quá dài bị cắt bớt theo cách X đếm ký tự.
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
!pip -q install -U bitsandbytes accelerate  # caption AI (4-bit trên GPU T4)
import importlib, sys
sys.path.insert(0, "/content")
for name in ("colab_helpers", "gayvideo_publish", "caption_ai"):
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
#@markdown ---
#@markdown **Caption AI cho X.** JoyCaption xem vài khung hình (chỉ dùng nội bộ: không đăng, không gửi lên server), rồi mô hình chữ viết caption kiểu nhá hàng theo giọng văn trong file mẫu, kèm gợi ý tag cho web. Cần GPU: *Runtime → Change runtime type → T4 GPU*. Không có GPU thì dùng caption mặc định. Caption ghi trong LINKS luôn được ưu tiên.
AI_CAPTION = True  #@param {type:"boolean"}
#@markdown Mô hình viết caption: `local` = mô hình mở chạy trên GPU Colab, không cần key. `anthropic` / `openai` = gọi API, cần secret `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`; khi đó mô tả khung hình và tiêu đề được gửi tới nhà cung cấp đó.
AI_TEXT_ENGINE = "local"  #@param ["local", "anthropic", "openai"]
#@markdown Tên mô hình (để trống = mặc định: `Qwen/Qwen3-8B`, `claude-opus-5-5`, `gpt-5-mini`).
AI_TEXT_MODEL = ""  #@param {type:"string"}
#@markdown Số khung hình JoyCaption xem cho mỗi video.
AI_FRAMES = 4  #@param {type:"slider", min:3, max:5, step:1}
#@markdown File caption mẫu (mỗi dòng 1 caption bạn chọn). Chưa có thì notebook tạo từ mẫu khởi đầu.
CAPTION_EXAMPLES = "/content/drive/MyDrive/gayvideo/caption_examples.txt"  #@param {type:"string"}
#@markdown Thêm từ cấm (cách nhau bằng dấu phẩy), ngoài danh sách có sẵn trong `caption_ai.py`.
BANNED_EXTRA = ""  #@param {type:"string"}
#@markdown ---
#@markdown Sổ ghi các video đã đăng (để không đăng trùng). Nên để trên Drive.
MOUNT_DRIVE = True  #@param {type:"boolean"}
LEDGER_PATH = "/content/drive/MyDrive/gayvideo/publish_log.csv"  #@param {type:"string"}

if MOUNT_DRIVE:
    from google.colab import drive
    drive.mount("/content/drive")
elif LEDGER_PATH.startswith("/content/drive"):
    LEDGER_PATH = "/content/publish_log.csv"
    print("Cảnh báo: không mount Drive, sổ ghi chỉ tồn tại trong phiên này:", LEDGER_PATH)
if not MOUNT_DRIVE and CAPTION_EXAMPLES.startswith("/content/drive"):
    CAPTION_EXAMPLES = "/content/caption_examples_mine.txt"
"""

INPUT = '''#@title 3. Danh sách video
#@markdown Mỗi dòng: `link | tiêu đề | tag1, tag2 | category | caption X (tiếng Anh) | giây bắt đầu clip | từ khoá tiếng Việt cho AI`. Chỉ link là bắt buộc. Có caption X thì AI không viết đè; từ khoá chỉ để AI hiểu ý, không được đăng. Album → mỗi video một bài, tiêu đề tự thêm "– P1, P2…". Dòng bắt đầu bằng `#` bị bỏ qua.
LINKS = """
# Dòng mẫu (bắt đầu bằng # nên không được đăng). Xoá dấu # và thay bằng nội dung thật:
# https://photos.app.goo.gl/XXXXXXXX | Tiêu đề video | tag1, tag2 | category | English caption | 0 | từ khoá 1, từ khoá 2
"""
#@markdown Hoặc đọc từ CSV (cột: `link,title,tags,category,x_caption,clip_start,keywords`); để trống nếu dùng ô trên.
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

Không đánh dấu ô dưới đây thì ô Chuẩn bị và ô Đăng sẽ dừng ngay. Thời điểm xác nhận được ghi vào sổ cùng với từng video.
"""

CONSENT = """#@title Tôi xác nhận có quyền đăng các video này; mọi người trong video đều trên 18 tuổi và đồng ý.
XAC_NHAN = False  #@param {type:"boolean"}
import datetime
XAC_NHAN_LUC = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if XAC_NHAN else ""
print("Đã xác nhận lúc", XAC_NHAN_LUC) if XAC_NHAN else print("Chưa xác nhận: ô Chuẩn bị và ô Đăng sẽ không chạy.")
"""

PREPARE = """#@title 5. Chuẩn bị: tải video, đề xuất caption (AI)
import html, shutil, tempfile, time
from pathlib import Path

import pandas as pd
from google.colab import userdata
from IPython.display import display

import caption_ai as ai
from colab_helpers import (HostUploader, Ledger, LogoError, SourceError, Step, batch_line, load_logo, probe,
                           redact, register_secret, sha256_file, source_items)
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
EXTRA_BANNED = ai.parse_tags(BANNED_EXTRA)
WORK_ROOT = Path("/content/gv-work")
shutil.rmtree(WORK_ROOT, ignore_errors=True)
WORK_ROOT.mkdir(parents=True)
PREPARED, REVIEWED = [], False


def note(job, title, status, detail="", url="", x=""):
    results.append({"link": job.link, "tiêu đề": title, "trạng thái": status,
                    "link web": url, "X": x, "ghi chú": redact(detail, 300)})


# Đọc hết các link trước để biết cả lô có bao nhiêu video.
queue = []
for job in JOBS:
    try:
        with Step(f"Đọc link {job.link[:60]}", indent="") as step:
            album_title, items = source_items(job.link)
            step.extra = f"{len(items)} video"
    except Exception as error:  # one bad link never stops the batch
        print("  ", redact(error, 300))
        note(job, job.title, "lỗi", error)
        ledger.add(link=job.link, status="error", error=redact(error))
        continue
    if not items:
        note(job, job.title, "lỗi", "Không có video nào trong link.")
        continue
    for index, item in enumerate(items):
        base_title = job.title or album_title or f"Video {datetime.date.today():%d-%m-%Y}"
        title = f"{base_title} – P{index + 1}" if len(items) > 1 else base_title
        queue.append((job, item, title))

# Tải từng video về /content/gv-work (giữ tới khi ô Đăng xong).
for number, (job, item, title) in enumerate(queue, 1):
    batch_line(number, len(queue), title)
    if item.key in ledger.done_keys():
        print("  bỏ qua: đã đăng trước đó (theo link)")
        note(job, title, "bỏ qua", "Đã đăng trước đó (theo link).")
        continue
    work = WORK_ROOT / f"{number:03d}"
    work.mkdir()
    digest = ""
    try:
        with Step(f"Tải từ {item.source}") as step:
            source = item.download(work / "source.mp4", step=step)
        with Step("Kiểm tra trùng (sha256)") as step:
            digest = sha256_file(source, step=step)
        if digest in ledger.done_hashes() or digest in {p["digest"] for p in PREPARED}:
            print("  bỏ qua: đã đăng trước đó (cùng file)")
            note(job, title, "bỏ qua", "Đã đăng trước đó (cùng file).")
            ledger.add(link=job.link, item_key=item.key, sha256=digest, title=title, status="duplicate")
            shutil.rmtree(work, ignore_errors=True)
            continue
        info = probe(source)
        with Step("Lấy khung hình") as step:
            frames = ai.extract_frames(source, work / "frames", info["duration"], AI_FRAMES if AI_CAPTION else 1)
            step.extra = f"{len(frames)} khung"
        if job.x_caption:
            fitted, problems = ai.check_caption(job.x_caption, EXTRA_BANNED)
            suggestion = ai.Suggestion(fitted, [], "LINKS", "; ".join(problems))
        else:
            suggestion = ai.Suggestion(ai.default_caption(X_CAPTION_TEMPLATE, title, EXTRA_BANNED))
        PREPARED.append({"job": job, "item": item, "title": title, "work": work, "source": source,
                         "digest": digest, "info": info, "frames": frames, "suggestion": suggestion,
                         "tags": list(job.tags)})
    except Exception as error:
        print("  lỗi:", redact(error, 300))
        note(job, title, "lỗi", str(error))
        ledger.add(link=job.link, item_key=item.key, sha256=digest, title=title, status="error", error=redact(error))
        shutil.rmtree(work, ignore_errors=True)

# Caption AI: JoyCaption mô tả khung hình, rồi mô hình chữ viết caption + tag.
# Mô tả chỉ nằm trong bộ nhớ của phiên này: không đăng, không ghi sổ, không gửi lên server.
if AI_CAPTION and PREPARED:
    has_gpu, gpu = ai.gpu_status()
    api_key = None
    if AI_TEXT_ENGINE in ("anthropic", "openai"):
        api_key = secret("ANTHROPIC_API_KEY" if AI_TEXT_ENGINE == "anthropic" else "OPENAI_API_KEY")
    if not has_gpu:
        print(f"⚠️ Không chạy được caption AI: {gpu}. Dùng caption trong LINKS hoặc caption mặc định.")
    elif AI_TEXT_ENGINE != "local" and not api_key:
        print(f"⚠️ Thiếu secret {'ANTHROPIC_API_KEY' if AI_TEXT_ENGINE == 'anthropic' else 'OPENAI_API_KEY'}: dùng caption mặc định.")
    else:
        print(f"GPU: {gpu}")
        examples, warnings = ai.load_examples(CAPTION_EXAMPLES, Path("/content/caption_examples.txt").read_text(encoding="utf-8"),
                                              EXTRA_BANNED)
        for warning in warnings:
            print(" ", warning)
        print(f"  {len(examples)} caption mẫu từ {CAPTION_EXAMPLES}")
        descriptions = {}
        captioner = writer = None
        try:
            with Step("Nạp JoyCaption (4-bit)"):
                captioner = ai.JoyCaptioner()
            for number, prepared in enumerate(PREPARED, 1):
                frames = prepared["frames"]
                times = ai.frame_times(prepared["info"]["duration"], len(frames))
                with Step(f"JoyCaption · video {number}/{len(PREPARED)}", unit="khung hình", total=len(frames)) as step:
                    notes = []
                    for second, frame in zip(times, frames):
                        notes.append((second, captioner.describe(frame)))
                        step.update(1)
                descriptions[number] = ai.merge_descriptions(notes)
        except Exception as error:
            print("⚠️ JoyCaption lỗi:", redact(error, 300), "→ dùng caption mặc định.")
        finally:
            if captioner:
                captioner.close()
        if descriptions:
            try:
                with Step(f"Nạp mô hình chữ ({AI_TEXT_ENGINE})"):
                    if AI_TEXT_ENGINE == "anthropic":
                        ai.ensure_package("anthropic")
                        writer = ai.AnthropicWriter(api_key, AI_TEXT_MODEL.strip() or ai.ANTHROPIC_MODEL)
                    elif AI_TEXT_ENGINE == "openai":
                        ai.ensure_package("openai")
                        writer = ai.OpenAIWriter(api_key, AI_TEXT_MODEL.strip() or ai.OPENAI_MODEL)
                    else:
                        writer = ai.LocalWriter(AI_TEXT_MODEL.strip() or ai.LOCAL_TEXT_MODEL)
                for number, prepared in enumerate(PREPARED, 1):
                    if number not in descriptions:
                        continue
                    job = prepared["job"]
                    try:
                        with Step(f"Viết caption · video {number}/{len(PREPARED)}") as step:
                            suggestion = ai.write_caption(
                                writer, description=descriptions[number], title=prepared["title"], tags=job.tags,
                                keywords=job.keywords, examples=examples, extra_banned=EXTRA_BANNED)
                    except Exception as error:
                        prepared["suggestion"].note = f"AI: {redact(error, 200)}; dùng caption mặc định"
                        continue
                    prepared["tags"] = ai.clean_tags(list(job.tags) + suggestion.tags, EXTRA_BANNED)
                    if not job.x_caption:  # caption trong LINKS luôn được ưu tiên
                        prepared["suggestion"] = suggestion
            except Exception as error:
                print("⚠️ Mô hình chữ lỗi:", redact(error, 300), "→ dùng caption mặc định.")
            finally:
                if writer:
                    writer.close()
        descriptions.clear()

if PREPARED:
    display(pd.DataFrame([{"video": p["title"], "nguồn caption": p["suggestion"].source,
                           "caption đề xuất": p["suggestion"].caption, "tag web": ", ".join(p["tags"]),
                           "ghi chú": p["suggestion"].note} for p in PREPARED]))
    print("Tiếp: chạy ô 6 để duyệt caption, rồi ô 7 để đăng.")
else:
    print("Không có video nào để đăng.")
"""

REVIEW = """#@title 6. Duyệt caption (sửa trực tiếp; bỏ chọn "Đăng X" = video vẫn lên web nhưng không đăng X)
import html
from pathlib import Path

import ipywidgets as widgets
from IPython.display import display

import caption_ai as ai

if not globals().get("PREPARED"):
    raise SystemExit("Chưa có video nào: chạy ô 5 (Chuẩn bị) trước.")

REVIEW_ROWS, boxes = [], []
for number, prepared in enumerate(PREPARED, 1):
    suggestion = prepared["suggestion"]
    thumb = widgets.Image(value=Path(prepared["frames"][0]).read_bytes(), format="jpg",
                          layout=widgets.Layout(width="180px"))
    post_x = widgets.Checkbox(value=POST_TO_X, description="Đăng X", indent=False, disabled=not POST_TO_X)
    caption = widgets.Textarea(value=suggestion.caption, layout=widgets.Layout(width="100%", height="70px"))
    tags = widgets.Text(value=", ".join(prepared["tags"]), description="Tag web",
                        layout=widgets.Layout(width="100%"))
    status = widgets.HTML()

    def refresh(_=None, post_x=post_x, caption=caption, tags=tags, status=status, suggestion=suggestion):
        decision = ai.review_decision(post_x.value, caption.value, tags.value, EXTRA_BANNED)
        parts = [f"{ai.weight_label(caption.value)} ký tự X", f"nguồn: {suggestion.source}"]
        if suggestion.note:
            parts.append(html.escape(suggestion.note))
        if decision.problems:
            parts.append("<b style='color:#c00'>⚠️ " + html.escape("; ".join(decision.problems)) + " → sẽ không đăng X</b>")
        status.value = " · ".join(parts)

    for control in (post_x, caption, tags):
        control.observe(refresh, "value")
    refresh()
    header = widgets.HTML(f"<b>{number}. {html.escape(prepared['title'])}</b>")
    boxes.append(widgets.HBox([thumb, widgets.VBox([header, post_x, caption, tags, status],
                                                   layout=widgets.Layout(width="75%"))]))
    REVIEW_ROWS.append((prepared, post_x, caption, tags))

display(widgets.VBox(boxes))
REVIEWED = True
print("Sửa xong thì chạy ô 7 (Đăng). Ô Đăng đọc đúng nội dung đang hiện trong các ô trên.")
"""

RUN = """#@title 7. Đăng
import shutil, time
from pathlib import Path

import pandas as pd
from IPython.display import display

import caption_ai as ai
from colab_helpers import Step, batch_line, cut_x_clip, make_thumbnail, redact, watermark
from gayvideo_publish import PublishError

if not globals().get("XAC_NHAN"):
    raise SystemExit("Dừng: hãy đánh dấu ô xác nhận ở bước 4 rồi chạy lại ô đó.")
if not globals().get("PREPARED"):
    raise SystemExit("Chưa có video nào: chạy ô 5 (Chuẩn bị) trước.")
if AI_CAPTION and POST_TO_X and not globals().get("REVIEWED"):
    raise SystemExit("Hãy duyệt caption ở ô 6 trước khi đăng.")

# Caption đã duyệt (hoặc caption đề xuất nếu không dùng AI và chưa mở ô duyệt).
decisions = {}
for prepared in PREPARED:
    decisions[id(prepared)] = ai.review_decision(POST_TO_X, prepared["suggestion"].caption,
                                                 ", ".join(prepared["tags"]), EXTRA_BANNED)
if globals().get("REVIEWED"):
    for prepared, post_x, caption, tags in REVIEW_ROWS:
        decisions[id(prepared)] = ai.review_decision(POST_TO_X and post_x.value, caption.value, tags.value,
                                                     EXTRA_BANNED)

clip_seconds = client.clip_seconds() if POST_TO_X else 0
batch_started = time.monotonic()
for number, prepared in enumerate(PREPARED, 1):
    job, item, title, work = prepared["job"], prepared["item"], prepared["title"], prepared["work"]
    source, info, digest = prepared["source"], prepared["info"], prepared["digest"]
    decision = decisions[id(prepared)]
    batch_line(number, len(PREPARED), title)
    if POST_TO_X and decision.problems:
        print("  không đăng X:", "; ".join(decision.problems))
    codes = {}
    video_started = time.monotonic()
    try:
        if item.key in ledger.done_keys() or digest in ledger.done_hashes():
            print("  bỏ qua: đã đăng trước đó")
            note(job, title, "bỏ qua", "Đã đăng trước đó.")
            continue
        upload_file = source
        if WATERMARK:
            with Step("Watermark (ffmpeg)") as step:
                upload_file = watermark(source, work / "upload.mp4", logo, info["width"], info["duration"], step)

        warnings = []
        for host, uploader in uploaders.items():
            try:
                with Step(f"Upload lên {host}") as step:
                    codes[host] = uploader.upload(upload_file, title, decision.tags or job.tags, step=step)
                    step.extra = f"mã {codes[host]}"
            except Exception as error:
                if host == primary:
                    raise
                warnings.append(f"{host}: {redact(error, 150)}")

        with Step("Thumbnail") as step:
            thumb = make_thumbnail(source, work / "thumb.jpg", info["duration"], None if THUMB_AT < 0 else THUMB_AT)
        category = job.category if job.category in categories else None
        if job.category and not category:
            warnings.append(f"category '{job.category}' không tồn tại, đã bỏ")
        if POST_TO_X and decision.problems:
            warnings.append("không đăng X: " + "; ".join(decision.problems))

        caption, clip_id = None, None
        if decision.post_x:
            caption = decision.caption
            with Step("Cắt clip X (ffmpeg)") as step:
                clip = cut_x_clip(upload_file, work / "clip.mp4", info["duration"],
                                  start=job.clip_start if job.clip_start is not None else CLIP_START,
                                  seconds=clip_seconds, label=X_LABEL.strip() or None, step=step)
            with Step("Upload clip X lên web") as step:
                step.total = clip.stat().st_size
                clip_id = client.upload_clip(str(clip), progress=step.set)["clipId"]
        with Step("Publish lên web") as step:
            result = client.publish(
                title, codes, tags=decision.tags or None, category=category, thumbnail=str(thumb), publish=PUBLISH,
                x_caption=caption, x_clip_id=clip_id,
            )
        video = result["video"]
        url = API_URL.rstrip("/") + video["url"]
        x_status = (result.get("x") or {}).get("status", "")
        ledger.add(link=job.link, item_key=item.key, sha256=digest, title=title, video_id=video["id"],
                   url=url, x=x_status, status="done", error=f"xác nhận {XAC_NHAN_LUC}")
        note(job, title, "đã đăng" if video["published"] else "bản nháp", "; ".join(warnings + result["warnings"]),
             url, x_status)
        print(f"  xong video {number}/{len(PREPARED)} sau {time.monotonic() - video_started:.0f} s: {url}")
    except Exception as error:
        detail = f"{error.code}: {error}" if isinstance(error, PublishError) else str(error)
        if codes:
            detail += f" (đã upload: {codes}; có thể đăng lại thủ công bằng mã file này)"
        print("  lỗi:", redact(detail, 300))
        note(job, title, "lỗi", detail)
        ledger.add(link=job.link, item_key=item.key, sha256=digest, title=title, status="error", error=redact(detail))
    finally:
        shutil.rmtree(work, ignore_errors=True)

print(f"Cả lô: {len(PREPARED)} video trong {(time.monotonic() - batch_started) / 60:.1f} phút.")
PREPARED, REVIEW_ROWS, REVIEWED = [], [], False
shutil.rmtree(WORK_ROOT, ignore_errors=True)

pd.set_option("display.max_colwidth", 120)
display(pd.DataFrame(results))
print("Sổ ghi:", LEDGER_PATH)
"""

HELP_MD = """### Gặp lỗi?
- **"Google Photos …"**: link chưa chia sẻ công khai, hoặc Google chặn tải tự động. Dùng link Google Drive thay thế (xem đầu notebook).
- **"Thiếu key …"**: thêm secret tương ứng trong 🔑 Secrets và bật *Notebook access*.
- **`401 unauthorized`**: token sai hoặc đã bị thu hồi. Tạo token mới trên VPS: `npm run api-token -- create <email> colab`.
- **Lỗi sau khi đã upload host:** bảng kết quả có ghi mã file đã upload. Chạy lại notebook sẽ upload lại; muốn tránh thì đăng thủ công bằng mã file đó (xem `docs/API.md`).
- **"Không chạy được caption AI"**: runtime chưa có GPU, hoặc thiếu secret API. Notebook vẫn chạy với caption trong LINKS hoặc caption mặc định.
- **Hết bộ nhớ GPU (CUDA out of memory)**: *Runtime → Restart session*, chạy lại từ ô 1; hoặc giảm `AI_FRAMES`, hoặc đổi `AI_TEXT_MODEL` sang mô hình nhỏ hơn (ví dụ `Qwen/Qwen3-4B-Instruct-2507`).
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
            markdown_cell("### Thư viện (tự sinh: các ô dưới ghi file client, helpers, caption AI và caption mẫu vào /content)"),
            embedded(HERE / "gayvideo_publish.py", "Client publish API"),
            embedded(HERE / "colab_helpers.py", "Helpers tải/upload"),
            embedded(HERE / "caption_ai.py", "Caption AI"),
            embedded(HERE / "assets" / "caption_examples.txt", "Caption mẫu khởi đầu"),
            code_cell(SETUP),
            code_cell(CONFIG),
            code_cell(INPUT),
            markdown_cell(CONSENT_MD),
            code_cell(CONSENT),
            code_cell(PREPARE),
            code_cell(REVIEW),
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
