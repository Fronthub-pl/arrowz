# Lab refactors 6, 8 and 9

Three structural refactors from `lab-review.md` ("Refactors worth doing"),
shipped on one branch, `lab/refactors-6-8-9`, as one PR with the commits
grouped by refactor.

The goal is fewer places that can drift apart and a state machine that can be
tested without a browser. What a person sees does not change, except for the
three changes named under "Behaviour changes".

## A. Refactor 6, the rest: one command figure, one copy

The export half of refactor 6 is done (`useSvgDrawing`, `SavedExports`, #129),
and `loadIntoLab` already goes through `view.apply`. Two duplications are left.

- `library/BoardColumn.tsx` has its own `copy`: clipboard, `copied`, a 1.2 s
  `timer` and its unmount cleanup. This is a copy of `run/useCopy.ts`.
- The command block `figure.fw-cmdfig > figcaption.fw-cmdhd > pre.fw-cmd` with
  `<CommandText>` is written three times: `run/LiveCommand.tsx`,
  `library/BoardColumn.tsx` and `library/FileColumn.tsx`.

**Design.** A new `run/CommandFigure.tsx`:

```tsx
export function CommandFigure({ label, caption, command }: {
  label: string    // the figure's aria-label
  caption: string  // the visible caps caption
  command: string
}): ReactElement
```

It renders the figure with its `aria-label`, the caption, a Copy button that
reads Copied (both through `useCopy`), and `<pre className="fw-cmd"><CommandText/></pre>`.
The `<figure>` rationale in `LiveCommand`'s header (a `<pre>` has no role and
cannot be named) moves to `CommandFigure`.

- `LiveCommand` passes `commandHead`, `cliLabel` and the built command.
- `BoardColumn` and `FileColumn` pass `boardCommand`, `cliThisBoard` and
  `meta.command`. `BoardColumn` drops `copy`, `copied`, `timer` and the
  cleanup effect. `armed` stays, and it has no timer.

## B. Refactor 8: `openStoredBoard`

`library/useStoredBoard.ts` is one effect with five exits. Each has its own
rule for the preview and the `loading` notice:

1. **A file is open** (`/boards/file`): clear a preview whose origin is
   `store`, and clear the notice only if it is `loading`.
2. **No address:** clear the preview and `boardFailed(null)`, and clear the
   notice only if it is `loading` or `saveFailed`.
3. **Not in the listing:** before the listing arrives (`metas === null`), wait
   and do nothing. After it arrives: clear the preview,
   `boardFailed({ name, reason: null })`, and clear the notice.
4. **Already drawn** (the preview is `store` and has this id): clear the notice
   only if it is `loading`.
5. **Fetch:** `boardFailed(null)`, then notify `loading`, then read. A result
   that arrives after cancel writes nothing. A failed read and a failed decode
   both clear the notice and the preview and call `boardFailed` with the
   reason. Success clears the notice and shows the preview.

**Design.** A new `library/openStoredBoard.ts`:

```ts
export function openStoredBoard(
  address: { size: string | null; id: string | null; file: boolean },
  metas: BoardSize[] | null, // `BoardSize` from `@arrowz/engine`, `FileOutcome` from `api/boards`
  read: (size: string, id: string) => Promise<FileOutcome> = readStoredBoard,
): () => void
```

- It carries the five exits unchanged, one named block each. Their "why"
  comments move with them.
- Synchronous exits return a no-op cancel. The fetch returns the function that
  sets `cancelled`.
- `useStoredBoard` keeps reading the address (`useOpenBoard`) and `metas`, and
  its effect becomes
  `useEffect(() => openStoredBoard({ size, id, file }, metas), [size, id, file, metas])`.
- The header comment stays on the hook (the address is the selection), and
  the rules move to the function.

**Tests.**
- A new `library/openStoredBoard.test.ts` runs in the `node` project. `read` is
  a controllable promise, and the boards are `storedFixture` and `sizesFixture`
  (`state/library.fixtures.ts`, a real `generate`), so `decodeBoard` runs for real. Cases:
  - each of the five exits, including waiting while `metas === null`;
  - a result that arrives after cancel writes nothing;
  - A, then B, then back to A while B is in flight: "Loading B" is cleared and
    `viewSaved` survives;
  - a board dropped from the listing while its read is in flight: `loading` is
    cleared;
  - a failed read and a failed decode read alike;
  - a delete's `deleted` notice survives exit 2.
- `useStoredBoard.browser.test.tsx` stays as the integration guard.

## C. Refactor 9: one roving-focus helper

Four strips implement the same roving-tabindex pattern by hand:

| Component | Keys | Wraps | Home/End |
| --- | --- | --- | --- |
| `shell/TabRow.tsx` | ← → | yes | first / last |
| `console/GroupRail.tsx` | ↑ ↓ | yes | first / last |
| `library/BoardsRail.tsx` | ↑ ↓ | yes | first / Preview (the last entry) |
| `shell/Segmented.tsx` | ← → ↑ ↓ | yes | first / last |

Each of them also focuses the selected button from an inline ref callback when
the strip already holds the focus. An inline callback is a new function on
every render, so React detaches and re-attaches it, and `focus()` runs on every
render while the strip has focus, not only when the selection changes.

`palette/CommandPalette.tsx` moves its active row with ↑ ↓ Home End and clamps
at the ends. It points at the row through `aria-activedescendant`, not DOM
focus.

**Design.** A new `shell/roving.ts`:

```ts
export function nextIndex(
  key: string,
  current: number,
  count: number,
  options: { axis: 'horizontal' | 'vertical' | 'both'; wrap: boolean },
): number | null

export function useFocusFollowsSelection<T>(selection: T): RefObject<HTMLButtonElement | null>
```

`nextIndex` rules:
- It returns `null` for a key that is not on the axis and not Home or End, and
  for `count === 0`.
- Home gives 0, and End gives `count - 1`.
- "Forward" (→ on `horizontal`, ↓ on `vertical`, either on `both`) gives
  `current + 1`, and "back" gives `current - 1`. At the ends it wraps or
  clamps, as `wrap` says.
- `current === -1` (nothing selected): forward gives 0, and back gives
  `count - 1`.
- A `current` past the end is clamped first.

`useFocusFollowsSelection` returns a ref for the selected button. A
`useLayoutEffect` on `[selection]` focuses it only if its parent element
already contains `document.activeElement`: the same guard as today, so a
selection made from elsewhere does not pull the focus in.

Users:
- `TabRow`: horizontal, wraps.
- `GroupRail` and `BoardsRail`: vertical, wraps.
- `Segmented`: both axes, wraps.
- `CommandPalette`: `nextIndex` only, vertical, no wrap.
- `PresetStrip` stays as it is. Its 2-D grid has columns of different lengths
  and Home/End only on rows, which does not fit a 1-D helper.

**Tests.**
- A new `shell/roving.test.ts` (node) holds a table of `nextIndex` cases.
- The existing keyboard tests guard the users: `TabRow`, `GroupRail`,
  `Segmented`, `CommandPalette`, and `LibraryFace` for `BoardsRail`.

## Behaviour changes

1. **`FileColumn` gets a Copy button** on its command, like the saved board's.
   A browser test checks that it copies `meta.command`.
2. **`BoardsRail`, nothing selected, ↑:** it now goes to the last entry
   (Preview) instead of the one before it. Today
   `(−1 − 1 + n) % n = n − 2`. New browser case in
   `LibraryFace.browser.test.tsx`.
3. **`CommandPalette`:**
   - With no hits, ↑ ↓ Home End are no longer swallowed and reach the input,
     where they move the caret: there is no row to move to.
   - An `active` past the end is clamped before ↑, so one press moves up one
     visible row. Today it counts down from the stale index.

## Out of scope

- `PresetStrip` keys.
- Refactors 5, 7 and 11.

## Docs

The refactors table in `lab-review.md` marks 6, 8 and 9 fixed on
`lab/refactors-6-8-9`, and refactor 6 also names #129. Item 3 of "What is
still open" keeps 5, 7 and 11.

## Gate

`pnpm nx run-many -t verify`, run once more at the branch head in a clean
worktree.
