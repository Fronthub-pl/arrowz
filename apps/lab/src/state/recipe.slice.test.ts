import { defaultChoice, recipeOf } from '@arrowz/engine/simple'
import { describe, expect, it } from 'vitest'
import { createRecipeSlice, type RecipeState } from './recipe.slice'

function slice() {
  const store: { recipe: RecipeState } = { recipe: createRecipeSlice((fn) => Object.assign(store, fn(store))) }
  return store
}

describe('the recipe slice', () => {
  // Node has no remembered recipe to read, so the slice starts where
  // `recipeOf` starts for nothing at all.
  it('starts from the default recipe when nothing is remembered', () => {
    expect(slice().recipe.value).toEqual(recipeOf(null))
  })

  // Through `recipeOf` on every write: the engine's reader clamps and rounds a
  // side, so the slice never holds a recipe that reader would change.
  it('holds a size inside the engine range, as a whole number', () => {
    const store = slice()
    store.recipe.setSide('W', 5000)
    expect(store.recipe.value.W).toBe(1000)
    store.recipe.setSide('H', 40.6)
    expect(store.recipe.value.H).toBe(41)
  })

  it('sets both sides as one debounced edit, each clamped', () => {
    const store = slice()
    store.recipe.setSize(5000, 40.6)
    expect(store.recipe.value).toMatchObject({ W: 1000, H: 41 })
    expect(store.recipe.edits).toBe(1)
  })

  it('holds a slider position inside 0..1', () => {
    const store = slice()
    store.recipe.setSlider('shape', 1.7)
    expect(store.recipe.value.shape).toBe(1)
    store.recipe.setSlider('lengths', -0.2)
    expect(store.recipe.value.lengths).toBe(0)
  })

  // A size field and a slider run after a pause; the skeleton switch runs at
  // once and randomising runs nothing. Only the first two may wake the
  // debounce, or the switch would carve twice.
  it('counts a size or a slider as a debounced edit, and nothing else', () => {
    const store = slice()
    store.recipe.setSide('W', 30)
    store.recipe.setSlider('lengths', 0.3)
    expect(store.recipe.edits).toBe(2)
    store.recipe.setSkeleton('on')
    store.recipe.setRandom(true)
    store.recipe.reset()
    expect(store.recipe.edits).toBe(2)
  })

  // Defaults resets the recipe and keeps randomising.
  it('puts the default recipe back, keeping random', () => {
    const store = slice()
    store.recipe.setRandom(true)
    store.recipe.setSlider('lengths', 0.1)
    store.recipe.setSkeleton('on')
    store.recipe.reset()
    expect(store.recipe.value).toEqual(recipeOf({ ...defaultChoice(), random: true }))
  })
})
