import { assert, assertEquals } from '@std/assert'
import { fromFileUrl } from '@std/path'
import type { Answers, Judge } from './jev-client.ts'
import {
  checkDocs,
  CONTRADICTS_AT,
  DOCS_GLOSSARY,
  DOCS_SOURCES,
  docsPagesOf,
  proseBlocks,
  readDocs,
  sectionProse,
  textFlags,
} from './jev-docs.ts'

function stubJudge(answer: (state: Record<string, unknown>) => Answers | null) {
  const calls: Record<string, unknown>[] = []
  /** The question ids of each call, by its index in `calls`. */
  const questions: string[][] = []
  const judge: Judge = (state, asked) => {
    const s = state as Record<string, unknown>
    calls.push(s)
    questions.push(Object.keys(asked))
    return Promise.resolve(answer(s))
  }
  return { judge, calls, questions }
}

const PAGE = [
  '# \\<arrowz-board>',
  '',
  'The lead,',
  'on two lines.',
  '',
  '> A note.',
  '',
  '## Using it {#example}',
  '',
  '```sh',
  'deno task carve --width=4',
  '```',
  '',
  '::table{of="element-props"}',
  '',
  'After the table.',
].join('\n')

Deno.test('proseBlocks keeps prose and headings, joined, with the line it starts on', () => {
  assertEquals(proseBlocks(PAGE), [
    { line: 1, text: '\\<arrowz-board>' },
    { line: 3, text: 'The lead, on two lines.' },
    { line: 6, text: 'A note.' },
    { line: 8, text: 'Using it' },
    { line: 16, text: 'After the table.' },
  ])
})

Deno.test('sectionProse groups the prose under each {#id}, the lead first', () => {
  assertEquals([...sectionProse(PAGE)], [
    ['lead', '\\<arrowz-board>\nThe lead,\non two lines.\nA note.\n'],
    ['example', 'Using it\nAfter the table.\n'],
  ])
})

const quiet = { contradicts: 0.1, history: 0.1, plain: 0.6, same_meaning: 0.95 }

Deno.test('textFlags flags past each threshold, and nothing without an answer', () => {
  assertEquals(textFlags('w', 't', quiet), [])
  assertEquals(textFlags('w', 't', null), [])
  const flags = textFlags('w', 't', { contradicts: 0.75, history: 0.9, plain: 0.2 })
  assertEquals(flags.map((f) => f.question), ['contradicts_readme', 'history', 'not_plain'])
  assertEquals(textFlags('w', 't', { ...quiet, contradicts: CONTRADICTS_AT }), [])
})

Deno.test('checkDocs asks each prose block with the README and the renames, and each section pair', async () => {
  const { judge, calls } = stubJudge((s) =>
    s.text === 'After the table.'
      ? { ...quiet, contradicts: 0.9 }
      : s.key === 'apps/lab/docs-content/pl/cli.md #example'
      ? { same_meaning: 0.2 }
      : quiet
  )
  const pl = PAGE.replace('After the table.', 'Po tabeli.').replace('The lead,\non two lines.', 'Wstęp.')
  const flags = await checkDocs(judge, { page: 'cli', en: PAGE, pl, source: 'README' })
  // The CLI page also brings the env descriptions, which have their own test.
  const fromLabDocs = (c: Record<string, unknown>) => String(c.key ?? '').startsWith('packages/engine/lab-docs.ts')
  const asked = calls.filter((c) => 'source' in c && !/^[A-Z_]+: /.test(String(c.text)))
  assertEquals(asked.map((c) => c.text), [
    '\\<arrowz-board>',
    'The lead, on two lines.',
    'A note.',
    'Using it',
    'After the table.',
  ])
  for (const c of asked) {
    assertEquals(c.source, 'README')
    assertEquals(c.glossary, DOCS_GLOSSARY)
  }
  assertEquals(calls.filter((c) => 'en' in c && !fromLabDocs(c)).length, 2)
  assertEquals(flags.map((f) => [f.where, f.question]), [
    ['apps/lab/docs-content/en/cli.md:16', 'contradicts_readme'],
    ['apps/lab/docs-content/pl/cli.md #example', 'differs'],
  ])
})

Deno.test('checkDocs asks history of the text alone, the other questions with the README', async () => {
  const { judge, calls, questions } = stubJudge(() => quiet)
  await checkDocs(judge, { page: 'cli', en: PAGE, pl: PAGE, source: 'README' })
  const textCalls = calls.flatMap((c, i) => ('text' in c ? [{ state: c, ids: questions[i] ?? [] }] : []))
  const history = textCalls.filter((c) => c.ids.includes('history'))
  const others = textCalls.filter((c) => !c.ids.includes('history'))
  assert(history.length > 0)
  assertEquals(history.length, others.length)
  for (const c of history) {
    assertEquals(c.ids, ['history'])
    assertEquals(Object.keys(c.state), ['text'])
  }
  for (const c of others) {
    assertEquals(c.ids.sort(), ['contradicts', 'plain'])
    assertEquals(Object.keys(c.state).sort(), ['glossary', 'source', 'text'])
  }
})

Deno.test('a board label is a prose block on its line, and prose of its section', () => {
  const md = [
    '# T',
    '',
    '## Boards {#boards}',
    '',
    ':::compare{stats="pieces"}',
    '::board[`--seed=7` lays one board]{cmd="--width=20 --height=20 --seed=7"}',
    '::board[and another]{cmd="--width=20 --height=20 --seed=8"}',
    ':::',
    '',
    '::table{of="knobs"}',
    '::board[A lone board]',
  ].join('\n')
  assertEquals(proseBlocks(md), [
    { line: 1, text: 'T' },
    { line: 3, text: 'Boards' },
    { line: 6, text: '`--seed=7` lays one board' },
    { line: 7, text: 'and another' },
    { line: 11, text: 'A lone board' },
  ])
  assertEquals(sectionProse(md).get('boards'), 'Boards\n`--seed=7` lays one board\nand another\nA lone board\n')
})

Deno.test('checkDocs reads the element descriptions too, in both languages', async () => {
  const { judge, calls } = stubJudge(() => quiet)
  await checkDocs(judge, { page: 'element', en: PAGE, pl: PAGE, source: 'README' })
  assert(calls.some((c) => typeof c.text === 'string' && c.text.startsWith('pad: ')))
  assert(calls.some((c) => c.key === 'packages/engine/lab-docs.ts props.pad'))
})

Deno.test('checkDocs reads the lab descriptions with the lab page, and not the element ones', async () => {
  const { judge, calls } = stubJudge(() => quiet)
  await checkDocs(judge, { page: 'lab', en: PAGE, pl: PAGE, source: 'README' })
  assert(calls.some((c) => c.key === 'packages/engine/lab-docs.ts keys.G'))
  assert(calls.some((c) => c.key === 'packages/engine/lab-docs.ts linkFields.lang'))
  assert(!calls.some((c) => typeof c.key === 'string' && c.key.startsWith('packages/engine/lab-docs.ts props.')))
})

Deno.test('readDocs reads both languages and the source README, and refuses an unknown page', () => {
  const files: Record<string, string> = {
    'apps/lab/docs-content/en/cli.md': 'en',
    'apps/lab/docs-content/pl/cli.md': 'pl',
    'packages/cli/README.md': 'readme',
  }
  assertEquals(readDocs('cli', (rel) => files[rel] ?? null), { page: 'cli', en: 'en', pl: 'pl', source: 'readme' })
  assertEquals(readDocs('nowhere', (rel) => files[rel] ?? null), null)
})

Deno.test('docsPagesOf names the pages a change touches', () => {
  const names = [
    'apps/lab/docs-content/pl/cli.md',
    'apps/lab/docs-content/en/cli.md',
    'packages/engine/lab-docs.ts',
    'apps/lab/docs-content/en/nowhere.md',
    'apps/lab/src/docs/content.ts',
  ].join('\n')
  assertEquals(docsPagesOf(names), ['cli', 'element', 'lab'])
})

// Jev reads a page only through DOCS_SOURCES: a page missing there is never checked.
Deno.test('DOCS_SOURCES names exactly the docs pages on disk', () => {
  const dir = fromFileUrl(new URL('../../../apps/lab/docs-content/en/', import.meta.url))
  const pages = [...Deno.readDirSync(dir)]
    .filter((entry) => entry.name.endsWith('.md'))
    .map((entry) => entry.name.slice(0, -3))
  assertEquals(Object.keys(DOCS_SOURCES).sort(), pages.sort())
})

Deno.test('proseBlocks reads a table row as prose and skips its separator', () => {
  const md = '# T\n\n| Flag | Does |\n|---|---|\n| `--only` | one level only |\n'
  assertEquals(proseBlocks(md).map((b) => b.text), ['T', 'Flag · Does', '`--only` · one level only'])
})

Deno.test('proseBlocks splits a note at its blank > line', () => {
  const md = '> First paragraph.\n>\n> Second paragraph.\n'
  assertEquals(proseBlocks(md).map((b) => b.text), ['First paragraph.', 'Second paragraph.'])
})

Deno.test('proseBlocks knows ~~~ fences', () => {
  const md = 'Before.\n\n~~~text\nnot prose\n~~~\n\nAfter.\n'
  assertEquals(proseBlocks(md).map((b) => b.text), ['Before.', 'After.'])
})

Deno.test('a fence closes only on its own marker', () => {
  const md = '~~~text\n```\nstill code\n~~~\n\nAfter.\n'
  assertEquals(proseBlocks(md).map((b) => b.text), ['After.'])
})

Deno.test('sectionProse counts the heading as prose of its section', () => {
  const sections = sectionProse('# Title\n\n## Part {#part}\n\nText.\n')
  assertEquals(sections.get('lead'), 'Title\n')
  assertEquals(sections.get('part'), 'Part\nText.\n')
})

Deno.test('a section only one language has is compared with nothing', async () => {
  const { judge, calls } = stubJudge(() => quiet)
  await checkDocs(judge, { page: 'cli', en: '# T\n', pl: '# T\n\n## Tylko {#only}\n\nTekst.\n', source: 'README' })
  assert(calls.some((c) => c.key === 'apps/lab/docs-content/pl/cli.md #only' && c.en === ''))
})

Deno.test('checkDocs reads the env descriptions with the CLI page, and says where from the repository root', async () => {
  const { judge, calls } = stubJudge(() => quiet)
  await checkDocs(judge, { page: 'cli', en: PAGE, pl: PAGE, source: 'README' })
  assert(calls.some((c) => c.key === 'packages/engine/lab-docs.ts env.CARVE_TRACE'))
})
