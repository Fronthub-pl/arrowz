import { helpText } from '@arrowz/engine/command'
import type { ArrowzBoard } from '@arrowz/board-element'
import { ELEMENT_SLOTS } from '@arrowz/engine/docs'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { DocsMarkdown } from './DocsMarkdown'
import { parseDocs } from './markdown'

beforeEach(() => useStore.getState().lang.setLang('en'))

/** Where a link took the router, printed where a case can read it. */
function Where() {
  const location = useLocation()
  return <output data-testid="where">{`${location.pathname} ${JSON.stringify(location.state)}`}</output>
}

const show = (markdown: string, path = '/docs/element') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <DocsMarkdown root={parseDocs(markdown)} />
      <Where />
    </MemoryRouter>,
  )

test('headings move one level down, and a section keeps its id but not its {#id}', async () => {
  const screen = await show('# Title\n\n## Part {#part}\n\n### Detail')
  const tags = [...screen.container.querySelectorAll('h2, h3, h4')].map((h) => [h.tagName, h.id, h.textContent])
  expect(tags).toEqual([
    ['H2', '', 'Title'],
    ['H3', 'docs-part', 'Part'],
    ['H4', '', 'Detail'],
  ])
})

test('inline markup becomes elements, never markup text', async () => {
  const screen = await show('# T\n\nA *b* **c** `d` e.')
  const p = screen.container.querySelector('p')
  expect(p?.querySelector('em')?.textContent).toBe('b')
  expect(p?.querySelector('strong')?.textContent).toBe('c')
  expect(p?.querySelector('code')?.textContent).toBe('d')
  expect(p?.textContent).toBe('A b c d e.')
})

// The renderer builds elements from the tree; raw HTML in the source reaches
// the page as nothing at all, not as a tag.
test('raw HTML does not reach the page', async () => {
  const screen = await show('# T\n\nThe <b>bold</b> way.')
  expect(screen.container.querySelector('b')).toBeNull()
})

// The fragment is the lab's knobs, as on the column's own links (`DocsNav`).
test('a docs link goes to its page, keeps the fragment and names the section in the state', async () => {
  const screen = await show('# T\n\nSee [the knobs](docs:cli#knobs).', '/docs/element#{"W":25}')
  const link = screen.getByRole('link', { name: 'the knobs' })
  await expect.element(link).toHaveAttribute('href', '/docs/cli#{"W":25}')
  await link.click()
  await expect.element(screen.getByTestId('where')).toHaveTextContent('/docs/cli {"docsSection":"docs-knobs"}')
})

test('a link out of the lab opens in a new tab', async () => {
  const screen = await show('# T\n\nThe [source](https://github.com/catppuccin/catppuccin).')
  const link = screen.getByRole('link', { name: 'source' })
  await expect.element(link).toHaveAttribute('target', '_blank')
  await expect.element(link).toHaveAttribute('rel', 'noreferrer')
})

test('code in a known language is coloured, text is not, and each Copy names its section', async () => {
  const screen = await show('# T\n\n## Run {#run}\n\n```sh\ndeno task carve --width=4\n```\n\n```text\nok\n```')
  const sh = screen.container.querySelector('pre.fw-docs-code > code')
  expect(sh?.textContent).toBe('deno task carve --width=4')
  expect(sh?.querySelector('.tk-attr')?.textContent).toBe('--width')
  const term = screen.container.querySelector('pre.fw-docs-term')
  expect(term?.textContent).toBe('ok')
  expect(term?.querySelector('[class^="tk-"]')).toBeNull()
  expect(screen.container.querySelectorAll('button[aria-label="Copy: Run"]')).toHaveLength(2)
})

test('a blockquote is the named note, its glyph hidden', async () => {
  const screen = await show('# T\n\n> Read this.')
  const note = screen.getByRole('complementary', { name: 'Note' })
  await expect.element(note).toHaveTextContent('Read this.')
  expect(note.element().querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
})

test('a prose table has a header row and body rows', async () => {
  const screen = await show('# T\n\n| Word | Means |\n|---|---|\n| **arrow** | One line. |')
  expect([...screen.container.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Word', 'Means'])
  expect([...screen.container.querySelectorAll('tbody td')].map((td) => td.textContent)).toEqual(['arrow', 'One line.'])
})

test('lists keep their kind and their items', async () => {
  const screen = await show('# T\n\n- one\n- two\n\n1. first')
  expect([...screen.container.querySelectorAll('ul > li')].map((li) => li.textContent)).toEqual(['one', 'two'])
  expect([...screen.container.querySelectorAll('ol > li')].map((li) => li.textContent)).toEqual(['first'])
})

test('a list item with paragraphs apart keeps each as a paragraph', async () => {
  const screen = await show('# T\n\n- one\n\n  two\n- three')
  const first = screen.container.querySelector<HTMLElement>('ul > li')
  expect([...(first?.querySelectorAll(':scope > p') ?? [])].map((p) => p.textContent)).toEqual(['one', 'two'])
  // textContent joins block children with nothing; innerText is what a reader sees.
  expect(first?.innerText).not.toBe('onetwo')
  // CommonMark makes the whole list loose, so the item with one paragraph is a paragraph too.
  expect(screen.container.querySelectorAll('ul > li')[1]?.querySelector(':scope > p')?.textContent).toBe('three')
})

test('a list with items apart has every item a paragraph, a tight list none', async () => {
  const screen = await show('# T\n\n- a\n\n- b\n\nBetween.\n\n- c\n- d')
  const lists = [...screen.container.querySelectorAll('ul')]
  expect(lists.map((ul) => ul.querySelectorAll(':scope > li > p').length)).toEqual([2, 0])
})

test('::table draws the reference table its section names', async () => {
  const screen = await show('# T\n\n## Slots {#slots}\n\n::table{of="element-slots"}')
  const table = screen.container.querySelector('table[aria-labelledby="docs-slots"]')
  expect(table?.querySelectorAll('tbody tr')).toHaveLength(ELEMENT_SLOTS.length)
})

test('::play draws the rule board it names, coloured and playable', async () => {
  const screen = await show('# T\n\n::play{board="rule-blocked"}')
  const figure = screen.getByRole('figure', { name: 'An arrow with another arrow standing in its path to the edge' })
  await expect.element(figure).toBeVisible()
  const element = figure.element().querySelector<ArrowzBoard>('arrowz-board')
  expect(element?.hasAttribute('play')).toBe(true)
  expect(element?.board?.pieces).toHaveLength(3)
  await expect.poll(() => element?.colored).toBe(true)
})

test('::help draws the terminal text, plain', async () => {
  const screen = await show('# T\n\n## Help {#help}\n\n::help{form="short"}')
  expect(screen.container.querySelector('pre.fw-docs-term')?.textContent).toBe(helpText())
  expect(screen.container.querySelectorAll('button[aria-label="Copy: Help"]')).toHaveLength(1)
})
