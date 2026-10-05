import { describe, expect, test } from 'vitest'
import { inlineOf, parseDocs, plainText, sectionIdOf, sectionsOf } from './markdown'
import { DOCS_HOME, DOCS_PAGES, isDocsPage, pageOf } from './pages'

describe('a page', () => {
  const root = parseDocs('# Title\n\n## Using it {#example}\n\nText.\n\n### Detail\n\n## Slots {#slots}\n')

  test('a ## heading gives up its {#id}, and the reader never sees it', () => {
    const headings = root.children.filter((node) => node.type === 'heading')
    expect(headings.map((h) => plainText(h.children))).toEqual(['Title', 'Using it', 'Detail', 'Slots'])
    expect(headings.map((h) => sectionIdOf(h))).toEqual([undefined, 'example', undefined, 'slots'])
  })

  test('the sections are the ## headings, by DOM id and title', () => {
    expect(sectionsOf(root)).toEqual([
      { id: 'docs-example', title: 'Using it' },
      { id: 'docs-slots', title: 'Slots' },
    ])
  })

  test('directives and tables parse', () => {
    const page = parseDocs('::table{of="element-props"}\n\n| a | b |\n|---|---|\n| 1 | 2 |\n')
    expect(page.children.map((node) => node.type)).toEqual(['leafDirective', 'table'])
  })
})

// Why prose writes `\:` and `\<`: unescaped, both parse as something the
// renderer does not show, and the words go missing.
describe('the two escapes', () => {
  const types = (markdown: string) => {
    const first = parseDocs(markdown).children[0]
    return first?.type === 'paragraph' ? first.children.map((node) => node.type) : []
  }

  test('a colon before a digit is a text directive unless escaped', () => {
    expect(types('At 10:30 sharp.')).toContain('textDirective')
    expect(types('At 10\\:30 sharp.')).toEqual(['text'])
  })

  test('a tag is raw HTML unless escaped', () => {
    expect(types('The <arrowz-board> element.')).toContain('html')
    expect(types('The \\<arrowz-board> element.')).toEqual(['text'])
  })
})

test('a description is one line of inline Markdown', () => {
  expect(inlineOf('`pl` selects *Polish*').map((node) => node.type)).toEqual(['inlineCode', 'text', 'emphasis'])
  expect(plainText(inlineOf('`pl` selects *Polish*'))).toBe('pl selects Polish')
})

test('a page name is one of the pages, case and all', () => {
  expect(isDocsPage('cli')).toBe(true)
  expect(isDocsPage('CLI')).toBe(false)
  expect(isDocsPage(undefined)).toBe(false)
})

test('the docs home is the first page, and an address names its page by its second segment', () => {
  expect(DOCS_HOME).toBe(`/docs/${DOCS_PAGES[0]}`)
  expect(pageOf('/docs/cli')).toBe('cli')
  expect(pageOf('/docs/element')).toBe('element')
  expect(pageOf('/docs/climb')).toBe(DOCS_PAGES[0])
})
