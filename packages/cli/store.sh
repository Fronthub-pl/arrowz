#!/bin/sh
# Starts the board store at http://localhost:8777/api/boards
#
# The lab itself is `apps/lab` (`pnpm nx serve lab`, port 8779); this serves
# the store it reads and writes, through the proxy in apps/lab/vite.proxy.ts.
# The CLI writes the same directory directly, without this server.
set -e
cd "$(dirname "$0")"
PORT=${1:-8777}
# The server gets what it serves and nothing more: this machine's network on
# the one port it binds, and the store, which it reads and writes. A relative
# or symlinked ARROWZ_BOARDS_DIR is made absolute and exported back under the
# same name, so the grant and the directory the server opens are one string:
# the server resolves its own base from exactly what was granted, never from
# a spelling of the same directory that the grant, naming it another way,
# does not cover.
BOARDS=${ARROWZ_BOARDS_DIR:-$PWD/boards}
mkdir -p "$BOARDS"
BOARDS=$(cd "$BOARDS" && pwd)
export ARROWZ_BOARDS_DIR="$BOARDS"
exec deno run --allow-net="127.0.0.1:$PORT" --allow-read="$BOARDS" --allow-write="$BOARDS" --allow-env=ARROWZ_BOARDS_DIR \
  store-server.ts "$PORT"
