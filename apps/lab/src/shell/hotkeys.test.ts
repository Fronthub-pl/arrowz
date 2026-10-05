import { expect, test } from 'vitest'
import { COMMAND_KEYS, shownKeys, WORKSPACE_KEYS } from './hotkeys'

test('the keys as the lab shows them, in the order the docs list them', () => {
  expect(shownKeys()).toEqual(['G', '[', ']', 'R', 'S', 'F', 'Esc', '⌘G', '⌘S', '⌘K'])
})

// One listener runs the first row naming a key; a key in two rows would silently lose its second action.
test('no key belongs to two rows of the workspace table', () => {
  const keys = WORKSPACE_KEYS.flatMap((row) => row.keys)
  expect(keys.length).toBeGreaterThan(0)
  expect(new Set(keys).size).toBe(keys.length)
})

test('exactly the run keys g, [ and ] bring the lab before they act', () => {
  expect(
    WORKSPACE_KEYS.filter((row) => row.lab === true)
      .flatMap((row) => row.keys)
      .sort(),
  ).toEqual(['G', '[', ']', 'g'].sort())
})

test('the table holds exactly the workspace keys f, r, s, g, [, ] and Escape, in both cases where a letter has one', () => {
  expect(WORKSPACE_KEYS.flatMap((row) => row.keys).sort()).toEqual(
    ['Escape', 'F', 'G', 'R', 'S', '[', ']', 'f', 'g', 'r', 's'].sort(),
  )
})

test('the command keys are three distinct lower-case letters', () => {
  const letters = Object.values(COMMAND_KEYS)
  expect(letters.every((letter) => /^[a-z]$/.test(letter))).toBe(true)
  expect(new Set(letters).size).toBe(letters.length)
})
