import { expect, test } from 'vitest'

// A copy of storage-a.browser.test.ts; the comments there say why.
const leftOver = localStorage.getItem('harness-storage')

test('a file starts with nothing its predecessor remembered', () => {
  expect(leftOver).toBeNull()
  localStorage.setItem('harness-storage', 'b')
})

test('the browser asks for English, whatever the machine running it speaks', () => {
  expect(navigator.language).toBe('en-US')
})
