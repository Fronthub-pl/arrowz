import { useEffect, useRef } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import type { ViewFlag } from '../state/view.slice'
import { panelId, tabId } from './GroupRail'
import { VIEW_FIELDS, type ViewField } from './viewFields'

/** The four flags, in the order the old lab lists them. */
const FLAGS: readonly { flag: ViewFlag; label: 'rounded' | 'colored' | 'hilite' | 'voids' }[] = [
  { flag: 'rounded', label: 'rounded' },
  { flag: 'colored', label: 'colored' },
  { flag: 'hilite', label: 'hilite' },
  { flag: 'voids', label: 'voids' },
]

/**
 * One preview number. Uncontrolled on purpose, and it is the same reason the
 * old lab is: a controlled `type="number"` rewrites its own value, and a
 * half-typed `0.` reads back as the empty string — so React would put the
 * default into the box under the cursor. The field owns its text while it is
 * being typed into; the store owns it the rest of the time, which is exactly
 * the `document.activeElement` guard the old lab uses for its second seed
 * field (`lab-page.ts:679-681`), kept where it is actually needed.
 */
function ViewNumberField({ field }: { field: ViewField }) {
  const dict = useDictionary()
  const value = useStore((state) => state.view[field.field])
  const setNumber = useStore((state) => state.view.setNumber)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const node = ref.current
    if (node && document.activeElement !== node) node.value = String(value)
  }, [value])

  const commit = () => {
    const node = ref.current
    if (!node) return
    setNumber(field.field, node.value)
    // The store may have clamped; show what it stored, not what was typed.
    node.value = String(useStore.getState().view[field.field])
  }

  return (
    <div className="fw-k">
      <div className="top">
        <label className="lab" htmlFor={`view-${field.field}`}>
          {dict.t(field.label)}
        </label>
        <input
          ref={ref}
          type="number"
          id={`view-${field.field}`}
          className="num"
          min={field.min}
          max={field.max}
          step={field.step}
          defaultValue={String(value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
          }}
        />
      </div>
      {field.help === undefined ? null : <p className="why">{dict.t(field.help)}</p>}
    </div>
  )
}

/**
 * The mock's *element* section: the nine preview fields. They are not knobs —
 * the engine never sees them — so they carry no violation and no inactive
 * reason, and editing one redraws the board without generating (§2.2).
 *
 * A field commits on blur and on Enter, through `viewNumberOf`: an empty or
 * unreadable field is the default, and anything past what the CLI takes is
 * clamped in.
 */
export function ViewPanel() {
  const dict = useDictionary()
  const view = useStore((state) => state.view)
  return (
    <div className="fw-knobs" role="tabpanel" id={panelId('preview')} aria-labelledby={tabId('preview')}>
      <div className="fw-khd">
        <b>{dict.t('preview')}</b>
      </div>
      <div className="fw-grid">
        {VIEW_FIELDS.map((field) => (
          <ViewNumberField key={field.field} field={field} />
        ))}
        {FLAGS.map(({ flag, label }) => (
          <div className="fw-k" key={flag}>
            <div className="row">
              <span className="lab" id={`view-${flag}-label`}>
                {dict.t(label)}
              </span>
              <button
                type="button"
                className="fw-sw"
                role="switch"
                aria-checked={view[flag]}
                aria-labelledby={`view-${flag}-label`}
                onClick={() => view.toggle(flag)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
