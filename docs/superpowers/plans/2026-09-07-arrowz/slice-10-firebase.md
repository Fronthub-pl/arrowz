# Slice 10 — Firebase: konto, synchronizacja i weryfikacja wyniku

> **Dla wykonawców agentowych:** WYMAGANA PODUMIEJĘTNOŚĆ: użyj
> `superpowers:subagent-driven-development` (zalecane) albo
> `superpowers:executing-plans`. Kroki mają checkboxy (`- [ ]`).

**Cel:** Dołożyć konto gracza i synchronizację wyników **na gotową grę**, tak
żeby wynik zapisany na serwerze był policzony przez serwer, a nie przyjęty na
słowo od klienta.

**Architektura:** Gra pozostaje w pełni grywalna bez logowania i bez sieci —
Firebase jest warstwą **nakładaną**. Wyniki zapisują się lokalnie zawsze;
`FirebaseScoreStore` opakowuje `LocalScoreStore` i dosyła zaległości, gdy jest
sieć i sesja. Klient **nie ma prawa zapisu** do kolekcji wyników: wysyła zapis
rozgrywki (ziarno + sekwencja ruchów) do funkcji `submitRun`, która odtwarza
partię tym samym kodem, którym gra ją rozegrała, i sama wylicza wynik.

**Dlaczego to działa:** generator jest deterministyczny (ziarno), gra
konfluentna, a reduktor czysty — więc odtworzenie jest jednoznaczne, a koszt
weryfikacji liniowy względem liczby ruchów.

**Stack:** Firebase JS SDK 12.x (modularny, bez `@angular/fire`), Firebase
Auth (anonimowy → trwały), Firestore, Cloud Functions v2 (`onCall`),
App Check, emulatory Firebase.

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md` (§3 — adnotacja
o zmianie stacku, §10)

**Mapa:** `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`

## Global Constraints

Obowiązują ograniczenia z mapy wdrożenia. Krytyczne dla tego slice'a:

- **Gra działa bez logowania i bez sieci.** Logowanie jest opcjonalne;
  jego brak nie może blokować żadnej funkcji rozgrywki.
- **Rdzeń nie zna Firebase** — bariera lintu z Slice'a 0 tego pilnuje.
  Cały kontakt z backendem siedzi w `src/data/`.
- Klient **nigdy** nie zapisuje wyniku bezpośrednio — reguły Firestore tego
  zabraniają, a nie tylko interfejs.
- Hosting zostaje na Cloudflare Workers (Slice 9). Firebase Hosting **nie jest**
  używany.
- Funkcje w chmurze importują **ten sam** `core/` i `game/`, którego używa
  przeglądarka. Druga implementacja punktacji rozjechałaby się w tygodniu.

## File Structure

| Plik | Odpowiedzialność |
|---|---|
| `src/data/firebase.ts` | inicjalizacja SDK, App Check, dostęp do usług |
| `src/data/auth-store.ts` | sygnał sesji, logowanie anonimowe, awans konta |
| `src/data/firebase-score-store.ts` | `ScoreStore` z synchronizacją, opakowanie lokalnego |
| `src/data/run-submitter.ts` | wywołanie funkcji `submitRun` |
| `functions/src/index.ts` | `submitRun`: odtworzenie rozgrywki i zapis wyniku |
| `functions/tsconfig.json` | współdzielenie `core/` i `game/` z aplikacją |
| `firestore.rules` | reguły dostępu |
| `firebase.json` | emulatory, funkcje, reguły |
| `src/environments/*.ts` | konfiguracja projektu Firebase |

---

### Task 1: Inicjalizacja i konto gracza

**Files:**
- Create: `src/data/firebase.ts`
- Create: `src/data/auth-store.ts`
- Create: `src/environments/environment.ts`, `environment.development.ts`
- Test: `src/data/auth-store.spec.ts`

**Interfaces:**
- Produces:
  - `getFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore; functions: Functions }`
  - `class AuthStore` z sygnałami `user`, `isAnonymous`, `ready` i metodami
    `signInAnonymouslyIfNeeded()`, `linkWithGoogle()`, `signOut()`

Konto anonimowe zakładamy **dopiero przy pierwszej próbie synchronizacji**, nie
przy starcie aplikacji: gracz, który nigdy nie wygrał partii, nie potrzebuje
tożsamości, a my nie potrzebujemy jego śladu.

- [ ] **Krok 1: Załóż projekt i zainstaluj SDK**

```bash
npm install firebase
npm install --save-dev firebase-tools
npx firebase login
npx firebase projects:create arrowz-<sufiks>   # albo użyj istniejącego
npx firebase init firestore functions emulators
```

Przy `init` wybierz: Firestore, Functions (TypeScript), Emulators
(Auth, Firestore, Functions). **Nie** wybieraj Hostingu — hosting stoi na
Cloudflare (Slice 9).

- [ ] **Krok 2: Zapisz konfigurację w środowiskach**

Klucze webowe Firebase są publiczne z założenia — bezpieczeństwo daje App Check
i reguły, nie ukrywanie kluczy.

```typescript
// src/environments/environment.ts
export const environment = {
  production: true,
  firebase: {
    apiKey: '…',
    authDomain: 'arrowz-….firebaseapp.com',
    projectId: 'arrowz-…',
    storageBucket: 'arrowz-….appspot.com',
    messagingSenderId: '…',
    appId: '…',
  },
  recaptchaSiteKey: '…',
  useEmulators: false,
};
```

```typescript
// src/environments/environment.development.ts
export const environment = {
  production: false,
  firebase: { /* ta sama konfiguracja */ },
  recaptchaSiteKey: '…',
  useEmulators: true,
};
```

W `angular.json` dopisz podmianę plików dla konfiguracji `development`
(`fileReplacements`), jeśli CLI jej nie utworzył.

- [ ] **Krok 3: Napisz failujące testy magazynu sesji**

```typescript
// src/data/auth-store.spec.ts
import { TestBed } from '@angular/core/testing';
import { AUTH_CLIENT, AuthStore, AuthClient } from './auth-store';

function fakeClient(): AuthClient & { emit: (uid: string | null, anonymous: boolean) => void } {
  let listener: (u: { uid: string; isAnonymous: boolean } | null) => void = () => {};
  return {
    onChange(cb) { listener = cb; return () => {}; },
    async signInAnonymously() { listener({ uid: 'anon-1', isAnonymous: true }); },
    async linkWithGoogle() { listener({ uid: 'anon-1', isAnonymous: false }); },
    async signOut() { listener(null); },
    emit(uid, anonymous) { listener(uid ? { uid, isAnonymous: anonymous } : null); },
  };
}

describe('AuthStore', () => {
  let client: ReturnType<typeof fakeClient>;
  let store: AuthStore;

  beforeEach(() => {
    client = fakeClient();
    TestBed.configureTestingModule({
      providers: [AuthStore, { provide: AUTH_CLIENT, useValue: client }],
    });
    store = TestBed.inject(AuthStore);
  });

  it('startuje bez użytkownika', () => {
    expect(store.user()).toBeNull();
    expect(store.isSignedIn()).toBe(false);
  });

  it('zakłada konto anonimowe na żądanie', async () => {
    await store.signInAnonymouslyIfNeeded();
    expect(store.user()?.uid).toBe('anon-1');
    expect(store.isAnonymous()).toBe(true);
  });

  it('nie zakłada drugiego konta, gdy jedno już jest', async () => {
    await store.signInAnonymouslyIfNeeded();
    const first = store.user();
    await store.signInAnonymouslyIfNeeded();
    expect(store.user()).toBe(first);
  });

  it('awansuje konto anonimowe na trwałe, zachowując identyfikator', async () => {
    await store.signInAnonymouslyIfNeeded();
    const uid = store.user()!.uid;
    await store.linkWithGoogle();
    expect(store.user()!.uid).toBe(uid);
    expect(store.isAnonymous()).toBe(false);
  });

  it('czyści stan po wylogowaniu', async () => {
    await store.signInAnonymouslyIfNeeded();
    await store.signOut();
    expect(store.user()).toBeNull();
  });
});
```

- [ ] **Krok 4: Uruchom i potwierdź porażkę**

```bash
npx ng test --watch=false
```

Oczekiwane: FAIL — brak modułu `./auth-store`.

- [ ] **Krok 5: Zaimplementuj dostęp do Firebase i sesję**

```typescript
// src/data/firebase.ts
import { initializeApp, FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, Firestore, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, Functions, getFunctions } from 'firebase/functions';
import { environment } from '../environments/environment';

interface FirebaseBundle {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
}

let bundle: FirebaseBundle | null = null;

/**
 * Leniwa inicjalizacja: gra ma działać bez sieci i bez konta, więc SDK
 * ładujemy dopiero wtedy, gdy ktoś naprawdę chce się zalogować albo wysłać
 * wynik.
 */
export function getFirebase(): FirebaseBundle {
  if (bundle) return bundle;

  const app = initializeApp(environment.firebase);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, 'europe-central2');

  if (environment.useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  } else {
    // App Check odsiewa ruch spoza naszej aplikacji. Bez niego endpoint
    // weryfikujący wynik byłby otwarty na masowe próby.
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(environment.recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }

  bundle = { app, auth, db, functions };
  return bundle;
}
```

```typescript
// src/data/auth-store.ts
import { computed, inject, Injectable, InjectionToken, signal } from '@angular/core';
import {
  GoogleAuthProvider, linkWithPopup, onAuthStateChanged, signInAnonymously, signOut,
} from 'firebase/auth';
import { getFirebase } from './firebase';

export interface SessionUser {
  uid: string;
  isAnonymous: boolean;
}

/** Cienka warstwa nad SDK — dzięki niej testy nie potrzebują Firebase. */
export interface AuthClient {
  onChange(cb: (user: SessionUser | null) => void): () => void;
  signInAnonymously(): Promise<void>;
  linkWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
}

export const AUTH_CLIENT = new InjectionToken<AuthClient>('AUTH_CLIENT', {
  providedIn: 'root',
  factory: (): AuthClient => ({
    onChange(cb) {
      const { auth } = getFirebase();
      return onAuthStateChanged(auth, (u) =>
        cb(u ? { uid: u.uid, isAnonymous: u.isAnonymous } : null),
      );
    },
    async signInAnonymously() {
      await signInAnonymously(getFirebase().auth);
    },
    async linkWithGoogle() {
      const { auth } = getFirebase();
      const current = auth.currentUser;
      if (!current) throw new Error('Brak sesji do awansowania.');
      // linkWithPopup zachowuje UID, więc historia wyników zostaje przy graczu.
      await linkWithPopup(current, new GoogleAuthProvider());
    },
    async signOut() {
      await signOut(getFirebase().auth);
    },
  }),
});

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly client = inject(AUTH_CLIENT);
  private readonly state = signal<SessionUser | null>(null);

  readonly user = this.state.asReadonly();
  readonly isSignedIn = computed(() => this.state() !== null);
  readonly isAnonymous = computed(() => this.state()?.isAnonymous ?? false);

  constructor() {
    this.client.onChange((u) => this.state.set(u));
  }

  /**
   * Konto anonimowe zakładamy dopiero przy pierwszej synchronizacji.
   * Gracz, który nigdy nie wygrał partii, nie potrzebuje tożsamości.
   */
  async signInAnonymouslyIfNeeded(): Promise<void> {
    if (this.state()) return;
    await this.client.signInAnonymously();
  }

  async linkWithGoogle(): Promise<void> {
    await this.client.linkWithGoogle();
  }

  async signOut(): Promise<void> {
    await this.client.signOut();
  }
}
```

- [ ] **Krok 6: Uruchom testy — mają przejść**

```bash
npx ng test --watch=false
```

Oczekiwane: PASS (5 testów).

- [ ] **Krok 7: Commit**

```bash
git add -A
git commit -m "Dodaj konto gracza oparte na Firebase Auth"
```

---

### Task 2: Funkcja weryfikująca wynik

**Files:**
- Create: `functions/src/index.ts`
- Modify: `functions/tsconfig.json`, `functions/package.json`
- Create: `functions/src/index.spec.ts`

**Interfaces:**
- Consumes: `verifyRun`, `replayRun` z `src/game/replay.ts` (Slice 5).
- Produces: callable `submitRun(data: RunSubmission): { accepted: boolean; score: number }`

- [ ] **Krok 1: Udostępnij rdzeń funkcjom**

Funkcje muszą kompilować **ten sam** kod, który liczy wynik w przeglądarce.
Druga implementacja punktacji rozjechałaby się przy pierwszej zmianie wag.

```jsonc
// functions/tsconfig.json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "es2023",
    "moduleResolution": "node",
    "outDir": "lib",
    // rootDir sięga poza katalog functions, żeby objąć src/core i src/game.
    "rootDir": "..",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts", "../src/core/**/*.ts", "../src/game/**/*.ts"],
  "exclude": ["../src/**/*.spec.ts", "**/*.spec.ts"]
}
```

W `functions/package.json` ustaw wejście na ścieżkę wynikającą z `rootDir`:

```json
{
  "main": "lib/functions/src/index.js",
  "engines": { "node": "22" },
  "scripts": {
    "build": "tsc",
    "serve": "npm run build && firebase emulators:start --only functions,firestore,auth",
    "deploy": "npm run build && firebase deploy --only functions"
  }
}
```

- [ ] **Krok 2: Napisz failujące testy funkcji**

```typescript
// functions/src/index.spec.ts
import { probeMove } from '../../src/core/board';
import { createLevel } from '../../src/core/level';
import { createSession, reduce } from '../../src/game/session';
import { evaluateSubmission } from './index';

/** Rozgrywa poziom bezbłędnie i zwraca zapis przebiegu wraz z wynikiem. */
function perfectRun(seed: number) {
  const { board } = createLevel('easy', 'square', seed);
  let session = createSession(board, 'classic', 0);
  const moves: number[] = [];
  const timestamps: number[] = [];
  let at = 0;
  while (session.status === 'playing') {
    const free = [...session.board.pieces.values()].find((p) => probeMove(session.board, p).free)!;
    at += 1_000;
    moves.push(free.id);
    timestamps.push(at);
    session = reduce(session, { type: 'click', pieceId: free.id, at }).next;
  }
  return {
    submission: {
      level: 'easy' as const, format: 'square' as const, seed,
      mode: 'classic' as const, moves, timestamps, startedAt: 0,
      claimedScore: session.score,
    },
    score: session.score,
  };
}

describe('evaluateSubmission', () => {
  it('przyjmuje uczciwy zapis i zwraca policzony przez siebie wynik', () => {
    const { submission, score } = perfectRun(21);
    const result = evaluateSubmission(submission);
    expect(result.accepted).toBe(true);
    expect(result.score).toBe(score);
  }, 60_000);

  it('odrzuca zawyżony wynik', () => {
    const { submission } = perfectRun(22);
    const result = evaluateSubmission({ ...submission, claimedScore: submission.claimedScore * 3 });
    expect(result.accepted).toBe(false);
  }, 60_000);

  it('odrzuca zapis, który nie kończy planszy', () => {
    const { submission } = perfectRun(23);
    const result = evaluateSubmission({ ...submission, moves: submission.moves.slice(0, 2) });
    expect(result.accepted).toBe(false);
  }, 60_000);

  it('odrzuca zapis z niezgodną liczbą znaczników czasu', () => {
    const { submission } = perfectRun(24);
    const result = evaluateSubmission({ ...submission, timestamps: [1, 2] });
    expect(result.accepted).toBe(false);
  }, 60_000);

  it('odrzuca absurdalnie długą listę ruchów bez odtwarzania', () => {
    const { submission } = perfectRun(25);
    const huge = { ...submission, moves: new Array(200_000).fill(0), timestamps: new Array(200_000).fill(1) };
    const started = Date.now();
    expect(evaluateSubmission(huge).accepted).toBe(false);
    // Odrzucenie po rozmiarze musi być natychmiastowe — inaczej endpoint
    // daje się zająć jednym żądaniem.
    expect(Date.now() - started).toBeLessThan(1_000);
  }, 60_000);
});
```

- [ ] **Krok 3: Uruchom i potwierdź porażkę**

```bash
cd functions && npx vitest run src/index.spec.ts; cd ..
```

Jeśli w `functions/` nie ma runnera, zainstaluj: `npm install --save-dev vitest`
w tym katalogu.

Oczekiwane: FAIL — brak `evaluateSubmission`.

- [ ] **Krok 4: Zaimplementuj funkcję**

```typescript
// functions/src/index.ts
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
// Funkcja importuje TEN SAM kod, którym gra liczy wynik w przeglądarce.
// Druga implementacja punktacji rozjechałaby się w tydzień.
import { replayRun, RunRecord, RunSubmission } from '../../src/game/replay';

if (getApps().length === 0) initializeApp();

/** Górna granica sensownej liczby ruchów: Extreme 200×200 ma ~4700 elementów. */
const MAX_MOVES = 20_000;

export type { RunSubmission };

export interface SubmissionVerdict {
  accepted: boolean;
  /** Wynik POLICZONY PRZEZ SERWER; to on trafia do bazy, nie deklarowany. */
  score: number;
  reason?: string;
}

/**
 * Odtwarza rozgrywkę i przelicza wynik.
 *
 * Klient nie jest tu pytany o wynik — jest pytany o ziarno i sekwencję ruchów.
 * Reszta wynika z deterministycznego generatora i czystego reduktora, więc
 * fałszerstwo wymagałoby podania sekwencji, która naprawdę kończy planszę.
 *
 * Funkcja jest wydzielona z handlera, żeby dała się testować bez emulatora.
 */
export function evaluateSubmission(submission: RunSubmission): SubmissionVerdict {
  if (!Number.isFinite(submission.claimedScore) || submission.claimedScore < 0) {
    return { accepted: false, score: 0, reason: 'Nieprawidłowy zgłoszony wynik.' };
  }
  if (submission.moves.length !== submission.timestamps.length) {
    return { accepted: false, score: 0, reason: 'Niezgodna liczba znaczników czasu.' };
  }
  // Odsiew po rozmiarze PRZED odtwarzaniem: inaczej jedno żądanie potrafi
  // zająć funkcję na minuty.
  if (submission.moves.length > MAX_MOVES) {
    return { accepted: false, score: 0, reason: 'Zapis przekracza dopuszczalną długość.' };
  }
  if (submission.level === 'custom' && !submission.params) {
    return { accepted: false, score: 0, reason: 'Brak parametrów planszy z konfiguratora.' };
  }

  const record: RunRecord = {
    level: submission.level,
    format: submission.format,
    seed: submission.seed,
    params: submission.params,
    mode: submission.mode,
    moves: submission.moves,
    timestamps: submission.timestamps,
    startedAt: submission.startedAt,
  };

  const session = replayRun(record);
  if (session.status !== 'won') {
    return { accepted: false, score: 0, reason: 'Zapis nie kończy planszy.' };
  }
  if (session.score !== submission.claimedScore) {
    return { accepted: false, score: session.score, reason: 'Wynik nie zgadza się z odtworzeniem.' };
  }
  return { accepted: true, score: session.score };
}

export const submitRun = onCall<RunSubmission, Promise<SubmissionVerdict>>(
  {
    region: 'europe-central2',
    // Bez App Check endpoint weryfikujący byłby otwarty na masowe próby.
    enforceAppCheck: true,
    // Odtworzenie Extreme bywa kosztowne; limit chroni przed zawieszeniem.
    timeoutSeconds: 60,
    memory: '512MiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Wynik można zapisać tylko na koncie.');
    }

    const verdict = evaluateSubmission(request.data);
    if (!verdict.accepted) return verdict;

    const db = getFirestore();
    await db
      .collection('users')
      .doc(request.auth.uid)
      .collection('scores')
      .add({
        level: request.data.level,
        format: request.data.format,
        mode: request.data.mode,
        seed: request.data.seed,
        // Zapisujemy wynik POLICZONY PRZEZ SERWER.
        score: verdict.score,
        moves: request.data.moves.length,
        elapsedMs: (request.data.timestamps.at(-1) ?? 0) - request.data.startedAt,
        verifiedAt: FieldValue.serverTimestamp(),
      });

    return verdict;
  },
);
```

- [ ] **Krok 5: Uruchom testy funkcji — mają przejść**

```bash
cd functions && npm run build && npx vitest run src/index.spec.ts; cd ..
```

Oczekiwane: PASS (5 testów). Jeśli kompilacja zgłasza błędy ścieżek, sprawdź
`rootDir` i `main` — to najczęstsza pułapka współdzielenia kodu z funkcjami.

- [ ] **Krok 6: Commit**

```bash
git add -A
git commit -m "Dodaj serwerową weryfikację wyniku rozgrywki"
```

---

### Task 3: Reguły dostępu

**Files:**
- Create: `firestore.rules`
- Test: `test/firestore-rules.spec.ts`
- Modify: `firebase.json`, `package.json`

**Interfaces:**
- Produces: reguły, w których **klient nie ma prawa zapisu do wyników**.

Reguła jest tu ważniejsza od interfejsu: interfejs można obejść konsolą
przeglądarki, reguły nie.

- [ ] **Krok 1: Napisz failujące testy reguł**

```bash
npm install --save-dev @firebase/rules-unit-testing
```

```typescript
// test/firestore-rules.spec.ts
import {
  assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'arrowz-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

describe('reguły Firestore', () => {
  it('pozwala właścicielowi czytać i pisać własny profil', async () => {
    const db = env.authenticatedContext('gracz').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/gracz'), { nick: 'Ktoś', settings: {} }));
    await assertSucceeds(getDoc(doc(db, 'users/gracz')));
  });

  it('nie pozwala czytać cudzego profilu', async () => {
    const db = env.authenticatedContext('intruz').firestore();
    await assertFails(getDoc(doc(db, 'users/gracz')));
  });

  it('nie pozwala niezalogowanemu na nic', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'users/gracz')));
    await assertFails(setDoc(doc(db, 'users/gracz'), { nick: 'X' }));
  });

  // NAJWAŻNIEJSZY test tego zadania.
  it('nie pozwala klientowi zapisać wyniku wprost', async () => {
    const db = env.authenticatedContext('gracz').firestore();
    await assertFails(
      setDoc(doc(db, 'users/gracz/scores/podrobiony'), { score: 999_999, level: 'nightmare' }),
    );
  });

  it('pozwala właścicielowi czytać własne wyniki', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/gracz/scores/prawdziwy'), { score: 300 });
    });
    const db = env.authenticatedContext('gracz').firestore();
    await assertSucceeds(getDoc(doc(db, 'users/gracz/scores/prawdziwy')));
  });

  it('nie pozwala modyfikować cudzych wyników', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/gracz/scores/prawdziwy'), { score: 300 });
    });
    const db = env.authenticatedContext('intruz').firestore();
    await assertFails(setDoc(doc(db, 'users/gracz/scores/prawdziwy'), { score: 1 }));
  });
});
```

- [ ] **Krok 2: Uruchom emulator i testy**

```bash
npx firebase emulators:exec --only firestore "npx vitest run test/firestore-rules.spec.ts"
```

Oczekiwane: FAIL — reguły domyślne blokują wszystko albo pozwalają na zbyt wiele.

- [ ] **Krok 3: Napisz reguły**

```javascript
// firestore.rules
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // Profil i ustawienia należą do gracza i tylko on nimi zarządza.
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      // Wyniki są TYLKO DO ODCZYTU dla klienta. Zapisuje je wyłącznie funkcja
      // submitRun, która działa z uprawnieniami administracyjnymi i wcześniej
      // odtwarza rozgrywkę z ziarna. Gdyby klient mógł pisać tutaj, cała
      // weryfikacja byłaby dekoracją.
      match /scores/{scoreId} {
        allow read: if request.auth != null && request.auth.uid == userId;
        allow write: if false;
      }
    }

    // Wszystko poza powyższym jest zamknięte.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Krok 4: Uruchom testy — mają przejść**

```bash
npx firebase emulators:exec --only firestore "npx vitest run test/firestore-rules.spec.ts"
```

Oczekiwane: PASS (6 testów).

Dodaj skrypt do `package.json`:

```json
{
  "test:rules": "firebase emulators:exec --only firestore \"vitest run test/firestore-rules.spec.ts\""
}
```

- [ ] **Krok 5: Commit**

```bash
git add -A
git commit -m "Dodaj reguły dostępu do wyników i profili"
```

---

### Task 4: Synchronizacja offline-first

**Files:**
- Create: `src/data/firebase-score-store.ts`
- Create: `src/data/run-submitter.ts`
- Test: `src/data/firebase-score-store.spec.ts`
- Modify: `src/data/score-store.ts` (podmiana implementacji w tokenie)

**Interfaces:**
- Produces:
  - `class FirebaseScoreStore implements ScoreStore` — opakowuje
    `LocalScoreStore`, dokłada `sync()` i przyjmuje opcjonalny zapis przebiegu
    (`RunPayload`)
  - `interface RunSubmitter { submit(submission: RunSubmission): Promise<SubmissionVerdict> }`

- [ ] **Krok 1: Napisz failujące testy**

```typescript
// src/data/firebase-score-store.spec.ts
import { LocalScoreStore } from './score-store';
import { FirebaseScoreStore } from './firebase-score-store';

function fakeSubmitter(behaviour: 'ok' | 'reject' | 'offline') {
  const calls: unknown[] = [];
  return {
    calls,
    async submit(submission: unknown) {
      calls.push(submission);
      if (behaviour === 'offline') throw new Error('brak sieci');
      return behaviour === 'ok'
        ? { accepted: true, score: 300 }
        : { accepted: false, score: 0, reason: 'nie zgadza się' };
    },
  };
}

const run = {
  level: 'easy' as const, format: 'tall' as const, mode: 'classic' as const,
  seed: 7, score: 300, elapsedMs: 60_000, livesLeft: 3, playedAt: 1,
  moves: [0, 1, 2], timestamps: [1, 2, 3], startedAt: 0,
};

describe('FirebaseScoreStore', () => {
  beforeEach(() => localStorage.clear());

  it('zapisuje wynik lokalnie, nawet gdy nie ma sieci', async () => {
    const submitter = fakeSubmitter('offline');
    const store = new FirebaseScoreStore(new LocalScoreStore(), submitter, async () => {});
    store.add(run);
    await store.sync();
    expect(store.list().length).toBe(1);
    expect(store.pendingSync().length).toBe(1); // zostaje w kolejce
  });

  it('oznacza wynik jako zsynchronizowany po przyjęciu przez serwer', async () => {
    const submitter = fakeSubmitter('ok');
    const store = new FirebaseScoreStore(new LocalScoreStore(), submitter, async () => {});
    store.add(run);
    await store.sync();
    expect(store.pendingSync()).toEqual([]);
    expect(submitter.calls.length).toBe(1);
  });

  it('nie ponawia w nieskończoność wyniku odrzuconego przez serwer', async () => {
    const submitter = fakeSubmitter('reject');
    const store = new FirebaseScoreStore(new LocalScoreStore(), submitter, async () => {});
    store.add(run);
    await store.sync();
    await store.sync();
    // Odrzucony wynik zostaje lokalnie, ale przestaje być wysyłany.
    expect(submitter.calls.length).toBe(1);
    expect(store.list().length).toBe(1);
  });

  it('zakłada konto dopiero przy pierwszej synchronizacji', async () => {
    let signIns = 0;
    const store = new FirebaseScoreStore(new LocalScoreStore(), fakeSubmitter('ok'), async () => {
      signIns++;
    });
    store.add(run);
    expect(signIns).toBe(0);
    await store.sync();
    expect(signIns).toBe(1);
  });

  it('nie woła serwera, gdy nie ma czego wysłać', async () => {
    const submitter = fakeSubmitter('ok');
    let signIns = 0;
    const store = new FirebaseScoreStore(new LocalScoreStore(), submitter, async () => {
      signIns++;
    });
    await store.sync();
    expect(submitter.calls.length).toBe(0);
    expect(signIns).toBe(0);
  });
});
```

- [ ] **Krok 2: Uruchom i potwierdź porażkę**

```bash
npx ng test --watch=false
```

Oczekiwane: FAIL — brak modułu `./firebase-score-store`.

- [ ] **Krok 3: Zaimplementuj synchronizację**

```typescript
// src/data/run-submitter.ts
import { httpsCallable } from 'firebase/functions';
// Typ zapisu przebiegu mieszka w rdzeniu gry (Slice 5) — ta sama definicja
// obowiązuje klienta i funkcję w chmurze.
import { RunSubmission } from '../game/replay';
import { getFirebase } from './firebase';

export type { RunSubmission };

export interface SubmissionVerdict {
  accepted: boolean;
  score: number;
  reason?: string;
}

export interface RunSubmitter {
  submit(submission: RunSubmission): Promise<SubmissionVerdict>;
}

export const callableSubmitter: RunSubmitter = {
  async submit(submission) {
    const { functions } = getFirebase();
    const call = httpsCallable<RunSubmission, SubmissionVerdict>(functions, 'submitRun');
    return (await call(submission)).data;
  },
};
```

```typescript
// src/data/firebase-score-store.ts
import { BoardFormat, LevelId } from '../core/presets';
import { RunSubmitter } from './run-submitter';
import { ScoreEntry, ScoreStore } from './score-store';

/** Zapis przebiegu dołączany do wyniku — bez ruchów serwer nie ma czego odtwarzać. */
export interface RunPayload {
  moves: number[];
  timestamps: number[];
  startedAt: number;
}

export type RunScoreEntry = Omit<ScoreEntry, 'id' | 'synced'> & Partial<RunPayload>;

/**
 * Wyniki zapisywane lokalnie ZAWSZE, wysyłane przy okazji.
 *
 * Kolejność jest tu decyzją projektową, nie optymalizacją: gra ma działać bez
 * sieci i bez konta, więc synchronizacja nie może być warunkiem zapisania
 * rekordu.
 */
export class FirebaseScoreStore implements ScoreStore {
  /** Wyniki odrzucone przez serwer — nie ponawiamy ich w nieskończoność. */
  private readonly rejected = new Set<string>();
  private readonly runs = new Map<string, RunPayload>();

  constructor(
    private readonly local: ScoreStore,
    private readonly submitter: RunSubmitter,
    private readonly ensureSession: () => Promise<void>,
  ) {}

  list(): ScoreEntry[] {
    return this.local.list();
  }

  /**
   * Zapis przebiegu jest opcjonalny: wynik bez ruchów zostaje lokalnie, ale nie
   * pojedzie na serwer, bo nie byłoby czego odtworzyć.
   */
  add(entry: RunScoreEntry): ScoreEntry {
    const saved = this.local.add({
      level: entry.level, format: entry.format, mode: entry.mode, seed: entry.seed,
      score: entry.score, elapsedMs: entry.elapsedMs, livesLeft: entry.livesLeft,
      playedAt: entry.playedAt,
    });
    if (entry.moves && entry.timestamps) {
      this.runs.set(saved.id, {
        moves: entry.moves,
        timestamps: entry.timestamps,
        startedAt: entry.startedAt ?? 0,
      });
    }
    return saved;
  }

  best(level: LevelId | 'custom', format: BoardFormat): ScoreEntry | null {
    return this.local.best(level, format);
  }

  markSynced(ids: readonly string[]): void {
    this.local.markSynced(ids);
  }

  pendingSync(): ScoreEntry[] {
    return this.local.pendingSync().filter((e) => !this.rejected.has(e.id));
  }

  /** Wysyła zaległości. Wołane po wygranej i przy powrocie sieci. */
  async sync(): Promise<void> {
    const pending = this.pendingSync().filter((e) => this.runs.has(e.id));
    if (pending.length === 0) return;

    await this.ensureSession();

    const accepted: string[] = [];
    for (const entry of pending) {
      const run = this.runs.get(entry.id)!;
      try {
        const verdict = await this.submitter.submit({
          level: entry.level,
          format: entry.format,
          mode: entry.mode,
          seed: entry.seed,
          moves: run.moves,
          timestamps: run.timestamps,
          startedAt: run.startedAt,
          claimedScore: entry.score,
        });
        if (verdict.accepted) accepted.push(entry.id);
        else this.rejected.add(entry.id);
      } catch {
        // Brak sieci albo błąd serwera: zostaje w kolejce, spróbujemy później.
        break;
      }
    }
    if (accepted.length > 0) this.markSynced(accepted);
  }
}
```

- [ ] **Krok 4: Podepnij store i moment synchronizacji**

W `src/data/score-store.ts` podmień fabrykę tokenu:

```typescript
export const SCORE_STORE = new InjectionToken<ScoreStore>('SCORE_STORE', {
  providedIn: 'root',
  factory: () => {
    const local = new LocalScoreStore();
    const auth = inject(AuthStore);
    return new FirebaseScoreStore(local, callableSubmitter, () =>
      auth.signInAnonymouslyIfNeeded(),
    );
  },
});
```

W `Game` po wygranej zapisz wynik **razem z ruchami** i uruchom synchronizację
w tle — nieudana wysyłka nie może zablokować ekranu wyniku:

```typescript
      const saved = this.scores.add({ …, moves: session.moves, timestamps: this.moveTimestamps, startedAt: session.startedAt });
      void (this.scores as FirebaseScoreStore).sync?.();
```

Znaczniki czasu ruchów zbieraj w `Game` przy każdym kliknięciu — reduktor
zapisuje same identyfikatory, a serwer potrzebuje obu list.

- [ ] **Krok 5: Uruchom testy — mają przejść**

```bash
npx ng test --watch=false
```

Oczekiwane: PASS (5 testów).

- [ ] **Krok 6: Sprawdź całą ścieżkę na emulatorach**

```bash
npx firebase emulators:start --only auth,firestore,functions
# w drugim terminalu
npx ng serve --configuration development
```

Rozegraj partię Easy do końca i sprawdź w emulatorze Firestore, że:

1. w `users/{uid}/scores` pojawił się dokument,
2. pole `score` zgadza się z wynikiem z ekranu,
3. próba ręcznego zapisu do `scores` z konsoli przeglądarki **kończy się
   odmową** (reguły).

- [ ] **Krok 7: Wdróż funkcje i reguły**

```bash
cd functions && npm run build && cd ..
npx firebase deploy --only functions,firestore:rules
```

- [ ] **Krok 8: Commit**

```bash
git add -A
git commit -m "Dodaj synchronizację wyników z weryfikacją serwerową"
```

---

### Task 5: Interfejs konta

**Files:**
- Create: `src/ui/account.ts`
- Modify: `src/ui/home.ts`
- Test: `src/ui/account.spec.ts`

- [ ] **Krok 1: Napisz failujące testy**

```typescript
// src/ui/account.spec.ts
import { TestBed } from '@angular/core/testing';
import { AUTH_CLIENT, AuthStore } from '../data/auth-store';
import { Account } from './account';

function fakeClient() {
  let listener: (u: { uid: string; isAnonymous: boolean } | null) => void = () => {};
  return {
    onChange(cb: typeof listener) { listener = cb; return () => {}; },
    async signInAnonymously() { listener({ uid: 'a', isAnonymous: true }); },
    async linkWithGoogle() { listener({ uid: 'a', isAnonymous: false }); },
    async signOut() { listener(null); },
  };
}

async function setup() {
  TestBed.configureTestingModule({
    providers: [AuthStore, { provide: AUTH_CLIENT, useValue: fakeClient() }],
  });
  const fixture = TestBed.createComponent(Account);
  await fixture.whenStable();
  return fixture;
}

describe('Account', () => {
  it('mówi wprost, że gra działa bez konta', async () => {
    const fixture = await setup();
    expect((fixture.nativeElement as HTMLElement).textContent).toMatch(/bez konta|nie musisz/i);
  });

  it('proponuje zachowanie wyników po założeniu konta anonimowego', async () => {
    const fixture = await setup();
    await TestBed.inject(AuthStore).signInAnonymouslyIfNeeded();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-role="link-account"]')).not.toBeNull();
  });

  it('po awansie konta nie proponuje go ponownie', async () => {
    const fixture = await setup();
    const auth = TestBed.inject(AuthStore);
    await auth.signInAnonymouslyIfNeeded();
    await auth.linkWithGoogle();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-role="link-account"]')).toBeNull();
  });
});
```

- [ ] **Krok 2: Zaimplementuj komponent**

```typescript
// src/ui/account.ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthStore } from '../data/auth-store';

@Component({
  selector: 'arw-account',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="account">
      @if (!auth.isSignedIn()) {
        <p>Grasz bez konta — nie musisz się logować. Wyniki zapisują się na tym urządzeniu.</p>
      } @else if (auth.isAnonymous()) {
        <p>Twoje wyniki są zapisane na koncie tymczasowym, przypisanym do tej przeglądarki.</p>
        <button type="button" data-role="link-account" (click)="link()">
          Zachowaj wyniki — połącz z kontem Google
        </button>
      } @else {
        <p>Wyniki są zapisywane na Twoim koncie.</p>
        <button type="button" data-role="sign-out" (click)="signOut()">Wyloguj</button>
      }
    </section>
  `,
  styles: `.account { display: grid; gap: .5rem; } p { opacity: .8; margin: 0; }`,
})
export class Account {
  protected readonly auth = inject(AuthStore);

  protected async link(): Promise<void> {
    await this.auth.linkWithGoogle();
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
  }
}
```

Dodaj `<arw-account />` na ekranie startowym, pod przyciskami.

- [ ] **Krok 3: Uruchom testy i wdróż**

```bash
npm run check
npm run deploy
```

- [ ] **Krok 4: Commit**

```bash
git add -A
git commit -m "Dodaj panel konta gracza"
```

---

## Kryteria odbioru slice'a

- **Gra działa bez logowania i bez sieci** — to jest test numer jeden.
  Wyłącz sieć, rozegraj partię, wygraj: wynik zapisuje się lokalnie.
- Wynik na serwerze jest **policzony przez serwer**: funkcja odtwarza partię
  z ziarna i sekwencji ruchów, a zawyżony `claimedScore` zostaje odrzucony.
- Reguły Firestore **zabraniają klientowi zapisu** do kolekcji wyników —
  potwierdzone testem na emulatorze, nie tylko interfejsem.
- Konto anonimowe zakłada się dopiero przy pierwszej synchronizacji i daje się
  awansować na trwałe **z zachowaniem historii** (ten sam UID).
- Wyniki odrzucone przez serwer nie są ponawiane w kółko.
- `npm run test:core`, `npm test`, `npm run test:rules` i testy funkcji
  przechodzą.
