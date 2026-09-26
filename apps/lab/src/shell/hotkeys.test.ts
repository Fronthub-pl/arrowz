import { expect, test } from 'vitest'
import { WORKSPACE_KEYS } from './hotkeys'

// One listener runs the first row naming a key; a key in two rows would silently lose its second action.
test('no key belongs to two rows of the workspace table', () => {
  const keys = WORKSPACE_KEYS.flatMap((row) => row.keys)
  expect(keys.length).toBeGreaterThan(0)
  expect(new Set(keys).size).toBe(keys.length)
})

test('the table holds every workspace key the lab advertises', () => {
  expect(WORKSPACE_KEYS.flatMap((row) => row.keys).sort()).toEqual(
    ['Escape', 'F', 'G', 'R', 'S', '[', ']', 'f', 'g', 'r', 's'].sort(),
  )
})
