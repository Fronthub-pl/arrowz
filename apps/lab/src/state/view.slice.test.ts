import { DEFAULT_POINT_COLOR, DEFAULT_POINT_RADIUS, POINT_RADIUS_RANGE } from '@arrowz/board-element'
import { DEFAULT_VIEW, VIEW_RANGE } from '@arrowz/engine/command'
import { beforeEach, expect, test } from 'vitest'
import { useStore } from './store'
import { createViewSlice, PALETTE_CAP, viewOf } from './view.slice'

const view = () => useStore.getState().view

// The slice as declared, untouched by the `beforeEach` below. `colored` is
// among the fields that reset writes, so the live store cannot say where the
// lab starts it — reading it back would only echo the reset. A throwaway
// `set` is enough: the starting values are plain fields, no action runs.
const declared = createViewSlice(() => {})

// The store outlives a test (view.slice.ts's own singleton): a theme or a
// palette chosen by one test must not leak into the next. Reset both fields
// directly rather than through `setTheme` — `setTheme` is exactly what
// Ruling B's mutation below targets, and a `beforeEach` built on the action
// under test would make every later test fail alongside it instead of
// pinning only the two that assert the exclusion itself.
beforeEach(() => {
  useStore.setState((state) => ({
    view: {
      ...state.view,
      theme: '',
      palette: [],
      colored: false,
      showPoints: false,
      pointColor: DEFAULT_POINT_COLOR,
      pointRadius: DEFAULT_POINT_RADIUS,
    },
  }))
})

test('the fields start where the previous lab starts them', () => {
  expect(view().cell).toBe(12)
  expect(view().stroke).toBe(DEFAULT_VIEW.stroke)
  expect(view().rounded).toBe(true)
  expect(view().hilite).toBe(true)
  expect(view().voids).toBe(true)
  expect(declared.colored).toBe(false)
  expect(view().top).toBe(5)
})

test('an empty field falls back to the default rather than to zero', () => {
  view().setNumber('headHeight', '')
  // Number('') is 0, and a head of no height is a real setting nobody asks
  // for by clearing a box (command.ts, viewNumberOf).
  expect(view().headHeight).toBe(DEFAULT_VIEW.headHeight)
})

test('a typed-over value is clamped into what the CLI takes', () => {
  view().setNumber('cell', '9999')
  expect(view().cell).toBe(VIEW_RANGE.cell.max)
  view().setNumber('stroke', '-4')
  expect(view().stroke).toBe(VIEW_RANGE.stroke.min)
})

test('a whole field rounds', () => {
  view().setNumber('top', '7.6')
  expect(view().top).toBe(8)
})

test('the highlight flag is what zeroes top, because the CLI has no flag for it', () => {
  view().setNumber('top', '9')
  expect(viewOf(view()).top).toBe(9)
  view().toggle('hilite')
  expect(viewOf(view()).top).toBe(0)
  // The number itself survives the flag, so switching back restores it.
  expect(view().top).toBe(9)
  view().toggle('hilite')
})

test('voids is not part of the view: the CLI has no such flag', () => {
  expect('voids' in viewOf(view())).toBe(false)
})

test('a flag set to the value a link states stays there, however often it is stated', () => {
  // `toggle` flips, so a link naming a flag twice would flip it back; a link
  // states a value, and stating it again has to be a no-op.
  view().setFlag('colored', true)
  view().setFlag('colored', true)
  expect(view().colored).toBe(true)
  view().setFlag('colored', false)
  expect(view().colored).toBe(false)
})

// Palette round-2 addendum, task 2: the lab's editable custom palette.
// Ruling B (mutual exclusion) and Ruling C (the cap) both live in the
// slice, exercised here rather than through the editor, so the store's own
// invariant is what is pinned — not merely a component that happens to obey it.

test('adding a colour appends it and clears any chosen theme', () => {
  view().setTheme('gruvbox-dark')
  view().addPaletteColor()
  expect(view().palette).toHaveLength(1)
  expect(view().theme).toBe('')
})

test('editing a colour changes only the entry at that index', () => {
  view().addPaletteColor()
  view().addPaletteColor()
  view().setPaletteColor(1, '#ff00ff')
  expect(view().palette).toEqual(['#000000', '#ff00ff'])
})

test('removing a colour drops only the entry at that index', () => {
  view().addPaletteColor()
  view().addPaletteColor()
  view().addPaletteColor()
  view().setPaletteColor(1, '#ff00ff')
  view().removePaletteColor(0)
  expect(view().palette).toEqual(['#ff00ff', '#000000'])
})

test(`the palette refuses a colour past the cap of ${PALETTE_CAP}`, () => {
  for (let i = 0; i < PALETTE_CAP; i++) view().addPaletteColor()
  expect(view().palette).toHaveLength(PALETTE_CAP)
  view().addPaletteColor()
  expect(view().palette).toHaveLength(PALETTE_CAP)
})

test('choosing a theme clears a custom palette (Ruling B)', () => {
  view().addPaletteColor()
  expect(view().palette.length).toBeGreaterThan(0)
  view().setTheme('gruvbox-dark')
  expect(view().palette).toEqual([])
  expect(view().theme).toBe('gruvbox-dark')
})

test('setting a non-empty palette clears the chosen theme (Ruling B)', () => {
  view().setTheme('gruvbox-dark')
  view().setPalette(['#111111', '#222222'])
  expect(view().theme).toBe('')
  expect(view().palette).toEqual(['#111111', '#222222'])
})

// Finding 2 (final whole-addendum review, human decision): the first colour
// added to an empty palette turns colouring on, because the element gates
// every piece colour behind `colored` and a theme has no such gate (paper
// and ink apply regardless). The three cases below pin the boundary exactly:
// the empty-to-one transition and nothing either side of it.

test('adding the first colour to an empty palette turns colouring on', () => {
  expect(view().colored).toBe(false)
  view().addPaletteColor()
  expect(view().colored).toBe(true)
})

test('adding a second colour does not move colouring either way', () => {
  view().addPaletteColor()
  expect(view().colored).toBe(true)
  // Turned back off by hand; a second colour must respect that, not fight it.
  view().setFlag('colored', false)
  view().addPaletteColor()
  expect(view().palette).toHaveLength(2)
  expect(view().colored).toBe(false)
})

test('removing every colour never turns colouring back off', () => {
  view().addPaletteColor()
  expect(view().colored).toBe(true)
  view().removePaletteColor(0)
  expect(view().palette).toEqual([])
  expect(view().colored).toBe(true)
})

test('setting an empty palette leaves an already-absent theme alone', () => {
  // Nothing to clear: the invariant already holds `theme === ''` whenever
  // the palette is non-empty, so an empty `setPalette` call touching `theme`
  // would be a needless write, not a needed one.
  view().setPalette([])
  expect(view().theme).toBe('')
  expect(view().palette).toEqual([])
})

test('the point grid starts off, in the element\'s own colour and radius', () => {
  expect(declared.showPoints).toBe(false)
  expect(declared.pointColor).toBe(DEFAULT_POINT_COLOR)
  expect(declared.pointRadius).toBe(DEFAULT_POINT_RADIUS)
})

test('the point radius is clamped to what the element draws', () => {
  view().setPointRadius('9')
  expect(view().pointRadius).toBe(POINT_RADIUS_RANGE.max)
  view().setPointRadius('-1')
  expect(view().pointRadius).toBe(POINT_RADIUS_RANGE.min)
})

test('an unreadable point radius falls back to the default, not to zero', () => {
  view().setPointRadius('')
  expect(view().pointRadius).toBe(DEFAULT_POINT_RADIUS)
})

test('a non-empty unparsable point radius falls back to the default, not to NaN', () => {
  view().setPointRadius('abc')
  expect(view().pointRadius).toBe(DEFAULT_POINT_RADIUS)
})
