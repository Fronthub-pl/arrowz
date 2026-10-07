import * as boardElement from '@arrowz/board-element'
import {
  docsFor,
  ELEMENT_CLASSES,
  ELEMENT_CONSTANTS,
  ELEMENT_FUNCTIONS,
  ELEMENT_TYPES,
  spellValue,
} from '@arrowz/engine/docs'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { DocsMarkdown } from './DocsMarkdown'
import { parseDocs } from './markdown'
// The wrap and the scroll box are docs.css's.
import '../design/index.css'

beforeEach(() => useStore.getState().lang.setLang('en'))

const EXPORTS = [
  '# T',
  '## Exports {#exports}',
  '### Types',
  '::table{of="element-types"}',
  '### Functions',
  '::table{of="element-functions"}',
  '### Constants',
  '::table{of="element-constants"}',
  '### Classes',
  '::table{of="element-classes"}',
].join('\n\n')

const show = (width = 720) =>
  render(
    <MemoryRouter initialEntries={['/docs/element']}>
      <div className="fw-docs-body" style={{ width: `${width}px` }}>
        <DocsMarkdown root={parseDocs(EXPORTS)} />
      </div>
    </MemoryRouter>,
  )

const tables = (container: HTMLElement) => [...container.querySelectorAll('table[aria-labelledby="docs-exports"]')]
const rows = (table: Element | undefined) => [...(table?.querySelectorAll('tbody tr') ?? [])]
const texts = (tr: Element) => [...tr.children].map((td) => td.textContent)
const headers = (table: Element | undefined) =>
  [...(table?.querySelectorAll('thead th') ?? [])].map((th) => th.textContent)

test('the four export tables, each a row per export, under their headers', async () => {
  const screen = await show()
  const [types, functions, constants, classes] = tables(screen.container)
  expect(headers(types)).toEqual(['Type', 'From', 'Shape', 'Description'])
  expect(headers(functions)).toEqual(['Function', 'Signature', 'Description'])
  expect(headers(constants)).toEqual(['Constant', 'Value', 'Description'])
  expect(headers(classes)).toEqual(['Class', 'Created with', 'Members', 'Description'])
  expect(rows(types)).toHaveLength(ELEMENT_TYPES.length)
  expect(rows(functions)).toHaveLength(ELEMENT_FUNCTIONS.length)
  expect(rows(constants)).toHaveLength(ELEMENT_CONSTANTS.length)
  expect(rows(classes)).toHaveLength(ELEMENT_CLASSES.length)
})

test('a type row names its package and its shape', async () => {
  const screen = await show()
  const row = rows(tables(screen.container)[0]).find((tr) => tr.children[0]?.textContent === 'GestureMode')
  expect(row && texts(row).slice(0, 3)).toEqual(['GestureMode', '@arrowz/board-element', "'drag' | 'click'"])
})

test('every constant shows the value the package exports', async () => {
  const screen = await show()
  const values: Readonly<Record<string, unknown>> = boardElement
  for (const tr of rows(tables(screen.container)[2])) {
    const name = tr.children[0]?.textContent ?? ''
    expect(tr.children[1]?.textContent, name).toBe(spellValue(values[name]))
  }
  // An object is spelled with its keys, not as `[object Object]`.
  const pad = rows(tables(screen.container)[2]).find((tr) => tr.children[0]?.textContent === 'PAD_RANGE')
  expect(pad?.children[1]?.textContent).toMatch(/^\{ min: /)
})

test('a class row spells its constructor and members; the element’s has none listed', async () => {
  const screen = await show()
  const [element, host] = rows(tables(screen.container)[3])
  expect(element && texts(element).slice(0, 3)).toEqual(['ArrowzBoard', 'new ArrowzBoard()', '—'])
  expect(host && texts(host).slice(0, 3)).toEqual([
    'GameHost',
    'new GameHost(target: GameTarget)',
    'goneIds, board, isGone(pieceId), setBoard(board), click(pieceId), save(colored), load(snap)',
  ])
})

test('the export tables follow the language, their machine cells do not', async () => {
  const screen = await show()
  const machine = () => [...screen.container.querySelectorAll('tbody td.mono')].map((td) => td.textContent)
  const before = machine()
  await act(async () => useStore.getState().lang.setLang('pl'))
  expect(headers(tables(screen.container)[0])).toEqual(['Typ', 'Skąd', 'Kształt', 'Opis'])
  expect(machine()).toEqual(before)
  const host = rows(tables(screen.container)[3])[1]
  expect(host?.lastElementChild?.textContent).toBe(docsFor('pl').classes.GameHost.replace(/`/g, ''))
})

test('at phone width the export tables scroll inside their boxes, not the panel', async () => {
  // 335 px is narrower than a 375 px phone's page (343 px: `.fw-docs` pads 16 px a side).
  const screen = await show(335)
  const body = screen.container.querySelector<HTMLElement>('.fw-docs-body')
  if (body === null) throw new Error('no body')
  expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth)
  for (const table of tables(screen.container)) {
    const box = table.parentElement
    expect(box?.classList.contains('fw-docs-scroll')).toBe(true)
    expect(getComputedStyle(box ?? table).overflowX).toBe('auto')
  }
  // A long value wraps in its cell rather than widening the table without end.
  const view = rows(tables(screen.container)[2]).find((tr) => tr.children[0]?.textContent === 'DEFAULT_VIEW')
  expect(view?.children[1]?.classList.contains('fw-docs-wrap')).toBe(true)
  // A cell is as tall as its row, so count the lines the value's own text sets.
  const range = document.createRange()
  range.selectNodeContents(view?.children[1] ?? screen.container)
  const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size
  expect(lines).toBeGreaterThan(1)
})
