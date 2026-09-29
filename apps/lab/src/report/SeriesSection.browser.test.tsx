import { defaultParams } from '@arrowz/engine'
import type { SeedRun } from '@arrowz/engine'
import { beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import type { RunControl } from '../run/useRun'
import { useStore } from '../state/store'
import { SeriesSection } from './SeriesSection'

const control: RunControl = { start: vi.fn(), abort: vi.fn(), hold: vi.fn(), checkSeeds: vi.fn() }

const runs: SeedRun[] = [
  { seed: 10, outcome: 'complete', pieces: 10, maxLen: 20, genMs: 5, remaining: 0 },
  { seed: 11, outcome: 'incomplete', pieces: 9, maxLen: 9, genMs: 9, remaining: 312 },
]

function seriesDone(params = { ...defaultParams(), seed: 10 }) {
  const s = useStore.getState().series
  s.started(params, 2)
  for (const run of runs) s.answered(run)
  s.finished()
}

beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.series.reset()
  state.lang.setLang('en')
  vi.clearAllMocks()
})

test('with no series there is no section', async () => {
  const screen = await render(<SeriesSection control={control} />)
  expect(screen.container.textContent).toBe('')
})

test('the first line counts every outcome', async () => {
  seriesDone()
  await render(<SeriesSection control={control} />)
  await expect.element(page.getByText('Complete on 1 of 2 · incomplete 1 · unsolvable 0 · stopped 0')).toBeVisible()
})

// A failed seed reopens under the series' own knobs, not the ones on screen,
// or the board shown is not the one that failed.
test('a failed seed opens as a normal run under the series knobs', async () => {
  seriesDone({ ...defaultParams(), W: 30, seed: 10 })
  useStore.getState().params.set('W', 12)
  await render(<SeriesSection control={control} />)
  await userEvent.click(page.getByRole('button', { name: 'seed 11 — incomplete, 312 cells left' }))
  expect(useStore.getState().params.values.W).toBe(30)
  expect(useStore.getState().params.values.seed).toBe(11)
  expect(control.start).toHaveBeenCalledTimes(1)
})

test('after a knob edit the section says it is for other settings', async () => {
  seriesDone()
  useStore.getState().params.set('W', 33)
  await render(<SeriesSection control={control} />)
  await expect.element(page.getByText(/for other settings/)).toBeVisible()
})

// A worker crash before any answer must still be told, not render an empty section.
test('a series that fails before any answer shows the failure, not nothing', async () => {
  const s = useStore.getState().series
  s.started({ ...defaultParams(), seed: 10 }, 2)
  s.finished('boom')
  await render(<SeriesSection control={control} />)
  await expect.element(page.getByText('The seeds could not be checked: boom')).toBeVisible()
})

// Mid-series, a failed seed's row already shows; its button must not rewrite
// the knobs under the series still running.
test('a failed seed button is disabled while its series is still running', async () => {
  const s = useStore.getState().series
  s.started({ ...defaultParams(), seed: 10 }, 2)
  s.answered(runs[1] as SeedRun)
  const screen = await render(<SeriesSection control={control} />)
  const button = screen.getByRole('button', { name: 'seed 11 — incomplete, 312 cells left' })
  await expect.element(button).toBeDisabled()
  await userEvent.click(button, { force: true })
  expect(control.start).not.toHaveBeenCalled()
})

test('the mean time carries its unit', async () => {
  seriesDone()
  await render(<SeriesSection control={control} />)
  await expect.element(page.getByText('0 s')).toBeVisible()
})

test('an unsolvable seed drops the cells-left clause', async () => {
  const s = useStore.getState().series
  s.started({ ...defaultParams(), seed: 10 }, 1)
  s.answered({ seed: 20, outcome: 'unsolvable', pieces: 5, maxLen: 5, genMs: 1, remaining: 0 })
  s.finished()
  await render(<SeriesSection control={control} />)
  await expect.element(page.getByText('seed 20 — unsolvable')).toBeVisible()
})

test('one cell left is worded in the singular', async () => {
  const s = useStore.getState().series
  s.started({ ...defaultParams(), seed: 10 }, 1)
  s.answered({ seed: 21, outcome: 'incomplete', pieces: 5, maxLen: 5, genMs: 1, remaining: 1 })
  s.finished()
  await render(<SeriesSection control={control} />)
  await expect.element(page.getByText('seed 21 — incomplete, 1 cell left')).toBeVisible()
})

// Two of two so far read complete; the tone still says nothing until the series is done.
test('the head line carries no tone while the series still runs', async () => {
  const s = useStore.getState().series
  s.started({ ...defaultParams(), seed: 10 }, 2)
  s.answered(runs[0] as SeedRun)
  const screen = await render(<SeriesSection control={control} />)
  const head = screen.getByText('Complete on 1 of 1 · incomplete 0 · unsolvable 0 · stopped 0')
  await expect.element(head).toBeVisible()
  expect(head.element().className).toBe('fw-series-head')
})
