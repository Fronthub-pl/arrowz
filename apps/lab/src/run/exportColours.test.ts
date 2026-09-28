import { THEMES } from '@arrowz/board-element'
import { expect, test } from 'vitest'
import { VIEW_DEFAULTS } from '../state/viewSchema'
import { exportColours } from './exportColours'

test('an empty field is "not set" and lets the theme show', () => {
  const got = exportColours({ ...VIEW_DEFAULTS, theme: 'gruvbox-dark' })
  expect(got.paper).toBe(THEMES['gruvbox-dark']?.paper)
  expect(got.palette).toEqual(THEMES['gruvbox-dark']?.palette)
})

test('a set field beats the theme, and highlightColor is the highlight', () => {
  const got = exportColours({
    ...VIEW_DEFAULTS,
    theme: 'gruvbox-dark',
    ink: '#abcdef',
    highlightColor: '#0a0b0c',
    palette: ['#112233'],
  })
  expect(got.ink).toBe('#abcdef')
  expect(got.highlight).toBe('#0a0b0c')
  expect(got.palette).toEqual(['#112233'])
})
