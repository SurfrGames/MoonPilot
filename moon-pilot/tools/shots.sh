#!/usr/bin/env bash
# Takes store screenshots with headless Google Chrome. Needs the local server running on port 8767.
#   bash tools/shots.sh      -> store/*.png (1920x1080) and www/img/shot-*.jpg for the web manifest
set -uo pipefail
cd "$(dirname "$0")/.."
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
[ -x "$CHROME" ] || { echo "Google Chrome not found"; exit 1; }
mkdir -p store
snap() {  # name, size, scene
  timeout 150 "$CHROME" --headless=new --user-data-dir="$(cygpath -w "$TEMP/mp_chrome")" --no-first-run --hide-scrollbars --mute-audio \
    --window-size="$2" --virtual-time-budget=12000 --screenshot="$(cygpath -w "$PWD/store/$1.png")" "http://localhost:8767/?shot=$3" >/dev/null 2>&1
  [ -s "store/$1.png" ] && echo "store/$1.png" || echo "FAILED $1"
}
snap 1-home 1920,1080 home
snap 2-landing 1920,1080 landing
snap 3-launch 1920,1080 launch
snap 4-orbit 1920,1080 orbit
snap narrow-home 720,1280 home
python - <<'PY'
from PIL import Image
Image.open("store/2-landing.png").convert("RGB").resize((1280, 720), Image.LANCZOS).save("www/img/shot-wide.jpg", quality=84)
Image.open("store/narrow-home.png").convert("RGB").save("www/img/shot-narrow.jpg", quality=84)
print("wrote www/img/shot-wide.jpg and shot-narrow.jpg")
PY
