import { PARAM_SPEC } from '@arrowz/engine'
import { afterEach, describe, expect, it, test, vi } from 'vitest'
import { createUiSlice, modeOf, RAIL_GROUPS, type UiState } from './ui.slice'
import { useStore } from './store'

test('the rail opens on the board group, as the previous lab does', () => {
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

  it('starts with auto off and help on, as the previous lab does', () => {
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

  it('keeps the report drawer closed at first, sets it as given, and toggles it', () => {
    const store = slice()
    expect(store.ui.report).toBe(false)
    store.ui.setReport(true)
    store.ui.setReport(true)
    expect(store.ui.report).toBe(true)
    store.ui.toggleReport()
    expect(store.ui.report).toBe(false)
  })

  // Handoff 2, PR 1: the settings drawer opens by default, unlike the report,
  // because it does not cover the board.
  it('keeps the settings drawer open at first, sets it as given, and toggles it', () => {
    const store = slice()
    expect(store.ui.settings).toBe(true)
    store.ui.setSettings(false)
    store.ui.setSettings(false)
    expect(store.ui.settings).toBe(false)
    store.ui.toggleSettings()
    expect(store.ui.settings).toBe(true)
  })
})

describe('the view a page opens in', () => {
  function slice() {
    const store: { ui: UiState } = { ui: createUiSlice((fn) => Object.assign(store, fn(store))) }
    return store
  }

  // Only a stored `advanced` opens the advanced view.
  it('is the simple view unless the advanced one was chosen last time', () => {
    expect(modeOf(null)).toBe('simple')
    expect(modeOf('simple')).toBe('simple')
    expect(modeOf('advanced')).toBe('advanced')
    expect(modeOf('junk')).toBe('simple')
  })

  it('switches when told', () => {
    const store = slice()
    store.ui.setMode('advanced')
    expect(store.ui.mode).toBe('advanced')
  })
})

// Spec §5.3 lists solo in `ui`, and nothing remembers it: solo is gone on reload.
describe('solo', () => {
  function slice() {
    const store: { ui: UiState } = { ui: createUiSlice((fn) => Object.assign(store, fn(store))) }
    return store
  }

  it('starts off', () => {
    expect(slice().ui.solo).toBe(false)
  })

  it('toggles, and is set to what it is given', () => {
    const store = slice()
    store.ui.toggleSolo()
    expect(store.ui.solo).toBe(true)
    store.ui.toggleSolo()
    expect(store.ui.solo).toBe(false)
    store.ui.setSolo(true)
    store.ui.setSolo(true)
    expect(store.ui.solo).toBe(true)
  })
})

// Spec §8: neither field is ever remembered — no localStorage, no hash — so
// each is asserted against a freshly built slice rather than the live store,
// which a reset could have written (harness fact 41).
describe('the command palette', () => {
  function slice() {
    const store: { ui: UiState } = { ui: createUiSlice((fn) => Object.assign(store, fn(store))) }
    return store
  }

  // storage.ts documents that the node project has no dependable Web Storage,
  // so this stub supplies localStorage for only this test to verify the palette
  // never writes to it. The stub is removed after the test (afterEach below) to
  // preserve the node environment's contract: future tests exercise the "no
  // storage" branch without the safety net of a polyfill.
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts closed, with no jump waiting', () => {
    const store = slice()
    expect(store.ui.palette).toBe(false)
    expect(store.ui.focusTarget).toBe(null)
  })

  it('opens, closes, and toggles from whatever it is', () => {
    const store = slice()
    store.ui.openPalette()
    store.ui.openPalette()
    expect(store.ui.palette).toBe(true)
    store.ui.closePalette()
    expect(store.ui.palette).toBe(false)
    store.ui.togglePalette()
    expect(store.ui.palette).toBe(true)
    store.ui.togglePalette()
    expect(store.ui.palette).toBe(false)
  })

  it('carries a jump request until its consumer clears it', () => {
    const store = slice()
    store.ui.requestFocus('knob-seed')
    expect(store.ui.focusTarget).toBe('knob-seed')
    store.ui.requestFocus('view-stroke')
    expect(store.ui.focusTarget).toBe('view-stroke')
    store.ui.clearFocusRequest()
    expect(store.ui.focusTarget).toBe(null)
  })

  it('writes nothing to storage, unlike the view mode', () => {
    // Stub localStorage only for this test. See comment above.
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => {
        const keys = [...store.keys()]
        return keys[index] ?? null
      },
      get length() {
        return store.size
      },
    } satisfies Storage)

    localStorage.clear()
    const uiStore = slice()
    uiStore.ui.openPalette()
    uiStore.ui.requestFocus('knob-seed')
    expect(localStorage.length).toBe(0)
  })
})
