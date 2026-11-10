#!/usr/bin/env bash
# Publishes www/ to the public play repo, which GitHub Pages serves at
# https://surfrgames.github.io/moonpilot-play/   Usage: bash tools/deploy-pages.sh "what changed"
set -euo pipefail
REPO=SurfrGames/moonpilot-play
SRC="$(cd "$(dirname "$0")/../www" && pwd)"
TMP="$(mktemp -d)"
if gh repo view "$REPO" >/dev/null 2>&1; then
  gh repo clone "$REPO" "$TMP" -- -q
  find "$TMP" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
else
  git init -q -b main "$TMP"
  gh repo create "$REPO" --public --description "Moon Pilot: fly a real-physics Moon rocket against an AI. Play in the browser." >/dev/null
  git -C "$TMP" remote add origin "https://github.com/$REPO.git"
fi
cp -r "$SRC"/. "$TMP"/ && touch "$TMP/.nojekyll"
git -C "$TMP" add -A
git -C "$TMP" commit -q -m "${1:-Update web build}" || { echo "nothing new to publish"; exit 0; }
git -C "$TMP" push -q -u origin main
gh api "repos/$REPO/pages" >/dev/null 2>&1 || gh api -X POST "repos/$REPO/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null
echo "published: https://surfrgames.github.io/moonpilot-play/"
