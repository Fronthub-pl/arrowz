import { expect, test } from 'vitest'
import { boundOn, percent } from './track'

test('percent places a value between its bounds', () => {
  expect(percent(0.8, 0.6, 1)).toBeCloseTo(50, 6)
  expect(percent(0.6, 0.6, 1)).toBe(0)
  expect(percent(1, 0.6, 1)).toBe(100)
})

test('percent clamps a value outside its bounds', () => {
  expect(percent(0.4, 0.6, 1)).toBe(0)
  expect(percent(1.2, 0.6, 1)).toBe(100)
})

test('a floor inside the bounds is a bound', () => {
  expect(boundOn(0.75, { min: 0.6, max: 1 })).toBe(0.75)
})

test('no floor binds nothing', () => {
  expect(boundOn(undefined, { min: 0.6, max: 1 })).toBeUndefined()
})

test('a floor outside the bounds binds nothing', () => {
  // The mix row is bounded to 0.3..0.7; a floor of 0.1 is not a bound on it.
  expect(boundOn(0.1, { min: 0.3, max: 0.7 })).toBeUndefined()
})

test('a floor exactly at the minimum binds nothing, because it binds the whole track', () => {
  // pStraight runs 0.6..1; a floor at 0.6 refuses no value on that track, so
  // marking it would claim a bound where the whole track is already legal.
  expect(boundOn(0.6, { min: 0.6, max: 1 })).toBeUndefined()
})

test('a floor exactly at the maximum binds the end of the track', () => {
  // pStraight runs 0.6..1; a floor at 1 refuses every value but the last,
  // which is worth marking.
  expect(boundOn(1, { min: 0.6, max: 1 })).toBe(1)
})
