# The layout hash: one name for one arrangement of arrows

Date: 2026-09-15. Concerns the engine (`packages/engine`), the board store and
the CLI (`packages/cli`), and the lab application (`apps/lab`). Lands on the lab
stack as its own PR, based on `lab/report-export` (#68), before PR 5 builds the
saved-boards library on the store's ids.

## Goals

1. A board's arrangement of arrows has one name, whatever seed and parameters
   produced it: `sha256-<64 lowercase hex>`, the **layout hash**.
2. The store names its files by that hash, so "has this layout been generated
   before" is "does this file exist", with no database.
3. A layout reached by several recipes (seed + parameters) is stored once and
   remembers every recipe that produced it.
4. `carve --count=N` writes N **different** layouts.
5. The lab's board-file download carries the same name as the store's file.

## Starting point and problem

Measured on 2026-09-15 with a probe outside the repository (1500 seeds × 3
parameter variants per size): 4×4 gave 1116 distinct layouts, 5×5 gave 1427,
6×6 gave 1499. Different parameters give the same layout routinely (`wShort`
0.2 against the default, `restarts` 0 against 3 on small boards); different
seeds often on 4×4, now and then on 6×6. Nothing detects it:

- `boardId(params)` (`command.ts`) hashes the **parameters**, not the result.
  The store names files by it, so two recipes of one layout are two entries.
- `fingerprint(board)` (`engine.ts`) is a 32-bit FNV-1a over the owner array
  (piece ids per cell) and the pieces in carving order. The same layout with
  its pieces renumbered hashes differently (25×50 seed 7: `adb427b` against
  `8ba42231`; on 4×4, 33 layouts had several fingerprints), and 32 bits reach a
  50% collision chance at about 77 thousand boards.
- Hashing the bytes of `.board.json` does not help: `encodeBoard` writes pieces
  in carving order as id deltas, and the header carries `fingerprint`.

## Decisions

- **The hash is computed from a canonical form, never from file bytes.**
- **`fingerprint` does not change.** `fingerprints.test.ts`, `decodeBoard`
  (the file header) and `loadSession` (saved games) depend on it.
- **Exact identity.** A rotation or a mirror image is a different layout.
- **Full SHA-256, 64 hex digits**, through `crypto.subtle.digest`. The engine
  stays runtime-neutral: `crypto` is a global of Deno, Node 20+, browsers and
  workers, and `neutral.test.ts` does not forbid it. The price is that
  `layoutHash` is asynchronous, and so is `saveBoard`.
- **No migration.** Boards stored under `seed<N>-<hash>` names stay on disk,
  unlisted and untouched; the store lists `sha256-*` names only. Each old meta
  carries the command that reproduces its board.
- **Delete removes the whole layout**: board file, meta and preview, as today.
  Removing one recipe waits until a UI shows recipes (PR 5 or later).
- **A recipe's identity is `boardId(params)`.** Saving with parameters already
  among a layout's recipes replaces that recipe; other parameters add one.
  `boardId` keeps its meaning — a hash of the parameters — and changes role,
  from file name to recipe key.

## 1. `layoutHash` in the engine

`layoutHash(board: BoardData): Promise<string>`, in `board-file.ts` (it shares
`ByteWriter` and `stepCode` with the encoder), exported from `mod.ts`.

The canonical bytes, in order:

1. the ASCII tag `arrowz-layout/1`;
2. `W`, `H` and the number of pieces, as unsigned LEB128 varints;
3. per piece, **in ascending order of its head cell index** (`y * W + x` of
   `cells[0]`): varint head index, varint `length * 4 + dir`, then the steps
   from `cells[i]` to `cells[i + 1]` as 2-bit indices into `DIRS`, low bits
   first, **padded to a whole byte per piece**;
4. varint count of voids (owner `-2`), then their cell indices ascending, each
   as a varint.

The result is `'sha256-' + hex(SHA-256(bytes))`.

What the form leaves out, and why:

- **Piece ids** and **carving order** — the two things that make `fingerprint`
  non-canonical. Sorting by head cell is a total order without ties: a cell
  belongs to at most one piece, so no two heads share an index.
- **Unfilled cells** (owner `-1`) — they are every cell no piece and no void
  holds, so they follow from the rest.

What it keeps: the order of cells within a piece, because it draws the shape
(the head is `cells[0]`, the tail is the last cell), and `dir`, which a
one-cell piece has no other way to state.

Byte padding per piece costs a few bits against the file's single step stream
and makes each piece's record self-delimiting given its length; the file
optimises for size, the hash only for being unambiguous. The piece count in
step 2 does the same for the boundary between pieces and voids.

A piece whose cells are not a path throws `BoardFileError`, as `encodeBoard`
does. Every board that reaches the hash in production has passed
`decodeBoard` or come out of `generate`.

## 2. The stored meta: one layout, its recipes

Files per layout: `<W>x<H>/sha256-<hex>.board.json`, `sha256-<hex>.json` and,
when a preview was asked for, `sha256-<hex>.svg`.

`BoardMeta` (`types.ts`) gains one field and changes the meaning of `id`:

```ts
/** One way of producing a stored layout: a seed and parameters, and the run that used them. */
export interface Recipe {
  /** boardId(params): a recipe is replaced by a save with the same parameters. */
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

export interface BoardMeta {
  /** layoutHash() of the stored board: `sha256-<64 hex>`. */
  id: string
  // …every field it has today…
  /** Every recipe that produced this layout, oldest first. */
  sources: Recipe[]
}
```

The top-level fields keep their shape and read as follows:

- `seed`, `params`, `view`, `command`, `source`, `genMs`, `restarts`,
  `backtracks`, `aborted` describe the **most recently written recipe**. The
  old lab's library (`openBoard`, `libLoad`, `saveLibView`), `genSeconds` and
  the `apps/lab` store client read them and keep working unchanged.
- `ok`, `pieces`, `maxLen`, `stuck`, `fingerprint`, `boardBytes` and `svg` are
  properties of the layout, written by the latest save.
- `createdAt` is the first save of the layout (it keeps the row in its place in
  the list, as today); `updatedAt` is the latest.

The meta on disk and the meta on the wire are the same JSON: one type, and the
duplication of one recipe at the top level is small.

**Why the recipe key matters: the library edits views by re-posting.** The old
lab's `saveLibView` sends the same board file back with the board's own params
and a new view. Were every save an append, each move of the stroke slider would
add a recipe. With `boardId(params)` as the key it replaces the recipe it came
from.

## 3. The store (`packages/cli/store.ts`)

`saveBoard(input: SaveInput): Promise<SaveResult>` where
`SaveResult = { meta: BoardMeta; layoutExisted: boolean; recipeExisted: boolean }`:

1. refuse a board file whose size differs from the params (as today);
2. `decodeBoard(input.board)`, then `layoutHash` of the result — the store
   trusts no caller's hash, and the lab server's POST reaches here too;
3. check the id against `^sha256-[0-9a-f]{64}$` (the last line of defence, as
   the `seed…` regex is today);
4. read the existing meta, if any: `layoutExisted` is whether it was there;
5. build the recipe from the input; replace the entry of `sources` with the
   same `id`, keeping that entry's `createdAt`, or append it —
   `recipeExisted` is whether one was replaced;
6. write the board file, the preview (written when given, removed when not —
   today's rule: the preview follows the latest write, as the top-level view
   does) and the meta.

`deleteBoard(size, id)` keeps its behaviour. Its name check tightens to the
`sha256-` form, so it no longer deletes a `seed…` board — none is listed.

`listBoards()` pairs `sha256-<hex>.json` with `sha256-<hex>.board.json` and
skips every other name. Order stays: sizes ascending by cells, layouts newest
first by `createdAt`.

`readMeta` fills a missing `sources` with `[]`, so a hand-edited or truncated
meta cannot crash a reader.

**A known race, left open.** The CLI and the lab server can save the same
layout at the same moment; the read-modify-write of step 4–6 then keeps one of
the two recipes. The store is a local tool, and the lost recipe is reproducible
by its command. Named here so that nobody mistakes it for a guarantee.

## 4. The CLI (`packages/cli/carve.ts`) and the lab server

**A single run** awaits `saveBoard`. When the layout existed, the report line
says so after the stored names: `layout already stored, recipe added` (or
`recipe updated` when the parameters were already among its recipes).

**A batch** (`--count=N`) counts only new layouts towards N. A seed whose
layout is already stored — from an earlier batch or from an earlier seed of
this one — has its recipe saved all the same, prints
`seed <S>: layout already stored as <W>x<H>/sha256-…, recipe added`, and the
batch moves on within the existing seed limit (`--max-seeds`, default 2·N). The
summary names those seeds the way it names seeds that did not close:
`batch: 3/3 boards written, 5 seeds tried, already stored: 2 4`. A batch that
reaches the seed limit short of N exits 1, as today.

**`--dry-run`** reports `id` as the layout hash of the board it carved
(awaited, like the store); `fingerprint` stays beside it.

**The lab server** awaits `saveBoard` and answers `201` with `meta`, as today.
Its POST validation stays where it is and is still not a duplicate of the
page's: a seed no longer reaches a file name, but the parameters still reach
the command and the meta.

## 5. The lab application (`apps/lab`)

**The board-file download is named `sha256-<hex>.board.json`.** A download
has to start in the click that asks for it, and the hash is asynchronous, so it
is computed ahead of the click:

- `ShownResult` gains nothing; `ResultState` gains `layoutHash: string | null`
  and an action `hashed(file: BoardFile, hash: string)` that writes it only
  while `shown.file` is that file — the identity guard `stored` and `exported`
  already use. `showResult` and `reset` clear it to `null`.
- A hook beside `useStoreSave` in `App.tsx` computes `layoutHash(shown.board)`
  once per shown file and calls `hashed`.
- `ExportButtons`' board-file button is disabled while `layoutHash` is `null`;
  the SVG download keeps its name (`arrowz-<W>x<H>-seed<S>.svg`).

The store client (`api/boards.ts`) needs no change; its node test expects the
new id shape.

## 6. Testing

Engine (`board-file.test.ts`, `fingerprints.test.ts`, `node-smoke.mjs`):

- the same layout with pieces shuffled and ids renumbered gives the same hash,
  while its `fingerprint` differs — the pair proves the hash sees what the
  fingerprint cannot;
- a board that differs in one step, one `dir` or one void gives another hash;
- a board file round-trip keeps the hash;
- **frozen values**: every case of `fingerprints.json` gains a `layoutHash`,
  checked in Deno and, for every case but `big500`, under Node through `dist/`.
  A change to the canonical form moves them all and fails by name.
- a non-path piece throws `BoardFileError`.

Store (`store.test.ts`):

- **the fixtures change**: `entry()` saves an empty board, and every empty
  board of one size is one layout now. Tests that need two entries need two
  layouts (small hand-built boards, e.g. one piece at different cells), and
  tests that need one layout under two recipes use the same board with two
  parameter sets;
- two parameter sets, one layout: one board file, one meta, two recipes, top
  level from the second, `createdAt` from the first, `layoutExisted` true;
- the same parameters twice: one recipe, its `createdAt` kept, the view of the
  second write;
- `seed…` files beside a `sha256-` layout are neither listed nor deleted;
- `deleteBoard` refuses a `seed…` name and removes a whole layout.

CLI (`carve.test.ts`): the existing tests locate files by the layout hash of
the board they regenerate, not by `boardId`; a batch run twice over the same
seeds writes nothing new the second time, names every seed as already stored,
and exits 1; `--dry-run` prints the layout hash as `id`.

Lab server (`lab-server.test.ts`) and `apps/lab` (`boards.node.test.ts`): the
id shape. `ExportButtons.browser.test.tsx`: the download name is the layout
hash, and the button is disabled until the hash arrives.

## Out of scope

- Migrating stored `seed…` boards.
- Removing a single recipe, and showing recipes in any UI.
- Treating rotations and mirror images as one layout.
- Serialising concurrent writes to one layout.
- Moving store files from `/boards/` to `/store/` (PR 5's).
- Putting the layout hash into the board file header: that would be format v2,
  and the file does not need it to be read.
