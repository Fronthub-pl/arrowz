import { assertEquals } from '@std/assert'
import { heldOut, type Labelled, m2Score, parseLabels, sendable } from './memory-eval.ts'
import { MAX_INDEX_LINE } from './memory-guard.ts'

// Parities computed by a separate FNV-1a, so eval scores the same held-out half the spec reports.
Deno.test('heldOut: the spike split, FNV-1a of `split:<group>`', () => {
  assertEquals(['note-a.md', 'note-b.md', 'a', 'b'].map(heldOut), [false, true, false, true])
})

Deno.test('sendable: global basic-memory items never go to TypeSafe', () => {
  const item = (id: string): Labelled => ({ id, group: 'g', violation: false, kind: 'natural', text: 't' })
  assertEquals(sendable([item('bm-main:a'), item('arrowz:b'), item('x')]).map((x) => x.id), ['arrowz:b', 'x'])
})

Deno.test('parseLabels: m1 and m2 arrays of labelled items, anything else is null', () => {
  const item: Labelled = { id: 'i', group: 'g', violation: true, kind: 'hand-made', text: 't' }
  assertEquals(parseLabels({ m1: [item], m2: [] }), { m1: [item], m2: [] })
  assertEquals(parseLabels({ m1: [item] }), null)
  assertEquals(parseLabels({ m1: [{ ...item, kind: 'other' }], m2: [] }), null)
  assertEquals(parseLabels({ m1: [{ ...item, violation: 'yes' }], m2: [] }), null)
  assertEquals(parseLabels({ m1: [], m2: [{ ...item, text: 1 }] }), null)
  assertEquals(parseLabels(null), null)
})

Deno.test("m2Score: the guard's own length test, so prose of any length scores zero", () => {
  const long = 'x'.repeat(MAX_INDEX_LINE)
  assertEquals([m2Score(`- [T](t.md) ${long}`), m2Score('- [T](t.md) short'), m2Score(long + long)], [1, 0, 0])
})
