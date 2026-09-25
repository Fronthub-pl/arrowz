import type { HashView } from './url'

/**
 * A complete view as the lab writes it, so a round trip returns it unchanged:
 * a link written now names "no colour" as `''` / `[]`. The point grid and the
 * margin are left out: `toEqual` treats an absent key and an `undefined` one alike.
 */
export const VIEW: HashView = {
  cell: 12,
  stroke: 0.5,
  headWidth: 0,
  headHeight: 1,
  top: 5,
  rounded: true,
  colored: false,
  highlightLongest: true,
  voids: true,
  lang: 'en',
  theme: '',
  palette: [],
  paper: '',
  ink: '',
  highlightColor: '',
}
