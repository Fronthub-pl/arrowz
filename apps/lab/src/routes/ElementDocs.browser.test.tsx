import { ELEMENT_EVENTS, ELEMENT_MEMBERS, ELEMENT_PROPS } from '@arrowz/engine/docs'
import { act } from 'react'
import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { ElementDocs } from './ElementDocs'

beforeEach(() => useStore.getState().lang.setLang('en'))

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

// The only assertion that the page is wired to the store at all: the machine
// columns stay put, the descriptions change.
test('a language switch changes the descriptions and leaves the machine columns', async () => {
  const screen = await render(<ElementDocs />)
  const cellOf = (key: string, i: number) => rowFor(screen.container, key)?.cells[i]?.textContent
  const englishHelp = cellOf('pad', 4)
  await act(async () => useStore.getState().lang.setLang('pl'))
  expect(cellOf('pad', 1)).toBe('number')
  expect(cellOf('pad', 4)).not.toBe(englishHelp)
})
