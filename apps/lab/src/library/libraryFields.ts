import type { ViewField } from '../console/viewFields'
import type { ViewFlag } from '../state/view.slice'

/**
 * What a stored board's view offers for editing: the same three numbers the old
 * lab's `libStroke`, `libHeadWidth` and `libHeadHeight` offer, and the two flags
 * beside them.
 *
 * Its own constant, and not `SIMPLE_VIEW_FIELDS`, though the three names
 * coincide (Ruling 3). The simple view holds this trio because `cell` and `top`
 * are advanced; the library holds it because a stored board carries no
 * highlight and its `cell` is the export it was saved with. Sharing one list
 * would make a change to the simple view a silent change here.
 */
export const LIBRARY_VIEW_FIELDS: readonly ViewField[] = [
  { field: 'stroke', label: 'strokeLabel', step: 0.05 },
  { field: 'headWidth', label: 'headWidthLabel', step: 0.05 },
  // Ruling 17 traded this help away because the paragraph used to live in the
  // card; now that it lives under the panel heading (spec R7) that cost is
  // gone, and the detail gets it back.
  { field: 'headHeight', label: 'headHeightLabel', help: 'headHelp', step: 0.05 },
]

export const LIBRARY_VIEW_FLAGS: readonly { flag: ViewFlag; label: 'rounded' | 'colored' }[] = [
  { flag: 'rounded', label: 'rounded' },
  { flag: 'colored', label: 'colored' },
]
