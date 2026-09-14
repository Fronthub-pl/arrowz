import { type RefObject, useRef } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'

/**
 * A preset or a link moved a value into range — the old lab's `showClamped`
 * as a component (`lab-page.ts:701-704`). The region is mounted from the
 * start and only its content moves: a live region inserted already-populated
 * is not announced by most screen readers, and `RunStatusBar.tsx:105-109`
 * already sets the pattern this follows.
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
export function ClampNotice({
  focusOnDismiss,
  focusOnAbort,
}: {
  focusOnDismiss: RefObject<HTMLButtonElement | null>
  focusOnAbort?: RefObject<HTMLButtonElement | null> | undefined
}) {
  const dict = useDictionary()
  const clamped = useStore((state) => state.ui.clamped)
  const raiseClamped = useStore((state) => state.ui.raiseClamped)
  const box = useRef<HTMLDivElement>(null)
  // The button dismisses itself, so focus would land on <body> and a keyboard
  // user would restart from the top of the document. It goes to the action
  // most likely to come next, which is the run the preset was chosen for.
  //
  // Unless that action is refused: this notice appears exactly when a preset
  // has just started a run, and Generate is disabled while one is in flight
  // (`RunColumn.tsx:139`) — and `focus()` on a disabled button is a no-op, so
  // dismissing during a long carve dropped the keyboard user on <body> after
  // all. In exactly that state Abort is live: it is out on `!running`
  // (`RunColumn.tsx:151`) while Generate is out on `running || blocked`
  // (`:139`), so a carve in flight with the rules kept is precisely the state
  // that refuses the one and offers the other — and Abort is then a visible,
  // named control inside the run column, a better landing spot than the region
  // below. The two conditions are not complements, though: a link that clamped
  // a value and also broke a rule leaves both disabled, and in that state
  // focus falls back to this region itself, at `tabIndex={-1}`:
  // programmatic focus only, never a tab stop, and the next Tab carries on
  // from where the notice was rather than from the top of the document. The
  // element outlives the dismissal — only its content moves — so it is still
  // there to take the focus after `raiseClamped(false)`.
  const dismiss = () => {
    raiseClamped(false)
    const go = focusOnDismiss.current
    const abort = focusOnAbort?.current ?? null
    if (go !== null && !go.disabled) go.focus()
    else if (abort !== null && !abort.disabled) abort.focus()
    else box.current?.focus()
  }
  return (
    <div ref={box} tabIndex={-1} role="status" className={clamped ? 'fw-note hold' : undefined}>
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
