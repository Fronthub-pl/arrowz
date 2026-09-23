import { act, StrictMode } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { App } from '../App'
import { loadRunDone, mountApp, resetApp } from '../harness/mountApp'
import { useStore } from '../state/store'

const ui = () => useStore.getState().ui

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  return () => vi.restoreAllMocks()
})

// Review Focus 1: narrowing past 1024 takes the drawer out of the board's
// way without forgetting the desktop's choice; widening puts it back.
test('the drawer closes below 1024 and comes back on widening', async () => {
  await page.viewport(1400, 900)
  await mountApp('advanced')
  await loadRunDone()
  expect(ui().settings).toBe(true)
  await page.viewport(900, 900)
  await expect.poll(() => ui().settings).toBe(false)
  expect(localStorage.getItem('labSettings')).toBe('open')
  await page.viewport(1400, 900)
  await expect.poll(() => ui().settings).toBe(true)
})

test('a band change closes the sheet and the menu', async () => {
  await page.viewport(600, 900)
  await mountApp('advanced')
  await loadRunDone()
  await act(async () => {
    ui().setSheet('cli')
    ui().setMenu(true)
  })
  await page.viewport(375, 812)
  // Same band (XS): nothing moves.
  expect(ui().sheet).toBe('cli')
  await page.viewport(900, 900)
  await expect.poll(() => ui().sheet).toBeNull()
  expect(ui().menu).toBe(false)
})

// StrictMode runs the mount effect twice; the second pass is not a change.
test('mounting under StrictMode is not a band change', async () => {
  await page.viewport(900, 900)
  resetApp('advanced')
  await act(async () => ui().setSheet('report'))
  await render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  await loadRunDone()
  expect(ui().settings).toBe(true)
  expect(ui().sheet).toBe('report')
})

// Review Focus 2: at XS the drawers exist only as sheets.
test('at XS r and s toggle sheets, and Escape closes a sheet and nothing else', async () => {
  await page.viewport(375, 812)
  await mountApp('advanced')
  await loadRunDone()
  await act(async () => ui().setReport(true))
  await userEvent.keyboard('s')
  expect(ui().sheet).toBe('settings')
  await userEvent.keyboard('r')
  expect(ui().sheet).toBe('report')
  await userEvent.keyboard('r')
  expect(ui().sheet).toBeNull()
  await userEvent.keyboard('s')
  await userEvent.keyboard('{Escape}')
  expect(ui().sheet).toBeNull()
  await userEvent.keyboard('{Escape}')
  expect(ui().report).toBe(true)
  expect(ui().settings).toBe(true)
})

test('above XS Escape closes an open sheet before the report', async () => {
  await page.viewport(1400, 900)
  await mountApp('advanced')
  await loadRunDone()
  await act(async () => {
    ui().setReport(true)
    ui().setSheet('cli')
  })
  await userEvent.keyboard('{Escape}')
  expect(ui().sheet).toBeNull()
  expect(ui().report).toBe(true)
  await userEvent.keyboard('{Escape}')
  expect(ui().report).toBe(false)
})

test('the root carries menu-open while the menu is open', async () => {
  await page.viewport(375, 812)
  const screen = await mountApp('advanced')
  await act(async () => ui().setMenu(true))
  expect(screen.container.querySelector('.fw')?.classList.contains('menu-open')).toBe(true)
  await act(async () => ui().setMenu(false))
  expect(screen.container.querySelector('.fw')?.classList.contains('menu-open')).toBe(false)
})
