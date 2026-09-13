import type { ViewNumber } from '@arrowz/engine'
import type { Dictionary, UiKey } from '@arrowz/engine/i18n'

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
  min: number
  max: number
  step: number
}

/**
 * The four (five, with `top`) number fields of the preview, with the bounds
 * the old lab gives them — narrower than `VIEW_RANGE` on purpose: the range
 * is what the CLI accepts, these are what a person is offered. Typing past
 * them still works and still clamps, exactly as it does today.
 */
export const VIEW_FIELDS: readonly ViewField[] = [
  { field: 'cell', label: 'cellLabel', help: 'cellHelp', min: 1, max: 40, step: 1 },
  { field: 'stroke', label: 'strokeLabel', min: 0.2, max: 0.9, step: 0.05 },
  { field: 'headWidth', label: 'headWidthLabel', min: 0, max: 0.9, step: 0.05 },
  { field: 'headHeight', label: 'headHeightLabel', help: 'headHelp', min: 0.1, max: 1, step: 0.05 },
  { field: 'top', label: 'topLabel', min: 1, max: 50, step: 1 },
]
