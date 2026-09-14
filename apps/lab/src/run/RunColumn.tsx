import { type RefObject, useLayoutEffect, useRef } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { LiveCommand } from './LiveCommand'
import { OptionSwitch } from './OptionSwitch'
import type { RunControl } from './useRun'

/**
 * The mock's third console track (`.fw-run-col`). It is a child of `Console`
 * rather than a sibling, so PR 4's simple console places the very same element
 * and cannot fork it (Ruling 2).
 *
 * Generate carries the rule twice on purpose: `useRun` refuses silently for
 * the triggers that are not buttons, and the disabled attribute is what a
 * person sees. `RunStatusBar` speaks it (Task 5) and `Violations` spells it out.
 *
 * `goRef` and `abortRef` are the route's: the clamp notice dismisses itself
 * and hands focus to Generate, which is the action the preset that clamped
 * was chosen for, or to Abort when Generate is the one disabled. Both
 * optional, so that a caller with no notice beside it — this column's own
 * tests today — mounts the column unchanged. The column reads them back as
 * well, to carry the focus between the two whenever the one holding it is
 * about to be disabled.
 */
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
  const setMany = useStore((state) => state.params.setMany)
  const resetParams = useStore((state) => state.params.reset)
  const auto = useStore((state) => state.ui.auto)
  const help = useStore((state) => state.ui.help)
  const setAuto = useStore((state) => state.ui.setAuto)
  const setHelp = useStore((state) => state.ui.setHelp)

  // Both of these buttons are a landing spot with an expiry date, because each
  // is disabled by one of the two transitions of `running`, and HTML's focus
  // fixup then hands the focus to `document.body`. Ending a run: the clamp
  // notice parks the focus on Abort while a carve is in flight, and the commit
  // that ends the carve renders Abort `disabled`. Starting one: Generate is
  // `disabled={running || blocked}`, so activating Generate is what disables
  // Generate. Without this effect a keyboard user who tabs to Generate and
  // presses Enter or Space loses the focus by pressing the button — measured
  // with a real key press, both keys, `<body>` from the second frame on — which
  // makes that the ordinary path and not an edge case. The drop is the same in
  // both directions, so one effect watching the transition both ways closes
  // both, and the two halves compose: pressing Generate carries the focus to
  // Abort, and the end of the run carries it back.
  //
  // When the fixup runs was measured rather than assumed: batches of 20 samples
  // per sampling point, both transitions, Chrome 153.0.8010.12, the matching
  // branch cut out. The ranges span five batches, one of them a reviewer's:
  //
  //   sampling point                  `document.activeElement` is `<body>`
  //   synchronously after the commit   0/20
  //   microtask                        0/20
  //   setTimeout 0                     0–2/20
  //   1 × requestAnimationFrame        0–2/20
  //   2 × requestAnimationFrame       20/20
  //
  // The fixup is not a macrotask. It is the "update the rendering" step, which
  // runs *after* the animation-frame callbacks of the same frame — which is why
  // one rAF still sees the button, and why an rAF registered from inside one
  // sees the body. The stray early samples are runs in which a frame's
  // rendering step happened to fall between the commit and the sampling call.
  // So two frames is exactly the floor for observing the fixup, not a margin.
  // Read any earlier, a focus that is about to be dropped still looks kept: an
  // assertion that the focus is not on `<body>` holds against a deleted branch
  // in 18–20 samples of 20 at every point short of two frames. Do not tighten
  // the wait in this column's tests.
  //
  // `useLayoutEffect`, because that schedule leaves room: this runs
  // synchronously after the DOM mutation that disabled the outgoing button and
  // before any animation frame, so `document.activeElement` is still that
  // button and its partner — re-rendered enabled in the same commit — can take
  // the focus first.
  //
  // The transition is what is watched, not the state: `running` is false on
  // every idle render and true on every running one, and acting on either
  // would steal the focus from whatever the user had moved it to. The guard is
  // doubled by an identity check, so only a focus that is actually sitting on
  // the button being disabled is redirected. `wasRunning` is redundant against the dependency
  // array as it stands — `goRef` and `abortRef` are stable, so the effect
  // already runs only when `running` changes — and it stays because it is what
  // makes "transition, not state" a rule of this effect rather than a property
  // of its current dependency list, which a later dependency such as `blocked`
  // would quietly end.
  //
  // Only the ending branch can miss. Abort is `disabled={!running}`, so on a
  // start it is live by construction; on an end Generate is still out whenever
  // a knob was dragged into a violation during the carve, `focus()` is then a
  // no-op, and the focus is lost after all. New seed and Defaults are live in
  // that state — neither carries `disabled` at all — but neither is what a
  // person dismissing a notice or watching a run end asked for, so choosing a
  // landing spot for that case is a design question and not a guard, and it is
  // left open here deliberately rather than answered in passing.
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

  // `setMany` and not `set`: a seed the machine drew is not a knob a person
  // typed, and only the typed path may wake `auto` (Ruling 3). The range is
  // the old lab's own (`lab-page.ts:919`), and `clampParam` holds it inside
  // PARAM_SPEC's bounds regardless.
  const reseed = () => {
    setMany({ seed: Math.floor(Math.random() * 999999) })
    control.start()
  }
  const defaults = () => {
    resetParams()
    control.start()
  }

  return (
    <section className="fw-run-col" aria-label={dict.t('runColumn')}>
      <LiveCommand />
      <button
        type="button"
        className="fw-go"
        ref={goRef}
        onClick={control.start}
        disabled={running || blocked}
        title={blocked ? dict.t('generateBlocked') : undefined}
      >
        {dict.t('generate')}
      </button>
      <div className="fw-alt">
        <button type="button" onClick={reseed}>
          {dict.t('reseed')}
        </button>
        <button type="button" onClick={defaults}>
          {dict.t('reset')}
        </button>
        <button type="button" ref={abortRef} onClick={control.abort} disabled={!running}>
          {dict.t('abort')}
        </button>
      </div>
      <div className="fw-ghost">
        <OptionSwitch id="opt-auto" label={dict.t('autoRun')} on={auto} onChange={setAuto} />
        <OptionSwitch id="opt-help" label={dict.t('showHelp')} on={help} onChange={setHelp} />
      </div>
    </section>
  )
}
