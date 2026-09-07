# Slice 3 — Solver and difficulty metrics

> **For agentic executors:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans`. Steps have checkboxes (`- [ ]`).

**Goal:** Independently verify **every** generated board and compute the
metrics that travel with the board into gameplay and scoring.

**Architecture:** The corridor does not depend on the board's state (Slice 1),
so the relation "F blocks E" is a **static directed graph**, computable once.
Hence: **a board is solvable ⟺ the blocking graph is acyclic**, and the solver
is Kahn's algorithm in `O(N+E)`. The solver is **completely decoupled from the
generator** — that is the right division of responsibilities: construction
should succeed often, the verifier should be certain.

**Stack:** TypeScript strict, Vitest on Node.

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md` (§8, §9,
§12.14–19)

**Map:** `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`

## Global Constraints

The constraints from the implementation map apply. Critical for this slice:

- The solver uses the **same** `headRay`/`probeMove` function as the game
  engine. A second implementation of the corridor is risk #1 from §14 of the
  spec.
- `almost1` in `BoardMetrics` is a **count** of pieces, not a share. The share
  is computed as `almost1 / n`.
- The `T_k` metric **does not come back** — at full occupancy it is always
  zero, because something always stands right in front of a piece (§9).
  `almost1` replaces it.

## File Structure

| File | Responsibility |
|---|---|
| `src/core/solver.ts` | blocking graph, Kahn, cycle detection |
| `src/core/metrics.ts` | `f0`, `almost1`, `D`, `meanCorridorLen`, entropies; `withMetrics` |
| `src/core/solver.spec.ts` | solver and cycle tests (§12.19) |
| `src/core/metrics.spec.ts` | metrics tests |
| `src/core/properties.spec.ts` | property-based tests over hundreds of seeds (§12.14–18) |

---

### Task 1: Blocking graph and solver

**Files:**
- Create: `src/core/solver.ts`
- Test: `src/core/solver.spec.ts`

**Interfaces:**
- Consumes: `Board`, `headRay`, `pieceAt`, `probeMove`, `removePiece` from Slice 1.
- Produces:
  - `interface BlockingGraph { blockedBy: Map<number, Set<number>>; blocks: Map<number, Set<number>> }`
  - `buildBlockingGraph(board: Board): BlockingGraph`
  - `interface SolveResult { solvable: boolean; order: number[]; depth: number; cycleMembers: number[] }`
  - `solve(board: Board, prebuilt?: BlockingGraph): SolveResult`

- [ ] **Step 1: Write failing tests (§12.19)**

```typescript
// src/core/solver.spec.ts
import { boardOf, piece } from './testing/fixtures';
import { buildBlockingGraph, solve } from './solver';

describe('buildBlockingGraph', () => {
  it('links a piece with whatever stands in its corridor', () => {
    const front = piece(0, 0, [[0, 0], [0, 1]]);
    const back = piece(1, 0, [[0, 2], [0, 3]]);
    const b = boardOf(1, 4, [front, back]);
    const g = buildBlockingGraph(b);
    expect([...g.blockedBy.get(1)!]).toEqual([0]);
    expect(g.blockedBy.get(0)!.size).toBe(0);
    expect([...g.blocks.get(0)!]).toEqual([1]);
  });

  it('does not create a self-edge', () => {
    // A snake covering an entire 2×3 board: the arrowhead at (0,1) faces up,
    // and cell (0,0) on its ray belongs to itself.
    const snake = piece(0, 0, [[0, 1], [0, 2], [1, 2], [1, 1], [1, 0], [0, 0]]);
    const b = boardOf(2, 3, [snake]);
    const g = buildBlockingGraph(b);
    expect(g.blockedBy.get(0)!.has(0)).toBe(false);
    expect(g.blockedBy.get(0)!.size).toBe(0);
  });

  it('counts a blocker once, even if it occupies several corridor cells', () => {
    const runner = piece(0, 0, [[0, 3], [0, 4]]);
    const blocker = piece(1, 3, [[0, 0], [1, 0], [1, 1], [0, 1], [0, 2]]);
    const filler = piece(2, 2, [[1, 4], [1, 3], [1, 2]]);
    const b = boardOf(2, 5, [runner, blocker, filler]);
    const g = buildBlockingGraph(b);
    expect([...g.blockedBy.get(0)!]).toEqual([1]);
  });
});

describe('solve', () => {
  it('produces a correct order for a solvable board', () => {
    const b = boardOf(1, 4, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[0, 2], [0, 3]]),
    ]);
    const r = solve(b);
    expect(r.solvable).toBe(true);
    expect(r.order).toEqual([0, 1]);
    expect(r.cycleMembers).toEqual([]);
  });

  it('computes the depth of the blocking graph', () => {
    // Three pieces one behind the other in a column: chain 0 ← 1 ← 2.
    const b = boardOf(1, 6, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[0, 2], [0, 3]]),
      piece(2, 0, [[0, 4], [0, 5]]),
    ]);
    const r = solve(b);
    expect(r.solvable).toBe(true);
    expect(r.depth).toBe(2);
  });

  // §12.19 — a two-piece cycle: two pieces pointing at each other.
  it('detects a two-piece cycle and identifies its members', () => {
    const up = piece(0, 0, [[0, 2], [0, 3]]);   // faces up, piece 1 is above it
    const down = piece(1, 2, [[0, 1], [0, 0]]); // faces down, piece 0 is below it
    const b = boardOf(1, 4, [up, down]);
    const r = solve(b);
    expect(r.solvable).toBe(false);
    expect(r.cycleMembers.sort()).toEqual([0, 1]);
  });

  // §12.19 — a cycle longer than two pieces.
  it('detects a cycle spanning four pieces', () => {
    // Four dominoes around the perimeter of a 3×3 board, each pointing at the
    // next: 0 → 1 → 2 → 3 → 0. The center (1,1) stays empty and blocks nothing.
    const a = piece(0, 1, [[1, 0], [0, 0]]); // arrowhead pointing right, aims at (2,0)
    const b2 = piece(1, 2, [[2, 1], [2, 0]]); // arrowhead pointing down, aims at (2,2)
    const c = piece(2, 3, [[1, 2], [2, 2]]); // arrowhead pointing left, aims at (0,2)
    const d = piece(3, 0, [[0, 1], [0, 2]]); // arrowhead pointing up, aims at (0,0)
    const board = boardOf(3, 3, [a, b2, c, d]);

    const r = solve(board);
    expect(r.solvable).toBe(false);
    expect(r.order).toEqual([]);
    expect(r.cycleMembers).toEqual([0, 1, 2, 3]);
  });

  it('removes every piece from an acyclic board', () => {
    const b = boardOf(2, 2, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[1, 0], [1, 1]]),
    ]);
    const r = solve(b);
    expect(r.order.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run and confirm the failure**

```bash
npm run test:core -- solver
```

Expected: FAIL — module `./solver` is missing.

- [ ] **Step 3: Implement the solver**

```typescript
// src/core/solver.ts
import { headRay, pieceAt } from './board';
import { Board, EMPTY } from './types';

export interface BlockingGraph {
  /** id → set of pieces that block it. */
  blockedBy: Map<number, Set<number>>;
  /** id → set of pieces that it blocks. */
  blocks: Map<number, Set<number>>;
}

export interface SolveResult {
  solvable: boolean;
  /** Removal order; for an unsolvable board — a prefix. */
  order: number[];
  /** Depth of the graph: the longest path. Metric `D` from §9. */
  depth: number;
  /** Pieces lying in cycles — diagnostics. */
  cycleMembers: number[];
}

/**
 * Builds the static blocking graph.
 *
 * The corridor does not depend on the board's state (§2), so the relation
 * "F blocks E" is fixed and computable once. When moving along its own
 * track, the corridor is a single ray, so the graph is sparse.
 *
 * Cost: O(N · max(W,H)).
 */
export function buildBlockingGraph(board: Board): BlockingGraph {
  const blockedBy = new Map<number, Set<number>>();
  const blocks = new Map<number, Set<number>>();
  for (const id of board.pieces.keys()) {
    blockedBy.set(id, new Set());
    blocks.set(id, new Set());
  }

  for (const p of board.pieces.values()) {
    for (const c of headRay(board, p)) {
      const owner = pieceAt(board, c.x, c.y);
      if (owner === EMPTY || owner === p.id) continue;
      blockedBy.get(p.id)!.add(owner);
      blocks.get(owner)?.add(p.id);
    }
  }
  return { blockedBy, blocks };
}

/**
 * Topological sort (Kahn).
 *
 * A board is solvable exactly when all N pieces can be removed — that is,
 * when the graph is acyclic (§8). Whatever was not removed lies in cycles.
 */
export function solve(board: Board, prebuilt?: BlockingGraph): SolveResult {
  // The metrics (Slice 3, Task 2) build the graph anyway, so we allow it to
  // be passed in — otherwise we'd compute it twice for every generated board.
  const graph = prebuilt ?? buildBlockingGraph(board);
  const remaining = new Map<number, number>();
  const queue: number[] = [];
  const depthOf = new Map<number, number>();

  for (const [id, blockers] of graph.blockedBy) {
    remaining.set(id, blockers.size);
    depthOf.set(id, 0);
    if (blockers.size === 0) queue.push(id);
  }

  const order: number[] = [];
  let depth = 0;
  // A pointer instead of shift(): shift() on an array is O(n), and with 4700
  // pieces at Extreme that turns quadratic.
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head]!;
    order.push(id);
    depth = Math.max(depth, depthOf.get(id)!);
    for (const blocked of graph.blocks.get(id) ?? []) {
      depthOf.set(blocked, Math.max(depthOf.get(blocked)!, depthOf.get(id)! + 1));
      const left = remaining.get(blocked)! - 1;
      remaining.set(blocked, left);
      if (left === 0) queue.push(blocked);
    }
  }

  const cycleMembers: number[] = [];
  for (const [id, left] of remaining) if (left > 0) cycleMembers.push(id);

  return {
    solvable: order.length === board.pieces.size,
    order,
    depth,
    cycleMembers: cycleMembers.sort((a, b) => a - b),
  };
}
```

- [ ] **Step 4: Run the tests — they must pass**

```bash
npm run test:core -- solver
```

Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add a solver based on a blocking graph"
```

---

### Task 2: Difficulty metrics

**Files:**
- Create: `src/core/metrics.ts`
- Test: `src/core/metrics.spec.ts`

**Interfaces:**
- Consumes: `buildBlockingGraph`, `solve`, `headRay`.
- Produces:
  - `computeMetrics(board: Board): BoardMetrics`
  - `withMetrics(board: Board): Board` — returns a copy with metrics computed
  - `estimateMinFree(board: Board, rng: Rng, playouts: number): number` —
    a **diagnostic** metric, outside the acceptance thresholds (§9)

`dirEntropy` and `lenEntropy` are a **spec addition** introduced in this plan:
without them, the scoring from §10 fails its own anti-exploitation test 26e
(details in the implementation map and in Slice 5).

- [ ] **Step 1: Write failing tests**

```typescript
// src/core/metrics.spec.ts
import { mulberry32 } from './rng';
import { boardOf, piece } from './testing/fixtures';
import { computeMetrics, estimateMinFree, withMetrics } from './metrics';

describe('computeMetrics', () => {
  it('computes the share of pieces free at the start', () => {
    const b = boardOf(1, 4, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[0, 2], [0, 3]]),
    ]);
    const m = computeMetrics(b);
    expect(m.n).toBe(2);
    expect(m.f0).toBeCloseTo(0.5, 6);
  });

  it('counts pieces blocked by exactly one other piece', () => {
    const b = boardOf(1, 6, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[0, 2], [0, 3]]),
      piece(2, 0, [[0, 4], [0, 5]]),
    ]);
    const m = computeMetrics(b);
    // Piece 1 is blocked by 0; piece 2 is blocked by 0 and 1.
    expect(m.almost1).toBe(1);
  });

  it('computes the depth of the blocking graph', () => {
    const b = boardOf(1, 6, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[0, 2], [0, 3]]),
      piece(2, 0, [[0, 4], [0, 5]]),
    ]);
    expect(computeMetrics(b).d).toBe(2);
  });

  it('computes the mean corridor length', () => {
    const b = boardOf(1, 4, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[0, 2], [0, 3]]),
    ]);
    // Piece 0's corridor: empty (the head is at the edge) → 0 cells.
    // Piece 1's corridor: (0,1) and (0,0) → 2 cells.
    expect(computeMetrics(b).meanCorridorLen).toBeCloseTo(1, 6);
  });

  describe('direction entropy', () => {
    it('is zero when all pieces face the same way', () => {
      const b = boardOf(2, 2, [
        piece(0, 0, [[0, 0], [0, 1]]),
        piece(1, 0, [[1, 0], [1, 1]]),
      ]);
      expect(computeMetrics(b).dirEntropy).toBeCloseTo(0, 6);
    });

    it('is one for an equal distribution across four directions', () => {
      // Two vertical dominoes (arrowhead up and down) and two horizontal ones
      // (arrowhead right and left) — a 4×2 board covered in full.
      const b = boardOf(4, 2, [
        piece(0, 0, [[0, 0], [0, 1]]),
        piece(1, 2, [[1, 1], [1, 0]]),
        piece(2, 1, [[3, 0], [2, 0]]),
        piece(3, 3, [[2, 1], [3, 1]]),
      ]);
      expect(computeMetrics(b).dirEntropy).toBeCloseTo(1, 6);
    });
  });

  describe('length entropy', () => {
    it('is zero when all pieces are the same length class', () => {
      const b = boardOf(2, 2, [
        piece(0, 0, [[0, 0], [0, 1]]),
        piece(1, 0, [[1, 0], [1, 1]]),
      ]);
      expect(computeMetrics(b).lenEntropy).toBeCloseTo(0, 6);
    });

    it('grows when different length classes appear', () => {
      const short = piece(0, 0, [[0, 0], [0, 1]]);
      const long = piece(1, 0, [
        [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7],
      ]);
      const filler = piece(2, 0, [[0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7]]);
      const b = boardOf(2, 8, [short, long, filler]);
      // Two buckets occupied out of three possible: the entropy normalized by
      // log(4) gives ~0.46, so the threshold must be below that value.
      expect(computeMetrics(b).lenEntropy).toBeGreaterThan(0.4);
    });
  });
});

describe('withMetrics', () => {
  it('attaches metrics without changing the board', () => {
    const b = boardOf(1, 4, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[0, 2], [0, 3]]),
    ]);
    const withM = withMetrics(b);
    expect(withM.metrics.n).toBe(2);
    expect(withM.pieces).toBe(b.pieces);
    expect(b.metrics.n).toBe(0); // original untouched
  });
});

describe('estimateMinFree', () => {
  it('never drops to zero on a solvable board', () => {
    const b = boardOf(1, 6, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[0, 2], [0, 3]]),
      piece(2, 0, [[0, 4], [0, 5]]),
    ]);
    expect(estimateMinFree(b, mulberry32(1), 20)).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run and confirm the failure**

```bash
npm run test:core -- metrics
```

Expected: FAIL — module `./metrics` is missing.

- [ ] **Step 3: Implement the metrics**

```typescript
// src/core/metrics.ts
import { headRay, probeMove, removePiece } from './board';
import { Rng } from './rng';
import { buildBlockingGraph, solve } from './solver';
import { Board, BoardMetrics } from './types';

/** Shannon entropy of a distribution, normalized to [0,1] by log of the class count. */
function normalizedEntropy(counts: readonly number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const classes = counts.filter((c) => c > 0).length;
  if (classes <= 1) return 0;
  let h = 0;
  for (const c of counts) {
    if (c === 0) continue;
    const p = c / total;
    h -= p * Math.log(p);
  }
  return h / Math.log(counts.length);
}

/**
 * Difficulty metrics computed on a finished board (§9).
 *
 * `almost1` is the most important one: it measures the number of
 * opportunities for a wrong click, i.e. what actually costs lives.
 *
 * `dirEntropy` and `lenEntropy` are an addition to the implementation plan —
 * they weigh apparent difficulty in scoring. A homogeneous board (all
 * dominoes facing one direction) has great `f0` and `almost1` yet is
 * trivial; entropy catches that.
 */
export function computeMetrics(board: Board): BoardMetrics {
  const n = board.pieces.size;
  if (n === 0) {
    return { n: 0, f0: 0, almost1: 0, d: 0, meanCorridorLen: 0, dirEntropy: 0, lenEntropy: 0 };
  }

  const graph = buildBlockingGraph(board);
  let free = 0;
  let almost1 = 0;
  for (const blockers of graph.blockedBy.values()) {
    if (blockers.size === 0) free++;
    else if (blockers.size === 1) almost1++;
  }

  let corridorCells = 0;
  const dirCounts = [0, 0, 0, 0];
  const lenCounts = [0, 0, 0, 0]; // 2–6, 7–15, 16–49, 50+
  for (const p of board.pieces.values()) {
    corridorCells += headRay(board, p).length;
    dirCounts[p.dir]++;
    const L = p.cells.length;
    if (L <= 6) lenCounts[0]++;
    else if (L <= 15) lenCounts[1]++;
    else if (L < 50) lenCounts[2]++;
    else lenCounts[3]++;
  }

  return {
    n,
    f0: free / n,
    almost1,
    d: solve(board, graph).depth,
    meanCorridorLen: corridorCells / n,
    dirEntropy: normalizedEntropy(dirCounts),
    lenEntropy: normalizedEntropy(lenCounts),
  };
}

/** A copy of the board with metrics computed. The original stays untouched. */
export function withMetrics(board: Board): Board {
  return { ...board, metrics: computeMetrics(board) };
}

/**
 * Minimum number of free pieces observed during random greedy playouts.
 *
 * DIAGNOSTIC metric (§9): reported in the benchmark, but not part of the
 * acceptance thresholds or scoring, because calibrating it requires
 * playtesting.
 */
export function estimateMinFree(board: Board, rng: Rng, playouts: number): number {
  let worst = Number.POSITIVE_INFINITY;
  for (let run = 0; run < playouts; run++) {
    let current = board;
    while (current.pieces.size > 0) {
      const free = [...current.pieces.values()].filter((p) => probeMove(current, p).free);
      if (free.length === 0) return 0; // broken confluence — an error signal
      worst = Math.min(worst, free.length);
      current = removePiece(current, free[Math.floor(rng() * free.length)]!.id);
    }
  }
  return Number.isFinite(worst) ? worst : 0;
}
```

- [ ] **Step 4: Run the tests — they must pass**

```bash
npm run test:core -- metrics
```

Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add board difficulty metrics"
```

---

### Task 3: Property-based tests and differential test

**Files:**
- Test: `src/core/properties.spec.ts`

**Interfaces:**
- Consumes: everything from Slices 1–3.
- Produces: nothing new in production code — this is the safety net for the
  entire project.

The differential test (§12.18) is the most important one here: it checks
that the **generator's condition** (skyline: the first unassigned cell of a
line) and the **game engine's condition** (`probeMove`) agree **bit for
bit**. A mismatch between them is exactly the bug that produces unsolvable
boards.

- [ ] **Step 1: Write property-based tests**

```typescript
// src/core/properties.spec.ts
import { createBoard, probeMove, removePiece, validateBoard } from './board';
import { defaultParams, generate } from './generator';
import { computeMetrics } from './metrics';
import { mulberry32 } from './rng';
import { Skyline } from './skyline';
import { solve } from './solver';
import { ALL_DIRS, Dir, EMPTY, Piece } from './types';

const SIZES = [[10, 10], [15, 30], [25, 25], [25, 50]] as const;

// §12.14 — every generated board passes the solver.
describe('every board is solvable', () => {
  it('over 200 seeds and four sizes', () => {
    for (const [w, h] of SIZES) {
      for (let seed = 1; seed <= 50; seed++) {
        const { board, complete } = generate(defaultParams(w, h, seed));
        expect(complete).toBe(true);
        const r = solve(board);
        if (!r.solvable) {
          throw new Error(
            `Board ${w}x${h} seed ${seed} unsolvable; cycle: ${r.cycleMembers.join(',')}`,
          );
        }
      }
    }
  }, 120_000);
});

// §12.15 — the carving order IS a solution, without reversal.
describe('the carving order is a valid solution', () => {
  it('every move in id order is legal', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { board } = generate(defaultParams(20, 20, seed));
      let current = board;
      for (let id = 0; id < board.pieces.size; id++) {
        const p = current.pieces.get(id);
        expect(p).toBeDefined();
        const probe = probeMove(current, p as Piece);
        if (!probe.free) {
          throw new Error(`Seed ${seed}: piece ${id} blocked by ${probe.blockerId}`);
        }
        current = removePiece(current, id);
      }
      expect(current.pieces.size).toBe(0);
    }
  }, 60_000);
});

// §12.16 — confluence: greedy playouts never get stuck.
describe('confluence', () => {
  it('randomly removing free pieces always finishes the board', () => {
    const rng = mulberry32(4242);
    for (let seed = 1; seed <= 20; seed++) {
      const { board } = generate(defaultParams(20, 20, seed));
      let current = board;
      while (current.pieces.size > 0) {
        const free = [...current.pieces.values()].filter((p) => probeMove(current, p).free);
        expect(free.length).toBeGreaterThan(0);
        current = removePiece(current, free[Math.floor(rng() * free.length)]!.id);
      }
    }
  }, 60_000);
});

// §12.17 — removing any piece leaves the board solvable.
describe('solvability monotonicity', () => {
  it('removing any piece does not break the board', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { board } = generate(defaultParams(15, 15, seed));
      for (const id of board.pieces.keys()) {
        expect(solve(removePiece(board, id)).solvable).toBe(true);
      }
    }
  }, 120_000);
});

/**
 * §12.18 — DIFFERENTIAL TEST.
 *
 * The generator asks: "is this cell the first unassigned one on its line?"
 * (skyline, O(1)). The game engine asks: "is the ray from the head clear?"
 * (probeMove, a walk along the ray). These must be the same question.
 *
 * We swap roles: cells UNASSIGNED in the generator correspond to cells
 * OCCUPIED on the game board, because those are the ones blocking the cut.
 */
describe('generator/engine differential test', () => {
  it('the skyline condition matches probeMove bit for bit', () => {
    const rng = mulberry32(31337);
    const w = 12;
    const h = 12;

    for (let trial = 0; trial < 300; trial++) {
      // Random carving state: some cells assigned, some not.
      const owner = new Int32Array(w * h).fill(EMPTY);
      const fill = 0.2 + rng() * 0.6;
      for (let i = 0; i < w * h; i++) if (rng() < fill) owner[i] = 1;

      const skyline = new Skyline(w, h);
      skyline.rebuild(owner);

      // Game board: every UNASSIGNED cell is a separate blocker.
      const blockers: Piece[] = [];
      for (let i = 0; i < w * h; i++) {
        if (owner[i] === EMPTY) {
          const x = i % w;
          const y = Math.floor(i / w);
          blockers.push({ id: 1000 + i, dir: 0, cells: [{ x, y }] });
        }
      }

      for (const dir of ALL_DIRS as readonly Dir[]) {
        const lines = dir === 0 || dir === 2 ? w : h;
        for (let line = 0; line < lines; line++) {
          const head = skyline.headCandidate(dir, line);
          if (!head) continue;

          // The same cell as a piece's head on the game board; we remove the
          // one blocker at that spot, since it is the candidate, not an obstacle.
          const probe = createBoard(w, h, [
            { id: 0, dir, cells: [head] },
            ...blockers.filter((b) => !(b.cells[0]!.x === head.x && b.cells[0]!.y === head.y)),
          ]);
          const free = probeMove(probe, probe.pieces.get(0)!).free;

          // A skyline candidate is always the first unassigned cell of a
          // line, so its ray MUST be clear of unassigned cells.
          expect(free).toBe(true);
        }
      }
    }
  }, 120_000);

  it('a cell outside the skyline never has a clear ray', () => {
    const rng = mulberry32(999);
    const w = 10;
    const h = 10;
    for (let trial = 0; trial < 100; trial++) {
      const owner = new Int32Array(w * h).fill(EMPTY);
      for (let i = 0; i < w * h; i++) if (rng() < 0.5) owner[i] = 1;
      const skyline = new Skyline(w, h);
      skyline.rebuild(owner);

      const blockers: Piece[] = [];
      for (let i = 0; i < w * h; i++) {
        if (owner[i] === EMPTY) {
          blockers.push({ id: 1000 + i, dir: 0, cells: [{ x: i % w, y: Math.floor(i / w) }] });
        }
      }

      for (const dir of ALL_DIRS as readonly Dir[]) {
        const lines = dir === 0 || dir === 2 ? w : h;
        for (let line = 0; line < lines; line++) {
          const candidate = skyline.headCandidate(dir, line);
          // We take the cell one step DEEPER than the candidate — if it is
          // unassigned, its ray must run into the candidate.
          if (!candidate) continue;
          const v = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }][dir]!;
          const deeper = { x: candidate.x - v.x, y: candidate.y - v.y };
          if (deeper.x < 0 || deeper.y < 0 || deeper.x >= w || deeper.y >= h) continue;
          if (owner[deeper.y * w + deeper.x] !== EMPTY) continue;

          const probe = createBoard(w, h, [
            { id: 0, dir, cells: [deeper] },
            ...blockers.filter(
              (b) => !(b.cells[0]!.x === deeper.x && b.cells[0]!.y === deeper.y),
            ),
          ]);
          expect(probeMove(probe, probe.pieces.get(0)!).free).toBe(false);
        }
      }
    }
  }, 120_000);
});

describe('metrics on generated boards', () => {
  it('fall within sensible ranges', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { board } = generate(defaultParams(25, 25, seed));
      const m = computeMetrics(board);
      expect(validateBoard(board)).toEqual([]);
      expect(m.n).toBe(board.pieces.size);
      expect(m.f0).toBeGreaterThan(0);
      expect(m.f0).toBeLessThan(1);
      expect(m.almost1).toBeLessThanOrEqual(m.n);
      expect(m.d).toBeGreaterThan(0);
      expect(m.dirEntropy).toBeGreaterThan(0.8); // all four directions are used
      expect(m.meanCorridorLen).toBeGreaterThan(0);
    }
  }, 60_000);
});
```

- [ ] **Step 2: Run the tests**

```bash
npm run test:core -- properties
```

Expected: PASS. If the differential test fails, **do not change the test** —
the two definitions of the corridor have diverged, and that is exactly the
failure this test guards against (risk #1 from §14).

- [ ] **Step 3: Measure total time**

```bash
time npm run test:core
```

Expected: the whole run under ~3 minutes. If it takes longer, reduce the
number of seeds in the most expensive test (`monotonicity`), not in the
differential test.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add property-based tests and a differential test for the generator"
```

---

## Slice acceptance criteria

- `npm run test:core` passes in full.
- The solver detects manually constructed two- and three-piece cycles and
  identifies their members.
- 200 generated boards (4 sizes × 50 seeds) pass the solver.
- The carving order is a valid solution without reversal.
- The differential test is green — the generator and the engine share one
  definition of the corridor.
- `BoardMetrics` carries `dirEntropy` and `lenEntropy`; Slice 5 depends on
  them.
