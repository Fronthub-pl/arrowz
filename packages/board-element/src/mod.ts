// Public surface of @arrowz/board-element. Importing this module registers
// <arrowz-board>; the types make the tag and its events known to TypeScript.
import type {
  ArrowzBoard,
  FinishedEvent,
  LifeLostEvent,
  PieceClickEvent,
  PieceRemovedEvent,
  ViewportChangeEvent,
} from './arrowz-board.ts'

export { ArrowzBoard, DEFAULT_PAD, WHEEL_RATE, ZOOM_STEP } from './arrowz-board.ts'
export type {
  BoardViewport,
  FinishedEvent,
  LifeLostEvent,
  PieceClickEvent,
  PieceRemovedEvent,
  ViewportChangeEvent,
} from './arrowz-board.ts'
export { GameHost, MIN_SHAKE_CELLS } from './game-host.ts'
export type { GameEvent, GameTarget } from './game-host.ts'
export { DEFAULT_VIEW, hueOf, SHAKE_MS } from './svg-layer.ts'
export type { BoardView } from './svg-layer.ts'
export { BOARD_LABELS, labelsFor } from './i18n.ts'
export type { BoardLabels, BoardLang } from './i18n.ts'
export { EXIT_MAX_MS, EXIT_MIN_MS, EXIT_SPEED } from './track.ts'
export { MAX_CELL_PX, MIN_PAD_PX } from './viewport.ts'

declare global {
  interface HTMLElementTagNameMap {
    'arrowz-board': ArrowzBoard
  }
  interface HTMLElementEventMap {
    'piece-click': PieceClickEvent
    'piece-removed': PieceRemovedEvent
    'life-lost': LifeLostEvent
    'finished': FinishedEvent
    'viewport-change': ViewportChangeEvent
  }
}
