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
import { generate, toSvg, defaultParams, fingerprint } from './engine.mjs'
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

// --- jammed boards ------------------------------------------------------------
// A board that does not close still goes to the store: the lab shows it with
// its holes (the "not closed" badge comes from meta.ok === false) so that a
// jam can be looked at, not only counted. The exit code stays 1 for scripts.

const JAM = ['--w=200', '--h=200', '--seed=1', '--headtries=1', '--pstraight=0.2', '--restarts=0', '--maxback=50']

function svgRun(args, dir, env = {}) {
  return spawnSync('node', [join(here, 'carve.mjs'), '--svg', ...args], {
    cwd: dirname(here), env: { ...process.env, ARROWZ_BOARDS_DIR: dir, ...env }, encoding: 'utf8',
  })
}

test('carve.mjs --svg saves a jammed board with ok:false, its holes and the jam report', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arrowz-cli-'))
  const r = svgRun(JAM, dir)
  assert.equal(r.status, 1, r.stderr)
  const params = { ...defaultParams(), W: 200, H: 200, seed: 1, headTries: 1, pStraight: 0.2, restarts: 0, maxBack: 50 }
  const expected = generate(params)
  assert.equal(expected.ok, false, 'the fixture must jam')
  const id = boardId(params)
  const meta = JSON.parse(readFileSync(join(dir, '200x200', `${id}.json`), 'utf8'))
  assert.equal(meta.ok, false)
  assert.equal(meta.aborted, false)
  assert.equal(meta.pieces, expected.board.pieces.length)
  assert.deepEqual(meta.stuck, expected.stuck)
  assert.equal(meta.restarts, 0)
  assert.equal(typeof meta.genMs, 'number')
  const svg = readFileSync(join(dir, '200x200', `${id}.svg`), 'utf8')
  assert.equal(svg, toSvg(expected.board, { cell: 12, strokeRatio: 0.5, colored: false, top: 0, voids: true }))
  assert.match(r.stdout, new RegExp(`200x200/${id}\\.svg .*not closed`))
})

test('CARVE_TIMEOUT_S aborts a long generation and saves what was carved so far', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arrowz-cli-'))
  // 400×400 takes over a second; a zero budget stops it at the first trace tick.
  const r = svgRun(['--w=400', '--h=400', '--seed=7'], dir, { CARVE_TIMEOUT_S: '0' })
  assert.equal(r.status, 1, r.stderr)
  assert.match(r.stderr, /aborted after/)
  const id = boardId({ ...defaultParams(), W: 400, H: 400, seed: 7 })
  const meta = JSON.parse(readFileSync(join(dir, '400x400', `${id}.json`), 'utf8'))
  assert.equal(meta.ok, false)
  assert.equal(meta.aborted, true)
  assert.ok(meta.pieces > 0, 'the partial board has pieces')
  assert.ok(meta.stuck.remaining > 0)
  assert.ok(meta.genMs < 2000, `aborted early, not after the full run: ${meta.genMs} ms`)
  assert.match(readFileSync(join(dir, '400x400', `${id}.svg`), 'utf8'), /<rect/)
})
