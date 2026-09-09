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

export const EXIT_MS = 320
export const SHAKE_MS = 230

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

function at<T>(arr: ArrayLike<T>, i: number): T {
  const v = arr[i]
  if (v === undefined) throw new RangeError(`index ${i} out of ${arr.length}`)
  return v
}

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

/**
 * Escapes a string on its way into an attribute of the markup that `markup()`
 * hands to `innerHTML`. The colours come from the consumer (`view.highlight`
 * and friends), so without this a value like `"><script>` would close the
 * attribute and inject nodes.
 */
function attr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export class SvgLayer {
  readonly svg: SVGSVGElement
  private readonly paper: SVGRectElement
  private readonly voidsGroup: SVGGElement
  private readonly piecesGroup: SVGGElement
  private readonly topGroup: SVGGElement
  private readonly headsGroup: SVGGElement
  private nodes = new Map<number, PieceNodes>()
  private running = new Map<number, Animation[]>()
  private exiting = new Map<number, Animation[]>()
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

  isExiting(id: number): boolean {
    return this.exiting.has(id)
  }

  /**
   * Slides the piece off the board along `dir` while fading, then removes
   * its nodes. The distance is what it takes to clear the board edge from the
   * head plus the piece's own length, so no tail is left behind. On SVG
   * elements a CSS px in translate() is one user unit, that is one cell.
   */
  animateExit(id: number, dir: number): Promise<void> {
    const n = this.nodes.get(id)
    const board = this.current
    if (!n || !board) return Promise.resolve()
    // Resolved before anything is marked or cancelled: a bad `dir` throws here
    // and leaves the piece exactly as it was.
    const { dx, dy } = at(DIRS, dir)
    const head = at(n.piece.cells, 0)
    this.cancelRunning(id)
    const toEdge = dx > 0 ? board.W - head.x : dx < 0 ? head.x + 1 : dy > 0 ? board.H - head.y : head.y + 1
    const distance = toEdge + n.piece.cells.length + 1
    const keyframes: Keyframe[] = [
      { transform: 'translate(0px, 0px)', opacity: 1 },
      { transform: `translate(${dx * distance}px, ${dy * distance}px)`, opacity: 0 },
    ]
    const duration = reducedMotion() ? 0 : EXIT_MS
    const anims = [n.line, n.head].map((el) => el.animate(keyframes, { duration, easing: 'ease-in', fill: 'forwards' }))
    this.running.set(id, anims)
    this.exiting.set(id, anims)
    return this.settle(id, anims).then((finished) => {
      if (!finished) return
      n.line.remove()
      n.head.remove()
      this.nodes.delete(id)
    }).finally(() => {
      // Only the exit that owns the mark may clear it: a superseding exit has
      // already replaced the entry, and its piece is still on its way out.
      if (this.exiting.get(id) === anims) this.exiting.delete(id)
    })
  }

  /** Nudges the piece `distance` cells along its own direction and back. */
  shake(id: number, distance: number): Promise<void> {
    const n = this.nodes.get(id)
    if (!n) return Promise.resolve()
    this.cancelRunning(id)
    const { dx, dy } = at(DIRS, n.piece.dir)
    const keyframes: Keyframe[] = [
      { transform: 'translate(0px, 0px)', offset: 0 },
      { transform: `translate(${dx * distance}px, ${dy * distance}px)`, offset: 0.4, easing: 'ease-out' },
      { transform: 'translate(0px, 0px)', offset: 1 },
    ]
    const duration = reducedMotion() ? 0 : SHAKE_MS
    const anims = [n.line, n.head].map((el) => el.animate(keyframes, { duration, easing: 'ease-out' }))
    this.running.set(id, anims)
    return this.settle(id, anims).then(() => undefined)
  }

  /** Resolves true when every animation finished, false when one was cancelled. */
  private settle(id: number, anims: Animation[]): Promise<boolean> {
    return Promise.all(anims.map((a) => a.finished)).then(
      () => {
        if (this.running.get(id) === anims) this.running.delete(id)
        return true
      },
      () => false,
    )
  }

  private cancelRunning(id: number): void {
    const anims = this.running.get(id)
    if (!anims) return
    this.running.delete(id)
    for (const a of anims) a.cancel()
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
    // A cleared layer draws nothing at all: leaving the paper at the old size
    // would keep a coloured rectangle of the previous board on screen.
    this.paper.setAttribute('width', '0')
    this.paper.setAttribute('height', '0')
    this.piecesGroup.replaceChildren()
    this.topGroup.replaceChildren()
    this.headsGroup.replaceChildren()
    this.voidsGroup.replaceChildren()
    for (const id of [...this.running.keys()]) this.cancelRunning(id)
    this.exiting.clear()
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
    // The group carries the highlight too, so a theme with highlight === ink
    // (where markup() emits no per-piece stroke) still draws the top pieces.
    this.topGroup.setAttribute('stroke', v.highlight)
    this.headsGroup.setAttribute('fill', v.ink)
    // Sorting the pieces is only worth it when some of them go on top.
    const longest = v.top > 0
      ? new Set([...board.pieces].sort((a, b) => b.cells.length - a.cells.length).slice(0, v.top).map((p) => p.id))
      : new Set<number>()
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
    const stroke = colour === null ? '' : ` stroke="${attr(colour)}"`
    const fill = colour === null ? '' : ` fill="${attr(colour)}"`
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
        this.cancelRunning(id)
        n.line.remove()
        n.head.remove()
        this.nodes.delete(id)
      }
    }
    const added: Piece[] = []
    const lines: string[] = []
    const heads: string[] = []
    for (const pc of board.pieces) {
      if (this.nodes.has(pc.id)) continue
      const [line, head] = this.markup(pc, this.view.stroke, null)
      added.push(pc)
      lines.push(line)
      heads.push(head)
    }
    if (added.length === 0) return
    // One fragment parse per group, not per piece: a reseed of the same size
    // replaces every piece, and 2N parses would cost more than a rebuild.
    const lineFrom = this.piecesGroup.children.length
    const headFrom = this.headsGroup.children.length
    this.piecesGroup.insertAdjacentHTML('beforeend', lines.join(''))
    this.headsGroup.insertAdjacentHTML('beforeend', heads.join(''))
    this.link(added, lineFrom, headFrom)
  }

  /** Registers the groups just appended, pairing line and head by their id. */
  private link(added: Piece[], lineFrom: number, headFrom: number): void {
    const lines = groupsFrom(this.piecesGroup, lineFrom)
    const heads = groupsFrom(this.headsGroup, headFrom)
    for (const pc of added) {
      const line = lines.get(pc.id)
      const head = heads.get(pc.id)
      // Both nodes come from markup() in the same pass, so a miss would mean
      // the fragment parser dropped one: loud, because a stray node would
      // stay on the board with nothing able to reach it.
      if (!line || !head) throw new Error(`svg-layer: piece ${pc.id} lost its ${line ? 'head' : 'line'} node`)
      this.nodes.set(pc.id, { piece: pc, line, head })
    }
  }
}

/** The `<g data-id>` children of a group from `from` on, by piece id. */
function groupsFrom(parent: SVGGElement, from: number): Map<number, SVGGElement> {
  const found = new Map<number, SVGGElement>()
  for (let i = from; i < parent.children.length; i++) {
    const child = parent.children[i]
    if (child instanceof SVGGElement) found.set(Number(child.dataset.id), child)
  }
  return found
}
