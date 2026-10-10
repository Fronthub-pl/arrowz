import { dictionary } from '@fronthub/arrowz-engine/i18n'
import { act } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { loadRunDone, mountApp } from '../harness/mountApp'
import { finishedRun } from '../state/result.fixtures'
import { useStore } from '../state/store'
import '../design/index.css'

const EN = dictionary('en')
const PROGRESS = { pieces: 52, remaining: 734, backtracks: 18, ms: 1400, total: 1250 }

// The saved boards list fetches on mount; a reply landing mid-case would rewrite the stage.
beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
})
afterEach(() => {
  vi.restoreAllMocks()
})

const veil = (container: HTMLElement) => container.querySelector<HTMLElement>('.fw-board > .fw-veil')
const stageBusy = (container: HTMLElement) => container.querySelector('.fw-stage')?.getAttribute('aria-busy')

async function carving(): Promise<void> {
  await act(async () => {
    useStore.getState().run.started(useStore.getState().params.values)
    useStore.getState().run.progressed(PROGRESS)
  })
}

test("a carve in flight veils the board with Generate's label and its share", async () => {
  await page.viewport(1440, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  expect(veil(screen.container)).toBeNull()
  await act(async () => useStore.getState().run.started(useStore.getState().params.values))
  expect(veil(screen.container)?.textContent).toBe(EN.t('generating'))
  await act(async () => useStore.getState().run.progressed(PROGRESS))
  const shown = veil(screen.container)
  expect(shown?.textContent).toBe(EN.t('generatingPct', '41.3'))
  expect(shown?.getAttribute('aria-hidden')).toBe('true')
  expect(shown?.style.getPropertyValue('--p')).toBe('41.3%')
  await expect.element(screen.getByRole('button', { name: EN.t('generatingPct', '41.3') })).toBeDisabled()
  await act(async () => useStore.getState().run.stopRequested())
  expect(veil(screen.container)?.textContent).toBe(EN.t('stopping'))
}, 40_000)

test.each([
  ['done', () => useStore.getState().completeRun(finishedRun(1))],
  ['error', () => useStore.getState().run.failed('boom')],
  ['stop', () => useStore.getState().run.aborted()],
] as const)(
  'the veil clears when the carve ends: %s',
  async (_end, end) => {
    await page.viewport(1440, 900)
    const screen = await mountApp('advanced')
    await loadRunDone()
    await carving()
    expect(veil(screen.container)).not.toBeNull()
    await act(async () => end())
    expect(veil(screen.container)).toBeNull()
  },
  40_000,
)

test('a seed series veils the board with its count, and the stage is busy', async () => {
  await page.viewport(1440, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  expect(stageBusy(screen.container)).toBeNull()
  const state = useStore.getState()
  await act(async () => state.series.started(state.params.values, 20))
  expect(veil(screen.container)?.textContent).toBe(EN.t('seriesStatus', 0, 20))
  expect(veil(screen.container)?.style.getPropertyValue('--p')).toBe('0%')
  expect(stageBusy(screen.container)).toBe('true')
  await act(async () =>
    state.series.answered({ seed: 7, outcome: 'complete', pieces: 1, maxLen: 1, genMs: 1, remaining: 0 }),
  )
  expect(veil(screen.container)?.style.getPropertyValue('--p')).toBe('5%')
  await act(async () => state.series.stopRequested())
  expect(veil(screen.container)?.textContent).toBe(EN.t('seriesStopping'))
  await act(async () => state.series.finished())
  expect(veil(screen.container)).toBeNull()
  expect(stageBusy(screen.container)).toBeNull()
}, 40_000)

test('the saved boards tab shows no veil while the lab carves', async () => {
  await page.viewport(1440, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await carving()
  await screen.getByRole('tab', { name: EN.t('tabLibrary') }).click()
  // The address changes before the route commits (a transition), so wait for the committed library face.
  await expect.poll(() => screen.container.querySelector('.fw-lab.library')).not.toBeNull()
  expect(veil(screen.container)).toBeNull()
}, 40_000)

// Fades in after 300ms so a carve that `auto` finishes in milliseconds never flashes,
// and lets the pointer through so the board still pans under it.
test('the veil waits 300ms before it shows and lets the pointer through', async () => {
  await page.viewport(1440, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await carving()
  const style = getComputedStyle(veil(screen.container) ?? document.body)
  expect(style.animationDelay).toBe('0.3s')
  expect(style.pointerEvents).toBe('none')
  expect(style.position).toBe('absolute')
}, 40_000)
