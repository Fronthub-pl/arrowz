# Slice 9 — PWA, wyniki lokalne i deploy na Cloudflare Workers

> **Dla wykonawców agentowych:** WYMAGANA PODUMIEJĘTNOŚĆ: użyj
> `superpowers:subagent-driven-development` (zalecane) albo
> `superpowers:executing-plans`. Kroki mają checkboxy (`- [ ]`).

**Cel:** Domknąć MVP: gra działa offline, wyniki i ustawienia przeżywają
zamknięcie karty, a całość stoi pod publicznym adresem.

**Architektura:** Aplikacja jest w pełni klientowa i budowana jako statyczny
prerender, więc offline nie wymaga żadnej logiki — wystarczy service worker
Angulara w trybie cache-first. Wyniki trzymamy w `localStorage` za wąskim
interfejsem `ScoreStore`, którego **Slice 10 zastąpi implementacją
synchronizującą z Firebase**, nie dotykając reszty aplikacji. Hosting to
Cloudflare Worker ze Static Assets — bez skryptu Workera, sam katalog
`dist/arrowz/browser`.

**Stack:** `@angular/pwa` (service worker Angulara), `localStorage`,
Wrangler 4.x, Cloudflare Workers Static Assets.

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md` (§1 „PWA", §11)

**Mapa:** `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`

## Global Constraints

Obowiązują ograniczenia z mapy wdrożenia. Krytyczne dla tego slice'a:

- **Gra musi być grywalna bez sieci i bez logowania.** To wymóg, nie
  udogodnienie: synchronizacja ze Slice'a 10 jest warstwą nakładaną, nie
  warunkiem startu.
- `localStorage` jest niedostępny w `core/` i `game/` (bariera z lintu) —
  dostęp wyłącznie przez `data/`.
- Wrangler: konfiguracja w `wrangler.jsonc`, `compatibility_date` ustawiona na
  datę wdrożenia, po zmianach konfiguracji `wrangler types`.

## File Structure

| Plik | Odpowiedzialność |
|---|---|
| `src/data/score-store.ts` | interfejs `ScoreStore` i `LocalScoreStore` |
| `src/data/settings-store.ts` | zapamiętane ustawienia: poziom, format, wariant, grubość linii |
| `src/data/score-store.spec.ts` | testy trwałości i odporności na zepsute dane |
| `ngsw-config.json` | reguły cache service workera |
| `public/manifest.webmanifest` | manifest PWA |
| `wrangler.jsonc` | konfiguracja Workera ze Static Assets |
| `.github/workflows/deploy.yml` | wdrożenie po merge'u do `main` |

---

### Task 1: Wyniki i ustawienia lokalne

**Files:**
- Create: `src/data/score-store.ts`
- Create: `src/data/settings-store.ts`
- Test: `src/data/score-store.spec.ts`

**Interfaces:**
- Produces:
  - `interface ScoreEntry { id: string; level: LevelId | 'custom'; format: BoardFormat; mode: GameMode; seed: number; score: number; elapsedMs: number; livesLeft: number; playedAt: number; synced: boolean }`
  - `interface ScoreStore { list(): ScoreEntry[]; add(entry: Omit<ScoreEntry, 'id' | 'synced'>): ScoreEntry; best(level: LevelId | 'custom', format: BoardFormat): ScoreEntry | null; markSynced(ids: readonly string[]): void; pendingSync(): ScoreEntry[] }`
  - `class LocalScoreStore implements ScoreStore`
  - `class SettingsStore` z sygnałami `level`, `format`, `mode`, `strokeRatio`

Pole `synced` istnieje od początku, choć w tym slice'ie nikt go nie ustawia:
Slice 10 potrzebuje kolejki do wysłania, a dokładanie pola do już zapisanych
danych oznaczałoby migrację `localStorage`.

- [ ] **Krok 1: Napisz failujące testy**

```typescript
// src/data/score-store.spec.ts
import { LocalScoreStore, SCORES_KEY } from './score-store';

describe('LocalScoreStore', () => {
  beforeEach(() => localStorage.clear());

  it('zaczyna od pustej listy', () => {
    expect(new LocalScoreStore().list()).toEqual([]);
  });

  it('zapisuje wynik i przeżywa przeładowanie', () => {
    const store = new LocalScoreStore();
    store.add({
      level: 'easy', format: 'tall', mode: 'classic', seed: 7,
      score: 312, elapsedMs: 120_000, livesLeft: 2, playedAt: 1_700_000_000_000,
    });
    expect(new LocalScoreStore().list().length).toBe(1);
    expect(new LocalScoreStore().list()[0]!.score).toBe(312);
  });

  it('nadaje wynikom identyfikatory i oznacza je jako niezsynchronizowane', () => {
    const store = new LocalScoreStore();
    const entry = store.add({
      level: 'easy', format: 'tall', mode: 'classic', seed: 7,
      score: 100, elapsedMs: 1_000, livesLeft: 3, playedAt: 1,
    });
    expect(entry.id).toBeTruthy();
    expect(entry.synced).toBe(false);
    expect(store.pendingSync().map((e) => e.id)).toEqual([entry.id]);
  });

  it('zwraca najlepszy wynik dla poziomu i formatu', () => {
    const store = new LocalScoreStore();
    const base = { mode: 'classic' as const, seed: 1, elapsedMs: 1_000, livesLeft: 3, playedAt: 1 };
    store.add({ ...base, level: 'easy', format: 'tall', score: 100 });
    store.add({ ...base, level: 'easy', format: 'tall', score: 250 });
    store.add({ ...base, level: 'easy', format: 'square', score: 900 });
    expect(store.best('easy', 'tall')!.score).toBe(250);
    expect(store.best('medium', 'tall')).toBeNull();
  });

  it('oznacza wyniki jako zsynchronizowane', () => {
    const store = new LocalScoreStore();
    const entry = store.add({
      level: 'easy', format: 'tall', mode: 'classic', seed: 7,
      score: 100, elapsedMs: 1_000, livesLeft: 3, playedAt: 1,
    });
    store.markSynced([entry.id]);
    expect(store.pendingSync()).toEqual([]);
    expect(new LocalScoreStore().list()[0]!.synced).toBe(true);
  });

  it('przeżywa zepsutą zawartość localStorage', () => {
    localStorage.setItem(SCORES_KEY, '{to nie jest JSON');
    expect(new LocalScoreStore().list()).toEqual([]);
  });

  it('przeżywa dane w nieoczekiwanym kształcie', () => {
    localStorage.setItem(SCORES_KEY, '{"a":1}');
    expect(new LocalScoreStore().list()).toEqual([]);
  });

  it('ogranicza historię, żeby nie rosła bez końca', () => {
    const store = new LocalScoreStore();
    for (let i = 0; i < 250; i++) {
      store.add({
        level: 'easy', format: 'tall', mode: 'classic', seed: i,
        score: i, elapsedMs: 1_000, livesLeft: 3, playedAt: i,
      });
    }
    expect(store.list().length).toBeLessThanOrEqual(200);
    // Najlepszy wynik NIE może wypaść z historii przy przycinaniu.
    expect(store.best('easy', 'tall')!.score).toBe(249);
  });
});
```

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npx ng test --watch=false
```

Oczekiwane: FAIL — brak modułu `./score-store`.

- [ ] **Krok 3: Zaimplementuj magazyn wyników**

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
  /** Czy wynik trafił już na serwer. Ustawia to dopiero Slice 10. */
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
 * Wyniki w localStorage.
 *
 * Interfejs jest wąski celowo: Slice 10 podstawi implementację
 * synchronizującą z Firestore i reszta aplikacji tego nie zauważy.
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
      // Zepsuta zawartość nie może wywalić gry — gorsze niż brak historii
      // jest tylko to, że gra się nie uruchamia.
      return [];
    }
  }

  private write(): void {
    try {
      localStorage.setItem(SCORES_KEY, JSON.stringify(this.entries));
    } catch {
      // Brak miejsca albo tryb prywatny: gra działa dalej, tylko bez historii.
    }
  }

  /**
   * Przycinanie zachowuje najlepszy wynik każdej pary (poziom, format) —
   * inaczej rekord życia wypadłby po dwustu rozgrywkach.
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
        // Ustawienia są wygodą, nie warunkiem gry.
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

- [ ] **Krok 4: Podepnij zapis wyniku po wygranej**

W `Game` (Slice 7) dodaj cztery pola i zapis w momencie przejścia na `won`.
Pola są potrzebne, bo sesja zna planszę, ale nie wie, z jakiego presetu i ziarna
powstała — a wynik bez tej informacji jest bezużyteczny dla weryfikacji
(Slice 10).

```typescript
  private readonly scores = inject(SCORE_STORE);

  /** Skąd wzięła się bieżąca plansza — ustawiane w `newGame`. */
  private currentLevel: LevelId | 'custom' = 'easy';
  private currentFormat: BoardFormat = 'tall';
  private currentSeed = 0;
  /** Znaczniki czasu kolejnych kliknięć; reduktor zapisuje same identyfikatory. */
  private moveTimestamps: number[] = [];
  /** Zabezpieczenie przed dwukrotnym zapisem tego samego zwycięstwa. */
  private recorded = false;

  constructor() {
    // …istniejący afterNextRender…
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
        // Zapis przebiegu; Slice 10 wyśle go do weryfikacji.
        moves: session.moves,
        timestamps: this.moveTimestamps,
        startedAt: session.startedAt,
      });
    });
  }
```

W `newGame` zapamiętaj parametry i wyzeruj rejestr, a w `handleClick` dopisz
znacznik czasu:

```typescript
  // w newGame, po wygenerowaniu planszy:
  this.currentLevel = level;
  this.currentFormat = format;
  this.currentSeed = usedSeed;   // ziarno zwrócone przez store, nie losowane ponownie
  this.moveTimestamps = [];
  this.recorded = false;

  // w handleClick, przed wywołaniem store.click:
  this.moveTimestamps.push(Date.now());
```

Żeby `usedSeed` było znane, `GameStore.start` musi wystawić użyte ziarno —
dodaj do niego sygnał `seed` ustawiany w `start` i `startCustom`.

wraz z tokenem DI, żeby Slice 10 mógł podmienić implementację:

```typescript
// src/data/score-store.ts — dopisz
import { InjectionToken } from '@angular/core';

export const SCORE_STORE = new InjectionToken<ScoreStore>('SCORE_STORE', {
  providedIn: 'root',
  factory: () => new LocalScoreStore(),
});
```

- [ ] **Krok 5: Uruchom testy — mają przejść**

```bash
npx ng test --watch=false
```

Oczekiwane: PASS (8 testów).

- [ ] **Krok 6: Commit**

```bash
git add -A
git commit -m "Dodaj lokalny magazyn wyników i ustawień"
```

---

### Task 2: PWA i praca offline

**Files:**
- Modify: `angular.json`, `package.json` (przez `ng add`)
- Create: `ngsw-config.json`, `public/manifest.webmanifest`, ikony
- Modify: `src/app/app.config.ts`

**Interfaces:**
- Produces: aplikacja instalowalna, działająca po odcięciu sieci.

- [ ] **Krok 1: Dodaj pakiet PWA**

```bash
npx ng add @angular/pwa --skip-confirmation
```

Schematyk dopisuje `provideServiceWorker` w `app.config.ts`, tworzy
`ngsw-config.json`, manifest i komplet ikon.

- [ ] **Krok 2: Ustaw strategię cache**

W `ngsw-config.json` upewnij się, że powłoka aplikacji jest pobierana z góry,
a nie leniwie — gra ma działać offline **od pierwszego uruchomienia po
instalacji**:

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

`updateMode: prefetch` w drugiej grupie jest celowy: ikony i czcionki są małe,
a ich brak po aktualizacji byłby widoczny natychmiast.

- [ ] **Krok 3: Uzupełnij manifest**

W `public/manifest.webmanifest`:

```json
{
  "name": "Arrowz",
  "short_name": "Arrowz",
  "description": "Gra logiczna ze strzałkami: wyprowadź wszystkie elementy poza planszę.",
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

`orientation: portrait` jest zgodne z formatem pionowym plansz, który
odpowiada ekranowi telefonu (§9).

- [ ] **Krok 4: Sprawdź działanie offline**

```bash
npx ng build
npx http-server dist/arrowz/browser -p 4300 --silent &
open http://localhost:4300
```

W DevTools:

1. **Application → Service Workers**: worker zarejestrowany i aktywny,
2. **Network → Offline**, przeładuj stronę: aplikacja wstaje,
3. zagraj partię offline — generacja jest klientowa, więc musi działać,
4. **Application → Manifest**: brak ostrzeżeń o ikonach.

Zatrzymaj serwer po sprawdzeniu (`kill %1`).

- [ ] **Krok 5: Commit**

```bash
git add -A
git commit -m "Włącz tryb PWA z pracą offline"
```

---

### Task 3: Deploy na Cloudflare Workers

**Files:**
- Create: `wrangler.jsonc`
- Create: `public/.assetsignore` (jeśli potrzebny)
- Create: `.github/workflows/deploy.yml`
- Modify: `package.json` (skrypty `deploy`, `preview:cf`)

**Interfaces:**
- Produces: publiczny adres aplikacji i wdrożenie z CI.

Worker **nie ma skryptu** — serwuje wyłącznie zbudowane pliki. To najprostszy
możliwy układ i dokładnie ten, który Cloudflare zaleca dla stron statycznych.

- [ ] **Krok 1: Zainstaluj Wranglera**

```bash
npm install --save-dev wrangler@latest
npx wrangler --version   # wymagane 4.x lub nowsze
```

- [ ] **Krok 2: Napisz konfigurację**

```jsonc
// wrangler.jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "arrowz",
  // Ustaw na datę wdrożenia (format RRRR-MM-DD).
  "compatibility_date": "2026-09-07",
  "assets": {
    "directory": "./dist/arrowz/browser",
    // Trasa /game jest renderowana wyłącznie na kliencie, więc nie ma dla niej
    // pliku HTML. SPA-owe obsłużenie 404 oddaje index.html z kodem 200,
    // a router Angulara dobiera właściwy ekran.
    "not_found_handling": "single-page-application"
  },
  "observability": {
    "enabled": true
  }
}
```

Uwaga: pole `"binding": "ASSETS"` **nie występuje** — jest poprawne wyłącznie
wtedy, gdy Worker ma skrypt (`main`), a nasz nie ma.

- [ ] **Krok 3: Zbuduj i sprawdź lokalnie**

```bash
npm run build
npx wrangler dev
```

Otwórz podany adres i sprawdź trzy ścieżki:

1. `/` — ekran startowy (prerenderowany plik),
2. `/game?level=easy&format=tall&mode=classic` — gra wstaje mimo braku pliku
   `game/index.html`,
3. odświeżenie strony na `/configure` — nie daje 404.

Jeśli którakolwiek zwraca 404, `not_found_handling` nie zadziałało — sprawdź,
czy `assets.directory` wskazuje na katalog **`browser`**, a nie na `dist/`.

- [ ] **Krok 4: Wdróż ręcznie po raz pierwszy**

```bash
npx wrangler login
npx wrangler deploy
```

Zanotuj adres `*.workers.dev` w README.

- [ ] **Krok 5: Dodaj skrypty**

W `package.json`:

```json
{
  "deploy": "npm run build && wrangler deploy",
  "preview:cf": "npm run build && wrangler dev"
}
```

- [ ] **Krok 6: Wdrożenie z CI**

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
      # Wdrażamy tylko to, co przeszło testy — rdzeń jest szybki, więc nie ma
      # powodu, żeby go pominąć.
      - run: npm run test:core
      - run: npm test
      - run: npm run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

Token utwórz w panelu Cloudflare z uprawnieniem **Edit Cloudflare Workers**
i zapisz jako sekret repozytorium. Nie umieszczaj go w pliku konfiguracyjnym.

- [ ] **Krok 7: Sprawdź wdrożoną wersję**

Otwórz adres produkcyjny i powtórz test offline z Zadania 2 — tym razem na
prawdziwym HTTPS, bo service worker rejestruje się tylko w bezpiecznym
kontekście.

- [ ] **Krok 8: Commit**

```bash
git add -A
git commit -m "Dodaj wdrożenie na Cloudflare Workers"
```

---

### Task 4: Domknięcie MVP

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-07-arrowz-design.md`

- [ ] **Krok 1: Opisz projekt w README**

README ma odpowiadać na cztery pytania: co to jest, jak uruchomić, jak
testować, gdzie to stoi.

```markdown
# Arrowz

Przeglądarkowa gra logiczna: na siatce leżą poplątane, wielokomórkowe strzałki.
Kliknięcie strzałki próbuje wyprowadzić ją poza planszę w kierunku grotu.
Kolizja kosztuje życie. Cel: opróżnić planszę, nie tracąc trzech żyć.

## Uruchomienie

```bash
npm install
npm start          # http://localhost:4200
```

## Testy i pomiary

```bash
npm run test:core  # rdzeń w Node: generator, solver, reduktor
npm test           # komponenty i renderer
npm run bench      # benchmark generatora
npm run preview    # podgląd SVG do oceny wyglądu
npm run check      # wszystko naraz, jak w CI
```

## Dokumentacja

- specyfikacja: `docs/superpowers/specs/2026-09-07-arrowz-design.md`
- plan wdrożenia: `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`
- pomiary: `docs/benchmarks/`
```

- [ ] **Krok 2: Odhacz zakres MVP w specyfikacji**

W §1 specyfikacji dopisz przy każdej pozycji zakresu MVP, czy została
zrealizowana, i podaj slice. Pozycje niezrealizowane wypisz jawnie — plan
nie ma udawać, że wszystko wyszło.

- [ ] **Krok 3: Przejdź całą grę raz jeszcze**

Na produkcji, na telefonie i na desktopie:

1. Easy pionowy, wariant klasyczny — do końca,
2. Nightmare pionowy — sprawdź czas generacji i płynność zoomu,
3. tryb zaawansowany z ekstremalnymi parametrami — sprawdź raport,
4. tryb samolotowy — plansza generuje się offline,
5. instalacja PWA na telefonie i uruchomienie z ikony.

- [ ] **Krok 4: Commit**

```bash
git add -A
git commit -m "Domknij zakres MVP"
```

---

## Kryteria odbioru slice'a

- Gra działa **bez sieci**: po instalacji PWA można rozegrać pełną partię
  w trybie samolotowym.
- Wyniki i ustawienia przeżywają zamknięcie karty; zepsuta zawartość
  `localStorage` nie wywala aplikacji.
- Aplikacja stoi pod publicznym adresem na Cloudflare Workers, a wdrożenie
  idzie z CI po merge'u do `main`.
- Odświeżenie strony na `/game` i `/configure` nie daje 404.
- README opisuje uruchomienie, testy i pomiary.
- §1 specyfikacji ma odhaczony zakres MVP, z jawną listą tego, co zostało.
