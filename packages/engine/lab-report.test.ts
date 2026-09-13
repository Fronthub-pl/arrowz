import { assert, assertEquals } from '@std/assert'
import { defaultParams, generate } from './mod.ts'
import { dictionary } from './lab-i18n.ts'
import { genSeconds, reportRows } from './lab-report.ts'

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

Deno.test('every row has a label and a value, and no row is empty', () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 3 }
  for (const row of reportRows(run(20, 20, 3), params, dictionary('en'))) {
    if (row.kind === 'separator') continue
    assert(row.label.length > 0, JSON.stringify(row))
    assert(row.value.length > 0, JSON.stringify(row))
  }
})

Deno.test('the row order is the same in both languages, so a delta keyed by label survives a switch', () => {
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
  // The page clears both tables when metrics are null (lab-page.ts:1570-1573);
  // every row below that point reads metrics.*, so there is nothing to show.
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
