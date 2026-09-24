// Nightmare 100×100 (seed 7) builds under a budget and pans 20 frames in
// every `verify` run. Only the build time and the frame count are asserted
// there, because both survive CPU contention (see NIGHTMARE_PAN_MS). The pan
// budget and the Insane (1000×1000) report run only under ARROWZ_MEASURE=1.
//
// A frame is timed around the dispatch plus one `await raf()`, so it reads
// max(work, frame interval): ~16.7 ms at 60 Hz means idle, not cost.
//
// Headless figures are a floor and a regression detector, never what a person
// sees: only a foreground browser with a GPU rasterises and composites onto a
// display, and a CI runner without a GPU rasterises WebGL2 on the CPU. The SVG
// layer's Insane pan (seed 7, M1): 83 ms a frame in the headless shell, 104 ms
// in the real engine headless at dpr 2, 1050 ms in a foreground Chrome.
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

/** A plain drag over the canvas: `count` frames, reporting the time of each. */
async function pan(canvas: HTMLCanvasElement, count: number): Promise<number[]> {
  const r = canvas.getBoundingClientRect()
  const ev = (type: string, x: number, y: number) =>
    new PointerEvent(type, {
      bubbles: true,
      pointerId: 1,
      pointerType: 'mouse',
      clientX: r.left + x,
      clientY: r.top + y,
      buttons: 1,
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
  localStorage.removeItem('arrowz-board.gestures')
  const el = document.createElement('arrowz-board')
  el.style.width = size
  el.style.height = size
  document.body.append(el)
  await el.updateComplete
  await raf()
  await raf()
  return el
}

test('Nightmare builds under 5 s and pans within the budget', async () => {
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

// The project's pan criterion; an idle machine pans at 19-28 ms. Not asserted
// under `verify`: it shares the cores with the other packages' builds, and
// there the median swung fourfold on identical code while the build time held,
// so the number measured the machine, not the renderer.
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

// The project ceiling, reported rather than guarded: generation alone takes
// tens of seconds. Run it with `ARROWZ_MEASURE=1 pnpm vitest run --project
// chromium perf`. In a foreground Chrome with a GPU (M1) Insane builds in
// ~340 ms and pans at ~34 ms mean, under the 50 ms criterion; headless on a
// host with a GPU it sits at the rAF floor, and without one it is far slower.
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
  // The layer's own piece count: proof that the board built every piece.
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

// At Insane's fitted scale cellPx is under MIN_POINT_CELL_PX, so the grid is
// vetoed until zoomed in. The factor is computed from the fitted cellPx, so a
// change to the fit or the threshold cannot silently measure nothing; both
// runs zoom by it, so the comparison is the grid's cost, not the zoom's.
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
    // The grid is one quad and one shader, so the pan figures are the
    // measurement; asserted is only that the same pieces are drawn either way.
    expect(on.drawn).toBe(off.drawn)
    expect(on.drawn).toBe(board.pieces.length)
  },
  180_000,
)

test.skipIf(import.meta.env.ARROWZ_MEASURE !== '1')(
  'measures a verdict and a coloured removal on Insane',
  async () => {
    const board: Board = generate({ ...defaultParams(), W: 1000, H: 1000, seed: 7 }).board

    // The reducer's ray scan alone, printed, not asserted. `play` never mutates
    // its session, so every call walks the ray in full; one call is below
    // `performance.now()`'s resolution, so this prints a mean over many.
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

    // A removal in coloured mode must cost one piece, not the board: the count
    // falls by exactly one, where a full rebuild against the session would
    // take the ridden piece out a second time.
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
