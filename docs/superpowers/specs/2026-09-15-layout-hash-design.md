# The layout hash: one name for one arrangement of arrows

Date: 2026-09-15. Concerns the engine (`packages/engine`), the board store and
the CLI (`packages/cli`), the lab application (`apps/lab`) and both READMEs.
Lands on the lab stack as its own PR, based on `lab/report-export` (#68),
before PR 5 builds the saved-boards library on the store's ids.

Revision 3: after two review rounds — two reviewers (engine; store, CLI,
server and lab), then one reviewer of revision 2 — all "With fixes", the second
round without a critical finding. Their probes are cited where a sentence rests
on one.

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
0.2 against the default on 6×6: 200 of 200 seeds identical, review probe);
different seeds often on 4×4, now and then on 6×6. Nothing detects it:

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
  stays runtime-neutral: `crypto` is a global of Deno, Node (the repository
  requires Node 24) and browsers, and `neutral.test.ts` does not forbid it.
  The price is that `layoutHash` is asynchronous, and so is `saveBoard`.
- **No migration.** Boards stored under `seed<N>-<hash>` names stay on disk,
  unlisted and untouched; the store lists `sha256-*` names only. Their metas
  carry the command that made them (which reproduces the board unless the run
  was aborted).
- **Delete removes the whole layout**: board file, meta and preview, as today.
  Removing one recipe waits until a UI shows recipes (PR 5 or later).
- **A recipe's key is `boardId(params)`.** Saving with parameters already
  among a layout's recipes replaces that recipe; other parameters add one.
  `boardId` keeps its meaning — a hash of the parameters — and changes role,
  from file name to recipe key.
- **The generation worker's protocol does not change.** The lab computes the
  hash on the page (§5).

## 1. `layoutHash` in the engine

`layoutHash(board: BoardData): Promise<string>`, in `board-file.ts` (it shares
`ByteWriter` and `stepCode` with the encoder), exported from `mod.ts` beside
`decodeBoard` and `encodeBoard`.

The canonical bytes, in order:

1. the ASCII tag `arrowz-layout/1`, with no terminator;
2. `W`, `H` and the number of pieces, as unsigned LEB128 varints;
3. per piece, **in ascending order of its head cell index** (`y * W + x` of
   `cells[0]`): varint head index, varint `length * 4 + dir`, then the steps
   from `cells[i]` to `cells[i + 1]` as 2-bit indices into `DIRS`, low bits
   first, **padded with zero bits to a whole byte per piece**;
4. varint count of voids (owner `-2`), then their cell indices ascending, each
   as an absolute varint (not a delta).

The result is `'sha256-' + hex(SHA-256(bytes))`.

What the form leaves out, and why:

- **Piece ids** and **carving order** — the two things that make `fingerprint`
  non-canonical. Sorting by head cell has no ties on a consistent board: a cell
  belongs to at most one piece, so no two heads share an index.
- **Unfilled cells** (owner `-1`) — they are every cell no piece and no void
  holds, so they follow from the rest.

What it keeps: the order of cells within a piece, because it draws the shape
(the head is `cells[0]`, the tail is the last cell), and `dir`. On a generated
board `dir` is redundant — the carver makes no one-cell piece
(`if (path.length < 2) continue`) and every head points away from `cells[1]`,
checked over every golden board — but the file format accepts one-cell pieces
and any `dir`, `board-file.test.ts` builds such boards, and the board element
draws `dir`: two files that differ only in it are two drawings, and the hash
names files.

Byte padding per piece costs a few bits against the file's single step stream
and makes each piece's record self-delimiting given its length; the file
optimises for size, the hash only for being unambiguous. The piece count in
step 2 does the same for the boundary between pieces and voids.

`layoutHash`, like `encodeBoard`, checks that each piece is a path (a non-path
throws `BoardFileError`) but not overlaps or `owner` beyond voids. Every board
that reaches it in production has passed `decodeBoard` or come out of
`generate`, both of which rule overlaps out.

Implementation constraints the two gates impose (measured by the review):

- `ByteWriter.bytes()` is retyped `Uint8Array<ArrayBuffer>` (its buffer
  already is one). `SubtleCrypto.digest` takes `BufferSource`, which excludes
  `Uint8Array<ArrayBufferLike>`: both `deno check` and the Node build
  (`tsconfig.build.json`, lib es2022 + dom) reject the call with TS2345
  otherwise. No cast.
- Sort a copy with `slice().sort(...)`. `toSorted` passes `deno check` but not
  the Node build (lib es2022, TS2550); `slice()` also keeps the "no spreads
  proportional to pieces" rule grep-clean.

Cost, measured on the canonical form built as above: 1000×1000 (85 809 pieces)
about 138 ms, of which SHA-256 about 1 ms; big500 30 ms; 100×200 under 6 ms.
Nothing in the engine calls `layoutHash`, so `encodeBoard`, `decodeBoard` and
`game.ts` stay synchronous.

## 2. The stored meta: one layout, its recipes

Files per layout: `<W>x<H>/sha256-<hex>.board.json`, `sha256-<hex>.json` and,
when a preview was asked for, `sha256-<hex>.svg`.

`BoardMeta` (`types.ts`) gains one field and changes the meaning of `id`:

```ts
/** One way of producing a stored layout: a seed and parameters, and the run that used them. */
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

export interface BoardMeta {
  /** layoutHash() of the stored board: `sha256-<64 hex>`. */
  id: string
  // …every field it has today…
  /** Every recipe that produced this layout, in the order they were first saved. */
  sources: Recipe[]
}
```

The top-level fields keep their shape and read as follows:

- `seed`, `params`, `view`, `command`, `source`, `genMs`, `restarts`,
  `backtracks`, `aborted` copy **the recipe with the latest `updatedAt`** — the
  one the latest save wrote. A replaced recipe keeps its slot in `sources`, so
  that recipe is not necessarily the last entry. The old lab's library
  (`openBoard`, the `libLoad` handler, `saveLibView`), `genSeconds` and the
  `apps/lab` store client read these fields and keep working unchanged.
- `ok`, `pieces`, `maxLen` and `stuck` describe the layout **as reported by the
  latest save that carried them** (`stuck.heads`, "legal heads at the best
  moment", is strictly the run's). They cannot conflict between recipes: an
  abort always leaves cells uncarved (`Carver.run` calls `trace` only while
  cells remain), so an aborted board never shares a layout with a closed one.
- `fingerprint` and `boardBytes` describe the stored board file, which the save
  that created the layout writes and no later save rewrites (§3). `svg` follows
  the latest save.
- `createdAt` is the first save of the layout (it keeps the row in its place in
  the list, as today); `updatedAt` is the latest.

The meta on disk and the meta on the wire are the same JSON: one type, and the
duplication of one recipe at the top level is small.

**Why the recipe key matters: the library edits views by re-posting.** The old
lab's `saveLibView` sends the same board file back with the board's own params
and a new view. Were every save an append, each move of the stroke slider would
add a recipe. With `boardId(params)` as the key it replaces the recipe it came
from.

**A save that does not carry a figure keeps the stored one.** A figure absent
**or `null`** in the input's `metrics` is not carried: the lab server's
`checkMetrics` already drops both alike, both labs post `null` routinely
(`stuck` of a closed board, a missing `maxLen`), and the CLI passes `null` only
for `stuck` on a deadlock, which is the right stored value anyway. A figure not
carried keeps, for `ok`, `pieces`, `maxLen` and `stuck`, the layout's stored
value; for `genMs`, `restarts` and `backtracks`, the replaced recipe's value,
or `null` in a newly appended recipe. The old lab's view edit (`saveLibView`
posts `{ ok, pieces, maxLen, genMs }`) therefore erases nothing. A recipe's
`aborted` is `metrics.aborted ?? false`, as today (only the CLI's `SaveInput`
carries it).

**An aborted recipe does not reproduce its layout.** `CARVE_TIMEOUT_S` and the
lab's abort are not in the command, and an aborted board is whatever was carved
when the deadline hit. So a recipe key is unique within a layout, not across
the store: the same command can sit under several partial layouts and under the
closed one.

## 3. The store (`packages/cli/store.ts`)

`saveBoard(input: SaveInput): Promise<SaveResult>` where
`SaveResult = { meta: BoardMeta; layoutExisted: boolean; recipeExisted: boolean }`:

1. refuse a board file whose size differs from the params (as today);
2. `decodeBoard(input.board)`, then `layoutHash` of the result. The store
   trusts no caller's hash, and the lab server's POST reaches here too. On the
   server this is a second decode after `checkPost`'s; measured at 4.7 ms for
   100×100 and 18.7 ms for 400×400, and kept for the simpler contract;
3. read the existing meta, if any: `layoutExisted` is whether it was there;
4. build the recipe from the input; replace the entry of `sources` with the
   same `id`, keeping that entry's `createdAt` and every figure the input omits
   (§2), or append it — `recipeExisted` is whether one was replaced;
5. write the board file **only when the layout is new**, then the preview
   (written when given, removed when not — today's rule: the preview follows
   the latest write, as the top-level view does) and the meta.

**Why the board file is written once.** `encodeBoard` writes pieces in carving
order with their ids, so two recipes of one layout encode to different bytes
with different fingerprints (the 25×50 example above). Rewriting the file on
every save would change `fingerprint` under a name that promises stability, and
`loadSession` refuses a saved game whose snapshot fingerprint no longer matches
its board (`game: snapshot fingerprint does not match this board`). Written
once, a name maps to one byte sequence for as long as the layout is stored.
The consequence, stated so nobody is surprised: a board file the lab downloads
under `sha256-X.board.json` (§5) and the store's file of that name are the same
layout, and may number their pieces differently.

Comments that describe the old naming and become false, for the plan to
correct: `store.ts` ("The id names three files…", "The same id means the same
board (the id hashes the parameters)"), `lab-server.ts` `checkParams` ("The
seed goes into file names…"), and `carve.ts`'s header on the dry-run line.

The `^seed\d+-[0-9a-f]{8}$` check goes: the id is the output of `layoutHash`,
not of anything a caller sends. A non-numeric seed is refused where it is
today, by the lab server's `checkParams` (`params.seed must be a number`); an
unchecked caller of `saveBoard` can at worst put odd JSON into `meta.seed` and
the recipe id, never into a path.

`deleteBoard(size, id)` keeps its behaviour. Its name check tightens to
`^sha256-[0-9a-f]{64}$`, so it no longer deletes a `seed…` board (none is
listed); `DELETE /api/boards/<size>/seed…` answers 400, not 404.

`listBoards()` pairs `sha256-<hex>.json` with `sha256-<hex>.board.json` and
skips every other name. Order stays: sizes ascending by cells, layouts newest
first by `createdAt`.

`readMeta` fills a missing `sources` with `[]`, and fills each recipe's
`params` and `view` with the engine defaults exactly as it fills the top-level
ones, so PR 5 can read recipes saved before a future knob.

**A known race, left open.** The CLI and the lab server can save the same
layout at the same moment; the read-modify-write of steps 3–5 then keeps one of
the two recipes. The store is a local tool, and the lost recipe is reproducible
by its command. Named here so that nobody mistakes it for a guarantee.

## 4. The CLI (`packages/cli/carve.ts`) and the lab server

`carve.ts` saves in three places — the batch, a single run that did not close,
and a single run that closed — and awaits `saveBoard` in all three.

**A single run**, closed or not, adds to its stdout report line after the
stored names `layout already stored, recipe added`, or
`layout already stored, recipe updated` when the parameters were already among
its recipes. Nothing is added for a new layout.

**A batch** (`--count=N`) counts only new layouts towards N. A seed whose
layout is already stored — from an earlier batch or from an earlier seed of
this one — has its recipe saved all the same, prints on **stderr**
`seed <S>: layout already stored as <W>x<H>/sha256-…, recipe added` (or
`recipe updated`, by the single run's rule), and the batch moves on within the
existing seed limit (`--max-seeds`, default 2·N). Stdout keeps one line per
written board and the summary last; the summary names those seeds the way it
names seeds that did not close, after them when both appear:
`batch: 2/3 boards written, 6 seeds tried, not closed: 5, already stored: 1 2 3`.
A batch that reaches the seed limit short of N exits 1, as today.

**`--dry-run`** reports `id` as the layout hash of the board it carved, in both
of its JSON lines (the closed one and the not-closed one); `fingerprint` stays
beside it.

**The lab server** awaits `saveBoard` and answers `201` with its `.meta` —
today it sends `saveBoard`'s return value whole, and `apps/lab` types the body
as `BoardMeta`. Its POST validation stays and is still not a duplicate of the
page's: a seed no longer reaches a file name, but the parameters still reach
the command and the meta.

## 5. The lab application (`apps/lab`)

**The board-file download is named `sha256-<hex>.board.json`.** A download
has to start in the click that asks for it, and the hash is asynchronous, so
`ExportButtons` computes it ahead of the click, itself:

- an effect on the shown file calls `layoutHash(result.board)` and keeps
  `{ file, hash, error }` in component state; the name is used only while that
  `file` is still `result.file`, so a late hash for a replaced board is never
  used. The effect's cleanup sets an `ignore` flag, so the first of
  StrictMode's two mount runs (`main.tsx` mounts under `StrictMode`) writes
  nothing;
- the board-file button is disabled until the hash for the shown file is
  there. The hash lives in the component because the component is its only
  reader, and because `ExportButtons.browser.test.tsx` mounts `ExportButtons`
  alone — a hook in `App.tsx` would never run there;
- `crypto.subtle` exists only in a secure context. `localhost` and `127.0.0.1`
  (the lab server, Vite, the browser tests) are secure; Vite's `--host` over
  plain http on a LAN is not. A rejected hash leaves the button disabled and
  keeps the reason in the component's `error`, shown in an alert beside the
  SVG export's under its own dictionary key (English and Polish, in
  `lab-i18n.ts`); nothing rejects unhandled. It does not reuse the result
  slice's `exported`/`exportError`: that line is the SVG export's, cleared when
  an SVG export starts and prefixed "Export failed:", and a hash failure written
  there would vanish on the next SVG click while the button stayed disabled;
- the SVG download keeps its name (`arrowz-<W>x<H>-seed<S>.svg`).

On an Insane board the hash costs the page about 138 ms once per result
(§1). The result slice, `App.tsx` and the store client (`api/boards.ts`) do not
change.

## 6. Documentation

`README.md` and `README.pl.md` describe the old names and the old rule, and
`readme.test.ts` guards the tables, the refusal texts and every documented
command, but no file name, so nothing fails on its own. Both languages change
together:

- the passage on what a run writes (`seed7-f48ddb0f.board.json`,
  `seed7-f48ddb0f.json`, and "The name is the seed number plus a short code
  worked out from the settings. Two boards made with different settings
  therefore never overwrite each other", which now reads the opposite way:
  the name is worked out from the arrows, the same arrows from other settings
  share one file, and the meta lists every recipe);
- the `--svg` sentence naming `seed7-f48ddb0f.svg`;
- the store tree block (`seed7-8796a4f9.*`);
- the paragraph under the tree block ("The file name is the seed followed by a
  short code derived from the settings. Change a setting and you get a
  different code, so nothing is overwritten by accident…", and its Polish
  counterpart "Nazwa pliku to ziarno, a po nim krótki kod…");
- one sentence on `--count` counting different layouts.

**The example names are guarded.** Today's are already stale (`seed7-f48ddb0f`
for 40×40 seed 7, where `boardId` now gives `seed7-c79dad6c`), which is what an
unguarded example costs. `readme.test.ts` gains one case per language that
generates the README's boards (40×40 seed 7, and the 25×25 seed 7 of the tree
block) and asserts that the names the README prints are their layout hashes.
Values from the review's independent reading of §1, to cross-check, not to
copy: 40×40 seed 7 `sha256-e5f707067ec077e5558a8e91473371bf725b8e94467c61b4ce1436086eb2cdb4`,
25×25 seed 7 `sha256-0dc74eeff4ad01590a81f3aa79727f673dad073976f7a37df4bd8a4af4d7b978`.

`packages/engine/HISTORY.md` is a record of what was, and is not rewritten.

In the old lab, `renderLibrary` puts `meta.id` in a monospace column of a
`1fr auto` grid; 71 characters overflow it. `lab.html`'s `.boardrow .id` gains
`white-space: nowrap; overflow: hidden; text-overflow: ellipsis` —
`overflow: hidden` is what lets the `1fr` track shrink below the id. The status
line, which also names `WxH/sha256-…`, already clips; the React lab's status
shows no id.

## 7. Testing

**Engine** (`board-file.test.ts`, `fingerprints.test.ts`, `node-smoke.mjs`):

- the same layout with pieces shuffled and ids renumbered gives the same hash,
  while its `fingerprint` differs — the pair proves the hash sees what the
  fingerprint cannot;
- a board that differs in one step, one `dir` or one void gives another hash;
  two one-cell pieces that differ only in `dir` give two hashes;
- empty boards of two sizes give two hashes;
- a board file round-trip keeps the hash;
- a non-path piece throws `BoardFileError`;
- **frozen values**: all 15 cases of `fingerprints.json` gain a `layoutHash`
  (12 distinct boards: `defaults` = `simple`, `tunnels` = `trap-off` =
  `bite-off`), checked in Deno for every case and under Node through `dist/`
  for every case but `big500`. The `Deno.test` bodies become `async`;
  `node-smoke.mjs` imports `layoutHash` from `../dist/mod.js` and awaits it in
  its loop. The repository has no recorder for `fingerprints.json` (it was
  recorded once from Node, with no recorder script kept), so the values are recorded by
  running the implementation once and **cross-checked against the independent
  values in the appendix**, which the review computed from this section's text
  in Deno and Node alike. A disagreement is a bug in one of the two readings of
  §1 and is resolved before recording, not by taking the implementation's.

**Store** (`store.test.ts`):

- **the fixtures change**: `entry()` saves an empty board, and every empty
  board of one size is one layout now. Tests that need two entries need two
  layouts (small hand-built boards, e.g. one piece at different cells); tests
  that need one layout under two recipes use one board with two parameter sets;
- the three `listBoards fills a legacy …` tests write their hand-made metas
  under `sha256-<64 hex>` names, or they would no longer be listed; they still
  test default-filling;
- 'deleteBoard returns false for a missing board' uses an unknown `sha256-`
  name; a `seed…` name now throws;
- 'saveBoard refuses params whose id is not seed<digits>-<hash>' is removed:
  the id no longer comes from params (§3);
- two parameter sets, one layout: one board file, one meta, two recipes, top
  level from the second, `createdAt` from the first, `layoutExisted` true and
  `recipeExisted` false;
- the same parameters twice: one recipe, its `createdAt` kept, the view of the
  second write, `recipeExisted` true;
- a re-save without `stuck`, `restarts` or `backtracks`, and one that posts
  them as `null`, keeps the stored ones;
- a second recipe of a stored layout, saved with its pieces numbered in
  another order, leaves the board file's bytes, `fingerprint` and `boardBytes`
  as the first save wrote them;
- `readMeta` fills a recipe's missing knob with the engine default;
- `seed…` files beside a `sha256-` layout are neither listed nor deleted.

**CLI** (`carve.test.ts`):

- tests that regenerate their board locate files by its layout hash instead of
  `boardId`;
- tests whose board was aborted (`CARVE_TIMEOUT_S`) cannot regenerate it: they
  take the name from stdout (`/400x400\/(sha256-[0-9a-f]{64})\.board\.json/`)
  or from the directory, and the dry-run case under the timeout matches
  `^sha256-[0-9a-f]{64}$`;
- `--count=3 --seed=1` run twice on 10×10: the second run names seeds 1–3 as
  already stored on stderr, each `recipe updated`, writes seeds 4–6 (all six
  close and are six distinct layouts, review probe), prints
  `batch: 3/3 boards written, 6 seeds tried, already stored: 1 2 3` and exits
  0 — Goal 4 as observed behaviour; the same second run with `--max-seeds=3`
  prints `batch: 0/3 boards written, 3 seeds tried, already stored: 1 2 3` and
  exits 1;
- a single run repeated reports `layout already stored, recipe updated`;
- `--dry-run` prints the layout hash as `id`.

**Lab server** (`lab-server.test.ts`): the two tests that call `saveBoard`
directly await it and read `.meta`; POST answers with the `sha256-` id; DELETE
of a `seed…` name answers 400.

**`apps/lab`**:

- `boards.node.test.ts` expects `^sha256-[0-9a-f]{64}$`;
- `ExportButtons.browser.test.tsx`: the download name is the layout hash (from
  `layoutHash` in `@arrowz/engine`, replacing the test's `boardId` import); the
  button is disabled until the hash arrives; a hash that arrives after the
  board was replaced is not used; a rejected hash shows its own alert and
  leaves the SVG export's line alone. The existing case 'the board file is the
  file on screen, under its board id' is renamed for the layout hash. The
  cases that click the board-file button and that measure its
  contrast ('the export buttons read at AA' — a disabled button is drawn at
  opacity 0.5, about 2.3:1) wait for `toBeEnabled()` first;
- `LabRoute.browser.test.tsx`, the case where both exports stay live during a
  run, awaits the enabled state before pressing Generate; its synchronous
  "read at once" check stays after that.

## Out of scope

- Migrating stored `seed…` boards.
- Removing a single recipe, and showing recipes in any UI.
- Treating rotations and mirror images as one layout.
- Serialising concurrent writes to one layout.
- Moving store files from `/boards/` to `/store/` (PR 5's).
- Putting the layout hash into the board file header (format v2), or into the
  generation worker's `done` message.
- Rewriting `HISTORY.md`.

## Appendix: layout hashes of the golden boards, computed by the review

Computed in Deno and Node from §1's text (tag without terminator, absolute void
indices, zero padding per piece); identical on both runtimes. For cross-checking
the recorded values, not for copying into `fingerprints.json` unchecked.

| case(s) | layoutHash |
|---|---|
| defaults, simple | `sha256-12b7183d231ad6b1182d6b0bfbbf4408da267b75175e61633f5abe85aaf80b06` |
| skeleton | `sha256-5dea86cefe25055053bbf138a832c7fe7029745734a51954151b5019c1487bc8` |
| tunnels, trap-off, bite-off | `sha256-c3f505da8bdc5d0ab728dadf6d89d126cadbde2c63be1d91f9b1aedec9e3c5e9` |
| layers | `sha256-d1c6a50e8351704b810296a3e432542183d7c806993f633f851b5e9169626763` |
| corner | `sha256-4248833be3120b29ecd6e556cba1db6a765c46beba979378ae6b6336ae4e1edb` |
| longstraight | `sha256-ee691eb7680c8ee3a60b984965cf08bd9d4a31a54955b87cc6828cc52ad6afcc` |
| big500 | `sha256-cfcadae4e2900f19b551fb2f8b97a972a983bd002dc0ac36fc4a1afcd122cbad` |
| voids | `sha256-b26c777ff0ace535f7bb95c85390f40270d71df23df567e1c9a189dd94bd687c` |
| trap-seek | `sha256-9021d3fb6d0aa43dd3d97ccaf8d8ff225ba2b43b184ea3d2251c746394a3e72c` |
| trap-avoid | `sha256-f67de62d6f34bd5cf0e879d54d335829502667b1d00df6341c16cd4d2e51a63b` |
| bite-2 | `sha256-bd0851250869b1a93bb1e73dbb75dffdd8722cd3aebb7738aca398ee6ef62912` |
| bite-8 | `sha256-8f72ec8d0b2898eeadf6ca73440272e945aa49601b6550d102aa0ea768f16dc4` |
