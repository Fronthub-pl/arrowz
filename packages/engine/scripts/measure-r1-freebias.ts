/**
 * R1 spike: what range of "arrows free at the start" is actually reachable, and
 * does the board still close at the extremes?
 *
 * A piece is free at the start exactly when its head sits on the exit edge, so
 * the spike ranks heads by that one bit (`CarverOptions.freeBias`, measurement
 * only) and sweeps it against today's `--start` settings as the baseline.
 *
 * Run: deno run --allow-read --allow-write packages/engine/scripts/measure-r1-freebias.ts [side] [seeds] [budgetS] [out]
 */
import { analyse, Carver, defaultParams, GenerateAbort, mulberry32, validateParams } from '../engine.ts'
import type { Metrics, Params } from '../types.ts'

type Row = {
  label: string
  freeBias: number
  trapBias: number
  seed: number
  side: number
  ok: boolean
  timedOut: boolean
  restarts: number
  backtracks: number
  genMs: number
  N: number | null
  /** free at the start: share and count */
  f0: number | null
  f0abs: number | null
  /** blocked by exactly one other piece: the pieces that LOOK ready */
  almost: number | null
  almostShare: number | null
  D: number | null
  meanLen: number | null
  maxLen: number | null
  outDeg: number | null
  /** how many head cells the board has at all, i.e. the ceiling on f0 */
  edgeHeads: number | null
}

/** Pieces whose head sits on the exit edge of their own direction. */
function edgeHeads(
  board: { pieces: { cells: { x: number; y: number }[]; dir: number }[]; W: number; H: number },
): number {
  let n = 0
  for (const pc of board.pieces) {
    const h = pc.cells[0]
    if (!h) continue
    if (pc.dir === 0 && h.y === 0) n++
    else if (pc.dir === 1 && h.x === board.W - 1) n++
    else if (pc.dir === 2 && h.y === board.H - 1) n++
    else if (pc.dir === 3 && h.x === 0) n++
  }
  return n
}

function runOne(
  label: string,
  params: Partial<Params>,
  seed: number,
  freeBias: number,
  budgetMs: number,
  trapBias = 0,
): Row {
  const p: Params = { ...defaultParams(), ...params, seed }
  const violations = validateParams(p)
  if (violations.length) throw new Error(`${label}: outside the envelope`)
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
      freeBias,
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
    label,
    freeBias,
    trapBias,
    seed,
    side: p.W,
    ok,
    timedOut,
    restarts: used,
    backtracks: carver.backtracks,
    genMs: Math.round(genMs),
    N: metrics ? metrics.N : null,
    f0: metrics ? metrics.f0 : null,
    f0abs: metrics ? Math.round(metrics.f0 * metrics.N) : null,
    almost: metrics ? metrics.almost : null,
    almostShare: metrics ? metrics.almost / metrics.N : null,
    D: metrics ? metrics.D : null,
    meanLen: metrics ? (p.W * p.H) / metrics.N : null,
    maxLen: metrics ? metrics.maxLen : null,
    outDeg: metrics ? metrics.outDeg : null,
    edgeHeads: ok ? edgeHeads(carver) : null,
  }
}

function main(): void {
  const side = Number(Deno.args[0] ?? 1000)
  const seeds = Number(Deno.args[1] ?? 3)
  const budgetMs = Number(Deno.args[2] ?? 300) * 1000
  const out = Deno.args[3] ?? `/tmp/arrowz-measure/r1-freebias-${side}.jsonl`
  const base = { W: side, H: side }
  const configs: { label: string; params: Partial<Params>; freeBias: number; trapBias?: number }[] = [
    { label: 'today-random', params: { ...base }, freeBias: 0 },
    { label: 'spike-max-free', params: { ...base }, freeBias: 1 },
    { label: 'spike-max-traps', params: { ...base }, freeBias: 0, trapBias: 1 },
    { label: 'spike-min-traps', params: { ...base }, freeBias: 0, trapBias: -1 },
    { label: 'min-traps + short pieces', params: { ...base, Lmax: 17 }, freeBias: 0, trapBias: -1 },
  ]
  const rows: string[] = []
  for (const c of configs) {
    for (let seed = 1; seed <= seeds; seed++) {
      const row = runOne(c.label, c.params, seed, c.freeBias, budgetMs, c.trapBias ?? 0)
      rows.push(JSON.stringify(row))
      console.log(JSON.stringify(row))
      Deno.writeTextFileSync(out, rows.join('\n') + '\n')
    }
  }
  console.error(`wrote ${rows.length} rows to ${out}`)
}

main()
