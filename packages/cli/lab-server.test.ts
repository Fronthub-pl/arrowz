import { assert, assertEquals, assertMatch } from '@std/assert'
import { dirname } from '@std/path'
import { defaultParams, encodeBoard } from '@arrowz/engine'
import { COMMAND_PREFIX } from '@arrowz/engine/command'
import { createLabServer, LAB_CSP, MAX_BODY, STORE_CSP } from './lab-server.ts'
import { saveBoard } from './store.ts'
import type { BoardMeta, BoardSize } from '@arrowz/engine'

/** One server per test on a fresh, empty store; shut down before the sanitizers look. */
async function withServer(fn: (base: string) => Promise<void>) {
  Deno.env.set('ARROWZ_BOARDS_DIR', Deno.makeTempDirSync({ prefix: 'arrowz-srv-' }))
  const server = Deno.serve({ port: 0, hostname: '127.0.0.1', onListen: () => {} }, createLabServer())
  try {
    await fn(`http://127.0.0.1:${server.addr.port}`)
  } finally {
    await server.shutdown()
  }
}

/** A same-origin POST with the JSON content type every real request must send. */
const post = (base: string, body: unknown) =>
  fetch(base + '/api/boards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

/** The file of an empty board of a size: enough for the server, which decodes it before saving. */
const emptyFile = (W: number, H: number) => encodeBoard({ W, H, owner: new Int32Array(W * H).fill(-1), pieces: [] })

Deno.test('POST /api/boards saves, GET lists, the board file is served from the store', () =>
  withServer(async (base) => {
    const board = emptyFile(25, 50)
    const body = {
      board,
      params: { ...defaultParams(), W: 25, H: 50, seed: 7 },
      view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0 },
      command: `${COMMAND_PREFIX} --width=25 --height=50 --seed=7`,
      metrics: { ok: true, pieces: 126, maxLen: 68, genMs: 10 },
      source: 'lab',
    }
    const resp = await post(base, body)
    assertEquals(resp.status, 201)
    const meta: BoardMeta = await resp.json()
    assertMatch(meta.id, /^seed7-/)
    const list: BoardSize[] = await (await fetch(base + '/api/boards')).json()
    assertEquals(list[0]?.size, '25x50')
    assertEquals(list[0]?.boards[0]?.id, meta.id)
    const file = await fetch(`${base}/boards/25x50/${meta.id}.board.json`)
    assertEquals(file.headers.get('content-type'), 'application/json')
    assertEquals(await file.json(), board)
  }))

Deno.test('a preview saved by the CLI is served from the store as SVG', () =>
  withServer(async (base) => {
    const meta = saveBoard({
      board: emptyFile(10, 10),
      svg: '<svg>x</svg>',
      params: { ...defaultParams(), W: 10, H: 10, seed: 5 },
      view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 1, colored: false, top: 0, rounded: true },
      command: 'x',
      source: 'cli',
    })
    const svg = await fetch(`${base}/boards/10x10/${meta.id}.svg`)
    assertEquals(svg.headers.get('content-type'), 'image/svg+xml')
    assertEquals(await svg.text(), '<svg>x</svg>')
  }))

/** A valid POST body for a 10×10 board; each case below breaks one field. */
const validBody = () => ({
  board: emptyFile(10, 10),
  params: { ...defaultParams(), W: 10, H: 10, seed: 3 },
  view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 1, colored: false, top: 0 },
  command: 'x',
  source: 'lab',
})

Deno.test('POST refuses fields the store would write or the page would show unchecked', () =>
  withServer(async (base) => {
    const store = Deno.env.get('ARROWZ_BOARDS_DIR') ?? ''
    const b = validBody()
    const cases: [unknown, string][] = [
      // join() normalises '/../../escape' back inside the store root, so only
      // an extra '..' actually lands the would-be file beside the store.
      [{ ...b, params: { ...b.params, seed: '/../../../escape' } }, 'params.seed'],
      [{ ...b, params: { ...b.params, seed: 1.5 } }, 'seed: 1.5'],
      [{ ...b, source: '<img src=x onerror=alert(1)>' }, 'source'],
      [{ ...b, svg: '<svg><script>alert(1)</script></svg>' }, 'svg is not accepted'],
      [{ ...b, view: { ...b.view, top: 'x' } }, 'view.top'],
      // The view numbers carry the CLI's ranges, so what the server stores is
      // a picture the CLI could have drawn.
      [{ ...b, view: { ...b.view, cell: 0 } }, 'view.cell must be a whole number in 1..200'],
      [{ ...b, view: { ...b.view, cell: 12.5 } }, 'view.cell must be a whole number in 1..200'],
      [{ ...b, view: { ...b.view, headHeight: 5 } }, 'view.headHeight must be a number in 0..3'],
      [{ ...b, view: { ...b.view, colored: 'yes' } }, 'view.colored'],
      [{ ...b, command: 'x'.repeat(5000) }, 'command'],
      [{ ...b, metrics: { pieces: '<b>' } }, 'metrics.pieces'],
      [{ ...b, metrics: { stuck: { remaining: 1, sizes: ['x'], heads: null } } }, 'metrics.stuck'],
      // The board is 10x10 (100 cells): remaining cannot exceed the cell count.
      [{ ...b, metrics: { stuck: { remaining: 1000, sizes: [], heads: null } } }, 'metrics.stuck'],
      // An island count (sizes.length) cannot exceed the stuck cells (remaining).
      [{ ...b, metrics: { stuck: { remaining: 1, sizes: [2, 1], heads: null } } }, 'metrics.stuck'],
    ]
    for (const [body, error] of cases) {
      const r = await post(base, body)
      assertEquals(r.status, 400, error)
      const got: { error: string } = await r.json()
      assert(got.error.includes(error), `${got.error} lacks ${error}`)
    }
    const beside = [...Deno.readDirSync(dirname(store))].map((e) => e.name)
    assert(!beside.some((n) => n.startsWith('escape')), 'a file was written beside the store')
    const inside = [...Deno.readDirSync(store)].map((e) => e.name)
    assert(!inside.some((n) => n.startsWith('escape')), 'a file was written in the store')
    assertEquals(await (await fetch(base + '/api/boards')).json(), [])
  }))

Deno.test('POST accepts a stuck report whose sizes fit within remaining', () =>
  withServer(async (base) => {
    const b = validBody()
    const body = { ...b, metrics: { stuck: { remaining: 3, sizes: [2, 1], heads: null } } }
    const r = await post(base, body)
    assertEquals(r.status, 201)
  }))

Deno.test('POST keeps only the knobs of PARAM_SPEC', () =>
  withServer(async (base) => {
    const b = validBody()
    const body = { ...b, params: { ...b.params, ruleB: false, voidFrac: 0.5, junk: 1 } }
    const r = await post(base, body)
    assertEquals(r.status, 201)
    const meta: BoardMeta = await r.json()
    // ruleB and voidFrac are generate() options, not knobs: they never reach a stored board.
    assert(!('ruleB' in meta.params))
    assert(!('voidFrac' in meta.params))
    assert(!('junk' in meta.params))
  }))

Deno.test('POST refuses a body that is not JSON (400)', () =>
  withServer(async (base) => {
    const bad = await post(base, '{')
    assertEquals(bad.status, 400)
    await bad.body?.cancel()
  }))

// Called directly on the handler, with no socket: a real connection would see
// a reset rather than the 413 it sends. A Request built from a plain string
// body carries no Content-Length header of its own (only a real HTTP layer
// adds one when the request goes out), so this covers the streamed cap only.
Deno.test('POST refuses a body larger than the cap, read as a stream (413)', async () => {
  Deno.env.set('ARROWZ_BOARDS_DIR', Deno.makeTempDirSync({ prefix: 'arrowz-srv-' }))
  const handle = createLabServer()
  const big = await handle(
    new Request('http://localhost:8777/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'x'.repeat(MAX_BODY + 1),
    }),
  )
  assertEquals(big.status, 413)
  await big.body?.cancel()
})

// A declared Content-Length over the cap is refused before the body is ever
// read, which the streamed case above cannot reach (it sends no such header).
Deno.test('POST refuses a body whose declared Content-Length exceeds the cap (413)', async () => {
  Deno.env.set('ARROWZ_BOARDS_DIR', Deno.makeTempDirSync({ prefix: 'arrowz-srv-' }))
  const handle = createLabServer()
  const big = await handle(
    new Request('http://localhost:8777/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(MAX_BODY + 1) },
      body: '{}',
    }),
  )
  assertEquals(big.status, 413)
  await big.body?.cancel()
})

Deno.test('POST stores the board file as the engine writes it, without keys it does not know', () =>
  withServer(async (base) => {
    const body = {
      board: { ...emptyFile(10, 10), junk: 'x'.repeat(1000) },
      params: { ...defaultParams(), W: 10, H: 10, seed: 4 },
      view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0 },
      command: `${COMMAND_PREFIX} --width=10 --height=10 --seed=4`,
    }
    const resp = await post(base, body)
    assertEquals(resp.status, 201)
    const meta: BoardMeta = await resp.json()
    const stored = await (await fetch(`${base}/boards/10x10/${meta.id}.board.json`)).json()
    assert(!('junk' in stored), 'the junk key reached the file')
    assertEquals(stored, emptyFile(10, 10))
  }))

Deno.test('POST without params, without a readable board file or with a board of another size gives 400', () =>
  withServer(async (base) => {
    const params = { ...defaultParams(), W: 10, H: 10, seed: 3 }
    const cases: [unknown, string][] = [
      [{ board: emptyFile(10, 10) }, 'params are required'],
      [{ params }, 'board: not a board file'],
      [{ params, board: { ...emptyFile(10, 10), fingerprint: 'x' } }, 'board: the fingerprint'],
      [{ params, board: emptyFile(12, 12) }, 'board file is 12x12'],
    ]
    for (const [body, error] of cases) {
      const r = await post(base, body)
      assertEquals(r.status, 400)
      const got: { error: string } = await r.json()
      assert(got.error.includes(error), `${got.error} lacks ${error}`)
    }
  }))

Deno.test('static lab files without cache; paths escaping the directory are rejected', () =>
  withServer(async (base) => {
    const html = await fetch(base + '/lab.html')
    assertEquals(html.status, 200)
    assertEquals(html.headers.get('cache-control'), 'no-store, must-revalidate')
    await html.body?.cancel()
    const root = await fetch(base + '/')
    assertEquals(root.status, 200)
    await root.body?.cancel()
    const missing = await fetch(base + '/missing.txt')
    assertEquals(missing.status, 404)
    await missing.body?.cancel()
    const escape = await fetch(base + '/boards/..%2F..%2Fengine.ts')
    assertEquals(escape.status, 403)
    await escape.body?.cancel()
    const malformed = await fetch(base + '/%E0')
    assertEquals(malformed.status, 400)
    assertEquals(await malformed.json(), { error: 'malformed path' })
    const dist = await fetch(base + '/dist/lab-page.js')
    assert(
      dist.status === 200 || (await dist.text()).includes('deno task bundle'),
      'a missing bundle must say how to build it',
    )
    if (dist.status === 200) await dist.body?.cancel()
  }))

Deno.test('DELETE /api/boards/<size>/<id> removes the board; a missing one gives 404', () =>
  withServer(async (base) => {
    const body = {
      board: emptyFile(10, 10),
      params: { ...defaultParams(), W: 10, H: 10, seed: 3 },
      view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0 },
      command: 'x',
      source: 'lab',
    }
    const meta: BoardMeta = await (await post(base, body)).json()
    const del = await fetch(`${base}/api/boards/10x10/${meta.id}`, { method: 'DELETE' })
    assertEquals(del.status, 200)
    assertEquals(await del.json(), { deleted: true })
    const gone = await fetch(`${base}/boards/10x10/${meta.id}.board.json`)
    assertEquals(gone.status, 404)
    await gone.body?.cancel()
    const list: BoardSize[] = await (await fetch(base + '/api/boards')).json()
    assert(!list.some((s) => s.size === '10x10'))
    const again = await fetch(`${base}/api/boards/10x10/${meta.id}`, { method: 'DELETE' })
    assertEquals(again.status, 404)
    await again.body?.cancel()
    const bad = await fetch(`${base}/api/boards/..%2F25x50/seed7-x`, { method: 'DELETE' })
    assertEquals(bad.status, 400)
    await bad.body?.cancel()
  }))

Deno.test('requests for another host, and writes from another origin, are refused', async () => {
  Deno.env.set('ARROWZ_BOARDS_DIR', Deno.makeTempDirSync({ prefix: 'arrowz-srv-' }))
  const handle = createLabServer()
  // DNS rebinding: a hostile domain resolved to 127.0.0.1 arrives with its own Host.
  const rebound = await handle(new Request('http://evil.example:8777/api/boards'))
  assertEquals(rebound.status, 403)
  for (const host of ['localhost:8777', '127.0.0.1:8777', '[::1]:8777']) {
    const ok = await handle(new Request(`http://${host}/api/boards`))
    assertEquals(ok.status, 200, host)
  }
  const json = { 'Content-Type': 'application/json' }
  const csrf = await handle(
    new Request('http://localhost:8777/api/boards', {
      method: 'POST',
      headers: { ...json, Origin: 'http://localhost:3000' },
      body: '{}',
    }),
  )
  assertEquals(csrf.status, 403)
  const del = await handle(
    new Request('http://localhost:8777/api/boards/10x10/seed1-00000000', {
      method: 'DELETE',
      headers: { Origin: 'null' },
    }),
  )
  assertEquals(del.status, 403)
  // A simple (no-preflight) cross-origin form post has a text/plain body.
  const plain = await handle(new Request('http://localhost:8777/api/boards', { method: 'POST', body: '{}' }))
  assertEquals(plain.status, 415)
  const same = await handle(
    new Request('http://localhost:8777/api/boards', {
      method: 'POST',
      headers: { ...json, Origin: 'http://localhost:8777' },
      body: '{}',
    }),
  )
  assertEquals(same.status, 400) // past the guard; refused by checkPost for its content
})

Deno.test('only the page, its bundle and the store are served, with security headers', () =>
  withServer(async (base) => {
    for (const path of ['/carve.ts', '/store.ts', '/deno.json', '/dist/..%2Fcarve.ts']) {
      const r = await fetch(base + path)
      assert(r.status === 404 || r.status === 403, `${path} gave ${r.status}`)
      await r.body?.cancel()
    }
    const html = await fetch(base + '/lab.html')
    assertEquals(html.headers.get('content-security-policy'), LAB_CSP)
    assertEquals(html.headers.get('x-content-type-options'), 'nosniff')
    assertEquals(html.headers.get('x-frame-options'), 'DENY')
    assertEquals(html.headers.get('referrer-policy'), 'no-referrer')
    assertEquals(html.headers.get('cross-origin-resource-policy'), 'same-origin')
    await html.body?.cancel()
    const meta = saveBoard({
      board: emptyFile(10, 10),
      svg: '<svg>x</svg>',
      params: { ...defaultParams(), W: 10, H: 10, seed: 6 },
      view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 1, colored: false, top: 0, rounded: true },
      command: 'x',
      source: 'cli',
    })
    const svg = await fetch(`${base}/boards/10x10/${meta.id}.svg`)
    assertEquals(svg.headers.get('content-security-policy'), STORE_CSP)
    assert(STORE_CSP.includes('sandbox'))
    await svg.body?.cancel()
  }))
