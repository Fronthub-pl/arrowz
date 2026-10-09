/**
 * What does the trap lever do to each difficulty level, on the preset options
 * as they ship? Result (the lever cannot carry a difficulty ladder) in
 * docs/measurements/r1-r2.md.
 *
 * A trap count is not comparable across sizes (a 25x25 board has a few dozen
 * pieces, a 1000x1000 board ninety thousand), so both the count and the share
 * are recorded. `level()` gives every level a `-tunnels` option, and the lever
 * composes with `--start`, so the pair is measured as it ships rather than at
 * `--start=random` alone.
 *
 * The lever is measured at its three states, `-1`, `0` and `+1`; none of them
 * makes a draw, so these rows are comparable with every other recorded row.
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
