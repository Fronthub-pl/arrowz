import { boardViewOf } from '@arrowz/board-element'
import { type ReactElement, useLayoutEffect, useMemo, useRef } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'
import { BoardCanvas } from './BoardCanvas'

/**
 * The paper frame around the one `<arrowz-board>`, and what sits on it: the
 * annotation of the board on screen and the solo toggle (spec
 * §5.1). Both come after the element in DOM order, because the element's host
 * is opaque and positioned, so tree order is what puts them on top; both are
 * absolutely positioned in `.fw-board`, so they take no height from the
 * element, and both keep to the top edge, which the element's own bar leaves
 * free (arrowz-board.ts:178-185).
 *
 * The element's view is memoised on the *slice's* identity, not rebuilt per
 * render: `run.progressed()` replaces `state.run` and leaves `state.view` and
 * `state.result` alone, so a run's progress messages reassign nothing on the element, while
 * editing a preview field redraws the board without generating.
 */
export function BoardFrame(): ReactElement {
  const dict = useDictionary()
  const result = useStore((state) => state.result.shown)
  const view = useStore((state) => state.view)
  const lang = useStore((state) => state.lang.lang)
  const elementView = useMemo(() => boardViewOf(viewOf(view), view.voids), [view])
  const solo = useStore((state) => state.ui.solo)
  const toggleSolo = useStore((state) => state.ui.toggleSolo)
  const toggle = useRef<HTMLButtonElement>(null)

  // Solo hides everything in the lab but the stage's board (console.css), and
  // HTML's focus fixup would drop a focus left in there onto <body> at the next
  // rendering step. A layout effect runs before that step, while the focus is
  // still where it was; it moves to the toggle, which is how solo is undone
  // (spec §5.1). Only on the way in, and only a focus inside the lab and outside
  // this frame: the tab strip, the top bar and the run status stay on screen.
  useLayoutEffect(() => {
    const button = toggle.current
    if (!solo || button === null) return
    const active = document.activeElement
    const lab = button.closest('.fw-lab')
    const frame = button.closest('.fw-boardwrap')
    if (active !== null && lab !== null && lab.contains(active) && frame !== null && !frame.contains(active)) {
      button.focus()
    }
  }, [solo])
  return (
    <div className="fw-boardwrap">
      <div className="fw-board">
        {/* `enableColors`: the element draws in ink unless its host grants
            colours, and the lab does, as the old lab's `enable-colors` does
            (lab.html) — without it the `colored` flag reaches the element and
            changes nothing on screen. */}
        <BoardCanvas board={result?.board ?? null} view={elementView} interactive={false} lang={lang} enableColors />
        {result === null ? null : (
          <span className="fw-anno">
            {dict.t('boardAnnotation', result.params.W, result.params.H, result.params.seed)}
          </span>
        )}
        {/* Its own glyph: `⤢` is the element's fit button (PR 4b, Ruling 3). */}
        <button
          ref={toggle}
          type="button"
          className="fw-solo"
          aria-label={dict.t('fullView')}
          title={dict.t('fullView')}
          aria-pressed={solo}
          onClick={toggleSolo}
        >
          ⛶
        </button>
      </div>
    </div>
  )
}
