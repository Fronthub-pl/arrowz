import { Console } from '../console/Console'
import { Violations } from '../console/Violations'
import { useDictionary } from '../i18n'
import { RunStatusBar } from '../stage/RunStatusBar'
import { Stage } from '../stage/Stage'
import { useStore } from '../state/store'
import type { GeneratorHandle } from '../worker/useGenerator'

/**
 * Always mounted, `hidden` when the route is elsewhere (Ruling 5). The run
 * column of §5.1 arrives in PR 4 and takes the button with it.
 */
export function LabRoute({ generator, hidden }: { generator: GeneratorHandle; hidden: boolean }) {
  const dict = useDictionary()
  const running = useStore((state) => state.run.phase === 'running')
  const blocked = useStore((state) => state.params.violations.length > 0)
  // Read at the click, not through a subscription: the button does not need
  // to rerender on every knob edit, and `getState()` is the value at the
  // moment the run starts — which is exactly what the run must use.
  const start = () => generator.start(useStore.getState().params.values)
  return (
    // `hidden` stays on the <main>: it is what keeps the document from having
    // two visible `main` landmarks. The id belongs on the tabpanel itself,
    // because that is what the tab strip's `aria-controls` has to resolve to
    // (TabRow.tsx:63) — the other two panels put it there too.
    <main hidden={hidden}>
      <section id="lab-panel" role="tabpanel" aria-labelledby="tab-lab-panel" tabIndex={0} className="fw-view">
        <div className="fw-bar">
          <button
            type="button"
            className="fw-go"
            onClick={start}
            disabled={running || blocked}
            title={blocked ? dict.t('generateBlocked') : undefined}
          >
            {dict.t('generate')}
          </button>
          <RunStatusBar />
        </div>
        <div className="fw-lab">
          <Stage />
          <Console />
          <Violations />
        </div>
      </section>
    </main>
  )
}
