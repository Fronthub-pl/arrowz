// The lab must mirror the CLI 1:1: the command from the lab has to give the
// same board as the worker. We generate through generate() and through
// carve.mjs in a child process and compare the SVG byte for byte.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generate, toSvg, defaultParams } from './engine.mjs'
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
