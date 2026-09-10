// The inspector describes the element once, here: one record per input a host
// can set. The panel builds its controls from these records and the snippet
// reads the same records to decide what is worth printing, so a new property on
// <arrowz-board> costs one row rather than three edits in three files.
import {
  type BoardView,
  DEFAULT_PAD,
  DEFAULT_POINT_COLOR,
  DEFAULT_POINT_RADIUS,
  DEFAULT_SHOW_POINTS,
  DEFAULT_VIEW,
} from '../src/mod.ts'

/** What a control holds: a flag, a number, or a string (colour or language). */
export type ControlValue = boolean | number | string

interface Common {
  /** The attribute name (`show-points`) or the `view` field (`headWidth`). */
  id: string
  label: string
  /** One line under the label: what this input does to the board. */
  hint: string
}

export interface BoolControl extends Common {
  kind: 'bool'
  def: boolean
}
export interface NumberControl extends Common {
  kind: 'number'
  def: number
  min: number
  max: number
  step: number
}
export interface ColorControl extends Common {
  kind: 'color'
  def: string
}
export interface SelectControl extends Common {
  kind: 'select'
  def: string
  options: readonly string[]
}
export type Control = BoolControl | NumberControl | ColorControl | SelectControl

/**
 * The reflected attributes, in the order the panel and the snippet list them.
 *
 * Every flag here defaults to `false`, which is what lets the snippet print a
 * bare `play` and read the absence of an attribute as "default": a flag that
 * defaulted to `true` could not be turned off by leaving it out of the tag.
 */
export const ATTRIBUTES: readonly Control[] = [
  {
    kind: 'bool',
    id: 'play',
    label: 'play',
    hint: 'The element runs the game itself: a free piece rides out, a blocked one bounces.',
    def: false,
  },
  {
    kind: 'bool',
    id: 'interactive',
    label: 'interactive',
    hint: 'Clicks report piece-click without playing the move. Implied by play.',
    def: false,
  },
  {
    kind: 'bool',
    id: 'enable-colors',
    label: 'enable-colors',
    hint: 'Permission to colour the board; adds the fourth button to the chrome.',
    def: false,
  },
  {
    kind: 'bool',
    id: 'show-points',
    label: 'show-points',
    hint: 'Draws one dot per cell under the pieces. A full board hides them all.',
    def: DEFAULT_SHOW_POINTS,
  },
  {
    kind: 'number',
    id: 'pad',
    label: 'pad',
    hint: 'Margin around the board, in cells. 0 draws the cells edge to edge.',
    def: DEFAULT_PAD,
    min: 0,
    max: 20,
    step: 1,
  },
  {
    kind: 'color',
    id: 'point-color',
    label: 'point-color',
    hint: "The point grid's dots.",
    def: DEFAULT_POINT_COLOR,
  },
  {
    kind: 'number',
    id: 'point-radius',
    label: 'point-radius',
    hint: "The dots' radius, in cells. A piece's stroke is 0.25 wide, so 0.06 hides under it.",
    def: DEFAULT_POINT_RADIUS,
    min: 0.01,
    max: 0.5,
    step: 0.01,
  },
  {
    kind: 'select',
    id: 'lang',
    label: 'lang',
    hint: 'pl (or any pl-… tag) selects Polish labels, anything else English.',
    def: 'en',
    options: ['en', 'pl'],
  },
]

/** The fields of `view`, which is a property: no attribute mirrors any of these. */
export const VIEW_CONTROLS: readonly Control[] = [
  {
    kind: 'number',
    id: 'stroke',
    label: 'stroke',
    hint: 'Line width as a fraction of a cell.',
    def: DEFAULT_VIEW.stroke,
    min: 0.2,
    max: 0.9,
    step: 0.05,
  },
  {
    kind: 'number',
    id: 'headWidth',
    label: 'headWidth',
    hint: 'Arrowhead width in cells; 0 is automatic.',
    def: DEFAULT_VIEW.headWidth,
    min: 0,
    max: 0.9,
    step: 0.05,
  },
  {
    kind: 'number',
    id: 'headHeight',
    label: 'headHeight',
    hint: 'Arrowhead height in cells.',
    def: DEFAULT_VIEW.headHeight,
    min: 0.1,
    max: 1,
    step: 0.05,
  },
  {
    kind: 'bool',
    id: 'rounded',
    label: 'rounded',
    hint: 'Rounds the corners a piece turns through and caps its tail with a disc.',
    def: DEFAULT_VIEW.rounded,
  },
  {
    kind: 'bool',
    id: 'colored',
    label: 'colored',
    hint: 'Per-piece hues. Needs enable-colors for the board to honour it.',
    def: DEFAULT_VIEW.colored,
  },
  {
    kind: 'number',
    id: 'top',
    label: 'top',
    hint: 'How many of the longest pieces are drawn highlighted and on top.',
    def: DEFAULT_VIEW.top,
    min: 0,
    max: 50,
    step: 1,
  },
  {
    kind: 'bool',
    id: 'voids',
    label: 'voids',
    hint: 'Draws the cells the generator failed to carve.',
    def: DEFAULT_VIEW.voids,
  },
  { kind: 'color', id: 'ink', label: 'ink', hint: 'The pieces.', def: DEFAULT_VIEW.ink },
  { kind: 'color', id: 'paper', label: 'paper', hint: 'The board behind them.', def: DEFAULT_VIEW.paper },
  {
    kind: 'color',
    id: 'highlight',
    label: 'highlight',
    hint: 'The pieces `top` lifts above the rest.',
    def: DEFAULT_VIEW.highlight,
  },
]

const asNumber = (v: ControlValue): number => (typeof v === 'number' ? v : Number(v))
const asBool = (v: ControlValue): boolean => v === true
const asText = (v: ControlValue): string => String(v)

/**
 * The one place a control id becomes a typed field of `BoardView`.
 *
 * A generic `{ ...view, [id]: value }` types as a bag of numbers, flags and
 * strings, and would need a cast on the way back into the element. This switch
 * pays nine lines to say which field takes which kind, and an id the table does
 * not know leaves the view exactly as it was.
 */
export function withField(view: BoardView, id: string, value: ControlValue): BoardView {
  switch (id) {
    case 'stroke':
      return { ...view, stroke: asNumber(value) }
    case 'headWidth':
      return { ...view, headWidth: asNumber(value) }
    case 'headHeight':
      return { ...view, headHeight: asNumber(value) }
    case 'rounded':
      return { ...view, rounded: asBool(value) }
    case 'colored':
      return { ...view, colored: asBool(value) }
    case 'top':
      return { ...view, top: asNumber(value) }
    case 'voids':
      return { ...view, voids: asBool(value) }
    case 'ink':
      return { ...view, ink: asText(value) }
    case 'paper':
      return { ...view, paper: asText(value) }
    case 'highlight':
      return { ...view, highlight: asText(value) }
    default:
      return view
  }
}

/** The same view as a bag the snippet can walk by control id. */
export function viewRecord(view: BoardView): Record<string, ControlValue> {
  return { ...view }
}
