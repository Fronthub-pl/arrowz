import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PRESETS, findPreset } from './lab-presets.mjs'
import { PARAM_SPEC } from './engine.mjs'
import { EN, PL } from './lab-i18n.mjs'

const specs = new Map(PARAM_SPEC.map((s) => [s.key, s]))

test('every preset level has several options with valid parameter overrides', () => {
  assert.ok(PRESETS.length >= 5)
  const ids = new Set()
  for (const level of PRESETS) {
    assert.ok(level.options.length >= 3, `level ${level.id} has ${level.options.length} options`)
    for (const o of level.options) {
      assert.ok(!ids.has(o.id), `duplicate preset id ${o.id}`)
      ids.add(o.id)
      assert.ok(o.params.W && o.params.H, `preset ${o.id} needs W and H`)
      for (const [k, v] of Object.entries(o.params)) {
        const s = specs.get(k)
        assert.ok(s, `preset ${o.id}: unknown parameter ${k}`)
        assert.ok(v >= s.min && v <= s.max, `preset ${o.id}: ${k}=${v} out of range`)
      }
    }
  }
})

test('both dictionaries name every preset level and mode', () => {
  for (const level of PRESETS) {
    assert.ok(EN.presets.levels[level.id], `EN level ${level.id}`)
    assert.ok(PL.presets.levels[level.id], `PL level ${level.id}`)
    for (const o of level.options) {
      assert.ok(EN.presets.modes[o.mode], `EN mode ${o.mode}`)
      assert.ok(PL.presets.modes[o.mode], `PL mode ${o.mode}`)
    }
  }
})

test('findPreset prefers the most specific match and ignores unrelated knobs', () => {
  const base = Object.fromEntries(PARAM_SPEC.map((s) => [s.key, s.def]))
  assert.equal(findPreset({ ...base, W: 25, H: 50 })?.id, 'easy-portrait')
  assert.equal(findPreset({ ...base, W: 25, H: 50, headBias: 1 })?.id, 'easy-tunnels')
  assert.equal(findPreset({ ...base, W: 25, H: 50, giants: 4 })?.id, 'easy-skeleton')
  assert.equal(findPreset({ ...base, W: 25, H: 50, anticoil: 9 })?.id, 'easy-portrait')
  assert.equal(findPreset({ ...base, W: 33, H: 50 }), null)
})

test('the huge level offers a winding skeleton: short runs, small step', () => {
  const huge = PRESETS.find((l) => l.id === 'huge')
  const o = huge.options.find((x) => x.mode === 'serpentine')
  assert.ok(o, 'serpentine option')
  assert.equal(o.params.W, 400)
  assert.ok(o.params.giants > 0)
  assert.equal(o.params.giantJitter, 1, 'every run is cut short, none goes wall to wall')
  assert.ok(o.params.giantStep <= 4, 'a small step keeps the line long')
})

test('the insane level is the 1000×1000 ceiling: square only, with tunnels and a skeleton', () => {
  const insane = PRESETS.find((l) => l.id === 'insane')
  assert.ok(insane, 'insane level')
  for (const o of insane.options) {
    assert.equal(o.params.W, 1000, `${o.id} width`)
    assert.equal(o.params.H, 1000, `${o.id} height`)
  }
  assert.ok(!insane.options.some((o) => o.mode === 'portrait'), 'no portrait variant at a million cells')
  assert.ok(insane.options.some((o) => o.mode === 'tunnels'))
  assert.ok(insane.options.some((o) => o.mode === 'skeleton'))
  const huge = PRESETS.find((l) => l.id === 'huge')
  assert.ok(!huge.options.some((o) => o.params.W === 1000), 'the 1000 board moved from huge to insane')
})
