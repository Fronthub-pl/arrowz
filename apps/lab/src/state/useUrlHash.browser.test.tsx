import { defaultParams } from '@arrowz/engine'
import { StrictMode } from 'react'
import { BrowserRouter } from 'react-router'
import { render } from 'vitest-browser-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunControl } from '../run/useRun'
import { useStore } from './store'
import { decodeHash, encodeHash } from './url'
import { VIEW } from './url.fixtures'
import { useUrlHash } from './useUrlHash'

function Host({ control }: { control: RunControl }) {
  useUrlHash(control)
  return null
}

/**
 * A real `BrowserRouter`, not a `MemoryRouter`: the hook reads `useLocation`,
 * and these cases assert on the actual `location.pathname`, push and pop real
 * history entries and read `location.hash` — none of which a memory router
 * touches.
 */
function mount(control: RunControl) {
  return render(
    <BrowserRouter>
      <Host control={control} />
    </BrowserRouter>,
  )
}

function stub() {
  const calls = { start: 0 }
  const control: RunControl = { start: () => void calls.start++, abort: () => {}, hold: () => {} }
  return { control, started: () => calls.start }
}

beforeEach(() => {
  history.replaceState(null, '', location.pathname)
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
  state.ui.raiseClamped(false)
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

  // The bug revision 1 shipped: under StrictMode the read effect runs twice,
  // decodes the hash it wrote itself — already clamped — finds nothing to
  // clamp, and lowers the notice the link had raised. Invisible to every
  // other test in this file, because `render` does not use StrictMode.
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

  // Ruling 6: the link follows the console, so it agrees with the command box
  // beside it whether or not a board has been carved.
  it('writes the knobs on screen, without a run', async () => {
    const g = stub()
    await mount(g.control)
    useStore.getState().params.set('W', 51)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).toBe(51))
    expect(g.started()).toBe(0)
  })

  // Ruling 5: three routes share this history, and a run per entry would stop
  // Back from returning to /boards.
  it('replaces the history entry rather than pushing one', async () => {
    await mount(stub().control)
    const before = history.length
    useStore.getState().params.set('W', 52)
    useStore.getState().params.set('W', 53)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).toBe(53))
    expect(history.length).toBe(before)
  })

  // Ruling 5's debounce: a slider drag commits about sixty times a second,
  // and both Chromium and Safari rate-limit replaceState.
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

  it('does not run at itself: its own write is recognised', async () => {
    const g = stub()
    await mount(g.control)
    const started = g.started()
    useStore.getState().params.set('W', 54)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).toBe(54))
    expect(g.started()).toBe(started)
  })

  // The other bug revision 1 shipped: Back from a route without a hash used to
  // start a carve, and `useGenerator` would terminate the one in flight, which
  // spec §8 forbids. Measured on this runner: Chromium fires `hashchange` for
  // a traversal only while the path stays put, so it withholds the event here
  // and this case records the requirement rather than holding the guard. The
  // case after it holds the guard.
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

  // The guard the case above asks for, handed the event directly, because the
  // standard has `hashchange` fire on any difference of fragment and a browser
  // that does fire it must find the hook already holding its own write. Delete
  // the `written` ref and this is the only case that notices.
  it('ignores a hashchange that announces the fragment it wrote itself', async () => {
    const g = stub()
    await mount(g.control)
    useStore.getState().params.set('W', 56)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).toBe(56))
    const started = g.started()
    // Dispatch is synchronous, so the listener has run by the next line.
    globalThis.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(g.started()).toBe(started)
  })
})
