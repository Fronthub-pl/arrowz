import { docsFor } from '@arrowz/engine/docs'
import type { Nodes } from 'mdast'
import { describe, expect, test } from 'vitest'
import { docsPage, SOURCES } from './content'
import { DOCS_LINK, inlineOf, parseDocs } from './markdown'
import { DOCS_PAGES, SECTION_PREFIX } from './pages'
import { problemsOf, shapeOf } from './shape'

const LANGS = ['en', 'pl'] as const

describe.each(DOCS_PAGES)('the %s page', (page) => {
  test.each(LANGS)('in %s holds only what the renderer shows', (lang) => {
    expect(problemsOf(parseDocs(SOURCES[lang][page]), DOCS_PAGES)).toEqual([])
  })

  test('has the same shape in both languages', () => {
    expect(shapeOf(docsPage('pl', page).root)).toEqual(shapeOf(docsPage('en', page).root))
  })
})

function linksOf(node: Nodes, out: string[] = []): string[] {
  if (node.type === 'link') out.push(node.url)
  if ('children' in node) for (const child of node.children) linksOf(child, out)
  return out
}

test.each(LANGS)('every docs: link in %s names a section that exists', (lang) => {
  for (const page of DOCS_PAGES) {
    for (const url of linksOf(docsPage(lang, page).root)) {
      const m = DOCS_LINK.exec(url)
      if (m === null) continue
      const target = DOCS_PAGES.find((name) => name === m[1])
      expect(target, url).toBeDefined()
      if (target === undefined) continue
      expect(
        docsPage(lang, target).sections.map((s) => s.id),
        url,
      ).toContain(SECTION_PREFIX + (m[2] ?? ''))
    }
  }
})

// Descriptions are drawn through the parser: one that parses into anything but
// a single paragraph of plain inline text would lose words on the page, and
// `inlineOf` shows a non-paragraph as its raw text, so the node types alone
// would not catch it.
test.each(LANGS)('every %s description is plain inline Markdown', (lang) => {
  const docs = docsFor(lang)
  const texts = [docs.props, docs.members, docs.events, docs.slots].flatMap((rows) => Object.values(rows))
  expect(texts.length).toBeGreaterThan(30)
  for (const text of texts) {
    expect(
      parseDocs(text).children.map((node) => node.type),
      text,
    ).toEqual(['paragraph'])
    for (const node of inlineOf(text)) expect(['text', 'inlineCode', 'emphasis', 'strong'], text).toContain(node.type)
  }
})
