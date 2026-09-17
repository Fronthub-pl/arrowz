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
# ARROWZ_BOARDS_DIR is made absolute before it is granted, so that the grant
# and the path the server opens are spelled the same way: the server resolves
# its own base, and a grant that names the same directory by another path is
# read access the store's own files do not have.
BOARDS=${ARROWZ_BOARDS_DIR:-$PWD/boards}
mkdir -p "$BOARDS"
BOARDS=$(cd "$BOARDS" && pwd)
exec deno run --allow-net="127.0.0.1:$PORT" --allow-read="$BOARDS" --allow-write="$BOARDS" --allow-env=ARROWZ_BOARDS_DIR \
  store-server.ts "$PORT"
