import { type KeyboardEvent, type ReactElement, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useDictionary } from '../i18n'
import type { RunControl } from '../run/useRun'
import { selectedIndex } from '../shell/TabRow'
import { useStore } from '../state/store'
import { buildCommands, type Command, matchCommands } from './commands'

/** The id of the trigger, so closing can hand the focus back to it (spec §7). */
export const TRIGGER_ID = 'cmdk'

/**
 * A row's DOM id, which `aria-activedescendant` names and the scroll effect
 * looks up. At module scope because it closes over nothing: a helper declared
 * in the component would be a fresh dependency for that effect every render.
 */
const rowId = (command: Command) => `cmd-${command.id}`

/**
 * The palette (spec §7). Closed, it renders nothing and holds no state, so
 * every opening starts on an empty query — the mock's behaviour, and the one
 * a reader expects from a palette.
 */
export function CommandPalette({ control }: { control: RunControl }): ReactElement | null {
  const open = useStore((state) => state.ui.palette)
  if (!open) return null
  return <PaletteDialog control={control} />
}

function PaletteDialog({ control }: { control: RunControl }): ReactElement {
  const dict = useDictionary()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // 0 is the lab, 1 the saved boards, 2 the docs — `App.tsx`'s own reckoning,
  // read from the same function, because the footer has to agree with the
  // hooks that bind the keys it advertises.
  const tab = selectedIndex(pathname)
  const onWorkspace = tab === 0 || tab === 1
  // Named selectors rather than the whole store: a progress message during a
  // carve must not rebuild seventy rows.
  const values = useStore((state) => state.params.values)
  const violations = useStore((state) => state.params.violations)
  const phase = useStore((state) => state.run.phase)
  const mode = useStore((state) => state.ui.mode)
  const lang = useStore((state) => state.lang.lang)
  const view = useStore((state) => state.view)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  const commands = useMemo(
    () =>
      buildCommands(
        {
          control,
          // A jump to a knob asks for the lab face first (spec §6), and every
          // `go` row names a route: neither should stack a history entry for
          // the route already on screen, or Back would walk through the jumps
          // instead of leaving the lab. Written inside the memo rather than
          // beside it, so it is not a fresh dependency on every render.
          navigate: (path) => {
            if (path !== pathname) void navigate(path)
          },
          dict,
        },
        useStore.getState(),
      ),
    // The snapshot is read inside through `getState()`, so `exhaustive-deps`
    // cannot check this list: it only flags a listed dependency the closure
    // never reads, never a field read through `getState()` that was never
    // listed. This array is therefore checked by hand — it is every slice a
    // row shows or is disabled by (`knobRows`, `presetRows`, the run and go
    // rows in `buildCommands`) — and anyone adding a field to a row must add
    // its slice here.
    [control, navigate, pathname, dict, values, violations, phase, mode, lang, view],
  )
  const hits = useMemo(() => matchCommands(commands, query), [commands, query])
  const current = hits[Math.min(active, hits.length - 1)]

  // The focus goes in on mount and comes back out on unmount. `jsx-a11y`
  // forbids the `autoFocus` attribute, and the return is spec §7.2's row.
  useEffect(() => {
    inputRef.current?.focus()
    return () => document.getElementById(TRIGGER_ID)?.focus()
  }, [])

  // Closing on a press outside the frame, rather than a handler on the
  // backdrop: a click handler on a plain div trips
  // `jsx-a11y/no-static-element-interactions`, and a press that begins inside
  // and ends outside should not close the dialog either.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const frame = frameRef.current
      if (frame === null || !(event.target instanceof Node)) return
      if (frame.contains(event.target)) return
      // The trigger is the one press outside the frame that must not close the
      // dialog here. It toggles (`TopBar.tsx`), and the toggle reads the store
      // as it stands when the *click* arrives — so a close on `mousedown`
      // would leave that click to find the palette shut and open it again.
      // The button could never close what it opened, and the dialog remounted
      // on every such press.
      if (document.getElementById(TRIGGER_ID)?.contains(event.target) === true) return
      useStore.getState().ui.closePalette()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // The list is bounded by design (D4) — 46vh, about fifteen rows at 800px —
  // over a catalogue of some seventy. Without this, the arrows walk the
  // highlight and `aria-activedescendant` off the bottom of the box: the
  // active row and the row Enter would fire become invisible, which is the
  // combobox contract §7 spells out broken in the plainest way. `nearest`
  // scrolls only when the row is outside the box, so hovering with the mouse
  // does not jerk the list under the pointer.
  useEffect(() => {
    if (current === undefined) return
    document.getElementById(rowId(current))?.scrollIntoView({ block: 'nearest' })
  }, [current])

  const choose = (command: Command | undefined) => {
    if (command === undefined || command.disabled) return
    command.run()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      useStore.getState().ui.closePalette()
      return
    }
    // Nothing else in the frame takes the focus, so Tab has nowhere to go: the
    // trap is one line rather than a ring of sentinels.
    if (event.key === 'Tab') {
      event.preventDefault()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      choose(current)
      return
    }
    const last = hits.length - 1
    const next =
      event.key === 'ArrowDown'
        ? Math.min(active + 1, last)
        : event.key === 'ArrowUp'
          ? Math.max(active - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (next === null) return
    event.preventDefault()
    setActive(Math.max(0, next))
  }

  const title = dict.t('cmdTitle')
  return (
    <div className="fw-scrim">
      <div className="fw-pal" role="dialog" aria-modal="true" aria-label={title} ref={frameRef}>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="cmd-list"
          aria-label={title}
          {...(current === undefined ? {} : { 'aria-activedescendant': rowId(current) })}
          placeholder={dict.t('cmdPlaceholder')}
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
        />
        <div className="list" id="cmd-list" role="listbox" aria-label={title}>
          {hits.map((command, at) => (
            // `jsx-a11y/click-events-have-key-events` wants a keyboard listener
            // beside the click, but the row is never focusable (spec §7): every
            // keystroke is the input's, `aria-selected`/`aria-activedescendant`
            // carry the active row to a screen reader, and `tabIndex={-1}` keeps
            // it out of the tab order. A keyboard handler here would contradict
            // that design, so this one rule is disabled for the row alone.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <div
              key={command.id}
              id={rowId(command)}
              role="option"
              aria-selected={command === current}
              {...(command.disabled ? { 'aria-disabled': true } : {})}
              className="row"
              tabIndex={-1}
              onMouseEnter={() => setActive(at)}
              onClick={() => choose(command)}
            >
              <span className="lab">{command.name}</span>
              <span className="g">{command.note}</span>
              <span className="v">{command.value}</span>
            </div>
          ))}
          {hits.length === 0 ? <p className="empty">{dict.t('cmdEmpty', query)}</p> : null}
        </div>
        <div className="foot">
          <span>
            <b>↑↓</b> {dict.t('cmdHintMove')}
          </span>
          <span>
            <b>↵</b> {dict.t('cmdHintChoose')}
          </span>
          <span>
            <b>esc</b> {dict.t('cmdHintClose')}
          </span>
          {/* The footer follows the keys, not the dialog (spec §7). ⌘K opens
              the palette on every route, but `useRunKeys` is gated on the
              workspace, so under `/docs/*` these two are bound to nothing —
              and a hint for a key that does nothing is the promise D5 exists
              to forbid the mock for printing. `r` and `s` are bound by
              `useDrawerKeys` on the workspace too: the saved boards have both
              drawers since handoff 2, PR 6. */}
          {onWorkspace ? (
            <>
              <span>
                <b>g</b> {dict.t('cmdHintGenerate')}
              </span>
              <span>
                <b>[ ]</b> {dict.t('cmdHintSeed')}
              </span>
              <span>
                <b>r</b> {dict.t('cmdHintReport')}
              </span>
              <span>
                <b>s</b> {dict.t('cmdHintSettings')}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
