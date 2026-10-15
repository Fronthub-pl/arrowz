import { beforeEach, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { jumpTo } from './jumpTo'

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
})

it('brings the lab face, the advanced view, the group and the drawer, then asks for the control', () => {
  useStore.setState((state) => ({ ui: { ...state.ui, mode: 'simple', settings: false, entry: 'board' } }))
  const went: string[] = []
  jumpTo((path) => went.push(path), 'difficulty', 'knob-probeLen')
  const ui = useStore.getState().ui
  expect(went).toEqual(['/'])
  expect(ui.mode).toBe('advanced')
  expect(ui.entry).toBe('difficulty')
  expect(ui.settings).toBe(true)
  expect(ui.focusTarget).toBe('knob-probeLen')
})

it('leaves an open palette open, since closing it is the palette row step', () => {
  useStore.setState((state) => ({ ui: { ...state.ui, palette: true } }))
  jumpTo(() => {}, 'board', 'knob-seed')
  expect(useStore.getState().ui.palette).toBe(true)
})
