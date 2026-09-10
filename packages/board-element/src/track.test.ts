import { describe, expect, test } from 'vitest'
import type { Cell } from '@arrowz/engine'
import {
  EXIT_MAX_MS,
  EXIT_MIN_MS,
  EXIT_SPEED,
  exitDistance,
  exitMs,
  shakeShift,
  trackLine,
  trackPoint,
} from './track.ts'

const RIGHT = 1, DOWN = 2, LEFT = 3, UP = 0

/** Head at (3,2) facing right, body running left: a straight piece of three. */
const straight: Cell[] = [{ x: 3, y: 2 }, { x: 2, y: 2 }, { x: 1, y: 2 }]

/** Head at (3,1) facing right, one cell left, then two down: an L. */
const bent: Cell[] = [{ x: 3, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }]

function close(p: [number, number], x: number, y: number): void {
  expect(p[0]).toBeCloseTo(x, 9)
  expect(p[1]).toBeCloseTo(y, 9)
}

describe('trackPoint', () => {
  test('arc zero is the centre of the head cell', () => {
    close(trackPoint(straight, RIGHT, 0), 3.5, 2.5)
  })

  test('a whole arc is the centre of that cell', () => {
    close(trackPoint(straight, RIGHT, 2), 1.5, 2.5)
  })

  test('a fraction lands between two cell centres', () => {
    close(trackPoint(straight, RIGHT, 0.25), 3.25, 2.5)
  })

  test('a negative arc runs out along the exit ray', () => {
    close(trackPoint(straight, RIGHT, -2), 5.5, 2.5)
  })

  test('a fraction past a corner follows the second leg, not the diagonal', () => {
    close(trackPoint(bent, RIGHT, 1.5), 2.5, 2)
  })

  test('past the tail it runs on behind the last leg', () => {
    close(trackPoint(bent, RIGHT, 3.5), 2.5, 4)
  })

  test('past the tail of a single cell it runs back along the piece axis', () => {
    close(trackPoint([{ x: 3, y: 1 }], RIGHT, 0.5), 3, 1.5)
  })
})

describe('trackLine', () => {
  test('at rest it is the front point and every cell centre behind it', () => {
    const pts = trackLine(bent, RIGHT, 0.32, 0)
    expect(pts.length).toBe(4)
    close(pts[0] as [number, number], 3.18, 1.5)
    close(pts[1] as [number, number], 2.5, 1.5)
    close(pts[2] as [number, number], 2.5, 2.5)
    close(pts[3] as [number, number], 2.5, 3.5)
  })

  test('a shift keeps the corner, so the line never cuts it', () => {
    const pts = trackLine(bent, RIGHT, 0.32, 1)
    close(pts[0] as [number, number], 4.18, 1.5)
    close(pts[1] as [number, number], 3.5, 1.5)
    close(pts[2] as [number, number], 2.5, 1.5)
    close(pts[3] as [number, number], 2.5, 2.5)
    expect(pts.length).toBe(4)
  })

  test('once the whole piece is on the ray it is a single straight segment', () => {
    const pts = trackLine(bent, RIGHT, 0.32, 5)
    expect(pts.length).toBe(2)
    close(pts[0] as [number, number], 8.18, 1.5)
    close(pts[1] as [number, number], 5.5, 1.5)
  })

  test('a single cell keeps its single point', () => {
    const pts = trackLine([{ x: 3, y: 1 }], RIGHT, 0.32, 0)
    expect(pts.length).toBe(1)
    close(pts[0] as [number, number], 3.18, 1.5)
  })

  test('a straight piece rides exactly as far as it is shifted', () => {
    const pts = trackLine(straight, RIGHT, 0.32, 1.5)
    close(pts[0] as [number, number], 4.68, 2.5)
    close(pts[pts.length - 1] as [number, number], 3, 2.5)
  })
})

describe('exitDistance', () => {
  test('is the way to the faced edge plus the length of the piece plus one', () => {
    expect(exitDistance(straight, RIGHT, 8, 8)).toBeCloseTo(8 - 3 + 3 + 1, 9)
    expect(exitDistance(straight, LEFT, 8, 8)).toBeCloseTo(3 + 1 + 3 + 1, 9)
    expect(exitDistance(straight, UP, 8, 8)).toBeCloseTo(2 + 1 + 3 + 1, 9)
    expect(exitDistance(straight, DOWN, 8, 8)).toBeCloseTo(8 - 2 + 3 + 1, 9)
  })
})

describe('exitMs', () => {
  test('a middling ride takes the time its distance costs at the exit speed', () => {
    expect(exitMs(10)).toBeCloseTo(10 / EXIT_SPEED * 1000, 9)
  })

  test('a very short ride still lasts long enough to be seen', () => {
    expect(exitMs(1)).toBe(EXIT_MIN_MS)
  })

  test('a very long ride is capped', () => {
    expect(exitMs(200)).toBe(EXIT_MAX_MS)
  })
})

describe('shakeShift', () => {
  test('starts and ends at rest', () => {
    expect(shakeShift(0, 0.3)).toBeCloseTo(0, 9)
    expect(shakeShift(1, 0.3)).toBeCloseTo(0, 9)
  })

  test('reaches the full nudge at the turning point', () => {
    expect(shakeShift(0.4, 0.3)).toBeCloseTo(0.3, 9)
  })

  test('rises on the way out and falls on the way back', () => {
    expect(shakeShift(0.2, 0.3)).toBeGreaterThan(shakeShift(0.1, 0.3))
    expect(shakeShift(0.8, 0.3)).toBeLessThan(shakeShift(0.6, 0.3))
  })
})
