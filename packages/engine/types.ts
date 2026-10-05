// Shared domain types. Nothing here depends on a runtime
// value: the engine, the CLI, the store and the lab all import from this file,
// so a misspelt key anywhere fails to compile.

/** The knob keys of PARAM_SPEC. Listed once; engine.ts asserts its table has exactly these keys. */
export type ParamKey =
  | 'W'
  | 'H'
  | 'seed'
  | 'wShort'
  | 'wMid'
  | 'Lmax'
  | 'backbite'
  | 'pStraight'
  | 'wLateral'
  | 'warns'
  | 'anticoil'
  | 'headBias'
  | 'mix'
  | 'trapBias'
  | 'probe'
  | 'probeLen'
  | 'giants'
  | 'giantSpan'
  | 'giantStep'
  | 'giantJitter'
  | 'wGiant'
  | 'giantStraight'
  | 'giantAnticoil'
  | 'giantSpacing'
  | 'headTries'
  | 'absorbLimit'
  | 'maxBack'
  | 'restarts'

export type ParamGroup = 'board' | 'lengths' | 'shape' | 'difficulty' | 'skeleton' | 'closing'
export type InactiveKey = 'skeletonOff' | 'probeOff' | 'stepZero' | 'anticoilWins'
export type RuleKey = 'sharesSum' | 'lmaxHole' | 'startPair' | 'straightFloor' | 'giantWander'

export interface TraceInfo {
  pieces: number
  remaining: number
  backtracks: number
  ms: number
  total: number
}

/** What generate() takes beside the knobs: the envelope switch, the hooks, and two test-only fields. */
export interface GenerateOptions {
  unchecked?: boolean
  trace?: (info: TraceInfo) => void
  debug?: (msg: string) => void
  /** Test-only: the share of cells left as voids, in [0, 1). */
  voidFrac?: number
  /** Test-only: rule B of the metrics pass. */
  ruleB?: boolean
}

/** A full engine parameter set: the knobs of PARAM_SPEC and nothing else. */
export type Params = Record<ParamKey, number>

/** How the lab draws a knob: a number with a slider, or a fixed set of choices. */
export type ParamControl = { kind: 'number' } | { kind: 'choice'; choices: readonly { value: number; word: string }[] }

export interface ParamSpec {
  key: ParamKey
  label: string
  group: ParamGroup
  min: number
  max: number
  step: number
  def: number
  help: string
  inactive?: (p: Params) => InactiveKey | null
  /** Two knobs that one surface flag writes (`--start` = headBias + mix); such a knob has no row of its own. */
  surface?: 'start'
  /** How the lab draws the knob; absent is a number with a slider. The words are the ones the CLI takes. */
  control?: ParamControl
}

export type Violation =
  | { kind: 'range'; key: ParamKey; value: unknown; min: number; max: number }
  | { kind: 'step'; key: ParamKey; value: number; step: number; min: number }
  // `need` is the number a rule with a computed bound is asking for — the
  // straightness a board of this size needs. A rule whose bound is a constant
  // says it in its reason and leaves this out.
  | { kind: 'rule'; key: RuleKey; keys: readonly ParamKey[]; need?: number }

export interface Cell {
  x: number
  y: number
}

export interface Piece {
  id: number
  cells: Cell[]
  dir: number
  /** Set by absorbLeftover when a tail is rewritten; read by the absorption memo. */
  tailVersion?: number
}

export interface CarverStats {
  want: number
  got: number
  stall: number
  strandTrunc: number
  strandLoss: number
  n: number
  absorbed?: number
  absorbs?: number
  absorbScanned?: number
  headScans?: number
  headScanHits?: number
  // Stall diagnostics of carveOne: why a piece stopped growing (own body,
  // a foreign piece, the edge), the length it reached and self-traps.
  stallOwn?: number
  stallForeign?: number
  stallEdge?: number
  stallLen?: number
  stallSelfTrap?: number
  /** Tail backbites taken, and the stalls they could not save (the `backbite` knob). */
  backbites?: number
  backbiteGiveUps?: number
}

/**
 * What a drawn and played board is: analyse, render, toSvg, fingerprint, the
 * game and the board element read only these four fields. A board decoded
 * from a file (board-file.ts) has nothing else.
 */
export interface BoardData {
  W: number
  H: number
  /** Piece id per cell; -1 an uncarved cell, -2 a void. */
  owner: Int32Array
  pieces: Piece[]
}

/** What the generator hands back: the board plus its closing report. */
export interface Board extends BoardData {
  stats: CarverStats
  backtracks: number
  remaining: number
}

/**
 * A board as a file (board-file.ts): a JSON envelope a person can read around
 * a packed body that only decodeBoard reads. The counts and the fingerprint
 * are readable without decoding; the decoder checks them against the body.
 */
export interface BoardFile {
  format: 'arrowz-board'
  v: 1
  W: number
  H: number
  pieces: number
  /** Cells with owner -2. */
  voids: number
  /** Cells with owner -1; 0 for a board that closed. */
  unfilled: number
  /** fingerprint() of the board. */
  fingerprint: string
  /** base64 of the packed body. */
  body: string
}

export type HistBucket = '2-6' | '7-15' | '16-49' | '50+'

export interface Metrics {
  N: number
  solvable: boolean
  unsolved: number
  f0: number
  T2: number
  almost: number
  D: number
  bends: number
  multiLine: number
  coil: number
  selfAdj: number
  bendsPerCell: number
  span: number
  spanTop10: number
  spanMax: number
  outDeg: number
  maxOut: number
  blockDist: number
  neighbours: number
  sharedBorder: number
  longPieces: number
  meanCorridorLen: number
  minLen: number
  maxLen: number
  hist: Record<HistBucket, number>
  coverage: number
}

export interface Stuck {
  remaining: number
  sizes: number[]
  heads: number | null
}

export interface GenerateResult {
  board: Board
  metrics: Metrics | null
  ok: boolean
  restartsUsed: number
  backtracks: number
  genMs: number
  metricsMs: number
  stuck: Stuck | null
  /** True when a `trace` callback threw GenerateAbort: the board is what was carved so far, no restart ran. */
  aborted: boolean
  /**
   * True when the board handed back covers every cell but its rays make a
   * cycle, so no order of taps empties it. It describes the last attempt, the
   * way `ok` and `stuck` do: earlier attempts that deadlocked were spent on a
   * restart and left no trace but `restartsUsed`. A deadlocked board has
   * `ok: false` and `stuck: null` — nothing is stuck, the order is missing.
   */
  deadlock: boolean
}

export interface SvgOptions {
  cell?: number
  colored?: boolean
  top?: number
  voids?: boolean
  strokeRatio?: number
  /** Head width in cells; 0 or absent = automatic, from the stroke. */
  headWidth?: number
  /** Head height in cells, taken literally; absent = the default of 1. */
  headHeight?: number
  /** Round corners and a disc tail, or a mitred corner and a square tail; absent = the default of true. */
  rounded?: boolean
  /** The background; absent = `#f6f6fa`. Any CSS colour; escaped into the attribute. */
  paper?: string
  /** Lines and heads; absent = `#232447`. */
  ink?: string
  /** The `top` longest pieces; absent = `#e8467c`. */
  highlight?: string
  /**
   * Piece colours while `colored` is on, one per piece by `assignPalette`, as
   * the board element draws them; absent or empty keeps the golden angle.
   */
  palette?: readonly string[]
  /** The margin in cells; absent = 1. */
  pad?: number
  /** A dot in the centre of every cell, as the element's point grid; absent draws none. */
  points?: { color: string; radius: number }
}

/** The fields of a View that carry a number, and so have a flag that takes one. */
export type ViewNumber = 'cell' | 'stroke' | 'headWidth' | 'headHeight' | 'top'

/** View options of the lab and the CLI (the shape of DEFAULT_VIEW). */
export interface View {
  cell: number
  stroke: number
  headWidth: number
  headHeight: number
  colored: boolean
  top: number
  rounded: boolean
  /** A name from `THEMES`; '' is none. */
  theme: string
  /** Arrow colours while `colored` is on; empty lets the theme's palette show. */
  palette: string[]
  /** '' is "not stated": the theme, or the default, decides. */
  paper: string
  ink: string
  highlight: string
  /** Margin in whole cells. */
  pad: number
  showPoints: boolean
  pointColor: string
  /** In cells. */
  pointRadius: number
}

export type Range = { lo: number; hi: number; def: number } | { pick: readonly number[]; def: number }

export interface SimpleChoice {
  W: number
  H: number
  lengths: number
  shape: number
  skeleton: 'off' | 'on'
  seed: number
  random?: boolean
}

export type PresetMode = 'square' | 'portrait' | 'tunnels' | 'skeleton' | 'serpentine'

export interface Preset {
  id: string
  mode: PresetMode
  params: Partial<Record<ParamKey, number>>
}

export interface PresetLevel {
  id: string
  options: Preset[]
}

/**
 * One way of producing a stored layout: a seed and parameters, and the run that
 * used them. Its command reproduces the layout unless the run was aborted.
 */
export interface Recipe {
  /** boardId(params): unique within its layout; a save with the same parameters replaces it. */
  id: string
  params: Params
  view: View
  command: string
  source: string
  createdAt: string
  updatedAt: string
  genMs: number | null
  restarts: number | null
  backtracks: number | null
  aborted: boolean
}

/**
 * One stored layout: the meta JSON next to the board file in
 * packages/cli/boards/<WxH>/. The recipe fields at the top level (seed, params,
 * view, command, source, genMs, restarts, backtracks, aborted) copy the recipe
 * the latest save wrote; `sources` lists them all.
 */
export interface BoardMeta {
  /** layoutHash() of the stored board: `sha256-<64 hex>`. */
  id: string
  W: number
  H: number
  seed: number
  params: Params
  view: View
  command: string
  /**
   * A second command carried by boards stored under an older CLI dialect.
   * Read only: nothing writes it, and `command` is the one command.
   */
  simpleCommand?: string
  source: string
  createdAt: string
  updatedAt: string
  ok: boolean | null
  pieces: number | null
  maxLen: number | null
  genMs: number | null
  /** fingerprint() of the stored board file, which the save that created the layout wrote. */
  fingerprint: string | null
  /** Size of <id>.board.json in bytes. */
  boardBytes: number | null
  /** Whether an SVG preview (<id>.svg) sits next to the board file. */
  svg: boolean
  // The closing report, when the writer had one: restarts and backtracks
  // used, whether a time budget cut the run short, the leftover of a jam.
  restarts: number | null
  backtracks: number | null
  aborted: boolean
  stuck: Stuck | null
  /** Every recipe that produced this layout, in the order they were first saved. */
  sources: Recipe[]
}

/**
 * The body of a board-store write. Mutable and nullable on purpose:
 * `store-server.ts`'s checkMetrics builds one field by field, and a `BoardMeta`
 * read back out of the store carries `null` where a run had no figure (see
 * `ok`, `pieces`, `maxLen` and `genMs` above). Making these readonly or
 * non-nullable breaks both callers.
 */
export interface StoreRequest {
  board: BoardFile
  params: Params
  view: View
  command: string
  source: string
  metrics?: {
    ok?: boolean | null
    pieces?: number | null
    maxLen?: number | null
    genMs?: number | null
    restarts?: number | null
    backtracks?: number | null
    stuck?: Stuck | null
    /** Absent keeps the stored flag (a view edit); a fresh run states it. */
    aborted?: boolean
  }
}

export interface BoardSize {
  size: string
  W: number
  H: number
  cells: number
  boards: BoardMeta[]
}

export interface LongestSummary {
  len: number
  sx: number
  sy: number
  span: number
  density: number
  coil: number
}

/** How one seed of a series ended: `unsolvable` is a full board no order of taps empties. */
export type SeedOutcome = 'complete' | 'incomplete' | 'unsolvable' | 'stopped'

/** One seed of a series as the worker answers it: numbers only, no board. */
export interface SeedRun {
  seed: number
  outcome: SeedOutcome
  pieces: number
  maxLen: number | null
  genMs: number
  /** Empty cells left; 0 on a full board. */
  remaining: number
}

export type WorkerIn =
  /** `stop` is a one-element view over a SharedArrayBuffer: 1 asks the run to stop and hand back its board. */
  | { type: 'generate'; params: Params; stop?: Int32Array }
  /** The SVG export: drawn off the page's thread, from the board file the page holds. */
  | { type: 'svg'; board: BoardFile; options: SvgOptions }
  /** One seed of a series: answered by `seedDone`, never by `progress`. */
  | { type: 'seed'; params: Params; stop?: Int32Array }

export type WorkerOut =
  | { type: 'progress'; info: TraceInfo }
  | { type: 'error'; message: string }
  | { type: 'svg'; svg: string }
  | {
    type: 'done'
    ok: boolean
    metrics: Metrics | null
    backtracks: number
    restartsUsed: number
    genMs: number
    metricsMs: number
    totalMs: number
    stuck: Stuck | null
    deadlock: boolean
    /** The run was stopped (`GenerateAbort`): the board is the one laid so far. */
    aborted: boolean
    pieces: number
    stats: CarverStats
    /** The board as its file: one string across the worker boundary, and the file the store keeps. */
    board: BoardFile
  }
  | { type: 'seedDone'; run: SeedRun }
