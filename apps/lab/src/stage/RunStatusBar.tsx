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

  let text: string
  if (run.phase === 'running') {
    const p = run.progress
    // The old lab's own arithmetic (`lab-page.ts:785-787`): the share done is
    // measured in cells left, not pieces made, and the two counts are
    // abbreviated with `short`, not `fmt`.
    //
    // `progress` carries `<b>` tags, which the old lab writes as HTML. Here the
    // line is the text of an `aria-live` region, so the tags show up literally
    // until PR 4 replaces this with the report's own markup. That is the price
    // of the live region; it is not a bug to be fixed with
    // `dangerouslySetInnerHTML`.
    text =
      p === null
        ? dict.t('generating')
        : dict.t(
            'progress',
            (100 * (1 - p.remaining / p.total)).toFixed(1),
            dict.short(p.pieces),
            dict.short(p.remaining),
            p.backtracks,
            (p.ms / 1000).toFixed(1),
          )
  } else if (run.phase === 'error') {
    // The worker reports a thrown InvalidParamsError as `error`; onerror is
    // the other, rarer case. The old lab keeps the two words apart, and so
    // does this (lab-i18n.ts:119-120).
    text = `${dict.t('generationError')} ${run.message ?? ''}`
  } else if (run.phase !== 'done' || run.report === null) {
    text = dict.t('pressGenerate')
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
  return <output aria-live="polite">{`${text}${saved}`}</output>
}
