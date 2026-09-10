import { assertEquals, assertThrows } from '@std/assert'
import { newSession, play } from './game.ts'
import type { Board, Piece } from './types.ts'

/**
 * A hand-built board: every cell owned, no generator involved, so the
 * expected verdicts are read off the picture rather than computed twice.
 */
function board(W: number, H: number, owner: number[], pieces: Piece[]): Board {
  return {
    W,
    H,
    owner: Int32Array.from(owner),
    pieces,
    stats: { want: pieces.length, got: pieces.length, stall: 0, strandTrunc: 0, strandLoss: 0, n: pieces.length },
    backtracks: 0,
    remaining: 0,
  }
}

/**
 *  3x2, three vertical dominoes:
 *  0 1 2      piece 0 points left off the edge, piece 1 right into piece 2,
 *  0 1 2      piece 2 up off the edge.
 */
function threeDominoes(): Board {
  return board(3, 2, [0, 1, 2, 0, 1, 2], [
    { id: 0, cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }], dir: 3 },
    { id: 1, cells: [{ x: 1, y: 0 }, { x: 1, y: 1 }], dir: 1 },
    { id: 2, cells: [{ x: 2, y: 0 }, { x: 2, y: 1 }], dir: 0 },
  ])
}

Deno.test('a piece whose ray reaches the edge leaves the board', () => {
  const s = newSession(threeDominoes())
  assertEquals(s.left, 3)
  assertEquals(s.status, 'playing')
  const { next, move } = play(s, 0)
  assertEquals(move, { kind: 'exit', pieceId: 0, dir: 3, left: 2, status: 'playing' })
  assertEquals(next.left, 2)
  assertEquals(s.left, 3) // the session handed in is untouched
})

Deno.test('a piece whose ray meets another piece bounces, naming the blocker', () => {
  const { move } = play(newSession(threeDominoes()), 1)
  assertEquals(move, { kind: 'bounce', pieceId: 1, distance: 0, blockerId: 2 })
})

Deno.test('removing the blocker frees the piece it blocked', () => {
  const first = play(newSession(threeDominoes()), 2)
  assertEquals(first.move.kind, 'exit')
  const { move } = play(first.next, 1)
  assertEquals(move, { kind: 'exit', pieceId: 1, dir: 1, left: 1, status: 'playing' })
})

Deno.test('the last piece wins the board', () => {
  let s = newSession(threeDominoes())
  for (const id of [0, 2, 1]) s = play(s, id).next
  assertEquals(s.left, 0)
  assertEquals(s.status, 'won')
})

Deno.test('clicking a piece that already left, or an unknown id, changes nothing', () => {
  const after = play(newSession(threeDominoes()), 0).next
  assertEquals(play(after, 0).move, { kind: 'ignored' })
  assertEquals(play(after, 99).move, { kind: 'ignored' })
  assertEquals(play(after, 0).next.left, 2)
})

Deno.test("the ray steps over the piece's own cells", () => {
  //  0 0 1     piece 0 is a hook whose head at (1,1) points up through its
  //  0 0 1     own cell (1,0); piece 1 is the right-hand column.
  //  0 0 1
  const hook: Piece = {
    id: 0,
    cells: [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 2 }, { x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }],
    dir: 0,
  }
  const column: Piece = { id: 1, cells: [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }], dir: 0 }
  const b = board(3, 3, [0, 0, 1, 0, 0, 1, 0, 0, 1], [hook, column])
  assertEquals(play(newSession(b), 0).move.kind, 'exit')
})

Deno.test('void and uncarved cells do not block, and the distance counts the cells before the blocker', () => {
  //  0 0 . 1 1   (. is a void, - an uncarved cell)
  const b = board(5, 1, [0, 0, -2, 1, 1], [
    { id: 0, cells: [{ x: 1, y: 0 }, { x: 0, y: 0 }], dir: 1 },
    { id: 1, cells: [{ x: 4, y: 0 }, { x: 3, y: 0 }], dir: 1 },
  ])
  assertEquals(play(newSession(b), 0).move, { kind: 'bounce', pieceId: 0, distance: 1, blockerId: 1 })

  const open = board(4, 1, [0, 0, -2, -1], [{ id: 0, cells: [{ x: 1, y: 0 }, { x: 0, y: 0 }], dir: 1 }])
  assertEquals(play(newSession(open), 0).move.kind, 'exit')
})

Deno.test('a piece with a direction outside 0..3 is a programming error, not a move', () => {
  const b = board(2, 1, [0, 0], [{ id: 0, cells: [{ x: 1, y: 0 }, { x: 0, y: 0 }], dir: 9 }])
  assertThrows(() => play(newSession(b), 0), RangeError)
})
