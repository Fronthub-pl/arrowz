import { expect, test } from 'vitest'
import css from './palette.css?raw'

// The browser project loads no stylesheet, so a `getComputedStyle` assertion
// there passes with this file missing. These rules make the palette: a sized
// frame, a list that scrolls instead of growing, and a dressed trigger.
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

// Without an explicit rule, like every other button family's, the trigger
// keeps the UA's grey native chrome on the Signal plane.
test('the trigger is dressed to the mock, and only the trigger', () => {
  const rule = /\.fw-top \.right > button\s*\{([^}]*)\}/.exec(css)
  expect(rule, '.fw-top .right > button rule not found').not.toBeNull()
  expect(rule?.[1]).toContain('height: 24px')
  expect(rule?.[1]).toContain('padding: 0 8px')
  expect(rule?.[1]).toContain('border: 1px solid rgba(237, 238, 242, 0.4)')
  expect(rule?.[1]).toContain('background: none')
  expect(rule?.[1]).toContain('color: var(--ink)')
  expect(rule?.[1]).toContain('cursor: pointer')
  const hover = /\.fw-top \.right > button:hover\s*\{([^}]*)\}/.exec(css)
  expect(hover, '.fw-top .right > button:hover rule not found').not.toBeNull()
  // Not a 12% `--ink` blend: that measured about 4.2:1 under `--ink`, below AA.
  // LayoutInvariants measures the contrast in the browser; this pins the token.
  expect(hover?.[1]).toContain('background: var(--signal-fill-hover)')
  // The child combinator is load-bearing: see the trigger's rule in palette.css.
  expect(css).not.toMatch(/\.fw-top \.right button\s*\{/)
})
