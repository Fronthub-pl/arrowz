import { expect, test } from 'vitest'
import { DEFAULT_VIEW } from '../src/mod.ts'
import { ATTRIBUTES, type Control, type NumberControl, VIEW_CONTROLS, viewRecord, withField } from './controls.ts'

test('a number field takes the number, the rest of the view is untouched', () => {
  const view = withField(DEFAULT_VIEW, 'stroke', 0.8)
  expect(view.stroke).toBe(0.8)
  expect(view.ink).toBe(DEFAULT_VIEW.ink)
})

test('a flag field takes the flag', () => {
  expect(withField(DEFAULT_VIEW, 'colored', true).colored).toBe(true)
})

test('an id the table does not know leaves the view as it was', () => {
  expect(withField(DEFAULT_VIEW, 'nope', 1)).toEqual(DEFAULT_VIEW)
})

test('every view control names a field the view actually has', () => {
  const fields = Object.keys(viewRecord(DEFAULT_VIEW))
  expect(VIEW_CONTROLS.map((c) => c.id).sort()).toEqual(fields.sort())
})

test('every attribute control declares a default of the kind it claims', () => {
  for (const control of ATTRIBUTES) {
    const kind = control.kind === 'bool' ? 'boolean' : control.kind === 'number' ? 'number' : 'string'
    expect(typeof control.def).toBe(kind)
  }
})

const isNumberControl = (c: Control): c is NumberControl => c.kind === 'number'

test('the view ranges are the ones the lab offers', () => {
  const ranges = Object.fromEntries(
    VIEW_CONTROLS.filter(isNumberControl).map((c) => [c.id, [c.min, c.max, c.step]]),
  )
  expect(ranges).toEqual({
    stroke: [0.2, 0.9, 0.05],
    headWidth: [0, 0.9, 0.05],
    headHeight: [0.1, 1, 0.05],
    top: [0, 50, 1],
  })
})

test('every number control has a default inside its own range', () => {
  for (const control of [...ATTRIBUTES, ...VIEW_CONTROLS]) {
    if (control.kind !== 'number') continue
    expect(control.def).toBeGreaterThanOrEqual(control.min)
    expect(control.def).toBeLessThanOrEqual(control.max)
  }
})
