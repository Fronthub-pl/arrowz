import { recipeOf } from '@arrowz/engine/simple'
import { expect, test } from 'vitest'
import { useStore } from './store'

// First, before anything below writes: the setup file cleared storage before
// this file's imports and the browser is pinned to en-US (Task 1), so the
// store was created with nothing remembered.
test('a fresh page opens in the simple view, in English', () => {
  expect(useStore.getState().ui.mode).toBe('simple')
  expect(useStore.getState().lang.lang).toBe('en')
})

test('a chosen language is remembered under the previous lab’s key', () => {
  useStore.getState().lang.setLang('pl')
  expect(localStorage.getItem('labLang')).toBe('pl')
  useStore.getState().lang.setLang('en')
  expect(localStorage.getItem('labLang')).toBe('en')
})

test('a chosen view is remembered under the previous lab’s key', () => {
  useStore.getState().ui.setMode('advanced')
  expect(localStorage.getItem('labView')).toBe('advanced')
  useStore.getState().ui.setMode('simple')
  expect(localStorage.getItem('labView')).toBe('simple')
})

test('the recipe is remembered under the previous lab’s key, in a form its reader takes back', () => {
  useStore.getState().recipe.setSlider('lengths', 0.3)
  useStore.getState().recipe.setRandom(true)
  const stored = localStorage.getItem('labSimple')
  expect(stored).not.toBeNull()
  expect(recipeOf(JSON.parse(stored ?? 'null'))).toEqual(useStore.getState().recipe.value)
  useStore.getState().recipe.reset()
  useStore.getState().recipe.setRandom(false)
})
