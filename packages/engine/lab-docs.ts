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
import type { EnvVar } from './command.ts'

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

/** The package an exported type is declared in: the element's own, or the engine, which it re-exports. */
export type ExportSource = '@arrowz/board-element' | '@arrowz/engine'

/** One exported type: where it is declared, and its fields — or, for a union, its members as literals. */
export interface TypeRow {
  readonly key: string
  readonly from: ExportSource
  readonly shape: string
}

/** One exported function and its signature, as the compiler prints it. */
export interface FunctionRow {
  readonly key: string
  readonly signature: string
}

/** One exported constant, by name: the lab reads its value from the package itself. */
export interface ConstantRow {
  readonly key: string
}

/** One exported class: how to construct it, and its public members (none listed for the element: its tables come first). */
export interface ClassRow {
  readonly key: string
  readonly create: string
  readonly members: readonly string[]
}

export const ELEMENT_TYPES = [
  { key: 'BoardData', from: '@arrowz/engine', shape: 'W, H, owner, pieces' },
  {
    key: 'BoardView',
    from: '@arrowz/board-element',
    shape: 'stroke, headWidth, headHeight, rounded, colored, top, voids, ink, paper, highlight, palette',
  },
  {
    key: 'BoardViewport',
    from: '@arrowz/board-element',
    shape: 'cellPx, originX, originY, fitted, hostWidth, hostHeight',
  },
  { key: 'BoardColours', from: '@arrowz/engine', shape: 'paper, ink, highlight, palette' },
  { key: 'BoardTheme', from: '@arrowz/engine', shape: 'paper, ink, highlight, palette, source, licence, url' },
  {
    key: 'BoardLabels',
    from: '@arrowz/board-element',
    shape:
      'zoomIn, zoomOut, fit, dragHint, dragPlayHintMac, dragPlayHintOther, dragInspectHintMac, dragInspectHintOther, clickHintMac, clickHintOther, gesturesMac, gesturesOther, gesturesInspectMac, gesturesInspectOther, colors, noWebgl',
  },
  { key: 'BoardLang', from: '@arrowz/board-element', shape: "'en' | 'pl'" },
  { key: 'GestureMode', from: '@arrowz/board-element', shape: "'drag' | 'click'" },
  { key: 'GameEvent', from: '@arrowz/board-element', shape: "'piece-removed' | 'life-lost' | 'finished'" },
  { key: 'GameTarget', from: '@arrowz/board-element', shape: 'animateExit, shake, emit' },
  { key: 'Session', from: '@arrowz/engine', shape: 'board, gone, index, left, status' },
  { key: 'SessionSnapshot', from: '@arrowz/engine', shape: 'v, board, removed, colored' },
  { key: 'PieceClickEvent', from: '@arrowz/board-element', shape: 'pieceId' },
  { key: 'PieceRemovedEvent', from: '@arrowz/board-element', shape: 'pieceId, left' },
  { key: 'LifeLostEvent', from: '@arrowz/board-element', shape: 'pieceId, blockerId, distance' },
  { key: 'FinishedEvent', from: '@arrowz/board-element', shape: 'pieces' },
  {
    key: 'ViewportChangeEvent',
    from: '@arrowz/board-element',
    shape: 'cellPx, originX, originY, fitted, hostWidth, hostHeight',
  },
  { key: 'ColoredChangeEvent', from: '@arrowz/board-element', shape: 'colored' },
  { key: 'ColoredChangeDetail', from: '@arrowz/board-element', shape: 'colored' },
  { key: 'GesturesChangeEvent', from: '@arrowz/board-element', shape: 'mode' },
  { key: 'GesturesChangeDetail', from: '@arrowz/board-element', shape: 'mode' },
] as const satisfies readonly TypeRow[]

export const ELEMENT_FUNCTIONS = [
  { key: 'resolveColours', signature: 'resolveColours(theme: string, stated: Partial<BoardColours>): BoardColours' },
  { key: 'themeOf', signature: 'themeOf(name: string): BoardTheme | null' },
  { key: 'assignPalette', signature: 'assignPalette(board: BoardData, n: number): Int32Array<ArrayBufferLike>' },
  { key: 'hueOf', signature: 'hueOf(id: number): string' },
  { key: 'hueDegrees', signature: 'hueDegrees(id: number): number' },
  { key: 'hueBytes', signature: 'hueBytes(id: number): [number, number, number]' },
  { key: 'boardViewOf', signature: 'boardViewOf(view: View, voids: boolean): Partial<BoardView>' },
  { key: 'labelsFor', signature: 'labelsFor(lang: string | null | undefined): BoardLabels' },
] as const satisfies readonly FunctionRow[]

export const ELEMENT_CONSTANTS = [
  { key: 'DEFAULT_PAD' },
  { key: 'DEFAULT_SHOW_POINTS' },
  { key: 'DEFAULT_POINT_COLOR' },
  { key: 'DEFAULT_POINT_RADIUS' },
  { key: 'PAD_RANGE' },
  { key: 'POINT_RADIUS_RANGE' },
  { key: 'DEFAULT_VIEW' },
  { key: 'THEMES' },
  { key: 'BOARD_LABELS' },
  { key: 'GESTURE_STORAGE_KEY' },
  { key: 'ZOOM_STEP' },
  { key: 'WHEEL_RATE' },
  { key: 'MAX_CELL_PX' },
  { key: 'MIN_PAD_PX' },
  { key: 'MIN_POINT_CELL_PX' },
  { key: 'EXIT_SPEED' },
  { key: 'EXIT_MIN_MS' },
  { key: 'EXIT_MAX_MS' },
  { key: 'SHAKE_MS' },
  { key: 'MIN_SHAKE_CELLS' },
] as const satisfies readonly ConstantRow[]

export const ELEMENT_CLASSES = [
  { key: 'ArrowzBoard', create: 'new ArrowzBoard()', members: [] },
  {
    key: 'GameHost',
    create: 'new GameHost(target: GameTarget)',
    members: [
      'goneIds',
      'board',
      'isGone(pieceId)',
      'setBoard(board)',
      'click(pieceId)',
      'save(colored)',
      'load(snap)',
    ],
  },
] as const satisfies readonly ClassRow[]

export type TypeKey = (typeof ELEMENT_TYPES)[number]['key']
export type FunctionKey = (typeof ELEMENT_FUNCTIONS)[number]['key']
export type ConstantKey = (typeof ELEMENT_CONSTANTS)[number]['key']
export type ClassKey = (typeof ELEMENT_CLASSES)[number]['key']

/**
 * A constant's value as the Docs tab and the element's README write it: a
 * string quoted, a list in brackets, an object as `{ key: value }`, and an
 * object of objects (`THEMES`, `BOARD_LABELS`) as its keys alone.
 */
export function spellValue(value: unknown): string {
  if (typeof value === 'string') return `'${value}'`
  if (Array.isArray(value)) return `[${value.map(spellValue).join(', ')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
    if (entries.some(([, v]) => typeof v === 'object' && v !== null && !Array.isArray(v))) {
      return `{ ${entries.map(([k]) => k).join(', ')} }`
    }
    return `{ ${entries.map(([k, v]) => `${k}: ${spellValue(v)}`).join(', ')} }`
  }
  return String(value)
}

/**
 * The lab's own tables on the Docs tab, keyed as the lab's code names them: a
 * key as the lab shows it, a palette row by its id, a link field by its name.
 * The rows come from `apps/lab`, which the engine cannot import, so
 * `docs/tables.test.ts` there holds these keys to that code both ways.
 */
export type LabKey = 'G' | '[' | ']' | 'R' | 'S' | 'F' | 'Esc' | '⌘G' | '⌘S' | '⌘K'
export type PaletteId =
  | 'run-generate'
  | 'run-generate-save'
  | 'run-save'
  | 'run-reseed'
  | 'run-defaults'
  | 'run-abort'
  | 'run-check-seeds'
  | 'run-solo'
  | 'go-lab'
  | 'go-boards'
  | 'go-open-file'
  | 'go-docs-arrowz'
  | 'go-docs-lab'
  | 'go-docs-cli'
  | 'go-docs-element'
  | 'go-view'
  | 'go-lang'
export type LinkField =
  | 'cell'
  | 'stroke'
  | 'headWidth'
  | 'headHeight'
  | 'top'
  | 'colored'
  | 'rounded'
  | 'highlightLongest'
  | 'voids'
  | 'showPoints'
  | 'pointColor'
  | 'pointRadius'
  | 'theme'
  | 'palette'
  | 'paper'
  | 'ink'
  | 'highlightColor'
  | 'pad'
  | 'lang'

/** What the Docs tab's reference tables need in one language: descriptions, column names, the note's name. */
export interface Docs {
  readonly props: Record<PropKey, string>
  readonly members: Record<MemberKey, string>
  readonly events: Record<EventKey, string>
  readonly slots: Record<SlotKey, string>
  readonly keys: Record<LabKey, string>
  readonly palette: Record<PaletteId, string>
  readonly linkFields: Record<LinkField, string>
  /** The environment variables of the CLI page's table, by name (`ENV_VARS`). */
  readonly env: Record<EnvVar, string>
  /** The export tables' descriptions, by export name. */
  readonly types: Record<TypeKey, string>
  readonly functions: Record<FunctionKey, string>
  readonly constants: Record<ConstantKey, string>
  readonly classes: Record<ClassKey, string>
  readonly colProp: string
  readonly colType: string
  readonly colAttr: string
  readonly colDefault: string
  readonly colMember: string
  readonly colSignature: string
  readonly colEvent: string
  readonly colSlot: string
  readonly colKey: string
  readonly colCommand: string
  /** The palette's section a row sits in: run or go to. */
  readonly colSection: string
  readonly colField: string
  /** The knob table's columns; the default and the description are the shared `colDefault`, `colDescription`. */
  readonly colGroup: string
  readonly colFlag: string
  readonly colRange: string
  readonly colStep: string
  /** The rule table's first column: the flags a rule is about. */
  readonly colFlags: string
  readonly colVariable: string
  /** The event's payload column. */
  readonly colDetail: string
  /** The export tables' columns; the type table's first column is the shared `colType`. */
  readonly colFrom: string
  readonly colShape: string
  readonly colFunction: string
  readonly colConstant: string
  readonly colValue: string
  readonly colClass: string
  readonly colCreate: string
  readonly colMembers: string
  /** The theme table's columns. */
  readonly colTheme: string
  readonly colColours: string
  readonly colSource: string
  readonly colLicence: string
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
  keys: {
    'G': 'Generates a board from the settings.',
    '[': 'Steps the seed back by one and generates.',
    ']': 'Steps the seed forward by one and generates.',
    'R': 'Shows or hides the report.',
    'S': 'Shows or hides the settings.',
    'F': 'Full view: the board alone.',
    'Esc': 'Puts away one layer: an open sheet first, then the report, then the settings.',
    '⌘G': 'Generates a board and saves it.',
    '⌘S': 'Saves the board on screen.',
    '⌘K': 'Opens the command palette, on every screen, also from a field.',
  },
  palette: {
    'run-generate': 'Generates a board from the settings.',
    'run-generate-save': 'Generates a board and saves it.',
    'run-save': 'Saves the board on screen.',
    'run-reseed': 'Draws a random seed and generates.',
    'run-defaults': 'Puts every setting back to its default and generates.',
    'run-abort': 'Stops the run and keeps the board made so far; while one is stopping, _Discard_ drops its board.',
    'run-check-seeds': 'Runs the settings over a number of seeds (advanced view only).',
    'run-solo': 'The board alone.',
    'go-lab': 'The settings, the board and the report.',
    'go-boards': 'The saved boards.',
    'go-open-file': 'Opens a board file from disk.',
    'go-docs-arrowz': 'The puzzle, its one rule played on three small boards, and its words.',
    'go-docs-lab': 'How the lab works: its views, keys, palette and links.',
    'go-docs-cli': "The command line's documentation.",
    'go-docs-element': 'The documentation of `<arrowz-board>`.',
    'go-view': 'Switches the view; in the simple view the row reads _Advanced view_.',
    'go-lang': 'Switches the language; in Polish the row offers English.',
  },
  linkFields: {
    cell: 'The cell size of an exported SVG, in pixels.',
    stroke: 'The line thickness, in cells.',
    headWidth: "The arrowhead's width in cells; 0 is automatic.",
    headHeight: "The arrowhead's length, in cells.",
    top: 'How many longest arrows are marked.',
    colored: 'One colour per arrow.',
    rounded: 'Rounded turns and a disc tail.',
    highlightLongest: 'Marks the longest arrows.',
    voids: 'Shows the cells the generator left empty.',
    showPoints: 'The dot grid.',
    pointColor: 'The colour of its dots.',
    pointRadius: 'The radius of its dots, in cells.',
    theme: 'A built-in theme by name.',
    palette: 'The arrow colours while `colored` is on.',
    paper: 'The background colour.',
    ink: 'The colour of the arrows.',
    highlightColor: 'The colour of the marked arrows.',
    pad: 'The margin around the board, in cells.',
    lang: "The page's language, `en` or `pl`.",
  },
  env: {
    ARROWZ_BOARDS_DIR: 'Where boards are saved, instead of `packages/cli/boards/`.',
    CARVE_TRACE: "Set to `1`, prints the generator's progress on stderr while it works.",
    GIANT_DEBUG: 'Set to `1`, prints on stderr how each arrow of the skeleton was grown.',
    CARVE_TIMEOUT_S:
      'Gives up a board after that many seconds; `carve` saves what it laid so far, marked not complete.',
  },
  types: {
    BoardData:
      "What the element draws: the size, the arrow each cell belongs to (`-1` a cell left unfilled, `-2` a void, empty on purpose) and the arrows. The engine's `Board` is one.",
    BoardView:
      'The drawing options `view` takes: line, arrowhead, rounding, colour, highlight, empty cells and the four colours. Every field is optional on the property.',
    BoardViewport:
      "The view on screen: pixels per cell, where the board's corner sits, whether it is fitted, and the host's size.",
    BoardColours: 'The four colours a board is drawn in: background, arrows, highlight and the multicolour palette.',
    BoardTheme: 'A built-in theme: its four colours, and the project it comes from with its licence and address.',
    BoardLabels:
      'Every string the element shows: the buttons, the hints for each gesture mode and platform, and the message when there is no WebGL.',
    BoardLang: 'The two languages of those strings.',
    GestureMode:
      "The rule the mouse and pen follow: with `'drag'` a plain drag pans, with `'click'` a drag with the modifier does.",
    GameEvent:
      'One of the three game events as the game host hands it to its target: a `type` naming the event and the `detail` of that event.',
    GameTarget: 'What `GameHost` drives: the two animations and `emit`. The element is one.',
    Session:
      'A game in progress: the board, which arrows have left, how many are still on the board, and whether it is won. `index` is internal.',
    SessionSnapshot:
      'A saved game: a version, the board it belongs to (with its fingerprint), the arrows removed and the colour choice.',
    PieceClickEvent: 'The `piece-click` event: its `detail` names the arrow.',
    PieceRemovedEvent: 'The `piece-removed` event: the arrow, and how many are still on the board.',
    LifeLostEvent: 'The `life-lost` event: the arrow, the one that stops it, and how far it gets before it bounces.',
    FinishedEvent: 'The `finished` event: how many arrows the board had.',
    ViewportChangeEvent: 'The `viewport-change` event: the view, as `viewport` reads it.',
    ColoredChangeEvent: 'The `colored-change` event; cancelable.',
    ColoredChangeDetail: "That event's detail: the colour state the button asks for.",
    GesturesChangeEvent: 'The `gestures-change` event: the new gesture mode.',
    GesturesChangeDetail: "That event's detail: the mode now in force.",
  },
  functions: {
    resolveColours:
      'The colours a board is drawn with: the defaults, then the named theme, then `stated`, field by field.',
    themeOf: 'The built-in theme of that name, or null. An unknown name is ignored, never thrown on.',
    assignPalette: "A colour index for each arrow: never a neighbour's, and among the free ones the least used so far.",
    hueOf: "An arrow's diagnostic hue as CSS, from its id, not from its place in the list.",
    hueDegrees: "That hue's angle, in degrees.",
    hueBytes: 'That hue as red, green and blue bytes.',
    boardViewOf:
      "The lab's and the command line's `View` as the element takes it; `cell`, a size in the exported SVG, does not apply.",
    labelsFor: 'The strings for a language tag: Polish for `pl` or any `pl-…` tag, English otherwise.',
  },
  constants: {
    DEFAULT_PAD: 'Cells of margin when `pad` is not set.',
    DEFAULT_SHOW_POINTS: 'The dot grid is off unless asked for.',
    DEFAULT_POINT_COLOR: "The dot grid's colour.",
    DEFAULT_POINT_RADIUS: "The dots' radius, in cells.",
    PAD_RANGE: 'The margin a board may be given, in cells.',
    POINT_RADIUS_RANGE: "A dot's radius in cells; past half a cell it would overlap its neighbours.",
    DEFAULT_VIEW: 'What an empty `view` is merged over.',
    THEMES: 'The built-in themes by name, as the theme table shows them.',
    BOARD_LABELS: "The element's strings in each language.",
    GESTURE_STORAGE_KEY: "The key the browser keeps the player's gesture choice under.",
    ZOOM_STEP: 'The factor one button or key press zooms by.',
    WHEEL_RATE: "The wheel's zoom rate: each turn scales by `exp(-deltaY * WHEEL_RATE)`.",
    MAX_CELL_PX: 'The closest zoom, in pixels per cell, unless the fit is already closer.',
    MIN_PAD_PX: 'The narrowest margin on screen, in pixels, unless `pad` is 0.',
    MIN_POINT_CELL_PX: 'Below this many pixels per cell the dot grid hides itself.',
    EXIT_SPEED: 'Cells per second a leaving arrow covers.',
    EXIT_MIN_MS: 'The shortest ride off the board, in milliseconds.',
    EXIT_MAX_MS: 'The longest ride off the board, in milliseconds.',
    SHAKE_MS: "How long a blocked arrow's bounce takes, in milliseconds.",
    MIN_SHAKE_CELLS: 'The shortest bounce, in cells, so a blocker right in front still shows.',
  },
  classes: {
    ArrowzBoard: 'The element itself, usually written as a tag in HTML. Its members are in the tables above.',
    GameHost: 'Runs a game on any `GameTarget`, outside the element too.',
  },
  colProp: 'Property',
  colType: 'Type',
  colAttr: 'Attribute',
  colDefault: 'Default',
  colMember: 'Member',
  colSignature: 'Signature',
  colEvent: 'Event',
  colSlot: 'Slot',
  colKey: 'Key',
  colCommand: 'Command',
  colSection: 'Section',
  colField: 'Field',
  colGroup: 'Group',
  colFlag: 'Flag',
  colRange: 'Range',
  colStep: 'Step',
  colFlags: 'Flags',
  colVariable: 'Variable',
  colDetail: 'Detail',
  colFrom: 'From',
  colShape: 'Shape',
  colFunction: 'Function',
  colConstant: 'Constant',
  colValue: 'Value',
  colClass: 'Class',
  colCreate: 'Created with',
  colMembers: 'Members',
  colTheme: 'Theme',
  colColours: 'Colours',
  colSource: 'Source',
  colLicence: 'Licence',
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
  keys: {
    'G': 'Generuje planszę z ustawień.',
    '[': 'Cofa ziarno o jeden i generuje.',
    ']': 'Przesuwa ziarno o jeden naprzód i generuje.',
    'R': 'Pokazuje albo chowa raport.',
    'S': 'Pokazuje albo chowa ustawienia.',
    'F': 'Pełny podgląd: sama plansza.',
    'Esc': 'Chowa jedną warstwę: najpierw otwarty arkusz, potem raport, potem ustawienia.',
    '⌘G': 'Generuje planszę i ją zapisuje.',
    '⌘S': 'Zapisuje planszę z ekranu.',
    '⌘K': 'Otwiera paletę poleceń, na każdym ekranie, także z pola.',
  },
  palette: {
    'run-generate': 'Generuje planszę z ustawień.',
    'run-generate-save': 'Generuje planszę i ją zapisuje.',
    'run-save': 'Zapisuje planszę z ekranu.',
    'run-reseed': 'Losuje ziarno i generuje.',
    'run-defaults': 'Przywraca każdemu ustawieniu wartość domyślną i generuje.',
    'run-abort':
      'Zatrzymuje generowanie i zostawia planszę ułożoną do tej pory; gdy generowanie już się zatrzymuje, _Odrzuć_ porzuca jego planszę.',
    'run-check-seeds': 'Uruchamia ustawienia na wielu ziarnach (tylko w widoku zaawansowanym).',
    'run-solo': 'Sama plansza.',
    'go-lab': 'Ustawienia, plansza i raport.',
    'go-boards': 'Zapisane plansze.',
    'go-open-file': 'Otwiera plik planszy z dysku.',
    'go-docs-arrowz': 'Łamigłówka, jej jedna reguła rozegrana na trzech małych planszach i jej słowa.',
    'go-docs-lab': 'Jak działa laboratorium: widoki, klawisze, paleta i linki.',
    'go-docs-cli': 'Dokumentacja wiersza poleceń.',
    'go-docs-element': 'Dokumentacja `<arrowz-board>`.',
    'go-view': 'Przełącza widok; w widoku prostym wiersz brzmi _Widok zaawansowany_.',
    'go-lang': 'Przełącza język; po angielsku wiersz proponuje polski.',
  },
  linkFields: {
    cell: 'Rozmiar komórki w eksportowanym SVG, w pikselach.',
    stroke: 'Grubość linii, w komórkach.',
    headWidth: 'Szerokość grotu w komórkach; 0 to wartość automatyczna.',
    headHeight: 'Długość grotu, w komórkach.',
    top: 'Ile najdłuższych strzałek jest wyróżnionych.',
    colored: 'Każda strzałka we własnym kolorze.',
    rounded: 'Zaokrąglone zakręty i okrągły ogon.',
    highlightLongest: 'Wyróżnia najdłuższe strzałki.',
    voids: 'Pokazuje komórki, które generator zostawił puste.',
    showPoints: 'Siatka kropek.',
    pointColor: 'Kolor jej kropek.',
    pointRadius: 'Promień jej kropek, w komórkach.',
    theme: 'Wbudowany motyw, po nazwie.',
    palette: 'Kolory strzałek, gdy `colored` jest włączone.',
    paper: 'Kolor tła.',
    ink: 'Kolor strzałek.',
    highlightColor: 'Kolor wyróżnionych strzałek.',
    pad: 'Margines wokół planszy, w komórkach.',
    lang: 'Język strony, `en` albo `pl`.',
  },
  env: {
    ARROWZ_BOARDS_DIR: 'Gdzie zapisywać plansze zamiast `packages/cli/boards/`.',
    CARVE_TRACE: 'Ustawiona na `1` wypisuje na stderr postęp generatora w trakcie pracy.',
    GIANT_DEBUG: 'Ustawiona na `1` wypisuje na stderr, jak rosła każda strzałka szkieletu.',
    CARVE_TIMEOUT_S: 'Przerywa planszę po tylu sekundach; `carve` zapisuje to, co zdążył ułożyć, jako niepełną.',
  },
  types: {
    BoardData:
      'To, co rysuje komponent: rozmiar, strzałka, do której należy każda komórka (`-1` komórka niewypełniona, `-2` pusta celowo), i same strzałki. `Board` z silnika jest takim obiektem.',
    BoardView:
      'Opcje rysowania, które przyjmuje `view`: linia, grot, zaokrąglenie, kolor, wyróżnienie, puste komórki i cztery kolory. We właściwości każde pole jest opcjonalne.',
    BoardViewport:
      'Widok na ekranie: piksele na komórkę, położenie rogu planszy, czy jest dopasowana, i rozmiar kontenera.',
    BoardColours: 'Cztery kolory, w których rysuje się plansza: tło, strzałki, wyróżnienie i paleta wielobarwna.',
    BoardTheme: 'Wbudowany motyw: jego cztery kolory oraz projekt, z którego pochodzi, z licencją i adresem.',
    BoardLabels:
      'Każdy napis, który pokazuje komponent: przyciski, podpowiedzi dla każdego trybu gestów i systemu oraz komunikat, gdy brak WebGL.',
    BoardLang: 'Dwa języki tych napisów.',
    GestureMode:
      "Reguła dla myszy i pióra: przy `'drag'` przesuwa zwykłe przeciągnięcie, przy `'click'` przeciągnięcie z klawiszem modyfikującym.",
    GameEvent:
      'Jedno z trzech zdarzeń gry, tak jak host gry przekazuje je celowi: `type` nazywa zdarzenie, a `detail` to jego szczegóły.',
    GameTarget: 'To, czym steruje `GameHost`: dwie animacje i `emit`. Komponent jest jednym z celów.',
    Session:
      'Trwająca gra: plansza, które strzałki już wyjechały, ile zostało na planszy i czy gra jest wygrana. `index` jest wewnętrzny.',
    SessionSnapshot:
      'Zapisana gra: wersja, plansza, do której należy (z jej odciskiem), usunięte strzałki i wybór koloru.',
    PieceClickEvent: 'Zdarzenie `piece-click`: jego `detail` wskazuje strzałkę.',
    PieceRemovedEvent: 'Zdarzenie `piece-removed`: strzałka i ile ich zostało na planszy.',
    LifeLostEvent: 'Zdarzenie `life-lost`: strzałka, ta, która ją zatrzymuje, i jak daleko dojedzie przed odbiciem.',
    FinishedEvent: 'Zdarzenie `finished`: ile strzałek miała plansza.',
    ViewportChangeEvent: 'Zdarzenie `viewport-change`: widok taki, jaki zwraca `viewport`.',
    ColoredChangeEvent: 'Zdarzenie `colored-change`; można je anulować.',
    ColoredChangeDetail: 'Szczegóły tego zdarzenia: stan koloru, o który prosi przycisk.',
    GesturesChangeEvent: 'Zdarzenie `gestures-change`: nowy tryb gestów.',
    GesturesChangeDetail: 'Szczegóły tego zdarzenia: tryb, który teraz obowiązuje.',
  },
  functions: {
    resolveColours:
      'Kolory, w których rysuje się plansza: domyślne, potem nazwany motyw, potem `stated`, pole po polu.',
    themeOf: 'Wbudowany motyw o tej nazwie albo null. Nieznana nazwa jest pomijana i nigdy nie rzuca wyjątku.',
    assignPalette:
      'Indeks koloru dla każdej strzałki: nigdy taki jak u sąsiada, a spośród wolnych najrzadziej dotąd użyty.',
    hueOf: 'Odcień diagnostyczny strzałki jako CSS, liczony z jej identyfikatora, nie z miejsca na liście.',
    hueDegrees: 'Kąt tego odcienia, w stopniach.',
    hueBytes: 'Ten odcień jako bajty czerwieni, zieleni i błękitu.',
    boardViewOf:
      'Typ `View` laboratorium i wiersza poleceń w postaci, którą przyjmuje komponent; `cell`, rozmiar w eksportowanym SVG, tu nie ma zastosowania.',
    labelsFor: 'Napisy dla znacznika języka: polskie dla `pl` i każdego `pl-…`, w przeciwnym razie angielskie.',
  },
  constants: {
    DEFAULT_PAD: 'Margines w komórkach, gdy `pad` nie jest ustawione.',
    DEFAULT_SHOW_POINTS: 'Siatka kropek jest wyłączona, dopóki ktoś jej nie zażąda.',
    DEFAULT_POINT_COLOR: 'Kolor siatki kropek.',
    DEFAULT_POINT_RADIUS: 'Promień kropek, w komórkach.',
    PAD_RANGE: 'Margines, jaki można dać planszy, w komórkach.',
    POINT_RADIUS_RANGE: 'Promień kropki w komórkach; powyżej pół komórki nachodziłaby na sąsiednie.',
    DEFAULT_VIEW: 'To, na co nakłada się pusty `view`.',
    THEMES: 'Wbudowane motywy po nazwie, tak jak pokazuje je tabela motywów.',
    BOARD_LABELS: 'Napisy komponentu w każdym języku.',
    GESTURE_STORAGE_KEY: 'Klucz, pod którym przeglądarka trzyma wybór gestu gracza.',
    ZOOM_STEP: 'Krotność powiększenia jednym przyciskiem albo klawiszem.',
    WHEEL_RATE: 'Tempo powiększania kółkiem: każdy obrót skaluje o `exp(-deltaY * WHEEL_RATE)`.',
    MAX_CELL_PX: 'Największe powiększenie, w pikselach na komórkę, chyba że dopasowanie jest już większe.',
    MIN_PAD_PX: 'Najwęższy margines na ekranie, w pikselach, chyba że `pad` wynosi 0.',
    MIN_POINT_CELL_PX: 'Poniżej tylu pikseli na komórkę siatka kropek sama się chowa.',
    EXIT_SPEED: 'Ile komórek na sekundę pokonuje wyjeżdżająca strzałka.',
    EXIT_MIN_MS: 'Najkrótszy przejazd poza planszę, w milisekundach.',
    EXIT_MAX_MS: 'Najdłuższy przejazd poza planszę, w milisekundach.',
    SHAKE_MS: 'Ile trwa odbicie zablokowanej strzałki, w milisekundach.',
    MIN_SHAKE_CELLS: 'Najkrótsze odbicie, w komórkach, żeby było widać nawet blokadę tuż przed grotem.',
  },
  classes: {
    ArrowzBoard: 'Sam komponent, zwykle zapisywany jako znacznik w HTML. Jego składowe są w tabelach wyżej.',
    GameHost: 'Prowadzi grę na dowolnym `GameTarget`, także poza komponentem.',
  },
  colProp: 'Właściwość',
  colType: 'Typ',
  colAttr: 'Atrybut',
  colDefault: 'Domyślnie',
  colMember: 'Składowa',
  colSignature: 'Sygnatura',
  colEvent: 'Zdarzenie',
  colSlot: 'Nazwa slotu',
  colKey: 'Klawisz',
  colCommand: 'Polecenie',
  colSection: 'Sekcja',
  colField: 'Pole',
  colGroup: 'Grupa',
  colFlag: 'Flaga',
  colRange: 'Zakres',
  colStep: 'Krok',
  colFlags: 'Flagi',
  colVariable: 'Zmienna',
  colDetail: 'Szczegóły',
  colFrom: 'Skąd',
  colShape: 'Kształt',
  colFunction: 'Funkcja',
  colConstant: 'Stała',
  colValue: 'Wartość',
  colClass: 'Klasa',
  colCreate: 'Tworzenie',
  colMembers: 'Składowe',
  colTheme: 'Motyw',
  colColours: 'Kolory',
  colSource: 'Źródło',
  colLicence: 'Licencja',
  colDescription: 'Opis',
  infoLabel: 'Uwaga',
} as const satisfies Docs

/** The documentation in one language. Built by the surface once per language, as the dictionary is. */
export function docsFor(lang: Lang): Docs {
  return lang === 'pl' ? PL : EN
}
