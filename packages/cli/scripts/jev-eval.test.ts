import { assertAlmostEquals, assertEquals } from '@std/assert'
import { auc, badMessages, mutations, pickThreshold, rates, type Scored, stripDiacritics } from './jev-eval.ts'

const s = (p: number, positive: boolean): Scored => ({ p, positive })

Deno.test('auc: 1 when every positive outranks every negative, 0.5 for ties', () => {
  assertEquals(auc([s(0.9, true), s(0.8, true), s(0.1, false)]), 1)
  assertEquals(auc([s(0.5, true), s(0.5, false)]), 0.5)
  assertAlmostEquals(auc([s(0.9, true), s(0.2, true), s(0.5, false)]), 0.5)
})

Deno.test('rates: strictly above the threshold is flagged', () => {
  const r = rates([s(0.9, true), s(0.6, true), s(0.7, false), s(0.1, false)], 0.6)
  assertEquals(r, { precision: 0.5, recall: 0.5, falseAlarm: 0.5, flagged: 2 })
})

Deno.test('pickThreshold: the lowest 0.01 step from 0.5 that keeps false alarms at the bar', () => {
  const items = [s(0.95, false), s(0.62, false), ...Array.from({ length: 98 }, () => s(0.1, false))]
  assertEquals(pickThreshold(items, 0.01), 0.62)
  assertEquals(pickThreshold([s(0.999, false)], 0), null)
})

Deno.test('stripDiacritics: Polish letters lose their marks, the stroked l included', () => {
  assertEquals(stripDiacritics('a\u0142b \u00f3c\u017a \u0141\u0105'), 'alb ocz La')
})

Deno.test('badMessages: fifteen, from strings the threshold was not picked on, no diacritics left', () => {
  const polish = Array.from({ length: 40 }, (_, i) => `w${i} aa bb cc d\u0105 e\u0142`)
  const bad = badMessages(polish)
  assertEquals(bad.length, 15)
  assertEquals(bad.some((b) => b.includes('w0 ')), false)
  assertEquals(bad.some((b) => /[\u0105\u0107\u0119\u0142\u0144\u00f3\u015b\u017a\u017c]/.test(b)), false)
})

Deno.test('mutations: every mutated pair changes the Polish and names its mutation', () => {
  const pairs = Array.from(
    { length: 10 },
    (_, i) => ({ key: `k${i}`, en: `Up to ${i}00 cells`, pl: `xx ${i}00 yy zz ww` }),
  )
  const out = mutations(pairs, 3)
  assertEquals(out.filter((m) => m.key.endsWith('(swapped)')).length, 3)
  assertEquals(out.filter((m) => m.key.endsWith('(truncated)')).length, 3)
  assertEquals(out.filter((m) => m.key.endsWith('(number)')).length, 3)
  for (const m of out) {
    const base = pairs.find((p) => m.key.startsWith(`${p.key} `))
    assertEquals(base !== undefined && base.pl !== m.pl, true)
  }
})
