import { useDictionary } from '../i18n'
import { useStore } from '../state/store'

/**
 * The live region. The mock's run state has no `aria-live`, so a screen reader
 * would never learn that a thirty-second carve had finished (§7.2). `<output>`
 * already has the `status` role — writing it again is what
 * `jsx-a11y/no-redundant-roles` exists to catch.
 */
export function RunStatusBar() {
  const dict = useDictionary()
  const run = useStore((state) => state.run)
  const blocked = useStore((state) => state.params.violations.length > 0)

  let text: string
  if (run.phase === 'running') {
    const p = run.progress
    // The old lab's own arithmetic (`lab-page.ts:785-787`): the share done is
    // measured in cells left, not pieces made, and the two counts are
    // abbreviated with `short`, not `fmt`.
    //
    // The dictionary's `progress` string carries `<b>` markup, which the old
    // lab writes as HTML. This line is the text of an `aria-live` region, so the
    // tags would show up literally — a visible defect in the page's primary
    // status line, not a wart worth preserving — and they are stripped here
    // rather than in the dictionary, which stays the source of truth. PR 4
    // replaces this line with the report's own markup and takes the tags back.
    // Stripping is not a licence for `dangerouslySetInnerHTML`: an `aria-live`
    // region has to be text.
    if (p === null) {
      // The size is the run's, not the console's: the old lab reads `state`
      // at the moment `run()` fires, and a knob edited during a carve must
      // not rewrite the warning about the carve already going.
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
  } else if (run.phase === 'error') {
    // Both failure paths land here: the worker's `error` message (a thrown
    // InvalidParamsError) and its `onerror` both call the slice's `failed()`
    // (useGenerator.ts:59, :65-68, :70-73), so the phase no longer says which
    // happened and this component always prints `generationError`. The old lab
    // keeps the two words apart; `workerError` (lab-i18n.ts:122-123) is
    // unreachable from here until the slice carries the distinction.
    text = `${dict.t('generationError')} ${run.message ?? ''}`
  } else if (run.phase !== 'done' || run.report === null) {
    // Idle, and three idles are distinguishable: refused, aborted, fresh. The
    // refusal comes first — a page that says "Press Generate" beside a
    // Generate it has disabled is telling the user to do the impossible.
    text = blocked ? dict.t('generateBlocked') : run.wasAborted ? dict.t('aborted') : dict.t('pressGenerate')
  } else if (run.report.ok) {
    text = dict.t('closed')
  } else if (run.report.deadlock) {
    text = dict.t('unsolvable')
  } else {
    const stuck = run.report.stuck
    text = dict.t('notClosedStatus', dict.fmt(stuck?.remaining ?? 0), stuck?.sizes.length ?? 0, stuck?.sizes[0] ?? 0)
  }

  // The store's answer is appended, never substituted: a missing store must
  // not overwrite what the run itself reported (§5.3).
  const saved = run.saved === null ? '' : ` — ${run.saved.ok ? dict.t('saved') : dict.t('notSaved')}`
  // The lab has a second `role="status"` region (a clamp notice), so a screen
  // reader needs a name to tell the two apart.
  return (
    <output aria-live="polite" aria-label={dict.t('runStatus')}>
      {`${text}${saved}`}
    </output>
  )
}
