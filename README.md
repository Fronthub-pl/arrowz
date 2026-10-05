# Arrowz

Arrowz is a puzzle. You get a rectangle packed with arrows, and you have to
clear it — one arrow at a time, in the right order. This repository holds the
part that makes the puzzles, a **board generator**, and the tools around it: a
command line that carves boards, a web component that draws and plays them,
and a lab for exploring the generator's settings.

<p align="center">
  <img src="docs/images/hero.png" alt="A 40 by 40 Arrowz board" width="560">
</p>

> **Status: alpha.** The generator is done; the tag `v1.0.0-alpha.1` marks it.
> The playable game — tapping, lives, score — is designed but not built yet.

## Contents

- [The puzzle](#the-puzzle)
- [What the generator promises](#what-the-generator-promises)
- [Quick start](#quick-start)
- [What is in this repository](#what-is-in-this-repository)
- [Words](#words)
- [Contributing](#contributing)
- [Licence](#licence)

## The puzzle

A board is a grid of cells, every one of them covered by an arrow. An arrow is
a line that walks from cell to cell — up, down, left or right, never across
itself — with an arrowhead at one end that says which way it wants to go.
Arrows run from two cells to several hundred. Here is an eight-by-eight board
with each arrow in its own colour; a real board uses one colour, because
telling the arrows apart by eye is the game.

<p align="center">
  <img src="docs/images/tiny-colorized.png" alt="A small board with seven arrows in different colours" width="360">
</p>

### The one rule

You tap an arrow, and it tries to drive straight off the board in the direction
its arrowhead points. Only the **path to the edge** matters: the straight strip
of cells from the arrowhead to the edge of the board.

**If the path is clear, the arrow leaves.** If anything stands in it, the arrow
bumps into it, slides back, and you lose a life.

<p align="center">
  <img src="docs/images/rule-free.png" alt="An arrow with a clear path to the edge in front of its arrowhead" width="300">
  <img src="docs/images/rule-blocked.png" alt="An arrow with another arrow standing in its path to the edge" width="300">
</p>

The shape of an arrow does not matter: it travels along its own body, every
cell shuffling up into the one in front, so a horseshoe with another arrow
inside its bend is still free when its path is clear.

<p align="center">
  <img src="docs/images/rule-shape.png" alt="A horseshoe-shaped arrow with another arrow inside its bend, still free to leave" width="300">
</p>

You win when the board is empty and lose when you run out of lives. You can
never get stuck: while arrows remain, at least one is free, so the difficulty
is entirely in _seeing_ which.

## What the generator promises

Every board it hands back has been checked: every cell belongs to exactly one
arrow, the board can be cleared and no sequence of legal moves can trap you,
and the same settings with the same seed give the same board, down to the last
cell. On hard settings a request can fail; the generator then says so instead
of handing over a broken board. The full list is in
[the engine's README](packages/engine/README.md#what-the-generator-promises).

## Quick start

You need **[Deno](https://deno.com/) 2.9 or newer**, and nothing else for the
command line:

```sh
curl -fsSL https://deno.land/install.sh | sh     # macOS and Linux
irm https://deno.land/install.ps1 | iex          # Windows (PowerShell)
```

Get the code and make a first board, from inside the `arrowz` folder:

```sh
git clone https://github.com/Fronthub-pl/arrowz.git
cd arrowz
deno task carve --width=25 --height=25 --svg
```

The board lands in `packages/cli/boards/25x25/`: the board file the game reads
(`.board.json`), a note on how it was made (`.json`) and, because of `--svg`, a
picture to open in a browser. [The command line's README](packages/cli/README.md)
has every setting, five boards worth trying, and what to do when something
goes wrong.

The lab and the board element also need Node.js with pnpm, which comes through
corepack:

```sh
corepack enable pnpm && pnpm install   # once
pnpm nx serve lab                      # the lab on http://localhost:8779
```

## What is in this repository

| Path | What it is |
|---|---|
| [`packages/engine/`](packages/engine/README.md) | `@arrowz/engine`: the generator, its parameters and safe limits, the board file, the game rules and the SVG export. Runs in Deno, Node and the browser. |
| [`packages/cli/`](packages/cli/README.md) | The command line: `deno task carve` makes boards, `deno task report` measures the generator, `deno task store` serves saved boards. |
| [`packages/board-element/`](packages/board-element/README.md) | `<arrowz-board>`: a web component that draws a board on the GPU and plays it, usable from plain HTML or any framework. |
| [`apps/lab/`](apps/lab/README.md) | The lab: a React application for trying settings, with the board, its measurements, the reproducing command and a library of saved boards. |
| [`packages/engine/HISTORY.md`](packages/engine/HISTORY.md) | The engineering log: every measurement, dead end and decision behind the generator. |
| `docs/superpowers/specs/` | The design documents, including the full rules of the game. |
| `docs/images/` | The pictures of these READMEs; `manifest.json` holds the command behind each, and `deno task docs` draws them again. |

The code under `packages/` started as a throwaway prototype written to settle
what makes a good board. It settled that, so it became the engine the game is
built on; the game itself is built next to it in this repository (see
`docs/superpowers/specs/2026-09-09-monorepo-design.md`).

## Words

| Word | What it means |
|---|---|
| **arrow** | One line on the board, from two to several hundred cells long, with an arrowhead at one end. The code calls it a _piece_. |
| **arrowhead** | The pointed end of an arrow. It shows which way the arrow travels. The code calls it the _head_. |
| **path to edge** | The straight strip of cells from an arrowhead to the edge of the board. If it is clear, the arrow can leave. The code calls it the _corridor_. |
| **free** | An arrow with a clear path to the edge, which can be removed right now. |
| **seed** | A number that decides which board you get. Same seed and settings, same board. |

The generator's own words — skeleton, layers and tunnels, trap, safe range —
are in [the command line's README](packages/cli/README.md#words).

## Contributing

Everything in the repository is in English, and changes reach `main` through
pull requests. Before one, run the checks:

```sh
deno task verify                  # the Deno packages: check, lint, format, test
pnpm nx run-many -t verify        # everything, the lab and the board element included
```

The Deno tests include reference boards that must come out identical every
time, and each package README is compared with its code by a test, so a README
that drifts from the code fails the checks. The repository's rules for code
and comments are in [CLAUDE.md](CLAUDE.md).

Opening the repository in Claude Code runs `jbcontext index --silent` through
the hooks in `.claude/settings.json` (at the start and end of a session), and
`.mcp.json` starts `jbcontext mcp`. Both run a program installed on your
machine, so read them before you trust the folder.

## Licence

[MIT](LICENSE).
