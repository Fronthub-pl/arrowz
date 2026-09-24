import { PARAM_SPEC } from '@arrowz/engine'
import { PRESETS } from '@arrowz/engine/presets'
import { exportCell } from '@arrowz/engine/simple'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import type { RunControl } from './useRun'
import { applyPreset, defaults, generate, reseed, stepSeed } from './actions'

function fakeControl(): RunControl & { started: number } {
  const control = {
    started: 0,
    start: () => {
      control.started += 1
    },
    abort: () => {},
    hold: () => {},
  }
  return control
}

beforeEach(() => {
  // Reset via setState, not via a slice action: a reset that calls the action
  // under test hides that action's bugs.
  useStore.setState((state) => ({ ui: { ...state.ui, mode: 'advanced', auto: false } }))
  useStore.getState().params.reset()
})

describe('the run actions, which the column and the palette share', () => {
  it('generates from the knobs as they stand', () => {
    const control = fakeControl()
    generate(control)
    expect(control.started).toBe(1)
  })

  it('draws a new seed and runs', () => {
    const control = fakeControl()
    const before = useStore.getState().params.values.seed
    reseed(control)
    expect(useStore.getState().params.values.seed).not.toBe(before)
    expect(control.started).toBe(1)
  })

  it('puts every knob back and runs', () => {
    const control = fakeControl()
    useStore.getState().params.set('W', 42)
    defaults(control)
    expect(useStore.getState().params.values.W).not.toBe(42)
    expect(control.started).toBe(1)
  })

  it('steps the seed by one in each direction and runs each time', () => {
    const control = fakeControl()
    useStore.getState().params.setMany({ seed: 100 })
    stepSeed(control, 1)
    expect(useStore.getState().params.values.seed).toBe(101)
    stepSeed(control, -1)
    expect(useStore.getState().params.values.seed).toBe(100)
    expect(control.started).toBe(2)
  })

  it('stops at the bounds the engine has, rather than wrapping', () => {
    const control = fakeControl()
    useStore.getState().params.setMany({ seed: 0 })
    stepSeed(control, -1)
    expect(useStore.getState().params.values.seed).toBe(0)
    useStore.getState().params.setMany({ seed: 2 ** 32 - 1 })
    stepSeed(control, 1)
    expect(useStore.getState().params.values.seed).toBe(2 ** 32 - 1)
  })

  // The chip and the palette row are the same action, so it is one function.
  // Every knob is written, not only the ones the option names.
  it('writes a whole preset, follows it with the export cell size, and runs', () => {
    const control = fakeControl()
    useStore.getState().params.set('giantStep', 3)
    const option = PRESETS[0]?.options[0]
    expect(option).toBeDefined()
    if (option === undefined) return
    applyPreset(control, option.params)
    const values = useStore.getState().params.values
    expect(values.W).toBe(option.params.W)
    // A knob the option does not name goes back to its default rather than
    // surviving from the previous experiment.
    const giantStep = PARAM_SPEC.find((spec) => spec.key === 'giantStep')
    expect(values.giantStep).toBe(giantStep?.def)
    expect(useStore.getState().view.cell).toBe(exportCell(values.W, values.H))
    expect(control.started).toBe(1)
  })

  // The machine path must not also wake auto-generate, or one press would
  // carve twice: once here, once 350 ms later.
  it('leaves the edit counter alone, so auto-generate does not fire a second run', () => {
    const control = fakeControl()
    const before = useStore.getState().params.edits
    stepSeed(control, 1)
    reseed(control)
    expect(useStore.getState().params.edits).toBe(before)
  })
})
