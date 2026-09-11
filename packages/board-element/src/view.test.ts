import { expect, test } from 'vitest'
import { DEFAULT_VIEW, hueBytes, hueDegrees, hueOf } from './view.ts'

test('hueOf is unchanged: the golden angle over the id, at fixed saturation and lightness', () => {
  expect(hueOf(0)).toBe('hsl(0 62% 42%)')
  expect(hueOf(1)).toBe('hsl(137.508 62% 42%)')
  expect(hueOf(3).startsWith('hsl(52.52')).toBe(true)
})

test('hueDegrees is the angle hueOf prints, so the two cannot drift apart', () => {
  for (const id of [0, 1, 2, 7, 424242, 85808]) {
    expect(hueOf(id)).toBe(`hsl(${hueDegrees(id)} 62% 42%)`)
  }
})

test('hueBytes is that same colour as bytes', () => {
  // Lightness .42, saturation .62: the extremes are 0.42*(1±0.62) of full.
  const [r, g, b] = hueBytes(0)
  expect(r).toBe(174) // hue 0 is the red end: 0.42*1.62 = 0.6804 -> 174
  expect(g).toBe(b)
  expect(g).toBe(41) // 0.42*0.38 = 0.1596 -> 41
})

test('hueBytes stays exact for the largest ids a board can hold', () => {
  // The reason this lives on the CPU at all (spec §8): in float32 the product
  // id * 137.508 quantises past 2^23 and the shader would print other colours.
  const [r, g, b] = hueBytes(85809)
  expect(Number.isInteger(r) && Number.isInteger(g) && Number.isInteger(b)).toBe(true)
  expect(Math.max(r, g, b)).toBe(174)
  expect(Math.min(r, g, b)).toBe(41)
})

test('DEFAULT_VIEW is the shape the element starts from', () => {
  expect(DEFAULT_VIEW.stroke).toBe(0.5)
  expect(DEFAULT_VIEW.colored).toBe(false)
  expect(DEFAULT_VIEW.top).toBe(0)
})
