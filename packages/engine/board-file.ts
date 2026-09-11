// A board as a file: what the CLI writes, Cloud Storage keeps and the board
// element draws once decodeBoard has read it. A JSON envelope a person can
// read around a packed body only this module reads (design:
// docs/superpowers/specs/2026-09-11-board-data-model-design.md, section 2).
//
// The body, in order:
//   1. per piece, in the order of board.pieces: varint zigzag(id - previous
//      id) (the first piece's previous id is -1), varint head cell index
//      (y * W + x of cells[0]), varint length * 4 + dir;
//   2. one bit stream, two bits per step, every piece in order: the step from
//      cells[i] to cells[i+1] is its index in DIRS, low bits first, the last
//      byte padded with zero bits;
//   3. varint count of voids (owner -2), then their cell indices ascending as
//      varint differences, the first from 0.
// Varints are unsigned LEB128. Every other cell without a piece is -1.
//
// Runtime-neutral, like engine.ts: no Deno, DOM, Node or process API, and no
// platform base64 either — the module carries its own, built with loops.
import { fingerprint, PARAM_SPEC } from './engine.ts'
import { at, DIRS } from './geometry.ts'
import type { BoardData, BoardFile, Cell, Piece } from './types.ts'

export const BOARD_FORMAT = 'arrowz-board'
export const BOARD_FILE_VERSION = 1

/** A file this engine cannot read as a board, or a board no file can hold; the message says why. */
export class BoardFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BoardFileError'
  }
}

// ------------------------------------------------------------------ bytes

/** A growable byte buffer with the two writes the body needs. */
class ByteWriter {
  private buf = new Uint8Array(1024)
  private len = 0

  byte(v: number): void {
    if (this.len === this.buf.length) {
      const next = new Uint8Array(this.buf.length * 2)
      next.set(this.buf)
      this.buf = next
    }
    this.buf[this.len++] = v
  }

  /** Unsigned LEB128; every number written here is a non-negative integer below 2^31. */
  varint(v: number): void {
    let rest = v
    while (rest >= 0x80) {
      this.byte((rest & 0x7f) | 0x80)
      rest >>>= 7
    }
    this.byte(rest)
  }

  bytes(): Uint8Array {
    return this.buf.subarray(0, this.len)
  }
}

class ByteReader {
  private pos = 0
  constructor(private readonly buf: Uint8Array) {}

  get left(): number {
    return this.buf.length - this.pos
  }

  byte(): number {
    const v = this.buf[this.pos]
    if (v === undefined) throw new BoardFileError('the body ends early')
    this.pos++
    return v
  }

  varint(): number {
    let v = 0
    for (let shift = 0; shift <= 28; shift += 7) {
      const b = this.byte()
      v += (b & 0x7f) * 2 ** shift
      if (b < 0x80) return v
    }
    throw new BoardFileError('a number in the body is longer than five bytes')
  }
}

const zigzag = (n: number): number => (n >= 0 ? n * 2 : -n * 2 - 1)
const unzigzag = (z: number): number => (z % 2 === 0 ? z / 2 : -(z + 1) / 2)

// ----------------------------------------------------------------- base64

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_VALUE: Int8Array = (() => {
  const table = new Int8Array(128).fill(-1)
  for (let i = 0; i < B64.length; i++) table[B64.charCodeAt(i)] = i
  return table
})()

/** Standard base64 with padding. */
function toBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = bytes.length - i
    const a = at(bytes, i)
    const b = n > 1 ? at(bytes, i + 1) : 0
    const c = n > 2 ? at(bytes, i + 2) : 0
    const v = (a << 16) | (b << 8) | c
    out += B64.charAt(v >>> 18) + B64.charAt((v >>> 12) & 63) +
      (n > 1 ? B64.charAt((v >>> 6) & 63) : '=') + (n > 2 ? B64.charAt(v & 63) : '=')
  }
  return out
}

function fromBase64(text: string): Uint8Array {
  if (text.length % 4 !== 0) throw new BoardFileError('the body is not base64: its length is not a multiple of 4')
  const pad = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0
  const out = new Uint8Array((text.length / 4) * 3 - pad)
  let o = 0
  for (let i = 0; i < text.length; i += 4) {
    let v = 0
    for (let k = 0; k < 4; k++) {
      const padding = i + 4 === text.length && k >= 4 - pad
      const code = text.charCodeAt(i + k)
      const d = padding ? 0 : code < 128 ? at(B64_VALUE, code) : -1
      if (d < 0) throw new BoardFileError(`the body is not base64: unexpected character at ${i + k}`)
      v = (v << 6) | d
    }
    out[o++] = (v >>> 16) & 255
    if (o < out.length) out[o++] = (v >>> 8) & 255
    if (o < out.length) out[o++] = v & 255
  }
  return out
}

// ----------------------------------------------------------------- encode

/** The index in DIRS of a step, or -1 when the two cells are not neighbours. */
function stepCode(dx: number, dy: number): number {
  return DIRS.findIndex((d) => d.dx === dx && d.dy === dy)
}

/** The file of a board. Throws BoardFileError for a piece whose cells are not a path. */
export function encodeBoard(board: BoardData): BoardFile {
  const { W, H, owner, pieces } = board
  const out = new ByteWriter()
  let prevId = -1
  for (const pc of pieces) {
    const head = at(pc.cells, 0)
    out.varint(zigzag(pc.id - prevId))
    out.varint(head.y * W + head.x)
    out.varint(pc.cells.length * 4 + pc.dir)
    prevId = pc.id
  }
  let acc = 0, filled = 0
  for (const pc of pieces) {
    for (let i = 1; i < pc.cells.length; i++) {
      const a = at(pc.cells, i - 1), b = at(pc.cells, i)
      const code = stepCode(b.x - a.x, b.y - a.y)
      if (code < 0) throw new BoardFileError(`piece ${pc.id} is not a path: cell ${i} is not next to cell ${i - 1}`)
      acc |= code << filled
      filled += 2
      if (filled === 8) {
        out.byte(acc)
        acc = 0
        filled = 0
      }
    }
  }
  if (filled > 0) out.byte(acc)
  let voids = 0, unfilled = 0
  for (let i = 0; i < owner.length; i++) {
    const o = at(owner, i)
    if (o === -2) voids++
    else if (o === -1) unfilled++
  }
  out.varint(voids)
  let last = 0
  for (let i = 0; i < owner.length; i++) {
    if (at(owner, i) !== -2) continue
    out.varint(i - last)
    last = i
  }
  return {
    format: BOARD_FORMAT,
    v: BOARD_FILE_VERSION,
    W,
    H,
    pieces: pieces.length,
    voids,
    unfilled,
    fingerprint: fingerprint(board),
    body: toBase64(out.bytes()),
  }
}

// ----------------------------------------------------------------- decode

/** The generator's own limits for a side, straight from PARAM_SPEC. */
function sideRange(key: 'W' | 'H'): { min: number; max: number } {
  const spec = PARAM_SPEC.find((s) => s.key === key)
  if (!spec) throw new Error(`PARAM_SPEC has no ${key}`)
  return spec
}

/** The header, checked field by field; the body is still a string. */
function readHeader(file: unknown): BoardFile {
  if (typeof file !== 'object' || file === null || Array.isArray(file)) {
    throw new BoardFileError('not a board file: not a JSON object')
  }
  const f = file as Record<string, unknown>
  if (f.format !== BOARD_FORMAT) throw new BoardFileError(`not a board file: format is ${JSON.stringify(f.format)}`)
  if (f.v !== BOARD_FILE_VERSION) {
    throw new BoardFileError(
      `board file version ${JSON.stringify(f.v)} is not supported; this engine reads version ${BOARD_FILE_VERSION}`,
    )
  }
  const side = (key: 'W' | 'H'): number => {
    const { min, max } = sideRange(key)
    const v = f[key]
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
      throw new BoardFileError(`${key} must be an integer in ${min}..${max}, got ${JSON.stringify(v)}`)
    }
    return v
  }
  const count = (key: 'pieces' | 'voids' | 'unfilled'): number => {
    const v = f[key]
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
      throw new BoardFileError(`${key} must be a non-negative integer, got ${JSON.stringify(v)}`)
    }
    return v
  }
  const text = (key: 'fingerprint' | 'body'): string => {
    const v = f[key]
    if (typeof v !== 'string') throw new BoardFileError(`${key} must be a string`)
    return v
  }
  const W = side('W'), H = side('H')
  const pieces = count('pieces')
  if (pieces > W * H) throw new BoardFileError(`the header counts ${pieces} pieces, more pieces than cells`)
  return {
    format: BOARD_FORMAT,
    v: BOARD_FILE_VERSION,
    W,
    H,
    pieces,
    voids: count('voids'),
    unfilled: count('unfilled'),
    fingerprint: text('fingerprint'),
    body: text('body'),
  }
}

/**
 * The board of a file, bit for bit: ids, the order of the pieces and the
 * order of the cells within a piece are kept. Throws BoardFileError with the
 * reason for anything that is not a board this engine can read — the last
 * check is the fingerprint of the rebuilt board against the header.
 */
export function decodeBoard(file: unknown): BoardData {
  const head = readHeader(file)
  const { W, H } = head
  const cells = W * H
  const r = new ByteReader(fromBase64(head.body))

  const headers: { id: number; head: number; length: number; dir: number }[] = []
  const seen = new Set<number>()
  let prevId = -1
  for (let i = 0; i < head.pieces; i++) {
    const id = prevId + unzigzag(r.varint())
    if (id < 0 || seen.has(id)) throw new BoardFileError(`piece ${i} has id ${id}, which is negative or repeats`)
    // owner is an Int32Array: a larger id would wrap and pass for another piece, -1 or a void.
    if (id > 0x7fffffff) throw new BoardFileError(`piece ${i} has id ${id}, above the largest id a board can hold`)
    seen.add(id)
    const cell = r.varint()
    if (cell >= cells) throw new BoardFileError(`piece ${id} has its head outside the board`)
    const packed = r.varint()
    const length = Math.floor(packed / 4)
    if (length < 1 || length > cells) throw new BoardFileError(`piece ${id} has ${length} cells`)
    headers.push({ id, head: cell, length, dir: packed % 4 })
    prevId = id
  }

  const owner = new Int32Array(cells).fill(-1)
  const pieces: Piece[] = []
  let acc = 0, bits = 0
  const step = (): number => {
    if (bits === 0) {
      acc = r.byte()
      bits = 8
    }
    const code = acc & 3
    acc >>>= 2
    bits -= 2
    return code
  }
  for (const h of headers) {
    const list: Cell[] = []
    let x = h.head % W, y = Math.floor(h.head / W)
    for (let k = 0; k < h.length; k++) {
      if (k > 0) {
        const d = at(DIRS, step())
        x += d.dx
        y += d.dy
        if (x < 0 || y < 0 || x >= W || y >= H) throw new BoardFileError(`piece ${h.id} leaves the board`)
      }
      const i = y * W + x
      if (at(owner, i) !== -1) throw new BoardFileError(`piece ${h.id} runs into a cell another piece holds`)
      owner[i] = h.id
      list.push({ x, y })
    }
    pieces.push({ id: h.id, cells: list, dir: h.dir })
  }
  if (acc !== 0) throw new BoardFileError('the step stream is not padded with zero bits')

  const voids = r.varint()
  let last = 0
  for (let k = 0; k < voids; k++) {
    const delta = r.varint()
    if (k > 0 && delta === 0) throw new BoardFileError(`the void at cell ${last} is listed twice`)
    const i = (k === 0 ? 0 : last) + delta
    if (i >= cells) throw new BoardFileError('a void lies outside the board')
    if (at(owner, i) !== -1) throw new BoardFileError(`a piece holds the void at cell ${i}`)
    owner[i] = -2
    last = i
  }
  if (r.left !== 0) throw new BoardFileError(`${r.left} bytes are left over after the body`)

  let unfilled = 0
  for (let i = 0; i < cells; i++) if (at(owner, i) === -1) unfilled++
  if (voids !== head.voids || unfilled !== head.unfilled) {
    throw new BoardFileError(
      `the header counts ${head.voids} voids and ${head.unfilled} unfilled cells, the body ${voids} and ${unfilled}`,
    )
  }
  const board: BoardData = { W, H, owner, pieces }
  const got = fingerprint(board)
  if (got !== head.fingerprint) {
    throw new BoardFileError(`the fingerprint of the board is ${got}, the header says ${head.fingerprint}`)
  }
  return board
}
