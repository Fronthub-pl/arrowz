import { expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { App } from '../App'
import { docsChunk } from '../harness/docsChunk'
import { resetApp } from '../harness/mountApp'
import '../design/index.css'

// The comparisons measured in the App, whose column widths the docs panel sets.

async function openAt(path: string) {
  resetApp('advanced')
  history.replaceState(null, '', path)
  const screen = await render(<App />)
  await docsChunk()
  await expect.poll(() => screen.container.querySelectorAll('.fw-docs-compare figure').length).toBeGreaterThan(0)
  await document.fonts.ready
  return screen
}

/** The height of what an element holds, which a box stretched to its row does not show. */
function inkHeight(element: Element | null): number {
  if (element === null) throw new Error('a figure lacks a part')
  const range = document.createRange()
  range.selectNodeContents(element)
  return range.getBoundingClientRect().height
}

function top(figure: Element, selector: string): number {
  const found = figure.querySelector(selector)
  if (found === null) throw new Error(`a figure has no ${selector}`)
  return found.getBoundingClientRect().top
}

/** The figures of each comparison, row by row: boards that wrap start a row of their own. */
function boardRows(container: HTMLElement): Element[][] {
  return [...container.querySelectorAll('.fw-docs-compare')].flatMap((compare) => {
    const rows = new Map<number, Element[]>()
    for (const figure of compare.querySelectorAll('figure')) {
      const at = Math.round(figure.getBoundingClientRect().top)
      rows.set(at, [...(rows.get(at) ?? []), figure])
    }
    return [...rows.values()].filter((row) => row.length > 1)
  })
}

const spread = (values: readonly number[]) => Math.max(...values) - Math.min(...values)

// 924: commands wrap to more lines than their neighbours' (the themes' middle
// one also scrolls, which adds height only with classic scrollbars, not in this
// runner). 1440: the themes' middle command wraps to a third line. 500: the
// dot grid's longer caption wraps.
test.each([
  ['element', 924, 540],
  ['element', 1440, 900],
  ['element', 500, 900],
  ['cli', 924, 540],
  ['cli', 1440, 900],
  ['cli', 500, 900],
])(
  'on the %s page at %d×%d the buttons under a row of compared boards stand level',
  async (which, w, h) => {
    await page.viewport(w, h)
    const screen = await openAt(`/docs/${which}`)
    const rows = boardRows(screen.container)
    expect(rows.length).toBeGreaterThan(0)
    // The case means something only where a column's text is taller than its neighbour's.
    const uneven = rows.filter(
      (row) =>
        spread(row.map((f) => inkHeight(f.querySelector('pre.fw-cmd')))) > 1 ||
        spread(row.map((f) => inkHeight(f.querySelector('figcaption')))) > 1,
    )
    expect(uneven.length).toBeGreaterThan(0)
    // One grid line places them all; the slack is sub-pixel rounding, a wrapped line is 19px.
    for (const row of rows) {
      const name = row.map((f) => f.getAttribute('aria-label')).join(' | ')
      expect(spread(row.map((f) => top(f, '.fw-docs-boardacts'))), name).toBeLessThan(1)
      expect(spread(row.map((f) => top(f, 'pre.fw-cmd'))), name).toBeLessThan(1)
    }
  },
  40_000,
)
