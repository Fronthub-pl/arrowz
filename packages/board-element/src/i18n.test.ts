import { expect, test } from 'vitest'
import { BOARD_LABELS, labelsFor } from './i18n.ts'

test('both dictionaries have the same keys and no empty strings', () => {
  const en = Object.keys(BOARD_LABELS.en).sort()
  const pl = Object.keys(BOARD_LABELS.pl).sort()
  expect(pl).toEqual(en)
  for (const lang of ['en', 'pl'] as const) {
    for (const [key, value] of Object.entries(BOARD_LABELS[lang])) {
      expect(value.trim().length, `${lang}.${key}`).toBeGreaterThan(0)
    }
  }
})

test('labelsFor picks Polish for pl and pl-PL and falls back to English', () => {
  expect(labelsFor('pl')).toBe(BOARD_LABELS.pl)
  expect(labelsFor('pl-PL')).toBe(BOARD_LABELS.pl)
  expect(labelsFor('en')).toBe(BOARD_LABELS.en)
  expect(labelsFor('de')).toBe(BOARD_LABELS.en)
  expect(labelsFor('')).toBe(BOARD_LABELS.en)
  expect(labelsFor(null)).toBe(BOARD_LABELS.en)
})

test('the colour button is labelled in both languages', () => {
  expect(labelsFor('pl').colors).toBe('Kolory figur')
  expect(labelsFor('en').colors).toBe('Piece colours')
})

test('every label has both languages, the WebGL message included', () => {
  const keys = Object.keys(BOARD_LABELS.en)
  expect(Object.keys(BOARD_LABELS.pl).sort()).toEqual(keys.sort())
  expect(BOARD_LABELS.en.noWebgl.length).toBeGreaterThan(0)
  expect(BOARD_LABELS.pl.noWebgl).not.toBe(BOARD_LABELS.en.noWebgl)
})

test('the gesture hints and the switch are labelled in both languages', () => {
  const en = labelsFor('en'), pl = labelsFor('pl')
  expect(en.dragHint).toBe('Drag to pan')
  expect(en.dragPlayHintMac).toBe('Drag to pan · ⌘-click to play')
  expect(en.dragPlayHintOther).toBe('Drag to pan · Ctrl-click to play')
  expect(en.clickHintMac).toBe('Hold ⌘ and drag to pan')
  expect(en.clickHintOther).toBe('Hold Ctrl and drag to pan')
  expect(en.gesturesMac).toBe('Click plays without ⌘')
  expect(en.gesturesOther).toBe('Click plays without Ctrl')
  expect(pl.dragHint).toBe('Przeciągnij, aby przesunąć')
  expect(pl.dragPlayHintMac).toBe('Przeciągnij, aby przesunąć · ⌘ + klik gra')
  expect(pl.dragPlayHintOther).toBe('Przeciągnij, aby przesunąć · Ctrl + klik gra')
  expect(pl.gesturesMac).toBe('Klik gra bez ⌘')
  expect(pl.gesturesOther).toBe('Klik gra bez Ctrl')
})
