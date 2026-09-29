# Lab: check the knobs on N seeds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Check seeds" row in the lab runs the knobs on screen over seeds `seed … seed + N − 1` in a pool of workers and reports "complete on X of N" with the averages of the complete boards and the seeds that were not.

**Architecture:** The engine gains a one-seed worker message (`seed` → `seedDone` with a `SeedRun`, no board file), the mapping `seedRunOf` and the pure `summariseSeries`. The lab gains a `series` slice and a `useSeries` pool (`min(N, cores − 1, 4)` workers, a seed queue, the shared stop flag from the Stop work). `useRun` is the one gate: a normal run and a series never overlap. The result is a "Seeds" section in the report drawer.

**Tech Stack:** TypeScript, React 19, zustand, Vite 8, Vitest 5 browser mode (Playwright Chromium), Deno 2.9 for the engine.

**Spec:** `docs/superpowers/specs/2026-09-29-lab-seed-series-design.md`

## Global Constraints

- Everything in the repository is English; every visible string goes into `packages/engine/lab-i18n.ts`, `EN.ui` and `PL.ui` both.
- New strings pass `packages/engine/glossary.test.ts`: in English no "close(d/s/ing)", "jam", "piece(s)", "carve"; in Polish no "zacina", "zacię", "generacj", "element", "fragment"; no `--flag` in lab strings. The lab's words: "complete" / "incomplete" (`closed: 'Board complete…'`, `notClosedShort: 'Board incomplete.'`).
- The engine files (`types.ts`, `lab-report.ts`, `lab-i18n.ts`) stay neutral: no DOM, no Deno (`neutral.test.ts`).
- No `any`, no non-null assertions (`!`).
- Comments: why, once, fewest lines; non-header blocks ≤ 6 lines; no history (no PR, task, review, step references).
- Never spread arrays proportional to cells or pieces. A seed list (≤ 200) may be copied.
- Seeds: `seed, seed + 1, …`, never past `2 ** 32 − 1` (the seed knob's `max` in `PARAM_SPEC`); a series near the ceiling is shorter.
- Count: default 20, range 2–200.
- Pool size: `max(1, min(count, cores − 1, 4))`, `cores = navigator.hardwareConcurrency`.
- A series never stores a board and never changes `result.shown`.
- Commands (from the last branch): `pnpm nx run lab:smoke` (builds first), `cd apps/lab && pnpm run check` (never `tsc -b --noEmit`), `pnpm nx build engine` after editing `types.ts`, `lab-report.ts` or `lab-i18n.ts` and before any lab check or test (the lab reads the engine from `dist`). Before each commit: `cd apps/lab && pnpm exec prettier --write <touched lab files>`, `cd packages/engine && deno fmt <touched engine files>`.
- `vi.spyOn` cannot redefine an ES module export in the browser runner; stub globals (`Worker`, `crossOriginIsolated`, `navigator.hardwareConcurrency`) with `vi.stubGlobal` instead.
- Never write a wait loop on marker files (`while [ ! -f … ]; do sleep …`); run commands directly and read their output.
- Commit messages: no attribution lines. Gates: `cd packages/engine && deno task test`; before the branch is done `set -o pipefail; pnpm nx run-many -t verify`.

## Review Focus

1. **Knob edits or auto-generate during a series** (auto on, a slider dragged mid-series): no normal run may start, and the series keeps its own knobs. Pinned in Task 4 (`useRun.start` refuses while a series runs).
2. **A series started at a seed near `2 ** 32 − 1`**: the series is shorter, never sends an invalid seed. Pinned in Task 3 (`seriesSeeds`).
3. **Answers arriving out of seed order** from parallel workers: the result lists seeds in order. Pinned in Task 3 (slice `answered`).
4. **Stop pressed while some seeds are still queued**: running seeds answer `stopped`, queued ones are never sent, the counts add up to the seeds answered, not to N. Pinned in Task 3.
5. **A failed seed's button pressed while the knobs differ from the series'**: it must open that seed with the *series'* knobs, not the panel's, or the board shown is not the one that failed. Pinned in Task 6.

---

## Errata from the dry run (binding — they override the task text they name)

A dry run of this plan passed every gate after these fixes; its commits are in
`/tmp/arrowz-dry-series` (after `086ce60`), working code to read when a step
is unclear, never to cherry-pick.

- **E1 (Task 1) — BLOCKER, the outcome mapping.** `generate()` reports a deadlock with `ok: false, stuck: null` (see `GenerateResult.deadlock`), so `ok && deadlock` never happens. `outcomeOf` is `if (result.aborted) return 'stopped'; if (result.deadlock) return 'unsolvable'; return result.ok ? 'complete' : 'incomplete'`, and `remaining` is `result.stuck?.remaining ?? 0`. The unsolvable test uses `{ ...base, ok: false, aborted: false, deadlock: true, stuck: null }` and expects outcome `'unsolvable'`, remaining `0`; it must fail against the old mapping.
- **E2 (Task 1, Step 1).** `lab-report.test.ts` imports `generate` from `./mod.ts`; add `GenerateAbort` to that import.
- **E3 (Task 3, Step 4) — "capped at four".** `seedsSent()` lists seeds worker by worker, not in send order. Assert `expect(HeldWorker.made[2]?.sent.map((m) => (m.type === 'seed' ? m.params.seed : null))).toEqual([102, 104])` and `expect(seedsSent()).toHaveLength(5)`.
- **E4 (Task 3, Step 4) — lint `react-hooks/globals`.** In the pool test's `Harness`: `const series = useSeries(); useEffect(() => { handle = series }, [series]); return null`.
- **E5 (all tasks) — prettier lives in `apps/lab` only.** Format with `cd apps/lab && git diff --name-only --relative -- src scripts | xargs pnpm exec prettier --write` (plus new untracked files by name). Never run prettier from the repo root.
- **E6 (Task 4, Step 1).** `useRun.browser.test.tsx` uses `stub()` with counters and `renderHook(() => useRun(g.generator))`. `stub()` gains `series: SeriesHandle = { start: vi.fn(), abort: vi.fn() }`; every `useRun(g.generator)` becomes `useRun(g.generator, g.series)`; `beforeEach` gains `state.series.reset()`; import `defaultParams`. Write the four new cases in that style.
- **E7 (Task 4, Step 4).** 15 `RunControl` literals in 12 files break; several of those files do not import `vi`. Add `checkSeeds: () => {}` in each literal's own style.
- **E8 (Task 4, Step 3).** `commands.ts` imports only `type RunControl`: make it `import { inFlight, type RunControl } from '../run/useRun'`. In `Workspace.tsx` nothing changes (its variable is `running`, the run's, and stays).
- **E9 (Task 4) — gaps the plan left.** (a) While a series is stopping, the Stop button and the ⌘K `run-abort` row read "Discard": their condition is `state.run.stopping || state.series.stopping`. (b) The run column's New seed and Defaults are `disabled` while a series runs (`state.series.phase === 'running'`), not during a normal run (unchanged). Add one RunColumn browser case for each.
- **E10 (Task 5) — `commands.test.ts` ordering case.** "keeps the catalogue order among rows that tie in rank" breaks: insert `'run-check-seeds'` after `'run-abort'` in its expected list and make its comment count six run rows and eight in all.
- **E11 (Task 5, Step 3) — `DraftNumber`.** Do not pass `word` (it replaces the value in the accessible name, giving `seeds: seeds`). Typing test: `await page.getByRole('button', { name: 'seeds: 20' }).click(); await userEvent.fill(page.getByRole('textbox', { name: 'seeds' }), '500'); await userEvent.keyboard('{Enter}')`.
- **E12 (Task 5) — the meter's CSS.** The fill is bound to `.fw .fw-go.busy` in `apps/lab/src/design/run.css`. Add there: `.fw .fw-series { flex-direction: row }`, the series button `flex: 1`, and `.fw .fw-series > button.busy` with the same gradient as `.fw-go.busy` (copy the declaration). `run.css` joins Task 5's commit.
- **E13 (Task 5) — layout invariant `bar-row`.** Mounted after `.fw-alt`, the row makes the run bar 136 px tall at 1024×768 in Polish (cap 104, `LayoutInvariants.browser.test.tsx`). Mount `{simple ? null : <SeriesRow control={control} />}` as the first child of `<MoreMenu>` instead: `.fw-more-pop` is `display: contents` on wide screens, so the column is unchanged there, and on narrow bars the row sits in the "…" popover. Task 5 ends with the whole chromium project.
- **E14 (Task 6, Step 3) — outcome key.** `.filter` does not narrow `'complete'` out. Use `const OUTCOME = { incomplete: 'seriesOutcome_incomplete', unsolvable: 'seriesOutcome_unsolvable', stopped: 'seriesOutcome_stopped' } as const` and inside the `map` `run.outcome === 'complete' ? null : …dict.t(OUTCOME[run.outcome])…`.
- **E15 (Task 6, Step 2).** The stale marker's text is ` · for other settings`: match `page.getByText(/for other settings/)`.
- **E16 (Task 6) — heading and tone.** Report headings are `<h2>` (styled by `.fw-report h2`), not `<h3>`. `ReportSummary` has no tone classes: add to `apps/lab/src/design/report.css` three rules for the head line on `--ok`, `--warn`, `--error` (check the token names with `grep -n "\-\-ok\|\-\-warn\|\-\-error" apps/lab/src/design/tokens.css`) and a list reset for `.fw-series-failed`. `report.css` joins Task 6's commit.
- **E17 (Task 6) — mounting through a slot.** Neither `ReportPanel` nor `Stage` receives the control, and `ReportPanel.browser.test` renders `<ReportPanel />` bare. `Stage` gains `series?: ReactNode` and passes it on; `ReportPanel({ series = null }: { series?: ReactNode })` renders `{series}` above the run's report, also when `result === null`; `Workspace` passes `series={lab ? <SeriesSection control={control} /> : null}`.
- **E18 (Task 6, Step 1) — help text and Polish.** `seriesMean_help` has no `= …` clause (EN: `'Averaged over the complete seeds only: an incomplete board would pull the numbers towards a board nobody plays.'`, PL likewise without the `=` part). Polish `seriesFailed`: `` (seed, outcome, left) => `ziarno ${seed} — ${outcome}, zostało pól: ${left}` `` (no plural agreement to get wrong).
- **E19 (Task 7, Step 2).** Also correct the spec's outcome-mapping sentence if it still reads `ok && deadlock` (fixed on the branch before execution; check).

---

## File Structure

- `packages/engine/types.ts` — `SeedOutcome`, `SeedRun`, `WorkerIn` `seed`, `WorkerOut` `seedDone`.
- `packages/engine/lab-report.ts` — `seedRunOf`, `SeriesSummary`, `summariseSeries`.
- `packages/engine/lab-report.test.ts` — their tests.
- `apps/lab/src/worker/generate.worker.ts` — answers `seed`.
- `apps/lab/scripts/worker-smoke.mjs` — checks `seed`.
- `apps/lab/src/series/seeds.ts` (new) — pure `seriesSeeds`, `poolSize`, count bounds.
- `apps/lab/src/state/series.slice.ts` (new) — the `series` slice; `apps/lab/src/state/store.ts` registers it.
- `apps/lab/src/series/useSeries.ts` (new) — the pool.
- `apps/lab/src/run/useRun.ts` — `checkSeeds()`, the one gate, abort routing.
- `apps/lab/src/App.tsx` — mounts `useSeries`.
- `apps/lab/src/run/RunColumn.tsx`, `apps/lab/src/routes/Workspace.tsx`, `apps/lab/src/palette/commands.ts` — "a run is in flight" includes a series; the row; the ⌘K row.
- `apps/lab/src/series/SeriesRow.tsx` (new) — the run column's row.
- `apps/lab/src/report/SeriesSection.tsx` (new) — the report drawer's "Seeds" section; `apps/lab/src/report/ReportPanel.tsx` mounts it.
- `apps/lab/src/stage/useRunState.ts` — the status line during a series.
- `lab-review.md` — Gap 3 done, item 4 removed.

---

### Task 1: the engine's seed run and its summary

**Errata to apply: E1, E2, E5.**

**Files:**
- Modify: `packages/engine/types.ts` (beside `WorkerIn` / `WorkerOut`)
- Modify: `packages/engine/lab-report.ts`
- Test: `packages/engine/lab-report.test.ts`

**Interfaces:**
- Produces:

```ts
// types.ts
export type SeedOutcome = 'complete' | 'incomplete' | 'unsolvable' | 'stopped'
export interface SeedRun { seed: number; outcome: SeedOutcome; pieces: number; maxLen: number | null; genMs: number; remaining: number }
// WorkerIn gains  | { type: 'seed'; params: Params; stop?: Int32Array }
// WorkerOut gains | { type: 'seedDone'; run: SeedRun }
// lab-report.ts
export function seedRunOf(seed: number, result: GenerateResult): SeedRun
export interface SeriesSummary { total: number; complete: number; incomplete: number; unsolvable: number; stopped: number; meanPieces: number | null; meanMaxLen: number | null; meanGenMs: number | null }
export function summariseSeries(runs: readonly SeedRun[]): SeriesSummary
```

- [ ] **Step 1: Write the failing tests**

Append to `packages/engine/lab-report.test.ts` (it already imports from `./lab-report.ts` and `./engine.ts`; add `seedRunOf, summariseSeries` to the first import and `GenerateAbort` to the engine import if missing):

```ts
Deno.test('seedRunOf: a complete board is complete, with its arrows and longest', () => {
  const result = generate({ ...defaultParams(), W: 8, H: 8, seed: 1 })
  const run = seedRunOf(1, result)
  assertEquals(run.outcome, 'complete')
  assertEquals(run.pieces, result.board.pieces.length)
  assertEquals(run.maxLen, result.metrics?.maxLen ?? null)
  assertEquals(run.remaining, 0)
})

Deno.test('seedRunOf: a stopped run is stopped, whatever else it says', () => {
  let calls = 0
  const result = generate({ ...defaultParams(), W: 400, H: 400, seed: 7 }, {
    trace: () => {
      calls++
      throw new GenerateAbort('test')
    },
  })
  assertEquals(calls, 1)
  const run = seedRunOf(7, result)
  assertEquals(run.outcome, 'stopped')
  assert(run.remaining > 0)
})

Deno.test('seedRunOf: incomplete and unsolvable come from ok and deadlock', () => {
  const base = generate({ ...defaultParams(), W: 8, H: 8, seed: 1 })
  assertEquals(seedRunOf(1, { ...base, ok: false, aborted: false, deadlock: false, stuck: { remaining: 5, sizes: [5], heads: 0 } }).outcome, 'incomplete')
  assertEquals(seedRunOf(1, { ...base, ok: false, aborted: false, deadlock: false, stuck: { remaining: 5, sizes: [5], heads: 0 } }).remaining, 5)
  assertEquals(seedRunOf(1, { ...base, ok: true, aborted: false, deadlock: true }).outcome, 'unsolvable')
})

Deno.test('summariseSeries: counts every outcome and averages the complete runs only', () => {
  const runs: SeedRun[] = [
    { seed: 1, outcome: 'complete', pieces: 10, maxLen: 20, genMs: 5, remaining: 0 },
    { seed: 2, outcome: 'complete', pieces: 30, maxLen: 40, genMs: 15, remaining: 0 },
    { seed: 3, outcome: 'incomplete', pieces: 999, maxLen: 999, genMs: 999, remaining: 12 },
    { seed: 4, outcome: 'stopped', pieces: 1, maxLen: null, genMs: 1, remaining: 50 },
  ]
  assertEquals(summariseSeries(runs), {
    total: 4, complete: 2, incomplete: 1, unsolvable: 0, stopped: 1,
    meanPieces: 20, meanMaxLen: 30, meanGenMs: 10,
  })
})

Deno.test('summariseSeries: with no complete run the means are null', () => {
  const s = summariseSeries([{ seed: 1, outcome: 'incomplete', pieces: 3, maxLen: 4, genMs: 5, remaining: 6 }])
  assertEquals([s.meanPieces, s.meanMaxLen, s.meanGenMs], [null, null, null])
  assertEquals(summariseSeries([]).total, 0)
})
```

Check the file's existing imports (`assert`, `assertEquals`, `defaultParams`, `generate`) with `sed -n 1,20p packages/engine/lab-report.test.ts` and add what is missing; import `type SeedRun` from `./types.ts`. If `Stuck`'s field names differ from `{ remaining, sizes, heads }`, use `grep -n "interface Stuck" -A6 packages/engine/types.ts`.

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/engine && deno test lab-report.test.ts 2>&1 | tail -5`
Expected: FAIL, `seedRunOf` is not exported.

- [ ] **Step 3: Types**

In `packages/engine/types.ts`, above `WorkerIn`:

```ts
/** How one seed of a series ended: `unsolvable` is a full board no order of taps empties. */
export type SeedOutcome = 'complete' | 'incomplete' | 'unsolvable' | 'stopped'

/** One seed of a series as the worker answers it: numbers only, no board. */
export interface SeedRun {
  seed: number
  outcome: SeedOutcome
  pieces: number
  maxLen: number | null
  genMs: number
  /** Empty cells left; 0 on a full board. */
  remaining: number
}
```

`WorkerIn` gains, after `generate`:

```ts
  /** One seed of a series: answered by `seedDone`, never by `progress`. */
  | { type: 'seed'; params: Params; stop?: Int32Array }
```

`WorkerOut` gains `| { type: 'seedDone'; run: SeedRun }`.

- [ ] **Step 4: The mapping and the summary**

In `packages/engine/lab-report.ts` (import `GenerateResult`, `SeedOutcome`, `SeedRun` as types from `./types.ts`):

```ts
/** A stopped run first, then a full board that cannot be solved, then a full one. */
function outcomeOf(result: GenerateResult): SeedOutcome {
  if (result.aborted) return 'stopped'
  if (result.ok) return result.deadlock ? 'unsolvable' : 'complete'
  return 'incomplete'
}

export function seedRunOf(seed: number, result: GenerateResult): SeedRun {
  const outcome = outcomeOf(result)
  return {
    seed,
    outcome,
    pieces: result.board.pieces.length,
    maxLen: result.metrics?.maxLen ?? null,
    genMs: result.genMs,
    remaining: result.ok ? 0 : (result.stuck?.remaining ?? 0),
  }
}

export interface SeriesSummary {
  total: number
  complete: number
  incomplete: number
  unsolvable: number
  stopped: number
  /** Over the complete runs only, as `report.ts` averages its closed runs; null with none. */
  meanPieces: number | null
  meanMaxLen: number | null
  meanGenMs: number | null
}

export function summariseSeries(runs: readonly SeedRun[]): SeriesSummary {
  const count = (outcome: SeedOutcome) => runs.filter((run) => run.outcome === outcome).length
  const done = runs.filter((run) => run.outcome === 'complete')
  const mean = (values: readonly number[]) =>
    values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
  return {
    total: runs.length,
    complete: done.length,
    incomplete: count('incomplete'),
    unsolvable: count('unsolvable'),
    stopped: count('stopped'),
    meanPieces: mean(done.map((run) => run.pieces)),
    meanMaxLen: mean(done.flatMap((run) => (run.maxLen === null ? [] : [run.maxLen]))),
    meanGenMs: mean(done.map((run) => run.genMs)),
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `cd packages/engine && deno test lab-report.test.ts 2>&1 | tail -5 && deno task test 2>&1 | tail -3`
Expected: PASS.

- [ ] **Step 6: Build, format, commit**

```bash
pnpm nx build engine
cd packages/engine && deno fmt types.ts lab-report.ts lab-report.test.ts && cd ../..
git add packages/engine/types.ts packages/engine/lab-report.ts packages/engine/lab-report.test.ts
git commit -m "Engine: one seed of a series, its outcome, and the series' summary"
```

---

### Task 2: the worker answers one seed

**Errata to apply: E5.**

**Files:**
- Modify: `apps/lab/src/worker/generate.worker.ts`
- Modify: `apps/lab/scripts/worker-smoke.mjs`

**Interfaces:**
- Consumes: `WorkerIn` `seed`, `WorkerOut` `seedDone`, `seedRunOf` (Task 1, from `@arrowz/engine/report`).

- [ ] **Step 1: The failing smoke check**

In `worker-smoke.mjs`, after the last existing check and before `if (failures > 0)`:

```js
messages.length = 0
globalThis.postMessage = (message) => messages.push(message)
const seedParams = { ...defaultParams(), W: 20, H: 20, seed: 11 }
globalThis.onmessage({ data: { type: 'seed', params: seedParams } })
const answer = messages.find((m) => m.type === 'seedDone')
const direct = generate(seedParams)
check(answer?.run?.seed === 11 && answer.run.pieces === direct.board.pieces.length, 'one seed of a series answers the engine’s arrow count')
check(answer?.run?.outcome === (direct.ok ? 'complete' : 'incomplete'), 'and its outcome')
check(!messages.some((m) => m.type === 'progress' || m.type === 'done'), 'with no progress and no board')
```

Run: `pnpm nx run lab:smoke`. Expected: the three new checks FAIL (the worker treats `seed` as a normal run and answers `done`).

- [ ] **Step 2: Implement**

In `generate.worker.ts`, add `import { seedRunOf } from '@arrowz/engine/report'`, and before the normal run (`const started = performance.now()`):

```ts
  if (message.type === 'seed') {
    const { stop } = message
    try {
      const result = generate(message.params, {
        trace: () => {
          if (stop !== undefined && Atomics.load(stop, 0) === 1) throw new GenerateAbort('stopped from the page')
        },
      })
      post({ type: 'seedDone', run: seedRunOf(message.params.seed, result) })
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
    return
  }
```

If the lab cannot resolve `@arrowz/engine/report` in the worker, check `apps/lab`'s existing imports of it (`grep -rn "@arrowz/engine/report" apps/lab/src | head -3`) and mirror them.

- [ ] **Step 3: Run**

Run: `pnpm nx run lab:smoke && cd apps/lab && pnpm run check`
Expected: every smoke line `ok`, check clean.

- [ ] **Step 4: Commit**

```bash
cd apps/lab && pnpm exec prettier --write src/worker/generate.worker.ts scripts/worker-smoke.mjs && cd ../..
git add apps/lab/src/worker/generate.worker.ts apps/lab/scripts/worker-smoke.mjs
git commit -m "Worker: one seed of a series, numbers only"
```

---

### Task 3: the series slice, the seed list and the pool

**Errata to apply: E3, E4, E5.**

**Files:**
- Create: `apps/lab/src/series/seeds.ts`, `apps/lab/src/series/seeds.test.ts`
- Create: `apps/lab/src/state/series.slice.ts`, `apps/lab/src/state/series.slice.test.ts`
- Modify: `apps/lab/src/state/store.ts`
- Create: `apps/lab/src/series/useSeries.ts`, `apps/lab/src/series/useSeries.browser.test.tsx`

**Interfaces:**
- Consumes: `SeedRun`, `WorkerIn`, `WorkerOut` (Task 1).
- Produces:

```ts
// seeds.ts
export const SERIES_MIN = 2, SERIES_MAX = 200, SERIES_DEFAULT = 20
export const SEED_CEILING = 2 ** 32 - 1
export function seriesSeeds(seed: number, count: number): number[]
export function poolSize(count: number, cores: number): number
// series.slice.ts
export type SeriesPhase = 'idle' | 'running' | 'done'
export interface SeriesState {
  phase: SeriesPhase; params: Params | null; count: number; planned: number
  runs: SeedRun[]; stopping: boolean; error: string | null
  setCount(count: number): void; started(params: Params, planned: number): void
  answered(run: SeedRun): void; stopRequested(): void; finished(error?: string): void; reset(): void
}
// store.ts: Store gains `series: SeriesState`
// useSeries.ts
export interface SeriesHandle { start(params: Params): void; abort(): void }
export function useSeries(): SeriesHandle
```

- [ ] **Step 1: Failing unit tests**

`apps/lab/src/series/seeds.test.ts`:

```ts
import { expect, test } from 'vitest'
import { poolSize, SEED_CEILING, seriesSeeds } from './seeds'

test('the seeds run up from the panel seed', () => {
  expect(seriesSeeds(7, 3)).toEqual([7, 8, 9])
})

test('a series near the ceiling is shorter and never passes it', () => {
  expect(seriesSeeds(SEED_CEILING - 1, 5)).toEqual([SEED_CEILING - 1, SEED_CEILING])
})

test('the pool leaves one core, stops at four, and never exceeds the seeds', () => {
  expect(poolSize(20, 8)).toBe(4)
  expect(poolSize(20, 3)).toBe(2)
  expect(poolSize(2, 8)).toBe(2)
  expect(poolSize(20, 1)).toBe(1)
})
```

`apps/lab/src/state/series.slice.test.ts`:

```ts
import { defaultParams } from '@arrowz/engine'
import type { SeedRun } from '@arrowz/engine'
import { beforeEach, expect, test } from 'vitest'
import { useStore } from './store'

const series = () => useStore.getState().series
const run = (seed: number): SeedRun => ({ seed, outcome: 'complete', pieces: 1, maxLen: 2, genMs: 3, remaining: 0 })

beforeEach(() => series().reset())

test('a fresh slice is idle with the default count', () => {
  expect(series().phase).toBe('idle')
  expect(series().count).toBe(20)
})

test('the count is held to its range', () => {
  series().setCount(1)
  expect(series().count).toBe(2)
  series().setCount(999)
  expect(series().count).toBe(200)
  series().setCount(12.6)
  expect(series().count).toBe(13)
})

test('answers are kept in seed order whatever order they arrive in', () => {
  series().started({ ...defaultParams(), seed: 10 }, 3)
  series().answered(run(12))
  series().answered(run(10))
  series().answered(run(11))
  expect(series().runs.map((r) => r.seed)).toEqual([10, 11, 12])
})

test('a new series forgets the last one and its stop', () => {
  series().started(defaultParams(), 2)
  series().answered(run(1))
  series().stopRequested()
  series().started(defaultParams(), 2)
  expect(series().runs).toEqual([])
  expect(series().stopping).toBe(false)
  expect(series().phase).toBe('running')
})

test('finishing ends the phase and keeps the runs and any error', () => {
  series().started(defaultParams(), 2)
  series().answered(run(1))
  series().finished('boom')
  expect(series().phase).toBe('done')
  expect(series().runs).toHaveLength(1)
  expect(series().error).toBe('boom')
})
```

Run: `cd apps/lab && pnpm exec vitest run --project node src/series src/state/series.slice.test.ts`. Expected: FAIL (modules missing).

- [ ] **Step 2: `seeds.ts`**

```ts
export const SERIES_MIN = 2
export const SERIES_MAX = 200
export const SERIES_DEFAULT = 20
/** The seed knob's `max` in `PARAM_SPEC`: `mulberry32` keeps 32 bits. */
export const SEED_CEILING = 2 ** 32 - 1

export function seriesSeeds(seed: number, count: number): number[] {
  const seeds: number[] = []
  for (let s = seed; s < seed + count && s <= SEED_CEILING; s++) seeds.push(s)
  return seeds
}

/** One core stays with the page; four is the cap, because a 1000×1000 seed holds ~390 MB (measured in Deno). */
export function poolSize(count: number, cores: number): number {
  return Math.max(1, Math.min(count, cores - 1, 4))
}
```

- [ ] **Step 3: the slice**

`apps/lab/src/state/series.slice.ts`:

```ts
import type { Params, SeedRun } from '@arrowz/engine'
import { SERIES_DEFAULT, SERIES_MAX, SERIES_MIN } from '../series/seeds'

export type SeriesPhase = 'idle' | 'running' | 'done'

/**
 * The knobs checked over many seeds: the process and its answers in one
 * slice, since a series shows no board. `params` are the knobs at the start,
 * not the ones on screen.
 */
export interface SeriesState {
  phase: SeriesPhase
  params: Params | null
  /** The field's value: how many seeds the next series checks. */
  count: number
  /** How many seeds this series set out to check (shorter near the seed ceiling). */
  planned: number
  /** In seed order. */
  runs: SeedRun[]
  stopping: boolean
  error: string | null
  setCount(count: number): void
  started(params: Params, planned: number): void
  answered(run: SeedRun): void
  stopRequested(): void
  finished(error?: string): void
  reset(): void
}

const EMPTY = { phase: 'idle', params: null, planned: 0, runs: [], stopping: false, error: null } as const

type SetStore = (fn: (state: { series: SeriesState }) => { series: SeriesState }) => void

export function createSeriesSlice(set: SetStore): SeriesState {
  const patch = (next: Partial<SeriesState>) => set((state) => ({ series: { ...state.series, ...next } }))
  return {
    ...EMPTY,
    runs: [],
    count: SERIES_DEFAULT,
    setCount: (count) => patch({ count: Math.min(SERIES_MAX, Math.max(SERIES_MIN, Math.round(count))) }),
    started: (params, planned) => patch({ ...EMPTY, runs: [], phase: 'running', params, planned }),
    answered: (run) =>
      set((state) => ({
        series: { ...state.series, runs: [...state.series.runs, run].sort((a, b) => a.seed - b.seed) },
      })),
    stopRequested: () => patch({ stopping: true }),
    finished: (error) => patch({ phase: 'done', stopping: false, error: error ?? null }),
    reset: () => patch({ ...EMPTY, runs: [], count: SERIES_DEFAULT }),
  }
}
```

In `store.ts`: import `createSeriesSlice, type SeriesState`, add `series: SeriesState` to `Store` and `series: createSeriesSlice(set),` to the store. Add `state.series.reset()` to `resetApp` in `apps/lab/src/harness/mountApp.tsx`.

Run the Step 1 command. Expected: PASS.

- [ ] **Step 4: Failing pool tests**

`apps/lab/src/series/useSeries.browser.test.tsx`:

```tsx
import { defaultParams } from '@arrowz/engine'
import type { WorkerIn, WorkerOut } from '@arrowz/engine'
import { act } from 'react'
import { render } from 'vitest-browser-react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useStore } from '../state/store'
import { type SeriesHandle, useSeries } from './useSeries'

/** A worker that answers only when a case makes it, recording what it was sent. */
class HeldWorker {
  static made: HeldWorker[] = []
  onmessage: ((event: MessageEvent<WorkerOut>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  sent: WorkerIn[] = []
  terminated = false
  constructor() {
    HeldWorker.made.push(this)
  }
  postMessage(message: WorkerIn) {
    this.sent.push(message)
  }
  terminate() {
    this.terminated = true
  }
  /** Answers its last seed with the given outcome. */
  answer(outcome: 'complete' | 'stopped' = 'complete') {
    const last = this.sent.at(-1)
    if (last?.type !== 'seed') throw new Error('nothing to answer')
    const data: WorkerOut = {
      type: 'seedDone',
      run: { seed: last.params.seed, outcome, pieces: 1, maxLen: 2, genMs: 3, remaining: 0 },
    }
    this.onmessage?.(new MessageEvent('message', { data }))
  }
}

let handle: SeriesHandle | null = null
function Harness() {
  handle = useSeries()
  return null
}
const series = () => useStore.getState().series
const h = () => {
  if (handle === null) throw new Error('not mounted')
  return handle
}

beforeEach(async () => {
  series().reset()
  HeldWorker.made = []
  vi.stubGlobal('Worker', HeldWorker)
  vi.stubGlobal('navigator', { ...navigator, hardwareConcurrency: 8 })
  await render(<Harness />)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const seedsSent = () => HeldWorker.made.flatMap((w) => w.sent.flatMap((m) => (m.type === 'seed' ? [m.params.seed] : [])))

test('the pool is capped at four and each seed goes out once', async () => {
  series().setCount(6)
  await act(async () => h().start({ ...defaultParams(), seed: 100 }))
  expect(HeldWorker.made).toHaveLength(4)
  expect(seedsSent()).toEqual([100, 101, 102, 103])
  await act(async () => HeldWorker.made[2]?.answer())
  expect(seedsSent()).toEqual([100, 101, 102, 103, 104])
})

test('answers out of order end in seed order, and the pool is terminated at the end', async () => {
  series().setCount(2)
  await act(async () => h().start({ ...defaultParams(), seed: 5 }))
  await act(async () => HeldWorker.made[1]?.answer())
  await act(async () => HeldWorker.made[0]?.answer())
  expect(series().phase).toBe('done')
  expect(series().runs.map((r) => r.seed)).toEqual([5, 6])
  expect(HeldWorker.made.every((w) => w.terminated)).toBe(true)
})

test('the first Stop sends no more seeds and keeps what was answered', async () => {
  series().setCount(10)
  await act(async () => h().start({ ...defaultParams(), seed: 1 }))
  await act(async () => HeldWorker.made[0]?.answer())
  await act(async () => h().abort())
  expect(series().stopping).toBe(true)
  const before = seedsSent().length
  for (const w of HeldWorker.made.slice(1)) await act(async () => w.answer('stopped'))
  await act(async () => HeldWorker.made[0]?.answer('stopped'))
  expect(seedsSent().length).toBe(before)
  expect(series().phase).toBe('done')
  expect(series().runs.filter((r) => r.outcome === 'complete')).toHaveLength(1)
})

test('the second Stop terminates the pool at once', async () => {
  series().setCount(10)
  await act(async () => h().start({ ...defaultParams(), seed: 1 }))
  await act(async () => h().abort())
  await act(async () => h().abort())
  expect(series().phase).toBe('done')
  expect(HeldWorker.made.every((w) => w.terminated)).toBe(true)
})

test('the seeds carry the knobs of the start, not later edits', async () => {
  series().setCount(2)
  const params = { ...defaultParams(), W: 30, seed: 1 }
  await act(async () => h().start(params))
  const sent = HeldWorker.made[0]?.sent[0]
  expect(sent?.type === 'seed' && sent.params.W).toBe(30)
  expect(series().params?.W).toBe(30)
})

test('a worker error ends the series with the message', async () => {
  series().setCount(4)
  await act(async () => h().start({ ...defaultParams(), seed: 1 }))
  const data: WorkerOut = { type: 'error', message: 'nope' }
  await act(async () => HeldWorker.made[0]?.onmessage?.(new MessageEvent('message', { data })))
  expect(series().phase).toBe('done')
  expect(series().error).toBe('nope')
  expect(HeldWorker.made.every((w) => w.terminated)).toBe(true)
})
```

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/series/useSeries.browser.test.tsx`. Expected: FAIL (module missing). The chromium project is cross-origin isolated, so the pool makes a stop flag; the Stop cases rely on it.

- [ ] **Step 5: the pool**

`apps/lab/src/series/useSeries.ts`:

```ts
import type { Params, WorkerIn, WorkerOut } from '@arrowz/engine'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useStore } from '../state/store'
import { poolSize, seriesSeeds } from './seeds'

export interface SeriesHandle {
  start(params: Params): void
  abort(): void
}

const series = () => useStore.getState().series

/**
 * A pool of workers for one series, built at its start and terminated at its
 * end so their memory goes back. Seeds go out from a queue, one at a time, to
 * whichever worker answers: a slow seed does not hold the others up. One stop
 * flag is shared by every worker; see `useGenerator` for the two-stage Stop.
 */
export function useSeries(): SeriesHandle {
  const pool = useRef<Worker[]>([])
  const stop = useRef<Int32Array | null>(null)

  const kill = useCallback(() => {
    for (const worker of pool.current) worker.terminate()
    pool.current = []
    stop.current = null
  }, [])

  useEffect(() => kill, [kill])

  return useMemo<SeriesHandle>(
    () => ({
      start(params) {
        kill()
        const queue = seriesSeeds(params.seed, series().count)
        const flag = crossOriginIsolated ? new Int32Array(new SharedArrayBuffer(4)) : null
        stop.current = flag
        series().started(params, queue.length)
        const made: Worker[] = []
        let busy = 0
        const end = (error?: string) => {
          if (pool.current !== made) return
          kill()
          series().finished(error)
        }
        const next = (worker: Worker) => {
          const seed = flag !== null && Atomics.load(flag, 0) === 1 ? undefined : queue.shift()
          if (seed === undefined) {
            if (busy === 0) end()
            return
          }
          busy++
          const message: WorkerIn =
            flag === null
              ? { type: 'seed', params: { ...params, seed } }
              : { type: 'seed', params: { ...params, seed }, stop: flag }
          worker.postMessage(message)
        }
        const size = poolSize(queue.length, navigator.hardwareConcurrency || 2)
        for (let i = 0; i < size; i++) {
          const worker = new Worker(new URL('../worker/generate.worker.ts', import.meta.url), { type: 'module' })
          worker.onmessage = (event: MessageEvent<WorkerOut>) => {
            // A terminated pool's message can still be queued; it belongs to no series now.
            if (pool.current !== made) return
            const message = event.data
            if (message.type === 'seedDone') {
              busy--
              series().answered(message.run)
              next(worker)
            } else if (message.type === 'error') end(message.message)
          }
          worker.onerror = (event) => end(event.message)
          made.push(worker)
        }
        pool.current = made
        for (const worker of made) next(worker)
      },
      abort() {
        if (series().phase !== 'running') return
        const flag = stop.current
        if (flag !== null && !series().stopping) {
          Atomics.store(flag, 0, 1)
          series().stopRequested()
          return
        }
        kill()
        series().finished()
      },
    }),
    [kill],
  )
}
```

`poolSize` of an empty queue is 1; with no seeds the one worker's `next` ends the series at once — acceptable (a series at the ceiling with 0 seeds cannot happen: `seriesSeeds` always includes `seed` itself, which is ≤ the ceiling).

- [ ] **Step 6: Run and commit**

Run: `cd apps/lab && pnpm exec vitest run --project node src/series src/state && pnpm exec vitest run --project chromium src/series && pnpm run check`
Expected: PASS.

```bash
cd apps/lab && pnpm exec prettier --write src/series src/state/series.slice.ts src/state/series.slice.test.ts src/state/store.ts src/harness/mountApp.tsx && cd ../..
git add apps/lab/src/series apps/lab/src/state/series.slice.ts apps/lab/src/state/series.slice.test.ts apps/lab/src/state/store.ts apps/lab/src/harness/mountApp.tsx
git commit -m "Series: a pool of workers checks the knobs seed by seed"
```

---

### Task 4: one gate for runs and series

**Errata to apply: E5, E6, E7, E8, E9.**

**Files:**
- Modify: `apps/lab/src/run/useRun.ts`, `apps/lab/src/run/useRun.browser.test.tsx`
- Modify: `apps/lab/src/App.tsx`
- Modify: `apps/lab/src/run/RunColumn.tsx`, `apps/lab/src/routes/Workspace.tsx`, `apps/lab/src/palette/commands.ts`
- Every test that builds a `RunControl` by hand (the compiler names them: `{ start, abort, hold }` literals) gains `checkSeeds: vi.fn()`.

**Interfaces:**
- Consumes: `SeriesHandle`, `useSeries` (Task 3).
- Produces: `useRun(generator: GeneratorHandle, series: SeriesHandle): RunControl`; `RunControl.checkSeeds(): void` (starts a series from the knobs as they stand; refuses while a rule is broken or a run is in flight); `RunControl.start()` refuses while a series runs; `RunControl.abort()` stops the series when one runs, the run otherwise; a selector `inFlight(state: Store): boolean` exported from `useRun.ts` = `state.run.phase === 'running' || state.series.phase === 'running'`.

- [ ] **Step 1: Failing tests**

In `useRun.browser.test.tsx`, read how it mounts `useRun` with a fake `GeneratorHandle` and add a fake `SeriesHandle` (`{ start: vi.fn(), abort: vi.fn() }`) to that mount. Then:

```tsx
test('no run starts while a series runs — auto-generate included', async () => {
  // mount as the file's other cases do
  useStore.getState().series.started(defaultParams(), 3)
  control().start()
  expect(generator.start).not.toHaveBeenCalled()
})

test('Check seeds starts a series from the knobs as they stand', async () => {
  useStore.getState().params.set('seed', 41)
  control().checkSeeds()
  expect(series.start).toHaveBeenCalledWith(expect.objectContaining({ seed: 41 }))
})

test('Check seeds refuses while a run is in flight or a rule is broken', async () => {
  useStore.getState().run.started(defaultParams())
  control().checkSeeds()
  expect(series.start).not.toHaveBeenCalled()
})

test('Abort stops the series when one runs, not the generator', async () => {
  useStore.getState().series.started(defaultParams(), 3)
  control().abort()
  expect(series.abort).toHaveBeenCalled()
  expect(generator.abort).not.toHaveBeenCalled()
})
```

Adapt `control()`, `generator`, `series` to the file's own helper names. Run: `cd apps/lab && pnpm exec vitest run --project chromium src/run/useRun.browser.test.tsx`. Expected: FAIL.

- [ ] **Step 2: Implement `useRun`**

```ts
import type { Store } from '../state/store'
import type { SeriesHandle } from '../series/useSeries'

/** A normal run or a series: either keeps Generate, New seed and Check seeds off. */
export const inFlight = (state: Store): boolean => state.run.phase === 'running' || state.series.phase === 'running'
```

`RunControl` gains `/** Checks the knobs as they stand over the series' seeds. Refuses while a rule is broken or anything runs. */ checkSeeds(): void`. `useRun(generator, series)`:

```ts
  const start = useCallback(() => {
    cancel.current?.()
    const state = useStore.getState()
    // One gate for every trigger, auto-generate included: a series keeps the cores.
    if (state.params.violations.length > 0 || state.series.phase === 'running') return
    generator.start(state.params.values)
  }, [generator])

  const checkSeeds = useCallback(() => {
    cancel.current?.()
    const state = useStore.getState()
    if (state.params.violations.length > 0 || inFlight(state)) return
    series.start(state.params.values)
  }, [series])

  const abort = useCallback(() => {
    if (useStore.getState().series.phase === 'running') series.abort()
    else generator.abort()
  }, [generator, series])
```

and `useMemo(() => ({ start, abort, hold, checkSeeds }), …)`. `App.tsx`: `const series = useSeries()` beside `useGenerator()`, `useRun(generator, series)`.

- [ ] **Step 3: "In flight" in the three places that disable controls**

- `RunColumn.tsx`: `const running = useStore(inFlight)` in place of `state.run.phase === 'running'` (the meter and label stay the run's: keep a second `const carving = useStore((state) => state.run.phase === 'running')` for the Generate meter's share, the progressbar and the label; `running` drives `disabled` on Generate and Abort, and the focus hand-off).
- `Workspace.tsx`: `busy={lab && carving}` stays the run's (the stage is not busy during a series; the board is unchanged).
- `commands.ts`: `const running = inFlight(state)`.

Read each file's current line before editing (`grep -n "phase === 'running'" <file>`).

- [ ] **Step 4: Fix the `RunControl` literals**

Run: `cd apps/lab && pnpm run check 2>&1 | grep -E "checkSeeds|RunControl" | head -30` and add `checkSeeds: vi.fn()` to each literal it names.

- [ ] **Step 5: Run and commit**

Run: `cd apps/lab && pnpm run check && pnpm exec vitest run --project chromium src/run src/palette src/routes && pnpm exec vitest run --project node`
Expected: PASS.

```bash
git diff --name-only -- apps/lab/src | xargs pnpm exec prettier --write
git add apps/lab/src
git status --short
git commit -m "Run: one gate keeps a run and a series apart, and Abort stops whichever runs"
```

---

### Task 5: the row, the meter and the ⌘K row

**Errata to apply: E5, E10, E11, E12, E13.**

**Files:**
- Create: `apps/lab/src/series/SeriesRow.tsx`, `apps/lab/src/series/SeriesRow.browser.test.tsx`
- Modify: `apps/lab/src/run/RunColumn.tsx` (mount the row, advanced view only)
- Modify: `apps/lab/src/palette/commands.ts`, `apps/lab/src/palette/commands.test.ts`
- Modify: `packages/engine/lab-i18n.ts`

**Interfaces:**
- Consumes: `RunControl.checkSeeds`, `inFlight` (Task 4); `series` slice (Task 3).
- Produces: dictionary keys `checkSeeds` ('Check seeds' / 'Sprawdź ziarna'), `checkSeedsCount` ('seeds' / 'ziaren'), `checkingSeeds(done: number, planned: number)` ('Checking {done}/{planned}' / 'Sprawdzam {done}/{planned}').

- [ ] **Step 1: Failing tests**

`SeriesRow.browser.test.tsx` renders `<SeriesRow control={control} />` with a recording control (`{ start: vi.fn(), abort: vi.fn(), hold: vi.fn(), checkSeeds: vi.fn() }`), `lang` set to `en`, `series` reset:

```tsx
test('the row starts a series', async () => {
  await render(<SeriesRow control={control} />)
  await userEvent.click(page.getByRole('button', { name: 'Check seeds' }))
  expect(control.checkSeeds).toHaveBeenCalledTimes(1)
})

test('the count field writes the slice, held to its range', async () => {
  // commit 500 through the DraftNumber the row uses (see DraftNumber.browser.test.tsx for how a case types into it)
  expect(useStore.getState().series.count).toBe(200)
})

test('while a series runs the button is the meter and disabled', async () => {
  useStore.getState().series.started(defaultParams(), 20)
  useStore.getState().series.answered({ seed: 7, outcome: 'complete', pieces: 1, maxLen: 1, genMs: 1, remaining: 0 })
  await render(<SeriesRow control={control} />)
  const button = page.getByRole('button', { name: /Checking 1\/20/ })
  await expect.element(button).toBeDisabled()
})

test('a run in flight disables the row', async () => {
  useStore.getState().run.started(defaultParams())
  await render(<SeriesRow control={control} />)
  await expect.element(page.getByRole('button', { name: 'Check seeds' })).toBeDisabled()
})
```

Replace the second case's comment with real typing steps copied from `apps/lab/src/console/DraftNumber.browser.test.tsx` (read it first). `commands.test.ts`: a node case — `buildCommands` has a row `run-check-seeds` named `Check seeds`, section `run`, disabled while `run.started(...)`, enabled otherwise; its `run()` calls `deps.control.checkSeeds` and closes the palette (the file's `deps()` helper builds the control; add `checkSeeds: vi.fn()` there if Task 4 did not).

Run them. Expected: FAIL.

- [ ] **Step 2: Dictionary**

`EN.ui`, beside `abort`: `checkSeeds: 'Check seeds',`, `checkSeedsCount: 'seeds',`, `checkingSeeds: (done: number, planned: number) => \`Checking ${done}/${planned}\`,`. `PL.ui`: `checkSeeds: 'Sprawdź ziarna',`, `checkSeedsCount: 'ziaren',`, `checkingSeeds: (done, planned) => \`Sprawdzam ${done}/${planned}\`,`. `pnpm nx build engine`.

- [ ] **Step 3: The row**

`apps/lab/src/series/SeriesRow.tsx`:

```tsx
import type { CSSProperties, ReactElement } from 'react'
import { DraftNumber } from '../console/DraftNumber'
import { useDictionary } from '../i18n'
import { inFlight, type RunControl } from '../run/useRun'
import { useStore } from '../state/store'

/** Checks the knobs on screen over N seeds; while it runs, its button is the meter, as Generate is for a run. */
export function SeriesRow({ control }: { control: RunControl }): ReactElement {
  const dict = useDictionary()
  const count = useStore((state) => state.series.count)
  const setCount = useStore((state) => state.series.setCount)
  const checking = useStore((state) => state.series.phase === 'running')
  const done = useStore((state) => state.series.runs.length)
  const planned = useStore((state) => state.series.planned)
  const busy = useStore(inFlight)
  const blocked = useStore((state) => state.params.violations.length > 0)
  const share = planned === 0 ? 0 : (100 * done) / planned
  return (
    <div className="fw-alt fw-series">
      <button
        type="button"
        className={checking ? 'busy' : undefined}
        onClick={control.checkSeeds}
        disabled={busy || blocked}
        style={checking ? ({ '--p': `${share}%` } as CSSProperties) : undefined}
      >
        {checking ? dict.t('checkingSeeds', done, planned) : dict.t('checkSeeds')}
      </button>
      <DraftNumber
        entryId="series-count"
        label={dict.t('checkSeedsCount')}
        value={count}
        word={dict.t('checkSeedsCount')}
        onCommit={setCount}
      />
    </div>
  )
}
```

Check `DraftNumber`'s props against its file before use; mirror how `RunColumn`'s Generate draws its meter (`fw-go busy` with `--p`) and reuse that class if the meter's CSS is bound to `.fw-go` (`grep -n "\-\-p" apps/lab/src/design/*.css`). In `RunColumn.tsx`, after the `fw-alt` block with New seed / Defaults / Abort: `{simple ? null : <SeriesRow control={control} />}`.

- [ ] **Step 4: The ⌘K row**

In `commands.ts`, after `run-abort`:

```ts
    {
      id: 'run-check-seeds',
      section: 'run',
      name: dict.t('checkSeeds'),
      note: dict.t('cmdSecRun'),
      value: broken ? dict.t('cmdBroken') : running ? dict.t('cmdRunning') : '',
      hay: 'check seeds series many rate',
      disabled: running || broken,
      run: () => {
        deps.control.checkSeeds()
        state.ui.closePalette()
      },
    },
```

- [ ] **Step 5: Run and commit**

Run: `cd packages/engine && deno task test 2>&1 | tail -3 && cd ../../apps/lab && pnpm run check && pnpm exec vitest run --project chromium src/series src/run && pnpm exec vitest run --project node src/palette`
Expected: PASS.

```bash
cd packages/engine && deno fmt lab-i18n.ts && cd ../../apps/lab && pnpm exec prettier --write src/series src/run/RunColumn.tsx src/palette && cd ../..
git add packages/engine/lab-i18n.ts apps/lab/src/series apps/lab/src/run/RunColumn.tsx apps/lab/src/palette
git commit -m "Series: a Check seeds row with its count, its meter and its ⌘K row"
```

---

### Task 6: the "Seeds" section and the status line

**Errata to apply: E5, E14, E15, E16, E17, E18.**

**Files:**
- Create: `apps/lab/src/report/SeriesSection.tsx`, `apps/lab/src/report/SeriesSection.browser.test.tsx`
- Modify: `apps/lab/src/report/ReportPanel.tsx` (lab branch: the section above `ReportSummary`)
- Modify: `apps/lab/src/stage/useRunState.ts`, `apps/lab/src/stage/RunStatusBar.browser.test.tsx`
- Modify: `packages/engine/lab-i18n.ts`

**Interfaces:**
- Consumes: `summariseSeries`, `SeriesSummary` (Task 1, `@arrowz/engine/report`); `series` slice; `RunControl.start`.
- Produces: dictionary keys `seriesTitle`, `seriesStale`, `seriesHead(total, complete, incomplete, unsolvable, stopped)` (numbers), `seriesMeanArrows`, `seriesMeanLongest`, `seriesMeanTime`, `seriesMean_help`, `seriesFailed(seed, outcome, left)`, `seriesOutcome_incomplete|unsolvable|stopped`, `seriesStatus(done, planned)`, `seriesStopping`.

- [ ] **Step 1: Dictionary**

`EN.ui`:

```ts
    seriesTitle: 'Seeds',
    seriesStale: 'for other settings',
    seriesHead: (total: number, complete: number, incomplete: number, unsolvable: number, stopped: number) =>
      `Complete on ${complete} of ${total} · incomplete ${incomplete} · unsolvable ${unsolvable} · stopped ${stopped}`,
    seriesMeanArrows: 'arrows, mean',
    seriesMeanLongest: 'longest, mean',
    seriesMeanTime: 'time, mean',
    seriesMean_help: 'Averaged over the complete seeds only: an incomplete board would pull the numbers towards a board nobody plays. = what a complete board of these settings usually looks like.',
    seriesFailed: (seed: number, outcome: string, left: number) => `seed ${seed} — ${outcome}, ${left} cells left`,
    seriesOutcome_incomplete: 'incomplete',
    seriesOutcome_unsolvable: 'unsolvable',
    seriesOutcome_stopped: 'stopped',
    seriesStatus: (done: number, planned: number) => `Checking seeds: ${done} of ${planned}…`,
    seriesStopping: 'Stopping the seeds…',
```

`PL.ui`:

```ts
    seriesTitle: 'Ziarna',
    seriesStale: 'dla innych ustawień',
    seriesHead: (total, complete, incomplete, unsolvable, stopped) =>
      `Pełna na ${complete} z ${total} · niepełna ${incomplete} · nierozwiązywalna ${unsolvable} · przerwana ${stopped}`,
    seriesMeanArrows: 'strzałki, średnio',
    seriesMeanLongest: 'najdłuższa, średnio',
    seriesMeanTime: 'czas, średnio',
    seriesMean_help: 'Średnia tylko z pełnych ziaren: niepełna plansza ciągnęłaby liczby ku planszy, w którą nikt nie gra. = jak zwykle wygląda pełna plansza przy tych ustawieniach.',
    seriesFailed: (seed, outcome, left) => `ziarno ${seed} — ${outcome}, zostało ${left} pól`,
    seriesOutcome_incomplete: 'niepełna',
    seriesOutcome_unsolvable: 'nierozwiązywalna',
    seriesOutcome_stopped: 'przerwana',
    seriesStatus: (done, planned) => `Sprawdzam ziarna: ${done} z ${planned}…`,
    seriesStopping: 'Zatrzymuję ziarna…',
```

Check the help-text convention (an ending "=" clause) against an existing `stat_*_help` string and the glossary; `pnpm nx build engine`.

- [ ] **Step 2: Failing tests**

`SeriesSection.browser.test.tsx` renders `<SeriesSection control={control} />` (recording control as in Task 5), EN:

```tsx
const runs: SeedRun[] = [
  { seed: 10, outcome: 'complete', pieces: 10, maxLen: 20, genMs: 5, remaining: 0 },
  { seed: 11, outcome: 'incomplete', pieces: 9, maxLen: 9, genMs: 9, remaining: 312 },
]
function seriesDone(params = { ...defaultParams(), seed: 10 }) {
  const s = useStore.getState().series
  s.started(params, 2)
  for (const run of runs) s.answered(run)
  s.finished()
}

test('with no series there is no section', async () => {
  const screen = await render(<SeriesSection control={control} />)
  expect(screen.container.textContent).toBe('')
})

test('the first line counts every outcome', async () => {
  seriesDone()
  await render(<SeriesSection control={control} />)
  await expect.element(page.getByText('Complete on 1 of 2 · incomplete 1 · unsolvable 0 · stopped 0')).toBeVisible()
})

// Review Focus 5: the failed seed opens under the series' knobs, not the panel's.
test('a failed seed opens as a normal run under the series knobs', async () => {
  seriesDone({ ...defaultParams(), W: 30, seed: 10 })
  useStore.getState().params.set('W', 12)
  await render(<SeriesSection control={control} />)
  await userEvent.click(page.getByRole('button', { name: 'seed 11 — incomplete, 312 cells left' }))
  expect(useStore.getState().params.values.W).toBe(30)
  expect(useStore.getState().params.values.seed).toBe(11)
  expect(control.start).toHaveBeenCalledTimes(1)
})

test('after a knob edit the section says it is for other settings', async () => {
  seriesDone()
  useStore.getState().params.set('W', 33)
  await render(<SeriesSection control={control} />)
  await expect.element(page.getByText('for other settings')).toBeVisible()
})
```

`RunStatusBar.browser.test.tsx`, in its style: with `series.started(p, 20)` and one answer, the output reads `Checking seeds: 1 of 20…`; after `series.stopRequested()`, `Stopping the seeds…`.

Run. Expected: FAIL.

- [ ] **Step 3: The section**

`apps/lab/src/report/SeriesSection.tsx`:

```tsx
import { summariseSeries } from '@arrowz/engine/report'
import type { ReactElement } from 'react'
import { useDictionary } from '../i18n'
import type { RunControl } from '../run/useRun'
import { useStore } from '../state/store'
import { StatRowView } from './StatRowView'

/**
 * The last series: its outcome counts, the means of its complete seeds and a
 * button per seed that was not complete. A button loads the series' own knobs
 * with that seed and runs them, so the stage shows the very board that failed.
 */
export function SeriesSection({ control }: { control: RunControl }): ReactElement | null {
  const dict = useDictionary()
  const series = useStore((state) => state.series)
  const values = useStore((state) => state.params.values)
  if (series.params === null || series.runs.length === 0) return null
  const own = series.params
  const s = summariseSeries(series.runs)
  const stale = (Object.keys(own) as (keyof typeof own)[]).some((key) => key !== 'seed' && own[key] !== values[key])
  const tone = s.complete === s.total ? 'good' : s.complete === 0 ? 'bad' : 'warn'
  const open = (seed: number) => {
    useStore.getState().params.setMany({ ...own, seed })
    control.start()
  }
  const means: [string, string, number | null][] = [
    ['series-arrows', dict.t('seriesMeanArrows'), s.meanPieces],
    ['series-longest', dict.t('seriesMeanLongest'), s.meanMaxLen],
    ['series-time', dict.t('seriesMeanTime'), s.meanGenMs === null ? null : s.meanGenMs / 1000],
  ]
  return (
    <section className="fw-series-report" aria-label={dict.t('seriesTitle')}>
      <h3>
        {dict.t('seriesTitle')}
        {stale ? <span className="kv-unit"> · {dict.t('seriesStale')}</span> : null}
      </h3>
      <p className={tone}>{dict.t('seriesHead', s.total, s.complete, s.incomplete, s.unsolvable, s.stopped)}</p>
      <table className="fw-stats">
        <tbody>
          {means.map(([id, label, value]) => (
            <StatRowView
              key={id}
              id={id}
              label={label}
              value={value === null ? '—' : dict.fmt(Math.round(value * 10) / 10)}
              help={dict.t('seriesMean_help')}
              className={undefined}
              delta={<td className="fw-delta" />}
            />
          ))}
        </tbody>
      </table>
      <ul className="fw-series-failed">
        {series.runs
          .filter((run) => run.outcome !== 'complete')
          .map((run) => (
            <li key={run.seed}>
              <button type="button" onClick={() => open(run.seed)}>
                {dict.t('seriesFailed', run.seed, dict.t(`seriesOutcome_${run.outcome}` as const), run.remaining)}
              </button>
            </li>
          ))}
      </ul>
    </section>
  )
}
```

Check against the file's neighbours before running: the tone class names the report uses for good/bad (`grep -n "good\|bad\|warn" apps/lab/src/report/ReportSummary.tsx`), `dict.fmt`'s signature, and that `seriesOutcome_${…}` type-checks as a `UiKey` (else map explicitly `const OUTCOME = { incomplete: 'seriesOutcome_incomplete', … } as const`). Mount in `ReportPanel.tsx`'s lab branch, above `ReportSummary`, with the control passed down from where `ReportPanel` is rendered (follow the existing prop path; if `ReportPanel` has no control, pass it from its parent — `grep -rn "<ReportPanel" apps/lab/src`). Show the section also when `result === null`.

`setMany` with a seed at the knob's range is accepted (`seriesSeeds` never passes the ceiling). The seed change goes through `setMany`, the machine path, so `useAutoRun` does not start a second run on top of `control.start()`.

- [ ] **Step 4: The status line**

In `useRunState.ts`'s `useRunLine`, before the `run.phase === 'running'` branch:

```ts
  const seriesPhase = useStore((state) => state.series.phase)
  const seriesDone = useStore((state) => state.series.runs.length)
  const seriesPlanned = useStore((state) => state.series.planned)
  const seriesStopping = useStore((state) => state.series.stopping)
```

and make the first branch:

```ts
  if (seriesPhase === 'running') {
    text = seriesStopping ? dict.t('seriesStopping') : dict.t('seriesStatus', seriesDone, seriesPlanned)
  } else if (run.phase === 'running') {
```

After a series the line goes back to the board's status; the counts stay in the section.

- [ ] **Step 5: Run and commit**

Run: `cd packages/engine && deno task test 2>&1 | tail -3 && cd ../../apps/lab && pnpm run check && pnpm exec vitest run --project chromium src/report src/stage && pnpm exec vitest run --project node`
Expected: PASS.

```bash
cd packages/engine && deno fmt lab-i18n.ts && cd ../../apps/lab && pnpm exec prettier --write src/report src/stage && cd ../..
git add packages/engine/lab-i18n.ts apps/lab/src/report apps/lab/src/stage
git commit -m "Series: the Seeds section in the report and its status line"
```

---

### Task 7: docs, the whole gate and the live pass

**Errata to apply: E19.**

**Files:**
- Modify: `lab-review.md`
- Modify: `docs/superpowers/specs/2026-09-29-lab-seed-series-design.md` (only where the implementation departed)

- [ ] **Step 1: `lab-review.md`**

The row `| Gap 3: closing rate over N seeds | open | |` becomes `| Gap 3: closing rate over N seeds | fixed on \`lab/seed-series\` | Check seeds: the knobs on screen over N seeds in a worker pool |`. In "What is still open", delete item 4 (every piece of it is done) and renumber nothing else (the list keeps its numbers as cited elsewhere; check `grep -n "item 4\|point 4" lab-review.md` first and adjust any sentence that points at it).

- [ ] **Step 2: Spec touch-ups**

The spec's `seedDone` lists `metrics`; the implementation sends `SeedRun` without it (the section needs arrows, longest and time only). The spec's status line mentions "Checked 20 seeds…" after a series; the implementation shows the counts in the section and returns the line to the board. Edit those two sentences to match.

- [ ] **Step 3: The whole gate**

```bash
set -o pipefail
pnpm nx run-many -t verify 2>&1 | tail -30
```

Expected: every project passes. A failure is fixed in its own file and committed separately.

- [ ] **Step 4: Live pass (the controller runs it, not the implementer)**

Store copy (`cp -R packages/cli/boards /tmp/series-boards`), `ARROWZ_BOARDS_DIR=/tmp/series-boards pnpm nx serve lab`, a hard reload in Chrome, then: 200×200 Check seeds 20 → counts and means, a failed seed (lower `pStraight` until one fails) opens as a run; 1000×1000 Check seeds 8 → the meter moves, Stop keeps the answered seeds, a second Stop ends at once; auto-generate on + a slider moved mid-series starts no run; Polish once; `find packages/cli/boards -newer <marker>` on the real store is empty. Stop the servers by port.

- [ ] **Step 5: Commit**

```bash
git add lab-review.md docs/superpowers/specs/2026-09-29-lab-seed-series-design.md
git commit -m "Docs: Check seeds done; item 4 of the lab review closed"
```
