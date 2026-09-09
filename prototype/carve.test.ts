// The lab must mirror the CLI 1:1: the command from the lab has to give the
// same board as the worker. We generate through generate() and through
// carve.ts in a child process and compare the SVG byte for byte.
// --dry-run is tested the same way: the board store points at a temporary
// directory, which must stay empty.
import { assert, assertEquals, assertMatch } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
// @ts-types="./engine.d.ts"
import { defaultParams, fingerprint, formatViolation, generate, toSvg, validateParams } from './engine.mjs'
import { boardId, buildCommand, buildSimpleCommand, COMMAND_PREFIX, DEFAULT_VIEW } from './command.ts'
import { defaultChoice, exportCell, simpleParams, simpleRanges } from './lab-simple.ts'
import type { BoardMeta, ParamKey, Params, SimpleChoice, View } from './types.ts'

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
/** The prefix as a regular expression source: the spaces of "deno task carve" are literal. */
const prefixRe = COMMAND_PREFIX.replace(/ /g, '\\s')

/** Runs carve.ts with the board store pointed at boardsDir. */
function runCarve(argv: readonly string[], boardsDir: string) {
  const r = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-read', '--allow-write', '--allow-env', carve, ...argv],
    cwd: dirname(here),
    env: { ARROWZ_BOARDS_DIR: boardsDir },
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
  simpleCommand?: string
  pieces?: number
  maxLen?: number
  genMs?: number
  fingerprint?: string
  error?: string
  errors?: string[]
  violations?: unknown[]
}

/** Runs carve.ts with the board store pointed at <dir>/boards and parses the JSON line. */
function dryRun(args: readonly string[], dir: string) {
  const r = runCarve(args, join(dir, 'boards'))
  const line = r.stdout.split('\n').find((l) => l.startsWith('{'))
  // The line was printed by the CLI under test: the sanctioned narrowing at an I/O boundary.
  const json = line ? (JSON.parse(line) as DryLine) : null
  return { ...r, json }
}

Deno.test('carve.ts --advanced --svg reproduces the generate() board byte for byte', () => {
  const dir = tmp()
  const params = { ...defaultParams(), W: 25, H: 50, seed: 7, anticoil: 3, giants: 2 }
  const view = { cell: 10, stroke: 0.5, colored: true, top: 3 }
  const expected = toSvg(generate(params).board, { cell: 10, colored: true, strokeRatio: 0.5, top: 3 })

  const cmd = buildCommand(params, view) // "deno task carve --advanced --svg …"
  const argv = cmd.slice(COMMAND_PREFIX.length + 1).split(' ')
  const r = runCarve(argv, dir)
  assertEquals(r.status, 0, r.stderr)
  const id = boardId(params)
  assertMatch(r.stdout, new RegExp(`25x50/${id}\\.svg`))
  assertEquals(Deno.readTextFileSync(join(dir, '25x50', `${id}.svg`)), expected)
  const meta = readMeta(join(dir, '25x50', `${id}.json`))
  assertEquals(meta.command, cmd)
  assertEquals(meta.source, 'cli')
})

Deno.test('carve.ts --svg=path also writes a copy at the path', () => {
  const dir = tmp()
  const copy = join(dir, 'copy.svg')
  const r = runCarve(['--advanced', `--svg=${copy}`, '--w=10', '--h=10', '--seed=3'], dir)
  assertEquals(r.status, 0, r.stderr)
  const id = boardId({ ...defaultParams(), W: 10, H: 10, seed: 3 })
  assertEquals(Deno.readTextFileSync(copy), Deno.readTextFileSync(join(dir, '10x10', `${id}.svg`)))
})

// --- --dry-run ---------------------------------------------------------------

Deno.test('carve.ts --dry-run computes the board, writes nothing and prints one JSON line', () => {
  const dir = tmp()
  const out = join(dir, 'out.svg')
  const r = dryRun(['--advanced', '--dry-run', '--svg=' + out, '--w=10', '--h=10', '--seed=1'], dir)
  assertEquals(r.status, 0, r.stderr)
  assertEquals(exists(join(dir, 'boards')), false, 'the store must not be created')
  assertEquals(exists(out), false, 'the --svg=path copy must not be written')
  assertEquals(entries(dir), 0, 'nothing at all is written')
  assert(r.json, `no JSON line in:\n${r.stdout}`)
  assertEquals(r.json.dryRun, true)
  assertEquals(r.json.ok, true)
  assertEquals([r.json.W, r.json.H, r.json.seed], [10, 10, 1])
  assertEquals(r.json.id, boardId({ ...defaultParams(), W: 10, H: 10, seed: 1 }))
  assertEquals(typeof r.json.pieces, 'number')
  assertEquals(typeof r.json.maxLen, 'number')
  assertEquals(typeof r.json.genMs, 'number')
  assertMatch(r.json.command ?? '', new RegExp(`^${prefixRe} --advanced --svg --w=10 --h=10 --seed=1`))
})

Deno.test('carve.ts --dry-run alone selects the one-board mode and its fingerprint matches the engine', () => {
  const dir = tmp()
  const r = dryRun(['--advanced', '--dry-run', '--w=25', '--h=50', '--seed=7', '--headbias=1'], dir)
  assertEquals(r.status, 0, r.stderr)
  assert(r.json, `no JSON line in:\n${r.stdout}`)
  // the same parameters through the CLI parser and through generate() directly
  const expected = generate({ ...defaultParams(), W: 25, H: 50, seed: 7, headBias: 1 })
  assertEquals(r.json.fingerprint, fingerprint(expected.board))
  assertEquals(r.json.pieces, expected.board.pieces.length)
  assertEquals(r.json.params?.headBias, 1)
  assertEquals(entries(dir), 0, 'nothing is written')
})

// --- the safe envelope --------------------------------------------------------
// Parameters outside PARAM_SPEC ranges or breaking a RULES entry are refused
// before any generation, in every mode, with exit code 2. --pstraight=0.3 is a
// range violation, --lmax=3 breaks the lmaxHole rule.

const BAD = ['--advanced', '--w=10', '--h=10', '--seed=1', '--pstraight=0.3', '--lmax=3']
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

Deno.test('carve.ts --svg with invalid parameters: exit 2, both messages on stderr, no file', () => {
  const dir = tmp()
  const out = join(dir, 'out.svg')
  const r = dryRun(['--svg=' + out, ...BAD], dir)
  assertEquals(r.status, 2)
  assertEquals(expectedLines.length, 2)
  assertMatch(r.stderr, /^invalid parameters:\n/)
  for (const line of expectedLines) assert(r.stderr.includes(`  - ${line}\n`), `stderr lacks: ${line}\n${r.stderr}`)
  assertMatch(r.stderr, /see --help for the allowed ranges\n$/)
  assertEquals(r.stdout, '', 'nothing on stdout')
  assertEquals(exists(out), false, 'the --svg=path copy must not be written')
  assertEquals(entries(dir), 0, 'the store must not be created')
})

Deno.test('carve.ts report and bench modes refuse invalid parameters before the first level', () => {
  const dir = tmp()
  for (const mode of [['--only=easy', '--square', '--runs=1'], ['--bench=1', '--only=easy', '--square']]) {
    const r = dryRun(['--advanced', ...mode, '--warns=1'], dir)
    assertEquals(r.status, 2, mode.join(' '))
    assertMatch(r.stderr, /^invalid parameters:\n {2}- closing off nooks: 1 is outside 2\.\.16\n/)
    assertEquals(r.stdout, '', `no report header for ${mode.join(' ')}`)
  }
  // a level size from --mid is validated like a knob
  const r = dryRun(['--advanced', '--only=mid', '--square', '--mid=2', '--runs=1'], dir)
  assertEquals(r.status, 2)
  assertMatch(r.stderr, /width: 2 is outside 4\.\.1000/)
})

// The report and the benchmark have no other test that runs them to the end.
Deno.test('carve.ts --advanced report and bench modes run one level to the end', () => {
  const dir = tmp()
  const report = dryRun(['--advanced', '--only=easy', '--square', '--runs=1'], dir)
  assertEquals(report.status, 0, report.stderr)
  assertMatch(report.stdout, /--- Easy 25x25 \(1 runs\) ---\n {2}coverage\s+100\.00%/)
  const bench = dryRun(['--advanced', '--bench=1', '--only=easy', '--square'], dir)
  assertEquals(bench.status, 0, bench.stderr)
  assertMatch(bench.stdout, /--- Easy 25x25 ---\n {2}time \[ms\]/)
  assertEquals(entries(dir), 0, 'the report writes nothing')
})

Deno.test('carve.ts --advanced --help and -h print the knob table and exit 0, even with bad parameters', () => {
  const dir = tmp()
  for (const flag of ['--help', '-h']) {
    const r = dryRun(['--advanced', flag, '--pstraight=0'], dir)
    assertEquals(r.status, 0, flag)
    assertMatch(r.stdout, new RegExp(`^Usage: ${prefixRe} `))
    assertMatch(r.stdout, /--pstraight\s+straightness bias\s+0\.6\.\.1/)
    assert(r.stdout.includes('maximum length must be 0 (automatic) or at least 6'))
    assertEquals(r.stderr, '')
  }
  assertEquals(entries(dir), 0)
})

// --- the simple mode (no --advanced) ----------------------------------------
// The default call takes the simple lab view's inputs and always makes one
// board. The store meta keeps the full --advanced command (it reproduces the
// board even after --randomized) and the simple command next to it.

Deno.test('carve.ts without --advanced writes the board the simple lab view makes for the same choice', () => {
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
  const expected = toSvg(generate(params).board, {
    cell: view.cell,
    colored: true,
    strokeRatio: 0.5,
    headWidth: 0,
    headHeight: 0,
    top: 0,
  })

  const r = runCarve([
    '--width=25',
    '--height=50',
    '--seed=7',
    '--length=0.25',
    '--straight=0.8',
    '--skeleton',
    '--colorized',
  ], dir)
  assertEquals(r.status, 0, r.stderr)
  const id = boardId(params)
  assertMatch(r.stdout, new RegExp(`25x50/${id}\\.svg`))
  assertEquals(Deno.readTextFileSync(join(dir, '25x50', `${id}.svg`)), expected)
  const meta = readMeta(join(dir, '25x50', `${id}.json`))
  assertEquals(meta.command, buildCommand(params, view), 'the full command reproduces the board')
  assertMatch(meta.command, new RegExp(`^${prefixRe} --advanced --svg `))
  assertEquals(
    meta.simpleCommand,
    `${COMMAND_PREFIX} --width=25 --height=50 --seed=7 --length=0.25 --straight=0.8 --skeleton --colorized`,
  )
  assertEquals(meta.simpleCommand, buildSimpleCommand(choice, view))
  assertEquals(meta.source, 'cli')
  assertEquals(meta.params, params)
})

Deno.test('carve.ts simple mode: --svg=path writes a copy, --dry-run writes nothing and prints both commands', () => {
  const dir = tmp()
  const copy = join(dir, 'copy.svg')
  const ok = runCarve(['--width=10', '--height=10', '--seed=1', `--svg=${copy}`], join(dir, 'store'))
  assertEquals(ok.status, 0, ok.stderr)
  const id = boardId(simpleParams({ ...defaultChoice(), W: 10, H: 10, seed: 1 }))
  assertEquals(Deno.readTextFileSync(copy), Deno.readTextFileSync(join(dir, 'store', '10x10', `${id}.svg`)))

  const dry = tmp()
  const r = dryRun(['--dry-run', '--width=10', '--height=10', '--seed=1', '--length=0'], dry)
  assertEquals(r.status, 0, r.stderr)
  assert(r.json, `no JSON line in:\n${r.stdout}`)
  assertEquals(r.json.ok, true)
  assertEquals(r.json.params, simpleParams({ ...defaultChoice(), W: 10, H: 10, seed: 1, lengths: 0 }))
  assertEquals(r.json.simpleCommand, `${COMMAND_PREFIX} --width=10 --height=10 --seed=1 --length=0`)
  assertMatch(r.json.command ?? '', new RegExp(`^${prefixRe} --advanced --svg --w=10 --h=10 --seed=1 `))
  assertEquals(r.json.view?.cell, exportCell(10, 10))
  assertEquals(entries(dry), 0, 'nothing is written')
})

Deno.test('carve.ts simple mode: --randomized draws every knob inside the slider ranges', () => {
  const dir = tmp()
  const choice: SimpleChoice = { ...defaultChoice(), W: 20, H: 20, seed: 1, lengths: 0, shape: 0, skeleton: 'on' }
  const r = dryRun([
    '--dry-run',
    '--width=20',
    '--height=20',
    '--seed=1',
    '--length=0',
    '--straight=1',
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
  assertMatch(r.json.simpleCommand ?? '', / --randomized$/)
  assertMatch(r.json.command ?? '', new RegExp(`^${prefixRe} --advanced --svg `))
})

Deno.test('carve.ts simple mode refuses advanced flags and a missing size: exit 2, a hint, nothing written', () => {
  const dir = tmp()
  const r = runCarve(['--w=10', '--h=10'], dir)
  assertEquals(r.status, 2)
  assertMatch(
    r.stderr,
    /^invalid arguments:\n {2}- missing --width\n {2}- missing --height\n {2}- unknown flag --w \(engine knobs, the report and the benchmark need --advanced\)\n/,
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

Deno.test('carve.ts --help without --advanced prints the simple flags and points at --advanced', () => {
  const dir = tmp()
  for (const flag of ['--help', '-h']) {
    const r = dryRun([flag, '--w=10'], dir)
    assertEquals(r.status, 0, flag)
    assertMatch(r.stdout, new RegExp(`^Usage: ${prefixRe} --width=N --height=N`))
    for (
      const f of [
        '--length=R',
        '--straight=R',
        '--skeleton',
        '--seed=N',
        '--randomized',
        '--colorized',
        '--lineweight=R',
        '--arrowwidth=R',
        '--arrowheight=R',
        '--svg=path',
        '--dry-run',
        '--advanced',
      ]
    ) {
      assert(r.stdout.includes(f), `${f} missing from the simple help`)
    }
    assert(!r.stdout.includes('--pstraight'), 'the knob table is behind --advanced --help')
    assertEquals(r.stderr, '')
  }
  assertEquals(entries(dir), 0)
})
