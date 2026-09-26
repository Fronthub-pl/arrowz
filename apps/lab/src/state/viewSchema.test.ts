import { DEFAULT_PAD, DEFAULT_POINT_COLOR, DEFAULT_POINT_RADIUS } from '@arrowz/board-element'
import { DEFAULT_VIEW, VIEW_RANGE } from '@arrowz/engine/command'
import { describe, expect, test } from 'vitest'
import { PALETTE_CAP, pickView, readPatch, readView, VIEW_DEFAULTS, VIEW_KEYS, VIEW_SCHEMA } from './viewSchema'

describe('the view schema', () => {
  test('starts where the lab starts: the page’s cell and top, the CLI’s and the element’s rest', () => {
    expect(VIEW_DEFAULTS).toEqual({
      cell: 12,
      stroke: DEFAULT_VIEW.stroke,
      headWidth: DEFAULT_VIEW.headWidth,
      headHeight: DEFAULT_VIEW.headHeight,
      top: 5,
      colored: false,
      rounded: true,
      highlightLongest: false,
      voids: true,
      showPoints: false,
      pointColor: DEFAULT_POINT_COLOR,
      pointRadius: DEFAULT_POINT_RADIUS,
      theme: '',
      palette: [],
      paper: '',
      ink: '',
      highlightColor: '',
      pad: DEFAULT_PAD,
    })
  })

  test('every field reads its own default back unchanged', () => {
    for (const key of VIEW_KEYS) expect(VIEW_SCHEMA[key].read(VIEW_DEFAULTS[key])).toEqual(VIEW_DEFAULTS[key])
  })

  test('a view number is clamped into VIEW_RANGE, and a whole one rounds', () => {
    expect(VIEW_SCHEMA.cell.read(9999)).toBe(VIEW_RANGE.cell.max)
    expect(VIEW_SCHEMA.stroke.read(-4)).toBe(VIEW_RANGE.stroke.min)
    expect(VIEW_SCHEMA.top.read(7.6)).toBe(8)
    expect(VIEW_SCHEMA.cell.read('18')).toBe(18)
  })

  test('zero is a value, not an absence', () => {
    expect(VIEW_SCHEMA.headHeight.read(0)).toBe(0)
    expect(VIEW_SCHEMA.headWidth.read(0)).toBe(0)
    expect(VIEW_SCHEMA.top.read(0)).toBe(0)
    expect(VIEW_SCHEMA.pad.read(0)).toBe(0)
  })

  test('an empty, non-numeric or non-finite number is unreadable', () => {
    for (const raw of ['', '  ', 'x', null, undefined, true, Number.NaN, Number.POSITIVE_INFINITY, {}]) {
      expect(VIEW_SCHEMA.cell.read(raw)).toBeUndefined()
      expect(VIEW_SCHEMA.pointRadius.read(raw)).toBeUndefined()
      expect(VIEW_SCHEMA.pad.read(raw)).toBeUndefined()
    }
  })

  test('the point radius and the margin are held in the element’s ranges, the margin in whole cells', () => {
    expect(VIEW_SCHEMA.pointRadius.read(3)).toBe(0.5)
    expect(VIEW_SCHEMA.pointRadius.read(-1)).toBe(0)
    expect(VIEW_SCHEMA.pad.read(99)).toBe(16)
    expect(VIEW_SCHEMA.pad.read(2.6)).toBe(3)
  })

  test('a flag reads only a boolean', () => {
    expect(VIEW_SCHEMA.rounded.read(false)).toBe(false)
    expect(VIEW_SCHEMA.rounded.read('false')).toBeUndefined()
    expect(VIEW_SCHEMA.colored.read(1)).toBeUndefined()
  })

  test('a colour is #rrggbb, lower-cased; the board colours also take "" for unset', () => {
    expect(VIEW_SCHEMA.paper.read('#AABBCC')).toBe('#aabbcc')
    expect(VIEW_SCHEMA.paper.read('')).toBe('')
    expect(VIEW_SCHEMA.paper.read('rebeccapurple')).toBeUndefined()
    expect(VIEW_SCHEMA.highlightColor.read('#abc')).toBeUndefined()
    // The dot colour has no "unset": the element draws nothing for ''.
    expect(VIEW_SCHEMA.pointColor.read('')).toBeUndefined()
    expect(VIEW_SCHEMA.pointColor.read('#070809')).toBe('#070809')
  })

  test('a theme is "" or a name the element knows', () => {
    expect(VIEW_SCHEMA.theme.read('gruvbox-dark')).toBe('gruvbox-dark')
    expect(VIEW_SCHEMA.theme.read('')).toBe('')
    expect(VIEW_SCHEMA.theme.read('drak')).toBeUndefined()
  })

  test('a palette keeps #rrggbb entries, lower-cased, up to the cap', () => {
    const nine = Array.from({ length: 9 }, (_, i) => `#${String(i).repeat(6)}`)
    expect(VIEW_SCHEMA.palette.read(nine)).toEqual(nine.slice(0, PALETTE_CAP))
    expect(VIEW_SCHEMA.palette.read(['red', '#AABBCC', 7, '#ZZZZZZ'])).toEqual(['#aabbcc'])
    expect(VIEW_SCHEMA.palette.read([])).toEqual([])
    expect(VIEW_SCHEMA.palette.read('#112233')).toBeUndefined()
  })

  test('readView fills every missing or unreadable field with its default', () => {
    expect(readView({})).toEqual(VIEW_DEFAULTS)
    expect(readView({ cell: 'x', paper: 'rebeccapurple', rounded: 'yes', pad: 7 })).toEqual({
      ...VIEW_DEFAULTS,
      pad: 7,
    })
  })

  test('readView ignores keys the schema does not have', () => {
    expect(readView({ hilite: true, highlight: '#ff0000', help: false })).toEqual(VIEW_DEFAULTS)
  })

  test('readPatch returns only the keys it was given, an unreadable one as its default', () => {
    expect(readPatch({ cell: 20, paper: 'nope' })).toEqual({ cell: 20, paper: '' })
    expect(Object.keys(readPatch({ stroke: 0.7 }))).toEqual(['stroke'])
  })

  test('pickView keeps the fields and drops everything else', () => {
    const withExtras = { ...VIEW_DEFAULTS, setNumber: () => {}, lang: 'pl' }
    expect(pickView(withExtras)).toEqual(VIEW_DEFAULTS)
  })
})
