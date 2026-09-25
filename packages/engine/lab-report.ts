// The report of a run: metrics, carver statistics and timings as rows a
// surface can render without knowing what any of them mean. Pure: it takes
// the run, the knobs and a dictionary, and returns strings.
import type { Dict } from './lab-i18n.ts'
import type { BoardMeta, CarverStats, Metrics, Params, Stuck } from './types.ts'

/**
 * How long a stored board took to generate, or the dash the surface uses when
 * it was saved before the timing existed. Two decimals under ten seconds, one
 * above: on a fast board the second decimal is the difference between runs.
 */
export function genSeconds(meta: BoardMeta, dash: string): string {
  return meta.genMs === null ? dash : (meta.genMs / 1000).toFixed(meta.genMs < 10000 ? 2 : 1)
}

/** A fraction as whole percent, shared by the stats table and the longest-pieces table. */
export function pct(v: number): string {
  return (100 * v).toFixed(0) + '%'
}

/** One line of the stats table: label, shown value, the number compared with the previous run, and whether an increase is an improvement. */
/**
 * What a row is, whatever language it is in: the suffix of its label's
 * dictionary key (`stat_<key>`). A surface picks rows by it — the lab's
 * summary and its wide values — rather than by where they stand.
 */
export type StatKey =
  | 'board'
  | 'pieces'
  | 'avgLen'
  | 'longest'
  | 'lengths'
  | 'f0'
  | 'almost'
  | 'D'
  | 'corridor'
  | 'span'
  | 'spanTop'
  | 'spanMax'
  | 'outDeg'
  | 'maxOut'
  | 'blockDist'
  | 'bends'
  | 'coil'
  | 'border'
  | 'multi'
  | 'stall'
  | 'absorbed'
  | 'backtracks'
  | 'time'

export interface StatRow {
  readonly kind: 'row' | 'separator'
  /** The row's own name; null on a separator, which is no row. */
  readonly key: StatKey | null
  readonly label: string
  readonly value: string
  /** One or two sentences on what the row measures and, where there is one, which way is harder; '' on a separator. */
  readonly help: string
  /**
   * The number the surface compares with the previous run, or undefined for a
   * row that is not comparable. Dropping this field would make the delta
   * column impossible.
   */
  readonly num: number | undefined
  /** +1 when a larger number is better, -1 when smaller is, 0 when neither. */
  readonly better: number
}

/** How one row moved against the baseline: the text of the delta cell and which way is better. */
export interface ReportDelta {
  /** The change with its sign — `+` or `−` (U+2212) — at the precision of the size of the change. */
  readonly text: string
  readonly trend: 'better' | 'worse' | 'neutral'
}

/**
 * The delta column: `num` against `prev`, the same row of the baseline. Null
 * when either is missing or the two differ by no more than 1e-9, where a
 * surface prints an empty cell. `better` is the row's own field: +1 when a
 * larger number is better, -1 when a smaller one is, 0 when neither — coiling
 * should fall, span should rise, the arrow count is neutral.
 */
export function reportDelta(num: number | undefined, prev: number | undefined, better: number): ReportDelta | null {
  if (num === undefined || prev === undefined || Math.abs(num - prev) <= 1e-9) return null
  const diff = num - prev
  const abs = Math.abs(diff)
  const shown = abs >= 100 ? abs.toFixed(0) : abs >= 1 ? abs.toFixed(1) : abs.toFixed(2)
  const trend = better === 0 ? 'neutral' : (diff > 0) === (better > 0) ? 'better' : 'worse'
  return { text: `${diff > 0 ? '+' : '−'}${shown}`, trend }
}

/** The run the report describes: what the worker reports back when a board is done. */
export interface ReportInput {
  readonly ok: boolean
  readonly metrics: Metrics | null
  readonly stats: CarverStats
  readonly pieces: number
  readonly backtracks: number
  readonly restartsUsed: number
  readonly genMs: number
  readonly metricsMs: number
  readonly totalMs: number
  readonly stuck: Stuck | null
  readonly deadlock: boolean
}

/** A row whose value may arrive as a number: the surface renders text either way. */
const stat = (dict: Dict, key: StatKey, label: string, value: string | number, num?: number, better = 0): StatRow => ({
  kind: 'row',
  key,
  label,
  value: String(value),
  help: dict.t(`stat_${key}_help` as const),
  num,
  better,
})
// The gap between groups of rows. `kind` is what tells it apart, so it needs
// neither a label nor a value.
const SEP: StatRow = { kind: 'separator', key: null, label: '', value: '', help: '', num: undefined, better: 0 }

/**
 * Every line of the statistics table, in order, for a finished run. A run
 * without metrics reports nothing: the surface clears the table, and every row
 * below the first group reads the metrics.
 *
 * The third field of a row is the number compared with the previous run, the
 * fourth says whether an increase is an improvement (the delta colour).
 */
export function reportRows(run: ReportInput, params: Params, dict: Dict): StatRow[] {
  const { metrics, stats, genMs, metricsMs, backtracks, restartsUsed } = run
  if (!metrics) return []
  const cells = params.W * params.H
  return [
    stat(
      dict,
      'board',
      dict.t('stat_board'),
      dict.t('stat_boardVal', params.W, params.H, dict.fmt(cells), params.seed),
    ),
    stat(dict, 'pieces', dict.t('stat_pieces'), dict.fmt(metrics.N), metrics.N, 0),
    stat(dict, 'avgLen', dict.t('stat_avgLen'), (cells / metrics.N).toFixed(1), cells / metrics.N, 0),
    stat(
      dict,
      'longest',
      dict.t('stat_longest'),
      dict.t('stat_longestVal', metrics.maxLen, pct(metrics.maxLen / cells)),
      metrics.maxLen,
      1,
    ),
    stat(
      dict,
      'lengths',
      dict.t('stat_lengths'),
      `2–6: ${pct(metrics.hist['2-6'] / metrics.N)} · 7–15: ${pct(metrics.hist['7-15'] / metrics.N)} · 16–49: ${
        pct(metrics.hist['16-49'] / metrics.N)
      } · 50+: ${(100 * metrics.hist['50+'] / metrics.N).toFixed(1)}%`,
    ),
    SEP,
    stat(dict, 'f0', dict.t('stat_f0'), pct(metrics.f0), 100 * metrics.f0, -1),
    stat(
      dict,
      'almost',
      dict.t('stat_almost'),
      `${metrics.almost} (${pct(metrics.almost / metrics.N)})`,
      metrics.almost,
      1,
    ),
    stat(dict, 'D', dict.t('stat_D'), metrics.D, metrics.D, 1),
    stat(dict, 'corridor', dict.t('stat_corridor'), metrics.meanCorridorLen.toFixed(1), metrics.meanCorridorLen, 0),
    SEP,
    stat(dict, 'span', dict.t('stat_span'), pct(metrics.span), 100 * metrics.span, 1),
    stat(dict, 'spanTop', dict.t('stat_spanTop'), pct(metrics.spanTop10), 100 * metrics.spanTop10, 1),
    stat(dict, 'spanMax', dict.t('stat_spanMax'), pct(metrics.spanMax), 100 * metrics.spanMax, 1),
    stat(
      dict,
      'outDeg',
      dict.t('stat_outDeg'),
      `${metrics.outDeg.toFixed(1)} ${dict.t('piecesUnit')}`,
      metrics.outDeg,
      1,
    ),
    stat(dict, 'maxOut', dict.t('stat_maxOut'), `${metrics.maxOut} ${dict.t('piecesUnit')}`, metrics.maxOut, 1),
    stat(
      dict,
      'blockDist',
      dict.t('stat_blockDist'),
      `${pct(metrics.blockDist)} ${dict.t('sidesUnit')}`,
      100 * metrics.blockDist,
      1,
    ),
    SEP,
    stat(dict, 'bends', dict.t('stat_bends'), metrics.bends.toFixed(2), metrics.bends, 1),
    stat(dict, 'coil', dict.t('stat_coil'), pct(metrics.coil), 100 * metrics.coil, -1),
    stat(dict, 'border', dict.t('stat_border'), pct(metrics.sharedBorder), 100 * metrics.sharedBorder, 1),
    stat(dict, 'multi', dict.t('stat_multi'), pct(metrics.multiLine), 100 * metrics.multiLine, 1),
    SEP,
    // Stalling explains short lines better than the length distribution: a
    // path dies in a frontier pocket long before the ordered length.
    stat(
      dict,
      'stall',
      dict.t('stat_stall'),
      stats.n ? dict.t('stat_stallVal', pct(stats.stall / stats.n), pct(stats.got / stats.want)) : '—',
      stats.n ? 100 * stats.stall / stats.n : undefined,
      -1,
    ),
    stat(
      dict,
      'absorbed',
      dict.t('stat_absorbed'),
      dict.t('stat_absorbedVal', stats.absorbs ?? 0, stats.absorbed ?? 0),
      stats.absorbs ?? 0,
      -1,
    ),
    stat(dict, 'backtracks', dict.t('stat_backtracks'), `${backtracks} / ${restartsUsed}`, backtracks, -1),
    stat(
      dict,
      'time',
      dict.t('stat_time'),
      dict.t('stat_timeVal', (genMs / 1000).toFixed(2), (metricsMs / 1000).toFixed(2)),
      genMs,
      -1,
    ),
  ]
}
