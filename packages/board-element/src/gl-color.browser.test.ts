import { expect, test, vi } from 'vitest'
import { rgbaOf } from './gl-color.ts'

test('rgbaOf reads back from a context made for frequent reads', () => {
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
  expect(rgbaOf('#ff0000')).toEqual([1, 0, 0, 1])
  expect(getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true })
  getContext.mockRestore()
})
