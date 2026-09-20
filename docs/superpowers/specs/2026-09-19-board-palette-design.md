# The board takes a palette — design

**Status:** design, awaiting review. **Package:** `packages/board-element`, with a
picker in `apps/lab` and one documentation row in `packages/engine/lab-docs.ts`.

## 1. What is being built, and what is only cargo

The deliverable is a **mechanism**: a board can be told which colours to draw its
pieces in, either by handing it an array or by naming a theme that ships with the
element, and it can be re-coloured without rebuilding its geometry.

The **twelve themes are data**, ported from open-source editor themes (§4). They
can be replaced, extended or dropped by editing one file; nothing in the
mechanism depends on their values. Two of them are knowingly weak, and §5 records
why rather than hiding it.

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
/** Colours the pieces are drawn in, assigned by §3.2; empty = the golden angle. */
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
the element's own defaults. So `<arrowz-board theme="gruvbox-dark">` draws the
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

- **Neighbours differ.** With five colours, 0.2% of touching pairs share one;
  with four, 2.8%. Any rule that ignores adjacency lands on the random baseline —
  `id % n` and a golden-angle scramble both measured ≈100/n%.
- **The palette stays even.** Plain greedy colouring over-uses the first colours:
  on a 300×300 board one colour took 34.4% and, with 24 colours, some took none
  at all. Preferring the least-used index gives exactly 100/n% each.
- **It is stable.** The assignment is computed over **all of `board.pieces`**,
  never over the pieces currently drawn. A game removes pieces (`tesselate.ts:298`
  filters by `omit`); an assignment over the drawn subset would repaint the board
  after every move — the very failure the id-based hue was introduced to avoid
  (`colors.ts`, and the board-game design of 2026-09-10).

A palette of one colour is legal and paints every piece that colour; two of the
shipped themes are in that state deliberately (§5).

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

Twelve themes in `packages/board-element/src/themes.ts`, exported as `THEMES`.
Six dark and six light, each a pair from one upstream project, so the light and
dark halves are the authors' own and nothing is invented.

| id | paper | ink | highlight | palette |
|---|---|---|---|---|
| `catppuccin-mocha` | `#1e1e2e` | `#cdd6f4` | `#a6e3a1` | `#f5e0dc` `#cba6f7` `#f38ba8` `#89dceb` `#fab387` |
| `gruvbox-dark` | `#282828` | `#ebdbb2` | `#d3869b` | `#fabd2f` `#83a598` `#fb4934` `#fe8019` `#8ec07c` |
| `tokyonight-storm` | `#24283b` | `#c0caf5` | `#1abc9c` | `#7dcfff` `#ff9e64` `#9ece6a` `#9d7cd8` `#f7768e` |
| `everforest-dark` | `#2d353b` | `#d3c6aa` | `#d699b6` | `#dbbc7f` `#7fbbb3` `#e67e80` `#a7c080` `#e69875` |
| `rose-pine-moon` | `#232136` | `#e0def4` | `#c4a7e7` | `#f6c177` `#3e8fb0` `#eb6f92` `#9ccfd8` `#ea9a97` |
| `ayu-dark` | `#10141c` | `#bfbdb6` | `#aad94c` | `#95e6cb` `#ff8f40` `#d2a6ff` `#59c2ff` `#f07178` |
| `catppuccin-latte` | `#eff1f5` | `#4c4f69` | `#179299` | `#d20f39` `#1e66f5` `#8839ef` `#e64553` |
| `gruvbox-light` | `#fbf1c7` | `#3c3836` | `#8f3f71` | `#9d0006` `#076678` `#79740e` `#427b58` `#b57614` |
| `tokyonight-day` | `#e1e2e7` | `#3760bf` | `#f52a65` | `#7847bd` `#b15c00` `#118c74` `#007197` `#8c6c3e` |
| `everforest-light` | `#fdf6e3` | `#5c6a72` | `#3a94c5` | `#f85552` |
| `rose-pine-dawn` | `#faf4ed` | `#464261` | `#b4637a` | `#286983` `#907aa9` `#56949f` |
| `ayu-light` | `#fcfcfc` | `#5c6166` | `#5c6166` | `#a37acc` |

Measured against each theme's own paper: every arrow colour clears 3:1 (the
lowest is 3.0), every ink clears 4.5:1 (the lowest is 4.5), and every highlight
clears 3:1 and stands at least ΔE 27 from that theme's arrows — except
`ayu-light`, whose highlight **is** its ink, because the theme has no spare
accent; it stands ΔE 50 from the one arrow colour, so the longest pieces still
read as marked.

## 5. Where the data comes from, and what it costs

**The licence audit.** superfile's theme list (`superfile.dev/list/theme-list/`)
names 21 themes with their authors, which made it a directory of what is open.
Checked through the GitHub API: catppuccin, gruvbox, dracula, nord, everforest,
ayu, poimandres, rose-pine and sugarplum are **MIT**, one-dark is **ISC**, Tokyo
Night's maintained port (`folke/tokyonight.nvim`) is **Apache-2.0**. Two are
excluded: **kaolin** is GPL-3.0 (copyleft), and **Monokai Pro** is proprietary —
its licence forbids redistribution, and the request to open the palette
(`Monokai/monokai-pro-vscode` issue 186) is unanswered.

Of the open ones, six ship a light and a dark variant from the same author:
catppuccin (latte/mocha), gruvbox, Tokyo Night (day/storm), everforest,
rose-pine (dawn/moon) and ayu. Those six are §4. The rest are dark-only, so
taking them would have meant inventing light halves.

**superfile's own theme files are not the source.** They are terminal-UI configs
(`file_panel_fg`, `gradient_color`, borders), not palettes. The values come from
each upstream project's published palette.

**How each theme was turned into a board theme**, by measurement rather than
taste:

1. Paper and ink are the theme's own background and foreground.
2. An accent may become an arrow colour only if it clears **3:1** against that
   paper — the WCAG 1.4.11 floor for graphical objects, which is what a stroke
   half a cell wide is.
3. The highlight is **reserved first**: the surviving accent that stands farthest
   from the others. Reserving it before the arrows are chosen is what stops the
   marker for the longest pieces from being one of the ordinary colours.
4. The arrows are then chosen greedily from the rest — start with the highest
   contrast, then always add the colour whose nearest already-chosen neighbour is
   farthest away — capped at five, which is where neighbour collisions reach
   0.2% (§10).

**The price, measured and accepted.** Light editor themes are built for thin
glyphs on near-white paper, where 2–2.5:1 is normal; a board stroke needs 3:1.
Counting accents that clear 3:1 on their own paper: gruvbox-light 7 of 7,
tokyonight-day 9 of 9, catppuccin-latte 5 of 12, rose-pine-dawn 4 of 6,
everforest-light 2 of 7, **ayu-light 1 of 10**. So `everforest-light` and
`ayu-light` ship with a single arrow colour and draw a monochrome board until a
host passes its own palette. Dark themes have the opposite property — their
accents must glow on a dark background — and every one of them reached five.

Two rules were tried and **disproved by measurement** before this text was
written, and are recorded so nobody retries them:

- *Take a darker tone of the theme's own background to lift contrast.* Backwards
  for light themes: their accents are darker than the paper, so moving the paper
  toward them lowers the ratio. Applied, it took everforest-light and ayu-light
  from 2 and 1 usable accents to **zero**.
- *Pick the highlight as the colour farthest from the palette, out of a fixed
  list of markers.* It collapses: nine of ten themes got the same blue, which
  strips the theme of its character. Taking the marker from the theme's own
  accents keeps it in family and still clears ΔE 27.

**Attribution.** These projects are MIT, ISC and Apache-2.0; the repository today
has **no `LICENSE` and no `NOTICE`** (measured). `themes.ts` therefore carries,
per theme, the upstream project, its licence and its URL, and the package README
repeats the list. Apache-2.0 in particular asks for the notice to travel with the
work.

## 6. The lab

The console gains a theme picker: the twelve names with a swatch strip, plus a
custom palette — a list of colours the user edits, which maps to `view.palette`
with no theme. The choice joins the URL hash beside the other view fields
(`state/url.ts`), lives in `view.slice.ts`, and is named in both languages in
`packages/engine/lab-i18n.ts`. The simple view gets the picker and not the custom
editor.

**What shipped instead of what this section originally proposed.** `boardViewOf`
(`view.ts:50-60`) keeps dropping colours: the lab passes only the chosen theme's
*name*, through the element's own `theme` attribute, and the element resolves
paper, ink, highlight and palette itself, the same way any other host would. The
lab never reads `THEMES[name]` to build a `view` patch. This is pinned by
`view.test.ts:60` ("boardViewOf still carries no palette: the lab sets it
separately") and is the design §3.1 already states: one place merges theme and
view, and nothing else learns themes exist.

**The exported SVG keeps the golden angle.** The engine's `toSvg` learns no
colours (§9), so a board exported from the lab will not match the screen once a
theme is chosen. This is a consequence of a deliberate decision, and the lab says
so where the export lives rather than leaving it to be discovered.

**Status, as of the round that shipped this design.** The console picker and the
simple-view picker both shipped, mirroring each other, along with the export
caveat above. Not shipped, and not planned for this round: the swatch strip
beside the twelve names, and the custom palette editor that would map a
user-edited colour list onto `view.palette` with no theme selected. Both remain
designed above and unbuilt; picking them up is a later round's decision.

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
  board and length; removing a piece from the drawn set changes nothing; a
  one-colour palette paints every piece and throws nothing.
- The table, as guards over `THEMES`: every arrow colour clears 3:1 against its
  own paper; every ink clears 4.5:1; every highlight clears 3:1 and is not one of
  the arrows; every theme names its upstream project and licence.
- `drawableView` with a palette of rubbish, of partial rubbish, and empty.

**Chromium, in the element package**

- A board with a theme paints the theme's colours: counted on the canvas, the way
  `game.browser.test.ts:55-57` already counts a piece's hue.
- Changing only the palette does not re-tesselate (asserted through a spy on the
  tesselation, not through timing, which is not a gate on a runner without a GPU).
- The riding piece keeps its colour across the start of a ride.
- `enableColors` off: a theme still paints `paper`, `ink` and `highlight` — §3.1
  governs here, not the line this bullet used to carry — but its `palette` does
  not apply to any piece.

**In the lab**

- The picker writes the hash, the hash restores the picker, and both languages
  name every theme.

## 9. Out of scope

- **The engine's export path.** `toSvg`, `SvgOptions`, `View`, the board file and
  the CLI learn nothing about colours. An exported SVG stays as it is today.
- **Reading CSS custom properties.** The element takes colours as input, the way
  it takes every other design decision; it reads the environment only for facts
  about the device (`prefers-reduced-motion`, device pixel ratio).
- **`prefers-color-scheme`.** Choosing light or dark is the host's call in this
  round.
- **Palettes for colour-vision deficiency**, and a contrast gate measured in the
  browser rather than computed from sRGB.
- **Rescuing the two thin light themes.** `everforest-light` and `ayu-light` stay
  as they are; relaxing their floor, or deriving darker steps of their hues, is a
  later decision with its own measurement.

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

Contrast of the shipped themes against their own paper: arrows 3.0–12.9, inks
4.5–11.9, highlights 3.0–11.2.
