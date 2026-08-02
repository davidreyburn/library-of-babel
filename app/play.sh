#!/bin/sh
# Serves the Library at top level, outside any iframe, which is the only way
# the Pointer Lock API is available -- the published artifact renders in a
# frame sandboxed "allow-scripts allow-same-origin allow-forms" with no
# allow-pointer-lock, so real mouse capture can never be granted there.
#
# Node only; no packages. Ctrl+C stops it.
cd "$(dirname "$0")/.." || exit 1
URL="http://127.0.0.1:8731/app/babel-phase1.html"
( sleep 1
  if   command -v xdg-open >/dev/null 2>&1; then xdg-open  "$URL"
  elif command -v open     >/dev/null 2>&1; then open      "$URL"
  fi ) &
exec node tools/serve.mjs 8731
