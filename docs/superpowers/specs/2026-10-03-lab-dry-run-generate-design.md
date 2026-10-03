# Lab: Generate is a dry run; saving is asked for

Every run the lab finishes is saved to the store. `useStoreSave`
(`apps/lab/src/library/useStoreSave.ts`) watches `result.shown` and posts each
finished, unstopped board, whatever started the run: Generate, `g`, the
palette, Reseed, Reset, `[` and `]`, a preset, auto-run, a pasted command,
Load into lab, the URL hash and the page load itself. A session of looking at
boards fills the store with boards nobody chose to keep. This spec makes a run
a dry run unless saving was asked for, and gives three ways to ask. Checked
against `main` at `430b1d9`.

One branch, `lab/dry-run-generate`, base `main`. Bead `arrowz-qdz6`.

## Goal

Generating writes nothing to the store. A person saves a board in one of three
ways: a switch that saves every board while it is on, ⌘G (Ctrl+G) to generate
and save, and a Save board button that saves the board on screen without
running again. The status line says when a board on screen was not saved.

## How the lab saves today

- `useRun.start` is the one place a run begins. It reads the knobs with
  `getState()` and calls `generator.start(values)`; the run slice's
  `started(params)` keeps the parameters of that moment.
- `completeRun` (`state/store.ts`) moves a finished run into `result.shown`
  together with those parameters, and `showResult` clears `result.saved`.
- `useStoreSave` builds the request with `storeRequest` (`top` zeroed, `cell`
  from `exportCell`, `aborted: false`), posts it with `saveBoard`, and hands
  the answer to `result.stored(file, outcome)`, which drops an answer for a
  file no longer on screen. A stopped board is never saved.
- `useRunLine` (`stage/useRunState.ts`) appends `saveText(saved)` to the run's
  line for the three branches that report a board (`reportsRun`).
- The CLI already calls a run that writes nothing `--dry-run`
  (`packages/cli/carve.ts`).

## Decisions

- **The intent to save travels with the run.** `RunControl.start` takes
  `{ save?: boolean }`. `useRun.start` decides `save = opts.save === true ||
  ui.saveEvery` at the start, and `run.started(params, save)` keeps it beside
  the parameters. `completeRun` copies it into `ShownResult.save`. Flipping the
  switch during a long carve does not change that carve, for the reason the
  parameters are read at the start. Rejected: a one-shot `saveNext` flag in
  `ui`. A refused or stopped run would leave it armed, and the next plain `g`
  would save.
- **One way to save.** `saveShown()` (new, `library/saveShown.ts`) builds the
  request exactly as `useStoreSave` does today, marks the save as pending, posts
  it and calls `result.stored`. `useStoreSave` calls it only for a shown board
  with `save: true`. The Save board button and the palette's Save board row
  call it for the board on screen.
- **The switch.** `ui.saveEvery`, labelled "Save every board", sits in the run
  column's `…` menu beside auto-run, in both the simple and the advanced view
  (auto-run is advanced-only; this is not a knob). It is `false` on every page
  load and is never remembered, like `ui.auto`. A forgotten switch must not
  save silently after a reload.
- **⌘G and Ctrl+G generate and save.** `generateAndSave(control)` in
  `run/actions.ts`, beside `generate`. A listener of its own beside
  `usePaletteKey`, because `isHotkeyRefused` refuses every Ctrl and ⌘ key. It
  is bound where `WORKSPACE_KEYS` are, on the lab and the saved boards. It keeps
  `g`'s other refusals (a field, an editable region, IME composition, a repeat,
  a consumed event) and calls `preventDefault`, since the browser's ⌘G is
  "find next". `g` stays a dry run.
- **Save board.** A button in the row under Generate (with Reseed, Reset and
  Stop) and a palette row. It is disabled, with the reason as its `title` and
  in the palette's value column, when:
  - no board is on screen;
  - the board was stopped (a stopped board is a look at where a run got to,
    not a board to keep: today's rule, unchanged);
  - a save of it is pending (a double click posts once);
  - the store already answered `ok` for it.
  After a failed save (no store server) it is enabled again, so the save can
  be retried. An older store server's answer (a 201 with a bare meta,
  `stale`) is a saved board: the button stays off as for `ok`. The button shows the short word ("Save" /
  "Zapisz"); its accessible name is the full "Save board" / "Zapisz planszę",
  which contains it. Measured: the full Polish label wraps the M/S bar at
  1024×768 to a third row (controls 128 px against `bar-row`'s 104); the short
  one keeps 88 px in both languages.
- **Pending is part of the answer.** `result.saved` becomes
  `SaveOutcome | 'pending' | null`, still for `shown.file` and no other file.
  A new `result.saving(file)` sets `'pending'` under the same file check as
  `stored`.
- **The status line.** For a board this run produced (`reportsRun`) and not
  stopped, the appended part becomes:
  - `saved === null` and `shown.save === false`: " — not saved (⌘G or Save
    board)". This replaces nothing; today the part is empty.
  - `saved === 'pending'`, or `saved === null` with `shown.save === true` (the
    frame between `completeRun` and `useStoreSave`'s effect): " — saving…".
  - an outcome: `saveText`, unchanged.
  The text says "⌘G" on every platform, as the lab says "⌘K" (`cmdOpen`,
  `TopBar`) with no platform check; Ctrl+G is bound, not spelled.
- **Every other trigger follows the switch, with no change.** The page load,
  the URL hash, Load into lab, a pasted command, the simple panel, a preset,
  auto-run, Reseed, Reset, `[` and `]` call `control.start()` with no options.
  A series never saves and is untouched.

## Dictionary

English is the source, Polish the translation (`packages/engine/lab-i18n.ts`).

| Key | English |
|---|---|
| `saveBoard` | Save board (accessible name, palette row) |
| `saveShort` | Save (the button's text) |
| `saveEvery` | save every board (lower case, as `autoRun`) |
| `generateAndSave` | Generate and save |
| `notSavedDryRun` | not saved (⌘G or Save board) |
| `saving` | saving… |
| `saveNoBoard` | No board to save yet |
| `saveStopped` | A stopped board is not saved |
| `savePending` | Saving… |
| `saveDone` | This board is saved |

`storeEmpty` changes: it says "Generate a board in the lab" today, and a
generated board is no longer stored. New text: "The store is empty. Save a
board in the lab (Save board or ⌘G) or run deno task carve." The existing
`notSaved` ("no store server") stays: it is a failure, not a dry run.

## Tests

- **Saving.** Moved from `useStoreSave.browser.test.tsx` and extended. A shown
  board with `save: false` posts nothing; with `save: true` it posts once;
  `saveShown` on the board on screen posts once, with no new run; two calls
  while pending post once; an answer for a replaced board is dropped (kept).
- **The run carries the intent.** The switch on at start saves even if turned
  off before the end; off at start does not save even if turned on before
  the end; `start({ save: true })` saves with the switch off.
- **Keys.** `g` posts nothing; ⌘G and Ctrl+G post once and are
  `defaultPrevented`; ⌘G with the focus in a knob field starts nothing.
- **Save board.** Disabled with each of the four reasons; enabled again after
  a failed save. Present in both views; the switch too.
- **Status line.** Each of the three new suffixes, and none for a stopped board.
- **Switch.** Off in a freshly created ui slice, whatever `localStorage`
  holds, and never written to it.
- **Existing tests that wait on an automatic save** move to ⌘G or the switch,
  each checked in its file when the plan is written. They are the ones naming
  `savedAfter`, `saveBoard` or `/api/boards`: `routes/Workspace`,
  `library/BoardColumn`, `library/LibraryFace`, `shell/lastBoards`,
  `shell/SheetBar`, `routes/LayoutInvariants`, `run/ExportButtons`.
- **Live.** One run with a real mouse against a copy of the store: load,
  Generate, `g`, a preset, all writing nothing; Save board writes one; ⌘G
  writes one; the switch on, Reseed writes one.

## Out of scope

- Saving a stopped board. The store's meta can carry `aborted`, so this is a
  later decision, not a constraint.
- Remembering the switch.
- Any change to the store server or the CLI.
