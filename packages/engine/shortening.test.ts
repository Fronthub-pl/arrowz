// The shortening loop of carveOne() (prototype round 12): when a freshly grown
// path fails the leftover test, the engine looks for the longest prefix that
// passes it — jumps of len/32 downwards, then a creep upwards one cell at a
// time. The original creep called wouldStrand on every prefix, Θ(L²/32) per
// trimmed path, which made big skeleton boards take minutes. The engine now
// does it in O(L) inside Carver.prototype.shortenPath, and the acceptance
// criterion is not "faster" but "chooses exactly the same length on every
// path". Run: deno test --allow-read --allow-run packages/engine/
import { assert, assertEquals } from '@std/assert'
import { Carver, defaultParams, fingerprint, generate, mulberry32 } from './engine.ts'
import type { Cell, Params } from './types.ts'

/** Reads an index the test guarantees to be valid; a miss is a test bug, so it throws. */
function at<T>(arr: ArrayLike<T>, i: number): T {
  const v = arr[i]
  if (v === undefined) throw new Error(`index ${i} out of ${arr.length}`)
  return v
}

// The ORIGINAL block, verbatim in behaviour, kept here as the oracle: the fast
// method must return the same boolean and leave the path at the same length
// as this search for every call, whatever shortcuts it takes internally.
// It costs Θ(L²/32) per trimmed path, so it lives in a test, not in the engine.
function shortenPathReference(carver: Carver, path: Cell[], failed: Set<number>): boolean {
  const step = Math.max(1, Math.floor(path.length / 32))
  for (let L = path.length - step; L >= 2; L -= step) {
    const shorter = path.slice(0, L)
    if (!carver.wouldStrand(shorter, failed)) {
      // creep back up one at a time so as not to lose length needlessly
      let best = L
      for (let k = L + 1; k < Math.min(path.length, L + step); k++) {
        if (carver.wouldStrand(path.slice(0, k), failed)) break
        best = k
      }
      path.length = best
      return true
    }
  }
  return false
}

// Settings that make the leftover test trim: a serpentine skeleton (giants 4,
// giantStep 2) whose skeleton length spans the board many times, more
// skeletons drawn later (wGiant), with and without cutting the runs short
// (giantJitter), the layers mode, and the defaults for ordinary paths.
const FAMILIES: Partial<Params>[] = [
  { giants: 4, giantStep: 2, giantSpan: 30, wGiant: 0.2 },
  { giants: 4, giantStep: 2, giantSpan: 200, wGiant: 0.2, giantJitter: 1 },
  { giants: 4, giantStep: 2, giantSpan: 100, wGiant: 0.1, giantJitter: 0 },
  { giants: 4, giantStep: 2, giantSpan: 60, wGiant: 0.15, giantJitter: 0 },
  { headBias: -1 },
  { headBias: -1, giants: 4, giantStep: 2, giantSpan: 50, wGiant: 0.1 },
  {},
]

/** One board of the list: its size and seed plus the family's knobs. */
type BoardSpec = { W: number; H: number; seed: number } & Partial<Params>

// 64 seeded boards, 40..120 on each side, cycling through the families.
function boardList(n = 64, sizeMax = 120): BoardSpec[] {
  const rng = mulberry32(20260908)
  const out: BoardSpec[] = []
  for (let i = 0; i < n; i++) {
    const W = 40 + Math.floor(rng() * (sizeMax - 39))
    const H = 40 + Math.floor(rng() * (sizeMax - 39))
    const seed = 1 + Math.floor(rng() * 100000)
    out.push({ W, H, seed, ...at(FAMILIES, i % FAMILIES.length) })
  }
  return out
}

const label = (b: BoardSpec): string =>
  `${b.W}×${b.H} seed ${b.seed} ${JSON.stringify({ ...b, W: undefined, H: undefined, seed: undefined })}`

/** One call on which the fast method and the reference disagreed. */
type Mismatch = { board: string; len0: number; want: boolean; wantLen: number; got: boolean; gotLen: number }

Deno.test('shortenPath: agrees with the original jump-and-creep search on every call over 64 trimming boards', () => {
  const proto = Carver.prototype
  assertEquals(
    typeof proto.shortenPath,
    'function',
    'Carver.prototype.shortenPath is missing: carveOne() still inlines the shortening block, so there is nothing to compare with the reference',
  )
  const real = proto.shortenPath
  let calls = 0, trims = 0, refusals = 0
  let current: BoardSpec | null = null
  const mismatches: Mismatch[] = []
  // For every call: the real method on the real path and `failed`, the
  // reference on copies taken before the call. The order does not matter for
  // the verdict (wouldStrand re-stamps everything it needs on each call and
  // `failed` is local to one carve), but running the real method first means
  // it sees exactly the carver state it sees in production.
  proto.shortenPath = function (this: Carver, path: Cell[], failed: Set<number>): boolean {
    calls++
    const refPath = path.slice(), refFailed = new Set(failed), len0 = path.length
    const got = real.call(this, path, failed)
    const want = shortenPathReference(this, refPath, refFailed)
    let same = got === want && path.length === refPath.length
    for (let i = 0; same && i < path.length; i++) {
      const p = at(path, i), r = at(refPath, i)
      same = p.x === r.x && p.y === r.y
    }
    if (!same) {
      if (!current) throw new Error('shortenPath called outside a board')
      mismatches.push({ board: label(current), len0, want, wantLen: refPath.length, got, gotLen: path.length })
    }
    if (want) trims++
    else refusals++
    return got
  }
  const fps: { fp: string; trims: number }[] = []
  try {
    for (const b of boardList()) {
      current = b
      const p: Params = { ...defaultParams(), ...b }
      const c = new Carver(p.W, p.H, p, mulberry32(p.seed))
      const ok = c.run(200)
      // A mismatch is the finding; report it before anything downstream of it
      // (a board that does not close or a wrong statistic) can hide it.
      if (mismatches.length) break
      assertEquals(ok, true, `${label(b)} did not close`)
      assertEquals(
        c.stats.strandTrunc,
        trims - fps.reduce((s, f) => s + f.trims, 0),
        `${label(b)}: strandTrunc disagrees with the reference's trim count`,
      )
      fps.push({ fp: fingerprint(c), trims: c.stats.strandTrunc })
    }
  } finally {
    proto.shortenPath = real
  }
  assertEquals(
    mismatches,
    [],
    `shortenPath differs from the reference on ${mismatches.length} call(s) of the first differing board`,
  )
  // Counts recorded on main with the reference replayed against the inline
  // block (0 mismatches there); pinned so that the test cannot pass vacuously
  // and so that a change in how often the loop runs shows up too.
  assert(calls >= 3000, `${calls} calls exercised`)
  assertEquals(trims, 1716, 'paths trimmed')
  assertEquals(refusals, 2605, 'paths refused (no prefix >= 2 passes)')
  // All 64 boards rolled into one hash (FNV-1a over the comma-joined
  // fingerprints), recorded on main.
  let h = 2166136261
  for (const ch of fps.map((f) => f.fp).join(',')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  assertEquals(h.toString(16), '78b8a0ad', 'rolled-up fingerprint of the 64 boards')
})

// Boards where the leftover test trims, recorded on main (09966e7) before
// shortenPath existed: settings, fingerprint, piece count, and the trim
// statistics. Every setting is inside the safe envelope. Together they cover
// a trimmed skeleton (a 7 324-cell serpentine cut to 62 cells on 120×120
// seed 2), trimmed ordinary paths, wGiant boards with dozens of trims, the
// layers mode, and a board whose only shortening call refuses (80×80 seed 1
// with giantSpan 60: zero trims, one refusal).
const PINNED: {
  W: number
  H: number
  seed: number
  params: Partial<Params>
  fp: string
  pieces: number
  trunc: number
  loss: number
}[] = [
  { W: 40, H: 40, seed: 2, params: {}, fp: '4979c09d', pieces: 174, trunc: 14, loss: 124 },
  { W: 60, H: 60, seed: 2, params: {}, fp: '92d39ec1', pieces: 354, trunc: 35, loss: 344 },
  {
    W: 60,
    H: 60,
    seed: 1,
    params: { giants: 4, giantStep: 2, giantSpan: 30, wGiant: 0.2 },
    fp: '1c2a0b08',
    pieces: 239,
    trunc: 14,
    loss: 1005,
  },
  {
    W: 100,
    H: 100,
    seed: 2,
    params: { giants: 4, giantStep: 2, giantSpan: 30, wGiant: 0.2 },
    fp: '900966b5',
    pieces: 710,
    trunc: 34,
    loss: 1938,
  },
  {
    W: 60,
    H: 60,
    seed: 2,
    params: { giants: 4, giantStep: 2, giantSpan: 100, wGiant: 0.1, giantJitter: 0 },
    fp: '7e84de51',
    pieces: 85,
    trunc: 2,
    loss: 1831,
  },
  {
    W: 120,
    H: 120,
    seed: 2,
    params: { giants: 4, giantStep: 2, giantSpan: 100, wGiant: 0.1, giantJitter: 0 },
    fp: '78ab2971',
    pieces: 159,
    trunc: 2,
    loss: 7262,
  },
  {
    W: 80,
    H: 80,
    seed: 2,
    params: { giants: 4, giantStep: 2, giantSpan: 200, wGiant: 0.2, giantJitter: 1 },
    fp: '61c4217f',
    pieces: 532,
    trunc: 37,
    loss: 1422,
  },
  {
    W: 120,
    H: 120,
    seed: 3,
    params: { giants: 4, giantStep: 2, giantSpan: 200, wGiant: 0.2, giantJitter: 1 },
    fp: 'e07ae4b7',
    pieces: 1185,
    trunc: 98,
    loss: 2972,
  },
  {
    W: 100,
    H: 100,
    seed: 3,
    params: { giants: 4, giantStep: 2, giantSpan: 100, wGiant: 0, giantJitter: 1 },
    fp: 'b1d3e6b2',
    pieces: 917,
    trunc: 75,
    loss: 699,
  },
  { W: 80, H: 80, seed: 1, params: { headBias: -1 }, fp: 'e3c3823f', pieces: 594, trunc: 51, loss: 339 },
  {
    W: 120,
    H: 120,
    seed: 2,
    params: { headBias: -1, giants: 4, giantStep: 2, giantSpan: 50, wGiant: 0.1 },
    fp: '2c6096c',
    pieces: 993,
    trunc: 56,
    loss: 830,
  },
  {
    W: 80,
    H: 80,
    seed: 1,
    params: { giants: 4, giantStep: 2, giantSpan: 60, wGiant: 0.15, giantJitter: 0 },
    fp: '24ccc2d8',
    pieces: 84,
    trunc: 0,
    loss: 0,
  },
]

Deno.test('generate: boards that trim reproduce the fingerprints and trim statistics recorded on main', () => {
  for (const g of PINNED) {
    const r = generate({ ...defaultParams(), W: g.W, H: g.H, seed: g.seed, ...g.params })
    const name = `${g.W}×${g.H} seed ${g.seed} ${JSON.stringify(g.params)}`
    assertEquals(r.ok, true, `${name}: did not close`)
    assertEquals(r.restartsUsed, 0, `${name}: restarts`)
    assertEquals(r.backtracks, 0, `${name}: backtracks`)
    assertEquals(r.board.pieces.length, g.pieces, `${name}: pieces`)
    assertEquals(r.board.stats.strandTrunc, g.trunc, `${name}: paths trimmed`)
    assertEquals(r.board.stats.strandLoss, g.loss, `${name}: cells trimmed off`)
    assertEquals(fingerprint(r.board), g.fp, `${name}: fingerprint`)
  }
})
