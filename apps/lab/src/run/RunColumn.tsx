import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { LiveCommand } from './LiveCommand'
import type { RunControl } from './useRun'

/**
 * The mock's third console track (`.fw-run-col`). It is a child of `Console`
 * rather than a sibling, so PR 4's simple console places the very same element
 * and cannot fork it (Ruling 2).
 *
 * Generate carries the rule twice on purpose: `useRun` refuses silently for
 * the triggers that are not buttons, and the disabled attribute is what a
 * person sees. `RunStatusBar` speaks it (Task 5) and `Violations` spells it out.
 */
export function RunColumn({ control }: { control: RunControl }) {
  const dict = useDictionary()
  const running = useStore((state) => state.run.phase === 'running')
  const blocked = useStore((state) => state.params.violations.length > 0)
  return (
    <section className="fw-run-col" aria-label={dict.t('runColumn')}>
      <LiveCommand />
      <button
        type="button"
        className="fw-go"
        onClick={control.start}
        disabled={running || blocked}
        title={blocked ? dict.t('generateBlocked') : undefined}
      >
        {dict.t('generate')}
      </button>
      <div className="fw-alt">
        <button type="button" onClick={control.abort} disabled={!running}>
          {dict.t('abort')}
        </button>
      </div>
    </section>
  )
}
