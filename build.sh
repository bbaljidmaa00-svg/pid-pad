#!/bin/sh
set -e
cd "$(dirname "$0")"
mkdir -p public
# The current app.html is already a complete document.
if head -c 300 app.html | grep -qi '<!doctype html>'; then
  cp app.html public/index.html
else
  { printf '<!doctype html>\n<html lang="mn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n'; cat app.html; printf '\n</body></html>\n'; } > public/index.html
fi
