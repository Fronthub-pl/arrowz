import { render } from 'vitest-browser-react'
import { beforeEach, describe, expect, it } from 'vitest'
import { defaultParams, PARAM_SPEC } from '@arrowz/engine'
import { useStore } from '../state/store'
import type { RunControl } from './useRun'
import { RunColumn } from './RunColumn'

function stub() {
  const calls = { start: 0, abort: 0 }
  const control: RunControl = { start: () => void calls.start++, abort: () => void calls.abort++, hold: () => {} }
  return { control, started: () => calls.start, aborted: () => calls.abort }
}

beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
  state.ui.setAuto(false)
  state.ui.setHelp(true)
})

describe('RunColumn', () => {
  it('is a region a screen reader can name', async () => {
    const screen = await render(<RunColumn control={stub().control} />)
    await expect.element(screen.getByRole('region', { name: 'Run' })).toBeInTheDocument()
  })

  it('starts a run from the primary action', async () => {
    const g = stub()
    const screen = await render(<RunColumn control={g.control} />)
    await screen.getByRole('button', { name: 'Generate' }).click()
    expect(g.started()).toBe(1)
  })

  it('refuses the primary action while a rule is broken, and says why', async () => {
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    const screen = await render(<RunColumn control={stub().control} />)
    const go = screen.getByRole('button', { name: 'Generate' })
    await expect.element(go).toBeDisabled()
    await expect.element(go).toHaveAttribute('title')
  })

  // Abort is not a second Generate: it is live exactly while a worker is.
  it('offers Abort only while a run is in flight', async () => {
    const g = stub()
    const screen = await render(<RunColumn control={g.control} />)
    await expect.element(screen.getByRole('button', { name: 'Abort' })).toBeDisabled()
    useStore.getState().run.started(useStore.getState().params.values)
    await expect.element(screen.getByRole('button', { name: 'Abort' })).toBeEnabled()
    await screen.getByRole('button', { name: 'Abort' }).click()
    expect(g.aborted()).toBe(1)
  })
})

describe('the alternative actions', () => {
  it('draws a new seed and runs at once', async () => {
    const g = stub()
    useStore.getState().params.setMany({ seed: 1 })
    const screen = await render(<RunColumn control={g.control} />)
    await screen.getByRole('button', { name: 'New seed' }).click()
    expect(useStore.getState().params.values.seed).not.toBe(1)
    expect(g.started()).toBe(1)
  })

  // Ruling 3: the seed came from Math.random, not from a hand, so it must not
  // look like an edit — otherwise `auto` starts a second run behind it.
  it('draws that seed through the machine path, leaving the edit count alone', async () => {
    const before = useStore.getState().params.edits
    const screen = await render(<RunColumn control={stub().control} />)
    await screen.getByRole('button', { name: 'New seed' }).click()
    expect(useStore.getState().params.edits).toBe(before)
  })

  it('puts every knob back and runs at once', async () => {
    const g = stub()
    useStore.getState().params.set('W', 77)
    const screen = await render(<RunColumn control={g.control} />)
    await screen.getByRole('button', { name: 'Defaults' }).click()
    expect(useStore.getState().params.values.W).toBe(defaultParams().W)
    expect(g.started()).toBe(1)
  })

  // This does not exercise clamping: the draw's range is a subset of the
  // knob's, so nothing here would fail if the clamp were removed. It guards
  // the literal in `reseed` from drifting past the spec; clamping itself is
  // covered where clamping lives (params.slice.test.ts, "a committed value
  // is clamped to the knob range and reported").
  it('never draws a seed the literal could put outside the knob', async () => {
    const spec = PARAM_SPEC.find((s) => s.key === 'seed')
    if (spec === undefined) throw new Error('PARAM_SPEC has no seed')
    const screen = await render(<RunColumn control={stub().control} />)
    for (let i = 0; i < 20; i++) await screen.getByRole('button', { name: 'New seed' }).click()
    const seed = useStore.getState().params.values.seed
    expect(seed).toBeGreaterThanOrEqual(spec.min)
    expect(seed).toBeLessThanOrEqual(spec.max)
  })

  // Neither button is disabled by a broken rule, and neither should be: the
  // point of Defaults is to escape one. New seed cannot, and says so through
  // the status line rather than through a dead button (Ruling 13).
  it('leaves Defaults usable while a rule is broken, and it clears the rule', async () => {
    const g = stub()
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    const screen = await render(<RunColumn control={g.control} />)
    await screen.getByRole('button', { name: 'Defaults' }).click()
    expect(useStore.getState().params.violations).toHaveLength(0)
    expect(g.started()).toBe(1)
  })
})
