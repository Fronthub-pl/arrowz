import { pieceShape } from '@arrowz/engine'
import { VIEW_RANGE } from '@arrowz/engine/command'
import { expect, test } from 'vitest'
import { VIEW_KEYS } from '../state/viewSchema'
import { autoHeadWidth, VIEW_FLAGS, VIEW_NUMBERS, VIEW_ROWS } from './viewFields'

test('a step is a step a whole-number field can land on', () => {
  // A fractional step on a field the store rounds makes an arrow press a no-op or a jump of one.
  for (const field of VIEW_NUMBERS) {
    const range = VIEW_RANGE[field]
    const { step } = VIEW_ROWS[field]
    expect(step).toBeGreaterThan(0)
    expect(step).toBeLessThanOrEqual(range.max - range.min)
    if (range.whole) expect(Number.isInteger(step)).toBe(true)
  }
})

test('the numbers are every number the view has', () => {
  // Against `VIEW_RANGE`'s keys, not a literal, so a new view number fails here the day it is added.
  expect([...VIEW_NUMBERS].sort()).toEqual(Object.keys(VIEW_RANGE).sort())
})

test('every row is a view field, and every number and flag has a row with a short label and a description', () => {
  const rows = Object.keys(VIEW_ROWS)
  expect(rows.sort()).toEqual([...VIEW_NUMBERS, ...VIEW_FLAGS].sort())
  for (const key of rows) expect(VIEW_KEYS).toContain(key)
  for (const key of [...VIEW_NUMBERS, ...VIEW_FLAGS]) {
    expect(VIEW_ROWS[key].short.startsWith('viewShort')).toBe(true)
    expect(VIEW_ROWS[key].help.length).toBeGreaterThan(0)
  }
  // Only the head width has an automatic value.
  expect(VIEW_NUMBERS.filter((key) => VIEW_ROWS[key].auto === true)).toEqual(['headWidth'])
  expect(VIEW_ROWS.headWidth.help).toBe('headWidthHelp')
  expect(VIEW_ROWS.stroke.unit).toBe('cells')
  expect(VIEW_ROWS.top.unit).toBe('arrows')
  expect(VIEW_ROWS.rounded.label).toBe('rounded')
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
