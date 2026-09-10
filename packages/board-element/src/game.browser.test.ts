import { defaultParams, DIRS, generate } from '@arrowz/engine'
import type { Board } from '@arrowz/engine'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { ArrowzBoard } from './arrowz-board.ts'
import './mod.ts'

function makeBoard(seed = 7): Board {
  return generate({ ...defaultParams(), W: 30, H: 30, seed }).board
}

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

let el: ArrowzBoard
async function mount(attrs: Record<string, string> = {}, board = makeBoard()): Promise<ArrowzBoard> {
  el = document.createElement('arrowz-board')
  el.style.width = '300px'
  el.style.height = '300px'
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  document.body.append(el)
  el.board = board
  await el.updateComplete
  await raf()
  await raf()
  return el
}

function svgOf(e: ArrowzBoard): SVGSVGElement {
  const svg = e.shadowRoot?.querySelector('svg')
  if (!svg) throw new Error('no svg in the shadow root')
  return svg
}

/** Clicks the centre of the head cell of a piece the way a mouse would. */
function clickPiece(e: ArrowzBoard, pieceId: number): void {
  const vp = e.viewport
  const head = e.board?.pieces.find((p) => p.id === pieceId)?.cells[0]
  if (!vp || !head) throw new Error('need a viewport and a piece')
  const r = svgOf(e).getBoundingClientRect()
  const x = r.left + (head.x + 0.5 - vp.originX) * vp.cellPx
  const y = r.top + (head.y + 0.5 - vp.originY) * vp.cellPx
  const init = {
    bubbles: true,
    composed: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: x,
    clientY: y,
  }
  const svg = svgOf(e)
  svg.dispatchEvent(new PointerEvent('pointerdown', init))
  svg.dispatchEvent(new PointerEvent('pointerup', init))
}

/**
 * The first piece of the board whose ray reaches the edge, and the first that
 * is blocked. Walked here independently of `game.ts`, so the element's tests
 * do not assume the reducer is right — they only need a piece of each kind.
 */
function verdicts(board: Board): { free: number; blocked: number; blocker: number } {
  let free = -1
  let blocked = -1
  let blocker = -1
  for (const pc of board.pieces) {
    const head = pc.cells[0]
    const d = DIRS[pc.dir]
    if (!head || !d) continue
    let x = head.x + d.dx
    let y = head.y + d.dy
    let hit = -1
    while (x >= 0 && y >= 0 && x < board.W && y < board.H) {
      const owner = board.owner[y * board.W + x] ?? -1
      if (owner >= 0 && owner !== pc.id) {
        hit = owner
        break
      }
      x += d.dx
      y += d.dy
    }
    if (hit < 0 && free < 0) free = pc.id
    if (hit >= 0 && blocked < 0) {
      blocked = pc.id
      blocker = hit
    }
  }
  return { free, blocked, blocker }
}

beforeEach(() => {
  document.body.innerHTML = ''
})
afterEach(() => {
  el?.remove()
})

describe('play', () => {
  test('a click on a free piece removes it and reports what is left', async () => {
    const board = makeBoard()
    const { free } = verdicts(board)
    await mount({ play: '' }, board)
    const seen: Array<{ pieceId: number; left: number }> = []
    el.addEventListener('piece-removed', (e) => seen.push(e.detail))
    clickPiece(el, free)
    await new Promise<void>((r) => setTimeout(r, 700))
    expect(seen).toEqual([{ pieceId: free, left: board.pieces.length - 1 }])
    expect(svgOf(el).querySelector(`g.heads > g[data-id="${free}"]`)).toBeNull()
  })

  test('a click on a blocked piece keeps it, and costs a life every time', async () => {
    const board = makeBoard()
    const { blocked, blocker } = verdicts(board)
    await mount({ play: '' }, board)
    const seen: Array<{ pieceId: number; blockerId: number }> = []
    el.addEventListener('life-lost', (e) => seen.push({ pieceId: e.detail.pieceId, blockerId: e.detail.blockerId }))
    clickPiece(el, blocked)
    await new Promise<void>((r) => setTimeout(r, 400))
    clickPiece(el, blocked)
    await new Promise<void>((r) => setTimeout(r, 400))
    expect(seen).toEqual([{ pieceId: blocked, blockerId: blocker }, { pieceId: blocked, blockerId: blocker }])
    expect(svgOf(el).querySelector(`g.heads > g[data-id="${blocked}"]`)).not.toBeNull()
  })

  test('a cell vacated by a removed piece is no longer a piece', async () => {
    const board = makeBoard()
    const { free } = verdicts(board)
    await mount({ play: '' }, board)
    const removed: number[] = []
    el.addEventListener('piece-removed', (e) => removed.push(e.detail.pieceId))
    clickPiece(el, free)
    await new Promise<void>((r) => setTimeout(r, 700))
    clickPiece(el, free) // the same screen point, now empty paper
    await new Promise<void>((r) => setTimeout(r, 400))
    expect(removed).toEqual([free])
  })

  test('without the attribute a click only reports, and nothing leaves', async () => {
    const board = makeBoard()
    const { free } = verdicts(board)
    await mount({ interactive: '' }, board)
    const clicks: number[] = []
    const removals: number[] = []
    el.addEventListener('piece-click', (e) => clicks.push(e.detail.pieceId))
    el.addEventListener('piece-removed', (e) => removals.push(e.detail.pieceId))
    clickPiece(el, free)
    await new Promise<void>((r) => setTimeout(r, 400))
    expect(clicks).toEqual([free])
    expect(removals).toEqual([])
    expect(svgOf(el).querySelector(`g.heads > g[data-id="${free}"]`)).not.toBeNull()
  })

  test('a board replaced mid-ride leaves no game stuck', async () => {
    const board = makeBoard()
    const { free } = verdicts(board)
    await mount({ play: '' }, board)
    let finished = 0
    el.addEventListener('finished', () => finished++)
    clickPiece(el, free)
    await raf() // the ride has started
    el.board = makeBoard(9) // a rebuild cancels it
    await el.updateComplete
    await new Promise<void>((r) => setTimeout(r, 700))
    // The cancelled ride resolved, the new board plays, and nothing finished.
    expect(finished).toBe(0)
    const next = verdicts(el.board ?? board)
    const removed: number[] = []
    el.addEventListener('piece-removed', (e) => removed.push(e.detail.pieceId))
    clickPiece(el, next.free)
    await new Promise<void>((r) => setTimeout(r, 700))
    expect(removed).toEqual([next.free])
  })

  test('the board is finished when the last piece has ridden out', async () => {
    // A two-piece board built by hand: both point off the edge.
    const board: Board = {
      W: 2,
      H: 2,
      owner: Int32Array.from([0, 1, 0, 1]),
      pieces: [
        { id: 0, cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }], dir: 3 },
        { id: 1, cells: [{ x: 1, y: 0 }, { x: 1, y: 1 }], dir: 1 },
      ],
      stats: { want: 2, got: 2, stall: 0, strandTrunc: 0, strandLoss: 0, n: 2 },
      backtracks: 0,
      remaining: 0,
    }
    await mount({ play: '' }, board)
    const order: string[] = []
    el.addEventListener('piece-removed', () => order.push('removed'))
    el.addEventListener('finished', (e) => order.push(`finished:${e.detail.pieces}`))
    clickPiece(el, 0)
    await new Promise<void>((r) => setTimeout(r, 700))
    clickPiece(el, 1)
    await new Promise<void>((r) => setTimeout(r, 700))
    expect(order).toEqual(['removed', 'removed', 'finished:2'])
  })
})
