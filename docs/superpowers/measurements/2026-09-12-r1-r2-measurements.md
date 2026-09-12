# R1 and R2: the measurements section 10 of the adoption spec asks for

Companion to `docs/superpowers/specs/2026-09-12-prior-art-adoption-design.md`. Every
number below was measured at **1000x1000**, the project ceiling, on 2026-09-12
(main `a28c893` plus the measurement branch `measure/prior-art-r1-r2`). 500x500 was
deliberately skipped: the corners that matter only bite at the ceiling.

Harnesses (branch only, never meant for main):

- `packages/engine/scripts/measure-r1-depth.ts` — engine untouched. `Carver` is
  exported, so the measurement is a subclass that reads the new piece's depth off
  the board as it stands at that cut.
- `packages/engine/scripts/measure-r1-cost.ts` — engine untouched. Counts what an
  O(ray) score per candidate head would cost, and checks an O(1) alternative
  against it.
- `packages/engine/scripts/measure-r2-backbite.ts` — needs the one engine change
  below, because a stall escape cannot be measured without existing.

The only engine change is `CarverOptions.backbite` (a Carver option, **not** a knob
in `PARAM_TABLE`): `Carver.backbiteTail`, a counter pair in `CarverStats`, and the
escape branch in the growth loop. At `backbite: 0` no draw is made and no branch is
taken — the 53 engine tests pass and every fingerprint check against `generate()`
came back equal, so today's boards are unchanged cell for cell.

Raw rows: `/tmp/arrowz-measure/{r1-1000,r1-cost-1000,r1-bb8-1000,r2-1000,r2-1000-fixed,r1-freebias-1000,r1-trap-1000}.jsonl`.

## R1, part 1: the depth IS known at carve time (spec section 10.2)

9 boards (square / tunnels / skeleton x 3 seeds), 83 000-86 000 pieces each, plus 6
more with `backbite: 8`.

| check | result |
|---|---|
| every blocker's id < the piece it blocks | **0 violations** in ~1.3 million pieces |
| carve-time depth == depth recomputed on the finished board | **0 mismatches** |
| max depth == `analyse().D` (Kahn) | **15/15 boards** |
| depth-0 count == `analyse().f0` x N | **15/15 boards** |
| board identical to `generate()` | fingerprint equal on every checked run |

So `absorbLeftover` and `undoLast` leave the depth of an existing piece alone, as the
age invariant predicts, and the recurrence `depth(i) = 0 or 1 + max depth(blockers)`
reproduces Kahn's longest path exactly. This holds with the tail backbite on, which
is the expected result — the move never touches `cells[0]`.

## R1, part 2: the distribution is not a set of bands

Mean over 3 seeds, `backbite: 0`:

| set | D (max depth) | mean depth | share with depth >= 33 | f0 | blockers per piece |
|---|---|---|---|---|---|
| square | 714-865 | 216-290 | 77% | 0.49-0.59% | 100-108 |
| tunnels | 941-1109 | 287-374 | 86% | 0.12-0.21% | 92-103 |
| skeleton | 570-762 | 141-230 | 75% | 0.56-0.68% | 83-96 |

At the ceiling the blocking graph is deep and dense: three quarters of all pieces sit
below depth 33, the pieces free at the start are half a percent, and a ray crosses a
hundred pieces on average (up to ~400). A difficulty preset cannot aim at a *band* of
this distribution, because there is effectively one band. What is steerable is the
tail: the 0-2 end (`f0`, the opening moves) against the 33+ bulk.

## R1, part 3: O(ray) per candidate head is not affordable — but O(1) is

What `carveOne` would have to pay to score every candidate head the way section 7
describes, measured by sampling every 500th cut:

| set | seed | heads per cut | ray steps per cut | O(ray) total | O(1) upkeep | ratio | disagreements |
|---|---|---|---|---|---|---|---|
| square | 1 | 631 (max 4000) | 86 581 | 7.46e9 | 4.0e6 | 1867x | 0 |
| square | 2 | 681 | 86 792 | 7.47e9 | 4.0e6 | 1870x | 0 |
| tunnels | 1 | 628 | 38 906 | 3.32e9 | 4.0e6 | 831x | 0 |
| tunnels | 2 | 639 | 38 134 | 3.26e9 | 4.0e6 | 816x | 0 |

A whole 1000x1000 generation takes ~12 s, so 3-7 **billion** extra steps is not a
term inside the existing loop — it is several generations' worth of work.

The way out is in the geometry the engine already guarantees: `headCandidate` returns
the first free cell counting from the exit edge, so **the ray of a head is exactly the
assigned prefix of its line**. Keeping `lineMax[d][line]` — the greatest piece depth
on that prefix — answers the score in O(1), and its upkeep only ever walks the cells
the frontier advances over: 4.0e6 cells per board, i.e. four passes over the grid.
The harness maintained that table alongside the O(ray) walk and compared the two for
every piece: **0 disagreements in 4 boards**, so the cheap read is exact, not an
approximation.

This is a correction to the spec's cost estimate in section 7 ("O(ray) per ranked
head - heads are already enumerated per line, so this is within the existing loop"),
not to its conclusion. R1 stays affordable; it just has to carry `lineMax`, not a ray
walk.

## R2: the tail backbite at 1000x1000 (spec section 10.1)

> **The sweep below measured a move with a bug in it.** The backbite could bite at
> position 0, which reverses the suffix from `cells[1]` and so moves the neck - the
> cell behind the head that `pieceShape` starts the line at. Pieces rendered with the
> arrowhead stuck on the side of the line. The fix restricts the bite to position 1
> and up; see "Re-measured after the neck fix" below for the numbers that hold. No
> conclusion changed, but the piece lengths in this table are 8-10% too generous.

4 sets x 3 seeds x `backbite` 0/2/4/8 = 48 boards. `edge` is the most winding LEGAL
setting at this size: `warns` 6 and `anticoil` 4 pull `straightFloor` down to 0.65 and
`pStraight` sits exactly on it.

**Closure: 48/48 closed, 0 backtracks, 0 restarts, 0 timeouts** — every set, every cap,
including the envelope corner. The coupling rule the spec asked about
(`backbite > 0 => pStraight >= ...`) has nothing to attach to at these points.

Mean over 3 seeds:

| set | bb | seconds | pieces | mean length | longest | tries | stall rate | strandTrunc | strandLoss | D |
|---|---|---|---|---|---|---|---|---|---|---|
| square | 0 | 14.5 | 85 666 | 11.7 | 417 | 307 013 | 0.874 | 7061 | 102 612 | 811 |
| square | 8 | 16.1 | 59 037 | 16.9 | 793 | 172 749 | 0.848 | 6916 | 320 186 | 464 |
| tunnels | 0 | 28.0 | 85 506 | 11.7 | 465 | 923 487 | 0.898 | 7014 | 107 000 | 1003 |
| tunnels | 8 | 24.4 | 59 636 | 16.8 | 877 | 597 194 | 0.896 | 7001 | 335 283 | 688 |
| skeleton | 0 | 12.0 | 82 875 | 12.1 | 16 994 | 252 569 | 0.866 | 6769 | 105 889 | 666 |
| skeleton | 8 | 10.5 | 56 862 | 17.6 | 16 456 | 116 486 | 0.823 | 6613 | 314 976 | 357 |
| edge | 0 | 15.6 | 78 370 | 12.8 | 290 | 323 157 | 0.880 | 8290 | 130 770 | 539 |
| edge | 8 | 12.2 | 54 548 | 18.3 | 565 | 178 845 | 0.857 | 8279 | 350 688 | 408 |

Length histogram, share of pieces (mean over 3 seeds):

| set | bb | 2-6 | 7-15 | 16-49 | 50+ | pieces of 50+ cells |
|---|---|---|---|---|---|---|
| square | 0 | 60.4% | 19.7% | 15.9% | 4.0% | 3442 |
| square | 8 | 56.3% | 19.1% | 16.6% | 8.0% | 4751 |
| edge | 0 | 55.8% | 19.8% | 20.1% | 4.4% | 3445 |
| edge | 8 | 52.4% | 18.9% | 19.1% | 9.6% | 5243 |

### What the numbers say, claim by claim

1. **"Ordered lengths honoured more often" — no, not in that metric.** The stall RATE
   barely moves (0.874 -> 0.848 on square, 0.898 -> 0.896 on tunnels). What drops is
   the absolute amount of wasted work: attempts fall 30-55% (square 307k -> 173k,
   skeleton 253k -> 116k) and so does the number of stalls, because fewer, longer
   pieces are cut. The growth loop orders ~355 cells per attempt and lands 12; with
   backbite 8 it lands 17. The gap is a property of `targetLength`'s log-uniform long
   bucket (16..2500 at this size), not something a stall escape can close.
2. **"Long wound pieces without the skeleton hack" — yes.** Mean piece length +40-45%,
   longest piece roughly doubled (417 -> 793 on square, 290 -> 565 on edge), and the
   50+ bucket doubles its share *while there are 30% fewer pieces overall*, so in
   absolute terms 3442 -> 4751 pieces of 50+ cells.
3. **"Fewer stubs" — mildly.** The 2-6 bucket falls 60.4% -> 56.3%; over half of all
   pieces are still stubs.
4. **The predicted cost is real and it is the leftover test.** `strandTrunc` does not
   move (~7000 truncations), but `strandLoss` triples: 103k -> 320k cells on square,
   131k -> 351k on edge. The same number of truncations each throw away a much longer
   tail. It costs no wall clock — time is flat or better (tunnels 28.0 -> 24.4 s,
   edge 15.6 -> 12.2 s), because the attempts it saves outweigh the cells it wastes.
5. **Unexpected: the backbite makes boards EASIER.** D falls 811 -> 464 (square),
   1003 -> 688 (tunnels), 666 -> 357 (skeleton), 539 -> 408 (edge), and mean depth
   falls with it (290 -> 128 on square). Fewer, longer pieces mean a ray crosses fewer
   of them. `f0` drifts slightly down.

### Consequence for the R1-before-R2 ordering

The sequencing note argued R1 first because R1 changes where growth stalls, which is
the statistic R2's value is measured against. The measurement inverts the stronger
half of that argument:

- R2's effect on stalls is small (stall rate -0.03 at most), so an R1 tuned after R2
  would not find a very different stall picture;
- R2's effect on the depth distribution is large (D -30 to -43%), and that
  distribution is exactly what R1's bands would be cut from.

So the coupling that actually bites runs **R2 -> R1**, not R1 -> R2. Either order needs
the other one's knob pinned while its bands are chosen; the cheap resolution is to pick
R1's bands relative to the board's own measured D (a share of the observed maximum)
rather than to absolute depths, which makes the bands survive `backbite` changing D.

## Verdicts for the two PRs

- **R1** is sound and cheap, provided it carries `lineMax[d][line]` instead of the ray
  walk. Its bands must be relative, and there are effectively only two targets to aim
  at at this size (the 0-2 tail and the 33+ bulk), not a graded scale.
- **R2** closes every board at the ceiling, costs no time, roughly doubles the longest
  piece and lifts the mean length 40-45%, at the price of tripling the cells the
  leftover test throws away. No coupling rule with `pStraight` is indicated by these
  points. What it does NOT deliver is the honouring of ordered lengths, which was the
  headline claim in section 2.2 — that gap belongs to `targetLength`, not to stalls.


## Re-measured after the neck fix

32 boards, 2 seeds, same four sets, `backbite` 0 and 8. Closure is unchanged:
**32/32 closed, 0 backtracks, 0 restarts, 0 timeouts**, and the fingerprints at cap 0
still match `generate()`.

| set | bb | seconds | pieces | mean length | longest | strandLoss | free arrows | D | mean length before the fix |
|---|---|---|---|---|---|---|---|---|---|
| square | 0 | 12.7 | 86 070 | 11.6 | 438 | 103 576 | 463 | 790 | 11.7 |
| square | 8 | 12.9 | 65 274 | 15.3 | 812 | 308 502 | 284 | 504 | 16.9 |
| tunnels | 0 | 27.7 | 85 376 | 11.7 | 484 | 107 474 | 124 | 1034 | 11.7 |
| tunnels | 8 | 30.8 | 65 421 | 15.3 | 820 | 305 948 | 80 | 706 | 16.8 |
| skeleton | 0 | 16.1 | 82 892 | 12.1 | 19 124 | 99 370 | 513 | 714 | 12.1 |
| skeleton | 8 | 18.3 | 61 998 | 16.1 | 19 511 | 294 632 | 385 | 401 | 17.6 |
| edge | 0 | 20.0 | 77 260 | 12.9 | 306 | 131 080 | 255 | 548 | 12.8 |
| edge | 8 | 16.6 | 58 614 | 17.1 | 570 | 348 720 | 205 | 422 | 18.3 |

What the fix costs: mean piece length rises 32-33% instead of 40-45%. Everything else
holds - the longest piece still roughly doubles, `strandLoss` still triples, time is
still flat, D still falls 30-43%, and free arrows still drop by a third.

## R1 as a trap lever, not a free-arrow lever

Measured after the f0 spike came back negative. A piece has exactly one blocker
precisely when its line prefix has a single owner, and "no owner change along the
prefix" is equivalent to "one owner", so the test is one integer per line, maintained
exactly as `lineMax` is: -1 empty, -2 several, >= 0 the sole owner
(`CarverOptions.trapBias`).

1000x1000, 3 seeds, all closed with 0 backtracks:

| setting | pieces | free arrows | traps | traps as share | D |
|---|---|---|---|---|---|
| `--start=random` (today) | 85 666 | 454 | 680 | 0.79% | 811 |
| `--start=layers` (today) | 85 386 | 549 | 672 | 0.79% | 1046 |
| `--start=tunnels` (today) | 85 506 | 142 | 521 | 0.61% | 1003 |
| spike, most free (freeBias +1) | 85 828 | 556 | 371 | 0.43% | 1136 |
| **spike, most traps (trapBias +1)** | 85 028 | 276 | **912** | **1.07%** | 1010 |
| **spike, fewest traps (trapBias -1)** | 85 346 | 395 | **178** | **0.21%** | 1052 |

A 5.1x range on traps, against 1.3x for every existing knob. And the direction matters
more than the range: every existing knob moves free arrows and traps TOGETHER (layers
lifts both, tunnels drops both, short pieces triple both), while `trapBias -1` drops
traps to a quarter and leaves free arrows roughly where they are. That separation is
what no knob has, and it is the thing README calls the difficulty: seeing which arrow
is actually free.

(Corrected below: against `trapBias +1` the free arrows do rise, but against today's
board they fall 8% at the defaults. See "Free arrows: the separation, stated
correctly".)

The f0 spike is recorded as a reject: 165-556 free arrows against 142-549 for today's
`--start` and 320-2417 for the length knobs. Ranking heads cannot beat the geometric
ceiling, because a piece is free exactly when its head sits on the rim, and only the
number of pieces changes how many heads get there.

## R1 x R2: the interaction, the cost, and the corner

Three gaps the sweeps above left open, all closed by
`packages/engine/scripts/measure-r1-r2-interaction.ts` (1000x1000, 3 seeds,
13 settings, 39 boards) and `measure-r1-start-shadow.ts` (200x200 and the two
backtracking families of `absorb.test.ts`). Every one of the 39 boards closed
with 0 restarts and 0 backtracks.

### The pair: traps at 1000x1000

Median of 3 seeds, per-seed values in brackets (seeds 1, 2, 3):

| | `backbite 0` | `backbite 8` |
|---|---|---|
| `trapBias -1` | **167** [215, 167, 153] | **107** [98, 107, 195] |
| `trapBias 0` | 695 [628, 695, 716] | 611 [606, 611, 663] |
| `trapBias +1` | **948** [948, 955, 832] | 741 [741, 644, 762] |

The trap lever alone spans 5.7x on the medians (167 -> 948) and 4.4-5.7x per
seed. The pair spans 8.9x on the medians (107 -> 948), but **the low corner is
the one place where the seed decides**: 98, 107 and 195 traps on the three
seeds, a 2x spread, against 7% at the default and 13% at `+1`. Per seed the
total span is 9.7x, 8.9x and 4.3x.

So the coupling is real at `+1`, where every seed loses traps to the backbite
(-22%, -33%, -8%), and **not reproducible at `-1`**: two seeds more than halve
(-54%, -36%) and the third goes the other way (153 -> 195, +27%). On its own
the backbite costs 12% of the traps on the medians (695 -> 611; -3.5%, -12%,
-7.4% per seed), so it still does not undo the trap lever — but "complementary
at the low end" is a one-seed reading, not a measured effect.

### Free arrows: the separation, stated correctly

Same runs, `backbite 0`, median of 3 seeds:

| setting | traps | free arrows | D |
|---|---|---|---|
| `trapBias 0` (today) | 695 | 436 | 853 |
| `trapBias -1` | 167 (-76%) | 403 (-8%) | 1097 (+29%) |
| `trapBias +1` | 948 (+36%) | 273 (-37%) | 1007 (+18%) |

`trapBias -1` does **not** lift free arrows at the defaults: it leaves them
roughly where they are while cutting traps fourfold. That is still a separation
no existing knob has — every one of them moves the two together — but the
earlier wording ("drops traps to a quarter while lifting free arrows") was
comparing `-1` against `+1`, not against today's board. At the envelope corner
the stronger claim does hold: 277 -> 348 free arrows, +26%.

`D` rises at both extremes, so a board with few traps is not a board with a
shorter blocking chain.

### What the trap lever costs

The same 39 runs, median generation time, and two controls that isolate the two
terms. `tunnels` and `free-spike` both take the map/sort/map ranking branch with
its quarter pools and **neither allocates a line table**:

| setting | genMs (median) | vs today |
|---|---|---|
| `trapBias 0` (today) | 12 323 | 1.00x |
| control `free-spike` (`freeBias 1`) | 20 591 | 1.67x |
| control `tunnels` (`headBias 1`) | 21 606 | 1.75x |
| `trapBias +1` | 26 185 | 2.12x |
| `trapBias -1` | 31 384 | 2.55x |

The trap lever costs **2.1-2.6x the default board**, not the "four passes over
the grid" the design claims. Roughly 8-9 s of that is the ranking branch, which
`--start=tunnels` already pays today, and a further 6-11 s is `lineHomo`. The
table is therefore a real cost and not the whole cost, and both terms are
avoidable: a single boolean key needs a two-bucket partition, not a sort, and
`refreshHomo` walks all 2W+2H line headers on every `carveOne` (about 86 000
calls at this size) rather than folding only the lines that moved.

### The envelope corner, for R1 this time

`edge` = `warns 6 + anticoil 4 + pStraight 0.65`, the straightness floor at this
size. 3 seeds each, all closed, 0 backtracks, 0 restarts:

| setting | traps | free arrows | genMs |
|---|---|---|---|
| `trap 0 / bb 0` | 559 | 277 | 14 990 |
| `trap -1 / bb 0` | 130 | 348 | 32 861 |
| `trap -1 / bb 8` | 94 | 220 | 30 088 |
| `trap +1 / bb 0` | 744 | 126 | 35 437 |
| `trap +1 / bb 8` | 604 | 91 | 25 506 |

The corner behaves like the square board and closes at every combination, so the
"no new RULES entry" verdict now rests on measured R1 rows and not on R2's alone.

### `trapBias` switches `--start` off, provably

`headBias` is read in exactly one place in the carver, and only while `mix` is
below 0 — the reason the `startPair` rule exists. The trap ranking sits ahead of
it in the same `if` chain, so with the lever on, `--start` cannot reach the
board at all. Fingerprints at 200x200, 3 seeds, `trapBias -1` and `+1`:

| `--start` | `trapBias 0` | `trapBias +-1` |
|---|---|---|
| `square`, `tunnels`, `layers` | 3 distinct hashes | **1 hash, identical board** |
| `mix 0.5` | 4th hash | different hash, same ranking |

`mix` still changes the board id because its draw is made and its result thrown
away — exactly the situation `startPair` already describes for the pair. So the
knob needs either an `inactive` reason on `headBias`/`mix`, or the trap bit has
to become a secondary key inside today's ranking rather than a replacement for
it. No recorded row combined the two before this one.

### The undo path does run, and the table survives it

Every earlier `trapBias` row had `backtracks: 0`, so `refreshHomo`'s rebuild
branch had never executed. Re-running the two known backtracking families with
the lever on: **11 runs undo at least one cut, 61 backtracks in total, and the
line table disagrees with a from-scratch fold of the board on 0 lines** (160
lines per 40x40 board, 800 per 200x200). The deepest single run is `starved
heads` seed 8 at `trapBias -1`, 50 backtracks, 0 mismatches.

This is evidence, not proof: the comparison runs at the end of the carve, so a
line that was repaired by a later rebuild would not show. The per-undo invariant
belongs in `engine.test.ts` and is listed as a gate for the R1 PR.

## Paying the cost down, and what was left when it was paid

Two changes, both of them behaviour-preserving, re-measured with the same script
and the same seeds (`measure-r1-r2-interaction.ts`, 39 boards per run):

1. The fold moved out of a per-cut scan of every line header into
   `recomputeLines`, the one place a frontier depth changes, with `-2` treated as
   the absorbing value it is and `prefixCell` inlined.
2. The boolean trap bit became a stable two-bucket partition instead of a sort,
   and the depth ranking became a comparator over the depth array instead of a
   map/sort/map with a wrapper object per head.

**Nothing on the board moved.** All 39 rows match the original run on every
metric — pieces, traps, free arrows, D, longest piece, backtracks, backbites —
and the 9 recorded `--start=random` fingerprints at `trapBias 0` and `±1` are
identical. The boards are the same boards; only the clock changed.

Medians of 3 seeds, normalised against each run's own default board because the
machine drifts about 5% between runs:

| setting | before | after | normalised |
|---|---|---|---|
| `trap 0 / bb 0` (default) | 12.3 s | 12.2 s | 1.00x -> 1.00x |
| control `tunnels` | 21.6 s | 22.1 s | 1.75x -> 1.80x |
| control `free-spike` | 20.6 s | 21.0 s | 1.67x -> 1.71x |
| `trap -1 / bb 0` | 31.4 s | 24.6 s | 2.55x -> 2.01x |
| `trap +1 / bb 0` | 26.2 s | 24.7 s | 2.12x -> 2.02x |

### The residual is not the line table

Read against the controls rather than against the default, the result is sharper
than the totals suggest. A ranking with no table costs 1.71-1.80x; the lever
costs 2.01x. So **the table's own share fell from +21% (at `+1`) and +45% (at
`-1`) over an equally ranked board to +11%, the same in both directions** — the
asymmetry between the two signs was the scan, and the scan is gone.

What is left is not overhead at all. At `--start=random` with the lever on there
is now **no sort anywhere**: heads are partitioned in O(heads) and the table is
amortised. The remaining 1.8x is the quarter pools — a ranked cut draws from the
first quarter of the list and tries the next quarters when it fails, so a biased
ranking carves through more failed attempts than an unbiased one. Every biased
setting pays it: `tunnels` 1.80x and the rejected `freeBias` spike 1.71x, neither
of which has a line table at all.

That reframes the gate. "Bring the lever back under `--start=tunnels`" is not
reachable while the lever ranks, because ranking is what costs; the honest
target, and what the measurements now show, is **the price of a biased `--start`
plus about a tenth for the table**. Going below that means changing the quarter
pools, which changes every recorded board and belongs to no knob.

## Is the share monotone? No, and the step is below the noise

The design wanted one signed knob whose magnitude is the share of cuts that rank
by the trap bit, stepping 0.05. Three points of that range had ever been
measured. `measure-r1-share.ts` sweeps eleven at 1000x1000, 3 seeds each, every
board closed with 0 backtracks and 0 restarts. The endpoints make no draw, so
`0` and `±1` are the boards the earlier runs recorded and the interior can be
read against them directly.

| trapBias | traps (median) | per seed | free arrows | D | genMs |
|---|---|---|---|---|---|
| -1.0 | **167** | 215, 167, 153 | 403 | 1097 | 25.8 s |
| -0.8 | 479 | 479, 464, 485 | 554 | 1017 | 17.5 s |
| -0.6 | 543 | 520, 543, 608 | 524 | 856 | 16.2 s |
| -0.4 | 630 | 630, 538, 640 | 494 | 858 | 16.0 s |
| -0.2 | 687 | 733, 687, 675 | 517 | 733 | 13.8 s |
| 0 | 695 | 628, 695, 716 | 436 | 853 | 12.0 s |
| +0.2 | 820 | 794, 820, 831 | 511 | 790 | 10.9 s |
| +0.4 | 887 | 887, 887, 835 | 417 | 798 | 14.0 s |
| +0.6 | **995** | 1020, 995, 976 | 387 | 915 | 14.2 s |
| +0.8 | 975 | 922, 975, 980 | 323 | 1036 | 20.3 s |
| +1.0 | 948 | 948, 955, 832 | 273 | 1007 | 25.0 s |

Three things, and each of them says the same word about the knob's shape.

**It is not monotone.** Two inversions in ten steps, both at the top: the trap
count peaks at `+0.6` and then falls through `+0.8` to `+1`. Per seed the peak
is at `+0.6` twice and at `+0.8` once; **it is never at `+1`**. The drops (20 and
27 traps) sit inside the seed spread, so the honest reading is not "the end of
the dial is worse" but "**from `+0.6` up the curve is flat, and the last 40% of
the positive side buys nothing**". Seeking traps does not need the whole dial.

**The step the design wanted is four times below the noise.** The median step
between neighbouring points is 66 traps and the median seed spread within a
point is 58. A 0.2 step is therefore worth about one seed's worth of noise, and
the proposed 0.05 step is worth a quarter of that. Forty stops would be forty
promises the generator cannot keep apart.

**The avoiding direction is convex and lives at its endpoint.** `0 → -0.8`
covers 41% of the range to `-1`; the single last step covers the other 59%.
`-0.8` still leaves 479 traps, only 31% below today's 695, while `-1` leaves 167,
76% below. One cut in five ranked the old way creates traps that nothing later
removes — avoidance leaks, so it pays only when it is closed.

A fourth thing, for §4 of the design rather than for the knob's shape: the free
arrows behave differently in the interior than at the endpoint. `-0.8` reaches
554 against today's 436, a 27% rise, while `-1` drops to 403. So the "fewer
traps AND more free arrows" board, the one a beginner preset would want, exists
at about `-0.8` and not at the end of the dial.

Generation time tracks the share of ranked cuts, as the cost model predicts:
12 s at 0, 14-17 s through the middle, 25-26 s at either endpoint.

### Verdict: the knob ships as the three-state the fallback named

`min/max/step = -1/1/1` with `control: choice` and the words `avoid / off /
seek`, which is `headBias`'s shape. The share is not defensible as a continuous
knob: it is not monotone where it matters most, its usable resolution is coarser
than one seed of noise, and on the avoiding side only the endpoint is worth
having. The share stays in `CarverOptions` as the measurement path that produced
this verdict and can re-check it, but no continuous surface is exposed.

This makes "`command.ts` — nothing" false: `rangeText` needs a `WORDS.trapBias`
entry for the three words, the way `giantSpacing` has one.

## Per level: the lever cannot carry a difficulty ladder

`measure-r1-levels.ts` runs every shipped preset option — all 26 of them, seven
levels, the `-tunnels` and `-skeleton` variants included, because under the §2.3
ruling the lever and `--start` compose — at `avoid`, `off` and `seek`, 3 seeds
each. **234 boards, all closed, zero failures and zero timeouts.** The lever is
safe everywhere the presets go; what it is not is a level attribute.

A trap count is not comparable across sizes (65 pieces on `easy-square`, 86 000
on `insane-square`), so the share is the number a ladder would use:

| level | cells | share `off` | share `avoid` | share `seek` | avoid | seek |
|---|---|---|---|---|---|---|
| easy | 1 250 | **19.65%** | 5.19% | 29.36% | 0.26x | 1.49x |
| medium | 5 000 | 9.76% | 1.69% | 15.69% | 0.17x | 1.61x |
| hard | 11 250 | 8.00% | 1.04% | 11.55% | 0.13x | 1.44x |
| nightmare | 20 000 | 5.66% | 0.91% | 8.13% | 0.16x | 1.44x |
| extreme | 80 000 | 3.19% | 0.45% | 4.05% | 0.14x | 1.27x |
| huge | 160 000 | 2.12% | 0.42% | 2.63% | 0.20x | 1.24x |
| insane | 1 000 000 | **0.81%** | 0.25% | 1.10% | 0.31x | 1.37x |

### The ladder already exists, and it runs backwards

The trap share falls monotonically from `easy` to `insane`, a 24x spread, with
no knob involved. On the axis README calls the difficulty — seeing which arrow
is actually free — **`easy` is the hardest level the generator ships and
`insane` the easiest**: one piece in five looks ready to go on a 25x25 board,
against one in 123 at the ceiling. That is a property of small boards, where a
piece's corridor is short and rarely crosses more than one other piece.

### The proposal would break the one ordering there is

§4 proposed `avoid` for easy and medium, `off` in the middle, `seek` at the top.
Applied to the measured shares:

| | easy | medium | hard | nightmare | extreme | huge | insane |
|---|---|---|---|---|---|---|---|
| today | 19.65% | 9.76% | 8.00% | 5.66% | 3.19% | 2.12% | 0.81% |
| proposed | 5.19% | 1.69% | 8.00% | 5.66% | 4.05% | 2.63% | 1.10% |

Today's row is strictly decreasing. The proposed row goes down, up, down — and
it cannot be repaired by a different assignment, because the arithmetic does not
allow it: the lever spans about 6x inside a level while the levels span 24x
between them. **No assignment of three states can make the trap share increase
with difficulty**, and the proposal's main achievement is to turn a monotone
sequence into a jagged one.

The asymmetry is part of why. Avoiding is strong (0.13-0.31x) and seeking is
weak (1.24-1.61x), so the top of the ladder, where the proposal needed lift, is
where the lever has least to give.

### Where the lever is worth having: inside a level

Composed with `--start`, which §2.3 kept alive, the pair spans a level widely:

| level | lowest | highest | span |
|---|---|---|---|
| easy | 2.19% (`easy-tunnels` avoid) | 36.99% (`easy-square` seek) | 16.9x |
| hard | 0.90% (`hard-tunnels` avoid) | 14.63% (`hard-square` seek) | 16.2x |
| nightmare | 0.28% (`nightmare-tunnels` avoid) | 13.52% (`nightmare-square` seek) | 48.7x |
| insane | 0.19% (`insane-square` avoid) | 1.13% (`insane-skeleton` seek) | 5.8x |

And on this axis the lever is the stronger of the two: on `hard-square` it spans
12.8x where `--start` spans 2.7x. So the knob's value is a choice a player or a
designer makes within a level, not a number a level carries.

### Verdict: no preset takes it

`trapBias` stays `off` in every preset, for the same reason `backbite` does. One
option is worth a footnote — `huge-400-skeleton` reads 302 traps at `seek`
against 309 at `off`, the single place in 26 where `avoid <= off <= seek` fails,
and the gap is inside the seed spread.

What the run does surface is a product question the measurements cannot settle:
`easy` being the most trap-dense level is backwards from its name. Fixing it is
one level's decision (`avoid` takes `easy` from 19.65% to 5.19%), not a ladder,
and it is a question about what "easy" should mean.
