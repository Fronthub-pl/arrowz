import { useDictionary } from '../i18n'
import { useStore } from '../state/store'

/**
 * Every reason the run would be refused, in one place under the console. Not
 * inside the knob panel: the console shows one group at a time, so a problem
 * in `lengths` has to stay readable while `shape` is open.
 */
export function Violations() {
  const dict = useDictionary()
  const violations = useStore((state) => state.params.violations)
  if (violations.length === 0) return null
  return (
    <section className="fw-note" id="violations" aria-labelledby="violations-title">
      <b id="violations-title">{dict.t('violationsTitle')}</b>
      <ul>
        {violations.map((violation, at) => (
          <li key={`${violation.kind}-${violation.key}-${at}`}>{dict.violation(violation)}</li>
        ))}
      </ul>
    </section>
  )
}
