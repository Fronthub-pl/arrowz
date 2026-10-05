import { ELEMENT_EVENTS, ELEMENT_MEMBERS, ELEMENT_PROPS, ELEMENT_SLOTS } from '@arrowz/engine/docs'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { contrast, parse } from '../design/contrast'
import { useStore } from '../state/store'
import { docsPage } from './content'
import { DocsPageView } from './DocsPageView'
// The colour cases below read computed style, which a component test only has
// with the sheets imported.
import '../design/index.css'

beforeEach(() => useStore.getState().lang.setLang('en'))
afterEach(() => vi.restoreAllMocks())

// No wrapper element: the MemoryRouter renders none, so the page's blocks are
// the container's children, as they are the body's in the panel.
const mount = () =>
  render(
    <MemoryRouter initialEntries={['/docs/element']}>
      <DocsPageView page="element" />
    </MemoryRouter>,
  )

const firstCode = docsPage('en', 'element').root.children.find((node) => node.type === 'code')
const EXAMPLE = firstCode?.type === 'code' ? firstCode.value : ''

// `querySelectorAll` hands back `Element`, which has no `cells`: the generic is not decoration.
const rowFor = (container: HTMLElement, key: string) =>
  [...container.querySelectorAll<HTMLTableRowElement>('tbody tr')].find((tr) => tr.cells[0]?.textContent === key)

test('every documented row reaches the page', async () => {
  const screen = await mount()
  const rows = screen.container.querySelectorAll('tbody tr')
  expect(rows).toHaveLength(
    ELEMENT_PROPS.length + ELEMENT_MEMBERS.length + ELEMENT_EVENTS.length + ELEMENT_SLOTS.length,
  )
  const pad = rowFor(screen.container, 'pad')
  expect(pad?.cells[1]?.textContent).toBe('number')
  expect(pad?.cells[2]?.textContent).toBe('pad')
  expect(pad?.cells[3]?.textContent).toBe('4')
})

test('a property with no attribute says it has none', async () => {
  const screen = await mount()
  expect(rowFor(screen.container, 'board')?.cells[2]?.textContent).toBe('—')
})

const machine = (container: HTMLElement) => [...container.querySelectorAll('tbody td.mono')].map((c) => c.textContent)
const described = (container: HTMLElement) =>
  [...container.querySelectorAll('tbody td:not(.mono)')].map((c) => c.textContent)

test('a language switch changes every description and leaves every machine cell', async () => {
  const screen = await mount()
  const before = machine(screen.container)
  const helpBefore = described(screen.container)
  expect(before).toHaveLength(
    ELEMENT_PROPS.length * 4 + ELEMENT_MEMBERS.length * 2 + ELEMENT_EVENTS.length * 2 + ELEMENT_SLOTS.length,
  )
  expect(helpBefore).toHaveLength(
    ELEMENT_PROPS.length + ELEMENT_MEMBERS.length + ELEMENT_EVENTS.length + ELEMENT_SLOTS.length,
  )
  await act(async () => useStore.getState().lang.setLang('pl'))
  expect(machine(screen.container)).toEqual(before)
  const helpAfter = described(screen.container)
  for (const [i, text] of helpAfter.entries()) expect(text, `description ${i}`).not.toBe(helpBefore[i])
})

// What the Markdown changed: a code span in a description is code, not two backticks.
test('a description shows its code spans as code', async () => {
  const screen = await mount()
  const cell = rowFor(screen.container, 'lang')?.cells[4]
  expect(cell?.querySelector('code')?.textContent).toBe('pl')
  expect(cell?.textContent).not.toContain('`')
})

test('Copy on the example writes the code, not its colouring', async () => {
  const write = vi.fn(() => Promise.resolve())
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText: write } as unknown as Clipboard)
  const screen = await mount()
  const code = screen.container.querySelector('div.fw-docs-block > pre.fw-docs-code > code')
  expect(EXAMPLE).toContain('<arrowz-board')
  expect(code?.textContent).toBe(EXAMPLE)
  expect(code?.querySelectorAll('span[class^="tk-"]').length).toBeGreaterThan(20)
  await screen.getByRole('button', { name: 'Copy: Using it' }).click()
  expect(write).toHaveBeenCalledWith(EXAMPLE)
  await expect.element(screen.getByRole('button', { name: 'Copied: Using it' })).toBeInTheDocument()
})

test('Copy names its section in Polish too', async () => {
  useStore.getState().lang.setLang('pl')
  const screen = await mount()
  const button = screen.getByRole('button', { name: 'Kopiuj: Jak użyć' })
  await expect.element(button).toHaveTextContent('Kopiuj')
})

test('the README note stands under the lead, named, before the first section', async () => {
  const screen = await mount()
  const note = screen.getByRole('complementary', { name: 'Note' })
  await expect.element(note).toMatchTextContent(/live in the package README\.$/)
  const aside = note.element()
  expect(aside.previousElementSibling?.tagName).toBe('P')
  expect(aside.nextElementSibling?.tagName).toBe('H3')
  expect(aside.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  // Nothing trails the last table.
  expect(screen.container.lastElementChild?.tagName).toBe('TABLE')
})

test('the slot table opens with how a host fills a slot, in both languages', async () => {
  const screen = await mount()
  const table = screen.container.querySelector('table[aria-labelledby="docs-slots"]')
  expect(table?.previousElementSibling?.textContent).toMatch(/^A child with slot set to one of these names/)
  await act(async () => useStore.getState().lang.setLang('pl'))
  const after = screen.container.querySelector('table[aria-labelledby="docs-slots"]')
  expect(after?.previousElementSibling?.textContent).toMatch(/^Dziecko z slot ustawionym/)
})

test('the note is named in Polish too', async () => {
  useStore.getState().lang.setLang('pl')
  const screen = await mount()
  await expect.element(screen.getByRole('complementary', { name: 'Uwaga' })).toBeVisible()
})

test('every section heading carries the id the navigation names', async () => {
  const screen = await mount()
  const ids = [...screen.container.querySelectorAll('h3')].map((h) => h.id)
  expect(ids).toEqual(['docs-example', 'docs-props', 'docs-members', 'docs-events', 'docs-slots'])
})

/** The computed colour of the one token of `cls` in a machine cell, and its text. */
function token(row: HTMLTableRowElement | undefined, cell: number, cls: string) {
  const span = row?.cells[cell]?.querySelector(`.tk-${cls}`)
  if (span === null || span === undefined) throw new Error(`no .tk-${cls} in cell ${cell}`)
  return { text: span.textContent, color: getComputedStyle(span).color }
}

test('the machine columns wear the colour of what they hold', async () => {
  const screen = await mount()
  const at = (key: string) => rowFor(screen.container, key)
  expect(token(at('pad'), 0, 'prop')).toEqual({ text: 'pad', color: 'rgb(121, 192, 255)' })
  expect(token(at('pad'), 1, 'type')).toEqual({ text: 'number', color: 'rgb(255, 166, 87)' })
  expect(token(at('pad'), 2, 'attr')).toEqual({ text: 'pad', color: 'rgb(121, 192, 255)' })
  expect(token(at('board'), 2, 'pun')).toEqual({ text: '—', color: 'rgb(139, 148, 158)' })
  expect(token(at('board'), 3, 'num')).toEqual({ text: 'null', color: 'rgb(121, 192, 255)' })
  expect(token(at('pointColor'), 3, 'str')).toEqual({ text: "'#c9c9d6'", color: 'rgb(165, 214, 255)' })
  expect(token(at('viewport'), 0, 'prop').text).toBe('viewport')
  expect(token(at('zoomBy'), 0, 'fn')).toEqual({ text: 'zoomBy', color: 'rgb(210, 168, 255)' })
  expect(token(at('zoomBy'), 1, 'param')).toEqual({ text: 'factor', color: 'rgb(255, 166, 87)' })
  expect(token(at('piece-click'), 0, 'str').text).toBe('piece-click')
  expect(token(at('piece-click'), 1, 'prop').text).toBe('pieceId')
  expect(token(at('zoom-in'), 0, 'str').text).toBe('zoom-in')
  expect(at('pad')?.cells[4]?.querySelector('[class^="tk-"]')).toBeNull()
})

test('every code colour clears 4.5:1 on --graphite and --void', async () => {
  const screen = await render(<div className="fw" />)
  const probe = document.createElement('span')
  screen.container.append(probe)
  const resolve = (name: string) => {
    probe.style.color = `var(${name})`
    return parse(getComputedStyle(probe).color).rgb
  }
  const planes = ['--graphite', '--void'].map(resolve)
  const names = ['text', 'tag', 'attr', 'str', 'kw', 'fn', 'type', 'prop', 'num', 'param', 'pun'].map(
    (n) => `--code-${n}`,
  )
  for (const name of names) {
    expect(getComputedStyle(document.documentElement).getPropertyValue(name), name).not.toBe('')
    for (const plane of planes) expect(contrast(resolve(name), plane), name).toBeGreaterThanOrEqual(4.5)
  }
})
