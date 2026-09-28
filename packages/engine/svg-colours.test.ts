import { assert, assertEquals, assertMatch, assertStringIncludes } from '@std/assert'
import { defaultParams, generate, toSvg } from './engine.ts'
import { assignPalette } from './palette.ts'

const board = generate({ ...defaultParams(), W: 12, H: 12, seed: 4 }).board

/** The `stroke` of every polyline, in drawing order; '' where the line takes the group's. */
function lineColours(svg: string): string[] {
  return [...svg.matchAll(/<polyline points="[^"]*"(?: stroke="([^"]*)")?\/>/g)].map((m) => m[1] ?? '')
}

Deno.test('paper, ink and highlight replace the fixed colours', () => {
  const svg = toSvg(board, { top: 1, paper: '#101010', ink: '#202020', highlight: '#303030' })
  assertMatch(svg, /<rect width="\d+" height="\d+" fill="#101010"\/>/)
  assertStringIncludes(svg, 'stroke="#202020" stroke-width=')
  assertStringIncludes(svg, 'stroke="#303030"')
  assertStringIncludes(svg, '<g fill="#202020">')
  for (const old of ['#f6f6fa', '#232447', '#e8467c']) assert(!svg.includes(old), old)
})

Deno.test('with colours on, each piece takes the colour assignPalette gives it', () => {
  const palette = ['#aa0000', '#00aa00', '#0000aa']
  const svg = toSvg(board, { colored: true, palette })
  const assign = assignPalette(board, palette.length)
  const expected = board.pieces.map((pc) => palette[assign[pc.id] ?? 0])
  assertEquals(lineColours(svg), expected)
})

Deno.test('with colours off, a palette is ignored and the board is drawn in the ink', () => {
  assertEquals(toSvg(board, { palette: ['#aa0000', '#00aa00'] }), toSvg(board, {}))
})

Deno.test('an empty palette keeps the golden angle', () => {
  assertEquals(toSvg(board, { colored: true, palette: [] }), toSvg(board, { colored: true }))
})

// Theme `ayu-light` has its highlight equal to its ink; the highlight group sets
// no stroke, so a highlighted line without its own would not be drawn.
Deno.test('a highlight equal to the ink still draws the highlighted pieces', () => {
  const svg = toSvg(board, { top: 1, ink: '#5c6166', highlight: '#5c6166' })
  assertMatch(svg, /stroke-linejoin="round">\n<polyline points="[^"]*" stroke="#5c6166"\/>\n<\/g>/)
})

Deno.test('a colour is escaped before it goes into an attribute', () => {
  const svg = toSvg(board, { paper: 'a"b<c&' })
  assertStringIncludes(svg, 'fill="a&quot;b&lt;c&amp;"')
})
