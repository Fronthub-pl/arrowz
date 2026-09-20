import { expect, test } from 'vitest'
import css from './shell.css?raw'

// The `.fw-board` rule is the frame around the element. Since `<arrowz-board>`
// announces the paper it actually painted on its own host (`--arrowz-paper`),
// the frame's background should read that property so the letterbox around a
// board that does not fill the frame is the board's own colour. A fallback to
// `--paper` is needed for frames that hold no element yet, so this test uses
// the same text-inspection approach as `console.test.ts`: the browser
// assertion alone cannot verify the fallback is still there.
test('the board frame reads the announced paper and keeps a fallback', () => {
  const rule = /\.fw-board\s*\{[^}]*background:\s*var\(--arrowz-paper,\s*var\(--paper\)\)/
  expect(css).toMatch(rule)
})
