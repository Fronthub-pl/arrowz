# \<arrowz-board>

The board view of Arrowz as a web component. It draws a board, owns zoom and pan, animates the two effects of the game reducer, and reports clicks on arrows. Usable from plain HTML, React, Angular, Svelte or Vue.

> The long explanations — zoom and pan, the dot grid, riding the track, playing the board — live in the package README.

## Using it {#example}

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

## Properties {#props}

::table{of="element-props"}

## Methods and getters {#members}

::table{of="element-members"}

## Events {#events}

::table{of="element-events"}

## Slots {#slots}

A child with `slot` set to one of these names replaces that default; a slot left empty keeps it. `data-board-action` on a child — `zoom-in`, `zoom-out`, `fit`, `colors` or `gestures` — makes a click on it do what that control does.

::table{of="element-slots"}
