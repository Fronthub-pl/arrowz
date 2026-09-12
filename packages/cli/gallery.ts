/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
// The R1/R2 playground: one board, the two measurement options as sliders, and
// the free arrows and traps ringed on the board. Built by `deno task bundle`
// into dist/gallery.js; gallery.html loads that file.
//
// The board is carved here rather than loaded from a file, because trapBias,
// freeBias and backbite are Carver OPTIONS of the measurement branch, not
// knobs, so `generate()` cannot reach them.
import { ArrowzBoard } from '../board-element/src/mod.ts'
import { analyse, Carver, defaultParams, mulberry32 } from '../engine/engine.ts'
import { DIRS } from '../engine/geometry.ts'
import type { Params } from '../engine/types.ts'

type Marked = { x: number; y: number; kind: 'free' | 'trap' }

/** What both the board element and classify() need: the grid and its pieces. */
type BoardLike = {
  W: number
  H: number
  owner: Int32Array
  pieces: { cells: { x: number; y: number }[]; dir: number; id: number }[]
}

/**
 * Walks each piece's ray to the exit edge and counts the distinct pieces on it,
 * stopping at two: a piece with none is free to leave, a piece with exactly one
 * is the trap that looks free. Anything deeper gets no mark.
 */
function classify(board: BoardLike): { marks: Marked[]; free: number; traps: number } {
  const marks: Marked[] = []
  let free = 0, traps = 0
  const seen = new Int32Array(board.pieces.length).fill(-1)
  for (const pc of board.pieces) {
    const dir = DIRS[pc.dir]
    const h = pc.cells[0]
    if (!dir || !h) continue
    let n = 0
    let x = h.x + dir.dx, y = h.y + dir.dy
    while (x >= 0 && y >= 0 && x < board.W && y < board.H) {
      const o = board.owner[y * board.W + x]
      if (o !== undefined && o >= 0 && o !== pc.id && seen[o] !== pc.id) {
        seen[o] = pc.id
        n++
        if (n > 1) break
      }
      x += dir.dx
      y += dir.dy
    }
    if (n === 0) {
      free++
      marks.push({ x: h.x, y: h.y, kind: 'free' })
    } else if (n === 1) {
      traps++
      marks.push({ x: h.x, y: h.y, kind: 'trap' })
    }
  }
  return { marks, free, traps }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (html !== undefined) node.innerHTML = html
  return node
}

function stat(value: string, label: string, cls = ''): HTMLElement {
  const box = el('div', `stat ${cls}`.trim())
  box.append(el('b', undefined, value), el('span', undefined, label))
  return box
}

function control<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`#${id} is missing`)
  return node as T
}

type Mounted = { set: (carver: BoardLike, marks: Marked[]) => void }

/**
 * Mounts the board and its mark overlay into `stage`. The overlay is redrawn on
 * every viewport change, because pan and zoom move the cells under it.
 */
function mount(stage: HTMLElement): Mounted {
  const board = new ArrowzBoard()
  board.pad = 1
  stage.append(board)
  const svgNs = 'http://www.w3.org/2000/svg'
  const marksSvg = document.createElementNS(svgNs, 'svg')
  marksSvg.setAttribute('class', 'marks')
  stage.append(marksSvg)

  let marks: Marked[] = []
  const draw = (): void => {
    const vp = board.viewport
    if (!vp) return
    marksSvg.replaceChildren()
    // A ring, not a disc: the mark has to read on top of a dark arrow without
    // hiding the arrowhead it is pointing at. Below a pixel and a half a ring
    // is mud, so past that the marks are left off rather than drawn as noise.
    const r = vp.cellPx * 0.42
    if (r < 1.6) return
    for (const m of marks) {
      const dot = document.createElementNS(svgNs, 'circle')
      dot.setAttribute('cx', String((m.x + 0.5 - vp.originX) * vp.cellPx))
      dot.setAttribute('cy', String((m.y + 0.5 - vp.originY) * vp.cellPx))
      dot.setAttribute('r', String(r))
      dot.setAttribute('fill', 'none')
      dot.setAttribute('stroke', m.kind === 'free' ? '#00b877' : '#ff3d84')
      dot.setAttribute('stroke-width', String(Math.max(1, r * 0.42)))
      marksSvg.append(dot)
    }
  }
  board.addEventListener('viewport-change', draw)
  return {
    set: (carver, next) => {
      marks = next
      board.board = carver
      requestAnimationFrame(draw)
    },
  }
}

/** Roughly what a board of this side costs, from the measurements. */
function sizeWarning(side: number): string {
  if (side >= 1000) return 'About 10–25 s in this tab, and the page stops responding while it carves.'
  if (side >= 400) return 'A second or two per change.'
  return ''
}

function playground(): void {
  const mounted = mount(control<HTMLElement>('play-stage'))
  const statsBox = control<HTMLElement>('play-stats')

  const level = control<HTMLSelectElement>('k-level')
  const seed = control<HTMLInputElement>('k-seed')
  const trap = control<HTMLInputElement>('k-trap')
  const free = control<HTMLInputElement>('k-free')
  const back = control<HTMLInputElement>('k-back')
  const start = control<HTMLSelectElement>('k-start')
  const short = control<HTMLInputElement>('k-short')
  const showFree = control<HTMLInputElement>('k-showfree')
  const showTraps = control<HTMLInputElement>('k-showtraps')
  const freeKnob = control<HTMLElement>('knob-free')

  const render = (): void => {
    const trapBias = Number(trap.value)
    const backbite = Number(back.value)
    const freeBias = Number(free.value)
    const side = Number(level.value)
    control<HTMLOutputElement>('o-trap').value = String(trapBias)
    control<HTMLOutputElement>('o-back').value = String(backbite)
    control<HTMLOutputElement>('o-free').value = String(freeBias)
    control<HTMLOutputElement>('o-short').value = Number(short.value).toFixed(2)
    control<HTMLOutputElement>('o-side').value = `${side}×${side}`
    control<HTMLElement>('size-warn').textContent = sizeWarning(side)
    // trapBias wins over freeBias in the carver, so say so rather than let the
    // slider pretend it is doing something.
    freeKnob.classList.toggle('off', trapBias !== 0)

    const p: Params = {
      ...defaultParams(),
      W: side,
      H: side,
      seed: Math.max(1, Math.floor(Number(seed.value) || 1)),
      headBias: Number(start.value),
      wShort: Number(short.value),
    }
    const t0 = performance.now()
    const carver = new Carver(p.W, p.H, p, mulberry32(p.seed), { trapBias, backbite, freeBias })
    const ok = carver.run()
    const ms = performance.now() - t0
    const metrics = ok ? analyse(carver, true) : null
    const { marks, free: freeCount, traps } = classify(carver)
    const shown = marks.filter((m) => (m.kind === 'free' ? showFree.checked : showTraps.checked))
    mounted.set(carver, shown)

    const n = metrics?.N ?? carver.pieces.length
    statsBox.replaceChildren(
      stat(n.toLocaleString('en'), 'pieces'),
      stat(freeCount.toLocaleString('en'), 'free', 'free'),
      stat(traps.toLocaleString('en'), 'traps', 'trap'),
      stat(n ? ((side * side) / n).toFixed(1) : '0', 'mean cells'),
      stat(String(metrics?.D ?? 0), 'depth'),
      stat(`${Math.round(ms)} ms`, ok ? 'carved' : 'jammed'),
    )
  }

  for (const node of [level, seed, trap, free, back, start, short, showFree, showTraps]) {
    node.addEventListener('change', render)
    if (node instanceof HTMLInputElement && node.type === 'range') node.addEventListener('input', render)
  }
  render()
}

playground()
