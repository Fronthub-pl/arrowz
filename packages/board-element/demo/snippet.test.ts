import { expect, test } from 'vitest'
import { DEFAULT_VIEW } from '../src/mod.ts'
import { snippet, type SnippetState } from './snippet.ts'

const state = (over: Partial<SnippetState> = {}): SnippetState => ({
  attrs: [],
  view: { ...DEFAULT_VIEW },
  board: null,
  ...over,
})

const tagOf = (text: string): string => text.split('\n')[0] ?? ''

test('a board at its defaults is a bare tag and no assignments', () => {
  const text = snippet(state())
  expect(tagOf(text)).toBe('<arrowz-board></arrowz-board>')
  expect(text).not.toContain('el.view')
  expect(text).not.toContain('el.board')
  expect(text).toContain("import '@arrowz/board-element'")
})

test('a flag prints bare, a value prints quoted', () => {
  const text = snippet(state({ attrs: [['play', ''], ['pad', '6']] }))
  expect(tagOf(text)).toBe('<arrowz-board play pad="6"></arrowz-board>')
})

test('an attribute sitting at its default is left out', () => {
  const text = snippet(state({ attrs: [['pad', '4'], ['point-color', '#c9c9d6'], ['lang', 'en']] }))
  expect(tagOf(text)).toBe('<arrowz-board></arrowz-board>')
})

test('attributes the element does not own are ignored', () => {
  const text = snippet(state({ attrs: [['id', 'board'], ['style', 'width: 100%'], ['class', 'x']] }))
  expect(tagOf(text)).toBe('<arrowz-board></arrowz-board>')
})

test('the tag follows the table order, not the order the DOM happens to hold', () => {
  const text = snippet(state({ attrs: [['pad', '6'], ['show-points', ''], ['play', '']] }))
  expect(tagOf(text)).toBe('<arrowz-board play show-points pad="6"></arrowz-board>')
})

test('view prints only the fields that differ from the defaults', () => {
  const text = snippet(state({ view: { ...DEFAULT_VIEW, stroke: 0.8, colored: true } }))
  expect(text).toContain('el.view = { stroke: 0.8, colored: true }')
})

test('a colour prints as a quoted string', () => {
  const text = snippet(state({ view: { ...DEFAULT_VIEW, ink: '#000000' } }))
  expect(text).toContain("el.view = { ink: '#000000' }")
})

test("a number carrying a step's rounding error prints short", () => {
  const text = snippet(state({ view: { ...DEFAULT_VIEW, stroke: 0.30000000000000004 } }))
  expect(text).toContain('el.view = { stroke: 0.3 }')
})

test('a generated board prints the call that made it', () => {
  const text = snippet(state({ board: { W: 30, H: 40, seed: 7 } }))
  expect(text).toContain('el.board = generate({ ...defaultParams(), W: 30, H: 40, seed: 7 }).board')
})
