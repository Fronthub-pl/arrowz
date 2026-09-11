import { decodeBoard, defaultParams, encodeBoard, generate } from '@arrowz/engine'
import type { Board } from '@arrowz/engine'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  ArrowzBoard,
  DEFAULT_PAD,
  DEFAULT_POINT_COLOR,
  DEFAULT_POINT_RADIUS,
  DEFAULT_SHOW_POINTS,
  GESTURE_STORAGE_KEY,
  ZOOM_STEP,
} from './arrowz-board.ts'
import type { BoardViewport, PieceClickEvent, ViewportChangeEvent } from './arrowz-board.ts'
import './mod.ts'
import { fit, MIN_POINT_CELL_PX, type Viewport, zoomBy } from './viewport.ts'

function makeBoard(seed = 7): Board {
  return generate({ ...defaultParams(), W: 30, H: 30, seed }).board
}

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

/** Cell size of a 30x30 board fitted into the 300 px host of `mount`, margin included. */
const FIT = 300 / (30 + 2 * DEFAULT_PAD)

let el: ArrowzBoard
async function mount(attrs: Record<string, string> = {}): Promise<ArrowzBoard> {
  el = document.createElement('arrowz-board')
  el.style.width = '300px'
  el.style.height = '300px'
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  document.body.append(el)
  el.board = makeBoard()
  await el.updateComplete
  await raf() // the ResizeObserver delivers the host size on its own frame
  await raf()
  return el
}

function canvasOf(e: ArrowzBoard): HTMLCanvasElement {
  const canvas = e.shadowRoot?.querySelector('canvas')
  if (!canvas) throw new Error('no canvas in the shadow root')
  return canvas
}

/** Pixels the board actually covered: the paper is opaque, the page behind it is not. */
function opaque(buf: Uint8Array): number {
  let n = 0
  for (let i = 3; i < buf.length; i += 4) if (buf[i] === 255) n++
  return n
}

/**
 * One frame of the board, read straight off the GPU, in RGBA bytes.
 *
 * The layer draws on a frame it asks for itself and the drawing buffer is
 * gone once that frame has been composited, so the read has to happen on the
 * same frame and after the draw. The nudge asks for the frame — a zoom too
 * small to see, which is all the public API has for saying "draw" — and a
 * callback registered after it runs after the layer's own, frames being run
 * in the order they were asked for.
 *
 * The loop is for the very first frame after a mount, which comes back empty:
 * the buffer is sized on the layer's first draw, and a read of that same
 * frame catches it before anything has landed in it. Every frame after it is
 * the picture.
 */
async function painted(e: ArrowzBoard): Promise<Uint8Array> {
  const canvas = canvasOf(e)
  const gl = canvas.getContext('webgl2')
  if (!gl) throw new Error('no webgl2 context on the board')
  let buf: Uint8Array = new Uint8Array(0)
  for (let i = 0; i < 10; i++) {
    e.zoomBy(1 + 1e-6)
    buf = await new Promise<Uint8Array>((resolve) => {
      requestAnimationFrame(() => {
        const bytes = new Uint8Array(canvas.width * canvas.height * 4)
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
        resolve(bytes)
      })
    })
    if (opaque(buf) > 0) return buf
  }
  return buf
}

/** How many pixels of a painted board are neither the page behind it nor bare paper. */
function inked(buf: Uint8Array): number {
  let n = 0
  for (let i = 0; i < buf.length; i += 4) {
    const [r, g, b, a] = [buf[i] ?? 0, buf[i + 1] ?? 0, buf[i + 2] ?? 0, buf[i + 3] ?? 0]
    if (a === 255 && r < 200 && g < 200 && b < 200) n++
  }
  return n
}

/** The six fields the element reports, taken from a viewport computed here. */
function reported(v: Viewport): BoardViewport {
  const { cellPx, originX, originY, fitted, hostWidth, hostHeight } = v
  return { cellPx, originX, originY, fitted, hostWidth, hostHeight }
}

/** Screen coordinates (relative to the canvas) of the centre of the head cell of a piece. */
function headPoint(e: ArrowzBoard, pieceId: number): { x: number; y: number } {
  const vp = e.viewport
  const pc = e.board?.pieces.find((p) => p.id === pieceId)
  const head = pc?.cells[0]
  if (!vp || !head) throw new Error('need a viewport and a piece')
  return { x: (head.x + 0.5 - vp.originX) * vp.cellPx, y: (head.y + 0.5 - vp.originY) * vp.cellPx }
}

function pointer(type: string, x: number, y: number, init: Partial<PointerEventInit> = {}): PointerEvent {
  const r = canvasOf(el).getBoundingClientRect()
  return new PointerEvent(type, {
    bubbles: true,
    composed: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: r.left + x,
    clientY: r.top + y,
    // A real press and drag hold the primary button; the release has let go of it.
    buttons: type === 'pointerup' ? 0 : 1,
    ...init,
  })
}

/** Mounts in the rule before 2026-09-11: a plain click plays, the modifier pans. */
async function mountClickMode(attrs: Record<string, string> = {}): Promise<ArrowzBoard> {
  localStorage.setItem(GESTURE_STORAGE_KEY, 'click')
  return await mount(attrs)
}

beforeEach(() => {
  document.body.innerHTML = ''
  localStorage.removeItem(GESTURE_STORAGE_KEY)
})
afterEach(() => {
  el?.remove()
})

describe('mount and viewport', () => {
  test('is registered and draws the board fitted to the host', async () => {
    expect(customElements.get('arrowz-board')).toBe(ArrowzBoard)
    await mount()
    const expected = fit({ W: 30, H: 30, hostWidth: 300, hostHeight: 300, pad: DEFAULT_PAD })
    expect(el.viewport).toEqual(reported(expected))
    expect(el.viewport?.cellPx).toBeCloseTo(FIT, 6)
    expect(el.viewport?.fitted).toBe(true)
    expect(canvasOf(el).isConnected).toBe(true)
    expect(el.pieceCount).toBe(el.board?.pieces.length)
  })

  test('zoomBy, fit and the buttons move the viewport and emit viewport-change', async () => {
    await mount()
    const seen: ViewportChangeEvent[] = []
    document.addEventListener('viewport-change', (e) => seen.push(e as ViewportChangeEvent))
    el.zoomBy(2)
    await raf()
    const expected = zoomBy(fit({ W: 30, H: 30, hostWidth: 300, hostHeight: 300, pad: DEFAULT_PAD }), 2)
    expect(el.viewport).toEqual(reported(expected))
    expect(seen.at(-1)?.detail.cellPx).toBeCloseTo(300 / (30 + 2 * DEFAULT_PAD) * 2, 6)
    expect(seen.at(-1)?.detail.fitted).toBe(false)
    const buttons = el.shadowRoot?.querySelectorAll('button')
    expect(buttons?.length).toBe(3)
    ;(buttons?.[2] as HTMLButtonElement).click() // fit
    await raf()
    expect(el.viewport?.fitted).toBe(true)
    ;(buttons?.[0] as HTMLButtonElement).click() // zoom in
    await raf()
    expect(el.viewport?.cellPx).toBeCloseTo(FIT * ZOOM_STEP, 6)
  })

  test('the wheel zooms towards the cursor and is not passive', async () => {
    await mount()
    const r = canvasOf(el).getBoundingClientRect()
    const ev = new WheelEvent('wheel', {
      deltaY: -500,
      clientX: r.left,
      clientY: r.top,
      bubbles: true,
      cancelable: true,
    })
    canvasOf(el).dispatchEvent(ev)
    await raf()
    expect(ev.defaultPrevented).toBe(true)
    expect(el.viewport?.cellPx).toBeGreaterThan(FIT)
    // The top-left corner stayed put, and with a margin that corner is the margin.
    expect(el.viewport?.originX).toBeCloseTo(-DEFAULT_PAD, 6)
  })

  test('keys work when the host is focused', async () => {
    await mount()
    el.focus()
    el.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }))
    await raf()
    expect(el.viewport?.cellPx).toBeCloseTo(FIT * ZOOM_STEP, 6)
    el.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }))
    await raf()
    expect(el.viewport?.fitted).toBe(true)
    expect(el.tabIndex).toBe(0)
  })

  test('two zooms in one frame emit a single viewport-change', async () => {
    await mount()
    const seen: ViewportChangeEvent[] = []
    const onChange = (e: Event) => seen.push(e as ViewportChangeEvent)
    document.addEventListener('viewport-change', onChange)
    el.zoomBy(1.1)
    el.zoomBy(1.1)
    await raf()
    document.removeEventListener('viewport-change', onChange)
    expect(seen.length).toBe(1)
    expect(seen[0]?.detail.cellPx).toBeCloseTo(el.viewport?.cellPx ?? 0, 6)
    expect(seen[0]?.detail.cellPx).toBeCloseTo(FIT * 1.1 * 1.1, 6)
  })

  test('resizing the host refits when fitted', async () => {
    await mount()
    el.style.width = '600px'
    await raf()
    await raf()
    expect(el.viewport?.hostWidth).toBeCloseTo(600, 6)
    expect(el.viewport?.cellPx).toBeCloseTo(FIT, 6)
    // 600 px of view at the height's scale is 76 cells across 38 of board.
    expect(el.viewport?.originX).toBeCloseTo((30 - 600 / FIT) / 2, 6)
  })

  test('keys with ⌘, Ctrl or Alt are left to the browser', async () => {
    await mount()
    el.focus()
    for (const mod of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }]) {
      for (const key of ['+', '=', '-', '0']) {
        const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mod })
        el.dispatchEvent(e)
        expect(e.defaultPrevented, `${JSON.stringify(mod)} ${key}`).toBe(false)
      }
    }
    await raf()
    expect(el.viewport?.fitted).toBe(true)
  })

  test('without a board no key is taken', async () => {
    el = document.createElement('arrowz-board')
    el.style.width = '300px'
    el.style.height = '300px'
    document.body.append(el)
    await el.updateComplete
    el.focus()
    const e = new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true })
    el.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
  })

  test('the host takes its parent height back after an odd size, whatever the canvas was', async () => {
    const box = document.createElement('div')
    box.style.width = '300px'
    box.style.height = '240px'
    document.body.append(box)
    el = document.createElement('arrowz-board')
    el.style.width = '100%'
    el.style.height = '100%'
    box.append(el)
    el.board = makeBoard()
    await el.updateComplete
    await raf()
    await raf()
    expect(el.getBoundingClientRect().height).toBeCloseTo(240, 0)
    el.style.width = '20px'
    el.style.height = '3000px'
    await raf()
    await raf()
    el.style.width = '100%'
    el.style.height = '100%'
    await raf()
    await raf()
    expect(el.getBoundingClientRect().height).toBeCloseTo(240, 0)
    expect(el.viewport?.hostHeight).toBeCloseTo(240, 0)
    box.remove()
  })

  test('a host nobody sized has no height of its own', async () => {
    el = document.createElement('arrowz-board')
    document.body.append(el)
    el.board = makeBoard()
    await el.updateComplete
    await raf()
    await raf()
    expect(el.getBoundingClientRect().height).toBe(0)
    expect(el.viewport).toBeNull()
  })

  test('a board that went through a board file draws exactly like the generated one', async () => {
    // The very first WebGL2 context a browser process ever creates paints a
    // couple of anti-aliased edge pixels differently from every context
    // after it — a driver/shader warm-up cost, not anything this element or
    // the board-file round trip controls (elsewhere in this suite there is
    // always an earlier test's context ahead of this one; alone, there is
    // not). A throwaway mount and paint, on its own context that is then
    // discarded, absorbs that one-time cost before the comparison below, so
    // this test passes the same way whether it runs alone or last.
    await mount()
    await painted(el)
    el.remove()

    await mount()
    const original = el.board
    if (!original) throw new Error('mount sets a board')
    const before = await painted(el)
    el.remove()
    await mount()
    el.board = decodeBoard(JSON.parse(JSON.stringify(encodeBoard(original))))
    await el.updateComplete
    await raf()
    const after = await painted(el)
    expect(el.pieceCount).toBe(original.pieces.length)
    expect(inked(after)).toBe(inked(before))
  })
})

describe('clicks', () => {
  test('a press and release on the same piece emits piece-click when interactive', async () => {
    await mount({ interactive: '' })
    const pc = el.board?.pieces[0]
    if (!pc) throw new Error('need a piece')
    const seen: PieceClickEvent[] = []
    document.addEventListener('piece-click', (e) => seen.push(e as PieceClickEvent))
    const p = headPoint(el, pc.id)
    canvasOf(el).dispatchEvent(pointer('pointerdown', p.x, p.y, { ctrlKey: true }))
    canvasOf(el).dispatchEvent(pointer('pointerup', p.x, p.y, { ctrlKey: true }))
    expect(seen.length).toBe(1)
    expect(seen[0]?.detail.pieceId).toBe(pc.id)
    expect(seen[0]?.composed).toBe(true)
  })

  test('a modifier click whose button is reported up by a move before the pointerup still plays once', async () => {
    await mount({ interactive: '' })
    const pc = el.board?.pieces[0]
    if (!pc) throw new Error('need a piece')
    const seen: PieceClickEvent[] = []
    document.addEventListener('piece-click', (e) => seen.push(e as PieceClickEvent))
    const p = headPoint(el, pc.id)
    canvasOf(el).dispatchEvent(pointer('pointerdown', p.x, p.y, { ctrlKey: true }))
    canvasOf(el).dispatchEvent(pointer('pointermove', p.x, p.y, { ctrlKey: true, buttons: 0 }))
    canvasOf(el).dispatchEvent(pointer('pointerup', p.x, p.y, { ctrlKey: true }))
    expect(seen.length).toBe(1)
    expect(seen[0]?.detail.pieceId).toBe(pc.id)
  })

  test('the window losing focus mid-press cancels the gesture: no late piece-click', async () => {
    await mount({ interactive: '' })
    const pc = el.board?.pieces[0]
    if (!pc) throw new Error('need a piece')
    const seen: Event[] = []
    document.addEventListener('piece-click', (e) => seen.push(e))
    const p = headPoint(el, pc.id)
    const canvas = canvasOf(el)
    canvas.dispatchEvent(pointer('pointerenter', p.x, p.y, { ctrlKey: true }))
    canvas.dispatchEvent(pointer('pointerdown', p.x, p.y, { ctrlKey: true }))
    globalThis.dispatchEvent(new Event('blur'))
    canvas.dispatchEvent(pointer('pointermove', p.x, p.y, { ctrlKey: true, buttons: 0 }))
    canvas.dispatchEvent(pointer('pointerup', p.x, p.y, { ctrlKey: true }))
    expect(seen.length).toBe(0)
  })

  test('a secondary mouse button is not a press: no piece-click on release', async () => {
    await mount({ interactive: '' })
    const pc = el.board?.pieces[0]
    if (!pc) throw new Error('need a piece')
    const seen: Event[] = []
    document.addEventListener('piece-click', (e) => seen.push(e))
    const p = headPoint(el, pc.id)
    canvasOf(el).dispatchEvent(pointer('pointerdown', p.x, p.y, { button: 2, buttons: 2, ctrlKey: true }))
    canvasOf(el).dispatchEvent(pointer('pointerup', p.x, p.y, { button: 2, buttons: 0, ctrlKey: true }))
    expect(seen.length).toBe(0)
  })

  test('no piece-click without interactive, without the modifier, or when released over another piece', async () => {
    await mount()
    const [a, b] = el.board?.pieces ?? []
    if (!a || !b) throw new Error('need two pieces')
    const seen: Event[] = []
    document.addEventListener('piece-click', (e) => seen.push(e))
    const pa = headPoint(el, a.id), pb = headPoint(el, b.id)
    canvasOf(el).dispatchEvent(pointer('pointerdown', pa.x, pa.y, { ctrlKey: true }))
    canvasOf(el).dispatchEvent(pointer('pointerup', pa.x, pa.y, { ctrlKey: true }))
    expect(seen.length).toBe(0)
    el.interactive = true
    await el.updateComplete
    canvasOf(el).dispatchEvent(pointer('pointerdown', pa.x, pa.y))
    canvasOf(el).dispatchEvent(pointer('pointerup', pa.x, pa.y))
    expect(seen.length).toBe(0)
    canvasOf(el).dispatchEvent(pointer('pointerdown', pa.x, pa.y, { ctrlKey: true }))
    canvasOf(el).dispatchEvent(pointer('pointerup', pb.x, pb.y, { ctrlKey: true }))
    expect(seen.length).toBe(0)
  })

  test('a modifier press drops the piece cursor for the grab cursor (click mode)', async () => {
    await mountClickMode({ interactive: '' })
    const pc = el.board?.pieces[0]
    if (!pc) throw new Error('need a piece')
    const p = headPoint(el, pc.id)
    const canvas = canvasOf(el)
    canvas.dispatchEvent(pointer('pointermove', p.x, p.y))
    expect(canvas.classList.contains('over-piece')).toBe(true)
    canvas.dispatchEvent(pointer('pointerdown', p.x, p.y, { metaKey: true }))
    expect(canvas.classList.contains('over-piece')).toBe(false)
    expect(canvas.classList.contains('panning')).toBe(true)
    canvas.dispatchEvent(pointer('pointerup', p.x, p.y, { metaKey: true }))
    expect(canvas.classList.contains('panning')).toBe(false)
  })

  test('holding the modifier shows the grab cursor before any press (click mode)', async () => {
    await mountClickMode({ interactive: '' })
    const pc = el.board?.pieces[0]
    if (!pc) throw new Error('need a piece')
    const p = headPoint(el, pc.id)
    const canvas = canvasOf(el)
    canvas.dispatchEvent(pointer('pointerenter', p.x, p.y))
    canvas.dispatchEvent(pointer('pointermove', p.x, p.y))
    expect(canvas.classList.contains('over-piece')).toBe(true)
    expect(canvas.classList.contains('pan-ready')).toBe(false)
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', metaKey: true }))
    expect(canvas.classList.contains('pan-ready')).toBe(true)
    // A click with the modifier pans instead of playing, so the piece cursor is
    // not merely outranked: it would be a lie about what the click does.
    expect(canvas.classList.contains('over-piece')).toBe(false)
    globalThis.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }))
    expect(canvas.classList.contains('pan-ready')).toBe(false)
    expect(canvas.classList.contains('over-piece')).toBe(true)
  })

  test('the pointer arriving with the modifier already down finds the grab cursor (click mode)', async () => {
    await mountClickMode({ interactive: '' })
    const canvas = canvasOf(el)
    canvas.dispatchEvent(pointer('pointerenter', 150, 150, { ctrlKey: true }))
    expect(canvas.classList.contains('pan-ready')).toBe(true)
  })

  test('leaving the board, or the window losing focus, drops the grab cursor (click mode)', async () => {
    await mountClickMode({ interactive: '' })
    const canvas = canvasOf(el)
    canvas.dispatchEvent(pointer('pointerenter', 150, 150, { metaKey: true }))
    expect(canvas.classList.contains('pan-ready')).toBe(true)
    canvas.dispatchEvent(pointer('pointerleave', 150, 150, { metaKey: true }))
    expect(canvas.classList.contains('pan-ready')).toBe(false)
    // ⌘-Tab away: the keyup lands in another window, so blur has to do it.
    canvas.dispatchEvent(pointer('pointerenter', 150, 150, { metaKey: true }))
    expect(canvas.classList.contains('pan-ready')).toBe(true)
    globalThis.dispatchEvent(new Event('blur'))
    expect(canvas.classList.contains('pan-ready')).toBe(false)
  })

  test('a modifier drag pans (click mode)', async () => {
    // Interactive: a board that only pans is in drag mode whatever is stored.
    await mountClickMode({ interactive: '' })
    el.zoomBy(3)
    await raf()
    const before = el.viewport?.originX ?? 0
    const cellPx = el.viewport?.cellPx ?? 1
    canvasOf(el).dispatchEvent(pointer('pointerdown', 150, 150, { metaKey: true }))
    canvasOf(el).dispatchEvent(pointer('pointermove', 120, 150, { metaKey: true }))
    canvasOf(el).dispatchEvent(pointer('pointerup', 120, 150, { metaKey: true }))
    await raf()
    expect(el.viewport?.originX ?? 0).toBeCloseTo(before + 30 / cellPx, 6) // a 30 px drag
  })

  test('a double click leaves the viewport alone and fires one piece-click', async () => {
    const el = await mount({ play: '' })
    const canvas = canvasOf(el)
    el.zoomBy(ZOOM_STEP)
    await raf()
    const before = el.viewport
    let clicks = 0
    el.addEventListener('piece-click', () => clicks++)
    const press = (detail: number) => {
      canvas.dispatchEvent(pointer('pointerdown', 40, 40, { detail, ctrlKey: true }))
      // Real browsers increment `detail` per click on `pointerdown` but always
      // send 0 on the matching `pointerup` (w3c/pointerevents#98); `repeat`
      // has to be read off the down-time sample, and setting `detail` here to
      // anything else would let a regression that reads it off `up` pass too.
      canvas.dispatchEvent(pointer('pointerup', 40, 40, { detail: 0, ctrlKey: true }))
    }
    press(1)
    press(2)
    await raf()
    expect(el.viewport).toEqual(before)
    expect(clicks).toBe(1)
  })

  test('a plain drag pans, and a plain click plays nothing', async () => {
    await mount({ play: '' })
    el.zoomBy(3)
    await raf()
    const seen: Event[] = []
    el.addEventListener('piece-click', (e) => seen.push(e))
    const before = el.viewport?.originX ?? 0
    const cellPx = el.viewport?.cellPx ?? 1
    canvasOf(el).dispatchEvent(pointer('pointerdown', 150, 150))
    canvasOf(el).dispatchEvent(pointer('pointermove', 120, 150))
    canvasOf(el).dispatchEvent(pointer('pointerup', 120, 150))
    await raf()
    expect(el.viewport?.originX ?? 0).toBeCloseTo(before + 30 / cellPx, 6)
    const pc = el.board?.pieces[0]
    if (!pc) throw new Error('need a piece')
    const p = headPoint(el, pc.id)
    canvasOf(el).dispatchEvent(pointer('pointerdown', p.x, p.y))
    canvasOf(el).dispatchEvent(pointer('pointerup', p.x, p.y))
    expect(seen.length).toBe(0)
  })

  test('in drag mode the board shows grab, and the piece cursor only while the modifier is held', async () => {
    await mount({ play: '' })
    const pc = el.board?.pieces[0]
    if (!pc) throw new Error('need a piece')
    const p = headPoint(el, pc.id)
    const canvas = canvasOf(el)
    canvas.dispatchEvent(pointer('pointerenter', p.x, p.y, { buttons: 0 }))
    canvas.dispatchEvent(pointer('pointermove', p.x, p.y, { buttons: 0 }))
    expect(canvas.classList.contains('pan-ready')).toBe(true)
    expect(canvas.classList.contains('over-piece')).toBe(false)
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', metaKey: true }))
    expect(canvas.classList.contains('pan-ready')).toBe(false)
    expect(canvas.classList.contains('over-piece')).toBe(true)
    globalThis.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }))
    expect(canvas.classList.contains('pan-ready')).toBe(true)
    expect(canvas.classList.contains('over-piece')).toBe(false)
  })

  test('a Ctrl secondary click keeps its context menu shut only where it plays', async () => {
    await mount({ play: '' })
    const menu = (ctrlKey: boolean) => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ctrlKey })
      canvasOf(el).dispatchEvent(e)
      return e.defaultPrevented
    }
    expect(menu(true)).toBe(true)
    expect(menu(false)).toBe(false)
    el.removeAttribute('play')
    await el.updateComplete
    expect(menu(true)).toBe(false)
  })

  test('a capture lost mid-drag ends the pan, and a later move does not pan', async () => {
    await mount()
    el.zoomBy(3)
    await raf()
    const canvas = canvasOf(el)
    canvas.dispatchEvent(pointer('pointerdown', 150, 150))
    canvas.dispatchEvent(pointer('pointermove', 140, 150))
    expect(canvas.classList.contains('panning')).toBe(true)
    canvas.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1, bubbles: true }))
    expect(canvas.classList.contains('panning')).toBe(false)
    await raf()
    const before = el.viewport?.originX
    canvas.dispatchEvent(pointer('pointermove', 100, 150))
    await raf()
    expect(el.viewport?.originX).toBe(before)
  })

  test('a move with no button held after a lost release does not pan', async () => {
    await mount()
    el.zoomBy(3)
    await raf()
    const canvas = canvasOf(el)
    canvas.dispatchEvent(pointer('pointerdown', 150, 150))
    canvas.dispatchEvent(pointer('pointermove', 140, 150))
    await raf()
    const before = el.viewport?.originX
    canvas.dispatchEvent(pointer('pointermove', 100, 150, { buttons: 0 }))
    canvas.dispatchEvent(pointer('pointermove', 60, 150, { buttons: 0 }))
    expect(canvas.classList.contains('panning')).toBe(false)
    await raf()
    expect(el.viewport?.originX).toBe(before)
  })
})

describe('the gesture switch', () => {
  const switchOf = (e: ArrowzBoard) => e.shadowRoot?.querySelector<HTMLButtonElement>('button.gestures') ?? null
  const hintOf = (e: ArrowzBoard) => e.shadowRoot?.querySelector('.hint')?.textContent ?? ''
  const mac = /Mac/.test(navigator.platform)

  test('a board that only pans has no switch, is in drag mode, and says so', async () => {
    localStorage.setItem(GESTURE_STORAGE_KEY, 'click')
    await mount()
    expect(switchOf(el)).toBeNull()
    expect(el.gestureMode).toBe('drag')
    expect(hintOf(el)).toBe('Drag to pan')
  })

  test('a playable board starts in drag mode with the switch released', async () => {
    await mount({ play: '' })
    const button = switchOf(el)
    expect(button).not.toBeNull()
    expect(button?.getAttribute('aria-pressed')).toBe('false')
    expect(button?.getAttribute('title')).toBe(mac ? 'Click plays without ⌘' : 'Click plays without Ctrl')
    expect(el.gestureMode).toBe('drag')
    expect(hintOf(el)).toBe(mac ? 'Drag to pan · ⌘-click to play' : 'Drag to pan · Ctrl-click to play')
  })

  test('pressing it switches to click mode, and a plain click plays again', async () => {
    await mount({ interactive: '' })
    switchOf(el)?.click()
    await el.updateComplete
    expect(el.gestureMode).toBe('click')
    expect(switchOf(el)?.getAttribute('aria-pressed')).toBe('true')
    expect(hintOf(el)).toBe(mac ? 'Hold ⌘ and drag to pan' : 'Hold Ctrl and drag to pan')
    expect(localStorage.getItem(GESTURE_STORAGE_KEY)).toBe('click')
    const seen: Event[] = []
    el.addEventListener('piece-click', (e) => seen.push(e))
    const pc = el.board?.pieces[0]
    if (!pc) throw new Error('need a piece')
    const p = headPoint(el, pc.id)
    canvasOf(el).dispatchEvent(pointer('pointerdown', p.x, p.y))
    canvasOf(el).dispatchEvent(pointer('pointerup', p.x, p.y))
    expect(seen.length).toBe(1)
  })

  test('the choice outlives the element', async () => {
    await mount({ play: '' })
    switchOf(el)?.click()
    await el.updateComplete
    el.remove()
    await mount({ play: '' })
    expect(el.gestureMode).toBe('click')
  })

  test('a stored value that is neither mode reads as drag', async () => {
    localStorage.setItem(GESTURE_STORAGE_KEY, 'sideways')
    await mount({ play: '' })
    expect(el.gestureMode).toBe('drag')
  })

  test('lang="pl" labels the switch and the hint in Polish', async () => {
    await mount({ play: '', lang: 'pl' })
    expect(switchOf(el)?.getAttribute('aria-label')).toBe(mac ? 'Klik gra bez ⌘' : 'Klik gra bez Ctrl')
    expect(hintOf(el)).toBe(
      mac ? 'Przeciągnij, aby przesunąć · ⌘ + klik gra' : 'Przeciągnij, aby przesunąć · Ctrl + klik gra',
    )
  })
})

describe('effects and labels', () => {
  test('animateExit and shake delegate to the layer', async () => {
    await mount()
    const pc = el.board?.pieces[0]
    if (!pc) throw new Error('need a piece')
    const all = el.board?.pieces.length ?? 0
    // The exit is the layer's, so the count it keeps is the proof the call
    // reached it: a piece that rides out for good stops being drawn.
    await el.animateExit(pc.id, pc.dir)
    expect(el.pieceCount).toBe(all - 1)
    const other = el.board?.pieces[1]
    if (!other) throw new Error('need a second piece')
    // A shake is a ride that comes back: the piece is still drawn afterwards.
    await el.shake(other.id, 0.3)
    expect(el.pieceCount).toBe(all - 1)
  })

  test('lang="pl" switches the button labels, anything else is English', async () => {
    await mount({ lang: 'pl' })
    expect(el.shadowRoot?.querySelector('button')?.getAttribute('title')).toBe('Powiększ')
    el.setAttribute('lang', 'de')
    await el.updateComplete
    expect(el.shadowRoot?.querySelector('button')?.getAttribute('title')).toBe('Zoom in')
  })

  test('the lang property and the lang attribute stay in step', async () => {
    await mount()
    el.lang = 'pl'
    await el.updateComplete
    expect(el.getAttribute('lang')).toBe('pl')
    expect(el.shadowRoot?.querySelector('button')?.getAttribute('title')).toBe('Powiększ')
    el.setAttribute('lang', 'en')
    await el.updateComplete
    expect(el.lang).toBe('en')
    expect(el.shadowRoot?.querySelector('button')?.getAttribute('title')).toBe('Zoom in')
    el.removeAttribute('lang')
    await el.updateComplete
    expect(el.hasAttribute('lang')).toBe(false)
    expect(el.shadowRoot?.querySelector('button')?.getAttribute('title')).toBe('Zoom in')
  })

  test('a view change repaints the pieces and leaves the viewport alone', async () => {
    await mount()
    el.zoomBy(2)
    await raf()
    const before = el.viewport
    if (!before) throw new Error('need a viewport')
    const seen: Event[] = []
    const onChange = (e: Event) => seen.push(e)
    document.addEventListener('viewport-change', onChange)
    el.view = { ...el.view, stroke: 0.3 }
    await el.updateComplete
    await raf()
    document.removeEventListener('viewport-change', onChange)
    // The stroke is geometry the layer rebuilds; what the element owes is a
    // repaint of the same pieces at the same viewport, and no event.
    expect(el.pieceCount).toBe(el.board?.pieces.length)
    expect(el.viewport?.cellPx).toBeCloseTo(before.cellPx, 6)
    expect(el.viewport?.originX).toBeCloseTo(before.originX, 6)
    expect(el.viewport?.originY).toBeCloseTo(before.originY, 6)
    expect(seen.length).toBe(0)
  })

  test('a board minus one piece still draws the pieces that stayed', async () => {
    // Reassigning `board` starts a fresh game session (the element always
    // owns one), so the redraw omits nothing: every piece of the new board is
    // tesselated again. See `gl-layer.browser.test.ts` for what the layer
    // draws, called without a session in the way.
    await mount()
    const b = el.board
    const kept = b?.pieces[1]
    if (!b || !kept) throw new Error('need a board with two pieces')
    el.board = { ...b, pieces: b.pieces.slice(1) }
    await el.updateComplete
    expect(el.pieceCount).toBe(b.pieces.length - 1)
  })
})

describe('margin', () => {
  /** How many cells of world the view spans across its width. */
  function viewCells(e: ArrowzBoard): number {
    const vp = e.viewport
    if (!vp) throw new Error('need a viewport')
    return vp.hostWidth / vp.cellPx
  }

  // What the element decides is the margin the viewport keeps, and a fitted
  // board shows it in the origin it starts at and the width it spans. The
  // paper drawn to that margin is the layer's, in `gl-layer.browser.test.ts`.
  test('the board keeps a margin of four cells around the cells by default', async () => {
    await mount()
    expect(DEFAULT_PAD).toBe(4)
    expect(el.viewport?.originX).toBeCloseTo(-4, 6)
    expect(viewCells(el)).toBeCloseTo(38, 6)
  })

  test('the pad attribute sets the margin', async () => {
    await mount({ pad: '2' })
    expect(el.pad).toBe(2)
    expect(el.viewport?.originX).toBeCloseTo(-2, 6)
    expect(viewCells(el)).toBeCloseTo(34, 6)
  })

  test('a pad of zero draws the board edge to edge, as before', async () => {
    await mount({ pad: '0' })
    expect(el.viewport?.originX).toBeCloseTo(0, 6)
    expect(viewCells(el)).toBeCloseTo(30, 6)
  })

  test('the view keeps a wider margin than the one asked for when the pixels are too few', async () => {
    // 1 cell of 300/32 px is under the 16 px floor, so the view widens it,
    // and the element hands the layer that kept margin rather than `pad`.
    await mount({ pad: '1' })
    expect(el.pad).toBe(1)
    const kept = el.viewport?.originX ?? 0
    expect(kept).toBeLessThan(-1)
    expect(viewCells(el)).toBeCloseTo(30 - 2 * kept, 6)
  })

  test('removing the pad attribute restores the default margin', async () => {
    await mount({ pad: '2' })
    el.removeAttribute('pad')
    await el.updateComplete
    expect(el.pad).toBe(DEFAULT_PAD)
    await raf()
    expect(el.viewport?.originX).toBeCloseTo(-DEFAULT_PAD, 6)
  })

  test('removing the point-radius attribute restores the default radius', async () => {
    await mount({ 'point-radius': '0.2' })
    el.removeAttribute('point-radius')
    await el.updateComplete
    expect(el.pointRadius).toBe(DEFAULT_POINT_RADIUS)
  })
})

describe('points', () => {
  // Whether the dots are drawn is the layer's, and its own test walks the
  // pixels; what the element owns is the three properties and the threshold
  // its viewport crosses, which is what is asserted here.
  test('show-points, point-color and point-radius arrive as properties', async () => {
    await mount({ 'show-points': '', 'point-color': '#ff00ff', 'point-radius': '0.2' })
    expect(el.showPoints).toBe(true)
    expect(el.pointColor).toBe('#ff00ff')
    expect(el.pointRadius).toBe(0.2)
    expect(el.viewport?.cellPx).toBeGreaterThanOrEqual(MIN_POINT_CELL_PX)
  })

  test('the grid is off unless a host asks for it', async () => {
    await mount()
    expect(el.showPoints).toBe(DEFAULT_SHOW_POINTS)
    expect(el.pointColor).toBe(DEFAULT_POINT_COLOR)
    expect(el.pointRadius).toBe(DEFAULT_POINT_RADIUS)
  })

  test('zooming crosses the grid threshold in both directions, with no property touched in between', async () => {
    el = document.createElement('arrowz-board')
    el.style.width = '300px'
    el.style.height = '300px'
    el.setAttribute('show-points', '')
    document.body.append(el)
    el.board = generate({ ...defaultParams(), W: 200, H: 200, seed: 7 }).board
    await el.updateComplete
    await raf()
    await raf()
    // Fitted, a 200x200 board in a 300 px host gives well under 6 px per cell.
    expect(el.viewport?.cellPx).toBeLessThan(MIN_POINT_CELL_PX)

    el.zoomBy(6)
    await raf()
    expect(el.viewport?.cellPx).toBeGreaterThanOrEqual(MIN_POINT_CELL_PX)
    expect(el.showPoints).toBe(true)

    el.fit()
    await raf()
    expect(el.viewport?.cellPx).toBeLessThan(MIN_POINT_CELL_PX)
    expect(el.showPoints).toBe(true)
  })
})

describe('the context a board holds', () => {
  /** Whether the canvas's context is gone, asked of the canvas rather than the layer. */
  const isLost = (canvas: HTMLCanvasElement): boolean => canvas.getContext('webgl2')?.isContextLost() ?? true

  async function settle(canvas: HTMLCanvasElement, lost: boolean): Promise<void> {
    for (let i = 0; i < 20 && isLost(canvas) !== lost; i++) await raf()
  }

  test('a detached board gives its context up, and an attached one takes it back', async () => {
    await mount()
    const canvas = canvasOf(el)
    const drawn = el.pieceCount
    expect(drawn).toBeGreaterThan(0)
    expect(inked(await painted(el))).toBeGreaterThan(0)

    el.remove()
    // A page holds about sixteen live contexts, so the whole point of the
    // disposal is that the context itself goes, not merely the buffers in it.
    await settle(canvas, true)
    expect(isLost(canvas)).toBe(true)

    document.body.append(el)
    await settle(canvas, false)
    expect(isLost(canvas)).toBe(false)
    // The board is rebuilt from what the layer still holds: nothing was
    // handed back to it, and the count of pieces it draws never moved.
    expect(el.pieceCount).toBe(drawn)
    expect(inked(await painted(el))).toBeGreaterThan(0)
  })

  test('a board moved between parents keeps the context it had', async () => {
    await mount()
    const canvas = canvasOf(el)
    const box = document.createElement('div')
    box.style.width = '300px'
    box.style.height = '300px'
    document.body.append(box)
    // A move is a removal and an insertion in one task, and must cost neither
    // the context nor the rebuild that taking it back would need.
    box.append(el)
    await new Promise<void>((r) => queueMicrotask(() => r()))
    expect(isLost(canvas)).toBe(false)
    await raf()
    expect(isLost(canvas)).toBe(false)
    expect(inked(await painted(el))).toBeGreaterThan(0)
  })

  test('elements created and never connected take no context from a connected board', async () => {
    await mount()
    const canvas = canvasOf(el)
    // Chrome holds about sixteen live contexts; a constructor that took one
    // would have evicted this board's by the sixteenth.
    const orphans: HTMLElement[] = []
    for (let i = 0; i < 20; i++) orphans.push(document.createElement('arrowz-board'))
    await raf()
    await raf()
    expect(isLost(canvas)).toBe(false)
    expect(inked(await painted(el))).toBeGreaterThan(0)
    expect(orphans.length).toBe(20)
  })

  test('a visible board whose context the browser takes gets it back by itself', async () => {
    await mount()
    const canvas = canvasOf(el)
    const lose = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')
    if (!lose) throw new Error('WEBGL_lose_context is needed for this test')
    // A simulated loss is restored only when someone asks: the browser will
    // not, so a board that recovers here recovered on its own.
    lose.loseContext()
    for (let i = 0; i < 30 && (isLost(canvas) || el.pieceCount === 0); i++) await raf()
    expect(isLost(canvas)).toBe(false)
    expect(inked(await painted(el))).toBeGreaterThan(0)
  })

  test('a board outside the viewport waits to be scrolled to before asking', async () => {
    await mount()
    el.style.position = 'absolute'
    el.style.top = '10000px'
    await raf()
    await raf()
    const canvas = canvasOf(el)
    const lose = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')
    if (!lose) throw new Error('WEBGL_lose_context is needed for this test')
    lose.loseContext()
    for (let i = 0; i < 10; i++) await raf()
    expect(isLost(canvas)).toBe(true)
    el.style.top = '0px'
    for (let i = 0; i < 30 && isLost(canvas); i++) await raf()
    expect(isLost(canvas)).toBe(false)
  })
})

describe('nonsense in, a drawable board out', () => {
  const allFinite = (v: BoardViewport | null | undefined): boolean =>
    v !== null && v !== undefined && [v.cellPx, v.originX, v.originY, v.hostWidth, v.hostHeight].every(Number.isFinite)

  test('a pad that is not a number fits as the default pad, and the attribute keeps what was set', async () => {
    const details: BoardViewport[] = []
    const onChange = (e: Event) => details.push((e as ViewportChangeEvent).detail)
    document.addEventListener('viewport-change', onChange)
    await mount({ pad: 'abc' })
    expect(el.getAttribute('pad')).toBe('abc')
    expect(allFinite(el.viewport)).toBe(true)
    expect(el.viewport?.originX).toBeCloseTo(-DEFAULT_PAD, 6)
    expect(details.length).toBeGreaterThan(0)
    expect(details.every(allFinite)).toBe(true)
    document.removeEventListener('viewport-change', onChange)
  })

  test('a stroke or head height that is not a number still draws the pieces', async () => {
    await mount()
    el.view = { ...el.view, stroke: NaN, headHeight: NaN }
    await el.updateComplete
    expect(inked(await painted(el))).toBeGreaterThan(0)
    expect(Number.isNaN(el.view.stroke)).toBe(true) // the property keeps what the host set
  })

  test('a point radius past half a cell does not flood the paper', async () => {
    await mount({ 'show-points': '', 'point-color': '#ff00ff', 'point-radius': '5' })
    el.zoomBy(3)
    await raf()
    const buf = await painted(el)
    const canvas = canvasOf(el)
    const vp = el.viewport
    if (!vp) throw new Error('need a viewport')
    const dpr = devicePixelRatio
    // A cell corner is 0.707 cells from the dot at the cell's centre and a
    // quarter cell clear of any stroke: a dot of radius ≤ 0.5 never reaches
    // it, and an unclamped radius of 5 paints every one of them.
    let corners = 0, magenta = 0
    for (let y = 1; y < 30; y++) {
      for (let x = 1; x < 30; x++) {
        const px = Math.round((x - vp.originX) * vp.cellPx * dpr)
        const py = Math.round((y - vp.originY) * vp.cellPx * dpr)
        if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue
        const i = ((canvas.height - 1 - py) * canvas.width + px) * 4 // readPixels rows run bottom-up
        corners++
        if (buf[i] === 255 && buf[i + 1] === 0 && buf[i + 2] === 255) magenta++
      }
    }
    expect(el.pointRadius).toBe(5) // the attribute keeps what the host set
    expect(corners).toBeGreaterThan(20)
    expect(magenta).toBe(0)
  })

  test('a point radius that is not a number keeps its attribute, and the viewport stays finite', async () => {
    await mount({ 'show-points': '', 'point-radius': 'abc' })
    expect(el.getAttribute('point-radius')).toBe('abc')
    expect(allFinite(el.viewport)).toBe(true)
  })

  test('zoomBy ignores a factor that is not a finite positive number', async () => {
    await mount()
    const before = el.viewport
    el.zoomBy(NaN)
    el.zoomBy(0)
    el.zoomBy(-2)
    expect(el.viewport).toEqual(before)
    expect(allFinite(el.viewport)).toBe(true)
  })
})
