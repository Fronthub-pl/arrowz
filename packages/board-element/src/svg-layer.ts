// The board as SVG nodes, built imperatively: one string per group inserted
// in one go, then a map from piece id to its two groups (line and head), so
// a click, an animation or a board update touches one piece, never the
// tree. No Lit template ever sees these nodes: on Insane there are ~86 000
// pieces, and a template diff over them would cost more than the change.
import { DIRS, pieceShape, voidStrips } from '@arrowz/engine'
import type { Board, Piece } from '@arrowz/engine'

export interface BoardView {
  /** Stroke width as a fraction of a cell. */
  stroke: number
  /** Head width in cells; 0 = automatic. */
  headWidth: number
  /** Head height in cells; 0 = automatic. */
  headHeight: number
  /** Per-piece hues: the diagnostic mode of the lab. */
  colored: boolean
  /** How many longest pieces are drawn highlighted and on top. */
  top: number
  /** Draw the cells the generator failed to carve. */
  voids: boolean
  ink: string
  paper: string
  highlight: string
}

export const DEFAULT_VIEW: BoardView = {
  stroke: 0.5,
  headWidth: 0,
  headHeight: 0,
  colored: false,
  top: 0,
  voids: false,
  ink: '#232447',
  paper: '#f6f6fa',
  highlight: '#e8467c',
}

const SVG_NS = 'http://www.w3.org/2000/svg'

interface PieceNodes {
  piece: Piece
  line: SVGGElement
  head: SVGGElement
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  return el
}

function sameView(a: BoardView, b: BoardView): boolean {
  return a.stroke === b.stroke && a.headWidth === b.headWidth && a.headHeight === b.headHeight &&
    a.colored === b.colored && a.top === b.top && a.voids === b.voids && a.ink === b.ink && a.paper === b.paper &&
    a.highlight === b.highlight
}

const pt = ([x, y]: [number, number]): string => `${x},${y}`

export class SvgLayer {
  readonly svg: SVGSVGElement
  private readonly paper: SVGRectElement
  private readonly voidsGroup: SVGGElement
  private readonly piecesGroup: SVGGElement
  private readonly topGroup: SVGGElement
  private readonly headsGroup: SVGGElement
  private nodes = new Map<number, PieceNodes>()
  private current: Board | null = null
  private view: BoardView = DEFAULT_VIEW

  constructor() {
    this.svg = svgEl('svg', { xmlns: SVG_NS, preserveAspectRatio: 'xMidYMid meet' })
    this.paper = svgEl('rect', { class: 'paper', x: '0', y: '0', width: '0', height: '0' })
    this.voidsGroup = svgEl('g', { class: 'voids', 'fill-opacity': '.22' })
    this.piecesGroup = svgEl('g', {
      class: 'pieces',
      fill: 'none',
      'stroke-linecap': 'butt',
      'stroke-linejoin': 'round',
    })
    this.topGroup = svgEl('g', { class: 'top', fill: 'none', 'stroke-linecap': 'butt', 'stroke-linejoin': 'round' })
    this.headsGroup = svgEl('g', { class: 'heads' })
    this.svg.append(this.paper, this.voidsGroup, this.piecesGroup, this.topGroup, this.headsGroup)
  }

  get board(): Board | null {
    return this.current
  }

  get pieceCount(): number {
    return this.nodes.size
  }

  hasPiece(id: number): boolean {
    return this.nodes.has(id)
  }

  nodesOf(id: number): { line: SVGGElement; head: SVGGElement } | null {
    const n = this.nodes.get(id)
    return n ? { line: n.line, head: n.head } : null
  }

  isExiting(_id: number): boolean {
    return false
  }

  /**
   * Draws a board. Same size, same view and no diagnostic mode: only the
   * pieces whose id or object changed are touched, so the game's next board
   * (the same piece objects minus one) costs one pass over the ids.
   * Anything else rebuilds the tree.
   */
  setBoard(board: Board | null, view: BoardView): void {
    const canDiff = board !== null && this.current !== null && board.W === this.current.W &&
      board.H === this.current.H && sameView(view, this.view) && !view.colored && view.top === 0
    this.view = view
    if (board === null) {
      this.clear()
      this.current = null
      return
    }
    if (canDiff) {
      this.diff(board)
    } else {
      this.rebuild(board)
    }
    this.current = board
    this.drawVoids(board)
  }

  private clear(): void {
    this.piecesGroup.replaceChildren()
    this.topGroup.replaceChildren()
    this.headsGroup.replaceChildren()
    this.voidsGroup.replaceChildren()
    this.nodes.clear()
  }

  private drawVoids(board: Board): void {
    this.voidsGroup.setAttribute('fill', this.view.highlight)
    if (!this.view.voids) {
      this.voidsGroup.replaceChildren()
      return
    }
    this.voidsGroup.innerHTML = voidStrips(board)
      .map((s) => `<rect x="${s.x}" y="${s.y}" width="${s.len}" height="1"/>`)
      .join('')
  }

  private rebuild(board: Board): void {
    const v = this.view
    this.clear()
    this.paper.setAttribute('width', String(board.W))
    this.paper.setAttribute('height', String(board.H))
    this.paper.setAttribute('fill', v.paper)
    this.piecesGroup.setAttribute('stroke', v.ink)
    this.piecesGroup.setAttribute('stroke-width', String(v.stroke))
    // Highlighted pieces are thicker, as in toSvg: 1.15x in monochrome, 1.5x in colour.
    const hiWidth = Number((v.stroke * (v.colored ? 1.5 : 1.15)).toFixed(2))
    this.topGroup.setAttribute('stroke-width', String(hiWidth))
    this.headsGroup.setAttribute('fill', v.ink)
    const longest = new Set(
      [...board.pieces].sort((a, b) => b.cells.length - a.cells.length).slice(0, v.top).map((p) => p.id),
    )
    const lines: string[] = []
    const tops: string[] = []
    const heads: string[] = []
    const topHeads: string[] = []
    board.pieces.forEach((pc, i) => {
      const isLong = longest.has(pc.id)
      const col = isLong ? v.highlight : v.colored ? `hsl(${(i * 137.508) % 360} 62% 42%)` : v.ink
      const width = isLong ? hiWidth : v.stroke
      const [line, head] = this.markup(pc, width, col === v.ink ? null : col)
      if (isLong) {
        tops.push(line)
        topHeads.push(head)
      } else {
        lines.push(line)
        heads.push(head)
      }
    })
    this.piecesGroup.innerHTML = lines.join('')
    this.topGroup.innerHTML = tops.join('')
    this.headsGroup.innerHTML = heads.join('') + topHeads.join('')
    this.index(board)
  }

  /** The two groups of one piece as markup: [line group, head group]. */
  private markup(pc: Piece, width: number, colour: string | null): [string, string] {
    const s = pieceShape(pc, {
      cell: 1,
      pad: 0,
      width,
      headWidth: this.view.headWidth,
      headHeight: this.view.headHeight,
    })
    const stroke = colour === null ? '' : ` stroke="${colour}"`
    const fill = colour === null ? '' : ` fill="${colour}"`
    const line = `<g data-id="${pc.id}"${stroke}><polyline points="${s.line.map(pt).join(' ')}"/></g>`
    const head = `<g data-id="${pc.id}"${fill}><polygon points="${s.head.map(pt).join(' ')}"/>` +
      `<circle cx="${s.tail.x}" cy="${s.tail.y}" r="${s.tail.r}"/></g>`
    return [line, head]
  }

  /** Fills the id map from the children of the groups, one pass. */
  private index(board: Board): void {
    const byId = new Map<number, Piece>()
    for (const pc of board.pieces) byId.set(pc.id, pc)
    const lines = new Map<number, SVGGElement>()
    for (const g of [this.piecesGroup, this.topGroup]) {
      for (const child of g.children) {
        if (child instanceof SVGGElement) lines.set(Number(child.dataset.id), child)
      }
    }
    for (const child of this.headsGroup.children) {
      if (!(child instanceof SVGGElement)) continue
      const id = Number(child.dataset.id)
      const line = lines.get(id)
      const piece = byId.get(id)
      if (line && piece) this.nodes.set(id, { piece, line, head: child })
    }
  }

  private diff(board: Board): void {
    const next = new Map<number, Piece>()
    for (const pc of board.pieces) next.set(pc.id, pc)
    for (const [id, n] of this.nodes) {
      if (next.get(id) !== n.piece) {
        n.line.remove()
        n.head.remove()
        this.nodes.delete(id)
      }
    }
    for (const pc of board.pieces) {
      if (this.nodes.has(pc.id)) continue
      const [line, head] = this.markup(pc, this.view.stroke, null)
      this.piecesGroup.insertAdjacentHTML('beforeend', line)
      this.headsGroup.insertAdjacentHTML('beforeend', head)
      const lineEl = this.piecesGroup.lastElementChild
      const headEl = this.headsGroup.lastElementChild
      if (lineEl instanceof SVGGElement && headEl instanceof SVGGElement) {
        this.nodes.set(pc.id, { piece: pc, line: lineEl, head: headEl })
      }
    }
  }
}

// DIRS is used by the animations of the next task; keep the import live.
export const DIRECTIONS = DIRS
