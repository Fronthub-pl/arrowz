import { defaultParams, DIRS, generate } from '@arrowz/engine'
import type { Board, SessionSnapshot } from '@arrowz/engine'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { ArrowzBoard } from './arrowz-board.ts'
import { EXIT_MAX_MS } from './track.ts'
import { SHAKE_MS } from './view.ts'
import './mod.ts'

function makeBoard(seed = 7): Board {
  return generate({ ...defaultParams(), W: 30, H: 30, seed }).board
}

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

/**
 * The rides are real animations, so a test that looks at the board after one
 * has to outwait it. The waits are tied to the two durations rather than
 * guessed: a flat 700 ms left an exit capped at EXIT_MAX_MS only 100 ms of
 * slack, and a machine running the whole workspace's tests at once ate it.
 */
const exited = () => new Promise<void>((r) => setTimeout(r, EXIT_MAX_MS + 400))
const bounced = () => new Promise<void>((r) => setTimeout(r, SHAKE_MS + 400))

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

function canvasOf(e: ArrowzBoard): HTMLCanvasElement {
  const canvas = e.shadowRoot?.querySelector('canvas')
  if (!canvas) throw new Error('no canvas in the shadow root')
  return canvas
}

/** Clicks the centre of the head cell of a piece the way a mouse would. */
function clickPiece(e: ArrowzBoard, pieceId: number): void {
  const vp = e.viewport
  const head = e.board?.pieces.find((p) => p.id === pieceId)?.cells[0]
  if (!vp || !head) throw new Error('need a viewport and a piece')
  const r = canvasOf(e).getBoundingClientRect()
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
  const canvas = canvasOf(e)
  canvas.dispatchEvent(new PointerEvent('pointerdown', init))
  canvas.dispatchEvent(new PointerEvent('pointerup', init))
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
    await exited()
    expect(seen).toEqual([{ pieceId: free, left: board.pieces.length - 1 }])
    // The piece has ridden off the board, so the layer has stopped drawing it.
    expect(el.pieceCount).toBe(board.pieces.length - 1)
  })

  test('a click on a blocked piece keeps it, and costs a life every time', async () => {
    const board = makeBoard()
    const { blocked, blocker } = verdicts(board)
    await mount({ play: '' }, board)
    const seen: Array<{ pieceId: number; blockerId: number }> = []
    el.addEventListener('life-lost', (e) => seen.push({ pieceId: e.detail.pieceId, blockerId: e.detail.blockerId }))
    clickPiece(el, blocked)
    await bounced()
    clickPiece(el, blocked)
    await bounced()
    expect(seen).toEqual([{ pieceId: blocked, blockerId: blocker }, { pieceId: blocked, blockerId: blocker }])
    // A bounce is a ride that comes back: every piece is still drawn.
    expect(el.pieceCount).toBe(board.pieces.length)
  })

  test('a cell vacated by a removed piece is no longer a piece', async () => {
    const board = makeBoard()
    const { free } = verdicts(board)
    await mount({ play: '' }, board)
    const removed: number[] = []
    el.addEventListener('piece-removed', (e) => removed.push(e.detail.pieceId))
    clickPiece(el, free)
    await exited()
    clickPiece(el, free) // the same screen point, now empty paper
    await bounced()
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
    await bounced()
    expect(clicks).toEqual([free])
    expect(removals).toEqual([])
    expect(el.pieceCount).toBe(board.pieces.length)
  })

  test('a rebuild mid-ride resolves the ride instead of hanging the game', async () => {
    // A two-piece board built by hand: both point off the edge, so the
    // second click rides out the last piece on the board.
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
    const finished: number[] = []
    el.addEventListener('finished', (e) => finished.push(e.detail.pieces))
    clickPiece(el, 0)
    await exited() // the first ride settles
    clickPiece(el, 1) // the last piece: this ride is the one that wins the game
    await raf() // the ride has started
    const rebuilt = makeBoard()
    el.board = rebuilt // a rebuild cancels it
    await el.updateComplete
    await exited()
    // The cancelled last ride resolved rather than hanging: `finished` still
    // arrives, reporting the piece count of the board it belonged to.
    expect(finished).toEqual([2])
    const { free } = verdicts(el.board ?? rebuilt)
    const removed: number[] = []
    el.addEventListener('piece-removed', (e) => removed.push(e.detail.pieceId))
    clickPiece(el, free)
    await exited()
    expect(removed).toEqual([free])
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
    await exited()
    clickPiece(el, 1)
    await exited()
    expect(order).toEqual(['removed', 'removed', 'finished:2'])
  })
})

describe('saving and restoring', () => {
  test('loadState before a board is set throws', () => {
    el = document.createElement('arrowz-board')
    document.body.append(el)
    const snap: SessionSnapshot = {
      v: 1,
      board: { W: 1, H: 1, pieces: 0, fingerprint: 'x' },
      removed: [],
      colored: false,
    }
    expect(() => el.loadState(snap)).toThrow(/no board/)
  })

  // Regression guard for the element lagging Lit's asynchronous `updated()`
  // by one microtask: `board` is a plain property, so nothing schedules the
  // session's rebuild until Lit gets around to it. `saveState`, `loadState`
  // and `restart` must reconcile the session themselves instead of trusting
  // that a render has already happened.
  test('a board and a loadState assigned back to back, with no await in between, land on the right session', async () => {
    const board = makeBoard()
    const { free } = verdicts(board)
    await mount({ play: '' }, board)
    clickPiece(el, free)
    await exited()
    const snap = el.saveState()
    expect(snap?.removed).toEqual([free])

    const fresh = document.createElement('arrowz-board')
    fresh.style.width = '300px'
    fresh.style.height = '300px'
    fresh.setAttribute('play', '')
    document.body.append(fresh)
    // No await between these two: `updated()` has not run yet.
    fresh.board = board
    if (snap) fresh.loadState(snap)
    await fresh.updateComplete
    await raf()
    expect(fresh.pieceCount).toBe(board.pieces.length - 1)
    fresh.remove()
  })

  test('saveState right after assigning a board reflects that board, not a stale one', () => {
    const board = makeBoard()
    const fresh = document.createElement('arrowz-board')
    document.body.append(fresh)
    fresh.board = board
    const snap = fresh.saveState()
    expect(snap).not.toBeNull()
    expect(snap?.board.W).toBe(board.W)
    expect(snap?.board.pieces).toBe(board.pieces.length)
    expect(snap?.removed).toEqual([])
    fresh.remove()
  })

  test('a restored board is drawn without the pieces that left', async () => {
    const board = makeBoard()
    const { free } = verdicts(board)
    await mount({ play: '' }, board)
    clickPiece(el, free)
    await exited()
    const snap = el.saveState()
    expect(snap?.removed).toEqual([free])

    const fresh = await mount({ play: '' }, board)
    expect(fresh.pieceCount).toBe(board.pieces.length)
    if (snap) fresh.loadState(snap)
    await fresh.updateComplete
    // The restored board omits the piece that had left, so it is drawn one short.
    expect(fresh.pieceCount).toBe(board.pieces.length - 1)
  })

  test('a snapshot from another board is refused', async () => {
    await mount({ play: '' }, makeBoard(1))
    const snap = el.saveState()
    const other = await mount({ play: '' }, makeBoard(2))
    expect(() => {
      if (snap) other.loadState(snap)
    }).toThrow(/fingerprint|pieces|board/)
  })

  test('restart puts every piece back', async () => {
    const board = makeBoard()
    const { free } = verdicts(board)
    await mount({ play: '' }, board)
    clickPiece(el, free)
    await exited()
    el.restart()
    await el.updateComplete
    expect(el.pieceCount).toBe(board.pieces.length)
    expect(el.saveState()?.removed).toEqual([])
  })
})

describe('colours', () => {
  const colourButton = (e: ArrowzBoard): HTMLButtonElement | null =>
    e.shadowRoot?.querySelector<HTMLButtonElement>('button.colors') ?? null

  test('without the permission there is no button and no colour', async () => {
    // The same board and the same `view.colored: true`, mounted once without
    // the permission and once with it. Which hue a piece is drawn in belongs
    // to the tesselator and its own test; what this asserts is the verdict
    // the element reaches and hands both the layer and the snapshot, so a
    // bypassed permission and a `colored` getter regressed to always-false
    // are both caught.
    const board = makeBoard()
    expect(board.pieces[0]).toBeTruthy()

    await mount({ play: '' }, board)
    el.view = { colored: true }
    await el.updateComplete
    expect(colourButton(el)).toBeNull()
    expect(el.saveState()?.colored).toBe(false)

    const withPermission = await mount({ 'enable-colors': '', play: '' }, board)
    withPermission.view = { colored: true }
    await withPermission.updateComplete
    expect(withPermission.saveState()?.colored).toBe(true)
  })

  test('with the permission the button paints the board and its label follows lang', async () => {
    await mount({ 'enable-colors': '', lang: 'pl' })
    const button = colourButton(el)
    expect(button?.getAttribute('aria-label')).toBe('Kolory figur')
    expect(button?.getAttribute('aria-pressed')).toBe('false')
    expect(el.saveState()?.colored).toBe(false)
    button?.click()
    await el.updateComplete
    expect(el.saveState()?.colored).toBe(true)
    expect(colourButton(el)?.getAttribute('aria-pressed')).toBe('true')
  })

  test('a board may arrive coloured, and the choice travels in the snapshot', async () => {
    await mount({ 'enable-colors': '', play: '' })
    el.view = { colored: true }
    await el.updateComplete
    expect(el.saveState()?.colored).toBe(true)
    colourButton(el)?.click()
    await el.updateComplete
    expect(el.saveState()?.colored).toBe(false)

    const snap = el.saveState()
    const fresh = await mount({ 'enable-colors': '', play: '' }, el.board ?? makeBoard())
    if (snap) fresh.loadState({ ...snap, colored: true })
    await fresh.updateComplete
    expect(colourButton(fresh)?.getAttribute('aria-pressed')).toBe('true')
  })
})
