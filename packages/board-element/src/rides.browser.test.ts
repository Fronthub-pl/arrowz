// Pins the rule of spec §4.1 (docs/superpowers/specs/2026-09-11-split-gl-layer-design.md):
// cancelling a ride uploads the riders that are left and writes the piece
// back, but never asks for a frame. Merging `uploadRiders` and `schedule`
// into one call would make every cancel draw a frame it does not draw today.
// Every assertion before an `await` runs before any frame, so it holds under
// `prefers-reduced-motion: reduce` too.
import { defaultParams, generate } from '@arrowz/engine'
import type { Board } from '@arrowz/engine'
import { beforeEach, expect, test } from 'vitest'
import { type RideHost, Rides } from './rides.ts'
import { tesselateBoard } from './tesselate.ts'
import { DEFAULT_VIEW } from './view.ts'

const board: Board = generate({ ...defaultParams(), W: 30, H: 30, seed: 7 }).board
const scene = tesselateBoard(board, DEFAULT_VIEW, new Set())
const first = board.pieces[0]
if (!first) throw new Error('the board has no pieces')
const id = first.id

const calls = { uploadRiders: 0, schedule: 0, drop: 0, visible: [] as [number, boolean][] }
function reset(): void {
  calls.uploadRiders = 0
  calls.schedule = 0
  calls.drop = 0
  calls.visible = []
}

const host: RideHost = {
  board: () => board,
  view: () => DEFAULT_VIEW,
  rangesOf: (pid) => scene.rangeOf(pid),
  setStaticVisible: (pid, visible) => void calls.visible.push([pid, visible]),
  riderColor: () => [0, 0, 0, 1],
  uploadRiders: () => void calls.uploadRiders++,
  schedule: () => void calls.schedule++,
  drop: () => void calls.drop++,
}

let rides: Rides
beforeEach(() => {
  rides = new Rides(host)
  reset()
})

test('cancelling a ride uploads the riders and writes the piece back without asking for a frame', async () => {
  const done = rides.shake(id, 1)
  reset()
  rides.cancelAll()
  expect(calls.schedule).toBe(0)
  expect(calls.uploadRiders).toBe(1)
  expect(calls.visible).toContainEqual([id, true])
  // The cancelled ride no longer owns its rider, so its settling asks for no frame either.
  await done
  expect(calls.schedule).toBe(0)
})

test('a superseding ride cancels the one before it without asking for a frame', async () => {
  const before = rides.shake(id, 1)
  reset()
  const after = rides.shake(id, 1)
  // The second ride's first frame is what asks for one, and no frame has run yet.
  expect(calls.schedule).toBe(0)
  rides.cancelAll()
  await Promise.all([before, after])
})
