import { expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { App } from '../App'
import { loadRunDone, mountApp, resetApp } from '../harness/mountApp'
import { useStore } from '../state/store'
import '../design/tokens.css'
import '../design/shell.css'
import '../design/console.css'
import '../design/run.css'
import '../design/report.css'
import '../design/docs.css'

// The documentation panel's geometry, measured in the shell: "the panel
// scrolls inside itself because the shell has a fixed height and does not
// scroll" is a claim about the chain from `.fw`'s grid down to the panel, and a
// component test mounts none of it. Every case states its own viewport: the
// size one case sets outlives it.

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
 * The last wait is on the page, not on the panel: both pages render the same
 * tabpanel, and react-router navigates inside `startTransition`, so a visible
 * panel can still be the element page while the CLI page is on its way.
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
    // what moves. `toBeCloseTo`, because `clientHeight` is whole pixels and the
    // rect is not. `>` on the scroll height: both pages are longer than the
    // panel, so a panel that fits would mean the page lost its content.
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

// The help table's longest line is 296 characters, about 2317px: the only thing
// on either page wider than the panel, so it must scroll by itself. Measured,
// because `overflow-x: auto` in force does not mean the block ever scrolls.
test('at 1280×800 the CLI help scrolls sideways inside its own block', async () => {
  await page.viewport(1280, 800)
  const screen = await openDocs('cli')
  const blocks = screen.container.querySelectorAll('pre.fw-docs-term')
  expect(blocks).toHaveLength(2)
  const panel = box(screen.container, '#docs-panel')
  // Neither block may be wider than the panel around it: a block that is
  // wider is the shell's sideways scroll, which is the defect itself.
  for (const block of blocks) expect(block.clientWidth).toBeLessThanOrEqual(panel.clientWidth)
  // Only the knob table overflows: the everyday form fits, so asserting that
  // it scrolls too would be asserting the viewport.
  const knobs = blocks.item(1)
  if (knobs === null) throw new Error('the knob block is not on the page')
  expect(knobs.scrollWidth).toBeGreaterThan(knobs.clientWidth)
}, 40_000)

/**
 * The App opened straight on a documentation page, as a pasted address would:
 * no tab click, so it works at XS too, where the tab strip is a menu.
 */
async function openAt(path: string) {
  resetApp('advanced')
  history.replaceState(null, '', path)
  const screen = await render(<App />)
  await expect.element(screen.getByRole('tabpanel')).toBeVisible()
  return screen
}

const rect = (container: HTMLElement, selector: string) => box(container, selector).getBoundingClientRect()

/** Where a heading stands in the panel, in pixels below the panel's top edge. */
function below(container: HTMLElement, id: string): number {
  return rect(container, `#${id}`).top - rect(container, '#docs-panel').top
}

/** The link of the section the navigation marks as in view, by its text. */
function inView(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.fw-docs-toc [aria-current="true"]')].map((a) => a.textContent)
}

// The navigation is a 200px column beside the page, 32px from it, and the page
// is a reading column of at most 110ch (792px at 1280 and up). The width is
// read against the sheet's own `110ch`, so a font change moves both.
test('at 1280×800 the navigation is a 200px column beside a 110ch page', async () => {
  await page.viewport(1280, 800)
  const screen = await openAt('/docs/element')
  const nav = rect(screen.container, '.fw-docs-toc')
  const body = rect(screen.container, '.fw-docs-body')
  expect(nav.width).toBe(200)
  expect(body.left - nav.right).toBe(32)
  expect(nav.top).toBeCloseTo(body.top, 0)
  const cap = Number.parseFloat(getComputedStyle(box(screen.container, '.fw-docs-body')).maxWidth)
  expect(body.width).toBeCloseTo(cap, 0)
}, 40_000)

// A section of the other page is one click: the page changes and the panel —
// not the document — scrolls its heading to the top, 8px under the edge.
test('a section of the other page opens that page at its heading', async () => {
  await page.viewport(1280, 800)
  const screen = await openAt('/docs/element')
  await screen.getByRole('link', { name: 'Every knob' }).click()
  await expect.poll(() => screen.container.querySelectorAll('pre.fw-docs-term').length).toBe(2)
  await expect.poll(() => below(screen.container, 'docs-knobs')).toBeCloseTo(8, 0)
  expect(box(screen.container, '#docs-panel').scrollTop).toBeGreaterThan(0)
  expect(scroller().scrollTop).toBe(0)
  expect(location.pathname).toBe('/docs/cli')
  // The fragment is still the lab's knobs, not a section id.
  expect(location.hash).toMatch(/^#%7B|^#\{/)
  await expect.poll(() => inView(screen.container)).toEqual(['Every knob'])
}, 40_000)

// A second click on the same section scrolls again after the reader has
// scrolled away: the scroll follows the navigation, not the address, which
// the second click does not change.
test('a second click on the same section scrolls back to it', async () => {
  await page.viewport(1280, 800)
  const screen = await openAt('/docs/element')
  await screen.getByRole('link', { name: 'Properties' }).click()
  await expect.poll(() => below(screen.container, 'docs-props')).toBeCloseTo(8, 0)
  box(screen.container, '#docs-panel').scrollTo({ top: 0 })
  await expect.poll(() => below(screen.container, 'docs-props')).toBeGreaterThan(100)
  await screen.getByRole('link', { name: 'Properties' }).click()
  await expect.poll(() => below(screen.container, 'docs-props')).toBeCloseTo(8, 0)
}, 40_000)

// Scrolling the panel by hand moves the mark to the section whose heading has
// come up past the line, and scrolling back to the top returns it to the first.
test('scrolling the panel moves the section in view', async () => {
  await page.viewport(1280, 800)
  const screen = await openAt('/docs/element')
  await expect.poll(() => inView(screen.container)).toEqual(['Using it'])
  const panel = box(screen.container, '#docs-panel')
  panel.scrollTo({ top: panel.scrollTop + below(screen.container, 'docs-members') - 20 })
  await expect.poll(() => inView(screen.container)).toEqual(['Methods and getters'])
  panel.scrollTo({ top: 0 })
  await expect.poll(() => inView(screen.container)).toEqual(['Using it'])
}, 40_000)

// The last section of the element page is too short to bring its heading up
// to the line at the bottom of the scroll; jumping to it must still mark it,
// not the section above.
test('jumping to the last section marks it, though its heading cannot reach the top', async () => {
  await page.viewport(1920, 1080)
  const screen = await openAt('/docs/element')
  await screen.getByRole('link', { name: 'Events' }).click()
  const panel = box(screen.container, '#docs-panel')
  await expect.poll(() => panel.scrollTop + panel.clientHeight).toBeCloseTo(panel.scrollHeight, 0)
  // The premise: the heading really is below the line a fifth of the way down.
  expect(below(screen.container, 'docs-events')).toBeGreaterThan(panel.clientHeight * 0.2)
  await expect.poll(() => inView(screen.container)).toEqual(['Events'])
}, 40_000)

// The column is sticky in the panel, which is the box that scrolls.
test('the navigation stays at the top of the panel while the page scrolls', async () => {
  await page.viewport(1280, 800)
  const screen = await openAt('/docs/element')
  const before = rect(screen.container, '.fw-docs-toc').top
  box(screen.container, '#docs-panel').scrollTo({ top: 600 })
  await expect.poll(() => box(screen.container, '#docs-panel').scrollTop).toBe(600)
  expect(rect(screen.container, '.fw-docs-toc').top).toBeCloseTo(before, 0)
}, 40_000)

// Under 768 the column stands over the page, not sticky, and lists the sections
// of the page on screen only, every link a finger's 44px. At 375×812 the page
// is 324px wide.
test.each(['en', 'pl'] as const)(
  'at 375×812 (%s) the column stands over the page',
  async (lang) => {
    await page.viewport(375, 812)
    const screen = await openAt('/docs/element')
    useStore.getState().lang.setLang(lang)
    await expect
      .poll(() => box(screen.container, '.fw-docs-toc').getAttribute('aria-label'))
      .toBe(lang === 'pl' ? 'Strony dokumentacji' : 'Documentation pages')
    const nav = rect(screen.container, '.fw-docs-toc')
    const body = rect(screen.container, '.fw-docs-body')
    expect(nav.bottom).toBeLessThanOrEqual(body.top)
    // 324px assumes a classic 11px scrollbar; the headless runner's overlay
    // scrollbars take none, so the page is the panel's content box.
    const panel = box(screen.container, '#docs-panel')
    const pad = Number.parseFloat(getComputedStyle(panel).paddingLeft) * 2
    expect(body.width).toBeCloseTo(panel.clientWidth - pad, 0)
    expect(body.width).toBeGreaterThanOrEqual(324)
    const shown = [...screen.container.querySelectorAll('.fw-docs-toc a')].filter((a) => a.getClientRects().length > 0)
    expect(shown).toHaveLength(2 + 4)
    for (const a of shown) expect(a.getBoundingClientRect().height, a.textContent ?? '').toBe(44)
    expect(getComputedStyle(box(screen.container, '.fw-docs-toc')).position).toBe('static')
    expect(scroller().scrollWidth).toBe(scroller().clientWidth)
  },
  40_000,
)

// The document never scrolls sideways, at the eight supported widths, on both
// pages, in both languages.
test.each([
  [1920, 1080],
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [924, 768],
  [768, 1024],
  [600, 900],
  [375, 812],
] as const)(
  'at %i×%i neither page scrolls the document sideways, in either language',
  async (w, h) => {
    await page.viewport(w, h)
    const screen = await openAt('/docs/element')
    // By address rather than by link text: the links' names change with the
    // language, and this loop changes the language under them.
    for (const [which, link] of [
      ['element', 'a[href="/docs/element"]'],
      ['cli', 'a[href="/docs/cli"]'],
    ] as const) {
      const anchor = screen.container.querySelector<HTMLAnchorElement>(link)
      if (anchor === null) throw new Error(`no ${link}`)
      anchor.click()
      const marker = which === 'cli' ? 'pre.fw-docs-term' : 'pre.fw-docs-code'
      await expect.poll(() => screen.container.querySelectorAll(marker).length).toBeGreaterThan(0)
      for (const lang of ['en', 'pl'] as const) {
        useStore.getState().lang.setLang(lang)
        await expect
          .poll(() => box(screen.container, '.fw-docs-toc').getAttribute('aria-label'))
          .toBe(lang === 'pl' ? 'Strony dokumentacji' : 'Documentation pages')
        expect(scroller().clientWidth, `${which} ${lang}`).toBe(w)
        expect(scroller().scrollWidth, `${which} ${lang}`).toBe(w)
      }
    }
  },
  60_000,
)
