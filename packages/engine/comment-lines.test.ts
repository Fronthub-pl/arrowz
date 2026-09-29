import { assertEquals } from '@std/assert'
import { commentBlocks } from './comment-lines.ts'

Deno.test('commentBlocks: consecutive comment-only lines form one block', () => {
  const src = 'const a = 1\n// one\n// two\nconst b = 2\n// three\n'
  assertEquals(commentBlocks(src), [
    { start: 2, end: 3, text: ' one\n two' },
    { start: 5, end: 5, text: ' three' },
  ])
})

Deno.test('commentBlocks: a trailing comment is not part of any block', () => {
  assertEquals(commentBlocks('// head\nconst a = 1 // tail\n// next'), [
    { start: 1, end: 1, text: ' head' },
    { start: 3, end: 3, text: ' next' },
  ])
})

Deno.test('commentBlocks: a /* */ block spans its lines', () => {
  assertEquals(commentBlocks('/**\n * Doc.\n */\nexport const x = 1').map((b) => [b.start, b.end]), [[1, 3]])
})
