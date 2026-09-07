# Slice 4 — Benchmark, presets, and calibration

> **For agentic executors:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans`. Steps have checkboxes (`- [ ]`).

**Goal:** Replace the numbers from §9 of the spec — explicitly marked as
**provisional** — with values measured on the target implementation, and
expose `createLevel()`, which always returns a board that is solvable and
falls within the difficulty band.

**Architecture:** The Easy–Extreme presets are **named instances of
`GeneratorParams`**, not a separate code path — a single source of truth for
both the generator and the configurator. On top of the generator sits a
**generate–measure–reject** loop: a board outside the difficulty band is
rejected and regenerated with a different seed. The attempt budget is
bounded; once exhausted, we return the best result so far, so the game never
hangs when starting a level.

**Stack:** TypeScript strict, Vitest, `tsx` to run the benchmark.

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md` (§7, §9, §12
"Benchmark")

**Map:** `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`

## Global Constraints

The constraints from the implementation map apply. Critical for this slice:

- **Fill is not a parameter** — it is always 100%. Line count and mean
  length are **a single quantity**: `mean = W·H / line count`.
- Difficulty thresholds scale with piece count, so we use **shares/ratios**,
  not absolute counts.
- The generation-time distribution is extremely heavy-tailed — we report
  **p50, p90, p99, and maximum**, never the mean alone.

## File Structure

| File | Responsibility |
|---|---|
| `src/core/presets.ts` | levels, formats, `presetParams()`, acceptance bands |
| `src/core/level.ts` | `createLevel()`: the generate–measure–reject loop |
| `tools/bench.ts` | benchmark CLI: time distribution, metrics, backtracks, restarts |
| `docs/benchmarks/` | measurement reports (benchmark run output) |

---

### Task 1: Presets and difficulty bands

**Files:**
- Create: `src/core/presets.ts`
- Test: `src/core/presets.spec.ts`

**Interfaces:**
- Produces:
  - `type LevelId = 'easy' | 'medium' | 'hard' | 'nightmare' | 'extreme'`
  - `type BoardFormat = 'square' | 'tall'`
  - `presetParams(level: LevelId, format: BoardFormat, seed: number): GeneratorParams`
  - `interface DifficultyBand { f0Min: number; f0Max: number }`
  - `difficultyBand(level: LevelId, format: BoardFormat): DifficultyBand`
  - `LEVEL_SIZES: Record<LevelId, number>`

Two **independent knobs**: level (base size `n`) and format (`n×n` or
`n×2n`). Format alone raises the difficulty — a tall board has shorter
horizontal corridors, so `f0` drops (Nightmare: 0.038 vs. 0.059). That's why
the bands are calibrated **per format**.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/core/presets.spec.ts
import { LEVEL_SIZES, difficultyBand, presetParams } from './presets';

describe('presetParams', () => {
  it('gives sizes matching the spec', () => {
    expect(presetParams('easy', 'square', 1)).toMatchObject({ width: 25, height: 25 });
    expect(presetParams('easy', 'tall', 1)).toMatchObject({ width: 25, height: 50 });
    expect(presetParams('nightmare', 'square', 1)).toMatchObject({ width: 100, height: 100 });
    expect(presetParams('nightmare', 'tall', 1)).toMatchObject({ width: 100, height: 200 });
  });

  it('scales maxLength with the longer side', () => {
    expect(presetParams('easy', 'tall', 1).maxLength).toBe(Math.round(2.5 * 50));
    expect(presetParams('medium', 'square', 1).maxLength).toBe(Math.round(2.5 * 50));
  });

  it('uses visually calibrated weights', () => {
    expect(presetParams('hard', 'square', 1).bucketWeights).toEqual([0.5, 0.2, 0.3]);
    expect(presetParams('hard', 'square', 1).warnsdorff).toBe(4);
  });

  it('carries the seed through', () => {
    expect(presetParams('easy', 'square', 4242).seed).toBe(4242);
  });

  // Easy needs WEAKER tunneling: with full tunneling, f0 dropped to 0.16
  // instead of the intended >= 0.35 (§7).
  it('weakens tunneling at the lowest level', () => {
    expect(presetParams('easy', 'square', 1).headBias).toBe(0);
    expect(presetParams('nightmare', 'square', 1).headBias).toBe(1);
  });

  it('knows all base sizes', () => {
    expect(LEVEL_SIZES).toEqual({ easy: 25, medium: 50, hard: 75, nightmare: 100, extreme: 200 });
  });

  // Extreme exists only as a square — checks the upper bound.
  it('does not expose the tall format for Extreme', () => {
    expect(() => presetParams('extreme', 'tall', 1)).toThrow(/only in the square variant/i);
  });
});

describe('difficultyBand', () => {
  it('decreases with level', () => {
    const easy = difficultyBand('easy', 'square');
    const nightmare = difficultyBand('nightmare', 'square');
    expect(easy.f0Min).toBeGreaterThan(nightmare.f0Min);
    expect(easy.f0Max).toBeGreaterThan(nightmare.f0Max);
  });

  it('is tighter for the tall format', () => {
    expect(difficultyBand('medium', 'tall').f0Max).toBeLessThan(
      difficultyBand('medium', 'square').f0Max,
    );
  });

  it('always leaves a non-empty band', () => {
    for (const level of ['easy', 'medium', 'hard', 'nightmare'] as const) {
      for (const format of ['square', 'tall'] as const) {
        const band = difficultyBand(level, format);
        expect(band.f0Max).toBeGreaterThan(band.f0Min);
      }
    }
  });
});
```

- [ ] **Step 2: Run and confirm the failure**

```bash
npm run test:core -- presets
```

Expected: FAIL — module `./presets` not found.

- [ ] **Step 3: Implement the presets**

```typescript
// src/core/presets.ts
import { GeneratorParams } from './types';

export type LevelId = 'easy' | 'medium' | 'hard' | 'nightmare' | 'extreme';
export type BoardFormat = 'square' | 'tall';

/** Base size `n`. Format decides whether the board is n×n or n×2n. */
export const LEVEL_SIZES: Record<LevelId, number> = {
  easy: 25,
  medium: 50,
  hard: 75,
  nightmare: 100,
  extreme: 200,
};

export interface DifficultyBand {
  f0Min: number;
  f0Max: number;
}

/**
 * `f0` bands adopted as a starting point. The center values come from the
 * tables in spec §9 (measured on the prototype); the band is ±60% around
 * them, because the implementation differs and hitting them exactly would
 * be a coincidence.
 *
 * Task 4 of this slice REPLACES these numbers with values measured on the
 * target implementation. Until then, they are what they are: a hypothesis.
 */
const F0_TARGETS: Record<LevelId, Record<BoardFormat, number>> = {
  easy: { square: 0.197, tall: 0.139 },
  medium: { square: 0.102, tall: 0.080 },
  hard: { square: 0.073, tall: 0.050 },
  nightmare: { square: 0.059, tall: 0.038 },
  extreme: { square: 0.034, tall: 0.034 },
};

export function difficultyBand(level: LevelId, format: BoardFormat): DifficultyBand {
  const target = F0_TARGETS[level][format];
  return { f0Min: target * 0.4, f0Max: target * 1.6 };
}

export function presetParams(
  level: LevelId,
  format: BoardFormat,
  seed: number,
): GeneratorParams {
  if (level === 'extreme' && format === 'tall') {
    throw new Error('Level Extreme exists only in the square variant.');
  }
  const n = LEVEL_SIZES[level];
  const width = n;
  const height = format === 'tall' ? n * 2 : n;

  return {
    width,
    height,
    maxLength: Math.round(2.5 * Math.max(width, height)),
    // Weights calibrated VISUALLY on the SVG renderer, not for the tail of
    // generation time: they give dense arrowheads plus visible long snakes
    // (§7).
    bucketWeights: [0.5, 0.2, 0.3],
    straightBias: 0.6,
    lateralWeight: 3,
    warnsdorff: 4,
    // Easy gets weaker tunneling, because at full strength f0 drops to 0.16
    // instead of the intended >= 0.35 (§7).
    headBias: level === 'easy' ? 0 : 1,
    seed,
  };
}

export const ALL_LEVELS: readonly LevelId[] = ['easy', 'medium', 'hard', 'nightmare', 'extreme'];

/** Formats available for the level. Extreme is square only. */
export function formatsFor(level: LevelId): readonly BoardFormat[] {
  return level === 'extreme' ? ['square'] : ['square', 'tall'];
}
```

- [ ] **Step 4: Run the tests — they must pass**

```bash
npm run test:core -- presets
```

Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add level presets and difficulty bands"
```

---

### Task 2: The generate–measure–reject loop

**Files:**
- Create: `src/core/level.ts`
- Test: `src/core/level.spec.ts`

**Interfaces:**
- Consumes: `generate`, `withMetrics`, `solve`, `presetParams`, `difficultyBand`.
- Produces:
  - `interface LevelResult { board: Board; report: GenerationReport; attempts: number; inBand: boolean }`
  - `createLevel(level: LevelId, format: BoardFormat, seed: number, budget?: number): LevelResult`
  - `createCustomLevel(params: GeneratorParams, budget?: number): LevelResult` —
    used by the configurator (Slice 8), without a difficulty band

- [ ] **Step 1: Write the failing tests**

```typescript
// src/core/level.spec.ts
import { validateBoard } from './board';
import { createCustomLevel, createLevel } from './level';
import { defaultParams } from './generator';
import { difficultyBand } from './presets';
import { solve } from './solver';

describe('createLevel', () => {
  it('returns a solvable board with computed metrics', () => {
    const { board } = createLevel('easy', 'square', 1);
    expect(validateBoard(board)).toEqual([]);
    expect(solve(board).solvable).toBe(true);
    expect(board.metrics.n).toBe(board.pieces.size);
    expect(board.metrics.f0).toBeGreaterThan(0);
  }, 30_000);

  it('is deterministic', () => {
    const a = createLevel('easy', 'square', 99);
    const b = createLevel('easy', 'square', 99);
    expect([...a.board.occupancy]).toEqual([...b.board.occupancy]);
    expect(a.attempts).toBe(b.attempts);
  }, 30_000);

  it('hits the difficulty band or reports that it missed', () => {
    const band = difficultyBand('easy', 'square');
    const { board, inBand } = createLevel('easy', 'square', 7);
    if (inBand) {
      expect(board.metrics.f0).toBeGreaterThanOrEqual(band.f0Min);
      expect(board.metrics.f0).toBeLessThanOrEqual(band.f0Max);
    }
    // Even when it misses, the board MUST be playable — the game must not
    // hang when starting a level.
    expect(solve(board).solvable).toBe(true);
  }, 30_000);

  it('never exceeds the attempt budget', () => {
    const { attempts } = createLevel('easy', 'square', 5, 3);
    expect(attempts).toBeLessThanOrEqual(3);
  }, 30_000);

  it('supports the tall format', () => {
    const { board } = createLevel('easy', 'tall', 2);
    expect(board.width).toBe(25);
    expect(board.height).toBe(50);
    expect(validateBoard(board)).toEqual([]);
  }, 30_000);
});

describe('createCustomLevel', () => {
  it('does not apply a difficulty band', () => {
    // A 12x12 board doesn't match any preset — it must still be produced.
    const { board, inBand } = createCustomLevel(defaultParams(12, 12, 3));
    expect(validateBoard(board)).toEqual([]);
    expect(inBand).toBe(true); // no band = always in band
  }, 30_000);

  it('returns the best result even with infeasible parameters', () => {
    const params = {
      ...defaultParams(20, 20, 3),
      maxLength: 10_000,
      bucketWeights: [0, 0, 1] as const,
    };
    const { board } = createCustomLevel(params);
    expect(board.pieces.size).toBeGreaterThan(0);
  }, 30_000);
});
```

- [ ] **Step 2: Run and confirm the failure**

```bash
npm run test:core -- level
```

Expected: FAIL — module `./level` not found.

- [ ] **Step 3: Implement the acceptance loop**

```typescript
// src/core/level.ts
import { generate, GenerationBudget } from './generator';
import { withMetrics } from './metrics';
import { BoardFormat, DifficultyBand, difficultyBand, LevelId, presetParams } from './presets';
import { solve } from './solver';
import { Board, GenerationReport, GeneratorParams } from './types';

export interface LevelResult {
  board: Board;
  report: GenerationReport;
  /** How many boards had to be generated before one hit the band. */
  attempts: number;
  inBand: boolean;
}

const DEFAULT_ATTEMPTS = 6;

/** Distance from the band; 0 means a hit. Used to pick the best attempt. */
function bandDistance(f0: number, band: DifficultyBand | null): number {
  if (!band) return 0;
  if (f0 < band.f0Min) return band.f0Min - f0;
  if (f0 > band.f0Max) return f0 - band.f0Max;
  return 0;
}

function generateInBand(
  params: GeneratorParams,
  band: DifficultyBand | null,
  maxAttempts: number,
  budget?: GenerationBudget,
): LevelResult {
  let best: LevelResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Successive attempts get a derived seed, so the whole thing stays
    // deterministic with respect to the input seed.
    const seeded = { ...params, seed: params.seed + (attempt - 1) * 7_919 };
    const { board: raw, report, complete } = generate(seeded, budget);
    const board = withMetrics(raw);

    // Verification is independent of the generator — this is not a trust
    // assertion, it's the condition for letting a board into the game (§8).
    const solvable = complete && solve(board).solvable;
    const distance = solvable ? bandDistance(board.metrics.f0, band) : Number.POSITIVE_INFINITY;
    const candidate: LevelResult = { board, report, attempts: attempt, inBand: distance === 0 };

    if (solvable && distance === 0) return candidate;

    // Unsolvable boards have infinite distance, so they never win the
    // selection — no need to filter them out with a separate condition.
    const bestDistance = best
      ? bandDistance(best.board.metrics.f0, band)
      : Number.POSITIVE_INFINITY;
    if (distance < bestDistance) best = candidate;
  }

  // Budget exhausted — return the best result. The game never hangs when
  // starting a level, even at the cost of a board outside the band (§7).
  return { ...best!, attempts: maxAttempts, inBand: false };
}

/** Board for a preset, using the generate–measure–reject loop. */
export function createLevel(
  level: LevelId,
  format: BoardFormat,
  seed: number,
  maxAttempts = DEFAULT_ATTEMPTS,
): LevelResult {
  const params = presetParams(level, format, seed);
  return generateInBand(params, difficultyBand(level, format), maxAttempts);
}

/**
 * Board for parameters coming from the configurator.
 *
 * No difficulty band: the player set the parameters themselves and should
 * get exactly what they asked for — together with a report of what actually
 * came out (§11).
 */
export function createCustomLevel(
  params: GeneratorParams,
  maxAttempts = 2,
): LevelResult {
  return generateInBand(params, null, maxAttempts);
}
```

- [ ] **Step 4: Run the tests — they must pass**

```bash
npm run test:core -- level
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add generate-measure-reject loop for levels"
```

---

### Task 3: Benchmark

**Files:**
- Create: `tools/bench.ts`
- Modify: `package.json` (`bench` script, `tsx` devDependency)

**Interfaces:**
- Consumes: `presetParams`, `generate`, `computeMetrics`, `estimateMinFree`.
- Produces: a text report on stdout, optionally saved to
  `docs/benchmarks/<date>-<description>.md`.

The benchmark **is not a test** — it is an implementation step (§12). Its
output replaces the numbers in `F0_TARGETS` and is the basis for calibrating
scoring in Slice 5.

- [ ] **Step 1: Add `tsx` and the script**

```bash
npm install --save-dev tsx
```

In `package.json`, under `scripts`:

```json
{
  "bench": "tsx tools/bench.ts"
}
```

- [ ] **Step 2: Write the benchmark**

```typescript
// tools/bench.ts
import { writeFileSync } from 'node:fs';
import { generate } from '../src/core/generator';
import { computeMetrics, estimateMinFree } from '../src/core/metrics';
import { ALL_LEVELS, BoardFormat, formatsFor, LevelId, presetParams } from '../src/core/presets';
import { mulberry32 } from '../src/core/rng';
import { solve } from '../src/core/solver';

interface Row {
  label: string;
  width: number;
  height: number;
  pieces: number;
  meanLength: number;
  maxLength: number;
  f0: number;
  almost1Share: number;
  depth: number;
  meanCorridorLen: number;
  dirEntropy: number;
  lenEntropy: number;
  minFree: number;
  histogram: readonly number[];
  timesMs: number[];
  backtracks: number[];
  restarts: number;
  failures: number;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
}

function measure(level: LevelId, format: BoardFormat, runs: number): Row {
  const timesMs: number[] = [];
  const backtracks: number[] = [];
  let restarts = 0;
  let failures = 0;
  let last: ReturnType<typeof computeMetrics> | null = null;
  let lastPieces = 0;
  let lastMean = 0;
  let lastMax = 0;
  let lastHistogram: readonly number[] = [];
  let minFree = Number.POSITIVE_INFINITY;

  const params = presetParams(level, format, 50_000);
  for (let run = 0; run < runs; run++) {
    const t0 = performance.now();
    const result = generate({ ...params, seed: 50_000 + run });
    const dt = performance.now() - t0;

    if (!result.complete) {
      failures++;
      continue;
    }
    timesMs.push(dt);
    backtracks.push(result.report.backtracks);
    restarts += result.report.restarts;

    const metrics = computeMetrics(result.board);
    if (!solve(result.board).solvable) {
      throw new Error(`Board ${level}/${format} seed ${50_000 + run} UNSOLVABLE`);
    }
    last = metrics;
    lastPieces = result.board.pieces.size;
    lastMean = result.report.meanLength;
    lastMax = result.report.maxLength;
    lastHistogram = result.report.lengthHistogram;
    // minFree is stochastic and expensive — compute it once per row.
    if (run === 0 && params.width * params.height <= 5_000) {
      minFree = estimateMinFree(result.board, mulberry32(1), 3);
    }
  }

  timesMs.sort((a, b) => a - b);
  backtracks.sort((a, b) => a - b);

  return {
    label: `${level}/${format}`,
    width: params.width,
    height: params.height,
    pieces: lastPieces,
    meanLength: lastMean,
    maxLength: lastMax,
    f0: last?.f0 ?? 0,
    almost1Share: last && last.n > 0 ? last.almost1 / last.n : 0,
    depth: last?.d ?? 0,
    meanCorridorLen: last?.meanCorridorLen ?? 0,
    dirEntropy: last?.dirEntropy ?? 0,
    lenEntropy: last?.lenEntropy ?? 0,
    minFree: Number.isFinite(minFree) ? minFree : -1,
    histogram: lastHistogram,
    timesMs,
    backtracks,
    restarts,
    failures,
  };
}

function formatReport(rows: readonly Row[], runs: number): string {
  const lines: string[] = [];
  lines.push(`# Generator benchmark — ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push(`Runs per row: ${runs}. Node ${process.version}.`);
  lines.push('');
  lines.push('## Difficulty metrics');
  lines.push('');
  lines.push('| Level | board | pieces | mean len. | max len. | f0 | almost1 | D | corridor | H(dir) | H(len) |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    lines.push(
      `| ${r.label} | ${r.width}×${r.height} | ${r.pieces} | ${r.meanLength.toFixed(1)} | ` +
        `${r.maxLength} | ${r.f0.toFixed(3)} | ${(100 * r.almost1Share).toFixed(0)}% | ${r.depth} | ` +
        `${r.meanCorridorLen.toFixed(1)} | ${r.dirEntropy.toFixed(2)} | ${r.lenEntropy.toFixed(2)} |`,
    );
  }
  lines.push('');
  lines.push('## Generation time and resilience');
  lines.push('');
  lines.push('| Level | p50 | p90 | p99 | max | backtracks p99 | restarts | failures |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    lines.push(
      `| ${r.label} | ${quantile(r.timesMs, 0.5).toFixed(0)} ms | ` +
        `${quantile(r.timesMs, 0.9).toFixed(0)} ms | ${quantile(r.timesMs, 0.99).toFixed(0)} ms | ` +
        `${(r.timesMs.at(-1) ?? 0).toFixed(0)} ms | ${quantile(r.backtracks, 0.99)} | ` +
        `${r.restarts} | ${r.failures}/${runs} |`,
    );
  }
  lines.push('');
  lines.push('## Length distribution (2–6 / 7–15 / 16–49 / 50+)');
  lines.push('');
  for (const r of rows) {
    const total = r.histogram.reduce((a, b) => a + b, 0) || 1;
    const pct = r.histogram.map((h) => `${((100 * h) / total).toFixed(0)}%`).join(' / ');
    lines.push(`- **${r.label}**: ${pct}`);
  }
  return lines.join('\n');
}

const runs = Number(process.argv.find((a) => a.startsWith('--runs='))?.split('=')[1] ?? 20);
const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];
const out = process.argv.find((a) => a.startsWith('--out='))?.split('=')[1];

const rows: Row[] = [];
for (const level of ALL_LEVELS) {
  if (only && level !== only) continue;
  for (const format of formatsFor(level)) {
    process.stderr.write(`measuring ${level}/${format}…\n`);
    rows.push(measure(level, format, runs));
  }
}

const report = formatReport(rows, runs);
console.log(report);
if (out) {
  writeFileSync(out, report + '\n');
  process.stderr.write(`\nsaved to ${out}\n`);
}
```

- [ ] **Step 3: Run the benchmark on small levels**

```bash
npm run bench -- --only=easy --runs=10
```

Expected: two tables and a length distribution, zero failures.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add generator benchmark"
```

---

### Task 4: Calibrating the difficulty bands

**Files:**
- Create: `docs/benchmarks/2026-09-07-generator.md` (run output)
- Modify: `src/core/presets.ts` (`F0_TARGETS`)

**Interfaces:**
- Produces: `F0_TARGETS` based on a **measurement of the target
  implementation**, not on the prototype's tables.

- [ ] **Step 1: Collect a full measurement**

```bash
mkdir -p docs/benchmarks
npm run bench -- --runs=30 --out=docs/benchmarks/2026-09-07-generator.md
```

The Extreme 200×200 level can take a few minutes at 30 runs — that's
normal (prototype: p99 ≈ 2.1 s per board).

- [ ] **Step 2: Compare against the spec §9 tables**

Check three things and note discrepancies in the report header:

1. **`f0` decreases with the level** and is lower in the tall format.
   If it doesn't decrease, tunneling (`headBias`) isn't working.
2. **~72% of pieces have 2–6 cells, ~2% exceed 50.**
   If long ones are missing, the length distribution has been silently
   truncated (§12.9b).
3. **Zero generation failures** at all levels.
   A single failure out of 30 means Warnsdorff is disabled or too weak.

- [ ] **Step 3: Insert the measured values into `F0_TARGETS`**

Replace the values in `src/core/presets.ts` with the medians from the
report's `f0` column. Leave a comment with the measurement date and the
number of runs:

```typescript
/**
 * Measured on the target implementation: docs/benchmarks/2026-09-07-generator.md
 * (30 runs per row). Replaces the provisional values from spec §9.
 */
const F0_TARGETS: Record<LevelId, Record<BoardFormat, number>> = {
  // ... values from the report
};
```

- [ ] **Step 4: Check that the bands are hittable**

```bash
npm run test:core -- level
```

Add a test guarding that, for each preset, the first attempt hits the band
at least half the time — otherwise the acceptance loop wastes time:

```typescript
// append to src/core/level.spec.ts
describe('band hit rate', () => {
  it('hits the band without multiple attempts', () => {
    for (const level of ['easy', 'medium'] as const) {
      let hits = 0;
      for (let seed = 1; seed <= 6; seed++) {
        if (createLevel(level, 'square', seed).attempts === 1) hits++;
      }
      expect(hits).toBeGreaterThanOrEqual(3);
    }
  }, 120_000);
});
```

- [ ] **Step 5: Update the spec**

Add a sentence in spec §9 pointing to the report, so the tables don't
pretend to be current:

```markdown
> **Measurement on the target implementation (2026-09-07):**
> `docs/benchmarks/2026-09-07-generator.md`. The tables below come from
> the prototype and remain as a reference point.
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Calibrate difficulty bands using implementation measurement"
```

---

## Slice Acceptance Criteria

- `npm run bench -- --runs=30` finishes with no generation failures at any
  level or format.
- The report lives in `docs/benchmarks/` and is committed.
- `F0_TARGETS` comes from measurement, not from the prototype; the comment
  states the measurement date and the number of runs.
- `createLevel` always returns a solvable board — even when it misses the
  band.
- `createLevel` is deterministic with respect to the seed, including the
  attempt count.
- The length distribution has a heavy tail: ~72% short and ~2% above 50
  cells.
