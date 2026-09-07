#!/bin/sh
# Runs the generator laboratory at http://localhost:8777/lab.html
#
# The server is needed because ESM modules do not load from file:// (CORS block).
# We also disable caching — otherwise, after editing engine.mjs, the browser
# serves the old version and you end up measuring nonexistent changes.
set -e
cd "$(dirname "$0")"
PORT=${1:-8777}
echo "Laboratory: http://localhost:$PORT/lab.html   (Ctrl+C quits)"
python3 - "$PORT" <<'PY' &
import http.server, socketserver, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()
    def log_message(self, *args):
        pass

with socketserver.TCPServer(('127.0.0.1', int(sys.argv[1])), NoCache) as srv:
    srv.serve_forever()
PY
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT INT TERM
sleep 1
open "http://localhost:$PORT/lab.html" 2>/dev/null || true
wait $SRV
