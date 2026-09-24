import { expect, test } from 'vitest'
import css from './console.css?raw'

// The swatch strip's colours are inline styles, so the browser tests pass with
// no CSS at all. What none of them checks is that the strip lays out as a row
// (`display: flex`), so the rule's text is pinned here.
test('the swatch strip rule stays scoped under .kv-g, and lays the strip out as a row', () => {
  const rule = /\.kv-g \.fw-swatches\s*\{([^}]*)\}/.exec(css)
  expect(rule, '.kv-g .fw-swatches rule not found in console.css').not.toBeNull()
  expect(rule?.[1]).toContain('display: flex')
  expect(css).toContain('.kv-g .fw-swatch {')
})
