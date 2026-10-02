import { describe, expect, it } from 'vitest'
import { boardsPathOf } from './lastBoards'

describe('boardsPathOf', () => {
  it.each([
    ['/boards/8x8/sha256-0101', '/boards/8x8/sha256-0101'],
    ['/boards', '/boards'],
    // An opened file is a preview in memory, and the lab tab clears it.
    ['/boards/file', '/boards'],
  ])('remembers %s as %s', (pathname, remembered) => {
    expect(boardsPathOf(pathname)).toBe(remembered)
  })

  it.each(['/', '/docs/element', '/docs/cli'])('leaves the memory alone at %s', (pathname) => {
    expect(boardsPathOf(pathname)).toBeNull()
  })
})
