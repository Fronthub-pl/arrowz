import { THEMES } from '@arrowz/engine'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { DocsMarkdown } from './DocsMarkdown'
import { parseDocs } from './markdown'
// The swatches take their size from docs.css.
import '../design/index.css'

beforeEach(() => useStore.getState().lang.setLang('en'))

const show = () =>
  render(
    <MemoryRouter initialEntries={['/docs/element']}>
      <DocsMarkdown root={parseDocs('# T\n\n## Themes {#themes}\n\n::table{of="themes"}')} />
    </MemoryRouter>,
  )

const table = (container: HTMLElement) => container.querySelector('table[aria-labelledby="docs-themes"]')
const rows = (container: HTMLElement) => [...(table(container)?.querySelectorAll('tbody tr') ?? [])]

test('a row per built-in theme, under four headers', async () => {
  const screen = await show()
  expect([...(table(screen.container)?.querySelectorAll('thead th') ?? [])].map((th) => th.textContent)).toEqual([
    'Theme',
    'Colours',
    'Source',
    'Licence',
  ])
  expect(rows(screen.container).map((tr) => tr.children[0]?.textContent)).toEqual(Object.keys(THEMES))
})

test('the swatches are the theme’s colours, in order, named for a screen reader', async () => {
  const screen = await show()
  const mocha = THEMES['catppuccin-mocha']
  if (mocha === undefined) throw new Error('no catppuccin-mocha')
  const colours = [mocha.paper, mocha.ink, mocha.highlight, ...mocha.palette]
  const cell = rows(screen.container)[0]?.children[1]
  const group = cell?.querySelector('[role="img"]')
  expect(group?.getAttribute('aria-label')).toBe(colours.join(', '))
  const swatches = [...(group?.querySelectorAll('.fw-docs-swatch') ?? [])]
  expect(swatches).toHaveLength(colours.length)
  // #1e1e2e: the background, first.
  const first = swatches[0]
  if (first === undefined) throw new Error('no swatch')
  expect(getComputedStyle(first).backgroundColor).toBe('rgb(30, 30, 46)')
  expect(first.getBoundingClientRect().width).toBeGreaterThan(0)
})

test('the source links out, and the licence is the theme’s', async () => {
  const screen = await show()
  const mocha = THEMES['catppuccin-mocha']
  const row = rows(screen.container)[0]
  const link = row?.children[2]?.querySelector('a')
  expect(link?.textContent).toBe(mocha?.source)
  expect(link?.getAttribute('href')).toBe(mocha?.url)
  expect(link?.getAttribute('target')).toBe('_blank')
  expect(link?.getAttribute('rel')).toBe('noreferrer')
  expect(row?.children[3]?.textContent).toBe(mocha?.licence)
})

test('a language switch renames the columns and nothing else', async () => {
  const screen = await show()
  const body = () => table(screen.container)?.querySelector('tbody')?.innerHTML
  const before = body()
  await act(async () => useStore.getState().lang.setLang('pl'))
  expect(table(screen.container)?.querySelector('thead th')?.textContent).toBe('Motyw')
  expect(body()).toBe(before)
})
