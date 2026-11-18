#!/bin/sh
# app.html is already a complete document, so copy instead of nesting HTML.
set -eu
cd "$(dirname "$0")"
mkdir -p public
cp app.html public/index.html
