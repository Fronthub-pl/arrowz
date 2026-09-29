# Lab: check the knobs on N seeds

Piece E of item 4 ("Parity gaps") in `lab-review.md`: Gap 3, the closing rate
over N seeds. Base: `lab/stop-and-open` (PR #127), whose shared stop flag this
reuses; rebase on `main` once #127 is merged.

## Goal

The lab shows one board from one seed, so a board that fills tells nothing about
whether the knobs are safe or the seed was lucky. `deno task report` answers that
in the terminal by running the same knobs over many seeds. The lab gets the same
answer for the knobs on screen: "complete on 18 of 20 seeds", with the averages
of the complete boards and the seeds that were not.

Out of scope: the levels × formats sweep of `report.ts`; filling the store with
N boards (`carve --count`); the simple view; keeping a result across reloads.

## Decisions (user, 2026-09-29)

- Purpose: tune the knobs on screen (the size and every knob in the panel).
- Seeds: the panel's seed and the next ones up, `seed, seed + 1, …,
  seed + N − 1`, so a repeat gives the same result and every seed that failed
  can be opened on its own.
- The board on screen does not change; the series gives numbers only.
- N is a field, default 20, range 2–200.
- Several workers in parallel.
- Advanced view only.

## Measured cost (Deno, this machine, 8 cores of which 4 performance)

| Board | One seed | Process memory |
|---|---|---|
| 200×200 | 0.3 s | ~90 MB |
| 500×500 | 1.6 s | ~175 MB |
| 1000×1000 | 10.9 s | ~390 MB (heap ~110 MB) |

Twenty seeds at 1000×1000 take about 3.5 min on one worker and about a minute on
four; four such workers hold on the order of 1–1.5 GB. Hence the cap below.

## Engine (neutral)

- `WorkerIn` gains `{ type: 'seed'; params: Params; stop?: Int32Array }`: one
  seed, one answer, no board file.
- `WorkerOut` gains
  `{ type: 'seedDone'; seed: number; outcome: SeedOutcome; pieces: number;
  maxLen: number | null; genMs: number; remaining: number; metrics: Metrics | null }`
  with `SeedOutcome = 'complete' | 'incomplete' | 'unsolvable' | 'stopped'`,
  from `GenerateResult`, in this order: `aborted` → stopped; `ok && deadlock`
  → unsolvable (a full board that cannot be solved, a generator bug);
  `ok` → complete; otherwise incomplete. `remaining` is the
  empty cells left (`stuck.remaining`, 0 when complete).
- `summariseSeries(runs: readonly SeedRun[])` in `lab-report.ts`, pure: the
  count of each outcome, the total, and the means over the complete runs only
  (arrows, longest arrow, generation time), as `report.ts` averages its closed
  runs only. Means are `null` when no run is complete.

## Worker

`generate.worker.ts` answers `seed` by `generate(params, { trace })` with the
same stop check as a normal run (Stop keeps what it has), and posts `seedDone`.
A `seed` message never posts `progress` (the pool reports seeds done, not cells).

## Pool (`apps/lab/src/series/`)

- `useSeries()` owns a pool of `min(N, navigator.hardwareConcurrency − 1, 4)`
  workers (at least 1), built from the same worker module as the lab's own
  worker, which is not touched.
- Seeds are handed out from a queue: a worker that answers gets the next seed.
  Slow seeds (restarts after a jam) do not hold the others up.
- One stop flag (a one-element `Int32Array` over a `SharedArrayBuffer`) is
  shared by every worker of the pool. First Stop: the flag is raised, running
  seeds answer `stopped`, no further seed is handed out, the pool ends when the
  running ones answer. Second Stop: every worker is terminated at once. Without
  cross-origin isolation there is no flag and Stop terminates at once.
- The knobs are read once, at start; editing them during a series changes
  nothing in it.
- The pool is terminated when the series ends, so its memory goes back.
- While a series runs, Generate, New seed and a second series are disabled
  (the same "a run is in flight" rule); Abort stops the series.

## State (`series` slice)

`{ phase: 'idle' | 'running' | 'done'; params: Params | null; count: number;
runs: SeedRun[]; stopping: boolean }`. `runs` is kept in seed order whatever
order the answers arrive in. A new series replaces the last result. Not saved
anywhere; a reload forgets it.

## What the page shows

- Run column (advanced view), under New seed / Defaults / Abort: a row
  "Check seeds" with a number field (default 20, 2–200). While a series runs the
  button is the meter, "Checking 7/20", as Generate is during a run.
- ⌘K: a row "Check seeds" that starts a series with the field's count.
- Report drawer: a section "Seeds" above the board's report, while a result
  exists:
  - the first line: "Complete on 18 of 20 · incomplete 2 · unsolvable 0 ·
    stopped 0", coloured by the share complete (all → good, none → bad);
  - the means over the complete seeds in the report's row form, each with a
    `?`;
  - the seeds that were not complete, each "seed 1007 — incomplete, 312 cells
    left" as a button that sets that seed and generates it as a normal run
    (`control.start()`), so the stage shows where it got stuck.
- When the knobs on screen differ from the series' `params`, the section stays
  and carries "for other settings" beside its title.
- The status line: "Checking seeds: 7 of 20…" while running, "Checked 20 seeds:
  complete on 18" after, "Stopped after 9 of 20 seeds" after a Stop.
- Every string in `lab-i18n.ts`, EN and PL, passing `glossary.test.ts` (no
  "close(d)", "jam", "piece(s)" in English).

## Tests

- Unit: `summariseSeries` over real `generate()` runs, including an
  incomplete one, an unsolvable-free set, a stopped one and none complete
  (means null); the outcome mapping from `GenerateResult`.
- `worker-smoke.mjs`: the built worker answers `seed` with `seedDone` whose
  outcome and arrow count match `generate` on the same knobs.
- Browser: the pool keeps seed order with out-of-order answers (held workers);
  the queue hands each seed out once; the pool size is capped; first Stop
  keeps the answered seeds and marks the running ones stopped; second Stop
  terminates; the pool is terminated at the end.
- Browser UI: the row and field; the meter; the "Seeds" section with its first
  line; a failed seed's button sets the seed and starts one run; "for other
  settings" after a knob edit; Generate disabled during a series.

## Docs

`lab-review.md`: the Gap 3 row marked done on this branch; item 4 of "What is
still open" is removed (all its pieces done).
