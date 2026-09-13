import { ArrowzBoard } from '@arrowz/board-element'
import type { PieceClickEvent, ViewportChangeEvent } from '@arrowz/board-element'
import { createComponent, type EventName } from '@lit/react'
import * as React from 'react'

/**
 * The application's only `@lit/react` site. The element takes the board and
 * the view as objects; React alone would stringify them onto attributes, and
 * `createComponent` sets properties instead. Importing the element class also
 * registers the tag.
 */
export const BoardCanvas = createComponent({
  tagName: 'arrowz-board',
  elementClass: ArrowzBoard,
  react: React,
  events: {
    onPieceClick: 'piece-click' as EventName<PieceClickEvent>,
    onViewportChange: 'viewport-change' as EventName<ViewportChangeEvent>,
  },
})
