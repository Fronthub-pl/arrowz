import { expect, test } from 'vitest'

// Read at import, which is when the store reads the preferences it remembers
// (`labLang`, `labView`, `labSimple`): the setup file must have cleared them
// already, and import time is the only moment that can be checked.
const leftOver = localStorage.getItem('harness-storage')

// There are two copies of this file, a and b, and both write the key. Whichever
// the runner takes second fails if a file inherits the storage of the file
// before it — which every file does without `vitest.setup.ts`'s clear, because
// all browser test files share one origin (measured 2026-09-14).
test('a file starts with nothing its predecessor remembered', () => {
  expect(leftOver).toBeNull()
  localStorage.setItem('harness-storage', 'b')
})

// Vitest's Chromium takes the machine's locale (measured `pl-PL` on the
// maintainer's machine), and the lab opens in Polish for a Polish browser.
// Without the pin, every test that finds a control by its English name passes
// on CI and fails on that machine.
test('the browser asks for English, whatever the machine running it speaks', () => {
  expect(navigator.language).toBe('en-US')
})
