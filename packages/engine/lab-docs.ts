// The descriptions in the reference tables of the lab's Docs tab, the tables'
// column names and the name of a page's note. The pages' prose is Markdown in
// apps/lab/docs-content; these stay here because each is keyed by a row of
// code, so the compiler keeps the two languages in step.
//
// The machine columns — key, type, attribute, default, signature — exist once
// and are NOT translated. That is the rule readme.test.ts states for the knob
// tables ("the prose is translated; the machine columns are not"), and it is
// what lets one guard check both languages at once: there is a single copy of
// the machine data to check.
//
// Prose in this file must not end a sentence with `document`, `window`,
// `process` or `Deno`, and must never write the browser's key-value store by
// its API name: neutral.test.ts greps this file's TEXT, not its code, so a
// sentence about the DOM can trip a rule this module does not break.
import type { Lang } from './lab-i18n.ts'

/** One row of the property table. `attribute` is null when the property has none. */
export interface PropRow {
  readonly key: string
  readonly type: string
  readonly attribute: string | null
  readonly def: string
}

/** One row of the method and getter table. */
export interface MemberRow {
  readonly key: string
  readonly kind: 'method' | 'getter'
  readonly signature: string
}

/** One row of the event table. */
export interface EventRow {
  readonly key: string
  readonly detail: string
}

/** One row of the slot table: the name is the only machine column. */
export interface SlotRow {
  readonly key: string
}

// `as const satisfies` and not an annotation: an annotation wins over `as
// const` and collapses the key type to `string`, which would let a description
// go missing without the compiler noticing.
export const ELEMENT_PROPS = [
  // `BoardData | null`, which is what the class declares: wider than `Board`,
  // since `Board extends BoardData` and the property accepts either.
  { key: 'board', type: 'BoardData | null', attribute: null, def: 'null' },
  { key: 'view', type: 'Partial<BoardView>', attribute: null, def: '{}' },
  { key: 'interactive', type: 'boolean', attribute: 'interactive', def: 'false' },
  { key: 'play', type: 'boolean', attribute: 'play', def: 'false' },
  { key: 'pad', type: 'number', attribute: 'pad', def: '4' },
  { key: 'showPoints', type: 'boolean', attribute: 'show-points', def: 'false' },
  { key: 'pointColor', type: 'string', attribute: 'point-color', def: "'#c9c9d6'" },
  { key: 'pointRadius', type: 'number', attribute: 'point-radius', def: '0.06' },
  { key: 'lang', type: 'string', attribute: 'lang', def: "''" },
  { key: 'enableColors', type: 'boolean', attribute: 'enable-colors', def: 'false' },
  { key: 'theme', type: 'string', attribute: 'theme', def: "''" },
] as const satisfies readonly PropRow[]

export const ELEMENT_MEMBERS = [
  { key: 'viewport', kind: 'getter', signature: 'BoardViewport | null' },
  { key: 'pieceCount', kind: 'getter', signature: 'number' },
  { key: 'gestureMode', kind: 'getter', signature: "'drag' | 'click'" },
  { key: 'colored', kind: 'getter', signature: 'boolean' },
  { key: 'fit', kind: 'method', signature: 'fit(): void' },
  { key: 'zoomBy', kind: 'method', signature: 'zoomBy(factor: number): void' },
  { key: 'toggleColors', kind: 'method', signature: 'toggleColors(): void' },
  { key: 'toggleGestures', kind: 'method', signature: 'toggleGestures(): void' },
  { key: 'animateExit', kind: 'method', signature: 'animateExit(pieceId: number, dir: number): Promise<void>' },
  { key: 'shake', kind: 'method', signature: 'shake(pieceId: number, distance: number): Promise<void>' },
  { key: 'saveState', kind: 'method', signature: 'saveState(): SessionSnapshot | null' },
  { key: 'loadState', kind: 'method', signature: 'loadState(snap: SessionSnapshot): void' },
  { key: 'restart', kind: 'method', signature: 'restart(): void' },
  { key: 'emit', kind: 'method', signature: 'emit(event: GameEvent): void' },
] as const satisfies readonly MemberRow[]

export const ELEMENT_EVENTS = [
  { key: 'piece-click', detail: '{ pieceId }' },
  { key: 'colored-change', detail: '{ colored }' },
  { key: 'gestures-change', detail: '{ mode }' },
  { key: 'piece-removed', detail: '{ pieceId, left }' },
  { key: 'life-lost', detail: '{ pieceId, blockerId, distance }' },
  { key: 'finished', detail: '{ pieces }' },
  { key: 'viewport-change', detail: 'BoardViewport' },
] as const satisfies readonly EventRow[]

export const ELEMENT_SLOTS = [
  { key: 'controls' },
  { key: 'hint' },
  { key: 'zoom-in' },
  { key: 'zoom-out' },
  { key: 'fit' },
  { key: 'colors' },
  { key: 'gestures' },
] as const satisfies readonly SlotRow[]

export type PropKey = (typeof ELEMENT_PROPS)[number]['key']
export type MemberKey = (typeof ELEMENT_MEMBERS)[number]['key']
export type EventKey = (typeof ELEMENT_EVENTS)[number]['key']
export type SlotKey = (typeof ELEMENT_SLOTS)[number]['key']

/** What the Docs tab's reference tables need in one language: descriptions, column names, the note's name. */
export interface Docs {
  readonly props: Record<PropKey, string>
  readonly members: Record<MemberKey, string>
  readonly events: Record<EventKey, string>
  readonly slots: Record<SlotKey, string>
  readonly colProp: string
  readonly colType: string
  readonly colAttr: string
  readonly colDefault: string
  readonly colMember: string
  readonly colSignature: string
  readonly colEvent: string
  readonly colSlot: string
  /** The event's payload column. */
  readonly colDetail: string
  /** The last column of every table: the translated one. */
  readonly colDescription: string
  /** The accessible name of a page's note, a blockquote in its Markdown. */
  readonly infoLabel: string
}

const EN = {
  props: {
    board: 'The board to draw. Assigning it always starts a fresh game and redraws in full.',
    view:
      'Drawing options merged over the CLI defaults: stroke, arrowhead size, rounding, colour, highlight and background.',
    interactive: 'Reports clicks on arrows without playing them.',
    play: 'Runs the reducer: a free arrow rides out, a blocked one bounces. Implies interactivity.',
    pad: 'Margin around the board, in cells, clamped to PAD_RANGE (0 to 16). Zero draws the cells edge to edge.',
    showPoints: 'Draws one dot per cell under the arrows, like the ruling of a notebook page.',
    pointColor: 'Colour of the dot grid.',
    pointRadius: 'Radius of the dots in the dot grid, in cells.',
    lang: 'The standard global language attribute; `pl` selects Polish labels, anything else English.',
    enableColors: 'Permission to colour the board. Without it the element stays monochrome and shows no colour button.',
    theme:
      'Name of a built-in theme: background, arrow colour, highlight and the multicolour palette. An empty name selects none, and anything stated in `view` wins over it.',
  },
  members: {
    viewport: 'The view on screen, or null before a board and a host size are both known.',
    pieceCount: "How many arrows the layer is drawing; the board's own count, not the number of nodes.",
    gestureMode: "The rule the mouse and pen follow now: the player's choice on a playable board, panning otherwise.",
    colored:
      "Whether the board is drawn in colour now: the permission first, then the button's choice, then `view.colored`.",
    fit: 'Fits the board into the host.',
    zoomBy: 'Zooms around the centre, clamped between the fitted scale and 48 pixels per cell.',
    toggleColors:
      'What the colour button does, the cancelable `colored-change` included. Does nothing without `enableColors`.',
    toggleGestures:
      "What the gesture switch does: flips the player's choice, keeps it for the next visit and fires `gestures-change`. Does nothing on a board a click cannot reach.",
    animateExit: 'Rides the arrow off the board along a direction and removes it; resolves when the ride ends.',
    shake: 'Nudges the arrow a distance down its own track and back.',
    saveState: 'The game in progress as a value the host can store, or null before a board is set.',
    loadState: 'Restores a game; throws when the snapshot does not belong to this board.',
    restart: 'Drops the game and puts every arrow back.',
    emit: 'The seam the game host drives the element through; a host that only renders a board never calls it.',
  },
  events: {
    'piece-click': 'An arrow was clicked, while interactive or playing.',
    'colored-change':
      'The colour button was clicked or `toggleColors()` was called; cancelable, and fired before the override changes. Cancelling clears the override instead, handing the colour back to `view.colored`.',
    'gestures-change':
      "The player's gesture choice changed, through the switch or `toggleGestures()`. Not fired for the choice read back on connect.",
    'piece-removed': 'A free arrow started its ride off the board.',
    'life-lost': 'A blocked arrow started its bounce against the arrow that stops it.',
    'finished': 'The last arrow finished its ride.',
    'viewport-change': 'The view changed; at most once per frame.',
  },
  slots: {
    controls:
      'The whole bar in the corner, holding the slots below. Content here replaces the bar and its position, and the slots below go with it.',
    hint: 'The line that says how the mouse works now. Not drawn under a coarse pointer.',
    'zoom-in': 'The + button.',
    'zoom-out': 'The − button.',
    fit: 'The ⤢ button.',
    colors:
      'The ◑ button, drawn only with `enableColors`. The element keeps `aria-pressed` and `hidden` on a projected one.',
    gestures:
      'The ☝ switch, drawn only on an `interactive` or `play` board and not under a coarse pointer. The element keeps `aria-pressed` and `hidden` on a projected one.',
  },
  colProp: 'Property',
  colType: 'Type',
  colAttr: 'Attribute',
  colDefault: 'Default',
  colMember: 'Member',
  colSignature: 'Signature',
  colEvent: 'Event',
  colSlot: 'Slot',
  colDetail: 'Detail',
  colDescription: 'Description',
  infoLabel: 'Note',
} as const satisfies Docs

const PL = {
  props: {
    board: 'Plansza do narysowania. Przypisanie zawsze zaczyna nową grę i przerysowuje całość.',
    view: 'Opcje rysowania nałożone na domyślne z CLI: grubość, rozmiar grotu, zaokrąglenie, kolor, wyróżnienie i tło.',
    interactive: 'Zgłasza kliknięcia w strzałki, ale ich nie rozgrywa.',
    play: 'Uruchamia reduktor: wolna strzałka wyjeżdża, zablokowana się odbija. Włącza też interaktywność.',
    pad:
      'Margines wokół planszy, w komórkach, w granicach PAD_RANGE (0 do 16). Zero rysuje komórki od krawędzi do krawędzi.',
    showPoints: 'Rysuje po kropce na komórkę pod strzałkami, jak linie w zeszycie.',
    pointColor: 'Kolor siatki kropek.',
    pointRadius: 'Promień kropek w siatce kropek, w komórkach.',
    lang: 'Standardowy atrybut języka; `pl` wybiera polskie etykiety, cokolwiek innego angielskie.',
    enableColors:
      'Zgoda na kolorowanie planszy. Bez niej element zostaje monochromatyczny i nie pokazuje przycisku koloru.',
    theme:
      'Nazwa wbudowanego motywu: tło, kolor strzałek, wyróżnienie i paleta wielobarwna. Pusta nazwa nie wybiera żadnego, a to, co podano w `view`, ma pierwszeństwo.',
  },
  members: {
    viewport: 'Widok na ekranie albo null, dopóki nie są znane i plansza, i rozmiar kontenera.',
    pieceCount: 'Ile strzałek rysuje warstwa; licznik samej planszy, nie liczba węzłów.',
    gestureMode:
      'Reguła, według której działa teraz mysz i pióro: wybór gracza na grywalnej planszy, w przeciwnym razie przesuwanie.',
    colored: 'Czy plansza jest teraz rysowana w kolorze: najpierw zgoda, potem wybór przycisku, potem `view.colored`.',
    fit: 'Dopasowuje planszę do kontenera.',
    zoomBy: 'Powiększa względem środka, w granicach od dopasowania do 48 pikseli na komórkę.',
    toggleColors:
      'To samo co przycisk koloru, łącznie z anulowalnym `colored-change`. Bez `enableColors` nic nie robi.',
    toggleGestures:
      'To samo co przełącznik gestów: odwraca wybór gracza, zapamiętuje go na następną wizytę i wysyła `gestures-change`. Na planszy, do której klik nie dociera, nic nie robi.',
    animateExit: 'Wyprowadza strzałkę z planszy w zadanym kierunku i usuwa ją; kończy się wraz z przejazdem.',
    shake: 'Popycha strzałkę o zadany dystans po jej własnym torze i z powrotem.',
    saveState: 'Trwająca gra jako wartość, którą host może zapisać, albo null, zanim ustawiono planszę.',
    loadState: 'Przywraca grę; rzuca wyjątkiem, gdy zrzut nie należy do tej planszy.',
    restart: 'Porzuca grę i przywraca wszystkie strzałki na miejsca.',
    emit: 'Szew, przez który host gry steruje elementem; host, który tylko rysuje planszę, nie woła go.',
  },
  events: {
    'piece-click': 'Kliknięto strzałkę, w trybie interaktywnym albo w grze.',
    'colored-change':
      'Kliknięto przycisk koloru albo wywołano `toggleColors()`; można je anulować, leci przed zmianą nadpisania. Anulowanie czyści nadpisanie i oddaje kolor `view.colored`.',
    'gestures-change':
      'Zmienił się wybór gestu gracza, przełącznikiem albo przez `toggleGestures()`. Nie leci przy odczycie zapamiętanego wyboru po podłączeniu.',
    'piece-removed': 'Wolna strzałka ruszyła w drogę poza planszę.',
    'life-lost': 'Zablokowana strzałka odbiła się od tej, która ją zatrzymała.',
    'finished': 'Ostatnia strzałka zakończyła przejazd.',
    'viewport-change': 'Widok się zmienił; najwyżej raz na klatkę.',
  },
  slots: {
    controls:
      'Cały pasek w rogu, razem ze slotami poniżej. Treść tutaj zastępuje pasek i jego położenie, a sloty poniżej znikają wraz z nim.',
    hint: 'Wiersz, który mówi, jak teraz działa mysz. Nie jest rysowany przy grubym wskaźniku.',
    'zoom-in': 'Przycisk +.',
    'zoom-out': 'Przycisk −.',
    fit: 'Przycisk ⤢.',
    colors:
      'Przycisk ◑, rysowany tylko z `enableColors`. Na podstawionym element sam ustawia `aria-pressed` i `hidden`.',
    gestures:
      'Przełącznik ☝, rysowany tylko na planszy `interactive` albo `play` i nie przy grubym wskaźniku. Na podstawionym element sam ustawia `aria-pressed` i `hidden`.',
  },
  colProp: 'Właściwość',
  colType: 'Typ',
  colAttr: 'Atrybut',
  colDefault: 'Domyślnie',
  colMember: 'Składowa',
  colSignature: 'Sygnatura',
  colEvent: 'Zdarzenie',
  colSlot: 'Nazwa slotu',
  colDetail: 'Szczegóły',
  colDescription: 'Opis',
  infoLabel: 'Uwaga',
} as const satisfies Docs

/** The documentation in one language. Built by the surface once per language, as the dictionary is. */
export function docsFor(lang: Lang): Docs {
  return lang === 'pl' ? PL : EN
}
