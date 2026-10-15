import { decodeBoard, defaultParams, encodeBoard, fingerprint, generate, toSvg } from '@fronthub/arrowz-engine'
import type { WorkerIn, WorkerOut } from '@fronthub/arrowz-engine'
import { DEFAULT_VIEW, svgOptions } from '@fronthub/arrowz-engine/command'
import { expect, test } from 'vitest'

// The same protocol over the engine as Vitest transforms it, which the app's
// tests run against; `scripts/worker-smoke.mjs` covers the built worker.
function ask(message: WorkerIn): Promise<WorkerOut> {
  const worker = new Worker(new URL('./generate.worker.ts', import.meta.url), { type: 'module' })
  const answer = new Promise<WorkerOut>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerOut>) => {
      // Progress messages precede the answer; only the answer resolves.
      if (event.data.type !== 'progress') resolve(event.data)
    }
    worker.onerror = (event) => reject(new Error(event.message))
  })
  worker.postMessage(message)
  return answer.finally(() => worker.terminate())
}

test('the worker carves the board the engine carves', async () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 7 }
  const answer = await ask({ type: 'generate', params })
  expect(answer.type).toBe('done')
  if (answer.type !== 'done') return

  const mine = generate(params)
  expect(fingerprint(decodeBoard(answer.board))).toBe(fingerprint(mine.board))
  // The file carries its own fingerprint; if the two agree, the record that
  // reaches the store is the board that was drawn.
  expect(answer.board.fingerprint).toBe(fingerprint(mine.board))
  expect(answer.pieces).toBe(mine.board.pieces.length)
}, 30_000)

test('the worker draws the SVG the engine draws', async () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 7 }
  const mine = generate(params)
  const options = svgOptions(DEFAULT_VIEW)
  const answer = await ask({ type: 'svg', board: encodeBoard(mine.board), options })
  expect(answer.type).toBe('svg')
  if (answer.type !== 'svg') return
  expect(answer.svg).toBe(toSvg(mine.board, options))
}, 30_000)

test('one seed of a batch hands back the engine’s board file', async () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 11 }
  const answer = await ask({ type: 'fill', params })
  expect(answer.type).toBe('fillDone')
  if (answer.type !== 'fillDone') return
  const mine = generate(params)
  expect(mine.ok).toBe(true)
  expect(answer.run.outcome).toBe('complete')
  expect(answer.board?.fingerprint).toBe(fingerprint(mine.board))
  expect(answer.board === null ? null : fingerprint(decodeBoard(answer.board))).toBe(fingerprint(mine.board))
  expect([answer.restarts, answer.backtracks]).toEqual([mine.restartsUsed, mine.backtracks])
}, 30_000)

// 400×400 because the first trace comes no sooner than 250 ms in, so a flag
// raised before the start stops the seed there rather than after it completes.
test('a seed of a batch stopped by the flag hands back no board', async () => {
  const stop = new Int32Array(new SharedArrayBuffer(4))
  Atomics.store(stop, 0, 1)
  const answer = await ask({ type: 'fill', params: { ...defaultParams(), W: 400, H: 400, seed: 7 }, stop })
  expect(answer.type).toBe('fillDone')
  if (answer.type !== 'fillDone') return
  expect(answer.run.outcome).toBe('stopped')
  expect(answer.board).toBeNull()
}, 30_000)
