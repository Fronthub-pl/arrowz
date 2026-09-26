import type { ReactElement } from 'react'
import { KnobLine, useKnobHelp } from '../KnobRow'

/**
 * One colour as a row: its hex in the value track, the colour input at the
 * control track's right edge, and — where the empty value means something —
 * the clear button before it: paper and ink use it to hand the field back to
 * the theme, which a colour input has no way to express on its own.
 */
export function ColourRow({
  id,
  short,
  help,
  title,
  value,
  onChange,
  onClear,
  clearLabel,
}: {
  id: string
  short: string
  help: string
  title: string
  value: string
  onChange(color: string): void
  onClear?: (() => void) | undefined
  clearLabel?: string | undefined
}): ReactElement {
  const helpId = `${id}-help`
  const { button, paragraph } = useKnobHelp(helpId, short, help)
  return (
    <div className="kv-row" title={title}>
      <KnobLine
        label={
          <label className="kv-lab" htmlFor={id}>
            {short}
          </label>
        }
        help={button}
        value={<span className="kv-unit">{value}</span>}
        control={
          <span className="kv-colour">
            {onClear === undefined ? null : (
              <button type="button" className="fw-palette-remove" aria-label={clearLabel} onClick={onClear}>
                ×
              </button>
            )}
            <input
              id={id}
              type="color"
              value={value}
              aria-describedby={helpId}
              onChange={(e) => onChange(e.target.value)}
            />
          </span>
        }
      />
      {paragraph}
    </div>
  )
}
