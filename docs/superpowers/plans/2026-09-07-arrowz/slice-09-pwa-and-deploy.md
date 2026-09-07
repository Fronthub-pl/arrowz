# Slice 9 — PWA, local scores, and deploy to Cloudflare Workers

> **For agentic executors:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans`. Steps have checkboxes (`- [ ]`).

**Goal:** Close out the MVP: the game works offline, scores and settings
survive closing the tab, and the whole thing is hosted at a public address.

**Architecture:** The application is fully client-side and built as a static
prerender, so offline doesn't require any special logic — the Angular
service worker in cache-first mode is enough. Scores are kept in
`localStorage` behind a narrow `ScoreStore` interface, which **Slice 10 will
replace with an implementation syncing to Firebase**, without touching the
rest of the application. Hosting is a Cloudflare Worker with Static Assets —
no Worker script, just the `dist/arrowz/browser` directory.

**Stack:** `@angular/pwa` (Angular service worker), `localStorage`,
Wrangler 4.x, Cloudflare Workers Static Assets.

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md` (§1 "PWA", §11)

**Map:** `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`

## Global Constraints

The constraints from the implementation map apply. Critical for this slice:

- **The game must be playable without network access and without signing
  in.** This is a requirement, not a nicety: the sync from Slice 10 is a
  layer added on top, not a condition to start.
- `localStorage` is not accessible from `core/` and `game/` (lint barrier) —
  access only through `data/`.
- Wrangler: configuration in `wrangler.jsonc`, `compatibility_date` set to
  the deploy date, run `wrangler types` after configuration changes.

## File Structure

| File | Responsibility |
|---|---|
| `src/data/score-store.ts` | `ScoreStore` interface and `LocalScoreStore` |
| `src/data/settings-store.ts` | remembered settings: level, format, variant, stroke width |
| `src/data/score-store.spec.ts` | persistence tests and resilience against corrupted data |
| `ngsw-config.json` | service worker cache rules |
| `public/manifest.webmanifest` | PWA manifest |
| `wrangler.jsonc` | Worker configuration with Static Assets |
| `.github/workflows/deploy.yml` | deployment after merge to `main` |

---

### Task 1: Local scores and settings

**Files:**
- Create: `src/data/score-store.ts`
- Create: `src/data/settings-store.ts`
- Test: `src/data/score-store.spec.ts`

**Interfaces:**
- Produces:
  - `interface ScoreEntry { id: string; level: LevelId | 'custom'; format: BoardFormat; mode: GameMode; seed: number; score: number; elapsedMs: number; livesLeft: number; playedAt: number; synced: boolean }`
  - `interface ScoreStore { list(): ScoreEntry[]; add(entry: Omit<ScoreEntry, 'id' | 'synced'>): ScoreEntry; best(level: LevelId | 'custom', format: BoardFormat): ScoreEntry | null; markSynced(ids: readonly string[]): void; pendingSync(): ScoreEntry[] }`
  - `class LocalScoreStore implements ScoreStore`
  - `class SettingsStore` with signals `level`, `format`, `mode`, `strokeRatio`

The `synced` field exists from the start, even though nothing sets it in
this slice: Slice 10 needs a queue of entries to send, and adding the field
to already-saved data later would mean migrating `localStorage`.

- [ ] **Step 1: Write failing tests**

```typescript
// src/data/score-store.spec.ts
import { LocalScoreStore, SCORES_KEY } from './score-store';

describe('LocalScoreStore', () => {
  beforeEach(() => localStorage.clear());

  it('starts with an empty list', () => {
    expect(new LocalScoreStore().list()).toEqual([]);
  });

  it('saves a score and survives a reload', () => {
    const store = new LocalScoreStore();
    store.add({
      level: 'easy', format: 'tall', mode: 'classic', seed: 7,
      score: 312, elapsedMs: 120_000, livesLeft: 2, playedAt: 1_700_000_000_000,
    });
    expect(new LocalScoreStore().list().length).toBe(1);
    expect(new LocalScoreStore().list()[0]!.score).toBe(312);
  });

  it('assigns ids to scores and marks them as not synced', () => {
    const store = new LocalScoreStore();
    const entry = store.add({
      level: 'easy', format: 'tall', mode: 'classic', seed: 7,
      score: 100, elapsedMs: 1_000, livesLeft: 3, playedAt: 1,
    });
    expect(entry.id).toBeTruthy();
    expect(entry.synced).toBe(false);
    expect(store.pendingSync().map((e) => e.id)).toEqual([entry.id]);
  });

  it('returns the best score for a level and format', () => {
    const store = new LocalScoreStore();
    const base = { mode: 'classic' as const, seed: 1, elapsedMs: 1_000, livesLeft: 3, playedAt: 1 };
    store.add({ ...base, level: 'easy', format: 'tall', score: 100 });
    store.add({ ...base, level: 'easy', format: 'tall', score: 250 });
    store.add({ ...base, level: 'easy', format: 'square', score: 900 });
    expect(store.best('easy', 'tall')!.score).toBe(250);
    expect(store.best('medium', 'tall')).toBeNull();
  });

  it('marks scores as synced', () => {
    const store = new LocalScoreStore();
    const entry = store.add({
      level: 'easy', format: 'tall', mode: 'classic', seed: 7,
      score: 100, elapsedMs: 1_000, livesLeft: 3, playedAt: 1,
    });
    store.markSynced([entry.id]);
    expect(store.pendingSync()).toEqual([]);
    expect(new LocalScoreStore().list()[0]!.synced).toBe(true);
  });

  it('survives corrupted localStorage content', () => {
    localStorage.setItem(SCORES_KEY, '{this is not JSON');
    expect(new LocalScoreStore().list()).toEqual([]);
  });

  it('survives data in an unexpected shape', () => {
    localStorage.setItem(SCORES_KEY, '{"a":1}');
    expect(new LocalScoreStore().list()).toEqual([]);
  });

  it('caps the history so it does not grow unbounded', () => {
    const store = new LocalScoreStore();
    for (let i = 0; i < 250; i++) {
      store.add({
        level: 'easy', format: 'tall', mode: 'classic', seed: i,
        score: i, elapsedMs: 1_000, livesLeft: 3, playedAt: i,
      });
    }
    expect(store.list().length).toBeLessThanOrEqual(200);
    // The best score must NOT fall out of the history when trimming.
    expect(store.best('easy', 'tall')!.score).toBe(249);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx ng test --watch=false
```

Expected: FAIL — module `./score-store` is missing.

- [ ] **Step 3: Implement the score store**

```typescript
// src/data/score-store.ts
import { BoardFormat, LevelId } from '../core/presets';
import { GameMode } from '../game/session';

export const SCORES_KEY = 'arrowz.scores.v1';
const MAX_ENTRIES = 200;

export interface ScoreEntry {
  id: string;
  level: LevelId | 'custom';
  format: BoardFormat;
  mode: GameMode;
  seed: number;
  score: number;
  elapsedMs: number;
  livesLeft: number;
  playedAt: number;
  /** Whether the score has already reached the server. Only Slice 10 sets this. */
  synced: boolean;
}

export interface ScoreStore {
  list(): ScoreEntry[];
  add(entry: Omit<ScoreEntry, 'id' | 'synced'>): ScoreEntry;
  best(level: LevelId | 'custom', format: BoardFormat): ScoreEntry | null;
  markSynced(ids: readonly string[]): void;
  pendingSync(): ScoreEntry[];
}

function isScoreEntry(value: unknown): value is ScoreEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return typeof e['id'] === 'string' && typeof e['score'] === 'number' &&
    typeof e['level'] === 'string' && typeof e['format'] === 'string';
}

/**
 * Scores in localStorage.
 *
 * The interface is deliberately narrow: Slice 10 will substitute an
 * implementation syncing with Firestore, and the rest of the application
 * won't notice.
 */
export class LocalScoreStore implements ScoreStore {
  private entries: ScoreEntry[] = this.read();

  list(): ScoreEntry[] {
    return [...this.entries];
  }

  add(entry: Omit<ScoreEntry, 'id' | 'synced'>): ScoreEntry {
    const full: ScoreEntry = { ...entry, id: crypto.randomUUID(), synced: false };
    this.entries = [full, ...this.entries];
    this.trim();
    this.write();
    return full;
  }

  best(level: LevelId | 'custom', format: BoardFormat): ScoreEntry | null {
    let best: ScoreEntry | null = null;
    for (const e of this.entries) {
      if (e.level !== level || e.format !== format) continue;
      if (!best || e.score > best.score) best = e;
    }
    return best;
  }

  markSynced(ids: readonly string[]): void {
    const set = new Set(ids);
    this.entries = this.entries.map((e) => (set.has(e.id) ? { ...e, synced: true } : e));
    this.write();
  }

  pendingSync(): ScoreEntry[] {
    return this.entries.filter((e) => !e.synced);
  }

  private read(): ScoreEntry[] {
    try {
      const raw = localStorage.getItem(SCORES_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isScoreEntry);
    } catch {
      // Corrupted content must not crash the game — the only thing worse
      // than losing the history would be the game failing to start.
      return [];
    }
  }

  private write(): void {
    try {
      localStorage.setItem(SCORES_KEY, JSON.stringify(this.entries));
    } catch {
      // Out of space or private mode: the game keeps working, just without history.
    }
  }

  /**
   * Trimming preserves the best score for each (level, format) pair —
   * otherwise a lifetime record would fall out after two hundred games.
   */
  private trim(): void {
    if (this.entries.length <= MAX_ENTRIES) return;
    const keep = new Set<string>();
    const bestOf = new Map<string, ScoreEntry>();
    for (const e of this.entries) {
      const key = `${e.level}/${e.format}`;
      const current = bestOf.get(key);
      if (!current || e.score > current.score) bestOf.set(key, e);
    }
    for (const e of bestOf.values()) keep.add(e.id);
    for (const e of this.entries.filter((x) => !x.synced)) keep.add(e.id);

    const recent = this.entries.slice(0, MAX_ENTRIES);
    const recentIds = new Set(recent.map((e) => e.id));
    const rescued = this.entries.filter((e) => keep.has(e.id) && !recentIds.has(e.id));
    this.entries = [...recent, ...rescued].slice(0, MAX_ENTRIES + rescued.length);
  }
}
```

```typescript
// src/data/settings-store.ts
import { Injectable, effect, signal } from '@angular/core';
import { BoardFormat, LevelId } from '../core/presets';
import { GameMode } from '../game/session';

const SETTINGS_KEY = 'arrowz.settings.v1';

interface Settings {
  level: LevelId;
  format: BoardFormat;
  mode: GameMode;
  strokeRatio: number;
}

const DEFAULTS: Settings = { level: 'easy', format: 'tall', mode: 'classic', strokeRatio: 0.5 };

@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly state = signal<Settings>(this.read());

  readonly level = signal(this.state().level);
  readonly format = signal(this.state().format);
  readonly mode = signal(this.state().mode);
  readonly strokeRatio = signal(this.state().strokeRatio);

  constructor() {
    effect(() => {
      const next: Settings = {
        level: this.level(),
        format: this.format(),
        mode: this.mode(),
        strokeRatio: this.strokeRatio(),
      };
      this.state.set(next);
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // Settings are a convenience, not a condition for playing.
      }
    });
  }

  private read(): Settings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return DEFAULTS;
      return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
    } catch {
      return DEFAULTS;
    }
  }
}
```

- [ ] **Step 4: Wire up saving the score on a win**

In `Game` (Slice 7) add four fields and a save on the transition to `won`.
The fields are needed because the session knows the board but not which
preset and seed it came from — and a score without that information is
useless for verification (Slice 10).

```typescript
  private readonly scores = inject(SCORE_STORE);

  /** Where the current board came from — set in `newGame`. */
  private currentLevel: LevelId | 'custom' = 'easy';
  private currentFormat: BoardFormat = 'tall';
  private currentSeed = 0;
  /** Timestamps of successive clicks; the reducer only stores the ids. */
  private moveTimestamps: number[] = [];
  /** Guard against recording the same win twice. */
  private recorded = false;

  constructor() {
    // …existing afterNextRender…
    effect(() => {
      const session = this.store.session();
      if (session?.status !== 'won' || this.recorded) return;
      this.recorded = true;
      this.scores.add({
        level: this.currentLevel,
        format: this.currentFormat,
        mode: session.mode,
        seed: this.currentSeed,
        score: session.score,
        elapsedMs: session.elapsedMs,
        livesLeft: session.lives,
        playedAt: Date.now(),
        // Record of the playthrough; Slice 10 will send it for verification.
        moves: session.moves,
        timestamps: this.moveTimestamps,
        startedAt: session.startedAt,
      });
    });
  }
```

In `newGame`, remember the parameters and reset the log, and in
`handleClick` append a timestamp:

```typescript
  // in newGame, after generating the board:
  this.currentLevel = level;
  this.currentFormat = format;
  this.currentSeed = usedSeed;   // seed returned by the store, not re-rolled
  this.moveTimestamps = [];
  this.recorded = false;

  // in handleClick, before calling store.click:
  this.moveTimestamps.push(Date.now());
```

For `usedSeed` to be known, `GameStore.start` must expose the seed used —
add a `seed` signal to it, set in `start` and `startCustom`.

together with a DI token, so Slice 10 can swap the implementation:

```typescript
// src/data/score-store.ts — dopisz
import { InjectionToken } from '@angular/core';

export const SCORE_STORE = new InjectionToken<ScoreStore>('SCORE_STORE', {
  providedIn: 'root',
  factory: () => new LocalScoreStore(),
});
```

- [ ] **Step 5: Run tests — they must pass**

```bash
npx ng test --watch=false
```

Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add local score and settings store"
```

---

### Task 2: PWA and offline support

**Files:**
- Modify: `angular.json`, `package.json` (via `ng add`)
- Create: `ngsw-config.json`, `public/manifest.webmanifest`, icons
- Modify: `src/app/app.config.ts`

**Interfaces:**
- Produces: an installable application that works after the network is cut.

- [ ] **Step 1: Add the PWA package**

```bash
npx ng add @angular/pwa --skip-confirmation
```

The schematic adds `provideServiceWorker` to `app.config.ts`, creates
`ngsw-config.json`, the manifest, and the full set of icons.

- [ ] **Step 2: Set the cache strategy**

In `ngsw-config.json`, make sure the app shell is prefetched up front rather
than lazily — the game must work offline **from the very first launch after
installation**:

```json
{
  "$schema": "./node_modules/@angular/service-worker/config/schema.json",
  "index": "/index.html",
  "assetGroups": [
    {
      "name": "app",
      "installMode": "prefetch",
      "resources": {
        "files": ["/favicon.ico", "/index.html", "/manifest.webmanifest", "/*.css", "/*.js"]
      }
    },
    {
      "name": "assets",
      "installMode": "prefetch",
      "updateMode": "prefetch",
      "resources": {
        "files": ["/**/*.(svg|webp|png|woff2)"]
      }
    }
  ]
}
```

`updateMode: prefetch` in the second group is deliberate: icons and fonts
are small, and their absence right after an update would be noticeable
immediately.

- [ ] **Step 3: Fill in the manifest**

In `public/manifest.webmanifest`:

```json
{
  "name": "Arrowz",
  "short_name": "Arrowz",
  "description": "An arrow-piece logic puzzle: guide every piece off the board.",
  "theme_color": "#232447",
  "background_color": "#f6f6fa",
  "display": "standalone",
  "orientation": "portrait",
  "scope": "./",
  "start_url": "./",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

`orientation: portrait` matches the tall board format, which corresponds to
a phone screen (§9).

- [ ] **Step 4: Verify offline behavior**

```bash
npx ng build
npx http-server dist/arrowz/browser -p 4300 --silent &
open http://localhost:4300
```

In DevTools:

1. **Application → Service Workers**: worker registered and active,
2. **Network → Offline**, reload the page: the app comes up,
3. play a round offline — generation is client-side, so it must work,
4. **Application → Manifest**: no warnings about icons.

Stop the server once done (`kill %1`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Enable PWA mode with offline support"
```

---

### Task 3: Deploy to Cloudflare Workers

**Files:**
- Create: `wrangler.jsonc`
- Create: `public/.assetsignore` (if needed)
- Create: `.github/workflows/deploy.yml`
- Modify: `package.json` (`deploy`, `preview:cf` scripts)

**Interfaces:**
- Produces: a public address for the application and CI-driven deployment.

The Worker **has no script** — it only serves the built files. This is the
simplest possible setup, and exactly the one Cloudflare recommends for
static sites.

- [ ] **Step 1: Install Wrangler**

```bash
npm install --save-dev wrangler@latest
npx wrangler --version   # requires 4.x or newer
```

- [ ] **Step 2: Write the configuration**

```jsonc
// wrangler.jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "arrowz",
  // Set to the deploy date (format YYYY-MM-DD).
  "compatibility_date": "2026-09-07",
  "assets": {
    "directory": "./dist/arrowz/browser",
    // The /game route is rendered entirely on the client, so there's no
    // HTML file for it. SPA-style 404 handling serves index.html with a
    // 200 status, and the Angular router picks the right screen.
    "not_found_handling": "single-page-application"
  },
  "observability": {
    "enabled": true
  }
}
```

Note: the `"binding": "ASSETS"` field **does not appear** — it's only valid
when the Worker has a script (`main`), and ours doesn't.

- [ ] **Step 3: Build and verify locally**

```bash
npm run build
npx wrangler dev
```

Open the printed address and check three paths:

1. `/` — the start screen (prerendered file),
2. `/game?level=easy&format=tall&mode=classic` — the game comes up despite
   there being no `game/index.html` file,
3. reloading the page on `/configure` — does not give a 404.

If any of these returns 404, `not_found_handling` did not work — check
whether `assets.directory` points at the **`browser`** directory, not
`dist/`.

- [ ] **Step 4: Deploy manually for the first time**

```bash
npx wrangler login
npx wrangler deploy
```

Note the `*.workers.dev` address in the README.

- [ ] **Step 5: Add scripts**

In `package.json`:

```json
{
  "deploy": "npm run build && wrangler deploy",
  "preview:cf": "npm run build && wrangler dev"
}
```

- [ ] **Step 6: Deployment from CI**

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm
      - run: npm ci
      # We only deploy what has passed the tests — the core suite is fast,
      # so there's no reason to skip it.
      - run: npm run test:core
      - run: npm test
      - run: npm run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

Create the token in the Cloudflare dashboard with **Edit Cloudflare
Workers** permission and store it as a repository secret. Do not put it in
the configuration file.

- [ ] **Step 7: Verify the deployed version**

Open the production address and repeat the offline test from Task 2 — this
time over real HTTPS, since the service worker only registers in a secure
context.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add deployment to Cloudflare Workers"
```

---

### Task 4: Closing out the MVP

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-07-arrowz-design.md`

- [ ] **Step 1: Describe the project in the README**

The README should answer four questions: what this is, how to run it, how
to test it, and where it's hosted.

```markdown
# Arrowz

A browser-based logic puzzle: a grid holds a tangle of multi-cell arrows.
Clicking an arrow tries to guide it off the board in the direction its head
points. A collision costs a life. Goal: clear the board without losing
three lives.

## Running it

```bash
npm install
npm start          # http://localhost:4200
```

## Tests and measurements

```bash
npm run test:core  # core in Node: generator, solver, reducer
npm test           # components and renderer
npm run bench      # generator benchmark
npm run preview    # SVG preview for visual review
npm run check      # everything at once, as in CI
```

## Documentation

- spec: `docs/superpowers/specs/2026-09-07-arrowz-design.md`
- implementation plan: `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`
- measurements: `docs/benchmarks/`
```

- [ ] **Step 2: Check off the MVP scope in the spec**

In §1 of the spec, note next to each MVP scope item whether it was
delivered, and cite the slice. List unfinished items explicitly — the plan
should not pretend everything went smoothly.

- [ ] **Step 3: Play through the whole game once more**

In production, on a phone and on desktop:

1. Easy tall, classic variant — to the end,
2. Nightmare tall — check generation time and zoom smoothness,
3. advanced mode with extreme parameters — check the report,
4. airplane mode — the board generates offline,
5. PWA installation on a phone and launching from the icon.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Close out the MVP scope"
```

---

## Slice Acceptance Criteria

- The game works **without network access**: after installing the PWA, a
  full round can be played in airplane mode.
- Scores and settings survive closing the tab; corrupted `localStorage`
  content does not crash the application.
- The application is hosted at a public address on Cloudflare Workers, and
  deployment runs from CI after a merge to `main`.
- Reloading the page on `/game` and `/configure` does not give a 404.
- The README describes running the app, testing, and measurements.
- §1 of the spec has the MVP scope checked off, with an explicit list of
  what remains.
