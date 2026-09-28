// Every visible string of the element. English is the source, Polish the
// translation; the element picks the set from its `lang` attribute.
export type BoardLang = 'en' | 'pl'

export interface BoardLabels {
  zoomIn: string
  zoomOut: string
  fit: string
  /** The hint on a board that only pans: a plain drag. */
  dragHint: string
  /** The hint on a playable board in `drag` mode. */
  dragPlayHintMac: string
  dragPlayHintOther: string
  /** The hint on an inspecting board in `drag` mode: a click picks a piece, it plays nothing. */
  dragInspectHintMac: string
  dragInspectHintOther: string
  /** The hint in `click` mode, today's rule: the modifier pans. */
  clickHintMac: string
  clickHintOther: string
  /** The gesture switch: pressed means a plain click plays. */
  gesturesMac: string
  gesturesOther: string
  /** The same switch on an inspecting board, where a click plays nothing. */
  gesturesInspectMac: string
  gesturesInspectOther: string
  colors: string
  /** Shown in place of the board when the browser gives no WebGL2 context. */
  noWebgl: string
}

export const BOARD_LABELS: Record<BoardLang, BoardLabels> = {
  en: {
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    fit: 'Fit the board',
    dragHint: 'Drag to pan',
    dragPlayHintMac: 'Drag to pan · ⌘-click to play',
    dragPlayHintOther: 'Drag to pan · Ctrl-click to play',
    dragInspectHintMac: 'Drag to pan · ⌘-click an arrow',
    dragInspectHintOther: 'Drag to pan · Ctrl-click an arrow',
    clickHintMac: 'Hold ⌘ and drag to pan',
    clickHintOther: 'Hold Ctrl and drag to pan',
    gesturesMac: 'Click plays without ⌘',
    gesturesOther: 'Click plays without Ctrl',
    gesturesInspectMac: 'Click without ⌘',
    gesturesInspectOther: 'Click without Ctrl',
    colors: 'Arrow colours',
    noWebgl: 'This browser cannot draw the board: WebGL2 is unavailable.',
  },
  pl: {
    zoomIn: 'Powiększ',
    zoomOut: 'Pomniejsz',
    fit: 'Dopasuj planszę',
    dragHint: 'Przeciągnij, aby przesunąć',
    dragPlayHintMac: 'Przeciągnij, aby przesunąć · ⌘ + klik gra',
    dragPlayHintOther: 'Przeciągnij, aby przesunąć · Ctrl + klik gra',
    dragInspectHintMac: 'Przeciągnij, aby przesunąć · ⌘ + klik na strzałkę',
    dragInspectHintOther: 'Przeciągnij, aby przesunąć · Ctrl + klik na strzałkę',
    clickHintMac: 'Przytrzymaj ⌘ i przeciągnij, aby przesunąć',
    clickHintOther: 'Przytrzymaj Ctrl i przeciągnij, aby przesunąć',
    gesturesMac: 'Klik gra bez ⌘',
    gesturesOther: 'Klik gra bez Ctrl',
    gesturesInspectMac: 'Klik bez ⌘',
    gesturesInspectOther: 'Klik bez Ctrl',
    colors: 'Kolory strzałek',
    noWebgl: 'Ta przeglądarka nie narysuje planszy: WebGL2 jest niedostępny.',
  },
}

/** The labels for a BCP 47 tag; only the primary subtag matters, and anything but Polish is English. */
export function labelsFor(lang: string | null | undefined): BoardLabels {
  const primary = (lang ?? '').toLowerCase().split('-')[0]
  return primary === 'pl' ? BOARD_LABELS.pl : BOARD_LABELS.en
}
