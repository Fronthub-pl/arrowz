# Slice 5 — Pętla gry i punktacja

> **Dla wykonawców agentowych:** WYMAGANA PODUMIEJĘTNOŚĆ: użyj
> `superpowers:subagent-driven-development` (zalecane) albo
> `superpowers:executing-plans`. Kroki mają checkboxy (`- [ ]`).

**Cel:** Kompletna gra jako **czysty reduktor** — grywalna z poziomu testu,
zanim powstanie choćby jeden piksel interfejsu.

**Architektura:** `game/session.ts` to reduktor bez DOM i bez efektów
ubocznych. Czas **nie jest odczytywany wewnątrz reduktora**: znacznik `at`
wchodzi jako pole akcji, a `elapsedMs` jest z niego wyliczane. Reduktor zwraca
`effect` — gotowe polecenie dla renderera, z odległością odbicia włącznie, żeby
warstwa wizualna nie musiała niczego wnioskować sama. Punkty naliczają się
**raz**, przy przejściu na `won`.

**Stack:** TypeScript strict, Vitest w Node.

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md` (§10,
§12.26–28)

**Mapa:** `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`

## Global Constraints

Obowiązują ograniczenia z mapy wdrożenia. Krytyczne dla tego slice'a:

- **Zero `Date.now()` w `game/`.** Test §12.27 wymaga, żeby ta sama sekwencja
  akcji z tymi samymi znacznikami dawała identyczny wynik **bez atrapy zegara**.
  Jeśli test potrzebuje atrapy, reduktor przestał być czysty.
- Wielokrotne kliknięcie tego samego zablokowanego elementu odejmuje życie
  **za każdym razem**. Decyzja świadoma, pokryta testem.
- Wariant na czas **nie narzuca limitu** — stoper wyłącznie mierzy.
- `streak` i `bestStreak` **nie wchodzą do wyniku**: liczba błędów jest już
  reprezentowana przez `livesLeft`.

## Uzupełnienia specyfikacji w tym slice'ie

1. **`Session.moves`** — rejestr klikniętych identyfikatorów. Bez niego Cloud
   Function ze Slice'a 10 nie ma czego odtwarzać.
2. **Mnożniki punktacji ważone różnorodnością planszy.** Formuła z §10, wzięta
   wprost, **oblewa własny test 26e** — szczegóły w Zadaniu 3.
3. **Akcja `restart` nie niesie ziarna, tylko opcjonalną planszę.** Reduktor nie
   generuje plansz: generacja trwa do pół sekundy i wymaga parametrów, których
   sesja nie zna. Nową planszę podaje warstwa wyżej.

## File Structure

| Plik | Odpowiedzialność |
|---|---|
| `src/game/session.ts` | typy sesji, `createSession`, `reduce` |
| `src/game/scoring.ts` | formuła punktacji i rozbicie wyniku |
| `src/game/replay.ts` | odtworzenie rozgrywki z ziarna i sekwencji ruchów |
| `src/game/*.spec.ts` | testy §12.26–28 |

---

### Task 1: Reduktor sesji

**Files:**
- Create: `src/game/session.ts`
- Test: `src/game/session.spec.ts`

**Interfaces:**
- Consumes: `Board`, `probeMove`, `removePiece`, `Dir` ze Slice'a 1.
- Produces:
  - `type GameMode = 'classic' | 'timed'`, `type Status = 'playing' | 'won' | 'lost'`
  - `interface Session { board: Board; initialBoard: Board; lives: number; status: Status; removed: number; startedAt: number; elapsedMs: number; mode: GameMode; streak: number; bestStreak: number; score: number; breakdown: ScoreBreakdown | null; moves: number[] }`
  - `type Action = { type: 'click'; pieceId: number; at: number } | { type: 'tick'; at: number } | { type: 'restart'; at: number; board?: Board }`
  - `type Effect = { kind: 'exit'; pieceId: number; dir: Dir } | { kind: 'bounce'; pieceId: number; distance: number; blockerId: number } | { kind: 'none' }`
  - `createSession(board: Board, mode: GameMode, startedAt: number): Session`
  - `reduce(session: Session, action: Action): { next: Session; effect: Effect }`
  - `INITIAL_LIVES = 3`

- [ ] **Krok 1: Napisz failujące testy reduktora**

```typescript
// src/game/session.spec.ts
import { withMetrics } from '../core/metrics';
import { boardOf, piece } from '../core/testing/fixtures';
import { createSession, INITIAL_LIVES, reduce, Session } from './session';

/**
 * Kolumna czterech komórek: element 0 (na górze) jest wolny,
 * element 1 (pod nim) jest przez niego zablokowany.
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
  it('startuje z trzema życiami i pustym stanem', () => {
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

describe('reduce — kliknięcie elementu wolnego', () => {
  it('usuwa element i zwraca efekt wyjazdu', () => {
    const { next, effect } = reduce(fresh(), { type: 'click', pieceId: 0, at: 2_000 });
    expect(effect).toEqual({ kind: 'exit', pieceId: 0, dir: 0 });
    expect(next.board.pieces.has(0)).toBe(false);
    expect(next.removed).toBe(1);
    expect(next.lives).toBe(3);
  });

  it('podbija serię, ale nie dolicza punktów', () => {
    const { next } = reduce(fresh(), { type: 'click', pieceId: 0, at: 2_000 });
    expect(next.streak).toBe(1);
    expect(next.bestStreak).toBe(1);
    expect(next.score).toBe(0); // §12.26a
  });

  it('aktualizuje stoper ze znacznika akcji', () => {
    const { next } = reduce(fresh(), { type: 'click', pieceId: 0, at: 3_500 });
    expect(next.elapsedMs).toBe(2_500);
  });

  it('nie rusza planszy wejściowej', () => {
    const s = fresh();
    reduce(s, { type: 'click', pieceId: 0, at: 2_000 });
    expect(s.board.pieces.has(0)).toBe(true);
  });
});

describe('reduce — kliknięcie elementu zablokowanego', () => {
  it('zostawia element, odejmuje życie i zwraca odbicie', () => {
    const { next, effect } = reduce(fresh(), { type: 'click', pieceId: 1, at: 2_000 });
    expect(effect).toEqual({ kind: 'bounce', pieceId: 1, distance: 1, blockerId: 0 });
    expect(next.board.pieces.has(1)).toBe(true);
    expect(next.lives).toBe(2);
    expect(next.removed).toBe(0);
  });

  it('zeruje serię', () => {
    // Kolumna sześciu komórek: 0 wolny, 1 blokowany przez 0, 2 blokowany przez 1.
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
    s = reduce(s, { type: 'click', pieceId: 2, at: 200 }).next; // wciąż blokowany przez 1
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(1);
  });

  // Decyzja świadoma: każde kliknięcie zablokowanego elementu kosztuje życie.
  it('odejmuje życie przy każdym kolejnym kliknięciu tego samego elementu', () => {
    let s = fresh();
    s = reduce(s, { type: 'click', pieceId: 1, at: 2_000 }).next;
    s = reduce(s, { type: 'click', pieceId: 1, at: 3_000 }).next;
    expect(s.lives).toBe(1);
    expect(s.status).toBe('playing');
  });

  it('kończy grę przegraną przy zerze żyć', () => {
    let s = fresh();
    for (const at of [2_000, 3_000, 4_000]) {
      s = reduce(s, { type: 'click', pieceId: 1, at }).next;
    }
    expect(s.lives).toBe(0);
    expect(s.status).toBe('lost');
  });
});

describe('reduce — koniec gry', () => {
  it('przechodzi na wygraną po opróżnieniu planszy', () => {
    let s = fresh();
    s = reduce(s, { type: 'click', pieceId: 0, at: 2_000 }).next;
    s = reduce(s, { type: 'click', pieceId: 1, at: 3_000 }).next;
    expect(s.board.pieces.size).toBe(0);
    expect(s.status).toBe('won');
    expect(s.score).toBeGreaterThan(0);
    expect(s.breakdown).not.toBeNull();
  });

  // §12.26b — przegrana daje zero punktów.
  it('nie przyznaje punktów za przegraną', () => {
    let s = fresh();
    for (const at of [2_000, 3_000, 4_000]) {
      s = reduce(s, { type: 'click', pieceId: 1, at }).next;
    }
    expect(s.status).toBe('lost');
    expect(s.score).toBe(0);
    expect(s.breakdown).toBeNull();
  });

  it('ignoruje kliknięcia po zakończeniu gry', () => {
    let s = fresh();
    s = reduce(s, { type: 'click', pieceId: 0, at: 2_000 }).next;
    s = reduce(s, { type: 'click', pieceId: 1, at: 3_000 }).next;
    const after = reduce(s, { type: 'click', pieceId: 0, at: 4_000 });
    expect(after.effect).toEqual({ kind: 'none' });
    expect(after.next).toBe(s);
  });

  it('ignoruje kliknięcie w nieistniejący element', () => {
    const { next, effect } = reduce(fresh(), { type: 'click', pieceId: 99, at: 2_000 });
    expect(effect).toEqual({ kind: 'none' });
    expect(next.lives).toBe(3);
  });
});

// §12.28 — tick aktualizuje wyłącznie stoper.
describe('reduce — tick', () => {
  it('aktualizuje elapsedMs i nic więcej', () => {
    const s = fresh();
    const { next, effect } = reduce(s, { type: 'tick', at: 5_500 });
    expect(effect).toEqual({ kind: 'none' });
    expect(next.elapsedMs).toBe(4_500);
    expect(next.board).toBe(s.board);
    expect(next.lives).toBe(s.lives);
    expect(next.streak).toBe(s.streak);
  });

  it('zatrzymuje stoper po zakończeniu gry', () => {
    let s = fresh();
    s = reduce(s, { type: 'click', pieceId: 0, at: 2_000 }).next;
    s = reduce(s, { type: 'click', pieceId: 1, at: 3_000 }).next;
    const frozen = reduce(s, { type: 'tick', at: 99_000 }).next;
    expect(frozen.elapsedMs).toBe(2_000);
  });
});

describe('reduce — restart', () => {
  it('przywraca planszę początkową', () => {
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

  it('przyjmuje nową planszę, gdy ją podano', () => {
    const other = withMetrics(boardOf(1, 2, [piece(0, 0, [[0, 0], [0, 1]])]));
    const r = reduce(fresh(), { type: 'restart', at: 5_000, board: other }).next;
    expect(r.board.pieces.size).toBe(1);
    expect(r.initialBoard.pieces.size).toBe(1);
  });
});

// §12.27 — determinizm względem czasu, BEZ atrapy zegara.
describe('determinizm reduktora', () => {
  it('daje ten sam wynik dla tej samej sekwencji znaczników', () => {
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

  it('rejestruje wszystkie kliknięcia, także błędne', () => {
    let s = fresh();
    s = reduce(s, { type: 'click', pieceId: 1, at: 1_500 }).next;
    s = reduce(s, { type: 'click', pieceId: 0, at: 2_000 }).next;
    expect(s.moves).toEqual([1, 0]);
  });
});
```

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npm run test:core -- session
```

Oczekiwane: FAIL — brak modułu `./session`.

- [ ] **Krok 3: Zaimplementuj reduktor**

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
  /** Plansza w stanie początkowym — potrzebna do restartu i do replayu. */
  initialBoard: Board;
  lives: number;
  status: Status;
  removed: number;
  /** Znacznik czasu przekazany z zewnątrz; reduktor nigdy nie czyta zegara. */
  startedAt: number;
  elapsedMs: number;
  mode: GameMode;
  streak: number;
  bestStreak: number;
  /** 0 przez całą rozgrywkę; wyliczany raz, przy przejściu na 'won'. */
  score: number;
  breakdown: ScoreBreakdown | null;
  /** Kolejne kliknięte identyfikatory, także błędne — podstawa weryfikacji. */
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
      // Punkty naliczają się DOKŁADNIE RAZ, przy przejściu na 'won'.
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

- [ ] **Krok 4: Uruchom testy — sesja zależy od `scoring`, więc na razie zawiodą**

```bash
npm run test:core -- session
```

Oczekiwane: FAIL — brak modułu `./scoring`. To jest sygnał do Zadania 2;
nie zaślepiaj `computeScore` atrapą.

- [ ] **Krok 5: Commit (po wykonaniu Zadania 2)**

Reduktor i punktacja są jednym cyklem czerwony–zielony, bo reduktor bez
punktacji się nie kompiluje. Commit wykonasz na końcu Zadania 2.

---

### Task 2: Punktacja odporna na plansze zdegenerowane

**Files:**
- Create: `src/game/scoring.ts`
- Test: `src/game/scoring.spec.ts`

**Interfaces:**
- Consumes: `BoardMetrics` ze Slice'a 1, metryki liczone w Slice 3.
- Produces:
  - `interface ScoreInput { metrics: BoardMetrics; width: number; height: number; livesLeft: number; mode: GameMode; elapsedMs: number }`
  - `interface ScoreBreakdown { complexity: number; livesBonus: number; timeBonus: number; total: number }`
  - `computeScore(input: ScoreInput): ScoreBreakdown`
  - `SCORE_WEIGHTS` — wagi kalibrowane benchmarkiem

#### Dlaczego formuła z §10 wymaga poprawki

Formuła ze specyfikacji, wzięta wprost, **przegrywa własny test 26e**.
Policzone na planszy 100×100 z samych pionowych domin:

| Metryka | Domina 100×100 | Nightmare 100×100 |
|---|---|---|
| `f0` | 0.020 | 0.059 |
| `almost1 / n` | ~0.98 | 0.07 |
| `D` | 49 | 32 |
| **wynik wg §10** | **~764** | **~274** |

Wszystkie trzy metryki wychodzą na planszy zdegenerowanej **lepiej**.
Przyczyna jest pojęciowa: `almost1` mierzy pokusę do błędu przy założeniu, że
gracz nie widzi wzoru. Na planszy domin wzór jest oczywisty („bierz
najwyższe"), więc pokusa jest pozorna, a nie realna.

**Poprawka:** trzy mnożniki mierzące *zwodniczość* (`f0`, `almost1`, `D`) są
ważone współczynnikiem `variety ∈ [0,1]`, liczonym z entropii rozkładu
długości i kierunków. Mnożnik `meanCorridorLen` **nie jest ważony** — wysiłek
wzrokowy jest realny niezależnie od tego, czy plansza ma wzór.

```
variety   = 0.35 · dirEntropy + 0.65 · lenEntropy
```

Wyższa waga entropii długości jest celowa: różnorodność długości jest silniejszym
sygnałem nietrywialności niż sam rozrzut kierunków (plansza z domin
skierowanych losowo wciąż jest planszą z domin).

Po poprawce: domina ≈ 125 punktów, Nightmare ≈ 250. Test 26e przechodzi
z zapasem dwukrotnym.

- [ ] **Krok 1: Napisz failujące testy (§12.26a–f)**

```typescript
// src/game/scoring.spec.ts
import { BoardMetrics } from '../core/types';
import { computeScore, ScoreInput } from './scoring';

/** Metryki zmierzone na Nightmare 100×100 (§9 + entropie z benchmarku). */
const nightmare: BoardMetrics = {
  n: 1_247,
  f0: 0.059,
  almost1: Math.round(0.07 * 1_247),
  d: 32,
  meanCorridorLen: 45,
  dirEntropy: 1.0,
  lenEntropy: 0.6,
};

/** Plansza 100×100 z 5 000 pionowych domin: jeden kierunek, jedna długość. */
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
  it('zwraca rozbicie, którego składniki mnożą się na całość', () => {
    const b = computeScore(input(nightmare));
    expect(b.total).toBe(Math.round(b.complexity * b.livesBonus * b.timeBonus));
  });

  // §12.26e — TEST ANTYEKSPLOATACYJNY.
  it('punktuje planszę z samych domin wyraźnie niżej niż Nightmare', () => {
    const real = computeScore(input(nightmare)).total;
    const degenerate = computeScore(input(dominoes)).total;
    expect(degenerate).toBeLessThan(real * 0.7);
  });

  it('nie daje się nabrać na losowe kierunki przy jednej długości', () => {
    const randomDirs = { ...dominoes, dirEntropy: 1, f0: 0.1, d: 30 };
    expect(computeScore(input(randomDirs)).total).toBeLessThan(
      computeScore(input(nightmare)).total,
    );
  });

  it('rośnie z powierzchnią planszy, nie z liczbą kliknięć', () => {
    const small = computeScore(input(nightmare, { width: 25, height: 25 })).total;
    const big = computeScore(input(nightmare, { width: 100, height: 100 })).total;
    expect(big).toBeGreaterThan(small * 8);
  });

  // §12.26c — monotoniczność względem żyć.
  it('nie maleje wraz z liczbą zachowanych żyć', () => {
    const one = computeScore(input(nightmare, { livesLeft: 1 })).total;
    const three = computeScore(input(nightmare, { livesLeft: 3 })).total;
    expect(three).toBeGreaterThan(one);
  });

  // §12.26c — monotoniczność względem czasu w wariancie na czas.
  it('nie maleje przy szybszym ukończeniu w wariancie na czas', () => {
    const slow = computeScore(input(nightmare, { mode: 'timed', elapsedMs: 3_600_000 })).total;
    const fast = computeScore(input(nightmare, { mode: 'timed', elapsedMs: 300_000 })).total;
    expect(fast).toBeGreaterThan(slow);
  });

  // §12.26d — premia czasowa ograniczona z obu stron.
  it('ogranicza premię czasową do przedziału [0.6, 1.6]', () => {
    const instant = computeScore(input(nightmare, { mode: 'timed', elapsedMs: 1 }));
    const eternal = computeScore(input(nightmare, { mode: 'timed', elapsedMs: 10 ** 9 }));
    expect(instant.timeBonus).toBeCloseTo(1.6, 6);
    expect(eternal.timeBonus).toBeCloseTo(0.6, 6);
  });

  it('ignoruje czas w wariancie klasycznym', () => {
    const fast = computeScore(input(nightmare, { elapsedMs: 1_000 }));
    const slow = computeScore(input(nightmare, { elapsedMs: 10 ** 8 }));
    expect(fast.timeBonus).toBe(1);
    expect(fast.total).toBe(slow.total);
  });

  // §12.26f — czystość.
  it('jest funkcją czystą', () => {
    const a = computeScore(input(nightmare));
    const b = computeScore(input(nightmare));
    expect(a).toEqual(b);
  });

  it('układa presety w ciąg rosnący', () => {
    // Wartości metryk z §9 dla formatu kwadratowego; entropie orientacyjne.
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

  it('nie wywraca się na planszy pustej', () => {
    const empty: BoardMetrics = {
      n: 0, f0: 0, almost1: 0, d: 0, meanCorridorLen: 0, dirEntropy: 0, lenEntropy: 0,
    };
    const b = computeScore(input(empty, { width: 1, height: 2 }));
    expect(Number.isFinite(b.total)).toBe(true);
    expect(b.total).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npm run test:core -- scoring
```

Oczekiwane: FAIL — brak modułu `./scoring`.

- [ ] **Krok 3: Zaimplementuj punktację**

```typescript
// src/game/scoring.ts
import { BoardMetrics } from '../core/types';
// Import TYLKO typu: session.ts importuje computeScore ze scoring.ts, więc
// zwykły import zrobiłby cykl modułów w czasie wykonania.
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
  /** Złożoność planszy: podstawa punktowa przed premiami. */
  complexity: number;
  /** 1.00 … 1.75 — premia za zachowane życia. */
  livesBonus: number;
  /** 1 w wariancie klasycznym, 0.6 … 1.6 w wariancie na czas. */
  timeBonus: number;
  total: number;
}

/**
 * Wagi formuły. Kalibrowane benchmarkiem tak, by presety układały się w ciąg
 * rosnący, a plansze zdegenerowane wypadały wyraźnie niżej (§10, §12.26e).
 */
export const SCORE_WEIGHTS = {
  /** Waga ciasnoty startu (1 − f0). */
  tightness: 1.0,
  /** Waga gęstości pokus do błędu (almost1 / n). */
  deception: 1.5,
  /** Waga wysiłku wzrokowego (meanCorridorLen / dłuższy bok). */
  effort: 0.5,
  /** Waga głębokości zaplątania (D / sqrt(W·H)). */
  entanglement: 0.5,
  /** Udział entropii kierunków w współczynniku różnorodności. */
  varietyDirShare: 0.35,
  /** Sekundy na element w czasie odniesienia premii czasowej. */
  secondsPerPiece: 1.5,
  /** Górne obcięcia mnożników — żaden pojedynczy parametr nie rozsadza wyniku. */
  maxTightness: 0.95,
  maxDeception: 0.35,
  maxEffort: 1,
  maxEntanglement: 1,
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Współczynnik różnorodności planszy.
 *
 * Mnożniki mierzące ZWODNICZOŚĆ (f0, almost1, D) są przez niego ważone, bo
 * plansza o oczywistym wzorze nie zwodzi nikogo, choćby jej metryki wyglądały
 * groźnie. Bez tego plansza ze 100×100 domin punktuje wyżej niż Nightmare —
 * dokładnie odwrotnie, niż wymaga test antyeksploatacyjny (§12.26e).
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
  // Wysiłek wzrokowy NIE jest ważony różnorodnością — wodzenie wzrokiem wzdłuż
  // długiego korytarza kosztuje tyle samo na planszy z wzorem i bez.
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

- [ ] **Krok 4: Uruchom testy punktacji i sesji**

```bash
npm run test:core -- scoring
npm run test:core -- session
```

Oczekiwane: PASS w obu. Jeśli test antyeksploatacyjny zawodzi, **nie
podnoś progu w teście** — sprawdź, czy mnożniki zwodniczości są przemnożone
przez `variety`.

- [ ] **Krok 5: Commit**

```bash
git add -A
git commit -m "Dodaj reduktor sesji i punktację za ukończoną planszę"
```

---

### Task 3: Odtwarzanie rozgrywki

**Files:**
- Create: `src/game/replay.ts`
- Test: `src/game/replay.spec.ts`

**Interfaces:**
- Consumes: `createLevel`/`createCustomLevel` ze Slice'a 4, `reduce`.
- Produces:
  - `interface RunRecord { level: LevelId | 'custom'; format: BoardFormat; seed: number; params?: GeneratorParams; mode: GameMode; moves: number[]; timestamps: number[]; startedAt: number }`
  - `interface RunSubmission extends RunRecord { claimedScore: number }` — używany
    po obu stronach sieci w Slice 10
  - `replayRun(record: RunRecord): Session` — odtwarza sesję od zera
  - `verifyRun(record: RunRecord, claimedScore: number): boolean`

To jest fundament weryfikacji serwerowej ze Slice'a 10: generator jest
deterministyczny, a gra konfluentna, więc serwer odtwarza rozgrywkę z ziarna
i sekwencji ruchów i przelicza wynik samodzielnie. Weryfikacja jest liniowa.

- [ ] **Krok 1: Napisz failujące testy**

```typescript
// src/game/replay.spec.ts
import { probeMove } from '../core/board';
import { createLevel } from '../core/level';
import { createSession, reduce } from './session';
import { replayRun, RunRecord, verifyRun } from './replay';

/** Rozgrywa poziom bezbłędnie i zwraca zapis przebiegu. */
function perfectRun(seed: number): { record: RunRecord; score: number } {
  const { board } = createLevel('easy', 'square', seed);
  let session = createSession(board, 'classic', 0);
  const moves: number[] = [];
  const timestamps: number[] = [];
  let at = 0;

  while (session.status === 'playing') {
    const free = [...session.board.pieces.values()].find((p) => probeMove(session.board, p).free);
    if (!free) throw new Error('konfluencja złamana — brak wolnego elementu');
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
  it('odtwarza wygraną rozgrywkę co do punktu', () => {
    const { record, score } = perfectRun(11);
    const replayed = replayRun(record);
    expect(replayed.status).toBe('won');
    expect(replayed.score).toBe(score);
    expect(replayed.lives).toBe(3);
  }, 60_000);

  it('odtwarza utratę żyć', () => {
    const { record } = perfectRun(12);
    // Wstawiamy błędny ruch: klikamy ostatni element jako pierwszy.
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
  it('potwierdza wynik uczciwy', () => {
    const { record, score } = perfectRun(13);
    expect(verifyRun(record, score)).toBe(true);
  }, 60_000);

  it('odrzuca wynik zawyżony', () => {
    const { record, score } = perfectRun(14);
    expect(verifyRun(record, score + 1)).toBe(false);
    expect(verifyRun(record, score * 10)).toBe(false);
  }, 60_000);

  it('odrzuca zapis z ruchami, które nie kończą planszy', () => {
    const { record, score } = perfectRun(15);
    const truncated = { ...record, moves: record.moves.slice(0, 3) };
    expect(verifyRun(truncated, score)).toBe(false);
  }, 60_000);

  it('odrzuca zapis z podmienionym ziarnem', () => {
    const { record, score } = perfectRun(16);
    expect(verifyRun({ ...record, seed: record.seed + 1 }, score)).toBe(false);
  }, 60_000);
});
```

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npm run test:core -- replay
```

Oczekiwane: FAIL — brak modułu `./replay`.

- [ ] **Krok 3: Zaimplementuj odtwarzanie**

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
  /** Wypełnione wyłącznie dla poziomów z konfiguratora. */
  params?: GeneratorParams;
  mode: GameMode;
  moves: number[];
  /** Znaczniki czasu kolejnych ruchów; ta sama długość co `moves`. */
  timestamps: number[];
  startedAt: number;
}

/**
 * Zapis przebiegu wysyłany na serwer razem z deklarowanym wynikiem.
 *
 * Typ mieszka TUTAJ, a nie w warstwie transportu, bo używają go obie strony:
 * klient (Slice 10, `run-submitter.ts`) i funkcja w chmurze, która odtwarza
 * rozgrywkę. Dwie kopie tego interfejsu rozjechałyby się przy pierwszej zmianie.
 */
export interface RunSubmission extends RunRecord {
  claimedScore: number;
}

function boardFor(record: RunRecord): Board {
  if (record.level === 'custom') {
    if (!record.params) throw new Error('Zapis poziomu z konfiguratora bez parametrów.');
    return createCustomLevel({ ...record.params, seed: record.seed }).board;
  }
  return createLevel(record.level, record.format, record.seed).board;
}

/**
 * Odtwarza rozgrywkę z ziarna i sekwencji ruchów.
 *
 * Możliwe, bo generator jest deterministyczny, a reduktor czysty: te same
 * wejścia dają ten sam stan końcowy, niezależnie od maszyny i zegara.
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
 * Czy zgłoszony wynik zgadza się z odtworzoną rozgrywką.
 *
 * Weryfikacja jest liniowa względem liczby ruchów, więc serwer (Slice 10)
 * może ją przeprowadzić dla każdego zapisu bez kosztu wartego uwagi.
 */
export function verifyRun(record: RunRecord, claimedScore: number): boolean {
  if (record.moves.length !== record.timestamps.length) return false;
  const session = replayRun(record);
  return session.status === 'won' && session.score === claimedScore;
}
```

- [ ] **Krok 4: Uruchom testy — mają przejść**

```bash
npm run test:core -- replay
```

Oczekiwane: PASS (6 testów).

- [ ] **Krok 5: Uruchom całość i sprawdź lint**

```bash
npm run test:core && npm run lint
```

Oczekiwane: wszystko zielone. Lint pilnuje, że `game/` nie sięgnęło po
`Date.now()` — gdyby sięgnęło, test §12.27 przestałby cokolwiek znaczyć.

- [ ] **Krok 6: Commit**

```bash
git add -A
git commit -m "Dodaj odtwarzanie i weryfikację rozgrywki"
```

---

## Kryteria odbioru slice'a

- Gra jest **grywalna z poziomu testu**: `perfectRun` przechodzi planszę Easy
  od początku do końca i dostaje punkty.
- Testy §12.26–28 są zielone, w tym antyeksploatacyjny 26e.
- `score` wynosi 0 przez całą rozgrywkę i zmienia się dokładnie raz.
- Przegrana daje zero punktów.
- Reduktor jest deterministyczny bez atrapy zegara.
- `verifyRun` odrzuca zawyżony wynik, obcięty zapis i podmienione ziarno.
