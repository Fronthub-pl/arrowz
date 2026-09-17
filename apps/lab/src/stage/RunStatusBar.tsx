import { genSeconds } from '@arrowz/engine/report'
import { useDictionary } from '../i18n'
import { useInLibrary } from '../library/useInLibrary'
import type { LibraryNotice } from '../state/library.slice'
import { useStore } from '../state/store'

/**
 * A compile-time trap, not a runtime one: called only from a `switch`'s
 * `default` after every named `LibraryNotice.kind` has its own case, so the
 * parameter's type is `never` if the union and this function still agree. A
 * sixth kind added to the union without a case here stops compiling right
 * here, instead of silently falling through to `deleteFailed`'s sentence.
 */
function assertNever(value: never): never {
  throw new Error(`unreachable notice kind: ${JSON.stringify(value)}`)
}

function noticeText(dict: ReturnType<typeof useDictionary>, notice: LibraryNotice): string {
  switch (notice.kind) {
    case 'loading':
      return dict.t('loadingBoard', notice.name)
    case 'viewSaved':
      return dict.t('viewSaved', notice.name)
    case 'deleted':
      return dict.t('deletedBoard', notice.name)
    case 'saveFailed':
      return dict.t('notSaved')
    case 'deleteFailed':
      return dict.t('deleteFailed')
    default:
      return assertNever(notice)
  }
}

/**
 * The live region. The mock's run state has no `aria-live`, so a screen reader
 * would never learn that a thirty-second carve had finished (§7.2). `<output>`
 * already has the `status` role — writing it again is what
 * `jsx-a11y/no-redundant-roles` exists to catch.
 */
export function RunStatusBar() {
  const dict = useDictionary()
  const run = useStore((state) => state.run)
  // The board on screen and the store's answer for it: the result slice's,
  // which a run in flight leaves where it was (spec §5.3).
  const report = useStore((state) => state.result.shown?.report ?? null)
  const saved = useStore((state) => state.result.saved)
  const blocked = useStore((state) => state.params.violations.length > 0)
  const preview = useStore((state) => state.result.preview)
  const boardError = useStore((state) => state.library.boardError)
  const notice = useStore((state) => state.library.notice)
  const inLibrary = useInLibrary()

  let text: string
  // Whether this line is speaking for a run at all. `saved` is a fact about the
  // board on screen — only the result slice's `show` and `reset` clear it — and
  // not about whatever the line happens to be saying. Appended to the refusal,
  // it read `Fix the settings marked in red to generate — saved`: a sentence
  // about a board nobody is looking at, glued to a sentence about the knobs.
  let reportsRun = false
  // Ruling 8: while the library has a board on screen, the line is about that
  // board. A stored board is not a run: the store's answer (`saved`) is a fact
  // about the run's result and is never appended here, and a carve in flight
  // still reports itself in the lab, where the user can see it.
  //
  // Both branches ask the tab and not the preview alone (Ruling O): the route
  // changes a render before the hook's effect clears these two, so on the way
  // back to `/` the lab would otherwise announce a stored board for one frame.
  // Ruling 5: an event outranks the description of a state, because it is the
  // thing that just happened and the line is the one place to say it. It gives
  // way on its own, 1200 ms later (`notices.ts`), except for `loading` and
  // `saveFailed`, which describe a state and are cleared by their outcome.
  if (inLibrary && notice !== null) {
    text = noticeText(dict, notice)
  } else if (inLibrary && boardError !== null) {
    // The address and the failure arrive as two fields (`BoardError` in
    // library.slice.ts), so the words around them stay the dictionary's and a
    // reason carrying a `: ` of its own reaches it whole. They used to arrive
    // joined by `: `, which this line split back apart — a contract between two
    // modules about a separator that also occurs inside a reason.
    text = dict.t('boardFileError', boardError.name, boardError.reason)
  } else if (inLibrary && preview !== null) {
    const meta = preview.meta
    text = dict.t('savedBoard', `${meta.W}x${meta.H}/${meta.id}`, meta.seed, meta.source, `${genSeconds(meta, '—')} s`)
  } else if (run.phase === 'running') {
    const p = run.progress
    // The share done is measured in cells left, not pieces made, and the two
    // counts are abbreviated with `short`, not `fmt`.
    //
    // The dictionary's `progress` string carries `<b>` markup. This line is
    // the text of an `aria-live` region, so the tags would show up literally —
    // a visible defect in the page's primary status line, not a wart worth
    // preserving — and they are stripped here rather than in the dictionary,
    // which stays the source of truth. PR 4 replaces this line with the
    // report's own markup and takes the tags back. Stripping is not a licence
    // for `dangerouslySetInnerHTML`: an `aria-live` region has to be text.
    if (p === null) {
      // The size is the run's, not the console's: it is read at the moment
      // `run()` fires, and a knob edited during a carve must not rewrite the
      // warning about the carve already going.
      const started = run.params
      const cells = started === null ? 0 : started.W * started.H
      text =
        started !== null && cells > 200_000
          ? dict.t('generatingBig', started.W, started.H, dict.fmt(cells))
          : dict.t('generating')
    } else {
      text = dict
        .t(
          'progress',
          (100 * (1 - p.remaining / p.total)).toFixed(1),
          dict.short(p.pieces),
          dict.short(p.remaining),
          p.backtracks,
          (p.ms / 1000).toFixed(1),
        )
        .replace(/<\/?b>/g, '')
    }
  } else if (blocked) {
    // The refusal outranks every phase but `running`. It used to sit inside
    // the idle branch, which was the whole story until the page started
    // carving a board at load: the slice is `done` from the first second of
    // every session and stays there, so a knob dragged into a violation with
    // `auto` on refused silently while this line still reported the last
    // board as closed — a page that is refusing, describing a board that did
    // not answer the knobs on screen. `running` keeps its own line, because a
    // carve in flight is the one thing that has more to say than the refusal
    // and is entitled to report itself.
    text = dict.t('generateBlocked')
  } else if (run.phase === 'error') {
    // Both failure paths land here: the worker's `error` message (a thrown
    // InvalidParamsError) and its `onerror` both call the slice's `failed()`
    // (useGenerator.ts:67, :77, :82), so the phase no longer says which
    // happened and this component always prints `generationError`. The
    // previous lab keeps the two words apart; `workerError` (lab-i18n.ts:125) is
    // unreachable from here until the slice carries the distinction.
    text = `${dict.t('generationError')} ${run.message ?? ''}`
  } else if (run.phase !== 'done' || report === null) {
    // Idle, and two idles are distinguishable here: aborted and fresh. The
    // third, refused, is the branch above — a page that says "Press Generate"
    // beside a Generate it has disabled is telling the user to do the
    // impossible, whichever phase the last run left behind.
    text = run.wasAborted ? dict.t('aborted') : dict.t('pressGenerate')
  } else if (report.ok) {
    reportsRun = true
    text = dict.t('closed')
  } else if (report.deadlock) {
    reportsRun = true
    text = dict.t('unsolvable')
  } else {
    reportsRun = true
    const stuck = report.stuck
    text = dict.t('notClosedStatus', dict.fmt(stuck?.remaining ?? 0), stuck?.sizes.length ?? 0, stuck?.sizes[0] ?? 0)
  }

  // The store's answer is appended, never substituted: a missing store must
  // not overwrite what the run itself reported (§5.3). It is appended only to
  // the three branches above, the ones reporting a board this run produced —
  // the flag is set where the text is, so the two cannot drift apart the way a
  // second copy of the branch conditions would.
  const answer = !reportsRun || saved === null ? '' : ` — ${saved.ok ? dict.t('saved') : dict.t('notSaved')}`
  // A later task adds a second `role="status"` region (a clamp notice), so
  // this one gets a name now, ahead of that, for a screen reader to tell the
  // two apart.
  return (
    <output aria-live="polite" aria-label={dict.t('runStatus')}>
      {`${text}${answer}`}
    </output>
  )
}
