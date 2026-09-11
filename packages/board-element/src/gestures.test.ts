import { describe, expect, test } from 'vitest'
import { GestureMachine, type PointerSample } from './gestures.ts'

function mouse(x: number, y: number, modifier = false, t = 0, pressed = true): PointerSample {
  return { id: 1, x, y, kind: 'mouse', modifier, t, repeat: false, pressed, primary: true }
}
function touch(id: number, x: number, y: number, t: number, primary = false): PointerSample {
  return { id, x, y, kind: 'touch', modifier: false, t, repeat: false, pressed: true, primary }
}

describe('mouse, click mode (the rule before 2026-09-11)', () => {
  test('press and release without a modifier is a click carrying both positions', () => {
    const m = new GestureMachine('click')
    expect(m.down(mouse(10, 10))).toEqual({ type: 'none' })
    expect(m.move(mouse(12, 11))).toEqual({ type: 'none' })
    expect(m.up(mouse(12, 11))).toEqual({ type: 'click', pressX: 10, pressY: 10, x: 12, y: 11 })
  })

  test('drag with the modifier pans and never clicks', () => {
    const m = new GestureMachine('click')
    m.down(mouse(10, 10, true))
    expect(m.panning).toBe(true)
    expect(m.move(mouse(15, 12, true))).toEqual({ type: 'pan', dx: 5, dy: 2 })
    expect(m.move(mouse(20, 12, true))).toEqual({ type: 'pan', dx: 5, dy: 0 })
    expect(m.up(mouse(20, 12, true))).toEqual({ type: 'none' })
    expect(m.panning).toBe(false)
  })

  test('drag without the modifier does nothing while moving', () => {
    const m = new GestureMachine('click')
    m.down(mouse(10, 10))
    expect(m.move(mouse(60, 60))).toEqual({ type: 'none' })
  })

  test('a repeat press yields no click', () => {
    const m = new GestureMachine('click')
    m.down({ ...mouse(10, 10), repeat: true })
    expect(m.up({ ...mouse(10, 10), repeat: true })).toEqual({ type: 'none' })
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

  test('a second tap close in time and place does nothing at all', () => {
    const m = new GestureMachine()
    m.down(touch(5, 44, 41, 0))
    expect(m.up(touch(5, 44, 41, 100))).toEqual({ type: 'click', pressX: 44, pressY: 41, x: 44, y: 41 })
    m.down(touch(6, 45, 42, 200))
    expect(m.up(touch(6, 45, 42, 250))).toEqual({ type: 'none' })
  })

  test('two quick taps far enough apart are both clicks', () => {
    const m = new GestureMachine()
    m.down(touch(5, 20, 20, 0))
    expect(m.up(touch(5, 20, 20, 40))).toEqual({ type: 'click', pressX: 20, pressY: 20, x: 20, y: 20 })
    m.down(touch(6, 80, 80, 80))
    expect(m.up(touch(6, 80, 80, 120))).toEqual({ type: 'click', pressX: 80, pressY: 80, x: 80, y: 80 })
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
  const m = new GestureMachine('click')
  m.down(mouse(10, 10, true))
  expect(m.cancel(1)).toEqual({ type: 'none' })
  expect(m.panning).toBe(false)
  expect(m.move(mouse(50, 50, true))).toEqual({ type: 'none' })
})

test('cancelAll drops every pointer, so a late move or up plays nothing', () => {
  const m = new GestureMachine()
  m.down(mouse(10, 10, true))
  m.cancelAll()
  expect(m.move(mouse(10, 10, true, 0, false))).toEqual({ type: 'none' })
  expect(m.up(mouse(10, 10, true))).toEqual({ type: 'none' })
})

describe('mouse, drag mode (the default)', () => {
  test('the default mode is drag', () => {
    expect(new GestureMachine().mode).toBe('drag')
  })

  test('a plain drag pans and its release clicks nothing', () => {
    const m = new GestureMachine()
    m.down(mouse(10, 10))
    expect(m.panning).toBe(true)
    expect(m.move(mouse(15, 12))).toEqual({ type: 'pan', dx: 5, dy: 2 })
    expect(m.up(mouse(15, 12))).toEqual({ type: 'none' })
  })

  test('a plain click without movement does nothing at all', () => {
    const m = new GestureMachine()
    m.down(mouse(10, 10))
    expect(m.up(mouse(10, 10))).toEqual({ type: 'none' })
  })

  test('a modifier click plays', () => {
    const m = new GestureMachine()
    m.down(mouse(10, 10, true))
    expect(m.panning).toBe(false)
    expect(m.up(mouse(11, 10, true))).toEqual({ type: 'click', pressX: 10, pressY: 10, x: 11, y: 10 })
  })

  test('a modifier drag does not pan', () => {
    const m = new GestureMachine()
    m.down(mouse(10, 10, true))
    expect(m.move(mouse(60, 60, true))).toEqual({ type: 'none' })
  })

  test('a repeat modifier press yields no click', () => {
    const m = new GestureMachine()
    m.down({ ...mouse(10, 10, true), repeat: true })
    expect(m.up({ ...mouse(10, 10, true), repeat: true })).toEqual({ type: 'none' })
  })

  test('a mode change applies from the next press', () => {
    const m = new GestureMachine('drag')
    m.down(mouse(10, 10))
    m.mode = 'click'
    expect(m.move(mouse(20, 10))).toEqual({ type: 'pan', dx: 10, dy: 0 })
    m.up(mouse(20, 10))
    m.down(mouse(10, 10))
    expect(m.panning).toBe(false)
  })

  test('pen follows the mouse rule', () => {
    const m = new GestureMachine()
    m.down({ ...mouse(10, 10), kind: 'pen' })
    expect(m.panning).toBe(true)
  })
})

describe('a move with no button held is the release', () => {
  for (const mode of ['drag', 'click'] as const) {
    test(`a move with no button pressed ends the press (${mode} mode)`, () => {
      const m = new GestureMachine(mode)
      const panKey = mode === 'click'
      m.down(mouse(10, 10, panKey))
      expect(m.move(mouse(20, 10, panKey))).toEqual({ type: 'pan', dx: 10, dy: 0 })
      // The pointerup went elsewhere (a context menu, another window).
      expect(m.move(mouse(40, 40, false, 0, false))).toEqual({ type: 'none' })
      expect(m.panning).toBe(false)
      expect(m.move(mouse(60, 60, panKey))).toEqual({ type: 'none' })
      expect(m.up(mouse(60, 60, panKey))).toEqual({ type: 'none' })
    })

    test(`a move with no button pressed plays the click of a press that did not pan (${mode} mode)`, () => {
      const m = new GestureMachine(mode)
      const clickKey = mode === 'drag'
      m.down(mouse(10, 10, clickKey))
      expect(m.move(mouse(10, 10, clickKey, 0, false))).toEqual({
        type: 'click',
        pressX: 10,
        pressY: 10,
        x: 10,
        y: 10,
      })
      // The real pointerup finds no pointer left and plays nothing a second time.
      expect(m.up(mouse(10, 10, clickKey))).toEqual({ type: 'none' })
    })
  }

  test('a repeat press followed by a move with no button pressed yields no click', () => {
    const m = new GestureMachine()
    m.down({ ...mouse(10, 10, true), repeat: true })
    expect(m.move(mouse(10, 10, true, 0, false))).toEqual({ type: 'none' })
  })
})

describe('a touch that never ended', () => {
  test('a primary touch drops the stale one, and the tap clicks', () => {
    const m = new GestureMachine()
    m.down(touch(21, 300, 300, 0, true)) // its pointerup and pointercancel never arrive
    m.down(touch(22, 400, 400, 1000, true)) // the browser says this one is the only touch
    expect(m.up(touch(22, 400, 400, 1050))).toEqual({ type: 'click', pressX: 400, pressY: 400, x: 400, y: 400 })
  })

  test('a second, non-primary finger still starts a pinch', () => {
    const m = new GestureMachine()
    m.down(touch(1, 100, 100, 0, true))
    m.down(touch(2, 200, 100, 0, false))
    expect(m.move(touch(2, 300, 100, 20)).type).toBe('pinch')
  })

  test('touch ignores the mode', () => {
    for (const mode of ['drag', 'click'] as const) {
      const m = new GestureMachine(mode)
      m.down(touch(5, 40, 40, 0, true))
      expect(m.up(touch(5, 40, 40, 100))).toEqual({ type: 'click', pressX: 40, pressY: 40, x: 40, y: 40 })
    }
  })
})
