# Slice 7 — Angular Shell: First Playable Version

> **For agentic executors:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans`. Steps have checkboxes (`- [ ]`).

**Goal:** Play. A start screen with level, format, and variant selection, a
board with a status bar, controls compliant with §11, and end screens with a
score breakdown.

**Architecture:** `GameStore` is a thin signal layer **over** a pure
reducer — it holds `Session` in a single signal and calls `reduce`. All
game logic stays in `game/`; the store adds only what the reducer cannot
have: the clock, board generation, and renderer control. Components are
standalone, zoneless, and `OnPush`; they carry no state of their own beyond
view state.

**Stack:** Angular 22 (standalone, zoneless, signals), SVG, Vitest via
`@angular/build:unit-test`.

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md` (§11)

**Map:** `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`

## Global Constraints

The constraints from the implementation map apply. Critical for this slice:

- **The "move vs. pan" decision must be unambiguous, not
  threshold-based** — on desktop the ⌘/Ctrl modifier decides, on touch the
  gesture type does. A mistake costs a life.
- The modifier check tests `event.metaKey || event.ctrlKey`, **with no
  OS detection**. Detection is used only for the label in the hint; if it
  failed, the controls would still work.
- **Zoom is a visible control**, not just a gesture: the `+`, `−`, and
  "fit" buttons are the only way accessible from the keyboard and with a
  mouse without a wheel.
- **There is no score on the bar during play.** Points appear only on the
  win screen, broken down into components.
- We show the loading indicator **after 200 ms** — the generation time
  distribution is heavy-tailed and p99 reaches hundreds of milliseconds.
- File names follow the Angular 2025 convention (`game.ts`, not
  `game.component.ts`).

## File Structure

| File | Responsibility |
|---|---|
| `src/ui/game-store.ts` | signals over `Session`: generation, clock, actions |
| `src/ui/home.ts` | start screen: level, format, variant, entry to the configurator |
| `src/ui/game.ts` | game screen: SVG host, controls, wiring to the renderer |
| `src/ui/hud.ts` | status bar: hearts, stopwatch, streak, new game |
| `src/ui/zoom-controls.ts` | `+`, `−`, "fit" buttons |
| `src/ui/result-dialog.ts` | win and loss screens with score breakdown |
| `src/ui/format-time.ts` | stopwatch formatting |
| `src/app/app.routes.ts` | wiring components to routes |

---

### Task 1: Game Store

**Files:**
- Create: `src/ui/game-store.ts`
- Test: `src/ui/game-store.spec.ts`

**Interfaces:**
- Consumes: `createLevel`, `createSession`, `reduce`, `Effect` from the core and `game/`.
- Produces:
  - `class GameStore` with signals:
    `session: Signal<Session | null>`, `loading: Signal<boolean>`,
    `lives`, `elapsedMs`, `streak`, `status`, `board`, `breakdown`
  - `seed: Signal<number>` — the seed of the board in use
  - methods: `start(level, format, mode, seed?): Promise<void>`,
    `click(pieceId: number): Effect`, `restart(): void`, `tick(): void`,
    `dispose(): void`
  - `provideGameStore()` — registration in DI

- [ ] **Step 1: Write failing tests**

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

  it('starts without a session', () => {
    expect(store.session()).toBeNull();
    expect(store.loading()).toBe(false);
  });

  it('generates a board and starts play', async () => {
    await store.start('easy', 'square', 'classic', 1);
    expect(store.loading()).toBe(false);
    expect(store.session()).not.toBeNull();
    expect(store.status()).toBe('playing');
    expect(store.lives()).toBe(3);
    expect(store.board()!.pieces.size).toBeGreaterThan(0);
  }, 30_000);

  it('is deterministic with respect to the seed', async () => {
    await store.start('easy', 'square', 'classic', 42);
    const first = store.board()!.pieces.size;
    await store.start('easy', 'square', 'classic', 42);
    expect(store.board()!.pieces.size).toBe(first);
  }, 30_000);

  it('removes a free piece and returns an exit effect', async () => {
    await store.start('easy', 'square', 'classic', 2);
    const board = store.board()!;
    const free = [...board.pieces.values()].find((p) => probeMove(board, p).free)!;
    const effect = store.click(free.id);
    expect(effect.kind).toBe('exit');
    expect(store.board()!.pieces.has(free.id)).toBe(false);
  }, 30_000);

  it('subtracts a life for a blocked piece', async () => {
    await store.start('easy', 'square', 'classic', 3);
    const board = store.board()!;
    const blocked = [...board.pieces.values()].find((p) => !probeMove(board, p).free)!;
    const effect = store.click(blocked.id);
    expect(effect.kind).toBe('bounce');
    expect(store.lives()).toBe(2);
  }, 30_000);

  it('takes time from the injected clock, not from Date.now', async () => {
    await store.start('easy', 'square', 'classic', 4);
    now = 15_000;
    store.tick();
    expect(store.elapsedMs()).toBe(5_000);
  }, 30_000);

  it('restarts on the same board', async () => {
    await store.start('easy', 'square', 'classic', 5);
    const before = store.board()!.pieces.size;
    const board = store.board()!;
    const free = [...board.pieces.values()].find((p) => probeMove(board, p).free)!;
    store.click(free.id);
    store.restart();
    expect(store.board()!.pieces.size).toBe(before);
    expect(store.lives()).toBe(3);
  }, 30_000);

  it('ignores clicks without a session', () => {
    expect(store.click(0).kind).toBe('none');
  });
});
```

- [ ] **Step 2: Run and confirm the failure**

```bash
npx ng test --watch=false
```

Expected: FAIL — missing module `./game-store`.

- [ ] **Step 3: Implement the store**

```typescript
// src/ui/game-store.ts
import { computed, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { createLevel } from '../core/level';
import { BoardFormat, LevelId } from '../core/presets';
import { Board, GeneratorParams } from '../core/types';
import { createCustomLevel } from '../core/level';
import { createSession, Effect, GameMode, reduce, Session } from '../game/session';

/**
 * Clock as a dependency, not as `Date.now()` in the code.
 * The reducer is pure (§10), so time has to come in from outside — and
 * since it must anyway, let it be swappable in tests.
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
  /** The seed of the board used — without it, the playthrough can't be replayed (Slice 10). */
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
    // We yield the thread for two frames so the browser has time to paint
    // the loading indicator BEFORE generation — which can take hundreds of
    // milliseconds and block the main thread (§11).
    await nextFrame();
    await nextFrame();

    const { board } = createLevel(level, format, seed);
    this.usedSeed.set(seed);
    this.state.set(createSession(board, mode, this.clock()));
    this.generating.set(false);
    this.startTimer();
  }

  /** Variant for the configurator (Slice 8) — parameters instead of a preset. */
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
    // 250 ms is enough for a stopwatch accurate to tenths of a second,
    // without waking the thread up unnecessarily often.
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

- [ ] **Step 4: Fix the clock token test**

The test from Step 1 supplies `{ provide: 'CLOCK', … }` as a string. Replace
it with the real token:

```typescript
import { CLOCK, GameStore } from './game-store';
// …
      providers: [GameStore, { provide: CLOCK, useValue: () => now }],
```

- [ ] **Step 5: Run the tests — they must pass**

```bash
npx ng test --watch=false
```

Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add a signal-based game store"
```

---

### Task 2: Status Bar and Zoom Controls

**Files:**
- Create: `src/ui/format-time.ts`
- Create: `src/ui/hud.ts`
- Create: `src/ui/zoom-controls.ts`
- Test: `src/ui/hud.spec.ts`

**Interfaces:**
- Produces:
  - `formatTime(ms: number): string`
  - `Hud` — inputs `lives`, `elapsedMs`, `streak`, `removed`, `total`;
    output `newGame`
  - `ZoomControls` — outputs `zoomIn`, `zoomOut`, `fitToScreen`

- [ ] **Step 1: Write failing tests**

```typescript
// src/ui/hud.spec.ts
import { TestBed } from '@angular/core/testing';
import { Hud } from './hud';
import { formatTime } from './format-time';
import { ZoomControls } from './zoom-controls';

describe('formatTime', () => {
  it('formats minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9_400)).toBe('0:09');
    expect(formatTime(65_000)).toBe('1:05');
    expect(formatTime(3_725_000)).toBe('62:05');
  });
});

describe('Hud', () => {
  it('shows three hearts, with lost ones dimmed', async () => {
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

  it('shows the stopwatch and streak', async () => {
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

  // §11 — the score is NOT on the bar during play.
  it('does not show the score', async () => {
    const fixture = TestBed.createComponent(Hud);
    fixture.componentRef.setInput('lives', 3);
    fixture.componentRef.setInput('elapsedMs', 1_000);
    fixture.componentRef.setInput('streak', 2);
    fixture.componentRef.setInput('removed', 1);
    fixture.componentRef.setInput('total', 10);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).not.toMatch(/point|score/i);
  });

  it('reports a new-game request', async () => {
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
  // §11 — a gesture must not be the only way to do something required to play.
  it('exposes buttons reachable without a mouse and without gestures', async () => {
    const fixture = TestBed.createComponent(ZoomControls);
    await fixture.whenStable();
    const buttons = fixture.nativeElement.querySelectorAll('button');
    expect(buttons.length).toBe(3);
    for (const b of buttons) expect(b.getAttribute('aria-label')).toBeTruthy();
  });

  it('reports three kinds of requests', async () => {
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

- [ ] **Step 2: Run and confirm the failure**

```bash
npx ng test --watch=false
```

Expected: FAIL — missing modules.

- [ ] **Step 3: Implement the components**

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
      <div class="hearts" [attr.aria-label]="'Lives remaining: ' + lives()">
        @for (slot of heartSlots(); track $index) {
          <span data-role="heart" class="heart" [class.lost]="!slot">&#9829;</span>
        }
      </div>

      <div class="stat" aria-label="Game time">{{ time() }}</div>

      <div class="stat" aria-label="Mistake-free move streak">
        <span class="label">streak</span> {{ streak() }}
      </div>

      <div class="stat" aria-label="Progress">{{ removed() }} / {{ total() }}</div>

      <button type="button" data-role="new-game" (click)="newGame.emit()">New game</button>
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

  /** Three slots; `true` = heart kept. */
  readonly heartSlots = computed(() => [0, 1, 2].map((i) => i < this.lives()));
  readonly time = computed(() => formatTime(this.elapsedMs()));
}
```

```typescript
// src/ui/zoom-controls.ts
import { ChangeDetectionStrategy, Component, output } from '@angular/core';

/**
 * Zoom must be a VISIBLE control, not just a gesture: these three buttons
 * are the only way accessible from the keyboard and with a mouse without a
 * wheel (§11).
 */
@Component({
  selector: 'arw-zoom-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="zoom">
      <button type="button" data-role="zoom-in" aria-label="Zoom in" (click)="zoomIn.emit()">+</button>
      <button type="button" data-role="zoom-out" aria-label="Zoom out" (click)="zoomOut.emit()">−</button>
      <button type="button" data-role="zoom-fit" aria-label="Fit the board to the screen"
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

- [ ] **Step 4: Run the tests — they must pass**

```bash
npx ng test --watch=false
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add the status bar and zoom controls"
```

---

### Task 3: Game Screen and Controls

**Files:**
- Create: `src/ui/game.ts`
- Test: `src/ui/game.spec.ts`

**Interfaces:**
- Consumes: `GameStore`, `createSvgRenderer`, `viewport`, `Hud`, `ZoomControls`.
- Produces: the `Game` component wired to the `game` route.

- [ ] **Step 1: Write failing control tests**

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

describe('Game — controls', () => {
  it('draws the board in SVG', async () => {
    const { fixture } = await setup();
    const svg = fixture.nativeElement.querySelector('svg[data-role="board"]');
    expect(svg.querySelectorAll('polyline').length).toBeGreaterThan(0);
  }, 30_000);

  // §11 — dragging WITHOUT the modifier does nothing.
  it('does not pan the board without the modifier', async () => {
    const { fixture } = await setup();
    const svg = fixture.nativeElement.querySelector('svg[data-role="board"]');
    const before = svg.getAttribute('viewBox');
    svg.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    svg.dispatchEvent(new MouseEvent('pointermove', { clientX: 90, clientY: 90, bubbles: true }));
    svg.dispatchEvent(new MouseEvent('pointerup', { clientX: 90, clientY: 90, bubbles: true }));
    await fixture.whenStable();
    expect(svg.getAttribute('viewBox')).toBe(before);
  }, 30_000);

  it('pans the board with the modifier', async () => {
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

  it('does not lose a life when attempting to pan', async () => {
    const { fixture } = await setup();
    const store = TestBed.inject(GameStore);
    const svg = fixture.nativeElement.querySelector('svg[data-role="board"]');
    svg.dispatchEvent(new MouseEvent('pointerdown', { clientX: 5, clientY: 5, ctrlKey: true, bubbles: true }));
    svg.dispatchEvent(new MouseEvent('pointerup', { clientX: 5, clientY: 5, ctrlKey: true, bubbles: true }));
    await fixture.whenStable();
    expect(store.lives()).toBe(3);
  }, 30_000);

  it('zooms in with the wheel toward the cursor position', async () => {
    const { fixture } = await setup();
    const svg = fixture.nativeElement.querySelector('svg[data-role="board"]');
    const before = svg.getAttribute('viewBox');
    svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: 100, clientY: 100, bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(svg.getAttribute('viewBox')).not.toBe(before);
  }, 30_000);

  it('blocks the browser default zoom on ⌘/Ctrl + wheel', async () => {
    const { fixture } = await setup();
    const svg = fixture.nativeElement.querySelector('svg[data-role="board"]');
    const event = new WheelEvent('wheel', { deltaY: -120, ctrlKey: true, clientX: 50, clientY: 50, bubbles: true, cancelable: true });
    svg.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  }, 30_000);

  it('handles zoom keys', async () => {
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

  it('hints the correct modifier for the platform', async () => {
    const { fixture } = await setup();
    const hint = fixture.nativeElement.querySelector('[data-role="pan-hint"]').textContent as string;
    expect(hint).toMatch(/⌘|Ctrl/);
  }, 30_000);
});
```

- [ ] **Step 2: Run and confirm the failure**

```bash
npx ng test --watch=false
```

Expected: FAIL — missing module `./game`.

- [ ] **Step 3: Implement the game screen**

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

/** Distance threshold distinguishing a tap from a drag — touch only. */
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
        <div class="loading" role="status">Generating the board…</div>
      }

      <p class="hint" data-role="pan-hint">
        Drag with {{ panModifierLabel }} to pan the board.
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
    /* The indicator appears only after 200 ms and animates opacity, so it
       is composited and stays visible even when generation has blocked
       the main thread (§11). */
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
   * The modifier check tests metaKey || ctrlKey WITHOUT OS detection.
   * Detection is used only for the label — if it failed, controls still work.
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
    // We also intercept ⌘/Ctrl + wheel so the browser's own zoom doesn't fire.
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
    // On touch there is no modifier, so the distance threshold decides —
    // this is the one place where the decision stays threshold-based (§11).
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
    // viewBox() is here only so the test has something to compare —
    // the renderer sets the attribute itself.
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

- [ ] **Step 4: Run the tests — they must pass**

```bash
npx ng test --watch=false
```

Expected: PASS. The "does not lose a life when attempting to pan" test is
the most important one in this task — it guards against the risk from §14.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add the game screen with board controls"
```

---

### Task 4: Start Screen and End Screens

**Files:**
- Create: `src/ui/home.ts`
- Create: `src/ui/result-dialog.ts`
- Modify: `src/app/app.routes.ts`
- Test: `src/ui/result-dialog.spec.ts`

**Interfaces:**
- Produces: `Home` (route `''`), `ResultDialog` (used by `Game`).

- [ ] **Step 1: Write failing end-screen tests**

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
  // §11 — the breakdown matters more than the number itself.
  it('shows the score breakdown after a win', async () => {
    const fixture = await render('won');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('383');
    expect(text).toMatch(/complexity/i);
    expect(text).toMatch(/lives/i);
    expect(text).toMatch(/time/i);
  });

  it('does not show the time bonus when it is neutral', async () => {
    const fixture = await render('won', { ...breakdown, timeBonus: 1 });
    expect(fixture.nativeElement.querySelector('[data-role="time-bonus"]')).toBeNull();
  });

  it('states zero points outright after a loss', async () => {
    const fixture = await render('lost');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toMatch(/0 points|zero points/i);
    expect(fixture.nativeElement.querySelector('[data-role="complexity"]')).toBeNull();
  });

  it('offers another game', async () => {
    const fixture = await render('lost');
    let asked = 0;
    fixture.componentInstance.playAgain.subscribe(() => asked++);
    fixture.nativeElement.querySelector('[data-role="play-again"]').click();
    expect(asked).toBe(1);
  });
});
```

- [ ] **Step 2: Run and confirm the failure**

```bash
npx ng test --watch=false
```

Expected: FAIL — missing module `./result-dialog`.

- [ ] **Step 3: Implement the screens**

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
          <h2>Board cleared</h2>
          <p class="total">{{ breakdown()!.total }}</p>

          <dl>
            <div data-role="complexity">
              <dt>board complexity</dt>
              <dd>{{ breakdown()!.complexity | number: '1.0-0' }}</dd>
            </div>
            <div data-role="lives-bonus">
              <dt>bonus for lives kept</dt>
              <dd>×{{ breakdown()!.livesBonus | number: '1.2-2' }}</dd>
            </div>
            @if (showTimeBonus()) {
              <div data-role="time-bonus">
                <dt>time bonus ({{ time() }})</dt>
                <dd>×{{ breakdown()!.timeBonus | number: '1.2-2' }}</dd>
              </div>
            }
          </dl>
        } @else {
          <h2>Out of lives</h2>
          <p class="total">0 points</p>
          <p class="note">
            Points are awarded only for a completed board.
            Longest streak: {{ bestStreak() }}.
          </p>
        }

        <button type="button" data-role="play-again" (click)="playAgain.emit()">Play again</button>
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
  /** In the classic variant the bonus is exactly 1 and there is nothing to show. */
  readonly showTimeBonus = computed(() => (this.breakdown()?.timeBonus ?? 1) !== 1);
}
```

Note: `| number` requires importing `DecimalPipe`. Add it to the component's
`imports`:

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
      <p class="lead">Move every arrow off the board. You have three lives.</p>

      <fieldset>
        <legend>Level</legend>
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
            {{ format === 'square' ? 'square' : 'tall' }}
          </label>
        }
      </fieldset>

      <fieldset>
        <legend>Variant</legend>
        @for (mode of modes; track mode) {
          <label>
            <input type="radio" name="mode" [value]="mode"
                   [checked]="mode === selectedMode()"
                   (change)="selectedMode.set(mode)" />
            {{ mode === 'classic' ? 'classic' : 'timed' }}
          </label>
        }
      </fieldset>

      <button type="button" data-role="play" (click)="play()">Play</button>
      <button type="button" data-role="advanced" (click)="openConfigurator()">
        Advanced mode
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
    easy: 'Easy 25', medium: 'Medium 50', hard: 'Hard 75',
    nightmare: 'Nightmare 100', extreme: 'Extreme 200',
  };

  protected readonly selectedLevel = signal<LevelId>('easy');
  protected readonly selectedFormat = signal<BoardFormat>('tall');
  protected readonly selectedMode = signal<GameMode>('classic');

  protected availableFormats(): readonly BoardFormat[] {
    return formatsFor(this.selectedLevel());
  }

  protected selectLevel(level: LevelId): void {
    this.selectedLevel.set(level);
    // Extreme exists only as a square — we make sure the format selection
    // doesn't end up in a state that can't be generated.
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

- [ ] **Step 4: Wire the components to routes and read the parameters**

In `src/app/app.routes.ts`:

```typescript
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', title: 'Arrowz', loadComponent: () => import('../ui/home').then((m) => m.Home) },
  { path: 'game', title: 'Arrowz — game', loadComponent: () => import('../ui/game').then((m) => m.Game) },
  { path: '**', redirectTo: '' },
];
```

In `Game`, add starting from route parameters — the component cannot wait
for someone to call `newGame` manually:

```typescript
// add to the Game class
  private readonly route = inject(ActivatedRoute);

  constructor() {
    // Route parameters are the only input: the start screen passes the
    // selection via the URL, so refreshing the page reproduces the same level.
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

with imports of `ActivatedRoute` from `@angular/router` and `afterNextRender`
from `@angular/core`. `afterNextRender` matters here: the code touches the
DOM (`getBoundingClientRect`), and while the `game` route is client-side,
the component can also be created in tests without a layout.

In `Game`, also add the store provider:

```typescript
  providers: [GameStore],
```

- [ ] **Step 5: Run the tests and the app**

```bash
npx ng test --watch=false
npx ng serve
```

Play Easy in the tall format. Check five things manually:

1. clicking a free piece moves it off the board,
2. clicking a blocked one shows a bounce **to the point of the jam** and
   takes a life,
3. dragging without the modifier does nothing, with ⌘/Ctrl it pans the board,
4. the wheel, `+`/`−` buttons, keys, and double-click control zoom,
5. once the board is emptied, a screen with the score breakdown appears.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add the start screen and end screens"
```

---

## Slice Acceptance Criteria

- **The game is playable**: from the start screen, through the board, to the result screen.
- `npx ng test` and `npm run test:core` pass.
- Dragging without the modifier does not move the board and **does not cost a life**.
- Zoom works from the wheel, buttons, keys, and double-click; buttons have
  accessibility labels.
- There is no score on the bar during play; the win screen shows the breakdown.
- The loading indicator appears for longer generations and does not flicker
  for short ones.
