/**
 * R1 x R2: do the trap lever and the tail backbite interact, what does the
 * trap lever cost in wall clock, and does R1 still close the most winding
 * legal corner of the envelope?
 *
 * Three questions the earlier sweeps left open, in one grid because they share
 * the same runs:
 *
 * 1. INTERACTION. The R1 spike swept trapBias at backbite 0 and
 *    `measure-r2-backbite.ts` swept backbite at trapBias 0, so the corner where
 *    both are on was never recorded. The grid below is trapBias {-1, 0, 1} x
 *    backbite {0, 8}, several seeds, so the span of the pair rests on more than
 *    one board.
 *
 * 2. COST ATTRIBUTION. trapBias keeps `lineHomo` up to date (foldHomo) AND
 *    ranks the heads, with the quarter pools that follow from ranking at all,
 *    exactly like `--start` does. `tunnels` (headBias 1) is the control: it
 *    pays the ranking and allocates no line table, so the gap between it and
 *    trapBias is what the table costs. The original run carried a second
 *    control, the `freeBias` spike, which agreed with `tunnels` to within a
 *    twentieth and went out with the knob's PR.
 *
 * 3. THE ENVELOPE CORNER FOR R1. `edge` (warns 6, anticoil 4, pStraight on the
 *    straightness floor) was run for R2 only; every recorded trapBias row sits
 *    at the defaults. The corner rows below close that gap.
 *
 * Both options are measurement only (see CarverOptions): at 0 the engine takes
 * no branch and makes no draw, so the `trap 0 / backbite 0` rows are today's
 * boards cell for cell.
 *
 * Run: deno run --allow-read --allow-write packages/engine/scripts/measure-r1-r2-interaction.ts [side] [seeds] [budgetS] [out]
 */
import { analyse, Carver, defaultParams, GenerateAbort, mulberry32, straightFloor, validateParams } from '../engine.ts'
import type { CarverStats, Metrics, Params } from '../types.ts'

type Row = {
  /** the envelope point: `square` or `edge` */
  set: string
  /** what the run is for: a grid cell, or one of the two cost controls */
  label: string
  trapBias: number
  backbite: number
  headBias: number
  seed: number
  side: number
  ok: boolean
  timedOut: boolean
  restarts: number
  backtracks: number
  genMs: number
  N: number | null
  /** free at the start: the count, and the share analyse() reports */
  f0abs: number | null
  f0: number | null
  /** blocked by exactly one other piece: the pieces that LOOK ready */
  almost: number | null
  almostShare: number | null
  D: number | null
  meanLen: number | null
  maxLen: number | null
  outDeg: number | null
  backbites: number
  backbiteGiveUps: number
}

type Config = {
  set: string
  label: string
  params: Partial<Params>
  trapBias: number
  backbite: number
}

function statNum(s: CarverStats, k: keyof CarverStats): number {
  const v = s[k]
  return typeof v === 'number' ? v : 0
}

function runOne(cfg: Config, seed: number, budgetMs: number): Row {
  const p: Params = { ...defaultParams(), ...cfg.params, seed }
  const violations = validateParams(p)
  if (violations.length) throw new Error(`${cfg.set}/${cfg.label}: outside the envelope`)
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
      trapBias: cfg.trapBias,
      backbite: cfg.backbite,
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
    set: cfg.set,
    label: cfg.label,
    trapBias: cfg.trapBias,
    backbite: cfg.backbite,
    headBias: p.headBias,
    seed,
    side: p.W,
    ok,
    timedOut,
    restarts: used,
    backtracks: carver.backtracks,
    genMs: Math.round(genMs),
    N: metrics ? metrics.N : null,
    f0abs: metrics ? Math.round(metrics.f0 * metrics.N) : null,
    f0: metrics ? metrics.f0 : null,
    almost: metrics ? metrics.almost : null,
    almostShare: metrics ? metrics.almost / metrics.N : null,
    D: metrics ? metrics.D : null,
    meanLen: metrics ? (p.W * p.H) / metrics.N : null,
    maxLen: metrics ? metrics.maxLen : null,
    outDeg: metrics ? metrics.outDeg : null,
    backbites: statNum(carver.stats, 'backbites'),
    backbiteGiveUps: statNum(carver.stats, 'backbiteGiveUps'),
  }
}

function configs(side: number): Config[] {
  const square = { W: side, H: side }
  // The most winding LEGAL setting at this size: warns 6 and anticoil 4 pull
  // the straightness floor down to 0.65 and pStraight sits exactly on it. Same
  // corner as the R2 sweep, so the rows are comparable.
  const edge = { ...square, warns: 6, anticoil: 4, pStraight: 0.65 }
  const out: Config[] = []
  for (const trapBias of [0, -1, 1]) {
    for (const backbite of [0, 8]) {
      out.push({
        set: 'square',
        label: `trap ${trapBias} / bb ${backbite}`,
        params: square,
        trapBias,
        backbite,
      })
    }
  }
  // Cost controls: the ranking branch without a line table.
  out.push({
    set: 'square',
    label: 'control tunnels',
    params: { ...square, headBias: 1 },
    trapBias: 0,
    backbite: 0,
  })
  // The envelope corner. trapBias 0 / backbite 0 is the reference point; the R2
  // sweep already covers trap 0 at cap 8, so the pair is measured at +-1 only.
  out.push({ set: 'edge', label: 'trap 0 / bb 0', params: edge, trapBias: 0, backbite: 0 })
  for (const trapBias of [-1, 1]) {
    for (const backbite of [0, 8]) {
      out.push({
        set: 'edge',
        label: `trap ${trapBias} / bb ${backbite}`,
        params: edge,
        trapBias,
        backbite,
      })
    }
  }
  return out
}

function main(): void {
  const side = Number(Deno.args[0] ?? 1000)
  const seeds = Number(Deno.args[1] ?? 3)
  const budgetMs = Number(Deno.args[2] ?? 300) * 1000
  const out = Deno.args[3] ?? `/tmp/arrowz-measure/r1-r2-interaction-${side}.jsonl`
  const all = configs(side)
  for (const set of ['square', 'edge']) {
    const first = all.find((c) => c.set === set)
    if (!first) continue
    const p: Params = { ...defaultParams(), ...first.params }
    console.error(`${set}: straightFloor ${straightFloor(p)}, pStraight ${p.pStraight}`)
  }
  const rows: string[] = []
  for (const cfg of all) {
    for (let seed = 1; seed <= seeds; seed++) {
      const row = runOne(cfg, seed, budgetMs)
      rows.push(JSON.stringify(row))
      console.log(JSON.stringify(row))
      Deno.writeTextFileSync(out, rows.join('\n') + '\n')
    }
  }
  console.error(`wrote ${rows.length} rows to ${out}`)
}

main()
