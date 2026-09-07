# Arrowz — implementation roadmap

> **For agentic executors:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to execute the plans slice by slice.
> Steps use checkbox syntax (`- [ ]`) to be checked off.

**Goal:** Bring Arrowz from a repository containing only a specification
and a disposable prototype to a playable PWA game in Angular 22, with
optional profile and score synchronization through Firebase.

**Architecture:** The core (`core/`, `game/`) is plain TypeScript with no DOM, no
framework, and no global randomness — tested in Node and portable to a Web
Worker. The view layer (`render/`) sits behind an interface so that swapping SVG
for Canvas never touches the core. The shell (`ui/`) is Angular 22 in zoneless
mode, built as a static prerender. Firebase (`data/`) is a layer **overlaid
on top of a finished game**, never a precondition for running it.

**Stack:** TypeScript 5.9+ (strict), Angular 22 (standalone, zoneless, signals,
signal forms), Vitest (Angular CLI's default runner), SVG, `@angular/pwa`,
Firebase (Auth, Firestore, Functions v2, Hosting, App Check).

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md`

**Decisions made before the plan** (confirmed with the user on 2026-09-07):

| Question | Resolution |
|---|---|
| SSR? | **No.** Static prerender (`outputMode: "static"`), game route `RenderMode.Client`. Deploy as static files, PWA offline without complications. |
| Hosting | **Cloudflare Workers** with Static Assets. The Worker has no server-side logic — it only serves the built files. |
| Firebase scope in MVP | **Last slice.** Slices 0–9 deliver a fully playable offline game, with scores in `localStorage`. Slice 10 layers on account and sync. |
| Cloudflare / Firebase role split | Worker = static hosting. Firebase = Auth, Firestore, and the `verifyRun` Cloud Function, called directly from the client. |
| Firebase integration | **Modular SDK** (`firebase/app`, `firebase/auth`, `firebase/firestore`) wrapped in custom signal-based services. No `@angular/fire`. |

---

## Global Constraints

The following applies **to every task in every slice**. It is not repeated
in the task bodies.

- **Core isolation.** Files in `src/core/` and `src/game/` must not import
  anything from `src/render/`, `src/ui/`, `src/data/`, or `@angular/*`. They
  must not touch `document`, `window`, `Math.random()`, or `Date.now()`.
  Enforced by the ESLint rule `no-restricted-imports` (Slice 0, Task 4).
- **Determinism.** The only source of randomness is `mulberry32(seed)`,
  passed explicitly. The same seed must produce bit-for-bit the same board.
- **TypeScript strict.** `strict: true`, `noUncheckedIndexedAccess: true`,
  zero `any` in `core/` and `game/`.
- **Minimum piece length: 2 cells.** Board coverage: **exactly
  100%** — every cell belongs to exactly one piece.
- **`occupancy` is an `Int32Array`**, value `-1` denotes an empty cell.
  `Int8Array` would overflow at ~2,300 pieces on Nightmare.
- **Directions:** `0 = up, 1 = right, 2 = down, 3 = left`. Vectors:
  `[{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}]`. `cells[0]` is the cell with the
  arrowhead, `dir` is the direction from `cells[1]` to `cells[0]`. The body lies
  **behind** the arrowhead.
- **Default generator parameters** (measured, spec §7): length-bucket
  weights `0.50 / 0.20 / 0.30`, Warnsdorff strength `4`, `pStraight = 0.6`,
  `wLateral = 3`, `Lmax = round(2.5 · max(W, H))`, backtrack budget `3000`,
  restart budget `5`.
- **Rendering parameters** (visually verified, spec §11): a single
  `<polyline>` through the cell centers, stroke width `0.5` of the grid unit
  (configurator range `0.35–0.65`), `stroke-linecap` and `stroke-linejoin` =
  `round`, arrowhead as a filled triangle ~`0.6` of a grid unit, colors
  `#232447` on `#f6f6fa`. Monochrome rendering is a **gameplay requirement**,
  not a cost-saving measure.
- **Three lives.** Points only for a completed board; a loss scores 0.
- **Commits:** after each task, commit message in English, imperative mood
  ("Add", "Introduce", "Fix"). No mentions of AI tools and no attribution
  lines.
- **Language:** everything in the repository is English — code, identifiers,
  comments, tests and documentation (see `CLAUDE.md`). Polish appears only in
  UI translation dictionaries; user-facing tools ship a Polish/English UI.

---

## Spec extensions adopted in this plan

Three places where the plan **deliberately goes beyond** the specification.
Each has a rationale and a test.

### 1. Scoring: multipliers weighted by board variety

The formula from spec §10, implemented literally, **fails its own test 26e**.
Computed on a 100×100 board made entirely of vertical dominoes:

| Metric | 100×100 domino | 100×100 Nightmare |
|---|---|---|
| `f0` | 0.020 | 0.059 |
| `almost1 / N` | ~0.98 | 0.07 |
| `D` | 49 | 32 |
| **score per §10** | **~764** | **~274** |

The degenerate board wins, because all three "difficulty" metrics come out
**better** on it than on a real board. The reason is conceptual: `almost1`
measures temptation toward a mistake under the assumption that the player
doesn't see the pattern. On a domino board the pattern is obvious ("take the
tallest one"), so the temptation is illusory.

**Fix:** the `f0`, `almost1`, and `D` multipliers are weighted by a
`variety ∈ [0,1]` coefficient, computed from the entropy of the direction
distribution and the length distribution. A uniform board has `variety = 0`
and loses all three multipliers. This requires two new fields on
`BoardMetrics`: `dirEntropy` and `lenEntropy`.
Details and calibration: **Slice 5, Task 3**.

### 2. Move log in the session

`Session` carries `moves: number[]` — the sequence of clicked `pieceId`
values. The spec doesn't require this, but without it the Cloud Function in
Slice 10 has nothing to replay, and a score saved on the server is
unverifiable. Cost: one array of numbers. Side benefit: undo (§13) becomes
trivial.

### 3. `Board` is immutable

`removePiece` returns a **new** `Board` with a copy of `occupancy`, instead
of mutating the existing one. Copying 20,000 cells costs 80 kB and ~10 µs —
irrelevant for a single click, and it keeps the reducer pure, with no
exceptions or caveats.

---

## Slices

Each slice has its own plan file and ends with a **working, testable
increment**. The order is a dependency, not a preference: slice N assumes
slice N−1 has been delivered.

| # | Slice | File | What it delivers by the end |
|---|---|---|---|
| 0 | Application scaffold | [slice-00-scaffold.md](2026-09-07-arrowz/slice-00-scaffold.md) | `ng test` and `ng build` pass, directory structure and architectural boundary work |
| 1 | Geometry core | [slice-01-geometry-core.md](2026-09-07-arrowz/slice-01-geometry-core.md) | `probeMove` and `removePiece` with a full set of tests §12.1–8, 24, 25 |
| 2 | Generator | [slice-02-generator.md](2026-09-07-arrowz/slice-02-generator.md) | `generate(params)` closes the board to 100% at all sizes |
| 3 | Solver and metrics | [slice-03-solver-metrics.md](2026-09-07-arrowz/slice-03-solver-metrics.md) | Every board independently verified; property-based tests over hundreds of seeds |
| 4 | Benchmark and presets | [slice-04-benchmark-presets.md](2026-09-07-arrowz/slice-04-benchmark-presets.md) | Measurement report, Easy–Nightmare presets in both formats, acceptance thresholds |
| 5 | Session and scoring | [slice-05-session-scoring.md](2026-09-07-arrowz/slice-05-session-scoring.md) | Complete game as a pure reducer — playable from a test |
| 6 | Renderer and viewport | [slice-06-renderer-viewport.md](2026-09-07-arrowz/slice-06-renderer-viewport.md) | Board renders in SVG, zoom and pan work, performance budget measured |
| 7 | Angular shell | [slice-07-angular-shell.md](2026-09-07-arrowz/slice-07-angular-shell.md) | **First playable version**: start screen, HUD, end screens, controls |
| 8 | Configurator | [slice-08-configurator.md](2026-09-07-arrowz/slice-08-configurator.md) | Advanced mode on signal forms, with a 25% warning and a generation report |
| 9 | PWA, local scores, and deploy | [slice-09-pwa-and-deploy.md](2026-09-07-arrowz/slice-09-pwa-and-deploy.md) | Game works offline, scores survive tab close, deploy to Cloudflare Workers |
| 10 | Firebase | [slice-10-firebase.md](2026-09-07-arrowz/slice-10-firebase.md) | Account (anonymous → persistent), sync, score verified server-side from the seed |

### Critical path

```
0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 9 → 10
                          ↘ 8 ↗
```

Slice 8 (configurator) depends on 7, but doesn't block 9 — they can be done
in parallel if more than one person or agent is executing the plan.

### Milestones

- **After slice 4:** the core is measured and calibrated. Every number from
  spec §9 is either confirmed or replaced by a measured value.
- **After slice 7:** the game is playable. Everything beyond this is an
  overlaid layer.
- **After slice 9:** the MVP is complete as defined in spec §1.

### What this plan deliberately does not do

Per spec §13, the following stay out of scope: undo, hints, level
progression, leaderboards, sound, polished visuals, and animation beyond the
minimum. `prototype/` is not extended or ported — the implementation starts
from scratch, and the prototype remains as a reference point for
measurements.
