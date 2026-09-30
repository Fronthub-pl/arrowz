import { assertEquals, assertStringIncludes } from '@std/assert'
import { findingsReport, longIndexLines, MAX_INDEX_LINE, observations, paragraphs } from './memory-guard.ts'

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
