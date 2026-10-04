# Arrowz

**English** · [Polski](README.pl.md)

Arrowz is a puzzle. You get a rectangle packed with arrows, and you have to
clear it — one arrow at a time, in the right order. This repository holds the
part that makes the puzzles: a **board generator**, plus a command-line tool
and a small application for using it.

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
4. [The command line](#the-command-line)
5. [The lab](#the-lab)
6. [When something goes wrong](#when-something-goes-wrong)
7. [Word list](#word-list)
8. [Where things live](#where-things-live)

---

## The puzzle in one minute

### What you are looking at

A board is a grid of small cells. Every cell is covered by an arrow, and no
cell is left empty. An arrow is a line that walks from cell to cell — only up,
down, left or right, never diagonally, and never across itself. One end of the
line has a pointed tip, the arrowhead. The arrowhead is the front of the arrow,
and it says which way the arrow wants to go.

Here is an eight-by-eight board with each arrow in its own colour, so you can
tell them apart:

<p align="center">
  <img src="docs/images/tiny-colorized.png" alt="A small board with seven arrows in different colours" width="360">
</p>

Seven arrows, seven arrowheads. The green one is bent into a hook, the red one
is bent twice, the purple one is just two cells long. Arrows can be as short as
two cells or as long as several hundred.

Real boards use one colour for everything, because telling the arrows apart by
eye is the whole point of the game:

<p align="center">
  <img src="docs/images/tiny.png" alt="The same small board in a single colour" width="360">
</p>

### The one rule

You tap an arrow. It tries to drive straight out of the board, in the direction
its arrowhead points.

Picture a narrow path starting just in front of the arrowhead and running in a
straight line to the edge of the board. That path to the edge is the only thing
that matters.

**If the path is clear, the arrow drives out and disappears.**

<p align="center">
  <img src="docs/images/rule-free.png" alt="An arrow with a clear path to the edge in front of its arrowhead" width="440">
</p>

The dark blue arrow points right. The dashed path in front of it is empty, so
the arrow leaves the board. The grey arrow further down is irrelevant — it is
not in the path.

**If anything is standing in the path, the move is not allowed.** The arrow
lurches forward, bumps into whatever is in the way, slides back to where it
started, and you lose a life. The bump is deliberate: it shows you what blocked
you.

<p align="center">
  <img src="docs/images/rule-blocked.png" alt="An arrow with another arrow standing in its path to the edge" width="440">
</p>

Here the red arrow is parked across the path, so the blue arrow cannot go
anywhere.

The part that trips everyone up: **the shape of an arrow does not matter, only
its path to the edge.** An arrow bent into a horseshoe with another arrow
sitting inside the bend is still free to leave — that other arrow is not in the
path.

<p align="center">
  <img src="docs/images/rule-shape.png" alt="A horseshoe-shaped arrow with another arrow inside its bend, still free to leave" width="440">
</p>

The blue arrow curls around the grey one, but its path to the edge, the dashed
strip, is clear. Tap it and it goes.

The reason this works is that an arrow travels along its own body. The
arrowhead moves one cell forward, and every cell behind it shuffles up into the
space just vacated. The arrow never crosses a cell it does not already occupy.
That is why its curves and hooks make no difference to whether it can move.

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
| **Nothing is left over** | Every cell belongs to exactly one arrow. No gaps, no overlaps. |
| **No arrow is a single cell** | The shortest arrow is two cells, because a single cell would have no direction to point in. |
| **The board can always be cleared** | Before handing the board over, the generator works out who blocks whom and proves the puzzle has a solution. |
| **It knows at least one solution** | The order in which the generator built the arrows is itself a winning order. |
| **You cannot play yourself into a corner** | Any sequence of legal moves eventually empties the board. |
| **The same request gives the same board** | Ask twice with the same settings and the same seed number, and you get the identical board, down to the last cell. |

One thing it does **not** promise: that every request succeeds. On hard settings
the generator can get stuck while building: it paints itself into a corner. When
that happens, it takes some arrows back and tries again. If that still fails, it
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
deno task carve --width=25 --height=25 --svg
```

The first time you run this, Deno spends a few seconds fetching the two small
helper libraries it needs. After that a 25×25 board takes well under a second.

The board lands in `packages/cli/boards/25x25/` as three files: the board itself
(`.board.json`, the file the game reads), a small text file describing it
(`.json`) and, because of `--svg`, a picture (`.svg`). Open the picture in any
browser.

### Five things to try

Copy any of these. Each one writes a board into `packages/cli/boards/`; add
`--svg` to get a picture of it as well, or `--dry-run` (explained below) to see
the numbers without writing a file. Every flag used here is explained in
[The everyday settings](packages/cli/README.md#the-everyday-settings).

```sh
# small enough to follow every arrow by eye
deno task carve --width=12 --height=12 --colored

# a dense field of tiny arrows
deno task carve --width=40 --height=40 --length=0 --colored

# a few long snakes instead
deno task carve --width=40 --height=40 --length=1 --winding=0 --colored

# a skeleton of very long arrows crossing the whole board
deno task carve --width=80 --height=80 --skeleton --colored

# a tall board, which is harder to play than a square one
deno task carve --width=40 --height=80
```

### Checking that everything works

```sh
deno task test
```

This runs the project's own set of checks, including nine reference boards
that must come out pixel-identical every time. It takes about half a minute.
You do not need to run it to use the tool; it is there if you want to be sure
nothing is broken.

---

## The command line

The commands, every setting they take and where the boards they make are
saved are described in [the command line's own README](packages/cli/README.md).

---

## The lab

There is a small application for playing with the settings and seeing the
result immediately. It draws the board with the board element, which needs Lit:
run `corepack enable pnpm && pnpm install` once at the top of the repository
before the first start. The lab keeps its boards in the store, which is served
by a small Deno program, so one command starts both:

```sh
pnpm nx serve lab      # the lab (8779) and, alongside it, the board store (8777)
```

Open `http://localhost:8779`. Stop it with Ctrl+C, which stops the store too.
To run the store on its own — the CLI writes boards directly and never needs
it — use `deno task store`. The lab expects the store on 8777; if that port is
taken on your computer, both sides have to be told the new number — the store
takes it after the command (`deno task store 9000`), and the lab reads it from
one line in `apps/lab/vite.proxy.ts`. A second `pnpm nx serve lab` does not
start a second store: Nx notices the continuous target is already running and
waits on it, while Vite moves the second lab to the next free port (8780).

The lab has two modes, and a Polish/English switch.

**Simple** is the default: board size, two sliders (arrow length, winding),
a skeleton switch and the seed — the same choices as the plain command line.
**Advanced** shows every knob from the previous section, with a description of
each and a list of ready-made settings, from Easy 25×25 up to Insane 1000×1000.

Two things the lab does that the command line does not. It shows you the exact
command that would reproduce whatever you are looking at, so you can copy it.
And it keeps a library of saved boards, so you can put one aside and come back
to it.

If you set a knob outside its safe range, the offending row turns red, the
reason appears next to it, and the Generate button stops working until you fix
it. The command stays on screen, so you can still copy rejected settings.

---

## When something goes wrong

**`deno task couldn't find deno.json`** — you are outside the project folder.
`cd` into the `arrowz` folder and try again.

**`Requires env access`** — you ran `deno run packages/cli/carve.ts` directly.
Deno refuses to let a program touch your files or settings unless told to. Use
the `carve` task, which grants exactly what is needed.

**`unknown flag --foo`** — the CLI does not recognise that flag at
all. Check the spelling against `--help` or `--help=knobs`.

**`--straight is gone: use --winding=R …`** (or `--advanced`, `--board`,
`--w`/`--h`, `--colorized`, `--lineweight`, `--headwidth`/`--arrowwidth`,
`--headheight`/`--arrowheight`, `--lateral`, `--absorb`, `--headbias`,
`--mix`) — an old spelling from before this tool had one mode. The message
names its replacement; use that instead.

**`invalid arguments: --pstraight=0.2 is outside 0.6..1`** — a value is out of
range, between two of a knob's settings, or breaks one of the rules. Every line
starts with the flag to change, whether the parser caught it or the safe
envelope did, and a broken rule names every flag it is about. Nothing was
generated and nothing was written.

**`failed to close board …`** — the generator tried, backed up, restarted, and
still could not fill the board. Almost always a setting marked **Careful:**
above. Move it back towards its default, or try another seed. The board is in
`packages/cli/boards/` all the same; add `--svg` and the picture shows the
uncovered cells tinted pink, so you can see where it got stuck.

**`failed to close board …: covered, but the rays make a cycle`** — every cell
is filled, and still no tap is ever legal: two arrows point at each other, or a
longer ring of them do. This is a bug in the generator, not a setting you chose
— nothing you can type produces it, because the generator gives each arrow its
path to the edge before anything stands in it. If you ever see the line, the
board is still written to `packages/cli/boards/`; please keep it and report it,
because it is the board that should not exist.

**One board takes forever** — set `CARVE_TIMEOUT_S` to a number of seconds and
the generator stops there, saving whatever it had drawn:

```sh
CARVE_TIMEOUT_S=60 deno task carve --width=1000 --height=1000
```

**The report takes forever** — `deno task report` with nothing else walks
every difficulty level up to 1000×1000, three times each. Add `--only=easy
--square --runs=1`. Note that `--only=easy` on its own matches nothing: it
needs `--square` or `--portrait` alongside it.

**The lab shows nothing** — the lab is served, not opened: it needs `pnpm nx
serve lab` running, and lives at `http://localhost:8779`. That command also
starts the store, but the store stays optional — a lab served some other way
(a static host, say) still runs without one. If the board library is empty or
refuses to save, the other half is missing: start `deno task store` beside it.

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
| **arrow** | One line on the board, from two to several hundred cells long, with an arrowhead at one end. The code calls it a *piece*. |
| **arrowhead** | The pointed end of an arrow, also called its tip. It shows which way the arrow travels. The code calls it the *head*. |
| **path to edge** | The straight strip of cells from an arrowhead to the edge of the board. If it is clear, the arrow can leave. The code calls it the *corridor*. |
| **free** | An arrow with a clear path to the edge, which can be removed right now. |
| **seed** | A number that decides which board you get. Same seed and settings, same board. |
| **skeleton** | A few very long arrows laid first, snaking across the whole board. The code calls them *giants*. |
| **layers / tunnels** | Two ways of deciding where the next arrow starts. Layers peel the board from the outside and make it easy; tunnels dig inward and make it hard. |
| **stuck** | The generator has painted itself into a corner while building, so no legal arrow can be added. It takes some arrows back, or starts over. |
| **complete** | A board where every cell is covered by an arrow. A board that is not complete is still saved, marked `"ok": false`. |
| **trap** | An arrow blocked by exactly one other, so it looks free when it is not. `--trapbias` asks for more or fewer of them. |
| **target length** | The length some arrows are drawn around instead of the usual short, medium and long mix. The code calls it the *probe*. |
| **safe range** | The measured limits of each setting. Outside them, boards stop working; the tool refuses rather than let you find out the slow way. |

---

## Where things live

| Path | What it is |
|---|---|
| `packages/engine/engine.ts` | The generator itself. Knows nothing about files or web pages. |
| `packages/cli/carve.ts` | The command-line tool. |
| `packages/*/*.test.ts` | The tests. |
| `docs/images/manifest.json` | The command behind every picture on this page; `deno task docs` draws them all again. |
| `packages/engine/HISTORY.md` | The engineering log: every measurement, every dead end, every decision, in detail. |
| `docs/superpowers/specs/` | The design documents, including the full rules of the game. |
| `packages/engine/` | The engine package (`@arrowz/engine`): generator, parameters, command parser, presets, dictionaries. |
| `packages/cli/` | The command-line tool and the board store. |
| `apps/lab/` | The lab: a React application served by Vite. |

Opening the repository in Claude Code runs `jbcontext index --silent` through the hooks in
`.claude/settings.json` (at the start and end of a session), and `.mcp.json`
starts `jbcontext mcp`. Both run a program installed on your machine, so read
them before you trust the folder.

The code under `packages/` started as a throwaway prototype written to settle
what makes a good board. It settled that, so it became the engine the game is
built on; the tag `v1.0.0-alpha.1` marks that point. The game itself, a
reusable board component and a new lab are built next to it in this
repository (see `docs/superpowers/specs/2026-09-09-monorepo-design.md`).
