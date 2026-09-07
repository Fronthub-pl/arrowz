# Slice 8 — Configurator (advanced mode)

> **For agentic executors:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans`. Steps have checkboxes (`- [ ]`).

**Goal:** Let the player set their own board parameters and **show them what
the generator actually achieved** — not just what was requested.

**Architecture:** A form on `@angular/forms/signals`: the model is a signal
of `GeneratorParams`, validation lives in the form schema, and derived
quantities (piece count, mean length, share of surface taken by long pieces)
are `computed`. Presets are the **same** `GeneratorParams`, so the configurator
is not a separate code path — it's a different view of the same structure.

**Stack:** Angular 22, signal forms (`form`, `min`, `max`, `FormField`).

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md` (§7, §11
"Configurator", §12.21, §12.23)

**Map:** `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`

## Global Constraints

Constraints from the implementation map apply. Critical for this slice:

- **Piece count is not a parameter.** At full coverage it follows from the
  length distribution: `piece count = W · H / mean length`. The configurator
  shows it as a **derived** quantity.
- **Fill is not reported** — it is always 100%.
- Warning when the share of surface taken by the long bucket exceeds **25%**.
- Ranges: board `10×10 … 200×200`, long share `0 … 0.45`,
  `Lmax` `16 … 5·max(W,H)`, coiling strength `0 … 8`, line thickness
  `0.35 … 0.65`.
- The configurator **does not apply the difficulty band** — the player gets
  exactly what they asked for, plus a report of what was executed.

## File Structure

| File | Responsibility |
|---|---|
| `src/ui/configurator.ts` | parameter form, derived quantities, warnings |
| `src/ui/generation-report.ts` | presentation of `GenerationReport` after generation |
| `src/ui/configurator.spec.ts` | tests for validation, derived quantities and warnings |

---

### Task 1: Parameter form

**Files:**
- Create: `src/ui/configurator.ts`
- Test: `src/ui/configurator.spec.ts`
- Modify: `src/app/app.routes.ts` (`configure` route)

**Interfaces:**
- Consumes: `GeneratorParams`, `longAreaShare`, `expectedPieceCount`,
  `createCustomLevel`, `GameStore.startCustom`.
- Produces: `Configurator` component under the `/configure` route.

- [ ] **Step 1: Write failing tests**

```typescript
// src/ui/configurator.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GameStore } from './game-store';
import { Configurator } from './configurator';

async function setup() {
  TestBed.configureTestingModule({ providers: [GameStore, provideRouter([])] });
  const fixture = TestBed.createComponent(Configurator);
  await fixture.whenStable();
  return fixture;
}

describe('Configurator — derived quantities', () => {
  it('shows piece count as a derived quantity, not a parameter', async () => {
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;
    // Piece count appears in the summary…
    expect(el.querySelector('[data-role="derived-pieces"]')).not.toBeNull();
    // …but there is NO input field for it.
    expect(el.querySelector('input[name="pieceCount"]')).toBeNull();
  });

  it('computes mean length from size and piece count', async () => {
    const fixture = await setup();
    const c = fixture.componentInstance;
    c.model.set({ ...c.model(), width: 40, height: 40 });
    await fixture.whenStable();
    const area = 1_600;
    expect(c.expectedPieces()).toBeGreaterThan(0);
    expect(c.meanLength()).toBeCloseTo(area / c.expectedPieces(), 1);
  });

  it('does not report fill, because it is always 100%', async () => {
    const fixture = await setup();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toMatch(/fill/i);
  });
});

describe('Configurator — warnings', () => {
  // §12.23 — the surface share must match what the core computes.
  it('warns when long pieces take up more than 25% of the surface', async () => {
    const fixture = await setup();
    const c = fixture.componentInstance;
    c.model.set({ ...c.model(), bucketWeights: [0.2, 0.1, 0.7] });
    await fixture.whenStable();
    expect(c.longShare()).toBeGreaterThan(0.25);
    expect(fixture.nativeElement.querySelector('[data-role="long-warning"]')).not.toBeNull();
  });

  it('stays silent for a reasonable long share', async () => {
    const fixture = await setup();
    const c = fixture.componentInstance;
    c.model.set({ ...c.model(), bucketWeights: [0.85, 0.14, 0.01] });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-role="long-warning"]')).toBeNull();
  });

  it('warns that straight and very long pieces can be infeasible', async () => {
    const fixture = await setup();
    const c = fixture.componentInstance;
    c.model.set({ ...c.model(), straightBias: 0.98, bucketWeights: [0.1, 0.1, 0.8] });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-role="straight-warning"]')).not.toBeNull();
  });
});

describe('Configurator — validation', () => {
  it('rejects a board smaller than 10×10', async () => {
    const fixture = await setup();
    const c = fixture.componentInstance;
    c.model.set({ ...c.model(), width: 4 });
    await fixture.whenStable();
    expect(c.paramsForm().valid()).toBe(false);
  });

  it('rejects a board larger than 200×200', async () => {
    const fixture = await setup();
    const c = fixture.componentInstance;
    c.model.set({ ...c.model(), height: 300 });
    await fixture.whenStable();
    expect(c.paramsForm().valid()).toBe(false);
  });

  it('rejects a coiling strength out of range', async () => {
    const fixture = await setup();
    const c = fixture.componentInstance;
    c.model.set({ ...c.model(), warnsdorff: 20 });
    await fixture.whenStable();
    expect(c.paramsForm().valid()).toBe(false);
  });

  it('disables the generate button when parameters are invalid', async () => {
    const fixture = await setup();
    const c = fixture.componentInstance;
    c.model.set({ ...c.model(), width: 2 });
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector('[data-role="generate"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('accepts the default parameters', async () => {
    const fixture = await setup();
    expect(fixture.componentInstance.paramsForm().valid()).toBe(true);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx ng test --watch=false
```

Expected: FAIL — module `./configurator` is missing.

- [ ] **Step 3: Implement the configurator**

```typescript
// src/ui/configurator.ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { form, FormField, max, min } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { expectedPieceCount, longAreaShare } from '../core/lengths';
import { GeneratorParams } from '../core/types';
import { GameMode } from '../game/session';
import { GameStore } from './game-store';
import { GenerationReportView } from './generation-report';

/** Threshold above which long pieces stop being an accent and become the board. */
const LONG_SHARE_WARNING = 0.25;

@Component({
  selector: 'arw-configurator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, GenerationReportView],
  providers: [GameStore],
  template: `
    <main class="configurator">
      <h1>Advanced mode</h1>

      <form novalidate>
        <label>
          Width
          <input type="number" [formField]="paramsForm.width" />
        </label>

        <label>
          Height
          <input type="number" [formField]="paramsForm.height" />
        </label>

        <label>
          Share of long pieces: {{ longWeight().toFixed(2) }}
          <input type="range" min="0" max="0.45" step="0.01"
                 [value]="longWeight()" (input)="setLongWeight($event)" />
        </label>

        <label>
          Maximum length
          <input type="number" [formField]="paramsForm.maxLength" />
        </label>

        <label>
          Coiling strength
          <input type="number" step="1" [formField]="paramsForm.warnsdorff" />
        </label>

        <label>
          Line thickness: {{ strokeRatio().toFixed(2) }}
          <input type="range" min="0.35" max="0.65" step="0.05"
                 [value]="strokeRatio()" (input)="setStroke($event)" />
        </label>
      </form>

      <section class="derived">
        <h2>What this will produce</h2>
        <p data-role="derived-pieces">
          Pieces: about <strong>{{ expectedPieces() }}</strong>,
          mean length <strong>{{ meanLength().toFixed(1) }}</strong> cells.
        </p>
        <p>Long pieces will take up about {{ (100 * longShare()).toFixed(0) }}% of the surface.</p>

        @if (longShare() > 0.25) {
          <p class="warning" data-role="long-warning">
            At this share, a dozen or so snakes will take up most of the board —
            instead of a field of arrows you'll get a collection of spirals.
          </p>
        }

        @if (straightAndLong()) {
          <p class="warning" data-role="straight-warning">
            Straight and very long pieces often don't fit: such a piece requires
            the whole board ahead of it to already be empty. In that case the
            generator will return pieces shorter than you requested.
          </p>
        }
      </section>

      <button type="button" data-role="generate"
              [disabled]="!paramsForm().valid() || store.loading()"
              (click)="generateAndPlay()">
        Generate and play
      </button>

      @if (store.loading()) {
        <p role="status">Generating board…</p>
      }

      @if (lastReport(); as report) {
        <arw-generation-report [report]="report" />
      }
    </main>
  `,
  styles: `
    .configurator { max-width: 40rem; margin: 2rem auto; display: grid; gap: 1rem; }
    form { display: grid; gap: .75rem; }
    label { display: grid; gap: .25rem; }
    .warning { color: #8a2b2b; }
    .derived { background: #23244711; padding: .75rem 1rem; border-radius: .25rem; }
  `,
})
export class Configurator {
  protected readonly store = inject(GameStore);
  private readonly router = inject(Router);

  /** The form model is directly GeneratorParams — a single source of truth (§11). */
  readonly model = signal<GeneratorParams>({
    width: 25,
    height: 50,
    maxLength: 125,
    bucketWeights: [0.5, 0.2, 0.3],
    straightBias: 0.6,
    lateralWeight: 3,
    warnsdorff: 4,
    headBias: 1,
    seed: Math.floor(Math.random() * 2 ** 31),
  });

  readonly strokeRatio = signal(0.5);
  readonly lastReport = signal<import('../core/types').GenerationReport | null>(null);

  readonly paramsForm = form(this.model, (path) => {
    min(path.width, 10, { message: 'The smallest board is 10 cells.' });
    max(path.width, 200, { message: 'The largest board is 200 cells.' });
    min(path.height, 10, { message: 'The smallest board is 10 cells.' });
    max(path.height, 200, { message: 'The largest board is 200 cells.' });
    min(path.maxLength, 16, { message: 'Maximum length starts at 16.' });
    max(path.maxLength, 1_000, { message: 'Above 1000 cells a piece stops fitting.' });
    // Below 2, generation tends to be unreliable: without Warnsdorff, one board
    // in thirty fails to close at all (§7).
    min(path.warnsdorff, 0, { message: 'Coiling strength cannot be negative.' });
    max(path.warnsdorff, 8, { message: 'Above 8, pieces coil up instead of meandering.' });
  });

  readonly longWeight = computed(() => this.model().bucketWeights[2]);
  readonly longShare = computed(() => longAreaShare(this.model()));
  readonly expectedPieces = computed(() => Math.max(1, expectedPieceCount(this.model())));
  readonly meanLength = computed(() => {
    const p = this.model();
    return (p.width * p.height) / this.expectedPieces();
  });

  /**
   * These two sliders interact with each other: heavily bent and long is easy,
   * straight and long can be infeasible (§7).
   */
  readonly straightAndLong = computed(
    () => this.model().straightBias > 0.9 && this.model().bucketWeights[2] > 0.4,
  );

  protected setLongWeight(event: Event): void {
    const long = Number((event.target as HTMLInputElement).value);
    // Weights must sum to 1; we shrink the short bucket, since it's the
    // filler, while the medium one accounts for the board's main mass.
    const medium = this.model().bucketWeights[1];
    const short = Math.max(0, 1 - long - medium);
    this.model.update((p) => ({ ...p, bucketWeights: [short, medium, long] }));
  }

  protected setStroke(event: Event): void {
    this.strokeRatio.set(Number((event.target as HTMLInputElement).value));
  }

  protected async generateAndPlay(mode: GameMode = 'classic'): Promise<void> {
    await this.store.startCustom(this.model(), mode);
    const board = this.store.board();
    if (board) {
      // We move on to the game screen; the report stays available in case
      // the player returns to the configurator.
      void this.router.navigate(['/game'], { queryParams: { custom: '1' } });
    }
  }
}
```

- [ ] **Step 4: Implement the generation report view**

```typescript
// src/ui/generation-report.ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GenerationReport } from '../core/types';

/**
 * Shows WHAT ACTUALLY CAME OUT. It exists because geometry can refuse:
 * straight and very long pieces often don't fit, and the generator cannot
 * promise a number it cannot deliver (§11).
 */
@Component({
  selector: 'arw-generation-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="report">
      <h2>What actually came out</h2>
      <dl>
        <div><dt>pieces</dt><dd>{{ report().actualPieceCount }}</dd></div>
        <div><dt>mean length</dt><dd>{{ report().meanLength.toFixed(1) }}</dd></div>
        <div><dt>longest piece</dt><dd>{{ report().maxLength }}</dd></div>
        <div><dt>generator backtracks</dt><dd>{{ report().backtracks }}</dd></div>
        <div><dt>restarts</dt><dd>{{ report().restarts }}</dd></div>
        <div><dt>generation time</dt><dd>{{ report().generationMs.toFixed(0) }} ms</dd></div>
      </dl>

      <p>Length distribution: {{ histogram() }}</p>

      @if (shortfall() > 0.25) {
        <p class="warning" data-role="shortfall">
          Pieces up to {{ report().params.maxLength }} cells were requested,
          and the longest is {{ report().maxLength }}. Geometry didn't allow the rest.
        </p>
      }
    </section>
  `,
  styles: `
    .report { border-top: 1px solid #23244733; padding-top: .75rem; }
    dl > div { display: flex; justify-content: space-between; }
    dt { opacity: .7; }
    dd { margin: 0; font-variant-numeric: tabular-nums; }
    .warning { color: #8a2b2b; }
  `,
})
export class GenerationReportView {
  readonly report = input.required<GenerationReport>();

  readonly histogram = computed(() => {
    const h = this.report().lengthHistogram;
    const total = h.reduce((a, b) => a + b, 0) || 1;
    const labels = ['2–6', '7–15', '16–49', '50+'];
    return h.map((count, i) => `${labels[i]}: ${Math.round((100 * count) / total)}%`).join(', ');
  });

  /** How far the execution deviates from the request. */
  readonly shortfall = computed(() => {
    const r = this.report();
    if (r.params.maxLength <= 0) return 0;
    return 1 - r.maxLength / r.params.maxLength;
  });
}
```

- [ ] **Step 5: Wire up the route and remember the report**

In `src/app/app.routes.ts` add:

```typescript
  {
    path: 'configure',
    title: 'Arrowz — advanced mode',
    loadComponent: () => import('../ui/configurator').then((m) => m.Configurator),
  },
```

In `GameStore`, expose the last report so the configurator has something to show:

```typescript
  private readonly report = signal<GenerationReport | null>(null);
  readonly lastReport = this.report.asReadonly();
```

and set it in `start` and `startCustom` (`this.report.set(result.report)`).
In `Configurator`, replace the local `lastReport` signal with a read from the store:

```typescript
  readonly lastReport = this.store.lastReport;
```

- [ ] **Step 6: Run the tests — they must pass**

```bash
npx ng test --watch=false
```

Expected: PASS (11 tests).

- [ ] **Step 7: Manually check the slider coupling**

```bash
npx ng serve
```

Enter advanced mode and check three things:

1. moving the long share above 0.45 shows the 25% warning,
2. setting a 200×200 board with long pieces yields a report where
   `longest piece` is clearly smaller than the requested `Lmax`,
3. the piece count in the summary is **close** to the one in the report after
   generation — if it differs by several multiples, `expectedPieceCount` is
   computing the mean from a different distribution than `drawTargetLength`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add board configurator in advanced mode"
```

---

## Slice Acceptance Criteria

- The form rejects out-of-range parameters and disables the generate button.
- Piece count and mean length are shown as **derived** values, with no input
  field for entering the piece count.
- The 25% warning appears exactly when `longAreaShare` exceeds the
  threshold — the same function tested by §12.23.
- After generation, a report of what was executed is shown: piece count,
  length distribution, backtracks, restarts and time.
- Fill is **not** reported.
- A board from the configurator is playable exactly like a preset.
