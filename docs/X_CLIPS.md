# Đăng X từ /admin/review

Khi duyệt một video trong **/admin/review**, khối **Đăng X** trên thẻ có các lựa chọn:

| Lựa chọn | Kết quả |
|---|---|
| **Cắt clip** (mặc định) | Clip dài `X_CLIP_SECONDS` (120 s), bắt đầu từ giây bạn nhập |
| **Giữ nguyên** | Cả video. Nếu dài hơn `X_MAX_VIDEO_SECONDS` (140 s) thì ô duyệt cảnh báo và tự cắt phần đầu |
| **Không đăng X** | Video vẫn lên web; không có bài X |

Mặc định thẻ chọn sẵn **Cắt clip**, và nút **Approve selected** (duyệt hàng loạt) cũng tạo bài X cho video chưa có bài: cắt clip từ đầu, caption theo mẫu. Tắt ở **/admin/settings → X captions → Mặc định đăng lên X khi duyệt**: thẻ khi đó chọn sẵn "Không đăng X" và duyệt hàng loạt không tạo bài X.
| **Dùng clip đã có** | Chỉ hiện khi video đã có clip (ví dụ từ notebook Colab) |

- **Caption:** lấy theo mẫu trong **/admin/settings → X captions** (mặc định `{title}`: chỉ tiêu đề bỏ dấu; trước 11/2026 là `New video: {title} 🔥`, mỗi lần deploy lệnh `social:caption-upgrade` chuyển mẫu cũ đã lưu và caption chưa sửa của bài chưa sang Buffer sang mẫu mới) và sửa được ngay trên thẻ.
- **Kiểm tra caption:** caption qua cùng bộ lọc từ cấm và giới hạn 255 ký tự (cách X đếm) như notebook. Caption có từ cấm hoặc có link thì không duyệt được; caption quá dài thì bị cắt bớt.
- **Lỗi bên X không chặn web:** lỗi phần X không bao giờ ngăn video lên web.

Sau khi tài khoản X lên Premium, tăng `X_MAX_VIDEO_SECONDS` (và `X_CLIP_SECONDS` nếu muốn) trong `/opt/gayvideo/.env`.

## Clip được cắt ở đâu

Clip được cắt trên **GitHub Actions** (`.github/workflows/x-clips.yml`), không dùng CPU hay đĩa của VPS. Workflow không chạy định kỳ; nó chạy khi có sự kiện:

1. Duyệt video có bật X: bài X chuyển sang **Đang xử lý clip**, server ghi lại một yêu cầu.
2. **Gộp lượt:** worker chờ `X_CLIPS_DEBOUNCE_SECONDS` (90 s) sau lần duyệt cuối, rồi gọi GitHub API (`workflow_dispatch`) **một lần**. Một lượt chạy xử lý hết bài đang chờ.
3. Nếu workflow đang chạy hoặc đang xếp hàng thì không gọi thêm. Workflow cũng có `concurrency: x-clips` với `cancel-in-progress: false`, nên các lượt không bao giờ chạy chồng nhau. Bài duyệt trong lúc đó vào lượt sau.
4. **Workflow làm gì:**
   - lấy danh sách bài chờ: `GET /api/v1/social/pending`;
   - tìm nguồn cho từng video:
     - EarnVids `file/direct_link`, bản đã có watermark. Gọi thật ngày 25/11/2026, EarnVids trả `status 403: Please buy premium views`: tính năng này cần gói premium. Khi chưa có premium, nguồn này báo lỗi ngay và workflow chuyển sang Drive. DoodStream và VOE không có API trả link file;
     - nếu không được thì dùng bản gốc trên Google Drive, lấy từ CSV migration trong repo riêng `stream-video-data`, khớp theo mã file trên host như sync vẫn làm, và gắn watermark;
   - **nguồn Drive luôn được tải cả file về runner** bằng requests (ghi thẳng ra đĩa, có kiểm tra dung lượng trống, khoảng 14–23 MB/s) rồi mới cắt; gdown trên link công khai là dự phòng. Lý do: nếu để ffmpeg đọc thẳng Drive thì tua rất chậm (từng mất 22 phút cho một clip), kết nối bị ngắt giữa chừng (ra clip 2 s và 91 s), và Google trả 403 cho các yêu cầu của ffmpeg trong khi vẫn cho requests đọc cùng file đó;
   - các nguồn khác (EarnVids khi có premium) vẫn cho ffmpeg đọc thẳng URL và tua bằng HTTP Range, tối đa 240 s (`X_CLIPS_DIRECT_TIMEOUT`). Quá giờ, gặp lỗi, hoặc clip ngắn hơn dự kiến quá 2 s thì workflow tải cả file rồi cắt;
   - server từ chối clip ngắn hơn độ dài đã định quá 2 s (`422 clip_too_short`), nên clip bị cắt cụt không bao giờ vào hàng đợi X;
   - với Drive, trước khi đọc, workflow gọi metadata và thử đọc 1 byte để biết đúng lý do nếu Google từ chối (ví dụ `downloadQuotaExceeded`), và gửi kèm resource key nếu link có. Nếu Drive API từ chối, workflow tải qua link công khai bằng gdown, giống migration (gdown được ghim `6.5.2` trong x-clips.yml, gọi `gdown.download(id=…)`; test gọi thật gdown với tầng mạng giả lập);
   - **Drive hết hạn mức tải** (`downloadQuotaExceeded`, giới hạn theo từng file, thường hồi trong 24 giờ): workflow báo `quota: true`. Server không tính vào số lần thử, giữ bài ở trạng thái chờ, ghi "Drive hết hạn mức tải … tự thử lại lúc …", admin hiện "Drive hết hạn mức tải, thử lại sau". Bài tự được thử lại sau 6 giờ, tối đa 8 lần chờ (48 giờ), sau đó mới tính là một lần thử. "Thử lại"/"Cắt lại" đặt lại số lần chờ;
   - mỗi video có tối đa 20 phút (`X_CLIPS_VIDEO_TIMEOUT`) cho mọi nguồn; cả job tối đa 75 phút;
   - upload clip (`/api/v1/clips`), gắn clip vào bài (`/api/v1/social/<id>/clip`), hoặc báo lỗi (`/api/v1/social/<id>/failure`).

   Bài lỗi được thử lại sau 15 phút, rồi sau 60 phút; lần thứ 3 vẫn lỗi thì chuyển sang **Lỗi**.
5. Bài có clip vào hàng đợi Buffer như bình thường.

**Giao diện admin:**
- **Thử lại / Cắt lại:** trong bảng **Bài X**, bài **Lỗi** có nút **Thử lại**; bài đã có clip nhưng chưa lên Buffer có nút **Cắt lại**. Bấm thì bài về lại hàng cắt clip, với số lần thử tính lại từ đầu.
- **Chẩn đoán:** chạy tay *Actions → X clips → Run workflow*, ô `diagnose_slugs` nhập slug hoặc `host:mã` (ví dụ `dood:abc123`). Workflow gọi thật EarnVids và Drive cho các video đó và chỉ in trạng thái, lý do và tốc độ, không in link hay key.
- **Nút gọi tay:** **Chạy cắt clip ngay** trong /admin/review gọi workflow ngay, không chờ gộp lượt. Cũng có thể chạy tay trên GitHub: *Actions → X clips → Run workflow*.
- **Trạng thái bài X** (Đang xử lý clip / Trong hàng đợi / Đã đăng / Lỗi) hiện trên thẻ duyệt, trong bảng **Bài X** của /admin/review, và ở cột **X** của /admin/videos.
- **Lỗi gọi GitHub** (token sai, thiếu quyền…) hiện trong bảng đó; worker tự thử lại sau 5 phút.

**Không lộ bí mật:** repo đang công khai nên log của workflow không in link nguồn, token hay key:
- URL nguồn được che bằng `::add-mask::`;
- mọi thông báo lỗi đều bỏ link, mã file Drive và token trước khi in hoặc gửi về server;
- server cũng lọc thêm một lần.

**Thời gian** (đo với nguồn 1080p, xuất 720p, preset `medium`, máy 4 nhân như runner GitHub):
- mỗi clip 120–140 s mất khoảng **40–50 giây**;
- cộng 1–2 phút khởi động runner và cài ffmpeg cho mỗi lượt.

Repo công khai nên phút chạy Actions trên runner thường được miễn phí.

## Secrets cần có

| Secret | Ở đâu | Dùng cho |
|---|---|---|
| `GAYVIDEO_CLIP_DISPATCH` | GitHub Actions secret của `stream-video`. Bước deploy ghi nó vào `/opt/gayvideo/.env` (giống `BUFFER_API_KEY`, không in ra log) | Server gọi workflow |
| `GAYVIDEO_API_TOKEN` | GitHub Actions secret | Workflow gọi API của site |
| `MIGRATION_DATA_PAT` | GitHub Actions secret (đã có) | Đọc CSV trong `stream-video-data` |
| `HOST_EARNVIDS_API_KEY`, `GDRIVE_SERVICE_ACCOUNT_JSON` | GitHub Actions secret (đã có) | Lấy nguồn |

Không có `GAYVIDEO_CLIP_DISPATCH` thì duyệt vẫn lên web, còn bảng **Bài X** báo chưa cấu hình.

### Tạo token `GAYVIDEO_CLIP_DISPATCH` (fine-grained PAT)

1. GitHub → ảnh đại diện → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Token name:** `gayvideo-clip-dispatch`. **Expiration:** tối đa theo chính sách của bạn, và ghi lịch tạo lại trước ngày hết hạn.
3. **Resource owner:** `ronganminh`. **Repository access:** *Only select repositories* → chọn **`ronganminh/stream-video`**.
4. **Permissions → Repository permissions → Actions: Read and write**. Không tick quyền nào khác; *Metadata: Read-only* được GitHub tự thêm.
5. **Generate token** và copy token (chỉ hiện một lần).
6. Repo `stream-video` → **Settings → Secrets and variables → Actions → New repository secret**: tên **`GAYVIDEO_CLIP_DISPATCH`**, dán token vào.
7. Chạy workflow **Deploy** để bước *Put server secrets into the server .env* ghi token vào `/opt/gayvideo/.env`, rồi container web và worker được tạo lại.

### Tạo `GAYVIDEO_API_TOKEN` cho workflow

Trên VPS:

```bash
cd /opt/gayvideo
docker compose run --rm worker npm run api-token -- create <email-admin> actions-x-clips
```

Lưu token in ra (dạng `gv_…`) vào Actions secret **`GAYVIDEO_API_TOKEN`**. Thu hồi bằng `npm run api-token -- revoke …` như mọi token khác (docs/API.md).

### Token đọc `stream-video-data` (`MIGRATION_DATA_PAT`)

Các workflow `video-migration*.yml` và `x-clips.yml` checkout repo riêng `ronganminh/stream-video-data` bằng secret **`MIGRATION_DATA_PAT`**.

Khi tạo lại token này (fine-grained):
- **Repository access:** chỉ `ronganminh/stream-video-data`.
- **Contents: Read and write.** Migration cần quyền ghi để commit `migration-log.csv`. Nếu chỉ dùng cho cắt clip thì *Read-only* là đủ, nhưng hai bên dùng chung một secret nên cần *Read and write*.

Sau đó cập nhật secret `MIGRATION_DATA_PAT` trong repo `stream-video`.
