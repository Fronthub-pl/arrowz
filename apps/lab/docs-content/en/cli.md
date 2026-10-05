# The command line

The command line makes boards. `deno task carve` lays a board and saves it, `deno task report` measures the generator over many boards, and `deno task compile` builds the command as one program that runs on its own. Every command on this page runs from the repository's root folder.

The boards on this page are made in your browser, by the generator the command runs, from the command printed under each one. **Open in lab** opens that command in the lab.

## Getting started {#start}

The command line needs [Deno](https://deno.com/) 2.9 or newer, and nothing else:

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

The board lands in `packages/cli/boards/25x25/`: the board file a game reads (`.board.json`), a note on how it was made (`.json`) and, because of `--svg`, a picture to open in a browser.

## Making boards {#making}

Everything runs through the `carve` task. The everyday flags and the knobs stand side by side on one command line, and no flag changes what another one means. The command prints its own instructions; both forms are at the end of this page, under [What `--help` prints](docs:cli#help).

```sh
deno task carve --help          # the short form: everyday flags, output, picture (-h too)
deno task carve --help=knobs    # the full table: every knob, its range and default
```

### A board

```sh
deno task carve --width=40 --height=40 --seed=7
```

This writes two files into `packages/cli/boards/40x40/`, both named `sha256-…` after the arrows on the board:

- `….board.json` — the board: every arrow, cell by cell, packed small. This is the file a game loads.
- `….json` — a small text file recording how the board was made.

The name comes from the arrows, not from the settings. Another seed, or other settings that happen to lay the very same arrows, land in the same files, and the small file lists every command that made them. So "has this board been made before?" is the same question as "is its file there?".

### A picture as well

```sh
deno task carve --width=40 --height=40 --svg
deno task carve --width=40 --height=40 --svg=my-board.svg
```

`--svg` adds a picture, `….svg`, next to the board file. `--svg=my-board.svg` does the same and also drops a copy at `my-board.svg`.

### Five things to try

Copy any of these. Each one saves a board into `packages/cli/boards/`; add `--svg` to get a picture as well, or `--dry-run` to see the numbers without writing a file. Every flag here is explained under [Everyday settings](docs:cli#everyday).

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

### Many boards at once

```sh
deno task carve --width=100 --height=200 --seed=1 --count=50
```

This makes 50 different boards, on the seeds 1, 2, 3 and so on. A seed whose board is not complete is skipped and not saved, and so is a seed that lays a board already in the store — its command is added to that board's file instead — and the next seed is tried, until there are 50. After twice as many seeds as boards it gives up; `--max-seeds=200` moves that limit. The last line says how many boards were written, which seeds were skipped, and why. The same command always makes the same boards.

### Describing a board without saving it

```sh
deno task carve --width=30 --height=30 --seed=7 --dry-run
```

This builds the board, writes nothing, and prints one line describing it, in a format meant for programs rather than people. Trimmed to the interesting parts:

```json
{
  "W": 30,
  "H": 30,
  "seed": 7,
  "ok": true,
  "pieces": 87,
  "avgLen": 10.34,
  "maxLen": 44,
  "solvable": true,
  "genMs": 11,
  "pinned": [],
  "command": "deno task carve --width=30 --height=30 --seed=7"
}
```

Read it as: `ok` says the board is complete, `pieces` is how many arrows it holds, `avgLen` and `maxLen` are the average and the longest arrow in cells, `solvable` says the puzzle has a solution, and `genMs` is how many milliseconds it took. `command` makes the same board again. `pinned` lists the knobs you named yourself — none here; see [Every knob](docs:cli#knobs). Here is that board, measured just now:

::board[The board this command describes]{cmd="--width=30 --height=30 --seed=7" stats="pieces avgLen longest time"}

This is the fastest way to try a setting: you see how many arrows you get and how long it took, without a single file on disk.

### A board that is not complete

Rarely, at large sizes, the generator gives up before every cell is covered. The board is saved all the same, the description says `"ok": false`, and the command ends with status code 1, so that a script notices. Add `--svg` and the picture shows the uncovered cells tinted pink. A run that takes too long can be cut short:

```sh
CARVE_TIMEOUT_S=60 deno task carve --width=1000 --height=1000
```

That stops after a minute and saves whatever was laid by then, marked `"aborted": true`.

### The measurements report

```sh
deno task report --only=easy --square --runs=1
```

`deno task report` builds boards at chosen sizes and prints a page of measurements about them. It is a tool for tuning the generator; you do not need it to make boards. For each level it prints a block like this:

```text
--- Easy 25x25 (1 runs) ---
  coverage      100.00%   solvable: YES
  pieces        72   length 2..42
  length dist.  2-6: 63%  7-15: 22%  16-49: 15%  50+: 0.0%
  ...
  time          generation 22 ms, metrics 2 ms
```

The two lines worth knowing: `coverage 100.00%` means no cell was left uncovered, and `solvable: YES` means the puzzle can be finished.

With no `--only` it walks through every difficulty level in turn, up to 1000×1000, which takes a long time. It takes the knobs `carve` takes, and these flags of its own:

| Flag          | What it does                                                                           |
| ------------- | -------------------------------------------------------------------------------------- |
| `--only=NAME` | one level only, by its name as the report prints it (`easy·sq`, `hard·pt`, …)          |
| `--square`    | square boards only; `easy` then names the square one                                   |
| `--portrait`  | portrait boards, twice as tall as wide, only                                           |
| `--mid=N`     | adds an N×N level between the fixed ones, for finding where boards stop being complete |
| `--runs=N`    | boards per level, 3 by default                                                         |
| `--show`      | prints, as text, the first board of each level at most 40 cells wide                   |
| `--bench=N`   | measures speed instead: N runs per level, with timing statistics                       |

### Asking for something impossible

The generator refuses settings it knows will not work before it starts, not after ten minutes of trying:

```sh
deno task carve --width=30 --height=30 --pstraight=0.2 --svg=/tmp/x.svg
```

```text
invalid arguments:
  - --pstraight=0.2 is outside 0.6..1
see --help
```

The command ends with status code 2. A status code is the number a program leaves behind when it finishes, and scripts read it to learn how things went: 0 means everything went fine, 1 that the generator gave up, and 2 that you asked for something out of range.

## Everyday settings {#everyday}

The everyday flags are the ones you reach for first: the size, the seed, and four that change the puzzle. The picture flags after them change nothing about the puzzle, only how it is drawn.

### Size — `--width` and `--height`

How many cells across and down. Both are required, each anything from 4 to 1000. A 400×400 board is ready in under two seconds; 1000×1000 takes about ten. A tall board is harder to play than a square one with the same number of cells, because arrows have further to travel.

:::compare
::board[`--width=20 --height=40`]{cmd="--width=20 --height=40 --seed=7"}
::board[`--width=100 --height=100`]{cmd="--width=100 --height=100 --seed=7"}
:::

### How big a board can get

The ceiling is 1000×1000, a million cells. Past about two hundred cells a side the arrows stop being visible one by one at this size, and the board turns into fabric. Zoom into one — ⌘ or Ctrl with the wheel, or the buttons in its corner — and the puzzle is the same as on a small board. The million-cell board takes about ten seconds, so it waits for its button.

:::compare{stats="pieces avgLen longest time"}
::board[200×200]{cmd="--width=200 --height=200 --seed=7"}
::board[500×500]{cmd="--width=500 --height=500 --seed=7"}
::board[1000×1000]{cmd="--width=1000 --height=1000 --seed=7" manual about="10"}
:::

The average arrow barely grows with the board, so a bigger board buys you more arrows rather than longer ones. The single longest arrow does grow.

### Seed — `--seed`

A number from 0 to 4294967295 that picks which board you get. With everything else unchanged, the same seed always gives the same board, and a different seed a different board of the same character. Default: 7.

:::compare
::board[`--seed=7`]{cmd="--width=20 --height=20 --seed=7"}
::board[`--seed=42`]{cmd="--width=20 --height=20 --seed=42"}
:::

### Arrow length — `--length`

A value from 0 to 1. Default: `0.75`. Turn it **down** and the board fills with short arrows: many of them, each with its own arrowhead, packed together like a field of little hooks. Turn it **up** and the board is made of a few long snakes, their arrowheads few and far between. On a 30×30 board with seed 7:

:::compare{stats="pieces avgLen"}
::board[`--length=0`]{cmd="--width=30 --height=30 --seed=7 --length=0 --colored"}
::board[default (`0.75`)]{cmd="--width=30 --height=30 --seed=7 --colored"}
::board[`--length=1`]{cmd="--width=30 --height=30 --seed=7 --length=1 --colored"}
:::

More arrows is not automatically harder; it is a different kind of hard. Short arrows give you many things to look at; long arrows give you fewer, but each one reaches further and blocks more.

### Winding — `--winding`

A value from 0 to 1. Default: `0.5`. It sets how eagerly an arrow keeps going straight instead of turning: `0` is the straightest a board gets, `1` the most winding. Turn it **down** and arrows run in long straight strokes; turn it **up** and they wriggle, turning every few cells and worming into small nooks.

:::compare{stats="pieces bends"}
::board[`--winding=0`]{cmd="--width=30 --height=30 --seed=7 --winding=0 --colored"}
::board[default (`0.5`)]{cmd="--width=30 --height=30 --seed=7 --colored"}
::board[`--winding=1`]{cmd="--width=30 --height=30 --seed=7 --winding=1 --colored"}
:::

Pushing it to either end gives _fewer_ arrows than the middle: straight arrows run further before they stop, and winding arrows take more cells each while they fill the corners. The busiest boards are the ones in between.

### Skeleton — `--skeleton`

An on/off switch, off by default. Switched on, the generator first lays a handful of very long arrows, the skeleton, snaking back and forth across the whole board, then fills the channels between them with ordinary arrows. It is the only way to get really long arrows: left to itself, the generator rarely makes one that crosses the whole board.

:::compare{stats="pieces longest"}
::board[without]{cmd="--width=60 --height=60 --seed=7 --colored"}
::board[`--skeleton`]{cmd="--width=60 --height=60 --seed=7 --skeleton --colored"}
:::

### Fresh luck every time — `--randomized`

Normally a value of `--length` or `--winding` means one exact set of knobs. With `--randomized` each value stands for a range, and the generator draws a fresh set from inside it on every run, so the same seed gives a different board every time: the extra roll of the dice is not decided by the seed. Nothing is lost. The settings actually drawn are written into the board's file as a full command, so any board you like can be made again exactly.

```sh
deno task carve --width=40 --height=40 --randomized
```

Naming a knob beside `--randomized` pins that one knob and leaves the rest still drawn; see [Every knob](docs:cli#knobs).

### How the picture is drawn

These flags change nothing about the puzzle, only how it looks. The boards on this page draw them as the command line does, apart from `--cell`: a board here fits its frame and zooms.

**`--colored`** gives every arrow its own colour: no help for playing, a great help for understanding. The comparisons on this page use it.

:::compare
::board[normal]{cmd="--width=20 --height=20 --seed=7"}
::board[`--colored`]{cmd="--width=20 --height=20 --seed=7 --colored"}
:::

**`--line`** is how thick the lines are, as a share of one cell. Default `0.5`: a line fills half its cell.

:::compare
::board[`--line=0.2`]{cmd="--width=20 --height=20 --seed=7 --line=0.2"}
::board[`--line=0.9`]{cmd="--width=20 --height=20 --seed=7 --line=0.9"}
:::

Look at the arrowheads. On a thin line the arrowhead is a proper triangle, wider than the line. Once the line gets thick there is no room for a wider triangle, so the arrowhead becomes a sharpened point.

**`--arrow-width`** and **`--arrow-height`** size the arrowheads by hand, in cells, and they behave differently. `--arrow-width` defaults to `auto`, worked out from the line's thickness; a number is a width in cells. `--arrow-height` has no automatic mode: it is always taken as written, and defaults to `1`, one whole cell. `--arrow-height=0` gives an arrowhead of no height at all.

:::compare
::board[`--arrow-width=0.6 --arrow-height=0.6`]{cmd="--width=20 --height=20 --seed=7 --arrow-width=0.6 --arrow-height=0.6"}
::board[`--arrow-width=0.9 --arrow-height=1.2`]{cmd="--width=20 --height=20 --seed=7 --arrow-width=0.9 --arrow-height=1.2"}
:::

**`--sharp`** takes the rounding off: a line turns its corners at an angle instead of in a curve, and its blunt end is square instead of a rounded cap.

**`--theme`** paints the board in one of the lab's twelve colour themes (`--theme=gruvbox-dark`, `--theme=catppuccin-latte`, …); an unknown name is refused with the list. **`--paper`**, **`--ink`** and **`--highlight-color`** each set one colour as `#rrggbb` — the background, the arrows, and the arrows `--top` marks — and win over the theme's. **`--palette`** gives the arrow colours for `--colored`, up to eight, separated by commas.

**`--pad`** is the margin around the board, in cells, from 0 to 16 (default 4, as the lab draws it). **`--points`** puts a dot in the middle of every cell, the lab's dot grid; **`--point-color`** and **`--point-radius`** (in cells, up to 0.5) change the dot.

**`--cell`** is the size of one cell in the picture, in pixels, from 1 to 200; left out, it is 1600 divided by the longer side, but never more than 18. **`--top`** marks the N longest arrows (up to 1000) in the highlight colour and prints their measurements under the summary.

The lab's live command carries all of these, so copying it makes the picture the lab exports.

## Every knob {#knobs}

The everyday flags are shortcuts. Behind each of them sit several knobs, and you can set any knob directly, on the same command line as the everyday flags. Turning `--length` down, for instance, really means "raise the share of short arrows and lower the share of medium ones": two knobs at once.

You do not need this section to use the command line. It is here because "what does this knob actually do?" deserves an answer.

```sh
deno task carve --width=40 --height=40 --seed=7 --pstraight=0.95 --svg
```

Name a knob, and it takes over from whichever everyday flag would otherwise have set it.

### When a knob meets an everyday flag

An everyday flag does not set one knob; it sets a whole bundle of them:

| Everyday flag                       | Knobs it sets                                               |
| ----------------------------------- | ----------------------------------------------------------- |
| `--length`                          | `wshort`, `wmid`                                            |
| `--winding`                         | `pstraight`, `wlateral`, `warns`, `anticoil`                |
| `--skeleton`                        | `giants`, `giantspan`, `giantstep`, `giantjitter`, `wgiant` |
| _(always: the difficulty baseline)_ | half of `--start`, `probe`, `probelen`                      |

`--start` is a small case of the same rule: it sets the baseline half above, plus the mix of layers and tunnels that nothing else sets. Ten knobs belong to no bundle, so naming one of them was never ambiguous: `lmax`, `backbite`, `trapbias`, `giantstraight`, `giantanticoil`, `giantspacing`, `headtries`, `absorblimit`, `maxback`, `restarts`.

**A knob written on the command line wins, and pins only itself.** Without `--randomized`, an everyday flag picks one value for each knob in its bundle; a knob you name replaces that one value and leaves the rest of the bundle as the everyday flag set it. With `--randomized`, the everyday flags draw their bundles from the measured safe ranges on every run; a knob you name is pinned instead of drawn, and the rest of its bundle keeps being drawn around it, seed after seed.

The command line says so when it happens, once per run, on stderr, and adds the same fact to the `--dry-run` line, so a script can see it without reading stderr:

```sh
deno task carve --width=30 --height=30 --randomized --winding=0.5 --pstraight=0.9 --dry-run
```

```text
note: --pstraight=0.9 is pinned; --winding still sets wLateral, anticoil, warns
```

```json
{ "...": "...", "pinned": ["pStraight"], "...": "..." }
```

A pin can also name a knob that changes nothing under the rest of your settings: a skeleton knob without a skeleton, or the target length while the target share is 0. The lab dims such a row; the command line says it on a line of its own, in the same words:

```sh
deno task carve --width=30 --height=30 --probelen=30 --dry-run
```

```text
note: --probelen=30 is pinned; the difficulty baseline still sets headBias, probe
note: --probelen=30 has no effect here: no arrow gets a target length while target share is 0
```

That second line is left out of a `--count` batch drawn with `--randomized`: there every board gets knobs of its own, drawn afresh rather than from the seed, so one note for the whole run could not speak for all of them.

When the draw has to move a value of its own to keep a rule, it says which one and where it went. Naming a share bigger than what is left under the cap makes the everyday flag's share give way:

```sh
deno task carve --width=30 --height=30 --length=0 --wmid=0.5 --dry-run
```

```text
note: --wmid=0.5 is pinned; --length still sets wShort
note: --wshort moved from 0.75 to 0.4: short and medium shares add up to more than 0.9 (90%); at least a tenth of the arrows must stay long
```

What pinning costs: the safe ranges in the table below were measured as whole bundles, so a half-pinned bundle stays inside them but is no longer covered by the promise that _every_ everyday combination fills its board. The ranges still have the last word: a pinned value outside its own range, or a combination that breaks a rule, is refused exactly as it would be otherwise.

### The knobs

All of them, grouped as `deno task carve --help=knobs` groups them. **Step** is the distance between the values a knob takes: a value between two steps is refused, as one outside the range is, because neither the lab's slider nor a printed command could reach it again. The table comes from the command line's own code, so it says what the command takes.

::table{of="knobs"}

### What some of them look like

Four knobs side by side, each on a 30×30 board with seed 7. Three of them change the picture; the fourth changes something you cannot see.

**`--warns` — filling awkward corners first**

:::compare{stats="pieces bends"}
::board[`--warns=2`]{cmd="--width=30 --height=30 --seed=7 --warns=2 --colored"}
::board[`--warns=16`]{cmd="--width=30 --height=30 --seed=7 --warns=16 --colored"}
:::

**`--wlateral` — turning sideways instead of pushing on**

:::compare{stats="pieces avgLen"}
::board[`--wlateral=0`]{cmd="--width=30 --height=30 --seed=7 --wlateral=0 --colored"}
::board[`--wlateral=20`]{cmd="--width=30 --height=30 --seed=7 --wlateral=20 --colored"}
:::

**`--probe` — one target length for every arrow**

:::compare{stats="pieces longest"}
::board[`--probe=1 --probelen=4`]{cmd="--width=30 --height=30 --seed=7 --probe=1 --probelen=4 --colored"}
::board[`--probe=1 --probelen=200`]{cmd="--width=30 --height=30 --seed=7 --probe=1 --probelen=200 --colored"}
:::

**`--start` — the knob you cannot see**

:::compare{stats="pieces f0"}
::board[`--start=layers`]{cmd="--width=30 --height=30 --seed=7 --start=layers --colored"}
::board[`--start=tunnels`]{cmd="--width=30 --height=30 --seed=7 --start=tunnels --colored"}
:::

The two `--start` boards look much alike, and that is the point: this knob barely touches the drawing. What it changes is how many arrows are free at any moment, and that is what makes a board easy or hard. The default, `--start=random`, sits between the two. A number from 0.3 to 0.7 mixes `layers` and `tunnels` instead of choosing one: it is the share of arrows that start as tunnels.

### Combinations that are refused

Some rules cannot be written as a range from one value to another, so they are checked on their own:

::table{of="rules"}

Break a rule, put a knob outside its range, or land between two of its steps, and the generator refuses before laying anything, tells you which value was wrong, and ends with status code 2. It never quietly rounds your number into range: `--maxback=75` is refused rather than nudged to 50 or 100, because a value no slider and no printed command can reach would make the board impossible to make again.

The everyday flags cannot break these rules: every value of every everyday flag, at every board size, gives a valid combination, as long as you leave the knobs in its bundle to the everyday flag. What pinning one of them costs is said above.

## Where boards are saved {#saved}

By default boards go into `packages/cli/boards/`, in a folder per size:

```text
packages/cli/boards/
  25x25/
    sha256-0dc74eef….board.json   the board
    sha256-0dc74eef….json         what it was made from
    sha256-0dc74eef….svg          the picture, only with --svg
  40x40/
    ...
```

The file name comes from the arrows on the board. The same arrows from another seed or other settings share one set of files, and the `.json` file lists every command that made them. Colours and line thickness are not part of the name, so changing only those writes to the same name and replaces the picture.

Point it somewhere else with the `ARROWZ_BOARDS_DIR` variable:

```sh
export ARROWZ_BOARDS_DIR=~/arrowz-boards
deno task carve --width=25 --height=25
```

The `.json` file next to each board holds every setting used, when the board was made, how long it took and how many arrows it has. It also holds a `command` line that makes the same board again, exactly. If you keep one thing from a board, keep that line.

> Boards are not part of the repository: `packages/cli/boards/` is left out of it on purpose. A 1000×1000 board file is about a megabyte, and its picture tens of megabytes.

## Environment variables {#env}

`carve` and `report` read these variables, and nothing else from the environment:

::table{of="env"}

## A standalone program {#standalone}

If you would rather have one file you can run without calling Deno each time:

```sh
deno task compile
```

That writes a self-contained program to `packages/cli/dist/carve`. It takes exactly the options the `carve` task takes, and is shorter to type:

```sh
./packages/cli/dist/carve --width=25 --height=25 --dry-run
```

One catch. The standalone program does not know where the repository is, so it cannot work out where to save boards. Before asking it to save anything, tell it where to put them:

```sh
export ARROWZ_BOARDS_DIR=~/arrowz-boards
./packages/cli/dist/carve --width=25 --height=25
```

Without that, saving fails with an error about a directory it cannot create. Describing a board rather than saving it (`--dry-run`) works either way.

## When something goes wrong {#trouble}

**`deno task` says it could not find `deno.json`** — you are outside the project folder. `cd` into the `arrowz` folder and try again.

**`Requires env access`** — you ran `deno run packages/cli/carve.ts` directly. Deno does not let a program read your files or settings unless it is told to. Use the `carve` task, which grants exactly what it needs.

**`unknown flag …`** — the command does not know that flag at all. Check the spelling against `--help` or `--help=knobs`.

**`--straight is gone: use --winding=R …`** (or `--advanced`, `--board`, `--w`/`--h`, `--colorized`, `--lineweight`, `--headwidth`/`--arrowwidth`, `--headheight`/`--arrowheight`, `--lateral`, `--absorb`, `--headbias`, `--mix`) — an old spelling. The message names the flag that replaced it; use that instead.

**`invalid arguments: --pstraight=0.2 is outside 0.6..1`** — a value is out of range, between two of a knob's steps, or breaks a rule. Every line starts with the flag to change, and a broken rule names every flag it is about. Nothing was generated and nothing was written.

**`failed to close board …`** — the generator tried, took arrows back, started over, and still could not fill the board. Almost always a knob pushed far from its default is to blame; [the knob table](docs:cli#knobs) says what each one does. Move it back towards its default, or try another seed. The board is in `packages/cli/boards/` all the same; add `--svg` and the picture shows the uncovered cells tinted pink, so you can see where it got stuck.

**`failed to close board …: covered, but the rays make a cycle`** — every cell is covered, and still no arrow can ever leave: two arrows point at each other, or a longer ring of them does. This is a bug in the generator, not a setting you chose. Nothing you can type makes it, because the generator gives every arrow its path to the edge before anything stands in it. If you ever see this line, the board is still saved to `packages/cli/boards/`; please keep it and report it, because it is the board that should not exist.

**One board takes forever** — set `CARVE_TIMEOUT_S` to a number of seconds, and the generator stops there and saves what it had laid:

```sh
CARVE_TIMEOUT_S=60 deno task carve --width=1000 --height=1000
```

**The report takes forever** — `deno task report` with nothing else walks every difficulty level up to 1000×1000, three times each. Add `--only=easy --square --runs=1`. `--only=easy` on its own matches nothing: it needs `--square` or `--portrait` beside it.

**Wondering what it is doing** — set `CARVE_TRACE=1`, and it reports its progress as it goes:

```sh
CARVE_TRACE=1 deno task carve --width=200 --height=200
```

```text
    [trace] pieces 7000, remaining 2516, backtracks 0, 252 ms
```

## Words {#words}

The words of the puzzle itself — arrow, arrowhead, path to the edge, free, seed — are on the [puzzle's page](docs:arrowz#words). These belong to the generator:

- **skeleton** — a few very long arrows laid first, snaking across the whole board. In the code: `giants`.
- **layers / tunnels** — two ways of choosing where the next arrow starts. Layers peel the board from the outside and make it easy; tunnels dig inward and make it hard.
- **stuck** — the generator has painted itself into a corner while building, so no arrow can be added. It takes some arrows back, or starts over.
- **complete** — a board where every cell is covered by an arrow. A board that is not complete is still saved, marked `"ok": false`.
- **trap** — an arrow blocked by exactly one other, so it looks free when it is not. `--trapbias` asks for more or fewer of them.
- **target length** — the length some arrows are drawn around, instead of the usual mix of short, medium and long. In the code: `probe`.
- **safe range** — the measured limits of each setting. Outside them boards stop working, and the command refuses rather than let you find out the slow way.

## What `--help` prints {#help}

The command's own help, both forms, printed by the function the terminal calls, so the two cannot disagree. It stays in English, as the terminal prints it.

### `--help`

::help{form="short"}

### `--help=knobs`

::help{form="knobs"}
