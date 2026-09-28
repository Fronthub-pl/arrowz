import { assert, assertEquals, assertMatch, assertStringIncludes } from '@std/assert'
import { defaultParams, generate, toSvg } from './engine.ts'

const board = generate({ ...defaultParams(), W: 12, H: 8, seed: 4 }).board

function size(svg: string): [number, number] {
  const m = svg.match(/^<svg [^>]*width="(\d+)" height="(\d+)"/)
  return [Number(m?.[1]), Number(m?.[2])]
}

Deno.test('without pad the margin is one cell, as before', () => {
  assertEquals(size(toSvg(board, { cell: 10 })), [140, 100])
  assertEquals(toSvg(board, { cell: 10, pad: 1 }), toSvg(board, { cell: 10 }))
})

Deno.test('pad is the margin in cells on every side', () => {
  assertEquals(size(toSvg(board, { cell: 10, pad: 4 })), [200, 160])
  assertEquals(size(toSvg(board, { cell: 10, pad: 0 })), [120, 80])
  // The first piece moves with the margin: its line starts pad cells further in.
  const at = (pad: number) => toSvg(board, { cell: 10, pad }).match(/<polyline points="([\d.]+),/)?.[1]
  assertEquals(Number(at(4)) - Number(at(1)), 30)
})

Deno.test('points: one pattern and one rect over the cells alone, whatever the size', () => {
  const svg = toSvg(board, { cell: 10, pad: 2, points: { color: '#c9c9d6', radius: 0.06 } })
  assertEquals(svg.match(/<pattern /g)?.length, 1)
  assertStringIncludes(
    svg,
    '<pattern id="arrowz-points" x="20" y="20" width="10" height="10" patternUnits="userSpaceOnUse">' +
      '<circle cx="5" cy="5" r="0.6" fill="#c9c9d6"/></pattern>',
  )
  assertStringIncludes(svg, '<rect x="20" y="20" width="120" height="80" fill="url(#arrowz-points)"/>')
  const big = generate({ ...defaultParams(), W: 60, H: 60, seed: 4 }).board
  assertEquals(toSvg(big, { points: { color: '#c9c9d6', radius: 0.06 } }).match(/<pattern |<rect /g)?.length, 3)
})

Deno.test('points sit above the paper and below the pieces', () => {
  const svg = toSvg(board, { points: { color: '#c9c9d6', radius: 0.1 } })
  const paper = svg.indexOf('<rect width=')
  const dots = svg.indexOf('fill="url(#arrowz-points)"')
  const lines = svg.indexOf('<g fill="none"')
  assert(paper < dots && dots < lines, `${paper} ${dots} ${lines}`)
})

Deno.test('without points no pattern is drawn', () => {
  assert(!toSvg(board, {}).includes('<pattern'))
})

Deno.test('a point colour is escaped and a radius keeps three decimals', () => {
  const svg = toSvg(board, { cell: 7, points: { color: 'a"b', radius: 0.06 } })
  assertStringIncludes(svg, 'fill="a&quot;b"')
  assertMatch(svg, /<circle cx="3.5" cy="3.5" r="0.42" /)
})
