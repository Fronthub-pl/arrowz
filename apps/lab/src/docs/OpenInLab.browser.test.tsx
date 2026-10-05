import { expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { App } from '../App'
import { resetApp } from '../harness/mountApp'
import { useStore } from '../state/store'
import { decodeHash } from '../state/url'
import '../design/index.css'

const LABEL = 'Open in lab: A 40 by 40 board'

// The Arrowz page's first board is in view on arrival: no scrolling to reach it.
test('Open in lab lands on the lab with the board’s settings and generates it', async () => {
  await page.viewport(1280, 800)
  resetApp('simple')
  history.replaceState(null, '', '/docs/arrowz')
  const screen = await render(<App />)
  await screen.getByRole('button', { name: LABEL }).click()
  await expect.poll(() => location.pathname).toBe('/')
  const { values } = useStore.getState().params
  expect([values.W, values.H, values.seed]).toEqual([40, 40, 7])
  await expect.poll(() => decodeHash(location.hash)?.params.W).toBe(40)
  await expect.poll(() => useStore.getState().result.shown?.params.W).toBe(40)
}, 40_000)

test('Open in lab waits while a series runs, as the palette row does', async () => {
  await page.viewport(1280, 800)
  resetApp('advanced')
  history.replaceState(null, '', '/docs/arrowz')
  const screen = await render(<App />)
  useStore.setState((state) => ({ series: { ...state.series, phase: 'running' } }))
  await expect.element(screen.getByRole('button', { name: LABEL })).toBeDisabled()
}, 40_000)
