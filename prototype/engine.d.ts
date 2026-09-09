// Build-time declaration of engine.mjs, used through `// @ts-types="./engine.d.ts"`
// until engine.ts exists. Every method of Carver is public: the tests subclass
// the carver and replace absorbPath on the prototype.
import type {
  Board,
  CarverStats,
  Cell,
  GenerateResult,
  InactiveKey,
  Metrics,
  ParamKey,
  Params,
  ParamSpec,
  Piece,
  RuleKey,
  SvgOptions,
  Violation,
} from './types.ts'

export const DIRS: readonly { dx: number; dy: number }[]
export function mulberry32(seed: number): () => number

export class InvalidParamsError extends RangeError {
  readonly violations: readonly Violation[]
  constructor(violations: readonly Violation[])
}

export class Carver implements Board {
  constructor(W: number, H: number, params: Params, rng: () => number)
  W: number
  H: number
  p: Params
  rng: () => number
  owner: Int32Array
  pieces: Piece[]
  remaining: number
  backtracks: number
  stats: CarverStats
  version: number
  touched: Int32Array
  absorbMemo: Map<number, { version: number; pieces: Piece[] }>
  stuckRemaining?: number
  stuckSizes?: number[]
  stuckHeads?: number
  idx(x: number, y: number): number
  inside(x: number, y: number): boolean
  touch(cells: readonly Cell[]): void
  recomputeLines(cells: readonly Cell[]): void
  decomposable(cellSet: ReadonlySet<number>): boolean
  hasLocalDefect(cells: readonly Cell[]): boolean
  wouldStrand(cells: readonly Cell[], failed?: Set<number> | null): boolean
  legalHeadCount(): number
  absorbLeftover(): boolean
  absorbPath(comp: readonly number[], pc: Piece, k: number): Int32Array | null
  leftoverReport(): number[]
  run(maxBacktracks?: number): boolean
}

export const PARAM_SPEC: readonly ParamSpec[]
export const INACTIVE_REASONS: Record<InactiveKey, string>
export const RULES: readonly { key: RuleKey; keys: readonly ParamKey[]; check: (p: Params) => boolean }[]
export const RULE_REASONS: Record<RuleKey, string>
export function defaultParams(): Params
export function validateParams(params: Params): Violation[]
export function formatViolation(v: Violation): string
export function generate(params: Params, opts?: { unchecked?: boolean }): GenerateResult
export function analyse(board: Board, ruleB?: boolean): Metrics
export function render(board: Board): string
export function toSvg(board: Board, opts?: SvgOptions): string
export function fingerprint(board: Board): string
