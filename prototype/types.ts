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
  | 'hug'
  | 'edgeHug'
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
  | 'giantWarns'
  | 'giantAnticoil'
  | 'giantSpacing'
  | 'giantSpacePenalty'
  | 'headTries'
  | 'strandLimit'
  | 'absorbLimit'
  | 'maxBack'
  | 'restarts'

export type ParamGroup = 'board' | 'lengths' | 'shape' | 'difficulty' | 'skeleton' | 'closing'
export type InactiveKey = 'skeletonOff' | 'hugOff' | 'mixOn' | 'probeOff' | 'stepZero' | 'spanZero'
export type RuleKey = 'sharesSum' | 'lmaxHole' | 'mixHole'

export interface TraceInfo {
  pieces: number
  remaining: number
  backtracks: number
  ms: number
  total: number
}

/** A full engine parameter set: every knob, the two engine-only fields, and the optional hooks. */
export type Params = Record<ParamKey, number> & {
  ruleB: boolean
  voidFrac: number
  trace?: (info: TraceInfo) => void
  debug?: (msg: string) => void
}

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
}

export type Violation =
  | { kind: 'range'; key: ParamKey; value: unknown; min: number; max: number }
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
}

/** The public surface of a carved board that analyse, render, toSvg and fingerprint read. */
export interface Board {
  W: number
  H: number
  owner: Int32Array
  pieces: Piece[]
  stats: CarverStats
  backtracks: number
  remaining: number
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
}

export interface SvgOptions {
  cell?: number
  colored?: boolean
  top?: number
  voids?: boolean
  strokeRatio?: number
  headWidth?: number
  headHeight?: number
}

/** View options of the lab and the CLI (the shape of DEFAULT_VIEW). */
export interface View {
  cell: number
  stroke: number
  headWidth: number
  headHeight: number
  colored: boolean
  top: number
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

/** One stored board: the JSON next to the SVG in prototype/boards/<WxH>/. */
export interface BoardMeta {
  id: string
  W: number
  H: number
  seed: number
  params: Params
  view: View
  command: string
  simpleCommand?: string
  source: string
  createdAt: string
  updatedAt: string
  ok: boolean | null
  pieces: number | null
  maxLen: number | null
  genMs: number | null
  svgBytes: number
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
  | { type: 'generate'; params: Params; view: View; voids?: boolean; tag?: string }
  | { type: 'render'; view: View; voids?: boolean; tag?: string }

export type WorkerOut =
  | { type: 'progress'; info: TraceInfo }
  | { type: 'error'; message: string }
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
  }
  | { type: 'render'; svg: string; longest: LongestSummary[]; tag?: string }
