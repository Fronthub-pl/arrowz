# The lab

The lab is where boards are made. You pick the settings, the lab generates a board, and you see three things at once: the board, its measurements, and the command line that makes the same board again. It has three tabs, **Lab**, **Saved boards** and **Docs**, and every screen has its own address, so the browser's back button and a bookmark work.

## The board store {#store}

Saved boards live in the board store: a small program that keeps them on disk, in the directory the command line writes to. A board you save in the lab is there for the command line, and a board the command line makes shows up under **Saved boards**.

The store starts together with the lab. If **Saved boards** is empty or a save is refused, the store is not running: start it beside the lab with `deno task store`. Everything else in the lab works without it.

## Simple and advanced {#views}

**Simple** is where the lab opens: the board size, two sliders (arrow length and winding), a skeleton switch and the seed. These are the same choices the plain command line offers. Below them are the preview settings: line thickness, arrowhead size, colours and theme.

**Advanced** shows every setting of the generator, in groups, each with its help, and a list of presets from Easy 25×25 up to Insane 1000×1000. The switch between the two views is in the top bar, beside the language.

In either view the lab shows the exact command that makes the board on screen, ready to copy. The command stays on screen even when the settings are refused, so you can still copy them.

## When a setting breaks a rule {#rules}

Every setting has a safe range, and some combinations are known to leave the generator stuck. A setting outside its range, or such a combination, turns its rows red with the reason beside them. Its group is marked in the list, and every broken rule is listed at the bottom of the screen. The lab does not generate until you fix it.

The ranges and the rules between settings are listed on [the command line's page](docs:cli#knobs).

## Generating and saving {#generating}

**Generate** (`G`) makes a board from the settings on screen. **New seed** draws a random seed and generates; `[` and `]` step the seed back or forward by one instead. **Defaults** puts every setting back and generates. **Abort** stops a run and keeps the board made so far.

A board is not kept until you use **Save board** (`⌘S`) or **Generate and save** (`⌘G`). With the switch _save every board_ on, every finished run is saved.

In the advanced view, _generate right after a change_ starts a run whenever a setting moves, and **Check seeds** runs the current settings over a number of seeds and reports how many of the boards came out complete.

**Download SVG** and **Download board file** export the board on screen.

## The report {#report}

The report drawer on the right (`R`) lists the run's measurements: the arrows and their lengths, how hard the board plays, how far arrows reach, and their shape. Each has a `?` that explains it, and each change is coloured against the previous board.

The settings drawer on the left comes and goes with `S`. `F` hides both and gives the board the whole lab panel.

## Saved boards and files {#saved}

**Saved boards** lists the store by size. A stored board shows its command, its seed and how long it took. **Load into lab** brings its settings back, and **Delete from disk** removes it.

**Open file…** opens a `.board.json` from disk, with its meta file when you choose both. The lab shows that board without storing it.

## The board {#board}

Under the board, **View** is for looking: drag to pan, and zoom with the buttons or the wheel. **Inspect** describes the arrow you choose. **Play** plays the board by [its one rule](docs:arrowz#rule): a free arrow leaves, a blocked one bounces.

## Keys {#keys}

Single keys work on the **Lab** and **Saved boards** tabs, but not while you type into a field. The keys that run the lab bring it up first when you press them on Saved boards. On Windows and Linux, `⌘` is Ctrl.

::table{of="keys"}

## The command palette {#palette}

`⌘K` opens a search over everything the lab can do. Its rows come in sections: _run_ and _go to_, listed below, then a row for every setting of the generator, every preview setting and every preset. Typing a setting's name or its command-line flag (`--seed`) jumps to it. A row that cannot run right now stays listed, with the reason where its key would be.

::table{of="palette"}

## Links {#links}

The lab's address carries its settings, so a link opens the same board and generates it. After the `#` comes JSON, percent-encoded: every generator setting under its engine name at the top level (`W`, `H`, `seed`, `wShort`…), and the preview under `__view`:

```json
{ "W": 40, "H": 40, "seed": 7, "__view": { "colored": true, "lang": "pl" } }
```

A field left out takes its default, and a value the lab cannot read is ignored.

::table{of="link-fields"}
