# Arrowz

**English** · [Polski](README.pl.md)

Arrowz is a puzzle. You get a rectangle packed with arrows, and you have to
clear it — one arrow at a time, in the right order. This repository holds the
part that makes the puzzles: a **board generator**, plus a command-line tool
and a small web page for using it.

This page is written for someone who has never seen the project. No programming
knowledge is assumed. If a word needs explaining, it is explained where it
first appears.

<p align="center">
  <img src="docs/images/hero.png" alt="A 40 by 40 Arrowz board" width="560">
</p>

---

## Contents

1. [The puzzle in one minute](#the-puzzle-in-one-minute)
2. [What the generator promises](#what-the-generator-promises)
3. [Getting the tool running](#getting-the-tool-running)
4. [The commands](#the-commands)
5. [The everyday settings](#the-everyday-settings)
6. [The full set of settings](#the-full-set-of-settings)
7. [The web page](#the-web-page)
8. [Where boards are saved](#where-boards-are-saved)
9. [When something goes wrong](#when-something-goes-wrong)
10. [Word list](#word-list)
11. [Where things live](#where-things-live)

---

## The puzzle in one minute

### What you are looking at

A board is a grid of small squares. Every square is covered by an arrow, and no
square is left empty. An arrow is a line that walks from square to square —
only up, down, left or right, never diagonally, and never across itself. One
end of the line has a pointed tip. That tip is the front of the arrow, and it
says which way the arrow wants to go.

Here is an eight-by-eight board with each arrow in its own colour, so you can
tell them apart:

<p align="center">
  <img src="docs/images/tiny-colorized.png" alt="A small board with six arrows in different colours" width="360">
</p>

Six arrows, six tips. The green one is bent into a hook, the red one is bent
twice, the purple one is just two squares long. Arrows can be as short as two
squares or as long as several hundred.

Real boards use one colour for everything, because telling the arrows apart by
eye is the whole point of the game:

<p align="center">
  <img src="docs/images/tiny.png" alt="The same small board in a single colour" width="360">
</p>

### The one rule

You tap an arrow. It tries to drive straight out of the board, in the direction
its tip points.

Picture a narrow lane starting just in front of the tip and running in a
straight line to the edge of the board. That lane is the only thing that
matters.

**If the lane is clear, the arrow drives out and disappears.**

<p align="center">
  <img src="docs/images/rule-free.png" alt="An arrow with a clear lane in front of its tip" width="440">
</p>

The dark blue arrow points right. The dashed lane in front of it is empty, so
the arrow leaves the board. The grey arrow further down is irrelevant — it is
not in the lane.

**If anything is standing in the lane, the move is not allowed.** The arrow
lurches forward, bumps into whatever is in the way, slides back to where it
started, and you lose a life. The bump is deliberate: it shows you what blocked
you.

<p align="center">
  <img src="docs/images/rule-blocked.png" alt="An arrow with another arrow standing in its lane" width="440">
</p>

Here the red arrow is parked across the lane, so the blue arrow cannot go
anywhere.

The part that trips everyone up: **the shape of an arrow does not matter, only
its lane.** An arrow bent into a horseshoe with another arrow sitting inside
the bend is still free to leave — that other arrow is not in the lane.

<p align="center">
  <img src="docs/images/rule-shape.png" alt="A horseshoe-shaped arrow with another arrow inside its bend, still free to leave" width="440">
</p>

The blue arrow curls around the grey one, but its lane, the dashed strip, is
clear. Tap it and it goes.

The reason this works is that an arrow travels along its own body. The tip
moves one square forward, and every square behind it shuffles up into the space
just vacated. The arrow never crosses a square it does not already occupy. That
is why its curves and hooks make no difference to whether it can move.

### Winning and losing

You win when the board is empty. You lose when you run out of lives — the
design gives the player three.

You can never get stuck. As long as arrows remain on the board, at least one of
them is always free to leave, and clearing a free arrow never traps the rest.
The difficulty is entirely in *seeing* which arrow is free. Tapping blindly is
what costs you.

> **Note.** The playable game — tapping, lives, score — is designed but not
> built yet. What lives in this repository is the machine that produces the
> boards, and the tools for looking at what it produces.

---

## What the generator promises

Every board the generator hands back has been checked. It guarantees:

| Promise | What it means for you |
|---|---|
| **Nothing is left over** | Every square belongs to exactly one arrow. No gaps, no overlaps. |
| **No arrow is a single square** | The shortest arrow is two squares, because a single square would have no direction to point in. |
| **The board can always be cleared** | Before handing the board over, the generator works out who blocks whom and proves the puzzle has a solution. |
| **It knows at least one solution** | The order in which the generator built the arrows is itself a winning order. |
| **You cannot play yourself into a corner** | Any sequence of legal moves eventually empties the board. |
| **The same request gives the same board** | Ask twice with the same settings and the same seed number, and you get the identical picture, down to the last square. |

One thing it does **not** promise: that every request succeeds. On hard
settings the generator can paint itself into a corner while building. When that
happens, it undoes some of its work and tries again. If that still fails, it
starts over from scratch, up to a few times. If every attempt fails, it says so
plainly instead of handing you a broken board.

---

## Getting the tool running

### Installing Deno

**[Deno](https://deno.com/) version 2.9 or newer.** That is the whole list.
Deno is a single program that runs the code in this repository. There is
nothing else to install and no separate download step.

On macOS or Linux:

```sh
curl -fsSL https://deno.land/install.sh | sh
```

On Windows (PowerShell):

```powershell
irm https://deno.land/install.ps1 | iex
```

Check it worked:

```sh
deno --version
```

### Getting the code

```sh
git clone https://github.com/Fronthub-pl/arrowz.git
cd arrowz
```

Run every command on this page from inside that `arrowz` folder.

### Making your first board

```sh
deno task carve --width=25 --height=25
```

The first time you run this, Deno spends a few seconds fetching the two small
helper libraries it needs. After that a 25×25 board takes well under a second.

The board lands in `packages/cli/boards/25x25/` as two files — a picture and a
small text file describing it. Open the picture in any browser.

### Five things to try

Copy any of these. Each one writes a picture into `packages/cli/boards/`; add
`--dry-run` (explained below) to see the numbers without writing a file. Every
flag used here is explained in [The everyday settings](#the-everyday-settings).

```sh
# small enough to follow every arrow by eye
deno task carve --width=12 --height=12 --colorized

# a dense field of tiny arrows
deno task carve --width=40 --height=40 --length=0 --colorized

# a few long snakes instead
deno task carve --width=40 --height=40 --length=1 --straight=1 --colorized

# long highways crossing the whole board
deno task carve --width=80 --height=80 --skeleton --colorized

# a tall board, which is harder to play than a square one
deno task carve --width=40 --height=80
```

### Checking that everything works

```sh
deno task test
```

This runs the project's own set of checks — 124 of them, including nine
reference boards that must come out pixel-identical every time. It takes about
half a minute. You do not need to run it to use the tool; it is there if you
want to be sure nothing is broken.

### Making a standalone program

If you would rather have a single file you can run without Deno being involved
every time:

```sh
deno task compile
```

That writes a self-contained program to `packages/cli/dist/carve`. It takes
exactly the same options as `deno task carve`, and is shorter to type:

```sh
./packages/cli/dist/carve --width=25 --height=25 --dry-run
```

One catch. The standalone program does not know where the repository is, so it
cannot work out where to file boards. Before asking it to save anything, tell
it where to put them:

```sh
export ARROWZ_BOARDS_DIR=~/arrowz-boards
./packages/cli/dist/carve --width=25 --height=25
```

Without that, saving fails with an error about a directory it cannot create.
Asking it to describe a board rather than save one (`--dry-run`, below) works
either way.

---

## The commands

Everything runs through one command, `deno task carve`, which has two modes.
The **plain** mode covers the everyday options and is what you want most of the
time. The **advanced** mode, switched on with `--advanced`, exposes all
thirty-odd internal dials.

Both print their own instructions:

```sh
deno task carve --help              # the everyday options
deno task carve --advanced --help   # every dial there is
```

### Making a board

```sh
deno task carve --width=40 --height=40 --seed=7
```

Writes two files into `packages/cli/boards/40x40/`:

* `seed7-7636b469.svg` — the picture.
* `seed7-7636b469.json` — a small text file recording what was asked for.

The name is the seed number plus a short code worked out from the settings. Two
boards made with different settings therefore never overwrite each other.

### Saving a board somewhere specific

```sh
deno task carve --width=40 --height=40 --svg=my-board.svg
```

Same as above, and additionally drops a copy at `my-board.svg`.

### Describing a board without saving it

```sh
deno task carve --width=30 --height=30 --seed=7 --dry-run
```

Builds the board, writes nothing, and prints one line of text describing it, in
a format meant for programs rather than people. Trimmed to the interesting
parts:

```json
{
  "W": 30, "H": 30, "seed": 7,
  "ok": true,
  "pieces": 87,
  "avgLen": 10.34,
  "maxLen": 44,
  "solvable": true,
  "genMs": 11,
  "simpleCommand": "deno task carve --width=30 --height=30 --seed=7"
}
```

Read that as: the board was built successfully, it holds 87 arrows, the average
arrow is 10.3 squares long, the longest is 44, the puzzle has a solution, and
the whole thing took 11 milliseconds. `simpleCommand` is the command that
reproduces it.

This is the fastest way to try a setting: you see how many arrows you get and
how long it took, without a single file on disk.

### When a board does not close

Rarely, at large sizes, the generator gives up before every square is covered.
The picture is still saved, with the uncovered squares tinted pink, the
description says `"ok": false`, and the command exits with code 1 so that
scripts notice. A run that is taking too long can be cut short:

```sh
CARVE_TIMEOUT_S=60 deno task carve --width=1000 --height=1000
```

That stops after a minute and saves whatever was drawn by then, marked
`"aborted": true`.

### Printing the measurements report

```sh
deno task carve --advanced --only=easy --square --runs=1
```

Builds boards at a chosen size and prints a page of measurements about them.
This one is a diagnostic tool for people tuning the generator, not something
you need to read. Real output:

```
--- Easy 25x25 (1 runs) ---
  coverage      100.00%   solvable: YES
  pieces        72   length 2..42
  length dist.  2-6: 63%  7-15: 22%  16-49: 15%  50+: 0.0%
  ...
  time          generation 22 ms, metrics 2 ms
```

The two lines worth knowing: `coverage 100.00%` means no square was left
uncovered, and `solvable: YES` means the puzzle can be finished.

With no `--only` it walks through every difficulty level in turn, up to
1000×1000, which takes a long time. `--bench=N` measures speed instead, N runs
per level.

### Asking for something impossible

The generator refuses settings it knows will not work before it starts, not
after ten minutes of grinding:

```sh
deno task carve --advanced --pstraight=0.2 --svg=/tmp/x.svg
```

```
invalid parameters:
  - straightness bias: 0.2 is outside 0.6..1
see --help for the allowed ranges
```

The command ends with status code 2. A status code is a number a program leaves
behind when it finishes, and scripts read it to learn how things went: 0 means
everything went fine, 1 means the generator gave up, and 2 means you asked for
something out of range.

---

## The everyday settings

Eleven flags in four groups: two for size, one for luck, four that change the
puzzle, and four that change only how the picture is drawn.

### Size — `--width` and `--height`

How many squares across and down. Both are required. Anything from 4 to 1000.

A 400×400 board is ready in under two seconds; 1000×1000 takes about ten. A
tall board is harder to play than a square one with the same number of squares,
because arrows have further to travel.

| `--width=20 --height=40` | `--width=100 --height=100` |
|---|---|
| <img src="docs/images/portrait.png" width="200"> | <img src="docs/images/big.png" width="330"> |

### How big a board can get

The ceiling is 1000×1000 — a million squares. Past roughly two hundred squares
a side the arrows stop being individually visible on screen, and the board
turns into fabric. All three below are shown at the same width here; only the
real size differs.

| 200×200 | 500×500 | 1000×1000 |
|---|---|---|
| <img src="docs/images/scale-200.png" width="250"> | <img src="docs/images/scale-500.png" width="250"> | <img src="docs/images/scale-1000.png" width="250"> |
| **3,619 arrows**, 0.2 s | **21,771 arrows**, 1.4 s | **85,809 arrows**, 9.6 s |

Nothing about the puzzle changes at that size. Here is a thirty-by-thirty
window into the million-square board, drawn at the same zoom as the 30×30
boards in the comparisons below — the same picture, just one part of a much
bigger one:

<p align="center">
  <img src="docs/images/scale-1000-detail.png" alt="A thirty by thirty window into a 1000 by 1000 board" width="440">
</p>

Two things are worth noticing in the numbers. The average arrow barely grows
with the board — 11.1 squares at 200×200 against 11.7 at 1000×1000 — so a
bigger board buys you more arrows rather than longer ones. The single longest
arrow does grow: 213 squares, then 278, then 354.

Unlike the smaller examples, these three are not stored here as drawings you
can download. Their files run to 0.9 MB, 7 MB and 22 MB, which is more than
belongs in a repository. Make your own with one command:

```sh
deno task carve --width=1000 --height=1000 --seed=7 --svg=huge.svg
```

### Seed — `--seed`

A number from 0 to 999999 that picks which board you get. With everything else
unchanged, the same seed always gives the same board. A different seed gives a
different board of the same character. Default: 7.

| `--seed=7` | `--seed=42` |
|---|---|
| <img src="docs/images/seed-7.png" width="260"> | <img src="docs/images/seed-42.png" width="260"> |

### Arrow length — `--length`

A dial from 0 to 1. Default: `0.75`.

Turn it **down** and the board fills with short arrows: many of them, each with
its own tip, packed together like a field of little hooks. Turn it **up** and
the board is made of a few long snakes with tips few and far between.

Measured on a 30×30 board with seed 7:

| `--length=0` | default (`0.75`) | `--length=1` |
|---|---|---|
| <img src="docs/images/length-short.png" width="250"> | <img src="docs/images/default-30.png" width="250"> | <img src="docs/images/length-long.png" width="250"> |
| **176 arrows**, average 5.1 squares | **87 arrows**, average 10.3 squares | **65 arrows**, average 13.9 squares |

More arrows is not automatically harder — it is a different kind of hard. Short
arrows give you many things to look at; long arrows give you fewer but each one
reaches further and blocks more.

### Line shape — `--straight`

A dial from 0 to 1. Default: `0.5`. It controls how eagerly a line keeps going
straight instead of turning.

Turn it **up** and arrows run in long straight strokes. Turn it **down** and
they wriggle, turning every few squares and worming into small pockets.

| `--straight=0` (most winding) | default (`0.5`) | `--straight=1` (straightest) |
|---|---|---|
| <img src="docs/images/straight-winding.png" width="250"> | <img src="docs/images/default-30.png" width="250"> | <img src="docs/images/straight-straight.png" width="250"> |
| 66 arrows, 5.5 turns each | 87 arrows, 3.2 turns each | 49 arrows, 2.1 turns each |

Worth noticing: pushing this dial to either extreme gives you *fewer* arrows
than the middle. Straight lines run further before they stop; winding lines
swallow more squares per arrow while filling in corners. The busiest boards are
the ones in between.

### Backbone — `--skeleton`

An on/off switch, off by default. Switch it on and the generator first lays
down a handful of very long lines — highways zig-zagging across the whole
board. Then it fills the channels between them with ordinary arrows.

| without | `--skeleton` |
|---|---|
| <img src="docs/images/skeleton-off.png" width="290"> | <img src="docs/images/skeleton-on.png" width="290"> |
| 337 arrows, longest 103 squares | 291 arrows, longest **168** squares |

This is the only way to get genuinely long arrows. Left to itself the generator
rarely produces one that crosses the entire board.

### Fresh luck every time — `--randomized`

Normally a dial position means one exact recipe. With `--randomized`, each dial
position is treated as a *range*, and the generator draws a fresh value from
inside it on every run.

The practical effect: with this switch on, the same seed gives you a different
board every time. That extra roll of the dice is not controlled by the seed.

Nothing is lost. The settings that were actually drawn are written into the
board's text file as a full command, so any board you like can be reproduced
exactly.

```sh
deno task carve --width=40 --height=40 --randomized
```

### How the picture is drawn

These four change nothing about the puzzle — only how it looks on screen.

**`--colorized`** gives every arrow its own colour. Useless for playing,
excellent for understanding. Every comparison picture on this page uses it.

| normal | `--colorized` |
|---|---|
| <img src="docs/images/seed-7.png" width="260"> | <img src="docs/images/colorized.png" width="260"> |

**`--lineweight`** is how thick the lines are, as a fraction of one square.
Default `0.5`, meaning a line fills half its square.

| `--lineweight=0.2` | `--lineweight=0.9` |
|---|---|
| <img src="docs/images/weight-thin.png" width="260"> | <img src="docs/images/weight-thick.png" width="260"> |

Note what happens to the tips. On a thin line the tip is a proper triangle,
wider than the line. Once the line gets thick, there is no room for a wider
triangle, so the tip becomes a sharpened point instead.

**`--arrowwidth`** and **`--arrowheight`** size the tips by hand, measured in
squares. Both default to 0, which means "work it out from the line thickness".

| `--arrowwidth=0.6 --arrowheight=0.6` | `--arrowwidth=2 --arrowheight=2` |
|---|---|
| <img src="docs/images/head-small.png" width="260"> | <img src="docs/images/head-big.png" width="260"> |

---

## The full set of settings

The eleven everyday flags are shortcuts. Behind each of them sit several
internal dials, and `--advanced` lets you reach them directly. Turning
`--length` down, for instance, really means "raise the share of short arrows
and lower the share of medium ones" — two dials at once.

You do not need this section to use the tool. It is here because the question
"what does this dial actually do" deserves an answer. The everyday ones are
called options on this page; the internal ones behind them are called dials.

```sh
deno task carve --advanced --w=40 --h=40 --seed=7 --pstraight=0.95 --svg
```

Two things change in advanced mode. Width and height become `--w` and `--h`.
And the everyday options are gone — you set the underlying dials yourself.

### What some of these look like

Four dials side by side, all on a 30×30 board with seed 7. Three of them
change the picture; the fourth changes something you cannot see.

**`--warns` — filling awkward corners first**

| `--warns=2` | `--warns=16` |
|---|---|
| <img src="docs/images/adv-warns-low.png" width="300"> | <img src="docs/images/adv-warns-high.png" width="300"> |
| 98 arrows, 2.4 turns each | 70 arrows, 3.8 turns each |

**`--wlateral` — turning sideways instead of pushing on**

| `--wlateral=0` | `--wlateral=20` |
|---|---|
| <img src="docs/images/adv-lateral-0.png" width="300"> | <img src="docs/images/adv-lateral-20.png" width="300"> |
| 49 arrows, average 18.4 squares | 96 arrows, average 9.4 squares |

**`--probe` — one target length for every arrow**

| `--probe=1 --probelen=2` | `--probe=1 --probelen=200` |
|---|---|
| <img src="docs/images/adv-probe-short.png" width="300"> | <img src="docs/images/adv-probe-long.png" width="300"> |
| 253 arrows, none longer than 4 squares | 61 arrows, longest 92 squares |

**`--headbias` — the dial you cannot see**

| `--headbias=-1` (layers) | `--headbias=1` (tunnels) |
|---|---|
| <img src="docs/images/adv-layers.png" width="300"> | <img src="docs/images/adv-tunnels.png" width="300"> |
| 83 arrows, **34%** of them free to leave at the start | 90 arrows, only **6.7%** free at the start |

The last two pictures look much alike, and that is exactly the point. This
dial barely touches the drawing. What it changes is how many arrows are free
at any moment, and that is what makes a board easy or hard. At the default
(`--headbias=0`) the board sits between the two: 13% free.

### The six groups

All thirty-one dials, grouped the way the generator groups them. Click a group
to open it.

<details>
<summary><b>Board</b> — 3 dials</summary>

**`--w`** — range 4–1000, default 25

Columns. Under two seconds up to 400×400; about ten seconds at 1000×1000.

**`--h`** — range 4–1000, default 50

Rows. A tall board is harder to play than a square one with the same number of
squares.

**`--seed`** — range 0–999999, default 7

Picks the board. Same seed and same dials, same board.

</details>

<details>
<summary><b>How long the arrows are</b> — 3 dials</summary>

Before drawing each arrow, the generator rolls a three-sided die to pick a
target length: short (2–6 squares), medium (7–15) or long (16 and up). These
dials load the die. Long gets whatever share is left over.

**`--wshort`** — range 0–1, default 0.2

Share of short arrows. Higher means more arrows and more tips, but the board
turns into a mess of little hooks.

**`--wmid`** — range 0–1, default 0.08

Share of medium arrows.

**`--lmax`** — range 0–5000, default 0

The longest arrow the generator will attempt. 0 means "two and a half times the
longer side". **Careful:** 1 to 5 shreds the board into crumbs and the
generator jams — it gets stuck with no legal arrow left to draw. Use 0, or 6
and up.

</details>

<details>
<summary><b>How the lines wander</b> — 6 dials</summary>

Each time a line grows by one square, these dials compete over which
neighbouring square it takes. They multiply together, so one extreme value
drowns out the rest.

**`--pstraight`** — range 0.6–1, default 0.85

How eagerly a line keeps going straight. Higher gives longer straight runs.
**Careful:** this is the one dial that can break things on its own. Below 0.6
large boards stop working; at exactly 0.6, boards above 500×500 sometimes jam.
0.65 is safe.

**`--wlateral`** — range 0–20, default 3

How much a line prefers turning sideways over pushing deeper into open space. 0
gives long straight pushes and, occasionally, enormous spirals.

**`--warns`** — range 2–16, default 4

How eagerly a line fills awkward corners before they become dead ends. Higher
gives fewer, longer, more curled-up arrows. **Careful:** below 2 the rule
switches off and boards jam.

**`--anticoil`** — range 1–10, default 6

How hard a line tries not to touch itself. 1 turns it off; higher gives fewer
spirals and slightly shorter arrows. **Careful:** at 10 with `--pstraight` at
0.45 or below, the generator jams four times out of five.

**`--hug`** — range 1–20, default 1

Bonus for running alongside arrows already drawn. Barely visible; kept for
experiments.

**`--edgehug`** — range 0–4, default 0

Whether the board's own edge counts as a neighbour for that bonus. Does nothing
unless `--hug` is above 1.

</details>

<details>
<summary><b>How hard the puzzle is</b> — 4 dials</summary>

These change which arrows block which — the difficulty — without much changing
what the board looks like.

**`--headbias`** — range `-1`, `0` or `1`, default 0

Where each new arrow starts. `-1` peels the board in layers from the outside
(easy: many arrows free at once). 0 starts anywhere. 1 digs inward from the
deepest point (hard: few arrows free at once). **Careful:** layers mode is slow
— 400×400 took two and a half minutes, and 1000×1000 was abandoned after ten.

**`--mix`** — range `-1`, or 0.3–0.7, default `-1`

Blends the two styles above. The value is the share of arrows that start as
tunnels; the rest start as layers. `-1` switches the blend off. **Careful:**
values outside 0.3–0.7 leave boards unfinished.

**`--probe`** — range 0–1, default 0

Share of arrows whose length is drawn around one fixed target instead of the
usual three-faced die.

**`--probelen`** — range 2–200, default 12

That fixed target, give or take half. 2 triples the number of arrows; 200 gives
a few very long ones. Does nothing unless `--probe` is above 0.

</details>

<details>
<summary><b>The backbone</b> — 10 dials</summary>

Switched on by `--skeleton` in everyday mode. The first few arrows are drawn as
long zig-zagging highways across the whole board, and everything else fills in
around them.

**`--giants`** — range 0–40, default 0

How many of the first arrows are highways. 0 means none; 4 is a good starting
point. Asking for many more is harmless but pointless: after the first two or
three, the later highways run out of room.

**`--giantspan`** — range 0–200, default 30

How long one highway aims to be, counted in lengths of the board's longer side.
It stops early if it runs out of room.

**`--giantstep`** — range 0–40, default 14

The gap between the parallel runs of a highway. Small gives regular stripes
like ruled paper; large gives a few sweeping highways; 0 lets it wander freely.

**`--giantjitter`** — range 0–1, default 0.6

How often a run stops short instead of going all the way to the obstacle. 0
gives perfectly straight, regular edges.

**`--wgiant`** — range 0–0.2, default 0

The chance that an arrow drawn later is also a highway. **Careful:** above 0.2
boards get slow and stop finishing at 1000×1000.

**`--giantstraight`** — range 0.3–1, default 0.94

How straight a highway runs where it has free space. **Careful:** below 0.3
boards stop finishing.

**`--giantwarns`** — range 0–16, default 0

The corner-filling rule, applied to highways only. Leave at 0 — it curls them
up, and a highway is supposed to travel.

**`--giantanticoil`** — range 1–20, default 6

The self-touching penalty, for highways only. Whichever is higher, this or the
general one, wins.

**`--giantspacing`** — range 1–3, default 2

How many squares a highway keeps between its own parallel runs. Above 3 only
costs time.

**`--giantspacepenalty`** — range 1–40, default 8

How firmly it is pushed away from itself. A penalty, not a ban, so it can still
turn back.

</details>

<details>
<summary><b>Getting unstuck</b> — 5 dials</summary>

What the generator does when it can no longer find a legal arrow to draw. The
defaults handle boards up to 400×400; these are for experiments.

**`--headtries`** — range 2–16, default 4

How many starting spots to try before giving up on a direction. **Careful:** at
1 the search is too shallow for hard settings. At 8 and above you usually get
the same board as at 4.

**`--strandlimit`** — range 10–30, default 30

The largest leftover patch that still gets a proper check for whether an arrow
fits in it. **Careful:** below 10, ten-square holes slip through on big boards.

**`--absorblimit`** — range 12–64, default 24

A leftover patch up to this size that no arrow fits into gets glued onto a
neighbouring arrow. **Careful:** at the bottom of the range, below 13,
leftovers pile up and boards fail far more often.

**`--maxback`** — range 0–1000, in steps of 50, default 0 (= 200)

How many drawn arrows may be undone in one attempt before starting over. More
rarely rescues anything; it just delays the bad news.

**`--restarts`** — range 0–5, default 3

How many fresh attempts, each with a nudged seed, after a failure. 0 shows you
the raw success rate of your settings.

</details>

### Combinations that are refused

Three rules cannot be written as a simple from–to range, so they are checked
separately:

| Rule | In plain words |
|---|---|
| Short plus medium share | Together they may not exceed 0.9, so at least a tenth of the arrows are long. |
| Maximum length | `--lmax` must be 0 (automatic) or at least 6. |
| The layers/tunnels blend | `--mix` must be `-1` (off) or between 0.3 and 0.7. |

Break a rule, or put any dial outside its range, and the generator refuses
before drawing anything, tells you which value was wrong, and stops with status
code 2. It never quietly rounds your number into range.

The everyday options cannot break these rules. They were built so that every
value of every everyday option, at every board size, produces a valid
combination.

---

## The web page

There is a small page for playing with the settings and seeing the result
immediately.

```sh
sh packages/cli/lab.sh
```

It builds the page, opens `http://localhost:8777/lab.html`, and keeps
rebuilding whenever a source file changes. Stop it with Ctrl+C. If 8777 is
already in use on your computer, put another number after the command: `sh
packages/cli/lab.sh 9000`.

The page has two modes, and a Polish/English switch.

**Simple** is the default: board size, two sliders (arrow length, line shape),
a backbone switch and the seed — the same choices as the plain command line.
**Advanced** shows every dial from the previous section, with a description of
each and a list of ready-made settings, from Easy 25×25 up to Insane 1000×1000.

Two things the page does that the command line does not. It shows you the exact
command that would reproduce whatever you are looking at, so you can copy it.
And it keeps a library of saved boards, so you can put one aside and come back
to it.

If you set a dial outside its safe range, the offending row turns red, the
reason appears next to it, and the Generate button stops working until you fix
it. The command stays on screen, so you can still copy rejected settings.

---

## Where boards are saved

By default, boards go into `packages/cli/boards/`, sorted into a folder per size:

```
packages/cli/boards/
  25x25/
    seed7-7d303227.svg     the picture
    seed7-7d303227.json    what it was made from
  40x40/
    ...
```

The file name is the seed followed by a short code derived from the settings.
Change a setting and you get a different code, so nothing is overwritten by
accident. (Colours and line thickness are not part of the code, so changing
only those writes to the same file name and replaces the old picture.)

Point it somewhere else with the `ARROWZ_BOARDS_DIR` variable:

```sh
export ARROWZ_BOARDS_DIR=~/arrowz-boards
deno task carve --width=25 --height=25
```

The `.json` file next to each picture holds every setting used, when it was
made, how long it took, and how many arrows it has. It also holds a `command`
line that reproduces the picture exactly, byte for byte. If you keep only one
thing from a board, keep that line.

> Boards are not part of the repository. `packages/cli/boards/` is deliberately
> left out of it, because large boards run to tens of megabytes.

---

## When something goes wrong

**`deno task couldn't find deno.json`** — you are outside the project folder.
`cd` into the `arrowz` folder and try again.

**`Requires env access`** — you ran `deno run packages/cli/carve.ts` directly.
Deno refuses to let a program touch your files or settings unless told to. Use
`deno task carve`, which grants exactly what is needed.

**`unknown flag --pstraight`** — that dial only exists in advanced mode. Add
`--advanced`, and remember that width and height become `--w` and `--h` there.

**`invalid parameters: … is outside …`** — one of your values is out of range.
The message names the setting and the allowed range. Nothing was generated and
nothing was written.

**`failed to close board …`** — the generator tried, backed up, restarted, and
still could not fill the board. Almost always a setting marked **Careful:**
above. Move it back towards its default, or try another seed. The picture is
in `packages/cli/boards/` all the same, uncovered squares tinted pink, so you can
see where it got stuck.

**One board takes forever** — set `CARVE_TIMEOUT_S` to a number of seconds and
the generator stops there, saving whatever it had drawn:

```sh
CARVE_TIMEOUT_S=60 deno task carve --width=1000 --height=1000
```

**The report takes forever** — `deno task carve --advanced` with nothing else
walks every difficulty level up to 1000×1000, three times each. Add
`--only=easy --square --runs=1`. Note that `--only=easy` on its own matches
nothing: it needs `--square` or `--portrait` alongside it.

**The web page shows nothing** — the page needs building first. `sh
packages/cli/lab.sh` does it for you; opening `lab.html` straight from your file
manager does not work.

**Wondering what it is doing** — set `CARVE_TRACE=1` and it reports progress as
it goes:

```sh
CARVE_TRACE=1 deno task carve --width=200 --height=200
```

```
    [trace] pieces 7000, remaining 2516, backtracks 0, 252 ms
```

---

## Word list

| Word used here | What it means |
|---|---|
| **arrow** | One line on the board, from two to several hundred squares long, with a pointed tip at one end. The code and the English web page call it a *piece*; the Polish page calls it an *element*. |
| **tip** | The pointed end of an arrow. It shows which way the arrow travels. The code calls it the *head*. |
| **lane** | The straight strip of squares from an arrow's tip to the edge of the board. If it is clear, the arrow can leave. The code calls it the *corridor*. |
| **free** | An arrow with a clear lane, which can be removed right now. |
| **seed** | A number that decides which board you get. Same seed and settings, same board. |
| **backbone** | A few very long arrows drawn first, crossing the whole board. The code calls them *giants* or the *skeleton*. |
| **layers / tunnels** | Two ways of deciding where the next arrow starts. Layers peel the board from the outside and make it easy; tunnels dig inward and make it hard. |
| **jam** | The generator painting itself into a corner while building, so no legal arrow can be added. |
| **safe range** | The measured limits of each setting. Outside them, boards stop working; the tool refuses rather than let you find out the slow way. |

---

## Where things live

| Path | What it is |
|---|---|
| `packages/engine/engine.ts` | The generator itself. Knows nothing about files or web pages. |
| `packages/cli/carve.ts` | The command-line tool. |
| `packages/cli/lab.html`, `lab-page.ts` | The web page. |
| `packages/*/*.test.ts` | The tests. |
| `packages/engine/HISTORY.md` | The engineering log: every measurement, every dead end, every decision, in detail. |
| `docs/superpowers/specs/` | The design documents, including the full rules of the game. |
| `packages/engine/` | The engine package (`@arrowz/engine`): generator, parameters, command parser, presets, dictionaries. |
| `packages/cli/` | The command-line tool, the board store and the lab page. |

The code under `packages/` started as a throwaway prototype written to settle
what makes a good board. It settled them, so it became the engine the game is
built on; the tag `v1.0.0-alpha.1` marks that point. The game itself, a
reusable board component and a new lab are built next to it in this
repository (see `docs/superpowers/specs/2026-09-09-monorepo-design.md`).
