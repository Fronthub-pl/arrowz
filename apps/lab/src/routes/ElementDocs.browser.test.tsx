import { docsFor, ELEMENT_EVENTS, ELEMENT_MEMBERS, ELEMENT_PROPS } from '@arrowz/engine/docs'
import { act } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { contrast, parse } from '../design/contrast'
import { ELEMENT_EXAMPLE } from '../docs/elementExample'
import { useStore } from '../state/store'
import { DOCS_SECTIONS } from './DocsNav'
import { ElementDocs } from './ElementDocs'
// The colour cases below read computed style, which a component test only has
// with the sheets imported (CliDocs.browser.test.tsx says why).
import '../design/tokens.css'
import '../design/docs.css'

beforeEach(() => useStore.getState().lang.setLang('en'))
afterEach(() => vi.restoreAllMocks())

// `querySelectorAll` hands back `Element`, which has no `cells` — the lab's
// `check` gate catches that (TS2339) while vitest does not, so the generic
// argument is not decoration. Same trap as `querySelector` and `.style`.
const rowFor = (container: HTMLElement, key: string) =>
  [...container.querySelectorAll<HTMLTableRowElement>('tbody tr')].find((tr) => tr.cells[0]?.textContent === key)

test('every documented row reaches the page', async () => {
  const screen = await render(<ElementDocs />)
  const rows = screen.container.querySelectorAll('tbody tr')
  expect(rows).toHaveLength(ELEMENT_PROPS.length + ELEMENT_MEMBERS.length + ELEMENT_EVENTS.length)
  // One row spelled out, so the table is not merely the right length: the
  // machine columns are the point of the page.
  const pad = rowFor(screen.container, 'pad')
  expect(pad?.cells[1]?.textContent).toBe('number')
  expect(pad?.cells[2]?.textContent).toBe('pad')
  expect(pad?.cells[3]?.textContent).toBe('4')
})

// A property with no attribute must say so rather than leave a blank the reader
// has to interpret.
test('a property with no attribute says it has none', async () => {
  const screen = await render(<ElementDocs />)
  expect(rowFor(screen.container, 'board')?.cells[2]?.textContent).toBe('—')
})

// `mono` is the class the machine columns wear and the description column does
// not (ElementDocs.tsx), so these two read every machine cell and every
// description of all three tables without naming a single column index.
const machine = (container: HTMLElement) => [...container.querySelectorAll('tbody td.mono')].map((c) => c.textContent)
const described = (container: HTMLElement) =>
  [...container.querySelectorAll('tbody td:not(.mono)')].map((c) => c.textContent)

// The only assertion that the page is wired to the store at all: the machine
// columns stay put, the descriptions change. Sampling one column of one row was
// weaker than the claim in the name — a translated `def` or `signature` passed
// it — so both directions now cover every row.
test('a language switch changes every description and leaves every machine cell', async () => {
  const screen = await render(<ElementDocs />)
  const before = machine(screen.container)
  const helpBefore = described(screen.container)
  // The count is stated so an empty selector cannot satisfy the comparison
  // below: four machine columns for a property, two for a member or an event.
  expect(before).toHaveLength(ELEMENT_PROPS.length * 4 + ELEMENT_MEMBERS.length * 2 + ELEMENT_EVENTS.length * 2)
  expect(helpBefore).toHaveLength(ELEMENT_PROPS.length + ELEMENT_MEMBERS.length + ELEMENT_EVENTS.length)
  await act(async () => useStore.getState().lang.setLang('pl'))
  expect(machine(screen.container)).toEqual(before)
  const helpAfter = described(screen.container)
  for (const [i, text] of helpAfter.entries()) expect(text, `description ${i}`).not.toBe(helpBefore[i])
})

// Round 3 (3f): the example is a block with a Copy button of its own. The block
// shows coloured spans; the clipboard must get the code as written, which is
// the one thing a Copy that read the DOM's markup would get wrong.
test('Copy on the example writes the code, not its colouring', async () => {
  const write = vi.fn(() => Promise.resolve())
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText: write } as unknown as Clipboard)
  const screen = await render(<ElementDocs />)
  const code = screen.container.querySelector('div.fw-docs-block > pre.fw-docs-code > code')
  expect(code?.textContent).toBe(ELEMENT_EXAMPLE)
  // Coloured at all: a block of plain text would pass the line above.
  expect(code?.querySelectorAll('span[class^="tk-"]').length).toBeGreaterThan(20)
  await screen.getByRole('button', { name: 'Copy: Using it' }).click()
  expect(write).toHaveBeenCalledWith(ELEMENT_EXAMPLE)
  await expect.element(screen.getByRole('button', { name: 'Copied: Using it' })).toBeInTheDocument()
})

// The name says what is copied, in the page's language, and starts with the
// label the button shows.
test('Copy names its section in Polish too', async () => {
  useStore.getState().lang.setLang('pl')
  const screen = await render(<ElementDocs />)
  const button = screen.getByRole('button', { name: 'Kopiuj: Jak użyć' })
  await expect.element(button).toHaveTextContent('Kopiuj')
})

// The README pointer moved from under the last table to a named note under
// the lead (round 3 review): before the first section, after the lead
// paragraph, its glyph hidden from assistive technology.
test('the README note stands under the lead, named, before the first section', async () => {
  const screen = await render(<ElementDocs />)
  const note = screen.getByRole('complementary', { name: 'Note' })
  await expect.element(note).toHaveTextContent(docsFor('en').readmePointer)
  const aside = note.element()
  expect(aside.previousElementSibling?.tagName).toBe('P')
  expect(aside.nextElementSibling?.tagName).toBe('H3')
  expect(aside.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  // Nothing trails the last table any more.
  expect(screen.container.lastElementChild?.tagName).toBe('TABLE')
})

test('the note is named in Polish too', async () => {
  useStore.getState().lang.setLang('pl')
  const screen = await render(<ElementDocs />)
  await expect.element(screen.getByRole('complementary', { name: 'Uwaga' })).toBeVisible()
})

// The navigation column scrolls to these, in this order (DocsNav.tsx).
test('every section heading carries the id the navigation names', async () => {
  const screen = await render(<ElementDocs />)
  const ids = [...screen.container.querySelectorAll('h3')].map((h) => h.id)
  expect(ids).toEqual(DOCS_SECTIONS.element.map((section) => section.id))
})

/** The computed colour of the one token of `cls` in a machine cell, and its text. */
function token(row: HTMLTableRowElement | undefined, cell: number, cls: string) {
  const span = row?.cells[cell]?.querySelector(`.tk-${cls}`)
  if (span === null || span === undefined) throw new Error(`no .tk-${cls} in cell ${cell}`)
  return { text: span.textContent, color: getComputedStyle(span).color }
}

// The machine columns in the example's colours, by what each column holds
// (round 3 review): the same word is a property in one column and a type in
// the next, so these read the colour the page shows, cell by cell.
test('the machine columns wear the colour of what they hold', async () => {
  const screen = await render(<ElementDocs />)
  const at = (key: string) => rowFor(screen.container, key)
  expect(token(at('pad'), 0, 'prop')).toEqual({ text: 'pad', color: 'rgb(121, 192, 255)' })
  expect(token(at('pad'), 1, 'type')).toEqual({ text: 'number', color: 'rgb(255, 166, 87)' })
  expect(token(at('pad'), 2, 'attr')).toEqual({ text: 'pad', color: 'rgb(121, 192, 255)' })
  expect(token(at('board'), 2, 'pun')).toEqual({ text: '—', color: 'rgb(139, 148, 158)' })
  expect(token(at('board'), 3, 'num')).toEqual({ text: 'null', color: 'rgb(121, 192, 255)' })
  expect(token(at('pointColor'), 3, 'str')).toEqual({ text: "'#c9c9d6'", color: 'rgb(165, 214, 255)' })
  // A getter is a property; a method a function with parameters.
  expect(token(at('viewport'), 0, 'prop').text).toBe('viewport')
  expect(token(at('zoomBy'), 0, 'fn')).toEqual({ text: 'zoomBy', color: 'rgb(210, 168, 255)' })
  expect(token(at('zoomBy'), 1, 'param')).toEqual({ text: 'factor', color: 'rgb(255, 166, 87)' })
  // An event name is the string `addEventListener` takes; its fields are properties.
  expect(token(at('piece-click'), 0, 'str').text).toBe('piece-click')
  expect(token(at('piece-click'), 1, 'prop').text).toBe('pieceId')
  // The description stays prose.
  expect(at('pad')?.cells[4]?.querySelector('[class^="tk-"]')).toBeNull()
})

// Every colour of the code clears 4.5:1 on both planes it can sit on, as the
// handoff states: the block's and the tables' --graphite, and --void. Read
// through a probe the browser resolves, not from the hex in the sheet.
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
    // An undefined property resolves to the inherited colour: say which.
    expect(getComputedStyle(document.documentElement).getPropertyValue(name), name).not.toBe('')
    for (const plane of planes) expect(contrast(resolve(name), plane), name).toBeGreaterThanOrEqual(4.5)
  }
})
