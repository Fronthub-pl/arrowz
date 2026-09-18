import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { CliDocs } from './CliDocs'
// A component test loads no stylesheet of its own — `main.tsx` is not in the
// picture — so a test that measures computed style has to import the sheets,
// exactly as `ReportPanel.browser.test.tsx` and `BoardFrame.browser.test.tsx`
// do. `docs.css` is the one the overflow assertion below needs; without it that
// assertion reads `visible` (measured). `tokens.css` carries the custom
// properties the rest of the sheet uses and is imported for the same reason the
// neighbouring test files import it, not because this assertion needs it.
import '../design/tokens.css'
import '../design/docs.css'

beforeEach(() => useStore.getState().lang.setLang('en'))

// Two markers, not one. A page rendering only the long form contains every
// line the short form has but two, so a single "a line only --help=knobs
// prints" assertion passes an implementation that shows one block. These two
// lines were measured: each appears in exactly one form.
const LONG_ONLY = 'Rules (checked together with the ranges):'
const SHORT_ONLY = 'Knobs: --lmax='

test('both help forms are on the page', async () => {
  const screen = await render(<CliDocs />)
  const text = screen.container.textContent ?? ''
  expect(text).toContain(SHORT_ONLY)
  expect(text).toContain(LONG_ONLY)
})

// The long form is a table aligned with padEnd: without `pre` the runs of
// spaces collapse and the columns are gone. `overflow-x: auto` belongs with it
// — the longest line is 296 characters, about 2317px, which would otherwise
// scroll the whole page sideways.
//
// The block is measured as well as read. `overflow-x: auto` was true of both
// blocks on a page where neither could ever scroll (whole-branch review,
// measured: `clientWidth === scrollWidth === 1978`), so the declaration alone
// passes vacuously against the very thing this case is named for. Here the
// block's width comes from the test container rather than from the shell, so
// this pair says "the content is wider than the box and the box can move";
// DocsLayout.browser.test.tsx asserts the same thing where the shell is real
// and the panel constrains it.
test('the terminal blocks keep their spacing and scroll by themselves', async () => {
  const screen = await render(<CliDocs />)
  const blocks = screen.container.querySelectorAll('pre.fw-docs-term')
  expect(blocks).toHaveLength(2)
  for (const block of blocks) {
    const style = getComputedStyle(block)
    // `white-space: pre` is also the browser's own default for `<pre>`, so this
    // line alone would pass with no stylesheet at all. It stays because the
    // rule declares it and a future `pre-wrap` would be a regression — but
    // `overflow-x` is the one that proves `docs.css` is in force.
    expect(style.whiteSpace).toBe('pre')
    expect(style.overflowX).toBe('auto')
  }
  // The knob table is the block that overflows — the everyday form fits at
  // these widths — so it is the one that can say the box actually moves.
  const knobs = blocks.item(1)
  if (knobs === null) throw new Error('the knob block is not on the page')
  expect(knobs.scrollWidth).toBeGreaterThan(knobs.clientWidth)
})

// The frame is translated; the help itself is the terminal's own English. The
// `h2` is NOT the thing to compare: `deno task carve` is a command name and is
// the same in both languages. The translated frame is the section headings and
// the lead paragraph.
test('the frame speaks the chosen language and the help does not', async () => {
  const screen = await render(<CliDocs />)
  const english = screen.container.querySelector('h3')?.textContent
  expect(english).toBe('Everyday help')
  useStore.getState().lang.setLang('pl')
  const polish = await render(<CliDocs />)
  expect(polish.container.querySelector('h3')?.textContent).toBe('Pomoc na co dzień')
  expect(polish.container.textContent ?? '').toContain(SHORT_ONLY)
})
