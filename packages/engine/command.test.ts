// The lab must mirror the CLI 1:1, so the command text has to parse back
// into the same parameters. One parser, one spelling per option: a word
// stands in for a sentinel number, --start writes the two knobs behind it,
// and a retired spelling is refused by name.
import { assert, assertEquals, assertMatch, assertNotEquals } from '@std/assert'
import {
  boardId,
  buildCommand,
  COMMAND_PREFIX,
  DEFAULT_VIEW,
  helpText,
  knobFlag,
  parseArgs,
  START,
  VIEW_FLAG,
  VIEW_RANGE,
  wordFor,
} from './command.ts'
import { defaultChoice, exportCell, simpleParams } from './lab-simple.ts'
import { defaultParams, PARAM_SPEC, RULE_REASONS, RULES, validateParams } from './engine.ts'
import type { Params, ViewNumber } from './types.ts'

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
/** The defaults with one knob set by key, for the envelope checks of the help table. */
function withKnob(key: keyof Params, value: number): Params {
  const p = defaultParams()
  p[key] = value
  return p
}

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
  // The flag itself, not the command: a knob at its default is left out of the
  // command altogether, so "the command has no --lmax=0 in it" could never go
  // red. knobFlag is the one place a word is chosen.
  assertEquals(knobFlag(params, 'Lmax'), '--lmax=auto')
  assertEquals(knobFlag(params, 'maxBack'), '--maxback=auto')
  assertEquals(knobFlag(params, 'giantStep'), '--giantstep=random')
  const text = buildCommand({ ...params, Lmax: 0, giantStep: 0 }, DEFAULT_VIEW)
  assert(/--giantstep=random/.test(text), text)
})

// The parser's own table: a consumer that could rewrite it would change what
// every --start on the machine means, in the lab and in the CLI alike.
Deno.test("START is read-only: the words and the share range are the parser's own", () => {
  assertEquals(Object.keys(START.words), ['layers', 'random', 'tunnels'])
  assertEquals([START.mix.min, START.mix.max], [0.3, 0.7])
})

// The lab shows the word beside the field, so it asks for it by value rather
// than keeping a second table of its own.
Deno.test('wordFor: the word a value is spelled with, and nothing where there is none', () => {
  assertEquals(wordFor('Lmax', 0), 'auto')
  assertEquals(wordFor('Lmax', 12), null)
  assertEquals(wordFor('maxBack', 0), 'auto')
  assertEquals(wordFor('giantStep', 0), 'random')
  assertEquals(wordFor('giantSpacing', 1), 'off')
  assertEquals(wordFor('giantSpacing', 2), null)
  assertEquals(wordFor('pStraight', 0.85), null)
})

// The lab builds a `choice` control straight from PARAM_SPEC and prints its
// command with this module, so every choice must be a value the flag takes.
Deno.test('every fixed-choice knob offers values its flag accepts', () => {
  let checked = 0
  for (const s of PARAM_SPEC) {
    if (s.control?.kind !== 'choice') continue
    for (const c of s.control.choices) {
      checked++
      assertEquals(c.word, wordFor(s.key, c.value) ?? String(c.value), `${s.key}=${c.value}`)
      assert(c.value >= s.min && c.value <= s.max, `${s.key}=${c.value} is outside ${s.min}..${s.max}`)
      const flag = `--${s.key.toLowerCase()}=${c.word}`
      const { params, errors } = parseArgs([...SIZE, flag])
      assertEquals(errors, [], flag)
      assertEquals(params[s.key], c.value, flag)
    }
  }
  assert(checked > 0, 'at least one knob is drawn as a list of values')
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
    // Every spelling of the flag writes a pair the envelope accepts: the rule
    // over the two knobs and the flag say the same thing.
    assertEquals(validateParams(params), [], `--start=${word}`)
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

// The size is a knob (it is stored and hashed), but it arrives as an everyday
// flag, and normalizeChoice rounds and clamps it for the lab's sake. So the
// parser has to refuse what that clamp would otherwise swallow: --width=2000
// used to give a 1000-wide board and exit 0, while --seed=1.5 was refused.
// Every dictionary the command line indexes is a plain object literal, so a
// name off Object.prototype read back as a value: --start=constructor pinned
// the pair --start=random spells and carved the default board with exit 0,
// --lmax=constructor pinned a native function as a knob value, and
// --constructor was answered as a retired flag whose replacement text was that
// function. A key that came from the command line must reach an own property
// of the dictionary or nothing at all.
Deno.test('a name off Object.prototype is not a word, not a knob value and not a retired flag', () => {
  const freeLmax = parseArgs(SIZE).params.Lmax
  for (const name of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
    const start = parseArgs([...SIZE, `--start=${name}`])
    assertEquals(start.pins, [], `--start=${name} pinned ${start.pins.join(', ')}`)
    assert(start.errors.some((e) => e.includes(`--start=${name}`)), `--start=${name}: ${start.errors.join('; ')}`)

    const knob = parseArgs([...SIZE, `--lmax=${name}`])
    assertEquals(knob.pins, [], `--lmax=${name} pinned ${knob.pins.join(', ')}`)
    assertEquals(knob.params.Lmax, freeLmax, `--lmax=${name} moved the knob`)
    assert(
      knob.errors.some((e) => e.includes(`--lmax=${name}`) && e.includes('not a number')),
      `--lmax=${name}: ${knob.errors.join('; ')}`,
    )

    // The parser lowercases a flag name, so this is the spelling it saw.
    const flag = parseArgs([...SIZE, `--${name}=1`])
    assert(
      flag.errors.some((e) => e === `unknown flag --${name.toLowerCase()}; see --help`),
      `--${name}: ${flag.errors.join('; ')}`,
    )
  }
})

// The picture flags took anything: --cell=-5 and --top=-1 passed without a
// word, and a negative cell is an SVG with a negative viewBox. Each has a
// range now, wide enough for every picture README shows.
Deno.test('parseArgs: every picture number is bounded, at both ends', () => {
  for (const [field, r] of Object.entries(VIEW_RANGE)) {
    const flag = VIEW_FLAG[field as ViewNumber]
    for (const value of [r.min, r.max]) {
      const { errors, view } = parseArgs([...SIZE, `--${flag}=${value}`])
      assertEquals(errors, [], `--${flag}=${value}`)
      assertEquals(view[field as ViewNumber], value, `--${flag}=${value}`)
    }
    for (const value of [r.min - 1, r.max + 1]) {
      const { errors } = parseArgs([...SIZE, `--${flag}=${value}`])
      assertEquals(errors, [`--${flag}=${value} is outside ${r.min}..${r.max}`], `--${flag}=${value}`)
    }
  }
})

Deno.test('parseArgs: the two picture numbers counted in whole units refuse a fraction', () => {
  assertEquals(parseArgs([...SIZE, '--cell=12.5']).errors, ['--cell=12.5 is not a whole number'])
  assertEquals(parseArgs([...SIZE, '--top=2.5']).errors, ['--top=2.5 is not a whole number'])
  // The ratios are ratios: a fraction is the point of them.
  assertEquals(parseArgs([...SIZE, '--line=0.55', '--arrow-height=0.75']).errors, [])
  // auto is still the fifth word of the legend, and it is inside the range.
  assertEquals(parseArgs([...SIZE, '--arrow-width=auto']).view.headWidth, DEFAULT_VIEW.headWidth)
})

Deno.test('parseArgs: the size takes whole numbers inside its own range', () => {
  assertEquals(parseArgs(['--width=2000', '--height=50']).errors, ['--width=2000 is outside 4..1000'])
  assertEquals(parseArgs(['--width=3', '--height=50']).errors, ['--width=3 is outside 4..1000'])
  assertEquals(parseArgs(['--width=25.5', '--height=50']).errors, ['--width=25.5 is not a whole number'])
  assertEquals(parseArgs(['--width=25', '--height=0']).errors, ['--height=0 is outside 4..1000'])
  assertEquals(parseArgs(['--width=25', '--height=50.5']).errors, ['--height=50.5 is not a whole number'])
  // The bounds themselves are accepted, and the board is the size that was asked for.
  assertEquals(parseArgs(['--width=4', '--height=1000']).errors, [])
  assertEquals(parseArgs(['--width=4', '--height=1000']).params.H, 1000)
})

// A switch is on or off; a value on one used to turn it ON, so --skeleton=off
// asked for a skeleton. A bare word used to land in the mode list and be read
// by nobody. Both contradict "an unknown flag is refused".
Deno.test('parseArgs: a switch takes no value, and a stray word is not an argument', () => {
  for (const flag of ['--skeleton=off', '--randomized=false', '--sharp=no', '--colored=0']) {
    assertEquals(parseArgs([...SIZE, flag]).errors, [`${flag} takes no value`], flag)
  }
  assertEquals(parseArgs([...SIZE, '--skeleton=off']).choice.skeleton, 'off')
  assertEquals(parseArgs([...SIZE, 'board.json']).errors, ['unexpected argument: board.json'])
  assertEquals(parseArgs([...SIZE, 'board.json']).rest, [], 'a stray word is not a mode flag')
  // -h is the one flag written with a single dash, and it still passes through.
  assertEquals(parseArgs([...SIZE, '-h']).errors, [])
  assertEquals(parseArgs([...SIZE, '-h']).rest, ['-h'])
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

// Two ways of counting one table drifted apart once: the short help promised
// 19 knob flags where --help=knobs printed 25 rows.
Deno.test('--help: "and N more" counts the rows --help=knobs prints', () => {
  const lines = helpText({ knobs: true }).split('\n')
  const header = lines.findIndex((l) => l.trimStart().startsWith('flag '))
  assert(header > 0, 'the knob table has a header row')
  const rows = lines.slice(header + 1, lines.indexOf('', header)).filter((l) => l.trimStart().startsWith('--'))
  const short = helpText()
  const named = ['--lmax=', '--start=', '--restarts=']
  for (const f of named) assert(short.includes(f), `${f} is named in the short help`)
  const more = /and (\d+) more/.exec(short)
  assert(more, short)
  assertEquals(Number(more[1]), rows.length - named.length, 'the short help promises the table it points at')
})

// Five words, one of them the view's: --arrow-width is not a knob, so it
// cannot live in the knob table, and the legend is where the two meet.
Deno.test('helpText: the legend spells every word the parser takes, the view one included', () => {
  const text = helpText({ knobs: true })
  const legend = ['--lmax=auto is 0', '--maxback=auto is 0', '--giantstep=random is 0', '--giantspacing=off is 1']
  for (const entry of [...legend, '--arrow-width=auto is 0']) assert(text.includes(entry), `legend missing: ${entry}`)
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

/**
 * The values a knob row prints for its flag: the text between the '=' and the
 * column padding. Read from the knob table alone — the everyday list above it
 * prints --width=N, which is a placeholder and not a range.
 */
function rangeOf(text: string, flag: string): string {
  const lines = text.split('\n')
  const header = lines.findIndex((l) => l.trimStart().startsWith('flag '))
  assert(header > 0, 'the knob table has a header row')
  const row = lines.slice(header + 1).map((l) => l.trimStart()).find((l) => l.startsWith(`${flag}=`))
  assert(row, `no row for ${flag}`)
  const value = row.slice(flag.length + 1).split(/\s{2,}/)[0]
  assert(value, `no range for ${flag}`)
  return value.trim()
}

// The table used to join the words to the raw bounds, so it offered values the
// tool refuses: --lmax=auto|0..5000 (0 is what `auto` spells, and 1..5 break
// the lmaxHole rule), --maxback=auto|0..1000, --giantstep=random|0..40, and
// --giantspacing=off|1..3 where the flag takes off|2|3.
Deno.test('helpText: a knob row prints the values its flag really takes', () => {
  const text = helpText({ knobs: true })
  assertEquals(rangeOf(text, '--lmax'), 'auto|6..5000')
  assertEquals(rangeOf(text, '--maxback'), 'auto|50..1000')
  assertEquals(rangeOf(text, '--giantstep'), 'random|1..40')
  assertEquals(rangeOf(text, '--giantspacing'), 'off|2|3')
  // The short help names the same range as the table it points at.
  assert(helpText().includes('--lmax=auto|6..5000'), helpText())
})

// Spec §8: the table is where a flag gets copied from, so a row nobody can
// type is a bug in the row.
Deno.test('helpText: every flag --help=knobs prints parses with the first value it offers', () => {
  const text = helpText({ knobs: true })
  const lines = text.split('\n')
  const header = lines.findIndex((l) => l.trimStart().startsWith('flag '))
  assert(header > 0, 'the knob table has a header row')
  const rows = lines.slice(header + 1, lines.indexOf('', header)).filter((l) => l.trimStart().startsWith('--'))
  assertEquals(rows.length, PARAM_SPEC.filter((s) => s.surface !== 'start').length + 1, 'one row per knob flag')
  for (const row of rows) {
    const m = /^(--[a-z-]+)=(\S+)/.exec(row.trimStart())
    assert(m, `no flag in row: ${row}`)
    const [, flag, range] = m
    assert(flag && range, row)
    // The first value the range offers: a word, or the bottom of the numbers.
    const first = range.split('|')[0] ?? ''
    const value = first.includes('..') ? first.split('..')[0] : first
    const { errors, params } = parseArgs([...SIZE, `${flag}=${value}`])
    assertEquals(errors, [], `${flag}=${value}`)
    assertEquals(validateParams(params), [], `${flag}=${value} parses into a set the envelope refuses`)
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
    assert(row.endsWith(s.help), `${s.key}: help missing`)
    // The printed range is checked against the rules, not against the raw
    // bounds: the bottom it prints is a value the tool takes, and the step
    // below it is not (it is under the minimum, spelled by a word, or refused).
    const printed = rangeOf(text, flag)
    if (s.control?.kind === 'choice') {
      assertEquals(printed, s.control.choices.map((c) => c.word).join('|'), `${s.key}: the choices themselves`)
      continue
    }
    const numeric = printed.split('|').at(-1) ?? ''
    const [loText, maxText] = numeric.split('..')
    assertEquals(Number(maxText), s.max, `${s.key}: the top of the printed range`)
    const lo = Number(loText)
    assertEquals(validateParams(withKnob(s.key, lo)), [], `${s.key}=${lo} is printed but refused`)
    const below = Number((lo - s.step).toFixed(6))
    const shut = below < s.min || wordFor(s.key, below) !== null || validateParams(withKnob(s.key, below)).length > 0
    assert(shut, `${s.key}: ${below} is legal, so the range starts too high at ${lo}`)
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
