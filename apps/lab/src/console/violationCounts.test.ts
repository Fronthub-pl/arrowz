import { defaultParams, validateParams, type Violation } from '@arrowz/engine'
import { expect, test } from 'vitest'
import { countsByGroup } from './violationCounts'

test('a range violation counts against the knob it names', () => {
  const v: Violation = { kind: 'range', key: 'warns', value: 99, min: 2, max: 16 }
  expect(countsByGroup([v])).toEqual({ shape: 1 })
})

test("the engine's own floor rule counts once, in shape", () => {
  // Not a hand-written violation: the real one, so the test cannot drift from
  // the table. straightFloor names pStraight, warns and anticoil — all shape.
  const real = validateParams({ ...defaultParams(), W: 900, H: 900, pStraight: 0.6 })
  expect(real.some((v) => v.kind === 'rule' && v.key === 'straightFloor')).toBe(true)
  expect(countsByGroup(real)).toEqual({ shape: 1 })
})

test('a rule spanning two groups would count once in each, not once per knob', () => {
  // No rule in RULES spans groups today; this is the guard for the one that
  // does. Without the per-group dedup it would read `{ shape: 3, board: 2 }`.
  const spanning: Violation = {
    kind: 'rule',
    key: 'straightFloor',
    keys: ['pStraight', 'warns', 'anticoil', 'W', 'H'],
    need: 0.75,
  }
  expect(countsByGroup([spanning])).toEqual({ shape: 1, board: 1 })
})

test('a group with nothing wrong has no entry', () => {
  expect(countsByGroup([])).toEqual({})
})
