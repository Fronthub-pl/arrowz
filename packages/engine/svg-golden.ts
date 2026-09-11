// The boards and options whose toSvg output is pinned by svg-golden.json.
// The recorder and the test share this list so they can never disagree.
import { defaultParams } from './engine.ts'
import type { Board, GenerateOptions, Params, SvgOptions } from './types.ts'

export interface SvgGoldenCase {
  name: string
  params: Params
  /** What generate() gets beside the knobs: the void cases carve holes, outside the envelope. */
  gen: GenerateOptions
  opts: SvgOptions
  /** Runs on the generated board before toSvg, to reach branches the generator does not. */
  mutate?: (board: Board) => void
}

/** Clears the cells of a horizontal run, as the generator does when it gives up on them. */
function clearRun(board: Board, x0: number, x1: number, y: number): void {
  for (let x = x0; x <= x1; x++) board.owner[y * board.W + x] = -1
}

export const SVG_GOLDEN_CASES: readonly SvgGoldenCase[] = [
  { name: 'defaults', params: defaultParams(), gen: {}, opts: {} },
  {
    name: 'skeleton-top',
    params: { ...defaultParams(), W: 100, H: 200, giants: 4 },
    gen: {},
    opts: { cell: 12, top: 5 },
  },
  {
    name: 'colored-stick',
    params: defaultParams(),
    gen: {},
    opts: { colored: true, strokeRatio: 0.7, headWidth: 0.9, headHeight: 1.1 },
  },
  {
    name: 'thin-narrow-head',
    params: defaultParams(),
    gen: {},
    opts: { strokeRatio: 0.3, headWidth: 0.2 },
  },
  {
    name: 'voids',
    params: { ...defaultParams(), W: 40, H: 40, seed: 1 },
    gen: { unchecked: true, voidFrac: 0.1 },
    opts: { voids: true, cell: 8 },
  },
  // voidFrac punches holes as owner -2, which the void strips never draw: only
  // uncarved cells (-1) get a strip, so this case clears a few by hand — two
  // runs of different lengths on one row, a third row and a lone corner cell.
  {
    name: 'voids-strips',
    params: { ...defaultParams(), W: 40, H: 40, seed: 1 },
    gen: { unchecked: true, voidFrac: 0.1 },
    opts: { voids: true, cell: 8 },
    mutate: (board) => {
      clearRun(board, 1, 3, 0)
      clearRun(board, 10, 10, 0)
      clearRun(board, 0, 5, 7)
      clearRun(board, 39, 39, 39)
    },
  },
]
