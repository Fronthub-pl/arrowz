/**
 * R1, the last open gate: is the SHARE monotone?
 *
 * The design wants one signed knob whose sign is the direction and whose
 * magnitude is the share of cuts that rank by the trap bit, with a step of
 * 0.05. Only three points of that range were ever measured — -1, 0 and +1 —
 * and an interior that is not monotone would make forty stops that do not mean
 * anything in order, which is exactly what the parameter audit spent seven PRs
 * removing. So this sweeps the interior at 1000x1000 and reports the trap count
 * per point.
 *
 * Three seeds per point, not one: the interaction run found a 2x seed spread at
 * the low corner, so a single seed per point could draw a staircase out of
 * noise. The endpoints make no draw (see carveOne), so 0 and +-1 here are the
 * same boards the earlier runs recorded, and the interior can be read against
 * them directly.
 *
 * Run: deno run --allow-read --allow-write packages/engine/scripts/measure-r1-share.ts [side] [seeds] [budgetS] [out]
 */
import { analyse, Carver, defaultParams, GenerateAbort, mulberry32, validateParams } from '../engine.ts'
import type { Metrics, Params } from '../types.ts'

type Row = {
  trapBias: number
  seed: number
  side: number
  ok: boolean
  timedOut: boolean
  restarts: number
  backtracks: number
  genMs: number
  N: number | null
  /** blocked by exactly one other piece: the pieces that LOOK ready */
  almost: number | null
  almostShare: number | null
  f0abs: number | null
  D: number | null
  meanLen: number | null
  maxLen: number | null
}

function runOne(side: number, trapBias: number, seed: number, budgetMs: number): Row {
  const p: Params = { ...defaultParams(), W: side, H: side, seed }
  const violations = validateParams(p)
  if (violations.length) throw new Error('outside the envelope')
  const t0 = performance.now()
  const deadline = t0 + budgetMs
  let carver: Carver | null = null
  let ok = false
  let used = 0
  let timedOut = false
  let metrics: Metrics | null = null
  for (let attempt = 0; attempt <= p.restarts && !ok && !timedOut; attempt++) {
    used = attempt
    metrics = null
    carver = new Carver(p.W, p.H, p, mulberry32(p.seed + attempt * 999983), {
      trapBias,
      trace: () => {
        if (performance.now() > deadline) throw new GenerateAbort()
      },
    })
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
  }
  const genMs = performance.now() - t0
  if (!carver) throw new Error('no attempt ran')
  return {
    trapBias,
    seed,
    side: p.W,
    ok,
    timedOut,
    restarts: used,
    backtracks: carver.backtracks,
    genMs: Math.round(genMs),
    N: metrics ? metrics.N : null,
    almost: metrics ? metrics.almost : null,
    almostShare: metrics ? metrics.almost / metrics.N : null,
    f0abs: metrics ? Math.round(metrics.f0 * metrics.N) : null,
    D: metrics ? metrics.D : null,
    meanLen: metrics ? (p.W * p.H) / metrics.N : null,
    maxLen: metrics ? metrics.maxLen : null,
  }
}

function main(): void {
  const side = Number(Deno.args[0] ?? 1000)
  const seeds = Number(Deno.args[1] ?? 3)
  const budgetMs = Number(Deno.args[2] ?? 300) * 1000
  const out = Deno.args[3] ?? `/tmp/arrowz-measure/r1-share-${side}.jsonl`
  const points = [-1, -0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8, 1]
  const rows: string[] = []
  for (const trapBias of points) {
    for (let seed = 1; seed <= seeds; seed++) {
      const row = runOne(side, trapBias, seed, budgetMs)
      rows.push(JSON.stringify(row))
      console.log(JSON.stringify(row))
      Deno.writeTextFileSync(out, rows.join('\n') + '\n')
    }
  }
  console.error(`wrote ${rows.length} rows to ${out}`)
}

main()
