# API đăng bài (Colab, laptop) — web và X

API này cho phép đăng video lên GayVideo.fun từ script, ví dụ Google Colab hoặc laptop, mà không cần vào trang admin. Cùng lần gọi đó có thể **đăng thêm lên X** (@Gayvideofun, qua Buffer) với một clip ngắn và link tới trang video (xem mục 5). Mọi request đều cần **token**. Quyền của token bằng quyền của tài khoản admin sở hữu nó.

| | |
|---|---|
| Địa chỉ | `https://gayvideo.fun/api/v1` |
| Xác thực | Header `Authorization: Bearer gv_…` |
| Client sẵn có | `scripts/publish-client/gayvideo_publish.py` (Python 3.8+, chỉ dùng thư viện chuẩn) |

---

## 1. Cách hoạt động

1. **Upload file video lên host** (DoodStream, VOE, EarnVids) như bình thường, bằng trang web của host hoặc API của host. Ghi lại **mã file** (file code) mà host trả về. API của GayVideo không nhận file video, chỉ nhận mã file.
2. **Gọi API** với tiêu đề, các mã file, tag, category và thumbnail:
   - Mặc định video được tạo dưới dạng **bản nháp**. Bản nháp xuất hiện ở `/admin/review` để duyệt.
   - Gửi `publish: true` để video **lên web ngay**.
3. Server tự xử lý phần còn lại: kiểm tra file có thật trên host, tạo slug (giữ chữ đ, tự thêm `-2` nếu trùng), tạo tag mới nếu chưa có, lưu thumbnail 640×360, và làm mới các trang đã cache khi publish.

**Gửi lại cùng mã file thì không tạo trùng:**
- Nếu file đã thuộc một **bản nháp**, ví dụ bản nháp worker tự tạo khi sync, API **cập nhật** bản nháp đó và trả `200` với `created: false`.
- Nếu file đã thuộc một video **đã publish**, API trả `409 already_published` và không ghi đè. Muốn sửa video đó thì vào trang admin.

---

## 2. Tạo token (làm trên VPS)

Mỗi nơi dùng một token riêng (ví dụ `colab`, `laptop`), để khi cần có thể thu hồi từng cái.

```bash
cd /opt/gayvideo
docker compose run --rm worker npm run api-token -- create <email-admin> colab
docker compose run --rm worker npm run api-token -- create <email-admin> laptop
```

Lệnh in ra token dạng `gv_…` **một lần duy nhất**. Hãy copy ngay. Server chỉ lưu bản băm SHA-256 của token, nên không xem lại được.

```bash
docker compose run --rm worker npm run api-token -- list            # xem các token, lần dùng gần nhất
docker compose run --rm worker npm run api-token -- revoke colab    # thu hồi (mất máy, lộ token…)
```

Token có quyền đăng bài lên web, nên giữ kín như mật khẩu: không dán vào notebook để chia sẻ và không commit lên Git.

---

## 3. Dùng trên Google Colab

1. Mở biểu tượng chìa khóa (**Secrets**) ở thanh bên trái của Colab, thêm secret tên `GAYVIDEO_API_TOKEN` với giá trị là token, rồi bật *Notebook access*.
2. Đưa file `gayvideo_publish.py` vào Colab: kéo thả vào thư mục `/content`, hoặc lấy từ Google Drive.
3. Chạy:

```python
from google.colab import userdata
from gayvideo_publish import GayVideoClient, PublishError

client = GayVideoClient(token=userdata.get("GAYVIDEO_API_TOKEN"))
print(client.meta())   # kiểm tra token; liệt kê host và category hợp lệ

try:
    result = client.publish(
        title="Bevis Trần Đức Vương – My love story",
        mirrors={"dood": "abc123xyz", "voe": "q1w2e3r4"},   # host -> mã file trên host
        tags=["Bevis", "Couple"],
        category="couple",                  # slug category; bỏ trống nếu chưa có
        thumbnail="/content/cover.jpg",     # file ảnh hoặc URL https
        publish=False,                      # True = lên web ngay
    )
    print(result["created"], result["video"]["url"], result["warnings"])
except PublishError as e:
    print("Bị từ chối:", e.status, e.code, e)
```

Đăng nhiều bài một lượt, ví dụ đọc từ file CSV:

```python
import csv
for row in csv.DictReader(open("/content/posts.csv", encoding="utf-8")):
    try:
        r = client.publish(row["title"], {"dood": row["dood_code"]},
                           tags=row["tags"].split(";"), thumbnail=row["thumb_url"])
        print("OK", r["video"]["url"])
    except PublishError as e:
        print("Lỗi", row["title"], e.code)   # 409 already_published = đã đăng rồi, bỏ qua được
```

---

## 4. Dùng trên laptop

**Windows (PowerShell):**
```powershell
$env:GAYVIDEO_API_TOKEN = "gv_..."
python gayvideo_publish.py --title "Trần Đức – Tập 1" --mirror dood:abc123xyz --mirror voe:q1w2e3r4 `
  --tag Bevis --tag Couple --thumbnail .\cover.jpg
```

**macOS / Linux:**
```bash
export GAYVIDEO_API_TOKEN="gv_..."
python3 gayvideo_publish.py --title "Trần Đức – Tập 1" --mirror dood:abc123xyz --tag Bevis --publish
```

Các tham số:
- `--mirror host:mã` lặp lại cho từng host.
- `--tag` lặp lại cho từng tag.
- `--category slug`, `--quality HD|4K`, `--slug …`, `--description …`.
- `--publish` để lên web ngay; không có thì tạo bản nháp.

Cũng có thể `import` client trong script Python giống như trên Colab.

Gọi bằng `curl`:
```bash
curl -sS https://gayvideo.fun/api/v1/videos \
  -H "Authorization: Bearer $GAYVIDEO_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Trần Đức","mirrors":[{"host":"dood","fileCode":"abc123xyz"}],"tags":["Bevis"]}'
```

---

## 5. Đăng lên X (qua Buffer)

### 5.1. Luồng hoạt động

1. **Trên Colab hoặc laptop** (nơi có file gốc), client dùng ffmpeg cắt một clip ngắn từ video:
   - độ dài lấy từ `X_CLIP_SECONDS` của server (mặc định 120 giây, mức tối đa cho tài khoản X thường);
   - encode H.264 High, yuv420p, AAC-LC stereo 44.1 kHz, cạnh dài tối đa 1280, tối đa 60 fps, `+faststart`, đúng yêu cầu của X.
2. Client **upload clip** lên server (`POST /api/v1/clips`). Server lưu clip ở `/media/social/…` để Buffer tải được qua một URL công khai.
3. Client gọi `POST /api/v1/videos` kèm `x: {caption, clipId}`. Bài web được xử lý **y như trước**. Ngoài ra server ghi một **bài X vào hàng đợi trong DB**:
   - `waiting` nếu video còn là bản nháp; bài tự chuyển sang `queued` khi video được duyệt trong admin;
   - `queued` nếu đăng kèm `publish: true`.
4. **Worker** chạy mỗi `BUFFER_SYNC_MINUTES` (mặc định 120 phút), và chỉ khi có việc:
   - đọc danh sách bài của kênh X trên Buffer (**1 request**);
   - đếm số chỗ còn trống trong hàng chờ (gói Free giữ tối đa **10 bài** mỗi kênh);
   - đẩy vừa đủ số bài còn chỗ, với chế độ `addToQueue` của Buffer: Buffer tự đăng vào khung giờ kế tiếp của lịch đăng.
5. Ở chu kỳ sau, khi Buffer báo bài đã đăng (`sent`), worker lưu link bài trên X và **xoá clip** khỏi server.

Nội dung bài X gồm caption tiếng Anh, một dòng trống và link `https://gayvideo.fun/watch/<slug>`. Caption tự cắt bớt (thêm "…") để cả bài vừa 280 ký tự, đếm theo cách X đếm: link tính 23; chữ có dấu tiếng Việt như "ầ", "ứ", dấu "…" và emoji tính 2.

**Các cam kết:**
- **Không đăng trùng:** mỗi video có tối đa một bài X. Gửi lại khi bài đã nằm trên Buffer hoặc đã đăng thì chỉ nhận được cảnh báo; clip mới bị bỏ.
- **Lỗi X/Buffer không ảnh hưởng tới web:** mọi lỗi phía X chỉ hiện trong `warnings`; video vẫn được tạo hoặc publish bình thường.
- **Tự xử lý lỗi:**
  - Buffer từ chối một bài thì thử lại với thời gian chờ tăng dần, tối đa 5 lần, rồi đánh dấu `failed`.
  - Hàng chờ Buffer đầy thì chỉ chờ, không tính là lỗi.
  - Mạng đứt giữa chừng thì lần sau worker tìm bài trên Buffer theo link video, nên không tạo bài thứ hai.
- **Tiết kiệm request:** gói Free của Buffer cho khoảng 1000 request mỗi tháng. Mỗi chu kỳ dùng 1 lần đọc cộng 1 request cho mỗi bài được đẩy, và tạm dừng đẩy khi quota 30 ngày còn ≤ 50.
- **Dọn clip:**
  - xoá ngay khi bài đã đăng;
  - xoá sau 7 ngày nếu bài `failed` hoặc `cancelled`;
  - xoá sau 24 giờ nếu clip đã upload mà không gửi kèm bài nào.

### 5.2. Cài đặt trên server (một lần)

1. Lấy API key ở Buffer: **publish.buffer.com → Settings → API**. Đặt vào `/opt/gayvideo/.env`:
   ```
   BUFFER_API_KEY=...        # không commit, không dán vào chat
   BUFFER_X_HANDLE=Gayvideofun
   X_CLIP_SECONDS=120        # lên X Premium: tăng lên, hoặc 0 = đăng full video
   ```
   Rồi deploy hoặc khởi động lại container (`docker compose up -d web worker`).
2. Kiểm tra worker tìm đúng kênh X:
   ```bash
   docker compose run --rm worker npm run social:channels
   # @Gayvideofun: channelId=… organizationId=…
   ```
   Nếu muốn cố định kênh, đặt hai giá trị này vào `BUFFER_X_CHANNEL_ID` và `BUFFER_ORGANIZATION_ID`.
3. **Đánh dấu nội dung nhạy cảm:** Buffer API **không có** trường nào để bật cờ này cho từng bài X. Hãy bật ở cấp tài khoản X, áp dụng cho mọi ảnh và video đăng lên:
   - đăng nhập @Gayvideofun trên x.com;
   - vào **Settings and privacy → Privacy and safety → Your posts**;
   - bật **Mark media you post as having material that may be sensitive**.
4. Trên Buffer, kiểm tra **lịch đăng (Posting schedule)** của kênh X có đủ khung giờ, vì `addToQueue` đăng theo lịch này.

Các lệnh quản lý (chạy trên VPS):
```bash
docker compose run --rm worker npm run social:status                 # hàng đợi X, link bài đã đăng, lỗi
docker compose run --rm worker npm run social:sync                   # chạy một chu kỳ ngay
docker compose run --rm worker npm run social:retry -- <slug>        # đưa bài failed/cancelled vào hàng lại
docker compose run --rm worker npm run social:cancel -- <slug>       # huỷ bài chưa đẩy lên Buffer
```

### 5.3. Ví dụ Colab (web + X)

ffmpeg có sẵn trên Colab. File video gốc có thể nằm trên Google Drive.

```python
from google.colab import drive, userdata
drive.mount("/content/drive")

from gayvideo_publish import GayVideoClient, PublishError
client = GayVideoClient(token=userdata.get("GAYVIDEO_API_TOKEN"))
print(client.meta()["x"])   # {'enabled': True, 'handle': 'Gayvideofun', 'clipSeconds': 120, ...}

SRC = "/content/drive/MyDrive/videos/bevis-love-story.mp4"   # file gốc (đã upload lên host)

try:
    r = client.publish(
        title="Bevis Trần Đức Vương – My love story",
        mirrors={"dood": "abc123xyz", "voe": "q1w2e3r4"},
        tags=["Bevis", "Couple"],
        thumbnail="/content/cover.jpg",
        publish=True,                          # web lên ngay; X vào hàng đợi Buffer
        x_caption="Bevis Tran Duc Vuong – My love story. Full video 👇",
        x_video=SRC,                           # client tự cắt clip bằng ffmpeg rồi upload
        x_clip_start=30,                       # bắt đầu từ giây 30 (tuỳ chọn)
    )
    print(r["video"]["url"], r.get("x"), r["warnings"])
except PublishError as e:
    print("Bị từ chối:", e.status, e.code, e)
```

- **Đã có clip cắt sẵn:** truyền `x_clip="/content/clip.mp4"` thay cho `x_video`. Clip phải là MP4 H.264/AAC, có `+faststart`, và không dài quá `X_CLIP_SECONDS`.
- **Đổi độ dài clip cho một lần chạy:** truyền `x_clip_seconds=…`, hoặc đặt biến môi trường `X_CLIP_SECONDS` trên Colab hay laptop. Server vẫn từ chối clip dài hơn giới hạn của server.
- **Đăng dạng nháp** (`publish=False`): bài X chờ ở trạng thái `waiting`, và tự vào hàng đợi khi bạn bấm *Approve & publish* trong admin.

Dòng lệnh trên laptop (cần ffmpeg; trên Windows cài bằng `winget install Gyan.FFmpeg`):
```bash
python gayvideo_publish.py --title "Trần Đức – Tập 1" --mirror dood:abc123xyz --publish \
  --x-caption "New video: Tran Duc, episode 1" --x-video ./full.mp4 --x-start 30
```

---

## 6. Tham chiếu API

### `GET /api/v1/meta`
Trả về `{ token, hosts: [{id, label, isPrimary}], categories: [{slug, name}], x: {enabled, handle, clipSeconds, clipMaxBytes} }`.
- Dùng để kiểm tra token còn hoạt động và xem giá trị hợp lệ cho các trường.
- `x.enabled` cho biết server đã có `BUFFER_API_KEY` hay chưa.
- `x.clipSeconds` là độ dài clip tối đa; `0` nghĩa là đăng full video.

### `POST /api/v1/clips`
- Body là chính file MP4, với header `Content-Type: video/mp4`.
- Kích thước tối đa là `X_CLIP_MAX_MB` (mặc định 512 MB). Độ dài tối đa là `X_CLIP_SECONDS`, cho phép dư thêm 1 giây.
- Trả về `201` cùng `{clipId, bytes, seconds}`. Dùng `clipId` trong trường `x` của `POST /api/v1/videos`.

### `POST /api/v1/videos`
Body là JSON:

| Trường | Bắt buộc | Mô tả |
|---|---|---|
| `title` | có | ≤ 240 ký tự |
| `mirrors` | có | 1–5 phần tử `{host, fileCode}`, mỗi host tối đa một file. `host` là `dood`, `voe` hoặc `earnvids` |
| `slug` | không | Mặc định tạo từ tiêu đề. Có dấu cũng được: "Trần Đức" thành `tran-duc` |
| `description` | không | ≤ 5000 ký tự |
| `categorySlug` | không | Phải là category đã tồn tại (xem `/meta`) |
| `tags` | không | ≤ 40 tên tag. Tag chưa có sẽ được tạo. Gửi `tags` thì **thay toàn bộ** tag của video |
| `quality` | không | `HD` hoặc `4K` |
| `thumbnailUrl` | không | URL `http(s)` của ảnh |
| `thumbnailDataUrl` | không | Ảnh gửi kèm dạng `data:image/jpeg;base64,…`, tối đa 8 MB (client tự làm khi bạn đưa đường dẫn file). Chỉ gửi một trong hai trường thumbnail |
| `publish` | không | `false` (mặc định, tạo bản nháp) hoặc `true` (lên web ngay) |
| `x` | không | `{caption, clipId}`: đăng thêm lên X qua Buffer khi video đã public. `caption` (tiếng Anh, ≤ 1000 ký tự, tự cắt cho vừa 280) và `clipId` lấy từ `POST /api/v1/clips` (mục 5) |

Nếu không gửi thumbnail, server lấy thumbnail của host. Nếu host không có, response có cảnh báo và bạn chọn ảnh sau trong admin.

Kết quả:
- `201` khi tạo mới, `200` khi cập nhật bản nháp đã có.
- Body có dạng:
  ```json
  {"created": true,
   "video": {"id": "…", "slug": "tran-duc", "title": "…", "published": false,
             "url": "/watch/tran-duc", "adminUrl": "/admin/videos/…", "thumbnailPath": "/media/….webp?v=…"},
   "x": {"status": "queued"},
   "warnings": []}
  ```
- `x` chỉ có khi request gửi kèm `x`. `status` là `waiting` (video còn nháp), `queued` (chờ chỗ trong Buffer), hoặc `pushed`/`sent` (đã có trên Buffer hoặc X từ trước, không đăng lại).
- `warnings` là các lưu ý không làm hỏng việc đăng, ví dụ "API host tạm không gọi được nên dùng bản ghi đã sync", hoặc "thumbnail lỗi".

### `GET /api/v1/videos/{id}`
Trả về trạng thái của video: đã publish chưa, slug, category, tag, các mirror, và `social` (bài X: `status`, `externalLink` tới bài trên X khi đã đăng, `lastError`).

### Mã lỗi
Mọi lỗi có dạng `{"error": {"code": "...", "message": "..."}}`.

| HTTP | `code` | Nghĩa |
|---|---|---|
| 401 | `unauthorized` | Thiếu token, token sai hoặc đã bị thu hồi |
| 400 | `invalid_json` | Body không phải JSON |
| 413 | `too_large` | Body lớn hơn 12 MB |
| 422 | `invalid_input` | Thiếu trường, sai kiểu, hoặc có trường lạ (xem `issues`) |
| 422 | `unknown_host` / `duplicate_host` | Host không hỗ trợ hoặc đang tắt; hoặc gửi 2 file cho cùng một host |
| 422 | `file_not_found` | Host báo không có file với mã này |
| 422 | `unknown_category` / `invalid_slug` | Category không tồn tại; slug không có chữ hay số nào |
| 409 | `already_published` | File thuộc video đã publish (có kèm `video`) |
| 409 | `files_in_different_videos` / `host_already_linked` / `slug_taken` | Xung đột với dữ liệu đang có |
| 422 | `unknown_clip` | `clipId` không tồn tại (chưa upload, hoặc clip đã bị dọn sau 24 giờ không dùng) |
| 415 / 422 / 413 | `unsupported_type` / `not_mp4` / `too_long` / `too_large` | Clip upload sai `Content-Type`, không phải MP4, dài quá `X_CLIP_SECONDS`, hoặc lớn quá `X_CLIP_MAX_MB` |
| 502 | `host_unavailable` | Không gọi được API của host để kiểm tra file, và file này chưa được sync. Thử lại sau |
| 500 | `internal_error` | Lỗi server; xem log của container `web` |

---

## 7. Ghi chú vận hành

- Server cần API key của các host (`HOST_DOOD_API_KEY`, `HOST_VOE_API_KEY`, `HOST_EARNVIDS_API_KEY` trong `.env`) để kiểm tra file. Container `web` đọc cùng các biến với `worker`.
- Mỗi lần đăng hoặc cập nhật được ghi vào nhật ký admin (`API_VIDEO_CREATE`, `API_VIDEO_UPDATE`, `API_VIDEO_PUBLISH`), kèm tên token.
- Worker vẫn sync như cũ. File đã đăng qua API sẽ không bị sync tạo thành bản nháp trùng, vì mã file đã có mirror.
- Clip X nằm trong volume media (`/data/media/social`) và được Caddy phục vụ ở `/media/social/…`. Clip là file tạm: được xoá như mô tả ở mục 5.1.
- `BUFFER_API_KEY` chỉ được đọc từ biến môi trường, không bao giờ ghi vào log hay thông báo lỗi. Nếu key bị lộ, tạo key mới ở publish.buffer.com → Settings → API, rồi thay trong `.env`.
