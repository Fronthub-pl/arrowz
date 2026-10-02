import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { App } from '../App'
import { resetApp } from '../harness/mountApp'
import { storedFixture } from '../state/library.fixtures'
import { useStore } from '../state/store'
import '../design/index.css'

const stored = storedFixture(1)
const boardPath = `/boards/8x8/${stored.meta.id}`

/** The store's list, file and delete endpoints for the one fixture board. */
function stubStore() {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input)
    if (init?.method === 'DELETE') return Promise.resolve(Response.json({ deleted: true }))
    if (url.includes('/api/boards'))
      return Promise.resolve(Response.json([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [stored.meta] }]))
    if (url.includes('/store/')) return Promise.resolve(Response.json(stored.file))
    return Promise.resolve(new Response('{}', { status: 404 }))
  })
}

/** The stored board on the stage, or null: the lab tab clears it, so it is back only if it was read again. */
function onStage(): string | null {
  const preview = useStore.getState().result.preview
  return preview?.origin === 'store' ? preview.meta.id : null
}

// Desktop, so the tab strip and the board column are on screen without a sheet.
beforeEach(async () => {
  await page.viewport(1400, 900)
  resetApp('advanced')
  stubStore()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await page.viewport(414, 896)
})

async function openBoard() {
  window.history.pushState({}, '', boardPath)
  const screen = await render(<App />)
  await expect.poll(onStage, { timeout: 20_000 }).toBe(stored.meta.id)
  return screen
}

test('the saved boards tab brings back the board it showed before the lab', async () => {
  const screen = await openBoard()
  await userEvent.click(screen.getByRole('tab', { name: 'Lab', exact: true }))
  await expect.poll(() => location.pathname).toBe('/')
  // Polled: the address moves before React commits the route and clears the stage.
  await expect.poll(onStage).toBeNull()

  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
  await expect.poll(() => location.pathname).toBe(boardPath)
  await expect.poll(onStage).toBe(stored.meta.id)
}, 40_000)

// The board's address is the one the page opened on; this case moves the
// address afterwards, so a memory written only at mount fails here.
test('after a delete the saved boards tab brings back the list, not the deleted board', async () => {
  const screen = await openBoard()
  await userEvent.click(screen.getByRole('button', { name: /delete from disk/i }))
  await userEvent.click(screen.getByRole('button', { name: /really delete/i }))
  await expect.poll(() => location.pathname).toBe('/boards')

  await userEvent.click(screen.getByRole('tab', { name: 'Lab', exact: true }))
  await expect.poll(() => location.pathname).toBe('/')
  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
  await expect.poll(() => location.pathname).toBe('/boards')
}, 40_000)
