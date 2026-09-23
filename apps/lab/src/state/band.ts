/**
 * The lab's width bands and its low window (handoff 2, PR 7), read from
 * `matchMedia` so JavaScript agrees with the stylesheets to the pixel: the
 * same queries decide both. XL ≥ 1600, L 1280–1599, M 1024–1279, S 768–1023,
 * XS < 768; low is under 700px tall and at least 768 wide.
 *
 * No React and no store: the ui slice reads the start band from here at
 * import, and the node test project imports the store with no `window`.
 */
export type Band = 'xl' | 'l' | 'm' | 's' | 'xs'

const FLOORS: readonly (readonly [Exclude<Band, 'xs'>, string])[] = [
  ['xl', '(min-width: 1600px)'],
  ['l', '(min-width: 1280px)'],
  ['m', '(min-width: 1024px)'],
  ['s', '(min-width: 768px)'],
]
const LOW = '(max-height: 699px) and (min-width: 768px)'

function media(query: string): MediaQueryList | null {
  return typeof window === 'undefined' || typeof window.matchMedia !== 'function' ? null : window.matchMedia(query)
}

/** The band the window is in now; the widest with no window to ask. */
export function readBand(): Band {
  for (const [band, query] of FLOORS) {
    const list = media(query)
    if (list === null) return 'xl'
    if (list.matches) return band
  }
  return 'xs'
}

/** The window is under 700px tall and at least 768 wide. */
export function readLow(): boolean {
  return media(LOW)?.matches ?? false
}

/** Below 1024px the settings drawer has no room beside the board (spec D3). */
export function narrow(band: Band): boolean {
  return band === 's' || band === 'xs'
}

/** Calls `onChange` whenever any of the band or low queries flips. */
export function subscribeBand(onChange: () => void): () => void {
  const lists = [...FLOORS.map(([, query]) => query), LOW]
    .map(media)
    .filter((list): list is MediaQueryList => list !== null)
  for (const list of lists) list.addEventListener('change', onChange)
  return () => {
    for (const list of lists) list.removeEventListener('change', onChange)
  }
}
