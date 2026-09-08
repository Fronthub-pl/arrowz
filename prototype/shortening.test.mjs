// The shortening loop of carveOne() (prototype round 12): when a freshly grown
// path fails the leftover test, the engine looks for the longest prefix that
// passes it — jumps of len/32 downwards, then a creep upwards one cell at a
// time. The original creep called wouldStrand on every prefix, Θ(L²/32) per
// trimmed path, which made big skeleton boards take minutes. The engine now
// does it in O(L) inside Carver.prototype.shortenPath, and the acceptance
// criterion is not "faster" but "chooses exactly the same length on every
// path". Run: node --test 'prototype/*.test.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Carver, defaultParams, mulberry32, generate, fingerprint } from './engine.mjs'

// The ORIGINAL block, verbatim in behaviour, kept here as the oracle: the fast
// method must return the same boolean and leave the path at the same length
// as this search for every call, whatever shortcuts it takes internally.
// It costs Θ(L²/32) per trimmed path, so it lives in a test, not in the engine.
function shortenPathReference(carver, path, failed) {
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
const FAMILIES = [
  { giants: 4, giantStep: 2, giantSpan: 30, wGiant: 0.2 },
  { giants: 4, giantStep: 2, giantSpan: 200, wGiant: 0.2, giantJitter: 1 },
  { giants: 4, giantStep: 2, giantSpan: 100, wGiant: 0.1, giantJitter: 0 },
  { giants: 4, giantStep: 2, giantSpan: 60, wGiant: 0.15, giantJitter: 0 },
  { headBias: -1 },
  { headBias: -1, giants: 4, giantStep: 2, giantSpan: 50, wGiant: 0.1 },
  {},
]

// 64 seeded boards, 40..120 on each side, cycling through the families.
function boardList(n = 64, sizeMax = 120) {
  const rng = mulberry32(20260908)
  const out = []
  for (let i = 0; i < n; i++) {
    const W = 40 + Math.floor(rng() * (sizeMax - 39))
    const H = 40 + Math.floor(rng() * (sizeMax - 39))
    const seed = 1 + Math.floor(rng() * 100000)
    out.push({ W, H, seed, ...FAMILIES[i % FAMILIES.length] })
  }
  return out
}

const label = (b) => `${b.W}×${b.H} seed ${b.seed} ${JSON.stringify({ ...b, W: undefined, H: undefined, seed: undefined })}`

test('shortenPath: agrees with the original jump-and-creep search on every call over 64 trimming boards', () => {
  const proto = Carver.prototype
  assert.equal(typeof proto.shortenPath, 'function',
    'Carver.prototype.shortenPath is missing: carveOne() still inlines the shortening block, so there is nothing to compare with the reference')
  const real = proto.shortenPath
  let calls = 0, trims = 0, refusals = 0, current = null
  const mismatches = []
  // For every call: the real method on the real path and `failed`, the
  // reference on copies taken before the call. The order does not matter for
  // the verdict (wouldStrand re-stamps everything it needs on each call and
  // `failed` is local to one carve), but running the real method first means
  // it sees exactly the carver state it sees in production.
  proto.shortenPath = function (path, failed) {
    calls++
    const refPath = path.slice(), refFailed = new Set(failed), len0 = path.length
    const got = real.call(this, path, failed)
    const want = shortenPathReference(this, refPath, refFailed)
    let same = got === want && path.length === refPath.length
    for (let i = 0; same && i < path.length; i++) same = path[i].x === refPath[i].x && path[i].y === refPath[i].y
    if (!same) mismatches.push({ board: label(current), len0, want, wantLen: refPath.length, got, gotLen: path.length })
    if (want) trims++; else refusals++
    return got
  }
  const fps = []
  try {
    for (const b of boardList()) {
      current = b
      const p = { ...defaultParams(), ...b }
      const c = new Carver(p.W, p.H, p, mulberry32(p.seed))
      const ok = c.run(200)
      // A mismatch is the finding; report it before anything downstream of it
      // (a board that does not close or a wrong statistic) can hide it.
      if (mismatches.length) break
      assert.equal(ok, true, `${label(b)} did not close`)
      assert.equal(c.stats.strandTrunc, trims - fps.reduce((s, f) => s + f.trims, 0), `${label(b)}: strandTrunc disagrees with the reference's trim count`)
      fps.push({ fp: fingerprint(c), trims: c.stats.strandTrunc })
    }
  } finally {
    proto.shortenPath = real
  }
  assert.deepEqual(mismatches, [], `shortenPath differs from the reference on ${mismatches.length} call(s) of the first differing board`)
  // Counts recorded on main with the reference replayed against the inline
  // block (0 mismatches there); pinned so that the test cannot pass vacuously
  // and so that a change in how often the loop runs shows up too.
  assert.ok(calls >= 3000, `${calls} calls exercised`)
  assert.equal(trims, 1716, 'paths trimmed')
  assert.equal(refusals, 2605, 'paths refused (no prefix >= 2 passes)')
  // All 64 boards rolled into one hash (FNV-1a over the comma-joined
  // fingerprints), recorded on main.
  let h = 2166136261
  for (const ch of fps.map((f) => f.fp).join(',')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  assert.equal(h.toString(16), '78b8a0ad', 'rolled-up fingerprint of the 64 boards')
})

// Boards where the leftover test trims, recorded on main (09966e7) before
// shortenPath existed: settings, fingerprint, piece count, and the trim
// statistics. Every setting is inside the safe envelope. Together they cover
// a trimmed skeleton (a 7 324-cell serpentine cut to 62 cells on 120×120
// seed 2), trimmed ordinary paths, wGiant boards with dozens of trims, the
// layers mode, and a board whose only shortening call refuses (80×80 seed 1
// with giantSpan 60: zero trims, one refusal).
const PINNED = [
  { W: 40, H: 40, seed: 2, params: {}, fp: '4979c09d', pieces: 174, trunc: 14, loss: 124 },
  { W: 60, H: 60, seed: 2, params: {}, fp: '92d39ec1', pieces: 354, trunc: 35, loss: 344 },
  { W: 60, H: 60, seed: 1, params: { giants: 4, giantStep: 2, giantSpan: 30, wGiant: 0.2 }, fp: '1c2a0b08', pieces: 239, trunc: 14, loss: 1005 },
  { W: 100, H: 100, seed: 2, params: { giants: 4, giantStep: 2, giantSpan: 30, wGiant: 0.2 }, fp: '900966b5', pieces: 710, trunc: 34, loss: 1938 },
  { W: 60, H: 60, seed: 2, params: { giants: 4, giantStep: 2, giantSpan: 100, wGiant: 0.1, giantJitter: 0 }, fp: '7e84de51', pieces: 85, trunc: 2, loss: 1831 },
  { W: 120, H: 120, seed: 2, params: { giants: 4, giantStep: 2, giantSpan: 100, wGiant: 0.1, giantJitter: 0 }, fp: '78ab2971', pieces: 159, trunc: 2, loss: 7262 },
  { W: 80, H: 80, seed: 2, params: { giants: 4, giantStep: 2, giantSpan: 200, wGiant: 0.2, giantJitter: 1 }, fp: '61c4217f', pieces: 532, trunc: 37, loss: 1422 },
  { W: 120, H: 120, seed: 3, params: { giants: 4, giantStep: 2, giantSpan: 200, wGiant: 0.2, giantJitter: 1 }, fp: 'e07ae4b7', pieces: 1185, trunc: 98, loss: 2972 },
  { W: 100, H: 100, seed: 3, params: { giants: 4, giantStep: 2, giantSpan: 100, wGiant: 0, giantJitter: 1 }, fp: 'b1d3e6b2', pieces: 917, trunc: 75, loss: 699 },
  { W: 80, H: 80, seed: 1, params: { headBias: -1 }, fp: 'e3c3823f', pieces: 594, trunc: 51, loss: 339 },
  { W: 120, H: 120, seed: 2, params: { headBias: -1, giants: 4, giantStep: 2, giantSpan: 50, wGiant: 0.1 }, fp: '2c6096c', pieces: 993, trunc: 56, loss: 830 },
  { W: 80, H: 80, seed: 1, params: { giants: 4, giantStep: 2, giantSpan: 60, wGiant: 0.15, giantJitter: 0 }, fp: '24ccc2d8', pieces: 84, trunc: 0, loss: 0 },
]

test('generate: boards that trim reproduce the fingerprints and trim statistics recorded on main', () => {
  for (const g of PINNED) {
    const r = generate({ W: g.W, H: g.H, seed: g.seed, ...g.params })
    const name = `${g.W}×${g.H} seed ${g.seed} ${JSON.stringify(g.params)}`
    assert.equal(r.ok, true, `${name}: did not close`)
    assert.equal(r.restartsUsed, 0, `${name}: restarts`)
    assert.equal(r.backtracks, 0, `${name}: backtracks`)
    assert.equal(r.board.pieces.length, g.pieces, `${name}: pieces`)
    assert.equal(r.board.stats.strandTrunc, g.trunc, `${name}: paths trimmed`)
    assert.equal(r.board.stats.strandLoss, g.loss, `${name}: cells trimmed off`)
    assert.equal(fingerprint(r.board), g.fp, `${name}: fingerprint`)
  }
})
