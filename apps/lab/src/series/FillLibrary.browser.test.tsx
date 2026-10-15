import type { StoreRequest } from '@fronthub/arrowz-engine'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { loadRunDone, mountApp } from '../harness/mountApp'
import { useStore } from '../state/store'
import '../design/index.css'

// The store is played, so no board leaves the page; every POST is a new layout.
const posted: StoreRequest[] = []

beforeEach(() => {
  posted.length = 0
  vi.stubGlobal('fetch', async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (init?.method !== 'POST') return new Response('[]', { status: 200 })
    posted.push(JSON.parse(typeof init.body === 'string' ? init.body : '{}') as StoreRequest)
    const body = { meta: { id: `sha256-${posted.length}` }, layoutExisted: false, recipeExisted: false }
    return new Response(JSON.stringify(body), { status: 201 })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// 1440 wide: the `…` menu's rows stand in the run column, not in a popover.
test('Save many boards makes the boards asked for in the real worker and saves each once', async () => {
  await page.viewport(1440, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  useStore.getState().params.setMany({ W: 12, H: 12, seed: 3 })
  useStore.getState().fill.setCount(3)
  await userEvent.click(screen.getByRole('button', { name: 'Save many boards' }))
  await expect.poll(() => useStore.getState().fill.phase, { timeout: 30_000 }).toBe('done')
  expect(useStore.getState().fill).toMatchObject({ written: 3, error: null })
  expect(posted).toHaveLength(3)
  expect(new Set(posted.map((r) => r.params.seed)).size).toBe(3)
  expect(posted.every((r) => r.source === 'lab' && r.params.W === 12 && r.board.format === 'arrowz-board')).toBe(true)
}, 40_000)
