import { recipeOf } from '@arrowz/engine/simple'
import { expect, test } from 'vitest'
import { createUiSlice, type UiState } from './ui.slice'
import { useStore } from './store'

// First, before anything below writes: the setup file cleared storage before
// this file's imports and the browser is pinned to en-US (Task 1), so the
// store was created with nothing remembered.
test('a fresh page opens in the simple view, in English', () => {
  expect(useStore.getState().ui.mode).toBe('simple')
  expect(useStore.getState().lang.lang).toBe('en')
})

test("a chosen language is remembered under the previous lab's key", () => {
  useStore.getState().lang.setLang('pl')
  expect(localStorage.getItem('labLang')).toBe('pl')
  useStore.getState().lang.setLang('en')
  expect(localStorage.getItem('labLang')).toBe('en')
})

test("a chosen view is remembered under the previous lab's key", () => {
  useStore.getState().ui.setMode('advanced')
  expect(localStorage.getItem('labView')).toBe('advanced')
  useStore.getState().ui.setMode('simple')
  expect(localStorage.getItem('labView')).toBe('simple')
})

test("the recipe is remembered under the previous lab's key, in a form its reader takes back", () => {
  useStore.getState().recipe.setSlider('lengths', 0.3)
  useStore.getState().recipe.setRandom(true)
  const stored = localStorage.getItem('labSimple')
  expect(stored).not.toBeNull()
  expect(recipeOf(JSON.parse(stored ?? 'null'))).toEqual(useStore.getState().recipe.value)
  useStore.getState().recipe.reset()
  useStore.getState().recipe.setRandom(false)
})

test('the report drawer is remembered as open or closed, and read back', () => {
  useStore.getState().ui.setReport(true)
  expect(localStorage.getItem('labReport')).toBe('open')
  useStore.getState().ui.toggleReport()
  expect(localStorage.getItem('labReport')).toBe('closed')
  // A fresh slice reads what was stored (harness fact 41: the start value is
  // asserted on a new slice, not on the live store a reset may have written).
  localStorage.setItem('labReport', 'open')
  const store: { ui: UiState } = { ui: createUiSlice((fn) => Object.assign(store, fn(store))) }
  expect(store.ui.report).toBe(true)
  localStorage.setItem('labReport', 'nonsense')
  const other: { ui: UiState } = { ui: createUiSlice((fn) => Object.assign(other, fn(other))) }
  expect(other.ui.report).toBe(false)
  localStorage.removeItem('labReport')
})
