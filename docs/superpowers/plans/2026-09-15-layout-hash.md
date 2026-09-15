# Layout Hash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Name a board's arrangement of arrows by a canonical SHA-256 (`sha256-<64 hex>`), and name the board store, the CLI's reports and the lab's board-file download by it.

**Architecture:** `layoutHash(board)` lives beside the board-file codec in the runtime-neutral engine and hashes a canonical byte form that ignores piece ids and carving order. The store (`packages/cli/store.ts`) becomes asynchronous, names files by the hash, writes a layout's board file once and keeps every recipe (seed + parameters) that produced it in the meta. The CLI counts only new layouts in a batch, and the React lab computes the hash itself before offering the download.

**Tech Stack:** TypeScript on Deno 2.9 (`deno test`, `deno check`, `deno lint`, `deno fmt`), the engine's Node build through `tsc` (`pnpm nx build engine`), React 19 + zustand + Vitest browser mode in `apps/lab`, Web Crypto (`crypto.subtle.digest`).

**Spec:** `docs/superpowers/specs/2026-09-15-layout-hash-design.md` (revision 3). Read it before any task; every task argues from it.

## Global Constraints

- Everything written into the repository is English (code, comments, tests, docs, commit messages); only `packages/engine/lab-i18n.ts`'s `PL` dictionary and `README.pl.md` are Polish.
- No `any`, no non-null assertions (`!`), no casts that change a value; `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are on everywhere.
- The engine files (`engine.ts`, `board-file.ts`, `mod.ts`, `types.ts`, `command.ts`, `lab-*.ts`) use no Deno, DOM, Node or process API; `neutral.test.ts` greps them. `crypto` is allowed.
- Never spread or `Math.min(...)` an array proportional to cells or pieces; sort a copy with `slice().sort(...)`. No `toSorted` (the Node build is lib es2022).
- `fingerprint` (`engine.ts`) and the board file format do not change.
- Layout ids match `^sha256-[0-9a-f]{64}$` exactly.
- Node consumers (`apps/lab`) import the engine from `packages/engine/dist/`; rebuild it with `pnpm nx build engine` after an engine change. Never import engine `.ts` sources from `apps/`.
- `deno task test` must pass after every task; `deno task verify` and `pnpm nx run-many -t verify` before the PR (Task 7).
- Commit messages: one plain sentence, no attribution lines, no `feat:` prefixes (the repository's style: "Keep the export error in the result slice, so no replaced board outlives it").
- Cite code by symbol in comments, never by `file:line` — this branch moves lines.
- The branch is `store/layout-hash`, based on `lab/report-export`. Commit by path (`git add <paths>`), never `git add -A`.
- Before every commit, format what the task touched: `deno fmt <files>` under `packages/` and for `README*.md`-free Deno files, `pnpm --dir apps/lab exec prettier --write <files>` under `apps/lab`. The code blocks in this plan are correct but not guaranteed to sit inside the 120-column width, and both `fmt --check` gates fail on that.

## File map

| File | Change | Task |
|---|---|---|
| `packages/engine/board-file.ts` | `ByteWriter.bytes()` retyped; new `layoutHash` | 1 |
| `packages/engine/mod.ts` | export `layoutHash` | 1 |
| `packages/engine/board-file.test.ts` | `layoutHash` cases | 1 |
| `packages/engine/fingerprints.json` | `layoutHash` per case | 2 |
| `packages/engine/fingerprints.test.ts` | check it; pairing case | 2 |
| `packages/engine/scripts/node-smoke.mjs` | check it under Node | 2 |
| `packages/engine/types.ts` | `Recipe`; `BoardMeta.sources`; `id` doc | 3 |
| `packages/cli/store.ts` | async `saveBoard` → `SaveResult`; names by hash; recipes; `readMeta`, `listBoards`, `deleteBoard` | 3 |
| `packages/cli/store.test.ts` | fixtures of distinct layouts; new cases | 3 |
| `packages/cli/lab-server.ts` | await, send `.meta`; `checkParams` comment | 3 |
| `packages/cli/lab-server.test.ts` | await direct saves; id shape; DELETE of an old name | 3 |
| `packages/cli/carve.ts` | await the three saves (Task 3); report stored layouts, batch counting, dry-run id, header (Task 4) | 3, 4 |
| `packages/cli/carve.test.ts` | locate by layout hash (Task 3); new CLI cases (Task 4) | 3, 4 |
| `packages/engine/lab-i18n.ts` | `layoutHashError` in EN and PL | 5 |
| `apps/lab/src/run/ExportButtons.tsx` | hash in component state; download name; alert | 5 |
| `apps/lab/src/run/ExportButtons.browser.test.tsx` | name, wait, stale hash, failure | 5 |
| `apps/lab/src/routes/LabRoute.browser.test.tsx` | wait for the enabled button | 5 |
| `apps/lab/src/api/boards.node.test.ts` | id shape | 5 |
| `README.md`, `README.pl.md` | store names and rule | 6 |
| `packages/cli/readme.test.ts` | documented names are real layout hashes | 6 |
| `packages/cli/lab.html` | clip `.boardrow .id` | 6 |

---

### Task 1: `layoutHash` in the engine

**Files:**
- Modify: `packages/engine/board-file.ts` (class `ByteWriter`, method `bytes`; new section after `encodeBoard`)
- Modify: `packages/engine/mod.ts` (the `board-file.ts` export line)
- Test: `packages/engine/board-file.test.ts`

**Interfaces:**
- Consumes: `ByteWriter`, `stepCode`, `at`, `BoardFileError` (all already in `board-file.ts`).
- Produces: `export async function layoutHash(board: BoardData): Promise<string>` returning `sha256-` + 64 lowercase hex, exported from `@arrowz/engine`. Tasks 2, 3, 4, 5, 6 call it.

- [ ] **Step 1: Write the failing tests**

In `packages/engine/board-file.test.ts`, extend the imports:

```ts
import { assert, assertEquals, assertMatch, assertNotEquals, assertRejects, assertThrows } from '@std/assert'
import { defaultParams, fingerprint, generate } from './engine.ts'
import {
  BOARD_FILE_VERSION,
  BOARD_FORMAT,
  BoardFileError,
  decodeBoard,
  encodeBoard,
  layoutHash,
} from './board-file.ts'
```

Append at the end of the file:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `deno test --allow-read packages/engine/board-file.test.ts`
Expected: FAIL at type-check: `Module '"./board-file.ts"' has no exported member 'layoutHash'`.

- [ ] **Step 3: Retype `ByteWriter.bytes()`**

In `packages/engine/board-file.ts`, class `ByteWriter`:

```ts
  /**
   * The written bytes. Typed on ArrayBuffer, which the buffer is: Web Crypto's
   * digest takes a BufferSource, and both `deno check` and the Node build
   * refuse a Uint8Array<ArrayBufferLike> there (TS2345).
   */
  bytes(): Uint8Array<ArrayBuffer> {
    return this.buf.subarray(0, this.len)
  }
```

- [ ] **Step 4: Implement `layoutHash`**

In `packages/engine/board-file.ts`, insert this section after `encodeBoard` and before the `// ---- decode` banner:

```ts
// ------------------------------------------------------------ layout hash

/** The first bytes of the canonical form; a new form gets a new tag, and every stored name moves with it. */
const LAYOUT_TAG = 'arrowz-layout/1'

/**
 * The name of a board's arrangement of arrows: `sha256-` and the 64 lowercase
 * hex digits of SHA-256 over a canonical form that leaves out piece ids and
 * carving order (design: docs/superpowers/specs/2026-09-15-layout-hash-design.md, §1).
 * Two recipes that carve the same arrows get the same name; `fingerprint`
 * tells them apart.
 *
 * The canonical bytes: the ASCII tag; varints W, H and the piece count; per
 * piece in ascending order of its head cell index, varint head index, varint
 * length * 4 + dir, then its steps as 2-bit DIRS indices, low bits first,
 * padded with zero bits to a whole byte per piece; varint void count, then
 * each void's cell index ascending as an absolute varint. Uncarved cells are
 * what is left. The order of cells within a piece stays: it draws the shape.
 *
 * Like encodeBoard it checks that every piece is a path, and nothing else —
 * overlaps are ruled out by decodeBoard and by the generator before a board
 * gets here.
 */
export async function layoutHash(board: BoardData): Promise<string> {
  const { W, H, owner, pieces } = board
  const out = new ByteWriter()
  for (let i = 0; i < LAYOUT_TAG.length; i++) out.byte(LAYOUT_TAG.charCodeAt(i))
  out.varint(W)
  out.varint(H)
  out.varint(pieces.length)
  // A copy is sorted, never the board's own list, and no ties are possible:
  // a cell belongs to at most one piece, so no two heads share an index.
  const byHead = pieces.map((pc) => {
    const head = at(pc.cells, 0)
    return { head: head.y * W + head.x, pc }
  })
  byHead.sort((a, b) => a.head - b.head)
  for (const { head, pc } of byHead) {
    out.varint(head)
    out.varint(pc.cells.length * 4 + pc.dir)
    let acc = 0, filled = 0
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
    if (filled > 0) out.byte(acc)
  }
  let voids = 0
  for (let i = 0; i < owner.length; i++) if (at(owner, i) === -2) voids++
  out.varint(voids)
  for (let i = 0; i < owner.length; i++) if (at(owner, i) === -2) out.varint(i)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', out.bytes()))
  let hex = ''
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0')
  return `sha256-${hex}`
}
```

(`byHead` is built with `map`, which is not a spread; `sort` works on that copy.)

- [ ] **Step 5: Export it**

In `packages/engine/mod.ts`, replace

```ts
export { BOARD_FILE_VERSION, BOARD_FORMAT, BoardFileError, decodeBoard, encodeBoard } from './board-file.ts'
```

with

```ts
export { BOARD_FILE_VERSION, BOARD_FORMAT, BoardFileError, decodeBoard, encodeBoard, layoutHash } from './board-file.ts'
```

- [ ] **Step 6: Run the tests, both type gates and the neutrality test**

Run: `deno test --allow-read packages/engine/board-file.test.ts packages/engine/neutral.test.ts`
Expected: PASS, including the four new `layoutHash` cases.

Run: `deno task check && pnpm nx build engine`
Expected: both succeed with no TS2345 or TS2550; `packages/engine/dist/mod.d.ts` lists `layoutHash`.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/board-file.ts packages/engine/mod.ts packages/engine/board-file.test.ts
git commit -m "Name a layout by the SHA-256 of a form that ignores piece ids and carving order"
```

---

### Task 2: Freeze the layout hashes of the golden boards

**Files:**
- Modify: `packages/engine/fingerprints.json` (every case gains `layoutHash` after `fingerprint`)
- Modify: `packages/engine/fingerprints.test.ts`
- Modify: `packages/engine/scripts/node-smoke.mjs`

**Interfaces:**
- Consumes: `layoutHash` from Task 1 (`./board-file.ts` in Deno, `../dist/mod.js` in Node).
- Produces: `GoldenCase.layoutHash: string` in `fingerprints.json`; nothing later tasks call.

- [ ] **Step 1: Write the failing checks**

In `packages/engine/fingerprints.test.ts`, change the import and the interface:

```ts
import { decodeBoard, encodeBoard, layoutHash } from './board-file.ts'
```

```ts
interface GoldenCase {
  name: string
  argv: string[] | null
  fingerprint: string
  layoutHash: string
  pieces: number
  maxLen: number | null
}
```

Replace the per-case loop's test with:

```ts
for (const c of golden.cases) {
  Deno.test(`golden board ${c.name} reproduces the fingerprint recorded on Node and survives the board file`, async () => {
    const r = generate(paramsOf(c), optsOf(c))
    assertEquals(fingerprint(r.board), c.fingerprint)
    assertEquals(r.board.pieces.length, c.pieces)
    // The unchecked case records no maxLen — it has no metrics.
    if (c.maxLen !== null) assertEquals(r.metrics?.maxLen, c.maxLen)
    // The layout hash is frozen beside the fingerprint: a change to the
    // generator moves both, a change to the canonical form moves only this.
    assertEquals(await layoutHash(r.board), c.layoutHash)
    // The file keeps the fingerprint, and the ids the fingerprint cannot see.
    const text = JSON.stringify(encodeBoard(r.board))
    const back = decodeBoard(JSON.parse(text))
    assertEquals(fingerprint(back), c.fingerprint)
    assertEquals(await layoutHash(back), c.layoutHash)
    assertEquals(back.pieces.map((p) => p.id), r.board.pieces.map((p) => p.id))
    if (c.name === 'big500') {
      assert(text.length <= BIG500_FILE_BYTES, `big500 file grew to ${text.length} bytes`)
    }
  })
}

Deno.test('a golden board has one layout hash per fingerprint, and the other way round', () => {
  const hashOf = new Map<string, string>()
  const fingerprintOf = new Map<string, string>()
  for (const c of golden.cases) {
    assertEquals(hashOf.get(c.fingerprint) ?? c.layoutHash, c.layoutHash, c.name)
    assertEquals(fingerprintOf.get(c.layoutHash) ?? c.fingerprint, c.fingerprint, c.name)
    hashOf.set(c.fingerprint, c.layoutHash)
    fingerprintOf.set(c.layoutHash, c.fingerprint)
  }
  assertEquals(fingerprintOf.size, 12, 'fifteen cases, twelve distinct boards')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `deno test --allow-read --allow-run packages/engine/fingerprints.test.ts`
Expected: FAIL — `assertEquals` of a hash against `undefined` in every golden case.

- [ ] **Step 3: Record the values**

Run from the repository root:

```bash
deno eval --ext=ts '
import { defaultParams, generate } from "./packages/engine/engine.ts"
import { parseArgs } from "./packages/engine/command.ts"
import { layoutHash } from "./packages/engine/board-file.ts"
const path = "packages/engine/fingerprints.json"
const golden = JSON.parse(Deno.readTextFileSync(path))
const cases = []
for (const c of golden.cases) {
  const params = c.argv === null
    ? { ...defaultParams(), W: 40, H: 40, seed: 1 }
    : parseArgs(c.argv.filter((a: string) => a !== "--dry-run")).params
  const opts = c.argv === null ? { unchecked: true, voidFrac: 0.1 } : {}
  const hash = await layoutHash(generate(params, opts).board)
  console.log(c.name, hash)
  const { name, argv, fingerprint, ...rest } = c
  cases.push({ name, argv, fingerprint, layoutHash: hash, ...rest })
}
Deno.writeTextFileSync(path, JSON.stringify({ ...golden, cases }, null, 2) + "\n")
'
deno fmt packages/engine/fingerprints.json
```

Expected: fifteen lines `<name> sha256-…`, and `git diff packages/engine/fingerprints.json` shows only added `"layoutHash"` lines.

- [ ] **Step 4: Cross-check against the spec's appendix**

Compare every printed hash with the table "Appendix: layout hashes of the golden boards, computed by the review" in the spec. They were computed independently from the spec's text by two reviewers. Expected: all fifteen agree (`defaults` and `simple` share a row, as do `tunnels`, `trap-off` and `bite-off`).

**If any hash disagrees, stop.** Do not commit. One of the two readings of spec §1 is wrong; find the difference (tag bytes, padding per piece, absolute void indices, sort key) and report it before recording anything.

- [ ] **Step 5: Check it under Node**

In `packages/engine/scripts/node-smoke.mjs`, change the import and the loop body:

```js
import { decodeBoard, defaultParams, encodeBoard, fingerprint, generate, layoutHash } from '../dist/mod.js'
```

```js
for (const c of golden.cases) {
  if (c.name === 'big500') continue
  const r = generate(paramsOf(c), optsOf(c))
  const got = fingerprint(r.board)
  // The unchecked case records no maxLen — it has no metrics.
  const maxLenOk = c.maxLen === null || r.metrics?.maxLen === c.maxLen
  // A Cloud Function will read these files: the file must round-trip in Node too.
  const back = decodeBoard(JSON.parse(JSON.stringify(encodeBoard(r.board))))
  const fileOk = fingerprint(back) === c.fingerprint
  // Web Crypto under Node names the layout exactly as Deno does.
  const hashOk = (await layoutHash(r.board)) === c.layoutHash && (await layoutHash(back)) === c.layoutHash
  const ok = got === c.fingerprint && r.board.pieces.length === c.pieces && maxLenOk && fileOk && hashOk
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${c.name} ${got} (${r.board.pieces.length} pieces, maxLen ${r.metrics?.maxLen}, file ${
      fileOk ? 'ok' : 'FAIL'
    }, layout ${hashOk ? 'ok' : 'FAIL'})`,
  )
  if (!ok) failures++
}
```

- [ ] **Step 6: Run both**

Run: `deno test --allow-read --allow-run packages/engine/fingerprints.test.ts`
Expected: PASS (18 tests: fifteen golden cases, the trap and backbite pairs, and the new pairing case).

Run: `pnpm nx run engine:smoke`
Expected: fourteen `ok` lines ending `layout ok)`, then `all golden boards reproduce under Node`.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/fingerprints.json packages/engine/fingerprints.test.ts packages/engine/scripts/node-smoke.mjs
git commit -m "Freeze the layout hash of every golden board beside its fingerprint, in Deno and in Node"
```

---

### Task 3: The store names layouts and keeps their recipes

**Files:**
- Modify: `packages/engine/types.ts` (new `Recipe` before `BoardMeta`; `BoardMeta`)
- Modify: `packages/cli/store.ts` (whole module below)
- Modify: `packages/cli/store.test.ts`
- Modify: `packages/cli/lab-server.ts` (the POST branch of `createLabServer`; `checkParams` doc comment)
- Modify: `packages/cli/lab-server.test.ts`
- Modify: `packages/cli/carve.ts` (the three `saveBoard` calls only)
- Modify: `packages/cli/carve.test.ts` (tests that locate stored files)

**Interfaces:**
- Consumes: `layoutHash`, `decodeBoard` from `@arrowz/engine`; `boardId` from `@arrowz/engine/command`.
- Produces:
  - `export interface Recipe { id; params; view; command; source; createdAt; updatedAt; genMs: number | null; restarts: number | null; backtracks: number | null; aborted: boolean }` in `types.ts`, exported through `mod.ts`'s `export type *`.
  - `BoardMeta.sources: Recipe[]`.
  - `export interface SaveResult { meta: BoardMeta; layoutExisted: boolean; recipeExisted: boolean }` and `export async function saveBoard(input: SaveInput): Promise<SaveResult>` in `store.ts`. Task 4 reads `layoutExisted` and `recipeExisted`.

- [ ] **Step 1: Add the types**

In `packages/engine/types.ts`, insert before `/** One stored board: …` and change `BoardMeta`'s doc, `id` and tail:

```ts
/**
 * One way of producing a stored layout: a seed and parameters, and the run that
 * used them. Its command reproduces the layout unless the run was aborted.
 */
export interface Recipe {
  /** boardId(params): unique within its layout; a save with the same parameters replaces it. */
  id: string
  params: Params
  view: View
  command: string
  source: string
  createdAt: string
  updatedAt: string
  genMs: number | null
  restarts: number | null
  backtracks: number | null
  aborted: boolean
}

/**
 * One stored layout: the meta JSON next to the board file in
 * packages/cli/boards/<WxH>/. The recipe fields at the top level (seed, params,
 * view, command, source, genMs, restarts, backtracks, aborted) copy the recipe
 * the latest save wrote; `sources` lists them all.
 */
export interface BoardMeta {
  /** layoutHash() of the stored board: `sha256-<64 hex>`. */
  id: string
```

and, after `stuck: Stuck | null` inside `BoardMeta`:

```ts
  /** Every recipe that produced this layout, in the order they were first saved. */
  sources: Recipe[]
}
```

Also change `/** fingerprint() of the stored board; null for a meta written before board files. */` to
`/** fingerprint() of the stored board file, which the save that created the layout wrote. */`
and `/** Size of <id>.board.json in bytes; null for a meta written before board files. */` to
`/** Size of <id>.board.json in bytes. */` — the types stay `string | null` and `number | null`, which `readMeta` still fills for hand-written metas.

- [ ] **Step 2: Rewrite the store tests (failing)**

Replace `packages/cli/store.test.ts` with:

```ts
import { assert, assertEquals, assertMatch, assertNotEquals, assertRejects, assertThrows } from '@std/assert'
import { join } from '@std/path'
import { decodeBoard, defaultParams, encodeBoard, layoutHash } from '@arrowz/engine'
import { boardId, buildCommand, COMMAND_PREFIX, DEFAULT_VIEW } from '@arrowz/engine/command'
import { deleteBoard, listBoards, saveBoard, type SaveInput } from './store.ts'
import type { BoardFile, BoardMeta, ParamKey } from '@arrowz/engine'

/** A fresh, empty store for one test: the store reads ARROWZ_BOARDS_DIR at call time. */
function freshDir(): string {
  const dir = Deno.makeTempDirSync({ prefix: 'arrowz-boards-' })
  Deno.env.set('ARROWZ_BOARDS_DIR', dir)
  return dir
}

function exists(path: string): boolean {
  try {
    Deno.statSync(path)
    return true
  } catch {
    return false
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** The JSON as written to disk; the store wrote it, so its shape is BoardMeta. */
const readMeta = (file: string): BoardMeta => JSON.parse(Deno.readTextFileSync(file)) as BoardMeta
const LAYOUT_ID = /^sha256-[0-9a-f]{64}$/
/** A name of the right shape for a meta written by hand: one hex digit repeated. */
const handId = (digit: string) => `sha256-${digit.repeat(64)}`

const params = (over: Partial<Record<ParamKey, number>> = {}) => ({
  ...defaultParams(),
  W: 25,
  H: 50,
  seed: 7,
  ...over,
})
/** The file of an empty board of a size. Every empty board of one size is one layout. */
const emptyFile = (W: number, H: number): BoardFile =>
  encodeBoard({ W, H, owner: new Int32Array(W * H).fill(-1), pieces: [] })

/**
 * A board of two-cell pieces lying right from the cells `heads`, numbered in
 * the order given: another list of heads is another layout, and the same heads
 * in another order are the same layout numbered differently.
 */
function boardFile(W: number, H: number, heads: number[]): BoardFile {
  const owner = new Int32Array(W * H).fill(-1)
  const pieces = heads.map((head, id) => {
    const x = head % W, y = Math.floor(head / W)
    const cells = [{ x, y }, { x: x + 1, y }]
    for (const c of cells) owner[c.y * W + c.x] = id
    return { id, dir: 3, cells }
  })
  return encodeBoard({ W, H, owner, pieces })
}

const entry = (
  { params: over, ...rest }: Partial<Omit<SaveInput, 'params'>> & { params?: Partial<Record<ParamKey, number>> } = {},
): SaveInput => {
  const p = params(over)
  return {
    board: boardFile(p.W, p.H, [0]),
    params: p,
    view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0, rounded: true },
    command: `${COMMAND_PREFIX} --width=25 --height=50 --seed=7`,
    source: 'cli',
    metrics: { ok: true, pieces: 126, maxLen: 68, genMs: 12 },
    ...rest,
  }
}

Deno.test('saveBoard names the files by the layout hash and writes the board file, the meta and no SVG', async () => {
  const dir = freshDir()
  const { meta, layoutExisted, recipeExisted } = await saveBoard(entry())
  const file = entry().board
  assertMatch(meta.id, LAYOUT_ID)
  assertEquals(meta.id, await layoutHash(decodeBoard(file)))
  assertEquals([layoutExisted, recipeExisted], [false, false])
  assertEquals(Deno.readTextFileSync(join(dir, '25x50', meta.id + '.board.json')), JSON.stringify(file))
  assert(!exists(join(dir, '25x50', meta.id + '.svg')), 'no preview without an svg')
  const saved = readMeta(join(dir, '25x50', meta.id + '.json'))
  assertEquals(saved.pieces, 126)
  assertEquals(saved.source, 'cli')
  assertEquals(saved.fingerprint, file.fingerprint)
  assertEquals(saved.boardBytes, JSON.stringify(file).length)
  assertEquals(saved.svg, false)
  assert(saved.createdAt)
  assertEquals('simpleCommand' in saved, false, 'one dialect, so one command')
  assertEquals(saved.sources.map((r) => r.id), [boardId(params())])
  assertEquals(saved.sources[0]?.command, saved.command)
})

Deno.test('saveBoard with an svg keeps the preview; a later save without one removes it', async () => {
  const dir = freshDir()
  const withSvg = (await saveBoard(entry({ svg: '<svg/>' }))).meta
  assertEquals(withSvg.svg, true)
  assertEquals(Deno.readTextFileSync(join(dir, '25x50', withSvg.id + '.svg')), '<svg/>')
  const without = (await saveBoard(entry())).meta
  assertEquals(without.svg, false)
  assert(!exists(join(dir, '25x50', without.id + '.svg')), 'a stale preview does not outlive the save')
})

Deno.test('saveBoard refuses a board file of another size than the params', async () => {
  freshDir()
  await assertRejects(() => saveBoard({ ...entry(), board: emptyFile(10, 10) }), Error, 'board file is 10x10')
})

// One dialect, one command: it reproduces the board on its own, and the
// second command older metas carry is never written again.
Deno.test('saveBoard writes the one command it was given and no simpleCommand', async () => {
  const dir = freshDir()
  const { meta } = await saveBoard(entry())
  const saved = readMeta(join(dir, '25x50', meta.id + '.json'))
  assertEquals('simpleCommand' in saved, false)
  assert(saved.command.startsWith(`${COMMAND_PREFIX} --width=`))
})

Deno.test('listBoards: sizes ascending by cells, layouts newest first, the same recipe replaced in place', async () => {
  const dir = freshDir()
  await saveBoard(entry({ params: { W: 100, H: 100, seed: 1 } }))
  const first = (await saveBoard(entry({ params: { seed: 1 } }))).meta
  await sleep(5)
  await saveBoard(entry({ params: { seed: 2 }, board: boardFile(25, 50, [2]) }))
  await sleep(5)
  // The same layout and the same parameters: the recipe is replaced. Recolouring
  // a board in the lab goes this way, and the board must NOT jump to the top of
  // the list: it keeps its first createdAt and records the save in updatedAt.
  const again = await saveBoard(entry({ svg: '<svg>2</svg>', params: { seed: 1 } }))
  assertEquals([again.layoutExisted, again.recipeExisted], [true, true])
  const sizes = listBoards()
  assertEquals(sizes.map((s) => s.size), ['25x50', '100x100'])
  const small = sizes[0]
  assert(small)
  assertEquals(small.boards.length, 2)
  assertEquals(small.boards.map((b) => b.seed), [2, 1], 'the saved-again layout stays where it was')
  assertEquals(again.meta.createdAt, first.createdAt, 'createdAt survives the save')
  assert(again.meta.updatedAt > first.createdAt, 'updatedAt records the save')
  assertEquals(small.boards[1]?.updatedAt, again.meta.updatedAt)
  assertEquals(again.meta.sources.length, 1, 'the same parameters replace their recipe')
  assertEquals(again.meta.sources[0]?.createdAt, first.createdAt)
  assertEquals(Deno.readTextFileSync(join(dir, '25x50', first.id + '.svg')), '<svg>2</svg>')
})

Deno.test('two parameter sets that carve one layout share its files and list both recipes', async () => {
  const dir = freshDir()
  const a = await saveBoard(entry({ params: { seed: 1 } }))
  await sleep(5)
  const b = await saveBoard(entry({
    params: { seed: 1, wShort: 0.2 },
    view: { ...entry().view, colored: true },
  }))
  assertEquals(b.meta.id, a.meta.id)
  assertEquals([b.layoutExisted, b.recipeExisted], [true, false])
  assertEquals([...Deno.readDirSync(join(dir, '25x50'))].length, 2, 'one board file and one meta')
  assertEquals(b.meta.sources.map((r) => r.id), [boardId(params({ seed: 1 })), boardId(params({ seed: 1, wShort: 0.2 }))])
  assertEquals([b.meta.params.wShort, b.meta.view.colored], [0.2, true], 'the top level is the latest recipe')
  assertEquals(b.meta.createdAt, a.meta.createdAt)
  assertEquals(listBoards()[0]?.boards.length, 1)
})

// Two recipes of one layout number their pieces differently, so their files
// differ; rewriting the file would move its fingerprint, and a saved game
// against it would no longer load (spec §3).
Deno.test('a second recipe numbered differently leaves the board file as the first save wrote it', async () => {
  const dir = freshDir()
  const firstFile = boardFile(25, 50, [0, 2])
  const secondFile = boardFile(25, 50, [2, 0])
  assertNotEquals(secondFile.fingerprint, firstFile.fingerprint)
  const first = await saveBoard(entry({ params: { seed: 1 }, board: firstFile }))
  const second = await saveBoard(entry({ params: { seed: 2 }, board: secondFile }))
  assertEquals(second.meta.id, first.meta.id)
  assertEquals(Deno.readTextFileSync(join(dir, '25x50', first.meta.id + '.board.json')), JSON.stringify(firstFile))
  assertEquals([second.meta.fingerprint, second.meta.boardBytes], [first.meta.fingerprint, first.meta.boardBytes])
})

Deno.test('a save that does not carry a figure keeps the stored one', async () => {
  freshDir()
  const stuck = { remaining: 7, sizes: [4, 3], heads: 2 }
  await saveBoard(entry({
    metrics: { ok: false, pieces: 10, maxLen: 5, genMs: 3, restarts: 1, backtracks: 42, stuck },
  }))
  // The old lab's view edit posts four figures, and the lab server drops a null
  // exactly as it drops an absent one.
  const edit = await saveBoard(entry({
    view: { ...entry().view, stroke: 0.3 },
    metrics: { ok: false, pieces: 10, maxLen: 5, genMs: null, restarts: null },
  }))
  assertEquals([edit.meta.genMs, edit.meta.restarts, edit.meta.backtracks], [3, 1, 42])
  assertEquals(edit.meta.stuck, stuck)
  assertEquals(edit.meta.view.stroke, 0.3)
  assertEquals(edit.meta.sources[0]?.backtracks, 42)
})

Deno.test('listBoards skips junk: foreign directories, json without a board file, broken json, JSON scalars', async () => {
  const dir = freshDir()
  Deno.mkdirSync(join(dir, 'notes'))
  Deno.mkdirSync(join(dir, '10x10'))
  Deno.writeTextFileSync(join(dir, '10x10', `${handId('d')}.json`), `{"id":"${handId('d')}"}`) // no board file
  Deno.mkdirSync(join(dir, '25x50'))
  Deno.writeTextFileSync(join(dir, '25x50', `${handId('b')}.json`), '{not json')
  Deno.writeTextFileSync(join(dir, '25x50', `${handId('b')}.board.json`), '<svg/>')
  // Valid JSON that is not an object is not a board either.
  const scalars: Record<string, string> = { '1': '5', '2': '"x"', '3': 'null' }
  for (const [digit, text] of Object.entries(scalars)) {
    Deno.writeTextFileSync(join(dir, '25x50', `${handId(digit)}.json`), text)
    Deno.writeTextFileSync(join(dir, '25x50', `${handId(digit)}.board.json`), '<svg/>')
  }
  await saveBoard(entry())
  const sizes = listBoards()
  assertEquals(sizes.map((s) => s.size), ['25x50'])
  assertEquals(sizes[0]?.boards.length, 1)
})

// No migration (spec, Decisions): a board stored under the settings-hash name
// stays on disk, and the store neither lists nor deletes it.
Deno.test('a board under an old seed name is neither listed nor deleted', async () => {
  const dir = freshDir()
  const { meta } = await saveBoard(entry())
  Deno.writeTextFileSync(join(dir, '25x50', 'seed7-f48ddb0f.json'), '{"id":"seed7-f48ddb0f"}')
  Deno.writeTextFileSync(join(dir, '25x50', 'seed7-f48ddb0f.board.json'), '{}')
  assertEquals(listBoards()[0]?.boards.map((b) => b.id), [meta.id])
  assertThrows(() => deleteBoard('25x50', 'seed7-f48ddb0f'), Error, 'invalid')
  assert(exists(join(dir, '25x50', 'seed7-f48ddb0f.board.json')))
})

// Boards saved before the arrowhead knobs (or rounded) existed carry a view
// without them; the store fills them with the defaults, as the old lab page
// did.
Deno.test('listBoards fills a legacy view without arrowhead fields with the defaults', () => {
  const dir = freshDir()
  Deno.mkdirSync(join(dir, '25x50'))
  const legacy = {
    id: handId('a'),
    W: 25,
    H: 50,
    seed: 7,
    params: params(),
    view: { cell: 12, stroke: 0.5, colored: false, top: 0 },
    command: `${COMMAND_PREFIX} --width=25 --height=50 --seed=7`,
    source: 'cli',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ok: true,
    pieces: 126,
    maxLen: 68,
    genMs: 12,
    svgBytes: 6,
  }
  Deno.writeTextFileSync(join(dir, '25x50', `${handId('a')}.json`), JSON.stringify(legacy))
  Deno.writeTextFileSync(join(dir, '25x50', `${handId('a')}.board.json`), '{}')
  const board = listBoards()[0]?.boards[0]
  assertEquals(board?.id, handId('a'))
  assertEquals(
    board?.view,
    { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 1, colored: false, top: 0, rounded: true },
  )
  assertEquals(board?.sources, [], 'a meta without recipes reads as none')
})

// Every board written before the head height became literal stores 0, which
// meant "automatic" then and would mean "no arrowhead at all" now.
Deno.test('a board saved when the head height was automatic reads as the new default', async () => {
  freshDir()
  await saveBoard({ ...entry(), view: { ...DEFAULT_VIEW, headHeight: 0 } })
  const board = listBoards()[0]?.boards[0]
  // The literal 1, not DEFAULT_VIEW.headHeight: the number is the point.
  assertEquals(board?.view.headHeight, 1)
  assertEquals(board?.sources[0]?.view.headHeight, 1, 'the recipe is read the same way')
  assertEquals(DEFAULT_VIEW.headHeight, 1)
})

// The same for params: a board saved before a knob existed does not name it.
// Without filling it here the page would re-save the board with a command
// carrying `--headtries=undefined`.
Deno.test('listBoards fills legacy params without a knob with the engine default, in recipes too', () => {
  const dir = freshDir()
  Deno.mkdirSync(join(dir, '25x50'))
  const legacyParams: Record<string, unknown> = { ...params() }
  delete legacyParams.headTries
  const legacyView = { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0 }
  const legacy = {
    id: handId('c'),
    W: 25,
    H: 50,
    seed: 7,
    params: legacyParams,
    view: legacyView,
    command: `${COMMAND_PREFIX} --width=25 --height=50 --seed=7`,
    source: 'cli',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ok: true,
    pieces: 126,
    maxLen: 68,
    genMs: 12,
    svgBytes: 6,
    sources: [{
      id: 'seed7-00000000',
      params: legacyParams,
      view: legacyView,
      command: `${COMMAND_PREFIX} --width=25 --height=50 --seed=7`,
      source: 'cli',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      genMs: 12,
      restarts: null,
      backtracks: null,
      aborted: false,
    }],
  }
  Deno.writeTextFileSync(join(dir, '25x50', `${handId('c')}.json`), JSON.stringify(legacy))
  Deno.writeTextFileSync(join(dir, '25x50', `${handId('c')}.board.json`), '{}')
  const board = listBoards()[0]?.boards[0]
  assertEquals(board?.id, handId('c'))
  assertEquals(board?.params.headTries, defaultParams().headTries)
  assertEquals(board?.sources[0]?.params.headTries, defaultParams().headTries)
  assertEquals(board?.sources[0]?.view.rounded, true)
  assert(board)
  assertEquals(buildCommand(board.params).includes('undefined'), false, 'no knob is written as undefined')
})

// --- the closing report ------------------------------------------------------
// A board that did not close is stored too (the lab shows it with its holes),
// so the meta carries what the run reported: restarts and backtracks used,
// whether a time budget cut it short, and the leftover of a jam.

Deno.test('saveBoard records the closing report: restarts, backtracks, aborted and the leftover', async () => {
  const dir = freshDir()
  const stuck = { remaining: 7, sizes: [4, 3], heads: 2 }
  const { meta } = await saveBoard(entry({
    metrics: { ok: false, pieces: 10, maxLen: 5, genMs: 3, restarts: 1, backtracks: 42, aborted: true, stuck },
  }))
  assertEquals([meta.ok, meta.restarts, meta.backtracks, meta.aborted], [false, 1, 42, true])
  assertEquals(meta.stuck, stuck)
  const saved = readMeta(join(dir, '25x50', meta.id + '.json'))
  assertEquals([saved.ok, saved.restarts, saved.backtracks, saved.aborted], [false, 1, 42, true])
  assertEquals(saved.stuck, stuck)
  assertEquals(saved.sources[0]?.aborted, true)
})

Deno.test('saveBoard without a closing report writes null counts, aborted false and no leftover', async () => {
  freshDir()
  const { meta } = await saveBoard(entry())
  assertEquals([meta.restarts, meta.backtracks, meta.aborted, meta.stuck], [null, null, false, null])
})

// A board stored before the closing report existed lacks the fields; the
// reader fills them so the page never sees undefined.
Deno.test('listBoards fills a legacy meta without the closing report', () => {
  const dir = freshDir()
  Deno.mkdirSync(join(dir, '25x50'))
  const legacy = {
    id: handId('e'),
    W: 25,
    H: 50,
    seed: 7,
    params: params(),
    view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0 },
    command: `${COMMAND_PREFIX} --width=25 --height=50 --seed=7`,
    source: 'cli',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ok: true,
    pieces: 126,
    maxLen: 68,
    genMs: 12,
    svgBytes: 6,
  }
  Deno.writeTextFileSync(join(dir, '25x50', `${handId('e')}.json`), JSON.stringify(legacy))
  Deno.writeTextFileSync(join(dir, '25x50', `${handId('e')}.board.json`), '{}')
  const board = listBoards()[0]?.boards[0]
  assertEquals(board?.id, handId('e'))
  assertEquals([board?.restarts, board?.backtracks, board?.aborted, board?.stuck], [null, null, false, null])
  assertEquals([board?.fingerprint, board?.boardBytes, board?.svg], [null, null, false])
})

Deno.test('listBoards without a directory returns an empty list', () => {
  const missing = join(freshDir(), 'missing')
  Deno.env.set('ARROWZ_BOARDS_DIR', missing)
  assert(!exists(missing))
  assertEquals(listBoards(), [])
})

Deno.test('deleteBoard removes the board file, the meta, the preview and an emptied size directory', async () => {
  const dir = freshDir()
  const kept = (await saveBoard(entry({ params: { seed: 1 } }))).meta
  const gone = (await saveBoard(entry({ params: { seed: 2 }, board: boardFile(25, 50, [2]), svg: '<svg/>' }))).meta
  assertNotEquals(gone.id, kept.id)
  assertEquals(deleteBoard('25x50', gone.id), true)
  for (const ext of ['.board.json', '.json', '.svg']) assert(!exists(join(dir, '25x50', gone.id + ext)), ext)
  assertEquals(listBoards()[0]?.boards.map((b) => b.id), [kept.id])
  assertEquals(deleteBoard('25x50', kept.id), true)
  assert(!exists(join(dir, '25x50')), 'empty size directory is removed')
  assertEquals(listBoards(), [])
})

Deno.test('deleteBoard returns false for a missing layout and rejects bad names', async () => {
  const dir = freshDir()
  await saveBoard(entry())
  assertEquals(deleteBoard('25x50', handId('9')), false)
  assertThrows(() => deleteBoard('25x50', 'seed9-00000000'), Error, 'invalid')
  assertThrows(() => deleteBoard('../25x50', handId('9')), Error, 'invalid')
  assertThrows(() => deleteBoard('25x50', '../engine'), Error, 'invalid')
  assert(exists(join(dir, '25x50')))
})
```

(The old case 'saveBoard refuses params whose id is not seed<digits>-<hash>' is gone on purpose: the id no longer comes from params — spec §3.)

- [ ] **Step 3: Run to verify they fail**

Run: `deno test --allow-read --allow-write --allow-env packages/cli/store.test.ts`
Expected: FAIL at type-check — `saveBoard` returns `BoardMeta`, not a promise of `{ meta, … }`; `sources` does not exist on the meta returned today.

- [ ] **Step 4: Rewrite the store**

Replace `packages/cli/store.ts` with:

```ts
// Store of generated boards: packages/cli/boards/<W>x<H>/<id>.board.json + <id>.json,
// plus <id>.svg when a preview was asked for. The id is the board's layout hash
// (`sha256-<64 hex>`): one arrangement of arrows has one set of files, whatever
// seeds and parameters carved it, and its meta lists them as recipes (design:
// docs/superpowers/specs/2026-09-15-layout-hash-design.md). Shared by the CLI
// (carve.ts) and the lab server. The directory is gitignored — a 1000×1000
// board file is about a megabyte, and the commands in the meta reproduce it.
import { dirname, fromFileUrl, join } from '@std/path'
import type { BoardMeta, BoardSize, Recipe, StoreRequest, View } from '@arrowz/engine'
import { decodeBoard, defaultParams, layoutHash } from '@arrowz/engine'
import { boardId, DEFAULT_VIEW } from '@arrowz/engine/command'

/** The wire contract plus the two fields only the CLI sends. */
export interface SaveInput extends StoreRequest {
  /** The SVG preview. Without it no preview is kept: one left by an earlier save of this layout is removed. */
  svg?: string
  metrics?: StoreRequest['metrics'] & { aborted?: boolean }
}

/** What a save wrote, and what it found. */
export interface SaveResult {
  meta: BoardMeta
  /** A meta for this layout was already on disk. */
  layoutExisted: boolean
  /** One of its recipes had these parameters, and this save replaced it. */
  recipeExisted: boolean
}

/** The only file names the store lists or deletes. */
const LAYOUT_ID = /^sha256-[0-9a-f]{64}$/

export function boardsDir(): string {
  return Deno.env.get('ARROWZ_BOARDS_DIR') || join(dirname(fromFileUrl(import.meta.url)), 'boards')
}

function exists(path: string): boolean {
  try {
    Deno.statSync(path)
    return true
  } catch {
    return false
  }
}

/**
 * A stored view with the fields a later knob added filled in.
 *
 * A stored headHeight of 0 meant "automatic", a mode that no longer exists:
 * read it as unset. Every board written before this change carries it, and
 * taken literally they would draw no arrowhead at all.
 *
 * That is no longer the only way a 0 can get here: `--headheight=0` is now
 * accepted literally and on purpose, so a board CAN be saved headless
 * deliberately. The migration cannot tell the two apart and has no expiry
 * date, which costs exactly this: such a board is shown in the library with a
 * head of the default height, while the command stored next to it still says
 * `--headheight=0` and reproduces it headless.
 */
function fillView(view: View): View {
  return {
    ...DEFAULT_VIEW,
    ...view,
    ...(view?.headHeight ? {} : { headHeight: DEFAULT_VIEW.headHeight }),
  }
}

/**
 * The JSON of a stored layout, or null when the file is missing, broken or not
 * an object. A board saved before a knob existed lacks it in params and view:
 * the missing fields take the engine defaults here, at the boundary, so every
 * reader — the page, buildCommand — sees a complete Params and View, in the
 * top level and in every recipe. A meta without the closing report or without
 * recipes gets its empty values the same way.
 */
function readMeta(file: string): BoardMeta | null {
  try {
    const parsed: unknown = JSON.parse(Deno.readTextFileSync(file))
    if (typeof parsed !== 'object' || parsed === null) return null
    const meta = parsed as BoardMeta
    const sources: Recipe[] = Array.isArray(meta.sources) ? meta.sources : []
    return {
      ...meta,
      params: { ...defaultParams(), ...meta.params },
      view: fillView(meta.view),
      restarts: meta.restarts ?? null,
      backtracks: meta.backtracks ?? null,
      aborted: meta.aborted ?? false,
      stuck: meta.stuck ?? null,
      fingerprint: meta.fingerprint ?? null,
      boardBytes: meta.boardBytes ?? null,
      svg: meta.svg ?? false,
      sources: sources.map((r) => ({ ...r, params: { ...defaultParams(), ...r.params }, view: fillView(r.view) })),
    }
  } catch {
    return null
  }
}

/**
 * Saves one board under its layout's name. The layout's recipe for these
 * parameters is replaced, or a recipe is added; the board file is written only
 * when the layout is new, so a name keeps one byte sequence and one fingerprint
 * for as long as it is stored (a saved game checks that fingerprint).
 *
 * A figure absent or null in `metrics` is not carried and keeps the stored
 * value — the lab server's checkMetrics drops a null as it drops an absent
 * field, and the old lab's view edit posts only four figures.
 */
export async function saveBoard(
  { board, svg, params, view, command, metrics = {}, source }: SaveInput,
): Promise<SaveResult> {
  if (board.W !== params.W || board.H !== params.H) {
    throw new Error(`board file is ${board.W}x${board.H}, the params ask for ${params.W}x${params.H}`)
  }
  // The name is worked out here, from the decoded board: no caller's word for
  // it is taken. Nothing a caller sends reaches a path: the size comes from
  // params equal to the decoded board's checked W and H.
  const id = await layoutHash(decodeBoard(board))
  const dir = join(boardsDir(), `${params.W}x${params.H}`)
  Deno.mkdirSync(dir, { recursive: true })
  const now = new Date().toISOString()
  const metaFile = join(dir, `${id}.json`)
  const before = readMeta(metaFile)
  const recipeId = boardId(params)
  const replaced = before?.sources.find((r) => r.id === recipeId) ?? null
  const recipe: Recipe = {
    id: recipeId,
    params,
    view,
    command,
    source,
    createdAt: replaced?.createdAt ?? now,
    updatedAt: now,
    genMs: metrics.genMs ?? replaced?.genMs ?? null,
    restarts: metrics.restarts ?? replaced?.restarts ?? null,
    backtracks: metrics.backtracks ?? replaced?.backtracks ?? null,
    aborted: metrics.aborted ?? false,
  }
  const kept = before?.sources ?? []
  const sources = replaced ? kept.map((r) => (r.id === recipeId ? recipe : r)) : kept.concat(recipe)
  const boardText = JSON.stringify(board)
  // A meta that is missing or unreadable means the file beside it, if any, is
  // not vouched for: it is written again, with this save's numbering.
  const file = before === null
    ? { fingerprint: board.fingerprint, boardBytes: new TextEncoder().encode(boardText).byteLength }
    : { fingerprint: before.fingerprint, boardBytes: before.boardBytes }
  const meta: BoardMeta = {
    id,
    W: params.W,
    H: params.H,
    seed: params.seed,
    params,
    view,
    command,
    source,
    createdAt: before?.createdAt ?? now,
    updatedAt: now,
    ok: metrics.ok ?? before?.ok ?? null,
    pieces: metrics.pieces ?? before?.pieces ?? null,
    maxLen: metrics.maxLen ?? before?.maxLen ?? null,
    genMs: recipe.genMs,
    fingerprint: file.fingerprint,
    boardBytes: file.boardBytes,
    svg: svg !== undefined,
    restarts: recipe.restarts,
    backtracks: recipe.backtracks,
    aborted: recipe.aborted,
    stuck: metrics.stuck ?? before?.stuck ?? null,
    sources,
  }
  if (before === null) Deno.writeTextFileSync(join(dir, `${id}.board.json`), boardText)
  const svgFile = join(dir, `${id}.svg`)
  if (svg !== undefined) Deno.writeTextFileSync(svgFile, svg)
  else if (exists(svgFile)) Deno.removeSync(svgFile)
  Deno.writeTextFileSync(metaFile, JSON.stringify(meta, null, 2))
  return { meta, layoutExisted: before !== null, recipeExisted: replaced !== null }
}

/**
 * Removes one layout (board file, meta and preview) with every recipe in it.
 * Returns false when there was nothing to remove. A size directory left empty
 * is removed too, so the list does not keep an empty size. Names are
 * validated: they come straight from a URL, and a name that is not a layout
 * hash — a board stored under the old seed names included — is refused.
 */
export function deleteBoard(size: string, id: string): boolean {
  if (!/^\d+x\d+$/.test(size) || !LAYOUT_ID.test(id)) throw new Error(`invalid board name ${size}/${id}`)
  const dir = join(boardsDir(), size)
  let removed = false
  for (const ext of ['.board.json', '.json', '.svg']) {
    const file = join(dir, id + ext)
    if (exists(file)) {
      Deno.removeSync(file)
      removed = true
    }
  }
  if (exists(dir) && [...Deno.readDirSync(dir)].length === 0) Deno.removeSync(dir)
  return removed
}

/** Sizes ascending by cell count, layouts newest first within a size. Only layout-hash names are read. */
export function listBoards(): BoardSize[] {
  const root = boardsDir()
  if (!exists(root)) return []
  const sizes: BoardSize[] = []
  for (const entry of Deno.readDirSync(root)) {
    const m = /^(\d+)x(\d+)$/.exec(entry.name)
    if (!m || !entry.isDirectory) continue
    const dir = join(root, entry.name)
    const boards: BoardMeta[] = []
    for (const f of Deno.readDirSync(dir)) {
      if (!f.name.endsWith('.json') || f.name.endsWith('.board.json')) continue
      const id = f.name.slice(0, -'.json'.length)
      if (!LAYOUT_ID.test(id) || !exists(join(dir, `${id}.board.json`))) continue
      const meta = readMeta(join(dir, f.name))
      if (meta) boards.push(meta)
    }
    if (!boards.length) continue
    boards.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    const W = Number(m[1]), H = Number(m[2])
    sizes.push({ size: entry.name, W, H, cells: W * H, boards })
  }
  sizes.sort((a, b) => a.cells - b.cells || a.W - b.W)
  return sizes
}
```

- [ ] **Step 5: Run the store tests**

Run: `deno test --allow-read --allow-write --allow-env packages/cli/store.test.ts`
Expected: PASS (19 tests).

- [ ] **Step 6: The lab server awaits the save and sends the meta**

In `packages/cli/lab-server.ts`, inside `createLabServer`'s POST branch, replace

```ts
        return send(201, JSON.stringify(saveBoard(checked.ok)))
```

with

```ts
        return send(201, JSON.stringify((await saveBoard(checked.ok)).meta))
```

and in `checkParams`' doc comment replace these two lines

```ts
 * envelope, so the store holds only boards the engine would generate. The
 * seed goes into file names; a string or a fraction never gets that far.
```

with

```ts
 * envelope, so the store holds only boards the engine would generate. The
 * seed reaches the command and the meta; a string or a fraction never gets
 * that far.
```

- [ ] **Step 7: Update the lab server tests**

In `packages/cli/lab-server.test.ts`:

1. First test: replace `assertMatch(meta.id, /^seed7-/)` with `assertMatch(meta.id, /^sha256-[0-9a-f]{64}$/)`.
2. 'a preview saved by the CLI is served from the store as SVG': replace `const meta = saveBoard({` with `const { meta } = await saveBoard({`.
3. 'only the page, its bundle and the store are served, with security headers': the same replacement.
4. Rename the DELETE test to `'DELETE /api/boards/<size>/<id> removes the layout; a missing one gives 404, an old name 400'` and, before its closing `}))`, after the `bad` block, add:

```ts
    // A board stored under the old seed names is not a layout name: refused, not "missing".
    const old = await fetch(`${base}/api/boards/10x10/seed3-00000000`, { method: 'DELETE' })
    assertEquals(old.status, 400)
    await old.body?.cancel()
```

- [ ] **Step 8: The CLI awaits its three saves**

In `packages/cli/carve.ts`, the three calls `const meta = saveBoard({` (the batch loop, the not-closed branch, the closed branch at the end) each become:

```ts
    const { meta } = await saveBoard({
```

(indentation as at each site; the module already runs top-level code, so `await` is legal there). Nothing else in `carve.ts` changes in this task.

- [ ] **Step 9: The CLI tests find stored files by their layout hash**

In `packages/cli/carve.test.ts`:

1. Add `layoutHash` to the `@arrowz/engine` import list (alphabetically after `INACTIVE_REASONS`), and after `storedFingerprint` add:

```ts
/** The store's name for the board these parameters carve: its layout hash. */
const layoutIdOf = (params: Params): Promise<string> => layoutHash(generate(params).board)
```

2. In each of these tests make the callback `async` and replace the `boardId(...)` expression that names the stored files with `await layoutIdOf(...)` of the same params:
   - 'carve.ts --svg reproduces the generate() board byte for byte': `const id = await layoutIdOf(params)`
   - 'carve.ts writes the board file and the meta, and no SVG unless asked': `const id = await layoutIdOf(params)`
   - 'carve.ts --svg=path also writes a copy at the path': `const id = await layoutIdOf(simpleParams({ ...defaultChoice(), W: 10, H: 10, seed: 3 }))`
   - 'carve.ts turns the everyday flags into the board of the simple lab view': `const id = await layoutIdOf(params)`
   - 'carve.ts --count=3 writes three closed boards on consecutive seeds and exits 0': inside the loop `const id = await layoutIdOf(params)`

3. 'CARVE_TIMEOUT_S aborts a long generation and stores what was carved so far, holes drawn': an aborted board cannot be regenerated, so its name comes from stdout. After `assertMatch(r.stderr, /aborted after …/)` insert:

```ts
  // What an abort carved depends on when the deadline hit: the name is read, not recomputed.
  const partialId = /400x400\/(sha256-[0-9a-f]{64})\.board\.json/.exec(r.stdout)?.[1]
  assert(partialId, r.stdout)
```

and replace every `${longId}` in that test with `${partialId}`. Leave the global `longId` and the dry-run test that uses it for Task 4.

- [ ] **Step 10: Run the CLI package's tests and the type gate**

Run: `deno task check && deno test --allow-read --allow-write --allow-env --allow-run --allow-net packages/cli/`
Expected: PASS. (`carve.test.ts` spawns `carve.ts`; `lab-server.test.ts` starts servers.)

- [ ] **Step 11: Commit**

```bash
git add packages/engine/types.ts packages/cli/store.ts packages/cli/store.test.ts packages/cli/lab-server.ts packages/cli/lab-server.test.ts packages/cli/carve.ts packages/cli/carve.test.ts
git commit -m "Store each layout once under its hash, with every recipe that carved it"
```

---

### Task 4: The CLI says when a layout was already stored

**Files:**
- Modify: `packages/cli/carve.ts` (header comment; `storedNames` neighbourhood; the batch loop; both `--dry-run` JSON lines; both single-run report lines)
- Test: `packages/cli/carve.test.ts`

**Interfaces:**
- Consumes: `SaveResult` (`layoutExisted`, `recipeExisted`) from Task 3; `layoutHash` from Task 1.
- Produces: stdout/stderr formats:
  - single run: `<W>x<H>/<id>.board.json[  + …]  layout already stored, recipe added|updated  pieces=…` (the note only when the layout existed; the not-closed line puts it before `not closed: …` / `deadlocked: …`);
  - batch stderr: `seed <S>: layout already stored as <W>x<H>/<id>, recipe added|updated`;
  - batch summary: `batch: <written>/<N> boards written, <tried> seeds tried[, not closed: …][, already stored: …]`;
  - `--dry-run` `id`: the layout hash.

- [ ] **Step 1: Write the failing tests**

In `packages/cli/carve.test.ts`:

1. The dry-run test 'carve.ts --dry-run computes the board, writes nothing and prints one JSON line': make it `async` and replace
   `assertEquals(r.json.id, boardId(simpleParams({ ...defaultChoice(), W: 10, H: 10, seed: 1 })))` with

```ts
  assertEquals(r.json.id, await layoutIdOf(simpleParams({ ...defaultChoice(), W: 10, H: 10, seed: 1 })))
```

2. 'carve.ts --dry-run under CARVE_TIMEOUT_S reports the abort in its JSON line and writes nothing': replace `assertEquals(r.json.id, longId)` with

```ts
  // An aborted board is whatever the deadline left, so only the shape of its name is known.
  assertMatch(r.json.id ?? '', /^sha256-[0-9a-f]{64}$/)
```

3. Delete the line `const longId = boardId(simpleParams({ ...defaultChoice(), W: 400, H: 400, seed: 7 }))` and remove `boardId` from the `@arrowz/engine/command` import (nothing else in the file uses it after Task 3).

4. Append after the batch tests (after 'carve.ts --count skips seeds that do not close, …'):

```ts
Deno.test('carve.ts run twice says the layout is stored and its recipe updated', async () => {
  const dir = tmp()
  const args = ['--width=10', '--height=10', '--seed=3']
  const first = runCarve(args, dir)
  assertEquals(first.status, 0, first.stderr)
  assertEquals(first.stdout.includes('already stored'), false, 'a new layout says nothing about it')
  const second = runCarve(args, dir)
  assertEquals(second.status, 0, second.stderr)
  const id = await layoutIdOf(simpleParams({ ...defaultChoice(), W: 10, H: 10, seed: 3 }))
  assertMatch(second.stdout, new RegExp(`^10x10/${id}\\.board\\.json {2}layout already stored, recipe updated {2}pieces=`))
  assertEquals(readMeta(join(dir, '10x10', `${id}.json`)).sources.length, 1)
})

// Goal 4 of the spec, as behaviour: a batch writes N different layouts. The
// second run over the same seeds finds the first three stored, saves their
// recipes again and carves on; with the seed limit at 3 it has nothing new.
Deno.test('carve.ts --count counts new layouts only: a second batch over the same seeds moves past them', async () => {
  const dir = tmp()
  const args = ['--width=10', '--height=10', '--seed=1', '--count=3']
  assertEquals(runCarve(args, dir).status, 0)
  const again = runCarve(args, dir)
  assertEquals(again.status, 0, again.stderr)
  for (const seed of [1, 2, 3]) {
    const id = await layoutIdOf(simpleParams({ ...defaultChoice(), W: 10, H: 10, seed }))
    assertStringIncludes(again.stderr, `seed ${seed}: layout already stored as 10x10/${id}, recipe updated\n`)
  }
  assertMatch(again.stdout, /batch: 3\/3 boards written, 6 seeds tried, already stored: 1 2 3\n$/)
  assertEquals(entries(join(dir, '10x10')), 12, 'six layouts, a board file and a meta each')
  const capped = runCarve([...args, '--max-seeds=3'], dir)
  assertEquals(capped.status, 1, capped.stderr)
  assertMatch(capped.stdout, /batch: 0\/3 boards written, 3 seeds tried, already stored: 1 2 3\n$/)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `deno test --allow-read --allow-write --allow-env --allow-run packages/cli/carve.test.ts`
Expected: FAIL — the dry-run `id` is still `seed1-…`; the second run prints no `layout already stored`; the second batch prints `batch: 3/3 boards written, 3 seeds tried`.

- [ ] **Step 3: Implement the reports**

In `packages/cli/carve.ts`:

1. Imports: add `layoutHash` to the `@arrowz/engine` import list (after `INACTIVE_REASONS`); remove `boardId` from the `@arrowz/engine/command` list; change `import { saveBoard } from './store.ts'` to `import { saveBoard, type SaveResult } from './store.ts'`.

2. Header comment: replace the `--dry-run` and `--count=N` lines with

```ts
//   --dry-run       one board, nothing written: one JSON line on stdout with
//                   the id (the layout hash the store would name it by),
//                   metrics, the pinned knobs and the fingerprint
//   --count=N       N closed boards of different layouts on the seeds from
//                   --seed up, skipping any that does not close or whose layout
//                   is already stored (its recipe is saved all the same);
//                   --max-seeds=M gives up after M seeds (default 2·N); exit 1
//                   when it gives up
```

3. After `storedNames`, add:

```ts
/** What a save found: nothing for a new layout; otherwise that it was stored, and what became of the recipe. */
function recipeNote(saved: SaveResult): string {
  return `recipe ${saved.recipeExisted ? 'updated' : 'added'}`
}

/** The report line's note for a single run, with its two leading spaces, or nothing. */
function alreadyNote(saved: SaveResult): string {
  return saved.layoutExisted ? `  layout already stored, ${recipeNote(saved)}` : ''
}
```

4. The batch: replace the body from `let written = 0, tried = 0` to the `console.log(\`batch: …\`)` line with

```ts
  let written = 0, tried = 0
  const skipped: number[] = []
  const alreadyStored: number[] = []
  for (let seed = params.seed; written < count && tried < seedLimit; seed++) {
    tried++
    const seedParams = forSeed(seed)
    armDeadline()
    const result = generate(seedParams, hooks)
    if (!result.ok) {
      skipped.push(seed)
      console.error(`seed ${seed}: not closed (${result.stuck?.remaining ?? '?'} cells left), skipped`)
      continue
    }
    const m = result.metrics
    if (!m) throw new Error('unreachable: ok without metrics')
    const svg = svgFlag ? toSvg(result.board, svgOptions(view)) : undefined
    const saved = await saveBoard({
      board: encodeBoard(result.board),
      ...(svg !== undefined ? { svg } : {}),
      params: seedParams,
      view,
      command: buildCommand(seedParams, view),
      source: 'cli',
      metrics: { ok: true, pieces: result.board.pieces.length, maxLen: m.maxLen, genMs: result.genMs },
    })
    // A batch is N different layouts: one already in the store keeps its new
    // recipe but does not count, and the next seed is tried.
    if (saved.layoutExisted) {
      alreadyStored.push(seed)
      const { W, H, id } = saved.meta
      console.error(`seed ${seed}: layout already stored as ${W}x${H}/${id}, ${recipeNote(saved)}`)
      continue
    }
    written++
    console.log(`${storedNames(saved.meta, null)}  pieces=${m.N} maxLen=${m.maxLen} ${(result.genMs / 1000).toFixed(2)} s`)
  }
  const notClosed = skipped.length ? `, not closed: ${skipped.join(' ')}` : ''
  const stored = alreadyStored.length ? `, already stored: ${alreadyStored.join(' ')}` : ''
  console.log(`batch: ${written}/${count} boards written, ${tried} seeds tried${notClosed}${stored}`)
```

(keep the following `Deno.exit(written === count ? 0 : 1)` and closing brace.)

5. The not-closed `--dry-run` JSON line: replace `id: boardId(params),` with `id: await layoutHash(c),`.

6. The not-closed save: replace `const { meta } = await saveBoard({` with `const saved = await saveBoard({`, add `const meta = saved.meta` right after the call's closing `})`, and in its `console.log` replace

```ts
        storedNames(meta, svgOut)
      }  ${shortWhy}, pieces=
```

with

```ts
        storedNames(meta, svgOut)
      }${alreadyNote(saved)}  ${shortWhy}, pieces=
```

7. The closed `--dry-run` JSON line: replace `id: boardId(params),` with `id: await layoutHash(c),`.

8. The closed save at the end: replace `const { meta } = await saveBoard({` with `const saved = await saveBoard({`, add `const meta = saved.meta` after it, and in the final report replace `` `${storedNames(meta, svgOut)}  pieces=${m.N} avgLen=`` with `` `${storedNames(meta, svgOut)}${alreadyNote(saved)}  pieces=${m.N} avgLen=``.

- [ ] **Step 4: Run the CLI tests**

Run: `deno fmt packages/cli/carve.ts packages/cli/carve.test.ts && deno task check && deno lint && deno test --allow-read --allow-write --allow-env --allow-run --allow-net packages/cli/`
Expected: PASS, including the two new cases. `deno lint` reports no unused import.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/carve.ts packages/cli/carve.test.ts
git commit -m "Count only new layouts in a batch, and say when a run finds its layout already stored"
```

---

### Task 5: The lab's board-file download carries the layout hash

**Files:**
- Modify: `packages/engine/lab-i18n.ts` (`EN.ui` and `PL.ui`, after `exportError`)
- Modify: `apps/lab/src/run/ExportButtons.tsx`
- Test: `apps/lab/src/run/ExportButtons.browser.test.tsx`
- Modify: `apps/lab/src/routes/LabRoute.browser.test.tsx` (the case that checks both exports during a run)
- Modify: `apps/lab/src/api/boards.node.test.ts` (id shape)

**Interfaces:**
- Consumes: `layoutHash` from `@arrowz/engine` (dist); `ShownResult.board` (`BoardData`) and `.file` from `state/result.slice.ts` (unchanged).
- Produces: dictionary key `layoutHashError`; nothing later tasks call.

- [ ] **Step 1: Add the dictionary key**

In `packages/engine/lab-i18n.ts`, in `EN.ui` after `exportError: 'Export failed:',`:

```ts
    // The board-file download is named by the layout hash, which Web Crypto
    // computes only in a secure context: said beside the exports, not as an
    // export failure.
    layoutHashError: 'Cannot name the board file:',
```

and in `PL.ui` after `exportError: 'Eksport nie powiódł się:',`:

```ts
    layoutHashError: 'Nie da się nazwać pliku planszy:',
```

Run: `deno test --allow-read --allow-run packages/engine/ && pnpm nx build engine`
Expected: PASS; the build succeeds (the `Translation` type requires the key in `PL`).

- [ ] **Step 2: Write the failing browser tests**

In `apps/lab/src/run/ExportButtons.browser.test.tsx`:

1. Replace `import { boardId } from '@arrowz/engine/command'` with `import { layoutHash } from '@arrowz/engine'`, and add `vi.restoreAllMocks()` to `afterEach` after `vi.unstubAllGlobals()`.

2. Replace the case 'the board file is the file on screen, under its board id' with:

```tsx
// Spec §5: the name the store gives the same arrows (store.ts `saveBoard`).
test('the board file is the file on screen, under its layout hash', async () => {
  const screen = await mountButtons()
  await act(async () => finish(ONE))
  const button = screen.getByRole('button', { name: 'Download board file' })
  await expect.element(button).toBeEnabled()
  await button.click()
  expect(downloads.names).toEqual([`${await layoutHash(ONE.board)}.board.json`])
  const blob = downloads.blobs[0]
  expect(blob?.type).toBe('application/json')
  expect(await blob?.text()).toBe(JSON.stringify(ONE.file))
})

// The hash is asynchronous and a download has to start in its click, so the
// button waits for the hash; one that lands after its board was replaced is
// dropped. Every digest is held until the case lets it through.
test('the board file waits for its hash, and a hash for a replaced board is not used', async () => {
  const held: (() => void)[] = []
  const real = crypto.subtle.digest.bind(crypto.subtle)
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(
    (algorithm, data) =>
      new Promise<ArrayBuffer>((resolve, reject) => {
        held.push(() => void real(algorithm, data).then(resolve, reject))
      }),
  )
  const screen = await mountButtons()
  const button = screen.getByRole('button', { name: 'Download board file' })
  await act(async () => finish(ONE))
  await expect.poll(() => held.length).toBe(1)
  await expect.element(button).toBeDisabled()
  const TWO = finishedRun(2)
  await act(async () => finish(TWO))
  await expect.poll(() => held.length).toBe(2)
  await act(async () => held[0]?.())
  await expect.element(button).toBeDisabled()
  await act(async () => held[1]?.())
  await expect.element(button).toBeEnabled()
  await button.click()
  expect(downloads.names).toEqual([`${await layoutHash(TWO.board)}.board.json`])
})

// Outside a secure context there is no crypto.subtle; the reason is shown under
// its own words, and the SVG export is not touched by it.
test('a board file that cannot be named says why, and the SVG export stays', async () => {
  vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('no secure context'))
  const screen = await mountButtons()
  await act(async () => finish(ONE))
  await expect.element(screen.getByRole('alert')).toHaveTextContent('Cannot name the board file: no secure context')
  await expect.element(screen.getByRole('button', { name: 'Download board file' })).toBeDisabled()
  await expect.element(screen.getByRole('button', { name: 'Download SVG' })).toBeEnabled()
})
```

3. In 'the export buttons read at AA', after `await act(async () => finish(ONE))` add:

```tsx
  // A disabled button is drawn at half opacity; measure the one a user clicks.
  await expect.element(screen.getByRole('button', { name: 'Download board file' })).toBeEnabled()
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm nx build engine && pnpm --dir apps/lab exec vitest run src/run/ExportButtons.browser.test.tsx`
Expected: FAIL — the download is named `seed1-….board.json`; the button is enabled while the digest is held; no alert on a rejected digest.

- [ ] **Step 4: Implement it in the component**

Replace `apps/lab/src/run/ExportButtons.tsx` with:

```tsx
import type { BoardFile, WorkerIn, WorkerOut } from '@arrowz/engine'
import { layoutHash } from '@arrowz/engine'
import { svgOptions } from '@arrowz/engine/command'
import { type ReactElement, useEffect, useRef, useState } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'
import { downloadBlob } from './download'

/** The layout hash of one board file, or why it could not be worked out. */
interface Named {
  readonly file: BoardFile
  readonly hash: string | null
  readonly error: string | null
}

/**
 * The mock's two ghost buttons, with handlers (spec §5.2): the board on screen
 * as an SVG and as its board file. Both read the result slice, so a run in
 * flight exports the board beside it, not the one being carved.
 *
 * The SVG is drawn in a worker of its own, as the old lab draws it (the
 * `download` handler in lab-page.ts): tens of megabytes of text at Insane, off
 * the page's thread, and not in the generation worker, which a new run
 * terminates. One at a time (Ruling 7). The board file costs no worker: it is
 * the file itself, named by its layout hash, the name the store gives the same
 * arrows (layout hash spec §5). The hash is asynchronous and a download has to
 * start in its click, so it is worked out when the board arrives and the
 * button waits for it; it lives here because this component is its only reader.
 *
 * An export error is about the board it failed to export, so it is the result
 * slice's, beside that board's store answer, and nothing here holds the board
 * it was about: the next SVG export clears it (Ruling 7), another board taking
 * its place clears it, and a failure that arrives after that is dropped (§5.3).
 * A hash that cannot be worked out is not an export error and is not written
 * there: it is shown under its own words and stays until the board changes.
 */
export function ExportButtons(): ReactElement {
  const dict = useDictionary()
  const result = useStore((state) => state.result.shown)
  const error = useStore((state) => state.result.exportError)
  const drawing = useRef<Worker | null>(null)
  const [busy, setBusy] = useState(false)
  const [named, setNamed] = useState<Named | null>(null)

  // An export outlives nothing: leaving the page takes its worker down.
  useEffect(() => () => drawing.current?.terminate(), [])

  // One hash per shown board. The cleanup drops an answer for a board that is
  // no longer shown — and the first of StrictMode's two mount runs.
  useEffect(() => {
    if (result === null) return
    let ignore = false
    const { file, board } = result
    layoutHash(board).then(
      (hash) => {
        if (!ignore) setNamed({ file, hash, error: null })
      },
      (reason: unknown) => {
        if (!ignore) setNamed({ file, hash: null, error: reason instanceof Error ? reason.message : String(reason) })
      },
    )
    return () => {
      ignore = true
    }
  }, [result])
  const current = result !== null && named !== null && named.file === result.file ? named : null
  const hash = current?.hash ?? null

  const exportSvg = () => {
    if (result === null || drawing.current !== null) return
    const about = result.file
    const { W, H, seed } = result.params
    const name = `arrowz-${W}x${H}-seed${seed}.svg`
    // The view of the moment, cell included: the export field is what `cell` is for.
    const view = useStore.getState().view
    const worker = new Worker(new URL('../worker/generate.worker.ts', import.meta.url), { type: 'module' })
    const end = () => {
      worker.terminate()
      drawing.current = null
      setBusy(false)
    }
    worker.onmessage = (event: MessageEvent<WorkerOut>) => {
      const message = event.data
      if (message.type === 'svg') downloadBlob(new Blob([message.svg], { type: 'image/svg+xml' }), name)
      else if (message.type === 'error') useStore.getState().result.exported(about, message.message)
      end()
    }
    worker.onerror = (event) => {
      useStore.getState().result.exported(about, event.message)
      end()
    }
    drawing.current = worker
    setBusy(true)
    useStore.getState().result.exported(about, null)
    worker.postMessage({
      type: 'svg',
      board: result.file,
      options: { ...svgOptions(viewOf(view)), voids: view.voids },
    } satisfies WorkerIn)
  }

  const exportFile = () => {
    if (result === null || hash === null) return
    downloadBlob(new Blob([JSON.stringify(result.file)], { type: 'application/json' }), `${hash}.board.json`)
  }

  return (
    <div className="fw-ghost fw-exports" role="group" aria-label={dict.t('exportsGroup')}>
      <button type="button" onClick={exportSvg} disabled={result === null || busy}>
        {dict.t('downloadSvg')}
      </button>
      <button type="button" onClick={exportFile} disabled={hash === null}>
        {dict.t('downloadBoardFile')}
      </button>
      {error === null ? null : (
        <p className="fw-export-error" role="alert">
          {`${dict.t('exportError')} ${error}`}
        </p>
      )}
      {current === null || current.error === null ? null : (
        <p className="fw-export-error" role="alert">
          {`${dict.t('layoutHashError')} ${current.error}`}
        </p>
      )}
    </div>
  )
}
```

(The original doc comment cited `lab-page.ts:955-989`; it now names the `download` handler instead, per the Global Constraints.)

- [ ] **Step 5: Run the component tests**

Run: `pnpm --dir apps/lab exec vitest run src/run/ExportButtons.browser.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 6: The route test and the store client test**

In `apps/lab/src/routes/LabRoute.browser.test.tsx`, in the case with the comment "Both exports stay live for the board on screen while the next one carves", insert immediately before `useStore.getState().params.setMany({ W: 600, H: 600, seed: 9 })`:

```tsx
  // The board-file button waits for the layout hash of the board on screen;
  // the synchronous read below is about the run, not about that wait.
  await expect.element(screen.getByRole('button', { name: 'Download board file' })).toBeEnabled()
```

In `apps/lab/src/api/boards.node.test.ts`, replace `expect(meta.id).toMatch(/^seed3-[0-9a-f]{8}$/)` with:

```ts
  expect(meta.id).toMatch(/^sha256-[0-9a-f]{64}$/)
```

- [ ] **Step 7: Run the lab's gates**

Run: `pnpm nx run-many -t check lint fmt test -p lab`
Expected: PASS. (`nx` rebuilds the engine first through `dependsOn: ["^build"]`; `boards.node.test.ts` starts the Deno store server, so this also runs Task 3's store end to end.)

- [ ] **Step 8: Commit**

```bash
git add packages/engine/lab-i18n.ts apps/lab/src/run/ExportButtons.tsx apps/lab/src/run/ExportButtons.browser.test.tsx apps/lab/src/routes/LabRoute.browser.test.tsx apps/lab/src/api/boards.node.test.ts
git commit -m "Name the lab's board-file download by its layout hash, worked out before the click"
```

---

### Task 6: The READMEs name stored boards by their layout

**Files:**
- Modify: `README.md` (sections "Making a board", "Getting a picture as well", "Making many boards at once", "Where boards are saved")
- Modify: `README.pl.md` (sections "Jedna plansza", "Obrazek w dodatku", "Wiele plansz naraz", "Gdzie lądują plansze")
- Test: `packages/cli/readme.test.ts`
- Modify: `packages/cli/lab.html` (`.boardrow .id`)

**Interfaces:**
- Consumes: `layoutHash` (Task 1); `simpleParams`, `defaultChoice` from `@arrowz/engine/simple`.
- Produces: nothing later tasks call.

- [ ] **Step 1: Write the failing test**

In `packages/cli/readme.test.ts`, change the imports:

```ts
import { formatViolation, generate, layoutHash, PARAM_SPEC, validateParams } from '@arrowz/engine'
import { COMMAND_PREFIX, flagViolation, KNOB_ROWS, parseArgs, RULE_ROWS } from '@arrowz/engine/command'
import { BUNDLES, defaultChoice, simpleParams } from '@arrowz/engine/simple'
```

After `const READMES = …` add:

```ts
/**
 * The boards whose stored file names both READMEs print: `deno task carve
 * --width=40 --height=40 --seed=7` (and its `--svg` twin), and the 25×25 of the
 * store tree, `deno task carve --width=25 --height=25` at the default seed 7.
 * The first names were copied by hand and went stale when the settings hash
 * changed; these are checked.
 */
const DOCUMENTED_BOARDS = [{ W: 40, H: 40, seed: 7 }, { W: 25, H: 25, seed: 7 }] as const
```

Inside the `for (const file of READMES)` loop, after the last `Deno.test` in it, add:

```ts
  Deno.test(`${file}: the stored file names are the layout hashes of the boards shown`, async () => {
    const expected = new Set<string>()
    for (const board of DOCUMENTED_BOARDS) {
      expected.add(await layoutHash(generate(simpleParams({ ...defaultChoice(), ...board })).board))
    }
    const documented = new Set(text.match(/sha256-[0-9a-f]{64}/g) ?? [])
    assertEquals(Array.from(documented).sort(), Array.from(expected).sort())
    assertEquals(/seed\d+-[0-9a-f]{8}/.test(text), false, 'no store name under the old seed scheme is left')
  })
```

Run: `deno test --allow-read packages/cli/readme.test.ts`
Expected: FAIL — `documented` is empty and `seed7-f48ddb0f` is still in both files.

- [ ] **Step 2: Get the two real names**

```bash
STORE="$(mktemp -d)"
ARROWZ_BOARDS_DIR="$STORE" deno task carve --width=40 --height=40 --seed=7
ARROWZ_BOARDS_DIR="$STORE" deno task carve --width=25 --height=25
```

Expected: each prints one line starting `40x40/sha256-….board.json` and `25x25/sha256-….board.json`. Cross-check with the spec §6 values (40×40: `sha256-e5f707067ec077e5558a8e91473371bf725b8e94467c61b4ce1436086eb2cdb4`; 25×25: `sha256-0dc74eeff4ad01590a81f3aa79727f673dad073976f7a37df4bd8a4af4d7b978`). If they differ, stop and report — do not paste the spec's values.

Below, `<H40>` stands for the printed 40×40 name without `.board.json` and `<H25>` for the 25×25 one; write the full 71-character names into the files.

- [ ] **Step 3: Edit `README.md`**

"Making a board" — replace from `Writes two files into` to the end of the paragraph `…never overwrite each other.` with:

```markdown
Writes two files into `packages/cli/boards/40x40/`:

* `<H40>.board.json` — the board: every arrow, cell by cell, packed
  small. This is the file a game loads.
* `<H40>.json` — a small text file recording how it was made.

The name is worked out from the arrows on the board, not from the settings.
Another seed or other settings that happen to carve the very same arrows land in
the same files, and the small file lists every command that made them — so
"has this board been made before?" is "is its file there?".
```

"Getting a picture as well" — replace `` `--svg` adds `seed7-f48ddb0f.svg` next to the board. `` with `` `--svg` adds `<H40>.svg` next to the board. ``

"Making many boards at once" — replace the paragraph `Makes 50 boards on the seeds 1, 2, 3 …` with:

```markdown
Makes 50 different boards on the seeds 1, 2, 3 and so on. A seed whose board
does not close is skipped (and not saved), and so is a seed that carves a board
already in the store — its command is added to that board's file — and the next
seed is tried, until there are 50. After twice as many seeds as boards it gives
up; `--max-seeds=200` moves that limit. The last line says how many boards were
written and which seeds were skipped, and why. The same command always makes the
same boards.
```

"Where boards are saved" — replace the three `seed7-8796a4f9.*` lines of the tree with

```
    <H25>.board.json   the board
    <H25>.json         what it was made from
    <H25>.svg          the picture, only with --svg
```

and the paragraph `The file name is the seed followed by a short code …replaces the old files.)` with:

```markdown
The file name is worked out from the arrows on the board. The same arrows from
another seed or other settings share one set of files, and the `.json` file
lists every command that made them. (Colours and line thickness are not part of
the name, so changing only those writes to the same file name and replaces the
picture.)
```

- [ ] **Step 4: Edit `README.pl.md`**

"Jedna plansza" — replace from `Zapisuje dwa pliki w` to `…nie nadpiszą.` with:

```markdown
Zapisuje dwa pliki w `packages/cli/boards/40x40/`:

* `<H40>.board.json` — plansza: każda strzałka, komórka po komórce,
  ciasno spakowana. Ten plik wczytuje gra.
* `<H40>.json` — mały plik tekstowy z zapisem tego, jak powstała.

Nazwa jest wyliczana ze strzałek na planszy, a nie z ustawień. Inne ziarno albo
inne ustawienia, które przypadkiem wytną dokładnie te same strzałki, trafiają do
tych samych plików, a mały plik wymienia każde polecenie, które je zrobiło — więc
„czy taka plansza już była?” to „czy jej plik istnieje?”.
```

"Obrazek w dodatku" — replace `` `--svg` dokłada `seed7-f48ddb0f.svg` obok planszy. `` with `` `--svg` dokłada `<H40>.svg` obok planszy. ``

"Wiele plansz naraz" — replace the paragraph `Robi 50 plansz na ziarnach 1, 2, 3 i dalej. …` with:

```markdown
Robi 50 różnych plansz na ziarnach 1, 2, 3 i dalej. Ziarno, którego plansza się
nie domyka, jest pomijane (i nie zapisywane), tak samo ziarno, które wytnie
planszę już leżącą w magazynie — jego polecenie dopisuje się do pliku tej
planszy — a próbowane jest następne, aż będzie 50. Po dwa razy większej liczbie
ziaren niż plansz poddaje się; `--max-seeds=200` przesuwa tę granicę. Ostatnia
linia mówi, ile plansz zapisano i które ziarna pominięto, i dlaczego. To samo
polecenie zawsze robi te same plansze.
```

"Gdzie lądują plansze" — replace the three `seed7-8796a4f9.*` lines with

```
    <H25>.board.json   plansza
    <H25>.json         z czego powstała
    <H25>.svg          obrazek, tylko z --svg
```

and the paragraph `Nazwa pliku to ziarno, a po nim krótki kod …zastępuje poprzednie pliki.)` with:

```markdown
Nazwa pliku jest wyliczana ze strzałek na planszy. Te same strzałki z innego
ziarna albo innych ustawień dzielą jeden komplet plików, a plik `.json` wymienia
każde polecenie, które je zrobiło. (Kolory i grubość linii nie wchodzą do nazwy,
więc zmiana tylko ich zapisuje pod tą samą nazwą i zastępuje obrazek.)
```

- [ ] **Step 5: Clip the id in the old lab's library**

In `packages/cli/lab.html`, replace

```css
  .boardrow .id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
```

with

```css
  /* A layout id is 71 characters; overflow: hidden is what lets the 1fr track shrink below it. */
  .boardrow .id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
```

- [ ] **Step 6: Run the tests**

Run: `deno test --allow-read --allow-write --allow-env --allow-run --allow-net packages/cli/readme.test.ts packages/cli/lab-bundle.test.ts`
Expected: PASS (the new case in both languages; `lab-bundle.test.ts` still finds the page's lookups in `lab.html`).

- [ ] **Step 7: Commit**

```bash
git add README.md README.pl.md packages/cli/readme.test.ts packages/cli/lab.html
git commit -m "Document stored boards by their layout hash, and check the names the READMEs print"
```

---

### Task 7: Gates and a check against a real store and a real browser

**Files:** none changed unless a gate fails (then fix in the task the failure belongs to, and commit there).

- [ ] **Step 1: Both gates**

Run: `deno task verify`
Expected: check, lint, fmt, test and bundle all pass.

Run: `pnpm nx run-many -t verify`
Expected: every project passes (engine includes `smoke`; lab includes `test` and `build`).

- [ ] **Step 2: The CLI against a scratch store**

```bash
STORE="$(mktemp -d)"
ARROWZ_BOARDS_DIR="$STORE" deno task carve --width=10 --height=10 --seed=1 --count=3
ARROWZ_BOARDS_DIR="$STORE" deno task carve --width=10 --height=10 --seed=1 --count=3
ls "$STORE/10x10"
```

Expected: the second batch prints three `seed N: layout already stored as 10x10/sha256-…, recipe updated` lines on stderr and `batch: 3/3 boards written, 6 seeds tried, already stored: 1 2 3`; the directory holds twelve `sha256-*` files and nothing named `seed…`. Open one `.json` and confirm `sources` has one recipe whose `command` equals the top-level `command`.

- [ ] **Step 3: The React lab with a real mouse**

In one terminal `sh packages/cli/lab.sh` (store server on 8777), in another `pnpm nx serve lab` (Vite on 8779). In Chrome at `http://localhost:8779/`:

1. Wait for the first board; click "Download board file". The downloaded file is named `sha256-<64 hex>.board.json`.
2. Press Generate with the same seed; the store status still says saved. In the store directory for that size there is one layout for that board, and its `.json` lists one recipe.
3. In the advanced view set 6×6, Generate, then set `wShort` to 0.2 and Generate again. On 6×6 that change left the layout the same for 200 of 200 seeds in the spec review's probe, so expect the same `sha256-` file with two recipes in its `.json`; if a new file appears instead, report the seed and both hashes — it is an observation about the probe, not a defect in the store.
4. Open the old lab at `http://localhost:8777/lab.html`, tab "Saved boards": the row shows a clipped `sha256-…` id, the board opens, and dragging the stroke slider saves without adding a recipe (the `.json` still lists the same number).

Report each observation; a step that does not behave as written is a finding, not something to explain away.

- [ ] **Step 4: Record the outcome**

No commit unless a fix was needed. The PR (base `lab/report-export`) is opened only on the user's word.
