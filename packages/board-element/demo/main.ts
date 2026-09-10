// The demo: a preset picker, generation in a worker, the element playing a
// real game (`play`, coloured, save/load/restart), and the measurements of
// the spec (§11): build time, node count, pan and zoom frame times.
import { PRESETS } from '@arrowz/engine/presets'
import '../src/mod.ts'
import type { ArrowzBoard, SessionSnapshot } from '../src/mod.ts'
import type { DemoRequest, DemoResponse } from './worker.ts'

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing #${id}`)
  return el as T
}

const board = $<ArrowzBoard>('board')
const stats = $<HTMLSpanElement>('stats')
const preset = $<HTMLSelectElement>('preset')
const generateButton = $<HTMLButtonElement>('generate')
const measureButton = $<HTMLButtonElement>('measure')
const saveButton = $<HTMLButtonElement>('save')
const loadButton = $<HTMLButtonElement>('load')
const restartButton = $<HTMLButtonElement>('restart')
const leftLabel = $<HTMLSpanElement>('left')
const livesLabel = $<HTMLSpanElement>('lives')
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

board.play = $<HTMLInputElement>('play').checked
board.enableColors = true

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

// The status span holds two lines the two buttons own separately: the state of
// the last generation, and under it the last measurement. Keeping the first in
// a variable is what stops repeated "Measure" clicks from piling their output
// on top of each other, the way re-reading `stats.textContent` would.
let generationLine = 'idle'

function say(measurement?: string): void {
  stats.textContent = measurement === undefined ? generationLine : `${generationLine}\n${measurement}`
}

/** One job at a time: neither button may start while the other is running. */
function busy(on: boolean): void {
  generateButton.disabled = on
  measureButton.disabled = on
}

function failed(text: string): void {
  generationLine = text
  say()
  busy(false)
}

generateButton.addEventListener('click', () => {
  const opt = PRESETS.flatMap((l) => l.options).find((o) => o.id === preset.value)
  if (!opt) return
  const req: DemoRequest = { overrides: opt.params, seed: Number($<HTMLInputElement>('seed').value) }
  busy(true)
  generationLine = 'generating…'
  say()
  worker.postMessage(req)
})

worker.onmessage = async (e: MessageEvent<DemoResponse>) => {
  try {
    if ('error' in e.data) {
      generationLine = `generation failed: ${e.data.error}`
      say()
      return
    }
    const { board: generated, ok, genMs } = e.data
    const t0 = performance.now()
    board.board = generated
    await board.updateComplete
    await raf()
    const build = performance.now() - t0
    const nodes = board.shadowRoot?.querySelectorAll('svg *').length ?? 0
    generationLine = `generated in ${genMs.toFixed(0)} ms (ok=${ok}), pieces ${generated.pieces.length}, ` +
      `build ${build.toFixed(0)} ms, svg nodes ${nodes}`
    say()
  } finally {
    busy(false)
  }
}

worker.onerror = (e: ErrorEvent) => failed(`worker error: ${e.message}`)
worker.onmessageerror = () => failed('worker sent a message the page could not read')

// The one place the demo can show `interactive` versus `play` (design §4):
// unchecking this stops the reducer entirely, rather than only changing the
// cursor, which is all it did while it was wired to `board.interactive` and
// `board.play` was pinned to `true` unconditionally.
$<HTMLInputElement>('play').addEventListener('change', (e) => {
  board.play = (e.target as HTMLInputElement).checked
})
$<HTMLInputElement>('pad').addEventListener('change', (e) => {
  const cells = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(cells) && cells >= 0) board.pad = cells
})
$<HTMLInputElement>('colored').addEventListener('change', (e) => {
  board.view = { ...board.view, colored: (e.target as HTMLInputElement).checked }
})
$<HTMLInputElement>('points').addEventListener('change', (e) => {
  board.showPoints = (e.target as HTMLInputElement).checked
})
$<HTMLInputElement>('pl').addEventListener('change', (e) => {
  board.setAttribute('lang', (e.target as HTMLInputElement).checked ? 'pl' : 'en')
})

// With `play` the element runs the game itself; this is the host's half —
// the life count and the save slot, both of which live outside the element.
let lives = 3
let saved: SessionSnapshot | null = null

/**
 * Repaints `left` from the board's own state (piece count minus what
 * `saveState()` says has left). Used only for a load and a restart, where no
 * event carries the number directly: `saveState()` fingerprints the whole
 * board (spec §2), so calling it on every `piece-removed` would run that scan
 * on every single move, which the removal listener below avoids by reading
 * `left` off the event instead.
 */
function paintLeft(): void {
  const total = board.board?.pieces.length ?? 0
  const removed = board.saveState()?.removed.length ?? 0
  leftLabel.textContent = `left: ${total - removed}`
}

board.addEventListener('piece-removed', (e) => {
  leftLabel.textContent = `left: ${e.detail.left}`
})
board.addEventListener('life-lost', (e) => {
  lives--
  livesLabel.textContent = `lives: ${lives} (blocked by ${e.detail.blockerId})`
  if (lives === 0) {
    board.play = false
    $<HTMLInputElement>('play').checked = false
  }
})
board.addEventListener('finished', (e) => {
  livesLabel.textContent = `cleared ${e.detail.pieces} pieces`
})
saveButton.addEventListener('click', () => {
  saved = board.saveState()
})
loadButton.addEventListener('click', () => {
  if (!saved) return
  board.loadState(saved)
  paintLeft()
})
restartButton.addEventListener('click', () => {
  lives = 3
  board.play = true
  $<HTMLInputElement>('play').checked = true
  board.restart()
  paintLeft()
  livesLabel.textContent = `lives: ${lives}`
})

/**
 * Scripted pan (60 frames of modifier drag) and zoom (60 frames of zoomBy), reporting mean and worst frame time.
 *
 * Each frame is timed around the dispatch plus one `await raf()`, so the figure
 * is max(work, frame interval): on a 60 Hz display anything cheaper than
 * ~16.7 ms still prints as ~16.7 ms. Only numbers well above that measure the
 * element's work; 16.7 ms means the frame had room to spare.
 */
measureButton.addEventListener('click', async () => {
  const svg = board.shadowRoot?.querySelector('svg')
  if (!svg || !board.board) return
  busy(true)
  try {
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
    say(`${report('pan', panFrames)}; ${report('zoom', zoomFrames)}`)
  } finally {
    busy(false)
  }
})
