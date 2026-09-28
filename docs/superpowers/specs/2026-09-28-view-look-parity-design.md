# View look parity: colours, points and margin through the command

Item 4 of "What is still open" in `lab-review.md`, the slice named there as
"colour flags in the CLI and points and `pad` in the SVG" (Gap 7 and the
"`pad` in the SVG" row). Checked against `main` at `3c23039`.

One pull request, branch `engine/view-look`, base `main`.

## Goal

The lab's live command reproduces the picture the lab exports. A person who
sets a theme, their own colours, the point grid and a margin in the lab,
copies the live command and runs `carve --svg` gets the same SVG, byte for
byte, as the lab's export button.

Today the command and the stored view carry the shape only (`View`: cell,
stroke, head width and height, colored, top, rounded). The theme, the custom
palette, paper, ink, highlight colour, the point grid and the margin live in
the lab's `ViewFields` alone. `carve` has no flag for any of them, `toSvg`
draws a fixed one-cell margin and never draws points, and the themes live in
`packages/board-element`, where the Deno CLI cannot reach them.

## Decisions

- **The loop is full:** the look joins `View`, so it travels through
  `buildCommand`, `parseArgs`, the store's meta and `svgOptions`.
- **The default margin is the element's, 4 cells.** A view that names no
  margin draws 4 cells in the SVG, as the lab draws it on screen. `toSvg`
  called without a `pad` option keeps its one-cell margin, so
  `svg-golden.json` does not change; the change reaches pictures drawn
  through a `View` (the CLI and the lab).
- **The library keeps colour as a viewing preference.** A stored board's
  meta records its look, but the library's preview and its SVG export keep
  drawing the stored shape in the lab's current look, as today
  (`BoardFrame`: "Colour is a viewing preference"). "Load into lab" restores
  the stored look together with the shape.
- **Approach:** `View` grows (rejected: a separate `Look` object beside
  `View`, which doubles every path that carries a view; and the theme name
  alone, which leaves custom colours outside the loop).

## 1. Engine

### The look moves into the engine

A new DOM- and Deno-free file, `packages/engine/look.ts`, listed in
`neutral.test.ts`'s `NEUTRAL`, takes over from `packages/board-element`:

- `THEMES`, `BoardTheme`, `themeOf`, `BoardColours` and `resolveColours`,
  moved unchanged from `board-element/src/themes.ts`, with `themes.test.ts`;
- the default colours (ink `#232447`, paper `#f6f6fa`, highlight
  `#e8467c`), `DEFAULT_PAD` (4), `DEFAULT_SHOW_POINTS` (false),
  `DEFAULT_POINT_COLOR` (`#c9c9d6`) and `DEFAULT_POINT_RADIUS` (0.06);
- `PALETTE_CAP` (8) and `isHexColour`, the `#rrggbb` rule the lab applies
  today (`HEX_COLOR` in `apps/lab/src/state/viewSchema.ts`).

`board-element` imports these from the engine and keeps re-exporting the
same names from `mod.ts`; its public API does not change. Its
`DEFAULT_VIEW` reads the colour defaults from the engine. The same move was
made for `assignPalette` (`packages/engine/palette.ts`).

### `View` grows

`View` in `types.ts` gains nine fields:

| field | type | default | meaning |
|---|---|---|---|
| `theme` | string | `''` | a name from `THEMES`; `''` is none |
| `palette` | string[] | `[]` | up to `PALETTE_CAP` `#rrggbb` colours; empty lets the theme's palette show |
| `paper`, `ink`, `highlight` | string | `''` | `#rrggbb`; `''` is "not stated", so the theme shows through |
| `pad` | number | 4 | margin in cells, whole, 0..16 |
| `showPoints` | boolean | false | the point grid |
| `pointColor` | string | `#c9c9d6` | `#rrggbb` |
| `pointRadius` | number | 0.06 | in cells, 0..0.5 |

`DEFAULT_VIEW` in `command.ts` carries these defaults.

`pad` and `pointRadius` become rows of `VIEW_RANGE`, `VIEW_NUMBER` and
`VIEW_FLAG`, so the bound the CLI takes and the bound the lab's field
draws come from one table, as they do for the other picture numbers.
`PAD_RANGE` and `POINT_RADIUS_RANGE` stay exported from `board-element` as
aliases of those rows, so the element and the lab keep their names.

### `toSvg` draws the margin and the points

`SvgOptions` gains:

- `pad?: number`, the margin in cells; absent is 1, today's margin;
- `points?: { color: string; radius: number }`; absent draws none.

The points are one `<pattern>` of one cell with a dot in its centre and one
`<rect>` over the cells alone (0,0 to W,H, the margin left blank), drawn
above the paper and below everything else: two nodes whatever the board's
size, as the element drew them before its WebGL layer. The dot sits where the element
draws it (`fract(v_world) - 0.5` in the dot shader). There is no
`MIN_POINT_CELL_PX` cut-off: it prevents moiré on a screen, and a vector file
is zoomed. The colour is escaped through `attr` like the others.

### `svgOptions(view)` resolves the look

`svgOptions` adds the look to what it returns: the colours through
`resolveColours(view.theme, stated)`, where `stated` holds only the non-empty
`paper`, `ink`, `highlight` and a non-empty `palette` (an empty string must
not win over the theme); `pad`; and `points` when `showPoints` is on. It
stays the one place a `View` becomes `SvgOptions`.

## 2. The CLI, the command and the store

### Flags

In `PICTURE_FLAGS`, so `--help` and the parser share one list:

| flag | field | accepts |
|---|---|---|
| `--theme=NAME` | `theme` | a name from `THEMES` |
| `--palette=#a,#b,…` | `palette` | 1 to 8 `#rrggbb` colours |
| `--paper=#rrggbb` | `paper` | `#rrggbb` |
| `--ink=#rrggbb` | `ink` | `#rrggbb` |
| `--highlight-color=#rrggbb` | `highlight` | `#rrggbb` (`--top` already means highlight) |
| `--pad=N` | `pad` | whole, 0..16 |
| `--points` | `showPoints` | a switch, read like `--colored` |
| `--point-color=#rrggbb` | `pointColor` | `#rrggbb` |
| `--point-radius=R` | `pointRadius` | 0..0.5 |

A bad value is refused with the flag's name, as a bad number is today: an
unknown theme lists the names, a colour that fails `isHexColour` says
`#rrggbb`, a ninth palette colour names the cap. Colours are stored
lower-case, as the lab stores them.

### `buildCommand` and `parseArgs`

`buildCommand` writes every look field that differs from its default, in the
order of the table above, the palette as one comma-separated flag.

The invariant, pinned by a test over every theme, empty and full colour
fields, `pad` at 0 and 16, and points on and off:
`parseArgs(buildCommand(params, view)).view` equals `view`.

### The store

- `checkView` in `packages/cli/store-server.ts` checks the new fields with
  the same rules: ranges from `VIEW_RANGE`, colours through `isHexColour`,
  `theme` from `THEMES` or `''`, the palette at most `PALETTE_CAP`. An
  absent field takes its default, as `rounded` does today.
- `fillView` in `store.ts` already spreads `DEFAULT_VIEW` under a stored
  view, so a meta saved before this change reads with a 4-cell margin, no
  points and no stated colours. No stored file is rewritten.

### `carve --svg`

`carve` draws through `svgOptions(view)` already, so every flag reaches the
file. A picture made with none of the new flags now has a 4-cell margin
instead of 1. That is the one change a person using no new flag sees.

The README pictures are drawn by the CLI (`deno task docs`,
`packages/cli/scripts/record-doc-images.ts`). They are rebuilt in this
pull request, so the README shows what the CLI draws; the rebuild moves
the margin only.

## 3. The lab

- `viewOf` carries the nine fields (`highlightColor` becomes `highlight`), so
  the live command, the save after each run and `useViewSave` carry the look
  with no change of their own.
- `viewSchema.ts` takes `PALETTE_CAP`, `isHexColour` and the pad and radius
  bounds from the engine instead of defining them.
- The Lab tab's SVG export draws `svgOptions(viewOf(view))`, plus `voids`.
  `exportColours` is deleted.
- The library: the stored board's preview needs no change. `BoardFrame`
  already draws the shape through `boardViewOf(meta.view)`, which maps the
  shape fields only and stays so, and takes the theme, colours, points and
  `pad` from the lab's state. The SVG export of a stored board
  (`BoardColumn`) draws `svgOptions({ ...meta.view, ...lookOf(view) })`,
  where `lookOf` returns the lab's current look as `View` fields, so the file
  matches the preview.
- "Load into lab" (`BoardColumn`'s `loadIntoLab`) applies the stored look
  along with the shape: theme, palette, paper, ink, highlight colour, pad
  and the point grid.

## 4. Documentation

- `README.md` and `README.pl.md`: the picture flags section ("How the picture
  is drawn") gains the look flags; the pictures are rebuilt.
- `lab-review.md`: Gap 7 and the "`pad` in the SVG" row are marked fixed on
  `engine/view-look`, and item 4 drops "colour flags in the CLI and points
  and `pad` in the SVG".
- The comment over `svgOptions` names the look.

## 5. Tests

- Engine: `toSvg` with `pad` (the width and height of the drawing) and with
  points (one `<pattern>`, one `<rect>` of W×H cells, whatever the size);
  `svg-golden.test.ts` and `fingerprints.test.ts` unchanged and green;
  `themes.test.ts` runs from the engine; `neutral.test.ts` covers `look.ts`.
- `command`: the round-trip invariant above; each refusal with its flag's
  name (a colour without `#`, an unknown theme, nine palette colours,
  `--pad=17`, `--point-radius=0.6`).
- `svgOptions`: an empty `ink` under a dark theme draws the theme's ink.
- Store: `checkView` accepts a full look, refuses each bad field by name,
  and a meta without the new fields reads with the defaults.
- Lab: `viewOf` carries the look; the Lab export draws the look; the library
  preview and export draw the stored shape in the current look; "Load into
  lab" restores the stored look; `boardViewOf` still returns the shape
  fields only.

### Live pass

In the lab, set a theme, a custom ink, the point grid and `pad` 6, export the
SVG, copy the live command, run it with `--svg=<path>`, and compare the two
files: they must be identical. The comparison covers the shape too, which no
check covers today, so a difference there (the fitted `cell`, for example)
is found and fixed in this pull request.

## Out of scope

- User-defined themes and CSS colours other than `#rrggbb`.
- ⌘K rows for the colour, pad and point fields (a separate item 4 entry).
- A point cut-off in the SVG.
- The rest of item 4: `parseArgs` in the lab, the closing rate over N seeds,
  the missing report rows, Stop that keeps the partial board, opening a
  `.board.json`.
