import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  defaultChoice,
  exportCell,
  normalizeChoice,
  SIMPLE_CHOICES,
  SIMPLE_SIZES,
  SIMPLE_SLIDERS,
  simpleParams,
  simpleRanges,
} from './lab-simple.mjs'
import { PRESETS } from './lab-presets.ts'
import { defaultParams, mulberry32, PARAM_SPEC, validateParams } from './engine.mjs'
import { EN, PL } from './lab-i18n.ts'

const specs = new Map(PARAM_SPEC.map((s) => [s.key, s]))
// Slider anchors plus a few positions in between.
const positions = [0, 0.1, 0.25, 0.37, 0.5, 0.66, 0.75, 0.9, 1]
const combos = []
for (const lengths of positions) {
  for (const shape of positions) {
    for (const skeleton of SIMPLE_CHOICES.skeleton) {
      combos.push({ lengths, shape, skeleton })
    }
  }
}
const choice = (over) => ({ ...defaultChoice(), ...over })

// SIMPLE_SIZES is the list of sizes the ranges are exercised at (the preset
// sizes); the view itself takes any width and height the engine allows.
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

test('lengths and shape are sliders from 0 to 1, skeleton stays a choice, the size is W and H', () => {
  assert.deepEqual(Object.keys(SIMPLE_SLIDERS).sort(), ['lengths', 'shape'])
  assert.deepEqual(SIMPLE_CHOICES, { skeleton: ['off', 'on'] })
  const d = defaultChoice()
  assert.equal(typeof d.lengths, 'number')
  assert.equal(typeof d.shape, 'number')
  assert.deepEqual([d.W, d.H], [defaultParams().W, defaultParams().H])
  assert.equal(d.size, undefined, 'no preset-size id any more')
})

test('normalizeChoice takes any engine size, clamps it and reads the old size id', () => {
  const d = defaultChoice()
  assert.deepEqual([normalizeChoice({ W: 37, H: 91 }).W, normalizeChoice({ W: 37, H: 91 }).H], [37, 91])
  assert.equal(normalizeChoice({ W: 5000 }).W, 1000, 'clamped to the engine maximum')
  assert.equal(normalizeChoice({ H: 1 }).H, 4, 'clamped to the engine minimum')
  assert.equal(normalizeChoice({ W: 12.7 }).W, 13, 'whole cells')
  assert.deepEqual(
    [normalizeChoice({ size: '100x200' }).W, normalizeChoice({ size: '100x200' }).H],
    [100, 200],
    'old recipe',
  )
  assert.equal(normalizeChoice({ size: '100x200', W: 40 }).W, 40, 'explicit W wins over the old id')
  assert.deepEqual([normalizeChoice({ W: 'x', size: 'junk' }).W, normalizeChoice({ W: 'x', size: 'junk' }).H], [
    d.W,
    d.H,
  ])
  assert.equal(normalizeChoice({ size: '100x200' }).size, undefined, 'the id is not carried on')
  const p = simpleParams({ ...d, W: 37, H: 91 })
  assert.equal(p.W, 37)
  assert.equal(p.H, 91)
  assert.deepEqual(validateParams(p), [])
})

// The plain "long, slightly winding, no skeleton" board IS the engine
// default, so the simple view starts exactly where the CLI starts.
test('the default choice produces the engine defaults', () => {
  assert.deepEqual(simpleParams(defaultChoice()), defaultParams())
})

// Recipes saved by the button version carry category names; they land on
// the matching slider position. Anything else falls back to the default.
test('normalizeChoice maps the old category names to slider positions and repairs junk', () => {
  const d = defaultChoice()
  assert.equal(normalizeChoice({ lengths: 'short' }).lengths, 0.25)
  assert.equal(normalizeChoice({ lengths: 'medium' }).lengths, 0.5)
  assert.equal(normalizeChoice({ lengths: 'long' }).lengths, 0.75)
  assert.equal(normalizeChoice({ shape: 'straight' }).shape, 0.25)
  assert.equal(normalizeChoice({ shape: 'wavy' }).shape, 0.5)
  assert.equal(normalizeChoice({ shape: 'winding' }).shape, 0.75)
  assert.equal(normalizeChoice({ lengths: 0.37 }).lengths, 0.37)
  assert.equal(normalizeChoice({ lengths: 7 }).lengths, 1, 'clamped into 0..1')
  assert.equal(normalizeChoice({ lengths: 'nonsense', shape: NaN, skeleton: 'maybe' }).lengths, d.lengths)
  assert.equal(normalizeChoice({ shape: NaN }).shape, d.shape)
  assert.equal(normalizeChoice({ skeleton: 'maybe' }).skeleton, d.skeleton)
  assert.equal(normalizeChoice({ skeleton: 'on', random: true }).random, true, 'the randomise flag rides along')
})

test('every slider position at every size passes the engine validation without randomising', () => {
  for (const size of SIMPLE_SIZES) {
    for (const c of combos) {
      const p = simpleParams(choice({ ...c, W: size.W, H: size.H, seed: 11 }))
      assert.equal(p.W, size.W)
      assert.equal(p.H, size.H)
      assert.equal(p.seed, 11)
      assert.deepEqual(validateParams(p), [], `${size.id} ${JSON.stringify(c)}`)
    }
  }
})

test('randomised parameters stay inside the position ranges, on the knob step and inside the envelope', () => {
  const rng = mulberry32(2026)
  for (const size of SIMPLE_SIZES) {
    for (const c of combos) {
      const ch = choice({ ...c, W: size.W, H: size.H })
      const ranges = simpleRanges(ch)
      for (let i = 0; i < 8; i++) {
        const p = simpleParams(ch, rng)
        assert.deepEqual(validateParams(p), [], `${size.id} ${JSON.stringify(c)} ${JSON.stringify(p)}`)
        for (const [key, r] of Object.entries(ranges)) {
          const spec = specs.get(key)
          assert.ok(spec, `range for unknown knob ${key}`)
          if (r.pick) {
            assert.ok(r.pick.includes(p[key]), `${key}=${p[key]} not in ${r.pick}`)
            continue
          }
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
  }
})

// The same slider position gives a spread of boards when randomising, so
// the position states a wish, not one configuration.
test('randomising at one slider position draws different knobs', () => {
  const rng = mulberry32(5)
  const seen = new Set()
  for (let i = 0; i < 20; i++) seen.add(JSON.stringify(simpleParams(choice({ lengths: 0.4, shape: 0.6 }), rng)))
  assert.ok(seen.size >= 15, `${seen.size} distinct draws out of 20`)
})

test('the sliders pull the knobs the way their ends promise, monotonically', () => {
  let prev = null
  for (const t of positions) {
    const p = simpleParams(choice({ lengths: t }))
    if (prev) {
      assert.ok(p.wShort <= prev.wShort + 1e-9, `short share must not rise from ${prev.wShort} to ${p.wShort} at ${t}`)
    }
    prev = p
  }
  assert.ok(
    simpleParams(choice({ lengths: 0 })).wShort > simpleParams(choice({ lengths: 0.25 })).wShort,
    'very short is shorter than short',
  )
  assert.ok(
    simpleParams(choice({ lengths: 1 })).wShort < simpleParams(choice({ lengths: 0.75 })).wShort,
    'very long is longer than long',
  )
  prev = null
  for (const t of positions) {
    const p = simpleParams(choice({ shape: t }))
    if (prev) {
      assert.ok(p.pStraight <= prev.pStraight + 1e-9, `straightness must not rise at ${t}`)
      assert.ok(p.wLateral >= prev.wLateral - 1e-9, `sideways bonus must not fall at ${t}`)
    }
    prev = p
  }
  assert.ok(
    simpleParams(choice({ shape: 0 })).pStraight > simpleParams(choice({ shape: 0.25 })).pStraight,
    'straightest is straighter than straight',
  )
  assert.ok(
    simpleParams(choice({ shape: 1 })).wLateral > simpleParams(choice({ shape: 0.75 })).wLateral,
    'most winding winds more than winding',
  )
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
    const big = simpleParams(choice({ shape: 1, W: 1000, H: 1000 }), rng)
    assert.ok(big.pStraight >= 0.7 - 1e-9, `pStraight ${big.pStraight} at 1000×1000`)
    assert.notEqual(big.headBias, -1, 'no layers mode at 1000×1000')
    minSmall = Math.min(minSmall, simpleParams(choice({ shape: 1, W: 200, H: 400 }), rng).pStraight)
  }
  assert.ok(minSmall < 0.7, `small boards may go below 0.7 (min ${minSmall})`)
  assert.ok(minSmall >= 0.65 - 1e-9)
})

test('both dictionaries label every simple choice, slider end, size and view string', () => {
  for (const d of [EN, PL]) {
    for (const [group, values] of Object.entries(SIMPLE_CHOICES)) {
      assert.equal(typeof d.simple[group], 'string', `${group} label`)
      for (const v of values) assert.equal(typeof d.simple.options[group][v], 'string', `${group}.${v}`)
    }
    for (const key of Object.keys(SIMPLE_SLIDERS)) {
      assert.equal(typeof d.simple[key], 'string', `${key} label`)
      const ends = d.simple.ends[key]
      assert.ok(
        Array.isArray(ends) && ends.length === 2 && ends.every((e) => typeof e === 'string' && e.length > 0),
        `${key} ends`,
      )
    }
    for (const k of ['viewSimple', 'viewAdvanced', 'randomize', 'randomizeHelp']) {
      assert.equal(typeof d.simple[k], 'string', k)
    }
    assert.equal(d.simple.size, undefined, 'the size label is gone with the size list')
  }
  assert.deepEqual(Object.keys(PL.simple).sort(), Object.keys(EN.simple).sort())
  assert.deepEqual(Object.keys(PL.simple.options).sort(), Object.keys(SIMPLE_CHOICES).sort(), 'no stale option groups')
})

// The lab picks the export cell size from the board: 1600 px on the longer
// side, between 1 and 18 px. The CLI simple mode uses the same function, so
// both render the same SVG for the same choice.
test('exportCell: 1600 px on the longer side, clamped to 1..18', () => {
  assert.equal(exportCell(25, 50), 18)
  assert.equal(exportCell(100, 200), 8)
  assert.equal(exportCell(400, 400), 4)
  assert.equal(exportCell(1000, 1000), 2)
  assert.equal(exportCell(4000, 1000), 1)
})
