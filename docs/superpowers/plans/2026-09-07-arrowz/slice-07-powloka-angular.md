# Slice 7 — Powłoka Angular: pierwsza grywalna wersja

> **Dla wykonawców agentowych:** WYMAGANA PODUMIEJĘTNOŚĆ: użyj
> `superpowers:subagent-driven-development` (zalecane) albo
> `superpowers:executing-plans`. Kroki mają checkboxy (`- [ ]`).

**Cel:** Zagrać. Ekran startowy z wyborem poziomu, formatu i wariantu, plansza
z paskiem stanu, sterowanie zgodne z §11 i ekrany końcowe z rozbiciem wyniku.

**Architektura:** `GameStore` to cienka warstwa sygnałów **nad** czystym
reduktorem — trzyma `Session` w jednym sygnale i woła `reduce`. Cała logika
gry została w `game/`; store dokłada wyłącznie to, czego reduktor mieć nie
może: zegar, generację planszy i sterowanie rendererem. Komponenty są
standalone, zoneless i `OnPush`; nie mają własnego stanu poza widokowym.

**Stack:** Angular 22 (standalone, zoneless, signals), SVG, Vitest przez
`@angular/build:unit-test`.

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md` (§11)

**Mapa:** `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`

## Global Constraints

Obowiązują ograniczenia z mapy wdrożenia. Krytyczne dla tego slice'a:

- **Rozstrzygnięcie „ruch czy przesuwanie" musi być jednoznaczne, nie
  progowe** — na desktopie decyduje modyfikator ⌘/Ctrl, na dotyku rodzaj
  gestu. Pomyłka kosztuje życie.
- Warunek modyfikatora sprawdza `event.metaKey || event.ctrlKey`, **bez
  wykrywania systemu**. Wykrywanie służy wyłącznie do napisu w podpowiedzi;
  gdyby zawiodło, sterowanie nadal działa.
- **Zoom jest kontrolką widoczną**, nie tylko gestem: przyciski `+`, `−`
  i „dopasuj" są jedyną drogą dostępną z klawiatury i przy myszy bez kółka.
- **Wyniku nie ma na pasku podczas gry.** Punkty pojawiają się dopiero na
  ekranie wygranej, z rozbiciem na składniki.
- Wskaźnik ładowania pokazujemy **po 200 ms** — rozkład czasu generacji jest
  ciężkoogonowy i p99 sięga setek milisekund.
- Nazwy plików zgodne z konwencją Angular 2025 (`game.ts`, nie
  `game.component.ts`).

## File Structure

| Plik | Odpowiedzialność |
|---|---|
| `src/ui/game-store.ts` | sygnały nad `Session`: generacja, zegar, akcje |
| `src/ui/home.ts` | ekran startowy: poziom, format, wariant, wejście do konfiguratora |
| `src/ui/game.ts` | ekran gry: host SVG, sterowanie, spięcie z rendererem |
| `src/ui/hud.ts` | pasek stanu: serca, stoper, seria, nowa gra |
| `src/ui/zoom-controls.ts` | przyciski `+`, `−`, „dopasuj" |
| `src/ui/result-dialog.ts` | ekrany wygranej i przegranej z rozbiciem wyniku |
| `src/ui/format-time.ts` | formatowanie stopera |
| `src/app/app.routes.ts` | podpięcie komponentów pod trasy |

---

### Task 1: Store gry

**Files:**
- Create: `src/ui/game-store.ts`
- Test: `src/ui/game-store.spec.ts`

**Interfaces:**
- Consumes: `createLevel`, `createSession`, `reduce`, `Effect` z rdzenia i `game/`.
- Produces:
  - `class GameStore` z sygnałami:
    `session: Signal<Session | null>`, `loading: Signal<boolean>`,
    `lives`, `elapsedMs`, `streak`, `status`, `board`, `breakdown`
  - `seed: Signal<number>` — ziarno użytej planszy
  - metody: `start(level, format, mode, seed?): Promise<void>`,
    `click(pieceId: number): Effect`, `restart(): void`, `tick(): void`,
    `dispose(): void`
  - `provideGameStore()` — rejestracja w DI

- [ ] **Krok 1: Napisz failujące testy**

```typescript
// src/ui/game-store.spec.ts
import { TestBed } from '@angular/core/testing';
import { probeMove } from '../core/board';
import { GameStore } from './game-store';

describe('GameStore', () => {
  let store: GameStore;
  let now = 0;

  beforeEach(() => {
    now = 10_000;
    TestBed.configureTestingModule({
      providers: [GameStore, { provide: 'CLOCK', useValue: () => now }],
    });
    store = TestBed.inject(GameStore);
  });

  it('startuje bez sesji', () => {
    expect(store.session()).toBeNull();
    expect(store.loading()).toBe(false);
  });

  it('generuje planszę i zaczyna rozgrywkę', async () => {
    await store.start('easy', 'square', 'classic', 1);
    expect(store.loading()).toBe(false);
    expect(store.session()).not.toBeNull();
    expect(store.status()).toBe('playing');
    expect(store.lives()).toBe(3);
    expect(store.board()!.pieces.size).toBeGreaterThan(0);
  }, 30_000);

  it('jest deterministyczny względem ziarna', async () => {
    await store.start('easy', 'square', 'classic', 42);
    const first = store.board()!.pieces.size;
    await store.start('easy', 'square', 'classic', 42);
    expect(store.board()!.pieces.size).toBe(first);
  }, 30_000);

  it('usuwa wolny element i zwraca efekt wyjazdu', async () => {
    await store.start('easy', 'square', 'classic', 2);
    const board = store.board()!;
    const free = [...board.pieces.values()].find((p) => probeMove(board, p).free)!;
    const effect = store.click(free.id);
    expect(effect.kind).toBe('exit');
    expect(store.board()!.pieces.has(free.id)).toBe(false);
  }, 30_000);

  it('odejmuje życie za element zablokowany', async () => {
    await store.start('easy', 'square', 'classic', 3);
    const board = store.board()!;
    const blocked = [...board.pieces.values()].find((p) => !probeMove(board, p).free)!;
    const effect = store.click(blocked.id);
    expect(effect.kind).toBe('bounce');
    expect(store.lives()).toBe(2);
  }, 30_000);

  it('bierze czas z wstrzykniętego zegara, nie z Date.now', async () => {
    await store.start('easy', 'square', 'classic', 4);
    now = 15_000;
    store.tick();
    expect(store.elapsedMs()).toBe(5_000);
  }, 30_000);

  it('restartuje na tej samej planszy', async () => {
    await store.start('easy', 'square', 'classic', 5);
    const before = store.board()!.pieces.size;
    const board = store.board()!;
    const free = [...board.pieces.values()].find((p) => probeMove(board, p).free)!;
    store.click(free.id);
    store.restart();
    expect(store.board()!.pieces.size).toBe(before);
    expect(store.lives()).toBe(3);
  }, 30_000);

  it('ignoruje kliknięcia bez sesji', () => {
    expect(store.click(0).kind).toBe('none');
  });
});
```

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npx ng test --watch=false
```

Oczekiwane: FAIL — brak modułu `./game-store`.

- [ ] **Krok 3: Zaimplementuj store**

```typescript
// src/ui/game-store.ts
import { computed, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { createLevel } from '../core/level';
import { BoardFormat, LevelId } from '../core/presets';
import { Board, GeneratorParams } from '../core/types';
import { createCustomLevel } from '../core/level';
import { createSession, Effect, GameMode, reduce, Session } from '../game/session';

/**
 * Zegar jako zależność, nie jako `Date.now()` w kodzie.
 * Reduktor jest czysty (§10), więc czas musi wejść z zewnątrz — a skoro i tak
 * musi, to niech będzie podmienialny w testach.
 */
export const CLOCK = new InjectionToken<() => number>('CLOCK', {
  providedIn: 'root',
  factory: () => () => Date.now(),
});

const NO_EFFECT: Effect = { kind: 'none' };

@Injectable()
export class GameStore {
  private readonly clock = inject(CLOCK);
  private readonly state = signal<Session | null>(null);
  private readonly generating = signal(false);
  private readonly usedSeed = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly session = this.state.asReadonly();
  readonly loading = this.generating.asReadonly();
  /** Ziarno użytej planszy — bez niego nie da się odtworzyć rozgrywki (Slice 10). */
  readonly seed = this.usedSeed.asReadonly();
  readonly board = computed<Board | null>(() => this.state()?.board ?? null);
  readonly lives = computed(() => this.state()?.lives ?? 0);
  readonly status = computed(() => this.state()?.status ?? 'playing');
  readonly elapsedMs = computed(() => this.state()?.elapsedMs ?? 0);
  readonly streak = computed(() => this.state()?.streak ?? 0);
  readonly bestStreak = computed(() => this.state()?.bestStreak ?? 0);
  readonly removed = computed(() => this.state()?.removed ?? 0);
  readonly breakdown = computed(() => this.state()?.breakdown ?? null);
  readonly score = computed(() => this.state()?.score ?? 0);

  async start(
    level: LevelId,
    format: BoardFormat,
    mode: GameMode,
    seed = Math.floor(Math.random() * 2 ** 31),
  ): Promise<void> {
    this.generating.set(true);
    // Oddajemy wątek na dwie klatki, żeby przeglądarka zdążyła narysować
    // wskaźnik ładowania PRZED generacją — ta potrafi zająć setki milisekund
    // i zablokować wątek główny (§11).
    await nextFrame();
    await nextFrame();

    const { board } = createLevel(level, format, seed);
    this.usedSeed.set(seed);
    this.state.set(createSession(board, mode, this.clock()));
    this.generating.set(false);
    this.startTimer();
  }

  /** Wariant dla konfiguratora (Slice 8) — parametry zamiast presetu. */
  async startCustom(params: GeneratorParams, mode: GameMode): Promise<void> {
    this.generating.set(true);
    await nextFrame();
    await nextFrame();
    const { board } = createCustomLevel(params);
    this.usedSeed.set(params.seed);
    this.state.set(createSession(board, mode, this.clock()));
    this.generating.set(false);
    this.startTimer();
  }

  click(pieceId: number): Effect {
    const current = this.state();
    if (!current) return NO_EFFECT;
    const { next, effect } = reduce(current, { type: 'click', pieceId, at: this.clock() });
    this.state.set(next);
    if (next.status !== 'playing') this.stopTimer();
    return effect;
  }

  tick(): void {
    const current = this.state();
    if (!current || current.status !== 'playing') return;
    this.state.set(reduce(current, { type: 'tick', at: this.clock() }).next);
  }

  restart(): void {
    const current = this.state();
    if (!current) return;
    this.state.set(reduce(current, { type: 'restart', at: this.clock() }).next);
    this.startTimer();
  }

  dispose(): void {
    this.stopTimer();
  }

  private startTimer(): void {
    this.stopTimer();
    // 250 ms wystarcza dla stopera z dokładnością do dziesiątych sekundy,
    // a nie budzi wątku niepotrzebnie często.
    this.timer = setInterval(() => this.tick(), 250);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}
```

- [ ] **Krok 4: Popraw test tokenu zegara**

Test z Kroku 1 podaje `{ provide: 'CLOCK', … }` jako string. Podmień na
prawdziwy token:

```typescript
import { CLOCK, GameStore } from './game-store';
// …
      providers: [GameStore, { provide: CLOCK, useValue: () => now }],
```

- [ ] **Krok 5: Uruchom testy — mają przejść**

```bash
npx ng test --watch=false
```

Oczekiwane: PASS (8 testów).

- [ ] **Krok 6: Commit**

```bash
git add -A
git commit -m "Dodaj store gry oparty na sygnałach"
```

---

### Task 2: Pasek stanu i kontrolki zoomu

**Files:**
- Create: `src/ui/format-time.ts`
- Create: `src/ui/hud.ts`
- Create: `src/ui/zoom-controls.ts`
- Test: `src/ui/hud.spec.ts`

**Interfaces:**
- Produces:
  - `formatTime(ms: number): string`
  - `Hud` — wejścia `lives`, `elapsedMs`, `streak`, `removed`, `total`;
    wyjście `newGame`
  - `ZoomControls` — wyjścia `zoomIn`, `zoomOut`, `fitToScreen`

- [ ] **Krok 1: Napisz failujące testy**

```typescript
// src/ui/hud.spec.ts
import { TestBed } from '@angular/core/testing';
import { Hud } from './hud';
import { formatTime } from './format-time';
import { ZoomControls } from './zoom-controls';

describe('formatTime', () => {
  it('formatuje minuty i sekundy', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9_400)).toBe('0:09');
    expect(formatTime(65_000)).toBe('1:05');
    expect(formatTime(3_725_000)).toBe('62:05');
  });
});

describe('Hud', () => {
  it('pokazuje trzy serca, z których gasną utracone', async () => {
    const fixture = TestBed.createComponent(Hud);
    fixture.componentRef.setInput('lives', 2);
    fixture.componentRef.setInput('elapsedMs', 0);
    fixture.componentRef.setInput('streak', 0);
    fixture.componentRef.setInput('removed', 0);
    fixture.componentRef.setInput('total', 10);
    await fixture.whenStable();

    const hearts = fixture.nativeElement.querySelectorAll('[data-role="heart"]');
    expect(hearts.length).toBe(3);
    expect([...hearts].filter((h: Element) => h.classList.contains('lost')).length).toBe(1);
  });

  it('pokazuje stoper i serię', async () => {
    const fixture = TestBed.createComponent(Hud);
    fixture.componentRef.setInput('lives', 3);
    fixture.componentRef.setInput('elapsedMs', 65_000);
    fixture.componentRef.setInput('streak', 7);
    fixture.componentRef.setInput('removed', 4);
    fixture.componentRef.setInput('total', 10);
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('1:05');
    expect(text).toContain('7');
  });

  // §11 — wyniku NIE MA na pasku podczas gry.
  it('nie pokazuje punktów', async () => {
    const fixture = TestBed.createComponent(Hud);
    fixture.componentRef.setInput('lives', 3);
    fixture.componentRef.setInput('elapsedMs', 1_000);
    fixture.componentRef.setInput('streak', 2);
    fixture.componentRef.setInput('removed', 1);
    fixture.componentRef.setInput('total', 10);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).not.toMatch(/punkt|wynik/i);
  });

  it('zgłasza żądanie nowej gry', async () => {
    const fixture = TestBed.createComponent(Hud);
    fixture.componentRef.setInput('lives', 3);
    fixture.componentRef.setInput('elapsedMs', 0);
    fixture.componentRef.setInput('streak', 0);
    fixture.componentRef.setInput('removed', 0);
    fixture.componentRef.setInput('total', 10);
    let asked = 0;
    fixture.componentInstance.newGame.subscribe(() => asked++);
    await fixture.whenStable();
    fixture.nativeElement.querySelector('[data-role="new-game"]').click();
    expect(asked).toBe(1);
  });
});

describe('ZoomControls', () => {
  // §11 — gest nie może być jedyną drogą do czynności koniecznej do gry.
  it('wystawia przyciski dostępne bez myszy i bez gestów', async () => {
    const fixture = TestBed.createComponent(ZoomControls);
    await fixture.whenStable();
    const buttons = fixture.nativeElement.querySelectorAll('button');
    expect(buttons.length).toBe(3);
    for (const b of buttons) expect(b.getAttribute('aria-label')).toBeTruthy();
  });

  it('zgłasza trzy rodzaje żądań', async () => {
    const fixture = TestBed.createComponent(ZoomControls);
    const seen: string[] = [];
    fixture.componentInstance.zoomIn.subscribe(() => seen.push('in'));
    fixture.componentInstance.zoomOut.subscribe(() => seen.push('out'));
    fixture.componentInstance.fitToScreen.subscribe(() => seen.push('fit'));
    await fixture.whenStable();
    const el = fixture.nativeElement;
    el.querySelector('[data-role="zoom-in"]').click();
    el.querySelector('[data-role="zoom-out"]').click();
    el.querySelector('[data-role="zoom-fit"]').click();
    expect(seen).toEqual(['in', 'out', 'fit']);
  });
});
```

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npx ng test --watch=false
```

Oczekiwane: FAIL — brak modułów.

- [ ] **Krok 3: Zaimplementuj komponenty**

```typescript
// src/ui/format-time.ts
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
```

```typescript
// src/ui/hud.ts
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { formatTime } from './format-time';

@Component({
  selector: 'arw-hud',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="hud">
      <div class="hearts" [attr.aria-label]="'Pozostałe życia: ' + lives()">
        @for (slot of heartSlots(); track $index) {
          <span data-role="heart" class="heart" [class.lost]="!slot">&#9829;</span>
        }
      </div>

      <div class="stat" aria-label="Czas gry">{{ time() }}</div>

      <div class="stat" aria-label="Seria bezbłędnych ruchów">
        <span class="label">seria</span> {{ streak() }}
      </div>

      <div class="stat" aria-label="Postęp">{{ removed() }} / {{ total() }}</div>

      <button type="button" data-role="new-game" (click)="newGame.emit()">Nowa gra</button>
    </div>
  `,
  styles: `
    .hud { display: flex; gap: 1rem; align-items: center; padding: .5rem .75rem; }
    .hearts { display: flex; gap: .25rem; }
    .heart { color: #232447; font-size: 1.25rem; }
    .heart.lost { opacity: .2; }
    .stat { font-variant-numeric: tabular-nums; }
    .label { opacity: .6; font-size: .8em; }
    button { margin-left: auto; }
  `,
})
export class Hud {
  readonly lives = input.required<number>();
  readonly elapsedMs = input.required<number>();
  readonly streak = input.required<number>();
  readonly removed = input.required<number>();
  readonly total = input.required<number>();

  readonly newGame = output<void>();

  /** Trzy pozycje; `true` = serce zachowane. */
  readonly heartSlots = computed(() => [0, 1, 2].map((i) => i < this.lives()));
  readonly time = computed(() => formatTime(this.elapsedMs()));
}
```

```typescript
// src/ui/zoom-controls.ts
import { ChangeDetectionStrategy, Component, output } from '@angular/core';

/**
 * Zoom musi być kontrolką WIDOCZNĄ, nie tylko gestem: te trzy przyciski są
 * jedyną drogą dostępną z klawiatury i przy myszy bez kółka (§11).
 */
@Component({
  selector: 'arw-zoom-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="zoom">
      <button type="button" data-role="zoom-in" aria-label="Przybliż" (click)="zoomIn.emit()">+</button>
      <button type="button" data-role="zoom-out" aria-label="Oddal" (click)="zoomOut.emit()">−</button>
      <button type="button" data-role="zoom-fit" aria-label="Dopasuj planszę do ekranu"
              (click)="fitToScreen.emit()">⤢</button>
    </div>
  `,
  styles: `
    .zoom { position: absolute; right: .75rem; bottom: .75rem; display: grid; gap: .25rem; }
    button { width: 2.25rem; height: 2.25rem; font-size: 1.1rem; }
  `,
})
export class ZoomControls {
  readonly zoomIn = output<void>();
  readonly zoomOut = output<void>();
  readonly fitToScreen = output<void>();
}
```

- [ ] **Krok 4: Uruchom testy — mają przejść**

```bash
npx ng test --watch=false
```

Oczekiwane: PASS.

- [ ] **Krok 5: Commit**

```bash
git add -A
git commit -m "Dodaj pasek stanu i kontrolki zoomu"
```

---

### Task 3: Ekran gry i sterowanie

**Files:**
- Create: `src/ui/game.ts`
- Test: `src/ui/game.spec.ts`

**Interfaces:**
- Consumes: `GameStore`, `createSvgRenderer`, `viewport`, `Hud`, `ZoomControls`.
- Produces: komponent `Game` podpięty pod trasę `game`.

- [ ] **Krok 1: Napisz failujące testy sterowania**

```typescript
// src/ui/game.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CLOCK, GameStore } from './game-store';
import { Game } from './game';

async function setup() {
  let now = 0;
  TestBed.configureTestingModule({
    providers: [GameStore, provideRouter([]), { provide: CLOCK, useValue: () => now }],
  });
  const fixture = TestBed.createComponent(Game);
  await fixture.whenStable();
  await fixture.componentInstance.newGame('easy', 'square', 'classic', 1);
  await fixture.whenStable();
  return { fixture, setNow: (v: number) => (now = v) };
}

describe('Game — sterowanie', () => {
  it('rysuje planszę w SVG', async () => {
    const { fixture } = await setup();
    const svg = fixture.nativeElement.querySelector('svg[data-role="board"]');
    expect(svg.querySelectorAll('polyline').length).toBeGreaterThan(0);
  }, 30_000);

  // §11 — przeciąganie BEZ modyfikatora nie robi nic.
  it('nie przesuwa planszy bez modyfikatora', async () => {
    const { fixture } = await setup();
    const svg = fixture.nativeElement.querySelector('svg[data-role="board"]');
    const before = svg.getAttribute('viewBox');
    svg.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    svg.dispatchEvent(new MouseEvent('pointermove', { clientX: 90, clientY: 90, bubbles: true }));
    svg.dispatchEvent(new MouseEvent('pointerup', { clientX: 90, clientY: 90, bubbles: true }));
    await fixture.whenStable();
    expect(svg.getAttribute('viewBox')).toBe(before);
  }, 30_000);

  it('przesuwa planszę z modyfikatorem', async () => {
    const { fixture } = await setup();
    const c = fixture.componentInstance;
    c.zoomIn();
    c.zoomIn();
    await fixture.whenStable();
    const svg = fixture.nativeElement.querySelector('svg[data-role="board"]');
    const before = svg.getAttribute('viewBox');
    svg.dispatchEvent(new MouseEvent('pointerdown', { clientX: 200, clientY: 200, metaKey: true, bubbles: true }));
    svg.dispatchEvent(new MouseEvent('pointermove', { clientX: 120, clientY: 120, metaKey: true, bubbles: true }));
    svg.dispatchEvent(new MouseEvent('pointerup', { clientX: 120, clientY: 120, metaKey: true, bubbles: true }));
    await fixture.whenStable();
    expect(svg.getAttribute('viewBox')).not.toBe(before);
  }, 30_000);

  it('nie traci życia przy próbie przesunięcia', async () => {
    const { fixture } = await setup();
    const store = TestBed.inject(GameStore);
    const svg = fixture.nativeElement.querySelector('svg[data-role="board"]');
    svg.dispatchEvent(new MouseEvent('pointerdown', { clientX: 5, clientY: 5, ctrlKey: true, bubbles: true }));
    svg.dispatchEvent(new MouseEvent('pointerup', { clientX: 5, clientY: 5, ctrlKey: true, bubbles: true }));
    await fixture.whenStable();
    expect(store.lives()).toBe(3);
  }, 30_000);

  it('przybliża kółkiem do pozycji kursora', async () => {
    const { fixture } = await setup();
    const svg = fixture.nativeElement.querySelector('svg[data-role="board"]');
    const before = svg.getAttribute('viewBox');
    svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: 100, clientY: 100, bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(svg.getAttribute('viewBox')).not.toBe(before);
  }, 30_000);

  it('blokuje domyślny zoom przeglądarki przy ⌘/Ctrl + kółko', async () => {
    const { fixture } = await setup();
    const svg = fixture.nativeElement.querySelector('svg[data-role="board"]');
    const event = new WheelEvent('wheel', { deltaY: -120, ctrlKey: true, clientX: 50, clientY: 50, bubbles: true, cancelable: true });
    svg.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  }, 30_000);

  it('obsługuje klawisze zoomu', async () => {
    const { fixture } = await setup();
    const svg = fixture.nativeElement.querySelector('svg[data-role="board"]');
    const zoomed = fixture.componentInstance;
    zoomed.onKeydown(new KeyboardEvent('keydown', { key: '+' }));
    await fixture.whenStable();
    const afterZoom = svg.getAttribute('viewBox');
    zoomed.onKeydown(new KeyboardEvent('keydown', { key: '0' }));
    await fixture.whenStable();
    expect(svg.getAttribute('viewBox')).not.toBe(afterZoom);
  }, 30_000);

  it('podpowiada właściwy modyfikator dla platformy', async () => {
    const { fixture } = await setup();
    const hint = fixture.nativeElement.querySelector('[data-role="pan-hint"]').textContent as string;
    expect(hint).toMatch(/⌘|Ctrl/);
  }, 30_000);
});
```

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npx ng test --watch=false
```

Oczekiwane: FAIL — brak modułu `./game`.

- [ ] **Krok 3: Zaimplementuj ekran gry**

```typescript
// src/ui/game.ts
import {
  ChangeDetectionStrategy, Component, ElementRef, inject, OnDestroy, signal, viewChild,
} from '@angular/core';
import { BoardFormat, LevelId } from '../core/presets';
import { GameMode } from '../game/session';
import { Renderer } from '../render/renderer';
import { createSvgRenderer } from '../render/svgRenderer';
import {
  createViewport, fit, panBy, Viewport, viewBox, zoomAt, ZOOM_STEP,
} from '../render/viewport';
import { GameStore } from './game-store';
import { Hud } from './hud';
import { ResultDialog } from './result-dialog';
import { ZoomControls } from './zoom-controls';

/** Próg odległości odróżniający dotknięcie od przeciągnięcia — tylko dotyk. */
const TOUCH_DRAG_PX = 12;

@Component({
  selector: 'arw-game',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Hud, ZoomControls, ResultDialog],
  host: { '(window:keydown)': 'onKeydown($event)', '(window:resize)': 'onResize()' },
  template: `
    <arw-hud
      [lives]="store.lives()"
      [elapsedMs]="store.elapsedMs()"
      [streak]="store.streak()"
      [removed]="store.removed()"
      [total]="totalPieces()"
      (newGame)="restart()" />

    <div class="stage">
      <svg #board data-role="board" class="board"
           (wheel)="onWheel($event)"
           (pointerdown)="onPointerDown($event)"
           (pointermove)="onPointerMove($event)"
           (pointerup)="onPointerUp($event)"
           (dblclick)="fitToScreen()"></svg>

      <arw-zoom-controls (zoomIn)="zoomIn()" (zoomOut)="zoomOut()" (fitToScreen)="fitToScreen()" />

      @if (store.loading()) {
        <div class="loading" role="status">Generuję planszę…</div>
      }

      <p class="hint" data-role="pan-hint">
        Przeciągaj z {{ panModifierLabel }}, żeby przesunąć planszę.
      </p>
    </div>

    @if (store.status() !== 'playing') {
      <arw-result-dialog
        [status]="store.status()"
        [breakdown]="store.breakdown()"
        [elapsedMs]="store.elapsedMs()"
        [bestStreak]="store.bestStreak()"
        (playAgain)="restart()" />
    }
  `,
  styles: `
    .stage { position: relative; width: 100%; height: calc(100dvh - 3rem); }
    .board { width: 100%; height: 100%; background: #f6f6fa; touch-action: none; display: block; }
    .hint { position: absolute; left: .75rem; bottom: .75rem; margin: 0; opacity: .55; font-size: .85rem; }
    /* Wskaźnik pojawia się dopiero po 200 ms i animuje przezroczystość, więc
       jest składany przez kompozytor i widać go nawet wtedy, gdy generacja
       zablokowała wątek główny (§11). */
    .loading {
      position: absolute; inset: 0; display: grid; place-items: center;
      background: #f6f6faee; opacity: 0; animation: appear .15s ease 200ms forwards;
    }
    @keyframes appear { to { opacity: 1; } }
  `,
})
export class Game implements OnDestroy {
  protected readonly store = inject(GameStore);
  private readonly boardRef = viewChild.required<ElementRef<SVGSVGElement>>('board');

  private renderer: Renderer | null = null;
  private viewport: Viewport | null = null;
  private panFrom: { x: number; y: number } | null = null;
  private touchFrom: { x: number; y: number } | null = null;

  protected readonly totalPieces = signal(0);

  /**
   * Warunek modyfikatora sprawdza metaKey || ctrlKey BEZ wykrywania systemu.
   * Wykrywanie służy wyłącznie do napisu — gdyby zawiodło, sterowanie działa.
   */
  protected readonly panModifierLabel =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '')
      ? '⌘'
      : 'Ctrl';

  async newGame(level: LevelId, format: BoardFormat, mode: GameMode, seed?: number): Promise<void> {
    await this.store.start(level, format, mode, seed);
    const board = this.store.board();
    if (!board) return;
    this.totalPieces.set(board.pieces.size);

    const host = this.boardRef().nativeElement;
    this.renderer?.destroy();
    this.renderer = createSvgRenderer(host);
    this.renderer.onPieceClick((id) => this.handleClick(id));

    const rect = host.getBoundingClientRect();
    this.viewport = createViewport({
      boardWidth: board.width,
      boardHeight: board.height,
      screenWidth: rect.width || 800,
      screenHeight: rect.height || 800,
    });
    this.renderer.setViewport(this.viewport);
    this.renderer.draw(board);
  }

  restart(): void {
    this.store.restart();
    const board = this.store.board();
    if (board && this.renderer) {
      this.totalPieces.set(board.pieces.size);
      this.renderer.draw(board);
    }
  }

  protected onWheel(event: WheelEvent): void {
    // Przechwytujemy także ⌘/Ctrl + kółko, żeby nie zadziałał zoom przeglądarki.
    event.preventDefault();
    const host = this.boardRef().nativeElement;
    const rect = host.getBoundingClientRect();
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    this.applyViewport((vp) =>
      zoomAt(vp, factor, event.clientX - rect.left, event.clientY - rect.top),
    );
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.metaKey || event.ctrlKey) {
      this.panFrom = { x: event.clientX, y: event.clientY };
      this.boardRef().nativeElement.setPointerCapture(event.pointerId);
      return;
    }
    // Na dotyku modyfikatora nie ma, więc rozstrzyga próg odległości —
    // to jedyne miejsce, gdzie decyzja pozostaje progowa (§11).
    if (event.pointerType === 'touch') this.touchFrom = { x: event.clientX, y: event.clientY };
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.panFrom) {
      const dx = event.clientX - this.panFrom.x;
      const dy = event.clientY - this.panFrom.y;
      this.panFrom = { x: event.clientX, y: event.clientY };
      this.applyViewport((vp) => panBy(vp, dx, dy));
      return;
    }
    if (this.touchFrom) {
      const dx = event.clientX - this.touchFrom.x;
      const dy = event.clientY - this.touchFrom.y;
      if (Math.hypot(dx, dy) > TOUCH_DRAG_PX) {
        this.touchFrom = { x: event.clientX, y: event.clientY };
        this.applyViewport((vp) => panBy(vp, dx, dy));
      }
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    this.panFrom = null;
    this.touchFrom = null;
    if (this.boardRef().nativeElement.hasPointerCapture?.(event.pointerId)) {
      this.boardRef().nativeElement.releasePointerCapture(event.pointerId);
    }
  }

  onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case '+':
      case '=':
        this.zoomIn();
        break;
      case '-':
      case '_':
        this.zoomOut();
        break;
      case '0':
        this.fitToScreen();
        break;
      default:
        return;
    }
  }

  protected onResize(): void {
    const host = this.boardRef().nativeElement;
    const rect = host.getBoundingClientRect();
    this.applyViewport((vp) =>
      fit({ ...vp, screenWidth: rect.width || vp.screenWidth, screenHeight: rect.height || vp.screenHeight }),
    );
  }

  zoomIn(): void {
    this.applyViewport((vp) => zoomAt(vp, ZOOM_STEP, vp.screenWidth / 2, vp.screenHeight / 2));
  }

  zoomOut(): void {
    this.applyViewport((vp) => zoomAt(vp, 1 / ZOOM_STEP, vp.screenWidth / 2, vp.screenHeight / 2));
  }

  fitToScreen(): void {
    this.applyViewport((vp) => fit(vp));
  }

  ngOnDestroy(): void {
    this.renderer?.destroy();
    this.store.dispose();
  }

  private applyViewport(update: (vp: Viewport) => Viewport): void {
    if (!this.viewport || !this.renderer) return;
    this.viewport = update(this.viewport);
    this.renderer.setViewport(this.viewport);
    // viewBox() jest tu tylko po to, żeby test miał co porównywać —
    // renderer ustawia atrybut sam.
    void viewBox(this.viewport);
  }

  private handleClick(pieceId: number): void {
    const effect = this.store.click(pieceId);
    if (!this.renderer) return;
    if (effect.kind === 'exit') void this.renderer.animateExit(effect.pieceId, effect.dir);
    else if (effect.kind === 'bounce') {
      const piece = this.store.board()?.pieces.get(effect.pieceId);
      if (piece) void this.renderer.animateBounce(effect.pieceId, piece.dir, effect.distance);
    }
  }
}
```

- [ ] **Krok 4: Uruchom testy — mają przejść**

```bash
npx ng test --watch=false
```

Oczekiwane: PASS. Test „nie traci życia przy próbie przesunięcia" jest
najważniejszy w tym zadaniu — pilnuje ryzyka z §14.

- [ ] **Krok 5: Commit**

```bash
git add -A
git commit -m "Dodaj ekran gry ze sterowaniem planszą"
```

---

### Task 4: Ekran startowy i ekrany końcowe

**Files:**
- Create: `src/ui/home.ts`
- Create: `src/ui/result-dialog.ts`
- Modify: `src/app/app.routes.ts`
- Test: `src/ui/result-dialog.spec.ts`

**Interfaces:**
- Produces: `Home` (trasa `''`), `ResultDialog` (używany przez `Game`).

- [ ] **Krok 1: Napisz failujące testy ekranu końcowego**

```typescript
// src/ui/result-dialog.spec.ts
import { TestBed } from '@angular/core/testing';
import { ResultDialog } from './result-dialog';

const breakdown = { complexity: 212.5, livesBonus: 1.5, timeBonus: 1.2, total: 383 };

async function render(status: 'won' | 'lost', b = breakdown) {
  const fixture = TestBed.createComponent(ResultDialog);
  fixture.componentRef.setInput('status', status);
  fixture.componentRef.setInput('breakdown', status === 'won' ? b : null);
  fixture.componentRef.setInput('elapsedMs', 125_000);
  fixture.componentRef.setInput('bestStreak', 14);
  await fixture.whenStable();
  return fixture;
}

describe('ResultDialog', () => {
  // §11 — rozbicie jest ważniejsze niż sama liczba.
  it('pokazuje rozbicie wyniku po wygranej', async () => {
    const fixture = await render('won');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('383');
    expect(text).toMatch(/złożoność/i);
    expect(text).toMatch(/życia|życiach/i);
    expect(text).toMatch(/czas/i);
  });

  it('nie pokazuje premii czasowej, gdy jest neutralna', async () => {
    const fixture = await render('won', { ...breakdown, timeBonus: 1 });
    expect(fixture.nativeElement.querySelector('[data-role="time-bonus"]')).toBeNull();
  });

  it('po przegranej mówi wprost o zerze punktów', async () => {
    const fixture = await render('lost');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toMatch(/0 punktów|zero punktów/i);
    expect(fixture.nativeElement.querySelector('[data-role="complexity"]')).toBeNull();
  });

  it('proponuje kolejną grę', async () => {
    const fixture = await render('lost');
    let asked = 0;
    fixture.componentInstance.playAgain.subscribe(() => asked++);
    fixture.nativeElement.querySelector('[data-role="play-again"]').click();
    expect(asked).toBe(1);
  });
});
```

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npx ng test --watch=false
```

Oczekiwane: FAIL — brak modułu `./result-dialog`.

- [ ] **Krok 3: Zaimplementuj ekrany**

```typescript
// src/ui/result-dialog.ts
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ScoreBreakdown } from '../game/scoring';
import { Status } from '../game/session';
import { formatTime } from './format-time';

@Component({
  selector: 'arw-result-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overlay" role="dialog" aria-modal="true">
      <div class="panel">
        @if (status() === 'won') {
          <h2>Plansza pusta</h2>
          <p class="total">{{ breakdown()!.total }}</p>

          <dl>
            <div data-role="complexity">
              <dt>złożoność planszy</dt>
              <dd>{{ breakdown()!.complexity | number: '1.0-0' }}</dd>
            </div>
            <div data-role="lives-bonus">
              <dt>premia za zachowane życia</dt>
              <dd>×{{ breakdown()!.livesBonus | number: '1.2-2' }}</dd>
            </div>
            @if (showTimeBonus()) {
              <div data-role="time-bonus">
                <dt>premia czasowa ({{ time() }})</dt>
                <dd>×{{ breakdown()!.timeBonus | number: '1.2-2' }}</dd>
              </div>
            }
          </dl>
        } @else {
          <h2>Koniec żyć</h2>
          <p class="total">0 punktów</p>
          <p class="note">
            Punkty przyznajemy wyłącznie za ukończoną planszę.
            Najdłuższa seria: {{ bestStreak() }}.
          </p>
        }

        <button type="button" data-role="play-again" (click)="playAgain.emit()">Jeszcze raz</button>
      </div>
    </div>
  `,
  styles: `
    .overlay { position: fixed; inset: 0; display: grid; place-items: center; background: #232447aa; }
    .panel { background: #f6f6fa; padding: 1.5rem 2rem; border-radius: .5rem; min-width: 20rem; }
    .total { font-size: 2.5rem; margin: .25rem 0 1rem; font-variant-numeric: tabular-nums; }
    dl > div { display: flex; justify-content: space-between; gap: 2rem; }
    dt { opacity: .7; }
    dd { margin: 0; font-variant-numeric: tabular-nums; }
    .note { opacity: .7; }
  `,
})
export class ResultDialog {
  readonly status = input.required<Status>();
  readonly breakdown = input.required<ScoreBreakdown | null>();
  readonly elapsedMs = input.required<number>();
  readonly bestStreak = input.required<number>();

  readonly playAgain = output<void>();

  readonly time = computed(() => formatTime(this.elapsedMs()));
  /** W wariancie klasycznym premia wynosi dokładnie 1 i nie ma czego pokazywać. */
  readonly showTimeBonus = computed(() => (this.breakdown()?.timeBonus ?? 1) !== 1);
}
```

Uwaga: `| number` wymaga importu `DecimalPipe`. Dopisz go do `imports`
komponentu:

```typescript
import { DecimalPipe } from '@angular/common';
// …
  imports: [DecimalPipe],
```

```typescript
// src/ui/home.ts
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Router } from '@angular/router';
import { inject } from '@angular/core';
import { ALL_LEVELS, BoardFormat, formatsFor, LevelId } from '../core/presets';
import { GameMode } from '../game/session';

@Component({
  selector: 'arw-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="home">
      <h1>Arrowz</h1>
      <p class="lead">Wyprowadź wszystkie strzałki poza planszę. Masz trzy życia.</p>

      <fieldset>
        <legend>Poziom</legend>
        @for (level of levels; track level) {
          <label>
            <input type="radio" name="level" [value]="level"
                   [checked]="level === selectedLevel()"
                   (change)="selectLevel(level)" />
            {{ labels[level] }}
          </label>
        }
      </fieldset>

      <fieldset>
        <legend>Format</legend>
        @for (format of availableFormats(); track format) {
          <label>
            <input type="radio" name="format" [value]="format"
                   [checked]="format === selectedFormat()"
                   (change)="selectedFormat.set(format)" />
            {{ format === 'square' ? 'kwadrat' : 'pionowy' }}
          </label>
        }
      </fieldset>

      <fieldset>
        <legend>Wariant</legend>
        @for (mode of modes; track mode) {
          <label>
            <input type="radio" name="mode" [value]="mode"
                   [checked]="mode === selectedMode()"
                   (change)="selectedMode.set(mode)" />
            {{ mode === 'classic' ? 'klasyczny' : 'na czas' }}
          </label>
        }
      </fieldset>

      <button type="button" data-role="play" (click)="play()">Graj</button>
      <button type="button" data-role="advanced" (click)="openConfigurator()">
        Tryb zaawansowany
      </button>
    </main>
  `,
  styles: `
    .home { max-width: 32rem; margin: 3rem auto; display: grid; gap: 1rem; }
    fieldset { border: 1px solid #23244733; display: flex; gap: 1rem; flex-wrap: wrap; }
    .lead { opacity: .7; }
  `,
})
export class Home {
  private readonly router = inject(Router);

  protected readonly levels = ALL_LEVELS;
  protected readonly modes: readonly GameMode[] = ['classic', 'timed'];
  protected readonly labels: Record<LevelId, string> = {
    easy: 'Łatwy 25', medium: 'Średni 50', hard: 'Trudny 75',
    nightmare: 'Koszmar 100', extreme: 'Skrajny 200',
  };

  protected readonly selectedLevel = signal<LevelId>('easy');
  protected readonly selectedFormat = signal<BoardFormat>('tall');
  protected readonly selectedMode = signal<GameMode>('classic');

  protected availableFormats(): readonly BoardFormat[] {
    return formatsFor(this.selectedLevel());
  }

  protected selectLevel(level: LevelId): void {
    this.selectedLevel.set(level);
    // Extreme istnieje tylko jako kwadrat — pilnujemy, żeby wybór formatu
    // nie został w stanie niemożliwym do wygenerowania.
    if (!formatsFor(level).includes(this.selectedFormat())) this.selectedFormat.set('square');
  }

  protected play(): void {
    void this.router.navigate(['/game'], {
      queryParams: {
        level: this.selectedLevel(),
        format: this.selectedFormat(),
        mode: this.selectedMode(),
      },
    });
  }

  protected openConfigurator(): void {
    void this.router.navigate(['/configure']);
  }
}
```

- [ ] **Krok 4: Podepnij komponenty pod trasy i odczytaj parametry**

W `src/app/app.routes.ts`:

```typescript
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', title: 'Arrowz', loadComponent: () => import('../ui/home').then((m) => m.Home) },
  { path: 'game', title: 'Arrowz — gra', loadComponent: () => import('../ui/game').then((m) => m.Game) },
  { path: '**', redirectTo: '' },
];
```

W `Game` dodaj start z parametrów trasy — komponent nie może czekać, aż ktoś
zawoła `newGame` ręcznie:

```typescript
// dopisz w klasie Game
  private readonly route = inject(ActivatedRoute);

  constructor() {
    // Parametry trasy są jedynym wejściem: ekran startowy przekazuje wybór
    // przez URL, więc odświeżenie strony odtwarza ten sam poziom.
    afterNextRender(() => {
      const q = this.route.snapshot.queryParamMap;
      void this.newGame(
        (q.get('level') as LevelId) ?? 'easy',
        (q.get('format') as BoardFormat) ?? 'tall',
        (q.get('mode') as GameMode) ?? 'classic',
      );
    });
  }
```

z importami `ActivatedRoute` z `@angular/router` i `afterNextRender`
z `@angular/core`. `afterNextRender` jest tu istotny: kod dotyka DOM
(`getBoundingClientRect`), a trasa `game` jest wprawdzie klientowa, ale
komponent bywa tworzony także w testach bez layoutu.

W `Game` dodaj też provider store'u:

```typescript
  providers: [GameStore],
```

- [ ] **Krok 5: Uruchom testy i aplikację**

```bash
npx ng test --watch=false
npx ng serve
```

Zagraj w Easy w formacie pionowym. Sprawdź ręcznie pięć rzeczy:

1. kliknięcie wolnego elementu wyprowadza go poza planszę,
2. kliknięcie zablokowanego pokazuje odbicie **do miejsca blokady** i zabiera
   serce,
3. przeciąganie bez modyfikatora nic nie robi, z ⌘/Ctrl przesuwa planszę,
4. kółko, przyciski `+`/`−`, klawisze i podwójne kliknięcie sterują zoomem,
5. po opróżnieniu planszy pojawia się ekran z rozbiciem wyniku.

- [ ] **Krok 6: Commit**

```bash
git add -A
git commit -m "Dodaj ekran startowy i ekrany końcowe"
```

---

## Kryteria odbioru slice'a

- **Gra jest grywalna**: od ekranu startowego, przez planszę, po ekran wyniku.
- `npx ng test` i `npm run test:core` przechodzą.
- Przeciąganie bez modyfikatora nie rusza planszy i **nie kosztuje życia**.
- Zoom działa z kółka, przycisków, klawiszy i podwójnego kliknięcia; przyciski
  mają etykiety dostępnościowe.
- Wyniku nie ma na pasku podczas gry; ekran wygranej pokazuje rozbicie.
- Wskaźnik ładowania pojawia się przy dłuższych generacjach, a nie migocze
  przy krótkich.
