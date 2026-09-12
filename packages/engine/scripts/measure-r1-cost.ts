/**
 * R1, second measurement: what does head scoring COST at 1000x1000, and is the
 * O(ray) read of section 7 of the adoption spec affordable inside the ranking
 * loop of carveOne?
 *
 * Two numbers per cut, sampled every `stride` cuts:
 *   heads   - pairable head candidates (what carveOne ranks),
 *   rayLen  - the total length of their rays, i.e. the work an O(ray) score
 *             per candidate would do for ONE cut.
 *
 * And one alternative, measured rather than assumed: the ray from a head to
 * the exit edge is the assigned PREFIX of its line, so `lineMax[d][line]` — the
 * greatest depth among the pieces on that prefix — answers the same question in
 * O(1), and is maintained by walking only the cells the frontier advances over.
 * The run checks that the O(1) answer equals the O(ray) one for every piece,
 * and counts the cells its upkeep visits.
 *
 * The engine is NOT touched.
 *
 * Run: deno run --allow-read --allow-write packages/engine/scripts/measure-r1-cost.ts [side] [seeds] [stride]
 */
import { analyse, Carver, defaultParams, mulberry32 } from '../engine.ts'
import { at, DIRS } from '../geometry.ts'
import type { Metrics, Params } from '../types.ts'

function num(arr: Int32Array, i: number): number {
  const v = arr[i]
  if (v === undefined) throw new RangeError(`index ${i} out of ${arr.length}`)
  return v
}

class CostCarver extends Carver {
  /** depth per piece id, grown as pieces are cut. */
  pieceDepth: Int32Array = new Int32Array(1024)
  /** lineMax[d][line]: greatest piece depth on the assigned prefix of the line, -1 when empty. */
  lineMax: Int32Array[]
  /** How far the prefix of each line was already folded into lineMax. */
  lineSeen: Int32Array[]
  dirty = true
  cuts = 0
  stride: number
  sampleHeads = 0
  sampleRay = 0
  samples = 0
  maxHeads = 0
  maxRay = 0
  upkeepCells = 0
  o1Mismatch = 0

  constructor(W: number, H: number, p: Params, rng: () => number, stride: number) {
    super(W, H, p, rng)
    this.stride = stride
    this.lineMax = [
      new Int32Array(W).fill(-1),
      new Int32Array(H).fill(-1),
      new Int32Array(W).fill(-1),
      new Int32Array(H).fill(-1),
    ]
    this.lineSeen = [new Int32Array(W), new Int32Array(H), new Int32Array(W), new Int32Array(H)]
  }

  /** The cell of line `line`, direction `d`, at distance `k` from the exit edge. */
  cellAt(d: number, line: number, k: number): { x: number; y: number } {
    if (d === 0) return { x: line, y: k }
    if (d === 2) return { x: line, y: this.H - 1 - k }
    if (d === 1) return { x: this.W - 1 - k, y: line }
    return { x: k, y: line }
  }

  lineOf(d: number, x: number, y: number): number {
    return d === 0 || d === 2 ? x : y
  }

  depthOfPiece(i: number): number {
    return i < this.pieces.length ? num(this.pieceDepth, i) : 0
  }

  /** O(ray): walk the whole ray of piece `i` and take the greatest blocker depth. */
  naiveDepth(i: number): number {
    const pc = at(this.pieces, i)
    const { dx, dy } = at(DIRS, pc.dir)
    const h = at(pc.cells, 0)
    let x = h.x + dx, y = h.y + dy, d = 0
    while (this.inside(x, y)) {
      const o = num(this.owner, this.idx(x, y))
      if (o >= 0 && o !== pc.id) {
        const db = this.depthOfPiece(o) + 1
        if (db > d) d = db
      }
      x += dx
      y += dy
    }
    return d
  }

  /** Folds every newly assigned prefix cell of every line into lineMax. */
  refresh(full: boolean): void {
    for (let d = 0; d < 4; d++) {
      const nLines = d === 0 || d === 2 ? this.W : this.H
      const front = at(this.depth, d)
      const lm = at(this.lineMax, d)
      const ls = at(this.lineSeen, d)
      for (let line = 0; line < nLines; line++) {
        const upTo = num(front, line)
        let from = num(ls, line)
        if (full && upTo < from) {
          // The frontier receded (undo): the prefix has to be rebuilt.
          lm[line] = -1
          from = 0
        }
        for (let k = from; k < upTo; k++) {
          const c = this.cellAt(d, line, k)
          const o = num(this.owner, this.idx(c.x, c.y))
          this.upkeepCells++
          if (o >= 0) {
            const dep = this.depthOfPiece(o)
            if (dep > num(lm, line)) lm[line] = dep
          }
        }
        ls[line] = upTo
      }
    }
  }

  /** The O(1) read: the depth a piece with this head would get. */
  fastDepth(d: number, hx: number, hy: number): number {
    const line = this.lineOf(d, hx, hy)
    const m = num(at(this.lineMax, d), line)
    return m < 0 ? 0 : m + 1
  }

  sample(): void {
    let heads = 0, ray = 0
    for (let d = 0; d < 4; d++) {
      const nLines = d === 0 || d === 2 ? this.W : this.H
      const back = at(DIRS, (d + 2) % 4)
      const front = at(this.depth, d)
      for (let line = 0; line < nLines; line++) {
        const h = this.headCandidate(d, line)
        if (!h) continue
        const bx = h.x + back.dx, by = h.y + back.dy
        if (!this.inside(bx, by) || !this.free(bx, by)) continue
        heads++
        ray += num(front, line)
      }
    }
    this.samples++
    this.sampleHeads += heads
    this.sampleRay += ray
    if (heads > this.maxHeads) this.maxHeads = heads
    if (ray > this.maxRay) this.maxRay = ray
  }

  grow(): void {
    if (this.pieceDepth.length >= this.pieces.length) return
    const g = new Int32Array(Math.max(this.pieces.length, this.pieceDepth.length * 2))
    g.set(this.pieceDepth)
    this.pieceDepth = g
  }

  override carveOne(scanAll = false): boolean {
    if (this.cuts % this.stride === 0) this.sample()
    this.cuts++
    // The prefix must be folded in BEFORE the cut: afterwards the frontier has
    // already moved past the new piece's own cells, and lineMax would answer
    // for a board the head never saw.
    this.refresh(this.dirty)
    this.dirty = false
    const before = this.pieces.length
    const ok = super.carveOne(scanAll)
    if (this.pieces.length > before) {
      this.grow()
      for (let i = before; i < this.pieces.length; i++) {
        const pc = at(this.pieces, i)
        const h = at(pc.cells, 0)
        const fast = this.fastDepth(pc.dir, h.x, h.y)
        const slow = this.naiveDepth(i)
        if (fast !== slow) this.o1Mismatch++
        this.pieceDepth[i] = slow
      }
    }
    return ok
  }

  override absorbLeftover(): boolean {
    const ok = super.absorbLeftover()
    if (ok) this.dirty = true
    return ok
  }

  override undoLast(k: number): void {
    super.undoLast(k)
    this.dirty = true
  }
}

function main(): void {
  const side = Number(Deno.args[0] ?? 1000)
  const seeds = Number(Deno.args[1] ?? 2)
  const stride = Number(Deno.args[2] ?? 500)
  const out = Deno.args[3] ?? `/tmp/arrowz-measure/r1-cost-${side}.jsonl`
  const modes: { label: string; params: Partial<Params> }[] = [
    { label: 'square', params: { W: side, H: side } },
    { label: 'tunnels', params: { W: side, H: side, headBias: 1 } },
  ]
  const rows: string[] = []
  for (const m of modes) {
    for (let seed = 1; seed <= seeds; seed++) {
      const p: Params = { ...defaultParams(), ...m.params, seed }
      const t0 = performance.now()
      const c = new CostCarver(p.W, p.H, p, mulberry32(p.seed), stride)
      const ok = c.run()
      const ms = performance.now() - t0
      let metrics: Metrics | null = null
      if (ok) metrics = analyse(c, true)
      const meanHeads = c.samples ? c.sampleHeads / c.samples : 0
      const meanRay = c.samples ? c.sampleRay / c.samples : 0
      const row = {
        label: m.label,
        seed,
        side,
        ok,
        ms: Math.round(ms),
        cuts: c.cuts,
        pieces: c.pieces.length,
        samples: c.samples,
        meanHeads,
        maxHeads: c.maxHeads,
        meanRayPerCut: meanRay,
        maxRayPerCut: c.maxRay,
        /** What an O(ray) score for every candidate head would cost over the whole run. */
        naiveTotalSteps: meanRay * c.cuts,
        /** What the O(1) alternative cost in total, measured. */
        upkeepCells: c.upkeepCells,
        o1Mismatch: c.o1Mismatch,
        D: metrics ? metrics.D : null,
      }
      rows.push(JSON.stringify(row))
      console.log(JSON.stringify(row))
      Deno.writeTextFileSync(out, rows.join('\n') + '\n')
    }
  }
  console.error(`wrote ${rows.length} rows to ${out}`)
}

main()
