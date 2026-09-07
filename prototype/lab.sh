#!/bin/sh
# Starts the generator lab at http://localhost:8777/lab.html
#
# A server is needed because ES modules do not load from file:// (CORS), and
# the lab saves generated boards to prototype/boards/ through POST /api/boards.
# The server disables caching — otherwise the browser keeps serving the old
# engine.mjs after an edit.
set -e
cd "$(dirname "$0")"
PORT=${1:-8777}
node lab-server.mjs "$PORT" &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT INT TERM
sleep 1
open "http://localhost:$PORT/lab.html" 2>/dev/null || true
wait $SRV
