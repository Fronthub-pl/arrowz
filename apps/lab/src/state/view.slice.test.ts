import {
  DEFAULT_PAD,
  DEFAULT_POINT_COLOR,
  DEFAULT_POINT_RADIUS,
  PAD_RANGE,
  POINT_RADIUS_RANGE,
} from '@arrowz/board-element'
import { DEFAULT_VIEW, VIEW_RANGE } from '@arrowz/engine/command'
import { beforeEach, expect, test } from 'vitest'
import { useStore } from './store'
import { createViewSlice, PALETTE_CAP, viewOf } from './view.slice'

const view = () => useStore.getState().view

// The slice as declared: the `beforeEach` below writes `colored`, so the live
// store would only echo the reset. No action runs, so a throwaway `set` does.
const declared = createViewSlice(() => {})

// The store outlives a test. Reset directly, not through `setTheme` (under
// test): a reset built on it would fail every case alongside the one that pins it.
beforeEach(() => {
  useStore.setState((state) => ({
    view: {
      ...state.view,
      theme: '',
      palette: [],
      paper: '',
      ink: '',
      highlight: '',
      colored: false,
      showPoints: false,
      pointColor: DEFAULT_POINT_COLOR,
      pointRadius: DEFAULT_POINT_RADIUS,
      pad: DEFAULT_PAD,
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

test('paper, ink and highlight start unset, so a theme decides them', () => {
  expect(declared.paper).toBe('')
  expect(declared.ink).toBe('')
  expect(declared.highlight).toBe('')
})

test('setHighlight sets the highlight colour', () => {
  view().setHighlight('#010203')
  expect(view().highlight).toBe('#010203')
})

test('an empty field falls back to the default rather than to zero', () => {
  view().setNumber('headHeight', '')
  // Number('') is 0, and nobody asks for a headless arrow by clearing a box
  // (`viewNumberOf`).
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

// The cap is the slice's invariant, pinned here rather than through the editor.

test('a custom colour no longer clears the chosen theme (Ruling 6)', () => {
  view().setTheme('gruvbox-dark')
  view().setPaper('#010203')
  expect(view().theme).toBe('gruvbox-dark')
  expect(view().paper).toBe('#010203')
})

test('adding a colour no longer clears the chosen theme (Ruling 6)', () => {
  view().setTheme('gruvbox-dark')
  view().addPaletteColor()
  expect(view().palette).toHaveLength(1)
  expect(view().theme).toBe('gruvbox-dark')
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

test('the cap survives the repeal', () => {
  view().setPalette(Array.from({ length: 12 }, (_, i) => `#${String(i % 10).repeat(6)}`))
  expect(view().palette).toHaveLength(PALETTE_CAP)
})

test('choosing a theme no longer discards a custom palette (Ruling 6)', () => {
  view().addPaletteColor()
  const before = view().palette
  expect(before.length).toBeGreaterThan(0)
  view().setTheme('gruvbox-dark')
  expect(view().palette).toEqual(before)
  expect(view().theme).toBe('gruvbox-dark')
})

test('a custom palette no longer clears the chosen theme either (Ruling 6)', () => {
  view().setTheme('gruvbox-dark')
  view().setPalette(['#111111', '#222222'])
  expect(view().theme).toBe('gruvbox-dark')
  expect(view().palette).toEqual(['#111111', '#222222'])
})

// The first colour turns `colored` on (see `addPaletteColor`). The three cases
// pin the empty-to-one transition and nothing either side of it.

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
  // `setPalette` never touches `theme`, an empty call included.
  view().setPalette([])
  expect(view().theme).toBe('')
  expect(view().palette).toEqual([])
})

test("the point grid starts off, in the element's own colour and radius", () => {
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

// The margin is a plain number: unlike paper/ink/highlight it has no "not
// set" state, so it starts at the element's own default rather than at ''.
test("the margin starts at the element's own default", () => {
  expect(declared.pad).toBe(DEFAULT_PAD)
})

test('the margin is clamped to what the element draws, including zero', () => {
  view().setPad(99)
  expect(view().pad).toBe(PAD_RANGE.max)
  view().setPad(-1)
  expect(view().pad).toBe(PAD_RANGE.min)
  view().setPad(0)
  expect(view().pad).toBe(0)
})

test('a non-finite margin falls back to the default, not to zero', () => {
  view().setPad(Number.NaN)
  expect(view().pad).toBe(DEFAULT_PAD)
  view().setPad(Number.POSITIVE_INFINITY)
  expect(view().pad).toBe(DEFAULT_PAD)
})

// The margin is a whole number of cells: the slider's own step is 1, and the
// number box must agree with it rather than keep a typed fraction.
test('the margin rounds to a whole cell', () => {
  view().setPad(2.5)
  expect(view().pad).toBe(3)
  view().setPad(2.4)
  expect(view().pad).toBe(2)
})
