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
| `view` | `Partial<BoardView>` (`stroke`, `headWidth`, `headHeight`, `colored`, `top`, `voids`, `ink`, `paper`, `highlight`) | `{}`, merged over the CLI defaults (stroke 0.5, automatic heads, monochrome) |
| `interactive` | `boolean` (attribute, reflected) | `false` |
| `lang` | `string` (the standard global `lang` attribute) | `''`; `pl` (or any `pl-…` tag) selects Polish labels, anything else English |

| Method | Behaviour |
|---|---|
| `animateExit(pieceId, dir)` | slides the piece off the board along `dir` (0 up, 1 right, 2 down, 3 left) and removes it; resolves when done |
| `shake(pieceId, distance)` | nudges the piece `distance` cells along its direction and back |
| `fit()` | fits the board into the host |
| `zoomBy(factor)` | zooms around the centre, clamped to `[fit, 48 px per cell]` |

Getter: `viewport` (read-only) returns
`{ cellPx, originX, originY, fitted, hostWidth, hostHeight }`, or `null`
before a board and a host size are both known.

| Event | `detail` |
|---|---|
| `piece-click` | `{ pieceId }`, only when `interactive` |
| `viewport-change` | the viewport snapshot, at most once per frame |

Controls: click without a modifier plays; drag with ⌘ or Ctrl pans; wheel
zooms towards the cursor; one finger pans, two pinch, a tap plays; `+`, `−`,
`0` and the corner buttons zoom and fit; double click or double tap fits.

## Development

```
pnpm nx serve board-element     # demo at http://localhost:8778 with measurements
pnpm nx test board-element      # Vitest: node project + chromium project
pnpm nx verify board-element    # check, lint, fmt, test, build
```
