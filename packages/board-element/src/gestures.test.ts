import { describe, expect, test } from 'vitest'
import { GestureMachine, type PointerSample } from './gestures.ts'

function mouse(x: number, y: number, modifier = false, t = 0): PointerSample {
  return { id: 1, x, y, kind: 'mouse', modifier, t }
}
function touch(id: number, x: number, y: number, t: number): PointerSample {
  return { id, x, y, kind: 'touch', modifier: false, t }
}

describe('mouse', () => {
  test('press and release without a modifier is a click carrying both positions', () => {
    const m = new GestureMachine()
    expect(m.down(mouse(10, 10))).toEqual({ type: 'none' })
    expect(m.move(mouse(12, 11))).toEqual({ type: 'none' })
    expect(m.up(mouse(12, 11))).toEqual({ type: 'click', pressX: 10, pressY: 10, x: 12, y: 11 })
  })

  test('drag with the modifier pans and never clicks', () => {
    const m = new GestureMachine()
    m.down(mouse(10, 10, true))
    expect(m.panning).toBe(true)
    expect(m.move(mouse(15, 12, true))).toEqual({ type: 'pan', dx: 5, dy: 2 })
    expect(m.move(mouse(20, 12, true))).toEqual({ type: 'pan', dx: 5, dy: 0 })
    expect(m.up(mouse(20, 12, true))).toEqual({ type: 'none' })
    expect(m.panning).toBe(false)
  })

  test('drag without the modifier does nothing while moving', () => {
    const m = new GestureMachine()
    m.down(mouse(10, 10))
    expect(m.move(mouse(60, 60))).toEqual({ type: 'none' })
  })
})

describe('touch', () => {
  test('a short tap without movement is a click', () => {
    const m = new GestureMachine()
    m.down(touch(5, 40, 40, 0))
    m.move(touch(5, 43, 41, 50))
    expect(m.up(touch(5, 43, 41, 100))).toEqual({ type: 'click', pressX: 40, pressY: 40, x: 43, y: 41 })
  })

  test('a slow press is not a tap', () => {
    const m = new GestureMachine()
    m.down(touch(5, 40, 40, 0))
    expect(m.up(touch(5, 40, 40, 400))).toEqual({ type: 'none' })
  })

  test('one finger beyond the slop pans, and the release is not a click', () => {
    const m = new GestureMachine()
    m.down(touch(5, 40, 40, 0))
    expect(m.move(touch(5, 44, 40, 20))).toEqual({ type: 'none' }) // within 8 px
    expect(m.move(touch(5, 60, 40, 40))).toEqual({ type: 'pan', dx: 20, dy: 0 })
    expect(m.move(touch(5, 70, 45, 60))).toEqual({ type: 'pan', dx: 10, dy: 5 })
    expect(m.up(touch(5, 70, 45, 80))).toEqual({ type: 'none' })
  })

  test('two taps close in time and place fit the board', () => {
    const m = new GestureMachine()
    m.down(touch(5, 40, 40, 0))
    expect(m.up(touch(5, 40, 40, 50)).type).toBe('click')
    m.down(touch(6, 45, 42, 200))
    expect(m.up(touch(6, 45, 42, 250))).toEqual({ type: 'fit' })
    // The third tap starts a fresh sequence.
    m.down(touch(7, 45, 42, 300))
    expect(m.up(touch(7, 45, 42, 350)).type).toBe('click')
  })

  test('two fingers pinch towards the midpoint and pan with it', () => {
    const m = new GestureMachine()
    m.down(touch(1, 100, 100, 0))
    m.down(touch(2, 200, 100, 0))
    const i = m.move(touch(2, 300, 100, 20))
    expect(i.type).toBe('pinch')
    if (i.type === 'pinch') {
      expect(i.factor).toBeCloseTo(2, 9) // distance 100 -> 200
      expect(i.x).toBeCloseTo(200, 9) // the new midpoint
      expect(i.y).toBeCloseTo(100, 9)
      expect(i.dx).toBeCloseTo(50, 9) // the midpoint moved from 150 to 200
      expect(i.dy).toBeCloseTo(0, 9)
    }
    expect(m.up(touch(2, 300, 100, 40))).toEqual({ type: 'none' })
    // The remaining finger continues as a pan without a click on release.
    expect(m.move(touch(1, 110, 100, 60))).toEqual({ type: 'pan', dx: 10, dy: 0 })
    expect(m.up(touch(1, 110, 100, 80))).toEqual({ type: 'none' })
  })

  test('cancelling one of two fingers drops to a pan on the survivor, never a click', () => {
    const m = new GestureMachine()
    m.down(touch(1, 100, 100, 0))
    m.down(touch(2, 200, 100, 0))
    expect(m.cancel(1)).toEqual({ type: 'none' })
    expect(m.move(touch(2, 210, 100, 20))).toEqual({ type: 'pan', dx: 10, dy: 0 })
    expect(m.up(touch(2, 210, 100, 40))).toEqual({ type: 'none' })
  })
})

test('cancel resets everything', () => {
  const m = new GestureMachine()
  m.down(mouse(10, 10, true))
  expect(m.cancel(1)).toEqual({ type: 'none' })
  expect(m.panning).toBe(false)
  expect(m.move(mouse(50, 50, true))).toEqual({ type: 'none' })
})
