import { defaultParams, generate } from '@arrowz/engine'
import type { Board } from '@arrowz/engine'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { ArrowzBoard, ZOOM_STEP } from './arrowz-board.ts'
import type { PieceClickEvent, ViewportChangeEvent } from './arrowz-board.ts'
import './mod.ts'
import { fit, viewBox, zoomBy } from './viewport.ts'

function makeBoard(seed = 7): Board {
  return generate({ ...defaultParams(), W: 30, H: 30, seed }).board
}

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

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

function svgOf(e: ArrowzBoard): SVGSVGElement {
  const svg = e.shadowRoot?.querySelector('svg')
  if (!svg) throw new Error('no svg in the shadow root')
  return svg
}

/** Screen coordinates (relative to the svg) of the centre of the head cell of a piece. */
function headPoint(e: ArrowzBoard, pieceId: number): { x: number; y: number } {
  const vp = e.viewport
  const pc = e.board?.pieces.find((p) => p.id === pieceId)
  const head = pc?.cells[0]
  if (!vp || !head) throw new Error('need a viewport and a piece')
  return { x: (head.x + 0.5 - vp.originX) * vp.cellPx, y: (head.y + 0.5 - vp.originY) * vp.cellPx }
}

function pointer(type: string, x: number, y: number, init: Partial<PointerEventInit> = {}): PointerEvent {
  const r = svgOf(el).getBoundingClientRect()
  return new PointerEvent(type, {
    bubbles: true,
    composed: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: r.left + x,
    clientY: r.top + y,
    ...init,
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
})
afterEach(() => {
  el?.remove()
})

describe('mount and viewport', () => {
  test('is registered and draws the board fitted to the host', async () => {
    expect(customElements.get('arrowz-board')).toBe(ArrowzBoard)
    await mount()
    const expected = fit({ W: 30, H: 30, hostWidth: 300, hostHeight: 300 })
    expect(svgOf(el).getAttribute('viewBox')).toBe(viewBox(expected))
    expect(el.viewport?.cellPx).toBeCloseTo(10, 6)
    expect(el.viewport?.fitted).toBe(true)
    expect(svgOf(el).querySelectorAll('g.heads > g[data-id]').length).toBe(el.board?.pieces.length)
  })

  test('zoomBy, fit and the buttons change the viewBox and emit viewport-change', async () => {
    await mount()
    const seen: ViewportChangeEvent[] = []
    document.addEventListener('viewport-change', (e) => seen.push(e as ViewportChangeEvent))
    el.zoomBy(2)
    await raf()
    const expected = zoomBy(fit({ W: 30, H: 30, hostWidth: 300, hostHeight: 300 }), 2)
    expect(svgOf(el).getAttribute('viewBox')).toBe(viewBox(expected))
    expect(seen.at(-1)?.detail.cellPx).toBeCloseTo(20, 6)
    expect(seen.at(-1)?.detail.fitted).toBe(false)
    const buttons = el.shadowRoot?.querySelectorAll('button')
    expect(buttons?.length).toBe(3)
    ;(buttons?.[2] as HTMLButtonElement).click() // fit
    await raf()
    expect(el.viewport?.fitted).toBe(true)
    ;(buttons?.[0] as HTMLButtonElement).click() // zoom in
    await raf()
    expect(el.viewport?.cellPx).toBeCloseTo(10 * ZOOM_STEP, 6)
  })

  test('the wheel zooms towards the cursor and is not passive', async () => {
    await mount()
    const r = svgOf(el).getBoundingClientRect()
    const ev = new WheelEvent('wheel', {
      deltaY: -500,
      clientX: r.left,
      clientY: r.top,
      bubbles: true,
      cancelable: true,
    })
    svgOf(el).dispatchEvent(ev)
    await raf()
    expect(ev.defaultPrevented).toBe(true)
    expect(el.viewport?.cellPx).toBeGreaterThan(10)
    expect(el.viewport?.originX).toBeCloseTo(0, 6) // the top-left corner stayed put
  })

  test('keys work when the host is focused', async () => {
    await mount()
    el.focus()
    el.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }))
    await raf()
    expect(el.viewport?.cellPx).toBeCloseTo(10 * ZOOM_STEP, 6)
    el.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }))
    await raf()
    expect(el.viewport?.fitted).toBe(true)
    expect(el.tabIndex).toBe(0)
  })

  test('resizing the host refits when fitted', async () => {
    await mount()
    el.style.width = '600px'
    await raf()
    await raf()
    expect(el.viewport?.hostWidth).toBeCloseTo(600, 6)
    expect(el.viewport?.cellPx).toBeCloseTo(10, 6)
    expect(el.viewport?.originX).toBeCloseTo(-15, 6)
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
    svgOf(el).dispatchEvent(pointer('pointerdown', p.x, p.y))
    svgOf(el).dispatchEvent(pointer('pointerup', p.x, p.y))
    expect(seen.length).toBe(1)
    expect(seen[0]?.detail.pieceId).toBe(pc.id)
    expect(seen[0]?.composed).toBe(true)
  })

  test('no piece-click without interactive, with the modifier, or when released over another piece', async () => {
    await mount()
    const [a, b] = el.board?.pieces ?? []
    if (!a || !b) throw new Error('need two pieces')
    const seen: Event[] = []
    document.addEventListener('piece-click', (e) => seen.push(e))
    const pa = headPoint(el, a.id), pb = headPoint(el, b.id)
    svgOf(el).dispatchEvent(pointer('pointerdown', pa.x, pa.y))
    svgOf(el).dispatchEvent(pointer('pointerup', pa.x, pa.y))
    expect(seen.length).toBe(0)
    el.interactive = true
    await el.updateComplete
    svgOf(el).dispatchEvent(pointer('pointerdown', pa.x, pa.y, { ctrlKey: true }))
    svgOf(el).dispatchEvent(pointer('pointermove', pa.x + 30, pa.y, { ctrlKey: true }))
    svgOf(el).dispatchEvent(pointer('pointerup', pa.x + 30, pa.y, { ctrlKey: true }))
    expect(seen.length).toBe(0)
    svgOf(el).dispatchEvent(pointer('pointerdown', pa.x, pa.y))
    svgOf(el).dispatchEvent(pointer('pointerup', pb.x, pb.y))
    expect(seen.length).toBe(0)
  })

  test('a modifier drag pans', async () => {
    await mount()
    el.zoomBy(3)
    await raf()
    const before = el.viewport?.originX ?? 0
    svgOf(el).dispatchEvent(pointer('pointerdown', 150, 150, { metaKey: true }))
    svgOf(el).dispatchEvent(pointer('pointermove', 120, 150, { metaKey: true }))
    svgOf(el).dispatchEvent(pointer('pointerup', 120, 150, { metaKey: true }))
    await raf()
    expect(el.viewport?.originX ?? 0).toBeCloseTo(before + 1, 6) // 30 px at 30 px per cell
  })
})

describe('effects and labels', () => {
  test('animateExit and shake delegate to the layer', async () => {
    await mount()
    const pc = el.board?.pieces[0]
    if (!pc) throw new Error('need a piece')
    await el.animateExit(pc.id, pc.dir)
    expect(svgOf(el).querySelectorAll(`g[data-id="${pc.id}"]`).length).toBe(0)
    const other = el.board?.pieces[1]
    if (!other) throw new Error('need a second piece')
    await el.shake(other.id, 0.3)
    expect(svgOf(el).querySelectorAll(`g[data-id="${other.id}"]`).length).toBe(2)
  })

  test('lang="pl" switches the button labels, anything else is English', async () => {
    await mount({ lang: 'pl' })
    expect(el.shadowRoot?.querySelector('button')?.getAttribute('title')).toBe('Powiększ')
    el.setAttribute('lang', 'de')
    await el.updateComplete
    expect(el.shadowRoot?.querySelector('button')?.getAttribute('title')).toBe('Zoom in')
  })

  test('a board minus one piece keeps the other nodes', async () => {
    await mount()
    const b = el.board
    const kept = b?.pieces[1]
    if (!b || !kept) throw new Error('need a board with two pieces')
    const node = svgOf(el).querySelector(`g.pieces > g[data-id="${kept.id}"]`)
    el.board = { ...b, pieces: b.pieces.slice(1) }
    await el.updateComplete
    expect(svgOf(el).querySelector(`g.pieces > g[data-id="${kept.id}"]`)).toBe(node)
  })
})
