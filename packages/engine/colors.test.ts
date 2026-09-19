// The palette has one home now (colors.ts). These are the checks the board
// element's view.ts used to carry for its own copy: the element re-exports
// these functions, and view.test.ts proves the re-export is this same code.
import { assert, assertEquals } from '@std/assert'
import { hueBytes, hueDegrees, hueOf } from './colors.ts'

Deno.test('hueOf is the golden angle over the id, at fixed saturation and lightness', () => {
  assertEquals(hueOf(0), 'hsl(0 62% 42%)')
  assertEquals(hueOf(1), 'hsl(137.508 62% 42%)')
  assert(hueOf(3).startsWith('hsl(52.52'), hueOf(3))
})

Deno.test('hueDegrees is the angle hueOf prints, so the two cannot drift apart', () => {
  for (const id of [0, 1, 2, 7, 424242, 85808]) {
    assertEquals(hueOf(id), `hsl(${hueDegrees(id)} 62% 42%)`)
  }
})

Deno.test('hueBytes is that same colour as bytes', () => {
  // Lightness .42, saturation .62: the extremes are 0.42*(1±0.62) of full.
  const [r, g, b] = hueBytes(0)
  assertEquals(r, 174) // hue 0 is the red end: 0.42*1.62 = 0.6804 -> 174
  assertEquals(g, b)
  assertEquals(g, 41) // 0.42*0.38 = 0.1596 -> 41
})

Deno.test('hueBytes stays exact for the largest ids a board can hold', () => {
  // Why this lives on the CPU at all: in float32 the product id * 137.508
  // quantises past 2^23, and a shader would print other colours.
  const [r, g, b] = hueBytes(85809)
  assert(Number.isInteger(r) && Number.isInteger(g) && Number.isInteger(b))
  assertEquals(Math.max(r, g, b), 174)
  assertEquals(Math.min(r, g, b), 41)
})
