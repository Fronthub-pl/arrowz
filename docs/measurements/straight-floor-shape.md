# The straightness floor reads the board's shape

Measured on 2026-09-13; the player metrics in the last section on 2026-10-08.

`straightFloor` is the lowest straightness (`pStraight`) a board can be
generated with and still be filled. It was fitted on square boards, where the
longer side, the shorter side and the equivalent square (the geometric mean
of the sides) are one number. This measurement tells them apart on
rectangles. The result is the rule in the engine: the floor reads the
equivalent square, `Math.sqrt(W * H)`. The envelope it belongs to is
described in [the design](../design.md).

## Method

For each shape, walk the straightness up from 0.6 in steps of 0.05 until all
three seeds fill the board. That value is the shape's floor. 47 boards, three
seeds a point, restarts off (a restart hides a jam behind a second draw),
every other knob at its default, and the envelope bypassed (`unchecked`),
because the rule under test is the one that refuses most of these boards.

The decisive points are pairs of **equal area and different shape**, and
rectangles whose equivalent square lands just under a step of the rule, where
a jam would hide if the mean were too generous.

    mkdir -p /tmp/arrowz-measure
    deno run --allow-read --allow-write packages/engine/scripts/measure-straight-floor-shape.ts [seeds] [budgetS] [out] [labels]

The defaults are 3 seeds, 180 s per board and
`/tmp/arrowz-measure/straight-floor-shape.jsonl`; `labels` optionally runs
only the named shapes, comma-separated (`strip`, `pair-490k-rect`, ...).

## What every shape needed

Each candidate size is put through the same step function. `max` is the
longer side, `mean` the equivalent square, `min` the shorter side.

| shape | cells | measured floor | longer side | equivalent square | shorter side |
|---|---|---|---|---|---|
| 4x1000 | 4k | **0.60** | 0.80 | 0.60 | 0.60 |
| 100x1000 | 100k | **0.60** | 0.80 | 0.60 | 0.60 |
| 250x1000 | 250k | **0.60** | 0.80 | 0.60 | 0.60 |
| 350x1000 | 350k | **0.60** | 0.80 | 0.65 | 0.60 |
| 480x1000 | 480k | **0.65** | 0.80 | 0.65 | 0.60 |
| 490x1000 | 490k | **0.70** | 0.80 | 0.70 | 0.60 |
| 500x500 | 250k | **0.60** | 0.60 | 0.60 | 0.60 |
| 700x700 | 490k | **0.65** | 0.70 | 0.70 | 0.70 |
| 810x1000 | 810k | **0.75** | 0.80 | 0.75 | 0.70 |
| 900x900 | 810k | **0.75** | 0.75 | 0.75 | 0.75 |
| 1000x1000 | 1000k | **0.80** | 0.80 | 0.80 | 0.80 |

Scored against the eleven shapes:

- **The longer side**: right on 3, one step over on 2, **two to four steps
  over on 6**. It never allows a jam, but it refuses a strip of four thousand
  cells the straightness of a million.
- **The equivalent square**: right on 9, one step over on 2 (350x1000 and
  700x700), never under.
- **The shorter side**: allows a jam on three shapes; 480x1000, 490x1000 and
  810x1000 all need more than it grants. Rejected.

`straight-floor.test.ts` holds these shapes as `SHAPES` and checks that the
rule is never under a shape's floor and never more than one step over it.

## Why the mean

**The equal-area pairs.** 490x1000 and 700x700 hold the same 490 000 cells:
the rectangle needed 0.70, the square 0.65, one step apart, with the mean
predicting 0.70 for both. 810x1000 and 900x900 hold 810 000 cells: both
needed **exactly 0.75**. The longer side would put the halves of each pair
one and two steps apart; the shorter side two steps apart the other way.

**The step lands where the jump is.** The rule steps at an equivalent square
of 700. 480x1000 has a mean of 692.8 and filled at 0.65, with 0.6 failing on
all three seeds; 490x1000 has a mean of exactly 700 and filled at 0.70, with
0.65 failing on one seed of three. The measured jump from 0.65 to 0.70 falls
between those two boards, which is where the rule's step is.

**The squares agree with the square fit** (`CAMPAIGN` in
`straight-floor.test.ts`): 500x500 fills at 0.6 and 1000x1000 needs 0.8.
700x700 filled at 0.65 on all three seeds here and on 6 of 7 there; the rule
asks 0.7 of it.

On a square the mean and the longer side are the same number, so reading the
mean changes nothing for squares and can only relax rectangles. The winding
factors (`warns`, `anticoil`) multiply the size as before; nothing in this
run suggests they act differently on a rectangle. In one line:
`--width=4 --height=1000 --pstraight=0.65` is allowed, and it fills.

## A tall board and the player

Whether a tall board is harder *to play* is a separate question from the
floor, which is only about whether the generator can fill the board. Measured
with the metrics the lab reports for difficulty: every knob at its default
except `W`, `H` and `seed`, seeds `1001 + 7919·i`, every run filled. Each
value is the mean ± standard error.

| cells | shape | seeds | `f0` (free at start) | `D` (depth) | `almost` / N | corridor | `outDeg` |
|---|---|---|---|---|---|---|---|
| ~800 | 28×28 | 64 | 0.202 ± 0.008 | 7.84 ± 0.15 | 0.210 | 6.43 | 2.74 |
| | 20×40 | 64 | 0.212 ± 0.007 | 7.77 ± 0.19 | 0.203 | 6.98 | 2.80 |
| | 14×56 | 16 | 0.201 ± 0.012 | 7.88 ± 0.41 | 0.222 | 7.81 | 2.91 |
| ~3,200 | 57×57 | 64 | 0.104 ± 0.003 | 14.53 ± 0.22 | 0.122 | 13.11 | 5.26 |
| | 40×80 | 64 | 0.110 ± 0.003 | 14.89 ± 0.26 | 0.131 | 13.74 | 5.37 |
| | 28×112 | 16 | 0.104 ± 0.008 | 16.81 ± 0.79 | 0.139 | 15.65 | 5.80 |
| ~20,000 | 141×141 | 16 | 0.043 ± 0.003 | 34.9 ± 0.5 | 0.057 | 30.9 | 12.45 |
| | 100×200 | 16 | 0.041 ± 0.002 | 38.6 ± 1.3 | 0.060 | 32.5 | 12.81 |
| | 70×280 | 16 | 0.047 ± 0.003 | 53.1 ± 1.5 | 0.065 | 38.5 | 14.44 |
| ~80,000 | 283×283 | 16 | 0.0207 ± 0.0009 | 69.3 ± 1.8 | 0.029 | 60.6 | 24.2 |
| | 200×400 | 16 | 0.0214 ± 0.0008 | 94.9 ± 2.9 | 0.030 | 65.4 | 25.6 |

"corridor" is `Metrics.meanCorridorLen`. Far blocks (`T2`) were 0 on every
board, so that column is left out.

The free arrows at the start are the same or slightly higher on the tall
board, and the corridors are longer on it at every size. `almost` and
`outDeg` differ by a few percent either way. Only the depth separates the
shapes: on 1:2 it is the same at 800 cells, within noise at 3,200, +11% at
20,000 and +37% at 80,000; on 1:4 it is deeper from 3,200 cells up. **A tall
board is not harder in general, only deeper once it is large.**
