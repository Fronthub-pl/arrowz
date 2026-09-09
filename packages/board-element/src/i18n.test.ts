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
