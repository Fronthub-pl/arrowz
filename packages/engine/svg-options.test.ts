import { assertEquals } from '@std/assert'
import { DEFAULT_VIEW, svgOptions } from './command.ts'
import { THEMES } from './look.ts'

Deno.test('the default view draws the default colours, a margin of 4 and no points', () => {
  const o = svgOptions(DEFAULT_VIEW)
  assertEquals([o.paper, o.ink, o.highlight, o.palette], ['#f6f6fa', '#232447', '#e8467c', []])
  assertEquals(o.pad, 4)
  assertEquals(o.points, undefined)
})

Deno.test('an empty stated colour lets the theme show; a stated one beats it', () => {
  const dark = THEMES['gruvbox-dark']
  const o = svgOptions({ ...DEFAULT_VIEW, theme: 'gruvbox-dark', ink: '', paper: '#010203' })
  assertEquals(o.ink, dark?.ink)
  assertEquals(o.paper, '#010203')
  assertEquals(o.highlight, dark?.highlight)
  assertEquals(o.palette, dark?.palette)
})

Deno.test('a stated palette beats the theme’s; an empty one lets it show', () => {
  assertEquals(svgOptions({ ...DEFAULT_VIEW, theme: 'gruvbox-dark', palette: ['#112233'] }).palette, ['#112233'])
  assertEquals(
    svgOptions({ ...DEFAULT_VIEW, theme: 'gruvbox-dark', palette: [] }).palette,
    THEMES['gruvbox-dark']?.palette,
  )
})

Deno.test('the stated highlight colour is the highlight', () => {
  assertEquals(svgOptions({ ...DEFAULT_VIEW, highlight: '#0a0b0c' }).highlight, '#0a0b0c')
})

Deno.test('points go through only while the grid is on', () => {
  const on = { ...DEFAULT_VIEW, showPoints: true, pointColor: '#070809', pointRadius: 0.15, pad: 7 }
  assertEquals(svgOptions(on).points, { color: '#070809', radius: 0.15 })
  assertEquals(svgOptions(on).pad, 7)
  assertEquals(svgOptions({ ...on, showPoints: false }).points, undefined)
})
