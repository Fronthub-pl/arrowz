import { expect, test } from 'vitest'
import { assignPalette, themeOf, THEMES } from './mod.ts'

// This file runs in the `node` Vitest project (vitest.config.ts), and
// `mod.ts` re-exports from `arrowz-board.ts`, which calls
// `customElements.define(...)` at import time. That survives here only
// because `@lit/reactive-element`'s `exports` map resolves a `node`
// condition to `@lit-labs/ssr-dom-shim`, which shims `customElements` and
// `HTMLElement` for a DOM-less runtime — a future Lit upgrade dropping that
// condition (or this project stopping resolving `node`) would redden this
// test for a reason no reader would guess from the assertions below.
test('a consumer can reach the themes and the assignment', () => {
  expect(Object.keys(THEMES)).toHaveLength(12)
  expect(themeOf('rose-pine-dawn')?.palette.length).toBe(3)
  expect(typeof assignPalette).toBe('function')
})
