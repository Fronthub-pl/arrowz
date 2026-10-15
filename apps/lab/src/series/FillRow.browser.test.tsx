import { defaultParams } from '@fronthub/arrowz-engine'
import { beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import type { RunControl } from '../run/useRun'
import { useStore } from '../state/store'
import { FillRow } from './FillRow'

const control: RunControl = {
  start: vi.fn(),
  abort: vi.fn(),
  hold: vi.fn(),
  checkSeeds: vi.fn(),
  fillLibrary: vi.fn(),
}

beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
  state.series.reset()
  state.fill.reset()
  state.lang.setLang('en')
  vi.clearAllMocks()
})

test('the row starts a batch', async () => {
  await render(<FillRow control={control} />)
  await userEvent.click(page.getByRole('button', { name: 'Save many boards' }))
  expect(control.fillLibrary).toHaveBeenCalledTimes(1)
})

test('the boards field writes the slice, held to its range, and the seed limit follows it', async () => {
  await render(<FillRow control={control} />)
  await page.getByRole('button', { name: 'boards: 10' }).click()
  await userEvent.fill(page.getByRole('textbox', { name: 'boards' }), '500')
  await userEvent.keyboard('{Enter}')
  expect(useStore.getState().fill.count).toBe(200)
  await expect.element(page.getByRole('button', { name: 'max seeds: 400' })).toBeInTheDocument()
})

test('a seed limit set by hand stays when the boards change', async () => {
  await render(<FillRow control={control} />)
  await page.getByRole('button', { name: 'max seeds: 20' }).click()
  await userEvent.fill(page.getByRole('textbox', { name: 'max seeds' }), '30')
  await userEvent.keyboard('{Enter}')
  useStore.getState().fill.setCount(5)
  await expect.element(page.getByRole('button', { name: 'max seeds: 30' })).toBeInTheDocument()
})

test('while a batch runs the button is the meter and disabled', async () => {
  useStore.getState().fill.started(defaultParams(), 10, 20)
  useStore.getState().fill.saved(7, false)
  await render(<FillRow control={control} />)
  await expect.element(page.getByRole('button', { name: /Saving 1\/10/ })).toBeDisabled()
})

test('a series in flight disables the row', async () => {
  useStore.getState().series.started(defaultParams(), 20)
  await render(<FillRow control={control} />)
  await expect.element(page.getByRole('button', { name: 'Save many boards' })).toBeDisabled()
})
