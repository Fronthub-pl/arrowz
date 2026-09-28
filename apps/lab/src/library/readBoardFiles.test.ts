import { expect, test } from 'vitest'
import { fileFixture } from '../state/file.fixtures'
import { readBoardFiles } from './readBoardFiles'

const json = (name: string, value: unknown) => new File([JSON.stringify(value)], name, { type: 'application/json' })

test('a lone board file opens with no meta', async () => {
  const { board } = await fileFixture(1)
  const outcome = await readBoardFiles([board])
  expect(outcome.ok).toBe(true)
  if (outcome.ok) {
    expect(outcome.meta).toBeNull()
    expect(outcome.board.W).toBe(8)
    expect(outcome.name).toBe(board.name)
  }
})

test('the meta of the same board is kept, in either order', async () => {
  const { board, meta, metaJson } = await fileFixture(1)
  for (const files of [
    [board, meta],
    [meta, board],
  ]) {
    const outcome = await readBoardFiles(files)
    expect(outcome.ok && outcome.meta?.id).toBe(metaJson.id)
  }
})

// Matched by the layout hash, not the name: a renamed pair still opens.
test('a renamed pair still opens with its meta', async () => {
  const { board, meta, metaJson } = await fileFixture(1)
  const outcome = await readBoardFiles([
    new File([await board.text()], 'mine.board.json'),
    new File([await meta.text()], 'mine.json'),
  ])
  expect(outcome.ok && outcome.meta?.id).toBe(metaJson.id)
})

test('the meta of another board is refused', async () => {
  const one = await fileFixture(1)
  const two = await fileFixture(2)
  const outcome = await readBoardFiles([one.board, two.meta])
  expect(outcome).toMatchObject({ ok: false, problem: 'metaOther' })
})

test('a second file that is neither a board nor a meta is refused', async () => {
  const { board } = await fileFixture(1)
  expect(await readBoardFiles([board, json('x.json', { hello: 1 })])).toMatchObject({ ok: false, problem: 'notMeta' })
})

test('two board files at once are refused', async () => {
  const one = await fileFixture(1)
  const two = await fileFixture(2)
  expect(await readBoardFiles([one.board, two.board])).toMatchObject({ ok: false, problem: 'twoBoards' })
})

test('a file that is not JSON is refused and named', async () => {
  const outcome = await readBoardFiles([new File(['not json'], 'notes.txt')])
  expect(outcome).toMatchObject({ ok: false, problem: 'notJson', name: 'notes.txt' })
})

test('JSON with no board file among it is refused', async () => {
  const { meta } = await fileFixture(1)
  expect(await readBoardFiles([meta])).toMatchObject({ ok: false, problem: 'noBoard' })
})

test('a board file that does not decode keeps the decoder message', async () => {
  const { board } = await fileFixture(1)
  const broken = { ...JSON.parse(await board.text()), body: 'not-base64!!' }
  const outcome = await readBoardFiles([json('b.board.json', broken)])
  expect(outcome.ok).toBe(false)
  if (!outcome.ok) {
    expect(outcome.problem).toBeNull()
    expect(outcome.reason ?? '').not.toBe('')
  }
})

test('three files are refused as not a board and its meta', async () => {
  const { board, meta } = await fileFixture(1)
  expect(await readBoardFiles([board, meta, meta])).toMatchObject({ ok: false, problem: 'notMeta' })
})

test('the returned id equals the layout hash of the fixture board', async () => {
  const { board, metaJson } = await fileFixture(1)
  const outcome = await readBoardFiles([board])
  expect(outcome.ok).toBe(true)
  if (outcome.ok) {
    expect(outcome.id).toBe(metaJson.id)
  }
})
