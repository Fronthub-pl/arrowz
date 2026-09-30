import { assertEquals } from '@std/assert'
import { heldOut, type Labelled, sendable } from './memory-eval.ts'

// Parities computed with the spike's own split, so eval scores the same held-out half the spec reports.
Deno.test('heldOut: the spike split, FNV-1a of `split:<group>`', () => {
  assertEquals(['arrowz-artefakty.md', 'feedback-scalanie-pr.md', 'a', 'b'].map(heldOut), [true, true, false, true])
})

Deno.test('sendable: global basic-memory items never go to TypeSafe', () => {
  const item = (id: string): Labelled => ({ id, group: 'g', violation: false, kind: 'natural', text: 't' })
  assertEquals(sendable([item('bm-main:a'), item('arrowz:b'), item('x')]).map((x) => x.id), ['arrowz:b', 'x'])
})
