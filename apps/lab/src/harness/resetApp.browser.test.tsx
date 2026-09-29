import { expect, test } from 'vitest'
import { useStore } from '../state/store'
import { resetApp } from './mountApp'

// Written through `setState`, not the slices' own setters, so a broken setter
// cannot make the case pass.
test('resetApp puts back the slices it does not name, the view and the recipe among them', () => {
  const initial = useStore.getInitialState()
  useStore.setState((s) => ({
    view: { ...s.view, pad: s.view.pad + 3 },
    recipe: { ...s.recipe, value: { ...s.recipe.value, lengths: 0.99 } },
  }))
  expect(useStore.getState().view.pad).not.toBe(initial.view.pad)
  resetApp('advanced')
  expect(useStore.getState().view).toEqual(initial.view)
  expect(useStore.getState().recipe).toEqual(initial.recipe)
})

test('resetApp still sets the fields whose first value reads the browser', () => {
  useStore.setState((s) => ({ lang: { ...s.lang, lang: 'pl' }, ui: { ...s.ui, settings: false, report: true } }))
  resetApp('simple')
  const state = useStore.getState()
  expect(state.lang.lang).toBe('en')
  expect(state.ui.mode).toBe('simple')
  expect(state.ui.settings).toBe(true)
  expect(state.ui.report).toBe(false)
})
