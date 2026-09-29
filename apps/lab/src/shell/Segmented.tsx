import type { KeyboardEvent, ReactElement } from 'react'
import { nextIndex, useFocusFollowsSelection } from './roving'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

/**
 * One of a few, as chips: the language, the view, the skeleton. A radio group
 * and not a row of `aria-pressed` buttons, because the choices exclude each
 * other and a screen reader should say "1 of 2".
 *
 * The keyboard is the radio pattern `TabRow` implements for tabs: the arrows
 * move the choice and wrap, Home and End jump, and only the checked radio is a
 * tab stop. Focus follows the choice as `useFocusFollowsSelection` allows, so a
 * choice made elsewhere (a link naming a language) does not pull the focus into
 * the top bar.
 */
export function Segmented<T extends string>({
  label,
  labelledBy,
  describedBy,
  options,
  value,
  onChange,
}: {
  label: string
  /** The id of a visible label; when given it names the group, so the name is not spoken twice. */
  labelledBy?: string | undefined
  /** The id of a paragraph that explains the choice. */
  describedBy?: string | undefined
  options: readonly SegmentedOption<T>[]
  value: T
  onChange(next: T): void
}): ReactElement {
  const at = options.findIndex((option) => option.value === value)
  const focusRef = useFocusFollowsSelection(value)

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const next = nextIndex(event.key, at, options.length, { axis: 'both', wrap: true })
    if (next === null) return
    event.preventDefault()
    const option = options[next]
    if (option) onChange(option.value)
  }

  return (
    <div
      className="fw-seg"
      role="radiogroup"
      aria-label={labelledBy === undefined ? label : undefined}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
    >
      {options.map((option, i) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={i === at}
          // A value no option carries still leaves the group reachable.
          tabIndex={i === at || (at === -1 && i === 0) ? 0 : -1}
          ref={i === at ? focusRef : undefined}
          onClick={() => onChange(option.value)}
          onKeyDown={onKeyDown}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
