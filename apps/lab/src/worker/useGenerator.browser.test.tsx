import { defaultParams } from '@arrowz/engine'
import { useEffect } from 'react'
import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { useGenerator, type Generator } from './useGenerator'

function Harness({ drive }: { drive: (g: Generator) => void | (() => void) }) {
  const generator = useGenerator()
  useEffect(() => drive(generator), [generator, drive])
  return null
}

const start = (params: Parameters<Generator['start']>[0]) => (g: Generator) => g.start(params)

test('a run carves a board and lands in done', async () => {
  useStore.getState().run.reset()
  await render(<Harness drive={start({ ...defaultParams(), W: 16, H: 16, seed: 5 })} />)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 20_000 }).toBe('done')
  const { run } = useStore.getState()
  expect(run.board?.W).toBe(16)
  // BoardFile is an object (types.ts:151); its fingerprint is the board's.
  expect(run.file?.format).toBe('arrowz-board')
  expect(run.report?.pieces).toBe(run.board?.pieces.length)
})

// The worker throws InvalidParamsError for parameters outside the envelope
// (pStraight's floor is 0.6, engine.ts:2452), and the page must show that
// message rather than hang in `running`.
test('parameters outside the envelope end in error with the engine message', async () => {
  useStore.getState().run.reset()
  await render(<Harness drive={start({ ...defaultParams(), W: 12, H: 12, pStraight: 0 })} />)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 20_000 }).toBe('error')
  expect(useStore.getState().run.message ?? '').not.toBe('')
})

// Abort must terminate the worker, not merely relabel the slice: a live worker
// would deliver `done` afterwards and drag the run back out of idle. The wait
// is longer than the board takes, so a missing terminate() shows up.
test('abort terminates the worker, and nothing arrives afterwards', async () => {
  useStore.getState().run.reset()
  const terminate = vi.spyOn(Worker.prototype, 'terminate')
  await render(
    <Harness
      drive={(g) => {
        g.start({ ...defaultParams(), W: 200, H: 200, seed: 9 })
        const id = setTimeout(() => g.abort(), 30)
        return () => clearTimeout(id)
      }}
    />,
  )
  await expect.poll(() => useStore.getState().run.phase, { timeout: 20_000 }).toBe('idle')
  expect(terminate).toHaveBeenCalled()
  await new Promise((done) => setTimeout(done, 2_000))
  expect(useStore.getState().run.phase).toBe('idle')
  expect(useStore.getState().run.board).toBeNull()
  terminate.mockRestore()
})

// Progress is what the status line lives on during a long carve. 600×600 and
// not 200×200: the engine traces no sooner than 250 ms into a carve
// (engine.ts:1869), and in Chromium 200×200 finishes in 228 ms and emits
// nothing at all. Measured here: 200 → 0 updates, 300 → 1, 400 → 2,
// 600 → 8 in 2.5 s. Only the last leaves a window a poll cannot miss.
test('a large run reports progress before it finishes', async () => {
  useStore.getState().run.reset()
  await render(<Harness drive={start({ ...defaultParams(), W: 600, H: 600, seed: 11 })} />)
  await expect.poll(() => useStore.getState().run.progress !== null, { timeout: 20_000 }).toBe(true)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  expect(useStore.getState().run.progress).toBeNull()
}, 40_000)
