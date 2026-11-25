#!/usr/bin/env bash
# One-time move, on the production server, of the other site's Caddy block
# (between the lines "# --- LSX ..." and "# --- hết LSX ---", added by hand to
# Caddyfile and Caddyfile.template) into caddy-sites/lsx.caddy, which the
# Caddyfile imports (see Caddyfile.template). Nothing about that site is in
# this repository: the script reads it from the server's Caddyfile.
#
#   cd /opt/gayvideo && git fetch -q origin main \
#     && bash <(git show origin/main:scripts/ops/move-lsx-to-caddy-sites.sh)
#
# Order: back up, extract, validate main's Caddyfile + caddy-sites with
# caddy validate/adapt, and only then git checkout the two files. The running
# Caddy keeps its loaded config until the next deploy recreates it, so the
# other site is never left without its block. Safe to run again. Everything
# is logged to ~/move-lsx.log.
set -Eeuo pipefail

LOG="$HOME/move-lsx.log"
exec > >(tee -a "$LOG") 2>&1
STEP="khởi động"
trap 'code=$?; if [ "$code" -ne 0 ]; then echo "LỖI ở bước \"$STEP\" (mã $code): chưa checkout Caddyfile, LSX vẫn chạy như cũ. Xem $LOG"; fi' EXIT
fail() { echo "LỖI: $*"; exit 1; }
step() { STEP="$2"; echo; echo "[$1/6] $2"; }

APP_DIR="${APP_DIR:-/opt/gayvideo}"
START='^# --- LSX '
END='^# --- hết LSX ---'
echo "=== move-lsx-to-caddy-sites $(date -Is) ==="
cd "$APP_DIR"

GIT="git"; [ -w .git ] || GIT="sudo -n git"
SUDO=""; [ -w . ] || SUDO="sudo -n"
DOCKER="${MOVE_LSX_DOCKER:-docker}"
if [ -z "${MOVE_LSX_DOCKER:-}" ] && ! docker info >/dev/null 2>&1; then DOCKER="sudo -n docker"; fi
echo "git: $GIT · ghi file: ${SUDO:-không cần sudo} · docker: $DOCKER"

step 1 "Kiểm tra main đã có caddy-sites (PR #92)"
$GIT fetch -q origin main
$GIT cat-file -e origin/main:caddy-sites/.gitkeep 2>/dev/null || fail "origin/main chưa có caddy-sites/: merge PR trước. Chưa đổi gì."
$GIT show origin/main:Caddyfile | grep -q '^import /etc/caddy/sites/\*\.caddy$' || fail "Caddyfile của main không import /etc/caddy/sites. Chưa đổi gì."
echo "ok: main import /etc/caddy/sites/*.caddy"

step 2 "Sao lưu Caddyfile, Caddyfile.template và phần sửa tay"
BK="$HOME/caddy-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BK"
cp -a Caddyfile Caddyfile.template "$BK"/ 2>/dev/null || sudo -n cat Caddyfile > "$BK/Caddyfile"
[ -f "$BK/Caddyfile.template" ] || sudo -n cat Caddyfile.template > "$BK/Caddyfile.template"
$GIT diff -- Caddyfile Caddyfile.template > "$BK/local-edits.diff" || true
[ -f caddy-sites/lsx.caddy ] && cp -a caddy-sites/lsx.caddy "$BK/lsx.caddy.before" 2>/dev/null || true
echo "ok: $BK ($(wc -l < "$BK/local-edits.diff") dòng diff)"

step 3 "Cắt khối LSX giữa hai dòng đánh dấu"
extract() { awk -v s="$START" -v e="$END" '$0 ~ s {f=1} f {print} f && $0 ~ e {f=0; done=1} END {if (!done) exit 3}' "$1"; }
if BLOCK=$(extract Caddyfile); then
  SRC="Caddyfile"
elif [ -f caddy-sites/lsx.caddy ] && BLOCK=$(extract caddy-sites/lsx.caddy) && $GIT diff --quiet -- Caddyfile Caddyfile.template; then
  SRC="caddy-sites/lsx.caddy (đã chuyển từ lần chạy trước)"
else
  fail "không thấy cặp dòng đánh dấu LSX trong Caddyfile (và chưa có caddy-sites/lsx.caddy)."
fi
[ "$(printf '%s' "$BLOCK" | tr -cd '{' | wc -c)" = "$(printf '%s' "$BLOCK" | tr -cd '}' | wc -c)" ] || fail "khối LSX lệch số ngoặc { }."
UPSTREAMS=$(printf '%s\n' "$BLOCK" | awk '$1 == "reverse_proxy" { for (i = 2; i <= NF; i++) if ($i != "{") print $i }' | sort -u)
[ -n "$UPSTREAMS" ] || fail "khối LSX không có reverse_proxy."
echo "ok: $(printf '%s\n' "$BLOCK" | wc -l) dòng từ $SRC; upstream: $(echo $UPSTREAMS)"
if [ "$SRC" = "Caddyfile" ]; then
  TBLOCK=$(extract Caddyfile.template || true)
  [ "$BLOCK" = "$TBLOCK" ] || echo "CẢNH BÁO: khối trong Caddyfile.template khác Caddyfile; dùng bản trong Caddyfile (đang chạy). Bản sao lưu: $BK"
  $SUDO mkdir -p caddy-sites
  printf '%s\n' "$BLOCK" | $SUDO tee caddy-sites/lsx.caddy.tmp >/dev/null
  $SUDO mv caddy-sites/lsx.caddy.tmp caddy-sites/lsx.caddy
  echo "ok: đã ghi caddy-sites/lsx.caddy"
fi

step 4 "Kiểm tra cấu hình MỚI (Caddyfile của main + caddy-sites) bằng caddy validate/adapt"
NEW="$BK/Caddyfile.main"
$GIT show origin/main:Caddyfile > "$NEW"
SITE_DOMAIN=$( (cat .env 2>/dev/null || sudo -n cat .env) | sed -n 's/^SITE_DOMAIN=//p' | tail -1 | tr -d "\"'")
[ -n "$SITE_DOMAIN" ] || fail "không đọc được SITE_DOMAIN trong .env."
caddy_run() { $DOCKER run --rm -e SITE_DOMAIN="$SITE_DOMAIN" -v "$NEW:/etc/caddy/Caddyfile:ro" -v "$PWD/caddy-sites:/etc/caddy/sites:ro" caddy:2-alpine caddy "$@" --config /etc/caddy/Caddyfile; }
caddy_run validate || fail "caddy validate báo lỗi với cấu hình mới."
JSON=$(caddy_run adapt 2>/dev/null) || fail "caddy adapt báo lỗi."
for upstream in $UPSTREAMS; do
  printf '%s' "$JSON" | grep -qF "${upstream#*://}" || fail "cấu hình mới thiếu upstream $upstream của LSX."
done
echo "ok: hợp lệ, có đủ upstream của LSX"

step 5 "Trả Caddyfile và Caddyfile.template về bản trong git"
$GIT checkout -- Caddyfile Caddyfile.template
$GIT diff --quiet -- Caddyfile Caddyfile.template || fail "Caddyfile vẫn còn sửa đổi sau checkout."
echo "ok: hết sửa tay; Caddy đang chạy vẫn giữ cấu hình đã nạp (gồm LSX) tới lần deploy"

step 6 "Tóm tắt"
$GIT status --short -- Caddyfile Caddyfile.template caddy-sites || true
ls -l caddy-sites/
echo "Sao lưu: $BK · Log: $LOG"
STEP="xong"
echo "OK: đã chuyển LSX, có thể deploy"
