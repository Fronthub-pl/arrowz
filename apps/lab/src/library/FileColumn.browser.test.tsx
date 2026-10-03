import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { renderAt } from '../harness/renderAt'
import type { RunControl } from '../run/useRun'
import { fileFixture } from '../state/file.fixtures'
import { useStore } from '../state/store'
import { BoardColumn } from './BoardColumn'
import { openBoardFiles } from './openBoardFiles'

let control: RunControl

beforeEach(() => {
  const state = useStore.getState()
  state.result.reset()
  state.library.reset()
  state.params.reset()
  state.lang.setLang('en')
  control = { start: vi.fn(), abort: vi.fn(), hold: vi.fn(), checkSeeds: vi.fn() }
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function mountFile(files: File[]) {
  await openBoardFiles(files, () => {})
  return renderAt(<BoardColumn control={control} />, { path: '/boards/file' })
}

test('a file with no meta offers exports, and neither Delete nor Load into lab', async () => {
  const { board } = await fileFixture(1)
  await mountFile([board])
  await expect.element(page.getByRole('button', { name: 'Open file…' })).toBeVisible()
  expect(page.getByRole('button', { name: 'Delete from disk' }).elements()).toHaveLength(0)
  expect(page.getByRole('button', { name: 'Load into lab' }).elements()).toHaveLength(0)
  expect(document.querySelector('#board-column .fw-cmdfig')).toBeNull()
})

test('the layout hash is visible with no meta opened', async () => {
  const { board, metaJson } = await fileFixture(1)
  await mountFile([board])
  await expect.element(page.getByText(metaJson.id)).toBeVisible()
})

test('with its meta, Load into lab sets the knobs and starts one run', async () => {
  const { board, meta } = await fileFixture(3)
  await mountFile([board, meta])
  await userEvent.click(page.getByRole('button', { name: 'Load into lab' }))
  expect(useStore.getState().params.values.seed).toBe(3)
  expect(control.start).toHaveBeenCalledTimes(1)
  // A file from disk is not in the store, whatever id its meta carries: no stored layout to compare with.
  expect(control.start).toHaveBeenCalledWith()
})

test('with its meta, the command is shown and there is still no Delete', async () => {
  const { board, meta, metaJson } = await fileFixture(1)
  await mountFile([board, meta])
  await expect.element(page.getByText(metaJson.command)).toBeVisible()
  expect(page.getByRole('button', { name: 'Delete from disk' }).elements()).toHaveLength(0)
})

test('with its meta, Copy puts the command on the clipboard', async () => {
  const write = vi.fn(() => Promise.resolve())
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText: write } as unknown as Clipboard)
  const { board, meta, metaJson } = await fileFixture(1)
  await mountFile([board, meta])
  await userEvent.click(page.getByRole('button', { name: 'Copy' }))
  expect(write).toHaveBeenCalledWith(metaJson.command)
})

test('Download board file hands back the file under its own name', async () => {
  const { board } = await fileFixture(1)
  const names: string[] = []
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:file-under-test')
  const onClick = (event: MouseEvent) => {
    if (!(event.target instanceof HTMLAnchorElement) || event.target.download === '') return
    names.push(event.target.download)
    event.preventDefault()
  }
  document.addEventListener('click', onClick, true)
  try {
    await mountFile([board])
    await userEvent.click(page.getByRole('button', { name: 'Download board file' }))
    expect(names).toEqual([board.name])
  } finally {
    document.removeEventListener('click', onClick, true)
  }
})
