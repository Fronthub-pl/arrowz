import type { WorkerOut } from '@arrowz/engine'
import { boardId } from '@arrowz/engine/command'
import { act } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { contrast, shown } from '../design/contrast'
import { finish, finishedRun } from '../state/result.fixtures'
import { useStore } from '../state/store'
import { ExportButtons } from './ExportButtons'
import '../design/tokens.css'
import '../design/shell.css'
import '../design/run.css'

const ONE = finishedRun(1)

/**
 * Every download the page starts: the Blob handed to `createObjectURL` and the
 * name on the anchor that was clicked. The anchor's click is cancelled, so no
 * file is written and no navigation happens (Ruling 8).
 */
function watchDownloads() {
  const blobs: Blob[] = []
  const names: string[] = []
  const created = vi.spyOn(URL, 'createObjectURL').mockImplementation((object) => {
    if (object instanceof Blob) blobs.push(object)
    return 'blob:export-under-test'
  })
  const onClick = (event: MouseEvent) => {
    if (!(event.target instanceof HTMLAnchorElement) || event.target.download === '') return
    names.push(event.target.download)
    event.preventDefault()
  }
  document.addEventListener('click', onClick, true)
  return {
    blobs,
    names,
    stop() {
      created.mockRestore()
      document.removeEventListener('click', onClick, true)
    },
  }
}

let downloads: ReturnType<typeof watchDownloads>

beforeEach(() => {
  const state = useStore.getState()
  state.run.reset()
  state.result.reset()
  state.lang.setLang('en')
  downloads = watchDownloads()
})

afterEach(() => {
  downloads.stop()
  vi.unstubAllGlobals()
})

async function mountButtons() {
  return render(
    <div className="fw">
      <div className="fw-run-col">
        <ExportButtons />
      </div>
    </div>,
  )
}

test('there is nothing to export before there is a board', async () => {
  const screen = await mountButtons()
  await expect.element(screen.getByRole('group', { name: 'Export' })).toBeInTheDocument()
  await expect.element(screen.getByRole('button', { name: 'Download SVG' })).toBeDisabled()
  await expect.element(screen.getByRole('button', { name: 'Download board file' })).toBeDisabled()
})

// Spec §5.2: the same text under the same name the store server writes
// (packages/cli/store.ts:94, :118).
test('the board file is the file on screen, under its board id', async () => {
  const screen = await mountButtons()
  await act(async () => finish(ONE))
  await screen.getByRole('button', { name: 'Download board file' }).click()
  expect(downloads.names).toEqual([`${boardId(ONE.params)}.board.json`])
  const blob = downloads.blobs[0]
  expect(blob?.type).toBe('application/json')
  expect(await blob?.text()).toBe(JSON.stringify(ONE.file))
})

// The old lab's name (lab-page.ts:962), drawn by a real throw-away worker.
test('the SVG is drawn off the page and saved under the board it shows', async () => {
  const screen = await mountButtons()
  await act(async () => finish(ONE))
  const button = screen.getByRole('button', { name: 'Download SVG' })
  await button.click()
  await expect.poll(() => downloads.names, { timeout: 10_000 }).toEqual(['arrowz-8x8-seed1.svg'])
  const blob = downloads.blobs[0]
  expect(blob?.type).toBe('image/svg+xml')
  expect((await blob?.text())?.startsWith('<svg')).toBe(true)
  await expect.element(button).toBeEnabled()
  expect(screen.getByRole('alert').query()).toBeNull()
})

// Beside the buttons, not in the run status (spec §5.2). A stub worker, because
// a real one cannot be made to fail to order.
test('a failed SVG export says so under the buttons, and the button comes back', async () => {
  class FailingWorker {
    onmessage: ((event: MessageEvent<WorkerOut>) => void) | null = null
    onerror: ((event: ErrorEvent) => void) | null = null
    postMessage() {
      const data: WorkerOut = { type: 'error', message: 'the codec refused it' }
      setTimeout(() => this.onmessage?.(new MessageEvent('message', { data })), 0)
    }
    terminate() {}
  }
  vi.stubGlobal('Worker', FailingWorker)
  const screen = await mountButtons()
  await act(async () => finish(ONE))
  const button = screen.getByRole('button', { name: 'Download SVG' })
  await button.click()
  await expect.element(screen.getByRole('alert')).toHaveTextContent('Export failed: the codec refused it')
  await expect.element(button).toBeEnabled()
  expect(downloads.names).toEqual([])
})

// The alert is about the board it failed to export: once another board is on
// screen it would describe a file the buttons no longer export.
test('an export error goes away when the board on screen changes', async () => {
  class FailingWorker {
    onmessage: ((event: MessageEvent<WorkerOut>) => void) | null = null
    onerror: ((event: ErrorEvent) => void) | null = null
    postMessage() {
      const data: WorkerOut = { type: 'error', message: 'the codec refused it' }
      setTimeout(() => this.onmessage?.(new MessageEvent('message', { data })), 0)
    }
    terminate() {}
  }
  vi.stubGlobal('Worker', FailingWorker)
  const screen = await mountButtons()
  await act(async () => finish(ONE))
  await screen.getByRole('button', { name: 'Download SVG' }).click()
  await expect.element(screen.getByRole('alert')).toHaveTextContent('Export failed: the codec refused it')
  await act(async () => finish(finishedRun(2)))
  await expect.poll(() => screen.getByRole('alert').query()).toBeNull()
})

// The other order: the board is replaced while its SVG is still being drawn,
// and the failure lands on a board that never failed. The worker answers only
// when the case says so.
test('an export that fails after its board was replaced says nothing', async () => {
  class HeldWorker {
    onmessage: ((event: MessageEvent<WorkerOut>) => void) | null = null
    onerror: ((event: ErrorEvent) => void) | null = null
    postMessage() {
      drawn.push(this)
    }
    terminate() {}
  }
  const drawn: HeldWorker[] = []
  vi.stubGlobal('Worker', HeldWorker)
  const screen = await mountButtons()
  await act(async () => finish(ONE))
  const button = screen.getByRole('button', { name: 'Download SVG' })
  await button.click()
  await act(async () => finish(finishedRun(2)))
  const data: WorkerOut = { type: 'error', message: 'the codec refused it' }
  await act(async () => drawn[0]?.onmessage?.(new MessageEvent('message', { data })))
  expect(drawn).toHaveLength(1)
  expect(screen.getByRole('alert').query()).toBeNull()
  await expect.element(button).toBeEnabled()
})

// §7.1, PR 4b: the mock's ghost buttons, `--ash` on `--graphite`.
test('the export buttons read at AA', async () => {
  const screen = await mountButtons()
  await act(async () => finish(ONE))
  for (const name of ['Download SVG', 'Download board file']) {
    const { front, back } = shown(screen.getByRole('button', { name }).element())
    expect(contrast(front, back), name).toBeGreaterThanOrEqual(4.5)
  }
})
