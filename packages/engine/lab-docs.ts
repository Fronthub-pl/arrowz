// The documentation the lab's Docs tab prints: the element's API as reference
// rows, and the frame around the CLI help. Pure text; the help itself is not
// here, because `helpText()` in command.ts already produces it and a second
// copy would drift.
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
// sentence about the DOM can trip a rule this module does not break. Code
// examples live in apps/lab for the same reason.
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

// `as const satisfies` and not an annotation: an annotation wins over `as
// const` and collapses the key type to `string`, which would let a description
// go missing without the compiler noticing — measured while planning this PR.
export const ELEMENT_PROPS = [
  // `BoardData | null`, which is what the class declares (arrowz-board.ts:109).
  // The element's README says `Board | null` — narrower than the property
  // accepts, since `Board extends BoardData`. The README is the copy that
  // drifted; bringing it under a guard is the element package's work (spec §6).
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
  { key: 'fit', kind: 'method', signature: 'fit(): void' },
  { key: 'zoomBy', kind: 'method', signature: 'zoomBy(factor: number): void' },
  { key: 'animateExit', kind: 'method', signature: 'animateExit(pieceId: number, dir: number): Promise<void>' },
  { key: 'shake', kind: 'method', signature: 'shake(pieceId: number, distance: number): Promise<void>' },
  { key: 'saveState', kind: 'method', signature: 'saveState(): SessionSnapshot | null' },
  { key: 'loadState', kind: 'method', signature: 'loadState(snap: SessionSnapshot): void' },
  { key: 'restart', kind: 'method', signature: 'restart(): void' },
  { key: 'emit', kind: 'method', signature: 'emit(event: GameEvent): void' },
] as const satisfies readonly MemberRow[]

export const ELEMENT_EVENTS = [
  { key: 'piece-click', detail: '{ pieceId }' },
  { key: 'piece-removed', detail: '{ pieceId, left }' },
  { key: 'life-lost', detail: '{ pieceId, blockerId, distance }' },
  { key: 'finished', detail: '{ pieces }' },
  { key: 'viewport-change', detail: 'BoardViewport' },
] as const satisfies readonly EventRow[]

export type PropKey = (typeof ELEMENT_PROPS)[number]['key']
export type MemberKey = (typeof ELEMENT_MEMBERS)[number]['key']
export type EventKey = (typeof ELEMENT_EVENTS)[number]['key']

/** Everything one language needs to render both documentation pages. */
export interface Docs {
  readonly elementLead: string
  readonly props: Record<PropKey, string>
  readonly members: Record<MemberKey, string>
  readonly events: Record<EventKey, string>
  readonly cliLead: string
  /** Heading above the short usage block. */
  readonly cliShortHead: string
  /** Heading above the knob table block. */
  readonly cliKnobsHead: string
  /** One line saying the block below is the terminal's own text, in English. */
  readonly cliEnglishNote: string
  readonly colProp: string
  readonly colType: string
  readonly colAttr: string
  readonly colDefault: string
  readonly colMember: string
  readonly colSignature: string
  readonly colEvent: string
  /** The event's payload column. */
  readonly colDetail: string
  /** The last column of all three tables: the translated one. */
  readonly colDescription: string
  readonly headProps: string
  readonly headMembers: string
  readonly headEvents: string
  readonly headExample: string
  /** Where the long explanations live, since this page is a reference. */
  readonly readmePointer: string
  /** The accessible name of the note bar that carries `readmePointer`. */
  readonly infoLabel: string
}

const EN = {
  elementLead:
    'The board view of Arrowz as a web component. It draws a board, owns zoom and pan, animates the two effects of the game reducer, and reports clicks on pieces. Usable from plain HTML, React, Angular, Svelte or Vue.',
  props: {
    board: 'The board to draw. Assigning it always starts a fresh game and redraws in full.',
    view: 'Drawing options merged over the CLI defaults: stroke, head size, rounding, colour, highlight and paper.',
    interactive: 'Reports clicks on pieces without playing them.',
    play: 'Runs the reducer: a free piece rides out, a blocked one bounces. Implies interactivity.',
    pad: 'Margin around the board, in cells. Zero draws the cells edge to edge.',
    showPoints: 'Draws one dot per cell under the pieces, like the ruling of a notebook page.',
    pointColor: 'Colour of the point grid dots.',
    pointRadius: 'Radius of the point grid dots, in cells.',
    lang: 'The standard global language attribute; `pl` selects Polish labels, anything else English.',
    enableColors: 'Permission to colour the board. Without it the element stays monochrome and shows no colour button.',
    theme:
      'Name of a built-in theme — paper, ink, highlight and the colours of the pieces. An empty name selects none, and anything stated in `view` wins over it.',
  },
  members: {
    viewport: 'The view on screen, or null before a board and a host size are both known.',
    pieceCount: "How many pieces the layer is drawing; the board's own count, not the number of nodes.",
    gestureMode: "The rule the mouse and pen follow now: the player's choice on a playable board, panning otherwise.",
    fit: 'Fits the board into the host.',
    zoomBy: 'Zooms around the centre, clamped between the fitted scale and 48 pixels per cell.',
    animateExit: 'Rides the piece off the board along a direction and removes it; resolves when the ride ends.',
    shake: 'Nudges the piece a distance down its own track and back.',
    saveState: 'The game in progress as a value the host can store, or null before a board is set.',
    loadState: 'Restores a game; throws when the snapshot does not belong to this board.',
    restart: 'Drops the game and puts every piece back.',
    emit: 'The seam the game host drives the element through; a host that only renders a board never calls it.',
  },
  events: {
    'piece-click': 'A piece was clicked, while interactive or playing.',
    'piece-removed': 'A free piece started its ride off the board.',
    'life-lost': 'A blocked piece started its bounce against the piece that stops it.',
    'finished': 'The last piece finished its ride.',
    'viewport-change': 'The view changed; at most once per frame.',
  },
  cliLead:
    'The command line carves boards and prints them. This is the help it shows, rendered from the very function the terminal calls, so the two cannot disagree.',
  cliShortHead: 'Everyday help',
  cliKnobsHead: 'Every knob',
  cliEnglishNote: "The blocks below are the terminal's own text and stay in English.",
  colProp: 'Property',
  colType: 'Type',
  colAttr: 'Attribute',
  colDefault: 'Default',
  colMember: 'Member',
  colSignature: 'Signature',
  colEvent: 'Event',
  colDetail: 'Detail',
  colDescription: 'Description',
  headProps: 'Properties',
  headMembers: 'Methods and getters',
  headEvents: 'Events',
  headExample: 'Using it',
  readmePointer:
    'The long explanations — zoom and pan, the point grid, riding the track, playing the board — live in the package README.',
  infoLabel: 'Note',
} as const satisfies Docs

const PL = {
  elementLead:
    'Widok planszy Arrowz jako komponent webowy. Rysuje planszę, obsługuje powiększanie i przesuwanie, animuje dwa efekty reduktora gry i zgłasza kliknięcia w elementy. Działa w czystym HTML, w Reakcie, Angularze, Svelte i Vue.',
  props: {
    board: 'Plansza do narysowania. Przypisanie zawsze zaczyna nową grę i przerysowuje całość.',
    view: 'Opcje rysowania nałożone na domyślne z CLI: grubość, rozmiar grotu, zaokrąglenie, kolor, wyróżnienie i tło.',
    interactive: 'Zgłasza kliknięcia w elementy, ale ich nie rozgrywa.',
    play: 'Uruchamia reduktor: wolny element wyjeżdża, zablokowany odbija się. Włącza też interaktywność.',
    pad: 'Margines wokół planszy, w komórkach. Zero rysuje komórki od krawędzi do krawędzi.',
    showPoints: 'Rysuje po kropce na komórkę pod elementami, jak linie w zeszycie.',
    pointColor: 'Kolor kropek siatki punktów.',
    pointRadius: 'Promień kropek siatki punktów, w komórkach.',
    lang: 'Standardowy atrybut języka; `pl` wybiera polskie etykiety, cokolwiek innego angielskie.',
    enableColors:
      'Zgoda na kolorowanie planszy. Bez niej element zostaje monochromatyczny i nie pokazuje przycisku koloru.',
    theme:
      'Nazwa wbudowanego motywu — papier, tusz, podświetlenie i kolory elementów. Pusta nazwa nie wybiera żadnego, a to, co podano w `view`, ma pierwszeństwo.',
  },
  members: {
    viewport: 'Widok na ekranie albo null, dopóki nie są znane i plansza, i rozmiar kontenera.',
    pieceCount: 'Ile elementów rysuje warstwa; licznik samej planszy, nie liczba węzłów.',
    gestureMode:
      'Reguła, według której działa teraz mysz i pióro: wybór gracza na grywalnej planszy, w przeciwnym razie przesuwanie.',
    fit: 'Dopasowuje planszę do kontenera.',
    zoomBy: 'Powiększa względem środka, w granicach od dopasowania do 48 pikseli na komórkę.',
    animateExit: 'Wyprowadza element z planszy w zadanym kierunku i usuwa go; kończy się wraz z przejazdem.',
    shake: 'Popycha element o zadany dystans po jego własnym torze i z powrotem.',
    saveState: 'Trwająca gra jako wartość, którą host może zapisać, albo null, zanim ustawiono planszę.',
    loadState: 'Przywraca grę; rzuca wyjątkiem, gdy zrzut nie należy do tej planszy.',
    restart: 'Porzuca grę i przywraca wszystkie elementy na miejsca.',
    emit: 'Szew, przez który host gry steruje elementem; host, który tylko rysuje planszę, nie woła go.',
  },
  events: {
    'piece-click': 'Kliknięto element, w trybie interaktywnym albo w grze.',
    'piece-removed': 'Wolny element ruszył w drogę poza planszę.',
    'life-lost': 'Zablokowany element odbił się od tego, który go zatrzymał.',
    'finished': 'Ostatni element zakończył przejazd.',
    'viewport-change': 'Widok się zmienił; najwyżej raz na klatkę.',
  },
  cliLead:
    'Wiersz poleceń wycina plansze i je drukuje. To jest pomoc, którą wypisuje — renderowana z tej samej funkcji, którą woła terminal, więc obie nie mogą się rozjechać.',
  cliShortHead: 'Pomoc na co dzień',
  cliKnobsHead: 'Wszystkie pokrętła',
  cliEnglishNote: 'Bloki poniżej to własny tekst terminala i zostają po angielsku.',
  colProp: 'Właściwość',
  colType: 'Typ',
  colAttr: 'Atrybut',
  colDefault: 'Domyślnie',
  colMember: 'Składowa',
  colSignature: 'Sygnatura',
  colEvent: 'Zdarzenie',
  colDetail: 'Szczegóły',
  colDescription: 'Opis',
  headProps: 'Właściwości',
  headMembers: 'Metody i gettery',
  headEvents: 'Zdarzenia',
  headExample: 'Jak użyć',
  readmePointer:
    'Długie objaśnienia — powiększanie i przesuwanie, siatka punktów, jazda po torze, rozgrywka — są w pliku README pakietu.',
  infoLabel: 'Uwaga',
} as const satisfies Docs

/** The documentation in one language. Built by the surface once per language, as the dictionary is. */
export function docsFor(lang: Lang): Docs {
  return lang === 'pl' ? PL : EN
}
