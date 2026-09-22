# Lab visual fixes — design

Date: 2026-09-22. Branch: `lab/visual-fixes`, from `main` = `72fd81c`.

Source: the Claude Design project "Arrowz workshop" (`7fc443c6-aaf3-4d37-a380-9812f10110b6`),
file `Implementation review.dc.html` and its overlay `labcss/console-fix.css`, both written
on 2026-09-22 against a **static reconstruction** of the lab shell (the review's author had
no shell and ran neither the build nor the tests). Every finding below was re-checked against
the code on `72fd81c` before it entered this document; where the review and the code
disagree, the code wins and the difference is recorded.

## 1. Scope

In: the ten visual defects P1–P10, a layout-invariant browser test (the review's K1), the
knob-panel layout overlay (the review's nine changes, one of them corrected in §4.4), the
Signal-plane contrast decision (§5), and the touch targets the review lists.

Out: the code notes K2–K8 (comment length, `@layer`, the three `element={null}` routes,
`RunStatusBar` as a pure function, the `<b>` in the dictionary, the two clamp paths, the
token drift against the design system). They are maintenance, not defects, and would turn a
visual PR into a refactor.

## 2. Findings, as verified

| Id | Review says | Code says | Verdict |
|---|---|---|---|
| P1 | `.fw-vh` is `position: absolute` with no positioned ancestor, so the 1px box lands at its static position in the initial containing block and the document scrolls | `console.css:210`; no `position` on `.fw-k`, `.fw-grid`, `.fw-knobs`, `.fw-console`, `.fw-lab`, `.fw-view`, `.fw > main`, `.fw`, `html`, `body`. Users: `ValueKnob.tsx:88`, `ChoiceKnob.tsx:63`, `StartKnob.tsx:63`, `ViewPanel.tsx:249`, `StatsTable.tsx:49` (inside `.fw-report`, also unpositioned) | confirmed |
| P2 | `.fw-lab` has three row tracks and five children | `console.css:461-465` three tracks; `Workspace.tsx:73-79` children: strip, stage, console, clamp region, violations. The clamp region is **always** mounted (`ClampNotice.tsx:64`), violations only when there are some — four or five children. The stage row's floor is 180px, the board needs 292 | confirmed, corrected count |
| P3 | report column fixed at `22rem`; delta drifts from its value | `shell.css:166`; `report.css:13-24` `width: 100%`, no column widths | confirmed |
| P4 | sticky `edited` marker covers the last chips | `run.css:241-248`, `PresetStrip.tsx:58`; the top bar drops the preset name in exactly that state (`TopBar.tsx:45-49`) | confirmed (padding is 10px + 16px, not 26px on one side) |
| P5 | knob value hangs off a wrapped label | `console.css:143-148` flex baseline, `:381-386` row centre, `:375-380` grid gap `0 24px`, `:139-142` card padding `8px 0` | confirmed |
| P6 | detail buttons lie on the command | `library.css:119-126` sticky buttons; but the command is `figure.fw-cmdfig` > `pre.fw-cmd`, the **first** child of the scrolling `.fw-lib-detail`, not of the buttons box (`BoardDetail.tsx:132-175`) | partly: the overlap is sticky-over-scrolled-content, to be measured live |
| P7 | empty store leaves an empty 168px rail | `console.css:518-520`, `SizeChips.tsx:24-25`, `BoardList.tsx:50-53` | confirmed |
| P8 | shell needs 472px, else scrolls sideways | `.fw-top` (`shell.css:81-88`) has no `min-width`, `overflow` or wrap; `flex: none` only on the mark and the segmented groups | partly: cause confirmed, the 472/572 numbers are the reconstruction's |
| P9 | four buttons keep the UA look | `.fw button` (`shell.css:43-49`) sets no background or border. Unstyled: "add colour" (`ViewPanel.tsx:214`), Refresh (`BoardList.tsx:46`), Load (`BoardDetail.tsx:168`), and Delete **when unarmed** (`:171`). Armed Delete sets `border-color` with no border width or style (`library.css:130-134`) | confirmed, plus two |
| P10 | `.fw-board` background reads a property it can never see | `shell.css:190-200`, and its comment says so | confirmed |

Extra finding (verifier): `.fw-palette-remove` (0,1,0) sets `color: var(--mist)` and loses it to
`.fw button` (0,1,1) `color: inherit`.

Contrast (review's table, recomputed from the tokens): `--void` on `--signal` 4.08:1;
`--signal` on `--void` 4.08:1, on `--graphite` 3.81:1; `.sep` at `opacity: 0.5` and `.dims`,
`.preset` at `0.8` fall below that. Every `--signal` use in the stylesheets is listed in §5.

## 3. Rulings

**R1 — One invariant test, written red first.** A browser test mounts the whole app over a
matrix of states × viewports and asserts: the document scrolls on neither axis; the board lies
inside its wrap's content box whenever the lab face is on screen; sibling children of
`.fw-lab` and of `.fw-lib-detail` do not overlap; no `button` keeps the UA `outset` border;
every `aria-describedby` token resolves to an element; every visible text run clears 4.5:1
(disabled controls exempt, as WCAG exempts them). Each fix below adds its failing cases to it
before the fix lands.

**R2 — The minimum supported width is 420px**, the narrowest the review measured. The matrix
includes 420×900.

**R3 — P1 is fixed by giving the scrolling panels a containing block**: `position: relative`
on `.fw-knobs` and `.fw-report`. Not on `.fw-k`: `.fw-kdesc` (§4.4) is not inside a card.

**R4 — P2 is fixed in the lab's row template**, not by moving the violations. The clamp region
and the violations get explicit `auto` tracks, each capped by its own `max-height` with its own
scroll, and the stage row's floor becomes the board's 292px above 700px of height (below it the
existing `max-height: 700px` rule already gives the board's minimum up).

**R5 — P4: the `edited` marker moves to the top bar**, into the slot the preset's name leaves.
The preset strip loses the sticky marker entirely.

**R6 — P9: one class, `.fw .fw-btn` in `shell.css`, dresses the four buttons.** The review
proposed a contextual rule; a class is chosen instead because "add colour" moves into the
colours card (R8), and a context selector would have to follow it there. `.fw .fw-btn` is
(0,2,0), above `.fw button` (0,1,1). No change to `.fw button` itself: a background or border
there would outrank every single-class button rule (`.fw-palette-remove` is (0,1,0)) and
undress them. `.fw-palette-remove` gains the `.fw` prefix so its colour stops losing to
`color: inherit`.

**R7 — Descriptions leave the cards** (the user chose the review's variant over keeping
them). Each panel heading carries a `dl.fw-kdesc` listing its controls' descriptions, each `dd`
with an id; the card keeps `p.why` for the state alone. Every control's `aria-describedby`
names both ids, so Ruling 9 of 2026-09-13-lab-run-triggers still holds: the help switch hides
descriptions from the eye (`fw-vh` on the list), never from the accessibility tree, and never
hides a state.

**R8 — The preview panel gets four sections**: geometry (the five numbers), drawing (rounded,
colored, hilite, voids — one card), points (show points, dot colour, dot radius) and colours
(theme, background, drawing colour, custom palette — one card with a label column and a
control column). The colours card ends `.fw-k` inside `.fw-k`.

**R9 — P10 deletes the dead declaration** and leaves `background: var(--paper)`.

**R10 — P7: an empty or unreachable store drops the library console to one column.**

## 4. Knob-panel layout (the overlay, as adopted)

1. `.fw-grid { align-items: start; gap: 18px 24px }`, `.fw-k { padding: 0 }`. Spacing scale:
   12px between rows in a card, 18px between cards, 28px between sections.
2. `.fw-k .top` and `.fw-k .row` are one grid, `minmax(0, 1fr) minmax(88px, auto)`, centred.
3. Controls end on one axis: `justify-self: end`; number boxes 88px; a select is as wide as it
   needs, never less than 88px.
4. **Corrected:** the review sends "the description" to `.fw-khd span`. In the code a
   description belongs to one knob (`ValueKnob.tsx:88`) and `ViewNumberField` has none — only a
   help paragraph for two fields. R7 replaces this with a per-panel `dl.fw-kdesc`.
5. Section headings in the preview (R8); `.fw-khd` becomes one column, the title above its
   description.
6. The four drawing flags as one card-list (`.fw-k.fw-flags`, full row); the fifth flag,
   `showPoints`, moves to the points section (R8).
7. The colours card (`.fw-k.fw-colours`, full row, two columns).
8. The palette's remove button: no border, `--ash`; hover or focus make it a button.
9. P9's class (R6).

## 5. The Signal plane (the open §7.1 item, decided)

No text is set **in** `--signal`, and no text sits **on** `--signal`: at #5e6ad2 the colour has
a luminance at which neither `--void` (4.08:1) nor `--ink` (4.05:1) clears AA.

New tokens, replacing `--signal-hover` and `--signal-press`:

| Token | Value | `--ink` on it |
|---|---|---|
| `--signal-fill` | `#4c57be` (the old `--signal-press`) | 5.31:1 |
| `--signal-fill-hover` | `#5561c8` | 4.61:1 |
| `--signal-fill-press` | `#434eb0` | 6.13:1 |

- Planes carrying text use `--signal-fill` with `--ink` text: the top bar, the selected rail
  tab, a checked segmented option, the current preset chip, Generate (and its hover and press).
- Values set in `--signal` become `--ink`: `.fw-k .num`, `.fw-k select`,
  `.fw-k input[type='number'].num`. `.fw-pal .row .v` becomes `--mist`.
- `--signal` stays where there is no text: slider track and thumb, the switch's on state, the
  inline entry's border, the flash outline, the focus ring (4.08:1 against `--void`, above the
  3:1 a focus indicator needs), the selected tab's underline, the current library row's border.
- The top bar's `opacity` dimming goes: `.sep`, `.preset`, `.dims` print at full `--ink`.

## 6. Touch targets (spec §7.2: 44px where there is no hover)

Under `@media (pointer: coarse)`: `.fw-k .num` and `.fw-k select` 44px (today 32);
`.fw-palette-remove` 44×44 (today 18 everywhere; 22 on fine pointers); `.fw-sw` 32×52 with the
row carrying the rest; the library's chips, rows, head button and detail buttons, and the docs
navigation links, 44px.
