import type { Params, PresetMode } from '@arrowz/engine'
import { findPreset, PRESETS } from '@arrowz/engine/presets'
import { type ReactElement, useEffect, useId, useRef, useState } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { applyPreset } from './actions'
import type { RunControl } from './useRun'

/** The last row index of level `col`, for the arrow keys' clamp. */
function lastRow(col: number): number {
  return (PRESETS[col]?.options.length ?? 1) - 1
}

const MODES: readonly PresetMode[] = ['square', 'portrait', 'tunnels', 'skeleton', 'serpentine']

/**
 * The preset picker: one trigger in the 38px row, naming the preset the knobs
 * spell and its size, and under it a panel with one column per level.
 * A disclosure, not a menu: `aria-haspopup="menu"` would promise a `role="menu"`
 * and menu keyboarding this panel does not have.
 *
 * The panel is always mounted and `hidden` while closed, so `aria-controls`
 * always names an element. Its keys are a capture-phase document listener,
 * installed only while open, so it runs before the drawer's Escape, which it
 * consumes. It acts only on keys pressed inside the strip, and focus leaving
 * the strip closes it.
 */
export function PresetStrip({ control }: { control: RunControl }): ReactElement {
  const dict = useDictionary()
  const values = useStore((state) => state.params.values)
  const current = findPreset(values)
  // `PresetLevel.id` is a `string` and the dictionary's `levels` a fixed-key
  // object, so the index needs narrowing.
  const levels = dict.d.presets.levels as Partial<Record<string, string>>
  const level = current === null ? undefined : PRESETS.find((entry) => entry.options.includes(current))
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const captionId = `${panelId}-cap`

  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const panel = root.current?.querySelector('.fw-pp-panel')
    const first =
      panel?.querySelector<HTMLButtonElement>('button[aria-current="true"]') ??
      panel?.querySelector<HTMLButtonElement>('button')
    // No scroll: in a low window the panel is `position: fixed` under the top
    // bar, and a focus that scrolled `.fw-top` would shift the bar.
    first?.focus({ preventScroll: true })

    const onPress = (event: PointerEvent) => {
      if (event.target instanceof Node && root.current?.contains(event.target)) return
      setOpen(false)
    }
    // Focus that has left the strip (Tab onwards, a click into a knob entry)
    // takes the panel with it. A `null` `relatedTarget` is focus to nowhere,
    // a press on the page's body, which the pointerdown rule above handles.
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget
      if (next instanceof Node && !(root.current?.contains(next) ?? false)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      // Only keys pressed inside the strip are the picker's: an Escape in a
      // knob entry discards its draft, and stealing the focus to the trigger
      // would blur the entry and commit the draft instead.
      if (!(event.target instanceof Node) || !(root.current?.contains(event.target) ?? false)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        trigger.current?.focus()
        return
      }
      const at = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-col]') : null
      if (at === null) return
      const col = Number(at.dataset.col)
      const row = Number(at.dataset.row)
      let c = col
      let r = row
      if (event.key === 'ArrowDown') r = Math.min(row + 1, lastRow(col))
      else if (event.key === 'ArrowUp') r = Math.max(row - 1, 0)
      else if (event.key === 'ArrowRight') c = Math.min(col + 1, PRESETS.length - 1)
      else if (event.key === 'ArrowLeft') c = Math.max(col - 1, 0)
      else if (event.key === 'Home') r = 0
      else if (event.key === 'End') r = lastRow(col)
      else return
      event.preventDefault()
      r = Math.min(r, lastRow(c))
      root.current?.querySelector<HTMLButtonElement>(`[data-col="${c}"][data-row="${r}"]`)?.focus()
    }
    const strip = root.current
    document.addEventListener('pointerdown', onPress)
    document.addEventListener('keydown', onKey, true)
    strip?.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('pointerdown', onPress)
      document.removeEventListener('keydown', onKey, true)
      strip?.removeEventListener('focusout', onFocusOut)
    }
  }, [open])

  // The same action as the palette row; see `applyPreset`.
  const choose = (params: Partial<Params>) => {
    applyPreset(control, params)
    close(true)
  }

  return (
    <div className="fw-presets" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="fw-pp-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
      >
        <span className="k">{dict.t('preset')}</span>
        {current === null || level === undefined ? (
          <span className="none">{dict.t('customSettings')}</span>
        ) : (
          <>
            <span>{`${levels[level.id] ?? level.id} ${dict.d.presets.modes[current.mode]}`}</span>
            <span className="d">{`${current.params.W ?? 0}×${current.params.H ?? 0}`}</span>
          </>
        )}
        <span className="caret" aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </button>
      {current === null ? <span className="fw-pp-edited">{dict.t('editedSinceLastPreset')}</span> : null}
      <div
        className="fw-pp-panel"
        id={panelId}
        role="group"
        aria-label={dict.t('presetsLabel')}
        aria-describedby={captionId}
        hidden={!open}
      >
        <p id={captionId} className="fw-pp-cap">
          {dict.d.presets.caption}
        </p>
        {PRESETS.map((entry, c) => {
          const levelName = levels[entry.id] ?? entry.id
          const headingId = `${panelId}-${entry.id}`
          return (
            <div key={entry.id} className="fw-pp-col" role="group" aria-labelledby={headingId}>
              <h3 id={headingId}>{levelName}</h3>
              {entry.options.map((option, r) => {
                const W = option.params.W ?? 0
                const H = option.params.H ?? 0
                const mode = dict.d.presets.modes[option.mode]
                const help = dict.d.presets.modeHelp[option.mode]
                return (
                  <button
                    key={option.id}
                    type="button"
                    data-col={c}
                    data-row={r}
                    {...(current?.id === option.id ? { 'aria-current': true } : {})}
                    aria-label={`${levelName} ${W}×${H} ${mode}`}
                    aria-describedby={`${panelId}-mode-${option.mode}`}
                    title={help}
                    onClick={() => choose(option.params)}
                  >
                    <span>{mode}</span>
                    <span className="d">{`${W}×${H}`}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
        <div hidden>
          {MODES.map((mode) => (
            <span key={mode} id={`${panelId}-mode-${mode}`}>
              {dict.d.presets.modeHelp[mode]}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
