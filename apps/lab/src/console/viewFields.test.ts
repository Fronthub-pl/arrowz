import { VIEW_RANGE } from '@arrowz/engine/command'
import { expect, test } from 'vitest'
import { VIEW_FIELDS } from './viewFields'
// `ViewNumber` comes from the root export; `VIEW_RANGE` from /command.

test('no field offers a number the CLI would refuse', () => {
  // The successor to carve.test.ts:456-480, which checks the same thing
  // against lab.html — a file PR 8 deletes.
  for (const field of VIEW_FIELDS) {
    const range = VIEW_RANGE[field.field]
    expect(field.min).toBeGreaterThanOrEqual(range.min)
    expect(field.max).toBeLessThanOrEqual(range.max)
    expect(field.min).toBeLessThan(field.max)
  }
})

test('the table covers every number the view has', () => {
  expect(VIEW_FIELDS.map((f) => f.field).sort()).toEqual(['cell', 'headHeight', 'headWidth', 'stroke', 'top'])
})
