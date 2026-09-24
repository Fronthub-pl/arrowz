import { expect, test } from 'vitest'
import { LOW_MAX_HEIGHT } from '../state/band'

const SHEETS = import.meta.glob<string>('./*.css', { query: '?raw', import: 'default', eager: true })

/** Today's count of `max-height` media queries across `design/*.css`; a new one changes this. */
const QUERY_COUNT = 3

// band.ts reads the low window through one `matchMedia` height; every
// `@media (max-height: …)` query in the CSS must gate the same height, or
// the JS-driven layout and the stylesheet disagree about where "low" starts.
// A plain `max-height` property (a sizing rule, not a query) sits outside any
// `@media` prelude, so scanning preludes rather than the whole file excludes
// it; the exact count catches a query silently added or removed, not just one
// with the wrong number.
test('every max-height query in design/*.css matches band.ts LOW_MAX_HEIGHT', () => {
  const found: Array<readonly [string, number]> = []
  for (const [name, css] of Object.entries(SHEETS)) {
    for (const prelude of css.matchAll(/@media([^{]*)\{/g)) {
      for (const height of (prelude[1] ?? '').matchAll(/max-height:\s*(\d+)px/g)) {
        found.push([name, Number(height[1])])
      }
    }
  }
  expect(found.length, found.map(([name, height]) => `${name}: ${height}`).join('\n')).toBe(QUERY_COUNT)
  for (const [name, height] of found) {
    expect(height, `${name}: max-height query`).toBe(LOW_MAX_HEIGHT)
  }
})
