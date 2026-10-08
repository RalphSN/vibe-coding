#!/bin/sh
# 由 scripts/build.ps1 產生，請改 ai-dev-rules 的來源（core/、skills/、workflows/、agents/、enforcement/），不要改這裡
# 把分段檔組成單一 index.html；組合前先對每個模組的 <script> 跑 node --check
# 用法：sh build.sh <分段資料夾> <輸出的 index.html>
set -e
D=${1:?請給分段資料夾}
OUT=${2:?請給輸出路徑}
# node --check 只認 .js 副檔名，暫存檔放在臨時資料夾裡並取名 chk.js（macOS、Linux、Git Bash 都可用）
TMPD=$(mktemp -d)
TMP="$TMPD/chk.js"
for f in "$D"/m*.html; do
  sed -e '1,/<script>/d' -e '/<\/script>/,$d' "$f" > "$TMP"
  node --check "$TMP" || { echo "語法錯誤：$f"; rm -rf "$TMPD"; exit 1; }
done
rm -rf "$TMPD"
cat "$D/a-head1.html" "$D/b-widgets.css" "$D/a-head2.html" "$D/c-data.html" "$D/d-sources.html" \
  $(ls "$D"/m*.html | sort) "$D/e-engine1.js" "$D/f-widgets.js" "$D/e-engine2.js" > "$OUT"
wc -c "$OUT"
