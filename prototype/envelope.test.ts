// The safe envelope of the generator (prototype round 11), end to end: the
// narrowed ranges and the cross-knob rules the engine validates against, the
// refusal in generate(), and proof that validation left the algorithm alone.
// Run: deno test --allow-read --allow-run prototype/
import { assert, assertEquals, assertMatch, assertThrows } from '@std/assert'
import {
  defaultParams,
  fingerprint,
  formatViolation,
  generate,
  INACTIVE_REASONS,
  InvalidParamsError,
  PARAM_SPEC,
  RULE_REASONS,
  RULES,
  validateParams,
} from './engine.ts'
import { PRESETS } from './lab-presets.ts'
import type { InactiveKey, ParamKey, Params, ParamSpec, RuleKey, Violation } from './types.ts'

/** A knob's spec; every key used here is a PARAM_SPEC key, so a miss is a test bug. */
const spec = (key: ParamKey): ParamSpec => {
  const s = PARAM_SPEC.find((s) => s.key === key)
  if (!s) throw new Error(`unknown parameter ${key}`)
  return s
}
/** The inactive rule of a knob that has one. */
const inactiveOf = (key: ParamKey): (p: Params) => InactiveKey | null => {
  const f = spec(key).inactive
  if (!f) throw new Error(`${key} has no inactive rule`)
  return f
}
const withDefaults = (over: Partial<Params>): Params => ({ ...defaultParams(), ...over })
/** The defaults with one knob set by key. */
const withKnob = (key: ParamKey, value: number): Params => {
  const p = defaultParams()
  p[key] = value
  return p
}
/** A parameter set with junk in it, for the validation tests only: the one cast of this file. */
const withRaw = (over: Record<string, unknown>): Params => ({ ...defaultParams(), ...over } as Params)

// The envelope as measured on 2026-09-08 (~8100 runs without restarts, boards
// up to 400x400). Pinned here on purpose instead of read from PARAM_SPEC, so
// that a range drifting back to its old width fails this test. `old` are the
// former extremes that the measurements showed to jam or only cost time.
const NARROWED: { key: ParamKey; min: number; max: number; old: number[] }[] = [
  { key: 'pStraight', min: 0.6, max: 1, old: [0, 0.3] },
  { key: 'warns', min: 2, max: 16, old: [0, 1] },
  { key: 'anticoil', min: 1, max: 10, old: [20] },
  { key: 'absorbLimit', min: 12, max: 64, old: [0] },
  { key: 'strandLimit', min: 10, max: 30, old: [2] },
  { key: 'headTries', min: 2, max: 16, old: [1, 32] },
  { key: 'maxBack', min: 0, max: 1000, old: [200000] },
  { key: 'restarts', min: 0, max: 5, old: [10] },
  { key: 'wGiant', min: 0, max: 0.2, old: [0.5] },
  { key: 'giantStraight', min: 0.3, max: 1, old: [0] },
  { key: 'giantSpacing', min: 1, max: 3, old: [6] },
]

Deno.test('envelope: the defaults validate clean', () => {
  assertEquals(validateParams(defaultParams()), [])
})

Deno.test('envelope: every preset merged over the defaults validates clean', () => {
  let count = 0
  for (const level of PRESETS) {
    for (const o of level.options) {
      assertEquals(validateParams(withDefaults(o.params)), [], `preset ${o.id}`)
      count++
    }
  }
  assert(count >= 20, `${count} presets checked`)
})

Deno.test('envelope: PARAM_SPEC carries the narrowed ranges', () => {
  for (const n of NARROWED) {
    const s = spec(n.key)
    assert(s, n.key)
    assertEquals(s.min, n.min, `${n.key} min`)
    assertEquals(s.max, n.max, `${n.key} max`)
    assert(s.def >= n.min && s.def <= n.max, `${n.key} default ${s.def} inside ${n.min}..${n.max}`)
  }
})

Deno.test('envelope: each old extreme is a range violation naming min and max', () => {
  for (const n of NARROWED) {
    const label = spec(n.key).label
    for (const value of n.old) {
      const v = validateParams(withKnob(n.key, value))
      assertEquals(v, [{ kind: 'range', key: n.key, value, min: n.min, max: n.max }], `${n.key}=${value}`)
      const first = v[0]
      assert(first, `${n.key}=${value}: a violation`)
      assertEquals(formatViolation(first), `${label}: ${value} is outside ${n.min}..${n.max}`)
    }
    // The bounds themselves are inside.
    assertEquals(validateParams(withKnob(n.key, n.min)), [], `${n.key}=${n.min}`)
    assertEquals(validateParams(withKnob(n.key, n.max)), [], `${n.key}=${n.max}`)
  }
})

Deno.test('envelope: a value that is not a finite number is a range violation', () => {
  for (const value of [NaN, Infinity, undefined, '0.85']) {
    const v = validateParams(withRaw({ pStraight: value }))
    assertEquals(v.length, 1, String(value))
    const first = v[0]
    assert(first, String(value))
    assertEquals(first.kind, 'range')
    assertEquals(first.key, 'pStraight')
  }
})

Deno.test('envelope: keys outside PARAM_SPEC are ignored', () => {
  assertEquals(validateParams(withRaw({ ruleB: false, voidFrac: 2, trace: true, debug: 'x' })), [])
})

Deno.test('envelope: the three cross-knob rules exist with a reason each', () => {
  assertEquals(RULES.map((r) => r.key), ['sharesSum', 'lmaxHole', 'mixHole'])
  for (const r of RULES) {
    assert(Array.isArray(r.keys) && r.keys.length >= 1, r.key)
    for (const k of r.keys) assert(spec(k), `${r.key} names unknown knob ${k}`)
    assertEquals(typeof RULE_REASONS[r.key], 'string', r.key)
    assertEquals(formatViolation({ kind: 'rule', key: r.key, keys: r.keys }), RULE_REASONS[r.key])
  }
})

const rule = (key: RuleKey): Violation[] => {
  const r = RULES.find((r) => r.key === key)
  if (!r) throw new Error(`unknown rule ${key}`)
  return [{ kind: 'rule', key, keys: r.keys }]
}

Deno.test('rule sharesSum: short plus medium at most 0.9, at the boundary', () => {
  assertEquals(validateParams(withDefaults({ wShort: 0.5, wMid: 0.4 })), [])
  assertEquals(validateParams(withDefaults({ wShort: 0.7, wMid: 0.2 })), [])
  assertEquals(validateParams(withDefaults({ wShort: 0.9, wMid: 0 })), [])
  assertEquals(validateParams(withDefaults({ wShort: 0.5, wMid: 0.41 })), rule('sharesSum'))
  assertEquals(validateParams(withDefaults({ wShort: 1, wMid: 0 })), rule('sharesSum'))
  const first = rule('sharesSum')[0]
  assert(first)
  assertEquals(first.kind === 'rule' ? first.keys : null, ['wShort', 'wMid'])
})

Deno.test('rule lmaxHole: Lmax is 0 or at least 6, at the boundary', () => {
  assertEquals(validateParams(withDefaults({ Lmax: 0 })), [])
  assertEquals(validateParams(withDefaults({ Lmax: 6 })), [])
  assertEquals(validateParams(withDefaults({ Lmax: 5000 })), [])
  for (const Lmax of [1, 3, 5]) {
    assertEquals(validateParams(withDefaults({ Lmax })), rule('lmaxHole'), `Lmax=${Lmax}`)
  }
})

Deno.test('rule mixHole: mix is -1 or within 0.3..0.7, at the boundary', () => {
  for (const mix of [-1, 0.3, 0.5, 0.7]) assertEquals(validateParams(withDefaults({ mix })), [], `mix=${mix}`)
  for (const mix of [0, 0.25, 0.75, 1]) {
    assertEquals(validateParams(withDefaults({ mix })), rule('mixHole'), `mix=${mix}`)
  }
})

Deno.test('generate: refuses a violation with a RangeError carrying the violations', () => {
  const err = assertThrows(
    () => generate(withDefaults({ W: 20, H: 20, seed: 1, pStraight: 0.3 })),
    InvalidParamsError,
    'invalid parameters',
  )
  assert(err instanceof RangeError, 'RangeError')
  assertMatch(err.message, /straightness bias: 0\.3 is outside 0\.6\.\.1/)
  assertEquals(err.violations.length, 1)
  const first = err.violations[0]
  assert(first)
  assertEquals(first.key, 'pStraight')
})

Deno.test('generate: an in-envelope board still closes with the fingerprint recorded on main', () => {
  // Recorded on main (96b9d4a) before the envelope existed, with
  // `node -e` over engine.mjs and fingerprint(): validation must not touch
  // the algorithm, so the same call gives the same board.
  const r = generate(withDefaults({ W: 40, H: 40, seed: 1, restarts: 0 }))
  assertEquals(r.ok, true)
  assertEquals(r.restartsUsed, 0)
  assertEquals(fingerprint(r.board), 'fb7e5f93')
})

Deno.test('inactive: giantStraight and giantWarns act at every serpentine step', () => {
  const on = withDefaults({ giants: 4, giantStep: 3 })
  const off = withDefaults({ giants: 0, wGiant: 0 })
  const keys: ParamKey[] = ['giantStraight', 'giantWarns']
  for (const key of keys) {
    const inactive = inactiveOf(key)
    assertEquals(inactive(on), null, `${key} with giants 4, giantStep 3`)
    assertEquals(inactive(withDefaults({ giants: 4, giantStep: 0 })), null, `${key} with giantStep 0`)
    assertEquals(inactive(withDefaults({ giants: 0, wGiant: 0.1 })), null, `${key} with wGiant only`)
    assertEquals(inactive(off), 'skeletonOff', `${key} with no skeleton`)
  }
  // giantJitter alone keeps the step rule.
  assertEquals(inactiveOf('giantJitter')(withDefaults({ giants: 4, giantStep: 0 })), 'stepZero')
  assertEquals(inactiveOf('giantJitter')(on), null)
  assertEquals('stepNonZero' in INACTIVE_REASONS, false, 'stepNonZero reason removed')
})
