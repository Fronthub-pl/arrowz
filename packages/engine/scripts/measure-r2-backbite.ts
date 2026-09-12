/**
 * R2 measurement (section 10.1 of docs/superpowers/specs/2026-09-12-prior-art-adoption-design.md):
 * what does the tail backbite do to stalls, to the leftover test and to
 * closure, at the project ceiling of 1000x1000?
 *
 * `backbite` is a Carver option, not a knob (see CarverOptions): 0 is today's
 * engine cell for cell, which the fingerprint column checks against generate().
 *
 * Run: deno run --allow-read --allow-write packages/engine/scripts/measure-r2-backbite.ts [side] [seeds] [budgetS] [out]
 */
import {
  analyse,
  Carver,
  defaultParams,
  fingerprint,
  generate,
  GenerateAbort,
  mulberry32,
  straightFloor,
  validateParams,
} from '../engine.ts'
import type { CarverStats, Metrics, Params } from '../types.ts'

type Row = {
  label: string
  backbite: number
  seed: number
  side: number
  ok: boolean
  timedOut: boolean
  restarts: number
  backtracks: number
  genMs: number
  remaining: number
  /** stats of the LAST attempt */
  pieces: number
  want: number
  got: number
  stall: number
  stallRate: number
  shortfall: number
  strandTrunc: number
  strandLoss: number
  stallLenMean: number
  stallSelfTrap: number
  backbites: number
  backbiteGiveUps: number
  absorbed: number
  absorbs: number
  /** analyse(), null when the board did not close */
  N: number | null
  D: number | null
  f0: number | null
  minLen: number | null
  maxLen: number | null
  meanLen: number | null
  hist: Record<string, number> | null
  bendsPerCell: number | null
  span: number | null
  fingerprint: string
  fingerprintMatchesGenerate: boolean | null
}

function statNum(s: CarverStats, k: keyof CarverStats): number {
  const v = s[k]
  return typeof v === 'number' ? v : 0
}

function runOne(
  label: string,
  params: Partial<Params>,
  seed: number,
  backbite: number,
  budgetMs: number,
  checkFingerprint: boolean,
): Row {
  const p: Params = { ...defaultParams(), ...params, seed, backbite }
  const violations = validateParams(p)
  if (violations.length) {
    throw new Error(`${label}: outside the envelope: ${violations.map((v) => `${v.kind}:${v.key}`).join(', ')}`)
  }
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
  const s = carver.stats
  const n = statNum(s, 'n')
  const want = statNum(s, 'want')
  const got = statNum(s, 'got')
  const stall = statNum(s, 'stall')

  let fpMatch: boolean | null = null
  if (checkFingerprint && backbite === 0 && ok) {
    const ref = generate({ ...params, seed })
    fpMatch = fingerprint(ref.board) === fingerprint(carver)
  }

  return {
    label,
    backbite,
    seed,
    side: p.W,
    ok,
    timedOut,
    restarts: used,
    backtracks: carver.backtracks,
    genMs: Math.round(genMs),
    remaining: carver.remaining,
    pieces: n,
    want,
    got,
    stall,
    stallRate: n ? stall / n : 0,
    shortfall: want ? 1 - got / want : 0,
    strandTrunc: statNum(s, 'strandTrunc'),
    strandLoss: statNum(s, 'strandLoss'),
    stallLenMean: stall ? statNum(s, 'stallLen') / stall : 0,
    stallSelfTrap: statNum(s, 'stallSelfTrap'),
    backbites: statNum(s, 'backbites'),
    backbiteGiveUps: statNum(s, 'backbiteGiveUps'),
    absorbed: statNum(s, 'absorbed'),
    absorbs: statNum(s, 'absorbs'),
    N: metrics ? metrics.N : null,
    D: metrics ? metrics.D : null,
    f0: metrics ? metrics.f0 : null,
    minLen: metrics ? metrics.minLen : null,
    maxLen: metrics ? metrics.maxLen : null,
    meanLen: metrics ? (p.W * p.H) / metrics.N : null,
    hist: metrics ? { ...metrics.hist } : null,
    bendsPerCell: metrics ? metrics.bendsPerCell : null,
    span: metrics ? metrics.span : null,
    fingerprint: fingerprint(carver),
    fingerprintMatchesGenerate: fpMatch,
  }
}

function main(): void {
  const side = Number(Deno.args[0] ?? 1000)
  const seeds = Number(Deno.args[1] ?? 3)
  const budgetMs = Number(Deno.args[2] ?? 300) * 1000
  const out = Deno.args[3] ?? `/tmp/arrowz-measure/r2-${side}.jsonl`
  const base = { W: side, H: side }
  // Four points of the envelope. `edge` is the most winding LEGAL setting at
  // this size: warns 6 and anticoil 4 pull the straightness floor down to 0.65
  // (straightFloor), and pStraight sits exactly on it — the corner where stalls
  // should be densest, and where a denser tail is most likely to strand.
  const sets: { label: string; params: Partial<Params> }[] = [
    { label: 'square', params: { ...base } },
    { label: 'tunnels', params: { ...base, headBias: 1 } },
    { label: 'skeleton', params: { ...base, giants: 4 } },
    { label: 'edge', params: { ...base, warns: 6, anticoil: 4, pStraight: 0.65 } },
  ]
  for (const s of sets) {
    const p: Params = { ...defaultParams(), ...s.params }
    console.error(`${s.label}: straightFloor ${straightFloor(p)}, pStraight ${p.pStraight}`)
  }
  const caps = [0, 2, 4, 8]
  const rows: Row[] = []
  for (const set of sets) {
    for (let seed = 1; seed <= seeds; seed++) {
      for (const cap of caps) {
        const row = runOne(set.label, set.params, seed, cap, budgetMs, seed === 1)
        rows.push(row)
        console.log(JSON.stringify(row))
        Deno.writeTextFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
      }
    }
  }
  console.error(`wrote ${rows.length} rows to ${out}`)
}

main()
