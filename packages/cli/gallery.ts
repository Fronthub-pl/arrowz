/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
// The gallery page of the R1/R2 measurements: one board per setting, with the
// free arrows and the traps marked on it. Built by `deno task bundle` into
// dist/gallery.js; gallery.html loads that file.
//
// The boards are carved here rather than loaded from files, because two of the
// settings are Carver OPTIONS of the measurement branch (freeBias, trapBias,
// backbite), not knobs, so `generate()` cannot reach them.
import { ArrowzBoard } from '../board-element/src/mod.ts'
import { analyse, Carver, defaultParams, mulberry32 } from '../engine/engine.ts'
import { DIRS } from '../engine/geometry.ts'
import type { Params } from '../engine/types.ts'

const SIDE = 40
const SEED = 7

type Config = {
  title: string
  tag: 'today' | 'r1' | 'r2' | 'len'
  knobs: string
  params: Partial<Params>
  opts?: { freeBias?: number; trapBias?: number; backbite?: number }
  look: string
}

const CONFIGS: readonly Config[] = [
  {
    title: 'Defaults',
    tag: 'today',
    knobs: '--start=random',
    params: {},
    look:
      '16 free, 31 traps. The baseline every other card is compared against. Note that the marks cluster on the left and top rims and thin out towards the middle: a head deep in the board has many pieces in its corridor, so it is neither free nor a trap.',
  },
  {
    title: 'Layers',
    tag: 'today',
    knobs: '--start=layers',
    params: { headBias: -1 },
    look:
      "30 free (nearly double the baseline), 34 traps. <b>Today's knobs move both numbers the same way:</b> more heads on the rim means more free arrows AND more arrows with a single piece in the way. Nothing in the generator separates the two.",
  },
  {
    title: 'Tunnels',
    tag: 'today',
    knobs: '--start=tunnels',
    params: { headBias: 1 },
    look:
      '11 free, 16 traps — both down. Heads start deep, behind other pieces, so fewer of them reach the rim at all. At 1000&times;1000 this is the lowest free count any existing knob reaches: 142 of 85 500 pieces.',
  },
  {
    title: 'Fewest traps',
    tag: 'r1',
    knobs: 'trapBias -1 (R1 spike)',
    params: {},
    opts: { trapBias: -1 },
    look:
      '<b>8 traps against 31 in the baseline — a quarter — while free arrows go UP, 24 against 16.</b> This is the card that justifies R1: no existing knob moves the two numbers in opposite directions. A board you can largely play by eye.',
  },
  {
    title: 'Most traps',
    tag: 'r1',
    knobs: 'trapBias +1 (R1 spike)',
    params: {},
    opts: { trapBias: 1 },
    look:
      '38 traps against 31, and free arrows down to 11. <b>The lever is asymmetric:</b> avoiding traps works far better than manufacturing them, here and at 1000&times;1000 (912 traps at most, 178 at fewest, 680 at the baseline). The useful end is the other card.',
  },
  {
    title: 'Most free arrows',
    tag: 'r1',
    knobs: 'freeBias +1 (R1 spike)',
    params: {},
    opts: { freeBias: 1 },
    look:
      '<b>The spike that did NOT justify a knob.</b> 22 free arrows, fewer than <code>--start=layers</code> reaches here (30) with no new code at all. At 1000&times;1000 the two tie: 556 against 549. Ranking heads cannot beat the geometric ceiling — only the number of heads can.',
  },
  {
    title: 'Short pieces',
    tag: 'len',
    knobs: '--wshort=0.9 --wmid=0',
    params: { wShort: 0.9, wMid: 0 },
    look:
      '<b>The strongest lever on free arrows, and it already exists.</b> Twice the pieces means twice the heads, and free arrows rise with them: at 1000&times;1000 from 454 to 1900. But traps rise just as fast — like every other existing knob, length moves the two together.',
  },
  {
    title: 'Tail backbite',
    tag: 'r2',
    knobs: 'backbite 8 (R2)',
    params: {},
    opts: { backbite: 8 },
    look:
      '<b>Compare the piece count with the first card: 111 against 152.</b> The stall escape grows longer, more wound pieces, and fewer pieces means fewer heads on the rim — at 1000&times;1000 free arrows drop 39%, from 454 to 276. This is why R2 moves what R1 would be aiming at.',
  },
]

type Marked = { x: number; y: number; kind: 'free' | 'trap' }

/** Per piece: how many distinct other pieces its ray crosses, capped at 2. */
function classify(
  board: {
    W: number
    H: number
    owner: Int32Array
    pieces: { cells: { x: number; y: number }[]; dir: number; id: number }[]
  },
): {
  marks: Marked[]
  free: number
  traps: number
} {
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

function build(cfg: Config): HTMLElement {
  const p: Params = { ...defaultParams(), ...cfg.params, W: SIDE, H: SIDE, seed: SEED }
  const carver = new Carver(p.W, p.H, p, mulberry32(p.seed), { ...cfg.opts })
  const ok = carver.run()
  const metrics = ok ? analyse(carver, true) : null
  const { marks, free, traps } = classify(carver)

  const card = el('div', 'card')
  card.append(el('h2', undefined, `${cfg.title}<span class="tag ${cfg.tag}">${cfg.tag}</span>`))
  card.append(el('p', 'knobs', cfg.knobs))

  const stage = el('div', 'stage')
  const board = new ArrowzBoard()
  board.board = carver
  board.pad = 1
  stage.append(board)

  const svgNs = 'http://www.w3.org/2000/svg'
  const marksSvg = document.createElementNS(svgNs, 'svg')
  marksSvg.setAttribute('class', 'marks')
  stage.append(marksSvg)

  const draw = (): void => {
    const vp = board.viewport
    if (!vp) return
    marksSvg.replaceChildren()
    // A ring, not a disc: the mark has to read on top of a dark arrow without
    // hiding the arrowhead it is pointing at.
    const r = Math.max(3, vp.cellPx * 0.42)
    for (const m of marks) {
      const dot = document.createElementNS(svgNs, 'circle')
      dot.setAttribute('cx', String((m.x + 0.5 - vp.originX) * vp.cellPx))
      dot.setAttribute('cy', String((m.y + 0.5 - vp.originY) * vp.cellPx))
      dot.setAttribute('r', String(r))
      dot.setAttribute('fill', 'none')
      dot.setAttribute('stroke', m.kind === 'free' ? '#00b877' : '#ff3d84')
      dot.setAttribute('stroke-width', String(Math.max(1.5, r * 0.42)))
      marksSvg.append(dot)
    }
  }
  board.addEventListener('viewport-change', draw)
  requestAnimationFrame(draw)

  card.append(stage)

  const stats = el('div', 'stats')
  const meanLen = metrics ? (SIDE * SIDE) / metrics.N : 0
  stats.append(
    stat(String(metrics?.N ?? 0), 'pieces'),
    stat(String(free), 'free', 'free'),
    stat(String(traps), 'traps', 'trap'),
    stat(meanLen.toFixed(1), 'mean cells'),
  )
  card.append(stats)
  card.append(el('p', 'look', cfg.look))
  return card
}

const cards = document.getElementById('cards')
if (!cards) throw new Error('#cards is missing')
for (const cfg of CONFIGS) cards.append(build(cfg))
