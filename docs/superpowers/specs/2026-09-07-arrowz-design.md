# Arrowz — design of an arrow-based puzzle game

Date: 2026-09-07
Status: approved for implementation planning

## 1. Goal and scope

A browser clone of a puzzle game in which tangled, multi-cell arrows lie on a grid.
Clicking an arrow attempts to drive it off the board in the direction of its arrowhead.
A collision with another arrow costs a life. The goal: empty the board without losing
three lives.

### MVP scope

In scope:

- a procedurally generated board with a solvability guarantee,
- clicking pieces, move validation, three lives,
- six difficulty levels (Easy 25×25, Medium 50×50, Hard 75×75, Nightmare 100×100,
  Extreme 200×200 and Insane 1000×1000; the last two exist only as squares),
- **a board configurator as an advanced mode**: the player sets the board size, the
  number of lines, the degree of bending and the maximum length themselves,
- **zooming and panning the board** — 100×100 is 10 000 cells, which does not fit
  legibly on any screen,
- a stopwatch, a counter of consecutive error-free moves, and scoring awarded for a
  completed board, computed from the board's complexity, lives kept and time,
- two play variants: classic and timed (time rewards, never restricts),
- win and loss screens, a new-game button,
- placeholder graphics (legible, but without a polished style),
- PWA: manifest and service worker, the game works offline.

Out of MVP scope (see §13):

- undoing a move (undo), hints,
- a polished visual layer and animations,
- level progression, saving progress, leaderboards, sound.

## 2. Game rules

The board is a rectangular grid of `W × H` cells. `N` **pieces** lie on it.

A piece is a **self-avoiding polyline**: a connected path over grid cells, moving only
orthogonally, never visiting any cell twice. Its length ranges from 2 cells to several
hundred — the longest pieces cross the board end to end many times, back and forth.
**The minimum is 2 cells**: a single-cell piece would have no last segment, so it would
have nowhere to take its arrowhead direction from — it would be a point, not a vector.

**Pieces cover the board entirely.** Every grid cell belongs to exactly one piece —
there are no empty cells. Counter-intuitively, this does not take away the ability to
move: the corridor is just a ray from the head and excludes the piece's own cells, so a
piece whose head has nothing but its own track or the edge in front of it is free even
on a board filled to the brim. The length distribution is **heavy-tailed**: short shapes
dominate, but a minority of very long, winding lines gives the board its character. The
distribution model is described in §7. At one end of the path sits the arrowhead.

The **exit direction** of a piece is the direction of the last segment of the path on
the arrowhead side. The arrow travels where it points.

A player's move is a click on a piece. The piece **travels along its own track**: the
head moves forward in the arrowhead direction, and each subsequent body cell slides into
the place of the previous one — like a train on rails. The body therefore moves only
over cells it has itself just vacated, and leaves the board in the head's wake.

- A piece's **corridor** = a single ray from the head cell to the edge, in the arrowhead
  direction, minus the piece's own cells. The body's shape has no influence on it,
  because the body never enters another piece's cell.
- If the corridor contains no cell occupied by another piece, the piece leaves the
  board. We call such a piece **free**.
- Otherwise the move is illegal: the piece **bounces** — it drives out until it touches
  the blocker and returns to its starting position — and the player loses a life. The
  final state is identical to the one before the click, so the game logic is unchanged;
  the difference is purely in the animation.

  The bounce **shows the player where the blocker lies**. A mistake stops being a pure
  penalty and becomes information — with a board of 920 pieces this is necessary,
  otherwise the player loses a life without knowing why. The price is a slight reduction
  of perceptual difficulty, because the animation reveals what the player failed to read
  from the screen. A deliberate compromise, in favour of legibility.

The game ends in a win when the board is empty, and in a loss when lives drop to zero.

### Key consequence

A move never stops at an obstacle — the piece either leaves entirely or returns to its
place. Therefore the corridor **does not depend on the board state**; it is a fixed
property of the pair (head position, direction). All of §6–§9 follows from this single
observation, not from the way the piece moves — which is why changing the movement rule
from rigid translation to travelling along the track narrowed the corridor but broke
nothing below.

## 3. Technology choice

> **Change after closing the probe (2026-09-07).** The view layer will be built in
> **Angular 22** (signals, resources, standalone, zoneless, signalForms), and player
> profiles, scores and settings will go to **Firebase**. The argument below remains in
> force as far as the **core** is concerned — `core/` and `game/` are to be pure
> TypeScript with no framework dependency, and that is the only thing this project
> truly cares about. Whether SSR makes sense, and the details of the Firebase
> integration, belong to the implementation plan, not to this specification.

**TypeScript**, rendering in SVG, tests in Vitest, a PWA layer. Originally a build on
plain Vite and a deployment as static files without a backend were assumed.

Rationale: the game has no physics, no scene and no skeletal animation — its core is
combinatorics on an integer grid. The project's biggest risk (generator correctness) is
100% logical, so the decisive criterion is **testability of the core without a
browser** — the ability to generate tens of thousands of boards in a loop in Node and
check invariants.

Rejected options:

- **Godot 4 → WebAssembly**: an export of ~25–40 MB, slow first load, cumbersome unit
  testing of the logic, and none of the 2D engine's capabilities are needed here. It
  only makes sense if the goal were a native export to app stores.
- **Vanilla JS in a single HTML file**: the fastest prototype, but without types and a
  test runner, subtle generator bugs would be caught by hand in the browser.

SVG rather than Canvas: on a grid, hitting a piece is `pixel → cell → id`, so no
technology has an advantage in hit-testing, while SVG gives free CSS animations when a
piece drives out, plus zoom and panning by changing the `viewBox` alone, with no
redrawing. At ~1 000 paths on Nightmare it is still a reasonable choice, but the margin
is already thin, so §11 defines a performance budget and the renderer sits behind an
interface — swapping it for Canvas does not touch the core.

## 4. Architecture

```
src/
  core/            pure logic: zero DOM, zero global randomness
    types.ts         Coord, Dir, Piece, Board, Difficulty
    rng.ts           deterministic seeded PRNG
    board.ts         occupancy grid, headRay(), probeMove(), removePiece()
    shapes.ts        shape sampling by backward growth within the admissible area
    generator.ts     carving from a full board, difficulty parameters
    solver.ts        blocking graph + topological sort (Kahn)
    metrics.ts       difficulty metrics computed on the generated board
  game/
    session.ts       pure game-state reducer: lives, status, click handling
  render/
    renderer.ts      renderer interface
    svgRenderer.ts   SVG implementation + mapping a click to a piece id
    viewport.ts      zoom and panning: screen ↔ cell transformation
  ui/
    app.ts           shell: level selection, hearts, end screens
    configurator.ts  advanced mode: editing generator parameters
  main.ts          wiring
```

Overriding principle: `core/` and `game/` import nothing from `render/` or `ui/` and do
not touch the DOM. Thanks to this the whole logic and generator run in Node — which
made it possible to measure them with a prototype before any view layer existed, and
to protect the project from two decisions that would otherwise have been made blind
(§11, §13).

## 5. Data model

```ts
type Dir = 0 | 1 | 2 | 3            // 0=up, 1=right, 2=down, 3=left
type Coord = { x: number; y: number }

type Piece = {
  id: number
  cells: Coord[]    // cells[0] is the cell with the arrowhead; path in order from the arrowhead
  dir: Dir          // direction from cells[1] to cells[0]
}

type Board = {
  width: number
  height: number
  occupancy: Int32Array   // length width*height, -1 = empty, otherwise piece id
  pieces: Map<number, Piece>
  metrics: BoardMetrics   // f0, T2, Tconc, D, meanCorridorLen, N — see §9
}
```

Implementation note: `occupancy` is an `Int32Array`, not an `Int8Array` — a Nightmare
board has ~1 000 pieces, so an `Int8Array` would overflow eightfold. At 10 000 cells it
takes 40 kB, which is irrelevant.

The generator parameters are **a single structure**, shared by the presets and the
configurator:

```ts
type GeneratorParams = {
  width: number
  height: number
  pieceCount: number      // how many lines; mean length = width*height/pieceCount
  maxLength: number       // Lmax
  straightBias: number    // p_s ∈ [0,1]; the "degree of bending" in the UI is 1 - p_s
  bucketWeights: [short: number, medium: number, long: number]
  seed: number
}

type GenerationReport = {          // what was actually achieved
  params: GeneratorParams
  actualPieceCount: number
  backtracks: number         // how many times the generator had to back up
  restarts: number           // how many times it started over with a different seed
  lengthHistogram: number[]
  longAreaShare: number
  attemptsUsed: number
}
```

The Easy–Nightmare presets are named instances of `GeneratorParams`, not a separate
code branch. `GenerationReport` exists because geometry can refuse, and the difference
between what was ordered and what was delivered must be visible, not hidden (§11).

The piece's body lies **behind** the arrowhead: for an arrowhead at `(5,3)` and
`dir = right`, the next path cell is `(4,3)`, not `(6,3)`. This is the most common sign
error in this module.

## 6. Engine: corridor and move legality

A piece **travels along its own track** (§2): the head moves forward in the arrowhead
direction, and each subsequent body cell slides into the place of the previous one. The
body therefore moves only over cells it has itself just vacated.

Consequently, the set of cells occupied at any moment of the move is contained in the
union `own cells ∪ ray from the head`. After subtracting the own cells, what remains is:

> **a piece's corridor = a single ray from the head cell to the edge, in the arrowhead
> direction.** The body's shape has no influence on it whatsoever.

That is the whole definition. `probeMove` walks this one ray:

```
probeMove(board, piece) -> { free: true } | { free: false, distance, blockerId }

  walk from the head cell in direction piece.dir until the edge, counting steps,
  remembering the position of the most recently passed own cell (lastOwn, initially 0):
    if occupancy(k) == piece.id  → lastOwn = step number      # the track does not block itself
    if occupancy(k) is another piece → return { free: false,
                                                distance: step - lastOwn,
                                                blockerId: owner }
  return { free: true }
```

`distance` is the number of cells the piece travels along its track before it hits —
exactly the quantity the bounce animation needs (§2).

Cost: `O(max(W, H))` — one pass along one line, a few dozen steps.

**What this rule removes from the design.** The earlier version (rigid translation of
the whole shape) required summing rays from all of the piece's cells, with a separate
case of "the cell farthest from the edge on each line" and a trap of concave shapes,
where a foreign piece trapped in the arc of a letter U blocked the move. All of that
complexity, together with its corresponding tests, **disappears**. A piece clears its own
arc without obstruction, because it travels along it, not through it.

Tracking `lastOwn` stays, because the track can cross its own ray: a piece winding so
that its body lies in front of its head passes its own cells first, and only then a
possible blocker.

## 7. Generator: carving from a full board

### Principle

The board is **100% filled**: every cell belongs to exactly one piece. So we generate
not by inserting pieces onto an empty board, but by **carving them out of a full board,
in removal order**.

At the start all cells are *unassigned*; call this set `R`. We carve pieces
`q_1, q_2, …, q_N` one after another, where `q_1` is the piece the player will remove
first. The condition for carving piece `q_j` with direction `d`:

```
corridor(q_j) ∩ (R \ cells(q_j)) = ∅
```

that is: the piece's entire route to the exit edge leads through cells **already
assigned** (to previously carved pieces) or through its **own** cells. We finish when
`R = ∅`.

### Correctness theorem

The carving order `q_1, …, q_N` is a valid solution order.

Proof: at the moment the player removes `q_j`, exactly `q_j, …, q_N` lie on the board —
because `q_1..q_{j-1}` have already left. The set `R` at the moment of carving `q_j` is
precisely `{q_j, …, q_N}`. The carving condition says that `corridor(q_j)` contains no
cells of `q_{j+1}, …, q_N`, and the corridor is fixed (§2). The move is therefore
legal. ∎

Note that the carving order is **directly** the solution order — it does not need to be
reversed.

### Equivalence with backward generation

This condition is **mathematically identical** to the earlier formulation "insert pieces
by driving them in from outside, and reverse the order". A piece's entry route from
outside is exactly the same set of cells as its corridor when escaping — the same
translation run backwards. The generator and the game engine therefore share a single
corridor definition; two separate implementations could drift apart.

The only thing that changes is **what we compute the test against**: instead of "pieces
already placed" we have "cells not yet assigned". And since `R` shrinks to zero, the
board coverage is complete. The previous version of this design stopped at a fill
threshold and left holes; this one finishes only when no cell remains.

### Minimum length 2 and the orphaning problem

**A piece has at least 2 cells.** A single-cell piece is not a vector but a point — it
has no last segment, so there is nothing to read the arrowhead direction from. Length 1
is therefore forbidden, not merely undesirable.

#### The pair is free of charge

Legality depends solely on the head (§6), and the body may go in any direction over
unassigned cells. It is therefore enough to choose the head among cells that have **at
least one unassigned neighbour**; length ≥ 2 is then guaranteed by construction, with no
additional condition.

#### What this does not solve

The above guarantees the length of the piece we are currently carving, but does not
guarantee that no fragment will arise in `R` that can no longer be decomposed into paths
of length ≥ 2.

Nor is it enough to make sure that no cell is left without neighbours. Counterexample:
**the plus-shaped pentomino** — five unassigned cells (the centre and four arms), all
connected, none isolated. Decompositions into paths ≥ 2 would have to have lengths
`2+3` or `5`. A path through the centre has at most 3 cells (after stepping onto an arm
there is nowhere to go), and the two remaining arms are not adjacent to each other, so
they do not form a pair. No decomposition exists, even though a naive isolation test
reports nothing.

#### Solution: construction + verification + bounded backtracking

We **do not guarantee by proof** full coverage with minimum length 2 — we enforce it
with three layers:

1. **Pairable heads** (above) — every carved piece has length ≥ 2.
2. **Leftover-fragment shape test.** After choosing a candidate piece we check locally
   whether `R` without it contains a non-decomposable fragment. A cheap approximation:
   no cell without an unassigned neighbour, and no connected fragment of size ≤ 5
   matching the plus pattern. The check is limited to the candidate's surroundings, so
   the cost is on the order of the piece's perimeter.
3. **Bounded backtracking.** If despite this the generator reaches a state in which
   `R ≠ ∅` and no legal piece of length ≥ 2 exists, it undoes the last `k` carvings and
   tries other choices. Only exhausting the backtrack budget causes a restart with a new
   seed.

Above all of this stands the **independent solver from §8**: it is linear and completely
separated from the generator, so every generated board is verified, not assumed. This is
the right division of roles — the construction should hit often, the verifier should be
certain.

That the space of valid boards is non-empty is visible from a trivial construction:
columns filled with vertical dominoes pointing up, removed from the top. It is boring
and we will never use it, but it proves the generator has something to search for.

**To be measured by benchmark:** the frequency of backtracks and restarts. If it turns
out high, we switch to a two-phase variant — first partition the rectangle into paths
(always feasible on a full rectangle: dominoes plus one tromino for an odd area), then
choose directions and order. This variant is more expensive and less flexible, so it
remains a fallback plan, not the default.

### Admissible area: skyline

Let `depth_d[L]` = the number of consecutive **assigned** cells on line `L`, counting
from the edge inward in direction `d`. Let `dist_d(c)` = the number of cells strictly
between `c` and the edge in direction `d`. Then:

```
cell c can be the HEAD of a carved piece with direction d
  ⟺  c unassigned ∧ dist_d(c) ≤ depth_d[line_d(c)]
```

The test is **`O(1)` per cell**, and the condition concerns **the head only** — after
all, the corridor is a single ray from the head (§6). **The body grows with no geometric
constraints whatsoever**, as long as it stays on unassigned cells. It is precisely this
freedom that yields tangled shapes and is the main gain from the travelling-along-the-
track rule.

Since on each line the first unassigned cell from the edge is the only head candidate,
there are at most `W` candidates (for top and bottom) or `H` (for the sides) —
enumeration costs `O(W+H)`.

We maintain four arrays `depth_d[·]`, one per direction, updated incrementally after
each carving at a cost of `O(4·ℓ)`.

### Carving procedure

We **grow the path exclusively inside the admissible area**, so there are no rejections.

```
carve(rng, params):
  for directions d in random order, weighted by the size of the admissible area:
    Heads = first unassigned cell of each line that has an unassigned neighbour
    if Heads empty: next direction
    h = sample from Heads
    path = [h]                              # the body will grow in any direction
    target length ℓ* ~ mixture distribution (see below)
    while |path| < ℓ*:
      cand = { neighbours of the tail, unassigned }      # body without geometric constraints
      filter out candidates that leave a non-decomposable fragment in R
      candidate weight ~ 1 / (number of its unassigned neighbours)   # Warnsdorff
      if cand empty: break                  # we accept a shorter piece
      pick t from cand (bias: straight with probability p_s ≈ 0.75, turn with the rest)
      path.push(t)
    commit(path, d); update depth_*
    return OK
  undo the last k carvings and try again; once the budget is exhausted — restart
```

Growth is a self-avoiding path: it does not visit a cell twice, but it **may** touch
itself side-on (a spiral). We compute the corridor over the set of cells, not over the
path order.

### Length distribution

With full coverage, **the number of lines and the mean length are one and the same
quantity**:

```
mean length = W · H / number of lines
```

They are therefore not two independent knobs. The configurator exposes the number of
lines and shows the mean length as a derived quantity.

`Lmax = round(κ · max(W, H))`, where `κ ≈ 2–3`; a piece can be many times longer than
the board's side, because it winds. We sample the length from a **mixture
distribution** with three buckets, whose weights are chosen so that the mean comes out
as ordered:

| Bucket | Length | Distribution | Role |
|---|---|---|---|
| short | 2–6 | uniform | filler, closes gaps |
| medium | 7–15 | uniform | typical squiggles, the main mass of the board |
| long | 16–`Lmax` | **log-uniform** | the board's skeleton, they cross it end to end |

In the long bucket the distribution is log-uniform, not uniform: at `Lmax = 300` a
uniform distribution would give a mean of 158 cells, i.e. nothing but monsters.
Log-uniform gives a mean of ~97 and spreads the mass evenly across orders of magnitude,
so both 20-cell and 250-cell pieces arise.

**Constraint: `Lmax` and the long bucket's weight are not independent.** The product of
the weight and the bucket's mean length, divided by the overall mean, is the share of
the board's area occupied by long pieces. At `Lmax = 300` and a weight of 8%, a dozen or
so snakes would occupy most of the board. With a large `Lmax` the weight must drop below
~1.5%. The configurator computes this share live and warns once it exceeds ~25%.

**Long pieces succeed late, not early.** At the start `R` is the whole board, so only
cells glued to the edge are admissible — the first carvings are necessarily short. The
admissible area **grows** as carving proceeds, because more and more assigned cells
remain behind the frontier. The upper bound of the sampled length must therefore
**grow** with the progress of generation.

It is worth noting that this is the reverse of the situation in the previous version of
the design, where pieces were inserted onto an empty board and the capacity shrank. The
direction of the dependency flipped together with the change of the stop condition —
and this is the place where it is easiest to carry an old reflex into the new code.

**Bending controls corridor size, not just looks.** The corridor depends on the number
of lines the piece crosses transversely, not on its length. A 300-cell snake coiled into
a tight spiral crosses maybe 20 columns and carves easily; the same snake led straight
crosses 100 columns and requires the entire board above it to be already assigned. In
the configurator these two sliders therefore interact: heavily bent and long is easy,
straight and long can be infeasible. The interface must show what the generator actually
achieved, not just what it was asked for.

### Controlling difficulty instead of plugs

The earlier version of the design controlled difficulty with **plugs**: pieces added
into the corridors of free pieces to immobilise them. With full coverage this mechanism
**ceases to exist** — there are no free cells into which anything could be added. We
replace it with two others:

1. **Frontier shape bias.** The number of pieces free at the start (`f0`) is the number
   of pieces that could have been carved first — i.e. the width of the carving "surface"
   at the moment of the start. Carving in layers evenly around the whole perimeter gives
   a wide frontier and a high `f0`; carving in narrow tunnels inward gives a jagged
   frontier and a low `f0`. We control this by preferring to continue in the same region
   and direction instead of hopping randomly around the board.
2. **Generate–measure–reject.** After generation we compute the metrics from §9; if they
   fall outside the difficulty band, we repeat with a different seed or corrected
   parameters. The attempt budget is bounded; once it is exhausted we return the best
   result, so the game never hangs at level start.

**The effectiveness of the bias from point 1 has been confirmed by the prototype.** On a
25×25 board, preferring the deepest line when choosing the head (tunnelling) versus
preferring the shallowest (layers) gives:

| Variant | `f0` | `D` | mean corridor |
|---|---|---|---|
| layers (shallowest line) | 0.43 | 9 | 6.2 |
| no preference | 0.33 | 8 | 6.9 |
| **tunnels (deepest line)** | **0.16** | **17** | **11.7** |

Tunnelling **halves `f0` and doubles the depth of the blocking graph**. It is therefore a
real difficulty regulator, not a hypothesis. We pick the strength per level: Easy needs
weaker tunnelling (at full strength `f0` dropped to 0.16 instead of the intended ≥0.35),
the higher levels the full one.

### Warnsdorff's rule is required, not optional

The freedom of shape has a price: a body winding without constraints **fragments the
rest of the board** into pieces that cannot be decomposed into paths of length ≥ 2. In
the prototype a 100×100 board stopped closing at all for this reason.

The cure is the classic heuristic from path covering, known from the knight's tour
problem: **go where the fewest free exits remain**. We weight candidates for the next
cell inversely to the number of their unassigned neighbours, so that dead ends are eaten
before they manage to close.

The effect measured on a 75×75 board:

| | backtracks | turns/piece | multi-line |
|---|---|---|---|
| without Warnsdorff | 26 | 1.28 | 57% |
| with Warnsdorff | 1 | 1.67 | 65% |

The heuristic improves closability and looks **at the same time**, because eating dead
ends naturally produces squiggles. It is therefore part of the algorithm, not tuning.

### History: why we abandoned rigid translation

The reason is worth preserving, because the temptation to return to "check whether the
space in front of the whole shape is free" is strong and looks innocent.

With rigid translation a piece had to occupy, on **every** touched line, a contiguous
segment starting exactly at the frontier. A turn therefore required the piece's depth to
match the neighbouring line's frontier to the exact cell — a point condition. A piece
that had once dived inward lost the ability to turn forever.

This constraint held in **every valid board**, not just in a given generator, because
the piece being removed at any moment always had to satisfy it. The result was boards
made of straight strokes arranged in stripes. On top of that, shape and difficulty
pulled in opposite directions. The measured comparison:

| movement rule | turns/piece | multi-line | `f0` |
|---|---|---|---|
| rigid translation, "for shape" variant | 0.72 | 29% | 0.42 |
| rigid translation, "for difficulty" variant | 0.15 | 6% | 0.20 |
| **travelling along the track** | **1.87** | **69%** | **0.061** |

Travelling along the track wins on both axes at once, because it removes the cause of
the conflict instead of looking for a compromise.

### Length calibration — longer pieces improve everything at once

Counter-intuitively, **the longer the pieces, the more stable the generation**. Fewer
pieces means fewer decisions, and every decision is an opportunity to fragment the rest
of the board. Measured on a 50×50 board, 25 seeds per row:

| weights short/med./long | mean length | max | p99 time | p99 backtracks |
|---|---|---|---|---|
| 0.75 / 0.24 / 0.01 | 4.5 | 33 | 257 ms | **2617** |
| 0.30 / 0.60 / 0.10 | 7.1 | 74 | 493 ms | 4 |
| **0.10 / 0.70 / 0.20** | **8.8** | **81** | 211 ms | 3 |
| 0.00 / 0.00 / 1.00 | 17.8 | 105 | 12 ms | 1 |

On Nightmare, moving from the "short" weights to `0.10 / 0.70 / 0.20` **halves the p99
generation time (979 → 442 ms)**, cuts the number of restarts fourfold and raises the
number of turns from 1.84 to 4.48. The earlier observation that the achieved mean was
~30% below the ordered one was an artefact of the rigid-translation rule — when
travelling along the track the body has no geometric constraints, so it almost never
gets stuck.

The weights **optimal for robustness** are `0.10 / 0.70 / 0.20`. They are not, however,
the adopted weights — see below.

### Adopted weights: visual calibration beats optimisation

The SVG preview (§11) showed that the weights optimal for robustness give a
**stretched-out** board: a few dozen long, meandering lines and sparsely scattered
arrowheads. The reference screenshot has densely sown arrowheads **and** a few very long
lines — that is, a heavy-tailed distribution, not one shifted towards medium lengths.

| weights (short/med./long) | pieces (25×50) | mean len. | turns | coiling | looks |
|---|---|---|---|---|---|
| 0.85 / 0.14 / 0.01 | 307 | 4.1 | 1.39 | 11% | dense arrowheads, nothing but short hooks |
| 0.62 / 0.23 / 0.15 | 187 | 6.7 | 2.47 | 36% | good, but still few long ones |
| **0.50 / 0.20 / 0.30** | **144** | **8.7** | **3.51** | **42%** | **dense arrowheads plus distinct long snakes** |
| 0.40 / 0.15 / 0.45 | 134 | 9.3 | 4.07 | 46% | pieces start to ball up |
| 0.10 / 0.70 / 0.20 | 62 | 10.1 | 4.19 | 36% | stretched out, sparse arrowheads |

Raising the share of long pieces even higher turned out to be beneficial on both axes
at once. At `0.30` the share of pieces longer than 50 cells rises from 0.8% to ~2.3%,
and **generation time improves**: p99 drops from 658 to 467 ms, and restarts from 15 to
3 per 30 runs. This is the same dependency as in round 3 — fewer pieces means fewer
decisions, and every decision is an opportunity to fragment the board.

Adopted default weights: **0.50 / 0.20 / 0.30**. Above ~0.45 coiling exceeds 46% and
pieces start to ball up instead of meandering, so that is the upper bound of the
sensible range.

This is a deliberate decision: **we were optimising the wrong quantity**. Round 3 chose
the weights for the tail of generation time, because that was the only thing that could
be measured at the time. Only the render showed that the cost was the looks — which is
what this game exists for.

### Warnsdorff strength: turns versus coiling

The Warnsdorff heuristic controls **at the same time** the number of turns and
"coiling" — the share of cells that touch their own path on three or four sides. A
coiled piece looks like a compact ball, not a meandering line, so it is a looks metric
that must be watched alongside the number of turns.

| strength | turns/piece | coiling | p99 time (Nightmare) | failures |
|---|---|---|---|---|
| 0 (off) | 2.37 | 20% | 815 ms | **1 in 30** |
| 2 | 3.36 | 32% | 625 ms | 0 |
| **4** | **4.05** | **35%** | **442 ms** | 0 |
| 8 | 4.43 | 39% | 625 ms | 0 |

Without Warnsdorff one board in thirty does not generate at all — the heuristic remains
**required**. Strength 4 is the default value; 2 gives less coiling at the cost of a
longer time tail. It is the only parameter that genuinely changes the character of the
shapes, so it is the first candidate for tuning after seeing the real render.

**Caveat:** the final assessment of looks cannot be made on the ASCII preview. Box
characters cannot depict a path touching itself, and at 35% coiling that is every third
cell. The calibration of `warns` and the length weights must take place **on the target
SVG renderer**, not earlier.

### Parameter envelope

*Added 2026-09-08 after prototype round 11: about 8100 runs without restarts,
boards up to 400×400, plus a code-level analysis of the jams. Re-validated the
same day at 500×500 and 600×600 (round 12, about 1 300 runs without restarts).*

The generator parameters have a **measured safe envelope**. `PARAM_SPEC`, the
single source of truth for the CLI, the lab and the engine, carries the
minimum and maximum of every knob, and `RULES` carries three cross-knob rules.
The engine **validates and refuses**: `validateParams(params)` returns the
list of violations (`{ kind: 'range', key, value, min, max }` or
`{ kind: 'rule', key, keys }`), `formatViolation(v)` turns one into a
sentence, and `generate()` throws `RangeError('invalid parameters: ...')`,
with the array attached as `violations`, before carving a single cell. The
CLI exits with code 2 and prints the violations; the lab pulls loaded values
into range and disables Generate while a violation stands. Defaults and every
preset sit inside the envelope with margin.

Narrowed bounds (defaults unchanged; the other knobs keep their ranges):

| knob | before | envelope | evidence |
|---|---|---|---|
| `pStraight` | 0..1 | 0.6..1 | the only knob that jams alone: 400×400 jams 5/5 at 0.3 or less, 3/5 at 0.4, clean from 0.6 |
| `warns` | 0..16 | 2..16 | 0 and 1 are the rule switched off; 3 of the 8 random jams at 400×400 had it off |
| `anticoil` | 1..20 | 1..10 | 10 or more with straightness at most 0.45 jams 4/5 |
| `absorbLimit` | 0..64 | 12..64 | below 13 closes 78-80% against 86-100% in the random sweep |
| `strandLimit` | 2..30 | 10..30 | 2-3 leaves ten-cell leftovers from 500×500; below 10 costs 1.5-2.2× the time |
| `headTries` | 1..32 | 2..16 | 1 starves the search at low straightness; above 16 only costs time |
| `maxBack` | 0..200000 | 0..1000 (0 = 200) | 1000 rescued 1 of 11 jams, 5000 rescued none more |
| `restarts` | 0..10 | 0..5 | restarts rescue shredded jams 8/8 within 2; no evidence of help beyond 5 |
| `wGiant` | 0..0.5 | 0..0.2 | 0.43 or more in 3 of the 4 high-straightness timeouts at 1000×1000 |
| `giantStraight` | 0..1 | 0.3..1 | below 0.15 closes 50%; active at every serpentine step, not only 0 |
| `giantSpacing` | 1..6 | 1..3 | 6 costs 1.9× the time and has no effect on closing |

Cross-knob rules: `wShort + wMid <= 0.9` (the long bucket keeps at least a
tenth); `Lmax` is 0 (automatic) or at least 6 (`Lmax` 3 is pathological:
2/10 jams at 200×200 after 40-60 s); `mix` is -1 (off) or between 0.3 and
0.7 (the extremes close 80% against 94-96%).

The envelope was measured at 400×400 and re-validated at 500×500 and
600×600 (prototype round 12: 1 319 boards, `restarts` 0, five domains). It
holds at 500×500 for every single knob and at 600×600 for every knob but the
`pStraight` floor, with two known leaks. Closing: `pStraight` 0.6 alone
closes 15/15 at 500×500 but 11/15 at 600×600 (fragment jams with at most 1%
of the board left); with `warns` 2 it closes 0/5 at both sizes and with
`anticoil` 10 it closes 5/10 at 500 and 0/5 at 600 (shredding jams);
`pStraight` 0.65 and 0.7 close 10/10 at 600, and `warns` 16 neutralises the
corner. The envelope has no rule coupling `pStraight` with `warns` or
`anticoil`; that is the first candidate for a new rule and it has not been
measured. Time: `wGiant` at least 0.13 with `giantStep` at most 7 and
`giantSpan` at least 100 makes a 600×600 board cost 50–350 s (seed
dependent) instead of 5–25 s; the cost sat in the path-shortening loop of
the leftover test, which is fixed in round 12 (same boards), not in the
board state. 1000×1000 is still not re-validated, and several bounds
(`maxBack`, `restarts`, `giantSpacing`, `headTries` above 16, `wGiant`) are
time bounds, not closing bounds. The mechanism behind the jams (free islands
with legal heads but nothing carvable, waiting on each other in a cycle), the
fix ideas and the 500/600 tables are recorded in `prototype/README.md`,
rounds 11 and 12.
**The implementation must carry the envelope**: the same bounds and rules on
`GeneratorParams`, the same validation before generation, and the
configurator (§11) refusing to generate outside it.

## 8. Solver and verification

### Blocking graph

Since the corridor is fixed (§2), the relation "`F` blocks `E`", defined as
`cells(F) ∩ corridor(E) ≠ ∅`, is a **static directed graph** on the pieces, computable
once. When travelling along the track the corridor is a single ray, so the graph is much
sparser than with rigid translation — and correspondingly cheaper to build.

`E` is free if and only if no `F` remaining on the board blocks it. Hence a valid removal
order is a topological order of this graph, and from this:

> **the board is solvable ⟺ the blocking graph is acyclic**

The only way a board can be unsolvable is a cycle — for example two pieces on one line
pointing at each other.

### Confluence

Being free is **monotone with respect to removal**: if `E` is free in state `S` and
`S' ⊆ S`, then `E` is free in `S'`. Removal only reduces occupancy, and a free corridor
stays free.

Hence: if greedy removal got stuck in a non-empty `S` with no free pieces, while the
board had a solution `σ`, then taking `E` = the first piece of `σ` belonging to `S`, at
the moment `σ` removed `E` the state `T` contained `S`. `E` free in `T` implies free in
`S` — a contradiction.

**Every order of removing free pieces leads to a solution.** The player cannot get stuck
with a legal move; they lose only through wrong clicks.

### Solver implementation

```
build the graph: for every E, for every foreign cell in corridor(E) → edge E → owner(c)
Kahn: queue = pieces with no remaining blockers; pop, decrement counters
solvable ⟺ all N pieces were popped
remainder = pieces lying in cycles (diagnostics)
```

Graph construction costs `O(N · ℓ · max(W,H))`, sorting `O(N + E)`. The solver is
independent of the generator and serves verification in tests — not gameplay.

## 9. Difficulty

The game has no dead ends (§8), so it requires no planning. Difficulty is
**perceptual**: how hard it is to find a piece with a free route, and how many pieces
*look* free although they are not.

With full coverage the "free" condition reads: **on every line the piece crosses, it
covers the entire segment from itself to the exit edge**. Not "it has emptiness ahead",
but "ahead of it there is nothing but itself". This is precisely the thing the player
cannot quickly read from the screen — and that is where all of the game's difficulty
comes from.

| Metric | Definition |
|---|---|
| `f0` | share of pieces free at the start (sinks of the blocking graph) |
| `almost1` | pieces blocked by **exactly one** foreign piece — they look almost ready to drive out and are the main temptation to err |
| `D` | depth of the blocking graph (longest path) |
| `meanCorridorLen` | mean corridor length — how far the eye has to travel to judge one move |
| `minFree` | minimum number of free pieces during random greedy playouts |

`almost1` is the most important: it measures the number of opportunities for a wrong
click, i.e. what actually takes lives. `minFree` is a **diagnostic** metric in the MVP —
reported in the benchmark, but not part of the acceptance thresholds, because its
calibration requires a playtest.

**Why not `T_k`.** Earlier versions of the design used the metric `T_k`: blocked pieces
whose corridor is clear for the first `k` cells. The prototype showed that on a board
filled 100% this metric **is always zero**. The reason is obvious in hindsight: since
every cell belongs to someone, there is always someone standing right in front of the
piece, so "a clear corridor for `k` cells" would require the piece to shield itself for
`k` cells. That is rare. `T_k` was a metric designed for a board with gaps and did not
survive the transition to full coverage.

It is replaced by `almost1`, which measures the same intuition — "looks free, but is
not" — in a way that makes sense at full fill. The prototype measures 4–10% of pieces
for it.

All metrics are cheap; the only stochastic one is `minFree`.

`meanCorridorLen` **is not a difficulty threshold** — it is weak for that, because it
measures length, not deceptiveness. It does, however, enter the scoring formula (§10) as
a measure of effort.

**Metrics travel with the board.** They are not benchmark-only data: `Board` carries its
`BoardMetrics`, because scoring (§10) is computed from the complexity of the specific
generated board, not from the level label.

### Level parameters

Fill **is not a parameter** — it is always 100%. Every grid cell belongs to exactly one
piece; the sum of piece lengths equals `W · H`. Consequently the number of lines and the
mean length are one quantity, bound by the relation
`mean length = W · H / number of lines`.

The "lines" and "mean len." columns are values **measured by the prototype** at the
current bucket weights, not ordered ones. `f0` is given for the variant with the
deepest-line preference.

Choosing a board is **two independent knobs**: the difficulty level (base size `n`) and
the format (square `n×n` or portrait `n×2n`). Both are equally valid — portrait matches
a phone screen and the reference screenshot, square is more convenient on desktop.

Values measured at weights `0.50 / 0.20 / 0.30` and Warnsdorff strength 4 (§7).

**Square format `n×n`:**

| Level | board | cells | lines | mean len. | max len. | `f0` | `almost1` | `D` | turns/piece |
|---|---|---|---|---|---|---|---|---|---|
| Easy | 25×25 | 625 | ~98 | 6.4 | 44 | 0.197 | 22% | 9 | 2.81 |
| Medium | 50×50 | 2 500 | ~354 | 7.1 | 79 | 0.102 | 13% | 15 | 2.96 |
| Hard | 75×75 | 5 625 | ~669 | 8.4 | 119 | 0.073 | 10% | 25 | 3.72 |
| Nightmare | 100×100 | 10 000 | ~1 247 | 8.0 | 164 | 0.059 | 7% | 32 | 3.47 |
| Extreme | 200×200 | 40 000 | ~4 671 | 8.6 | 199 | 0.034 | 4% | 73 | 3.80 |

**Portrait format `n×2n`:**

| Level | board | cells | lines | mean len. | max len. | `f0` | `almost1` | `D` | turns/piece |
|---|---|---|---|---|---|---|---|---|---|
| Easy | 25×50 | 1 250 | ~173 | 7.2 | 73 | 0.139 | 17% | 14 | 3.20 |
| Medium | 50×100 | 5 000 | ~605 | 8.3 | 136 | 0.080 | 10% | 22 | 3.63 |
| Hard | 75×150 | 11 250 | ~1 311 | 8.6 | 246 | 0.050 | 7% | 40 | 3.71 |
| Nightmare | 100×200 | 20 000 | ~2 312 | 8.7 | 180 | 0.038 | 6% | 52 | 3.85 |

The length distribution hits the reference shape in both formats: ~72% of pieces have
2–6 cells, ~18% have 7–15, and **~2% exceed 50 cells** — with the longest reaching 246
cells at the Hard level in portrait format.

**The format alone raises difficulty.** At the same base size a portrait board has a
lower `f0` than a square one (Nightmare: 0.038 versus 0.059). A narrow board has shorter
corridors horizontally and longer ones vertically, so statistically fewer pieces have a
clear route to the edge. It is therefore not merely a framing decision — the difficulty
thresholds must be calibrated per format.

`Extreme 200×200` and `Insane 1000×1000` exist only in the square variant. Extreme
(40 000 cells, ~4 700 pieces) was the original upper bound; after the closing hardening
(prototype round 8) the ceiling moved to **Insane: a million cells and ~86 000 pieces**,
which closes with zero backtracks and passes the solver. In practice the board size is
limited by nothing but legibility and generation time — and at Insane the time is no
longer negligible: ~10 s in Node and ~27 s in a Chrome worker with the default knobs,
minutes with piece start = layers or with a skeleton (see "Generation time distribution").

All four close 100% and pass the solver. `f0` arranges itself into a descending sequence
without additional control — the board size alone suffices as a difficulty regulator, so
the frontier bias from §7 is a fine-tuning, not a necessity.

The number of pieces on Nightmare (~1 043 with a mean length of 9.6) lands exactly where
the design assumed before any measurements — but it lands there **through data-driven
calibration**, not because the original estimate was accurate. Along the way the
generator produced 1 918 and 2 067 pieces.

### Generation time distribution

Time has an extremely heavy-tailed distribution — the median is uninformative, the tail
is what matters (30–100 seeds per row, weights as above):

| Level | p50 | p90 | p99 | max | failures |
|---|---|---|---|---|---|
| Easy 25×50 | 1 ms | 3 ms | ~50 ms | — | 0/100 |
| Medium 50×100 | 6 ms | 40 ms | ~200 ms | — | 0/100 |
| Hard 75×150 | 18 ms | 180 ms | ~300 ms | — | 0/60 |
| Nightmare 100×200 | 38 ms | 327 ms | 339 ms | 339 ms | 0/25 |
| Extreme 200×200 | 646 ms | 1 484 ms | 2 074 ms | 2 074 ms | 0/15 |

| Insane 1000×1000 | ~10 s | — | — | — | 0/1 (Node, defaults) |

No generation failure has ever been recorded with the five allowed restarts. A tail on
the order of half a second means that **a loading indicator is needed** (shown after
~200 ms). Up to Extreme, moving generation to a Web Worker is a convenience; **at Insane
it is mandatory**: a single run takes ~10 s in Node and ~27 s in a Chrome worker, so the
generator must run off the main thread, report progress and be abortable (the prototype
lab already does all three). Piece start = layers (`headBias` -1) is the slow setting:
at 400×400 it took 149 s instead of 1.4 s, 86% of it in the leftover-absorption path
search, re-run from scratch for the same fragments before every backtrack. Memoising
failed fragments (invalidated by per-cell change stamps) and an allocation-free search
with the same order and budget brought it to ~7 s at 400×400 with the same board cell for
cell (prototype round 9). That exposed a second problem: at Insane, layers did not close
within four attempts, because a biased cut drew its head tries only from the first
quarter of the ranked heads, which in the endgame are the dead pockets at the frontier.
`carveOne` now falls through to the next quarters before giving up a direction; layers
close 1000×1000 in ~35 s with zero backtracks, and 400×400 on every tested seed without a
restart, at unchanged f0 (round 9). A third profile (round 12, 600×600) found a dense
late skeleton (`wGiant` at least 0.13 with a serpentine step of at most 7 and a long
span) spending 96% of a 182 s run in the leftover test, called from the loop that
shortens a path which failed it: the loop crept back one cell at a time and re-ran the
whole Θ(L) test for each cell, Θ(L²/32) per trimmed path of L cells. The creep is now
incremental (only the neighbourhood of the newly taken cell and the fragments adjacent
to it are re-tested), chooses exactly the same length, and the boards are unchanged;
see `prototype/README.md`, round 12, for the before-and-after numbers. The DOM-free core
remains portable should the measurement on the target hardware turn out worse.

**Discrepancy to close:** the design assumed ~1 000 pieces with a mean length of 10 on
Nightmare; the generator at the current weights gives ~1 900 with a mean of 5.2. The
cause has been measured (§7): 28–47% of paths get stuck before the target length, so the
actual mean is markedly lower than the ordered one. The bucket weights must be
calibrated for the **achieved** length, not the ordered one. `f0` for Easy came out at
0.16 instead of the intended ≥0.35, so Easy requires weaker tunnelling than the higher
levels.

The remaining values are **a starting point for calibration**, not a settled result.
The `almost1` and `D` thresholds scale with the number of pieces, so absolute numbers
from a small board do not transfer to a large one — we use shares, not counts. The first
step of implementing the generator is a report on the actually achieved length
distribution, metric values, frequency of generator backtracks and restarts, and
generation time.

Generation loop: generate → compute metrics → if outside the band, repeat with a
different seed or corrected parameters (§7) → once the budget is exhausted, return the
best result.
## 10. Game loop

`game/session.ts` is a **pure reducer**, with no DOM and no side effects:

```ts
type Status = 'playing' | 'won' | 'lost'

type Session = {
  board: Board
  lives: number
  status: Status
  removed: number
  startedAt: number      // timestamp passed in from outside
  elapsedMs: number
  mode: 'classic' | 'timed'
  streak: number         // run of consecutive error-free moves; information, not points
  bestStreak: number
  score: number          // 0 throughout play; computed once, on the transition to 'won'
}

type Action =
  | { type: 'click'; pieceId: number; at: number }
  | { type: 'tick'; at: number }
  | { type: 'restart'; seed: number; at: number }

type Effect =
  | { kind: 'exit'; pieceId: number; dir: Dir }
  | { kind: 'bounce'; pieceId: number; distance: number; blockerId: number }
  | { kind: 'none' }

reduce(session: Session, action: Action): { next: Session; effect: Effect }
```

Clicking a free piece removes it from the board and increments `streak`; **it adds no
points**. When the board is empty, `status` becomes `won` and only then does the reducer
compute `score` from the formula below. Clicking a blocked piece leaves it in place,
resets `streak` and decrements `lives`; at zero, `status` becomes `lost`. The reducer
returns an `effect` — a ready command for the renderer, bounce distance included, so
that the visual layer does not have to infer anything on its own.

Clicking the same blocked piece repeatedly deducts a life every time. A deliberate
decision, covered by a test.

### Time

**Time is not read inside the reducer.** The `at` timestamp comes in as an action field,
and `elapsedMs` is computed from it. If the reducer reached for the clock itself, it
would stop being pure and the tests would stop being deterministic — hence the separate
`tick` action, which the UI layer sends at the stopwatch's refresh rate.

The timed variant **imposes no limit on the player**. The stopwatch only measures; it
affects the bonus in the final score, never a loss.

### Scoring

**Points are awarded solely for a completed board.** Removing a single piece yields
nothing; the score appears on the player's account only after the board is cleared. A
loss is zero points, regardless of how many pieces were removed.

The score depends on four things: the board's complexity, lives kept, and in the timed
variant also the completion time. The difficulty level is not a separate factor — it is
**derived from complexity**, because a harder level generates a board with higher
metrics.

#### Why complexity rather than the level label

The configurator (§11) lets the player set their own parameters, so the "Nightmare"
label stops guaranteeing anything. Scoring based on the level name would be trivial to
game: it would suffice to set a 5×5 board and collect points for "Nightmare". That is
why the basis is **complexity measured on the specific generated board**.

This requires that the metrics from §9 stop being benchmark-only data and travel with
the board into gameplay — `Board` carries its `BoardMetrics`, and the session uses them
when computing the score.

#### Formula

```
complexity =
    (W · H) / 100                                  // size of the task
  × (1 + w_f · (1 − f0))                           // tightness of the start
  × (1 + w_t · almost1 / N)                        // density of temptations to err
  × (1 + w_c · meanCorridorLen / max(W, H))        // how far the eye has to travel
  × (1 + w_d · D / sqrt(W · H))                    // depth of entanglement

livesBonus = 1 + 0.25 · livesLeft                  // 1.00 … 1.75
timeBonus  = clamp(refTime / elapsed, 0.6, 1.6)    // timed variant only
refTime    = N · t_piece

score = round(complexity × livesBonus × timeBonus)
```

The base scales with the **board's area**, not with the number of pieces. This is
deliberate: if points grew with the number of clicks, a 100×100 board made of nothing
but dominoes — 5 000 pieces, tedious and trivial, removed layer by layer — would score
the highest of all.
Area is what the player cannot inflate without taking on a genuinely bigger task, and
the multipliers measure **difficulty per click**.

Every multiplier is bounded from above, so no single parameter blows up the score. The
weights `w_f`, `w_t`, `w_c`, `w_d` and `t_piece` are **calibrated by benchmark** so that
the four presets form an ascending sequence and degenerate boards land clearly lower.
The formula lives in one module and is covered by tests (§12).

`meanCorridorLen` returns here as a metric after §9 rejected it as a **difficulty
threshold**. For thresholds it was weak, because it measured length, not deceptiveness.
As a measure of **effort**, however, it is apt: it says how far the player has to lead
their eye to judge one move.

#### Run of error-free moves

`streak` and `bestStreak` remain in the session and on the status bar as **live
feedback**, but do not enter the score — the number of mistakes is already represented
by `livesLeft`, and adding a second factor for the same thing would punish mistakes
twice.

## 11. Rendering and UI

`render/renderer.ts` defines the interface (`draw(board)`, `animateExit(piece)`,
`shake(piece)`, `onPieceClick(cb)`); `svgRenderer.ts` implements it. A piece is drawn
as a `<path>` with a thick stroke, rounded joins and an arrowhead at the end. Hit
detection: pointer coordinates → cell → `occupancy` → piece id, so mouse and touch
handling are shared.

The MVP graphics are a **placeholder**, but the drawing parameters have already been
verified with the preview (`prototype/carve.mjs --svg=...`) and give a look consistent
with the reference:

| Parameter | Value |
|---|---|
| piece | a single `<polyline>` through the cell centres |
| stroke width | 50% of the grid pitch |
| caps and joins | `round` — these are what give the characteristic rounded corners |
| arrowhead | a filled triangle on the head cell, length and width ~0.6 of the pitch |
| colours | strokes `#232447` on a `#f6f6fa` background |

**Monochrome is part of the task, not an economy.** The player must tell pieces apart
without the help of colour — that is exactly the source of the perceptual difficulty
from §9. Per-piece colouring exists in the preview only as a diagnostic mode. The main
screen is the choice of one of the four levels and the variant (classic or timed).
Above the board a status bar: three hearts, the stopwatch and the current run of
error-free moves; next to it a new-game button.

**The score is not on the bar during play** — points are awarded only for a completed
board (§10). The win screen shows a breakdown: the board's complexity, the bonus for
lives kept and, in the timed variant, the time bonus. The breakdown matters more than
the number itself: without it the player has no way to understand why they got this
much and not something else.

### Viewport: zoom and panning

Nightmare has 10 000 cells; at 8 px per cell the board takes 800×800 px, which no phone
will show legibly. Insane has a million cells and ~86 000 pieces: at the same 8 px it is
8 000×8 000 px, and the SVG holds ~86 000 paths, so the renderer's performance budget
(§11) must be measured at Insane, not only at Nightmare. `render/viewport.ts` maintains
the scale and offset and converts screen coordinates to cells.

In SVG, zooming and panning are a change of the `viewBox` attribute — a single
operation, with no redrawing of paths, composited by the GPU. This is the main reason
SVG holds up despite the scale.

#### Controls

The crucial thing is to distinguish a game move from panning the board — a mix-up costs
a life, so the decision must be unambiguous, not threshold-based. On desktop this is done
by a **keyboard modifier**, on touch by the **kind of gesture**.

| Input | Game move | Panning the board | Zoom |
|---|---|---|---|
| mouse / trackpad | click without a modifier | drag with **⌘ (macOS)** or **Ctrl (Windows, Linux)** | wheel towards the cursor position |
| touch | short tap without movement | one-finger drag | pinch |

#### Zoom

Zoom is a fully fledged and **visible** control, not just a gesture — with a 100×200
board the player must be able to zoom in without guessing how.

| Method | Action |
|---|---|
| mouse wheel / two-finger gesture | scaling towards the cursor position |
| ⌘ / Ctrl + wheel | the same; we intercept with `preventDefault` so the browser zoom does not fire |
| pinch (touch) | scaling towards the centre of the gesture |
| `+` and `−` buttons in the corner of the board | a step by a fixed factor, available without a mouse and without gestures |
| `+` / `−` keys | as above |
| double click, double tap, the `0` key, the "fit" button | fitting the whole board to the screen |

The scale range is bounded on both sides:

- **the lower bound** is fitting the whole board to the screen — you cannot zoom out
  further, because there is nothing to look at beyond the board,
- **the upper bound** is a cell with a side of ~48 px; above that only a few pieces are
  visible and orientation on the board falls apart.

Scaling always preserves the point under the cursor or under the centre of the gesture
— without that, zooming in on a large board comes down to guessing where you will land.

The `+`, `−` and "fit" buttons matter also because they are **the only route available
from the keyboard and with a mouse without a wheel** — a gesture cannot be the only way
to perform an action necessary for play.

Supplementary rules:

- Dragging **without** a modifier does nothing. The move is performed only on button
  release and only if the pointer is still over the same piece on which it was pressed
  — standard button semantics, protecting against an accidental move when the hand
  twitches.
- The modifier condition checks `event.metaKey || event.ctrlKey`, with no OS detection.
  Platform detection serves solely the **text** of the hint ("hold ⌘", "hold Ctrl") —
  if detection failed, the controls would still work.
- On touch a distance threshold distinguishing a tap from a drag applies, because no
  modifier exists there. It is the only place where the decision remains
  threshold-based.

### Configurator (advanced mode)

Entered from the main screen, behind a button. The parameters correspond directly to
the fields of `GeneratorParams` — all the values compared in the preview (§ "Preview"
below) are available to the player:

| Parameter | Range | What it does |
|---|---|---|
| width × height | 10×10 … 1000×1000 | size of the task; any aspect ratio, presets offer 1:1 and 1:2; above 200 on a side the configurator warns that generation takes seconds to minutes |
| share of long lines | 0 … 0.45 | the main looks knob: dense hooks ↔ long snakes |
| maximum length `Lmax` | 16 … 5·max(W,H) | how long the longest piece may be |
| entanglement strength | 0 … 8 | turns versus coiling into balls; below 2 generation can be unreliable |
| stroke width | 0.35 … 0.65 of the pitch | legibility: width of the gaps between parallel lines |

The engine knobs behind this form, and every advanced knob the prototype lab
exposes, are bounded by the parameter envelope of §7 (2026-09-08): the form
validates against the same bounds and cross-knob rules as the engine, marks
the offending fields and disables Generate while a violation stands.

**The number of lines is not a parameter** — with full coverage it follows from the
length distribution (`number of lines = W · H / mean length`) and the configurator shows
it as a derived quantity, together with the rest of the generation report. The
Easy–Nightmare presets are **saved instances of the same structure**, not a separate
code path — a single source of truth for the generator.

The configurator computes live the share of area occupied by long pieces (§7) and warns
once it exceeds ~25%. After generation it shows **what was actually achieved**: the
number of pieces, the length distribution, and the number of generator backtracks and
restarts. It does not report fill, because it is always full. This is necessary because
geometry can refuse — straight and very long pieces often do not fit, and the generator
cannot promise a number that cannot be realised.

### Performance — measured, not estimated

The prototype (`prototype/carve.mjs`) measured the full cycle on a Nightmare 100×100
board (10 000 cells, ~1 900 pieces):

| Operation | Time |
|---|---|
| generating the whole board | **27 ms** |
| computing all metrics + solver | **14 ms** |

That is two orders of magnitude less than the earlier budget assumed. Consequently,
**removed as unnecessary**: corridor bitboards and the inverse coverage index.

One thing came back after a more precise measurement: **a loading indicator is
needed**. The mean was misleading — the generation time distribution is extremely
heavy-tailed and p99 reaches 442 ms on Nightmare (§9), which is a visible interface
freeze. We show the indicator after 200 ms. A Web Worker is still not necessary, but
the DOM-free core remains portable to one without changes, should the measurement on
the target hardware turn out worse.

One real performance question remains, which the prototype does not touch because it
has no view layer: **whether SVG keeps up with ~1 900 paths with zoom and panning**.
The renderer sits behind an interface precisely for this eventuality; if it does not
keep up, we swap the implementation for Canvas without touching the core. We measure
this at the first working viewport, not earlier.

PWA: manifest, icons and a cache-first service worker (`vite-plugin-pwa`). The game is
fully client-side, so offline works without additional logic.

## 12. Tests

The core is unit-tested in Vitest, without a browser. Three layers:

**Unit tests of the sweep region and move legality:**

1. A U or S shape with a foreign piece trapped in the concavity: **does not block**. The
   piece clears its own arc, because it travels along it, not through it. The test
   exists precisely to catch a return to the old rigid-translation rule.
2. A straight piece lying along its own direction: the ray from the tail passes through
   own cells and cannot block the piece.
3. An L shape whose second arm has a foreign piece in front of it: **does not block**,
   because only the ray from the head counts. The second test guarding against a
   relapse into the rigid-translation rule.
4. A piece lying along the edge, perpendicular to its direction → always free.
5. A blocker in the last cell at the edge (inclusive loop) and a blocker right in front
   of the piece.
6. Two parallel pieces with the same direction side by side → both free; one behind the
   other on the same line → the rear one blocked, the front one free.
7. The same blocker in three corridor cells: after its removal the piece becomes free
   exactly once (counter consistency).
8. Direction sign: arrowhead at `(5,3)` with `dir = right` → body at `(4,3)`. An
   arrowhead pointing into the board's interior (corridor across the whole board) is
   legal.

**Shape and generator tests:**

9. Extreme lengths `ℓ = 2` and `ℓ = Lmax`; growth that got stuck accepts a shorter
   piece, never one of length 1.
9a. A very long piece, winding through most of the board, whose **body lies in front of
   its own head**: the ray from the head passes own cells first, and only then a
   possible blocker. The bounce distance is counted from the last passed own cell, not
   from the head.
9b. Length distribution: at the given bucket weights the generator actually produces
   long pieces (benchmark report), rather than quietly trimming everything to short.
10. Self-avoidance: the path does not visit a cell twice, but is allowed to touch itself
    side-on.
11. A piece longer than the board dimension; degenerate boards `1×N` and `2×2`; the
    generator always finishes with full coverage, never loops forever.
12. Updating `depth_d` after carving a piece: a cell at the edge increases the line's
    `depth`, a cell in the interior does not (until contiguity from the edge closes).
12a. **Full coverage:** after generation finishes, every grid cell belongs to exactly
    one piece — none is left unassigned and no two pieces overlap. The sum of piece
    lengths equals `W · H`. This is the generator's most important invariant; checked on
    many seeds and all sizes.
12b. **Every piece has at least 2 cells.** An invariant checked on all generated boards;
    a violation means head selection stopped requiring an unassigned neighbour.
12c. The leftover-fragment shape test detects the **plus-shaped pentomino** as a
    non-decomposable fragment. This is the case the naive isolation test does not catch,
    so it must have its own test — with an explicitly constructed state `R`.
12d. The generator gets out of a jam: for a hostile state `R` in which no legal piece of
    length ≥ 2 exists, it undoes carvings and finishes with full coverage or restarts —
    it never returns a board with unassigned cells and never loops forever.
12e. An odd board area (e.g. 25×25 = 625) is handled: at least one piece has an odd
    length, and coverage remains full.
13. Determinism: the same seed gives the same board.

**Property tests (hundreds to thousands of seeds):**

14. Every generated board passes the solver: solvable.
15. The reversed insertion order is a valid solution — every move legal.
16. Confluence: random greedy playouts never reach a state with no free piece on a
    non-empty board.
17. Removing any piece from a solvable board leaves it solvable.
18. **Differential test:** the `free` field from `probeMove` in the game engine and the
    membership test in `S_d` from the generator must agree bit for bit on random states.
    A divergence between them is exactly the bug that produces unsolvable boards.
19. The solver detects hand-constructed cycles (two-piece `A → ← B` and three- or
    more-piece) and points out the cycle's pieces.

**Tests of bounce distance, streak and scoring:**

24. `probeMove` returns the correct `distance` and `blockerId`: a blocker right in front
    of the head (`distance = 1`), a distant blocker, and a piece whose **body lies in
    front of its own head** — the ray then passes own cells, and the distance is counted
    from the last passed own cell. This case is the most likely to catch a bug in
    `lastOwn`.
25. When there are several blockers, `distance` corresponds to the **nearest** one, and
    `blockerId` points to exactly that piece.
26. Streak: grows with consecutive correct moves, resets on a mistake, `bestStreak`
    remembers the maximum. Does not affect `score`.
26a. **`score` stays zero throughout play** and changes exactly once, on the transition
    to `won`. Removing a piece does not change the score.
26b. **A loss gives zero points**, even if the player removed all pieces but one.
26c. Monotonicity: the same board completed with more lives gives a score no lower; in
    the timed variant, completed faster — no lower.
26d. The time bonus is bounded on both sides: very fast and very slow completion give
    values at the ends of the interval, not beyond it. In the classic variant time does
    not affect the score at all.
26e. **Anti-exploit test:** a 100×100 board made of nothing but dominoes (5 000 pieces
    of length 2) scores clearly lower than a Nightmare board of the same size, despite
    five times as many clicks. This is the test that makes sure scoring measures
    difficulty, not the number of clicks — and which will fail on any careless change
    of the weights.
26f. The score is a pure function: the same board metrics, the same lives and the same
    time give the same score, regardless of how play unfolded.
27. The reducer is deterministic with respect to time: the same sequence of actions with
    the same `at` timestamps gives an identical `elapsedMs` and score, regardless of the
    system clock. The test must not need clock mocks — if it does, the reducer has
    stopped being pure.
28. The `tick` action updates `elapsedMs`, but does not change the board, lives or
    streak.

**Scale and parameter tests (Nightmare 100×100):**

20. Generating a 100×100 board finishes and passes the solver — on many seeds. This is
    the test most likely to catch performance bugs and overflows.
21. Extreme configurator sizes: the minimum board (e.g. 5×5), the maximum, and
    **infeasible** parameters (1000 lines of length 300 on a 25×25 board). The generator
    finishes in finite time, returns the best result and reports the discrepancy between
    what was ordered and what was delivered — it never loops forever and never throws.
22. Degree of bending at the extremes: `p_s = 1` (perfectly straight pieces, they must
    turn only at the edge) and `p_s = 0` (maximally twisty). In both cases the generator
    produces valid, solvable boards.
23. The area share of the long bucket agrees with the value the configurator computes
    from the parameters — otherwise the 25% warning is misleading.

**Benchmark (not a test, but an implementation step):** a report on the actually
achieved length distribution, difficulty metric values, frequency of generator
backtracks and restarts, and generation time for a set of parameters — the basis for
calibrating the thresholds from §9 and for the decision about the optimisation path from
§13.

The session reducer is tested separately: legal and illegal click, loss of lives,
transitions to `won` and `lost`.

## 13. Out of MVP scope

**Deliberately deferred features:** undo (requires a move history — cheap if the
reducer is pure from the start, and it is), hints, level progression, saving progress
and leaderboards, sound, a polished visual layer. The stopwatch, streak and scoring
**are in** the MVP (§10); persistent storage of scores stays out of scope.

**Optimisation path — closed by measurement.** Earlier versions of this design described
here corridor bitboards and an inverse coverage index as structures to be implemented
should plain loops fail to keep up at ~1 900 pieces. The prototype measured the full
cycle on Nightmare: **27 ms of generation and 14 ms of metrics** (§11). The margin is so
large that these structures are struck from the design, not deferred. If they ever
return, they will return on the basis of a profile, not a hunch. The first such profile
exists: raising the ceiling to Insane 1000×1000 showed that the default knobs scale
linearly (~10 s), while layers mode spent 86% of its time in the leftover-absorption
path search (§9). That function was optimised on the strength of the profile — a memo
of failed fragments plus an allocation-free search — with a fixed-seed fingerprint test
guaranteeing the same board before and after. After it, absorption is ~20% of layers
mode and the carving loop itself is the largest item again.

**A rule change that changes the game's character.** The current rules give no planning
depth. If it were ever desired, the rules would have to change — for example "the piece
stops at the obstacle instead of staying in place" or a move limit. Then, however, the
corridor stops being fixed, the blocking graph stops being static, solvability stops
being an acyclicity problem, and the solver requires backtracking search. All the
elegance of §6–§8 disappears. A deliberate decision, not one to be discovered halfway
through implementation.

## 14. Risks

| Risk | Mitigation |
|---|---|
| A divergence between the corridor definition in the engine and in the generator produces unsolvable boards | A shared corridor definition plus the differential test (§12.18) and the solver on thousands of seeds (§12.14) |
| A relapse into the rigid-translation rule through inattention (the natural reflex: "check whether the space in front of the whole shape is free") | Tests 1 and 3 from §12 check directly that the concavity and the second arm of the L do **not** block |
| Generated boards are boring despite being correct (carving frontier too even, many free pieces at the start) | A bias preferring carving in tunnels rather than layers (§7), the `f0` and `T_k` metrics at generation, the generate-measure-reject loop |
| The frontier bias turns out ineffective and `f0` stays high | The generate-measure-reject loop works independently of the bias, only at a higher cost; the benchmark decides whether the bias stays in the code at all |
| ~~The generator deadlocks at minimum length 2~~ | **Closed by measurement:** on average 0–0.5 backtracks per board, zero restarts at all four sizes (§7). The two-phase variant is no longer needed as a fallback plan |
| The length distribution does not deliver the order: 28–47% of paths get stuck before the target length, so boards come out finer-grained than planned | The phenomenon has been measured and described (§7); the bucket weights require calibration for the actually achieved mean, not the ordered one |
| Boards come out in stripes instead of tangled, because a turn is legal only at the height of the neighbouring line's frontier | A bonus for lateral movement and the deepest-line preference when choosing the head (§7); the looks need further work and are the project's biggest open question |
| The leftover-fragment shape test lets through a non-decomposable fragment other than the plus | The solver from §8 verifies every board independently of the generator; backtracking fires on an actual jam, not merely a prediction |
| Difficulty thresholds picked blind | Benchmark before calibration; the thresholds from §9 are explicitly preliminary |
| The player farms points with a degenerate board from the configurator (huge but trivial) | The scoring base scales with area, not with the number of clicks; the multipliers measure difficulty per click; anti-exploit test 26e |
| Scoring weights chosen such that the presets do not form an ascending sequence | Benchmark calibration on all four presets; the formula in one module |
| Generation hangs on hard parameters | A hard attempt limit; once exhausted we return the best result |
| Long pieces quietly fail to arise (growth always gets stuck, the board looks like a mince of small bits) | A length upper bound decreasing with progress, plus test 9b reporting the actual length distribution |
| One long line exhausts its direction's capacity and blocks further insertions | Balancing the four directions; an upper bound on the number of long pieces per direction, calibrated by benchmark |
| A dozen or so long pieces occupy most of the area and the board looks like a set of spirals instead of a field of arrows | The long bucket's area share computed explicitly (§7), shown in the configurator, a warning above 25%, test 23 |
| ~~Generating 100×100 freezes the interface~~ | **Closed by measurement:** 27 ms on Nightmare (§11) |
| Generating Insane 1000×1000 takes tens of seconds, longer in layers mode | Generation in a Web Worker with progress and abort (§9); the configurator warns above Extreme; the absorption path search is memoised and allocation-free and biased cuts fall through the head quarters (prototype round 9), so layers close Insane in ~35 s with no backtracks |
| An Insane run record (~86 000 moves) does not fit a Firestore document | Slice 10: the move list is bounded by `MAX_MOVES` and its storage format must be measured against the 1 MiB document limit before Insane is exposed on the leaderboard |
| SVG does not keep up at ~1 000 paths or zoom stutters | The §11 performance budget measured early; the renderer behind an interface, swapping for Canvas does not touch the core |
| The player loses a life while trying to pan the board | On desktop panning requires the ⌘/Ctrl modifier, so the decision is unambiguous, not threshold-based; on touch a distance threshold plus the requirement to release over the same piece (§11). Covered by an interaction test |
| The configurator promises parameters that the geometry does not allow | The generator reports achieved values alongside ordered ones (§11); test 21 on infeasible parameters |
