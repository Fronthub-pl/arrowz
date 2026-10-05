# Arrowz

Arrowz is a puzzle. You get a rectangle packed with arrows, and you clear it one arrow at a time, in the right order. The lab is where its boards are made: you pick the settings, the generator lays a board, and you see what came out.

::board[A 40 by 40 board]{cmd="--width=40 --height=40 --seed=7"}

> Arrowz is in alpha: the board generator is done, and the game itself — lives and a score — is designed but not built yet. The three boards under “The one rule” already play by it.

## The puzzle {#puzzle}

A board is a grid of cells, and every cell is covered by an arrow. An arrow is a line that walks from cell to cell — up, down, left or right, never across itself — with an arrowhead at one end that says which way it goes. Arrows run from two cells to several hundred.

Here is a small one, eight cells by eight, with every arrow in its own colour:

::board[A small board, each arrow in its own colour]{cmd="--width=8 --height=8 --seed=7 --colored"}

A real board draws every arrow in one colour, because telling the arrows apart by eye is the game. The small boards below show only the arrows that matter, each in its own colour, so it is easy to follow.

You win when the board is empty, and lose when you run out of lives. You can never get stuck: while arrows remain, at least one of them is free, so the whole difficulty is in _seeing_ which.

## The one rule {#rule}

You tap an arrow, and it tries to drive straight off the board in the direction its arrowhead points. Only the **path to the edge** matters: the straight strip of cells from the arrowhead to the edge of the board.

**If the path is clear, the arrow leaves.** Try it on the board below: click an arrow with ⌘ held (Ctrl on Windows and Linux), or tap it. The ☝ button on the board switches it to plain clicks.

::play{board="rule-free"}

If anything stands in the path, the arrow bumps into it, slides back, and you lose a life. Here another arrow is parked across the path. Clear it first, and the arrow behind it can leave too.

::play{board="rule-blocked"}

The shape of an arrow does not matter. It travels along its own body, every cell shuffling up into the one in front, so a horseshoe with another arrow inside its bend is still free when its path is clear.

::play{board="rule-shape"}

## What the generator promises {#promises}

Every complete board the generator hands back has been checked:

- **Nothing is left over.** Every cell belongs to exactly one arrow: no gaps, no overlaps.
- **No arrow is a single cell.** The shortest arrow is two cells, because a single cell would have no direction to point in.
- **The board can always be cleared.** Before it hands a board over, the generator works out which arrow blocks which and proves the puzzle has a solution.
- **It knows at least one solution.** The order in which the generator laid the arrows is itself a winning order.
- **You cannot play yourself into a corner.** Any sequence of legal moves empties the board in the end.
- **The same request gives the same board.** The same settings with the same seed give the identical board, down to the last cell.

What it does not promise is that every request succeeds. On hard settings the generator can get stuck while it lays a board. It then takes some arrows back and tries again, and if that still fails, it starts over from a new seed worked out from yours. When every attempt fails, it says so — the board comes back marked not complete — instead of passing a broken board off as a good one.

The settings that steer the generator, and the safe range of each, are on the [Command line](docs:cli#knobs) page.

## Words {#words}

- **arrow** — one line on the board, from two to several hundred cells long, with an arrowhead at one end. In the code: `piece`.
- **arrowhead** — the pointed end of an arrow; it shows which way the arrow goes. In the code: `head`.
- **path to the edge** — the straight strip of cells from an arrowhead to the edge of the board. When it is clear, the arrow can leave. In the code: `corridor`.
- **free** — an arrow whose path to the edge is clear, so it can leave right now.
- **complete** — a board where every cell is covered by an arrow.
- **seed** — a number that decides which board you get. The same seed with the same settings gives the same board.
