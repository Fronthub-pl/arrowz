import type { ReactElement } from 'react'

/**
 * The mock's `Switch.jsx` track (`.fw-sw`, 44×26 with an 18px travel), used
 * for the two options the mock itself does not have. `role="switch"` on a
 * button and `aria-labelledby` against the visible span: the same shape
 * `ViewPanel`'s four switches already use (`ViewPanel.tsx:9-15`), so the lab
 * has one switch and not two.
 */
export function OptionSwitch({
  id,
  label,
  on,
  onChange,
}: {
  id: string
  label: string
  on: boolean
  onChange(next: boolean): void
}): ReactElement {
  return (
    <div className="fw-opt">
      <span className="lab" id={`${id}-label`}>
        {label}
      </span>
      <button
        type="button"
        className="fw-sw"
        role="switch"
        aria-checked={on}
        aria-labelledby={`${id}-label`}
        onClick={() => onChange(!on)}
      />
    </div>
  )
}
