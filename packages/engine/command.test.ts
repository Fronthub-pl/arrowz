// The lab must mirror the CLI 1:1, so the command text has to parse back
// into the same parameters.
import { assert, assertEquals, assertMatch, assertNotEquals } from '@std/assert'
import {
  ALIASES,
  boardId,
  buildCommand,
  buildSimpleCommand,
  COMMAND_PREFIX,
  DEFAULT_VIEW,
  helpText,
  parseArgs,
  parseSimpleArgs,
} from './command.ts'
import { defaultChoice, exportCell } from './lab-simple.ts'
import { defaultParams, PARAM_SPEC, RULE_REASONS, RULES } from './engine.ts'
import type { Params, SimpleChoice } from './types.ts'

const argvOf = (cmd: string) => cmd.slice(COMMAND_PREFIX.length + 1).split(' ') // drop the command prefix
/** The prefix as a regular expression source: the spaces of "deno task carve" are literal. */
const prefixRe = COMMAND_PREFIX.replace(/ /g, '\\s')
/** Typed Object.keys for a parameter set: its keys are the fields of Params. */
const paramKeys = (p: Params): (keyof Params)[] => Object.keys(p) as (keyof Params)[]
/** The same parameters with the keys in reverse insertion order; boardId reads PARAM_SPEC, so it must not care. */
function reverseKeys(p: Params): Params {
  const out: Partial<Record<keyof Params, unknown>> = {}
  for (const key of paramKeys(p).reverse()) out[key] = p[key]
  return out as Params
}

Deno.test('buildCommand: default params give only size, seed, --board and --cell', () => {
  const p = { ...defaultParams(), W: 25, H: 50, seed: 7 }
  assertEquals(buildCommand(p), `${COMMAND_PREFIX} --advanced --board --w=25 --h=50 --seed=7 --cell=12`)
})

Deno.test('buildCommand ↔ parseArgs: round trip for changed knobs and view', () => {
  const p = { ...defaultParams(), W: 100, H: 200, seed: 42, anticoil: 3, giants: 4, headBias: -1, wShort: 0.5 }
  const v = { cell: 8, stroke: 0.4, headWidth: 0.8, headHeight: 1.2, colored: true, top: 5, rounded: true }
  const cmd = buildCommand(p, v)
  assertMatch(cmd, /--anticoil=3 /)
  assertMatch(cmd, /--headbias=-1 /)
  assertMatch(cmd, / --stroke=0.4 --headwidth=0.8 --headheight=1.2 --colored --top=5$/)
  const back = parseArgs(argvOf(cmd))
  for (const s of PARAM_SPEC) assertEquals(back.params[s.key], p[s.key], s.key)
  assertEquals(back.view, v)
  assertEquals(back.rest, ['--advanced', '--board'])
})

// The width defaults to 0 (automatic) and the height to one cell (literal);
// neither is printed while it holds its default, and a height of 0 is a
// height the user asked for, so it is printed.
Deno.test('buildCommand: a head knob at its default adds no flag; a zero height is printed', () => {
  assertEquals(DEFAULT_VIEW.headWidth, 0)
  assertEquals(DEFAULT_VIEW.headHeight, 1)
  const p = { ...defaultParams(), W: 25, H: 50, seed: 7 }
  assertEquals(
    buildCommand(p, { headWidth: 0, headHeight: 1 }),
    `${COMMAND_PREFIX} --advanced --board --w=25 --h=50 --seed=7 --cell=12`,
  )
  assertEquals(
    buildCommand(p, { headWidth: 0.6 }),
    `${COMMAND_PREFIX} --advanced --board --w=25 --h=50 --seed=7 --cell=12 --headwidth=0.6`,
  )
  assertEquals(
    buildCommand(p, { headHeight: 0 }),
    `${COMMAND_PREFIX} --advanced --board --w=25 --h=50 --seed=7 --cell=12 --headheight=0`,
  )
})

Deno.test('parseArgs: old flag names are aliases, unknown flags go to rest', () => {
  const r = parseArgs(['--straight=0.6', '--lateral=6', '--absorb=0', '--giantspacepen=12', '--runs=3', '--show'])
  assertEquals(r.params.pStraight, 0.6)
  assertEquals(r.params.wLateral, 6)
  assertEquals(r.params.absorbLimit, 0)
  assertEquals(r.params.giantSpacePenalty, 12)
  assertEquals(r.rest, ['--runs=3', '--show'])
  assertEquals(r.view, DEFAULT_VIEW)
})

Deno.test('boardId: stable, ignores view and key order, distinguishes seeds', () => {
  const p = { ...defaultParams(), W: 25, H: 50, seed: 7 }
  const id = boardId(p)
  assertMatch(id, /^seed7-[0-9a-f]{8}$/)
  assertEquals(boardId(reverseKeys(p)), id)
  const withView: Params & { cell: number; colored: boolean } = { ...p, cell: 99, colored: true }
  assertEquals(boardId(withView), id)
  assertNotEquals(boardId({ ...p, seed: 8 }), id)
  assertNotEquals(boardId({ ...p, anticoil: 1 }), id)
})

// --- --help and the parser/validator split ----------------------------------

Deno.test('helpText: one row per knob with flag, range, step, default and help', () => {
  const text = helpText({ advanced: true })
  const lines = text.split('\n')
  for (const s of PARAM_SPEC) {
    const flag = `--${s.key.toLowerCase()}`
    const row = lines.find((l) => l.startsWith(`  ${flag} `))
    assert(row, `no row for ${flag}`)
    assert(row.includes(s.label), `${flag}: label missing`)
    assert(row.includes(`${s.min}..${s.max}`), `${flag}: range missing`)
    assert(row.includes(` ${s.step} `), `${flag}: step missing`)
    assert(row.includes(` ${s.def} `), `${flag}: default missing`)
    assert(row.endsWith(s.help), `${flag}: help missing`)
  }
})

Deno.test('helpText: every rule key and text, every alias, every mode flag', () => {
  const text = helpText({ advanced: true })
  for (const r of RULES) assert(text.includes(r.key), `rule key ${r.key} missing`)
  for (const reason of Object.values(RULE_REASONS)) assert(text.includes(reason), `rule text missing: ${reason}`)
  for (const [alias, key] of Object.entries(ALIASES)) {
    assertMatch(text, new RegExp(`--${alias}\\s+same as --${key.toLowerCase()}`), `alias --${alias}`)
  }
  for (
    const flag of [
      '--board',
      '--svg[=path]',
      '--dry-run',
      '--count=N',
      '--max-seeds=M',
      '--bench=N',
      '--runs=N',
      '--only=<level>',
      '--mid=N',
      '--square',
      '--portrait',
      '--show',
      '--help',
      '-h',
      '--cell=N',
      '--stroke=R',
      '--headwidth=R',
      '--headheight=R',
      '--colored',
      '--top=N',
    ]
  ) {
    assert(text.includes(flag), `mode flag ${flag} missing`)
  }
  assertMatch(text, new RegExp(`^Usage: ${prefixRe} --advanced `))
  assert(!text.includes('\u2014'), 'no em dashes in the help text')
})

Deno.test('helpText: the default text is the simple mode, one row per simple flag, a pointer at --advanced', () => {
  const text = helpText()
  assertMatch(text, new RegExp(`^Usage: ${prefixRe} --width=N --height=N`))
  for (
    const f of [
      '--width=N',
      '--height=N',
      '--length=R',
      '--straight=R',
      '--skeleton',
      '--seed=N',
      '--randomized',
      '--colorized',
      '--lineweight=R',
      '--arrowwidth=R',
      '--arrowheight=R',
      '--svg[=path]',
      '--dry-run',
      '--count=N',
      '--max-seeds=M',
      '--advanced',
      '--help, -h',
    ]
  ) {
    assert(text.includes(f), `${f} missing`)
  }
  assert(text.includes('--advanced --help'), 'points at the advanced help')
  assert(!text.includes('--pstraight'), 'no knob table in the simple help')
  assert(!text.includes('\u2014'), 'no em dashes in the help text')
})

Deno.test('parseArgs only parses: out-of-range values and broken rules pass through untouched', () => {
  const r = parseArgs(['--pstraight=0.3', '--lmax=3', '--warns=0', '--wshort=0.6', '--wmid=0.6'])
  assertEquals(r.params.pStraight, 0.3)
  assertEquals(r.params.Lmax, 3)
  assertEquals(r.params.warns, 0)
  assertEquals(r.params.wShort + r.params.wMid, 1.2)
  assertEquals(r.rest, [])
  // --help and -h are not engine parameters: they land in rest for the CLI
  assertEquals(parseArgs(['--help', '-h']).rest, ['--help', '-h'])
})

// --- the simple mode (no --advanced) ----------------------------------------
// The CLI takes the same inputs as the simple lab view: a size, two slider
// positions in 0..1, a skeleton switch, a seed, the view and a randomise flag.

Deno.test('parseSimpleArgs: width and height are required, everything else defaults to the lab choice', () => {
  const r = parseSimpleArgs(['--width=25', '--height=50'])
  assertEquals(r.errors, [])
  assertEquals(r.choice, { ...defaultChoice(), W: 25, H: 50, random: false })
  assertEquals(r.view, { ...DEFAULT_VIEW, cell: exportCell(25, 50) })
  assertEquals(r.rest, [])
  assertEquals(parseSimpleArgs([]).errors, ['missing --width', 'missing --height'])
  assertEquals(parseSimpleArgs(['--width=25']).errors, ['missing --height'])
})

Deno.test('parseSimpleArgs: --straight is the shape slider read from the straight end', () => {
  const r = parseSimpleArgs([
    '--width=25',
    '--height=50',
    '--length=0.25',
    '--straight=0.8',
    '--seed=3',
    '--skeleton',
    '--randomized',
  ])
  assertEquals(r.errors, [])
  assertEquals(r.choice.lengths, 0.25)
  assertEquals(r.choice.shape, 0.2, '1 - straight, without float noise')
  assertEquals(r.choice.skeleton, 'on')
  assertEquals(r.choice.seed, 3)
  assertEquals(r.choice.random, true)
  assertEquals(parseSimpleArgs(['--width=25', '--height=50', '--straight=1']).choice.shape, 0)
  assertEquals(parseSimpleArgs(['--width=25', '--height=50', '--straight=0']).choice.shape, 1)
})

Deno.test('parseSimpleArgs: the view flags carry the lab names', () => {
  const r = parseSimpleArgs([
    '--width=40',
    '--height=40',
    '--colorized',
    '--lineweight=0.3',
    '--arrowwidth=0.8',
    '--arrowheight=1.2',
  ])
  assertEquals(r.errors, [])
  assertEquals(r.view, {
    cell: exportCell(40, 40),
    stroke: 0.3,
    headWidth: 0.8,
    headHeight: 1.2,
    colored: true,
    top: 0,
    rounded: true,
  })
})

Deno.test('parseSimpleArgs: slider values outside 0..1 and unknown flags are errors', () => {
  const r = parseSimpleArgs([
    '--width=25',
    '--height=50',
    '--length=1.5',
    '--straight=-1',
    '--w=10',
    '--runs=3',
    '--cell=8',
  ])
  assertEquals(r.errors, [
    '--length=1.5 is outside 0..1',
    '--straight=-1 is outside 0..1',
    'unknown flag --w (engine knobs, the report and the benchmark need --advanced)',
    'unknown flag --runs (engine knobs, the report and the benchmark need --advanced)',
    'unknown flag --cell (engine knobs, the report and the benchmark need --advanced)',
  ])
  assertEquals(parseSimpleArgs(['--width=x', '--height=50']).errors, ['--width=x is not a number'])
})

Deno.test('parseSimpleArgs: the one-board mode flags and --help pass through in rest', () => {
  const r = parseSimpleArgs([
    '--width=25',
    '--height=50',
    '--svg=out.svg',
    '--dry-run',
    '--help',
    '-h',
    '--svg',
    '--count=3',
    '--max-seeds=9',
  ])
  assertEquals(r.errors, [])
  assertEquals(r.rest, ['--svg=out.svg', '--dry-run', '--help', '-h', '--svg', '--count=3', '--max-seeds=9'])
})

Deno.test('buildSimpleCommand ↔ parseSimpleArgs: defaults give size and seed only, changes round-trip', () => {
  const d = { ...defaultChoice(), W: 25, H: 50, random: false }
  assertEquals(
    buildSimpleCommand(d, { ...DEFAULT_VIEW, cell: exportCell(25, 50) }),
    `${COMMAND_PREFIX} --width=25 --height=50 --seed=7`,
  )
  const c: SimpleChoice & { random: boolean } = {
    W: 100,
    H: 200,
    lengths: 0.25,
    shape: 0.2,
    skeleton: 'on',
    seed: 42,
    random: true,
  }
  const v = {
    cell: exportCell(100, 200),
    stroke: 0.4,
    headWidth: 0.8,
    headHeight: 1.2,
    colored: true,
    top: 0,
    rounded: true,
  }
  const cmd = buildSimpleCommand(c, v)
  assertEquals(
    cmd,
    `${COMMAND_PREFIX} --width=100 --height=200 --seed=42 --length=0.25 --straight=0.8 --skeleton --randomized --lineweight=0.4 --arrowwidth=0.8 --arrowheight=1.2 --colorized`,
  )
  const back = parseSimpleArgs(argvOf(cmd))
  assertEquals(back.errors, [])
  assertEquals(back.choice, c)
  assertEquals(back.view, v)
  assertEquals(back.rest, [])
})

Deno.test('--sharp round-trips through both dialects', () => {
  const advanced = parseArgs(['--sharp'])
  assertEquals(advanced.view.rounded, false)
  assertMatch(buildCommand(advanced.params, advanced.view), /--sharp\b/)
  const simple = parseSimpleArgs(['--width=10', '--height=10', '--sharp'])
  assertEquals(simple.view.rounded, false)
  assertMatch(buildSimpleCommand(simple.choice, simple.view), /--sharp\b/)
})

Deno.test('a rounded board prints no switch', () => {
  const r = parseArgs([])
  assertEquals(r.view.rounded, true)
  assert(!buildCommand(r.params, r.view).includes('--sharp'))
})
