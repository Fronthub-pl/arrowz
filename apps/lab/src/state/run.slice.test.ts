import { defaultParams, encodeBoard, generate } from '@arrowz/engine'
import type { BoardMeta } from '@arrowz/engine'
import { beforeEach, expect, test } from 'vitest'
import { useStore } from './store'

const params = { ...defaultParams(), W: 8, H: 8, seed: 1 }
const result = generate(params)
const file = encodeBoard(result.board)
const report = {
  type: 'done' as const,
  ok: result.ok,
  metrics: result.metrics,
  backtracks: result.backtracks,
  restartsUsed: result.restartsUsed,
  genMs: result.genMs,
  metricsMs: result.metricsMs,
  totalMs: result.genMs + result.metricsMs,
  stuck: result.stuck,
  deadlock: result.deadlock,
  pieces: result.board.pieces.length,
  stats: result.board.stats,
  board: file,
}
const run = () => useStore.getState().run
// Built from the fields `BoardMeta` declares in packages/engine/types.ts —
// every field the type requires, filled with plausible values for the 8x8,
// seed 1 board this test generates. `view` follows the `View` interface the
// same way; `stuck` is legitimately `null` per its own type.
const aBoardMeta: BoardMeta = {
  id: 'a1b2c3d4',
  W: 8,
  H: 8,
  seed: 1,
  params,
  view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 1, colored: false, top: 0, rounded: true },
  command: '--width=8 --height=8 --seed=1',
  source: 'test',
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T00:00:00.000Z',
  ok: true,
  pieces: result.board.pieces.length,
  maxLen: 12,
  genMs: result.genMs,
  fingerprint: file.fingerprint,
  boardBytes: file.body.length,
  svg: false,
  restarts: result.restartsUsed,
  backtracks: result.backtracks,
  aborted: result.aborted,
  stuck: result.stuck,
}

beforeEach(() => {
  run().reset()
})

test('a fresh store is idle and holds nothing', () => {
  expect(run().phase).toBe('idle')
  expect(run().board).toBeNull()
  expect(run().params).toBeNull()
})

test('started moves to running and pins the parameters the run uses', () => {
  run().started(params)
  expect(run().phase).toBe('running')
  expect(run().params).toEqual(params)
  expect(run().progress).toBeNull()
})

// The board on screen belongs to the run that made it, not to the knobs: §5.3
// keeps three parameter sets apart, and this is the one that matters here.
test('starting a second run clears the first one board and store outcome', () => {
  run().started(params)
  run().finished({ board: result.board, file, report })
  // Read BoardMeta from packages/engine/types.ts and build a real one; the
  // repository forbids `any`, and a cast here would hide a shape change.
  run().stored({ ok: true, meta: aBoardMeta })
  run().started({ ...params, seed: 2 })
  expect(run().phase).toBe('running')
  expect(run().board).toBeNull()
  expect(run().saved).toBeNull()
})

test('progress is kept while running and dropped when the run ends', () => {
  run().started(params)
  // TraceInfo, as types.ts:40-46 declares it.
  run().progressed({ pieces: 3, remaining: 40, backtracks: 0, ms: 12, total: 64 })
  expect(run().progress?.remaining).toBe(40)
  run().finished({ board: result.board, file, report })
  expect(run().progress).toBeNull()
})

test('finished holds the board, its file and the report', () => {
  run().started(params)
  run().finished({ board: result.board, file, report })
  expect(run().phase).toBe('done')
  expect(run().board).toBe(result.board)
  expect(run().file?.fingerprint).toBe(file.fingerprint)
  expect(run().report?.pieces).toBe(result.board.pieces.length)
})

test('failed carries the message and keeps no board', () => {
  run().started(params)
  run().failed('the envelope refuses these parameters')
  expect(run().phase).toBe('error')
  expect(run().message).toBe('the envelope refuses these parameters')
  expect(run().board).toBeNull()
})

// A store failure must never overwrite a run's outcome: §5.3 says status is
// structured data carrying a source, and this is that rule at slice level.
test('a store failure leaves the run done', () => {
  run().started(params)
  run().finished({ board: result.board, file, report })
  run().stored({ ok: false, error: 'no store server' })
  expect(run().phase).toBe('done')
  expect(run().saved).toEqual({ ok: false, error: 'no store server' })
})

test('aborting a run returns to idle without an error', () => {
  run().started(params)
  run().aborted()
  expect(run().phase).toBe('idle')
  expect(run().message).toBeNull()
})
