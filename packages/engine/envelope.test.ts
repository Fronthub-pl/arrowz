// The safe envelope of the generator (prototype round 11), end to end: the
// narrowed ranges and the cross-knob rules the engine validates against, the
// refusal in generate(), and proof that validation left the algorithm alone.
// Run: deno test --allow-read --allow-run packages/engine/
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
  snapToStep,
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
// up to 400x400), and narrowed again on 2026-09-12 wherever a knob's own
// arithmetic makes its far end mean nothing. Pinned here on purpose instead of
// read from PARAM_SPEC, so that a range drifting back to its old width fails
// this test. `old` are the former extremes; `with` holds the companion knobs a
// bound needs so that reaching it does not break a cross-knob rule.
const NARROWED: { key: ParamKey; min: number; max: number; old: number[]; with?: Partial<Params> }[] = [
  { key: 'pStraight', min: 0.6, max: 1, old: [0, 0.3] },
  { key: 'warns', min: 2, max: 16, old: [0, 1] },
  { key: 'anticoil', min: 1, max: 10, old: [20] },
  { key: 'absorbLimit', min: 12, max: 64, old: [0] },
  { key: 'headTries', min: 2, max: 16, old: [1, 32] },
  // The old 0 was an "auto" the engine read as 200, so the slider ran
  // 0 (=200), 50, 100 ... and got STRICTER as it moved right, with 200
  // duplicating 0 under a second board id. The number stands for itself now.
  { key: 'maxBack', min: 50, max: 1000, old: [0, 200000] },
  { key: 'restarts', min: 0, max: 5, old: [10] },
  { key: 'wGiant', min: 0, max: 0.2, old: [0.5] },
  // Straightness is a weight of pStraight / (1 - pStraight): it is 1 at 0.5
  // and BELOW 1 under it, so a knob named after straightness used to punish
  // going straight. 0.5 is where it stops arguing with its own label.
  { key: 'giantStraight', min: 0.5, max: 1, old: [0, 0.3] },
  { key: 'giantSpacing', min: 1, max: 3, old: [6] },
  // sharesSum caps short plus medium at 0.9, so the top tenth of each share
  // was a value with no legal partner.
  { key: 'wShort', min: 0, max: 0.9, old: [1], with: { wMid: 0 } },
  { key: 'wMid', min: 0, max: 0.9, old: [1], with: { wShort: 0 } },
  // A probe draws max(4, round(probeLen * (0.5 + r))), so 2 and 3 both draw 4
  // every single time: measured on 40x40 with probe 1, one fingerprint for both.
  { key: 'probeLen', min: 4, max: 200, old: [2, 3] },
  // Only --start writes the mixing share, and it spells 0.3 to 0.7.
  { key: 'mix', min: -1, max: 0.7, old: [1] },
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
      // A value the range refuses often breaks a cross-knob rule as well — a
      // share of 1 has no partner left. The rules are another test's business.
      const v = validateParams({ ...withKnob(n.key, value), ...n.with }).filter((x) => x.kind !== 'rule')
      assertEquals(v, [{ kind: 'range', key: n.key, value, min: n.min, max: n.max }], `${n.key}=${value}`)
      const first = v[0]
      assert(first, `${n.key}=${value}: a violation`)
      assertEquals(formatViolation(first), `${label}: ${value} is outside ${n.min}..${n.max}`)
    }
    // The bounds themselves are inside, rules and all.
    for (const bound of [n.min, n.max]) {
      assertEquals(validateParams({ ...withKnob(n.key, bound), ...n.with }), [], `${n.key}=${bound}`)
    }
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
  assertEquals(RULES.map((r) => r.key), ['sharesSum', 'lmaxHole', 'startPair'])
  for (const r of RULES) {
    assert(Array.isArray(r.keys) && r.keys.length >= 1, r.key)
    for (const k of r.keys) assert(spec(k), `${r.key} names unknown knob ${k}`)
    assertEquals(typeof RULE_REASONS[r.key], 'string', r.key)
    assertEquals(formatViolation({ kind: 'rule', key: r.key, keys: r.keys }), RULE_REASONS[r.key])
  }
})

// A step the surfaces cannot reach the end of would make the maximum
// unspellable: the lab slider stops short of it and the flag that prints the
// value back is refused. Every default has to be a stop too, or the untouched
// board would not validate.
Deno.test('envelope: every knob range is a whole number of steps, and every default is a stop', () => {
  /** Whether a value is one of the stops the lab slider offers for a knob. */
  const onStep = (value: number, s: ParamSpec): boolean => {
    const k = (value - s.min) / s.step
    return Math.abs(k - Math.round(k)) < 1e-9
  }
  for (const s of PARAM_SPEC) {
    assert(s.step > 0, `${s.key} has step ${s.step}`)
    assert(onStep(s.max, s), `${s.key}: max ${s.max} is not a whole number of ${s.step} from ${s.min}`)
    assert(onStep(s.def, s), `${s.key}: default ${s.def} is off the step ${s.step}`)
    // The knob alone, at its far end: a step violation there would put the
    // maximum out of reach of both surfaces. Cross-knob rules are another
    // test's business — wShort at 1 breaks sharesSum, and rightly so.
    const atMax = validateParams(withKnob(s.key, s.max)).filter((v) => v.kind === 'step')
    assertEquals(atMax, [], `${s.key} max ${s.max}`)
  }
})

// Everything that writes a knob from outside — the draw of the simple view,
// a preset, a URL, a stored board — goes onto the grid through this one
// formula, so a loaded value can always be generated with.
Deno.test('snapToStep: the nearest stop, counted from the knob minimum', () => {
  assertEquals(snapToStep(24, 50, 0), 0)
  // Exactly between two stops the larger one wins, as it does for the range
  // input the lab draws the knob with.
  assertEquals(snapToStep(25, 50, 0), 50)
  assertEquals(snapToStep(0.33, 0.05, -1), 0.35)
  assertEquals(snapToStep(0.855, 0.01, 0), 0.86)
  // A stop stays where it is, and the result carries no float dust.
  for (const [value, step, min] of [[0.3, 0.05, -1], [0.85, 0.01, 0], [1000, 50, 0]] as const) {
    assertEquals(snapToStep(value, step, min), value, `${value}`)
  }
  // Every knob: a value a hair off any stop lands back on it and validates.
  for (const s of PARAM_SPEC) {
    const off = s.min + 1.4 * s.step
    const snapped = snapToStep(off, s.step, s.min)
    assertEquals(validateParams(withKnob(s.key, snapped)).filter((v) => v.kind === 'step'), [], s.key)
  }
})

Deno.test('envelope: a step violation names the knob, the step and the two stops around the value', () => {
  const v: Violation = { kind: 'step', key: 'maxBack', value: 75, step: 50, min: 50 }
  const text = formatViolation(v)
  assert(text.includes(spec('maxBack').label), text)
  assert(text.includes('75'), text)
  assert(text.includes('50'), text)
  assert(text.includes('100'), text)
})

Deno.test('envelope: the knob table holds 26 keys, and the retired ones are gone', () => {
  assertEquals(PARAM_SPEC.length, 26)
  for (const gone of ['hug', 'edgeHug', 'strandLimit', 'giantWarns', 'giantSpacePenalty']) {
    assert(!PARAM_SPEC.some((s) => String(s.key) === gone), `${gone} is still a knob`)
  }
  // headBias and mix stay stored, but the surface shows one control for both.
  for (const key of ['headBias', 'mix'] as const) assertEquals(spec(key).surface, 'start')
  assertEquals(spec('giantSpan').min, 1)
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
  // Both shares inside their own range, the sum over the cap: the rule is the
  // only thing that can say it.
  assertEquals(validateParams(withDefaults({ wShort: 0.9, wMid: 0.01 })), rule('sharesSum'))
  const first = rule('sharesSum')[0]
  assert(first)
  assertEquals(first.kind === 'rule' ? first.keys : null, ['wShort', 'wMid'])
})

Deno.test('rule lmaxHole: Lmax is 0 or at least 17, at the boundary', () => {
  assertEquals(validateParams(withDefaults({ Lmax: 0 })), [])
  assertEquals(validateParams(withDefaults({ Lmax: 17 })), [])
  assertEquals(validateParams(withDefaults({ Lmax: 5000 })), [])
  for (const Lmax of [1, 3, 5, 6, 10, 16]) {
    assertEquals(validateParams(withDefaults({ Lmax })), rule('lmaxHole'), `Lmax=${Lmax}`)
  }
})

// Why the floor moved from 6 up to 17. The cap cuts the length buckets from
// the top, and 17 is the first value that cuts none of them: the medium bucket
// runs to 15, the long one starts at 16 and is drawn between 16 and max(17,
// cap). Under a lower cap the medium and the long bucket both return the cap
// itself, and both spend exactly one random draw doing it — so the share
// between them changes nothing whatsoever, while the board id says it did.
Deno.test('rule lmaxHole: under the old floor the medium share was dead weight', () => {
  const board = (Lmax: number, wMid: number): string =>
    fingerprint(generate(withDefaults({ W: 40, H: 40, Lmax, wMid }), { unchecked: true }).board)
  assertEquals(board(6, 0.08), board(6, 0.7), 'cap 6: the share of medium pieces changed nothing')
  assert(board(17, 0.08) !== board(17, 0.7), 'cap 17: the share is back in play')
})

// Why the probe length starts at 4: the drawn length is max(4, round(probeLen
// * (0.5 + r))), and for 2 and 3 the rounded part never reaches 4.
Deno.test('probe length: below 4 every probe came out the same length', () => {
  const board = (probeLen: number): string =>
    fingerprint(generate(withDefaults({ W: 40, H: 40, probe: 1, probeLen }), { unchecked: true }).board)
  assertEquals(board(2), board(3), 'probe lengths 2 and 3 drew the same board')
  assert(board(3) !== board(4), 'probe length 4 draws its own board')
})

// The backtrack budget used to be zero for "auto", which the engine read as
// 200 — two stored values, one board, two ids, and a slider that grew
// stricter as it moved right. The number is the value now; `auto` is a
// spelling of it (see command.test.ts), and the default is what auto meant.
Deno.test('envelope: the backtrack budget is a plain number, not a sentinel', () => {
  assertEquals(spec('maxBack').def, 200)
  assertEquals(validateParams(withDefaults({ maxBack: 0 })), [
    { kind: 'range', key: 'maxBack', value: 0, min: 50, max: 1000 },
  ])
  // The label no longer has to explain a hole in its own range.
  assert(!spec('maxBack').label.includes('auto'), spec('maxBack').label)
})

// Width, height and seed step by 1, so the step says what the wholeNumbers
// rule used to say, one knob at a time: a fraction here would go into the
// board id and so into a file name.
Deno.test('a fractional size or seed is off the step of 1, and names only itself', () => {
  assertEquals(validateParams(withDefaults({ W: 10, H: 12, seed: 0 })), [])
  const cases: readonly [Partial<Params>, ParamKey, number][] = [
    [{ W: 10.5 }, 'W', 10.5],
    [{ H: 12.25 }, 'H', 12.25],
    [{ seed: 1.5 }, 'seed', 1.5],
  ]
  for (const [over, key, value] of cases) {
    const expected: Violation[] = [{ kind: 'step', key, value, step: 1, min: spec(key).min }]
    assertEquals(validateParams(withDefaults(over)), expected, JSON.stringify(over))
  }
  // Two fractions, two complaints, each naming its own knob.
  assertEquals(validateParams(withDefaults({ W: 10.5, seed: 1.5 })).length, 2)
})

// --start is the only way to write the two stored knobs, so a stored pair it
// cannot spell has no command text: --start=0.5 reads back as a mixing share,
// and (headBias 1, mix 0.5) carves the board (0, 0.5) carves while hashing to
// another id. The rule makes flag and pair a bijection.
Deno.test('rule startPair: only a pair --start can spell', () => {
  // Mixing off: the three whole-number starts the words spell.
  for (const headBias of [-1, 0, 1]) {
    assertEquals(validateParams(withDefaults({ headBias, mix: -1 })), [], `headBias=${headBias}`)
  }
  // Mixing on: the start is 0 and the share is the number --start takes.
  for (const mix of [0.3, 0.5, 0.7]) assertEquals(validateParams(withDefaults({ headBias: 0, mix })), [], `mix=${mix}`)
  // A start between the words, with mixing off: --start=0.5 would read back as
  // a share. It is also off the step of the knob, and both are said.
  assertEquals(validateParams(withDefaults({ headBias: 0.5, mix: -1 })), [
    { kind: 'step', key: 'headBias', value: 0.5, step: 1, min: -1 },
    ...rule('startPair'),
  ])
  // A start of its own beside a share: the engine ignores it, the board id does not.
  assertEquals(validateParams(withDefaults({ headBias: 1, mix: 0.5 })), rule('startPair'))
  assertEquals(validateParams(withDefaults({ headBias: -1, mix: 0.5 })), rule('startPair'))
  // The hole of the share range, and the mix of 0 that is a third behaviour.
  // Above 0.7 the knob's own range now speaks first, so the rule is left with
  // the gap between the sentinel and the window.
  for (const mix of [0, 0.2] as const) {
    assertEquals(validateParams(withDefaults({ headBias: 0, mix })), rule('startPair'), `mix=${mix}`)
  }
  const first = rule('startPair')[0]
  assert(first)
  assertEquals(first.kind === 'rule' ? first.keys : null, ['headBias', 'mix'])
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
  // Recorded on main (96b9d4a) before the envelope existed, on the Node
  // prototype with fingerprint(): validation must not touch the algorithm,
  // so the same call gives the same board.
  const r = generate(withDefaults({ W: 40, H: 40, seed: 1, restarts: 0 }))
  assertEquals(r.ok, true)
  assertEquals(r.restartsUsed, 0)
  assertEquals(fingerprint(r.board), 'fb7e5f93')
})

Deno.test('inactive: giantStraight acts at every serpentine step', () => {
  const on = withDefaults({ giants: 4, giantStep: 3 })
  const off = withDefaults({ giants: 0, wGiant: 0 })
  const keys: ParamKey[] = ['giantStraight']
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

// The retired knobs were inert at their defaults: pinning them as constants
// must reproduce the board a default run gave before this change.
Deno.test('retiring the dead knobs leaves the default board untouched', () => {
  const r = generate({ ...defaultParams(), W: 60, H: 60, seed: 11 })
  assertEquals(fingerprint(r.board), '20244258')
})
