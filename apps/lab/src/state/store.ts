import { create } from 'zustand'
import { createLangSlice, type LangState } from './lang.slice'
import { createParamsSlice, type ParamsState } from './params.slice'
import { createRecipeSlice, type RecipeState } from './recipe.slice'
import { createRunSlice, type RunState } from './run.slice'
import { createUiSlice, type UiState } from './ui.slice'
import { createViewSlice, type ViewState } from './view.slice'

/**
 * One store, one named field per slice, so a per-knob selector reaches exactly
 * its own entry. PR 4a adds `lang` and `recipe`; PR 5 adds `library`.
 */
export interface Store {
  run: RunState
  params: ParamsState
  view: ViewState
  ui: UiState
  lang: LangState
  recipe: RecipeState
}

export const useStore = create<Store>()((set) => ({
  run: createRunSlice(set),
  params: createParamsSlice(set),
  view: createViewSlice(set),
  ui: createUiSlice(set),
  lang: createLangSlice(set),
  recipe: createRecipeSlice(set),
}))
