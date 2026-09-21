import { expect, test } from 'vitest'
import css from './palette.css?raw'

// The browser project loads no stylesheet (harness fact 38), so a
// `getComputedStyle` assertion over there passes with this file missing
// entirely. These two rules are what make the palette a palette: a frame the
// mock sizes, and a list that scrolls instead of growing.
test('the frame keeps the mock width and the strong border', () => {
  const rule = /\.fw-pal\s*\{([^}]*)\}/.exec(css)
  expect(rule, '.fw-pal rule not found').not.toBeNull()
  expect(rule?.[1]).toContain('min(560px, calc(100vw - 32px))')
  expect(rule?.[1]).toContain('var(--border-strong)')
})

test('the list is bounded, which is what makes it scroll', () => {
  const rule = /\.fw-pal \.list\s*\{([^}]*)\}/.exec(css)
  expect(rule, '.fw-pal .list rule not found').not.toBeNull()
  expect(rule?.[1]).toContain('max-height: 46vh')
  expect(rule?.[1]).toContain('overflow-y: auto')
})
