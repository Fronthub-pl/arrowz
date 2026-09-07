# Slice 8 — Konfigurator (tryb zaawansowany)

> **Dla wykonawców agentowych:** WYMAGANA PODUMIEJĘTNOŚĆ: użyj
> `superpowers:subagent-driven-development` (zalecane) albo
> `superpowers:executing-plans`. Kroki mają checkboxy (`- [ ]`).

**Cel:** Pozwolić graczowi ustawić własne parametry planszy i **pokazać mu, co
generator faktycznie osiągnął** — a nie tylko to, o co go poproszono.

**Architektura:** Formularz na `@angular/forms/signals`: model to sygnał
z `GeneratorParams`, walidacja siedzi w schemacie formularza, a wielkości
pochodne (liczba linii, średnia długość, udział powierzchni długich elementów)
są `computed`. Presety to **te same** `GeneratorParams`, więc konfigurator nie
jest osobną ścieżką kodu — jest innym widokiem tej samej struktury.

**Stack:** Angular 22, signal forms (`form`, `min`, `max`, `FormField`).

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md` (§7, §11
„Konfigurator", §12.21, §12.23)

**Mapa:** `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`

## Global Constraints

Obowiązują ograniczenia z mapy wdrożenia. Krytyczne dla tego slice'a:

- **Liczba linii nie jest parametrem.** Przy pełnym pokryciu wynika z rozkładu
  długości: `liczba linii = W · H / średnia długość`. Konfigurator pokazuje ją
  jako wielkość **pochodną**.
- **Wypełnienia nie raportujemy** — jest zawsze 100%.
- Ostrzeżenie, gdy udział powierzchni koszyka długiego przekroczy **25%**.
- Zakresy: plansza `10×10 … 200×200`, udział długich `0 … 0.45`,
  `Lmax` `16 … 5·max(W,H)`, siła splątania `0 … 8`, grubość linii
  `0.35 … 0.65`.
- Konfigurator **nie stosuje pasma trudności** — gracz dostaje dokładnie to,
  o co poprosił, plus raport z wykonania.

## File Structure

| Plik | Odpowiedzialność |
|---|---|
| `src/ui/configurator.ts` | formularz parametrów, wielkości pochodne, ostrzeżenia |
| `src/ui/generation-report.ts` | prezentacja `GenerationReport` po generacji |
| `src/ui/configurator.spec.ts` | testy walidacji, wielkości pochodnych i ostrzeżeń |

---

### Task 1: Formularz parametrów

**Files:**
- Create: `src/ui/configurator.ts`
- Test: `src/ui/configurator.spec.ts`
- Modify: `src/app/app.routes.ts` (trasa `configure`)

**Interfaces:**
- Consumes: `GeneratorParams`, `longAreaShare`, `expectedPieceCount`,
  `createCustomLevel`, `GameStore.startCustom`.
- Produces: komponent `Configurator` pod trasą `/configure`.

- [ ] **Krok 1: Napisz failujące testy**

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

describe('Configurator — wielkości pochodne', () => {
  it('pokazuje liczbę linii jako wielkość pochodną, nie parametr', async () => {
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;
    // Liczba linii pojawia się w podsumowaniu…
    expect(el.querySelector('[data-role="derived-pieces"]')).not.toBeNull();
    // …i NIE ma dla niej pola do wpisania.
    expect(el.querySelector('input[name="pieceCount"]')).toBeNull();
  });

  it('przelicza średnią długość z rozmiaru i liczby elementów', async () => {
    const fixture = await setup();
    const c = fixture.componentInstance;
    c.model.set({ ...c.model(), width: 40, height: 40 });
    await fixture.whenStable();
    const area = 1_600;
    expect(c.expectedPieces()).toBeGreaterThan(0);
    expect(c.meanLength()).toBeCloseTo(area / c.expectedPieces(), 1);
  });

  it('nie raportuje wypełnienia, bo zawsze wynosi 100%', async () => {
    const fixture = await setup();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toMatch(/wypełnieni/i);
  });
});

describe('Configurator — ostrzeżenia', () => {
  // §12.23 — udział powierzchni musi zgadzać się z tym, co liczy rdzeń.
  it('ostrzega, gdy długie elementy zajmą ponad 25% powierzchni', async () => {
    const fixture = await setup();
    const c = fixture.componentInstance;
    c.model.set({ ...c.model(), bucketWeights: [0.2, 0.1, 0.7] });
    await fixture.whenStable();
    expect(c.longShare()).toBeGreaterThan(0.25);
    expect(fixture.nativeElement.querySelector('[data-role="long-warning"]')).not.toBeNull();
  });

  it('milczy przy rozsądnym udziale długich', async () => {
    const fixture = await setup();
    const c = fixture.componentInstance;
    c.model.set({ ...c.model(), bucketWeights: [0.85, 0.14, 0.01] });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-role="long-warning"]')).toBeNull();
  });

  it('ostrzega, że proste i bardzo długie elementy bywają niewykonalne', async () => {
    const fixture = await setup();
    const c = fixture.componentInstance;
    c.model.set({ ...c.model(), straightBias: 0.98, bucketWeights: [0.1, 0.1, 0.8] });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-role="straight-warning"]')).not.toBeNull();
  });
});

describe('Configurator — walidacja', () => {
  it('odrzuca planszę mniejszą niż 10×10', async () => {
    const fixture = await setup();
    const c = fixture.componentInstance;
    c.model.set({ ...c.model(), width: 4 });
    await fixture.whenStable();
    expect(c.paramsForm().valid()).toBe(false);
  });

  it('odrzuca planszę większą niż 200×200', async () => {
    const fixture = await setup();
    const c = fixture.componentInstance;
    c.model.set({ ...c.model(), height: 300 });
    await fixture.whenStable();
    expect(c.paramsForm().valid()).toBe(false);
  });

  it('odrzuca siłę splątania spoza zakresu', async () => {
    const fixture = await setup();
    const c = fixture.componentInstance;
    c.model.set({ ...c.model(), warnsdorff: 20 });
    await fixture.whenStable();
    expect(c.paramsForm().valid()).toBe(false);
  });

  it('blokuje przycisk generowania przy niepoprawnych parametrach', async () => {
    const fixture = await setup();
    const c = fixture.componentInstance;
    c.model.set({ ...c.model(), width: 2 });
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector('[data-role="generate"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('przyjmuje parametry domyślne', async () => {
    const fixture = await setup();
    expect(fixture.componentInstance.paramsForm().valid()).toBe(true);
  });
});
```

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npx ng test --watch=false
```

Oczekiwane: FAIL — brak modułu `./configurator`.

- [ ] **Krok 3: Zaimplementuj konfigurator**

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

/** Próg, powyżej którego długie elementy przestają być akcentem, a stają się planszą. */
const LONG_SHARE_WARNING = 0.25;

@Component({
  selector: 'arw-configurator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, GenerationReportView],
  providers: [GameStore],
  template: `
    <main class="configurator">
      <h1>Tryb zaawansowany</h1>

      <form novalidate>
        <label>
          Szerokość
          <input type="number" [formField]="paramsForm.width" />
        </label>

        <label>
          Wysokość
          <input type="number" [formField]="paramsForm.height" />
        </label>

        <label>
          Udział długich linii: {{ longWeight().toFixed(2) }}
          <input type="range" min="0" max="0.45" step="0.01"
                 [value]="longWeight()" (input)="setLongWeight($event)" />
        </label>

        <label>
          Długość maksymalna
          <input type="number" [formField]="paramsForm.maxLength" />
        </label>

        <label>
          Siła splątania
          <input type="number" step="1" [formField]="paramsForm.warnsdorff" />
        </label>

        <label>
          Grubość linii: {{ strokeRatio().toFixed(2) }}
          <input type="range" min="0.35" max="0.65" step="0.05"
                 [value]="strokeRatio()" (input)="setStroke($event)" />
        </label>
      </form>

      <section class="derived">
        <h2>Co z tego wyjdzie</h2>
        <p data-role="derived-pieces">
          Elementów: około <strong>{{ expectedPieces() }}</strong>,
          średnia długość <strong>{{ meanLength().toFixed(1) }}</strong> komórek.
        </p>
        <p>Długie elementy zajmą około {{ (100 * longShare()).toFixed(0) }}% powierzchni.</p>

        @if (longShare() > 0.25) {
          <p class="warning" data-role="long-warning">
            Przy tym udziale kilkanaście węży zajmie większość planszy —
            zamiast pola strzałek dostaniesz zbiór spiral.
          </p>
        }

        @if (straightAndLong()) {
          <p class="warning" data-role="straight-warning">
            Proste i bardzo długie elementy często się nie mieszczą: taki element
            wymaga, żeby cała plansza przed nim była już pusta. Generator odda
            wtedy elementy krótsze, niż zamówiłeś.
          </p>
        }
      </section>

      <button type="button" data-role="generate"
              [disabled]="!paramsForm().valid() || store.loading()"
              (click)="generateAndPlay()">
        Generuj i graj
      </button>

      @if (store.loading()) {
        <p role="status">Generuję planszę…</p>
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

  /** Model formularza to wprost GeneratorParams — jedno źródło prawdy (§11). */
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
    min(path.width, 10, { message: 'Najmniejsza plansza to 10 komórek.' });
    max(path.width, 200, { message: 'Największa plansza to 200 komórek.' });
    min(path.height, 10, { message: 'Najmniejsza plansza to 10 komórek.' });
    max(path.height, 200, { message: 'Największa plansza to 200 komórek.' });
    min(path.maxLength, 16, { message: 'Długość maksymalna zaczyna się od 16.' });
    max(path.maxLength, 1_000, { message: 'Powyżej 1000 komórek element przestaje się mieścić.' });
    // Poniżej 2 generacja bywa zawodna: bez Warnsdorffa jedna plansza na
    // trzydzieści nie domyka się wcale (§7).
    min(path.warnsdorff, 0, { message: 'Siła splątania nie może być ujemna.' });
    max(path.warnsdorff, 8, { message: 'Powyżej 8 elementy kłębią się zamiast meandrować.' });
  });

  readonly longWeight = computed(() => this.model().bucketWeights[2]);
  readonly longShare = computed(() => longAreaShare(this.model()));
  readonly expectedPieces = computed(() => Math.max(1, expectedPieceCount(this.model())));
  readonly meanLength = computed(() => {
    const p = this.model();
    return (p.width * p.height) / this.expectedPieces();
  });

  /**
   * Te dwa suwaki oddziałują na siebie: mocno połamane i długie jest łatwe,
   * proste i długie bywa niewykonalne (§7).
   */
  readonly straightAndLong = computed(
    () => this.model().straightBias > 0.9 && this.model().bucketWeights[2] > 0.4,
  );

  protected setLongWeight(event: Event): void {
    const long = Number((event.target as HTMLInputElement).value);
    // Wagi muszą sumować się do 1; skracamy koszyk krótki, bo to on jest
    // wypełniaczem, a średni odpowiada za główną masę planszy.
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
      // Docelowo przechodzimy do ekranu gry; raport zostaje do wglądu, gdyby
      // gracz wrócił do konfiguratora.
      void this.router.navigate(['/game'], { queryParams: { custom: '1' } });
    }
  }
}
```

- [ ] **Krok 4: Zaimplementuj widok raportu z generacji**

```typescript
// src/ui/generation-report.ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GenerationReport } from '../core/types';

/**
 * Pokazuje, CO FAKTYCZNIE WYSZŁO. Istnieje, bo geometria potrafi odmówić:
 * proste i bardzo długie elementy często się nie mieszczą, a generator nie może
 * obiecać liczby, której nie da się zrealizować (§11).
 */
@Component({
  selector: 'arw-generation-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="report">
      <h2>Co faktycznie wyszło</h2>
      <dl>
        <div><dt>elementów</dt><dd>{{ report().actualPieceCount }}</dd></div>
        <div><dt>średnia długość</dt><dd>{{ report().meanLength.toFixed(1) }}</dd></div>
        <div><dt>najdłuższy element</dt><dd>{{ report().maxLength }}</dd></div>
        <div><dt>nawroty generatora</dt><dd>{{ report().backtracks }}</dd></div>
        <div><dt>restarty</dt><dd>{{ report().restarts }}</dd></div>
        <div><dt>czas generacji</dt><dd>{{ report().generationMs.toFixed(0) }} ms</dd></div>
      </dl>

      <p>Rozkład długości: {{ histogram() }}</p>

      @if (shortfall() > 0.25) {
        <p class="warning" data-role="shortfall">
          Zamówiono elementy do {{ report().params.maxLength }} komórek,
          a najdłuższy ma {{ report().maxLength }}. Geometria nie dopuściła reszty.
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

  /** Jak bardzo wykonanie odstaje od zamówienia. */
  readonly shortfall = computed(() => {
    const r = this.report();
    if (r.params.maxLength <= 0) return 0;
    return 1 - r.maxLength / r.params.maxLength;
  });
}
```

- [ ] **Krok 5: Podepnij trasę i zapamiętaj raport**

W `src/app/app.routes.ts` dopisz:

```typescript
  {
    path: 'configure',
    title: 'Arrowz — tryb zaawansowany',
    loadComponent: () => import('../ui/configurator').then((m) => m.Configurator),
  },
```

W `GameStore` wystaw ostatni raport, żeby konfigurator miał co pokazać:

```typescript
  private readonly report = signal<GenerationReport | null>(null);
  readonly lastReport = this.report.asReadonly();
```

i ustaw go w `start` oraz `startCustom` (`this.report.set(result.report)`).
W `Configurator` zastąp lokalny sygnał `lastReport` odczytem ze store'u:

```typescript
  readonly lastReport = this.store.lastReport;
```

- [ ] **Krok 6: Uruchom testy — mają przejść**

```bash
npx ng test --watch=false
```

Oczekiwane: PASS (11 testów).

- [ ] **Krok 7: Sprawdź ręcznie sprzężenie suwaków**

```bash
npx ng serve
```

Wejdź w tryb zaawansowany i sprawdź trzy rzeczy:

1. przesunięcie udziału długich powyżej 0.45 pokazuje ostrzeżenie o 25%,
2. ustawienie planszy 200×200 z długimi elementami daje raport, w którym
   `najdłuższy element` jest wyraźnie mniejszy od zamówionego `Lmax`,
3. liczba elementów w podsumowaniu jest **zbliżona** do tej z raportu po
   generacji — jeśli różni się kilkukrotnie, `expectedPieceCount` liczy
   średnią z innego rozkładu niż `drawTargetLength`.

- [ ] **Krok 8: Commit**

```bash
git add -A
git commit -m "Dodaj konfigurator plansz w trybie zaawansowanym"
```

---

## Kryteria odbioru slice'a

- Formularz odrzuca parametry spoza zakresów i blokuje przycisk generowania.
- Liczba elementów i średnia długość są pokazane jako **pochodne**, bez pola do
  wpisania liczby linii.
- Ostrzeżenie o 25% pojawia się dokładnie wtedy, gdy `longAreaShare` przekroczy
  próg — ta sama funkcja, którą testuje §12.23.
- Po generacji widać raport z wykonania: liczbę elementów, rozkład długości,
  nawroty, restarty i czas.
- Wypełnienie **nie jest** raportowane.
- Plansza z konfiguratora jest grywalna tak samo jak preset.
