import { PARAM_SPEC, type Params } from '@arrowz/engine'
import { exportCell } from '@arrowz/engine/simple'
import { drawIfRandom, resetRecipeIfSimple } from '../simple/applyRecipe'
import { useStore } from '../state/store'
import type { RunControl } from './useRun'

/**
 * What a person can ask the generator for, in one place because two surfaces
 * ask: the run column's buttons and the command palette.
 *
 * Every one writes through `setMany` or `reset` (the machine path) and starts
 * its own run, so none of them wakes auto-generate; see `ParamsState.edits`.
 */

/** Generate from the knobs as they stand. In the simple view with randomising on, they are drawn first. */
export function generate(control: RunControl): void {
  drawIfRandom()
  control.start()
}

/** A seed the machine drew, over the knob's whole 32-bit range, then a run. */
export function reseed(control: RunControl): void {
  // `?? 0` is unreachable; `noUncheckedIndexedAccess` types the index as `number | undefined`.
  useStore.getState().params.setMany({ seed: crypto.getRandomValues(new Uint32Array(1))[0] ?? 0 })
  drawIfRandom()
  control.start()
}

/** Every knob back to its default, the recipe over them in the simple view, then a run. */
export function defaults(control: RunControl): void {
  useStore.getState().params.reset()
  resetRecipeIfSimple()
  control.start()
}

/**
 * The `[` and `]` keys: the neighbouring seed, then a run — the experimenter's
 * loop of flipping through boards from one setting.
 *
 * No bounds of its own on purpose. `setMany` clamps to `PARAM_SPEC`, whose
 * `seed` runs 0..2**32-1, so a ceiling written here would be a second copy of
 * that number and a copy drifts.
 */
export function stepSeed(control: RunControl, delta: number): void {
  const params = useStore.getState().params
  params.setMany({ seed: params.values.seed + delta })
  drawIfRandom()
  control.start()
}

/**
 * A preset, from the strip's chip or from the palette's row: one function, so
 * the two surfaces cannot drift.
 *
 * Every knob is written, not only the ones the option names: `lab-presets.ts`
 * calls an option "engine defaults + these overrides", so choosing one never
 * inherits a knob left over from the previous experiment. A preset is written
 * for the engine's envelope rather than this board's, so a value can arrive
 * out of range and be pulled in — the notice is how that move stops being
 * silent. The export cell size follows the size through the view
 * slice's tolerant reader, because it is a view field and not a knob.
 */
export function applyPreset(control: RunControl, params: Partial<Params>): void {
  const state = useStore.getState()
  const full: Partial<Params> = {}
  for (const spec of PARAM_SPEC) full[spec.key] = params[spec.key] ?? spec.def
  state.ui.raiseClamped(state.params.setMany(full))
  state.view.setNumber('cell', String(exportCell(params.W ?? 0, params.H ?? 0)))
  control.start()
}
