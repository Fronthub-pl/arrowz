import { type CSSProperties, type RefObject, useLayoutEffect, useRef } from 'react'
import { useDictionary } from '../i18n'
import { oneDecimal, useRunLine } from '../stage/useRunState'
import { useStore } from '../state/store'
import { defaults, generate, reseed } from './actions'
import { ExportButtons } from './ExportButtons'
import { LiveCommand } from './LiveCommand'
import { MoreMenu } from './MoreMenu'
import { OptionSwitch } from './OptionSwitch'
import type { RunControl } from './useRun'

/**
 * The stage's third track (`.fw-run-col`), right of the board. It belongs to
 * the stage, in the same slot on every face and in both views, so the simple
 * view and the saved boards swap what is around it and never its node.
 *
 * Generate carries the rule twice on purpose: `useRun` refuses silently for
 * the triggers that are not buttons, and the disabled attribute is what a
 * person sees. `RunStatusBar` speaks it and `Violations` spells it out.
 *
 * `goRef` and `abortRef` are the route's: the clamp notice hands focus to one
 * of them when it dismisses itself. Both are optional, so a caller with no
 * notice beside it mounts the column unchanged. The column also reads them to
 * carry the focus between the two buttons (see the effect below).
 */

/** The run column's id, which the phone's CLI sheet button controls. */
export const RUN_COLUMN_ID = 'run-column'

/** The hidden progressbar's id, which Generate points at while a carve runs. */
const PROGRESS_ID = 'run-progress'

export function RunColumn({
  control,
  goRef,
  abortRef,
}: {
  control: RunControl
  goRef?: RefObject<HTMLButtonElement | null> | undefined
  abortRef?: RefObject<HTMLButtonElement | null> | undefined
}) {
  const dict = useDictionary()
  const running = useStore((state) => state.run.phase === 'running')
  const blocked = useStore((state) => state.params.violations.length > 0)
  const auto = useStore((state) => state.ui.auto)
  const setAuto = useStore((state) => state.ui.setAuto)
  const simple = useStore((state) => state.ui.mode === 'simple')
  const { run: line, percent } = useRunLine()
  // One decimal everywhere the share shows: the label, the fill and the
  // progressbar's value say the same number.
  const share = percent === null ? null : Math.round(percent * 10) / 10

  // Starting a run disables Generate and ending one disables Abort; HTML's focus
  // fixup (two frames later, see `twoFrames`) would drop the focus
  // on <body>, so a layout effect hands it to the partner button first. Act on
  // the transition of `running`, not its value (`wasRunning` keeps that if the
  // deps grow), and only when the focus is on the button being disabled. Known
  // gap: a rule broken during the run leaves Generate disabled and focus lost.
  const wasRunning = useRef(false)
  useLayoutEffect(() => {
    const abort = abortRef?.current ?? null
    const go = goRef?.current ?? null
    if (running && !wasRunning.current && go !== null && document.activeElement === go) {
      if (abort !== null && !abort.disabled) abort.focus()
    }
    if (!running && wasRunning.current && abort !== null && document.activeElement === abort) {
      if (go !== null && !go.disabled) go.focus()
    }
    wasRunning.current = running
  }, [running, goRef, abortRef])

  // Shared with the command palette, so the column and the palette cannot drift.
  const onGenerate = () => generate(control)
  const onReseed = () => reseed(control)
  const onDefaults = () => defaults(control)

  return (
    <section id={RUN_COLUMN_ID} className="fw-run-col" aria-label={dict.t('runColumn')}>
      <LiveCommand />
      {/* While a carve runs, Generate is the meter: filled to the share done
          (`--p`), the percent in its label. Before the first report the
          progressbar has no value, which is how ARIA spells "indeterminate".
          The progressbar is for assistive technology only (`fw-vh`). */}
      <button
        type="button"
        className={running ? 'fw-go busy' : 'fw-go'}
        ref={goRef}
        onClick={onGenerate}
        disabled={running || blocked}
        title={blocked ? dict.t('generateBlocked') : undefined}
        style={running ? ({ '--p': `${share ?? 0}%` } as CSSProperties) : undefined}
        aria-describedby={running ? PROGRESS_ID : undefined}
      >
        {!running
          ? dict.t('generate')
          : share === null
            ? dict.t('generating')
            : dict.t('generatingPct', oneDecimal(dict, share))}
      </button>
      {running ? (
        <div
          id={PROGRESS_ID}
          className="fw-vh"
          role="progressbar"
          aria-label={dict.t('runProgress')}
          aria-valuemin={0}
          aria-valuemax={100}
          {...(share === null ? {} : { 'aria-valuenow': share, 'aria-valuetext': `${oneDecimal(dict, share)}%` })}
        />
      ) : null}
      {/* `aria-hidden`: `RunStatusBar`'s live `<output>` says the same and is the one voice. */}
      <p className={line.bad ? 'fw-runstate bad' : 'fw-runstate'} aria-hidden="true">
        {line.text}
      </p>
      <div className="fw-alt">
        <button type="button" onClick={onReseed}>
          {dict.t('reseed')}
        </button>
        <button type="button" onClick={onDefaults}>
          {dict.t('reset')}
        </button>
        <button type="button" ref={abortRef} onClick={control.abort} disabled={!running}>
          {dict.t('abort')}
        </button>
      </div>
      <MoreMenu>
        {/* The knobs' own switch, so not in the simple view, which shows no knobs. */}
        {simple ? null : (
          <div className="fw-ghost">
            <OptionSwitch id="opt-auto" label={dict.t('autoRun')} on={auto} onChange={setAuto} />
          </div>
        )}
        {/* In both views: the exports belong to the board, not to the knobs. */}
        <ExportButtons />
      </MoreMenu>
    </section>
  )
}
