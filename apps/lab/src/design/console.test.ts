import { expect, test } from 'vitest'
import css from './console.css?raw'

// Many browser tests do import `console.css`, but the swatch strip's own
// colours are inline styles (`ViewPanel.tsx`'s `style={{ backgroundColor }}`),
// so `ViewPanel.browser.test.tsx`'s `getComputedStyle` colour assertions pass
// identically with no CSS file at all — the comment on that test says so.
// What no browser test checks is that the strip actually lays out as a row:
// that is this rule's `display: flex`. `tokens.test.ts` already reads
// `tokens.css` through the same `?raw` import in this node project, which is
// a workable way to pin a rule's *text* here.
test('the swatch strip rule stays scoped under .kv-g, and lays the strip out as a row', () => {
  const rule = /\.kv-g \.fw-swatches\s*\{([^}]*)\}/.exec(css)
  expect(rule, '.kv-g .fw-swatches rule not found in console.css').not.toBeNull()
  expect(rule?.[1]).toContain('display: flex')
  expect(css).toContain('.kv-g .fw-swatch {')
})
