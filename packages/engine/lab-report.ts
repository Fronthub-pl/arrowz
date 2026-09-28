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
  | 'farBlock'
  | 'turnsPerCell'
  | 'ownSides'
  | 'neighbours'
  | 'rework'
  | 'stuckBy'
  | 'stuckLen'
  | 'selfTrap'
  | 'shortened'

/** One line of the stats table: its key, label, shown value, help, and the number compared with the previous run. */
export interface StatRow {
  readonly kind: 'row' | 'separator'
  /** The row's own name; null on a separator, which is no row. */
  readonly key: StatKey | null
  readonly label: string
  readonly value: string
  /** What the row measures and what a rise means, ending in an `=` clause; '' on a separator. */
  readonly help: string
  /**
   * The number the surface compares with the previous run, or undefined for a
   * row that is not comparable. Dropping this field would make the delta
   * column impossible.
   */
  readonly num: number | undefined
}

/** How one row moved against the baseline: the text of the delta cell and its direction. */
export interface ReportDelta {
  /** The change with its sign — `+` or `−` (U+2212) — at the precision of the size of the change. */
  readonly text: string
  /** Up or down, whatever the row: what a rise means is the row's help, not its colour. */
  readonly trend: 'up' | 'down'
}

/**
 * The delta column: `num` against `prev`, the same row of the baseline. Null
 * when either is missing or the two differ by no more than 1e-9, where a
 * surface prints an empty cell.
 */
export function reportDelta(num: number | undefined, prev: number | undefined): ReportDelta | null {
  if (num === undefined || prev === undefined || Math.abs(num - prev) <= 1e-9) return null
  const diff = num - prev
  const abs = Math.abs(diff)
  const shown = abs >= 100 ? abs.toFixed(0) : abs >= 1 ? abs.toFixed(1) : abs.toFixed(2)
  return { text: `${diff > 0 ? '+' : '−'}${shown}`, trend: diff > 0 ? 'up' : 'down' }
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
const stat = (dict: Dict, key: StatKey, label: string, value: string | number, num?: number): StatRow => ({
  kind: 'row',
  key,
  label,
  value: String(value),
  help: dict.t(`stat_${key}_help` as const),
  num,
})
// The gap between groups of rows. `kind` is what tells it apart, so it needs
// neither a label nor a value.
const SEP: StatRow = { kind: 'separator', key: null, label: '', value: '', help: '', num: undefined }

/**
 * Every line of the statistics table, in order, for a finished run. A run
 * without metrics reports nothing: the surface clears the table, and every row
 * below the first group reads the metrics.
 *
 * The fifth argument of a row is the number compared with the previous run.
 */
export function reportRows(run: ReportInput, params: Params, dict: Dict): StatRow[] {
  const { metrics, stats, genMs, metricsMs, backtracks, restartsUsed } = run
  if (!metrics) return []
  const cells = params.W * params.H
  // Each stall adds its tail's four sides to own + foreign + edge, so the sum
  // over four is the number of stalls; `stats.stall` counts short arrows instead.
  const sides = (stats.stallOwn ?? 0) + (stats.stallForeign ?? 0) + (stats.stallEdge ?? 0)
  const events = sides / 4
  const selfTrap = stats.stallSelfTrap ?? 0
  return [
    stat(
      dict,
      'board',
      dict.t('stat_board'),
      dict.t('stat_boardVal', params.W, params.H, dict.fmt(cells), params.seed),
    ),
    stat(dict, 'pieces', dict.t('stat_pieces'), dict.fmt(metrics.N), metrics.N),
    stat(dict, 'avgLen', dict.t('stat_avgLen'), (cells / metrics.N).toFixed(1), cells / metrics.N),
    stat(
      dict,
      'longest',
      dict.t('stat_longest'),
      dict.t('stat_longestVal', metrics.maxLen, pct(metrics.maxLen / cells)),
      metrics.maxLen,
    ),
    stat(
      dict,
      'lengths',
      dict.t('stat_lengths'),
      `${dict.t('stat_lengthsRange', metrics.minLen, metrics.maxLen)} · 2–6: ${
        pct(metrics.hist['2-6'] / metrics.N)
      } · 7–15: ${pct(metrics.hist['7-15'] / metrics.N)} · 16–49: ${pct(metrics.hist['16-49'] / metrics.N)} · 50+: ${
        (100 * metrics.hist['50+'] / metrics.N).toFixed(1)
      }%`,
    ),
    SEP,
    stat(dict, 'f0', dict.t('stat_f0'), pct(metrics.f0), 100 * metrics.f0),
    stat(
      dict,
      'almost',
      dict.t('stat_almost'),
      `${metrics.almost} (${pct(metrics.almost / metrics.N)})`,
      metrics.almost,
    ),
    stat(dict, 'farBlock', dict.t('stat_farBlock'), `${metrics.T2} (${pct(metrics.T2 / metrics.N)})`, metrics.T2),
    stat(dict, 'D', dict.t('stat_D'), metrics.D, metrics.D),
    stat(dict, 'corridor', dict.t('stat_corridor'), metrics.meanCorridorLen.toFixed(1), metrics.meanCorridorLen),
    SEP,
    stat(dict, 'span', dict.t('stat_span'), pct(metrics.span), 100 * metrics.span),
    stat(dict, 'spanTop', dict.t('stat_spanTop'), pct(metrics.spanTop10), 100 * metrics.spanTop10),
    stat(dict, 'spanMax', dict.t('stat_spanMax'), pct(metrics.spanMax), 100 * metrics.spanMax),
    stat(
      dict,
      'outDeg',
      dict.t('stat_outDeg'),
      `${metrics.outDeg.toFixed(1)} ${dict.t('piecesUnit')}`,
      metrics.outDeg,
    ),
    stat(dict, 'maxOut', dict.t('stat_maxOut'), `${metrics.maxOut} ${dict.t('piecesUnit')}`, metrics.maxOut),
    stat(
      dict,
      'blockDist',
      dict.t('stat_blockDist'),
      `${pct(metrics.blockDist)} ${dict.t('sidesUnit')}`,
      100 * metrics.blockDist,
    ),
    SEP,
    stat(dict, 'bends', dict.t('stat_bends'), metrics.bends.toFixed(2), metrics.bends),
    stat(dict, 'turnsPerCell', dict.t('stat_turnsPerCell'), metrics.bendsPerCell.toFixed(3), metrics.bendsPerCell),
    stat(dict, 'coil', dict.t('stat_coil'), pct(metrics.coil), 100 * metrics.coil),
    stat(dict, 'ownSides', dict.t('stat_ownSides'), metrics.selfAdj.toFixed(2), metrics.selfAdj),
    stat(dict, 'border', dict.t('stat_border'), pct(metrics.sharedBorder), 100 * metrics.sharedBorder),
    stat(dict, 'neighbours', dict.t('stat_neighbours'), metrics.neighbours.toFixed(1), metrics.neighbours),
    stat(dict, 'multi', dict.t('stat_multi'), pct(metrics.multiLine), 100 * metrics.multiLine),
    SEP,
    // Stalling explains short lines better than the length distribution: a
    // path dies in a frontier pocket long before the ordered length.
    stat(
      dict,
      'stall',
      dict.t('stat_stall'),
      stats.n ? dict.t('stat_stallVal', pct(stats.stall / stats.n), pct(stats.got / stats.want)) : '—',
      stats.n ? 100 * stats.stall / stats.n : undefined,
    ),
    stat(
      dict,
      'absorbed',
      dict.t('stat_absorbed'),
      dict.t('stat_absorbedVal', stats.absorbs ?? 0, stats.absorbed ?? 0),
      stats.absorbs ?? 0,
    ),
    stat(dict, 'backtracks', dict.t('stat_backtracks'), `${backtracks} / ${restartsUsed}`, backtracks),
    stat(
      dict,
      'time',
      dict.t('stat_time'),
      dict.t('stat_timeVal', (genMs / 1000).toFixed(2), (metricsMs / 1000).toFixed(2)),
      genMs,
    ),
    SEP,
    // The knob's own switch, not the counters: with it on, a run that never
    // stalled leaves both counters unset and still reworked nothing.
    params.backbite === 0 ? stat(dict, 'rework', dict.t('stat_rework'), '—') : stat(
      dict,
      'rework',
      dict.t('stat_rework'),
      dict.t('stat_reworkVal', stats.backbites ?? 0, stats.backbiteGiveUps ?? 0),
      stats.backbites ?? 0,
    ),
    stat(
      dict,
      'stuckBy',
      dict.t('stat_stuckBy'),
      sides
        ? dict.t(
          'stat_stuckByVal',
          pct((stats.stallOwn ?? 0) / sides),
          pct((stats.stallForeign ?? 0) / sides),
          pct((stats.stallEdge ?? 0) / sides),
        )
        : '—',
    ),
    stat(
      dict,
      'stuckLen',
      dict.t('stat_stuckLen'),
      events ? ((stats.stallLen ?? 0) / events).toFixed(1) : '—',
      events ? (stats.stallLen ?? 0) / events : undefined,
    ),
    stat(
      dict,
      'selfTrap',
      dict.t('stat_selfTrap'),
      events ? `${selfTrap} (${pct(selfTrap / events)})` : '—',
      events ? selfTrap : undefined,
    ),
    stat(
      dict,
      'shortened',
      dict.t('stat_shortened'),
      stats.n
        ? dict.t(
          'stat_shortenedVal',
          pct(stats.strandTrunc / stats.n),
          (stats.strandLoss / Math.max(1, stats.strandTrunc)).toFixed(1),
        )
        : '—',
      stats.n ? 100 * stats.strandTrunc / stats.n : undefined,
    ),
  ]
}
