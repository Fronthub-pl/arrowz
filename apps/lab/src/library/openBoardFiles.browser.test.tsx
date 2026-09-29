import { beforeEach, expect, test, vi } from 'vitest'
import { fileFixture } from '../state/file.fixtures'
import { finish, finishedRun } from '../state/result.fixtures'
import { useStore } from '../state/store'
import { FILE_ROUTE, openBoardFiles } from './openBoardFiles'

beforeEach(() => {
  useStore.getState().result.reset()
  useStore.getState().library.reset()
})

test('a board file lands as a file preview at its own address', async () => {
  const { board } = await fileFixture(1)
  const navigate = vi.fn()
  await openBoardFiles([board], navigate)
  expect(navigate).toHaveBeenCalledWith(FILE_ROUTE)
  const preview = useStore.getState().result.preview
  expect(preview?.origin).toBe('file')
  expect(preview?.meta).toBeNull()
  expect(useStore.getState().library.boardError).toBeNull()
})

test('a failed open still goes to the address, with the reason on the library line', async () => {
  const { board } = await fileFixture(1)
  await openBoardFiles([board], vi.fn())
  const navigate = vi.fn()
  await openBoardFiles([new File(['nope'], 'notes.txt')], navigate)
  expect(navigate).toHaveBeenCalledWith(FILE_ROUTE)
  expect(useStore.getState().result.preview).toBeNull()
  expect(useStore.getState().library.boardError).toMatchObject({ name: 'notes.txt', problem: 'notJson' })
})

test("the run's result is untouched by an open", async () => {
  const { board } = await fileFixture(1)
  finish(finishedRun(1))
  const before = useStore.getState().result.shown
  await openBoardFiles([board], vi.fn())
  expect(useStore.getState().result.shown).toBe(before)
})
