import { VIEW_RANGE, viewNumberOf } from '@arrowz/engine/command'
import { useEffect, useRef } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import type { ViewFlag } from '../state/view.slice'
import { panelId, tabId } from './GroupRail'
import { VIEW_FIELDS, type ViewField } from './viewFields'

/** The four flags, in the order the old lab lists them. */
export const VIEW_FLAGS: readonly { flag: ViewFlag; label: 'rounded' | 'colored' | 'hilite' | 'voids' }[] = [
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
 *
 * For PR 5: the library's preview carries a second copy of three of these
 * fields (`libStroke`, `libHeadWidth`, `libHeadHeight` in lab.html), and
 * carve.test.ts checks all eight ids against `VIEW_RANGE` today. That test dies
 * with lab.html in PR 8, so the library's three have to come through this
 * component — reusing it is what keeps them measured once carve.test.ts is gone.
 */
export function ViewNumberField({
  field,
  value,
  onCommit,
}: {
  field: ViewField
  value: number
  onCommit(value: number): void
}) {
  const dict = useDictionary()
  const ref = useRef<HTMLInputElement>(null)
  // The engine's own bounds, not a copy of them: `commit` clamps through
  // `viewNumberOf`, which reads the same table, so the box cannot declare a
  // ceiling different from the one it enforces.
  const range = VIEW_RANGE[field.field]

  useEffect(() => {
    const node = ref.current
    if (node && document.activeElement !== node) node.value = String(value)
  }, [value])

  // The clamp lives here rather than in each owner: the lab's slice clamps in
  // `setNumber` and the library's detail has no slice to clamp in, so a field
  // that handed on what was typed would leave one of its two owners to
  // remember. The box then shows what was actually kept.
  const commit = () => {
    const node = ref.current
    if (!node) return
    const kept = viewNumberOf(node.value, field.field)
    onCommit(kept)
    node.value = String(kept)
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
          min={range.min}
          max={range.max}
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

/** One preview flag as the mock's switch, labelled by its visible text. */
export function ViewFlagSwitch({
  flag,
  label,
  on,
  onToggle,
}: {
  flag: ViewFlag
  label: (typeof VIEW_FLAGS)[number]['label']
  on: boolean
  onToggle(): void
}) {
  const dict = useDictionary()
  return (
    <div className="fw-k">
      <div className="row">
        <span className="lab" id={`view-${flag}-label`}>
          {dict.t(label)}
        </span>
        <button
          type="button"
          className="fw-sw"
          role="switch"
          aria-checked={on}
          aria-labelledby={`view-${flag}-label`}
          onClick={onToggle}
        />
      </div>
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
          <ViewNumberField
            key={field.field}
            field={field}
            value={view[field.field]}
            onCommit={(value) => view.setNumber(field.field, String(value))}
          />
        ))}
        {VIEW_FLAGS.map(({ flag, label }) => (
          <ViewFlagSwitch key={flag} flag={flag} label={label} on={view[flag]} onToggle={() => view.toggle(flag)} />
        ))}
      </div>
    </div>
  )
}
