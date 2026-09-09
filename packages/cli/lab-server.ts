// Lab server: static files from packages/cli/ without caching (a rebuilt bundle
// must reach the browser immediately) plus the board store under /api/boards
// (GET list, POST save, DELETE one) and /boards/. Run: deno task lab, or
// deno run --allow-net --allow-read --allow-write --allow-env packages/cli/lab-server.ts [port]
import { dirname, extname, fromFileUrl, join, normalize, resolve, SEPARATOR } from '@std/path'
import { boardsDir, deleteBoard, listBoards, saveBoard, type SaveInput } from './store.ts'

const ROOT = dirname(fromFileUrl(import.meta.url))
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.css': 'text/css',
}

function send(status: number, body: BodyInit, type = 'application/json'): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': type, 'Cache-Control': 'no-store, must-revalidate' },
  })
}

/** What the lab posts: a SaveInput whose source may be missing (the server fills in 'lab'). */
type PostBody = Omit<SaveInput, 'source'> & { source?: string }

/** Runtime check of a POST body: the two fields the store cannot do without. */
function isPostBody(v: unknown): v is PostBody {
  if (typeof v !== 'object' || v === null) return false
  const o = v as { svg?: unknown; params?: unknown }
  return typeof o.svg === 'string' && typeof o.params === 'object' && o.params !== null
}

export function createLabServer(): (req: Request) => Promise<Response> {
  return async (req) => {
    const url = new URL(req.url)
    try {
      if (url.pathname === '/api/boards' && req.method === 'GET') return send(200, JSON.stringify(listBoards()))
      if (url.pathname === '/api/boards' && req.method === 'POST') {
        const body: unknown = JSON.parse(await req.text())
        if (!isPostBody(body)) return send(400, '{"error":"svg and params are required"}')
        return send(201, JSON.stringify(saveBoard({ ...body, source: body.source ?? 'lab' })))
      }
      // Segments are matched on the raw path and decoded one by one, so an
      // encoded slash cannot smuggle a directory step into a name.
      const del = req.method === 'DELETE' ? /^\/api\/boards\/([^/]+)\/([^/]+)$/.exec(url.pathname) : null
      if (del) {
        const [, size = '', id = ''] = del
        let ok: boolean
        try {
          ok = deleteBoard(decodeURIComponent(size), decodeURIComponent(id))
        } catch (err) {
          return send(400, JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
        }
        return send(ok ? 200 : 404, JSON.stringify({ deleted: ok }))
      }
      if (req.method !== 'GET') return send(405, '{"error":"GET only"}')

      // The store may live outside packages/cli/ (ARROWZ_BOARDS_DIR), so /boards/
      // has its own base directory. The normalised path must stay inside it.
      const rel = decodeURIComponent(url.pathname === '/' ? '/lab.html' : url.pathname)
      const inBoards = rel.startsWith('/boards/')
      const baseDir = resolve(inBoards ? boardsDir() : ROOT)
      const file = normalize(join(baseDir, inBoards ? rel.slice('/boards/'.length) : rel.slice(1)))
      if (!file.startsWith(baseDir + SEPARATOR)) return send(403, '{"error":"outside base directory"}')
      let info: Deno.FileInfo
      try {
        info = await Deno.stat(file)
      } catch (err) {
        // Only a missing file is a 404; a permission error or a broken disk is
        // a server fault and goes to the outer catch as a 500.
        if (!(err instanceof Deno.errors.NotFound)) throw err
        const hint = rel.startsWith('/dist/') ? ' (run: deno task bundle)' : ''
        return send(404, JSON.stringify({ error: `not found${hint}` }))
      }
      if (!info.isFile) return send(404, '{"error":"not found"}')
      const data = await Deno.readFile(file)
      return send(200, data, MIME[extname(file)] ?? 'application/octet-stream')
    } catch (err) {
      return send(500, JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
    }
  }
}

if (import.meta.main) {
  const port = Number(Deno.args[0] ?? 8777)
  Deno.serve(
    {
      port,
      hostname: '127.0.0.1',
      onListen: () => console.log(`Lab: http://localhost:${port}/lab.html   (Ctrl+C stops)`),
    },
    createLabServer(),
  )
}
