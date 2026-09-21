import { expect, test } from 'vitest'
import css from './palette.css?raw'

// The browser project loads no stylesheet (harness fact 38), so a
// `getComputedStyle` assertion over there passes with this file missing
// entirely. These rules are what make the palette a palette: a frame the mock
// sizes, a list that scrolls instead of growing, and a trigger that is dressed
// at all rather than painted as a native browser button in the dark bar.
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

// Spec §9. Every other button family in the lab has an explicit rule
// (`.fw-tabrow button`, `.fw .fw-seg button`, `.fw .fw-alt button`,
// `.fw .fw-presets button`); without one the trigger inherits the UA's own
// chrome — a grey native button on the Signal plane. Nothing in the browser
// project can see that, which is why the rule is pinned here.
test('the trigger is dressed to the mock, and only the trigger', () => {
  const rule = /\.fw-top \.right > button\s*\{([^}]*)\}/.exec(css)
  expect(rule, '.fw-top .right > button rule not found').not.toBeNull()
  expect(rule?.[1]).toContain('height: 24px')
  expect(rule?.[1]).toContain('padding: 0 8px')
  expect(rule?.[1]).toContain('border: 1px solid rgba(14, 15, 18, 0.3)')
  expect(rule?.[1]).toContain('background: none')
  expect(rule?.[1]).toContain('color: var(--void)')
  expect(rule?.[1]).toContain('cursor: pointer')
  const hover = /\.fw-top \.right > button:hover\s*\{([^}]*)\}/.exec(css)
  expect(hover, '.fw-top .right > button:hover rule not found').not.toBeNull()
  expect(hover?.[1]).toContain('background: rgba(14, 15, 18, 0.12)')
  // The child combinator is load-bearing: a descendant selector would tie with
  // `.fw .fw-seg button` on specificity and win on import order, re-dressing
  // the view and language chips that share this container.
  expect(css).not.toMatch(/\.fw-top \.right button\s*\{/)
})
