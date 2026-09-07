# Prototype — throwaway code

## Lab (interactive)

```sh
sh prototype/lab.sh          # http://localhost:8777/lab.html
```

All generator knobs live in the side panel; the board is drawn immediately.
A preset drop-down at the top is a tree: a difficulty level per group
(`lab-presets.mjs`), a few options each — square, portrait, tunnels, skeleton;
the huge level also has a winding skeleton (serpentine step 3, every run cut
short, so no skeleton line goes wall to wall). The tree ends with Insane,
1000×1000 — the project ceiling, square only (~10 s in Node, ~27 s in the
browser worker; layers and skeleton modes take minutes there, see round 9).
A preset is a full configuration (defaults plus its overrides), and the
drop-down follows the knobs: change the width by hand and it goes blank.
Every description is one or two plain sentences on what a knob does and which
way to turn it; the measurements behind them are in the rounds below.
On top of that there are preview toggles: **arrow colouring** (each piece in a
different colour — diagnostic mode) and **highlighting the N longest pieces**
(in pink, with a table of their length, span, density and coiling).

The configuration is stored in the URL, so a setting can be revisited or
shared as a link. The panel shows, **before** generating, the CLI command
matching the current knobs — the lab is a layer over `carve.mjs` and mirrors
it 1:1: the same command in a terminal gives the same board byte for byte
(`carve.test.mjs` guards this). The UI is bilingual (PL/EN switch in the
panel header; the choice is kept in `localStorage` and in the URL).

Every generated board — from the lab and from `carve.mjs --svg` — lands in
`prototype/boards/<W>x<H>/<id>.svg` with metadata and the command in
`<id>.json` (gitignored; the id is the seed plus a hash of the parameters, so
the same configuration overwrites its own entry). The **Saved boards** tab
browses the store by size, shows the command next to the board, loads its
settings into the knobs and deletes a board from disk (two clicks on the same
button, no dialog; `DELETE /api/boards/<WxH>/<id>`).

The engine lives in `engine.mjs` and is shared by the lab and by `carve.mjs` —
there are no two copies of the algorithm that could drift apart.

A probe for the specification, **not production code**. It was built to settle three
open questions before the implementation plan was written. It has no tests, no types and
no view layer, and it must not be developed further — the implementation starts from scratch, in TypeScript.

```
node prototype/carve.mjs --svg --w=25 --h=50 --seed=7 --cell=12    # one board -> prototype/boards/
node prototype/carve.mjs --svg=board.svg --w=100 --h=200 --giants=4 --cell=8 --top=5
node prototype/carve.mjs                         # report on all levels
node prototype/carve.mjs --only=Easy·sq --show   # with ASCII preview
node prototype/carve.mjs --headbias=1            # tunnelling (deepest line)
node prototype/carve.mjs --headbias=-1           # layers (shallowest line)
node prototype/carve.mjs --wlateral=6 --pstraight=0.6 --runs=3
node prototype/carve.mjs --bench=20 --only=Extreme·sq
node prototype/carve.mjs --only=Insane           # 1000×1000, the ceiling; ~10 s per run
```

Engine parameters are `--<PARAM_SPEC key in lower case>=value`; the defaults
are the same as in the lab. Old names `--straight`, `--lateral`, `--absorb`,
`--giantspacepen` work as aliases. Format flags: `--square`, `--portrait`
(report and benchmark modes; level names get the suffix `·sq` or `·pt`).
Levels run from Easy 25 to Insane 1000; Insane exists only as a square, so the
default report (3 runs per level and format) takes about half a minute longer
than it did when it stopped at Extreme.

## What it settled

1. **Carving from a full board with a minimum length of 2 works.** 100% coverage
   and solvability at all four sizes, on average 0–0.5 backtracks per
   board, zero restarts.
2. **Performance is not a problem.** Nightmare 100×100: 27 ms of generation, 14 ms of metrics.
   Web Worker, bitboards and the reverse index struck from the specification.
3. **Preferring the deepest line is a working difficulty regulator.** It halves `f0`
   and doubles the depth of the blocking graph.

## What it exposed as a problem

4. **The `T_k` metric is always zero at full fill** — replaced by the
   `almost1` metric (pieces blocked by exactly one foreign piece).
5. **A turn is legal only at the height of the neighbouring line's frontier**, so without
   countermeasures boards come out as stripes of straight lines. The biggest open
   question of the project.
6. **The length distribution does not deliver what was ordered** — 28–47% of paths get stuck, the achieved
   mean is ~30% lower than the ordered one.

Details and conclusions recorded in `docs/superpowers/specs/2026-09-07-arrowz-design.md`
(§7, §9, §11, §13, §14).

## Round 2 — board appearance

Question: why do boards come out as stripes of straight lines, and can that be fixed.

**Answer: under the current rules it cannot.** On every line it touches, a piece must
occupy a contiguous segment starting exactly at the frontier, so a turn is
possible only when the piece's depth matches, cell for cell, the frontier of the
neighbouring line. The condition applies to **every valid board**, not just this
generator. On top of that, shape and difficulty pull in opposite directions:

| variant | turns/piece | multi-line | f0 |
|---|---|---|---|
| tunnelling (deepest line) | 0.15 | 6% | 0.20 |
| layers (shallowest line) | 0.72 | 29% | 0.42 |

**Rule B — a piece rides its own track.** The corridor is a single ray from the head
to the edge, not the shadow of the whole shape; the body slides along the head's trail. The shape stops
being constrained. All the mathematics survives: the ray from the head is just as static, so
the blocking graph remains static, and solvability still equals acyclicity.

To close the board under rule B, **Warnsdorff's rule** during path growth turned out to be
necessary (go where the fewest free exits remain) — without it the freely
winding body fragments the rest and a 100x100 board does not close.

Nightmare 100x100, rule B + Warnsdorff: 100% coverage, solvable, 2041 pieces,
longest 74, f0 = 0.061, **1.87 turns per piece, 69% multi-line**, 0 backtracks,
34 ms of generation.

```
node prototype/carve.mjs --only=Easy --ruleb --warns=4 --lateral=3 --show
```

## Round 3 — calibration

Questions: what is the tail of the generation time, and can the length distribution be calibrated.

**Longer pieces improve everything at once.** Counter-intuitively, fewer pieces means fewer
decisions, and every decision is an opportunity to fragment the rest of the board. Nightmare with
weights `0.10/0.70/0.20` versus `0.70/0.285/0.015`: p99 time 442 ms instead of 979,
6 restarts out of 30 instead of 23, 4.48 turns per piece instead of 1.84, mean length 9.6
instead of 4.8. The earlier observation about paths getting stuck was an artefact of rigid
translation.

**Warnsdorff's rule remains required** — without it 1 board in 30 does not generate
at all. It does, however, control turns and the coiling of paths into balls at the same time (20% coiling
at strength 0, 39% at 8).

**The time distribution is extremely heavy-tailed.** The median is uninformative:
Nightmare p50 = 17 ms, p99 = 442 ms. Zero failures on 30–100 seeds with five
restarts allowed.

Configuration adopted as the default:

```
node prototype/carve.mjs --ruleb --warns=4 --wshort=0.10 --wmid=0.70 --lateral=3
node prototype/carve.mjs --bench=30 --ruleb --only=Nightmare --wshort=0.10 --wmid=0.70
```

**Open:** the final calibration of appearance cannot be done on the ASCII preview —
box-drawing characters do not depict a path touching itself, and that is every third cell.
Tuning `warns` and the length weights has to happen on the target SVG renderer.

## Round 4 — SVG renderer and visual calibration

```
node prototype/carve.mjs --svg=plansza.svg --size=50 --cell=14 --warns=4 --wshort=0.62 --wmid=0.23
node prototype/carve.mjs --svg=debug.svg --colored     # colour per piece, diagnostic mode
rsvg-convert -w 900 plansza.svg -o plansza.png
```

The render overturned the calibration from round 3. Weights chosen for the generation-time tail
(`0.10/0.70/0.20`) give a **sprawling** board — a few dozen long meanders
and sparsely scattered arrowheads. The reference has a heavy-tailed distribution: dense arrowheads **plus**
a few very long lines.

| weights | pieces (25×25) | mean len. | appearance |
|---|---|---|---|
| 0.70 / 0.285 / 0.015 | 134 | 4.7 | dense arrowheads, nothing but short hooks |
| **0.62 / 0.23 / 0.15** | **97** | **6.4** | **like the original** |
| 0.10 / 0.70 / 0.20 | 62 | 10.1 | sprawling, sparse arrowheads |

The price of the adopted weights: p99 time on Nightmare rises from 442 to 658 ms, restarts from 6 to 15
per 30 runs, failures still zero.

Drawing parameters giving the reference appearance: line width 50% of the grid pitch,
`stroke-linecap` and `stroke-linejoin` set to `round`, arrowhead as a filled triangle
with a side of ~0.6 of the pitch, colours `#232447` on `#f6f6fa`.

## Round 5 — coiling versus wrapping

Question from the review: why do long lines fold mainly **against themselves**, lying
coiled into a ball, instead of wrapping around other pieces.

**Cause: Warnsdorff's rule rewards coiling.** The heuristic goes where the fewest
free exits remain, and one's own freshly placed cell lowers the neighbours' degree of freedom —
so it drags the line back onto itself all on its own. Nothing rewarded adjacency to other
pieces.

Knobs and metrics added:

```
--anticoil=N   penalty for touching one's own path (other than the cell we come from)
--hug=N        bonus for adjacency to pieces already carved
--edgehug=N    whether the board edge counts as a foreign piece
```

New metrics in the report: `coiling` (existed before), `shared border` (what fraction of its length
a piece shares with a single foreign piece), `foreign neighbours/piece`, `turns/cell`.

Measured on four boards, 10 seeds per variant, with **equalised mean piece
length** (the penalty shortens pieces, so bucket weights were chosen for each variant):

| variant | coiling | shared border | turns/piece |
|---|---|---|---|
| baseline | 44% | 41% | 4.21 |
| anticoil 3 | 34% | 46% | 3.59 |
| anticoil 4 | 31% | 50% | 3.69 |
| **anticoil 6** | **27%** | **50%** | 3.32 |
| anticoil 4 + probes 15% | 30% | 48% | 3.51 |

**Rejected:** `hug` adds 1–2 points on top of the penalty alone; deep probes (`--probe`, long
straight thrusts meant to create peninsulas to wrap around) add nothing. All of the improvement comes
from **removing the incentive to coil**, not from adding an incentive to wrap.

**Price:** there are fewer turns per piece (4.21 → 3.32), because some of the former turns came
precisely from coiling. The two quantities are coupled.

**Robustness unchanged:** 100% coverage, boards solvable, vertical Nightmare 100×200
in 64 ms, at most 0.5 restarts per run.

```
node prototype/carve.mjs --svg=p.svg --w=25 --h=50 --anticoil=6 --wshort=0.20 --wmid=0.08
```

The section-F variants are reproduced with commands in the lab (Saved boards
tab) — the `preview.sh` gallery was replaced by the board store.

## Round 8 — hardening of board closing (boards up to 200×200)

Question: why does a 200×200 board often fail to close (1 failure per 10 seeds,
half of the runs with a restart), and why are the lines short and pressed against each other.

```
node --test 'prototype/*.test.mjs'                  # robustness tests (decomposable, local defect, absorption, closing)
node prototype/carve.mjs --only=Extreme    # 200×200
```

**Cause 1 — a faulty decomposability test for the leftover fragment.** `decomposable` grew
the path only from the first cell of the set, so that cell had to be
an end of the path. An L-tromino iterated from the corner and a straight triple from the middle
came out "non-decomposable", and the result depended on the order of cells in the set.
In the endgame the generator rejected valid paths and declared a jam that
did not exist; the blind backtrack changed nothing, because after re-carving the same
test rejected the same thing. Hence also the old advice "a test limit above 8 makes things worse".
New version: covering with dominoes and path-trominoes over bitmasks
(every path ≥ 2 splits into segments of 2 and 3 — Akiyama–Avis–Era), exact
up to 30 cells. This fix alone: 200×200 from 1/10 failures to 0/20, time 1.4 s → 0.2 s.

**Cause 2 — the shortening loop "escaped" the test.** A fragment above the limit
passed without being checked. Shortening the path hands cells to the neighbouring
fragment one at a time, and a defect of the "cross with three leaves" kind is local and does not
go away by adding cells elsewhere — so the loop produced a non-decomposable
fragment of size exactly limit+1 (9–10 at limit 8, 25 at 24).
Raising the limit by definition achieves nothing. Fix: (a) a local-defect test
independent of the limit — Tutte's condition for |S| ≤ 2 checked within radius 2 of the
path, because only there do degrees change after carving; (b) a fragment that
failed the exact test is remembered and rejected once it grows above the limit.

**Cause 3 — blind backtrack.** With 5000 pieces the last k carvings lie
in a random region of the board. The backtrack now rewinds to the newest piece touching
the leftover fragment (at least 1 + log₂ of the number of backtracks), and the budget dropped from 3000 to 200, because
a restart is cheaper than deep rewinding.

**Safety net — leftover absorption.** When no head yields
a legal path, the tail end of a neighbouring piece (from the contact cell to the tail) plus
the fragment are laid out into a new Hamiltonian path. Always legal: head, neck
and ray unchanged, the cells keep the same index, and no ray
passes through a free cell — the blocking graph is identical. The
`absorbLeftover` test verifies this via `analyse().solvable`.

| configuration (200×200, no restarts) | before | after |
|---|---|---|
| default, 100 seeds | 1/10 failures, 1.4 s | **0/100**, 0.2 s, 0 backtracks |
| penalty 6 + weights 0.2/0.08, 30 seeds | 4/20 with a restart | **0/30**, 0.4 s |
| skeleton 4 × 30 sides, 15 seeds | 1/10 with a restart | **0/15**, 0.4 s |
| without Warnsdorff / short only / tunnels | 1/15 each | **0/15** each |
| nine sizes from 10×10 to 200×200 | — | **0/30** each |

**Lines too short — cause measured, not removed.** 48–84% of paths get stuck
before the ordered length; the tail dies on average after 10 cells, surrounded by ~2.3
foreign pieces, i.e. in a nook of the frontier that
Warnsdorff drags it into (a nook with a single exit has weight 16 versus 1 for open
space). Checked and rejected: backtracking inside the path (still gets stuck
77–84%), inverted Warnsdorff (shorter lines), lateral bonus 0.5–1 (no change).
This confirms round 7: random growth has a ceiling; only the skeleton yields long lines.

What changed in the defaults: `Lmax` = 0 means 2.5 × side (the constant 125 was truncating
the long bucket at 200×200), coiling penalty 6, weights 0.20/0.08, straightness 0.85.
At 200×200: mean length 8.7 → 11.0, coiling 41% → 28%; at 25×50 the span of the
top 10% of pieces 37% → 48%. The lab shows a new row "stuck before
target" and the number of absorbed leftovers.

**Scale after hardening.** The limit from round 7 (300×300–400×400) has ceased to exist:
400×400 closes with 0/5 failures without restarts in ~1.4 s (old defaults 0/5, ~1.9 s;
skeleton 0/3, ~1.3 s), 1000×1000 in 10.6 s, zero backtracks, 95 absorptions,
solvable, longest piece 453. The lab has a 400×400 preset.

### Which knobs can break something (200×200, 3–6 seeds, no restarts)

Only two settings break closing, both from the "difficulty" group: **piece start
= layers** (`headBias` -1) and **mixing = 0** (layers only). At 200×200
1 run in 3 needs a restart, time up to 6 s (layers) and 10 s (mixing 0);
up to 100×200 both work flawlessly. Disabling **leftover absorption**
(`absorbLimit` 0) breaks nothing by itself at the defaults, but in layers
mode the board then fails to close in 5 out of 6 runs — it is the only safety
net for hard settings.

Time is broken by **straight-line tendency = 0**: ~9 s instead of 0.3 s, up to 18 s, because of 160
absorptions per run. Appearance is broken by the extremes: **lateral bonus = 0** and
**straightness = 1** give ~1000 pieces instead of 3600 in huge coils
(coiling 47–53%), **nooks = 16** coils up to 41%, **serpentine step = 2** gives
one skeleton per 6000 cells like lines on a sheet of paper.

No effect on closing across the whole range: start attempts, backtrack budget, exact
leftover test, edge as a piece, adjacency bonus, probes, seed.

## Round 9 — the ceiling moves to 1000×1000 (Insane)

Decision: the project limit is 1000×1000, the Insane level, square only (a
1000×2000 portrait would double a generation that already takes ~10 s). The lab
tree, the CLI level list, the spec and the implementation plans follow.

```
node prototype/carve.mjs --only=Insane                       # defaults: ~10 s, 0 backtracks
node prototype/carve.mjs --svg --w=1000 --h=1000 --headbias=-1   # layers: minutes
```

Measured (seed 7, one run each, Node 24):

| configuration | 400×400 | 1000×1000 |
|---|---|---|
| defaults | 1.4 s | ~10 s, 85 764 pieces, f0 0.006 |
| layers (`headBias` -1) | **149 s** | **> 10 min** (53% carved after 610 s, aborted) |

A CPU profile of layers at 400×400 put **86% of the time in the recursive
`dfs` inside `absorbLeftover`** and 6% in its neighbour helper: layers leave
many leftover fragments, and every candidate anchor burns a 20 000-node
search that allocates a `Set`, arrays and a sort per node, after a full-board
scan per call. The default knobs do not hit this path (95 absorptions on a
million cells), which is why they scale linearly. The Rust question was
measured on the way: the default hot path (`hasLocalDefect`, `wouldStrand`)
is already typed-array loops, so a rewrite would buy 2–5×, not the 100× the
absorption search needs from an algorithmic fix.

**The fix — same board, a fraction of the time.** The real multiplier was not
the search itself but its repetition: `absorbLeftover` runs before every
backtrack (up to 200 per attempt), each time re-scanning every fragment and
re-failing the same searches. Two changes, both preserving the exact search
order and budget so that the same seed yields the same board:

1. **Memo of failed fragments.** Every change of a cell's owner (carve, undo,
   absorb) stamps the cell with a version; a piece whose tail was rewritten
   by an absorption gets a tail version. A fragment is identified by its
   smallest cell index; if neither its cells, nor their neighbours, nor any
   candidate tail changed since its last failed attempt, it is skipped.
2. **Allocation-free search** (`absorbPath`): region and used-cell membership
   are stamps in typed arrays, the per-depth Warnsdorff candidates live in one
   preallocated buffer with a stable insertion sort (ties in `DIRS` order,
   like the stable `Array.sort` before it).

Guarded by `engine.test.mjs`: two layers-mode boards (150×150 seed 7,
200×200 seed 5 with a restart) recorded as FNV fingerprints of the owner grid
and piece cell sequences before the change, plus a time bound.

| layers (`headBias` -1), seed 7 unless noted | before | after |
|---|---|---|
| 200×200 seed 5 (restart, 200 backtracks) | 8.5 s | 2.1 s (absorption ~12%) |
| 400×400 | 149 s (172 s in the equivalence run) | 6.7 s, same fingerprint |
| 1000×1000 | > 20 min for the first attempt (aborted at 54%) | ~3 min per attempt |

**Layers do not close at Insane — cause found, not fixed.** With the fast
search the 1000×1000 run finally reaches the end: four attempts (the default
restart budget) in 692 s, 11 179 absorptions, and the board does **not**
close. The investigation (seed 7, one attempt each, no restarts):

| size | at the jam: free cells | fragments | largest | legal heads |
|---|---|---|---|---|
| 400×400 | 107 | 28 | 10 | 46 |
| 600×600 | 297 | 76 | 23 | 96 |
| 800×800 | 11 736 | 968 | 483 | 356 |
| 1000×1000 | 61 496 | 2 258 | 8 829 | 504 |

From 800 up the jam is not "leftovers": 6% of the board is still free, in
regions of thousands of cells, with hundreds of legal heads. The geometry is
fine — **the head selection is the blocker.** With piece start = layers,
`carveOne` ranks the legal heads of a direction by the depth of their line
and draws its 4 tries only from the **shallowest quarter**. In the endgame
the shallowest lines are exactly the tiny pockets next to the frontier: at
the 1000×1000 jam the pool holds heads of fragments ≤ 20 cells almost
exclusively, while the 100+-cell regions' heads sit in the deeper three
quarters and are never drawn (e.g. direction 0: pool 19 heads in 2–5-cell
fragments and 3 in 6–20; outside the pool 12 in 21–100 and 18 in 100+).
Every backtrack then undoes the newest neighbour of *some* free cell, which
is in the region being carved, not at the dead pockets, so 200 backtracks
change nothing. Proof by continuation: from the jammed state, switching
`headBias` to 0 (all heads in the pool) closes the rest at 400×400 in 2 ms
and at 1000×1000 in 960 ms, both with **zero backtracks**.

Layers are not reliable at 400×400 either: seed 5 fails after 3 restarts.

Candidate fix, measured on a copy of the engine outside the repo: when the
4 tries in the shallowest quarter fail, try the second, third and fourth
quarter in turn before giving up — the piece still starts as shallow as it
can, and reaches deeper only when the shallow pockets are dead.

| layers, seed | repo engine | with the quarter fallback |
|---|---|---|
| 400×400 seed 7 | 1 restart, 40 backtracks, 8.2 s, f0 0.0246 | 0 / 0, 3.2 s, f0 0.0204 |
| 400×400 seed 5 | **fails** after 3 restarts, 18.8 s | 0 / 0, 2.1 s, f0 0.0190 |
| 400×400 seed 3 | 0 / 0, 2.2 s, f0 0.0179 | 0 / 0, 2.0 s, f0 0.0177 |
| 1000×1000 seed 7 | fails after 4 attempts, 692 s | 0 / 0, 35 s, f0 0.0069 |

f0 stays within noise of the current layers boards, so the look is not
paid for. **Applied** in `carveOne`: the fallback is symmetric, so tunnels
(`headBias` 1) now move from the deepest quarter to the shallower ones too;
their f0 on Nightmare 100×200 (seeds 1–5) stays within noise (0.0079 →
0.0085, 0.0161 → 0.0159, 0.0174 → 0.0169, 0.0084 → 0.0084, 0.0110 → 0.0109)
and their boards change (8 absorptions → 0 on seed 7 at 200×200). Boards with
`headBias` 0 are untouched (200×200 seed 7: fingerprint `3a0a686` before and
after). The fingerprint tests were re-recorded; `engine.test.mjs` also guards
that layers close 400×400 on seeds 5 and 7 without a restart or a backtrack.

**Before the refactor of round 9** the same seeds gave the same boards: the
default 1000×1000 (seed 7) has fingerprint `32c62121` in both engines, and
the 400×400 layers run with a restart `5d446ea4` in both. The old engine's
first layers attempt at 1000×1000 takes over half an hour, so its jam
report was not waited for; by construction (same search order, same budget,
memo skips only attempts that would fail identically) it is the same jam.
