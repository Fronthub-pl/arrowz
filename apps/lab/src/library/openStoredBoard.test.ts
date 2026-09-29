import { type BoardSize, decodeBoard, encodeBoard } from '@arrowz/engine'
import { beforeEach, expect, test } from 'vitest'
import type { FileOutcome } from '../api/boards'
import { storedFixture } from '../state/library.fixtures'
import { useStore } from '../state/store'
import { type BoardAddress, openStoredBoard } from './openStoredBoard'

const first = storedFixture(1)
const second = storedFixture(2)
const sizes = (): BoardSize[] => [{ size: '8x8', W: 8, H: 8, cells: 64, boards: [second.meta, first.meta] }]
const at = (id: string | null): BoardAddress => ({ size: id === null ? null : '8x8', id, file: false })
const AT_FILE: BoardAddress = { size: null, id: null, file: true }
const state = () => useStore.getState()
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** A read the test answers by hand, and the ids it was asked for. */
function manualRead() {
  const asked: string[] = []
  const pending = new Map<string, (outcome: FileOutcome) => void>()
  const read = (_size: string, id: string) => {
    asked.push(id)
    return new Promise<FileOutcome>((resolve) => pending.set(id, resolve))
  }
  const answer = async (id: string, outcome: FileOutcome) => {
    pending.get(id)?.(outcome)
    await settle()
  }
  return { read, asked, answer }
}

function showStored(board: { meta: (typeof first)['meta']; file: unknown }) {
  state().result.showPreview({ origin: 'store', board: decodeBoard(board.file), file: board.file, meta: board.meta })
}

const shownId = () => {
  const preview = state().result.preview
  return preview?.origin === 'store' ? preview.meta.id : null
}

beforeEach(() => {
  state().result.reset()
  state().library.reset()
})

test('reads the named board, says it is loading, then shows it', async () => {
  const io = manualRead()
  openStoredBoard(at(first.meta.id), sizes(), io.read)
  expect(io.asked).toEqual([first.meta.id])
  expect(state().library.notice).toEqual({ kind: 'loading', name: `8x8/${first.meta.id}` })
  await io.answer(first.meta.id, { ok: true, file: first.file })
  expect(state().library.notice).toBeNull()
  expect(shownId()).toBe(first.meta.id)
})

test('a failed read and an undecodable file read alike: empty stage, the reason, no notice', async () => {
  const io = manualRead()
  showStored(second)
  openStoredBoard(at(first.meta.id), sizes(), io.read)
  await io.answer(first.meta.id, { ok: false, error: 'HTTP 404' })
  expect(state().result.preview).toBeNull()
  expect(state().library.notice).toBeNull()
  expect(state().library.boardError).toEqual({ name: `8x8/${first.meta.id}`, reason: 'HTTP 404' })

  showStored(second)
  openStoredBoard(at(first.meta.id), sizes(), io.read)
  await io.answer(first.meta.id, { ok: true, file: { not: 'a board' } })
  expect(state().result.preview).toBeNull()
  expect(state().library.notice).toBeNull()
  expect(state().library.boardError?.name).toBe(`8x8/${first.meta.id}`)
  expect(state().library.boardError?.reason).toMatch(/\S/)
})

test('an answer that arrives after the cancel writes nothing', async () => {
  const io = manualRead()
  const cancel = openStoredBoard(at(first.meta.id), sizes(), io.read)
  cancel()
  await io.answer(first.meta.id, { ok: true, file: first.file })
  expect(state().result.preview).toBeNull()
  expect(state().library.boardError).toBeNull()
})

test('a failed answer that arrives after the cancel writes nothing', async () => {
  const io = manualRead()
  showStored(second)
  const cancel = openStoredBoard(at(first.meta.id), sizes(), io.read)
  cancel()
  await io.answer(first.meta.id, { ok: false, error: 'HTTP 500' })
  expect(state().library.boardError).toBeNull()
  expect(shownId()).toBe(second.meta.id)
  expect(state().library.notice).toEqual({ kind: 'loading', name: `8x8/${first.meta.id}` })
})

test('back to the drawn board while another loads: no loading word, no second read, and a viewSaved survives', async () => {
  const io = manualRead()
  openStoredBoard(at(first.meta.id), sizes(), io.read)
  await io.answer(first.meta.id, { ok: true, file: first.file })
  const cancelSecond = openStoredBoard(at(second.meta.id), sizes(), io.read)
  cancelSecond()
  openStoredBoard(at(first.meta.id), sizes(), io.read)
  expect(state().library.notice).toBeNull()
  expect(shownId()).toBe(first.meta.id)
  // A view save refreshes the listing: a new array for the same drawn board.
  state().library.notify({ kind: 'viewSaved', name: `8x8/${first.meta.id}` })
  openStoredBoard(at(first.meta.id), sizes(), io.read)
  expect(state().library.notice).toEqual({ kind: 'viewSaved', name: `8x8/${first.meta.id}` })
  expect(io.asked).toEqual([first.meta.id, second.meta.id])
  await io.answer(second.meta.id, { ok: true, file: second.file })
  expect(shownId()).toBe(first.meta.id)
})

test('waits for the listing before judging an id', () => {
  const io = manualRead()
  openStoredBoard(at(first.meta.id), null, io.read)
  expect(io.asked).toEqual([])
  expect(state().library.boardError).toBeNull()
  expect(state().library.notice).toBeNull()
})

test('an id the listing does not hold empties the stage, names it, and clears a read still loading', () => {
  const io = manualRead()
  showStored(second)
  const cancel = openStoredBoard(at(first.meta.id), sizes(), io.read)
  cancel()
  openStoredBoard(at(first.meta.id), [{ size: '8x8', W: 8, H: 8, cells: 64, boards: [second.meta] }], io.read)
  expect(state().result.preview).toBeNull()
  expect(state().library.boardError).toEqual({ name: `8x8/${first.meta.id}`, reason: null })
  expect(state().library.notice).toBeNull()
})

test('no address clears the stage and a word about the board that left, and keeps a delete’s word', () => {
  showStored(first)
  state().library.notify({ kind: 'saveFailed' })
  state().library.boardFailed({ name: '8x8/x', reason: null })
  openStoredBoard(at(null), sizes())
  expect(state().result.preview).toBeNull()
  expect(state().library.notice).toBeNull()
  expect(state().library.boardError).toBeNull()

  state().library.notify({ kind: 'deleted', name: `8x8/${first.meta.id}` })
  openStoredBoard(at(null), sizes())
  expect(state().library.notice).toEqual({ kind: 'deleted', name: `8x8/${first.meta.id}` })
})

test('an opened file drops a stored preview and a loading word, and keeps its own preview and other words', () => {
  showStored(first)
  state().library.notify({ kind: 'loading', name: `8x8/${first.meta.id}` })
  openStoredBoard(AT_FILE, sizes())
  expect(state().result.preview).toBeNull()
  expect(state().library.notice).toBeNull()

  const board = decodeBoard(first.file)
  state().result.showPreview({
    origin: 'file',
    board,
    file: encodeBoard(board),
    meta: null,
    name: 'mine.board.json',
    id: first.meta.id,
  })
  state().library.notify({ kind: 'viewSaved', name: 'x' })
  openStoredBoard(AT_FILE, sizes())
  expect(state().result.preview?.origin).toBe('file')
  expect(state().library.notice).toEqual({ kind: 'viewSaved', name: 'x' })
})
