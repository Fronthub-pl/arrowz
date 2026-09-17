#!/bin/sh
# Starts the board store at http://localhost:8777/api/boards
#
# The lab itself is `apps/lab` (`pnpm nx serve lab`, port 8779); this serves
# the store it reads and writes, through the proxy in apps/lab/vite.proxy.ts.
# The CLI writes the same directory directly, without this server.
set -e
cd "$(dirname "$0")"
PORT=${1:-8777}
# The server gets what it serves and nothing more: the network on this
# machine, and the store, which it reads and writes.
BOARDS=${ARROWZ_BOARDS_DIR:-$PWD/boards}
mkdir -p "$BOARDS"
exec deno run --allow-net=127.0.0.1 --allow-read="$BOARDS" --allow-write="$BOARDS" --allow-env=ARROWZ_BOARDS_DIR \
  lab-server.ts "$PORT"
