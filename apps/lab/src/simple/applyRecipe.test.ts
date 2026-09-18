import { defaultParams } from '@arrowz/engine'
import { exportCell, simpleParams } from '@arrowz/engine/simple'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../state/store'
import { applyRecipe } from './applyRecipe'

const state = () => useStore.getState()

beforeEach(() => {
  state().params.reset()
  state().recipe.reset()
  state().recipe.setRandom(false)
  state().ui.raiseClamped(false)
  state().view.setNumber('cell', '12')
})
afterEach(() => vi.restoreAllMocks())

describe('applyRecipe', () => {
  it('writes every knob the recipe draws, keeping the seed on screen', () => {
    state().params.setMany({ seed: 4242 })
    state().recipe.setSide('W', 120)
    state().recipe.setSlider('lengths', 0.2)
    applyRecipe(false)
    expect(state().params.values).toEqual(simpleParams({ ...state().recipe.value, seed: 4242 }, null))
  })

  // 120×50 and not the defaults: `exportCell` saturates at 18 for every board
  // up to 91 cells on its longer side, and the view slice starts at 12, so
  // only a wide board tells a written cell from a stale one. 1600 / 120 → 13.
  it('sets the export cell from the size it drew', () => {
    state().recipe.setSide('W', 120)
    applyRecipe(false)
    expect(state().view.cell).toBe(exportCell(120, 50))
    expect(state().view.cell).toBe(13)
  })

  // A new view object makes the board element redraw everything, and a slider
  // drag calls this sixty times a second with an unchanged size.
  it('leaves the view alone when the export cell does not move', () => {
    applyRecipe(false)
    const view = state().view
    state().recipe.setSlider('shape', 0.9)
    applyRecipe(false)
    expect(state().view).toBe(view)
  })

  // The page-load run applies the recipe, and StrictMode runs that effect
  // twice (App.tsx); the second application must be the first one.
  it('gives the same knobs twice without the draw', () => {
    state().recipe.setSlider('shape', 0.9)
    applyRecipe(false)
    const first = { ...state().params.values }
    applyRecipe(false)
    expect(state().params.values).toEqual(first)
  })

  // Measured before this plan was written: the default recipe reproduces
  // `defaultParams()` key for key (`lab-simple.ts:69-70` states it).
  it('reproduces the engine defaults from the default recipe', () => {
    state().params.setMany({ W: 77 })
    applyRecipe(false)
    expect(state().params.values).toEqual(defaultParams())
  })

  it('draws with Math.random only when asked', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    applyRecipe(false)
    expect(random).not.toHaveBeenCalled()
    applyRecipe(true)
    expect(random).toHaveBeenCalled()
    const seed = state().params.values.seed
    expect(state().params.values).toEqual(simpleParams({ ...state().recipe.value, seed }, () => 0.99))
  })

  // `applyRecipe` raises the clamp notice with whatever it found: a notice a
  // link raised goes down when the recipe writes values that needed no clamp.
  it('lowers a clamp notice nothing in the recipe moved, as the previous lab does', () => {
    state().ui.raiseClamped(true)
    applyRecipe(false)
    expect(state().ui.clamped).toBe(false)
  })

  // The machine path (Ruling 4): applying the recipe must not look like a
  // person typing a knob, or `auto` would carve behind it.
  it('leaves both edit counters alone', () => {
    const typed = state().params.edits
    const shaped = state().recipe.edits
    applyRecipe(false)
    applyRecipe(true)
    expect(state().params.edits).toBe(typed)
    expect(state().recipe.edits).toBe(shaped)
  })
})
