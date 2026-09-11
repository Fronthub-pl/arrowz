import { assert, assertEquals, assertMatch } from '@std/assert'
import { dirname } from '@std/path'
import { defaultParams, encodeBoard } from '@arrowz/engine'
import { COMMAND_PREFIX } from '@arrowz/engine/command'
import { createLabServer, MAX_BODY } from './lab-server.ts'
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

/** The file of an empty board of a size: enough for the server, which decodes it before saving. */
const emptyFile = (W: number, H: number) => encodeBoard({ W, H, owner: new Int32Array(W * H).fill(-1), pieces: [] })

Deno.test('POST /api/boards saves, GET lists, the board file is served from the store', () =>
  withServer(async (base) => {
    const board = emptyFile(25, 50)
    const body = {
      board,
      params: { ...defaultParams(), W: 25, H: 50, seed: 7 },
      view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0 },
      command: `${COMMAND_PREFIX} --advanced --board --w=25 --h=50 --seed=7 --cell=12`,
      metrics: { ok: true, pieces: 126, maxLen: 68, genMs: 10 },
      source: 'lab',
    }
    const post = await fetch(base + '/api/boards', { method: 'POST', body: JSON.stringify(body) })
    assertEquals(post.status, 201)
    const meta: BoardMeta = await post.json()
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
      [{ ...b, params: { ...b.params, seed: '/../../escape' } }, 'params.seed'],
      [{ ...b, params: { ...b.params, seed: 1.5 } }, 'whole numbers'],
      [{ ...b, source: '<img src=x onerror=alert(1)>' }, 'source'],
      [{ ...b, svg: '<svg><script>alert(1)</script></svg>' }, 'svg is not accepted'],
      [{ ...b, view: { ...b.view, top: 'x' } }, 'view.top'],
      [{ ...b, view: { ...b.view, colored: 'yes' } }, 'view.colored'],
      [{ ...b, command: 'x'.repeat(5000) }, 'command'],
      [{ ...b, metrics: { pieces: '<b>' } }, 'metrics.pieces'],
      [{ ...b, metrics: { stuck: { remaining: 1, sizes: ['x'], heads: null } } }, 'metrics.stuck'],
    ]
    for (const [body, error] of cases) {
      const r = await fetch(base + '/api/boards', { method: 'POST', body: JSON.stringify(body) })
      assertEquals(r.status, 400, error)
      const got: { error: string } = await r.json()
      assert(got.error.includes(error), `${got.error} lacks ${error}`)
    }
    const beside = [...Deno.readDirSync(dirname(store))].map((e) => e.name)
    assert(!beside.some((n) => n.startsWith('escape')), 'a file was written beside the store')
    assertEquals(await (await fetch(base + '/api/boards')).json(), [])
  }))

Deno.test('POST keeps only the knobs of PARAM_SPEC', () =>
  withServer(async (base) => {
    const b = validBody()
    const body = { ...b, params: { ...b.params, ruleB: false, voidFrac: 0.5, junk: 1 } }
    const r = await fetch(base + '/api/boards', { method: 'POST', body: JSON.stringify(body) })
    assertEquals(r.status, 201)
    const meta: BoardMeta = await r.json()
    assertEquals(meta.params.ruleB, true)
    assertEquals(meta.params.voidFrac, 0)
    assert(!('junk' in meta.params))
  }))

Deno.test('POST refuses a body that is not JSON (400) or larger than the cap (413)', () =>
  withServer(async (base) => {
    const bad = await fetch(base + '/api/boards', { method: 'POST', body: '{' })
    assertEquals(bad.status, 400)
    await bad.body?.cancel()
    const big = await fetch(base + '/api/boards', { method: 'POST', body: 'x'.repeat(MAX_BODY + 1) })
    assertEquals(big.status, 413)
    await big.body?.cancel()
  }))

Deno.test('POST stores the board file as the engine writes it, without keys it does not know', () =>
  withServer(async (base) => {
    const body = {
      board: { ...emptyFile(10, 10), junk: 'x'.repeat(1000) },
      params: { ...defaultParams(), W: 10, H: 10, seed: 4 },
      view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0 },
      command: `${COMMAND_PREFIX} --advanced --board --w=10 --h=10 --seed=4 --cell=12`,
    }
    const post = await fetch(base + '/api/boards', { method: 'POST', body: JSON.stringify(body) })
    assertEquals(post.status, 201)
    const meta: BoardMeta = await post.json()
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
      const r = await fetch(base + '/api/boards', { method: 'POST', body: JSON.stringify(body) })
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
    const meta: BoardMeta = await (await fetch(base + '/api/boards', { method: 'POST', body: JSON.stringify(body) }))
      .json()
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
