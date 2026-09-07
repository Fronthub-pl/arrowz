// The lab must mirror the CLI 1:1, so the command text has to parse back
// into the same parameters.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCommand, parseArgs, boardId, DEFAULT_VIEW } from './command.mjs'
import { defaultParams, PARAM_SPEC } from './engine.mjs'

const argvOf = (cmd) => cmd.split(' ').slice(2)   // drop "node prototype/carve.mjs"

test('buildCommand: default params give only size, seed, --svg and --cell', () => {
  const p = { ...defaultParams(), W: 25, H: 50, seed: 7 }
  assert.equal(buildCommand(p), 'node prototype/carve.mjs --svg --w=25 --h=50 --seed=7 --cell=12')
})

test('buildCommand ↔ parseArgs: round trip for changed knobs and view', () => {
  const p = { ...defaultParams(), W: 100, H: 200, seed: 42, anticoil: 3, giants: 4, headBias: -1, wShort: 0.5 }
  const v = { cell: 8, stroke: 0.4, colored: true, top: 5 }
  const cmd = buildCommand(p, v)
  assert.match(cmd, /--anticoil=3 /)
  assert.match(cmd, /--headbias=-1 /)
  assert.match(cmd, / --stroke=0.4 --colored --top=5$/)
  const back = parseArgs(argvOf(cmd))
  for (const s of PARAM_SPEC) assert.equal(back.params[s.key], p[s.key], s.key)
  assert.deepEqual(back.view, v)
  assert.deepEqual(back.rest, ['--svg'])
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
