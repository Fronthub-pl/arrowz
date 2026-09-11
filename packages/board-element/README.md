# @arrowz/board-element

`<arrowz-board>`: the board view of Arrowz as a web component (Lit 3). It
draws a `Board` from `@arrowz/engine`, owns zoom and pan, animates the two
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

Angular: add `CUSTOM_ELEMENTS_SCHEMA` to the component and bind `[board]`.
React: wrap with `@lit/react` (`createComponent`) in the consumer.

## API

| Property | Type | Default |
|---|---|---|
| `board` | `Board \| null` | `null` |
| `view` | `Partial<BoardView>` (`stroke`, `headWidth`, `headHeight`, `rounded`, `colored`, `top`, `voids`, `ink`, `paper`, `highlight`) | `{}`, merged over the CLI defaults (stroke 0.5, heads one cell tall and as wide as the stroke asks, corners and tails rounded, monochrome) |
| `interactive` | `boolean` (attribute, reflected) | `false` |
| `pad` | `number` (attribute, reflected, default not shown until set — removing the attribute restores it): margin around the board, in cells | `4`; `0` draws the cells edge to edge |
| `lang` | `string` (the standard global `lang` attribute) | `''`; `pl` (or any `pl-…` tag) selects Polish labels, anything else English |
| `play` | `boolean` (attribute, reflected) | `false` |
| `enableColors` | `boolean` (attribute `enable-colors`, reflected) | `false` |
| `showPoints` | `boolean` (attribute `show-points`, reflected): draws the point grid | `false` |
| `pointColor` | `string` (attribute `point-color`, reflected): colour of the grid's dots | `'#c9c9d6'` |
| `pointRadius` | `number` (attribute `point-radius`, reflected, default not shown until set — removing the attribute restores it): radius of the grid's dots, in cells | `0.06` |

| Method | Behaviour |
|---|---|
| `animateExit(pieceId, dir)` | rides the piece off the board along `dir` (0 up, 1 right, 2 down, 3 left) and removes it; resolves when done |
| `shake(pieceId, distance)` | nudges the piece `distance` cells down its track and back |
| `fit()` | fits the board into the host |
| `zoomBy(factor)` | zooms around the centre, clamped to `[fit, 48 px per cell]` |
| `saveState()` | the game in progress as a value the host can store, or `null` before a board is set |
| `loadState(snap)` | restores a game; throws when the snapshot is not this board's |
| `restart()` | drops the game and puts every piece back |

Getter: `viewport` (read-only) returns
`{ cellPx, originX, originY, fitted, hostWidth, hostHeight }`, or `null`
before a board and a host size are both known.

Getter: `gestureMode` (`'drag' | 'click'`, read-only): the rule mouse and pen
follow now.

| Event | `detail` |
|---|---|
| `piece-click` | `{ pieceId }`, when `interactive` or `play` |
| `viewport-change` | the viewport snapshot, at most once per frame |
| `piece-removed` | `{ pieceId, left }`, when a free piece starts its ride |
| `life-lost` | `{ pieceId, blockerId, distance }`, when a blocked piece starts its bounce |
| `finished` | `{ pieces }`, after the ride of the last piece |

Controls, mouse and pen: a plain drag pans, and a click with ⌘ (Ctrl elsewhere)
plays. A plain click does nothing, so a hand that twitches while panning never
costs a life. A playable board (`play` or `interactive`) shows a ☝ switch in the
corner. Pressed, it restores the rule from before: a plain click plays and a
drag with ⌘ or Ctrl pans. The choice belongs to the player: it is kept in
`localStorage` under `arrowz-board.gestures`, read by each board when it
connects, and readable as the `gestureMode` property. There is no attribute for
it. A board that only pans has no switch and always pans with a plain drag.
Touch is the same in both modes: one finger pans, two pinch, a tap plays. The
wheel zooms towards the cursor; `+`, `−`, `0` and the corner buttons zoom and
fit, and with ⌘, Ctrl or Alt held those keys are left to the browser's own page
zoom. A repeated press — a double click, a double tap — does nothing at all:
the second one is read as a slipped finger, not as an instruction.

### Zoom and pan

The wheel zoom holds the point under the cursor exactly: whatever is under the
pointer when the wheel turns is still under it afterwards, at every step and
anywhere on the board. What bounds the view is the centre of it staying between
the board's two margins, rather than the stricter "the board fills the view" —
that one has to overrule the anchor as soon as the cursor is near an edge,
because holding the point there means showing blank beside the board. Measured
on a 100x100 board, eight wheel steps into a corner under the strict rule
dragged the point 583 px away from the cursor.

So blank paper beside the board is the price of the anchor, as is a board
smaller than the host no longer being pinned to the middle. `fit()`, the `0`
key and the corner button put it back — a double click does not, it does
nothing at all. `zoomBy` still works from the centre of the host: a button has
no cursor to zoom towards.

The cursor tells what the next click will do before it is made. In the default
mode the board shows the grab cursor, and a piece shows the pointer cursor only
while ⌘ or Ctrl is held, since only then does a click play. In the switched
mode it is the other way round: the modifier turns the board to grab and takes
the piece cursor away. On macOS a Ctrl click is a secondary click. Where it
plays, the board keeps the context menu shut.

### Size, and values the board cannot draw

The host has no size of its own, like a `<div>`: give it a width and a height,
or put it in a parent that has them. The canvas fills the host and takes no part
in its layout.

Numbers and colours the board cannot draw are replaced, silently and only in
the drawing; this covers both attributes and `view`, and the properties and
attributes keep what was set. The zoom methods separately ignore a factor that
is not a finite positive number, leaving the viewport as it was.

- A value that is not a finite number becomes its default.
- `stroke` is at most one cell, and zero or less becomes the default.
- Head sizes and `pad` are never negative.
- `top` is a whole count.
- `point-radius` stays within [0, 0.5].
- A colour the browser cannot parse becomes the default of its field.

### The margin

The board is drawn with a margin of `pad` cells on every side, so an arrowhead
in an edge cell does not end flush against the paper. The margin is part of
what the board is fitted into, and it is what a leaving piece is clipped to, so
an arrow vanishes at the paper's edge rather than floating beside it. Changing
`pad` refits the board.

A margin measured in cells shrinks with them, so on a large board fitted into a
small host it would come to a pixel or two. It is widened until it is worth
`MIN_PAD_PX` on screen. A `pad` of `0` stays `0`: asking for no margin is not
asking for a small one.

### The point grid

With `showPoints` the board draws a grid of one dot per cell underneath the
pieces, like the ruling of a notebook page the arrows are laid on: their lines
run from cell centre to cell centre, and this is that same grid made visible.
It covers the cells only (`0,0` to `W,H`), not the `pad` margin, which stays
blank paper. `pointColor` and `pointRadius` (in cells) style the dots; the grid
is drawn once as an SVG pattern of one cell's pitch, so it costs the same two
nodes at 10×10 as at 1000×1000.

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

Every piece leaves at one speed, `EXIT_SPEED` cells per second, bounded by
`EXIT_MIN_MS` and `EXIT_MAX_MS`: a long arrow from the far side does not shoot
out faster than a short one at the edge. `prefers-reduced-motion` collapses
every ride to no time at all.

### Playing the board

With `play` the element decides the move itself: a free piece rides out, a
blocked one bounces against the piece that stops it. The element counts no
lives — it reports `life-lost` and the host decides what that costs, and stops
the board by clearing `play`. `saveState()` hands back the game as a small
value (the removed ids, the board's fingerprint and the colour choice); where
it is kept is the host's business.

Colours are off unless `enableColors` is set: monochrome is part of the puzzle,
so telling the pieces apart without colour is the task. With the permission the
board grows a fourth chrome button, and a board may arrive coloured through
`view.colored` or through a loaded game.

Assigning `board` always starts a new game and redraws the board in full: a
fresh session owns a fresh "gone" set, and the layer compares that set by
identity to decide what it may keep, so a board reassignment can no longer
diff against the previous one. A host driving play therefore never filters a
`Board` and hands it back — it lets `play` run the game and reads the result
from the events.

### The WebGL context

A board takes its WebGL context when it is connected, not when it is created,
and gives it up when it is removed. If the browser takes it away — a page gets
about sixteen — the board asks for it back as soon as it is on screen. More
than about sixteen boards on screen at once will take each other's contexts in
turn.

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
