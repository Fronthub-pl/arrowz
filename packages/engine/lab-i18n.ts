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
    closing: 'when stuck',
  },
  groupHelp: {
    lengths:
      'Arrows come in three sizes: short (2–6 cells), medium (7–15) and long (16 up to the longest). Set the shares of short and medium; long gets the rest.',
    shape:
      'How arrows bend while the board is built: straight runs, side steps, coils. The settings multiply, so one extreme value drowns out the rest.',
    difficulty:
      'How hard the finished puzzle is: where arrows start, how many traps, and a share of arrows with a target length. Some of these change the look too.',
    skeleton:
      'A few very long arrows laid first, snaking back and forth across the whole board; the rest fills in around them. The only way to get really long arrows.',
    closing:
      'The generator can get stuck laying arrows; these settings decide how it carries on. The defaults fill every board up to 400×400; change them only to experiment.',
  },
  presets: {
    placeholder: 'Preset…',
    caption: "Levels set the board's size only; the options change its shape or how arrows are laid.",
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
      portrait: 'tall',
      tunnels: 'tunnels',
      skeleton: 'skeleton',
      serpentine: 'winding skeleton',
    },
    modeHelp: {
      square: 'As wide as it is tall.',
      portrait: 'Twice as tall as it is wide.',
      tunnels: 'Arrows start deep inside, buried behind others: harder.',
      skeleton: 'A few very long arrows snake across the board first.',
      serpentine: 'A skeleton whose runs keep breaking off: no run goes wall to wall.',
    },
  },
  // The simple view (lab-simple.ts): plain choices instead of thirty knobs.
  simple: {
    viewSimple: 'Simple',
    viewAdvanced: 'Advanced',
    lengths: 'arrow length',
    shape: 'winding',
    skeleton: 'skeleton',
    options: {
      skeleton: { off: 'no skeleton', on: 'with a skeleton' },
    },
    ends: {
      lengths: ['very short', 'very long'],
      shape: ['straightest', 'most winding'],
    },
    lengthsHelp:
      "Left: many short arrows. Right: fewer, longer ones. The number is the slider's position from 0 to 100, not a setting's value; the detailed settings follow from it.",
    shapeHelp:
      "Left: straight arrows. Right: arrows that bend and wind a lot. The number is the slider's position from 0 to 100, not a setting's value; the detailed settings follow from it.",
    skeletonHelp: 'Starts the board with a few very long arrows snaking across it; the rest fills in around them.',
    randomize: 'randomise the settings on every generate',
    // The row's short label; the sentence above is its title.
    randomizeShort: 'randomise',
    randomizeHelp:
      'Each Generate picks fresh settings within a safe range for this size and these choices, so you get a new board every time, even with the same seed. See the picked values in Advanced.',
    // No presets in this view, so the hint sends the player to the advanced one.
    harder:
      'Want it harder? In Advanced, pick a tunnels preset, or set arrow start to tunnels in the “difficulty” group.',
  },
  // The one control the lab builds by hand, because the CLI has one flag for
  // the two knobs behind it: --start writes headBias and mix together, so
  // neither of them gets a row, and their texts are not PARAM_SPEC's.
  start: {
    label: 'arrow start',
    help:
      'Where each new arrow starts while the board is built. Tunnels: deep inside, so arrows end up buried behind others. Tunnels = harder. Layers: from the edges inwards (easier, more bends). Random: anywhere. Mix: a share of tunnels among layers.',
    options: { layers: 'layers', random: 'random', tunnels: 'tunnels', mixing: 'mix' },
  },
  // A knob row's label: the engine's term, one line of at
  // most 12 characters, so the label track is one width in every group. The
  // full sentence stays in the row's title and in its description.
  short: {
    W: 'width',
    H: 'height',
    seed: 'seed',
    wShort: 'short share',
    wMid: 'medium share',
    Lmax: 'max length',
    backbite: 'tail rework',
    pStraight: 'straightness',
    wLateral: 'sideways',
    warns: 'nooks first',
    anticoil: 'coil penalty',
    headBias: 'arrow start',
    mix: 'tunnel share',
    trapBias: 'traps',
    probe: 'target share',
    probeLen: 'target len',
    giants: 'skeletons',
    giantSpan: 'length',
    giantStep: 'run gap',
    giantJitter: 'cut short',
    wGiant: 'late chance',
    giantStraight: 'straightness',
    giantAnticoil: 'coil penalty',
    giantSpacing: 'spacing',
    headTries: 'start tries',
    absorbLimit: 'leftover max',
    maxBack: 'backtracks',
    restarts: 'restarts',
  },
  // The unit beside a knob's value, in the value track's 44px at 11px.
  units: { cells: 'cells', times: '×', arrows: 'arrows', sides: '× side', px: 'px' },
  ui: {
    generate: 'Generate',
    reseed: 'New seed',
    reset: 'Defaults',
    downloadSvg: 'Download SVG',
    abort: 'Abort',
    abortDiscard: 'Discard',
    checkSeeds: 'Check seeds',
    checkSeedsCount: 'seeds',
    checkingSeeds: (done: number, planned: number) => `Checking ${done}/${planned}`,
    cliLabel: 'CLI',
    runColumn: 'Run',
    // The phone's bar of bottom sheets: its name and its
    // buttons, on the lab and on the saved boards.
    sheetBar: 'Panels',
    sheetSettings: 'Settings',
    sheetCli: 'CLI',
    sheetReport: 'Report',
    sheetBoards: 'Boards',
    sheetBoard: 'Board',
    moreOptions: 'More options',
    runStatus: 'Run status',
    commandHead: 'CLI command (matches the current settings)',
    copy: 'Copy',
    copied: 'Copied',
    preview: 'Preview',
    // The preview's sections; the heading prints them in caps.
    previewGeometry: 'geometry',
    previewDrawing: 'drawing',
    previewPoints: 'dots',
    previewColours: 'colours',
    cellLabel: 'cell size in export (px)',
    cellHelp: 'Affects only the downloaded SVG and the CLI command. No effect on the preview.',
    strokeLabel: 'line thickness (cells)',
    headWidthLabel: 'arrowhead width (cells, auto = fits the line)',
    headHeightLabel: 'arrowhead length (cells)',
    headWidthHelp:
      "How wide the arrowhead is, in cells. auto picks a width that suits the line's thickness. An arrowhead narrower than the line is widened to it.",
    headHeightHelp: 'How long the arrowhead is, measured along the arrow, in cells. 0 = a flat end with no point.',
    rounded: 'round the corners (and the tail)',
    colored: 'colour the arrows (each a different colour)',
    highlightLongest: 'highlight the longest arrows',
    voids: 'show empty cells',
    showPoints: 'show the dot grid',
    pointColorLabel: 'dot colour',
    pointRadiusLabel: 'dot radius (cells)',
    pointRadiusHelp: 'Half a cell is the most; above that the dots merge into a wash of colour.',
    padLabel: 'margin (cells)',
    padHelp:
      'Empty space kept around the board, in cells. Changes the preview only, not the CLI command or the downloaded file.',
    themeLabel: 'theme',
    themeNone: 'none (default colours)',
    // The console's editable custom palette. It coexists with a chosen theme,
    // overriding the theme's colours field by field.
    paletteLabel: 'custom palette',
    paletteAdd: 'add colour',
    paletteColorLabel: (n: number) => `colour ${n}`,
    paletteRemove: (n: number) => `remove colour ${n}`,
    // A function of the cap, so the caller's `PALETTE_CAP` and this text
    // cannot drift apart.
    paletteHelp: (cap: number) =>
      `Your own colours for multicolour arrows, up to ${cap}. A chosen theme still supplies everything you do not set.`,
    // The board's own surface colours: '' means "not set", which lets
    // a chosen theme supply them.
    paperLabel: 'background',
    inkLabel: 'arrow colour',
    highlightColorLabel: 'highlight',
    paperClear: 'clear the background, back to the theme',
    // The preview as knob rows: short labels (at most 12
    // characters, like the knobs'), section headings, the two dependency
    // blocks, a switch's value, and a description for every row.
    viewShortStroke: 'thickness',
    viewShortHeadWidth: 'head width',
    viewShortHeadHeight: 'head length',
    viewShortTop: 'how many',
    viewShortCell: 'export cell',
    viewShortPointRadius: 'dot radius',
    viewShortPad: 'margin',
    viewShortPointColor: 'dot colour',
    viewShortRounded: 'rounded',
    viewShortColored: 'multicolour',
    viewShortHighlightLongest: 'mark longest',
    viewShortVoids: 'empty cells',
    viewShortShowPoints: 'dot grid',
    viewShortTheme: 'theme',
    viewShortPaper: 'background',
    viewShortInk: 'arrow colour',
    viewShortHighlightColor: 'highlight',
    viewShortPalette: 'palette',
    // The theme row's empty choice: its select is a slider's length, and
    // `themeNone` does not fit it (the simple view keeps that one).
    viewThemeNone: 'none',
    secArrows: 'arrows',
    secHighlight: 'highlight',
    secGrid: 'grid',
    secExport: 'export',
    needsHighlightLongest: 'turn on mark longest',
    needsPoints: 'turn on dot grid',
    valueOn: 'on',
    valueOff: 'off',
    valueNotSet: 'not set',
    paletteCount: (n: number, cap: number) => `${n} / ${cap}`,
    strokeHelp:
      'How thick the arrows are, as a share of a cell. 0.2 = a hairline; 0.9 = fills the cell and leaves the arrowhead no room.',
    topHelp: 'How many of the longest arrows the highlight marks. 0 marks none.',
    pointColorHelp: 'Colour of the dot grid.',
    showPointsHelp:
      'Draws one dot per cell under the arrows, like the ruling of a notebook page. Hidden while the board is zoomed too far out for the dots to read.',
    roundedHelp: 'Rounds the corners where an arrow turns, and rounds off its tail.',
    coloredHelp:
      'Gives every arrow a colour of its own: from your palette, else from the theme, else automatic colours.',
    highlightLongestHelp: 'Draws the longest arrows in the highlight colour, on top of the rest.',
    voidsHelp: 'Marks the cells left empty when the generator got stuck. You only see them on an incomplete board.',
    themeHelp:
      'A ready colour set: background, arrow colour, highlight and the multicolour palette. What you set below overrides it.',
    paperHelp:
      "The board's background colour. Set, it overrides the theme; cleared, the theme's returns. Changes the preview only, not the CLI command or the downloaded file.",
    inkHelp:
      "The colour of every arrow while multicolour is off. Set, it overrides the theme; cleared, the theme's returns. Changes the preview only, not the CLI command or the downloaded file.",
    inkClear: 'clear the arrow colour, back to the theme',
    highlightColorHelp:
      "The colour of the longest arrows and the empty cells. Set, it overrides the theme; cleared, the theme's returns. Changes the preview only, not the CLI command or the downloaded file.",
    highlightColorClear: 'clear the highlight, back to the theme',
    topLabel: 'how many longest',
    autoRun: 'generate right after a change',
    // A knob row's `?`, its dependency blocks and the
    // lengths mix bar.
    aboutKnob: (name: string) => `About ${name}`,
    needsSkeleton: 'needs skeletons > 0 or late chance > 0',
    needsProbe: 'needs target share > 0',
    depSkeleton: 'skeleton',
    depProbe: 'target length',
    subLayout: 'layout',
    subGrowth: 'growth',
    mixShort: 'short',
    mixMedium: 'medium',
    mixLong: 'long',
    mixCap: 'short + medium: at most 90%',
    tabLab: 'Lab',
    tabLibrary: 'Saved boards',
    tabDocs: 'Docs',
    /** The accessible name of the tab strip itself, not of any one tab. */
    tabsLabel: 'Sections',
    // The command palette. `cmd…`, not `palette…`: the
    // `palette*` keys above belong to the editable colour palette.
    cmdOpen: 'Command palette (⌘K)',
    // At XS the top bar's right group folds into a menu,
    // and ⌘K reads as words there. The words must stay inside `cmdOpen`, the
    // button's accessible name (WCAG 2.5.3).
    menu: 'menu',
    cmdTouch: 'command palette',
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
    cmdHintReport: 'report',
    cmdHintSettings: 'settings',
    cmdNoRun: 'nothing running',
    cmdRunning: 'already running',
    cmdBroken: 'invalid settings',
    cmdViewSimple: 'Simple view',
    cmdViewAdvanced: 'Advanced view',
    cmdLangToPl: 'Switch to Polish',
    cmdLangToEn: 'Switch to English',
    // Pasting a carve line into the palette: its one row, and the parser's
    // problems as the lab says them (the token as typed is an argument).
    cmdLoad: 'Load this command',
    cmdLoadNote: 'command',
    cmdDrawn: 'drawn at random',
    cmdIgnored: (list: string) => `ignored: ${list}`,
    cmdProblems: (n: number) => (n === 1 ? '1 problem' : `${n} problems`),
    cmdOr: 'or',
    argNoValue: (arg: string) => `${arg} takes no value`,
    argUnexpected: (arg: string) => `${arg} is not a flag`,
    argRetiredUse: (arg: string, use: string) => `${arg} is gone; use ${use}`,
    argRetiredOneMode: (arg: string) => `${arg} is gone: the command has one mode now, drop it`,
    argRetiredBoard: (arg: string) => `${arg} is gone: a board file is always written, drop it`,
    argRetiredSpacing: (arg: string, use: string) => `${arg} is gone: the spacing strength is fixed now; use ${use}`,
    argNotStart: (arg: string, words: string, min: number, max: number) =>
      `${arg} is not ${words} and not a number in ${min}..${max}`,
    argOutside: (arg: string, min: number, max: number) => `${arg} is outside ${min}..${max}`,
    argNotNumber: (arg: string) => `${arg} is not a number`,
    argNotNumberOrWords: (arg: string, words: string) => `${arg} is not a number and not ${words}`,
    argNotWhole: (arg: string) => `${arg} is not a whole number`,
    argNotTheme: (arg: string, themes: string) => `${arg} is not a theme: ${themes}`,
    argNotColour: (arg: string) => `${arg} is not a #rrggbb colour`,
    argNotColourList: (arg: string) => `${arg} is not a list of #rrggbb colours`,
    argPaletteTooLong: (arg: string, cap: number) => `${arg} has more than ${cap} colours`,
    argUnknown: (arg: string) => `${arg} is not a flag this command knows`,
    argMissing: (flag: string) => `the command has no ${flag}`,
    argUnclosedQuote: (arg: string) => `a quote has no end: ${arg}`,
    /** The accessible name of the documentation's own two-page navigation. */
    docsNavLabel: 'Documentation pages',
    docsElement: 'Board element',
    docsCli: 'Command line',
    fullView: 'Full view (key F)',
    pressGenerate: 'Press "Generate".',
    generating: 'Generating…',
    generatingBig: (W: number, H: number, cells: string) =>
      `Generating ${W}×${H} (${cells} cells) — this will take a while…`,
    progress: (pct: string, pieces: string, remaining: string, backtracks: number, s: string) =>
      `<b>${pct}%</b> · ${pieces} arrows · ${remaining} left · backtracks ${backtracks} · ${s} s`,
    // While a carve runs, Generate is the meter and carries the
    // percent; the line under it says the rest of `progress`, and the hidden
    // progressbar beside it is named `runProgress`.
    generatingPct: (pct: string) => `Generating ${pct}%`,
    progressRest: (pieces: string, remaining: string, backtracks: number, s: string) =>
      `${pieces} arrows · ${remaining} left · backtracks ${backtracks} · ${s} s`,
    runProgress: 'Run progress',
    workerError: 'Worker error:',
    generationError: 'Generation error:',
    aborted: 'Aborted.',
    stopping: 'Stopping…',
    stopped: 'Stopped — the arrows laid so far',
    closed: 'Board complete: every cell filled.',
    solvable: 'Solvable.',
    unsolvable: 'UNSOLVABLE — a generator bug.',
    notClosedStatus: (remaining: string, fragments: number, largest: number, heads: number | null, exits: number) =>
      `The board could not be filled: at best ${remaining} cells stayed empty, in ${fragments} patches (largest ${largest}).${
        heads === null ? '' : ` At that moment a new arrow could still start in ${heads} of ${exits} places.`
      } Try another seed or more straightness.`,
    stat_board: 'board',
    stat_boardVal: (W: number, H: number, cells: string, seed: number) => `${W} × ${H} = ${cells} cells, seed ${seed}`,
    stat_pieces: 'arrows',
    stat_avgLen: 'average length',
    stat_longest: 'longest',
    stat_longestVal: (n: number, pct: string) => `${n} cells (${pct} of the board)`,
    stat_lengths: 'lengths',
    stat_f0: 'free at start',
    stat_almost: 'traps',
    stat_D: 'depth',
    stat_corridor: 'path to edge',
    stat_span: 'average reach',
    stat_spanTop: 'reach, top 10%',
    stat_spanMax: 'reach, record',
    stat_outDeg: 'blocks on average',
    stat_maxOut: 'blocks, record',
    stat_blockDist: 'blocking distance',
    piecesUnit: 'arrows',
    sidesUnit: 'of width + height',
    stat_bends: 'bends per arrow',
    stat_coil: 'coiling',
    stat_border: 'wrapping',
    stat_multi: 'bent arrows',
    stat_stall: 'stopped short',
    stat_stallVal: (pStall: string, pGot: string) => `${pStall} of arrows laid, reaching ${pGot} of the planned length`,
    stat_absorbed: 'merged leftovers',
    stat_absorbedVal: (n: number, cells: number) =>
      `${n} ${n === 1 ? 'patch' : 'patches'} (${cells} ${cells === 1 ? 'cell' : 'cells'})`,
    stat_backtracks: 'backtracks / restarts',
    stat_time: 'time',
    stat_timeVal: (g: string, m: string) => `generation ${g} s, metrics ${m} s`,
    stat_lengthsRange: (min: number, max: number) => `${min}–${max} cells`,
    stat_farBlock: 'blocked from afar',
    stat_turnsPerCell: 'turns per cell',
    stat_ownSides: 'touching itself',
    stat_neighbours: 'neighbours of a long arrow',
    stat_rework: 'tail reworks',
    stat_reworkVal: (done: number, gaveUp: number) => `${done} done, ${gaveUp} gave up`,
    stat_stuckBy: 'what stopped them',
    stat_stuckByVal: (own: string, other: string, edge: string) =>
      `itself ${own} · other arrows ${other} · edge ${edge}`,
    stat_stuckLen: 'length when stuck',
    stat_selfTrap: 'stuck on themselves',
    stat_shortened: 'shortened',
    stat_shortenedVal: (share: string, cells: string) => `${share} of arrows laid, ${cells} cells shorter on average`,
    stat_board_help: 'Width × height, the number of cells, and the seed that reproduces this board.',
    stat_pieces_help: 'How many arrows the board has. More arrows = a longer game.',
    stat_avgLen_help: 'Cells per arrow, on average. Higher = fewer, longer arrows.',
    stat_longest_help:
      'The longest arrow, in cells and as a share of the board. Longer = more of the board in one arrow.',
    stat_lengths_help: 'Share of arrows by length in cells: 2–6, 7–15, 16–49 and 50 or more.',
    stat_f0_help: 'Arrows you can remove on the very first move. Lower = harder.',
    stat_almost_help:
      'Arrows blocked by exactly one other: they look almost free, but are not. More = more tempting mistakes.',
    stat_D_help:
      'The longest chain of arrows waiting on one another. Even removing every free arrow at once, clearing the board takes depth + 1 rounds. Higher = harder.',
    stat_corridor_help:
      'How many cells, on average, an arrow has to travel in the direction it points to leave the board. Higher = longer ways out.',
    stat_span_help:
      "How much of the board's width or height an arrow stretches across, on average (the larger of the two). Higher = arrows cross more of the board.",
    stat_spanTop_help: 'The same, for the 10% of arrows that reach furthest. Higher = arrows cross more of the board.',
    stat_spanMax_help: 'The reach of the one arrow that reaches furthest. Higher = arrows cross more of the board.',
    stat_outDeg_help:
      'How many arrows each arrow stands in the way of, on average. Higher = removing one arrow frees more.',
    stat_maxOut_help: 'The most arrows a single arrow stands in the way of. Higher = one removal frees more.',
    stat_blockDist_help:
      "How far an arrow's head is from the heads of the arrows it blocks, on average, as a share of width + height. Higher = one move matters across the board.",
    stat_bends_help: 'How many times an arrow turns, on average. More = more winding arrows.',
    stat_coil_help:
      'Share of cells where an arrow touches itself on three sides: a clump rather than a line. Lower = cleaner arrows.',
    stat_border_help:
      'For arrows of 8 cells or more: how much of an arrow runs alongside a single neighbour. Higher = arrows wrap around each other.',
    stat_multi_help: 'Share of arrows that are not one straight line. More = fewer straight sticks.',
    stat_stall_help:
      'How the generator worked: the share of the arrows it laid (taken-back ones included) that stopped before the length it planned for them, and how much of the planned length they reached. Lower = smoother.',
    stat_absorbed_help:
      'How the generator worked: small empty patches it glued onto neighbouring arrows. Fewer = a cleaner board.',
    stat_backtracks_help:
      'How the generator worked: how many times it took arrows back, and how many fresh attempts it needed. Fewer = smoother.',
    stat_time_help: 'How long the board took to generate and to measure. Lower = faster.',
    stat_farBlock_help:
      'Arrows whose nearest blocker is more than 2 cells ahead of the arrow: what holds them is not in plain sight. More = more blockers to look for.',
    stat_turnsPerCell_help:
      'Turns per cell, over the whole board: unlike bends per arrow, a long arrow weighs as much as its cells. Higher = more winding.',
    stat_ownSides_help:
      "How many of a cell's four sides touch the same arrow, on average. Higher = arrows fold onto themselves.",
    stat_neighbours_help:
      'For arrows of 8 cells or more: how many different arrows each one touches. Higher = arrows are more interwoven.',
    stat_rework_help:
      'In the last attempt: how many times an arrow that hit a dead end reworked its tail and grew on, and how many times it gave up. Only with tail rework on. More done = the setting is at work.',
    stat_stuckBy_help:
      'In the last attempt: what surrounded the tail of an arrow that could grow no further (the arrow itself, other arrows, or the edge), as shares of its sides. A high "itself" = arrows trap themselves.',
    stat_stuckLen_help:
      'In the last attempt: how long an arrow was, on average, when it could grow no further. Higher = arrows get stuck later.',
    stat_selfTrap_help:
      "In the last attempt: stops where the arrow's own body walled in at least two sides of its tail. More = arrows trap themselves more often.",
    stat_shortened_help:
      'In the last attempt: the share of arrows laid that were cut back so they would not leave a gap no arrow could fill, and by how many cells on average. Lower = fewer cuts.',
    // The stored board shows only generation time, not the metrics pass `stat_time_help` also covers.
    stat_gen_help: 'How long the board took to generate.',
    longestHead: (n: number) => (n === 1 ? 'The longest arrow' : `The ${n} longest arrows`),
    longestHelp:
      'Reach = what fraction of the board side the arrow covers. Density = how tightly it fills its rectangle. Coiling = share of cells touching their own path on three sides. A snake crossing the board has a high reach and low other two; a coil the opposite.',
    th_len: 'length',
    th_box: 'box',
    th_span: 'reach',
    th_density: 'density',
    th_coil: 'coiling',
    longestName: 'the longest arrows',
    saved: 'saved',
    notSaved: 'not saved (no store server)',
    savedKnownLayout: 'already in the library; recipe added',
    savedKnownRecipe: 'already in the library; recipe updated',
    refresh: 'Refresh',
    boardCommand: 'Command of this board',
    boardRows: 'Boards of this size',
    boardDetail: 'The open board',
    loadIntoLab: 'Load into lab',
    noStoreServer: 'No store server: pnpm nx serve lab starts one, or run deno task store.',
    storeEmpty: 'The store is empty. Generate a board in the lab or with deno task carve.',
    notClosed: 'incomplete',
    piecesShort: (n: number | string) => `${n} arrows`,
    longestShort: (n: number | string) => `longest ${n}`,
    loadingBoard: (id: string) => `Loading ${id}…`,
    boardFileError: (id: string, reason: string) => `Board ${id} cannot be read: ${reason}`,
    openedFile: (name: string, W: number, H: number) => `File ${name}: ${W}×${H}`,
    boardSize: (W: number, H: number) => `${W}×${H}`,
    open_notJson: 'it is not JSON',
    open_noBoard: 'none of the files is a board file',
    open_twoBoards: 'two board files at once; open one',
    open_metaOther: 'the meta file belongs to another board',
    open_notMeta: 'the other file is neither a board file nor its meta',
    boardNotStored: (id: string) => `Board ${id} is not in the store`,
    savedBoard: (id: string, seed: number | string, source: string, gen: string) =>
      `Saved board ${id}, seed ${seed}, source: ${source}, generated in ${gen}.`,
    deleteBoard: 'Delete from disk',
    confirmDelete: 'Really delete?',
    viewSaved: (id: string) => `Saved the new view of board ${id}.`,
    deletedBoard: (id: string) => `Deleted ${id}.`,
    deleteFailed: 'Could not delete the board.',
    // The saved boards in the lab's layout: the drawer's
    // rail, its list's header, the right column and the report's figures.
    boardsRailLabel: 'Board sizes and preview',
    railSizes: 'sizes',
    sizeTab: (size: string, n: number) => `${size}, ${n} board${n === 1 ? '' : 's'}`,
    boardsCount: (n: number) => `${n} board${n === 1 ? '' : 's'}`,
    cliThisBoard: 'CLI · this board',
    openBoardHint: 'Open a board from the list.',
    openFile: 'Open file…',
    boardFacts: 'About this board',
    factLayout: 'layout',
    factSeed: 'seed',
    factSource: 'source',
    factGenerated: 'generated',
    factFile: 'file',
    factEmpty: 'empty cells',
    fileNoMeta:
      'Opened without its meta file. Choose the board file together with its meta (the .json of the same name in the store) to get the command, the seed and Load into lab.',
    secStoredArrows: 'arrows · saved with the board',
    stat_genVal: (g: string) => `generation ${g} s`,
    notClosedShort: 'Board incomplete.',
    storedReportNote: 'A saved board keeps these figures only. Load it into the lab and generate for the full report.',
    inactivePrefix: 'No effect: ',
    // Safe envelope: settings the engine refuses to generate with.
    violationsTitle: 'Settings outside the safe range',
    // The parameter console (apps/lab). The rail is a landmark of its own, so
    // it needs a name the tab strip does not already use.
    railLabel: 'Parameter groups',
    railGenerator: 'generator',
    railElement: 'look',
    // The floor a cross-knob rule puts on a knob: drawn on the slider's track,
    // and named here because a mark is not a message.
    ruleBound: (need: number) => `Minimum for this board: ${need}`,
    // A rail entry that carries a count names what the count is.
    violationsInGroup: (group: string, count: number) =>
      `${group}, ${count} setting${count === 1 ? '' : 's'} outside the safe range`,
    rangeViolation: (label: string, value: unknown, min: number, max: number) =>
      `${label}: ${value} — allowed ${min} to ${max}`,
    stepViolation: (label: string, value: number, below: number, above: number) =>
      `${label}: ${value} is not an allowed step; the nearest are ${below} and ${above}`,
    // A rule whose bound is computed from the board rather than fixed.
    needViolation: (reason: string, need: number) => `${reason}; this board needs at least ${need}`,
    generateBlocked: 'Fix the settings marked in red to generate',
    clamped: 'Some loaded settings were pulled into the safe range',
    // The preset strip: its accessible name (it carries no visible caption),
    // and the button that puts the clamp notice away.
    presetsLabel: 'Presets',
    // The preset picker: the trigger's caps label, what it says when
    // no preset spells the knobs, and the note beside it in that state.
    preset: 'preset',
    customSettings: 'custom settings',
    editedSinceLastPreset: 'edited since the last preset',
    // The report drawer's handle, its visible and accessible name.
    reportHandle: 'report',
    // The settings drawer's handle, its mirror on the stage's left edge.
    settingsHandle: 'settings',
    dismiss: 'Dismiss',
    // The top bar's two choices, each a radio group named by what it chooses.
    // The language codes are the visible text and so the accessible name: a
    // name that does not contain what is on screen fails WCAG 2.5.3 for speech
    // input.
    modeLabel: 'View',
    languageLabel: 'Language',
    langPl: 'PL',
    langEn: 'EN',
    // The simple view's region; its visible heading is only the view's name.
    simplePanel: 'Simple settings',
    // The report column and its delta, the frame's annotation, and the
    // run column's two exports. The two delta words are never visible: the
    // cell's colour and sign say it on screen, and a screen reader hears these.
    reportPanel: 'Report',
    statsTable: 'Statistics',
    deltaUp: 'up',
    deltaDown: 'down',
    // The report's summary and the names of its
    // groups, one per span between the engine's separators (lab-report.ts).
    reportSummaryCap: "vs. the previous board: green = up, red = down; a row's ? says what a change means",
    reportHelpAbout: 'these four figures',
    statSumSeconds: (s: string) => `${s} s`,
    statGroupSize: 'size',
    statGroupBlocking: 'difficulty',
    statGroupReach: 'reach',
    statGroupShape: 'shape',
    statGroupRun: 'generator',
    statGroupDetail: 'generator in detail',
    // The Seeds section: a series' outcome counts, the means of its complete
    // seeds, and one line per seed that did not complete.
    seriesTitle: 'Seeds',
    seriesStale: 'for other settings',
    seriesHead: (total: number, complete: number, incomplete: number, unsolvable: number, stopped: number) =>
      `Complete on ${complete} of ${total} · incomplete ${incomplete} · unsolvable ${unsolvable} · stopped ${stopped}`,
    seriesMeanArrows: 'arrows, mean',
    seriesMeanLongest: 'longest, mean',
    seriesMeanTime: 'time, mean',
    seriesMean_help:
      'Averaged over the complete seeds only: an incomplete board would pull the numbers towards a board nobody plays.',
    seriesFailed: (seed: number, outcome: string, left: number) =>
      `seed ${seed} — ${outcome}, ${left} ${left === 1 ? 'cell' : 'cells'} left`,
    // Unsolvable always leaves the board full, so a cell count would say nothing.
    seriesFailedUnsolvable: (seed: number) => `seed ${seed} — unsolvable`,
    seriesOutcome_incomplete: 'incomplete',
    seriesOutcome_unsolvable: 'unsolvable',
    seriesOutcome_stopped: 'stopped',
    seriesStatus: (done: number, planned: number) => `Checking seeds: ${done} of ${planned}…`,
    seriesStopping: 'Stopping the seeds…',
    seriesError: (message: string) => `The seeds could not be checked: ${message}`,
    boardAnnotation: (W: number, H: number, seed: number) => `${W}×${H} · seed ${seed}`,
    // The board frame's mode: look, click a piece for its facts, or play it.
    boardModeLabel: 'Board mode',
    boardModeView: 'View',
    boardModeInspect: 'Inspect',
    boardModePlay: 'Play',
    inspectHint: 'Choose an arrow to inspect it.',
    dirUp: 'up',
    dirRight: 'right',
    dirDown: 'down',
    dirLeft: 'left',
    pieceFacts: (id: number, length: number, dir: string) =>
      `Arrow #${id} · ${length} ${length === 1 ? 'cell' : 'cells'} · ${dir}`,
    pieceFree: 'free',
    pieceBlocked: (id: number, distance: number) =>
      distance === 0
        ? `blocked by #${id} right in front`
        : `blocked by #${id} at ${distance} ${distance === 1 ? 'cell' : 'cells'}`,
    playStatus: (left: string, mistakes: number) =>
      `${left} left · ${mistakes} ${mistakes === 1 ? 'mistake' : 'mistakes'}`,
    playCleared: (mistakes: number) => `Cleared · ${mistakes} ${mistakes === 1 ? 'mistake' : 'mistakes'}`,
    boardReset: 'Reset',
    exportsGroup: 'Export',
    downloadBoardFile: 'Download board file',
    exportError: 'Export failed:',
    // The board-file download is named by the layout hash, which Web Crypto
    // computes only in a secure context: said beside the exports, not as an
    // export failure.
    layoutHashError: 'Cannot name the board file:',
  },
} as const

/**
 * English display words where the CLI's word is not the one a player should
 * read (`--trapbias=off` is the generator's own trap count). The command box
 * keeps the CLI word; see `choiceText`.
 */
export const EN_CHOICES: Partial<Record<ParamKey, Record<string, string>>> = {
  trapBias: { off: 'normal' },
}

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

/** The Polish count form after a number: 1, then 2–4 (but not 12–14), then the rest. */
function plCount(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one
  const tens = n % 100
  const ones = n % 10
  return ones >= 2 && ones <= 4 && (tens < 12 || tens > 14) ? few : many
}

/** "plansza" after a count: 1 plansza, 2–4 plansze (but 12–14 plansz), 5+ plansz. */
function plBoards(n: number): string {
  return plCount(n, 'plansza', 'plansze', 'plansz')
}

/** "komórka" after a count: 1 komórka, 2 komórki, 5 komórek. */
function plCells(n: number): string {
  return plCount(n, 'komórka', 'komórki', 'komórek')
}

/** "błąd" after a count: 1 błąd, 2 błędy, 5 błędów (and 0 błędów). */
function plMistakes(n: number): string {
  return plCount(n, 'błąd', 'błędy', 'błędów')
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
    closing: 'gdy utknie',
  },
  reasons: {
    skeletonOff: 'nie ma szkieletu: szkielety i kolejne wynoszą 0',
    probeOff: 'żadna strzałka nie dostaje zadanej długości, dopóki „ile zadanych” wynosi 0',
    stepZero: 'przerwa jest „losowo”, więc szkielet nie ma biegów do urywania',
    anticoilWins: 'działa dopiero powyżej kary zwojów z grupy „kształt”',
    // Cross-knob rules (RULE_REASONS in the engine), keyed like the inactive reasons.
    sharesSum:
      'udziały krótkich i średnich dają razem więcej niż 0,9 (90%); co najmniej jedna dziesiąta strzałek musi zostać długa',
    lmaxHole:
      'najdłuższa strzałka: auto albo co najmniej 17 komórek; niżej średnie i długie wychodzą tej samej długości',
    straightFloor:
      'za mała prostość jak na tę planszę, więc prawdopodobnie utknie: większe plansze potrzebują prostszych strzałek, podobnie zakamarki poniżej 4 albo kara zwojów powyżej 6',
    giantWander:
      'za dużo kolejnych szkieletów jak na ich prostość: przy szansie na kolejne powyżej 0,05 podnieś prostość szkieletu do co najmniej 0,6 + ta szansa, inaczej plansze utykają',
    startPair:
      'start strzałek i udział tuneli się wykluczają: start musi być warstwy, losowo albo tunele, a udział tuneli (0,3 do 0,7) wymaga startu losowo; inaczej udział musi być wyłączony (-1)',
  },
  // The key is the CLI word (--giantspacing=off), the value the lab shows in
  // Polish: for a choice knob's list and for a chip's special word alike.
  choices: {
    giantSpacing: { off: 'bez odstępu', '2': '2', '3': '3' },
    trapBias: { avoid: 'unikaj', off: 'normalnie', seek: 'szukaj' },
    giantStep: { random: 'losowo' },
    Lmax: { auto: 'auto' },
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
    seed: {
      label: 'ziarno',
      help:
        'Numer planszy. To samo ziarno przy tych samych ustawieniach daje zawsze tę samą planszę; zmień je, by dostać inną planszę tego samego rodzaju.',
    },

    wShort: {
      label: 'udział krótkich (2–6 komórek)',
      help:
        'Jaka część strzałek jest krótka. Więcej = więcej strzałek na planszy, ale dużo drobnych haczyków. Krótkie + średnie: najwyżej 0,9 (90%).',
    },
    wMid: {
      label: 'udział średnich (7–15 komórek)',
      help:
        'Jaka część strzałek jest średnia. Resztę po krótkich i średnich dostają długie. Krótkie + średnie: najwyżej 0,9 (90%).',
    },
    Lmax: {
      label: 'najdłuższa strzałka (auto = 2,5 × dłuższy bok)',
      help:
        'Najdłuższa strzałka, do jakiej dąży generator, w komórkach. auto = 2,5 × dłuższy bok. Od 1 do 16 nie wolno: taki limit wcina się w średnie i długie.',
    },
    backbite: {
      label: 'przeróbka ogona utkniętej strzałki',
      help:
        'Gdy rosnąca strzałka utknie w ślepym zaułku, może przełożyć koniec ciała i rosnąć dalej, najwyżej tyle razy z rzędu. 0 = wyłączone. Więcej = mniej, dłuższych strzałek.',
    },

    pStraight: {
      label: 'prostość',
      help:
        'Jak często strzałka jedzie prosto zamiast skręcać. Wyżej = długie proste; niżej = więcej zakrętów. Znacznik na suwaku to minimum tej planszy.',
    },
    wLateral: {
      label: 'premia za krok w bok',
      help: 'Jak bardzo strzałka woli krok w bok niż wchodzenie w głąb planszy. 0 = proste wbicia i duże zwoje.',
    },
    warns: {
      label: 'najpierw zakamarki',
      help:
        'Jak mocno strzałka najpierw wypełnia małe ślepe zakamarki. Wyżej = mniej strzałek, dłuższe i bardziej zwinięte. Poniżej 4 duże plansze wymagają większej prostości.',
    },
    anticoil: {
      label: 'kara zwojów',
      help:
        'Jak mocno strzałka unika dotykania samej siebie. 1 = wyłączone. Wyżej = mniej zwojów, nieco krótsze strzałki. Powyżej 6 duże plansze wymagają większej prostości.',
    },
    headBias: {
      label: 'start strzałek (-1 warstwy, 0 losowo, 1 tunele)',
      help:
        'Skąd startuje każda nowa strzałka: od krawędzi (warstwy, łatwiej), gdziekolwiek (losowo) albo w głębi (tunele, trudniej). Wszystkie trzy wypełniają plansze do 400×400.',
    },
    mix: {
      label: 'start mieszany: udział strzałek z tuneli',
      help:
        'Przy starcie mieszanym: jaka część strzałek startuje w głębi (tunele), od 0,3 do 0,7; reszta od krawędzi (warstwy).',
    },
    trapBias: {
      label: 'pułapki (strzałki, które wyglądają na wolne)',
      help:
        'Pułapka: strzałka zablokowana przez dokładnie jedną inną, więc wygląda na wolną. „Szukaj” = o 25–60% więcej; „unikaj” = 3–8 razy mniej; „normalnie” = bez preferencji.',
    },
    probe: {
      label: 'udział strzałek o zadanej długości',
      help:
        'Jaka część strzałek dostaje długość bliską zadanej (wiersz niżej) zamiast mieszanki krótkich, średnich i długich. 1 przy długości 12 = same krótkie strzałki.',
    },
    probeLen: {
      label: 'zadana długość',
      help:
        'Zadana długość w komórkach, plus minus połowa. Krótka (4) potraja liczbę strzałek; długa (200) daje mniej, dłuższych.',
    },

    giants: {
      label: 'liczba strzałek szkieletu (0 = bez szkieletu)',
      help:
        'Ile bardzo długich strzałek układa się najpierw, wężykiem przez planszę. 0 = bez szkieletu; 4 to dobry początek.',
    },
    giantSpan: {
      label: 'długość szkieletu (w bokach planszy)',
      help:
        'Do jakiej długości dąży każda strzałka szkieletu, w wielokrotnościach dłuższego boku: 30 przy boku 50 komórek = 1500 komórek. Kończy wcześniej, gdy zabraknie miejsca.',
    },
    giantStep: {
      label: 'przerwa między biegami (losowo = bez wężyka)',
      help:
        'Szkielet przechodzi planszę prostymi biegami; to liczba komórek, o którą schodzi w głąb między biegami. Mała = gęste pasy; duża = kilka autostrad. „losowo” = bez biegów.',
    },
    giantJitter: {
      label: 'szansa, że bieg zawróci wcześniej',
      help:
        'Jak często bieg zawraca już po 3–14 komórkach, zamiast dojść do ściany albo innej strzałki. 0 = biegi idą do końca, brzegi są proste.',
    },
    wGiant: {
      label: 'szansa na kolejne szkielety',
      help:
        'Po pierwszych szkieletach każda nowa strzałka z tą szansą staje się szkieletem. Powyżej 0,05 wymaga prostości szkieletu 0,6 + ta szansa; przy 0,2 plansze liczą się wolno.',
    },
    giantStraight: {
      label: 'prostość szkieletu',
      help:
        'Jak często strzałka szkieletu jedzie prosto tam, gdzie nie układa biegów: cała przy przerwie „losowo”, inaczej tylko po ostatnim biegu. 0,5 = bez preferencji.',
    },
    giantAnticoil: {
      label: 'kara zwojów szkieletu',
      help:
        'Jak mocno strzałka szkieletu unika dotykania samej siebie. Kara zwojów z grupy „kształt” też działa i wygrywa wyższa, więc ta liczy się tylko powyżej niej.',
    },
    giantSpacing: {
      label: 'odstęp szkieletu',
      help:
        'Ile komórek szkielet stara się trzymać od swoich wcześniej ułożonych części, żeby się nie zablokować. „bez odstępu” = może biec tuż obok nich.',
    },
    headTries: {
      label: 'próby startu na kierunek',
      help:
        'Ile miejsc startu generator sprawdza przed zmianą kierunku. Przy 2 szukanie jest płytkie dla trudnych ustawień; od 8 w górę zwykle wychodzi ta sama plansza co przy 4.',
    },
    absorbLimit: {
      label: 'największa pusta łatka, którą zajmie sąsiednia strzałka (komórki)',
      help:
        'Pustą łatkę, w którą nie wejdzie żadna nowa strzałka, zajmuje sąsiednia, jeśli ma najwyżej tyle komórek. Blisko dolnej granicy plansze znacznie częściej utykają.',
    },
    maxBack: {
      label: 'budżet nawrotów',
      help:
        'Ile ułożonych strzałek generator może cofnąć w jednej próbie, zanim zacznie od nowa. 200 wystarcza; więcej tylko opóźnia wynik.',
    },
    restarts: {
      label: 'dopuszczalne restarty',
      help:
        'Ile razy generator zaczyna od pustej planszy, gdy próba utknie, z nowym ziarnem wyliczonym z Twojego. 0 pokazuje, jak często te ustawienia udają się same.',
    },
  },
  groupHelp: {
    lengths:
      'Strzałki są trzech rozmiarów: krótkie (2–6 komórek), średnie (7–15) i długie (od 16 do najdłuższej). Ustaw udział krótkich i średnich; długie dostają resztę.',
    shape:
      'Jak strzałki skręcają podczas budowania planszy: proste odcinki, kroki w bok, zwoje. Ustawienia się mnożą, więc jedna skrajna wartość zagłusza resztę.',
    difficulty:
      'Jak trudna będzie gotowa łamigłówka: skąd startują strzałki, ile pułapek i część strzałek o zadanej długości. Część z nich zmienia też wygląd.',
    skeleton:
      'Kilka bardzo długich strzałek układanych na początku, wężykiem przez całą planszę; reszta wypełnia miejsce wokół nich. Jedyny sposób na naprawdę długie strzałki.',
    closing:
      'Generator może utknąć przy układaniu strzałek; te ustawienia decydują, jak rusza dalej. Domyślne wypełniają każdą planszę do 400×400; zmieniaj je tylko eksperymentalnie.',
  },
  presets: {
    placeholder: 'Preset…',
    caption: 'Poziomy ustawiają tylko rozmiar planszy; opcje zmieniają jej kształt albo sposób układania strzałek.',
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
      portrait: 'pionowa',
      tunnels: 'tunele',
      skeleton: 'szkielet',
      serpentine: 'kręty szkielet',
    },
    modeHelp: {
      square: 'Tak szeroka, jak wysoka.',
      portrait: 'Dwa razy wyższa niż szersza.',
      tunnels: 'Strzałki startują w głębi, zakopane za innymi: trudniej.',
      skeleton: 'Najpierw kilka bardzo długich strzałek wije się przez planszę.',
      serpentine: 'Szkielet, którego biegi ciągle się urywają: żaden bieg nie idzie od ściany do ściany.',
    },
  },
  // The simple view (lab-simple.ts): plain choices instead of thirty knobs.
  simple: {
    viewSimple: 'Prosty',
    viewAdvanced: 'Zaawansowany',
    lengths: 'dł. strzałek',
    shape: 'krętość',
    skeleton: 'szkielet',
    options: {
      skeleton: { off: 'bez szkieletu', on: 'ze szkieletem' },
    },
    ends: {
      lengths: ['bardzo krótkie', 'bardzo długie'],
      shape: ['najprostsze', 'najbardziej kręte'],
    },
    lengthsHelp:
      'W lewo: dużo krótkich strzałek. W prawo: mniej, ale dłuższych. Liczba to pozycja suwaka od 0 do 100, a nie wartość ustawienia; szczegółowe ustawienia wynikają z niej.',
    shapeHelp:
      'W lewo: proste strzałki. W prawo: strzałki, które dużo skręcają i wiją się. Liczba to pozycja suwaka od 0 do 100, a nie wartość ustawienia; szczegółowe ustawienia wynikają z niej.',
    skeletonHelp:
      'Zaczyna planszę od kilku bardzo długich strzałek, które wiją się po całej planszy; reszta wypełnia miejsce wokół nich.',
    randomize: 'losuj ustawienia przy każdym generowaniu',
    randomizeShort: 'losuj',
    randomizeHelp:
      'Każde „Generuj” dobiera nowe ustawienia w bezpiecznym zakresie dla tego rozmiaru i wyborów, więc za każdym razem dostajesz inną planszę, nawet przy tym samym ziarnie. Wybrane wartości zobaczysz w widoku zaawansowanym.',
    harder:
      'Chcesz trudniej? W widoku zaawansowanym wybierz preset z tunelami albo w grupie „trudność” ustaw start na tunele.',
  },
  start: {
    label: 'start strzałek',
    help:
      'Skąd startuje każda nowa strzałka podczas budowania planszy. Tunele: w głębi, więc strzałki są zakopane za innymi. Tunele = trudniej. Warstwy: od krawędzi do środka (łatwiej, więcej zakrętów). Losowo: gdziekolwiek. Mieszane: część tuneli wśród warstw.',
    options: { layers: 'warstwy', random: 'losowo', tunnels: 'tunele', mixing: 'mieszane' },
  },
  short: {
    W: 'szerokość',
    H: 'wysokość',
    seed: 'ziarno',
    wShort: 'krótkie',
    wMid: 'średnie',
    Lmax: 'dł. maks.',
    backbite: 'przeróbki',
    pStraight: 'prostość',
    wLateral: 'ruch w bok',
    warns: 'zakamarki',
    anticoil: 'kara zwojów',
    headBias: 'start',
    mix: 'ile tuneli',
    trapBias: 'pułapki',
    probe: 'ile zadanych',
    probeLen: 'zadana dł.',
    giants: 'szkielety',
    giantSpan: 'długość',
    giantStep: 'przerwa',
    giantJitter: 'urywanie',
    wGiant: 'kolejne',
    giantStraight: 'prostość',
    giantAnticoil: 'kara zwojów',
    giantSpacing: 'odstęp',
    headTries: 'próby startu',
    absorbLimit: 'resztki do',
    maxBack: 'nawroty',
    restarts: 'restarty',
  },
  units: { cells: 'kom.', times: '×', arrows: 'strz.', sides: '× bok', px: 'px' },
  ui: {
    generate: 'Generuj',
    reseed: 'Nowe ziarno',
    reset: 'Domyślne',
    downloadSvg: 'Pobierz SVG',
    abort: 'Przerwij',
    abortDiscard: 'Odrzuć',
    checkSeeds: 'Sprawdź ziarna',
    checkSeedsCount: 'ziaren',
    checkingSeeds: (done, planned) => `Sprawdzam ${done}/${planned}`,
    cliLabel: 'CLI',
    runColumn: 'Generowanie',
    sheetBar: 'Panele',
    sheetSettings: 'Ustawienia',
    sheetCli: 'CLI',
    sheetReport: 'Raport',
    sheetBoards: 'Plansze',
    sheetBoard: 'Plansza',
    moreOptions: 'Więcej opcji',
    runStatus: 'Stan generowania',
    commandHead: 'Komenda CLI (odpowiada bieżącym ustawieniom)',
    copy: 'Kopiuj',
    copied: 'Skopiowano',
    preview: 'Podgląd',
    previewGeometry: 'geometria',
    previewDrawing: 'rysunek',
    previewPoints: 'kropki',
    previewColours: 'kolory',
    cellLabel: 'rozmiar komórki w eksporcie (px)',
    cellHelp: 'Dotyczy tylko pobieranego SVG i komendy CLI. Na podgląd nie ma wpływu.',
    strokeLabel: 'grubość linii (komórki)',
    headWidthLabel: 'szerokość grotu (komórki, auto = do linii)',
    headHeightLabel: 'długość grotu (komórki)',
    headWidthHelp:
      'Szerokość grotu w komórkach. auto dobiera szerokość do grubości linii. Grot węższy od linii zostaje do niej poszerzony.',
    headHeightHelp: 'Długość grotu wzdłuż strzałki, w komórkach. 0 = płaski koniec bez ostrza.',
    rounded: 'zaokrąglaj rogi (i ogon)',
    colored: 'koloruj strzałki (każda innym kolorem)',
    highlightLongest: 'wyróżnij najdłuższe strzałki',
    voids: 'pokaż puste komórki',
    showPoints: 'pokaż siatkę kropek',
    pointColorLabel: 'kolor kropek',
    pointRadiusLabel: 'promień kropki (komórki)',
    pointRadiusHelp: 'Najwięcej pół komórki; powyżej kropki zlewają się w plamę koloru.',
    padLabel: 'margines (komórki)',
    padHelp: 'Pusty margines wokół planszy, w komórkach. Zmienia tylko podgląd, nie polecenie CLI ani pobrany plik.',
    themeLabel: 'motyw',
    themeNone: 'brak (kolory domyślne)',
    paletteLabel: 'własna paleta',
    paletteAdd: 'dodaj kolor',
    paletteColorLabel: (n) => `kolor ${n}`,
    paletteRemove: (n) => `usuń kolor ${n}`,
    paletteHelp: (cap) =>
      `Własne kolory dla wielobarwnych strzałek, najwyżej ${cap}. Wybrany motyw nadal daje wszystko, czego nie ustawisz.`,
    paperLabel: 'tło',
    inkLabel: 'kolor strzałek',
    highlightColorLabel: 'wyróżnienie',
    paperClear: 'wyczyść tło, z powrotem do motywu',
    viewShortStroke: 'grubość',
    viewShortHeadWidth: 'szer. grotu',
    viewShortHeadHeight: 'dł. grotu',
    viewShortTop: 'ile najdł.',
    viewShortCell: 'komórka SVG',
    viewShortPointRadius: 'promień',
    viewShortPad: 'margines',
    viewShortPointColor: 'kolor kropek',
    viewShortRounded: 'zaokrąglenie',
    viewShortColored: 'wielobarwne',
    viewShortHighlightLongest: 'najdłuższe',
    viewShortVoids: 'puste kom.',
    viewShortShowPoints: 'kropki',
    viewShortTheme: 'motyw',
    viewShortPaper: 'tło',
    viewShortInk: 'kolor strz.',
    viewShortHighlightColor: 'wyróżnienie',
    viewShortPalette: 'paleta',
    viewThemeNone: 'brak',
    secArrows: 'strzałki',
    secHighlight: 'wyróżnienie',
    secGrid: 'siatka',
    secExport: 'eksport',
    needsHighlightLongest: 'włącz „najdłuższe”',
    needsPoints: 'włącz „kropki”',
    valueOn: 'wł.',
    valueOff: 'wył.',
    valueNotSet: 'nie ustawiono',
    paletteCount: (n, cap) => `${n} / ${cap}`,
    strokeHelp:
      'Grubość strzałek jako część komórki. 0,2 = cienka kreska; 0,9 = wypełnia komórkę i nie zostawia miejsca na grot.',
    topHelp: 'Ile najdłuższych strzałek zaznacza wyróżnienie. 0 nie zaznacza żadnej.',
    pointColorHelp: 'Kolor siatki kropek.',
    showPointsHelp:
      'Rysuje po kropce na komórkę pod strzałkami, jak linie w zeszycie. Znika, gdy plansza jest zbyt oddalona, by kropki dało się odczytać.',
    roundedHelp: 'Zaokrągla rogi, na których strzałka skręca, i zaokrągla jej ogon.',
    coloredHelp: 'Każda strzałka dostaje własny kolor: z Twojej palety, inaczej z motywu, inaczej automatycznie.',
    highlightLongestHelp: 'Rysuje najdłuższe strzałki kolorem wyróżnienia, na wierzchu pozostałych.',
    voidsHelp: 'Zaznacza komórki, które zostały puste, gdy generator utknął. Widać je tylko na niepełnej planszy.',
    themeHelp:
      'Gotowy zestaw kolorów: tło, kolor strzałek, wyróżnienie i paleta wielobarwna. To, co ustawisz niżej, ma pierwszeństwo.',
    paperHelp:
      'Kolor tła planszy. Ustawiony zastępuje motyw; wyczyszczony przywraca kolor z motywu. Zmienia tylko podgląd, nie polecenie CLI ani pobrany plik.',
    inkHelp:
      'Kolor wszystkich strzałek, gdy wielobarwne jest wyłączone. Ustawiony zastępuje motyw; wyczyszczony przywraca kolor z motywu. Zmienia tylko podgląd, nie polecenie CLI ani pobrany plik.',
    inkClear: 'wyczyść kolor strzałek, z powrotem do motywu',
    highlightColorHelp:
      'Kolor najdłuższych strzałek i pustych komórek. Ustawiony zastępuje motyw; wyczyszczony przywraca kolor z motywu. Zmienia tylko podgląd, nie polecenie CLI ani pobrany plik.',
    highlightColorClear: 'wyczyść wyróżnienie, z powrotem do motywu',
    topLabel: 'ile najdłuższych',
    autoRun: 'generuj od razu po zmianie',
    aboutKnob: (name: string) => `Opis: ${name}`,
    needsSkeleton: 'wymaga: szkielety > 0 albo kolejne > 0',
    needsProbe: 'wymaga: ile zadanych > 0',
    depSkeleton: 'szkielet',
    depProbe: 'zadana długość',
    subLayout: 'układ',
    subGrowth: 'wzrost',
    mixShort: 'krótkie',
    mixMedium: 'średnie',
    mixLong: 'długie',
    mixCap: 'krótkie + średnie: najwyżej 90%',
    tabLab: 'Laboratorium',
    tabLibrary: 'Zapisane plansze',
    tabDocs: 'Dokumentacja',
    tabsLabel: 'Sekcje',
    cmdOpen: 'Paleta poleceń (⌘K)',
    menu: 'menu',
    cmdTouch: 'paleta poleceń',
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
    cmdHintReport: 'raport',
    cmdHintSettings: 'ustawienia',
    cmdNoRun: 'nic się nie generuje',
    cmdRunning: 'już się generuje',
    cmdBroken: 'błędne ustawienia',
    cmdViewSimple: 'Widok prosty',
    cmdViewAdvanced: 'Widok zaawansowany',
    cmdLangToPl: 'Przełącz na polski',
    cmdLangToEn: 'Przełącz na angielski',
    cmdLoad: 'Wczytaj tę komendę',
    cmdLoadNote: 'komenda',
    cmdDrawn: 'losowo',
    cmdIgnored: (list) => `pominięte: ${list}`,
    cmdProblems: (n) => `${n} ${plCount(n, 'problem', 'problemy', 'problemów')}`,
    cmdOr: 'albo',
    argNoValue: (arg) => `${arg} nie przyjmuje wartości`,
    argUnexpected: (arg) => `${arg} nie jest flagą`,
    argRetiredUse: (arg, use) => `${arg} już nie istnieje; użyj ${use}`,
    argRetiredOneMode: (arg) => `${arg} już nie istnieje: komenda ma teraz jeden tryb, pomiń tę flagę`,
    argRetiredBoard: (arg) => `${arg} już nie istnieje: plik planszy powstaje zawsze, pomiń tę flagę`,
    argRetiredSpacing: (arg, use) => `${arg} już nie istnieje: siła odstępu jest teraz stała; użyj ${use}`,
    argNotStart: (arg, words, min, max) => `${arg} to ani ${words}, ani liczba z zakresu ${min}..${max}`,
    argOutside: (arg, min, max) => `${arg} jest poza zakresem ${min}..${max}`,
    argNotNumber: (arg) => `${arg} nie jest liczbą`,
    argNotNumberOrWords: (arg, words) => `${arg} nie jest liczbą ani ${words}`,
    argNotWhole: (arg) => `${arg} nie jest liczbą całkowitą`,
    argNotTheme: (arg, themes) => `${arg} nie jest motywem: ${themes}`,
    argNotColour: (arg) => `${arg} nie jest kolorem #rrggbb`,
    argNotColourList: (arg) => `${arg} nie jest listą kolorów #rrggbb`,
    argPaletteTooLong: (arg, cap) => `${arg} ma więcej niż ${cap} kolorów`,
    argUnknown: (arg) => `${arg} to nieznana flaga`,
    argMissing: (flag) => `w komendzie brakuje ${flag}`,
    argUnclosedQuote: (arg) => `niezamknięty cudzysłów: ${arg}`,
    docsNavLabel: 'Strony dokumentacji',
    docsElement: 'Element planszy',
    docsCli: 'Wiersz poleceń',
    fullView: 'Pełny podgląd (klawisz F)',
    pressGenerate: 'Naciśnij „Generuj”.',
    generating: 'Generuję…',
    generatingBig: (W, H, cells) => `Generuję ${W}×${H} (${cells} komórek) — to potrwa…`,
    progress: (pct, pieces, remaining, backtracks, s) =>
      `<b>${pct}%</b> · ${pieces} strz. · zostało ${remaining} · nawroty ${backtracks} · ${s} s`,
    generatingPct: (pct) => `Generuję ${pct}%`,
    progressRest: (pieces, remaining, backtracks, s) =>
      `${pieces} strz. · zostało ${remaining} · nawroty ${backtracks} · ${s} s`,
    runProgress: 'Postęp generowania',
    workerError: 'Błąd workera:',
    generationError: 'Błąd generowania:',
    aborted: 'Przerwano.',
    stopping: 'Zatrzymuję…',
    stopped: 'Zatrzymano — strzałki ułożone do tej chwili',
    closed: 'Plansza pełna: wszystkie komórki wypełnione.',
    solvable: 'Rozwiązywalna.',
    unsolvable: 'NIEROZWIĄZYWALNA — to błąd generatora.',
    notClosedStatus: (remaining, fragments, largest, heads, exits) =>
      `Nie udało się wypełnić planszy: w najlepszym razie ${remaining} komórek zostało pustych, w ${fragments} łatkach (największa ${largest}).${
        heads === null
          ? ''
          : ` Wtedy nowa strzałka mogła jeszcze zacząć się w ${heads} ${
            /^1\d\d$/.test(String(exits)) ? 'ze' : 'z'
          } ${exits} miejsc.`
      } Spróbuj innego ziarna albo większej prostości.`,
    stat_board: 'plansza',
    stat_boardVal: (W, H, cells, seed) => `${W} × ${H} = ${cells} komórek, ziarno ${seed}`,
    stat_pieces: 'strzałki',
    stat_avgLen: 'średnia długość',
    stat_longest: 'najdłuższa',
    stat_longestVal: (n, pct) => `${n} komórek (${pct} planszy)`,
    stat_lengths: 'długości',
    stat_f0: 'wolne na starcie',
    stat_almost: 'pułapki',
    stat_D: 'głębokość',
    stat_corridor: 'droga do krawędzi',
    stat_span: 'średni zasięg',
    stat_spanTop: 'zasięg, górne 10%',
    stat_spanMax: 'zasięg, rekord',
    stat_outDeg: 'blokuje średnio',
    stat_maxOut: 'blokuje, rekord',
    stat_blockDist: 'dystans blokad',
    piecesUnit: 'strz.',
    sidesUnit: 'szerokości + wysokości',
    stat_bends: 'zakręty na strzałkę',
    stat_coil: 'zwinięcie',
    stat_border: 'oplatanie',
    stat_multi: 'zgięte strzałki',
    stat_stall: 'urwane przed celem',
    stat_stallVal: (pStall, pGot) => `${pStall} ułożonych strzałek, osiągając ${pGot} zaplanowanej długości`,
    stat_absorbed: 'doklejone resztki',
    stat_absorbedVal: (n, cells) => `${n} ${plCount(n, 'łatka', 'łatki', 'łatek')} (${cells} ${plCells(cells)})`,
    stat_backtracks: 'nawroty / restarty',
    stat_time: 'czas',
    stat_timeVal: (g, m) => `generowanie ${g} s, statystyki ${m} s`,
    stat_lengthsRange: (min, max) => `${min}–${max} ${plCells(max)}`,
    stat_farBlock: 'blokowane z daleka',
    stat_turnsPerCell: 'zakręty na komórkę',
    stat_ownSides: 'styk ze sobą',
    stat_neighbours: 'sąsiadki długiej strzałki',
    stat_rework: 'przeróbki ogona',
    stat_reworkVal: (done, gaveUp) =>
      `${done} ${plCount(done, 'wykonana', 'wykonane', 'wykonanych')}, ${gaveUp} ${
        plCount(gaveUp, 'porzucona', 'porzucone', 'porzuconych')
      }`,
    stat_stuckBy: 'co je zatrzymało',
    stat_stuckByVal: (own, other, edge) => `ona sama ${own} · inne strzałki ${other} · krawędź ${edge}`,
    stat_stuckLen: 'długość przy utknięciu',
    stat_selfTrap: 'utknięte na sobie',
    stat_shortened: 'skrócone',
    stat_shortenedVal: (share, cells) => `${share} ułożonych strzałek, średnio o ${cells} komórki krótszych`,
    stat_board_help: 'Szerokość × wysokość, liczba komórek i ziarno, które odtwarza tę planszę.',
    stat_pieces_help: 'Ile strzałek ma plansza. Więcej strzałek = dłuższa gra.',
    stat_avgLen_help: 'Średnio komórek na strzałkę. Więcej = mniej, ale dłuższych strzałek.',
    stat_longest_help:
      'Najdłuższa strzałka: w komórkach i jako część planszy. Dłuższa = więcej planszy w jednej strzałce.',
    stat_lengths_help: 'Udział strzałek według długości w komórkach: 2–6, 7–15, 16–49 i 50 lub więcej.',
    stat_f0_help: 'Strzałki, które można zdjąć w pierwszym ruchu. Mniej = trudniej.',
    stat_almost_help:
      'Strzałki zablokowane przez dokładnie jedną inną: wyglądają na prawie wolne, ale nie są. Więcej = więcej kuszących pomyłek.',
    stat_D_help:
      'Najdłuższy łańcuch strzałek czekających jedna na drugą. Nawet zdejmując naraz wszystkie wolne, trzeba głębokość + 1 rund. Więcej = trudniej.',
    stat_corridor_help:
      'Ile komórek średnio strzałka ma do przebycia w kierunku, w którym wskazuje, żeby opuścić planszę. Więcej = dłuższa droga do wyjścia.',
    stat_span_help:
      'Jaką część szerokości lub wysokości planszy obejmuje średnio strzałka (większą z nich). Więcej = strzałki przecinają większą część planszy.',
    stat_spanTop_help:
      'To samo dla 10% strzałek o największym zasięgu. Więcej = strzałki przecinają większą część planszy.',
    stat_spanMax_help: 'Zasięg strzałki, która sięga najdalej. Więcej = strzałki przecinają większą część planszy.',
    stat_outDeg_help: 'Ilu strzałkom średnio każda strzałka stoi na drodze. Więcej = zdjęcie jednej uwalnia więcej.',
    stat_maxOut_help:
      'Najwięcej strzałek, którym stoi na drodze jedna strzałka. Więcej = jedno zdjęcie uwalnia więcej.',
    stat_blockDist_help:
      'Jak daleko średnio grot strzałki jest od grotów strzałek, które blokuje, jako część szerokości + wysokości. Więcej = jeden ruch działa na całą planszę.',
    stat_bends_help: 'Ile razy średnio skręca strzałka. Więcej = bardziej kręte strzałki.',
    stat_coil_help:
      'Udział komórek, w których strzałka dotyka siebie z trzech stron: kłębek zamiast linii. Mniej = czystsze strzałki.',
    stat_border_help:
      'Dla strzałek od 8 komórek: jak duża część strzałki biegnie wzdłuż jednej sąsiadki. Więcej = strzałki się oplatają.',
    stat_multi_help: 'Udział strzałek, które nie są jedną prostą. Więcej = mniej prostych patyczków.',
    stat_stall_help:
      'Jak pracował generator: udział ułożonych strzałek (także cofniętych), które urwały się przed zaplanowaną długością, i jaką część tej długości osiągnęły. Mniej = płynniej.',
    stat_absorbed_help:
      'Jak pracował generator: małe puste łatki doklejone do sąsiednich strzałek. Mniej = czystsza plansza.',
    stat_backtracks_help:
      'Jak pracował generator: ile razy cofał strzałki i ilu nowych prób potrzebował. Mniej = płynniej.',
    stat_time_help: 'Ile trwało generowanie planszy i liczenie statystyk. Mniej = szybciej.',
    stat_farBlock_help:
      'Strzałki, których najbliższa blokada stoi dalej niż 2 komórki przed strzałką: tego, co je trzyma, nie widać od razu. Więcej = więcej blokad do wypatrzenia.',
    stat_turnsPerCell_help:
      'Zakręty na komórkę, na całej planszy: w odróżnieniu od zakrętów na strzałkę długa strzałka waży tyle, ile jej komórki. Więcej = bardziej kręto.',
    stat_ownSides_help:
      'Ile z czterech boków komórki styka się średnio z tą samą strzałką. Więcej = strzałki zawijają się na siebie.',
    stat_neighbours_help:
      'Dla strzałek od 8 komórek: ilu różnych strzałek dotyka każda z nich. Więcej = strzałki są bardziej splecione.',
    stat_rework_help:
      'W ostatniej próbie: ile razy strzałka, która utknęła w ślepym zaułku, przerobiła ogon i rosła dalej, a ile razy się poddała. Tylko przy włączonej przeróbce ogona. Więcej wykonanych = ustawienie działa.',
    stat_stuckBy_help:
      'W ostatniej próbie: co otaczało ogon strzałki, która nie mogła rosnąć dalej (ona sama, inne strzałki czy krawędź), jako udział boków. Wysokie „ona sama” = strzałki zamykają się same.',
    stat_stuckLen_help:
      'W ostatniej próbie: jak długa była średnio strzałka, gdy nie mogła rosnąć dalej. Więcej = strzałki utykają później.',
    stat_selfTrap_help:
      'W ostatniej próbie: zatrzymania, w których własne ciało strzałki zamknęło co najmniej dwa boki ogona. Więcej = strzałki częściej zamykają się same.',
    stat_shortened_help:
      'W ostatniej próbie: udział ułożonych strzałek skróconych, żeby nie zostawiły dziury, której żadna strzałka nie wypełni, i o ile komórek średnio. Mniej = mniej skróceń.',
    stat_gen_help: 'Ile trwało generowanie planszy.',
    longestHead: (n) => `${n} ${plCount(n, 'najdłuższa strzałka', 'najdłuższe strzałki', 'najdłuższych strzałek')}`,
    longestHelp:
      'Zasięg = jaką część boku planszy strzałka obejmuje. Gęstość = jak ciasno wypełnia swój prostokąt. Zwinięcie = udział komórek dotykających własnej ścieżki z trzech stron. Wąż przecinający planszę ma wysoki zasięg i niskie dwa pozostałe; zwój — odwrotnie.',
    th_len: 'długość',
    th_box: 'prostokąt',
    th_span: 'zasięg',
    th_density: 'gęstość',
    th_coil: 'zwinięcie',
    longestName: 'najdłuższe strzałki',
    saved: 'zapisano',
    notSaved: 'nie zapisano (brak serwera magazynu)',
    savedKnownLayout: 'już w bibliotece; dopisano przepis',
    savedKnownRecipe: 'już w bibliotece; zaktualizowano przepis',
    refresh: 'Odśwież',
    boardCommand: 'Komenda tej planszy',
    boardRows: 'Plansze tego rozmiaru',
    boardDetail: 'Otwarta plansza',
    loadIntoLab: 'Wczytaj do laboratorium',
    noStoreServer: 'Brak serwera magazynu: pnpm nx serve lab uruchamia go sam, albo uruchom deno task store.',
    storeEmpty: 'Magazyn jest pusty. Wygeneruj planszę w laboratorium albo przez deno task carve.',
    notClosed: 'niepełna',
    piecesShort: (n) => `${n} strz.`,
    longestShort: (n) => `najdłuższa ${n}`,
    loadingBoard: (id) => `Wczytuję ${id}…`,
    boardFileError: (id, reason) => `Nie da się odczytać planszy ${id}: ${reason}`,
    openedFile: (name, W, H) => `Plik ${name}: ${W}×${H}`,
    boardSize: (W, H) => `${W}×${H}`,
    open_notJson: 'to nie jest JSON',
    open_noBoard: 'żaden z plików nie jest plikiem planszy',
    open_twoBoards: 'dwa pliki planszy naraz; otwórz jeden',
    open_metaOther: 'plik meta należy do innej planszy',
    open_notMeta: 'drugi plik nie jest ani plikiem planszy, ani jej meta',
    boardNotStored: (id) => `Planszy ${id} nie ma w magazynie`,
    savedBoard: (id, seed, source, gen) =>
      `Zapisana plansza ${id}, ziarno ${seed}, źródło: ${source}, generowanie ${gen}.`,
    deleteBoard: 'Usuń z dysku',
    confirmDelete: 'Na pewno usunąć?',
    viewSaved: (id) => `Zapisano nowy widok planszy ${id}.`,
    deletedBoard: (id) => `Usunięto ${id}.`,
    deleteFailed: 'Nie udało się usunąć planszy.',
    boardsRailLabel: 'Rozmiary plansz i podgląd',
    railSizes: 'rozmiary',
    sizeTab: (size, n) => `${size}, plansz: ${n}`,
    boardsCount: (n) => `${n} ${plBoards(n)}`,
    cliThisBoard: 'CLI · ta plansza',
    openBoardHint: 'Otwórz planszę z listy.',
    openFile: 'Otwórz plik…',
    boardFacts: 'O tej planszy',
    factLayout: 'układ',
    factSeed: 'ziarno',
    factSource: 'źródło',
    factGenerated: 'wygenerowano',
    factFile: 'plik',
    factEmpty: 'puste pola',
    fileNoMeta:
      'Otwarta bez pliku meta. Wybierz plik planszy razem z jej meta (plik .json o tej samej nazwie w magazynie), żeby dostać komendę, ziarno i „Wczytaj do laboratorium”.',
    secStoredArrows: 'strzałki · zapisane z planszą',
    stat_genVal: (g) => `generowanie ${g} s`,
    notClosedShort: 'Plansza niepełna.',
    storedReportNote:
      'Zapisana plansza przechowuje tylko te liczby. Wczytaj ją do laboratorium i wygeneruj, żeby zobaczyć pełny raport.',
    inactivePrefix: 'Bez wpływu: ',
    // Safe envelope: settings the engine refuses to generate with.
    violationsTitle: 'Ustawienia poza bezpiecznym zakresem',
    railLabel: 'Grupy parametrów',
    railGenerator: 'generator',
    railElement: 'wygląd',
    ruleBound: (need: number) => `Minimum dla tej planszy: ${need.toLocaleString('pl')}`,
    violationsInGroup: (group: string, count: number) => `${group}, ustawienia poza zakresem: ${count}`,
    rangeViolation: (label, value, min, max) => `${label}: ${value} — dozwolone od ${min} do ${max}`,
    stepViolation: (label, value, below, above) =>
      `${label}: ${value} to niedozwolony krok; najbliższe to ${below} i ${above}`,
    needViolation: (reason, need) => `${reason}; ta plansza wymaga co najmniej ${need}`,
    generateBlocked: 'Popraw ustawienia zaznaczone na czerwono, żeby generować',
    clamped: 'Część wczytanych ustawień przyciągnięto do bezpiecznego zakresu',
    presetsLabel: 'Presety',
    preset: 'preset',
    customSettings: 'własne ustawienia',
    editedSinceLastPreset: 'zmienione od ostatniego presetu',
    reportHandle: 'raport',
    settingsHandle: 'ustawienia',
    dismiss: 'Zamknij',
    modeLabel: 'Widok',
    languageLabel: 'Język',
    langPl: 'PL',
    langEn: 'EN',
    simplePanel: 'Proste ustawienia',
    reportPanel: 'Raport',
    statsTable: 'Statystyki',
    deltaUp: 'wzrost',
    deltaDown: 'spadek',
    reportSummaryCap:
      'wobec poprzedniej planszy: zielone = wzrost, czerwone = spadek; ? przy wierszu mówi, co znaczy zmiana',
    reportHelpAbout: 'te cztery liczby',
    statSumSeconds: (s) => `${s} s`,
    statGroupSize: 'rozmiar',
    statGroupBlocking: 'trudność',
    statGroupReach: 'zasięg',
    statGroupShape: 'kształt',
    statGroupRun: 'generator',
    statGroupDetail: 'generator w szczegółach',
    seriesTitle: 'Ziarna',
    seriesStale: 'dla innych ustawień',
    seriesHead: (total, complete, incomplete, unsolvable, stopped) =>
      `Pełne: ${complete} z ${total} · niepełne ${incomplete} · nierozwiązywalne ${unsolvable} · przerwane ${stopped}`,
    seriesMeanArrows: 'strzałki, średnio',
    seriesMeanLongest: 'najdłuższa, średnio',
    seriesMeanTime: 'czas, średnio',
    seriesMean_help:
      'Średnia tylko z pełnych ziaren: niepełna plansza ciągnęłaby liczby ku planszy, w którą nikt nie gra.',
    seriesFailed: (seed, outcome, left) => `ziarno ${seed} — ${outcome}, zostało pól: ${left}`,
    seriesFailedUnsolvable: (seed) => `ziarno ${seed} — nierozwiązywalna`,
    seriesOutcome_incomplete: 'niepełna',
    seriesOutcome_unsolvable: 'nierozwiązywalna',
    seriesOutcome_stopped: 'przerwana',
    seriesStatus: (done, planned) => `Sprawdzam ziarna: ${done} z ${planned}…`,
    seriesStopping: 'Zatrzymuję ziarna…',
    seriesError: (message) => `Nie udało się sprawdzić ziaren: ${message}`,
    boardAnnotation: (W, H, seed) => `${W}×${H} · ziarno ${seed}`,
    boardModeLabel: 'Tryb planszy',
    boardModeView: 'Widok',
    boardModeInspect: 'Inspekcja',
    boardModePlay: 'Gra',
    inspectHint: 'Wskaż strzałkę, aby ją zbadać.',
    dirUp: 'w górę',
    dirRight: 'w prawo',
    dirDown: 'w dół',
    dirLeft: 'w lewo',
    pieceFacts: (id, length, dir) => `Strzałka #${id} · ${length} ${plCells(length)} · ${dir}`,
    pieceFree: 'wolna',
    pieceBlocked: (id, distance) =>
      distance === 0
        ? `zablokowana przez #${id} tuż przed grotem`
        : `zablokowana przez #${id} w odległości ${distance} ${distance === 1 ? 'komórki' : 'komórek'}`,
    playStatus: (left, mistakes) => `zostało: ${left} · ${mistakes} ${plMistakes(mistakes)}`,
    playCleared: (mistakes) => `Plansza wyczyszczona · ${mistakes} ${plMistakes(mistakes)}`,
    boardReset: 'Resetuj',
    exportsGroup: 'Eksport',
    downloadBoardFile: 'Pobierz plik planszy',
    exportError: 'Eksport nie powiódł się:',
    layoutHashError: 'Nie da się nazwać pliku planszy:',
  },
}

// The CLI owns the four start choices; a dictionary missing one must not compile.
EN.start.options satisfies Record<StartChoice, string>
PL.start.options satisfies Record<StartChoice, string>

// --- one dictionary per language --------------------------------------------

export type Lang = 'en' | 'pl'

export interface Dict {
  readonly lang: Lang
  /** The tag dates and numbers are formatted in: British English, so a date reads day first. */
  readonly locale: 'pl' | 'en-GB'
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
  const locale = lang === 'pl' ? 'pl' : 'en-GB'
  const fmt = (n: number) => n.toLocaleString(locale)
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
    locale,
    d,
    t,
    paramText,
    // A choice is written on the command line as its CLI word
    // (--giantspacing=off); either language may show another word for it, and
    // the command box keeps showing the CLI's.
    choiceText: (key, word) => stringAt((lang === 'pl' ? PL.choices : EN_CHOICES)[key] ?? {}, word) ?? word,
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
