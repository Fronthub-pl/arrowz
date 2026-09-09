import { assert, assertEquals } from '@std/assert'
import { findPreset, PRESETS } from './lab-presets.ts'
// @ts-types="./engine.d.ts"
import { defaultParams, PARAM_SPEC, validateParams } from './engine.mjs'
import { EN, PL } from './lab-i18n.mjs'
import type { ParamKey, ParamSpec } from './types.ts'

const specs = new Map<ParamKey, ParamSpec>(PARAM_SPEC.map((s) => [s.key, s]))
const overrideKeys = (p: { params: Partial<Record<ParamKey, number>> }) => Object.keys(p.params) as ParamKey[]

Deno.test('every preset level has several options with valid parameter overrides', () => {
  assert(PRESETS.length >= 5)
  const ids = new Set<string>()
  for (const level of PRESETS) {
    assert(level.options.length >= 3, `level ${level.id} has ${level.options.length} options`)
    for (const o of level.options) {
      assert(!ids.has(o.id), `duplicate preset id ${o.id}`)
      ids.add(o.id)
      assert(o.params.W && o.params.H, `preset ${o.id} needs W and H`)
      for (const k of overrideKeys(o)) {
        const v = o.params[k]
        const s = specs.get(k)
        assert(s && v !== undefined, `preset ${o.id}: unknown parameter ${k}`)
        assert(v >= s.min && v <= s.max, `preset ${o.id}: ${k}=${v} out of range`)
      }
    }
  }
})

// A preset is a full configuration (defaults + overrides), so it must sit
// inside the safe envelope the engine enforces, including the cross-knob rules.
Deno.test('every preset passes the engine validation once merged over the defaults', () => {
  for (const level of PRESETS) {
    for (const o of level.options) {
      const violations = validateParams({ ...defaultParams(), ...o.params })
      assertEquals(violations, [], `preset ${o.id}: ${JSON.stringify(violations)}`)
    }
  }
})

Deno.test('both dictionaries name every preset level and mode', () => {
  for (const level of PRESETS) {
    // @ts-expect-error i18n typed in Task 6
    assert(EN.presets.levels[level.id], `EN level ${level.id}`)
    // @ts-expect-error i18n typed in Task 6
    assert(PL.presets.levels[level.id], `PL level ${level.id}`)
    for (const o of level.options) {
      assert(EN.presets.modes[o.mode], `EN mode ${o.mode}`)
      assert(PL.presets.modes[o.mode], `PL mode ${o.mode}`)
    }
  }
})

Deno.test('findPreset prefers the most specific match and ignores unrelated knobs', () => {
  const base = defaultParams()
  assertEquals(findPreset({ ...base, W: 25, H: 50 })?.id, 'easy-portrait')
  assertEquals(findPreset({ ...base, W: 25, H: 50, headBias: 1 })?.id, 'easy-tunnels')
  assertEquals(findPreset({ ...base, W: 25, H: 50, giants: 4 })?.id, 'easy-skeleton')
  assertEquals(findPreset({ ...base, W: 25, H: 50, anticoil: 9 })?.id, 'easy-portrait')
  assertEquals(findPreset({ ...base, W: 33, H: 50 }), null)
})

Deno.test('the huge level offers a winding skeleton: short runs, small step', () => {
  const huge = PRESETS.find((l) => l.id === 'huge')
  assert(huge, 'huge level')
  const o = huge.options.find((x) => x.mode === 'serpentine')
  assert(o, 'serpentine option')
  assertEquals(o.params.W, 400)
  const { giants, giantStep, giantJitter } = o.params
  assert(giants !== undefined && giants > 0)
  assertEquals(giantJitter, 1, 'every run is cut short, none goes wall to wall')
  assert(giantStep !== undefined && giantStep <= 4, 'a small step keeps the line long')
})

Deno.test('the insane level is the 1000×1000 ceiling: square only, with tunnels and a skeleton', () => {
  const insane = PRESETS.find((l) => l.id === 'insane')
  assert(insane, 'insane level')
  for (const o of insane.options) {
    assertEquals(o.params.W, 1000, `${o.id} width`)
    assertEquals(o.params.H, 1000, `${o.id} height`)
  }
  assert(!insane.options.some((o) => o.mode === 'portrait'), 'no portrait variant at a million cells')
  assert(insane.options.some((o) => o.mode === 'tunnels'))
  assert(insane.options.some((o) => o.mode === 'skeleton'))
  const huge = PRESETS.find((l) => l.id === 'huge')
  assert(huge, 'huge level')
  assert(!huge.options.some((o) => o.params.W === 1000), 'the 1000 board moved from huge to insane')
})
