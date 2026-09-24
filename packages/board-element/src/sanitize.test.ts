import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  drawableColor,
  drawablePad,
  drawablePointRadius,
  drawableView,
  PAD_RANGE,
  POINT_RADIUS_RANGE,
} from './sanitize.ts'
import { DEFAULT_VIEW } from './view.ts'

/** A stand-in for CSS.supports('color', …): hex and one name are colours, nothing else is. */
const isColor = (c: string): boolean => /^#[0-9a-f]{3,8}$/i.test(c) || c === 'red'

describe('drawableView', () => {
  test('a valid view comes back field for field', () => {
    const v = { ...DEFAULT_VIEW, stroke: 0.3, headWidth: 0.8, headHeight: 0.6, top: 5, ink: 'red' }
    expect(drawableView(v, isColor)).toEqual(v)
  })

  test('a number that is not finite becomes the default of its field', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const v = drawableView({ ...DEFAULT_VIEW, stroke: bad, headWidth: bad, headHeight: bad, top: bad }, isColor)
      expect(v.stroke).toBe(DEFAULT_VIEW.stroke)
      expect(v.headWidth).toBe(DEFAULT_VIEW.headWidth)
      expect(v.headHeight).toBe(DEFAULT_VIEW.headHeight)
      expect(v.top).toBe(DEFAULT_VIEW.top)
    }
  })

  test('stroke stays within (0, 1]: wider is one cell, zero or less is the default', () => {
    expect(drawableView({ ...DEFAULT_VIEW, stroke: 5 }, isColor).stroke).toBe(1)
    expect(drawableView({ ...DEFAULT_VIEW, stroke: 1 }, isColor).stroke).toBe(1)
    expect(drawableView({ ...DEFAULT_VIEW, stroke: 0 }, isColor).stroke).toBe(DEFAULT_VIEW.stroke)
    expect(drawableView({ ...DEFAULT_VIEW, stroke: -1 }, isColor).stroke).toBe(DEFAULT_VIEW.stroke)
  })

  test('head sizes below zero become zero, and there is no upper bound', () => {
    const v = drawableView({ ...DEFAULT_VIEW, headWidth: -1, headHeight: -2 }, isColor)
    expect(v.headWidth).toBe(0)
    expect(v.headHeight).toBe(0)
    expect(drawableView({ ...DEFAULT_VIEW, headHeight: 100 }, isColor).headHeight).toBe(100)
  })

  test('top is a whole count, never negative', () => {
    expect(drawableView({ ...DEFAULT_VIEW, top: 1.7 }, isColor).top).toBe(1)
    expect(drawableView({ ...DEFAULT_VIEW, top: -5 }, isColor).top).toBe(0)
    expect(drawableView({ ...DEFAULT_VIEW, top: 1e9 }, isColor).top).toBe(1e9)
  })

  test('a colour the browser would not parse becomes the default of its field', () => {
    const v = drawableView({ ...DEFAULT_VIEW, ink: 'garbage', paper: '', highlight: 'red' }, isColor)
    expect(v.ink).toBe(DEFAULT_VIEW.ink)
    expect(v.paper).toBe(DEFAULT_VIEW.paper)
    expect(v.highlight).toBe('red')
  })

  test('a number passed where a view field wants one, as a string, is not a number', () => {
    // Plain JavaScript hosts can hand the element anything; `view` is typed, but not checked.
    const v = drawableView({ ...DEFAULT_VIEW, stroke: '0.5' as unknown as number }, isColor)
    expect(v.stroke).toBe(DEFAULT_VIEW.stroke)
  })

  test('the booleans pass through untouched', () => {
    const v = drawableView({ ...DEFAULT_VIEW, rounded: false, colored: true, voids: true }, isColor)
    expect([v.rounded, v.colored, v.voids]).toEqual([false, true, true])
  })

  test('the palette keeps the colours a browser accepts and drops the rest', () => {
    const isColor = (css: string) => css === 'red' || css.startsWith('#')
    const v = drawableView({ ...DEFAULT_VIEW, palette: ['red', 'garbage', '#123456', ''] }, isColor)
    expect(v.palette).toEqual(['red', '#123456'])
  })

  test('a palette of nothing usable behaves as no palette at all', () => {
    const isColor = () => false
    expect(drawableView({ ...DEFAULT_VIEW, palette: ['nonsense'] }, isColor).palette).toEqual([])
  })

  test('a palette that is not a list at all is no palette, and does not throw', () => {
    // `el.view = { palette: 'red' }` from a plain JavaScript host: the same forgiving rule as stroke.
    for (const bad of ['red', null, 42, { 0: 'red' }]) {
      const v = drawableView({ ...DEFAULT_VIEW, palette: bad as unknown as string[] }, isColor)
      expect(v.palette).toEqual([])
    }
  })

  test('an entry that is not a string is dropped, the strings around it kept', () => {
    const palette = [123, 'red', null, undefined, '#abc', {}] as unknown as string[]
    expect(drawableView({ ...DEFAULT_VIEW, palette }, isColor).palette).toEqual(['red', '#abc'])
  })
})

describe('the attributes', () => {
  test('pad: not finite is the fallback, negative is zero, too large is clamped', () => {
    expect(drawablePad(NaN, 4)).toBe(4)
    expect(drawablePad(Infinity, 4)).toBe(4)
    expect(drawablePad(-5, 4)).toBe(0)
    expect(drawablePad(2.5, 4)).toBe(2.5)
    expect(drawablePad(1e9, 4)).toBe(PAD_RANGE.max)
  })

  test('point radius: not finite is the fallback, otherwise within [0, 0.5]', () => {
    expect(drawablePointRadius(NaN, 0.06)).toBe(0.06)
    expect(drawablePointRadius(-1, 0.06)).toBe(0)
    expect(drawablePointRadius(5, 0.06)).toBe(0.5)
    expect(drawablePointRadius(0.2, 0.06)).toBe(0.2)
  })

  test('point colour: not a colour is the fallback', () => {
    expect(drawableColor('garbage', '#c9c9d6', isColor)).toBe('#c9c9d6')
    expect(drawableColor('#abc', '#c9c9d6', isColor)).toBe('#abc')
  })
})

describe('POINT_RADIUS_RANGE', () => {
  test('the published bounds are the ones the clamp enforces', () => {
    // 0.5 and 0 are named literally on one side: an assertion reading the
    // constant on both sides would hold for any value it was given.
    expect(drawablePointRadius(1.5, 0.06)).toBe(0.5)
    expect(drawablePointRadius(-1, 0.06)).toBe(0)
    expect(POINT_RADIUS_RANGE).toEqual({ min: 0, max: 0.5 })
  })

  test('the README prose bounds match the constant', () => {
    const currentDir = dirname(fileURLToPath(import.meta.url))
    const packageDir = dirname(currentDir)
    const readmePath = join(packageDir, 'README.md')
    const readmeText = readFileSync(readmePath, 'utf-8')

    // Derive the expected bounds prose from the constant instead of hard-coding.
    // This way the test fails if either the constant OR the README changes alone.
    const expectedBounds = `(${POINT_RADIUS_RANGE.min} to ${POINT_RADIUS_RANGE.max})`

    expect(readmeText).toContain(expectedBounds)
  })
})

describe('PAD_RANGE', () => {
  test('the published bounds are the ones the clamp enforces', () => {
    // 16 and 0 are named literally on one side: an assertion reading the
    // constant on both sides would hold for any value it was given.
    expect(drawablePad(99, 4)).toBe(16)
    expect(drawablePad(-1, 4)).toBe(0)
    expect(PAD_RANGE).toEqual({ min: 0, max: 16 })
  })

  test('the README prose bounds match the constant', () => {
    const currentDir = dirname(fileURLToPath(import.meta.url))
    const packageDir = dirname(currentDir)
    const readmePath = join(packageDir, 'README.md')
    const readmeText = readFileSync(readmePath, 'utf-8')

    // Derive the expected bounds prose from the constant instead of hard-coding.
    // This way the test fails if either the constant OR the README changes alone.
    const expectedBounds = `(${PAD_RANGE.min} to ${PAD_RANGE.max})`

    expect(readmeText).toContain(expectedBounds)
  })
})
