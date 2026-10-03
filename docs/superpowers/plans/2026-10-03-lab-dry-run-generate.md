# Lab dry-run Generate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A run in the lab writes nothing to the store unless saving was asked for: by the "save every board" switch, by ⌘G / Ctrl+G, or by the Save board button on the board on screen.

**Architecture:** The intent to save is decided once, when `useRun.start` begins a run, and travels with it: run slice (`run.save`) → `completeRun` → `ShownResult.save`. One function posts a shown board (`postShown`), used by the effect for runs that asked and by Save board for the board on screen; `result.saved` gains a `'pending'` state so a double click posts once. Keys, palette rows, the run column and the status line read the same state.

**Tech Stack:** React 19 + zustand (apps/lab), Vitest 5 (projects `node` and `chromium`), TypeScript strict with `exactOptionalPropertyTypes`, the engine's dictionary in `packages/engine/lab-i18n.ts` (Deno, built to `dist/` for the lab).

**Spec:** `docs/superpowers/specs/2026-10-03-lab-dry-run-generate-design.md`

## Global Constraints

- Everything in the repository in English; the Polish text lives only in `PL` in `packages/engine/lab-i18n.ts`, which the compiler checks against `EN`'s shape.
- The switch `ui.saveEvery` is `false` on every page load and is never written to `localStorage`.
- The text says "⌘G" on every platform (as the lab says "⌘K"); Ctrl+G is bound, not spelled.
- A stopped board is never saved, by any path.
- No `any`, no non-null assertions (`!`).
- Comments: why, once, fewest lines; ≤ 6 lines unless a module/API header (≤ 24); no history, no `file.ts:NN`. Guard: `packages/engine/comments.test.ts`.
- `apps/lab` reads the engine from `packages/engine/dist/`: after editing `lab-i18n.ts` run `pnpm nx build engine --skip-nx-cache` and grep the new key in `packages/engine/dist/lab-i18n.js` before running lab tests.
- Nx shares its cache between worktrees: run every gate with `--skip-nx-cache`.
- `nx run lab:fmt` only checks; format with `npx prettier --write <files>` in `apps/lab`.
- No attribution lines in commit messages.
- A new test case goes at the end of its file (or of the `describe` named), unless the step names the case it follows.
- Never edit anything under `packages/cli/boards/` (the user's real, git-ignored store).

## Review Focus

1. **The page load, the URL hash and Load into lab post nothing.** These are what fill the store today; a person reloading the lab expects nothing written. → Task 2, Workspace case counts POSTs from before the mount.
2. **A double click on Save board posts once.** → Task 2, `saveShown` twice while pending.
3. **Save board pressed while a new carve runs** saves the board on screen, and its late answer must not land on the next board. → Task 2, answer-after-replacement case.
4. **⌘G with the focus in a knob field, or with Alt, or held down (repeat)** starts nothing; plain ⌘G also stops the browser's "find next". → Task 5, LabLayout case with `cancelable: true` and phases recorded through `useStore.subscribe`.
5. **A fourth button in the run row at M/S (768–1279 px)** must keep the `bar-row` invariant (controls ≤ 104 px tall); in Polish the full "Zapisz planszę" breaks it, so the bar shows `saveShort`. → Task 4, Step 6 runs `LayoutInvariants` and stops if it fails.

## Setup (once, before Task 1)

```bash
cd <your worktree of lab/dry-run-generate>
pnpm --version || corepack enable pnpm
pnpm install
pnpm nx build board-element --skip-nx-cache   # builds the engine too
```

Single test files run from `apps/lab`: `pnpm vitest run --project node <path>` for `*.test.ts(x)`, `pnpm vitest run --project chromium <path>` for `*.browser.test.ts(x)`. A first chromium run in a fresh worktree can fail with "Vitest failed to find the runner": run it again before treating it as a defect.

---

### Task 1: The intent to save travels with the run

**Files:**
- Modify: `apps/lab/src/state/run.slice.ts`
- Modify: `apps/lab/src/state/result.slice.ts` (`ShownResult`, `showResult`)
- Modify: `apps/lab/src/state/store.ts` (`completeRun`)
- Modify: `apps/lab/src/state/ui.slice.ts` (`saveEvery`, `setSaveEvery`)
- Modify: `apps/lab/src/worker/useGenerator.ts` (`GeneratorHandle.start`)
- Modify: `apps/lab/src/run/useRun.ts` (`RunControl.start`, `useRun.start`)
- Modify: `apps/lab/src/state/result.fixtures.ts` (`finish`)
- Test: `apps/lab/src/state/store.test.ts`, `apps/lab/src/state/ui.slice.test.ts`, `apps/lab/src/state/preferences.browser.test.ts`, `apps/lab/src/run/useRun.browser.test.tsx`, `apps/lab/src/worker/useGenerator.browser.test.tsx`

**Interfaces:**
- Produces:
  - `RunState.save: boolean`; `RunState.started(params: Params, save?: boolean): void` (default `false`).
  - `ShownResult.save: boolean`.
  - `UiState.saveEvery: boolean`; `UiState.setSaveEvery(on: boolean): void`.
  - `GeneratorHandle.start(params: Params, save: boolean): void`.
  - `RunControl.start(opts?: { save?: boolean }): void`.
  - `finish(run: FinishedFixture, save?: boolean): void` (default `false`).

- [ ] **Step 1: Write the failing tests**

Append to `apps/lab/src/state/store.test.ts`:

```ts
// The switch can move during a long carve; the run keeps what was decided at its start.
test('the result carries the intent to save that its run started with', () => {
  useStore.getState().run.started(ONE.params, true)
  useStore.getState().ui.setSaveEvery(false)
  useStore.getState().completeRun(ONE)
  expect(useStore.getState().result.shown?.save).toBe(true)

  useStore.getState().run.started(ONE.params)
  useStore.getState().ui.setSaveEvery(true)
  useStore.getState().completeRun(ONE)
  expect(useStore.getState().result.shown?.save).toBe(false)
  useStore.getState().ui.setSaveEvery(false)
})
```

In `apps/lab/src/state/ui.slice.test.ts`, inside `describe('the switches the run column owns')`, extend the first case and add one:

```ts
  it('starts with auto off, and has no descriptions switch', () => {
    const store = slice()
    expect(store.ui.auto).toBe(false)
    expect(store.ui.saveEvery).toBe(false)
    expect(store.ui.clamped).toBe(false)
    expect(store.ui).not.toHaveProperty('help')
    expect(store.ui).not.toHaveProperty('setHelp')
  })

  it('sets the save-every switch to what it is given', () => {
    const store = slice()
    store.ui.setSaveEvery(true)
    store.ui.setSaveEvery(true)
    expect(store.ui.saveEvery).toBe(true)
    store.ui.setSaveEvery(false)
    expect(store.ui.saveEvery).toBe(false)
  })
```

Append to `apps/lab/src/state/preferences.browser.test.ts`:

```ts
// A forgotten switch must not save silently after a reload, so it is never remembered.
test('the save-every switch writes nothing to storage', () => {
  const before = JSON.stringify(Object.entries(localStorage).sort())
  useStore.getState().ui.setSaveEvery(true)
  expect(JSON.stringify(Object.entries(localStorage).sort())).toBe(before)
  useStore.getState().ui.setSaveEvery(false)
})
```

In `apps/lab/src/run/useRun.browser.test.tsx`, make the stub record the flag and add a `describe`:

```ts
function stub() {
  const calls = { start: 0, abort: 0 }
  const saves: boolean[] = []
  const generator: GeneratorHandle = {
    start: (_params, save) => {
      calls.start++
      saves.push(save)
    },
    abort: () => void calls.abort++,
  }
  const series: SeriesHandle = { start: vi.fn(), abort: vi.fn() }
  return { generator, series, saves, started: () => calls.start, aborted: () => calls.abort }
}
```

Add `state.ui.setSaveEvery(false)` to the file's `beforeEach`, then:

```ts
describe('the intent to save', () => {
  it('is off for a plain start with the switch off', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series))
    result.current.start()
    expect(g.saves).toEqual([false])
  })

  it('is on when the start asks for it, whatever the switch says', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series))
    result.current.start({ save: true })
    expect(g.saves).toEqual([true])
  })

  it('is on for every start while the switch is on', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series))
    useStore.getState().ui.setSaveEvery(true)
    result.current.start()
    result.current.start({ save: false })
    expect(g.saves).toEqual([true, true])
  })
})
```

In `apps/lab/src/worker/useGenerator.browser.test.tsx` change the helper and every direct call to pass the flag, then add one case:

```ts
const start = (params: Parameters<GeneratorHandle['start']>[0]) => (g: GeneratorHandle) => g.start(params, false)
```

Every `g.start({ ... })` and `handle().start({ ... })` in the file (lines near 107, 129, 148, 168, 234, 236, 255, 258) gets `, false` as a second argument. New case, next to the other `mountHandle` cases (check the file already imports `act`, `defaultParams` and `useStore`; add what is missing):

```ts
test('a start hands the run slice its intent to save', async () => {
  const handle = await mountHandle()
  await act(async () => handle().start({ ...defaultParams(), W: 8, H: 8, seed: 1 }, true))
  expect(useStore.getState().run.save).toBe(true)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 20_000 }).toBe('done')
  expect(useStore.getState().result.shown?.save).toBe(true)
}, 30_000)
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/lab
pnpm vitest run --project node src/state/store.test.ts src/state/ui.slice.test.ts
pnpm vitest run --project chromium src/run/useRun.browser.test.tsx src/state/preferences.browser.test.ts src/worker/useGenerator.browser.test.tsx
```

Expected: FAIL (`setSaveEvery is not a function` — in useRun's `beforeEach`, so every case there; `shown.save`/`run.save` undefined).

- [ ] **Step 3: Implement**

`apps/lab/src/state/run.slice.ts` — add the field, its doc, the `EMPTY` value and the parameter:

```ts
  /** The parameters this run was started with — not the knobs on screen. */
  params: Params | null
  /** Whether the board this run makes is to be saved, decided when it started (`useRun.start`). */
  save: boolean
```

```ts
  started(params: Params, save?: boolean): void
```

```ts
const EMPTY = {
  phase: 'idle',
  params: null,
  save: false,
  progress: null,
  message: null,
  wasAborted: false,
  stopping: false,
} as const
```

```ts
    started: (params, save = false) => patch({ ...EMPTY, phase: 'running', params, save }),
```

`apps/lab/src/state/result.slice.ts` — `ShownResult` and `showResult`:

```ts
  /** What this board was made from — not the knobs on screen, and not a run in flight. */
  readonly params: Params
  /** Its run was asked to save it: the switch, ⌘G. Save board saves a board without it. */
  readonly save: boolean
}
```

```ts
    shown: {
      board: next.board,
      file: next.file,
      report: reportInputOf(next.report),
      params: next.params,
      save: next.save,
    },
```

`apps/lab/src/state/store.ts` — `completeRun`:

```ts
      return { run: runDone(state.run), result: showResult(state.result, { ...done, params, save: state.run.save }) }
```

`apps/lab/src/state/ui.slice.ts` — interface (after `auto`), initial value (after `auto: false`) and setter (after `setAuto`):

```ts
  /** Generate 350 ms after a knob is edited. Off at first. */
  auto: boolean
  /** Save every finished board. Off at every load and never remembered: a forgotten switch must not save. */
  saveEvery: boolean
```

```ts
  setAuto(on: boolean): void
  setSaveEvery(on: boolean): void
```

```ts
    auto: false,
    saveEvery: false,
```

```ts
    setAuto: (auto) => patch({ auto }),
    setSaveEvery: (saveEvery) => patch({ saveEvery }),
```

`apps/lab/src/worker/useGenerator.ts`:

```ts
export interface GeneratorHandle {
  start(params: Params, save: boolean): void
  abort(): void
}
```

```ts
      start(params, save) {
        if (busy.current) kill()
        actions().started(params, save)
```

`apps/lab/src/run/useRun.ts` — the interface and `start`:

```ts
export interface RunControl {
  /**
   * Starts a run from the knobs as they stand. Refuses while a rule is broken or a series runs.
   * The board is saved when `save` asks or the switch (`ui.saveEvery`) is on, decided now.
   */
  start(opts?: { save?: boolean }): void
```

```ts
  const start = useCallback(
    (opts?: { save?: boolean }) => {
      // Before the refusal, not after: a refused trigger must still clear the
      // timer, or the debounce fires into the same refusal a moment later.
      cancel.current?.()
      const state = useStore.getState()
      // Silent here: `RunStatusBar` speaks the refusal and `Violations` states
      // the rule, so a log here would be a second voice. A series keeps the cores.
      if (state.params.violations.length > 0 || state.series.phase === 'running') return
      generator.start(state.params.values, opts?.save === true || state.ui.saveEvery)
    },
    [generator],
  )
```

`apps/lab/src/state/result.fixtures.ts`:

```ts
/** Starts the run and finishes it, as `useGenerator` does for a real worker. */
export function finish(run: FinishedFixture, save = false): void {
  const state = useStore.getState()
  state.run.started(run.params, save)
  state.completeRun(run)
}
```

- [ ] **Step 4: Run the tests to verify they pass, and the type check**

```bash
cd apps/lab
pnpm vitest run --project node src/state/store.test.ts src/state/ui.slice.test.ts
pnpm vitest run --project chromium src/run/useRun.browser.test.tsx src/state/preferences.browser.test.ts src/worker/useGenerator.browser.test.tsx
cd ../.. && pnpm nx run lab:check --skip-nx-cache
```

Expected: PASS; `lab:check` clean. Behaviour is unchanged so far: `useStoreSave` still posts every board.

- [ ] **Step 5: Commit**

```bash
cd apps/lab && npx prettier --write src/state src/run/useRun.ts src/run/useRun.browser.test.tsx src/worker && cd ../..
git add apps/lab/src/state apps/lab/src/run/useRun.ts apps/lab/src/run/useRun.browser.test.tsx apps/lab/src/worker
git commit -m "lab: a run carries the intent to save, decided when it starts"
```

---

### Task 2: One way to save, and only when asked

**Files:**
- Modify: `packages/engine/lab-i18n.ts` (EN and PL `ui`: the keys below, `storeEmpty`)
- Create: `apps/lab/src/library/saveShown.ts`
- Create: `apps/lab/src/library/saveShown.test.ts`
- Modify: `apps/lab/src/library/useStoreSave.ts`
- Modify: `apps/lab/src/state/result.slice.ts` (`saved`, `saving`)
- Test: `apps/lab/src/library/useStoreSave.browser.test.tsx`, `apps/lab/src/state/result.slice.test.ts`, `apps/lab/src/routes/Workspace.browser.test.tsx`

**Interfaces:**
- Consumes: `ShownResult.save`, `finish(run, save)`, `ui.setSaveEvery` (Task 1).
- Produces:
  - `ResultState.saved: SaveOutcome | 'pending' | null`; `ResultState.saving(file: BoardFile): void`.
  - `type SaveRefusal = 'saveNoBoard' | 'saveStopped' | 'savePending' | 'saveDone'`.
  - `saveRefusal(state: Store): SaveRefusal | null`.
  - `postShown(shown: ShownResult): void`.
  - `saveShown(): void`.
  - Dictionary `ui` keys (EN / PL): `saveBoard`, `saveShort`, `saveEvery`, `generateAndSave`, `notSavedDryRun`, `saving`, `saveNoBoard`, `saveStopped`, `savePending`, `saveDone`.

- [ ] **Step 1: Add the dictionary keys and rebuild the engine**

In `packages/engine/lab-i18n.ts`, `EN.ui`, after `savedOldStore`:

```ts
    saveBoard: 'Save board',
    saveShort: 'Save',
    saveEvery: 'save every board',
    generateAndSave: 'Generate and save',
    notSavedDryRun: 'not saved (⌘G or Save board)',
    saving: 'saving…',
    saveNoBoard: 'No board to save yet',
    saveStopped: 'A stopped board is not saved',
    savePending: 'Saving…',
    saveDone: 'This board is saved',
```

and replace `storeEmpty`:

```ts
    storeEmpty: 'The store is empty. Save a board in the lab (Save board or ⌘G) or run deno task carve.',
```

In `PL.ui`, after its `savedOldStore`:

```ts
    saveBoard: 'Zapisz planszę',
    saveShort: 'Zapisz',
    saveEvery: 'zapisuj każdą planszę',
    generateAndSave: 'Generuj i zapisz',
    notSavedDryRun: 'nie zapisano (⌘G albo Zapisz planszę)',
    saving: 'zapisywanie…',
    saveNoBoard: 'Nie ma jeszcze planszy do zapisania',
    saveStopped: 'Zatrzymanej planszy się nie zapisuje',
    savePending: 'Zapisywanie…',
    saveDone: 'Ta plansza jest zapisana',
```

```ts
    storeEmpty:
      'Magazyn jest pusty. Zapisz planszę w laboratorium (Zapisz planszę albo ⌘G) albo uruchom deno task carve.',
```

```bash
cd packages/engine && deno fmt lab-i18n.ts && deno task verify && cd ../..
pnpm nx build engine --skip-nx-cache
grep -c "notSavedDryRun" packages/engine/dist/lab-i18n.js   # expect 2
```

If a test pins the old `storeEmpty` text (`grep -rn "Generate a board in the lab" apps packages --include='*.ts*'`), update it to the new text in this step.

- [ ] **Step 2: Write the failing tests**

`apps/lab/src/library/saveShown.test.ts` (node project):

```ts
import { beforeEach, expect, test } from 'vitest'
import { finish, finishedRun, stoppedRun } from '../state/result.fixtures'
import { storedFixture } from '../state/library.fixtures'
import { useStore } from '../state/store'
import { saveRefusal } from './saveShown'

const ONE = finishedRun(1)

beforeEach(() => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
})

test('refuses with no board, then allows the board on screen', () => {
  expect(saveRefusal(useStore.getState())).toBe('saveNoBoard')
  finish(ONE)
  expect(saveRefusal(useStore.getState())).toBeNull()
})

test('refuses a stopped board', () => {
  finish(stoppedRun(1))
  expect(saveRefusal(useStore.getState())).toBe('saveStopped')
})

test('refuses while a save of the board is pending, and once the store said ok', () => {
  finish(ONE)
  useStore.getState().result.saving(ONE.file)
  expect(saveRefusal(useStore.getState())).toBe('savePending')
  useStore
    .getState()
    .result.stored(ONE.file, { ok: true, meta: storedFixture(1).meta, layoutExisted: false, recipeExisted: false })
  expect(saveRefusal(useStore.getState())).toBe('saveDone')
})

// A missing store server is worth a second try.
test('allows a retry after a failed save', () => {
  finish(ONE)
  useStore.getState().result.stored(ONE.file, { ok: false, error: 'no store server' })
  expect(saveRefusal(useStore.getState())).toBeNull()
})
```

Append to `apps/lab/src/state/result.slice.test.ts`:

```ts
test('saving marks the shown board pending, and is dropped for a board no longer shown', () => {
  finish(ONE)
  result().saving({ ...ONE.file })
  expect(result().saved).toBeNull()
  result().saving(ONE.file)
  expect(result().saved).toBe('pending')
  finish(TWO)
  expect(result().saved).toBeNull()
})
```

Replace the body of `apps/lab/src/library/useStoreSave.browser.test.tsx` below `posted()` with these cases (keep the imports, add `postShown`/`saveShown` from `./saveShown`):

```ts
/** Every POST the spy saw. */
const posts = (fetch: MockInstance<typeof globalThis.fetch>) =>
  fetch.mock.calls.filter(([, init]) => init?.method === 'POST')

// A fresh run states its own outcome, so it must not keep a stored `aborted`
// from an earlier, cut-short save of the same recipe.
test('a run that asked to save posts once, with metrics.aborted false', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }))
  await renderHook(() => useStoreSave())
  await act(async () => finish(finishedRun(1), true))
  await expect.poll(() => posts(fetch).length).toBe(1)
  expect(posted(fetch).metrics?.aborted).toBe(false)
})

// The run after it proves the hook was listening: its POST arrives, the dry run's never did.
test('a dry run is shown and not posted', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }))
  await renderHook(() => useStoreSave())
  // Each in its own commit: in one, the effect would see only the second.
  await act(async () => finish(finishedRun(1)))
  await act(async () => finish(finishedRun(2), true))
  await expect.poll(() => posts(fetch).length).toBe(1)
  expect(posted(fetch).params.seed).toBe(2)
})

test('a stopped board is not posted even when its run asked', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }))
  await renderHook(() => useStoreSave())
  await act(async () => finish(stoppedRun(1), true))
  await act(async () => finish(finishedRun(2), true))
  await expect.poll(() => posts(fetch).length).toBe(1)
  expect(posted(fetch).params.seed).toBe(2)
})

test('Save board posts the board on screen, with no new run, and once while pending', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  finish(finishedRun(1))
  const shown = useStore.getState().result.shown?.file
  saveShown()
  saveShown()
  expect(posts(fetch)).toHaveLength(1)
  expect(useStore.getState().result.saved).toBe('pending')
  expect(useStore.getState().result.shown?.file).toBe(shown)
  expect(useStore.getState().run.phase).toBe('done')
})

// Save board pressed during a carve: the answer is the old board's, and the new one must not wear it.
test('a late answer for a replaced board is dropped', async () => {
  let answer = (_response: Response) => {}
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    () =>
      new Promise<Response>((done) => {
        answer = done
      }),
  )
  finish(finishedRun(1))
  saveShown()
  finish(finishedRun(2))
  answer(new Response('{}', { status: 201 }))
  await new Promise((done) => setTimeout(done, 50))
  expect(useStore.getState().result.saved).toBeNull()
})

test('postShown posts the board it is handed', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }))
  finish(finishedRun(3))
  const shown = useStore.getState().result.shown
  if (shown === null) throw new Error('no board on screen')
  postShown(shown)
  expect(posted(fetch).params.seed).toBe(3)
})
```

(`MockInstance` is already imported in that file. The existing `finish(stoppedRun(1))` case is replaced by the two above.)

In `apps/lab/src/routes/Workspace.browser.test.tsx`:

1. `savedAfter` answers "the store has answered", which `'pending'` is not:

```ts
/**
 * Whether the store has answered for a board other than `before`. `saved` alone
 * cannot say it: a run in flight keeps the last result and its answer, so right
 * after a press `saved` still describes the board before it; `'pending'` is no answer yet.
 */
function savedAfter(before: unknown): boolean {
  const { shown, saved } = useStore.getState().result
  return shown !== null && shown.file !== before && saved !== null && saved !== 'pending'
}
```

2. Replace the case `'a finished run is offered to the store once per run, and the outcome is appended'` with:

```tsx
// Under StrictMode, whose double-invoked mount effect is what the save guard's
// ref survives. The spy goes on before the mount, so the load run is counted
// too; spied, not stubbed, so the POST still fails for real.
test('a run is saved only when asked, once per run, and the outcome is appended', async () => {
  await clearOfTheDrawer()
  resetApp('advanced')
  const fetchSpy = vi.spyOn(window, 'fetch')
  // The method is part of the predicate: `listBoards()` GETs this same address.
  const posts = () =>
    fetchSpy.mock.calls.filter((call) => String(call[0]) === '/api/boards' && call[1]?.method === 'POST')
  try {
    const screen = await render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    await loadRunDone()
    const generate = screen.getByRole('button', { name: 'Generate' })
    const status = screen.getByRole('status', { name: 'Run status' })

    // The switch is off: Generate is a dry run.
    const loaded = useStore.getState().result.shown?.file
    await generate.click()
    await expect
      .poll(() => useStore.getState().result.shown?.file !== loaded && useStore.getState().run.phase === 'done', {
        timeout: 30_000,
      })
      .toBe(true)

    // The switch on. The guard keys on the file object's identity, not its
    // value: the second press carves an equal board, which must post again.
    useStore.getState().ui.setSaveEvery(true)
    const dry = useStore.getState().result.shown?.file
    await generate.click()
    await expect.poll(() => savedAfter(dry), { timeout: 30_000 }).toBe(true)
    // The load run and the dry run posted nothing.
    expect(posts()).toHaveLength(1)
    await expect
      .element(status, { timeout: 5_000 })
      .toMatchTextContent(/^Board complete: every cell filled\. — (not )?saved/)
    const first = useStore.getState().result.shown?.file
    await generate.click()
    await expect.poll(() => savedAfter(first), { timeout: 20_000 }).toBe(true)
    expect(posts()).toHaveLength(2)
  } finally {
    fetchSpy.mockRestore()
  }
}, 60_000)
```

3. In `'the saved board carries the view on screen'`, replace the preamble that waits for the load run's save:

```tsx
  const screen = await mountApp()
  // The load run is a dry run and posts nothing, so the spy's window holds this case's POST alone.
  await loadRunDone()
  const fetchSpy = vi.spyOn(window, 'fetch')
```

and set the switch before the press:

```tsx
    const loaded = useStore.getState().result.shown?.file
    useStore.getState().ui.setSaveEvery(true)
    await screen.getByRole('button', { name: 'Generate' }).click()
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd apps/lab
pnpm vitest run --project node src/library/saveShown.test.ts src/state/result.slice.test.ts
pnpm vitest run --project chromium src/library/useStoreSave.browser.test.tsx src/routes/Workspace.browser.test.tsx
```

Expected: FAIL (`./saveShown` missing, `saving` not a function, the dry run posts).

- [ ] **Step 4: Implement**

`apps/lab/src/state/result.slice.ts` — the field, the action and its implementation:

```ts
  /** The store's answer for `shown.file`, or `'pending'` while one is awaited; for no other file. */
  saved: SaveOutcome | 'pending' | null
```

```ts
  stored(file: BoardFile, outcome: SaveOutcome): void
  /** A save of `file` has gone out; a no-op for a file no longer shown, as `stored` is. */
  saving(file: BoardFile): void
```

```ts
    stored: (file, saved) =>
      set((state) => (state.result.shown?.file === file ? { result: { ...state.result, saved } } : state)),
    saving: (file) =>
      set((state) =>
        state.result.shown?.file === file ? { result: { ...state.result, saved: 'pending' as const } } : state,
      ),
```

`apps/lab/src/library/saveShown.ts`:

```ts
import { storeRequest } from '@arrowz/engine/command'
import { exportCell } from '@arrowz/engine/simple'
import { saveBoard } from '../api/boards'
import type { ShownResult } from '../state/result.slice'
import { type Store, useStore } from '../state/store'
import { viewOf } from '../state/view.slice'

/** Why Save board is off, as a dictionary key; each is also the button's title. */
export type SaveRefusal = 'saveNoBoard' | 'saveStopped' | 'savePending' | 'saveDone'

/**
 * Save board's rule. A stopped board is a look at where a run got to, not a
 * board to keep. A failed save is not refused: it can be tried again.
 */
export function saveRefusal(state: Store): SaveRefusal | null {
  const { shown, saved } = state.result
  if (shown === null) return 'saveNoBoard'
  if (shown.report.aborted) return 'saveStopped'
  if (saved === 'pending') return 'savePending'
  if (saved !== null && saved.ok) return 'saveDone'
  return null
}

/**
 * Posts `shown` to the store and hands the answer to the result slice, which
 * drops it for a board no longer on screen. `top` zeroed: a saved board is a
 * picture, and the highlight is a reading aid for this run. `cell` comes from
 * the board's size (`exportCell`, as `buildCommand` does), not from the slice,
 * so the preview field a user just set is not overwritten.
 */
export function postShown(shown: ShownResult): void {
  const { file, params, report } = shown
  const view = { ...viewOf(useStore.getState().view), top: 0, cell: exportCell(params.W, params.H) }
  const request = storeRequest(file, params, view, 'lab', {
    ok: report.ok,
    pieces: report.pieces,
    maxLen: report.metrics?.maxLen ?? null,
    genMs: report.genMs,
    restarts: report.restartsUsed,
    backtracks: report.backtracks,
    stuck: report.stuck,
    // Only a finished board is posted: it is never the abort a stored recipe
    // might carry from an earlier, cut-short save.
    aborted: false,
  })
  useStore.getState().result.saving(file)
  void saveBoard(request).then((outcome) => useStore.getState().result.stored(file, outcome))
}

/** Save board and its palette row: the board on screen, unless `saveRefusal` names a reason. */
export function saveShown(): void {
  const state = useStore.getState()
  const shown = state.result.shown
  if (shown === null || saveRefusal(state) !== null) return
  postShown(shown)
}
```

`apps/lab/src/library/useStoreSave.ts` — the whole file becomes:

```ts
import type { BoardFile } from '@arrowz/engine'
import { useEffect, useRef } from 'react'
import { useStore } from '../state/store'
import { postShown } from './saveShown'

/**
 * Saves each shown result whose run asked for it (the switch, ⌘G) once.
 * Subscribes to one field, not the slice, so a progress message does not
 * re-render the shell. The guard keys on the file object's identity, fresh per
 * run even for the same board, so two saved runs of one seed save twice. It is
 * a ref so it survives StrictMode's double-invoked mount effect.
 */
export function useStoreSave() {
  const shown = useStore((state) => state.result.shown)
  const posted = useRef<BoardFile | null>(null)
  useEffect(() => {
    if (shown === null || posted.current === shown.file) return
    posted.current = shown.file
    // A stopped board is a look at where a run got to, not a board to keep.
    if (!shown.save || shown.report.aborted) return
    postShown(shown)
  }, [shown])
}
```

`useRunLine` (`apps/lab/src/stage/useRunState.ts`) passes `saved` to `saveText(dict, saved: SaveOutcome)`; `'pending'` no longer fits. Keep it compiling in this task with the smallest change, which Task 3 replaces:

```ts
  const answer = !reportsRun || saved === null || saved === 'pending' ? '' : ` — ${saveText(dict, saved)}`
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd apps/lab
pnpm vitest run --project node src/library/saveShown.test.ts src/state/result.slice.test.ts src/state/store.test.ts
pnpm vitest run --project chromium src/library/useStoreSave.browser.test.tsx src/routes/Workspace.browser.test.tsx src/stage/RunStatusBar.browser.test.tsx
cd ../.. && pnpm nx run lab:check --skip-nx-cache
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd apps/lab && npx prettier --write src/library src/state src/stage/useRunState.ts src/routes/Workspace.browser.test.tsx && cd ../..
git add packages/engine/lab-i18n.ts apps/lab/src/library apps/lab/src/state apps/lab/src/stage/useRunState.ts apps/lab/src/routes/Workspace.browser.test.tsx
git commit -m "lab: save a board only when its run asked, through one posting path"
```

---

### Task 3: The status line says when a board was not saved

**Files:**
- Modify: `apps/lab/src/stage/useRunState.ts` (`saveText`, `useRunLine`)
- Test: `apps/lab/src/stage/RunStatusBar.browser.test.tsx`

**Interfaces:**
- Consumes: `ShownResult.save`, `result.saved` with `'pending'`, dictionary keys `notSavedDryRun`, `saving` (Tasks 1–2).

- [ ] **Step 1: Write the failing tests**

In `apps/lab/src/stage/RunStatusBar.browser.test.tsx`, replace the end of `'does not carry the answer for one board onto the next'` (the `next` board now starts asked to save, so its line reads "saving…" and not the first board's answer):

```tsx
    const next = { ...CLOSED, board: { ...CLOSED.board } }
    await act(async () => {
      useStore.getState().run.started(useStore.getState().params.values, true)
      useStore.getState().completeRun({ board: RESULT.board, file: next.board, report: next })
    })
    await expect.poll(() => screen.getByRole('status').element().textContent).toBe(`${EN.t('closed')} — ${EN.t('saving')}`)
```

Add to the `describe('RunStatusBar')` block:

```tsx
  // The whole text: `toMatchTextContent` matches a substring.
  it('says a dry run was not saved, and how to save it', async () => {
    const state = useStore.getState()
    state.run.started(state.params.values)
    state.completeRun({ board: RESULT.board, file: CLOSED.board, report: CLOSED })
    const screen = await mountBar()
    await expect
      .poll(() => screen.getByRole('status').element().textContent)
      .toBe(`${EN.t('closed')} — ${EN.t('notSavedDryRun')}`)
  })

  it('says it in Polish too', async () => {
    const PL = dictionary('pl')
    useStore.setState((s) => ({ lang: { ...s.lang, lang: 'pl' } }))
    const state = useStore.getState()
    state.run.started(state.params.values)
    state.completeRun({ board: RESULT.board, file: CLOSED.board, report: CLOSED })
    const screen = await mountBar()
    await expect
      .poll(() => screen.getByRole('status').element().textContent)
      .toBe(`${PL.t('closed')} — ${PL.t('notSavedDryRun')}`)
  })

  // Between `completeRun` and `useStoreSave`'s effect nothing has gone out yet;
  // the line must not say "not saved" for that frame.
  it('says saving for a run that asked, before and while its save is pending', async () => {
    const state = useStore.getState()
    state.run.started(state.params.values, true)
    state.completeRun({ board: RESULT.board, file: CLOSED.board, report: CLOSED })
    const screen = await mountBar()
    const text = () => screen.getByRole('status').element().textContent
    await expect.poll(text).toBe(`${EN.t('closed')} — ${EN.t('saving')}`)
    await act(async () => useStore.getState().result.saving(CLOSED.board))
    await expect.poll(text).toBe(`${EN.t('closed')} — ${EN.t('saving')}`)
  })

  it('appends nothing to a stopped board, which cannot be saved', async () => {
    finish(stoppedRun(1))
    const screen = await mountBar()
    await expect.poll(() => screen.getByRole('status').element().textContent).toBe(EN.t('stopped'))
  })
```

(`finish` and `stoppedRun` are already imported in this file.)

In `apps/lab/src/routes/Workspace.browser.test.tsx`, case `'a run is saved only when asked, once per run, and the outcome is appended'` (Task 2), after the poll that waits for the dry run's board, add what the line says about it:

```tsx
    await expect
      .element(status, { timeout: 5_000 })
      .toMatchTextContent(/^Board complete: every cell filled\. — not saved \(⌘G or Save board\)$/)
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/lab && pnpm vitest run --project chromium src/stage/RunStatusBar.browser.test.tsx
```

Expected: FAIL — the dry run's line is `Board complete: every cell filled.` with nothing appended, and the asked run's line has no "saving…".

- [ ] **Step 3: Implement**

`apps/lab/src/stage/useRunState.ts` — `saveText` takes the three states:

```ts
/** The store's part of the run's line: a dry run, a save on its way, or the answer. */
function saveText(dict: Dict, saved: SaveOutcome | 'pending' | null, asked: boolean): string {
  // `asked` with no answer is the frame before `useStoreSave`'s effect posts.
  if (saved === 'pending' || (saved === null && asked)) return dict.t('saving')
  if (saved === null) return dict.t('notSavedDryRun')
  if (!saved.ok) return dict.t(saved.stale === true ? 'savedOldStore' : 'notSaved')
  if (!saved.layoutExisted) return dict.t('saved')
  return dict.t(saved.recipeExisted ? 'savedKnownRecipe' : 'savedKnownLayout')
}
```

In `useRunLine`, beside the other selectors:

```ts
  const asked = useStore((state) => state.result.shown?.save ?? false)
```

and the appended part (replacing Task 2's interim line and its comment):

```ts
  // The store's answer is appended, never substituted: a missing store must not
  // overwrite what the run reported. Only the branches that report a board this
  // run produced set `reportsRun`; a stopped board has nothing to say, it cannot be saved.
  const answer = !reportsRun || report === null || report.aborted ? '' : ` — ${saveText(dict, saved, asked)}`
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/lab && pnpm vitest run --project chromium src/stage/RunStatusBar.browser.test.tsx src/run/RunColumn.browser.test.tsx src/routes/Workspace.browser.test.tsx
cd ../.. && pnpm nx run lab:check --skip-nx-cache
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd apps/lab && npx prettier --write src/stage src/routes/Workspace.browser.test.tsx && cd ../..
git add apps/lab/src/stage apps/lab/src/routes/Workspace.browser.test.tsx
git commit -m "lab: the run line says a dry run was not saved, and saving while a save is on its way"
```

---

### Task 4: Save board and the switch in the run column

**Files:**
- Modify: `apps/lab/src/run/RunColumn.tsx`
- Test: `apps/lab/src/run/RunColumn.browser.test.tsx`

**Interfaces:**
- Consumes: `saveRefusal`, `saveShown` (`library/saveShown.ts`), `ui.saveEvery`, `ui.setSaveEvery`, keys `saveBoard`, `saveShort`, `saveEvery` and the four refusals.

- [ ] **Step 1: Write the failing tests**

In `apps/lab/src/run/RunColumn.browser.test.tsx`: add imports

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { storedFixture } from '../state/library.fixtures'
import { finish, finishedRun, stoppedRun } from '../state/result.fixtures'
```

add `state.ui.setSaveEvery(false)` to `beforeEach`, add `afterEach(() => vi.restoreAllMocks())`, and replace the switch case:

```tsx
  // Only visible here: the column's switches are the store's fields, not local state.
  // A knob row opens its own description with its `?`, so no descriptions switch.
  it('flips auto and save-every from their switches, and has no descriptions switch', async () => {
    const screen = await render(<RunColumn control={stub().control} />)
    await screen.getByRole('switch', { name: 'generate right after a change' }).click()
    expect(useStore.getState().ui.auto).toBe(true)
    await screen.getByRole('switch', { name: 'save every board' }).click()
    expect(useStore.getState().ui.saveEvery).toBe(true)
    expect(screen.getByRole('switch').elements()).toHaveLength(2)
  })

  // Auto-run is a knob's companion, so the simple view has none; saving is not.
  it('keeps the save-every switch in the simple view', async () => {
    useStore.getState().ui.setMode('simple')
    const screen = await render(<RunColumn control={stub().control} />)
    await expect.element(screen.getByRole('switch', { name: 'save every board' })).toBeInTheDocument()
    expect(screen.getByRole('switch').elements()).toHaveLength(1)
    await expect.element(screen.getByRole('button', { name: 'Save board' })).toBeInTheDocument()
  })
```

and a new `describe` after `'the alternative actions'`:

```tsx
describe('Save board', () => {
  const save = (screen: Awaited<ReturnType<typeof render>>) =>
    buttonOf(screen.getByRole('button', { name: 'Save board' }).element())

  it('is off with no board, and says why', async () => {
    const screen = await render(<RunColumn control={stub().control} />)
    expect(save(screen).disabled).toBe(true)
    expect(save(screen).title).toBe('No board to save yet')
  })

  // The bar shows the short word; the accessible name is the full one and contains it.
  it('shows a short label and keeps the full name, in both languages', async () => {
    const screen = await render(<RunColumn control={stub().control} />)
    expect(save(screen).textContent).toBe('Save')
    await act(async () => useStore.setState((s) => ({ lang: { ...s.lang, lang: 'pl' } })))
    const pl = buttonOf(screen.getByRole('button', { name: 'Zapisz planszę' }).element())
    expect(pl.textContent).toBe('Zapisz')
    await act(async () => useStore.setState((s) => ({ lang: { ...s.lang, lang: 'en' } })))
  })

  // Read once after the click: a poll would wait out the pending state (the fetch never answers).
  it('saves the board on screen without a run, and is off while the save is pending', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
    const g = stub()
    finish(finishedRun(1))
    const screen = await render(<RunColumn control={g.control} />)
    expect(save(screen).disabled).toBe(false)
    await screen.getByRole('button', { name: 'Save board' }).click()
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
    expect(g.started()).toBe(0)
    await expect.poll(() => save(screen).disabled).toBe(true)
    expect(save(screen).title).toBe('Saving…')
  })

  it('is off for a stopped board', async () => {
    finish(stoppedRun(1))
    const screen = await render(<RunColumn control={stub().control} />)
    expect(save(screen).disabled).toBe(true)
    expect(save(screen).title).toBe('A stopped board is not saved')
  })

  it('is off once the store took the board, and on again after a failed save', async () => {
    const run = finishedRun(1)
    finish(run)
    useStore
      .getState()
      .result.stored(run.file, { ok: true, meta: storedFixture(1).meta, layoutExisted: false, recipeExisted: false })
    const screen = await render(<RunColumn control={stub().control} />)
    expect(save(screen).disabled).toBe(true)
    expect(save(screen).title).toBe('This board is saved')
    await act(async () => useStore.getState().result.stored(run.file, { ok: false, error: 'no store server' }))
    await expect.poll(() => save(screen).disabled).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/lab && pnpm vitest run --project chromium src/run/RunColumn.browser.test.tsx
```

Expected: FAIL — no button named "Save board", one switch.

- [ ] **Step 3: Implement**

`apps/lab/src/run/RunColumn.tsx` — imports and selectors:

```ts
import { saveRefusal, saveShown } from '../library/saveShown'
```

```ts
  const auto = useStore((state) => state.ui.auto)
  const setAuto = useStore((state) => state.ui.setAuto)
  const saveEvery = useStore((state) => state.ui.saveEvery)
  const setSaveEvery = useStore((state) => state.ui.setSaveEvery)
  const refusal = useStore(saveRefusal)
```

In `.fw-alt`, after the Abort button:

```tsx
        <button type="button" ref={abortRef} onClick={control.abort} disabled={!running}>
          {stopping ? dict.t('abortDiscard') : dict.t('abort')}
        </button>
        {/* The board on screen, not a new run: shared with the palette's row. */}
        {/* Short text: in Polish the full name wraps the M/S bar to a third row
            (128 px against 104). The name keeps both words and contains the text. */}
        <button
          type="button"
          onClick={saveShown}
          disabled={refusal !== null}
          aria-label={dict.t('saveBoard')}
          title={refusal === null ? undefined : dict.t(refusal)}
        >
          {dict.t('saveShort')}
        </button>
```

In `<MoreMenu>`, after the auto-run block and before `<ExportButtons />`:

```tsx
        {/* In both views: saving is not a knob. */}
        <div className="fw-ghost">
          <OptionSwitch id="opt-save" label={dict.t('saveEvery')} on={saveEvery} onChange={setSaveEvery} />
        </div>
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/lab && pnpm vitest run --project chromium src/run/RunColumn.browser.test.tsx src/run/MoreMenu.browser.test.tsx src/design/touch.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Lint and type check**

```bash
pnpm nx run lab:check --skip-nx-cache && pnpm nx run lab:lint --skip-nx-cache
```

Expected: clean.

- [ ] **Step 6: The layout gate (Review Focus 5)**

```bash
cd apps/lab && pnpm vitest run --project chromium src/routes/LayoutInvariants.browser.test.tsx src/routes/LabLayout.browser.test.tsx
```

Expected: PASS. Measured in the dry run with the short label: controls 88 px at 1024×768 in English and Polish (the full Polish name gave 128 px against the 104 px limit), 48–88 px at 768×1024. If `bar-row` or any invariant still fails at M/S (768–1279 px), **stop and report the failing states and measured heights**: neither the threshold in `harness/invariants.ts` nor the placement is moved without the user.

- [ ] **Step 7: Commit**

```bash
cd apps/lab && npx prettier --write src/run && cd ../..
git add apps/lab/src/run
git commit -m "lab: Save board and the save-every switch in the run column"
```

---

### Task 5: ⌘G and the palette rows

**Files:**
- Modify: `apps/lab/src/run/actions.ts` (`generateAndSave`)
- Modify: `apps/lab/src/shell/hotkeys.ts` (`isHotkeyRefused` split, ⌘G in `useWorkspaceKeys`)
- Modify: `apps/lab/src/palette/commands.ts` (two rows)
- Modify: `apps/lab/src/palette/CommandPalette.tsx` (the memo's dependencies: the Save board row reads `saveRefusal`)
- Test: `apps/lab/src/palette/CommandPalette.browser.test.tsx`
- Test: `apps/lab/src/run/actions.test.ts`, `apps/lab/src/palette/commands.test.ts`, `apps/lab/src/routes/LabLayout.browser.test.tsx`, `apps/lab/src/routes/Workspace.browser.test.tsx`

**Interfaces:**
- Consumes: `RunControl.start(opts)` (Task 1), `saveRefusal`, `saveShown` (Task 2), keys `generateAndSave`, `saveBoard`, refusals.
- Produces: `generateAndSave(control: RunControl): void`; palette rows `run-generate-save`, `run-save`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/lab/src/run/actions.test.ts`. Its vitest import has no `test`; make it `import { beforeEach, describe, expect, it, test } from 'vitest'`, and add `generateAndSave` to the `./actions` import and the `RunControl` type if absent:

```ts
test('generateAndSave starts a run that asks to save', () => {
  const asked: unknown[] = []
  const control: RunControl = { start: (opts) => void asked.push(opts), abort: () => {}, hold: () => {}, checkSeeds: () => {} }
  generateAndSave(control)
  expect(asked).toEqual([{ save: true }])
})
```

In `apps/lab/src/palette/commands.test.ts`: import `finish, finishedRun` from `'../state/result.fixtures'` and add `vi` to the vitest import; in `'never disables a row without giving one of D7’s reasons'` extend the reasons:

```ts
    const reasons = [
      dict.t('cmdNoRun'),
      dict.t('cmdRunning'),
      dict.t('cmdBroken'),
      dict.t('saveNoBoard'),
      dict.t('saveStopped'),
      dict.t('savePending'),
      dict.t('saveDone'),
    ]
```

in `'keeps the catalogue order among rows that tie in rank'` the two new rows join the run rows (their note is `cmdSecRun`, "run"); update its leading comment's count to ten and the list:

```ts
    expect(matches).toEqual([
      'run-generate',
      'run-generate-save',
      'run-save',
      'run-reseed',
      'run-defaults',
      'run-abort',
      'run-check-seeds',
      'run-solo',
      'knob-giantStep',
      'knob-giantJitter',
    ])
```

and add:

```ts
  it('offers Generate and save beside Generate, with its key, through the control', () => {
    const asked: unknown[] = []
    const control: RunControl = {
      start: (opts) => void asked.push(opts),
      abort: () => {},
      hold: () => {},
      checkSeeds: () => {},
    }
    useStore.getState().ui.openPalette()
    const row = buildCommands({ ...deps(), control }, useStore.getState()).find((r) => r.id === 'run-generate-save')
    expect(row?.name).toBe('Generate and save')
    expect(row?.value).toBe('⌘G')
    row?.run()
    expect(asked).toEqual([{ save: true }])
    expect(useStore.getState().ui.palette).toBe(false)
  })

  it('offers Save board for the board on screen, and gives the reason when it cannot', () => {
    const row = () => buildCommands(deps(), useStore.getState()).find((r) => r.id === 'run-save')
    expect(row()?.disabled).toBe(true)
    expect(row()?.value).toBe('No board to save yet')
    finish(finishedRun(1))
    expect(row()?.disabled).toBe(false)
    expect(row()?.value).toBe('')
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
    try {
      useStore.getState().ui.openPalette()
      row()?.run()
      expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
      expect(row()?.value).toBe('Saving…')
      expect(useStore.getState().ui.palette).toBe(false)
    } finally {
      fetch.mockRestore()
    }
  })
```

In `apps/lab/src/palette/CommandPalette.browser.test.tsx` (add `import { act } from 'react'` and `import { finish, finishedRun } from '../state/result.fixtures'`), inside its main `describe`:

```tsx
  // The memo's dependencies are kept by hand; an answer arriving while the palette is open must reach the row.
  it('updates the Save board row when the store answers while it is open', async () => {
    const run = finishedRun(1)
    finish(run)
    useStore.getState().result.saving(run.file)
    const screen = await mount()
    const row = () =>
      [...screen.container.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes('Save board'))
    await expect.poll(() => row()?.textContent).toContain('Saving…')
    await act(async () => useStore.getState().result.stored(run.file, { ok: false, error: 'no store server' }))
    await expect.poll(() => row()?.textContent).not.toContain('Saving…')
  })
```

In `apps/lab/src/routes/LabLayout.browser.test.tsx`, the `g` case: ⌘ and Ctrl now mean "and save", so they leave the refused list, and the plain key is shown to be a dry run. Replace its first half:

```tsx
// The same guard set as `f`, and each refusal is followed by the very same
// event without the thing refused, so a listener ignoring synthetic events
// could not pass. ⌘G and Ctrl+G are the next case's.
test('g generates a dry run, and refuses Alt, a repeat, a cancelled event and a field', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  const seedBefore = useStore.getState().params.values.seed

  for (const refused of [{ altKey: true }, { repeat: true }]) {
    press(document.body, { key: 'g', ...refused })
  }
  expect(useStore.getState().run.phase).toBe('done')

  press(document.body, { key: 'g' })
  // `start` writes `run.started` synchronously, so the run's intent is readable at once.
  expect(useStore.getState().run.save).toBe(false)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  expect(useStore.getState().params.values.seed).toBe(seedBefore)
```

(the rest of the case, the knob field, stays). Add after it:

```tsx
// Phases are recorded, not read after the fact: an 8×8-sized carve can start
// and finish between two reads. `cancelable` lets the case see the browser's
// own ⌘G ("find next") prevented.
test('⌘G and Ctrl+G generate and save, and refuse Alt, a repeat and a field', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  const phases: string[] = []
  const unsubscribe = useStore.subscribe((state) => void phases.push(state.run.phase))
  try {
    for (const refused of [{ altKey: true }, { repeat: true }, { isComposing: true }]) {
      press(document.body, { key: 'g', metaKey: true, ...refused })
    }
    // Consumed closer to the target, as `f`'s case does it.
    const cancel = (event: KeyboardEvent) => event.preventDefault()
    document.addEventListener('keydown', cancel, { capture: true })
    try {
      press(document.body, { key: 'g', metaKey: true, cancelable: true })
    } finally {
      document.removeEventListener('keydown', cancel, { capture: true })
    }
    expect(phases).not.toContain('running')

    for (const modifier of [{ metaKey: true }, { ctrlKey: true }]) {
      const event = new KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true, ...modifier })
      document.body.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
      expect(useStore.getState().run.save).toBe(true)
      await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
    }

    // In a knob's own entry ⌘G is not the lab's.
    await screen.getByRole('tab', { name: 'board', exact: true }).click()
    await screen.getByRole('button', { name: /^seed:/ }).click()
    phases.length = 0
    press(document.activeElement ?? document.body, { key: 'g', metaKey: true })
    expect(phases).not.toContain('running')
  } finally {
    unsubscribe()
  }
}, 60_000)
```

In `apps/lab/src/routes/Workspace.browser.test.tsx` add, after the save case from Task 2:

```tsx
// With the switch off: Save board takes the load run's board without a run,
// and ⌘G makes a board and saves it. Spied, not stubbed: the POSTs fail for real.
test('Save board saves the board on screen and ⌘G a new one, with the switch off', async () => {
  await clearOfTheDrawer()
  const fetchSpy = vi.spyOn(window, 'fetch')
  const posts = () =>
    fetchSpy.mock.calls.filter((call) => String(call[0]) === '/api/boards' && call[1]?.method === 'POST')
  try {
    const screen = await mountApp()
    await loadRunDone()
    expect(useStore.getState().ui.saveEvery).toBe(false)
    const loaded = useStore.getState().result.shown?.file
    await screen.getByRole('button', { name: 'Save board', exact: true }).click()
    await expect.poll(() => posts().length, { timeout: 10_000 }).toBe(1)
    expect(useStore.getState().result.shown?.file).toBe(loaded)

    const event = new KeyboardEvent('keydown', { key: 'g', metaKey: true, bubbles: true, cancelable: true })
    document.body.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await expect.poll(() => savedAfter(loaded), { timeout: 30_000 }).toBe(true)
    expect(posts()).toHaveLength(2)
  } finally {
    fetchSpy.mockRestore()
  }
}, 60_000)
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/lab
pnpm vitest run --project node src/run/actions.test.ts src/palette/commands.test.ts
pnpm vitest run --project chromium src/routes/LabLayout.browser.test.tsx src/routes/Workspace.browser.test.tsx
```

Expected: FAIL (`generateAndSave` missing, rows missing, ⌘G does nothing).

- [ ] **Step 3: Implement**

`apps/lab/src/run/actions.ts`, after `generate`:

```ts
/** ⌘G: Generate, and save the board it makes whatever the switch says. */
export function generateAndSave(control: RunControl): void {
  drawIfRandom()
  control.start({ save: true })
}
```

`apps/lab/src/shell/hotkeys.ts` — split the guard so ⌘G keeps every refusal but the modifier one:

```ts
/**
 * Refused whatever the modifiers: a key repeat, a composing IME key, an event
 * consumed closer to the target, a key typed into a field or an editable region.
 */
function isOffLimits(event: KeyboardEvent): boolean {
  if (event.repeat || event.isComposing || event.defaultPrevented) return true
  const target = event.target
  return (
    target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select') !== null)
  )
}

/** Nothing with Ctrl, ⌘ or Alt (the platform's), and nothing off limits. `usePaletteKey` does not use this guard. */
function isHotkeyRefused(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey || isOffLimits(event)
}

/** ⌘G or Ctrl+G, without Alt: Generate and save. */
function isSaveKey(event: KeyboardEvent): boolean {
  return (event.key === 'g' || event.key === 'G') && (event.metaKey || event.ctrlKey) && !event.altKey
}
```

(delete the old `isHotkeyRefused` and its comment), and in `useWorkspaceKeys`:

```ts
    const onKey = (event: KeyboardEvent) => {
      if (isSaveKey(event)) {
        if (isOffLimits(event)) return
        // The browser's ⌘G is "find next".
        event.preventDefault()
        generateAndSave(control)
        return
      }
      if (isHotkeyRefused(event)) return
      WORKSPACE_KEYS.find((row) => row.keys.includes(event.key))?.run(control)
    }
```

with `import { generate, generateAndSave, stepSeed } from '../run/actions'`. Update the doc above `WORKSPACE_KEYS` to name ⌘G once: append "⌘G (and Ctrl+G) is not in the table: it is bound beside it in `useWorkspaceKeys`." keeping the block ≤ 6 lines.

`apps/lab/src/palette/commands.ts` — imports:

```ts
import { saveRefusal, saveShown } from '../library/saveShown'
import { applyPreset, defaults, generate, generateAndSave, reseed } from '../run/actions'
```

in `buildCommands`, beside `running` and `broken`:

```ts
  const refusal = saveRefusal(state)
```

and after the `run-generate` row:

```ts
    {
      id: 'run-generate-save',
      section: 'run',
      name: dict.t('generateAndSave'),
      note: dict.t('cmdSecRun'),
      value: broken ? dict.t('cmdBroken') : running ? dict.t('cmdRunning') : '⌘G',
      hay: 'generate save store keep',
      disabled: running || broken,
      run: () => {
        generateAndSave(deps.control)
        state.ui.closePalette()
      },
    },
    {
      id: 'run-save',
      section: 'run',
      name: dict.t('saveBoard'),
      note: dict.t('cmdSecRun'),
      // The board on screen, so a carve in flight does not stop it.
      value: refusal === null ? '' : dict.t(refusal),
      hay: 'save store keep',
      disabled: refusal !== null,
      run: () => {
        saveShown()
        state.ui.closePalette()
      },
    },
```

`apps/lab/src/palette/CommandPalette.tsx` — the `commands` memo lists by hand every slice a row reads; the Save board row reads the store's answer, so its refusal joins the list:

```ts
import { saveRefusal } from '../library/saveShown'
```

```ts
  const view = useStore((state) => state.view)
  const refusal = useStore(saveRefusal)
```

```ts
    [deps, values, violations, running, seriesStopping, runStopping, mode, lang, view, refusal],
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/lab
pnpm vitest run --project node src/run/actions.test.ts src/palette/commands.test.ts src/shell/hotkeys.test.ts
pnpm vitest run --project chromium src/routes/LabLayout.browser.test.tsx src/routes/Workspace.browser.test.tsx src/palette/CommandPalette.browser.test.tsx
cd ../.. && pnpm nx run lab:check --skip-nx-cache && pnpm nx run lab:lint --skip-nx-cache
```

Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
cd apps/lab && npx prettier --write src/run src/shell src/palette src/routes && cd ../..
git add apps/lab/src/run apps/lab/src/shell apps/lab/src/palette apps/lab/src/routes
git commit -m "lab: ⌘G generates and saves; the palette offers Generate and save and Save board"
```

---

### Task 6: Whole-branch gates and a live run

**Files:** none new; fixes only if a gate fails.

- [ ] **Step 1: The repository's gates**

```bash
cd packages/engine && deno task verify && cd ../..
pnpm nx run-many -t verify --skip-nx-cache
```

Expected: every target green. A failure is fixed in the task's files it belongs to, with its own commit.

- [ ] **Step 2: Live run with a real mouse, against a copy of the store**

```bash
mkdir -p /tmp/arrowz-dry-run && rm -rf /tmp/arrowz-dry-run/boards
cp -R /Users/tomek/dev/arrowz/packages/cli/boards /tmp/arrowz-dry-run/boards
find /tmp/arrowz-dry-run/boards -name '*.board.json' | wc -l     # note the count: N
ARROWZ_BOARDS_DIR=/tmp/arrowz-dry-run/boards pnpm nx serve lab  # in the background; lab on 8779, store on 8777
```

In Chrome at `http://localhost:8779/`, at 1440×900, with the report drawer closed:
1. Load the page, press Generate, press `g`, choose a preset, press New seed. The count stays N, and each line reads "— not saved (⌘G or Save board)".
2. Click Save board. The count is N+1 and the line reads "— saved" (or "layout already stored…"). The button is then disabled with the title "This board is saved".
3. Press ⌘G. The count is N+2, and Chrome's find bar does not open.
4. Turn on "save every board" in the column, press New seed: N+3. Reload the page: the switch is off.
5. Switch to Polish; the dry-run line reads "— nie zapisano (⌘G albo Zapisz planszę)".
6. At 1024×768 the run bar under the board stays one line of state and its controls fit (compare with `main` if in doubt).

Stop the servers by port: `for p in $(lsof -tiTCP:8779 -sTCP:LISTEN) $(lsof -tiTCP:8777 -sTCP:LISTEN); do kill $p; done`.

- [ ] **Step 3: Record**

Add the plan to the bead and leave the branch for the finishing step (no PR from this plan):

```bash
bd update arrowz-qdz6 --set-metadata plan=lab/dry-run-generate:docs/superpowers/plans/2026-10-03-lab-dry-run-generate.md
```
