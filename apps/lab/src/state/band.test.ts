import { expect, test } from 'vitest'
import { narrow, readBand, readLow } from './band'

// The node project has no `window` at all: the store imports this module, so
// it must answer without one. The widest band keeps a remembered preference
// deciding (spec §4), and no window is never a low one.
test('with no window the band is the widest and the window is not low', () => {
  expect(typeof window).toBe('undefined')
  expect(readBand()).toBe('xl')
  expect(readLow()).toBe(false)
})

test('only S and XS are narrow', () => {
  expect((['xl', 'l', 'm', 's', 'xs'] as const).map(narrow)).toEqual([false, false, false, true, true])
})
