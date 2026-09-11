// Lab server: static files from packages/cli/ without caching (a rebuilt bundle
// must reach the browser immediately) plus the board store under /api/boards
// (GET list, POST save a board file, DELETE one) and /boards/. Run: deno task lab, or
// deno run --allow-net --allow-read --allow-write --allow-env packages/cli/lab-server.ts [port]
import { dirname, extname, fromFileUrl, join, normalize, resolve, SEPARATOR } from '@std/path'
import { decodeBoard, defaultParams, encodeBoard, formatViolation, PARAM_SPEC, validateParams } from '@arrowz/engine'
import type { Params, View } from '@arrowz/engine'
import { DEFAULT_VIEW } from '@arrowz/engine/command'
import { boardsDir, deleteBoard, listBoards, saveBoard, type SaveInput } from './store.ts'

/** The largest POST body read. The lab posts no SVG, and a 1000×1000 board file is about a megabyte. */
export const MAX_BODY = 16 * 1024 * 1024
/** The longest command or simple command stored. */
const MAX_TEXT = 4096
const SOURCES: readonly string[] = ['lab', 'cli']

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

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isText = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_TEXT
type Checked<T> = { ok: T } | { error: string }
type Metrics = NonNullable<SaveInput['metrics']>

/**
 * The params of a POST, rebuilt from the knobs of PARAM_SPEC only: ruleB,
 * voidFrac and keys the engine does not know keep their defaults, and the
 * result must pass the engine's envelope, so the store holds only boards the
 * engine would generate. The seed goes into file names; a string or a
 * fraction never gets that far.
 */
function checkParams(v: unknown): Checked<Params> {
  if (!isRec(v)) return { error: 'params are required' }
  const params = defaultParams()
  for (const s of PARAM_SPEC) {
    const value = v[s.key]
    if (!isNum(value)) return { error: `params.${s.key} must be a number` }
    params[s.key] = value
  }
  const violations = validateParams(params)
  if (violations.length) return { error: `params: ${violations.map(formatViolation).join('; ')}` }
  return { ok: params }
}

const VIEW_NUMBERS = ['cell', 'stroke', 'headWidth', 'headHeight', 'top'] as const

function checkView(v: unknown): Checked<View> {
  if (!isRec(v)) return { error: 'view is required' }
  const view: View = { ...DEFAULT_VIEW }
  for (const k of VIEW_NUMBERS) {
    const value = v[k]
    if (!isNum(value) || value < 0) return { error: `view.${k} must be a number of at least 0` }
    view[k] = value
  }
  if (typeof v.colored !== 'boolean') return { error: 'view.colored must be true or false' }
  view.colored = v.colored
  // A board saved before rounded corners existed has no rounded field.
  if (v.rounded !== undefined) {
    if (typeof v.rounded !== 'boolean') return { error: 'view.rounded must be true or false' }
    view.rounded = v.rounded
  }
  return { ok: view }
}

const METRIC_NUMBERS = ['pieces', 'maxLen', 'genMs', 'restarts', 'backtracks'] as const
const METRIC_FLAGS = ['ok', 'aborted'] as const

/** The closing report of a POST. Absent and null fields stay absent: the store writes null for them. */
function checkMetrics(v: unknown): Checked<Metrics> {
  if (v === undefined) return { ok: {} }
  if (!isRec(v)) return { error: 'metrics must be an object' }
  const metrics: Metrics = {}
  for (const k of METRIC_NUMBERS) {
    const value = v[k]
    if (value === undefined || value === null) continue
    if (!isNum(value) || value < 0) return { error: `metrics.${k} must be a number of at least 0` }
    metrics[k] = value
  }
  for (const k of METRIC_FLAGS) {
    const value = v[k]
    if (value === undefined || value === null) continue
    if (typeof value !== 'boolean') return { error: `metrics.${k} must be true or false` }
    metrics[k] = value
  }
  const stuck = v.stuck
  if (stuck !== undefined && stuck !== null) {
    const sizes = isRec(stuck) ? stuck.sizes : undefined
    const heads = isRec(stuck) ? stuck.heads : undefined
    const remaining = isRec(stuck) ? stuck.remaining : undefined
    if (!isNum(remaining) || !Array.isArray(sizes) || !(heads === null || isNum(heads))) {
      return { error: 'metrics.stuck is not a closing report' }
    }
    // Filtered rather than asserted: a length that changes is an entry that was not a number.
    const numbers = sizes.filter(isNum)
    if (numbers.length !== sizes.length) return { error: 'metrics.stuck is not a closing report' }
    metrics.stuck = { remaining, sizes: numbers, heads }
  }
  return { ok: metrics }
}

/**
 * Runtime check of a POST body, field by field. Returns the SaveInput to
 * store, built from checked values only, or the reason it was refused. The
 * board is stored as encodeBoard writes it, so keys the engine does not know
 * never reach the file; a valid file encodes back to itself.
 */
function checkPost(v: unknown): Checked<SaveInput> {
  if (!isRec(v)) return { error: 'the body is not a JSON object' }
  // The lab exports its SVG in the browser and never posts one; a stored SVG
  // from a request would be markup of the requester's choosing.
  if (v.svg !== undefined) return { error: 'svg is not accepted: the lab exports its SVG in the browser' }
  const params = checkParams(v.params)
  if ('error' in params) return params
  let board
  try {
    board = decodeBoard(v.board)
  } catch (err) {
    return { error: `board: ${err instanceof Error ? err.message : String(err)}` }
  }
  if (board.W !== params.ok.W || board.H !== params.ok.H) {
    return { error: `board file is ${board.W}x${board.H}, the params ask for ${params.ok.W}x${params.ok.H}` }
  }
  const view = checkView(v.view)
  if ('error' in view) return view
  const metrics = checkMetrics(v.metrics)
  if ('error' in metrics) return metrics
  const command = v.command
  if (!isText(command)) return { error: `command must be a string of at most ${MAX_TEXT} characters` }
  const simpleCommand = v.simpleCommand
  if (simpleCommand !== undefined && !isText(simpleCommand)) {
    return { error: `simpleCommand must be a string of at most ${MAX_TEXT} characters` }
  }
  const source = v.source ?? 'lab'
  if (typeof source !== 'string' || !SOURCES.includes(source)) {
    return { error: `source must be one of ${SOURCES.join(', ')}` }
  }
  return {
    ok: {
      board: encodeBoard(board),
      params: params.ok,
      view: view.ok,
      command,
      ...(simpleCommand !== undefined ? { simpleCommand } : {}),
      metrics: metrics.ok,
      source,
    },
  }
}

/** The body as text, or null when it is larger than limit bytes (declared or actual). */
async function readBody(req: Request, limit: number): Promise<string | null> {
  if (Number(req.headers.get('content-length') ?? 0) > limit) return null
  if (!req.body) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of req.body) {
    size += chunk.byteLength
    if (size > limit) return null
    chunks.push(chunk)
  }
  const all = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    all.set(c, at)
    at += c.byteLength
  }
  return new TextDecoder().decode(all)
}

export function createLabServer(): (req: Request) => Promise<Response> {
  return async (req) => {
    const url = new URL(req.url)
    try {
      if (url.pathname === '/api/boards' && req.method === 'GET') return send(200, JSON.stringify(listBoards()))
      if (url.pathname === '/api/boards' && req.method === 'POST') {
        const text = await readBody(req, MAX_BODY)
        if (text === null) return send(413, JSON.stringify({ error: `the body is larger than ${MAX_BODY} bytes` }))
        let json: unknown
        try {
          json = JSON.parse(text)
        } catch {
          return send(400, '{"error":"the body is not JSON"}')
        }
        const checked = checkPost(json)
        if ('error' in checked) return send(400, JSON.stringify({ error: checked.error }))
        return send(201, JSON.stringify(saveBoard(checked.ok)))
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
