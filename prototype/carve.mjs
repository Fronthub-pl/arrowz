// THROWAWAY PROTOTYPE — CLI layer over the engine in engine.mjs.
// Run: node prototype/carve.mjs --width=N --height=N [options]
//      node prototype/carve.mjs --advanced [--<knob>=value ...] [mode]
//
// Simple mode (default): the inputs of the simple lab view — a size, the
// sliders --length and --straight in 0..1, --skeleton, --seed, the view
// (--colorized, --lineweight, --arrowwidth, --arrowheight) and --randomized.
// Always one board → prototype/boards/ (+ a copy with --svg=path), or with
// --dry-run one JSON line and nothing written. Any other flag is refused.
//
// Advanced mode (--advanced): engine parameters as --<PARAM_SPEC key in lower
// case>=value, defaults from defaultParams(). The lab builds its command with
// the same parser, so the command from the lab reproduces the board bit for
// bit. Modes:
//   --svg[=path]    one board → prototype/boards/ (+ a copy at path)
//   --dry-run       one board, nothing written: one JSON line on stdout with
//                   the id, metrics and fingerprint (alone or next to --svg)
//   --bench=N       benchmark, N runs per level
//   (no mode)       metrics report per level, --runs=N, --only=Name, --show
//   --help, -h      usage, one row per knob with its allowed range, the rules
// Parameters outside the safe envelope (validateParams) are refused before
// any generation, in every mode, with exit code 2.
import { writeFileSync } from 'node:fs'
import { generate, toSvg, fingerprint, DIRS, Carver, analyse, mulberry32, render, validateParams, formatViolation } from './engine.mjs'
import { parseArgs, parseSimpleArgs, buildCommand, buildSimpleCommand, boardId, helpText } from './command.mjs'
import { simpleParams } from './lab-simple.mjs'
import { saveBoard } from './store.mjs'

// Trace and debug enter the engine as functions — the engine knows no `process`.
const trace = process.env.CARVE_TRACE
  ? (i) => console.error(`    [trace] pieces ${i.pieces}, remaining ${i.remaining}, backtracks ${i.backtracks}, ${i.ms.toFixed(0)} ms`)
  : null
const debug = process.env.GIANT_DEBUG ? (msg) => console.error(msg) : null

// --advanced selects the full knob set and every mode; the flag itself is not
// a parameter, so it is taken off argv before the parser sees it. Without it
// the simple parser runs, and the choice it reads becomes engine parameters
// through the same function the lab uses (simpleParams).
const argvIn = process.argv.slice(2)
const advanced = argvIn.includes('--advanced')
const simple = advanced ? null : parseSimpleArgs(argvIn)
const parsed = advanced ? parseArgs(argvIn.filter((a) => a !== '--advanced')) : simple
const { view, rest } = parsed
// Mode flags (not engine parameters) — read from what is left after the parser.
const arg = (k, dflt) => {
  const hit = rest.find((a) => a.startsWith(`--${k}=`))
  return hit ? Number(hit.split('=')[1]) : dflt
}
const has = (flag) => rest.includes(`--${flag}`)

if (has('help') || rest.includes('-h')) {
  console.log(helpText({ advanced }))
  process.exit(0)
}

// --- the safe envelope ------------------------------------------------------
// The parser only parses; here the parsed parameters meet the ranges and the
// cross-knob rules of the engine. A violation ends the run before any board
// is generated: --dry-run answers on stdout in JSON (scripts read it), every
// other mode explains on stderr. Exit code 2 = bad input, 1 = a board that
// did not close.
const dryRun = has('dry-run')
function refuse(error, items, format) {
  if (dryRun) {
    console.log(JSON.stringify({ ok: false, error, [format ? 'violations' : 'errors']: items }))
  } else {
    console.error(`${error}:`)
    for (const it of items) console.error(`  - ${format ? format(it) : it}`)
    console.error(format ? 'see --help for the allowed ranges' : 'see --help')
  }
  process.exit(2)
}
// Simple mode: the flags themselves can be wrong (a missing size, a slider
// outside 0..1, an advanced flag without --advanced). Checked before any
// knob exists. --randomized draws like the lab: Math.random, not reproducible;
// the meta keeps the full command, which is.
if (simple?.errors.length) refuse('invalid arguments', simple.errors)
const params = advanced ? parsed.params : simpleParams(simple.choice, simple.choice.random ? Math.random : null)
const simpleCommand = advanced ? null : buildSimpleCommand(simple.choice, view)
function refuseInvalid(params) {
  const violations = validateParams(params)
  if (violations.length) refuse('invalid parameters', violations, formatViolation)
}
refuseInvalid(params)

// --- one board into the store (or, with --dry-run, nowhere) ----------------
// The simple mode always lands here; the advanced mode with --svg or
// --dry-run. A dry run generates, measures and renders exactly as a real run
// would, and then writes nothing: stdout carries one JSON line so that
// scripts can compare boards across runtimes without a file — the
// fingerprint is the same one the engine tests freeze recorded boards with.
const svgFlag = rest.find((a) => a === '--svg' || a.startsWith('--svg='))
if (!advanced || svgFlag || dryRun) {
  const svgOut = svgFlag?.includes('=') ? svgFlag.slice('--svg='.length) : null
  const result = generate({ ...params, trace, debug })
  if (!result.ok) {
    if (dryRun) console.log(JSON.stringify({ dryRun: true, W: params.W, H: params.H, seed: params.seed, id: boardId(params), ok: false, stuck: result.stuck, restarts: result.restartsUsed, genMs: result.genMs }))
    console.error(`failed to close board ${params.W}x${params.H} (seed ${params.seed}): ${result.stuck.remaining} cells left, ${result.stuck.heads ?? '?'} legal heads at the best moment`)
    process.exit(1)
  }
  const c = result.board, m = result.metrics, W = params.W, H = params.H
  const svg = toSvg(c, { cell: view.cell, colored: view.colored, strokeRatio: view.stroke, headWidth: view.headWidth, headHeight: view.headHeight, top: view.top })
  // The full command reproduces the board in every case; the simple command
  // (simple mode only) records what was asked for.
  const commands = { command: buildCommand(params, view), ...(simpleCommand ? { simpleCommand } : null) }
  if (dryRun) {
    console.log(JSON.stringify({
      dryRun: true, W, H, seed: params.seed, id: boardId(params), params, view, ...commands,
      ok: true, pieces: m.N, avgLen: +(W * H / m.N).toFixed(2), maxLen: m.maxLen, bends: +m.bends.toFixed(3),
      coiling: +m.coil.toFixed(3), f0: +m.f0.toFixed(4), solvable: m.solvable,
      backtracks: result.backtracks, restarts: result.restartsUsed, genMs: Math.round(result.genMs),
      metricsMs: Math.round(result.metricsMs), svgBytes: Buffer.byteLength(svg), fingerprint: fingerprint(c),
    }))
    process.exit(0)
  }
  const meta = saveBoard({
    svg, params, view, ...commands, source: 'cli',
    metrics: { ok: result.ok, pieces: c.pieces.length, maxLen: m.maxLen, genMs: result.genMs },
  })
  if (svgOut) writeFileSync(svgOut, svg)
  if (view.top > 0) {
    // Longest-piece stats: the span (how many columns and rows it crosses)
    // tells whether a piece crosses the board or coils in one region.
    const longest = [...c.pieces].sort((a, b) => b.cells.length - a.cells.length).slice(0, view.top)
    console.log(`  ${view.top} longest pieces:`)
    for (const pc of longest) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      const cols = new Set(), rows = new Set()
      for (const q of pc.cells) {
        if (q.x < minX) minX = q.x
        if (q.x > maxX) maxX = q.x
        if (q.y < minY) minY = q.y
        if (q.y > maxY) maxY = q.y
        cols.add(q.x); rows.add(q.y)
      }
      const spanX = maxX - minX + 1, spanY = maxY - minY + 1
      const own = new Set(pc.cells.map((q) => q.y * W + q.x))
      let coiled = 0, bends = 0, prev = null
      for (let i = 0; i < pc.cells.length; i++) {
        const q = pc.cells[i]
        let n = 0
        for (const { dx, dy } of DIRS) {
          const ax = q.x + dx, ay = q.y + dy
          if (ax >= 0 && ay >= 0 && ax < W && ay < H && own.has(ay * W + ax)) n++
        }
        if (n >= 3) coiled++
        if (i > 0) {
          const dx = q.x - pc.cells[i - 1].x, dy = q.y - pc.cells[i - 1].y
          if (prev && (dx !== prev.dx || dy !== prev.dy)) bends++
          prev = { dx, dy }
        }
      }
      // Stretch: what fraction of its bounding rectangle the piece fills.
      const fill = pc.cells.length / (spanX * spanY)
      console.log(`    len ${String(pc.cells.length).padStart(4)}  bbox ${String(spanX).padStart(3)}x${String(spanY).padStart(3)} (${(100 * spanX / W).toFixed(0)}% x ${(100 * spanY / H).toFixed(0)}% of board)  cols ${String(cols.size).padStart(3)}  rows ${String(rows.size).padStart(3)}  bbox density ${(100 * fill).toFixed(0)}%  bends ${bends}  coiling ${(100 * coiled / pc.cells.length).toFixed(0)}%`)
    }
  }
  console.log(`${meta.W}x${meta.H}/${meta.id}.svg${svgOut ? '  + ' + svgOut : ''}  pieces=${m.N} avgLen=${(W * H / m.N).toFixed(1)} maxLen=${m.maxLen} bends=${m.bends.toFixed(2)} coiling=${(100 * m.coil).toFixed(0)}% backtracks=${result.backtracks} restarts=${result.restartsUsed} ${(result.genMs / 1000).toFixed(2)} s`)
  process.exit(0)
}

// --- levels for the report and benchmark modes -----------------------------
// Two independent knobs: level (base size) and format (1:1 or 1:2).
// The portrait format matches a phone screen and the reference screenshot.
// Insane is the project ceiling: a million cells, ~10 s per run. It exists
// only as a square (the third field), like the game's Insane level — a
// 1000×2000 portrait would double the time for no new information.
const BASE = [['Easy', 25], ['Medium', 50], ['Hard', 75], ['Nightmare', 100], ['Extreme', 200], ['Insane', 1000, 'square']]
// Intermediate scale — for finding the limit of closability.
const midArg = arg('mid', 0)
if (midArg) BASE.push(['Mid', midArg])
const FORMATS = has('square') ? [['', 1]] : has('portrait') ? [['', 2]] : [['·sq', 1], ['·pt', 2]]
const only = rest.find((a) => a.startsWith('--only='))?.split('=')[1]
const presets = BASE.flatMap(([name, n, squareOnly]) =>
  FORMATS.filter(([, r]) => !squareOnly || r === 1).map(([sfx, r]) => ({ name: name + sfx, W: n, H: n * r })))
  .filter((pre) => !only || pre.name.toLowerCase() === only.toLowerCase())
// The shared knobs passed the check above; the level sizes still have to
// (only --mid can put one outside 4..1000). Checked before the first run.
for (const pre of presets) refuseInvalid({ ...params, W: pre.W, H: pre.H })

const runs = arg('runs', 3)
const show = has('show')
const bench = arg('bench', 0)
if (bench > 0) {
  console.log(`BENCHMARK — ${bench} runs per level\n`)
  for (const pre of presets) {
    const times = [], backs = [], lens = [], maxLens = []
    let fails = 0, restartsTotal = 0
    for (let r = 0; r < bench; r++) {
      const run = { ...params, W: pre.W, H: pre.H, trace, debug }
      const t0 = performance.now()
      const seed = 50000 + r
      let c = new Carver(pre.W, pre.H, run,mulberry32(seed))
      let ok = c.run(), rs = 0
      while (!ok && rs < 5) { rs++; c = new Carver(pre.W, pre.H, run,mulberry32(seed + 999983 * rs)); ok = c.run() }
      const dt = performance.now() - t0
      if (!ok) { fails++; continue }
      times.push(dt); backs.push(c.backtracks); restartsTotal += rs
      lens.push(c.pieces.reduce((a, x) => a + x.cells.length, 0) / c.pieces.length)
      maxLens.push(Math.max(...c.pieces.map((x) => x.cells.length)))
    }
    times.sort((a, b) => a - b); backs.sort((a, b) => a - b)
    const q = (arr, pp) => arr[Math.min(arr.length - 1, Math.floor(arr.length * pp))]
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
    console.log(`--- ${pre.name} ${pre.W}x${pre.H} ---`)
    console.log(`  time [ms]   p50 ${q(times,0.5).toFixed(0)}   p90 ${q(times,0.9).toFixed(0)}   p99 ${q(times,0.99).toFixed(0)}   max ${times[times.length-1].toFixed(0)}`)
    console.log(`  backtracks  p50 ${q(backs,0.5)}   p90 ${q(backs,0.9)}   p99 ${q(backs,0.99)}   max ${backs[backs.length-1]}`)
    console.log(`  length      mean ${mean(lens).toFixed(2)}   maximum (mean) ${mean(maxLens).toFixed(0)}`)
    console.log(`  robustness  restarts ${restartsTotal}   failures ${fails}/${bench}\n`)
  }
  process.exit(0)
}
console.log('PROTOTYPE — carving from a full board, minimum length 2\n')
for (const pre of presets) {
  const acc = []
  for (let r = 0; r < runs; r++) {
    const seed = 1000 + r
    const rng = mulberry32(seed)
    const run = { ...params, W: pre.W, H: pre.H, trace, debug }
    const t0 = performance.now()
    let c = new Carver(pre.W, pre.H, run,rng)
    let ok = c.run()
    let restarts = 0
    while (!ok && restarts < 3) {
      restarts++
      c = new Carver(pre.W, pre.H, run,mulberry32(seed + 7777 * restarts))
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
      console.log(`  STUCK         at the best moment ${c.stuckRemaining ?? c.remaining} cells remained in ${sizes.length} fragments; largest ${sizes[0]}`)
      console.log(`                legal heads at that moment: ${c.stuckHeads ?? '?'} (out of ${2 * (c.W + c.H)} possible)`)
      console.log(`                sizes: singletons ${hist['1']}, 2-5: ${hist['2-5']}, 6-20: ${hist['6-20']}, 21-100: ${hist['21-100']}, 100+: ${hist['100+']}`)
      acc.push({ failed: true, restarts, remaining: c.remaining }); continue
    }
    const t1 = performance.now()
    const m = analyse(c, run.ruleB)
    const tAna = performance.now() - t1
    acc.push({ ...m, tGen, tAna, backtracks: c.backtracks, restarts, st: c.stats })
    if (show && r === 0 && pre.W <= 40) console.log(render(c) + '\n')
  }
  const good = acc.filter((a) => !a.failed)
  const avg = (f) => good.reduce((s, a) => s + f(a), 0) / good.length
  console.log(`--- ${pre.name} ${pre.W}x${pre.H} (${runs} runs) ---`)
  if (!good.length) { console.log('  FAILED to close the board\n'); continue }
  console.log(`  coverage      ${(avg((a) => a.coverage) * 100).toFixed(2)}%   solvable: ${good.every((a) => a.solvable) ? 'YES' : 'NO'}`)
  console.log(`  pieces        ${avg((a) => a.N).toFixed(0)}   length ${avg((a) => a.minLen).toFixed(0)}..${avg((a) => a.maxLen).toFixed(0)}`)
  const h = good[0].hist
  console.log(`  length dist.  2-6: ${(avg((a) => a.hist['2-6'] / a.N) * 100).toFixed(0)}%  7-15: ${(avg((a) => a.hist['7-15'] / a.N) * 100).toFixed(0)}%  16-49: ${(avg((a) => a.hist['16-49'] / a.N) * 100).toFixed(0)}%  50+: ${(avg((a) => a.hist['50+'] / a.N) * 100).toFixed(1)}%`)
  console.log(`  f0            ${avg((a) => a.f0).toFixed(3)}   T2: ${avg((a) => a.T2).toFixed(0)}   1-blocker: ${avg((a) => a.almost).toFixed(0)} (${(100*avg((a)=>a.almost/a.N)).toFixed(0)}%)   D: ${avg((a) => a.D).toFixed(0)}   corridor: ${avg((a) => a.meanCorridorLen).toFixed(1)}`)
  console.log(`  SHAPE         bends/piece ${avg((a) => a.bends).toFixed(2)}   multi-line ${(100 * avg((a) => a.multiLine)).toFixed(0)}%   coiling ${(100 * avg((a) => a.coil)).toFixed(0)}%`)
  console.log(`  REACH         mean ${(100 * avg((a) => a.span)).toFixed(0)}% of side   top 10%: ${(100 * avg((a) => a.spanTop10)).toFixed(0)}%   record ${(100 * avg((a) => a.spanMax)).toFixed(0)}%`)
  console.log(`  UNBLOCKING    mean ${avg((a) => a.outDeg).toFixed(1)} pieces/removal   record ${avg((a) => a.maxOut).toFixed(0)}   mean distance ${(100 * avg((a) => a.blockDist)).toFixed(0)}% of perimeter`)
  console.log(`  WRAPPING      bends/cell ${avg((a) => a.bendsPerCell).toFixed(3)}   own neighbours/cell ${avg((a) => a.selfAdj).toFixed(2)}   foreign neighbours/piece ${avg((a) => a.neighbours).toFixed(1)}   longest shared border ${(100 * avg((a) => a.sharedBorder)).toFixed(0)}% of length`)
  console.log(`  backtracks    ${avg((a) => a.backtracks).toFixed(1)}   restarts: ${avg((a) => a.restarts).toFixed(1)}`)
  const st = good[0].st
  console.log(`  diagnostics   mean want ${(st.want/st.n).toFixed(1)} -> got ${(st.got/st.n).toFixed(1)}   stall ${(100*st.stall/st.n).toFixed(0)}%   strand-trunc ${(100*st.strandTrunc/st.n).toFixed(0)}% (mean -${(st.strandLoss/Math.max(1,st.strandTrunc)).toFixed(1)})`)
  console.log(`  time          generation ${avg((a) => a.tGen).toFixed(0)} ms, metrics ${avg((a) => a.tAna).toFixed(0)} ms\n`)
}
