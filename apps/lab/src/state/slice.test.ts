import { expect, test } from 'vitest'
import { patcher, persistedFlag, type SliceSet } from './slice'

interface Box {
  a: number
  list: number[]
  open: boolean
}

function store(box: Box) {
  const held: { box: Box } = { box }
  const set: SliceSet<'box', Box> = (fn) => Object.assign(held, fn(held))
  return { held, set }
}

test('patcher replaces the named fields and keeps the others by reference', () => {
  const list = [1, 2]
  const { held, set } = store({ a: 1, list, open: false })
  patcher(set, 'box')({ a: 2 })
  expect(held.box.a).toBe(2)
  expect(held.box.list).toBe(list)
})

test('a persisted flag sets, and toggles from the value in the store', () => {
  const { held, set } = store({ a: 1, list: [], open: false })
  const flag = persistedFlag(set, 'box', 'open', 'slice-test-flag')
  flag.set(true)
  expect(held.box.open).toBe(true)
  flag.toggle()
  flag.toggle()
  expect(held.box.open).toBe(true)
  flag.toggle()
  expect(held.box.open).toBe(false)
})
