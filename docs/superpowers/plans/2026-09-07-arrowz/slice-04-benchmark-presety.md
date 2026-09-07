# Slice 4 — Benchmark, presety i kalibracja

> **Dla wykonawców agentowych:** WYMAGANA PODUMIEJĘTNOŚĆ: użyj
> `superpowers:subagent-driven-development` (zalecane) albo
> `superpowers:executing-plans`. Kroki mają checkboxy (`- [ ]`).

**Cel:** Zamienić liczby z §9 specyfikacji — jawnie oznaczone jako **wstępne** —
na wartości zmierzone na docelowej implementacji, i wystawić `createLevel()`,
które zawsze oddaje planszę rozwiązywalną i mieszczącą się w paśmie trudności.

**Architektura:** Presety Easy–Extreme to **nazwane instancje
`GeneratorParams`**, nie osobna gałąź kodu — jedno źródło prawdy dla generatora
i konfiguratora. Nad generatorem stoi pętla **generuj–zmierz–odrzuć**: plansza
poza pasmem trudności jest odrzucana i losowana ponownie z innym ziarnem.
Budżet prób jest ograniczony; po jego wyczerpaniu oddajemy najlepszy wynik,
żeby gra nigdy nie zawiesiła się przy starcie poziomu.

**Stack:** TypeScript strict, Vitest, `tsx` do uruchamiania benchmarku.

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md` (§7, §9, §12
„Benchmark")

**Mapa:** `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`

## Global Constraints

Obowiązują ograniczenia z mapy wdrożenia. Krytyczne dla tego slice'a:

- **Wypełnienie nie jest parametrem** — jest zawsze 100%. Liczba linii
  i średnia długość to **jedna wielkość**: `średnia = W·H / liczba linii`.
- Progi trudności skalują się z liczbą elementów, więc używamy **udziałów**,
  nie liczb bezwzględnych.
- Rozkład czasu generacji jest skrajnie ciężkoogonowy — raportujemy **p50, p90,
  p99 i maksimum**, nigdy samą średnią.

## File Structure

| Plik | Odpowiedzialność |
|---|---|
| `src/core/presets.ts` | poziomy, formaty, `presetParams()`, pasma akceptacji |
| `src/core/level.ts` | `createLevel()`: pętla generuj–zmierz–odrzuć |
| `tools/bench.ts` | benchmark CLI: rozkład czasu, metryki, nawroty, restarty |
| `docs/benchmarks/` | raporty z pomiarów (wynik uruchomienia benchmarku) |

---

### Task 1: Presety i pasma trudności

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

Dwa **niezależne pokrętła**: poziom (rozmiar bazowy `n`) i format (`n×n` albo
`n×2n`). Format sam podnosi trudność — plansza pionowa ma krótsze korytarze
poziome, więc `f0` spada (Nightmare: 0.038 wobec 0.059). Dlatego pasma są
kalibrowane **per format**.

- [ ] **Krok 1: Napisz failujące testy**

```typescript
// src/core/presets.spec.ts
import { LEVEL_SIZES, difficultyBand, presetParams } from './presets';

describe('presetParams', () => {
  it('daje rozmiary zgodne ze specyfikacją', () => {
    expect(presetParams('easy', 'square', 1)).toMatchObject({ width: 25, height: 25 });
    expect(presetParams('easy', 'tall', 1)).toMatchObject({ width: 25, height: 50 });
    expect(presetParams('nightmare', 'square', 1)).toMatchObject({ width: 100, height: 100 });
    expect(presetParams('nightmare', 'tall', 1)).toMatchObject({ width: 100, height: 200 });
  });

  it('skaluje maxLength z dłuższym bokiem', () => {
    expect(presetParams('easy', 'tall', 1).maxLength).toBe(Math.round(2.5 * 50));
    expect(presetParams('medium', 'square', 1).maxLength).toBe(Math.round(2.5 * 50));
  });

  it('używa wag skalibrowanych wzrokowo', () => {
    expect(presetParams('hard', 'square', 1).bucketWeights).toEqual([0.5, 0.2, 0.3]);
    expect(presetParams('hard', 'square', 1).warnsdorff).toBe(4);
  });

  it('przenosi ziarno', () => {
    expect(presetParams('easy', 'square', 4242).seed).toBe(4242);
  });

  // Easy potrzebuje SŁABSZEGO tunelowania: przy pełnym tunelowaniu f0 spadło
  // do 0.16 zamiast zamierzonych >= 0.35 (§7).
  it('osłabia tunelowanie na najniższym poziomie', () => {
    expect(presetParams('easy', 'square', 1).headBias).toBe(0);
    expect(presetParams('nightmare', 'square', 1).headBias).toBe(1);
  });

  it('zna wszystkie rozmiary bazowe', () => {
    expect(LEVEL_SIZES).toEqual({ easy: 25, medium: 50, hard: 75, nightmare: 100, extreme: 200 });
  });

  // Extreme istnieje tylko jako kwadrat — sprawdzian górnej granicy.
  it('nie wystawia formatu pionowego dla Extreme', () => {
    expect(() => presetParams('extreme', 'tall', 1)).toThrow(/tylko w wariancie kwadratowym/i);
  });
});

describe('difficultyBand', () => {
  it('opada wraz z poziomem', () => {
    const easy = difficultyBand('easy', 'square');
    const nightmare = difficultyBand('nightmare', 'square');
    expect(easy.f0Min).toBeGreaterThan(nightmare.f0Min);
    expect(easy.f0Max).toBeGreaterThan(nightmare.f0Max);
  });

  it('jest ciaśniejsze dla formatu pionowego', () => {
    expect(difficultyBand('medium', 'tall').f0Max).toBeLessThan(
      difficultyBand('medium', 'square').f0Max,
    );
  });

  it('zawsze zostawia niepuste pasmo', () => {
    for (const level of ['easy', 'medium', 'hard', 'nightmare'] as const) {
      for (const format of ['square', 'tall'] as const) {
        const band = difficultyBand(level, format);
        expect(band.f0Max).toBeGreaterThan(band.f0Min);
      }
    }
  });
});
```

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npm run test:core -- presets
```

Oczekiwane: FAIL — brak modułu `./presets`.

- [ ] **Krok 3: Zaimplementuj presety**

```typescript
// src/core/presets.ts
import { GeneratorParams } from './types';

export type LevelId = 'easy' | 'medium' | 'hard' | 'nightmare' | 'extreme';
export type BoardFormat = 'square' | 'tall';

/** Rozmiar bazowy `n`. Format decyduje, czy plansza to n×n czy n×2n. */
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
 * Pasma `f0` przyjęte jako punkt wyjścia. Wartości środkowe pochodzą z tabel
 * §9 specyfikacji (zmierzonych prototypem); pasmo to ±60% wokół nich, bo
 * implementacja jest inna i dokładne trafienie byłoby przypadkiem.
 *
 * Zadanie 4 tego slice'a ZASTĘPUJE te liczby wartościami zmierzonymi na
 * docelowej implementacji. Do tego czasu są tym, czym są: hipotezą.
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
    throw new Error('Poziom Extreme istnieje tylko w wariancie kwadratowym.');
  }
  const n = LEVEL_SIZES[level];
  const width = n;
  const height = format === 'tall' ? n * 2 : n;

  return {
    width,
    height,
    maxLength: Math.round(2.5 * Math.max(width, height)),
    // Wagi skalibrowane WZROKOWO na rendererze SVG, nie pod ogon czasu
    // generacji: dają gęste groty plus wyraźne długie węże (§7).
    bucketWeights: [0.5, 0.2, 0.3],
    straightBias: 0.6,
    lateralWeight: 3,
    warnsdorff: 4,
    // Easy dostaje słabsze tunelowanie, bo przy pełnym f0 spada do 0.16
    // zamiast zamierzonych >= 0.35 (§7).
    headBias: level === 'easy' ? 0 : 1,
    seed,
  };
}

export const ALL_LEVELS: readonly LevelId[] = ['easy', 'medium', 'hard', 'nightmare', 'extreme'];

/** Formaty dostępne dla poziomu. Extreme tylko kwadrat. */
export function formatsFor(level: LevelId): readonly BoardFormat[] {
  return level === 'extreme' ? ['square'] : ['square', 'tall'];
}
```

- [ ] **Krok 4: Uruchom testy — mają przejść**

```bash
npm run test:core -- presets
```

Oczekiwane: PASS (9 testów).

- [ ] **Krok 5: Commit**

```bash
git add -A
git commit -m "Dodaj presety poziomów i pasma trudności"
```

---

### Task 2: Pętla generuj–zmierz–odrzuć

**Files:**
- Create: `src/core/level.ts`
- Test: `src/core/level.spec.ts`

**Interfaces:**
- Consumes: `generate`, `withMetrics`, `solve`, `presetParams`, `difficultyBand`.
- Produces:
  - `interface LevelResult { board: Board; report: GenerationReport; attempts: number; inBand: boolean }`
  - `createLevel(level: LevelId, format: BoardFormat, seed: number, budget?: number): LevelResult`
  - `createCustomLevel(params: GeneratorParams, budget?: number): LevelResult` —
    używane przez konfigurator (Slice 8), bez pasma trudności

- [ ] **Krok 1: Napisz failujące testy**

```typescript
// src/core/level.spec.ts
import { validateBoard } from './board';
import { createCustomLevel, createLevel } from './level';
import { defaultParams } from './generator';
import { difficultyBand } from './presets';
import { solve } from './solver';

describe('createLevel', () => {
  it('oddaje planszę rozwiązywalną z policzonymi metrykami', () => {
    const { board } = createLevel('easy', 'square', 1);
    expect(validateBoard(board)).toEqual([]);
    expect(solve(board).solvable).toBe(true);
    expect(board.metrics.n).toBe(board.pieces.size);
    expect(board.metrics.f0).toBeGreaterThan(0);
  }, 30_000);

  it('jest deterministyczne', () => {
    const a = createLevel('easy', 'square', 99);
    const b = createLevel('easy', 'square', 99);
    expect([...a.board.occupancy]).toEqual([...b.board.occupancy]);
    expect(a.attempts).toBe(b.attempts);
  }, 30_000);

  it('trafia w pasmo trudności albo raportuje, że nie trafiło', () => {
    const band = difficultyBand('easy', 'square');
    const { board, inBand } = createLevel('easy', 'square', 7);
    if (inBand) {
      expect(board.metrics.f0).toBeGreaterThanOrEqual(band.f0Min);
      expect(board.metrics.f0).toBeLessThanOrEqual(band.f0Max);
    }
    // Nawet gdy nie trafiło, plansza MUSI być grywalna — gra nie może
    // zawiesić się przy starcie poziomu.
    expect(solve(board).solvable).toBe(true);
  }, 30_000);

  it('nigdy nie przekracza budżetu prób', () => {
    const { attempts } = createLevel('easy', 'square', 5, 3);
    expect(attempts).toBeLessThanOrEqual(3);
  }, 30_000);

  it('obsługuje format pionowy', () => {
    const { board } = createLevel('easy', 'tall', 2);
    expect(board.width).toBe(25);
    expect(board.height).toBe(50);
    expect(validateBoard(board)).toEqual([]);
  }, 30_000);
});

describe('createCustomLevel', () => {
  it('nie stosuje pasma trudności', () => {
    // Plansza 12x12 nie odpowiada żadnemu presetowi — musi mimo to powstać.
    const { board, inBand } = createCustomLevel(defaultParams(12, 12, 3));
    expect(validateBoard(board)).toEqual([]);
    expect(inBand).toBe(true); // brak pasma = zawsze w paśmie
  }, 30_000);

  it('oddaje najlepszy wynik nawet przy parametrach niewykonalnych', () => {
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

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npm run test:core -- level
```

Oczekiwane: FAIL — brak modułu `./level`.

- [ ] **Krok 3: Zaimplementuj pętlę akceptacji**

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
  /** Ile plansz trzeba było wygenerować, zanim któraś trafiła w pasmo. */
  attempts: number;
  inBand: boolean;
}

const DEFAULT_ATTEMPTS = 6;

/** Odległość od pasma; 0 oznacza trafienie. Służy do wyboru najlepszej próby. */
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
    // Kolejne próby dostają pochodne ziarno, żeby całość pozostała
    // deterministyczna względem ziarna wejściowego.
    const seeded = { ...params, seed: params.seed + (attempt - 1) * 7_919 };
    const { board: raw, report, complete } = generate(seeded, budget);
    const board = withMetrics(raw);

    // Weryfikacja jest niezależna od generatora — to nie jest asercja
    // o zaufaniu, tylko warunek wpuszczenia planszy do gry (§8).
    const solvable = complete && solve(board).solvable;
    const distance = solvable ? bandDistance(board.metrics.f0, band) : Number.POSITIVE_INFINITY;
    const candidate: LevelResult = { board, report, attempts: attempt, inBand: distance === 0 };

    if (solvable && distance === 0) return candidate;

    // Plansze nierozwiązywalne mają odległość nieskończoną, więc nigdy nie
    // wygrają wyboru — nie trzeba ich odsiewać osobnym warunkiem.
    const bestDistance = best
      ? bandDistance(best.board.metrics.f0, band)
      : Number.POSITIVE_INFINITY;
    if (distance < bestDistance) best = candidate;
  }

  // Budżet wyczerpany — oddajemy najlepszy wynik. Gra nigdy nie zawiesza się
  // przy starcie poziomu, choćby kosztem planszy poza pasmem (§7).
  return { ...best!, attempts: maxAttempts, inBand: false };
}

/** Plansza dla presetu, z pętlą generuj–zmierz–odrzuć. */
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
 * Plansza dla parametrów z konfiguratora.
 *
 * Bez pasma trudności: gracz sam ustawił parametry i ma dostać dokładnie to,
 * o co poprosił — razem z raportem, co faktycznie wyszło (§11).
 */
export function createCustomLevel(
  params: GeneratorParams,
  maxAttempts = 2,
): LevelResult {
  return generateInBand(params, null, maxAttempts);
}
```

- [ ] **Krok 4: Uruchom testy — mają przejść**

```bash
npm run test:core -- level
```

Oczekiwane: PASS (7 testów).

- [ ] **Krok 5: Commit**

```bash
git add -A
git commit -m "Dodaj pętlę generuj-zmierz-odrzuć dla poziomów"
```

---

### Task 3: Benchmark

**Files:**
- Create: `tools/bench.ts`
- Modify: `package.json` (skrypt `bench`, devDependency `tsx`)

**Interfaces:**
- Consumes: `presetParams`, `generate`, `computeMetrics`, `estimateMinFree`.
- Produces: raport tekstowy na stdout, opcjonalnie zapis do
  `docs/benchmarks/<data>-<opis>.md`.

Benchmark **nie jest testem** — jest krokiem implementacji (§12). Jego wynik
zastępuje liczby w `F0_TARGETS` i jest podstawą do kalibracji punktacji
w Slice 5.

- [ ] **Krok 1: Dodaj `tsx` i skrypt**

```bash
npm install --save-dev tsx
```

W `package.json`, w `scripts`:

```json
{
  "bench": "tsx tools/bench.ts"
}
```

- [ ] **Krok 2: Napisz benchmark**

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
      throw new Error(`Plansza ${level}/${format} ziarno ${50_000 + run} NIEROZWIĄZYWALNA`);
    }
    last = metrics;
    lastPieces = result.board.pieces.size;
    lastMean = result.report.meanLength;
    lastMax = result.report.maxLength;
    lastHistogram = result.report.lengthHistogram;
    // minFree jest stochastyczna i kosztowna — liczymy ją raz na wiersz.
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
  lines.push(`# Benchmark generatora — ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push(`Przebiegów na wiersz: ${runs}. Node ${process.version}.`);
  lines.push('');
  lines.push('## Metryki trudności');
  lines.push('');
  lines.push('| Poziom | plansza | elem. | śr. dł. | max dł. | f0 | almost1 | D | korytarz | H(dir) | H(len) |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    lines.push(
      `| ${r.label} | ${r.width}×${r.height} | ${r.pieces} | ${r.meanLength.toFixed(1)} | ` +
        `${r.maxLength} | ${r.f0.toFixed(3)} | ${(100 * r.almost1Share).toFixed(0)}% | ${r.depth} | ` +
        `${r.meanCorridorLen.toFixed(1)} | ${r.dirEntropy.toFixed(2)} | ${r.lenEntropy.toFixed(2)} |`,
    );
  }
  lines.push('');
  lines.push('## Czas generacji i odporność');
  lines.push('');
  lines.push('| Poziom | p50 | p90 | p99 | max | nawroty p99 | restarty | porażki |');
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
  lines.push('## Rozkład długości (2–6 / 7–15 / 16–49 / 50+)');
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
    process.stderr.write(`mierzę ${level}/${format}…\n`);
    rows.push(measure(level, format, runs));
  }
}

const report = formatReport(rows, runs);
console.log(report);
if (out) {
  writeFileSync(out, report + '\n');
  process.stderr.write(`\nzapisano do ${out}\n`);
}
```

- [ ] **Krok 3: Uruchom benchmark na małych poziomach**

```bash
npm run bench -- --only=easy --runs=10
```

Oczekiwane: dwie tabele i rozkład długości, zero porażek.

- [ ] **Krok 4: Commit**

```bash
git add -A
git commit -m "Dodaj benchmark generatora"
```

---

### Task 4: Kalibracja pasm trudności

**Files:**
- Create: `docs/benchmarks/2026-09-07-generator.md` (wynik uruchomienia)
- Modify: `src/core/presets.ts` (`F0_TARGETS`)

**Interfaces:**
- Produces: `F0_TARGETS` oparte na **pomiarze docelowej implementacji**, a nie
  na tabelach z prototypu.

- [ ] **Krok 1: Zbierz pełny pomiar**

```bash
mkdir -p docs/benchmarks
npm run bench -- --runs=30 --out=docs/benchmarks/2026-09-07-generator.md
```

Poziom Extreme 200×200 potrafi zająć kilka minut przy 30 przebiegach —
to normalne (prototyp: p99 ≈ 2.1 s na planszę).

- [ ] **Krok 2: Porównaj z tabelami §9 specyfikacji**

Sprawdź trzy rzeczy i zanotuj rozbieżności w nagłówku raportu:

1. **`f0` opada wraz z poziomem** i jest niższe w formacie pionowym.
   Jeśli nie opada, tunelowanie (`headBias`) nie działa.
2. **~72% elementów ma 2–6 komórek, ~2% przekracza 50.**
   Jeśli długich brak, rozkład długości został po cichu obcięty (§12.9b).
3. **Zero porażek generacji** na wszystkich poziomach.
   Jedna porażka na 30 oznacza, że Warnsdorff jest wyłączony albo zbyt słaby.

- [ ] **Krok 3: Wstaw zmierzone wartości do `F0_TARGETS`**

Zastąp wartości w `src/core/presets.ts` medianami z kolumny `f0` raportu.
Zostaw komentarz z datą pomiaru i liczbą przebiegów:

```typescript
/**
 * Zmierzone na docelowej implementacji: docs/benchmarks/2026-09-07-generator.md
 * (30 przebiegów na wiersz). Zastępuje wstępne wartości z §9 specyfikacji.
 */
const F0_TARGETS: Record<LevelId, Record<BoardFormat, number>> = {
  // ... wartości z raportu
};
```

- [ ] **Krok 4: Sprawdź, że pasma są trafialne**

```bash
npm run test:core -- level
```

Dopisz test pilnujący, że dla każdego presetu pierwsza próba trafia w pasmo
przynajmniej w połowie przypadków — inaczej pętla akceptacji marnuje czas:

```typescript
// dopisz do src/core/level.spec.ts
describe('trafialność pasm', () => {
  it('trafia w pasmo bez wielokrotnych prób', () => {
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

- [ ] **Krok 5: Zaktualizuj specyfikację**

Dopisz w §9 specyfikacji zdanie odsyłające do raportu, żeby tabele nie
udawały aktualnych:

```markdown
> **Pomiar na implementacji docelowej (2026-09-07):**
> `docs/benchmarks/2026-09-07-generator.md`. Tabele poniżej pochodzą
> z prototypu i pozostają jako punkt odniesienia.
```

- [ ] **Krok 6: Commit**

```bash
git add -A
git commit -m "Skalibruj pasma trudności pomiarem implementacji"
```

---

## Kryteria odbioru slice'a

- `npm run bench -- --runs=30` kończy się bez porażek generacji na wszystkich
  poziomach i formatach.
- Raport leży w `docs/benchmarks/` i jest zacommitowany.
- `F0_TARGETS` pochodzi z pomiaru, nie z prototypu; komentarz podaje datę
  i liczbę przebiegów.
- `createLevel` zawsze oddaje planszę rozwiązywalną — także gdy nie trafi
  w pasmo.
- `createLevel` jest deterministyczne względem ziarna, razem z liczbą prób.
- Rozkład długości ma ciężki ogon: ~72% krótkich i ~2% powyżej 50 komórek.
