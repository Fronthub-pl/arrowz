// English is the source language and lives in PARAM_SPEC / EN;
// PL only holds the translation, checked against EN's shape by the compiler.
import type { StartChoice } from './command.ts'
import { INACTIVE_REASONS, PARAM_SPEC, RULE_REASONS, stepsAround } from './engine.ts'
import type { InactiveKey, ParamKey, ParamSpec, RuleKey, Violation } from './types.ts'

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/**
 * Text for innerHTML. The lab's strings (this dictionary) are markup the page
 * trusts; a value from the store, a board file, a server reply or an error
 * message is data and passes through here before it joins them.
 */
export function escapeHtml(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c)
}

// English: the source language. Parameter texts and inactive reasons come
// from the engine (PARAM_SPEC, INACTIVE_REASONS); only lab strings live here.
export const EN = {
  groups: {
    board: 'board',
    lengths: 'lengths',
    shape: 'shape',
    difficulty: 'difficulty',
    skeleton: 'skeleton',
    closing: 'closing',
  },
  groupHelp: {
    lengths:
      'Three buckets: short 2–6, medium 7–15, long 16 to the maximum. The long bucket gets the remaining weight.',
    shape: 'Weights for choosing the next cell of a line. They multiply, so one extreme value drowns out the rest.',
    difficulty: 'How hard it is to find a piece with a free way out. Changes the blocking, not the look.',
    skeleton: 'The first pieces led as a serpentine across the whole board. The only way to get really long lines.',
    closing:
      'What to do when no legal carve is found. Defaults close boards up to 400×400; these knobs are for experiments.',
  },
  presets: {
    placeholder: 'Preset…',
    levels: {
      easy: 'Easy',
      medium: 'Medium',
      hard: 'Hard',
      nightmare: 'Nightmare',
      extreme: 'Extreme',
      huge: 'Huge',
      insane: 'Insane',
    },
    modes: {
      square: 'square',
      portrait: 'portrait',
      tunnels: 'tunnels',
      skeleton: 'skeleton',
      serpentine: 'winding skeleton',
    },
  },
  // The simple view (lab-simple.ts): plain choices instead of thirty knobs.
  simple: {
    viewSimple: 'Simple',
    viewAdvanced: 'Advanced',
    lengths: 'piece length',
    shape: 'line shape',
    skeleton: 'skeleton',
    options: {
      skeleton: { off: 'no skeleton', on: 'with a skeleton' },
    },
    ends: {
      lengths: ['very short', 'very long'],
      shape: ['straightest lines', 'most winding'],
    },
    randomize: 'randomise the settings on every generate',
    randomizeHelp:
      'The knobs are drawn inside a safe range for this size and these choices, so the same seed gives a different board every time. The drawn values show in the advanced view and in the command.',
  },
  // The one control the lab builds by hand, because the CLI has one flag for
  // the two knobs behind it: --start writes headBias and mix together, so
  // neither of them gets a row, and their texts are not PARAM_SPEC's.
  start: {
    label: 'piece start',
    help:
      'Where the next piece starts: the shallowest line (layers), anywhere (random) or the deepest (tunnels). Mixing starts that fraction of pieces as tunnels.',
    options: { layers: 'layers', random: 'random', tunnels: 'tunnels', mixing: 'mixing' },
  },
  ui: {
    title: 'Generator lab',
    subtitle: 'Same engine as carve.ts: engine.ts.',
    generate: 'Generate',
    reseed: 'New seed',
    reset: 'Defaults',
    downloadSvg: 'Download SVG',
    abort: 'Abort',
    cliLabel: 'CLI',
    runColumn: 'Run',
    runStatus: 'Run status',
    commandHead: 'CLI command (matches the current settings)',
    copy: 'Copy',
    copied: 'Copied',
    preview: 'Preview',
    cellLabel: 'cell size in export (px)',
    cellHelp: 'Affects only the downloaded SVG and the CLI command. No effect on the preview.',
    strokeLabel: 'stroke width (grid units)',
    headWidthLabel: 'arrowhead width (grid units, 0 = automatic)',
    headHeightLabel: 'arrowhead height (grid units)',
    headHelp:
      'The height is always literal: the head is that many grid units tall. The width is automatic at 0: under a stroke of 0.5 an arrow 0.4 + 0.9 stroke wide, from 0.5 a sharpened stick as wide as the line. A head narrower than the line is widened to it.',
    rounded: 'round the corners (and the tail)',
    colored: 'colour the arrows (each piece a different colour)',
    hilite: 'highlight the longest pieces',
    voids: 'show jammed cells',
    showPoints: 'show the point grid',
    pointColorLabel: 'dot colour',
    pointRadiusLabel: 'dot radius (cells)',
    pointRadiusHelp: 'Half a cell is the most; above that the dots merge into a wash of colour.',
    themeLabel: 'theme',
    themeNone: 'none (default colours)',
    // The console's editable custom palette (palette round-2 addendum, task
    // 2): Ruling 6 repealed the old exclusion with `theme`, so a chosen theme
    // and this palette now coexist, the palette overriding the theme's
    // colours field by field.
    paletteLabel: 'custom palette',
    paletteAdd: 'add colour',
    paletteColorLabel: (n: number) => `colour ${n}`,
    paletteRemove: (n: number) => `remove colour ${n}`,
    // A function of the cap, like `paletteColorLabel` above, so the caller's
    // `PALETTE_CAP` and this text cannot drift apart silently the way a
    // hardcoded "8" once could. Ruling 6 repealed the sentence this used to
    // end on ("Setting one clears the chosen theme"): a theme still supplies
    // whatever the palette, paper or ink leave unset.
    paletteHelp: (cap: number) => `Up to ${cap} colours. A chosen theme still supplies everything you do not set.`,
    // The board's own surface colours (Task 6): '' means "not set", which lets
    // a chosen theme supply them.
    paperLabel: 'background',
    inkLabel: 'drawing colour',
    paperClear: 'clear the paper, back to the theme',
    inkClear: 'clear the drawing colour, back to the theme',
    topLabel: 'how many longest',
    autoRun: 'generate right after a change',
    showHelp: 'show parameter descriptions',
    tabLab: 'Lab',
    tabLibrary: 'Saved boards',
    tabDocs: 'Docs',
    /** The accessible name of the tab strip itself, not of any one tab. */
    tabsLabel: 'Sections',
    // The command palette (spec 2026-09-21). `cmd…`, not `palette…`: the
    // `palette*` keys above belong to the editable colour palette.
    cmdOpen: 'Command palette (⌘K)',
    cmdTitle: 'Commands',
    cmdPlaceholder: 'jump to a knob, an action or a preset',
    cmdEmpty: (query: string) => `nothing matches ${query}`,
    cmdSecRun: 'run',
    cmdSecGo: 'go to',
    cmdHintMove: 'move',
    cmdHintChoose: 'choose',
    cmdHintClose: 'close',
    cmdHintGenerate: 'generate',
    cmdHintSeed: 'seed',
    cmdNoRun: 'nothing running',
    cmdBroken: 'rule broken',
    cmdViewSimple: 'Simple view',
    cmdViewAdvanced: 'Advanced view',
    cmdLangToPl: 'Switch to Polish',
    cmdLangToEn: 'Switch to English',
    /** The accessible name of the documentation's own two-page navigation. */
    docsNavLabel: 'Documentation pages',
    docsElement: 'Element',
    docsCli: 'Command line',
    fullView: 'Full view (key F)',
    pressGenerate: 'Press "Generate".',
    generating: 'Generating…',
    generatingBig: (W: number, H: number, cells: string) =>
      `Generating ${W}×${H} (${cells} cells) — this will take a while…`,
    progress: (pct: string, pieces: string, remaining: string, backtracks: number, s: string) =>
      `<b>${pct}%</b> · ${pieces} pieces · ${remaining} left · backtracks ${backtracks} · ${s} s`,
    workerError: 'Worker error:',
    generationError: 'Generation error:',
    aborted: 'Aborted.',
    closed: 'Board closed 100%.',
    solvable: 'Solvable.',
    unsolvable: 'UNSOLVABLE — a generator bug.',
    notClosedStatus: (remaining: string, fragments: number, largest: number) =>
      `Board not closed. At the best moment ${remaining} cells remained in ${fragments} fragments (largest ${largest}).`,
    stat_board: 'board',
    stat_boardVal: (W: number, H: number, cells: string, seed: number) => `${W} × ${H} = ${cells} cells, seed ${seed}`,
    stat_pieces: 'pieces',
    stat_avgLen: 'average length',
    stat_longest: 'longest',
    stat_longestVal: (n: number, pct: string) => `${n} cells (${pct} of the board)`,
    stat_lengths: 'length distribution',
    stat_f0: 'f0 (free at start)',
    stat_almost: 'almost1 (one blocker)',
    stat_D: 'D (blocking depth)',
    stat_corridor: 'mean corridor',
    stat_span: 'mean span',
    stat_spanTop: 'span of top 10%',
    stat_spanMax: 'span of the record holder',
    stat_outDeg: 'unblocks on average',
    stat_maxOut: 'unblocks record',
    stat_blockDist: 'unblock distance',
    piecesUnit: 'pieces',
    perimeterUnit: 'of perimeter',
    stat_bends: 'bends per piece',
    stat_coil: 'coiling',
    stat_border: 'shared border',
    stat_multi: 'multi-line',
    stat_stall: 'stalls before target',
    stat_stallVal: (pStall: string, pGot: string) => `${pStall} of paths, reaching ${pGot} of the ordered length`,
    stat_absorbed: 'absorbed leftovers',
    stat_absorbedVal: (n: number, cells: number) => `${n} fragments (${cells} cells)`,
    stat_backtracks: 'backtracks / restarts',
    stat_time: 'time',
    stat_timeVal: (g: string, m: string) => `generation ${g} s, metrics ${m} s`,
    longestHead: (n: number) => `${n} longest`,
    longestHelp:
      'Span = what fraction of the board side the piece covers. Density = how tightly it fills its rectangle. Coiling = share of cells touching their own path on three sides. A snake crossing the board has a high span and low other two; a coil the opposite.',
    th_len: 'length',
    th_box: 'box',
    th_span: 'span',
    th_density: 'density',
    th_coil: 'coiling',
    saved: 'saved',
    notSaved: 'not saved (no store server)',
    refresh: 'Refresh',
    boardCommand: 'Command of this board',
    sizeGroup: 'Board sizes',
    boardRows: 'Boards of this size',
    boardDetail: 'The open board',
    loadIntoLab: 'Load into lab',
    noStoreServer: 'No store server — run sh packages/cli/store.sh.',
    storeEmpty: 'The store is empty. Generate a board in the lab or with deno task carve.',
    notClosed: 'not closed',
    piecesShort: (n: number | string) => `${n} pieces`,
    longestShort: (n: number | string) => `longest ${n}`,
    genShort: (s: string) => `${s} s to generate`,
    loadingBoard: (id: string) => `Loading ${id}…`,
    boardFileError: (id: string, reason: string) => `Board ${id} cannot be read: ${reason}`,
    savedBoard: (id: string, seed: number | string, source: string, gen: string) =>
      `Saved board ${id}, seed ${seed}, source: ${source}, generated in ${gen}.`,
    deleteBoard: 'Delete from disk',
    confirmDelete: 'Really delete?',
    viewSaved: (id: string) => `Saved the new view of board ${id}.`,
    deletedBoard: (id: string) => `Deleted ${id}.`,
    deleteFailed: 'Could not delete the board.',
    inactivePrefix: 'No effect: ',
    // Safe envelope: settings the engine refuses to generate with.
    violationsTitle: 'Settings outside the safe range',
    // The parameter console (apps/lab). The rail is a landmark of its own, so
    // it needs a name the tab strip does not already use.
    railLabel: 'Parameter groups',
    railGenerator: 'generator',
    railElement: 'element',
    // The floor a cross-knob rule puts on a knob: drawn on the slider's track,
    // and named here because a mark is not a message.
    ruleBound: (need: number) => `Rule bound: ${need}`,
    // A rail entry that carries a count names what the count is.
    violationsInGroup: (group: string, count: number) =>
      `${group}, ${count} setting${count === 1 ? '' : 's'} outside the safe range`,
    rangeViolation: (label: string, value: unknown, min: number, max: number) =>
      `${label}: ${value} is outside ${min}..${max}`,
    stepViolation: (label: string, value: number, below: number, above: number) =>
      `${label}: ${value} sits between the settings ${below} and ${above}`,
    // A rule whose bound is computed from the board rather than fixed.
    needViolation: (reason: string, need: number) => `${reason}; this board needs at least ${need}`,
    generateBlocked: 'Fix the settings marked in red to generate',
    clamped: 'Some loaded settings were pulled into the safe range',
    // The preset strip: its accessible name (it carries no visible caption),
    // the mark for a knob moved since a preset was chosen, and the button
    // that puts the clamp notice away.
    presetsLabel: 'Presets',
    presetsDirty: 'edited',
    dismiss: 'Dismiss',
    // The top bar's two choices, each a radio group named by what it chooses.
    // The language codes are the visible text and so the accessible name: a
    // name that does not contain what is on screen fails WCAG 2.5.3 for speech
    // input (PR 4a, Ruling 8).
    modeLabel: 'View',
    languageLabel: 'Language',
    langPl: 'PL',
    langEn: 'EN',
    // The simple view's region; its visible heading is only the view's name.
    simplePanel: 'Simple settings',
    // PR 4b: the report column and its delta, the frame's annotation, and the
    // run column's two exports. The two delta words are never visible: the
    // cell's colour and sign say it on screen, and a screen reader hears these.
    reportPanel: 'Report',
    statsTable: 'Statistics',
    deltaBetter: 'better',
    deltaWorse: 'worse',
    boardAnnotation: (W: number, H: number, seed: number) => `${W}×${H} · seed ${seed}`,
    exportsGroup: 'Export',
    downloadBoardFile: 'Download board file',
    exportError: 'Export failed:',
    // The board-file download is named by the layout hash, which Web Crypto
    // computes only in a secure context: said beside the exports, not as an
    // export failure.
    layoutHashError: 'Cannot name the board file:',
    // The engine's `toSvg` learns no colours (spec §9), so a theme chosen on
    // screen never reaches the exported file; shown only while a theme is
    // active, beside the SVG button, since it has nothing to say otherwise.
    svgThemeNote: 'The downloaded SVG keeps the golden-angle colours, not the chosen theme.',
  },
} as const

/** A string leaf stays a string; a function leaf keeps its exact parameter list. */
type Widen<T> = T extends string ? string
  : T extends (...args: infer A) => string ? (...args: A) => string
  : { [K in keyof T]: Widen<T[K]> }

/** The shape every language must have: EN's keys, with leaves widened. */
export type Dictionary = Widen<typeof EN>
export type UiKey = keyof Dictionary['ui']
/** Arguments of a ui entry: none for a string, the function's parameters otherwise. */
export type UiArgs<K extends UiKey> = Dictionary['ui'][K] extends (...args: infer A) => string ? A : []

/** The translation carries what EN does not: knob texts and reason texts live in the engine tables in English. */
export type Translation = Dictionary & {
  reasons: Record<InactiveKey | RuleKey, string>
  params: Record<ParamKey, { label: string; help: string }>
  /** Each value of a fixed-choice knob, keyed by the English word PARAM_SPEC gives it — the word the flag takes. */
  choices: Partial<Record<ParamKey, Record<string, string>>>
}

// Polish: the translation of the lab, plus the parameter and reason texts the
// engine keeps in English only.
export const PL: Translation = {
  groups: {
    board: 'plansza',
    lengths: 'długości',
    shape: 'kształt',
    difficulty: 'trudność',
    skeleton: 'szkielet',
    closing: 'domykanie',
  },
  reasons: {
    skeletonOff: 'wymaga elementów szkieletowych > 0',
    probeOff: 'działa tylko przy udziale sond > 0',
    stepZero: 'działa tylko przy skoku serpentyny > 0',
    anticoilWins: 'działa dopiero powyżej ogólnej kary za zwijanie',
    // Cross-knob rules (RULE_REASONS in the engine), keyed like the inactive reasons.
    sharesSum: 'udział krótkich i średnich razem nie może przekroczyć 0,9',
    lmaxHole: 'długość maksymalna musi być 0 (automatyczna) albo co najmniej 17',
    straightFloor:
      'skłonność do prostej musi rosnąć z planszą: więcej kwadratów, zamykanie zakamarków poniżej 4 albo kara za zwijanie powyżej 6 — każde z nich podnosi podłogę',
    startPair:
      'start elementu i mieszanie muszą tworzyć parę, którą zapisuje --start: mieszanie wyłączone (-1) przy całkowitym starcie albo start 0 przy udziale mieszania od 0,3 do 0,7',
  },
  // Words of the fixed-choice knobs. The key is the word the CLI takes
  // (--giantspacing=off), the value is what the lab shows in Polish.
  choices: {
    giantSpacing: { off: 'bez odstępu', '2': '2', '3': '3' },
    trapBias: { avoid: 'unikaj', off: 'bez zmian', seek: 'szukaj' },
  },
  params: {
    W: {
      label: 'szerokość',
      help: 'Liczba kolumn. Plansze do 400×400 liczą się poniżej dwóch sekund; 1000×1000 około dziesięciu.',
    },
    H: {
      label: 'wysokość',
      help: 'Liczba wierszy. Plansza pionowa jest trudniejsza od kwadratowej o tej samej liczbie komórek.',
    },
    seed: { label: 'ziarno', help: 'To samo ziarno przy tych samych ustawieniach daje zawsze tę samą planszę.' },

    wShort: {
      label: 'udział krótkich (2–6 komórek)',
      help:
        'Jaka część elementów ma być krótka. Wyżej = więcej grotów, ale sieczka z haczyków. Krótkie i średnie razem nie mogą przekroczyć 0,9.',
    },
    wMid: {
      label: 'udział średnich (7–15 komórek)',
      help:
        'Jaka część elementów ma być średnia. Reszta po krótkich i średnich idzie na długie. Krótkie i średnie razem nie mogą przekroczyć 0,9.',
    },
    Lmax: {
      label: 'długość maksymalna (auto = 2,5 × bok)',
      help:
        'Najdłuższy element, o jaki stara się generator. auto = 2,5 × dłuższy bok. Poniżej 17 limit zjada kubełek średnich i długich, więc daj auto albo 17 w górę.',
    },
    backbite: {
      label: 'przerabianie ogona, gdy linia ugrzęźnie',
      help:
        'Ile razy z rzędu linia, która nie ma już gdzie iść, może przerobić własny ogon, zamiast się zatrzymać. 0 wyłącza. Więcej daje dłuższe elementy i mniej ich.',
    },

    pStraight: {
      label: 'skłonność do prostej',
      help:
        'Jak chętnie linia idzie prosto. Wyżej = dłuższe proste odcinki. Poniżej 0,6 duże plansze się nie domykają; przy 0,6 plansze ponad 500×500 mogą się zaciąć, 0,65 nie.',
    },
    wLateral: {
      label: 'premia za ruch w bok',
      help: 'O ile chętniej linia skręca w bok, niż wchodzi w głąb. 0 = proste wbicia i wielkie zwoje.',
    },
    warns: {
      label: 'domykanie zakamarków',
      help:
        'Jak mocno linia najpierw wypełnia zakamarki z małą liczbą wyjść. Wyżej = mniej elementów, dłuższe i zwinięte. Poniżej 2 reguła nie działa i plansze się zacinają.',
    },
    anticoil: {
      label: 'kara za zwijanie',
      help:
        'Jak mocno linia unika dotykania samej siebie. 1 = wyłączone. Wyżej = mniej zwojów, nieco krótsze elementy. Powyżej 10 zacina się przy małej skłonności do prostej.',
    },
    headBias: {
      label: 'start elementów (-1 warstwy, 0 losowo, 1 tunele)',
      help:
        'Skąd startuje kolejny element: najpłytsza linia (warstwy), losowo albo najgłębsza (tunele). Tunele = trudniej. Wszystkie trzy domykają plansze do 400×400.',
    },
    mix: {
      label: 'udział mieszania (tunele wśród warstw)',
      help:
        'Jaka część elementów startuje tunelami, reszta warstwami. --start przyjmuje tu od 0,3 do 0,7. -1 wyłącza mieszanie.',
    },
    trapBias: {
      label: 'pułapki (strzałki, które wyglądają na gotowe)',
      help:
        'Głowa, w której korytarzu stoi już jeden element, da element wyglądający na gotowy, choć nim nie jest. „Szukaj" daje ich o połowę więcej, „unikaj" cztery razy mniej.',
    },
    probe: {
      label: 'udział elementów-sond',
      help:
        'Jaka część elementów ma długość losowaną wokół długości sondy zamiast ze zwykłej mieszanki. Przy 1 i długości 12 plansza to same krótkie elementy.',
    },
    probeLen: {
      label: 'długość sondy',
      help:
        'Docelowa długość sondy, plus minus połowa. Krótkie sondy (4) potrajają liczbę elementów, długie (200) dają mniej dłuższych.',
    },

    giants: {
      label: 'ile elementów szkieletowych (0 = bez szkieletu)',
      help: 'Ile pierwszych elementów ma być długimi liniami przez całą planszę. 0 = bez szkieletu; 4 to dobry start.',
    },
    giantSpan: {
      label: 'długość szkieletu (w bokach planszy)',
      help: 'Docelowa długość jednego szkieletu w bokach planszy. Linia kończy wcześniej, gdy zabraknie miejsca.',
    },
    giantStep: {
      label: 'skok serpentyny (random = wzrost swobodny)',
      help:
        'Odstęp między biegami szkieletu. Mały = równe pasy, duży = kilka autostrad. random = wzrost swobodny, bez serpentyny.',
    },
    giantJitter: {
      label: 'urywanie biegów serpentyny',
      help: 'Jak często bieg szkieletu urywa się przed przeszkodą. 0 = proste, regularne brzegi.',
    },
    wGiant: {
      label: 'udział szkieletów poza startem',
      help:
        'Szansa, że element wycinany później też będzie szkieletem. Powyżej 0,2 plansze robią się wolne i przestają się domykać przy 1000×1000.',
    },
    giantStraight: {
      label: 'skłonność szkieletu do prostej',
      help:
        'Jak chętnie szkielet idzie prosto tam, gdzie rośnie swobodnie: cała linia przy skoku 0, ogon po serpentynie. 0,5 to brak preferencji.',
    },
    giantAnticoil: {
      label: 'kara za zwijanie szkieletu',
      help: 'Kara za dotykanie siebie tylko dla szkieletu. Obowiązuje wyższa z tej i ogólnej.',
    },
    giantSpacing: {
      label: 'promień odstępu szkieletu',
      help:
        'Jak daleko szkielet trzyma się od własnych wcześniejszych biegów, w komórkach. Powyżej 3 tylko kosztuje czas.',
    },
    headTries: {
      label: 'prób startu na kierunek',
      help:
        'Ile miejsc startu wypróbować przed zmianą kierunku. 1 głodzi szukanie przy trudnych ustawieniach; powyżej 16 tylko kosztuje czas.',
    },
    absorbLimit: {
      label: 'wchłanianie resztek do N komórek',
      help:
        'Fragment do tego rozmiaru, którego nie da się wyciąć, dokleja się do sąsiada. Poniżej 12 resztki się piętrzą i plansze się zacinają.',
    },
    maxBack: {
      label: 'budżet nawrotów',
      help:
        'Ile wycięć wolno cofnąć w jednej próbie, zanim zacznie się od nowa. 200 wystarcza; więcej tylko opóźnia werdykt. --maxback=auto to 200.',
    },
    restarts: {
      label: 'dopuszczalne restarty',
      help:
        'Ile nowych prób z pochodnym ziarnem po nieudanej. 0 pokazuje surową skuteczność ustawień; więcej niż 5 prawie nigdy nie pomaga.',
    },
  },
  groupHelp: {
    lengths: 'Trzy koszyki: krótkie 2–6, średnie 7–15, długie od 16 do maksimum. Koszyk długi dostaje resztę wagi.',
    shape: 'Wagi wyboru kolejnej komórki linii. Mnożą się, więc jedna skrajna wartość zagłusza pozostałe.',
    difficulty: 'Jak trudno znaleźć element z wolną drogą. Zmienia blokowanie, nie wygląd.',
    skeleton: 'Pierwsze elementy prowadzone serpentyną przez całą planszę. Jedyny sposób na naprawdę długie linie.',
    closing:
      'Co robić, gdy nie ma legalnego wycięcia. Domyślne domykają plansze do 400×400; te pokrętła są do eksperymentów.',
  },
  presets: {
    placeholder: 'Preset…',
    levels: {
      easy: 'Łatwy',
      medium: 'Średni',
      hard: 'Trudny',
      nightmare: 'Koszmar',
      extreme: 'Ekstremalny',
      huge: 'Ogromny',
      insane: 'Obłęd',
    },
    modes: {
      square: 'kwadrat',
      portrait: 'pion',
      tunnels: 'tunele',
      skeleton: 'szkielet',
      serpentine: 'szkielet z serpentynami',
    },
  },
  // The simple view (lab-simple.ts): plain choices instead of thirty knobs.
  simple: {
    viewSimple: 'Prosty',
    viewAdvanced: 'Zaawansowany',
    lengths: 'długość elementów',
    shape: 'kształt linii',
    skeleton: 'szkielet',
    options: {
      skeleton: { off: 'bez szkieletu', on: 'ze szkieletem' },
    },
    ends: {
      lengths: ['bardzo krótkie', 'bardzo długie'],
      shape: ['jak najprostsze linie', 'najbardziej pokręcone'],
    },
    randomize: 'losuj ustawienia przy każdym generowaniu',
    randomizeHelp:
      'Pokrętła są losowane w bezpiecznym zakresie dla tego rozmiaru i wyborów, więc to samo ziarno daje za każdym razem inną planszę. Wylosowane wartości widać w widoku zaawansowanym i w komendzie.',
  },
  start: {
    label: 'start elementów',
    help:
      'Skąd startuje kolejny element: najpłytsza linia (warstwy), losowo albo najgłębsza (tunele). Mieszanie startuje tunelami tę część elementów.',
    options: { layers: 'warstwy', random: 'losowo', tunnels: 'tunele', mixing: 'mieszanie' },
  },
  ui: {
    title: 'Laboratorium generatora',
    subtitle: 'Ten sam silnik co carve.ts: engine.ts.',
    generate: 'Generuj',
    reseed: 'Nowe ziarno',
    reset: 'Domyślne',
    downloadSvg: 'Pobierz SVG',
    abort: 'Przerwij',
    cliLabel: 'CLI',
    runColumn: 'Generowanie',
    runStatus: 'Stan generowania',
    commandHead: 'Komenda CLI (odpowiada bieżącym ustawieniom)',
    copy: 'Kopiuj',
    copied: 'Skopiowano',
    preview: 'Podgląd',
    cellLabel: 'rozmiar komórki w eksporcie (px)',
    cellHelp: 'Dotyczy tylko pobieranego SVG i komendy CLI. Na podgląd nie ma wpływu.',
    strokeLabel: 'grubość linii (podziałki)',
    headWidthLabel: 'szerokość grotu (podziałki, 0 = automat)',
    headHeightLabel: 'wysokość grotu (podziałki)',
    headHelp:
      'Wysokość jest zawsze dosłowna: grot ma tyle podziałek wysokości. Szerokość 0 to automat: poniżej grubości 0,5 strzałka szeroka na 0,4 + 0,9 grubości, od 0,5 zaostrzony kijek szerokości linii. Grot węższy od linii jest do niej poszerzany.',
    rounded: 'zaokrąglaj rogi (i ogon)',
    colored: 'koloruj strzałki (każdy element inny kolor)',
    hilite: 'wyróżnij najdłuższe elementy',
    voids: 'pokaż komórki zaklinowania',
    showPoints: 'pokaż siatkę punktów',
    pointColorLabel: 'kolor kropek',
    pointRadiusLabel: 'promień kropki (komórki)',
    pointRadiusHelp: 'Najwięcej pół komórki; powyżej kropki zlewają się w plamę koloru.',
    themeLabel: 'motyw',
    themeNone: 'brak (kolory domyślne)',
    paletteLabel: 'własna paleta',
    paletteAdd: 'dodaj kolor',
    paletteColorLabel: (n) => `kolor ${n}`,
    paletteRemove: (n) => `usuń kolor ${n}`,
    paletteHelp: (cap) => `Maksymalnie ${cap} kolorów. Wybrany motyw nadal daje wszystko, czego nie ustawisz.`,
    paperLabel: 'tło',
    inkLabel: 'kolor rysunku',
    paperClear: 'wyczyść tło, z powrotem do motywu',
    inkClear: 'wyczyść kolor rysunku, z powrotem do motywu',
    topLabel: 'ile najdłuższych',
    autoRun: 'generuj od razu po zmianie',
    showHelp: 'pokazuj opisy parametrów',
    tabLab: 'Laboratorium',
    tabLibrary: 'Zapisane plansze',
    tabDocs: 'Dokumentacja',
    tabsLabel: 'Sekcje',
    cmdOpen: 'Paleta poleceń (⌘K)',
    cmdTitle: 'Polecenia',
    cmdPlaceholder: 'skocz do pokrętła, akcji albo presetu',
    cmdEmpty: (query: string) => `nic nie pasuje do ${query}`,
    cmdSecRun: 'generowanie',
    cmdSecGo: 'przejdź do',
    cmdHintMove: 'ruch',
    cmdHintChoose: 'wybór',
    cmdHintClose: 'zamknij',
    cmdHintGenerate: 'generuj',
    cmdHintSeed: 'ziarno',
    cmdNoRun: 'nic się nie generuje',
    cmdBroken: 'złamana reguła',
    cmdViewSimple: 'Widok prosty',
    cmdViewAdvanced: 'Widok zaawansowany',
    cmdLangToPl: 'Przełącz na polski',
    cmdLangToEn: 'Przełącz na angielski',
    docsNavLabel: 'Strony dokumentacji',
    docsElement: 'Element',
    docsCli: 'Wiersz poleceń',
    fullView: 'Pełny podgląd (klawisz F)',
    pressGenerate: 'Naciśnij „Generuj”.',
    generating: 'Generuję…',
    generatingBig: (W, H, cells) => `Generuję ${W}×${H} (${cells} komórek) — to potrwa…`,
    progress: (pct, pieces, remaining, backtracks, s) =>
      `<b>${pct}%</b> · ${pieces} elem. · zostało ${remaining} · nawroty ${backtracks} · ${s} s`,
    workerError: 'Błąd workera:',
    generationError: 'Błąd generacji:',
    aborted: 'Przerwano.',
    closed: 'Plansza domknięta w 100%.',
    solvable: 'Rozwiązywalna.',
    unsolvable: 'NIEROZWIĄZYWALNA — to błąd generatora.',
    notClosedStatus: (remaining, fragments, largest) =>
      `Nie domknięto planszy. W najlepszym momencie zostało ${remaining} komórek w ${fragments} fragmentach (największy ${largest}).`,
    stat_board: 'plansza',
    stat_boardVal: (W, H, cells, seed) => `${W} × ${H} = ${cells} komórek, ziarno ${seed}`,
    stat_pieces: 'elementów',
    stat_avgLen: 'średnia długość',
    stat_longest: 'najdłuższy',
    stat_longestVal: (n, pct) => `${n} komórek (${pct} planszy)`,
    stat_lengths: 'rozkład długości',
    stat_f0: 'f0 (wolne na starcie)',
    stat_almost: 'almost1 (jeden bloker)',
    stat_D: 'D (głębokość blokowania)',
    stat_corridor: 'średni korytarz',
    stat_span: 'zasięg średni',
    stat_spanTop: 'zasięg górnych 10%',
    stat_spanMax: 'zasięg rekordzisty',
    stat_outDeg: 'odblokowania średnio',
    stat_maxOut: 'odblokowania rekord',
    stat_blockDist: 'dystans odblokowań',
    piecesUnit: 'elem.',
    perimeterUnit: 'obwodu',
    stat_bends: 'skrętów na element',
    stat_coil: 'zwinięcie',
    stat_border: 'wspólna granica',
    stat_multi: 'wieloliniowych',
    stat_stall: 'utyka przed celem',
    stat_stallVal: (pStall, pGot) => `${pStall} ścieżek, osiągane ${pGot} zamówionej długości`,
    stat_absorbed: 'wchłonięte resztki',
    stat_absorbedVal: (n, cells) => `${n} fragm. (${cells} komórek)`,
    stat_backtracks: 'nawroty / restarty',
    stat_time: 'czas',
    stat_timeVal: (g, m) => `generacja ${g} s, metryki ${m} s`,
    longestHead: (n) => `${n} najdłuższych`,
    longestHelp:
      'Zasięg = jaką część boku planszy element obejmuje. Gęstość = jak ciasno wypełnia swój prostokąt. Zwinięcie = udział komórek dotykających własnej ścieżki z trzech stron. Wąż przecinający planszę ma wysoki zasięg i niskie dwa pozostałe; zwój — odwrotnie.',
    th_len: 'długość',
    th_box: 'prostokąt',
    th_span: 'zasięg',
    th_density: 'gęstość',
    th_coil: 'zwinięcie',
    saved: 'zapisano',
    notSaved: 'nie zapisano (brak serwera magazynu)',
    refresh: 'Odśwież',
    boardCommand: 'Komenda tej planszy',
    sizeGroup: 'Rozmiary plansz',
    boardRows: 'Plansze tego rozmiaru',
    boardDetail: 'Otwarta plansza',
    loadIntoLab: 'Wczytaj do laboratorium',
    noStoreServer: 'Brak serwera magazynu — uruchom sh packages/cli/store.sh.',
    storeEmpty: 'Magazyn jest pusty. Wygeneruj planszę w laboratorium albo przez deno task carve.',
    notClosed: 'niedomknięta',
    piecesShort: (n) => `${n} elem.`,
    longestShort: (n) => `najdłuższy ${n}`,
    genShort: (s) => `${s} s generacji`,
    loadingBoard: (id) => `Wczytuję ${id}…`,
    boardFileError: (id, reason) => `Nie da się odczytać planszy ${id}: ${reason}`,
    savedBoard: (id, seed, source, gen) =>
      `Zapisana plansza ${id}, ziarno ${seed}, źródło: ${source}, generacja ${gen}.`,
    deleteBoard: 'Usuń z dysku',
    confirmDelete: 'Na pewno usunąć?',
    viewSaved: (id) => `Zapisano nowy widok planszy ${id}.`,
    deletedBoard: (id) => `Usunięto ${id}.`,
    deleteFailed: 'Nie udało się usunąć planszy.',
    inactivePrefix: 'Bez wpływu: ',
    // Safe envelope: settings the engine refuses to generate with.
    violationsTitle: 'Ustawienia poza bezpiecznym zakresem',
    railLabel: 'Grupy parametrów',
    railGenerator: 'generator',
    railElement: 'element',
    ruleBound: (need: number) => `Granica reguły: ${need.toLocaleString('pl')}`,
    violationsInGroup: (group: string, count: number) => `${group}, ustawienia poza zakresem: ${count}`,
    rangeViolation: (label, value, min, max) => `${label}: ${value} poza zakresem ${min}..${max}`,
    stepViolation: (label, value, below, above) => `${label}: ${value} leży między ustawieniami ${below} i ${above}`,
    needViolation: (reason, need) => `${reason}; ta plansza wymaga co najmniej ${need}`,
    generateBlocked: 'Popraw ustawienia zaznaczone na czerwono, żeby generować',
    clamped: 'Część wczytanych ustawień przyciągnięto do bezpiecznego zakresu',
    presetsLabel: 'Presety',
    presetsDirty: 'zmienione',
    dismiss: 'Zamknij',
    modeLabel: 'Widok',
    languageLabel: 'Język',
    langPl: 'PL',
    langEn: 'EN',
    simplePanel: 'Proste ustawienia',
    reportPanel: 'Raport',
    statsTable: 'Statystyki',
    deltaBetter: 'lepiej',
    deltaWorse: 'gorzej',
    boardAnnotation: (W, H, seed) => `${W}×${H} · ziarno ${seed}`,
    exportsGroup: 'Eksport',
    downloadBoardFile: 'Pobierz plik planszy',
    exportError: 'Eksport nie powiódł się:',
    layoutHashError: 'Nie da się nazwać pliku planszy:',
    svgThemeNote: 'Pobrany SVG zachowuje kolory ze złotego kąta, a nie wybrany motyw.',
  },
}

// The CLI owns the four start choices; a dictionary missing one must not compile.
EN.start.options satisfies Record<StartChoice, string>
PL.start.options satisfies Record<StartChoice, string>

// --- one dictionary per language --------------------------------------------

export type Lang = 'en' | 'pl'

export interface Dict {
  readonly lang: Lang
  /** The raw sections the page reads directly: start, groups, groupHelp, presets, simple. */
  readonly d: Dictionary
  t<K extends UiKey>(key: K, ...args: UiArgs<K>): string
  paramText(spec: ParamSpec): { label: string; help: string }
  choiceText(key: ParamKey, word: string): string
  reason(key: InactiveKey | RuleKey): string
  fmt(n: number): string
  short(n: number): string
  violation(v: Violation): string
}

/** A string field of a dictionary section looked up by a key typed by hand (a choice word). */
function stringAt(rec: Record<string, unknown>, key: string): string | undefined {
  const v = rec[key]
  return typeof v === 'string' ? v : undefined
}

/**
 * The surface's text in one language. Every helper here reads the language
 * from this closure instead of a module-level variable, so a surface can hold
 * two of them and a test can hold one.
 */
export function dictionary(lang: Lang): Dict {
  const d = lang === 'pl' ? PL : EN
  const specByKey = new Map<ParamKey, ParamSpec>(PARAM_SPEC.map((s) => [s.key, s]))
  const fmt = (n: number) => n.toLocaleString(lang === 'pl' ? 'pl' : 'en')
  // English is the source language: PARAM_SPEC, INACTIVE_REASONS/RULE_REASONS
  // and EN.ui. PL.ui is checked against EN.ui's keys by lab-i18n.test.ts, but
  // `t` still falls back to EN.ui[key] for a key a stale PL table is missing.
  // The call site is typed by UiArgs<K>; the cast only dispatches the call over
  // the union of function-valued entries, which TypeScript cannot resolve generically.
  const t = <K extends UiKey>(key: K, ...args: UiArgs<K>): string => {
    const v = d.ui[key] ?? EN.ui[key]
    return typeof v === 'function' ? (v as (...a: unknown[]) => string)(...args) : v
  }
  // Reason keys come from two engine tables: INACTIVE_REASONS (a knob with no
  // effect) and RULE_REASONS (a cross-knob rule broken). PL.reasons covers both.
  const reason = (key: InactiveKey | RuleKey): string => {
    if (lang === 'pl') return PL.reasons[key]
    return Object.hasOwn(INACTIVE_REASONS, key) ? INACTIVE_REASONS[key as InactiveKey] : RULE_REASONS[key as RuleKey]
  }
  const paramText = (spec: ParamSpec) => {
    const pl = lang === 'pl' ? PL.params[spec.key] : null
    return { label: pl?.label ?? spec.label, help: pl?.help ?? spec.help }
  }
  const labelOf = (key: ParamKey) => {
    const spec = specByKey.get(key)
    return spec ? paramText(spec).label : key
  }
  return {
    lang,
    d,
    t,
    paramText,
    // A choice is stored as a number and written on the command line as the word
    // PARAM_SPEC gives it (--giantspacing=off), which is also its English text;
    // Polish translates that word, and the command box keeps showing the CLI's.
    choiceText: (key, word) => (lang === 'pl' ? stringAt(PL.choices[key] ?? {}, word) : undefined) ?? word,
    reason,
    fmt,
    // The progress line counts pieces on boards of up to 10^6 cells; past ten
    // thousand the exact figure changes faster than it can be read.
    short: (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : fmt(n)),
    violation: (v) => {
      if (v.kind === 'range') return t('rangeViolation', labelOf(v.key), v.value, v.min, v.max)
      if (v.kind === 'step') {
        const [below, above] = stepsAround(v.value, v.step, v.min)
        return t('stepViolation', labelOf(v.key), v.value, below, above)
      }
      const text = reason(v.key)
      return v.need === undefined ? text : t('needViolation', text, v.need)
    },
  }
}
