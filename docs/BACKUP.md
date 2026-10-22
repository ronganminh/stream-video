# Sao lưu và khôi phục GayVideo.fun

Tài liệu này dành cho bất kỳ ai cần lấy lại website khi VPS hỏng, bị xóa hoặc phải chuyển sang máy mới. Bản này cũng được workflow tự tải lên thư mục Google Drive chứa backup, với tên `README.md`.

> Repo: `ronganminh/stream-video` · Workflow: `.github/workflows/backup.yml` · Script: `scripts/backup/`

---

## 1. Tóm tắt

| | |
|---|---|
| **Lịch chạy** | Mỗi tuần, Chủ nhật 19:23 UTC (tức **02:23 sáng thứ Hai giờ Việt Nam**). Có thể bấm chạy tay trong tab Actions. |
| **Nội dung** | Database PostgreSQL (`pg_dump`, format custom), thư mục media `/data/media` (thumbnail), file `.env` trên server, và `manifest.json` (ngày, commit đang chạy, số video, sha256 từng file). |
| **Mã hóa** | [age](https://age-encryption.org). File chỉ mở được bằng **private key của chủ website**. Private key này không nằm trên GitHub hay VPS. |
| **Nơi lưu 1** | Google Drive, thư mục `backup_stream_video` (id `1v2XiT3tOxBCiRuMLv6exJuVT1HfqeQko`). Giữ **8 bản mới nhất**. |
| **Nơi lưu 2** | Trên VPS, thư mục `/var/backups/gayvideo/weekly/`. Giữ **7 bản mới nhất**. |
| **Kiểm tra** | Mỗi lần chạy, workflow giải mã chính file vừa tạo, kiểm tra sha256 và `pg_restore` vào một database tạm. Lỗi ở bất kỳ bước nào thì job đỏ và **không upload**. |

Tên file có dạng `gayvideo-backup-YYYYMMDDTHHMMSSZ.tar.age` (giờ UTC). Kèm theo mỗi file là `….tar.age.sha256`.

Bên trong file `.tar.age`, sau khi giải mã, là một file `.tar` gồm:

| File | Nội dung |
|---|---|
| `manifest.json` | `stamp`, `created_at`, `host`, `commit`, `postgres_version`, `videos`, `published_videos`, `prisma_migrations`, `media_files`, và `files` (tên, kích thước, sha256) |
| `SHA256SUMS` | sha256 của 3 file dưới, dạng dùng được với `sha256sum -c` |
| `database.dump` | `pg_dump --format=custom` của database `gayvideo` |
| `media.tar` | Toàn bộ volume `media_data` (`/data/media`): thumbnail video và category |
| `env` | Bản sao `/opt/gayvideo/.env`. **Chứa mật khẩu và API key, phải giữ kín.** |

> **Không có trong backup:** mã nguồn (đã có trên GitHub), dữ liệu migration (`ronganminh/stream-video-data` trên GitHub), chứng chỉ HTTPS (Caddy tự xin lại) và video (video nằm trên các host DoodStream/VOE/EarnVids).

---

## 2. Vì sao dùng rclone với tài khoản Gmail, không dùng service account

Thư mục Drive nằm trong **My Drive của một tài khoản Gmail cá nhân**, không phải Shared Drive.

Từ năm 2024, Google không cho service account (`GDRIVE_SERVICE_ACCOUNT_JSON`) tạo file trong My Drive của người khác. Lý do là service account không có dung lượng lưu trữ riêng, nên upload sẽ bị lỗi `403 storageQuotaExceeded: Service Accounts do not have storage quota`. Muốn dùng service account thì phải có Shared Drive, mà Shared Drive chỉ có với Google Workspace.

Vì vậy workflow dùng **rclone đăng nhập bằng chính tài khoản Gmail chủ thư mục** (OAuth). File upload lên sẽ thuộc tài khoản đó và dùng dung lượng của tài khoản đó.

Secret `GDRIVE_SERVICE_ACCOUNT_JSON` hiện có chỉ dùng để đọc Drive trong các workflow migration. Workflow backup không dùng tới nó.

---

## 3. Thiết lập lần đầu

Bạn làm phần này một lần, trên máy tính cá nhân, không làm trên VPS.

### 3.1. Tạo cặp key age

1. Cài age:
   - Windows: `winget install FiloSottile.age`
   - macOS: `brew install age`
   - Ubuntu/Debian: `sudo apt install age`
2. Tạo key:
   ```bash
   age-keygen -o gayvideo-backup-key.txt
   ```
   Lệnh in ra dòng `Public key: age1…`. File `gayvideo-backup-key.txt` chứa **private key** (dòng `AGE-SECRET-KEY-1…`).
3. **Cất private key ở ít nhất 2 nơi an toàn, không nằm trên máy chủ**, ví dụ trình quản lý mật khẩu (Bitwarden, 1Password…) và một USB cất kỹ. Mất private key nghĩa là **mọi bản backup đều không mở được**.
4. Không đưa private key lên GitHub, VPS hay Google Drive.
5. Lấy lại public key bất cứ lúc nào bằng: `age-keygen -y gayvideo-backup-key.txt`.

Sau đó đặt public key vào GitHub: **Settings → Secrets and variables → Actions → Variables → New repository variable**:
- Name: `BACKUP_AGE_RECIPIENT`
- Value: `age1…` (chỉ dòng public key)

### 3.2. Tạo token Google Drive cho rclone

1. Cài rclone trên máy cá nhân, theo https://rclone.org/install/. Trên Windows có thể dùng `winget install Rclone.Rclone`.
2. Chạy lệnh dưới. Trình duyệt sẽ mở ra.
   ```bash
   rclone authorize "drive"
   ```
3. Đăng nhập **đúng tài khoản Gmail sở hữu thư mục `backup_stream_video`**, rồi bấm **Allow**.
4. Terminal in ra một đoạn JSON giữa hai dòng `--->` và `<---End paste`, dạng:
   ```json
   {"access_token":"…","token_type":"Bearer","refresh_token":"…","expiry":"…"}
   ```
   Copy **toàn bộ đoạn JSON** (từ `{` đến `}`).
5. Đặt vào GitHub: **Settings → Secrets and variables → Actions → Secrets → New repository secret**:
   - Name: `RCLONE_DRIVE_TOKEN`
   - Value: đoạn JSON vừa copy

Lưu ý:
- Token này có quyền đọc, ghi và xóa **toàn bộ Google Drive của tài khoản**. Chỉ lưu nó trong GitHub Secret, không gửi qua chat hay email.
- Workflow chỉ làm việc trong thư mục `backup_stream_video`, và chỉ xóa file có tên đúng mẫu `gayvideo-backup-YYYYMMDDTHHMMSSZ.tar.age(.sha256)`.
- Khi token hỏng (đổi mật khẩu Google, thu hồi quyền, lỗi `invalid_grant`), làm lại các bước 2–5.

**Tùy chọn: dùng OAuth client riêng.** Mặc định rclone dùng client chung, và đôi khi client này bị Google giới hạn tốc độ. Muốn dùng client riêng:
1. Vào https://console.cloud.google.com, tạo project và bật **Google Drive API**.
2. Mở **OAuth consent screen**:
   - User type **External**, thêm email của bạn vào Test users.
   - Sau đó bấm **Publish app** để chuyển sang trạng thái **In production**. Nếu app để ở trạng thái *Testing*, refresh token **hết hạn sau 7 ngày** và backup tuần sau sẽ lỗi.
3. Mở **Credentials → Create credentials → OAuth client ID**, loại **Desktop app**. Ghi lại Client ID và Client secret.
4. Chạy `rclone authorize "drive" "CLIENT_ID" "CLIENT_SECRET"`, rồi lưu JSON vào `RCLONE_DRIVE_TOKEN` như trên.
5. Thêm 2 secret `RCLONE_DRIVE_CLIENT_ID` và `RCLONE_DRIVE_CLIENT_SECRET`.

### 3.3. Danh sách secret và variable

| Loại | Tên | Bắt buộc | Ghi chú |
|---|---|---|---|
| Secret | `PROD_HOST` | có (đã có) | IP/hostname VPS |
| Secret | `PROD_USER` | có (đã có) | user SSH (`ubuntu`) |
| Secret | `PROD_KNOWN_HOSTS` | có (đã có) | dòng `ssh-keyscan` của VPS |
| Secret | `PROD_APP_DEPLOY_SSH_KEY` | có (đã có) | private key SSH dùng chung với workflow deploy |
| Variable | `BACKUP_AGE_RECIPIENT` | **có (cần thêm)** | public key age `age1…` |
| Secret | `RCLONE_DRIVE_TOKEN` | **có (cần thêm)** | JSON từ `rclone authorize "drive"` |
| Variable | `BACKUP_DRIVE_FOLDER_ID` | không | mặc định `1v2XiT3tOxBCiRuMLv6exJuVT1HfqeQko` |
| Secret | `RCLONE_DRIVE_CLIENT_ID` | không | chỉ khi dùng OAuth client riêng |
| Secret | `RCLONE_DRIVE_CLIENT_SECRET` | không | như trên |

### 3.4. Chạy thử

Vào **Actions → Weekly backup → Run workflow**:
- Lần đầu có thể tắt ô *Upload to Google Drive* để chỉ kiểm tra tạo backup trên VPS và verify.
- Sau đó chạy lại với ô này bật.

Xem kết quả ở phần **Summary** của lần chạy (tên file, kích thước, sha256, số video), và kiểm tra thư mục Drive.

---

## 4. Mỗi lần chạy, workflow làm gì

1. Kiểm tra đủ secret và variable. Thiếu cái nào thì báo lỗi rõ tên và dừng.
2. SSH vào VPS bằng `PROD_APP_DEPLOY_SSH_KEY` và chạy `scripts/backup/remote-backup.sh`:
   - `pg_dump`, tar `/data/media`, sao chép `.env`;
   - đếm số video và số migration, tính sha256, ghi `manifest.json`;
   - gửi bản tar về runner qua SSH.

   Trên VPS không còn bản chưa mã hóa nào sau bước này.
3. Runner mã hóa luồng dữ liệu bằng age ngay khi nhận, nên **bản chưa mã hóa không bao giờ được ghi xuống đĩa**. File được mã hóa cho 2 người nhận:
   - public key của chủ website;
   - một key tạm sinh ra trong lần chạy này, để bước 4 kiểm tra được. Key tạm bị xóa khi job kết thúc.
4. Chạy `scripts/backup/verify-backup.sh` trên chính file vừa mã hóa: giải mã, `sha256sum -c`, so sha256 với manifest, `pg_restore` vào PostgreSQL tạm (Docker), rồi so số video, số video đã publish, số migration và số file media với manifest.
5. Upload lên Drive:
   - file `.tar.age` và `.tar.age.sha256` (rclone kiểm tra MD5 sau khi upload);
   - `docs/BACKUP.md` thành `README.md`, ghi đè bản cũ;
   - xóa các bản cũ hơn 8 bản mới nhất. File bị xóa nằm trong Thùng rác của Drive 30 ngày.
6. Chép file đã mã hóa vào `/var/backups/gayvideo/weekly/` trên VPS và giữ 7 bản mới nhất.
7. Dọn sạch file tạm, key tạm và SSH key trên runner.

Workflow không in secret ra log, và nội dung `.env` không bao giờ xuất hiện trong log.

---

## 5. Tải backup về và kiểm tra

**Tải về:**
- Mở thư mục Drive `backup_stream_video` và tải `gayvideo-backup-<ngày>.tar.age` cùng file `.sha256` đi kèm.
- Hoặc dùng rclone, sau khi đã tạo remote tên `drive` bằng `rclone config` (loại Google Drive, đăng nhập tài khoản chủ thư mục): `rclone copy drive: ./backups --drive-root-folder-id 1v2XiT3tOxBCiRuMLv6exJuVT1HfqeQko --include "gayvideo-backup-<ngày>*"`.
- Bản trên VPS nằm ở `/var/backups/gayvideo/weekly/`. Tải về bằng `scp ubuntu@<VPS>:/var/backups/gayvideo/weekly/<file> .` (cần quyền đọc, có thể phải dùng `sudo`).

**Kiểm tra sha256 của file đã mã hóa:**
- Linux/macOS: `sha256sum -c gayvideo-backup-<ngày>.tar.age.sha256` (macOS: `shasum -a 256 -c …`). Kết quả phải là `OK`.
- Windows PowerShell: chạy `Get-FileHash gayvideo-backup-<ngày>.tar.age -Algorithm SHA256`, rồi so với nội dung file `.sha256` (không phân biệt hoa thường).

**Giải mã (trên máy cá nhân có private key):**
```bash
age --decrypt -i gayvideo-backup-key.txt -o backup.tar gayvideo-backup-<ngày>.tar.age
mkdir backup && tar -xf backup.tar -C backup && cd backup
sha256sum -c SHA256SUMS        # database.dump: OK, media.tar: OK, env: OK
cat manifest.json              # ngày, commit, số video
```

**Kiểm tra backup có restore được không** (cần Docker, `age`, `jq`):
```bash
scripts/backup/verify-backup.sh gayvideo-backup-<ngày>.tar.age gayvideo-backup-key.txt
# … BACKUP OK: 20261025T192301Z, commit abc1234, 1500 videos
```
- Thêm `KEEP_DIR=./restore` vào trước lệnh để giữ lại các file đã giải mã.
- Thêm `VERIFY_PG_URL=postgresql://…/db_trong` để restore vào một database rỗng có sẵn thay vì dùng Docker.

> Các file đã giải mã (nhất là `env`) chứa mật khẩu. Xóa chúng ngay khi dùng xong (`shred -u env` hoặc xóa rồi dọn Thùng rác).

---

## 6. Khôi phục website lên VPS mới từ đầu

Các lệnh dưới giả định VPS Ubuntu 22.04/24.04, user `ubuntu` và thư mục `/opt/gayvideo`, giống hệ thống hiện tại. Tham khảo thêm `docs/DEPLOY.md`.

### 6.0. Trước khi bắt đầu: giảm TTL của DNS

Nếu còn thời gian, ví dụ khi chuyển VPS có kế hoạch, hãy vào trang quản lý DNS của tên miền và **giảm TTL của bản ghi A/AAAA xuống 300 giây** trước ít nhất 1 ngày (bằng TTL cũ). Khi đó lúc đổi IP, người dùng sẽ thấy máy mới trong vòng khoảng 5 phút.

Nếu VPS cũ đã chết thì bỏ qua bước này. DNS sẽ cập nhật chậm hơn, tùy theo TTL cũ.

### 6.1. Chuẩn bị VPS mới

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl git age
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER" && newgrp docker
docker version && docker compose version

sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
sudo ufw --force enable
```

### 6.2. Lấy mã nguồn đúng phiên bản trong backup

```bash
sudo mkdir -p /opt/gayvideo && sudo chown "$USER":"$USER" /opt/gayvideo
git clone https://github.com/ronganminh/stream-video.git /opt/gayvideo
cd /opt/gayvideo
# Dữ liệu migration mà worker đọc (repo công khai):
git clone https://github.com/ronganminh/stream-video-data.git migration-data
```

Nên dùng đúng commit ghi trong `manifest.json` để mã nguồn khớp với database. Sau khi web chạy ổn thì cập nhật lên `main` theo hướng dẫn ở mục 11 của `docs/DEPLOY.md`.
```bash
git checkout <commit trong manifest.json>
```

### 6.3. Đưa các file backup lên VPS

**Giải mã trên máy cá nhân** (mục 5). Không chép private key lên VPS. Sau đó gửi 3 file lên:
```bash
scp database.dump media.tar env ubuntu@<IP-VPS-MỚI>:/tmp/
```

### 6.4. Đặt `.env`

```bash
cd /opt/gayvideo
install -m 600 /tmp/env .env
nano .env   # nếu đổi tên miền: sửa SITE_DOMAIN; các mật khẩu giữ nguyên
set -a; . ./.env; set +a
docker compose config --quiet
```

### 6.5. Khôi phục database

```bash
docker compose up -d postgres
until docker compose exec -T postgres pg_isready -U gayvideo -d gayvideo; do sleep 2; done
docker compose exec -T postgres sh -ec \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error' < /tmp/database.dump
docker compose exec -T postgres psql -U gayvideo -d gayvideo -Atc 'SELECT count(*) FROM "Video"'
#   -> phải bằng "videos" trong manifest.json
```

Database phải **trống** trước khi restore. Volume mới tạo thì luôn trống. Nếu đã lỡ chạy app, làm trống lại bằng:
`docker compose exec -T postgres sh -ec 'dropdb -U "$POSTGRES_USER" "$POSTGRES_DB"; createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'`.

### 6.6. Build worker, chạy migration, khôi phục media

```bash
docker compose build worker
docker compose run --rm worker ./node_modules/.bin/prisma migrate deploy   # thường báo "No pending migrations"
docker compose run --rm --no-deps -T worker tar -C /data -xf - < /tmp/media.tar
docker compose run --rm --no-deps worker sh -c 'find /data/media -type f | wc -l'
#   -> phải bằng "media_files" trong manifest.json
```

### 6.7. Build web và chạy toàn bộ

```bash
docker compose build web
docker compose up -d worker web caddy
docker compose ps        # postgres, web, worker, caddy đều healthy
```

### 6.8. Kiểm tra trước khi đổi DNS

Caddy chỉ xin được chứng chỉ HTTPS **sau khi** DNS trỏ về VPS mới. Trước đó, kiểm tra trên chính VPS:
```bash
docker compose exec -T web node -e \
  "fetch('http://127.0.0.1:3000/robots.txt').then(r => console.log('web:', r.status))"   # web: 200
docker compose logs --tail=50 web worker
```

### 6.9. Đổi DNS

1. Ở trang quản lý DNS, sửa bản ghi **A** (và **AAAA** nếu có) của tên miền sang IP VPS mới.
2. Chờ hết TTL. Kiểm tra bằng `dig +short <tên-miền>`, hoặc https://dnschecker.org.
3. Khi DNS đã trỏ đúng, Caddy tự xin chứng chỉ. Kiểm tra:
   ```bash
   curl -fsS "https://$SITE_DOMAIN/robots.txt" >/dev/null && echo OK
   ```
4. Sau 1–2 ngày chạy ổn, **tăng TTL trở lại** (ví dụ 3600).

### 6.10. Nối lại GitHub Actions với VPS mới

1. Thêm public key tương ứng với `PROD_APP_DEPLOY_SSH_KEY` vào `~/.ssh/authorized_keys` của user `ubuntu` trên VPS mới.
2. Cập nhật các secret:
   - `PROD_HOST`: IP mới;
   - `PROD_KNOWN_HOSTS`: kết quả của `ssh-keyscan -t ed25519 <IP-mới>`, chạy từ máy bạn;
   - các secret khác có chứa IP cũ, nếu có.
3. Chạy **Actions → Deploy production** để chắc chắn deploy được, rồi chạy **Weekly backup** một lần.
4. (Tùy chọn) cài lại cron dump database hằng ngày: mục 9 của `docs/DEPLOY.md`.
5. Xóa các file đã giải mã: `shred -u /tmp/database.dump /tmp/media.tar /tmp/env`.

---

## 7. Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `X is not configured` | Thiếu secret hoặc variable | Thêm theo bảng ở mục 3.3 |
| `must be an age public key` | Dán nhầm private key vào `BACKUP_AGE_RECIPIENT` | **Thay ngay** bằng public key `age1…`, tạo cặp key mới và giữ kín key cũ (coi như đã lộ) |
| `Cannot open the Drive folder` / `invalid_grant` | Token Drive hết hạn hoặc bị thu hồi; app OAuth riêng đang ở trạng thái Testing (hết hạn sau 7 ngày) | Làm lại mục 3.2 và cập nhật `RCLONE_DRIVE_TOKEN` |
| `storageQuotaExceeded` | Drive của tài khoản Gmail đã đầy | Dọn Drive hoặc Thùng rác, hoặc mua thêm dung lượng |
| `Creating the backup on the VPS failed` | VPS đầy đĩa, container không chạy, user không có quyền docker/sudo | Xem log của bước này, chạy `df -h` và `docker compose ps` trên VPS |
| `did not restore` | Bản dump hoặc media bị lỗi | **Không bị upload.** Xem log của bước verify, rồi chạy lại workflow |

---

## 8. Ghi chú bảo mật

- File `.tar.age` có thể để trên Drive: không có private key thì không ai đọc được.
- Private key age và `RCLONE_DRIVE_TOKEN` là hai thứ quan trọng nhất. Đổi ngay nếu nghi bị lộ.
- **Đổi key age:** tạo key mới, cập nhật `BACKUP_AGE_RECIPIENT`. Giữ key cũ cho tới khi các bản cũ bị xoay vòng hết (8 tuần).
- **Đổi token Drive:** thu hồi quyền tại https://myaccount.google.com/permissions rồi làm lại mục 3.2.
- File `env` trong backup chứa mật khẩu database, `ADMIN_SESSION_SECRET` và API key của các host. Khi khôi phục lên máy khác, nên cân nhắc đổi các giá trị này.
