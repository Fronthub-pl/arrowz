# Lab: Stop that keeps the partial board, and opening a `.board.json`

Piece D of item 4 ("Parity gaps") in `lab-review.md`: Gap 6 (Stop that keeps
the partial board) and Gap 8 (open a `.board.json` from disk). One PR for both.
Base: `main` after PR #126 (paste a `carve` command into ⌘K).

## Goal

1. **Stop keeps the board.** Today the lab's Stop terminates the worker
   (`useGenerator.abort`), and the board carved so far is lost. The CLI keeps
   it: `CARVE_TIMEOUT_S` throws `GenerateAbort` from the `trace` hook, and
   `generate()` returns the partial board with `aborted: true`. The lab does
   the same on Stop, so a person sees where a slow board jammed.
2. **Open a board file.** The lab can download a `.board.json` but not open
   one. It opens one (optionally with its meta `<id>.json`) as a preview on
   the saved boards, beside the run's own result.

Out of scope: a time budget knob (`CARVE_TIMEOUT_S` in the lab), storing an
opened file, storing an aborted board, closing rate over N seeds (piece E).

## Decisions (user, 2026-09-28)

- One PR for both halves.
- Stop reaches the blocked worker through a `SharedArrayBuffer` flag.
- An aborted board is shown, never stored.
- An opened file is a preview on the saved boards, not a replacement of the
  run's result.
- Three entries to open a file: a button, a drop on the stage, a ⌘K row.

## Part 1: Stop that keeps the board

### Why a shared flag

`generate()` is synchronous, so the worker's event loop is blocked for the
whole run and a `postMessage` from the page is read only after it ends. The
engine calls `trace` at least once a second during carving (see
`CARVE_TIMEOUT_S` in `carve.ts`); a flag the page writes into shared memory
is visible there without yielding. A `SharedArrayBuffer` exists in a page only
when it is cross-origin isolated.

### Protocol (engine, `types.ts`)

- `WorkerIn` `generate` gains `stop?: Int32Array`, a view over a
  `SharedArrayBuffer` of one element. `Atomics` needs an integer typed array,
  and a typed array over shared memory is shared, not copied, by
  `postMessage`.
- `WorkerOut` `done` gains `aborted: boolean`, copied from
  `GenerateResult.aborted`.

Both stay neutral: `Int32Array` and `Atomics` are ECMAScript, not DOM or Deno.

### Worker (`generate.worker.ts`)

The `trace` hook posts `progress` as today and then throws `GenerateAbort`
when `stop` is present and `Atomics.load(stop, 0) === 1`. Nothing else
changes: the engine turns the throw into a normal result, which crosses as a
normal `done`.

### Isolation

- `apps/lab/vite.config.ts`: `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` on both `server` and `preview`.
- `apps/lab/vitest.config.ts`: the same headers on the browser project's
  server, so the shared-flag path runs in the browser tests.
- The store is reached through the Vite proxy (`vite.proxy.ts`), same-origin,
  and the store server already sends `Cross-Origin-Resource-Policy:
  same-origin`. The lab loads nothing from another origin.

### Page (`useGenerator`, run slice)

- `start()` makes a fresh flag for every run when `crossOriginIsolated` is
  true, and sends it with `generate`. Without isolation it sends none.
- `abort()`:
  - with a flag and a run in flight: `Atomics.store(flag, 0, 1)` and the run
    slice sets `stopping: true`; the phase stays `running`, so every check of
    a run in flight (Generate disabled, the busy stage, the palette's
    reasons) holds unchanged;
  - with `stopping` already set (a second Stop), or with no flag: today's
    path, terminate and `run.aborted()` (`wasAborted`), the board is
    discarded.
  The second press is the way out of the metrics step: after carving the
  engine analyses the board (`metricsMs`) without calling `trace`, so the flag
  is not read there.
- `start()` while a run is in flight still terminates the worker: the old
  run's board is not wanted.
- `done` with `aborted: true` goes through `completeRun` like any other
  result.

### What the page shows

- While `stopping`, the Stop button reads "Discard" (PL "Odrzuć") and stays
  enabled, and the status line reads "Stopping…" (PL "Zatrzymuję…").
- The status line for an aborted result: "Stopped — the arrows laid so far"
  (PL: "Zatrzymano — strzałki ułożone do tej chwili"), in `lab-i18n.ts`.
  Every new string passes `glossary.test.ts` (no "carve", "pieces", "jam" in
  English; no "zacina", "generacj" in Polish).
- `ReportInput` carries `aborted`; the status line is where it shows. No
  report row: `reportRows` has no row for the outcome today, and the status
  line already tells closed, unsolvable and not closed apart.
- `useStoreSave` skips a result whose report is aborted.
- `showResult` does not move the baseline past an aborted result: its numbers
  describe a board cut short and are not comparable with the next run.

### Tests

- `worker-smoke.mjs`: the built worker, with a flag set in the `postMessage`
  collector on the first `progress`, answers `done` with `aborted: true`, a
  board with at least one piece, and a board that decodes. Node has
  `SharedArrayBuffer` without isolation, so this runs where the script runs
  today.
- Browser: `crossOriginIsolated` is true on the lab's test server (guards the
  headers); Stop on a slow run shows the partial board and the stopped status;
  a second Stop in `stopping` discards; an aborted result is not posted to the
  store; the baseline does not move past it.
- Unit: `showResult` with an aborted `before`; the run slice's `stopping`
  transitions.

## Part 2: open a `.board.json`

### One entry, three ways in

`openBoardFiles(files: readonly File[]): Promise<void>` in `apps/lab/src/library`
is the only reader. It is called by:

- an "Open file…" button (`<input type="file" accept=".json" multiple>`) on
  the saved boards: in the board column's empty state and above the board
  list;
- a file dropped on the stage (the workspace), on either tab;
- a ⌘K row "Open board file…", which clicks the same hidden input.

Every way ends at `/boards/file`.

### What it accepts

- Exactly one file whose JSON has `format: 'arrowz-board'`, read with
  `decodeBoard`, which already checks the format, the version and the
  fingerprint.
- Optionally one more file: the board's meta (`BoardMeta`, the store's
  `<id>.json`). It is kept only when `meta.id === await layoutHash(board)`,
  so a renamed pair still works and a meta from another board is refused.
- Every attempt navigates to `/boards/file`. A failure clears the preview and
  sets the library's `boardFailed` with the file's name and a problem code,
  worded at render in PL/EN through `boardFileError`: not JSON, no board file
  among the files, two board files, a meta that belongs to another board, a
  second file that is neither. A board that does not decode keeps the
  decoder's own message, as a stored board does. Not `raiseNotice`: the
  library's notices show on its tab only, and a drop can happen on the lab's.

### Where it lands

- `result.preview` becomes a union:
  `{ origin: 'store'; board; file; meta: BoardMeta }` (today's
  `StoredBoard`) or `{ origin: 'file'; board; file: BoardFile; meta:
  BoardMeta | null; name: string }`. The compiler then points at every place
  that assumes the store (Delete, `useViewSave`, the size in the address).
- `AppRoutes` declares `/boards/file`; `useOpenPreview` answers the file
  preview there and the store preview on `/boards/:size/:id` as today.
- `useStoredBoard` returns early on `/boards/file` (its "no board named"
  branch would clear the file preview), and its "already drawn" shortcut
  checks `origin === 'store'`, so a file preview whose meta has the same id
  is not taken for the stored board.
- The run's result is untouched, as with a stored preview.

### The board column for a file

- Facts: the file name, W×H, arrows, empty cells when there are any, the full
  `layoutHash`.
- Download SVG and download the board file again.
- With a meta: the command, the seed, Load into lab (the same `loadIntoLab`),
  and the Preview panel's view rows, which edit the preview locally
  (`previewView`) and write nothing to the store.
- No Delete, no store save.
- Without a meta: the Preview panel shows the lab's colours
  (`ColoursSection`) and a hint that choosing both files brings the command
  and the view.

### Tests

- Unit (`openBoardFiles` over `File` objects): each error; a matching meta is
  kept; a meta for another board is refused; a lone board file opens with a
  null meta. Board files come from `encodeBoard` of a real `generate()`
  board, never a hand-built DTO.
- Browser: the button, the drop and the ⌘K row each land on `/boards/file`
  with the board drawn; Load into lab with a meta sets the knobs and runs;
  the file preview has no Delete.

## Docs

- `lab-review.md`: Gap 6 and Gap 8 rows marked done on this branch; item 4 of
  "What is still open" keeps only closing over N seeds.
