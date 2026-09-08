import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SIMPLE_SIZES, SIMPLE_CHOICES, defaultChoice, simpleRanges, simpleParams } from './lab-simple.mjs'
import { PRESETS } from './lab-presets.mjs'
import { PARAM_SPEC, defaultParams, validateParams, mulberry32 } from './engine.mjs'
import { EN, PL } from './lab-i18n.mjs'

const specs = new Map(PARAM_SPEC.map((s) => [s.key, s]))
const combos = []
for (const lengths of SIMPLE_CHOICES.lengths) for (const shape of SIMPLE_CHOICES.shape) for (const skeleton of SIMPLE_CHOICES.skeleton) {
  combos.push({ lengths, shape, skeleton })
}
const choice = (over) => ({ ...defaultChoice(), ...over })

test('simple sizes are every preset size once, smallest first', () => {
  const fromPresets = new Set()
  for (const l of PRESETS) for (const o of l.options) fromPresets.add(`${o.params.W}x${o.params.H}`)
  assert.deepEqual(new Set(SIMPLE_SIZES.map((s) => s.id)), fromPresets)
  assert.equal(new Set(SIMPLE_SIZES.map((s) => s.id)).size, SIMPLE_SIZES.length, 'no duplicates')
  for (let i = 1; i < SIMPLE_SIZES.length; i++) {
    assert.ok(SIMPLE_SIZES[i].W * SIMPLE_SIZES[i].H >= SIMPLE_SIZES[i - 1].W * SIMPLE_SIZES[i - 1].H, 'sorted by cells')
  }
  for (const s of SIMPLE_SIZES) assert.equal(s.id, `${s.W}x${s.H}`)
})

// The plain "long, slightly winding, no skeleton" board IS the engine
// default, so the simple view starts exactly where the CLI starts.
test('the default choice produces the engine defaults', () => {
  assert.deepEqual(simpleParams(defaultChoice()), defaultParams())
})

test('every choice at every size passes the engine validation without randomising', () => {
  for (const size of SIMPLE_SIZES) for (const c of combos) {
    const p = simpleParams(choice({ ...c, size: size.id, seed: 11 }))
    assert.equal(p.W, size.W)
    assert.equal(p.H, size.H)
    assert.equal(p.seed, 11)
    assert.deepEqual(validateParams(p), [], `${size.id} ${JSON.stringify(c)}`)
  }
})

test('randomised parameters stay inside the choice ranges, on the knob step and inside the envelope', () => {
  const rng = mulberry32(2026)
  for (const size of SIMPLE_SIZES) for (const c of combos) {
    const ch = choice({ ...c, size: size.id })
    const ranges = simpleRanges(ch)
    for (let i = 0; i < 25; i++) {
      const p = simpleParams(ch, rng)
      assert.deepEqual(validateParams(p), [], `${size.id} ${JSON.stringify(c)} ${JSON.stringify(p)}`)
      for (const [key, r] of Object.entries(ranges)) {
        const spec = specs.get(key)
        assert.ok(spec, `range for unknown knob ${key}`)
        if (r.pick) { assert.ok(r.pick.includes(p[key]), `${key}=${p[key]} not in ${r.pick}`); continue }
        assert.ok(p[key] >= r.lo - 1e-9 && p[key] <= r.hi + 1e-9, `${key}=${p[key]} outside ${r.lo}..${r.hi}`)
        const steps = (p[key] - spec.min) / spec.step
        assert.ok(Math.abs(steps - Math.round(steps)) < 1e-6, `${key}=${p[key]} is not on step ${spec.step}`)
      }
      // Knobs the choice does not name keep their defaults — closing knobs
      // above all: a random backtrack budget turns a jam into minutes of waiting.
      for (const spec of PARAM_SPEC) {
        if (ranges[spec.key] || ['W', 'H', 'seed'].includes(spec.key)) continue
        assert.equal(p[spec.key], spec.def, `${spec.key} should stay at its default`)
      }
    }
  }
})

test('the categories pull the knobs the way their names promise', () => {
  const short = simpleParams(choice({ lengths: 'short' }))
  const long = simpleParams(choice({ lengths: 'long' }))
  assert.ok(short.wShort > long.wShort)
  const straight = simpleParams(choice({ shape: 'straight' }))
  const wavy = simpleParams(choice({ shape: 'wavy' }))
  const winding = simpleParams(choice({ shape: 'winding' }))
  assert.ok(straight.pStraight > wavy.pStraight)
  assert.ok(winding.pStraight < wavy.pStraight)
  assert.ok(winding.wLateral > straight.wLateral)
  assert.equal(simpleParams(choice({ skeleton: 'off' })).giants, 0)
  assert.ok(simpleParams(choice({ skeleton: 'on' })).giants > 0)
})

// Measured: at 600×600 pStraight 0.6 leaves boards unclosed, 0.65 and 0.7
// close; at 1000×1000 layers mode starves. The random ranges narrow with
// the board, while the small boards keep the wider ones.
test('big boards get a higher straightness floor and no layers mode when randomised', () => {
  const rng = mulberry32(7)
  let minSmall = 1
  for (let i = 0; i < 200; i++) {
    const big = simpleParams(choice({ shape: 'winding', size: '1000x1000' }), rng)
    assert.ok(big.pStraight >= 0.7 - 1e-9, `pStraight ${big.pStraight} at 1000×1000`)
    assert.notEqual(big.headBias, -1, 'no layers mode at 1000×1000')
    minSmall = Math.min(minSmall, simpleParams(choice({ shape: 'winding', size: '200x400' }), rng).pStraight)
  }
  assert.ok(minSmall < 0.7, `small boards may go below 0.7 (min ${minSmall})`)
  assert.ok(minSmall >= 0.65 - 1e-9)
})

test('both dictionaries label every simple choice, size and view string', () => {
  for (const d of [EN, PL]) {
    for (const [group, values] of Object.entries(SIMPLE_CHOICES)) {
      assert.equal(typeof d.simple[group], 'string', `${group} label`)
      for (const v of values) assert.equal(typeof d.simple.options[group][v], 'string', `${group}.${v}`)
    }
    for (const k of ['viewSimple', 'viewAdvanced', 'size', 'randomize', 'randomizeHelp']) assert.equal(typeof d.simple[k], 'string', k)
  }
  assert.deepEqual(Object.keys(PL.simple).sort(), Object.keys(EN.simple).sort())
})
