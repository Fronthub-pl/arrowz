// Lab server: static files from packages/cli/ without caching (a rebuilt bundle
// must reach the browser immediately) plus the board store under /api/boards
// (GET list, POST save a board file, DELETE one) and /boards/. Run: deno task lab (lab.sh scopes the
// permissions: net on 127.0.0.1, read of packages/cli/ and the store, write of the store, one env var).
import { dirname, extname, fromFileUrl, join, normalize, resolve, SEPARATOR } from '@std/path'
import { decodeBoard, defaultParams, encodeBoard, formatViolation, PARAM_SPEC, validateParams } from '@arrowz/engine'
import type { Params, View, ViewNumber } from '@arrowz/engine'
import { DEFAULT_VIEW, VIEW_RANGE } from '@arrowz/engine/command'
import { boardsDir, deleteBoard, listBoards, saveBoard, type SaveInput } from './store.ts'

/** The largest POST body read. The lab posts no SVG, and a 1000×1000 board file is about a megabyte. */
export const MAX_BODY = 16 * 1024 * 1024
/** The longest command stored beside a board; there is one dialect, so one command. */
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

/**
 * The lab page may load its own script, bundle, workers and API only. Inline
 * style attributes stay allowed: the page builds table rows with them.
 */
export const LAB_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; " +
  "form-action 'none'; frame-ancestors 'none'"
/** Stored files are data, never a page: an SVG opened on its own runs no script and reaches nothing. */
export const STORE_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox"

function send(status: number, body: BodyInit, type = 'application/json', csp = LAB_CSP): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': type,
      'Cache-Control': 'no-store, must-revalidate',
      'Content-Security-Policy': csp,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  })
}

const LOCAL_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '[::1]']

/**
 * Why a request is refused before routing, or null. The lab serves this
 * machine only: a Host that is not a loopback name is a page that rebound its
 * own domain to 127.0.0.1 (DNS rebinding), and a write with an Origin other
 * than the lab's is a page of another site or another local port acting in
 * the user's name (CSRF). Tools without a browser send no Origin and pass.
 * A POST must say it is JSON: a cross-origin page can only send that after a
 * CORS preflight, which this server never grants. Only GET skips the checks
 * below: HEAD meets them like any other method, then reaches the router's
 * 405 (it answers GET only), so the two never disagree on what is a read.
 */
function refusal(req: Request, url: URL): { status: number; error: string } | null {
  if (!LOCAL_HOSTS.includes(url.hostname)) return { status: 403, error: `host ${url.hostname} is not this machine` }
  if (req.method === 'GET') return null
  const origin = req.headers.get('origin')
  if (origin !== null && origin !== url.origin) return { status: 403, error: `origin ${origin} is not the lab` }
  const type = req.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  if (req.method === 'POST' && type !== 'application/json') {
    return { status: 415, error: 'POST needs Content-Type: application/json' }
  }
  return null
}

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isText = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_TEXT
type Checked<T> = { ok: T } | { error: string }
type Metrics = NonNullable<SaveInput['metrics']>

/**
 * The params of a POST, rebuilt from the knobs of PARAM_SPEC only: a key the
 * engine does not know is dropped, and the result must pass the engine's
 * envelope, so the store holds only boards the engine would generate. The
 * seed goes into file names; a string or a fraction never gets that far.
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

/** The numbers of a view, straight from the table that bounds them. */
const VIEW_NUMBERS = Object.keys(VIEW_RANGE) as ViewNumber[]

function checkView(v: unknown): Checked<View> {
  if (!isRec(v)) return { error: 'view is required' }
  const view: View = { ...DEFAULT_VIEW }
  for (const k of VIEW_NUMBERS) {
    const value = v[k]
    const r = VIEW_RANGE[k]
    // The CLI's own range for the flag that writes this field, so a stored
    // view is a picture carve.ts could have drawn.
    if (!isNum(value) || value < r.min || value > r.max || (r.whole && !Number.isInteger(value))) {
      return { error: `view.${k} must be ${r.whole ? 'a whole number' : 'a number'} in ${r.min}..${r.max}` }
    }
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

/**
 * The closing report of a POST. Absent and null fields stay absent: the store
 * writes null for them. `stuck` is bounded by the board's own cell count: an
 * unbounded `sizes` array is how a 17 MB meta reaches `listBoards()`, which
 * inlines `stuck` into every `GET /api/boards`.
 */
function checkMetrics(v: unknown, params: Params): Checked<Metrics> {
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
    const cells = params.W * params.H
    if (remaining < 0 || remaining > cells) {
      return { error: `metrics.stuck.remaining must be between 0 and ${cells}` }
    }
    if (heads !== null && (heads < 0 || heads > cells)) {
      return { error: `metrics.stuck.heads must be between 0 and ${cells}` }
    }
    // Filtered rather than asserted: a length that changes is an entry that was not a number.
    const numbers = sizes.filter(isNum)
    if (numbers.length !== sizes.length) return { error: 'metrics.stuck is not a closing report' }
    // An island (one entry of sizes) cannot exceed the stuck cells it is carved from.
    if (numbers.length > remaining) {
      return { error: 'metrics.stuck.sizes cannot list more islands than remaining cells' }
    }
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
  const metrics = checkMetrics(v.metrics, params.ok)
  if ('error' in metrics) return metrics
  const command = v.command
  if (!isText(command)) return { error: `command must be a string of at most ${MAX_TEXT} characters` }
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
      metrics: metrics.ok,
      source,
    },
  }
}

/** The body as text, or null when it is larger than limit bytes (declared or actual). */
async function readBody(req: Request, limit: number): Promise<string | null> {
  if (Number(req.headers.get('content-length') ?? 0) > limit) {
    await req.body?.cancel()
    return null
  }
  if (!req.body) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of req.body) {
    size += chunk.byteLength
    // Leaving a for-await over a ReadableStream by return already calls the
    // iterator's return(), which cancels the stream: no explicit cancel() is
    // needed here.
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
    const refused = refusal(req, url)
    if (refused) return send(refused.status, JSON.stringify({ error: refused.error }))
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

      // Three areas are served: the page, its bundle and the store, each from
      // its own base directory (the store may live outside packages/cli/, see
      // ARROWZ_BOARDS_DIR). The sources next to the page are not. The
      // normalised path must stay inside its area.
      let rel: string
      try {
        rel = decodeURIComponent(url.pathname === '/' ? '/lab.html' : url.pathname)
      } catch {
        return send(400, '{"error":"malformed path"}')
      }
      const area = rel === '/lab.html'
        ? { base: ROOT, name: 'lab.html', csp: LAB_CSP }
        : rel.startsWith('/dist/')
        ? { base: join(ROOT, 'dist'), name: rel.slice('/dist/'.length), csp: LAB_CSP }
        : rel.startsWith('/boards/')
        ? { base: boardsDir(), name: rel.slice('/boards/'.length), csp: STORE_CSP }
        : null
      if (!area) return send(404, '{"error":"not found"}')
      const baseDir = resolve(area.base)
      const file = normalize(join(baseDir, area.name))
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
      return send(200, data, MIME[extname(file)] ?? 'application/octet-stream', area.csp)
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
