# Retiring the old lab — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the Deno lab page now that `apps/lab` has reached parity, and
leave behind a store server that says what it is, a build-output proof that the
React lab carves the engine's boards, and documentation that describes one lab
rather than two.

**Architecture:** The work is mostly subtraction, ordered so that every task
leaves both gates green. One task adds code — the smoke over `vite build`,
which replaces the fingerprint gate that dies with `lab-bundle.test.ts`. It
comes first, because from the moment the Deno bundle test is gone nothing else
proves that a bundler kept the engine intact. The server is emptied of its page
and bundle areas before the files themselves go, and renamed only once it has
stopped pretending to serve a lab.

**Tech Stack:** Deno 2.9 (`packages/cli`, `packages/engine`), Node 24 + Vite 8 +
Vitest 5 (`apps/lab`), Nx targets over both.

**Spec:** `docs/superpowers/specs/2026-09-13-lab-react-app-design.md` — §8
(fingerprint parity, with the measurement that settled it), §9.5
(prerequisites), §10 row 8 (the delivery contents).

## Global Constraints

- **Everything written into the repository is English**: code, comments, tests,
  documentation, branch names, commit messages. Only the chat with the user is
  Polish.
- **No attribution lines** in commit messages or pull request descriptions.
- **No `any`, no non-null assertions.** `deno lint` enforces this under
  `packages/`; `apps/lab/eslint.config.js` restates both rules for `apps/`.
- **Both gates must pass before the PR:** `deno task verify` at the repository
  root and `pnpm nx run-many -t verify`. After Task 5 the root `verify` no
  longer ends in `deno task bundle` — that is intended, not a regression.
- **The branch is `lab/retire-old-lab`**, the fifth on the stack, based on
  `lab/board-detail` (PR #73). The PR's base is `lab/board-detail`.
- **Cite symbols, not line numbers,** in comments and documents this branch
  writes: this branch moves and deletes code, and `file:line` citations written
  against its own intermediate states go stale within the same PR.

---

## File structure

| File | Fate |
|---|---|
| `apps/lab/scripts/worker-smoke.mjs` | **New.** Runs the chunk `vite build` emits and compares both worker messages with the engine in-process. |
| `apps/lab/eslint.config.js` | Gains one block: `scripts/**/*.mjs` may import `node:*` and knows `console`. |
| `apps/lab/package.json`, `apps/lab/project.json` | Gain the `smoke` script and target; `verify` gains `smoke`. |
| `packages/cli/carve.test.ts` | Loses the test that parsed `lab.html` for number fields. |
| `packages/cli/lab-server.ts` → `packages/cli/store-server.ts` | Loses the page and `/dist/` areas, `LAB_CSP` and the MIME entries no stored file can have; then renamed, with `createLabServer` → `createStoreServer`. |
| `packages/cli/lab-server.test.ts` → `packages/cli/store-server.test.ts` | Two tests rewritten, then renamed with the module. |
| `packages/cli/lab.sh` → `packages/cli/store.sh` | Loses the bundle, the watch, the `open` and the Lit check. |
| `packages/cli/lab.html`, `lab-page.ts`, `lab-worker.ts`, `lab-bundle.test.ts` | **Deleted.** |
| `packages/cli/deno.json`, `deno.json`, `packages/cli/project.json`, `.github/workflows/ci.yml` | Lose the `bundle` task and target; the `lab` task becomes `store`. |
| `packages/engine/neutral.test.ts` | Gains a DOM-only pattern set applied to `packages/cli/*.ts`. |
| `README.md`, `README.pl.md`, `CLAUDE.md` | Describe one lab. |

---

### Task 1: The smoke over the built worker

The only new code in this PR, and the prerequisite §9.5 names. It must exist
before Task 5 deletes `lab-bundle.test.ts`.

**Files:**
- Create: `apps/lab/scripts/worker-smoke.mjs`
- Modify: `apps/lab/eslint.config.js`, `apps/lab/package.json`,
  `apps/lab/project.json`

**Interfaces:**
- Consumes: `@arrowz/engine` (`decodeBoard`, `defaultParams`, `encodeBoard`,
  `fingerprint`, `generate`, `toSvg`) and `@arrowz/engine/command`
  (`DEFAULT_VIEW`, `svgOptions`) — measured to resolve by package name from
  `apps/lab/scripts/`, because `apps/lab/package.json` depends on
  `@arrowz/engine` as `workspace:*`.
- Produces: the Nx target `lab:smoke`, which later tasks rely on as the
  successor to `cli`'s bundle fingerprint test.

- [ ] **Step 1: Give the script room in ESLint**

Without this the script cannot even be linted. Measured against the script as
Step 2 writes it: **four** errors — `node:fs` and `node:process` both
`no-restricted-imports`, and `console` **and `URL`** both `no-undef` (the
`.mjs` file is not TypeScript, so typescript-eslint does not silence `no-undef`
for it, and `globals` is not a dependency of this project, so the globals are
listed by hand). An earlier measurement of this plan said three, because the
file it measured did not call `new URL(...)`; the script calls it twice.

In `apps/lab/eslint.config.js`, add this block immediately **before** the
existing `{ files: ['**/*.node.test.ts'], ... }` block:

```js
  // The build-output smoke is a Node script by nature: it reads dist/ and sets
  // an exit code. The application itself still may not import node: modules.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { console: 'readonly', URL: 'readonly' } },
    rules: { 'no-restricted-imports': 'off' },
  },
```

- [ ] **Step 2: Write the script**

Create `apps/lab/scripts/worker-smoke.mjs`:

```js
// The successor to packages/cli/lab-bundle.test.ts, which ran the Deno-bundled
// worker and compared its board with the engine's own. This proves the same
// thing over the artefact Vite builds — dist/assets/generate.worker-<hash>.js,
// the file a browser really loads. parity.browser.test.ts already compares the
// worker with the engine, but over the engine as Vitest transforms it: a
// tree-shaken, minified production bundle is a different artefact, and nothing
// else in the repository ever runs it.
//
// No browser is needed. The chunk touches nothing but `self.*` and
// `performance.now()`, so substituting `self` and collecting `postMessage`
// runs it in plain Node (measured 2026-09-17).
import { readdirSync } from 'node:fs'
import process from 'node:process'
import { decodeBoard, defaultParams, encodeBoard, fingerprint, generate, toSvg } from '@arrowz/engine'
import { DEFAULT_VIEW, svgOptions } from '@arrowz/engine/command'

const assets = new URL('../dist/assets/', import.meta.url)
// The chunk's name carries a content hash, so it is found by prefix. Exactly
// one must match: a second worker and a silent pick would leave this script
// passing over the wrong artefact.
const found = readdirSync(assets).filter((f) => f.startsWith('generate.worker') && f.endsWith('.js'))
if (found.length !== 1) {
  console.error(`expected exactly one built worker chunk, found ${found.length}: ${found.join(', ') || '(none)'}`)
  process.exit(1)
}

const messages = []
globalThis.self = globalThis
globalThis.postMessage = (message) => messages.push(message)
await import(new URL(found[0], assets).href)
if (typeof globalThis.onmessage !== 'function') {
  console.error('importing the worker chunk registered no onmessage handler')
  process.exit(1)
}

let failures = 0
function check(ok, what) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) failures++
}

const params = { ...defaultParams(), W: 20, H: 20, seed: 7 }
const mine = generate(params)

// Progress messages may precede the answer; the answer is the one that is not
// progress, exactly as every caller of this protocol treats it.
globalThis.onmessage({ data: { type: 'generate', params } })
const done = messages.find((m) => m.type === 'done')
check(done !== undefined && done.ok === true, 'the built worker closes a 20x20 board')
check(
  done !== undefined && fingerprint(decodeBoard(done.board)) === fingerprint(mine.board),
  'its board is the engine’s board',
)
check(done?.board?.fingerprint === fingerprint(mine.board), 'the board file it hands over carries that fingerprint')
check(done?.pieces === mine.board.pieces.length, 'it counts the pieces the engine counts')

messages.length = 0
const options = svgOptions(DEFAULT_VIEW)
globalThis.onmessage({ data: { type: 'svg', board: encodeBoard(mine.board), options } })
const svg = messages.find((m) => m.type === 'svg')
check(svg !== undefined && svg.svg === toSvg(mine.board, options), 'it draws the SVG the engine draws')

if (failures > 0) {
  console.error(`${failures} check(s) failed: the built worker is not the engine`)
  process.exit(1)
}
console.log('the built worker carves and draws what the engine does')
```

- [ ] **Step 3: Wire the script and the target**

In `apps/lab/package.json`, add to `scripts` (after `"build"`):

```json
    "smoke": "node scripts/worker-smoke.mjs",
```

In `apps/lab/project.json`, add the target and put it in `verify`. `nx.json`
already carries `targetDefaults.smoke` with `dependsOn: ["build"]`, caching and
`production` inputs, so the target needs nothing beyond this:

```json
    "smoke": {
      "executor": "nx:run-commands",
      "options": { "cwd": "apps/lab", "command": "pnpm run smoke" }
    },
```

and change the `verify` line to:

```json
    "verify": { "executor": "nx:noop", "dependsOn": ["check", "lint", "fmt", "test", "build", "smoke"] }
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm nx smoke lab`
Expected: the five `ok` lines and `the built worker carves and draws what the
engine does`; exit 0. Nx builds the lab first through `dependsOn`.

- [ ] **Step 5: Prove the smoke can fail**

A test that cannot fail is worth nothing, and this one guards a whole build
pipeline. Mutate the source, rebuild, and watch it go red:

```sh
cd /Users/tomek/dev/arrowz
# The worker answers with a board of a different seed than it was asked for.
sed -i '' 's/generate(message.params, {/generate({ ...message.params, seed: message.params.seed + 1 }, {/' apps/lab/src/worker/generate.worker.ts
pnpm nx build lab --skip-nx-cache && pnpm nx smoke lab --skip-nx-cache
```

Expected: **three** FAIL lines and a non-zero exit — `its board is the engine's
board`, `the board file it hands over carries that fingerprint`, and `it counts
the pieces the engine counts`, because a board of seed 8 has a different number
of pieces than one of seed 7. The two `ok` lines that remain are the ones this
mutation does not touch: the board still closes, and the SVG message still
draws from the board it is handed. (The script prints a curly apostrophe in
`engine's`; a grep for the straight one finds nothing.) Then restore it:

```sh
git checkout apps/lab/src/worker/generate.worker.ts
pnpm nx build lab --skip-nx-cache && pnpm nx smoke lab --skip-nx-cache
```

Expected: green again. **Restore the file by hand if `git checkout` is
refused** — a mutation left in the tree is a defect shipped.

- [ ] **Step 6: Lint, format, commit**

```sh
pnpm nx lint lab && pnpm nx fmt lab
git add apps/lab/scripts/worker-smoke.mjs apps/lab/eslint.config.js apps/lab/package.json apps/lab/project.json
git commit -m "Prove the built worker is the engine, not just the transformed one"
```

---

### Task 2: The CLI stops reading the old page for view ranges

**Files:**
- Modify: `packages/cli/carve.test.ts` (the test named "every picture field of
  the lab stays inside the CLI range", with the comment paragraph above it)
- Modify: `apps/lab/src/console/viewFields.test.ts` (one comment)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: nothing later tasks import. It removes the last reason
  `carve.test.ts` has to open `lab.html`, which Task 5 deletes.

- [ ] **Step 1: Delete the test and its comment**

Remove the whole `Deno.test('every picture field of the lab stays inside the
CLI range', ...)` block together with the two-sentence comment above it ("The
lab's own fields are narrower than the CLI on purpose…").

- [ ] **Step 2: Check what the deletion orphans**

The deleted test is the only user of some imports in that file. Run:

```sh
cd packages/cli
grep -n "ViewNumber\|VIEW_RANGE\|join(here" carve.test.ts | head
```

Remove from `carve.test.ts`'s imports only what no remaining line uses; leave
everything still referenced. `deno lint` is the arbiter here, not `deno check`:
`noUnusedLocals` is not set for this package, so `check` would pass over a dead
import, while `lint`'s recommended set includes `no-unused-vars` and fails on
it. That is why the next step runs both.

- [ ] **Step 3: Record where the guard lives now**

The coverage is not lost: `apps/lab/src/console/viewFields.ts` reads each bound
from `VIEW_RANGE` at the point of use. Record that where the claim lives.

`apps/lab/src/console/viewFields.test.ts` has **no comment block at the top** —
four imports and one note about where the types come from. The paragraph that
cites the deleted CLI test sits *inside the first test body*, the one named
"a step is a step a whole-number field can land on". **That test guards steps,
not bounds** — do not relabel it as a bounds guard; the bounds are guarded by
`ViewPanel.browser.test.tsx`, which Task 10 handles.

Replace the whole paragraph with this, which drops the citation and keeps every
reason the original carried:

```ts
  // Once the bounds are read from `VIEW_RANGE` rather than restated, they can
  // no longer disagree with the CLI, but the step still can — a fractional step
  // on a field the store rounds would make every arrow press either a no-op or
  // a jump of one, depending on where the value already sat.
```

**Word it exactly as given.** Later tasks sweep this repository for the names
of the deleted files and for the phrase that dates this work; a comment written
here containing either would be swept away by a task that does not know why it
was written.

- [ ] **Step 4: Run both sides**

```sh
cd /Users/tomek/dev/arrowz/packages/cli && deno check *.ts && deno lint && deno test --allow-read --allow-write --allow-env --allow-run --allow-net carve.test.ts
cd /Users/tomek/dev/arrowz && pnpm nx test lab
```

Expected: both green.

- [ ] **Step 5: Commit**

```sh
git add packages/cli/carve.test.ts apps/lab/src/console/viewFields.test.ts
git commit -m "Let the view ranges be guarded where they are read, not parsed out of HTML"
```

---

### Task 3: The server stops serving a page

The router still answers `/lab.html` and `/dist/`. Emptying it here — before
the files go — keeps every intermediate state coherent: after this task the old
page is unreachable but the repository is green.

**Files:**
- Modify: `packages/cli/lab-server.ts` (module comment, `LAB_CSP`, `MIME`, the
  area selection inside `createLabServer`, the `onListen` line)
- Modify: `packages/cli/lab-server.test.ts` (the tests named "static lab files
  without cache; paths escaping the directory are rejected" and "only the page,
  its bundle and the store are served, with security headers")

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `API_CSP` replacing the exported `LAB_CSP`; `STORE_CSP` and
  `MAX_BODY` keep their names and meaning. Task 6 renames the module around
  these names.

- [ ] **Step 1: Rewrite the two tests first, and watch them fail**

In `packages/cli/lab-server.test.ts`, replace the test "static lab files
without cache; paths escaping the directory are rejected" with:

```ts
Deno.test('stored files are served without cache; paths escaping the store are rejected', () =>
  withServer(async (base) => {
    const { meta } = await saveBoard({
      board: emptyFile(10, 10),
      params: { ...defaultParams(), W: 10, H: 10, seed: 11 },
      // `rounded` is required by `View` (`types.ts`). The POST-body tests in
      // this file omit it because their body crosses as `unknown`; a typed
      // `saveBoard` call does not get that licence and fails `deno check`.
      view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0, rounded: false },
      command: 'x',
      source: 'cli',
    })
    const file = await fetch(`${base}/store/10x10/${meta.id}.board.json`)
    assertEquals(file.status, 200)
    assertEquals(file.headers.get('cache-control'), 'no-store, must-revalidate')
    await file.body?.cancel()
    // The server has no page of its own to serve any more.
    const root = await fetch(base + '/')
    assertEquals(root.status, 404)
    await root.body?.cancel()
    const missing = await fetch(base + '/store/10x10/missing.board.json')
    assertEquals(missing.status, 404)
    await missing.body?.cancel()
    const escape = await fetch(base + '/store/..%2F..%2Fengine.ts')
    assertEquals(escape.status, 403)
    await escape.body?.cancel()
    const malformed = await fetch(base + '/%E0')
    assertEquals(malformed.status, 400)
    assertEquals(await malformed.json(), { error: 'malformed path' })
  }))
```

And replace "only the page, its bundle and the store are served, with security
headers" with:

```ts
Deno.test('only the store is served, with security headers', () =>
  withServer(async (base) => {
    // Sources, configuration and a bundle path all answer the same way now:
    // there is nothing here but the API and the store.
    for (const path of ['/carve.ts', '/store.ts', '/deno.json', '/dist/anything.js', '/store/..%2Fcarve.ts']) {
      const r = await fetch(base + path)
      assert(r.status === 404 || r.status === 403, `${path} gave ${r.status}`)
      await r.body?.cancel()
    }
    const list = await fetch(base + '/api/boards')
    assertEquals(list.headers.get('content-security-policy'), API_CSP)
    assertEquals(list.headers.get('x-content-type-options'), 'nosniff')
    assertEquals(list.headers.get('x-frame-options'), 'DENY')
    assertEquals(list.headers.get('referrer-policy'), 'no-referrer')
    assertEquals(list.headers.get('cross-origin-resource-policy'), 'same-origin')
    await list.body?.cancel()
    const { meta } = await saveBoard({
      board: emptyFile(10, 10),
      svg: '<svg>x</svg>',
      params: { ...defaultParams(), W: 10, H: 10, seed: 6 },
      view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 1, colored: false, top: 0, rounded: true },
      command: 'x',
      source: 'cli',
    })
    const svg = await fetch(`${base}/store/10x10/${meta.id}.svg`)
    assertEquals(svg.headers.get('content-security-policy'), STORE_CSP)
    assert(STORE_CSP.includes('sandbox'))
    await svg.body?.cancel()
  }))
```

Change the import at the top of the file from `LAB_CSP` to `API_CSP`.

Run: `cd packages/cli && deno test --allow-read --allow-write --allow-env --allow-run --allow-net lab-server.test.ts`
Expected: FAIL **at type-check, before a single test runs** — `TS2305`, the
module has no export `API_CSP`. Deno type-checks the file first, so nothing is
yet observable about what `/` answers; that only becomes measurable in Step 3.

- [ ] **Step 2: Empty the router**

In `packages/cli/lab-server.ts`:

Replace the `LAB_CSP` declaration and its comment with:

```ts
/**
 * What this server answers is JSON and stored files, never a page: nothing may
 * be loaded, framed or connected to from a response of its own accord.
 */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
```

Change the default parameter of `send` from `csp = LAB_CSP` to `csp = API_CSP`.

Reduce `MIME` to what the store can hold:

```ts
const MIME: Record<string, string> = {
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
}
```

Replace the path handling in `createLabServer` — the `rel` assignment and the
`area` selection — with:

```ts
      // One area is served: the store, which may live outside packages/cli/
      // (see ARROWZ_BOARDS_DIR). The sources beside this file are not served,
      // and neither is a page: the lab is `apps/lab` and Vite serves it.
      let rel: string
      try {
        rel = decodeURIComponent(url.pathname)
      } catch {
        return send(400, '{"error":"malformed path"}')
      }
      if (!rel.startsWith('/store/')) return send(404, '{"error":"not found"}')
      const area = { base: boardsDir(), name: rel.slice('/store/'.length), csp: STORE_CSP }
```

Delete the `hint` that pointed at `deno task bundle` in the 404 branch below,
leaving `return send(404, '{"error":"not found"}')`.

Then remove what has become unused. `deno lint` is the arbiter, and it reports
them in waves: `ROOT` first, then `dirname` and `fromFileUrl` once `ROOT` is
gone. **`join` stays** — `normalize(join(baseDir, area.name))` still uses it.
Run `deno lint` after each removal rather than deleting by eye.

Replace the module comment at the top with one that describes what is left.
Do **not** name the task or the script here: they are still called `lab` and
`lab.sh` at this point in the plan, and Task 4 renames them. Task 4 adds the
sentence that names them.

```ts
// The board store over HTTP: the store's own API under /api/boards (GET list,
// POST save a board file, DELETE one) and the stored files themselves under
// /store/. The files answer to /store/ and not to /boards/ because /boards is
// the lab application's library route and /boards/<size>/<id> is a board's own
// address there (spec §5.6); the directory on disk is unchanged. Nothing else
// is served: this process has no page of its own.
```

And the `onListen` line, so it prints what there is to open:

```ts
      onListen: () => console.log(`Board store: http://localhost:${port}/api/boards   (Ctrl+C stops)`),
```

- [ ] **Step 3: Run the server tests**

Run: `cd packages/cli && deno test --allow-read --allow-write --allow-env --allow-run --allow-net lab-server.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 4: Prove both guards still guard**

There are **two** path checks here, and they catch different things. Mutate
each one separately, and watch the assertion named below go red — if a
different one reddens, the guard is not doing what this step claims.

1. **The area check.** Change `if (!rel.startsWith('/store/'))` to
   `if (false)` and rerun. Red: `assertEquals(root.status, 404)` in "stored
   files are served without cache" — `/` becomes an empty name inside the store
   and answers 403 instead of 404. It is **not** the escaping-path case that
   reddens: `/store/..%2F..%2Fengine.ts` is still caught by the second guard,
   and the five-path loop in the other test still passes, because those paths
   merely become junk names that are missing from the store.
2. **The containment check.** Restore the first, then change
   `if (!file.startsWith(baseDir + SEPARATOR))` to `if (false)` and rerun.
   Red: `assertEquals(escape.status, 403)`. This is the one that keeps a
   request inside the store directory.

Restore both lines by hand and rerun: all tests in the file pass. **A mutation
left in the tree is a defect shipped.**

- [ ] **Step 5: Commit**

```sh
git add packages/cli/lab-server.ts packages/cli/lab-server.test.ts
git commit -m "Serve the store and nothing else: the page and its bundle leave the router"
```

---

### Task 4: `lab.sh` becomes the store's script

**Files:**
- Rename: `packages/cli/lab.sh` → `packages/cli/store.sh`
- Modify: `packages/cli/deno.json` (the `lab` task), `deno.json` (the root
  `lab` task)
- Modify: `packages/engine/lab-i18n.ts` (`noStoreServer`, **both languages** —
  a user-facing string in the *new* lab that names this script)
- Modify: `apps/lab/src/library/BoardList.tsx` (the comment naming `lab.sh`)

**Interfaces:**
- Consumes: the emptied server from Task 3.
- Produces: `deno task store` at the root and in `packages/cli`. Task 5's
  deletion of the `bundle` task depends on nothing here still calling it.

- [ ] **Step 1: Rename and rewrite the script**

```sh
git mv packages/cli/lab.sh packages/cli/store.sh
```

Replace the contents of `packages/cli/store.sh` with:

```sh
#!/bin/sh
# Starts the board store at http://localhost:8777/api/boards
#
# The lab itself is `apps/lab` (`pnpm nx serve lab`, port 8779); this serves
# the store it reads and writes, through the proxy in apps/lab/vite.proxy.ts.
# The CLI writes the same directory directly, without this server.
set -e
cd "$(dirname "$0")"
PORT=${1:-8777}
# The server gets what it serves and nothing more: the network on this
# machine, and the store, which it reads and writes.
BOARDS=${ARROWZ_BOARDS_DIR:-$PWD/boards}
mkdir -p "$BOARDS"
exec deno run --allow-net=127.0.0.1 --allow-read="$BOARDS" --allow-write="$BOARDS" --allow-env=ARROWZ_BOARDS_DIR \
  lab-server.ts "$PORT"
```

Note the permission narrowing: `--allow-read=.` becomes `--allow-read="$BOARDS"`,
because nothing outside the store is served any more. Measured: Deno loads local
modules and its JSR cache without read permission, and the module reads only the
store at run time, so nothing breaks. The module is still named `lab-server.ts`
here; Task 6 renames it and this line with it.

Then finish the module comment Task 3 left deliberately incomplete — it could
not name a task and a script that did not exist yet. Append one sentence to the
comment block at the top of `packages/cli/lab-server.ts`:

```ts
// Run: deno task store (store.sh scopes the permissions: net on 127.0.0.1,
// read and write of the store, one env var).
```

- [ ] **Step 2: Rename the tasks**

In `packages/cli/deno.json`, replace `"lab": "sh lab.sh"` with:

```json
    "store": "sh store.sh",
```

In the root `deno.json`, replace `"lab": "deno task --cwd=packages/cli lab"` with:

```json
    "store": "deno task --cwd=packages/cli store",
```

- [ ] **Step 3: Fix the message that tells the user to run it**

The dictionary carries a user-facing string, in both languages, naming the
script this task just renamed — and it is the **new** lab that shows it:
`BoardList` renders `dict.t('noStoreServer')` when the store cannot be reached.
In `packages/engine/lab-i18n.ts`, change the English entry to:

```ts
    noStoreServer: 'No store server — run sh packages/cli/store.sh.',
```

and the Polish one to:

```ts
    noStoreServer: 'Brak serwera magazynu — uruchom sh packages/cli/store.sh.',
```

Two browser tests match this text, both in
`apps/lab/src/library/LibraryPanel.browser.test.tsx`, with the regular
expression `/No store server/` — the part that does not change. So no test edit
is needed, and **no test can tell you whether you made this edit correctly**;
that was measured, not assumed. Know why before you rely on the run below:

**The lab reads the dictionary from the engine's built `dist/`.**
`packages/engine/package.json` maps `./i18n` to `./dist/lab-i18n.js`, and
`apps/lab/node_modules/@arrowz/engine` is a symlink to the package. Editing the
source and running `vitest` directly tests the **old** string — measured: the
two tests passed against `lab.sh` after the source already said `store.sh`. The
command below is safe because Nx rebuilds the engine first (`test` carries
`dependsOn: ["^build"]` and `lab-i18n.ts` is in the engine's `production`
inputs); a bare `pnpm --filter @arrowz/lab exec vitest run` is not.

```sh
cd /Users/tomek/dev/arrowz && pnpm nx test lab && pnpm nx test engine
```

Then confirm the edit reached the artefact, because the tests will not:

```sh
grep -o "noStoreServer: '[^']*'" packages/engine/dist/lab-i18n.js
```

Expected: both lines name `store.sh`.

Then correct the comment in `apps/lab/src/library/BoardList.tsx` that says an
unreachable store "asks for `lab.sh`": it asks for `store.sh` now.

- [ ] **Step 4: Start it and see the store answer**

```sh
cd /Users/tomek/dev/arrowz
ARROWZ_BOARDS_DIR=$(mktemp -d) sh packages/cli/store.sh 8791 &
sleep 2
curl -s -o /dev/null -w 'api %{http_code}\n' http://localhost:8791/api/boards
curl -s -o /dev/null -w 'root %{http_code}\n' http://localhost:8791/
kill %1 2>/dev/null || pkill -f 'store.sh 8791'
```

(`kill %1` needs interactive job control; in a non-interactive shell it does
nothing, which is why the fallback is there. Leaving a server on port 8791
behind will make the next run of this step look like a success it is not.)

Expected: `api 200` and `root 404`. Use a temporary store: this must not touch
`packages/cli/boards/`.

- [ ] **Step 5: Commit**

```sh
git add packages/cli/store.sh packages/cli/deno.json deno.json packages/engine/lab-i18n.ts apps/lab/src/library/BoardList.tsx
git commit -m "Start the store, not a lab: lab.sh becomes store.sh"
```

---

### Task 5: Delete the page, its script, its worker and their gates

**Files:**
- Delete: `packages/cli/lab.html`, `packages/cli/lab-page.ts`,
  `packages/cli/lab-worker.ts`, `packages/cli/lab-bundle.test.ts`
- Modify: `packages/cli/deno.json` (the `bundle` task), `deno.json` (the
  `bundle` task, the `verify` chain, `fmt.exclude`),
  `packages/cli/project.json` (the `bundle` target and `verify`),
  `.github/workflows/ci.yml` (the target list)

**Interfaces:**
- Consumes: Task 1's `lab:smoke` — the fingerprint gate that replaces
  `lab-bundle.test.ts`; Tasks 2, 3 and 4, which removed every reader of the
  deleted files.
- Produces: a `packages/cli` with no browser code in it, which Task 7 puts
  under guard.

- [ ] **Step 1: Delete the four files**

```sh
git rm packages/cli/lab.html packages/cli/lab-page.ts packages/cli/lab-worker.ts packages/cli/lab-bundle.test.ts
```

- [ ] **Step 2: Remove the bundle task and target**

In `packages/cli/deno.json`, delete the `"bundle"` line entirely.

In the root `deno.json`:
- delete the `"bundle": "deno task --cwd=packages/cli bundle"` line;
- change `verify` to `"deno task check && deno task lint && deno task fmt && deno task test"`;
- delete `"packages/cli/lab.html",` from `fmt.exclude`.

In `packages/cli/project.json`, delete the whole `"bundle"` target object and
change `verify` to:

```json
    "verify": { "executor": "nx:noop", "dependsOn": ["check", "lint", "fmt", "test"] }
```

In `.github/workflows/ci.yml`, change the final run line to:

```yaml
      - run: pnpm nx affected -t check lint fmt test build smoke
```

Measured on 2026-09-17: `nx` exits 0 with "No tasks were run" when no project
owns a named target, so leaving `bundle` there would not redden CI — it is
removed because it names something that no longer exists.

While in `packages/cli/project.json`, drop `board-element` from
`implicitDependencies`, leaving `["engine"]`. That edge existed because the
bundle imported the board element through `lab-page.ts`, which this task
deletes; left in place it keeps invalidating the CLI's Nx cache and widening
`affected` on every board-element change, for nothing.

- [ ] **Step 3: Prove nothing still points at the deleted files**

```sh
cd /Users/tomek/dev/arrowz
grep -rn "lab\.html\|lab-page\|lab-worker\|task bundle\|cli:bundle" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.sh" --include="*.yml" . | grep -v node_modules | grep -v "^\./docs/superpowers" | grep -v "packages/cli/dist"
```

Expected: **around seventy hits, and every one of them a comment** — measured,
72 at this point in the plan: roughly sixty comment citations across
`apps/lab/src` and six in `packages/engine` (`engine.ts`, `command.ts`,
`geometry.ts`, `lab-i18n.ts`, `neutral.test.ts`, `lab-report.test.ts`). Those
are Tasks 10 and 11's work and are expected here, so a count in that region
means the sweep is going as planned. (The documentation files are **not**
among them: this command's `--include` list admits no `.md`, which is also why
the `docs/superpowers` filter on it never matches anything.)

**What must NOT appear is a hit on an executable line**: an import, a path
passed to a function, a task name in a configuration file, a `<script src>`.
That is the reader nobody accounted for. Read every hit and classify it; if one
is executable, stop and report it rather than deleting around it.

- [ ] **Step 4: Run the Deno gate whole**

```sh
cd /Users/tomek/dev/arrowz && deno task verify
```

Expected: green, and visibly without a bundle step at the end.

- [ ] **Step 5: Commit**

```sh
git add -A packages/cli deno.json .github/workflows/ci.yml
git commit -m "Delete the old lab page, its worker and the bundle that built them"
```

---

### Task 6: The server is named for what it is

**Files:**
- Rename: `packages/cli/lab-server.ts` → `packages/cli/store-server.ts`,
  `packages/cli/lab-server.test.ts` → `packages/cli/store-server.test.ts`
- Modify: `packages/cli/store.sh` (the module it runs),
  `apps/lab/vite.proxy.ts` (the comment naming the task and the server),
  `apps/lab/src/api/boards.node.test.ts` (**it spawns the module by path** —
  `'packages/cli/lab-server.ts'` in the `spawn` arguments, and a comment citing
  `lab-server.ts:77`), `packages/engine/types.ts` (a doc comment naming
  `lab-server.ts`'s `checkMetrics`)

**Interfaces:**
- Consumes: Task 3's `API_CSP`, Task 4's `store.sh`.
- Produces: `createStoreServer()` replacing `createLabServer()`; `API_CSP`,
  `STORE_CSP` and `MAX_BODY` keep their names. Nothing outside these two files
  and `store.sh` imports the module — verified in Step 3.

- [ ] **Step 1: Rename the files**

```sh
git mv packages/cli/lab-server.ts packages/cli/store-server.ts
git mv packages/cli/lab-server.test.ts packages/cli/store-server.test.ts
```

- [ ] **Step 2: Rename the factory and fix the references**

In `store-server.ts`, rename `createLabServer` to `createStoreServer` (its
declaration and its use in the `import.meta.main` block).

In `store-server.test.ts`, change the import to:

```ts
import { API_CSP, createStoreServer, MAX_BODY, STORE_CSP } from './store-server.ts'
```

and the one call inside `withServer` to `createStoreServer()`.

In `store.sh`, change the last line's module name to `store-server.ts`.

In `apps/lab/vite.proxy.ts`, update the two places that name the old world: the
doc comment on `LAB_SERVER` (`deno task lab` → `deno task store`) and the
reference to the origin comparison, which must now cite the symbol rather than
a line number — `store-server.ts`'s `refusal()` — because this branch has
already moved that code once.

- [ ] **Step 3: Prove no reader was missed**

```sh
cd /Users/tomek/dev/arrowz
grep -rn "lab-server\|createLabServer" --include="*.ts" --include="*.tsx" --include="*.sh" --include="*.json" . | grep -v node_modules | grep -v "^\./docs/superpowers"
```

Expected: no hits.

- [ ] **Step 4: Run both gates' relevant halves**

```sh
cd /Users/tomek/dev/arrowz && deno task check && deno task test && pnpm nx test lab
```

Expected: green. `apps/lab`'s `boards.node.test.ts` spawns the store server —
if the rename missed a path, it fails here.

- [ ] **Step 5: Commit**

```sh
git add -A packages/cli apps/lab/vite.proxy.ts apps/lab/src/api/boards.node.test.ts packages/engine/types.ts
git commit -m "Name the store server for what it serves"
```

---

### Task 7: The DOM rule loses its exception and gains a guard

**Files:**
- Modify: `packages/engine/neutral.test.ts`

**Interfaces:**
- Consumes: Task 5's deletion — the claim only becomes true once `lab-page.ts`
  is gone.
- Produces: nothing later tasks use.

- [ ] **Step 1: Write the failing test**

The existing test walks a list of engine modules with a pattern set that
includes `/\bDeno\./`. The CLI is Deno by definition, so it needs its own,
DOM-only set. Add to `packages/engine/neutral.test.ts`, after the existing
test:

```ts
// The rule "the dom lib belongs to no file here" used to carry an exception,
// and an exception cannot be tested. It has none now, so the rule becomes a
// test: nothing in the CLI package may reach for a browser. `Deno.` is
// deliberately not among the patterns — that package is a Deno program.
const DOM_ONLY = [/\bdocument\./, /\bwindow\./, /\blocalStorage\b/, /\bHTMLElement\b/, /\bnavigator\./]

Deno.test('no file in packages/cli reaches for the DOM', () => {
  const cli = join(dirname(fromFileUrl(import.meta.url)), '..', 'cli')
  const files = [...Deno.readDirSync(cli)]
    .filter((e) => e.isFile && e.name.endsWith('.ts'))
    .map((e) => e.name)
  assert(files.length > 5, `only ${files.length} TypeScript files found in packages/cli: the walk is wrong`)
  for (const name of files) {
    const text = Deno.readTextFileSync(join(cli, name))
    for (const re of DOM_ONLY) assert(!re.test(text), `packages/cli/${name} matches ${re}`)
  }
})
```

- [ ] **Step 2: Fix the file's own header, which states the exception**

The third line of `neutral.test.ts` still carries the rule in its old form —
"The compiler keeps DOM out (no dom lib outside lab-page.ts); this test keeps
the rest out." Replace that parenthesis:

```ts
// The runtime-neutral modules must stay importable from a browser and from
// Angular: no Deno, DOM, Node or process API. The compiler keeps DOM out of
// them; this test keeps the rest out, and the test below keeps the DOM out of
// the CLI package too.
```

- [ ] **Step 3: Run it and see it pass**

Run: `cd packages/engine && deno test --allow-read neutral.test.ts`
Expected: PASS.

- [ ] **Step 4: Prove it can fail**

A test written after the fact must be shown to bite. Append a line to a CLI
file and watch it go red:

```sh
cd /Users/tomek/dev/arrowz
echo "// document.title is not for this package" >> packages/cli/store.ts
cd packages/engine && deno test --allow-read neutral.test.ts
```

Expected: FAIL naming `packages/cli/store.ts`. Then remove the line by hand
(`git checkout packages/cli/store.ts`) and rerun: PASS. **The comment above
proves the pattern matches comments too, which is intended — a browser API
named in a comment in this package is already a mistake.**

- [ ] **Step 5: Commit**

```sh
git add packages/engine/neutral.test.ts
git commit -m "Guard the rule the old lab used to be the exception to"
```

---

### Task 8: Both READMEs describe one lab

**Files:**
- Modify: `README.md` (the "The web page" section, the "The web page shows
  nothing" entry under "When something goes wrong", the "Where things live"
  table)
- Modify: `README.pl.md` (the same three places: "Strona internetowa", "Strona
  nic nie pokazuje", "Gdzie co leży")

**Interfaces:**
- Consumes: Tasks 4, 5 and 6 — the commands and file names this text describes.
- Produces: nothing later tasks use.

- [ ] **Step 1: Rewrite the English section**

Replace the whole `## The web page` section — the heading, every paragraph
under it, **and the closing paragraph beginning "A second lab is being built at
`apps/lab`" itself** (it is replaced, not kept: the sentence "It does not
replace the page above yet" would otherwise contradict everything above it) —
with:

````markdown
## The lab

There is a small application for playing with the settings and seeing the
result immediately. It draws the board with the board element, which needs Lit:
run `corepack enable pnpm && pnpm install` once at the top of the repository
before the first start. The lab keeps its boards in the store, which is served
by a small Deno program, so two commands run side by side:

```sh
deno task store        # the board store, port 8777
pnpm nx serve lab      # the lab itself, port 8779
```

Open `http://localhost:8779`. Stop each with Ctrl+C. The lab expects the store
on 8777; if that port is taken on your computer, both sides have to be told the
new number — the store takes it after the command (`deno task store 9000`), and
the lab reads it from one line in `apps/lab/vite.proxy.ts`.

The lab has two modes, and a Polish/English switch.

**Simple** is the default: board size, two sliders (arrow length, line shape),
a backbone switch and the seed — the same choices as the plain command line.
**Advanced** shows every knob from the previous section, with a description of
each and a list of ready-made settings, from Easy 25×25 up to Insane 1000×1000.

Two things the lab does that the command line does not. It shows you the exact
command that would reproduce whatever you are looking at, so you can copy it.
And it keeps a library of saved boards, so you can put one aside and come back
to it.

If you set a knob outside its safe range, the offending row turns red, the
reason appears next to it, and the Generate button stops working until you fix
it. The command stays on screen, so you can still copy rejected settings.
````

Then replace the troubleshooting entry:

```markdown
**The lab shows nothing** — the lab is served, not opened: it needs `pnpm nx
serve lab` running, and lives at `http://localhost:8779`. If the board library
is empty or refuses to save, the other half is missing: start `deno task store`
beside it.
```

Then four places outside the section, which a reader meets before it and which
would otherwise still describe the deleted page. Each is a single line:

- **the table of contents, `README.md:28`** — `7. [The web page](#the-web-page)`
  becomes `7. [The lab](#the-lab)`. The anchor is derived from the heading, so
  renaming the heading breaks this link silently.
- **the opening description, `README.md:8`** — "and a small web page for using
  it" becomes "and a small application for using it".
- **`README.md:699`**, in the explanation of *step* — "a value neither the
  slider on the web page nor the printed command could reach again" becomes
  "neither the slider in the lab nor the printed command". **The sentence wraps
  across two lines in the file**, so a single-line search for it finds nothing;
  open the line by number.
- **the word list, `README.md:964`** — "The code and the English web page call
  it a *piece*; the Polish page calls it an *element*" becomes "The code and the
  English text call it a *piece*; the Polish text calls it an *element*".

And in the "Where things live" table, delete the `lab.html`, `lab-page.ts` row,
and change the last two rows to:

```markdown
| `packages/cli/` | The command-line tool and the board store. |
| `apps/lab/` | The lab: a React application served by Vite. |
```

- [ ] **Step 2: Rewrite the Polish section the same way**

Replace `## Strona internetowa` with `## Laboratorium`, carrying over every
change above. Keep the Polish register of the surrounding text — the file
addresses the reader directly and informally ("Uruchamiasz je poleceniem…").
The code block is identical; the sentences around it say the same things:

````markdown
## Laboratorium

Jest mała aplikacja do zabawy ustawieniami i natychmiastowego oglądania wyniku.
Rysuje planszę elementem planszy, który potrzebuje Lit: przed pierwszym
uruchomieniem wpisz raz `corepack enable pnpm && pnpm install` w głównym
katalogu repozytorium. Laboratorium trzyma plansze w magazynie, który serwuje
mały program w Deno, więc obok siebie działają dwa polecenia:

```sh
deno task store        # magazyn plansz, port 8777
pnpm nx serve lab      # samo laboratorium, port 8779
```

Otwórz `http://localhost:8779`. Każde z poleceń zatrzymasz klawiszami Ctrl+C.
Laboratorium spodziewa się magazynu na porcie 8777; jeśli ten port jest u
ciebie zajęty, obie strony trzeba nauczyć nowego numeru — magazyn bierze go po
poleceniu (`deno task store 9000`), a laboratorium czyta go z jednej linii
w `apps/lab/vite.proxy.ts`.
````

As in the English file, the closing paragraph — "Powstaje drugie laboratorium,
w `apps/lab`…" — **is deleted**, not kept.

The remaining paragraphs of the Polish section (two modes, the two things the
lab does, the red row) stay as they are: they describe behaviour that did not
change. Replace the word "strona" with "laboratorium" where it is the subject —
**both where it is capitalised at the start of a sentence and where it is not**
("Dwie rzeczy, które **strona** robi" → "które **laboratorium** robi"), keeping
the verb agreement neuter ("Strona ma dwa tryby" → "Laboratorium ma dwa tryby").

The troubleshooting entry becomes:

```markdown
**Laboratorium nic nie pokazuje** — laboratorium jest serwowane, a nie
otwierane: musi działać `pnpm nx serve lab`, a adres to
`http://localhost:8779`. Jeśli biblioteka plansz jest pusta albo zapis się nie
udaje, brakuje drugiej połowy: uruchom obok `deno task store`.
```

And the same four places outside the section as in the English file:

- **`README.pl.md:28`** — `7. [Strona internetowa](#strona-internetowa)` becomes
  `7. [Laboratorium](#laboratorium)`.
- **`README.pl.md:8`** — "narzędzie wiersza poleceń i mała strona internetowa do
  sterowania nim" becomes "narzędzie wiersza poleceń i mała aplikacja do
  sterowania nim".
- **`README.pl.md:700`** — "takiej wartości nie sięgnie ani suwak na stronie,
  ani wypisane polecenie" becomes "ani suwak w laboratorium, ani wypisane
  polecenie".
- **`README.pl.md:971`**, the word list — "W kodzie i na angielskiej stronie
  nazywa się *piece*; polska strona mówi „element”" becomes "W kodzie i w
  tekście angielskim nazywa się *piece*; po polsku to „element”" (not "mówimy":
  the file addresses the reader in the second person throughout).

And the table rows:

```markdown
| `packages/cli/` | Narzędzie wiersza poleceń i magazyn plansz. |
| `apps/lab/` | Laboratorium: aplikacja w Reakcie serwowana przez Vite. |
```

- [ ] **Step 3: Run the README tests**

```sh
cd /Users/tomek/dev/arrowz/packages/cli && deno test --allow-read --allow-write --allow-env --allow-run --allow-net readme.test.ts
```

Expected: PASS. Those tests read the knob, rule, refusal and picture tables —
none of which this task touches — but they are what proves an edit did not
disturb an anchor (`<!-- unbundled -->` and its neighbours).

- [ ] **Step 4: Commit**

```sh
git add README.md README.pl.md
git commit -m "Describe one lab in both READMEs"
```

---

### Task 9: `CLAUDE.md` states the rules that are left

**Files:**
- Modify: `CLAUDE.md` (the Language section, and three bullets of the Packages
  section)

**Interfaces:**
- Consumes: every earlier task; this file states what the repository now is.
- Produces: nothing.

- [ ] **Step 1: Rewrite the four claims**

In the `## Language` section, the sentence naming the generator lab's page
becomes:

```markdown
- **User-facing tools ship bilingual UI (Polish and English).** The lab
  (`apps/lab`) has a language switch; every visible string, parameter label,
  help text and "inactive" reason lives in the dictionary
  (`packages/engine/lab-i18n.ts`), with English as the source language in code
  (`PARAM_SPEC`) and Polish as the translation.
```

In the `## Packages` section:

- the bullet stating the DOM rule ("The engine … knows neither Deno nor the
  DOM, and so do `command.ts`, …: the DOM lib is referenced only in
  `packages/cli/lab-page.ts`, and `neutral.test.ts` greps the rest") loses its
  exception:

```markdown
- The engine (`packages/engine/engine.ts`) knows neither Deno nor the DOM, and
  so do `command.ts`, `lab-simple.ts`, `lab-presets.ts`, `lab-i18n.ts`: no file
  in `packages/cli` reaches for the DOM either, and `neutral.test.ts` greps
  both rules. Never spread arrays proportional to the number of cells or
  pieces (`Math.min(...arr)`) — it overflows the worker stack in Chrome.
```

- the bullet about bundling the lab page and worker into `packages/cli/dist/`,
  `lab.sh` and `lab-bundle.test.ts` is **deleted**; in its place:

```markdown
- The lab is `apps/lab` (`pnpm nx serve lab`, port 8779) and keeps its boards
  in the store served by `deno task store` (port 8777). `worker-smoke.mjs`
  runs the worker `vite build` emits and checks its board against the engine's,
  so what the browser loads is gated, not merely compiled.
```

- the bullet listing what needs `pnpm install` loses the tasks that no longer
  exist:

```markdown
- `pnpm nx serve lab` and the rest of the Nx targets need
  `corepack enable pnpm && pnpm install` once. The Deno gates no longer do:
  the only file under `packages/` that imported the board element was the lab
  page, so `deno task check` and `deno task lint` pass with no `node_modules`
  at all (measured after the deletion by moving
  `packages/board-element/node_modules` aside).
```

- the bullet in the Packages section that spells out what the Deno gate runs —
  "`deno task verify` (check, lint, fmt, test, bundle)" — loses its last word:

```markdown
  (`@arrowz/engine`) and `packages/cli`: `deno task test` must pass after
  every change, and `deno task verify` (check, lint, fmt, test) before a PR.
```

- [ ] **Step 2: Read the file back against the repository**

```sh
cd /Users/tomek/dev/arrowz
grep -n "lab\.html\|lab-page\|lab-worker\|lab-bundle\|task bundle\|lab\.sh" CLAUDE.md
```

Expected: no hits.

- [ ] **Step 3: Commit**

```sh
git add CLAUDE.md
git commit -m "State the rules the repository has after the old lab"
```

---

### Task 10: The claims this PR makes false

Five comments promise PR 8 as the future, and three statements in the engine
describe the old lab as a living thing. After Task 5 each of them is simply
wrong, and a wrong comment is worse than none — it is read as current.

**Files:**
- Modify: `packages/engine/command.ts` (the `VIEW_RANGE` doc comment),
  `packages/engine/engine.ts` (the header), `packages/engine/geometry.ts`
  (the `DEFAULT_HEAD_HEIGHT` comment)
- Modify: `apps/lab/src/worker/parity.browser.test.ts`,
  `apps/lab/src/console/viewFields.test.ts`,
  `apps/lab/src/console/ViewPanel.browser.test.tsx`,
  `apps/lab/src/console/ViewPanel.tsx`

**Interfaces:**
- Consumes: Tasks 1, 2 and 5 — the deletions that made these sentences false.
- Produces: nothing later tasks use.

- [ ] **Step 1: The engine's three**

In `packages/engine/command.ts`, the `VIEW_RANGE` comment ends by naming a test
that no longer exists. Replace its last clause so that it names the guard that
does:

```ts
 * is the direction that matters for the mirror — every value the lab can
 * reach is a value the CLI takes — and the lab reads these bounds from this
 * table at the point of use (`viewFields.ts`), so the two cannot drift apart.
```

In `packages/engine/engine.ts`, the third line of the header names the page:

```ts
// This file is shared by the CLI (carve.ts) and the lab (apps/lab)
```

In `packages/engine/geometry.ts`, delete the parenthetical line of the
`DEFAULT_HEAD_HEIGHT` comment — `(packages/cli/lab.html repeats it as an input
value: HTML imports nothing.)` — because nothing repeats it any more.

- [ ] **Step 2: The lab's five**

`apps/lab/src/worker/parity.browser.test.ts`, the file header: it describes the
Deno test in the present tense and calls the build-output test a future
prerequisite. Both are now past:

```ts
// The counterpart of the build-output smoke (`scripts/worker-smoke.mjs`),
// which runs the worker `vite build` emits. This one proves the same protocol
// over the engine as Vitest transforms it, which is what the application's own
// tests run against; the smoke covers the artefact a browser loads.
```

`apps/lab/src/console/viewFields.test.ts`, inside the test named "the table
covers every number the view has":

```ts
  // Against `VIEW_RANGE`'s own keys and not a literal: this file guards the
  // bounds where they are read, and `VIEW_RANGE` is typed
```

`apps/lab/src/console/ViewPanel.browser.test.tsx`, inside "every number field
declares the bounds the engine actually takes":

```tsx
  // The only guard that the lab's number fields stay inside the engine's
  // table. It checks the rendered attributes rather than the `VIEW_FIELDS`
```

`apps/lab/src/console/ViewPanel.tsx`, the paragraph beginning "For PR 5:"
becomes a statement about what is, not what will be:

```tsx
 * The library's preview shows three of these fields (stroke, head width and
 * head height) through this same component, which is what keeps their bounds
 * measured against `VIEW_RANGE` in one place rather than two.
```

- [ ] **Step 3: Prove nothing still promises this PR as the future**

```sh
cd /Users/tomek/dev/arrowz
grep -rnE "PR 8|survive the deletion|a file PR|dies with lab\.html" apps/lab/src packages/engine --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v dist/
```

Expected: no hits — **and this is only true because Tasks 2 and 7 were told to
word their new comments without naming this PR.** If a hit appears in
`viewFields.test.ts` or `neutral.test.ts`, it is not a leftover: an earlier
task was executed with different wording than the plan gave, and the fix
belongs there, not here.

- [ ] **Step 4: Run both gates' fast halves and commit**

```sh
cd /Users/tomek/dev/arrowz && deno task check && pnpm nx test lab && pnpm nx test engine
git add packages/engine apps/lab/src
git commit -m "Correct the comments this retirement made false"
```

---

### Task 11: Comments stop pointing at a file that is gone

The user's decision: references to the old lab come out. **The rule is narrow
and must be followed literally — remove the pointer, keep the reason.** A
comment explaining *why* the code behaves as it does is the most valuable thing
this series produced; only the citation of a deleted file goes.

```
before: // Two clicks, as the old lab asks: the first arms, the second removes.
after:  // Two clicks: the first arms, the second removes.

before: // Parity with `selectSize` (`lab-page.ts:1085-1094`): a size keeps
after:  // A size keeps

before: // The old lab's own starting values (lab.html:223-262), not DEFAULT_VIEW's:
after:  // The lab's own starting values, not DEFAULT_VIEW's:
```

**Do not invent a citation to replace the one you remove.** In the middle
example, "Ruling 7" may be carried over only because the same file's header
already names it eleven lines up; if a reason is not already written in that
file, you do not have it and must not supply one from memory.

**The five exemptions.** In these places the pointer *is* the reason — the value
exists only because the retired page wrote it, and a sentence without that fact
records nothing. Here, and only here, keep the reference in the form **"the
previous lab"**, with no file name and no line number:

| Where | Why it is exempt |
|---|---|
| `state/ui.slice.ts`, `MODE_KEY = 'labView'` and its neighbours | the key exists because the retired page wrote it into people's browsers |
| `library/useViewSave.ts`, `SETTLE_MS = 350` | without the provenance, nothing explains why 350 |
| `console/ViewPanel.tsx`, "the order the old lab lists them" | there is no other source for that order |
| `stage/RunStatusBar.tsx`, the two-words divergence | it records a deliberate difference from the retired page |
| the test titles in `state/preferences.browser.test.ts`, `state/url.test.ts`, `state/view.slice.test.ts`, `state/ui.slice.test.ts`, `simple/applyRecipe.test.ts` | they name the artefacts users still have: keys and links the retired page produced |

These are the only hits the final grep may return, and it returns them as
"previous lab", never as `lab-page.ts` or `lab.html`.

If removing the pointer would leave a sentence that no longer says anything,
rewrite it to state the rule the code follows. **Never delete a sentence that
carries a reason.** When in doubt, keep the words and drop only the file name.

**Files:**
- Modify: 68 files under `apps/lab/src` (**129** references, measured on the
  branch tip) and these under `packages/`: `engine/lab-report.ts`,
  `engine/lab-report.test.ts`, `engine/lab-i18n.ts` (its first line only — the
  `noStoreServer` entries were Task 4's), `cli/store.ts`, `cli/store.test.ts`
- **Stylesheets, which the `.ts`/`.tsx` sweep does not reach**:
  `apps/lab/src/design/console.css` (five citations of `lab.html`, plus "the old
  lab's `body.solo .cols`" and "the old lab hides its lab-only controls") and
  `apps/lab/src/design/report.css` ("The gap the old lab drew")
- Also, because no other task owns them: `apps/lab/eslint.config.js` (the
  comment "Node belongs in the integration test that spawns the lab server, and
  nowhere else", which Task 1 made untrue by adding a second exemption and Task
  6 renamed the server of) and `apps/lab/vite.config.ts` (the comment "8777 is
  the lab server")
- **Names of the old world that the main pattern does not match**, and which
  are wrong in the present tense once Task 6 has run: "the Deno lab"
  (`state/url.ts`, `state/url.test.ts`, `worker/useGenerator.ts`,
  `worker/generate.worker.ts`), "the lab server" (`packages/cli/store.ts`,
  `packages/cli/store.test.ts`, `apps/lab/vite.proxy.ts`, and the failure
  message `'the lab server never answered'` in
  `apps/lab/src/api/boards.node.test.ts` — a string, so allowed under this
  task's rule), and "the lab page and the worker" (`packages/engine/types.ts`)
- **Do not touch** `docs/superpowers/**` (Ruling 10), and do not rename the
  engine's own modules: `lab-report.ts`, `lab-i18n.ts`, `lab-simple.ts` and
  `lab-presets.ts` are living files whose names have nothing to do with the
  page that was deleted.

**Interfaces:**
- Consumes: every earlier task.
- Produces: nothing. The rule for this diff is **no change of behaviour** —
  comments and test titles may change, logic may not. (Test titles are on
  executable lines but describe rather than compute; nine of them name the
  retired page. An earlier draft of this plan forbade touching any executable
  line, which made the sweep impossible to finish.) The proof is that the same
  tests pass, in the same number, before and after.

- [ ] **Step 1: List the work**

```sh
cd /Users/tomek/dev/arrowz
grep -rnE "lab-page|lab\.html|lab\.sh|lab-worker|old lab|Deno lab|lab server|lab page" apps/lab/src packages/engine packages/cli --include="*.ts" --include="*.tsx" --include="*.css" | grep -v node_modules | grep -v dist/
```

Note the three additions to the pattern and the `.css` include: the first
draft's pattern matched neither the stylesheets nor the phrases that name the
old world without naming its files. Work the list file by file, highest count
first: `App.tsx` (7), `ViewPanel.tsx` (6), `ui.slice.ts`, `applyRecipe.ts`,
`Workspace.browser.test.tsx`, `design/console.css`.

The comments Tasks 2, 3 and 7 wrote earlier in this PR do **not** appear here —
measured. They were worded for exactly that reason. If one of them does appear,
the earlier task was executed off-script and the fix belongs there, not here.

- [ ] **Step 2: Rewrite, file by file, committing in batches**

Commit every ten files or so, so that a reviewer can read the batches instead
of one 68-file diff:

```sh
git add <the files of this batch>
git commit -m "Drop pointers to the deleted lab page from <area> comments"
```

- [ ] **Step 3: Prove the sweep is complete and behaviour is untouched**

```sh
cd /Users/tomek/dev/arrowz
grep -rnE "lab-page|lab\.html|lab\.sh|lab-worker|old lab" apps/lab/src packages/engine packages/cli --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v dist/
git diff --stat <first commit of this task>~1
git diff -U0 <first commit of this task>~1 | grep -E "^[+-]" | grep -vE "^[+-]{3}" | grep -vE "^[+-]\s*(//|\*|/\*)" | head
```

Expected from the first: **only the five exemptions above**, each phrased as
"the previous lab", and nothing naming `lab-page.ts`, `lab.html`, `lab.sh` or
`lab-worker`. Anything else is unfinished work.

The third command is a **reading aid, not a gate**: it lists changed lines that
do not begin with a comment marker, which legitimately includes test titles and
the continuation lines of JSX `{/* */}` blocks (`stage/BoardFrame.tsx` has
one). Read what it prints and satisfy yourself that every line is a title or a
comment. The real proof that behaviour did not move is the count:

```sh
pnpm nx test lab && deno task test
```

Expected: the same number of passing tests as before this task — 468 in the
lab's 58 files, and the Deno suite whole. **A test that disappeared is a title
edit that ate its own `it(`.**

- [ ] **Step 4: Both gates**

```sh
cd /Users/tomek/dev/arrowz && deno task verify && pnpm nx run-many -t verify
```

---

## Both gates, then the PR

- [ ] **Run everything, from the repository root**

```sh
cd /Users/tomek/dev/arrowz
deno task verify
pnpm nx run-many -t verify
```

Expected: both green. The Deno gate no longer ends in a bundle; the Nx gate now
includes `lab:smoke`.

- [ ] **Open the lab by hand once**

Automated tests do not open a browser at the address a person types. Start
`deno task store` and `pnpm nx serve lab`, open `http://localhost:8779`,
generate a board, save it, and open the library. This is the check that the
proxy still reaches a store whose server was renamed underneath it.

- [ ] **Open the PR against `lab/board-detail`**

The description must say two things the diff does not. First, that **Task 11 is
not in the spec**: §10 row 8 covers everything else, but the 68-file comment
sweep is a decision taken during planning, and a reviewer is entitled to know
it was chosen rather than required. Second, that the sweep's commits are
**behaviour-free by construction** and can be read last, or skipped, without
losing the retirement itself.

---

## Rulings I made

1. **The smoke goes first, not last.** The moment `lab-bundle.test.ts` is
   deleted, nothing proves a bundler kept the engine whole. Task 1 therefore
   precedes every deletion, even though it is the only task that adds code.
2. **The smoke runs in Node, not a browser.** Measured: the built chunk touches
   only `self.*` and `performance.now()`, so a browser adds cost and no
   coverage. `parity.browser.test.ts` already covers the browser side.
3. **The chunk is found by prefix, with a count assertion.** A hash in the name
   leaves no stable path; matching more than one file must fail loudly rather
   than pick.
4. **The server is emptied before it is renamed, and renamed after the files
   are gone.** Each intermediate state is then coherent and green, and no
   commit contains both a rewrite and a rename of the same code.
5. **`LAB_CSP` becomes `API_CSP` rather than being deleted.** The remaining
   responses still need a policy; what changes is that it can be far stricter
   now that no response is a page.
6. **`store.sh` narrows its read permission to the store.** Serving nothing
   from the package directory means needing no read access to it. This is a
   security improvement smuggled into a rename, and it is stated here so a
   reviewer sees it as a decision rather than an accident.
7. **The deleted `carve.test.ts` case is not reimplemented anywhere.**
   `viewFields.ts` reads `VIEW_RANGE` at the point of use and
   `viewFields.test.ts` holds it against the table's keys — a stronger guard
   than parsing HTML. Task 2 records that in a comment so the next reader does
   not mistake the deletion for a loss.
8. **`neutral.test.ts` gets a second pattern set rather than a second file.**
   The rule it guards is the same rule; only the forbidden list differs,
   because `Deno.` is legitimate in the CLI.
9. **The Polish README keeps its own voice.** Task 8 does not translate the
   English text; it edits the Polish section in place, changing only what
   stopped being true.
10. **`docs/superpowers/` and `packages/engine/HISTORY.md` are left untouched.**
    Old plans, specs and the engineering log describe the repository as it was
    when they were written — `HISTORY.md` still says `sh prototype/lab.sh`,
    from before the monorepo — and rewriting history there would destroy the
    record that explains why things are as they are.
11. **A false comment is a defect, a stale pointer is a decision.** Task 10 is
    not optional tidying: `command.ts` states that `carve.test.ts` reads
    `lab.html`, and after Task 2 that is untrue. Task 11, by contrast, exists
    because the user chose it — the pointers were harmless, merely stale.
12. **Task 11 removes the pointer and keeps the reason.** Stated as a rule with
    three worked examples, because the failure mode of a 68-file comment sweep
    is a subagent deleting the sentence instead of the citation, and no test in
    this repository can catch that.
13. **Task 11 is last, and its diff must be comment-only.** A sweep this wide,
    mixed into the deletions, would make the PR unreviewable; separated, a
    reviewer reads the retirement first and the sweep as an appendix. Step 3
    proves mechanically that no executable line moved.
14. **The engine's `lab-*.ts` modules keep their names.** `lab-report.ts`,
    `lab-i18n.ts`, `lab-simple.ts` and `lab-presets.ts` are the living lab's
    own dependencies; only the deleted page's name comes out of comments.
15. **Five comments keep the reference, as "the previous lab"** (user's
    decision after review). Review measured that in those places the pointer is
    the reason: `MODE_KEY = 'labView'` exists because the retired page wrote
    that key into people's browsers, and `SETTLE_MS = 350` without provenance
    explains nothing. The citation goes; the fact stays.
16. **Test titles may change; logic may not** (user's decision after review).
    Nine titles name the retired page, and they are executable lines — the
    first draft's "comment-only diff" rule made the sweep unfinishable. The
    proof of no behavioural change is the count of passing tests, not a grep
    for `//`.
17. **New comments this PR writes are worded to survive its own sweeps.**
    Tasks 2, 3 and 7 originally wrote "PR 8" and "old lab" into files that
    Tasks 10 and 11 then grep for an empty result — three reviewers found the
    contradiction independently. The wording in those tasks is now load-bearing
    and must be copied exactly.
18. **"The grep prints nothing" is a fragile gate, and is used only where it
    can hold.** Task 5's sweep expects ~70 hits and asks the executor to
    classify them instead; what must be empty there is the set of hits on
    executable lines.
