import { describe, expect, test } from 'vitest'
import type { Board, Piece } from '@arrowz/engine'
import { GameHost, type GameEvent, type GameTarget, MIN_SHAKE_CELLS } from './game-host.ts'

function board(W: number, H: number, owner: number[], pieces: Piece[]): Board {
  return {
    W,
    H,
    owner: Int32Array.from(owner),
    pieces,
    stats: { want: pieces.length, got: pieces.length, stall: 0, strandTrunc: 0, strandLoss: 0, n: pieces.length },
    backtracks: 0,
    remaining: 0,
  }
}

/** The same three dominoes as the engine's tests: 0 is free, 1 is blocked by 2, 2 is free. */
function threeDominoes(): Board {
  return board(3, 2, [0, 1, 2, 0, 1, 2], [
    { id: 0, cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }], dir: 3 },
    { id: 1, cells: [{ x: 1, y: 0 }, { x: 1, y: 1 }], dir: 1 },
    { id: 2, cells: [{ x: 2, y: 0 }, { x: 2, y: 1 }], dir: 0 },
  ])
}

class FakeTarget implements GameTarget {
  events: GameEvent[] = []
  exits: Array<{ pieceId: number; dir: number }> = []
  shakes: Array<{ pieceId: number; distance: number }> = []
  animateExit(pieceId: number, dir: number): Promise<void> {
    this.exits.push({ pieceId, dir })
    return Promise.resolve()
  }
  shake(pieceId: number, distance: number): Promise<void> {
    this.shakes.push({ pieceId, distance })
    return Promise.resolve()
  }
  emit(event: GameEvent): void {
    this.events.push(event)
  }
}

function hostOf(): { host: GameHost; target: FakeTarget } {
  const target = new FakeTarget()
  const host = new GameHost(target)
  host.setBoard(threeDominoes())
  return { host, target }
}

describe('a free piece', () => {
  test('rides out, is marked gone and reports how many are left', async () => {
    const { host, target } = hostOf()
    await host.click(0)
    expect(target.exits).toEqual([{ pieceId: 0, dir: 3 }])
    expect(target.events).toEqual([{ type: 'piece-removed', detail: { pieceId: 0, left: 2 } }])
    expect(host.isGone(0)).toBe(true)
    expect([...host.goneIds]).toEqual([0])
  })

  test('the last one finishes the board, after its ride', async () => {
    const { host, target } = hostOf()
    await host.click(0)
    await host.click(2)
    await host.click(1)
    expect(target.events.at(-1)).toEqual({ type: 'finished', detail: { pieces: 3 } })
    // finished comes after the ride of the piece that emptied the board
    expect(target.exits.at(-1)).toEqual({ pieceId: 1, dir: 1 })
  })
})

describe('a blocked piece', () => {
  test('shakes, names its blocker and costs a life every time', async () => {
    const { host, target } = hostOf()
    await host.click(1)
    await host.click(1)
    expect(target.events).toEqual([
      { type: 'life-lost', detail: { pieceId: 1, blockerId: 2, distance: 0 } },
      { type: 'life-lost', detail: { pieceId: 1, blockerId: 2, distance: 0 } },
    ])
    expect(host.isGone(1)).toBe(false)
  })

  test('a blocker straight ahead still bumps visibly', async () => {
    const { host, target } = hostOf()
    await host.click(1)
    // The reducer's distance is 0; a shake of 0 would draw nothing at all.
    expect(target.shakes).toEqual([{ pieceId: 1, distance: MIN_SHAKE_CELLS }])
  })
})

describe('clicks that are not moves', () => {
  test('a piece already gone, an unknown id and no board emit nothing', async () => {
    const { host, target } = hostOf()
    await host.click(0)
    target.events.length = 0
    target.exits.length = 0
    await host.click(0)
    await host.click(99)
    expect(target.events).toEqual([])
    expect(target.exits).toEqual([])

    const empty = new GameHost(new FakeTarget())
    await empty.click(0)
  })
})

describe('the gone set', () => {
  test('is one object per session, mutated in place, and replaced by a new board', async () => {
    const { host } = hostOf()
    const set = host.goneIds
    await host.click(0)
    expect(host.goneIds).toBe(set)
    expect(set.has(0)).toBe(true)
    host.setBoard(threeDominoes())
    expect(host.goneIds).not.toBe(set)
    expect(host.goneIds.size).toBe(0)
  })
})
