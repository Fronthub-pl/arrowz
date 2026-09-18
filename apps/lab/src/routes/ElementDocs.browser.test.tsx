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
