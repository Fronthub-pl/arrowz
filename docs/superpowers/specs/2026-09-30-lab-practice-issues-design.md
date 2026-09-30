# Lab practice issues

The open rows of "Smaller practice issues and dead code" in `lab-review.md`,
shipped on one branch, `lab/practice-issues`, as one PR with the commits
grouped by section.

The goal is fewer re-renders where a component reads a field or two of a
slice, and one source for each rule the lab now writes twice. What a person
sees does not change; "Behaviour changes" lists the two formatting calls
that change locale and the digits they keep.

Every claim below was checked against `main` at `7230418`.

## Status of the rows

| Row | Finding at `7230418` | Here |
| --- | --- | --- |
| Whole-slice subscriptions | 7 left, 3 of them read a field or two | section A |
| `BoardFrame` memo keys | obsolete: `viewOf` now carries the look (`lookOf`), so `labView` reads every field but `voids`, which it also reads | row closed, no code |
| Slice boilerplate | `type SetStore` 9×, `const patch` 5×, two persisted toggles | section B |
| `specOf` written four times | 3 functions and `MIX_SPEC` | section C |
| `autoHeadWidth` copies the engine | open | section C |
| Locale mapping duplicated | `'en-GB'` 2×, `'en'` 1× | section C |
| `file: unknown` then `as BoardFile` | 2 casts | section C |
| Circular type import | `Console` and `SheetBar` import `WorkspaceTab` from `routes/Workspace` | section C |
| Workspace class string | one site left, `routes/Workspace.tsx` | section D |
| `params.broken` rebuilt on every commit | open, cost unmeasured | section D |
| Hard-coded `'on' : 'off'` | fixed in `feb59ab`, the table still says open | row closed, no code |

## A. Subscriptions narrowed to what is read

**Rule.** A component subscribes to the fields it reads. One or two fields
are separate `useStore((state) => state.x.y)` selectors, the store's
per-knob convention. Three or more are one selector under `useShallow`
(`zustand/react/shallow`). Actions are stable and are selected like fields.

**Sites.**

- `console/ViewPanel.tsx` reads `highlightLongest`, `showPoints`,
  `pointColor` and `setPointColor`: `useShallow`. Today every stroke edit
  re-renders the whole panel and `ColoursSection` under it.
- `console/rows/ColoursSection.tsx` reads `paper`, `ink`, `highlightColor`
  and their three setters: `useShallow`.
- `report/SeriesSection.tsx` reads `params`, `runs`, `error` and `phase`,
  never `count`: `useShallow`. Today committing the seed count in
  `series/SeriesRow.tsx` re-renders the section.

**Sites that stay whole, each with a one-line reason in the code.**

- `run/LiveCommand.tsx` and `palette/CommandPalette.tsx` build the CLI
  command through `viewOf`, which reads every field but `voids`.
- `stage/BoardFrame.tsx` reads every field through `viewOf` and `voids`.
- `useRunLine` in `stage/useRunState.ts` shows `run.progress`, which is what
  changes on every progress message.

**Proof.** React's `<Profiler>` cannot tell these apart: it counts commits of
a whole subtree, and the stroke row inside `ViewPanel` subscribes to the
stroke itself, so a Profiler around the panel reads 1 before and after the
fix (measured). The tests count calls of a *pure child* instead, a component
with no store hook that renders only when its parent does, through
`vi.mock(path, { spy: true })` (the pattern of `stage/BoardMode.browser.test.tsx`):

| Component | Pure child counted | Edit | Calls on `main` | After narrowing |
| --- | --- | --- | --- | --- |
| `ViewPanel` | `Section` | stroke | 5 | 0 |
| `ViewPanel` | `Section` | `showPoints` (read) | 5 | 5 |
| `ColoursSection` | `Section` | stroke | 1 | 0 |
| `ColoursSection` | `Section` | paper (read) | 1 | 1 |
| `SeriesSection` | `StatRowView` | seed count | 3 | 0 |

All five were measured by a probe on `7230418` with the narrowing applied
and reverted. The rows marked "read" are the positive controls: they keep a
count of 0 from meaning an unmounted tree. Every case is its own `test`,
because `vitest-browser-react` unmounts between tests, not within one.

The first run after adding the `zustand/react/shallow` import failed to
collect (the cold optimizer re-bundling mid-run, which `vitest.config.ts`
already guards against for `react-dom/client`); the second passed. So
`zustand/react/shallow` joins `optimizeDeps.include` in the chromium project.

## B. One slice template

A new module, `state/slice.ts`, that imports nothing from the store (the
store imports the slices, so a slice cannot import `Store`):

```ts
/** The `set` a slice receives: it sees and returns its own field only. */
export type SliceSet<K extends string, S> = (fn: (state: Record<K, S>) => Record<K, S>) => void

/** Merges a partial into the slice's field. */
export function patcher<K extends string, S>(set: SliceSet<K, S>, key: K): (next: Partial<S>) => void

/** A boolean field kept in localStorage: a setter and a toggle that writes what it flips. */
export function persistedFlag<K extends string, S, F extends keyof S>(
  set: SliceSet<K, S>, key: K, field: F, storageKey: string,
): { set(on: boolean): void; toggle(): void }
```

- The nine `type SetStore` become `SliceSet<'view', ViewState>` and so on.
- The five hand-written `patch` become `patcher(set, 'view')` etc. The
  computed key widens to `string`, so `patcher` holds the one `as Record<K, S>`
  of this section, with a one-line comment. The repository rules forbid `any`
  and `!`, not `as`.
- `persistedFlag` writes `'open'`/`'closed'`, the values `REPORT_KEY` and
  `SETTINGS_KEY` hold today. It replaces `setReport`/`toggleReport` and
  `setSettings`/`toggleSettings` in `ui.slice.ts`. The initial reads stay in
  the slice, because they differ: the report defaults closed
  (`=== 'open'`), the settings default open (`!== 'closed'`) and are closed
  on a narrow band.
- The toggle reads inside the update (`set((state) => …)`), like
  `toggleSolo`: the button and the key can both fire before a render.
- Slices whose `set` returns `state` unchanged (`result.slice.ts`) keep
  doing so; `Record<K, S>` accepts it.

**Proof.** The existing slice and persistence tests pass unchanged.
`state/slice.test.ts` checks that `patcher` leaves the other fields'
references alone, and that `persistedFlag`'s toggle flips and writes twice
in a row without a render between.

## C. One source per rule

1. **`specOf`.** `state/params.slice.ts` exports its `Map`-based `specOf`.
   `console/KnobPanel.tsx` and `simple/SimplePanel.tsx` import it and drop
   their `PARAM_SPEC.find` copies; `console/StartKnob.tsx`'s `MIX_SPEC`
   becomes `specOf('mix')` at module level, and its IIFE and comment go.
2. **`autoHeadWidth`.** `packages/engine/geometry.ts` exports the rule
   `pieceShape` applies today, in the same arithmetic:

   ```ts
   /** The head width drawn when it is set to 0: a stick from a stroke of half a cell up. */
   export function autoHeadWidth(width: number, cell: number): number {
     return width >= 0.5 * cell - 1e-9 ? width : 0.4 * cell + 0.9 * width
   }
   ```

   `pieceShape` calls it, so its floats do not change
   (`fingerprints.test.ts` and `node-smoke.mjs` must stay green). `mod.ts`
   exports it. The lab's `console/viewFields.ts` keeps its own function under
   a new name, `autoHeadChip`: it calls the engine's with `cell = 1`, then
   snaps to the field's step and clamps to its range.

   The engine's `1e-9` is a float tolerance in drawing units, not part of
   the rule: whether a stroke within 1e-9 of 0.5 draws a stick depends on the
   cell size the element draws at, which follows the zoom. So no chip can
   match the element in that window, and no test pins it; the tests stay on
   both sides of 0.5.
3. **`dict.locale`.** `Dict` in `packages/engine/lab-i18n.ts` gains
   `readonly locale: 'pl' | 'en-GB'`. `library/BoardColumn.tsx`,
   `library/BoardList.tsx` and `stage/useRunState.ts` read it, and so does
   the dictionary's own `fmt`, which writes the same mapping with `'en'`.
4. **`BoardFile` without casts.** The engine adds, next to `decodeBoard`:

   ```ts
   /** `decodeBoard`, and the same `file` object typed as the board file it was checked to be. */
   export function decodeBoardFile(file: unknown): { board: BoardData; file: BoardFile }
   ```

   It returns the object it was given, not a rebuilt one: `useViewSave` sends
   the stored file back to the store untouched. The narrowing comes from an
   assertion function over `readHeader`'s checks, not from a cast.
   `library/openStoredBoard.ts` calls it; `StoredBoard.file` in
   `state/result.slice.ts` becomes `BoardFile`; the casts in
   `library/BoardColumn.tsx` and `library/useViewSave.ts` go.
   `library/readBoardFiles.ts` is untouched: it re-encodes on purpose.
5. **`WorkspaceTab`** moves to `state/ui.slice.ts`, next to `BoardsPanel`.
   `routes/Workspace.tsx`, `console/Console.tsx` and `shell/SheetBar.tsx`
   import it from there.

The lab reads the engine from `packages/engine/dist/`, so the engine half of
items 2–4 lands first and `pnpm nx build engine` runs before any lab task
that imports the new exports.

**Proof.** `viewFields.test.ts` keeps its check against `pieceShape` on both
sides of 0.5, now through `autoHeadChip`. An engine test checks
`autoHeadWidth` against `pieceShape` directly, and one checks that
`decodeBoardFile` returns the same object and throws what `decodeBoard`
throws. A test pins `(1.5).toLocaleString` under `dict.locale` for both
languages. `neutral.test.ts` covers the engine files touched.

## D. The small ones

- **Workspace class string.** The five nested template conditionals in
  `routes/Workspace.tsx` become a local array joined with `' '` after
  `filter(Boolean)`. No `cx()` helper: this is the only site left. The
  layout tests that read `solo`, `sheet-*` and `presets-top` pass unchanged.
- **`params.broken`.** Measured: with `Lmax` at 5 (the `lmaxHole` rule) the
  `Lmax` knob's pure child `KnobTrack` is called once when `W` is edited; a
  valid knob (`W`) is called 0 times when `H` is edited. So `indexesOf` takes
  the previous indexes and keeps a key's previous array when its violations
  are equal field by field, `value` and `need` included: the row prints them,
  and `need` of the `straightFloor` rule moves with `W` and `H`, so a compare
  on `kind` and `key` alone would leave a stale bound on screen. The probe's case becomes the
  guard, with the valid knob as the negative control and an edit of `Lmax`
  itself as the positive one.

## Behaviour changes

- `useRunState` and `dict.fmt` format with `'en-GB'` instead of `'en'`. Both
  give the same digits and grouping; the locale test pins it.

## Out of scope

- The React Compiler (refactor 11): after this PR, so its measurement starts
  from the narrowed subscriptions.
- Any subscription that stays whole above.

## Docs

`lab-review.md`: the rows above move to fixed or closed with a note, the
`'on' : 'off'` row points at `feb59ab`, and `BoardFrame` memo keys is marked
obsolete with the reason.
