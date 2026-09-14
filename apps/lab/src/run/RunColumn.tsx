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
 * well, to carry that focus off Abort before the end of the carve disables it.
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

  // Abort is a landing spot with an expiry date. The clamp notice hands the
  // focus here when Generate is refused, which is exactly while a carve is in
  // flight — and when that carve ends this column re-renders Abort as
  // `disabled`, at which point HTML's focus fixup takes the focus off it and
  // gives it to the body. So the drop the notice exists to prevent comes back,
  // merely deferred by the whole length of the carve.
  //
  // When the fixup runs was measured rather than assumed: batches of 20 samples
  // per sampling point, Chrome 153.0.8010.12, this guard cut out. The ranges
  // span three batches, one of them a reviewer's:
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
  // synchronously after the DOM mutation that disabled Abort and before any
  // animation frame, so `document.activeElement` is still the button and
  // Generate — re-rendered enabled in the same commit — can take it.
  //
  // The transition is what is watched, not the state: `running === false` is
  // true of every idle render, and acting on it would steal the focus from
  // whatever the user had moved it to. The guard is doubled by an identity
  // check — only a focus that is actually sitting on Abort is redirected.
  //
  // Generate is the target because it is the action the notice wanted in the
  // first place and the run it was refused for has just ended. When a knob was
  // dragged into a violation during the carve it is still disabled, `focus()`
  // is a no-op and the focus is lost after all. New seed and Defaults are live
  // in that state — neither carries `disabled` at all — but neither is what a
  // person dismissing a notice asked for, so choosing a landing spot for it is
  // a design question and not a guard, and it is left open here deliberately
  // rather than answered in passing.
  const wasRunning = useRef(false)
  useLayoutEffect(() => {
    const abort = abortRef?.current ?? null
    const go = goRef?.current ?? null
    if (wasRunning.current && !running && abort !== null && document.activeElement === abort) {
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
