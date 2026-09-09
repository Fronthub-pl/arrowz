// Generator robustness tests. Run: deno test --allow-read --allow-run prototype/
//
// The prototype is disposable code, but the generator must close boards up to 200×200
// without failures — these tests guard that, not eyeballing in the laboratory.
import { assert, assertEquals, assertThrows } from '@std/assert'
import {
  analyse,
  Carver,
  defaultParams,
  fingerprint,
  formatViolation,
  generate,
  INACTIVE_REASONS,
  InvalidParamsError,
  mulberry32,
  PARAM_SPEC,
  RULE_REASONS,
  RULES,
  validateParams,
} from './engine.ts'
import * as engineExports from './engine.ts'
import type {
  GenerateResult,
  InactiveKey,
  Metrics,
  ParamKey,
  Params,
  ParamSpec,
  Piece,
  RuleKey,
  SvgOptions,
  Violation,
} from './types.ts'

/** Reads an index the test guarantees to be valid; a miss is a test bug, so it throws. */
function at<T>(arr: ArrayLike<T>, i: number): T {
  const v = arr[i]
  if (v === undefined) throw new Error(`index ${i} out of ${arr.length}`)
  return v
}

const carver = () => new Carver(10, 10, defaultParams(), mulberry32(1))
// A set of cells in the GIVEN order — the order decides which cell the test
// takes first, and the bug was precisely that the result depended on it.
const cells = (arr: [number, number][]) => new Set(arr.map(([x, y]) => y * 10 + x))
/** The defaults with some knobs changed: what the untyped tests passed to generate(). */
const withDefaults = (over: Partial<Params>): Params => ({ ...defaultParams(), ...over })
/** The defaults with one knob set by key. */
const withKnob = (key: ParamKey, value: number): Params => {
  const p = defaultParams()
  p[key] = value
  return p
}
/** A parameter set with junk in it, for the validation tests only: the one cast of this file. */
const withRaw = (over: Record<string, unknown>): Params => ({ ...defaultParams(), ...over } as Params)
/** The metrics of a closed board; generate() reports null only for an empty board. */
const metricsOf = (r: GenerateResult): Metrics => {
  if (!r.metrics) throw new Error('no metrics')
  return r.metrics
}
/** A knob's spec; every key used here is a PARAM_SPEC key, so a miss is a test bug. */
const spec = (key: ParamKey): ParamSpec => {
  const s = PARAM_SPEC.find((s) => s.key === key)
  if (!s) throw new Error(`unknown parameter ${key}`)
  return s
}
/** The inactive rule of a knob that has one. */
const inactiveOf = (key: ParamKey): (p: Params) => InactiveKey | null => {
  const f = spec(key).inactive
  if (!f) throw new Error(`${key} has no inactive rule`)
  return f
}

Deno.test('decomposable: L-tromino regardless of the starting cell', () => {
  const c = carver()
  assertEquals(c.decomposable(cells([[1, 1], [0, 1], [1, 0]])), true, 'start at the corner')
  assertEquals(c.decomposable(cells([[0, 1], [1, 1], [1, 0]])), true, 'start on an arm')
})

Deno.test('decomposable: straight triple starting in the middle', () => {
  assertEquals(carver().decomposable(cells([[1, 0], [0, 0], [2, 0]])), true)
})

Deno.test('decomposable: T-tetromino and plus-pentomino are not decomposable', () => {
  const c = carver()
  assertEquals(c.decomposable(cells([[1, 0], [0, 1], [1, 1], [2, 1]])), false)
  assertEquals(c.decomposable(cells([[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]])), false)
})

Deno.test('decomposable: fragment on which seed 5 got stuck on 200×200', () => {
  // ··█··
  // ··█··
  // █████
  // ·█·█·
  const shape = cells([[2, 0], [2, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [3, 3]])
  assertEquals(carver().decomposable(shape), true)
})

Deno.test('decomposable: single cell and empty set', () => {
  const c = carver()
  assertEquals(c.decomposable(cells([])), true)
  assertEquals(c.decomposable(cells([[3, 3]])), false)
})

Deno.test('hasLocalDefect: cross with three leaves and a diagonal pair isolating five cells', () => {
  // A 10×10 board fully assigned except for the given cells; the "path" is empty,
  // so the test treats the surroundings of the given cells as the path's surroundings.
  const shapeBoard = (arr: [number, number][]) => {
    const c = carver()
    c.owner.fill(0)
    for (const [x, y] of arr) c.owner[y * 10 + x] = -1
    c.gen++
    return c
  }
  // cross: centre (2,2), leaves (2,1),(1,2),(3,2), the fourth arm runs on further
  let c = shapeBoard([[2, 2], [2, 1], [1, 2], [3, 2], [2, 3], [2, 4]])
  assertEquals(c.hasLocalDefect([{ x: 2, y: 2 }]), true)
  // fragment from seed 49: S = {(1,2),(2,1)} isolates (0,2),(1,3),(2,0),(1,1),(2,2)
  c = shapeBoard([[2, 0], [4, 0], [1, 1], [2, 1], [3, 1], [4, 1], [0, 2], [1, 2], [2, 2], [1, 3]])
  assertEquals(c.hasLocalDefect([{ x: 1, y: 2 }]), true)
  // a straight triple is not a defect
  c = shapeBoard([[1, 1], [2, 1], [3, 1]])
  assertEquals(c.hasLocalDefect([{ x: 2, y: 1 }]), false)
})

Deno.test('absorbLeftover: absorbs a single cell with the tail and does not change the blocking graph', () => {
  // A 6×6 board: two pieces laid out by hand, one free cell next to the tail.
  const c = new Carver(6, 6, { ...defaultParams(), absorbLimit: 8 }, mulberry32(1))
  c.owner.fill(0)
  const a: Piece = { id: 0, dir: 0, cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }] }
  const b: Piece = { id: 1, dir: 1, cells: [{ x: 5, y: 0 }, { x: 4, y: 0 }, { x: 3, y: 0 }] }
  c.pieces.push(a, b)
  for (const cell of b.cells) c.owner[cell.y * 6 + cell.x] = 1
  c.owner[3 * 6 + 0] = -1 // (0,3) free, adjacent to the tail of piece 0
  c.remaining = 1
  const before = analyse(c).solvable
  assertEquals(c.absorbLeftover(), true)
  assertEquals(c.remaining, 0)
  assertEquals(c.owner[3 * 6 + 0], 0)
  assertEquals(a.cells[a.cells.length - 1], { x: 0, y: 3 })
  assertEquals(analyse(c).solvable, before)
})

Deno.test('generate: closes the board 100% and solvably on several sizes and seeds', () => {
  const cases: [number, number, number[]][] = [
    [25, 50, [1, 2, 3, 4, 5]],
    [100, 100, [1, 2]],
    [200, 200, [1, 5, 49]], // 5 and 49 are seeds that once failed to close
  ]
  for (const [W, H, seeds] of cases) {
    for (const seed of seeds) {
      const r = generate(withDefaults({ W, H, seed, restarts: 0 }))
      assertEquals(r.ok, true, `${W}×${H} seed ${seed} did not close`)
      const m = metricsOf(r)
      assertEquals(m.coverage, 1, `${W}×${H} seed ${seed}: coverage ${m.coverage}`)
      assertEquals(m.solvable, true, `${W}×${H} seed ${seed}: unsolvable`)
      assertEquals(r.backtracks, 0, `${W}×${H} seed ${seed}: ${r.backtracks} backtracks`)
    }
  }
})

// Layers mode (headBias -1) is the setting that leans on absorbLeftover: it
// leaves many leftover fragments and the generator tries to glue each one to a
// neighbour's tail before every backtrack. The boards are recorded so that an
// optimisation of the search cannot change a single cell, only the time.
// Recorded after the head-quarter fallback of round 9 (before it, seed 5 on
// 200×200 needed a restart: 3514 pieces, fingerprint 6d2b542d).
const LAYERS_GOLDEN: {
  W: number
  H: number
  seed: number
  restarts: number
  backtracks: number
  pieces: number
  fp: string
}[] = [
  { W: 150, H: 150, seed: 7, restarts: 0, backtracks: 0, pieces: 2003, fp: '58c1b0ca' },
  { W: 200, H: 200, seed: 5, restarts: 0, backtracks: 0, pieces: 3419, fp: 'ca001333' },
]

Deno.test('generate: layers mode reproduces the recorded boards cell for cell', () => {
  for (const g of LAYERS_GOLDEN) {
    const r = generate(withDefaults({ W: g.W, H: g.H, seed: g.seed, headBias: -1 }))
    const label = `${g.W}×${g.H} seed ${g.seed}`
    assertEquals(r.ok, true, label)
    assertEquals(r.restartsUsed, g.restarts, `${label}: restarts`)
    assertEquals(r.backtracks, g.backtracks, `${label}: backtracks`)
    assertEquals(r.board.pieces.length, g.pieces, `${label}: pieces`)
    assertEquals(fingerprint(r.board), g.fp, `${label}: fingerprint`)
  }
})

Deno.test('generate: layers mode closes 400×400 without restarts or backtracks', () => {
  // Seed 5 used to fail after three restarts and seed 7 needed one: with
  // piece start = layers the head pool was only the shallowest quarter of the
  // legal heads, which in the endgame are the dead pockets at the frontier,
  // so the regions of thousands of free cells were never tried (round 9).
  for (const seed of [5, 7]) {
    const r = generate(withDefaults({ W: 400, H: 400, seed, headBias: -1, restarts: 0 }))
    assertEquals(r.ok, true, `seed ${seed} did not close`)
    assertEquals(r.backtracks, 0, `seed ${seed}: ${r.backtracks} backtracks`)
    assertEquals(metricsOf(r).solvable, true, `seed ${seed}: unsolvable`)
  }
})

Deno.test('generate: layers mode on 200×200 seed 5 finishes in under four seconds', () => {
  // Before the absorption search was optimised this seed took 8.5 s (a
  // failed first attempt with 200 backtracks, three quarters of the time in
  // the path search re-run for the same fragments); after it ~2 s; with the
  // head-quarter fallback it closes in one attempt in well under a second.
  // The bound leaves a wide margin for a slow machine and still fails on
  // the old search.
  const t0 = performance.now()
  const r = generate(withDefaults({ W: 200, H: 200, seed: 5, headBias: -1 }))
  const ms = performance.now() - t0
  assertEquals(r.ok, true)
  assert(ms < 4000, `took ${Math.round(ms)} ms`)
})

Deno.test('generate: closes the board with the weakest nook rule, mostly short pieces and tunnels', () => {
  // The extremes of the old ranges (warns 0, shares 0.95) are outside the safe
  // envelope now; these are the hardest settings the envelope still allows.
  const overs: Partial<Params>[] = [{ warns: 2 }, { wShort: 0.7, wMid: 0.1 }, { headBias: 1 }]
  for (const over of overs) {
    const r = generate(withDefaults({ W: 100, H: 100, seed: 3, restarts: 0, ...over }))
    const m = metricsOf(r)
    assertEquals(r.ok && m.solvable && m.coverage === 1, true, JSON.stringify(over))
  }
})

Deno.test('generate: a board starved of head draws closes by scanning every legal head before backtracking', () => {
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
    const r = generate(withDefaults({ W: 200, H: 200, seed, headTries: 1, pStraight: 0.2, restarts: 0, maxBack: 50 }), {
      unchecked: true,
    })
    assertEquals(r.ok, true, `seed ${seed} did not close: ${JSON.stringify(r.stuck)}`)
    assertEquals(r.backtracks, 0, `seed ${seed}: ${r.backtracks} backtracks`)
    assertEquals(metricsOf(r).solvable, true, `seed ${seed}: unsolvable`)
  }
})

Deno.test('generate: after three missed head scans in a row the jam is left to backtracking', () => {
  // A quarter of the cells are voids: the free area is shredded into islands
  // whose rays cross other islands, so the legal heads that exist all fail
  // the leftover test on even a two-cell piece. The 1000×1000 jams of the
  // random sweep look the same (board 30: 253 legal heads, 0 carvable), and
  // scanning them before each of hundreds of backtracks only made the verdict
  // 1.3–3.7× slower. A scan that misses three times running is a geometric
  // jam, not a starved search: stop scanning until a scan hits again.
  // absorbLimit 0 is outside the safe envelope, so the check is bypassed.
  const r = generate({
    ...defaultParams(),
    W: 40,
    H: 40,
    seed: 1,
    voidFrac: 0.25,
    absorbLimit: 0,
    restarts: 0,
    maxBack: 20,
  }, { unchecked: true })
  assertEquals(r.ok, false)
  assertEquals(r.backtracks, 20)
  assertEquals(r.board.stats.headScanHits ?? 0, 0)
  const scans = r.board.stats.headScans
  assert(scans !== undefined && scans <= 3, `${scans} scans for 20 backtracks`)
})

Deno.test('generate: head scans in one attempt are limited to the backtrack budget', () => {
  // With more voids the shredded islands do have the odd carvable head: the
  // scan hits, carves one piece, the draws fail again, and the next scan
  // starts over — one full scan per piece, with ordinary carves in between
  // that keep the miss counter at zero. Board 94 of the 1000×1000 sweep did
  // 1 268 scans in one attempt (1 067 hits) and still jammed, at twice the
  // time. The scan is a cheaper alternative to an undo, so it gets the same
  // budget per attempt as the undos; after that the jam goes to backtracking.
  // absorbLimit 0 is outside the safe envelope, so the check is bypassed.
  const r = generate({
    ...defaultParams(),
    W: 80,
    H: 80,
    seed: 4,
    voidFrac: 0.3,
    absorbLimit: 0,
    restarts: 0,
    maxBack: 20,
  }, { unchecked: true })
  assertEquals(r.ok, false)
  assertEquals(r.backtracks, 20)
  assert((r.board.stats.headScanHits ?? 0) > 0, 'the case should have scan hits')
  const scans = r.board.stats.headScans
  assert(scans !== undefined && scans <= 20, `${scans} scans for a budget of 20`)
})

Deno.test('generate: a jam reports how many legal heads were left at the best moment', () => {
  // Half the cells are voids, so single free cells stay isolated and nothing
  // can cover them: the run jams at once. The count of legal heads at the
  // moment of the smallest leftover tells a jam of geometry (no head at all)
  // from a jam of the search (heads exist, the carver gave up on them).
  // absorbLimit 0 is outside the safe envelope (it lets leftovers pile up),
  // which is exactly what this test needs: `unchecked` is the escape hatch for
  // engine-internal tests that want a jam on purpose.
  const r = generate({ ...defaultParams(), W: 12, H: 12, seed: 1, voidFrac: 0.5, absorbLimit: 0, restarts: 0 }, {
    unchecked: true,
  })
  assertEquals(r.ok, false)
  assert(r.stuck, 'a failed run reports where it got stuck')
  assertEquals(Number.isInteger(r.stuck.heads), true, JSON.stringify(r.stuck))
  assert(r.board instanceof Carver, 'the board of generate() is the carver')
  assertEquals(r.stuck.heads, r.board.stuckHeads)
  const heads = r.stuck.heads
  assert(heads !== null && heads >= 0 && heads <= 2 * (12 + 12))
})

// --- The safe envelope: validateParams, RULES, generate() refusing bad input ---

Deno.test('validateParams: the defaults and every recorded-board setting are inside the envelope', () => {
  assertEquals(validateParams(defaultParams()), [])
  const extras: Partial<Params>[] = [{ headBias: -1 }, { headBias: 1 }, { giants: 4 }, { warns: 2 }, {
    wShort: 0.7,
    wMid: 0.1,
  }]
  for (const extra of extras) {
    assertEquals(validateParams(withDefaults(extra)), [], JSON.stringify(extra))
  }
})

Deno.test('validateParams: each narrowed knob rejects its old extreme with the new bounds', () => {
  const cases: [ParamKey, number, number, number][] = [
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
    const v = validateParams(withKnob(key, value))
    assertEquals(v, [{ kind: 'range', key, value, min, max }], `${key} = ${value}`)
    // The new bound itself is still allowed.
    assertEquals(validateParams(withKnob(key, value < min ? min : max)), [], `${key} at the bound`)
  }
  // The spec must agree with the table the tests encode.
  for (const [key, , min, max] of cases) {
    const s = spec(key)
    assertEquals(s.min, min, `${key}.min`)
    assertEquals(s.max, max, `${key}.max`)
  }
})

Deno.test('validateParams: a value that is not a finite number is a range violation', () => {
  for (const value of [NaN, Infinity, -Infinity, undefined, null, '5', true]) {
    const v = validateParams(withRaw({ W: value }))
    assertEquals(v, [{ kind: 'range', key: 'W', value, min: 4, max: 1000 }], String(value))
  }
})

Deno.test('validateParams: ignores keys that are not knobs and does not check step alignment', () => {
  const p = withRaw({ ruleB: false, voidFrac: 0.3, trace: true, debug: 'x', unknownKnob: 1e9 })
  assertEquals(validateParams(p), [])
  // maxBack has step 50; 25 is off the step but inside the range, so it passes.
  assertEquals(validateParams(withDefaults({ maxBack: 25 })), [])
})

Deno.test('validateParams: cross-knob rules fire beyond their boundary and not at it', () => {
  const rule = (key: RuleKey, keys: ParamKey[]): Violation[] => [{ kind: 'rule', key, keys }]
  // sharesSum: wShort + wMid <= 0.9
  assertEquals(validateParams(withDefaults({ wShort: 0.8, wMid: 0.1 })), [])
  assertEquals(
    validateParams(withDefaults({ wShort: 0.8, wMid: 0.2 })),
    rule('sharesSum', ['wShort', 'wMid']),
  )
  // lmaxHole: Lmax 0 or >= 6
  assertEquals(validateParams(withDefaults({ Lmax: 0 })), [])
  assertEquals(validateParams(withDefaults({ Lmax: 6 })), [])
  assertEquals(validateParams(withDefaults({ Lmax: 3 })), rule('lmaxHole', ['Lmax']))
  // mixHole: mix -1 or within 0.3..0.7
  for (const mix of [-1, 0.3, 0.5, 0.7]) assertEquals(validateParams(withDefaults({ mix })), [], `mix ${mix}`)
  for (const mix of [0.1, 0.8]) {
    assertEquals(validateParams(withDefaults({ mix })), rule('mixHole', ['mix']), `mix ${mix}`)
  }
  // Every rule has a reason text and only names real knobs.
  for (const r of RULES) {
    assertEquals(typeof RULE_REASONS[r.key], 'string', r.key)
    for (const k of r.keys) assert(PARAM_SPEC.some((s) => s.key === k), `${r.key} names ${k}`)
  }
})

Deno.test('validateParams: range violations come first, then rule violations, all of them at once', () => {
  const v = validateParams(withDefaults({ pStraight: 0.2, Lmax: 3, warns: 0 }))
  assertEquals(v.map((x) => [x.kind, x.key]), [['range', 'pStraight'], ['range', 'warns'], ['rule', 'lmaxHole']])
})

Deno.test('formatViolation: one English line per violation', () => {
  assertEquals(
    formatViolation({ kind: 'range', key: 'pStraight', value: 0.2, min: 0.6, max: 1 }),
    'straightness bias: 0.2 is outside 0.6..1',
  )
  assertEquals(
    formatViolation({ kind: 'range', key: 'W', value: 2000, min: 4, max: 1000 }),
    'width: 2000 is outside 4..1000',
  )
  assertEquals(formatViolation({ kind: 'rule', key: 'sharesSum', keys: ['wShort', 'wMid'] }), RULE_REASONS.sharesSum)
  assertEquals(
    formatViolation({ kind: 'rule', key: 'lmaxHole', keys: ['Lmax'] }),
    'maximum length must be 0 (automatic) or at least 6',
  )
  assertEquals(
    formatViolation({ kind: 'rule', key: 'mixHole', keys: ['mix'] }),
    'mixing must be -1 (off) or between 0.3 and 0.7',
  )
})

Deno.test('generate: refuses parameters outside the envelope before carving anything', () => {
  // A 1000x1000 board would take seconds to carve; the refusal has to be instant.
  const t0 = performance.now()
  let err: unknown = null
  try {
    generate(withDefaults({ W: 1000, H: 1000, seed: 1, pStraight: 0.2, Lmax: 3 }))
  } catch (e) {
    err = e
  }
  const ms = performance.now() - t0
  assert(err instanceof RangeError, 'throws a RangeError')
  assert(err instanceof InvalidParamsError, 'throws an InvalidParamsError')
  assertEquals(
    err.message,
    'invalid parameters: straightness bias: 0.2 is outside 0.6..1; maximum length must be 0 (automatic) or at least 6',
  )
  assertEquals(err.violations, [
    { kind: 'range', key: 'pStraight', value: 0.2, min: 0.6, max: 1 },
    { kind: 'rule', key: 'lmaxHole', keys: ['Lmax'] },
  ])
  assert(ms < 200, `refusal took ${Math.round(ms)} ms, so it carved first`)
})

Deno.test('generate: unchecked skips the envelope check and carves anyway', () => {
  const r = generate(withDefaults({ W: 20, H: 20, seed: 1, warns: 0, restarts: 0 }), { unchecked: true })
  assertEquals(typeof r.ok, 'boolean')
  assert(r.board.pieces.length > 0)
  assertThrows(
    () => generate(withDefaults({ W: 20, H: 20, seed: 1, warns: 0, restarts: 0 })),
    InvalidParamsError,
    'invalid parameters',
  )
})

Deno.test('PARAM_SPEC: skeleton straightness and nook rule are inactive only without a skeleton', () => {
  // They shape every giant regardless of giantStep (the serpentine only seeds
  // the path), so 'stepNonZero' is gone and giantJitter keeps 'stepZero'.
  assertEquals('stepNonZero' in INACTIVE_REASONS, false)
  const keys: ParamKey[] = ['giantStraight', 'giantWarns']
  for (const key of keys) {
    const inactive = inactiveOf(key)
    assertEquals(inactive(withDefaults({ giants: 0, wGiant: 0, giantStep: 14 })), 'skeletonOff', key)
    assertEquals(inactive(withDefaults({ giants: 4, giantStep: 14 })), null, `${key} with a serpentine`)
    assertEquals(inactive(withDefaults({ giants: 4, giantStep: 0 })), null, `${key} with random growth`)
    assertEquals(
      inactive(withDefaults({ giants: 0, wGiant: 0.1, giantStep: 14 })),
      null,
      `${key} with wGiant only`,
    )
  }
  assertEquals(inactiveOf('giantJitter')(withDefaults({ giants: 4, giantStep: 0 })), 'stepZero')
  for (const s of PARAM_SPEC) {
    const why = s.inactive?.(withDefaults({ giants: 0, wGiant: 0 }))
    if (why) assert(why in INACTIVE_REASONS, `${s.key}: unknown reason ${why}`)
  }
})

Deno.test('analyse: does not overflow the stack with hundreds of thousands of pieces (the worker in Chrome has a small stack)', () => {
  // A 2×300 000 board covered with horizontal dominoes with the head at the right edge:
  // 300 000 pieces, all rays empty, so the blocking graph is
  // empty and the test only costs the memory for the pieces. Spreading
  // Math.min(...array) of this size throws a RangeError in Node as well.
  const W = 2, H = 300000
  const c = new Carver(W, H, defaultParams(), mulberry32(1))
  for (let y = 0; y < H; y++) {
    c.pieces.push({ id: y, dir: 1, cells: [{ x: 1, y }, { x: 0, y }] })
    c.owner[y * W] = y
    c.owner[y * W + 1] = y
  }
  c.remaining = 0
  const m = analyse(c)
  assertEquals(m.N, H)
  assertEquals(m.minLen, 2)
  assertEquals(m.maxLen, 2)
  assertEquals(m.coverage, 1)
})

Deno.test('analyse: a dense blocking graph fits in a 256 MB heap (1000×1000 with 150 thousand pieces ran out of memory)', async () => {
  // 400×400 covered with horizontal dominoes whose head is the LEFT cell and
  // which point left: every ray crosses all dominoes to its left in the row,
  // 100 on average, so the blocking graph has 8 million edges. Kept as Sets of
  // ids plus a copy for Kahn, that graph needs over a gigabyte; two boards of
  // the random 1000×1000 sweep (155 thousand mostly short pieces, 25 million
  // edges) killed the CLI with "Reached heap limit" after the generator had
  // closed them at 150 MB. The child process makes the bound a real assertion.
  const script = `
    import { Carver, defaultParams, mulberry32, analyse } from ${
    JSON.stringify(new URL('./engine.ts', import.meta.url).href)
  }
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
  const r = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-read', '--v8-flags=--max-old-space-size=256', '-'],
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'piped',
  }).spawn()
  const w = r.stdin.getWriter()
  await w.write(new TextEncoder().encode(script))
  await w.close()
  const out = await r.output()
  assertEquals(out.code, 0, `analyse died under a 256 MB heap:\n${new TextDecoder().decode(out.stderr)}`)
  const last = new TextDecoder().decode(out.stdout).trim().split('\n').pop()
  assert(last, 'no output')
  // The same numbers the Set-based implementation produced without the cap.
  assertEquals(JSON.parse(last), {
    N: 80000,
    solvable: true,
    f0: 0.005,
    outDeg: 99.5,
    maxOut: 199,
    D: 199,
    almost: 400,
  })
})

Deno.test('analyse: a piece bordering two hundred thousand others does not overflow the stack', () => {
  // 3×200 000: one vertical line down the left column, the other two columns
  // covered with dominoes whose head is at the right edge (all rays empty).
  // The line shares a border with every domino, so its "longest shared border"
  // used to be Math.max(...200 000 values) — a spread proportional to the
  // number of pieces, which the repository rules forbid: it throws RangeError
  // in Node and overflows the worker stack in Chrome far earlier.
  const W = 3, H = 200000
  const c = new Carver(W, H, defaultParams(), mulberry32(1))
  const line = []
  for (let y = 0; y < H; y++) {
    line.push({ x: 0, y })
    c.owner[y * W] = 0
  }
  c.pieces.push({ id: 0, dir: 0, cells: line })
  for (let y = 0; y < H; y++) {
    const id = y + 1
    c.pieces.push({ id, dir: 1, cells: [{ x: 2, y }, { x: 1, y }] })
    c.owner[y * W + 1] = id
    c.owner[y * W + 2] = id
  }
  c.remaining = 0
  const m = analyse(c)
  assertEquals(m.N, H + 1)
  assertEquals(m.maxLen, H)
  // The line shares exactly one edge with each domino, so its longest border
  // with a single other piece is one edge over H cells.
  assertEquals(m.longPieces, 1)
  assertEquals(m.sharedBorder, 1 / H)
})

Deno.test('analyse: metrics are identical to the ones recorded with the Set-based blocking graph', () => {
  // Recorded on 2026-09-08 before the blocking graph moved to typed arrays;
  // the storage may change, the numbers may not (order of summation included).
  const recorded: Record<string, Metrics> = {
    '25x50-seed7': {
      N: 126,
      solvable: true,
      unsolved: 0,
      f0: 0.07936507936507936,
      T2: 0,
      almost: 29,
      D: 10,
      bends: 2.738095238095238,
      multiLine: 0.7301587301587301,
      coil: 0.244,
      selfAdj: 2.1744,
      bendsPerCell: 0.276,
      span: 0.15476190476190452,
      spanTop10: 0.4784615384615386,
      spanMax: 0.72,
      outDeg: 3.253968253968254,
      maxOut: 30,
      blockDist: 0.16227642276422763,
      neighbours: 8.121951219512194,
      sharedBorder: 0.5496450712402696,
      longPieces: 41,
      meanCorridorLen: 8.11111111111111,
      minLen: 2,
      maxLen: 68,
      hist: { '2-6': 83, '7-15': 22, '16-49': 17, '50+': 4 },
      coverage: 1,
    },
    '60x60-seed3': {
      N: 328,
      solvable: true,
      unsolved: 0,
      f0: 0.08231707317073171,
      T2: 0,
      almost: 46,
      D: 16,
      bends: 2.908536585365854,
      multiLine: 0.7103658536585366,
      coil: 0.30944444444444447,
      selfAdj: 2.2733333333333334,
      bendsPerCell: 0.265,
      span: 0.0861788617886183,
      spanTop10: 0.2833333333333333,
      spanMax: 0.5333333333333333,
      outDeg: 5.524390243902439,
      maxOut: 59,
      blockDist: 0.14292218543046356,
      neighbours: 7.7073170731707314,
      sharedBorder: 0.5480881033121535,
      longPieces: 123,
      meanCorridorLen: 14.628048780487806,
      minLen: 2,
      maxLen: 102,
      hist: { '2-6': 199, '7-15': 70, '16-49': 48, '50+': 11 },
      coverage: 1,
    },
    '40x40-seed2-giants4': {
      N: 163,
      solvable: true,
      unsolved: 0,
      f0: 0.09202453987730061,
      T2: 0,
      almost: 31,
      D: 9,
      bends: 2.4171779141104293,
      multiLine: 0.7055214723926381,
      coil: 0.1925,
      selfAdj: 2.07875,
      bendsPerCell: 0.24625,
      span: 0.12760736196319025,
      spanTop10: 0.45294117647058824,
      spanMax: 1,
      outDeg: 3.8098159509202456,
      maxOut: 56,
      blockDist: 0.1807769726247987,
      neighbours: 8.125,
      sharedBorder: 0.5503663717809313,
      longPieces: 56,
      meanCorridorLen: 9.049079754601227,
      minLen: 2,
      maxLen: 117,
      hist: { '2-6': 102, '7-15': 36, '16-49': 20, '50+': 5 },
      coverage: 1,
    },
    '50x50-seed5-headBias1': {
      N: 259,
      solvable: true,
      unsolved: 0,
      f0: 0.02702702702702703,
      T2: 0,
      almost: 29,
      D: 18,
      bends: 2.718146718146718,
      multiLine: 0.7413127413127413,
      coil: 0.2552,
      selfAdj: 2.1808,
      bendsPerCell: 0.2816,
      span: 0.10169884169884122,
      spanTop10: 0.3223076923076923,
      spanMax: 0.7,
      outDeg: 6.8687258687258685,
      maxOut: 62,
      blockDist: 0.1705902192242833,
      neighbours: 7.515463917525773,
      sharedBorder: 0.5778675337884203,
      longPieces: 97,
      meanCorridorLen: 17.47876447876448,
      minLen: 2,
      maxLen: 71,
      hist: { '2-6': 159, '7-15': 49, '16-49': 50, '50+': 1 },
      coverage: 1,
    },
  }
  const boards: [number, number, number, Partial<Record<ParamKey, number>>][] = [
    [25, 50, 7, {}],
    [60, 60, 3, {}],
    [40, 40, 2, { giants: 4 }],
    [50, 50, 5, { headBias: 1 }],
  ]
  for (const [W, H, seed, extra] of boards) {
    const r = generate({ ...defaultParams(), W, H, seed, ...extra })
    assertEquals(r.ok, true)
    const key = `${W}x${H}-seed${seed}${Object.entries(extra).map(([k, v]) => '-' + k + v).join('')}`
    assertEquals(r.metrics, recorded[key], key)
  }
})

/** A point of an SVG points list. */
type Pt = [number, number]
const pt = (s: string): Pt => {
  const [x, y] = s.split(',').map(Number)
  if (x === undefined || y === undefined) throw new Error(`not a point: ${s}`)
  return [x, y]
}
/** A capture group that the pattern guarantees to exist. */
const group = (m: RegExpMatchArray, i: number): string => {
  const g = m[i]
  if (g === undefined) throw new Error(`no group ${i} in ${m[0]}`)
  return g
}

// The arrowhead scales with the stroke and the line ends under it: a fixed
// head was swallowed by the round line cap from a stroke of 0.5 up, and a
// wide head touched the heads of neighbours at a right angle.
Deno.test('toSvg: at every stroke the arrowhead is wider than the line, inside its cell, and the line ends under it', () => {
  const { toSvg } = engineExports
  const cell = 20
  const { board } = generate({ ...defaultParams(), W: 12, H: 12, seed: 3 })
  for (let s = 0.2; s <= 0.9 + 1e-9; s += 0.05) {
    const svg = toSvg(board, { cell, colored: false, strokeRatio: s, top: 0 })
    const parse = (tag: string): Pt[][] =>
      [...svg.matchAll(new RegExp(`<${tag} points="([^"]+)"`, 'g'))].map((m) => group(m, 1).split(' ').map(pt))
    // A head is tip, base corner, [collar corners], base corner: the base
    // corners are the second and the last point.
    const heads: [Pt, Pt, Pt, number][] = parse('polygon').map((
      pts,
    ) => [at(pts, 0), at(pts, 1), at(pts, pts.length - 1), pts.length])
    const lines = parse('polyline')
    const tails = [...svg.matchAll(/<circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/g)].map((m) => ({
      cx: Number(group(m, 1)),
      cy: Number(group(m, 2)),
      r: Number(group(m, 3)),
    }))
    assertEquals(heads.length, board.pieces.length, 'one head per piece')
    assertEquals(lines.length, board.pieces.length, 'one line per piece')
    assertEquals(tails.length, board.pieces.length, 'one tail circle per piece')
    assert(
      !/stroke-linecap="round"/.test(svg),
      'lines end flat: the tail is a circle, the head end hides under the head',
    )
    assert(/stroke-linejoin="round"/.test(svg), 'corners stay round')
    heads.forEach(([tip, a, b, corners], i) => {
      const label = `stroke ${s.toFixed(2)} piece ${i}`
      const base = Math.hypot(a[0] - b[0], a[1] - b[1]) / cell
      const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      const height = Math.hypot(tip[0] - mid[0], tip[1] - mid[1]) / cell
      // Thin lines get an arrow: a head 0.4 of a cell plus 0.9 of the line
      // width wide (0.58 at a stroke of 0.2, 0.8 at 0.45), always 0.9 of a
      // cell tall. From a stroke of 0.5 up there is no room for that between
      // neighbours, so the head is a sharpened stick: exactly as wide as the
      // line, 1.4 times as tall.
      const want = s < 0.5 - 1e-9 ? 0.4 + 0.9 * s : s
      assert(Math.abs(base - want) < 1e-6, `${label}: base ${base}, expected ${want}`)
      assert(base <= 2 - s - 0.09, `${label}: base ${base} would touch a line in the next cell`)
      assert(height >= base, `${label}: head ${height} tall for a ${base} base is stubby`)
      // An arrow keeps one height whatever the line width; a stick is 1.4 lines tall.
      const wantHeight = s < 0.5 - 1e-9 ? 0.9 : 1.4 * s
      assert(Math.abs(height - wantHeight) < 1e-6, `${label}: head ${height} tall, expected ${wantHeight}`)
      // The tip stays inside the head cell (pad 20, cell 20: centre at 30 + 20n).
      const piece = at(board.pieces, i)
      const head = at(piece.cells, 0)
      const centre: Pt = [30 + head.x * cell, 30 + head.y * cell]
      const reach = Math.hypot(tip[0] - centre[0], tip[1] - centre[1]) / cell
      assert(reach <= 0.5 + 1e-9, `${label}: tip reaches ${reach} past the head centre`)
      // The line ends flat under the head (a round cap as wide as a stick
      // head bulged at the base) and OVERLAPS it by 0.2 of its width, so no
      // anti-aliasing seam shows at the base: an arrow, wider than the line,
      // takes the line 0.2 w past the base; a stick, exactly as wide, gets a
      // 0.2 w collar behind the base instead. The tail gets its rounding from
      // a circle of the line's radius.
      const first = at(at(lines, i), 0)
      const dir: Pt = [(tip[0] - mid[0]) / (height * cell), (tip[1] - mid[1]) / (height * cell)]
      if (s < 0.5 - 1e-9) {
        assertEquals(corners, 3, `${label}: an arrow is a plain triangle`)
        const into: Pt = [mid[0] + dir[0] * 0.2 * s * cell, mid[1] + dir[1] * 0.2 * s * cell]
        assert(
          Math.hypot(first[0] - into[0], first[1] - into[1]) < 1e-6,
          `${label}: line ends at ${first}, expected ${into}`,
        )
      } else {
        assertEquals(corners, 5, `${label}: a stick has a collar`)
        assert(
          Math.hypot(first[0] - mid[0], first[1] - mid[1]) < 1e-6,
          `${label}: line ends at ${first}, base at ${mid}`,
        )
        const collar = at(parse('polygon'), i).slice(2, 4)
        for (const c of collar) {
          const back = Math.hypot(c[0] - mid[0], c[1] - mid[1])
          assert(
            Math.abs(back - Math.hypot(0.2 * s * cell, base * cell / 2)) < 1e-6,
            `${label}: collar corner ${c} off (${back})`,
          )
        }
      }
      const tailCell = at(piece.cells, piece.cells.length - 1)
      const tail = tails[i]
      assert(tail, `${label}: no tail circle`)
      assertEquals(
        [tail.cx, tail.cy],
        [30 + tailCell.x * cell, 30 + tailCell.y * cell],
        `${label}: tail circle off the tail cell`,
      )
      assert(Math.abs(tail.r - s * cell / 2) < 1e-6, `${label}: tail radius ${tail.r} for stroke ${s}`)
      assert(
        Math.hypot(first[0] - centre[0], first[1] - centre[1]) < 0.95 * cell,
        `${label}: line end behind the neck cell`,
      )
    })
  }
})

// The head size can be set by hand (view options, in cells); 0 keeps the
// automatic rule. A head narrower than the line is pulled up to the line.
Deno.test('toSvg: head width and height knobs override the automatic size', () => {
  const { toSvg } = engineExports
  const cell = 20
  const { board } = generate({ ...defaultParams(), W: 12, H: 12, seed: 3 })
  const measure = (opts: SvgOptions) => {
    const svg = toSvg(board, { cell, colored: false, top: 0, ...opts })
    return [...svg.matchAll(/<polygon points="([^"]+)"/g)].map((m) => {
      const pts = group(m, 1).split(' ').map(pt)
      const tip = at(pts, 0), a = at(pts, 1), b = at(pts, pts.length - 1)
      const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      return {
        base: Math.hypot(a[0] - b[0], a[1] - b[1]) / cell,
        height: Math.hypot(tip[0] - mid[0], tip[1] - mid[1]) / cell,
      }
    })
  }
  for (const h of measure({ strokeRatio: 0.3, headWidth: 0.8, headHeight: 1.2 })) {
    assert(Math.abs(h.base - 0.8) < 1e-6, `base ${h.base}`)
    assert(Math.abs(h.height - 1.2) < 1e-6, `height ${h.height}`)
  }
  for (const h of measure({ strokeRatio: 0.7, headWidth: 0.4, headHeight: 0 })) {
    assert(Math.abs(h.base - 0.7) < 1e-6, `a head narrower than the line is widened to it: ${h.base}`)
    assert(Math.abs(h.height - 1.4 * 0.7) < 1e-6, `height 0 keeps the automatic rule: ${h.height}`)
  }
  for (const h of measure({ strokeRatio: 0.3, headWidth: 0, headHeight: 0.5 })) {
    assert(Math.abs(h.base - (0.4 + 0.9 * 0.3)) < 1e-6, `width 0 keeps the automatic rule: ${h.base}`)
    assert(Math.abs(h.height - 0.5) < 1e-6, `height ${h.height}`)
  }
  assertEquals(
    measure({ strokeRatio: 0.3 }),
    measure({ strokeRatio: 0.3, headWidth: 0, headHeight: 0 }),
    'zeros mean automatic',
  )
})
