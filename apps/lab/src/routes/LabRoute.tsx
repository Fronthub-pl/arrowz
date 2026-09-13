import type { Params } from '@arrowz/engine'
import { useDictionary } from '../i18n'
import { RunStatusBar } from '../stage/RunStatusBar'
import { Stage } from '../stage/Stage'
import { useStore } from '../state/store'
import type { Generator } from '../worker/useGenerator'

/**
 * Always mounted, `hidden` when the route is elsewhere (Ruling 5). The run
 * column of §5.1 arrives in PR 3 and takes the button with it; `params` comes
 * from the shell until the params slice does (PR 3).
 */
export function LabRoute({ generator, params, hidden }: { generator: Generator; params: Params; hidden: boolean }) {
  const dict = useDictionary()
  const running = useStore((state) => state.run.phase === 'running')
  return (
    // `hidden` stays on the <main>: it is what keeps the document from having
    // two visible `main` landmarks. The id belongs on the tabpanel itself,
    // because that is what the tab strip's `aria-controls` has to resolve to
    // (TabRow.tsx:63) — the other two panels put it there too.
    <main hidden={hidden}>
      <section id="lab-panel" role="tabpanel" aria-labelledby="tab-lab-panel" tabIndex={0} className="fw-view">
        <div className="fw-bar">
          <button type="button" className="fw-go" onClick={() => generator.start(params)} disabled={running}>
            {dict.t('generate')}
          </button>
          <RunStatusBar />
        </div>
        <Stage />
      </section>
    </main>
  )
}
