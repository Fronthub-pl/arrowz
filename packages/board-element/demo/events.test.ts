import { expect, test } from 'vitest'
import { EventLog, formatDetail } from './events.ts'

test('an event pushes a row and hands it back', () => {
  const log = new EventLog()
  const effect = log.add('piece-removed', '{pieceId: 1}', '12:00:00.000')
  expect(effect.kind).toBe('push')
  expect(log.entries).toHaveLength(1)
  expect(effect.entry.count).toBe(1)
})

test('the same event twice in a row counts instead of piling up', () => {
  const log = new EventLog()
  log.add('viewport-change', '{cellPx: 12}', '12:00:00.000')
  const effect = log.add('viewport-change', '{cellPx: 12}', '12:00:00.016')
  expect(effect.kind).toBe('repeat')
  expect(log.entries).toHaveLength(1)
  expect(effect.entry.count).toBe(2)
  expect(effect.entry.time).toBe('12:00:00.016')
})

test('the same type with a different detail is a new row', () => {
  const log = new EventLog()
  log.add('piece-removed', '{pieceId: 1}', '12:00:00.000')
  log.add('piece-removed', '{pieceId: 2}', '12:00:00.100')
  expect(log.entries).toHaveLength(2)
})

test('only consecutive repeats coalesce', () => {
  const log = new EventLog()
  log.add('piece-click', '{pieceId: 1}', '12:00:00.000')
  log.add('piece-removed', '{pieceId: 1}', '12:00:00.001')
  log.add('piece-click', '{pieceId: 1}', '12:00:00.002')
  expect(log.entries).toHaveLength(3)
})

test('past the limit the oldest row leaves, and the effect says so', () => {
  const log = new EventLog(2)
  log.add('a', '{}', '1')
  log.add('b', '{}', '2')
  const effect = log.add('c', '{}', '3')
  expect(effect.kind === 'push' && effect.evicted).toBe(true)
  expect(log.entries).toHaveLength(2)
  expect(log.entries.map((e) => e.type)).toEqual(['b', 'c'])
})

test('clear empties the log', () => {
  const log = new EventLog()
  log.add('finished', '{pieces: 12}', '12:00:00.000')
  log.clear()
  expect(log.entries).toHaveLength(0)
})

test('a detail prints as its fields, unquoted keys and all', () => {
  expect(formatDetail({ pieceId: 12, left: 41 })).toBe('{pieceId: 12, left: 41}')
})

test('a float in a detail prints to two places, a flag as itself', () => {
  expect(formatDetail({ originX: 3.14159, fitted: true })).toBe('{originX: 3.14, fitted: true}')
})

test('an event without a detail prints as empty braces', () => {
  expect(formatDetail(null)).toBe('{}')
  expect(formatDetail(undefined)).toBe('{}')
  expect(formatDetail({})).toBe('{}')
})
