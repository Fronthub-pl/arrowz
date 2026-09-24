import type { BoardData } from '@arrowz/engine'

/**
 * Three vertical pieces on a 3×3 board, built by hand so the facts are read
 * off the picture rather than computed twice:
 *
 *   0 1 2     piece 0 points left off the edge (free), piece 1 right into
 *   0 1 2     piece 2 (blocked at 0 cells), piece 2 up off the edge (free,
 *   . . 2     three cells long).
 */
export function threeDominoes(): BoardData {
  return {
    W: 3,
    H: 3,
    owner: Int32Array.from([0, 1, 2, 0, 1, 2, -1, -1, 2]),
    pieces: [
      {
        id: 0,
        cells: [
          { x: 0, y: 0 },
          { x: 0, y: 1 },
        ],
        dir: 3,
      },
      {
        id: 1,
        cells: [
          { x: 1, y: 0 },
          { x: 1, y: 1 },
        ],
        dir: 1,
      },
      {
        id: 2,
        cells: [
          { x: 2, y: 0 },
          { x: 2, y: 1 },
          { x: 2, y: 2 },
        ],
        dir: 0,
      },
    ],
  }
}
