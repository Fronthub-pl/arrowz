// Nightmare 100×100 (~1 900 pieces) must build and pan within a loose
// budget; the times are printed so a regression is visible in the log
// before it breaks the assertion. Insane (1000×1000) is the same measurement
// without any budget: it is a report, run on demand with ARROWZ_MEASURE=1.
import { defaultParams, generate } from '@arrowz/engine'
import type { Board } from '@arrowz/engine'
import { expect, test } from 'vitest'
import './mod.ts'
import type { ArrowzBoard } from './mod.ts'

declare global {
  interface ImportMeta {
    readonly env: Readonly<Record<string, string | undefined>>
  }
}

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

/** Mean and worst of a run of frame times; no spread, the arrays are long. */
function summary(frames: readonly number[]): { mean: number; worst: number } {
  let sum = 0
  let worst = 0
  for (const f of frames) {
    sum += f
    if (f > worst) worst = f
  }
  return { mean: sum / frames.length, worst }
}

function svgOf(el: ArrowzBoard): SVGSVGElement {
  const svg = el.shadowRoot?.querySelector('svg')
  if (!svg) throw new Error('no svg')
  return svg
}

/** A modifier drag over the svg: `count` frames, reporting the time of each. */
async function pan(svg: SVGSVGElement, count: number): Promise<number[]> {
  const r = svg.getBoundingClientRect()
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
  svg.dispatchEvent(ev('pointerdown', r.width / 2, r.height / 2))
  for (let i = 1; i <= count; i++) {
    const t = performance.now()
    svg.dispatchEvent(ev('pointermove', r.width / 2 - i * 3, r.height / 2 - i * 2))
    await raf()
    frames.push(performance.now() - t)
  }
  svg.dispatchEvent(ev('pointerup', r.width / 2 - count * 3, r.height / 2 - count * 2))
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
  const frames = await pan(svgOf(el), 20)
  const { mean, worst } = summary(frames)
  console.log(
    `nightmare: pieces=${board.pieces.length} build=${build.toFixed(1)}ms ` +
      `pan mean=${mean.toFixed(1)}ms worst=${worst.toFixed(1)}ms`,
  )
  expect(build).toBeLessThan(5000)
  expect(frames.length).toBe(20)
  el.remove()
})

// The project ceiling, measured rather than guarded: generation alone takes
// tens of seconds, so this runs only when asked for by
// `ARROWZ_MEASURE=1 pnpm vitest run --project chromium perf`.
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
  const nodes = el.shadowRoot?.querySelectorAll('svg *').length ?? 0
  const pieceCount = el.shadowRoot?.querySelectorAll('g.heads > g[data-id]').length ?? 0
  el.zoomBy(3)
  await raf()
  const panStats = summary(await pan(svgOf(el), 60))
  const zoomStats = summary(await zoom(el, 60))
  console.log(
    `insane: pieces=${board.pieces.length} nodes=${nodes} gen=${genMs.toFixed(0)}ms ` +
      `build=${build.toFixed(1)}ms pan mean=${panStats.mean.toFixed(1)}ms worst=${panStats.worst.toFixed(1)}ms ` +
      `zoom mean=${zoomStats.mean.toFixed(1)}ms worst=${zoomStats.worst.toFixed(1)}ms`,
  )
  expect(pieceCount).toBe(board.pieces.length)
  el.remove()
}, 180_000)
