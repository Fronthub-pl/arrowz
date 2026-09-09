// The demo: a preset picker, generation in a worker, the element with the
// two effects wired to clicks, and the measurements of the spec (§11):
// build time, node count, pan and zoom frame times.
import { PRESETS } from '@arrowz/engine/presets'
import '../src/mod.ts'
import type { ArrowzBoard, PieceClickEvent } from '../src/mod.ts'
import type { DemoRequest, DemoResponse } from './worker.ts'

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing #${id}`)
  return el as T
}

const board = $<ArrowzBoard>('board')
const stats = $<HTMLSpanElement>('stats')
const preset = $<HTMLSelectElement>('preset')
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

for (const level of PRESETS) {
  const group = document.createElement('optgroup')
  group.label = level.id
  for (const opt of level.options) {
    const o = document.createElement('option')
    o.value = opt.id
    o.textContent = `${opt.id} (${opt.params.W}×${opt.params.H})`
    group.append(o)
  }
  preset.append(group)
}
preset.value = 'nightmare-square'

function say(text: string): void {
  stats.textContent = text
}

$<HTMLButtonElement>('generate').addEventListener('click', () => {
  const opt = PRESETS.flatMap((l) => l.options).find((o) => o.id === preset.value)
  if (!opt) return
  const req: DemoRequest = { overrides: opt.params, seed: Number($<HTMLInputElement>('seed').value) }
  say('generating…')
  worker.postMessage(req)
})

worker.onmessage = async (e: MessageEvent<DemoResponse>) => {
  const t0 = performance.now()
  board.board = e.data.board
  await board.updateComplete
  await raf()
  const build = performance.now() - t0
  const nodes = board.shadowRoot?.querySelectorAll('svg *').length ?? 0
  say(
    `generated in ${e.data.genMs.toFixed(0)} ms (ok=${e.data.ok}), pieces ${e.data.board.pieces.length}, ` +
      `build ${build.toFixed(0)} ms, svg nodes ${nodes}`,
  )
}

$<HTMLInputElement>('interactive').addEventListener('change', (e) => {
  board.interactive = (e.target as HTMLInputElement).checked
})
$<HTMLInputElement>('colored').addEventListener('change', (e) => {
  board.view = { ...board.view, colored: (e.target as HTMLInputElement).checked }
})
$<HTMLInputElement>('pl').addEventListener('change', (e) => {
  board.setAttribute('lang', (e.target as HTMLInputElement).checked ? 'pl' : 'en')
})

let shiftHeld = false
document.addEventListener('keydown', (e) => {
  if (e.key === 'Shift') shiftHeld = true
})
document.addEventListener('keyup', (e) => {
  if (e.key === 'Shift') shiftHeld = false
})

board.addEventListener('piece-click', async (e: PieceClickEvent) => {
  const b = board.board
  const pc = b?.pieces.find((p) => p.id === e.detail.pieceId)
  if (!b || !pc) return
  if (shiftHeld) {
    await board.shake(pc.id, 0.3)
    return
  }
  await board.animateExit(pc.id, pc.dir)
  const owner = new Int32Array(b.owner)
  for (const c of pc.cells) owner[c.y * b.W + c.x] = -1
  board.board = { ...b, owner, pieces: b.pieces.filter((p) => p !== pc) }
})

/** Scripted pan (60 frames of modifier drag) and zoom (60 frames of zoomBy), reporting mean and worst frame time. */
$<HTMLButtonElement>('measure').addEventListener('click', async () => {
  const svg = board.shadowRoot?.querySelector('svg')
  if (!svg || !board.board) return
  board.fit()
  board.zoomBy(3)
  await raf()
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
  const panFrames: number[] = []
  svg.dispatchEvent(ev('pointerdown', r.width / 2, r.height / 2))
  for (let i = 1; i <= 60; i++) {
    const t = performance.now()
    svg.dispatchEvent(ev('pointermove', r.width / 2 - i * 3, r.height / 2 - i * 2))
    await raf()
    panFrames.push(performance.now() - t)
  }
  svg.dispatchEvent(ev('pointerup', r.width / 2 - 180, r.height / 2 - 120))
  const zoomFrames: number[] = []
  for (let i = 0; i < 60; i++) {
    const t = performance.now()
    board.zoomBy(i % 2 === 0 ? 1.03 : 1 / 1.03)
    await raf()
    zoomFrames.push(performance.now() - t)
  }
  const report = (name: string, f: number[]) => {
    let worst = 0, sum = 0
    for (const x of f) {
      sum += x
      if (x > worst) worst = x
    }
    return `${name} mean ${(sum / f.length).toFixed(1)} ms, worst ${worst.toFixed(1)} ms`
  }
  say(`${stats.textContent}\n${report('pan', panFrames)}; ${report('zoom', zoomFrames)}`)
})
