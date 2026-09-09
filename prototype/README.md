# Prototype — throwaway code

## Toolchain

Deno 2.9 (`deno --version`), no Node. `deno task test` runs every test,
`deno task verify` adds type check, lint and format check. The CLI is
`deno task carve …` (see `--help`); `deno task compile` builds a single
binary at `prototype/dist/carve`. The lab page and worker are TypeScript,
bundled by `deno task bundle` into `prototype/dist/`; `sh prototype/lab.sh`
builds once, rebuilds on every edit and serves without caching. The
generator is unchanged by the rewrite: `fingerprints.json` holds nine boards
recorded on Node; `fingerprints.test.ts` reproduces all nine of them on every
run. Measured on 2026-09-09, 500×500 seed 7: Deno 1.35 s vs Node 24 1.42 s of
generation, the same fingerprint `298c749e`.

## Lab (interactive)

```sh
sh prototype/lab.sh          # http://localhost:8777/lab.html
```

The panel has two views, switched at the top and remembered in
`localStorage`. The **simple** view (the default) offers the board size
(width and height, edited like in the advanced view), two sliders — piece
length from very short to very long, line
shape from the straightest lines to the most winding — a skeleton switch
(with, without) and the seed. `lab-simple.ts` maps a choice to a full
parameter set: a slider has anchors at 0, ¼, ½, ¾ and 1, each giving every
knob it controls a range with a canonical value, and positions in between
interpolate the ranges; the default position (long, slightly winding, no
skeleton) is exactly the engine default. A slider position is a wish, not
one configuration: with **randomise the settings on every generate**
ticked, each Generate (and New seed) draws the knobs inside the ranges at
that position, so the same sliders and the same seed give a different board
every time. The ranges are narrower than the engine envelope and follow the
measurements below: straightness stays at 0.65 or above (0.7 above 600 cells
a side), the coiling penalty stays low with low straightness, the skeleton
never gets dense, layers mode is skipped at a million cells, and the closing
knobs keep their defaults (a random backtrack budget turns a jam into minutes
of waiting). Measured with the CLI (`--dry-run --restarts=0`, random draws):
the three middle anchors of each slider close 36/36 at 200×200 and 400×400,
and the eight extreme combinations (very short or very long, straightest or
most winding, with or without a skeleton) close 24/24 at 200×200, 400×400
and 500×500 and 16/16 at 1000×1000, all with 0 backtracks; the one slow
corner is very short plus most winding at 1000×1000 — 24–51 s for 120–136
thousand pieces in that batch, and the canonical corner (`--length=0
--straight=0`, seed 7, 173 thousand pieces) 33–35 s before round 13 and
21–28 s after it, one process at a time on a loaded machine — everything
else there stays under 14 s. Whatever was drawn
goes through the knobs, so the command, the URL and the advanced view show
exactly what was generated. Switching views never touches the knobs; the
form is applied when something in it is clicked.

The **advanced** view has all generator knobs in the side panel; the board is
drawn immediately.
A preset drop-down at the top is a tree: a difficulty level per group
(`lab-presets.ts`), a few options each — square, portrait, tunnels, skeleton;
the huge level also has a winding skeleton (serpentine step 3, every run cut
short, so no skeleton line goes wall to wall). The tree ends with Insane,
1000×1000 — the project ceiling, square only (~10 s in Node, ~8–9 s in the
browser worker with the tab in front, and about 4× longer when another
window is in front, because macOS demotes a backgrounded renderer to the
efficiency cores — the page still reports itself visible; layers take ~20 s
and a skeleton ~10 s there, see rounds 9 and 12).
A preset is a full configuration (defaults plus its overrides), and the
drop-down follows the knobs: change the width by hand and it goes blank.
Every description is one or two plain sentences on what a knob does, which
way to turn it and when it breaks; the measurements behind them are in the
rounds below.

Every knob has a **safe range**: the bounds of the inputs come from
`PARAM_SPEC`, the same table the engine validates against (round 11). Values
loaded from a URL, a preset or a stored board are pulled into that range, and
a notice says so once. Rules that tie several knobs together (short plus
medium shares at most 0.9; `Lmax` 0 or at least 6; mixing -1 or between 0.3
and 0.7) are checked after every change: the offending rows turn red with the
reason next to the help text, the violations are listed under the preset
drop-down, and **Generate stays disabled** until they are fixed. The CLI
command stays visible, so a blocked configuration can still be copied.
On top of that there are preview toggles: **arrow colouring** (each piece in a
different colour — diagnostic mode) and **highlighting the N longest pieces**
(in pink, with a table of their length, span, density and coiling).

The configuration is stored in the URL, so a setting can be revisited or
shared as a link. The panel shows, **before** generating, the CLI command
matching the current knobs — the lab is a layer over `carve.ts` and mirrors
it 1:1: the same command in a terminal gives the same board byte for byte
(`carve.test.ts` guards this). The UI is bilingual (PL/EN switch in the
panel header; the choice is kept in `localStorage` and in the URL).

Every generated board — from the lab and from `carve.ts` — lands in
`prototype/boards/<W>x<H>/<id>.svg` with metadata and the command in
`<id>.json` (gitignored; the id is the seed plus a hash of the parameters, so
the same configuration overwrites its own entry — keeping its original
`createdAt`, hence its place in the list, and recording the write in
`updatedAt`). The stored file has no
highlight of the longest pieces — that pink is a preview aid in the lab tab;
the store gets a separate render with `top` 0 and a command without `--top`. The **Saved boards** tab
browses the store by size — entering the tab or picking a size shows the
first board of that size right away — shows the command next to the board, loads its
settings into the knobs and deletes a board from disk (two clicks on the same
button, no dialog; `DELETE /api/boards/<WxH>/<id>`). The stroke width and
arrow colouring of a stored board can be changed there: the board is rebuilt
from its parameters in a separate worker (the engine is deterministic),
redrawn and saved back through the same POST, so the file stays what its CLI
command would produce and the board stays where it was in the list. That tab has no
generation controls at all: the panel shows the board's command and the
stroke, arrowhead and colour rows in the place of the lab's, plus fit and
zoom; the list, "Load into lab" and "Delete" stay on the right. Generating
happens in the lab tab.

The engine lives in `engine.ts` and is shared by the lab and by `carve.ts` —
there are no two copies of the algorithm that could drift apart.

A probe for the specification, **not production code**. It was built to settle three
open questions before the implementation plan was written. It has no view layer and it
must not be developed further — the implementation starts from scratch; its typed engine
is the reference the product code is compared against.

The default call is the **simple mode**: the same inputs as the simple view
of the lab (`lab-simple.ts` turns them into engine parameters in both), one
board into the store every time. `--length` and `--straight` are the two
sliders, 0..1; `--straight=1` is the straightest board. `--randomized` draws
the knobs afresh inside the slider ranges, like the lab's checkbox, with
`Math.random`, so the simple command is a wish, not a configuration: the
board's meta keeps the full `--advanced` command that reproduces it byte for
byte (`command`) next to the simple one as typed (`simpleCommand`). Any flag
outside the list below is refused with exit code 2 and a hint.

```
deno task carve --width=25 --height=50                               # the lab's default board -> prototype/boards/
deno task carve --width=100 --height=200 --length=0.25 --straight=0.9 --skeleton --seed=3
deno task carve --width=400 --height=400 --randomized --colorized --lineweight=0.4
deno task carve --width=25 --height=50 --arrowwidth=0.8 --arrowheight=1.2 --svg=board.svg
deno task carve --width=25 --height=50 --dry-run                     # compute only, one JSON line
deno task carve --help                                               # the simple flags
```

`--advanced` unlocks every engine knob, the report and the benchmark. The
lab's advanced view prints its command in this form.

```
deno task carve --advanced --svg --w=25 --h=50 --seed=7 --cell=12             # one board -> prototype/boards/
deno task carve --advanced --svg=board.svg --w=100 --h=200 --giants=4 --cell=8 --top=5
deno task carve --advanced                                  # report on all levels
deno task carve --advanced --only=Easy·sq --show            # with ASCII preview
deno task carve --advanced --headbias=1                     # tunnelling (deepest line)
deno task carve --advanced --headbias=-1                    # layers (shallowest line)
deno task carve --advanced --wlateral=6 --pstraight=0.6 --runs=3
deno task carve --advanced --bench=20 --only=Extreme·sq
deno task carve --advanced --only=Insane                    # 1000×1000, the ceiling; ~10 s per run
deno task carve --advanced --dry-run --w=25 --h=50 --seed=7                 # compute only, nothing written
deno task carve --advanced --help                           # every knob: flag, range, step, default, help; the cross-knob rules
CARVE_TIMEOUT_S=120 deno task carve --advanced --svg --w=1000 --h=1000 --seed=30   # give up after two minutes, store what was carved
```

`--dry-run` generates, measures and renders exactly like `--svg` (with or
without it on the command line) but writes neither the store entry nor the
`--svg=path` copy. It prints one JSON line: the board id the store would use,
the engine parameters, the metrics (pieces, mean and maximum length, bends,
coiling, f0, solvability), times, and a fingerprint of the board — the FNV
hash the engine tests freeze recorded boards with — so two runtimes or two
engine versions can be compared without a file. A board that fails to close
prints a JSON line with `ok: false` and exits with code 1.

**A board that does not close is stored too.** `--svg` and the simple mode
write it like a closed one, with the free cells drawn as holes (the lab's
"show jammed cells" rendering), so that a jam can be looked at and not only
counted; the exit code stays 1 for scripts. The meta carries the closing
report next to `ok: false`: `restarts` and `backtracks` used, `stuck` (cells
left, fragment sizes, legal heads at the best moment) and `aborted`.
`CARVE_TIMEOUT_S=N` is a wall-clock budget for measurements: past N seconds
the run is aborted from the progress callback, no restart follows, and the
board carved so far is stored with `aborted: true` (`--dry-run` prints the
same fields and writes nothing). For that to work the engine calls the
progress callback at least once a second, not only at every 500th piece: in a
thrash the piece count circles one value and used to miss every multiple of
500 for minutes, which also silenced the lab's progress bar. The 1000×1000
diagnosis of round 9 relied on this in its Node form (the archived branch
`archive/worktree-jam-preview`); this is the same tooling on Deno.

Engine parameters are `--<PARAM_SPEC key in lower case>=value`; the defaults
are the same as in the lab. Old names `--straight`, `--lateral`, `--absorb`,
`--giantspacepen` work as aliases. Format flags: `--square`, `--portrait`
(report and benchmark modes; level names get the suffix `·sq` or `·pt`).
Levels run from Easy 25 to Insane 1000; Insane exists only as a square, so the
default report (3 runs per level and format) takes about half a minute longer
than it did when it stopped at Extreme.
`--help` (or `-h`) prints the usage, a table of every knob (flag, label,
allowed range `min..max`, step, default, one-line help), the cross-knob rules
and the old aliases; it needs no other flag and exits with code 0.

**Every mode validates before generating.** The parsed engine parameters go
through `validateParams` from `engine.ts` (the same check the lab runs after
every knob change, and the one `generate()` itself repeats) before a single
cell is carved. A value outside its `PARAM_SPEC` range, or a broken cross-knob
rule, ends the run with **exit code 2** and nothing written. The report,
`--only`, `--bench` and `--svg` modes print to stderr:

```
invalid parameters:
  - straightness bias: 0.3 is outside 0.6..1
see --help for the allowed ranges
```

one `  - ` line per violation, in the `formatViolation` format: a range
violation is `<label>: <value> is outside <min>..<max>`, a rule violation is
the rule's text (for example `short and medium shares together must stay at
or below 0.9`). `--dry-run` keeps its JSON contract and prints one line to
stdout instead:

```
{"ok":false,"error":"invalid parameters","violations":[{"kind":"range","key":"pStraight","value":0.3,"min":0.6,"max":1}]}
```

A rule violation in that array looks like
`{"kind":"rule","key":"sharesSum","keys":["wShort","wMid"]}`. Exit codes,
then: 0 the board closed, 1 it failed to close, 2 it was refused before
carving. Boards stored before round 11 may have been made with settings that
are now outside the range: their SVG stays in the store and can be viewed,
but the lab refuses to rebuild them (a notice instead of a worker error) and
their command exits with code 2.

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
deno task carve --advanced --only=Easy --ruleb --warns=4 --lateral=3 --show
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
deno task carve --advanced --ruleb --warns=4 --wshort=0.10 --wmid=0.70 --lateral=3
deno task carve --advanced --bench=30 --ruleb --only=Nightmare --wshort=0.10 --wmid=0.70
```

**Open:** the final calibration of appearance cannot be done on the ASCII preview —
box-drawing characters do not depict a path touching itself, and that is every third cell.
Tuning `warns` and the length weights has to happen on the target SVG renderer.

## Round 4 — SVG renderer and visual calibration

```
deno task carve --advanced --svg=plansza.svg --size=50 --cell=14 --warns=4 --wshort=0.62 --wmid=0.23
deno task carve --advanced --svg=debug.svg --colored              # colour per piece, diagnostic mode
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
`stroke-linejoin` set to `round`, flat line ends (`stroke-linecap="butt"`)
with the tail rounded by a circle of the line's radius, and a head that
follows the line width: under a stroke of 0.5 an arrow — a filled isosceles
triangle 1.8 times as wide as the line (half a pitch at least, a pitch at
most), always 0.9 of a pitch tall; from 0.5 up a sharpened stick —
exactly as wide as the line and 1.4 times as tall, because a wider head no
longer fits between neighbours. Both sizes can be set by hand: the lab has
two knobs next to the stroke (also on a stored board), the CLI takes
`--headwidth=R` and `--headheight=R` in cells; 0 keeps the automatic rule,
and a head narrower than the line is widened to it. The tip sits 0.48 past the head cell centre
so it stays inside that cell, a bigger head grows backwards, and the line
runs up to the base itself. Colours `#232447` on `#f6f6fa`. History: a
fixed head with a 0.62 tip overshot into the next cell and facing heads
overlapped; a fixed 0.84 base touched heads at a right angle; a fixed head
was swallowed by the round cap from a stroke of 0.5 up (checked at 0.2..0.9
in 0.05 steps on a 25×25 board: legible to 0.45, gone from 0.55); a head
only slightly wider than the line, with the round cap ending short of the
base, looked like a triangle perched on a pill; and a round cap under a
stick head bulged at the base.

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
deno task carve --advanced --svg=p.svg --w=25 --h=50 --anticoil=6 --wshort=0.20 --wmid=0.08
```

The section-F variants are reproduced with commands in the lab (Saved boards
tab) — the `preview.sh` gallery was replaced by the board store.

## Round 8 — hardening of board closing (boards up to 200×200)

Question: why does a 200×200 board often fail to close (1 failure per 10 seeds,
half of the runs with a restart), and why are the lines short and pressed against each other.

```
deno task test                                      # robustness tests (decomposable, local defect, absorption, closing)
deno task carve --advanced --only=Extreme             # 200×200
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
deno task carve --advanced --only=Insane                                # defaults: ~10 s, 0 backtracks
deno task carve --advanced --svg --w=1000 --h=1000 --headbias=-1            # layers: minutes
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

Guarded by `engine.test.ts`: two layers-mode boards (150×150 seed 7,
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
after). The fingerprint tests were re-recorded; `engine.test.ts` also guards
that layers close 400×400 on seeds 5 and 7 without a restart or a backtrack.

**Before the refactor of round 9** the same seeds gave the same boards: the
default 1000×1000 (seed 7) has fingerprint `32c62121` in both engines, and
the 400×400 layers run with a restart `5d446ea4` in both. The old engine's
first layers attempt at 1000×1000 takes over half an hour, so its jam
report was not waited for; by construction (same search order, same budget,
memo skips only attempts that would fail identically) it is the same jam.

## Round 11 — the safe envelope

Question: which knobs make a board fail to close, at which values, and why.
Rounds 8 and 9 answered it for the defaults up to 200×200 and for layers at
1000×1000, but the lab still let every knob run over its whole range, and a
preset, a URL or a stored board could carry a configuration nobody had
measured. The answer is a measured **envelope**: narrower `PARAM_SPEC`
ranges plus three cross-knob rules, enforced in one place (`validateParams`
in `engine.ts`) and surfaced by every entry point: `generate()` throws
`RangeError('invalid parameters: ...')` with the violations attached, the
CLI exits with code 2, the lab pulls loaded values into range and blocks
Generate while a violation stands.

```
deno task carve --advanced --help                                           # the envelope, knob by knob
deno task carve --advanced --dry-run --w=400 --h=400 --pstraight=0.3            # refused: exit 2, one JSON line
deno test prototype/envelope.test.ts                             # the envelope, the rules, the pinned fingerprint
```

**Method.** Five measurements run in parallel, about 8100 generations
without restarts (`restarts` 0, so every jam counts, and no run was
restarted by hand), boards up to 400×400: a sweep of every knob alone at
200×200 and 400×400, a random sweep of the whole knob space at 400×400, a
`pStraight` by `anticoil` grid, a rescue test (does `headTries`, `maxBack`
or `restarts` save a seed that jammed) and a re-read of an earlier
1000×1000 random sweep. Alongside, a code-level analysis of what `Carver`
holds at the moment it gives up.

**Mechanism.** A jam is a set of free islands that all still have legal
heads but nothing carvable from them: an L whose head sits in the corner, so
the ray leaves no cell to grow into, or a "hair" beside the head whose ray is
blocked by another free island. The islands wait on each other in a cycle,
so no single carve resolves them and a backtrack rarely lands on them.
`wouldStrand` checks that the leftover is coverable by paths of length at
least 2, not that the cuts can be made in any order; the exact test
(`strandLimit`) and absorption (`absorbLimit`) are the nets that catch such
islands while they are small. Every knob in the table either produces the
islands faster or removes a net.

| knob | old range | new range | why |
|---|---|---|---|
| `pStraight` | 0..1 | 0.6..1 | the only knob that jams alone: 400×400 jams 5/5 at 0.3 or less, 3/5 at 0.4, backtracks at 0.45-0.5, clean from 0.6; in the 1000×1000 random sweep 92% closed at 0.6 or more against 48% below |
| `warns` | 0..16 | 2..16 | 0 and 1 give the same board (the rule is off); 3 of the 8 random jams at 400×400 had `warns` 0; at 1000×1000 with low `pStraight`, `warns` of 9.5 or more closed 72% against 26% |
| `anticoil` | 1..20 | 1..10 | 10 or more with `pStraight` at most 0.45 jams 4/5; even `pStraight` 0.6 with `anticoil` 20 jammed 1/3 at 400×400 |
| `absorbLimit` | 0..64 | 12..64 | 0 at `pStraight` 0.3 jams 9/10 with a median of 3 backtracks; in the random 400×400 sweep, below 13 closes 78-80% against 86-100% |
| `strandLimit` | 2..30 | 10..30 | 2-3 leaves ten-cell leftovers ("left 10 in 1") from 500×500; below 10 costs 1.5-2.2× the time |
| `headTries` | 1..32 | 2..16 | 1 starves the search at low `pStraight` (0.3: 8/10 jams, 0.2: 5/10); with `absorbLimit` 0 it is 0/10 and neither restarts nor backtrack budget rescue it; 8 or more gives the same board as 4 in 8/10 seeds |
| `maxBack` | 0..200000 | 0..1000 (0 = 200) | a backtrack costs ~18 ms at 200×200; 1000 rescued 1 of 11 jams, 5000 rescued none more at 61-139 s |
| `restarts` | 0..10 | 0..5 | restarts rescue shredded jams 8/8 within 2 (p ~ 0.67 per restart); beyond 5 there is no evidence of help |
| `wGiant` | 0..0.5 | 0..0.2 | 0.43 or more in 3 of the 4 high-`pStraight` timeouts at 1000×1000; the top quartile costs 2× the time |
| `giantStraight` | 0..1 | 0.3..1 | below 0.15 closes 50% in the 400×400 random sweep; it is active at every `giantStep`, see below |
| `giantSpacing` | 1..6 | 1..3 | 6 costs 1.9× the time and has no effect on closing |

Defaults are unchanged, and every preset (square, portrait, tunnels,
skeleton, serpentine, Insane) sits inside the envelope with margin.

**Cross-knob rules** (`RULES` in `engine.ts`, texts in `RULE_REASONS`):

- `wShort + wMid <= 0.9`: the long bucket keeps at least a tenth of the
  pieces. Not measured in this round; it pins the heavy-tailed distribution
  of round 4 instead of letting the weights order a board without long
  pieces.
- `Lmax` is 0 (automatic, 2.5 × the longer side) or at least 6: `Lmax` 3 is
  pathological (200×200: 2/10 jams after 40-60 s; 400×400 8× the time),
  worse than 2 or 4; 4-5 are 1.8× slower. Pieces that short cut the board
  into crumbs.
- `mix` is -1 (off) or between 0.3 and 0.7: the extremes, `[0, 0.3)` and
  `(0.7, 1]`, close 80% against 94-96% inside the band.

**`giantStraight` and `giantWarns` are active at every serpentine step.**
The lab used to dim them as "only works with serpentine step 0". Wrong: the
serpentine only seeds the path, the tail keeps growing on these weights, and
with `wGiant` > 0 the later giants grow entirely on them. Their inactive
reason is now the skeleton being off (`giants` 0 and `wGiant` 0), the
`stepNonZero` reason is gone, and `giantJitter` alone keeps `stepZero`. The
`giantStraight` bound above was measured with that in mind. All help texts
were rewritten in the same pattern: what the knob does, which way to turn
it, when it breaks.

**Not covered.** 1000×1000 was not re-validated in this round; the Insane
figures above come from the earlier random sweep, and the envelope is a
400×400 result that the Insane presets merely sit inside. Several bounds are
time-only, not closing bounds: above `maxBack` 1000, `restarts` 5,
`giantSpacing` 3, `headTries` 16 and `wGiant` 0.2 the board still closes,
it only takes longer or gives the same board. The difficulty and skeleton
knobs never jam up to 400×400 (2236/2236 closed, 0 backtracks); they only
degrade appearance (`giantJitter` 0 gives one piece of `giantSpan` × side
cells; `probe` 1 with `probeLen` 2 gives 11 000 crumbs), so they keep their
full ranges.

**Fix ideas left for later**, in the order they would pay off:

1. A hair and L-corner test at cut time: reject a cut that leaves a free
   island whose only heads are corner heads or heads with a blocked ray,
   instead of finding the island at the jam. `wouldStrand` would then check
   the order of cuts, not only coverability.
2. Extending a path instead of only shortening it when the leftover fails
   the test: today the loop hands cells back one at a time, which is why
   `absorbLimit` and `strandLimit` carry so much weight.
3. Never let the straight weight reach zero inside the engine, so that the
   low end of `pStraight` bends instead of jamming; then the floor of 0.6
   could come down.
4. Several `carveOne` draws before a backtrack: a backtrack costs ~18 ms at
   200×200 and rarely lands on the jam, while another head or direction is
   almost free.

## Round 12 — the envelope at 500×500 and 600×600, and the shortening loop

Question: does the envelope of round 11, a 400×400 result, hold at 500×500
and 600×600 — and where does the time go on the boards that close but take
minutes.

```
deno task carve --advanced --dry-run --w=600 --h=600 --seed=2 --restarts=0 --pstraight=0.6                                   # jams: 87 cells left in 30 crumbs
deno task carve --advanced --dry-run --w=600 --h=600 --seed=3 --restarts=0 --wgiant=0.16 --giantspan=163 --giantstep=2            # closes; the dense-skeleton corner
deno test prototype/shortening.test.ts                                         # the loop: original versus incremental, pinned fingerprints
```

### The envelope at 500×500 and 600×600

**Method.** Five measurements in parallel on `main` at `09966e7`, 1 319
boards by the reports' own counts, every one through the canonical CLI
`--dry-run` with `restarts` 0 (so every jam counts and nothing was rerun by
hand), wall-clock budgets 300 s up to 500×500, 420 s at 600×600, 480 s at
700 and 800; no board ran out of budget. The five domains: baseline
(defaults and the six modes, 15 seeds each, a scaling series from 100 to
800), shape (every shape and length knob at its envelope edge, plus five
conjunctions with `pStraight` 0.6), skeleton (every skeleton and probe knob
at its edge, and the two old "slow" sets), closing (the closing, difficulty
and rescue knobs) and a random joint sweep (80 knob sets drawn uniformly
inside the envelope, each run at both sizes). Timing caveat: five agents
shared 8 cores, load 30–69 during most batches, so `genMs` from the batches
carries up to 2–4× of load noise; closing, backtracks, piece counts and
fingerprints are unaffected, and the cost figures below come from quiet
single-process CPU passes wherever they exist. The harness and raw data live
outside the repository.

| domain | boards | closed | jams | where the jams are |
|---|---|---|---|---|
| baseline: defaults and six modes, 100–800 | 338 | 338 | 0 | — |
| shape and length knobs at the edges | 280 | 254 | 26 | all with `pStraight` 0.6: alone at 600, with `warns` 2, with `anticoil` 10 |
| skeleton and probe knobs at the edges | 360 | 360 | 0 | — |
| closing, difficulty and rescue knobs | 161 | 161 | 0 | — |
| random joint sweep, 80 sets × 2 sizes, follow-ups | 180 | 180 | 0 | — |

Zero backtracks on every board that closed (backtracks appear only in the
trace of boards that then jam), 0 timeouts, and generation is deterministic:
128 repeated runs of 70 flag sets gave 0 fingerprint mismatches.

**Verdict.** The envelope holds at 500×500 for every single knob and at
600×600 for every knob but the `pStraight` floor. It leaks in two places:
closing at the `pStraight` 0.6 corner, time at the dense-skeleton corner.

**Leak 1 — the `pStraight` 0.6 corner** (every other knob at its default;
`×` is the cost against the defaults under the same load):

| setting | 500×500 | 600×600 |
|---|---|---|
| `pStraight` 0.6 alone | 15/15 closed, 0 backtracks, 7–15 s (×4–6) | **11/15**: jams at seeds 2, 3, 8, 13; 25–31 s (×8–10) |
| `pStraight` 0.6 + `warns` 2 | **0/5** | **0/5** |
| `pStraight` 0.6 + `anticoil` 10 | **5/10** | **0/5** |
| `pStraight` 0.65 | 5/5 (×3.3) | 10/10 (×5–7) |
| `pStraight` 0.7 | 5/5 (×2.6) | 10/10 (×2–5) |
| `pStraight` 0.6 + `warns` 16 + `anticoil` 10 | 5/5, control time | 5/5, control time |
| `pStraight` 0.6 + `Lmax` 6, or + `wShort` 0.9 `wMid` 0 | 5/5, cheaper than 0.6 alone | 5/5, cheaper than 0.6 alone |

The four jams of 0.6 alone at 600 are fragment jams: 87 / 735 / 2 975 /
3 657 cells left (at most 1% of the board) in 30 / 234 / 699 / 785 crumbs,
three of the four after spending 132–198 of the 200-undo budget; seed 2 dies
with 87 cells in 30 crumbs of 2–4 cells and 30 legal heads. The conjunctions
fail by shredding: with `warns` 2, 12–20% of the board is still free at 500
and 25–35% at 600, in 1 355–2 548 fragments with 308–438 legal heads, and
three of five boards at each size gave up with zero backtracks — the head
scan alone spent the budget. Jams are deterministic (seeds 2 and 3 jammed
identically in two runs, same `stuck` record). `warns` 16 neutralises the
whole corner, and short pieces (`Lmax` 6, all-short shares) relieve it
rather than compound it. The envelope has no rule that couples `pStraight`
with `warns` or `anticoil`; this round records the leak and does not move
the floor.

**Leak 2 — the dense-skeleton time tail.** All 160 boards of the random
sweep closed, but 3/80 at 600 took over 60 s (350.6, 99.3, 62.8 s) and 1/80
at 500 (59.8 s), all "slow, no jam": 0 backtracks, remaining shrinking,
closed inside the budget. The predictor is `wGiant` ≥ 0.13 with `giantStep`
≤ 7 and `giantSpan` ≥ 100: 5 sets, at 600 median 62.8 s and 4/5 above 30 s,
while the other 75 boards never exceed 29.3 s; the same corner costs 20–60 s
at 500. Every such board also has `pStraight` 0.60–0.63, but that is a
co-factor: 0.62 → 0.85 on the worst board brings 350 s down to 40.6 s only,
and from the defaults the corner is slower with `pStraight` 0.85 (65 s) than
with 0.6 (20 s). Ablation on the worst set (sweep set 29, seed 29, 600×600):
`wGiant` 0.16 → 0 gives 17.7 s, `giantStep` 2 → 14 gives 8.7 s, `giantSpan`
163 → 30 gives 21.0 s, `wGiant` → 0.06 gives 24.0 s; `giantSpacePenalty`,
`giantStraight` and `giantSpacing` leave it at 182–197 s. It is a seed
lottery: the same knobs with seeds 1029 / 2029 / 3029 take 48.6 / 16.8 /
15.0 s, and the second-worst set takes 99.3 s with its seed and 6.6 / 9.1 s
with two others. On the worst board the first 500 pieces take 209 s of 227,
which is where the `wGiant` skeletons are laid (about 80 of them, target
span 163 × 600 cells each); the CPU profile puts 95.8% of 182 s inside
`wouldStrand` (self time 41.9% `hasLocalDefect`, 34.1% its `nbrs`, 14.5%
`wouldStrand`, 4.0% `freeDeg`), called from the shortening loop in
`carveOne`, and skeleton growth itself at 0.1 s. The skeleton domain saw the
same thing in the small: `giants` 4 with `giantStep` 2 and `giantSpan` 198
at 600 grows three giants to 39–41 k cells, each fails the leftover test and
is trimmed to 7 338 / 1 451 / 4 602 cells at 0.5–2.5 s a piece, 3.7 s before
piece 500 against 0.25 s for `giants` 4 alone. That is a fixed skeleton-phase
overhead, linear in cells (exponent 0.99) when the seed is kind and minutes
when it is not — a cost of the loop, not of the board, which is why the
skeleton-only knobs change nothing.

**The cost of the centre.** Defaults on a quiet machine: 500×500 median
`genMs` 2.0 s (1.5–2.6), 2.8 s of CPU, peak RSS 190 MB; 600×600 2.9 s
(2.2–3.9), 4.0 s of CPU, 265 MB. Log-log slope of CPU against cells 1.04 for
sizes 300–800 (pairwise 0.95–0.97 up to 600, 1.37–1.51 from 600 to 800, so
mildly superlinear above 600); RSS grows linearly, 0.47–0.55 KB per cell
above a ≈ 70 MB Node baseline. Presets cost 1–2.3× the default (tunnels
1.5–1.9×, layers 1.6–2.3×, mix 1.3–2.0×, skeleton and serpentine 1.0–1.5×);
metrics add 10–13% on top of `genMs`. Same knob set at 500 and 600: `genMs`
ratio median 1.45 for a cells ratio of 1.44, pieces 1.43, RSS 1.48; the
ratio tail (16.2, 13.7, 7.6, 4.2) is entirely leak 2, so 500 does not
predict the 600 outliers (7.2 s at 500, 99.3 s at 600 for one set).

**Smaller findings worth keeping.**

- `strandLimit` and `headTries` change the board even when nothing
  backtracks (a different fingerprint on every seed at both sizes;
  `strandLimit` 10 gives 2–3% more, shorter pieces), while `absorbLimit` 12
  and 64 and `maxBack` 1000 never do (30/30 fingerprints identical to the
  defaults). `restarts` and `maxBack` had nothing to rescue: 0 jams in 150
  boards, and the 8 reruns of the slowest boards with `restarts` 3 and 5
  used 0 restarts, 0 backtracks and gave the same fingerprint.
- `probe` 1 with `probeLen` 12 gives an all-short board (`maxLen` 19–26,
  `avgLen` 7.5, 33 095 pieces against 21 852, bends 2.13 against 3.15); the
  help text's "little visible effect" describes small `probe` values only.
- `giantStep` 1 and 2 are the same board (10/10 fingerprints; the engine
  clamps the step to at least 2); `giantSpan` above 30 changes nothing at
  step 14 (span 200 ≡ span 30, 10/10); `giantJitter` 0 gives one skeleton
  of `giantSpan` × side cells (15 000 at 500, 18 000 at 600).
- `giants` 20 and 40 cost nothing beyond 4 (CPU ×0.99 / ×0.92): after the
  first 2–3 giants the next ones get stuck at a few hundred cells.
- The old "quadratic" slow sets were misread. `giants` 31 with `wGiant`
  0.26 and `hug` 17, clamped to `wGiant` 0.2, is now faster than `giants` 4
  (×1.0 / ×0.8): the slowness was `wGiant` above the cap, not the giant
  count. `giants` 4 with `giantStep` 2, `giantSpan` 198 and `probe` 0.93
  costs ×1.2 (500) / ×1.4 (600) / ×1.7 (800) with exponent 1.10.
- The shortest probe (`probe` 1, `probeLen` 2) is the most expensive
  skeleton or probe setting: 69 k / 99 k pieces, CPU ×1.7–1.8, RSS ×1.8,
  still 0 backtracks.
- Memory is not a limit: peak RSS 140–448 MB over every board at 500 and
  600 (the maximum is `pStraight` 0.6 with `Lmax` 6 at 600).

**Not covered.** 1000×1000 is still not re-validated. Where between 500 and
600 `pStraight` 0.6 starts to jam, whether 0.65 jams at 700–800, and the
coupling rule the shape domain suggests (with `pStraight` below 0.7 keep
`warns` at least 4 and `anticoil` at most 6) are unmeasured. The pure
no-skeleton region was drawn only 3 times in the sweep and small `Lmax`
once; those come from the baseline and shape domains instead.

### The shortening loop

**Mechanism.** When a grown path fails `wouldStrand`, `carveOne` looks for
the longest prefix that passes: it jumps down in steps of `L/32` (at most 32
calls), and from the first passing prefix `L` it creeps back up one cell at a
time until the next failure, up to `step − 1 ≈ L/32` further calls. Every
call is `wouldStrand` on a fresh slice of the path, and `wouldStrand` costs
Θ(|prefix|): it stamps every prefix cell as taken, runs `hasLocalDefect`
over the radius-2 neighbourhood of every prefix cell, and flood-fills every
free fragment adjacent to the prefix (capped at `strandLimit` cells; a
fragment within the cap is tested exactly with `decomposable`, and on
failure its cells go into `failed`; a fragment above the cap that contains a
`failed` cell fails at once). The jump phase is fine; the creep phase is
Θ(L²/32) per trimmed path. A `wGiant` skeleton of 40–60 k cells that fails
the test therefore costs up to about 1 800 passes over about 50 k cells each,
and a dense late skeleton repeats it for thousands of later giants — the 96%
in leak 2. Round 8 already noted that the loop hands cells back one at a
time; what was missed is that the creep re-examines the whole prefix for
every cell it hands back.

**The fix — incremental exact creep, same boards.** The block moved into
`Carver.shortenPath(path, failed)`, which truncates `path` in place and
returns `false` when no prefix of at least 2 cells passes (the caller drops
the path, as before). The jump phase is unchanged: each jump is a full
`wouldStrand`, and its `failed` additions feed the later jumps and the
creep. The creep is `creepUp`, and it only needs the boolean of each step:
passing calls never mutate `failed`, and the additions of the single
failing call are thrown away by the caller, so `failed` is constant during
the creep. Going from a passing prefix of `k` cells to `k + 1` changes
exactly one thing, cell `k + 1` becomes taken, and the two halves of
`wouldStrand` are re-evaluated on that basis.

- *Local defects.* The full check visits every free vertex within distance
  2 of some prefix cell, and its predicate reads the state within distance
  4 of the vertex. So after one more cell only vertices within distance 4 of
  the new cell can have changed, and among those the full check would visit
  exactly the ones with a prefix cell within distance 2 (the new cell
  counts). `defectNear` evaluates precisely that set, with the vertex
  predicate moved verbatim into `defectKernel` and a fresh degree-cache
  generation per step so no stale degree is read; visiting any other vertex
  could report a defect the original would not have seen.
- *Fragments.* The sketch said "only the fragments adjacent to the new cell",
  and that is not exact: `wouldStrand` walks the path cells in order and
  the four directions in order, flood-filling from each free neighbour not
  yet seen, and the oversize rule looks at the cells the capped fill
  actually popped, which depends on that order and on the seen marks left
  by every earlier start. `creepUp` therefore replays the sequence lazily:
  once, for the passing prefix found by the jump, it runs the full sequence
  (Θ(L)) and records which start marked which cell; each step then re-runs,
  in order, only the starts whose footprint changed — the start that popped
  the new cell, the starts that popped a neighbour of it, the four new
  starts of the new cell, and, transitively, any later start whose marks a
  re-run overwrote or freed. A re-run start that fails ends the creep;
  every start not re-run passed at `k` and is unchanged. An internal
  assertion checks that the initial replay agrees with the jump's
  `wouldStrand`.

Per creep step that is 41 vertex predicates plus the re-run starts (each
capped at `strandLimit` cells, and the cascade is local in practice), i.e.
O(L) for the whole creep instead of Θ(L²/32); two scratch `Int32Array`
per `Carver` hold the replay bookkeeping. The engine agent's own
differential check wrapped `shortenPath` so that a verbatim copy of the old
block ran on copies of `path` and `failed` next to the new method: 642
boards (40–300 cells a side, skeletons with `giantStep` 2, `wGiant` up to
0.2, layers), 140 111 calls compared, 0 mismatches on the boolean or the
length, 642/642 fingerprints identical to `main`; on the reference slow
board (sweep set 29, 600×600) `genMs` 102.0 s → 4.7 s, same fingerprint
`aba4c8a8`, 15 268 pieces, `maxLen` 59 103, peak RSS 268 → 273 MB.

Guarded by `shortening.test.ts`: (a) a differential test over 64 random
boards of 40–120 cells a side (skeletons with `giantStep` 2 and `giantSpan`
30–200, `wGiant` 0.1–0.2, `giantJitter` 0–1, layers alone and with a
skeleton, defaults) that runs the verbatim old loop on copies next to the
new method on every call and pins the totals measured on `main` — 1 716
trims, 2 605 refusals, rolled-up fingerprint `78b8a0ad` — so it cannot pass
vacuously; (b) twelve boards pinned from `main` by fingerprint, piece
count, `strandTrunc` and `strandLoss`, among them a 7 324-cell serpentine
cut down to 62 cells, a 120×120 board with 98 trims, and one board whose
only shortening call refuses. The whole suite (81 tests) runs in a few seconds.

**Before and after.** Same 44 boards through the canonical CLI on `main`
and on the fixed engine, `restarts` 0, sizes 500–800: the four slow-tail
sets of the sweep with their seeds and cheap siblings, the old slow set A at
500/600/800, a `wGiant` 0.2 grid at 600, and 19 controls (defaults, `giants`
4, layers, `pStraight` 0.6). **44/44 fingerprints identical**, same piece
counts, 0 backtracks and 0 timeouts on both sides; the 10 sweep boards on
`main` reproduce the sweep's recorded fingerprints 10/10. Times are `genMs`
from quiet back-to-back reruns (one process at a time, load 3–5) where they
exist, otherwise from the batch (two processes; a single batch pair is
reliable only outside about 0.75–1.35×, so the controls' batch ratios are
noise, and the same board rerun four times quiet gave 0.91–1.03×):

| board (`--restarts=0`) | before | after | ratio |
|---|---|---|---|
| sweep set 29, 600×600, seed 29 — the reference slow board (182–350 s in the sweep at load 38) | 106.3 s | 4.8 s | **22×** |
| sweep set 29, seeds 1029 / 2029 (batch) | 39.3 / 11.4 s | 4.6 / 5.2 s | 8.5× / 2.2× |
| sweep set 29 at 500×500 (batch) | 6.8 s | 3.9 s | 1.7× |
| sweep set 10, 600×600 (99 s in the sweep) | 24.5 s | 3.0 s | 8.2× |
| sweep set 23, 600×600 (batch) | 16.5 s | 3.8 s | 4.4× |
| sweep set 13, 500×500 / 600×600 (batch) | 19.1 / 13.5 s | 6.9 / 7.3 s | 2.8× / 1.9× |
| `giants` 0, `wGiant` 0.2, `giantStep` 2, `giantSpan` 150, 600×600 seed 2 | 16.0 s | 6.7 s | 2.4× |
| same with `giants` 4, seeds 1–3 (batch) | 16.6 / 7.0 / 10.5 s | 12.5 / 6.1 / 7.2 s | 1.1–1.5× |
| old slow set A (`giants` 4, `giantStep` 2, `giantSpan` 198, `probe` 0.93), 800×800 seed 1 | 12.4 s | 7.9 s | 1.6× |
| old slow set A at 500 and 600 (batch and quiet) | 2.1–6.5 s | 2.2–5.9 s | 0.9–1.4× |
| defaults, 600×600, seeds 1–3 | 2.17 / 2.24 / 2.17 s | 2.15 / 2.21 / 2.13 s | 1.01–1.02× |
| defaults 500, `giants` 4, layers, `pStraight` 0.6 (batch, 16 boards) | 1.7–11.0 s | 1.8–10.3 s | 0.85–1.35× (noise) |

After the fix every slow-tail board of the sweep costs 3–7 s, inside the
ordinary 5–25 s band of 600×600, and the seed lottery is gone (set 29 with
its three seeds: 4.8 / 4.6 / 5.2 s instead of 106 / 39 / 11 s). The old slow
set A barely moves at 500 and 600 because its cost was mostly the jump
phase, which the fix leaves alone. Peak RSS is unchanged within its run to
run variation (the same board varies up to 1.6× between runs on the same
side; maxima 643 MB before and 598 MB after, both set A at 800). CPU profile
of the reference board, one process alone: before, 106.8 s sampled with
95.5% inside `wouldStrand` (self time 40.9% `hasLocalDefect`, 34.9% its
`nbrs`, 15.0% `wouldStrand`, 4.1% `freeDeg`); after, 5.0 s sampled, of
which `shortenPath` is 72% inclusive, and the incremental creep only 6%
(0.3 s) — what remains of the leftover test is the 32-jump phase, an order
of magnitude above the creep on this board; the ordinary carving is back to
8% self time in `carveOne`.

**Left open.** The jump phase is still up to 32 full Θ(L) tests per trimmed
path, which is what set A pays at 800 (7.9 s against 12.4 s before); a
binary search over the jumps would change which prefix is chosen, so it is
a board-changing decision for another round. The `pStraight` 0.6 leak at
600×600 stands as documented above.

## Round 13 — the leftover absorption scans only what changed

Question: where the slow corner of the simple view (very short plus most
winding, `--length=0 --straight=0`) spends its time at 1000×1000, and
whether that part can be made cheaper without changing a single board.

```
deno task carve --width=1000 --height=1000 --length=0 --straight=0 --dry-run            # the corner, seed 7: 173 228 pieces, 33–35 s before, 21–28 s after, same fingerprint 9045118d
deno test prototype/absorb.test.ts                                                      # the full scan against the incremental one, boards compared cell by cell
```

**Mechanism.** `run()` calls `absorbLeftover` whenever no head yields a
legal path: it looks for a free fragment of at most `absorbLimit` cells and
glues it onto the tail of a neighbouring piece. Before this round every call
walked the whole board — a fresh `Uint8Array(W*H)` of "seen" marks, then a
loop over all `W*H` cells flood-filling every free fragment — although the
memo of failed fragments (round 9) already spared the path search for a
fragment nothing had changed around. On the corner board the call happens
6 560 times at 1000×1000, each time to find a crumb of 3 cells on average
(21 558 cells absorbed in all), so the scan, not the search, was the cost:
6.56 billion cell visits, 29% of the self time in a CPU profile (10.9 s of
37.4 s sampled).

**The fix — an incremental scan, same boards.** The Carver now keeps a
bitmap of dirty cells, one bit per cell, every bit set at construction.
Every owner change in the engine (a commit, an undo, an absorption) goes
through `touch()`, which marks the changed cells and their 4-neighbours;
after a successful absorption the neighbours of every cell of the rewritten
piece are marked too, because the memo check treats every fragment that had
that piece as a candidate as stale. The first scan of a Carver therefore
walks the whole board (it covers the starting board and the holes of
`voidFrac`; a restart is a new Carver); every later scan walks the bitmap
and flood-fills only the fragments around the dirty cells, stopping a flood
as soon as the fragment is over the limit. A discovered fragment is
evaluated lazily, in the order of its smallest cell index — the order of
the old walk — once the walk is far enough past that index for no smaller
fragment to appear (a fragment of at most `absorbLimit` cells spans fewer
than `absorbLimit × (W + 1)` indices), and from the memo check on the code
is the old code: the same flood from the same cell, so the same candidates
in the same order, the same memo writes, and a hit returns at once, leaving
the bits after it set and marking the fragments still waiting so the next
call finds them. The "seen" marks are an `Int32Array` stamped per scan
instead of a fresh byte array per call, so a call allocates nothing
proportional to the board. The scan evaluates a superset of the fragments
the full walk would evaluate, in the same order, with the same memo check —
marking too much costs a flood fill, marking too little would change
boards — and `absorb.test.ts` runs both scans side by side.

**Measured.** One process at a time on an 8-core machine shared with two
other agents (load 3–6; the metrics time, whose code did not change, shows
which runs were loaded), seed 7 unless stated, `--dry-run`, main `f200c6c`
against this branch; every fingerprint, piece count and backtrack count
identical between the two sides. Peak RSS from `/usr/bin/time -l`.

| board (`--dry-run`) | before | after | ratio |
|---|---|---|---|
| corner 1000×1000, seed 7, 173 228 pieces — back-to-back rerun | 34.6 s | 21.4 s | **1.62×** |
| same, first batch (the after side under load: metrics 4.7 s against 2.7 s) | 32.5 s | 27.6 s | 1.18× |
| same, in process through `generate()` | 35.3 s | 23.1 s | 1.52× |
| corner 500×500, seeds 7 / 1 / 2 (44–45 thousand pieces) | 2.84 / 2.99 / 2.62 s | 2.57 / 2.53 / 2.65 s | 1.10× / 1.18× / 0.99× |
| defaults 500×500 | 1.43 s | 1.48 s | 0.97× |
| defaults 1000×1000 (after side under load) | 10.1 s | 11.0 s | 0.92× |
| layers 1000×1000 (`--headbias=-1`) | 19.6 s | 21.1 s | 0.93× |
| skeleton 1000×1000 (`--giants=4`), back-to-back rerun | 9.6 s | 9.7 s | 0.99× |

Peak RSS shows no systematic change: the corner board spans 649–893 MB
across four runs on both sides (round 12 saw the same 1.6× run-to-run
spread), the new stamp array and bitmap cost 4 MB at a million cells, and
the 6 560 megabytes of throwaway "seen" arrays are gone (GC share 4.3%
before, 4.1% after — never the cost). Where the work went, by the call
counter: the corner at 1000×1000 floods about 1 900 free cells per call
instead of visiting a million, 12.6 million in all against 6.56 billion
(0.19%); at 500×500 the corner makes 803 calls, so the old walk was 0.3 s
of 2.8 s and the gain is within half a second; defaults, layers and skeleton
at 1000×1000 make 298, 31 and 367 calls, the old walk was 0.05–0.6 s of
10–20 s, and they stay where they were. CPU profile of the corner after:
31.1 s sampled, `absorbLeftover` with its `discover` 1.2 s (4.0%); what is
left is the leftover tests (`solve` of `decomposable` 15.9%, `check` of
`hasLocalDefect` 12.6%, `nbrs` 9.5%, `wouldStrand` 6.0%, `hasLocalDefect`
5.7%), the carving itself (`carveOne` 15.7%) and the metrics (`analyse`
8.8%).

The rule for readers: the same seed gives the same board as before; only
the time to get there changed.
