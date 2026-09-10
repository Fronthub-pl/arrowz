// Nightmare 100×100 (915 pieces at seed 7) builds under a budget and pans
// 20 frames in every `verify` run; the build time and the frame count are
// asserted there because both survive CPU contention, and pan mean, worst
// and median are printed there too, but not asserted — see the paragraph
// above NIGHTMARE_PAN_MS for why a wall-clock frame budget cannot live in
// that run. The pan budget itself, and the Insane (1000×1000) report, both
// live behind ARROWZ_MEASURE=1: a run the developer starts deliberately, on
// a machine that is not simultaneously building three packages.
//
// How to read the frame numbers: a frame is timed around the dispatch plus one
// `await raf()`, so it reports max(work, frame interval) — on a 60 Hz display
// anything cheaper than ~16.7 ms prints as ~16.7 ms. Only figures well above
// that measure the element's work; at or near 16.7 ms the frame had room to
// spare and the number is the wait, not the cost.
import { defaultParams, generate, newSession, play } from '@arrowz/engine'
import type { Board } from '@arrowz/engine'
import { expect, test } from 'vitest'
import './mod.ts'
import { MIN_POINT_CELL_PX } from './mod.ts'
import type { ArrowzBoard } from './mod.ts'

declare global {
  interface ImportMeta {
    readonly env: Readonly<Record<string, string | undefined>>
  }
}

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

/** The middle value of a sorted copy of `values`; 0 for an empty input,
 * which never happens here but keeps the function total without a
 * non-null assertion. */
function median(values: readonly number[]): number {
  const sorted = values.slice().sort((a, b) => a - b)
  const n = sorted.length
  if (n === 0) return 0
  const mid = Math.floor(n / 2)
  if (n % 2 === 1) return sorted[mid] ?? 0
  const lo = sorted[mid - 1]
  const hi = sorted[mid]
  return lo === undefined || hi === undefined ? 0 : (lo + hi) / 2
}

/** Mean, worst and median of a run of frame times; no spread, the arrays are
 * long — the median sorts a copy instead. */
function summary(frames: readonly number[]): { mean: number; worst: number; median: number } {
  let sum = 0
  let worst = 0
  for (const f of frames) {
    sum += f
    if (f > worst) worst = f
  }
  return { mean: sum / frames.length, worst, median: median(frames) }
}

function canvasOf(el: ArrowzBoard): HTMLCanvasElement {
  const canvas = el.shadowRoot?.querySelector('canvas')
  if (!canvas) throw new Error('no canvas')
  return canvas
}

/** A modifier drag over the canvas: `count` frames, reporting the time of each. */
async function pan(canvas: HTMLCanvasElement, count: number): Promise<number[]> {
  const r = canvas.getBoundingClientRect()
  const ev = (type: string, x: number, y: number) =>
    new PointerEvent(type, {
      bubbles: true,
      pointerId: 1,
      pointerType: 'mouse',
      clientX: r.left + x,
      clientY: r.top + y,
      ctrlKey: true,
    })
  const frames: number[] = []
  canvas.dispatchEvent(ev('pointerdown', r.width / 2, r.height / 2))
  for (let i = 1; i <= count; i++) {
    const t = performance.now()
    canvas.dispatchEvent(ev('pointermove', r.width / 2 - i * 3, r.height / 2 - i * 2))
    await raf()
    frames.push(performance.now() - t)
  }
  canvas.dispatchEvent(ev('pointerup', r.width / 2 - count * 3, r.height / 2 - count * 2))
  return frames
}

/** `count` frames of small zoom steps around the current centre. */
async function zoom(el: ArrowzBoard, count: number): Promise<number[]> {
  const frames: number[] = []
  for (let i = 0; i < count; i++) {
    const t = performance.now()
    el.zoomBy(i % 2 === 0 ? 1.03 : 1 / 1.03)
    await raf()
    frames.push(performance.now() - t)
  }
  return frames
}

/** A mounted, sized element; two frames so the ResizeObserver has delivered. */
async function mount(size: string): Promise<ArrowzBoard> {
  const el = document.createElement('arrowz-board')
  el.style.width = size
  el.style.height = size
  document.body.append(el)
  await el.updateComplete
  await raf()
  await raf()
  return el
}

test('Nightmare builds under 5 s and pans 20 frames', async () => {
  const board = generate({ ...defaultParams(), W: 100, H: 100, seed: 7 }).board
  const el = await mount('800px')
  const t0 = performance.now()
  el.board = board
  await el.updateComplete
  await raf()
  const build = performance.now() - t0
  el.zoomBy(3)
  await raf()
  const frames = await pan(canvasOf(el), 20)
  const { mean, worst, median: med } = summary(frames)
  console.log(
    `nightmare: pieces=${board.pieces.length} build=${build.toFixed(1)}ms ` +
      `pan mean=${mean.toFixed(1)}ms worst=${worst.toFixed(1)}ms median=${med.toFixed(1)}ms`,
  )
  expect(build).toBeLessThan(5000)
  expect(frames.length).toBe(20)
  el.remove()
  // The timeout has to clear the budget it guards: generation, the mount and
  // 20 frames all share it, so the default 5 000 ms would abort the test
  // before a build near 5 000 ms could ever fail the assertion.
}, 30_000)

// A CPU-bound task runner distorts wall-clock frame timing for the same
// underlying reason a GPU-less CI runner distorts this layer's rendering:
// both put more work on the CPU than the number was ever built to measure.
// `nx run-many -t verify` builds two packages and runs the engine's tests on
// the same cores as this suite's pan, and measured directly — five
// `verify` runs back to back, on a machine also holding
// Chrome tabs open on previous Insane boards, load average 22.5 on 8 cores —
// gave median pan times of 77.5, 92.4, 118.6, 109.8 and 336.8 ms, worst up to
// 1 206.5 ms: a fourfold spread on identical code, all five over budget. The
// build time in those same runs, 16-56 ms throughout, shows the element was
// never the problem; only the frames stalled, because the CPU was
// oversubscribed roughly twofold. No threshold value fixes that, because the
// number is measuring the machine rather than the renderer — a median
// survives a few stalled frames, not a run where most of them stall
// together. So this assertion lives here, behind ARROWZ_MEASURE=1, the same
// flag that already gates the Insane report below, for the matching reason:
// a CI runner without a GPU rasterises this layer's two million-plus
// triangles on the CPU instead, at a cost that has nothing to do with the
// code either. The default `verify` run above keeps only what survives
// contention — the build time and the frame count — and keeps printing
// mean, worst and median so a reader still sees them; those figures in a
// `verify` log are not a measurement of the code, only of whatever else was
// competing for the CPU that run.
//
// Measured alone, nothing else running (Playwright's headless shell,
// devicePixelRatio 1), across two separate runs: pan mean 19.2-27.6 ms —
// run-to-run noise on a shared but otherwise idle machine, not a trend.
// 50 ms is not derived from that figure; it is the spec's own original
// acceptance criterion, so the gate guards the number the project actually
// chose rather than one invented to accommodate noise.
const NIGHTMARE_PAN_MS = 50

test.skipIf(import.meta.env.ARROWZ_MEASURE !== '1')(
  'measures Nightmare pans under the budget when ARROWZ_MEASURE=1',
  async () => {
    const board = generate({ ...defaultParams(), W: 100, H: 100, seed: 7 }).board
    const el = await mount('800px')
    const t0 = performance.now()
    el.board = board
    await el.updateComplete
    await raf()
    const build = performance.now() - t0
    el.zoomBy(3)
    await raf()
    const frames = await pan(canvasOf(el), 20)
    const { mean, worst, median: med } = summary(frames)
    console.log(
      `nightmare (gated): pieces=${board.pieces.length} build=${build.toFixed(1)}ms ` +
        `pan mean=${mean.toFixed(1)}ms worst=${worst.toFixed(1)}ms median=${med.toFixed(1)}ms`,
    )
    expect(med).toBeLessThan(NIGHTMARE_PAN_MS)
    el.remove()
  },
  30_000,
)

// The project ceiling, measured rather than guarded: generation alone takes
// tens of seconds, so this runs only when asked for by
// `ARROWZ_MEASURE=1 pnpm vitest run --project chromium perf`.
//
// Measured here (headless shell, dpr 1): pan mean 789.6 ms, worst 1030.9 ms;
// zoom mean 807.5 ms, worst 1051.2 ms — nowhere near the spec's 50 ms
// acceptance criterion, so this stays a report rather than an assertion.
// Nightmare above pans at ~19-28 ms in its own, separate `vitest`
// invocation; the disproportionate slowdown here, growing with piece (and
// so vertex) count rather than staying flat with screen pixels, is the
// signature of a software rasteriser standing in for a real GPU, which is
// what this headless environment gives WebGL2.
//
// This is now confirmed, not merely inferred: the same board and the same
// scripted movement, in a foreground Chrome 152 on an Apple M1,
// devicePixelRatio 1, host about 1200×1200, build in 338 ms and pan at
// 34.0 ms mean (worst 73.5 ms), zoom at 33.3 ms mean (worst 34.9 ms) — under
// the 50 ms criterion with room to spare. The SVG layer this branch
// replaced, same board and movement, foreground Chrome, recorded before
// this branch began: build 2 761 ms, pan mean 1 050.5 ms, worst 1 289.1 ms —
// this layer is about 31× faster to pan and 8× faster to build. No CI
// runner without a GPU can measure this layer's real cost, because it
// rasterises upward of two million triangles on the CPU instead of the GPU;
// the 789.6 ms below stays useful only as a relative regression signal
// against itself, never as a stand-in for the acceptance criterion.
test.skipIf(import.meta.env.ARROWZ_MEASURE !== '1')('measures Insane when ARROWZ_MEASURE=1', async () => {
  const g0 = performance.now()
  const board: Board = generate({ ...defaultParams(), W: 1000, H: 1000, seed: 7 }).board
  const genMs = performance.now() - g0
  const el = await mount('800px')
  const t0 = performance.now()
  el.board = board
  await el.updateComplete
  await raf()
  const build = performance.now() - t0
  // The node count this line used to print was the SVG tree's, and there is
  // no tree any more: the board is one canvas whatever its size. What the
  // figure was watched for — that the board really did build every piece —
  // is now the layer's own count of them, printed and asserted below.
  const pieceCount = el.pieceCount
  el.zoomBy(3)
  await raf()
  const panStats = summary(await pan(canvasOf(el), 60))
  const zoomStats = summary(await zoom(el, 60))
  console.log(
    `insane: pieces=${board.pieces.length} drawn=${pieceCount} gen=${genMs.toFixed(0)}ms ` +
      `build=${build.toFixed(1)}ms pan mean=${panStats.mean.toFixed(1)}ms worst=${panStats.worst.toFixed(1)}ms ` +
      `median=${panStats.median.toFixed(1)}ms zoom mean=${zoomStats.mean.toFixed(1)}ms ` +
      `worst=${zoomStats.worst.toFixed(1)}ms median=${zoomStats.median.toFixed(1)}ms`,
  )
  expect(pieceCount).toBe(board.pieces.length)
  el.remove()
}, 180_000)

// Same board, with and without the point grid, both measured at the same
// zoom: at Insane's fitted scale cellPx is well under MIN_POINT_CELL_PX, so
// the element vetoes the grid until it is zoomed in. The factor is computed
// from the fitted cellPx rather than guessed, so a later change to the fit
// maths or the threshold can't silently turn this back into measuring
// nothing; both runs zoom by that same factor, so the comparison is the
// grid's cost, not the zoom's.
async function runInsane(
  board: Board,
  showPoints: boolean,
): Promise<{ build: number; drawn: number; panStats: { mean: number; worst: number; median: number } }> {
  const el = await mount('800px')
  el.showPoints = showPoints
  const t0 = performance.now()
  el.board = board
  await el.updateComplete
  await raf()
  const build = performance.now() - t0
  const fittedCellPx = el.viewport?.cellPx
  if (!fittedCellPx) throw new Error('need a fitted viewport')
  const factor = (MIN_POINT_CELL_PX / fittedCellPx) * 1.25
  el.zoomBy(factor)
  await raf()
  const vp = el.viewport
  if (!vp || vp.cellPx < MIN_POINT_CELL_PX) {
    throw new Error(`grid threshold not crossed: cellPx=${vp?.cellPx ?? 'null'}`)
  }
  const drawn = el.pieceCount
  const panStats = summary(await pan(canvasOf(el), 60))
  el.remove()
  return { build, drawn, panStats }
}

test.skipIf(import.meta.env.ARROWZ_MEASURE !== '1')(
  'measures Insane with and without the point grid, at the same zoom',
  async () => {
    const board: Board = generate({ ...defaultParams(), W: 1000, H: 1000, seed: 7 }).board
    const off = await runInsane(board, false)
    const on = await runInsane(board, true)
    console.log(
      `insane grid off: pieces=${board.pieces.length} drawn=${off.drawn} build=${off.build.toFixed(1)}ms ` +
        `pan mean=${off.panStats.mean.toFixed(1)}ms worst=${off.panStats.worst.toFixed(1)}ms ` +
        `median=${off.panStats.median.toFixed(1)}ms`,
    )
    console.log(
      `insane grid on:  pieces=${board.pieces.length} drawn=${on.drawn} build=${on.build.toFixed(1)}ms ` +
        `pan mean=${on.panStats.mean.toFixed(1)}ms worst=${on.panStats.worst.toFixed(1)}ms ` +
        `median=${on.panStats.median.toFixed(1)}ms`,
    )
    // The grid used to cost exactly one SVG node, and that was the assertion
    // here. On the GPU it costs one quad and one shader over the whole board,
    // so there is nothing left to count: the two pan figures above are the
    // measurement, and what is asserted is only that the grid changed nothing
    // about the board underneath it — the same pieces are drawn either way.
    expect(on.drawn).toBe(off.drawn)
    expect(on.drawn).toBe(board.pieces.length)
  },
  180_000,
)

test.skipIf(import.meta.env.ARROWZ_MEASURE !== '1')(
  'measures a verdict and a coloured removal on Insane',
  async () => {
    const board: Board = generate({ ...defaultParams(), W: 1000, H: 1000, seed: 7 }).board

    // The verdict alone: the reducer's ray scan, with no animation, no event
    // dispatch and no host bookkeeping in the way. Printed, not asserted — the
    // file's header already says the Insane case is a report, not a gate.
    // `play` never mutates its session, so calling it on the same piece over
    // and over walks the ray in full every time rather than short-circuiting
    // on a piece already gone; a single call is too close to
    // `performance.now()`'s own resolution to say anything, so the printed
    // figure is a mean over many calls instead.
    const session = newSession(board)
    const worst = board.pieces.reduce((a, b) => (a.cells.length >= b.cells.length ? a : b))
    // One warm call on a different piece, discarded, so the loop below is not
    // also paying for the module's cold JIT.
    const warm = board.pieces.find((p) => p.id !== worst.id) ?? worst
    play(session, warm.id)
    const calls = 5000
    const t0 = performance.now()
    for (let i = 0; i < calls; i++) play(session, worst.id)
    const verdictMs = (performance.now() - t0) / calls
    console.log(
      `insane verdict: piece=${worst.id} cells=${worst.cells.length} mean of ${calls} calls ${verdictMs.toFixed(4)}ms`,
    )

    // A removal in coloured mode must cost one piece, not the board. It used
    // to be asserted as the survivor's nodes surviving; the buffer's answer to
    // the same question is the count, which falls by exactly one — a rebuild
    // of the whole board would have re-tesselated it against the session and
    // taken the ridden piece out of the total a second time.
    const el = await mount('800px')
    el.enableColors = true
    el.view = { colored: true }
    el.board = board
    await el.updateComplete
    await raf()
    const leaving = board.pieces[0]
    expect(leaving).toBeTruthy()
    if (!leaving) return
    expect(el.pieceCount).toBe(board.pieces.length)
    const t1 = performance.now()
    await el.animateExit(leaving.id, leaving.dir)
    console.log(`insane coloured removal: piece=${leaving.id} ${(performance.now() - t1).toFixed(1)}ms of ride`)
    expect(el.pieceCount).toBe(board.pieces.length - 1)
    el.remove()
  },
  180_000,
)
