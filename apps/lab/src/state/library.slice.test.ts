import { expect, test } from 'vitest'
import { sizesFixture } from './library.fixtures'
import { useStore } from './store'

function reset() {
  useStore.getState().library.reset()
}

test('a listing replaces the sizes and clears the failure', () => {
  reset()
  const library = () => useStore.getState().library
  expect(library().sizes).toBeNull()

  library().listing()
  expect(library().loading).toBe(true)

  library().listed(sizesFixture())
  expect(library().loading).toBe(false)
  expect(library().sizes?.[0]?.size).toBe('8x8')
  expect(library().listError).toBeNull()
})

// The old lab keeps its list until a refresh succeeds; a failed refresh that
// blanked the list would take the rows away from under the board on screen.
test('a failed listing keeps the sizes it already had', () => {
  reset()
  const library = () => useStore.getState().library
  library().listed(sizesFixture())
  library().listFailed('no store server')
  expect(library().listError).toBe('no store server')
  expect(library().sizes?.[0]?.size).toBe('8x8')
  expect(library().loading).toBe(false)
})

// Two failures, two sentences: one is about the store, the other about one
// board's file, and neither may overwrite the other.
test('a board failure and a list failure are separate', () => {
  reset()
  const library = () => useStore.getState().library
  library().boardFailed('Board 8x8/sha256-0 cannot be read: HTTP 404')
  expect(library().boardError).toContain('404')
  expect(library().listError).toBeNull()
  library().boardFailed(null)
  expect(library().boardError).toBeNull()
})
