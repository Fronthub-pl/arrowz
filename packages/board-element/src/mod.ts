// Public surface of @arrowz/board-element. Importing this module registers
// <arrowz-board>; the types make the tag and its events known to TypeScript.
import type { ArrowzBoard, PieceClickEvent, ViewportChangeEvent } from './arrowz-board.ts'

export { ArrowzBoard, WHEEL_RATE, ZOOM_STEP } from './arrowz-board.ts'
export type { BoardViewport, PieceClickEvent, ViewportChangeEvent } from './arrowz-board.ts'
export { DEFAULT_VIEW, EXIT_MS, SHAKE_MS } from './svg-layer.ts'
export type { BoardView } from './svg-layer.ts'
export { BOARD_LABELS, labelsFor } from './i18n.ts'
export type { BoardLabels, BoardLang } from './i18n.ts'
export { MAX_CELL_PX } from './viewport.ts'

declare global {
  interface HTMLElementTagNameMap {
    'arrowz-board': ArrowzBoard
  }
  interface HTMLElementEventMap {
    'piece-click': PieceClickEvent
    'viewport-change': ViewportChangeEvent
  }
}
