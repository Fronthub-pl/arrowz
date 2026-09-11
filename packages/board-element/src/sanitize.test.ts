import { describe, expect, test } from 'vitest'
import { drawableColor, drawablePad, drawablePointRadius, drawableView } from './sanitize.ts'
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
})

describe('the attributes', () => {
  test('pad: not finite is the fallback, negative is zero, large stays large', () => {
    expect(drawablePad(NaN, 4)).toBe(4)
    expect(drawablePad(Infinity, 4)).toBe(4)
    expect(drawablePad(-5, 4)).toBe(0)
    expect(drawablePad(2.5, 4)).toBe(2.5)
    expect(drawablePad(1e9, 4)).toBe(1e9)
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
