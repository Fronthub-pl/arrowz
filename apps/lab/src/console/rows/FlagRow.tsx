import type { ReactElement } from 'react'
import { useDictionary } from '../../i18n'
import { useStore } from '../../state/store'
import type { ViewFlag } from '../../state/view.slice'
import { KnobLine, useKnobHelp } from '../KnobRow'
import { VIEW_ROWS } from '../viewFields'

/**
 * A preview flag as a knob row: its value (`on` / `off`) in the value track,
 * in the numbers' colour, and the switch at the control track's right edge.
 */
export function SwitchRow({ flag }: { flag: ViewFlag }): ReactElement {
  const on = useStore((state) => state.view[flag])
  const toggle = useStore((state) => state.view.toggle)
  return <FlagRow flag={flag} on={on} onToggle={() => toggle(flag)} />
}

/** The switch row itself, for any owner of a view, as `NumberRow` is. */
export function FlagRow({ flag, on, onToggle }: { flag: ViewFlag; on: boolean; onToggle(): void }): ReactElement {
  const dict = useDictionary()
  const row = VIEW_ROWS[flag]
  const name = dict.t(row.short)
  const helpId = `view-${flag}-help`
  const { button, paragraph } = useKnobHelp(helpId, name, dict.t(row.help))
  return (
    <div className="kv-row" title={dict.t(row.label)}>
      <KnobLine
        label={
          <span className="kv-lab" id={`view-${flag}-label`}>
            {name}
          </span>
        }
        help={button}
        value={<span className="kv-unit">{dict.t(on ? 'valueOn' : 'valueOff')}</span>}
        control={
          <button
            type="button"
            id={`view-${flag}`}
            className="fw-sw"
            role="switch"
            aria-checked={on}
            aria-labelledby={`view-${flag}-label`}
            aria-describedby={helpId}
            onClick={onToggle}
          />
        }
      />
      {paragraph}
    </div>
  )
}
