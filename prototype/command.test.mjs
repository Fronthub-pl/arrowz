// The lab must mirror the CLI 1:1, so the command text has to parse back
// into the same parameters.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCommand, parseArgs, boardId, helpText, ALIASES, DEFAULT_VIEW, parseSimpleArgs, buildSimpleCommand } from './command.mjs'
import { defaultChoice, exportCell } from './lab-simple.mjs'
import { defaultParams, PARAM_SPEC, RULES, RULE_REASONS } from './engine.mjs'

const argvOf = (cmd) => cmd.split(' ').slice(2)   // drop "node prototype/carve.mjs"

test('buildCommand: default params give only size, seed, --svg and --cell', () => {
  const p = { ...defaultParams(), W: 25, H: 50, seed: 7 }
  assert.equal(buildCommand(p), 'node prototype/carve.mjs --advanced --svg --w=25 --h=50 --seed=7 --cell=12')
})

test('buildCommand ↔ parseArgs: round trip for changed knobs and view', () => {
  const p = { ...defaultParams(), W: 100, H: 200, seed: 42, anticoil: 3, giants: 4, headBias: -1, wShort: 0.5 }
  const v = { cell: 8, stroke: 0.4, headWidth: 0.8, headHeight: 1.2, colored: true, top: 5 }
  const cmd = buildCommand(p, v)
  assert.match(cmd, /--anticoil=3 /)
  assert.match(cmd, /--headbias=-1 /)
  assert.match(cmd, / --stroke=0.4 --headwidth=0.8 --headheight=1.2 --colored --top=5$/)
  const back = parseArgs(argvOf(cmd))
  for (const s of PARAM_SPEC) assert.equal(back.params[s.key], p[s.key], s.key)
  assert.deepEqual(back.view, v)
  assert.deepEqual(back.rest, ['--advanced', '--svg'])
})

// The head knobs default to 0 (automatic size) and stay out of the command then.
test('buildCommand: automatic head size adds no flag; DEFAULT_VIEW carries the zeros', () => {
  assert.equal(DEFAULT_VIEW.headWidth, 0)
  assert.equal(DEFAULT_VIEW.headHeight, 0)
  const p = { ...defaultParams(), W: 25, H: 50, seed: 7 }
  assert.equal(buildCommand(p, { headWidth: 0, headHeight: 0 }), 'node prototype/carve.mjs --advanced --svg --w=25 --h=50 --seed=7 --cell=12')
  assert.equal(buildCommand(p, { headWidth: 0.6 }), 'node prototype/carve.mjs --advanced --svg --w=25 --h=50 --seed=7 --cell=12 --headwidth=0.6')
})

test('parseArgs: old flag names are aliases, unknown flags go to rest', () => {
  const r = parseArgs(['--straight=0.6', '--lateral=6', '--absorb=0', '--giantspacepen=12', '--runs=3', '--show'])
  assert.equal(r.params.pStraight, 0.6)
  assert.equal(r.params.wLateral, 6)
  assert.equal(r.params.absorbLimit, 0)
  assert.equal(r.params.giantSpacePenalty, 12)
  assert.deepEqual(r.rest, ['--runs=3', '--show'])
  assert.deepEqual(r.view, DEFAULT_VIEW)
})

test('boardId: stable, ignores view and key order, distinguishes seeds', () => {
  const p = { ...defaultParams(), W: 25, H: 50, seed: 7 }
  const id = boardId(p)
  assert.match(id, /^seed7-[0-9a-f]{8}$/)
  const reordered = Object.fromEntries(Object.entries(p).reverse())
  assert.equal(boardId(reordered), id)
  assert.equal(boardId({ ...p, cell: 99, colored: true }), id)
  assert.notEqual(boardId({ ...p, seed: 8 }), id)
  assert.notEqual(boardId({ ...p, anticoil: 1 }), id)
})

// --- --help and the parser/validator split ----------------------------------

test('helpText: one row per knob with flag, range, step, default and help', () => {
  const text = helpText()
  const lines = text.split('\n')
  for (const s of PARAM_SPEC) {
    const flag = `--${s.key.toLowerCase()}`
    const row = lines.find((l) => l.startsWith(`  ${flag} `))
    assert.ok(row, `no row for ${flag}`)
    assert.ok(row.includes(s.label), `${flag}: label missing`)
    assert.ok(row.includes(`${s.min}..${s.max}`), `${flag}: range missing`)
    assert.ok(row.includes(` ${s.step} `), `${flag}: step missing`)
    assert.ok(row.includes(` ${s.def} `), `${flag}: default missing`)
    assert.ok(row.endsWith(s.help), `${flag}: help missing`)
  }
})

test('helpText: every rule key and text, every alias, every mode flag', () => {
  const text = helpText()
  for (const r of RULES) assert.ok(text.includes(r.key), `rule key ${r.key} missing`)
  for (const reason of Object.values(RULE_REASONS)) assert.ok(text.includes(reason), `rule text missing: ${reason}`)
  for (const [alias, key] of Object.entries(ALIASES)) {
    assert.match(text, new RegExp(`--${alias}\\s+same as --${key.toLowerCase()}`), `alias --${alias}`)
  }
  for (const flag of ['--svg[=path]', '--dry-run', '--bench=N', '--runs=N', '--only=<level>', '--mid=N', '--square', '--portrait', '--show', '--help', '-h', '--cell=N', '--stroke=R', '--headwidth=R', '--headheight=R', '--colored', '--top=N']) {
    assert.ok(text.includes(flag), `mode flag ${flag} missing`)
  }
  assert.match(text, /^Usage: node prototype\/carve\.mjs /)
  assert.ok(!text.includes('\u2014'), 'no em dashes in the help text')
})

test('parseArgs only parses: out-of-range values and broken rules pass through untouched', () => {
  const r = parseArgs(['--pstraight=0.3', '--lmax=3', '--warns=0', '--wshort=0.6', '--wmid=0.6'])
  assert.equal(r.params.pStraight, 0.3)
  assert.equal(r.params.Lmax, 3)
  assert.equal(r.params.warns, 0)
  assert.equal(r.params.wShort + r.params.wMid, 1.2)
  assert.deepEqual(r.rest, [])
  // --help and -h are not engine parameters: they land in rest for carve.mjs
  assert.deepEqual(parseArgs(['--help', '-h']).rest, ['--help', '-h'])
})

// --- the simple mode (no --advanced) ----------------------------------------
// The CLI takes the same inputs as the simple lab view: a size, two slider
// positions in 0..1, a skeleton switch, a seed, the view and a randomise flag.

test('parseSimpleArgs: width and height are required, everything else defaults to the lab choice', () => {
  const r = parseSimpleArgs(['--width=25', '--height=50'])
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.choice, { ...defaultChoice(), W: 25, H: 50, random: false })
  assert.deepEqual(r.view, { ...DEFAULT_VIEW, cell: exportCell(25, 50) })
  assert.deepEqual(r.rest, [])
  assert.deepEqual(parseSimpleArgs([]).errors, ['missing --width', 'missing --height'])
  assert.deepEqual(parseSimpleArgs(['--width=25']).errors, ['missing --height'])
})

test('parseSimpleArgs: --straight is the shape slider read from the straight end', () => {
  const r = parseSimpleArgs(['--width=25', '--height=50', '--length=0.25', '--straight=0.8', '--seed=3', '--skeleton', '--randomized'])
  assert.deepEqual(r.errors, [])
  assert.equal(r.choice.lengths, 0.25)
  assert.equal(r.choice.shape, 0.2, '1 - straight, without float noise')
  assert.equal(r.choice.skeleton, 'on')
  assert.equal(r.choice.seed, 3)
  assert.equal(r.choice.random, true)
  assert.equal(parseSimpleArgs(['--width=25', '--height=50', '--straight=1']).choice.shape, 0)
  assert.equal(parseSimpleArgs(['--width=25', '--height=50', '--straight=0']).choice.shape, 1)
})

test('parseSimpleArgs: the view flags carry the lab names', () => {
  const r = parseSimpleArgs(['--width=40', '--height=40', '--colorized', '--lineweight=0.3', '--arrowwidth=0.8', '--arrowheight=1.2'])
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.view, { cell: exportCell(40, 40), stroke: 0.3, headWidth: 0.8, headHeight: 1.2, colored: true, top: 0 })
})

test('parseSimpleArgs: slider values outside 0..1 and unknown flags are errors', () => {
  const r = parseSimpleArgs(['--width=25', '--height=50', '--length=1.5', '--straight=-1', '--w=10', '--runs=3', '--cell=8'])
  assert.deepEqual(r.errors, [
    '--length=1.5 is outside 0..1',
    '--straight=-1 is outside 0..1',
    'unknown flag --w (engine knobs, the report and the benchmark need --advanced)',
    'unknown flag --runs (engine knobs, the report and the benchmark need --advanced)',
    'unknown flag --cell (engine knobs, the report and the benchmark need --advanced)',
  ])
  assert.deepEqual(parseSimpleArgs(['--width=x', '--height=50']).errors, ['--width=x is not a number'])
})

test('parseSimpleArgs: the one-board mode flags and --help pass through in rest', () => {
  const r = parseSimpleArgs(['--width=25', '--height=50', '--svg=out.svg', '--dry-run', '--help', '-h', '--svg'])
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.rest, ['--svg=out.svg', '--dry-run', '--help', '-h', '--svg'])
})

test('buildSimpleCommand ↔ parseSimpleArgs: defaults give size and seed only, changes round-trip', () => {
  const d = { ...defaultChoice(), W: 25, H: 50, random: false }
  assert.equal(buildSimpleCommand(d, { ...DEFAULT_VIEW, cell: exportCell(25, 50) }), 'node prototype/carve.mjs --width=25 --height=50 --seed=7')
  const c = { W: 100, H: 200, lengths: 0.25, shape: 0.2, skeleton: 'on', seed: 42, random: true }
  const v = { cell: exportCell(100, 200), stroke: 0.4, headWidth: 0.8, headHeight: 1.2, colored: true, top: 0 }
  const cmd = buildSimpleCommand(c, v)
  assert.equal(cmd, 'node prototype/carve.mjs --width=100 --height=200 --seed=42 --length=0.25 --straight=0.8 --skeleton --randomized --lineweight=0.4 --arrowwidth=0.8 --arrowheight=1.2 --colorized')
  const back = parseSimpleArgs(argvOf(cmd))
  assert.deepEqual(back.errors, [])
  assert.deepEqual(back.choice, c)
  assert.deepEqual(back.view, v)
  assert.deepEqual(back.rest, [])
})
