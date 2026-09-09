import { defaultParams, generate } from '@arrowz/engine'
import type { Board } from '@arrowz/engine'
import { beforeEach, describe, expect, test } from 'vitest'
import { DEFAULT_VIEW, SvgLayer } from './svg-layer.ts'

function board(seed = 7, extra: Partial<Board> = {}): Board {
  const r = generate({ ...defaultParams(), W: 30, H: 30, seed })
  return { ...r.board, ...extra }
}

let layer: SvgLayer
beforeEach(() => {
  document.body.innerHTML = ''
  layer = new SvgLayer()
  document.body.append(layer.svg)
})

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

  test('setBoard(null) empties the layer', () => {
    layer.setBoard(board(), DEFAULT_VIEW)
    layer.setBoard(null, DEFAULT_VIEW)
    expect(layer.pieceCount).toBe(0)
    expect(layer.svg.querySelectorAll('g[data-id]').length).toBe(0)
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

  test('the exit slides the head past the edge it faces, plus the length of the piece', async () => {
    const b = board()
    layer.setBoard(b, DEFAULT_VIEW)
    const pc = b.pieces.find((p) => p.dir === 1)
    const head = pc?.cells[0]
    const line = pc ? layer.nodesOf(pc.id)?.line : null
    if (!pc || !head || !line) throw new Error('need a right-facing piece')
    const done = layer.animateExit(pc.id, pc.dir)
    const effect = line.getAnimations()[0]?.effect
    if (!(effect instanceof KeyframeEffect)) throw new Error('need a keyframe effect')
    const last = effect.getKeyframes().at(-1)
    const transform = typeof last?.transform === 'string' ? last.transform : ''
    // Chromium is free to normalise the keyframe string, so the assertion goes
    // through the parsed matrix rather than through the text.
    const m = new DOMMatrixReadOnly(transform)
    expect(m.e).toBeCloseTo(b.W - head.x + pc.cells.length + 1, 9)
    expect(m.f).toBeCloseTo(0, 9)
    expect(Number(last?.opacity)).toBe(0)
    await done
  })
})
