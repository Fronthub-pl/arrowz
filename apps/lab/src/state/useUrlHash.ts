import type { Lang } from '@arrowz/engine/i18n'
import { useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router'
import type { RunControl } from '../run/useRun'
import { useStore } from './store'
import { type Carried, decodeHash, encodeHash, type HashPayload } from './url'
import type { ViewState } from './view.slice'

/** How long a burst of edits is allowed to run before the address bar moves. */
const WRITE_DELAY_MS = 250

/** The view as the link states it, from the slice. */
function viewFor(view: ViewState, help: boolean, lang: Lang) {
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
    lang,
    theme: view.theme,
  }
}

/** Writes a decoded link into the store. The caller decides whether to run. */
function applyPayload(payload: HashPayload): void {
  const { params, view, ui, lang } = useStore.getState()
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
  // Through `setLang`, so a link's language is remembered as well as shown.
  if (payload.view.lang !== undefined) lang.setLang(payload.view.lang)
  // Absent when the link predates themes or names none: the page keeps its
  // own value, the same tolerance `cell`..`top` get above.
  if (payload.view.theme !== undefined) view.setTheme(payload.view.theme)
}

export interface UrlHash {
  /**
   * Whether the page opened on a link: the hash decoded at mount, whether or
   * not it named a knob — true once the JSON parses. Read after the mount
   * effects, never during render.
   */
  openedFromLink(): boolean
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
 * 3. **The listener compares against the store, not against history.** A
 *    fragment that already states what is on screen is not a trigger: it is
 *    the page describing itself. Revision 1 asked the opposite question —
 *    "did I write this?" — with a one-shot ref set on every write, and that
 *    could not be made to work here. `replaceState` fires no `hashchange` on
 *    any engine or per the standard's own sentence, so nothing ever spent the
 *    ref; it stayed armed at the last fragment written and swallowed the next
 *    genuine traversal that happened to land on it (edit to `#B`, paste `#C`,
 *    Back to `#B` → dropped: address bar B, page C, no run). The branch it was
 *    kept for cannot arise at all, because `flush()` runs on every route
 *    change and so leaves both entries carrying the same fragment, which no
 *    reading of `hashchange` fires on — neither the standard's (fires when the
 *    fragments differ) nor any shipping engine's (fires only when the two URLs
 *    are equal but for the fragment). A comparison with the current state
 *    cannot go stale, and it additionally keeps a traversal onto the fragment
 *    already on screen from starting a carve that would terminate the one in
 *    flight (§8).
 *
 * The subscription is in an effect and not a selector in render (Ruling 11),
 * for the same reason `useAutoRun`'s is.
 */
export function useUrlHash(control: RunControl): UrlHash {
  const carried = useRef<Carried>({})
  const readDone = useRef(false)
  const fromLink = useRef(false)
  const { pathname } = useLocation()

  useEffect(() => {
    if (readDone.current) return
    readDone.current = true
    const payload = decodeHash(location.hash)
    if (payload === null) return
    fromLink.current = true
    carried.current = payload.carried
    applyPayload(payload)
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const flush = () => {
      // Unreachable as the effects stand — React runs them in declaration
      // order, so the read above has set the ref before this one is set up —
      // and kept because it is what pins that order: a hash written before the
      // link is read would be the page's defaults overwriting the link.
      if (!readDone.current) return
      const { params, view, ui, lang } = useStore.getState()
      const next = encodeHash({
        params: params.values,
        view: viewFor(view, ui.help, lang.lang),
        carried: carried.current,
      })
      if (next === location.hash) return
      // `history.state` and not `null`: react-router keeps its own record
      // there — `idx`, the index it computes pop deltas from, among them — and
      // this hook replaces the entry at mount and after every edit.
      history.replaceState(history.state, '', next)
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
      // Idempotent against the store rather than against history (property 3):
      // a fragment that already encodes what the page holds is the page
      // describing itself, and applying it would be a no-op followed by a run
      // that terminates whatever is in flight. Anything else — a pasted link,
      // a traversal onto a different entry — is a trigger.
      const { params, view, ui, lang } = useStore.getState()
      const here = encodeHash({
        params: params.values,
        view: viewFor(view, ui.help, lang.lang),
        carried: carried.current,
      })
      if (location.hash === here) return
      const payload = decodeHash(location.hash)
      if (payload === null) return
      carried.current = payload.carried
      applyPayload(payload)
      control.start()
    }
    globalThis.addEventListener('hashchange', onChange)
    return () => globalThis.removeEventListener('hashchange', onChange)
  }, [control])

  // Stable, so `App`'s load effect lists it without ever re-running on it.
  return useMemo(() => ({ openedFromLink: () => fromLink.current }), [])
}
