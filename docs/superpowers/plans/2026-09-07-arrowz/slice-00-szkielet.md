# Slice 0 — Szkielet aplikacji

> **Dla wykonawców agentowych:** WYMAGANA PODUMIEJĘTNOŚĆ: użyj
> `superpowers:subagent-driven-development` (zalecane) albo
> `superpowers:executing-plans`. Kroki mają checkboxy (`- [ ]`).

**Cel:** Postawić workspace Angular 22, w którym `npm run test:core`,
`npm test` i `npm run build` przechodzą, a bariera „rdzeń nie zna DOM"
jest egzekwowana przez lint, a nie przez dobre chęci.

**Architektura:** Jeden workspace, dwie ścieżki testowe. Testy rdzenia biegną
**bezpośrednio w Vitest w Node**, bez Angulara i bez jsdom — dzięki temu
generator da się odpalić w pętli na tysiącach ziaren bez narzutu. Testy
komponentów biegną przez `@angular/build:unit-test`. Build to statyczny
prerender: `outputMode: "static"`, trasa gry renderowana wyłącznie klientowo.

**Stack:** Angular CLI 22.1.7 (`latest` na 2026-09-07), TypeScript strict,
Vitest, ESLint flat config, Node 24.

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md` (§3, §4)

**Mapa:** `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`

## Global Constraints

Obowiązują ograniczenia z sekcji „Global Constraints" mapy wdrożenia.
Dla tego slice'a najważniejsze:

- `src/core/` i `src/game/` nie importują `@angular/*`, `src/render/*`,
  `src/ui/*`, `src/data/*` ani nie dotykają `document` / `window`.
- `strict: true` oraz `noUncheckedIndexedAccess: true` w `tsconfig.json`.
- Jedyne źródło losowości w rdzeniu: `mulberry32(seed)`.
- Commity po polsku, w trybie rozkazującym, bez linii atrybucji.

## File Structure

| Plik | Odpowiedzialność |
|---|---|
| `package.json` | skrypty `test:core`, `test`, `build`, `lint` |
| `angular.json` | builder aplikacji, `outputMode: "static"`, builder testów |
| `tsconfig.json` | `strict`, `noUncheckedIndexedAccess`, ścieżki |
| `vitest.core.config.ts` | runner rdzenia: środowisko `node`, wzorzec `src/{core,game}/**/*.spec.ts` |
| `eslint.config.js` | bariera architektoniczna dla `core/` i `game/` |
| `src/app/app.config.ts` | providery aplikacji (zoneless jest domyślny w v22) |
| `src/app/app.routes.ts` | trasy: `''` → ekran startowy, `game` → gra |
| `src/app/app.routes.server.ts` | tryby renderowania: prerender + `RenderMode.Client` dla gry |
| `src/core/rng.ts` | `mulberry32` — pierwszy realny moduł rdzenia |
| `src/core/rng.spec.ts` | testy determinizmu i zakresu |
| `.github/workflows/ci.yml` | lint + testy rdzenia + testy aplikacji + build |

Katalogi tworzone pusto pod kolejne slice'y: `src/core/`, `src/game/`,
`src/render/`, `src/ui/`, `src/data/`.

---

### Task 1: Workspace Angular 22 w istniejącym repozytorium

**Files:**
- Create: `package.json`, `angular.json`, `tsconfig.json`, `src/**` (przez CLI)
- Modify: `.gitignore`

**Interfaces:**
- Produces: działający workspace; polecenia `npx ng build` i `npx ng test`.

Repozytorium **nie jest puste** — leżą w nim `docs/`, `prototype/`,
`.gitignore` i `.basic-memory/`. `ng new` odmówi pracy w takim katalogu, więc
generujemy obok i przenosimy.

- [ ] **Krok 1: Sprawdź, że `latest` to nadal Angular 22**

```bash
npm view @angular/cli dist-tags.latest
```

Oczekiwane: `22.1.7` lub nowsze `22.x`. Jeśli wypadnie `21.x` lub niżej,
zatrzymaj się i zgłoś — plan zakłada v22 (zoneless i Vitest jako domyślne).

- [ ] **Krok 2: Wygeneruj workspace w katalogu tymczasowym**

```bash
npx --yes @angular/cli@latest new arrowz \
  --directory=.ng-tmp \
  --style=css \
  --routing=true \
  --ssr=true \
  --server-routing=true \
  --package-manager=npm \
  --skip-git \
  --skip-install \
  --defaults
```

`--ssr=true` dodaje `@angular/ssr`; w Kroku 8 przestawimy go na sam
prerender, bez procesu serwerowego. Jeśli CLI zapyta o `--server-routing`
mimo `--defaults`, odpowiedz twierdząco.

- [ ] **Krok 3: Przenieś zawartość do korzenia repozytorium**

```bash
shopt -s dotglob
mv .ng-tmp/.gitignore .ng-tmp/gitignore.angular
mv .ng-tmp/* .
rmdir .ng-tmp
shopt -u dotglob
```

- [ ] **Krok 4: Scal `.gitignore`**

Dopisz na koniec istniejącego `.gitignore` zawartość `gitignore.angular`,
pomijając duplikaty, po czym usuń plik pomocniczy:

```bash
printf '\n# --- Angular ---\n' >> .gitignore
grep -v -x -F -f .gitignore gitignore.angular >> .gitignore
rm gitignore.angular
```

- [ ] **Krok 5: Zainstaluj zależności**

```bash
npm install
```

- [ ] **Krok 6: Potwierdź wersję i tryb zoneless**

```bash
npx ng version
grep -rn "provideZoneChangeDetection\|zone.js" src/ angular.json package.json || echo "ZONELESS OK"
```

Oczekiwane: Angular `22.x`; brak `provideZoneChangeDetection` i brak `zone.js`
w polyfillach. W Angularze 21+ zoneless jest domyślny, więc **nie dodajemy**
`provideZonelessChangeDetection()` — obecność `provideZoneChangeDetection`
byłaby regresją do trybu z Zone.js.

- [ ] **Krok 7: Potwierdź, że runnerem testów jest Vitest**

```bash
grep -n '"builder"' angular.json | grep -i test
```

Oczekiwane: `@angular/build:unit-test`. Jeśli zamiast tego jest Karma,
podmień builder na `@angular/build:unit-test` i usuń `karma.conf.js`.

- [ ] **Krok 8: Przestaw build na statyczny prerender**

W `angular.json`, w `projects.arrowz.architect.build.options`, ustaw:

```json
{
  "outputMode": "static"
}
```

Usuń target `serve-ssr`/`server` jeśli CLI go dodał, oraz plik `src/server.ts`
i skrypt `serve:ssr:arrowz` z `package.json` — nie stawiamy procesu Node.

- [ ] **Krok 9: Zbuduj i uruchom testy startowe**

```bash
npx ng build
npx ng test --watch=false
```

Oczekiwane: build kończy się sukcesem i wypisuje wygenerowane pliki
statyczne (m.in. `index.html`); testy startowe komponentu `App` przechodzą.

- [ ] **Krok 10: Commit**

```bash
git add -A
git commit -m "Załóż szkielet aplikacji na Angularze 22"
```

---

### Task 2: Trasy i tryby renderowania

**Files:**
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/app.routes.server.ts`
- Create: `src/app/app.routes.server.spec.ts`

**Interfaces:**
- Produces: trasy `''` (ekran startowy, prerender) i `'game'` (gra, tryb
  klienta). Slice 7 podepnie pod nie komponenty.

- [ ] **Krok 1: Napisz test tras serwerowych**

Test pilnuje decyzji architektonicznej: **gra nigdy nie jest prerenderowana**.
Prerender gry oznaczałby generowanie planszy w buildzie, co jest bez sensu
(plansza zależy od ziarna wybranego w runtime) i psuje PWA.

```typescript
// src/app/app.routes.server.spec.ts
import { RenderMode } from '@angular/ssr';
import { serverRoutes } from './app.routes.server';

describe('trasy serwerowe', () => {
  it('renderuje ekran startowy statycznie', () => {
    const home = serverRoutes.find((r) => r.path === '');
    expect(home?.renderMode).toBe(RenderMode.Prerender);
  });

  it('nigdy nie prerenderuje trasy gry', () => {
    const game = serverRoutes.find((r) => r.path === 'game');
    expect(game?.renderMode).toBe(RenderMode.Client);
  });
});
```

- [ ] **Krok 2: Uruchom test i potwierdź, że nie przechodzi**

```bash
npx ng test --watch=false
```

Oczekiwane: FAIL — `serverRoutes` nie zawiera trasy `game`.

- [ ] **Krok 3: Zdefiniuj trasy**

```typescript
// src/app/app.routes.ts
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', title: 'Arrowz', loadComponent: () => import('./app').then((m) => m.App) },
  { path: 'game', title: 'Arrowz — gra', loadComponent: () => import('./app').then((m) => m.App) },
  { path: '**', redirectTo: '' },
];
```

Oba wpisy wskazują tymczasowo na `App`; Slice 7 podmieni je na właściwe
komponenty ekranów.

```typescript
// src/app/app.routes.server.ts
import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Ekran startowy jest statyczny — prerenderujemy go w buildzie.
  { path: '', renderMode: RenderMode.Prerender },
  // Plansza powstaje z ziarna wybranego w runtime, więc prerender nie ma tu sensu.
  { path: 'game', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Prerender },
];
```

- [ ] **Krok 4: Uruchom testy — mają przejść**

```bash
npx ng test --watch=false
```

Oczekiwane: PASS.

- [ ] **Krok 5: Potwierdź, że build wypluwa statyczne pliki**

```bash
npx ng build && ls dist/arrowz/browser/
```

Oczekiwane: `index.html` w katalogu `browser/`, brak katalogu `server/`.

- [ ] **Krok 6: Commit**

```bash
git add -A
git commit -m "Ustal trasy i tryby renderowania"
```

---

### Task 3: Runner testów rdzenia i pierwszy moduł

**Files:**
- Create: `vitest.core.config.ts`
- Create: `src/core/rng.ts`
- Test: `src/core/rng.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `export type Rng = () => number` oraz
  `export function mulberry32(seed: number): Rng` — używane przez **każdy**
  moduł rdzenia w slice'ach 2–5.
- Produces: skrypt `npm run test:core`.

- [ ] **Krok 1: Skonfiguruj runner rdzenia**

```typescript
// vitest.core.config.ts
import { defineConfig } from 'vitest/config';

// Rdzeń jest testowany BEZ Angulara i BEZ jsdom — w czystym Node.
// To nie jest wygoda, tylko wymóg §4 specyfikacji: generator musi dać się
// odpalić w pętli na tysiącach ziaren bez narzutu środowiska przeglądarki.
export default defineConfig({
  test: {
    name: 'core',
    environment: 'node',
    include: ['src/core/**/*.spec.ts', 'src/game/**/*.spec.ts'],
    testTimeout: 60_000, // testy własnościowe ze Slice'a 3 biegną na setkach ziaren
  },
});
```

- [ ] **Krok 2: Dodaj skrypty do `package.json`**

W sekcji `scripts`:

```json
{
  "test:core": "vitest run --config vitest.core.config.ts",
  "test:core:watch": "vitest --config vitest.core.config.ts",
  "test": "ng test --watch=false",
  "lint": "ng lint",
  "check": "npm run lint && npm run test:core && npm test && npm run build"
}
```

- [ ] **Krok 3: Napisz failujący test PRNG**

```typescript
// src/core/rng.spec.ts
import { mulberry32 } from './rng';

describe('mulberry32', () => {
  it('daje te same liczby dla tego samego ziarna', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('daje różne ciągi dla różnych ziaren', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('zwraca wartości z przedziału [0, 1)', () => {
    const r = mulberry32(999);
    for (let i = 0; i < 10_000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('rozkłada wartości równomiernie', () => {
    const r = mulberry32(7);
    const buckets = new Array<number>(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) buckets[Math.floor(r() * 10)]!++;
    // Każdy koszyk powinien dostać ~10% próbek; 8–12% to szeroki margines,
    // który wyłapie zepsuty generator, a nie zwykłą fluktuację.
    for (const b of buckets) {
      expect(b / n).toBeGreaterThan(0.08);
      expect(b / n).toBeLessThan(0.12);
    }
  });
});
```

- [ ] **Krok 4: Uruchom i potwierdź porażkę**

```bash
npm run test:core
```

Oczekiwane: FAIL — `Failed to resolve import "./rng"`.

- [ ] **Krok 5: Zaimplementuj PRNG**

```typescript
// src/core/rng.ts

/** Deterministyczne źródło losowości. Zwraca liczby z przedziału [0, 1). */
export type Rng = () => number;

/**
 * Mulberry32 — 32-bitowy PRNG o jednym słowie stanu.
 * Wybrany, bo jest krótki, szybki i w pełni deterministyczny: to samo ziarno
 * daje bitowo ten sam ciąg, co jest warunkiem odtwarzalności plansz (§12.13)
 * i weryfikacji wyniku po stronie serwera (Slice 10).
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Losowa liczba całkowita z przedziału domkniętego [lo, hi]. */
export function randInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/**
 * Losowanie z listy ważonej. Wagi muszą być nieujemne i mieć dodatnią sumę.
 * Używane przy wyborze kolejnej komórki ścieżki (Slice 2, Warnsdorff).
 */
export function weightedPick<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T {
  let total = 0;
  for (const item of items) total += weight(item);
  let r = rng() * total;
  for (const item of items) {
    r -= weight(item);
    if (r <= 0) return item;
  }
  return items[items.length - 1]!;
}
```

- [ ] **Krok 6: Dopisz testy pomocników i uruchom całość**

```typescript
// dopisz do src/core/rng.spec.ts
import { randInt, weightedPick } from './rng';

describe('randInt', () => {
  it('mieści się w przedziale domkniętym', () => {
    const r = mulberry32(3);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(randInt(r, 2, 6));
    expect([...seen].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6]);
  });
});

describe('weightedPick', () => {
  it('nigdy nie wybiera pozycji o wadze zero', () => {
    const r = mulberry32(11);
    const items = ['a', 'b', 'c'];
    const w = (x: string) => (x === 'b' ? 0 : 1);
    for (let i = 0; i < 1000; i++) expect(weightedPick(r, items, w)).not.toBe('b');
  });

  it('respektuje proporcje wag', () => {
    const r = mulberry32(13);
    const items = ['rzadki', 'częsty'];
    const w = (x: string) => (x === 'częsty' ? 9 : 1);
    let common = 0;
    for (let i = 0; i < 10_000; i++) if (weightedPick(r, items, w) === 'częsty') common++;
    expect(common / 10_000).toBeGreaterThan(0.85);
    expect(common / 10_000).toBeLessThan(0.95);
  });
});
```

```bash
npm run test:core
```

Oczekiwane: PASS, wszystkie testy zielone.

- [ ] **Krok 7: Commit**

```bash
git add -A
git commit -m "Dodaj deterministyczny generator liczb losowych"
```

---

### Task 4: Bariera architektoniczna

**Files:**
- Modify: `eslint.config.js`
- Create: `src/core/.eslintrc-check.md` (notatka wyjaśniająca regułę)

**Interfaces:**
- Produces: `npm run lint` zawodzi, gdy `core/` lub `game/` sięgnie po DOM,
  Angulara albo warstwę widoku.

Ta reguła jest **jedyną rzeczą**, która przez dziesięć slice'ów pilnuje zasady
z §4 specyfikacji. Bez niej pierwszy import `signal` w `session.ts` przejdzie
niezauważony i rdzeń przestanie być testowalny w Node.

- [ ] **Krok 1: Zainstaluj ESLint dla Angulara, jeśli CLI go nie dodał**

```bash
npx ng add @angular-eslint/schematics --skip-confirmation
```

- [ ] **Krok 2: Dopisz regułę do `eslint.config.js`**

```javascript
// eslint.config.js — dopisz na końcu eksportowanej tablicy konfiguracji
{
  files: ['src/core/**/*.ts', 'src/game/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['@angular/*'], message: 'Rdzeń nie zna Angulara (§4 specyfikacji).' },
        { group: ['**/render/*', '**/ui/*', '**/data/*'],
          message: 'Rdzeń nie importuje warstwy widoku ani danych (§4 specyfikacji).' },
        { group: ['firebase', 'firebase/*'], message: 'Rdzeń nie zna backendu (§4 specyfikacji).' },
      ],
    }],
    'no-restricted-globals': ['error',
      { name: 'document', message: 'Rdzeń nie dotyka DOM (§4 specyfikacji).' },
      { name: 'window', message: 'Rdzeń nie dotyka DOM (§4 specyfikacji).' },
      { name: 'localStorage', message: 'Rdzeń nie ma stanu globalnego (§4 specyfikacji).' },
    ],
    'no-restricted-properties': ['error',
      { object: 'Math', property: 'random',
        message: 'Losowość wyłącznie przez mulberry32(seed) — §12.13 wymaga determinizmu.' },
      { object: 'Date', property: 'now',
        message: 'Czas wchodzi jako pole akcji, nie jest odczytywany w rdzeniu (§10 specyfikacji).' },
    ],
  },
}
```

- [ ] **Krok 3: Sprawdź, że reguła faktycznie łapie naruszenie**

Reguła lintu, której nikt nie sprawdził, jest gorsza niż jej brak — daje
złudzenie ochrony. Utwórz **tymczasowo** plik naruszający:

```bash
cat > src/core/_probe.ts <<'EOF'
import { signal } from '@angular/core';
export const x = signal(Math.random());
EOF
npm run lint
```

Oczekiwane: dwa błędy — `no-restricted-imports` na `@angular/core`
i `no-restricted-properties` na `Math.random`.

- [ ] **Krok 4: Usuń plik próbny i potwierdź czysty lint**

```bash
rm src/core/_probe.ts
npm run lint
```

Oczekiwane: brak błędów.

- [ ] **Krok 5: Commit**

```bash
git add -A
git commit -m "Wprowadź barierę architektoniczną rdzenia w lincie"
```

---

### Task 5: Integracja ciągła

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: pipeline uruchamiający `lint`, `test:core`, `test`, `build` na
  każdym pushu i pull requeście.

- [ ] **Krok 1: Napisz workflow**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm
      - run: npm ci
      - run: npm run lint
      # Testy rdzenia idą pierwsze i osobno: są najszybsze i najczęściej to one
      # wyłapują regresję, bo w nich siedzi cała logika gry.
      - run: npm run test:core
      - run: npm test
      - run: npm run build
```

- [ ] **Krok 2: Uruchom lokalnie to samo, co uruchomi CI**

```bash
npm run check
```

Oczekiwane: cztery kroki po kolei, wszystkie zielone.

- [ ] **Krok 3: Commit**

```bash
git add -A
git commit -m "Dodaj pipeline integracji ciągłej"
```

---

## Kryteria odbioru slice'a

- `npm run check` przechodzi w całości.
- `npx ng version` pokazuje Angular 22.x, w projekcie nie ma `zone.js`.
- `ng build` produkuje `dist/arrowz/browser/index.html` i **nie** produkuje
  katalogu `server/`.
- Plik naruszający barierę (import `@angular/core` w `src/core/`) wywala lint —
  sprawdzone ręcznie w Zadaniu 4.
- `npm run test:core` biegnie bez Angulara i bez jsdom.
