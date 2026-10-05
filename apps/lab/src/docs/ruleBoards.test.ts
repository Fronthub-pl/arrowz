import { newSession, play } from '@arrowz/engine'
import type { BoardData } from '@arrowz/engine'
import { describe, expect, test } from 'vitest'
import { isRuleBoard, RULE_BOARD_NAMES, RULE_BOARDS } from './ruleBoards'

describe.each(RULE_BOARD_NAMES)('%s', (name) => {
  const board = RULE_BOARDS[name]

  test('every arrow owns its cells and nothing else is owned', () => {
    const owned = board.pieces.flatMap((piece) =>
      piece.cells.map(({ x, y }) => ({ at: y * board.W + x, id: piece.id })),
    )
    expect(new Set(owned.map(({ at }) => at)).size).toBe(owned.length)
    for (const { at, id } of owned) expect(board.owner[at]).toBe(id)
    expect([...board.owner].filter((id) => id >= 0)).toHaveLength(owned.length)
    expect(board.owner).toHaveLength(board.W * board.H)
  })

  test('every arrow is two cells or more, each a step from the last', () => {
    for (const piece of board.pieces) {
      expect(piece.cells.length).toBeGreaterThanOrEqual(2)
      piece.cells.slice(1).forEach((cell, k) => {
        const before = piece.cells[k]
        if (before === undefined) throw new Error('no cell before')
        expect(Math.abs(cell.x - before.x) + Math.abs(cell.y - before.y), `${piece.id}`).toBe(1)
      })
    }
  })
})

const first = (board: BoardData, id: number) => play(newSession(board), id).move

// The verdicts come from the game's own reducer, so the boards say what the
// page says about them by the rule the element plays.
test('on the free board both arrows leave', () => {
  expect(first(RULE_BOARDS['rule-free'], 0).kind).toBe('exit')
  expect(first(RULE_BOARDS['rule-free'], 1).kind).toBe('exit')
})

test('on the blocked board the arrow bounces off the one across its path, which leaves, and then it leaves too', () => {
  const board = RULE_BOARDS['rule-blocked']
  expect(first(board, 0)).toEqual({ kind: 'bounce', pieceId: 0, distance: 2, blockerId: 2 })
  const { next, move } = play(newSession(board), 2)
  expect(move.kind).toBe('exit')
  expect(play(next, 0).move.kind).toBe('exit')
})

test('the horseshoe leaves though another arrow sits inside its bend', () => {
  expect(first(RULE_BOARDS['rule-shape'], 0).kind).toBe('exit')
  expect(first(RULE_BOARDS['rule-shape'], 1).kind).toBe('exit')
})

test('a board name is one of the three', () => {
  expect(isRuleBoard('rule-free')).toBe(true)
  expect(isRuleBoard('rule-nowhere')).toBe(false)
  expect(isRuleBoard(undefined)).toBe(false)
})
