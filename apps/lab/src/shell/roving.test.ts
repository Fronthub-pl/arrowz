import { describe, expect, it } from 'vitest'
import { nextIndex, type RovingAxis } from './roving'

type Case = [key: string, current: number, count: number, axis: RovingAxis, wrap: boolean, expected: number | null]

const CASES: Case[] = [
  ['ArrowRight', 0, 3, 'horizontal', true, 1],
  ['ArrowRight', 2, 3, 'horizontal', true, 0],
  ['ArrowLeft', 0, 3, 'horizontal', true, 2],
  ['ArrowDown', 0, 3, 'horizontal', true, null],
  ['ArrowDown', 1, 3, 'vertical', true, 2],
  ['ArrowUp', 0, 3, 'vertical', true, 2],
  ['ArrowRight', 1, 3, 'vertical', true, null],
  ['ArrowDown', 2, 3, 'both', true, 0],
  ['ArrowLeft', 1, 3, 'both', true, 0],
  ['ArrowDown', 2, 3, 'vertical', false, 2],
  ['ArrowUp', 0, 3, 'vertical', false, 0],
  ['Home', 2, 3, 'vertical', false, 0],
  ['End', 0, 3, 'horizontal', true, 2],
  ['ArrowDown', -1, 3, 'vertical', true, 0],
  ['ArrowUp', -1, 3, 'vertical', true, 2],
  ['ArrowUp', -1, 3, 'vertical', false, 2],
  ['ArrowUp', 9, 3, 'vertical', false, 1],
  ['ArrowDown', 9, 3, 'vertical', false, 2],
  ['ArrowDown', 0, 0, 'vertical', false, null],
  ['Home', 0, 0, 'vertical', false, null],
  ['Enter', 0, 3, 'both', true, null],
]

describe('nextIndex', () => {
  it.each(CASES)('%s from %i of %i on %s (wrap %s) is %s', (key, current, count, axis, wrap, expected) => {
    expect(nextIndex(key, current, count, { axis, wrap })).toBe(expected)
  })
})
