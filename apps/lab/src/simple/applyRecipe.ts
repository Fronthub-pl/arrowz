import { exportCell, simpleParams } from '@arrowz/engine/simple'
import { useStore } from '../state/store'

/**
 * Writes the recipe into the knobs. Every knob, through `setMany`: the machine
 * path, so `auto` does not carve behind it (Ruling 4). The seed is the one on
 * screen, because the recipe does not own one.
 *
 * With `random` each ranged knob is drawn afresh inside the recipe's ranges,
 * so the same seed gives a different board. Without it the canonical values
 * are used and two calls give the same knobs — which is what lets the
 * page-load run call this twice under StrictMode.
 *
 * The draw's moves are not reported (Ruling 5).
 */
export function applyRecipe(random: boolean): void {
  const { recipe, params, ui, view } = useStore.getState()
  const drawn = simpleParams({ ...recipe.value, seed: params.values.seed }, random ? Math.random : null)
  ui.raiseClamped(params.setMany(drawn))
  // Only when it moves. `setNumber` always replaces the view slice, `Stage`
  // memoises the element's view on that object, and the element redraws the
  // whole board for a new view (`arrowz-board.ts:422-428`) — which a slider
  // drag would pay sixty times a second for a cell that did not change.
  const cell = exportCell(drawn.W, drawn.H)
  if (view.cell !== cell) view.setNumber('cell', String(cell))
}

/**
 * Generate and New seed in the simple view with randomising on draw the knobs
 * afresh first; every other trigger keeps them.
 */
export function drawIfRandom(): void {
  const { ui, recipe } = useStore.getState()
  if (ui.mode === 'simple' && recipe.value.random) applyRecipe(true)
}

/**
 * Defaults in the simple view also puts the recipe back, keeping `random`, and
 * writes it into the knobs the reset just set. The caller resets the knobs
 * first, so the seed the recipe keeps is the default.
 */
export function resetRecipeIfSimple(): void {
  const { ui, recipe } = useStore.getState()
  if (ui.mode !== 'simple') return
  recipe.reset()
  applyRecipe(false)
}
