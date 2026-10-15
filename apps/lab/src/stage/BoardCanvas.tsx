import { ArrowzBoard } from '@fronthub/arrowz-board'
import type {
  ColoredChangeEvent,
  FinishedEvent,
  LifeLostEvent,
  PieceClickEvent,
  PieceHoverEvent,
  PieceRemovedEvent,
} from '@fronthub/arrowz-board'
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
    onPieceHover: 'piece-hover' as EventName<PieceHoverEvent>,
    onPieceRemoved: 'piece-removed' as EventName<PieceRemovedEvent>,
    onLifeLost: 'life-lost' as EventName<LifeLostEvent>,
    onFinished: 'finished' as EventName<FinishedEvent>,
    onColoredChange: 'colored-change' as EventName<ColoredChangeEvent>,
  },
})
