# Slice 10 — Firebase: player account, sync, and score verification

> **For agent implementers:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans`. Steps have checkboxes (`- [ ]`).

**Goal:** Add a player account and score synchronization **on top of the
finished game**, so that a score saved on the server is computed by the
server, not taken on the client's word.

**Architecture:** The game remains fully playable without signing in and
without a network — Firebase is a **bolted-on** layer. Scores always save
locally; `FirebaseScoreStore` wraps `LocalScoreStore` and flushes the backlog
once there's a network connection and a session. The client **has no write
permission** on the scores collection: it sends a run record (seed + move
sequence) to the `submitRun` function, which replays the match with the same
code the game used to play it, and computes the score itself.

**Why this works:** the generator is deterministic (seed), the game is
confluent, and the reducer is pure — so the replay is unambiguous, and the
verification cost is linear in the number of moves.

**Stack:** Firebase JS SDK 12.x (modular, no `@angular/fire`), Firebase
Auth (anonymous → permanent), Firestore, Cloud Functions v2 (`onCall`),
App Check, Firebase emulators.

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md` (§3 — note
on the stack change, §10)

**Map:** `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`

## Global Constraints

The constraints from the implementation map apply. Critical for this slice:

- **The game works without signing in and without a network.** Signing in is
  optional; its absence must not block any gameplay feature.
- **The core knows nothing about Firebase** — the lint barrier from Slice 0
  enforces this. All backend contact lives in `src/data/`.
- The client **never** writes a score directly — Firestore rules forbid it,
  not merely the UI.
- Hosting stays on Cloudflare Workers (Slice 9). Firebase Hosting is **not**
  used.
- Cloud functions import the **same** `core/` and `game/` the browser uses.
  A second scoring implementation would drift within a week.

## File Structure

| File | Responsibility |
|---|---|
| `src/data/firebase.ts` | SDK initialization, App Check, service access |
| `src/data/auth-store.ts` | session signal, anonymous sign-in, account upgrade |
| `src/data/firebase-score-store.ts` | `ScoreStore` with sync, wraps the local one |
| `src/data/run-submitter.ts` | calls the `submitRun` function |
| `functions/src/index.ts` | `submitRun`: replays the run and saves the score |
| `functions/tsconfig.json` | sharing `core/` and `game/` with the app |
| `firestore.rules` | access rules |
| `firebase.json` | emulators, functions, rules |
| `src/environments/*.ts` | Firebase project configuration |

---

### Task 1: Initialization and player account

**Files:**
- Create: `src/data/firebase.ts`
- Create: `src/data/auth-store.ts`
- Create: `src/environments/environment.ts`, `environment.development.ts`
- Test: `src/data/auth-store.spec.ts`

**Interfaces:**
- Produces:
  - `getFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore; functions: Functions }`
  - `class AuthStore` with signals `user`, `isAnonymous`, `ready` and methods
    `signInAnonymouslyIfNeeded()`, `linkWithGoogle()`, `signOut()`

We create the anonymous account **only on the first sync attempt**, not at
app startup: a player who has never won a match doesn't need an identity, and
we don't need their trail.

- [ ] **Step 1: Create the project and install the SDK**

```bash
npm install firebase
npm install --save-dev firebase-tools
npx firebase login
npx firebase projects:create arrowz-<suffix>   # or use an existing one
npx firebase init firestore functions emulators
```

During `init` pick: Firestore, Functions (TypeScript), Emulators
(Auth, Firestore, Functions). **Do not** pick Hosting — hosting stays on
Cloudflare (Slice 9).

- [ ] **Step 2: Store the configuration in the environments**

Firebase web keys are public by design — security comes from App Check and
the rules, not from hiding the keys.

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
  firebase: { /* same configuration */ },
  recaptchaSiteKey: '…',
  useEmulators: true,
};
```

In `angular.json` add the file replacement for the `development` configuration
(`fileReplacements`), if the CLI didn't create it.

- [ ] **Step 3: Write failing session store tests**

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

  it('starts with no user', () => {
    expect(store.user()).toBeNull();
    expect(store.isSignedIn()).toBe(false);
  });

  it('creates an anonymous account on demand', async () => {
    await store.signInAnonymouslyIfNeeded();
    expect(store.user()?.uid).toBe('anon-1');
    expect(store.isAnonymous()).toBe(true);
  });

  it('does not create a second account when one already exists', async () => {
    await store.signInAnonymouslyIfNeeded();
    const first = store.user();
    await store.signInAnonymouslyIfNeeded();
    expect(store.user()).toBe(first);
  });

  it('upgrades the anonymous account to permanent, keeping the identifier', async () => {
    await store.signInAnonymouslyIfNeeded();
    const uid = store.user()!.uid;
    await store.linkWithGoogle();
    expect(store.user()!.uid).toBe(uid);
    expect(store.isAnonymous()).toBe(false);
  });

  it('clears state after signing out', async () => {
    await store.signInAnonymouslyIfNeeded();
    await store.signOut();
    expect(store.user()).toBeNull();
  });
});
```

- [ ] **Step 4: Run and confirm failure**

```bash
npx ng test --watch=false
```

Expected: FAIL — module `./auth-store` is missing.

- [ ] **Step 5: Implement Firebase access and the session**

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
 * Lazy initialization: the game must work without a network and without an
 * account, so we load the SDK only once someone actually wants to sign in or
 * submit a score.
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
    // App Check filters out traffic that isn't from our app. Without it the
    // score-verification endpoint would be wide open to mass attempts.
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

/** A thin layer over the SDK — thanks to it, tests don't need Firebase. */
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
      if (!current) throw new Error('No session to upgrade.');
      // linkWithPopup keeps the UID, so the score history stays with the player.
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
   * The anonymous account is created only at the first sync.
   * A player who has never won a match doesn't need an identity.
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

- [ ] **Step 6: Run the tests — they should pass**

```bash
npx ng test --watch=false
```

Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add a Firebase Auth-based player account"
```

---

### Task 2: Score-verification function

**Files:**
- Create: `functions/src/index.ts`
- Modify: `functions/tsconfig.json`, `functions/package.json`
- Create: `functions/src/index.spec.ts`

**Interfaces:**
- Consumes: `verifyRun`, `replayRun` from `src/game/replay.ts` (Slice 5).
- Produces: callable `submitRun(data: RunSubmission): { accepted: boolean; score: number }`

- [ ] **Step 1: Expose the core to the functions**

The functions must compile the **same** code that computes the score in the
browser. A second scoring implementation would drift at the first weight
change.

```jsonc
// functions/tsconfig.json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "es2023",
    "moduleResolution": "node",
    "outDir": "lib",
    // rootDir reaches beyond the functions directory to cover src/core and src/game.
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

In `functions/package.json` set the entry point to the path that follows from `rootDir`:

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

- [ ] **Step 2: Write failing function tests**

```typescript
// functions/src/index.spec.ts
import { probeMove } from '../../src/core/board';
import { createLevel } from '../../src/core/level';
import { createSession, reduce } from '../../src/game/session';
import { evaluateSubmission } from './index';

/** Plays a level flawlessly and returns the run record along with the score. */
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
  it('accepts an honest run and returns its own computed score', () => {
    const { submission, score } = perfectRun(21);
    const result = evaluateSubmission(submission);
    expect(result.accepted).toBe(true);
    expect(result.score).toBe(score);
  }, 60_000);

  it('rejects an inflated score', () => {
    const { submission } = perfectRun(22);
    const result = evaluateSubmission({ ...submission, claimedScore: submission.claimedScore * 3 });
    expect(result.accepted).toBe(false);
  }, 60_000);

  it('rejects a run that does not close the board', () => {
    const { submission } = perfectRun(23);
    const result = evaluateSubmission({ ...submission, moves: submission.moves.slice(0, 2) });
    expect(result.accepted).toBe(false);
  }, 60_000);

  it('rejects a run with a mismatched number of timestamps', () => {
    const { submission } = perfectRun(24);
    const result = evaluateSubmission({ ...submission, timestamps: [1, 2] });
    expect(result.accepted).toBe(false);
  }, 60_000);

  it('rejects an absurdly long move list without replaying it', () => {
    const { submission } = perfectRun(25);
    const huge = { ...submission, moves: new Array(200_000).fill(0), timestamps: new Array(200_000).fill(1) };
    const started = Date.now();
    expect(evaluateSubmission(huge).accepted).toBe(false);
    // Rejection by size must be immediate — otherwise the endpoint can be
    // tied up by a single request.
    expect(Date.now() - started).toBeLessThan(1_000);
  }, 60_000);
});
```

- [ ] **Step 3: Run and confirm failure**

```bash
cd functions && npx vitest run src/index.spec.ts; cd ..
```

If `functions/` has no runner, install it: `npm install --save-dev vitest`
in that directory.

Expected: FAIL — `evaluateSubmission` is missing.

- [ ] **Step 4: Implement the function**

```typescript
// functions/src/index.ts
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
// The function imports the SAME code that computes the score in the browser.
// A second scoring implementation would drift within a week.
import { replayRun, RunRecord, RunSubmission } from '../../src/game/replay';

if (getApps().length === 0) initializeApp();

/** Upper bound on a sensible move count: Extreme 200x200 has ~4700 pieces. */
const MAX_MOVES = 20_000;

export type { RunSubmission };

export interface SubmissionVerdict {
  accepted: boolean;
  /** Score COMPUTED BY THE SERVER; this is what goes into the database, not the claimed one. */
  score: number;
  reason?: string;
}

/**
 * Replays the run and recomputes the score.
 *
 * The client isn't asked for the score here — it's asked for the seed and the
 * move sequence. Everything else follows from the deterministic generator and
 * the pure reducer, so forging a result would require supplying a sequence
 * that genuinely closes the board.
 *
 * The function is pulled out of the handler so it can be tested without an
 * emulator.
 */
export function evaluateSubmission(submission: RunSubmission): SubmissionVerdict {
  if (!Number.isFinite(submission.claimedScore) || submission.claimedScore < 0) {
    return { accepted: false, score: 0, reason: 'Invalid claimed score.' };
  }
  if (submission.moves.length !== submission.timestamps.length) {
    return { accepted: false, score: 0, reason: 'Mismatched number of timestamps.' };
  }
  // Filter by size BEFORE replaying: otherwise a single request can tie up
  // the function for minutes.
  if (submission.moves.length > MAX_MOVES) {
    return { accepted: false, score: 0, reason: 'The run exceeds the allowed length.' };
  }
  if (submission.level === 'custom' && !submission.params) {
    return { accepted: false, score: 0, reason: 'Missing board parameters from the configurator.' };
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
    return { accepted: false, score: 0, reason: 'The run does not close the board.' };
  }
  if (session.score !== submission.claimedScore) {
    return { accepted: false, score: session.score, reason: 'The score does not match the replay.' };
  }
  return { accepted: true, score: session.score };
}

export const submitRun = onCall<RunSubmission, Promise<SubmissionVerdict>>(
  {
    region: 'europe-central2',
    // Without App Check the verification endpoint would be wide open to mass attempts.
    enforceAppCheck: true,
    // Replaying Extreme can be expensive; the limit guards against hanging.
    timeoutSeconds: 60,
    memory: '512MiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'A score can only be saved on an account.');
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
        // We store the score COMPUTED BY THE SERVER.
        score: verdict.score,
        moves: request.data.moves.length,
        elapsedMs: (request.data.timestamps.at(-1) ?? 0) - request.data.startedAt,
        verifiedAt: FieldValue.serverTimestamp(),
      });

    return verdict;
  },
);
```

- [ ] **Step 5: Run the function tests — they should pass**

```bash
cd functions && npm run build && npx vitest run src/index.spec.ts; cd ..
```

Expected: PASS (5 tests). If the build reports path errors, check
`rootDir` and `main` — this is the most common pitfall of sharing code with functions.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add server-side verification of the run score"
```

---

### Task 3: Access rules

**Files:**
- Create: `firestore.rules`
- Test: `test/firestore-rules.spec.ts`
- Modify: `firebase.json`, `package.json`

**Interfaces:**
- Produces: rules in which **the client has no write permission on scores**.

The rule matters more here than the UI: the UI can be bypassed from the
browser console, the rule cannot.

- [ ] **Step 1: Write failing rule tests**

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

describe('Firestore rules', () => {
  it('allows the owner to read and write their own profile', async () => {
    const db = env.authenticatedContext('gracz').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/gracz'), { nick: 'Someone', settings: {} }));
    await assertSucceeds(getDoc(doc(db, 'users/gracz')));
  });

  it('does not allow reading someone else\'s profile', async () => {
    const db = env.authenticatedContext('intruz').firestore();
    await assertFails(getDoc(doc(db, 'users/gracz')));
  });

  it('does not allow an unauthenticated user to do anything', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'users/gracz')));
    await assertFails(setDoc(doc(db, 'users/gracz'), { nick: 'X' }));
  });

  // The MOST IMPORTANT test in this task.
  it('does not allow the client to write a score directly', async () => {
    const db = env.authenticatedContext('gracz').firestore();
    await assertFails(
      setDoc(doc(db, 'users/gracz/scores/podrobiony'), { score: 999_999, level: 'nightmare' }),
    );
  });

  it('allows the owner to read their own scores', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/gracz/scores/prawdziwy'), { score: 300 });
    });
    const db = env.authenticatedContext('gracz').firestore();
    await assertSucceeds(getDoc(doc(db, 'users/gracz/scores/prawdziwy')));
  });

  it('does not allow modifying someone else\'s scores', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/gracz/scores/prawdziwy'), { score: 300 });
    });
    const db = env.authenticatedContext('intruz').firestore();
    await assertFails(setDoc(doc(db, 'users/gracz/scores/prawdziwy'), { score: 1 }));
  });
});
```

- [ ] **Step 2: Run the emulator and the tests**

```bash
npx firebase emulators:exec --only firestore "npx vitest run test/firestore-rules.spec.ts"
```

Expected: FAIL — the default rules either block everything or allow too much.

- [ ] **Step 3: Write the rules**

```javascript
// firestore.rules
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // The profile and settings belong to the player and only they manage them.
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      // Scores are READ-ONLY for the client. Only the submitRun function
      // writes them, running with administrative privileges after replaying
      // the run from the seed. If the client could write here, the entire
      // verification would be decoration.
      match /scores/{scoreId} {
        allow read: if request.auth != null && request.auth.uid == userId;
        allow write: if false;
      }
    }

    // Everything beyond the above is closed off.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 4: Run the tests — they should pass**

```bash
npx firebase emulators:exec --only firestore "npx vitest run test/firestore-rules.spec.ts"
```

Expected: PASS (6 tests).

Add a script to `package.json`:

```json
{
  "test:rules": "firebase emulators:exec --only firestore \"vitest run test/firestore-rules.spec.ts\""
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add access rules for scores and profiles"
```

---

### Task 4: Offline-first synchronization

**Files:**
- Create: `src/data/firebase-score-store.ts`
- Create: `src/data/run-submitter.ts`
- Test: `src/data/firebase-score-store.spec.ts`
- Modify: `src/data/score-store.ts` (swap the implementation in the token)

**Interfaces:**
- Produces:
  - `class FirebaseScoreStore implements ScoreStore` — wraps
    `LocalScoreStore`, adds `sync()`, and accepts an optional run record
    (`RunPayload`)
  - `interface RunSubmitter { submit(submission: RunSubmission): Promise<SubmissionVerdict> }`

- [ ] **Step 1: Write failing tests**

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
        : { accepted: false, score: 0, reason: 'does not match' };
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

  it('saves the score locally even when there is no network', async () => {
    const submitter = fakeSubmitter('offline');
    const store = new FirebaseScoreStore(new LocalScoreStore(), submitter, async () => {});
    store.add(run);
    await store.sync();
    expect(store.list().length).toBe(1);
    expect(store.pendingSync().length).toBe(1); // stays queued
  });

  it('marks the score as synced once accepted by the server', async () => {
    const submitter = fakeSubmitter('ok');
    const store = new FirebaseScoreStore(new LocalScoreStore(), submitter, async () => {});
    store.add(run);
    await store.sync();
    expect(store.pendingSync()).toEqual([]);
    expect(submitter.calls.length).toBe(1);
  });

  it('does not keep retrying a score rejected by the server', async () => {
    const submitter = fakeSubmitter('reject');
    const store = new FirebaseScoreStore(new LocalScoreStore(), submitter, async () => {});
    store.add(run);
    await store.sync();
    await store.sync();
    // The rejected score stays local but stops being sent.
    expect(submitter.calls.length).toBe(1);
    expect(store.list().length).toBe(1);
  });

  it('creates the account only at the first sync', async () => {
    let signIns = 0;
    const store = new FirebaseScoreStore(new LocalScoreStore(), fakeSubmitter('ok'), async () => {
      signIns++;
    });
    store.add(run);
    expect(signIns).toBe(0);
    await store.sync();
    expect(signIns).toBe(1);
  });

  it('does not call the server when there is nothing to send', async () => {
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

- [ ] **Step 2: Run and confirm failure**

```bash
npx ng test --watch=false
```

Expected: FAIL — module `./firebase-score-store` is missing.

- [ ] **Step 3: Implement the synchronization**

```typescript
// src/data/run-submitter.ts
import { httpsCallable } from 'firebase/functions';
// The run record type lives in the game core (Slice 5) — the same definition
// applies to both the client and the cloud function.
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

/** Run record attached to the score — without the moves the server has nothing to replay. */
export interface RunPayload {
  moves: number[];
  timestamps: number[];
  startedAt: number;
}

export type RunScoreEntry = Omit<ScoreEntry, 'id' | 'synced'> & Partial<RunPayload>;

/**
 * Scores are saved locally ALWAYS, sent whenever possible.
 *
 * The order here is a design decision, not an optimization: the game must
 * work without a network and without an account, so syncing can't be a
 * precondition for saving the record.
 */
export class FirebaseScoreStore implements ScoreStore {
  /** Scores rejected by the server — we don't retry them forever. */
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
   * The run record is optional: a score without moves stays local, but won't
   * go to the server since there'd be nothing to replay.
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

  /** Sends the backlog. Called after a win and whenever the network returns. */
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
        // No network or a server error: stays queued, we'll try again later.
        break;
      }
    }
    if (accepted.length > 0) this.markSynced(accepted);
  }
}
```

- [ ] **Step 4: Wire up the store and the sync trigger**

In `src/data/score-store.ts` swap the token factory:

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

In `Game`, after a win, save the score **together with the moves** and kick
off synchronization in the background — a failed submission must not block
the score screen:

```typescript
      const saved = this.scores.add({ …, moves: session.moves, timestamps: this.moveTimestamps, startedAt: session.startedAt });
      void (this.scores as FirebaseScoreStore).sync?.();
```

Collect move timestamps in `Game` on every click — the reducer stores only
the identifiers, and the server needs both lists.

- [ ] **Step 5: Run the tests — they should pass**

```bash
npx ng test --watch=false
```

Expected: PASS (5 tests).

- [ ] **Step 6: Check the whole path against the emulators**

```bash
npx firebase emulators:start --only auth,firestore,functions
# in a second terminal
npx ng serve --configuration development
```

Play an Easy match to completion and check in the Firestore emulator that:

1. a document appeared in `users/{uid}/scores`,
2. the `score` field matches the score on screen,
3. an attempt to write to `scores` manually from the browser console
   **is denied** (rules).

- [ ] **Step 7: Deploy the functions and rules**

```bash
cd functions && npm run build && cd ..
npx firebase deploy --only functions,firestore:rules
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add score synchronization with server-side verification"
```

---

### Task 5: Account UI

**Files:**
- Create: `src/ui/account.ts`
- Modify: `src/ui/home.ts`
- Test: `src/ui/account.spec.ts`

- [ ] **Step 1: Write failing tests**

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
  it('states plainly that the game works without an account', async () => {
    const fixture = await setup();
    expect((fixture.nativeElement as HTMLElement).textContent).toMatch(/without an account|don't need/i);
  });

  it('offers to preserve scores after creating an anonymous account', async () => {
    const fixture = await setup();
    await TestBed.inject(AuthStore).signInAnonymouslyIfNeeded();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-role="link-account"]')).not.toBeNull();
  });

  it('does not offer it again after the account has been upgraded', async () => {
    const fixture = await setup();
    const auth = TestBed.inject(AuthStore);
    await auth.signInAnonymouslyIfNeeded();
    await auth.linkWithGoogle();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-role="link-account"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Implement the component**

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
        <p>You're playing without an account — you don't need to sign in. Scores are saved on this device.</p>
      } @else if (auth.isAnonymous()) {
        <p>Your scores are saved on a temporary account tied to this browser.</p>
        <button type="button" data-role="link-account" (click)="link()">
          Keep your scores — link a Google account
        </button>
      } @else {
        <p>Scores are saved to your account.</p>
        <button type="button" data-role="sign-out" (click)="signOut()">Sign out</button>
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

Add `<arw-account />` on the start screen, below the buttons.

- [ ] **Step 3: Run the tests and deploy**

```bash
npm run check
npm run deploy
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add the player account panel"
```

---

## Slice Acceptance Criteria

- **The game works without signing in and without a network** — this is test
  number one. Turn off the network, play a match, win: the score saves locally.
- The server-side score is **computed by the server**: the function replays
  the run from the seed and move sequence, and an inflated `claimedScore` is
  rejected.
- Firestore rules **forbid the client from writing** to the scores collection
  — confirmed by an emulator test, not just the UI.
- The anonymous account is created only at the first sync and can be upgraded
  to permanent **while preserving history** (the same UID).
- Scores rejected by the server are not retried in a loop.
- `npm run test:core`, `npm test`, `npm run test:rules`, and the function tests
  pass.
