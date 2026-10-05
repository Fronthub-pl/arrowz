import { helpText } from '@arrowz/engine/command'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { silentQueue } from '../harness/docsWorkers'
import { useStore } from '../state/store'
import { DocsBoardsProvider } from './DocsBoards'
import { DocsPageView } from './DocsPageView'
// A component test loads no stylesheet of its own; without the cascade the
// overflow assertion below reads `visible`.
import '../design/index.css'

beforeEach(() => useStore.getState().lang.setLang('en'))
afterEach(() => vi.restoreAllMocks())

// The page's prose and tables only: its boards wait on a worker that never answers.
const mount = () =>
  render(
    <MemoryRouter initialEntries={['/docs/cli']}>
      <div className="fw-docs-body">
        <DocsBoardsProvider root={null} queue={silentQueue()}>
          <DocsPageView page="cli" />
        </DocsBoardsProvider>
      </div>
    </MemoryRouter>,
  )

const SECTIONS = ['start', 'making', 'everyday', 'knobs', 'saved', 'env', 'standalone', 'trouble', 'words', 'help']

test('the page has its ten sections, in order', async () => {
  const screen = await mount()
  expect([...screen.container.querySelectorAll('h3')].map((h) => h.id)).toEqual(SECTIONS.map((id) => `docs-${id}`))
})

test('the knob, rule and environment tables are on the page', async () => {
  const screen = await mount()
  for (const id of ['knobs', 'env'])
    expect(screen.container.querySelector(`table[aria-labelledby="docs-${id}"]`), id).not.toBeNull()
  expect(screen.container.querySelectorAll('table[aria-labelledby="docs-knobs"]')).toHaveLength(2)
})

/** The two help blocks: the terminal blocks that start as `--help` does. */
const helpBlocks = (container: HTMLElement) =>
  [...container.querySelectorAll('pre.fw-docs-term')].filter((pre) => pre.textContent?.startsWith('Usage:'))

test('both help forms are on the page, uncoloured, the knob table scrolling by itself', async () => {
  const screen = await mount()
  const blocks = helpBlocks(screen.container)
  expect(blocks.map((b) => b.textContent)).toEqual([helpText(), helpText({ knobs: true })])
  for (const block of blocks) expect(block.querySelectorAll('[class^="tk-"]')).toHaveLength(0)
  const knobs = blocks[1]
  if (knobs === undefined) throw new Error('the knob block is not on the page')
  expect(getComputedStyle(knobs).overflowX).toBe('auto')
  expect(knobs.scrollWidth).toBeGreaterThan(knobs.clientWidth)
})

test('each help block copies its own text', async () => {
  const write = vi.fn(() => Promise.resolve())
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText: write } as unknown as Clipboard)
  const screen = await mount()
  await screen.getByRole('button', { name: 'Copy: --help=knobs' }).click()
  expect(write).toHaveBeenLastCalledWith(helpText({ knobs: true }))
  await screen.getByRole('button', { name: 'Copy: --help', exact: true }).click()
  expect(write).toHaveBeenLastCalledWith(helpText())
})

test('every board on the page is a figure with its command under it', async () => {
  const screen = await mount()
  const figures = [...screen.container.querySelectorAll('figure.fw-docs-board')]
  // One under the dry run, twenty-nine in the comparisons.
  expect(figures).toHaveLength(30)
  for (const figure of figures)
    expect(figure.querySelector('pre.fw-cmd')?.textContent, figure.getAttribute('aria-label') ?? '').toMatch(
      /^deno task carve --width=\d+ --height=\d+/,
    )
})

test('in Polish the frame speaks Polish and the help does not', async () => {
  const screen = await mount()
  await act(async () => useStore.getState().lang.setLang('pl'))
  await expect.poll(() => screen.container.querySelector('#docs-knobs')?.textContent).toBe('Wszystkie pokrętła')
  expect(helpBlocks(screen.container)[0]?.textContent).toBe(helpText())
})
