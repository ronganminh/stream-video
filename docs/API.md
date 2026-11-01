# API đăng bài (Colab, laptop)

API này cho phép đăng video lên GayVideo.fun từ script, ví dụ Google Colab hoặc laptop, mà không cần vào trang admin. Mọi request đều cần **token**. Quyền của token bằng quyền của tài khoản admin sở hữu nó.

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

## 5. Tham chiếu API

### `GET /api/v1/meta`
Trả về `{ token, hosts: [{id, label, isPrimary}], categories: [{slug, name}] }`. Dùng để kiểm tra token còn hoạt động và xem giá trị hợp lệ cho các trường.

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

Nếu không gửi thumbnail, server lấy thumbnail của host. Nếu host không có, response có cảnh báo và bạn chọn ảnh sau trong admin.

Kết quả:
- `201` khi tạo mới, `200` khi cập nhật bản nháp đã có.
- Body có dạng:
  ```json
  {"created": true,
   "video": {"id": "…", "slug": "tran-duc", "title": "…", "published": false,
             "url": "/watch/tran-duc", "adminUrl": "/admin/videos/…", "thumbnailPath": "/media/….webp?v=…"},
   "warnings": []}
  ```
- `warnings` là các lưu ý không làm hỏng việc đăng, ví dụ "API host tạm không gọi được nên dùng bản ghi đã sync", hoặc "thumbnail lỗi".

### `GET /api/v1/videos/{id}`
Trả về trạng thái của video: đã publish chưa, slug, category, tag, các mirror.

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
| 502 | `host_unavailable` | Không gọi được API của host để kiểm tra file, và file này chưa được sync. Thử lại sau |
| 500 | `internal_error` | Lỗi server; xem log của container `web` |

---

## 6. Ghi chú vận hành

- Server cần API key của các host (`HOST_DOOD_API_KEY`, `HOST_VOE_API_KEY`, `HOST_EARNVIDS_API_KEY` trong `.env`) để kiểm tra file. Container `web` đọc cùng các biến với `worker`.
- Mỗi lần đăng hoặc cập nhật được ghi vào nhật ký admin (`API_VIDEO_CREATE`, `API_VIDEO_UPDATE`, `API_VIDEO_PUBLISH`), kèm tên token.
- Worker vẫn sync như cũ. File đã đăng qua API sẽ không bị sync tạo thành bản nháp trùng, vì mã file đã có mirror.
