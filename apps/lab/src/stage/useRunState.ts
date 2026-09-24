import type { Dict } from '@arrowz/engine/i18n'
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

function noticeText(dict: Dict, notice: LibraryNotice): string {
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

/** A number with one decimal, in the page's language: `41.3` and `41,3`. */
export function oneDecimal(dict: Dict, n: number): string {
  return n.toLocaleString(dict.lang === 'pl' ? 'pl' : 'en', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** One visible line of state; `bad` is a refusal or a failure, drawn in `--error`. */
export interface StateLine {
  readonly text: string
  readonly bad: boolean
}

export interface RunState {
  /** The live region's sentence (`RunStatusBar`): the one voice of the page. */
  readonly live: string
  /** The run column's line under Generate. */
  readonly run: StateLine
  /**
   * The board column's line under Load into lab: a library event or a board
   * that failed to load, or null when there is neither.
   */
  readonly library: StateLine | null
  /** The share of the carve in flight done, 0–100, or null when none runs or it has not reported yet. */
  readonly percent: number | null
}

/**
 * The page's state in words, for the three places that say it: the live
 * `<output>`, which is the only one a screen reader hears, and the two visible
 * lines under the columns' primary buttons, which are `aria-hidden` because the
 * output speaks for them. One function, so the three cannot drift.
 *
 * The line and the live sentence differ in two places only. While a carve
 * runs, the percent is on Generate, so the line drops it (`progressRest`). And
 * the saved boards' events and failures have their own line in the board
 * column, while the run column keeps talking about the run.
 */
export function useRunState(): RunState {
  const dict = useDictionary()
  const { live: runLive, run, percent } = useRunLine()
  const preview = useStore((state) => state.result.preview)
  const boardError = useStore((state) => state.library.boardError)
  const notice = useStore((state) => state.library.notice)
  const inLibrary = useInLibrary()

  // The saved boards' own line. An event outranks the description of a state:
  // it is what just happened. It gives way 1200 ms later (`notices.ts`), except
  // `loading` and `saveFailed`, which are cleared by their outcome. Both ask
  // the tab, not the slice alone: the route changes a render before the hook's
  // effect clears these, so the lab would announce a stored board for a frame.
  const library: StateLine | null =
    inLibrary && notice !== null
      ? { text: noticeText(dict, notice), bad: notice.kind === 'saveFailed' || notice.kind === 'deleteFailed' }
      : inLibrary && boardError !== null
        ? { text: dict.t('boardFileError', boardError.name, boardError.reason), bad: true }
        : null

  // While the library has a board on screen, the live sentence is about that
  // board. A stored board is not a run, so the store's answer (`saved`) is
  // never appended to it, and a carve in flight still reports itself in the lab.
  let live = runLive
  if (library !== null) live = library.text
  else if (inLibrary && preview !== null) {
    const meta = preview.meta
    live = dict.t('savedBoard', `${meta.W}x${meta.H}/${meta.id}`, meta.seed, meta.source, `${genSeconds(meta, '—')} s`)
  }

  return { live, run, library, percent }
}

/**
 * The run's half of `useRunState`: the run's sentence, its line and its share
 * done, without the saved boards. The run column reads only this, so it mounts
 * without a router, as its tests mount it.
 */
export function useRunLine(): Omit<RunState, 'library'> {
  const dict = useDictionary()
  const run = useStore((state) => state.run)
  // The board on screen and the store's answer for it: the result slice's,
  // which a run in flight leaves where it was.
  const report = useStore((state) => state.result.shown?.report ?? null)
  const saved = useStore((state) => state.result.saved)
  const blocked = useStore((state) => state.params.violations.length > 0)

  let text: string
  let rest: string | null = null
  let bad = false
  let percent: number | null = null
  // Whether this line is speaking for a run at all. `saved` is a fact about the
  // board on screen, not about whatever the line is saying, so appending it to
  // the refusal would glue a board nobody is looking at onto the knobs' error.
  let reportsRun = false
  if (run.phase === 'running') {
    const p = run.progress
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
      // The share done is measured in cells left, not pieces made, and the two
      // counts are abbreviated with `short`, not `fmt`.
      percent = 100 * (1 - p.remaining / p.total)
      const seconds = oneDecimal(dict, p.ms / 1000)
      // The dictionary's `progress` carries `<b>` markup, and an `aria-live`
      // region has to be text, so the tags are stripped here and the
      // dictionary stays the source of truth.
      text = dict
        .t('progress', oneDecimal(dict, percent), dict.short(p.pieces), dict.short(p.remaining), p.backtracks, seconds)
        .replace(/<\/?b>/g, '')
      rest = dict.t('progressRest', dict.short(p.pieces), dict.short(p.remaining), p.backtracks, seconds)
    }
  } else if (blocked) {
    // The refusal outranks every phase but `running`: the slice is `done` from
    // the first load on, so an idle-only refusal would report the last board as
    // closed while `auto` refused silently. A carve in flight still reports itself.
    text = dict.t('generateBlocked')
    bad = true
  } else if (run.phase === 'error') {
    // Both failure paths (the worker's `error` message and its `onerror`) call
    // the slice's `failed()`, so the phase no longer says which happened and
    // this always prints `generationError`; the dictionary's `workerError` is
    // unreachable until the slice carries the distinction.
    text = `${dict.t('generationError')} ${run.message ?? ''}`
    bad = true
  } else if (run.phase !== 'done' || report === null) {
    // Idle: aborted or fresh. Refused is the branch above, whatever phase the
    // last run left: "Press Generate" beside a disabled Generate asks the impossible.
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

  // The store's answer is appended, never substituted: a missing store must not
  // overwrite what the run reported. Only the three branches that report a board
  // this run produced set `reportsRun`, next to their text, so the two cannot drift.
  const answer = !reportsRun || saved === null ? '' : ` — ${saved.ok ? dict.t('saved') : dict.t('notSaved')}`
  const runLive = `${text}${answer}`

  return { live: runLive, run: { text: rest ?? runLive, bad }, percent }
}
