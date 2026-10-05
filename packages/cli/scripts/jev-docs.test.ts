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
  const judge: Judge = (state) => {
    const s = state as Record<string, unknown>
    calls.push(s)
    return Promise.resolve(answer(s))
  }
  return { judge, calls }
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

Deno.test('proseBlocks keeps prose only, joined, with the line it starts on', () => {
  assertEquals(proseBlocks(PAGE), [
    { line: 3, text: 'The lead, on two lines.' },
    { line: 6, text: 'A note.' },
    { line: 16, text: 'After the table.' },
  ])
})

Deno.test('sectionProse groups the prose under each {#id}, the lead first', () => {
  assertEquals([...sectionProse(PAGE)], [
    ['lead', 'The lead,\non two lines.\nA note.\n'],
    ['example', 'After the table.\n'],
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
      : s.key === 'docs-content/pl/cli.md #example'
      ? { same_meaning: 0.2 }
      : quiet
  )
  const pl = PAGE.replace('After the table.', 'Po tabeli.').replace('The lead,\non two lines.', 'Wstęp.')
  const flags = await checkDocs(judge, { page: 'cli', en: PAGE, pl, source: 'README' })
  const asked = calls.filter((c) => 'text' in c)
  assertEquals(asked.map((c) => c.text), ['The lead, on two lines.', 'A note.', 'After the table.'])
  for (const c of asked) {
    assertEquals(c.source, 'README')
    assertEquals(c.glossary, DOCS_GLOSSARY)
  }
  assertEquals(calls.filter((c) => 'en' in c).length, 2)
  assertEquals(flags.map((f) => [f.where, f.question]), [
    ['docs-content/en/cli.md:16', 'contradicts_readme'],
    ['docs-content/pl/cli.md #example', 'differs'],
  ])
})

Deno.test('checkDocs reads the element descriptions too, in both languages', async () => {
  const { judge, calls } = stubJudge(() => quiet)
  await checkDocs(judge, { page: 'element', en: PAGE, pl: PAGE, source: 'README' })
  assert(calls.some((c) => typeof c.text === 'string' && c.text.startsWith('pad: ')))
  assert(calls.some((c) => c.key === 'lab-docs.ts props.pad'))
})

Deno.test('checkDocs reads the lab descriptions with the lab page, and not the element ones', async () => {
  const { judge, calls } = stubJudge(() => quiet)
  await checkDocs(judge, { page: 'lab', en: PAGE, pl: PAGE, source: 'README' })
  assert(calls.some((c) => c.key === 'lab-docs.ts keys.G'))
  assert(calls.some((c) => c.key === 'lab-docs.ts linkFields.lang'))
  assert(!calls.some((c) => typeof c.key === 'string' && c.key.startsWith('lab-docs.ts props.')))
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
