import { expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { loadRunDone, mountApp } from '../harness/mountApp'
import '../design/tokens.css'
import '../design/shell.css'
import '../design/console.css'
import '../design/run.css'
import '../design/report.css'
import '../design/docs.css'

// The documentation panel's geometry, measured in the shell rather than in a
// component: the claim `docs.css` makes — "the panel scrolls inside itself,
// like the report column, because the shell has a fixed height and does not
// scroll" — is about the chain from `.fw`'s grid down to the panel, and a
// component test mounts none of it. Whole-branch review measured the claim
// false at 1280×800: the document scrolled 2017×2458 inside a 1280×800
// viewport on `/docs/cli`, and 1430 tall on `/docs/element`, so the top bar and
// the tab strip scrolled off the screen.
//
// Every case states its own viewport, as `LabLayout.browser.test.tsx` does:
// the size one file sets outlives it (harness facts).

/** The element a viewport scrolls, which is what "the page scrolls" means. */
function scroller(): Element {
  const found = document.scrollingElement
  if (found === null) throw new Error('the document has no scrolling element')
  return found
}

function box(container: HTMLElement, selector: string): Element {
  const found = container.querySelector(selector)
  if (found === null) throw new Error(`${selector} is not on the page`)
  return found
}

/**
 * The docs tab, then the page's own link: the two navigations a reader makes.
 *
 * The last wait is on the page, not on the panel. Both pages render the same
 * tabpanel, so `toBeVisible()` on it is already satisfied by the element page
 * while the CLI page is still on its way — react-router navigates inside
 * `startTransition`, and the DOM of the route is what has to be polled (harness
 * facts). Measured: the CLI case passed run on its own and failed in the full
 * suite at `toHaveLength(2)`, having measured the element page.
 */
async function openDocs(which: 'element' | 'cli') {
  const screen = await mountApp('advanced')
  await loadRunDone()
  await screen.getByRole('tab', { name: 'Docs', exact: true }).click()
  if (which === 'cli') await screen.getByRole('link', { name: 'Command line' }).click()
  await expect.element(screen.getByRole('tabpanel')).toBeVisible()
  // Each page's own marker: the CLI page has the two terminal blocks, the
  // element page the one code example.
  const marker = which === 'cli' ? 'pre.fw-docs-term' : 'pre.fw-docs-code'
  await expect.poll(() => screen.container.querySelectorAll(marker).length).toBe(which === 'cli' ? 2 : 1)
  return screen
}

test.each(['element', 'cli'] as const)(
  'at 1280×800 the %s page scrolls inside the panel and not inside the document',
  async (which) => {
    await page.viewport(1280, 800)
    const screen = await openDocs(which)
    const panel = box(screen.container, '#docs-panel')
    const main = box(screen.container, '#docs-panel').closest('main')
    if (main === null) throw new Error('the panel has no main around it')
    // The viewport is stated before it is used: a shell collapsed to nothing
    // would satisfy every equality below with two zeroes.
    expect(scroller().clientWidth).toBe(1280)
    expect(scroller().clientHeight).toBe(800)
    // The shell is 100vh and does not scroll: neither down — which is what
    // takes the top bar and the tab strip off the screen — nor sideways.
    expect(scroller().scrollHeight).toBe(scroller().clientHeight)
    expect(scroller().scrollWidth).toBe(scroller().clientWidth)
    // The panel is row three of that shell, no taller, and its own overflow is
    // what moves. `toBeCloseTo` because the two are measured differently:
    // `clientHeight` is rounded to whole pixels and the rect is not, so the
    // panel reports 712 against a 711.5px <main> and an exact `<=` fails on the
    // half-pixel. `>` and not `>=` on the scroll height: both pages are longer
    // than 800px less the two bars, so a panel that fits would mean the page
    // lost its content.
    expect(panel.getBoundingClientRect().height).toBeCloseTo(main.getBoundingClientRect().height, 0)
    expect(panel.scrollHeight).toBeGreaterThan(panel.clientHeight)
    // The bars stay on screen, which is the reason any of this matters.
    const top = box(screen.container, '.fw-top').getBoundingClientRect()
    const tabs = box(screen.container, '.fw-tabrow').getBoundingClientRect()
    expect(top.top).toBeGreaterThanOrEqual(0)
    expect(tabs.bottom).toBeLessThanOrEqual(800)
  },
  40_000,
)

// The help table is 296 characters at its longest line, about 2317px: the block
// is the only thing on either page wider than the panel, and `docs.css` says it
// scrolls by itself. Measured behaviour, not a declaration — review found both
// blocks reporting `clientWidth === scrollWidth === 1978`, i.e. never scrolling,
// while `overflow-x: auto` was in force the whole time.
test('at 1280×800 the CLI help scrolls sideways inside its own block', async () => {
  await page.viewport(1280, 800)
  const screen = await openDocs('cli')
  const blocks = screen.container.querySelectorAll('pre.fw-docs-term')
  expect(blocks).toHaveLength(2)
  const panel = box(screen.container, '#docs-panel')
  // Neither block may be wider than the panel around it: a block that is
  // wider is the shell's sideways scroll, which is the defect itself.
  for (const block of blocks) expect(block.clientWidth).toBeLessThanOrEqual(panel.clientWidth)
  // Only the knob table overflows. The everyday form's longest line is about
  // a quarter of the panel — measured 1240px of block against content that
  // fits — so asserting that it scrolls too would be asserting the viewport.
  const knobs = blocks.item(1)
  if (knobs === null) throw new Error('the knob block is not on the page')
  expect(knobs.scrollWidth).toBeGreaterThan(knobs.clientWidth)
}, 40_000)
