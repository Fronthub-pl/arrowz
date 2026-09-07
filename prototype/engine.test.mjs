// Generator robustness tests. Run: node --test 'prototype/*.test.mjs'
//
// The prototype is disposable code, but the generator must close boards up to 200×200
// without failures — these tests guard that, not eyeballing in the laboratory.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Carver, defaultParams, mulberry32, generate, analyse } from './engine.mjs'

const carver = () => new Carver(10, 10, defaultParams(), mulberry32(1))
// A set of cells in the GIVEN order — the order decides which cell the test
// takes first, and the bug was precisely that the result depended on it.
const cells = (arr) => new Set(arr.map(([x, y]) => y * 10 + x))

test('decomposable: L-tromino regardless of the starting cell', () => {
  const c = carver()
  assert.equal(c.decomposable(cells([[1, 1], [0, 1], [1, 0]])), true, 'start at the corner')
  assert.equal(c.decomposable(cells([[0, 1], [1, 1], [1, 0]])), true, 'start on an arm')
})

test('decomposable: straight triple starting in the middle', () => {
  assert.equal(carver().decomposable(cells([[1, 0], [0, 0], [2, 0]])), true)
})

test('decomposable: T-tetromino and plus-pentomino are not decomposable', () => {
  const c = carver()
  assert.equal(c.decomposable(cells([[1, 0], [0, 1], [1, 1], [2, 1]])), false)
  assert.equal(c.decomposable(cells([[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]])), false)
})

test('decomposable: fragment on which seed 5 got stuck on 200×200', () => {
  // ··█··
  // ··█··
  // █████
  // ·█·█·
  const shape = cells([[2, 0], [2, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [3, 3]])
  assert.equal(carver().decomposable(shape), true)
})

test('decomposable: single cell and empty set', () => {
  const c = carver()
  assert.equal(c.decomposable(cells([])), true)
  assert.equal(c.decomposable(cells([[3, 3]])), false)
})

test('hasLocalDefect: cross with three leaves and a diagonal pair isolating five cells', () => {
  // A 10×10 board fully assigned except for the given cells; the "path" is empty,
  // so the test treats the surroundings of the given cells as the path's surroundings.
  const shapeBoard = (arr) => {
    const c = carver()
    c.owner.fill(0)
    for (const [x, y] of arr) c.owner[y * 10 + x] = -1
    c.gen++
    return c
  }
  // cross: centre (2,2), leaves (2,1),(1,2),(3,2), the fourth arm runs on further
  let c = shapeBoard([[2, 2], [2, 1], [1, 2], [3, 2], [2, 3], [2, 4]])
  assert.equal(c.hasLocalDefect([{ x: 2, y: 2 }]), true)
  // fragment from seed 49: S = {(1,2),(2,1)} isolates (0,2),(1,3),(2,0),(1,1),(2,2)
  c = shapeBoard([[2, 0], [4, 0], [1, 1], [2, 1], [3, 1], [4, 1], [0, 2], [1, 2], [2, 2], [1, 3]])
  assert.equal(c.hasLocalDefect([{ x: 1, y: 2 }]), true)
  // a straight triple is not a defect
  c = shapeBoard([[1, 1], [2, 1], [3, 1]])
  assert.equal(c.hasLocalDefect([{ x: 2, y: 1 }]), false)
})

test('absorbLeftover: absorbs a single cell with the tail and does not change the blocking graph', () => {
  // A 6×6 board: two pieces laid out by hand, one free cell next to the tail.
  const c = new Carver(6, 6, { ...defaultParams(), absorbLimit: 8 }, mulberry32(1))
  c.owner.fill(0)
  const a = { id: 0, dir: 0, cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }] }
  const b = { id: 1, dir: 1, cells: [{ x: 5, y: 0 }, { x: 4, y: 0 }, { x: 3, y: 0 }] }
  c.pieces.push(a, b)
  for (const cell of b.cells) c.owner[cell.y * 6 + cell.x] = 1
  c.owner[3 * 6 + 0] = -1 // (0,3) free, adjacent to the tail of piece 0
  c.remaining = 1
  const before = analyse(c).solvable
  assert.equal(c.absorbLeftover(), true)
  assert.equal(c.remaining, 0)
  assert.equal(c.owner[3 * 6 + 0], 0)
  assert.deepEqual(a.cells[a.cells.length - 1], { x: 0, y: 3 })
  assert.equal(analyse(c).solvable, before)
})

test('generate: closes the board 100% and solvably on several sizes and seeds', () => {
  const cases = [
    [25, 50, [1, 2, 3, 4, 5]],
    [100, 100, [1, 2]],
    [200, 200, [1, 5, 49]],   // 5 and 49 are seeds that once failed to close
  ]
  for (const [W, H, seeds] of cases) {
    for (const seed of seeds) {
      const r = generate({ W, H, seed, restarts: 0 })
      assert.equal(r.ok, true, `${W}×${H} seed ${seed} did not close`)
      assert.equal(r.metrics.coverage, 1, `${W}×${H} seed ${seed}: coverage ${r.metrics.coverage}`)
      assert.equal(r.metrics.solvable, true, `${W}×${H} seed ${seed}: unsolvable`)
      assert.equal(r.backtracks, 0, `${W}×${H} seed ${seed}: ${r.backtracks} backtracks`)
    }
  }
})

// FNV-1a over the owner grid and the piece cell sequences: any change in which
// cell belongs to which piece, or in the order of cells within a piece, changes
// the hash. It is the "same board for the same seed" guarantee in one number.
function fingerprint(board) {
  const fnv = (h, v) => Math.imul(h ^ v, 16777619) >>> 0
  let h = 2166136261
  for (let i = 0; i < board.owner.length; i++) h = fnv(h, board.owner[i] + 3)
  for (const pc of board.pieces) { h = fnv(h, pc.dir); for (const c of pc.cells) h = fnv(h, c.y * board.W + c.x) }
  return h.toString(16)
}

// Layers mode (headBias -1) is the setting that leans on absorbLeftover: it
// leaves many leftover fragments and the generator tries to glue each one to a
// neighbour's tail before every backtrack. The boards are recorded so that an
// optimisation of the search cannot change a single cell, only the time.
// Recorded after the head-quarter fallback of round 9 (before it, seed 5 on
// 200×200 needed a restart: 3514 pieces, fingerprint 6d2b542d).
const LAYERS_GOLDEN = [
  { W: 150, H: 150, seed: 7, restarts: 0, backtracks: 0, pieces: 2003, fp: '58c1b0ca' },
  { W: 200, H: 200, seed: 5, restarts: 0, backtracks: 0, pieces: 3419, fp: 'ca001333' },
]

test('generate: layers mode reproduces the recorded boards cell for cell', () => {
  for (const g of LAYERS_GOLDEN) {
    const r = generate({ W: g.W, H: g.H, seed: g.seed, headBias: -1 })
    const label = `${g.W}×${g.H} seed ${g.seed}`
    assert.equal(r.ok, true, label)
    assert.equal(r.restartsUsed, g.restarts, `${label}: restarts`)
    assert.equal(r.backtracks, g.backtracks, `${label}: backtracks`)
    assert.equal(r.board.pieces.length, g.pieces, `${label}: pieces`)
    assert.equal(fingerprint(r.board), g.fp, `${label}: fingerprint`)
  }
})

test('generate: layers mode closes 400×400 without restarts or backtracks', () => {
  // Seed 5 used to fail after three restarts and seed 7 needed one: with
  // piece start = layers the head pool was only the shallowest quarter of the
  // legal heads, which in the endgame are the dead pockets at the frontier,
  // so the regions of thousands of free cells were never tried (round 9).
  for (const seed of [5, 7]) {
    const r = generate({ W: 400, H: 400, seed, headBias: -1, restarts: 0 })
    assert.equal(r.ok, true, `seed ${seed} did not close`)
    assert.equal(r.backtracks, 0, `seed ${seed}: ${r.backtracks} backtracks`)
    assert.equal(r.metrics.solvable, true, `seed ${seed}: unsolvable`)
  }
})

test('generate: layers mode on 200×200 seed 5 finishes in under four seconds', () => {
  // Before the absorption search was optimised this seed took 8.5 s (a
  // failed first attempt with 200 backtracks, three quarters of the time in
  // the path search re-run for the same fragments); after it ~2 s; with the
  // head-quarter fallback it closes in one attempt in well under a second.
  // The bound leaves a wide margin for a slow machine and still fails on
  // the old search.
  const t0 = performance.now()
  const r = generate({ W: 200, H: 200, seed: 5, headBias: -1 })
  const ms = performance.now() - t0
  assert.equal(r.ok, true)
  assert.ok(ms < 4000, `took ${Math.round(ms)} ms`)
})

test('generate: closes the board without Warnsdorff and with only short pieces', () => {
  for (const over of [{ warns: 0 }, { wShort: 0.85, wMid: 0.1 }, { headBias: 1 }]) {
    const r = generate({ W: 100, H: 100, seed: 3, restarts: 0, ...over })
    assert.equal(r.ok && r.metrics.solvable && r.metrics.coverage === 1, true, JSON.stringify(over))
  }
})

test('analyse: does not overflow the stack with hundreds of thousands of pieces (the worker in Chrome has a small stack)', () => {
  // A 2×300 000 board covered with horizontal dominoes with the head at the right edge:
  // 300 000 pieces, all rays empty, so the blocking graph is
  // empty and the test only costs the memory for the pieces. Spreading
  // Math.min(...array) of this size throws a RangeError in Node as well.
  const W = 2, H = 300000
  const c = new Carver(W, H, defaultParams(), mulberry32(1))
  for (let y = 0; y < H; y++) {
    c.pieces.push({ id: y, dir: 1, cells: [{ x: 1, y }, { x: 0, y }] })
    c.owner[y * W] = y; c.owner[y * W + 1] = y
  }
  c.remaining = 0
  const m = analyse(c)
  assert.equal(m.N, H)
  assert.equal(m.minLen, 2)
  assert.equal(m.maxLen, 2)
  assert.equal(m.coverage, 1)
})
