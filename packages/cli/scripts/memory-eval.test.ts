import { assertEquals } from '@std/assert'
import { heldOut } from './memory-eval.ts'

// Parities computed with the spike's own split, so eval scores the same held-out half the spec reports.
Deno.test('heldOut: the spike split, FNV-1a of `split:<group>`', () => {
  assertEquals(['arrowz-artefakty.md', 'feedback-scalanie-pr.md', 'a', 'b'].map(heldOut), [true, true, false, true])
})
