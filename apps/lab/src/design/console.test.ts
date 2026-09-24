import { expect, test } from 'vitest'
import css from './console.css?raw'

// `console.css` is imported only by `main.tsx`, so nothing in the browser
// project's own tests loads it — a `getComputedStyle` read in
// `ViewPanel.browser.test.tsx` resolves from React's inline style whether or
// not this file even declares the rule. `tokens.test.ts` already reads
// `tokens.css` through the same `?raw` import in this node project, which is
// a workable way to pin a rule's *text* here.
test('the swatch strip rule stays scoped under .kv-g, and lays the strip out as a row', () => {
  const rule = /\.kv-g \.fw-swatches\s*\{([^}]*)\}/.exec(css)
  expect(rule, '.kv-g .fw-swatches rule not found in console.css').not.toBeNull()
  expect(rule?.[1]).toContain('display: flex')
  expect(css).toContain('.kv-g .fw-swatch {')
})
