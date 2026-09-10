import { describe, expect, test } from 'vitest'
import { fit, MAX_CELL_PX, MIN_PAD_PX, panBy, resize, screenToCell, viewBox, zoomAt, zoomBy } from './viewport.ts'

const input = { W: 100, H: 200, hostWidth: 400, hostHeight: 800, pad: 0 }

describe('fit', () => {
  test('scales the board to the host and starts fitted', () => {
    const v = fit(input)
    expect(v.cellPx).toBeCloseTo(4, 9)
    expect(v.originX).toBeCloseTo(0, 9)
    expect(v.originY).toBeCloseTo(0, 9)
    expect(v.fitted).toBe(true)
    expect(viewBox(v)).toBe('0 0 100 200')
  })

  test('centres the board on the axis with slack', () => {
    const v = fit({ ...input, hostWidth: 800 })
    expect(v.cellPx).toBeCloseTo(4, 9)
    expect(v.originX).toBeCloseTo(-50, 9) // 400 px of slack = 100 cells, half on each side
    expect(v.originY).toBeCloseTo(0, 9)
  })
})

describe('zoomAt', () => {
  test('keeps the world point under the cursor', () => {
    const v = fit(input)
    const before = screenToCell(v, 120, 300)
    const z = zoomAt(v, 2, 120, 300)
    expect(z.cellPx).toBeCloseTo(8, 9)
    expect(screenToCell(z, 120, 300)).toEqual(before)
    expect(z.fitted).toBe(false)
  })

  test('cannot zoom out below the fit scale', () => {
    const z = zoomAt(fit(input), 0.1, 200, 400)
    expect(z.cellPx).toBeCloseTo(4, 9)
    expect(z.fitted).toBe(true)
  })

  test('cannot zoom in past the readability limit', () => {
    let v = fit(input)
    for (let i = 0; i < 20; i++) v = zoomAt(v, 2, 200, 400)
    expect(v.cellPx).toBeCloseTo(MAX_CELL_PX, 9)
  })

  test('a tiny board in a big host keeps fit reachable above the limit', () => {
    const v = fit({ W: 4, H: 4, hostWidth: 400, hostHeight: 400, pad: 0 })
    expect(v.cellPx).toBeCloseTo(100, 9)
    expect(zoomAt(v, 2, 200, 200).cellPx).toBeCloseTo(100, 9)
  })

  test('a corner zoom pins the corner rather than pulling the board away', () => {
    const v = zoomAt(fit(input), 4, 0, 0)
    expect(v.originX).toBeCloseTo(0, 9)
    expect(v.originY).toBeCloseTo(0, 9)
  })

  test('keeps the exact point under the cursor, however close to the edge', () => {
    const edge = { W: 100, H: 100, hostWidth: 900, hostHeight: 500, pad: 4 }
    const v = fit(edge)
    // Just inside the board's top-left corner: at this fit the board spans
    // x 200..700 of the 900 px host, and fills its height.
    const px = 210, py = 15
    const anchorX = v.originX + px / v.cellPx, anchorY = v.originY + py / v.cellPx
    let z = v
    for (let i = 0; i < 8; i++) z = zoomAt(z, 1.35, px, py)
    expect((anchorX - z.originX) * z.cellPx).toBeCloseTo(px, 6)
    expect((anchorY - z.originY) * z.cellPx).toBeCloseTo(py, 6)
  })

  test('the exact point survives a zoom out as well', () => {
    const wide = fit({ W: 100, H: 100, hostWidth: 900, hostHeight: 500, pad: 4 })
    const zoomed = zoomAt(wide, 6, 700, 400)
    const px = 120, py = 90
    const anchorX = zoomed.originX + px / zoomed.cellPx, anchorY = zoomed.originY + py / zoomed.cellPx
    const out = zoomAt(zoomed, 1 / 1.35, px, py)
    expect((anchorX - out.originX) * out.cellPx).toBeCloseTo(px, 6)
    expect((anchorY - out.originY) * out.cellPx).toBeCloseTo(py, 6)
  })
})

describe('zoomBy and panBy', () => {
  test('zoomBy zooms around the host centre', () => {
    const v = fit(input)
    const centre = screenToCell(v, 200, 400)
    expect(screenToCell(zoomBy(v, 3), 200, 400)).toEqual(centre)
  })

  test('panBy moves the board with the pointer and clamps at the edge', () => {
    const v = zoomAt(fit(input), 2, 200, 400) // cellPx 8, view 50×100 cells, origin (25, 50)
    const moved = panBy(v, 80, 0) // drag right by 80 px = 10 cells: the origin goes left
    expect(moved.originX).toBeCloseTo(15, 9)
    // The drag stops with the view's centre on the board's edge, half a view
    // short of the origin the old "the board fills the view" rule would give.
    const clamped = panBy(v, 10000, 10000)
    expect(clamped.originX).toBeCloseTo(-v.hostWidth / v.cellPx / 2, 9)
    expect(clamped.originY).toBeCloseTo(-v.hostHeight / v.cellPx / 2, 9)
  })
})

describe('resize', () => {
  test('refits when fitted', () => {
    const v = resize(fit(input), 800, 800)
    expect(v.cellPx).toBeCloseTo(4, 9)
    expect(v.originX).toBeCloseTo(-50, 9)
    expect(v.fitted).toBe(true)
  })

  test('keeps the scale when zoomed and clamps the origin', () => {
    const z = zoomAt(fit(input), 2, 200, 400)
    const v = resize(z, 200, 200)
    expect(v.cellPx).toBeCloseTo(8, 9)
    expect(v.fitted).toBe(false)
    expect(v.originX + v.hostWidth / v.cellPx).toBeLessThanOrEqual(input.W + 1e-9)
  })
})

describe('screenToCell', () => {
  test('maps pixels to cells and null outside the board', () => {
    const v = fit({ ...input, hostWidth: 800 }) // originX -50
    expect(screenToCell(v, 200, 0)).toEqual({ x: 0, y: 0 })
    expect(screenToCell(v, 203, 799)).toEqual({ x: 0, y: 199 })
    expect(screenToCell(v, 100, 400)).toBeNull()
    expect(screenToCell(v, 600, 400)).toBeNull()
  })
})

describe('margin', () => {
  const small = { W: 10, H: 10, hostWidth: 400, hostHeight: 400, pad: 3 }

  test('fit leaves the requested margin on every side of the board', () => {
    const v = fit(small)
    expect(v.margin).toBeCloseTo(3, 9)
    expect(v.cellPx).toBeCloseTo(25, 9)
    expect(viewBox(v)).toBe('-3 -3 16 16')
  })

  test('no margin asked for means none given', () => {
    const v = fit({ ...small, pad: 0 })
    expect(v.margin).toBe(0)
    expect(viewBox(v)).toBe('0 0 10 10')
  })

  test('a margin that would shrink below the floor on screen is widened to it', () => {
    const v = fit({ W: 400, H: 400, hostWidth: 800, hostHeight: 800, pad: 4 })
    expect(v.margin).toBeGreaterThan(4)
    expect(v.margin * v.cellPx).toBeCloseTo(MIN_PAD_PX, 6)
  })

  test('a margin already wider than the floor is left alone', () => {
    const v = fit(small)
    expect(v.margin * v.cellPx).toBeGreaterThan(MIN_PAD_PX)
    expect(v.margin).toBeCloseTo(3, 9)
  })

  test('panning cannot pull the view centre off the board', () => {
    const far = panBy(zoomAt(fit(small), 4, 0, 0), 5000, 5000)
    const centreX = far.originX + far.hostWidth / far.cellPx / 2
    const centreY = far.originY + far.hostHeight / far.cellPx / 2
    expect(centreX).toBeCloseTo(-far.margin, 9)
    expect(centreY).toBeCloseTo(-far.margin, 9)
    const back = panBy(far, -5000, -5000)
    expect(back.originX + back.hostWidth / back.cellPx / 2).toBeCloseTo(small.W + back.margin, 9)
    expect(back.originY + back.hostHeight / back.cellPx / 2).toBeCloseTo(small.H + back.margin, 9)
  })

  test('a click in the margin belongs to no cell', () => {
    const v = fit(small)
    expect(screenToCell(v, 4, 4)).toBeNull()
    expect(screenToCell(v, 200, 200)).toEqual({ x: 5, y: 5 })
  })
})
