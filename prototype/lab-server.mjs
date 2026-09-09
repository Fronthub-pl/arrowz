// Lab server: static files from prototype/ without caching (an edited
// engine.mjs must reach the browser immediately) plus the board store under
// /api/boards (GET list, POST save, DELETE one) and /boards/. Replaces the Python server from lab.sh because
// the browser has to be able to WRITE a board to disk. No dependencies.
// Run: node prototype/lab-server.mjs [port]
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boardsDir, deleteBoard, listBoards, saveBoard } from './store.mjs'

const ROOT = dirname(fileURLToPath(import.meta.url))
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.css': 'text/css',
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store, must-revalidate' })
  res.end(body)
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}

export function createLabServer() {
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    try {
      if (url.pathname === '/api/boards' && req.method === 'GET') {
        return send(res, 200, JSON.stringify(listBoards()))
      }
      if (url.pathname === '/api/boards' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        if (typeof body.svg !== 'string' || !body.params) {
          return send(res, 400, '{"error":"svg and params are required"}')
        }
        return send(res, 201, JSON.stringify(saveBoard({ ...body, source: body.source ?? 'lab' })))
      }
      // Segments are matched on the raw path and decoded one by one, so an
      // encoded slash cannot smuggle a directory step into a name.
      const del = req.method === 'DELETE' && /^\/api\/boards\/([^/]+)\/([^/]+)$/.exec(url.pathname)
      if (del) {
        let ok
        try {
          ok = deleteBoard(decodeURIComponent(del[1]), decodeURIComponent(del[2]))
        } catch (err) {
          return send(res, 400, JSON.stringify({ error: err.message }))
        }
        return send(res, ok ? 200 : 404, JSON.stringify({ deleted: ok }))
      }
      if (req.method !== 'GET') return send(res, 405, '{"error":"GET only"}')

      // The store may live outside prototype/ (ARROWZ_BOARDS_DIR), so /boards/
      // has its own base directory. The normalised path must stay inside it.
      const rel = decodeURIComponent(url.pathname === '/' ? '/lab.html' : url.pathname)
      const inBoards = rel.startsWith('/boards/')
      const baseDir = resolve(inBoards ? boardsDir() : ROOT)
      const file = normalize(join(baseDir, inBoards ? rel.slice('/boards/'.length) : rel.slice(1)))
      if (!file.startsWith(baseDir + sep)) return send(res, 403, '{"error":"outside base directory"}')
      const data = await readFile(file)
      return send(res, 200, data, MIME[extname(file)] ?? 'application/octet-stream')
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'EISDIR') return send(res, 404, '{"error":"not found"}')
      return send(res, 500, JSON.stringify({ error: err.message }))
    }
  })
}

// Direct run (not when imported by tests).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? 8777)
  createLabServer().listen(port, '127.0.0.1', () => {
    console.log(`Lab: http://localhost:${port}/lab.html   (Ctrl+C stops)`)
  })
}
