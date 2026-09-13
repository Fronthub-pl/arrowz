import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import type { RunControl } from '../run/useRun'
import { useStore } from './store'
import { type Carried, decodeHash, encodeHash, type HashPayload } from './url'
import type { ViewState } from './view.slice'

/** How long a burst of edits is allowed to run before the address bar moves. */
const WRITE_DELAY_MS = 250

/** The view as the link states it, from the slice. */
function viewFor(view: ViewState, help: boolean) {
  return {
    cell: view.cell,
    stroke: view.stroke,
    headWidth: view.headWidth,
    headHeight: view.headHeight,
    top: view.top,
    rounded: view.rounded,
    colored: view.colored,
    hilite: view.hilite,
    help,
  }
}

/** Writes a decoded link into the store. The caller decides whether to run. */
function applyPayload(payload: HashPayload): void {
  const { params, view, ui } = useStore.getState()
  // One `setMany` for every knob the link named: one recompute, one render,
  // and the machine path, so `auto` does not schedule a second run behind the
  // immediate one this trigger owns (Ruling 3).
  ui.raiseClamped(params.setMany(payload.params))
  // A number the link did not name keeps the page's own value; `setNumber` is
  // the tolerant reader, handed the value as text exactly as a field would.
  if (payload.view.cell !== undefined) view.setNumber('cell', String(payload.view.cell))
  if (payload.view.stroke !== undefined) view.setNumber('stroke', String(payload.view.stroke))
  if (payload.view.headWidth !== undefined) view.setNumber('headWidth', String(payload.view.headWidth))
  if (payload.view.headHeight !== undefined) view.setNumber('headHeight', String(payload.view.headHeight))
  if (payload.view.top !== undefined) view.setNumber('top', String(payload.view.top))
  view.setFlag('rounded', payload.view.rounded)
  view.setFlag('colored', payload.view.colored)
  view.setFlag('hilite', payload.view.hilite)
  ui.setHelp(payload.view.help)
}

/**
 * The URL hash, in both directions. Mounted once, in `App`.
 *
 * Three properties, each of which cost a review to find:
 *
 * 1. **The link is read exactly once**, guarded by a ref rather than by an
 *    empty dependency list. StrictMode re-runs mount effects, and a second
 *    read decodes the hash this hook has just written — already clamped — so
 *    `setMany` finds nothing to move and lowers the notice the link raised.
 * 2. **The write is debounced.** `KnobSlider` commits on the range input's
 *    `onChange`, about sixty times a second during a drag; Chromium drops
 *    `replaceState` past roughly two hundred calls in ten seconds and Safari
 *    throws past a hundred in thirty, from inside a zustand `set`.
 * 3. **The listener knows this hook's own writes.** `hashchange` fires on
 *    same-document traversal whenever the fragment differs, whatever the
 *    path, so `replaceState` is not the guard revision 1 thought it was: Back
 *    into the lab would start a carve and terminate the one in flight.
 *
 * The subscription is in an effect and not a selector in render (Ruling 11),
 * for the same reason `useAutoRun`'s is.
 */
export function useUrlHash(control: RunControl): void {
  const carried = useRef<Carried>({})
  const readDone = useRef(false)
  const written = useRef<string | null>(null)
  const { pathname } = useLocation()

  useEffect(() => {
    if (readDone.current) return
    readDone.current = true
    const payload = decodeHash(location.hash)
    if (payload === null) return
    carried.current = payload.carried
    applyPayload(payload)
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const flush = () => {
      if (!readDone.current) return
      const { params, view, ui } = useStore.getState()
      const next = encodeHash({ params: params.values, view: viewFor(view, ui.help), carried: carried.current })
      if (next === location.hash) return
      written.current = next
      history.replaceState(null, '', next)
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(flush, WRITE_DELAY_MS)
    }
    // The hash is written on every route, not only on the lab's: `TabRow`
    // navigates to bare paths, so writing only on `/` would empty the address
    // bar on the way to Boards and leave it empty on the way back. Writing
    // everywhere also means Back between routes finds the same fragment on
    // both entries, and fires no `hashchange` at all.
    flush()
    const unsubscribe = useStore.subscribe(schedule)
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [pathname])

  useEffect(() => {
    const onChange = () => {
      if (location.hash === written.current) return
      const payload = decodeHash(location.hash)
      if (payload === null) return
      carried.current = payload.carried
      applyPayload(payload)
      control.start()
    }
    globalThis.addEventListener('hashchange', onChange)
    return () => globalThis.removeEventListener('hashchange', onChange)
  }, [control])
}
