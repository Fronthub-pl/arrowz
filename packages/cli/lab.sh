#!/bin/sh
# Starts the generator lab at http://localhost:8777/lab.html
#
# A server is needed because ES modules do not load from file:// (CORS), and
# the lab saves generated boards to packages/cli/boards/ through POST /api/boards.
# The page and the worker are TypeScript: `deno task bundle` builds them into
# packages/cli/dist/ once, then rebuilds on every edit; the server never caches.
set -e
cd "$(dirname "$0")"
PORT=${1:-8777}
# The page bundles the board element, whose Lit comes only from pnpm's node_modules.
if [ ! -e ../board-element/node_modules/lit ]; then
  echo 'lab.sh: run "corepack enable pnpm && pnpm install" at the repository root first (the lab bundles the board element and its Lit)' >&2
  exit 1
fi
deno task bundle
# The trap is armed before the first background job, so a Ctrl+C in the gap
# between the two starts still kills what is already running.
WATCH=; SRV=;
trap 'kill $WATCH $SRV 2>/dev/null' EXIT INT TERM
deno task bundle --watch &
WATCH=$!
deno run --allow-net --allow-read --allow-write --allow-env lab-server.ts "$PORT" &
SRV=$!
sleep 1
open "http://localhost:$PORT/lab.html" 2>/dev/null || true
wait $SRV
