// Which palette colour each piece is drawn in. Pure and DOM-free: the board is
// a graph of pieces that touch, and a palette is a colouring of it.
//
// The assignment is over EVERY piece of the board, never over the pieces
// currently drawn. A game removes pieces, and an assignment over the drawn
// subset would repaint the whole board after each move — the failure the
// id-based hue was introduced to avoid.
import type { BoardData } from '@arrowz/engine'

/** Pieces that touch, by id. Built from the owner grid in one pass over the cells. */
function adjacency(board: BoardData): Map<number, Set<number>> {
  const { W, H, owner } = board
  const adj = new Map<number, Set<number>>()
  const link = (a: number, b: number): void => {
    let set = adj.get(a)
    if (set === undefined) {
      set = new Set<number>()
      adj.set(a, set)
    }
    set.add(b)
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = owner[y * W + x] ?? -1
      if (a < 0) continue
      const right = x + 1 < W ? owner[y * W + x + 1] ?? -1 : -1
      if (right >= 0 && right !== a) link(a, right), link(right, a)
      const down = y + 1 < H ? owner[(y + 1) * W + x] ?? -1 : -1
      if (down >= 0 && down !== a) link(a, down), link(down, a)
    }
  }
  return adj
}

/**
 * A colour index per piece id: never a neighbour's, and among the free ones the
 * least used so far. The second half is what keeps the palette even — plain
 * greedy colouring gave one colour 34% of a board and left others unused.
 */
export function assignPalette(board: BoardData, n: number): Int32Array {
  let maxId = -1
  for (const pc of board.pieces) if (pc.id > maxId) maxId = pc.id
  const assign = new Int32Array(maxId + 1).fill(-1)
  if (n <= 0) return assign
  const adj = adjacency(board)
  const tally = new Int32Array(n)
  for (const pc of board.pieces) {
    const taken = new Set<number>()
    for (const nb of adj.get(pc.id) ?? []) {
      const c = assign[nb] ?? -1
      if (c >= 0) taken.add(c)
    }
    let pick = -1
    let fewest = Infinity
    for (let c = 0; c < n; c++) {
      const used = tally[c] ?? 0
      if (!taken.has(c) && used < fewest) {
        fewest = used
        pick = c
      }
    }
    if (pick < 0) {
      // Every colour is on a neighbour: the graph is denser than the palette.
      pick = 0
      for (let c = 1; c < n; c++) if ((tally[c] ?? 0) < (tally[pick] ?? 0)) pick = c
    }
    assign[pc.id] = pick
    tally[pick] = (tally[pick] ?? 0) + 1
  }
  return assign
}
