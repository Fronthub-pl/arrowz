import { act } from 'react'
import { page, userEvent } from 'vitest/browser'
import { afterEach, expect, test, vi } from 'vitest'
import { loadRunDone, mountApp } from '../harness/mountApp'
import { fileFixture } from '../state/file.fixtures'
import { useStore } from '../state/store'
import { BOARD_FILE_INPUT_ID, FILE_ROUTE } from './openBoardFiles'

afterEach(() => {
  vi.restoreAllMocks()
})

/** The whole lab, with its first run done, so a case starts from a quiet page. */
async function mountQuiet() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response('[]', { status: 200 })))
  await mountApp()
  await loadRunDone()
}

function dropOnStage(transfer: DataTransfer) {
  const target = document.querySelector('.fw-view')
  if (target === null) throw new Error('no tabpanel to drop on')
  target.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
}

test('choosing a file in the input opens it at /boards/file', async () => {
  const { board } = await fileFixture(1)
  await mountQuiet()
  const input = document.getElementById(BOARD_FILE_INPUT_ID)
  if (!(input instanceof HTMLInputElement)) throw new Error('no board file input')
  const transfer = new DataTransfer()
  transfer.items.add(board)
  input.files = transfer.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await expect.poll(() => window.location.pathname).toBe(FILE_ROUTE)
  expect(useStore.getState().result.preview?.origin).toBe('file')
}, 60_000)

test('Open file… clicks the one input', async () => {
  await mountQuiet()
  window.history.pushState({}, '', '/boards')
  window.dispatchEvent(new PopStateEvent('popstate'))
  const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
  await page.getByRole('button', { name: 'Open file…' }).first().click()
  expect(click).toHaveBeenCalled()
}, 60_000)

test('a file dropped on the lab opens it', async () => {
  const { board } = await fileFixture(1)
  await mountQuiet()
  const transfer = new DataTransfer()
  transfer.items.add(board)
  dropOnStage(transfer)
  await expect.poll(() => window.location.pathname).toBe(FILE_ROUTE)
}, 60_000)

// A guard: with no files on the transfer, the no-address branch already
// leaves the page untouched, before Step 4's drop handler exists.
test('a drop with no files changes nothing', async () => {
  await mountQuiet()
  const transfer = new DataTransfer()
  transfer.setData('text/plain', 'hello')
  dropOnStage(transfer)
  await new Promise((done) => setTimeout(done, 50))
  expect(window.location.pathname).toBe('/')
  expect(useStore.getState().result.preview).toBeNull()
}, 60_000)

test('the ⌘K row clicks the one input and closes the palette', async () => {
  await mountQuiet()
  const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
  await act(async () => useStore.getState().ui.openPalette())
  const row = document.querySelector<HTMLElement>('#cmd-go-open-file')
  if (row === null) throw new Error('no open-file row')
  await userEvent.click(row)
  expect(
    click.mock.contexts.some((input) => input instanceof HTMLInputElement && input.id === BOARD_FILE_INPUT_ID),
  ).toBe(true)
  expect(useStore.getState().ui.palette).toBe(false)
}, 60_000)

test('Back after opening a file returns to the lab, and forward reopens it clean', async () => {
  const { board } = await fileFixture(1)
  await mountQuiet()
  const input = document.getElementById(BOARD_FILE_INPUT_ID)
  if (!(input instanceof HTMLInputElement)) throw new Error('no board file input')
  const transfer = new DataTransfer()
  transfer.items.add(board)
  input.files = transfer.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await expect.poll(() => window.location.pathname).toBe(FILE_ROUTE)
  window.history.back()
  await expect.poll(() => window.location.pathname).toBe('/')
  window.history.forward()
  await expect.poll(() => window.location.pathname).toBe(FILE_ROUTE)
  expect(useStore.getState().result.preview).toBeNull()
  await expect.element(page.getByText('Open a board from the list.')).toBeVisible()
}, 60_000)
