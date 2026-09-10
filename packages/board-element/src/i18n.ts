// Every visible string of the element. English is the source, Polish the
// translation; the element picks the set from its `lang` attribute.
export type BoardLang = 'en' | 'pl'

export interface BoardLabels {
  zoomIn: string
  zoomOut: string
  fit: string
  panHintMac: string
  panHintOther: string
  colors: string
  /** Shown in place of the board when the browser gives no WebGL2 context. */
  noWebgl: string
}

export const BOARD_LABELS: Record<BoardLang, BoardLabels> = {
  en: {
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    fit: 'Fit the board',
    panHintMac: 'Hold ⌘ and drag to pan',
    panHintOther: 'Hold Ctrl and drag to pan',
    colors: 'Piece colours',
    noWebgl: 'This browser cannot draw the board: WebGL2 is unavailable.',
  },
  pl: {
    zoomIn: 'Powiększ',
    zoomOut: 'Pomniejsz',
    fit: 'Dopasuj planszę',
    panHintMac: 'Przytrzymaj ⌘ i przeciągnij, aby przesunąć',
    panHintOther: 'Przytrzymaj Ctrl i przeciągnij, aby przesunąć',
    colors: 'Kolory figur',
    noWebgl: 'Ta przeglądarka nie narysuje planszy: WebGL2 jest niedostępny.',
  },
}

/** The labels for a BCP 47 tag; only the primary subtag matters, and anything but Polish is English. */
export function labelsFor(lang: string | null | undefined): BoardLabels {
  const primary = (lang ?? '').toLowerCase().split('-')[0]
  return primary === 'pl' ? BOARD_LABELS.pl : BOARD_LABELS.en
}
