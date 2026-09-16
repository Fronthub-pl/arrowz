import type { WorkerOut } from '@arrowz/engine'
import { layoutHash } from '@arrowz/engine'
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
  vi.restoreAllMocks()
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

// Spec §5: the name the store gives the same arrows (store.ts `saveBoard`).
test('the board file is the file on screen, under its layout hash', async () => {
  const screen = await mountButtons()
  await act(async () => finish(ONE))
  const button = screen.getByRole('button', { name: 'Download board file' })
  await expect.element(button).toBeEnabled()
  await button.click()
  expect(downloads.names).toEqual([`${await layoutHash(ONE.board)}.board.json`])
  const blob = downloads.blobs[0]
  expect(blob?.type).toBe('application/json')
  expect(await blob?.text()).toBe(JSON.stringify(ONE.file))
})

// The hash is asynchronous and a download has to start in its click, so the
// button waits for the hash; one that lands after its board was replaced is
// dropped. Every digest is held until the case lets it through.
test('the board file waits for the hash of the board on screen, and a replaced board’s hash is not used', async () => {
  // Worked out before any digest is held: the test's own call would be held too, and never let through.
  const TWO = finishedRun(2)
  const THREE = finishedRun(3)
  const FOUR = finishedRun(4)
  const FIVE = finishedRun(5)
  const threeName = `${await layoutHash(THREE.board)}.board.json`
  const fiveName = `${await layoutHash(FIVE.board)}.board.json`
  // A release returns the digest it starts, so the case can await the state it
  // lets through: a release that returned nothing would only flush `act`, and
  // the suppressed write could land after the next assertion had already run.
  const held: (() => Promise<void>)[] = []
  const real = crypto.subtle.digest.bind(crypto.subtle)
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(
    (algorithm, data) =>
      new Promise<ArrayBuffer>((resolve, reject) => {
        held.push(() => real(algorithm, data).then(resolve, reject))
      }),
  )
  const screen = await mountButtons()
  const button = screen.getByRole('button', { name: 'Download board file' })
  await act(async () => finish(ONE))
  await expect.poll(() => held.length).toBe(1)
  await expect.element(button).toBeDisabled()
  await act(async () => {
    await held[0]?.()
  })
  await expect.element(button).toBeEnabled()
  // A new board: the last board's hash must not name it while its own is held.
  await act(async () => finish(TWO))
  await expect.poll(() => held.length).toBe(2)
  await expect.element(button).toBeDisabled()
  // Replaced again before its hash lands: that hash is dropped when it does.
  await act(async () => finish(THREE))
  await expect.poll(() => held.length).toBe(3)
  await act(async () => {
    await held[1]?.()
  })
  await expect.element(button).toBeDisabled()
  await act(async () => {
    await held[2]?.()
  })
  await expect.element(button).toBeEnabled()
  await button.click()
  // The other order, and the one only the effect's cleanup survives: the board
  // on screen answers first, the board it replaced answers after. A late hash
  // written on top would fail the file comparison and leave the button dead
  // until the next run — the window is an Insane board's digest still in
  // flight when a small board replaces it.
  await act(async () => finish(FOUR))
  await expect.poll(() => held.length).toBe(4)
  await act(async () => finish(FIVE))
  await expect.poll(() => held.length).toBe(5)
  await act(async () => {
    await held[4]?.()
  })
  await expect.element(button).toBeEnabled()
  await act(async () => {
    await held[3]?.()
  })
  await expect.element(button).toBeEnabled()
  await button.click()
  expect(downloads.names).toEqual([threeName, fiveName])
})

// Outside a secure context there is no crypto.subtle; the reason is shown under
// its own words, and the SVG export is not touched by it.
test('a board file that cannot be named says why, and the SVG export stays', async () => {
  vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('no secure context'))
  const screen = await mountButtons()
  await act(async () => finish(ONE))
  await expect.element(screen.getByRole('alert')).toHaveTextContent('Cannot name the board file: no secure context')
  await expect.element(screen.getByRole('button', { name: 'Download board file' })).toBeDisabled()
  const svg = screen.getByRole('button', { name: 'Download SVG' })
  await expect.element(svg).toBeEnabled()
  // Spec §5: why the reason is not the result slice's `exportError` — that line
  // is cleared when an SVG export starts, and the board-file button would then
  // stay disabled with nothing on screen saying why.
  await svg.click()
  await expect.poll(() => downloads.names, { timeout: 10_000 }).toEqual(['arrowz-8x8-seed1.svg'])
  await expect.element(screen.getByRole('alert')).toHaveTextContent('Cannot name the board file: no secure context')
})

// The old lab's name (the `download` handler in lab-page.ts), drawn by a real
// throw-away worker.
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
  // A disabled button is drawn at half opacity; measure the one a user clicks.
  await expect.element(screen.getByRole('button', { name: 'Download board file' })).toBeEnabled()
  for (const name of ['Download SVG', 'Download board file']) {
    const { front, back } = shown(screen.getByRole('button', { name }).element())
    expect(contrast(front, back), name).toBeGreaterThanOrEqual(4.5)
  }
})
