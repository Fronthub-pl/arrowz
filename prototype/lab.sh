#!/bin/sh
# Starts the generator lab at http://localhost:8777/lab.html
#
# A server is needed because ES modules do not load from file:// (CORS), and
# the lab saves generated boards to prototype/boards/ through POST /api/boards.
# The page and the worker are TypeScript: `deno task bundle` builds them into
# prototype/dist/ once, then rebuilds on every edit; the server never caches.
set -e
cd "$(dirname "$0")/.."
PORT=${1:-8777}
deno task bundle
deno task bundle --watch &
WATCH=$!
deno run --allow-net --allow-read --allow-write --allow-env prototype/lab-server.ts "$PORT" &
SRV=$!
trap 'kill $WATCH $SRV 2>/dev/null' EXIT INT TERM
sleep 1
open "http://localhost:$PORT/lab.html" 2>/dev/null || true
wait $SRV
