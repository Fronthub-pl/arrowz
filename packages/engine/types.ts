// Shared domain types of the prototype. Nothing here depends on a runtime
// value: the engine, the CLI, the store, the lab page and the worker all
// import from this file, so a misspelt key anywhere fails to compile.

/** The knob keys of PARAM_SPEC. Listed once; engine.ts asserts its table has exactly these keys. */
export type ParamKey =
  | 'W'
  | 'H'
  | 'seed'
  | 'wShort'
  | 'wMid'
  | 'Lmax'
  | 'pStraight'
  | 'wLateral'
  | 'warns'
  | 'anticoil'
  | 'headBias'
  | 'mix'
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
export type InactiveKey = 'skeletonOff' | 'probeOff' | 'stepZero'
export type RuleKey = 'sharesSum' | 'lmaxHole' | 'startPair'

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
  | { kind: 'rule'; key: RuleKey; keys: readonly ParamKey[] }

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

/** One stored board: the meta JSON next to the board file in packages/cli/boards/<WxH>/. */
export interface BoardMeta {
  id: string
  W: number
  H: number
  seed: number
  params: Params
  view: View
  command: string
  /**
   * The second command a board stored before the CLI had one dialect carries.
   * Read only: nothing writes it any more, and `command` is the one command.
   */
  simpleCommand?: string
  source: string
  createdAt: string
  updatedAt: string
  ok: boolean | null
  pieces: number | null
  maxLen: number | null
  genMs: number | null
  /** fingerprint() of the stored board; null for a meta written before board files. */
  fingerprint: string | null
  /** Size of <id>.board.json in bytes; null for a meta written before board files. */
  boardBytes: number | null
  /** Whether an SVG preview (<id>.svg) sits next to the board file. */
  svg: boolean
  // The closing report, when the writer had one: restarts and backtracks
  // used, whether a time budget cut the run short, the leftover of a jam.
  restarts: number | null
  backtracks: number | null
  aborted: boolean
  stuck: Stuck | null
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

export type WorkerIn =
  | { type: 'generate'; params: Params }
  /** The SVG export: drawn off the page's thread, from the board file the page holds. */
  | { type: 'svg'; board: BoardFile; options: SvgOptions }

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
    pieces: number
    stats: CarverStats
    /** The board as its file: one string across the worker boundary, and the file the store keeps. */
    board: BoardFile
  }
