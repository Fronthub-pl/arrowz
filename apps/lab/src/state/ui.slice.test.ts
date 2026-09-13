import { PARAM_SPEC } from '@arrowz/engine'
import { describe, expect, it, test } from 'vitest'
import { createUiSlice, RAIL_GROUPS, type UiState } from './ui.slice'
import { useStore } from './store'

test('the rail opens on the board group, as the old lab does', () => {
  expect(useStore.getState().ui.entry).toBe('board')
})

test('selecting an entry keeps it', () => {
  useStore.getState().ui.select('preview')
  expect(useStore.getState().ui.entry).toBe('preview')
  useStore.getState().ui.select('board')
})

test('the rail lists every group PARAM_SPEC uses, in the table order', () => {
  // Derived, not typed by hand: a seventh group added to the engine must show
  // up in the console rather than hiding its knobs.
  const fromSpec = [...new Set(PARAM_SPEC.map((s) => s.group))]
  expect([...RAIL_GROUPS]).toEqual(fromSpec)
})

describe('the switches the run column owns', () => {
  function slice() {
    const store: { ui: UiState } = { ui: createUiSlice((fn) => Object.assign(store, fn(store))) }
    return store
  }

  it('starts with auto off and help on, as the old lab does', () => {
    const store = slice()
    expect(store.ui.auto).toBe(false)
    expect(store.ui.help).toBe(true)
    expect(store.ui.clamped).toBe(false)
  })

  it('sets each switch to what it is given, rather than toggling', () => {
    const store = slice()
    store.ui.setAuto(true)
    store.ui.setAuto(true)
    expect(store.ui.auto).toBe(true)
    store.ui.setHelp(false)
    expect(store.ui.help).toBe(false)
    expect(store.ui.auto).toBe(true)
  })

  it('raises and lowers the clamp notice', () => {
    const store = slice()
    store.ui.raiseClamped(true)
    expect(store.ui.clamped).toBe(true)
    store.ui.raiseClamped(false)
    expect(store.ui.clamped).toBe(false)
  })
})
