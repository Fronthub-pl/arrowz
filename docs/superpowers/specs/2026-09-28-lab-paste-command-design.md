# Pasting a `carve` command into the lab

Part C of item 4 ("parity gaps") in `lab-review.md`'s "What is still open",
Gap 1 of its feature-parity table: the lab prints the command that reproduces
what is configured (`buildCommand`) but cannot read one back. The engine's
header promises both directions ("both sides build and read the text with
this code"). Parts D (Stop that keeps the partial board, opening a
`.board.json`) and E (closing rate over N seeds) are separate.

Branch `lab/paste-command` from `main` = `2f8f1b1`, one PR.

## Goals

1. A `deno task carve …` line pasted into ⌘K sets the lab to what that line
   would carve, and generates it: the knobs, the look, the simple view's
   recipe.
2. A line the CLI would refuse at parsing says why, in the page's language,
   every problem at once.
3. One parser for both surfaces: the CLI's refusals keep their exact English
   text, and the lab and the CLI assemble the drawn parameters with the same
   engine function (`drawOf`).

Out of scope: an editable command box or a global paste handler; batch and
mode flags (`--count`, `--svg`, `--dry-run`), which the lab lists as ignored.

## 1. The engine (`packages/engine/command.ts`)

All of it neutral (no DOM, no Deno), tested in Deno.

**`splitCommand(text: string): { argv: string[]; problems: ArgProblem[] }`.**
A shell-like split of one pasted line:
- tokens are separated by runs of whitespace (spaces, tabs, newlines);
- `'…'` quotes literally, `"…"` quotes with `\"` and `\\` escapes, and a
  quote may sit inside a token (`--palette='#aa0000,#00aa00'` gives
  `--palette=#aa0000,#00aa00`);
- a backslash before whitespace joins the lines (a command copied over
  several lines — the palette's text input turns each line break into a
  space); a backslash before any other character keeps that character;
- a leading `deno task carve` (`COMMAND_PREFIX`, whitespace-tolerant) is
  dropped; a line that starts with a flag is taken as it is;
- an unclosed quote is a problem `{ kind: 'unclosedQuote' }`, and `argv` is
  what was read before it.

**`ArgProblem` and `ParsedArgs.problems`.** Every refusal `parseArgs` makes
today becomes a typed problem carrying the token as written (`arg`) and the
values its sentence needs:

| kind | extra fields | today's English text |
| --- | --- | --- |
| `noValue` | | `${arg} takes no value` |
| `unexpectedArgument` | | `unexpected argument: ${arg}` |
| `retired` | `name`, `use: string[]`, `why: 'oneMode' \| 'boardAlways' \| 'spacingFixed' \| null` | `--${name} is gone: ${hint}` |
| `notStart` | `words: string[]`, `min`, `max` | `${arg} is not … and not a number in min..max` |
| `outside` | `min`, `max` | `${arg} is outside min..max` |
| `notNumber` | `words: string[]` | `${arg} is not a number[ and not a or b]` |
| `notWhole` | | `${arg} is not a whole number` |
| `notTheme` | `themes: string[]` | `${arg} is not a theme: …` |
| `notColour` | | `${arg} is not a #rrggbb colour` |
| `notColourList` | | `${arg} is not a list of #rrggbb colours` |
| `paletteTooLong` | `cap` | `${arg} has more than ${cap} colours` |
| `unknownFlag` | `name` | `unknown flag --${name}` |
| `missing` | `name` | `missing --${name}` |
| `unclosedQuote` | | `a quote is not closed: ${arg}` (only from `splitCommand`; the lab's own words avoid "closed", a retired word) |

`RETIRED` becomes structured (`use` lists the replacement spellings, `why`
names the three hints that are prose); `problemText(problem): string` builds
the English sentence, and `errors` stays as `problems.map(problemText)`, so
every existing CLI and engine test that pins a refusal's text keeps passing
unchanged — that is the check that the refactor changed nothing.

**`drawOf(parsed: ParsedArgs, rng: () => number): { params: Params; moved: Move[] }`.**
What `carve.ts` does today between parsing and the envelope: the pins read
back out of `parsed.params`, then `drawParams(parsed.choice,
parsed.choice.random ? rng : null, pinned)`, returned whole because the CLI
prints `moved` as notes. `carve.ts` calls it instead of its own copy; the lab
uses its `params`.

## 2. The lab: ⌘K in command mode (`apps/lab/src/palette`)

**Detection.** When the palette's query, trimmed, starts with
`deno task carve`, or with a flag that has a value or a second token
(`--seed=5`, `--colored --sharp`), the palette is in command mode — a lone
flag (`--seed`) stays a search for its knob, as it is today: it shows one
row, "Load this command", and none of the usual rows (a pasted line matches
many of them as noise).

**A line with no problems.** The row's value is the board it gives
(`25×50 · seed 7`, with "drawn" added under `--randomized`); its note lists
the mode flags the lab ignores (`parsed.rest`: `--svg`, `--count=5`, …) as
"ignored: …". Enter loads it.

**A line with problems.** The row is disabled, and every problem is listed
under it in the page's language, tied to the row by `aria-describedby`. The
dictionary gets one entry per problem kind (formatters taking the token and
the extra fields). No dictionary string quotes a flag itself
(`glossary.test.ts`: the lab's strings never write `--x`); flags reach the
text only as arguments (the token, the `use` list).

**Loading** (Enter on a valid row), in this order:
1. `drawOf(parsed, Math.random).params` → `params.setMany` on the machine path
   (the lab clamps an out-of-range knob and raises its clamp notice, as for a
   link);
2. `view.apply(parsed.view)` — shape and look;
3. the simple view's recipe becomes `parsed.choice` (size, seed, the two
   sliders, skeleton, randomise) through a new machine-path setter that does
   not count an edit: the recipe's `setSize`/`setSlider` count edits, which
   `useAutoRun` watches, and a counted edit would start a second run;
4. a line with pinned knobs (`parsed.pins` not empty) switches the lab to the
   advanced view — the simple view does not show pins, and its randomise
   would drop them on the next Generate; a line with everyday flags only
   keeps the current view;
5. navigate to `/`, close the palette, and start the run with
   `control.start()`, not `generate()`: `generate` redraws in the simple view
   with randomise on, which would undo the pins just drawn over.

A line whose drawn knobs break a rule (`validateParams`), which the CLI would
refuse after the draw, still loads: the lab shows its own violations panel
and holds Generate, exactly as after a hand edit.

## 3. Tests, documents, delivery

- **Engine (Deno).** `splitCommand`: whitespace runs, both quote kinds,
  a quote inside a token, backslash-newline, the prefix with and without
  extra spaces, a bare flag line, an unclosed quote. `problems`: one case per
  kind, and `problemText(p)` equals the old sentence for each (the existing
  `command.test.ts` and `carve.test.ts` refusal texts stay as they are).
  Round trip: `splitCommand(buildCommand(p, v))` parses back to `p` and `v`
  with no problems, including a quoted palette. `drawOf` without
  `--randomized` gives `parsed.params`; with it, pins survive the draw.
- **Lab.** Unit (`commands.test.ts` or a new module's test): command-mode
  detection, the valid row (value, ignored flags), the problem rows in EN and
  PL, the recipe/mode decisions. Browser: copy the live command, change the
  state, paste it into ⌘K, press Enter — knobs, view (a quoted palette
  included) and the board come back and exactly one run starts; a pinned
  line switches the simple view to advanced.
- **Documents.** `lab-review.md`: Gap 1 "fixed on `lab/paste-command`", item
  4 of "What is still open" loses it.
- **Gates.** `deno task verify`, `pnpm nx run-many -t verify`, and a live
  pass in Chrome in both languages: paste a lab command, a hand-written
  everyday line with `--randomized`, a multi-line line with backslashes, and
  a broken line.
