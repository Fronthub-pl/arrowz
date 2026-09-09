import { assert, assertEquals, assertMatch } from '@std/assert'
// @ts-types="./engine.d.ts"
import { defaultParams } from './engine.mjs'
import { COMMAND_PREFIX } from './command.ts'
import { createLabServer } from './lab-server.ts'
import type { BoardMeta, BoardSize } from './types.ts'

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

Deno.test('POST /api/boards saves, GET lists, the SVG is served from the store', () =>
  withServer(async (base) => {
    const body = {
      svg: '<svg>x</svg>',
      params: { ...defaultParams(), W: 25, H: 50, seed: 7 },
      view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0 },
      command: `${COMMAND_PREFIX} --advanced --svg --w=25 --h=50 --seed=7 --cell=12`,
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
    const svg = await fetch(`${base}/boards/25x50/${meta.id}.svg`)
    assertEquals(svg.headers.get('content-type'), 'image/svg+xml')
    assertEquals(await svg.text(), '<svg>x</svg>')
  }))

Deno.test('POST without svg gives 400', () =>
  withServer(async (base) => {
    const r = await fetch(base + '/api/boards', { method: 'POST', body: JSON.stringify({ params: {} }) })
    assertEquals(r.status, 400)
    await r.body?.cancel()
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
    const escape = await fetch(base + '/boards/..%2F..%2Fengine.mjs')
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
      svg: '<svg>del</svg>',
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
    const gone = await fetch(`${base}/boards/10x10/${meta.id}.svg`)
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
