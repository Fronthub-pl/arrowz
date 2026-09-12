/**
 * R1 measurement (section 10.2 of docs/superpowers/specs/2026-09-12-prior-art-adoption-design.md):
 * is a piece's blocking depth already known at carve time, and what does its
 * distribution look like, so that head scoring has bands to aim at?
 *
 * The engine is NOT touched. `Carver` is exported, so the measurement is a
 * subclass that records, after every cut, the depth of the new piece as read
 * from the board AS IT IS AT THAT MOMENT:
 *
 *   depth(i) = 0 if the ray from the head to the exit edge crosses no piece,
 *              1 + max depth(blockers) otherwise.
 *
 * Four things are checked against the finished board and against analyse():
 *   age      - every blocker's id is smaller than the piece it blocks,
 *   stable   - carve-time depth equals the depth recomputed on the finished
 *              board (i.e. absorbLeftover and undoLast do not disturb it),
 *   D        - max depth equals analyse().D (Kahn's longest path),
 *   f0       - the number of depth-0 pieces equals analyse().f0.
 *
 * Run: deno run --allow-read --allow-write packages/engine/scripts/measure-r1-depth.ts [side] [seeds]
 */
import { analyse, Carver, defaultParams, fingerprint, generate, mulberry32 } from '../engine.ts'
import { at, DIRS } from '../geometry.ts'
import type { Metrics, Params } from '../types.ts'

function num(arr: Int32Array, i: number): number {
  const v = arr[i]
  if (v === undefined) throw new RangeError(`index ${i} out of ${arr.length}`)
  return v
}

/** A growable Int32Array: pieces arrive one at a time and can be undone. */
class IntList {
  buf: Int32Array = new Int32Array(1024)
  len = 0
  push(v: number): void {
    if (this.len === this.buf.length) {
      const grown = new Int32Array(this.buf.length * 2)
      grown.set(this.buf)
      this.buf = grown
    }
    this.buf[this.len++] = v
  }
  get(i: number): number {
    if (i >= this.len) throw new RangeError(`index ${i} out of ${this.len}`)
    return num(this.buf, i)
  }
  truncate(n: number): void {
    if (n < this.len) this.len = n
  }
}

/**
 * Carves normally and records, per piece, what the blocking graph said about
 * it at the moment it was cut.
 */
class DepthCarver extends Carver {
  depthAt = new IntList()
  blockersAt = new IntList()
  /** Pieces whose recorded depth was read while a blocker was still missing. */
  unknownBlocker = 0
  /**
   * Deduplication stamp of the ray walk, indexed by piece id, with its own
   * generation counter: the walk runs twice over the same ids (once per cut,
   * once over the finished board), so the piece id is NOT a usable stamp.
   */
  stamp: Int32Array = new Int32Array(1024).fill(-1)
  stampGen = 0

  override carveOne(scanAll = false): boolean {
    const before = this.pieces.length
    const ok = super.carveOne(scanAll)
    for (let i = before; i < this.pieces.length; i++) this.record(i)
    return ok
  }

  override undoLast(k: number): void {
    super.undoLast(k)
    this.depthAt.truncate(this.pieces.length)
    this.blockersAt.truncate(this.pieces.length)
  }

  /** Distinct owners on the ray from the head of piece `i` to the exit edge. */
  rayBlockers(i: number, out: number[]): void {
    out.length = 0
    if (this.stamp.length < this.pieces.length) {
      const grown = new Int32Array(Math.max(this.pieces.length, this.stamp.length * 2)).fill(-1)
      grown.set(this.stamp)
      this.stamp = grown
    }
    const g = ++this.stampGen
    const pc = at(this.pieces, i)
    const { dx, dy } = at(DIRS, pc.dir)
    const h = at(pc.cells, 0)
    let x = h.x + dx, y = h.y + dy
    while (this.inside(x, y)) {
      const o = num(this.owner, this.idx(x, y))
      if (o >= 0 && o !== pc.id && num(this.stamp, o) !== g) {
        this.stamp[o] = g
        out.push(o)
      }
      x += dx
      y += dy
    }
  }

  record(i: number): void {
    const blockers: number[] = []
    this.rayBlockers(i, blockers)
    let d = 0
    for (const b of blockers) {
      // A blocker younger than the piece would break the recurrence; it is
      // counted rather than thrown, because counting it IS the measurement.
      if (b >= this.depthAt.len) {
        this.unknownBlocker++
        continue
      }
      const db = this.depthAt.get(b)
      if (db + 1 > d) d = db + 1
    }
    this.depthAt.push(d)
    this.blockersAt.push(blockers.length)
  }
}

type Row = {
  label: string
  backbite: number
  seed: number
  W: number
  H: number
  ok: boolean
  restarts: number
  backtracks: number
  genMs: number
  N: number
  /** analyse() */
  D: number
  f0: number
  /** carve time vs finished board */
  ageViolations: number
  unknownBlocker: number
  depthMismatch: number
  maxDepthAtCarve: number
  maxDepthFinal: number
  f0AtCarve: number
  matchesD: boolean
  matchesF0: boolean
  fingerprintMatchesGenerate: boolean | null
  depthHist: Record<string, number>
  blockerHist: Record<string, number>
  blockerMax: number
  blockerMean: number
  depthMean: number
}

const BUCKETS: readonly [string, (v: number) => boolean][] = [
  ['0', (v) => v === 0],
  ['1', (v) => v === 1],
  ['2', (v) => v === 2],
  ['3-4', (v) => v >= 3 && v <= 4],
  ['5-8', (v) => v >= 5 && v <= 8],
  ['9-16', (v) => v >= 9 && v <= 16],
  ['17-32', (v) => v >= 17 && v <= 32],
  ['33+', (v) => v >= 33],
]

function histogram(values: IntList): Record<string, number> {
  const h: Record<string, number> = {}
  for (const [name] of BUCKETS) h[name] = 0
  for (let i = 0; i < values.len; i++) {
    const v = values.get(i)
    for (const [name, test] of BUCKETS) {
      if (test(v)) {
        h[name] = (h[name] ?? 0) + 1
        break
      }
    }
  }
  return h
}

/** Recomputes the depth of every piece on the FINISHED board, in id order. */
function finalDepths(c: DepthCarver): { depth: Int32Array; ageViolations: number } {
  const N = c.pieces.length
  const depth = new Int32Array(N)
  let ageViolations = 0
  const blockers: number[] = []
  for (let i = 0; i < N; i++) {
    c.rayBlockers(i, blockers)
    let d = 0
    for (const b of blockers) {
      if (b > i) {
        ageViolations++
        continue
      }
      const db = num(depth, b)
      if (db + 1 > d) d = db + 1
    }
    depth[i] = d
  }
  return { depth, ageViolations }
}

/**
 * Replays what generate() does — same derived seeds, same restart rule — with
 * the measuring subclass, so the board is the canonical one.
 */
function runOne(
  label: string,
  params: Partial<Params>,
  seed: number,
  checkFingerprint: boolean,
  backbite = 0,
): Row {
  const p: Params = { ...defaultParams(), ...params, seed }
  const t0 = performance.now()
  let carver: DepthCarver | null = null
  let ok = false
  let used = 0
  let metrics: Metrics | null = null
  for (let attempt = 0; attempt <= p.restarts && !ok; attempt++) {
    used = attempt
    metrics = null
    carver = new DepthCarver(p.W, p.H, p, mulberry32(p.seed + attempt * 999983), { backbite })
    ok = carver.run()
    if (ok) {
      metrics = analyse(carver, true)
      if (!metrics.solvable) ok = false
    }
  }
  const genMs = performance.now() - t0
  if (!carver) throw new Error('no attempt ran')
  if (!metrics) metrics = analyse(carver, true)

  const { depth, ageViolations } = finalDepths(carver)
  let depthMismatch = 0, maxFinal = 0, maxCarve = 0, f0AtCarve = 0, depthSum = 0
  for (let i = 0; i < carver.pieces.length; i++) {
    const dc = carver.depthAt.get(i)
    const df = num(depth, i)
    if (dc !== df) depthMismatch++
    if (df > maxFinal) maxFinal = df
    if (dc > maxCarve) maxCarve = dc
    if (dc === 0) f0AtCarve++
    depthSum += dc
  }
  let blockerSum = 0, blockerMax = 0
  for (let i = 0; i < carver.blockersAt.len; i++) {
    const b = carver.blockersAt.get(i)
    blockerSum += b
    if (b > blockerMax) blockerMax = b
  }

  let fpMatch: boolean | null = null
  if (checkFingerprint) {
    const ref = generate({ ...params, seed })
    fpMatch = fingerprint(ref.board) === fingerprint(carver)
  }

  const N = carver.pieces.length
  return {
    label,
    backbite,
    seed,
    W: p.W,
    H: p.H,
    ok,
    restarts: used,
    backtracks: carver.backtracks,
    genMs: Math.round(genMs),
    N,
    D: metrics.D,
    f0: metrics.f0,
    ageViolations,
    unknownBlocker: carver.unknownBlocker,
    depthMismatch,
    maxDepthAtCarve: maxCarve,
    maxDepthFinal: maxFinal,
    f0AtCarve,
    matchesD: maxFinal === metrics.D,
    matchesF0: N > 0 && Math.abs(metrics.f0 * N - f0AtCarve) < 0.5,
    fingerprintMatchesGenerate: fpMatch,
    depthHist: histogram(carver.depthAt),
    blockerHist: histogram(carver.blockersAt),
    blockerMax,
    blockerMean: N ? blockerSum / N : 0,
    depthMean: N ? depthSum / N : 0,
  }
}

function main(): void {
  const side = Number(Deno.args[0] ?? 1000)
  const seeds = Number(Deno.args[1] ?? 3)
  const out = Deno.args[2] ?? `/tmp/arrowz-measure/r1-${side}.jsonl`
  // R1 x R2: with the tail backbite on, the age invariant and the carve-time
  // depth must still hold — the move never touches cells[0].
  const backbite = Number(Deno.args[3] ?? 0)
  const modes: { label: string; params: Partial<Params> }[] = [
    { label: 'square', params: { W: side, H: side } },
    { label: 'tunnels', params: { W: side, H: side, headBias: 1 } },
    { label: 'skeleton', params: { W: side, H: side, giants: 4 } },
  ]
  const rows: Row[] = []
  for (const m of modes) {
    for (let s = 1; s <= seeds; s++) {
      // The fingerprint cross-check runs on the first seed of each mode: it
      // generates the board a second time, and at 1000x1000 that is not free.
      const row = runOne(m.label, m.params, s, s === 1 && backbite === 0, backbite)
      rows.push(row)
      console.log(JSON.stringify(row))
      Deno.writeTextFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
    }
  }
  console.error(`wrote ${rows.length} rows to ${out}`)
}

main()
