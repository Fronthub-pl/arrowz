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

// The list is kept until a refresh succeeds; a failed refresh that
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
// board's file, and neither may overwrite the other. Starting from a
// non-null `listError` (rather than the `null` `reset()` leaves) is what
// tells "boardFailed leaves listError alone" apart from "boardFailed nulls
// listError" — both looked the same from `null`.
test('a board failure does not touch a list error already set', () => {
  reset()
  const library = () => useStore.getState().library
  library().listFailed('no store server')
  library().boardFailed({ name: '8x8/sha256-0', reason: 'HTTP 404' })
  expect(library().listError).toBe('no store server')
  expect(library().boardError?.name).toBe('8x8/sha256-0')
  expect(library().boardError?.reason).toBe('HTTP 404')
})

// The reverse direction, which the case above cannot cover: a listing leaves
// a board's own error alone. `listed` does clear `listError`, by design — a
// successful listing has nothing left to report — but that is not the same
// claim as clearing errors in general, and it does not touch `boardError`.
test('a listing does not touch a board error already set', () => {
  reset()
  const library = () => useStore.getState().library
  library().boardFailed({ name: '8x8/sha256-0', reason: 'HTTP 404' })
  library().listed([])
  expect(library().boardError?.reason).toBe('HTTP 404')
  expect(library().listError).toBeNull()
  library().boardFailed(null)
  expect(library().boardError).toBeNull()
})

// Ruling 5: an event has nowhere to live in a line computed from state, so the
// slice carries one. It is deliberately not a stack — the newest message is the
// only one worth saying, so a new notice overwrites the last.
test('a notice replaces the one before it, and can be taken back', () => {
  reset()
  const library = () => useStore.getState().library

  expect(library().notice).toBeNull()

  library().notify({ kind: 'loading', name: '8x8/sha256-0' })
  expect(library().notice).toEqual({ kind: 'loading', name: '8x8/sha256-0' })

  library().notify({ kind: 'viewSaved', name: '8x8/sha256-0' })
  expect(library().notice?.kind).toBe('viewSaved')

  library().clearNotice()
  expect(library().notice).toBeNull()
})

// The two live beside each other: a board file that would not read is a state
// the line keeps saying, while a notice is a thing that just happened.
test('a notice does not disturb a board failure, or the sizes', () => {
  reset()
  const library = () => useStore.getState().library
  library().listed(sizesFixture())
  library().boardFailed({ name: '8x8/sha256-0', reason: 'HTTP 404' })

  library().notify({ kind: 'deleteFailed' })

  expect(library().boardError?.reason).toBe('HTTP 404')
  expect(library().sizes).toHaveLength(2)
})

test('reset takes the notice away with everything else', () => {
  reset()
  const library = () => useStore.getState().library
  library().notify({ kind: 'deleted', name: '8x8/sha256-0' })
  library().reset()
  expect(library().notice).toBeNull()
})
