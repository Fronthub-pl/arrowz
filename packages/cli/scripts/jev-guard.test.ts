import { assertEquals, assertStringIncludes } from '@std/assert'
import type { Answers, Judge } from './jev-client.ts'
import {
  commentFlag,
  commentReport,
  comments,
  commentsOf,
  excerpt,
  type Flag,
  format,
  MAX_COMMENT_REQUESTS,
  ruleSection,
} from './jev-guard.ts'

export function stubJudge(answer: (state: Record<string, unknown>) => Answers | null) {
  const calls: Record<string, unknown>[] = []
  const judge: Judge = (state) => {
    const s = state as Record<string, unknown>
    calls.push(s)
    return Promise.resolve(answer(s))
  }
  return { judge, calls }
}

const quiet = { violates: 0.1, history: 0.1, spec_ref: 0.1 }

Deno.test('ruleSection: one ## section, up to the next top-level or second-level heading', () => {
  const md = '# Rules\n## Language\nen\n## Comments\nsay why\n\n### Detail\nkept\n## Next\nno\n# Tools\nno'
  assertEquals(ruleSection(md, 'Comments'), '## Comments\nsay why\n\n### Detail\nkept')
  assertEquals(ruleSection(md, 'Missing'), null)
})

Deno.test('commentsOf: short blocks and trailing comments, with the code that follows', () => {
  const long = Array.from({ length: 7 }, (_, i) => `// long ${i}`).join('\n')
  const src = `// short one\n// short two\nconst a = 1\n${long}\nconst b = 2 // tail\n`
  assertEquals(commentsOf(src, false), [
    { line: 1, text: ' short one\n short two', code: 'const a = 1' },
    { line: 11, text: ' tail', code: 'const b = 2 // tail' },
  ])
})

Deno.test('commentFlag: past a threshold, named after the question with the highest p', () => {
  const c = { line: 1, text: 'x', code: '' }
  assertEquals(commentFlag('f:1', c, { violates: 0.9, history: 0.95, spec_ref: 0.2 })?.question, 'history')
  assertEquals(commentFlag('f:1', c, { violates: 0.9, history: 0.1, spec_ref: 0.1 })?.question, 'violates')
  assertEquals(commentFlag('f:1', c, { violates: 0.5, history: 0.2, spec_ref: 0.93 })?.question, 'spec_ref')
})

Deno.test('commentFlag: exactly at a threshold is not a flag', () => {
  const c = { line: 1, text: 'x', code: '' }
  assertEquals(commentFlag('f:1', c, { violates: 0.85, history: 0.9, spec_ref: 0.9 }), null)
})

Deno.test('comments: no comment, no request', async () => {
  const { judge, calls } = stubJudge(() => quiet)
  assertEquals((await comments(judge, 'rule', 'a.ts', 'const a = 1\n', (l) => `a.ts:${l}`)).flags, [])
  assertEquals(calls.length, 0)
})

Deno.test('comments: each comment is asked with the rule, the file and the next line of code', async () => {
  const { judge, calls } = stubJudge(() => ({ violates: 0.9, history: 0.1, spec_ref: 0.1 }))
  const r = await comments(judge, 'RULE', 'a.ts', '\n// Ruling 5 said so\nconst a = 1\n', (l) => `a.ts:${l + 10}`)
  assertEquals(calls, [{ rule: 'RULE', file: 'a.ts', comment: 'Ruling 5 said so', code: 'const a = 1' }])
  assertEquals(r.flags, [{ where: 'a.ts:12', question: 'violates', p: 0.9, excerpt: ' Ruling 5 said so' }])
})

Deno.test('comments: an unanswered question is silence', async () => {
  const { judge } = stubJudge(() => null)
  assertEquals((await comments(judge, 'r', 'a.ts', '// x\n', String)).flags, [])
})

Deno.test('comments: a file with too many blocks is judged in part, and says so', async () => {
  const src = Array.from({ length: MAX_COMMENT_REQUESTS + 10 }, (_, i) => `// c${i}\nconst v${i} = ${i}`).join('\n')
  const { judge, calls } = stubJudge(() => quiet)
  const r = await comments(judge, 'r', 'a.ts', src, String)
  assertEquals(calls.length, MAX_COMMENT_REQUESTS)
  assertEquals(r.skipped, 10)
  const flagged = { flags: [{ where: 'a', question: 'violates', p: 0.9, excerpt: 'x' }], skipped: 10 }
  assertStringIncludes(commentReport(flagged) ?? '', '10 further comments were not checked')
})

Deno.test('format: highest p first, five at most, the rest counted', () => {
  const flags: Flag[] = [0.86, 0.99, 0.9, 0.95, 0.87, 0.97, 0.88].map((p, i) => ({
    where: `f:${i}`,
    question: 'violates',
    p,
    excerpt: `c${i}`,
  }))
  const out = format('title', flags) ?? ''
  const lines = out.split('\n')
  assertEquals(lines[0], 'jev: title:')
  assertEquals(lines[1], '- f:1  violates p=0.99  c1')
  assertEquals(lines.filter((l) => l.startsWith('- ')).length, 5)
  assertEquals(lines.at(-1), '(2 more not shown)')
  assertEquals(format('title', []), null)
})

Deno.test('excerpt: one line, cut at 80 characters', () => {
  assertEquals(excerpt('a\n  b'), 'a b')
  assertEquals(excerpt('x'.repeat(100)).length, 80)
  assertEquals(excerpt('x'.repeat(100)).endsWith('…'), true)
})
