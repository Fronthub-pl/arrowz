// English is the source language and lives in PARAM_SPEC / lab.html / EN;
// PL only holds the translation, checked against EN's shape by the compiler.
import type { InactiveKey, ParamKey, RuleKey } from './types.ts'

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
  ui: {
    title: 'Generator lab',
    subtitle: 'Same engine as carve.ts: engine.ts.',
    generate: 'Generate',
    reseed: 'New seed',
    reset: 'Defaults',
    downloadSvg: 'Download SVG',
    abort: 'Abort',
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
    topLabel: 'how many longest',
    autoRun: 'generate right after a change',
    showHelp: 'show parameter descriptions',
    tabLab: 'Lab',
    tabLibrary: 'Saved boards',
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
    loadIntoLab: 'Load into lab',
    noStoreServer: 'No store server — run sh packages/cli/lab.sh.',
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
    rangeViolation: (label: string, value: unknown, min: number, max: number) =>
      `${label}: ${value} is outside ${min}..${max}`,
    generateBlocked: 'Fix the settings marked in red to generate',
    clamped: 'Some loaded settings were pulled into the safe range',
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
    // Cross-knob rules (RULE_REASONS in the engine), keyed like the inactive reasons.
    sharesSum: 'udział krótkich i średnich razem nie może przekroczyć 0,9',
    lmaxHole: 'długość maksymalna musi być 0 (automatyczna) albo co najmniej 6',
    wholeNumbers: 'szerokość, wysokość i ziarno muszą być liczbami całkowitymi',
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
      label: 'długość maksymalna (0 = 2,5 × bok)',
      help:
        'Najdłuższy element, o jaki stara się generator. 0 = 2,5 × dłuższy bok. 1-5 tną planszę na okruchy i zacinają, więc daj 0 albo co najmniej 6.',
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
      label: 'mieszanie warstw i tuneli (-1 = wyłączone)',
      help:
        'Jaka część elementów startuje tunelami, reszta warstwami. -1 = wyłączone; inaczej 0,3-0,7, bo skrajne wartości zostawiają plansze niedomknięte.',
    },
    probe: {
      label: 'udział elementów-sond',
      help:
        'Jaka część elementów ma długość losowaną wokół długości sondy zamiast ze zwykłej mieszanki. Przy 1 i długości 12 plansza to same krótkie elementy.',
    },
    probeLen: {
      label: 'długość sondy',
      help:
        'Docelowa długość sondy, plus minus połowa. Krótkie sondy (2) potrajają liczbę elementów, długie (200) dają mniej dłuższych.',
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
      label: 'skok serpentyny (0 = wzrost losowy)',
      help: 'Odstęp między biegami szkieletu. Mały = równe pasy, duży = kilka autostrad. 0 = wzrost losowy.',
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
        'Jak chętnie szkielet idzie prosto tam, gdzie rośnie swobodnie: cała linia przy skoku 0, ogon po serpentynie. Poniżej 0,3 plansze przestają się domykać.',
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
      label: 'budżet nawrotów (0 = 200)',
      help:
        'Ile wycięć wolno cofnąć w jednej próbie, zanim zacznie się od nowa. 0 = 200, to wystarcza; więcej tylko opóźnia werdykt.',
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
  ui: {
    title: 'Laboratorium generatora',
    subtitle: 'Ten sam silnik co carve.ts: engine.ts.',
    generate: 'Generuj',
    reseed: 'Nowe ziarno',
    reset: 'Domyślne',
    downloadSvg: 'Pobierz SVG',
    abort: 'Przerwij',
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
    topLabel: 'ile najdłuższych',
    autoRun: 'generuj od razu po zmianie',
    showHelp: 'pokazuj opisy parametrów',
    tabLab: 'Laboratorium',
    tabLibrary: 'Zapisane plansze',
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
    loadIntoLab: 'Wczytaj do laboratorium',
    noStoreServer: 'Brak serwera magazynu — uruchom sh packages/cli/lab.sh.',
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
    rangeViolation: (label, value, min, max) => `${label}: ${value} poza zakresem ${min}..${max}`,
    generateBlocked: 'Popraw ustawienia zaznaczone na czerwono, żeby generować',
    clamped: 'Część wczytanych ustawień przyciągnięto do bezpiecznego zakresu',
  },
}
