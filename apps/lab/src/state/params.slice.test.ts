import { defaultParams, PARAM_SPEC, straightFloor } from '@arrowz/engine'
import { MIX_START, START } from '@arrowz/engine/command'
import { beforeEach, describe, expect, it, test } from 'vitest'
import { createParamsSlice, type ParamsState } from './params.slice'
import { useStore } from './store'

const params = () => useStore.getState().params

function reset() {
  params().reset()
}

test('the slice starts at the engine defaults, with nothing broken', () => {
  reset()
  expect(params().values).toEqual(defaultParams())
  expect(params().violations).toEqual([])
  expect(params().broken.pStraight).toBeUndefined()
})

test('a committed value is clamped to the knob range and reported', () => {
  reset()
  expect(params().set('W', 5000)).toBe(true)
  expect(params().values.W).toBe(1000)
  expect(params().set('W', 300)).toBe(false)
  expect(params().values.W).toBe(300)
})

test('a value off the step grid snaps, because the engine refuses one that does not', () => {
  reset()
  // maxBack steps by 50 from 50; 237 is between two settings.
  expect(params().set('maxBack', 237)).toBe(true)
  expect(params().values.maxBack % 50).toBe(0)
})

test('a broken cross-knob rule names every knob it reads', () => {
  reset()
  params().setMany({ wShort: 0.8, wMid: 0.8 })
  const names = Object.keys(params().broken)
  expect(names).toContain('wShort')
  expect(names).toContain('wMid')
  expect(params().violations.length).toBeGreaterThan(0)
})

test('an untouched knob keeps `undefined`, so its selector does not rerender', () => {
  reset()
  params().setMany({ wShort: 0.8, wMid: 0.8 })
  // Not an empty array: an empty array is a fresh identity on every recompute.
  expect(params().broken.warns).toBeUndefined()
  expect(params().inactive.warns).toBeUndefined()
})

test('a valid board reuses one empty violations array', () => {
  reset()
  const first = params().violations
  params().set('W', 120)
  expect(params().violations).toBe(first)
})

test('the straightness floor is published as a number, for the marker', () => {
  reset()
  params().setMany({ W: 900, H: 900 })
  expect(params().floor.pStraight).toBe(straightFloor(params().values))
  expect(params().floor.pStraight).toBeGreaterThan(0.6)
})

test('the floor is a bound, not a clamp: the knob keeps the value that breaks it', () => {
  reset()
  params().setMany({ W: 900, H: 900, pStraight: 0.6 })
  expect(params().values.pStraight).toBe(0.6)
  expect(params().broken.pStraight?.length).toBeGreaterThan(0)
})

test('the inactive index carries the reason the engine gives', () => {
  reset()
  // The serpentine knobs do nothing while there is no skeleton.
  expect(params().values.giants).toBe(0)
  expect(params().inactive.giantSpan).toBe('skeletonOff')
  params().set('giants', 4)
  expect(params().inactive.giantSpan).toBeUndefined()
})

test('a start word writes both knobs behind --start', () => {
  reset()
  params().setStart('tunnels')
  expect(params().values).toMatchObject(START.words.tunnels)
  params().setStart('layers')
  expect(params().values).toMatchObject(START.words.layers)
})

test('mixing keeps a share already in range and otherwise takes the middle', () => {
  reset()
  params().setStart('mixing')
  expect(params().values.headBias).toBe(0)
  expect(params().values.mix).toBe(MIX_START)
  params().set('mix', 0.4)
  params().setStart('mixing')
  expect(params().values.mix).toBe(0.4)
})

test('every knob in PARAM_SPEC can be committed by key', () => {
  reset()
  // A knob the slice cannot write is a knob the console cannot draw; this is
  // cheaper than twenty-eight assertions that drift from the table.
  for (const spec of PARAM_SPEC) {
    params().set(spec.key, spec.def)
    expect(params().values[spec.key]).toBe(spec.def)
  }
})

describe('the edit counter behind auto-generate', () => {
  // `edits` only grows (`reset` leaves it alone), so the shared store would
  // carry a count in from earlier cases; a fresh slice starts at 0.
  let params: () => ParamsState

  beforeEach(() => {
    const store: { params: ParamsState } = {
      params: createParamsSlice((fn) => Object.assign(store, fn(store))),
    }
    params = () => store.params
  })

  it('counts a knob a person committed', () => {
    expect(params().edits).toBe(0)
    params().set('W', 30)
    params().set('H', 40)
    expect(params().edits).toBe(2)
  })

  it('counts the start control, which writes two knobs through one surface', () => {
    params().setStart('tunnels')
    expect(params().edits).toBe(1)
  })

  it('counts the mixing arm of the start control too', () => {
    params().setStart('mixing')
    expect(params().edits).toBe(1)
  })

  it('counts a clamped commit — the knob moved, whatever the value asked for', () => {
    params().set('W', 100000)
    expect(params().edits).toBe(1)
  })

  // A preset, Defaults, New seed and a link start their own run; bumping this
  // would make `auto` start a second one 350 ms later and kill the first.
  it('does not count what a preset, Defaults or a link applied', () => {
    params().setMany({ W: 30, H: 40 })
    params().reset()
    expect(params().edits).toBe(0)
  })
})
