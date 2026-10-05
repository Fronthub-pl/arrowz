import { THEMES } from '@arrowz/engine'
import {
  ELEMENT_CLASSES,
  ELEMENT_CONSTANTS,
  ELEMENT_EVENTS,
  ELEMENT_FUNCTIONS,
  ELEMENT_MEMBERS,
  ELEMENT_PROPS,
  ELEMENT_SLOTS,
  ELEMENT_TYPES,
} from '@arrowz/engine/docs'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { contrast, parse } from '../design/contrast'
import { silentQueue } from '../harness/docsWorkers'
import { useStore } from '../state/store'
import { docsPage } from './content'
import { DocsBoardsProvider } from './DocsBoards'
import { DocsPageView } from './DocsPageView'
// The colour cases below read computed style, which a component test only has
// with the sheets imported.
import '../design/index.css'

beforeEach(() => useStore.getState().lang.setLang('en'))
afterEach(() => vi.restoreAllMocks())

// The page's prose and tables: its boards wait on a worker that never answers.
const mount = () =>
  render(
    <MemoryRouter initialEntries={['/docs/element']}>
      <div className="fw-docs-body">
        <DocsBoardsProvider root={null} queue={silentQueue()}>
          <DocsPageView page="element" />
        </DocsBoardsProvider>
      </div>
    </MemoryRouter>,
  )

const firstCode = docsPage('en', 'element').root.children.find((node) => node.type === 'code')
const EXAMPLE = firstCode?.type === 'code' ? firstCode.value : ''

const SECTIONS = [
  'example',
  'props',
  'members',
  'events',
  'controls',
  'zoom',
  'size',
  'margin',
  'dots',
  'track',
  'slots',
  'play',
  'themes',
  'webgl',
  'exports',
]

// `querySelectorAll` hands back `Element`, which has no `cells`: the generic is not decoration.
const rowFor = (container: HTMLElement, key: string) =>
  [...container.querySelectorAll<HTMLTableRowElement>('tbody tr')].find((tr) => tr.cells[0]?.textContent === key)

const DESCRIBED =
  ELEMENT_PROPS.length +
  ELEMENT_MEMBERS.length +
  ELEMENT_EVENTS.length +
  ELEMENT_SLOTS.length +
  ELEMENT_TYPES.length +
  ELEMENT_FUNCTIONS.length +
  ELEMENT_CONSTANTS.length +
  ELEMENT_CLASSES.length

test('the page has its fifteen sections, in order', async () => {
  const screen = await mount()
  expect([...screen.container.querySelectorAll('h3')].map((h) => h.id)).toEqual(SECTIONS.map((id) => `docs-${id}`))
})

test('every documented row reaches the page, the themes included', async () => {
  const screen = await mount()
  expect(screen.container.querySelectorAll('tbody tr')).toHaveLength(DESCRIBED + Object.keys(THEMES).length)
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
// The last cell of every row but the themes', which have no description.
const described = (container: HTMLElement) =>
  [...container.querySelectorAll('table:not([aria-labelledby="docs-themes"]) tbody td:last-child')].map(
    (c) => c.textContent,
  )

test('a language switch changes every description and leaves every machine cell', async () => {
  const screen = await mount()
  const before = machine(screen.container)
  const helpBefore = described(screen.container)
  expect(helpBefore).toHaveLength(DESCRIBED)
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

test('the page no longer sends the reader to the README', async () => {
  const screen = await mount()
  expect(screen.container.querySelector('aside.fw-docs-info')).toBeNull()
  expect(screen.container.textContent).not.toContain('README')
})

test('the slot table follows its lead paragraph, in both languages', async () => {
  const screen = await mount()
  const lead = () => screen.container.querySelector('table[aria-labelledby="docs-slots"]')?.previousElementSibling
  expect(lead()?.tagName).toBe('P')
  const english = lead()?.textContent
  await act(async () => useStore.getState().lang.setLang('pl'))
  expect(lead()?.tagName).toBe('P')
  expect(lead()?.textContent).not.toBe(english)
})

test('the margin, the dot grid and the themes are compared on live boards', async () => {
  const screen = await mount()
  const commands = (id: string) => {
    const heading = screen.container.querySelector(`#docs-${id}`)
    const out: string[] = []
    for (let el = heading?.nextElementSibling; el && el.tagName !== 'H3'; el = el.nextElementSibling)
      for (const pre of el.querySelectorAll('figure.fw-docs-board pre.fw-cmd')) out.push(pre.textContent ?? '')
    return out
  }
  const base = 'deno task carve --width=12 --height=12 --seed=7'
  expect(commands('margin')).toEqual([`${base} --pad=0`, base, `${base} --pad=16`])
  expect(commands('dots')).toEqual([`${base} --points`, `${base} --points --line=0.2 --point-radius=0.15`])
  expect(commands('themes')).toEqual([
    `${base} --theme=gruvbox-dark --colored`,
    `${base} --theme=catppuccin-latte --colored`,
    `${base} --theme=rose-pine-moon --colored`,
  ])
  expect(screen.container.querySelectorAll('figure.fw-docs-board')).toHaveLength(8)
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
  expect(token(at('themeOf'), 1, 'fn').text).toBe('themeOf')
  expect(token(at('PAD_RANGE'), 1, 'num').text).toBe('0')
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
