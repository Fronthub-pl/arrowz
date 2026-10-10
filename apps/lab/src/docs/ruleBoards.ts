/**
 * The three boards the Arrowz page plays its rule on, built by hand after
 * the README's pictures (`docs/images/rule-*.svg`): 8×6 cells, most of them
 * empty. An empty cell (-1) blocks nothing (`scan` in the engine's
 * `game.ts`), so an arrow's fate depends only on the arrows drawn.
 */
import type { BoardData, Piece } from '@fronthub/arrowz-engine'

export const RULE_BOARD_NAMES = ['rule-free', 'rule-blocked', 'rule-shape'] as const

export type RuleBoardName = (typeof RULE_BOARD_NAMES)[number]

export function isRuleBoard(name: unknown): name is RuleBoardName {
  return RULE_BOARD_NAMES.some((board) => board === name)
}

/** An arrow by its cells as `[x, y]`, arrowhead first; `dir` is 0 up, 1 right, 2 down, 3 left. */
interface Arrow {
  readonly dir: number
  readonly cells: readonly (readonly [number, number])[]
}

const W = 8
const H = 6
const UP = 0
const RIGHT = 1

function boardOf(arrows: readonly Arrow[]): BoardData {
  const owner = new Int32Array(W * H).fill(-1)
  const pieces = arrows.map((arrow, id): Piece => {
    for (const [x, y] of arrow.cells) owner[y * W + x] = id
    return { id, dir: arrow.dir, cells: arrow.cells.map(([x, y]) => ({ x, y })) }
  })
  return { W, H, owner, pieces }
}

/** The arrow the rule is about: up the left edge, then right along row 2 to its arrowhead at (2, 2). */
const HOOK: Arrow = {
  dir: RIGHT,
  cells: [
    [2, 2],
    [1, 2],
    [0, 2],
    [0, 3],
    [0, 4],
  ],
}
/** A short arrow under it. */
const SHORT: Arrow = {
  dir: RIGHT,
  cells: [
    [4, 4],
    [3, 4],
    [2, 4],
  ],
}
/** Parked across row 2 at column 5, pointing up: it stands in the path of both. */
const ACROSS: Arrow = {
  dir: UP,
  cells: [
    [5, 2],
    [5, 3],
    [5, 4],
  ],
}
/** A horseshoe opening right, its arrowhead at (4, 1). */
const HORSESHOE: Arrow = {
  dir: RIGHT,
  cells: [
    [4, 1],
    [3, 1],
    [2, 1],
    [2, 2],
    [2, 3],
    [3, 3],
    [4, 3],
  ],
}
/** A short arrow inside the horseshoe's bend. */
const INSIDE: Arrow = {
  dir: RIGHT,
  cells: [
    [4, 2],
    [3, 2],
  ],
}

export const RULE_BOARDS: Readonly<Record<RuleBoardName, BoardData>> = {
  'rule-free': boardOf([HOOK, SHORT]),
  'rule-blocked': boardOf([HOOK, SHORT, ACROSS]),
  'rule-shape': boardOf([HORSESHOE, INSIDE]),
}
