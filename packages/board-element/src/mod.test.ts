import { expect, test } from 'vitest'
import { assignPalette, themeOf, THEMES } from './mod.ts'

test('a consumer can reach the themes and the assignment', () => {
  expect(Object.keys(THEMES)).toHaveLength(12)
  expect(themeOf('rose-pine-dawn')?.palette.length).toBe(3)
  expect(typeof assignPalette).toBe('function')
})
