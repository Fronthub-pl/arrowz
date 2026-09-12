/**
 * R1, the last measurement §4 waits on: what does the trap lever do to each
 * difficulty level, on the preset options as they actually ship?
 *
 * Difficulty is a size today (`easy` 25 … `insane` 1000), and §4 proposes giving
 * the levels a second axis: `avoid` for the small ones, `off` in the middle,
 * `seek` at the top. Two things have to be known before that can be chosen, and
 * neither is in any recorded row:
 *
 * 1. WHAT A LEVEL SHOWS TODAY. A trap count is not comparable across sizes — a
 *    25×25 board has a few dozen pieces and a 1000×1000 board ninety thousand —
 *    so both the count and the share are recorded. A lever that moves the share
 *    on Insane and nothing at all on Easy would make the proposal pointless
 *    exactly where it was aimed.
 * 2. WHAT IT DOES INSIDE THE BUNDLE. `level()` gives every level a `-tunnels`
 *    option, and under the §2.3 ruling the lever and `--start` now compose, so
 *    the pair has to be measured as it will be shipped rather than at
 *    `--start=random` alone.
 *
 * The lever is measured at its three shipped states (the share lost its gate,
 * see the measurements document), so `-1`, `0` and `+1` — none of which makes a
 * draw, which is why these rows are comparable with everything recorded before.
 *
 * Run: deno run --allow-read --allow-write packages/engine/scripts/measure-r1-levels.ts [seeds] [budgetS] [out]
 */
import { analyse, Carver, defaultParams, GenerateAbort, mulberry32, validateParams } from '../engine.ts'
import { PRESETS } from '../lab-presets.ts'
import type { Metrics, Params } from '../types.ts'

type Row = {
  level: string
  option: string
  mode: string
  W: number
  H: number
  cells: number
  trapBias: number
  seed: number
  ok: boolean
  timedOut: boolean
  backtracks: number
  genMs: number
  N: number | null
  /** blocked by exactly one other piece: the pieces that LOOK ready */
  almost: number | null
  almostShare: number | null
  f0abs: number | null
  D: number | null
}

function runOne(
  level: string,
  option: string,
  mode: string,
  over: Partial<Params>,
  trapBias: number,
  seed: number,
  budgetMs: number,
): Row {
  const p: Params = { ...defaultParams(), ...over, seed }
  const violations = validateParams(p)
  if (violations.length) throw new Error(`${option}: a shipped preset outside the envelope`)
  const t0 = performance.now()
  const deadline = t0 + budgetMs
  const carver = new Carver(p.W, p.H, p, mulberry32(p.seed), {
    trapBias,
    trace: () => {
      if (performance.now() > deadline) throw new GenerateAbort()
    },
  })
  let ok = false
  let timedOut = false
  let metrics: Metrics | null = null
  try {
    ok = carver.run()
  } catch (err) {
    if (!(err instanceof GenerateAbort)) throw err
    timedOut = true
  }
  if (ok) {
    metrics = analyse(carver, true)
    if (!metrics.solvable) ok = false
  }
  return {
    level,
    option,
    mode,
    W: p.W,
    H: p.H,
    cells: p.W * p.H,
    trapBias,
    seed,
    ok,
    timedOut,
    backtracks: carver.backtracks,
    genMs: Math.round(performance.now() - t0),
    N: metrics ? metrics.N : null,
    almost: metrics ? metrics.almost : null,
    almostShare: metrics ? metrics.almost / metrics.N : null,
    f0abs: metrics ? Math.round(metrics.f0 * metrics.N) : null,
    D: metrics ? metrics.D : null,
  }
}

function main(): void {
  const seeds = Number(Deno.args[0] ?? 3)
  const budgetMs = Number(Deno.args[1] ?? 300) * 1000
  const out = Deno.args[2] ?? '/tmp/arrowz-measure/r1-levels.jsonl'
  const rows: string[] = []
  for (const lvl of PRESETS) {
    for (const opt of lvl.options) {
      for (const trapBias of [-1, 0, 1]) {
        for (let seed = 1; seed <= seeds; seed++) {
          const row = runOne(lvl.id, opt.id, opt.mode, opt.params, trapBias, seed, budgetMs)
          rows.push(JSON.stringify(row))
          console.log(JSON.stringify(row))
          Deno.writeTextFileSync(out, rows.join('\n') + '\n')
        }
      }
    }
  }
  console.error(`wrote ${rows.length} rows to ${out}`)
}

main()
