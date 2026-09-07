# Slice 1 — Rdzeń geometrii: korytarz i legalność ruchu

> **Dla wykonawców agentowych:** WYMAGANA PODUMIEJĘTNOŚĆ: użyj
> `superpowers:subagent-driven-development` (zalecane) albo
> `superpowers:executing-plans`. Kroki mają checkboxy (`- [ ]`).

**Cel:** Zaimplementować model danych planszy oraz `probeMove` — jedyną
funkcję rozstrzygającą, czy ruch jest legalny — z kompletem testów z §12
specyfikacji.

**Architektura:** Cała gra opiera się na jednej obserwacji: **korytarz elementu
to pojedynczy promień z komórki głowy do krawędzi, w kierunku grotu**. Kształt
ciała nie ma na niego wpływu, bo element jedzie po własnym torze. `probeMove`
to jeden przebieg po tym promieniu, `O(max(W,H))`. Generator (Slice 2) i solver
(Slice 3) będą korzystać z **tej samej** definicji korytarza — dwie osobne
implementacje mogłyby się rozjechać i produkować nierozwiązywalne plansze
(ryzyko nr 1 z §14).

**Stack:** TypeScript strict, Vitest w Node (`npm run test:core`).

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md` (§2, §5, §6,
§12.1–8, §12.9a, §12.24–25)

**Mapa:** `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`

## Global Constraints

Obowiązują ograniczenia z mapy wdrożenia. Krytyczne dla tego slice'a:

- `cells[0]` to komórka z **grotem**; ciało leży **za** grotem. Dla grotu
  w `(5,3)` i `dir = 1` (prawo) kolejna komórka ścieżki to `(4,3)`, nie `(6,3)`.
  To najczęstszy błąd znaku w tym module (§5 specyfikacji).
- `occupancy` to `Int32Array`, `-1` = komórka pusta.
- **Zakaz sprawdzania „czy przed całym kształtem jest wolne".** To powrót do
  porzuconej reguły sztywnej translacji. Testy 1 i 3 istnieją wyłącznie po to,
  żeby to wychwycić.

## File Structure

| Plik | Odpowiedzialność |
|---|---|
| `src/core/types.ts` | `Dir`, `Coord`, `Piece`, `Board`, `BoardMetrics`, `GeneratorParams`, `GenerationReport`, wektory kierunków |
| `src/core/geometry.ts` | arytmetyka siatki: indeks komórki, test wnętrza, obrót kierunku |
| `src/core/board.ts` | `createBoard`, `pieceAt`, `headRay`, `probeMove`, `removePiece`, `validateBoard` |
| `src/core/testing/fixtures.ts` | budowanie plansz w testach (`piece`, `boardOf`) |
| `src/core/geometry.spec.ts` | testy arytmetyki i znaku kierunku (§12.8) |
| `src/core/board.spec.ts` | testy legalności ruchu (§12.1–8, 24, 25) |

---

### Task 1: Model danych i arytmetyka siatki

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/geometry.ts`
- Test: `src/core/geometry.spec.ts`

**Interfaces:**
- Produces (używane przez **wszystkie** kolejne slice'y):
  - `type Dir = 0 | 1 | 2 | 3`
  - `interface Coord { x: number; y: number }`
  - `interface Piece { id: number; cells: Coord[]; dir: Dir }`
  - `interface Board { width: number; height: number; occupancy: Int32Array; pieces: Map<number, Piece>; metrics: BoardMetrics }`
  - `const DIR_VECTORS: readonly Coord[]`, `const EMPTY = -1`
  - `cellIndex(width, x, y): number`, `isInside(width, height, x, y): boolean`,
    `oppositeDir(dir): Dir`, `stepFrom(c, dir): Coord`

- [ ] **Krok 1: Napisz failujący test arytmetyki i znaku kierunku**

Ostatni przypadek to **test 8 z §12** — pilnuje, żeby ciało leżało za grotem.

```typescript
// src/core/geometry.spec.ts
import { DIR_VECTORS } from './types';
import { cellIndex, isInside, oppositeDir, stepFrom } from './geometry';

describe('arytmetyka siatki', () => {
  it('liczy indeks komórki wierszami', () => {
    expect(cellIndex(10, 0, 0)).toBe(0);
    expect(cellIndex(10, 3, 0)).toBe(3);
    expect(cellIndex(10, 0, 1)).toBe(10);
    expect(cellIndex(10, 4, 2)).toBe(24);
  });

  it('rozpoznaje komórki poza planszą', () => {
    expect(isInside(5, 4, 0, 0)).toBe(true);
    expect(isInside(5, 4, 4, 3)).toBe(true);
    expect(isInside(5, 4, 5, 3)).toBe(false);
    expect(isInside(5, 4, 0, -1)).toBe(false);
    expect(isInside(5, 4, -1, 0)).toBe(false);
    expect(isInside(5, 4, 4, 4)).toBe(false);
  });

  it('przypisuje kierunkom właściwe wektory', () => {
    expect(DIR_VECTORS[0]).toEqual({ x: 0, y: -1 }); // góra
    expect(DIR_VECTORS[1]).toEqual({ x: 1, y: 0 });  // prawo
    expect(DIR_VECTORS[2]).toEqual({ x: 0, y: 1 });  // dół
    expect(DIR_VECTORS[3]).toEqual({ x: -1, y: 0 }); // lewo
  });

  it('odwraca kierunek', () => {
    expect(oppositeDir(0)).toBe(2);
    expect(oppositeDir(1)).toBe(3);
    expect(oppositeDir(2)).toBe(0);
    expect(oppositeDir(3)).toBe(1);
  });

  // §12.8 — znak kierunku. Ciało leży ZA grotem.
  it('ustawia ciało za grotem, nie przed nim', () => {
    const head = { x: 5, y: 3 };
    const dir = 1; // prawo
    // Pierwsza komórka ciała to krok w kierunku PRZECIWNYM do grotu.
    expect(stepFrom(head, oppositeDir(dir))).toEqual({ x: 4, y: 3 });
    // Pierwsza komórka korytarza to krok w kierunku grotu.
    expect(stepFrom(head, dir)).toEqual({ x: 6, y: 3 });
  });
});
```

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npm run test:core -- geometry
```

Oczekiwane: FAIL — brak modułów `./types` i `./geometry`.

- [ ] **Krok 3: Zdefiniuj typy**

```typescript
// src/core/types.ts

/** 0 = góra, 1 = prawo, 2 = dół, 3 = lewo. */
export type Dir = 0 | 1 | 2 | 3;

export interface Coord {
  x: number;
  y: number;
}

/** Wektory przesunięcia dla kolejnych kierunków. Kolejność musi zgadzać się z `Dir`. */
export const DIR_VECTORS: readonly Coord[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export const ALL_DIRS: readonly Dir[] = [0, 1, 2, 3];

/** Wartość w `occupancy` oznaczająca komórkę nienależącą do żadnego elementu. */
export const EMPTY = -1;

/**
 * Element planszy: samounikająca się polilinia po komórkach siatki.
 * `cells[0]` to komórka z grotem, kolejne komórki idą w głąb ciała.
 * `dir` to kierunek z `cells[1]` do `cells[0]` — czyli kierunek wyjazdu.
 */
export interface Piece {
  id: number;
  cells: Coord[];
  dir: Dir;
}

/**
 * Metryki trudności liczone na wygenerowanej planszy (§9).
 * Podróżują razem z planszą, bo punktacja (§10) liczy się ze złożoności
 * konkretnej planszy, a nie z etykiety poziomu — konfigurator czyni tę
 * etykietę niewiarygodną.
 */
export interface BoardMetrics {
  /** Liczba elementów na planszy. */
  n: number;
  /** Udział elementów wolnych na starcie: ujścia grafu blokowania. */
  f0: number;
  /** LICZBA (nie udział) elementów blokowanych przez dokładnie jeden obcy element. */
  almost1: number;
  /** Głębokość grafu blokowania — najdłuższa ścieżka. */
  d: number;
  /** Średnia długość korytarza w komórkach. */
  meanCorridorLen: number;
  /**
   * Znormalizowana do [0,1] entropia rozkładu kierunków.
   * Plansza z elementami w jednym kierunku ma 0, z równomiernym rozkładem 1.
   * Wchodzi do punktacji (Slice 5) jako waga pozornej trudności.
   */
  dirEntropy: number;
  /** Znormalizowana do [0,1] entropia rozkładu długości po koszykach. */
  lenEntropy: number;
}

/** Metryki niepoliczone. Wypełnia je Slice 3 przez `withMetrics`. */
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
  /** Długość `width * height`; `EMPTY` albo id elementu. */
  occupancy: Int32Array;
  pieces: Map<number, Piece>;
  metrics: BoardMetrics;
}

/**
 * Parametry generatora — jedna struktura wspólna dla presetów i konfiguratora.
 * Presety Easy–Nightmare to nazwane instancje tego typu, nie osobna gałąź kodu.
 */
export interface GeneratorParams {
  width: number;
  height: number;
  /** Górna granica długości elementu; domyślnie round(2.5 * max(W, H)). */
  maxLength: number;
  /** Wagi koszyków [krótkie 2–6, średnie 7–15, długie 16–maxLength]. Suma = 1. */
  bucketWeights: readonly [short: number, medium: number, long: number];
  /** Prawdopodobieństwo kontynuacji prosto przy wzroście ścieżki. */
  straightBias: number;
  /** Premia dla ruchu w bok względem ruchu w głąb. */
  lateralWeight: number;
  /** Siła heurystyki Warnsdorffa. 0 wyłącza ją — wtedy 1 plansza na 30 się nie domyka. */
  warnsdorff: number;
  /**
   * Preferencja linii przy wyborze głowy: 1 = najgłębsza (tunele, niskie f0),
   * -1 = najpłytsza (warstwy, wysokie f0), 0 = bez preferencji.
   */
  headBias: -1 | 0 | 1;
  seed: number;
}

/** Co generator faktycznie osiągnął — geometria potrafi odmówić (§11). */
export interface GenerationReport {
  params: GeneratorParams;
  actualPieceCount: number;
  backtracks: number;
  restarts: number;
  /** Histogram długości w koszykach 2–6, 7–15, 16–49, 50+. */
  lengthHistogram: readonly [number, number, number, number];
  /** Udział powierzchni planszy zajęty przez elementy dłuższe niż 15 komórek. */
  longAreaShare: number;
  maxLength: number;
  meanLength: number;
  generationMs: number;
}
```

- [ ] **Krok 4: Zaimplementuj arytmetykę**

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

/** Czy kierunki są prostopadłe — używane przy liczeniu skrętów. */
export function isPerpendicular(a: Dir, b: Dir): boolean {
  return (a % 2) !== (b % 2);
}
```

- [ ] **Krok 5: Uruchom testy — mają przejść**

```bash
npm run test:core -- geometry
```

Oczekiwane: PASS (5 testów).

- [ ] **Krok 6: Commit**

```bash
git add -A
git commit -m "Wprowadź model danych planszy i arytmetykę siatki"
```

---

### Task 2: Budowa planszy i niezmienniki

**Files:**
- Create: `src/core/board.ts`
- Create: `src/core/testing/fixtures.ts`
- Test: `src/core/board.spec.ts`

**Interfaces:**
- Consumes: typy i arytmetyka z Zadania 1.
- Produces:
  - `createBoard(width: number, height: number, pieces: readonly Piece[]): Board`
  - `pieceAt(board: Board, x: number, y: number): number` (zwraca `EMPTY` lub id)
  - `validateBoard(board: Board): string[]` — lista naruszeń niezmienników,
    pusta gdy plansza poprawna. Używana w Slice 2 i 3 na tysiącach ziaren.
  - `piece(id, dir, cells): Piece` i `boardOf(width, height, pieces): Board`
    z `testing/fixtures.ts`.

- [ ] **Krok 1: Napisz failujące testy niezmienników**

```typescript
// src/core/board.spec.ts
import { EMPTY } from './types';
import { createBoard, pieceAt, validateBoard } from './board';
import { boardOf, piece } from './testing/fixtures';

describe('createBoard', () => {
  it('zapisuje właściciela każdej komórki', () => {
    // Poziomy element o długości 3, grot w (2,0), skierowany w prawo.
    const b = createBoard(4, 2, [piece(0, 1, [[2, 0], [1, 0], [0, 0]])]);
    expect(pieceAt(b, 2, 0)).toBe(0);
    expect(pieceAt(b, 1, 0)).toBe(0);
    expect(pieceAt(b, 0, 0)).toBe(0);
    expect(pieceAt(b, 3, 0)).toBe(EMPTY);
    expect(pieceAt(b, 0, 1)).toBe(EMPTY);
  });

  it('trzyma elementy pod ich identyfikatorami', () => {
    const b = createBoard(4, 1, [piece(7, 1, [[1, 0], [0, 0]])]);
    expect(b.pieces.get(7)?.dir).toBe(1);
    expect(b.pieces.size).toBe(1);
  });
});

describe('validateBoard', () => {
  it('nie zgłasza nic dla poprawnej, w pełni pokrytej planszy', () => {
    // 2x2 pokryte dwoma pionowymi dominami skierowanymi w górę.
    const b = boardOf(2, 2, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[1, 0], [1, 1]]),
    ]);
    expect(validateBoard(b)).toEqual([]);
  });

  it('wykrywa komórkę nieprzypisaną', () => {
    const b = boardOf(2, 2, [piece(0, 0, [[0, 0], [0, 1]])]);
    expect(validateBoard(b).join(' ')).toMatch(/nieprzypisan/i);
  });

  it('wykrywa element o długości 1', () => {
    const b = boardOf(1, 1, [piece(0, 0, [[0, 0]])]);
    expect(validateBoard(b).join(' ')).toMatch(/długości 1|krótszy niż 2/i);
  });

  it('wykrywa przerwaną ciągłość ścieżki', () => {
    const b = boardOf(3, 1, [piece(0, 1, [[2, 0], [0, 0]])]);
    expect(validateBoard(b).join(' ')).toMatch(/ciągł/i);
  });

  it('wykrywa komórkę odwiedzoną dwukrotnie', () => {
    const b = boardOf(2, 1, [piece(0, 1, [[1, 0], [0, 0], [1, 0]])]);
    expect(validateBoard(b).join(' ')).toMatch(/dwukrotnie|powtórz/i);
  });

  it('wykrywa kierunek niezgodny z ostatnim segmentem', () => {
    // Ciało leży w prawo od grotu, więc dir musi być 3 (lewo), a jest 1.
    const b = boardOf(2, 1, [piece(0, 1, [[0, 0], [1, 0]])]);
    expect(validateBoard(b).join(' ')).toMatch(/kierunek/i);
  });
});
```

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npm run test:core -- board
```

Oczekiwane: FAIL — brak modułu `./board`.

- [ ] **Krok 3: Napisz pomocniki testowe**

```typescript
// src/core/testing/fixtures.ts
import { createBoard } from '../board';
import { Board, Dir, Piece } from '../types';

/**
 * Buduje element z listy par [x, y]. PIERWSZA para to komórka z grotem.
 * Zapis tablicowy jest zwięzły, a testów legalności ruchu jest kilkadziesiąt.
 */
export function piece(id: number, dir: Dir, cells: readonly (readonly [number, number])[]): Piece {
  return { id, dir, cells: cells.map(([x, y]) => ({ x, y })) };
}

export function boardOf(width: number, height: number, pieces: readonly Piece[]): Board {
  return createBoard(width, height, pieces);
}
```

- [ ] **Krok 4: Zaimplementuj `createBoard`, `pieceAt` i `validateBoard`**

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
 * Sprawdza niezmienniki planszy i zwraca listę naruszeń (pustą, gdy wszystko gra).
 * Nie rzuca wyjątkiem, bo używamy jej w pętli po tysiącach ziaren i chcemy
 * zobaczyć WSZYSTKIE problemy naraz, nie tylko pierwszy.
 */
export function validateBoard(board: Board): string[] {
  const problems: string[] = [];
  const { width, height } = board;
  const seen = new Int32Array(width * height).fill(EMPTY);

  for (const p of board.pieces.values()) {
    if (p.cells.length < 2) {
      problems.push(`Element ${p.id} ma długość 1 — element krótszy niż 2 komórki nie ma kierunku.`);
    }
    const visited = new Set<number>();
    for (let i = 0; i < p.cells.length; i++) {
      const c = p.cells[i]!;
      if (!isInside(width, height, c.x, c.y)) {
        problems.push(`Element ${p.id}: komórka (${c.x},${c.y}) leży poza planszą.`);
        continue;
      }
      const idx = cellIndex(width, c.x, c.y);
      if (visited.has(idx)) {
        problems.push(`Element ${p.id} odwiedza komórkę (${c.x},${c.y}) dwukrotnie.`);
      }
      visited.add(idx);
      if (seen[idx] !== EMPTY && seen[idx] !== p.id) {
        problems.push(`Komórka (${c.x},${c.y}) należy do elementów ${seen[idx]} i ${p.id}.`);
      }
      seen[idx] = p.id;
      if (i > 0) {
        const prev = p.cells[i - 1]!;
        const dist = Math.abs(prev.x - c.x) + Math.abs(prev.y - c.y);
        if (dist !== 1) {
          problems.push(`Element ${p.id}: przerwana ciągłość między (${prev.x},${prev.y}) a (${c.x},${c.y}).`);
        }
      }
    }
    // Kierunek grotu musi zgadzać się z ostatnim segmentem: krok WSTECZ od grotu
    // ma wskazywać na cells[1]. To jest miejsce, w którym łapiemy błąd znaku.
    const head = p.cells[0];
    const neck = p.cells[1];
    if (head && neck) {
      const expected = stepFrom(head, oppositeDir(p.dir));
      if (expected.x !== neck.x || expected.y !== neck.y) {
        problems.push(
          `Element ${p.id}: kierunek ${p.dir} nie zgadza się z ostatnim segmentem — ` +
            `ciało powinno zaczynać się w (${expected.x},${expected.y}), a zaczyna w (${neck.x},${neck.y}).`,
        );
      }
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (seen[cellIndex(width, x, y)] === EMPTY) {
        problems.push(`Komórka (${x},${y}) pozostała nieprzypisana.`);
      }
    }
  }
  return problems;
}

/** Suma długości elementów. Przy poprawnej planszy równa się width * height. */
export function coveredCells(board: Board): number {
  let total = 0;
  for (const p of board.pieces.values()) total += p.cells.length;
  return total;
}

export function headOf(p: Piece): Coord {
  return p.cells[0]!;
}
```

- [ ] **Krok 5: Uruchom testy — mają przejść**

```bash
npm run test:core -- board
```

Oczekiwane: PASS (8 testów).

- [ ] **Krok 6: Commit**

```bash
git add -A
git commit -m "Dodaj budowę planszy i kontrolę niezmienników"
```

---

### Task 3: Korytarz i legalność ruchu

**Files:**
- Modify: `src/core/board.ts`
- Test: `src/core/board.spec.ts` (dopisanie bloku)

**Interfaces:**
- Consumes: `Board`, `Piece`, `pieceAt` z Zadania 2.
- Produces:
  - `type ProbeResult = { free: true } | { free: false; distance: number; blockerId: number }`
  - `probeMove(board: Board, piece: Piece): ProbeResult`
  - `headRay(board: Board, piece: Piece): Coord[]` — komórki promienia z głowy
    do krawędzi, bez komórki głowy. Slice 2 i 3 używają **tej samej** funkcji.

To jest **serce projektu**. Cała reszta (generator, solver, punktacja) wynika
z tego, że korytarz nie zależy od stanu planszy.

- [ ] **Krok 1: Napisz failujące testy legalności — komplet z §12**

```typescript
// dopisz do src/core/board.spec.ts
import { headRay, probeMove } from './board';

describe('probeMove — korytarz to promień z głowy', () => {
  // §12.4 — element wzdłuż krawędzi, prostopadle do swojego kierunku.
  it('uznaje za wolny element leżący przy krawędzi wyjścia', () => {
    // Grot w (0,0) patrzy w lewo, więc ciało ciągnie się w prawo wzdłuż wiersza.
    const b = boardOf(4, 2, [
      piece(0, 3, [[0, 0], [1, 0], [2, 0], [3, 0]]),
      piece(1, 1, [[3, 1], [2, 1], [1, 1], [0, 1]]),
    ]);
    expect(probeMove(b, b.pieces.get(0)!)).toEqual({ free: true });
    expect(probeMove(b, b.pieces.get(1)!)).toEqual({ free: true });
  });

  // §12.1 — kształt U z obcym elementem uwięzionym we wklęsłości NIE blokuje.
  // Test istnieje po to, żeby wychwycić powrót do reguły sztywnej translacji.
  it('nie blokuje się o element uwięziony we wklęsłości kształtu U', () => {
    // U otwarte do góry: ramiona w kolumnach 0 i 2, dno w wierszu 2.
    // Grot w (0,0) skierowany w górę. Obcy element siedzi w (1,1) — wewnątrz U.
    const u = piece(0, 0, [
      [0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0],
    ]);
    const intruder = piece(1, 2, [[1, 1], [1, 0]]);
    const b = boardOf(3, 3, [u, intruder]);
    // Promień z głowy (0,0) w górę wychodzi natychmiast poza planszę.
    expect(probeMove(b, b.pieces.get(0)!)).toEqual({ free: true });
  });

  // §12.3 — drugie ramię L z obcym elementem przed sobą NIE blokuje.
  it('ignoruje to, co stoi przed drugim ramieniem kształtu L', () => {
    // L: grot w (0,0) w górę, ciało schodzi do (0,1) i skręca do (1,1), (2,1).
    const l = piece(0, 0, [[0, 0], [0, 1], [1, 1], [2, 1]]);
    // Obcy element stoi nad ramieniem poziomym, w (2,0) — na drodze ramienia,
    // ale NIE na promieniu z głowy.
    const other = piece(1, 1, [[2, 0], [1, 0]]);
    const b = boardOf(3, 2, [l, other]);
    expect(probeMove(b, b.pieces.get(0)!)).toEqual({ free: true });
  });

  // §12.2 — promień przechodzący przez komórki własne nie blokuje.
  it('nie blokuje się o własne komórki leżące przed głową', () => {
    // Element wije się tak, że jego ciało leży NAD głową: grot w (1,2) patrzy
    // w górę, a komórki (1,1) i (1,0) na jego promieniu należą do niego samego.
    const snake = piece(0, 0, [
      [1, 2], // grot, kierunek: góra
      [1, 3], [0, 3], [0, 2], [0, 1], [0, 0], [1, 0], [1, 1],
    ]);
    const b = boardOf(2, 4, [snake]);
    // Promień z (1,2) w górę mija (1,1) i (1,0) — obie są własne.
    expect(probeMove(b, b.pieces.get(0)!)).toEqual({ free: true });
  });

  // §12.6 — dwa elementy na jednej linii: tylny zablokowany, przedni wolny.
  it('blokuje tylko element stojący za innym na tej samej linii', () => {
    const front = piece(0, 0, [[0, 0], [0, 1]]);
    const back = piece(1, 0, [[0, 2], [0, 3]]);
    const b = boardOf(1, 4, [front, back]);
    expect(probeMove(b, b.pieces.get(0)!)).toEqual({ free: true });
    expect(probeMove(b, b.pieces.get(1)!)).toEqual({ free: false, distance: 1, blockerId: 0 });
  });

  // §12.6 — dwa równoległe elementy obok siebie: oba wolne.
  it('nie myli sąsiednich linii', () => {
    const a = piece(0, 0, [[0, 0], [0, 1]]);
    const c = piece(1, 0, [[1, 0], [1, 1]]);
    const b = boardOf(2, 2, [a, c]);
    expect(probeMove(b, b.pieces.get(0)!)).toEqual({ free: true });
    expect(probeMove(b, b.pieces.get(1)!)).toEqual({ free: true });
  });

  // §12.5 — bloker w ostatniej komórce przy krawędzi (pętla inkluzywna).
  it('widzi blokera stojącego dokładnie przy krawędzi', () => {
    // Plansza 2×4 pokryta w całości czterema dominami.
    const edge = piece(0, 3, [[0, 0], [1, 0]]);     // grot w lewo, wiersz 0
    const filler = piece(2, 3, [[0, 1], [1, 1]]);   // grot w lewo, wiersz 1
    const runner = piece(1, 0, [[0, 2], [0, 3]]);   // grot w górę, kolumna 0
    const tail = piece(3, 2, [[1, 3], [1, 2]]);     // grot w dół, kolumna 1
    const b = boardOf(2, 4, [edge, filler, runner, tail]);
    // Promień runnera z (0,2) w górę trafia najpierw na filler w (0,1).
    expect(probeMove(b, b.pieces.get(1)!)).toEqual({ free: false, distance: 1, blockerId: 2 });
  });

  // §12.8 — grot skierowany w głąb planszy jest legalny.
  it('obsługuje korytarz przez całą planszę', () => {
    // Grot w (1,0) patrzy w prawo, więc ciało MUSI iść w lewo: (0,0), potem w dół.
    const hook = piece(0, 1, [[1, 0], [0, 0], [0, 1]]);
    const b = boardOf(5, 2, [hook]);
    expect(probeMove(b, b.pieces.get(0)!)).toEqual({ free: true });
    expect(headRay(b, b.pieces.get(0)!)).toEqual([
      { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 },
    ]);
  });
});

describe('probeMove — odległość odbicia (§12.24, §12.25)', () => {
  it('zwraca odległość 1 dla blokera tuż przed głową', () => {
    const runner = piece(0, 0, [[0, 1], [0, 2]]);
    const blocker = piece(1, 3, [[0, 0], [1, 0]]); // grot w lewo, ciało w prawo
    const b = boardOf(2, 3, [runner, blocker]);
    expect(probeMove(b, b.pieces.get(0)!)).toEqual({ free: false, distance: 1, blockerId: 1 });
  });

  it('zwraca odległość do dalekiego blokera', () => {
    const runner = piece(0, 0, [[0, 5], [0, 6]]);
    const blocker = piece(1, 3, [[0, 0], [1, 0]]);
    const b = boardOf(2, 7, [runner, blocker]);
    expect(probeMove(b, b.pieces.get(0)!)).toEqual({ free: false, distance: 5, blockerId: 1 });
  });

  // §12.24 i §12.9a — ciało leży PRZED własną głową: promień mija najpierw
  // komórki własne, więc odległość liczy się od ostatniej minionej komórki
  // własnej, a nie od głowy. To jest test na `lastOwn`.
  it('liczy odległość od ostatniej minionej komórki własnej', () => {
    // Plansza 2×6. Grot w (0,3) patrzy w górę; ciało schodzi pod głowę, obiega
    // kolumnę 1 i wraca do kolumny 0 NAD głową — komórki (0,2) i (0,1) leżą
    // więc na własnym promieniu.
    const snake = piece(0, 0, [
      [0, 3], [0, 4], [1, 4], [1, 3], [1, 2], [1, 1], [0, 1], [0, 2],
    ]);

    // Bez blokera: promień mija (0,2) i (0,1) — własne — a (0,0) jest puste.
    const b1 = boardOf(2, 6, [snake]);
    expect(probeMove(b1, b1.pieces.get(0)!)).toEqual({ free: true });

    // Z blokerem w (0,0): kroki 1 i 2 są własne (lastOwn = 2), krok 3 jest obcy,
    // więc odległość odbicia to 3 − 2 = 1, a NIE 3.
    const blocker = piece(1, 3, [[0, 0], [1, 0]]);
    const b2 = boardOf(2, 6, [snake, blocker]);
    expect(probeMove(b2, b2.pieces.get(0)!)).toEqual({ free: false, distance: 1, blockerId: 1 });
  });

  // §12.25 — przy kilku blokerach liczy się NAJBLIŻSZY.
  it('wskazuje najbliższego blokera, gdy jest ich kilku', () => {
    const runner = piece(0, 0, [[0, 4], [0, 5]]);
    const near = piece(1, 3, [[0, 2], [1, 2]]);
    const far = piece(2, 3, [[0, 0], [1, 0]]);
    const filler = piece(3, 3, [[0, 1], [1, 1]]);
    const b = boardOf(2, 6, [runner, near, far, filler]);
    expect(probeMove(b, b.pieces.get(0)!)).toEqual({ free: false, distance: 2, blockerId: 1 });
  });
});
```

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npm run test:core -- board
```

Oczekiwane: FAIL — `probeMove is not a function`.

- [ ] **Krok 3: Zaimplementuj korytarz**

```typescript
// dopisz do src/core/board.ts
import { DIR_VECTORS } from './types';

export type ProbeResult =
  | { free: true }
  | { free: false; distance: number; blockerId: number };

/**
 * Komórki korytarza: promień z komórki głowy do krawędzi, w kierunku grotu.
 * Bez komórki głowy. Kształt ciała nie ma na promień żadnego wpływu — element
 * jedzie po własnym torze, więc ciało nigdy nie wchodzi na cudze pole (§6).
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
 * Czy element może opuścić planszę, a jeśli nie — jak daleko dojedzie i o co uderzy.
 *
 * Jeden przebieg po promieniu z głowy, O(max(W,H)).
 * `lastOwn` pamięta numer kroku ostatniej minionej komórki WŁASNEJ: tor może
 * przecinać własny promień, a wtedy element przejedzie po nim bez przeszkód,
 * więc odległość odbicia liczy się od tego miejsca, nie od głowy (§6, §12.24).
 *
 * UWAGA: nie wolno tu sprawdzać, czy wolna jest droga przed CAŁYM kształtem —
 * to porzucona reguła sztywnej translacji. Testy §12.1 i §12.3 to wykrywają.
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

- [ ] **Krok 4: Uruchom testy — mają przejść**

```bash
npm run test:core -- board
```

Oczekiwane: PASS. Jeśli test „kształt U" albo „drugie ramię L" zawodzi,
implementacja sprawdza cień całego kształtu zamiast promienia z głowy —
wróć do reguły z §6, nie łataj testu.

- [ ] **Krok 5: Commit**

```bash
git add -A
git commit -m "Zaimplementuj korytarz i test legalności ruchu"
```

---

### Task 4: Usuwanie elementu z planszy

**Files:**
- Modify: `src/core/board.ts`
- Test: `src/core/board.spec.ts` (dopisanie bloku)

**Interfaces:**
- Produces: `removePiece(board: Board, pieceId: number): Board` — zwraca
  **nowy** `Board`; oryginał pozostaje nietknięty. Slice 5 (reduktor sesji)
  polega na tym, że funkcja jest czysta.

- [ ] **Krok 1: Napisz failujące testy**

```typescript
// dopisz do src/core/board.spec.ts
import { removePiece } from './board';

describe('removePiece', () => {
  it('zwalnia komórki usuniętego elementu', () => {
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

  it('nie rusza oryginalnej planszy', () => {
    const b = boardOf(2, 2, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[1, 0], [1, 1]]),
    ]);
    removePiece(b, 0);
    expect(pieceAt(b, 0, 0)).toBe(0);
    expect(b.pieces.size).toBe(2);
  });

  it('zachowuje metryki planszy', () => {
    const b = boardOf(2, 2, [
      piece(0, 0, [[0, 0], [0, 1]]),
      piece(1, 0, [[1, 0], [1, 1]]),
    ]);
    const withM = { ...b, metrics: { ...b.metrics, n: 2, f0: 1 } };
    expect(removePiece(withM, 0).metrics.f0).toBe(1);
  });

  it('jest bez efektu dla nieistniejącego identyfikatora', () => {
    const b = boardOf(1, 2, [piece(0, 0, [[0, 0], [0, 1]])]);
    expect(removePiece(b, 42).pieces.size).toBe(1);
  });

  // §12.7 — spójność liczników: ten sam bloker w trzech komórkach korytarza.
  // Po jego usunięciu element staje się wolny dokładnie raz.
  it('odblokowuje element, gdy znika bloker zajmujący kilka komórek korytarza', () => {
    // Kolumna x=0, wysokość 5. Bloker wije się przez (0,0), (0,1), (0,2).
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

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npm run test:core -- board
```

Oczekiwane: FAIL — `removePiece is not a function`.

- [ ] **Krok 3: Zaimplementuj usuwanie**

```typescript
// dopisz do src/core/board.ts

/**
 * Usuwa element i zwraca NOWĄ planszę. Oryginał zostaje nietknięty.
 *
 * Kopiujemy `occupancy` (80 kB przy Nightmare 100×200, ~10 µs) zamiast mutować,
 * bo reduktor sesji (Slice 5) ma być czysty bez zastrzeżeń. Przy jednym
 * kliknięciu na ruch koszt jest niezauważalny, a testy pozostają proste.
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

- [ ] **Krok 4: Uruchom pełny zestaw testów rdzenia**

```bash
npm run test:core
```

Oczekiwane: PASS — wszystkie testy `rng`, `geometry` i `board`.

- [ ] **Krok 5: Commit**

```bash
git add -A
git commit -m "Dodaj usuwanie elementu z planszy"
```

---

## Kryteria odbioru slice'a

- `npm run test:core` przechodzi; testy §12.1–8, §12.24 i §12.25 są zaimplementowane
  i zielone.
- `probeMove` czyta **wyłącznie** promień z głowy — testy kształtu U i drugiego
  ramienia L to potwierdzają.
- `removePiece` nie mutuje wejścia (osobny test).
- `validateBoard` wykrywa: nieprzypisaną komórkę, element długości 1, przerwaną
  ciągłość, komórkę odwiedzoną dwukrotnie, nakładanie się elementów i zły znak
  kierunku.
- `npm run lint` przechodzi — rdzeń nie sięgnął po DOM ani Angulara.
