#!/bin/sh
# Uruchamia laboratorium generatora pod http://localhost:8777/lab.html
#
# Serwer jest potrzebny, bo moduły ESM nie ładują się z file:// (blokada CORS).
# Wyłączamy też pamięć podręczną — inaczej po edycji engine.mjs przeglądarka
# serwuje starą wersję i mierzy się nieistniejące zmiany.
set -e
cd "$(dirname "$0")"
PORT=${1:-8777}
echo "Laboratorium: http://localhost:$PORT/lab.html   (Ctrl+C kończy)"
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
