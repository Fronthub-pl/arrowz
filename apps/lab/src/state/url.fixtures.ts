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
  hilite: true,
  lang: 'en',
  theme: undefined,
  // `palette` is left out rather than added as `palette: undefined`: an
  // absent optional key and one explicitly set to `undefined` compare equal
  // under `toEqual`, so the round-trip test below needs no update for a new
  // optional `HashView` field whose absent value is `undefined` — only for
  // one whose absence means something else.
}
