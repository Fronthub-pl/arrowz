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

  // No `help` in the slice: a knob row opens its own description.
  it('starts with auto off, and has no descriptions switch', () => {
    const store = slice()
    expect(store.ui.auto).toBe(false)
    expect(store.ui.clamped).toBe(false)
    expect(store.ui).not.toHaveProperty('help')
    expect(store.ui).not.toHaveProperty('setHelp')
  })

  it('sets each switch to what it is given, rather than toggling', () => {
    const store = slice()
    store.ui.setAuto(true)
    store.ui.setAuto(true)
    expect(store.ui.auto).toBe(true)
    store.ui.setAuto(false)
    expect(store.ui.auto).toBe(false)
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

  // The settings drawer opens by default, unlike the report: it does not cover the board.
  it('keeps the settings drawer open at first, sets it as given, and toggles it', () => {
    const store = slice()
    expect(store.ui.settings).toBe(true)
    store.ui.setSettings(false)
    store.ui.setSettings(false)
    expect(store.ui.settings).toBe(false)
    store.ui.toggleSettings()
    expect(store.ui.settings).toBe(true)
  })

  it('opens the saved boards on their list and switches to the preview and back', () => {
    const store = slice()
    expect(store.ui.boards).toBe('list')
    store.ui.showBoards('preview')
    expect(store.ui.boards).toBe('preview')
    store.ui.showBoards('list')
    expect(store.ui.boards).toBe('list')
  })

  // One sheet at a time; the same sheet pressed again closes it.
  it('opens one sheet at a time and closes it on a second press', () => {
    const store = slice()
    expect(store.ui.sheet).toBeNull()
    store.ui.toggleSheet('cli')
    expect(store.ui.sheet).toBe('cli')
    store.ui.toggleSheet('report')
    expect(store.ui.sheet).toBe('report')
    store.ui.toggleSheet('report')
    expect(store.ui.sheet).toBeNull()
    store.ui.setSheet('settings')
    expect(store.ui.sheet).toBe('settings')
  })

  it('opens and closes the top bar menu', () => {
    const store = slice()
    expect(store.ui.menu).toBe(false)
    store.ui.toggleMenu()
    expect(store.ui.menu).toBe(true)
    store.ui.setMenu(false)
    expect(store.ui.menu).toBe(false)
  })

  it('closes the settings drawer for a narrow window and restores it', () => {
    const store = slice()
    expect(store.ui.settings).toBe(true)
    store.ui.closeSettingsForNarrow()
    expect(store.ui.settings).toBe(false)
    // No storage in the node project (`readStored` returns null): the
    // remembered value is the default, open.
    store.ui.restoreSettings()
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

// Nothing remembers solo: it is gone on reload.
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

// Neither field is ever remembered, so each is asserted on a fresh slice, not
// on the live store, which a reset could have written.
describe('the command palette', () => {
  function slice() {
    const store: { ui: UiState } = { ui: createUiSlice((fn) => Object.assign(store, fn(store))) }
    return store
  }

  // The node project has no Web Storage; one case stubs it to prove the
  // palette never writes, and the stub goes so the others keep "no storage".
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

// The board mode belongs to the session: a reload opens on View, and the
// hash never carries it (`encodeHash` takes no `ui` at all).
describe('the board mode', () => {
  function slice() {
    const store: { ui: UiState } = { ui: createUiSlice((fn) => Object.assign(store, fn(store))) }
    return store
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts on View and is set to what it is given, writing nothing to storage', () => {
    const written: string[] = []
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: (key: string) => written.push(key),
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } satisfies Storage)
    const store = slice()
    expect(store.ui.boardMode).toBe('view')
    store.ui.setBoardMode('play')
    expect(store.ui.boardMode).toBe('play')
    store.ui.setBoardMode('inspect')
    expect(store.ui.boardMode).toBe('inspect')
    expect(written).toEqual([])
  })
})
