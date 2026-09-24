import { expect, test } from 'vitest'
import { LOW_MAX_HEIGHT } from '../state/band'
import consoleCss from './console.css?raw'
import docsCss from './docs.css?raw'
import libraryCss from './library.css?raw'
import paletteCss from './palette.css?raw'
import reportCss from './report.css?raw'
import runCss from './run.css?raw'
import shellCss from './shell.css?raw'
import tokensCss from './tokens.css?raw'

const SHEETS: readonly (readonly [string, string])[] = [
  ['console.css', consoleCss],
  ['docs.css', docsCss],
  ['library.css', libraryCss],
  ['palette.css', paletteCss],
  ['report.css', reportCss],
  ['run.css', runCss],
  ['shell.css', shellCss],
  ['tokens.css', tokensCss],
]

// band.ts reads the low window through one `matchMedia` height; every
// `@media (max-height: …)` query in the CSS must gate the same height, or
// the JS-driven layout and the stylesheet disagree about where "low" starts.
// A plain `max-height` property (a sizing rule, not a query) is not a match:
// the regex requires `@media` before the parenthesis.
test('every max-height query in design/*.css matches band.ts LOW_MAX_HEIGHT', () => {
  const found: Array<readonly [string, number]> = []
  for (const [name, css] of SHEETS) {
    for (const match of css.matchAll(/@media[^{]*\(max-height:\s*(\d+)px\)/g)) {
      found.push([name, Number(match[1])])
    }
  }
  expect(found.length).toBeGreaterThan(0)
  for (const [name, height] of found) {
    expect(height, `${name}: max-height query`).toBe(LOW_MAX_HEIGHT)
  }
})
