import type { ViewNumber } from '@arrowz/engine'
import type { Dictionary, UiKey } from '@arrowz/engine/i18n'
import type { ViewFlag } from '../state/view.slice'

/**
 * A dictionary key whose entry is a plain string. `dict.t` is generic over
 * every key, and some entries are formatters taking arguments, so a field
 * typed as plain `UiKey` would not type-check at the call site.
 */
type PlainUiKey = { [K in UiKey]: Dictionary['ui'][K] extends string ? K : never }[UiKey]

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
 * — and a field that declares a ceiling its own store legally passes is a field that
 * goes `:invalid` on a legal value and reports `aria-valuemax=40` beside
 * `aria-valuenow=200`. The bounds are read from `VIEW_RANGE` at the point of
 * render instead, so the contradiction cannot be written down. Only `step`
 * lives here: it is a keyboard convenience, not a claim about what is allowed.
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
