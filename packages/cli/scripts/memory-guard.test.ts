import { assertEquals, assertStringIncludes } from '@std/assert'
import type { Answers, Judge } from './jev-client.ts'
import {
  findingsReport,
  longIndexLines,
  MAX_INDEX_LINE,
  MAX_MEMORY_REQUESTS,
  MEMORY_AT,
  memoryFlags,
  memoryReport,
  observations,
  openPrClaims,
  paragraphs,
  presentSegments,
  staleState,
} from './memory-guard.ts'

Deno.test('observations: one item per `- [category]` line, continuation lines joined, fences skipped', () => {
  const note = [
    '# Title',
    '## Observations',
    '- [decision] Keep the guard advisory',
    '  because hooks must never block #jev',
    '- [fact] second item',
    '```',
    '- [inside] a fence is not an item',
    '```',
    '- [last] third item',
    '## Relations',
    '- part_of [[Other]]',
  ].join('\n')
  assertEquals(observations(note), [
    '- [decision] Keep the guard advisory because hooks must never block #jev',
    '- [fact] second item',
    '- [last] third item',
  ])
  assertEquals(observations('- [a] item\n```\ncode\n```\nafter the fence'), ['- [a] item'])
})

Deno.test('paragraphs: body paragraphs of 80+ characters, frontmatter, headings and fences skipped', () => {
  const long = 'x'.repeat(80)
  const file = [
    '---',
    'name: n',
    `description: ${long}`,
    '---',
    '',
    '# Heading',
    long,
    '',
    'short',
    '',
    '```',
    long,
    '```',
    '',
    `${long.slice(0, 40)}`,
    `${long.slice(0, 40)}`,
  ].join('\n')
  assertEquals(paragraphs(file), [long, `${long.slice(0, 40)} ${long.slice(0, 40)}`])
})

Deno.test('longIndexLines: counts characters, not bytes, and only index entries', () => {
  const polish = `- [Ł](a.md) — ${'ż'.repeat(MAX_INDEX_LINE - 14)}`
  assertEquals([...polish].length, MAX_INDEX_LINE)
  assertEquals(longIndexLines(polish, (l) => `MEMORY.md:${l}`), [])
  const over = `${polish}ą`
  const prose = 'x'.repeat(200)
  assertEquals(longIndexLines(`${prose}\n${over}`, (l) => `MEMORY.md:${l}`).map((f) => f.where), ['MEMORY.md:2'])
})

Deno.test('findingsReport: null when empty, capped at five unless all', () => {
  assertEquals(findingsReport('t', []), null)
  const found = Array.from({ length: 7 }, (_, i) => ({ where: `w${i}`, what: 'bad' }))
  const short = findingsReport('t', found) ?? ''
  assertStringIncludes(short, 'memory: t:\n- w0  bad')
  assertStringIncludes(short, '(2 more not shown)')
  assertStringIncludes(findingsReport('t', found, true) ?? '', '- w6  bad')
})

function stubJudge(answer: (state: Record<string, unknown>) => Answers | null) {
  const calls: Record<string, unknown>[] = []
  const judge: Judge = (state) => {
    calls.push(state as Record<string, unknown>)
    return Promise.resolve(answer(state as Record<string, unknown>))
  }
  return { judge, calls }
}

Deno.test('memoryFlags: flags an item strictly above MEMORY_AT and sends only the item', async () => {
  const { judge, calls } = stubJudge((s) => ({ violates: s.memory_item === 'fact' ? MEMORY_AT + 0.01 : MEMORY_AT }))
  const r = await memoryFlags(judge, ['fact', 'reason'], 'x.md')
  assertEquals(r.flags.map((f) => [f.where, f.question, f.excerpt]), [['x.md', 'code_fact', 'fact']])
  assertEquals(calls, [{ memory_item: 'fact' }, { memory_item: 'reason' }])
})

Deno.test('memoryFlags: an unanswered item is not flagged, and the cap counts what was skipped', async () => {
  const { judge, calls } = stubJudge(() => null)
  const items = Array.from({ length: MAX_MEMORY_REQUESTS + 3 }, (_, i) => `item ${i}`)
  const r = await memoryFlags(judge, items, 'x.md')
  assertEquals([r.flags.length, r.skipped, calls.length], [0, 3, MAX_MEMORY_REQUESTS])
})

Deno.test('memoryFlags: no items, no request', async () => {
  const { judge, calls } = stubJudge(() => ({ violates: 1 }))
  assertEquals((await memoryFlags(judge, [], 'x.md')).flags, [])
  assertEquals(calls.length, 0)
})

Deno.test('memoryReport: null without flags, a jev block with them and the skipped note', () => {
  assertEquals(memoryReport({ flags: [], skipped: 4 }), null)
  const out =
    memoryReport({ flags: [{ where: 'x.md', question: 'code_fact', p: 0.9, excerpt: 'fact' }], skipped: 2 }) ?? ''
  assertStringIncludes(out, '- x.md  code_fact p=0.90  fact')
  assertStringIncludes(out, '(2 further items were not checked)')
  const none = memoryReport({ flags: [{ where: 'x.md', question: 'code_fact', p: 0.9, excerpt: 'fact' }], skipped: 0 })
  assertEquals(none?.includes('further items'), false)
})

Deno.test('openPrClaims: both word orders, Polish and English; not a negation, a list or another word', () => {
  assertEquals(openPrClaims('PR #123 otwarty (worktree x)'), [123])
  assertEquals(openPrClaims('otwarty mój PR #132'), [132])
  assertEquals(openPrClaims('open PR #7 and PR #8 open'), [7, 8])
  assertEquals(openPrClaims('PR #90 (x y), `main` = `abc1234`, zero otwartych PR-ów'), [])
  assertEquals(openPrClaims('PR #90 (x), zero otwartych'), [])
  assertEquals(openPrClaims('zero otwartych PR #5'), [])
  assertEquals(openPrClaims('no open PR #4'), [])
  assertEquals(openPrClaims('PR #111, open'), [])
  assertEquals(openPrClaims('reopened PR #5'), [])
})

Deno.test('presentSegments: every index line and only the first clause of a description', () => {
  const note = {
    file: 'a.md',
    text: '---\nname: a\ndescription: "now: PR #9 open; 2026-09-01: PR #3 open"\n---\nbody PR #4 open',
  }
  assertEquals(presentSegments('- [A](a.md) — x\n', [note]), [
    { where: 'MEMORY.md:1', text: '- [A](a.md) — x' },
    { where: 'MEMORY.md:2', text: '' },
    { where: 'a.md description', text: 'now: PR #9 open' },
  ])
})

Deno.test('staleState: a closed PR called open, a dead link, an untracked path', () => {
  const found = staleState({
    index: '- [A](a.md) — PR #5 open\n- [B](gone.md) — see `packages/cli/nope.ts` and `apps/lab/src`',
    notes: [],
    exists: (f) => f === 'a.md',
    openPrs: new Set([6]),
    tracked: new Set(['apps/lab/src/main.tsx']),
  })
  assertEquals(found, [
    { where: 'MEMORY.md:1', what: 'PR #5 is called open, but it is not open' },
    { where: 'MEMORY.md:2', what: 'links gone.md, which does not exist' },
    { where: 'MEMORY.md:2', what: 'names packages/cli/nope.ts, which git does not track' },
  ])
})

Deno.test('staleState: unknown PRs or files check nothing of theirs; an empty set flags every claim', () => {
  const input = { index: '- [A](a.md) — PR #5 open, `docs/x.md`', notes: [], exists: () => true }
  assertEquals(staleState({ ...input, openPrs: null, tracked: null }), [])
  assertEquals(staleState({ ...input, openPrs: new Set<number>(), tracked: null }).map((f) => f.what), [
    'PR #5 is called open, but it is not open',
  ])
})
