import { assertEquals, assertStringIncludes } from '@std/assert'
import type { Answers, Judge } from './jev-client.ts'
import {
  commentFlag,
  commentReport,
  comments,
  commentsOf,
  dictionaryPairs,
  excerpt,
  type Flag,
  format,
  i18n,
  i18nReport,
  MAX_COMMENT_REQUESTS,
  message,
  messageFlags,
  messageFromCommand,
  messageReport,
  type Pair,
  pairFlag,
  ruleSection,
  walkPairs,
  words,
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

Deno.test('commentsOf: a six-line block is judged, a seven-line block is not', () => {
  const six = Array.from({ length: 6 }, (_, i) => `// line ${i}`).join('\n')
  const seven = Array.from({ length: 7 }, (_, i) => `// line ${i}`).join('\n')
  const srcSix = `${six}\nconst a = 1\n`
  const srcSeven = `${seven}\nconst b = 2\n`
  assertEquals(commentsOf(srcSix, false).length, 1)
  assertEquals(commentsOf(srcSeven, false).length, 0)
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

const noFiles = () => null

Deno.test('words: quotes, escapes, and a stop at the first control operator', () => {
  assertEquals(words(`-m "say \\"hi\\"" -q && git push`), ['-m', 'say "hi"', '-q'])
  assertEquals(words(`-m 'a b'; echo x`), ['-m', 'a b'])
  assertEquals(words('-m "unterminated'), ['-m'])
})

Deno.test('messageFromCommand: -m, repeated -m, -am and --message=', () => {
  assertEquals(messageFromCommand('git commit -m "Title"', '/r', noFiles), { kind: 'commit', text: 'Title' })
  assertEquals(messageFromCommand('git commit -m A -m "B c"', '/r', noFiles)?.text, 'A\n\nB c')
  assertEquals(messageFromCommand('git commit -am "All"', '/r', noFiles)?.text, 'All')
  assertEquals(messageFromCommand('git commit --message=Eq', '/r', noFiles)?.text, 'Eq')
})

Deno.test('messageFromCommand: a $(cat <<EOF) heredoc inside -m', () => {
  const cmd = `git commit -m "$(cat <<'EOF'\nTitle line\n\nWhy it matters.\nEOF\n)"`
  assertEquals(messageFromCommand(cmd, '/r', noFiles)?.text, 'Title line\n\nWhy it matters.')
})

Deno.test('messageFromCommand: only the commit of a chained command', () => {
  const cmd = 'cd packages && git add x && git commit -q -m "Only this" && git push origin HEAD'
  assertEquals(messageFromCommand(cmd, '/r', noFiles)?.text, 'Only this')
})

Deno.test('messageFromCommand: -F reads the file against cwd, -F - reads the stdin heredoc', () => {
  const read = (p: string) => (p === '/r/sub/msg.txt' ? 'From file' : null)
  assertEquals(messageFromCommand('git commit -F sub/msg.txt', '/r', read)?.text, 'From file')
  assertEquals(messageFromCommand("git commit -F - <<'EOF'\nPiped\nEOF", '/r', noFiles)?.text, 'Piped')
  assertEquals(messageFromCommand('git commit -F missing.txt', '/r', read), null)
})

Deno.test('messageFromCommand: gh pr create and edit bodies', () => {
  assertEquals(messageFromCommand('gh pr create --title T --body "Body"', '/r', noFiles), { kind: 'pr', text: 'Body' })
  assertEquals(messageFromCommand('gh pr edit 12 -b B2', '/r', noFiles)?.text, 'B2')
  const read = (p: string) => (p === '/tmp/b.md' ? 'File body' : null)
  assertEquals(messageFromCommand('gh pr create --body-file /tmp/b.md', '/r', read)?.text, 'File body')
})

Deno.test('messageFromCommand: nothing to read is null', () => {
  assertEquals(messageFromCommand('git commit --amend --no-edit', '/r', noFiles), null)
  assertEquals(messageFromCommand('git status', '/r', noFiles), null)
  assertEquals(messageFromCommand('gh pr view 3', '/r', noFiles), null)
})

Deno.test('messageFlags: an attribution line is flagged by code, without Jev', () => {
  const flags = messageFlags('commit', 'Fix\n\nCo-Authored-By: someone <a@b>', null)
  assertEquals(flags.map((f) => f.question), ['attribution'])
})

Deno.test('messageFlags: letters alone flag nothing, since messages may quote the Polish dictionary', () => {
  assertEquals(messageFlags('commit', 'Lab: the label now reads "\u0105\u0142"', null), [])
})

Deno.test('messageFlags: not_english strictly past its threshold', () => {
  const at = { not_english: 0.8 }
  assertEquals(messageFlags('pr', 'Update', { not_english: 0.85 }, at), [
    { where: 'PR body', question: 'not_english', p: 0.85, excerpt: 'Update' },
  ])
  assertEquals(messageFlags('pr', 'Update', { not_english: 0.8 }, at), [])
})

Deno.test('message: asks with the kind spelled out, and reports under the message title', async () => {
  const { judge, calls } = stubJudge(() => ({ not_english: 0.99 }))
  const flags = await message(judge, 'commit', 'Update')
  assertEquals(calls, [{ kind: 'commit message', text: 'Update' }])
  assertStringIncludes(messageReport('commit', flags) ?? '', 'the commit message may break the message rules')
})

Deno.test('messageFlags: prose that mentions "generated with" is not an attribution line', () => {
  assertEquals(messageFlags('commit', 'Lab: boards generated with seed 7 draw the same', null), [])
})

Deno.test('messageFlags: a footer with a leading emoji is still an attribution line', () => {
  const flags = messageFlags('commit', 'Fix\n\n' + '\u{1F916} Generated with [Some Tool](https://example.com)', null)
  assertEquals(flags.map((f) => f.question), ['attribution'])
})

Deno.test('walkPairs: string leaves by key path; functions and keys missing in PL are skipped', () => {
  const out: Pair[] = []
  walkPairs({ a: 'A', b: { c: 'C', f: () => 'x' }, gone: 'G' }, { a: 'a', b: { c: 'c', f: () => 'y' } }, '', out)
  assertEquals(out, [{ key: 'a', en: 'A', pl: 'a' }, { key: 'b.c', en: 'C', pl: 'c' }])
})

Deno.test('dictionaryPairs: the dictionary, the knob texts and the reasons, never an untranslated pair', async () => {
  const pairs = await dictionaryPairs()
  assertEquals(pairs.length > 300, true)
  assertEquals(pairs.some((p) => p.key === 'params.W.label'), true)
  assertEquals(pairs.some((p) => p.key.startsWith('reasons.')), true)
  assertEquals(pairs.some((p) => p.key.startsWith('ui.')), true)
  assertEquals(pairs.every((p) => p.en.trim() !== p.pl.trim()), true)
})

Deno.test('pairFlag: flagged as differs = 1 - same_meaning, strictly past the threshold', () => {
  const pair = { key: 'ui.x', en: 'Width', pl: 'y' }
  assertEquals(pairFlag(pair, { same_meaning: 0.2 }, 0.7), {
    where: 'lab-i18n.ts ui.x',
    question: 'differs',
    p: 0.8,
    excerpt: 'y',
  })
  assertEquals(pairFlag(pair, { same_meaning: 0.3 }, 0.7), null)
})

Deno.test('i18n: asks each pair with its key, English and Polish', async () => {
  const { judge, calls } = stubJudge(() => ({ same_meaning: 0.05 }))
  const flags = await i18n(judge, [{ key: 'k', en: 'E', pl: 'P' }])
  assertEquals(calls, [{ key: 'k', en: 'E', pl: 'P' }])
  assertStringIncludes(i18nReport(flags) ?? '', '1 Polish string may not say what the English says')
})

Deno.test('i18n: every pair is judged, however many', async () => {
  const pairs: Pair[] = Array.from({ length: 130 }, (_, i) => ({
    key: `k${i}`,
    en: 'English',
    pl: 'Polish',
  }))
  const { judge, calls } = stubJudge(() => ({ same_meaning: 0.9 }))
  await i18n(judge, pairs)
  assertEquals(calls.length, 130)
})
