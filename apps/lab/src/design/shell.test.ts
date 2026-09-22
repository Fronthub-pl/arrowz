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
