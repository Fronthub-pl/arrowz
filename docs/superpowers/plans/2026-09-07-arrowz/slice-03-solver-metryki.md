# Slice 3 — Solver i metryki trudności

> **Dla wykonawców agentowych:** WYMAGANA PODUMIEJĘTNOŚĆ: użyj
> `superpowers:subagent-driven-development` (zalecane) albo
> `superpowers:executing-plans`. Kroki mają checkboxy (`- [ ]`).

**Cel:** Niezależnie zweryfikować **każdą** wygenerowaną planszę i policzyć
metryki, które podróżują z planszą do rozgrywki i punktacji.

**Architektura:** Korytarz nie zależy od stanu planszy (Slice 1), więc relacja
„F blokuje E" jest **statycznym grafem skierowanym**, policzalnym raz. Stąd:
**plansza jest rozwiązywalna ⟺ graf blokowania jest acykliczny**, a solver to
algorytm Kahna w `O(N+E)`. Solver jest **całkowicie odseparowany od
generatora** — to jest właściwy podział ról: konstrukcja ma trafiać często,
weryfikator ma być pewny.

**Stack:** TypeScript strict, Vitest w Node.

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md` (§8, §9,
§12.14–19)

**Mapa:** `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`

## Global Constraints

Obowiązują ograniczenia z mapy wdrożenia. Krytyczne dla tego slice'a:

- Solver używa **tej samej** funkcji `headRay`/`probeMove` co silnik gry.
  Druga implementacja korytarza to ryzyko nr 1 z §14 specyfikacji.
- `almost1` w `BoardMetrics` to **liczba** elementów, nie udział. Udział liczy
  się jako `almost1 / n`.
- Metryka `T_k` **nie wraca** — przy pełnym zapełnieniu zawsze wynosi zero,
  bo tuż przed elementem zawsze ktoś stoi (§9). Zastępuje ją `almost1`.

## File Structure

| Plik | Odpowiedzialność |
|---|---|
| `src/core/solver.ts` | graf blokowania, Kahn, wykrywanie cykli |
| `src/core/metrics.ts` | `f0`, `almost1`, `D`, `meanCorridorLen`, entropie; `withMetrics` |
| `src/core/solver.spec.ts` | testy solvera i cykli (§12.19) |
| `src/core/metrics.spec.ts` | testy metryk |
| `src/core/properties.spec.ts` | testy własnościowe na setkach ziaren (§12.14–18) |

---

### Task 1: Graf blokowania i solver

**Files:**
- Create: `src/core/solver.ts`
- Test: `src/core/solver.spec.ts`

**Interfaces:**
- Consumes: `Board`, `headRay`, `pieceAt`, `probeMove`, `removePiece` ze Slice'a 1.
- Produces:
  - `interface BlockingGraph { blockedBy: Map<number, Set<number>>; blocks: Map<number, Set<number>> }`
  - `buildBlockingGraph(board: Board): BlockingGraph`
  - `interface SolveResult { solvable: boolean; order: number[]; depth: number; cycleMembers: number[] }`
  - `solve(board: Board, prebuilt?: BlockingGraph): SolveResult`

- [ ] **Krok 1: Napisz failujące testy (§12.19)**

```typescript
// src/core/solver.spec.ts
import { boardOf, piece } from './testing/fixtures';
import { buildBlockingGraph, solve } from './solver';

describe('buildBlockingGraph', () => {
  it('łączy element z tym, co stoi w jego korytarzu', () => {
    const front = piece(0, 0, [[0, 0], [0, 1]]);
    const back = piece(1, 0, [[0, 2], [0, 3]]);
    const b = boardOf(1, 4, [front, back]);
    const g = buildBlockingGraph(b);
    expect([...g.blockedBy.get(1)!]).toEqual([0]);
    expect(g.blockedBy.get(0)!.size).toBe(0);
    expect([...g.blocks.get(0)!]).toEqual([1]);
  });

  it('nie tworzy krawędzi do samego siebie', () => {
    // Wąż pokrywający całą planszę 2×3: grot w (0,1) patrzy w górę, a komórka
    // (0,0) na jego promieniu należy do niego samego.
    const snake = piece(0, 0, [[0, 1], [0, 2], [1, 2], [1, 1], [1, 0], [0, 0]]);
    const b = boardOf(2, 3, [snake]);
    const g = buildBlockingGraph(b);
    expect(g.blockedBy.get(0)!.has(0)).toBe(false);
    expect(g.blockedBy.get(0)!.size).toBe(0);
  });

  it('liczy blokera raz, choćby zajmował kilka komórek korytarza', () => {
    const runner = piece(0, 0, [[0, 3], [0, 4]]);
    const blocker = piece(1, 3, [[0, 0], [1, 0], [1, 1], [0, 1], [0, 2]]);
    const filler = piece(2, 2, [[1, 4], [1, 3], [1, 2]]);
    const b = boardOf(2, 5, [runner, blocker, filler]);
    const g = buildBlockingGraph(b);
    expect([...g.blockedBy.get(0)!]).toEqual([1]);
  });
});

describe('solve', () => {
  it('oddaje poprawną kolejność dla planszy rozwiązywalnej', () => {
    const b = boardOf(1, 4, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[0, 2], [0, 3]]),
    ]);
    const r = solve(b);
    expect(r.solvable).toBe(true);
    expect(r.order).toEqual([0, 1]);
    expect(r.cycleMembers).toEqual([]);
  });

  it('liczy głębokość grafu blokowania', () => {
    // Trzy elementy jeden za drugim w kolumnie: łańcuch 0 ← 1 ← 2.
    const b = boardOf(1, 6, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[0, 2], [0, 3]]),
      piece(2, 0, [[0, 4], [0, 5]]),
    ]);
    const r = solve(b);
    expect(r.solvable).toBe(true);
    expect(r.depth).toBe(2);
  });

  // §12.19 — cykl dwuelementowy: dwa elementy skierowane na siebie.
  it('wykrywa cykl dwuelementowy i wskazuje jego uczestników', () => {
    const up = piece(0, 0, [[0, 2], [0, 3]]);   // patrzy w górę, nad nim element 1
    const down = piece(1, 2, [[0, 1], [0, 0]]); // patrzy w dół, pod nim element 0
    const b = boardOf(1, 4, [up, down]);
    const r = solve(b);
    expect(r.solvable).toBe(false);
    expect(r.cycleMembers.sort()).toEqual([0, 1]);
  });

  // §12.19 — cykl dłuższy niż dwuelementowy.
  it('wykrywa cykl obejmujący cztery elementy', () => {
    // Cztery domina na obwodzie planszy 3×3, każde skierowane na następne:
    // 0 → 1 → 2 → 3 → 0. Środek (1,1) zostaje pusty i niczego nie blokuje.
    const a = piece(0, 1, [[1, 0], [0, 0]]); // grot w prawo, celuje w (2,0)
    const b2 = piece(1, 2, [[2, 1], [2, 0]]); // grot w dół, celuje w (2,2)
    const c = piece(2, 3, [[1, 2], [2, 2]]); // grot w lewo, celuje w (0,2)
    const d = piece(3, 0, [[0, 1], [0, 2]]); // grot w górę, celuje w (0,0)
    const board = boardOf(3, 3, [a, b2, c, d]);

    const r = solve(board);
    expect(r.solvable).toBe(false);
    expect(r.order).toEqual([]);
    expect(r.cycleMembers).toEqual([0, 1, 2, 3]);
  });

  it('zdejmuje wszystkie elementy planszy acyklicznej', () => {
    const b = boardOf(2, 2, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[1, 0], [1, 1]]),
    ]);
    const r = solve(b);
    expect(r.order.length).toBe(2);
  });
});
```

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npm run test:core -- solver
```

Oczekiwane: FAIL — brak modułu `./solver`.

- [ ] **Krok 3: Zaimplementuj solver**

```typescript
// src/core/solver.ts
import { headRay, pieceAt } from './board';
import { Board, EMPTY } from './types';

export interface BlockingGraph {
  /** id → zbiór elementów, które go blokują. */
  blockedBy: Map<number, Set<number>>;
  /** id → zbiór elementów, które on blokuje. */
  blocks: Map<number, Set<number>>;
}

export interface SolveResult {
  solvable: boolean;
  /** Kolejność zdejmowania; przy planszy nierozwiązywalnej — prefiks. */
  order: number[];
  /** Głębokość grafu: najdłuższa ścieżka. Metryka `D` z §9. */
  depth: number;
  /** Elementy leżące w cyklach — diagnostyka. */
  cycleMembers: number[];
}

/**
 * Buduje statyczny graf blokowania.
 *
 * Korytarz nie zależy od stanu planszy (§2), więc relacja „F blokuje E" jest
 * stała i policzalna raz. Przy jeździe po torze korytarz to jeden promień,
 * więc graf jest rzadki.
 *
 * Koszt: O(N · max(W,H)).
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
 * Sortowanie topologiczne (Kahn).
 *
 * Plansza jest rozwiązywalna dokładnie wtedy, gdy uda się zdjąć wszystkie N
 * elementów — czyli gdy graf jest acykliczny (§8). To, czego nie zdjęto, leży
 * w cyklach.
 */
export function solve(board: Board, prebuilt?: BlockingGraph): SolveResult {
  // Metryki (Slice 3, Zadanie 2) budują graf i tak, więc pozwalamy go podać —
  // inaczej liczylibyśmy go dwa razy przy każdej generowanej planszy.
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
  // Wskaźnik zamiast shift(): shift() na tablicy jest O(n), a przy 4700
  // elementach Extreme robi się z tego kwadrat.
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

- [ ] **Krok 4: Uruchom testy — mają przejść**

```bash
npm run test:core -- solver
```

Oczekiwane: PASS (8 testów).

- [ ] **Krok 5: Commit**

```bash
git add -A
git commit -m "Dodaj solver oparty na grafie blokowania"
```

---

### Task 2: Metryki trudności

**Files:**
- Create: `src/core/metrics.ts`
- Test: `src/core/metrics.spec.ts`

**Interfaces:**
- Consumes: `buildBlockingGraph`, `solve`, `headRay`.
- Produces:
  - `computeMetrics(board: Board): BoardMetrics`
  - `withMetrics(board: Board): Board` — zwraca kopię z policzonymi metrykami
  - `estimateMinFree(board: Board, rng: Rng, playouts: number): number` —
    metryka **diagnostyczna**, poza progami akceptacji (§9)

`dirEntropy` i `lenEntropy` to **uzupełnienie specyfikacji** wprowadzone w tym
planie: bez nich punktacja z §10 przegrywa własny test antyeksploatacyjny
26e (szczegóły w mapie wdrożenia i w Slice 5).

- [ ] **Krok 1: Napisz failujące testy**

```typescript
// src/core/metrics.spec.ts
import { mulberry32 } from './rng';
import { boardOf, piece } from './testing/fixtures';
import { computeMetrics, estimateMinFree, withMetrics } from './metrics';

describe('computeMetrics', () => {
  it('liczy udział elementów wolnych na starcie', () => {
    const b = boardOf(1, 4, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[0, 2], [0, 3]]),
    ]);
    const m = computeMetrics(b);
    expect(m.n).toBe(2);
    expect(m.f0).toBeCloseTo(0.5, 6);
  });

  it('liczy elementy zablokowane przez dokładnie jeden obcy element', () => {
    const b = boardOf(1, 6, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[0, 2], [0, 3]]),
      piece(2, 0, [[0, 4], [0, 5]]),
    ]);
    const m = computeMetrics(b);
    // Element 1 blokowany przez 0; element 2 blokowany przez 0 i 1.
    expect(m.almost1).toBe(1);
  });

  it('liczy głębokość grafu blokowania', () => {
    const b = boardOf(1, 6, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[0, 2], [0, 3]]),
      piece(2, 0, [[0, 4], [0, 5]]),
    ]);
    expect(computeMetrics(b).d).toBe(2);
  });

  it('liczy średnią długość korytarza', () => {
    const b = boardOf(1, 4, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[0, 2], [0, 3]]),
    ]);
    // Korytarz elementu 0: pusty (głowa przy krawędzi) → 0 komórek.
    // Korytarz elementu 1: (0,1) i (0,0) → 2 komórki.
    expect(computeMetrics(b).meanCorridorLen).toBeCloseTo(1, 6);
  });

  describe('entropia kierunków', () => {
    it('wynosi zero, gdy wszystkie elementy patrzą w tę samą stronę', () => {
      const b = boardOf(2, 2, [
        piece(0, 0, [[0, 0], [0, 1]]),
        piece(1, 0, [[1, 0], [1, 1]]),
      ]);
      expect(computeMetrics(b).dirEntropy).toBeCloseTo(0, 6);
    });

    it('wynosi jeden przy równym rozkładzie czterech kierunków', () => {
      // Dwa domina pionowe (grot w górę i w dół) oraz dwa poziome
      // (grot w prawo i w lewo) — plansza 4×2 pokryta w całości.
      const b = boardOf(4, 2, [
        piece(0, 0, [[0, 0], [0, 1]]),
        piece(1, 2, [[1, 1], [1, 0]]),
        piece(2, 1, [[3, 0], [2, 0]]),
        piece(3, 3, [[2, 1], [3, 1]]),
      ]);
      expect(computeMetrics(b).dirEntropy).toBeCloseTo(1, 6);
    });
  });

  describe('entropia długości', () => {
    it('wynosi zero, gdy wszystkie elementy są tej samej klasy długości', () => {
      const b = boardOf(2, 2, [
        piece(0, 0, [[0, 0], [0, 1]]),
        piece(1, 0, [[1, 0], [1, 1]]),
      ]);
      expect(computeMetrics(b).lenEntropy).toBeCloseTo(0, 6);
    });

    it('rośnie, gdy pojawiają się różne klasy długości', () => {
      const short = piece(0, 0, [[0, 0], [0, 1]]);
      const long = piece(1, 0, [
        [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7],
      ]);
      const filler = piece(2, 0, [[0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7]]);
      const b = boardOf(2, 8, [short, long, filler]);
      // Dwa koszyki obsadzone z trzech możliwych: entropia znormalizowana
      // przez log(4) daje ~0.46, więc próg musi być poniżej tej wartości.
      expect(computeMetrics(b).lenEntropy).toBeGreaterThan(0.4);
    });
  });
});

describe('withMetrics', () => {
  it('dokleja metryki bez zmiany planszy', () => {
    const b = boardOf(1, 4, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[0, 2], [0, 3]]),
    ]);
    const withM = withMetrics(b);
    expect(withM.metrics.n).toBe(2);
    expect(withM.pieces).toBe(b.pieces);
    expect(b.metrics.n).toBe(0); // oryginał nietknięty
  });
});

describe('estimateMinFree', () => {
  it('nigdy nie schodzi do zera na planszy rozwiązywalnej', () => {
    const b = boardOf(1, 6, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[0, 2], [0, 3]]),
      piece(2, 0, [[0, 4], [0, 5]]),
    ]);
    expect(estimateMinFree(b, mulberry32(1), 20)).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npm run test:core -- metrics
```

Oczekiwane: FAIL — brak modułu `./metrics`.

- [ ] **Krok 3: Zaimplementuj metryki**

```typescript
// src/core/metrics.ts
import { headRay, probeMove, removePiece } from './board';
import { Rng } from './rng';
import { buildBlockingGraph, solve } from './solver';
import { Board, BoardMetrics } from './types';

/** Entropia Shannona rozkładu, znormalizowana do [0,1] przez log liczby klas. */
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
 * Metryki trudności liczone na gotowej planszy (§9).
 *
 * `almost1` jest najważniejsza: mierzy liczbę okazji do błędnego kliknięcia,
 * czyli to, co faktycznie odbiera życia.
 *
 * `dirEntropy` i `lenEntropy` to uzupełnienie planu wdrożenia — ważą pozorną
 * trudność w punktacji. Plansza jednorodna (same domina w jednym kierunku) ma
 * świetne `f0` i `almost1`, choć jest banalna; entropia to wychwytuje.
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

/** Kopia planszy z policzonymi metrykami. Oryginał zostaje nietknięty. */
export function withMetrics(board: Board): Board {
  return { ...board, metrics: computeMetrics(board) };
}

/**
 * Minimalna liczba wolnych elementów w trakcie losowych playoutów zachłannych.
 *
 * Metryka DIAGNOSTYCZNA (§9): raportowana w benchmarku, ale niewchodząca do
 * progów akceptacji ani do punktacji, bo jej kalibracja wymaga playtestu.
 */
export function estimateMinFree(board: Board, rng: Rng, playouts: number): number {
  let worst = Number.POSITIVE_INFINITY;
  for (let run = 0; run < playouts; run++) {
    let current = board;
    while (current.pieces.size > 0) {
      const free = [...current.pieces.values()].filter((p) => probeMove(current, p).free);
      if (free.length === 0) return 0; // złamana konfluencja — sygnał błędu
      worst = Math.min(worst, free.length);
      current = removePiece(current, free[Math.floor(rng() * free.length)]!.id);
    }
  }
  return Number.isFinite(worst) ? worst : 0;
}
```

- [ ] **Krok 4: Uruchom testy — mają przejść**

```bash
npm run test:core -- metrics
```

Oczekiwane: PASS (10 testów).

- [ ] **Krok 5: Commit**

```bash
git add -A
git commit -m "Dodaj metryki trudności planszy"
```

---

### Task 3: Testy własnościowe i test różnicowy

**Files:**
- Test: `src/core/properties.spec.ts`

**Interfaces:**
- Consumes: wszystko z Slice'ów 1–3.
- Produces: nic nowego w kodzie produkcyjnym — to jest siatka bezpieczeństwa
  całego projektu.

Test różnicowy (§12.18) jest tu najważniejszy: sprawdza, że **warunek
generatora** (skyline: pierwsza nieprzypisana komórka linii) i **warunek
silnika gry** (`probeMove`) zgadzają się **co do bitu**. Rozjazd między nimi
to dokładnie ten błąd, który produkuje nierozwiązywalne plansze.

- [ ] **Krok 1: Napisz testy własnościowe**

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

// §12.14 — każda wygenerowana plansza przechodzi solver.
describe('każda plansza jest rozwiązywalna', () => {
  it('na 200 ziarnach i czterech rozmiarach', () => {
    for (const [w, h] of SIZES) {
      for (let seed = 1; seed <= 50; seed++) {
        const { board, complete } = generate(defaultParams(w, h, seed));
        expect(complete).toBe(true);
        const r = solve(board);
        if (!r.solvable) {
          throw new Error(
            `Plansza ${w}x${h} ziarno ${seed} nierozwiązywalna; cykl: ${r.cycleMembers.join(',')}`,
          );
        }
      }
    }
  }, 120_000);
});

// §12.15 — kolejność wycinania JEST rozwiązaniem, bez odwracania.
describe('kolejność wycinania jest poprawnym rozwiązaniem', () => {
  it('każdy ruch w kolejności identyfikatorów jest legalny', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { board } = generate(defaultParams(20, 20, seed));
      let current = board;
      for (let id = 0; id < board.pieces.size; id++) {
        const p = current.pieces.get(id);
        expect(p).toBeDefined();
        const probe = probeMove(current, p as Piece);
        if (!probe.free) {
          throw new Error(`Ziarno ${seed}: element ${id} zablokowany przez ${probe.blockerId}`);
        }
        current = removePiece(current, id);
      }
      expect(current.pieces.size).toBe(0);
    }
  }, 60_000);
});

// §12.16 — konfluencja: zachłanne playouty nigdy nie utykają.
describe('konfluencja', () => {
  it('losowe usuwanie wolnych elementów zawsze kończy planszę', () => {
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

// §12.17 — usunięcie dowolnego elementu zostawia planszę rozwiązywalną.
describe('monotoniczność rozwiązywalności', () => {
  it('zdjęcie dowolnego elementu nie psuje planszy', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { board } = generate(defaultParams(15, 15, seed));
      for (const id of board.pieces.keys()) {
        expect(solve(removePiece(board, id)).solvable).toBe(true);
      }
    }
  }, 120_000);
});

/**
 * §12.18 — TEST RÓŻNICOWY.
 *
 * Generator pyta: „czy ta komórka jest pierwszą nieprzypisaną na swojej linii?"
 * (skyline, O(1)). Silnik gry pyta: „czy promień z głowy jest wolny?"
 * (probeMove, przebieg po promieniu). To muszą być te same pytania.
 *
 * Zamieniamy role: komórki NIEPRZYPISANE w generatorze odpowiadają komórkom
 * ZAJĘTYM na planszy gry, bo to one blokują wycięcie.
 */
describe('test różnicowy generatora i silnika', () => {
  it('warunek skyline zgadza się z probeMove co do bitu', () => {
    const rng = mulberry32(31337);
    const w = 12;
    const h = 12;

    for (let trial = 0; trial < 300; trial++) {
      // Losowy stan wycinania: część komórek przypisana, część nie.
      const owner = new Int32Array(w * h).fill(EMPTY);
      const fill = 0.2 + rng() * 0.6;
      for (let i = 0; i < w * h; i++) if (rng() < fill) owner[i] = 1;

      const skyline = new Skyline(w, h);
      skyline.rebuild(owner);

      // Plansza gry: każda NIEPRZYPISANA komórka to osobny bloker.
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

          // Ta sama komórka jako głowa elementu na planszy gry; z blokerów
          // usuwamy tę jedną, bo to ona jest kandydatem, nie przeszkodą.
          const probe = createBoard(w, h, [
            { id: 0, dir, cells: [head] },
            ...blockers.filter((b) => !(b.cells[0]!.x === head.x && b.cells[0]!.y === head.y)),
          ]);
          const free = probeMove(probe, probe.pieces.get(0)!).free;

          // Kandydat ze skyline'u to zawsze pierwsza nieprzypisana komórka
          // linii, więc jej promień MUSI być wolny od nieprzypisanych.
          expect(free).toBe(true);
        }
      }
    }
  }, 120_000);

  it('komórka spoza skyline nigdy nie ma czystego promienia', () => {
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
          // Bierzemy komórkę o jeden krok GŁĘBIEJ niż kandydat — jeśli jest
          // nieprzypisana, jej promień musi natrafić na kandydata.
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

describe('metryki na wygenerowanych planszach', () => {
  it('mieszczą się w sensownych zakresach', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { board } = generate(defaultParams(25, 25, seed));
      const m = computeMetrics(board);
      expect(validateBoard(board)).toEqual([]);
      expect(m.n).toBe(board.pieces.size);
      expect(m.f0).toBeGreaterThan(0);
      expect(m.f0).toBeLessThan(1);
      expect(m.almost1).toBeLessThanOrEqual(m.n);
      expect(m.d).toBeGreaterThan(0);
      expect(m.dirEntropy).toBeGreaterThan(0.8); // cztery kierunki są używane
      expect(m.meanCorridorLen).toBeGreaterThan(0);
    }
  }, 60_000);
});
```

- [ ] **Krok 2: Uruchom testy**

```bash
npm run test:core -- properties
```

Oczekiwane: PASS. Jeśli test różnicowy zawodzi, **nie zmieniaj testu** —
rozjechały się dwie definicje korytarza i to jest dokładnie ta awaria,
przed którą ten test stoi (ryzyko nr 1 z §14).

- [ ] **Krok 3: Zmierz łączny czas**

```bash
time npm run test:core
```

Oczekiwane: całość poniżej ~3 minut. Jeśli dłużej, zmniejsz liczbę ziaren
w najdroższym teście (`monotoniczność`), a nie w teście różnicowym.

- [ ] **Krok 4: Commit**

```bash
git add -A
git commit -m "Dodaj testy własnościowe i test różnicowy generatora"
```

---

## Kryteria odbioru slice'a

- `npm run test:core` przechodzi w całości.
- Solver wykrywa ręcznie skonstruowane cykle dwu- i trójelementowe oraz
  wskazuje ich uczestników.
- 200 wygenerowanych plansz (4 rozmiary × 50 ziaren) przechodzi solver.
- Kolejność wycinania jest poprawnym rozwiązaniem bez odwracania.
- Test różnicowy jest zielony — generator i silnik dzielą jedną definicję
  korytarza.
- `BoardMetrics` niesie `dirEntropy` i `lenEntropy`; Slice 5 na nich polega.
