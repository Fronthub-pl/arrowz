import type { ReactElement } from 'react'

/** One control's description, as the panel heading lists it (spec R7). */
export interface HelpEntry {
  /** The id controls name in `aria-describedby`. */
  id: string
  label: string
  text: string
}

/** The id a knob's description carries, for every knob shape alike. */
export function descId(key: string): string {
  return `knob-${key}-desc`
}

/**
 * The descriptions of a panel's controls, under its heading rather than in
 * each card: in the cards the longest paragraph set the height of its whole
 * row (review, knob layout). `hidden` hides them from the eye only — `.fw-vh`,
 * never `display: none` — so every `aria-describedby` still resolves (Ruling 9
 * of 2026-09-13-lab-run-triggers).
 */
export function FieldHelp({
  entries,
  hidden = false,
}: {
  entries: readonly HelpEntry[]
  hidden?: boolean | undefined
}): ReactElement | null {
  if (entries.length === 0) return null
  return (
    <dl className={hidden ? 'fw-kdesc fw-vh' : 'fw-kdesc'}>
      {entries.map((entry) => (
        <div key={entry.id}>
          <dt>{entry.label}</dt>
          <dd id={entry.id}>{entry.text}</dd>
        </div>
      ))}
    </dl>
  )
}
