import { helpText } from '@arrowz/engine/command'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { DocsPageView } from './DocsPageView'
// A component test loads no stylesheet of its own; without the cascade the
// overflow assertion below reads `visible`.
import '../design/index.css'

beforeEach(() => useStore.getState().lang.setLang('en'))
afterEach(() => vi.restoreAllMocks())

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/docs/cli']}>
      <DocsPageView page="cli" />
    </MemoryRouter>,
  )

// The long form contains every line of the short form but two, so one marker
// would pass a page showing a single block.
const LONG_ONLY = 'Rules (checked together with the ranges):'
const SHORT_ONLY = 'Knobs: --lmax='

test('both help forms are on the page', async () => {
  const screen = await mount()
  const text = screen.container.textContent ?? ''
  expect(text).toContain(SHORT_ONLY)
  expect(text).toContain(LONG_ONLY)
})

// Measured, not only declared: `overflow-x: auto` holds on a block that can never scroll.
test('the terminal blocks keep their spacing and scroll by themselves', async () => {
  const screen = await mount()
  const blocks = screen.container.querySelectorAll('div.fw-docs-block > pre.fw-docs-term')
  expect(blocks).toHaveLength(2)
  for (const block of blocks) {
    const style = getComputedStyle(block)
    expect(style.whiteSpace).toBe('pre')
    expect(style.overflowX).toBe('auto')
  }
  const knobs = blocks.item(1)
  if (knobs === null) throw new Error('the knob block is not on the page')
  expect(knobs.scrollWidth).toBeGreaterThan(knobs.clientWidth)
})

test('the frame speaks the chosen language and the help does not', async () => {
  const screen = await mount()
  expect(screen.container.querySelector('h3')?.textContent).toBe('Everyday help')
  useStore.getState().lang.setLang('pl')
  const polish = await mount()
  expect(polish.container.querySelector('h3')?.textContent).toBe('Pomoc na co dzień')
  expect(polish.container.textContent ?? '').toContain(SHORT_ONLY)
})

test('each help block copies its own text', async () => {
  const write = vi.fn(() => Promise.resolve())
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText: write } as unknown as Clipboard)
  const screen = await mount()
  await screen.getByRole('button', { name: 'Copy: Every knob' }).click()
  expect(write).toHaveBeenLastCalledWith(helpText({ knobs: true }))
  await screen.getByRole('button', { name: 'Copy: Everyday help' }).click()
  expect(write).toHaveBeenLastCalledWith(helpText())
})

test('the help blocks stay uncoloured', async () => {
  const screen = await mount()
  expect(screen.container.querySelectorAll('pre.fw-docs-term [class^="tk-"]')).toHaveLength(0)
})

test('both section headings carry the ids the navigation names', async () => {
  const screen = await mount()
  const ids = [...screen.container.querySelectorAll('h3')].map((h) => h.id)
  expect(ids).toEqual(['docs-short', 'docs-knobs'])
})
