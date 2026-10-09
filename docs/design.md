# How Arrowz works

This page states the rules of the puzzle exactly, and explains the ideas
behind the generator: why every board it hands back can be cleared, and why
its settings have a safe range. The [main README](../README.md#the-puzzle)
shows the rules in pictures, [the engine's
README](../packages/engine/README.md#what-the-generator-promises) lists what
the generator promises and its API, and
[HISTORY.md](../packages/engine/HISTORY.md) has the measurements.

## Contents

- [The rules](#the-rules)
- [The key consequence](#the-key-consequence)
- [Checking a move](#checking-a-move)
- [How the generator builds a board](#how-the-generator-builds-a-board)
- [Why every board can be cleared](#why-every-board-can-be-cleared)
- [The safe range](#the-safe-range)

## The rules

A board is a grid of `W × H` cells covered by arrows (the code calls an arrow
a _piece_). Every cell belongs to exactly one arrow; there are no empty cells.

An arrow is a path over the grid: it steps up, down, left or right, and never
visits a cell twice. It may touch itself side by side, as a spiral does. One
end is the arrowhead (the _head_, the first cell of `Piece.cells`). The arrow
points the way its last step goes, from the cell behind the head into the
head; `Piece.dir` stores that direction.

An arrow has at least two cells. A single cell has no last step, so it would
have no direction: it would be a point, not an arrow.

A move is a tap on an arrow. The arrow travels along its own track: the head
moves forward, and every other cell slides into the cell in front of it, like
a train on rails. The body only ever enters cells the arrow itself has just
left.

- The **path to the edge** (the code says _corridor_) is the straight ray of
  cells from the head to the edge of the board, in the arrow's direction,
  minus the arrow's own cells. The shape of the body plays no part.
- If no other arrow stands on the path to the edge, the arrow is **free**: it
  leaves the board.
- Otherwise the arrow **bounces**: it drives up to the first arrow in its way
  and returns to where it was, and the player loses a life. The board after a
  bounce is the board before it; the bounce only shows where the blocker is.

The game is won when the board is empty and lost when the lives run out.
Lives, the clock and the score belong to the host application; the engine
only decides what a tap does (see [Checking a move](#checking-a-move)).

## The key consequence

A move never stops halfway: the arrow either leaves entirely or returns to
its place. So the path to the edge does not depend on the state of the board.
It is a fixed property of the head cell and the direction.

Everything below follows from this:

- Removing an arrow can only free others, never block them. A game is
  therefore nothing but the set of arrows that have left (`Session.gone` in
  `game.ts`); the board is never rewritten.
- "Arrow A blocks arrow B" is a fixed relation, so the generator can reason
  about the whole game before anyone plays it.

## Checking a move

`play` in `game.ts` walks the ray from the head cell to the edge. It skips the
arrow's own cells and the cells of arrows that have left, and stops at the
first cell of any other arrow. It returns either an `exit` or a `bounce`
naming the blocker and how far the arrow can travel before touching it. One
move costs at most one walk across the board, `O(max(W, H))` steps.

The own cells have to be skipped because an arrow can wind so that part of
its body lies in front of its head. It passes those cells first, travelling
along itself, and only another arrow can stop it. For the same reason a
horseshoe with another arrow inside its bend is still free: it slides round
the bend instead of through it.

## How the generator builds a board

### From a full board, in removal order

Because every cell is covered, the generator does not place arrows on an
empty board. It cuts them out of a full one, in the order the player will
remove them. The code calls this _carving_ (`Carver`, `carveOne` in
`engine.ts`).

At the start every cell is uncovered. The generator builds arrows
`q1, q2, …, qN` one after another, where `q1` is the arrow the player removes
first. Arrow `qj` may be built only if its path to the edge runs entirely over
cells that are already covered, by earlier arrows, or that are its own. The
generator stops when no uncovered cell is left, so the board is always full.

The same test is the engine's move rule run backwards: the cells an arrow
crosses to leave are the cells it would cross to drive in. The generator and
the game therefore share one definition of the path to the edge.

### Where an arrow may start

On each line, counting from the edge in direction `d`, the covered cells form
an unbroken run up to the first uncovered cell. Only that first uncovered cell
can be the head of an arrow pointing at that edge: everything between it and
the edge is covered. The generator keeps the depth of this frontier for every
line and every direction (`Carver.depth`, read by `headCandidate`), so
finding the head candidates of a direction costs one look per line.

The cell behind the head, against the direction, must also be uncovered. It
becomes the arrow's second cell, which makes the arrow point the right way
and guarantees at least two cells from the start.

The condition is on the head alone. The rest of the body grows over uncovered
cells in any direction, with no other constraint. That freedom is what makes
the tangled shapes. How the next head is chosen (from the shallowest lines,
the deepest, or a mix) is one of the settings; the [command line's
README](../packages/cli/README.md#words) calls the two ends layers and
tunnels.

### No one-cell leftovers

A good head guarantees that the arrow being built is long enough. It does not
guarantee that the cells left uncovered can still be split into arrows of two
or more cells. Ruling out isolated cells is not enough: a T of four cells has
no isolated cell, yet no split into paths of two or more cells exists.

So every new arrow is tested before it is committed (`wouldStrand`):

- a local test around the arrow (`hasLocalDefect`) looks for shapes no split
  can fix, such as a cell with three dead-end neighbours;
- every small leftover region next to the arrow, up to `STRAND_LIMIT` cells,
  is tested exactly (`decomposable`); larger ones pass.

An arrow that fails is shortened from the tail (`shortenPath`) until it
passes; the head, and so the path to the edge, stays where it is. An arrow
that cannot pass at two cells is dropped and another head is tried.

### Warnsdorff's rule is required

A body that winds freely tends to cut the uncovered cells into pockets no
arrow can fill, and large boards then stop filling at all. The cure is the
rule known from the knight's tour: step where the fewest free exits remain.
When the body grows, each candidate cell is weighted up the fewer uncovered
neighbours it has (the `warns` setting), so dead ends are eaten before they
are sealed off. It improves both how often a board fills and how it looks, because
eating dead ends makes the arrows turn. The safe range does not let it be
switched off.

### When the generator gets stuck

Sometimes no legal arrow can be added while cells are still uncovered. The
generator then tries, in order (`Carver.run`):

1. letting a neighbouring arrow's tail grow over a small leftover
   (`absorbLeftover`, up to `absorbLimit` cells), which changes no head and so
   no path to the edge;
2. trying every legal head instead of a few;
3. taking back the most recent arrows, as far as the newest one that touches
   the leftover, and building again, up to the `maxBack` budget;
4. starting over from a derived seed, up to `restarts` times.

If all of that fails, `generate` returns the board with `ok: false` and the
leftover in `stuck`, rather than a broken board.

## Why every board can be cleared

### The building order is a solution

When the player comes to remove `qj`, exactly `qj, …, qN` are on the board,
because the earlier arrows have left. Those are exactly the cells that were
uncovered when `qj` was built. Its path to the edge contained none of them
except its own, and the path to the edge does not change with the board. So
the move is legal, for every `j`: the building order, as it is, empties the
board. Letting a tail grow over a leftover keeps this true, because no path
to the edge crosses a cell that was still uncovered.

### Checked anyway

`generate` does not rely on the argument alone. On every full board it runs
`analyse`, which builds the **blocking graph**: an edge from arrow `A` to
arrow `B` when a cell of `B` lies on `A`'s path to the edge. Since that
relation is fixed, a board can be cleared exactly when the graph has no
cycle; the smallest cycle is two arrows on one line pointing at each other.
`analyse` sorts the graph topologically (Kahn's algorithm) and reports
`solvable`. A board that failed the check would be treated like a stuck run
(`deadlock: true`) and spent on the next restart.

### Any order of free moves wins

Being free only gets easier as arrows leave: removing arrows only uncovers
cells, and a clear path stays clear. Suppose a player removed only free
arrows and reached a non-empty board with nothing free, on a board that has a
solution. Take the first arrow `E` of that solution still on the player's
board. When the solution removed `E`, every arrow still on the player's board
was on the board too, and `E` was free. With fewer arrows around, `E` is free
now as well, which contradicts "nothing free".

So the player can never get stuck: while arrows remain, one of them is free.
Lives are lost only to wrong taps.

## The safe range

The generator's settings have measured limits. Outside them boards stop
filling, or take far longer to build for no gain. The limits come in two
kinds:

- a **range** for every setting: its minimum, maximum and step;
- **rules** across settings that no single range can express, such as the
  short and medium shares leaving room for long arrows, or the straightness a
  board needs rising with its size (`straightFloor`).

Some bounds keep boards filling; others (the backtrack and restart budgets,
for example) only cap the time a hopeless run can take.

The limits live in one place, `engine.ts`: `PARAM_SPEC` holds every setting's
range, step and default, and `RULES` holds the cross-setting rules. Do not
copy the numbers elsewhere; read them there, or as tables in the command
line's README under [The knobs](../packages/cli/README.md#the-knobs) and
[Combinations that are
refused](../packages/cli/README.md#combinations-that-are-refused).
`envelope.test.ts` pins the ranges so that one cannot quietly grow wider.

The engine refuses rather than repairs. `validateParams` returns one
violation per setting out of range or off its step and one per broken rule;
`generate` throws `InvalidParamsError` with that list before it builds a
single cell. The command line prints the violations and exits with code 2;
the lab marks the settings and will not generate until they are fixed. Only
values loaded from outside (a URL, a stored board) are pulled into range,
with `clampParam`. The defaults, the presets and every value of the everyday
settings sit inside the safe range.

The measurements behind the limits are in
[HISTORY.md](../packages/engine/HISTORY.md), rounds 11, 12 and 14.
