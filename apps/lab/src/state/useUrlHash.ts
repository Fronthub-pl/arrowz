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
function viewFor(view: ViewState, lang: Lang) {
  return {
    cell: view.cell,
    stroke: view.stroke,
    headWidth: view.headWidth,
    headHeight: view.headHeight,
    top: view.top,
    rounded: view.rounded,
    colored: view.colored,
    highlightLongest: view.highlightLongest,
    voids: view.voids,
    lang,
    theme: view.theme,
    palette: view.palette,
    paper: view.paper,
    ink: view.ink,
    highlightColor: view.highlightColor,
    showPoints: view.showPoints,
    pointColor: view.pointColor,
    pointRadius: view.pointRadius,
    pad: view.pad,
  }
}

/** Writes a decoded link into the store. The caller decides whether to run. */
function applyPayload(payload: HashPayload): void {
  const { params, view, ui, lang } = useStore.getState()
  // One `setMany`: one recompute, one render, and the machine path, so `auto`
  // does not schedule a second run behind the one this trigger starts.
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
  view.setFlag('highlightLongest', payload.view.highlightLongest)
  view.setFlag('voids', payload.view.voids)
  // Through `setLang`, so a link's language is remembered as well as shown.
  if (payload.view.lang !== undefined) lang.setLang(payload.view.lang)
  // Absent only in a legacy link: the page keeps its own, as for `cell`..`top`.
  // A link written now states every colour (`''` for none), so it clears them.
  if (payload.view.theme !== undefined) view.setTheme(payload.view.theme)
  if (payload.view.palette !== undefined) view.setPalette(payload.view.palette)
  if (payload.view.paper !== undefined) view.setPaper(payload.view.paper)
  if (payload.view.ink !== undefined) view.setInk(payload.view.ink)
  if (payload.view.highlightColor !== undefined) view.setHighlightColor(payload.view.highlightColor)
  // `showPoints` is a plain flag like `rounded`, not a tri-state.
  view.setFlag('showPoints', payload.view.showPoints === true)
  if (payload.view.pointColor !== undefined) view.setPointColor(payload.view.pointColor)
  if (payload.view.pointRadius !== undefined) view.setPointRadius(String(payload.view.pointRadius))
  if (payload.view.pad !== undefined) view.setPad(payload.view.pad)
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
 * 1. The link is read once, guarded by a ref (not by `[]`): StrictMode's second
 *    run would decode the hash this hook just wrote, already clamped, and lower
 *    the clamp notice the link raised.
 * 2. Writes are debounced: a slider drag commits ~60×/s, and Chromium drops
 *    `replaceState` past ~200 calls in 10 s while Safari throws past 100 in 30.
 * 3. `hashchange` compares the fragment against the store, not against "did I
 *    write this": `replaceState` fires no `hashchange`, so a "mine" flag is
 *    never cleared and would swallow a later Back/Forward onto that fragment.
 *    A fragment that already matches the store must not restart a carve.
 *
 * The subscription lives in an effect, not in a render selector (see `useAutoRun`).
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
      // Unreachable while the effects run in declaration order; it pins that
      // order, since a write before the read would overwrite the link.
      if (!readDone.current) return
      const { params, view, lang } = useStore.getState()
      const next = encodeHash({
        params: params.values,
        view: viewFor(view, lang.lang),
        carried: carried.current,
      })
      if (next === location.hash) return
      // `history.state`, not `null`: react-router keeps its record there
      // (`idx`, which pop deltas are computed from).
      history.replaceState(history.state, '', next)
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(flush, WRITE_DELAY_MS)
    }
    // Written on every route: `TabRow` navigates to bare paths, which would
    // empty the fragment. It also leaves the same fragment on both entries, so
    // Back between routes fires no `hashchange`.
    flush()
    const unsubscribe = useStore.subscribe(schedule)
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [pathname])

  useEffect(() => {
    const onChange = () => {
      // Property 3 above: a pasted link or a traversal onto a different
      // fragment is a trigger; one matching the store is not. Bound on every
      // route, because a link pasted while Boards is open runs the generator behind it.
      const { params, view, lang } = useStore.getState()
      const here = encodeHash({
        params: params.values,
        view: viewFor(view, lang.lang),
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
