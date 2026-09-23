import type { ViewNumber } from '@arrowz/engine'
import type { Dictionary, UiKey } from '@arrowz/engine/i18n'
import type { ViewFlag } from '../state/view.slice'
import type { HelpEntry } from './FieldHelp'
import type { UnitKey } from './knobLayout'

/**
 * A dictionary key whose entry is a plain string. `dict.t` is generic over
 * every key, and some entries are formatters taking arguments, so a field
 * typed as plain `UiKey` would not type-check at the call site.
 */
export type PlainUiKey = { [K in UiKey]: Dictionary['ui'][K] extends string ? K : never }[UiKey]

export interface ViewField {
  field: ViewNumber
  /** The dictionary key of the label, and of the help paragraph where there is one. */
  label: PlainUiKey
  help?: PlainUiKey
  step: number
}

/**
 * The four (five, with `top`) number fields of the preview.
 *
 * No bounds here on purpose. A bound written here is a copy, and a copy drifts
 * from `VIEW_RANGE` — `cell` was once offered 1..40 where the CLI takes 1..200
 * — and a field that declares a ceiling its own store legally passes is a
 * field that goes `:invalid` on a legal value and reports `aria-valuemax=40`
 * beside `aria-valuenow=200`. The bounds are read from `VIEW_RANGE` at the
 * point of render instead, so the contradiction cannot be written down. Only
 * `step` lives here: it is a keyboard convenience, not a claim about what is
 * allowed.
 */
export const VIEW_FIELDS: readonly ViewField[] = [
  { field: 'cell', label: 'cellLabel', help: 'cellHelp', step: 1 },
  { field: 'stroke', label: 'strokeLabel', step: 0.05 },
  { field: 'headWidth', label: 'headWidthLabel', step: 0.05 },
  { field: 'headHeight', label: 'headHeightLabel', help: 'headHelp', step: 0.05 },
  { field: 'top', label: 'topLabel', step: 1 },
]

/**
 * What the simple view keeps of the preview (PR 4a, Ruling 9): `cell`, `top`
 * and `voids` are advanced-only, and the other six stay on screen in both
 * views.
 */
export const SIMPLE_VIEW_FIELDS: readonly ViewNumber[] = ['stroke', 'headWidth', 'headHeight']
export const SIMPLE_VIEW_FLAGS: readonly ViewFlag[] = ['rounded', 'colored', 'hilite']

/** The five flags, in the order the previous lab lists them, plus the point grid. */
export const VIEW_FLAGS: readonly {
  flag: ViewFlag
  label: 'rounded' | 'colored' | 'hilite' | 'voids' | 'showPoints'
}[] = [
  { flag: 'rounded', label: 'rounded' },
  { flag: 'colored', label: 'colored' },
  { flag: 'hilite', label: 'hilite' },
  { flag: 'voids', label: 'voids' },
  { flag: 'showPoints', label: 'showPoints' },
]


/** The heading's entries for the fields that have help (spec R7). */
export function viewHelpEntries(fields: readonly ViewField[], t: (key: PlainUiKey) => string): HelpEntry[] {
  return fields.flatMap((field) =>
    field.help === undefined ? [] : [{ id: `view-${field.field}-help`, label: t(field.label), text: t(field.help) }],
  )
}

/**
 * A preview number as a knob row (handoff 2, PR 3): its short label, its
 * description, its unit, and — for `headWidth` — the special value 0, which
 * the element draws as the automatic width. Keyed by the number, so a sixth
 * view number cannot be drawn without a row (`viewFields.test.ts`).
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
  stroke: { short: 'viewShortStroke', help: 'strokeHelp', unit: 'units' },
  headWidth: { short: 'viewShortHeadWidth', help: 'headHelp', unit: 'units', auto: true },
  headHeight: { short: 'viewShortHeadHeight', help: 'headHelp', unit: 'units' },
  top: { short: 'viewShortTop', help: 'topHelp', unit: 'pieces' },
}

/** A preview flag as a knob row: its short label and its description. */
export const FLAG_ROWS: Readonly<Record<ViewFlag, { short: PlainUiKey; help: PlainUiKey }>> = {
  rounded: { short: 'viewShortRounded', help: 'roundedHelp' },
  colored: { short: 'viewShortColored', help: 'coloredHelp' },
  hilite: { short: 'viewShortHilite', help: 'hiliteHelp' },
  voids: { short: 'viewShortVoids', help: 'voidsHelp' },
  showPoints: { short: 'viewShortShowPoints', help: 'showPointsHelp' },
}

/**
 * Where the automatic head width's chip lands when it is released and the row
 * held no width before: the width the element draws at 0 for this stroke, so
 * the head does not jump. The rule is the engine's (`pieceShape`,
 * geometry.ts: a stroke of 0.5 or more draws a stick as wide as the line,
 * a thinner one 0.4 + 0.9 × stroke), snapped to the field's step and held in
 * its range; `viewFields.test.ts` checks two strokes against it.
 */
export function autoHeadWidth(stroke: number, step: number, max: number): number {
  const width = stroke >= 0.5 ? stroke : 0.4 + 0.9 * stroke
  // `toFixed` against the float tail a multiple of 0.05 picks up (12 × 0.05).
  return Math.min(max, Number((Math.round(width / step) * step).toFixed(6)))
}
