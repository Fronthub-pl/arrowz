// The lab must mirror the CLI 1:1: the command from the lab has to give the
// same board as the worker. We generate through generate() and through
// carve.mjs in a child process and compare the SVG byte for byte.
// --dry-run is tested the same way: the board store points at a temporary
// directory, which must stay empty.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generate, toSvg, defaultParams, fingerprint, validateParams, formatViolation } from './engine.mjs'
import { buildCommand, buildSimpleCommand, boardId, DEFAULT_VIEW } from './command.mjs'
import { defaultChoice, simpleParams, simpleRanges, exportCell } from './lab-simple.mjs'

const here = dirname(fileURLToPath(import.meta.url))

test('carve.mjs --advanced --svg reproduces the generate() board byte for byte', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arrowz-cli-'))
  const params = { ...defaultParams(), W: 25, H: 50, seed: 7, anticoil: 3, giants: 2 }
  const view = { cell: 10, stroke: 0.5, colored: true, top: 3 }
  const expected = toSvg(generate(params).board, { cell: 10, colored: true, strokeRatio: 0.5, top: 3 })

  const cmd = buildCommand(params, view)          // "node prototype/carve.mjs --svg …"
  const argv = cmd.split(' ').slice(2)
  const out = execFileSync('node', [join(here, 'carve.mjs'), ...argv], {
    cwd: dirname(here), env: { ...process.env, ARROWZ_BOARDS_DIR: dir }, encoding: 'utf8',
  })
  const id = boardId(params)
  assert.match(out, new RegExp(`25x50/${id}\\.svg`))
  assert.equal(readFileSync(join(dir, '25x50', `${id}.svg`), 'utf8'), expected)
  const meta = JSON.parse(readFileSync(join(dir, '25x50', `${id}.json`), 'utf8'))
  assert.equal(meta.command, cmd)
  assert.equal(meta.source, 'cli')
})

test('carve.mjs --svg=path also writes a copy at the path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arrowz-cli-'))
  const copy = join(dir, 'copy.svg')
  execFileSync('node', [join(here, 'carve.mjs'), '--advanced', `--svg=${copy}`, '--w=10', '--h=10', '--seed=3'], {
    cwd: dirname(here), env: { ...process.env, ARROWZ_BOARDS_DIR: dir }, encoding: 'utf8',
  })
  const id = boardId({ ...defaultParams(), W: 10, H: 10, seed: 3 })
  assert.equal(readFileSync(copy, 'utf8'), readFileSync(join(dir, '10x10', `${id}.svg`), 'utf8'))
})

// --- --dry-run ---------------------------------------------------------------

// Runs carve.mjs with the board store pointed at <dir>/boards.
function dryRun(args, dir) {
  const r = spawnSync('node', [join(here, 'carve.mjs'), ...args], {
    cwd: dirname(here), env: { ...process.env, ARROWZ_BOARDS_DIR: join(dir, 'boards') }, encoding: 'utf8',
  })
  const line = r.stdout.split('\n').find((l) => l.startsWith('{'))
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json: line ? JSON.parse(line) : null }
}

test('carve.mjs --dry-run computes the board, writes nothing and prints one JSON line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arrowz-cli-'))
  const out = join(dir, 'out.svg')
  const r = dryRun(['--advanced', '--dry-run', '--svg=' + out, '--w=10', '--h=10', '--seed=1'], dir)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(existsSync(join(dir, 'boards')), false, 'the store must not be created')
  assert.equal(existsSync(out), false, 'the --svg=path copy must not be written')
  assert.equal(readdirSync(dir).length, 0, 'nothing at all is written')
  assert.ok(r.json, `no JSON line in:\n${r.stdout}`)
  assert.equal(r.json.dryRun, true)
  assert.equal(r.json.ok, true)
  assert.deepEqual([r.json.W, r.json.H, r.json.seed], [10, 10, 1])
  assert.equal(r.json.id, boardId({ ...defaultParams(), W: 10, H: 10, seed: 1 }))
  assert.equal(typeof r.json.pieces, 'number')
  assert.equal(typeof r.json.maxLen, 'number')
  assert.equal(typeof r.json.genMs, 'number')
  assert.match(r.json.command, /^node prototype\/carve\.mjs --advanced --svg --w=10 --h=10 --seed=1/)
})

test('carve.mjs --dry-run alone selects the one-board mode and its fingerprint matches the engine', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arrowz-cli-'))
  const r = dryRun(['--advanced', '--dry-run', '--w=25', '--h=50', '--seed=7', '--headbias=1'], dir)
  assert.equal(r.status, 0, r.stderr)
  assert.ok(r.json, `no JSON line in:\n${r.stdout}`)
  // the same parameters through the CLI parser and through generate() directly
  const expected = generate({ W: 25, H: 50, seed: 7, headBias: 1 })
  assert.equal(r.json.fingerprint, fingerprint(expected.board))
  assert.equal(r.json.pieces, expected.board.pieces.length)
  assert.equal(r.json.params.headBias, 1)
  assert.equal(readdirSync(dir).length, 0, 'nothing is written')
})

// --- the safe envelope --------------------------------------------------------
// Parameters outside PARAM_SPEC ranges or breaking a RULES entry are refused
// before any generation, in every mode, with exit code 2. --pstraight=0.3 is a
// range violation, --lmax=3 breaks the lmaxHole rule.

const BAD = ['--advanced', '--w=10', '--h=10', '--seed=1', '--pstraight=0.3', '--lmax=3']
const expectedLines = validateParams({ ...defaultParams(), pStraight: 0.3, Lmax: 3 }).map(formatViolation)

test('carve.mjs --dry-run with invalid parameters: exit 2, one JSON line, nothing written', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arrowz-cli-'))
  const r = dryRun(['--dry-run', ...BAD], dir)
  assert.equal(r.status, 2)
  assert.ok(r.json, `no JSON line in:\n${r.stdout}`)
  assert.equal(r.json.ok, false)
  assert.equal(r.json.error, 'invalid parameters')
  assert.equal(r.json.violations.length, 2)
  assert.deepEqual(r.json.violations[0], { kind: 'range', key: 'pStraight', value: 0.3, min: 0.6, max: 1 })
  assert.deepEqual(r.json.violations[1], { kind: 'rule', key: 'lmaxHole', keys: ['Lmax'] })
  assert.equal(r.stdout.trim().split('\n').length, 1, 'exactly one line on stdout')
  assert.equal(readdirSync(dir).length, 0, 'nothing is written')
})

test('carve.mjs --svg with invalid parameters: exit 2, both messages on stderr, no file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arrowz-cli-'))
  const out = join(dir, 'out.svg')
  const r = dryRun(['--svg=' + out, ...BAD], dir)
  assert.equal(r.status, 2)
  assert.equal(expectedLines.length, 2)
  assert.match(r.stderr, /^invalid parameters:\n/)
  for (const line of expectedLines) assert.ok(r.stderr.includes(`  - ${line}\n`), `stderr lacks: ${line}\n${r.stderr}`)
  assert.match(r.stderr, /see --help for the allowed ranges\n$/)
  assert.equal(r.stdout, '', 'nothing on stdout')
  assert.equal(existsSync(out), false, 'the --svg=path copy must not be written')
  assert.equal(readdirSync(dir).length, 0, 'the store must not be created')
})

test('carve.mjs report and bench modes refuse invalid parameters before the first level', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arrowz-cli-'))
  for (const mode of [['--only=easy', '--square', '--runs=1'], ['--bench=1', '--only=easy', '--square']]) {
    const r = dryRun(['--advanced', ...mode, '--warns=1'], dir)
    assert.equal(r.status, 2, mode.join(' '))
    assert.match(r.stderr, /^invalid parameters:\n  - closing off nooks: 1 is outside 2\.\.16\n/)
    assert.equal(r.stdout, '', `no report header for ${mode.join(' ')}`)
  }
  // a level size from --mid is validated like a knob
  const r = dryRun(['--advanced', '--only=mid', '--square', '--mid=2', '--runs=1'], dir)
  assert.equal(r.status, 2)
  assert.match(r.stderr, /width: 2 is outside 4\.\.1000/)
})

// The report and the benchmark have no other test that runs them to the end.
test('carve.mjs --advanced report and bench modes run one level to the end', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arrowz-cli-'))
  const report = dryRun(['--advanced', '--only=easy', '--square', '--runs=1'], dir)
  assert.equal(report.status, 0, report.stderr)
  assert.match(report.stdout, /--- Easy 25x25 \(1 runs\) ---\n  coverage\s+100\.00%/)
  const bench = dryRun(['--advanced', '--bench=1', '--only=easy', '--square'], dir)
  assert.equal(bench.status, 0, bench.stderr)
  assert.match(bench.stdout, /--- Easy 25x25 ---\n  time \[ms\]/)
  assert.equal(readdirSync(dir).length, 0, 'the report writes nothing')
})

test('carve.mjs --advanced --help and -h print the knob table and exit 0, even with bad parameters', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arrowz-cli-'))
  for (const flag of ['--help', '-h']) {
    const r = dryRun(['--advanced', flag, '--pstraight=0'], dir)
    assert.equal(r.status, 0, flag)
    assert.match(r.stdout, /^Usage: node prototype\/carve\.mjs /)
    assert.match(r.stdout, /--pstraight\s+straightness bias\s+0\.6\.\.1/)
    assert.ok(r.stdout.includes('maximum length must be 0 (automatic) or at least 6'))
    assert.equal(r.stderr, '')
  }
  assert.equal(readdirSync(dir).length, 0)
})

// --- the simple mode (no --advanced) ----------------------------------------
// The default call takes the simple lab view's inputs and always makes one
// board. The store meta keeps the full --advanced command (it reproduces the
// board even after --randomized) and the simple command next to it.

function runCli(args, dir) {
  const r = spawnSync('node', [join(here, 'carve.mjs'), ...args], {
    cwd: dirname(here), env: { ...process.env, ARROWZ_BOARDS_DIR: dir }, encoding: 'utf8',
  })
  return { status: r.status, stdout: r.stdout, stderr: r.stderr }
}

test('carve.mjs without --advanced writes the board the simple lab view makes for the same choice', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arrowz-cli-'))
  const choice = { ...defaultChoice(), W: 25, H: 50, seed: 7, lengths: 0.25, shape: 0.2, skeleton: 'on', random: false }
  const params = simpleParams(choice)
  const view = { ...DEFAULT_VIEW, cell: exportCell(25, 50), colored: true }
  const expected = toSvg(generate(params).board, { cell: view.cell, colored: true, strokeRatio: 0.5, headWidth: 0, headHeight: 0, top: 0 })

  const r = runCli(['--width=25', '--height=50', '--seed=7', '--length=0.25', '--straight=0.8', '--skeleton', '--colorized'], dir)
  assert.equal(r.status, 0, r.stderr)
  const id = boardId(params)
  assert.match(r.stdout, new RegExp(`25x50/${id}\\.svg`))
  assert.equal(readFileSync(join(dir, '25x50', `${id}.svg`), 'utf8'), expected)
  const meta = JSON.parse(readFileSync(join(dir, '25x50', `${id}.json`), 'utf8'))
  assert.equal(meta.command, buildCommand(params, view), 'the full command reproduces the board')
  assert.match(meta.command, /^node prototype\/carve\.mjs --advanced --svg /)
  assert.equal(meta.simpleCommand, 'node prototype/carve.mjs --width=25 --height=50 --seed=7 --length=0.25 --straight=0.8 --skeleton --colorized')
  assert.equal(meta.simpleCommand, buildSimpleCommand(choice, view))
  assert.equal(meta.source, 'cli')
  assert.deepEqual(meta.params, params)
})

test('carve.mjs simple mode: --svg=path writes a copy, --dry-run writes nothing and prints both commands', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arrowz-cli-'))
  const copy = join(dir, 'copy.svg')
  const ok = runCli(['--width=10', '--height=10', '--seed=1', `--svg=${copy}`], join(dir, 'store'))
  assert.equal(ok.status, 0, ok.stderr)
  const id = boardId(simpleParams({ ...defaultChoice(), W: 10, H: 10, seed: 1 }))
  assert.equal(readFileSync(copy, 'utf8'), readFileSync(join(dir, 'store', '10x10', `${id}.svg`), 'utf8'))

  const dry = mkdtempSync(join(tmpdir(), 'arrowz-cli-'))
  const r = dryRun(['--dry-run', '--width=10', '--height=10', '--seed=1', '--length=0'], dry)
  assert.equal(r.status, 0, r.stderr)
  assert.ok(r.json, `no JSON line in:\n${r.stdout}`)
  assert.equal(r.json.ok, true)
  assert.deepEqual(r.json.params, simpleParams({ ...defaultChoice(), W: 10, H: 10, seed: 1, lengths: 0 }))
  assert.equal(r.json.simpleCommand, 'node prototype/carve.mjs --width=10 --height=10 --seed=1 --length=0')
  assert.match(r.json.command, /^node prototype\/carve\.mjs --advanced --svg --w=10 --h=10 --seed=1 /)
  assert.equal(r.json.view.cell, exportCell(10, 10))
  assert.equal(readdirSync(dry).length, 0, 'nothing is written')
})

test('carve.mjs simple mode: --randomized draws every knob inside the slider ranges', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arrowz-cli-'))
  const choice = { ...defaultChoice(), W: 20, H: 20, seed: 1, lengths: 0, shape: 0, skeleton: 'on' }
  const r = dryRun(['--dry-run', '--width=20', '--height=20', '--seed=1', '--length=0', '--straight=1', '--skeleton', '--randomized'], dir)
  assert.equal(r.status, 0, r.stderr)
  assert.ok(r.json, `no JSON line in:\n${r.stdout}`)
  assert.equal(r.json.ok, true)
  assert.deepEqual(validateParams(r.json.params), [], 'a drawn set stays inside the envelope')
  for (const [key, range] of Object.entries(simpleRanges(choice))) {
    const v = r.json.params[key]
    if (range.pick) assert.ok(range.pick.includes(v), `${key}=${v} not in ${range.pick}`)
    else assert.ok(v >= range.lo - 1e-9 && v <= range.hi + 1e-9, `${key}=${v} outside ${range.lo}..${range.hi}`)
  }
  assert.match(r.json.simpleCommand, / --randomized$/)
  assert.match(r.json.command, /^node prototype\/carve\.mjs --advanced --svg /)
})

test('carve.mjs simple mode refuses advanced flags and a missing size: exit 2, a hint, nothing written', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arrowz-cli-'))
  const r = runCli(['--w=10', '--h=10'], dir)
  assert.equal(r.status, 2)
  assert.match(r.stderr, /^invalid arguments:\n  - missing --width\n  - missing --height\n  - unknown flag --w \(engine knobs, the report and the benchmark need --advanced\)\n/)
  assert.match(r.stderr, /see --help\n$/)
  assert.equal(r.stdout, '')
  assert.equal(readdirSync(dir).length, 0, 'the store must not be created')

  const d = dryRun(['--dry-run', '--width=10', '--height=10', '--length=2'], dir)
  assert.equal(d.status, 2)
  assert.deepEqual(d.json, { ok: false, error: 'invalid arguments', errors: ['--length=2 is outside 0..1'] })
  assert.equal(d.stdout.trim().split('\n').length, 1, 'exactly one line on stdout')
  assert.equal(readdirSync(dir).length, 0)
})

test('carve.mjs --help without --advanced prints the simple flags and points at --advanced', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arrowz-cli-'))
  for (const flag of ['--help', '-h']) {
    const r = dryRun([flag, '--w=10'], dir)
    assert.equal(r.status, 0, flag)
    assert.match(r.stdout, /^Usage: node prototype\/carve\.mjs --width=N --height=N/)
    for (const f of ['--length=R', '--straight=R', '--skeleton', '--seed=N', '--randomized', '--colorized', '--lineweight=R', '--arrowwidth=R', '--arrowheight=R', '--svg=path', '--dry-run', '--advanced']) {
      assert.ok(r.stdout.includes(f), `${f} missing from the simple help`)
    }
    assert.ok(!r.stdout.includes('--pstraight'), 'the knob table is behind --advanced --help')
    assert.equal(r.stderr, '')
  }
  assert.equal(readdirSync(dir).length, 0)
})
