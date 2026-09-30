import { dictionary } from '@arrowz/engine/i18n'
import { expect, test } from 'vitest'
import { oneDecimal } from './useRunState'

test('one decimal reads 41.3 in English and 41,3 in Polish', () => {
  expect(oneDecimal(dictionary('en'), 41.25)).toBe('41.3')
  expect(oneDecimal(dictionary('pl'), 41.25)).toBe('41,3')
})
