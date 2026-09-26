# Lab structural refactors: view schema, row shell, hotkeys and dismiss

Refactors 2–4 of `lab-review.md` ("Refactors worth doing"), re-measured at
`71065e3` (`lab/glossary`). Refactor 1 already landed (`a2f60e0`).

Three stacked pull requests, each on the previous one:

| PR | Branch | Base | Scope |
|---|---|---|---|
| 1 | `lab/view-schema` | `lab/glossary` (#114) | one view schema, `view.apply()`, link codec without legacy, store without `viewVersion` |
| 2 | `lab/row-shell` | `lab/view-schema` | one row shell, one id rule, rows out of `ViewPanel.tsx` |
| 3 | `lab/hotkeys-dismiss` | `lab/row-shell` | one hotkey table, `useDismiss`, side effects out of `App.tsx` |

The order is forced: PR 2 derives row ids and metadata from PR 1's schema.

## Goal

A later change touches one place instead of many: a new view field is one
schema entry and one metadata entry; a change to row markup or accessibility
is one component; the order of global keys is one table.

## Behaviour contract

Unless a section below lists an intended change, the lab behaves exactly as
before. The existing browser tests are the proof: each PR's refactoring
commits pass them with no assertion edits. Where a PR changes a contract
(PR 1's link format, PR 2's ids), the change lands in its own commit first,
with the tests updated in that commit only, and the refactor follows on the
updated tests.

There are no production links or boards: backward compatibility with links
and stored metas written before this work is not a goal.

Out of scope: ⌘K rows for the colour, point and margin fields (a parity gap,
item 4 of the review), `OptionSwitch` (a rowless option in the run column,
not a panel row), the CSS refactor (review item 5).

## PR 1 — one view schema

### Units

- **`apps/lab/src/state/viewSchema.ts` (new).** `VIEW_SCHEMA`: a record with
  one entry per view field (18 today: `cell`, `stroke`, `headWidth`,
  `headHeight`, `top`, `colored`, `rounded`, `highlightLongest`, `voids`,
  `showPoints`, `pointColor`, `pointRadius`, `theme`, `palette`, `paper`,
  `ink`, `highlightColor`, `pad`). Each entry is `{ def, read(raw: unknown):
  T | undefined }`. `read` is the only place a view value is validated and
  normalised:
  - numbers of `ViewNumber` through `viewNumberOf` (text or number, clamp to
    `VIEW_RANGE`, whole fields rounded);
  - `pointRadius` to `POINT_RADIUS_RANGE`, `pad` rounded to `PAD_RANGE`;
  - colours: `#rrggbb`, lower-cased; `''` is "unset";
  - `palette`: `#rrggbb` entries, lower-cased, capped at `PALETTE_CAP`;
  - `theme`: `''` or a name `themeOf` knows;
  - flags: booleans only.

  `read` returns `undefined` for a value it cannot accept. `ViewFields` is
  the one hand-written list of fields; `VIEW_SCHEMA` is a mapped type over
  it, so an entry missing from either fails `tsc`, and the defaults and the
  key list are derived from the record. View numbers reuse `viewNumberOf`'s
  clamp and rounding, but an unreadable value stays `undefined` so the
  caller picks the default.
- **`view.slice.ts`.** The state is `ViewFields` plus actions. New action
  `apply(patch: Partial<ViewFields>)`: every present key goes through its
  `read`, an unreadable value falls back to `def`, and the result is written
  in **one** `set`. Keys absent from the patch are untouched. The existing
  setters stay, as thin wrappers over the same `read`. `addPaletteColor`
  keeps its side effect (turning `colored` on when the palette goes from 0 to
  1 colour).
- **`url.ts`.** `__view` is a full snapshot: `encodeHash` writes every
  schema key, plus `lang` and the carried keys. `decodeHash` is a loop over
  the schema: `read(raw[key]) ?? def`. `HashView` becomes `ViewFields` plus
  `lang?`. The knobs stay at the top level of the hash.
- **`useUrlHash.ts`.** `viewFor` picks the schema keys from the store.
  `applyPayload` is `params.setMany` + `ui.raiseClamped` + one `view.apply`
  + `lang.setLang` when the link names a language (the language stays "absent
  keeps the page's": it is the page's preference, not part of the view).
- **`library/BoardColumn.tsx` `loadIntoLab`.** One `view.apply` with the
  fields it sets today (`cell`, `stroke`, `headWidth`, `headHeight`,
  `rounded`, `colored`, `highlightLongest`, and `top` when the stored `top`
  is above 0). Colours, points, margin and `voids` stay untouched, as today.
- **`console/viewFields.ts`.** `VIEW_FIELDS`, `VIEW_FLAGS`, `VIEW_ROWS` and
  `FLAG_ROWS` merge into one `VIEW_ROWS` record keyed by field: `{ label,
  short, help, unit?, auto?, step? }`. UI metadata stays out of
  `VIEW_SCHEMA`: the schema is state and codec (`state/`), the rows are
  presentation (`console/`). `fieldOf` moves here in PR 2.
- **Engine and CLI.** Delete `VIEW_VERSION` (`packages/engine/command.ts`),
  `BoardMeta.viewVersion` (`packages/engine/types.ts`), and the version
  branch of `fillView` and the `viewVersion` write in `packages/cli/store.ts`.
  `readMeta` keeps filling missing fields with defaults: that is the store's
  boundary check, independent of any version. `packages/cli/boards/` is the
  gitignored real store and is not edited; a meta there that still carries
  `viewVersion` has it spread through unread.
- **`setNumber` stays on `viewNumberOf`.** Its fallback is the CLI's
  (`DEFAULT_VIEW.top` is 0), the schema's is the lab's (top 5): an emptied
  "top" field keeps giving 0. The other setters read through the schema.
- **`fieldOf` goes in this PR**: once the rows are keyed by `ViewNumber`,
  there is nothing for it to look up.

### Intended changes

1. A link field that is missing or unreadable opens on the default, not on
   the page's current value.
2. The old link keys `hilite`, `highlight` and `help` are ignored.
3. A head height of 0 is always literal, in a link and in a stored meta.
4. A link always carries the palette and the colours (`"palette":[]`,
   `"paper":""`).
5. A link and "Load into lab" notify store subscribers once for the view,
   not once per field.

Accepted side effects: the setters normalise what they are given (a
non-hex colour becomes `''` or the default, a hex is lower-cased, an
unknown theme becomes `''`, a non-hex palette entry is dropped), which the
UI never sends; and the hash's key order changes, so Back onto an entry the
old encoder wrote restarts a carve once.

### Tests

- `url.test.ts` and `store.test.ts`: the legacy cases (unversioned links and
  metas, old keys, head height 0 as automatic) are deleted.
- New: every schema field round-trips through `encodeHash`/`decodeHash`; a
  missing or unreadable field decodes to `def`; `apply` notifies subscribers
  exactly once (the `subscribe` counter of `store.test.ts`); `apply` leaves
  keys outside the patch alone; `loadIntoLab` does not touch colours,
  points, margin or `voids`.
- `viewFields.test.ts` follows the merged table.
- Every other lab browser test passes without assertion edits.

## PR 2 — one row shell

### Id rule

A row gets one key, `id` = `<scope>-<state field name>`; the shell derives the
rest:

| Part | Id |
|---|---|
| control | `id` |
| help paragraph | `${id}-help` |
| span label (switch, segmented control, palette list) | `${id}-label` |
| "why" line (knob rows) | `${id}-why` |
| slider end words (simple view) | `${id}-ends` |

What changes:

| Today | After |
|---|---|
| `knob-<key>-desc` | `knob-<key>-help` (`FieldHelp.descId` is deleted) |
| `view-point-radius` | `view-pointRadius` |
| `view-point-color` | `view-pointColor` (also the ⌘K focus target) |
| `view-highlight-color` | `view-highlightColor` |

Section ids (`view-sec-*`, `dep-*`) are not rows and stay. The rename is PR
2's first commit, code and tests together, with nothing else in it.

### Units

- **`console/rows/RowShell.tsx`.** Props: `KnobLine`'s props without `label`
  and `help`, plus `id`, `name`, `helpText`, the label kind (`'for'` renders
  `<label className="kv-lab" htmlFor={id}>`, `'span'` renders `<span
  className="kv-lab" id={`${id}-label`}>`), `title?`, `className?` (`choice`,
  `bad`, `off`) and `after?` (a node between the line and the help
  paragraph: the knobs' "why" line, the theme's swatch strip). The shell
  calls `useKnobHelp` and renders the `kv-row` element. Render order stays
  line, `after`, help paragraph.
- **`useReleasableChip(value, isSpecial, fallback)`** returns `release()`,
  shared by `ValueKnob` and the view's number row (today two copies of the
  `useRef` + `useEffect` pair).
- **`NumberRow`** absorbs `ElementNumberRow`: it takes `id`, `range`, `step`,
  `unit` and an optional `auto`. `ViewNumberRow`, `PointRadiusRow` and
  `PadRow` are one call each.
- **`FlagRow`** takes `{ id, name, title, help, on, onToggle, buttonTitle? }`.
  `SwitchRow` (by view flag) and the simple view's `RandomRow` are calls of
  it; `buttonTitle` keeps the title `RandomRow`'s switch has today.
- **On the shell:** `ValueKnob`, `ChoiceKnob`, `StartKnob`, `NumberRow`,
  `FlagRow`, `ColourRow`, `ThemeRow`, `PaletteRow`, `SkeletonRow`,
  `PositionSlider`: the twelve rows of today, ten components after the two merges above.
- **Files.** The rows move to `console/rows/` (`RowShell`, `NumberRow`,
  `FlagRow`, `ColourRow`, `ThemeRow`, `PaletteRow`, `Section`,
  `ColoursSection`). `ViewPanel.tsx` keeps only the panel. `SimplePanel` and
  `BoardPreview` change imports only.
- **Not on the shell:** `useKnobHelp` users that are not rows
  (`report/StatRowView`, `ReportSummary`, `LongestTable`), `KnobLine` stays
  in `KnobRow.tsx`, `OptionSwitch`.

### Tests

- After the rename commit, every row test (`ViewPanel`, `SimplePanel`,
  `ValueKnob`, `ChoiceKnob`, `StartKnob`, `KnobPanel`, `BoardPreview`,
  `useFocusRequest`, `design/*`) passes without assertion edits.
- New grep guard: outside `RowShell.tsx`, no source under `apps/lab/src`
  writes `className="kv-row` or composes a row id with `-help`, `-desc` or
  `-why`.
- New: `useReleasableChip` releases to the last non-special value, and to
  `fallback` with no history.

## PR 3 — hotkeys, dismiss, side effects

### Units

- **`shell/hotkeys.ts` (new)** holds `isHotkeyRefused`, `usePaletteKey` and
  `WORKSPACE_KEYS`, a table of `{ keys, run }` for `f`/`F` (solo), `Escape`
  (close one layer: sheet, then report, then settings; nothing at XS without
  a sheet), `r`/`R`, `s`/`S`, `g`/`G`, `]` and `[`. `useWorkspaceKeys(
  onWorkspace, control)` registers one bubble-phase `document` listener that
  applies `isHotkeyRefused` and runs the matching row. It replaces
  `useSoloKey`, `useDrawerKeys` and `useRunKeys`, whose keys are disjoint, so
  one listener is equivalent. ⌘K stays its own hook: it must work inside a
  field, so it does not use `isHotkeyRefused`.
- The Escape precedence is stated once, above the table: popovers consume
  their Escape in the capture phase and the palette at its target, both with
  `preventDefault`; the table comes last because `isHotkeyRefused` skips a
  prevented event.
- **`shell/useDismiss.ts` (new).** `useDismiss({ open, inside, onClose,
  refocus?, closeOnFocusOut? })`, while `open`:
  - `pointerdown` outside every `inside` ref closes, without moving focus;
  - `keydown` Escape in the capture phase, with a target inside:
    `preventDefault`, close, focus `refocus`;
  - with `closeOnFocusOut`: `focusout` whose `relatedTarget` is a node outside
    closes.

  Used by `TopBar` (menu), `MoreMenu` and `PresetStrip`
  (`closeOnFocusOut`). `PresetStrip` keeps its own arrow, Home and End
  listener. `CommandPalette` does not use it: it is a modal dialog that closes
  on `mousedown`, excludes its trigger, traps Tab and returns focus on
  unmount.
- **Out of `App.tsx`:** `useStoreSave` to `library/useStoreSave.ts`,
  `useBandReset` to `shell/useBandReset.ts`. `Shell` keeps the hook calls
  and the layout.

### Tests

- `LabLayout`, `bands`, `TopBar`, `MoreMenu`, `PresetStrip`,
  `CommandPalette`, `PaletteModal` and `Workspace` pass without assertion
  edits.
- New unit test: no key appears in two rows of `WORKSPACE_KEYS`.
- New browser test for `useDismiss`: an outside press closes without moving
  focus; Escape inside closes, is prevented and returns focus; Escape outside
  does nothing and is not prevented; `focusout` closes only with the option.

## Gates

Each PR: `pnpm nx run-many -t verify` green; PR 1 also `deno task verify` in
`packages/engine` and `packages/cli`. Each PR ends with a live pass in Chrome
on a copy of the store (`ARROWZ_BOARDS_DIR`): PR 1 a pasted link and "Load
into lab"; PR 2 every panel's `?`, chips and ⌘K jumps; PR 3 every key and
every popover's Escape and outside press.
