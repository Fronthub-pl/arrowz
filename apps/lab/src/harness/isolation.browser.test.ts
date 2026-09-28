import { expect, test } from 'vitest'

// Stop reaches the worker through a SharedArrayBuffer, which a page has only
// when it is cross-origin isolated (`useGenerator`).
test('the test page is cross-origin isolated, as the lab is', () => {
  expect(crossOriginIsolated).toBe(true)
  expect(typeof SharedArrayBuffer).toBe('function')
})
