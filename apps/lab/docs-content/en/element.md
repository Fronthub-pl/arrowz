# \<arrowz-board>

The board view of Arrowz as a web component. It draws a board, zooms and pans it, animates the moves of a game and reports clicks on arrows. It works in plain HTML and in React, Angular, Svelte or Vue.

The boards on this page are `<arrowz-board>` itself, drawn from the command printed under each one. The command's picture flags are the element's properties under other names: `--pad` is `pad`, `--points` is `showPoints`, `--theme` is `theme`.

## Using it {#example}

Import the package once, which registers the tag. Then give the element a size and a board:

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

In Angular, add `CUSTOM_ELEMENTS_SCHEMA` to the component and bind `[board]`. In React, wrap the element with `createComponent` from `@lit/react`.

## Properties {#props}

::table{of="element-props"}

The element also tells you the background it actually painted, as the CSS custom property `--arrowz-paper` on its own host. Read it with `getComputedStyle(board).getPropertyValue('--arrowz-paper')`, or use it inside the element's own content. Because it is set on the host itself, you cannot style the element with it from outside, nor override it short of `!important`.

## Methods and getters {#members}

::table{of="element-members"}

## Events {#events}

::table{of="element-events"}

## Controls {#controls}

### Mouse and pen

A plain drag pans the board. A click with ⌘ (Ctrl on Windows and Linux) plays the arrow under it. A plain click does nothing, so a hand that twitches while panning never costs a life.

With `interactive` and without `play`, that click does not play: the element reports the arrow as `piece-click`, and your page decides what to show.

A board that takes clicks — `play` or `interactive` — shows a ☝ switch in its corner. Pressed, it swaps the two: a plain click plays, and a drag with ⌘ or Ctrl pans. The choice belongs to the player. The browser keeps it for the next visit, every board reads it when it is added to the page, and `gestureMode` says which rule is in force. There is no attribute for it. A board that only pans has no switch and always pans with a plain drag.

The cursor shows what the next click will do. By default the board shows the grab hand, and an arrow shows the pointing hand only while ⌘ or Ctrl is held, because only then does a click play. With the switch pressed it is the other way round: the modifier turns the board to the grab hand. On a Mac a Ctrl click is a right click; on a board that takes clicks, in the default mode, the element keeps the context menu shut.

### Touch

Touch works the same in both modes: one finger pans, two fingers pinch to zoom, and a tap plays.

### Keys and the wheel

The wheel zooms towards the cursor. `+` (or `=`) and `-` zoom, `0` fits the board, and so do the buttons in the corner. With ⌘, Ctrl or Alt held, the board leaves those keys to the browser: with ⌘ or Ctrl they are its own page zoom. The keys act while the board or one of its controls has focus, not while a text field or a nested board inside it does.

A repeated press — a double click, a double tap — does nothing at all. The element reads the second one as a slip of the finger, not as an instruction.

## Zoom and pan {#zoom}

Zooming in, the wheel keeps the point under the cursor where it is: whatever is under the pointer when the wheel turns is still under it afterwards, at every step and anywhere on the board. Zooming out keeps it too, except when the view is already up against an edge of the board: there the view stops at the margin, and the point can slide away from the cursor.

Zooming in on the board is exact because the view keeps one rule for its centre: it stays on the board or its margin. It does not insist that the board fill the view: near an edge, filling the view would mean pulling the board out from under the cursor.

So you may see empty background beside the board, and a board smaller than its host is no longer held in the middle. `fit()`, the `0` key and the corner button bring it back. `zoomBy()` zooms around the centre of the host, since a button has no cursor to zoom towards. The zoom stays between the fitted board and `MAX_CELL_PX` pixels per cell.

## Size, and values the board cannot draw {#size}

The element has no size of its own, like a `<div>`: give it a width and a height, or put it in a parent that has them. The drawing fills the element and takes no part in its layout.

A number or a colour the board cannot draw is replaced, silently and only in the drawing: the property or the attribute keeps what you set. This holds for attributes and for `view` alike.

- A value that is not a finite number becomes its default.
- `stroke` is at most one cell, and zero or less becomes the default.
- Arrowhead sizes are never negative.
- `top` is a whole number, never negative.
- `pad` stays within `PAD_RANGE`, and `point-radius` within `POINT_RADIUS_RANGE`: past half a cell the dots would run into each other.
- A colour the browser cannot read becomes the default of its field; in `palette` it is left out.

`zoomBy()` ignores a factor that is not a finite positive number and leaves the view as it was.

## The margin {#margin}

The board is drawn with a margin of `pad` cells on every side, so an arrowhead in an edge cell does not end flush with the edge of the background. The margin is part of what the board is fitted into, and a leaving arrow is clipped to it: the arrow vanishes at the margin's outer edge instead of riding on into the empty background beyond. Changing `pad` fits the board again.

:::compare
::board[`--pad=0`]{cmd="--width=12 --height=12 --seed=7 --pad=0"}
::board[default]{cmd="--width=12 --height=12 --seed=7"}
::board[`--pad=16`]{cmd="--width=12 --height=12 --seed=7 --pad=16"}
:::

A margin measured in cells shrinks with them: on a large board in a small host it would come to a pixel or two. So it is widened until it is `MIN_PAD_PX` pixels on screen. A `pad` of `0` stays `0`: asking for no margin is not asking for a small one.

## The dot grid {#dots}

With `showPoints` the board draws one dot per cell under the arrows, like the ruling of a notebook page. The arrows' lines run from cell centre to cell centre, and the dots are those centres made visible. The grid covers the cells only, not the margin, which stays plain background. `pointColor` and `pointRadius` (in cells) style the dots. The grid is drawn in one pass over the whole board, so it costs the same on a 10×10 board as on a 1000×1000 one.

A full board shows none of its dots: the arrows cover every cell, and each dot sits under a line, well inside its width. The dots appear cell by cell as arrows leave, or where the generator left a cell empty. If the grid seems to be missing, look for an arrow covering the cell before suspecting anything else. With thin lines and larger dots, they show through:

:::compare
::board[`--points`]{cmd="--width=12 --height=12 --seed=7 --points"}
::board[`--points --line=0.2 --point-radius=0.15`]{cmd="--width=12 --height=12 --seed=7 --points --line=0.2 --point-radius=0.15"}
:::

Below `MIN_POINT_CELL_PX` pixels per cell the grid hides itself, and `showPoints` stays as it is: packed that tightly, the dots would form a moiré pattern rather than read as a grid. Zooming back in brings it back.

## Riding the track {#track}

An arrow never slides sideways off its shape. It drives out along its own track: the head runs straight out in its direction, and every other cell passes through the place of the one ahead of it, so a bent arrow bends its way out instead of moving as one rigid shape. The line, the tail and the head are redrawn every frame from one clock, so they never drift apart.

An arrow leaves at `EXIT_SPEED` cells per second, so a long ride takes longer than a short one, within two bounds: no ride is shorter than `EXIT_MIN_MS` milliseconds, so an arrow at the edge is still seen to move, and none is longer than `EXIT_MAX_MS`, so an arrow from the far side of a big board does not keep you waiting. A ride that would fall outside them is slowed down or sped up to fit. A blocked arrow's bounce takes `SHAKE_MS`. With `prefers-reduced-motion` set, every ride and every bounce takes no time at all.

## Slots {#slots}

The hint and the buttons in the corner are slot fallback content: a child with `slot` set to one of these names replaces that default, and a slot left empty keeps it.

::table{of="element-slots"}

```html
<arrowz-board play>
  <button slot="fit" data-board-action="fit" aria-label="Show everything">Fit</button>
</arrowz-board>
```

`data-board-action` names what a click on a child, or on anything inside it, does: `zoom-in`, `zoom-out`, `fit`, `colors` (as `toggleColors()`) or `gestures` (as `toggleGestures()`). It works in every slot, at any depth inside a custom `controls`; any other value does nothing. Put it on an element in the page's own markup, not inside another component's shadow root: the element looks for these controls among its own children.

### The bar

The default bar keeps 8 px inside the board. When what it holds — its own controls or yours — does not fit in one row, it wraps upwards: the bottom row keeps what comes first, the hint and then the zoom buttons, and the rest moves above it. A hint wider than the row takes the bottom row alone.

A custom `controls` replaces the bar and its position. The other slots live inside the bar, so a `slot="fit"` child next to a custom bar is not drawn. The element is `position: relative`, so a bar positioned `absolute` is placed against the board; a bar you do not position stays in the normal flow, at the top of the board, drawn over it.

### What the element keeps in step

On the `colors` and `gestures` controls you project, the element sets and owns two attributes: `aria-pressed`, and `hidden` while the action is unavailable (no `enableColors`; a board that is neither `interactive` nor `play`). `hidden` hides through the browser's own `display: none`, so keep `[hidden] { display: none }` winning over your own `display` rules on these controls. Under a coarse pointer the `hint` and `gestures` slots are not drawn, projected content included; inside a custom `controls` that rule is yours to keep.

The element gives projected controls no role and no name: project a `<button>` with its own accessible name. A control that is not a button still runs its action on click, and nothing more.

## Playing the board {#play}

With `play` the element decides the move itself: a free arrow rides out, a blocked one bounces against the arrow that stops it. The element counts no lives. It reports `life-lost`; your page decides what that costs, and stops the game by clearing `play`. `saveState()` hands back the game as a small value — the arrows removed, the board's fingerprint and the colour choice — and where you keep it is up to you.

Colours are off unless `enableColors` is set: playing in one colour is part of the puzzle, since telling the arrows apart without colour is the task. With the permission the board grows a ◑ button (or shows your own, see [the slots](docs:element#slots)), and a board may arrive coloured through `view.colored` or through a loaded game. The button announces a cancelable `colored-change` before it acts. A page that does nothing leaves the button in charge; one that calls `preventDefault()` clears the button's own choice — including one made earlier, by a click or by `loadState()` — so `view.colored` decides from that click on.

Assigning a new `board` always starts a new game and redraws the board in full. So a page that runs a game never takes arrows out of a board and hands it back: it lets `play` run the game and reads what happened from the events.

## Themes {#themes}

`theme` names one of the built-in themes in the table below. Each brings a background, an arrow colour, a highlight and a palette for coloured arrows. A field stated in `view` always wins over the theme's, and the theme wins over the element's own default. A theme paints the background, the arrows and the highlight with or without `enableColors`; only the palette needs that permission, since it colours the arrows one by one.

:::compare
::board[`gruvbox-dark`]{cmd="--width=12 --height=12 --seed=7 --theme=gruvbox-dark --colored"}
::board[`catppuccin-latte`]{cmd="--width=12 --height=12 --seed=7 --theme=catppuccin-latte --colored"}
::board[`rose-pine-moon`]{cmd="--width=12 --height=12 --seed=7 --theme=rose-pine-moon --colored"}
:::

The themes are light and dark versions of open-source editor themes, and the notice of where each comes from, under which licence, travels with them:

::table{of="themes"}

## The WebGL context {#webgl}

A board takes its WebGL context when it is added to the page, not when it is created, and gives it up when it is removed. A page gets about sixteen contexts. If the browser takes one away, the board asks for it back as soon as it is on screen again. More than about sixteen boards on screen at once take each other's contexts in turn.

The boards on this page live by that rule: each exists only while it is near the view.

## Exports {#exports}

Everything `@arrowz/board-element` exports, by kind. Importing the package registers `<arrowz-board>`. A type listed as from `@arrowz/engine` is re-exported, so you need no second import for it.

### Types

::table{of="element-types"}

### Functions

::table{of="element-functions"}

### Constants

::table{of="element-constants"}

### Classes

::table{of="element-classes"}

`GameHost` runs a game on any `GameTarget` — the element is one — so the moves can be played and animated outside `<arrowz-board>`. `board` is the board of the current game, or null, and `goneIds` the arrows that have left. `setBoard()` starts a new game (or ends it, given null); `click()` plays an arrow and resolves once its ride or bounce has settled; `save()` returns a `SessionSnapshot`, or null with no board; `load()` restores one and throws when it belongs to another board, or when there is no board.
