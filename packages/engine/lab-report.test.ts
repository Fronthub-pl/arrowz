import { assert, assertEquals } from '@std/assert'
import { defaultParams, generate } from './mod.ts'
import { dictionary } from './lab-i18n.ts'
import { genSeconds, reportDelta, type ReportInput, reportRows, type StatKey, type StatRow } from './lab-report.ts'
import type { CarverStats, Metrics } from './types.ts'

// The spec's sentences, verbatim: a changed word is a changed spec.
const HELP_EN: Record<StatKey, string> = {
  board: 'Width × height, the number of cells, and the seed that reproduces this board.',
  pieces: 'How many arrows the board has. More arrows = a longer game.',
  avgLen: 'Cells per arrow, on average.',
  longest: 'The longest arrow, in cells and as a share of the board. Longer = more of the board in one arrow.',
  lengths: 'Share of arrows by length in cells: 2–6, 7–15, 16–49 and 50 or more.',
  f0: 'Arrows you can remove on the very first move. Lower = harder.',
  almost: 'Arrows blocked by exactly one other: they look almost free, but are not. More = more tempting mistakes.',
  D: 'The longest chain of arrows waiting on one another. Even removing every free arrow at once, clearing the board takes depth + 1 rounds. Higher = harder.',
  corridor: 'How many cells, on average, an arrow has to travel in the direction it points to leave the board.',
  span:
    "How much of the board's width or height an arrow stretches across, on average (the larger of the two). Higher = arrows cross more of the board.",
  spanTop: 'The same, for the 10% of arrows that reach furthest. Higher = better.',
  spanMax: 'The reach of the one arrow that reaches furthest. Higher = better.',
  outDeg: 'How many arrows each arrow stands in the way of, on average. Higher = removing one arrow frees more.',
  maxOut: 'The most arrows a single arrow stands in the way of. Higher = one removal frees more.',
  blockDist:
    "How far an arrow's head is from the heads of the arrows it blocks, on average, as a share of width + height. Higher = one move matters across the board.",
  bends: 'How many times an arrow turns, on average. More = more winding arrows.',
  coil:
    'Share of cells where an arrow touches itself on three sides: a clump rather than a line. Lower = cleaner arrows.',
  border:
    'For arrows of 8 cells or more: how much of an arrow runs alongside a single neighbour. Higher = arrows wrap around each other.',
  multi: 'Share of arrows that are not one straight line. More = fewer straight sticks.',
  stall:
    'How the generator worked: the share of the arrows it laid (taken-back ones included) that stopped before the length it planned for them, and how much of the planned length they reached. Lower = smoother.',
  absorbed: 'How the generator worked: small empty patches it glued onto neighbouring arrows. Fewer = a cleaner board.',
  backtracks:
    'How the generator worked: how many times it took arrows back, and how many fresh attempts it needed. Fewer = smoother.',
  time: 'How long the board took to generate and to measure.',
}

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
  const expected: Omit<StatRow, 'help'>[] = [
    { kind: 'row', key: 'board', label: 'board', value: '20 × 20 = 400 cells, seed 3', num: undefined, better: 0 },
    { kind: 'row', key: 'pieces', label: 'arrows', value: '20', num: 20, better: 0 },
    { kind: 'row', key: 'avgLen', label: 'average length', value: '20.0', num: 20, better: 0 },
    { kind: 'row', key: 'longest', label: 'longest', value: '100 cells (25% of the board)', num: 100, better: 1 },
    {
      kind: 'row',
      key: 'lengths',
      label: 'lengths',
      value: '2–6: 50% · 7–15: 30% · 16–49: 15% · 50+: 5.0%',
      num: undefined,
      better: 0,
    },
    { kind: 'separator', key: null, label: '', value: '', num: undefined, better: 0 },
    { kind: 'row', key: 'f0', label: 'free at start', value: '50%', num: 50, better: -1 },
    { kind: 'row', key: 'almost', label: 'traps', value: '4 (20%)', num: 4, better: 1 },
    { kind: 'row', key: 'D', label: 'depth', value: '3', num: 3, better: 1 },
    { kind: 'row', key: 'corridor', label: 'path to edge', value: '2.4', num: 2.4, better: 0 },
    { kind: 'separator', key: null, label: '', value: '', num: undefined, better: 0 },
    { kind: 'row', key: 'span', label: 'average reach', value: '40%', num: 40, better: 1 },
    { kind: 'row', key: 'spanTop', label: 'reach, top 10%', value: '60%', num: 60, better: 1 },
    { kind: 'row', key: 'spanMax', label: 'reach, record', value: '80%', num: 80, better: 1 },
    { kind: 'row', key: 'outDeg', label: 'blocks on average', value: '2.4 arrows', num: 2.4, better: 1 },
    { kind: 'row', key: 'maxOut', label: 'blocks, record', value: '5 arrows', num: 5, better: 1 },
    {
      kind: 'row',
      key: 'blockDist',
      label: 'blocking distance',
      value: '33% of width + height',
      num: 33,
      better: 1,
    },
    { kind: 'separator', key: null, label: '', value: '', num: undefined, better: 0 },
    { kind: 'row', key: 'bends', label: 'bends per arrow', value: '1.50', num: 1.5, better: 1 },
    { kind: 'row', key: 'coil', label: 'coiling', value: '10%', num: 10, better: -1 },
    { kind: 'row', key: 'border', label: 'wrapping', value: '5%', num: 5, better: 1 },
    { kind: 'row', key: 'multi', label: 'bent arrows', value: '20%', num: 20, better: 1 },
    { kind: 'separator', key: null, label: '', value: '', num: undefined, better: 0 },
    {
      kind: 'row',
      key: 'stall',
      label: 'stopped short',
      value: '20% of arrows laid, reaching 90% of the planned length',
      num: 20,
      better: -1,
    },
    { kind: 'row', key: 'absorbed', label: 'merged leftovers', value: '3 patches (45 cells)', num: 3, better: -1 },
    { kind: 'row', key: 'backtracks', label: 'backtracks / restarts', value: '7 / 2', num: 7, better: -1 },
    { kind: 'row', key: 'time', label: 'time', value: 'generation 3.46 s, metrics 0.12 s', num: 3456, better: -1 },
  ]
  assertEquals(rows.length, 27)
  assertEquals(rows, expected.map((row) => ({ ...row, help: row.key === null ? '' : HELP_EN[row.key] })))
})

Deno.test("reportRows pins the stall row's dash when stats.n is 0", () => {
  const stats: CarverStats = { want: 0, got: 0, stall: 0, strandTrunc: 0, strandLoss: 0, n: 0, absorbs: 0, absorbed: 0 }
  const rows = reportRows({ ...pinnedBase, stats }, pinnedParams, dictionary('en'))
  const stallRow = rows.find((r) => r.key === 'stall')
  assert(stallRow)
  assertEquals(stallRow, {
    kind: 'row',
    key: 'stall',
    label: 'stopped short',
    value: '—',
    num: undefined,
    better: -1,
    help: HELP_EN.stall,
  })
})

// Not every coloured row states a direction (`time`'s help has none), so a
// blanket `better !== 0` check would wrongly expect `=` there too. These 8
// coloured rows carry a direction clause, and the `=` every clause uses.
const DIRECTION_KEYS: StatKey[] = ['longest', 'span', 'spanTop', 'spanMax', 'maxOut', 'bends', 'multi', 'backtracks']
Deno.test('every row whose direction matters says which way, marked by =', () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 3 }
  const r = run(20, 20, 3)
  for (const lang of ['en', 'pl'] as const) {
    const rows = reportRows(r, params, dictionary(lang))
    for (const row of rows) {
      if (row.kind === 'separator' || !DIRECTION_KEYS.includes(row.key as StatKey)) continue
      assert(row.better !== 0, `${row.key} is not a coloured row`)
      assert(row.help.includes('='), `${lang} ${row.key} has no direction clause: ${row.help}`)
    }
  }
})

// Each row's own sentence, in Polish: not the English one left behind, and not a neighbour's.
Deno.test('every row explains itself in Polish too, each in its own sentence', () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 3 }
  const r = run(20, 20, 3)
  const en = reportRows(r, params, dictionary('en'))
  const pl = reportRows(r, params, dictionary('pl'))
  for (const [at, row] of pl.entries()) {
    if (row.kind === 'separator') {
      assertEquals(row.help, '')
      continue
    }
    assert(row.help.length > 0, `${row.key} has no Polish help`)
    assert(row.help !== en[at]?.help, `${row.key} is still English`)
  }
  assertEquals(new Set(pl.filter((row) => row.kind === 'row').map((row) => row.help)).size, 23)
})

Deno.test('the Polish values follow the new words', () => {
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
  const rows = reportRows({ ...pinnedBase, stats }, pinnedParams, dictionary('pl'))
  const value = (key: StatKey) => rows.find((row) => row.key === key)?.value
  assertEquals(value('pieces'), '20')
  assertEquals(value('f0'), '50%')
  assertEquals(value('outDeg'), '2.4 strz.')
  assertEquals(value('stall'), '20% ułożonych strzałek, osiągając 90% zaplanowanej długości')
  assertEquals(value('absorbed'), '3 łatki (45 komórek)')
  assertEquals(value('time'), 'generowanie 3.46 s, statystyki 0.12 s')
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
