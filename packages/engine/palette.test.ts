import { assert, assertEquals } from '@std/assert'
import { defaultParams, generate } from './engine.ts'
import { assignPalette } from './palette.ts'
import type { BoardData } from './types.ts'

/** Pairs of pieces whose cells touch, each pair once. */
function neighbours(board: BoardData): [number, number][] {
  const seen = new Set<string>()
  const out: [number, number][] = []
  for (let y = 0; y < board.H; y++) {
    for (let x = 0; x < board.W; x++) {
      const a = board.owner[y * board.W + x] ?? -1
      if (a < 0) continue
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        const nx = x + dx, ny = y + dy
        if (nx >= board.W || ny >= board.H) continue
        const b = board.owner[ny * board.W + nx] ?? -1
        if (b < 0 || b === a) continue
        const key = a < b ? `${a}:${b}` : `${b}:${a}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push([a, b])
      }
    }
  }
  return out
}

const board = generate({ ...defaultParams(), W: 40, H: 40, seed: 3 }).board

Deno.test('five colours leave almost no touching pair sharing one', () => {
  const assign = assignPalette(board, 5)
  const pairs = neighbours(board)
  const same = pairs.filter(([a, b]) => assign[a] === assign[b]).length
  // Measured on 300x300: 0.2%. The floor is the graph, not the rule, so this
  // asserts the rule is adjacency-aware at all — `id % n` gives 24.4% here.
  assert(same / pairs.length < 0.05, `${same} of ${pairs.length}`)
})

Deno.test('every colour carries its share, within one piece', () => {
  const n = 5
  const assign = assignPalette(board, n)
  const tally = new Array<number>(n).fill(0)
  for (const pc of board.pieces) {
    const c = assign[pc.id] ?? 0
    tally[c] = (tally[c] ?? 0) + 1
  }
  const share = board.pieces.length / n
  for (const count of tally) assert(Math.abs(count - share) <= 1, `${count} vs ${share}`)
})

Deno.test('the same board and length give the same assignment', () => {
  assertEquals([...assignPalette(board, 4)], [...assignPalette(board, 4)])
})

Deno.test('a palette of one paints every piece with it', () => {
  const assign = assignPalette(board, 1)
  for (const pc of board.pieces) assertEquals(assign[pc.id], 0)
})

// `n <= 0` is public API: the caller may hand this a theme with an empty
// palette, or an explicit 0.
Deno.test('n <= 0 leaves every piece unassigned, not thrown on', () => {
  for (const n of [0, -1]) {
    const assign = assignPalette(board, n)
    for (const pc of board.pieces) assertEquals(assign[pc.id], -1)
  }
})

Deno.test('ids a board file skipped are addressable and untouched', () => {
  const data: BoardData = {
    W: 4,
    H: 2,
    owner: new Int32Array([5, 5, -1, -1, 7, 7, -1, -1]),
    pieces: [
      { id: 5, cells: [{ x: 1, y: 0 }, { x: 0, y: 0 }], dir: 3 },
      { id: 7, cells: [{ x: 1, y: 1 }, { x: 0, y: 1 }], dir: 3 },
    ],
  }
  const assign = assignPalette(data, 2)
  assertEquals(assign.length, 8)
  assert(assign[5] !== assign[7])
  assertEquals(assign[0], -1)
})
