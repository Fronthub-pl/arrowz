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
 * A real `BrowserRouter`, not a `MemoryRouter`: the hook reads `useLocation`,
 * and these cases assert on the actual `location.pathname`, push and pop real
 * history entries and read `location.hash` — none of which a memory router
 * touches.
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

beforeEach(() => {
  history.replaceState(null, '', location.pathname)
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
  state.result.reset()
  state.ui.raiseClamped(false)
  state.lang.setLang('en')
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

  // The fragment is not the only thing on the entry: react-router keeps its own
  // record in `history.state`, the index it computes pop deltas from among it,
  // and this hook rewrites the entry at mount and after every edit.
  it('leaves the entry the state another library put there', async () => {
    await mount(stub().control)
    const before: unknown = history.state
    // Not an assertion about react-router so much as a guard on this case: if
    // the router ever stops writing a record, there is nothing here to keep.
    expect(before).not.toBe(null)
    useStore.getState().params.set('W', 58)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).toBe(58))
    expect(history.state).toEqual(before)
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

  // The other bug revision 1 shipped: Back from a route without a hash used to
  // start a carve, and `useGenerator` would terminate the one in flight, which
  // spec §8 forbids. The standard asks for a `hashchange` on this traversal;
  // no engine shipping today sends one, Chromium included, so on this runner
  // the case cannot fail for the event it is named after — but its `waitFor`
  // proves the traversal happened, and it still fails a listener bound to
  // `popstate`, which does fire here. The case after it holds the rule that
  // would make this one true on a conformant engine too: the fragment Back
  // lands on is the one already on screen, so it is not a trigger.
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

  // The rule the case above relies on, handed the event directly, because the
  // standard has `hashchange` fire on any difference of fragment and an engine
  // that follows it would deliver one here. Both halves in one case, because
  // one without the other is satisfiable by a stub: an early return that never
  // runs passes the first, and a listener with no early return at all passes
  // the second.
  //
  // This replaces two earlier cases. One, named "does not run at itself",
  // could not fail for its name on any engine: the hook writes with
  // `replaceState`, which fires no `hashchange`, so it stayed green with the
  // whole listener deleted. The other asserted that a *second* dispatch of the
  // same fragment does start a run — the one-shot `written` ref's behaviour,
  // and the bug: that ref was never spent by an echo that never came, so it
  // went stale and swallowed the next genuine traversal instead.
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
    // The complementary half. `replaceState` moves the bar without announcing
    // it, which is exactly the shape of a traversal as far as this listener is
    // concerned: the fragment on the bar is no longer the one on screen.
    history.replaceState(
      history.state,
      '',
      encodeHash({ params: { ...defaultParams(), W: 62 }, view: VIEW, carried: {} }),
    )
    globalThis.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(useStore.getState().params.values.W).toBe(62)
    expect(g.started()).toBe(started + 1)
  })

  // The bug revision 2 shipped, as the sequence that produced it. A one-shot
  // ref recording the last fragment written is never spent, because the write
  // is a `replaceState` and that announces nothing; it goes stale and eats the
  // next traversal that lands on it. Every fragment here is one the hook wrote
  // itself, so it is canonical and the early return in `flush()` is reached —
  // which is the step that leaves the stale ref in place.
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

    // The paste, as a new entry. `pushState` and a dispatched event rather
    // than `location.hash =`, because the assignment lets the engine
    // re-encode the fragment and this case depends on the two entries
    // carrying exactly the strings the hook wrote.
    history.pushState(history.state, '', hashC)
    globalThis.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(useStore.getState().params.values.W).toBe(61)
    expect(g.started()).toBe(started + 1)
    // The debounced write that follows finds the bar already correct and
    // returns without touching it. Waited out rather than skipped: it is the
    // step that used to leave the ref armed at the previous fragment.
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(location.hash).toBe(hashC)

    history.back()
    await vi.waitFor(() => expect(useStore.getState().params.values.W).toBe(55))
    expect(g.started()).toBe(started + 2)
  })

  // The fragment belongs to the whole shell, not to the lab's route: `TabRow`
  // navigates to bare paths, and a fragment dropped on the way to Boards would
  // be gone on the way back. The listener is live on every route for the same
  // reason — a link pasted while Boards is open runs the generator behind it.
  it('keeps the fragment when the user changes route', async () => {
    const screen = await mount(stub().control)
    useStore.getState().params.set('W', 57)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).toBe(57))
    await screen.getByRole('button', { name: 'away' }).click()
    // Both in one wait: the router drops the fragment as it pushes the bare
    // path, and the rewrite lands an effect later, so a wait on the path alone
    // would read the bar in the window between the two.
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

  // `lang` goes into the link every time, so a copied link opens in the
  // language it was copied in.
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

  // The theme picked in the lab must join the URL hash beside the other
  // view fields (spec §6), the way `lang` above already does. `url.test.ts`
  // only exercises `encodeHash`/`decodeHash` directly and cannot see a defect
  // in `viewFor`, which builds the object those functions are handed.
  it('writes the theme on screen into the link', async () => {
    await mount(stub().control)
    useStore.getState().view.setTheme('gruvbox-dark')
    await vi.waitFor(() => expect(decodeHash(location.hash)?.view.theme).toBe('gruvbox-dark'))
  })

  // The other half: a link naming a theme restores it into the store, the way
  // a pasted `lang` does above.
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
})
