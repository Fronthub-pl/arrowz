import { PARAM_SPEC } from '@arrowz/engine'
import { expect, test } from 'vitest'
import { RAIL_GROUPS } from './ui.slice'
import { useStore } from './store'

test('the rail opens on the board group, as the old lab does', () => {
  expect(useStore.getState().ui.entry).toBe('board')
})

test('selecting an entry keeps it', () => {
  useStore.getState().ui.select('preview')
  expect(useStore.getState().ui.entry).toBe('preview')
  useStore.getState().ui.select('board')
})

test('the rail lists every group PARAM_SPEC uses, in the table order', () => {
  // Derived, not typed by hand: a seventh group added to the engine must show
  // up in the console rather than hiding its knobs.
  const fromSpec = [...new Set(PARAM_SPEC.map((s) => s.group))]
  expect([...RAIL_GROUPS]).toEqual(fromSpec)
})
