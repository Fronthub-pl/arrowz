import type { ReactElement } from 'react'
import { useDictionary } from '../../i18n'
import { useStore } from '../../state/store'
import type { ViewFlag } from '../../state/view.slice'
import { VIEW_ROWS } from '../viewFields'
import { RowShell, rowIds } from './RowShell'

/**
 * A switch as a knob row: its value (`on` / `off`) in the value track, in the
 * numbers' colour, and the switch at the control track's right edge.
 */
export function FlagRow({
  id,
  name,
  title,
  help,
  on,
  onToggle,
  buttonTitle,
}: {
  id: string
  name: string
  title: string
  help: string
  on: boolean
  onToggle(): void
  /** A title on the switch itself, for a row whose control sits apart from its label. */
  buttonTitle?: string | undefined
}): ReactElement {
  const dict = useDictionary()
  const ids = rowIds(id)
  return (
    <RowShell
      id={id}
      name={name}
      helpText={help}
      labelAs="span"
      title={title}
      value={<span className="kv-unit">{dict.t(on ? 'valueOn' : 'valueOff')}</span>}
      control={
        <button
          type="button"
          id={id}
          className="fw-sw"
          role="switch"
          aria-checked={on}
          aria-labelledby={ids.label}
          aria-describedby={ids.help}
          title={buttonTitle}
          onClick={onToggle}
        />
      }
    />
  )
}

/** A view flag from `VIEW_ROWS`, for any owner of a view, as `FieldNumberRow` is. */
export function FieldFlagRow({ flag, on, onToggle }: { flag: ViewFlag; on: boolean; onToggle(): void }): ReactElement {
  const dict = useDictionary()
  const row = VIEW_ROWS[flag]
  return (
    <FlagRow
      id={`view-${flag}`}
      name={dict.t(row.short)}
      title={dict.t(row.label)}
      help={dict.t(row.help)}
      on={on}
      onToggle={onToggle}
    />
  )
}

/** A view flag bound to the lab's slice. */
export function SwitchRow({ flag }: { flag: ViewFlag }): ReactElement {
  const on = useStore((state) => state.view[flag])
  const toggle = useStore((state) => state.view.toggle)
  return <FieldFlagRow flag={flag} on={on} onToggle={() => toggle(flag)} />
}
