import { type ReactElement, useEffect, useRef, useState } from 'react'

/**
 * A number that opens into a text entry. The entry holds a draft string and
 * hands it over on blur or Enter: clamping per keystroke would turn `0.` into
 * the minimum while someone is still typing `0.85`. Shared by the knob rows
 * and the simple view's size and seed fields.
 *
 * No clamp and no store: the caller knows the bounds and where the number goes.
 * A knob row passes `wordOnly` to show just the word (`auto`) in its value
 * track; the simple view keeps the word beside the number.
 */
export function DraftNumber({
  label,
  value,
  word = null,
  describedBy,
  className = 'num',
  wordOnly = false,
  decimal = false,
  onCommit,
}: {
  label: string
  value: number
  word?: string | null | undefined
  describedBy?: string | undefined
  className?: string | undefined
  wordOnly?: boolean | undefined
  /** Whether a comma may stand for the decimal point: a fractional field only, where it cannot be a thousands separator. */
  decimal?: boolean | undefined
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
    // One decimal comma, as a Polish keypad types it; `1,2,3` stays unreadable.
    const text = decimal ? raw.trim().replace(',', '.') : raw.trim()
    const typed = Number(text)
    // An unreadable field commits nothing: `clampParam` maps NaN to the knob's
    // default and reports it as a clamp, which is a jump nobody asked for.
    if (text === '' || !Number.isFinite(typed)) return
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
