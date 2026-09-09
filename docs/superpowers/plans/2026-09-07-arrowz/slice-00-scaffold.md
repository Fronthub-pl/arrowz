# Slice 0 — Application Scaffold

> **Superseded (2026-09-09).** The workspace is created by
> `docs/superpowers/plans/2026-09-09-monorepo.md`; the Angular application
> is generated inside it in a later step. Kept for the record.

> **For agentic executors:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans`. Steps have checkboxes (`- [ ]`).

**Goal:** Stand up an Angular 22 workspace where `npm run test:core`,
`npm test` and `npm run build` pass, and the "core doesn't know about the
DOM" barrier is enforced by lint, not by good intentions.

**Architecture:** One workspace, two test paths. Core tests run
**directly in Vitest under Node**, without Angular and without jsdom — so
the generator can be run in a loop over thousands of seeds without
overhead. Component tests run through `@angular/build:unit-test`. The
build is a static prerender: `outputMode: "static"`, the game route
rendered client-only.

**Stack:** Angular CLI 22.1.7 (`latest` as of 2026-09-07), TypeScript strict,
Vitest, ESLint flat config, Node 24.

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md` (§3, §4)

**Map:** `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`

## Global Constraints

The constraints from the "Global Constraints" section of the implementation
map apply. For this slice, the most important ones:

- `src/core/` and `src/game/` do not import `@angular/*`, `src/render/*`,
  `src/ui/*`, `src/data/*`, and do not touch `document` / `window`.
- `strict: true` and `noUncheckedIndexedAccess: true` in `tsconfig.json`.
- The only source of randomness in the core: `mulberry32(seed)`.
- Commits in English, imperative mood, no attribution line.

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | scripts `test:core`, `test`, `build`, `lint` |
| `angular.json` | application builder, `outputMode: "static"`, test builder |
| `tsconfig.json` | `strict`, `noUncheckedIndexedAccess`, paths |
| `vitest.core.config.ts` | core runner: `node` environment, pattern `src/{core,game}/**/*.spec.ts` |
| `eslint.config.js` | architectural barrier for `core/` and `game/` |
| `src/app/app.config.ts` | application providers (zoneless is the default in v22) |
| `src/app/app.routes.ts` | routes: `''` → start screen, `game` → game |
| `src/app/app.routes.server.ts` | render modes: prerender + `RenderMode.Client` for the game |
| `src/core/rng.ts` | `mulberry32` — the first real core module |
| `src/core/rng.spec.ts` | determinism and range tests |
| `.github/workflows/ci.yml` | lint + core tests + app tests + build |

Directories created empty for later slices: `src/core/`, `src/game/`,
`src/render/`, `src/ui/`, `src/data/`.

---

### Task 1: Angular 22 workspace in an existing repository

**Files:**
- Create: `package.json`, `angular.json`, `tsconfig.json`, `src/**` (via the CLI)
- Modify: `.gitignore`

**Interfaces:**
- Produces: a working workspace; the commands `npx ng build` and `npx ng test`.

The repository **is not empty** — it already contains `docs/`, `prototype/`,
`.gitignore` and `.basic-memory/`. `ng new` will refuse to work in such a
directory, so we generate it alongside and move it in.

- [ ] **Step 1: Confirm that `latest` is still Angular 22**

```bash
npm view @angular/cli dist-tags.latest
```

Expected: `22.1.7` or a newer `22.x`. If it comes back `21.x` or lower,
stop and report — the plan assumes v22 (zoneless and Vitest as defaults).

- [ ] **Step 2: Generate the workspace in a temporary directory**

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

`--ssr=true` adds `@angular/ssr`; in Step 8 we'll switch it to plain
prerender, with no server process. If the CLI asks about `--server-routing`
despite `--defaults`, answer yes.

- [ ] **Step 3: Move the contents to the repository root**

```bash
shopt -s dotglob
mv .ng-tmp/.gitignore .ng-tmp/gitignore.angular
mv .ng-tmp/* .
rmdir .ng-tmp
shopt -u dotglob
```

- [ ] **Step 4: Merge `.gitignore`**

Append the contents of `gitignore.angular` to the end of the existing
`.gitignore`, skipping duplicates, then remove the helper file:

```bash
printf '\n# --- Angular ---\n' >> .gitignore
grep -v -x -F -f .gitignore gitignore.angular >> .gitignore
rm gitignore.angular
```

- [ ] **Step 5: Install dependencies**

```bash
npm install
```

- [ ] **Step 6: Confirm the version and zoneless mode**

```bash
npx ng version
grep -rn "provideZoneChangeDetection\|zone.js" src/ angular.json package.json || echo "ZONELESS OK"
```

Expected: Angular `22.x`; no `provideZoneChangeDetection` and no `zone.js`
in the polyfills. In Angular 21+, zoneless is the default, so we
**do not add** `provideZonelessChangeDetection()` — the presence of
`provideZoneChangeDetection` would be a regression to Zone.js mode.

- [ ] **Step 7: Confirm that the test runner is Vitest**

```bash
grep -n '"builder"' angular.json | grep -i test
```

Expected: `@angular/build:unit-test`. If Karma is there instead, swap the
builder for `@angular/build:unit-test` and remove `karma.conf.js`.

- [ ] **Step 8: Switch the build to static prerender**

In `angular.json`, under `projects.arrowz.architect.build.options`, set:

```json
{
  "outputMode": "static"
}
```

Remove the `serve-ssr`/`server` target if the CLI added it, along with the
`src/server.ts` file and the `serve:ssr:arrowz` script from `package.json`
— we are not standing up a Node process.

- [ ] **Step 9: Build and run the starter tests**

```bash
npx ng build
npx ng test --watch=false
```

Expected: the build succeeds and prints the generated static files
(including `index.html`); the starter tests for the `App` component pass.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Set up the application scaffold on Angular 22"
```

---

### Task 2: Routes and render modes

**Files:**
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/app.routes.server.ts`
- Create: `src/app/app.routes.server.spec.ts`

**Interfaces:**
- Produces: routes `''` (start screen, prerender) and `'game'` (game,
  client mode). Slice 7 will wire components into them.

- [ ] **Step 1: Write the server routes test**

The test guards an architectural decision: **the game is never
prerendered**. Prerendering the game would mean generating the board at
build time, which makes no sense (the board depends on a seed chosen at
runtime) and breaks the PWA.

```typescript
// src/app/app.routes.server.spec.ts
import { RenderMode } from '@angular/ssr';
import { serverRoutes } from './app.routes.server';

describe('server routes', () => {
  it('renders the start screen statically', () => {
    const home = serverRoutes.find((r) => r.path === '');
    expect(home?.renderMode).toBe(RenderMode.Prerender);
  });

  it('never prerenders the game route', () => {
    const game = serverRoutes.find((r) => r.path === 'game');
    expect(game?.renderMode).toBe(RenderMode.Client);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npx ng test --watch=false
```

Expected: FAIL — `serverRoutes` does not contain the `game` route.

- [ ] **Step 3: Define the routes**

```typescript
// src/app/app.routes.ts
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', title: 'Arrowz', loadComponent: () => import('./app').then((m) => m.App) },
  { path: 'game', title: 'Arrowz — Game', loadComponent: () => import('./app').then((m) => m.App) },
  { path: '**', redirectTo: '' },
];
```

Both entries temporarily point to `App`; Slice 7 will swap them for the
actual screen components.

```typescript
// src/app/app.routes.server.ts
import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // The start screen is static — we prerender it at build time.
  { path: '', renderMode: RenderMode.Prerender },
  // The board is generated from a seed chosen at runtime, so prerendering it makes no sense.
  { path: 'game', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Prerender },
];
```

- [ ] **Step 4: Run the tests — they must pass**

```bash
npx ng test --watch=false
```

Expected: PASS.

- [ ] **Step 5: Confirm that the build emits static files**

```bash
npx ng build && ls dist/arrowz/browser/
```

Expected: `index.html` in the `browser/` directory, no `server/` directory.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Define routes and render modes"
```

---

### Task 3: Core test runner and the first module

**Files:**
- Create: `vitest.core.config.ts`
- Create: `src/core/rng.ts`
- Test: `src/core/rng.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `export type Rng = () => number` and
  `export function mulberry32(seed: number): Rng` — used by **every**
  core module in slices 2–5.
- Produces: the `npm run test:core` script.

- [ ] **Step 1: Configure the core runner**

```typescript
// vitest.core.config.ts
import { defineConfig } from 'vitest/config';

// The core is tested WITHOUT Angular and WITHOUT jsdom — in plain Node.
// This isn't a convenience, it's a requirement of spec §4: the generator
// must be runnable in a loop over thousands of seeds without the overhead
// of a browser environment.
export default defineConfig({
  test: {
    name: 'core',
    environment: 'node',
    include: ['src/core/**/*.spec.ts', 'src/game/**/*.spec.ts'],
    testTimeout: 60_000, // property-based tests from Slice 3 run over hundreds of seeds
  },
});
```

- [ ] **Step 2: Add scripts to `package.json`**

In the `scripts` section:

```json
{
  "test:core": "vitest run --config vitest.core.config.ts",
  "test:core:watch": "vitest --config vitest.core.config.ts",
  "test": "ng test --watch=false",
  "lint": "ng lint",
  "check": "npm run lint && npm run test:core && npm test && npm run build"
}
```

- [ ] **Step 3: Write a failing PRNG test**

```typescript
// src/core/rng.spec.ts
import { mulberry32 } from './rng';

describe('mulberry32', () => {
  it('gives the same numbers for the same seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('gives different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('returns values in the range [0, 1)', () => {
    const r = mulberry32(999);
    for (let i = 0; i < 10_000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('distributes values evenly', () => {
    const r = mulberry32(7);
    const buckets = new Array<number>(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) buckets[Math.floor(r() * 10)]!++;
    // Each bucket should get ~10% of the samples; 8–12% is a wide margin
    // that catches a broken generator without flagging ordinary fluctuation.
    for (const b of buckets) {
      expect(b / n).toBeGreaterThan(0.08);
      expect(b / n).toBeLessThan(0.12);
    }
  });
});
```

- [ ] **Step 4: Run and confirm failure**

```bash
npm run test:core
```

Expected: FAIL — `Failed to resolve import "./rng"`.

- [ ] **Step 5: Implement the PRNG**

```typescript
// src/core/rng.ts

/** Deterministic source of randomness. Returns numbers in the range [0, 1). */
export type Rng = () => number;

/**
 * Mulberry32 — a 32-bit PRNG with a single word of state.
 * Chosen because it is short, fast, and fully deterministic: the same seed
 * gives the bit-identical sequence, which is a requirement for board
 * reproducibility (§12.13) and server-side result verification (Slice 10).
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

/** A random integer from the closed range [lo, hi]. */
export function randInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/**
 * Weighted pick from a list. Weights must be non-negative and sum to a
 * positive value. Used when choosing the next cell along the path
 * (Slice 2, Warnsdorff).
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

- [ ] **Step 6: Add helper tests and run the whole suite**

```typescript
// append to src/core/rng.spec.ts
import { randInt, weightedPick } from './rng';

describe('randInt', () => {
  it('stays within the closed range', () => {
    const r = mulberry32(3);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(randInt(r, 2, 6));
    expect([...seen].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6]);
  });
});

describe('weightedPick', () => {
  it('never picks an item with weight zero', () => {
    const r = mulberry32(11);
    const items = ['a', 'b', 'c'];
    const w = (x: string) => (x === 'b' ? 0 : 1);
    for (let i = 0; i < 1000; i++) expect(weightedPick(r, items, w)).not.toBe('b');
  });

  it('respects weight proportions', () => {
    const r = mulberry32(13);
    const items = ['rare', 'common'];
    const w = (x: string) => (x === 'common' ? 9 : 1);
    let common = 0;
    for (let i = 0; i < 10_000; i++) if (weightedPick(r, items, w) === 'common') common++;
    expect(common / 10_000).toBeGreaterThan(0.85);
    expect(common / 10_000).toBeLessThan(0.95);
  });
});
```

```bash
npm run test:core
```

Expected: PASS, all tests green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add a deterministic random number generator"
```

---

### Task 4: Architectural barrier

**Files:**
- Modify: `eslint.config.js`
- Create: `src/core/.eslintrc-check.md` (note explaining the rule)

**Interfaces:**
- Produces: `npm run lint` fails when `core/` or `game/` reaches for the
  DOM, Angular, or the view layer.

This rule is the **only thing** that, across ten slices, guards the rule
from spec §4. Without it, the first `signal` import in `session.ts` would
slip through unnoticed and the core would stop being testable in Node.

- [ ] **Step 1: Install ESLint for Angular, if the CLI didn't add it**

```bash
npx ng add @angular-eslint/schematics --skip-confirmation
```

- [ ] **Step 2: Add the rule to `eslint.config.js`**

```javascript
// eslint.config.js — append to the end of the exported configuration array
{
  files: ['src/core/**/*.ts', 'src/game/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['@angular/*'], message: 'The core does not know about Angular (spec §4).' },
        { group: ['**/render/*', '**/ui/*', '**/data/*'],
          message: 'The core does not import the view or data layer (spec §4).' },
        { group: ['firebase', 'firebase/*'], message: 'The core does not know about the backend (spec §4).' },
      ],
    }],
    'no-restricted-globals': ['error',
      { name: 'document', message: 'The core does not touch the DOM (spec §4).' },
      { name: 'window', message: 'The core does not touch the DOM (spec §4).' },
      { name: 'localStorage', message: 'The core has no global state (spec §4).' },
    ],
    'no-restricted-properties': ['error',
      { object: 'Math', property: 'random',
        message: 'Randomness only through mulberry32(seed) — §12.13 requires determinism.' },
      { object: 'Date', property: 'now',
        message: 'Time comes in as an action field, it is not read inside the core (spec §10).' },
    ],
  },
}
```

- [ ] **Step 3: Confirm the rule actually catches a violation**

A lint rule that no one has verified is worse than not having it — it
gives a false sense of protection. Create a **temporary** violating file:

```bash
cat > src/core/_probe.ts <<'EOF'
import { signal } from '@angular/core';
export const x = signal(Math.random());
EOF
npm run lint
```

Expected: two errors — `no-restricted-imports` on `@angular/core`
and `no-restricted-properties` on `Math.random`.

- [ ] **Step 4: Remove the probe file and confirm a clean lint**

```bash
rm src/core/_probe.ts
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add the core architectural barrier to lint"
```

---

### Task 5: Continuous integration

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: a pipeline running `lint`, `test:core`, `test`, `build` on
  every push and pull request.

- [ ] **Step 1: Write the workflow**

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
      # Core tests come first and run separately: they are the fastest and
      # most often the ones that catch a regression, since that's where all
      # the game logic lives.
      - run: npm run test:core
      - run: npm test
      - run: npm run build
```

- [ ] **Step 2: Run locally what CI will run**

```bash
npm run check
```

Expected: four steps in sequence, all green.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add the continuous integration pipeline"
```

---

## Slice acceptance criteria

- `npm run check` passes in full.
- `npx ng version` shows Angular 22.x, the project has no `zone.js`.
- `ng build` produces `dist/arrowz/browser/index.html` and **does not**
  produce a `server/` directory.
- The file violating the barrier (importing `@angular/core` in `src/core/`)
  fails the lint — verified manually in Task 4.
- `npm run test:core` runs without Angular and without jsdom.
