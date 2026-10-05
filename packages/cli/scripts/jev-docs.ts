// Advisory checks of the lab's documentation pages, answered by Jev: does a page
// say what its README says, does the Polish say what the English says, does it
// tell the project's history, is it plain. They report and never gate; the
// questions' measurement is in docs/jev-guards.md.
import { docsFor } from '@arrowz/engine/docs'
import { fromFileUrl, join } from '@std/path'
import { defaultJudge, keyPath } from './jev-client.ts'
import type { Answers, Judge, Noul } from './jev-client.ts'
import { DIFFERS_AT, excerpt, type Flag, PAIR_QUESTIONS, pool } from './jev-guard.ts'

/** The README each docs page is written from. */
export const DOCS_SOURCES: Readonly<Record<string, string>> = {
  arrowz: 'README.md',
  lab: 'apps/lab/README.md',
  element: 'packages/board-element/README.md',
  cli: 'packages/cli/README.md',
}

/** The glossary's renames: the READMEs and the code still say the right-hand word. */
export const DOCS_GLOSSARY: readonly string[] = [
  'arrow = piece (the code and older READMEs say piece)',
  'arrowhead = head',
  'path to the edge = corridor',
  'background = paper',
  'arrow colour = ink',
  'dot grid = point grid',
  'skeleton = giants',
  'target length = probe',
  'complete = closed',
  'stuck = jammed',
  'make or lay a board = carve',
]

export const DOCS_QUESTIONS = {
  contradicts: {
    type: 'noul',
    instructions:
      'The package README `source` says something that makes the documentation text `text` false: a different value, default, name, behaviour or condition. The documentation renamed some words; the pairs in `glossary` name the same thing, so using one where the README uses the other is not a contradiction. Text the README simply does not mention is not a contradiction either.',
    criteria: {
      true: 'The README contradicts the text.',
      false: 'The README agrees with the text or does not address it.',
    },
  },
  history: {
    type: 'noul',
    instructions:
      "The documentation text `text` talks about the project's own past: an earlier version, a pull request, a review, a round of work, or what something used to be.",
    criteria: { true: 'It tells history.', false: 'It describes only how things are now.' },
  },
  plain: {
    type: 'noul',
    instructions:
      'A person who uses the Arrowz lab, its command line or its web component, and has not read their source code, understands the documentation text `text` without having to look up an unexplained internal term.',
    criteria: {
      true: 'Plain: every term it uses is common or explained.',
      false: 'It leans on internal jargon or unexplained terms.',
    },
  },
} satisfies Record<string, Noul>

// Measured on jev-1.13.0 against hand-made faults (docs/jev-guards.md, "Docs pages").
export const CONTRADICTS_AT = 0.7
export const DOCS_HISTORY_AT = 0.85
/** `plain` ranks well and calibrates badly: only the clearly worst text is worth a word. */
export const PLAIN_BELOW = 0.3

const CONCURRENCY = 8
const round = (p: number) => Math.round(p * 1000) / 1000

// `history` is asked of the text alone: the CLI README tells the tool's past
// itself, and beside it clean blocks scored as high as history (docs/jev-guards.md).
const { history: HISTORY, ...WITH_README } = DOCS_QUESTIONS
const HISTORY_QUESTION = { history: HISTORY }

/** Both answers to one text as one; null only when Jev answered neither. */
const merged = (a: Answers | null, b: Answers | null): Answers | null =>
  a === null && b === null ? null : { ...a, ...b }

export type DocsInput = { page: string; en: string; pl: string; source: string }

type Piece = { line: number; kind: 'text' | 'break' | 'heading' | 'row' | 'label'; text: string }

const cells = (row: string) =>
  row.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim()).join(' · ')

/** The label of a `::board[…]{…}` line; the other directives have none. */
const boardLabel = (raw: string) => /^::board\[(.*?)\](?:\{.*\})?\s*$/.exec(raw)?.[1]

/** A page's lines as prose pieces: fences, table separators and directives dropped but a board's label, a bare `>` a break. */
function pieces(markdown: string): Piece[] {
  const out: Piece[] = []
  let fence: string | null = null
  markdown.split('\n').forEach((raw, i) => {
    const line = i + 1
    const marker = /^(```|~~~)/.exec(raw)?.[1]
    if (fence !== null) {
      if (marker === fence) fence = null
      return
    }
    const label = boardLabel(raw)
    if (marker !== undefined) {
      fence = marker
      out.push({ line, kind: 'break', text: '' })
    } else if (label !== undefined) {
      out.push({ line, kind: 'label', text: label })
    } else if (raw.trim() === '' || /^>\s?$/.test(raw) || raw.startsWith('::')) {
      out.push({ line, kind: 'break', text: '' })
    } else if (raw.startsWith('#')) {
      const text = raw.replace(/^#+\s*/, '').replace(/\s*\{#[a-z][a-z0-9-]*\}\s*$/, '').trim()
      out.push({ line, kind: 'heading', text })
    } else if (raw.startsWith('|')) {
      if (!/^\|[\s:|-]+\|?\s*$/.test(raw)) out.push({ line, kind: 'row', text: cells(raw) })
    } else {
      out.push({ line, kind: 'text', text: raw.replace(/^>\s?/, '') })
    }
  })
  return out
}

/** A page's prose, block by block: headings, table rows and board labels one block each, a note split at its blank `>`. */
export function proseBlocks(markdown: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = []
  let start = 0
  let lines: string[] = []
  const flush = () => {
    if (lines.length > 0) out.push({ line: start, text: lines.join(' ').trim() })
    lines = []
  }
  for (const p of pieces(markdown)) {
    if (p.kind === 'text') {
      if (lines.length === 0) start = p.line
      lines.push(p.text)
    } else {
      flush()
      if (p.kind !== 'break') out.push({ line: p.line, text: p.text })
    }
  }
  flush()
  return out
}

/** A page's prose by section: the `{#id}` of each `##`, and `lead` before the first; a heading is its section's. */
export function sectionProse(markdown: string): Map<string, string> {
  const out = new Map<string, string>()
  let section = 'lead'
  const ids = new Map<number, string>()
  markdown.split('\n').forEach((raw, i) => {
    const id = /^## .*\{#([a-z][a-z0-9-]*)\}\s*$/.exec(raw)?.[1]
    if (id !== undefined) ids.set(i + 1, id)
  })
  for (const p of pieces(markdown)) {
    if (p.kind === 'break') continue
    const id = ids.get(p.line)
    if (id !== undefined) section = id
    out.set(section, `${out.get(section) ?? ''}${p.text}\n`)
  }
  return out
}

export function textFlags(where: string, text: string, a: Answers | null): Flag[] {
  if (a === null) return []
  const out: Flag[] = []
  const contradicts = a.contradicts ?? 0
  const history = a.history ?? 0
  const plain = a.plain ?? 1
  if (contradicts > CONTRADICTS_AT) {
    out.push({ where, question: 'contradicts_readme', p: round(contradicts), excerpt: text })
  }
  if (history > DOCS_HISTORY_AT) out.push({ where, question: 'history', p: round(history), excerpt: text })
  if (plain < PLAIN_BELOW) out.push({ where, question: 'not_plain', p: round(1 - plain), excerpt: text })
  return out
}

/** The description tables each page draws from `lab-docs.ts`. */
const DESCRIPTION_GROUPS = {
  element: ['props', 'members', 'events', 'slots'],
  lab: ['keys', 'palette', 'linkFields'],
  cli: ['env'],
} as const

/** Whether `page` draws description tables from `lab-docs.ts`. */
function hasDescriptions(page: string): page is keyof typeof DESCRIPTION_GROUPS {
  return Object.hasOwn(DESCRIPTION_GROUPS, page)
}

/** A page's reference descriptions, as `key: text` in each language; none for a page without tables. */
function descriptionRows(page: string): { key: string; en: string; pl: string }[] {
  const groups = hasDescriptions(page) ? DESCRIPTION_GROUPS[page] : []
  const en = docsFor('en')
  const pl = docsFor('pl')
  const rows: { key: string; en: string; pl: string }[] = []
  for (const group of groups) {
    const plRows: Readonly<Record<string, string>> = pl[group]
    for (const [key, text] of Object.entries(en[group])) {
      rows.push({ key: `${group}.${key}`, en: `${key}: ${text}`, pl: `${key}: ${plRows[key] ?? ''}` })
    }
  }
  return rows
}

export async function checkDocs(judge: Judge, input: DocsInput): Promise<Flag[]> {
  const file = (lang: string) => `apps/lab/docs-content/${lang}/${input.page}.md`
  const texts = proseBlocks(input.en).map((b) => ({ where: `${file('en')}:${b.line}`, text: b.text }))
  const enSections = sectionProse(input.en)
  const plSections = sectionProse(input.pl)
  const ids = [...enSections.keys(), ...[...plSections.keys()].filter((id) => !enSections.has(id))]
  const pairs = ids.map((id) => ({
    where: `${file('pl')} #${id}`,
    en: enSections.get(id) ?? '',
    pl: plSections.get(id) ?? '',
  }))
  for (const row of descriptionRows(input.page)) {
    const where = `packages/engine/lab-docs.ts ${row.key}`
    texts.push({ where, text: row.en })
    pairs.push({ where, en: row.en, pl: row.pl })
  }
  const asked = await pool(texts, CONCURRENCY, async (t) => {
    const withReadme = await judge({ text: t.text, glossary: DOCS_GLOSSARY, source: input.source }, WITH_README)
    return merged(withReadme, await judge({ text: t.text }, HISTORY_QUESTION))
  })
  const paired = await pool(pairs, CONCURRENCY, (p) => judge({ key: p.where, en: p.en, pl: p.pl }, PAIR_QUESTIONS))
  const flags: Flag[] = []
  texts.forEach((t, i) => flags.push(...textFlags(t.where, t.text, asked[i] ?? null)))
  pairs.forEach((p, i) => {
    const a = paired[i]
    const differs = a ? 1 - (a.same_meaning ?? 1) : 0
    if (differs > DIFFERS_AT) flags.push({ where: p.where, question: 'differs', p: round(differs), excerpt: p.pl })
  })
  return flags
}

/** A page's two languages and its README, by repository-relative path; null for a page with no README. */
export function readDocs(page: string, read: (rel: string) => string | null): DocsInput | null {
  const sourcePath = DOCS_SOURCES[page]
  if (sourcePath === undefined) return null
  const en = read(`apps/lab/docs-content/en/${page}.md`)
  const pl = read(`apps/lab/docs-content/pl/${page}.md`)
  const source = read(sourcePath)
  return en === null || pl === null || source === null ? null : { page, en, pl, source }
}

/** The docs pages a change touches: a page's Markdown in either language, or the descriptions in `lab-docs.ts`. */
export function docsPagesOf(names: string): string[] {
  const pages = new Set<string>()
  for (const name of names.split('\n').map((n) => n.trim())) {
    const page = /^apps\/lab\/docs-content\/(?:en|pl)\/([a-z]+)\.md$/.exec(name)?.[1]
    if (page !== undefined && page in DOCS_SOURCES) pages.add(page)
    if (name === 'packages/engine/lab-docs.ts') {
      for (const described of Object.keys(DESCRIPTION_GROUPS)) pages.add(described)
    }
  }
  return [...pages]
}

const ROOT = fromFileUrl(new URL('../../../', import.meta.url))

function readOrNull(rel: string): string | null {
  try {
    return Deno.readTextFileSync(join(ROOT, rel))
  } catch {
    return null
  }
}

if (import.meta.main) {
  const pages = Deno.args.length > 0 ? Deno.args : Object.keys(DOCS_SOURCES)
  const judge = await defaultJudge()
  if (judge === null) {
    console.error(`jev: no TYPESAFE_API_KEY in ${keyPath()}`)
    Deno.exit(1)
  }
  const flags: Flag[] = []
  for (const page of pages) {
    const input = readDocs(page, readOrNull)
    if (input === null) console.error(`jev: no docs page "${page}"`)
    else flags.push(...(await checkDocs(judge, input)))
  }
  const lines = flags.map((f) => `${f.where}  ${f.question} p=${f.p.toFixed(2)}  ${excerpt(f.excerpt)}`)
  // As in the other guards, "nothing flagged" also covers Jev not answering at all.
  console.log(lines.length === 0 ? 'jev: nothing flagged' : lines.join('\n'))
  Deno.exit(0)
}
