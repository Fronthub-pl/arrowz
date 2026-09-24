import { expect, test } from 'vitest'
import { LOW_MAX_HEIGHT } from '../state/band'

const SHEETS = import.meta.glob<string>('./*.css', { query: '?raw', import: 'default', eager: true })

/** Today's count of `max-height` media queries across `design/*.css`; a new one changes this. */
const QUERY_COUNT = 3

// Every `@media (max-height: …)` query must use band.ts's height, or JS and CSS
// disagree about where "low" starts. Only the height is pinned: band.ts `LOW`
// also needs `min-width: 768px`, and two of the CSS queries do not. Only
// `@media` preludes are scanned; the exact count catches a query added or removed.
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
