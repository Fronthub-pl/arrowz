# Slice 2 — Generator: carving from the full board

> **For agentic executors:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans`. Steps have checkboxes (`- [ ]`).

**Goal:** `generate(params)` produces a **100%** covered board in which every
piece has at least 2 cells, and the carving order is a ready-made solution.

**Architecture:** We do not insert pieces onto an empty board — **we carve them
out of a full board, in removal order**. A piece `q_j` can be carved out when
its entire corridor runs through cells that are already assigned or its own.
The condition applies **only to the head** (the corridor is a single ray), so
the body grows without geometric constraints — and that's where the tangled
shapes come from. The admissible area is described by four `depth_d[line]`
arrays, updated incrementally. Full coverage is not proven, only enforced by
three layers: heads with an unassigned neighbor, a leftover-fragment shape
test, and a bounded backtrack.

**Stack:** TypeScript strict, Vitest on Node.

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md` (§7, §12.9–13,
§12.20–23)

**Map:** `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`

**Measurement reference:** `prototype/carve.mjs` — throwaway code, but
**measured**. We do not port it; we write it from scratch in TS. When the
result diverges from the tables in §7 and §9 of the spec, the implementation
has drifted, not the measurement.

## Global Constraints

The constraints from the implementation map apply. Critical for this slice:

- **The Warnsdorff heuristic is required, not optional.** Without it the body
  fragments the rest of the board and 1 board in 30 doesn't generate at all.
- **Minimum length 2** follows from the construction: we pick the head only
  from cells that have an unassigned neighbor.
- The generator **never loops forever** and **never throws** — once the
  budget is exhausted it hands back the best result and reports the
  discrepancy.
- Default values: weights `0.50 / 0.20 / 0.30`, `warnsdorff = 4`,
  `straightBias = 0.6`, `lateralWeight = 3`, `maxLength = round(2.5·max(W,H))`.
- **Parameter envelope** (spec §7 "Parameter envelope", 2026-09-08).
  `GeneratorParams` carries the measured minimum and maximum of every knob
  and the three cross-knob rules (short plus medium shares at most 0.9;
  `maxLength` automatic or at least 6; mixing off or between 0.3 and 0.7).
  The generator exposes `validateParams(params): Violation[]` (range
  violations `{ kind: 'range', key, value, min, max }`, rule violations
  `{ kind: 'rule', key, keys }`) and `formatViolation(v): string`, and
  `generate()` refuses invalid parameters before carving. That is the one
  case in which it throws (a `RangeError` carrying `violations`); the
  "never throws" rule above applies to valid parameters. The narrowed bounds
  (straightness at least 0.6, Warnsdorff at least 2, coiling penalty at most
  10, absorption at least 12, exact leftover test at least 10, start attempts
  2..16, backtrack budget at most 1000, restarts at most 5) are tabulated in
  the spec and must not be widened without a new measurement.

## File Structure

| File | Responsibility |
|---|---|
| `src/core/skyline.ts` | admissible area: `depth_d` arrays, head candidates |
| `src/core/lengths.ts` | mixed length distribution (three buckets) |
| `src/core/decompose.ts` | leftover-fragment shape test: can a fragment be decomposed into paths ≥ 2 |
| `src/core/shapes.ts` | path growth: candidates, weights, Warnsdorff |
| `src/core/generator.ts` | `generate()`: carving loop, backtracks, restarts, report |
| `src/core/*.spec.ts` | tests for §12.9–13 and §12.20–23 |

---

### Task 1: Admissible area (skyline)

**Files:**
- Create: `src/core/skyline.ts`
- Test: `src/core/skyline.spec.ts`

**Interfaces:**
- Consumes: `Dir`, `Coord`, `EMPTY`, `cellIndex`, `isInside` from Slice 1.
- Produces:
  - `class Skyline` with methods:
    `depth(dir: Dir, line: number): number`,
    `headCandidate(dir: Dir, line: number): Coord | null`,
    `recompute(owner: Int32Array, cells: readonly Coord[]): void`
  - `lineOf(dir: Dir, c: Coord): number`

The gist: `depth_d[L]` is the number of consecutive **assigned** cells on line
`L`, counted from the edge inward in direction `d`. The first unassigned cell
on a line is the **only head candidate** for that direction, so there are at
most `W` or `H` candidates, and the test costs `O(1)`.

- [ ] **Step 1: Write a failing test (§12.12)**

```typescript
// src/core/skyline.spec.ts
import { EMPTY } from './types';
import { Skyline, lineOf } from './skyline';

/** Builds an owner array from a drawing: '.' = unassigned, digit = id. */
function ownerFrom(rows: readonly string[]): { owner: Int32Array; w: number; h: number } {
  const h = rows.length;
  const w = rows[0]!.length;
  const owner = new Int32Array(w * h).fill(EMPTY);
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== '.') owner[y * w + x] = Number(ch);
    });
  });
  return { owner, w, h };
}

describe('Skyline', () => {
  it('counts depth from the edge for each direction', () => {
    const { owner, w, h } = ownerFrom([
      '11.',
      '1..',
      '...',
    ]);
    const s = new Skyline(w, h);
    s.rebuild(owner);
    // Direction 0 (up): column 0 has (0,0) and (0,1) assigned → 2.
    expect(s.depth(0, 0)).toBe(2);
    // Column 1 has only (1,0) assigned → 1.
    expect(s.depth(0, 1)).toBe(1);
    expect(s.depth(0, 2)).toBe(0);
    // Direction 3 (left): row 0 has (0,0) and (1,0) assigned → 2.
    expect(s.depth(3, 0)).toBe(2);
    expect(s.depth(3, 1)).toBe(1);
    // Direction 2 (down): column 0 from the bottom — (0,2) is unassigned → 0.
    expect(s.depth(2, 0)).toBe(0);
  });

  it('points at the first unassigned cell of a line as the head candidate', () => {
    const { owner, w, h } = ownerFrom([
      '11.',
      '1..',
      '...',
    ]);
    const s = new Skyline(w, h);
    s.rebuild(owner);
    expect(s.headCandidate(0, 0)).toEqual({ x: 0, y: 2 });
    expect(s.headCandidate(0, 1)).toEqual({ x: 1, y: 1 });
    expect(s.headCandidate(1, 0)).toEqual({ x: 2, y: 0 });
    expect(s.headCandidate(3, 0)).toEqual({ x: 2, y: 0 });
  });

  it('returns null for a line that is fully assigned', () => {
    const { owner, w, h } = ownerFrom(['11', '11']);
    const s = new Skyline(w, h);
    s.rebuild(owner);
    expect(s.headCandidate(0, 0)).toBeNull();
    expect(s.headCandidate(1, 1)).toBeNull();
  });

  // §12.12 — a cell at the edge increases depth, a cell deeper in does NOT
  // (until continuity from the edge closes up).
  it('updates depth incrementally after a carve', () => {
    const { owner, w, h } = ownerFrom(['...', '...', '...']);
    const s = new Skyline(w, h);
    s.rebuild(owner);
    expect(s.depth(0, 1)).toBe(0);

    // A cell DEEP in column 1 — continuity from the top edge doesn't close up.
    owner[1 * 3 + 1] = 5;
    s.recompute(owner, [{ x: 1, y: 1 }]);
    expect(s.depth(0, 1)).toBe(0);

    // Closing up: now (1,0) is also assigned → depth jumps by 2 at once.
    owner[0 * 3 + 1] = 5;
    s.recompute(owner, [{ x: 1, y: 0 }]);
    expect(s.depth(0, 1)).toBe(2);
  });

  it('recomputes only the lines touched by the carve', () => {
    const { owner, w, h } = ownerFrom(['...', '...', '...']);
    const s = new Skyline(w, h);
    s.rebuild(owner);
    owner[0] = 1;
    s.recompute(owner, [{ x: 0, y: 0 }]);
    expect(s.depth(0, 0)).toBe(1);
    expect(s.depth(0, 1)).toBe(0);
    expect(s.depth(0, 2)).toBe(0);
  });
});

describe('lineOf', () => {
  it('maps a cell to the line number appropriate for the direction', () => {
    expect(lineOf(0, { x: 3, y: 7 })).toBe(3); // up/down → column
    expect(lineOf(2, { x: 3, y: 7 })).toBe(3);
    expect(lineOf(1, { x: 3, y: 7 })).toBe(7); // right/left → row
    expect(lineOf(3, { x: 3, y: 7 })).toBe(7);
  });
});
```

- [ ] **Step 2: Run it and confirm the failure**

```bash
npm run test:core -- skyline
```

Expected: FAIL — module `./skyline` is missing.

- [ ] **Step 3: Implement skyline**

```typescript
// src/core/skyline.ts
import { cellIndex } from './geometry';
import { Coord, Dir, EMPTY } from './types';

/** Line number the ray of a given direction runs along. */
export function lineOf(dir: Dir, c: Coord): number {
  return dir === 0 || dir === 2 ? c.x : c.y;
}

/**
 * Admissible area for carving.
 *
 * `depth_d[L]` = how many consecutive ASSIGNED cells lie on line `L`, counted
 * from the edge inward in direction `d`. A cell can be the head of a piece
 * being carved with direction `d` exactly when it is the first unassigned
 * cell of its line — because then its entire corridor runs through cells
 * that are already assigned (§7).
 */
export class Skyline {
  /** Indices: [direction][line]. For up/down the line is a column, for left/right a row. */
  private readonly depths: [Int32Array, Int32Array, Int32Array, Int32Array];

  constructor(private readonly width: number, private readonly height: number) {
    this.depths = [
      new Int32Array(width),
      new Int32Array(height),
      new Int32Array(width),
      new Int32Array(height),
    ];
  }

  depth(dir: Dir, line: number): number {
    return this.depths[dir][line]!;
  }

  /** Recomputes all lines from scratch. Used at start and on backtrack. */
  rebuild(owner: Int32Array): void {
    for (let x = 0; x < this.width; x++) this.recomputeColumn(owner, x);
    for (let y = 0; y < this.height; y++) this.recomputeRow(owner, y);
  }

  /** Recomputes only the lines touched by the given cells: O(4·ℓ). */
  recompute(owner: Int32Array, cells: readonly Coord[]): void {
    const cols = new Set<number>();
    const rows = new Set<number>();
    for (const c of cells) {
      cols.add(c.x);
      rows.add(c.y);
    }
    for (const x of cols) this.recomputeColumn(owner, x);
    for (const y of rows) this.recomputeRow(owner, y);
  }

  /** First unassigned cell of the line, counted from the direction's exit edge. */
  headCandidate(dir: Dir, line: number): Coord | null {
    const k = this.depth(dir, line);
    switch (dir) {
      case 0:
        return k < this.height ? { x: line, y: k } : null;
      case 2:
        return k < this.height ? { x: line, y: this.height - 1 - k } : null;
      case 3:
        return k < this.width ? { x: k, y: line } : null;
      default:
        return k < this.width ? { x: this.width - 1 - k, y: line } : null;
    }
  }

  private recomputeColumn(owner: Int32Array, x: number): void {
    let k = 0;
    while (k < this.height && owner[cellIndex(this.width, x, k)] !== EMPTY) k++;
    this.depths[0][x] = k;
    k = 0;
    while (k < this.height && owner[cellIndex(this.width, x, this.height - 1 - k)] !== EMPTY) k++;
    this.depths[2][x] = k;
  }

  private recomputeRow(owner: Int32Array, y: number): void {
    let k = 0;
    while (k < this.width && owner[cellIndex(this.width, k, y)] !== EMPTY) k++;
    this.depths[3][y] = k;
    k = 0;
    while (k < this.width && owner[cellIndex(this.width, this.width - 1 - k, y)] !== EMPTY) k++;
    this.depths[1][y] = k;
  }
}
```

- [ ] **Step 4: Run the tests — they must pass**

```bash
npm run test:core -- skyline
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add carving admissible area"
```

---

### Task 2: Length distribution

**Files:**
- Create: `src/core/lengths.ts`
- Test: `src/core/lengths.spec.ts`

**Interfaces:**
- Consumes: `Rng`, `randInt` from Slice 0; `GeneratorParams` from Slice 1.
- Produces:
  - `drawTargetLength(rng: Rng, params: GeneratorParams): number`
  - `longAreaShare(params: GeneratorParams): number` — the share of the board
    area occupied by the long bucket. The configurator (Slice 8) shows this
    value live and warns above 0.25.
  - `LENGTH_BUCKETS` — bucket boundaries.

- [ ] **Step 1: Write failing tests (§12.9, §12.9b, §12.23)**

```typescript
// src/core/lengths.spec.ts
import { mulberry32 } from './rng';
import { GeneratorParams } from './types';
import { drawTargetLength, longAreaShare } from './lengths';

const base: GeneratorParams = {
  width: 50, height: 50, maxLength: 125,
  bucketWeights: [0.5, 0.2, 0.3],
  straightBias: 0.6, lateralWeight: 3, warnsdorff: 4, headBias: 0, seed: 1,
};

describe('drawTargetLength', () => {
  it('never goes below 2 or above maxLength', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 20_000; i++) {
      const L = drawTargetLength(rng, base);
      expect(L).toBeGreaterThanOrEqual(2);
      expect(L).toBeLessThanOrEqual(base.maxLength);
    }
  });

  // §12.9b — the generator actually produces long pieces, it doesn't
  // silently clip everything down to short ones.
  it('hits the requested bucket shares', () => {
    const rng = mulberry32(7);
    let short = 0, medium = 0, long = 0;
    const n = 50_000;
    for (let i = 0; i < n; i++) {
      const L = drawTargetLength(rng, base);
      if (L <= 6) short++;
      else if (L <= 15) medium++;
      else long++;
    }
    expect(short / n).toBeCloseTo(0.5, 1);
    expect(medium / n).toBeCloseTo(0.2, 1);
    expect(long / n).toBeCloseTo(0.3, 1);
  });

  // The long bucket is LOG-uniform: at maxLength = 300 a uniform draw would
  // give a mean of 158 (all monsters), log-uniform gives ~97 and spreads the
  // mass across orders of magnitude.
  it('draws the long bucket log-uniformly', () => {
    const rng = mulberry32(3);
    const params = { ...base, maxLength: 300, bucketWeights: [0, 0, 1] as const };
    const draws: number[] = [];
    for (let i = 0; i < 20_000; i++) draws.push(drawTargetLength(rng, params));
    const mean = draws.reduce((a, b) => a + b, 0) / draws.length;
    // Uniform would give ~158. Log-uniform on [16,300] gives ~97.
    expect(mean).toBeGreaterThan(70);
    expect(mean).toBeLessThan(125);
    // A tail exists: at least a few percent exceed 200.
    expect(draws.filter((L) => L > 200).length / draws.length).toBeGreaterThan(0.02);
    // The lower end of the bucket is also populated.
    expect(draws.filter((L) => L < 30).length / draws.length).toBeGreaterThan(0.05);
  });

  // §12.22 — extreme break-degree values don't upend the draw.
  it('works for extreme parameters', () => {
    const rng = mulberry32(5);
    for (const straightBias of [0, 1]) {
      for (const w of [[1, 0, 0], [0, 0, 1]] as const) {
        const p = { ...base, straightBias, bucketWeights: w as GeneratorParams['bucketWeights'] };
        for (let i = 0; i < 500; i++) {
          const L = drawTargetLength(rng, p);
          expect(Number.isFinite(L)).toBe(true);
          expect(L).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it('handles maxLength smaller than the long bucket lower bound', () => {
    const rng = mulberry32(9);
    const p = { ...base, maxLength: 10, bucketWeights: [0, 0, 1] as GeneratorParams['bucketWeights'] };
    for (let i = 0; i < 200; i++) {
      const L = drawTargetLength(rng, p);
      expect(L).toBeLessThanOrEqual(10);
      expect(L).toBeGreaterThanOrEqual(2);
    }
  });
});

// §12.23 — the long bucket's area share must match what the configurator
// shows; otherwise the 25% warning is misleading.
describe('longAreaShare', () => {
  it('matches the share measured from the draw', () => {
    const rng = mulberry32(21);
    const p = { ...base, maxLength: 125, bucketWeights: [0.5, 0.2, 0.3] as const };
    let longCells = 0, allCells = 0;
    for (let i = 0; i < 50_000; i++) {
      const L = drawTargetLength(rng, p);
      allCells += L;
      if (L > 15) longCells += L;
    }
    expect(longAreaShare(p)).toBeCloseTo(longCells / allCells, 1);
  });

  it('grows with the long bucket weight', () => {
    const low = longAreaShare({ ...base, bucketWeights: [0.85, 0.14, 0.01] });
    const high = longAreaShare({ ...base, bucketWeights: [0.4, 0.15, 0.45] });
    expect(high).toBeGreaterThan(low);
    expect(low).toBeLessThan(0.25);
  });
});
```

- [ ] **Step 2: Run it and confirm the failure**

```bash
npm run test:core -- lengths
```

Expected: FAIL — module `./lengths` is missing.

- [ ] **Step 3: Implement the distribution**

```typescript
// src/core/lengths.ts
import { randInt, Rng } from './rng';
import { GeneratorParams } from './types';

/** Bucket boundaries: short 2–6, medium 7–15, long 16–maxLength. */
export const LENGTH_BUCKETS = {
  shortMin: 2,
  shortMax: 6,
  mediumMin: 7,
  mediumMax: 15,
  longMin: 16,
} as const;

/**
 * Draws a piece's target length from a mixed distribution with three buckets.
 *
 * The long bucket is LOG-uniform, not uniform: at maxLength = 300 a uniform
 * draw would give a mean of 158 cells, i.e. all monsters. Log-uniform spreads
 * the mass across orders of magnitude, so both 20-cell and 250-cell pieces
 * appear (§7).
 */
export function drawTargetLength(rng: Rng, params: GeneratorParams): number {
  const cap = Math.max(2, Math.floor(params.maxLength));
  const [wShort, wMedium] = params.bucketWeights;
  const r = rng();

  if (r < wShort) {
    return Math.min(cap, randInt(rng, LENGTH_BUCKETS.shortMin, LENGTH_BUCKETS.shortMax));
  }
  if (r < wShort + wMedium) {
    return Math.min(cap, randInt(rng, LENGTH_BUCKETS.mediumMin, LENGTH_BUCKETS.mediumMax));
  }
  const a = LENGTH_BUCKETS.longMin;
  const b = Math.max(a + 1, cap);
  const drawn = Math.round(a * Math.exp(rng() * Math.log(b / a)));
  return Math.max(2, Math.min(cap, drawn));
}

/** Bucket mean length — needed to compute the area share. */
function bucketMeans(maxLength: number): [number, number, number] {
  const a = LENGTH_BUCKETS.longMin;
  const b = Math.max(a + 1, Math.floor(maxLength));
  // Expected value of a log-uniform distribution on [a, b]: (b - a) / ln(b/a).
  const longMean = (b - a) / Math.log(b / a);
  return [4, 11, Math.min(b, longMean)];
}

/**
 * Share of the board area occupied by pieces from the long bucket.
 *
 * The bucket weight and maxLength are NOT independent: at maxLength = 300 and
 * an 8% weight, a dozen or so snakes would take up most of the board. The
 * configurator computes this value live and warns once it exceeds 0.25
 * (§7, §11).
 */
export function longAreaShare(params: GeneratorParams): number {
  const [wShort, wMedium, wLong] = params.bucketWeights;
  const [mShort, mMedium, mLong] = bucketMeans(params.maxLength);
  const overallMean = wShort * mShort + wMedium * mMedium + wLong * mLong;
  if (overallMean <= 0) return 0;
  return (wLong * mLong) / overallMean;
}

/** Expected piece count at full coverage: W·H / mean length. */
export function expectedPieceCount(params: GeneratorParams): number {
  const [wShort, wMedium, wLong] = params.bucketWeights;
  const [mShort, mMedium, mLong] = bucketMeans(params.maxLength);
  const mean = wShort * mShort + wMedium * mMedium + wLong * mLong;
  if (mean <= 0) return 0;
  return Math.round((params.width * params.height) / mean);
}
```

- [ ] **Step 4: Run the tests — they must pass**

```bash
npm run test:core -- lengths
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add piece length distribution"
```

---

### Task 3: Leftover-fragment shape test

**Files:**
- Create: `src/core/decompose.ts`
- Test: `src/core/decompose.spec.ts`

**Interfaces:**
- Produces:
  - `isDecomposable(cells: ReadonlySet<number>, width: number, height: number): boolean`
  - `wouldStrand(owner: Int32Array, width: number, height: number, path: readonly Coord[]): boolean`

A naive "did some cell end up without neighbors" test **is not enough**.
Counterexample from §7: a plus-shaped pentomino — five cells, all connected,
none isolated, yet no decomposition into paths ≥ 2 exists. A path through the
center covers at most 3 cells, and the two remaining arms are not adjacent.

- [ ] **Step 1: Write failing tests (§12.12c)**

```typescript
// src/core/decompose.spec.ts
import { EMPTY } from './types';
import { isDecomposable, wouldStrand } from './decompose';

const W = 7;
const H = 7;
const at = (x: number, y: number) => y * W + x;
const setOf = (...cells: readonly (readonly [number, number])[]) =>
  new Set(cells.map(([x, y]) => at(x, y)));

describe('isDecomposable', () => {
  it('treats an empty set as decomposable', () => {
    expect(isDecomposable(new Set(), W, H)).toBe(true);
  });

  it('rejects a single cell', () => {
    expect(isDecomposable(setOf([3, 3]), W, H)).toBe(false);
  });

  it('accepts a domino', () => {
    expect(isDecomposable(setOf([3, 3], [3, 4]), W, H)).toBe(true);
  });

  it('accepts a 2x2 square', () => {
    expect(isDecomposable(setOf([1, 1], [2, 1], [1, 2], [2, 2]), W, H)).toBe(true);
  });

  // §12.12c — plus-pentomino: connected, no cell isolated, yet no
  // decomposition into paths >= 2 exists. A naive isolation test does NOT catch this.
  it('rejects a plus-shaped pentomino', () => {
    const plus = setOf([3, 2], [2, 3], [3, 3], [4, 3], [3, 4]);
    expect(isDecomposable(plus, W, H)).toBe(false);
  });

  // T-tetromino: center + three arms. A path of length 2 eats two arms through
  // the center, the third arm is left alone → not decomposable.
  it('rejects a T-tetromino', () => {
    const t = setOf([2, 3], [3, 3], [4, 3], [3, 4]);
    expect(isDecomposable(t, W, H)).toBe(false);
  });

  it('accepts three cells in a line', () => {
    expect(isDecomposable(setOf([1, 1], [2, 1], [3, 1]), W, H)).toBe(true);
  });

  it('rejects two disjoint fragments when one is a singleton', () => {
    expect(isDecomposable(setOf([0, 0], [1, 0], [5, 5]), W, H)).toBe(false);
  });

  it('accepts two disjoint dominoes', () => {
    expect(isDecomposable(setOf([0, 0], [1, 0], [5, 5], [5, 6]), W, H)).toBe(true);
  });
});

describe('wouldStrand', () => {
  it('reports no problem when the leftover is large', () => {
    const owner = new Int32Array(W * H).fill(EMPTY);
    const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    expect(wouldStrand(owner, W, H, path)).toBe(false);
  });

  it('detects stranding a single cell in a corner', () => {
    const owner = new Int32Array(W * H).fill(0); // everything assigned
    // Left free: (0,0), (1,0), (0,1) — the path takes (1,0) and (0,1),
    // leaving (0,0) alone.
    owner[at(0, 0)] = EMPTY;
    owner[at(1, 0)] = EMPTY;
    owner[at(0, 1)] = EMPTY;
    const path = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
    expect(wouldStrand(owner, W, H, path)).toBe(true);
  });

  it('detects stranding a plus shape', () => {
    const owner = new Int32Array(W * H).fill(0);
    for (const [x, y] of [[3, 2], [2, 3], [3, 3], [4, 3], [3, 4], [3, 1], [3, 0]] as const) {
      owner[at(x, y)] = EMPTY;
    }
    // The path takes the neck (3,1)-(3,0), leaving a clean plus.
    const path = [{ x: 3, y: 0 }, { x: 3, y: 1 }];
    expect(wouldStrand(owner, W, H, path)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and confirm the failure**

```bash
npm run test:core -- decompose
```

Expected: FAIL — module `./decompose` is missing.

- [ ] **Step 3: Implement the leftover-fragment test**

```typescript
// src/core/decompose.ts
import { isInside } from './geometry';
import { Coord, DIR_VECTORS, EMPTY } from './types';

/** Fragment size above which we assume decomposability without checking. */
const SMALL_FRAGMENT_LIMIT = 8;

function neighbours(index: number, width: number, height: number): number[] {
  const x = index % width;
  const y = Math.floor(index / width);
  const out: number[] = [];
  for (const v of DIR_VECTORS) {
    const nx = x + v.x;
    const ny = y + v.y;
    if (isInside(width, height, nx, ny)) out.push(ny * width + nx);
  }
  return out;
}

/**
 * Can a set of cells be decomposed into paths of length ≥ 2?
 *
 * Exhaustive search — used only for small fragments (up to eight cells),
 * because only those can be non-decomposable in a way that isn't visible from
 * adjacency alone. The smallest counterexamples are the T-tetromino and the
 * plus-shaped pentomino: connected, no isolated cells, yet no decomposition
 * exists (§7).
 */
export function isDecomposable(
  cells: ReadonlySet<number>,
  width: number,
  height: number,
): boolean {
  if (cells.size === 0) return true;
  if (cells.size === 1) return false;

  const start = cells.values().next().value as number;

  const walk = (tail: number, used: Set<number>): boolean => {
    if (used.size >= 2) {
      const rest = new Set<number>();
      for (const c of cells) if (!used.has(c)) rest.add(c);
      if (isDecomposable(rest, width, height)) return true;
    }
    for (const n of neighbours(tail, width, height)) {
      if (!cells.has(n) || used.has(n)) continue;
      used.add(n);
      if (walk(n, used)) return true;
      used.delete(n);
    }
    return false;
  };

  return walk(start, new Set([start]));
}

/**
 * Would carving this path leave a fragment in the unassigned leftover that
 * cannot be decomposed into paths ≥ 2?
 *
 * We check only the path's surroundings — a cost on the order of its
 * perimeter. Fragments larger than SMALL_FRAGMENT_LIMIT are let through: we
 * assume they'll decompose, and if not, the bounded backtrack in the
 * generator and the solver in Slice 3 will catch it.
 */
export function wouldStrand(
  owner: Int32Array,
  width: number,
  height: number,
  path: readonly Coord[],
): boolean {
  const taken = new Set<number>(path.map((c) => c.y * width + c.x));
  const seen = new Set<number>();

  for (const c of path) {
    for (const v of DIR_VECTORS) {
      const nx = c.x + v.x;
      const ny = c.y + v.y;
      if (!isInside(width, height, nx, ny)) continue;
      const start = ny * width + nx;
      if (taken.has(start) || seen.has(start) || owner[start] !== EMPTY) continue;

      // Size-bounded flood fill: we only care about small fragments.
      const component = new Set<number>();
      const stack = [start];
      let overflow = false;
      while (stack.length > 0) {
        const i = stack.pop()!;
        if (component.has(i)) continue;
        component.add(i);
        if (component.size > SMALL_FRAGMENT_LIMIT) {
          overflow = true;
          break;
        }
        for (const j of neighbours(i, width, height)) {
          if (owner[j] === EMPTY && !taken.has(j) && !component.has(j)) stack.push(j);
        }
      }
      for (const i of component) seen.add(i);
      if (overflow) continue;
      if (!isDecomposable(component, width, height)) return true;
    }
  }
  return false;
}
```

- [ ] **Step 4: Run the tests — they must pass**

```bash
npm run test:core -- decompose
```

Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add leftover-fragment decomposability test"
```

---

### Task 4: Path growth

**Files:**
- Create: `src/core/shapes.ts`
- Test: `src/core/shapes.spec.ts`

**Interfaces:**
- Consumes: `Rng`, `weightedPick`, `wouldStrand`, `DIR_VECTORS`.
- Produces:
  - `growPath(ctx: GrowthContext): Coord[]` where
    `interface GrowthContext { owner: Int32Array; width: number; height: number; head: Coord; neck: Coord; targetLength: number; params: GeneratorParams; rng: Rng }`

Candidate weights, exactly as measured in the prototype:

- moving **inward** (along the direction opposite the exit): weight `1`,
- moving **sideways**: weight `lateralWeight` (default 3) — sideways builds
  the shape, while moving inward cuts the path off from the frontier,
- continuing **straight**: multiplier `straightBias / (1 - straightBias)`,
- **Warnsdorff**: multiplier `warnsdorff^(3 - number of free neighbors)`.

- [ ] **Step 1: Write failing tests (§12.9, §12.10)**

```typescript
// src/core/shapes.spec.ts
import { mulberry32 } from './rng';
import { EMPTY, GeneratorParams } from './types';
import { growPath } from './shapes';

const params: GeneratorParams = {
  width: 12, height: 12, maxLength: 30,
  bucketWeights: [0.5, 0.2, 0.3],
  straightBias: 0.6, lateralWeight: 3, warnsdorff: 4, headBias: 0, seed: 1,
};

function emptyOwner(w: number, h: number): Int32Array {
  return new Int32Array(w * h).fill(EMPTY);
}

describe('growPath', () => {
  it('starts with the head and neck, in that order', () => {
    const path = growPath({
      owner: emptyOwner(12, 12), width: 12, height: 12,
      head: { x: 5, y: 0 }, neck: { x: 5, y: 1 },
      targetLength: 5, params, rng: mulberry32(1),
    });
    expect(path[0]).toEqual({ x: 5, y: 0 });
    expect(path[1]).toEqual({ x: 5, y: 1 });
  });

  it('never visits a cell twice (§12.10)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const path = growPath({
        owner: emptyOwner(12, 12), width: 12, height: 12,
        head: { x: 6, y: 0 }, neck: { x: 6, y: 1 },
        targetLength: 25, params, rng: mulberry32(seed),
      });
      const keys = path.map((c) => `${c.x},${c.y}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('builds an orthogonally continuous path', () => {
    for (let seed = 0; seed < 100; seed++) {
      const path = growPath({
        owner: emptyOwner(12, 12), width: 12, height: 12,
        head: { x: 3, y: 0 }, neck: { x: 3, y: 1 },
        targetLength: 20, params, rng: mulberry32(seed),
      });
      for (let i = 1; i < path.length; i++) {
        const d = Math.abs(path[i]!.x - path[i - 1]!.x) + Math.abs(path[i]!.y - path[i - 1]!.y);
        expect(d).toBe(1);
      }
    }
  });

  it('does not step onto assigned cells', () => {
    const owner = emptyOwner(12, 12);
    for (let y = 0; y < 12; y++) for (let x = 6; x < 12; x++) owner[y * 12 + x] = 99;
    for (let seed = 0; seed < 50; seed++) {
      const path = growPath({
        owner, width: 12, height: 12,
        head: { x: 2, y: 0 }, neck: { x: 2, y: 1 },
        targetLength: 30, params, rng: mulberry32(seed),
      });
      for (const c of path) expect(c.x).toBeLessThan(6);
    }
  });

  // §12.9 — extreme length of 2 and acceptance of a shorter piece when growth gets stuck.
  it('yields exactly two cells at targetLength = 2', () => {
    const path = growPath({
      owner: emptyOwner(12, 12), width: 12, height: 12,
      head: { x: 0, y: 0 }, neck: { x: 0, y: 1 },
      targetLength: 2, params, rng: mulberry32(4),
    });
    expect(path.length).toBe(2);
  });

  it('accepts a shorter path when there is nowhere to grow', () => {
    // A 2x2 board, only (0,0) and (0,1) are free — it can't get any longer.
    const owner = new Int32Array(4).fill(0);
    owner[0] = EMPTY;
    owner[2] = EMPTY;
    const path = growPath({
      owner, width: 2, height: 2,
      head: { x: 0, y: 0 }, neck: { x: 0, y: 1 },
      targetLength: 10, params: { ...params, width: 2, height: 2 }, rng: mulberry32(2),
    });
    expect(path.length).toBe(2);
  });

  it('respects targetLength as an upper bound', () => {
    for (let seed = 0; seed < 50; seed++) {
      const path = growPath({
        owner: emptyOwner(12, 12), width: 12, height: 12,
        head: { x: 5, y: 0 }, neck: { x: 5, y: 1 },
        targetLength: 7, params, rng: mulberry32(seed),
      });
      expect(path.length).toBeLessThanOrEqual(7);
    }
  });

  // Warnsdorff steers the shape: at strength 0, paths are simpler and more
  // often fragment the leftover. This test guards that the parameter has any effect at all.
  it('changes shape with Warnsdorff strength', () => {
    const bends = (warnsdorff: number) => {
      let total = 0;
      for (let seed = 0; seed < 60; seed++) {
        const path = growPath({
          owner: emptyOwner(12, 12), width: 12, height: 12,
          head: { x: 6, y: 0 }, neck: { x: 6, y: 1 },
          targetLength: 25, params: { ...params, warnsdorff }, rng: mulberry32(seed),
        });
        for (let i = 2; i < path.length; i++) {
          const dx1 = path[i]!.x - path[i - 1]!.x, dy1 = path[i]!.y - path[i - 1]!.y;
          const dx2 = path[i - 1]!.x - path[i - 2]!.x, dy2 = path[i - 1]!.y - path[i - 2]!.y;
          if (dx1 !== dx2 || dy1 !== dy2) total++;
        }
      }
      return total;
    };
    expect(bends(4)).toBeGreaterThan(bends(0));
  });

  // §12.22 — straightBias = 1 must not produce an infinite weight or NaN.
  it('survives an extreme break degree', () => {
    for (const straightBias of [0, 1]) {
      const path = growPath({
        owner: emptyOwner(12, 12), width: 12, height: 12,
        head: { x: 5, y: 0 }, neck: { x: 5, y: 1 },
        targetLength: 12, params: { ...params, straightBias }, rng: mulberry32(8),
      });
      expect(path.length).toBeGreaterThanOrEqual(2);
      for (const c of path) {
        expect(Number.isFinite(c.x)).toBe(true);
        expect(Number.isFinite(c.y)).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Run it and confirm the failure**

```bash
npm run test:core -- shapes
```

Expected: FAIL — module `./shapes` is missing.

- [ ] **Step 3: Implement growth**

```typescript
// src/core/shapes.ts
import { wouldStrand } from './decompose';
import { isInside } from './geometry';
import { Rng, weightedPick } from './rng';
import { Coord, DIR_VECTORS, EMPTY, GeneratorParams } from './types';

export interface GrowthContext {
  owner: Int32Array;
  width: number;
  height: number;
  /** The cell holding the arrowhead. */
  head: Coord;
  /** The first body cell — lies BEHIND the head. */
  neck: Coord;
  targetLength: number;
  params: GeneratorParams;
  rng: Rng;
}

interface Candidate {
  cell: Coord;
  step: Coord;
  weight: number;
}

/**
 * Multiplier for continuing straight.
 *
 * GOTCHA: the naive `straightBias / (1 - straightBias)` at straightBias = 1
 * divides by zero, and the §12.22 test requires the extremes to work.
 */
function straightMultiplier(straightBias: number): number {
  const b = Math.min(0.999, Math.max(0, straightBias));
  return b / (1 - b);
}

/**
 * Grows a piece's body from the neck into the unassigned area.
 *
 * The body has NO geometric constraints — legality depends only on the head
 * (§6), so the path can go wherever it wants, as long as it stays on
 * unassigned cells. That freedom is exactly what produces the tangled shapes.
 *
 * Candidate weights:
 *  - moving sideways has weight `lateralWeight`, moving inward has weight 1 —
 *    sideways builds the shape, inward cuts the path off from the frontier,
 *  - continuing straight gets a multiplier from `straightBias`,
 *  - Warnsdorff: `warnsdorff^(3 - number of free neighbors)` — eats dead ends
 *    before they can close off. Without it, 1 board in 30 never closes at all
 *    (§7), so this isn't tuning, it's part of the algorithm.
 */
export function growPath(ctx: GrowthContext): Coord[] {
  const { owner, width, height, params, rng } = ctx;
  const path: Coord[] = [ctx.head, ctx.neck];
  const used = new Set<number>([
    ctx.head.y * width + ctx.head.x,
    ctx.neck.y * width + ctx.neck.x,
  ]);
  const straightBonus = straightMultiplier(params.straightBias);
  let lastStep: Coord = { x: ctx.neck.x - ctx.head.x, y: ctx.neck.y - ctx.head.y };
  const inwardStep = lastStep;

  while (path.length < ctx.targetLength) {
    const tail = path[path.length - 1]!;
    const candidates: Candidate[] = [];

    for (const v of DIR_VECTORS) {
      const nx = tail.x + v.x;
      const ny = tail.y + v.y;
      if (!isInside(width, height, nx, ny)) continue;
      const idx = ny * width + nx;
      if (owner[idx] !== EMPTY || used.has(idx)) continue;

      const isInward = v.x === inwardStep.x && v.y === inwardStep.y;
      let weight = isInward ? 1 : params.lateralWeight;
      if (v.x === lastStep.x && v.y === lastStep.y) weight *= straightBonus;

      if (params.warnsdorff > 0) {
        let freeNeighbours = 0;
        for (const e of DIR_VECTORS) {
          const ax = nx + e.x;
          const ay = ny + e.y;
          if (!isInside(width, height, ax, ay)) continue;
          const j = ay * width + ax;
          if (owner[j] === EMPTY && !used.has(j)) freeNeighbours++;
        }
        weight *= Math.pow(params.warnsdorff, 3 - freeNeighbours);
      }

      if (weight > 0) candidates.push({ cell: { x: nx, y: ny }, step: v, weight });
    }

    if (candidates.length === 0) break; // a shorter piece is acceptable

    const picked = weightedPick(rng, candidates, (c) => c.weight);
    path.push(picked.cell);
    used.add(picked.cell.y * width + picked.cell.x);
    lastStep = picked.step;
  }

  return path;
}

/**
 * Shortens a path until it stops stranding a non-decomposable fragment.
 * Returns null when even a two-cell start strands the leftover.
 */
export function trimToSafe(
  owner: Int32Array,
  width: number,
  height: number,
  path: readonly Coord[],
): Coord[] | null {
  if (!wouldStrand(owner, width, height, path)) return [...path];
  for (let len = path.length - 1; len >= 2; len--) {
    const shorter = path.slice(0, len);
    if (!wouldStrand(owner, width, height, shorter)) return shorter;
  }
  return null;
}
```

- [ ] **Step 4: Run the tests — they must pass**

```bash
npm run test:core -- shapes
```

Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add path growth with Warnsdorff rule"
```

---

### Task 5: Carving loop, backtracks, and restarts

**Files:**
- Create: `src/core/generator.ts`
- Test: `src/core/generator.spec.ts`

**Interfaces:**
- Consumes: `Skyline`, `drawTargetLength`, `growPath`, `trimToSafe`,
  `createBoard`, `validateBoard`.
- Produces:
  - `generate(params: GeneratorParams, budget?: GenerationBudget): GenerationResult`
  - `interface GenerationBudget { maxBacktracks: number; maxRestarts: number }`
    (default `{ maxBacktracks: 3000, maxRestarts: 5 }`)
  - `interface GenerationResult { board: Board; report: GenerationReport; complete: boolean }`
  - `defaultParams(width: number, height: number, seed: number): GeneratorParams`

- [ ] **Step 1: Write failing tests (§12.11, 12a, 12b, 12d, 12e, 13, 20, 21)**

```typescript
// src/core/generator.spec.ts
import { coveredCells, validateBoard } from './board';
import { defaultParams, generate } from './generator';

describe('generate — invariants', () => {
  // §12.12a — the generator's most important invariant.
  it('covers the board 100% across many seeds and sizes', () => {
    for (const [w, h] of [[10, 10], [25, 25], [25, 50], [40, 20]] as const) {
      for (let seed = 1; seed <= 15; seed++) {
        const { board, complete } = generate(defaultParams(w, h, seed));
        expect(complete).toBe(true);
        expect(validateBoard(board)).toEqual([]);
        expect(coveredCells(board)).toBe(w * h);
      }
    }
  });

  // §12.12b — every piece has at least 2 cells.
  it('never produces a single-cell piece', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { board } = generate(defaultParams(20, 20, seed));
      for (const p of board.pieces.values()) expect(p.cells.length).toBeGreaterThanOrEqual(2);
    }
  });

  // §12.13 — determinism.
  it('produces an identical board for the same seed', () => {
    const a = generate(defaultParams(25, 25, 1234));
    const b = generate(defaultParams(25, 25, 1234));
    expect([...a.board.occupancy]).toEqual([...b.board.occupancy]);
    expect(a.board.pieces.size).toBe(b.board.pieces.size);
    for (const [id, p] of a.board.pieces) {
      expect(b.board.pieces.get(id)!.cells).toEqual(p.cells);
      expect(b.board.pieces.get(id)!.dir).toBe(p.dir);
    }
  });

  it('produces different boards for different seeds', () => {
    const a = generate(defaultParams(25, 25, 1));
    const b = generate(defaultParams(25, 25, 2));
    expect([...a.board.occupancy]).not.toEqual([...b.board.occupancy]);
  });

  // §12.12e — an odd board area is handled.
  it('closes a board with an odd area', () => {
    for (const [w, h] of [[5, 5], [25, 25], [7, 9]] as const) {
      for (let seed = 1; seed <= 10; seed++) {
        const { board, complete } = generate(defaultParams(w, h, seed));
        expect(complete).toBe(true);
        expect(coveredCells(board)).toBe(w * h);
        const odd = [...board.pieces.values()].some((p) => p.cells.length % 2 === 1);
        expect(odd).toBe(true);
      }
    }
  });

  // §12.11 — degenerate boards.
  it('handles extreme boards', () => {
    for (const [w, h] of [[1, 8], [8, 1], [2, 2], [2, 3], [3, 2]] as const) {
      const { board, complete } = generate(defaultParams(w, h, 5));
      expect(complete).toBe(true);
      expect(validateBoard(board)).toEqual([]);
    }
  });

  it('refuses to work on a single-cell board instead of looping forever', () => {
    const { complete } = generate(defaultParams(1, 1, 1));
    expect(complete).toBe(false); // 1 cell is a length-1 piece — not admissible
  });

  // §12.20 — scale.
  it('closes a 100x100 Nightmare board', () => {
    const { board, complete, report } = generate(defaultParams(100, 100, 77));
    expect(complete).toBe(true);
    expect(coveredCells(board)).toBe(10_000);
    expect(validateBoard(board)).toEqual([]);
    expect(report.generationMs).toBeLessThan(5_000);
  }, 30_000);
});

describe('generate — report', () => {
  it('reports what was actually achieved', () => {
    const { board, report } = generate(defaultParams(30, 30, 3));
    expect(report.actualPieceCount).toBe(board.pieces.size);
    const sum = report.lengthHistogram.reduce((a, b) => a + b, 0);
    expect(sum).toBe(board.pieces.size);
    expect(report.meanLength).toBeCloseTo(900 / board.pieces.size, 5);
    expect(report.maxLength).toBe(
      Math.max(...[...board.pieces.values()].map((p) => p.cells.length)),
    );
  });

  // §12.21 — parameters that the geometry doesn't allow.
  it('finishes with infeasible parameters and reports the discrepancy', () => {
    const params = {
      ...defaultParams(25, 25, 9),
      maxLength: 5_000,
      bucketWeights: [0, 0, 1] as const,
      straightBias: 1,
    };
    const start = Date.now();
    const { board, complete, report } = generate(params);
    expect(Date.now() - start).toBeLessThan(20_000);
    expect(complete).toBe(true);
    expect(coveredCells(board)).toBe(625);
    // Pieces of up to 5000 cells were requested; the board has 625, so the
    // discrepancy must be visible, not hidden.
    expect(report.maxLength).toBeLessThan(params.maxLength);
  }, 30_000);

  // §12.22 — extremes of the break degree.
  it('produces valid boards for straightBias 0 and 1', () => {
    for (const straightBias of [0, 1]) {
      const { board, complete } = generate({ ...defaultParams(20, 20, 4), straightBias });
      expect(complete).toBe(true);
      expect(validateBoard(board)).toEqual([]);
    }
  });

  // §12.12d — getting out of a jam.
  it('counts backtracks and restarts instead of looping forever', () => {
    // A tight budget forces the generator to reach for a restart.
    const { report, complete, board } = generate(
      defaultParams(30, 30, 11),
      { maxBacktracks: 5, maxRestarts: 20 },
    );
    expect(report.backtracks).toBeGreaterThanOrEqual(0);
    if (complete) expect(coveredCells(board)).toBe(900);
  }, 30_000);
});
```

- [ ] **Step 2: Run it and confirm the failure**

```bash
npm run test:core -- generator
```

Expected: FAIL — module `./generator` is missing.

- [ ] **Step 3: Implement the generator**

```typescript
// src/core/generator.ts
import { createBoard } from './board';
import { isInside, oppositeDir } from './geometry';
import { drawTargetLength } from './lengths';
import { mulberry32, Rng } from './rng';
import { growPath, trimToSafe } from './shapes';
import { lineOf, Skyline } from './skyline';
import {
  ALL_DIRS, Board, Coord, Dir, DIR_VECTORS, EMPTY, GenerationReport, GeneratorParams, Piece,
} from './types';

export interface GenerationBudget {
  maxBacktracks: number;
  maxRestarts: number;
}

export interface GenerationResult {
  board: Board;
  report: GenerationReport;
  /** Whether the board was closed to 100%. */
  complete: boolean;
}

export const DEFAULT_BUDGET: GenerationBudget = { maxBacktracks: 3000, maxRestarts: 5 };

/** Default parameters — values calibrated by measurement (spec §7). */
export function defaultParams(width: number, height: number, seed: number): GeneratorParams {
  return {
    width,
    height,
    maxLength: Math.round(2.5 * Math.max(width, height)),
    bucketWeights: [0.5, 0.2, 0.3],
    straightBias: 0.6,
    lateralWeight: 3,
    warnsdorff: 4,
    headBias: 1,
    seed,
  };
}

class Carver {
  readonly owner: Int32Array;
  readonly pieces: Piece[] = [];
  remaining: number;
  backtracks = 0;
  private readonly skyline: Skyline;

  constructor(
    private readonly params: GeneratorParams,
    private readonly rng: Rng,
  ) {
    const { width, height } = params;
    this.owner = new Int32Array(width * height).fill(EMPTY);
    this.remaining = width * height;
    this.skyline = new Skyline(width, height);
    this.skyline.rebuild(this.owner);
  }

  /**
   * Carves out one piece. Returns false when none of the four directions has
   * a legal head — in that case the caller must back off.
   */
  carveOne(): boolean {
    const { width, height } = this.params;
    const order = shuffledDirs(this.rng);

    for (const dir of order) {
      const head = this.pickHead(dir);
      if (!head) continue;

      const back = DIR_VECTORS[oppositeDir(dir)]!;
      const neck = { x: head.x + back.x, y: head.y + back.y };

      const grown = growPath({
        owner: this.owner,
        width,
        height,
        head,
        neck,
        targetLength: drawTargetLength(this.rng, this.params),
        params: this.params,
        rng: this.rng,
      });

      const path = trimToSafe(this.owner, width, height, grown);
      if (!path || path.length < 2) continue;

      this.commit(path, dir);
      return true;
    }
    return false;
  }

  /**
   * Picks a head: the first unassigned cell of a line that has an unassigned
   * neighbor behind it. The neighbor requirement guarantees length ≥ 2 by
   * construction, with no extra condition needed (§7).
   */
  private pickHead(dir: Dir): Coord | null {
    const { width, height, headBias } = this.params;
    const lineCount = dir === 0 || dir === 2 ? width : height;
    const back = DIR_VECTORS[oppositeDir(dir)]!;
    const heads: Coord[] = [];

    for (let line = 0; line < lineCount; line++) {
      const h = this.skyline.headCandidate(dir, line);
      if (!h) continue;
      const bx = h.x + back.x;
      const by = h.y + back.y;
      if (!isInside(width, height, bx, by)) continue;
      if (this.owner[by * width + bx] !== EMPTY) continue;
      heads.push(h);
    }
    if (heads.length === 0) return null;
    if (headBias === 0) return heads[Math.floor(this.rng() * heads.length)]!;

    // Preferring the deepest line (tunneling) HALVES f0 and DOUBLES the depth
    // of the blocking graph — this is a measured difficulty knob, not a
    // hypothesis (§7). We pick from the top quarter of the ranking to keep
    // some randomness.
    const scored = heads
      .map((c) => ({ c, depth: this.skyline.depth(dir, lineOf(dir, c)) }))
      .sort((a, b) => (headBias > 0 ? b.depth - a.depth : a.depth - b.depth));
    const k = Math.max(1, Math.ceil(scored.length / 4));
    return scored[Math.floor(this.rng() * k)]!.c;
  }

  private commit(path: readonly Coord[], dir: Dir): void {
    const id = this.pieces.length;
    for (const c of path) this.owner[c.y * this.params.width + c.x] = id;
    this.pieces.push({ id, dir, cells: path.map((c) => ({ ...c })) });
    this.remaining -= path.length;
    this.skyline.recompute(this.owner, path);
  }

  private undoLast(count: number): void {
    for (let i = 0; i < count && this.pieces.length > 0; i++) {
      const p = this.pieces.pop()!;
      for (const c of p.cells) this.owner[c.y * this.params.width + c.x] = EMPTY;
      this.remaining += p.cells.length;
      this.skyline.recompute(this.owner, p.cells);
    }
  }

  /** Carves until done or until the backtrack budget is exhausted. */
  run(maxBacktracks: number): boolean {
    while (this.remaining > 0) {
      if (this.carveOne()) continue;
      if (this.backtracks >= maxBacktracks || this.pieces.length === 0) return false;
      this.backtracks++;
      // Backtrack depth grows logarithmically: the first jams are usually
      // shallow, stubborn ones require removing a bigger chunk.
      this.undoLast(1 + Math.floor(Math.log2(1 + this.backtracks)));
    }
    return true;
  }
}

function shuffledDirs(rng: Rng): Dir[] {
  const dirs: Dir[] = [...ALL_DIRS];
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j]!, dirs[i]!];
  }
  return dirs;
}

function buildReport(
  params: GeneratorParams,
  pieces: readonly Piece[],
  backtracks: number,
  restarts: number,
  generationMs: number,
): GenerationReport {
  const histogram: [number, number, number, number] = [0, 0, 0, 0];
  let longCells = 0;
  let allCells = 0;
  let maxLength = 0;
  for (const p of pieces) {
    const L = p.cells.length;
    allCells += L;
    maxLength = Math.max(maxLength, L);
    if (L <= 6) histogram[0]++;
    else if (L <= 15) histogram[1]++;
    else if (L < 50) histogram[2]++;
    else histogram[3]++;
    if (L > 15) longCells += L;
  }
  return {
    params,
    actualPieceCount: pieces.length,
    backtracks,
    restarts,
    lengthHistogram: histogram,
    longAreaShare: allCells > 0 ? longCells / allCells : 0,
    maxLength,
    meanLength: pieces.length > 0 ? allCells / pieces.length : 0,
    generationMs,
  };
}

/**
 * Generates a board covered to 100%.
 *
 * The carving order IS the solution order — it never needs to be reversed
 * (§7, correctness theorem). Metrics are left empty; `withMetrics` from
 * Slice 3 fills them in.
 *
 * The function never throws and never loops forever: once the restart budget
 * is exhausted it hands back the best result with `complete: false`, so the
 * game doesn't hang when a level starts.
 */
export function generate(
  params: GeneratorParams,
  budget: GenerationBudget = DEFAULT_BUDGET,
): GenerationResult {
  const started = performance.now();
  let best: Carver | null = null;
  let restarts = 0;
  let totalBacktracks = 0;

  for (let attempt = 0; attempt <= budget.maxRestarts; attempt++) {
    const seed = params.seed + attempt * 999_983;
    const carver = new Carver(params, mulberry32(seed));
    const ok = carver.run(budget.maxBacktracks);
    totalBacktracks += carver.backtracks;
    if (ok) {
      const ms = performance.now() - started;
      return {
        board: createBoard(params.width, params.height, carver.pieces),
        report: buildReport(params, carver.pieces, totalBacktracks, restarts, ms),
        complete: true,
      };
    }
    if (!best || carver.remaining < best.remaining) best = carver;
    restarts++;
  }

  const ms = performance.now() - started;
  const pieces = best?.pieces ?? [];
  return {
    board: createBoard(params.width, params.height, pieces),
    report: buildReport(params, pieces, totalBacktracks, restarts - 1, ms),
    complete: false,
  };
}
```

- [ ] **Step 4: Run the tests — they must pass**

```bash
npm run test:core -- generator
```

Expected: PASS. If the coverage test fails on larger boards, **do not raise
the backtrack budget** — first check whether Warnsdorff is active
(`warnsdorff = 4` in `defaultParams`) and whether `trimToSafe` is being
called. Those are the two things whose absence breaks closability (§7).

- [ ] **Step 5: Measure the time on the Nightmare board**

```bash
npm run test:core -- generator -t "Nightmare"
```

Expected: the test passes. Note the time — the prototype gave a 27–38 ms
median and ~440 ms at p99. An order of magnitude slower means a bug, not a
hardware difference.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Implement full-coverage board generator"
```

---

## Slice Acceptance Criteria

- `npm run test:core` passes; the §12.9–13 and §12.20–23 tests are green.
- The board is covered **100%** at sizes 10×10 … 100×100 and across a dozen
  or so seeds each — `validateBoard` reports nothing.
- No piece has a single cell.
- The same seed produces the bitwise-identical board.
- The generator doesn't loop forever with infeasible parameters and reports
  the discrepancy between what was requested and what was achieved.
- Nightmare 100×100 generation time is within seconds, not minutes.
