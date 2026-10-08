import { act } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { renderAt } from '../harness/renderAt'
import { createUiSlice, DOCS_TABS_KEY } from '../state/ui.slice'
import { useStore } from '../state/store'
import { DocsMarkdown } from './DocsMarkdown'
import { parseDocs } from './markdown'
import { TAB_GROUPS } from './tabs'
// The narrow-width case measures the strip's own scrolling, which only the sheets give it.
import '../design/index.css'

/** One framework group; the React tab holds a named and an unnamed block, the rest one line each. */
const group = (word: string) =>
  [
    '::::tabs{group="framework"}',
    ...TAB_GROUPS.framework.map((tab) =>
      tab.id === 'react'
        ? `:::tab{id="react"}\n${word} react.\n\n\`\`\`ts a.d.ts\nconst a = 1\n\`\`\`\n\n\`\`\`tsx\nconst b = 2\n\`\`\`\n:::`
        : `:::tab{id="${tab.id}"}\n${word} ${tab.id}.\n:::`,
    ),
    '::::',
  ].join('\n')

const PAGE = parseDocs(['# T', '## Part {#part}', group('one'), 'Between.', group('two')].join('\n\n'))

// `.fw-docs` as on the page: its paragraph rule competes with the caption's.
const mount = (width?: number) =>
  renderAt(
    <section className="fw-docs">
      <div className="fw-docs-body" style={width === undefined ? undefined : { width: `${width}px` }}>
        <DocsMarkdown root={PAGE} />
      </div>
    </section>,
  )

const selected = (container: HTMLElement) =>
  [...container.querySelectorAll('[role="tab"][aria-selected="true"]')].map((tab) => tab.textContent)

beforeEach(() => {
  localStorage.clear()
  useStore.setState(useStore.getInitialState(), true)
  useStore.getState().lang.setLang('en')
})
afterEach(() => vi.restoreAllMocks())

test('each group is a tablist named Framework, five tabs, the first chosen', async () => {
  const screen = await mount()
  const lists = [...screen.container.querySelectorAll('[role="tablist"]')]
  expect(lists).toHaveLength(2)
  for (const list of lists) {
    expect(list.getAttribute('aria-label')).toBe('Framework')
    expect([...list.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual([
      'HTML',
      'Angular',
      'React',
      'Vue',
      'Svelte',
    ])
  }
  expect(selected(screen.container)).toEqual(['HTML', 'HTML'])
})

test('only the chosen panel is in the document, labelled by its tab', async () => {
  const screen = await mount()
  const panels = [...screen.container.querySelectorAll('[role="tabpanel"]')]
  expect(panels.map((panel) => panel.textContent)).toEqual(['one html.', 'two html.'])
  for (const panel of panels) {
    const tab = document.getElementById(panel.getAttribute('aria-labelledby') ?? '')
    expect(tab?.getAttribute('aria-selected')).toBe('true')
    expect(tab?.getAttribute('aria-controls')).toBe(panel.id)
  }
  expect(screen.container.querySelectorAll('[role="tab"][aria-controls]')).toHaveLength(2)
  // A panel with no control of its own is a Tab stop, so the keyboard reaches its text.
  for (const panel of panels) expect(panel.getAttribute('tabindex')).toBe('0')
})

test('every id on the page is unique, and each panel belongs to its own group', async () => {
  const screen = await mount()
  const ids = [...screen.container.querySelectorAll('[id]')].map((el) => el.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const panel of screen.container.querySelectorAll('[role="tabpanel"]')) {
    const tab = document.getElementById(panel.getAttribute('aria-labelledby') ?? '')
    expect(tab?.closest('.fw-docs-tabs')).toBe(panel.closest('.fw-docs-tabs'))
  }
})

// Unhandled, an arrow key would scroll the page sideways under the strip.
test("an arrow key on a tab is the strip's, not the page's", async () => {
  const screen = await mount()
  const tab = screen.container.querySelector<HTMLElement>('[role="tab"]')
  if (tab === null) throw new Error('no tab')
  const key = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
  await act(async () => tab.dispatchEvent(key))
  expect(key.defaultPrevented).toBe(true)
})

test('choosing a tab in one group chooses it in every group', async () => {
  const screen = await mount()
  await screen.getByRole('tab', { name: 'React' }).last().click()
  await expect.poll(() => selected(screen.container)).toEqual(['React', 'React'])
  expect(screen.container.textContent).toContain('one react.')
  expect(screen.container.textContent).toContain('two react.')
})

test('the arrows move the choice and the focus and wrap, Home and End jump', async () => {
  const screen = await mount()
  const first = screen.getByRole('tab', { name: 'HTML' }).first()
  await first.click()
  await userEvent.keyboard('{ArrowLeft}')
  await expect.element(screen.getByRole('tab', { name: 'Svelte' }).first()).toHaveFocus()
  expect(selected(screen.container)).toEqual(['Svelte', 'Svelte'])
  await userEvent.keyboard('{Home}')
  await expect.element(screen.getByRole('tab', { name: 'HTML' }).first()).toHaveFocus()
  await userEvent.keyboard('{End}')
  await expect.element(screen.getByRole('tab', { name: 'Svelte' }).first()).toHaveFocus()
  await userEvent.keyboard('{ArrowRight}')
  await expect.element(screen.getByRole('tab', { name: 'HTML' }).first()).toHaveFocus()
  // The other group follows the choice, never the focus.
  expect(document.activeElement?.closest('[role="tablist"]')).toBe(
    screen.container.querySelectorAll('[role="tablist"]')[0],
  )
})

test('only the chosen tab is in the tab order', async () => {
  const screen = await mount()
  const list = screen.container.querySelector('[role="tablist"]')
  expect([...(list?.querySelectorAll('[role="tab"]') ?? [])].map((tab) => tab.getAttribute('tabindex'))).toEqual([
    '0',
    '-1',
    '-1',
    '-1',
    '-1',
  ])
})

test('the choice is remembered for the next visit', async () => {
  const screen = await mount()
  await screen.getByRole('tab', { name: 'Vue' }).first().click()
  await expect.poll(() => localStorage.getItem(DOCS_TABS_KEY)).toBe('{"framework":"vue"}')
  // A store made now reads what the next page load would.
  expect(createUiSlice(() => {}).docsTabs).toEqual({ framework: 'vue' })
})

test('a block is captioned and copied by its file name, or by its section and tab', async () => {
  const write = vi.fn(() => Promise.resolve())
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText: write } as unknown as Clipboard)
  const screen = await mount()
  await screen.getByRole('tab', { name: 'React' }).first().click()
  await expect.element(screen.getByRole('button', { name: 'Copy: a.d.ts' }).first()).toBeVisible()
  await expect.element(screen.getByRole('button', { name: 'Copy: Part, React' }).first()).toBeVisible()
  expect([...screen.container.querySelectorAll('.fw-docs-file')].map((p) => p.textContent)).toEqual([
    'a.d.ts',
    'a.d.ts',
  ])
  const caption = screen.container.querySelector('.fw-docs-file')
  if (caption === null) throw new Error('no caption')
  expect(getComputedStyle(caption).marginBottom).toBe('6px')
  expect(getComputedStyle(caption).fontSize).toBe('12px')
  await screen.getByRole('button', { name: 'Copy: a.d.ts' }).first().click()
  expect(write).toHaveBeenCalledWith('const a = 1')
})

test('Copy names its tab in Polish too', async () => {
  useStore.getState().lang.setLang('pl')
  const screen = await mount()
  await act(async () => useStore.getState().ui.setDocsTab('framework', 'react'))
  await expect.element(screen.getByRole('button', { name: 'Kopiuj: Part, React' }).first()).toBeVisible()
})

// 200 px is narrower than the five labels: the strip must scroll, the page must not.
test('at a narrow width the strip scrolls by itself and the page does not', async () => {
  const screen = await mount(200)
  const body = screen.container.querySelector<HTMLElement>('.fw-docs-body')
  const strip = screen.container.querySelector<HTMLElement>('[role="tablist"]')
  if (body === null || strip === null) throw new Error('no body or strip')
  expect(strip.scrollWidth).toBeGreaterThan(strip.clientWidth)
  expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth)
})
