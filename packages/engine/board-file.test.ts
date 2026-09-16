// The board file: a round trip keeps the board bit for bit (ids included,
// which the fingerprint does not see), and a file that is not a board this
// engine can read is refused with the reason, never drawn wrong.
import { assert, assertEquals, assertMatch, assertNotEquals, assertRejects, assertThrows } from '@std/assert'
import { defaultParams, fingerprint, generate } from './engine.ts'
import { BOARD_FILE_VERSION, BOARD_FORMAT, BoardFileError, decodeBoard, encodeBoard, layoutHash } from './board-file.ts'
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
  const board = generate({ ...defaultParams(), W: 40, H: 40, seed: 1 }, { unchecked: true, voidFrac: 0.1 }).board
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

Deno.test('decodeBoard refuses an id the board cannot have', () => {
  // encodeBoard cannot write such an id (its varints are 32-bit), so the body
  // is written by hand: one piece, id 2^32 - 1 (zigzag(2^32) = 2^33 as a
  // five-byte varint), head cell 0, one cell pointing right, no voids.
  const one = encodeBoard(handBoard(4, 4, [{ id: 0, dir: 1, cells: [{ x: 0, y: 0 }] }]))
  refuse(
    withBody(one, [0x80, 0x80, 0x80, 0x80, 0x20, 0, 1 * 4 + 1, 0]),
    `piece 0 has id ${2 ** 32 - 1}, more ids than the board has cells`,
  )
  // A 4×4 board has 16 cells, so its ids run 0..15: 15 is read, 16 is refused.
  const last = handBoard(4, 4, [{ id: 15, dir: 1, cells: [{ x: 0, y: 0 }] }])
  assertSameBoard(decodeBoard(encodeBoard(last)), last)
  refuse(
    encodeBoard(handBoard(4, 4, [{ id: 16, dir: 1, cells: [{ x: 0, y: 0 }] }])),
    'piece 0 has id 16, more ids than the board has cells',
  )
})

Deno.test('decodeBoard refuses a head outside the board, an empty piece and non-zero padding', () => {
  // The body of tiny(), byte by byte: piece 0 is [2, 0, 15] (zigzag(0 - -1),
  // head cell 0, 3 * 4 + dir 3), piece 5 is [10, 15, 14] (zigzag(5 - 0), head
  // cell 15, 3 * 4 + dir 2), then the step byte 197 (right, right, up, left),
  // then the voids [1, 5] (one void, at cell 5).
  const good = encodeBoard(tiny())
  const bytes = bodyOf(good)
  assertEquals(bytes, [2, 0, 15, 10, 15, 14, 197, 1, 5])
  const edit = (index: number, value: number): BoardFile => withBody(good, bytes.map((b, i) => i === index ? value : b))
  // Byte 1, the head of piece 0: cell 16 is one past the last cell of a 4×4 board.
  refuse(edit(1, 16), 'piece 0 has its head outside the board')
  // Byte 2, the length and direction of piece 0: 0 * 4 + 3 is a piece of no cells.
  refuse(edit(2, 0 * 4 + 3), 'piece 0 has 0 cells')
  // Byte 5, the length and direction of piece 5: 2 * 4 + 2 leaves piece 5 one
  // step, so the step byte holds three steps and its last two bits (left, 0b11)
  // become padding that is not zero.
  refuse(edit(5, 2 * 4 + 2), 'the step stream is not padded with zero bits')
})

Deno.test('decodeBoard refuses a header that disagrees with the body', () => {
  const good = encodeBoard(tiny())
  refuse({ ...good, unfilled: 0 }, 'the header counts 1 voids and 0 unfilled cells, the body 1 and 9')
  refuse({ ...good, fingerprint: 'x' }, 'the header says x')
})

// --- the layout hash ----------------------------------------------------------
// The name of an arrangement of arrows: ids and carving order are not part of
// it, so a layout carved by two recipes has one name (spec §1).

const LAYOUT_ID = /^sha256-[0-9a-f]{64}$/

/** The same board with its pieces in reverse order and renumbered from 100, the owner grid to match. */
function renumbered(board: BoardData): BoardData {
  const pieces = board.pieces.slice().reverse().map((pc, i) => ({ id: 100 + i, dir: pc.dir, cells: pc.cells }))
  const owner = new Int32Array(board.owner)
  for (const pc of pieces) for (const c of pc.cells) owner[c.y * board.W + c.x] = pc.id
  return { W: board.W, H: board.H, owner, pieces }
}

Deno.test('layoutHash names the layout, not its ids or its carving order', async () => {
  const board = generate({ ...defaultParams(), W: 25, H: 50, seed: 7 }).board
  const other = renumbered(board)
  // The pair is the point: the fingerprint sees the numbering, the layout hash does not.
  assertNotEquals(fingerprint(other), fingerprint(board))
  const hash = await layoutHash(board)
  assertMatch(hash, LAYOUT_ID)
  assertEquals(await layoutHash(other), hash)
  assertEquals(await layoutHash(renumbered(tiny())), await layoutHash(tiny()))
})

Deno.test('layoutHash tells apart one step, one dir, one void and the size', async () => {
  const base = await layoutHash(tiny())
  const turned = tiny()
  const first = turned.pieces[0]
  assert(first)
  first.dir = 1
  assertNotEquals(await layoutHash(turned), base, 'one dir')
  const bent = handBoard(4, 4, [
    { id: 0, dir: 3, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] },
    { id: 5, dir: 2, cells: [{ x: 3, y: 3 }, { x: 3, y: 2 }, { x: 3, y: 1 }] },
  ], [5])
  assertNotEquals(await layoutHash(bent), base, 'one step')
  const holed = handBoard(4, 4, tiny().pieces, [5, 6])
  assertNotEquals(await layoutHash(holed), base, 'one void')
  assertNotEquals(await layoutHash(handBoard(4, 4, [])), await layoutHash(handBoard(5, 4, [])), 'the size')
  // A one-cell piece: the file format allows it, and its dir is all it says.
  const up = handBoard(4, 4, [{ id: 0, dir: 0, cells: [{ x: 1, y: 1 }] }])
  const left = handBoard(4, 4, [{ id: 0, dir: 3, cells: [{ x: 1, y: 1 }] }])
  assertNotEquals(await layoutHash(up), await layoutHash(left), 'a one-cell piece by its dir')
})

Deno.test('layoutHash survives the board file', async () => {
  assertEquals(await layoutHash(decodeBoard(encodeBoard(tiny()))), await layoutHash(tiny()))
  const holes = generate({ ...defaultParams(), W: 40, H: 40, seed: 1 }, { unchecked: true, voidFrac: 0.1 }).board
  assertEquals(await layoutHash(decodeBoard(encodeBoard(holes))), await layoutHash(holes))
})

Deno.test('layoutHash refuses a piece whose cells are not neighbours', async () => {
  const broken = handBoard(4, 4, [{ id: 0, dir: 1, cells: [{ x: 0, y: 0 }, { x: 2, y: 0 }] }])
  await assertRejects(() => layoutHash(broken), BoardFileError, 'piece 0 is not a path')
})
