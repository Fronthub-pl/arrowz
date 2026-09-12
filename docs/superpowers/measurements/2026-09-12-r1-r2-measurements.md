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

Raw rows: `/tmp/arrowz-measure/{r1-1000,r1-cost-1000,r1-bb8-1000,r2-1000}.jsonl`.

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
