import { assert, assertEquals, assertNotEquals } from '@std/assert'
import {
  defaultChoice,
  exportCell,
  normalizeChoice,
  presetParams,
  SIMPLE_CHOICES,
  SIMPLE_SIZES,
  SIMPLE_SLIDERS,
  simpleParams,
  simpleRanges,
} from './lab-simple.ts'
import { PRESETS } from './lab-presets.ts'
import { defaultParams, mulberry32, PARAM_SPEC, validateParams } from './engine.ts'
import { type Dictionary, EN, PL } from './lab-i18n.ts'
import type { ParamKey, Params, ParamSpec, Range, SimpleChoice } from './types.ts'

const specs = new Map<ParamKey, ParamSpec>(PARAM_SPEC.map((s) => [s.key, s]))
// Slider anchors plus a few positions in between.
const positions = [0, 0.1, 0.25, 0.37, 0.5, 0.66, 0.75, 0.9, 1]
type Combo = Pick<SimpleChoice, 'lengths' | 'shape' | 'skeleton'>
const combos: Combo[] = []
for (const lengths of positions) {
  for (const shape of positions) {
    for (const skeleton of SIMPLE_CHOICES.skeleton) {
      combos.push({ lengths, shape, skeleton })
    }
  }
}
const choice = (over: Partial<SimpleChoice>): SimpleChoice => ({ ...defaultChoice(), ...over })
/** Typed Object.keys for a range map: its keys are PARAM_SPEC keys by construction. */
const rangeKeys = (r: Partial<Record<ParamKey, Range>>): ParamKey[] => Object.keys(r) as ParamKey[]
/** Typed Object.keys for the choice groups and the sliders. */
const choiceKeys = (): (keyof typeof SIMPLE_CHOICES)[] => Object.keys(SIMPLE_CHOICES) as (keyof typeof SIMPLE_CHOICES)[]
const sliderKeys = (): (keyof typeof SIMPLE_SLIDERS)[] => Object.keys(SIMPLE_SLIDERS) as (keyof typeof SIMPLE_SLIDERS)[]
// The board fields, which the choice sets directly instead of drawing them.
const boardKeys: ParamKey[] = ['W', 'H', 'seed']

// SIMPLE_SIZES is the list of sizes the ranges are exercised at (the preset
// sizes); the view itself takes any width and height the engine allows.
Deno.test('simple sizes are every preset size once, smallest first', () => {
  const fromPresets = new Set<string>()
  for (const l of PRESETS) for (const o of l.options) fromPresets.add(`${o.params.W}x${o.params.H}`)
  assertEquals(new Set(SIMPLE_SIZES.map((s) => s.id)), fromPresets)
  assertEquals(new Set(SIMPLE_SIZES.map((s) => s.id)).size, SIMPLE_SIZES.length, 'no duplicates')
  for (let i = 1; i < SIMPLE_SIZES.length; i++) {
    const a = SIMPLE_SIZES[i - 1], b = SIMPLE_SIZES[i]
    assert(a && b)
    assert(b.W * b.H >= a.W * a.H, 'sorted by cells')
  }
  for (const s of SIMPLE_SIZES) assertEquals(s.id, `${s.W}x${s.H}`)
})

Deno.test('lengths and shape are sliders from 0 to 1, skeleton stays a choice, the size is W and H', () => {
  assertEquals(sliderKeys().sort(), ['lengths', 'shape'])
  assertEquals<Record<string, readonly string[]>>(SIMPLE_CHOICES, { skeleton: ['off', 'on'] })
  const d = defaultChoice()
  assertEquals(typeof d.lengths, 'number')
  assertEquals(typeof d.shape, 'number')
  assertEquals([d.W, d.H], [defaultParams().W, defaultParams().H])
  assert(!('size' in d), 'no preset-size id any more')
})

Deno.test('normalizeChoice takes any engine size, clamps it and reads the old size id', () => {
  const d = defaultChoice()
  assertEquals([normalizeChoice({ W: 37, H: 91 }).W, normalizeChoice({ W: 37, H: 91 }).H], [37, 91])
  assertEquals(normalizeChoice({ W: 5000 }).W, 1000, 'clamped to the engine maximum')
  assertEquals(normalizeChoice({ H: 1 }).H, 4, 'clamped to the engine minimum')
  assertEquals(normalizeChoice({ W: 12.7 }).W, 13, 'whole cells')
  assertEquals(
    [normalizeChoice({ size: '100x200' }).W, normalizeChoice({ size: '100x200' }).H],
    [100, 200],
    'old recipe',
  )
  assertEquals(normalizeChoice({ size: '100x200', W: 40 }).W, 40, 'explicit W wins over the old id')
  assertEquals([normalizeChoice({ W: 'x', size: 'junk' }).W, normalizeChoice({ W: 'x', size: 'junk' }).H], [
    d.W,
    d.H,
  ])
  assert(!('size' in normalizeChoice({ size: '100x200' })), 'the id is not carried on')
  const p = simpleParams({ ...d, W: 37, H: 91 })
  assertEquals(p.W, 37)
  assertEquals(p.H, 91)
  assertEquals(validateParams(p), [])
})

// The plain "long, slightly winding, no skeleton" board IS the engine
// default, so the simple view starts exactly where the CLI starts.
Deno.test('the default choice produces the engine defaults', () => {
  assertEquals(simpleParams(defaultChoice()), defaultParams())
})

// Recipes saved by the button version carry category names; they land on
// the matching slider position. Anything else falls back to the default.
Deno.test('normalizeChoice maps the old category names to slider positions and repairs junk', () => {
  const d = defaultChoice()
  assertEquals(normalizeChoice({ lengths: 'short' }).lengths, 0.25)
  assertEquals(normalizeChoice({ lengths: 'medium' }).lengths, 0.5)
  assertEquals(normalizeChoice({ lengths: 'long' }).lengths, 0.75)
  assertEquals(normalizeChoice({ shape: 'straight' }).shape, 0.25)
  assertEquals(normalizeChoice({ shape: 'wavy' }).shape, 0.5)
  assertEquals(normalizeChoice({ shape: 'winding' }).shape, 0.75)
  assertEquals(normalizeChoice({ lengths: 0.37 }).lengths, 0.37)
  assertEquals(normalizeChoice({ lengths: 7 }).lengths, 1, 'clamped into 0..1')
  assertEquals(normalizeChoice({ lengths: 'nonsense', shape: NaN, skeleton: 'maybe' }).lengths, d.lengths)
  assertEquals(normalizeChoice({ shape: NaN }).shape, d.shape)
  assertEquals(normalizeChoice({ skeleton: 'maybe' }).skeleton, d.skeleton)
  assertEquals(normalizeChoice({ skeleton: 'on', random: true }).random, true, 'the randomise flag rides along')
})

Deno.test('every slider position at every size passes the engine validation without randomising', () => {
  for (const size of SIMPLE_SIZES) {
    for (const c of combos) {
      const p = simpleParams(choice({ ...c, W: size.W, H: size.H, seed: 11 }))
      assertEquals(p.W, size.W)
      assertEquals(p.H, size.H)
      assertEquals(p.seed, 11)
      assertEquals(validateParams(p), [], `${size.id} ${JSON.stringify(c)}`)
    }
  }
})

Deno.test('randomised parameters stay inside the position ranges, on the knob step and inside the envelope', () => {
  const rng = mulberry32(2026)
  for (const size of SIMPLE_SIZES) {
    for (const c of combos) {
      const ch = choice({ ...c, W: size.W, H: size.H })
      const ranges = simpleRanges(ch)
      for (let i = 0; i < 8; i++) {
        const p = simpleParams(ch, rng)
        assertEquals(validateParams(p), [], `${size.id} ${JSON.stringify(c)} ${JSON.stringify(p)}`)
        for (const key of rangeKeys(ranges)) {
          const r = ranges[key]
          assert(r, `range for ${key}`)
          const spec = specs.get(key)
          assert(spec, `range for unknown knob ${key}`)
          if ('pick' in r) {
            assert(r.pick.includes(p[key]), `${key}=${p[key]} not in ${r.pick}`)
            continue
          }
          assert(p[key] >= r.lo - 1e-9 && p[key] <= r.hi + 1e-9, `${key}=${p[key]} outside ${r.lo}..${r.hi}`)
          const steps = (p[key] - spec.min) / spec.step
          assert(Math.abs(steps - Math.round(steps)) < 1e-6, `${key}=${p[key]} is not on step ${spec.step}`)
        }
        // Knobs the choice does not name keep their defaults — closing knobs
        // above all: a random backtrack budget turns a jam into minutes of waiting.
        for (const spec of PARAM_SPEC) {
          if (ranges[spec.key] || boardKeys.includes(spec.key)) continue
          assertEquals(p[spec.key], spec.def, `${spec.key} should stay at its default`)
        }
      }
    }
  }
})

// The same slider position gives a spread of boards when randomising, so
// the position states a wish, not one configuration.
Deno.test('randomising at one slider position draws different knobs', () => {
  const rng = mulberry32(5)
  const seen = new Set<string>()
  for (let i = 0; i < 20; i++) seen.add(JSON.stringify(simpleParams(choice({ lengths: 0.4, shape: 0.6 }), rng)))
  assert(seen.size >= 15, `${seen.size} distinct draws out of 20`)
})

Deno.test('the sliders pull the knobs the way their ends promise, monotonically', () => {
  let prev: Params | null = null
  for (const t of positions) {
    const p = simpleParams(choice({ lengths: t }))
    if (prev) {
      assert(p.wShort <= prev.wShort + 1e-9, `short share must not rise from ${prev.wShort} to ${p.wShort} at ${t}`)
    }
    prev = p
  }
  assert(
    simpleParams(choice({ lengths: 0 })).wShort > simpleParams(choice({ lengths: 0.25 })).wShort,
    'very short is shorter than short',
  )
  assert(
    simpleParams(choice({ lengths: 1 })).wShort < simpleParams(choice({ lengths: 0.75 })).wShort,
    'very long is longer than long',
  )
  prev = null
  for (const t of positions) {
    const p = simpleParams(choice({ shape: t }))
    if (prev) {
      assert(p.pStraight <= prev.pStraight + 1e-9, `straightness must not rise at ${t}`)
      assert(p.wLateral >= prev.wLateral - 1e-9, `sideways bonus must not fall at ${t}`)
    }
    prev = p
  }
  assert(
    simpleParams(choice({ shape: 0 })).pStraight > simpleParams(choice({ shape: 0.25 })).pStraight,
    'straightest is straighter than straight',
  )
  assert(
    simpleParams(choice({ shape: 1 })).wLateral > simpleParams(choice({ shape: 0.75 })).wLateral,
    'most winding winds more than winding',
  )
  assertEquals(simpleParams(choice({ skeleton: 'off' })).giants, 0)
  assert(simpleParams(choice({ skeleton: 'on' })).giants > 0)
})

// Measured: at 600×600 pStraight 0.6 leaves boards unclosed, 0.65 and 0.7
// close; at 1000×1000 layers mode starves. The random ranges narrow with
// the board, while the small boards keep the wider ones.
Deno.test('big boards get a higher straightness floor and no layers mode when randomised', () => {
  const rng = mulberry32(7)
  let minSmall = 1
  for (let i = 0; i < 200; i++) {
    const big = simpleParams(choice({ shape: 1, W: 1000, H: 1000 }), rng)
    assert(big.pStraight >= 0.7 - 1e-9, `pStraight ${big.pStraight} at 1000×1000`)
    assertNotEquals(big.headBias, -1, 'no layers mode at 1000×1000')
    minSmall = Math.min(minSmall, simpleParams(choice({ shape: 1, W: 200, H: 400 }), rng).pStraight)
  }
  assert(minSmall < 0.7, `small boards may go below 0.7 (min ${minSmall})`)
  assert(minSmall >= 0.65 - 1e-9)
})

// The pin goes over the finished draw, never into it. Skipping a pinned
// knob's draw() would leave one value of the stream unspent and shift every
// partner drawn after it — measured on this very choice before the fix:
// wLateral 4 -> 5, warns 4 -> 5, anticoil 6 -> 7. A constant rng hides that,
// so this test runs a real stream.
Deno.test('a pin changes only the knob it names, and never moves its partners', () => {
  const c = choice({ W: 60, H: 60, lengths: 0.5, shape: 0.5 })
  // A fresh generator per call: mulberry32 is stateful, and the claim under
  // test is that both runs draw the same values in the same order.
  const pinned = simpleParams(c, mulberry32(7), { pStraight: 0.97 })
  const free = simpleParams(c, mulberry32(7))
  assertEquals(pinned.pStraight, 0.97)
  assert(free.pStraight !== 0.97, 'the draw would have picked the pinned value anyway')
  assertEquals(pinned.wLateral, free.wLateral)
  assertEquals(pinned.warns, free.warns)
  assertEquals(pinned.anticoil, free.anticoil)
})

Deno.test('the short-plus-medium clamp moves only an unpinned partner', () => {
  const choice = { ...defaultChoice(), lengths: 0 }
  const pinned = simpleParams(choice, () => 0.99, { wShort: 0.85 })
  assertEquals(pinned.wShort, 0.85)
  assert(pinned.wShort + pinned.wMid <= 0.9 + 1e-9, `${pinned.wShort} + ${pinned.wMid}`)
  // Both pinned: the engine refuses, the same way on every run.
  const both = simpleParams(choice, () => 0.99, { wShort: 0.85, wMid: 0.2 })
  assertEquals(both.wShort, 0.85)
  assertEquals(both.wMid, 0.2)
  assert(validateParams(both).length > 0, 'two pins that break the rule must reach the envelope')
})

Deno.test('presetParams takes the CLI vocabulary and gives the same board as the lab choice', () => {
  const viaPreset = presetParams({ W: 40, H: 40, seed: 3, length: 0.25, winding: 0.75, skeleton: true })
  const viaChoice = simpleParams({ W: 40, H: 40, seed: 3, lengths: 0.25, shape: 0.75, skeleton: 'on' })
  assertEquals(viaPreset, viaChoice)
})

Deno.test('both dictionaries label every simple choice, slider end, size and view string', () => {
  const dictionaries: Dictionary[] = [EN, PL]
  const viewStrings: (keyof Dictionary['simple'])[] = ['viewSimple', 'viewAdvanced', 'randomize', 'randomizeHelp']
  for (const d of dictionaries) {
    for (const group of choiceKeys()) {
      assertEquals(typeof d.simple[group], 'string', `${group} label`)
      for (const v of SIMPLE_CHOICES[group]) assertEquals(typeof d.simple.options[group][v], 'string', `${group}.${v}`)
    }
    for (const key of sliderKeys()) {
      assertEquals(typeof d.simple[key], 'string', `${key} label`)
      const ends = d.simple.ends[key]
      assert(
        ends.length === 2 && ends.every((e) => typeof e === 'string' && e.length > 0),
        `${key} ends`,
      )
    }
    for (const k of viewStrings) assertEquals(typeof d.simple[k], 'string', k)
    assert(!('size' in d.simple), 'the size label is gone with the size list')
  }
  assertEquals(Object.keys(PL.simple).sort(), Object.keys(EN.simple).sort())
  assertEquals(Object.keys(PL.simple.options).sort(), choiceKeys().sort(), 'no stale option groups')
})

// The lab picks the export cell size from the board: 1600 px on the longer
// side, between 1 and 18 px. The CLI simple mode uses the same function, so
// both render the same SVG for the same choice.
Deno.test('exportCell: 1600 px on the longer side, clamped to 1..18', () => {
  assertEquals(exportCell(25, 50), 18)
  assertEquals(exportCell(100, 200), 8)
  assertEquals(exportCell(400, 400), 4)
  assertEquals(exportCell(1000, 1000), 2)
  assertEquals(exportCell(4000, 1000), 1)
})
