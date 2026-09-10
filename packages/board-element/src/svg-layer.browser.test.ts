import { defaultParams, generate } from '@arrowz/engine'
import type { Board, Piece } from '@arrowz/engine'
import { beforeEach, describe, expect, test } from 'vitest'
import { DEFAULT_VIEW, hueOf, SvgLayer } from './svg-layer.ts'

function board(seed = 7, extra: Partial<Board> = {}): Board {
  const r = generate({ ...defaultParams(), W: 30, H: 30, seed })
  return { ...r.board, ...extra }
}

/** Head at (5,5) facing right, one cell left, then two down: a corner right behind the head. */
const BENT: Piece = { id: 424242, dir: 1, cells: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 4, y: 7 }] }

function bentBoard(): Board {
  return board(7, { pieces: [BENT] })
}

const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()))

let layer: SvgLayer
beforeEach(() => {
  document.body.innerHTML = ''
  layer = new SvgLayer()
  document.body.append(layer.svg)
})

/**
 * A point of an element in board units, every transform on the way included.
 * The assertions go through this rather than through attributes, so a piece
 * moved by a group transform is measured the same as one moved by its points.
 */
function world(el: SVGGraphicsElement, x: number, y: number): { x: number; y: number } {
  const root = layer.svg.getScreenCTM()
  const own = el.getScreenCTM()
  if (!root || !own) throw new Error('the layer is not rendered')
  const p = new DOMPoint(x, y).matrixTransform(own).matrixTransform(root.inverse())
  return { x: p.x, y: p.y }
}

function nodes(id: number): { line: SVGGElement; head: SVGGElement } {
  const n = layer.nodesOf(id)
  if (!n) throw new Error(`piece ${id} is not on the board`)
  return n
}

/** Where the tip of the arrowhead is. */
function tipOf(id: number): { x: number; y: number } {
  const poly = nodes(id).head.querySelector('polygon')
  if (!(poly instanceof SVGPolygonElement)) throw new Error('no head polygon')
  const tip = poly.points.getItem(0)
  return world(poly, tip.x, tip.y)
}

/** Where the rounding at the end of the line is. */
function tailOf(id: number): { x: number; y: number } {
  const c = nodes(id).head.querySelector('circle')
  if (!(c instanceof SVGCircleElement)) throw new Error('no tail circle')
  return world(c, c.cx.baseVal.value, c.cy.baseVal.value)
}

function linePoints(id: number): { x: number; y: number }[] {
  const poly = nodes(id).line.querySelector('polyline')
  if (!(poly instanceof SVGPolylineElement)) throw new Error('no line polyline')
  const out: { x: number; y: number }[] = []
  for (let i = 0; i < poly.points.numberOfItems; i++) {
    const p = poly.points.getItem(i)
    out.push(world(poly, p.x, p.y))
  }
  return out
}

/** Everything a ride moves, so a before and after can be compared in one go. */
function poseOf(id: number): { tip: { x: number; y: number }; tail: { x: number; y: number }; line: string } {
  const poly = nodes(id).line.querySelector('polyline')
  return { tip: tipOf(id), tail: tailOf(id), line: poly?.getAttribute('points') ?? '' }
}

/**
 * Runs frames until the head has covered `cells`, so what follows measures a
 * piece in mid-ride. Sampling a fixed number of frames would sometimes land
 * before the first tick and pass on a piece that had not moved at all.
 */
async function ridden(id: number, cells = 0.2): Promise<void> {
  const start = tipOf(id)
  for (let i = 0; i < 60; i++) {
    await frame()
    const now = tipOf(id)
    if (Math.hypot(now.x - start.x, now.y - start.y) >= cells) return
  }
  throw new Error(`piece ${id} never rode`)
}

/** The track of BENT: up the column x = 4.5, then right along the row y = 5.5 and out. */
function expectOnTrack(p: { x: number; y: number }): void {
  const onColumn = Math.abs(p.x - 4.5) < 1e-6 && p.y >= 5.5 - 1e-6 && p.y <= 7.5 + 1e-6
  const onRow = Math.abs(p.y - 5.5) < 1e-6 && p.x >= 4.5 - 1e-6
  expect(onColumn || onRow, `(${p.x}, ${p.y}) is off the track`).toBe(true)
}

describe('build', () => {
  test('draws every piece as a line group and a head group', () => {
    const b = board()
    layer.setBoard(b, DEFAULT_VIEW)
    expect(layer.pieceCount).toBe(b.pieces.length)
    expect(layer.svg.querySelectorAll('g.pieces > g[data-id]').length).toBe(b.pieces.length)
    expect(layer.svg.querySelectorAll('g.heads > g[data-id]').length).toBe(b.pieces.length)
    expect(layer.svg.querySelectorAll('g.heads polygon').length).toBe(b.pieces.length)
    expect(layer.svg.querySelectorAll('g.heads circle').length).toBe(b.pieces.length)
    const paper = layer.svg.querySelector('rect.paper')
    expect(paper?.getAttribute('width')).toBe('30')
    expect(paper?.getAttribute('height')).toBe('30')
    expect(paper?.getAttribute('fill')).toBe('#f6f6fa')
  })

  test('a monochrome board carries no per-piece colour attributes', () => {
    layer.setBoard(board(), DEFAULT_VIEW)
    expect(layer.svg.querySelectorAll('g.pieces [stroke]').length).toBe(0)
    expect(layer.svg.querySelectorAll('g.heads [fill]').length).toBe(0)
    expect(layer.svg.querySelector('g.pieces')?.getAttribute('stroke-width')).toBe('0.5')
  })

  test('colored and top set per-piece colours and put the longest on top', () => {
    const b = board()
    layer.setBoard(b, { ...DEFAULT_VIEW, colored: true, top: 3 })
    expect(layer.svg.querySelectorAll('g.top > g[data-id]').length).toBe(3)
    expect(layer.svg.querySelectorAll('g.pieces > g[data-id]').length).toBe(b.pieces.length - 3)
    expect(layer.svg.querySelectorAll('g.pieces > g[data-id][stroke]').length).toBe(b.pieces.length - 3)
    expect(layer.svg.querySelector('g.top')?.getAttribute('stroke-width')).toBe('0.75') // 0.5 * 1.5
    const longest = [...b.pieces].sort((a, c) => c.cells.length - a.cells.length)[0]
    expect(layer.svg.querySelector(`g.top > g[data-id="${longest?.id}"]`)).not.toBeNull()
  })

  test('voids draws the empty cells as strips only when asked', () => {
    const b = board()
    const owner = new Int32Array(b.owner)
    owner[0] = -1
    owner[1] = -1
    const jammed = { ...b, owner }
    layer.setBoard(jammed, DEFAULT_VIEW)
    expect(layer.svg.querySelectorAll('g.voids rect').length).toBe(0)
    layer.setBoard(jammed, { ...DEFAULT_VIEW, voids: true })
    const strip = layer.svg.querySelector('g.voids rect')
    expect(strip?.getAttribute('x')).toBe('0')
    expect(strip?.getAttribute('width')).toBe('2')
  })

  test('the geometry is in cells: the head tip of a right-facing piece is 0.98 past the cell start', () => {
    const b = board()
    layer.setBoard(b, DEFAULT_VIEW)
    const pc = b.pieces.find((p) => p.dir === 1)
    expect(pc).toBeDefined()
    if (!pc) return
    const head = pc.cells[0]
    const polygon = layer.nodesOf(pc.id)?.head.querySelector('polygon')
    const tip = polygon?.getAttribute('points')?.split(' ')[0]?.split(',').map(Number)
    expect(tip?.[0]).toBeCloseTo((head?.x ?? 0) + 0.5 + 0.48, 9)
    expect(tip?.[1]).toBeCloseTo((head?.y ?? 0) + 0.5, 9)
  })

  test('setBoard(null) empties the layer and shrinks the paper', () => {
    layer.setBoard(board(), DEFAULT_VIEW)
    layer.setBoard(null, DEFAULT_VIEW)
    expect(layer.pieceCount).toBe(0)
    expect(layer.svg.querySelectorAll('g[data-id]').length).toBe(0)
    expect(layer.svg.querySelector('rect.paper')?.getAttribute('width')).toBe('0')
  })

  test('a colour from the consumer is escaped, not parsed as markup', () => {
    const evil = '"><script>x</script>'
    const b = board()
    // The page carries the test runner's own scripts, so the count is the baseline.
    const before = document.querySelectorAll('script').length
    expect(() => layer.setBoard(b, { ...DEFAULT_VIEW, top: 1, highlight: evil })).not.toThrow()
    expect(layer.svg.querySelectorAll('script').length).toBe(0)
    expect(document.querySelectorAll('script').length).toBe(before)
    const top = layer.svg.querySelector('g.top > g[data-id]')
    expect(top).not.toBeNull()
    expect(top?.getAttribute('stroke')).toBe(evil)
  })
})

describe('diff', () => {
  test('a board minus one piece keeps the other nodes and drops the removed one', () => {
    const b = board()
    layer.setBoard(b, DEFAULT_VIEW)
    const gone = b.pieces[0]
    const kept = b.pieces[1]
    if (!gone || !kept) throw new Error('need two pieces')
    const keptNode = layer.nodesOf(kept.id)?.line
    const owner = new Int32Array(b.owner)
    for (const c of gone.cells) owner[c.y * b.W + c.x] = -1
    layer.setBoard({ ...b, owner, pieces: b.pieces.slice(1) }, DEFAULT_VIEW)
    expect(layer.pieceCount).toBe(b.pieces.length - 1)
    expect(layer.hasPiece(gone.id)).toBe(false)
    expect(layer.nodesOf(kept.id)?.line).toBe(keptNode) // the same DOM node
  })

  test('a same-size reseed replaces every node through the diff path', () => {
    const a = board(7)
    layer.setBoard(a, DEFAULT_VIEW)
    const first = a.pieces[0]
    if (!first) throw new Error('need a piece')
    const node = layer.nodesOf(first.id)?.line
    const b = board(8)
    layer.setBoard(b, DEFAULT_VIEW)
    expect(layer.pieceCount).toBe(b.pieces.length)
    expect(layer.nodesOf(first.id)?.line).not.toBe(node)
  })

  test('a same-size reseed leaves no duplicate nodes behind', () => {
    layer.setBoard(board(7), DEFAULT_VIEW)
    const b = board(8)
    layer.setBoard(b, DEFAULT_VIEW)
    expect(layer.svg.querySelectorAll('g.pieces > g[data-id]').length).toBe(b.pieces.length)
    expect(layer.svg.querySelectorAll('g.heads > g[data-id]').length).toBe(b.pieces.length)
  })

  test('a changed view rebuilds every node', () => {
    const b = board()
    layer.setBoard(b, DEFAULT_VIEW)
    const first = b.pieces[0]
    if (!first) throw new Error('need a piece')
    const node = layer.nodesOf(first.id)?.line
    layer.setBoard(b, { ...DEFAULT_VIEW, stroke: 0.3 })
    expect(layer.nodesOf(first.id)?.line).not.toBe(node)
    expect(layer.svg.querySelector('g.pieces')?.getAttribute('stroke-width')).toBe('0.3')
  })
})

describe('animations', () => {
  test('animateExit removes the nodes when it resolves and marks the piece as exiting meanwhile', async () => {
    const b = board()
    layer.setBoard(b, DEFAULT_VIEW)
    const pc = b.pieces[0]
    if (!pc) throw new Error('need a piece')
    const p = layer.animateExit(pc.id, pc.dir)
    expect(layer.isExiting(pc.id)).toBe(true)
    await p
    expect(layer.hasPiece(pc.id)).toBe(false)
    expect(layer.isExiting(pc.id)).toBe(false)
    expect(layer.svg.querySelectorAll(`g[data-id="${pc.id}"]`).length).toBe(0)
  })

  test('shake resolves and keeps the piece', async () => {
    const b = board()
    layer.setBoard(b, DEFAULT_VIEW)
    const pc = b.pieces[0]
    if (!pc) throw new Error('need a piece')
    await layer.shake(pc.id, 0.3)
    expect(layer.hasPiece(pc.id)).toBe(true)
  })

  test('unknown ids resolve without throwing', async () => {
    layer.setBoard(board(), DEFAULT_VIEW)
    await expect(layer.animateExit(999999, 0)).resolves.toBeUndefined()
    await expect(layer.shake(999999, 1)).resolves.toBeUndefined()
  })

  test('a diff that drops the piece cancels a running animation and its promise still resolves', async () => {
    const b = board()
    layer.setBoard(b, DEFAULT_VIEW)
    const pc = b.pieces[0]
    if (!pc) throw new Error('need a piece')
    const p = layer.animateExit(pc.id, pc.dir)
    layer.setBoard(board(8), DEFAULT_VIEW)
    await expect(p).resolves.toBeUndefined()
    expect(layer.isExiting(pc.id)).toBe(false)
  })

  test('a rebuild cancels a running animation and its promise still resolves', async () => {
    const b = board()
    layer.setBoard(b, DEFAULT_VIEW)
    const pc = b.pieces[0]
    if (!pc) throw new Error('need a piece')
    const p = layer.animateExit(pc.id, pc.dir)
    // A changed view is the one thing that forces rebuild(), and so clear().
    layer.setBoard(board(), { ...DEFAULT_VIEW, stroke: 0.3 })
    await expect(p).resolves.toBeUndefined()
    expect(layer.isExiting(pc.id)).toBe(false)
  })

  test('a second exit supersedes the first and the piece stays exiting until the second ends', async () => {
    const b = board()
    layer.setBoard(b, DEFAULT_VIEW)
    const pc = b.pieces[0]
    if (!pc) throw new Error('need a piece')
    const first = layer.animateExit(pc.id, pc.dir)
    const second = layer.animateExit(pc.id, pc.dir)
    expect(layer.isExiting(pc.id)).toBe(true)
    await expect(first).resolves.toBeUndefined()
    expect(layer.isExiting(pc.id)).toBe(true)
    await expect(second).resolves.toBeUndefined()
    expect(layer.hasPiece(pc.id)).toBe(false)
    expect(layer.isExiting(pc.id)).toBe(false)
    expect(layer.svg.querySelectorAll(`g[data-id="${pc.id}"]`).length).toBe(0)
  })

  test('the paper reaches past the cells by the margin', () => {
    layer.pad = 2
    layer.setBoard(board(), DEFAULT_VIEW)
    const paper = layer.svg.querySelector('rect.paper')
    expect(paper?.getAttribute('x')).toBe('-2')
    expect(paper?.getAttribute('y')).toBe('-2')
    expect(paper?.getAttribute('width')).toBe('34')
    expect(paper?.getAttribute('height')).toBe('34')
  })

  test('a riding piece is clipped to the paper, margin included', async () => {
    layer.pad = 2
    layer.setBoard(bentBoard(), DEFAULT_VIEW)
    const shaking = layer.shake(BENT.id, 0.3)
    await ridden(BENT.id, 0.02)
    const n = nodes(BENT.id)
    const clip = n.line.getAttribute('clip-path')
    expect(clip).toBeTruthy()
    expect(n.head.getAttribute('clip-path')).toBe(clip)
    const id = clip?.replace(/^url\(#|\)$/g, '')
    const rect = layer.svg.querySelector(`clipPath[id="${id}"] rect`)
    const paper = layer.svg.querySelector('rect.paper')
    for (const a of ['x', 'y', 'width', 'height']) {
      expect(rect?.getAttribute(a)).toBe(paper?.getAttribute(a))
    }
    await shaking
  })

  test('a piece that has stopped riding carries no clip', async () => {
    layer.pad = 2
    layer.setBoard(bentBoard(), DEFAULT_VIEW)
    await layer.shake(BENT.id, 0.3)
    const n = nodes(BENT.id)
    expect(n.line.getAttribute('clip-path')).toBeNull()
    expect(n.head.getAttribute('clip-path')).toBeNull()
  })

  test('the head rides straight out along the direction it faces', async () => {
    layer.setBoard(bentBoard(), DEFAULT_VIEW)
    const before = tipOf(BENT.id)
    const done = layer.animateExit(BENT.id, BENT.dir)
    await ridden(BENT.id)
    const now = tipOf(BENT.id)
    expect(now.x).toBeGreaterThan(before.x + 1e-6)
    expect(now.y).toBeCloseTo(before.y, 6)
    await done
  })

  test('the tail of a bent piece stays on the track instead of sliding sideways', async () => {
    layer.setBoard(bentBoard(), DEFAULT_VIEW)
    const before = tailOf(BENT.id)
    const done = layer.animateExit(BENT.id, BENT.dir)
    await ridden(BENT.id)
    const now = tailOf(BENT.id)
    expect(now).not.toEqual(before)
    expectOnTrack(now)
    await done
  })

  test('a shake leaves the piece exactly where it found it', async () => {
    layer.setBoard(bentBoard(), DEFAULT_VIEW)
    const before = poseOf(BENT.id)
    await layer.shake(BENT.id, 0.3)
    expect(poseOf(BENT.id)).toEqual(before)
  })

  test('a shake cut short by the next ride hands it a piece at rest', async () => {
    layer.setBoard(bentBoard(), DEFAULT_VIEW)
    const before = poseOf(BENT.id)
    const cut = layer.shake(BENT.id, 0.3)
    await ridden(BENT.id, 0.05)
    // A nudge of nothing: it can only end where the ride before it left the piece.
    await layer.shake(BENT.id, 0)
    expect(poseOf(BENT.id)).toEqual(before)
    await cut
  })

  test('the line keeps the corner while it rides, so it never cuts across it', async () => {
    layer.setBoard(bentBoard(), DEFAULT_VIEW)
    const done = layer.animateExit(BENT.id, BENT.dir)
    await ridden(BENT.id)
    const pts = linePoints(BENT.id)
    for (const p of pts) expectOnTrack(p)
    expect(pts.some((p) => Math.abs(p.x - 4.5) < 1e-6 && Math.abs(p.y - 5.5) < 1e-6)).toBe(true)
    await done
  })
})

describe('colours follow the piece', () => {
  test('the hue of a piece does not change when another piece is removed', async () => {
    const b = board()
    layer.setBoard(b, { ...DEFAULT_VIEW, colored: true })
    const [first, second] = [b.pieces[0], b.pieces[1]]
    expect(first && second).toBeTruthy()
    if (!first || !second) return
    const before = nodes(second.id).line.getAttribute('stroke')
    expect(before).toBe(hueOf(second.id))

    await layer.animateExit(first.id, first.dir)
    // A removal touches nodes, not the tree: the survivor keeps its colour.
    expect(nodes(second.id).line.getAttribute('stroke')).toBe(before)

    // And a redraw of the same view keeps it too, because the hue is the id's.
    layer.setBoard(b, { ...DEFAULT_VIEW, colored: true })
    expect(nodes(second.id).line.getAttribute('stroke')).toBe(before)
  })

  test('a coloured board diffs by piece identity instead of rebuilding', () => {
    const b = board()
    layer.setBoard(b, { ...DEFAULT_VIEW, colored: true })
    const kept = b.pieces[2]
    expect(kept).toBeTruthy()
    if (!kept) return
    const node = nodes(kept.id).line
    layer.setBoard(b, { ...DEFAULT_VIEW, colored: true })
    // The same node object: a rebuild would have replaced it.
    expect(nodes(kept.id).line).toBe(node)
  })
})
