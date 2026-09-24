import { helpText } from '@arrowz/engine/command'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { CliDocs } from './CliDocs'
import { DOCS_SECTIONS } from './DocsNav'
// A component test loads no stylesheet of its own, so a test that measures
// computed style imports the sheets: `docs.css` for the overflow assertion
// below (without it that reads `visible`), and `tokens.css` for the custom
// properties the sheet uses.
import '../design/tokens.css'
import '../design/docs.css'

beforeEach(() => useStore.getState().lang.setLang('en'))
afterEach(() => vi.restoreAllMocks())

// Two markers, not one: the long form contains every line of the short form
// but two, so one marker would pass a page showing a single block. Each of
// these lines appears in exactly one form.
const LONG_ONLY = 'Rules (checked together with the ranges):'
const SHORT_ONLY = 'Knobs: --lmax='

test('both help forms are on the page', async () => {
  const screen = await render(<CliDocs />)
  const text = screen.container.textContent ?? ''
  expect(text).toContain(SHORT_ONLY)
  expect(text).toContain(LONG_ONLY)
})

// The long form is a table aligned with padEnd: without `pre` the runs of
// spaces collapse. `overflow-x: auto` belongs with it: the longest line is
// about 2317px. Measured, not only declared, because the declaration holds on
// a block that can never scroll. Here the width comes from the test container;
// `DocsLayout.browser.test.tsx` asserts the same where the shell is real.
test('the terminal blocks keep their spacing and scroll by themselves', async () => {
  const screen = await render(<CliDocs />)
  // Each block in its own frame with its Copy.
  const blocks = screen.container.querySelectorAll('div.fw-docs-block > pre.fw-docs-term')
  expect(blocks).toHaveLength(2)
  for (const block of blocks) {
    const style = getComputedStyle(block)
    // `white-space: pre` is also the browser's default for `<pre>`, so this line
    // alone passes with no stylesheet; `overflow-x` is the one that proves
    // `docs.css` is in force.
    expect(style.whiteSpace).toBe('pre')
    expect(style.overflowX).toBe('auto')
  }
  // The knob table is the block that overflows (the everyday form fits at
  // these widths), so it is the one that can say the box actually moves.
  const knobs = blocks.item(1)
  if (knobs === null) throw new Error('the knob block is not on the page')
  expect(knobs.scrollWidth).toBeGreaterThan(knobs.clientWidth)
})

// The frame is translated; the help itself is the terminal's own English. Not
// the `h2`: `deno task carve` is the same in both languages. The translated
// frame is the section headings and the lead paragraph.
test('the frame speaks the chosen language and the help does not', async () => {
  const screen = await render(<CliDocs />)
  const english = screen.container.querySelector('h3')?.textContent
  expect(english).toBe('Everyday help')
  useStore.getState().lang.setLang('pl')
  const polish = await render(<CliDocs />)
  expect(polish.container.querySelector('h3')?.textContent).toBe('Pomoc na co dzień')
  expect(polish.container.textContent ?? '').toContain(SHORT_ONLY)
})

// Each help block has a Copy that names its section and writes the block's
// text exactly: the help is copied to be pasted in a terminal.
test('each help block copies its own text', async () => {
  const write = vi.fn(() => Promise.resolve())
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText: write } as unknown as Clipboard)
  const screen = await render(<CliDocs />)
  await screen.getByRole('button', { name: 'Copy: Every knob' }).click()
  expect(write).toHaveBeenLastCalledWith(helpText({ knobs: true }))
  await screen.getByRole('button', { name: 'Copy: Everyday help' }).click()
  expect(write).toHaveBeenLastCalledWith(helpText())
})

// The terminal's text is plain: no colouring, unlike the element's example.
test('the help blocks stay uncoloured', async () => {
  const screen = await render(<CliDocs />)
  expect(screen.container.querySelectorAll('pre.fw-docs-term [class^="tk-"]')).toHaveLength(0)
})

// The navigation column scrolls to these.
test('both section headings carry the ids the navigation names', async () => {
  const screen = await render(<CliDocs />)
  const ids = [...screen.container.querySelectorAll('h3')].map((h) => h.id)
  expect(ids).toEqual(DOCS_SECTIONS.cli.map((section) => section.id))
})
