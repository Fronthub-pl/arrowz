import { defaultChoice, type Recipe, recipeOf } from '@arrowz/engine/simple'
import { readStored, writeStored } from './storage'

/** The old lab's key and format, so a recipe survives the move between labs. */
export const RECIPE_KEY = 'labSimple'

export type RecipeSide = 'W' | 'H'
export type RecipeSlider = 'lengths' | 'shape'

export interface RecipeState {
  value: Recipe
  /**
   * How many debounced edits — a size or a slider — the recipe has taken. The
   * skeleton switch runs at once and randomising starts nothing, so neither
   * moves it. `useAutoRun` watches this beside `params.edits`, without the
   * `auto` gate (Ruling 3).
   */
  edits: number
  setSide(side: RecipeSide, value: number): void
  setSlider(slider: RecipeSlider, position: number): void
  setSkeleton(skeleton: Recipe['skeleton']): void
  setRandom(on: boolean): void
  /** The default recipe, keeping `random` — the old lab's Defaults (`lab-page.ts:927`). */
  reset(): void
}

/** What was stored, as `recipeOf` wants it: anything unreadable is nothing. */
function parse(raw: string | null): unknown {
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

type SetStore = (fn: (state: { recipe: RecipeState }) => { recipe: RecipeState }) => void

export function createRecipeSlice(set: SetStore): RecipeState {
  const write = (next: (current: Recipe) => Recipe, debounced: boolean) =>
    set((state) => {
      // Through `recipeOf` on every write: it clamps a side into the engine's
      // range and a position into 0..1, and drops a seed — the seed lives in
      // the knobs (`Recipe`'s own definition).
      const value = recipeOf(next(state.recipe.value))
      // Inside the updater, which zustand calls exactly once and at once:
      // the stored recipe is the one this write produced, not one read around it.
      writeStored(RECIPE_KEY, JSON.stringify(value))
      return {
        recipe: { ...state.recipe, value, edits: debounced ? state.recipe.edits + 1 : state.recipe.edits },
      }
    })
  return {
    value: recipeOf(parse(readStored(RECIPE_KEY))),
    edits: 0,
    setSide: (side, v) => write((current) => ({ ...current, [side]: v }), true),
    setSlider: (slider, position) => write((current) => ({ ...current, [slider]: position }), true),
    setSkeleton: (skeleton) => write((current) => ({ ...current, skeleton }), false),
    setRandom: (random) => write((current) => ({ ...current, random }), false),
    reset: () => write((current) => ({ ...defaultChoice(), random: current.random }), false),
  }
}
