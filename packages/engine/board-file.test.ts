// The board file: a round trip keeps the board bit for bit (ids included,
// which the fingerprint does not see), and a file that is not a board this
// engine can read is refused with the reason, never drawn wrong.
import { assert, assertEquals, assertThrows } from '@std/assert'
import { defaultParams, fingerprint, generate } from './engine.ts'
import { BOARD_FILE_VERSION, BOARD_FORMAT, BoardFileError, decodeBoard, encodeBoard } from './board-file.ts'
import type { BoardData, BoardFile, Piece } from './types.ts'

/** Same size, same owner grid, same pieces in the same order with the same ids, directions and cells. */
function assertSameBoard(got: BoardData, want: BoardData): void {
  assertEquals([got.W, got.H], [want.W, want.H])
  assertEquals(got.owner, want.owner)
  assertEquals(got.pieces.length, want.pieces.length)
  got.pieces.forEach((pc, i) => {
    const w = want.pieces[i]
    assert(w, `no piece ${i}`)
    assertEquals({ id: pc.id, dir: pc.dir, cells: pc.cells }, { id: w.id, dir: w.dir, cells: w.cells })
  })
}

/** Builds a board from pieces by hand; every other cell is uncarved unless listed as a void. */
function handBoard(W: number, H: number, pieces: Piece[], voids: number[] = []): BoardData {
  const owner = new Int32Array(W * H).fill(-1)
  for (const pc of pieces) for (const c of pc.cells) owner[c.y * W + c.x] = pc.id
  for (const i of voids) owner[i] = -2
  return { W, H, owner, pieces }
}

/**
 * 4×4, two pieces with ids 0 and 5 (not their positions), one void at (1,1),
 * nine uncarved cells: every kind of cell a file has to carry.
 */
function tiny(): BoardData {
  return handBoard(4, 4, [
    { id: 0, dir: 3, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] },
    { id: 5, dir: 2, cells: [{ x: 3, y: 3 }, { x: 3, y: 2 }, { x: 2, y: 2 }] },
  ], [5])
}

/** The body of a file as bytes, and a file with other bytes as its body (Deno has atob and btoa). */
const bodyOf = (f: BoardFile): number[] => Array.from(atob(f.body), (ch) => ch.charCodeAt(0))
const withBody = (f: BoardFile, bytes: number[]): BoardFile => ({
  ...f,
  body: btoa(bytes.map((b) => String.fromCharCode(b)).join('')),
})

const refuse = (file: unknown, message: string) => assertThrows(() => decodeBoard(file), BoardFileError, message)

Deno.test('encodeBoard writes a readable header and decodeBoard gives the same board back', () => {
  const board = tiny()
  const file = encodeBoard(board)
  assertEquals(
    { ...file, body: '' },
    {
      format: BOARD_FORMAT,
      v: BOARD_FILE_VERSION,
      W: 4,
      H: 4,
      pieces: 2,
      voids: 1,
      unfilled: 9,
      fingerprint: fingerprint(board),
      body: '',
    },
  )
  assertSameBoard(decodeBoard(JSON.parse(JSON.stringify(file))), board)
})

Deno.test('an empty board and a board of voids survive the round trip', () => {
  const empty = handBoard(4, 4, [])
  assertSameBoard(decodeBoard(encodeBoard(empty)), empty)
  const holes = handBoard(4, 4, [], [0, 1, 15])
  assertSameBoard(decodeBoard(encodeBoard(holes)), holes)
})

Deno.test('a generated board with voids keeps its -2 cells through the file', () => {
  const board = generate({ ...defaultParams(), W: 40, H: 40, seed: 1, voidFrac: 0.1 }, { unchecked: true }).board
  const file = encodeBoard(board)
  assert(file.voids > 0, 'the fixture has voids')
  assertSameBoard(decodeBoard(file), board)
})

Deno.test('encodeBoard refuses a piece whose cells are not neighbours', () => {
  const broken = handBoard(4, 4, [{ id: 0, dir: 1, cells: [{ x: 0, y: 0 }, { x: 2, y: 0 }] }])
  assertThrows(() => encodeBoard(broken), BoardFileError, 'piece 0 is not a path')
})

Deno.test('decodeBoard refuses a file that is not a board file', () => {
  const good = encodeBoard(tiny())
  for (const junk of [null, 5, 'x', []]) refuse(junk, 'not a board file: not a JSON object')
  refuse({ ...good, format: 'svg' }, 'not a board file: format is "svg"')
  refuse({ ...good, v: 2 }, 'board file version 2 is not supported')
  refuse({ ...good, W: 3 }, 'W must be an integer in 4..1000')
  refuse({ ...good, H: 4.5 }, 'H must be an integer in 4..1000')
  refuse({ ...good, pieces: -1 }, 'pieces must be a non-negative integer')
  refuse({ ...good, pieces: 17 }, 'more pieces than cells')
  refuse({ ...good, fingerprint: 7 }, 'fingerprint must be a string')
})

Deno.test('decodeBoard refuses a body that is not base64, ends early or runs on', () => {
  const good = encodeBoard(tiny())
  refuse({ ...good, body: 'AAA' }, 'not a multiple of 4')
  refuse({ ...good, body: 'AA!A' }, 'unexpected character at 2')
  refuse(withBody(good, bodyOf(good).slice(0, -1)), 'the body ends early')
  refuse(withBody(good, [...bodyOf(good), 0]), '1 bytes are left over')
})

Deno.test('decodeBoard refuses pieces that leave the board, overlap, sit on a void or repeat an id', () => {
  const off = handBoard(4, 4, [{ id: 0, dir: 2, cells: [{ x: 0, y: 0 }, { x: 0, y: -1 }] }])
  refuse(encodeBoard(off), 'piece 0 leaves the board')
  const overlap = handBoard(4, 4, [
    { id: 0, dir: 3, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
    { id: 1, dir: 3, cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }] },
  ])
  refuse(encodeBoard(overlap), 'piece 1 runs into a cell another piece holds')
  const onVoid = handBoard(4, 4, [{ id: 0, dir: 3, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }], [1])
  refuse(encodeBoard(onVoid), 'a piece holds the void at cell 1')
  const twice = handBoard(4, 4, [
    { id: 0, dir: 3, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
    { id: 0, dir: 3, cells: [{ x: 0, y: 1 }, { x: 1, y: 1 }] },
  ])
  refuse(encodeBoard(twice), 'id 0, which is negative or repeats')
})

Deno.test('decodeBoard refuses a header that disagrees with the body', () => {
  const good = encodeBoard(tiny())
  refuse({ ...good, unfilled: 0 }, 'the header counts 1 voids and 0 unfilled cells, the body 1 and 9')
  refuse({ ...good, fingerprint: 'x' }, 'the header says x')
})
