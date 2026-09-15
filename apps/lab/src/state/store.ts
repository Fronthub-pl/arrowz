import type { BoardData, BoardFile } from '@arrowz/engine'
import { create } from 'zustand'
import { createLangSlice, type LangState } from './lang.slice'
import { createParamsSlice, type ParamsState } from './params.slice'
import { createRecipeSlice, type RecipeState } from './recipe.slice'
import { createResultSlice, type ResultState, showResult } from './result.slice'
import { createRunSlice, type DoneReport, runDone, type RunState } from './run.slice'
import { createUiSlice, type UiState } from './ui.slice'
import { createViewSlice, type ViewState } from './view.slice'

/** What the worker hands over when a board is done, decoded. */
export interface FinishedRun {
  board: BoardData
  file: BoardFile
  report: DoneReport
}

/**
 * One store, one named field per slice, so a per-knob selector reaches exactly
 * its own entry. PR 4b adds `result` and the one action that spans two slices;
 * PR 5 adds `library`.
 */
export interface Store {
  run: RunState
  result: ResultState
  params: ParamsState
  view: ViewState
  ui: UiState
  lang: LangState
  recipe: RecipeState
  /**
   * The only writer that sees both the run and the result: the run's done
   * transition and the result's show transition in one `set`, so no render
   * sees `phase: 'done'` beside the previous board (spec §5.3). The slices
   * keep their narrowed setters.
   */
  completeRun(done: FinishedRun): void
}

export const useStore = create<Store>()((set) => ({
  run: createRunSlice(set),
  result: createResultSlice(set),
  params: createParamsSlice(set),
  view: createViewSlice(set),
  ui: createUiSlice(set),
  lang: createLangSlice(set),
  recipe: createRecipeSlice(set),
  completeRun: (done) =>
    set((state) => {
      const params = state.run.params
      // PR 4b, Ruling 6: without the run's own parameters there is nothing
      // true to show the board under.
      if (params === null) throw new Error('a run finished that was never started')
      return { run: runDone(state.run), result: showResult(state.result, { ...done, params }) }
    }),
}))
