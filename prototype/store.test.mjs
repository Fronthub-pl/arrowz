import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultParams } from './engine.mjs'

let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'arrowz-boards-'))
  process.env.ARROWZ_BOARDS_DIR = dir
})

const params = (over) => ({ ...defaultParams(), W: 25, H: 50, seed: 7, ...over })
const entry = ({ params: over, ...rest } = {}) => ({
  svg: '<svg/>', params: params(over), view: { cell: 12, stroke: 0.5, colored: false, top: 0 },
  command: 'node prototype/carve.mjs --svg --w=25 --h=50 --seed=7 --cell=12', source: 'cli',
  metrics: { ok: true, pieces: 126, maxLen: 68, genMs: 12 }, ...rest,
})

test('saveBoard writes SVG and meta into the size directory', async () => {
  const { saveBoard } = await import('./store.mjs')
  const meta = saveBoard(entry())
  assert.match(meta.id, /^seed7-/)
  assert.equal(readFileSync(join(dir, '25x50', meta.id + '.svg'), 'utf8'), '<svg/>')
  const saved = JSON.parse(readFileSync(join(dir, '25x50', meta.id + '.json'), 'utf8'))
  assert.equal(saved.pieces, 126)
  assert.equal(saved.source, 'cli')
  assert.equal(saved.svgBytes, 6)
  assert.ok(saved.createdAt)
})

test('listBoards: sizes ascending by cells, boards newest first, same id overwrites', async () => {
  const { saveBoard, listBoards } = await import('./store.mjs')
  saveBoard(entry({ params: { W: 100, H: 100, seed: 1 } }))
  const first = saveBoard(entry({ params: { seed: 1 } }))
  await new Promise((r) => setTimeout(r, 5))
  saveBoard(entry({ params: { seed: 2 } }))
  await new Promise((r) => setTimeout(r, 5))
  saveBoard(entry({ svg: '<svg>2</svg>', params: { seed: 1 } }))   // same id — overwrite
  const sizes = listBoards()
  assert.deepEqual(sizes.map((s) => s.size), ['25x50', '100x100'])
  assert.equal(sizes[0].boards.length, 2)
  assert.equal(sizes[0].boards[0].seed, 1, 'overwritten entry is the newest')
  assert.equal(readFileSync(join(dir, '25x50', first.id + '.svg'), 'utf8'), '<svg>2</svg>')
})

test('listBoards skips junk: foreign directories, json without svg, broken json', async () => {
  const { saveBoard, listBoards } = await import('./store.mjs')
  mkdirSync(join(dir, 'notes'))
  mkdirSync(join(dir, '10x10'))
  writeFileSync(join(dir, '10x10', 'seed1-deadbeef.json'), '{"id":"seed1-deadbeef"}')   // no svg
  mkdirSync(join(dir, '25x50'))
  writeFileSync(join(dir, '25x50', 'broken.json'), '{not json')
  writeFileSync(join(dir, '25x50', 'broken.svg'), '<svg/>')
  saveBoard(entry())
  const sizes = listBoards()
  assert.deepEqual(sizes.map((s) => s.size), ['25x50'])
  assert.equal(sizes[0].boards.length, 1)
})

test('listBoards without a directory returns an empty list', async () => {
  process.env.ARROWZ_BOARDS_DIR = join(dir, 'missing')
  const { listBoards } = await import('./store.mjs')
  assert.ok(!existsSync(process.env.ARROWZ_BOARDS_DIR))
  assert.deepEqual(listBoards(), [])
})
