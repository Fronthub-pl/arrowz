import type { RefObject } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { LiveCommand } from './LiveCommand'
import { OptionSwitch } from './OptionSwitch'
import type { RunControl } from './useRun'

/**
 * The mock's third console track (`.fw-run-col`). It is a child of `Console`
 * rather than a sibling, so PR 4's simple console places the very same element
 * and cannot fork it (Ruling 2).
 *
 * Generate carries the rule twice on purpose: `useRun` refuses silently for
 * the triggers that are not buttons, and the disabled attribute is what a
 * person sees. `RunStatusBar` speaks it (Task 5) and `Violations` spells it out.
 *
 * `goRef` is the route's: the clamp notice dismisses itself and hands the
 * focus to Generate, which is the action the preset that clamped was chosen
 * for. Optional, so that a caller with no notice beside it — this column's
 * own tests today — mounts the column unchanged.
 */
export function RunColumn({
  control,
  goRef,
}: {
  control: RunControl
  goRef?: RefObject<HTMLButtonElement | null> | undefined
}) {
  const dict = useDictionary()
  const running = useStore((state) => state.run.phase === 'running')
  const blocked = useStore((state) => state.params.violations.length > 0)
  const setMany = useStore((state) => state.params.setMany)
  const resetParams = useStore((state) => state.params.reset)
  const auto = useStore((state) => state.ui.auto)
  const help = useStore((state) => state.ui.help)
  const setAuto = useStore((state) => state.ui.setAuto)
  const setHelp = useStore((state) => state.ui.setHelp)

  // `setMany` and not `set`: a seed the machine drew is not a knob a person
  // typed, and only the typed path may wake `auto` (Ruling 3). The range is
  // the old lab's own (`lab-page.ts:919`), and `clampParam` holds it inside
  // PARAM_SPEC's bounds regardless.
  const reseed = () => {
    setMany({ seed: Math.floor(Math.random() * 999999) })
    control.start()
  }
  const defaults = () => {
    resetParams()
    control.start()
  }

  return (
    <section className="fw-run-col" aria-label={dict.t('runColumn')}>
      <LiveCommand />
      <button
        type="button"
        className="fw-go"
        ref={goRef}
        onClick={control.start}
        disabled={running || blocked}
        title={blocked ? dict.t('generateBlocked') : undefined}
      >
        {dict.t('generate')}
      </button>
      <div className="fw-alt">
        <button type="button" onClick={reseed}>
          {dict.t('reseed')}
        </button>
        <button type="button" onClick={defaults}>
          {dict.t('reset')}
        </button>
        <button type="button" onClick={control.abort} disabled={!running}>
          {dict.t('abort')}
        </button>
      </div>
      <div className="fw-ghost">
        <OptionSwitch id="opt-auto" label={dict.t('autoRun')} on={auto} onChange={setAuto} />
        <OptionSwitch id="opt-help" label={dict.t('showHelp')} on={help} onChange={setHelp} />
      </div>
    </section>
  )
}
