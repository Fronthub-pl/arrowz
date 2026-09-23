import { type ReactElement, useEffect, useRef, useState } from 'react'

/**
 * A number that opens into a text entry. The entry holds a draft string and
 * hands it over on blur or Enter (spec §5.5): clamping per keystroke would turn
 * `0.` into the minimum while someone is still typing `0.85`. Lifted out of
 * `ValueKnob` so the simple view's size and seed fields keep the same rule
 * rather than a second copy of it.
 *
 * No clamp and no store: the caller knows the bounds and where the number goes.
 *
 * A knob row (handoff 2, PR 2) passes its own class and shows only the word
 * when there is one — `auto` in the value track, where the numbers stand —
 * while the simple view keeps the word beside the number.
 */
export function DraftNumber({
  label,
  value,
  word = null,
  describedBy,
  className = 'num',
  wordOnly = false,
  onCommit,
}: {
  label: string
  value: number
  word?: string | null | undefined
  describedBy?: string | undefined
  className?: string | undefined
  wordOnly?: boolean | undefined
  onCommit(typed: number): void
}): ReactElement {
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

  const commit = () => {
    const raw = draft
    setDraft(null)
    if (raw === null) return
    const typed = Number(raw.trim())
    // An unreadable field commits nothing: `clampParam` maps NaN to the knob's
    // default and reports it as a clamp, which is a jump nobody asked for.
    if (raw.trim() === '' || !Number.isFinite(typed)) return
    onCommit(typed)
  }

  return draft === null ? (
    <button
      ref={numRef}
      type="button"
      className={className}
      aria-label={`${label}: ${word ?? value}`}
      aria-describedby={describedBy}
      onClick={() => setDraft(String(value))}
    >
      {word !== null && wordOnly ? (
        word
      ) : (
        <>
          {word === null ? null : <em>{word}</em>}
          {value}
        </>
      )}
    </button>
  ) : (
    <input
      ref={entryRef}
      type="text"
      // A number, typed on a touch keyboard, with a decimal separator.
      inputMode="decimal"
      value={draft}
      aria-label={label}
      aria-describedby={describedBy}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          // Without this, Chromium delivers the same key's `keypress` to
          // whatever has focus *after* the commit — which, thanks to the
          // effect above, is the number button. It activates, and the entry a
          // user just closed reopens.
          event.preventDefault()
          commit()
        }
        // Escape needs no guard: React does not deliver a blur for an element
        // it is unmounting, so `commit` never runs here.
        if (event.key === 'Escape') setDraft(null)
      }}
    />
  )
}
