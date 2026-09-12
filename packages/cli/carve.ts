// THROWAWAY PROTOTYPE — CLI layer over the engine in engine.ts.
// Run: deno task carve --width=N --height=N [options] [mode]
//
// One mode. The everyday flags of the simple lab view — a size, the sliders
// --length and --winding in 0..1, --skeleton, --seed, the picture (--colored,
// --line, --arrow-width, --arrow-height) and --randomized — stand beside
// every engine knob, each spelled as its PARAM_SPEC key in lower case. An
// everyday flag sets a whole bundle of knobs; a knob written on the command
// line is PINNED: the bundle is drawn first and the pin is written over it,
// so a pin changes only the knob it names. Each pin is named once per run on
// stderr, because --dry-run owns stdout.
//
// Always one board file → packages/cli/boards/ (+ an SVG preview with --svg,
// + a copy with --svg=path), or with --dry-run one JSON line and nothing
// written. Modes:
//   --svg[=path]    an SVG preview in the store as well (+ a copy at path)
//   --dry-run       one board, nothing written: one JSON line on stdout with
//                   the id, metrics, the pinned knobs and the fingerprint
//   --count=N       N closed boards on the seeds from --seed up, skipping any
//                   that does not close; --max-seeds=M gives up after M seeds
//                   (default 2·N); exit 1 when it gives up
//   --help, -h      usage; --help=knobs adds the table of every knob
// A retired spelling (--advanced, --board, --straight, --w) and an unknown
// flag are refused by name with exit code 2, and so are parameters outside
// the safe envelope (validateParams), before any generation. A board that
// does not close is stored too (its preview draws the holes), and the exit
// code is 1; CARVE_TIMEOUT_S=N aborts a run after N seconds and stores what
// was carved.
import type { BoardMeta, GenerateOptions, ParamKey, Params, TraceInfo, Violation } from '@arrowz/engine'
import {
  DIRS,
  encodeBoard,
  fingerprint,
  formatViolation,
  generate,
  GenerateAbort,
  toSvg,
  validateParams,
} from '@arrowz/engine'
import { boardId, buildCommand, helpText, knobFlag, parseArgs, svgOptions } from '@arrowz/engine/command'
import { BUNDLES, simpleParams } from '@arrowz/engine/simple'
import { saveBoard } from './store.ts'

// The CLI is a program, not a module: nothing imports it (the tests spawn it).
if (!import.meta.main) throw new Error('carve.ts is the CLI entry point; import command.ts or the engine instead')

// Trace and debug enter the engine as functions — the engine knows no `Deno`.
// Left undefined (not null) so they fit the optional hooks of GenerateOptions.
// CARVE_TIMEOUT_S is a wall-clock budget for measurements: the engine calls
// the trace at least once a second, and past the deadline the callback
// aborts the run; the board carved so far still goes to the store.
const timeoutEnv = Deno.env.get('CARVE_TIMEOUT_S')
const timeoutS = timeoutEnv === undefined ? null : Number(timeoutEnv)
if (timeoutS !== null && !(timeoutS >= 0)) {
  console.error(`invalid CARVE_TIMEOUT_S: ${timeoutEnv} is not a number of seconds`)
  Deno.exit(2)
}
let deadline = Infinity
/** Starts the CARVE_TIMEOUT_S budget afresh: once for the run, and once per seed of a batch. */
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
/** The hooks as generate() takes them, beside the knobs: only the ones that are on. */
const hooks: Pick<GenerateOptions, 'trace' | 'debug'> = { ...(trace ? { trace } : {}), ...(debug ? { debug } : {}) }

// One parser reads every flag. It is pure — it hands back the everyday
// choice, the knobs the command line pinned and the view, and leaves the
// drawing to us — so a batch can redraw for each seed and keep the same pins.
const parsed = parseArgs(Deno.args)
const view = parsed.view
const rest = parsed.rest
// Mode flags (not engine parameters) — read from what is left after the
// parser. Every reader marks what it took, so an entry nobody took is caught
// below rather than ignored: --dry-run=1 is not --dry-run, and --count
// without a value is not --count=N.
const used = new Set<string>()
const has = (flag: string): boolean => {
  const hit = rest.includes(`--${flag}`)
  if (hit) used.add(`--${flag}`)
  return hit
}

// --- the safe envelope ------------------------------------------------------
// The parser only parses; here the parsed parameters meet the ranges and the
// cross-knob rules of the engine. A violation ends the run before any board
// is generated: --dry-run answers on stdout in JSON (scripts read it), every
// other mode explains on stderr. Exit code 2 = bad input, 1 = a board that
// did not close.
const dryRun = has('dry-run')
function refuseErrors(error: string, items: readonly string[]): never {
  if (dryRun) {
    console.log(JSON.stringify({ ok: false, error, errors: items }))
  } else {
    console.error(`${error}:`)
    for (const it of items) console.error(`  - ${it}`)
    console.error('see --help')
  }
  Deno.exit(2)
}
function refuseViolations(items: readonly Violation[]): never {
  const error = 'invalid parameters'
  if (dryRun) {
    console.log(JSON.stringify({ ok: false, error, violations: items }))
  } else {
    console.error(`${error}:`)
    for (const it of items) console.error(`  - ${formatViolation(it)}`)
    console.error('see --help for the allowed ranges')
  }
  Deno.exit(2)
}

// --help wins over a bad flag: it is what a user reaches for to fix one. Its
// only values are --help and --help=knobs; an unknown value of this known
// flag is refused by name, the same as an unknown flag is.
const helpFlag = rest.find((a) => a === '--help' || a === '-h' || a.startsWith('--help='))
if (helpFlag !== undefined) {
  used.add(helpFlag)
  if (helpFlag !== '--help' && helpFlag !== '-h' && helpFlag !== '--help=knobs') {
    refuseErrors('invalid arguments', [`${helpFlag} is not --help or --help=knobs`])
  }
  console.log(helpText({ knobs: helpFlag === '--help=knobs' }))
  Deno.exit(0)
}

// The flags themselves can be wrong (a missing size, a slider outside 0..1, a
// retired spelling, an unknown flag). Checked before any knob exists.
if (parsed.errors.length) refuseErrors('invalid arguments', parsed.errors)

// --- the modes: --svg[=path], --count=N [--max-seeds=M] ---------------------
// Read before any knob, so that a mode flag the CLI cannot honour is refused
// before a board is made. A batch gives N closed boards on the seeds from
// --seed up, for a pool of boards to upload.
/** A positive integer flag, or null when it is absent; anything else is refused. */
function positiveFlag(name: string): number | null {
  const hit = rest.find((a) => a.startsWith(`--${name}=`))
  if (hit === undefined) return null
  used.add(hit)
  const n = Number(hit.slice(name.length + 3))
  if (!Number.isInteger(n) || n < 1) refuseErrors('invalid arguments', [`${hit} is not a positive integer`])
  return n
}
const count = positiveFlag('count')
const maxSeeds = positiveFlag('max-seeds')
const svgFlag = rest.find((a) => a === '--svg' || a.startsWith('--svg='))
if (svgFlag !== undefined) used.add(svgFlag)
const writesBoards = !dryRun
if (maxSeeds !== null && count === null) refuseErrors('invalid arguments', ['--max-seeds needs --count'])
if (count !== null && !writesBoards) {
  refuseErrors('invalid arguments', ['--count needs a mode that writes boards, and --dry-run writes none'])
}
if (count !== null && svgFlag?.startsWith('--svg=')) {
  refuseErrors('invalid arguments', ['--svg=path names one file; with --count use --svg'])
}

/** Mode flags that are switches, and mode flags that need a value: both spellings are refused by name. */
const VALUELESS_MODES = new Set(['--dry-run', '--help'])
const VALUED_MODES = new Set(['--count', '--max-seeds'])
/** Why a mode flag no reader took is refused. */
function unreadReason(arg: string): string {
  const eq = arg.indexOf('=')
  const name = eq < 0 ? arg : arg.slice(0, eq)
  if (eq >= 0 && VALUELESS_MODES.has(name)) return `${arg} takes no value`
  if (eq < 0 && VALUED_MODES.has(name)) return `${arg} needs a value`
  return `${arg} is read by no mode; see --help`
}
// A mode flag the readers above did not take is input nobody acts on:
// --dry-run=1 used to write a board because carve.ts matches --dry-run
// exactly, and --count alone was dropped on the floor.
const unread = rest.filter((a) => !used.has(a))
if (unread.length) refuseErrors('invalid arguments', unread.map(unreadReason))

// The pins, by the value the parser read for each. --randomized draws like
// the lab: Math.random, not reproducible; the meta keeps the command, which
// is. The pins go on top of the draw, so every knob nobody named keeps the
// value it would have had without them.
const pinned: Partial<Record<ParamKey, number>> = {}
// Reading a pin back out of parsed.params (rather than off the flag itself)
// is correct only because the clamp below never moves a pinned value once
// simpleParams has written it; a clamp that could would silently re-pin the
// moved value here.
for (const key of parsed.pins) pinned[key] = parsed.params[key]
const params = simpleParams(parsed.choice, parsed.choice.random ? Math.random : null, pinned)
function refuseInvalid(p: Params): void {
  const violations = validateParams(p)
  if (violations.length) refuseViolations(violations)
}
refuseInvalid(params)

/** Which everyday flag's bundle a knob belongs to, or null when no flag sets it. */
type BundleKey = keyof typeof BUNDLES
const BUNDLE_KEYS: readonly BundleKey[] = ['length', 'winding', 'skeleton', 'difficulty']
function bundleOf(key: ParamKey): BundleKey | null {
  for (const name of BUNDLE_KEYS) if (BUNDLES[name].includes(key)) return name
  return null
}
/** How the note names whatever still sets the rest of a bundle. */
function bundleFlag(bundle: BundleKey): string {
  return bundle === 'difficulty' ? 'the difficulty baseline' : `--${bundle}`
}
/** The flags this run was given, by name: a value is not part of the name. */
const givenFlags = new Set(Deno.args.map((a) => {
  const eq = a.indexOf('=')
  return eq < 0 ? a : a.slice(0, eq)
}))
/**
 * Whether what still sets the rest of a bundle is here to be named: the
 * difficulty baseline always is, an everyday flag only when it was given. The
 * note used to promise that "--skeleton still sets giants, ..." on a command
 * line with no --skeleton on it.
 */
function bundleNamed(bundle: BundleKey): boolean {
  return bundle === 'difficulty' || givenFlags.has(`--${bundle}`)
}

// One line per pinned knob, on stderr: --dry-run owns stdout. Printed once
// for the whole run rather than once per seed, so a batch stays readable and
// the JSON of a dry run still parses.
for (const key of parsed.pins) {
  // --start writes two knobs with one flag, so it is named once, at the first.
  if (key === 'mix') continue
  const bundle = bundleOf(key)
  const partners = (bundle ? BUNDLES[bundle] : []).filter((k) => k !== key && !parsed.pins.includes(k))
  const tail = bundle && partners.length && bundleNamed(bundle)
    ? `; ${bundleFlag(bundle)} still sets ${partners.join(', ')}`
    : ''
  console.error(`note: ${knobFlag(params, key)} is pinned${tail}`)
}

// --- a batch: --count=N [--max-seeds=M] ------------------------------------
// The flags themselves were read and refused above; what is left needs the
// knobs, because the last seed of the batch has to be one the engine accepts.
const seedLimit = count === null ? 0 : maxSeeds ?? 2 * count
// The last seed the batch may reach has to be a seed the engine accepts.
if (count !== null) refuseInvalid({ ...params, seed: params.seed + seedLimit - 1 })

/** The parameters of one seed: --randomized draws them anew for each, over the same pins. */
function forSeed(seed: number): Params {
  const choice = { ...parsed.choice, seed }
  return simpleParams(choice, choice.random ? Math.random : null, pinned)
}

// --- one board into the store (or, with --dry-run, nowhere) ----------------
// Every run lands here, because making a board is what the CLI does. The
// store gets the board file and its meta, and an SVG preview
// only with --svg. A dry run generates, measures and encodes exactly as a real
// run would, draws no SVG (the board file is what gets stored; boardBytes is
// its size), and writes nothing: stdout carries one JSON line so that
// scripts can compare boards across runtimes without a file — the
// fingerprint is the same one the engine tests freeze recorded boards with.

/** What one stored board left on disk, as the report line names it. */
function storedNames(meta: BoardMeta, svgOut: string | null): string {
  const base = `${meta.W}x${meta.H}/${meta.id}`
  return `${base}.board.json${meta.svg ? `  + ${base}.svg` : ''}${svgOut ? `  + ${svgOut}` : ''}`
}

const svgOut = svgFlag?.includes('=') ? svgFlag.slice('--svg='.length) : null
if (count !== null) {
  let written = 0, tried = 0
  const skipped: number[] = []
  for (let seed = params.seed; written < count && tried < seedLimit; seed++) {
    tried++
    const seedParams = forSeed(seed)
    armDeadline()
    const result = generate(seedParams, hooks)
    if (!result.ok) {
      skipped.push(seed)
      console.error(`seed ${seed}: not closed (${result.stuck?.remaining ?? '?'} cells left), skipped`)
      continue
    }
    const m = result.metrics
    if (!m) throw new Error('unreachable: ok without metrics')
    const svg = svgFlag ? toSvg(result.board, svgOptions(view)) : undefined
    const meta = saveBoard({
      board: encodeBoard(result.board),
      ...(svg !== undefined ? { svg } : {}),
      params: seedParams,
      view,
      command: buildCommand(seedParams, view),
      source: 'cli',
      metrics: { ok: true, pieces: result.board.pieces.length, maxLen: m.maxLen, genMs: result.genMs },
    })
    written++
    console.log(`${storedNames(meta, null)}  pieces=${m.N} maxLen=${m.maxLen} ${(result.genMs / 1000).toFixed(2)} s`)
  }
  const notClosed = skipped.length ? `, not closed: ${skipped.join(' ')}` : ''
  console.log(`batch: ${written}/${count} boards written, ${tried} seeds tried${notClosed}`)
  Deno.exit(written === count ? 0 : 1)
}
const result = generate(params, hooks)
const c = result.board, W = params.W, H = params.H
const svgView = svgOptions(view)
const file = encodeBoard(c)
const boardBytes = new TextEncoder().encode(JSON.stringify(file)).byteLength
// One dialect, one command, and it reproduces the board in every case —
// after --randomized too, because it carries the knobs that were drawn.
const command = buildCommand(params, view)
if (!result.ok) {
  // A board that did not close (a jam, or the time budget) is stored like a
  // closed one, so that the lab can show what the generator left behind;
  // its preview draws the free cells as holes, and the "not closed" badge
  // comes from ok:false.
  const { stuck, aborted } = result
  if (!stuck) throw new Error('unreachable: not ok without stuck')
  if (dryRun) {
    console.log(
      JSON.stringify({
        dryRun: true,
        W,
        H,
        seed: params.seed,
        id: boardId(params),
        ok: false,
        aborted,
        stuck,
        pinned: parsed.pins,
        restarts: result.restartsUsed,
        backtracks: result.backtracks,
        genMs: result.genMs,
        boardBytes,
      }),
    )
  }
  console.error(
    aborted
      ? `aborted after ${
        (result.genMs / 1000).toFixed(1)
      } s: board ${W}x${H} (seed ${params.seed}) has ${stuck.remaining} cells left`
      : `failed to close board ${W}x${H} (seed ${params.seed}): ${stuck.remaining} cells left, ${
        stuck.heads ?? '?'
      } legal heads at the best moment`,
  )
  if (!dryRun) {
    const svg = svgFlag ? toSvg(c, { ...svgView, voids: true }) : undefined
    const meta = saveBoard({
      board: file,
      ...(svg !== undefined ? { svg } : {}),
      params,
      view,
      command,
      source: 'cli',
      metrics: {
        ok: false,
        pieces: c.pieces.length,
        ...(result.metrics ? { maxLen: result.metrics.maxLen } : {}),
        genMs: result.genMs,
        restarts: result.restartsUsed,
        backtracks: result.backtracks,
        aborted,
        stuck,
      },
    })
    if (svgOut && svg !== undefined) Deno.writeTextFileSync(svgOut, svg)
    console.log(
      `${
        storedNames(meta, svgOut)
      }  not closed: ${stuck.remaining} cells left in ${stuck.sizes.length} fragments, pieces=${meta.pieces} restarts=${result.restartsUsed} backtracks=${result.backtracks} ${
        (result.genMs / 1000).toFixed(2)
      } s`,
    )
  }
  Deno.exit(1)
}
const m = result.metrics
if (!m) throw new Error('unreachable: ok without metrics')
if (dryRun) {
  console.log(JSON.stringify({
    dryRun: true,
    W,
    H,
    seed: params.seed,
    id: boardId(params),
    params,
    pinned: parsed.pins,
    view,
    command,
    ok: true,
    pieces: m.N,
    avgLen: +(W * H / m.N).toFixed(2),
    maxLen: m.maxLen,
    bends: +m.bends.toFixed(3),
    coiling: +m.coil.toFixed(3),
    f0: +m.f0.toFixed(4),
    solvable: m.solvable,
    backtracks: result.backtracks,
    restarts: result.restartsUsed,
    genMs: Math.round(result.genMs),
    metricsMs: Math.round(result.metricsMs),
    boardBytes,
    fingerprint: fingerprint(c),
  }))
  Deno.exit(0)
}
const svg = svgFlag ? toSvg(c, svgView) : undefined
const meta = saveBoard({
  board: file,
  ...(svg !== undefined ? { svg } : {}),
  params,
  view,
  command,
  source: 'cli',
  metrics: { ok: result.ok, pieces: c.pieces.length, maxLen: m.maxLen, genMs: result.genMs },
})
if (svgOut && svg !== undefined) Deno.writeTextFileSync(svgOut, svg)
if (view.top > 0) {
  // Longest-piece stats: the span (how many columns and rows it crosses)
  // tells whether a piece crosses the board or coils in one region.
  const longest = [...c.pieces].sort((a, b) => b.cells.length - a.cells.length).slice(0, view.top)
  console.log(`  ${view.top} longest pieces:`)
  for (const pc of longest) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    const cols = new Set<number>(), rows = new Set<number>()
    for (const q of pc.cells) {
      if (q.x < minX) minX = q.x
      if (q.x > maxX) maxX = q.x
      if (q.y < minY) minY = q.y
      if (q.y > maxY) maxY = q.y
      cols.add(q.x)
      rows.add(q.y)
    }
    const spanX = maxX - minX + 1, spanY = maxY - minY + 1
    const own = new Set(pc.cells.map((q) => q.y * W + q.x))
    let coiled = 0, bends = 0, prev: { dx: number; dy: number } | null = null
    for (const [i, q] of pc.cells.entries()) {
      let n = 0
      for (const { dx, dy } of DIRS) {
        const ax = q.x + dx, ay = q.y + dy
        if (ax >= 0 && ay >= 0 && ax < W && ay < H && own.has(ay * W + ax)) n++
      }
      if (n >= 3) coiled++
      const before = pc.cells[i - 1]
      if (before) {
        const dx = q.x - before.x, dy = q.y - before.y
        if (prev && (dx !== prev.dx || dy !== prev.dy)) bends++
        prev = { dx, dy }
      }
    }
    // Stretch: what fraction of its bounding rectangle the piece fills.
    const fill = pc.cells.length / (spanX * spanY)
    console.log(
      `    len ${String(pc.cells.length).padStart(4)}  bbox ${String(spanX).padStart(3)}x${
        String(spanY).padStart(3)
      } (${(100 * spanX / W).toFixed(0)}% x ${(100 * spanY / H).toFixed(0)}% of board)  cols ${
        String(cols.size).padStart(3)
      }  rows ${String(rows.size).padStart(3)}  bbox density ${(100 * fill).toFixed(0)}%  bends ${bends}  coiling ${
        (100 * coiled / pc.cells.length).toFixed(0)
      }%`,
    )
  }
}
console.log(
  `${storedNames(meta, svgOut)}  pieces=${m.N} avgLen=${(W * H / m.N).toFixed(1)} maxLen=${m.maxLen} bends=${
    m.bends.toFixed(2)
  } coiling=${(100 * m.coil).toFixed(0)}% backtracks=${result.backtracks} restarts=${result.restartsUsed} ${
    (result.genMs / 1000).toFixed(2)
  } s`,
)
Deno.exit(0)
