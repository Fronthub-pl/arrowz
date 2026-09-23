import { defaultParams, PARAM_SPEC, type ParamKey, validateParams } from '@arrowz/engine'
import { wordFor } from '@arrowz/engine/command'
import { expect, test } from 'vitest'
import { BLOCKS, blockKeys, RELEASE_TO } from './knobLayout'

const specOf = (key: ParamKey) => {
  const spec = PARAM_SPEC.find((s) => s.key === key)
  if (spec === undefined) throw new Error(`no spec ${key}`)
  return spec
}

// The blocks are the lab's drawing of the engine's `inactive` reasons, so they
// are checked against the engine rather than trusted: a knob the engine turns
// off for the block's reason while every parent is 0 is in the block, and one
// it does not is not.
test.each(Object.entries(BLOCKS))('the %s block holds exactly the knobs its parents switch off', (group, block) => {
  if (block === undefined) throw new Error('an empty block entry')
  const off = defaultParams()
  for (const key of block.parents) off[key] = 0
  const expected = PARAM_SPEC.filter((s) => s.group === group && s.inactive?.(off) === block.reason).map((s) => s.key)
  expect([...blockKeys(block)].sort()).toEqual([...expected].sort())
  // And every parent alone switches the block on: with one parent at its
  // maximum, no knob in the block reports the block's reason.
  for (const parent of block.parents) {
    const on = { ...off, [parent]: specOf(parent).max }
    for (const key of blockKeys(block))
      expect(specOf(key).inactive?.(on), `${key} with ${parent} on`).not.toBe(block.reason)
  }
})

test('a parent is never inside its own block, and no parent is ever inactive', () => {
  for (const block of Object.values(BLOCKS)) {
    if (block === undefined) continue
    for (const parent of block.parents) {
      expect(blockKeys(block)).not.toContain(parent)
      expect(specOf(parent).inactive).toBeUndefined()
    }
  }
})

// A released chip lands on a value the engine accepts: 17 is the smallest
// maximum length `lmaxHole` allows, and 16 is not.
test('each release value is legal, and the one below it for Lmax is not', () => {
  for (const [key, value] of Object.entries(RELEASE_TO)) {
    const k = key as ParamKey
    expect(wordFor(k, value), `${key} releases onto its special value`).toBeNull()
    expect(validateParams({ ...defaultParams(), [k]: value }), `${key}=${value}`).toEqual([])
  }
  expect(validateParams({ ...defaultParams(), Lmax: 16 })).not.toEqual([])
})
