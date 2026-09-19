# The board takes a palette — design

**Status:** design, awaiting review. **Package:** `packages/board-element`, with a
picker in `apps/lab` and one documentation row in `packages/engine/lab-docs.ts`.

## 1. What is being built, and what is only cargo

The deliverable is a **mechanism**: a board can be told which colours to draw its
pieces in, either by handing it an array or by naming a theme that ships with the
element, and it can be re-coloured without rebuilding its geometry.

The **twenty themes are provisional data**. They were drawn from Color Hunt by a
reproducible method (§5) and they are expected to be replaced once someone looks
at them on a screen. Nothing in the design depends on their values: a theme is a
row in a table, and the table can be rewritten without touching a line of the
mechanism. This distinction is the whole point of writing it down — a later
reader must not mistake the seed data for a decision.

## 2. What the colour surface looks like today

Measured, not remembered (2026-09-19):

| what | where | state |
|---|---|---|
| ink, paper, highlight | `view.ts:22-24` | CSS strings from the host, part of `BoardView` |
| their defaults | `view.ts:37-39` | `#232447`, `#f6f6fa`, `#e8467c` |
| validation | `sanitize.ts:29-31` | `drawableColor` falls back when a string is not a colour |
| resolution to floats | `gl-layer.ts:296-298` | once per `setBoard`, never in the draw loop |
| how they are drawn | `gl-passes.ts:157,231` | uniforms; changing one touches no buffer |
| the per-piece hue | `colors.ts` (engine) → `tesselate.ts:442-453` | golden angle over the piece id, baked into a **static vertex colour buffer** |
| the point grid | `gl-layer.ts:325-331` | its own cheap entry, no rebuild |
| the permission | `arrowz-board.ts:533` | `enableColors` gates every colour |
| what the lab sets | `view.ts:43-53` (`boardViewOf`) | seven fields; **ink, paper and highlight are dropped** |

Two consequences of that last row are worth stating plainly. The lab draws a
light board (`#f6f6fa`) inside a dark shell (`tokens.css:14-23`), because nobody
ever passes the element a colour. And `redraw()` (`arrowz-board.ts:537-543`) has
no short circuit: **any** change to `view` goes through `layer.setBoard`, which
re-tesselates the whole board. Changing one colour on the 1000×1000 board costs
**184.5 ms** (§10).

## 3. The design

### 3.1 Two inputs, one precedence rule

`BoardView` gains one field:

```ts
/** Colours the pieces are drawn in, cycled by the assignment of §3.2; empty = the golden angle. */
palette: string[]
```

The element gains one property, reflected as an attribute, so a theme can be
chosen from plain HTML:

```ts
/** Name of a built-in theme (see THEMES); '' selects none. */
theme: string   // attribute: theme
```

The names are deliberately different. `theme` names a row in a table; `palette`
is a list of colours. Calling both `palette` would make `el.palette` and
`el.view.palette` two different kinds of thing under one word.

A built-in theme is a `BoardTheme`:

```ts
interface BoardTheme {
  paper: string
  ink: string
  highlight: string
  palette: string[]
}
```

**Precedence, from strongest:** an explicit field in `view` → the named `theme` →
the element's own defaults. So `<arrowz-board theme="crimson-day">` draws the
whole theme, and a host that also sets `view = { paper: '#fff' }` keeps its own
paper and takes the rest from the theme. The rule is applied once, where
`redraw()` already merges (`arrowz-board.ts:540`), so no other code learns about
themes.

`enableColors` is untouched: without it the board is monochrome and no palette
applies. A theme still supplies `paper` and `ink` in that case, because those are
not "colours of pieces" — they are the surface.

### 3.2 Which piece gets which colour

Not by position and not at random. The rule, in order:

1. Build the adjacency of the board's pieces from `board.owner`: two pieces are
   neighbours when their cells touch orthogonally.
2. Walk `board.pieces` in id order. For each piece, take the colour index used by
   none of its already-coloured neighbours, and among those the one used **least
   often so far**. If every index is taken by a neighbour, take the least used
   overall.

Three properties this buys, all measured (§10):

- **Neighbours differ.** With four colours, 2.8% of touching pairs share one;
  with five, 0.2%. Any rule that ignores adjacency lands on the random baseline —
  `id % n` and a golden-angle scramble both measured ≈100/n%.
- **The palette stays even.** Plain greedy colouring over-uses the first colours:
  on a 300×300 board one colour took 34.4% and, with 24 colours, some took none
  at all. Preferring the least-used index gives exactly 100/n% each.
- **It is stable.** The assignment is computed over **all of `board.pieces`**,
  never over the pieces currently drawn. A game removes pieces (`tesselate.ts:298`
  filters by `omit`); an assignment over the drawn subset would repaint the board
  after every move — the very failure the id-based hue was introduced to avoid
  (`colors.ts`, and the board-game design of 2026-09-10).

It is recomputed when the board changes or the palette's **length** changes —
not when its colours change. Swapping a theme for another of the same size reuses
the assignment and only repaints.

Lives in a new `packages/board-element/src/palette.ts`: pure, no DOM, tested in
the `node` project. It stays out of `@arrowz/engine` because the engine's export
path is out of scope (§9), and because nothing outside the element needs it yet.

### 3.3 Repainting without rebuilding

`GlLayer` gains a colour-only entry beside `setBoard` and `setPoints`:

```ts
/** New colours for the scene already tesselated: resolves them and re-uploads the colour buffers. */
setColors(view: BoardView): void
```

It re-resolves `inkRgba`, `paperRgba` and `highlightRgba`, rebuilds the colour
bytes from the **existing** scene and uploads them. The element calls it instead
of `redraw()` when the only fields that changed are colours — `ink`, `paper`,
`highlight`, `palette` (same length) and `theme`.

This is worth its own entry rather than an optimisation inside `setBoard`,
because the decision needs the *previous* view, which the layer does not keep for
that purpose, and because the point grid already sets the precedent
(`gl-layer.ts:309-324`).

Measured on the 1000×1000 board: **23.3 ms** (21.2 building the bytes, 2.1
uploading 13.2 MB) against **184.5 ms** through `setBoard`. It also repairs a
cost that predates palettes: today `ink` alone pays the full 180 ms tesselation.

### 3.4 The riding piece

`riderColor` (`gl-layer.ts:359-361`) returns `hueRgba(id)` for a coloured board.
It must return the piece's assigned palette colour instead, or an arrow would
change colour at the moment it starts to leave.

### 3.5 Validation

`drawableView` (`sanitize.ts`) gains the palette: each entry is kept when
`isCssColor` accepts it and dropped otherwise; a palette left with no entries
behaves as an empty one, i.e. the golden angle. An unknown `theme` name is
ignored with no throw — the same forgiving rule the other view fields follow.

## 4. What ships as data

Twenty themes in `packages/board-element/src/themes.ts`, exported as `THEMES`.
Ten **day** themes (dark strokes on a light paper) and ten **night** themes (pale
strokes on a dark paper).

| id | paper | ink | highlight | palette |
|---|---|---|---|---|
| `crimson-day` | `#f6f6fa` | `#232447` | `#e8467c` | `#280905 #740a03 #c3110c #e6501b` |
| `crimson-day-2` | `#f6f6fa` | `#232447` | `#2f7bff` | `#2d132c #801336 #c72c41 #ee4540` |
| `violet-day` | `#f6f6fa` | `#232447` | `#e8467c` | `#04879c #0c3c78 #090030 #f30a49` |
| `magenta-day` | `#f6f6fa` | `#232447` | `#e8467c` | `#4b5d67 #322f3d #59405c #87556f` |
| `violet-day-2` | `#f6f6fa` | `#232447` | `#2f7bff` | `#0e1555 #4e1184 #932b77 #fd367e` |
| `violet-day-3` | `#f6f6fa` | `#232447` | `#2f7bff` | `#22092c #872341 #be3144 #f05941` |
| `crimson-day-3` | `#f6f6fa` | `#232447` | `#e8467c` | `#f7374f #88304e #522546 #2c2c2c` |
| `violet-day-4` | `#f6f6fa` | `#232447` | `#e8467c` | `#202040 #202060 #602080 #b030b0` |
| `magenta-day-2` | `#f6f6fa` | `#232447` | `#e8467c` | `#1a1a1d #3b1c32 #6a1e55 #a64d79` |
| `violet-day-5` | `#f6f6fa` | `#232447` | `#2f7bff` | `#000000 #150050 #3f0071 #fb2576` |
| `teal-night` | `#16171b` | `#e8e8ea` | `#e8467c` | `#40dfef #b9f8d3 #fffbe7 #e78ea9` |
| `azure-night` | `#16171b` | `#e8e8ea` | `#e8467c` | `#edd2f3 #fffcdc #84dfff #516beb` |
| `azure-night-2` | `#16171b` | `#e8e8ea` | `#e8467c` | `#f7c8e0 #dfffd8 #b4e4ff #95bdff` |
| `amber-night` | `#16171b` | `#e8e8ea` | `#e8467c` | `#c4e1f6 #feee91 #ffbd73 #ff9d3d` |
| `amber-night-2` | `#16171b` | `#e8e8ea` | `#e8467c` | `#faf8f1 #faeab1 #e5ba73 #c58940` |
| `azure-night-3` | `#16171b` | `#e8e8ea` | `#e8467c` | `#8f87f1 #c68efd #e9a5f1 #fed2e2` |
| `magenta-night` | `#16171b` | `#e8e8ea` | `#e8467c` | `#ff80c7 #ffbda3 #ffe1bb #faffc4` |
| `meadow-night` | `#16171b` | `#e8e8ea` | `#e8467c` | `#9eb23b #c7d36f #fcf9c6 #e0deca` |
| `teal-night-2` | `#16171b` | `#e8e8ea` | `#e8467c` | `#f9ceee #f9f3ee #ccf3ee #97c4b8` |
| `amber-night-3` | `#16171b` | `#e8e8ea` | `#e8467c` | `#a4b885 #d46d25 #fdc086 #fff6a1` |

The ids name the most saturated colour's family plus the paper's side of the
day; they are not Color Hunt's, which has no names.

## 5. How those twenty were chosen, and why it is repeatable

1. Pull the `dark` and `light` feeds of Color Hunt (`POST /php/feed.php`, steps
   0–7, `sort=new`): 249 and 320 distinct palettes of four colours each.
2. **Pair each tag with the opposite paper.** Measured: palettes tagged `dark`
   pass a 3:1 contrast on all four colours against a light paper in 24% of cases
   and against a dark one in **0%**; palettes tagged `light` pass against a dark
   paper in **100%** and against a light one in 0%. A palette of dark colours
   needs a light page, and the tag describes the colours, not the page.
3. Keep palettes where every colour reaches **3:1** against that paper — the
   WCAG 1.4.11 floor for graphical objects, which is what an arrow is. Body-text
   4.5:1 was measured too and leaves too little to choose from.
4. Keep palettes whose four colours are **ΔE ≥ 15** apart from each other
   (CIE76). Contrast against the paper says nothing about telling two arrows
   apart: `#f8fafc #d9eafd #bcccdc #9aa6b2` clears the paper gate and is four
   near-identical greys.
5. Draw ten from each survivor set (33 day, 125 night) with a seeded shuffle,
   seeds `20260919` and `20260920`, so the draw can be reproduced and is nobody's
   taste.
6. Give each theme the highlight `#e8467c` unless it lands within ΔE 25 of one of
   the palette's own colours, in which case `#2f7bff`. Four day themes needed it —
   `violet-day-2` sat at ΔE 11 from the default pink, which would have made the
   marker for the longest pieces indistinguishable from an ordinary arrow.

Steps 3, 4 and 6 become **tests over the table**, not a one-off script: a future
palette that breaks a floor fails the suite instead of shipping.

**Why the palettes are not taken whole.** A Color Hunt palette is four colours
meant to sit as adjacent blocks; using one as paper and the rest as strokes was
measured and fails — 2 of 249 dark palettes and **0 of 320** light ones pass 3:1
on all three remaining colours. Taking the paper from outside the palette also
leaves four arrow colours rather than three, which halves neighbour collisions
(2.8% against 14%).

**Provenance.** Color Hunt states: "Each palette is a public property and not
owned by a specific creator, nor by Color Hunt" (`colorhunt.co/about`). Its terms
of service say nothing about ownership of palettes. The table records where the
numbers came from; no file is copied.

## 6. The lab

The console gains a theme picker: the twenty names with a swatch strip, plus a
custom palette — a list of colours the user edits, which maps to `view.palette`
with no theme. The choice joins the URL hash beside the other view fields
(`state/url.ts`), lives in `view.slice.ts`, and is named in both languages in
`packages/engine/lab-i18n.ts`. The simple view gets the picker and not the custom
editor.

`boardViewOf` (`view.ts:43-53`) stops dropping colours: it passes the chosen
theme's four fields through to the element.

**The exported SVG keeps the golden angle.** The engine's `toSvg` learns no
colours (§9), so a board exported from the lab will not match the screen once a
theme is chosen. This is a consequence of a deliberate decision, and the lab says
so where the export lives rather than leaving it to be discovered.

## 7. The one row in the engine

`theme` is a new public property with an attribute, so it needs a row in
`packages/engine/lab-docs.ts` with descriptions in both languages, or the guards
of PR #79 fail: `docs-api.browser.test.ts` checks that every documented property
is declared, that attributes match, and that defaults are what a fresh element
holds. Nothing else in the engine changes — `View`, `SvgOptions`, the board file
and the golden hashes are untouched.

## 8. Testing

**Node, in the element package**

- The assignment: neighbours differ where the palette allows it; every colour is
  used within one piece of the even share; the result is identical for the same
  board and length; removing a piece from the drawn set changes nothing.
- The table: every theme's colours clear 3:1 against its paper; every pair within
  a palette clears ΔE 15; every highlight clears ΔE 25 against its own palette
  and 3:1 against its paper; every ink clears 4.5:1.
- `drawableView` with a palette of rubbish, of partial rubbish, and empty.

**Chromium, in the element package**

- A board with a theme paints the theme's colours: counted on the canvas, the way
  `game.browser.test.ts:55-57` already counts a piece's hue.
- Changing only the palette does not re-tesselate (asserted through a spy on the
  tesselation, not through timing, which is not a gate on a runner without a GPU).
- The riding piece keeps its colour across the start of a ride.
- `enableColors` off: a theme changes nothing on the canvas.

**In the lab**

- The picker writes the hash, the hash restores the picker, and both languages
  name every theme.

## 9. Out of scope

- **The engine's export path.** `toSvg`, `SvgOptions`, `View`, the board file and
  the CLI learn nothing about colours. An exported SVG stays as it is today.
- **Reading CSS custom properties.** The element takes colours as input, the way
  it takes every other design decision; it reads the environment only for facts
  about the device (`prefers-reduced-motion`, device pixel ratio).
- **`prefers-color-scheme`.** Choosing day or night is the host's call in this
  round.
- **Palettes for colour-vision deficiency**, and a contrast gate measured in the
  browser rather than computed from sRGB.
- **Replacing the twenty.** They are seed data; swapping them touches one file.

## 10. Measurements this design rests on

Board 1000×1000, seed 7, 85 809 pieces, headless Chrome at dpr 2 on an M1; the
CPU figures are JavaScript and travel, the GPU figure is this host's.

| step | time |
|---|---|
| tesselate the geometry | 180.1 ms |
| build the colour bytes (`tesselateColors`) | 21.2 ms (11.8 MB + 1.4 MB) |
| upload both colour buffers | 2.1 ms |
| build the adjacency over 1 000 000 cells | 72.9 ms |
| assign 5 colours, balanced greedy | 28.1 ms |
| **change one colour today** (`setBoard`) | **184.5 ms** |

Board 300×300, 8037 pieces, Deno: adjacency 11.3 ms, assignment 2.0 ms.

Neighbour collisions on that board, by rule and palette size:

| colours | `id % n` | balanced greedy |
|---|---|---|
| 2 | 48.8% | 39.5% |
| 3 | 33.3% | 14.0% |
| 4 | 25.0% | 2.8% |
| 5 | 19.7% | 0.2% |
| 24 | 4.2% | 0.0% |

Palette spread on the same board, five colours: `id % n` 20.0% each, plain greedy
4.4%–34.4%, balanced greedy 20.0% each.
