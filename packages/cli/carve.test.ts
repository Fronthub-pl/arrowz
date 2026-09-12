// The lab must mirror the CLI 1:1: the command from the lab has to give the
// same board as the worker. We generate through generate() and through
// carve.ts in a child process and compare the SVG byte for byte.
// --dry-run is tested the same way: the board store points at a temporary
// directory, which must stay empty.
//
// The CLI has one mode. Every run makes a board from the everyday flags, and
// a knob named on the command line is pinned: it holds while the rest of its
// bundle keeps being chosen around it.
import { assert, assertEquals, assertMatch, assertStringIncludes } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import {
  decodeBoard,
  defaultParams,
  fingerprint,
  formatViolation,
  generate,
  PARAM_SPEC,
  toSvg,
  validateParams,
} from '@arrowz/engine'
import { boardId, buildCommand, COMMAND_PREFIX, DEFAULT_VIEW, VIEW_RANGE } from '@arrowz/engine/command'
import { defaultChoice, exportCell, simpleParams, simpleRanges } from '@arrowz/engine/simple'
import type { BoardMeta, ParamKey, Params, SimpleChoice, View, ViewNumber } from '@arrowz/engine'

const here = dirname(fromFileUrl(import.meta.url))
const carve = join(here, 'carve.ts')
const tmp = () => Deno.makeTempDirSync({ prefix: 'arrowz-cli-' })
const exists = (path: string): boolean => {
  try {
    Deno.statSync(path)
    return true
  } catch {
    return false
  }
}
const entries = (dir: string): number => [...Deno.readDirSync(dir)].length
/** The JSON as written to disk; the store wrote it, so its shape is BoardMeta. */
const readMeta = (file: string): BoardMeta => JSON.parse(Deno.readTextFileSync(file)) as BoardMeta
/** The fingerprint of a stored board file, read back through the decoder. */
const storedFingerprint = (file: string): string => fingerprint(decodeBoard(JSON.parse(Deno.readTextFileSync(file))))
/** The prefix as a regular expression source: the spaces of "deno task carve" are literal. */
const prefixRe = COMMAND_PREFIX.replace(/ /g, '\\s')
/** A command text as argv: everything after the prefix. */
const argvOf = (cmd: string) => cmd.slice(COMMAND_PREFIX.length + 1).split(' ')

/** Runs carve.ts with the board store pointed at boardsDir. */
function runCarve(argv: readonly string[], boardsDir: string, env: Record<string, string> = {}) {
  const r = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-read', '--allow-write', '--allow-env', carve, ...argv],
    cwd: dirname(here),
    env: { ARROWZ_BOARDS_DIR: boardsDir, ...env },
    stdout: 'piped',
    stderr: 'piped',
  }).outputSync()
  return { status: r.code, stdout: new TextDecoder().decode(r.stdout), stderr: new TextDecoder().decode(r.stderr) }
}

/** What --dry-run prints, and what a refusal prints in its place. */
interface DryLine {
  dryRun?: boolean
  ok: boolean
  W?: number
  H?: number
  seed?: number
  id?: string
  params?: Params
  view?: View
  command?: string
  /** The knob keys the command line pinned, in the order they appeared. */
  pinned?: ParamKey[]
  pieces?: number
  maxLen?: number
  genMs?: number
  fingerprint?: string
  boardBytes?: number
  aborted?: boolean
  stuck?: { remaining: number; sizes: number[]; heads: number | null }
  restarts?: number
  backtracks?: number
  error?: string
  errors?: string[]
  violations?: unknown[]
}

/** Runs carve.ts with the board store pointed at <dir>/boards and parses the JSON line. */
function dryRun(args: readonly string[], dir: string, env: Record<string, string> = {}) {
  const r = runCarve(args, join(dir, 'boards'), env)
  const line = r.stdout.split('\n').find((l) => l.startsWith('{'))
  // The line was printed by the CLI under test: the sanctioned narrowing at an I/O boundary.
  const json = line ? (JSON.parse(line) as DryLine) : null
  return { ...r, json }
}

Deno.test('carve.ts --svg reproduces the generate() board byte for byte', () => {
  const dir = tmp()
  const params = { ...defaultParams(), W: 25, H: 50, seed: 7, anticoil: 3, giants: 2 }
  const view = { cell: 10, stroke: 0.5, colored: true, top: 3 }
  const expected = toSvg(generate(params).board, { cell: 10, colored: true, strokeRatio: 0.5, top: 3 })

  const cmd = buildCommand(params, view)
  const r = runCarve([...argvOf(cmd), '--svg'], dir)
  assertEquals(r.status, 0, r.stderr)
  const id = boardId(params)
  assertMatch(r.stdout, new RegExp(`25x50/${id}\\.board\\.json {2}\\+ 25x50/${id}\\.svg`))
  assertEquals(Deno.readTextFileSync(join(dir, '25x50', `${id}.svg`)), expected)
  assertEquals(storedFingerprint(join(dir, '25x50', `${id}.board.json`)), fingerprint(generate(params).board))
  const meta = readMeta(join(dir, '25x50', `${id}.json`))
  assertEquals(meta.command, cmd)
  assertEquals(meta.svg, true)
  assertEquals(meta.source, 'cli')
  assertEquals('simpleCommand' in meta, false, 'there is one dialect, so one command')
})

Deno.test('carve.ts writes the board file and the meta, and no SVG unless asked', () => {
  const dir = tmp()
  const r = runCarve(['--width=10', '--height=10', '--seed=3'], dir)
  assertEquals(r.status, 0, r.stderr)
  const params = simpleParams({ ...defaultChoice(), W: 10, H: 10, seed: 3 })
  const id = boardId(params)
  assertMatch(r.stdout, new RegExp(`^10x10/${id}\\.board\\.json {2}pieces=`))
  assertEquals(storedFingerprint(join(dir, '10x10', `${id}.board.json`)), fingerprint(generate(params).board))
  assertEquals(exists(join(dir, '10x10', `${id}.svg`)), false)
  assertEquals(readMeta(join(dir, '10x10', `${id}.json`)).svg, false)
})

Deno.test('carve.ts --svg=path also writes a copy at the path', () => {
  const dir = tmp()
  const copy = join(dir, 'copy.svg')
  const r = runCarve([`--svg=${copy}`, '--width=10', '--height=10', '--seed=3'], dir)
  assertEquals(r.status, 0, r.stderr)
  const id = boardId(simpleParams({ ...defaultChoice(), W: 10, H: 10, seed: 3 }))
  assertEquals(Deno.readTextFileSync(copy), Deno.readTextFileSync(join(dir, '10x10', `${id}.svg`)))
})

// A view flag has to reach the drawing, not only the command text and the
// meta. --sharp was parsed, printed and stored while the SVG on disk stayed
// round, because the CLI named the fields of its SvgOptions by hand and did
// not name this one. So this test asserts on the written characters: a
// comparison against a toSvg call that names the same fields is a mirror and
// agrees with itself whatever the CLI does.
Deno.test('carve.ts --sharp writes a sharp SVG, and without it a round one', () => {
  const dir = tmp()
  const store = join(dir, 'store')
  const sharpPath = join(dir, 'sharp.svg')
  const roundPath = join(dir, 'round.svg')
  const sharp = runCarve(['--width=10', '--height=10', '--seed=3', '--sharp', `--svg=${sharpPath}`], store)
  assertEquals(sharp.status, 0, sharp.stderr)
  const round = runCarve(['--width=10', '--height=10', '--seed=3', `--svg=${roundPath}`], store)
  assertEquals(round.status, 0, round.stderr)

  const sharpSvg = Deno.readTextFileSync(sharpPath)
  assertStringIncludes(sharpSvg, 'stroke-linejoin="miter"')
  assert(!sharpSvg.includes('<circle'), 'a sharp board squares its tails off')

  const roundSvg = Deno.readTextFileSync(roundPath)
  assertStringIncludes(roundSvg, 'stroke-linejoin="round"')
  assertStringIncludes(roundSvg, '<circle')
})

// --- --dry-run ---------------------------------------------------------------

Deno.test('carve.ts --dry-run computes the board, writes nothing and prints one JSON line', () => {
  const dir = tmp()
  const out = join(dir, 'out.svg')
  const r = dryRun(['--dry-run', '--svg=' + out, '--width=10', '--height=10', '--seed=1'], dir)
  assertEquals(r.status, 0, r.stderr)
  assertEquals(exists(join(dir, 'boards')), false, 'the store must not be created')
  assertEquals(exists(out), false, 'the --svg=path copy must not be written')
  assertEquals(entries(dir), 0, 'nothing at all is written')
  assert(r.json, `no JSON line in:\n${r.stdout}`)
  assertEquals(r.json.dryRun, true)
  assertEquals(r.json.ok, true)
  assertEquals([r.json.W, r.json.H, r.json.seed], [10, 10, 1])
  assertEquals(r.json.id, boardId(simpleParams({ ...defaultChoice(), W: 10, H: 10, seed: 1 })))
  assertEquals(typeof r.json.pieces, 'number')
  assertEquals(typeof r.json.maxLen, 'number')
  assertEquals(typeof r.json.genMs, 'number')
  assertMatch(r.json.command ?? '', new RegExp(`^${prefixRe} --width=10 --height=10 --seed=1`))
  assertEquals(r.json.pinned, [], 'nothing was pinned')
  assertEquals(typeof r.json.boardBytes, 'number')
  // The board file is what gets stored; a dry run draws no SVG just to weigh it.
  assertEquals(Object.hasOwn(r.json, 'svgBytes'), false, 'no SVG is rendered, so none is measured')
  assertEquals(Object.hasOwn(r.json, 'simpleCommand'), false, 'there is one dialect, so one command')
})

Deno.test('carve.ts --dry-run alone selects the one-board mode and its fingerprint matches the engine', () => {
  const dir = tmp()
  const r = dryRun(['--dry-run', '--width=25', '--height=50', '--seed=7', '--start=tunnels'], dir)
  assertEquals(r.status, 0, r.stderr)
  assert(r.json, `no JSON line in:\n${r.stdout}`)
  // the same parameters through the CLI parser and through generate() directly
  const expected = generate({ ...defaultParams(), W: 25, H: 50, seed: 7, headBias: 1 })
  assertEquals(r.json.fingerprint, fingerprint(expected.board))
  assertEquals(r.json.pieces, expected.board.pieces.length)
  assertEquals(r.json.params?.headBias, 1)
  assertEquals(r.json.params?.mix, -1)
  assertEquals(r.json.pinned, ['headBias', 'mix'], 'one flag pins the two knobs behind it')
  assertEquals(entries(dir), 0, 'nothing is written')
})

// --- the overlap rule: a pin wins, and pins only itself -----------------------

Deno.test('a pinned knob holds while its bundle partners still vary', () => {
  const dir = tmp()
  const runs = [7, 8].map((seed) =>
    dryRun([
      '--width=40',
      '--height=40',
      `--seed=${seed}`,
      '--winding=0.4',
      '--randomized',
      '--pstraight=0.93',
      '--dry-run',
    ], dir)
  )
  for (const r of runs) {
    assertEquals(r.status, 0, r.stderr)
    assert(r.json?.params, `no JSON line in:\n${r.stdout}`)
    assertEquals(r.json.params.pStraight, 0.93, 'the pin holds')
    assertEquals(r.json.pinned, ['pStraight'])
    assertEquals(validateParams(r.json.params), [], 'a drawn set stays inside the envelope')
  }
  // Everything except the pin is drawn afresh, so two runs cannot match.
  const drawn = (j: DryLine) => PARAM_SPEC.filter((s) => s.key !== 'pStraight').map((s) => j.params?.[s.key]).join(',')
  assert(drawn(runs[0]?.json ?? { ok: true }) !== drawn(runs[1]?.json ?? { ok: true }), 'the rest of the bundle varies')
  assert(runs[0]?.stderr.includes('--pstraight=0.93 is pinned'), runs[0]?.stderr)
  assert(runs[0]?.stderr.includes('--winding still sets'), runs[0]?.stderr)
})

Deno.test('the note never lands on stdout, so --dry-run stays machine-readable', () => {
  const dir = tmp()
  const r = runCarve(
    ['--width=20', '--height=20', '--winding=0.4', '--pstraight=0.9', '--dry-run'],
    join(dir, 'boards'),
  )
  JSON.parse(r.stdout) // throws if the note leaked
  assertEquals(r.status, 0, r.stderr)
  assertStringIncludes(r.stderr, 'note: --pstraight=0.9 is pinned')
})

Deno.test('the note is printed once per run, not once per seed', () => {
  const dir = tmp()
  const r = runCarve(['--width=10', '--height=10', '--seed=1', '--count=3', '--restarts=4'], dir)
  assertEquals(r.status, 0, r.stderr)
  const notes = r.stderr.split('\n').filter((l) => l.startsWith('note:'))
  assertEquals(notes.length, 1, r.stderr)
  assertStringIncludes(notes[0] ?? '', '--restarts=4 is pinned')
  // A knob in no bundle has no partners to name.
  assertEquals(notes[0]?.includes(';'), false, notes[0])
})

// The tail of the note names what still sets the rest of the bundle, so it may
// only name a flag that is actually on the command line: it used to promise
// "--skeleton still sets giants, ..." on a run with no --skeleton at all.
Deno.test('the note names an everyday flag only when the run was given it', () => {
  const dir = tmp()
  const without = runCarve(['--width=10', '--height=10', '--giantstep=5', '--dry-run'], dir)
  assertEquals(without.status, 0, without.stderr)
  assertStringIncludes(without.stderr, 'note: --giantstep=5 is pinned')
  assertEquals(without.stderr.includes('--skeleton still sets'), false, without.stderr)
  const with_ = runCarve(['--width=10', '--height=10', '--skeleton', '--giantstep=5', '--dry-run'], dir)
  assertEquals(with_.status, 0, with_.stderr)
  assertStringIncludes(with_.stderr, '--skeleton still sets')
})

// --- the safe envelope --------------------------------------------------------
// Parameters outside PARAM_SPEC ranges or breaking a RULES entry are refused
// before any generation, in every mode, with exit code 2. --pstraight=0.3 is a
// range violation, --lmax=3 breaks the lmaxHole rule.

const BAD = ['--width=10', '--height=10', '--seed=1', '--pstraight=0.3', '--lmax=3']
const expectedLines = validateParams({ ...defaultParams(), pStraight: 0.3, Lmax: 3 }).map(formatViolation)

Deno.test('carve.ts --dry-run with invalid parameters: exit 2, one JSON line, nothing written', () => {
  const dir = tmp()
  const r = dryRun(['--dry-run', ...BAD], dir)
  assertEquals(r.status, 2)
  assert(r.json, `no JSON line in:\n${r.stdout}`)
  assertEquals(r.json.ok, false)
  assertEquals(r.json.error, 'invalid parameters')
  assertEquals(r.json.violations?.length, 2)
  assertEquals(r.json.violations?.[0], { kind: 'range', key: 'pStraight', value: 0.3, min: 0.6, max: 1 })
  assertEquals(r.json.violations?.[1], { kind: 'rule', key: 'lmaxHole', keys: ['Lmax'] })
  assertEquals(r.stdout.trim().split('\n').length, 1, 'exactly one line on stdout')
  assertEquals(entries(dir), 0, 'nothing is written')
})

// A share named on the command line can ask for more than the cap allows.
// The clamp then moves the partner nobody named, and must stop at 0: every
// line of the refusal has to be about the share that was named, or about the
// sum — never a range violation about a knob the command line never mentioned.
Deno.test('a share pinned above the cap is refused by the sum rule, not by its partner', () => {
  const sharesSum = { kind: 'rule', key: 'sharesSum', keys: ['wShort', 'wMid'] }
  const cases = [['--wshort=1', 'wShort'], ['--wmid=1', 'wMid']] as const
  for (const [flag, key] of cases) {
    const dir = tmp()
    const r = dryRun(['--dry-run', '--width=10', '--height=10', flag], dir)
    assertEquals(r.status, 2, flag)
    assert(r.json, `no JSON line in:\n${r.stdout}`)
    assertEquals(r.json.error, 'invalid parameters', flag)
    assertEquals(r.json.violations, [{ kind: 'range', key, value: 1, min: 0, max: 0.9 }, sharesSum], flag)
    assertEquals(entries(dir), 0, 'nothing is written')
  }
  // The cap and the top of the range are the same number now, so the share
  // the clamp can actually satisfy is carved instead of refused.
  const dir = tmp()
  const ok = dryRun(['--dry-run', '--width=10', '--height=10', '--wshort=0.9'], dir)
  assertEquals(ok.status, 0, ok.stdout + ok.stderr)
  assertEquals(ok.json?.params?.wMid, 0, 'the partner is clamped to zero, and that validates')
})

Deno.test('carve.ts --svg with invalid parameters: exit 2, both messages on stderr, no file', () => {
  const dir = tmp()
  const out = join(dir, 'out.svg')
  const r = dryRun(['--svg=' + out, ...BAD], dir)
  assertEquals(r.status, 2)
  assertEquals(expectedLines.length, 2)
  assertMatch(r.stderr, /invalid parameters:\n/)
  for (const line of expectedLines) assert(r.stderr.includes(`  - ${line}\n`), `stderr lacks: ${line}\n${r.stderr}`)
  assertMatch(r.stderr, /see --help for the allowed ranges\n$/)
  assertEquals(r.stdout, '', 'nothing on stdout')
  assertEquals(exists(out), false, 'the --svg=path copy must not be written')
  assertEquals(entries(dir), 0, 'the store must not be created')
})

// A value between two stops used to carve a board with its own id: --maxback=25
// (step 50) and --warns=2.5 both produced a board whose recorded command no
// slider and no flag can offer back. The step is part of the envelope now.
Deno.test('a value between two steps is refused, and no board is written', () => {
  const cases: [string, Partial<Params>][] = [['--maxback=25', { maxBack: 25 }], ['--warns=2.5', { warns: 2.5 }]]
  for (const [flag, over] of cases) {
    // The line the engine writes for this value, so the test cannot drift
    // from the knob's label the way a hand-copied string would.
    const lines = validateParams({ ...defaultParams(), ...over }).map(formatViolation)
    assertEquals(lines.length, 1, flag)
    const [line] = lines
    assert(line, flag)
    const dir = tmp()
    const r = runCarve(['--width=10', '--height=10', flag], join(dir, 'boards'))
    assertEquals(r.status, 2, `${flag}\n${r.stdout}${r.stderr}`)
    assertStringIncludes(r.stderr, 'invalid parameters:')
    assertStringIncludes(r.stderr, `  - ${line}\n`)
    assertEquals(entries(dir), 0, 'nothing is written')
  }
  // The stops themselves still carve.
  const dir = tmp()
  const ok = dryRun(['--dry-run', '--width=10', '--height=10', '--maxback=50', '--warns=3'], dir)
  assertEquals(ok.status, 0, ok.stderr)
})

// The picture flags used to take anything: --cell=-5 drew an SVG with a
// negative viewBox, --top=-1 and --arrow-height=-3 went through in silence.
Deno.test('a picture number outside its range is refused, and no board is written', () => {
  for (const flag of ['--cell=-5', '--cell=0', '--top=-1', '--line=0', '--arrow-height=-3', '--cell=12.5']) {
    const dir = tmp()
    const r = runCarve(['--width=10', '--height=10', flag], join(dir, 'boards'))
    assertEquals(r.status, 2, `${flag}\n${r.stdout}${r.stderr}`)
    assertStringIncludes(r.stderr, 'invalid arguments:')
    assertStringIncludes(r.stderr, flag)
    assertEquals(entries(dir), 0, 'nothing is written')
  }
  // Every picture README shows still draws: the big head and the tip of no height.
  const dir = tmp()
  const ok = dryRun(['--dry-run', '--width=10', '--height=10', '--arrow-width=2', '--arrow-height=0'], dir)
  assertEquals(ok.status, 0, ok.stderr)
})

// The lab's own fields are narrower than the CLI on purpose (a cell of 1..40
// against 1..200), but they must never be wider: every command the lab prints
// has to be one carve.ts accepts.
Deno.test('every picture field of the lab stays inside the CLI range', () => {
  const html = Deno.readTextFileSync(join(here, 'lab.html'))
  const fields = new Map<string, { min: number; max: number }>()
  for (const tag of html.matchAll(/<input type="number"[^>]*>/g)) {
    const id = /id="([\w-]+)"/.exec(tag[0])?.[1]
    const min = /min="([-\d.]+)"/.exec(tag[0])?.[1]
    const max = /max="([-\d.]+)"/.exec(tag[0])?.[1]
    if (id && min !== undefined && max !== undefined) fields.set(id, { min: Number(min), max: Number(max) })
  }
  assert(fields.size >= 8, `only ${fields.size} number fields found in lab.html`)
  const byField: [string, ViewNumber][] = [
    ['cell', 'cell'],
    ['stroke', 'stroke'],
    ['libStroke', 'stroke'],
    ['headWidth', 'headWidth'],
    ['libHeadWidth', 'headWidth'],
    ['headHeight', 'headHeight'],
    ['libHeadHeight', 'headHeight'],
    ['top', 'top'],
  ]
  for (const [id, field] of byField) {
    const f = fields.get(id)
    assert(f, `lab.html has no number field ${id}`)
    const r = VIEW_RANGE[field]
    assert(f.min >= r.min, `${id} min ${f.min} is below the CLI's ${r.min}`)
    assert(f.max <= r.max, `${id} max ${f.max} is above the CLI's ${r.max}`)
  }
})

// --- refusals -----------------------------------------------------------------

Deno.test('a retired flag is refused with its replacement, exit code 2', () => {
  const dir = tmp()
  const r = dryRun(['--advanced', '--w=10', '--h=10', '--dry-run'], dir)
  assertEquals(r.status, 2)
  assert(r.json, `no JSON line in:\n${r.stdout}`)
  assertEquals(r.json.ok, false)
  assert((r.json.errors ?? []).join(' ').includes('--advanced'), r.stdout)
  assert((r.json.errors ?? []).join(' ').includes('--width=N'), 'the message names the replacement')
  assertEquals(entries(dir), 0, 'nothing is written')
})

// The worst of the three: --start=constructor read Object.prototype.constructor
// out of the word table, took it for a word and carved the DEFAULT board with
// exit 0, reporting a pin (headBias, mix) the command line never wrote.
Deno.test('a start named after Object.prototype is refused, and no board is written', () => {
  for (const name of ['constructor', 'toString', 'valueOf']) {
    const dir = tmp()
    const r = runCarve(['--width=10', '--height=10', `--start=${name}`], join(dir, 'boards'))
    assertEquals(r.status, 2, `--start=${name}\n${r.stdout}${r.stderr}`)
    assertStringIncludes(r.stderr, `--start=${name} is not layers, random, tunnels`)
    assertEquals(r.stdout, '', 'nothing on stdout')
    assertEquals(entries(dir), 0, 'nothing is written')
  }
})

Deno.test('carve.ts refuses an unknown flag and a missing size: exit 2, a hint, nothing written', () => {
  const dir = tmp()
  const r = runCarve(['--nope=1'], dir)
  assertEquals(r.status, 2)
  assertMatch(
    r.stderr,
    /^invalid arguments:\n {2}- missing --width\n {2}- missing --height\n {2}- unknown flag --nope; see --help\n/,
  )
  assertMatch(r.stderr, /see --help\n$/)
  assertEquals(r.stdout, '')
  assertEquals(entries(dir), 0, 'the store must not be created')

  const d = dryRun(['--dry-run', '--width=10', '--height=10', '--length=2'], dir)
  assertEquals(d.status, 2)
  assertEquals(d.json, { ok: false, error: 'invalid arguments', errors: ['--length=2 is outside 0..1'] })
  assertEquals(d.stdout.trim().split('\n').length, 1, 'exactly one line on stdout')
  assertEquals(entries(dir), 0)
})

// A mode flag is handed to the CLI untouched, so the CLI is where a value on
// a switch and a missing value are caught: --dry-run=1 was passed through and
// matched by nobody, so a board was written; --count alone was ignored.
Deno.test('carve.ts refuses a mode flag no mode reads: exit 2, nothing written', () => {
  const dir = tmp()
  const cases: [string[], string][] = [
    [['--width=10', '--height=10', '--dry-run=1'], '--dry-run=1 takes no value'],
    [['--width=10', '--height=10', '--count'], '--count needs a value'],
    [['--width=10', '--height=10', '--max-seeds'], '--max-seeds needs a value'],
  ]
  for (const [argv, message] of cases) {
    const r = runCarve(argv, join(dir, 'boards'))
    assertEquals(r.status, 2, `${argv.join(' ')}: ${r.stderr}`)
    assert(r.stderr.includes(message), `${argv.join(' ')}: stderr lacks "${message}":\n${r.stderr}`)
    assertEquals(exists(join(dir, 'boards')), false, 'nothing is written')
  }
})

// The parser's own refusals reach the CLI: a switch with a value used to turn
// the switch on, a bare word used to be dropped into the mode list and read by
// nobody, and a size outside the range was quietly clamped into it.
Deno.test('carve.ts refuses a value on a switch, a stray word and a size outside the range: exit 2', () => {
  const dir = tmp()
  const cases: [string[], string][] = [
    [['--width=10', '--height=10', '--skeleton=off'], '--skeleton=off takes no value'],
    [['--width=10', '--height=10', 'board.json'], 'unexpected argument: board.json'],
    [['--width=2000', '--height=10'], '--width=2000 is outside 4..1000'],
    [['--width=25.5', '--height=10'], '--width=25.5 is not a whole number'],
  ]
  for (const [argv, message] of cases) {
    const r = runCarve(argv, join(dir, 'boards'))
    assertEquals(r.status, 2, `${argv.join(' ')}: ${r.stderr}`)
    assert(r.stderr.includes(message), `${argv.join(' ')}: stderr lacks "${message}":\n${r.stderr}`)
    assertEquals(exists(join(dir, 'boards')), false, 'nothing is written')
  }
})

// --- --help ---------------------------------------------------------------------

Deno.test('carve.ts --help is short, --help=knobs adds the table, both exit 0 with bad parameters', () => {
  const dir = tmp()
  for (const flag of ['--help', '-h']) {
    const r = dryRun([flag, '--pstraight=0'], dir)
    assertEquals(r.status, 0, flag)
    assertMatch(r.stdout, new RegExp(`^Usage: ${prefixRe} --width=N --height=N`))
    assert(!r.stdout.includes('--pstraight'), 'the knob table is behind --help=knobs')
    assert(r.stdout.includes('CARVE_TIMEOUT_S'), 'the time budget is documented with the other variables')
    assertEquals(r.stderr, '')
  }
  const knobs = dryRun(['--help=knobs', '--pstraight=0'], dir)
  assertEquals(knobs.status, 0)
  assertMatch(knobs.stdout, /--pstraight=0\.6\.\.1\s+straightness bias/)
  assert(knobs.stdout.includes('maximum length must be 0 (automatic) or at least 17'))
  assert(knobs.stdout.includes('--start=layers|random|tunnels'), 'the merged control is listed')
  assertEquals(knobs.stderr, '')
  assertEquals(entries(dir), 0)
})

Deno.test('carve.ts refuses an unknown value of --help by name, exit code 2', () => {
  const dir = tmp()
  const r = dryRun(['--help=bogus', '--dry-run', '--width=10', '--height=10'], dir)
  assertEquals(r.status, 2)
  assert(r.json, `no JSON line in:\n${r.stdout}`)
  assertEquals(r.json.ok, false)
  assert(
    (r.json.errors ?? []).join(' ').includes('--help=bogus is not --help or --help=knobs'),
    r.stdout,
  )
  assertEquals(entries(dir), 0, 'nothing is written')
})

// --- boards that do not close -------------------------------------------------
// A board that did not close still goes to the store, with its holes drawn,
// so that a jam can be looked at in the lab and not only counted; the exit
// code stays 1 for scripts. CARVE_TIMEOUT_S is a wall-clock budget for
// measurements: past it the run is aborted and what was carved is stored.
// No setting inside the envelope jams cheaply, so the budget is the fixture:
// 400×400 takes seconds, a zero budget stops it at the first progress tick.

const LONG = ['--width=400', '--height=400', '--seed=7']
const longId = boardId(simpleParams({ ...defaultChoice(), W: 400, H: 400, seed: 7 }))

Deno.test('CARVE_TIMEOUT_S aborts a long generation and stores what was carved so far, holes drawn', () => {
  const dir = tmp()
  const copy = join(dir, 'copy.svg')
  const r = runCarve([...LONG, `--svg=${copy}`], join(dir, 'boards'), { CARVE_TIMEOUT_S: '0' })
  assertEquals(r.status, 1, r.stderr)
  assertMatch(r.stderr, /aborted after \d+\.\d s: board 400x400 \(seed 7\) has \d+ cells left/)
  assertMatch(
    r.stdout,
    new RegExp(
      `400x400/${longId}\\.board\\.json {2}\\+ 400x400/${longId}\\.svg {2}\\+ .*copy\\.svg {2}not closed: \\d+ cells left in \\d+ fragments`,
    ),
  )
  assert(exists(join(dir, 'boards', '400x400', `${longId}.board.json`)), 'the partial board is stored as a file')
  const meta = readMeta(join(dir, 'boards', '400x400', `${longId}.json`))
  assertEquals(meta.ok, false)
  assertEquals(meta.aborted, true)
  assertEquals(meta.restarts, 0, 'an aborted attempt is not restarted')
  assertEquals(typeof meta.backtracks, 'number')
  assert(meta.pieces !== null && meta.pieces > 0, 'the partial board has pieces')
  assert(meta.stuck && meta.stuck.remaining > 0 && meta.stuck.sizes.length > 0, JSON.stringify(meta.stuck))
  assert(meta.genMs !== null && meta.genMs < 3000, `aborted early, not after the full run: ${meta.genMs} ms`)
  const svg = Deno.readTextFileSync(join(dir, 'boards', '400x400', `${longId}.svg`))
  assertMatch(svg, /<rect /, 'the holes are drawn')
  assertEquals(Deno.readTextFileSync(copy), svg, 'the --svg=path copy is written too')
  assertEquals(meta.source, 'cli')
  assertMatch(meta.command, / --width=400 --height=400 --seed=7/)
})

Deno.test('carve.ts --dry-run under CARVE_TIMEOUT_S reports the abort in its JSON line and writes nothing', () => {
  const dir = tmp()
  const r = dryRun([...LONG, '--dry-run'], dir, { CARVE_TIMEOUT_S: '0' })
  assertEquals(r.status, 1, r.stderr)
  assert(r.json, `no JSON line in:\n${r.stdout}`)
  assertEquals([r.json.dryRun, r.json.ok, r.json.aborted, r.json.restarts], [true, false, true, 0])
  assertEquals(r.json.id, longId)
  assert(r.json.stuck && r.json.stuck.remaining > 0)
  assertEquals(typeof r.json.backtracks, 'number')
  assertEquals(entries(dir), 0, 'nothing is written')
  // a budget that is not a number is refused, not silently ignored
  const bad = dryRun(['--dry-run', '--width=10', '--height=10'], dir, { CARVE_TIMEOUT_S: 'soon' })
  assertEquals(bad.status, 2)
  assertMatch(bad.stderr, /invalid CARVE_TIMEOUT_S: soon/)
})

Deno.test('carve.ts --dry-run of a board that does not close still prints the pinned knobs', () => {
  const dir = tmp()
  const r = dryRun([...LONG, '--dry-run', '--restarts=4'], dir, { CARVE_TIMEOUT_S: '0' })
  assertEquals(r.status, 1, r.stderr)
  assert(r.json, `no JSON line in:\n${r.stdout}`)
  assertEquals(r.json.ok, false)
  assertEquals(r.json.pinned, ['restarts'], 'a script need not parse stderr for a board that does not close either')
})

// --- the everyday flags make the board the lab's simple view makes -------------

Deno.test('carve.ts turns the everyday flags into the board of the simple lab view', () => {
  const dir = tmp()
  const choice: SimpleChoice = {
    ...defaultChoice(),
    W: 25,
    H: 50,
    seed: 7,
    lengths: 0.25,
    shape: 0.2,
    skeleton: 'on',
    random: false,
  }
  const params = simpleParams(choice)
  const view = { ...DEFAULT_VIEW, cell: exportCell(25, 50), colored: true }

  // --winding is the shape slider itself: 0.2 here, not 0.8 through an inversion.
  const r = runCarve([
    '--width=25',
    '--height=50',
    '--seed=7',
    '--length=0.25',
    '--winding=0.2',
    '--skeleton',
    '--colored',
  ], dir)
  assertEquals(r.status, 0, r.stderr)
  const id = boardId(params)
  assertMatch(r.stdout, new RegExp(`^25x50/${id}\\.board\\.json {2}pieces=`))
  assertEquals(storedFingerprint(join(dir, '25x50', `${id}.board.json`)), fingerprint(generate(params).board))
  assertEquals(exists(join(dir, '25x50', `${id}.svg`)), false, 'no preview without --svg')
  const meta = readMeta(join(dir, '25x50', `${id}.json`))
  assertEquals(meta.command, buildCommand(params, view), 'the command reproduces the board')
  assertMatch(meta.command, new RegExp(`^${prefixRe} --width=25 --height=50 --seed=7 `))
  assertEquals(meta.source, 'cli')
  assertEquals(meta.params, params)
  assertEquals([meta.svg, meta.fingerprint], [false, fingerprint(generate(params).board)])
  assertEquals(r.stderr, '', 'nothing was pinned, so there is no note')
})

Deno.test('carve.ts --randomized draws every knob inside the slider ranges', () => {
  const dir = tmp()
  const choice: SimpleChoice = { ...defaultChoice(), W: 20, H: 20, seed: 1, lengths: 0, shape: 1, skeleton: 'on' }
  const r = dryRun([
    '--dry-run',
    '--width=20',
    '--height=20',
    '--seed=1',
    '--length=0',
    '--winding=1',
    '--skeleton',
    '--randomized',
  ], dir)
  assertEquals(r.status, 0, r.stderr)
  assert(r.json, `no JSON line in:\n${r.stdout}`)
  assertEquals(r.json.ok, true)
  const drawn = r.json.params
  assert(drawn, 'the dry run prints the drawn parameters')
  assertEquals(validateParams(drawn), [], 'a drawn set stays inside the envelope')
  const ranges = simpleRanges(choice)
  const rangeKeys = Object.keys(ranges) as ParamKey[]
  for (const key of rangeKeys) {
    const range = ranges[key]
    if (!range) continue
    const v = drawn[key]
    if ('pick' in range) assert(range.pick.includes(v), `${key}=${v} not in ${range.pick}`)
    else assert(v >= range.lo - 1e-9 && v <= range.hi + 1e-9, `${key}=${v} outside ${range.lo}..${range.hi}`)
  }
  assertEquals(r.json.pinned, [], 'a slider is not a pin')
  assertMatch(r.json.command ?? '', new RegExp(`^${prefixRe} --width=20 --height=20 --seed=1 `))
})

// --- a batch: --count=N [--max-seeds=M] --------------------------------------
// A pool of boards for Storage: N closed boards on the seeds from --seed up.
// A seed that does not close is skipped and not stored; the batch gives up
// after --max-seeds seeds (default 2·N). Closing is deterministic, so the
// same command always writes the same files.

Deno.test('carve.ts --count=3 writes three closed boards on consecutive seeds and exits 0', () => {
  const dir = tmp()
  const r = runCarve(['--width=10', '--height=10', '--seed=1', '--count=3'], dir)
  assertEquals(r.status, 0, r.stderr)
  for (const seed of [1, 2, 3]) {
    const params = simpleParams({ ...defaultChoice(), W: 10, H: 10, seed })
    const id = boardId(params)
    assertEquals(storedFingerprint(join(dir, '10x10', `${id}.board.json`)), fingerprint(generate(params).board))
    assertMatch(readMeta(join(dir, '10x10', `${id}.json`)).command, new RegExp(` --seed=${seed}$`))
  }
  assertEquals(entries(join(dir, '10x10')), 6, 'a board file and a meta per board, no preview')
  assertMatch(r.stdout, /batch: 3\/3 boards written, 3 seeds tried\n$/)
})

Deno.test('carve.ts --count with --svg writes a preview per board', () => {
  const dir = tmp()
  const r = runCarve(['--svg', '--width=10', '--height=10', '--seed=1', '--count=2'], dir)
  assertEquals(r.status, 0, r.stderr)
  assertEquals(entries(join(dir, '10x10')), 6, 'board file, meta and preview for each of two boards')
})

Deno.test('carve.ts --count skips seeds that do not close, stores none of them, and exits 1 at the seed limit', () => {
  const dir = tmp()
  const r = runCarve([...LONG, '--count=2', '--max-seeds=2'], join(dir, 'boards'), { CARVE_TIMEOUT_S: '0' })
  assertEquals(r.status, 1, r.stderr)
  assertMatch(r.stderr, /seed 7: not closed \(\d+ cells left\), skipped\n/)
  assertMatch(r.stderr, /seed 8: not closed \(\d+ cells left\), skipped\n/)
  assertMatch(r.stdout, /batch: 0\/2 boards written, 2 seeds tried, not closed: 7 8\n$/)
  assertEquals(exists(join(dir, 'boards')), false, 'nothing is stored')
})

Deno.test('carve.ts refuses --count and --max-seeds where they cannot apply: exit 2, nothing written', () => {
  const dir = tmp()
  const cases: [string[], string][] = [
    [['--width=10', '--height=10', '--count=0'], '--count=0 is not a positive integer'],
    [['--width=10', '--height=10', '--count=two'], '--count=two is not a positive integer'],
    [['--width=10', '--height=10', '--max-seeds=3'], '--max-seeds needs --count'],
    [['--width=10', '--height=10', '--svg=one.svg', '--count=2'], '--svg=path names one file'],
    // --count=1 may reach two seeds (2·N): 999999 and 1000000, one past the envelope.
    [['--width=10', '--height=10', '--seed=999999', '--count=1'], 'seed: 1000000 is outside 0..999999'],
  ]
  for (const [argv, message] of cases) {
    const r = runCarve(argv, dir)
    assertEquals(r.status, 2, argv.join(' '))
    assert(r.stderr.includes(message), `${argv.join(' ')}: stderr lacks "${message}":\n${r.stderr}`)
  }
  const dry = dryRun(['--width=10', '--height=10', '--dry-run', '--count=2'], dir)
  assertEquals(dry.status, 2)
  assertEquals(dry.json?.error, 'invalid arguments')
  assertEquals(entries(dir), 0, 'nothing is written')
})
