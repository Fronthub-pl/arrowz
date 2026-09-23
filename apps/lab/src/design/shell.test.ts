import { expect, test } from 'vitest'
import css from './shell.css?raw'

// The `.fw-board` rule is the frame around the element. The element paints
// its own letterbox (`:host`, arrowz-board.ts), and a custom property
// inherits downward only, so `.fw-board` — an ancestor of the element it
// nests — can never see `--arrowz-paper`; P10 dropped the dead fallback that
// used to read it and the frame now paints the lab's own token outright.
// This test uses the same text-inspection approach as `console.test.ts`,
// because the browser assertion alone cannot verify the declaration text.
test('the board frame paints the lab token outright, not a fallback', () => {
  const rule = /\.fw-board\s*\{[^}]*background:\s*var\(--paper\)/
  expect(css).toMatch(rule)
})

// Round 3 (3h): from 768 up the status bar leaves the layout but not the
// document. The `<output aria-live>` inside it is the page's one voice, and a
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
