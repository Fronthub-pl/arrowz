/**
 * The element page's one code example. Here rather than in the engine module:
 * an example naming the page's global objects would trip `neutral.test.ts`,
 * which greps the text of engine sources. Its own module rather than a
 * constant in `ElementDocs.tsx` so `codeTokens.test.ts` can scan the very text
 * the page shows without mounting React.
 */
export const ELEMENT_EXAMPLE = `<arrowz-board id="board" interactive lang="pl" style="width: 100%; height: 80vh"></arrowz-board>
<script type="module">
  import '@arrowz/board-element'
  import { defaultParams, generate } from '@arrowz/engine'
  const el = document.getElementById('board')
  el.board = generate({ ...defaultParams(), W: 50, H: 50, seed: 7 }).board
  el.addEventListener('piece-click', (e) => console.log('piece', e.detail.pieceId))
</script>`
