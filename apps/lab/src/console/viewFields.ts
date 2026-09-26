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

/** A view number as a row: labels, description, keyboard step and unit; bounds come from `VIEW_RANGE` at render. */
export interface NumberRowMeta {
  /** The full label, the row's tooltip and the ⌘K name. */
  label: PlainUiKey
  short: PlainUiKey
  help: PlainUiKey
  /** A keyboard convenience, not a claim about what is allowed. */
  step: number
  unit: UnitKey
  /** 0 is the automatic value, drawn as a chip in the minimum's track. */
  auto?: true
}

export interface FlagRowMeta {
  label: PlainUiKey
  short: PlainUiKey
  help: PlainUiKey
}

/**
 * The view's numbers and flags as rows, keyed by field, so a number or a flag
 * cannot be drawn without one. No bounds on purpose: a copy of `VIEW_RANGE` drifts.
 */
export const VIEW_ROWS: { readonly [K in ViewNumber]: NumberRowMeta } & { readonly [K in ViewFlag]: FlagRowMeta } = {
  cell: { label: 'cellLabel', short: 'viewShortCell', help: 'cellHelp', step: 1, unit: 'px' },
  stroke: { label: 'strokeLabel', short: 'viewShortStroke', help: 'strokeHelp', step: 0.05, unit: 'cells' },
  headWidth: {
    label: 'headWidthLabel',
    short: 'viewShortHeadWidth',
    help: 'headWidthHelp',
    step: 0.05,
    unit: 'cells',
    auto: true,
  },
  headHeight: {
    label: 'headHeightLabel',
    short: 'viewShortHeadHeight',
    help: 'headHeightHelp',
    step: 0.05,
    unit: 'cells',
  },
  top: { label: 'topLabel', short: 'viewShortTop', help: 'topHelp', step: 1, unit: 'arrows' },
  rounded: { label: 'rounded', short: 'viewShortRounded', help: 'roundedHelp' },
  colored: { label: 'colored', short: 'viewShortColored', help: 'coloredHelp' },
  highlightLongest: {
    label: 'highlightLongest',
    short: 'viewShortHighlightLongest',
    help: 'highlightLongestHelp',
  },
  voids: { label: 'voids', short: 'viewShortVoids', help: 'voidsHelp' },
  showPoints: { label: 'showPoints', short: 'viewShortShowPoints', help: 'showPointsHelp' },
}

/** The view's numbers and flags in the panel's and the palette's order. */
export const VIEW_NUMBERS: readonly ViewNumber[] = ['cell', 'stroke', 'headWidth', 'headHeight', 'top']
export const VIEW_FLAGS: readonly ViewFlag[] = ['rounded', 'colored', 'highlightLongest', 'voids', 'showPoints']

/**
 * What the simple view keeps of the preview; the rest is advanced-only.
 */
export const SIMPLE_VIEW_FIELDS: readonly ViewNumber[] = ['stroke', 'headWidth', 'headHeight']
export const SIMPLE_VIEW_FLAGS: readonly ViewFlag[] = ['rounded', 'colored', 'highlightLongest']

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
