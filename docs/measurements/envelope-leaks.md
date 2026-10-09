# Envelope leaks on the hardest legal settings

Measured on 2026-09-27 and 2026-09-28.

The envelope (`validateParams`: the knob ranges plus `RULES`) promises that a
board inside it fills. Stress campaigns found settings inside it that never
fill. Two rules close the leaks: `giantWander`, and a smaller coiling
discount in `straightFloor`. The envelope itself is described in
[the design](../design.md).

## Contents

- [What failed](#what-failed)
- [Where the leak is](#where-the-leak-is)
- [giantWander: skeletons added mid-run need straighter skeleton arrows](#giantwander-skeletons-added-mid-run-need-straighter-skeleton-arrows)
- [straightFloor: the anticoil discount at 1000](#straightfloor-the-anticoil-discount-at-1000)
- [What the rules cost](#what-the-rules-cost)
- [Reproducing](#reproducing)

## What failed

The campaigns drew knob sets towards the hardest combinations
`validateParams` accepted, `straightFloor` included (`pStraight` at or just
above the floor on most sets), with 3 restarts:

- **1000×1000:** 9 of 400 sets failed (2.3%);
- **600×600:** 3 of 200 (1.5%);
- **100×100 and 300×300:** 0 of 100.

A failure means the board never filled: the generator used its 3 restarts, or
a run took over 10 minutes (30 minutes at 1000 in campaign 4). Every set below
was legal. The knobs column lists only those off their default; a set is
named `campaign / set`.

| campaign / set | size, seed | how it failed | knobs (only those off their default) |
|---|---|---|---|
| 1 / 30 | 1000, 30 | timeout | wShort 0.45, wMid 0.45, backbite 4, pStraight 0.8, wLateral 0.5, **warns 16, anticoil 10**, tunnels, giants 4, giantSpan 200, giantStep 0, giantJitter 1, **wGiant 0.2**, giantStraight 0.5, giantAnticoil 1, giantSpacing 3, headTries 2, maxBack 100 |
| 1 / 76 | 1000, 76 | 3 restarts, 357 883 cells left | wShort 0.6, wMid 0.3, Lmax 5000, backbite 1, **pStraight 0.95**, warns 3, anticoil 7, mix 0.7, trapBias −1, giants 4, giantStep 0, giantJitter 0, **wGiant 0.2**, giantStraight 0.5, giantSpacing 1, headTries 2, absorbLimit 12 |
| 1 / 78 | 1000, 78 | 3 restarts, 160 516 left | Lmax 100, backbite 4, pStraight 0.8, **wLateral 20**, warns 6, anticoil 7, layers, trapBias −1, **giants 16, giantSpan 1**, giantStep 0, **wGiant 0.2**, giantStraight 0.5, giantAnticoil 1, headTries 2 |
| 2 / 25 | 1000, 125 | 3 restarts, 499 095 left | **wShort 0.9**, wMid 0, Lmax 100, backbite 1, pStraight 0.8, wLateral 20, **warns 16**, anticoil 7, tunnels, probeLen 4, giants 16, giantSpan 10, giantStep 0, giantJitter 1, **wGiant 0.2**, giantStraight 0.5, headTries 2, absorbLimit 12, maxBack 50 |
| 2 / 28 | 1000, 128 | timeout | **wShort 0.9**, wMid 0, Lmax 100, backbite 2, pStraight 0.75, wLateral 20, warns 3, anticoil 1, tunnels, trapBias 1, probe 0.1, probeLen 200, giantSpan 200, giantStep 0, giantStraight 1, giantAnticoil 1, giantSpacing 1, headTries 2, maxBack 100 |
| 2 / 30 | 1000, 130 | 3 restarts, 567 050 left | **wShort 0.9**, wMid 0, Lmax 20, backbite 4, pStraight 0.9, warns 3, **anticoil 10**, trapBias −1, probeLen 4, **giants 40**, giantSpan 100, giantStep 0, giantJitter 1, **wGiant 0.2**, giantStraight 0.5, giantAnticoil 20, giantSpacing 3, headTries 2, absorbLimit 12, maxBack 50 |
| 2 / 66 | 1000, 166 | 3 restarts, 107 035 left | wShort 0, wMid 0, Lmax 5000, **pStraight 0.7, anticoil 4**, tunnels, probeLen 200, giantSpan 10, giantStep 40, giantSpacing 3, absorbLimit 12, maxBack 50 |
| 3a / 45 | 1000, 245 | 3 restarts, 344 256 left | wShort 0.62, wMid 0.15, Lmax 17, backbite 2, pStraight 0.75, **wLateral 20**, warns 3, **anticoil 4**, mix 0.7, giants 1, giantSpan 100, **wGiant 0.2**, giantStraight 0.5, giantAnticoil 1, headTries 6 |
| 4b / 70 | 1000, 570 | 3 restarts, 248 037 left | wShort 0.6, wMid 0.3, backbite 8, pStraight 0.9, wLateral 0.5, warns 3, anticoil 7, layers, trapBias −1, probeLen 50, giants 2, giantSpan 200, giantStep 0, giantJitter 1, **wGiant 0.2**, giantStraight 0.5, giantAnticoil 1, headTries 6, absorbLimit 64 |
| 3b / 88 | 600, 388 | timeout | wShort 0.5, wMid 0.39, Lmax 5000, **pStraight 0.7**, wLateral 0.5, warns 2, **anticoil 4**, trapBias −1, probe 0.1, probeLen 4, giantSpan 10, giantStep 0, giantJitter 1, **wGiant 0.2**, giantStraight 0.5, giantSpacing 3, headTries 2, absorbLimit 64 |
| 4a / 89 | 600, 489 | 3 restarts, 45 407 left | wShort 0.6, wMid 0.3, **pStraight 0.6**, wLateral 0.5, **anticoil 4**, probeLen 50, giantStep 0, giantJitter 0, **wGiant 0.2**, giantStraight 0.5, absorbLimit 32, maxBack 100 |
| 4a / 97 | 600, 497 | 3 restarts, 48 016 left | wShort 0.3, wMid 0.6, pStraight 0.7, **wLateral 20**, anticoil 10, mix 0.3, trapBias −1, probeLen 200, giants 1, giantSpan 100, giantStep 0, giantJitter 1, **wGiant 0.2**, giantStraight 0.5, absorbLimit 32, maxBack 100 |

What they share:

- **`wGiant` 0.2** is on 10 of the 12. It is the chance that a later arrow is
  cut as a skeleton arrow, and 0.2 is its largest value. It usually comes with
  `giantStraight` 0.5 (the lowest) and `giantStep` 0.
- A shape at the edge of `straightFloor`: `anticoil` 4 with straightness at
  the floor, or `warns` 16, or `anticoil` 10.
- Low settings of the knobs that help a board fill on about half
  (`headTries` 2, `absorbLimit` 12, `maxBack` 50). Three sets fail with them
  at their defaults or above.

## Where the leak is

Rerun with 3 restarts and a time limit of 10 minutes at 1000 and 5 at 600,
all 12 sets fail again at their own seeds with the same cells left. The table
reruns the ten `wGiant` sets: failures out of 10 seeds at their own knobs and
with `wGiant` 0; then out of 5 seeds with `wGiant` 0.2 but `giantStraight`
0.94, with `wGiant` 0.2 but `giantStep` 14 (both the defaults), and with
`wGiant` 0.05 and 0.1:

| set | own knobs | `wGiant` 0 | `giantStraight` 0.94 | `giantStep` 14 | `wGiant` 0.05 | `wGiant` 0.1 |
|---|---|---|---|---|---|---|
| 1/30 | 10/10 | 0/10 | 0/5 | 0/5 | 0/5 | 0/5 |
| 1/76 | 10/10 | 0/10 | 0/5 | 0/5 | 0/5 | 3/5 |
| 1/78 | 10/10 | 0/10 | 0/5 | 0/5 | 0/5 | 0/5 |
| 2/25 | 10/10 | 0/10 | 0/5 | 5/5 | 1/5 | 5/5 |
| 2/30 | 10/10 | 0/10 | 0/5 | 1/5 | 1/5 | 5/5 |
| 3a/45 | 8/10 | 0/10 | 0/5 | 5/5 | 0/5 | 0/5 |
| 4b/70 | 10/10 | 0/10 | 0/5 | 0/5 | 0/5 | 3/5 |
| 3b/88 (600) | 10/10 | 0/10 | 0/5 | 0/5 | 0/5 | 0/5 |
| 4a/89 (600) | 10/10 | 0/10 | 0/5 | 0/5 | 0/5 | 0/5 |
| 4a/97 (600) | 9/10 | 0/10 | 0/5 | 0/5 | 0/5 | 0/5 |

Across all 1 200 campaign runs at 600 and 1000 (failed / total):

| `giantStraight` | `wGiant` 0.2 | `wGiant` 0.05 | `wGiant` 0 |
|---|---|---|---|
| 0.5 | **10/35** | 0/39 | 0/73 |
| 0.7 | 0/46 | 0/46 | 0/75 |
| 0.94 | 0/41 | 0/33 | 1/74 |
| 1 | 0/30 | 0/43 | 1/65 |

- **The leak is `wGiant` × low `giantStraight`**: many skeleton arrows cut
  mid-run, with no pull towards straight lines. Either knob at its default
  fixes every one of the ten. `giantStep` 14 is only a partial fix. At
  `giantStraight` 0.5, `wGiant` 0.05 is nearly safe (2 of 50 in isolation, 0
  of 39 in the campaigns), 0.1 fails often at 1000 (16 of 35) but not at 600
  (0 of 15), and 0.2 fails almost always.
- **2/28** is a slow board, not a stuck one. Run alone with no time limit, it
  filled after 1 restart in 29.5 minutes; it has 140 539 arrows (`wShort` 0.9,
  `probeLen` 200).
- **2/66** is a `straightFloor` leak. With `anticoil` ≤ 4 the floor then
  discounted the size by 0.8, so at 1000 it fell to 0.7, too low for tunnels
  with only long arrows. `pStraight` 0.75 or 0.8 fixes it, and so does
  `anticoil` 6 with the floor back at 0.8. The knobs that help a board fill at
  their defaults, `Lmax` auto, default lengths or a random start do not.
- **Reachability.** The lab's simple view never draws `giantStraight`, so it
  stays at 0.94, and draws `wGiant` at 0.1 at most (the skeleton bundle in
  `lab-simple.ts`). No preset sets `wGiant`. Only the lab's Advanced view and
  the CLI reach the leak, by hand.

## giantWander: skeletons added mid-run need straighter skeleton arrows

With 3 restarts. A first pass ran 1-3 seeds per cell and stopped a cell at
its first failure; the edge cells then ran 10 seeds on all ten leak sets. Up
to seven runs went at a time, so timings are indicative only.

The smallest clean `giantStraight` per `wGiant` at 1000×1000 (7 sets):

| `wGiant` | clean from | nearest failing cell |
|---|---|---|
| ≤ 0.05 | 0.5 (0/9) | none measured |
| 0.1 | 0.7 (0/27) | 0.65: 1/70 |
| 0.15 | 0.75 (0/70) | 0.7: 4/42 |
| 0.2 | 0.8 (0/70) | 0.75: 4/41 |

- At 600×600 the edge is lower: `wGiant` 0.1 is clean at 0.5 (0/18);
  `wGiant` 0.2 has 1/18 at 0.6 and is clean from 0.65.
- The hardest sets set the edge: 2/25 and 2/30, with `wShort` 0.9, `warns` 16
  or `anticoil` 10, and 16 or 40 skeleton arrows.

**The rule** (`giantWander` in `RULES`, the bound is `giantStraightFloor`):
when `wGiant` > 0.05, `giantStraight` ≥ 0.6 + `wGiant`. It holds at every
size; at 600 it only removes values that were already marginal. Up to 0.05
the bound is the knob's own minimum, 0.5. `envelope.test.ts` pins the edges
above (`WANDER_EDGES`), and the lab marks the bound on the skeleton
straightness slider.

## straightFloor: the anticoil discount at 1000

At 1000×1000, every knob at its default except `anticoil`, the start mode
(three) and the lengths (two mixes); `pStraight` at the floor under test, 10
seeds per cell:

| `anticoil` | `pStraight` | failed | restarted |
|---|---|---|---|
| 4 | 0.7 (floor with a 0.8 discount) | **5/60** | 20 |
| 4 | 0.75 | 0/60 | 0 |
| 4 | 0.8 | 0/54 | 0 |
| 6 (control) | 0.8 (its floor) | 0/60 | 0 |

- At 0.7 every start mode and every length mix restarted; tunnels with all
  long arrows were worst (3 of 10 failed).
- At 600 the discount is safe: `anticoil` 4 at 0.6 gave 0/60.
- Set 2/66 fails at 0.7 and fills at 0.75.

**The rule:** in `straightFloor`, the coiling factor for `anticoil` ≤ 4 is
0.9, not 0.8. The floor at `anticoil` 4:

| side | with 0.8 | with 0.9 |
|---|---|---|
| ≤ 600 | same | same |
| 800 | 0.65 | 0.7 |
| 1000 | 0.7 | 0.75 |

Removing the discount altogether would give 0.8 at 1000 and 0.65 at 600, more
than the measurements ask for. `straight-floor.test.ts` pins 0.7 refused and
0.75 allowed at 1000, and 0.6 allowed at 600.

**The check at 800.** The same grid at 800×800 and `anticoil` 4 (three start
modes, two length mixes, 10 seeds each), with a 10-minute timeout:

| `pStraight` | failed | restarted | median |
|---|---|---|---|
| 0.65 (floor with 0.8) | 0/60 | 6 | 22–48 s |
| 0.7 (floor with 0.9) | 0/60 | 0 | 15–35 s |

0.65 never failed, but it restarted in both tunnel cells and in the layers
cell with all long arrows, the same cells that failed first at 1000. 0.7 is
clean. The 0.9 factor holds at 800, slightly conservatively.

## What the rules cost

- `giantWander` refuses no board in the fingerprint tests, no preset and no
  draw of the lab's simple view (it keeps `giantStraight` at 0.94). It refuses 95
  of the 700 campaign sets, which were drawn hard on purpose.
- The 0.9 factor changes 70 draws of the simple view (1000×1000 at shape
  0.75), because `fitWinding` in `lab-simple.ts` re-fits to the new floor: that
  board's straightness goes from 0.72 to 0.75. No other size and shape
  position changes, and no preset or board in the fingerprint tests does.
- The 0.9 factor refuses one setting of the square fit that filled all three
  of its runs, 1000/0.72/5/4 (side / straightness / `warns` / `anticoil`);
  `CONSERVATIVE` in `straight-floor.test.ts` lists it.

## Reproducing

The campaign harnesses and their raw data are not kept in the repository. A
single setting can be checked with the CLI, which refuses anything outside
the envelope:

    deno task carve --width=1000 --height=1000 --anticoil=4 --pstraight=0.75 --seed=1 --dry-run

The same line with `--pstraight=0.7` answers with the `straightFloor`
violation and the straightness this board needs; `--wgiant=0.2
--giantstraight=0.75` answers with `giantWander`.
