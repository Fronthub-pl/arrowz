# Lab: Stop that keeps the partial board, and opening a `.board.json` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop hands back the board laid so far instead of discarding it, and the lab opens a `.board.json` (optionally with its meta) from disk as a preview on the saved boards.

**Architecture:** Stop writes a flag into a `SharedArrayBuffer` the worker's `trace` hook reads, and the engine's existing `GenerateAbort` path returns the partial board as a normal `done` with `aborted: true`. A file is read by one module function, `openBoardFiles`, which decodes it, matches an optional meta by `layoutHash`, and puts it in `result.preview` as a second preview origin (`'file'`) under the address `/boards/file`.

**Tech Stack:** TypeScript, React 19, zustand, Vite 8, Vitest 5 browser mode (Playwright Chromium), Deno 2.9 for the engine.

**Spec:** `docs/superpowers/specs/2026-09-28-lab-stop-and-open-design.md`

## Global Constraints

- Everything in the repository is English; every visible string goes into `packages/engine/lab-i18n.ts`, `EN.ui` and `PL.ui` both.
- New strings pass `packages/engine/glossary.test.ts`: no "carve", "piece(s)", "jam", "close(d)" in English; no "zacina", "generacj", "element" in Polish; no `--flag` in lab strings.
- The engine files (`types.ts`, `lab-report.ts`, `lab-i18n.ts`) stay neutral: no DOM, no Deno (`neutral.test.ts`).
- No `any`, no non-null assertions (`!`).
- Comments: why, once, fewest lines; non-header blocks ≤ 6 lines (`comments.test.ts` walks `apps/lab/src` and `packages/engine/lab-*.ts`); no history (no PR, task, review references).
- Never spread arrays proportional to cells or pieces.
- An aborted board is shown, never stored.
- Commit messages: no attribution lines.
- Gates: `cd packages/engine && deno task test` after engine changes; `pnpm nx run-many -t verify` before the branch is done. Use `set -o pipefail` when piping a gate into `tail`.

## Review Focus

1. **Stop pressed during the metrics step** (after carving, `metricsMs`): the flag is not read there. Expected: the run finishes as a normal `done` with `aborted: false`, the status line shows its real outcome, and `stopping` is cleared. Pinned in Task 3 (a `done` with `aborted: false` after Stop).
2. **Stop pressed on a small board that finishes before the first `trace`** (under ~250 ms): same as 1. Pinned by the same Task 3 case.
3. **A file preview whose meta has the id of a board that is also in the store**, then clicking that board in the list: the stored board must be fetched, not taken for the file preview. Pinned in Task 6 (`useStoredBoard` origin check).
4. **Leaving `/boards/file` and coming back with Back**: the file preview is gone (cleared on leave). Expected: the stage is empty and the line says how to open a board, not a crash on a null preview. Pinned in Task 6.
5. **A dropped non-file drag (text selected on the page)**: must not be taken as an open attempt, and must not navigate. Pinned in Task 8.

---

## Errata from the dry run (binding — they override the task text they name)

A full dry run of this plan passed every gate after these fixes. Each task
names the errata it must apply. The dry run's worktree `/tmp/arrowz-dry-stop`
(commits after `15f09d7`) holds working code for reference when a step is
unclear; the plan and these errata stay the source.

- **E1 (all tasks) — command names.** There is no `lab:worker-smoke`: run `pnpm nx run lab:smoke` (it builds first). There is no `lab:typecheck`: run `cd apps/lab && pnpm run check`. Never `tsc -b --noEmit` (it leaves `apps/lab/tsconfig.tsbuildinfo`). Vitest here is v5.
- **E2 (Tasks 1, 4, 6, 7, 8) — rebuild the engine.** The lab reads `@arrowz/engine` types and the dictionary from `packages/engine/dist`. After editing `types.ts`, `lab-report.ts` or `lab-i18n.ts`, run `pnpm nx build engine` before any lab `check` or `vitest`.
- **E3 (all tasks) — format.** The plan's code blocks are not prettier-formatted. Before each commit: `cd apps/lab && pnpm exec prettier --write <touched lab files>`, and `cd packages/engine && deno fmt <touched engine files>`.
- **E4 (Task 1, Step 1) — a smoke check that cannot fail.** "the board laid so far comes back and decodes" passes before the implementation (the whole board comes back). Make it: `stopped?.aborted === true && stopped.pieces > 0 && stopped.pieces < mine400.board.pieces.length && decodeBoard(stopped.board).pieces.length === stopped.pieces`, where `mine400 = generate({ ...defaultParams(), W: 400, H: 400, seed: 7 })` is computed before the stopped run.
- **E5 (Task 3) — a regression the plan missed.** `apps/lab/src/routes/Workspace.browser.test.tsx`, case "the clamp notice hands focus to the route's own buttons": one Abort click now keeps the board, so the run ends in `done`. Replace its `expect.poll(...).toBe('idle')` after the Abort click with:
  ```ts
  // Stop keeps the board, so the run ends in `done`; a press before the first
  // trace lets it finish whole, hence the long poll.
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  ```
  Add the file to Task 3's commit. Task 3 ends with a whole chromium run: `cd apps/lab && set -o pipefail && pnpm exec vitest run --project chromium 2>&1 | tail -15`. Moving the two `HeldWorker` cases is unnecessary (hoisted).
- **E6 (Task 4, Step 2) — the useStoreSave case passes before its code.** Two `finish` calls land in one React commit and the effect sees only the second. Use `import { act } from 'react'` and:
  ```tsx
  // Each in its own commit: in one, the effect would see only the second.
  await act(async () => finish(stoppedRun(1)))
  await act(async () => finish(finishedRun(2)))
  ```
  `StoreRequest` has no top-level `seed`: assert `expect(posted(fetch).params.seed).toBe(2)`.
- **E7 (Task 6, Step 3) — the compiler names far more.** With `meta: BoardMeta | null`, about 50 test sites (`preview?.meta.X`, `after?.meta.X`) break. Fix mechanically:
  ```bash
  grep -rlE "showPreview\(\{ board|preview\?\.meta\.|after\?\.meta\." apps/lab/src --include='*.test.ts' --include='*.test.tsx' | xargs perl -0pi -e "s/showPreview\(\{ board/showPreview({ origin: 'store', board/g; s/preview\?\.meta\./preview?.meta?./g; s/after\?\.meta\./after?.meta?./g"
  ```
  Production code also breaks in Task 6: in `useViewSave.ts`'s `write`, the stage gate becomes `if (current?.origin === 'store' && current.meta.id === meta.id && current.meta.view === posted)`. So that Task 6 commits type-checked, put stopgaps Task 7 replaces: `BoardColumn` treats `open.origin === 'file'` as the empty state; `BoardPreview` uses `open?.origin === 'store' ? open.stored.meta.view : null`; `ReportPanel` renders nothing for `open.origin === 'file'`.
- **E8 (Task 6) — a guard, not a red test.** "leaving /boards/file clears the file preview" passes before the change (the no-address branch already clears). Keep it, with the comment `// A guard: the file route must not start keeping the preview after it is left.`
- **E9 (Tasks 5, 6, 7) — the spec's facts in the board column.** The spec puts the file's facts, the full layout hash included, in the board column. `ReadOutcome`'s `ok` member and `OpenedFile` gain `readonly id: string` (the `layoutHash` `readBoardFiles` computes — compute it once, always, and compare the meta against it); `openBoardFiles` passes it on. `FileColumn` ends with a `<dl className="fw-bmeta" aria-label={dict.t('boardFacts')}>` of two rows: `factFile` → the name, `factLayout` → `id` with `<dd className="wrap">` (as `BoardColumn`'s layout row). Task 7 adds a FileColumn case: the layout hash of the fixture (`metaJson.id`) is visible with no meta opened.
- **E10 (Task 7, Step 1) — `vi.spyOn` on an ES module export throws.** Replace the last FileColumn case with the repository's pattern (no `import * as download`, no menu click):
  ```tsx
  test('Download board file hands back the file under its own name', async () => {
    const { board } = await fileFixture(1)
    const names: string[] = []
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:file-under-test')
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof HTMLAnchorElement) || event.target.download === '') return
      names.push(event.target.download)
      event.preventDefault()
    }
    document.addEventListener('click', onClick, true)
    try {
      await mountFile([board])
      await userEvent.click(page.getByRole('button', { name: 'Download board file' }))
      expect(names).toEqual([board.name])
    } finally {
      document.removeEventListener('click', onClick, true)
    }
  })
  ```
- **E11 (Task 7, Step 6) — the Polish label.** Load into lab is "Wczytaj do laboratorium" in Polish: `fileNoMeta` (PL) ends `„Wczytaj do laboratorium”`.
- **E12 (Task 8, Step 1) — the ⌘K case cannot run in node.** `commands.test.ts` runs without a `document`. There, keep only:
  ```ts
  test('lists Open file… under go, never disabled', () => {
    const row = buildCommands(deps(), useStore.getState()).find((r) => r.id === 'go-open-file')
    expect(row?.name).toBe('Open file…')
    expect(row?.section).toBe('go')
    expect(row?.disabled).toBe(false)
  })
  ```
  (use the file's own `deps` helper and `test`/`it` style), and add to `openEntries.browser.test.tsx` (imports `act` from `react`, `userEvent` from `vitest/browser`):
  ```tsx
  test('the ⌘K row clicks the one input and closes the palette', async () => {
    await mountQuiet()
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    await act(async () => useStore.getState().ui.openPalette())
    const row = document.querySelector<HTMLElement>('#cmd-go-open-file')
    if (row === null) throw new Error('no open-file row')
    await userEvent.click(row)
    expect(click.mock.contexts.some((input) => input instanceof HTMLInputElement && input.id === BOARD_FILE_INPUT_ID)).toBe(true)
    expect(useStore.getState().ui.palette).toBe(false)
  }, 60_000)
  ```
  "a drop with no files changes nothing" is a guard (passes before); say so in its comment.
- **E13 (Task 8) — Review Focus 4, coming back with Back.** Add to `openEntries.browser.test.tsx`: open a file by the input (as the first case), then `history.back()` and wait for `/`, then `history.forward()` and wait for `/boards/file`; expect `result.preview` to be `null`, no error thrown, and `page.getByText('Open a board from the list.')` visible (the empty column's hint).

---

## File Structure

Part 1 (Stop):
- `packages/engine/types.ts` — `WorkerIn.generate.stop?`, `WorkerOut.done.aborted`.
- `packages/engine/lab-report.ts` — `ReportInput.aborted`.
- `apps/lab/src/worker/generate.worker.ts` — reads the flag in `trace`.
- `apps/lab/src/worker/useGenerator.ts` — makes the flag, two-stage `abort()`.
- `apps/lab/src/state/run.slice.ts` — `stopping` flag and `stopping()` action.
- `apps/lab/src/state/result.slice.ts` — `reportInputOf` copies `aborted`; `showResult` keeps the baseline past an aborted result.
- `apps/lab/src/library/useStoreSave.ts` — skips an aborted result.
- `apps/lab/src/stage/useRunState.ts` — "Stopping…" and "Stopped — …" lines.
- `apps/lab/src/run/RunColumn.tsx`, `apps/lab/src/palette/commands.ts` — the Stop button's "Discard" label.
- `apps/lab/vite.config.ts`, `apps/lab/vitest.config.ts` — isolation headers.
- `apps/lab/scripts/worker-smoke.mjs` — the built worker aborts on the flag.

Part 2 (open a file):
- `apps/lab/src/library/readBoardFiles.ts` (new) — pure: `File[]` → board, file, meta or a problem.
- `apps/lab/src/library/openBoardFiles.ts` (new) — the one entry: read, store, navigate; plus `BOARD_FILE_INPUT_ID`.
- `apps/lab/src/library/BoardFileInput.tsx` (new) — the one hidden `<input type="file">`, mounted in `App`.
- `apps/lab/src/library/OpenFileButton.tsx` (new) — a button that clicks that input.
- `apps/lab/src/library/FileColumn.tsx` (new) — the board column for a file preview.
- `apps/lab/src/library/loadIntoLab.ts` (new) — `loadIntoLab` moved out of `BoardColumn` for both columns.
- `apps/lab/src/report/FileFacts.tsx` (new) — the report of a file preview.
- `apps/lab/src/state/result.slice.ts` — `Preview = StoredBoard | OpenedFile`.
- `apps/lab/src/state/library.slice.ts` — `BoardError.problem?`.
- `apps/lab/src/library/useOpenBoard.ts`, `useOpenPreview.ts`, `useStoredBoard.ts`, `useViewSave.ts`, `BoardColumn.tsx`, `BoardPreview.tsx`, `BoardList.tsx` — the second origin.
- `apps/lab/src/stage/BoardFrame.tsx`, `apps/lab/src/stage/useRunState.ts`, `apps/lab/src/report/ReportPanel.tsx`, `apps/lab/src/report/StoredFacts.tsx` — the second origin.
- `apps/lab/src/AppRoutes.tsx`, `apps/lab/src/App.tsx`, `apps/lab/src/routes/Workspace.tsx` — route, input, drop.

---

### Task 1: `aborted` through the protocol and the report input

**Errata to apply: E1, E2, E3, E4.**

**Files:**
- Modify: `packages/engine/types.ts` (`WorkerIn`, `WorkerOut`)
- Modify: `packages/engine/lab-report.ts` (`ReportInput`)
- Modify: `packages/engine/lab-report.test.ts` (two report builders)
- Modify: `apps/lab/src/worker/generate.worker.ts`
- Modify: `apps/lab/src/state/result.slice.ts` (`reportInputOf`)
- Modify: `apps/lab/src/state/result.fixtures.ts`
- Modify: `apps/lab/src/worker/useGenerator.browser.test.tsx`, `apps/lab/src/stage/RunStatusBar.browser.test.tsx`, `apps/lab/src/run/RunColumn.browser.test.tsx` (hand-built `done` objects)
- Modify: `apps/lab/scripts/worker-smoke.mjs`

**Interfaces:**
- Produces: `WorkerIn` `{ type: 'generate'; params: Params; stop?: Int32Array }`; `WorkerOut` `done` has `aborted: boolean`; `ReportInput` has `readonly aborted: boolean`; `reportInputOf` copies it.

- [ ] **Step 1: Write the failing smoke case**

In `apps/lab/scripts/worker-smoke.mjs`, after the SVG check and before `if (failures > 0)`, add:

```js
// 400×400 because the carver's first trace comes no sooner than 250 ms in
// (its `run` loop); measured 953 ms whole, the first trace at 3500 arrows.
// Node's postMessage here is synchronous, so the flag is up before the worker
// reads it in the same trace call.
messages.length = 0
const stop = new Int32Array(new SharedArrayBuffer(4))
globalThis.postMessage = (message) => {
  messages.push(message)
  if (message.type === 'progress') Atomics.store(stop, 0, 1)
}
globalThis.onmessage({ data: { type: 'generate', params: { ...defaultParams(), W: 400, H: 400, seed: 7 }, stop } })
const stopped = messages.find((m) => m.type === 'done')
check(stopped?.aborted === true && stopped.ok === false, 'a raised flag stops the built worker with aborted: true')
check(
  stopped !== undefined && stopped.pieces > 0 && decodeBoard(stopped.board).pieces.length === stopped.pieces,
  'the board laid so far comes back and decodes',
)
check(done?.aborted === false, 'a run nobody stopped says aborted: false')
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm nx run lab:worker-smoke` (if the target is named differently, `grep -n worker-smoke apps/lab/project.json apps/lab/package.json` and use that; it builds first).
Expected: FAIL on the three new checks (`aborted` is undefined).

- [ ] **Step 3: Extend the protocol types**

In `packages/engine/types.ts`, replace the `generate` member of `WorkerIn` and add `aborted` to `done`:

```ts
export type WorkerIn =
  /** `stop` is a one-element view over a SharedArrayBuffer: 1 asks the run to stop and hand back its board. */
  | { type: 'generate'; params: Params; stop?: Int32Array }
```

and in the `done` member, after `deadlock: boolean`:

```ts
    /** The run was stopped (`GenerateAbort`): the board is the one laid so far. */
    aborted: boolean
```

In `packages/engine/lab-report.ts`, in `ReportInput`, after `readonly deadlock: boolean`:

```ts
  readonly aborted: boolean
```

- [ ] **Step 4: Read the flag in the worker and send `aborted`**

In `apps/lab/src/worker/generate.worker.ts`, add `GenerateAbort` to the engine import, and replace the `generate(...)` call and the `done` post:

```ts
import { decodeBoard, encodeBoard, GenerateAbort, generate, toSvg } from '@arrowz/engine'
```

```ts
  const { stop } = message
  let result
  try {
    result = generate(message.params, {
      trace: (info) => {
        post({ type: 'progress', info })
        if (stop !== undefined && Atomics.load(stop, 0) === 1) throw new GenerateAbort('stopped from the page')
      },
    })
```

and in the `post({ type: 'done', ... })` object, after `deadlock: result.deadlock,`:

```ts
    aborted: result.aborted,
```

Check `GenerateAbort` is exported from `packages/engine/mod.ts` (`grep -n GenerateAbort packages/engine/mod.ts`); if not, add it to the `engine.ts` export line there.

- [ ] **Step 5: Copy `aborted` in `reportInputOf` and fix every builder the compiler names**

In `apps/lab/src/state/result.slice.ts`, `reportInputOf`, after `deadlock: report.deadlock,`:

```ts
    aborted: report.aborted,
```

In `apps/lab/src/state/result.fixtures.ts`, after `deadlock: result.deadlock,`: `aborted: result.aborted,`.

In `packages/engine/lab-report.test.ts`, the builder at the line with `deadlock: r.deadlock,` gets `aborted: r.aborted,`, and the literal with `deadlock: false,` gets `aborted: false,`.

In the three browser tests named under **Files**, every hand-built `done` / report literal with `deadlock: false,` gets `aborted: false,` after it.

Run: `cd apps/lab && pnpm exec tsc -b --noEmit 2>&1 | head -30` (or `pnpm nx run lab:typecheck`; find the target with `grep -n typecheck apps/lab/project.json`) and fix any remaining builder it names the same way.

- [ ] **Step 6: Run the gates**

Run: `cd packages/engine && deno task test 2>&1 | tail -5`
Expected: all pass.
Run: `pnpm nx run lab:worker-smoke`
Expected: every line `ok`, including the three new ones.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/types.ts packages/engine/lab-report.ts packages/engine/lab-report.test.ts packages/engine/mod.ts apps/lab/src/worker/generate.worker.ts apps/lab/src/state/result.slice.ts apps/lab/src/state/result.fixtures.ts apps/lab/src/worker/useGenerator.browser.test.tsx apps/lab/src/stage/RunStatusBar.browser.test.tsx apps/lab/src/run/RunColumn.browser.test.tsx apps/lab/scripts/worker-smoke.mjs
git commit -m "Worker: a stop flag in shared memory ends the run with the board laid so far"
```

---

### Task 2: cross-origin isolation for the lab and its browser tests

**Errata to apply: E1, E3.**

**Files:**
- Modify: `apps/lab/vite.config.ts`
- Modify: `apps/lab/vitest.config.ts`
- Create: `apps/lab/src/harness/isolation.browser.test.ts`

**Interfaces:**
- Produces: `crossOriginIsolated === true` in the lab (dev, preview) and in the `chromium` test project.

- [ ] **Step 1: Write the failing test**

`apps/lab/src/harness/isolation.browser.test.ts`:

```ts
import { expect, test } from 'vitest'

// Stop reaches the worker through a SharedArrayBuffer, which a page has only
// when it is cross-origin isolated (`useGenerator`).
test('the test page is cross-origin isolated, as the lab is', () => {
  expect(crossOriginIsolated).toBe(true)
  expect(typeof SharedArrayBuffer).toBe('function')
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/harness/isolation.browser.test.ts`
Expected: FAIL, `crossOriginIsolated` is false.

- [ ] **Step 3: Add the headers**

`apps/lab/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { labProxy } from './vite.proxy.ts'

// Cross-origin isolation, for the SharedArrayBuffer Stop writes into
// (`useGenerator`). The lab loads nothing from another origin.
export const ISOLATION = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react()],
  // 8777 is the store server, 8778 is the board element's demo.
  server: { port: 8779, proxy: labProxy(), headers: ISOLATION },
  preview: { headers: ISOLATION },
  build: { target: 'es2022' },
})
```

`apps/lab/vitest.config.ts`: import `ISOLATION` from `./vite.config.ts` and add `server: { headers: ISOLATION },` to the `chromium` project object, beside `optimizeDeps`.

- [ ] **Step 4: Run it to see it pass**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/harness/isolation.browser.test.ts`
Expected: PASS.

**Checkpoint:** if it still fails, do not work around it with stubs. Record what `crossOriginIsolated`, `document.location.href` and `window.top === window` are inside the test (log them), stop, and report: the browser runner's iframe may need the headers through a different option, and that is a finding for the plan, not for a test tweak.

- [ ] **Step 5: Run the whole chromium project**

Run: `cd apps/lab && set -o pipefail && pnpm exec vitest run --project chromium 2>&1 | tail -15`
Expected: every file passes as before (isolation must not break the board element's GL, fonts or the store proxy).

- [ ] **Step 6: Commit**

```bash
git add apps/lab/vite.config.ts apps/lab/vitest.config.ts apps/lab/src/harness/isolation.browser.test.ts
git commit -m "Lab: cross-origin isolation, so Stop can share memory with the worker"
```

---

### Task 3: two-stage Stop in the run slice and the generator

**Errata to apply: E1, E3, E5.**

**Files:**
- Modify: `apps/lab/src/state/run.slice.ts`
- Modify: `apps/lab/src/state/run.slice.test.ts`
- Modify: `apps/lab/src/worker/useGenerator.ts`
- Modify: `apps/lab/src/worker/useGenerator.browser.test.tsx`
- Modify: `apps/lab/src/run/useRun.ts` (doc comment only)

**Interfaces:**
- Consumes: Task 1's `WorkerIn.stop`, `done.aborted`; Task 2's isolation.
- Produces: `RunState.stopping: boolean` (the field) and `RunState.stopRequested(): void` (the action; a different name, because a slice cannot have a field and a method both called `stopping`); `runDone` and `failed` clear `stopping`.

- [ ] **Step 1: Write the failing slice tests**

Append to `apps/lab/src/state/run.slice.test.ts`:

```ts
test('a stop request keeps the run running and marks it stopping', () => {
  run().started(params)
  run().stopRequested()
  expect(run().phase).toBe('running')
  expect(run().stopping).toBe(true)
})

test('the run that ends after a stop request is no longer stopping', () => {
  run().started(params)
  run().stopRequested()
  useStore.getState().completeRun(finishedRun(1))
  expect(run().stopping).toBe(false)
  expect(run().phase).toBe('done')
})

test('a new run forgets an earlier stop request', () => {
  run().started(params)
  run().stopRequested()
  run().started(params)
  expect(run().stopping).toBe(false)
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/lab && pnpm exec vitest run --project node src/state/run.slice.test.ts`
Expected: FAIL, `stopRequested` is not a function.

- [ ] **Step 3: Implement the slice**

In `apps/lab/src/state/run.slice.ts`:
- in `RunState`, after `wasAborted: boolean`:

```ts
  /** Stop was pressed and the worker has not answered yet; a second Stop discards. */
  stopping: boolean
```

  and after `aborted(): void`: `stopRequested(): void`
- in `EMPTY`: `stopping: false,`
- `runDone`: `return { ...state, phase: 'done', progress: null, message: null, stopping: false }`
- in `createRunSlice`, after `aborted`: `stopRequested: () => patch({ stopping: true }),`

`failed` also ends a run: change it to `patch({ phase: 'error', progress: null, message, stopping: false })`.

- [ ] **Step 4: Run the slice tests**

Run: `cd apps/lab && pnpm exec vitest run --project node src/state/run.slice.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing generator tests**

In `apps/lab/src/worker/useGenerator.browser.test.tsx`, replace the test `'abort terminates the worker, and nothing arrives afterwards'` with the two below (the first keeps the old case for a page without isolation), and add the third and fourth:

```tsx
// Without isolation there is no shared flag, so Stop is today's terminate.
test('without isolation, abort terminates the worker and nothing arrives afterwards', async () => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  vi.stubGlobal('crossOriginIsolated', false)
  const terminate = vi.spyOn(Worker.prototype, 'terminate')
  try {
    await render(
      <Harness
        drive={(g) => {
          g.start({ ...defaultParams(), W: 200, H: 200, seed: 9 })
          const id = setTimeout(() => g.abort(), 30)
          return () => clearTimeout(id)
        }}
      />,
    )
    await expect.poll(() => useStore.getState().run.phase, { timeout: 20_000 }).toBe('idle')
    expect(terminate).toHaveBeenCalled()
    await new Promise((done) => setTimeout(done, 2_000))
    expect(useStore.getState().run.phase).toBe('idle')
    expect(useStore.getState().result.shown).toBeNull()
  } finally {
    terminate.mockRestore()
    vi.unstubAllGlobals()
  }
}, 30_000)

// 600×600 for the reason the progress case below gives: it traces on a fast machine.
test('Stop on a traced run hands back the board laid so far', async () => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  const handle = await mountHandle()
  await act(async () => handle().start({ ...defaultParams(), W: 600, H: 600, seed: 11 }))
  await expect.poll(() => useStore.getState().run.progress !== null, { timeout: 20_000 }).toBe(true)
  await act(async () => handle().abort())
  expect(useStore.getState().run.stopping).toBe(true)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 20_000 }).toBe('done')
  const shown = useStore.getState().result.shown
  expect(shown?.report.aborted).toBe(true)
  expect(shown?.report.ok).toBe(false)
  expect(shown?.board.pieces.length ?? 0).toBeGreaterThan(0)
  expect(useStore.getState().run.stopping).toBe(false)
}, 60_000)

test('a second Stop while stopping discards the run', async () => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  HeldWorker.made = []
  vi.stubGlobal('Worker', HeldWorker)
  try {
    const handle = await mountHandle()
    await act(async () => handle().start({ ...defaultParams(), W: 16, H: 16, seed: 5 }))
    await act(async () => handle().abort())
    expect(useStore.getState().run.stopping).toBe(true)
    await act(async () => handle().abort())
    expect(useStore.getState().run.phase).toBe('idle')
    expect(useStore.getState().run.wasAborted).toBe(true)
  } finally {
    vi.unstubAllGlobals()
  }
}, 15_000)

// The flag is read only while laying arrows: a run already past that (or one
// too small to trace) answers a plain `done`, which must end the stop.
test('a run that finishes unstopped after Stop ends the stop request', async () => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  HeldWorker.made = []
  vi.stubGlobal('Worker', HeldWorker)
  try {
    const handle = await mountHandle()
    await act(async () => handle().start({ ...defaultParams(), W: 8, H: 8, seed: 1 }))
    await act(async () => handle().abort())
    const { report, file } = finishedRun(1)
    const data: WorkerOut = { ...report, board: file }
    await act(async () => HeldWorker.made[0]?.onmessage?.(new MessageEvent('message', { data })))
    expect(useStore.getState().run.phase).toBe('done')
    expect(useStore.getState().run.stopping).toBe(false)
    expect(useStore.getState().result.shown?.report.aborted).toBe(false)
  } finally {
    vi.unstubAllGlobals()
  }
}, 15_000)
```

Add `import { finishedRun } from '../state/result.fixtures'` to the file's imports. `HeldWorker` and `mountHandle` are declared further down the file: move the two new cases that use them below those declarations.

- [ ] **Step 6: Run them to see them fail**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/worker/useGenerator.browser.test.tsx`
Expected: the three new cases FAIL (`stopping` undefined, run discarded).

- [ ] **Step 7: Implement the generator**

In `apps/lab/src/worker/useGenerator.ts`:
- add a ref beside `busy`: `const stop = useRef<Int32Array | null>(null)`
- in `kill`, add `stop.current = null`
- in `start`, replace the `postMessage` line with:

```ts
        // A fresh flag per run: a flag raised for the old run must not stop the new one.
        stop.current = crossOriginIsolated ? new Int32Array(new SharedArrayBuffer(4)) : null
        const message: WorkerIn =
          stop.current === null ? { type: 'generate', params } : { type: 'generate', params, stop: stop.current }
        ensure().postMessage(message)
```

- replace `abort()` with:

```ts
      abort() {
        if (!busy.current) return
        const flag = stop.current
        // First press: ask the worker to hand back what it has. Second press,
        // or no shared memory: drop the run, as a terminate always did.
        if (flag !== null && !useStore.getState().run.stopping) {
          Atomics.store(flag, 0, 1)
          actions().stopRequested()
          return
        }
        kill()
        actions().aborted()
      },
```

- update the hook's doc comment: "terminated to abort" → "asked to stop through shared memory, and terminated to discard".

In `apps/lab/src/run/useRun.ts`, the `abort()` doc becomes: `/** Asks a run in flight to stop and keep its board; a second call discards it. Does nothing with no run. */`

- [ ] **Step 8: Run the generator tests**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/worker/useGenerator.browser.test.tsx`
Expected: PASS, all cases.

- [ ] **Step 9: Commit**

```bash
git add apps/lab/src/state/run.slice.ts apps/lab/src/state/run.slice.test.ts apps/lab/src/worker/useGenerator.ts apps/lab/src/worker/useGenerator.browser.test.tsx apps/lab/src/run/useRun.ts
git commit -m "Stop: the first press keeps the board laid so far, the second discards"
```

---

### Task 4: what the page does with a stopped board

**Errata to apply: E1, E2, E3, E6.**

**Files:**
- Modify: `apps/lab/src/library/useStoreSave.ts`
- Modify: `apps/lab/src/library/useStoreSave.browser.test.tsx`
- Modify: `apps/lab/src/state/result.slice.ts` (`showResult`)
- Modify: `apps/lab/src/state/result.slice.test.ts` (create if absent; `grep -l showResult apps/lab/src/state/*.test.ts`)
- Modify: `apps/lab/src/stage/useRunState.ts`
- Modify: `apps/lab/src/stage/RunStatusBar.browser.test.tsx`
- Modify: `apps/lab/src/run/RunColumn.tsx`, `apps/lab/src/run/RunColumn.browser.test.tsx`
- Modify: `apps/lab/src/palette/commands.ts`, `apps/lab/src/palette/commands.test.ts`
- Modify: `packages/engine/lab-i18n.ts`

**Interfaces:**
- Consumes: `ReportInput.aborted`, `RunState.stopping`.
- Produces: dictionary keys `abortDiscard`, `stopping`, `stopped` (strings, no arguments).

- [ ] **Step 1: Add a fixture for a stopped run**

In `apps/lab/src/state/result.fixtures.ts`, add:

```ts
/** A finished run as a Stop leaves it: not closed, aborted. The board is a real one; only the flags differ. */
export function stoppedRun(seed: number): FinishedFixture {
  const run = finishedRun(seed)
  return { ...run, report: { ...run.report, ok: false, aborted: true } }
}
```

- [ ] **Step 2: Write the failing tests**

`useStoreSave.browser.test.tsx` — read the file's existing case first and mirror its mount; add:

```tsx
// The finished run after it proves the hook was listening: its POST arrives, the stopped one's never did.
test('a stopped board is shown but not posted to the store', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }))
  await renderHook(() => useStoreSave())
  finish(stoppedRun(1))
  finish(finishedRun(2))
  await expect.poll(() => fetch.mock.calls.length).toBeGreaterThan(0)
  expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  expect(posted(fetch).seed).toBe(2)
})
```

Import `stoppedRun` beside `finish, finishedRun`. If `StoreRequest` has no top-level `seed`, assert on the field that carries it (`grep -n "interface StoreRequest" -A12 packages/engine/types.ts`).

Result slice (node test, `apps/lab/src/state/result.slice.test.ts`; imports `finish, finishedRun, stoppedRun` from `./result.fixtures` and `useStore` from `./store`, with a `beforeEach` that resets `run` and `result` as `run.slice.test.ts` does):

```ts
test('the baseline does not move past a stopped board', () => {
  finish(finishedRun(1))
  finish(stoppedRun(2))
  finish(finishedRun(2))
  expect(useStore.getState().result.baseline?.params.seed).toBe(1)
})
```

`RunStatusBar.browser.test.tsx` — beside its closed-board case, two cases built the same way: with `stoppedRun(1)` finished, the output reads `Stopped — the arrows laid so far`; with `run.started(params)` then `run.stopRequested()`, it reads `Stopping…`.

`RunColumn.browser.test.tsx`: after `run.started(params)` and `run.stopRequested()`, the button that was named `Abort` is named `Discard` and is enabled.

`commands.test.ts`: with `run.started` and `run.stopRequested()`, the `run-abort` row's `name` is `Discard` and `disabled` is false.

- [ ] **Step 3: Run them to see them fail**

Run: `cd apps/lab && pnpm exec vitest run --project node src/state src/palette/commands.test.ts && pnpm exec vitest run --project chromium src/library/useStoreSave.browser.test.tsx src/stage/RunStatusBar.browser.test.tsx src/run/RunColumn.browser.test.tsx`
Expected: the new cases FAIL.

- [ ] **Step 4: Dictionary**

`packages/engine/lab-i18n.ts`, `EN.ui`, after `abort: 'Abort',`:

```ts
    abortDiscard: 'Discard',
```

after `aborted: 'Aborted.',`:

```ts
    stopping: 'Stopping…',
    stopped: 'Stopped — the arrows laid so far',
```

`PL.ui`, after `abort: 'Przerwij',`: `abortDiscard: 'Odrzuć',`; after `aborted: 'Przerwano.',`: `stopping: 'Zatrzymuję…',` and `stopped: 'Zatrzymano — strzałki ułożone do tej chwili',`.

- [ ] **Step 5: Implement**

`useStoreSave.ts`: after `posted.current = shown.file`, add

```ts
    // A stopped board is a look at where a run got to, not a board to keep.
    if (shown.report.aborted) return
```

and change `aborted: false,` in the request to stay as it is (the guard above makes it true by construction; its comment already says so).

`result.slice.ts`, `showResult`: the baseline condition becomes

```ts
      before !== null && before.report.metrics !== null && !before.report.aborted
```

and add to its doc comment: "nor past a stopped one, whose numbers describe a board cut short."

`useRunState.ts`, `useRunLine`: in the `run.phase === 'running'` branch, first thing:

```ts
    if (run.stopping) text = dict.t('stopping')
    else {
      ...the existing body, unchanged...
    }
```

and before `} else if (report.ok) {` add

```ts
  } else if (report.aborted) {
    reportsRun = true
    text = dict.t('stopped')
```

`RunColumn.tsx`: read `const stopping = useStore((state) => state.run.stopping)` and render the Stop button's label as `{stopping ? dict.t('abortDiscard') : dict.t('abort')}`.

`commands.ts`, the `run-abort` row: `name: state.run.stopping ? dict.t('abortDiscard') : dict.t('abort'),`.

- [ ] **Step 6: Run the tests**

Same commands as Step 3. Expected: PASS. Then `cd packages/engine && deno task test 2>&1 | tail -3` (the glossary and dictionary-shape tests).

- [ ] **Step 7: Commit**

```bash
git add packages/engine/lab-i18n.ts apps/lab/src/library/useStoreSave.ts apps/lab/src/library/useStoreSave.browser.test.tsx apps/lab/src/state apps/lab/src/stage/useRunState.ts apps/lab/src/stage/RunStatusBar.browser.test.tsx apps/lab/src/run/RunColumn.tsx apps/lab/src/run/RunColumn.browser.test.tsx apps/lab/src/palette/commands.ts apps/lab/src/palette/commands.test.ts
git commit -m "Stop: a stopped board says so, is not stored, and is no baseline"
```

---

### Task 5: `readBoardFiles`, the pure reader

**Errata to apply: E1, E3, E9.**

**Files:**
- Create: `apps/lab/src/library/readBoardFiles.ts`
- Create: `apps/lab/src/library/readBoardFiles.test.ts`
- Create: `apps/lab/src/state/file.fixtures.ts`

**Interfaces:**
- Produces:

```ts
export type OpenProblem = 'notJson' | 'noBoard' | 'twoBoards' | 'metaOther' | 'notMeta'
export type ReadOutcome =
  | { ok: true; board: BoardData; file: BoardFile; meta: BoardMeta | null; name: string }
  | { ok: false; name: string; problem: OpenProblem; reason: null }
  | { ok: false; name: string; problem: null; reason: string }
export function readBoardFiles(files: readonly File[]): Promise<ReadOutcome>
```

`name` is the board file's name, or the first file's when there is none.

- [ ] **Step 1: The fixture**

`apps/lab/src/state/file.fixtures.ts`:

```ts
import { type BoardMeta, defaultParams, encodeBoard, generate, layoutHash } from '@arrowz/engine'
import { DEFAULT_VIEW } from '@arrowz/engine/command'

/** A board file and its meta as a person would pick them from a store folder: a real carve, a real layout hash. */
export async function fileFixture(seed: number, W = 8, H = 8): Promise<{ board: File; meta: File; metaJson: BoardMeta }> {
  const params = { ...defaultParams(), W, H, seed }
  const result = generate(params)
  const file = encodeBoard(result.board)
  const id = await layoutHash(result.board)
  const metaJson: BoardMeta = {
    id,
    W,
    H,
    seed,
    params,
    view: { ...DEFAULT_VIEW, top: 0 },
    command: `deno task carve --width=${W} --height=${H} --seed=${seed}`,
    source: 'cli',
    createdAt: '2026-09-28T10:00:00.000Z',
    updatedAt: '2026-09-28T10:00:00.000Z',
    ok: result.ok,
    pieces: result.board.pieces.length,
    maxLen: result.metrics?.maxLen ?? null,
    genMs: result.genMs,
    fingerprint: file.fingerprint,
    boardBytes: null,
    svg: false,
    restarts: result.restartsUsed,
    backtracks: result.backtracks,
    aborted: false,
    stuck: result.stuck,
    sources: [],
  }
  return {
    board: new File([JSON.stringify(file)], `${id}.board.json`, { type: 'application/json' }),
    meta: new File([JSON.stringify(metaJson)], `${id}.json`, { type: 'application/json' }),
    metaJson,
  }
}
```

If the compiler rejects a field of `BoardMeta`, copy the field list from `storedFixture` in `library.fixtures.ts`, which compiles today.

- [ ] **Step 2: Write the failing tests**

`apps/lab/src/library/readBoardFiles.test.ts`:

```ts
import { expect, test } from 'vitest'
import { fileFixture } from '../state/file.fixtures'
import { readBoardFiles } from './readBoardFiles'

const json = (name: string, value: unknown) => new File([JSON.stringify(value)], name, { type: 'application/json' })

test('a lone board file opens with no meta', async () => {
  const { board } = await fileFixture(1)
  const outcome = await readBoardFiles([board])
  expect(outcome.ok).toBe(true)
  if (outcome.ok) {
    expect(outcome.meta).toBeNull()
    expect(outcome.board.W).toBe(8)
    expect(outcome.name).toBe(board.name)
  }
})

test('the meta of the same board is kept, in either order', async () => {
  const { board, meta, metaJson } = await fileFixture(1)
  for (const files of [[board, meta], [meta, board]]) {
    const outcome = await readBoardFiles(files)
    expect(outcome.ok && outcome.meta?.id).toBe(metaJson.id)
  }
})

// Matched by the layout hash, not the name: a renamed pair still opens.
test('a renamed pair still opens with its meta', async () => {
  const { board, meta, metaJson } = await fileFixture(1)
  const outcome = await readBoardFiles([
    new File([await board.text()], 'mine.board.json'),
    new File([await meta.text()], 'mine.json'),
  ])
  expect(outcome.ok && outcome.meta?.id).toBe(metaJson.id)
})

test('the meta of another board is refused', async () => {
  const one = await fileFixture(1)
  const two = await fileFixture(2)
  const outcome = await readBoardFiles([one.board, two.meta])
  expect(outcome).toMatchObject({ ok: false, problem: 'metaOther' })
})

test('a second file that is neither a board nor a meta is refused', async () => {
  const { board } = await fileFixture(1)
  expect(await readBoardFiles([board, json('x.json', { hello: 1 })])).toMatchObject({ ok: false, problem: 'notMeta' })
})

test('two board files at once are refused', async () => {
  const one = await fileFixture(1)
  const two = await fileFixture(2)
  expect(await readBoardFiles([one.board, two.board])).toMatchObject({ ok: false, problem: 'twoBoards' })
})

test('a file that is not JSON is refused and named', async () => {
  const outcome = await readBoardFiles([new File(['not json'], 'notes.txt')])
  expect(outcome).toMatchObject({ ok: false, problem: 'notJson', name: 'notes.txt' })
})

test('JSON with no board file among it is refused', async () => {
  const { meta } = await fileFixture(1)
  expect(await readBoardFiles([meta])).toMatchObject({ ok: false, problem: 'noBoard' })
})

test('a board file that does not decode keeps the decoder message', async () => {
  const { board } = await fileFixture(1)
  const broken = { ...JSON.parse(await board.text()), body: 'not-base64!!' }
  const outcome = await readBoardFiles([json('b.board.json', broken)])
  expect(outcome.ok).toBe(false)
  if (!outcome.ok) {
    expect(outcome.problem).toBeNull()
    expect(outcome.reason ?? '').not.toBe('')
  }
})

test('three files are refused as not a board and its meta', async () => {
  const { board, meta } = await fileFixture(1)
  expect(await readBoardFiles([board, meta, meta])).toMatchObject({ ok: false, problem: 'notMeta' })
})
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd apps/lab && pnpm exec vitest run --project node src/library/readBoardFiles.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement**

`apps/lab/src/library/readBoardFiles.ts`:

```ts
import { type BoardData, type BoardFile, type BoardMeta, decodeBoard, encodeBoard, layoutHash } from '@arrowz/engine'

/** Why an open failed, worded by the dictionary (`open_<problem>`). A decode failure keeps the decoder's own words. */
export type OpenProblem = 'notJson' | 'noBoard' | 'twoBoards' | 'metaOther' | 'notMeta'

export type ReadOutcome =
  | { ok: true; board: BoardData; file: BoardFile; meta: BoardMeta | null; name: string }
  | { ok: false; name: string; problem: OpenProblem; reason: null }
  | { ok: false; name: string; problem: null; reason: string }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** Enough of a store meta to load from: the id to match, and the fields Load into lab and the facts read. */
function asMeta(value: unknown): BoardMeta | null {
  if (!isObject(value)) return null
  const { id, W, H, seed, params, view, command } = value
  const shaped =
    typeof id === 'string' && typeof W === 'number' && typeof H === 'number' && typeof seed === 'number' &&
    isObject(params) && isObject(view) && typeof command === 'string'
  // The store wrote it; the checks above are what this reader relies on.
  return shaped ? (value as unknown as BoardMeta) : null
}

/**
 * One board file, and optionally its meta (the store's `<id>.json`), in any
 * order. The meta is kept only when its id is the board's layout hash, so a
 * renamed pair opens and a meta from another board is refused, not glued on.
 */
export async function readBoardFiles(files: readonly File[]): Promise<ReadOutcome> {
  const first = files[0]?.name ?? ''
  const parsed: { name: string; value: unknown }[] = []
  for (const file of files) {
    try {
      parsed.push({ name: file.name, value: JSON.parse(await file.text()) })
    } catch {
      return { ok: false, name: file.name, problem: 'notJson', reason: null }
    }
  }
  const boards = parsed.filter((entry) => isObject(entry.value) && entry.value.format === 'arrowz-board')
  const rest = parsed.filter((entry) => !boards.includes(entry))
  const found = boards[0]
  if (found === undefined) return { ok: false, name: first, problem: 'noBoard', reason: null }
  if (boards.length > 1) return { ok: false, name: found.name, problem: 'twoBoards', reason: null }
  if (rest.length > 1) return { ok: false, name: found.name, problem: 'notMeta', reason: null }
  let board: BoardData
  try {
    board = decodeBoard(found.value)
  } catch (err) {
    return { ok: false, name: found.name, problem: null, reason: err instanceof Error ? err.message : String(err) }
  }
  const extra = rest[0]
  let meta: BoardMeta | null = null
  if (extra !== undefined) {
    meta = asMeta(extra.value)
    if (meta === null) return { ok: false, name: found.name, problem: 'notMeta', reason: null }
    if (meta.id !== (await layoutHash(board))) return { ok: false, name: found.name, problem: 'metaOther', reason: null }
  }
  // Re-encoded from the decoded board: the file downloads and draws as the codec writes it.
  return { ok: true, board, file: encodeBoard(board), meta, name: found.name }
}
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/lab && pnpm exec vitest run --project node src/library/readBoardFiles.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/library/readBoardFiles.ts apps/lab/src/library/readBoardFiles.test.ts apps/lab/src/state/file.fixtures.ts
git commit -m "Open: read a board file and its meta, matched by the layout hash"
```

---

### Task 6: the file preview as a second origin

**Errata to apply: E1, E2, E3, E7, E8, E9.**

**Files:**
- Modify: `apps/lab/src/state/result.slice.ts`
- Modify: `apps/lab/src/state/library.slice.ts` (`BoardError`)
- Modify: `apps/lab/src/AppRoutes.tsx`
- Modify: `apps/lab/src/library/useOpenBoard.ts`, `useOpenPreview.ts`, `useStoredBoard.ts`, `useViewSave.ts`
- Modify: `apps/lab/src/stage/BoardFrame.tsx`, `apps/lab/src/stage/useRunState.ts`
- Create: `apps/lab/src/library/openBoardFiles.ts`
- Modify: `packages/engine/lab-i18n.ts`
- Test: `apps/lab/src/library/openBoardFiles.browser.test.tsx` (create), `apps/lab/src/library/useStoredBoard.browser.test.tsx` (modify)
- Every file the compiler names after Step 3 (`showPreview({ board, file, meta })` call sites and fixtures gain `origin: 'store'`).

**Interfaces:**
- Consumes: `readBoardFiles`, `ReadOutcome`, `OpenProblem` (Task 5).
- Produces:

```ts
// result.slice.ts
export interface StoredBoard { readonly origin: 'store'; readonly board: BoardData; readonly file: unknown; readonly meta: BoardMeta }
export interface OpenedFile { readonly origin: 'file'; readonly board: BoardData; readonly file: BoardFile; readonly meta: BoardMeta | null; readonly name: string }
export type Preview = StoredBoard | OpenedFile
// ResultState.preview: Preview | null; showPreview(next: Preview): void
// useOpenBoard(): { size: string | null; id: string | null; file: boolean }
// useOpenPreview(): OpenPreview | null
export type OpenPreview = { origin: 'store'; stored: StoredBoard; size: string } | { origin: 'file'; opened: OpenedFile }
// openBoardFiles.ts
export const FILE_ROUTE = '/boards/file'
export function openBoardFiles(files: readonly File[], navigate: (path: string) => void): Promise<void>
// library.slice.ts BoardError gains: problem?: OpenProblem
```

- [ ] **Step 1: Write the failing tests**

`apps/lab/src/library/openBoardFiles.browser.test.tsx`:

```tsx
import { beforeEach, expect, test, vi } from 'vitest'
import { fileFixture } from '../state/file.fixtures'
import { useStore } from '../state/store'
import { FILE_ROUTE, openBoardFiles } from './openBoardFiles'

beforeEach(() => {
  useStore.getState().result.reset()
  useStore.getState().library.reset()
})

test('a board file lands as a file preview at its own address', async () => {
  const { board } = await fileFixture(1)
  const navigate = vi.fn()
  await openBoardFiles([board], navigate)
  expect(navigate).toHaveBeenCalledWith(FILE_ROUTE)
  const preview = useStore.getState().result.preview
  expect(preview?.origin).toBe('file')
  expect(preview?.meta).toBeNull()
  expect(useStore.getState().library.boardError).toBeNull()
})

test('a failed open still goes to the address, with the reason on the library line', async () => {
  const navigate = vi.fn()
  await openBoardFiles([new File(['nope'], 'notes.txt')], navigate)
  expect(navigate).toHaveBeenCalledWith(FILE_ROUTE)
  expect(useStore.getState().result.preview).toBeNull()
  expect(useStore.getState().library.boardError).toMatchObject({ name: 'notes.txt', problem: 'notJson' })
})

test('a run in flight and its result are untouched by an open', async () => {
  const { board } = await fileFixture(1)
  const before = useStore.getState().result.shown
  await openBoardFiles([board], vi.fn())
  expect(useStore.getState().result.shown).toBe(before)
})
```

In `useStoredBoard.browser.test.tsx` (it already has `stubStore`, `at`, `first`), add `import { useEffect } from 'react'` and:

```tsx
/** A file preview as `openBoardFiles` leaves it, optionally with a given meta. */
function putFilePreview(meta: BoardMeta | null = null) {
  const board = decodeBoard(first.file)
  useStore.getState().result.showPreview({ origin: 'file', board, file: encodeBoard(board), meta, name: 'mine.board.json' })
}

test('at /boards/file the file preview is left alone', async () => {
  stubStore({})
  putFilePreview()
  await renderHook(() => useStoredBoard(), at('/boards/file'))
  await new Promise((done) => setTimeout(done, 50))
  expect(useStore.getState().result.preview?.origin).toBe('file')
})

// Same id on purpose: only the origin tells the file apart from the stored board.
test('a file preview with a stored board’s id is not taken for that board', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(first.file), { status: 200 })),
  )
  useStore.getState().library.listed([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [first.meta] }])
  putFilePreview(first.meta)
  await renderHook(() => useStoredBoard(), at(`/boards/8x8/${first.meta.id}`))
  await expect.poll(() => useStore.getState().result.preview?.origin).toBe('store')
  expect(fetch).toHaveBeenCalled()
})

test('leaving /boards/file clears the file preview', async () => {
  stubStore({})
  putFilePreview()
  function Leave() {
    useStoredBoard()
    const navigate = useNavigate()
    useEffect(() => {
      void navigate('/boards')
    }, [navigate])
    return null
  }
  await render(
    <MemoryRouter initialEntries={['/boards/file']}>
      <Leave />
    </MemoryRouter>,
  )
  await expect.poll(() => useStore.getState().result.preview).toBeNull()
})
```

Add `encodeBoard` and `type BoardMeta` to the file's `@arrowz/engine` import.

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/library/openBoardFiles.browser.test.tsx src/library/useStoredBoard.browser.test.tsx`
Expected: FAIL (module missing; origin missing).

- [ ] **Step 3: The union in the result slice**

In `result.slice.ts`, replace `StoredBoard` with the two interfaces and the union from **Interfaces**, keep `StoredBoard`'s doc comment on it, and give `OpenedFile` the doc: `/** A board opened from disk: the file itself, and its meta when it came along. Nothing of it is in the store. */`.
- `preview: Preview | null`, `showPreview(next: Preview): void`.
- `previewView`: only a preview with a meta has a view to change:

```ts
    previewView: (view) =>
      set((state) => {
        const preview = state.result.preview
        if (preview === null || preview.meta === null) return state
        return { result: { ...state.result, preview: { ...preview, meta: { ...preview.meta, view } } } }
      }),
```

The spread keeps `origin`, so the union narrows; if the compiler still complains, split into `preview.origin === 'store' ? {...} : {...}`.

Run: `cd apps/lab && pnpm exec tsc -b --noEmit 2>&1 | head -40` and add `origin: 'store'` at every `showPreview({ board, file, meta ... })` it names (`useStoredBoard.ts`, `useViewSave.ts`, tests and fixtures).

- [ ] **Step 4: Library error, route, address**

`library.slice.ts`: import `type OpenProblem` from `../library/readBoardFiles` and add to `BoardError`:

```ts
  /** An open from disk that failed for a reason of its own, worded at render; `reason` is then null. */
  problem?: OpenProblem
```

`AppRoutes.tsx`, after the `/boards/:size/:id` route: `<Route path="/boards/file" element={null} />`. (React Router ranks the static segment above `:size/:id`, which needs two segments anyway.)

`useOpenBoard.ts`:

```ts
export function useOpenBoard(): { size: string | null; id: string | null; file: boolean } {
  const match = useMatch('/boards/:size/:id')
  const file = useMatch('/boards/file') !== null
  return { size: match?.params.size ?? null, id: match?.params.id ?? null, file }
}
```

- [ ] **Step 5: `openBoardFiles`**

`apps/lab/src/library/openBoardFiles.ts`:

```ts
import { useStore } from '../state/store'
import { readBoardFiles } from './readBoardFiles'

/** A file preview's address. One, since a file has no size folder and no id the store knows. */
export const FILE_ROUTE = '/boards/file'

/** The one hidden file input every way of opening clicks (`BoardFileInput`). */
export const BOARD_FILE_INPUT_ID = 'board-file-input'

/**
 * Every way of opening a board file ends here. The outcome, good or bad, is
 * shown on the saved boards, whose line is where a board that cannot be read
 * is already reported; the run's own result is not touched.
 */
export async function openBoardFiles(files: readonly File[], navigate: (path: string) => void): Promise<void> {
  if (files.length === 0) return
  const outcome = await readBoardFiles(files)
  const { result, library, ui } = useStore.getState()
  library.clearNotice()
  if (outcome.ok) {
    library.boardFailed(null)
    result.showPreview({ origin: 'file', board: outcome.board, file: outcome.file, meta: outcome.meta, name: outcome.name })
  } else {
    result.clearPreview()
    library.boardFailed(
      outcome.problem === null
        ? { name: outcome.name, reason: outcome.reason }
        : { name: outcome.name, reason: null, problem: outcome.problem },
    )
  }
  ui.showBoards('list')
  navigate(FILE_ROUTE)
}
```

- [ ] **Step 6: The hooks that read the preview**

`useStoredBoard.ts`: take `file` from `useOpenBoard()`, add it to the effect's deps, and make it the effect's first line:

```ts
    // A file's preview is set by `openBoardFiles`, not fetched: nothing to do, and nothing to clear.
    if (file) return
```

and the "already drawn" check becomes

```ts
    const drawn = useStore.getState().result.preview
    if (drawn?.origin === 'store' && drawn.meta.id === id) {
```

`useOpenPreview.ts`:

```ts
import type { OpenedFile, StoredBoard } from '../state/result.slice'

export type OpenPreview = { origin: 'store'; stored: StoredBoard; size: string } | { origin: 'file'; opened: OpenedFile }

export function useOpenPreview(): OpenPreview | null {
  const preview = useStore((state) => state.result.preview)
  const open = useOpenBoard()
  if (preview === null) return null
  if (preview.origin === 'file') return open.file ? { origin: 'file', opened: preview } : null
  if (open.size === null || preview.meta.id !== open.id) return null
  return { origin: 'store', stored: preview, size: open.size }
}
```

Extend its doc comment by one line: "A file's preview is the open one only at `FILE_ROUTE`."

`useViewSave.ts`: after `const edited = useStore.getState().result.preview`, the guard becomes

```ts
    // A file's view lives on the page only: it is not in the store to write back.
    if (edited === null || edited.origin === 'file') return
```

`useRunState.ts`: the live line for the library becomes

```ts
  else if (inLibrary && preview !== null) {
    live =
      preview.origin === 'file'
        ? dict.t('openedFile', preview.name, preview.board.W, preview.board.H)
        : dict.t('savedBoard', `${preview.meta.W}x${preview.meta.H}/${preview.meta.id}`, preview.meta.seed, preview.meta.source, `${genSeconds(preview.meta, '—')} s`)
  }
```

and the library line's `boardError` text:

```ts
            text:
              boardError.problem !== undefined
                ? dict.t('boardFileError', boardError.name, dict.t(`open_${boardError.problem}`))
                : boardError.reason === null
                  ? dict.t('boardNotStored', boardError.name)
                  : dict.t('boardFileError', boardError.name, boardError.reason),
```

`BoardFrame.tsx`:
- `elementView`: a preview with no meta is drawn in the lab's view:

```ts
      preview === null || !inLibrary || preview.meta === null
        ? labView
        : { ...boardViewOf(preview.meta.view, preview.meta.ok === false), ...paletteOverride, ...colourOverride },
```

- `named`: `inLibrary && preview !== null ? (preview.meta === null ? { W: preview.board.W, H: preview.board.H, seed: null } : { W: preview.meta.W, H: preview.meta.H, seed: preview.meta.seed }) : ...` and its type allows `seed: number | null`.
- the annotation: `named.seed === null ? dict.t('boardSize', named.W, named.H) : dict.t('boardAnnotation', named.W, named.H, named.seed)`.
- `onColoredChange`: `if (preview !== null) { if (preview.meta === null) useStore.getState().view.setFlag('colored', colored); else commitView({ ...preview.meta.view, colored }) }` — a file with no meta is drawn in the lab's view, so the lab's flag is the owner.

- [ ] **Step 7: Dictionary**

`EN.ui`, beside `boardFileError`:

```ts
    openedFile: (name: string, W: number, H: number) => `File ${name}: ${W}×${H}`,
    boardSize: (W: number, H: number) => `${W}×${H}`,
    open_notJson: 'it is not JSON',
    open_noBoard: 'none of the files is a board file',
    open_twoBoards: 'two board files at once; open one',
    open_metaOther: 'the meta file belongs to another board',
    open_notMeta: 'the other file is neither a board file nor its meta',
```

`PL.ui`:

```ts
    openedFile: (name, W, H) => `Plik ${name}: ${W}×${H}`,
    boardSize: (W, H) => `${W}×${H}`,
    open_notJson: 'to nie jest JSON',
    open_noBoard: 'żaden z plików nie jest plikiem planszy',
    open_twoBoards: 'dwa pliki planszy naraz; otwórz jeden',
    open_metaOther: 'plik meta należy do innej planszy',
    open_notMeta: 'drugi plik nie jest ani plikiem planszy, ani jej meta',
```

If `dict.t(\`open_${problem}\`)` does not type-check as a `UiKey`, map explicitly: `const OPEN_TEXT = { notJson: 'open_notJson', ... } as const satisfies Record<OpenProblem, UiKey>` in `useRunState.ts`.

- [ ] **Step 8: Run the tests**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/library src/stage src/report && pnpm exec vitest run --project node`
Expected: PASS. Then `cd packages/engine && deno task test 2>&1 | tail -3`.

- [ ] **Step 9: Commit**

```bash
git add -A apps/lab/src packages/engine/lab-i18n.ts
git status --short   # only this task's files; unstage anything else
git commit -m "Open: a board file is a preview of its own origin at /boards/file"
```

---

### Task 7: the board column, the report and the Preview panel for a file

**Errata to apply: E1, E2, E3, E9, E10, E11.**

**Files:**
- Create: `apps/lab/src/library/loadIntoLab.ts`
- Create: `apps/lab/src/library/FileColumn.tsx`
- Create: `apps/lab/src/report/FileFacts.tsx`
- Create: `apps/lab/src/library/BoardFileInput.tsx`, `apps/lab/src/library/OpenFileButton.tsx` (the file column shows the button; Task 8 mounts the input and adds the other ways in)
- Modify: `apps/lab/src/library/BoardColumn.tsx`, `BoardPreview.tsx`
- Modify: `apps/lab/src/report/ReportPanel.tsx`, `StoredFacts.tsx`
- Modify: `packages/engine/lab-i18n.ts`
- Test: `apps/lab/src/library/FileColumn.browser.test.tsx` (create)

**Interfaces:**
- Consumes: `OpenPreview`, `OpenedFile`, `useOpenPreview` (Task 6).
- Produces: `openFilePicker(): void`, `BoardFileInput()`, `OpenFileButton({ className }: { className?: string })`; `loadIntoLab(meta: BoardMeta, control: RunControl, navigate: (path: string) => void): void`; `StoredFacts({ meta }: { meta: BoardMeta })`; `FileFacts({ opened }: { opened: OpenedFile })`; `FileColumn({ opened, control }: { opened: OpenedFile; control: RunControl })`.

- [ ] **Step 1: Write the failing tests**

`apps/lab/src/library/FileColumn.browser.test.tsx`:

```tsx
import { MemoryRouter } from 'react-router'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import * as download from '../run/download'
import type { RunControl } from '../run/useRun'
import { fileFixture } from '../state/file.fixtures'
import { useStore } from '../state/store'
import { BoardColumn } from './BoardColumn'
import { openBoardFiles } from './openBoardFiles'

let control: RunControl

beforeEach(() => {
  const state = useStore.getState()
  state.result.reset()
  state.library.reset()
  state.params.reset()
  state.lang.setLang('en')
  control = { start: vi.fn(), abort: vi.fn(), hold: vi.fn() }
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function mountFile(files: File[]) {
  await openBoardFiles(files, () => {})
  return render(
    <MemoryRouter initialEntries={['/boards/file']}>
      <div className="fw">
        <BoardColumn control={control} />
      </div>
    </MemoryRouter>,
  )
}

test('a file with no meta offers exports, and neither Delete nor Load into lab', async () => {
  const { board } = await fileFixture(1)
  await mountFile([board])
  await expect.element(page.getByRole('button', { name: 'Open file…' })).toBeVisible()
  expect(page.getByRole('button', { name: 'Delete from disk' }).elements()).toHaveLength(0)
  expect(page.getByRole('button', { name: 'Load into lab' }).elements()).toHaveLength(0)
})

test('with its meta, Load into lab sets the knobs and starts one run', async () => {
  const { board, meta } = await fileFixture(3)
  await mountFile([board, meta])
  await userEvent.click(page.getByRole('button', { name: 'Load into lab' }))
  expect(useStore.getState().params.values.seed).toBe(3)
  expect(control.start).toHaveBeenCalledTimes(1)
})

test('with its meta, the command is shown and there is still no Delete', async () => {
  const { board, meta, metaJson } = await fileFixture(1)
  await mountFile([board, meta])
  await expect.element(page.getByText(metaJson.command)).toBeVisible()
  expect(page.getByRole('button', { name: 'Delete from disk' }).elements()).toHaveLength(0)
})

test('Download board file hands back the file under its own name', async () => {
  const { board } = await fileFixture(1)
  const save = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {})
  await mountFile([board])
  await userEvent.click(page.getByRole('button', { name: /…|more/i }).first())
  await userEvent.click(page.getByRole('button', { name: 'Download board file' }))
  expect(save.mock.calls[0]?.[1]).toBe(board.name)
})
```

Before running, check the `MoreMenu` toggle's accessible name (`grep -n "aria-label\|dict.t" apps/lab/src/run/MoreMenu.tsx`) and use it in the last case instead of the regex. If `vi.spyOn` cannot redefine an ES module export in the browser runner, use `vi.mock('../run/download', ...)` at the top as other lab tests do (`grep -rn "vi.mock('../run/download'" apps/lab/src`).

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/library/FileColumn.browser.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Move `loadIntoLab` out**

`apps/lab/src/library/loadIntoLab.ts`:

```ts
import { type BoardMeta, readParams } from '@arrowz/engine'
import type { RunControl } from '../run/useRun'
import { useStore } from '../state/store'
import { viewFieldsOf } from '../state/view.slice'

/**
 * The knobs, then the view, then one run and the lab. `start()`, not
 * `generate()`: in the simple view that would draw new knobs over these.
 */
export function loadIntoLab(meta: BoardMeta, control: RunControl, navigate: (path: string) => void): void {
  const { params, ui, view } = useStore.getState()
  ui.raiseClamped(params.setMany(readParams(meta.params)))
  view.apply(viewFieldsOf(meta.view))
  control.start()
  navigate('/')
}
```

In `BoardColumn.tsx`, delete the local `loadIntoLab` and its comment, call `loadIntoLab(meta, control, (path) => void navigate(path))` from the button, and drop the now-unused imports (`readParams`, `viewFieldsOf`).

- [ ] **Step 4: Facts**

`StoredFacts.tsx`: the prop becomes `{ meta }: { meta: BoardMeta }` (import the type from `@arrowz/engine`), and the body's `const { meta } = stored` goes. `ReportPanel.tsx` passes `meta={open.stored.meta}`.

`apps/lab/src/report/FileFacts.tsx`:

```tsx
import type { ReactElement } from 'react'
import { useDictionary } from '../i18n'
import type { OpenedFile } from '../state/result.slice'
import { StoredFacts } from './StoredFacts'

/**
 * The report of a board opened from disk: what the file itself says, and the
 * store's facts when its meta came along. No run rows: nothing ran here.
 */
export function FileFacts({ opened }: { opened: OpenedFile }): ReactElement {
  const dict = useDictionary()
  const { board, file, meta, name } = opened
  const rows: [string, string][] = [
    [dict.t('factFile'), name],
    [dict.t('stat_board'), dict.t('boardSize', board.W, board.H)],
    [dict.t('stat_pieces'), dict.fmt(board.pieces.length)],
  ]
  if (file.unfilled > 0) rows.push([dict.t('factEmpty'), dict.fmt(file.unfilled)])
  return (
    <>
      <dl className="fw-bmeta" aria-label={dict.t('boardFacts')}>
        {rows.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd className="wrap-text">{value}</dd>
          </div>
        ))}
      </dl>
      {meta === null ? <p>{dict.t('fileNoMeta')}</p> : <StoredFacts meta={meta} />}
    </>
  )
}
```

`ReportPanel.tsx`, the library branch:

```tsx
        open === null ? null : open.origin === 'file' ? (
          <>
            <FileFacts opened={open.opened} />
            <LongestTable board={open.opened.board} stored />
          </>
        ) : (
          <>
            <StoredFacts meta={open.stored.meta} />
            <LongestTable board={open.stored.board} stored />
          </>
        )
```

- [ ] **Step 5: The file column**

`apps/lab/src/library/FileColumn.tsx`:

```tsx
import { svgOptions } from '@arrowz/engine/command'
import { type ReactElement, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useDictionary } from '../i18n'
import { CommandText } from '../run/CommandText'
import { downloadBlob } from '../run/download'
import { drawSvg } from '../run/drawSvg'
import { MoreMenu } from '../run/MoreMenu'
import type { RunControl } from '../run/useRun'
import { useRunState } from '../stage/useRunState'
import type { OpenedFile } from '../state/result.slice'
import { useStore } from '../state/store'
import { lookOf, viewOf } from '../state/view.slice'
import { BOARD_COLUMN_ID } from './BoardColumn'
import { loadIntoLab } from './loadIntoLab'
import { OpenFileButton } from './OpenFileButton'

/**
 * The board column for a board opened from disk. Not in the store, so no
 * Delete; with its meta it has a command and Load into lab, without one only
 * what the file itself carries.
 */
export function FileColumn({ opened, control }: { opened: OpenedFile; control: RunControl }): ReactElement {
  const dict = useDictionary()
  const navigate = useNavigate()
  const { library } = useRunState()
  const drawing = useRef<Worker | null>(null)
  const [busy, setBusy] = useState(false)
  const [drawError, setDrawError] = useState<string | null>(null)
  useEffect(() => () => drawing.current?.terminate(), [])
  const { meta, file, name } = opened
  const stem = name.replace(/\.board\.json$|\.json$/, '')

  const exportFile = () =>
    downloadBlob(new Blob([JSON.stringify(file)], { type: 'application/json' }), name.endsWith('.json') ? name : `${stem}.board.json`)

  // Drawn as the stage draws it: the meta's view when there is one, the lab's otherwise.
  const exportSvg = () => {
    if (drawing.current !== null) return
    setBusy(true)
    setDrawError(null)
    const look = lookOf(useStore.getState().view)
    const view = meta === null ? viewOf(useStore.getState().view) : meta.view
    drawing.current = drawSvg(
      file,
      { ...svgOptions({ ...view, ...look }), voids: meta?.ok === false },
      `${stem}.svg`,
      setDrawError,
      () => {
        drawing.current = null
        setBusy(false)
      },
    )
  }

  return (
    <section id={BOARD_COLUMN_ID} className="fw-run-col fw-bcol" aria-label={dict.t('boardDetail')}>
      {meta === null ? null : (
        <>
          <figure className="fw-cmdfig" aria-label={dict.t('boardCommand')}>
            <figcaption className="fw-cmdhd">
              <span className="caps">{dict.t('cliThisBoard')}</span>
            </figcaption>
            <pre className="fw-cmd">
              <CommandText command={meta.command} />
            </pre>
          </figure>
          <button type="button" className="fw-go" onClick={() => loadIntoLab(meta, control, (path) => void navigate(path))}>
            {dict.t('loadIntoLab')}
          </button>
        </>
      )}
      <p className={library?.bad === true ? 'fw-runstate bad' : 'fw-runstate'} aria-hidden="true">
        {library?.text ?? ''}
      </p>
      <div className="fw-alt">
        <OpenFileButton />
      </div>
      <MoreMenu>
        <div className="fw-ghost fw-exports" role="group" aria-label={dict.t('exportsGroup')}>
          <button type="button" onClick={exportSvg} disabled={busy}>
            {dict.t('downloadSvg')}
          </button>
          <button type="button" onClick={exportFile}>
            {dict.t('downloadBoardFile')}
          </button>
          {drawError === null ? null : (
            <p className="fw-export-error" role="alert">
              {`${dict.t('exportError')} ${drawError}`}
            </p>
          )}
        </div>
      </MoreMenu>
    </section>
  )
}
```

Check `svgOptions` accepts `viewOf(...)`'s type and `drawSvg`'s signature against `BoardColumn.tsx`'s call before running; mirror what compiles there. The Copy button of the stored column is left out on purpose only if it needs a timer the file column does not otherwise have — if copying the command is wanted, move `copy` into a shared `useCopy` instead of duplicating it (decide by line count: under 15 lines duplicated is acceptable; otherwise extract).

Create `BoardFileInput.tsx` and `OpenFileButton.tsx` now, with the code given in Task 8, Step 3 (the input is mounted in `App` in Task 8; the button works without it, `openFilePicker` is a no-op until then).

In `BoardColumn.tsx`, right after `const open = useOpenPreview()` and the `open === null` return:

```tsx
  if (open.origin === 'file') return <FileColumn opened={open.opened} control={control} />
```

and destructure `const { stored, size } = open` after it (the narrowing makes that valid).

`BoardPreview.tsx`: `const view = open?.origin === 'store' ? open.stored.meta.view : (open?.opened.meta?.view ?? null)`; when `open?.origin === 'file' && open.opened.meta === null`, render `<p className="fw-lib-empty">{dict.t('fileNoMeta')}</p>` in place of the stored-arrows section's rows. The rows' `commitView` already stays local for a file (Task 6's `useViewSave` guard).

- [ ] **Step 6: Dictionary**

`EN.ui`: `openFile: 'Open file…',`, `factFile: 'File',`, `factEmpty: 'Empty cells',`, `fileNoMeta: 'Opened without its meta file. Choose the board file together with its meta (the .json of the same name in the store) to get the command, the seed and Load into lab.',`
`PL.ui`: `openFile: 'Otwórz plik…',`, `factFile: 'Plik',`, `factEmpty: 'Puste pola',`, `fileNoMeta: 'Otwarta bez pliku meta. Wybierz plik planszy razem z jej meta (plik .json o tej samej nazwie w magazynie), żeby dostać komendę, ziarno i „Wczytaj do labu”.',`

Check the Polish label of Load into lab with `grep -n "loadIntoLab" packages/engine/lab-i18n.ts` and quote it exactly.

- [ ] **Step 7: Run the tests**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/library src/report && cd ../../packages/engine && deno task test 2>&1 | tail -3`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/lab/src/library apps/lab/src/report packages/engine/lab-i18n.ts
git commit -m "Open: the board column, report and Preview panel of a file"
```

---

### Task 8: the three ways in — button, drop, ⌘K

**Errata to apply: E1, E2, E3, E12, E13.**

**Files:**
- Modify: `apps/lab/src/App.tsx` (mount the input created in Task 7)
- Modify: `apps/lab/src/library/BoardColumn.tsx` (empty state), `apps/lab/src/library/BoardList.tsx` (header)
- Modify: `apps/lab/src/routes/Workspace.tsx` (drop)
- Modify: `apps/lab/src/palette/commands.ts`, `apps/lab/src/palette/commands.test.ts`
- Test: `apps/lab/src/library/openEntries.browser.test.tsx` (create)

**Interfaces:**
- Consumes: `openBoardFiles`, `FILE_ROUTE`, `BOARD_FILE_INPUT_ID` (Task 6).
- Consumes also: `BoardFileInput`, `OpenFileButton`, `openFilePicker` (created in Task 7 with the code in Step 3 below).

- [ ] **Step 1: Write the failing tests**

`apps/lab/src/library/openEntries.browser.test.tsx`:

```tsx
import { page } from 'vitest/browser'
import { afterEach, expect, test, vi } from 'vitest'
import { loadRunDone, mountApp } from '../harness/mountApp'
import { fileFixture } from '../state/file.fixtures'
import { useStore } from '../state/store'
import { BOARD_FILE_INPUT_ID, FILE_ROUTE } from './openBoardFiles'

afterEach(() => {
  vi.restoreAllMocks()
})

/** The whole lab, with its first run done, so a case starts from a quiet page. */
async function mountQuiet() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response('[]', { status: 200 })))
  await mountApp()
  await loadRunDone()
}

function dropOnStage(transfer: DataTransfer) {
  const target = document.querySelector('.fw-view')
  if (target === null) throw new Error('no tabpanel to drop on')
  target.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
}

test('choosing a file in the input opens it at /boards/file', async () => {
  const { board } = await fileFixture(1)
  await mountQuiet()
  const input = document.getElementById(BOARD_FILE_INPUT_ID)
  if (!(input instanceof HTMLInputElement)) throw new Error('no board file input')
  const transfer = new DataTransfer()
  transfer.items.add(board)
  input.files = transfer.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await expect.poll(() => window.location.pathname).toBe(FILE_ROUTE)
  expect(useStore.getState().result.preview?.origin).toBe('file')
}, 60_000)

test('Open file… clicks the one input', async () => {
  await mountQuiet()
  window.history.pushState({}, '', '/boards')
  window.dispatchEvent(new PopStateEvent('popstate'))
  const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
  await page.getByRole('button', { name: 'Open file…' }).first().click()
  expect(click).toHaveBeenCalled()
}, 60_000)

test('a file dropped on the lab opens it', async () => {
  const { board } = await fileFixture(1)
  await mountQuiet()
  const transfer = new DataTransfer()
  transfer.items.add(board)
  dropOnStage(transfer)
  await expect.poll(() => window.location.pathname).toBe(FILE_ROUTE)
}, 60_000)

test('a drop with no files changes nothing', async () => {
  await mountQuiet()
  const transfer = new DataTransfer()
  transfer.setData('text/plain', 'hello')
  dropOnStage(transfer)
  await new Promise((done) => setTimeout(done, 50))
  expect(window.location.pathname).toBe('/')
  expect(useStore.getState().result.preview).toBeNull()
}, 60_000)
```

If the `popstate` route change in the second case does not reach `BrowserRouter`, navigate the way `LayoutInvariants.browser.test.tsx` does (`grep -n "pushState" apps/lab/src/routes/LayoutInvariants.browser.test.tsx`) and copy that.

`commands.test.ts`: `buildCommands` has a row `go-open-file` named `Open file…`, not disabled; its `run()` calls `HTMLInputElement.prototype.click` on the input with id `BOARD_FILE_INPUT_ID` (mount a bare `<input id=...>` in `document.body` for the case, spy on `click`) and closes the palette.

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/library/openEntries.browser.test.tsx && pnpm exec vitest run --project node src/palette/commands.test.ts`
Expected: FAIL.

- [ ] **Step 3: Input and button (the files exist from Task 7; this is their code, then where they go)**

`apps/lab/src/library/BoardFileInput.tsx`:

```tsx
import type { ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { BOARD_FILE_INPUT_ID, openBoardFiles } from './openBoardFiles'

/** Asks the browser for board files through the one hidden input. A no-op if it is not mounted. */
export function openFilePicker(): void {
  document.getElementById(BOARD_FILE_INPUT_ID)?.click()
}

/**
 * The one file input, mounted once in `App` so a palette row can reach it as
 * a button does. `multiple`: a board file and its meta are chosen together.
 */
export function BoardFileInput(): ReactElement {
  const navigate = useNavigate()
  return (
    <input
      id={BOARD_FILE_INPUT_ID}
      type="file"
      accept=".json,application/json"
      multiple
      hidden
      onChange={(event) => {
        const input = event.currentTarget
        const files = Array.from(input.files ?? [])
        // Cleared, so choosing the same file again fires `change` again.
        input.value = ''
        void openBoardFiles(files, (path) => void navigate(path))
      }}
    />
  )
}
```

`apps/lab/src/library/OpenFileButton.tsx`:

```tsx
import type { ReactElement } from 'react'
import { useDictionary } from '../i18n'
import { openFilePicker } from './BoardFileInput'

export function OpenFileButton({ className }: { className?: string }): ReactElement {
  const dict = useDictionary()
  return (
    <button type="button" className={className} onClick={openFilePicker}>
      {dict.t('openFile')}
    </button>
  )
}
```

`App.tsx`: render `<BoardFileInput />` inside `Shell`'s root `div`, after `<CommandPalette control={control} />`.

`BoardColumn.tsx`, the `open === null` return: after `<p className="fw-lib-empty">{dict.t('openBoardHint')}</p>` add `<div className="fw-alt"><OpenFileButton /></div>`.

`BoardList.tsx`, the header: after the Refresh chip, `<OpenFileButton className="kv-chip" />`.

- [ ] **Step 4: Drop on the stage**

`Workspace.tsx`: `const navigate = useNavigate()` (import from `react-router`), and on the tabpanel `<section>`:

```tsx
        // Files only: dragging selected text is a drop too, and must not open anything.
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) event.preventDefault()
        }}
        onDrop={(event) => {
          if (event.dataTransfer.files.length === 0) return
          event.preventDefault()
          void openBoardFiles(Array.from(event.dataTransfer.files), (path) => void navigate(path))
        }}
```

- [ ] **Step 5: The ⌘K row**

`commands.ts`, in `go`, after the `go-boards` row:

```ts
    {
      id: 'go-open-file',
      section: 'go',
      name: dict.t('openFile'),
      note: dict.t('cmdSecGo'),
      value: '',
      hay: 'open file board json load disk',
      disabled: false,
      // Inside the row's own click or Enter: a file dialog opens only on a user gesture.
      run: () => {
        openFilePicker()
        state.ui.closePalette()
      },
    },
```

Import `openFilePicker` from `../library/BoardFileInput`.

- [ ] **Step 6: Run the tests**

Same commands as Step 2, then `cd apps/lab && pnpm exec vitest run --project chromium src/palette src/routes`.
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/lab/src packages/engine/lab-i18n.ts
git status --short
git commit -m "Open: a button, a drop on the stage and a ⌘K row, all through one input"
```

---

### Task 9: docs and the whole gate

**Errata to apply: E1.**

**Files:**
- Modify: `lab-review.md`
- Modify: `docs/superpowers/specs/2026-09-28-lab-stop-and-open-design.md` (only if the implementation departed from it)

- [ ] **Step 1: `lab-review.md`**

In the "Status" table: the row `| Gap 6: Stop that keeps the partial board | open | |` becomes `| Gap 6: Stop that keeps the partial board | fixed on \`lab/stop-and-open\` | a second Stop discards; a stopped board is not stored |`, and `| Gap 8: open a \`.board.json\` from disk | open | |` becomes `| Gap 8: open a \`.board.json\` from disk | fixed on \`lab/stop-and-open\` | button, drop and ⌘K; with its meta, Load into lab |`.

In "What is still open", item 4 becomes:

```markdown
4. **Parity gaps, as product decisions:** closing rate over N seeds. Pasting a
   `carve` command, Stop that keeps the partial board and opening a
   `.board.json` are done (`lab/paste-command`, `lab/stop-and-open`); the
   report rows and the ⌘K rows for the colour and element fields on
   `lab/report-parity`.
```

- [ ] **Step 2: The whole gate, in a clean worktree**

```bash
set -o pipefail
pnpm nx run-many -t verify 2>&1 | tail -25
```

Expected: every project passes. A failure is fixed in the task's own file and committed separately, not papered over.

- [ ] **Step 3: Live pass (a separate gate)**

Per the repository's measuring recipe: copy the store (`ARROWZ_BOARDS_DIR=<copy>`), `pnpm nx serve lab`, and in Chrome:
- 1000×1000 advanced, Generate, Stop after progress shows: the board laid so far appears, the line reads "Stopped — …", the saved boards gain no entry; Stop twice during a run: "Discard" then idle.
- `crossOriginIsolated` is `true` in the console.
- Open a `.board.json` from the store copy with its `<id>.json`: preview, command, Load into lab runs it; drop the board file alone on the lab: preview with the "without its meta" hint; ⌘K "Open file…" opens the dialog.
- Switch to Polish once and read each new line.
Stop the servers by port (`lsof -tiTCP:8779 -sTCP:LISTEN | xargs kill`, same for 8777), never `pkill vite`.

- [ ] **Step 4: Commit**

```bash
git add lab-review.md docs/superpowers/specs/2026-09-28-lab-stop-and-open-design.md
git commit -m "Docs: Stop keeps the board and a board file opens, both done"
```
