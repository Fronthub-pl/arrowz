# Board File Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The CLI writes a serializable board file by default (SVG only behind `--svg`), `<arrowz-board>` and the lab draw from that file, and `--count=N` fills a pool of closed boards for later upload to Cloud Storage.

**Architecture:** The engine gains `BoardData` (the four fields every reader needs) and a runtime-neutral codec `board-file.ts` (`encodeBoard`/`decodeBoard`, a JSON envelope around a packed base64 body, verified by `fingerprint()`). The CLI store keeps `<id>.board.json` + `<id>.json`, the SVG becomes an opt-in preview, and the lab stops rendering SVG: its worker posts a board file and both tabs draw into one `<arrowz-board>`.

**Tech Stack:** Deno 2.9 (engine, CLI, lab bundle via `deno bundle`), TypeScript strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, Lit 3 + WebGL2 (`packages/board-element`), Vitest 5 browser mode (Playwright Chromium), Nx 23, pnpm 12.

**Spec:** `docs/superpowers/specs/2026-09-11-board-data-model-design.md`

## Global Constraints

- Everything in the repository is English: code, comments, tests, docs, commit messages. Only `lab-i18n.ts` PL dictionary and `README.pl.md` hold Polish.
- The lab ships bilingual UI: every visible string lives in `packages/engine/lab-i18n.ts`, English in `EN.ui`, Polish in `PL.ui`, same keys.
- `engine.ts`, `command.ts`, `lab-simple.ts`, `lab-presets.ts`, `lab-i18n.ts`, `game.ts` and the new `board-file.ts` know neither Deno nor the DOM; `neutral.test.ts` greps them. The DOM lib is referenced only in `packages/cli/lab-page.ts`.
- Never spread arrays proportional to the number of cells or pieces into a call (`Math.min(...arr)`, `String.fromCharCode(...bytes)`): it overflows the worker stack in Chrome. Use loops.
- No `any`, no non-null assertions (`!`). A type fix must never add a value-changing fallback in the engine: `fingerprints.test.ts`, `svg-golden.test.ts` and `packages/engine/scripts/node-smoke.mjs` must keep passing with their recorded values untouched.
- Node consumers get the engine from `packages/engine/dist/` (`pnpm nx build engine`); `packages/board-element` sources import `@arrowz/engine`, never engine `.ts` paths.
- `deno task test` must pass after every task; `deno task verify` and `pnpm nx run-many -t verify` before the PR.
- No attribution lines in commit messages or PR descriptions.
- Formatting: `deno fmt` (no semicolons, single quotes, line width 120). Run `deno fmt <files>` on every file you touch before committing.

## Rulings made while planning

These refine the spec; the executor follows them as written.

1. **Lit in the Deno bundle works (spike run 2026-09-11).** `deno bundle` resolves `packages/board-element/src/mod.ts` through a relative path, Lit included (~122 KB). Two conditions: the import must be relative (`'../board-element/src/mod.ts'`; the bare `@arrowz/board-element` does not resolve in Deno), and it must import a value that the page uses (`ArrowzBoard` in an `instanceof`), because the package's `sideEffects` names only `dist/` and a bare side-effect import is dropped. `deno check` of that import reports two errors, fixed by adding `override` to `static properties` and `static styles` in `arrowz-board.ts` (Task 3).
2. **Size ceiling.** The test pins the file size of the golden board `big500` (it is generated in `fingerprints.test.ts` anyway); Insane is measured once through `--dry-run` (`boardBytes`) in Task 9 and written into the spec.
3. **`BoardMeta`** gains `fingerprint: string | null`, `boardBytes: number | null`, `svg: boolean` and loses `svgBytes`; the reader fills the three for a meta written before them (`null`, `null`, `false`).
4. **A save without an SVG removes a preview left by an earlier save of the same id**, so `meta.svg` never lies and no stale picture sits next to a re-coloured board.
5. **`--svg=path` together with `--count` is refused** (exit 2): one path cannot hold N boards.
6. **The lab's own fit and zoom controls go** (`#fit`, `#zoom`, `#zoomRange`, `#zoomRow`, the double-click toggle, `applyZoom`, the `fit`/`zoom` URL fields and the `fitBoard`/`zoomLabel`/`zoomHelp` strings). The element pans and zooms itself.
7. **The lab worker only generates.** It posts `done` with the board file; the page decodes it, draws it, builds the longest-piece table and makes the SVG download with `toSvg()`. The worker's `render` messages go.
8. **A stored board shows its holes when it did not close** (`voids: meta.ok === false`) in the library.
9. **Dictionary:** `rebuilding` and `storedInvalid` go (the library never regenerates now); `boardFileError` is added.
10. `packages/cli/project.json` gains `"board-element"` in `implicitDependencies`, so Nx rebuilds the lab bundle when the element changes.

## File map

| File | Change |
| --- | --- |
| `packages/engine/types.ts` | `BoardData`, `Board extends BoardData`, `BoardFile`; `BoardMeta` fields; `WorkerIn`/`WorkerOut` |
| `packages/engine/engine.ts` | `analyse`, `render`, `toSvg`, `fingerprint` take `BoardData` |
| `packages/engine/geometry.ts` | `voidStrips` takes `BoardData`; header comment |
| `packages/engine/game.ts` | `Session.board`, `newSession`, `loadSession` take `BoardData` |
| `packages/engine/board-file.ts` | **new**: the codec |
| `packages/engine/board-file.test.ts`, `board-data.test.ts` | **new** tests |
| `packages/engine/mod.ts`, `tsconfig.build.json`, `neutral.test.ts`, `fingerprints.test.ts`, `scripts/node-smoke.mjs` | export, build, guard |
| `packages/engine/command.ts` (+ `command.test.ts`) | `--board`, `--count`, `--max-seeds` in help and parser; `buildCommand` writes `--board` |
| `packages/engine/lab-i18n.ts` (+ test) | strings removed and added |
| `packages/board-element/src/*.ts` | narrow to `BoardData`; `override` on two statics |
| `packages/board-element/demo/worker.ts`, `demo/main.ts` | worker posts a board file |
| `packages/cli/store.ts` (+ test) | board file + optional SVG |
| `packages/cli/carve.ts` (+ test) | default output, `--board`, batch |
| `packages/cli/lab-server.ts` (+ test) | POST takes a board file |
| `packages/cli/lab-worker.ts`, `lab-page.ts`, `lab.html`, `project.json` | lab on the element |
| `README.md`, `README.pl.md` | new default output and the batch |

---

### Task 1: `BoardData` — every reader takes the four fields

Suggested model: Sonnet (mechanical narrowing).

**Files:**
- Modify: `packages/engine/types.ts` (the `Board` interface, currently at lines 111-120)
- Modify: `packages/engine/engine.ts` (`analyse` line 1695, `render` 1968, `toSvg` 2007, `fingerprint` 2610, type import at line 8)
- Modify: `packages/engine/geometry.ts` (header lines 1-4, `voidStrips` line 140, import line 5)
- Modify: `packages/engine/game.ts` (import line 14, `Session.board` line 17, `newSession` line 45, `loadSession` line 155)
- Test: `packages/engine/board-data.test.ts` (new)

**Interfaces:**
- Produces: `export interface BoardData { W: number; H: number; owner: Int32Array; pieces: Piece[] }` and `export interface Board extends BoardData { stats: CarverStats; backtracks: number; remaining: number }` in `types.ts`; `fingerprint(board: BoardData): string`, `toSvg(board: BoardData, opts?: SvgOptions): string`, `render(board: BoardData): string`, `analyse(board: BoardData, ruleB?: boolean): Metrics`, `voidStrips(board: BoardData)`, `newSession(board: BoardData): Session`, `loadSession(board: BoardData, snap: SessionSnapshot): Session`.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/board-data.test.ts`:

```ts
// The board element and the game read only W, H, owner and pieces. A board
// that went through a file has nothing else, so every reader must take it.
import { assertEquals } from '@std/assert'
import { analyse, defaultParams, fingerprint, generate, render, toSvg } from './engine.ts'
import { loadSession, newSession, saveSession } from './game.ts'
import { voidStrips } from './geometry.ts'
import type { BoardData } from './types.ts'

Deno.test('every reader of a board takes the four fields of BoardData and nothing more', () => {
  const full = generate({ ...defaultParams(), W: 25, H: 50, seed: 7 }).board
  const data: BoardData = { W: full.W, H: full.H, owner: full.owner, pieces: full.pieces }
  assertEquals(fingerprint(data), fingerprint(full))
  assertEquals(toSvg(data), toSvg(full))
  assertEquals(render(data), render(full))
  assertEquals(analyse(data).N, analyse(full).N)
  assertEquals(voidStrips(data), voidStrips(full))
  const session = newSession(data)
  assertEquals(loadSession(data, saveSession(session, false)).left, session.left)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `deno test --allow-read packages/engine/board-data.test.ts`
Expected: FAIL at type check — `Module '"./types.ts"' has no exported member 'BoardData'`.

- [ ] **Step 3: Add the types**

In `packages/engine/types.ts`, replace the `Board` interface (the block starting `/** The public surface of a carved board that analyse, render, toSvg and fingerprint read. */`) with:

```ts
/**
 * What a drawn and played board is: analyse, render, toSvg, fingerprint, the
 * game and the board element read only these four fields. A board decoded
 * from a file (board-file.ts) has nothing else.
 */
export interface BoardData {
  W: number
  H: number
  /** Piece id per cell; -1 an uncarved cell, -2 a void. */
  owner: Int32Array
  pieces: Piece[]
}

/** What the generator hands back: the board plus its closing report. */
export interface Board extends BoardData {
  stats: CarverStats
  backtracks: number
  remaining: number
}
```

- [ ] **Step 4: Narrow the readers**

In `packages/engine/engine.ts` add `BoardData` to the type import from `./types.ts` (the import that lists `Board,` at line 8) and change the four signatures:

```ts
function analyse(board: BoardData, ruleB = true): Metrics {
function render(board: BoardData): string {
function toSvg(board: BoardData, opts: SvgOptions = {}): string {
function fingerprint(board: BoardData): string {
```

`class Carver implements Board` stays as it is.

In `packages/engine/geometry.ts` replace the first four comment lines with:

```ts
// The shapes of the pieces in output units: what toSvg formats into SVG text
// and what the board element tesselates into triangles for WebGL. One source,
// so the CLI export and the interactive board can never draw a head
// differently. Knows neither Deno nor the DOM.
```

change the import to `import type { BoardData, Piece } from './types.ts'` and the signature to `export function voidStrips(board: BoardData): { x: number; y: number; len: number }[] {`.

In `packages/engine/game.ts` change the import to `import type { BoardData, Piece } from './types.ts'`, and `readonly board: Board` to `readonly board: BoardData`, `newSession(board: Board)` to `newSession(board: BoardData)`, `loadSession(board: Board, snap: SessionSnapshot)` to `loadSession(board: BoardData, snap: SessionSnapshot)`. Leave the comment at line 121 ("a Board does not carry them") as it is: it is still true of both types.

- [ ] **Step 5: Run the test and the engine suite**

Run: `deno test --allow-read packages/engine/board-data.test.ts`
Expected: PASS.
Run: `deno task check && deno task test`
Expected: all pass (fingerprints and SVG golden hashes unchanged).

- [ ] **Step 6: Commit**

```bash
deno fmt packages/engine/types.ts packages/engine/engine.ts packages/engine/geometry.ts packages/engine/game.ts packages/engine/board-data.test.ts
git add packages/engine/types.ts packages/engine/engine.ts packages/engine/geometry.ts packages/engine/game.ts packages/engine/board-data.test.ts
git commit -m "BoardData names the four fields every reader of a board needs, and the readers take it"
```

---

### Task 2: The board file codec

Suggested model: Opus.

**Files:**
- Create: `packages/engine/board-file.ts`
- Create: `packages/engine/board-file.test.ts`
- Modify: `packages/engine/types.ts` (add `BoardFile` after `Board`)
- Modify: `packages/engine/mod.ts`, `packages/engine/tsconfig.build.json`, `packages/engine/neutral.test.ts`, `packages/engine/fingerprints.test.ts`, `packages/engine/scripts/node-smoke.mjs`

**Interfaces:**
- Consumes: `BoardData` (Task 1), `fingerprint`, `PARAM_SPEC` from `engine.ts`, `at`, `DIRS` from `geometry.ts`.
- Produces (exported from `@arrowz/engine`): `BOARD_FORMAT = 'arrowz-board'`, `BOARD_FILE_VERSION = 1`, `class BoardFileError extends Error`, `encodeBoard(board: BoardData): BoardFile`, `decodeBoard(file: unknown): BoardData`; type `BoardFile` with fields `format, v, W, H, pieces, voids, unfilled, fingerprint, body`.

- [ ] **Step 1: Add the `BoardFile` type**

In `packages/engine/types.ts`, right after the `Board` interface, add:

```ts
/**
 * A board as a file (board-file.ts): a JSON envelope a person can read around
 * a packed body that only decodeBoard reads. The counts and the fingerprint
 * are readable without decoding; the decoder checks them against the body.
 */
export interface BoardFile {
  format: 'arrowz-board'
  v: 1
  W: number
  H: number
  pieces: number
  /** Cells with owner -2. */
  voids: number
  /** Cells with owner -1; 0 for a board that closed. */
  unfilled: number
  /** fingerprint() of the board. */
  fingerprint: string
  /** base64 of the packed body. */
  body: string
}
```

- [ ] **Step 2: Write the failing tests**

Create `packages/engine/board-file.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `deno test --allow-read packages/engine/board-file.test.ts`
Expected: FAIL — `Module not found "file:///…/packages/engine/board-file.ts"`.

- [ ] **Step 4: Write the codec**

Create `packages/engine/board-file.ts`:

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `deno test --allow-read packages/engine/board-file.test.ts`
Expected: PASS, 8 tests. If a rejection test fails only on its message, fix the code's message to match the test (the tests are the contract), not the other way round.

- [ ] **Step 6: Export, build, guard**

`packages/engine/mod.ts` — after the `geometry.ts` export lines add:

```ts
export { BOARD_FILE_VERSION, BOARD_FORMAT, BoardFileError, decodeBoard, encodeBoard } from './board-file.ts'
```

`packages/engine/tsconfig.build.json` — add `"board-file.ts"` to `include` after `"geometry.ts"`.

`packages/engine/neutral.test.ts` — add `'board-file.ts',` to `NEUTRAL` after `'game.ts',`.

`packages/engine/fingerprints.test.ts` — add `import { decodeBoard, encodeBoard } from './board-file.ts'` and `import { assert } from '@std/assert'` (merge into the existing `@std/assert` import), then replace the test body so every golden board also goes through the file:

```ts
for (const c of golden.cases) {
  Deno.test(`golden board ${c.name} reproduces the fingerprint recorded on Node and survives the board file`, () => {
    const r = generate(paramsOf(c), { unchecked: c.argv === null })
    assertEquals(fingerprint(r.board), c.fingerprint)
    assertEquals(r.board.pieces.length, c.pieces)
    // The unchecked case records no maxLen — it has no metrics.
    if (c.maxLen !== null) assertEquals(r.metrics?.maxLen, c.maxLen)
    // The file keeps the fingerprint, and the ids the fingerprint cannot see.
    const text = JSON.stringify(encodeBoard(r.board))
    const back = decodeBoard(JSON.parse(text))
    assertEquals(fingerprint(back), c.fingerprint)
    assertEquals(back.pieces.map((p) => p.id), r.board.pieces.map((p) => p.id))
    if (c.name === 'big500') {
      assert(text.length <= BIG500_FILE_BYTES, `big500 file grew to ${text.length} bytes`)
    }
  })
}
```

and above the loop:

```ts
// The file of the largest golden board, measured when the format was made
// (2026-09-11). The encoding is deterministic, so this is its exact size; a
// ceiling rather than an equality, so a tighter encoding still passes.
const BIG500_FILE_BYTES = 0
```

- [ ] **Step 7: Measure big500 and pin it**

Temporarily change the `assert` line to `console.log('big500 file bytes', text.length)`, run `deno test --allow-read packages/engine/fingerprints.test.ts --filter big500`, read the printed number, set `BIG500_FILE_BYTES` to exactly that number, and restore the `assert` line.
Run: `deno test --allow-read packages/engine/fingerprints.test.ts`
Expected: PASS for every golden case.

- [ ] **Step 8: Decode under Node**

In `packages/engine/scripts/node-smoke.mjs` change the import to `import { decodeBoard, defaultParams, encodeBoard, fingerprint, generate } from '../dist/mod.js'` and, inside the loop, replace the `ok` computation and the log line with:

```js
  // A Cloud Function will read these files: the file must round-trip in Node too.
  const back = decodeBoard(JSON.parse(JSON.stringify(encodeBoard(r.board))))
  const fileOk = fingerprint(back) === c.fingerprint
  const ok = got === c.fingerprint && r.board.pieces.length === c.pieces && maxLenOk && fileOk
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${c.name} ${got} (${r.board.pieces.length} pieces, maxLen ${r.metrics?.maxLen}, file ${
      fileOk ? 'ok' : 'FAIL'
    })`,
  )
```

Also update the file's header comment: "Proves that the tsc emission in dist/ is the same engine: every golden board of fingerprints.json except big500 (21 771 pieces, left to the Deno test) must reproduce its fingerprint under Node, directly and through the board file."

Run: `pnpm nx run engine:smoke`
Expected: every line `ok`, ending `all golden boards reproduce under Node`.

- [ ] **Step 9: Full engine check and commit**

Run: `deno task check && deno task lint && deno task test`
Expected: all pass.

```bash
deno fmt packages/engine/
git add packages/engine/
git commit -m "A board file: a readable header around a packed body, checked by the board's fingerprint on the way back"
```

---

### Task 3: The board element draws `BoardData`

Suggested model: Sonnet.

**Files:**
- Modify: `packages/board-element/src/arrowz-board.ts` (import line 7, `declare board` line 109, `static properties` line 84, `static styles` line 129)
- Modify: `packages/board-element/src/game-host.ts` (import line 9, lines 31, 46, 55)
- Modify: `packages/board-element/src/gl-layer.ts` (import line 12, lines 64, 243, 395)
- Modify: `packages/board-element/src/gl-passes.ts` (import line 4, lines 79, 102, 168)
- Modify: `packages/board-element/src/rides.ts` (import line 5, line 36)
- Modify: `packages/board-element/src/tesselate.ts` (import line 6, lines 315, 324)
- Modify: `packages/board-element/demo/worker.ts`, `packages/board-element/demo/main.ts`
- Test: `packages/board-element/src/game-host.test.ts`, `packages/board-element/src/arrowz-board.browser.test.ts`

**Interfaces:**
- Consumes: `BoardData`, `encodeBoard`, `decodeBoard`, `BoardFile` from `@arrowz/engine` (Tasks 1–2; the element reads the engine from `dist/`, so Nx builds it first).
- Produces: `ArrowzBoard.board: BoardData | null`; `GameHost.setBoard(board: BoardData | null)`; demo message `{ board: BoardFile; ok: boolean; genMs: number } | { error: string }`.

- [ ] **Step 1: Write the failing tests**

In `packages/board-element/src/game-host.test.ts`, change the import to `import type { BoardData, Piece } from '@arrowz/engine'` and the builder to return a plain `BoardData` (a board from a file carries no closing report):

```ts
function board(W: number, H: number, owner: number[], pieces: Piece[]): BoardData {
  return { W, H, owner: Int32Array.from(owner), pieces }
}

/** The same three dominoes as the engine's tests: 0 is free, 1 is blocked by 2, 2 is free. */
function threeDominoes(): BoardData {
```

In `packages/board-element/src/arrowz-board.browser.test.ts`, change the first import to `import { decodeBoard, defaultParams, encodeBoard, generate } from '@arrowz/engine'` and add at the end of the `describe('mount and viewport', …)` block:

```ts
  test('a board that went through a board file draws exactly like the generated one', async () => {
    await mount()
    const original = el.board
    if (!original) throw new Error('mount sets a board')
    const before = await painted(el)
    el.remove()
    await mount()
    el.board = decodeBoard(JSON.parse(JSON.stringify(encodeBoard(original))))
    await el.updateComplete
    await raf()
    const after = await painted(el)
    expect(el.pieceCount).toBe(original.pieces.length)
    expect(inked(after)).toBe(inked(before))
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm nx run board-element:check`
Expected: FAIL — `game-host.test.ts`: argument of type `BoardData` is not assignable to parameter of type `Board` (missing `stats`, `backtracks`, `remaining`).

- [ ] **Step 3: Narrow the element**

In each file below replace the type import of `Board` with `BoardData` and every `Board` in a type position with `BoardData`:

- `arrowz-board.ts`: `import type { BoardData, SessionSnapshot } from '@arrowz/engine'`; `declare board: BoardData | null`.
- `game-host.ts`: `import type { BoardData, Session, SessionSnapshot } from '@arrowz/engine'`; `private boardRef: BoardData | null = null`; `get board(): BoardData | null`; `setBoard(board: BoardData | null): void`.
- `gl-layer.ts`: `import type { BoardData } from '@arrowz/engine'`; `private current: BoardData | null = null`; `get board(): BoardData | null`; `private uploadVoids(board: BoardData | null): void`; and the `setBoard` parameter of `GlLayer` if it names `Board`.
- `gl-passes.ts`: `import type { BoardData } from '@arrowz/engine'`; the three `board: Board` parameters.
- `rides.ts`: `import type { BoardData, Piece } from '@arrowz/engine'`; `board(): BoardData | null` in `RideHost`.
- `tesselate.ts`: `import type { BoardData, Piece } from '@arrowz/engine'`; `topIds(board: BoardData, …)`, `tesselateBoard(board: BoardData, …)`.

Then run `grep -rn "\bBoard\b" packages/board-element/src --include='*.ts' | grep -v test | grep -v "BoardView\|BoardViewport\|BoardLabels\|BoardLang"` and change any remaining type use to `BoardData`. Tests other than `game-host.test.ts` keep `Board`: a `Board` is a `BoardData`.

In `arrowz-board.ts` add `override` to the two statics (Deno's checker requires it; the lab type-checks this file from Task 6 on):

```ts
  static override properties = {
  static override styles = css`
```

- [ ] **Step 4: The demo worker posts a board file**

Replace `packages/board-element/demo/worker.ts` below its first comment line with:

```ts
import { defaultParams, encodeBoard, generate } from '@arrowz/engine'
import type { BoardFile, ParamKey } from '@arrowz/engine'

export interface DemoRequest {
  overrides: Partial<Record<ParamKey, number>>
  seed: number
}

/**
 * The board travels as its file: one string crosses the worker boundary
 * instead of ~90 000 piece objects, and the page walks the path a game will
 * walk with a board from Storage — file, decodeBoard, element.
 */
export type DemoResponse =
  | { board: BoardFile; ok: boolean; genMs: number }
  | { error: string }

self.onmessage = (e: MessageEvent<DemoRequest>) => {
  const t0 = performance.now()
  let msg: DemoResponse
  try {
    // generate() throws InvalidParamsError for anything outside the safe
    // envelope; without this the page would sit on "generating…" for ever.
    const r = generate({ ...defaultParams(), ...e.data.overrides, seed: e.data.seed })
    msg = { board: encodeBoard(r.board), ok: r.ok, genMs: performance.now() - t0 }
  } catch (err) {
    msg = { error: err instanceof Error ? err.message : String(err) }
  }
  self.postMessage(msg)
}
```

In `packages/board-element/demo/main.ts`, import `decodeBoard` from `@arrowz/engine` (add it to the existing engine import, or add `import { decodeBoard } from '@arrowz/engine'`) and in `worker.onmessage` replace `const { board: generated, ok, genMs } = e.data` with:

```ts
    const { ok, genMs } = e.data
    const generated = decodeBoard(e.data.board)
```

The rest of the handler (`board.board = generated`, `generated.pieces.length`, `generated.W`) stays.

- [ ] **Step 5: Run the element suite**

Run: `pnpm nx run board-element:check && pnpm nx run board-element:test`
Expected: PASS, including the new browser test (Chromium headless). `pnpm nx run board-element:lint` and `:fmt` pass too.

- [ ] **Step 6: Commit**

```bash
deno fmt packages/board-element/
git add packages/board-element/
git commit -m "The board element takes BoardData, and the demo hands it a board that went through a file"
```

---

### Task 4: The store and the CLI write a board file by default

Suggested model: Opus.

**Files:**
- Modify: `packages/engine/types.ts` (`BoardMeta`)
- Modify: `packages/engine/command.ts` (`buildCommand`, `MODE_FLAGS`, `SIMPLE_MODE_FLAGS`, the view-options heading)
- Modify: `packages/cli/store.ts`, `packages/cli/carve.ts` (lines 154-324), `packages/cli/lab-server.ts`
- Test: `packages/engine/command.test.ts`, `packages/cli/store.test.ts`, `packages/cli/carve.test.ts`, `packages/cli/lab-server.test.ts`

**Interfaces:**
- Consumes: `encodeBoard`, `decodeBoard`, `BoardFile` (Task 2).
- Produces: `SaveInput { board: BoardFile; svg?: string; params; view; command; simpleCommand?; metrics?; source }`; `BoardMeta` with `fingerprint: string | null`, `boardBytes: number | null`, `svg: boolean` (no `svgBytes`); store files `<id>.board.json`, `<id>.json`, optional `<id>.svg`; CLI flag `--board`; `buildCommand()` output starting `deno task carve --advanced --board `; `POST /api/boards` body `{ board, params, view, command, source?, metrics?, svg? }`; a report line helper `storedNames(meta, svgOut)` in `carve.ts` (used again in Task 5).

- [ ] **Step 1: Update the command tests (failing)**

In `packages/engine/command.test.ts`:
- replace every `--advanced --svg --w=25` in expected `buildCommand` strings (lines 31-66) with `--advanced --board --w=25`, rename the test at line 31 to `'buildCommand: default params give only size, seed, --board and --cell'`, and change `assertEquals(back.rest, ['--advanced', '--svg'])` to `assertEquals(back.rest, ['--advanced', '--board'])`;
- in the advanced `helpText` flag list add `'--board',` before `'--svg[=path]',`;
- in the simple `helpText` list replace `'--svg=path',` with `'--svg[=path]',`.

Run: `deno test --allow-read packages/engine/command.test.ts`
Expected: FAIL on the `buildCommand` and `helpText` assertions.

- [ ] **Step 2: Make them pass**

In `packages/engine/command.ts`:
- in `buildCommand`, `` `${COMMAND_PREFIX} --advanced --svg` `` becomes `` `${COMMAND_PREFIX} --advanced --board` ``;
- replace the `MODE_FLAGS` rows for `--svg[=path]` and `--dry-run` with:

```ts
  ['--board', 'one board file into packages/cli/boards/ (ARROWZ_BOARDS_DIR) with its meta, no picture'],
  ['--svg[=path]', 'the same, plus an SVG preview in the store, and a copy at path'],
  ['--dry-run', 'one board, nothing written: one JSON line on stdout (alone or next to --board or --svg)'],
```

- replace `SIMPLE_MODE_FLAGS` rows `(no mode)`, `--svg=path`, `--dry-run` with:

```ts
  ['(no mode)', 'one board file into packages/cli/boards/ (ARROWZ_BOARDS_DIR) with its meta, no picture'],
  ['--svg[=path]', 'the same, plus an SVG preview in the store, and a copy at path'],
  ['--dry-run', 'one board, nothing written: one JSON line on stdout'],
```

- in `helpText`, `'View options (--svg and --dry-run):'` becomes `'View options (kept in the meta, drawn by --svg):'`.

Run: `deno test --allow-read packages/engine/command.test.ts`
Expected: PASS.

- [ ] **Step 3: `BoardMeta`**

In `packages/engine/types.ts` change the doc of `BoardMeta` to `/** One stored board: the meta JSON next to the board file in packages/cli/boards/<WxH>/. */` and replace `svgBytes: number` with:

```ts
  /** fingerprint() of the stored board; null for a meta written before board files. */
  fingerprint: string | null
  /** Size of <id>.board.json in bytes; null for a meta written before board files. */
  boardBytes: number | null
  /** Whether an SVG preview (<id>.svg) sits next to the board file. */
  svg: boolean
```

- [ ] **Step 4: Rewrite the store tests (failing)**

In `packages/cli/store.test.ts`:

Add imports `import { encodeBoard } from '@arrowz/engine'` (merge with the existing `defaultParams` import) and `import type { BoardFile } from '@arrowz/engine'` (merge with the existing type import). Add the helper and replace `entry` so that it carries a board file of the right size and no SVG:

```ts
/** The file of an empty board of a size: the store does not decode it, it only has to fit the params. */
const emptyFile = (W: number, H: number): BoardFile =>
  encodeBoard({ W, H, owner: new Int32Array(W * H).fill(-1), pieces: [] })

const entry = (
  { params: over, ...rest }: Partial<Omit<SaveInput, 'params'>> & { params?: Partial<Record<ParamKey, number>> } = {},
): SaveInput => {
  const p = params(over)
  return {
    board: emptyFile(p.W, p.H),
    params: p,
    view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0, rounded: true },
    command: `${COMMAND_PREFIX} --advanced --board --w=25 --h=50 --seed=7 --cell=12`,
    source: 'cli',
    metrics: { ok: true, pieces: 126, maxLen: 68, genMs: 12 },
    ...rest,
  }
}
```

Replace the first test with two:

```ts
Deno.test('saveBoard writes the board file and the meta, and no SVG unless given', () => {
  const dir = freshDir()
  const meta = saveBoard(entry())
  assertMatch(meta.id, /^seed7-/)
  const file = entry().board
  assertEquals(Deno.readTextFileSync(join(dir, '25x50', meta.id + '.board.json')), JSON.stringify(file))
  assert(!exists(join(dir, '25x50', meta.id + '.svg')), 'no preview without an svg')
  const saved = readMeta(join(dir, '25x50', meta.id + '.json'))
  assertEquals(saved.pieces, 126)
  assertEquals(saved.source, 'cli')
  assertEquals(saved.fingerprint, file.fingerprint)
  assertEquals(saved.boardBytes, JSON.stringify(file).length)
  assertEquals(saved.svg, false)
  assert(saved.createdAt)
  assertEquals('simpleCommand' in saved, false, 'no simple command unless one was given')
})

Deno.test('saveBoard with an svg keeps the preview; a later save without one removes it', () => {
  const dir = freshDir()
  const withSvg = saveBoard(entry({ svg: '<svg/>' }))
  assertEquals(withSvg.svg, true)
  assertEquals(Deno.readTextFileSync(join(dir, '25x50', withSvg.id + '.svg')), '<svg/>')
  const without = saveBoard(entry())
  assertEquals(without.svg, false)
  assert(!exists(join(dir, '25x50', without.id + '.svg')), 'a stale preview does not outlive the save')
})

Deno.test('saveBoard refuses a board file of another size than the params', () => {
  freshDir()
  assertThrows(() => saveBoard({ ...entry(), board: emptyFile(10, 10) }), Error, 'board file is 10x10')
})
```

Then, in the remaining tests:
- `'saveBoard keeps the simple command when given'`: `startsWith(\`${COMMAND_PREFIX} --advanced --svg \`)` becomes `--advanced --board `.
- `'listBoards: sizes ascending…'`: keep `svg: '<svg>2</svg>'` in the overwrite call; the final `.svg` read stays.
- `'listBoards skips junk…'`: rename to `'listBoards skips junk: foreign directories, json without a board file, broken json, JSON scalars'`; the comment `// no svg` becomes `// no board file`; every `.svg` companion file written in this test becomes `.board.json` (`broken.board.json`, `` `scalar-${name}.board.json` ``); and add, before `saveBoard(entry())`, an old-store board that has only its SVG:

```ts
  // A board written before board files: meta and SVG, no board file. Not listed.
  Deno.writeTextFileSync(join(dir, '25x50', 'seed3-oldstore.json'), '{"id":"seed3-oldstore"}')
  Deno.writeTextFileSync(join(dir, '25x50', 'seed3-oldstore.svg'), '<svg/>')
```

- the three legacy tests (`seed7-legacy00`, `seed7-legacy01`, `seed7-legacy02`): the line writing `…legacyNN.svg` becomes `Deno.writeTextFileSync(join(dir, '25x50', 'seed7-legacyNN.board.json'), '{}')` (the list only checks that the file exists); in `seed7-legacy02` also assert the new fields are filled:

```ts
  assertEquals([board?.fingerprint, board?.boardBytes, board?.svg], [null, null, false])
```

- `'deleteBoard removes svg and json…'`: rename to `'deleteBoard removes the board file, the meta, the preview and an emptied size directory'`, save `gone` with `entry({ params: { seed: 2 }, svg: '<svg/>' })`, and assert all three are gone:

```ts
  for (const ext of ['.board.json', '.json', '.svg']) assert(!exists(join(dir, '25x50', gone.id + ext)), ext)
```

Run: `deno test --allow-read --allow-write --allow-env packages/cli/store.test.ts`
Expected: FAIL — `SaveInput` has no `board`.

- [ ] **Step 5: Rewrite the store**

In `packages/cli/store.ts`:
- header comment: `// Store of generated boards: packages/cli/boards/<W>x<H>/<id>.board.json + <id>.json, plus <id>.svg when a preview was asked for. Shared by the CLI (carve.ts) and the lab server. The directory is gitignored — a 1000×1000 board file is about a megabyte, and the command in the meta reproduces any board.`
- import `BoardFile` in the type import.
- `SaveInput` becomes:

```ts
export interface SaveInput {
  board: BoardFile
  /** The SVG preview. Without it no preview is kept: one left by an earlier save of this id is removed. */
  svg?: string
  params: Params
  view: View
  command: string
  simpleCommand?: string
  metrics?: {
    ok?: boolean
    pieces?: number
    maxLen?: number
    genMs?: number
    restarts?: number
    backtracks?: number
    aborted?: boolean
    stuck?: Stuck | null
  }
  source: string
}
```

- in `readMeta`, after `stuck: meta.stuck ?? null,` add:

```ts
      fingerprint: meta.fingerprint ?? null,
      boardBytes: meta.boardBytes ?? null,
      svg: meta.svg ?? false,
```

- `saveBoard` becomes:

```ts
export function saveBoard({ board, svg, params, view, command, simpleCommand, metrics = {}, source }: SaveInput): BoardMeta {
  if (board.W !== params.W || board.H !== params.H) {
    throw new Error(`board file is ${board.W}x${board.H}, the params ask for ${params.W}x${params.H}`)
  }
  const id = boardId(params)
  const size = `${params.W}x${params.H}`
  const dir = join(boardsDir(), size)
  Deno.mkdirSync(dir, { recursive: true })
  // The same id means the same board (the id hashes the parameters). An
  // overwrite — recolouring in the lab, regenerating from the CLI — keeps the
  // original createdAt, so the board stays in its place in the list, and
  // records the write in updatedAt.
  const now = new Date().toISOString()
  const metaFile = join(dir, `${id}.json`)
  const createdAt = readMeta(metaFile)?.createdAt ?? now
  const boardText = JSON.stringify(board)
  const meta: BoardMeta = {
    id,
    W: params.W,
    H: params.H,
    seed: params.seed,
    params,
    view,
    command,
    ...(simpleCommand ? { simpleCommand } : {}),
    source,
    createdAt,
    updatedAt: now,
    ok: metrics.ok ?? null,
    pieces: metrics.pieces ?? null,
    maxLen: metrics.maxLen ?? null,
    genMs: metrics.genMs ?? null,
    fingerprint: board.fingerprint,
    boardBytes: new TextEncoder().encode(boardText).byteLength,
    svg: svg !== undefined,
    restarts: metrics.restarts ?? null,
    backtracks: metrics.backtracks ?? null,
    aborted: metrics.aborted ?? false,
    stuck: metrics.stuck ?? null,
  }
  Deno.writeTextFileSync(join(dir, `${id}.board.json`), boardText)
  const svgFile = join(dir, `${id}.svg`)
  if (svg !== undefined) Deno.writeTextFileSync(svgFile, svg)
  else if (exists(svgFile)) Deno.removeSync(svgFile)
  Deno.writeTextFileSync(metaFile, JSON.stringify(meta, null, 2))
  return meta
}
```

- `deleteBoard`: the doc says `Removes one board (board file, meta and preview).` and the loop runs over `['.board.json', '.json', '.svg']`.
- `listBoards`: inside the file loop replace the two checks with:

```ts
      if (!f.name.endsWith('.json') || f.name.endsWith('.board.json')) continue
      if (!exists(join(dir, f.name.slice(0, -'.json'.length) + '.board.json'))) continue
```

Run: `deno test --allow-read --allow-write --allow-env packages/cli/store.test.ts`
Expected: PASS.

- [ ] **Step 6: Update the lab-server tests (failing)**

In `packages/cli/lab-server.test.ts`, import `encodeBoard` with `defaultParams` from `@arrowz/engine`, and add:

```ts
/** The file of an empty board of a size: enough for the server, which decodes it before saving. */
const emptyFile = (W: number, H: number) => encodeBoard({ W, H, owner: new Int32Array(W * H).fill(-1), pieces: [] })
```

Rewrite the first test:

```ts
Deno.test('POST /api/boards saves, GET lists, the board file and the preview are served from the store', () =>
  withServer(async (base) => {
    const board = emptyFile(25, 50)
    const body = {
      board,
      svg: '<svg>x</svg>',
      params: { ...defaultParams(), W: 25, H: 50, seed: 7 },
      view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0 },
      command: `${COMMAND_PREFIX} --advanced --board --w=25 --h=50 --seed=7 --cell=12`,
      metrics: { ok: true, pieces: 126, maxLen: 68, genMs: 10 },
      source: 'lab',
    }
    const post = await fetch(base + '/api/boards', { method: 'POST', body: JSON.stringify(body) })
    assertEquals(post.status, 201)
    const meta: BoardMeta = await post.json()
    assertMatch(meta.id, /^seed7-/)
    const list: BoardSize[] = await (await fetch(base + '/api/boards')).json()
    assertEquals(list[0]?.size, '25x50')
    assertEquals(list[0]?.boards[0]?.id, meta.id)
    const file = await fetch(`${base}/boards/25x50/${meta.id}.board.json`)
    assertEquals(file.headers.get('content-type'), 'application/json')
    assertEquals(await file.json(), board)
    const svg = await fetch(`${base}/boards/25x50/${meta.id}.svg`)
    assertEquals(svg.headers.get('content-type'), 'image/svg+xml')
    assertEquals(await svg.text(), '<svg>x</svg>')
  }))
```

Replace `'POST without svg gives 400'` with:

```ts
Deno.test('POST without params, without a readable board file or with a board of another size gives 400', () =>
  withServer(async (base) => {
    const params = { ...defaultParams(), W: 10, H: 10, seed: 3 }
    const cases: [unknown, string][] = [
      [{ board: emptyFile(10, 10) }, 'params are required'],
      [{ params }, 'board: not a board file'],
      [{ params, board: { ...emptyFile(10, 10), fingerprint: 'x' } }, 'board: the fingerprint'],
      [{ params, board: emptyFile(12, 12) }, 'board file is 12x12'],
    ]
    for (const [body, error] of cases) {
      const r = await fetch(base + '/api/boards', { method: 'POST', body: JSON.stringify(body) })
      assertEquals(r.status, 400)
      const got: { error: string } = await r.json()
      assert(got.error.includes(error), `${got.error} lacks ${error}`)
    }
  }))
```

In the DELETE test the posted body gets `board: emptyFile(10, 10)` instead of `svg: '<svg>del</svg>'`, and the `gone` fetch asks for `${meta.id}.board.json`.

Run: `deno test --allow-read --allow-write --allow-env --allow-net packages/cli/lab-server.test.ts`
Expected: FAIL.

- [ ] **Step 7: The server takes a board file**

In `packages/cli/lab-server.ts`: import `decodeBoard` from `@arrowz/engine`; replace `isPostBody` with:

```ts
/**
 * Runtime check of a POST body: the params, an optional SVG string, and a
 * board file the engine can read, of the size the params ask for. Returns
 * the body or the reason it was refused.
 */
function checkPost(v: unknown): { body: PostBody } | { error: string } {
  if (typeof v !== 'object' || v === null) return { error: 'the body is not a JSON object' }
  const o = v as { board?: unknown; params?: unknown; svg?: unknown }
  if (typeof o.params !== 'object' || o.params === null) return { error: 'params are required' }
  if (o.svg !== undefined && typeof o.svg !== 'string') return { error: 'svg must be a string' }
  let board
  try {
    board = decodeBoard(o.board)
  } catch (err) {
    return { error: `board: ${err instanceof Error ? err.message : String(err)}` }
  }
  const p = o.params as { W?: unknown; H?: unknown }
  if (board.W !== p.W || board.H !== p.H) {
    return { error: `board file is ${board.W}x${board.H}, the params ask for ${String(p.W)}x${String(p.H)}` }
  }
  // Checked field by field above: the sanctioned narrowing at an I/O boundary.
  return { body: v as PostBody }
}
```

and the POST branch:

```ts
      if (url.pathname === '/api/boards' && req.method === 'POST') {
        const checked = checkPost(JSON.parse(await req.text()))
        if ('error' in checked) return send(400, JSON.stringify({ error: checked.error }))
        return send(201, JSON.stringify(saveBoard({ ...checked.body, source: checked.body.source ?? 'lab' })))
      }
```

Update the header comment: `(GET list, POST save a board file, DELETE one)`.

Run: `deno test --allow-read --allow-write --allow-env --allow-net packages/cli/lab-server.test.ts`
Expected: PASS.

- [ ] **Step 8: Update the CLI tests (failing)**

In `packages/cli/carve.test.ts`:
- add `decodeBoard` to the `@arrowz/engine` import, `boardBytes?: number` to `DryLine` (after `fingerprint?: string`), and a helper after `readMeta`:

```ts
/** The fingerprint of a stored board file, read back through the decoder. */
const storedFingerprint = (file: string): string =>
  fingerprint(decodeBoard(JSON.parse(Deno.readTextFileSync(file))))
```

- `'carve.ts --advanced --svg reproduces the generate() board byte for byte'`: the command now carries `--board`, so append `--svg` to get the preview, and check the file too:

```ts
  const cmd = buildCommand(params, view) // "deno task carve --advanced --board …"
  const argv = [...cmd.slice(COMMAND_PREFIX.length + 1).split(' '), '--svg']
  const r = runCarve(argv, dir)
  assertEquals(r.status, 0, r.stderr)
  const id = boardId(params)
  assertMatch(r.stdout, new RegExp(`25x50/${id}\\.board\\.json {2}\\+ 25x50/${id}\\.svg`))
  assertEquals(Deno.readTextFileSync(join(dir, '25x50', `${id}.svg`)), expected)
  assertEquals(storedFingerprint(join(dir, '25x50', `${id}.board.json`)), fingerprint(generate(params).board))
  const meta = readMeta(join(dir, '25x50', `${id}.json`))
  assertEquals(meta.command, cmd)
  assertEquals(meta.svg, true)
  assertEquals(meta.source, 'cli')
```

- add after it:

```ts
Deno.test('carve.ts --advanced --board writes the board file and the meta, and no SVG', () => {
  const dir = tmp()
  const r = runCarve(['--advanced', '--board', '--w=10', '--h=10', '--seed=3'], dir)
  assertEquals(r.status, 0, r.stderr)
  const params = { ...defaultParams(), W: 10, H: 10, seed: 3 }
  const id = boardId(params)
  assertMatch(r.stdout, new RegExp(`^10x10/${id}\\.board\\.json {2}pieces=`))
  assertEquals(storedFingerprint(join(dir, '10x10', `${id}.board.json`)), fingerprint(generate(params).board))
  assertEquals(exists(join(dir, '10x10', `${id}.svg`)), false)
  assertEquals(readMeta(join(dir, '10x10', `${id}.json`)).svg, false)
})
```

- `'carve.ts --dry-run computes the board…'`: the command regex becomes `--advanced --board --w=10 --h=10 --seed=1`, and add `assertEquals(typeof r.json.boardBytes, 'number')`.
- `'CARVE_TIMEOUT_S aborts…'`: the stdout regex becomes ``new RegExp(`400x400/${longId}\\.board\\.json {2}\\+ 400x400/${longId}\\.svg {2}\\+ .*copy\\.svg {2}not closed: \\d+ cells left in \\d+ fragments`)`` and add `assert(exists(join(dir, 'boards', '400x400', `${longId}.board.json`)), 'the partial board is stored as a file')`.
- `'carve.ts simple mode stores an aborted board as well'`: add `assert(exists(join(dir, '400x400', `${id}.board.json`)))` and `assertEquals(exists(join(dir, '400x400', `${id}.svg`)), false, 'no preview without --svg')`.
- `'carve.ts without --advanced writes the board the simple lab view makes…'`: rename to `'carve.ts without --advanced writes the board file of the board the simple lab view makes, and no SVG'`; delete the `expected` constant and its `toSvg` call; replace the assertions after `const id = boardId(params)` with:

```ts
  assertMatch(r.stdout, new RegExp(`^25x50/${id}\\.board\\.json {2}pieces=`))
  assertEquals(storedFingerprint(join(dir, '25x50', `${id}.board.json`)), fingerprint(generate(params).board))
  assertEquals(exists(join(dir, '25x50', `${id}.svg`)), false, 'no preview without --svg')
  const meta = readMeta(join(dir, '25x50', `${id}.json`))
  assertEquals(meta.command, buildCommand(params, view), 'the full command reproduces the board')
  assertMatch(meta.command, new RegExp(`^${prefixRe} --advanced --board `))
  assertEquals(
    meta.simpleCommand,
    `${COMMAND_PREFIX} --width=25 --height=50 --seed=7 --length=0.25 --straight=0.8 --skeleton --colorized`,
  )
  assertEquals(meta.simpleCommand, buildSimpleCommand(choice, view))
  assertEquals(meta.source, 'cli')
  assertEquals(meta.params, params)
  assertEquals([meta.svg, meta.fingerprint], [false, fingerprint(generate(params).board)])
```

- `'carve.ts simple mode: --svg=path writes a copy…'`: the dry-run command regex becomes `--advanced --board --w=10 --h=10 --seed=1 `.

Remove `toSvg` from the imports only if no test uses it any more (the first test still does).

Run: `deno test --allow-read --allow-write --allow-env --allow-run packages/cli/carve.test.ts`
Expected: FAIL on the new expectations.

- [ ] **Step 9: The CLI writes the board file**

In `packages/cli/carve.ts`:
- header comment: the simple-mode paragraph reads `Always one board file → packages/cli/boards/ (+ an SVG preview with --svg, + a copy with --svg=path), or with --dry-run one JSON line and nothing written.`; the advanced modes list gains `//   --board         one board file → packages/cli/boards/` above `--svg[=path]`, whose line becomes `//   --svg[=path]    the same, plus an SVG preview in the store (+ a copy at path)`; `A board that does not close is stored too, with its holes drawn` becomes `A board that does not close is stored too (its preview draws the holes)`.
- imports: add `encodeBoard` to the `@arrowz/engine` value import and `BoardMeta` to the type import.
- replace everything from the line `// --- one board into the store (or, with --dry-run, nowhere) ----------------` to the closing `}` of that `if` block (currently lines 154-324) with:

```ts
// --- one board into the store (or, with --dry-run, nowhere) ----------------
// The simple mode always lands here; the advanced mode with --board, --svg or
// --dry-run. The store gets the board file and its meta, and an SVG preview
// only with --svg. A dry run generates, measures and encodes exactly as a real
// run would, and then writes nothing: stdout carries one JSON line so that
// scripts can compare boards across runtimes without a file — the
// fingerprint is the same one the engine tests freeze recorded boards with.
const svgFlag = rest.find((a) => a === '--svg' || a.startsWith('--svg='))

/** What one stored board left on disk, as the report line names it. */
function storedNames(meta: BoardMeta, svgOut: string | null): string {
  const base = `${meta.W}x${meta.H}/${meta.id}`
  return `${base}.board.json${meta.svg ? `  + ${base}.svg` : ''}${svgOut ? `  + ${svgOut}` : ''}`
}

if (!advanced || svgFlag || has('board') || dryRun) {
  const svgOut = svgFlag?.includes('=') ? svgFlag.slice('--svg='.length) : null
  const result = generate({ ...params, ...hooks })
  const c = result.board, W = params.W, H = params.H
  const svgView = svgOptions(view)
  const file = encodeBoard(c)
  const boardBytes = new TextEncoder().encode(JSON.stringify(file)).byteLength
  // The full command reproduces the board in every case; the simple command
  // (simple mode only) records what was asked for.
  const commands = { command: buildCommand(params, view), ...(simpleCommand ? { simpleCommand } : {}) }
  if (!result.ok) {
    // A board that did not close (a jam, or the time budget) is stored like a
    // closed one, so that the lab can show what the generator left behind;
    // its preview draws the free cells as holes, and the "not closed" badge
    // comes from ok:false.
    const { stuck, aborted } = result
    if (!stuck) throw new Error('unreachable: not ok without stuck')
    if (dryRun) {
      console.log(
        JSON.stringify({
          dryRun: true,
          W,
          H,
          seed: params.seed,
          id: boardId(params),
          ok: false,
          aborted,
          stuck,
          restarts: result.restartsUsed,
          backtracks: result.backtracks,
          genMs: result.genMs,
          boardBytes,
        }),
      )
    }
    console.error(
      aborted
        ? `aborted after ${
          (result.genMs / 1000).toFixed(1)
        } s: board ${W}x${H} (seed ${params.seed}) has ${stuck.remaining} cells left`
        : `failed to close board ${W}x${H} (seed ${params.seed}): ${stuck.remaining} cells left, ${
          stuck.heads ?? '?'
        } legal heads at the best moment`,
    )
    if (!dryRun) {
      const svg = svgFlag ? toSvg(c, { ...svgView, voids: true }) : undefined
      const meta = saveBoard({
        board: file,
        ...(svg !== undefined ? { svg } : {}),
        params,
        view,
        ...commands,
        source: 'cli',
        metrics: {
          ok: false,
          pieces: c.pieces.length,
          ...(result.metrics ? { maxLen: result.metrics.maxLen } : {}),
          genMs: result.genMs,
          restarts: result.restartsUsed,
          backtracks: result.backtracks,
          aborted,
          stuck,
        },
      })
      if (svgOut && svg !== undefined) Deno.writeTextFileSync(svgOut, svg)
      console.log(
        `${
          storedNames(meta, svgOut)
        }  not closed: ${stuck.remaining} cells left in ${stuck.sizes.length} fragments, pieces=${meta.pieces} restarts=${result.restartsUsed} backtracks=${result.backtracks} ${
          (result.genMs / 1000).toFixed(2)
        } s`,
      )
    }
    Deno.exit(1)
  }
  const m = result.metrics
  if (!m) throw new Error('unreachable: ok without metrics')
  if (dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      W,
      H,
      seed: params.seed,
      id: boardId(params),
      params,
      view,
      ...commands,
      ok: true,
      pieces: m.N,
      avgLen: +(W * H / m.N).toFixed(2),
      maxLen: m.maxLen,
      bends: +m.bends.toFixed(3),
      coiling: +m.coil.toFixed(3),
      f0: +m.f0.toFixed(4),
      solvable: m.solvable,
      backtracks: result.backtracks,
      restarts: result.restartsUsed,
      genMs: Math.round(result.genMs),
      metricsMs: Math.round(result.metricsMs),
      svgBytes: new TextEncoder().encode(toSvg(c, svgView)).byteLength,
      boardBytes,
      fingerprint: fingerprint(c),
    }))
    Deno.exit(0)
  }
  const svg = svgFlag ? toSvg(c, svgView) : undefined
  const meta = saveBoard({
    board: file,
    ...(svg !== undefined ? { svg } : {}),
    params,
    view,
    ...commands,
    source: 'cli',
    metrics: { ok: result.ok, pieces: c.pieces.length, maxLen: m.maxLen, genMs: result.genMs },
  })
  if (svgOut && svg !== undefined) Deno.writeTextFileSync(svgOut, svg)
```

followed by the existing `if (view.top > 0) { … }` block unchanged, and then:

```ts
  console.log(
    `${storedNames(meta, svgOut)}  pieces=${m.N} avgLen=${(W * H / m.N).toFixed(1)} maxLen=${m.maxLen} bends=${
      m.bends.toFixed(2)
    } coiling=${
      (100 * m.coil).toFixed(0)
    }% backtracks=${result.backtracks} restarts=${result.restartsUsed} ${(result.genMs / 1000).toFixed(2)} s`,
  )
  Deno.exit(0)
}
```

Note: the `--top` block prints its lines before the summary line, so the summary is not at the start of stdout when `--top` is given; the tests above never pass `--top` with a `^` anchor.

Run: `deno test --allow-read --allow-write --allow-env --allow-run packages/cli/carve.test.ts`
Expected: PASS.

- [ ] **Step 10: Everything Deno, then commit**

Run: `deno task check && deno task lint && deno task test`
Expected: all pass. (`deno task bundle` still builds: the lab page still posts `svg`, which the server now refuses — the lab is rewired in Tasks 6–7.)

```bash
deno fmt packages/engine/ packages/cli/
git add packages/engine/ packages/cli/
git commit -m "The CLI and the store write a board file by default, and the SVG becomes a preview behind --svg"
```

---

### Task 5: A batch of closed boards: `--count` and `--max-seeds`

Suggested model: Opus.

**Files:**
- Modify: `packages/cli/carve.ts` (the time budget at lines 57-80, a new block after `refuseInvalid(params)` at line 152, the one-board section from Task 4)
- Modify: `packages/engine/command.ts` (`SIMPLE_PASS` at line 312, `MODE_FLAGS`, `SIMPLE_MODE_FLAGS`)
- Test: `packages/cli/carve.test.ts`, `packages/engine/command.test.ts`

**Interfaces:**
- Consumes: `saveBoard`, `storedNames`, `encodeBoard` (Task 4).
- Produces: flags `--count=N`, `--max-seeds=M`; stdout per board `<W>x<H>/<id>.board.json  pieces=… maxLen=… <s> s`, final line `batch: <written>/<N> boards written, <tried> seeds tried[, not closed: <seeds>]`; stderr per skipped seed `seed <n>: not closed (<k> cells left), skipped`; exit 0/1/2.

- [ ] **Step 1: Write the failing tests**

In `packages/engine/command.test.ts`: add `'--count=N', '--max-seeds=M',` to both `helpText` flag lists (advanced and simple), and extend the `parseSimpleArgs` pass-through test:

```ts
Deno.test('parseSimpleArgs: the one-board mode flags and --help pass through in rest', () => {
  const r = parseSimpleArgs([
    '--width=25',
    '--height=50',
    '--svg=out.svg',
    '--dry-run',
    '--help',
    '-h',
    '--svg',
    '--count=3',
    '--max-seeds=9',
  ])
  assertEquals(r.errors, [])
  assertEquals(r.rest, ['--svg=out.svg', '--dry-run', '--help', '-h', '--svg', '--count=3', '--max-seeds=9'])
})
```

In `packages/cli/carve.test.ts` add a section at the end:

```ts
// --- a batch: --count=N [--max-seeds=M] --------------------------------------
// A pool of boards for Storage: N closed boards on the seeds from --seed up.
// A seed that does not close is skipped and not stored; the batch gives up
// after --max-seeds seeds (default 2·N). Closing is deterministic, so the
// same command always writes the same files.

Deno.test('carve.ts --count=3 writes three closed boards on consecutive seeds and exits 0', () => {
  const dir = tmp()
  const r = runCarve(['--width=10', '--height=10', '--seed=1', '--count=3'], dir)
  assertEquals(r.status, 0, r.stderr)
  for (const seed of [1, 2, 3]) {
    const params = simpleParams({ ...defaultChoice(), W: 10, H: 10, seed })
    const id = boardId(params)
    assertEquals(storedFingerprint(join(dir, '10x10', `${id}.board.json`)), fingerprint(generate(params).board))
    assertMatch(readMeta(join(dir, '10x10', `${id}.json`)).simpleCommand ?? '', new RegExp(` --seed=${seed}$`))
  }
  assertEquals(entries(join(dir, '10x10')), 6, 'a board file and a meta per board, no preview')
  assertMatch(r.stdout, /batch: 3\/3 boards written, 3 seeds tried\n$/)
})

Deno.test('carve.ts --count with --svg writes a preview per board', () => {
  const dir = tmp()
  const r = runCarve(['--advanced', '--svg', '--w=10', '--h=10', '--seed=1', '--count=2'], dir)
  assertEquals(r.status, 0, r.stderr)
  assertEquals(entries(join(dir, '10x10')), 6, 'board file, meta and preview for each of two boards')
})

Deno.test('carve.ts --count skips seeds that do not close, stores none of them, and exits 1 at the seed limit', () => {
  const dir = tmp()
  const r = runCarve([...LONG, '--board', '--count=2', '--max-seeds=2'], join(dir, 'boards'), { CARVE_TIMEOUT_S: '0' })
  assertEquals(r.status, 1, r.stderr)
  assertMatch(r.stderr, /seed 7: not closed \(\d+ cells left\), skipped\n/)
  assertMatch(r.stderr, /seed 8: not closed \(\d+ cells left\), skipped\n/)
  assertMatch(r.stdout, /batch: 0\/2 boards written, 2 seeds tried, not closed: 7 8\n$/)
  assertEquals(exists(join(dir, 'boards')), false, 'nothing is stored')
})

Deno.test('carve.ts refuses --count and --max-seeds where they cannot apply: exit 2, nothing written', () => {
  const dir = tmp()
  const cases: [string[], string][] = [
    [['--width=10', '--height=10', '--count=0'], '--count=0 is not a positive integer'],
    [['--width=10', '--height=10', '--count=two'], '--count=two is not a positive integer'],
    [['--width=10', '--height=10', '--max-seeds=3'], '--max-seeds needs --count'],
    [['--advanced', '--w=10', '--h=10', '--count=2'], '--count needs a mode that writes boards'],
    [['--width=10', '--height=10', '--svg=one.svg', '--count=2'], '--svg=path names one file'],
    // --count=1 may reach two seeds (2·N): 999999 and 1000000, one past the envelope.
    [['--width=10', '--height=10', '--seed=999999', '--count=1'], 'seed: 1000000 is outside 0..999999'],
  ]
  for (const [argv, message] of cases) {
    const r = runCarve(argv, dir)
    assertEquals(r.status, 2, argv.join(' '))
    assert(r.stderr.includes(message), `${argv.join(' ')}: stderr lacks "${message}":\n${r.stderr}`)
  }
  const dry = dryRun(['--width=10', '--height=10', '--dry-run', '--count=2'], dir)
  assertEquals(dry.status, 2)
  assertEquals(dry.json?.error, 'invalid arguments')
  assertEquals(entries(dir), 0, 'nothing is written')
})
```

Run: `deno test --allow-read packages/engine/command.test.ts` and `deno test --allow-read --allow-write --allow-env --allow-run packages/cli/carve.test.ts --filter "count"`
Expected: FAIL (unknown flag `--count` in simple mode; no batch).

If `seed: 1000000 is outside 0..999999` does not match `formatViolation` word for word, run `deno task carve --width=10 --height=10 --seed=1000000 --dry-run` once, read the violation text and use it in the test.

- [ ] **Step 2: Parser and help**

In `packages/engine/command.ts`:
- `const SIMPLE_PASS = /^(--svg(=.*)?|--dry-run|--help|-h|--count=.*|--max-seeds=.*)$/`
- after the `--dry-run` row of `MODE_FLAGS`:

```ts
  ['--count=N', 'with --board or --svg: N closed boards on the seeds from --seed up; one that does not close is skipped'],
  ['--max-seeds=M', 'with --count: give up after M seeds (default 2 x N)'],
```

- after the `--dry-run` row of `SIMPLE_MODE_FLAGS`:

```ts
  ['--count=N', 'N closed boards on the seeds from --seed up; one that does not close is skipped'],
  ['--max-seeds=M', 'with --count: give up after M seeds (default 2 x N)'],
```

Run: `deno test --allow-read packages/engine/command.test.ts`
Expected: PASS.

- [ ] **Step 3: A time budget per board**

In `packages/cli/carve.ts` replace `const deadline = timeoutS === null ? Infinity : performance.now() + timeoutS * 1000` with:

```ts
let deadline = Infinity
/** Starts the CARVE_TIMEOUT_S budget afresh: once for the run, and once per seed of a batch. */
function armDeadline(): void {
  deadline = timeoutS === null ? Infinity : performance.now() + timeoutS * 1000
}
armDeadline()
```

- [ ] **Step 4: Check the batch flags before any generation**

Right after the line `refuseInvalid(params)` (line 152) insert:

```ts
// --- a batch: --count=N [--max-seeds=M] ------------------------------------
// N closed boards on the seeds from --seed up, for a pool of boards to upload.
// Refused where it cannot apply, before any board is generated.
/** A positive integer flag, or null when it is absent; anything else is refused. */
function positiveFlag(name: string): number | null {
  const hit = rest.find((a) => a.startsWith(`--${name}=`))
  if (hit === undefined) return null
  const n = Number(hit.slice(name.length + 3))
  if (!Number.isInteger(n) || n < 1) refuseErrors('invalid arguments', [`${hit} is not a positive integer`])
  return n
}
const count = positiveFlag('count')
const maxSeeds = positiveFlag('max-seeds')
const writesBoards = !dryRun && (!advanced || rest.some((a) => a === '--board' || a.startsWith('--svg')))
if (maxSeeds !== null && count === null) refuseErrors('invalid arguments', ['--max-seeds needs --count'])
if (count !== null && !writesBoards) {
  refuseErrors('invalid arguments', [
    '--count needs a mode that writes boards: the simple mode, --board or --svg (not --dry-run, --bench or the report)',
  ])
}
if (count !== null && rest.some((a) => a.startsWith('--svg='))) {
  refuseErrors('invalid arguments', ['--svg=path names one file; with --count use --svg'])
}
const seedLimit = count === null ? 0 : maxSeeds ?? 2 * count
// The last seed the batch may reach has to be a seed the engine accepts.
if (count !== null) refuseInvalid({ ...params, seed: params.seed + seedLimit - 1 })

/** The parameters and the simple command of one seed; --randomized draws them anew for every seed. */
function forSeed(seed: number): { params: Params; simpleCommand: string | null } {
  if (!simple) return { params: { ...params, seed }, simpleCommand: null }
  const choice = { ...simple.choice, seed }
  return {
    params: simpleParams(choice, choice.random ? Math.random : null),
    simpleCommand: buildSimpleCommand(choice, view),
  }
}
```

- [ ] **Step 5: Run the batch**

In the one-board section, right after `const svgOut = svgFlag?.includes('=') ? svgFlag.slice('--svg='.length) : null`, insert (before `const result = generate(...)`):

```ts
  if (count !== null) {
    let written = 0, tried = 0
    const skipped: number[] = []
    for (let seed = params.seed; written < count && tried < seedLimit; seed++) {
      tried++
      const pick = forSeed(seed)
      armDeadline()
      const result = generate({ ...pick.params, ...hooks })
      if (!result.ok) {
        skipped.push(seed)
        console.error(`seed ${seed}: not closed (${result.stuck?.remaining ?? '?'} cells left), skipped`)
        continue
      }
      const m = result.metrics
      if (!m) throw new Error('unreachable: ok without metrics')
      const svg = svgFlag ? toSvg(result.board, svgOptions(view)) : undefined
      const meta = saveBoard({
        board: encodeBoard(result.board),
        ...(svg !== undefined ? { svg } : {}),
        params: pick.params,
        view,
        command: buildCommand(pick.params, view),
        ...(pick.simpleCommand ? { simpleCommand: pick.simpleCommand } : {}),
        source: 'cli',
        metrics: { ok: true, pieces: result.board.pieces.length, maxLen: m.maxLen, genMs: result.genMs },
      })
      written++
      console.log(`${storedNames(meta, null)}  pieces=${m.N} maxLen=${m.maxLen} ${(result.genMs / 1000).toFixed(2)} s`)
    }
    const notClosed = skipped.length ? `, not closed: ${skipped.join(' ')}` : ''
    console.log(`batch: ${written}/${count} boards written, ${tried} seeds tried${notClosed}`)
    Deno.exit(written === count ? 0 : 1)
  }
```

Add to the file's header comment, after the `--dry-run` line of the advanced modes:

```ts
//   --count=N       with --board or --svg (or in the simple mode): N closed
//                   boards on the seeds from --seed up, skipping any that
//                   does not close; --max-seeds=M gives up after M seeds
//                   (default 2·N); exit 1 when it gives up
```

- [ ] **Step 6: Run the tests**

Run: `deno test --allow-read --allow-write --allow-env --allow-run packages/cli/carve.test.ts`
Expected: PASS, all tests including the four batch tests. If `--count=3` on 10×10 from seed 1 reports a skipped seed, the board simply did not close: change the test to a start seed where three consecutive seeds close (try `--seed=10`) and note it in the commit message.

- [ ] **Step 7: Commit**

```bash
deno task check && deno task lint && deno task test
deno fmt packages/engine/command.ts packages/engine/command.test.ts packages/cli/carve.ts packages/cli/carve.test.ts
git add packages/engine/command.ts packages/engine/command.test.ts packages/cli/carve.ts packages/cli/carve.test.ts
git commit -m "--count fills a pool of closed boards on consecutive seeds, skipping the ones that do not close"
```

---

### Task 6: The lab's generation tab draws through `<arrowz-board>`

Suggested model: Opus.

**Files:**
- Modify: `packages/engine/types.ts` (`WorkerIn`, `WorkerOut`)
- Modify: `packages/cli/lab-worker.ts` (whole file)
- Modify: `packages/cli/lab-page.ts` (imports, zoom block 561-589, worker block 643-848, `saveBoardToStore` 857-884, `showTab` 902-913, URL state 1186-1263, startup 1394, `applyLanguage` 258)
- Modify: `packages/cli/lab.html` (CSS 94-142, preview controls 217-223, board area 283)
- Modify: `packages/engine/lab-i18n.ts` (remove `fitBoard`, `zoomLabel`, `zoomHelp`)
- Modify: `packages/cli/project.json` (`implicitDependencies`)

**Interfaces:**
- Consumes: `decodeBoard`, `encodeBoard`, `toSvg`, `BoardData`, `BoardFile` (`@arrowz/engine`); `svgOptions` (`@arrowz/engine/command`); `ArrowzBoard`, `BoardView` from `'../board-element/src/mod.ts'`; `POST /api/boards` with `board` (Task 4).
- Produces: `WorkerIn = { type: 'generate'; params: Params }`; `WorkerOut` `done` carries `board: BoardFile`; in `lab-page.ts`: `boardEl: ArrowzBoard`, `boardView(v: View, voids: boolean): Partial<BoardView>`, `showBoard(board: BoardData | null, view: Partial<BoardView>): void`, `longestSummary(board: BoardData, n: number): LongestSummary[]` — used by Task 7.

There is no automated test of the lab page: the gate is `deno task check` (it type-checks `lab-page.ts` and, through it, the element's sources), `deno task bundle`, the server tests, and the manual pass in Step 8.

- [ ] **Step 1: Worker messages**

In `packages/engine/types.ts` replace `WorkerIn` and `WorkerOut` with:

```ts
export type WorkerIn = { type: 'generate'; params: Params }

export type WorkerOut =
  | { type: 'progress'; info: TraceInfo }
  | { type: 'error'; message: string }
  | {
    type: 'done'
    ok: boolean
    metrics: Metrics | null
    backtracks: number
    restartsUsed: number
    genMs: number
    metricsMs: number
    totalMs: number
    stuck: Stuck | null
    pieces: number
    stats: CarverStats
    /** The board as its file: one string across the worker boundary, and the file the store keeps. */
    board: BoardFile
  }
```

- [ ] **Step 2: The worker only generates**

Replace `packages/cli/lab-worker.ts` with:

```ts
/// <reference no-default-lib="true" />
/// <reference lib="deno.worker" />
// Laboratory worker: all generation happens here so that the interface stays
// responsive. A 1000×1000 board takes tens of seconds to compute — on the main
// thread it would freeze the tab.
//
// The finished board goes back as its board file: one string crosses the
// worker boundary instead of ~90 000 piece objects, and it is the very file
// the page sends to the store. Drawing, the SVG export and the table of the
// longest pieces happen on the page, from the decoded board.
import { encodeBoard, generate } from '@arrowz/engine'
import type { WorkerIn, WorkerOut } from '@arrowz/engine'

const post = (m: WorkerOut) => self.postMessage(m)

self.onmessage = (event: MessageEvent<WorkerIn>) => {
  const msg = event.data
  const started = performance.now()
  let result
  try {
    result = generate({
      ...msg.params,
      // Progress is sent as it happens: on large boards the user has to
      // see that something is going on, and be able to abort.
      trace: (info) => post({ type: 'progress', info }),
    })
  } catch (err) {
    // Includes the InvalidParamsError generate() throws for parameters outside
    // the safe envelope: its message lists the violations and the page shows it.
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    return
  }
  post({
    type: 'done',
    ok: result.ok,
    metrics: result.metrics,
    backtracks: result.backtracks,
    restartsUsed: result.restartsUsed,
    genMs: result.genMs,
    metricsMs: result.metricsMs,
    totalMs: performance.now() - started,
    stuck: result.stuck,
    pieces: result.board.pieces.length,
    stats: result.board.stats,
    board: encodeBoard(result.board),
  })
}
```

- [ ] **Step 3: The markup**

In `packages/cli/lab.html`:
- replace the CSS from `/* The container scrolls when the zoom exceeds the window.` through `body.fitboard #boardWrap { overflow: hidden; }` with:

```css
  /* The board element pans and zooms inside this box and sizes itself to it;
     the box only has to have a size. The pixel cell size concerns only the
     downloaded SVG and the CLI command. */
  #boardWrap { background: var(--paper); border: 1px solid var(--line); border-radius: 8px;
               overflow: hidden; min-height: 0; position: relative; }
```

- replace the CSS from `#board { line-height: 0; }` through `body:not(.fitboard) #board svg { width: calc(var(--zoom) * 1px); height: auto; }` with:

```css
  #board { position: absolute; inset: 0; }
```

- in the comment of the saved-boards tab (`The panel keeps what acts on the stored board — …`) delete ` — plus\n     fit and zoom` so it ends at `in the place of the lab's.`
- delete the `<label class="check"><input type="checkbox" id="fit" checked> …</label>` line and the whole `<div class="row" id="zoomRow"> … </div>` block.
- replace `<div id="boardWrap"><div id="board"></div></div>` with `<div id="boardWrap"><arrowz-board id="board" enable-colors></arrowz-board></div>`.

In `packages/engine/lab-i18n.ts` delete the `fitBoard`, `zoomLabel` and `zoomHelp` entries from `EN.ui` and from `PL.ui` (`zoomHelp` spans two lines in each).

In `packages/cli/project.json` change `"implicitDependencies": ["engine"]` to `"implicitDependencies": ["engine", "board-element"]`.

- [ ] **Step 4: Mount the element on the page**

In `packages/cli/lab-page.ts`:
- add to the `@arrowz/engine` type import: `BoardData`, `BoardFile`; to the value import: `decodeBoard`, `toSvg`; change `import { buildCommand } from '@arrowz/engine/command'` to `import { buildCommand, svgOptions } from '@arrowz/engine/command'`; add

```ts
// The board element from its sources: a relative path, because Deno does not
// resolve the Node package name, and a value import (ArrowzBoard, used in the
// instanceof below), because a bare side-effect import is dropped by the
// bundler — the package's sideEffects names only its dist/.
import { ArrowzBoard, type BoardView } from '../board-element/src/mod.ts'
```

- after the `el()` function add:

```ts
// --- the board -------------------------------------------------------------
// Both tabs draw into one <arrowz-board>, the renderer of the game, so every
// board looked at here is also a check of the element. The element pans and
// zooms by itself (drag, wheel, its own buttons).
const boardNode = el('board')
if (!(boardNode instanceof ArrowzBoard)) throw new Error('#board is not an <arrowz-board>')
const boardEl: ArrowzBoard = boardNode

/** The lab's view as the element takes it; `cell` is a size in the exported SVG and does not apply. */
function boardView(v: View, voids: boolean): Partial<BoardView> {
  return {
    stroke: v.stroke,
    headWidth: v.headWidth,
    headHeight: v.headHeight,
    rounded: v.rounded,
    colored: v.colored,
    top: v.top,
    voids,
  }
}

/** Puts a board on screen with a view; null clears the board. */
function showBoard(board: BoardData | null, view: Partial<BoardView>): void {
  boardEl.board = board
  boardEl.view = view
}

/** The table of the N longest pieces: their box, how far they reach and how much they coil. */
function longestSummary(board: BoardData, n: number): LongestSummary[] {
  const W = board.W
  // slice(), not a spread into a call: the piece count reaches ~90 000.
  const longest = board.pieces.slice().sort((a, b) => b.cells.length - a.cells.length).slice(0, n)
  return longest.map((pc) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    const own = new Set(pc.cells.map((c) => c.y * W + c.x))
    let coil = 0
    for (const c of pc.cells) {
      if (c.x < minX) minX = c.x
      if (c.x > maxX) maxX = c.x
      if (c.y < minY) minY = c.y
      if (c.y > maxY) maxY = c.y
      let touch = 0
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        if (own.has((c.y + dy) * W + (c.x + dx))) touch++
      }
      if (touch >= 3) coil++
    }
    const sx = maxX - minX + 1
    const sy = maxY - minY + 1
    return {
      len: pc.cells.length,
      sx,
      sy,
      span: Math.max(sx / board.W, sy / board.H),
      density: pc.cells.length / (sx * sy),
      coil: coil / pc.cells.length,
    }
  })
}
```

- in `applyLanguage`, after `document.documentElement.lang = lang` add `boardEl.lang = lang`.

- [ ] **Step 5: Drop the lab's zoom**

In `packages/cli/lab-page.ts` delete: the whole `// --- preview zoom ---` block (`applyZoom` and the four listeners on `fit`, `zoom`, `zoomRange`, `boardWrap` dblclick); the `fit` and `zoom` fields of `UrlView` and of the object in `saveToUrl`; in `loadFromUrl` the `if (view.zoom) { … }` block, the `el<HTMLInputElement>('fit').checked = …` line and the `applyZoom()` call; and the `applyZoom()` line before `const fromUrl = loadFromUrl()`. Old links carrying `fit`/`zoom` still load: those two fields are simply not read.

- [ ] **Step 6: Generation, redraw, download and store without SVG**

In `packages/cli/lab-page.ts`:
- the comment above `type Done` ends `…so the engine runs in a worker and the page receives progress and the finished board file.`
- `onWorkerMessage` becomes:

```ts
function onWorkerMessage(msg: WorkerOut) {
  switch (msg.type) {
    case 'progress': {
      const { pieces, remaining, backtracks, ms, total } = msg.info
      const done = 100 * (1 - remaining / total)
      const short = (n: number) => (n >= 10000 ? (n / 1000).toFixed(0) + 'k' : fmt(n))
      setStatus(t('progress', done.toFixed(1), short(pieces), short(remaining), backtracks, (ms / 1000).toFixed(1)))
      el('bar').style.width = done.toFixed(1) + '%'
      return
    }
    case 'error':
      setStatus(`<span class="bad">${t('generationError')}</span> ${msg.message}`)
      finish()
      return
    case 'done': {
      let board: BoardData
      try {
        board = decodeBoard(msg.board)
      } catch (err) {
        // The worker encoded this file a moment ago: a failure is a codec bug, shown rather than hidden.
        setStatus(`<span class="bad">${t('generationError')}</span> ${err instanceof Error ? err.message : String(err)}`)
        finish()
        return
      }
      lastDone = msg
      labBoard = board
      report(msg)
      finish()
      if (activeTab === 'lab') showLabBoard()
      saveBoardToStore(msg.board, msg)
      return
    }
  }
}
```

and `newWorker` sets `w.onmessage = (e: MessageEvent<WorkerOut>) => onWorkerMessage(e.data)`.
- replace `let lastLongest: LongestSummary[] | null = null` with:

```ts
let labBoard: BoardData | null = null // the last generated board, decoded
let lastLongest: LongestSummary[] | null = null
```

and delete `let sentView = ''` with its comment.
- in `run()`, delete `sentView = viewKey()` and post `{ type: 'generate', params: runParams } satisfies WorkerIn`.
- replace the block from `// Preview toggles redraw the board without regenerating.` through the end of `redraw()` with:

```ts
/** The lab tab's board with the lab's view, and the table of its longest pieces. */
function showLabBoard(): void {
  const view = viewOptions()
  showBoard(labBoard, boardView(view, voidsOn()))
  lastLongest = labBoard ? longestSummary(labBoard, view.top) : null
  renderLongest(lastLongest ?? [])
}

// Preview toggles only change what the element draws: the page holds the
// decoded board, so nothing is regenerated and nothing waits for the worker,
// not even during a run.
function redraw() {
  saveToUrl()
  if (activeTab === 'lab') showLabBoard()
}
```

- delete `viewKey()` and its doc comment (the `voidsOn()` function above it stays).
- the download listener becomes:

```ts
el('download').addEventListener('click', () => {
  if (!labBoard) return
  // The SVG is an export only: drawn here, on demand, from the board on screen.
  const svg = toSvg(labBoard, { ...svgOptions(viewOptions()), voids: voidsOn() })
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `arrowz-${runParams.W}x${runParams.H}-seed${runParams.seed}.svg`
  a.click()
  URL.revokeObjectURL(url)
})
```

- the store comment becomes `// The board goes to disk through the lab server — once per generation, as its board file with the view of the moment. A missing store server (e.g. other static hosting) does not break the report; it only appends a warning to the status.`, and `saveBoardToStore` takes the file:

```ts
async function saveBoardToStore(board: BoardFile, done: Done) {
  const view = storeView()
  const body = {
    board,
    params: runParams,
    view,
    command: buildCommand(runParams, view),
    source: 'lab',
    metrics: {
      ok: done.ok,
      pieces: done.pieces,
      maxLen: done.metrics?.maxLen ?? null,
      genMs: done.genMs,
      restarts: done.restartsUsed,
      backtracks: done.backtracks,
      stuck: done.stuck,
    },
  }
```

(the `try` block after it is unchanged).
- the tabs comment ends `…Back in the lab, the lab's own board comes back.`, and `showTab` becomes:

```ts
function showTab(name: Tab) {
  activeTab = name
  document.body.classList.toggle('tab-library', name === 'library')
  for (const b of tabButtons) b.classList.toggle('on', tabOf(b) === name)
  el('library').hidden = name !== 'library'
  if (name === 'library') loadLibrary({ open: true })
  else {
    showLabBoard()
    if (lastDone) report(lastDone, { keepPrev: true })
  }
  saveToUrl()
}
```

- the library's worker speaks the old `WorkerIn`, so it goes now (Task 7 gives the library its new code): delete `libWorker`, `libWorkerId`, `libTimer`, `dropLibWorker`, `libRender`, `scheduleLibRender`, `onLibWorkerMessage` and the five listeners on `libStroke`, `libHeadWidth`, `libHeadHeight`, `libRounded`, `libColored` — that is, the whole block from `let libWorker: Worker | null = null` through `el('libColored').addEventListener('change', scheduleLibRender)`, keeping only `libView(meta)`, which Task 7 uses; in `openBoard` delete the line `if (libWorkerId !== meta.id) dropLibWorker()` and replace `el('board').innerHTML = await r.text()` with `showBoard(null, {})`; in the delete handler delete `dropLibWorker()` and replace `el('board').innerHTML = ''` with `showBoard(null, {})`. Between this task and the next the library lists boards but draws none.

- [ ] **Step 7: Check and bundle**

Run: `deno task check && deno task lint && deno task test && deno task bundle`
Expected: all pass; `packages/cli/dist/lab-page.js` exists and contains `customElements.define` (`grep -c "customElements.define" packages/cli/dist/lab-page.js` prints at least 1). Fix every unused import or variable `deno lint` reports (for example `LongestSummary` stays used by `longestSummary`; `WorkerIn` stays used by `run()`).

- [ ] **Step 8: Manual pass**

Run `sh packages/cli/lab.sh` (it builds, watches and opens `http://localhost:8777/lab.html`). With a real mouse:
1. The simple view generates a board on load; it appears in the element, fitted, with the zoom buttons bottom right.
2. Drag pans, the wheel zooms, the element's fit button refits.
3. Change stroke, head width, head height, rounded, colour: the board redraws at once, without the status line saying "generating".
4. In the advanced view, "highlight the longest pieces" with 5: five pieces are pink on top, and the longest-pieces table shows five rows; change the number to 3: three.
5. "Download SVG" downloads a file that opens in the browser and shows the same board.
6. Generate 400×400: progress runs, the board appears, the status gains `saved 400x400/<id>`, and `ls packages/cli/boards/400x400/` shows `<id>.board.json` and `<id>.json`, no `.svg`.
7. PL/EN switch: the element's button titles follow the language.
Stop the server with Ctrl+C.

- [ ] **Step 9: Commit**

```bash
deno fmt packages/engine/types.ts packages/engine/lab-i18n.ts packages/cli/
git add packages/engine/types.ts packages/engine/lab-i18n.ts packages/cli/
git commit -m "The lab draws its boards through <arrowz-board>, and its worker hands over a board file instead of SVG"
```

---

### Task 7: The lab's library opens board files

Suggested model: Opus.

**Files:**
- Modify: `packages/cli/lab-page.ts` (`openBoard`, the view-editing block 1049-1146, the delete handler)
- Modify: `packages/engine/lab-i18n.ts` (add `boardFileError`, remove `rebuilding`, `storedInvalid`)
- Test: `packages/engine/lab-i18n.test.ts` (the envelope key list)

**Interfaces:**
- Consumes: `boardEl`, `boardView`, `showBoard` (Task 6); `decodeBoard`; `GET /boards/<size>/<id>.board.json`, `POST /api/boards` (Task 4).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Dictionary (failing test first)**

In `packages/engine/lab-i18n.test.ts` change the envelope list to `const envelopeKeys: UiKey[] = ['violationsTitle', 'generateBlocked', 'clamped']` and add at the end:

```ts
Deno.test('both ui dictionaries explain a board file that cannot be read', () => {
  for (const d of [EN, PL]) {
    const text = d.ui.boardFileError('25x50/seed7-abc', 'the body ends early')
    assert(text.includes('25x50/seed7-abc') && text.includes('the body ends early'), text)
  }
})
```

Run: `deno test --allow-read packages/engine/lab-i18n.test.ts`
Expected: FAIL — `boardFileError` does not exist.

In `packages/engine/lab-i18n.ts`: delete `rebuilding` and `storedInvalid` from `EN.ui` and `PL.ui`; add next to `loadingBoard` in `EN.ui`:

```ts
    boardFileError: (id: string, reason: string) => `Board ${id} cannot be read: ${reason}`,
```

and in `PL.ui`:

```ts
    boardFileError: (id, reason) => `Nie da się odczytać planszy ${id}: ${reason}`,
```

Run: `deno test --allow-read packages/engine/lab-i18n.test.ts`
Expected: PASS.

- [ ] **Step 2: Open a board file**

In `packages/cli/lab-page.ts` add next to `let libBoard`:

```ts
// The chosen board as the store holds it (sent back untouched when its view
// is saved) and decoded for the element.
let libFile: unknown = null
let libData: BoardData | null = null
```

Replace `openBoard` with:

```ts
async function openBoard(meta: BoardMeta) {
  libBoard = meta
  libFile = null
  libData = null
  disarmDelete()
  renderLibrary()
  showLibDetail(true)
  el('libCommand').textContent = meta.command
  el<HTMLInputElement>('libStroke').value = String(meta.view.stroke)
  el<HTMLInputElement>('libHeadWidth').value = String(meta.view.headWidth)
  el<HTMLInputElement>('libHeadHeight').value = String(meta.view.headHeight)
  el<HTMLInputElement>('libRounded').checked = meta.view.rounded !== false
  el<HTMLInputElement>('libColored').checked = meta.view.colored
  const name = `<code>${meta.W}x${meta.H}/${meta.id}</code>`
  setStatus(t('loadingBoard', name))
  const refuse = (err: unknown) =>
    setStatus(`<span class="bad">${t('boardFileError', name, err instanceof Error ? err.message : String(err))}</span>`)
  let file: unknown
  try {
    const r = await fetch(`/boards/${meta.W}x${meta.H}/${meta.id}.board.json`)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    file = await r.json()
  } catch (err) {
    if (activeTab === 'library' && libBoard === meta) refuse(err)
    return
  }
  // Another board may have been chosen, or the tab left, while this one loaded.
  if (activeTab !== 'library' || libBoard !== meta) return
  try {
    libData = decodeBoard(file)
  } catch (err) {
    showBoard(null, {})
    refuse(err)
    return
  }
  libFile = file
  showLibBoard(meta)
  showBoardStatus(meta)
}
```

- [ ] **Step 3: Edit a stored board's view without regenerating**

Replace the whole block from `// --- editing the view of a stored board ---` through the end of `libView` (all that Task 6 left of it) with:

```ts
// --- editing the view of a stored board ------------------------------------
// The store holds the board itself, so a new stroke or colour is only a new
// view: the element redraws at once, and after a pause the same board file
// goes back to the store with the new view in its meta. Nothing is
// regenerated, and the command in the meta still reproduces the board.
let libTimer: ReturnType<typeof setTimeout> | undefined
function libView(meta: BoardMeta): View {
  return {
    cell: meta.view.cell,
    stroke: Number(el<HTMLInputElement>('libStroke').value),
    headWidth: Number(el<HTMLInputElement>('libHeadWidth').value),
    headHeight: headHeightOf('libHeadHeight'),
    colored: el<HTMLInputElement>('libColored').checked,
    top: 0, // stored boards carry no highlight
    rounded: el<HTMLInputElement>('libRounded').checked,
  }
}
/** The chosen stored board on screen; its holes show only when it did not close. */
function showLibBoard(meta: BoardMeta): void {
  showBoard(libData, boardView(libView(meta), meta.ok === false))
}
function onLibViewInput() {
  if (!libBoard || !libData) return
  showLibBoard(libBoard)
  clearTimeout(libTimer)
  libTimer = setTimeout(saveLibView, 350)
}
async function saveLibView() {
  const meta = libBoard
  if (!meta || libFile === null) return
  const view = libView(meta)
  const body = {
    board: libFile,
    params: meta.params,
    view,
    command: buildCommand(meta.params, view),
    source: meta.source,
    metrics: { ok: meta.ok, pieces: meta.pieces, maxLen: meta.maxLen, genMs: meta.genMs },
  }
  try {
    const r = await fetch('/api/boards', { method: 'POST', body: JSON.stringify(body) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const saved: BoardMeta = await r.json()
    libBoard = saved
    el('libCommand').textContent = saved.command
    setStatus(t('viewSaved', `<code>${saved.W}x${saved.H}/${saved.id}</code>`))
    // The store keeps createdAt on an overwrite, so the row stays in place;
    // the list is refreshed for the new meta only.
    await loadLibrary({ force: true })
  } catch {
    setStatus(`<span class="bad">${t('notSaved')}</span>`)
  }
}
for (const id of ['libStroke', 'libHeadWidth', 'libHeadHeight']) el(id).addEventListener('input', onLibViewInput)
el('libRounded').addEventListener('change', onLibViewInput)
el('libColored').addEventListener('change', onLibViewInput)
```

In the delete handler, next to `libBoard = null`, add `libFile = null` and `libData = null`; `showBoard(null, {})` from Task 6 stays.

Remove imports `lint` reports as unused now (likely `validateParams` if `refreshActive` does not use it — check before removing; `WorkerIn` stays).

- [ ] **Step 4: Check and bundle**

Run: `deno task check && deno task lint && deno task test && deno task bundle`
Expected: all pass. `grep -n "libWorker\|dropLibWorker\|rebuilding\|storedInvalid\|innerHTML = msg.svg" packages/cli/lab-page.ts` prints nothing.

- [ ] **Step 5: Manual pass**

Run `sh packages/cli/lab.sh`. With a real mouse:
1. Generate two boards of one size (New seed once). Open "Saved boards": the size lists both; the chosen one draws in the element within a moment.
2. Click the other row: it draws; the status names it.
3. Change the library's stroke and colour: the board redraws at once; after ~0.4 s the status says the view was saved; the row keeps its place.
4. Run `deno task carve --width=25 --height=25 --seed=3` in a terminal, press Refresh in the library: the CLI board is listed and opens.
5. Corrupt it: `printf '{"format":"arrowz-board"}' > packages/cli/boards/25x25/<id>.board.json`, Refresh, open it: the status shows `Board 25x25/<id> cannot be read: board file version undefined is not supported…` in red and the board area is empty. Delete it with the two-click Delete.
6. "Load into lab" on a board: the lab tab comes back with that board's knobs and the lab's own last board on screen.
Stop the server.

- [ ] **Step 6: Commit**

```bash
deno fmt packages/engine/lab-i18n.ts packages/engine/lab-i18n.test.ts packages/cli/lab-page.ts
git add packages/engine/lab-i18n.ts packages/engine/lab-i18n.test.ts packages/cli/lab-page.ts
git commit -m "The library opens board files and saves a new view without regenerating the board"
```

---

### Task 8: The READMEs describe the board file and the batch

Suggested model: Sonnet.

**Files:**
- Modify: `README.md`, `README.pl.md`

- [ ] **Step 1: English**

In `README.md`:
- In the first-run code block just above "The first time you run this", the command becomes `deno task carve --width=25 --height=25 --svg`.
- Replace the paragraph `The board lands in \`packages/cli/boards/25x25/\` as two files — a picture and a small text file describing it. Open the picture in any browser.` with:

```markdown
The board lands in `packages/cli/boards/25x25/` as three files: the board itself
(`.board.json`, the file the game reads), a small text file describing it
(`.json`) and, because of `--svg`, a picture (`.svg`). Open the picture in any
browser.
```

- Replace `Copy any of these. Each one writes a picture into \`packages/cli/boards/\`; add` … `\`--dry-run\` (explained below) to see the numbers without writing a file.` (the first two sentences of that paragraph) with:

```markdown
Copy any of these. Each one writes a board into `packages/cli/boards/`; add
`--svg` to get a picture of it as well, or `--dry-run` (explained below) to see
the numbers without writing a file.
```

- Replace the section from `Writes two files into \`packages/cli/boards/40x40/\`:` through `Same as above, and additionally drops a copy at \`my-board.svg\`.` with:

````markdown
Writes two files into `packages/cli/boards/40x40/`:

* `seed7-7636b469.board.json` — the board: every arrow, cell by cell, packed
  small. This is the file a game loads.
* `seed7-7636b469.json` — a small text file recording what was asked for.

The name is the seed number plus a short code worked out from the settings. Two
boards made with different settings therefore never overwrite each other.

### Getting a picture as well

```sh
deno task carve --width=40 --height=40 --svg
deno task carve --width=40 --height=40 --svg=my-board.svg
```

`--svg` adds `seed7-7636b469.svg` next to the board. `--svg=my-board.svg` does
the same and also drops a copy at `my-board.svg`.

### Making many boards at once

```sh
deno task carve --width=100 --height=200 --seed=1 --count=50
```

Makes 50 boards on the seeds 1, 2, 3 and so on. A seed whose board does not
close is skipped (and not saved), and the next seed is tried, until there are
50. After twice as many seeds as boards it gives up; `--max-seeds=200` moves
that limit. The last line says how many boards were written and which seeds
were skipped. The same command always makes the same boards.
````

- In "Where boards are saved", replace the tree and the paragraph under it with:

````markdown
```
packages/cli/boards/
  25x25/
    seed7-7d303227.board.json   the board
    seed7-7d303227.json         what it was made from
    seed7-7d303227.svg          the picture, only with --svg
  40x40/
    ...
```

The file name is the seed followed by a short code derived from the settings.
Change a setting and you get a different code, so nothing is overwritten by
accident. (Colours and line thickness are not part of the code, so changing
only those writes to the same file name and replaces the old files.)
````

- Replace `The \`.json\` file next to each picture holds every setting used, …` paragraph with:

```markdown
The `.json` file next to each board holds every setting used, when it was
made, how long it took, and how many arrows it has. It also holds a `command`
line that makes the same board again, exactly. If you keep only one thing from
a board, keep that line.
```

- Replace `> Boards are not part of the repository. \`packages/cli/boards/\` is deliberately` / `> left out of it, because large boards run to tens of megabytes.` with:

```markdown
> Boards are not part of the repository. `packages/cli/boards/` is deliberately
> left out of it: a 1000×1000 board file is about a megabyte, and its picture
> tens of megabytes.
```

- In "When something goes wrong", `The picture is` / `in \`packages/cli/boards/\` all the same, uncovered squares tinted pink, so you can` / `see where it got stuck.` becomes `The board is in \`packages/cli/boards/\` all the same; add \`--svg\` and the picture shows the uncovered squares tinted pink, so you can see where it got stuck.` (rewrap to the file's ~80 columns).

- [ ] **Step 2: Polish**

In `README.pl.md`, the same places:
- first-run command: `deno task carve --width=25 --height=25 --svg`.
- `Plansza ląduje w …` paragraph:

```markdown
Plansza ląduje w `packages/cli/boards/25x25/` jako trzy pliki: sama plansza
(`.board.json`, plik, który czyta gra), mały plik tekstowy, który ją opisuje
(`.json`), i — dzięki `--svg` — obrazek (`.svg`). Obrazek otworzy dowolna
przeglądarka.
```

- the "Pięć rzeczy do wypróbowania" opening:

```markdown
Skopiuj dowolne z tych poleceń. Każde zapisuje planszę w `packages/cli/boards/`;
dopisz `--svg`, żeby dostać też jej obrazek, albo `--dry-run` (opisane niżej),
żeby zobaczyć same liczby bez tworzenia pliku. Każdą użytą tu flagę objaśnia
sekcja [Ustawienia na co dzień](#ustawienia-na-co-dzień).
```

- from `Zapisuje dwa pliki w \`packages/cli/boards/40x40/\`:` through `To samo co wyżej, a dodatkowo kopia w \`moja-plansza.svg\`.`:

````markdown
Zapisuje dwa pliki w `packages/cli/boards/40x40/`:

* `seed7-7636b469.board.json` — plansza: każda strzałka, komórka po komórce,
  ciasno spakowana. Ten plik wczytuje gra.
* `seed7-7636b469.json` — mały plik tekstowy z zapisem tego, o co poproszono.

Nazwa to numer ziarna plus krótki kod wyliczony z ustawień. Dwie plansze
zrobione przy różnych ustawieniach nigdy się więc nawzajem nie nadpiszą.

### Obrazek w dodatku

```sh
deno task carve --width=40 --height=40 --svg
deno task carve --width=40 --height=40 --svg=moja-plansza.svg
```

`--svg` dokłada `seed7-7636b469.svg` obok planszy. `--svg=moja-plansza.svg`
robi to samo i dodatkowo zostawia kopię w `moja-plansza.svg`.

### Wiele plansz naraz

```sh
deno task carve --width=100 --height=200 --seed=1 --count=50
```

Robi 50 plansz na ziarnach 1, 2, 3 i dalej. Ziarno, którego plansza się nie
domyka, jest pomijane (i nie zapisywane), a próbowane jest następne, aż będzie
50. Po dwa razy większej liczbie ziaren niż plansz poddaje się; `--max-seeds=200`
przesuwa tę granicę. Ostatnia linia mówi, ile plansz zapisano i które ziarna
pominięto. To samo polecenie zawsze robi te same plansze.
````

- the store tree and the paragraph under it:

````markdown
```
packages/cli/boards/
  25x25/
    seed7-7d303227.board.json   plansza
    seed7-7d303227.json         z czego powstała
    seed7-7d303227.svg          obrazek, tylko z --svg
  40x40/
    ...
```

Nazwa pliku to ziarno, a po nim krótki kod wyliczony z ustawień. Zmień
ustawienie, a dostaniesz inny kod, więc nic nie nadpisze się przypadkiem.
(Kolory i grubość linii nie wchodzą do kodu, więc zmiana tylko ich zapisuje pod
tą samą nazwą i zastępuje poprzednie pliki.)
````

- `Plik \`.json\` obok każdego obrazka …` paragraph:

```markdown
Plik `.json` obok każdej planszy trzyma wszystkie użyte ustawienia, datę
powstania, czas liczenia i liczbę strzałek. Trzyma też linię `command`, która
robi tę samą planszę jeszcze raz, dokładnie. Jeśli masz zachować z planszy
jedną rzecz, zachowaj tę linię.
```

- the note:

```markdown
> Plansze nie trafiają do repozytorium. `packages/cli/boards/` jest celowo
> wykluczone: plik planszy 1000×1000 waży około megabajta, a jej obrazek
> dziesiątki megabajtów.
```

- the `failed to close board` answer: `Obrazek mimo to jest w …` becomes `Plansza mimo to jest w \`packages/cli/boards/\`; dopisz \`--svg\`, a obrazek pokaże niepokryte kwadraty na różowo, więc widać, gdzie generator utknął.` (rewrap).

- [ ] **Step 3: Check the commands in the text**

Run each new command once and confirm it does what the text says:

```bash
deno task carve --width=40 --height=40 --seed=7 && ls packages/cli/boards/40x40/
deno task carve --width=40 --height=40 --seed=7 --svg && ls packages/cli/boards/40x40/
deno task carve --width=100 --height=200 --seed=1 --count=3 | tail -1
```

Expected: first `ls` shows `.board.json` and `.json` for `seed7-…` (the id in the README, `seed7-7636b469`, must match what the CLI prints — if it does not, the README example already differed before this change and stays as it is); second adds `.svg`; the batch ends `batch: 3/3 boards written, 3 seeds tried` (or names skipped seeds).

- [ ] **Step 4: Commit**

```bash
git add README.md README.pl.md
git commit -m "The READMEs describe the board file as the default output, the picture behind --svg, and the batch"
```

---

### Task 9: Measure, verify, and record

Suggested model: Opus (or the controller itself).

**Files:**
- Modify: `docs/superpowers/specs/2026-09-11-board-data-model-design.md` (§2.3 sizes, §6 size test, §5.1 spike outcome)

- [ ] **Step 1: Insane file size**

Run: `deno task carve --width=1000 --height=1000 --seed=7 --dry-run | tail -1`
Read `boardBytes` and `pieces` from the JSON line.

- [ ] **Step 2: Decoding time on the page**

Run `sh packages/cli/lab.sh`, choose the Insane square preset, generate (~30 s in a Chrome worker). In DevTools → Performance, record while the board arrives; read the duration of `decodeBoard` in the main-thread flame chart. If it exceeds ~300 ms, report it; the spec's fallback (decode in the worker, post `BoardData`) becomes a follow-up, not part of this branch. Also pan and zoom the Insane board: it must feel as it does in the element demo.

- [ ] **Step 3: Record in the spec**

In the spec:
- §2.3, replace `Insane (1000×1000, ~86 000 pieces) comes to roughly 0.7 MB of body and 0.9 MB of base64. The test records the measured size as a ceiling (§6).` with `Insane (1000×1000, seed 7, <pieces> pieces) measured <boardBytes> bytes of file on 2026-09-11 (\`--dry-run\`, \`boardBytes\`); the test pins the golden board big500 as a ceiling (§6).` using the numbers from Step 1.
- §6, replace `- **Size**: the Insane board's file size is measured once and pinned as a ceiling, so a regression in the encoding shows up as a failing test.` with `- **Size**: the file of the golden board big500 is pinned as a ceiling in \`fingerprints.test.ts\`; Insane is measured through \`--dry-run\` and recorded in §2.3.`
- §5.1, append: `Outcome (2026-09-11, planning spike): \`deno bundle\` takes the element from \`../board-element/src/mod.ts\` with Lit; the import must be a value import used by the page, and \`arrowz-board.ts\` needed \`override\` on two statics for \`deno check\`. No fallback needed.`, and in §5 add the decode time from Step 2 after the sentence about ~300 ms.

- [ ] **Step 4: Full verification**

Run: `deno task verify`
Expected: check, lint, fmt, test all pass.
Run: `pnpm nx run-many -t verify`
Expected: every project passes (engine smoke included, board-element Vitest in Chromium included).

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-11-board-data-model-design.md
git commit -m "The spec records the measured size of an Insane board file and the spike's outcome"
```
