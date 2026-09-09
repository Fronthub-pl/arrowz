// The safe envelope of the generator (prototype round 11), end to end: the
// narrowed ranges and the cross-knob rules the engine validates against, the
// refusal in generate(), and proof that validation left the algorithm alone.
// Run: node --test 'prototype/*.test.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  defaultParams,
  fingerprint,
  formatViolation,
  generate,
  INACTIVE_REASONS,
  PARAM_SPEC,
  RULE_REASONS,
  RULES,
  validateParams,
} from './engine.mjs'
import { PRESETS } from './lab-presets.ts'

const spec = (key) => PARAM_SPEC.find((s) => s.key === key)
const withDefaults = (over) => ({ ...defaultParams(), ...over })

// The envelope as measured on 2026-09-08 (~8100 runs without restarts, boards
// up to 400x400). Pinned here on purpose instead of read from PARAM_SPEC, so
// that a range drifting back to its old width fails this test. `old` are the
// former extremes that the measurements showed to jam or only cost time.
const NARROWED = [
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

test('envelope: the defaults validate clean', () => {
  assert.deepEqual(validateParams(defaultParams()), [])
})

test('envelope: every preset merged over the defaults validates clean', () => {
  let count = 0
  for (const level of PRESETS) {
    for (const o of level.options) {
      assert.deepEqual(validateParams(withDefaults(o.params)), [], `preset ${o.id}`)
      count++
    }
  }
  assert.ok(count >= 20, `${count} presets checked`)
})

test('envelope: PARAM_SPEC carries the narrowed ranges', () => {
  for (const n of NARROWED) {
    const s = spec(n.key)
    assert.ok(s, n.key)
    assert.equal(s.min, n.min, `${n.key} min`)
    assert.equal(s.max, n.max, `${n.key} max`)
    assert.ok(s.def >= n.min && s.def <= n.max, `${n.key} default ${s.def} inside ${n.min}..${n.max}`)
  }
})

test('envelope: each old extreme is a range violation naming min and max', () => {
  for (const n of NARROWED) {
    const label = spec(n.key).label
    for (const value of n.old) {
      const v = validateParams(withDefaults({ [n.key]: value }))
      assert.deepEqual(v, [{ kind: 'range', key: n.key, value, min: n.min, max: n.max }], `${n.key}=${value}`)
      assert.equal(formatViolation(v[0]), `${label}: ${value} is outside ${n.min}..${n.max}`)
    }
    // The bounds themselves are inside.
    assert.deepEqual(validateParams(withDefaults({ [n.key]: n.min })), [], `${n.key}=${n.min}`)
    assert.deepEqual(validateParams(withDefaults({ [n.key]: n.max })), [], `${n.key}=${n.max}`)
  }
})

test('envelope: a value that is not a finite number is a range violation', () => {
  for (const value of [NaN, Infinity, undefined, '0.85']) {
    const v = validateParams(withDefaults({ pStraight: value }))
    assert.equal(v.length, 1, String(value))
    assert.equal(v[0].kind, 'range')
    assert.equal(v[0].key, 'pStraight')
  }
})

test('envelope: keys outside PARAM_SPEC are ignored', () => {
  assert.deepEqual(validateParams(withDefaults({ ruleB: false, voidFrac: 2, trace: true, debug: 'x' })), [])
})

test('envelope: the three cross-knob rules exist with a reason each', () => {
  assert.deepEqual(RULES.map((r) => r.key), ['sharesSum', 'lmaxHole', 'mixHole'])
  for (const r of RULES) {
    assert.ok(Array.isArray(r.keys) && r.keys.length >= 1, r.key)
    for (const k of r.keys) assert.ok(spec(k), `${r.key} names unknown knob ${k}`)
    assert.equal(typeof RULE_REASONS[r.key], 'string', r.key)
    assert.equal(formatViolation({ kind: 'rule', key: r.key, keys: r.keys }), RULE_REASONS[r.key])
  }
})

const rule = (key) => [{ kind: 'rule', key, keys: RULES.find((r) => r.key === key).keys }]

test('rule sharesSum: short plus medium at most 0.9, at the boundary', () => {
  assert.deepEqual(validateParams(withDefaults({ wShort: 0.5, wMid: 0.4 })), [])
  assert.deepEqual(validateParams(withDefaults({ wShort: 0.7, wMid: 0.2 })), [])
  assert.deepEqual(validateParams(withDefaults({ wShort: 0.9, wMid: 0 })), [])
  assert.deepEqual(validateParams(withDefaults({ wShort: 0.5, wMid: 0.41 })), rule('sharesSum'))
  assert.deepEqual(validateParams(withDefaults({ wShort: 1, wMid: 0 })), rule('sharesSum'))
  assert.deepEqual(rule('sharesSum')[0].keys, ['wShort', 'wMid'])
})

test('rule lmaxHole: Lmax is 0 or at least 6, at the boundary', () => {
  assert.deepEqual(validateParams(withDefaults({ Lmax: 0 })), [])
  assert.deepEqual(validateParams(withDefaults({ Lmax: 6 })), [])
  assert.deepEqual(validateParams(withDefaults({ Lmax: 5000 })), [])
  for (const Lmax of [1, 3, 5]) {
    assert.deepEqual(validateParams(withDefaults({ Lmax })), rule('lmaxHole'), `Lmax=${Lmax}`)
  }
})

test('rule mixHole: mix is -1 or within 0.3..0.7, at the boundary', () => {
  for (const mix of [-1, 0.3, 0.5, 0.7]) assert.deepEqual(validateParams(withDefaults({ mix })), [], `mix=${mix}`)
  for (const mix of [0, 0.25, 0.75, 1]) {
    assert.deepEqual(validateParams(withDefaults({ mix })), rule('mixHole'), `mix=${mix}`)
  }
})

test('generate: refuses a violation with a RangeError carrying the violations', () => {
  assert.throws(
    () => generate({ W: 20, H: 20, seed: 1, pStraight: 0.3 }),
    (err) => {
      assert.ok(err instanceof RangeError, 'RangeError')
      assert.match(err.message, /invalid parameters/)
      assert.match(err.message, /straightness bias: 0\.3 is outside 0\.6\.\.1/)
      assert.equal(err.violations.length, 1)
      assert.equal(err.violations[0].key, 'pStraight')
      return true
    },
  )
})

test('generate: an in-envelope board still closes with the fingerprint recorded on main', () => {
  // Recorded on main (96b9d4a) before the envelope existed, with
  // `node -e` over engine.mjs and fingerprint(): validation must not touch
  // the algorithm, so the same call gives the same board.
  const r = generate({ W: 40, H: 40, seed: 1, restarts: 0 })
  assert.equal(r.ok, true)
  assert.equal(r.restartsUsed, 0)
  assert.equal(fingerprint(r.board), 'fb7e5f93')
})

test('inactive: giantStraight and giantWarns act at every serpentine step', () => {
  const on = withDefaults({ giants: 4, giantStep: 3 })
  const off = withDefaults({ giants: 0, wGiant: 0 })
  for (const key of ['giantStraight', 'giantWarns']) {
    assert.equal(spec(key).inactive(on), null, `${key} with giants 4, giantStep 3`)
    assert.equal(spec(key).inactive(withDefaults({ giants: 4, giantStep: 0 })), null, `${key} with giantStep 0`)
    assert.equal(spec(key).inactive(withDefaults({ giants: 0, wGiant: 0.1 })), null, `${key} with wGiant only`)
    assert.equal(spec(key).inactive(off), 'skeletonOff', `${key} with no skeleton`)
  }
  // giantJitter alone keeps the step rule.
  assert.equal(spec('giantJitter').inactive(withDefaults({ giants: 4, giantStep: 0 })), 'stepZero')
  assert.equal(spec('giantJitter').inactive(on), null)
  assert.equal('stepNonZero' in INACTIVE_REASONS, false, 'stepNonZero reason removed')
})
