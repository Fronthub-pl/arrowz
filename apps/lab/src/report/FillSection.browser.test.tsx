import { defaultParams } from '@fronthub/arrowz-engine'
import type { SeedRun } from '@fronthub/arrowz-engine'
import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { FillSection } from './FillSection'

const fill = () => useStore.getState().fill
const run = (seed: number, outcome: SeedRun['outcome'] = 'complete'): SeedRun => ({
  seed,
  outcome,
  pieces: 1,
  maxLen: 2,
  genMs: 3,
  remaining: outcome === 'complete' ? 0 : 4,
})

beforeEach(() => {
  fill().reset()
  useStore.getState().lang.setLang('en')
})

test('with no batch there is no section', async () => {
  const screen = await render(<FillSection />)
  expect(screen.container.querySelector('section')).toBeNull()
})

test('a batch that wrote every board says so in the good tone', async () => {
  fill().started(defaultParams(), 2, 4)
  fill().answered(run(1))
  fill().saved(1, false)
  fill().answered(run(2))
  fill().saved(2, false)
  fill().finished()
  const screen = await render(<FillSection />)
  const head = screen.getByText('Saved 2 of 2 boards · 2 seeds tried')
  await expect.element(head).toBeInTheDocument()
  expect(head.element().className).toBe('fw-series-head ok')
})

test('a batch that ran out of seeds names its limit and the seeds it skipped', async () => {
  fill().started(defaultParams(), 3, 4)
  fill().answered(run(1))
  fill().saved(1, false)
  fill().answered(run(2, 'incomplete'))
  fill().answered(run(3))
  fill().saved(3, true)
  fill().answered(run(4, 'unsolvable'))
  fill().finished()
  const screen = await render(<FillSection />)
  const head = screen.getByText('Saved 1 of 3 boards · 4 seeds tried')
  await expect.element(head).toBeInTheDocument()
  expect(head.element().className).toBe('fw-series-head warn')
  await expect.element(screen.getByText('stopped at the limit of 4 seeds')).toBeInTheDocument()
  await expect.element(screen.getByText('seeds not complete, skipped: 2, 4')).toBeInTheDocument()
  await expect.element(screen.getByText('seeds whose layout is already stored, skipped: 3')).toBeInTheDocument()
})

test('a store failure is told, in the bad tone when nothing was written', async () => {
  fill().started(defaultParams(), 2, 4)
  fill().finished({ kind: 'store', message: 'Failed to fetch' })
  const screen = await render(<FillSection />)
  await expect
    .element(screen.getByText('The store did not take a board, so saving stopped: Failed to fetch'))
    .toBeInTheDocument()
  expect(screen.getByText('Saved 0 of 2 boards · 0 seeds tried').element().className).toBe('fw-series-head error')
})

// One of two written so far: the tone would call the batch half-failed while it is still going.
test('the head line carries no tone while the batch still runs', async () => {
  fill().started(defaultParams(), 2, 4)
  fill().answered(run(1))
  fill().saved(1, false)
  const screen = await render(<FillSection />)
  const head = screen.getByText('Saved 1 of 2 boards · 1 seed tried')
  await expect.element(head).toBeInTheDocument()
  expect(head.element().className).toBe('fw-series-head')
})
