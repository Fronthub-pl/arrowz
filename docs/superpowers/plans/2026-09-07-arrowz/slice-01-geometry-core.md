# Slice 1 — Geometry core: corridor and move legality

> **For agentic implementers:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans`. Steps have checkboxes (`- [ ]`).

**Goal:** Implement the board data model and `probeMove` — the single
function that decides whether a move is legal — with the full set of tests
from spec §12.

**Architecture:** The whole game rests on a single observation: **a piece's
corridor is a single ray from the head cell to the edge, in the direction of
the arrowhead**. The shape of the body has no effect on it, because the piece
rides on its own track. `probeMove` is a single pass along that ray,
`O(max(W,H))`. The generator (Slice 2) and the solver (Slice 3) will use
**this same** corridor definition — two separate implementations could drift
apart and produce unsolvable boards (risk #1 from §14).

**Stack:** TypeScript strict, Vitest on Node (`npm run test:core`).

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md` (§2, §5, §6,
§12.1–8, §12.9a, §12.24–25)

**Map:** `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`

## Global Constraints

The constraints from the implementation map apply. Critical for this slice:

- `cells[0]` is the cell with the **arrowhead**; the body lies **behind** the
  arrowhead. For an arrowhead at `(5,3)` with `dir = 1` (right), the next cell
  of the path is `(4,3)`, not `(6,3)`. This is the most common sign error in
  this module (spec §5).
- `occupancy` is an `Int32Array`, `-1` = empty cell.
- **Do not check "is the space in front of the whole shape free."** That would
  be a regression to the abandoned rigid-translation rule. Tests 1 and 3
  exist solely to catch that regression.

## File Structure

| File | Responsibility |
|---|---|
| `src/core/types.ts` | `Dir`, `Coord`, `Piece`, `Board`, `BoardMetrics`, `GeneratorParams`, `GenerationReport`, direction vectors |
| `src/core/geometry.ts` | grid arithmetic: cell index, inside-bounds test, direction rotation |
| `src/core/board.ts` | `createBoard`, `pieceAt`, `headRay`, `probeMove`, `removePiece`, `validateBoard` |
| `src/core/testing/fixtures.ts` | building boards in tests (`piece`, `boardOf`) |
| `src/core/geometry.spec.ts` | arithmetic and direction-sign tests (§12.8) |
| `src/core/board.spec.ts` | move-legality tests (§12.1–8, 24, 25) |

---

### Task 1: Data model and grid arithmetic

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/geometry.ts`
- Test: `src/core/geometry.spec.ts`

**Interfaces:**
- Produces (used by **all** subsequent slices):
  - `type Dir = 0 | 1 | 2 | 3`
  - `interface Coord { x: number; y: number }`
  - `interface Piece { id: number; cells: Coord[]; dir: Dir }`
  - `interface Board { width: number; height: number; occupancy: Int32Array; pieces: Map<number, Piece>; metrics: BoardMetrics }`
  - `const DIR_VECTORS: readonly Coord[]`, `const EMPTY = -1`
  - `cellIndex(width, x, y): number`, `isInside(width, height, x, y): boolean`,
    `oppositeDir(dir): Dir`, `stepFrom(c, dir): Coord`

- [ ] **Step 1: Write a failing test for arithmetic and direction sign**

The last case is **test 8 from §12** — it guards that the body lies behind
the arrowhead.

```typescript
// src/core/geometry.spec.ts
import { DIR_VECTORS } from './types';
import { cellIndex, isInside, oppositeDir, stepFrom } from './geometry';

describe('grid arithmetic', () => {
  it('computes the cell index row by row', () => {
    expect(cellIndex(10, 0, 0)).toBe(0);
    expect(cellIndex(10, 3, 0)).toBe(3);
    expect(cellIndex(10, 0, 1)).toBe(10);
    expect(cellIndex(10, 4, 2)).toBe(24);
  });

  it('recognizes cells outside the board', () => {
    expect(isInside(5, 4, 0, 0)).toBe(true);
    expect(isInside(5, 4, 4, 3)).toBe(true);
    expect(isInside(5, 4, 5, 3)).toBe(false);
    expect(isInside(5, 4, 0, -1)).toBe(false);
    expect(isInside(5, 4, -1, 0)).toBe(false);
    expect(isInside(5, 4, 4, 4)).toBe(false);
  });

  it('assigns the correct vectors to each direction', () => {
    expect(DIR_VECTORS[0]).toEqual({ x: 0, y: -1 }); // up
    expect(DIR_VECTORS[1]).toEqual({ x: 1, y: 0 });  // right
    expect(DIR_VECTORS[2]).toEqual({ x: 0, y: 1 });  // down
    expect(DIR_VECTORS[3]).toEqual({ x: -1, y: 0 }); // left
  });

  it('reverses a direction', () => {
    expect(oppositeDir(0)).toBe(2);
    expect(oppositeDir(1)).toBe(3);
    expect(oppositeDir(2)).toBe(0);
    expect(oppositeDir(3)).toBe(1);
  });

  // §12.8 — direction sign. The body lies BEHIND the arrowhead.
  it('places the body behind the arrowhead, not in front of it', () => {
    const head = { x: 5, y: 3 };
    const dir = 1; // right
    // The first body cell is a step in the direction OPPOSITE the arrowhead.
    expect(stepFrom(head, oppositeDir(dir))).toEqual({ x: 4, y: 3 });
    // The first corridor cell is a step in the direction of the arrowhead.
    expect(stepFrom(head, dir)).toEqual({ x: 6, y: 3 });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm run test:core -- geometry
```

Expected: FAIL — modules `./types` and `./geometry` are missing.

- [ ] **Step 3: Define the types**

```typescript
// src/core/types.ts

/** 0 = up, 1 = right, 2 = down, 3 = left. */
export type Dir = 0 | 1 | 2 | 3;

export interface Coord {
  x: number;
  y: number;
}

/** Displacement vectors for each direction. Order must match `Dir`. */
export const DIR_VECTORS: readonly Coord[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export const ALL_DIRS: readonly Dir[] = [0, 1, 2, 3];

/** Value in `occupancy` meaning a cell that belongs to no piece. */
export const EMPTY = -1;

/**
 * A board piece: a self-avoiding polyline over grid cells.
 * `cells[0]` is the cell with the arrowhead, subsequent cells run deeper
 * into the body. `dir` is the direction from `cells[1]` to `cells[0]` —
 * i.e. the direction of travel.
 */
export interface Piece {
  id: number;
  cells: Coord[];
  dir: Dir;
}

/**
 * Difficulty metrics computed on a generated board (§9).
 * They travel together with the board, because scoring (§10) is based on
 * the complexity of the specific board, not on the level label — the
 * configurator makes that label unreliable.
 */
export interface BoardMetrics {
  /** Number of pieces on the board. */
  n: number;
  /** Share of pieces free at the start: sinks of the blocking graph. */
  f0: number;
  /** COUNT (not share) of pieces blocked by exactly one other piece. */
  almost1: number;
  /** Depth of the blocking graph — the longest path. */
  d: number;
  /** Mean corridor length in cells. */
  meanCorridorLen: number;
  /**
   * Direction-distribution entropy, normalized to [0,1].
   * A board with pieces all in one direction scores 0, an even
   * distribution scores 1. Feeds into scoring (Slice 5) as a weight for
   * apparent difficulty.
   */
  dirEntropy: number;
  /** Length-distribution entropy across buckets, normalized to [0,1]. */
  lenEntropy: number;
}

/** Uncomputed metrics. Filled in by Slice 3 via `withMetrics`. */
export const EMPTY_METRICS: BoardMetrics = {
  n: 0,
  f0: 0,
  almost1: 0,
  d: 0,
  meanCorridorLen: 0,
  dirEntropy: 0,
  lenEntropy: 0,
};

export interface Board {
  width: number;
  height: number;
  /** Length `width * height`; `EMPTY` or a piece id. */
  occupancy: Int32Array;
  pieces: Map<number, Piece>;
  metrics: BoardMetrics;
}

/**
 * Generator parameters — a single structure shared by presets and the
 * configurator. The Easy–Nightmare presets are named instances of this
 * type, not a separate code path.
 */
export interface GeneratorParams {
  width: number;
  height: number;
  /** Upper bound on piece length; defaults to round(2.5 * max(W, H)). */
  maxLength: number;
  /** Bucket weights [short 2–6, medium 7–15, long 16–maxLength]. Sum = 1. */
  bucketWeights: readonly [short: number, medium: number, long: number];
  /** Probability of continuing straight as the path grows. */
  straightBias: number;
  /** Bonus for a lateral move relative to a move deeper in. */
  lateralWeight: number;
  /** Strength of the Warnsdorff heuristic. 0 disables it — then 1 board in 30 fails to close. */
  warnsdorff: number;
  /**
   * Head-selection preference: 1 = deepest (tunnels, low f0),
   * -1 = shallowest (layers, high f0), 0 = no preference.
   */
  headBias: -1 | 0 | 1;
  seed: number;
}

/** What the generator actually achieved — geometry can refuse (§11). */
export interface GenerationReport {
  params: GeneratorParams;
  actualPieceCount: number;
  backtracks: number;
  restarts: number;
  /** Length histogram in buckets 2–6, 7–15, 16–49, 50+. */
  lengthHistogram: readonly [number, number, number, number];
  /** Share of board area occupied by pieces longer than 15 cells. */
  longAreaShare: number;
  maxLength: number;
  meanLength: number;
  generationMs: number;
}
```

- [ ] **Step 4: Implement the arithmetic**

```typescript
// src/core/geometry.ts
import { Coord, Dir, DIR_VECTORS } from './types';

export function cellIndex(width: number, x: number, y: number): number {
  return y * width + x;
}

export function isInside(width: number, height: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

export function oppositeDir(dir: Dir): Dir {
  return ((dir + 2) % 4) as Dir;
}

export function stepFrom(c: Coord, dir: Dir): Coord {
  const v = DIR_VECTORS[dir]!;
  return { x: c.x + v.x, y: c.y + v.y };
}

/** Whether two directions are perpendicular — used when counting turns. */
export function isPerpendicular(a: Dir, b: Dir): boolean {
  return (a % 2) !== (b % 2);
}
```

- [ ] **Step 5: Run the tests — they must pass**

```bash
npm run test:core -- geometry
```

Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Introduce the board data model and grid arithmetic"
```

---

### Task 2: Board construction and invariants

**Files:**
- Create: `src/core/board.ts`
- Create: `src/core/testing/fixtures.ts`
- Test: `src/core/board.spec.ts`

**Interfaces:**
- Consumes: types and arithmetic from Task 1.
- Produces:
  - `createBoard(width: number, height: number, pieces: readonly Piece[]): Board`
  - `pieceAt(board: Board, x: number, y: number): number` (returns `EMPTY` or an id)
  - `validateBoard(board: Board): string[]` — list of invariant violations,
    empty when the board is valid. Used in Slice 2 and 3 across thousands of
    seeds.
  - `piece(id, dir, cells): Piece` and `boardOf(width, height, pieces): Board`
    from `testing/fixtures.ts`.

- [ ] **Step 1: Write failing invariant tests**

```typescript
// src/core/board.spec.ts
import { EMPTY } from './types';
import { createBoard, pieceAt, validateBoard } from './board';
import { boardOf, piece } from './testing/fixtures';

describe('createBoard', () => {
  it('records the owner of every cell', () => {
    // Horizontal piece of length 3, arrowhead at (2,0), pointing right.
    const b = createBoard(4, 2, [piece(0, 1, [[2, 0], [1, 0], [0, 0]])]);
    expect(pieceAt(b, 2, 0)).toBe(0);
    expect(pieceAt(b, 1, 0)).toBe(0);
    expect(pieceAt(b, 0, 0)).toBe(0);
    expect(pieceAt(b, 3, 0)).toBe(EMPTY);
    expect(pieceAt(b, 0, 1)).toBe(EMPTY);
  });

  it('keeps pieces indexed by their id', () => {
    const b = createBoard(4, 1, [piece(7, 1, [[1, 0], [0, 0]])]);
    expect(b.pieces.get(7)?.dir).toBe(1);
    expect(b.pieces.size).toBe(1);
  });
});

describe('validateBoard', () => {
  it('reports nothing for a valid, fully covered board', () => {
    // 2x2 covered by two vertical dominoes pointing up.
    const b = boardOf(2, 2, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[1, 0], [1, 1]]),
    ]);
    expect(validateBoard(b)).toEqual([]);
  });

  it('detects an unassigned cell', () => {
    const b = boardOf(2, 2, [piece(0, 0, [[0, 0], [0, 1]])]);
    expect(validateBoard(b).join(' ')).toMatch(/unassigned/i);
  });

  it('detects a piece of length 1', () => {
    const b = boardOf(1, 1, [piece(0, 0, [[0, 0]])]);
    expect(validateBoard(b).join(' ')).toMatch(/length 1|shorter than 2/i);
  });

  it('detects a broken path continuity', () => {
    const b = boardOf(3, 1, [piece(0, 1, [[2, 0], [0, 0]])]);
    expect(validateBoard(b).join(' ')).toMatch(/continuity/i);
  });

  it('detects a cell visited twice', () => {
    const b = boardOf(2, 1, [piece(0, 1, [[1, 0], [0, 0], [1, 0]])]);
    expect(validateBoard(b).join(' ')).toMatch(/twice|repeat/i);
  });

  it('detects a direction inconsistent with the last segment', () => {
    // The body lies to the right of the arrowhead, so dir must be 3 (left), but it is 1.
    const b = boardOf(2, 1, [piece(0, 1, [[0, 0], [1, 0]])]);
    expect(validateBoard(b).join(' ')).toMatch(/direction/i);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm run test:core -- board
```

Expected: FAIL — module `./board` is missing.

- [ ] **Step 3: Write the test helpers**

```typescript
// src/core/testing/fixtures.ts
import { createBoard } from '../board';
import { Board, Dir, Piece } from '../types';

/**
 * Builds a piece from a list of [x, y] pairs. The FIRST pair is the
 * arrowhead cell. The array notation is terse, and there are dozens of
 * move-legality tests.
 */
export function piece(id: number, dir: Dir, cells: readonly (readonly [number, number])[]): Piece {
  return { id, dir, cells: cells.map(([x, y]) => ({ x, y })) };
}

export function boardOf(width: number, height: number, pieces: readonly Piece[]): Board {
  return createBoard(width, height, pieces);
}
```

- [ ] **Step 4: Implement `createBoard`, `pieceAt` and `validateBoard`**

```typescript
// src/core/board.ts
import { cellIndex, isInside, oppositeDir, stepFrom } from './geometry';
import { Board, BoardMetrics, Coord, EMPTY, EMPTY_METRICS, Piece } from './types';

export function createBoard(
  width: number,
  height: number,
  pieces: readonly Piece[],
  metrics: BoardMetrics = EMPTY_METRICS,
): Board {
  const occupancy = new Int32Array(width * height).fill(EMPTY);
  const map = new Map<number, Piece>();
  for (const p of pieces) {
    map.set(p.id, p);
    for (const c of p.cells) {
      if (isInside(width, height, c.x, c.y)) occupancy[cellIndex(width, c.x, c.y)] = p.id;
    }
  }
  return { width, height, occupancy, pieces: map, metrics };
}

export function pieceAt(board: Board, x: number, y: number): number {
  if (!isInside(board.width, board.height, x, y)) return EMPTY;
  return board.occupancy[cellIndex(board.width, x, y)]!;
}

/**
 * Checks the board's invariants and returns the list of violations (empty
 * when everything is fine). Does not throw, because we run this in a loop
 * over thousands of seeds and want to see ALL problems at once, not just
 * the first one.
 */
export function validateBoard(board: Board): string[] {
  const problems: string[] = [];
  const { width, height } = board;
  const seen = new Int32Array(width * height).fill(EMPTY);

  for (const p of board.pieces.values()) {
    if (p.cells.length < 2) {
      problems.push(`Piece ${p.id} has length 1 — a piece shorter than 2 cells has no direction.`);
    }
    const visited = new Set<number>();
    for (let i = 0; i < p.cells.length; i++) {
      const c = p.cells[i]!;
      if (!isInside(width, height, c.x, c.y)) {
        problems.push(`Piece ${p.id}: cell (${c.x},${c.y}) lies outside the board.`);
        continue;
      }
      const idx = cellIndex(width, c.x, c.y);
      if (visited.has(idx)) {
        problems.push(`Piece ${p.id} visits cell (${c.x},${c.y}) twice.`);
      }
      visited.add(idx);
      if (seen[idx] !== EMPTY && seen[idx] !== p.id) {
        problems.push(`Cell (${c.x},${c.y}) belongs to pieces ${seen[idx]} and ${p.id}.`);
      }
      seen[idx] = p.id;
      if (i > 0) {
        const prev = p.cells[i - 1]!;
        const dist = Math.abs(prev.x - c.x) + Math.abs(prev.y - c.y);
        if (dist !== 1) {
          problems.push(`Piece ${p.id}: broken continuity between (${prev.x},${prev.y}) and (${c.x},${c.y}).`);
        }
      }
    }
    // The arrowhead direction must match the last segment: a step BACKWARD
    // from the head should land on cells[1]. This is where we catch the
    // sign error.
    const head = p.cells[0];
    const neck = p.cells[1];
    if (head && neck) {
      const expected = stepFrom(head, oppositeDir(p.dir));
      if (expected.x !== neck.x || expected.y !== neck.y) {
        problems.push(
          `Piece ${p.id}: direction ${p.dir} does not match the last segment — ` +
            `the body should start at (${expected.x},${expected.y}), but starts at (${neck.x},${neck.y}).`,
        );
      }
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (seen[cellIndex(width, x, y)] === EMPTY) {
        problems.push(`Cell (${x},${y}) remains unassigned.`);
      }
    }
  }
  return problems;
}

/** Sum of piece lengths. On a valid board it equals width * height. */
export function coveredCells(board: Board): number {
  let total = 0;
  for (const p of board.pieces.values()) total += p.cells.length;
  return total;
}

export function headOf(p: Piece): Coord {
  return p.cells[0]!;
}
```

- [ ] **Step 5: Run the tests — they must pass**

```bash
npm run test:core -- board
```

Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add board construction and invariant checking"
```

---

### Task 3: Corridor and move legality

**Files:**
- Modify: `src/core/board.ts`
- Test: `src/core/board.spec.ts` (append a block)

**Interfaces:**
- Consumes: `Board`, `Piece`, `pieceAt` from Task 2.
- Produces:
  - `type ProbeResult = { free: true } | { free: false; distance: number; blockerId: number }`
  - `probeMove(board: Board, piece: Piece): ProbeResult`
  - `headRay(board: Board, piece: Piece): Coord[]` — the ray's cells from the
    head to the edge, excluding the head cell. Slice 2 and 3 use **this
    same** function.

This is the **heart of the project**. Everything else (generator, solver,
scoring) follows from the fact that the corridor does not depend on board
state.

- [ ] **Step 1: Write failing legality tests — the full set from §12**

```typescript
// append to src/core/board.spec.ts
import { headRay, probeMove } from './board';

describe('probeMove — the corridor is a ray from the head', () => {
  // §12.4 — a piece lying along the exit edge, perpendicular to its own direction.
  it('treats as free a piece lying along the exit edge', () => {
    // Arrowhead at (0,0) points left, so the body stretches right along the row.
    const b = boardOf(4, 2, [
      piece(0, 3, [[0, 0], [1, 0], [2, 0], [3, 0]]),
      piece(1, 1, [[3, 1], [2, 1], [1, 1], [0, 1]]),
    ]);
    expect(probeMove(b, b.pieces.get(0)!)).toEqual({ free: true });
    expect(probeMove(b, b.pieces.get(1)!)).toEqual({ free: true });
  });

  // §12.1 — a U shape with a foreign piece trapped in its concavity does NOT block.
  // This test exists to catch a regression to the rigid-translation rule.
  it('is not blocked by a piece trapped in the concavity of a U shape', () => {
    // U open upward: arms in columns 0 and 2, base in row 2.
    // Arrowhead at (0,0) points up. A foreign piece sits at (1,1) — inside the U.
    const u = piece(0, 0, [
      [0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0],
    ]);
    const intruder = piece(1, 2, [[1, 1], [1, 0]]);
    const b = boardOf(3, 3, [u, intruder]);
    // The ray from the head (0,0) going up immediately leaves the board.
    expect(probeMove(b, b.pieces.get(0)!)).toEqual({ free: true });
  });

  // §12.3 — the second arm of an L shape with a foreign piece in front of it does NOT block.
  it('ignores what stands in front of the second arm of an L shape', () => {
    // L: arrowhead at (0,0) pointing up, body goes down to (0,1) and turns to (1,1), (2,1).
    const l = piece(0, 0, [[0, 0], [0, 1], [1, 1], [2, 1]]);
    // A foreign piece stands above the horizontal arm, at (2,0) — in the arm's
    // path, but NOT on the ray from the head.
    const other = piece(1, 1, [[2, 0], [1, 0]]);
    const b = boardOf(3, 2, [l, other]);
    expect(probeMove(b, b.pieces.get(0)!)).toEqual({ free: true });
  });

  // §12.2 — a ray passing through the piece's own cells does not block.
  it('is not blocked by its own cells lying in front of the head', () => {
    // The piece coils so that its body lies ABOVE the head: arrowhead at (1,2)
    // points up, and cells (1,1) and (1,0) on its ray belong to itself.
    const snake = piece(0, 0, [
      [1, 2], // arrowhead, direction: up
      [1, 3], [0, 3], [0, 2], [0, 1], [0, 0], [1, 0], [1, 1],
    ]);
    const b = boardOf(2, 4, [snake]);
    // The ray from (1,2) going up passes (1,1) and (1,0) — both are its own.
    expect(probeMove(b, b.pieces.get(0)!)).toEqual({ free: true });
  });

  // §12.6 — two pieces on the same line: the rear one is blocked, the front one is free.
  it('blocks only the piece standing behind another on the same line', () => {
    const front = piece(0, 0, [[0, 0], [0, 1]]);
    const back = piece(1, 0, [[0, 2], [0, 3]]);
    const b = boardOf(1, 4, [front, back]);
    expect(probeMove(b, b.pieces.get(0)!)).toEqual({ free: true });
    expect(probeMove(b, b.pieces.get(1)!)).toEqual({ free: false, distance: 1, blockerId: 0 });
  });

  // §12.6 — two parallel pieces side by side: both free.
  it('does not confuse neighboring lines', () => {
    const a = piece(0, 0, [[0, 0], [0, 1]]);
    const c = piece(1, 0, [[1, 0], [1, 1]]);
    const b = boardOf(2, 2, [a, c]);
    expect(probeMove(b, b.pieces.get(0)!)).toEqual({ free: true });
    expect(probeMove(b, b.pieces.get(1)!)).toEqual({ free: true });
  });

  // §12.5 — a blocker in the very last cell at the edge (inclusive loop bound).
  it('sees a blocker standing exactly at the edge', () => {
    // A 2×4 board fully covered by four dominoes.
    const edge = piece(0, 3, [[0, 0], [1, 0]]);     // arrowhead left, row 0
    const filler = piece(2, 3, [[0, 1], [1, 1]]);   // arrowhead left, row 1
    const runner = piece(1, 0, [[0, 2], [0, 3]]);   // arrowhead up, column 0
    const tail = piece(3, 2, [[1, 3], [1, 2]]);     // arrowhead down, column 1
    const b = boardOf(2, 4, [edge, filler, runner, tail]);
    // The runner's ray from (0,2) going up hits filler at (0,1) first.
    expect(probeMove(b, b.pieces.get(1)!)).toEqual({ free: false, distance: 1, blockerId: 2 });
  });

  // §12.8 — an arrowhead pointing deeper into the board is legal.
  it('handles a corridor running across the whole board', () => {
    // Arrowhead at (1,0) points right, so the body MUST go left: (0,0), then down.
    const hook = piece(0, 1, [[1, 0], [0, 0], [0, 1]]);
    const b = boardOf(5, 2, [hook]);
    expect(probeMove(b, b.pieces.get(0)!)).toEqual({ free: true });
    expect(headRay(b, b.pieces.get(0)!)).toEqual([
      { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 },
    ]);
  });
});

describe('probeMove — bounce distance (§12.24, §12.25)', () => {
  it('returns distance 1 for a blocker right in front of the head', () => {
    const runner = piece(0, 0, [[0, 1], [0, 2]]);
    const blocker = piece(1, 3, [[0, 0], [1, 0]]); // arrowhead left, body right
    const b = boardOf(2, 3, [runner, blocker]);
    expect(probeMove(b, b.pieces.get(0)!)).toEqual({ free: false, distance: 1, blockerId: 1 });
  });

  it('returns the distance to a far blocker', () => {
    const runner = piece(0, 0, [[0, 5], [0, 6]]);
    const blocker = piece(1, 3, [[0, 0], [1, 0]]);
    const b = boardOf(2, 7, [runner, blocker]);
    expect(probeMove(b, b.pieces.get(0)!)).toEqual({ free: false, distance: 5, blockerId: 1 });
  });

  // §12.24 and §12.9a — the body lies IN FRONT of its own head: the ray
  // passes its own cells first, so the distance is measured from the last
  // own cell passed, not from the head. This is the test for `lastOwn`.
  it('measures distance from the last own cell passed', () => {
    // A 2×6 board. Arrowhead at (0,3) points up; the body goes down beneath
    // the head, loops around column 1, and comes back to column 0 ABOVE the
    // head — so cells (0,2) and (0,1) lie on its own ray.
    const snake = piece(0, 0, [
      [0, 3], [0, 4], [1, 4], [1, 3], [1, 2], [1, 1], [0, 1], [0, 2],
    ]);

    // Without a blocker: the ray passes (0,2) and (0,1) — its own — and (0,0) is empty.
    const b1 = boardOf(2, 6, [snake]);
    expect(probeMove(b1, b1.pieces.get(0)!)).toEqual({ free: true });

    // With a blocker at (0,0): steps 1 and 2 are own (lastOwn = 2), step 3 is
    // foreign, so the bounce distance is 3 − 2 = 1, NOT 3.
    const blocker = piece(1, 3, [[0, 0], [1, 0]]);
    const b2 = boardOf(2, 6, [snake, blocker]);
    expect(probeMove(b2, b2.pieces.get(0)!)).toEqual({ free: false, distance: 1, blockerId: 1 });
  });

  // §12.25 — with several blockers, the NEAREST one counts.
  it('points to the nearest blocker when there are several', () => {
    const runner = piece(0, 0, [[0, 4], [0, 5]]);
    const near = piece(1, 3, [[0, 2], [1, 2]]);
    const far = piece(2, 3, [[0, 0], [1, 0]]);
    const filler = piece(3, 3, [[0, 1], [1, 1]]);
    const b = boardOf(2, 6, [runner, near, far, filler]);
    expect(probeMove(b, b.pieces.get(0)!)).toEqual({ free: false, distance: 2, blockerId: 1 });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm run test:core -- board
```

Expected: FAIL — `probeMove is not a function`.

- [ ] **Step 3: Implement the corridor**

```typescript
// append to src/core/board.ts
import { DIR_VECTORS } from './types';

export type ProbeResult =
  | { free: true }
  | { free: false; distance: number; blockerId: number };

/**
 * Corridor cells: the ray from the head cell to the edge, in the direction
 * of the arrowhead. Excludes the head cell. The body's shape has no effect
 * whatsoever on the ray — the piece rides on its own track, so the body
 * never enters a foreign cell (§6).
 */
export function headRay(board: Board, p: Piece): Coord[] {
  const v = DIR_VECTORS[p.dir]!;
  const head = headOf(p);
  const out: Coord[] = [];
  let x = head.x + v.x;
  let y = head.y + v.y;
  while (isInside(board.width, board.height, x, y)) {
    out.push({ x, y });
    x += v.x;
    y += v.y;
  }
  return out;
}

/**
 * Whether a piece can leave the board, and if not — how far it travels and
 * what it hits.
 *
 * A single pass along the ray from the head, O(max(W,H)).
 * `lastOwn` remembers the step number of the last own cell passed: the
 * track can cross its own ray, in which case the piece travels over it
 * unobstructed, so the bounce distance is measured from that point, not
 * from the head (§6, §12.24).
 *
 * NOTE: do not check here whether the path is free for the WHOLE shape —
 * that is the abandoned rigid-translation rule. Tests §12.1 and §12.3
 * catch that regression.
 */
export function probeMove(board: Board, p: Piece): ProbeResult {
  const v = DIR_VECTORS[p.dir]!;
  const head = headOf(p);
  let x = head.x + v.x;
  let y = head.y + v.y;
  let step = 1;
  let lastOwn = 0;

  while (isInside(board.width, board.height, x, y)) {
    const owner = board.occupancy[cellIndex(board.width, x, y)]!;
    if (owner === p.id) {
      lastOwn = step;
    } else if (owner !== EMPTY) {
      return { free: false, distance: step - lastOwn, blockerId: owner };
    }
    x += v.x;
    y += v.y;
    step++;
  }
  return { free: true };
}
```

- [ ] **Step 4: Run the tests — they must pass**

```bash
npm run test:core -- board
```

Expected: PASS. If the "U shape" or "second L arm" test fails, the
implementation is checking the shadow of the whole shape instead of the ray
from the head — go back to the rule in §6, do not patch the test.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Implement the corridor and move-legality test"
```

---

### Task 4: Removing a piece from the board

**Files:**
- Modify: `src/core/board.ts`
- Test: `src/core/board.spec.ts` (append a block)

**Interfaces:**
- Produces: `removePiece(board: Board, pieceId: number): Board` — returns a
  **new** `Board`; the original is left untouched. Slice 5 (session reducer)
  relies on this function being pure.

- [ ] **Step 1: Write failing tests**

```typescript
// append to src/core/board.spec.ts
import { removePiece } from './board';

describe('removePiece', () => {
  it('frees the cells of the removed piece', () => {
    const b = boardOf(2, 2, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[1, 0], [1, 1]]),
    ]);
    const after = removePiece(b, 0);
    expect(pieceAt(after, 0, 0)).toBe(EMPTY);
    expect(pieceAt(after, 0, 1)).toBe(EMPTY);
    expect(pieceAt(after, 1, 0)).toBe(1);
    expect(after.pieces.has(0)).toBe(false);
    expect(after.pieces.size).toBe(1);
  });

  it('does not touch the original board', () => {
    const b = boardOf(2, 2, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[1, 0], [1, 1]]),
    ]);
    removePiece(b, 0);
    expect(pieceAt(b, 0, 0)).toBe(0);
    expect(b.pieces.size).toBe(2);
  });

  it('preserves the board metrics', () => {
    const b = boardOf(2, 2, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[1, 0], [1, 1]]),
    ]);
    const withM = { ...b, metrics: { ...b.metrics, n: 2, f0: 1 } };
    expect(removePiece(withM, 0).metrics.f0).toBe(1);
  });

  it('has no effect for a nonexistent id', () => {
    const b = boardOf(1, 2, [piece(0, 0, [[0, 0], [0, 1]])]);
    expect(removePiece(b, 42).pieces.size).toBe(1);
  });

  // §12.7 — counter consistency: the same blocker occupies three corridor cells.
  // After it is removed, the piece becomes free exactly once.
  it('unblocks a piece when a blocker occupying several corridor cells disappears', () => {
    // Column x=0, height 5. The blocker winds through (0,0), (0,1), (0,2).
    const runner = piece(0, 0, [[0, 3], [0, 4]]);
    const blocker = piece(1, 3, [[0, 0], [1, 0], [1, 1], [0, 1], [0, 2]]);
    const filler = piece(2, 2, [[1, 4], [1, 3], [1, 2]]);
    const b = boardOf(2, 5, [runner, blocker, filler]);
    expect(probeMove(b, b.pieces.get(0)!).free).toBe(false);
    const after = removePiece(b, 1);
    expect(probeMove(after, after.pieces.get(0)!)).toEqual({ free: true });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm run test:core -- board
```

Expected: FAIL — `removePiece is not a function`.

- [ ] **Step 3: Implement removal**

```typescript
// append to src/core/board.ts

/**
 * Removes a piece and returns a NEW board. The original is left untouched.
 *
 * We copy `occupancy` (80 kB at Nightmare 100×200, ~10 µs) instead of
 * mutating, because the session reducer (Slice 5) must be pure without
 * reservations. At one click per move the cost is negligible, and the
 * tests stay simple.
 */
export function removePiece(board: Board, pieceId: number): Board {
  const target = board.pieces.get(pieceId);
  if (!target) return board;

  const occupancy = Int32Array.from(board.occupancy);
  for (const c of target.cells) {
    if (isInside(board.width, board.height, c.x, c.y)) {
      occupancy[cellIndex(board.width, c.x, c.y)] = EMPTY;
    }
  }
  const pieces = new Map(board.pieces);
  pieces.delete(pieceId);
  return { ...board, occupancy, pieces };
}
```

- [ ] **Step 4: Run the full core test suite**

```bash
npm run test:core
```

Expected: PASS — all `rng`, `geometry` and `board` tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add piece removal from the board"
```

---

## Slice acceptance criteria

- `npm run test:core` passes; tests §12.1–8, §12.24 and §12.25 are
  implemented and green.
- `probeMove` reads **only** the ray from the head — the U-shape and
  second-L-arm tests confirm this.
- `removePiece` does not mutate its input (separate test).
- `validateBoard` detects: an unassigned cell, a piece of length 1, broken
  continuity, a cell visited twice, overlapping pieces, and a wrong
  direction sign.
- `npm run lint` passes — the core hasn't reached for the DOM or Angular.
