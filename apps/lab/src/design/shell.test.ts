import { expect, test } from 'vitest'
import css from './shell.css?raw'

// The `.fw-board` rule is the frame around the element. `<arrowz-board>`
// announces the paper it actually painted on its own host (`--arrowz-paper`),
// but in this app's composition the element covers the frame and a custom
// property inherits downward only, so `.fw-board` can never see it: the
// rule's live effect here is its fallback, `--paper`, which is what actually
// paints the frame — the letterbox itself comes from the element's own
// `:host`. The property stays declared for a composition where a frame is
// larger than the element it holds. This test uses the same text-inspection
// approach as `console.test.ts`, because the browser assertion alone cannot
// verify the fallback is still there.
test('the board frame keeps a fallback to the lab token, and declares --arrowz-paper for a wider composition', () => {
  const rule = /\.fw-board\s*\{[^}]*background:\s*var\(--arrowz-paper,\s*var\(--paper\)\)/
  expect(css).toMatch(rule)
})
