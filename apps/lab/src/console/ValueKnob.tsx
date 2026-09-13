import type { ParamSpec } from '@arrowz/engine'
import { wordFor } from '@arrowz/engine/command'
import { useEffect, useRef, useState } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { boundOn, KnobSlider } from './KnobSlider'

/**
 * One knob: a label, the value with the word the CLI spells it with, a slider,
 * and one paragraph that always says something — the knob's own description,
 * prefixed by whatever is wrong with it right now.
 *
 * Four subscriptions, all by this knob's key. Dragging another knob changes
 * none of them, so this component does not render: that is what the sparse
 * indexes in `params.slice` are for.
 *
 * The inline entry holds a draft string and writes the store on blur or Enter
 * (spec §5.5). Clamping per keystroke would turn `0.` into the minimum while
 * someone is still typing `0.85`.
 */
export function ValueKnob({ spec, bounds = spec }: { spec: ParamSpec; bounds?: { min: number; max: number } }) {
  const dict = useDictionary()
  const value = useStore((state) => state.params.values[spec.key])
  const broken = useStore((state) => state.params.broken[spec.key])
  const inactive = useStore((state) => state.params.inactive[spec.key])
  const floor = useStore((state) => state.params.floor[spec.key])
  const set = useStore((state) => state.params.set)
  const [draft, setDraft] = useState<string | null>(null)

  const numRef = useRef<HTMLButtonElement>(null)
  const entryRef = useRef<HTMLInputElement>(null)
  /** Whether the entry was ever open, so the first render does not steal focus. */
  const edited = useRef(false)
  const editing = draft !== null

  // Focus follows the swap in both directions. `autoFocus` would do half of
  // this and trip `jsx-a11y/no-autofocus`, which is an error here.
  useEffect(() => {
    if (editing) {
      edited.current = true
      entryRef.current?.focus()
      entryRef.current?.select()
    } else if (edited.current) {
      numRef.current?.focus()
    }
  }, [editing])

  const { label, help } = dict.paramText(spec)
  const word = wordFor(spec.key, value)
  // The same answer the marker draws, from the same predicate: a bound stated
  // only as a mark is a bound only a mouse can read.
  const bound = boundOn(floor, bounds)
  const state = broken
    ? broken.map((v) => dict.violation(v)).join('; ')
    : inactive
      ? `${dict.t('inactivePrefix')}${dict.reason(inactive)}`
      : bound === undefined
        ? null
        : dict.t('ruleBound', bound)
  // The description is always present; the state, when there is one, goes in
  // front of it — the shape the old lab builds with `help.dataset.why`.
  const why = state === null ? help : `${state}. ${help}`
  const whyId = `knob-${spec.key}-why`

  const commit = () => {
    const raw = draft
    setDraft(null)
    if (raw === null) return
    const typed = Number(raw.trim())
    // An unreadable field commits nothing: `clampParam` maps NaN to the knob's
    // default and reports it as a clamp, which is a jump nobody asked for.
    if (raw.trim() === '' || !Number.isFinite(typed)) return
    // Held inside the *passed* bounds first: the mix row's own range is
    // narrower than the knob's, and only it knows that.
    set(spec.key, Math.min(bounds.max, Math.max(bounds.min, typed)))
  }

  return (
    <div className={`fw-k${broken ? ' bad' : ''}${inactive ? ' off' : ''}`}>
      <div className="top">
        <label className="lab" htmlFor={`knob-${spec.key}`}>
          {label}
        </label>
        {draft === null ? (
          <button
            ref={numRef}
            type="button"
            className="num"
            aria-label={`${label}: ${word ?? value}`}
            onClick={() => setDraft(String(value))}
          >
            {word === null ? null : <em>{word}</em>}
            {value}
          </button>
        ) : (
          <input
            ref={entryRef}
            type="text"
            // A number, typed on a touch keyboard, with a decimal separator.
            inputMode="decimal"
            value={draft}
            aria-label={label}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                // Without this, Chromium delivers the same key's `keypress` to
                // whatever has focus *after* the commit — which, thanks to the
                // effect above, is the number button. It activates, and the
                // entry a user just closed reopens.
                event.preventDefault()
                commit()
              }
              // Escape needs no guard: React does not deliver a blur for an
              // element it is unmounting, so `commit` never runs here.
              if (event.key === 'Escape') setDraft(null)
            }}
          />
        )}
      </div>
      <KnobSlider
        spec={spec}
        id={`knob-${spec.key}`}
        value={value}
        bounds={bounds}
        floor={floor}
        label={label}
        describedBy={whyId}
        onCommit={(next) => set(spec.key, next)}
      />
      <p className="why" id={whyId}>
        {why}
      </p>
    </div>
  )
}
