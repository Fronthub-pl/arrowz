import type { RefObject } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'

/**
 * A preset or a link moved a value into range — the old lab's `showClamped`
 * as a component (`lab-page.ts:701-704`). The region is mounted from the
 * start and only its content moves: a live region inserted already-populated
 * is not announced by most screen readers, and `RunStatusBar.tsx:81` already
 * sets the pattern this follows.
 *
 * `--warn` and not `--error`: nothing is refused, a value moved, and §7.1
 * reserves warn for exactly that.
 *
 * The region is deliberately unnamed, unlike `RunStatusBar`'s. `status` is not
 * a landmark, so the name is not something a reader navigates by, and what is
 * announced here is the whole message, which says what it is on its own — the
 * status bar's "Board closed 100%." does not, which is why that one carries a
 * name. The cost is that this region has no stable handle: a whole-page test
 * wanting it must reach for the message text or the class, because the run
 * status bar is the one `getByRole('status', { name: 'Run status' })` finds.
 * A dictionary key used by nothing but a test would buy the handle; that is
 * the trade, and it was taken on purpose rather than overlooked.
 */
export function ClampNotice({ focusOnDismiss }: { focusOnDismiss: RefObject<HTMLButtonElement | null> }) {
  const dict = useDictionary()
  const clamped = useStore((state) => state.ui.clamped)
  const raiseClamped = useStore((state) => state.ui.raiseClamped)
  // The button dismisses itself, so focus would land on <body> and a keyboard
  // user would restart from the top of the document. It goes to the action
  // most likely to come next, which is the run the preset was chosen for.
  const dismiss = () => {
    raiseClamped(false)
    focusOnDismiss.current?.focus()
  }
  return (
    <div role="status" className={clamped ? 'fw-note hold' : undefined}>
      {clamped ? (
        <>
          <b>{dict.t('clamped')}</b>
          <button type="button" onClick={dismiss}>
            {dict.t('dismiss')}
          </button>
        </>
      ) : null}
    </div>
  )
}
