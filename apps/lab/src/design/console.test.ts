import { expect, test } from 'vitest'
import css from './console.css?raw'

// Finding 4 (final whole-addendum review): `console.css` is imported only by
// `main.tsx`, so nothing in the browser project's own tests loads it — a
// `getComputedStyle` read in `ViewPanel.browser.test.tsx` or
// `SimplePanel.browser.test.tsx` resolves from React's inline style whether
// or not this file even declares the rule. `tokens.test.ts` already reads
// `tokens.css` through the same `?raw` import in this node project, which is
// a workable way to pin a rule's *text* here, alongside (not instead of) the
// DOM-side `.closest('.fw-k')` assertions the two panel tests carry: this
// file cannot see whether the strip actually sits inside a `.fw-k` ancestor
// at runtime, only that the selector asking for one still exists and still
// makes the strip a row.
test('the swatch strip rule stays scoped under .fw-k, and lays the strip out as a row', () => {
  const rule = /\.fw-k \.fw-swatches\s*\{([^}]*)\}/.exec(css)
  expect(rule, '.fw-k .fw-swatches rule not found in console.css').not.toBeNull()
  expect(rule?.[1]).toContain('display: flex')
  expect(css).toContain('.fw-k .fw-swatch {')
})
