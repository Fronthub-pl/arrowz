# Lab visual review — 2026-09-22

A read-only review of `apps/lab` against the Claude Design reference project
"Arrowz workshop" (`Arrowz Workshop v2`, its `CLAUDE.md` decisions and
`fronthub-workshop-v2.css`). Measured on `main` at `72fd81c` in a live
browser at 375, 768, 1280, 1440, 1920 and 2560 px wide, across `/` (simple
and advanced), `/boards`, a board detail, `/docs/element`, `/docs/cli` and
the ⌘K palette. Nothing was changed; this document records findings and
proposals only. Line numbers refer to that commit.

## Diagnosis

The lab reads as chaotic, but not because of colour. The colour and font
tokens match the reference value for value, no colour literal lives outside
the tokens, and there are no shadows. The chaos is structural:

1. **No spacing scale.** `design/tokens.css` holds sixteen tokens, all of
   them colours and fonts. Padding and gap take 22 distinct values, with
   roughly 150 px literals across `design/*.css`. Every panel has its own
   inset (knobs 14/20, report 12/16, docs 16/20, library 6/8), so the left
   edges of content never line up.
2. **Two column grids that disagree.** The stage is `70px 1fr 22rem`
   (`shell.css:166`), the console `168px 1fr 216px` (`console.css:9`).
   Vertical panel edges fall at x=70/1087 in the top row and 168/1223 in
   the bottom one; the eye finds no shared axis.
3. **The board gets half the height.** `.fw-lab` splits rows `1fr/1fr`
   (`console.css:463,469`). At 1920 px the board frame is 1464×342, while
   the "board" knob group uses 119 of its 354 px. The reference sizes the
   console to its content and gives the board the rest.
4. **No type hierarchy.** About 140 text nodes are 12px/400; title, label,
   value and help differ only by colour. Nothing leads the eye.
5. **Too many control dialects.** Six button families, seven renderings of
   "selected", seven button heights in one view, and four buttons that fall
   back to the browser's default grey style.

Most of the remaining chaos sits in features the reference never designed:
26 preset chips, the report column, simple mode, the Preview panel with
palettes and dots, mode and language switches on the top bar, and the
library laid out as stage plus console.

## Findings

### P1

| # | Issue | Evidence | Source | Proposal |
|---|---|---|---|---|
| 1 | Board gets 50% of the height | 1280: frame 824×284 | `console.css:463,469` | rows `auto minmax(320px,3fr) minmax(200px,2fr)`, or console `auto` with `max-height: 40vh` as in the reference |
| 2 | Stage and console column axes disagree | 70/1087 vs 168/1223 | `shell.css:166`, `console.css:9` | shared `--col-left` / `--col-right` on `.fw-lab` |
| 3 | Empty 70 px filmstrip lane on every view | empty `<div className="fw-runs" />` | `stage/Stage.tsx:14` | hide it until the filmstrip exists |
| 4 | Four unstyled buttons (`#6b6b6b`, `2px outset`); "Delete from disk" looks like "Load into lab" | DOM measurement | `console/ViewPanel.tsx:214`, `library/BoardList.tsx:46`, `library/BoardDetail.tsx:168,171` | one `.fw-btn` class with variants |
| 5 | Seven renderings of "selected" | control table below | `shell.css` (`.fw-top .fw-seg`), `library.css:47`, `docs.css:55` | choice in a group = Signal fill with Void text; navigation = 2 px rule; list row = 2 px left edge |
| 6 | Values in Signal fail WCAG AA | 4.08:1 on void, 3.81:1 on graphite, 3.52:1 on surface | `console.css:161`, `palette.css:80` | values in `--ink` with `tabular-nums`; Signal on fills only |
| 7 | Top bar text below AA through opacity | `.sep` 2.17:1, preset and dimensions 3.35:1 | `shell.css:103,116,120` | drop opacity from text |
| 8 | Two number formats (`0.6` and `0,5` in the English UI) | native `input[type=number]` follows browser locale | `console/ViewPanel.tsx:60` | reuse `DraftNumber` as the knobs do |
| 9 | At 375 px the page spreads to 572 px and the report shrinks to 24 px | `scrollWidth` 572 | `shell.css:28,81–88,277–283` | wrap the top bar; below 600 px scroll the whole page |
| 10 | "Inactive" reason looks like ordinary help | no rule for `.state` | `design/console.css` | set the reason apart (mist, prefix); keep `--warn` for clamping |

### P2

- **Presets:** 2559 px of chips in a 1425 px strip with a visible horizontal
  scrollbar. Replace 26 chips with a level control (seven levels) plus four
  mode chips.
- **Report as a 352 px column:** in Polish 17 of about 20 labels wrap.
  Prefer a tab or drawer over the board; at least 420 px otherwise.
- **Scroll inside scroll:** the CLI field inside the run column; five
  independent scroll regions at 768 px.
- **`/boards`:** an empty stage, empty report and empty lane before a board
  is chosen. The reference designs a list table up to 900 px wide.
- **Knob grid:** `repeat(auto-fill, minmax(190px, 1fr))` (`console.css:377`)
  leaves empty tracks, Polish labels wrap to two or three lines, and slider
  tracks in one row drift by 20 px.
- **Button heights 20–40 px:** reduce to a 24 / 32 / 40 scale.
- **Docs:** tables span 1385–2520 px; adopt `max-width: 900px` and the
  reference table style.
- **Generate in Archivo** (`shell.css:335`), the only non-mono control,
  against the "all UI in JetBrains Mono" decision.
- **5 px radius** on library rows (`library.css:77`), against the zero-radius
  rule.
- **Knob value** is a 14×20 px hit target with no affordance outside hover.
- **⌘K** renders the refusal reason and key hints in Signal, which is meant
  for state and data only.

### P3

- State and view drift: on `/boards/25x25/…` the top bar still reads
  "Easy portrait 25×50"; in simple mode the knobs read 1000×1000 while the
  board is 25×50. This is a state bug, not only styling.
- The theme select truncates ("none (def…").
- Simple-mode sliders show percentages without `%`.
- Two section-header styles: 13 px ink and 11 px ash caps.
- The palette scrim uses `rgba(14,15,18,…)` literals instead of a token.

## Control inventory (measured)

| Control | Height | Font | Border | Radius | Selected state |
|---|---|---|---|---|---|
| Generate `.fw-go` | 40 | 12 Archivo | 0 | 0 | — |
| New seed / Defaults / Abort | 32 | 12 Mono | 1 `--border` | 0 | — |
| Exports | 28 | 12 Mono | 0 | 0 | — |
| Copy | 20.4 | 12 Mono | 0 | 0 | — |
| Preset chip | 24 | 12 Mono | 1 `--border` | 0 | Signal + Void |
| Segmented (panel) | 24 | 12 Mono | 1 `--border` | 0 | Signal + Void |
| Segmented (top bar) | 24 | 12 Mono | 1 `--void` | 0 | Void + Ink |
| Tab | 40.4 | 12 Mono | 2 px bottom | 0 | Signal rule |
| Group rail | 30.4 | 12 Mono | 0 | 0 | Signal + Void |
| Size chip (library) | 30.4 | 12 Mono | 0 | 0 | Void + Ink |
| Library row | 56.8 | 12 Mono | 1 | 5 px | Signal border |
| ⌘K option | 36.4 | 12 Mono | 0 | 0 | `--surface` fill |
| Knob value | 20.4 × 14 | 12 Mono | 0 | 0 | — |
| Number field (Preview) | 22.4 | 12 Mono | 1 `--border` | 0 | 2 px Signal focus |
| Select | 22 | 12 Mono | 1 `--border` | 0 | — |
| Switch `.fw-sw` | 26 | — | 1 `--ash` | 999 px | Signal track |
| Unstyled buttons | 26.4–46.8 | 12 Mono | 2 px outset | 0 | none |

Focus: the global `2px solid var(--signal)` ring works on fields and
buttons; no missing focus state was found.

## Proposed system

```css
/* tokens.css — proposed additions */
--s-1: 2px; --s-2: 4px; --s-3: 8px; --s-4: 12px; --s-5: 16px; --s-6: 24px; --s-7: 32px;
--ctl-h-sm: 24px; --ctl-h: 32px; --ctl-h-lg: 40px;   /* 44px under pointer: coarse */
--col-left: 168px; --col-right: 280px;               /* shared by stage and console */
--panel-pad: var(--s-4) var(--s-5);
--doc-max: 920px;
--scrim: rgb(14 15 18 / .6);
```

Type scale:

| Step | Size | Role |
|---|---|---|
| T1 | 18/500 | page title (docs, library) |
| T2 | 13/500 | knob group name, report headline value |
| T3 | 12/400 | base text, labels, values |
| T4 | 11 caps, 0.14em | section headers, one style |
| T5 | 11/1.6 | help and inactive reason, 45–65 characters per line |

Colour roles: values `--ink`, labels `--mist`, help and meta `--ash`, Signal
only on state fills (selection, slider, switch, focus, top bar), `--warn`
only for clamping, `--error` for refusal and destructive actions.

Controls: one `.fw-btn` family (`primary`, `secondary`, `ghost`), one rule
for "selected", one number field (`DraftNumber`, no native spinner).

## Proposed order of work

1. **Wave A, CSS only:** spacing and height tokens, the board/console height
   split, shared column axes, hiding the empty lane, `.fw-btn` for the four
   bare buttons, one "selected" rule, contrast fixes, Generate in mono,
   zero radius, docs `max-width`.
2. **Wave B, components:** `DraftNumber` in Preview, a distinct inactive
   reason, aligned knob rows, the library as a full-width list, top bar and
   board state drift, mobile.
3. **Wave C, design first:** two-level presets, report as a tab or drawer,
   Preview split into subgroups, simple mode, a home for the mode and
   language switches. These need a mockup in the Claude Design project
   before code, because the reference does not cover them.
