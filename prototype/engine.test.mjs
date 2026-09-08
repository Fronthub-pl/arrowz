// Generator robustness tests. Run: node --test 'prototype/*.test.mjs'
//
// The prototype is disposable code, but the generator must close boards up to 200×200
// without failures — these tests guard that, not eyeballing in the laboratory.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { Carver, defaultParams, mulberry32, generate, analyse, fingerprint } from './engine.mjs'

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

// A W×H board fully assigned except the given free cells, with the line
// depths recomputed, so that head tests see the assigned cells as carved.
const freeBoard = (W, H, free, params = {}) => {
  const c = new Carver(W, H, { ...defaultParams(), ...params }, mulberry32(1))
  c.owner.fill(0)
  for (const [x, y] of free) c.owner[y * W + x] = -1
  c.remaining = free.length
  c.recomputeLines(Array.from({ length: W * H }, (_, i) => ({ x: i % W, y: (i / W) | 0 })))
  return c
}

test('solvable: an L-tromino whose only heads sit in the corner cannot be carved', () => {
  // 6×6, free: the L (2,2) corner, (3,2) right arm, (2,3) lower arm — and two
  // single cells, (5,2) and (2,5), that shade the rays of the arm ends. The
  // corner is a head (its rays up and left are clear) but a piece from it
  // covers the corner and one arm and leaves the other arm alone.
  const L = [2 * 6 + 2, 2 * 6 + 3, 3 * 6 + 2]
  let c = freeBoard(6, 6, [[2, 2], [3, 2], [2, 3], [5, 2], [2, 5]])
  assert.equal(c.decomposable(new Set(L)), true, 'decomposable: yes, it is a path')
  assert.equal(c.solvable(L, ++c.gen), false, 'solvable: no head that a covering piece could start from')
  // with (5,2) carved the end of the right arm is a head: one piece covers the L
  c = freeBoard(6, 6, [[2, 2], [3, 2], [2, 3], [2, 5]])
  assert.equal(c.solvable(L, ++c.gen), true)
  // a domino with a head, and a straight triple carved from its end
  c = freeBoard(6, 6, [[2, 2], [3, 2]])
  assert.equal(c.solvable([2 * 6 + 2, 2 * 6 + 3], ++c.gen), true)
  c = freeBoard(6, 6, [[1, 2], [2, 2], [3, 2]])
  assert.equal(c.solvable([2 * 6 + 1, 2 * 6 + 2, 2 * 6 + 3], ++c.gen), true)
})

test('wouldStrand: in strict mode a fragment without a legal head is stranded', () => {
  // 7×7: the path (2,3),(2,4) is being carved; the domino (3,3),(3,4) next to
  // it is decomposable, but single free cells shade every one of its lines —
  // (3,0) above, (3,6) below, (0,3),(0,4) to the left, (6,3),(6,4) to the
  // right — so no cell of it is the first free cell of a line, and the
  // domino can only be carved after all of those are.
  const shading = [[3, 0], [3, 6], [0, 3], [0, 4], [6, 3], [6, 4]]
  const free = [[2, 3], [2, 4], [3, 3], [3, 4], ...shading]
  const path = [{ x: 2, y: 3 }, { x: 2, y: 4 }]
  let c = freeBoard(7, 7, free)
  assert.equal(c.wouldStrand(path), false, 'lenient: a domino is decomposable')
  c.strict = true
  assert.equal(c.wouldStrand(path), true, 'strict: no head')
  assert.equal(c.stats.headless, 1)
  // with (3,0) carved the column above the domino is clear: (3,3) is a head
  c = freeBoard(7, 7, free.filter(([x, y]) => !(x === 3 && y === 0)))
  c.strict = true
  assert.equal(c.wouldStrand(path), false)
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

test('generate: the strict leftover test closes the boards starved of head draws without a backtrack', () => {
  // One draw per direction and very bendy pieces: with the lenient test
  // these two seeds carve pockets that keep no legal head (their rays cross
  // other free cells) and L-shaped leftovers whose only head sits in the
  // corner, and jam with dozens of legal heads that carve nothing. The
  // strict test rejects such cuts when they are made, so the board closes
  // in one attempt (the lenient test exhausts the 50 undos on both seeds;
  // the odd undo that remains is the single draw missing a head, which is
  // a matter of the draws, not of the leftover test).
  for (const seed of [1, 3]) {
    const r = generate({ W: 200, H: 200, seed, headTries: 1, pStraight: 0.2, restarts: 0, maxBack: 50, strict: 2 })
    assert.equal(r.ok, true, `seed ${seed} did not close: ${JSON.stringify(r.stuck)}`)
    assert.ok(r.backtracks < 50, `seed ${seed}: ${r.backtracks} backtracks`)
    assert.equal(r.metrics.solvable, true, `seed ${seed}: unsolvable`)
    assert.equal(r.board.strict, true)
  }
})

test('generate: the first attempt is lenient, the restarts are strict', () => {
  // The lenient test gives longer pieces and is fast; the strict one costs
  // 20–35% more pieces and several times the time. So the first attempt
  // stays as it was (the recorded boards do not change) and the strict test
  // is the rescue after a jam, instead of a blind restart.
  const r = generate({ W: 200, H: 200, seed: 1, headTries: 1, pStraight: 0.2, restarts: 1, maxBack: 50 })
  assert.equal(r.ok, true, JSON.stringify(r.stuck))
  assert.equal(r.restartsUsed, 1)
  assert.equal(r.board.strict, true)
  const lenient = generate({ W: 100, H: 100, seed: 3, restarts: 0 })
  assert.equal(lenient.board.strict, false)
  assert.equal(fingerprint(lenient.board), '2987bf37', 'the lenient first attempt is the board recorded before the strict test existed')
})

test('generate: a jam reports how many legal heads were left at the best moment', () => {
  // Half the cells are voids, so single free cells stay isolated and nothing
  // can cover them: the run jams at once. The count of legal heads at the
  // moment of the smallest leftover tells a jam of geometry (no head at all)
  // from a jam of the search (heads exist, the carver gave up on them).
  const r = generate({ ...defaultParams(), W: 12, H: 12, seed: 1, voidFrac: 0.5, absorbLimit: 0, restarts: 0 })
  assert.equal(r.ok, false)
  assert.equal(Number.isInteger(r.stuck.heads), true, JSON.stringify(r.stuck))
  assert.equal(r.stuck.heads, r.board.stuckHeads)
  assert.ok(r.stuck.heads >= 0 && r.stuck.heads <= 2 * (12 + 12))
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

test('analyse: a dense blocking graph fits in a 256 MB heap (1000×1000 with 150 thousand pieces ran out of memory)', () => {
  // 400×400 covered with horizontal dominoes whose head is the LEFT cell and
  // which point left: every ray crosses all dominoes to its left in the row,
  // 100 on average, so the blocking graph has 8 million edges. Kept as Sets of
  // ids plus a copy for Kahn, that graph needs over a gigabyte; two boards of
  // the random 1000×1000 sweep (155 thousand mostly short pieces, 25 million
  // edges) killed the CLI with "Reached heap limit" after the generator had
  // closed them at 150 MB. The child process makes the bound a real assertion.
  const script = `
    import { Carver, defaultParams, mulberry32, analyse } from ${JSON.stringify(new URL('./engine.mjs', import.meta.url).href)}
    const W = 400, H = 400
    const c = new Carver(W, H, defaultParams(), mulberry32(1))
    let id = 0
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x += 2) {
      c.pieces.push({ id, dir: 3, cells: [{ x, y }, { x: x + 1, y }] })
      c.owner[y * W + x] = id; c.owner[y * W + x + 1] = id; id++
    }
    c.remaining = 0
    const m = analyse(c)
    console.log(JSON.stringify({ N: m.N, solvable: m.solvable, f0: m.f0, outDeg: m.outDeg, maxOut: m.maxOut, D: m.D, almost: m.almost }))
  `
  const r = spawnSync(process.execPath, ['--max-old-space-size=256', '--input-type=module', '-e', script], { encoding: 'utf8' })
  assert.equal(r.status, 0, `analyse died under a 256 MB heap:\n${r.stderr.split('\n').filter((l) => /FATAL|heap/.test(l)).join('\n')}`)
  const m = JSON.parse(r.stdout.trim().split('\n').pop())
  // The same numbers the Set-based implementation produced without the cap.
  assert.deepEqual(m, { N: 80000, solvable: true, f0: 0.005, outDeg: 99.5, maxOut: 199, D: 199, almost: 400 })
})

test('analyse: a piece bordering two hundred thousand others does not overflow the stack', () => {
  // 3×200 000: one vertical line down the left column, the other two columns
  // covered with dominoes whose head is at the right edge (all rays empty).
  // The line shares a border with every domino, so its "longest shared border"
  // used to be Math.max(...200 000 values) — a spread proportional to the
  // number of pieces, which the repository rules forbid: it throws RangeError
  // in Node and overflows the worker stack in Chrome far earlier.
  const W = 3, H = 200000
  const c = new Carver(W, H, defaultParams(), mulberry32(1))
  const line = []
  for (let y = 0; y < H; y++) { line.push({ x: 0, y }); c.owner[y * W] = 0 }
  c.pieces.push({ id: 0, dir: 0, cells: line })
  for (let y = 0; y < H; y++) {
    const id = y + 1
    c.pieces.push({ id, dir: 1, cells: [{ x: 2, y }, { x: 1, y }] })
    c.owner[y * W + 1] = id; c.owner[y * W + 2] = id
  }
  c.remaining = 0
  const m = analyse(c)
  assert.equal(m.N, H + 1)
  assert.equal(m.maxLen, H)
  // The line shares exactly one edge with each domino, so its longest border
  // with a single other piece is one edge over H cells.
  assert.equal(m.longPieces, 1)
  assert.equal(m.sharedBorder, 1 / H)
})

test('analyse: metrics are identical to the ones recorded with the Set-based blocking graph', () => {
  // Recorded on 2026-09-08 before the blocking graph moved to typed arrays;
  // the storage may change, the numbers may not (order of summation included).
  const recorded = {
    '25x50-seed7': { N: 126, solvable: true, unsolved: 0, f0: 0.07936507936507936, T2: 0, almost: 29, D: 10, bends: 2.738095238095238, multiLine: 0.7301587301587301, coil: 0.244, selfAdj: 2.1744, bendsPerCell: 0.276, span: 0.15476190476190452, spanTop10: 0.4784615384615386, spanMax: 0.72, outDeg: 3.253968253968254, maxOut: 30, blockDist: 0.16227642276422763, neighbours: 8.121951219512194, sharedBorder: 0.5496450712402696, longPieces: 41, meanCorridorLen: 8.11111111111111, minLen: 2, maxLen: 68, hist: { '2-6': 83, '7-15': 22, '16-49': 17, '50+': 4 }, coverage: 1 },
    '60x60-seed3': { N: 328, solvable: true, unsolved: 0, f0: 0.08231707317073171, T2: 0, almost: 46, D: 16, bends: 2.908536585365854, multiLine: 0.7103658536585366, coil: 0.30944444444444447, selfAdj: 2.2733333333333334, bendsPerCell: 0.265, span: 0.0861788617886183, spanTop10: 0.2833333333333333, spanMax: 0.5333333333333333, outDeg: 5.524390243902439, maxOut: 59, blockDist: 0.14292218543046356, neighbours: 7.7073170731707314, sharedBorder: 0.5480881033121535, longPieces: 123, meanCorridorLen: 14.628048780487806, minLen: 2, maxLen: 102, hist: { '2-6': 199, '7-15': 70, '16-49': 48, '50+': 11 }, coverage: 1 },
    '40x40-seed2-giants4': { N: 163, solvable: true, unsolved: 0, f0: 0.09202453987730061, T2: 0, almost: 31, D: 9, bends: 2.4171779141104293, multiLine: 0.7055214723926381, coil: 0.1925, selfAdj: 2.07875, bendsPerCell: 0.24625, span: 0.12760736196319025, spanTop10: 0.45294117647058824, spanMax: 1, outDeg: 3.8098159509202456, maxOut: 56, blockDist: 0.1807769726247987, neighbours: 8.125, sharedBorder: 0.5503663717809313, longPieces: 56, meanCorridorLen: 9.049079754601227, minLen: 2, maxLen: 117, hist: { '2-6': 102, '7-15': 36, '16-49': 20, '50+': 5 }, coverage: 1 },
    '50x50-seed5-headBias1': { N: 259, solvable: true, unsolved: 0, f0: 0.02702702702702703, T2: 0, almost: 29, D: 18, bends: 2.718146718146718, multiLine: 0.7413127413127413, coil: 0.2552, selfAdj: 2.1808, bendsPerCell: 0.2816, span: 0.10169884169884122, spanTop10: 0.3223076923076923, spanMax: 0.7, outDeg: 6.8687258687258685, maxOut: 62, blockDist: 0.1705902192242833, neighbours: 7.515463917525773, sharedBorder: 0.5778675337884203, longPieces: 97, meanCorridorLen: 17.47876447876448, minLen: 2, maxLen: 71, hist: { '2-6': 159, '7-15': 49, '16-49': 50, '50+': 1 }, coverage: 1 },
  }
  const boards = [[25, 50, 7, {}], [60, 60, 3, {}], [40, 40, 2, { giants: 4 }], [50, 50, 5, { headBias: 1 }]]
  for (const [W, H, seed, extra] of boards) {
    const r = generate({ ...defaultParams(), W, H, seed, ...extra })
    assert.equal(r.ok, true)
    const key = `${W}x${H}-seed${seed}${Object.keys(extra).map((k) => '-' + k + extra[k]).join('')}`
    assert.deepEqual(r.metrics, recorded[key], key)
  }
})

test('generate() treats GenerateAbort thrown from trace as an aborted, failed run', async () => {
  const { GenerateAbort } = await import('./engine.mjs')
  let ticks = 0
  const r = generate({ W: 400, H: 400, seed: 7, restarts: 3, trace: () => { ticks++; throw new GenerateAbort() } })
  assert.equal(r.ok, false)
  assert.equal(r.aborted, true)
  assert.equal(ticks, 1, 'no restart after an abort')
  assert.equal(r.restartsUsed, 0)
  assert.ok(r.board.pieces.length > 0)
  assert.ok(r.stuck.remaining > 0)
  assert.equal(r.stuck.heads, null, 'no jam was recorded, so no head count')
  // trace fires only after 250 ms, so the board must be big enough to get there
  assert.throws(() => generate({ W: 400, H: 400, seed: 7, trace: () => { throw new Error('boom') } }), /boom/, 'other errors propagate')
})

test('trace keeps firing during a thrash, so a time budget can abort it', async () => {
  const { GenerateAbort } = await import('./engine.mjs')
  // 200×200, one head try, a huge backtrack budget: the piece count circles
  // one value for a long time. A budget of 1.5 s must stop it within a few
  // seconds — once it took minutes, because trace waited for a multiple of 500.
  const r = generate({ W: 200, H: 200, seed: 1, headTries: 1, pStraight: 0.2, restarts: 0, maxBack: 100000,
    trace: (i) => { if (i.ms > 1500) throw new GenerateAbort() } })
  assert.equal(r.aborted, true)
  assert.ok(r.genMs < 6000, `aborted after ${r.genMs} ms`)
})
