import { act } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { App } from '../App'
import { loadRunDone, mountApp, resetApp } from '../harness/mountApp'
import { storedFixture } from '../state/library.fixtures'
import { useStore } from '../state/store'

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  return () => vi.restoreAllMocks()
})

const bar = () => document.querySelector('nav.fw-sheetbar')

test('the lab names its sheets Settings, CLI and Report, each controlling its panel', async () => {
  await page.viewport(375, 812)
  const screen = await mountApp('advanced')
  const nav = screen.getByRole('navigation', { name: 'Panels' })
  await expect.element(nav).toBeInTheDocument()
  const buttons = [...(bar()?.querySelectorAll('button') ?? [])]
  expect(buttons.map((b) => b.textContent)).toEqual(['Settings', 'CLI', 'Report'])
  expect(buttons.map((b) => b.getAttribute('aria-controls'))).toEqual(['settings-panel', 'run-column', 'lab-report'])
  for (const id of ['settings-panel', 'run-column', 'lab-report']) expect(document.getElementById(id)).not.toBeNull()
})

test('the saved boards name them Boards, Board and Report', async () => {
  await page.viewport(375, 812)
  // `arrange`'s idiom (LayoutInvariants.browser.test.tsx): `resetApp` pushes
  // `/` (mountApp.tsx:23), so the route goes in after it and before `render`.
  resetApp('advanced')
  window.history.pushState({}, '', '/boards')
  const screen = await render(<App />)
  await expect.element(screen.getByRole('button', { name: 'Boards', exact: true })).toBeInTheDocument()
  const buttons = [...(bar()?.querySelectorAll('button') ?? [])]
  expect(buttons.map((b) => b.textContent)).toEqual(['Boards', 'Board', 'Report'])
  expect(buttons[1]?.getAttribute('aria-controls')).toBe('board-column')
  expect(document.getElementById('board-column')).not.toBeNull()
})

test('a press opens its sheet, marks it pressed and names it on the lab panel', async () => {
  await page.viewport(375, 812)
  const screen = await mountApp('advanced')
  const cli = screen.getByRole('button', { name: 'CLI', exact: true })
  await cli.click()
  expect(useStore.getState().ui.sheet).toBe('cli')
  await expect.element(cli).toHaveAttribute('aria-pressed', 'true')
  expect(document.querySelector('.fw-lab')?.classList.contains('sheet-cli')).toBe(true)
  await cli.click()
  expect(useStore.getState().ui.sheet).toBeNull()
  expect(document.querySelector('.fw-lab')?.classList.contains('sheet-cli')).toBe(false)
})

test('closing a sheet with the focus inside it hands the focus to its button', async () => {
  await page.viewport(375, 812)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await screen.getByRole('button', { name: 'Report', exact: true }).click()
  const inside = document.getElementById('lab-report')
  if (inside === null) throw new Error('no report')
  inside.tabIndex = -1
  inside.focus()
  await userEvent.keyboard('{Escape}')
  expect(useStore.getState().ui.sheet).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Report', exact: true }).element())
})

test('the docs route has no sheet bar in view', async () => {
  await page.viewport(375, 812)
  resetApp('advanced')
  window.history.pushState({}, '', '/docs/cli')
  await render(<App />)
  const nav = bar()
  if (nav === null) throw new Error('no sheet bar')
  expect(nav.closest('main')?.hidden).toBe(true)
})

// On a phone the Boards sheet lies over the board, so picking a board closes
// it: the person picked the board to see it.
test('picking a board in the Boards sheet opens it and closes the sheet', async () => {
  await page.viewport(375, 812)
  const stored = storedFixture(1)
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    if (url.includes('/api/boards')) {
      return Promise.resolve(Response.json([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [stored.meta] }]))
    }
    if (url.includes('/store/')) return Promise.resolve(Response.json(stored.file))
    return Promise.resolve(new Response('{}', { status: 404 }))
  })
  resetApp('advanced')
  window.history.pushState({}, '', '/boards')
  const screen = await render(<App />)
  // DOM clicks, not the locator's: the listing's fetch re-renders the rows
  // while the locator waits for a stable element (harness fact 54).
  await act(async () => screen.getByRole('button', { name: 'Boards', exact: true }).element().click())
  expect(useStore.getState().ui.sheet).toBe('settings')
  await expect.poll(() => document.querySelector('.fw-brow')).not.toBeNull()
  await act(async () => document.querySelector<HTMLButtonElement>('.fw-brow')?.click())
  await expect.poll(() => location.pathname).toBe(`/boards/8x8/${stored.meta.id}`)
  expect(useStore.getState().ui.sheet).toBeNull()
})
