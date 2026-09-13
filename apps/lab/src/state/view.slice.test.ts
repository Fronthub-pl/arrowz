import { DEFAULT_VIEW, VIEW_RANGE } from '@arrowz/engine/command'
import { expect, test } from 'vitest'
import { useStore } from './store'
import { viewOf } from './view.slice'

const view = () => useStore.getState().view

test('the fields start where the old lab starts them', () => {
  expect(view().cell).toBe(12)
  expect(view().stroke).toBe(DEFAULT_VIEW.stroke)
  expect(view().rounded).toBe(true)
  expect(view().hilite).toBe(true)
  expect(view().voids).toBe(true)
  expect(view().colored).toBe(false)
  expect(view().top).toBe(5)
})

test('an empty field falls back to the default rather than to zero', () => {
  view().setNumber('headHeight', '')
  // Number('') is 0, and a head of no height is a real setting nobody asks
  // for by clearing a box (command.ts, viewNumberOf).
  expect(view().headHeight).toBe(DEFAULT_VIEW.headHeight)
})

test('a typed-over value is clamped into what the CLI takes', () => {
  view().setNumber('cell', '9999')
  expect(view().cell).toBe(VIEW_RANGE.cell.max)
  view().setNumber('stroke', '-4')
  expect(view().stroke).toBe(VIEW_RANGE.stroke.min)
})

test('a whole field rounds', () => {
  view().setNumber('top', '7.6')
  expect(view().top).toBe(8)
})

test('the highlight flag is what zeroes top, because the CLI has no flag for it', () => {
  view().setNumber('top', '9')
  expect(viewOf(view()).top).toBe(9)
  view().toggle('hilite')
  expect(viewOf(view()).top).toBe(0)
  // The number itself survives the flag, so switching back restores it.
  expect(view().top).toBe(9)
  view().toggle('hilite')
})

test('voids is not part of the view: the CLI has no such flag', () => {
  expect('voids' in viewOf(view())).toBe(false)
})

test('a flag set to the value a link states stays there, however often it is stated', () => {
  // `toggle` flips, so a link naming a flag twice would flip it back; a link
  // states a value, and stating it again has to be a no-op.
  view().setFlag('colored', true)
  view().setFlag('colored', true)
  expect(view().colored).toBe(true)
  view().setFlag('colored', false)
  expect(view().colored).toBe(false)
})
