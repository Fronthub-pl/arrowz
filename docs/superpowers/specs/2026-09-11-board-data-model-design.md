# A board file: the CLI writes boards, the board element draws them

Date: 2026-09-11. Status: draft design, awaiting review.

Baseline: `main` at `f09310a` (PR #38 merged). Branch `feat/board-data-model`.

## 1. Why

Today a board exists only as the result of `generate(params)`. The store
(`packages/cli/boards/<W>x<H>/`) keeps a picture (`<id>.svg`) and a recipe
(`<id>.json` with the parameters and the command), never the board itself.
Every consumer that wants to draw or play a board has to run the generator:
the board element's demo does it in a worker, and a phone would have to do it
too — ~10 s in Node and ~27 s in a Chrome worker for Insane.

The goal is to **pregenerate boards and keep them in a database**: Firestore
holds the metadata, Cloud Storage holds the board file. That needs three
things this change delivers, and one it deliberately leaves out:

1. A serializable board format, owned by the engine, that the board element
   draws from.
2. A CLI whose default output is that file; the SVG becomes an opt-in
   preview.
3. A batch mode that fills a pool of boards.
4. *Out of scope:* the Firebase project, the Firestore schema and the upload.
   The files this change writes are ready to be uploaded as they are.

A side effect is worth naming: once a board is a file, the file *is* the
board and the parameters are only its provenance. A later change to the
generator no longer invalidates the boards already stored.

## 2. The data model

### 2.1 Types (`packages/engine/types.ts`)

```ts
/** What a drawn and played board is: the element and the game read only this. */
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

`Carver` still satisfies `Board`, so `generate().board` goes into the element
unchanged. `game.ts`, `geometry.ts` (`voidStrips`), `fingerprint()` and every
module of `packages/board-element` that takes a board narrow their parameter
to `BoardData`. They read only `W`, `H`, `owner` and `pieces` today, so no
value changes: `fingerprints.test.ts`, `svg-golden.test.ts` and
`scripts/node-smoke.mjs` must pass untouched.

`owner` is **not** derivable from `pieces` alone: `voidFrac > 0` scatters
voids (`owner = -2`, set in the `Carver` constructor), and a board that did
not close keeps uncarved cells (`-1`). Both enter `fingerprint()`. The file
therefore records the voids; every other cell without a piece is `-1`.

### 2.2 The file (`packages/engine/board-file.ts`)

A new module, neutral (no Deno, no DOM; added to `NEUTRAL` in
`neutral.test.ts`), exported from `mod.ts`.

```ts
export interface BoardFile {
  format: 'arrowz-board'
  v: 1
  W: number
  H: number
  /** Readable without decoding the body. */
  pieces: number
  voids: number
  unfilled: number
  /** fingerprint() of the board; the decoder checks it. */
  fingerprint: string
  /** base64 of the body below. */
  body: string
}

export class BoardFileError extends Error {}
export function encodeBoard(board: BoardData): BoardFile
export function decodeBoard(file: unknown): BoardData
```

On disk the file is `JSON.stringify(encodeBoard(board))`, extension
`.board.json`, MIME `application/json`.

### 2.3 The body

Three sections, one after another. Varints are unsigned LEB128; a signed
value is zigzag-encoded first.

1. **Piece headers**, in the order of `board.pieces`. Per piece:
   - `zigzag(id − previousId)` (the previous id of the first piece is −1, so
     ids equal to their index cost one byte each);
   - the head cell index `y·W + x` (`cells[0]`);
   - `length · 4 + dir`.
2. **Steps**: one continuous bit stream, two bits per step, for every piece
   in order. The step from `cells[i]` to `cells[i+1]` is its index in `DIRS`.
   The stream is padded with zero bits to a whole byte.
3. **Voids**: a count, then the void cell indices ascending as varint
   differences (the first one from 0).

Sizes: Easy fits in a few hundred bytes. Insane (1000×1000, seed 7, 85 809
pieces) measured 884 750 bytes of file on 2026-09-11 (`--dry-run`,
`boardBytes`); the test pins the golden board big500 as a ceiling (§6).

base64 is encoded and decoded by the module itself, in chunks, so that no
platform API is needed and a string of a million characters never goes
through `String.fromCharCode(...arr)` (the rule against spreading arrays that
scale with the board).

### 2.4 Decoding rejects, it never guesses

`decodeBoard` accepts `unknown` (a parsed JSON from Storage) and throws
`BoardFileError` with a readable reason when:

- `format`, `v`, `W`, `H` or a count is missing, of the wrong type, or `W`/`H`
  is outside the generator's 4..1000;
- the base64 is malformed, or the body ends early or has bytes left over;
- a head or a step leaves the board, two pieces claim one cell, a piece
  claims a void, or an id repeats;
- the counts from the header disagree with the body;
- the rebuilt board's `fingerprint()` differs from the header.

Decoding preserves `id`, the order of `pieces` and the order of cells within
a piece. `id` matters beyond the fingerprint (which does not hash it): the
element's hue and a saved game (`SessionSnapshot.removed`) both name pieces
by id.

## 3. The CLI

### 3.1 The store (`packages/cli/store.ts`)

`packages/cli/boards/<W>x<H>/` holds per board:

| File | When | Content |
| --- | --- | --- |
| `<id>.board.json` | always | the `BoardFile` |
| `<id>.json` | always | `BoardMeta` |
| `<id>.svg` | only with `--svg` | the preview |

`BoardMeta` gains `fingerprint: string`, `boardBytes: number` and
`svg: boolean` (whether the preview sits next to it), and loses `svgBytes`.
`saveBoard` takes a `BoardFile` and an optional SVG. `listBoards` lists the
boards that have both `<id>.json` and `<id>.board.json`. Boards written
before this change (SVG only) drop out of the list: the store is gitignored
and every one of them can be reproduced from its command. `deleteBoard`
removes all three files.

### 3.2 Modes (`packages/cli/carve.ts`)

| Call | Result |
| --- | --- |
| `carve --width=… --height=…` (simple mode) | board file + meta, no SVG |
| … `--svg` | also `<id>.svg` in the store |
| … `--svg=path` | also a copy of the SVG at `path` |
| `carve --advanced --board …` | new mode flag: one board into the store, like the simple mode |
| `carve --advanced --svg …` | as today: one board, with its SVG. Commands stored in old metas keep working |
| `--advanced` without a mode, `--bench`, `--dry-run` | unchanged |

`buildCommand()` writes `--advanced --board`: the stored command reproduces
the board without forcing a preview. `--dry-run` also prints `boardBytes`.

A single board that does not close is still stored, with its holes (the lab
shows them), exit code 1, as today.

### 3.3 Batch: `--count=N`

Available wherever one board is written (simple mode, `--advanced --board`,
`--advanced --svg`). It collects **N closed boards**:

- it tries the seeds `seed, seed+1, …` with the same parameters;
- a closed board goes to the store and prints one line on stdout;
- a board that does not close is **not** stored; it prints one line on
  stderr and the batch moves on to the next seed;
- it stops at N closed boards or after `--max-seeds=M` seeds (default `2·N`);
- it ends with a summary line: boards written, seeds tried, the seeds that
  did not close;
- exit code 0 when N boards were written, 1 when the seed limit came first,
  2 for invalid input as everywhere else.

The batch is reproducible: whether a seed closes is deterministic too, so the
same command always writes the same files. `--randomized` with `--count`
draws the parameters anew for every seed. `CARVE_TIMEOUT_S` applies per
board. `--count` and `--max-seeds` are refused (exit 2) in the modes that
write no board (`--dry-run`, `--bench`, the report), when `--max-seeds` comes
without `--count`, and when either is not a positive integer.

### 3.4 Help and documentation

`MODE_FLAGS` and `--help` gain `--board`, `--count` and `--max-seeds`.
`README.md` and `README.pl.md` describe the new default output and the batch.
`scripts/record-doc-images.ts` already passes `--svg=path`, so the document
images keep being produced.

## 4. The board element (`packages/board-element`)

- `board: BoardData | null` replaces `board: Board | null`. A consumer that
  loads a file writes `el.board = decodeBoard(json)`; the element never takes
  a `BoardFile` itself, so the consumer decides where decoding runs (a
  worker, for Insane).
- `game-host.ts`, `tesselate.ts`, `rides.ts`, `gl-layer.ts`,
  `gl-passes.ts` narrow to `BoardData`.
- The demo worker posts `encodeBoard(r.board)` — one string — and the page
  decodes it. This replaces the hand-written `plain()` that copied seven
  fields to get around `DataCloneError`, and makes the demo walk the same path
  the game will: file → decoder → element.

## 5. The lab (`packages/cli/lab-page.ts`, `lab-worker.ts`, `lab-server.ts`, `lab.html`)

- Both tabs, generation and library, draw into one `<arrowz-board>` instead
  of `innerHTML = svg`. The lab's `View` maps onto `BoardView` (`stroke`,
  `headWidth`, `headHeight`, `rounded`, `colored`, `top`, `voids`; `cell` is
  an SVG size and does not apply). Recolouring or changing a head is a
  property change; the library's own render worker (`libWorkerId`) goes. The
  lab's language goes to the element's `lang` attribute.
- After a generation the worker posts the `BoardFile` string; the page
  decodes it for the element and sends it to the store. `POST /api/boards`
  takes `board: BoardFile` (and no SVG); the server serves `.board.json`
  under `/boards/`.
- The library fetches `<id>.board.json`, decodes it and hands it to the
  element. A file that fails to decode shows the `BoardFileError` reason.
- "Download SVG" stays: on demand the worker runs `toSvg()` on its last
  board. The SVG is an export, never a stored artefact of the lab.
- New and changed strings go into `lab-i18n.ts` in English and Polish.
- The DOM rule holds: only `lab-page.ts` imports the element.

Decoding runs on the page. If Insane takes more than ~300 ms there, it moves
into the lab worker, which then posts `BoardData`. Measured on 2026-09-11
(Insane, seed 7, Apple M1): `decodeBoard` takes 111 ms median and 145 ms at
most over 5 runs in Deno 2.9.6 (V8 15.0), and 81 ms of the `done` handler's
158 ms on Chrome 152's main thread (DevTools performance trace), so it stays
on the page. The element's first draw that follows (tessellation 414 ms,
buffer upload 114 ms) makes the board's arrival one ~740 ms main-thread task.
The longest-pieces table (`longestSummary`, top 5) re-sorts every piece on
each preview change and takes 16 ms median in Deno, 15 ms in the Chrome trace.

### 5.1 Risk: Lit in a Deno bundle

The lab is bundled by `deno bundle`, and `@arrowz/board-element` is a Node
package whose `lit` comes from npm. The first task of the plan is a spike:
does `deno bundle` (and `deno check`) take the element from its sources, as a
member of the Deno workspace with `lit` in `node_modules`? If not, the
fallback is that `bundle` and `lab.sh` first run `pnpm nx build
board-element` and the lab imports its `dist/`. The spike's answer is
recorded in the plan before any lab work starts.

Outcome (2026-09-11, planning spike): `deno bundle` takes the element from
`../board-element/src/mod.ts` with Lit; the import must be a value import used
by the page, and `arrowz-board.ts` needed `override` on two statics for
`deno check`. No fallback needed.

## 6. Testing

Engine (`deno task test`):

- **Round trip** of every board frozen in `fingerprints.json`: same
  fingerprint, same `id` at every position, same cells in the same order.
- A board with `voidFrac > 0` and a board that did not close keep their `-2`
  and `-1` cells through the round trip.
- **Rejections**: wrong `format` or `v`, bad base64, a truncated body,
  trailing bytes, a step off the board, two pieces on one cell, a piece on a
  void, a repeated id, counts that disagree, a fingerprint that disagrees.
- **Size**: the file of the golden board big500 is pinned as a ceiling in
  `fingerprints.test.ts`; Insane is measured through `--dry-run` and recorded
  in §2.3.
- `neutral.test.ts` covers `board-file.ts`.
- `node-smoke.mjs` decodes a board in Node and checks its fingerprint: a
  Cloud Function will read these files.

CLI (`carve.test.ts`, `store.test.ts`, `lab-server.test.ts`):

- the default run writes `.board.json` and `.json` and no `.svg`; `--svg`
  adds the `.svg`; `--svg=path` writes the copy;
- the stored board decodes to the fingerprint `--dry-run` prints for the same
  command;
- `--count=3` writes three boards and exits 0; a batch whose seed limit runs
  out first exits 1 and names the seeds that did not close;
- `--count` in a mode that writes no board exits 2;
- the store lists only boards with a board file; delete removes all three
  files; the server serves `.board.json`.

Board element (Vitest):

- the element draws a board that went through `encodeBoard`/`decodeBoard`
  exactly as the original (same `pieceCount`, same hit-test ids);
- the existing suites pass with the narrowed type.

`pnpm nx run-many -t verify` and `deno task verify` green before the PR, and
a manual pass in the lab: generate, reload the library, recolour, download
the SVG, open an Insane board from the store.

## 7. Out of scope

- Firebase: project, Firestore schema, Storage layout, upload, security rules.
- gzip or `Content-Encoding` on Storage.
- The React lab (road map step 3) and the Angular game (step 4); both will
  consume `BoardFile` through `decodeBoard`.
- Moving `toSvg()` colours from the piece's index to its id (it differs from
  the element's `hueOf(id)`); noted, not changed here, because it would move
  the SVG golden hashes.
- The stale header of `geometry.ts` ("what the board element inserts into its
  own SVG") is corrected in passing, since that module's signature changes.
