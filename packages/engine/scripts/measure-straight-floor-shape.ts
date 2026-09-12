/**
 * What drives the straightness floor: the longer side, the area, or the
 * shorter side?
 *
 * The round-14 campaign behind `straightFloor` measured SQUARES only, from 300
 * to 1000 a side, and the rule it produced reads `Math.max(W, H)`. On a square
 * every candidate rule agrees, so the campaign could not tell them apart —
 * and the rule refuses 4x1000 at anything under 0.8, a board of four thousand
 * cells.
 *
 * This run measures rectangles. For each shape it walks the straightness up
 * from 0.6 until every seed closes, and that value is the shape's floor. The
 * decisive points are the pairs of EQUAL AREA and different shape: 490x1000
 * against 700x700, and 810x1000 against 900x900. The longer side says both
 * halves of a pair differ (0.8 against 0.7, 0.8 against 0.75), the area says
 * they agree, the shorter side says the rectangles are easier still.
 *
 * The envelope is bypassed (`unchecked`), because the rule under test is the
 * one that would refuse most of these boards.
 *
 * Run: deno run --allow-read --allow-write packages/engine/scripts/measure-straight-floor-shape.ts [seeds] [budgetS] [out]
 */
import { defaultParams, generate, GenerateAbort, straightFloor } from '../engine.ts'
import type { Params } from '../types.ts'

type Row = {
  label: string
  W: number
  H: number
  cells: number
  pStraight: number
  seed: number
  ok: boolean
  timedOut: boolean
  ms: number
  remaining: number
  /** What the rule on main demands of this board. */
  ruleFloor: number
}

function runOne(label: string, W: number, H: number, pStraight: number, seed: number, budgetMs: number): Row {
  // restarts 0: a restart hides a jam behind a second draw, and the floor is
  // about the first one. The trace hook is the wall clock — a board that has
  // not closed in the budget is a board this setting cannot carve in time.
  const p: Params = { ...defaultParams(), W, H, seed, pStraight, restarts: 0 }
  const t0 = performance.now()
  const deadline = t0 + budgetMs
  let ok = false
  let timedOut = false
  let remaining = W * H
  try {
    const r = generate(p, {
      unchecked: true,
      trace: () => {
        if (performance.now() > deadline) throw new GenerateAbort()
      },
    })
    ok = r.ok
    remaining = r.stuck?.remaining ?? (r.ok ? 0 : remaining)
  } catch (err) {
    if (!(err instanceof GenerateAbort)) throw err
    timedOut = true
  }
  return {
    label,
    W,
    H,
    cells: W * H,
    pStraight,
    seed,
    ok,
    timedOut,
    ms: Math.round(performance.now() - t0),
    remaining,
    ruleFloor: straightFloor(p),
  }
}

function main(): void {
  const seeds = Number(Deno.args[0] ?? 3)
  const budgetMs = Number(Deno.args[1] ?? 180) * 1000
  const out = Deno.args[2] ?? '/tmp/arrowz-measure/straight-floor-shape.jsonl'
  // A fourth argument runs only the named shapes, so a confirmation point can
  // be added without paying for the whole campaign again.
  const only = (Deno.args[3] ?? '').split(',').filter((s) => s.length > 0)
  // Shapes, cheapest first, so a run that is cut short still says something.
  // The pairs of equal area are the point of the exercise; the squares are
  // there to reproduce the round-14 numbers with this very script.
  const shapes: { label: string; W: number; H: number }[] = [
    { label: 'strip', W: 4, H: 1000 },
    { label: 'thin', W: 100, H: 1000 },
    { label: 'quarter', W: 250, H: 1000 },
    { label: 'square-500', W: 500, H: 500 },
    { label: 'pair-490k-rect', W: 490, H: 1000 },
    { label: 'pair-490k-square', W: 700, H: 700 },
    { label: 'pair-810k-rect', W: 810, H: 1000 },
    { label: 'pair-810k-square', W: 900, H: 900 },
    { label: 'square-1000', W: 1000, H: 1000 },
    // The two shapes the geometric mean is most likely to get WRONG: their
    // equivalent square lands just under a step, so the rule grants them the
    // lower floor. 490x1000 needed a whole step more than its equal-area
    // square, so a rectangle just below a boundary is where a jam would hide.
    { label: 'boundary-693', W: 480, H: 1000 },
    { label: 'boundary-592', W: 350, H: 1000 },
  ]
  const steps = [0.6, 0.65, 0.7, 0.75, 0.8, 0.85]
  const rows: Row[] = []
  for (const shape of shapes.filter((s) => only.length === 0 || only.includes(s.label))) {
    for (const pStraight of steps) {
      let closed = 0
      for (let seed = 1; seed <= seeds; seed++) {
        const row = runOne(shape.label, shape.W, shape.H, pStraight, seed, budgetMs)
        rows.push(row)
        console.log(JSON.stringify(row))
        Deno.writeTextFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
        if (row.ok) closed++
      }
      console.error(`${shape.label} ${shape.W}x${shape.H} p${pStraight}: ${closed}/${seeds}`)
      // The floor is the first straightness every seed survives; above it the
      // board only gets easier, so the walk stops there.
      if (closed === seeds) break
    }
  }
  console.error(`wrote ${rows.length} rows to ${out}`)
}

main()
