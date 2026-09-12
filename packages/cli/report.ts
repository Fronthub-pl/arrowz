// THROWAWAY PROTOTYPE — measurement tool over the engine in engine.ts.
// Run: deno task report [--<knob>=value ...] [--only=Name] [--runs=N] [--show]
//      deno task report --bench=N [--only=Name] [--<knob>=value ...]
//
// One report per level (Easy 25, Medium 50, Hard 75, Nightmare 100, Extreme
// 200, Insane 1000·sq — a square only, like the game's Insane level), each
// at two formats (1:1 and 1:2, or one alone with --square/--portrait),
// --runs times (default 3) on seeds 1000, 1001, ... A knob written on the
// command line pins it for every level, exactly as it pins carve.ts's one
// board; --mid=N adds an intermediate level, for finding the limit of
// closability. --bench=N runs a timing benchmark instead (seeds 50000,
// 50001, ...), N runs per level. --only=Name (case insensitive, e.g.
// easy·sq) narrows either mode to one level; --show prints the board of the
// first run of a level up to 40 wide. A parameter outside the safe envelope
// is refused before the first level, exit code 2; CARVE_TIMEOUT_S=N aborts
// a run after N seconds, same as carve.ts.
import type { CarverStats, GenerateOptions, Metrics, ParamKey, Params, TraceInfo, Violation } from '@arrowz/engine'
import { formatViolation, GenerateAbort, validateParams } from '@arrowz/engine'
import { parseArgs } from '@arrowz/engine/command'
import { simpleParams } from '@arrowz/engine/simple'
// The report and bench sections build a carver by hand; those four are engine
// internals, not part of its public surface, so they come from its sources.
import { analyse, Carver, mulberry32, render } from '../engine/engine.ts'

// The CLI is a program, not a module: nothing imports it (the tests spawn it).
if (!import.meta.main) throw new Error('report.ts is the entry point for the metrics report; import the engine instead')

// Trace and debug enter the engine as functions — the engine knows no `Deno`.
// Left undefined (not null) so they fit the optional hooks of GenerateOptions.
// CARVE_TIMEOUT_S is a wall-clock budget: the engine calls the trace at least
// once a second, and past the deadline the callback aborts the run in
// progress; that run's level is then reported as a failure, same as a jam.
const timeoutEnv = Deno.env.get('CARVE_TIMEOUT_S')
const timeoutS = timeoutEnv === undefined ? null : Number(timeoutEnv)
if (timeoutS !== null && !(timeoutS >= 0)) {
  console.error(`invalid CARVE_TIMEOUT_S: ${timeoutEnv} is not a number of seconds`)
  Deno.exit(2)
}
let deadline = Infinity
/** Starts the CARVE_TIMEOUT_S budget afresh: once per run of a level. */
function armDeadline(): void {
  deadline = timeoutS === null ? Infinity : performance.now() + timeoutS * 1000
}
armDeadline()
const traceOn = Boolean(Deno.env.get('CARVE_TRACE'))
const trace = traceOn || timeoutS !== null
  ? (i: TraceInfo) => {
    if (traceOn) {
      console.error(
        `    [trace] pieces ${i.pieces}, remaining ${i.remaining}, backtracks ${i.backtracks}, ${i.ms.toFixed(0)} ms`,
      )
    }
    if (performance.now() > deadline) throw new GenerateAbort(`time budget of ${timeoutS} s exhausted`)
  }
  : undefined
const debug = Deno.env.get('GIANT_DEBUG') ? (msg: string) => console.error(msg) : undefined
/** The hooks as the Carver takes them, beside the knobs: only the ones that are on. */
const hooks: Pick<GenerateOptions, 'trace' | 'debug'> = { ...(trace ? { trace } : {}), ...(debug ? { debug } : {}) }

// report.ts's own flags are not engine parameters and the shared parser does
// not know them — it refuses whatever it does not recognise — so they are
// taken off argv before parseArgs sees the rest, the same way carve.ts used
// to take --advanced off before calling the old parser.
const argvIn = Deno.args
const REPORT_FLAGS = new Set(['runs', 'bench', 'only', 'mid', 'square', 'portrait', 'show'])
const isReportFlag = (a: string): boolean => a.startsWith('--') && REPORT_FLAGS.has(a.slice(2).split('=')[0] ?? '')
const rest = argvIn.filter(isReportFlag)
const parsed = parseArgs(argvIn.filter((a) => !isReportFlag(a)))
/** A report flag's numeric value, or a default when it is absent. */
const arg = (k: string, dflt: number): number => {
  const hit = rest.find((a) => a.startsWith(`--${k}=`))
  return hit ? Number(hit.split('=')[1]) : dflt
}
const has = (flag: string): boolean => rest.includes(`--${flag}`)

// --- the safe envelope ------------------------------------------------------
// The parser only parses; here the parsed knobs meet the ranges and the
// cross-knob rules of the engine, before any level runs. Exit code 2.
function refuseErrors(error: string, items: readonly string[]): never {
  console.error(`${error}:`)
  for (const it of items) console.error(`  - ${it}`)
  Deno.exit(2)
}
function refuseViolations(items: readonly Violation[]): never {
  console.error('invalid parameters:')
  for (const it of items) console.error(`  - ${formatViolation(it)}`)
  Deno.exit(2)
}
// A report has no size of its own — every level sets W and H — so the two
// parser errors that only matter to a single board are not errors here.
const NO_SIZE = new Set(['missing --width', 'missing --height'])
const parseErrors = parsed.errors.filter((e) => !NO_SIZE.has(e))
if (parseErrors.length) refuseErrors('invalid arguments', parseErrors)

// The pins, by the value the parser read for each. The pins go on top of the
// draw, so every knob nobody named keeps the value it would have had without
// them. Reading a pin back out of parsed.params is correct only because the
// clamp below never moves a pinned value once simpleParams has written it.
const pinned: Partial<Record<ParamKey, number>> = {}
for (const key of parsed.pins) pinned[key] = parsed.params[key]
const params = simpleParams(parsed.choice, parsed.choice.random ? Math.random : null, pinned)
function refuseInvalid(p: Params): void {
  const violations = validateParams(p)
  if (violations.length) refuseViolations(violations)
}
refuseInvalid(params)

// --- levels for the report and benchmark modes -----------------------------
// Two independent knobs: level (base size) and format (1:1 or 1:2).
// The portrait format matches a phone screen and the reference screenshot.
// Insane is the project ceiling: a million cells, ~10 s per run. It exists
// only as a square (the third field), like the game's Insane level — a
// 1000×2000 portrait would double the time for no new information.
const BASE: [string, number, 'square'?][] = [['Easy', 25], ['Medium', 50], ['Hard', 75], ['Nightmare', 100], [
  'Extreme',
  200,
], ['Insane', 1000, 'square']]
// Intermediate scale — for finding the limit of closability.
const midArg = arg('mid', 0)
if (midArg) BASE.push(['Mid', midArg])
const FORMATS: [string, number][] = has('square') ? [['', 1]] : has('portrait') ? [['', 2]] : [['·sq', 1], ['·pt', 2]]
const only = rest.find((a) => a.startsWith('--only='))?.split('=')[1]
const presets = BASE.flatMap(([name, n, squareOnly]) =>
  FORMATS.filter(([, r]) => !squareOnly || r === 1).map(([sfx, r]) => ({ name: name + sfx, W: n, H: n * r }))
)
  .filter((pre) => !only || pre.name.toLowerCase() === only.toLowerCase())
// The shared knobs passed the check above; the level sizes still have to
// (only --mid can put one outside 4..1000). Checked before the first run.
for (const pre of presets) refuseInvalid({ ...params, W: pre.W, H: pre.H })

/** An element of a sorted sample; the sample is never empty where this is read. */
function at(arr: readonly number[], i: number): number {
  const v = arr[i]
  if (v === undefined) throw new Error(`no sample at ${i}`)
  return v
}

const runs = arg('runs', 3)
const show = has('show')
const bench = arg('bench', 0)
if (bench > 0) {
  console.log(`BENCHMARK — ${bench} runs per level\n`)
  for (const pre of presets) {
    const times: number[] = [], backs: number[] = [], lens: number[] = [], maxLens: number[] = []
    let fails = 0, restartsTotal = 0
    for (let r = 0; r < bench; r++) {
      const run: Params = { ...params, W: pre.W, H: pre.H }
      const t0 = performance.now()
      const seed = 50000 + r
      let c = new Carver(pre.W, pre.H, run, mulberry32(seed), hooks)
      let ok = c.run(), rs = 0
      while (!ok && rs < 5) {
        rs++
        c = new Carver(pre.W, pre.H, run, mulberry32(seed + 999983 * rs), hooks)
        ok = c.run()
      }
      const dt = performance.now() - t0
      if (!ok) {
        fails++
        continue
      }
      times.push(dt)
      backs.push(c.backtracks)
      restartsTotal += rs
      lens.push(c.pieces.reduce((a, x) => a + x.cells.length, 0) / c.pieces.length)
      // A loop, not Math.max(...): the spread would grow with the piece count.
      let max = 0
      for (const x of c.pieces) if (x.cells.length > max) max = x.cells.length
      maxLens.push(max)
    }
    times.sort((a, b) => a - b)
    backs.sort((a, b) => a - b)
    const q = (arr: readonly number[], pp: number) => at(arr, Math.min(arr.length - 1, Math.floor(arr.length * pp)))
    const mean = (a: readonly number[]) => a.reduce((x, y) => x + y, 0) / a.length
    console.log(`--- ${pre.name} ${pre.W}x${pre.H} ---`)
    console.log(
      `  time [ms]   p50 ${q(times, 0.5).toFixed(0)}   p90 ${q(times, 0.9).toFixed(0)}   p99 ${
        q(times, 0.99).toFixed(0)
      }   max ${at(times, times.length - 1).toFixed(0)}`,
    )
    console.log(
      `  backtracks  p50 ${q(backs, 0.5)}   p90 ${q(backs, 0.9)}   p99 ${q(backs, 0.99)}   max ${
        at(backs, backs.length - 1)
      }`,
    )
    console.log(`  length      mean ${mean(lens).toFixed(2)}   maximum (mean) ${mean(maxLens).toFixed(0)}`)
    console.log(`  robustness  restarts ${restartsTotal}   failures ${fails}/${bench}\n`)
  }
  Deno.exit(0)
}

/** One closed run of the report: the metrics plus timing and carver diagnostics. */
type MetricsRun = Metrics & { tGen: number; tAna: number; backtracks: number; restarts: number; st: CarverStats }
type FailedRun = { failed: true; restarts: number; remaining: number }

console.log('PROTOTYPE — carving from a full board, minimum length 2\n')
for (const pre of presets) {
  const acc: (MetricsRun | FailedRun)[] = []
  for (let r = 0; r < runs; r++) {
    const seed = 1000 + r
    const rng = mulberry32(seed)
    const run: Params = { ...params, W: pre.W, H: pre.H }
    const t0 = performance.now()
    let c = new Carver(pre.W, pre.H, run, rng, hooks)
    let ok = c.run()
    let restarts = 0
    while (!ok && restarts < 3) {
      restarts++
      c = new Carver(pre.W, pre.H, run, mulberry32(seed + 7777 * restarts), hooks)
      ok = c.run()
    }
    const tGen = performance.now() - t0
    if (!ok) {
      const sizes = c.stuckSizes ?? c.leftoverReport()
      const hist = { '1': 0, '2-5': 0, '6-20': 0, '21-100': 0, '100+': 0 }
      for (const z of sizes) {
        if (z === 1) hist['1']++
        else if (z <= 5) hist['2-5']++
        else if (z <= 20) hist['6-20']++
        else if (z <= 100) hist['21-100']++
        else hist['100+']++
      }
      console.log(
        `  STUCK         at the best moment ${
          c.stuckRemaining ?? c.remaining
        } cells remained in ${sizes.length} fragments; largest ${sizes[0]}`,
      )
      console.log(
        `                legal heads at that moment: ${c.stuckHeads ?? '?'} (out of ${2 * (c.W + c.H)} possible)`,
      )
      console.log(
        `                sizes: singletons ${hist['1']}, 2-5: ${hist['2-5']}, 6-20: ${hist['6-20']}, 21-100: ${
          hist['21-100']
        }, 100+: ${hist['100+']}`,
      )
      acc.push({ failed: true, restarts, remaining: c.remaining })
      continue
    }
    const t1 = performance.now()
    const m = analyse(c)
    const tAna = performance.now() - t1
    acc.push({ ...m, tGen, tAna, backtracks: c.backtracks, restarts, st: c.stats })
    if (show && r === 0 && pre.W <= 40) console.log(render(c) + '\n')
  }
  const good = acc.filter((a): a is MetricsRun => !('failed' in a))
  const avg = (f: (a: MetricsRun) => number) => good.reduce((s, a) => s + f(a), 0) / good.length
  console.log(`--- ${pre.name} ${pre.W}x${pre.H} (${runs} runs) ---`)
  const first = good[0]
  if (!first) {
    console.log('  FAILED to close the board\n')
    continue
  }
  console.log(
    `  coverage      ${(avg((a) => a.coverage) * 100).toFixed(2)}%   solvable: ${
      good.every((a) => a.solvable) ? 'YES' : 'NO'
    }`,
  )
  console.log(
    `  pieces        ${avg((a) => a.N).toFixed(0)}   length ${avg((a) => a.minLen).toFixed(0)}..${
      avg((a) => a.maxLen).toFixed(0)
    }`,
  )
  console.log(
    `  length dist.  2-6: ${(avg((a) => a.hist['2-6'] / a.N) * 100).toFixed(0)}%  7-15: ${
      (avg((a) => a.hist['7-15'] / a.N) * 100).toFixed(0)
    }%  16-49: ${(avg((a) => a.hist['16-49'] / a.N) * 100).toFixed(0)}%  50+: ${
      (avg((a) => a.hist['50+'] / a.N) * 100).toFixed(1)
    }%`,
  )
  console.log(
    `  f0            ${avg((a) => a.f0).toFixed(3)}   T2: ${avg((a) => a.T2).toFixed(0)}   1-blocker: ${
      avg((a) => a.almost).toFixed(0)
    } (${(100 * avg((a) => a.almost / a.N)).toFixed(0)}%)   D: ${avg((a) => a.D).toFixed(0)}   corridor: ${
      avg((a) => a.meanCorridorLen).toFixed(1)
    }`,
  )
  console.log(
    `  SHAPE         bends/piece ${avg((a) => a.bends).toFixed(2)}   multi-line ${
      (100 * avg((a) => a.multiLine)).toFixed(0)
    }%   coiling ${(100 * avg((a) => a.coil)).toFixed(0)}%`,
  )
  console.log(
    `  REACH         mean ${(100 * avg((a) => a.span)).toFixed(0)}% of side   top 10%: ${
      (100 * avg((a) => a.spanTop10)).toFixed(0)
    }%   record ${(100 * avg((a) => a.spanMax)).toFixed(0)}%`,
  )
  console.log(
    `  UNBLOCKING    mean ${avg((a) => a.outDeg).toFixed(1)} pieces/removal   record ${
      avg((a) => a.maxOut).toFixed(0)
    }   mean distance ${(100 * avg((a) => a.blockDist)).toFixed(0)}% of perimeter`,
  )
  console.log(
    `  WRAPPING      bends/cell ${avg((a) => a.bendsPerCell).toFixed(3)}   own neighbours/cell ${
      avg((a) => a.selfAdj).toFixed(2)
    }   foreign neighbours/piece ${avg((a) => a.neighbours).toFixed(1)}   longest shared border ${
      (100 * avg((a) => a.sharedBorder)).toFixed(0)
    }% of length`,
  )
  console.log(`  backtracks    ${avg((a) => a.backtracks).toFixed(1)}   restarts: ${avg((a) => a.restarts).toFixed(1)}`)
  const st = first.st
  console.log(
    `  diagnostics   mean want ${(st.want / st.n).toFixed(1)} -> got ${(st.got / st.n).toFixed(1)}   stall ${
      (100 * st.stall / st.n).toFixed(0)
    }%   strand-trunc ${(100 * st.strandTrunc / st.n).toFixed(0)}% (mean -${
      (st.strandLoss / Math.max(1, st.strandTrunc)).toFixed(1)
    })`,
  )
  console.log(
    `  time          generation ${avg((a) => a.tGen).toFixed(0)} ms, metrics ${avg((a) => a.tAna).toFixed(0)} ms\n`,
  )
}
