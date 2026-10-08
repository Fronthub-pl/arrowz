# The straightness floor reads the wrong number: shape, not longer side

Round 15, 2026-09-13, branch `measure/straight-floor-shape`, script
`packages/engine/scripts/measure-straight-floor-shape.ts`. 47 boards, three seeds a
point, restarts off, every other knob at its default, the envelope bypassed
(`unchecked`) because the rule under test is the one that refuses most of these boards.

## The question

`straightFloor` reads `Math.max(W, H)`. Round 14 measured **squares only**, from 300 to
1000 a side, and on a square the longer side, the shorter side and the equivalent square
are the same number — so the campaign could not tell them apart. The rule picked the
longer side, and `straight-floor.test.ts` wrote the choice down as a claim:

```ts
// The longer side is what counts, not the area: a tall board is the hard one.
assertEquals(straightFloor({ W: 4, H: 1000 }), straightFloor({ W: 1000, H: 1000 }))
```

That claim came from a README line — "a tall board is harder to play than a square one
with the same number of squares" — which is about the **player**, and which a later
measurement did not confirm
(see [A tall board and the player](#a-tall-board-and-the-player)): at the same number of
cells a tall board has the same or more arrows free at the start (`f0`) and *longer*
corridors, not shorter ones. Only the depth `D` grows, and only on large boards. So the
claim has no footing on the player's side either, and the floor is not about the player
anyway. It is about whether the carver can close the board at all.

## The method

For each shape, walk the straightness up from 0.6 in steps of 0.05 until all three seeds
close. That value is the shape's floor. The decisive points are the pairs of **equal
area and different shape**, and the rectangles whose equivalent square lands just under
a step of the rule — a jam would hide there if the mean were too generous.

## What every shape needed

`max` is the rule as it stood, `mean` is the equivalent square (the geometric mean of
the sides), `min` is the shorter side. All three are put through the same step function.

| shape | cells | measured floor | max side | equivalent square | shorter side |
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

- **The longer side**: right on 3, one step over on 2, and **over by two to four steps on
  6**. It never allows a jam, and it refuses boards of four thousand cells.
- **The equivalent square**: right on 9, one step over on 2 (350x1000 and 700x700),
  never under. 
- **The shorter side**: allows a jam on three shapes — 480x1000, 490x1000 and 810x1000
  all need more than it grants. Rejected.

## The two things that make the mean convincing

**The equal-area pairs.** 490x1000 and 700x700 hold the same 490 000 cells: the
rectangle needed 0.70, the square 0.65 — one step apart, with the mean predicting 0.70
for both. 810x1000 and 900x900 hold 810 000 cells: both needed **exactly 0.75**. The
longer side would have put the two halves of each pair one and two steps apart; the
shorter side would have put them two steps apart the other way.

**The step lands where the jump is.** The rule's step sits at an equivalent square of
700. 480x1000 has a mean of 692.8 and closed at 0.65 with 0.6 failing on all three
seeds; 490x1000 has a mean of exactly 700 and closed at 0.70 with 0.65 failing on one
seed of three. The measured jump from 0.65 to 0.70 falls between those two boards — which
is where the rule's step already was.

## What this run reproduces

Squares measured here agree with round 14 on every point: 500x500 at 0.6, 900x900 at
0.75, 1000x1000 at 0.8, and 700x700 closing at 0.65 — the last one being
`700/0.65/4/6`, one of the nine settings the rule refuses although they always close.
Two harnesses, two days apart, same numbers.

## The change

`Math.max(p.W, p.H)` becomes `Math.sqrt(p.W * p.H)`. On a square the two are the same
number, so **every measurement round 14 made, and every one of the nine over-refusals it
costs, is untouched**; the change can only relax rectangles. The winding factors are left
where they are: they multiply the side, and nothing in this run suggests they act
differently on a rectangle.

What it buys, in one line: `--width=4 --height=1000 --pstraight=0.65` was refused and is
now allowed, and it closes.

## A tall board and the player

Measured in PR #185, with the metrics the lab reports for difficulty: every knob at its
default except `W`, `H` and `seed`, seeds `1001 + 7919·i`, every run closed. Each value
is the mean ± standard error.

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

Far blocks (`T2`) were 0 on every board, so that column is left out. The free arrows at
the start are the same or slightly higher on the tall board, and the corridors are
longer on it at every size. `almost` and `outDeg` differ by a few percent either way.
Only the depth separates the shapes: on 1:2 it is the same at 800 cells, within noise at
3,200, +11% at 20,000 and +37% at 80,000; on 1:4 it is deeper from 3,200 cells up. A tall
board is therefore not harder in general, only deeper once it is large.
