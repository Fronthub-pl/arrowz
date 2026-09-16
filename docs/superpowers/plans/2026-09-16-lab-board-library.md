# The board library, part one: the workspace and the list — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the saved boards a tab that shows them — size chips, a list, refresh, and the chosen board drawn on the lab's own stage — without a second `<arrowz-board>`, and free `/boards/:size/:id` as a board's address by moving the store's files to `/store/`, closing spec §10 row 5a.

**Architecture:** `LabRoute` becomes `Workspace`: one panel mounted under `/` and `/boards` alike, hidden only under `/docs`, whose `.fw-lab` rows stay the preset strip, the one `Stage` and `Console`. `Console` gains a third face — size chips in the rail, the board list in the panel — while the run column stays mounted and hidden, so a carve in flight keeps its focus. The chosen board is the address, read with `useMatch`; a stored board lands in `result.preview`, beside and never instead of the run's `shown`, because a `ReportInput` cannot be built from a meta.

**Tech Stack:** React 19, react-router 8.3.1 (`useMatch`, `useNavigate`, `useLocation`), zustand 5.0.15, Vite 8, Vitest 5 with `@vitest/browser` 5 and `vitest-browser-react` 2.3 (node, node-integration and chromium projects), `@arrowz/engine` (`decodeBoard`, `BoardMeta`, `BoardSize`, `BoardFile`, `BoardData`), `@arrowz/engine/report` (`genSeconds`), `@arrowz/engine/i18n`, Deno 2.9 for `packages/cli`.

**Spec:** `docs/superpowers/specs/2026-09-13-lab-react-app-design.md` — §5.1 (the PR 5a amendment: the workspace, the console's third face, solo on both tabs), §5.3 (the preview as a second field), §5.6 (the store's own path and a board's address), §10 rows 5a and 5b, §12 (recipes, deferred).

**Previous plan:** `docs/superpowers/plans/2026-09-15-lab-report-export.md` (PR #68, merged).

**Branch:** `lab/board-library`, created from `main` at `23d005e`; the spec commit `2ff70ea` is already on it. The pull request's base is `main` — the stack is merged and there is nothing under this branch.

## Global Constraints

- **Everything written to a file is English** — code, identifiers, comments, tests, docs, branch names, commit messages. Only the conversation with the user is Polish.
- **No `any`, no non-null assertions.** ESLint enforces both in `apps/lab`; `deno lint` in `packages/`.
- **Both gates must pass before the PR:** `deno task verify` in the repository root and `pnpm nx run-many -t verify`.
- **Never import the engine's `.ts` sources from `apps/`.** After any edit under `packages/engine`, run `pnpm nx build engine` before running `apps/lab` tests by hand.
- **English is the source language in code**, Polish is the translation. Every new UI string goes into both `ui` tables in `packages/engine/lab-i18n.ts`; `lab-i18n.test.ts` checks that the key sets and value kinds match. **This plan adds no new string**: every word the library needs is already in the dictionary (`refresh`, `noStoreServer`, `storeEmpty`, `piecesShort`, `longestShort`, `genShort`, `notClosed`, `loadingBoard`, `boardFileError`, `savedBoard`, `tabLibrary`).
- **The engine and the dictionaries know neither Deno nor the DOM** (`neutral.test.ts`). Never spread an array proportional to cells or pieces into a call.
- **No attribution lines in commit messages.**
- **Do not delete or modify anything under `packages/cli/boards/`, any `dist/` by hand, or any `node_modules/`.**
- Commit after every task. Run `pnpm --dir apps/lab exec prettier --write <touched paths>` before each `apps/lab` commit and `deno fmt <touched paths>` before each `packages/` commit; both are gates.
- **The directory on disk keeps its name.** This plan moves an HTTP path, never `packages/cli/boards/` and never `ARROWZ_BOARDS_DIR`.

### Commands

| What | Command |
|---|---|
| Builds before any lab test | `pnpm nx build engine && pnpm nx build board-element` |
| Lab types | `pnpm --dir apps/lab run check` |
| Lab tests, one file | `pnpm --dir apps/lab exec vitest run src/<path>` |
| Lab tests, all | `pnpm nx test lab` |
| CLI/engine tests | `deno task test` |
| One Deno test file | `deno test -A packages/cli/lab-server.test.ts` |
| Both gates | `deno task verify` && `pnpm nx run-many -t verify` |

**Both builds, not just the engine.** `apps/lab`'s browser tests import the
board element, and `tsc` fails to resolve `@arrowz/board-element` until it is
built — measured by review round 1 on a fresh worktree, where the plan's
original one-build setup left `check` red before a line of it had been applied.

**A known flake on a cold install:** the first full `pnpm nx test lab` after
`pnpm install` has been seen to abort with `The iframe ".../src/run/triggers.browser.test.tsx" did not become ready within 60000ms`
— a file no task here touches. Re-run; it passes. Do not debug it.

### Harness facts, each measured

Carried from PR 3a, 3b, 4a and 4b. Every one of these broke a plan written from reasoning:

- **`render` and `renderHook` from `vitest-browser-react` are async.** `const screen = await render(<X />)`.
- **`toHaveTextContent` is exact equality**; substrings and regexes go through `toMatchTextContent(/…/)`.
- **Playwright locators are strict**: a name matching two elements throws. Use `{ exact: true }` where a name is a substring of another — in the whole app, `getByRole('tab', { name: /board/ })` matches both the `board` knob group and the *Saved boards* tab.
- **`getByRole` skips hidden elements** (`display: none`); pass `{ includeHidden: true }` when the point is the identity of a deliberately hidden node. This plan hides the run column in the library, and the case that proves it stays mounted needs this flag.
- **`expect.element(...).toBeEnabled()` and every `expect.element` retry to the timeout**: a momentary state read this way waits the state out. Read a momentary state once, synchronously, after asserting the condition that creates it.
- **`BrowserRouter` commits navigation inside `React.startTransition`** (react-router 8.3.1, and `App.tsx` passes no `useTransitions={false}`): the render that flips `hidden` and the panel's `id` arrives *after* the click handler. After a tab click, assert through `await expect.element(...)` or `await expect.poll(...)`, never a synchronous read.
- **Browser test files are isolated for the store and `location.hash`, but not for `localStorage`**; `vitest.setup.ts` clears storage per file. Cases *within* a file share everything: every file resets by hand (`mountApp` in `src/harness/mountApp.tsx` does it, address bar included).
- **`page.viewport(w, h)` resizes the test iframe and the size outlives the case that set it.** Every geometry case sets its own viewport first.
- **`locator.click()` waits for actionability**: clicking a disabled button stalls to the timeout instead of failing.
- **`locator.element()` returns `HTMLElement | SVGElement`**, and `querySelector('.x')` returns `Element`, which has no `style`: narrow with `querySelector<HTMLElement>(...)` or `instanceof`. `pnpm --dir apps/lab run check` catches this; `vitest run` does not.
- **`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and `noUnusedLocals` are on**, and ESLint's `no-unused-vars` is an error: an unused import in a test file fails `verify`.
- **React 19 has no global `JSX` namespace**: type a component's return as `ReactElement`.
- **A property reaching `<arrowz-board>` does not prove the board looks like that.** The element gates colour behind `enableColors` and can override options; assert what the element itself exposes as the effect (`shadowRoot.querySelector('button.colors')` and its `aria-pressed`), as `BoardFrame.browser.test.tsx` does.
- **A store write from outside a React event reaches the DOM on a microtask at the earliest.** Wrap it in `await act(async () => …)` before reading the DOM, or poll.

New in this plan, read from the source on 2026-09-16 (verify, do not trust):

- **`matchPath` and `useMatch` are exported by react-router 8.3.1** and work anywhere inside the router, not only inside `<Routes>` — they read the location and match a pattern. `useParams` does not: `Workspace` is `<Routes>`' sibling, so it must use `useMatch('/boards/:size/:id')`.
- **`decodeBoard(file: unknown): BoardData`** (`packages/engine/board-file.ts:333`) takes `unknown` and throws `BoardFileError`; the page never has to type the file to hand it over.
- **`listBoards()` has exactly one consumer today — its own test** (`apps/lab/src/api/boards.node.test.ts`), so changing its return type costs one file.
- **`RunColumn`'s root is `<section className="fw-run-col">`** (`RunColumn.tsx:149`), a direct grid item of `.fw-console`, so `.fw-console.library > .fw-run-col` addresses it.
- **The old lab's list row shows the whole id** and lets CSS clip it (`lab.html:117-119`, `.boardrow .id`, with the comment "A layout id is 71 characters").

---

## Rulings I made

Decisions this plan takes that the spec left open or states differently. An executor must not relitigate them; a reviewer should attack them.

**Ruling 1 — the run column stays mounted in the library, hidden by a class; the detail goes in the panel, not in the third track.** Spec §5.1's PR 5a amendment maps the library onto the console's three tracks with the detail in the run column's track. Handing the third position a different child *replaces* `RunColumn`, and a remount is exactly what PR 4a's Ruling 7 forbids there: the column holds a keyboard focus on Generate and its own transition ref, and a carve started in the lab can still be running when the user opens the library. The old lab hides its lab-only controls by class rather than removing them (`lab.html`: `body.tab-library .labonly { display: none }`). So `children` stays the third child in all three faces, the library takes the rail and the panel, and `.fw-console.library` drops to two tracks — a hidden grid item takes no track. PR 5b's detail therefore lives under the list in the panel. Task 9 amends §5.1.

**Ruling 2 — `listBoards` answers with an outcome, not with a list.** Parity needs two different sentences: `noStoreServer` ("run sh packages/cli/lab.sh") when the store cannot be reached, and `storeEmpty` ("generate a board…") when it answers with nothing. Today's `listBoards` returns `[]` for both, so the library could not tell them apart — the old lab can, because it catches the fetch itself (`lab-page.ts:1070-1073`). It becomes `Promise<ListOutcome>` with `{ ok: true; sizes }` and `{ ok: false; error }`, matching `saveBoard`'s shape, which already answers this way. One consumer exists (its own test), so the change costs one file.

**Ruling 3 — a stored board is drawn under its own stored view, not under the lab's.** `showLibBoard` draws with `libView(meta)`, whose fields start from `meta.view` (`lab-page.ts:1152-1156`, `:1225-1235`), and with `voids` set from `meta.ok === false` — the holes of a board that did not close. In PR 5a there are no editable library fields yet, so the preview uses `boardViewOf(meta.view, meta.ok === false)` directly. It must not read the `view` slice: that is the lab's board's view, and a stored board carries its own. `top` is 0 in a stored view already ("stored boards carry no highlight").

**Ruling 4 — the late-answer guard is the effect's, not the slice's.** PR 4b put identity guards inside the result slice because the answers (`stored`, `exported`) arrive for a board the slice alone knows. Here the selection *is* the address, so the fetch's own effect knows it: `useStoredBoard` captures `size` and `id`, and its cleanup sets a `cancelled` flag that the resolution checks, the standard effect pattern. A second guard in the slice would be a second source of truth for the same question.

**Ruling 5 — the library route renders `null`, and `SavedBoardsRoute` is deleted.** `AppRoutes` gets `/boards` and `/boards/:size/:id` as `element={null}`, exactly as `/` already is, because the panel is `Workspace`'s and `Workspace` is `<Routes>`' sibling (Ruling 5 of PR 2: a route change must not unmount the element). The wildcard would otherwise redirect a board's address to the lab.

**Ruling 6 — the preset strip, the violations and the clamp notice become `null` in the library, and are not removed.** PR 4a's rule: React keeps a node by type and position among its siblings, so a sibling that disappears from the list shifts `Stage` and remounts `<arrowz-board>`. Each keeps its slot with `{tab === 'lab' ? <X /> : null}`.

**Ruling 7 — a size chip navigates to the first board of that size, and the list is fetched once per visit unless refreshed.** Both are the old lab's behaviour: `selectSize` opens the first board of a size unless the board already shown belongs to it (`lab-page.ts:1085-1094`), and `loadLibrary` uses `boardsCache` unless `force` (`:1062-1080`). The cache lives in `library.slice`, so leaving and re-entering the tab does not re-fetch.

**Ruling 8 — the status line speaks for the preview while the library is the route.** `RunStatusBar` reads `result.preview` first: a stored board's line is `savedBoard(id, seed, source, gen)`, the old lab's `showBoardStatus` (`lab-page.ts:1126-1136`), and the store's answer (`saved`, a fact about `shown`) is never appended to it. A board that cannot be read shows `boardFileError` and the stage is left empty, as `refuse` does (`:1159-1165`).

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `apps/lab/src/state/library.slice.ts` | Sizes, the list cache, the two failure kinds. No selection: the address is the selection. |
| `apps/lab/src/state/library.slice.test.ts` | Unit cases for the slice's transitions. |
| `apps/lab/src/state/library.fixtures.ts` | A `BoardMeta` and a `BoardSize` built from a real carve, for tests that need a stored board. |
| `apps/lab/src/library/SizeChips.tsx` | The console's rail in the library face: one chip per size, with its board count. |
| `apps/lab/src/library/BoardList.tsx` | The console's panel in the library face: the rows, the refresh button, the two empty states. |
| `apps/lab/src/library/useOpenBoard.ts` | Which board the address names, read with `useMatch` (the workspace is outside `<Routes>`). |
| `apps/lab/src/library/useLibraryList.ts` | Fetches the list on entering the tab and on refresh. |
| `apps/lab/src/library/useStoredBoard.ts` | The board the address names: fetch, decode, show or fail. |
| `apps/lab/src/library/LibraryPanel.browser.test.tsx` | Chips, rows, empty states, and what a click navigates to. |
| `apps/lab/src/library/useStoredBoard.browser.test.tsx` | The preview, the failure, and the late answer. |
| `apps/lab/src/design/library.css` | The library's own surface, in its own file, as `console.css` is. |

**Modified**

| File | Change |
|---|---|
| `packages/cli/lab-server.ts` | The static area `/boards/` becomes `/store/`; the file header says so. |
| `packages/cli/lab-server.test.ts` | Six fetches of stored files move to `/store/`. |
| `packages/cli/lab-page.ts` | The old lab reads its stored board file from `/store/`. |
| `apps/lab/vite.proxy.ts` | The proxy key `/boards/` becomes `/store/`; the comment records why the collision is gone. |
| `apps/lab/src/api/boards.ts` | `listBoards` answers with an outcome (Ruling 2); `readStoredBoard` is added. |
| `apps/lab/src/api/boards.node.test.ts` | The outcome, the new reader, and the moved path. |
| `apps/lab/src/state/result.slice.ts` | `preview: StoredBoard \| null`, `showPreview`, `clearPreview`; `reset` clears both. |
| `apps/lab/src/state/result.slice.test.ts` | The preview leaves `shown` alone, and the other way round. |
| `apps/lab/src/state/store.ts` | The `library` slice joins the store. |
| `apps/lab/src/routes/LabRoute.tsx` → `apps/lab/src/routes/Workspace.tsx` | Renamed; takes `tab`, renames its panel, and swaps the faces (Rulings 1, 6). |
| `apps/lab/src/routes/LabRoute.browser.test.tsx` → `apps/lab/src/routes/Workspace.browser.test.tsx` | Renamed with it. |
| `apps/lab/src/routes/SavedBoardsRoute.tsx` | Deleted (Ruling 5). |
| `apps/lab/src/AppRoutes.tsx` | `/boards` and `/boards/:size/:id` render `null`. |
| `apps/lab/src/AppRoutes.browser.test.tsx` | The library panel is no longer a route's; the cases follow. |
| `apps/lab/src/App.tsx` | `onWorkspace` instead of `onLab`; solo on both tabs; the tab handed down. |
| `apps/lab/src/console/Console.tsx` | A `face` prop and the library's two tracks. |
| `apps/lab/src/design/console.css` | `.fw-console.library`: two tracks, the run column hidden. |
| `apps/lab/src/stage/BoardFrame.tsx` | Draws `preview` when there is one, under its own stored view (Ruling 3). |
| `apps/lab/src/stage/RunStatusBar.tsx` | Speaks for the preview while there is one (Ruling 8). |
| `apps/lab/src/report/ReportPanel.tsx` | Empty while a preview is on screen. |
| `docs/superpowers/specs/2026-09-13-lab-react-app-design.md` | §5.1 amended for Ruling 1. |

---

## Task 1: The store's HTTP path becomes `/store/`

**Files:**
- Modify: `packages/cli/lab-server.ts` (the file header comment; the static area, `:308-309`)
- Modify: `packages/cli/lab-server.test.ts` (`:49`, `:64`, `:190`, `:224`, `:251`, `:329`)
- Modify: `packages/cli/lab-page.ts` (`:1168`)
- Modify: `apps/lab/vite.proxy.ts`
- Modify: `apps/lab/src/api/boards.node.test.ts` (the proxy-reach case and the route case)

**Interfaces:**
- Consumes: nothing.
- Produces: stored files are served under `/store/<W>x<H>/<id>.board.json`; `labProxy()` returns `{ '/api/': …, '/store/': … }`. Task 2's reader and Task 8's preview depend on both.

- [ ] **Step 1: Make the server's tests state the new path**

In `packages/cli/lab-server.test.ts` replace every `/boards/` that names a *file* — not `/api/boards` — with `/store/`:

```ts
const file = await fetch(`${base}/store/25x50/${meta.id}.board.json`)
```
```ts
const svg = await fetch(`${base}/store/10x10/${meta.id}.svg`)
```
```ts
const stored = await (await fetch(`${base}/store/10x10/${meta.id}.board.json`)).json()
```
```ts
const escape = await fetch(base + '/store/..%2F..%2Fengine.ts')
```
```ts
const gone = await fetch(`${base}/store/10x10/${meta.id}.board.json`)
```
```ts
const svg = await fetch(`${base}/store/10x10/${meta.id}.svg`)
```

Leave every `/api/boards…` exactly as it is: the API did not move.

- [ ] **Step 2: Run the server tests to verify they fail**

Run: `deno test -A packages/cli/lab-server.test.ts`
Expected: FAIL, measured as `9 passed | 5 failed` — the stored-file fetches answer 404 (the area is still `/boards/`) and the escape case gets 404 instead of 403. Five, not six: `:251` asserts a board is *gone* after a DELETE, and a missing file answers 404 under either path, so that line cannot tell the move happened. It moves with the others for consistency, not for evidence.

- [ ] **Step 3: Move the area in the server**

In `packages/cli/lab-server.ts`, the static area:

```ts
        : rel.startsWith('/store/')
        ? { base: boardsDir(), name: rel.slice('/store/'.length), csp: STORE_CSP }
        : null
```

And the file header, which names the paths it serves:

```ts
// Lab server: static files from packages/cli/ without caching (a rebuilt bundle
// must reach the browser immediately) plus the board store under /api/boards
// (GET list, POST save a board file, DELETE one) and the stored files under
// /store/. The files answer to /store/ and not to /boards/ because /boards is
// the lab application's library route and /boards/<size>/<id> is a board's own
// address there (spec §5.6); the directory on disk is unchanged. Run: deno task
// lab (lab.sh scopes the permissions: net on 127.0.0.1, read of packages/cli/
// and the store, write of the store, one env var).
```

- [ ] **Step 4: Run the server tests to verify they pass**

Run: `deno test -A packages/cli/lab-server.test.ts`
Expected: PASS.

- [ ] **Step 5: Point the old lab at the new path**

In `packages/cli/lab-page.ts`, inside `openBoard`:

```ts
    const r = await fetch(`/store/${meta.W}x${meta.H}/${meta.id}.board.json`)
```

- [ ] **Step 6: Move the proxy key**

Replace `apps/lab/vite.proxy.ts`'s exported function and the paragraph above it:

```ts
/**
 * The board store's two paths, proxied to the Deno lab server.
 *
 * A target and nothing else. `changeOrigin` would rewrite `Host` to the
 * target's, and the server derives its own origin from `Host` before
 * comparing it with the request's `Origin` (`lab-server.ts:73-83`, the
 * comparison itself on line 77) — so setting it is what would earn the 403
 * that spec §9.1 predicts, and a `proxyReq` hook rewriting `Origin` would
 * then be needed to undo the damage. Forwarding the browser's own `Host`
 * keeps the pair consistent by construction, and `localhost` is in the
 * server's LOCAL_HOSTS. Measured against Vite 8.2.2; `boards.node.test.ts`
 * holds the line.
 *
 * Both keys end in a slash, because Vite matches string keys by prefix. The
 * stored files answer to `/store/` rather than `/boards/`: `/boards` is this
 * application's library route and `/boards/<size>/<id>` is a board's own
 * address (spec §5.6), so no proxy key may begin with it.
 */
export function labProxy(target: string = LAB_SERVER): Record<string, ProxyOptions> {
  return { '/api/': { target }, '/store/': { target } }
}
```

- [ ] **Step 7: Make the integration test state the new path**

In `apps/lab/src/api/boards.node.test.ts` replace the two cases that name the path:

```ts
// The library reads stored files from /store/ (spec §5.6), so the proxy covers
// that path and not /boards/.
test('the stored board file is reachable through the proxy', async () => {
  const sizes = (await (await fetch(`${VITE_ORIGIN}/api/boards`)).json()) as { boards: { id: string }[] }[]
  const id = sizes[0]?.boards[0]?.id
  const r = await fetch(`${VITE_ORIGIN}/store/12x12/${id}.board.json`)
  expect(r.status).toBe(200)
  await r.body?.cancel()
})

// /boards is the application's own route, all the way down: a board's address
// is /boards/<size>/<id>, and the store must not answer it. No proxy key
// begins with /boards, so both the tab and a board's address reach the SPA.
test('the library route and a board address are not proxied', async () => {
  for (const path of ['/boards', '/boards/12x12/sha256-0']) {
    const r = await fetch(VITE_ORIGIN + path)
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toMatch(/text\/html/)
    await r.body?.cancel()
  }
})
```

- [ ] **Step 8: Run the integration test**

Run: `pnpm --dir apps/lab exec vitest run src/api/boards.node.test.ts`
Expected: PASS (all cases).

- [ ] **Step 9: Run both gates' fast halves**

Run: `deno task test` and `pnpm nx test lab`
Expected: PASS. `lab-bundle.test.ts` rebuilds the old lab's bundle; the fetch path changed inside it, no id did.

- [ ] **Step 10: Commit**

```bash
deno fmt packages/cli/lab-server.ts packages/cli/lab-server.test.ts packages/cli/lab-page.ts
pnpm --dir apps/lab exec prettier --write vite.proxy.ts src/api/boards.node.test.ts
git add packages/cli/lab-server.ts packages/cli/lab-server.test.ts packages/cli/lab-page.ts apps/lab/vite.proxy.ts apps/lab/src/api/boards.node.test.ts
git commit -m "Serve stored board files from /store/, so /boards can be a board's address"
```

---

## Task 2: The store client answers with an outcome, and reads a board file

**Files:**
- Modify: `apps/lab/src/api/boards.ts`
- Modify: `apps/lab/src/api/boards.node.test.ts`

**Interfaces:**
- Consumes: Task 1's `/store/` path.
- Produces:
  - `type ListOutcome = { ok: true; sizes: BoardSize[] } | { ok: false; error: string }`
  - `listBoards(): Promise<ListOutcome>`
  - `type FileOutcome = { ok: true; file: unknown } | { ok: false; error: string }`
  - `readStoredBoard(size: string, id: string): Promise<FileOutcome>`

  Task 3's slice stores the first; Task 8's hook consumes both.

- [ ] **Step 1: Write the failing tests**

In `apps/lab/src/api/boards.node.test.ts`, replace the unreachable-store case and add two more (the `DEAD_ORIGIN` constant above it stays):

```ts
// The store is optional, so an unreachable one must resolve rather than
// reject — but the library has two different sentences for the two failures
// ("no store server" and "the store is empty"), so the outcome has to say
// which happened (Ruling 2). `listBoards` fetches a relative path, which Node
// cannot resolve on its own, so the stub supplies only the origin and forwards
// the call: the rejection under test is a real ECONNREFUSED from a real socket.
test('listBoards reports failure when the store is unreachable', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (...args: Parameters<typeof fetch>) => original(new URL(String(args[0]), DEAD_ORIGIN), args[1])
  try {
    const outcome = await listBoards()
    expect(outcome.ok).toBe(false)
  } finally {
    globalThis.fetch = original
  }
})

test('listBoards answers with the sizes when the store is up', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (...args: Parameters<typeof fetch>) => original(new URL(String(args[0]), VITE_ORIGIN), args[1])
  try {
    const outcome = await listBoards()
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.sizes[0]?.size).toBe('12x12')
  } finally {
    globalThis.fetch = original
  }
})

// What the preview reads. The file is handed on as `unknown`: `decodeBoard`
// takes `unknown` and is the only thing that may decide the shape is a board.
test('readStoredBoard fetches a stored file, and reports a missing one', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (...args: Parameters<typeof fetch>) => original(new URL(String(args[0]), VITE_ORIGIN), args[1])
  try {
    const list = await listBoards()
    const id = list.ok ? list.sizes[0]?.boards[0]?.id : undefined
    if (id === undefined) throw new Error('the store has no board to read')
    const found = await readStoredBoard('12x12', id)
    expect(found.ok).toBe(true)

    const missing = await readStoredBoard('12x12', 'sha256-0')
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error).toContain('404')
  } finally {
    globalThis.fetch = original
  }
})
```

Update the import at the head of the file:

```ts
import { listBoards, readStoredBoard } from './boards'
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir apps/lab exec vitest run src/api/boards.node.test.ts`
Expected: FAIL — `readStoredBoard` is not exported, and `outcome.ok` is undefined on an array.

- [ ] **Step 3: Write the implementation**

Replace the two exports in `apps/lab/src/api/boards.ts` (the `SaveOutcome` type and `saveBoard` stay as they are):

```ts
export type SaveOutcome = { ok: true; meta: BoardMeta } | { ok: false; error: string }

/** The listing, or why it could not be had — the library says different things about the two. */
export type ListOutcome = { ok: true; sizes: BoardSize[] } | { ok: false; error: string }

/** A stored board file as the store holds it, undecoded. */
export type FileOutcome = { ok: true; file: unknown } | { ok: false; error: string }

/**
 * The store is optional: the lab runs from any static host, and a missing
 * server must cost the run nothing. Every call therefore reports failure as a
 * value. A rejected `fetch` and an answer that is not OK are treated alike —
 * a store that refuses the connection and a store that returns 500 are the
 * same thing to a caller with a list to render.
 *
 * The listing says which failure happened, because the library has two
 * sentences for them: "no store server" for an unreachable store and "the
 * store is empty" for a store that answers with nothing (Ruling 2). An empty
 * list is a success.
 */
export async function listBoards(): Promise<ListOutcome> {
  try {
    const response = await fetch('/api/boards')
    if (!response.ok) return { ok: false, error: `the store answered ${response.status}` }
    return { ok: true, sizes: (await response.json()) as BoardSize[] }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * One stored board file, by its size folder and its layout hash. The file is
 * returned as `unknown`: `decodeBoard` takes `unknown` and is the only thing
 * entitled to decide the shape is a board, exactly as the old lab hands over
 * what it fetched (`lab-page.ts:1166-1183`).
 */
export async function readStoredBoard(size: string, id: string): Promise<FileOutcome> {
  try {
    const response = await fetch(`/store/${size}/${id}.board.json`)
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` }
    return { ok: true, file: await response.json() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --dir apps/lab exec vitest run src/api/boards.node.test.ts` then `pnpm --dir apps/lab run check`
Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
pnpm --dir apps/lab exec prettier --write src/api/boards.ts src/api/boards.node.test.ts
git add apps/lab/src/api/boards.ts apps/lab/src/api/boards.node.test.ts
git commit -m "Let the store client say which failure it met, and read one stored board"
```

---

## Task 3: The library slice, and its fixtures

**Files:**
- Create: `apps/lab/src/state/library.slice.ts`
- Create: `apps/lab/src/state/library.slice.test.ts`
- Create: `apps/lab/src/state/library.fixtures.ts`
- Modify: `apps/lab/src/state/store.ts`

**Interfaces:**
- Consumes: Task 2's `ListOutcome`.
- Produces:
  - `LibraryState` with `sizes: BoardSize[] | null`, `loading: boolean`, `listError: string | null`, `boardError: string | null`, and `listing()`, `listed(sizes)`, `listFailed(error)`, `boardFailed(error)`, `reset()`.
  - `useStore().library`.
  - `storedFixture(seed, W, H): { meta: BoardMeta; file: unknown; sizes: BoardSize[] }` for later tasks' tests.

- [ ] **Step 1: Write the failing slice test**

Create `apps/lab/src/state/library.slice.test.ts`:

```ts
import { expect, test } from 'vitest'
import { sizesFixture } from './library.fixtures'
import { useStore } from './store'

function reset() {
  useStore.getState().library.reset()
}

test('a listing replaces the sizes and clears the failure', () => {
  reset()
  const library = () => useStore.getState().library
  expect(library().sizes).toBeNull()

  library().listing()
  expect(library().loading).toBe(true)

  library().listed(sizesFixture())
  expect(library().loading).toBe(false)
  expect(library().sizes?.[0]?.size).toBe('8x8')
  expect(library().listError).toBeNull()
})

// The old lab keeps its list until a refresh succeeds; a failed refresh that
// blanked the list would take the rows away from under the board on screen.
test('a failed listing keeps the sizes it already had', () => {
  reset()
  const library = () => useStore.getState().library
  library().listed(sizesFixture())
  library().listFailed('no store server')
  expect(library().listError).toBe('no store server')
  expect(library().sizes?.[0]?.size).toBe('8x8')
  expect(library().loading).toBe(false)
})

// Two failures, two sentences: one is about the store, the other about one
// board's file, and neither may overwrite the other.
test('a board failure and a list failure are separate', () => {
  reset()
  const library = () => useStore.getState().library
  library().boardFailed('Board 8x8/sha256-0 cannot be read: HTTP 404')
  expect(library().boardError).toContain('404')
  expect(library().listError).toBeNull()
  library().boardFailed(null)
  expect(library().boardError).toBeNull()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --dir apps/lab exec vitest run src/state/library.slice.test.ts`
Expected: FAIL — `library.fixtures` and `state.library` do not exist.

- [ ] **Step 3: Write the fixtures**

Create `apps/lab/src/state/library.fixtures.ts`:

```ts
import { type BoardMeta, type BoardSize, defaultParams, encodeBoard, generate } from '@arrowz/engine'
import { DEFAULT_VIEW } from '@arrowz/engine/command'

/**
 * A stored board as the store would hold it: a real carve, its file, and a meta
 * with the fields the list row and the status line read. Hand-built rather than
 * fetched, because these tests must not need a server — `boards.node.test.ts`
 * is where a real store is exercised.
 *
 * The id is a plausible layout hash for a one- or two-digit seed: `sha256-`
 * and 64 hex digits, 71 characters in all, so a row that clips it is being
 * clipped for the real reason. A seed of 100 or more would overrun that,
 * and every caller here passes a small one.
 */
export function storedFixture(seed: number, W = 8, H = 8): { meta: BoardMeta; file: unknown } {
  const params = { ...defaultParams(), W, H, seed }
  const result = generate(params)
  const file = encodeBoard(result.board)
  const id = `sha256-${String(seed).padStart(2, '0').repeat(32)}`
  return {
    meta: {
      id,
      W,
      H,
      seed,
      params,
      view: { ...DEFAULT_VIEW, top: 0 },
      command: `deno task carve --width=${W} --height=${H} --seed=${seed}`,
      source: 'lab',
      createdAt: '2026-09-16T10:00:00.000Z',
      updatedAt: '2026-09-16T10:00:00.000Z',
      ok: result.ok,
      pieces: result.board.pieces.length,
      maxLen: result.metrics?.maxLen ?? null,
      genMs: result.genMs,
      fingerprint: null,
      boardBytes: null,
      svg: false,
      restarts: result.restartsUsed,
      backtracks: result.backtracks,
      aborted: false,
      stuck: result.stuck,
      sources: [],
    },
    file,
  }
}

/** One size holding two boards, newest first, as the store lists them. */
export function sizesFixture(): BoardSize[] {
  const first = storedFixture(1)
  const second = storedFixture(2)
  return [{ size: '8x8', W: 8, H: 8, cells: 64, boards: [second.meta, first.meta] }]
}
```

- [ ] **Step 4: Write the slice**

Create `apps/lab/src/state/library.slice.ts`:

```ts
import type { BoardSize } from '@arrowz/engine'

/**
 * What the saved-boards tab knows: the sizes the store listed, and why a fetch
 * failed. There is no selection here — the chosen board is the address
 * (`/boards/:size/:id`, spec §5.6), and a second copy of it would be a second
 * thing to keep in step with the URL.
 *
 * The cache is the old lab's `boardsCache` (`lab-page.ts:826`): entering the
 * tab uses what is there, and only Refresh, a save or a delete forces a new
 * listing.
 */
export interface LibraryState {
  /** null until the first listing answers; an empty array is "the store is empty". */
  sizes: BoardSize[] | null
  loading: boolean
  /** Why the listing failed. The list already shown is kept beside it. */
  listError: string | null
  /** Why the board the address names could not be drawn. */
  boardError: string | null
  listing(): void
  listed(sizes: BoardSize[]): void
  listFailed(error: string): void
  boardFailed(error: string | null): void
  reset(): void
}

type SetStore = (fn: (state: { library: LibraryState }) => { library: LibraryState }) => void

export function createLibrarySlice(set: SetStore): LibraryState {
  const patch = (next: Partial<LibraryState>) => set((state) => ({ library: { ...state.library, ...next } }))
  return {
    sizes: null,
    loading: false,
    listError: null,
    boardError: null,
    listing: () => patch({ loading: true }),
    listed: (sizes) => patch({ sizes, loading: false, listError: null }),
    // The sizes are left where they are: a refresh that fails must not take
    // the rows away from under the board on screen.
    listFailed: (listError) => patch({ loading: false, listError }),
    boardFailed: (boardError) => patch({ boardError }),
    reset: () => patch({ sizes: null, loading: false, listError: null, boardError: null }),
  }
}
```

- [ ] **Step 5: Add the slice to the store**

In `apps/lab/src/state/store.ts`, add the import, the field and the creation:

```ts
import { createLibrarySlice, type LibraryState } from './library.slice'
```

```ts
export interface Store {
  run: RunState
  result: ResultState
  library: LibraryState
  params: ParamsState
```

```ts
export const useStore = create<Store>()((set) => ({
  run: createRunSlice(set),
  result: createResultSlice(set),
  library: createLibrarySlice(set),
  params: createParamsSlice(set),
```

Update the interface's own comment, which says PR 5 adds this slice:

```ts
/**
 * One store, one named field per slice, so a per-knob selector reaches exactly
 * its own entry. PR 4b added `result` and the one action that spans two slices;
 * PR 5a adds `library`.
 */
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --dir apps/lab exec vitest run src/state/library.slice.test.ts` then `pnpm --dir apps/lab run check`
Expected: PASS both.

- [ ] **Step 7: Commit**

```bash
pnpm --dir apps/lab exec prettier --write src/state/library.slice.ts src/state/library.slice.test.ts src/state/library.fixtures.ts src/state/store.ts
git add apps/lab/src/state/library.slice.ts apps/lab/src/state/library.slice.test.ts apps/lab/src/state/library.fixtures.ts apps/lab/src/state/store.ts
git commit -m "Hold the store's listing in a slice of its own, with the two failures apart"
```

---

## Task 4: The preview sits beside the run's result

**Files:**
- Modify: `apps/lab/src/state/result.slice.ts`
- Modify: `apps/lab/src/state/result.slice.test.ts`

**Interfaces:**
- Consumes: `BoardMeta` from the engine.
- Produces:
  - `interface StoredBoard { readonly board: BoardData; readonly file: unknown; readonly meta: BoardMeta }`
  - `ResultState.preview: StoredBoard | null`, `showPreview(next: StoredBoard): void`, `clearPreview(): void`
  - `reset()` clears the preview too.

  Task 8's stage and status bar read `preview`; Task 8's hook writes it.

- [ ] **Step 1: Write the failing test**

Append to `apps/lab/src/state/result.slice.test.ts`:

```ts
// Spec §5.3: the stored board is a second field, not a second source. A meta
// cannot fill a ReportInput, and the run's own product must survive a trip to
// the library — that is what makes coming back free.
test('a preview leaves the run result, its answer and its baseline alone', () => {
  const state = useStore.getState()
  state.result.reset()
  finish(finishedRun(1))
  const shownBefore = useStore.getState().result.shown
  const { meta, file } = storedFixture(3)

  useStore.getState().result.showPreview({ board: decodeBoard(file), file, meta })

  const after = useStore.getState().result
  expect(after.preview?.meta.id).toBe(meta.id)
  expect(after.shown).toBe(shownBefore)
})

test('clearing the preview leaves the run result where it was', () => {
  const state = useStore.getState()
  state.result.reset()
  finish(finishedRun(1))
  const { meta, file } = storedFixture(3)
  useStore.getState().result.showPreview({ board: decodeBoard(file), file, meta })

  useStore.getState().result.clearPreview()

  expect(useStore.getState().result.preview).toBeNull()
  expect(useStore.getState().result.shown).not.toBeNull()
})

// A finished run must not silently take a preview's place on the stage: the
// stage picks by route, and the two fields are independent.
test('a finished run does not clear a preview', () => {
  const state = useStore.getState()
  state.result.reset()
  const { meta, file } = storedFixture(3)
  state.result.showPreview({ board: decodeBoard(file), file, meta })
  finish(finishedRun(2))
  expect(useStore.getState().result.preview?.meta.id).toBe(meta.id)
})

test('reset clears both the result and the preview', () => {
  const state = useStore.getState()
  const { meta, file } = storedFixture(3)
  state.result.showPreview({ board: decodeBoard(file), file, meta })
  finish(finishedRun(1))
  useStore.getState().result.reset()
  expect(useStore.getState().result.shown).toBeNull()
  expect(useStore.getState().result.preview).toBeNull()
})
```

Add to that file's imports (the existing ones stay):

```ts
import { decodeBoard } from '@arrowz/engine'
import { storedFixture } from './library.fixtures'
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --dir apps/lab exec vitest run src/state/result.slice.test.ts`
Expected: FAIL — `showPreview` is not a function.

- [ ] **Step 3: Write the implementation**

In `apps/lab/src/state/result.slice.ts`, add the type above `ResultState`:

```ts
/**
 * A board read out of the store: what it is, the file it came as, and the meta
 * the store holds beside it. Deliberately not a `ShownResult`: a stored board
 * has no `stats: CarverStats` and none of the run's counters, so a
 * `ReportInput` could only be invented for it (spec §5.3).
 */
export interface StoredBoard {
  readonly board: BoardData
  readonly file: unknown
  readonly meta: BoardMeta
}
```

Add the field and the two actions to `ResultState`:

```ts
  /** The board the library shows, beside the run's own and never instead of it. */
  preview: StoredBoard | null
```

```ts
  /** The library draws a stored board. The run's result is untouched. */
  showPreview(next: StoredBoard): void
  /** Leaving the library, or a board that could not be read. */
  clearPreview(): void
```

And in `createResultSlice`:

```ts
    preview: null,
```
```ts
    showPreview: (preview) => set((state) => ({ result: { ...state.result, preview } })),
    clearPreview: () =>
      set((state) => (state.result.preview === null ? state : { result: { ...state.result, preview: null } })),
```

Extend `reset` to clear it:

```ts
    reset: () =>
      set((state) => ({
        result: { ...state.result, shown: null, preview: null, baseline: null, saved: null, exportError: null },
      })),
```

Add `BoardMeta` to the file's type imports:

```ts
import type { BoardData, BoardFile, BoardMeta, Params } from '@arrowz/engine'
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --dir apps/lab exec vitest run src/state/result.slice.test.ts` then `pnpm --dir apps/lab run check`
Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
pnpm --dir apps/lab exec prettier --write src/state/result.slice.ts src/state/result.slice.test.ts
git add apps/lab/src/state/result.slice.ts apps/lab/src/state/result.slice.test.ts
git commit -m "Keep a stored board beside the run's result, where it cannot pretend to a report"
```

---

## Task 5: `Workspace` — one panel, two identities

**Files:**
- Rename: `apps/lab/src/routes/LabRoute.tsx` → `apps/lab/src/routes/Workspace.tsx`
- Rename: `apps/lab/src/routes/LabRoute.browser.test.tsx` → `apps/lab/src/routes/Workspace.browser.test.tsx`
- Delete: `apps/lab/src/routes/SavedBoardsRoute.tsx`
- Modify: `apps/lab/src/AppRoutes.tsx`, `apps/lab/src/AppRoutes.browser.test.tsx`, `apps/lab/src/App.tsx`

**Interfaces:**
- Consumes: `selectedIndex(pathname)` from `shell/TabRow`.
- Produces:
  - `type WorkspaceTab = 'lab' | 'library'`
  - `Workspace({ control, hidden, tab }: { control: RunControl; hidden: boolean; tab: WorkspaceTab }): ReactElement`

  Task 6 hands `tab` on to `Console`; Task 7's panel is rendered by it.

- [ ] **Step 1: Rename the two files, keeping their history**

```bash
git mv apps/lab/src/routes/LabRoute.tsx apps/lab/src/routes/Workspace.tsx
git mv apps/lab/src/routes/LabRoute.browser.test.tsx apps/lab/src/routes/Workspace.browser.test.tsx
git rm apps/lab/src/routes/SavedBoardsRoute.tsx
```

- [ ] **Step 2: Write the failing test**

Append to `apps/lab/src/routes/Workspace.browser.test.tsx` (its `mountApp` helper and imports are already there; add `expect.poll`-shaped assertions only — navigation commits inside `startTransition`):

```ts
// Spec §5.1, PR 5a: one panel serves both tabs and renames itself with the
// route, because the tab strip resolves `aria-controls` to that id. Two
// parallel panels could not both hold the one stage.
test('the panel takes the identity of the tab that is open', async () => {
  const screen = await mountApp()
  const panel = () => screen.container.querySelector('[role="tabpanel"]')
  expect(panel()?.id).toBe('lab-panel')
  expect(panel()?.getAttribute('aria-labelledby')).toBe('tab-lab-panel')

  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))

  await expect.poll(() => panel()?.id).toBe('boards-panel')
  expect(panel()?.getAttribute('aria-labelledby')).toBe('tab-boards-panel')
})

// The whole point of the workspace: the element is never unmounted, so its GL
// context is never disposed. Node identity, not a count.
test('the board element survives the trip to the library and back', async () => {
  const screen = await mountApp()
  const element = () => screen.container.querySelector('arrowz-board')
  const before = element()
  expect(before).not.toBeNull()

  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
  await expect.poll(() => screen.container.querySelector('[role="tabpanel"]')?.id).toBe('boards-panel')
  expect(element()).toBe(before)

  await userEvent.click(screen.getByRole('tab', { name: 'Lab', exact: true }))
  await expect.poll(() => screen.container.querySelector('[role="tabpanel"]')?.id).toBe('lab-panel')
  expect(element()).toBe(before)
})

// Ruling 6: the preset strip goes, the stage stays — the same node, not merely
// a node in the same place. Measured by review round 1: a React `null` slot
// renders no DOM node, so the stage's *index* among `.fw-lab.children`
// legitimately drops from 1 to 0 while its identity holds. The index was the
// wrong instrument; identity is the claim.
test('the preset strip is absent from the library and the stage is the same node', async () => {
  const screen = await mountApp()
  const stage = () => screen.container.querySelector('.fw-stage')
  const before = stage()
  expect(before).not.toBeNull()

  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
  await expect.poll(() => screen.container.querySelector('[role="tabpanel"]')?.id).toBe('boards-panel')

  expect(screen.container.querySelector('.fw-presets')).toBeNull()
  expect(stage()).toBe(before)
})

// The docs are not the workspace: there the panel is hidden, as it was before
// this PR for every route but `/`.
test('the workspace is hidden under the docs route', async () => {
  const screen = await mountApp()
  await userEvent.click(screen.getByRole('tab', { name: 'Docs', exact: true }))
  await expect
    .poll(() => screen.container.querySelector('main[hidden] [role="tabpanel"]')?.id, { timeout: 5_000 })
    .toBe('lab-panel')
})
```

> The tab names come from the dictionary and are exactly `tabLab: 'Lab'`, `tabLibrary: 'Saved boards'`, `tabDocs: 'Docs'` (`packages/engine/lab-i18n.ts:113-115` — read them, do not guess: the plan's first draft said "Documentation" and the case timed out clicking a tab that does not exist). `{ exact: true }` because the collision runs the other way: a locator named `board` matches *Saved boards* as well as the `board` knob group, so every whole-app case in this repository spells its tab names exactly.

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --dir apps/lab exec vitest run src/routes/Workspace.browser.test.tsx`
Expected: FAIL — the panel keeps `lab-panel` under `/boards`, and a second tabpanel (the route's) is on the page.

- [ ] **Step 4: Rewrite the route as the workspace**

Replace the head of `apps/lab/src/routes/Workspace.tsx` (its imports stay, minus nothing) with:

```tsx
export type WorkspaceTab = 'lab' | 'library'

/**
 * The one panel of the application's two board-bearing tabs: the lab and the
 * saved boards. Always mounted, `hidden` only under the docs route (Ruling 5
 * of PR 2, extended in spec §5.1's PR 5a amendment). The stage is the same node
 * in both tabs — that is what keeps `<arrowz-board>`'s GL context alive — so
 * the tab changes what is around it and never where it is.
 *
 * The panel renames itself rather than being two panels: the tab strip points
 * `aria-controls` at whichever id is on screen (`TabRow.tsx`), and two parallel
 * sections could not both hold one stage.
 */
export function Workspace({
  control,
  hidden,
  tab,
}: {
  control: RunControl
  hidden: boolean
  tab: WorkspaceTab
}): ReactElement {
  const goRef = useRef<HTMLButtonElement>(null)
  const abortRef = useRef<HTMLButtonElement>(null)
  const simple = useStore((state) => state.ui.mode === 'simple')
  const solo = useStore((state) => state.ui.solo)
  const lab = tab === 'lab'
  const panel = lab ? 'lab-panel' : 'boards-panel'
  return (
    <main hidden={hidden}>
      <section id={panel} role="tabpanel" aria-labelledby={`tab-${panel}`} tabIndex={0} className="fw-view">
        <div className="fw-bar">
          <RunStatusBar />
        </div>
        {/* `library` earns its own row template for the same reason `simple`
            has one: with no preset strip, the stage would auto-place into the
            `auto` row and squeeze the console to its 180px minimum (Task 6). */}
        <div className={`fw-lab${lab ? '' : ' library'}${simple ? ' simple' : ''}${solo ? ' solo' : ''}`}>
          {/* Every one of these keeps its slot as `null` rather than leaving
              the child list: React keeps a node by type and position among its
              siblings, and a sibling that vanishes shifts `Stage` — remounting
              the element this whole arrangement exists to keep (Ruling 6). */}
          {lab && !simple ? <PresetStrip control={control} /> : null}
          <Stage />
          <Console control={control} face={tab}>
            <RunColumn control={control} goRef={goRef} abortRef={abortRef} />
          </Console>
          {lab ? <ClampNotice focusOnDismiss={goRef} focusOnAbort={abortRef} /> : null}
          {lab ? <Violations /> : null}
        </div>
      </section>
    </main>
  )
}
```

Add `ReactElement` to the React import:

```tsx
import { type ReactElement, useRef } from 'react'
```

- [ ] **Step 5: Take the library panel out of the routes**

Replace `apps/lab/src/AppRoutes.tsx`:

```tsx
import { Navigate, Route, Routes } from 'react-router'
import { DocsRoute } from './routes/DocsRoute'

export function AppRoutes() {
  return (
    <Routes>
      {/* `/` and `/boards` render nothing: both are the workspace, which App
          mounts beside <Routes> and merely hides off-route, so that a route
          change neither kills a run nor disposes the board's GL context
          (Ruling 5 of PR 2, and Ruling 5 here). A board's own address is a
          route all the same, or the wildcard below would redirect it. */}
      <Route path="/" element={null} />
      <Route path="/boards" element={null} />
      <Route path="/boards/:size/:id" element={null} />
      <Route path="/docs/:what" element={<DocsRoute />} />
      {/* A stale deep link is the lab, not a blank page. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
```

- [ ] **Step 6: Hand the tab down from the shell**

In `apps/lab/src/App.tsx`, replace the `onLab` line and the `LabRoute` element inside `Shell`:

```tsx
  // 0 is the lab, 1 the saved boards, 2 the docs (`TabRow`). The first two are
  // the workspace: one panel, one stage, two faces (spec §5.1).
  const tabIndex = selectedIndex(useLocation().pathname)
  const onWorkspace = tabIndex === 0 || tabIndex === 1
  useStoreSave()
  useSoloKey(onWorkspace)
  useDocumentLang()
  return (
    <div className="fw">
      <TopBar />
      <TabRow />
      <Workspace control={control} hidden={!onWorkspace} tab={tabIndex === 1 ? 'library' : 'lab'} />
      <AppRoutes />
    </div>
  )
```

Update the import:

```tsx
import { Workspace } from './routes/Workspace'
```

Then rename `useSoloKey`'s parameter in **all three places it appears**, or the file will not compile. Review round 1 measured a literal executor leaving `App.tsx(90,7): TS2552 Cannot find name 'onWorkspace'`, because the plan's first draft showed the docstring and the signature as one block and the dependency array as prose:

1. the signature — `function useSoloKey(onLab: boolean) {` becomes `function useSoloKey(onWorkspace: boolean) {`
2. the first line of its effect — `if (!onLab) return` becomes `if (!onWorkspace) return`
3. the dependency array at the end of that effect — `}, [onLab])` becomes `}, [onWorkspace])`

The body between them does not change. Its docstring's last sentence says the listener exists only on the lab route; it now covers both board-bearing tabs, which is what the old lab does (`lab-page.ts:1027-1029`: "full view works for both"). Replace that sentence with:

```tsx
 * A focused button is not a field, so `f` on Generate toggles, as it does in
 * the old lab (PR 4b, Ruling 9). The listener lives wherever the stage does —
 * the lab tab and the saved boards — and nowhere else. Escape is not handled:
 * the palette of PR 7 owns it.
 */
```

- [ ] **Step 7: Follow the rename through the route tests**

In `apps/lab/src/AppRoutes.browser.test.tsx`, replace the two cases that expect a panel at `/boards` with:

```ts
// The library panel is the workspace's, not a route's (Ruling 5): the route
// renders nothing, exactly as `/` does, so that navigating to it cannot
// unmount the board element. The whole-app test asserts the panel's identity.
test('/boards renders no panel of its own', async () => {
  const screen = await at('/boards')
  expect(screen.container.querySelector('[role="tabpanel"]')).toBeNull()
})

test("a board's address renders no panel of its own, and is not the wildcard", async () => {
  const screen = await at('/boards/25x50/sha256-abc')
  expect(screen.container.querySelector('[role="tabpanel"]')).toBeNull()
})
```

The `/docs/element` case and the unknown-path case stay. The last case, "each panel keeps the main landmark around it", is about the docs now:

```ts
// Each panel is inside a <main>, not instead of it: role="tabpanel" on <main>
// would erase the page's only landmark.
test('each panel keeps the main landmark around it', async () => {
  const screen = await at('/docs/element')
  await expect.element(screen.getByRole('main')).toBeVisible()
  const panel = screen.container.querySelector('[role="tabpanel"]')
  expect(panel?.closest('main')).not.toBeNull()
  expect(panel?.getAttribute('aria-labelledby')).toBe('tab-docs-panel')
  expect(panel?.getAttribute('tabindex')).toBe('0')
})
```

In `apps/lab/src/routes/Workspace.browser.test.tsx` and `apps/lab/src/routes/LabLayout.browser.test.tsx`, replace any `LabRoute` identifier in a comment or import with `Workspace`. Run `grep -rn "LabRoute\|SavedBoardsRoute" apps/lab/src` and leave no hit.

**And repair the one existing case this PR invalidates.** `LabLayout.browser.test.tsx:239`, "f does nothing off the lab route", clicks *Saved boards* and then polls for `#lab-panel`'s `<main>` to be `hidden` — under `/boards` the panel is now `boards-panel` and is not hidden, and solo is supposed to work there (Ruling: solo follows the stage). Review round 1 measured it failing. The case is still worth having, about the one route that has no stage:

```ts
// Solo belongs to the stage, and the docs route has none. (Until PR 5a the
// saved boards had none either, which is what this case used to assert.)
test('f does nothing on the docs route', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await screen.getByRole('tab', { name: 'Docs', exact: true }).click()
  await expect
    .poll(() => screen.container.querySelector('#lab-panel')?.closest('main')?.hasAttribute('hidden'))
    .toBe(true)
  await userEvent.keyboard('f')
  expect(solo()).toBe(false)
}, 40_000)
```

That solo *does* work in the library is Task 9's case, in the other file.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm --dir apps/lab exec vitest run src/routes/Workspace.browser.test.tsx src/AppRoutes.browser.test.tsx` then `pnpm --dir apps/lab run check`
Expected: PASS both. Task 6 supplies `Console`'s `face` prop; until then `check` will report it — do Task 6 before running the whole suite.

> If `check` fails on `Console`'s props here, add `face` to `Console` as part of Task 6 rather than stubbing it: the two tasks are one commit apart and a stub would be a third state to remember.

- [ ] **Step 9: Commit**

```bash
pnpm --dir apps/lab exec prettier --write src/routes/Workspace.tsx src/routes/Workspace.browser.test.tsx src/AppRoutes.tsx src/AppRoutes.browser.test.tsx src/App.tsx
git add -A apps/lab/src
git commit -m "Make the lab route a workspace that serves both board tabs"
```

---

## Task 6: The console's third face

**Files:**
- Modify: `apps/lab/src/console/Console.tsx`
- Modify: `apps/lab/src/design/console.css`
- Create: `apps/lab/src/design/library.css`
- Modify: `apps/lab/src/main.tsx` (the new stylesheet)
- Test: `apps/lab/src/routes/Workspace.browser.test.tsx` (one case)

**Interfaces:**
- Consumes: `WorkspaceTab` from Task 5.
- Produces: `Console({ control, children, face }: { control: RunControl; children: ReactNode; face: WorkspaceTab })`, and the classes `.fw-console.library`, `.fw-lib-chips`, `.fw-lib-list`.

- [ ] **Step 1: Write the failing test**

Append to `apps/lab/src/routes/Workspace.browser.test.tsx`:

```ts
// Ruling 1: the run column is hidden in the library, not replaced. A carve
// started in the lab keeps its node, its refs and the run itself; the old lab
// hides the same controls by class. Read through `querySelector`, not a role
// locator, precisely because a locator skips `display: none` — the state
// under test.
//
// The viewport is set first and deliberately: at the runner's default
// 414×896 the ≤900px query already gives `.fw-console` two tracks, so the
// track assertion below would pass with the library rule deleted. Review
// round 1 measured exactly that.
test('the run column stays mounted, and hidden, in the library', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp()
  const column = () => screen.container.querySelector('.fw-run-col')
  const before = column()
  expect(before).not.toBeNull()

  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
  await expect.poll(() => screen.container.querySelector('[role="tabpanel"]')?.id).toBe('boards-panel')

  const after = column()
  expect(after).toBe(before)
  if (!(after instanceof HTMLElement)) throw new Error('the run column is not an HTML element')
  expect(getComputedStyle(after).display).toBe('none')
  // And the console gives its width to the two tracks that are left: a hidden
  // grid item takes no track.
  const consoleBox = screen.container.querySelector('.fw-console')
  if (!(consoleBox instanceof HTMLElement)) throw new Error('the console is not on the page')
  expect(getComputedStyle(consoleBox).gridTemplateColumns.split(' ')).toHaveLength(2)
})

// The library has no preset strip, and the lab grid's first row is `auto`:
// without `.fw-lab.library` the stage takes 590px and the console is left with
// its 180px minimum on every viewport (measured, review round 1). This is the
// same trap `.fw-lab.simple` exists to avoid, so it is asserted the same way:
// by the two rows being the halves they are in the lab, not by a class name.
test('the library gives the console its share of the panel', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp()
  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
  await expect.poll(() => screen.container.querySelector('[role="tabpanel"]')?.id).toBe('boards-panel')

  const box = (selector: string) => {
    const found = screen.container.querySelector(selector)
    if (found === null) throw new Error(`${selector} is not on the page`)
    return found.getBoundingClientRect()
  }
  const stage = box('.fw-stage')
  const consoleBox = box('.fw-console')
  expect(consoleBox.height).toBeGreaterThan(300)
  expect(Math.abs(stage.height - consoleBox.height)).toBeLessThan(2)
})
```

> `page` comes from `vitest/browser`. The file already imports `userEvent` from there; add `page` to that import, or both new cases fail on an undefined name.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --dir apps/lab exec vitest run src/routes/Workspace.browser.test.tsx`
Expected: FAIL — the column is visible, the console still has three tracks at 1400px, and the console is 180px tall in the library.

- [ ] **Step 3: Give the console its third face**

Replace `apps/lab/src/console/Console.tsx`:

```tsx
import type { ReactNode } from 'react'
import { BoardList } from '../library/BoardList'
import { SizeChips } from '../library/SizeChips'
import type { WorkspaceTab } from '../routes/Workspace'
import type { RunControl } from '../run/useRun'
import { SimplePanel } from '../simple/SimplePanel'
import { useStore } from '../state/store'
import { GroupRail } from './GroupRail'
import { KnobPanel } from './KnobPanel'
import { ViewPanel } from './ViewPanel'

/**
 * The mock's three-track console: a rail, one panel, and the run column. The
 * column comes in as a child and stays the third child in every face — the
 * rail's slot is `null` in the simple view — because React keeps a node by its
 * type and its position among its siblings. Handing the same element to a
 * second console component would be a new parent, and the column would remount
 * (PR 4a, Ruling 7, which corrects spec §5.1).
 *
 * The library is the third face (PR 5a): the size chips take the rail and the
 * list takes the panel, while the column stays mounted and is hidden by class,
 * as the old lab hides its lab-only controls (Ruling 1). Its detail is PR 5b's,
 * under the list in the panel — not in the column's track, which would replace
 * the column instead of hiding it.
 */
export function Console({
  control,
  children,
  face,
}: {
  control: RunControl
  children: ReactNode
  face: WorkspaceTab
}) {
  const entry = useStore((state) => state.ui.entry)
  const simple = useStore((state) => state.ui.mode === 'simple')
  const library = face === 'library'
  return (
    <div className={`fw-console${library ? ' library' : ''}`}>
      {library ? <SizeChips /> : simple ? null : <GroupRail />}
      {library ? (
        <BoardList />
      ) : simple ? (
        <SimplePanel control={control} />
      ) : entry === 'preview' ? (
        <ViewPanel />
      ) : (
        <KnobPanel group={entry} />
      )}
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Add the library's two rules to the console's grid**

Append to `apps/lab/src/design/console.css`:

```css
/* The library face (spec §5.1, PR 5a). The run column keeps its node and is
   hidden, as the old lab hides its lab-only controls (`body.tab-library
   .labonly`), so a carve in flight keeps its node, its refs and the run
   itself. A hidden grid item takes no track, so the console drops to the two
   tracks the library uses — unlike solo's hidden items, which sit in tracks
   that have to be redefined because `display: none` on the *only* item of a
   track leaves the track behind. */
.fw-console.library {
  grid-template-columns: 168px minmax(0, 1fr);
}
.fw-console.library > .fw-run-col {
  display: none;
}
```

Two more rules, both measured by review round 1 rather than reasoned:

```css
/* The library has no preset strip either, so it needs `.fw-lab.simple`'s
   correction for the same reason (PR 4a, Ruling 10): with the first child
   absent, the stage auto-places into the `auto` row and the console is left
   with its 180px minimum. Measured before this rule at 1400×900 and 860×900:
   rows `590.219px 180px 0px`, the console at 180px on every viewport; after
   it, `385.109px 385.109px`. */
.fw-lab.library {
  grid-template-rows: minmax(180px, 1fr) minmax(0, 1fr);
}
```

and, in the rule that gives solo its single row, a third selector beside the two that are there:

```css
.fw-lab.solo,
.fw-lab.simple.solo,
.fw-lab.library.solo {
  grid-template-rows: minmax(0, 1fr);
}
```

> Without that third selector solo breaks in the library and nowhere else: `.fw-lab.library` and `.fw-lab.solo` have the same specificity (0,2,0), and the library rule comes later in the file, so it wins on order. Measured with it: `.fw-boardwrap` equals `.fw-lab` (1400×770) and the element is 34px smaller on both axes, exactly as in the lab.

Finally, let the narrow-width query know about the library face, or its rail will be 18px wider than the lab's below 900px — `.fw-console.library` is (0,2,0) and the query's `.fw-console` is (0,1,0), so the library keeps 168px where the lab has 150px (measured at 860: lab `150px 709px`, library `168px 691px`):

```css
@media (max-width: 900px) {
  .fw-console,
  .fw-console.library {
    grid-template-columns: 150px minmax(0, 1fr);
  }
```

- [ ] **Step 5: Create the library's stylesheet**

Create `apps/lab/src/design/library.css`:

```css
/* The saved-boards face of the console. Its own file, as `console.css` and
   `run.css` are: one file per surface keeps a specificity collision inside the
   surface that caused it (PR 2's lesson).

   The chips live in the rail's box, so they inherit its scrolling and its
   `--graphite`; they are a list of sizes, not the mock's preset strip, and they
   take the rail's own button treatment rather than the strip's chip treatment —
   the strip's pair is the open §7.1 contrast item and the library is not to
   inherit it. */
.fw-lib-chips {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 8px 0;
  background: var(--graphite);
  min-height: 0;
  overflow-y: auto;
}
.fw .fw-lib-chips button {
  flex: none;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 5px 16px;
  border: 0;
  text-align: left;
  background: none;
  color: var(--mist);
  cursor: pointer;
}
.fw .fw-lib-chips button:hover {
  color: var(--ink);
}
.fw .fw-lib-chips button[aria-pressed='true'] {
  background: var(--void);
  color: var(--ink);
}

.fw-lib-list {
  padding: 12px 16px;
  background: var(--void);
  min-height: 0;
  overflow-y: auto;
}
.fw-lib-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.fw-lib-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px 12px;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  margin-bottom: 4px;
  background: none;
  text-align: left;
  cursor: pointer;
}
.fw .fw-lib-row[aria-current='true'] {
  border-color: var(--signal);
}
/* A layout id is 71 characters: the row clips it and keeps it whole, so it can
   still be selected and copied (spec §5.6). */
.fw-lib-row .id {
  font-family: var(--mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fw-lib-row .meta {
  grid-column: 1 / -1;
  color: var(--ash);
}
```

> Check the token names against `apps/lab/src/design/tokens.css` before writing this file: use `--mono` only if it exists there, and otherwise repeat the stack `console.css` uses. `tokens.test.ts` guards the token list.

- [ ] **Step 6: Load the stylesheet**

In `apps/lab/src/main.tsx`, after `console.css` in the existing import block:

```tsx
import './design/library.css'
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --dir apps/lab exec vitest run src/routes/Workspace.browser.test.tsx`
Expected: PASS. Task 7 supplies `SizeChips` and `BoardList`; write them first if the import fails — the two tasks may be done in one sitting, each with its own commit.

- [ ] **Step 8: Commit**

```bash
pnpm --dir apps/lab exec prettier --write src/console/Console.tsx src/design/console.css src/design/library.css src/main.tsx
git add apps/lab/src/console/Console.tsx apps/lab/src/design/console.css apps/lab/src/design/library.css apps/lab/src/main.tsx
git commit -m "Give the console a library face, and hide the run column instead of replacing it"
```

---

## Task 7: Size chips, the list, and what a click navigates to

**Files:**
- Create: `apps/lab/src/library/SizeChips.tsx`, `apps/lab/src/library/BoardList.tsx`, `apps/lab/src/library/useLibraryList.ts`, `apps/lab/src/library/useOpenBoard.ts`
- Create: `apps/lab/src/library/LibraryPanel.browser.test.tsx` (the console's library face, which is `SizeChips` and `BoardList` together — there is no `LibraryPanel` component)

**Interfaces:**
- Consumes: `library.slice` (Task 3), `listBoards` (Task 2), the dictionary.
- Produces:
  - `useLibraryList(): { refresh(): void }` — fetches on mount and on demand.
  - `useOpenBoard(): { size: string | null; id: string | null }` — the address's board, which Task 8's hook also reads.
  - `SizeChips(): ReactElement`, `BoardList(): ReactElement`.
  - The address a row navigates to: `/boards/${size}/${meta.id}`.

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/library/LibraryPanel.browser.test.tsx`:

```tsx
import { act } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { MemoryRouter, useLocation } from 'react-router'
import { sizesFixture } from '../state/library.fixtures'
import { useStore } from '../state/store'
import { BoardList } from './BoardList'
import { SizeChips } from './SizeChips'
import '../design/tokens.css'
import '../design/library.css'

beforeEach(() => {
  const state = useStore.getState()
  state.library.reset()
  state.result.reset()
  state.lang.setLang('en')
  // The panel fetches on mount, and so does the preview hook. Unstubbed, those
  // requests reach the vitest server, which answers its own index for
  // `/api/boards` and `/store/…`; the listing that comes back then lands on top
  // of whatever state the case has just set, and the case asserts against the
  // server's answer instead of its own fixture. Measured by review round 1: two
  // of these cases failed on exactly that race. A promise that never settles is
  // the smallest stub that removes it.
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** The address the panel navigated to, printed where a test can read it. */
function Address() {
  return <p data-testid="address">{useLocation().pathname}</p>
}

async function mountPanel(path = '/boards') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <div className="fw">
        <SizeChips />
        <BoardList />
        <Address />
      </div>
    </MemoryRouter>,
  )
}

test('an unreachable store says so, and an empty one says something else', async () => {
  const screen = await mountPanel()
  await act(async () => useStore.getState().library.listFailed('connect ECONNREFUSED'))
  await expect.element(screen.getByText(/No store server/)).toBeVisible()

  await act(async () => useStore.getState().library.listed([]))
  await expect.element(screen.getByText(/The store is empty/)).toBeVisible()
})

test('a chip per size carries its count, and the rows carry what the store knows', async () => {
  const screen = await mountPanel()
  await act(async () => useStore.getState().library.listed(sizesFixture()))
  await expect.element(screen.getByRole('button', { name: /8x8/ })).toBeVisible()
  await expect.element(screen.getByRole('button', { name: /8x8/ })).toHaveTextContent('8x8 (2)')
  const rows = screen.container.querySelectorAll('.fw-lib-row')
  expect(rows).toHaveLength(2)
  expect(rows[0]?.textContent).toContain('pieces')
  // The whole hash is in the row, clipped by CSS and not by code.
  expect(rows[0]?.querySelector('.id')?.textContent).toHaveLength(71)
})

test('clicking a row navigates to that board', async () => {
  const screen = await mountPanel()
  await act(async () => useStore.getState().library.listed(sizesFixture()))
  const row = screen.container.querySelector('.fw-lib-row')
  if (!(row instanceof HTMLElement)) throw new Error('no row to click')
  const id = row.querySelector('.id')?.textContent ?? ''
  await userEvent.click(row)
  await expect.element(screen.getByTestId('address')).toHaveTextContent(`/boards/8x8/${id}`)
})

// Ruling 7: a chip opens the first board of its size, as `selectSize` does.
test('a size chip opens the first board of that size', async () => {
  const screen = await mountPanel('/boards')
  const sizes = sizesFixture()
  await act(async () => useStore.getState().library.listed(sizes))
  await userEvent.click(screen.getByRole('button', { name: /8x8/ }))
  const first = sizes[0]?.boards[0]?.id ?? ''
  await expect.element(screen.getByTestId('address')).toHaveTextContent(`/boards/8x8/${first}`)
})

// The row the address names is the current one, for a screen reader as well as
// for the eye.
test('the row of the open board is marked current', async () => {
  const sizes = sizesFixture()
  const id = sizes[0]?.boards[1]?.id ?? ''
  const screen = await mountPanel(`/boards/8x8/${id}`)
  await act(async () => useStore.getState().library.listed(sizes))
  const rows = screen.container.querySelectorAll('.fw-lib-row')
  expect(rows[1]?.getAttribute('aria-current')).toBe('true')
  expect(rows[0]?.getAttribute('aria-current')).toBeNull()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --dir apps/lab exec vitest run src/library/LibraryPanel.browser.test.tsx`
Expected: FAIL — the three modules do not exist.

- [ ] **Step 3: Write the list hook**

Create `apps/lab/src/library/useLibraryList.ts`:

```ts
import { useCallback, useEffect } from 'react'
import { listBoards } from '../api/boards'
import { useStore } from '../state/store'

/**
 * The listing, fetched when the tab is opened and again on demand. The cache is
 * the slice's, as the old lab's `boardsCache` is (`lab-page.ts:826`): coming
 * back to the tab shows what was there, and only a refresh pays for a new
 * listing (Ruling 7).
 *
 * The effect cannot leave a stale answer behind: a `cancelled` flag in its
 * cleanup drops an answer that arrives after the panel is gone, which is also
 * what StrictMode's double-invoked mount effect produces.
 */
export function useLibraryList(): { refresh(): void } {
  // One implementation, used by the mount effect and by Refresh: `dropped` is
  // how the effect cancels, and Refresh never passes one.
  const fetchList = useCallback(async (force: boolean, dropped?: () => boolean) => {
    const { library } = useStore.getState()
    if (!force && library.sizes !== null) return
    library.listing()
    const outcome = await listBoards()
    if (dropped?.() === true) return
    const slice = useStore.getState().library
    if (outcome.ok) slice.listed(outcome.sizes)
    else slice.listFailed(outcome.error)
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetchList(false, () => cancelled)
    return () => {
      cancelled = true
    }
  }, [fetchList])

  return { refresh: () => void fetchList(true) }
}
```

- [ ] **Step 4: Write the chips**

Create `apps/lab/src/library/SizeChips.tsx`:

```tsx
import { type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { useOpenBoard } from './useOpenBoard'

/**
 * The rail's face in the library: one chip per size, with how many layouts it
 * holds. Choosing a size opens the first board of that size, as the old lab's
 * `selectSize` does (`lab-page.ts:1085-1094`, Ruling 7) — a size with no board
 * cannot be listed, so there is always one to open.
 */
export function SizeChips(): ReactElement {
  const dict = useDictionary()
  const sizes = useStore((state) => state.library.sizes)
  const open = useOpenBoard()
  const navigate = useNavigate()
  const current = open.size
  return (
    <div className="fw-lib-chips" role="group" aria-label={dict.t('tabLibrary')}>
      {(sizes ?? []).map((entry) => (
        <button
          key={entry.size}
          type="button"
          aria-pressed={entry.size === current}
          onClick={() => {
            // Parity with `selectSize` (`lab-page.ts:1085-1094`): a size keeps
            // the board already open when that board belongs to it, and opens
            // its first board otherwise. A chip that always jumped to the first
            // would throw away the board being looked at whenever its own size
            // chip was pressed.
            const target = entry.boards.find((board) => board.id === open.id) ?? entry.boards[0]
            if (target) void navigate(`/boards/${entry.size}/${target.id}`)
          }}
        >
          {`${entry.size} (${entry.boards.length})`}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Write the address reader**

Create `apps/lab/src/library/useOpenBoard.ts`:

```ts
import { useMatch } from 'react-router'

/**
 * Which board the address names. `useMatch` and not `useParams`: the workspace
 * is `<Routes>`' sibling, so it is inside the router but outside any route, and
 * `useParams` would answer with nothing. The pattern is the one `AppRoutes`
 * declares, so the two cannot drift apart without a test noticing.
 */
export function useOpenBoard(): { size: string | null; id: string | null } {
  const match = useMatch('/boards/:size/:id')
  return { size: match?.params.size ?? null, id: match?.params.id ?? null }
}
```

- [ ] **Step 6: Write the list**

Create `apps/lab/src/library/BoardList.tsx`:

```tsx
import type { BoardMeta } from '@arrowz/engine'
import { genSeconds } from '@arrowz/engine/report'
import { type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { useLibraryList } from './useLibraryList'
import { useOpenBoard } from './useOpenBoard'

/**
 * The panel's face in the library: the rows of the chosen size, and Refresh.
 * A row is a button, because clicking it navigates — the address is the
 * selection (spec §5.6), so the browser's own back button walks the boards
 * that were looked at.
 *
 * Two empty states, and they say different things: an unreachable store asks
 * for `lab.sh`, an empty one asks for a board (Ruling 2). The row shows the
 * whole 71-character id, clipped by CSS, so it can be selected and copied.
 */
export function BoardList(): ReactElement {
  const dict = useDictionary()
  const { refresh } = useLibraryList()
  const sizes = useStore((state) => state.library.sizes)
  const listError = useStore((state) => state.library.listError)
  const lang = useStore((state) => state.lang.lang)
  const open = useOpenBoard()
  const navigate = useNavigate()

  // The size the address names, or the first the store listed: entering the
  // tab without an address still has rows to show.
  const entry = (sizes ?? []).find((s) => s.size === open.size) ?? sizes?.[0] ?? null

  const line = (meta: BoardMeta) => {
    const when = meta.createdAt ? new Date(meta.createdAt).toLocaleString(lang === 'pl' ? 'pl' : 'en-GB') : ''
    const parts = [
      dict.t('piecesShort', meta.pieces ?? '?'),
      dict.t('longestShort', meta.maxLen ?? '?'),
      dict.t('genShort', genSeconds(meta, '—')),
      meta.source,
    ]
    return { when, text: parts.join(' · ') }
  }

  return (
    <section className="fw-lib-list" aria-label={dict.t('tabLibrary')}>
      <div className="fw-lib-head">
        <button type="button" onClick={refresh}>
          {dict.t('refresh')}
        </button>
      </div>
      {listError !== null ? <p className="fw-lib-empty">{dict.t('noStoreServer')}</p> : null}
      {listError === null && sizes !== null && entry === null ? (
        <p className="fw-lib-empty">{dict.t('storeEmpty')}</p>
      ) : null}
      {(entry?.boards ?? []).map((meta) => {
        const { when, text } = line(meta)
        return (
          <button
            key={meta.id}
            type="button"
            className="fw-lib-row"
            {...(meta.id === open.id ? { 'aria-current': true } : {})}
            onClick={() => void navigate(`/boards/${entry?.size ?? ''}/${meta.id}`)}
          >
            <span className="id">{meta.id}</span>
            <span>{when}</span>
            <span className="meta">
              {text}
              {meta.ok === false ? ` · ${dict.t('notClosed')}` : ''}
            </span>
          </button>
        )
      })}
    </section>
  )
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --dir apps/lab exec vitest run src/library/LibraryPanel.browser.test.tsx` then `pnpm --dir apps/lab run check`
Expected: PASS both.

> `aria-current` is spread conditionally because `exactOptionalPropertyTypes` is on: `aria-current={meta.id === open.id}` would put `aria-current="false"` in the DOM, and the test asserts its absence.

- [ ] **Step 8: Commit**

```bash
pnpm --dir apps/lab exec prettier --write src/library
git add apps/lab/src/library
git commit -m "List the stored layouts, with a chip per size and a row that is an address"
```

---

## Task 8: The stored board on the stage

**Files:**
- Create: `apps/lab/src/library/useStoredBoard.ts`, `apps/lab/src/library/useStoredBoard.browser.test.tsx`
- Modify: `apps/lab/src/stage/BoardFrame.tsx`, `apps/lab/src/stage/RunStatusBar.tsx`, `apps/lab/src/report/ReportPanel.tsx`
- Modify: `apps/lab/src/routes/Workspace.tsx` (mount the hook — see Step 4 for why it is not the library panel)
- Test: `apps/lab/src/stage/BoardFrame.browser.test.tsx` (two cases)

**Interfaces:**
- Consumes: `readStoredBoard` (Task 2), `result.showPreview` / `clearPreview` (Task 4), `useOpenBoard` (Task 7).
- Produces: `useStoredBoard(): void` — draws the board the address names, or reports why it cannot.

- [ ] **Step 1: Write the failing hook test**

Create `apps/lab/src/library/useStoredBoard.browser.test.tsx`:

```tsx
import type { ReactNode } from 'react'
import { expect, test, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from 'vitest-browser-react'
import { MemoryRouter } from 'react-router'
import { storedFixture } from '../state/library.fixtures'
import { useStore } from '../state/store'
import { useStoredBoard } from './useStoredBoard'

const first = storedFixture(1)
const second = storedFixture(2)

beforeEach(() => {
  useStore.getState().result.reset()
  useStore.getState().library.reset()
  useStore.getState().lang.setLang('en')
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** A store that answers `/store/<size>/<id>.board.json` from the fixtures. */
function stubStore(answers: Record<string, unknown>, status = 200) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    const body = Object.entries(answers).find(([id]) => url.includes(id))?.[1]
    if (body === undefined) return Promise.resolve(new Response('{}', { status: 404 }))
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  })
}

const at = (path: string) => ({
  wrapper: ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>,
})

test('the board the address names is decoded and shown', async () => {
  stubStore({ [first.meta.id]: first.file })
  useStore.getState().library.listed([
    { size: '8x8', W: 8, H: 8, cells: 64, boards: [first.meta] },
  ])
  await renderHook(() => useStoredBoard(), at(`/boards/8x8/${first.meta.id}`))
  await expect.poll(() => useStore.getState().result.preview?.meta.id).toBe(first.meta.id)
  expect(useStore.getState().result.preview?.board.W).toBe(8)
  expect(useStore.getState().library.boardError).toBeNull()
})

// Ruling 8: a file that cannot be read leaves the stage empty and says why, as
// the old lab's `refuse` does.
test('a board that cannot be read clears the stage and reports the reason', async () => {
  stubStore({})
  useStore.getState().library.listed([
    { size: '8x8', W: 8, H: 8, cells: 64, boards: [first.meta] },
  ])
  await renderHook(() => useStoredBoard(), at(`/boards/8x8/${first.meta.id}`))
  await expect.poll(() => useStore.getState().library.boardError).not.toBeNull()
  expect(useStore.getState().library.boardError).toContain('404')
  expect(useStore.getState().result.preview).toBeNull()
})

// Ruling 4: the effect's own guard. A slow answer for a board the address no
// longer names must not land on the stage.
test('an answer for a board no longer open is dropped', async () => {
  // Written as an assertion and not as `let release: (() => void) | null = null`:
  // TypeScript narrows that declaration to `null`, does not see the assignment
  // inside the executor, and `release?.()` then fails to compile as `never`
  // (review round 1 hit it; `vitest run` would not have).
  let release = null as (() => void) | null
  const held = new Promise<void>((done) => {
    release = done
  })
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.includes(first.meta.id)) {
      await held
      return new Response(JSON.stringify(first.file), { status: 200 })
    }
    return new Response(JSON.stringify(second.file), { status: 200 })
  })
  useStore.getState().library.listed([
    { size: '8x8', W: 8, H: 8, cells: 64, boards: [first.meta, second.meta] },
  ])

  const view = await renderHook(() => useStoredBoard(), at(`/boards/8x8/${first.meta.id}`))
  view.unmount()
  release?.()
  await held
  // A microtask is not enough: the dropped answer would land on the next one.
  await new Promise((done) => setTimeout(done, 20))
  expect(useStore.getState().result.preview).toBeNull()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --dir apps/lab exec vitest run src/library/useStoredBoard.browser.test.tsx`
Expected: FAIL — `useStoredBoard` does not exist.

- [ ] **Step 3: Write the hook**

Create `apps/lab/src/library/useStoredBoard.ts`:

```ts
import { decodeBoard } from '@arrowz/engine'
import { useEffect } from 'react'
import { readStoredBoard } from '../api/boards'
import { useStore } from '../state/store'
import { useOpenBoard } from './useOpenBoard'

/**
 * Draws the board the address names. The address is the selection, so this
 * effect needs no guard in the slice: it captures the size and the id it
 * fetched for, and its cleanup drops an answer that arrives after the address
 * moved or the panel went away (Ruling 4) — which is also what StrictMode's
 * double-invoked mount effect produces.
 *
 * A board that cannot be read leaves the stage empty rather than under the
 * previous board's picture, and says why, as the old lab's `refuse` does
 * (`lab-page.ts:1159-1165`). Decoding failures and fetch failures are reported
 * alike: to someone looking at a list, a file that is missing and a file that
 * is unreadable are one thing.
 */
export function useStoredBoard(): void {
  const { size, id } = useOpenBoard()
  const metas = useStore((state) => state.library.sizes)

  useEffect(() => {
    if (size === null || id === null) {
      useStore.getState().result.clearPreview()
      useStore.getState().library.boardFailed(null)
      return
    }
    const meta = metas?.find((entry) => entry.size === size)?.boards.find((board) => board.id === id) ?? null
    if (meta === null) {
      // Before the listing arrives there is nothing to look the id up in, so
      // this waits. Once it has arrived, an id that is not in it is a stale
      // link, and spec §5.6 says the stage is left empty and the reason is
      // shown — not left silent under the previous board (review round 1
      // measured the silence).
      if (metas !== null) {
        useStore.getState().result.clearPreview()
        useStore.getState().library.boardFailed(`${size}/${id}: not in the store`)
      }
      return
    }
    let cancelled = false
    useStore.getState().library.boardFailed(null)
    void (async () => {
      const outcome = await readStoredBoard(size, id)
      if (cancelled) return
      const state = useStore.getState()
      const name = `${size}/${id}`
      if (!outcome.ok) {
        state.result.clearPreview()
        state.library.boardFailed(`${name}: ${outcome.error}`)
        return
      }
      try {
        const board = decodeBoard(outcome.file)
        if (cancelled) return
        state.result.showPreview({ board, file: outcome.file, meta })
      } catch (err) {
        if (cancelled) return
        state.result.clearPreview()
        state.library.boardFailed(`${name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [size, id, metas])
}
```

> The message is assembled as `<size>/<id>: <reason>` because the status line splits it again at the first `: ` and renders the halves through `boardFileError(name, reason)`, which is bilingual (Step 6). Keeping the two halves joined in the slice means the slice holds one failure, not two fields that could disagree; splitting in the component means the words around them stay the dictionary's.

- [ ] **Step 4: Mount the hook where it can also stop**

In `apps/lab/src/routes/Workspace.tsx`, beside the other hooks:

```tsx
  // Mounted here and not in the library panel: `Console` unmounts the panel on
  // the lab face, so a hook living there could never run its "the address names
  // no board — clear the preview" branch, and the stored board would still be
  // on the stage, in the status line and in place of the report after a return
  // to the lab. Review round 1 measured exactly that: back on `/`, the
  // annotation still read `8×8 · seed 1` over a 25×50 run, and the status line
  // announced a stored board while a carve was going.
  useStoredBoard()
```

with the import added. `Workspace` is mounted on every route, so the hook sees the address change to `/` and can act on it.

- [ ] **Step 5: Draw the preview on the stage**

In `apps/lab/src/stage/BoardFrame.tsx`, read the preview and prefer it:

```tsx
  const result = useStore((state) => state.result.shown)
  const preview = useStore((state) => state.result.preview)
  const view = useStore((state) => state.view)
  const lang = useStore((state) => state.lang.lang)
  // A stored board is drawn under its own stored view, never under the lab's
  // (Ruling 3): `meta.view` is what was saved with it, and `voids` shows the
  // holes of a board that did not close, as `showLibBoard` does.
  const labView = useMemo(() => boardViewOf(viewOf(view), view.voids), [view])
  const elementView = useMemo(
    () => (preview === null ? labView : boardViewOf(preview.meta.view, preview.meta.ok === false)),
    [preview, labView],
  )
  const board = preview?.board ?? result?.board ?? null
  const named =
    preview === null
      ? result === null
        ? null
        : { W: result.params.W, H: result.params.H, seed: result.params.seed }
      : { W: preview.meta.W, H: preview.meta.H, seed: preview.meta.seed }
```

and use them in the JSX:

```tsx
        <BoardCanvas board={board} view={elementView} interactive={false} lang={lang} enableColors />
        {named === null ? null : <span className="fw-anno">{dict.t('boardAnnotation', named.W, named.H, named.seed)}</span>}
```

- [ ] **Step 6: Let the status line speak for the preview**

In `apps/lab/src/stage/RunStatusBar.tsx`, above the phase branches:

```tsx
  const preview = useStore((state) => state.result.preview)
  const boardError = useStore((state) => state.library.boardError)
```

and, as the first branch of the chain (before `run.phase === 'running'`):

```tsx
  // Ruling 8: while the library has a board on screen, the line is about that
  // board. A stored board is not a run: the store's answer (`saved`) is a fact
  // about the run's result and is never appended here, and a carve in flight
  // still reports itself in the lab, where the user can see it.
  if (boardError !== null) {
    const [name = '', ...rest] = boardError.split(': ')
    text = dict.t('boardFileError', name, rest.join(': '))
  } else if (preview !== null) {
    const meta = preview.meta
    text = dict.t('savedBoard', `${meta.W}x${meta.H}/${meta.id}`, meta.seed, meta.source, `${genSeconds(meta, '—')} s`)
  } else if (run.phase === 'running') {
```

with `genSeconds` imported from `@arrowz/engine/report`.

- [ ] **Step 7: Empty the report column for a stored board**

In `apps/lab/src/report/ReportPanel.tsx`:

```tsx
  const result = useStore((state) => state.result.shown)
  const preview = useStore((state) => state.result.preview)
  const baseline = useStore((state) => state.result.baseline)
  // The old lab hides both tables in the library (`lab.html`'s
  // `body.tab-library #stats, body.tab-library #topTable`): a stored board has
  // no run to report, and `longestSummary` sorts every piece — about 90 000 at
  // Insane — which parity does not ask anyone to pay for a preview (spec §5.3).
  const shown = preview === null ? result : null
```

and render from `shown`.

- [ ] **Step 8: Add the two stage cases**

Append to `apps/lab/src/stage/BoardFrame.browser.test.tsx`:

```tsx
// Spec §5.3: the preview is what the stage shows while the library has one,
// and the run's own board is still there underneath, untouched.
test('a preview takes the stage and names itself, leaving the run result alone', async () => {
  const screen = await mountFrame()
  await act(async () => finish(finishedRun(1)))
  const { meta, file } = storedFixture(2, 6, 6)
  await act(async () => useStore.getState().result.showPreview({ board: decodeBoard(file), file, meta }))

  await expect.poll(() => annotation(screen.container)?.textContent).toBe('6×6 · seed 2')
  expect(screen.container.querySelector('arrowz-board')?.board?.W).toBe(6)
  expect(useStore.getState().result.shown).not.toBeNull()

  await act(async () => useStore.getState().result.clearPreview())
  await expect.poll(() => annotation(screen.container)?.textContent).toBe('8×8 · seed 1')
})

// Ruling 3: a stored board carries its own view. The element gates colour
// behind `enableColors`, so this reads the element's own colours button —
// the input alone would prove nothing (harness fact 20).
test('a stored board is drawn under its own saved view, not the lab’s', async () => {
  const screen = await mountFrame()
  const { meta, file } = storedFixture(2)
  const stored = { ...meta, view: { ...meta.view, colored: true } }
  await act(async () => useStore.getState().view.setFlag('colored', false))
  await act(async () => useStore.getState().result.showPreview({ board: decodeBoard(file), file, meta: stored }))

  const element = screen.container.querySelector('arrowz-board')
  await expect.poll(() => element?.shadowRoot?.querySelector('button.colors')?.getAttribute('aria-pressed')).toBe('true')
})
```

with `decodeBoard` and `storedFixture` imported.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm --dir apps/lab exec vitest run src/library src/stage src/report` then `pnpm --dir apps/lab run check`
Expected: PASS both.

- [ ] **Step 10: Commit**

```bash
pnpm --dir apps/lab exec prettier --write src/library src/stage/BoardFrame.tsx src/stage/RunStatusBar.tsx src/stage/BoardFrame.browser.test.tsx src/report/ReportPanel.tsx
git add apps/lab/src
git commit -m "Draw the board the address names on the one stage, under its own stored view"
```

---

## Task 9: The whole tab, end to end — and the spec's amendment

**Files:**
- Test: `apps/lab/src/routes/Workspace.browser.test.tsx` (two cases)
- Modify: `docs/superpowers/specs/2026-09-13-lab-react-app-design.md` (§5.1, Ruling 1)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing new.

- [ ] **Step 1: Write the end-to-end cases**

Append to `apps/lab/src/routes/Workspace.browser.test.tsx`:

```ts
// Solo is the stage's, not the lab tab's: the old lab's full view works on
// both tabs (`lab-page.ts:1027-1029`). The `f` key is the application's, so
// this presses it rather than clicking the toggle.
test('solo works on the saved boards tab too', async () => {
  const screen = await mountApp()
  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
  await expect.poll(() => screen.container.querySelector('[role="tabpanel"]')?.id).toBe('boards-panel')

  await userEvent.keyboard('f')
  await expect.poll(() => useStore.getState().ui.solo).toBe(true)
  const lab = screen.container.querySelector('.fw-lab')
  expect(lab?.classList.contains('solo')).toBe(true)

  await userEvent.keyboard('f')
  await expect.poll(() => useStore.getState().ui.solo).toBe(false)
})

// The report column belongs to a run. Opening the library must not leave the
// last run's statistics standing beside a stored board (spec §5.3).
test('the report column empties while a stored board is on screen', async () => {
  const screen = await mountApp()
  await loadRunDone()
  await expect.element(screen.getByRole('table').first()).toBeVisible()

  const { meta, file } = storedFixture(3)
  await act(async () => useStore.getState().result.showPreview({ board: decodeBoard(file), file, meta }))

  await expect.poll(() => screen.container.querySelectorAll('.fw-report table').length).toBe(0)
})

// The defect review round 1 found, and the reason `useStoredBoard` is mounted
// in `Workspace`: with the hook inside the library panel, `Console` unmounted
// it on the way out, nothing ever cleared the preview, and the lab tab went on
// drawing, announcing and reporting a board read off the disk — over a run of
// a different size, and masking a carve in flight.
test('leaving the library takes the stored board off the stage', async () => {
  const screen = await mountApp()
  await loadRunDone()
  const runAnnotation = screen.container.querySelector('.fw-anno')?.textContent

  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
  await expect.poll(() => screen.container.querySelector('[role="tabpanel"]')?.id).toBe('boards-panel')
  const { meta, file } = storedFixture(4)
  await act(async () => useStore.getState().result.showPreview({ board: decodeBoard(file), file, meta }))
  await expect.poll(() => screen.container.querySelector('.fw-anno')?.textContent).toBe('8×8 · seed 4')

  await userEvent.click(screen.getByRole('tab', { name: 'Lab', exact: true }))
  await expect.poll(() => useStore.getState().result.preview).toBeNull()
  expect(screen.container.querySelector('.fw-anno')?.textContent).toBe(runAnnotation)
  await expect.poll(() => screen.container.querySelectorAll('.fw-report table').length).toBeGreaterThan(0)
})
```

with `decodeBoard`, `storedFixture`, `act` and `loadRunDone` imported as needed.

- [ ] **Step 2: Run the whole lab suite**

Run: `pnpm nx test lab`
Expected: PASS, every project (node, node-integration, chromium).

- [ ] **Step 3: Amend the spec for Ruling 1**

Two other spec corrections review round 1 asked for are **already on the branch** (§5.3's slice table, which still credited `library` with a selection and view fields, and §9.1's sentence about the proxy covering `/boards/`); this step is only §5.1 and §10.

In `docs/superpowers/specs/2026-09-13-lab-react-app-design.md`, §5.1's PR 5a amendment, replace the sentence mapping the library onto three tracks:

> The library's three parts fall onto the console's own three tracks (`.fw-console`, `console.css`): the size chips take the rail, the list the panel, and the detail the track the run column holds in the lab.

with:

> The library takes two of the console's three tracks (`.fw-console`, `console.css`): the size chips the rail, the list the panel. The third is not reused — handing that position a different child replaces `RunColumn`, and a remount there is what PR 4a's Ruling 7 forbids: the column holds a keyboard focus on Generate and its own transition ref, and a carve started in the lab can still be running when the library is opened. The column therefore stays mounted and is hidden by class, as the old lab hides its lab-only controls (`lab.html`: `body.tab-library .labonly`), and `.fw-console.library` drops to two tracks, a hidden grid item taking none. PR 5b's detail goes under the list, in the panel (plan `2026-09-16-lab-board-library.md`, Ruling 1).

And in §10's row 5b, replace "the detail" with "the detail under the list".

- [ ] **Step 4: Run both gates**

Run: `deno task verify` then `pnpm nx run-many -t verify`
Expected: PASS both. If `deno fmt` complains about `packages/`, run `deno fmt` on the named file and commit the result.

- [ ] **Step 5: Commit**

```bash
pnpm --dir apps/lab exec prettier --write src/routes/Workspace.browser.test.tsx
git add apps/lab/src/routes/Workspace.browser.test.tsx docs/superpowers/specs/2026-09-13-lab-react-app-design.md
git commit -m "Cover solo and the report column on the library tab, and correct the spec's track map"
```

---

## Before the pull request

1. **Both gates green** at the final commit, recorded with their counts.
2. **A browser pass by hand**, as every PR of this stack has had: `sh packages/cli/lab.sh` in one terminal (the store server), `pnpm nx serve lab` in another, then at 1400×900 and 860×900 —
   - the Saved boards tab lists the sizes and the boards, newest first;
   - a row draws its board on the stage, with its own colours and the holes of a board that did not close;
   - the status line names the stored board, and never says "saved" for it;
   - the report column is empty there and full again in the lab;
   - `f` goes solo on both tabs;
   - the back button walks the boards that were opened;
   - a reload on `/boards/<size>/<id>` opens that board;
   - going back to the Lab tab restores the lab's own board, its annotation and its report — nothing of the stored board is left on the stage or in the status line;
   - a link to a board that has been deleted says so and leaves the stage empty;
   - stopping the store server and pressing Refresh says "No store server", and the rows already on screen stay.
3. **The old lab still works**: `deno task lab`, open `/lab.html`, open the Saved boards tab, confirm a board draws — the path it fetches moved in Task 1.

---

## What review round 1 changed

Three reviewers applied this plan in their own worktrees and ran it. Every item below is a measurement, not an opinion, and each is folded into the task it belongs to; they are listed here so a second reviewer can see what has already been attacked.

**Five defects that would have shipped or stalled execution:**

1. **The preview outlived the library.** `useStoredBoard` was mounted in `BoardList`, which `Console` unmounts on the lab face — so its "no address, clear the preview" branch could never run. Measured: back on `/`, the stage, the annotation, the status line and the empty report column all still described the stored board, over a run of a different size. The hook moved to `Workspace`, and Task 9 gained a case for it.
2. **The library squeezed the console to 180px on every viewport.** `.fw-lab`'s first row is `auto` and the library has no preset strip, so the stage auto-placed into it — the same trap `.fw-lab.simple` exists to avoid (PR 4a, Ruling 10), which this plan had not carried over. Measured `590.219px 180px 0px`; with `.fw-lab.library` it is `385.109px 385.109px`. Solo needed a third selector in the same breath, or the later library rule beat it on order.
3. **Two Task 5 cases could not pass**: one clicked a tab named "Documentation" (the dictionary says `Docs`), the other measured the stage's DOM index, which a React `null` slot legitimately changes while node identity — the actual claim — holds.
4. **One Task 7 case could not pass**: the panel's own mount-time fetch answered after the case had set its state, so neither empty-state sentence rendered. The file now stubs `fetch`.
5. **Three type errors in the plan's own test code** (`vi` unused, `ReactNode` never imported, a `let` narrowed to `null` making `release?.()` a `never` call). `vitest run` would have stayed green; `tsc` would not.

**Four things that were silently wrong:**

6. An existing case, `LabLayout.browser.test.tsx`'s "f does nothing off the lab route", asserts the old world and now fails; it moves to the docs route.
7. Task 6's track-count assertion was vacuous at the runner's default 414px viewport, where the ≤900px query already yields two tracks.
8. `.fw-console.library` outranked the narrow-width rule, leaving the library's rail 18px wider than the lab's below 900px.
9. A failed Refresh with rows on screen said nothing, because the empty-state condition also required `sizes === null` — which `listFailed` deliberately does not produce. The plan's own by-hand checklist would have caught it at the very end.

**Three parity gaps against the old lab:** a size chip threw away the board being looked at instead of keeping it when it belongs to that size (`selectSize`); a stale id was silent where spec §5.6 asks for `boardFileError`; and the setup instructions built only the engine, leaving `tsc` unable to resolve the board element on a fresh worktree.

**Confirmed by measurement, and left alone:** `<arrowz-board>` survives both tab changes as the same node with its WebGL2 context unlost (a MutationObserver recorded zero removals); `aria-controls` never dangles across six tab transitions; the late-answer guard really is load-bearing (removing the three `cancelled` checks turns its case red); the status line never appends the store's answer to a stored board, and the `': '` split survives reasons that themselves contain colons; `library.css`'s tokens all exist and its class names collide with nothing.
