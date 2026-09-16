import { decodeBoard, defaultParams, encodeBoard, fingerprint, generate, toSvg } from '@arrowz/engine'
import type { WorkerIn, WorkerOut } from '@arrowz/engine'
import { DEFAULT_VIEW, svgOptions } from '@arrowz/engine/command'
import { expect, test } from 'vitest'

// The counterpart of packages/cli/lab-bundle.test.ts, which proves the
// Deno-bundled worker carves the board the engine carves and which PR 8
// deletes with the old lab. This proves it for the engine as Vite transforms
// it; the build-output test is PR 8's prerequisite (Ruling 9).
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
