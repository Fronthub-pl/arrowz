// The lab must mirror the CLI 1:1, so the command text has to parse back
// into the same parameters. One parser, one spelling per option: a word
// stands in for a sentinel number, --start writes the two knobs behind it,
// and a retired spelling is refused by name.
import { assert, assertEquals, assertMatch, assertNotEquals } from '@std/assert'
import { boardId, buildCommand, COMMAND_PREFIX, DEFAULT_VIEW, helpText, parseArgs } from './command.ts'
import { defaultChoice, exportCell, simpleParams } from './lab-simple.ts'
import { defaultParams, PARAM_SPEC, RULE_REASONS, RULES } from './engine.ts'
import type { Params } from './types.ts'

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
/** The size flags every call needs, so a test names only what it is about. */
const SIZE = ['--width=25', '--height=50']

// --- buildCommand -----------------------------------------------------------

Deno.test('buildCommand: default params give the size and the seed alone', () => {
  const p = { ...defaultParams(), W: 25, H: 50, seed: 7 }
  assertEquals(buildCommand(p), `${COMMAND_PREFIX} --width=25 --height=50 --seed=7`)
})

Deno.test('buildCommand <-> parseArgs: round trip for changed knobs and view', () => {
  const p = { ...defaultParams(), W: 100, H: 200, seed: 42, anticoil: 3, giants: 4, headBias: -1, wShort: 0.5 }
  const v = { cell: 7, stroke: 0.4, headWidth: 0.8, headHeight: 1.2, colored: true, top: 5, rounded: true }
  const cmd = buildCommand(p, v)
  assertMatch(cmd, /--anticoil=3 /)
  assertMatch(cmd, /--start=layers /)
  assert(!cmd.includes('--headbias'), cmd)
  assertMatch(cmd, / --cell=7 --line=0.4 --arrow-width=0.8 --arrow-height=1.2 --colored --top=5$/)
  // The cell the CLI would pick for this size is not worth printing.
  assertEquals(exportCell(100, 200), 8)
  assert(!buildCommand(p, { ...v, cell: 8 }).includes('--cell'), 'the size-derived cell stays out of the command')
  const back = parseArgs(argvOf(cmd))
  assertEquals(back.errors, [])
  for (const s of PARAM_SPEC) assertEquals(back.params[s.key], p[s.key], s.key)
  assertEquals(back.view, v)
  assertEquals(back.rest, [])
  assertEquals(back.pins, ['wShort', 'anticoil', 'headBias', 'mix', 'giants'])
})

// The width defaults to 0 (automatic) and the height to one cell (literal);
// neither is printed while it holds its default, and a height of 0 is a
// height the user asked for, so it is printed.
Deno.test('buildCommand: a head knob at its default adds no flag; a zero height is printed', () => {
  assertEquals(DEFAULT_VIEW.headWidth, 0)
  assertEquals(DEFAULT_VIEW.headHeight, 1)
  const p = { ...defaultParams(), W: 25, H: 50, seed: 7 }
  const base = `${COMMAND_PREFIX} --width=25 --height=50 --seed=7`
  assertEquals(buildCommand(p, { headWidth: 0, headHeight: 1 }), base)
  assertEquals(buildCommand(p, { headWidth: 0.6 }), `${base} --arrow-width=0.6`)
  assertEquals(buildCommand(p, { headHeight: 0 }), `${base} --arrow-height=0`)
})

// --- words instead of sentinel numbers ---------------------------------------

Deno.test('words are accepted and printed back', () => {
  const { params } = parseArgs([...SIZE, '--lmax=auto', '--maxback=auto', '--giantstep=random'])
  assertEquals(params.Lmax, 0)
  assertEquals(params.maxBack, 0)
  assertEquals(params.giantStep, 0)
  const text = buildCommand({ ...params, Lmax: 0, giantStep: 0 }, DEFAULT_VIEW)
  assert(!/--lmax=0\b/.test(text), text)
  assert(/--giantstep=random/.test(text), text)
})

Deno.test('a bare sentinel number is accepted on input just as its word is', () => {
  assertEquals(parseArgs([...SIZE, '--giantstep=0']).params.giantStep, 0)
  assertEquals(parseArgs([...SIZE, '--lmax=0']).params.Lmax, 0)
})

Deno.test('--start writes both stored knobs', () => {
  const cases: [string, number, number][] = [
    ['layers', -1, -1],
    ['random', 0, -1],
    ['tunnels', 1, -1],
    ['0.5', 0, 0.5],
  ]
  for (const [word, headBias, mix] of cases) {
    const { params } = parseArgs([...SIZE, `--start=${word}`])
    assertEquals([params.headBias, params.mix], [headBias, mix], word)
  }
  assert(/--start=tunnels/.test(buildCommand(parseArgs([...SIZE, '--start=tunnels']).params)))
  assert(/--start=0.5/.test(buildCommand(parseArgs([...SIZE, '--start=0.5']).params)))
  // The hole of the mix range is refused: only -1 (a word) or 0.3..0.7.
  assert(parseArgs([...SIZE, '--start=0.1']).errors.some((e) => e.includes('0.3..0.7')))
  assert(parseArgs([...SIZE, '--start=nowhere']).errors.some((e) => e.includes('--start')))
})

Deno.test('--giantspacing spells 1 as off', () => {
  assertEquals(parseArgs(['--width=9', '--height=9', '--giantspacing=off']).params.giantSpacing, 1)
  assert(/--giantspacing=off/.test(buildCommand({ ...defaultParams(), giantSpacing: 1 })))
})

// --- the everyday flags -------------------------------------------------------

Deno.test('parseArgs: width and height are required, everything else defaults to the lab choice', () => {
  const r = parseArgs(SIZE)
  assertEquals(r.errors, [])
  assertEquals(r.choice, { ...defaultChoice(), W: 25, H: 50, random: false })
  assertEquals(r.params, simpleParams(r.choice))
  assertEquals(r.view, { ...DEFAULT_VIEW, cell: exportCell(25, 50) })
  assertEquals(r.pins, [])
  assertEquals(r.rest, [])
  assertEquals(parseArgs([]).errors, ['missing --width', 'missing --height'])
  assertEquals(parseArgs(['--width=25']).errors, ['missing --height'])
})

// The one flag that used to mean two things. --straight read the slider from
// its straight end and inverted it; --winding IS the slider, so 0 is the
// straightest board and nothing is inverted on the way in.
Deno.test('parseArgs: --winding is the shape slider itself, with no inversion', () => {
  const r = parseArgs([...SIZE, '--length=0.25', '--winding=0.8', '--seed=3', '--skeleton', '--randomized'])
  assertEquals(r.errors, [])
  assertEquals(r.choice, { W: 25, H: 50, lengths: 0.25, shape: 0.8, skeleton: 'on', seed: 3, random: true })
  assertEquals(parseArgs([...SIZE, '--winding=0']).choice.shape, 0)
  assertEquals(parseArgs([...SIZE, '--winding=1']).choice.shape, 1)
  // 0 is the straightest end of the slider: the highest straightness bias.
  assertEquals(parseArgs([...SIZE, '--winding=0']).params.pStraight, 1)
  assertEquals(parseArgs([...SIZE, '--winding=1']).params.pStraight, 0.65)
})

Deno.test('parseArgs: the picture flags are hyphenated and carry the CLI names', () => {
  const r = parseArgs([
    '--width=40',
    '--height=40',
    '--colored',
    '--line=0.3',
    '--arrow-width=0.8',
    '--arrow-height=1.2',
    '--top=4',
    '--sharp',
  ])
  assertEquals(r.errors, [])
  assertEquals(r.view, {
    cell: exportCell(40, 40),
    stroke: 0.3,
    headWidth: 0.8,
    headHeight: 1.2,
    colored: true,
    top: 4,
    rounded: false,
  })
  // --cell wins over the size-derived default, and --arrow-width takes the word.
  assertEquals(parseArgs([...SIZE, '--cell=7']).view.cell, 7)
  assertEquals(parseArgs([...SIZE, '--arrow-width=auto']).view.headWidth, 0)
})

Deno.test('parseArgs: slider values outside 0..1 and values that are not numbers are errors', () => {
  const r = parseArgs([...SIZE, '--length=1.5', '--winding=-1'])
  assertEquals(r.errors, ['--length=1.5 is outside 0..1', '--winding=-1 is outside 0..1'])
  assertEquals(parseArgs(['--width=x', '--height=50']).errors, ['--width=x is not a number'])
  assert(parseArgs([...SIZE, '--lmax=x']).errors.some((e) => e.includes('auto')), 'the word is offered by name')
})

Deno.test('parseArgs: the mode flags pass through in rest, untouched', () => {
  const r = parseArgs([...SIZE, '--svg=out.svg', '--dry-run', '--help', '-h', '--svg', '--count=3', '--max-seeds=9'])
  assertEquals(r.errors, [])
  assertEquals(r.rest, ['--svg=out.svg', '--dry-run', '--help', '-h', '--svg', '--count=3', '--max-seeds=9'])
  assertEquals(parseArgs(['--help=knobs']).rest, ['--help=knobs'])
})

// --- pins ----------------------------------------------------------------------

Deno.test('a knob on the command line is reported as a pin, an everyday flag is not', () => {
  const { pins } = parseArgs([...SIZE, '--winding=0.4', '--pstraight=0.9', '--restarts=5'])
  assertEquals(pins, ['pStraight', 'restarts'])
})

Deno.test('a pin is written over the bundle the everyday flag drew, and nothing else moves', () => {
  const plain = parseArgs([...SIZE, '--winding=0.4'])
  const pinned = parseArgs([...SIZE, '--winding=0.4', '--pstraight=0.93'])
  assertEquals(pinned.params.pStraight, 0.93)
  for (const s of PARAM_SPEC) {
    if (s.key === 'pStraight') continue
    assertEquals(pinned.params[s.key], plain.params[s.key], s.key)
  }
  // --start pins both knobs behind it, so a randomised run cannot redraw them.
  assertEquals(parseArgs([...SIZE, '--start=tunnels']).pins, ['headBias', 'mix'])
})

Deno.test('parseArgs stays pure: it never draws, whatever --randomized says', () => {
  const argv = [...SIZE, '--randomized', '--winding=0.4']
  assertEquals(parseArgs(argv).params, parseArgs(argv).params)
  assertEquals(parseArgs(argv).params, simpleParams(parseArgs(argv).choice))
})

// --- refusals ------------------------------------------------------------------

Deno.test('retired spellings name their replacement, and unknown flags are refused', () => {
  const { errors } = parseArgs([...SIZE, '--stroke=0.4', '--advanced', '--board', '--nope=1'])
  assert(errors.some((e) => e.includes('--stroke') && e.includes('--line')), errors.join('; '))
  assert(errors.some((e) => e.includes('--advanced')), errors.join('; '))
  assert(errors.some((e) => e.includes('--board')), errors.join('; '))
  assert(errors.some((e) => e.includes('--nope')), errors.join('; '))
})

Deno.test('every retired spelling of a knob names the flag that replaced it', () => {
  const retired: [string, string][] = [['--straight=1', '--winding'], ['--w=10', '--width'], [
    '--headbias=1',
    '--start',
  ]]
  for (const [flag, replacement] of retired) {
    const { errors } = parseArgs([...SIZE, flag])
    assert(errors.some((e) => e.includes(replacement)), `${flag}: ${errors.join('; ')}`)
  }
})

// --- --help ----------------------------------------------------------------------

Deno.test('--help is short, --help=knobs lists every knob flag once', () => {
  const short = helpText()
  assert(!short.includes('--pstraight'), 'the short help does not list knobs')
  const knobs = helpText({ knobs: true })
  for (const s of PARAM_SPEC) {
    if (s.surface === 'start') continue
    assert(knobs.includes(`--${s.key.toLowerCase()}`), `${s.key} missing from --help=knobs`)
  }
  assert(knobs.includes('--start='), 'the merged control is listed')
  assert(!knobs.includes('--headbias'), 'a surface knob has no flag of its own')
})

Deno.test('helpText: both texts name the everyday flags, the modes and the environment', () => {
  for (const text of [helpText(), helpText({ knobs: true })]) {
    for (const f of ['--width=N', '--height=N', '--length=', '--winding=', '--skeleton', '--randomized']) {
      assert(text.includes(f), `${f} missing`)
    }
    for (const f of ['--svg[=path]', '--dry-run', '--count=N', '--max-seeds=M', '--help=knobs']) {
      assert(text.includes(f), `${f} missing`)
    }
    assertMatch(text, new RegExp(`^Usage: ${prefixRe} --width=N --height=N`))
    assert(text.includes('CARVE_TIMEOUT_S'), 'the time budget is documented with the other variables')
    assert(!text.includes('—'), 'no em dashes in the help text')
    assert(!text.includes('--advanced'), 'there is one mode now')
  }
})

Deno.test('helpText: the knob table carries every rule and says what pinning costs', () => {
  const text = helpText({ knobs: true })
  for (const r of RULES) assert(text.includes(r.key), `rule key ${r.key} missing`)
  for (const reason of Object.values(RULE_REASONS)) assert(text.includes(reason), `rule text missing: ${reason}`)
  // The rows sit below the header; the everyday list above it names --width too.
  const lines = text.split('\n')
  const header = lines.findIndex((l) => l.trimStart().startsWith('flag '))
  assert(header > 0, 'the knob table has a header row')
  const table = lines.slice(header)
  for (const s of PARAM_SPEC) {
    if (s.surface === 'start') continue
    // The size keeps its everyday spelling in the table: --w and --h are retired.
    const flag = s.key === 'W' ? '--width' : s.key === 'H' ? '--height' : `--${s.key.toLowerCase()}`
    const row = table.find((l) => l.trimStart().startsWith(`${flag}=`))
    assert(row, `no row for ${s.key}`)
    assert(row.includes(s.label), `${s.key}: label missing`)
    assert(row.includes(`${s.min}..${s.max}`), `${s.key}: range missing`)
    assert(row.endsWith(s.help), `${s.key}: help missing`)
  }
  assert(text.includes('pinned'), 'the knob table says what a pin costs')
})

// --- boardId -------------------------------------------------------------------

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

Deno.test('--sharp round-trips, and a rounded board prints no switch', () => {
  const sharp = parseArgs([...SIZE, '--sharp'])
  assertEquals(sharp.view.rounded, false)
  assertMatch(buildCommand(sharp.params, sharp.view), /--sharp\b/)
  const round = parseArgs(SIZE)
  assertEquals(round.view.rounded, true)
  assert(!buildCommand(round.params, round.view).includes('--sharp'))
})
