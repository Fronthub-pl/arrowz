import { defaultParams } from '@arrowz/engine'
import { beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import type { RunControl } from '../run/useRun'
import { useStore } from '../state/store'
import { SeriesRow } from './SeriesRow'

const control: RunControl = { start: vi.fn(), abort: vi.fn(), hold: vi.fn(), checkSeeds: vi.fn() }

beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
  state.series.reset()
  state.lang.setLang('en')
  vi.clearAllMocks()
})

test('the row starts a series', async () => {
  await render(<SeriesRow control={control} />)
  await userEvent.click(page.getByRole('button', { name: 'Check seeds' }))
  expect(control.checkSeeds).toHaveBeenCalledTimes(1)
})

test('the count field writes the slice, held to its range', async () => {
  await render(<SeriesRow control={control} />)
  await page.getByRole('button', { name: 'seeds: 20' }).click()
  await userEvent.fill(page.getByRole('textbox', { name: 'seeds' }), '500')
  await userEvent.keyboard('{Enter}')
  expect(useStore.getState().series.count).toBe(200)
})

test('while a series runs the button is the meter and disabled', async () => {
  useStore.getState().series.started(defaultParams(), 20)
  useStore.getState().series.answered({ seed: 7, outcome: 'complete', pieces: 1, maxLen: 1, genMs: 1, remaining: 0 })
  await render(<SeriesRow control={control} />)
  const button = page.getByRole('button', { name: /Checking 1\/20/ })
  await expect.element(button).toBeDisabled()
})

test('a run in flight disables the row', async () => {
  useStore.getState().run.started(defaultParams())
  await render(<SeriesRow control={control} />)
  await expect.element(page.getByRole('button', { name: 'Check seeds' })).toBeDisabled()
})
