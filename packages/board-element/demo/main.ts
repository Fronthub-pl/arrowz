// The demo: a board generated in a worker, and an inspector beside it. The
// panel is the only thing that drives the element, so what it shows — the
// controls, the markup, the events — is the element's actual state, not a
// second copy of it kept in step by hand.
import { PRESETS } from '@arrowz/engine/presets'
import '../src/mod.ts'
import { type ArrowzBoard, type BoardView, DEFAULT_VIEW, type SessionSnapshot } from '../src/mod.ts'
import { ATTRIBUTES, type Control, type ControlValue, VIEW_CONTROLS, viewRecord, withField } from './controls.ts'
import { buildControls, EventConsole } from './panel.ts'
import { type BoardSummary, snippet } from './snippet.ts'
import type { DemoRequest, DemoResponse } from './worker.ts'

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing #${id}`)
  return el as T
}

const board = $<ArrowzBoard>('board')
const stats = $<HTMLParagraphElement>('stats')
const session = $<HTMLParagraphElement>('session')
const snippetPre = $<HTMLPreElement>('snippet')
const preset = $<HTMLSelectElement>('preset')
const seedInput = $<HTMLInputElement>('seed')
const generateButton = $<HTMLButtonElement>('generate')
const measureButton = $<HTMLButtonElement>('measure')
const loadButton = $<HTMLButtonElement>('load')
const copyButton = $<HTMLButtonElement>('copy')
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

// ── The inputs ──────────────────────────────────────────────────────────────

/** What the demo opens with: a board that plays, and permission to colour it. */
const INITIAL: readonly (readonly [string, ControlValue])[] = [['play', true], ['enable-colors', true]]

let view: BoardView = { ...DEFAULT_VIEW }
board.view = view

function applyAttribute(control: Control, value: ControlValue): void {
  if (control.kind === 'bool') {
    if (value === true) board.setAttribute(control.id, '')
    else board.removeAttribute(control.id)
    return
  }
  board.setAttribute(control.id, String(value))
}

/** The element's own state, never a shadow copy: an absent attribute is its default. */
function readAttribute(control: Control): ControlValue {
  if (control.kind === 'bool') return board.hasAttribute(control.id)
  const held = board.getAttribute(control.id)
  if (held === null) return control.def
  return control.kind === 'number' ? Number(held) : held
}

const byId = new Map(ATTRIBUTES.map((control) => [control.id, control]))
for (const [id, value] of INITIAL) {
  const control = byId.get(id)
  if (control) applyAttribute(control, value)
}

const syncAttributes = buildControls($('attrs'), ATTRIBUTES, readAttribute, applyAttribute)
buildControls(
  $('view-controls'),
  VIEW_CONTROLS,
  (control) => viewRecord(view)[control.id] ?? control.def,
  (control, value) => {
    view = withField(view, control.id, value)
    board.view = view
    refreshSnippet()
  },
)

// ── The markup ──────────────────────────────────────────────────────────────

let summary: BoardSummary | null = null

function refreshSnippet(): void {
  const attrs = board.getAttributeNames().map((name) => [name, board.getAttribute(name) ?? ''] as const)
  snippetPre.textContent = snippet({ attrs, view: viewRecord(view), board: summary })
}

// Every attribute of the element is reflected, so watching the DOM catches the
// panel's own edits and the ones the demo makes behind the panel's back (play
// cleared on the last life) with one listener instead of a call at each site.
new MutationObserver(() => {
  syncAttributes()
  refreshSnippet()
}).observe(board, { attributes: true })

copyButton.addEventListener('click', () => {
  navigator.clipboard.writeText(snippetPre.textContent ?? '').then(
    () => flash('Copied'),
    () => flash('Copy failed'),
  )
})

function flash(text: string): void {
  copyButton.textContent = text
  setTimeout(() => (copyButton.textContent = 'Copy'), 1200)
}

refreshSnippet()

// ── Generation ──────────────────────────────────────────────────────────────

// The status paragraph holds two lines the two buttons own separately: the state
// of the last generation, and under it the last measurement. Keeping the first
// in a variable is what stops repeated "Measure" clicks from piling their output
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
  const req: DemoRequest = { overrides: opt.params, seed: Number(seedInput.value) }
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
    generationLine = `generated in ${genMs.toFixed(0)} ms (ok=${ok}), pieces ${generated.pieces.length}, ` +
      `build ${build.toFixed(0)} ms, drawn ${board.pieceCount}`
    say()
    summary = { W: generated.W, H: generated.H, seed: Number(seedInput.value) }
    refreshSnippet()
    lives = 3
    note = ''
    recountLeft()
  } finally {
    busy(false)
  }
}

worker.onerror = (e: ErrorEvent) => failed(`worker error: ${e.message}`)
worker.onmessageerror = () => failed('worker sent a message the page could not read')

// ── The session the host owns ───────────────────────────────────────────────

let lives = 3
let left = 0
let note = ''
let saved: SessionSnapshot | null = null

function paintSession(): void {
  session.textContent = `lives: ${lives} · left: ${left}${note ? ` · ${note}` : ''}`
}

/**
 * Recounts from the board's own state, for a load and a restart, where no event
 * carries the number. `saveState()` fingerprints the whole board (spec §2), so
 * the removal listener below reads `left` off the event instead of calling this
 * on every single move.
 */
function recountLeft(): void {
  const total = board.board?.pieces.length ?? 0
  left = total - (board.saveState()?.removed.length ?? 0)
  paintSession()
}

board.addEventListener('piece-removed', (e) => {
  left = e.detail.left
  paintSession()
})
board.addEventListener('life-lost', (e) => {
  lives--
  note = `blocked by ${e.detail.blockerId}`
  // The element counts no lives: running out is the host's decision, and the
  // panel follows the attribute back through the observer above.
  if (lives === 0) board.removeAttribute('play')
  paintSession()
})
board.addEventListener('finished', (e) => {
  note = `cleared ${e.detail.pieces} pieces`
  paintSession()
})

$<HTMLButtonElement>('fit').addEventListener('click', () => board.fit())
$<HTMLButtonElement>('save').addEventListener('click', () => {
  saved = board.saveState()
  loadButton.disabled = saved === null
})
loadButton.addEventListener('click', () => {
  if (!saved) return
  board.loadState(saved)
  recountLeft()
})
$<HTMLButtonElement>('restart').addEventListener('click', () => {
  lives = 3
  note = ''
  board.setAttribute('play', '')
  board.restart()
  recountLeft()
})

// ── The events ──────────────────────────────────────────────────────────────

const EVENT_TYPES: readonly string[] = [
  'piece-click',
  'piece-removed',
  'life-lost',
  'finished',
  'viewport-change',
]

const events = new EventConsole($('console'), $('filters'), EVENT_TYPES, ['viewport-change'])
for (const type of EVENT_TYPES) {
  board.addEventListener(type, (e: Event) => {
    events.record(type, e instanceof CustomEvent ? e.detail : null)
  })
}
$<HTMLButtonElement>('clear').addEventListener('click', () => events.clear())

// ── The measurement of the spec (§11) ───────────────────────────────────────

/**
 * Scripted pan (60 frames of modifier drag) and zoom (60 frames of zoomBy), reporting mean and worst frame time.
 *
 * Each frame is timed around the dispatch plus one `await raf()`, so the figure
 * is max(work, frame interval): on a 60 Hz display anything cheaper than
 * ~16.7 ms still prints as ~16.7 ms. Only numbers well above that measure the
 * element's work; 16.7 ms means the frame had room to spare.
 */
measureButton.addEventListener('click', async () => {
  const canvas = board.shadowRoot?.querySelector('canvas')
  if (!canvas || !board.board) return
  busy(true)
  try {
    board.fit()
    board.zoomBy(3)
    await raf()
    const r = canvas.getBoundingClientRect()
    const ev = (type: string, x: number, y: number) =>
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: r.left + x,
        clientY: r.top + y,
        ctrlKey: board.gestureMode === 'click',
        buttons: 1,
      })
    const panFrames: number[] = []
    canvas.dispatchEvent(ev('pointerdown', r.width / 2, r.height / 2))
    for (let i = 1; i <= 60; i++) {
      const t = performance.now()
      canvas.dispatchEvent(ev('pointermove', r.width / 2 - i * 3, r.height / 2 - i * 2))
      await raf()
      panFrames.push(performance.now() - t)
    }
    canvas.dispatchEvent(ev('pointerup', r.width / 2 - 180, r.height / 2 - 120))
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
