# @arrowz/board-element

`<arrowz-board>`: the board view of Arrowz as a web component (Lit 3). It
draws a `BoardData` (the engine's `Board` is one), owns zoom and pan, animates the two
effects of the game reducer and reports clicks on pieces. Usable from plain
HTML, React, Angular, Svelte or Vue.

## Usage

```html
<arrowz-board id="board" interactive lang="pl" style="width: 100%; height: 80vh"></arrowz-board>
<script type="module">
  import '@arrowz/board-element'
  import { defaultParams, generate } from '@arrowz/engine'
  const el = document.getElementById('board')
  el.board = generate({ ...defaultParams(), W: 50, H: 50, seed: 7 }).board
  el.addEventListener('piece-click', (e) => console.log('piece', e.detail.pieceId))
</script>
```

`board` has no attribute, so a framework must set it as a property:

- **Angular**: `schemas: [CUSTOM_ELEMENTS_SCHEMA]`, `[board]="board"`, `(piece-click)="…"`; a type
  import from this package types `$event.detail`.
- **React 19**: `<arrowz-board board={board} onpiece-click={…}>`, rendered only once the package
  is imported; `@lit/react` is optional.
- **Vue 3**: `isCustomElement` for the tag, `:board="board"` from a `shallowRef`, `@piece-click`;
  render the tag once the package is imported.
- **Svelte 5**: `{board}`, `onpiece-click={…}`.

Import the package in the browser only: the element draws with WebGL. The lab's Docs tab, page
Element, has a full example for each.

### Board files

A board stored or sent over the network is a `.board.json` (`BoardFile`), not a `BoardData`:
decode it with `decodeBoard` from `@arrowz/engine` where the element is, catch `BoardFileError`,
and assign the result to `board`.

## API

| Property | Type | Default |
|---|---|---|
| `board` | `BoardData \| null` | `null` |
| `view` | `Partial<BoardView>` (`stroke`, `headWidth`, `headHeight`, `rounded`, `colored`, `top`, `voids`, `ink`, `paper`, `highlight`, `palette`) | `{}`, merged over the CLI defaults (stroke 0.5, heads one cell tall and as wide as the stroke asks, corners and tails rounded, monochrome) |
| `theme` | `string` (attribute, reflected): name of a built-in theme (see [Themes and attribution](#themes-and-attribution)); `''` selects none | `''` |
| `interactive` | `boolean` (attribute, reflected) | `false` |
| `pad` | `number` (attribute, reflected, default not shown until set — removing the attribute restores it): margin around the board, in cells, held to `PAD_RANGE` (0 to 16) | `4`; `0` draws the cells edge to edge |
| `lang` | `string` (the standard global `lang` attribute) | `''`; `pl` (or any `pl-…` tag) selects Polish labels, anything else English |
| `play` | `boolean` (attribute, reflected) | `false` |
| `enableColors` | `boolean` (attribute `enable-colors`, reflected) | `false` |
| `showPoints` | `boolean` (attribute `show-points`, reflected): draws the dot grid | `false` |
| `pointColor` | `string` (attribute `point-color`, reflected): colour of the grid's dots | `'#c9c9d6'` |
| `pointRadius` | `number` (attribute `point-radius`, reflected, default not shown until set — removing the attribute restores it): radius of the grid's dots, in cells | `0.06` |

| Method | Behaviour |
|---|---|
| `animateExit(pieceId, dir)` | rides the piece off the board along `dir` (0 up, 1 right, 2 down, 3 left) and removes it; resolves when done |
| `shake(pieceId, distance)` | nudges the piece `distance` cells down its track and back |
| `fit()` | fits the board into the host |
| `zoomBy(factor)` | zooms around the centre, clamped between the fit and `MAX_CELL_PX` pixels per cell, unless the fit is already closer |
| `toggleColors()` | what the ◑ button does, `colored-change` included; does nothing without `enableColors` |
| `toggleGestures()` | what the ☝ button does, the stored choice included; fires `gestures-change`; does nothing on a board that is neither `interactive` nor `play` |
| `saveState()` | the game in progress as a value the host can store, or `null` before a board is set |
| `loadState(snap)` | restores a game; throws before a board is set, and when the snapshot is not this board's |
| `restart()` | drops the game and puts every piece back |
| `emit(event)` | dispatches a `GameEvent` as the element's DOM event; it implements `GameTarget`, the seam the internal game host drives the element through, and is public only because a Lit element cannot narrow an interface member to `private` — a host that only renders a board has no reason to call it |

| Getter | Type | Value |
|---|---|---|
| `viewport` | `BoardViewport \| null` | the current viewport, or `null` before a board and a host size are both known |
| `pieceCount` | `number` | how many pieces the layer is drawing — the board's own count, not the number of DOM nodes |
| `gestureMode` | `GestureMode` | the rule mouse and pen follow now |
| `colored` | `boolean` | whether the board is drawn in colour now — never without `enableColors`, then the button's choice, then `view.colored` |

| Event | `detail` |
|---|---|
| `piece-click` | `{ pieceId }`, when `interactive` or `play` |
| `colored-change` | `{ colored }`, cancelable: fired by the ◑ button or `toggleColors()` before the colour override changes; `preventDefault()` clears the override instead, handing the colour back to `view.colored` |
| `gestures-change` | `{ mode }` (`'drag'` or `'click'`): the player's gesture choice changed, through the ☝ button or `toggleGestures()`; fired by that board alone, not by the boards that follow it nor for the choice read back on connect |
| `viewport-change` | the viewport snapshot, at most once per frame |
| `piece-removed` | `{ pieceId, left }`, when a free piece starts its ride |
| `life-lost` | `{ pieceId, blockerId, distance }`, when a blocked piece starts its bounce |
| `finished` | `{ pieces }`, after the ride of the last piece |

The element also announces the paper it actually painted as the CSS custom
property `--arrowz-paper`, and the ink its arrows are drawn in as
`--arrowz-ink`, both set inline on its own host. The default hint and the
"no WebGL2" message are written in that ink, and a slotted hint can use
`var(--arrowz-ink)` to match. Because both are set there, a consumer cannot
style the element *with* them from an ancestor and cannot override them from
above; they are readable by the element's own descendants (through ordinary
inheritance), or from any element with
`getComputedStyle(el).getPropertyValue('--arrowz-paper')`.

### Themes and attribution

`theme` names one of twelve built-in themes, exported as `THEMES` (a
`Record<string, BoardTheme>`) and looked up with `themeOf(name)`. Each supplies
`paper`, `ink`, `highlight` and a `palette` of arrow colours; an explicit field
on `view` always wins over the theme's, which in turn wins over the element's
own default. A theme paints `paper`, `ink` and `highlight` regardless of
`enableColors` — only the per-piece `palette` needs that permission, since it
colours pieces rather than the board's surface.

`resolveColours(theme, stated)` returns the `BoardColours` the element draws
with: its own defaults, then the named theme's, then `stated`'s fields, each
layer winning over the last.

The twelve themes are light and dark ports of six open-source editor themes,
each MIT or Apache-2.0. This repository ships no `LICENSE` or `NOTICE` file, so
the notice travels with the work here and in `themes.ts`:

| Theme | Licence | Source |
|---|---|---|
| Catppuccin | MIT | <https://github.com/catppuccin/catppuccin> |
| gruvbox | MIT | <https://github.com/morhetz/gruvbox> |
| Tokyo Night | Apache-2.0 | <https://github.com/folke/tokyonight.nvim> |
| Everforest | MIT | <https://github.com/sainnhe/everforest> |
| Rosé Pine | MIT | <https://github.com/rose-pine/rose-pine-theme> |
| Ayu | MIT | <https://github.com/ayu-theme/ayu-colors> |

Controls, mouse and pen: a plain drag pans, and a click with ⌘ (Ctrl elsewhere)
plays. With `interactive` alone (no `play`) that click does not play: it
reports the piece as `piece-click`, and the host decides what to show. A plain
click does nothing, so a hand that twitches while panning never costs a life.
A board that takes clicks (`play` or `interactive`) shows a ☝ switch in the
corner. Pressed, it swaps the two: a plain click plays or reports the piece,
and a drag with ⌘ or Ctrl pans. The choice belongs to the player: it is kept in
`localStorage` under `arrowz-board.gestures`, read by each board when it
connects, passed at once to every other connected board, in the origin's other
tabs too, and readable as the `gestureMode` property. There is no attribute for
it. A board that only pans has no switch and always pans with a plain drag.
Touch is the same in both modes: one finger pans, two pinch, a tap plays. The
wheel zooms towards the cursor; `+` (or `=`), `-` and `0` zoom and fit, as do
the corner buttons. With ⌘, Ctrl or Alt held the board leaves those keys to the
browser: with ⌘ or Ctrl they are its own page zoom. A repeated press — a
double click, a double tap — does nothing at all: the second one is read as a
slipped finger, not as an instruction.

### Zoom and pan

Zooming in, the wheel holds the point under the cursor exactly: whatever is
under the pointer when the wheel turns is still under it afterwards, at every
step and anywhere on the board or its margin. What bounds the view is the
centre of it staying on the board or its margin, rather than the stricter "the
board fills the view" — that one has to overrule the anchor as soon as the
cursor is near an edge, because holding the point there means showing blank
beside the board. Measured on a 100x100 board, eight wheel steps into a corner
under the strict rule dragged the point 583 px away from the cursor.

Zooming out pushes the view's centre away from the cursor, so it holds the
point too until the centre reaches the margin's outer edge: from there the view
stops at the margin, and the point slides away from the cursor.

So blank paper beside the board is the price of the anchor, as is a board
smaller than the host no longer being pinned to the middle. `fit()`, the `0`
key and the corner button put it back — a double click does not, it does
nothing at all. `zoomBy` still works from the centre of the host: a button has
no cursor to zoom towards.

The cursor tells what the next click will do before it is made. In the default
mode the board shows the grab cursor, and a piece shows the pointer cursor only
while ⌘ or Ctrl is held, since only then does a click play. In the switched
mode it is the other way round: the modifier turns the board to grab and takes
the piece cursor away. On macOS a Ctrl click is a secondary click: on a board
that takes clicks (`play` or `interactive`), in the default mode, the board
keeps the context menu shut. In the switched mode, and on a board that only
pans, the menu is the page's.

### Size, and values the board cannot draw

The host has no size of its own, like a `<div>`: give it a width and a height,
or put it in a parent that has them. The canvas fills the host and takes no part
in its layout.

Numbers and colours the board cannot draw are replaced, silently and only in
the drawing; this covers both attributes and `view`, and the properties and
attributes keep what was set. `zoomBy()` separately ignores a factor that is
not a finite positive number, leaving the viewport as it was.

- A value that is not a finite number becomes its default.
- `stroke` is at most one cell, and zero or less becomes the default.
- Head sizes are never negative; `pad` stays within `PAD_RANGE` (0 to 16).
- `top` is a whole count, never negative.
- `point-radius` stays within `POINT_RADIUS_RANGE` (0 to 0.5): above half a cell the dots merge.
- A colour the browser cannot parse becomes the default of its field; in
  `palette` it is left out, and the other colours stay.

### The margin

The board is drawn with a margin of `pad` cells on every side, so an arrowhead
in an edge cell does not end flush with the edge of a fitted view. The margin is
part of what the board is fitted into, and it is what a leaving piece is
clipped to, so an arrow vanishes at the margin's outer edge rather than riding
on across the paper beyond it: the host is painted the paper colour all over
(`--arrowz-paper`), so that edge is not drawn. Changing `pad` refits the board.

A margin measured in cells shrinks with them, so on a large board fitted into a
small host it would come to a pixel or two. It is widened until it is worth
`MIN_PAD_PX` on screen. A `pad` of `0` stays `0`: asking for no margin is not
asking for a small one. `pad` itself is clamped to `PAD_RANGE` before it
reaches the viewport; the attribute and the property keep whatever was set.

The default bar in the corner counts too. When it would lie over the fitted
board, the margin is widened until the part under the board is as tall as the
bar and its offset; the board stays centred, so the margin grows on every
side. A board with room under it fits as before. A bar of the host's own, in
the `controls` slot, gets no such room, since the element cannot know where it
sits, and a `pad` of `0` stays `0`: an empty custom `controls` hides the bar
for an unobstructed edge-to-edge board.

### The dot grid

With `showPoints` the board draws a grid of one dot per cell underneath the
pieces, like the ruling of a notebook page the arrows are laid on: their lines
run from cell centre to cell centre, and this is that same grid made visible.
It covers the cells only (`0,0` to `W,H`), not the `pad` margin, which stays
blank paper. `pointColor` and `pointRadius` (in cells) style the dots. The grid
is one WebGL pass: a single quad over the cells, whose fragment shader places a
dot at the centre of each cell, so it costs the same at 10×10 as at 1000×1000.

Below `MIN_POINT_CELL_PX` per cell the grid hides itself, `showPoints` left as
it is: at that density the dots would moiré into grey rather than read as a
grid, so zooming out past the threshold turns it off and zooming back in turns
it back on.

Each dot sits at its cell's centre — the same point a piece's line passes
through — with radius `pointRadius` (default `0.06`), well inside a piece's
default stroke half-width (`0.25`). Since pieces cover a freshly generated
board with no gaps, a full board shows none of its dots: they are there,
painted, just underneath. The grid reveals itself cell by cell as pieces
leave the board, or wherever a cell was never carved (a void). That is by
design, not a rendering fault — if the grid looks entirely absent, check
whether a piece is covering the cell you're looking at before suspecting
anything else.

### Riding the track

A piece never slides sideways off its shape. It drives down its own corridor:
the head runs straight out along its direction, and every other cell passes
through the place of the one ahead of it, so a bent arrow bends its way out
instead of moving as one rigid shape. `track.ts` holds that geometry as plain
numbers; the layer redraws the line, the tail and the head once per frame from
a single clock, so the three can never drift apart.

A piece leaves at `EXIT_SPEED` cells per second, so a long arrow from the far
side does not shoot out faster than a short one at the edge, within two bounds:
a ride that would take less than `EXIT_MIN_MS` is slowed to it, so a piece at
the edge is still seen to move, and one that would take more than `EXIT_MAX_MS`
is sped up to it. `prefers-reduced-motion` collapses every ride, and every
bounce, to no time at all.

### Slots and custom controls

The hint and the buttons in the corner are slot fallback content: a host that
projects its own content into a slot replaces the default there, and a slot
left empty keeps it.

Filling `controls` also gives up the room the fit keeps under the board for
the default bar (see "The margin").

| Slot | Default | Present when |
|---|---|---|
| `controls` | the whole bar, holding the slots below | always |
| `hint` | the mode hint | `controls` is empty |
| `zoom-in` | `+` | `controls` is empty |
| `zoom-out` | `−` | `controls` is empty |
| `fit` | `⤢` | `controls` is empty |
| `colors` | `◑` | `controls` is empty and `enableColors` |
| `gestures` | `☝` | `controls` is empty and `interactive` or `play` |

```html
<arrowz-board play>
  <button slot="fit" data-board-action="fit" aria-label="Show everything">Fit</button>
</arrowz-board>
```

`data-board-action` names what a click on the element, or on anything inside
it, does: `zoom-in`, `zoom-out`, `fit`, `colors` (as `toggleColors()`) or
`gestures` (as `toggleGestures()`). It works in every slot, at any depth
inside a custom `controls`; any other value does nothing. The name is
namespaced because `data-action` belongs to common event delegators. The
element finds these controls in its light DOM; put `data-board-action` on a
light-DOM element, not inside another component's shadow root.

The default bar keeps 8 px inside the board. When what it holds — its own
controls or projected ones — is wider than that, it wraps upwards: the bottom
row keeps what comes first (the hint, then the zoom buttons) and the rest moves
above it. A hint wider than the row takes the bottom row alone.

A custom `controls` replaces the bar and its position: the per-control slots
live inside the bar, so a `slot="fit"` child next to a custom bar is not
drawn. The host is `position: relative`, so a bar positioned `absolute` is
placed against the board. An unpositioned bar is drawn above the board in the
normal flow.

The element keeps two attributes on the host's `colors` and `gestures`
controls in step with the board, and owns them there: `aria-pressed`, and
`hidden` while the action is unavailable (no `enableColors`; a board that is
neither `interactive` nor `play`). `hidden` hides through the user-agent
`display: none`, so keep `[hidden] { display: none }` winning over your own
`display` rules on these controls. Under a coarse pointer the `hint` and
`gestures` slots are not drawn, projected content included; inside a custom
`controls` that rule is the host's.

The element gives projected controls no role and no name: project a
`<button>` with its own accessible name. A control that is not a button still
runs its action on click, and nothing more. The board keys (`+`, `=`, `-`, `0`)
act while the board or one of its controls has focus, not while a text field
or a nested board in its content does.

### Playing the board

With `play` the element decides the move itself: a free piece rides out, a
blocked one bounces against the piece that stops it. The element counts no
lives — it reports `life-lost` and the host decides what that costs, and stops
the board by clearing `play`. `saveState()` hands back the game as a small
value (the removed ids, the board's fingerprint and the colour choice); where
it is kept is the host's business.

Colours are off unless `enableColors` is set: monochrome is part of the puzzle,
so telling the pieces apart without colour is the task. With the permission the
board grows a fourth chrome button (or shows the host's own, see
[Slots and custom controls](#slots-and-custom-controls)), and a board may
arrive coloured through `view.colored` or through a loaded game. The button
announces a cancelable `colored-change` event before it acts: a host that does
nothing keeps today's behaviour (the button decides), and one that calls
`preventDefault()` clears the button's own choice — including one made
earlier, by a click or by `loadState` — so `view.colored` is back in charge
from that click on.

Assigning a different `board` starts a new game and redraws the board in full:
a fresh session owns a fresh "gone" set, and the layer compares that set by
identity to decide what it may keep, so a board reassignment can no longer
diff against the previous one. Assigning the object `board` already holds does
nothing, and the game goes on. A host driving play therefore never filters a
`Board` and hands it back — it lets `play` run the game and reads the result
from the events.

### The WebGL context

A board takes its WebGL context when it is connected, not when it is created,
and gives it up when it is removed. If the browser takes it away — a page gets
about sixteen — the board asks for it back as soon as it is on screen. More
than about sixteen boards on screen at once will take each other's contexts in
turn.

## Exports

Everything `@arrowz/board-element` exports, by kind. Importing the package
registers `<arrowz-board>`. Types marked `@arrowz/engine` are re-exported from
the engine, so a consumer needs no second import for them.

| Type | From | Shape |
|---|---|---|
| `BoardData` | `@arrowz/engine` | { `W`: number, `H`: number, `owner`: Int32Array (the piece id per cell; -1 an uncarved cell, -2 a void), `pieces`: Piece[] } — `Piece` is the engine's (`id`, `cells`, `dir`), not exported here |
| `BoardView` | this package | { `stroke`: number (a fraction of a cell), `headWidth`: number (cells; 0 automatic), `headHeight`: number (cells), `rounded`: boolean, `colored`: boolean, `top`: number (how many longest pieces are highlighted), `voids`: boolean, `ink`: string, `paper`: string, `highlight`: string, `palette`: readonly string[] } |
| `BoardViewport` | this package | { `cellPx`: number, `originX`: number, `originY`: number, `fitted`: boolean, `hostWidth`: number, `hostHeight`: number } |
| `BoardColours` | `@arrowz/engine` | { `paper`: string, `ink`: string, `highlight`: string, `palette`: readonly string[] } |
| `BoardTheme` | `@arrowz/engine` | { `paper`: string, `ink`: string, `highlight`: string, `palette`: readonly string[], `source`: string, `licence`: string, `url`: string } |
| `BoardLabels` | this package | every visible string of the element: { `zoomIn`: string, `zoomOut`: string, `fit`: string, `dragHint`: string, `dragPlayHintMac`: string, `dragPlayHintOther`: string, `dragInspectHintMac`: string, `dragInspectHintOther`: string, `clickHintMac`: string, `clickHintOther`: string, `gesturesMac`: string, `gesturesOther`: string, `gesturesInspectMac`: string, `gesturesInspectOther`: string, `colors`: string, `noWebgl`: string } |
| `BoardLang` | this package | `'en'` \| `'pl'` |
| `GestureMode` | this package | `'drag'` (a plain drag pans) \| `'click'` (a drag with the modifier pans) |
| `GameEvent` | this package | one of three `{ type, detail }` objects, `type` being `'piece-removed'`, `'life-lost'` or `'finished'`, with the `detail` of the event of that name |
| `GameTarget` | this package | what `GameHost` drives: { `animateExit`: (pieceId, dir) => Promise<void>, `shake`: (pieceId, distance) => Promise<void>, `emit`: (event: GameEvent) => void } |
| `Session` | `@arrowz/engine` | a game in progress: { `board`: BoardData, `gone`: Uint8Array (1 per piece id that has left), `index`: Int32Array (an internal lookup, not to be read), `left`: number, `status`: 'playing' or 'won' } |
| `SessionSnapshot` | `@arrowz/engine` | a saved game: { `v`: 1, `board`: { W, H, pieces, fingerprint } (the board it belongs to), `removed`: number[], `colored`: boolean } |
| `PieceClickEvent` | this package | `CustomEvent` with detail { `pieceId`: number } |
| `PieceRemovedEvent` | this package | `CustomEvent` with detail { `pieceId`: number, `left`: number } |
| `LifeLostEvent` | this package | `CustomEvent` with detail { `pieceId`: number, `blockerId`: number, `distance`: number } |
| `FinishedEvent` | this package | `CustomEvent` with detail { `pieces`: number } |
| `ViewportChangeEvent` | this package | `CustomEvent` with a `BoardViewport` as detail { `cellPx`: number, `originX`: number, `originY`: number, `fitted`: boolean, `hostWidth`: number, `hostHeight`: number } |
| `ColoredChangeEvent` | this package | `CustomEvent` with detail { `colored`: boolean }, cancelable |
| `ColoredChangeDetail` | this package | that detail: { `colored`: boolean } |
| `GesturesChangeEvent` | this package | `CustomEvent` with detail { `mode`: GestureMode } |
| `GesturesChangeDetail` | this package | that detail: { `mode`: GestureMode } |

| Function | Signature | Behaviour |
|---|---|---|
| `resolveColours(theme, stated)` | `(theme: string, stated: Partial<BoardColours>) => BoardColours` | the colours a board is drawn with: its defaults, then the named theme, then `stated`, field by field |
| `themeOf(name)` | `(name: string) => BoardTheme \| null` | the built-in theme of that name, or `null`; an unknown name is ignored, never thrown on |
| `assignPalette(board, n)` | `(board: BoardData, n: number) => Int32Array` | a colour index per piece id, never a neighbour's and, among the free ones, the least used so far |
| `hueOf(id)` | `(id: number) => string` | a piece's diagnostic hue as CSS, from its id (not its position in `pieces`) |
| `hueDegrees(id)` | `(id: number) => number` | that hue's angle |
| `hueBytes(id)` | `(id: number) => [number, number, number]` | that hue as RGB bytes |
| `boardViewOf(view, voids)` | `(view: View, voids: boolean) => Partial<BoardView>` | the engine's `View` (the lab's and the CLI's) as the element takes it; `cell`, a size in the exported SVG, does not apply |
| `labelsFor(lang)` | `(lang: string \| null \| undefined) => BoardLabels` | the labels for a BCP 47 tag: Polish for `pl` or any `pl-…` tag, English otherwise |

| Constant | Value | Meaning |
|---|---|---|
| `DEFAULT_PAD` | `4` | cells of margin when `pad` is not set |
| `DEFAULT_SHOW_POINTS` | `false` | the dot grid is off unless asked for |
| `DEFAULT_POINT_COLOR` | `'#c9c9d6'` | the colour of the dot grid's dots |
| `DEFAULT_POINT_RADIUS` | `0.06` | the radius of the dot grid's dots, in cells |
| `PAD_RANGE` | `{ min: 0, max: 16 }` | the margin a board may be given, in cells |
| `POINT_RADIUS_RANGE` | `{ min: 0, max: 0.5 }` | a dot's radius in cells; past half a cell it overlaps its neighbours |
| `DEFAULT_VIEW` | `{ stroke: 0.5, headWidth: 0, headHeight: 1, rounded: true, colored: false, top: 0, voids: false, ink: '#232447', paper: '#f6f6fa', highlight: '#e8467c', palette: [] }` | the `BoardView` an empty `view` is merged over |
| `THEMES` | `{ catppuccin-mocha, gruvbox-dark, tokyonight-storm, everforest-dark, rose-pine-moon, ayu-dark, catppuccin-latte, gruvbox-light, tokyonight-day, everforest-light, rose-pine-dawn, ayu-light }` | the built-in themes by name (see [Themes and attribution](#themes-and-attribution)) |
| `BOARD_LABELS` | `{ en, pl }` | the element's strings per `BoardLang` |
| `GESTURE_STORAGE_KEY` | `'arrowz-board.gestures'` | the `localStorage` key of the player's gesture choice |
| `ZOOM_STEP` | `1.25` | the factor one button or key press zooms by |
| `WHEEL_RATE` | `0.0015` | the wheel's zoom rate: each event scales by `exp(-deltaY * WHEEL_RATE)` |
| `MAX_CELL_PX` | `48` | the closest zoom, in pixels per cell |
| `MIN_PAD_PX` | `16` | the narrowest margin on screen, in pixels (see [The margin](#the-margin)) |
| `MIN_POINT_CELL_PX` | `6` | below this many pixels per cell the dot grid hides itself |
| `EXIT_SPEED` | `32` | cells per second a leaving piece covers |
| `EXIT_MIN_MS` | `160` | the shortest exit ride, in milliseconds |
| `EXIT_MAX_MS` | `600` | the longest exit ride, in milliseconds |
| `SHAKE_MS` | `230` | how long a blocked piece's bounce takes, in milliseconds |
| `MIN_SHAKE_CELLS` | `0.35` | the shortest bounce, in cells, so a blocker directly in front still shows |

| Class | Constructor | Members |
|---|---|---|
| `ArrowzBoard` | `new ArrowzBoard()`, once the package is imported; a page usually writes `<arrowz-board>` or calls `document.createElement('arrowz-board')` | see [API](#api) |
| `GameHost` | `new GameHost(target: GameTarget)` | `goneIds`, `board`, `isGone(pieceId)`, `setBoard(board)`, `click(pieceId)`, `save(colored)`, `load(snap)` |

`GameHost` runs a game on any `GameTarget` — the element is one — so the
reducer's moves can be played and animated outside `<arrowz-board>`. `board` is
the board of the current session (or `null`) and `goneIds` the ids that have
left, kept as one set per session. `setBoard` starts a fresh session (or drops
it, given `null`); `click` plays a piece and resolves once its ride or bounce
has settled; `save` returns a `SessionSnapshot`, or `null` with no board;
`load` restores one and throws with no board, or when it belongs to a different
board.

## Development

```
pnpm nx serve board-element     # demo at http://localhost:8778 with measurements
pnpm nx test board-element      # Vitest: node project + chromium project
pnpm nx verify board-element    # check, lint, fmt, test, build
```

### The demo's inspector

Beside the board the demo page lists every input the element takes: the
reflected attributes, the fields of `view`, and the methods a host would call.
A control drives the element directly, so the panel is not a second copy of the
state kept in step by hand — one table (`demo/controls.ts`) builds the controls
and tells the HTML pane what to print, so a new property on the element is one
row in it.

The HTML pane is written from the element's own attributes and prints only what
differs from the defaults: the shortest markup that reproduces what is on
screen, with `view` and `board` as the two assignments no attribute can carry.
The event pane logs what the element reports, a checkbox per type;
`viewport-change` starts muted because it fires once a frame while a drag is in
flight, and consecutive repeats of any event fold into a count rather than
spending the buffer the four game events share.
