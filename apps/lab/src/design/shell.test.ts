import { expect, test } from 'vitest'
import css from './shell.css?raw'

// `.fw-board` is an ancestor of the element, and a custom property inherits
// downward only, so it can never see `--arrowz-paper`: the frame paints the
// lab's own token. The browser project loads no CSS, so the text is pinned.
test('the board frame paints the lab token outright, not a fallback', () => {
  const rule = /\.fw-board\s*\{[^}]*background:\s*var\(--paper\)/
  expect(css).toMatch(rule)
})

// From 768 up the status bar leaves the layout but not the document. The `<output aria-live>` inside it is the page's one voice, and a
// live region under `display: none` (or `visibility: hidden`) is silent — so
// the bar is clipped to a pixel, never removed. The browser half of this,
// that the output is still there and still speaks, is LabLayout's.
test('from 768 up the status bar is clipped out of sight, never removed', () => {
  const block = /@media \(min-width: 768px\) \{\s*\.fw-view \{[^}]*\}\s*\.fw-bar \{([^}]*)\}\s*\}/.exec(css)
  expect(block, 'the round 3 block over .fw-bar').not.toBeNull()
  const rule = block?.[1] ?? ''
  expect(rule).toMatch(/position:\s*absolute/)
  expect(rule).toMatch(/width:\s*1px/)
  expect(rule).toMatch(/clip:/)
  expect(rule).not.toMatch(/display:\s*none/)
  expect(rule).not.toMatch(/visibility:\s*hidden/)
})
