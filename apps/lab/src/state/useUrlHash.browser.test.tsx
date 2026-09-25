import { defaultParams } from '@arrowz/engine'
import { StrictMode } from 'react'
import { BrowserRouter, useNavigate } from 'react-router'
import { render } from 'vitest-browser-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunControl } from '../run/useRun'
import { useStore } from './store'
import { decodeHash, encodeHash } from './url'
import { VIEW } from './url.fixtures'
import { useUrlHash } from './useUrlHash'

/** A link as the lab wrote it before the view version, for `location.hash =`. */
const legacyFragment = (json: Record<string, unknown>) => encodeURIComponent(JSON.stringify(json))

function Host({ control }: { control: RunControl }) {
  useUrlHash(control)
  return null
}

/** A route change the way `TabRow` makes one: the router's own navigate, to a bare path. */
function Away() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => void navigate('/boards')}>
      away
    </button>
  )
}

/**
 * A real `BrowserRouter`, not a `MemoryRouter`: these cases read the real
 * `location` and push and pop real history entries, which a memory router
 * never touches.
 */
function mount(control: RunControl) {
  return render(
    <BrowserRouter>
      <Host control={control} />
      <Away />
    </BrowserRouter>,
  )
}

function stub() {
  const calls = { start: 0 }
  const control: RunControl = { start: () => void calls.start++, abort: () => {}, hold: () => {} }
  return { control, started: () => calls.start }
}

/**
 * The view slice as the module loaded it, so this file need not duplicate its
 * defaults. Restored wholesale, not through an action under test, because the
 * view slice has no `reset()` of its own.
 */
const initialView = useStore.getState().view

beforeEach(() => {
  history.replaceState(null, '', location.pathname)
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
  state.result.reset()
  state.ui.raiseClamped(false)
  state.lang.setLang('en')
  useStore.setState({ view: initialView })
})
afterEach(() => history.replaceState(null, '', location.pathname))

describe('useUrlHash', () => {
  it('opens on the knobs the link names', async () => {
    history.replaceState(
      null,
      '',
      encodeHash({ params: { ...defaultParams(), W: 44, H: 88 }, view: VIEW, carried: {} }),
    )
    await mount(stub().control)
    expect(useStore.getState().params.values.W).toBe(44)
    expect(useStore.getState().params.values.H).toBe(88)
  })

  it('raises the notice when the link named a value that had to move', async () => {
    history.replaceState(null, '', '#' + encodeURIComponent(JSON.stringify({ W: 999999 })))
    await mount(stub().control)
    expect(useStore.getState().ui.clamped).toBe(true)
  })

  // The only StrictMode case here: a second read would decode the already
  // clamped hash and lower the notice.
  it('keeps that notice up when React mounts the effect twice', async () => {
    history.replaceState(null, '', '#' + encodeURIComponent(JSON.stringify({ W: 999999 })))
    await render(
      <StrictMode>
        <BrowserRouter>
          <Host control={stub().control} />
        </BrowserRouter>
      </StrictMode>,
    )
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).not.toBe(999999))
    expect(useStore.getState().ui.clamped).toBe(true)
  })

  // The link follows the console, so it agrees with the command box beside it.
  it('writes the knobs on screen, without a run', async () => {
    const g = stub()
    await mount(g.control)
    useStore.getState().params.set('W', 51)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).toBe(51))
    expect(g.started()).toBe(0)
  })

  // Three routes share this history; an entry per edit would stop Back from
  // returning to /boards.
  it('replaces the history entry rather than pushing one', async () => {
    await mount(stub().control)
    const before = history.length
    useStore.getState().params.set('W', 52)
    useStore.getState().params.set('W', 53)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).toBe(53))
    expect(history.length).toBe(before)
  })

  // react-router keeps its own record in `history.state`.
  it('leaves the entry the state another library put there', async () => {
    await mount(stub().control)
    const before: unknown = history.state
    // A guard on the case: without a record there is nothing to keep.
    expect(before).not.toBe(null)
    useStore.getState().params.set('W', 58)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).toBe(58))
    expect(history.state).toEqual(before)
  })

  // The debounce (see `useUrlHash`).
  it('writes once for a burst of edits, not once per edit', async () => {
    await mount(stub().control)
    const spy = vi.spyOn(history, 'replaceState')
    for (let w = 60; w < 80; w++) useStore.getState().params.set('W', w)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).toBe(79))
    expect(spy.mock.calls.length).toBeLessThanOrEqual(2)
    spy.mockRestore()
  })

  it('takes a link pasted into the bar and runs it', async () => {
    const g = stub()
    await mount(g.control)
    const started = g.started()
    location.hash = encodeHash({ params: { ...defaultParams(), W: 61 }, view: VIEW, carried: {} }).slice(1)
    await vi.waitFor(() => expect(useStore.getState().params.values.W).toBe(61))
    expect(g.started()).toBe(started + 1)
  })

  // A run here would kill the carve in flight. Chromium sends no `hashchange`
  // on this traversal, so this fails only a listener bound to `popstate`; the
  // next case holds the rule for an engine that does send one.
  it('does not start a run when the user navigates back into the lab', async () => {
    const g = stub()
    await mount(g.control)
    useStore.getState().params.set('W', 55)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).toBe(55))
    const started = g.started()
    history.pushState({}, '', '/boards')
    history.back()
    await vi.waitFor(() => expect(location.pathname).not.toBe('/boards'))
    expect(g.started()).toBe(started)
  })

  // The event dispatched directly. Both halves in one case, because either
  // alone is satisfiable by a stub: a listener that never runs passes the
  // first, one with no early return passes the second.
  it('never runs at a fragment that states what is already on screen, and runs at one that does not', async () => {
    const g = stub()
    await mount(g.control)
    useStore.getState().params.set('W', 56)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).toBe(56))
    const started = g.started()
    // Dispatch is synchronous, so the listener has run by the next line.
    globalThis.dispatchEvent(new HashChangeEvent('hashchange'))
    globalThis.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(g.started()).toBe(started)
    // `replaceState` moves the bar silently: to the listener, a traversal.
    history.replaceState(
      history.state,
      '',
      encodeHash({ params: { ...defaultParams(), W: 62 }, view: VIEW, carried: {} }),
    )
    globalThis.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(useStore.getState().params.values.W).toBe(62)
    expect(g.started()).toBe(started + 1)
  })

  // Catches a "did I write this" flag (see `useUrlHash`, property 3). Every
  // fragment is one the hook wrote, so `flush()`'s early return is reached.
  it('takes the traversal back onto an entry it wrote before the link was pasted', async () => {
    const g = stub()
    await mount(g.control)
    useStore.getState().params.set('W', 55)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).toBe(55))
    const hashB = location.hash
    useStore.getState().params.set('W', 61)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).toBe(61))
    const hashC = location.hash
    useStore.getState().params.set('W', 55)
    await vi.waitFor(() => expect(location.hash).toBe(hashB))
    const started = g.started()

    // The paste, as a new entry. Not `location.hash =`: the engine may
    // re-encode it, and the entries must carry exactly the hook's strings.
    history.pushState(history.state, '', hashC)
    globalThis.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(useStore.getState().params.values.W).toBe(61)
    expect(g.started()).toBe(started + 1)
    // Wait out the debounced write, which finds the bar already correct.
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(location.hash).toBe(hashC)

    history.back()
    await vi.waitFor(() => expect(useStore.getState().params.values.W).toBe(55))
    expect(g.started()).toBe(started + 2)
  })

  it('keeps the fragment when the user changes route', async () => {
    const screen = await mount(stub().control)
    useStore.getState().params.set('W', 57)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).toBe(57))
    await screen.getByRole('button', { name: 'away' }).click()
    // One wait for both: the rewrite lands an effect after the bare path.
    await vi.waitFor(() => {
      expect(location.pathname).toBe('/boards')
      expect(decodeHash(location.hash)?.params.W).toBe(57)
    })
  })

  it('opens in the language the link names, and remembers it', async () => {
    history.replaceState(null, '', encodeHash({ params: defaultParams(), view: { ...VIEW, lang: 'pl' }, carried: {} }))
    await mount(stub().control)
    expect(useStore.getState().lang.lang).toBe('pl')
    expect(localStorage.getItem('labLang')).toBe('pl')
  })

  it('writes the language on screen into the link', async () => {
    await mount(stub().control)
    useStore.getState().lang.setLang('pl')
    await vi.waitFor(() => expect(decodeHash(location.hash)?.view.lang).toBe('pl'))
  })

  it('takes a pasted link that changes only the language, and runs it', async () => {
    const g = stub()
    await mount(g.control)
    const started = g.started()
    location.hash = encodeHash({ params: defaultParams(), view: { ...VIEW, lang: 'pl' }, carried: {} }).slice(1)
    await vi.waitFor(() => expect(useStore.getState().lang.lang).toBe('pl'))
    expect(g.started()).toBe(started + 1)
  })

  // The "writes … into the link" cases cover `viewFor`, which `url.test.ts`
  // cannot see: it hands `encodeHash` a view built by hand.
  it('writes the theme on screen into the link', async () => {
    await mount(stub().control)
    useStore.getState().view.setTheme('gruvbox-dark')
    await vi.waitFor(() => expect(decodeHash(location.hash)?.view.theme).toBe('gruvbox-dark'))
  })

  it('opens on the theme the link names, and a later link moves it', async () => {
    history.replaceState(
      null,
      '',
      encodeHash({ params: defaultParams(), view: { ...VIEW, theme: 'gruvbox-dark' }, carried: {} }),
    )
    await mount(stub().control)
    expect(useStore.getState().view.theme).toBe('gruvbox-dark')

    location.hash = encodeHash({ params: defaultParams(), view: { ...VIEW, theme: 'ayu-light' }, carried: {} }).slice(1)
    await vi.waitFor(() => expect(useStore.getState().view.theme).toBe('ayu-light'))
  })

  it('writes the custom palette on screen into the link', async () => {
    await mount(stub().control)
    useStore.getState().view.setPalette(['#112233', '#aabbcc'])
    await vi.waitFor(() => expect(decodeHash(location.hash)?.view.palette).toEqual(['#112233', '#aabbcc']))
  })

  it('opens on the palette a legacy link names, and keeps a theme already on screen', async () => {
    await mount(stub().control)
    useStore.getState().view.setTheme('gruvbox-dark')
    location.hash = legacyFragment({ __view: { palette: ['#112233', '#aabbcc'] } })
    await vi.waitFor(() => expect(useStore.getState().view.palette).toEqual(['#112233', '#aabbcc']))
    expect(useStore.getState().view.theme).toBe('gruvbox-dark')
  })

  it('opens on the palette a link written now names, and clears the theme it does not', async () => {
    await mount(stub().control)
    useStore.getState().view.setTheme('gruvbox-dark')
    location.hash = encodeHash({
      params: defaultParams(),
      view: { ...VIEW, palette: ['#112233', '#aabbcc'] },
      carried: {},
    }).slice(1)
    await vi.waitFor(() => expect(useStore.getState().view.palette).toEqual(['#112233', '#aabbcc']))
    expect(useStore.getState().view.theme).toBe('')
  })

  // Auto-enabling `colored` lives in `addPaletteColor` alone, not in
  // `setPalette`, so a link's explicit `colored: false` survives its palette.
  it('restores a link stating colored: false and a palette with colouring still off', async () => {
    await mount(stub().control)
    // Start from an empty palette, set directly rather than via `setPalette`
    // (under test): a leftover palette would mask a misplaced auto-enable.
    useStore.setState((state) => ({ view: { ...state.view, palette: [] } }))
    useStore.getState().view.setFlag('colored', true)
    location.hash = encodeHash({
      params: defaultParams(),
      view: { ...VIEW, colored: false, palette: ['#112233'] },
      carried: {},
    }).slice(1)
    await vi.waitFor(() => expect(useStore.getState().view.palette).toEqual(['#112233']))
    expect(useStore.getState().view.colored).toBe(false)
  })

  it('keeps both the theme and the palette when a link names both', async () => {
    await mount(stub().control)
    location.hash = encodeHash({
      params: defaultParams(),
      view: { ...VIEW, theme: 'gruvbox-dark', palette: ['#112233'] },
      carried: {},
    }).slice(1)
    await vi.waitFor(() => expect(useStore.getState().view.palette).toEqual(['#112233']))
    expect(useStore.getState().view.theme).toBe('gruvbox-dark')
  })

  it('writes the board colours and the point grid into the link', async () => {
    await mount(stub().control)
    useStore.getState().view.setPaper('#010203')
    useStore.getState().view.setInk('#040506')
    useStore.getState().view.setFlag('showPoints', true)
    useStore.getState().view.setPointColor('#070809')
    useStore.getState().view.setPointRadius('0.2')
    await vi.waitFor(() => {
      expect(decodeHash(location.hash)?.view.paper).toBe('#010203')
      expect(decodeHash(location.hash)?.view.ink).toBe('#040506')
      expect(decodeHash(location.hash)?.view.showPoints).toBe(true)
      expect(decodeHash(location.hash)?.view.pointColor).toBe('#070809')
      expect(decodeHash(location.hash)?.view.pointRadius).toBe(0.2)
    })
  })

  it('opens on the board colours and the point grid the link names', async () => {
    await mount(stub().control)
    location.hash = encodeHash({
      params: defaultParams(),
      view: { ...VIEW, paper: '#010203', ink: '#040506', showPoints: true, pointColor: '#070809', pointRadius: 0.2 },
      carried: {},
    }).slice(1)
    await vi.waitFor(() => expect(useStore.getState().view.paper).toBe('#010203'))
    expect(useStore.getState().view.ink).toBe('#040506')
    expect(useStore.getState().view.showPoints).toBe(true)
    expect(useStore.getState().view.pointColor).toBe('#070809')
    expect(useStore.getState().view.pointRadius).toBe(0.2)
  })

  it('writes the highlight colour into the link', async () => {
    await mount(stub().control)
    useStore.getState().view.setHighlightColor('#0a0b0c')
    await vi.waitFor(() => {
      expect(decodeHash(location.hash)?.view.highlightColor).toBe('#0a0b0c')
    })
  })

  it('opens on the highlight colour the link names', async () => {
    await mount(stub().control)
    location.hash = encodeHash({
      params: defaultParams(),
      view: { ...VIEW, highlightColor: '#0a0b0c' },
      carried: {},
    }).slice(1)
    await vi.waitFor(() => expect(useStore.getState().view.highlightColor).toBe('#0a0b0c'))
  })

  it('writes the margin into the link', async () => {
    await mount(stub().control)
    useStore.getState().view.setPad(7)
    await vi.waitFor(() => {
      expect(decodeHash(location.hash)?.view.pad).toBe(7)
    })
  })

  it('opens on the margin the link names', async () => {
    await mount(stub().control)
    location.hash = encodeHash({
      params: defaultParams(),
      view: { ...VIEW, pad: 7 },
      carried: {},
    }).slice(1)
    await vi.waitFor(() => expect(useStore.getState().view.pad).toBe(7))
  })

  it('keeps the board colours and the margin on screen when a legacy link names none of them', async () => {
    await mount(stub().control)
    useStore.getState().view.setPaper('#010203')
    useStore.getState().view.setInk('#040506')
    useStore.getState().view.setHighlightColor('#0a0b0c')
    useStore.getState().view.setPad(7)
    location.hash = legacyFragment({ W: 50, __view: {} })
    await vi.waitFor(() => expect(useStore.getState().params.values.W).toBe(50))
    expect(useStore.getState().view.paper).toBe('#010203')
    expect(useStore.getState().view.ink).toBe('#040506')
    expect(useStore.getState().view.highlightColor).toBe('#0a0b0c')
    expect(useStore.getState().view.pad).toBe(7)
  })

  // The margin is a number, and a link written now always states it; `VIEW`
  // leaves it out, which is how an absent number still keeps the page's.
  it('clears the board colours a link written now does not name, and keeps the margin', async () => {
    await mount(stub().control)
    useStore.getState().view.setPaper('#010203')
    useStore.getState().view.setInk('#040506')
    useStore.getState().view.setHighlightColor('#0a0b0c')
    useStore.getState().view.setPad(7)
    location.hash = encodeHash({ params: { ...defaultParams(), W: 50 }, view: VIEW, carried: {} }).slice(1)
    await vi.waitFor(() => expect(useStore.getState().params.values.W).toBe(50))
    expect(useStore.getState().view.paper).toBe('')
    expect(useStore.getState().view.ink).toBe('')
    expect(useStore.getState().view.highlightColor).toBe('')
    expect(useStore.getState().view.pad).toBe(7)
  })

  // Entry A is one the hook wrote, so the string it returns to is exactly what
  // a user's Back lands on; the pasted link B brings a theme and a palette.
  it('restores the colours of the entry Back returns to, and leaves that entry as it was', async () => {
    await mount(stub().control)
    useStore.getState().params.set('W', 41)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).toBe(41))
    const hashA = location.hash
    const hashB = encodeHash({
      params: { ...defaultParams(), W: 42 },
      view: { ...VIEW, theme: 'gruvbox-dark', palette: ['#112233'] },
      carried: {},
    })
    history.pushState(history.state, '', hashB)
    globalThis.dispatchEvent(new HashChangeEvent('hashchange'))
    await vi.waitFor(() => expect(useStore.getState().view.theme).toBe('gruvbox-dark'))

    history.back()
    await vi.waitFor(() => expect(useStore.getState().params.values.W).toBe(41))
    expect(useStore.getState().view.theme).toBe('')
    expect(useStore.getState().view.palette).toEqual([])
    // Wait out the debounced write, which must find entry A already right.
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(location.hash).toBe(hashA)
  })

  it('writes the voids switch into the link, and a link sets it', async () => {
    await mount(stub().control)
    useStore.getState().view.setFlag('voids', false)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.view.voids).toBe(false))
    location.hash = encodeHash({ params: defaultParams(), view: { ...VIEW, cell: 13 }, carried: {} }).slice(1)
    await vi.waitFor(() => expect(useStore.getState().view.cell).toBe(13))
    expect(useStore.getState().view.voids).toBe(true)
  })
})
