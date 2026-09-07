# Slice 2 — Generator: wycinanie z pełnej planszy

> **Dla wykonawców agentowych:** WYMAGANA PODUMIEJĘTNOŚĆ: użyj
> `superpowers:subagent-driven-development` (zalecane) albo
> `superpowers:executing-plans`. Kroki mają checkboxy (`- [ ]`).

**Cel:** `generate(params)` produkuje planszę pokrytą w **100%**, w której każdy
element ma co najmniej 2 komórki, a kolejność wycinania jest gotowym
rozwiązaniem.

**Architektura:** Nie wstawiamy elementów na pustą planszę — **wycinamy je
z planszy pełnej, w kolejności usuwania**. Element `q_j` można wyciąć, gdy cały
jego korytarz prowadzi przez komórki już przypisane albo własne. Warunek
dotyczy **wyłącznie głowy** (korytarz to jeden promień), więc ciało rośnie bez
ograniczeń geometrycznych — i stąd biorą się splątane kształty. Obszar
dopuszczalny opisują cztery tablice `depth_d[linia]`, aktualizowane
przyrostowo. Pełne pokrycie nie jest dowodzone, tylko wymuszane trzema
warstwami: głowy z nieprzypisanym sąsiadem, test kształtu resztki, ograniczony
nawrót.

**Stack:** TypeScript strict, Vitest w Node.

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md` (§7, §12.9–13,
§12.20–23)

**Mapa:** `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`

**Odniesienie pomiarowe:** `prototype/carve.mjs` — kod wyrzucalny, ale
**zmierzony**. Nie portujemy go; piszemy od zera w TS. Gdy wynik biegnie inaczej
niż w tabelach §7 i §9 specyfikacji, to implementacja się rozjechała, nie
pomiar.

## Global Constraints

Obowiązują ograniczenia z mapy wdrożenia. Krytyczne dla tego slice'a:

- **Heurystyka Warnsdorffa jest wymagana, nie opcjonalna.** Bez niej ciało
  fragmentuje resztę planszy i 1 plansza na 30 nie generuje się wcale.
- **Minimalna długość 2** wynika z konstrukcji: głowę wybieramy wyłącznie
  spośród komórek mających nieprzypisanego sąsiada.
- Generator **nigdy się nie zapętla** i **nigdy nie rzuca wyjątkiem** — po
  wyczerpaniu budżetu oddaje najlepszy wynik i raportuje rozbieżność.
- Wartości domyślne: wagi `0.50 / 0.20 / 0.30`, `warnsdorff = 4`,
  `straightBias = 0.6`, `lateralWeight = 3`, `maxLength = round(2.5·max(W,H))`.

## File Structure

| Plik | Odpowiedzialność |
|---|---|
| `src/core/skyline.ts` | obszar dopuszczalny: tablice `depth_d`, kandydaci na głowę |
| `src/core/lengths.ts` | rozkład mieszany długości (trzy koszyki) |
| `src/core/decompose.ts` | test kształtu resztki: czy fragment da się rozłożyć na ścieżki ≥ 2 |
| `src/core/shapes.ts` | wzrost ścieżki: kandydaci, wagi, Warnsdorff |
| `src/core/generator.ts` | `generate()`: pętla wycinania, nawroty, restarty, raport |
| `src/core/*.spec.ts` | testy §12.9–13 i §12.20–23 |

---

### Task 1: Obszar dopuszczalny (skyline)

**Files:**
- Create: `src/core/skyline.ts`
- Test: `src/core/skyline.spec.ts`

**Interfaces:**
- Consumes: `Dir`, `Coord`, `EMPTY`, `cellIndex`, `isInside` ze Slice'a 1.
- Produces:
  - `class Skyline` z metodami:
    `depth(dir: Dir, line: number): number`,
    `headCandidate(dir: Dir, line: number): Coord | null`,
    `recompute(owner: Int32Array, cells: readonly Coord[]): void`
  - `lineOf(dir: Dir, c: Coord): number`

Sedno: `depth_d[L]` to liczba kolejnych **przypisanych** komórek na linii `L`,
licząc od krawędzi w kierunku `d` do wewnątrz. Pierwsza nieprzypisana komórka
na linii jest **jedyną kandydatką na głowę** dla tego kierunku, więc kandydatów
jest co najwyżej `W` albo `H`, a test kosztuje `O(1)`.

- [ ] **Krok 1: Napisz failujący test (§12.12)**

```typescript
// src/core/skyline.spec.ts
import { EMPTY } from './types';
import { Skyline, lineOf } from './skyline';

/** Buduje tablicę właścicieli z rysunku: '.' = nieprzypisana, cyfra = id. */
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
  it('liczy głębokość od krawędzi każdego kierunku', () => {
    const { owner, w, h } = ownerFrom([
      '11.',
      '1..',
      '...',
    ]);
    const s = new Skyline(w, h);
    s.rebuild(owner);
    // Kierunek 0 (góra): kolumna 0 ma przypisane (0,0) i (0,1) → 2.
    expect(s.depth(0, 0)).toBe(2);
    // Kolumna 1 ma przypisane tylko (1,0) → 1.
    expect(s.depth(0, 1)).toBe(1);
    expect(s.depth(0, 2)).toBe(0);
    // Kierunek 3 (lewo): wiersz 0 ma przypisane (0,0) i (1,0) → 2.
    expect(s.depth(3, 0)).toBe(2);
    expect(s.depth(3, 1)).toBe(1);
    // Kierunek 2 (dół): kolumna 0 od dołu — (0,2) nieprzypisana → 0.
    expect(s.depth(2, 0)).toBe(0);
  });

  it('wskazuje pierwszą nieprzypisaną komórkę linii jako kandydatkę na głowę', () => {
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

  it('zwraca null dla linii przypisanej w całości', () => {
    const { owner, w, h } = ownerFrom(['11', '11']);
    const s = new Skyline(w, h);
    s.rebuild(owner);
    expect(s.headCandidate(0, 0)).toBeNull();
    expect(s.headCandidate(1, 1)).toBeNull();
  });

  // §12.12 — komórka przy krawędzi zwiększa depth, komórka w głębi NIE
  // (dopóki nie domknie się ciągłość od krawędzi).
  it('aktualizuje głębokość przyrostowo po wycięciu', () => {
    const { owner, w, h } = ownerFrom(['...', '...', '...']);
    const s = new Skyline(w, h);
    s.rebuild(owner);
    expect(s.depth(0, 1)).toBe(0);

    // Komórka w GŁĘBI kolumny 1 — ciągłość od górnej krawędzi się nie domyka.
    owner[1 * 3 + 1] = 5;
    s.recompute(owner, [{ x: 1, y: 1 }]);
    expect(s.depth(0, 1)).toBe(0);

    // Domknięcie: teraz (1,0) też jest przypisana → depth rośnie od razu o 2.
    owner[0 * 3 + 1] = 5;
    s.recompute(owner, [{ x: 1, y: 0 }]);
    expect(s.depth(0, 1)).toBe(2);
  });

  it('przelicza tylko linie dotknięte przez wycięcie', () => {
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
  it('mapuje komórkę na numer linii właściwy dla kierunku', () => {
    expect(lineOf(0, { x: 3, y: 7 })).toBe(3); // góra/dół → kolumna
    expect(lineOf(2, { x: 3, y: 7 })).toBe(3);
    expect(lineOf(1, { x: 3, y: 7 })).toBe(7); // prawo/lewo → wiersz
    expect(lineOf(3, { x: 3, y: 7 })).toBe(7);
  });
});
```

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npm run test:core -- skyline
```

Oczekiwane: FAIL — brak modułu `./skyline`.

- [ ] **Krok 3: Zaimplementuj skyline**

```typescript
// src/core/skyline.ts
import { cellIndex } from './geometry';
import { Coord, Dir, EMPTY } from './types';

/** Numer linii, po której biegnie promień danego kierunku. */
export function lineOf(dir: Dir, c: Coord): number {
  return dir === 0 || dir === 2 ? c.x : c.y;
}

/**
 * Obszar dopuszczalny wycinania.
 *
 * `depth_d[L]` = ile kolejnych PRZYPISANYCH komórek leży na linii `L`, licząc
 * od krawędzi w kierunku `d` do wewnątrz. Komórka może być głową wycinanego
 * elementu o kierunku `d` dokładnie wtedy, gdy jest pierwszą nieprzypisaną
 * komórką swojej linii — bo wtedy cały jej korytarz prowadzi przez komórki
 * już przypisane (§7).
 */
export class Skyline {
  /** Indeksy: [kierunek][linia]. Dla góry i dołu linia to kolumna, dla boków wiersz. */
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

  /** Przelicza wszystkie linie od zera. Używane przy starcie i przy nawrocie. */
  rebuild(owner: Int32Array): void {
    for (let x = 0; x < this.width; x++) this.recomputeColumn(owner, x);
    for (let y = 0; y < this.height; y++) this.recomputeRow(owner, y);
  }

  /** Przelicza wyłącznie linie dotknięte przez podane komórki: O(4·ℓ). */
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

  /** Pierwsza nieprzypisana komórka linii, licząc od krawędzi wyjścia kierunku. */
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

- [ ] **Krok 4: Uruchom testy — mają przejść**

```bash
npm run test:core -- skyline
```

Oczekiwane: PASS (6 testów).

- [ ] **Krok 5: Commit**

```bash
git add -A
git commit -m "Dodaj obszar dopuszczalny wycinania"
```

---

### Task 2: Rozkład długości

**Files:**
- Create: `src/core/lengths.ts`
- Test: `src/core/lengths.spec.ts`

**Interfaces:**
- Consumes: `Rng`, `randInt` ze Slice'a 0; `GeneratorParams` ze Slice'a 1.
- Produces:
  - `drawTargetLength(rng: Rng, params: GeneratorParams): number`
  - `longAreaShare(params: GeneratorParams): number` — udział powierzchni
    planszy zajęty przez koszyk długi. Konfigurator (Slice 8) pokazuje tę
    wartość na żywo i ostrzega powyżej 0.25.
  - `LENGTH_BUCKETS` — granice koszyków.

- [ ] **Krok 1: Napisz failujące testy (§12.9, §12.9b, §12.23)**

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
  it('nigdy nie schodzi poniżej 2 ani powyżej maxLength', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 20_000; i++) {
      const L = drawTargetLength(rng, base);
      expect(L).toBeGreaterThanOrEqual(2);
      expect(L).toBeLessThanOrEqual(base.maxLength);
    }
  });

  // §12.9b — generator faktycznie produkuje długie elementy, nie obcina
  // po cichu wszystkiego do krótkich.
  it('trafia w zamówione udziały koszyków', () => {
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

  // Koszyk długi jest LOG-jednostajny: przy maxLength = 300 jednostajny dałby
  // średnią 158 (same potwory), log-jednostajny daje ~97 i rozkłada masę
  // po rzędach wielkości.
  it('losuje koszyk długi log-jednostajnie', () => {
    const rng = mulberry32(3);
    const params = { ...base, maxLength: 300, bucketWeights: [0, 0, 1] as const };
    const draws: number[] = [];
    for (let i = 0; i < 20_000; i++) draws.push(drawTargetLength(rng, params));
    const mean = draws.reduce((a, b) => a + b, 0) / draws.length;
    // Jednostajny dałby ~158. Log-jednostajny na [16,300] daje ~97.
    expect(mean).toBeGreaterThan(70);
    expect(mean).toBeLessThan(125);
    // Ogon istnieje: przynajmniej kilka procent przekracza 200.
    expect(draws.filter((L) => L > 200).length / draws.length).toBeGreaterThan(0.02);
    // Dolny kraniec koszyka też jest obsadzony.
    expect(draws.filter((L) => L < 30).length / draws.length).toBeGreaterThan(0.05);
  });

  // §12.22 — krańce stopnia połamania nie wywracają losowania.
  it('działa dla skrajnych parametrów', () => {
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

  it('obsługuje maxLength mniejszy niż dolna granica koszyka długiego', () => {
    const rng = mulberry32(9);
    const p = { ...base, maxLength: 10, bucketWeights: [0, 0, 1] as GeneratorParams['bucketWeights'] };
    for (let i = 0; i < 200; i++) {
      const L = drawTargetLength(rng, p);
      expect(L).toBeLessThanOrEqual(10);
      expect(L).toBeGreaterThanOrEqual(2);
    }
  });
});

// §12.23 — udział powierzchni koszyka długiego musi zgadzać się z tym,
// co pokazuje konfigurator; inaczej ostrzeżenie o 25% wprowadza w błąd.
describe('longAreaShare', () => {
  it('zgadza się z udziałem zmierzonym na losowaniu', () => {
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

  it('rośnie z wagą koszyka długiego', () => {
    const low = longAreaShare({ ...base, bucketWeights: [0.85, 0.14, 0.01] });
    const high = longAreaShare({ ...base, bucketWeights: [0.4, 0.15, 0.45] });
    expect(high).toBeGreaterThan(low);
    expect(low).toBeLessThan(0.25);
  });
});
```

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npm run test:core -- lengths
```

Oczekiwane: FAIL — brak modułu `./lengths`.

- [ ] **Krok 3: Zaimplementuj rozkład**

```typescript
// src/core/lengths.ts
import { randInt, Rng } from './rng';
import { GeneratorParams } from './types';

/** Granice koszyków: krótkie 2–6, średnie 7–15, długie 16–maxLength. */
export const LENGTH_BUCKETS = {
  shortMin: 2,
  shortMax: 6,
  mediumMin: 7,
  mediumMax: 15,
  longMin: 16,
} as const;

/**
 * Losuje docelową długość elementu z rozkładu mieszanego o trzech koszykach.
 *
 * Koszyk długi jest LOG-jednostajny, nie jednostajny: przy maxLength = 300
 * jednostajny dawałby średnią 158 komórek, czyli same potwory. Log-jednostajny
 * rozkłada masę po rzędach wielkości, więc powstają i elementy 20-komórkowe,
 * i 250-komórkowe (§7).
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

/** Średnia długość koszyka — potrzebna do policzenia udziału powierzchni. */
function bucketMeans(maxLength: number): [number, number, number] {
  const a = LENGTH_BUCKETS.longMin;
  const b = Math.max(a + 1, Math.floor(maxLength));
  // Wartość oczekiwana rozkładu log-jednostajnego na [a, b]: (b - a) / ln(b/a).
  const longMean = (b - a) / Math.log(b / a);
  return [4, 11, Math.min(b, longMean)];
}

/**
 * Udział powierzchni planszy zajęty przez elementy z koszyka długiego.
 *
 * Waga koszyka i maxLength NIE są niezależne: przy maxLength = 300 i wadze 8%
 * kilkanaście węży zajęłoby większość planszy. Konfigurator liczy tę wartość
 * na żywo i ostrzega po przekroczeniu 0.25 (§7, §11).
 */
export function longAreaShare(params: GeneratorParams): number {
  const [wShort, wMedium, wLong] = params.bucketWeights;
  const [mShort, mMedium, mLong] = bucketMeans(params.maxLength);
  const overallMean = wShort * mShort + wMedium * mMedium + wLong * mLong;
  if (overallMean <= 0) return 0;
  return (wLong * mLong) / overallMean;
}

/** Oczekiwana liczba elementów przy pełnym pokryciu: W·H / średnia długość. */
export function expectedPieceCount(params: GeneratorParams): number {
  const [wShort, wMedium, wLong] = params.bucketWeights;
  const [mShort, mMedium, mLong] = bucketMeans(params.maxLength);
  const mean = wShort * mShort + wMedium * mMedium + wLong * mLong;
  if (mean <= 0) return 0;
  return Math.round((params.width * params.height) / mean);
}
```

- [ ] **Krok 4: Uruchom testy — mają przejść**

```bash
npm run test:core -- lengths
```

Oczekiwane: PASS (7 testów).

- [ ] **Krok 5: Commit**

```bash
git add -A
git commit -m "Dodaj rozkład długości elementów"
```

---

### Task 3: Test kształtu resztki

**Files:**
- Create: `src/core/decompose.ts`
- Test: `src/core/decompose.spec.ts`

**Interfaces:**
- Produces:
  - `isDecomposable(cells: ReadonlySet<number>, width: number, height: number): boolean`
  - `wouldStrand(owner: Int32Array, width: number, height: number, path: readonly Coord[]): boolean`

Naiwny test „czy jakaś komórka została bez sąsiadów" **nie wystarcza**.
Kontrprzykład z §7: pentomino w kształcie plusa — pięć komórek, wszystkie
spójne, żadna nieizolowana, a rozkład na ścieżki ≥ 2 nie istnieje. Ścieżka
przez środek ma najwyżej 3 komórki, a dwa pozostałe ramiona nie sąsiadują.

- [ ] **Krok 1: Napisz failujące testy (§12.12c)**

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
  it('uznaje zbiór pusty za rozkładalny', () => {
    expect(isDecomposable(new Set(), W, H)).toBe(true);
  });

  it('odrzuca pojedynczą komórkę', () => {
    expect(isDecomposable(setOf([3, 3]), W, H)).toBe(false);
  });

  it('przyjmuje domino', () => {
    expect(isDecomposable(setOf([3, 3], [3, 4]), W, H)).toBe(true);
  });

  it('przyjmuje kwadrat 2x2', () => {
    expect(isDecomposable(setOf([1, 1], [2, 1], [1, 2], [2, 2]), W, H)).toBe(true);
  });

  // §12.12c — plus-pentomino: spójne, żadna komórka nieizolowana,
  // a rozkładu na ścieżki >= 2 nie ma. Naiwny test izolacji tego NIE łapie.
  it('odrzuca pentomino w kształcie plusa', () => {
    const plus = setOf([3, 2], [2, 3], [3, 3], [4, 3], [3, 4]);
    expect(isDecomposable(plus, W, H)).toBe(false);
  });

  // T-tetromino: środek + trzy ramiona. Ścieżka 2 zjada dwa ramiona przez środek,
  // trzecie ramię zostaje samo → nierozkładalne.
  it('odrzuca tetromino T', () => {
    const t = setOf([2, 3], [3, 3], [4, 3], [3, 4]);
    expect(isDecomposable(t, W, H)).toBe(false);
  });

  it('przyjmuje trzy komórki w linii', () => {
    expect(isDecomposable(setOf([1, 1], [2, 1], [3, 1]), W, H)).toBe(true);
  });

  it('odrzuca dwa rozłączne fragmenty, gdy jeden jest pojedynczy', () => {
    expect(isDecomposable(setOf([0, 0], [1, 0], [5, 5]), W, H)).toBe(false);
  });

  it('przyjmuje dwa rozłączne domina', () => {
    expect(isDecomposable(setOf([0, 0], [1, 0], [5, 5], [5, 6]), W, H)).toBe(true);
  });
});

describe('wouldStrand', () => {
  it('nie zgłasza problemu, gdy resztka jest duża', () => {
    const owner = new Int32Array(W * H).fill(EMPTY);
    const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    expect(wouldStrand(owner, W, H, path)).toBe(false);
  });

  it('wykrywa osierocenie pojedynczej komórki w rogu', () => {
    const owner = new Int32Array(W * H).fill(0); // wszystko przypisane
    // Wolne zostają: (0,0), (1,0), (0,1) — ścieżka zabiera (1,0) i (0,1),
    // zostawiając (0,0) samą.
    owner[at(0, 0)] = EMPTY;
    owner[at(1, 0)] = EMPTY;
    owner[at(0, 1)] = EMPTY;
    const path = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
    expect(wouldStrand(owner, W, H, path)).toBe(true);
  });

  it('wykrywa osierocenie plusa', () => {
    const owner = new Int32Array(W * H).fill(0);
    for (const [x, y] of [[3, 2], [2, 3], [3, 3], [4, 3], [3, 4], [3, 1], [3, 0]] as const) {
      owner[at(x, y)] = EMPTY;
    }
    // Ścieżka zabiera szyjkę (3,1)-(3,0), zostawiając czysty plus.
    const path = [{ x: 3, y: 0 }, { x: 3, y: 1 }];
    expect(wouldStrand(owner, W, H, path)).toBe(true);
  });
});
```

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npm run test:core -- decompose
```

Oczekiwane: FAIL — brak modułu `./decompose`.

- [ ] **Krok 3: Zaimplementuj test resztki**

```typescript
// src/core/decompose.ts
import { isInside } from './geometry';
import { Coord, DIR_VECTORS, EMPTY } from './types';

/** Rozmiar fragmentu, powyżej którego zakładamy rozkładalność bez sprawdzania. */
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
 * Czy zbiór komórek da się rozłożyć na ścieżki o długości ≥ 2?
 *
 * Przeszukiwanie wyczerpujące — stosowane wyłącznie do małych fragmentów
 * (do ośmiu komórek), bo tylko takie potrafią być nierozkładalne w sposób,
 * którego nie widać z sąsiedztwa. Najmniejsze kontrprzykłady to tetromino T
 * i pentomino w kształcie plusa: spójne, bez komórek izolowanych, a rozkładu
 * brak (§7).
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
 * Czy wycięcie tej ścieżki zostawi w nieprzypisanej reszcie fragment,
 * którego nie da się rozłożyć na ścieżki ≥ 2?
 *
 * Sprawdzamy wyłącznie otoczenie ścieżki — koszt rzędu jej obwodu. Fragmenty
 * większe niż SMALL_FRAGMENT_LIMIT przepuszczamy: zakładamy, że się rozłożą,
 * a gdyby nie, wyłapie to ograniczony nawrót w generatorze i solver w Slice 3.
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

      // Flood fill ograniczony rozmiarem: interesują nas tylko małe fragmenty.
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

- [ ] **Krok 4: Uruchom testy — mają przejść**

```bash
npm run test:core -- decompose
```

Oczekiwane: PASS (12 testów).

- [ ] **Krok 5: Commit**

```bash
git add -A
git commit -m "Dodaj test rozkładalności resztki planszy"
```

---

### Task 4: Wzrost ścieżki

**Files:**
- Create: `src/core/shapes.ts`
- Test: `src/core/shapes.spec.ts`

**Interfaces:**
- Consumes: `Rng`, `weightedPick`, `wouldStrand`, `DIR_VECTORS`.
- Produces:
  - `growPath(ctx: GrowthContext): Coord[]` gdzie
    `interface GrowthContext { owner: Int32Array; width: number; height: number; head: Coord; neck: Coord; targetLength: number; params: GeneratorParams; rng: Rng }`

Wagi kandydatów, dokładnie jak zmierzono w prototypie:

- ruch **w głąb** (wzdłuż przeciwnego kierunku wyjazdu): waga `1`,
- ruch **w bok**: waga `lateralWeight` (domyślnie 3) — bok buduje kształt,
  a ruch w głąb odcina ścieżkę od frontiera,
- kontynuacja **prosto**: mnożnik `straightBias / (1 - straightBias)`,
- **Warnsdorff**: mnożnik `warnsdorff^(3 - liczba wolnych sąsiadów)`.

- [ ] **Krok 1: Napisz failujące testy (§12.9, §12.10)**

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
  it('zaczyna od głowy i szyi, w tej kolejności', () => {
    const path = growPath({
      owner: emptyOwner(12, 12), width: 12, height: 12,
      head: { x: 5, y: 0 }, neck: { x: 5, y: 1 },
      targetLength: 5, params, rng: mulberry32(1),
    });
    expect(path[0]).toEqual({ x: 5, y: 0 });
    expect(path[1]).toEqual({ x: 5, y: 1 });
  });

  it('nigdy nie odwiedza komórki dwukrotnie (§12.10)', () => {
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

  it('buduje ścieżkę ciągłą ortogonalnie', () => {
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

  it('nie wchodzi na komórki przypisane', () => {
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

  // §12.9 — długość skrajna 2 i akceptacja krótszego elementu, gdy wzrost utknie.
  it('oddaje dokładnie dwie komórki przy targetLength = 2', () => {
    const path = growPath({
      owner: emptyOwner(12, 12), width: 12, height: 12,
      head: { x: 0, y: 0 }, neck: { x: 0, y: 1 },
      targetLength: 2, params, rng: mulberry32(4),
    });
    expect(path.length).toBe(2);
  });

  it('akceptuje krótszą ścieżkę, gdy nie ma dokąd rosnąć', () => {
    // Plansza 2x2, wolne tylko (0,0) i (0,1) — dłużej się nie da.
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

  it('respektuje targetLength jako górną granicę', () => {
    for (let seed = 0; seed < 50; seed++) {
      const path = growPath({
        owner: emptyOwner(12, 12), width: 12, height: 12,
        head: { x: 5, y: 0 }, neck: { x: 5, y: 1 },
        targetLength: 7, params, rng: mulberry32(seed),
      });
      expect(path.length).toBeLessThanOrEqual(7);
    }
  });

  // Warnsdorff steruje kształtem: przy sile 0 ścieżki są prostsze i częściej
  // fragmentują resztę. Test pilnuje, że parametr w ogóle działa.
  it('zmienia kształt wraz z siłą Warnsdorffa', () => {
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

  // §12.22 — straightBias = 1 nie może dać wagi nieskończonej ani NaN.
  it('przeżywa skrajny stopień połamania', () => {
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

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npm run test:core -- shapes
```

Oczekiwane: FAIL — brak modułu `./shapes`.

- [ ] **Krok 3: Zaimplementuj wzrost**

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
  /** Komórka z grotem. */
  head: Coord;
  /** Pierwsza komórka ciała — leży ZA grotem. */
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
 * Mnożnik za kontynuację prosto.
 *
 * PUŁAPKA: naiwne `straightBias / (1 - straightBias)` przy straightBias = 1
 * daje dzielenie przez zero, a test §12.22 wymaga, żeby krańce działały.
 */
function straightMultiplier(straightBias: number): number {
  const b = Math.min(0.999, Math.max(0, straightBias));
  return b / (1 - b);
}

/**
 * Hoduje ciało elementu od szyi w głąb obszaru nieprzypisanego.
 *
 * Ciało NIE ma ograniczeń geometrycznych — legalność zależy wyłącznie od głowy
 * (§6), więc ścieżka może iść dokąd chce, byle po komórkach nieprzypisanych.
 * To właśnie ta swoboda daje splątane kształty.
 *
 * Wagi kandydatów:
 *  - ruch w bok ma wagę `lateralWeight`, ruch w głąb wagę 1 — bok buduje
 *    kształt, głąb odcina ścieżkę od frontiera,
 *  - kontynuacja prosto dostaje mnożnik ze `straightBias`,
 *  - Warnsdorff: `warnsdorff^(3 - liczba wolnych sąsiadów)` — zjada ślepe
 *    uliczki, zanim zdążą się zamknąć. Bez niego 1 plansza na 30 nie domyka
 *    się wcale (§7), więc to nie jest strojenie, tylko część algorytmu.
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

    if (candidates.length === 0) break; // krótszy element jest akceptowalny

    const picked = weightedPick(rng, candidates, (c) => c.weight);
    path.push(picked.cell);
    used.add(picked.cell.y * width + picked.cell.x);
    lastStep = picked.step;
  }

  return path;
}

/**
 * Skraca ścieżkę tak długo, aż przestanie osierocać nierozkładalny fragment.
 * Zwraca null, gdy nawet dwuelementowy początek osierocą resztę.
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

- [ ] **Krok 4: Uruchom testy — mają przejść**

```bash
npm run test:core -- shapes
```

Oczekiwane: PASS (9 testów).

- [ ] **Krok 5: Commit**

```bash
git add -A
git commit -m "Dodaj wzrost ścieżki z regułą Warnsdorffa"
```

---

### Task 5: Pętla wycinania, nawroty i restarty

**Files:**
- Create: `src/core/generator.ts`
- Test: `src/core/generator.spec.ts`

**Interfaces:**
- Consumes: `Skyline`, `drawTargetLength`, `growPath`, `trimToSafe`,
  `createBoard`, `validateBoard`.
- Produces:
  - `generate(params: GeneratorParams, budget?: GenerationBudget): GenerationResult`
  - `interface GenerationBudget { maxBacktracks: number; maxRestarts: number }`
    (domyślnie `{ maxBacktracks: 3000, maxRestarts: 5 }`)
  - `interface GenerationResult { board: Board; report: GenerationReport; complete: boolean }`
  - `defaultParams(width: number, height: number, seed: number): GeneratorParams`

- [ ] **Krok 1: Napisz failujące testy (§12.11, 12a, 12b, 12d, 12e, 13, 20, 21)**

```typescript
// src/core/generator.spec.ts
import { coveredCells, validateBoard } from './board';
import { defaultParams, generate } from './generator';

describe('generate — niezmienniki', () => {
  // §12.12a — najważniejszy niezmiennik generatora.
  it('pokrywa planszę w 100% na wielu ziarnach i rozmiarach', () => {
    for (const [w, h] of [[10, 10], [25, 25], [25, 50], [40, 20]] as const) {
      for (let seed = 1; seed <= 15; seed++) {
        const { board, complete } = generate(defaultParams(w, h, seed));
        expect(complete).toBe(true);
        expect(validateBoard(board)).toEqual([]);
        expect(coveredCells(board)).toBe(w * h);
      }
    }
  });

  // §12.12b — każdy element ma co najmniej 2 komórki.
  it('nigdy nie produkuje elementu jednokomórkowego', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { board } = generate(defaultParams(20, 20, seed));
      for (const p of board.pieces.values()) expect(p.cells.length).toBeGreaterThanOrEqual(2);
    }
  });

  // §12.13 — determinizm.
  it('daje identyczną planszę dla tego samego ziarna', () => {
    const a = generate(defaultParams(25, 25, 1234));
    const b = generate(defaultParams(25, 25, 1234));
    expect([...a.board.occupancy]).toEqual([...b.board.occupancy]);
    expect(a.board.pieces.size).toBe(b.board.pieces.size);
    for (const [id, p] of a.board.pieces) {
      expect(b.board.pieces.get(id)!.cells).toEqual(p.cells);
      expect(b.board.pieces.get(id)!.dir).toBe(p.dir);
    }
  });

  it('daje różne plansze dla różnych ziaren', () => {
    const a = generate(defaultParams(25, 25, 1));
    const b = generate(defaultParams(25, 25, 2));
    expect([...a.board.occupancy]).not.toEqual([...b.board.occupancy]);
  });

  // §12.12e — nieparzysta powierzchnia planszy jest obsłużona.
  it('domyka planszę o nieparzystej powierzchni', () => {
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

  // §12.11 — plansze zdegenerowane.
  it('radzi sobie z planszami skrajnymi', () => {
    for (const [w, h] of [[1, 8], [8, 1], [2, 2], [2, 3], [3, 2]] as const) {
      const { board, complete } = generate(defaultParams(w, h, 5));
      expect(complete).toBe(true);
      expect(validateBoard(board)).toEqual([]);
    }
  });

  it('odmawia pracy na planszy jednokomórkowej zamiast się zapętlić', () => {
    const { complete } = generate(defaultParams(1, 1, 1));
    expect(complete).toBe(false); // 1 komórka to element długości 1 — niedopuszczalny
  });

  // §12.20 — skala.
  it('domyka Nightmare 100x100', () => {
    const { board, complete, report } = generate(defaultParams(100, 100, 77));
    expect(complete).toBe(true);
    expect(coveredCells(board)).toBe(10_000);
    expect(validateBoard(board)).toEqual([]);
    expect(report.generationMs).toBeLessThan(5_000);
  }, 30_000);
});

describe('generate — raport', () => {
  it('raportuje, co faktycznie osiągnięto', () => {
    const { board, report } = generate(defaultParams(30, 30, 3));
    expect(report.actualPieceCount).toBe(board.pieces.size);
    const sum = report.lengthHistogram.reduce((a, b) => a + b, 0);
    expect(sum).toBe(board.pieces.size);
    expect(report.meanLength).toBeCloseTo(900 / board.pieces.size, 5);
    expect(report.maxLength).toBe(
      Math.max(...[...board.pieces.values()].map((p) => p.cells.length)),
    );
  });

  // §12.21 — parametry, których geometria nie dopuszcza.
  it('kończy pracę przy parametrach niewykonalnych i raportuje rozbieżność', () => {
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
    // Zamówiono elementy do 5000 komórek; plansza ma 625, więc rozbieżność
    // musi być widoczna, a nie ukryta.
    expect(report.maxLength).toBeLessThan(params.maxLength);
  }, 30_000);

  // §12.22 — krańce stopnia połamania.
  it('produkuje poprawne plansze dla straightBias 0 i 1', () => {
    for (const straightBias of [0, 1]) {
      const { board, complete } = generate({ ...defaultParams(20, 20, 4), straightBias });
      expect(complete).toBe(true);
      expect(validateBoard(board)).toEqual([]);
    }
  });

  // §12.12d — wyjście z zaklinowania.
  it('liczy nawroty i restarty zamiast się zapętlać', () => {
    // Ciasny budżet zmusza generator do sięgnięcia po restart.
    const { report, complete, board } = generate(
      defaultParams(30, 30, 11),
      { maxBacktracks: 5, maxRestarts: 20 },
    );
    expect(report.backtracks).toBeGreaterThanOrEqual(0);
    if (complete) expect(coveredCells(board)).toBe(900);
  }, 30_000);
});
```

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npm run test:core -- generator
```

Oczekiwane: FAIL — brak modułu `./generator`.

- [ ] **Krok 3: Zaimplementuj generator**

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
  /** Czy plansza została domknięta w 100%. */
  complete: boolean;
}

export const DEFAULT_BUDGET: GenerationBudget = { maxBacktracks: 3000, maxRestarts: 5 };

/** Parametry domyślne — wartości skalibrowane pomiarem (§7 specyfikacji). */
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
   * Wycina jeden element. Zwraca false, gdy w żadnym z czterech kierunków
   * nie ma legalnej głowy — wtedy wołający musi się cofnąć.
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
   * Wybiera głowę: pierwszą nieprzypisaną komórkę linii, która ma
   * nieprzypisanego sąsiada za sobą. Wymóg sąsiada gwarantuje długość ≥ 2
   * z konstrukcji, bez żadnego dodatkowego warunku (§7).
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

    // Preferencja najgłębszej linii (tunelowanie) POŁOWI f0 i PODWAJA głębokość
    // grafu blokowania — to zmierzony regulator trudności, nie hipoteza (§7).
    // Wybieramy z górnej ćwiartki rankingu, żeby zachować losowość.
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

  /** Wycina do skutku albo do wyczerpania budżetu nawrotów. */
  run(maxBacktracks: number): boolean {
    while (this.remaining > 0) {
      if (this.carveOne()) continue;
      if (this.backtracks >= maxBacktracks || this.pieces.length === 0) return false;
      this.backtracks++;
      // Głębokość cofnięcia rośnie logarytmicznie: pierwsze zaklinowania są
      // zwykle płytkie, uparte wymagają zdjęcia większego kawałka.
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
 * Generuje planszę pokrytą w 100%.
 *
 * Kolejność wycinania JEST kolejnością rozwiązania — nie trzeba jej odwracać
 * (§7, twierdzenie o poprawności). Metryki zostają puste; wypełnia je
 * `withMetrics` ze Slice'a 3.
 *
 * Funkcja nigdy nie rzuca wyjątkiem i nigdy się nie zapętla: po wyczerpaniu
 * budżetu restartów oddaje najlepszy wynik z `complete: false`, żeby gra nie
 * zawiesiła się przy starcie poziomu.
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

- [ ] **Krok 4: Uruchom testy — mają przejść**

```bash
npm run test:core -- generator
```

Oczekiwane: PASS. Jeśli test pokrycia zawodzi na większych planszach,
**nie podnoś budżetu nawrotów** — sprawdź najpierw, czy Warnsdorff działa
(`warnsdorff = 4` w `defaultParams`) i czy `trimToSafe` jest wołane.
To dwie rzeczy, których brak wywala domykalność (§7).

- [ ] **Krok 5: Zmierz czas na planszy Nightmare**

```bash
npm run test:core -- generator -t "Nightmare"
```

Oczekiwane: test przechodzi. Zanotuj czas — prototyp dawał 27–38 ms mediany
i ~440 ms w p99. Rząd wielkości większy oznacza błąd, nie różnicę sprzętu.

- [ ] **Krok 6: Commit**

```bash
git add -A
git commit -m "Zaimplementuj generator plansz z pełnym pokryciem"
```

---

## Kryteria odbioru slice'a

- `npm run test:core` przechodzi; testy §12.9–13 i §12.20–23 są zielone.
- Plansza jest pokryta w **100%** na rozmiarach 10×10 … 100×100 i na
  kilkunastu ziarnach każdy — `validateBoard` nie zgłasza nic.
- Żaden element nie ma jednej komórki.
- To samo ziarno daje bitowo tę samą planszę.
- Generator nie zapętla się przy parametrach niewykonalnych i raportuje
  rozbieżność między zamówieniem a wykonaniem.
- Czas generacji Nightmare 100×100 mieści się w sekundach, nie minutach.
