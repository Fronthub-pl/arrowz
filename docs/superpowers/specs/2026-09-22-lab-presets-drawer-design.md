# Lab preset picker, report drawer and run column — design

Date: 2026-09-22. Branch: `lab/presets-drawer`, from `main` = `f89d899`.

Source: the Claude Design project "Arrowz workshop" (`7fc443c6-aaf3-4d37-a380-9812f10110b6`),
file `HANDOFF.md` and the static reconstruction `lab-app.html` with its overlays
(`labcss/presets-fix.css`, `report-drawer.css`, `run-fix.css`, `shell-fix.css`,
`scrollbars.css`). As with the previous review, the author had no shell and ran neither the
build nor the tests. Every claim the handoff makes about the repository was re-checked on
`f89d899`; where the handoff and the code disagree, the code wins and §2 records the
difference. The handoff's CSS lands in the stylesheets it names, never as new files.

## 1. Scope

In: the handoff's five changes — the preset picker (§3), the report drawer (§4), the wider run
column with a flag-wrapped command and a restyled Generate (§5), the top bar's segmented hover
and the scrollbars (§6) — and the tests that pin them (§7).

Out: the handoff's open item "sliders render without a track in the board panel". It is
checked once in the live lab during the final browser pass; if it is only an artefact of the
reconstruction, it stays out. The design project's own `CLAUDE.md` ("text-on-accent = Void")
is the design project's record, not this repository's, and is not edited from here.

One PR, one branch: the changes share `run.css`, `shell.css` and the layout-invariant matrix,
so a stack of four PRs would rebase at every step.

## 2. Handoff claims, as verified

| Handoff says | Code says | Verdict |
|---|---|---|
| Rewrite `PresetStrip.tsx`; `.fw-presets` block in `run.css` | `run/PresetStrip.tsx` (60 lines, a flat strip of 26 chips); `design/run.css:187-238` | confirmed |
| The "edited" text replaces a sticky `.dirty` in the strip | No `.dirty` exists: PR #92 moved the marker into the top bar, `shell/TopBar.tsx:72`, key `presetsDirty` (`lab-i18n.ts:275`, `:705`) | corrected: the marker moves **from the top bar** to the preset row (§3.3) |
| Trigger `aria-haspopup`, panel `role="group"` | The reconstruction's trigger is `aria-haspopup="menu"`; a `menu` popup promises `role="menu"` and menu keyboarding, which a group of buttons does not have | corrected: disclosure pattern, no `aria-haspopup` (§3.1) |
| Column header has no size (user decision) | The handoff's CSS still styles `h3 .size` | the `.size` rules are dropped as dead |
| Shortcut R "where F / g / [ ] are (palette and `Workspace`)" | `f` is `useSoloKey`, `g` and `[ ]` are `useRunKeys`, both in `App.tsx:103-160`, guarded by `isHotkeyRefused` (`App.tsx:83`); the palette only advertises `g` and `[ ]` (`CommandPalette.tsx:222-232`) | corrected: R is a hook in `App.tsx` (§4.3) |
| Drawer state "in `state.ui` like `help`, to survive a reload" | `help` survives through the URL hash (`state/url.ts:15`); `mode` survives through localStorage (`MODE_KEY`, `ui.slice.ts:17`) | decided: localStorage, like `mode` (§4.2) |
| Below 900px, delete the rule moving the report to a second row (`shell.css:303-317`) | `shell.css:303-320`, with the `min(292px, 100%)` floor and the `max-height: 700px` companion rule | confirmed; the companion rule and both comments go too |
| `.fw-lab.solo .fw-stage` (`console.css:679`) | `console.css:674-682` hides `.fw-report` in solo | confirmed; the drawer is hidden in solo (§4.1) |
| `.fw-cmd` changes in `run.css`, `LiveCommand.tsx` | `.fw-cmd` is **shared**: `library/BoardDetail.tsx:144` renders `<pre className="fw-cmd">{meta.command}</pre>`. The handoff's `display: flex; white-space: nowrap` would turn that command into one unbroken line | corrected: one shared renderer (§5.2) |
| Generate: `var(--mono)` | `.fw .fw-go` is `font-family: var(--ui)` (Archivo), `shell.css:370-398` | confirmed |
| Tokens `--graphite`, `--border-strong`, `--signal-fill`, `--mono` | all in `design/tokens.css` | confirmed |

## 3. Preset picker

### 3.1 Structure

`PresetStrip` keeps its name, its place (`Workspace.tsx:73`, advanced lab face only) and the
`.fw-presets` row of 38px. The row holds:

- a trigger button `.fw-pp-trigger`: the caps label `preset`, then either the current preset's
  `level mode` and its `W×H` (`.d`), or `customSettings` (`.none`), then a caret. It carries
  `aria-expanded` and `aria-controls` pointing at the panel; no `aria-haspopup`;
- when `findPreset(values)` is `null`, a sibling `.fw-pp-edited` with `editedSinceLastPreset`;
- when open, the panel `.fw-pp-panel` (`role="group"`, labelled by `presetsLabel`), one
  `.fw-pp-col` per `PRESETS` level (`role="group"`, `aria-labelledby` its `h3`), each row a
  button with the mode (`span`) and `W×H` (`span.d`) from `option.params.W/H`.

Row buttons keep today's accessible name `${levelName} ${W}×${H} ${mode}` and today's
`aria-current` on the matching option; choosing one calls `applyPreset(control, option.params)`
exactly as today (`run/actions.ts`), then closes the panel.

Open state is local `useState` in `PresetStrip`: it is never remembered and never in the hash.

### 3.2 Keyboard and dismissal

- Opening moves focus to the `aria-current` row, or to the first row when there is none.
- ↑/↓ move within a column (no wrap); ←/→ move to the same row index in the neighbouring
  column, clamped to that column's last row; Home/End go to the column's first/last row.
- Escape, a pointer press outside `.fw-presets`, and choosing a row close the panel. Escape and
  choosing return focus to the trigger; an outside press does not steal focus.
- Escape pressed while the panel is open is consumed (`preventDefault`), so the drawer's Escape
  (§4.3) does not also fire.

### 3.3 The "edited" marker leaves the top bar

`TopBar` renders `Arrowz / W×H` and nothing else in that slot: the `showPreset` branch,
`findPreset`, the level lookup and the `.preset` / `.preset.edited` spans go, with their
comments. `presetsDirty` leaves both dictionaries. The preset name now lives only in the
trigger.

The bar's responsive rules from PR #92 (defect P8, `shell.css:105-160`) give width up
`.preset` first — `.fw-top .preset`, `.fw-top .sep:has(+ .preset)` and the comments that
reckon the bar at "572 with a preset named". Every `.preset` branch and its arithmetic go; the
rules left must still keep the bar from scrolling sideways at 420 wide, which the invariant
matrix already checks at `420×900`.

### 3.4 CSS

The handoff's block replaces `run.css:187-238`, minus `.fw-pp-col h3 .size`. Columns: 7 at
≥1480px of window, 4 below, 2 at ≤600px; the 1480 threshold is derived from the widest row
("winding skeleton 400×400") and is recorded in a comment with the instruction to recompute it
when mode names or the font change. `pointer: coarse` raises the trigger and rows to 44px.

### 3.5 Dictionary

New keys, English source and Polish translation, in `packages/engine/lab-i18n.ts`:
`preset` (trigger caps label), `customSettings`, `editedSinceLastPreset`. Polish:
`preset`, `własne ustawienia`, `zmienione od ostatniego presetu`.

## 4. Report drawer

### 4.1 Layout

`.fw-stage` becomes `70px minmax(0, 1fr) 28px` at every width (44px under `pointer: coarse`)
and `position: relative; overflow: hidden`. `Stage.tsx` wraps `ReportPanel` in
`div.fw-drawer` (class `open` when open) whose first child is the handle button
`.fw-drawer-handle` — vertical `report` label and ◀/▶ — with `aria-expanded` and
`aria-controls` on the `section.fw-report`. The drawer is absolutely placed on the stage's
right edge, `width: calc(clamp(22rem, 24vw, 32rem) + 28px)`, `max-width: calc(100% - 70px)`,
translated to show only the handle when closed; the closed report is `visibility: hidden`, so
it leaves the tab order and the accessibility tree. The toggle is the class, never a remount.
180ms transform, none under `prefers-reduced-motion`.

Removed: the ≤900px second-row rule, the `min(292px, 100%)` floor, the
`(max-width: 900px) and (max-height: 700px)` companion, and their comments. In solo
(`console.css:674-682`) the drawer is hidden as the report is today.

### 4.2 State

`ui.report: boolean` with `setReport` and `toggleReport` (read inside the update, like
`toggleSolo`). Remembered in localStorage under its own key through `readStored`/`writeStored`,
like `mode`; never in the hash. Default closed.

### 4.3 Keys

A `useReportKey(onWorkspace)` hook in `App.tsx`, bound wherever the stage is (same gate as
`useSoloKey`):

- `r`/`R` toggles, refused by `isHotkeyRefused`;
- Escape closes an open drawer when not refused and not already `defaultPrevented` (the
  palette and the preset panel consume their own Escape first).

The palette footer gains `R` with a new `cmdHintReport` key (EN + PL), inside the same
`onWorkspace` branch as `g` and `[ ]`.

## 5. Run column

### 5.1 Tracks

`.fw-console`'s third track becomes `clamp(20rem, 22vw, 28rem)`; `.fw-console.library` and the
≤900px rule keep their logic (`console.css:689-712`).

### 5.2 One command renderer

New `run/CommandText.tsx`: given a command string, renders the program prefix
(`COMMAND_PREFIX`) in `--ash`, then each flag as `span.ln` > `span.f` (`--name=`) + `b`
(value), separated by plain spaces in the DOM so selection and Copy give the one-line command.
The split is on the space before `--`; a string without `COMMAND_PREFIX` renders unsplit.
`LiveCommand` and `BoardDetail` both render `<pre className="fw-cmd"><CommandText … /></pre>`.

`.fw-cmd` becomes the handoff's flex-wrap box (break only between flags), `.fw-cmdfig` and
`.fw-cmd` take `flex: 1 1 auto`. The run.css comments on the old floor and on "Ruling 1" are
rewritten to the new layout after re-measuring at 860×900 and 1400×900 that Generate does not
move with the command's length. The library's detail keeps its own sizing (`library.css:107`
area) and is checked at the matrix's `library-detail` sizes.

### 5.3 Generate

`.fw .fw-go`: `var(--mono)`, 500, 13px, `letter-spacing: 0.02em`, 44px high, `flex: none`,
`margin-top: 12px`, focus ring `2px solid var(--ink)` at `-4px`. Colours unchanged
(`--ink` on `--signal-fill`, 5.31:1).

## 6. Small changes (`shell.css`)

- `.fw .fw-top .fw-seg button:not([aria-checked='true']):hover`: background
  `rgba(237, 238, 242, 0.12)`, no underline.
- Scrollbars on `.fw` and descendants: thin, square, thumb `--border-strong`, `--ash` on hover,
  no track or buttons; `scrollbar-width: auto` under `pointer: coarse`. Placed next to the
  `color-scheme: dark` rule.

## 7. Tests

Red first, as in the previous series:

- `routes/LayoutInvariants.browser.test.tsx`: new states `presets-open` and `report-open` over
  the five sizes. Invariants: the preset panel lies inside the viewport horizontally; the open
  drawer does not overlap the console; Generate is not covered at any state; the board's width
  with the drawer closed is at least its old width plus the old report column (measured, not
  assumed).
- `run/PresetStrip.browser.test.tsx`: trigger text for preset and custom states, open/close by
  click, Escape, outside press and choice; focus on open and return; arrow/Home/End movement;
  choosing applies the preset and runs (the existing assertions kept).
- `shell/TopBar.browser.test.tsx`: the slot shows only `W×H`; no "edited" on any face.
- `run/LiveCommand.browser.test.tsx`, `library/BoardDetail.browser.test.tsx`, a new
  `run/CommandText` test: flag spans, Copy text equals the one-line command, a command without
  the prefix is unsplit.
- `state/ui.slice.test.ts` and `state/preferences.browser.test.ts`: `report` default, toggle,
  persistence.
- Hotkeys: R toggles, R in a field does nothing, Escape closes the drawer but not while the
  palette or the preset panel is open; the footer lists R on the workspace only.
- Updated for moved selectors: `run/triggers`, `routes/Workspace` (`:636-641`),
  `routes/LabLayout`, `run/RunColumn`, `design/palette.test.ts:25`.

Gates: `pnpm nx run-many -t verify`, `deno task verify` in `packages/engine` (the dictionary
changed), then a live pass in Chrome with a real mouse at 420, 860 and 1440 wide: preset panel
by mouse and keyboard, drawer by handle, R and Escape, Copy, Generate position with a long
command, and the slider-track open item.
