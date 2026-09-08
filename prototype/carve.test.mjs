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
import { buildCommand, boardId } from './command.mjs'

const here = dirname(fileURLToPath(import.meta.url))

test('carve.mjs --svg reproduces the generate() board byte for byte', () => {
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
  execFileSync('node', [join(here, 'carve.mjs'), `--svg=${copy}`, '--w=10', '--h=10', '--seed=3'], {
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
  const r = dryRun(['--dry-run', '--svg=' + out, '--w=10', '--h=10', '--seed=1'], dir)
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
  assert.match(r.json.command, /^node prototype\/carve\.mjs --svg --w=10 --h=10 --seed=1/)
})

test('carve.mjs --dry-run alone selects the one-board mode and its fingerprint matches the engine', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arrowz-cli-'))
  const r = dryRun(['--dry-run', '--w=25', '--h=50', '--seed=7', '--headbias=1'], dir)
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

const BAD = ['--w=10', '--h=10', '--seed=1', '--pstraight=0.3', '--lmax=3']
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
    const r = dryRun([...mode, '--warns=1'], dir)
    assert.equal(r.status, 2, mode.join(' '))
    assert.match(r.stderr, /^invalid parameters:\n  - closing off nooks: 1 is outside 2\.\.16\n/)
    assert.equal(r.stdout, '', `no report header for ${mode.join(' ')}`)
  }
  // a level size from --mid is validated like a knob
  const r = dryRun(['--only=mid', '--square', '--mid=2', '--runs=1'], dir)
  assert.equal(r.status, 2)
  assert.match(r.stderr, /width: 2 is outside 4\.\.1000/)
})

test('carve.mjs --help and -h print the knob table and exit 0, even with bad parameters', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arrowz-cli-'))
  for (const flag of ['--help', '-h']) {
    const r = dryRun([flag, '--pstraight=0'], dir)
    assert.equal(r.status, 0, flag)
    assert.match(r.stdout, /^Usage: node prototype\/carve\.mjs /)
    assert.match(r.stdout, /--pstraight\s+straightness bias\s+0\.6\.\.1/)
    assert.ok(r.stdout.includes('maximum length must be 0 (automatic) or at least 6'))
    assert.equal(r.stderr, '')
  }
  assert.equal(readdirSync(dir).length, 0)
})
