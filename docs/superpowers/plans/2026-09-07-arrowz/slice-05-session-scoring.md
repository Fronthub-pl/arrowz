# Slice 5 — Game Loop and Scoring

> **For agentic implementers:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans`. Steps have checkboxes (`- [ ]`).

**Goal:** A complete game as a **pure reducer** — playable from a test,
before a single pixel of UI exists.

**Architecture:** `game/session.ts` is a reducer with no DOM and no side
effects. Time **is never read inside the reducer**: the `at` timestamp comes
in as an action field, and `elapsedMs` is derived from it. The reducer returns
an `effect` — a ready-made command for the renderer, bounce distance
included, so the visual layer never has to infer anything itself. Points are
awarded **once**, on the transition to `won`.

**Stack:** TypeScript strict, Vitest on Node.

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md` (§10,
§12.26–28)

**Map:** `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`

## Global Constraints

The constraints from the implementation map apply. Critical for this slice:

- **Zero `Date.now()` in `game/`.** Test §12.27 requires that the same
  sequence of actions with the same timestamps produce an identical result
  **without a clock mock**. If a test needs a mock, the reducer has stopped
  being pure.
- Clicking the same blocked piece repeatedly costs a life **every time**. A
  deliberate decision, covered by a test.
- The timed variant **does not impose a limit** — the stopwatch only measures.
- `streak` and `bestStreak` **do not feed into the score**: the number of
  mistakes is already represented by `livesLeft`.

## Spec additions in this slice

1. **`Session.moves`** — a log of clicked piece IDs. Without it, the Cloud
   Function from Slice 10 has nothing to replay.
2. **Scoring multipliers weighted by board variety.** The formula from §10,
   taken literally, **fails its own test 26e** — details in Task 3.
3. **The `restart` action carries no seed, only an optional board.** The
   reducer does not generate boards: generation takes up to half a second and
   needs parameters the session doesn't know. A new board is supplied by the
   layer above.

## File Structure

| File | Responsibility |
|---|---|
| `src/game/session.ts` | session types, `createSession`, `reduce` |
| `src/game/scoring.ts` | scoring formula and score breakdown |
| `src/game/replay.ts` | replaying a run from a seed and a move sequence |
| `src/game/*.spec.ts` | tests §12.26–28 |

---

### Task 1: Session reducer

**Files:**
- Create: `src/game/session.ts`
- Test: `src/game/session.spec.ts`

**Interfaces:**
- Consumes: `Board`, `probeMove`, `removePiece`, `Dir` from Slice 1.
- Produces:
  - `type GameMode = 'classic' | 'timed'`, `type Status = 'playing' | 'won' | 'lost'`
  - `interface Session { board: Board; initialBoard: Board; lives: number; status: Status; removed: number; startedAt: number; elapsedMs: number; mode: GameMode; streak: number; bestStreak: number; score: number; breakdown: ScoreBreakdown | null; moves: number[] }`
  - `type Action = { type: 'click'; pieceId: number; at: number } | { type: 'tick'; at: number } | { type: 'restart'; at: number; board?: Board }`
  - `type Effect = { kind: 'exit'; pieceId: number; dir: Dir } | { kind: 'bounce'; pieceId: number; distance: number; blockerId: number } | { kind: 'none' }`
  - `createSession(board: Board, mode: GameMode, startedAt: number): Session`
  - `reduce(session: Session, action: Action): { next: Session; effect: Effect }`
  - `INITIAL_LIVES = 3`

- [ ] **Step 1: Write the failing reducer tests**

```typescript
// src/game/session.spec.ts
import { withMetrics } from '../core/metrics';
import { boardOf, piece } from '../core/testing/fixtures';
import { createSession, INITIAL_LIVES, reduce, Session } from './session';

/**
 * A column of four cells: piece 0 (at the top) is free,
 * piece 1 (below it) is blocked by it.
 */
function twoPieceBoard() {
  return withMetrics(
    boardOf(1, 4, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[0, 2], [0, 3]]),
    ]),
  );
}

function fresh(mode: 'classic' | 'timed' = 'classic'): Session {
  return createSession(twoPieceBoard(), mode, 1_000);
}

describe('createSession', () => {
  it('starts with three lives and empty state', () => {
    const s = fresh();
    expect(s.lives).toBe(INITIAL_LIVES);
    expect(s.status).toBe('playing');
    expect(s.removed).toBe(0);
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(0);
    expect(s.score).toBe(0);
    expect(s.breakdown).toBeNull();
    expect(s.moves).toEqual([]);
    expect(s.elapsedMs).toBe(0);
  });
});

describe('reduce — clicking a free piece', () => {
  it('removes the piece and returns an exit effect', () => {
    const { next, effect } = reduce(fresh(), { type: 'click', pieceId: 0, at: 2_000 });
    expect(effect).toEqual({ kind: 'exit', pieceId: 0, dir: 0 });
    expect(next.board.pieces.has(0)).toBe(false);
    expect(next.removed).toBe(1);
    expect(next.lives).toBe(3);
  });

  it('bumps the streak, but does not add to the score', () => {
    const { next } = reduce(fresh(), { type: 'click', pieceId: 0, at: 2_000 });
    expect(next.streak).toBe(1);
    expect(next.bestStreak).toBe(1);
    expect(next.score).toBe(0); // §12.26a
  });

  it('updates the stopwatch from the action timestamp', () => {
    const { next } = reduce(fresh(), { type: 'click', pieceId: 0, at: 3_500 });
    expect(next.elapsedMs).toBe(2_500);
  });

  it('does not mutate the input board', () => {
    const s = fresh();
    reduce(s, { type: 'click', pieceId: 0, at: 2_000 });
    expect(s.board.pieces.has(0)).toBe(true);
  });
});

describe('reduce — clicking a blocked piece', () => {
  it('leaves the piece, subtracts a life, and returns a bounce', () => {
    const { next, effect } = reduce(fresh(), { type: 'click', pieceId: 1, at: 2_000 });
    expect(effect).toEqual({ kind: 'bounce', pieceId: 1, distance: 1, blockerId: 0 });
    expect(next.board.pieces.has(1)).toBe(true);
    expect(next.lives).toBe(2);
    expect(next.removed).toBe(0);
  });

  it('resets the streak', () => {
    // A column of six cells: 0 free, 1 blocked by 0, 2 blocked by 1.
    const board = withMetrics(
      boardOf(1, 6, [
        piece(0, 0, [[0, 0], [0, 1]]),
        piece(1, 0, [[0, 2], [0, 3]]),
        piece(2, 0, [[0, 4], [0, 5]]),
      ]),
    );
    let s = createSession(board, 'classic', 0);
    s = reduce(s, { type: 'click', pieceId: 0, at: 100 }).next;
    expect(s.streak).toBe(1);
    s = reduce(s, { type: 'click', pieceId: 2, at: 200 }).next; // still blocked by 1
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(1);
  });

  // Deliberate decision: every click on a blocked piece costs a life.
  it('subtracts a life on every subsequent click of the same piece', () => {
    let s = fresh();
    s = reduce(s, { type: 'click', pieceId: 1, at: 2_000 }).next;
    s = reduce(s, { type: 'click', pieceId: 1, at: 3_000 }).next;
    expect(s.lives).toBe(1);
    expect(s.status).toBe('playing');
  });

  it('ends the game as a loss at zero lives', () => {
    let s = fresh();
    for (const at of [2_000, 3_000, 4_000]) {
      s = reduce(s, { type: 'click', pieceId: 1, at }).next;
    }
    expect(s.lives).toBe(0);
    expect(s.status).toBe('lost');
  });
});

describe('reduce — game end', () => {
  it('transitions to a win once the board is emptied', () => {
    let s = fresh();
    s = reduce(s, { type: 'click', pieceId: 0, at: 2_000 }).next;
    s = reduce(s, { type: 'click', pieceId: 1, at: 3_000 }).next;
    expect(s.board.pieces.size).toBe(0);
    expect(s.status).toBe('won');
    expect(s.score).toBeGreaterThan(0);
    expect(s.breakdown).not.toBeNull();
  });

  // §12.26b — a loss yields zero points.
  it('awards no points for a loss', () => {
    let s = fresh();
    for (const at of [2_000, 3_000, 4_000]) {
      s = reduce(s, { type: 'click', pieceId: 1, at }).next;
    }
    expect(s.status).toBe('lost');
    expect(s.score).toBe(0);
    expect(s.breakdown).toBeNull();
  });

  it('ignores clicks after the game has ended', () => {
    let s = fresh();
    s = reduce(s, { type: 'click', pieceId: 0, at: 2_000 }).next;
    s = reduce(s, { type: 'click', pieceId: 1, at: 3_000 }).next;
    const after = reduce(s, { type: 'click', pieceId: 0, at: 4_000 });
    expect(after.effect).toEqual({ kind: 'none' });
    expect(after.next).toBe(s);
  });

  it('ignores a click on a nonexistent piece', () => {
    const { next, effect } = reduce(fresh(), { type: 'click', pieceId: 99, at: 2_000 });
    expect(effect).toEqual({ kind: 'none' });
    expect(next.lives).toBe(3);
  });
});

// §12.28 — tick updates the stopwatch only.
describe('reduce — tick', () => {
  it('updates elapsedMs and nothing else', () => {
    const s = fresh();
    const { next, effect } = reduce(s, { type: 'tick', at: 5_500 });
    expect(effect).toEqual({ kind: 'none' });
    expect(next.elapsedMs).toBe(4_500);
    expect(next.board).toBe(s.board);
    expect(next.lives).toBe(s.lives);
    expect(next.streak).toBe(s.streak);
  });

  it('freezes the stopwatch once the game has ended', () => {
    let s = fresh();
    s = reduce(s, { type: 'click', pieceId: 0, at: 2_000 }).next;
    s = reduce(s, { type: 'click', pieceId: 1, at: 3_000 }).next;
    const frozen = reduce(s, { type: 'tick', at: 99_000 }).next;
    expect(frozen.elapsedMs).toBe(2_000);
  });
});

describe('reduce — restart', () => {
  it('restores the initial board', () => {
    let s = fresh();
    s = reduce(s, { type: 'click', pieceId: 0, at: 2_000 }).next;
    const r = reduce(s, { type: 'restart', at: 5_000 }).next;
    expect(r.board.pieces.size).toBe(2);
    expect(r.lives).toBe(3);
    expect(r.status).toBe('playing');
    expect(r.startedAt).toBe(5_000);
    expect(r.elapsedMs).toBe(0);
    expect(r.moves).toEqual([]);
  });

  it('accepts a new board when one is supplied', () => {
    const other = withMetrics(boardOf(1, 2, [piece(0, 0, [[0, 0], [0, 1]])]));
    const r = reduce(fresh(), { type: 'restart', at: 5_000, board: other }).next;
    expect(r.board.pieces.size).toBe(1);
    expect(r.initialBoard.pieces.size).toBe(1);
  });
});

// §12.27 — determinism with respect to time, WITHOUT a clock mock.
describe('reducer determinism', () => {
  it('gives the same result for the same sequence of timestamps', () => {
    const play = () => {
      let s = fresh('timed');
      s = reduce(s, { type: 'click', pieceId: 1, at: 1_500 }).next;
      s = reduce(s, { type: 'tick', at: 2_000 }).next;
      s = reduce(s, { type: 'click', pieceId: 0, at: 2_400 }).next;
      s = reduce(s, { type: 'click', pieceId: 1, at: 3_100 }).next;
      return s;
    };
    const a = play();
    const b = play();
    expect(a.elapsedMs).toBe(b.elapsedMs);
    expect(a.score).toBe(b.score);
    expect(a.lives).toBe(b.lives);
    expect(a.moves).toEqual(b.moves);
  });

  it('records every click, including failed ones', () => {
    let s = fresh();
    s = reduce(s, { type: 'click', pieceId: 1, at: 1_500 }).next;
    s = reduce(s, { type: 'click', pieceId: 0, at: 2_000 }).next;
    expect(s.moves).toEqual([1, 0]);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npm run test:core -- session
```

Expected: FAIL — module `./session` not found.

- [ ] **Step 3: Implement the reducer**

```typescript
// src/game/session.ts
import { probeMove, removePiece } from '../core/board';
import { Board, Dir } from '../core/types';
import { computeScore, ScoreBreakdown } from './scoring';

export type GameMode = 'classic' | 'timed';
export type Status = 'playing' | 'won' | 'lost';

export const INITIAL_LIVES = 3;

export interface Session {
  board: Board;
  /** The board in its initial state — needed for restart and for replay. */
  initialBoard: Board;
  lives: number;
  status: Status;
  removed: number;
  /** Timestamp passed in from outside; the reducer never reads the clock. */
  startedAt: number;
  elapsedMs: number;
  mode: GameMode;
  streak: number;
  bestStreak: number;
  /** 0 for the entire run; computed once, on the transition to 'won'. */
  score: number;
  breakdown: ScoreBreakdown | null;
  /** Successive clicked IDs, including failed ones — the basis for verification. */
  moves: number[];
}

export type Action =
  | { type: 'click'; pieceId: number; at: number }
  | { type: 'tick'; at: number }
  | { type: 'restart'; at: number; board?: Board };

export type Effect =
  | { kind: 'exit'; pieceId: number; dir: Dir }
  | { kind: 'bounce'; pieceId: number; distance: number; blockerId: number }
  | { kind: 'none' };

const NO_EFFECT: Effect = { kind: 'none' };

export function createSession(board: Board, mode: GameMode, startedAt: number): Session {
  return {
    board,
    initialBoard: board,
    lives: INITIAL_LIVES,
    status: 'playing',
    removed: 0,
    startedAt,
    elapsedMs: 0,
    mode,
    streak: 0,
    bestStreak: 0,
    score: 0,
    breakdown: null,
    moves: [],
  };
}

export function reduce(session: Session, action: Action): { next: Session; effect: Effect } {
  switch (action.type) {
    case 'restart': {
      const board = action.board ?? session.initialBoard;
      return { next: createSession(board, session.mode, action.at), effect: NO_EFFECT };
    }

    case 'tick': {
      if (session.status !== 'playing') return { next: session, effect: NO_EFFECT };
      return {
        next: { ...session, elapsedMs: action.at - session.startedAt },
        effect: NO_EFFECT,
      };
    }

    case 'click': {
      if (session.status !== 'playing') return { next: session, effect: NO_EFFECT };
      const target = session.board.pieces.get(action.pieceId);
      if (!target) return { next: session, effect: NO_EFFECT };

      const elapsedMs = action.at - session.startedAt;
      const moves = [...session.moves, action.pieceId];
      const probe = probeMove(session.board, target);

      if (!probe.free) {
        const lives = session.lives - 1;
        return {
          next: {
            ...session,
            lives,
            status: lives <= 0 ? 'lost' : 'playing',
            streak: 0,
            elapsedMs,
            moves,
          },
          effect: {
            kind: 'bounce',
            pieceId: action.pieceId,
            distance: probe.distance,
            blockerId: probe.blockerId,
          },
        };
      }

      const board = removePiece(session.board, action.pieceId);
      const streak = session.streak + 1;
      const won = board.pieces.size === 0;
      // Points are awarded EXACTLY ONCE, on the transition to 'won'.
      const breakdown = won
        ? computeScore({
            metrics: session.initialBoard.metrics,
            width: board.width,
            height: board.height,
            livesLeft: session.lives,
            mode: session.mode,
            elapsedMs,
          })
        : null;

      return {
        next: {
          ...session,
          board,
          removed: session.removed + 1,
          streak,
          bestStreak: Math.max(session.bestStreak, streak),
          status: won ? 'won' : 'playing',
          score: breakdown ? breakdown.total : session.score,
          breakdown,
          elapsedMs,
          moves,
        },
        effect: { kind: 'exit', pieceId: action.pieceId, dir: target.dir },
      };
    }
  }
}
```

- [ ] **Step 4: Run the tests — session depends on `scoring`, so it will fail for now**

```bash
npm run test:core -- session
```

Expected: FAIL — module `./scoring` not found. This is the signal for
Task 2; don't stub `computeScore` with a fake.

- [ ] **Step 5: Commit (after completing Task 2)**

The reducer and scoring form a single red-green cycle, because the reducer
doesn't compile without scoring. You'll make the commit at the end of Task 2.

---

### Task 2: Scoring resistant to degenerate boards

**Files:**
- Create: `src/game/scoring.ts`
- Test: `src/game/scoring.spec.ts`

**Interfaces:**
- Consumes: `BoardMetrics` from Slice 1, metrics computed in Slice 3.
- Produces:
  - `interface ScoreInput { metrics: BoardMetrics; width: number; height: number; livesLeft: number; mode: GameMode; elapsedMs: number }`
  - `interface ScoreBreakdown { complexity: number; livesBonus: number; timeBonus: number; total: number }`
  - `computeScore(input: ScoreInput): ScoreBreakdown`
  - `SCORE_WEIGHTS` — weights calibrated by the benchmark

#### Why the §10 formula needs a fix

The formula from the spec, taken literally, **fails its own test 26e**.
Computed on a 100×100 board made entirely of vertical dominoes:

| Metric | Domino 100×100 | Nightmare 100×100 |
|---|---|---|
| `f0` | 0.020 | 0.059 |
| `almost1 / n` | ~0.98 | 0.07 |
| `D` | 49 | 32 |
| **score per §10** | **~764** | **~274** |

All three metrics come out **better** on the degenerate board. The reason is
conceptual: `almost1` measures the temptation to make a mistake under the
assumption that the player doesn't see the pattern. On a domino board the
pattern is obvious ("take the topmost"), so the temptation is illusory, not
real.

**Fix:** the three multipliers that measure *deceptiveness* (`f0`, `almost1`,
`D`) are weighted by a `variety ∈ [0,1]` coefficient, computed from the
entropy of the length and direction distributions. The `meanCorridorLen`
multiplier **is not weighted** — the visual effort is real regardless of
whether the board has a pattern.

```
variety   = 0.35 · dirEntropy + 0.65 · lenEntropy
```

The higher weight on length entropy is deliberate: length variety is a
stronger signal of non-triviality than direction spread alone (a board of
randomly oriented dominoes is still a board of dominoes).

After the fix: domino ≈ 125 points, Nightmare ≈ 250. Test 26e passes with a
twofold margin.

- [ ] **Step 1: Write the failing tests (§12.26a–f)**

```typescript
// src/game/scoring.spec.ts
import { BoardMetrics } from '../core/types';
import { computeScore, ScoreInput } from './scoring';

/** Metrics measured on Nightmare 100×100 (§9 + entropies from the benchmark). */
const nightmare: BoardMetrics = {
  n: 1_247,
  f0: 0.059,
  almost1: Math.round(0.07 * 1_247),
  d: 32,
  meanCorridorLen: 45,
  dirEntropy: 1.0,
  lenEntropy: 0.6,
};

/** A 100×100 board with 5,000 vertical dominoes: one direction, one length. */
const dominoes: BoardMetrics = {
  n: 5_000,
  f0: 0.02,
  almost1: 4_900,
  d: 49,
  meanCorridorLen: 50,
  dirEntropy: 0,
  lenEntropy: 0,
};

const input = (metrics: BoardMetrics, over: Partial<ScoreInput> = {}): ScoreInput => ({
  metrics,
  width: 100,
  height: 100,
  livesLeft: 3,
  mode: 'classic',
  elapsedMs: 600_000,
  ...over,
});

describe('computeScore', () => {
  it('returns a breakdown whose parts multiply into the total', () => {
    const b = computeScore(input(nightmare));
    expect(b.total).toBe(Math.round(b.complexity * b.livesBonus * b.timeBonus));
  });

  // §12.26e — ANTI-EXPLOIT TEST.
  it('scores a board made only of dominoes clearly lower than Nightmare', () => {
    const real = computeScore(input(nightmare)).total;
    const degenerate = computeScore(input(dominoes)).total;
    expect(degenerate).toBeLessThan(real * 0.7);
  });

  it('is not fooled by random directions with a single length', () => {
    const randomDirs = { ...dominoes, dirEntropy: 1, f0: 0.1, d: 30 };
    expect(computeScore(input(randomDirs)).total).toBeLessThan(
      computeScore(input(nightmare)).total,
    );
  });

  it('grows with board area, not with the number of clicks', () => {
    const small = computeScore(input(nightmare, { width: 25, height: 25 })).total;
    const big = computeScore(input(nightmare, { width: 100, height: 100 })).total;
    expect(big).toBeGreaterThan(small * 8);
  });

  // §12.26c — monotonicity with respect to lives.
  it('does not decrease with the number of lives kept', () => {
    const one = computeScore(input(nightmare, { livesLeft: 1 })).total;
    const three = computeScore(input(nightmare, { livesLeft: 3 })).total;
    expect(three).toBeGreaterThan(one);
  });

  // §12.26c — monotonicity with respect to time in the timed variant.
  it('does not decrease with faster completion in the timed variant', () => {
    const slow = computeScore(input(nightmare, { mode: 'timed', elapsedMs: 3_600_000 })).total;
    const fast = computeScore(input(nightmare, { mode: 'timed', elapsedMs: 300_000 })).total;
    expect(fast).toBeGreaterThan(slow);
  });

  // §12.26d — time bonus clamped on both sides.
  it('clamps the time bonus to the [0.6, 1.6] range', () => {
    const instant = computeScore(input(nightmare, { mode: 'timed', elapsedMs: 1 }));
    const eternal = computeScore(input(nightmare, { mode: 'timed', elapsedMs: 10 ** 9 }));
    expect(instant.timeBonus).toBeCloseTo(1.6, 6);
    expect(eternal.timeBonus).toBeCloseTo(0.6, 6);
  });

  it('ignores time in the classic variant', () => {
    const fast = computeScore(input(nightmare, { elapsedMs: 1_000 }));
    const slow = computeScore(input(nightmare, { elapsedMs: 10 ** 8 }));
    expect(fast.timeBonus).toBe(1);
    expect(fast.total).toBe(slow.total);
  });

  // §12.26f — purity.
  it('is a pure function', () => {
    const a = computeScore(input(nightmare));
    const b = computeScore(input(nightmare));
    expect(a).toEqual(b);
  });

  it('arranges presets into an increasing sequence', () => {
    // Metric values from §9 for the square format; entropies are indicative.
    const presets: readonly (readonly [string, number, BoardMetrics])[] = [
      ['easy', 25, { n: 98, f0: 0.197, almost1: 22, d: 9, meanCorridorLen: 11, dirEntropy: 1, lenEntropy: 0.55 }],
      ['medium', 50, { n: 354, f0: 0.102, almost1: 46, d: 15, meanCorridorLen: 22, dirEntropy: 1, lenEntropy: 0.58 }],
      ['hard', 75, { n: 669, f0: 0.073, almost1: 67, d: 25, meanCorridorLen: 33, dirEntropy: 1, lenEntropy: 0.6 }],
      ['nightmare', 100, { n: 1247, f0: 0.059, almost1: 87, d: 32, meanCorridorLen: 45, dirEntropy: 1, lenEntropy: 0.6 }],
    ];
    const scores = presets.map(([, size, metrics]) =>
      computeScore(input(metrics, { width: size, height: size })).total,
    );
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeGreaterThan(scores[i - 1]!);
    }
  });

  it('does not blow up on an empty board', () => {
    const empty: BoardMetrics = {
      n: 0, f0: 0, almost1: 0, d: 0, meanCorridorLen: 0, dirEntropy: 0, lenEntropy: 0,
    };
    const b = computeScore(input(empty, { width: 1, height: 2 }));
    expect(Number.isFinite(b.total)).toBe(true);
    expect(b.total).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npm run test:core -- scoring
```

Expected: FAIL — module `./scoring` not found.

- [ ] **Step 3: Implement scoring**

```typescript
// src/game/scoring.ts
import { BoardMetrics } from '../core/types';
// Type-only import: session.ts imports computeScore from scoring.ts, so a
// regular import would create a runtime module cycle.
import type { GameMode } from './session';

export interface ScoreInput {
  metrics: BoardMetrics;
  width: number;
  height: number;
  livesLeft: number;
  mode: GameMode;
  elapsedMs: number;
}

export interface ScoreBreakdown {
  /** Board complexity: the point base before bonuses. */
  complexity: number;
  /** 1.00 … 1.75 — bonus for lives kept. */
  livesBonus: number;
  /** 1 in the classic variant, 0.6 … 1.6 in the timed variant. */
  timeBonus: number;
  total: number;
}

/**
 * Formula weights. Calibrated against the benchmark so that presets form an
 * increasing sequence, and degenerate boards score clearly lower
 * (§10, §12.26e).
 */
export const SCORE_WEIGHTS = {
  /** Weight of starting tightness (1 − f0). */
  tightness: 1.0,
  /** Weight of the density of temptations to err (almost1 / n). */
  deception: 1.5,
  /** Weight of visual effort (meanCorridorLen / longer side). */
  effort: 0.5,
  /** Weight of entanglement depth (D / sqrt(W·H)). */
  entanglement: 0.5,
  /** Share of direction entropy in the variety coefficient. */
  varietyDirShare: 0.35,
  /** Seconds per piece in the reference time for the time bonus. */
  secondsPerPiece: 1.5,
  /** Upper clamps on the multipliers — no single parameter blows up the score. */
  maxTightness: 0.95,
  maxDeception: 0.35,
  maxEffort: 1,
  maxEntanglement: 1,
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Board variety coefficient.
 *
 * The multipliers that measure DECEPTIVENESS (f0, almost1, D) are weighted by
 * it, because a board with an obvious pattern deceives no one, however
 * threatening its metrics look. Without this, a 100×100 domino board scores
 * higher than Nightmare — exactly the opposite of what the anti-exploit test
 * requires (§12.26e).
 */
function variety(metrics: BoardMetrics): number {
  const dirShare = SCORE_WEIGHTS.varietyDirShare;
  return clamp(dirShare * metrics.dirEntropy + (1 - dirShare) * metrics.lenEntropy, 0, 1);
}

export function computeScore(input: ScoreInput): ScoreBreakdown {
  const { metrics, width, height, livesLeft, mode, elapsedMs } = input;
  const area = width * height;
  const longerSide = Math.max(width, height, 1);
  const v = variety(metrics);

  const tightness =
    1 + SCORE_WEIGHTS.tightness * v * clamp(1 - metrics.f0, 0, SCORE_WEIGHTS.maxTightness);
  const deception =
    1 +
    SCORE_WEIGHTS.deception *
      v *
      clamp(metrics.n > 0 ? metrics.almost1 / metrics.n : 0, 0, SCORE_WEIGHTS.maxDeception);
  // Visual effort is NOT weighted by variety — tracing a long corridor with
  // your eyes costs the same whether or not the board has a pattern.
  const effort =
    1 + SCORE_WEIGHTS.effort * clamp(metrics.meanCorridorLen / longerSide, 0, SCORE_WEIGHTS.maxEffort);
  const entanglement =
    1 +
    SCORE_WEIGHTS.entanglement *
      v *
      clamp(metrics.d / Math.sqrt(Math.max(area, 1)), 0, SCORE_WEIGHTS.maxEntanglement);

  const complexity = (area / 100) * tightness * deception * effort * entanglement;
  const livesBonus = 1 + 0.25 * Math.max(0, livesLeft);

  let timeBonus = 1;
  if (mode === 'timed') {
    const refMs = metrics.n * SCORE_WEIGHTS.secondsPerPiece * 1_000;
    timeBonus = clamp(refMs / Math.max(1, elapsedMs), 0.6, 1.6);
  }

  return {
    complexity,
    livesBonus,
    timeBonus,
    total: Math.round(complexity * livesBonus * timeBonus),
  };
}
```

- [ ] **Step 4: Run the scoring and session tests**

```bash
npm run test:core -- scoring
npm run test:core -- session
```

Expected: PASS on both. If the anti-exploit test fails, **do not raise the
test threshold** — check whether the deceptiveness multipliers are multiplied
by `variety`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add the session reducer and scoring for a completed board"
```

---

### Task 3: Replaying a run

**Files:**
- Create: `src/game/replay.ts`
- Test: `src/game/replay.spec.ts`

**Interfaces:**
- Consumes: `createLevel`/`createCustomLevel` from Slice 4, `reduce`.
- Produces:
  - `interface RunRecord { level: LevelId | 'custom'; format: BoardFormat; seed: number; params?: GeneratorParams; mode: GameMode; moves: number[]; timestamps: number[]; startedAt: number }`
  - `interface RunSubmission extends RunRecord { claimedScore: number }` — used
    on both sides of the network in Slice 10
  - `replayRun(record: RunRecord): Session` — replays a session from scratch
  - `verifyRun(record: RunRecord, claimedScore: number): boolean`

This is the foundation of server-side verification in Slice 10: the generator
is deterministic and the game is confluent, so the server replays the run
from the seed and the move sequence and recomputes the score itself.
Verification is linear.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/game/replay.spec.ts
import { probeMove } from '../core/board';
import { createLevel } from '../core/level';
import { createSession, reduce } from './session';
import { replayRun, RunRecord, verifyRun } from './replay';

/** Plays a level flawlessly and returns the run record. */
function perfectRun(seed: number): { record: RunRecord; score: number } {
  const { board } = createLevel('easy', 'square', seed);
  let session = createSession(board, 'classic', 0);
  const moves: number[] = [];
  const timestamps: number[] = [];
  let at = 0;

  while (session.status === 'playing') {
    const free = [...session.board.pieces.values()].find((p) => probeMove(session.board, p).free);
    if (!free) throw new Error('confluence broken — no free piece');
    at += 1_000;
    moves.push(free.id);
    timestamps.push(at);
    session = reduce(session, { type: 'click', pieceId: free.id, at }).next;
  }

  return {
    record: {
      level: 'easy', format: 'square', seed, mode: 'classic',
      moves, timestamps, startedAt: 0,
    },
    score: session.score,
  };
}

describe('replayRun', () => {
  it('replays a won run down to the point', () => {
    const { record, score } = perfectRun(11);
    const replayed = replayRun(record);
    expect(replayed.status).toBe('won');
    expect(replayed.score).toBe(score);
    expect(replayed.lives).toBe(3);
  }, 60_000);

  it('replays a life loss', () => {
    const { record } = perfectRun(12);
    // Insert a bad move: click the last piece first.
    const bad = record.moves[record.moves.length - 1]!;
    const tampered: RunRecord = {
      ...record,
      moves: [bad, ...record.moves],
      timestamps: [500, ...record.timestamps],
    };
    const replayed = replayRun(tampered);
    expect(replayed.lives).toBeLessThan(3);
  }, 60_000);
});

describe('verifyRun', () => {
  it('confirms an honest score', () => {
    const { record, score } = perfectRun(13);
    expect(verifyRun(record, score)).toBe(true);
  }, 60_000);

  it('rejects an inflated score', () => {
    const { record, score } = perfectRun(14);
    expect(verifyRun(record, score + 1)).toBe(false);
    expect(verifyRun(record, score * 10)).toBe(false);
  }, 60_000);

  it('rejects a record with moves that do not finish the board', () => {
    const { record, score } = perfectRun(15);
    const truncated = { ...record, moves: record.moves.slice(0, 3) };
    expect(verifyRun(truncated, score)).toBe(false);
  }, 60_000);

  it('rejects a record with a swapped-out seed', () => {
    const { record, score } = perfectRun(16);
    expect(verifyRun({ ...record, seed: record.seed + 1 }, score)).toBe(false);
  }, 60_000);
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npm run test:core -- replay
```

Expected: FAIL — module `./replay` not found.

- [ ] **Step 3: Implement replay**

```typescript
// src/game/replay.ts
import { createCustomLevel, createLevel } from '../core/level';
import { BoardFormat, LevelId } from '../core/presets';
import { Board, GeneratorParams } from '../core/types';
import { createSession, GameMode, reduce, Session } from './session';

export interface RunRecord {
  level: LevelId | 'custom';
  format: BoardFormat;
  seed: number;
  /** Populated only for configurator levels. */
  params?: GeneratorParams;
  mode: GameMode;
  moves: number[];
  /** Timestamps of successive moves; same length as `moves`. */
  timestamps: number[];
  startedAt: number;
}

/**
 * The run record sent to the server together with the claimed score.
 *
 * The type lives HERE, not in the transport layer, because both sides use it:
 * the client (Slice 10, `run-submitter.ts`) and the cloud function that
 * replays the run. Two copies of this interface would drift apart at the
 * first change.
 */
export interface RunSubmission extends RunRecord {
  claimedScore: number;
}

function boardFor(record: RunRecord): Board {
  if (record.level === 'custom') {
    if (!record.params) throw new Error('Configurator level record without parameters.');
    return createCustomLevel({ ...record.params, seed: record.seed }).board;
  }
  return createLevel(record.level, record.format, record.seed).board;
}

/**
 * Replays a run from a seed and a move sequence.
 *
 * Possible because the generator is deterministic and the reducer is pure:
 * the same inputs give the same final state, regardless of machine or clock.
 */
export function replayRun(record: RunRecord): Session {
  let session = createSession(boardFor(record), record.mode, record.startedAt);
  for (let i = 0; i < record.moves.length; i++) {
    const at = record.timestamps[i] ?? record.startedAt;
    session = reduce(session, { type: 'click', pieceId: record.moves[i]!, at }).next;
    if (session.status !== 'playing') break;
  }
  return session;
}

/**
 * Whether the reported score matches the replayed run.
 *
 * Verification is linear in the number of moves, so the server (Slice 10)
 * can run it for every record at negligible cost.
 */
export function verifyRun(record: RunRecord, claimedScore: number): boolean {
  if (record.moves.length !== record.timestamps.length) return false;
  const session = replayRun(record);
  return session.status === 'won' && session.score === claimedScore;
}
```

- [ ] **Step 4: Run the tests — they should pass**

```bash
npm run test:core -- replay
```

Expected: PASS (6 tests).

- [ ] **Step 5: Run everything and check lint**

```bash
npm run test:core && npm run lint
```

Expected: everything green. Lint guards against `game/` reaching for
`Date.now()` — if it did, test §12.27 would stop meaning anything.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add run replay and verification"
```

---

## Slice acceptance criteria

- The game is **playable from a test**: `perfectRun` clears the Easy board
  from start to finish and gets points.
- Tests §12.26–28 are green, including the anti-exploit 26e.
- `score` is 0 throughout the run and changes exactly once.
- A loss yields zero points.
- The reducer is deterministic without a clock mock.
- `verifyRun` rejects an inflated score, a truncated record, and a
  swapped-out seed.
