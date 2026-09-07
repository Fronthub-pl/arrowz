// Generator robustness tests. Run: node --test prototype/
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
