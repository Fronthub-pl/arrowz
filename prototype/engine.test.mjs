// Generator robustness tests. Run: node --test 'prototype/*.test.mjs'
//
// The prototype is disposable code, but the generator must close boards up to 200×200
// without failures — these tests guard that, not eyeballing in the laboratory.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { Carver, defaultParams, mulberry32, generate, analyse, fingerprint, PARAM_SPEC, RULES, RULE_REASONS, INACTIVE_REASONS, validateParams, formatViolation } from './engine.mjs'
import * as engineExports from './engine.mjs'

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

test('generate: closes the board with the weakest nook rule, mostly short pieces and tunnels', () => {
  // The extremes of the old ranges (warns 0, shares 0.95) are outside the safe
  // envelope now; these are the hardest settings the envelope still allows.
  for (const over of [{ warns: 2 }, { wShort: 0.7, wMid: 0.1 }, { headBias: 1 }]) {
    const r = generate({ W: 100, H: 100, seed: 3, restarts: 0, ...over })
    assert.equal(r.ok && r.metrics.solvable && r.metrics.coverage === 1, true, JSON.stringify(over))
  }
})

test('generate: a board starved of head draws closes by scanning every legal head before backtracking', () => {
  // One draw per direction and very bendy pieces: 200×200 has dozens of legal
  // heads in the endgame, the four draws all miss, and the generator undid
  // fifty cuts and gave up with 39–133 legal heads still on the board (the
  // same picture as the 1000×1000 jams of the random sweep, where every jam
  // had 208–688 heads left). A backtrack undoes pieces elsewhere, so it does
  // not help; scanning every head before undoing anything closes these three
  // without a single undo. (Seed 1 of the same setting is the other jam
  // shape: after the scan ten three-cell fragments remain whose heads sit in
  // the corner of an L, so no path from them covers the fragment — that
  // needs a fragment solver, not more heads.)
  // headTries 1 and pStraight 0.2 sit outside the safe envelope on purpose:
  // the test needs a starved search, which the envelope forbids, so it
  // bypasses the check like the other engine-internal jam tests.
  for (const seed of [3, 4, 6]) {
    const r = generate({ W: 200, H: 200, seed, headTries: 1, pStraight: 0.2, restarts: 0, maxBack: 50 }, { unchecked: true })
    assert.equal(r.ok, true, `seed ${seed} did not close: ${JSON.stringify(r.stuck)}`)
    assert.equal(r.backtracks, 0, `seed ${seed}: ${r.backtracks} backtracks`)
    assert.equal(r.metrics.solvable, true, `seed ${seed}: unsolvable`)
  }
})

test('generate: after three missed head scans in a row the jam is left to backtracking', () => {
  // A quarter of the cells are voids: the free area is shredded into islands
  // whose rays cross other islands, so the legal heads that exist all fail
  // the leftover test on even a two-cell piece. The 1000×1000 jams of the
  // random sweep look the same (board 30: 253 legal heads, 0 carvable), and
  // scanning them before each of hundreds of backtracks only made the verdict
  // 1.3–3.7× slower. A scan that misses three times running is a geometric
  // jam, not a starved search: stop scanning until a scan hits again.
  // absorbLimit 0 is outside the safe envelope, so the check is bypassed.
  const r = generate({ ...defaultParams(), W: 40, H: 40, seed: 1, voidFrac: 0.25, absorbLimit: 0, restarts: 0, maxBack: 20 }, { unchecked: true })
  assert.equal(r.ok, false)
  assert.equal(r.backtracks, 20)
  assert.equal(r.board.stats.headScanHits ?? 0, 0)
  assert.ok(r.board.stats.headScans <= 3, `${r.board.stats.headScans} scans for 20 backtracks`)
})

test('generate: head scans in one attempt are limited to the backtrack budget', () => {
  // With more voids the shredded islands do have the odd carvable head: the
  // scan hits, carves one piece, the draws fail again, and the next scan
  // starts over — one full scan per piece, with ordinary carves in between
  // that keep the miss counter at zero. Board 94 of the 1000×1000 sweep did
  // 1 268 scans in one attempt (1 067 hits) and still jammed, at twice the
  // time. The scan is a cheaper alternative to an undo, so it gets the same
  // budget per attempt as the undos; after that the jam goes to backtracking.
  // absorbLimit 0 is outside the safe envelope, so the check is bypassed.
  const r = generate({ ...defaultParams(), W: 80, H: 80, seed: 4, voidFrac: 0.3, absorbLimit: 0, restarts: 0, maxBack: 20 }, { unchecked: true })
  assert.equal(r.ok, false)
  assert.equal(r.backtracks, 20)
  assert.ok(r.board.stats.headScanHits > 0, 'the case should have scan hits')
  assert.ok(r.board.stats.headScans <= 20, `${r.board.stats.headScans} scans for a budget of 20`)
})

test('generate: a jam reports how many legal heads were left at the best moment', () => {
  // Half the cells are voids, so single free cells stay isolated and nothing
  // can cover them: the run jams at once. The count of legal heads at the
  // moment of the smallest leftover tells a jam of geometry (no head at all)
  // from a jam of the search (heads exist, the carver gave up on them).
  // absorbLimit 0 is outside the safe envelope (it lets leftovers pile up),
  // which is exactly what this test needs: `unchecked` is the escape hatch for
  // engine-internal tests that want a jam on purpose.
  const r = generate({ ...defaultParams(), W: 12, H: 12, seed: 1, voidFrac: 0.5, absorbLimit: 0, restarts: 0 }, { unchecked: true })
  assert.equal(r.ok, false)
  assert.equal(Number.isInteger(r.stuck.heads), true, JSON.stringify(r.stuck))
  assert.equal(r.stuck.heads, r.board.stuckHeads)
  assert.ok(r.stuck.heads >= 0 && r.stuck.heads <= 2 * (12 + 12))
})

// --- The safe envelope: validateParams, RULES, generate() refusing bad input ---

test('validateParams: the defaults and every recorded-board setting are inside the envelope', () => {
  assert.deepEqual(validateParams(defaultParams()), [])
  for (const extra of [{ headBias: -1 }, { headBias: 1 }, { giants: 4 }, { warns: 2 }, { wShort: 0.7, wMid: 0.1 }]) {
    assert.deepEqual(validateParams({ ...defaultParams(), ...extra }), [], JSON.stringify(extra))
  }
})

test('validateParams: each narrowed knob rejects its old extreme with the new bounds', () => {
  const cases = [
    ['pStraight', 0, 0.6, 1],
    ['warns', 0, 2, 16],
    ['anticoil', 20, 1, 10],
    ['absorbLimit', 0, 12, 64],
    ['strandLimit', 2, 10, 30],
    ['headTries', 1, 2, 16],
    ['headTries', 32, 2, 16],
    ['maxBack', 5000, 0, 1000],
    ['restarts', 10, 0, 5],
    ['wGiant', 0.5, 0, 0.2],
    ['giantStraight', 0, 0.3, 1],
    ['giantSpacing', 6, 1, 3],
  ]
  for (const [key, value, min, max] of cases) {
    const v = validateParams({ ...defaultParams(), [key]: value })
    assert.deepEqual(v, [{ kind: 'range', key, value, min, max }], `${key} = ${value}`)
    // The new bound itself is still allowed.
    assert.deepEqual(validateParams({ ...defaultParams(), [key]: value < min ? min : max }), [], `${key} at the bound`)
  }
  // The spec must agree with the table the tests encode.
  for (const [key, , min, max] of cases) {
    const s = PARAM_SPEC.find((s) => s.key === key)
    assert.equal(s.min, min, `${key}.min`)
    assert.equal(s.max, max, `${key}.max`)
  }
})

test('validateParams: a value that is not a finite number is a range violation', () => {
  for (const value of [NaN, Infinity, -Infinity, undefined, null, '5', true]) {
    const v = validateParams({ ...defaultParams(), W: value })
    assert.deepEqual(v, [{ kind: 'range', key: 'W', value, min: 4, max: 1000 }], String(value))
  }
})

test('validateParams: ignores keys that are not knobs and does not check step alignment', () => {
  const p = { ...defaultParams(), ruleB: false, voidFrac: 0.3, trace: true, debug: 'x', unknownKnob: 1e9 }
  assert.deepEqual(validateParams(p), [])
  // maxBack has step 50; 25 is off the step but inside the range, so it passes.
  assert.deepEqual(validateParams({ ...defaultParams(), maxBack: 25 }), [])
})

test('validateParams: cross-knob rules fire beyond their boundary and not at it', () => {
  const rule = (key, keys) => [{ kind: 'rule', key, keys }]
  // sharesSum: wShort + wMid <= 0.9
  assert.deepEqual(validateParams({ ...defaultParams(), wShort: 0.8, wMid: 0.1 }), [])
  assert.deepEqual(validateParams({ ...defaultParams(), wShort: 0.8, wMid: 0.2 }), rule('sharesSum', ['wShort', 'wMid']))
  // lmaxHole: Lmax 0 or >= 6
  assert.deepEqual(validateParams({ ...defaultParams(), Lmax: 0 }), [])
  assert.deepEqual(validateParams({ ...defaultParams(), Lmax: 6 }), [])
  assert.deepEqual(validateParams({ ...defaultParams(), Lmax: 3 }), rule('lmaxHole', ['Lmax']))
  // mixHole: mix -1 or within 0.3..0.7
  for (const mix of [-1, 0.3, 0.5, 0.7]) assert.deepEqual(validateParams({ ...defaultParams(), mix }), [], `mix ${mix}`)
  for (const mix of [0.1, 0.8]) assert.deepEqual(validateParams({ ...defaultParams(), mix }), rule('mixHole', ['mix']), `mix ${mix}`)
  // Every rule has a reason text and only names real knobs.
  for (const r of RULES) {
    assert.equal(typeof RULE_REASONS[r.key], 'string', r.key)
    for (const k of r.keys) assert.ok(PARAM_SPEC.some((s) => s.key === k), `${r.key} names ${k}`)
  }
})

test('validateParams: range violations come first, then rule violations, all of them at once', () => {
  const v = validateParams({ ...defaultParams(), pStraight: 0.2, Lmax: 3, warns: 0 })
  assert.deepEqual(v.map((x) => [x.kind, x.key]), [['range', 'pStraight'], ['range', 'warns'], ['rule', 'lmaxHole']])
})

test('formatViolation: one English line per violation', () => {
  assert.equal(formatViolation({ kind: 'range', key: 'pStraight', value: 0.2, min: 0.6, max: 1 }), 'straightness bias: 0.2 is outside 0.6..1')
  assert.equal(formatViolation({ kind: 'range', key: 'W', value: 2000, min: 4, max: 1000 }), 'width: 2000 is outside 4..1000')
  assert.equal(formatViolation({ kind: 'rule', key: 'sharesSum', keys: ['wShort', 'wMid'] }), RULE_REASONS.sharesSum)
  assert.equal(formatViolation({ kind: 'rule', key: 'lmaxHole', keys: ['Lmax'] }), 'maximum length must be 0 (automatic) or at least 6')
  assert.equal(formatViolation({ kind: 'rule', key: 'mixHole', keys: ['mix'] }), 'mixing must be -1 (off) or between 0.3 and 0.7')
})

test('generate: refuses parameters outside the envelope before carving anything', () => {
  // A 1000x1000 board would take seconds to carve; the refusal has to be instant.
  const t0 = performance.now()
  let err = null
  try { generate({ W: 1000, H: 1000, seed: 1, pStraight: 0.2, Lmax: 3 }) } catch (e) { err = e }
  const ms = performance.now() - t0
  assert.ok(err instanceof RangeError, 'throws a RangeError')
  assert.equal(err.message, 'invalid parameters: straightness bias: 0.2 is outside 0.6..1; maximum length must be 0 (automatic) or at least 6')
  assert.deepEqual(err.violations, [
    { kind: 'range', key: 'pStraight', value: 0.2, min: 0.6, max: 1 },
    { kind: 'rule', key: 'lmaxHole', keys: ['Lmax'] },
  ])
  assert.ok(ms < 200, `refusal took ${Math.round(ms)} ms, so it carved first`)
})

test('generate: unchecked skips the envelope check and carves anyway', () => {
  const r = generate({ W: 20, H: 20, seed: 1, warns: 0, restarts: 0 }, { unchecked: true })
  assert.equal(typeof r.ok, 'boolean')
  assert.ok(r.board.pieces.length > 0)
  assert.throws(() => generate({ W: 20, H: 20, seed: 1, warns: 0, restarts: 0 }), RangeError)
})

test('PARAM_SPEC: skeleton straightness and nook rule are inactive only without a skeleton', () => {
  // They shape every giant regardless of giantStep (the serpentine only seeds
  // the path), so 'stepNonZero' is gone and giantJitter keeps 'stepZero'.
  assert.equal('stepNonZero' in INACTIVE_REASONS, false)
  const spec = (k) => PARAM_SPEC.find((s) => s.key === k)
  for (const key of ['giantStraight', 'giantWarns']) {
    assert.equal(spec(key).inactive({ ...defaultParams(), giants: 0, wGiant: 0, giantStep: 14 }), 'skeletonOff', key)
    assert.equal(spec(key).inactive({ ...defaultParams(), giants: 4, giantStep: 14 }), null, `${key} with a serpentine`)
    assert.equal(spec(key).inactive({ ...defaultParams(), giants: 4, giantStep: 0 }), null, `${key} with random growth`)
    assert.equal(spec(key).inactive({ ...defaultParams(), giants: 0, wGiant: 0.1, giantStep: 14 }), null, `${key} with wGiant only`)
  }
  assert.equal(spec('giantJitter').inactive({ ...defaultParams(), giants: 4, giantStep: 0 }), 'stepZero')
  for (const s of PARAM_SPEC) {
    const why = s.inactive?.({ ...defaultParams(), giants: 0, wGiant: 0 })
    if (why) assert.ok(why in INACTIVE_REASONS, `${s.key}: unknown reason ${why}`)
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

// Arrowheads are narrow isosceles triangles: with a base as wide as the old
// 0.84 of a cell, the heads of two pieces meeting at a right angle in
// neighbouring cells touched each other.
test('toSvg: every arrowhead is taller than its base is wide', () => {
  const { toSvg } = engineExports
  const { board } = generate({ ...defaultParams(), W: 12, H: 12, seed: 3 })
  const svg = toSvg(board, { cell: 10, colored: false, strokeRatio: 0.5, top: 0 })
  const heads = [...svg.matchAll(/<polygon points="([^"]+)"/g)].map((m) => m[1].split(' ').map((p) => p.split(',').map(Number)))
  assert.equal(heads.length, board.pieces.length, 'one head per piece')
  heads.forEach(([tip, a, b], i) => {
    const base = Math.hypot(a[0] - b[0], a[1] - b[1])
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const height = Math.hypot(tip[0] - mid[0], tip[1] - mid[1])
    assert.ok(base < height, `base ${base} should be narrower than height ${height}`)
    assert.ok(base <= 6, `base ${base} must leave room for a perpendicular neighbour (≤ 0.6 of a cell)`)
    // The tip stays inside the head cell (pad 10, cell 10: centre at 15 + 10n):
    // a tip reaching into the next cell looked like the arrow overshot its point.
    const head = board.pieces[i].cells[0]
    const centre = [15 + head.x * 10, 15 + head.y * 10]
    const reach = Math.hypot(tip[0] - centre[0], tip[1] - centre[1])
    assert.ok(reach <= 5 + 1e-9, `tip reaches ${reach} beyond the head centre (max 0.5 of a cell)`)
  })
})
