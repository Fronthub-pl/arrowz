import { expect, test } from 'vitest'

// Read at import, which is when the store reads its remembered preferences:
// the setup file must have cleared them by then.
const leftOver = localStorage.getItem('harness-storage')

// Two copies of this file, a and b, both write the key; whichever runs second
// fails if it inherits the storage of the file before it. All browser test
// files share one origin, so only `vitest.setup.ts`'s clear prevents that.
test('a file starts with nothing its predecessor remembered', () => {
  expect(leftOver).toBeNull()
  localStorage.setItem('harness-storage', 'a')
})

// Vitest's Chromium takes the machine's locale, and the lab opens in Polish
// for a Polish browser; without the pin, English-name locators fail there.
test('the browser asks for English, whatever the machine running it speaks', () => {
  expect(navigator.language).toBe('en-US')
})
