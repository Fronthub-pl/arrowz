import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultParams } from './engine.mjs'

let server, base
before(async () => {
  process.env.ARROWZ_BOARDS_DIR = mkdtempSync(join(tmpdir(), 'arrowz-srv-'))
  const { createLabServer } = await import('./lab-server.mjs')
  server = createLabServer()
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => server.close())

test('POST /api/boards saves, GET lists, the SVG is served from the store', async () => {
  const body = { svg: '<svg>x</svg>', params: { ...defaultParams(), W: 25, H: 50, seed: 7 },
    view: { cell: 12, stroke: 0.5, colored: false, top: 0 }, command: 'node prototype/carve.mjs --svg --w=25 --h=50 --seed=7 --cell=12',
    metrics: { ok: true, pieces: 126, maxLen: 68, genMs: 10 }, source: 'lab' }
  const post = await fetch(base + '/api/boards', { method: 'POST', body: JSON.stringify(body) })
  assert.equal(post.status, 201)
  const meta = await post.json()
  assert.match(meta.id, /^seed7-/)
  const list = await (await fetch(base + '/api/boards')).json()
  assert.equal(list[0].size, '25x50')
  assert.equal(list[0].boards[0].id, meta.id)
  const svg = await fetch(`${base}/boards/25x50/${meta.id}.svg`)
  assert.equal(svg.headers.get('content-type'), 'image/svg+xml')
  assert.equal(await svg.text(), '<svg>x</svg>')
})

test('POST without svg gives 400', async () => {
  const r = await fetch(base + '/api/boards', { method: 'POST', body: JSON.stringify({ params: {} }) })
  assert.equal(r.status, 400)
})

test('static lab files without cache; paths escaping the directory are rejected', async () => {
  const html = await fetch(base + '/lab.html')
  assert.equal(html.status, 200)
  assert.equal(html.headers.get('cache-control'), 'no-store, must-revalidate')
  assert.equal((await fetch(base + '/')).status, 200)
  assert.equal((await fetch(base + '/missing.txt')).status, 404)
  assert.equal((await fetch(base + '/boards/..%2F..%2Fengine.mjs')).status, 403)
})
