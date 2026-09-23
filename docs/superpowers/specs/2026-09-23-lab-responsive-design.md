# Lab: responsive layout (handoff 2, PR 7)

Date: 2026-09-23. Branch `lab/responsive`, stacked on `lab/saved-boards` (#99).
Source: HANDOFF-2 §7 and `css/rwd.css` / `css/boards.css` of the round-2
package (Claude Design, kept outside the repository). The package's layout is
the target, with no flag: its `.fw.rwd` selector becomes `.fw`, and its
`RWD on/off` tweak is not ported.

## 1. Decisions (user, 2026-09-23)

| # | Decision |
| --- | --- |
| D1 | One PR for all bands (XL/L/M/S/XS and the low window). |
| D2 | In a low window the preset strip is rendered inside the top bar: one `PresetStrip` instance, placed by a `matchMedia` hook. |
| D3 | Below 1024px the settings drawer starts closed and closes when the window crosses into that range, without writing the remembered preference. |
| D4 | The saved boards follow the lab's rules: the open board's column (`.fw-run-col.fw-bcol`) becomes the bar under the board at M/S, and a sheet at XS. |

Approach: CSS owns the layout; the components know only the band. Every new
element (`SheetBar`, the menu chip, the `…` button and its popover container)
is always in the DOM and shown or hidden by media queries, as the package
does. JavaScript reads the band for three things only: where `PresetStrip`
stands (D2), resetting transient state when the band changes, and the settings
drawer's start state (D3). Conditional mounting is avoided because a sibling
that appears or vanishes shifts `Stage` and remounts `<arrowz-board>`
(`routes/Workspace.tsx`, Ruling 6).

## 2. Bands

| Band | Width | Layout |
| --- | --- | --- |
| XL | ≥ 1600 | as today (PR 1): settings drawer, board, run column, report handle |
| L | 1280–1599 | run column `18rem`; settings drawer `--ls-w: clamp(24rem, calc(33vw + 100px), 34rem)` |
| M | 1024–1279 | the right column becomes a bar under the board; the open settings drawer pushes the board and the bar |
| S | 768–1023 | as M, but the open drawer lies over the board (`--ls-w: min(calc(100vw - 112px), 28rem)`); closed at start (D3) |
| XS | < 768 | one column; Settings / CLI / Report (saved boards: Boards / Board / Report) as bottom sheets |
| low | height < 700 and width ≥ 768 | the preset trigger stands in the top bar (lab tab, advanced view) |

Measured in the package with the drawer open, board width before → after:
1440: 401 → 501, 1024: 183 → 440, 768: 44 → 678, 375: 2 → 359. These are the
floors the layout test holds (§7).

## 3. CSS

The package's rules move into the sheets it names, not as new files:
`design/shell.css` (stage bands, top bar, menu, sheet bar), `design/console.css`
(drawer widths, settings sheet, knob touch sizes), `design/run.css` (the bar,
the `…` popover), `design/library.css` (the board column's bar and sheet).

Adaptations while moving:

- `.fw.rwd` → `.fw`.
- `:not(.library)` is dropped wherever the rule is about `.fw-run-col`, so
  `BoardColumn` (`className="fw-run-col fw-bcol"`) takes the same bar and
  sheet (D4). It stays where the rule is about the preset strip, which the
  saved boards do not have. `.fw-lab.library .fw-stage > .fw-run-col:not(.fw-bcol)`
  (console.css) keeps the lab's run column hidden on the saved boards in every
  band.
- At M/S the board's facts (`.fw-bmeta`) are hidden in the bar and shown again
  in the XS sheet (`library.css`, from the package's `boards.css`).
- The PR 1 stopgaps are deleted, not overridden: the `max-width: 1279px` and
  `max-width: 900px` stage templates in `console.css` (the bands replace them).
  The `min-width: 1024px` block that pads the board by the open drawer stays:
  it is the push of XL, L and M. In `run.css` the `max-width: 1479px` preset
  panel columns stay, and the `max-width: 600px` two-column panel is deleted
  (the XS list replaces it). The `max-height: 700px` rules stay: they lower
  the board's floor, which is not a band.
- The handle tracks read one custom property, `--hd` (28px, 44px under a
  coarse pointer), so every band keeps a finger's handle on a touch tablet
  instead of each band restating the coarse template.
- Every rule that sets `display` on an element that carries the `hidden`
  attribute is paired with `[hidden] { display: none }` for the same selector
  (the package's preset panel broke on XS exactly that way).
- Solo keeps winning in every band: the solo rules' specificity is checked
  against every new stage rule, and the layout test measures solo in each band.

## 4. State and components

**Store (`state/ui.slice.ts`).**

- `sheet: 'settings' | 'cli' | 'report' | null` with `setSheet` and
  `toggleSheet(which)`. Never remembered, never in the hash.
- `menu: boolean` with `setMenu` and `toggleMenu`. Never remembered, never in
  the hash. It lives in the store because its class, `menu-open`, belongs on
  the root `.fw` (`App.tsx`).
- `settings` starts closed when the window is below 1024px at start (D3); the
  remembered value is read only at 1024px and above. The start value is read
  from `matchMedia` in `createUiSlice` (guarded like `readStored`: with no
  `window.matchMedia`, as in the `node` project, the remembered value
  decides), so every test that mounts the app at
  the harness's default 414×896 starts with the drawer closed: the fixtures
  that relied on it being open set it (or the viewport) explicitly.

**Band hook (`shell/useLayoutBand.ts`, new).** `useSyncExternalStore` over
`matchMedia` lists for the five width bands and the low query. It returns
`{ band: 'xl' | 'l' | 'm' | 's' | 'xs', low: boolean }`. It knows neither the
store nor the DOM beyond `window.matchMedia`.

**Band change (`App.tsx`).** One effect keyed on `band` and `low`, comparing
with the previous value it saw (so StrictMode's second mount pass is not a
change): on a change it clears `sheet` and `menu`; entering a band below
1024px closes the settings drawer with a patch that does not call
`writeStored` (D3); entering 1024px or more from below restores the
remembered value, so the desktop preference comes back. The `…` popovers
remember the band they were opened in and read as closed in any other.

**`shell/SheetBar.tsx` (new).** A `nav` labelled from the dictionary, three
buttons with `aria-pressed` and `aria-controls` (the settings panel, the right
column, the report). Labels: Settings / CLI / Report on the lab, Boards /
Board / Report on the saved boards. Rendered by `Workspace` after `Stage`,
never on the docs route. Pressing a button toggles `ui.sheet`.

**`stage/Stage.tsx`.** `.fw-lab` (in `Workspace`) gains `sheet-<name>` while a
sheet is open; the drawer handles are hidden at XS by CSS.

**`shell/TopBar.tsx`.** A `menu ▼` chip (`aria-expanded`, `aria-controls` on
the right group) toggles `ui.menu`. The ⌘K button carries two labels: the key
(`k-key`) and a word for touch (`k-touch`); CSS shows the word at XS. The
word is "command palette" / "paleta poleceń", not the package's "commands":
the button's accessible name, "Command palette (⌘K)", must contain the
visible text (WCAG 2.5.3, the rule PR 4a's Ruling 8 applies to the top bar). In the low band, advanced view, lab tab, the top bar renders the preset
strip; `Workspace` renders it only when the top bar does not (D2). The strip's
open panel is lost when it moves, as in the package.

**`run/RunColumn.tsx` and `library/BoardColumn.tsx`.** A `…` button
(`fw-more`, `aria-expanded`, `aria-controls`) and a popover container
(`fw-more-pop`) around the switches and the exports. Open state is a local
`useState`. Outside M/S the container is `display: contents` and the button
`display: none`, so the column reads as today.

**Dictionary (`packages/engine/lab-i18n.ts`).** New strings in English and
Polish: the menu chip, the touch label for ⌘K, the sheet bar's name and its six
labels, the `…` button's name. The lab reads the dictionary from `dist`, so
the engine is rebuilt before any look at the page.

## 5. Touch sizes

The repository already raises every control for a finger under
`(pointer: coarse)` (PR 2, PR 4, PR 6), with the package's XS values almost
everywhere (row 52, track 44, select 40, `?` and chip 32, dependent header
48). XS joins those blocks through a media query list,
`@media (pointer: coarse), (max-width: 767px)`, rather than repeating them.
Where the package differs, the repository's ruling stands: the switch stays
36×18 with a 44×44 `::before` target (PR 4), not the package's 48×26. Only
what has no coarse counterpart is XS-only: 14px row text, the hidden range
ends (`.mn`, `.mx`), the rail as a row of chips, Generate at 44px. At M/S
under a coarse pointer the bar's controls are 44px tall, not 32.

## 6. Keys

`useDrawerKeys` (`App.tsx`) keeps one listener that closes one layer per
Escape. The new layers come first:

1. the `…` popover and the menu consume their own Escape in a capture-phase
   listener, as the preset panel does (`run/PresetStrip.tsx`), and hand the
   focus back to their button;
2. an open sheet closes (`ui.sheet = null`);
3. then as today: report, then settings.

At XS the drawers are shown only as sheets, so `r` and `s` toggle the report
and settings sheets instead of the drawers, and Escape with no sheet open
changes nothing (a remembered `report: true` is invisible at XS and must not
be closed by a key the user cannot see act).

## 7. Tests

- `routes/LayoutInvariants.browser.test.tsx` (loads every sheet): a matrix of
  1920×1080, 1440×900, 1280×800, 1024×768, 924×540, 768×1024, 600×900,
  375×812, on the lab and the saved boards, drawer closed and open. Invariants:
  no horizontal document scroll; board ≥ 320px wide from 768 up; no `.kv-lab`
  clipped; at XS every control in the open sheet ≥ 44px tall as a target;
  `.fw-top.scrollTop === 0` after opening the presets; the board-width floors
  of §2; solo fills the lab panel in every band; the preset panel and every
  `[hidden]` element in the matrix have no box.
- `design/touch.browser.test.tsx` (exists): its cascade reader asks for rules
  whose condition names `pointer: coarse`, which the joined query list still
  does; new rows pin the XS-only sizes and the M/S coarse bar.
- Unit / component: the band hook against stubbed `matchMedia`; the slice's
  `sheet`, `menu` and start value of `settings`; the band-change effect (clears
  sheet and menu, closes settings below 1024 without writing storage, leaves a
  remembered `open` for a wider window); the Escape chain with every layer
  open; `r` / `s` at XS; `SheetBar` labels on both tabs and absence on docs;
  `PresetStrip` in the top bar in the low band and in the lab otherwise, never
  both; the `…` popover's `aria-expanded` and focus return.
- The `node` project's CSS pins (`design/*.test.ts`) are updated with the moved
  and deleted rules.
- A live run in Chrome at all eight sizes, in both languages, before the PR:
  Polish text is longer than the package assumes.

## 8. Out of scope

From the package's "after migration" list: the board annotation running under
⛶ on a narrow board, the `trap bias` select's "no change" reaching the arrow,
and the Claude Design project's `CLAUDE.md` note about text on the accent.
