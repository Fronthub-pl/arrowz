# The envelope leaks on the hardest legal settings

A finding and the fix it led to. It came out of the loops stress campaigns
(`2026-09-26-loops-measurements.md`, §2.2, on the unmerged
`engine/loops` branch). Each of those campaigns ran every
knob set twice, once with loops at 0. The loops-0 runs are today's generator:
at 0 the carver takes no extra draw, so their boards are the same as on `main`.
Some of them fail.

## What failed

The campaigns drew knob sets towards the hardest combinations that
`validateParams` accepts, `straightFloor` included (`pStraight` at or just
above the floor on most sets), with 3 restarts:

- **1000×1000:** 9 of 400 sets failed (2.3%);
- **600×600:** 3 of 200 (1.5%);
- **100×100 and 300×300:** 0 of 100.

A failure means the board never filled: the generator used its 3 restarts, or
a run took over 10 minutes (30 minutes at 1000 in campaign 4). Every set below
is legal.

The knobs column lists only those that differ from the defaults. The raw data is in `/tmp/arrowz-campaign*/`
(`knobs*.jsonl`, `runs*.jsonl`), and it is not kept in the repository.

| campaign / board | size, seed | how it failed | knobs (only those off their default) |
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

## What they share (a lead, not a finding)

- **`wGiant` 0.2** is on 10 of the 12. It is the share of later cuts that are
  carved as giants, and 0.2 is its largest drawn value. It usually comes with
  `giantStraight` 0.5 (the lowest drawn) and `giantStep` 0.
- A shape at the edge of `straightFloor`: `anticoil` 4 with straightness at
  the floor, or `warns` 16, or `anticoil` 10.
- Low closing knobs on about half (`headTries` 2, `absorbLimit` 12,
  `maxBack` 50). Three sets fail with the closing knobs at their defaults or
  above.

`wGiant` is a knob the envelope does not bound beyond its own range. Nor does
it reach the combination of `wGiant` with the other giant knobs. That is the
first place to look.

## What it would take

- Rerun these 12 sets with more seeds, and each with `wGiant` 0, to see
  whether the mid-run giants alone make the difference.
- If they do, measure a rule on `wGiant` (and perhaps `giantStraight`) the way
  `straightFloor` was measured, and add it to `RULES`.
- Check whether the lab's randomize draws or the presets can reach these
  corners at all. That was not checked.

## Follow-up: `wGiant` together with `giantStraight` (2026-09-27)

Run on today's generator: a copy of `packages/engine` from the loop branch
before any loop code, whose generator is `main`'s. Default restarts, a
10-minute timeout at 1000 and 5 minutes at 600, runs in parallel (so timings
are indicative only). Raw data: `/tmp/arrowz-wgiant/`.

- **Reproduced:** all 12 sets fail at their original seeds with the same stuck
  counts, so the campaign's loops-0 runs were today's boards.
- **Failures out of 10 seeds per set.** Columns: at its own knobs; with
  `wGiant` 0; then, on 5 seeds each, with `wGiant` 0.2 but `giantStraight`
  0.94, with `wGiant` 0.2 but `giantStep` 14, and with `wGiant` 0.05 and 0.1.

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

- **Across all 1 200 loops-0 campaign runs at 600 and 1000** (failed/total):

  | `giantStraight` | `wGiant` 0.2 | `wGiant` 0.05 | `wGiant` 0 |
  |---|---|---|---|
  | 0.5 | **10/35** | 0/39 | 0/73 |
  | 0.7 | 0/46 | 0/46 | 0/75 |
  | 0.94 | 0/41 | 0/33 | 1/74 |
  | 1 | 0/30 | 0/43 | 1/65 |

  The two failures at `wGiant` 0 are 2/66 and 2/28, below.
- **Verdict.** The leak is **`wGiant` × low `giantStraight`**: many skeleton
  arrows carved mid-run, with no pull towards straight lines. Either knob at
  its default fixes every one of the ten. `giantStep` 14 is only a partial
  fix. At `giantStraight` 0.5:
  - `wGiant` 0.05 is nearly safe: 2 of 50 in isolation, 0 of 39 in the
    campaigns;
  - `wGiant` 0.1 fails often at 1000 (16 of 35), but not at 600 (0 of 15);
  - `wGiant` 0.2 fails almost always.
- **2/28** is a slow tail, not a jam. Run alone with no time limit, it closed
  after 1 restart in 29.5 minutes. It has 140 539 arrows (`wShort` 0.9,
  `probeLen` 200).
- **2/66** is a `straightFloor` leak.
  - With `anticoil` ≤ 4, `straightFloor` discounts coiling by 0.8, so the
    floor at 1000 drops to 0.7. That is too low for tunnels with only long
    arrows.
  - It is fixed by `pStraight` 0.8 or 0.75, or by `anticoil` 6 with the floor
    back at 0.8.
  - It is not fixed by closing knobs at their defaults, by `Lmax` auto, by
    default lengths, or by a random start.
- **Reachability.**
  - The lab's randomize never draws `giantStraight`, so it stays at 0.94, and
    it draws `wGiant` at 0.1 at most (`lab-simple.ts`, the skeleton bundle).
  - No preset sets `wGiant`.
  - Only the advanced console and the CLI reach the leak, by hand.

**A rule, if one is wanted (not implemented).**
- It would be `giantWander` on `['wGiant', 'giantStraight']`: when `wGiant` is
  above 0.05, `giantStraight` must be at least 0.7.
- Before it ships, measure its edge: `giantStraight` 0.55, 0.6 and 0.65 at
  `wGiant` 0.1 and 0.2, at 1000, on 10 seeds. The data has no point between
  0.5 and 0.7.
- The `anticoil` discount in `straightFloor` needs its own check at 1000 with
  long arrows and tunnels (2/66).

## The edges (2026-09-28)

Measured on today's generator with 3 restarts. The first pass ran 1–3 seeds
per cell and stopped a cell at its first failure; the edge cells then ran 10
seeds on all ten leak sets. Runs went up to seven at a time, so timings are
indicative only. Raw data: `/tmp/arrowz-edge/`, which is not kept.

### `giantWander`: skeletons added mid-run need straighter skeleton arrows

The smallest clean `giantStraight` per `wGiant` at 1000×1000 (7 sets):

| `wGiant` | clean from | margin (nearest failing cell) |
|---|---|---|
| ≤ 0.05 | 0.5 (0/9) | none measured |
| 0.1 | 0.7 (0/27) | 0.65: 1/70 |
| 0.15 | 0.75 (0/70) | 0.7: 4/42 |
| 0.2 | 0.8 (0/70) | 0.75: 4/41 |

- At 600×600 the edge is lower. `wGiant` 0.1 is clean at 0.5 (0/18);
  `wGiant` 0.2 has 1/18 at 0.6 and is clean from 0.65.
- The hardest sets set the edge: 2/25 and 2/30, with `wShort` 0.9, `warns` 16
  or `anticoil` 10, and 16 or 40 giants.
- **Proposed rule (not implemented):** when `wGiant` > 0.05,
  `giantStraight` ≥ 0.6 + `wGiant`.
  - It holds at every size. At 600 it removes only values that were already
    marginal.
  - Its `need` is 0.6 + `wGiant`, so the existing "needs at least" wording
    fits.
  - It refuses no golden board, no preset and no lab-simple draw (randomize
    keeps `giantStraight` at 0.94). It does refuse 95 of the 700 campaign
    sets, which were drawn hard on purpose.

### `straightFloor`: the `anticoil` ≤ 4 discount is too generous at 1000

At 1000×1000, the knobs sit at their defaults except `anticoil`, the start
mode and the lengths. `pStraight` is at the floor under test, and each cell
runs 10 seeds:

| `anticoil` | `pStraight` | failed | restarted |
|---|---|---|---|
| 4 | 0.7 (today's floor) | **5/60** | 20 |
| 4 | 0.75 | 0/60 | 0 |
| 4 | 0.8 | 0/54 | 0 |
| 6 (control) | 0.8 (its floor) | 0/60 | 0 |

- At 0.7, every start mode and every length mix restarted. Tunnels with all
  long arrows were worst (3 of 10 failed).
- At 600 the discount is safe: `anticoil` 4 at 0.6 gave 0/60.
- **Proposed fix (not implemented):** the coiling factor for `anticoil` ≤ 4
  goes from 0.8 to 0.9. The floor at `anticoil` 4 becomes:

  | side | today | with 0.9 |
  |---|---|---|
  | ≤ 600 | unchanged | unchanged |
  | 800 | 0.65 | 0.7 (unmeasured) |
  | 1000 | 0.7 | 0.75 |

  Removing the discount altogether would give 0.8 at 1000 and 0.65 at 600,
  which is more than the measurements ask for.
- **Cost:** 70 lab-simple draws change their board (1000×1000 at shape
  0.75), because `fitWinding` re-fits to the new floor. No golden board and no
  preset is affected.
- Set 2/66 fails at 0.7 and closes at 0.75, which fits the fix.

### Where this stopped

On 2026-09-28 the user paused the work. The next step would be a small PR on
top of the lab stack, containing:

- the `giantWander` rule;
- the 0.9 factor;
- EN/PL reasons, README rule-table rows and envelope tests;
- optionally a lab slider mark for the `giantStraight` bound, and a check at
  800 before the factor changes.
