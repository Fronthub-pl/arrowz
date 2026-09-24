import { assert, assertEquals } from '@std/assert'
import { defaultParams, generate } from './mod.ts'
import { dictionary } from './lab-i18n.ts'
import { genSeconds, reportDelta, type ReportInput, reportRows, type StatRow } from './lab-report.ts'
import type { CarverStats, Metrics } from './types.ts'

function run(W: number, H: number, seed: number) {
  const r = generate({ ...defaultParams(), W, H, seed })
  return {
    ok: r.ok,
    metrics: r.metrics,
    stats: r.board.stats,
    pieces: r.board.pieces.length,
    backtracks: r.backtracks,
    restartsUsed: r.restartsUsed,
    genMs: r.genMs,
    metricsMs: r.metricsMs,
    totalMs: r.genMs + r.metricsMs,
    stuck: r.stuck,
    deadlock: r.deadlock,
  }
}

Deno.test('reportRows returns 23 rows and 4 separators', () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 3 }
  const rows = reportRows(run(20, 20, 3), params, dictionary('en'))
  assertEquals(rows.filter((r) => r.kind === 'row').length, 23)
  assertEquals(rows.filter((r) => r.kind === 'separator').length, 4)
})

// A surface picks rows by what they are (the
// report's summary, its wide values), not by where they stand, so every row
// names itself — once, and after its dictionary key — and a separator names nothing.
Deno.test('every row carries its own key, the suffix of its label key, and no two share one', () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 3 }
  const rows = reportRows(run(20, 20, 3), params, dictionary('en'))
  const keys = rows.filter((r) => r.kind === 'row').map((r) => r.key)
  assertEquals(new Set(keys).size, 23)
  const en = dictionary('en')
  for (const r of rows) {
    if (r.kind === 'separator') assertEquals(r.key, null)
    // Every `stat_<key>` label is a plain string, so any one of them stands
    // for the type of the call.
    else assertEquals(r.label, en.t(`stat_${r.key}` as 'stat_board'))
  }
})

// A hand-built run, not a generated one: `generate()`'s genMs varies between
// runs. The values avoid float-rounding ties (bends 1.5, not 1.45), and the
// expected array was checked by hand against each row's format.
const pinnedMetrics: Metrics = {
  N: 20,
  solvable: true,
  unsolved: 0,
  f0: 0.5,
  T2: 0,
  almost: 4,
  D: 3,
  bends: 1.5,
  multiLine: 0.2,
  coil: 0.1,
  selfAdj: 0,
  bendsPerCell: 0,
  span: 0.4,
  spanTop10: 0.6,
  spanMax: 0.8,
  outDeg: 2.4,
  maxOut: 5,
  blockDist: 0.33,
  neighbours: 0,
  sharedBorder: 0.05,
  longPieces: 0,
  meanCorridorLen: 2.4,
  minLen: 0,
  maxLen: 100,
  hist: { '2-6': 10, '7-15': 6, '16-49': 3, '50+': 1 },
  coverage: 1,
}

const pinnedBase = {
  ok: true,
  metrics: pinnedMetrics,
  pieces: 20,
  backtracks: 7,
  restartsUsed: 2,
  genMs: 3456,
  metricsMs: 123,
  totalMs: 3579,
  stuck: null,
  deadlock: false,
} satisfies Omit<ReportInput, 'stats'>

const pinnedParams = { ...defaultParams(), W: 20, H: 20, seed: 3 }

Deno.test('reportRows pins the exact text of every row for a hand-built run', () => {
  const stats: CarverStats = {
    want: 100,
    got: 90,
    stall: 20,
    strandTrunc: 0,
    strandLoss: 0,
    n: 100,
    absorbs: 3,
    absorbed: 45,
  }
  const rows = reportRows({ ...pinnedBase, stats }, pinnedParams, dictionary('en'))
  const expected: StatRow[] = [
    { kind: 'row', key: 'board', label: 'board', value: '20 × 20 = 400 cells, seed 3', num: undefined, better: 0 },
    { kind: 'row', key: 'pieces', label: 'pieces', value: '20', num: 20, better: 0 },
    { kind: 'row', key: 'avgLen', label: 'average length', value: '20.0', num: 20, better: 0 },
    { kind: 'row', key: 'longest', label: 'longest', value: '100 cells (25% of the board)', num: 100, better: 1 },
    {
      kind: 'row',
      key: 'lengths',
      label: 'length distribution',
      value: '2–6: 50% · 7–15: 30% · 16–49: 15% · 50+: 5.0%',
      num: undefined,
      better: 0,
    },
    { kind: 'separator', key: null, label: '', value: '', num: undefined, better: 0 },
    { kind: 'row', key: 'f0', label: 'f0 (free at start)', value: '0.500', num: 0.5, better: 0 },
    { kind: 'row', key: 'almost', label: 'almost1 (one blocker)', value: '4 (20%)', num: 4, better: 0 },
    { kind: 'row', key: 'D', label: 'D (blocking depth)', value: '3', num: 3, better: 0 },
    { kind: 'row', key: 'corridor', label: 'mean corridor', value: '2.4', num: 2.4, better: 0 },
    { kind: 'separator', key: null, label: '', value: '', num: undefined, better: 0 },
    { kind: 'row', key: 'span', label: 'mean span', value: '40%', num: 40, better: 1 },
    { kind: 'row', key: 'spanTop', label: 'span of top 10%', value: '60%', num: 60, better: 1 },
    { kind: 'row', key: 'spanMax', label: 'span of the record holder', value: '80%', num: 80, better: 1 },
    { kind: 'row', key: 'outDeg', label: 'unblocks on average', value: '2.4 pieces', num: 2.4, better: 1 },
    { kind: 'row', key: 'maxOut', label: 'unblocks record', value: '5 pieces', num: 5, better: 1 },
    {
      kind: 'row',
      key: 'blockDist',
      label: 'unblock distance',
      value: '33% of width + height',
      num: 33,
      better: 1,
    },
    { kind: 'separator', key: null, label: '', value: '', num: undefined, better: 0 },
    { kind: 'row', key: 'bends', label: 'bends per piece', value: '1.50', num: 1.5, better: 1 },
    { kind: 'row', key: 'coil', label: 'coiling', value: '10%', num: 10, better: -1 },
    { kind: 'row', key: 'border', label: 'shared border', value: '5%', num: 5, better: 1 },
    { kind: 'row', key: 'multi', label: 'multi-line', value: '20%', num: 20, better: 1 },
    { kind: 'separator', key: null, label: '', value: '', num: undefined, better: 0 },
    {
      kind: 'row',
      key: 'stall',
      label: 'stalls before target',
      value: '20% of paths, reaching 90% of the ordered length',
      num: 20,
      better: -1,
    },
    { kind: 'row', key: 'absorbed', label: 'absorbed leftovers', value: '3 fragments (45 cells)', num: 3, better: -1 },
    { kind: 'row', key: 'backtracks', label: 'backtracks / restarts', value: '7 / 2', num: 7, better: -1 },
    { kind: 'row', key: 'time', label: 'time', value: 'generation 3.46 s, metrics 0.12 s', num: 3456, better: -1 },
  ]
  assertEquals(rows.length, 27)
  assertEquals(rows, expected)
})

Deno.test("reportRows pins the stall row's dash when stats.n is 0", () => {
  const stats: CarverStats = { want: 0, got: 0, stall: 0, strandTrunc: 0, strandLoss: 0, n: 0, absorbs: 0, absorbed: 0 }
  const rows = reportRows({ ...pinnedBase, stats }, pinnedParams, dictionary('en'))
  const stallRow = rows.find((r) => r.label === 'stalls before target')
  assert(stallRow)
  assertEquals(stallRow, {
    kind: 'row',
    key: 'stall',
    label: 'stalls before target',
    value: '—',
    num: undefined,
    better: -1,
  })
})

Deno.test('every row has a label and a value, and no row is empty', () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 3 }
  for (const row of reportRows(run(20, 20, 3), params, dictionary('en'))) {
    if (row.kind === 'separator') continue
    assert(row.label.length > 0, JSON.stringify(row))
    assert(row.value.length > 0, JSON.stringify(row))
  }
})

Deno.test('the row order is the same in both languages, so a delta keyed by row index survives a switch', () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 3 }
  const r = run(20, 20, 3)
  const en = reportRows(r, params, dictionary('en'))
  const pl = reportRows(r, params, dictionary('pl'))
  assertEquals(en.length, pl.length)
  assertEquals(en.map((x) => x.kind), pl.map((x) => x.kind))
  assertEquals(en.map((x) => x.better), pl.map((x) => x.better))
})

Deno.test('a signed row is always a comparable row, or its arrow can never be drawn', () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 3 }
  for (const row of reportRows(run(20, 20, 3), params, dictionary('en'))) {
    assert(row.better === 1 || row.better === -1 || row.better === 0, `${row.label}: ${row.better}`)
    if (row.better !== 0) assert(row.num !== undefined, `${row.label} is signed but not comparable`)
  }
})

Deno.test('a run with no metrics reports no rows, as the page has always done', () => {
  // The page clears both tables when metrics are null; every row below that
  // point reads metrics.*, so there is nothing to show.
  const params = { ...defaultParams(), W: 20, H: 20, seed: 3 }
  assertEquals(reportRows({ ...run(20, 20, 3), metrics: null }, params, dictionary('en')), [])
})

Deno.test('every comparable row carries the number the delta column subtracts', () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 3 }
  const rows = reportRows(run(20, 20, 3), params, dictionary('en'))
  const comparable = rows.filter((r) => r.kind === 'row' && r.num !== undefined)
  assert(comparable.length >= 10, `only ${comparable.length} rows can be compared`)
  for (const row of comparable) assert(Number.isFinite(row.num))
})

Deno.test('genSeconds shows two decimals under ten seconds and one above, and a dash for no timing', () => {
  assertEquals(genSeconds({ genMs: 4800 } as never, '—'), '4.80')
  assertEquals(genSeconds({ genMs: 16000 } as never, '—'), '16.0')
  assertEquals(genSeconds({ genMs: null } as never, '—'), '—')
})

// The delta column's arithmetic. The numbers are chosen to be exact in binary,
// so no case depends on how `toFixed` rounds a tie.
Deno.test('reportDelta is null when either number is missing or the two are equal', () => {
  assertEquals(reportDelta(undefined, 3, 1), null)
  assertEquals(reportDelta(3, undefined, 1), null)
  assertEquals(reportDelta(3, 3, 1), null)
  // The tolerance: a float that moved by less than 1e-9 did not move.
  assertEquals(reportDelta(3 + 1e-10, 3, 1), null)
})

Deno.test('reportDelta prints a plus or a true minus, at the precision of the size of the change', () => {
  assertEquals(reportDelta(250, 100, 0)?.text, '+150')
  assertEquals(reportDelta(100, 0, 0)?.text, '+100')
  assertEquals(reportDelta(3.5, 1, 0)?.text, '+2.5')
  assertEquals(reportDelta(2, 1, 0)?.text, '+1.0')
  assertEquals(reportDelta(0.75, 0.5, 0)?.text, '+0.25')
  // U+2212, not a hyphen: the glyph a screen reader says "minus" for.
  assertEquals(reportDelta(1, 3.5, 0)?.text, '−2.5')
})

Deno.test('reportDelta says which way is better from the row, not from the sign alone', () => {
  assertEquals(reportDelta(2, 1, 1)?.trend, 'better')
  assertEquals(reportDelta(1, 2, 1)?.trend, 'worse')
  assertEquals(reportDelta(1, 2, -1)?.trend, 'better')
  assertEquals(reportDelta(2, 1, -1)?.trend, 'worse')
  assertEquals(reportDelta(2, 1, 0)?.trend, 'neutral')
  assertEquals(reportDelta(1, 2, 0)?.trend, 'neutral')
})
