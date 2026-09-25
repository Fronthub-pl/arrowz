import type { ViewNumber } from '@arrowz/engine'
import type { Dictionary, UiKey } from '@arrowz/engine/i18n'
import type { ViewFlag } from '../state/view.slice'
import type { UnitKey } from './knobLayout'

/**
 * A dictionary key whose entry is a plain string. `dict.t` is generic over
 * every key, and some entries are formatters taking arguments, so a field
 * typed as plain `UiKey` would not type-check at the call site.
 */
export type PlainUiKey = { [K in UiKey]: Dictionary['ui'][K] extends string ? K : never }[UiKey]

export interface ViewField {
  field: ViewNumber
  /** The dictionary key of the label. */
  label: PlainUiKey
  step: number
}

/**
 * The preview's number fields. No bounds here on purpose: a copy of
 * `VIEW_RANGE` drifts, and a field whose ceiling is below what its store
 * accepts goes `:invalid` on a legal value. The bounds are read from
 * `VIEW_RANGE` at render. `step` is a keyboard convenience, not a claim about
 * what is allowed.
 */
export const VIEW_FIELDS: readonly ViewField[] = [
  { field: 'cell', label: 'cellLabel', step: 1 },
  { field: 'stroke', label: 'strokeLabel', step: 0.05 },
  { field: 'headWidth', label: 'headWidthLabel', step: 0.05 },
  { field: 'headHeight', label: 'headHeightLabel', step: 0.05 },
  { field: 'top', label: 'topLabel', step: 1 },
]

/**
 * What the simple view keeps of the preview; the rest is advanced-only.
 */
export const SIMPLE_VIEW_FIELDS: readonly ViewNumber[] = ['stroke', 'headWidth', 'headHeight']
export const SIMPLE_VIEW_FLAGS: readonly ViewFlag[] = ['rounded', 'colored', 'highlightLongest']

/** The preview's flags with their full labels, in the panel's order. */
export const VIEW_FLAGS: readonly {
  flag: ViewFlag
  label: 'rounded' | 'colored' | 'highlightLongest' | 'voids' | 'showPoints'
}[] = [
  { flag: 'rounded', label: 'rounded' },
  { flag: 'colored', label: 'colored' },
  { flag: 'highlightLongest', label: 'highlightLongest' },
  { flag: 'voids', label: 'voids' },
  { flag: 'showPoints', label: 'showPoints' },
]

/**
 * A preview number as a knob row: its short label, its
 * description, its unit, and — for `headWidth` — the special value 0, which
 * the element draws as the automatic width. Keyed by the number, so a sixth
 * view number cannot be drawn without a row.
 */
export interface ViewRow {
  short: PlainUiKey
  help: PlainUiKey
  unit?: UnitKey
  /** 0 is the automatic value, drawn as a chip in the minimum's track. */
  auto?: true
}

export const VIEW_ROWS: Readonly<Record<ViewNumber, ViewRow>> = {
  cell: { short: 'viewShortCell', help: 'cellHelp', unit: 'px' },
  stroke: { short: 'viewShortStroke', help: 'strokeHelp', unit: 'cells' },
  headWidth: { short: 'viewShortHeadWidth', help: 'headWidthHelp', unit: 'cells', auto: true },
  headHeight: { short: 'viewShortHeadHeight', help: 'headHeightHelp', unit: 'cells' },
  top: { short: 'viewShortTop', help: 'topHelp', unit: 'arrows' },
}

/** A preview flag as a knob row: its short label and its description. */
export const FLAG_ROWS: Readonly<Record<ViewFlag, { short: PlainUiKey; help: PlainUiKey }>> = {
  rounded: { short: 'viewShortRounded', help: 'roundedHelp' },
  colored: { short: 'viewShortColored', help: 'coloredHelp' },
  highlightLongest: { short: 'viewShortHighlightLongest', help: 'highlightLongestHelp' },
  voids: { short: 'viewShortVoids', help: 'voidsHelp' },
  showPoints: { short: 'viewShortShowPoints', help: 'showPointsHelp' },
}

/**
 * Where the automatic head width's chip lands when it is released and the row
 * held no width before: the width the element draws at 0 for this stroke, so
 * the head does not jump. The rule is the engine's `pieceShape` (a stroke of
 * 0.5 or more draws a stick as wide as the line, a thinner one 0.4 + 0.9 ×
 * stroke), snapped to the field's step and held in its range; the test checks
 * it against `pieceShape` on both sides of 0.5.
 */
export function autoHeadWidth(stroke: number, step: number, max: number): number {
  const width = stroke >= 0.5 ? stroke : 0.4 + 0.9 * stroke
  // `toFixed` against the float tail a multiple of 0.05 picks up (12 × 0.05).
  return Math.min(max, Number((Math.round(width / step) * step).toFixed(6)))
}
