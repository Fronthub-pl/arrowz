import type { HashView } from './url'

/** A complete view, shared by the codec's test and the hook's. */
export const VIEW: HashView = {
  cell: 12,
  stroke: 0.5,
  headWidth: 0,
  headHeight: 1,
  top: 5,
  rounded: true,
  colored: false,
  highlightLongest: true,
  lang: 'en',
  theme: undefined,
  // `palette` and later optional fields are left out: `toEqual` treats an
  // absent key and an `undefined` one alike.
}
