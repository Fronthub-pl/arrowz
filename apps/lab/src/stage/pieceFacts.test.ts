import { type BoardData, newSession } from '@arrowz/engine'
import { expect, test } from 'vitest'
import { pieceFacts } from './pieceFacts'
import { threeDominoes } from './pieces.fixtures'

test('a piece whose way out is clear is free', () => {
  expect(pieceFacts(newSession(threeDominoes()), 0)).toEqual({ id: 0, length: 2, dir: 3, blocker: null })
})

test('a blocked piece names its blocker and the cells between them', () => {
  expect(pieceFacts(newSession(threeDominoes()), 1)).toEqual({
    id: 1,
    length: 2,
    dir: 1,
    blocker: { id: 2, distance: 0 },
  })
})

test('the length is the piece’s own cell count', () => {
  expect(pieceFacts(newSession(threeDominoes()), 2)).toEqual({ id: 2, length: 3, dir: 0, blocker: null })
})

test('the distance counts the empty cells before the blocker', () => {
  const board = threeDominoes()
  const gap: BoardData = {
    W: 4,
    H: 3,
    owner: Int32Array.from([0, 1, -1, 2, 0, 1, -1, 2, -1, -1, -1, 2]),
    pieces: board.pieces.map((pc) => (pc.id === 2 ? { ...pc, cells: pc.cells.map((c) => ({ ...c, x: 3 })) } : pc)),
  }
  expect(pieceFacts(newSession(gap), 1)?.blocker).toEqual({ id: 2, distance: 1 })
})

test('an id no piece carries has no facts', () => {
  expect(pieceFacts(newSession(threeDominoes()), 7)).toBeNull()
  expect(pieceFacts(newSession(threeDominoes()), -1)).toBeNull()
})
