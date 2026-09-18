import { VIEW_RANGE } from '@arrowz/engine/command'
import { expect, test } from 'vitest'
import { VIEW_FIELDS } from './viewFields'
// `ViewNumber` comes from the root export; `VIEW_RANGE` from /command.

test('a step is a step a whole-number field can land on', () => {
  // Once the bounds are read from `VIEW_RANGE` rather than restated, they can
  // no longer disagree with the CLI, but the step still can — a fractional step
  // on a field the store rounds would make every arrow press either a no-op or
  // a jump of one, depending on where the value already sat.
  for (const field of VIEW_FIELDS) {
    const range = VIEW_RANGE[field.field]
    expect(field.step).toBeGreaterThan(0)
    expect(field.step).toBeLessThanOrEqual(range.max - range.min)
    if (range.whole) expect(Number.isInteger(field.step)).toBe(true)
  }
})

test('the table covers every number the view has', () => {
  // Against `VIEW_RANGE`'s own keys and not a literal: this file guards the
  // bounds where they are read, and `VIEW_RANGE` is typed
  // `Record<ViewNumber, …>`, so a sixth view number shows up here the day it is
  // added rather than the day somebody remembers to widen a list.
  expect(VIEW_FIELDS.map((f) => f.field).sort()).toEqual(Object.keys(VIEW_RANGE).sort())
})
