// The board as SVG nodes, built imperatively: one string per group inserted
// in one go, then a map from piece id to its two groups (line and head), so
// a click, an animation or a board update touches one piece, never the
// tree. No Lit template ever sees these nodes: on Insane there are ~86 000
// pieces, and a template diff over them would cost more than the change.
import { DIRS, pieceShape, voidStrips } from '@arrowz/engine'
import type { Board, Piece } from '@arrowz/engine'
import { exitDistance, exitMs, shakeShift, trackLine, trackPoint } from './track.ts'

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

/** One clip per layer: two boards on a page must not share the shape they clip to. */
let nextClipId = 0

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

/** The three shapes a ride moves: the line, the arrowhead and the tail rounding. */
interface PieceShapes {
  line: SVGPolylineElement
  head: SVGPolygonElement
  tail: SVGCircleElement
}

/**
 * The shapes inside a piece's two groups. The tail rounding lives in the head
 * group because that group is the filled one, but it belongs to the line and
 * rides the track with it, so a ride reaches all three separately and never
 * moves a whole group.
 */
function shapesOf(id: number, n: PieceNodes): PieceShapes {
  const line = n.line.querySelector('polyline')
  const head = n.head.querySelector('polygon')
  const tail = n.head.querySelector('circle')
  if (
    !(line instanceof SVGPolylineElement) || !(head instanceof SVGPolygonElement) ||
    !(tail instanceof SVGCircleElement)
  ) {
    throw new Error(`svg-layer: piece ${id} is missing a shape to ride`)
  }
  return { line, head, tail }
}

/**
 * How far behind the head centre a piece's line begins, in cells. The line
 * stops short of the centre so the arrowhead swallows its end (see
 * `pieceShape`), and how far depends on the stroke width of that very piece,
 * so it is measured off the drawn shape rather than worked out again here.
 */
function frontArc(piece: Piece, line: SVGPolylineElement, dir: number): number {
  const { dx, dy } = at(DIRS, dir)
  const head = at(piece.cells, 0)
  const p = line.points.getItem(0)
  return -((p.x - (head.x + 0.5)) * dx + (p.y - (head.y + 0.5)) * dy)
}

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
  private readonly clipRect: SVGRectElement
  private readonly clipUrl: string
  private readonly voidsGroup: SVGGElement
  private readonly piecesGroup: SVGGElement
  private readonly topGroup: SVGGElement
  private readonly headsGroup: SVGGElement
  private nodes = new Map<number, PieceNodes>()
  private running = new Map<number, Animation[]>()
  private exiting = new Map<number, Animation[]>()
  /** How to put a riding piece back where it started, one entry per ride. */
  private resting = new Map<number, () => void>()
  private current: Board | null = null
  private padCells = 0
  private view: BoardView = DEFAULT_VIEW

  constructor() {
    this.svg = svgEl('svg', { xmlns: SVG_NS, preserveAspectRatio: 'xMidYMid meet' })
    this.paper = svgEl('rect', { class: 'paper', x: '0', y: '0', width: '0', height: '0' })
    const clipId = `arrowz-board-paper-${nextClipId++}`
    this.clipUrl = `url(#${clipId})`
    this.clipRect = svgEl('rect', { x: '0', y: '0', width: '0', height: '0' })
    const clip = svgEl('clipPath', { id: clipId })
    clip.append(this.clipRect)
    const defs = svgEl('defs')
    defs.append(clip)
    this.voidsGroup = svgEl('g', { class: 'voids', 'fill-opacity': '.22' })
    this.piecesGroup = svgEl('g', {
      class: 'pieces',
      fill: 'none',
      'stroke-linecap': 'butt',
      'stroke-linejoin': 'round',
    })
    this.topGroup = svgEl('g', { class: 'top', fill: 'none', 'stroke-linecap': 'butt', 'stroke-linejoin': 'round' })
    this.headsGroup = svgEl('g', { class: 'heads' })
    this.svg.append(defs, this.paper, this.voidsGroup, this.piecesGroup, this.topGroup, this.headsGroup)
  }

  get board(): Board | null {
    return this.current
  }

  /**
   * The margin drawn around the cells, in cells. It widens the paper, so an
   * arrowhead in an edge cell does not end flush against it, and it is what a
   * riding piece is clipped to, so a piece leaves at the paper's edge.
   */
  get pad(): number {
    return this.padCells
  }

  set pad(cells: number) {
    if (cells === this.padCells) return
    this.padCells = cells
    this.drawPaper(this.current)
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
   * Drives the piece down its own track, `shift(progress)` cells at a time,
   * and registers the ride so a later one can cancel it.
   *
   * The clock is a Web Animation over nothing at all: it gives the ride a
   * `finished` promise and a `cancel()`, so everything built on those keeps
   * working, while the drawing happens per frame. It has to, because a piece
   * on a bent track does not move as one — its line bends through the corners
   * while the head runs straight out — and no interpolated transform can do
   * that. Head, line and tail read the same clock, so they cannot drift apart.
   */
  private ride(
    id: number,
    n: PieceNodes,
    dir: number,
    duration: number,
    shift: (p: number) => number,
  ): { anims: Animation[]; done: Promise<boolean> } {
    const s = shapesOf(id, n)
    const { dx, dy } = at(DIRS, dir)
    const front = frontArc(n.piece, s.line, dir)
    const last = n.piece.cells.length - 1
    // Taken while the piece is at rest, which it always is here: a ride that
    // is cancelled puts the shapes back before the next one starts.
    const rest = {
      points: s.line.getAttribute('points') ?? '',
      cx: s.tail.getAttribute('cx') ?? '0',
      cy: s.tail.getAttribute('cy') ?? '0',
    }
    // Only a riding piece is clipped: a clip over the whole board would cost a
    // paint pass on every frame of a pan, and 86 000 resting pieces are inside
    // the paper anyway.
    const unclip = (): void => {
      n.line.removeAttribute('clip-path')
      n.head.removeAttribute('clip-path')
    }
    const restore = (): void => {
      s.line.setAttribute('points', rest.points)
      s.tail.setAttribute('cx', rest.cx)
      s.tail.setAttribute('cy', rest.cy)
      s.head.removeAttribute('transform')
      unclip()
    }
    const draw = (shifted: number): void => {
      s.line.setAttribute('points', trackLine(n.piece.cells, dir, front, shifted).map(pt).join(' '))
      const [tx, ty] = trackPoint(n.piece.cells, dir, last - shifted)
      s.tail.setAttribute('cx', String(tx))
      s.tail.setAttribute('cy', String(ty))
      s.head.setAttribute('transform', `translate(${dx * shifted} ${dy * shifted})`)
    }
    const clock = new Animation(new KeyframeEffect(null, null, { duration, fill: 'forwards' }), document.timeline)
    const anims = [clock]
    const tick = (): void => {
      // Cancelled rides stop here; the last frame of a finished one is not
      // drawn by the loop but by `done`, so that a caller awaiting the ride
      // never sees the piece a frame short of where the ride leaves it.
      if (clock.playState !== 'running') return
      const p = clock.effect?.getComputedTiming().progress
      draw(shift(typeof p === 'number' ? p : 0))
      requestAnimationFrame(tick)
    }
    n.line.setAttribute('clip-path', this.clipUrl)
    n.head.setAttribute('clip-path', this.clipUrl)
    this.running.set(id, anims)
    this.resting.set(id, restore)
    clock.play()
    requestAnimationFrame(tick)
    const done = this.settle(id, anims).then((finished) => {
      // A ride that ends where it started is put back rather than drawn, so
      // rounding cannot leave the piece a hair off its resting shape.
      if (finished) {
        const shifted = shift(1)
        if (shifted === 0) restore()
        else draw(shifted)
        unclip()
      }
      return finished
    })
    return { anims, done }
  }

  /**
   * Rides the piece off the board head first and removes its nodes. The head
   * runs straight out along `dir`, every other cell passes through the place
   * of the one ahead of it, and the ride is long enough for the tail to clear
   * the edge too.
   */
  animateExit(id: number, dir: number): Promise<void> {
    const n = this.nodes.get(id)
    const board = this.current
    if (!n || !board) return Promise.resolve()
    // Resolved before anything is marked or cancelled: a bad `dir` throws here
    // and leaves the piece exactly as it was.
    const distance = exitDistance(n.piece.cells, dir, board.W, board.H)
    this.cancelRunning(id)
    const duration = reducedMotion() ? 0 : exitMs(distance)
    const { anims, done } = this.ride(id, n, dir, duration, (p) => p * distance)
    this.exiting.set(id, anims)
    return done.then((finished) => {
      if (!finished) return
      n.line.remove()
      n.head.remove()
      this.nodes.delete(id)
      this.resting.delete(id)
    }).finally(() => {
      // Only the exit that owns the mark may clear it: a superseding exit has
      // already replaced the entry, and its piece is still on its way out.
      if (this.exiting.get(id) === anims) this.exiting.delete(id)
    })
  }

  /** Nudges the piece `distance` cells down its own track and back. */
  shake(id: number, distance: number): Promise<void> {
    const n = this.nodes.get(id)
    if (!n) return Promise.resolve()
    const dir = n.piece.dir
    this.cancelRunning(id)
    const duration = reducedMotion() ? 0 : SHAKE_MS
    return this.ride(id, n, dir, duration, (p) => shakeShift(p, distance)).done.then((finished) => {
      if (finished) this.resting.delete(id)
    })
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

  /**
   * Stops the ride of a piece and puts its shapes back at once. Putting them
   * back here rather than in the cancelled ride's next frame is what lets the
   * ride that follows read the resting shape it needs to measure from.
   */
  private cancelRunning(id: number): void {
    const anims = this.running.get(id)
    const restore = this.resting.get(id)
    this.running.delete(id)
    this.resting.delete(id)
    if (anims) { for (const a of anims) a.cancel() }
    if (restore) restore()
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
    this.drawPaper(board)
    this.drawVoids(board)
  }

  /** Sizes the paper and the shape a riding piece is clipped to: the cells plus the margin. */
  private drawPaper(board: Board | null): void {
    const p = board === null ? 0 : this.padCells
    const box = {
      x: String(-p),
      y: String(-p),
      width: String(board === null ? 0 : board.W + 2 * p),
      height: String(board === null ? 0 : board.H + 2 * p),
    }
    for (const [k, v] of Object.entries(box)) {
      this.paper.setAttribute(k, v)
      this.clipRect.setAttribute(k, v)
    }
  }

  private clear(): void {
    // A cleared layer draws nothing at all: leaving the paper at the old size
    // would keep a coloured rectangle of the previous board on screen.
    this.drawPaper(null)
    this.piecesGroup.replaceChildren()
    this.topGroup.replaceChildren()
    this.headsGroup.replaceChildren()
    this.voidsGroup.replaceChildren()
    for (const id of [...this.running.keys()]) this.cancelRunning(id)
    this.exiting.clear()
    this.resting.clear()
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
