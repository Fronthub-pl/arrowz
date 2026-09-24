import { type RefObject, useRef } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'

/**
 * A preset or a link moved a value into range. The region is mounted from the
 * start and only its content moves: a live region inserted already-populated
 * is not announced by most screen readers.
 *
 * `--warn` and not `--error`: nothing is refused, a value moved.
 *
 * Deliberately unnamed, unlike `RunStatusBar`: `status` is not a landmark, and
 * the message says what it is on its own. The cost is that tests reach it by
 * its text or its class, not by role and name.
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
  // Dismissing removes the focused button, so move the focus on: to Generate
  // (the run the preset was for), or to Abort while a carve is in flight and
  // Generate is disabled. If both are disabled (a clamped link that also broke
  // a rule), focus this region (tabIndex -1), which outlives the dismissal.
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
