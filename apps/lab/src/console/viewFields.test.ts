import { pieceShape } from '@arrowz/engine'
import { VIEW_RANGE } from '@arrowz/engine/command'
import { expect, test } from 'vitest'
import { autoHeadWidth, VIEW_FIELDS, VIEW_ROWS } from './viewFields'
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

// Handoff 2, PR 3: every preview number is drawn as a row, so the row table
// covers the same numbers the field table does.
test('every preview number has a row: a short label and a description', () => {
  expect(Object.keys(VIEW_ROWS).sort()).toEqual(VIEW_FIELDS.map((f) => f.field).sort())
  for (const row of Object.values(VIEW_ROWS)) {
    expect(row.short.startsWith('viewShort')).toBe(true)
    expect(row.help.length).toBeGreaterThan(0)
  }
  // Only the head width has an automatic value, and only that one's 0 is it.
  expect(
    Object.entries(VIEW_ROWS)
      .filter(([, row]) => row.auto === true)
      .map(([key]) => key),
  ).toEqual(['headWidth'])
})

// The released chip lands on the width the automatic head draws: checked
// against the engine's own shape rather than restated. At a step fine enough
// not to round, a head drawn at that width is the automatic head, point for
// point, on both sides of the stroke where the rule changes (0.5).
test.each([0.2, 0.3, 0.45, 0.5, 0.8])('the automatic head width at stroke %d is the one the engine draws', (stroke) => {
  const piece = {
    id: 0,
    dir: 0,
    cells: [
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
    ],
  }
  const base = { cell: 100, pad: 0, width: stroke * 100, headHeight: 1 }
  const auto = pieceShape(piece, { ...base, headWidth: 0 })
  const stated = pieceShape(piece, { ...base, headWidth: autoHeadWidth(stroke, 1e-9, 10) })
  expect(stated.head).toEqual(auto.head)
})

test('the released width is snapped to the step and held under the ceiling', () => {
  expect(autoHeadWidth(0.2, 0.05, 0.9)).toBe(0.6)
  expect(autoHeadWidth(0.5, 0.05, 0.9)).toBe(0.5)
  expect(autoHeadWidth(0.9, 0.05, 0.8)).toBe(0.8)
})
