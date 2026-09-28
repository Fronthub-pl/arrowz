# Lab report parity and the missing ⌘K rows

Part B of item 4 ("parity gaps") in `lab-review.md`'s "What is still open":
Gap 4 (the missing report rows) and the ⌘K rows for the colour and element
fields. The other parity gaps (pasting a command, Stop that keeps the partial
board, opening a `.board.json`, the closing rate over N seeds) are separate
pieces with their own specs.

Branch `lab/report-parity` from `main` = `7b16a1a`, one PR.

## Goals

1. The report shows what the engine already measures and the lab hides: the
   tail-rework counters (the `backbite` knob's effect), the shortest arrow,
   `T2`, the wrapping trio, the stall breakdown, the shortened arrows, and the
   legal heads of a board that could not be filled.
2. The delta colour says which way a number moved, not whether that is good.
   Whether up is harder, better or neither is said once, in the row's `?`.
3. Every view field the panel has is reachable from ⌘K.

Out of scope: `coverage`/`solvable` (100% and true on every closed board the
report is shown for), `unsolved`, `longPieces`, `headScans`, `absorbScanned`.

## 1. The report rows (`packages/engine/lab-report.ts`)

Everything stays in the pure `reportRows`; the lab gets rows ready to draw.
Each new row is a new `StatKey` with `stat_<key>` and `stat_<key>_help` in EN
and PL (`lab-i18n.test.ts` already requires the same keys in both).

**Every row is always present.** `StatsTable` compares a run with the
baseline by row index (`before[at]`), so a row that came and went would shift
every delta below it. A row with nothing to say shows `—` and has
`num: undefined`, as `stall` already does when `stats.n` is 0.

The carver statistics describe the last attempt only: a restart is a new
`Carver`. The help of each carver row says so ("in the last attempt").

The words follow the glossary (`glossary.test.ts`): no `backbite`, `carve`,
`pieces`, `corridor`. The `backbite` knob is "tail rework" / "przeróbka
ogona" in the lab, and the rows use the same words.

| Group | Key | Label EN / PL | Value | `num` |
| --- | --- | --- | --- | --- |
| size | `lengths` (changed) | unchanged | `minLen–maxLen cells · 2–6: 31% · …` — the range comes first, through a new formatter `stat_lengthsRange(min, max)` | undefined (unchanged) |
| difficulty | `farBlock` (new, after `almost`) | blocked from afar / blokowane z daleka | `T2 (pct of N)` | `T2` |
| shape | `turnsPerCell` (new, after `bends`) | turns per cell / zakręty na pole | `bendsPerCell.toFixed(3)` | `bendsPerCell` |
| shape | `ownSides` (new, after `coil`) | touching itself / styk z sobą | `selfAdj.toFixed(2)` | `selfAdj` |
| shape | `neighbours` (new, after `border`) | neighbours of a long arrow / sąsiedzi długiej strzałki | `neighbours.toFixed(1)` | `neighbours` |
| generator in detail (new sixth group, `statGroupDetail`) | `rework` | tail reworks / przeróbki ogona | `stat_reworkVal(taken, gaveUp)`: "12 done, 3 gave up" / "12 wykonanych, 3 porzuconych" (plural forms as `stat_absorbedVal`); `—` when `params.backbite` is 0; a missing counter with the knob on reads 0 | `backbites ?? 0`, undefined when the knob is 0 |
| | `stuckBy` | what stopped them / co je zatrzymało | `stat_stuckByVal(own, other, edge)`: "itself 41% · other arrows 52% · edge 7%" as shares of the sides; `—` when no stall was recorded | undefined (a wide row, added to `WIDE_KEYS`) |
| | `stuckLen` | length when stuck / długość przy zatrzymaniu | mean `stallLen / events`, one decimal; `—` with no events | the mean |
| | `selfTrap` | stuck on themselves / zamknięte przez siebie | `stallSelfTrap (pct of events)` | `stallSelfTrap ?? 0` |
| | `shortened` | shortened / skrócone | `pct(strandTrunc / n) (−mean)`, the mean being `strandLoss / max(1, strandTrunc)`; `—` when `n` is 0 | `100 × strandTrunc / n` |

**Stall events.** `stallOwn`, `stallForeign` and `stallEdge` count sides:
each stall adds exactly four between them. So the number of stall events is
`(stallOwn + stallForeign + stallEdge) / 4`. It is not `stats.stall`, which
counts arrows shorter than planned, a different thing (an arrow of fewer than
2 cells is recorded as a stall event but never reaches `stats.n`).

**The not-filled status line** (`notClosedStatus`) gains the legal heads when
`stuck.heads` is not null: "… (largest 12); 3 of 150 edge exits were still
open." The formatter takes `heads` and `2 × (W + H)`; with `heads === null`
the text is today's. The exact wording goes through the glossary guard.

`StatsTable`'s `GROUP_NAMES` gains `statGroupDetail` ("generator in detail" /
"generator w szczegółach"); the new group follows `generator` and is always
open.

## 1b. The delta colour is the direction of the change

Today `StatRow.better` (+1 / −1 / 0) drives the delta colour through
`reportDelta` (`trend: better | worse | neutral`), the screen reader's word
(`deltaBetter` / `deltaWorse`) and the caption over the report.

- `reportDelta(num, prev)` returns `trend: 'up' | 'down'`, from the sign of
  the difference alone. `better` leaves `StatRow`, `stat()` and `SEP`.
- **Green = up, red = down**, on every row with a number, the neutral ones
  (arrows, average length) included. The CSS classes become `.up` / `.down`
  on the same tokens (`--ok`, `--error`); the AA contrast test keeps its
  tokens and changes its class names.
- A screen reader hears "up" / "down" ("wzrost" / "spadek") in place of
  "better" / "worse" (`deltaUp`, `deltaDown` replace `deltaBetter`,
  `deltaWorse`).
- The caption: "vs. the previous board: green = up, red = down; a row's ?
  says what a change means" and its Polish.
- `ReportSummary` uses the same `reportDelta`; `time` still has no delta
  there.
- **The help audit.** Every `stat_*_help` of a row with a number ends with one
  sentence on what a rise means ("Higher = harder.", "Lower = cleaner
  arrows.", "Neither way is better."), in EN and PL. Rows that already have
  one keep it; rows that lack one (`avgLen`, `corridor`, `time` and others)
  get one. A sentence that claims harder or easier must be backed by the
  engine's definition, not by guesswork; where it cannot be, the sentence
  says what grows ("More = …"), not a verdict.

## 2. ⌘K rows for the colour and element fields (`apps/lab/src/palette/commands.ts`)

Every control already has its id, so `jumpTo(deps, 'preview', id)` works
unchanged. Eight rows join the `knob` section after the existing view rows,
with the note "Preview", in the panel's order:

| Row | Target id | Value column | `hay` |
| --- | --- | --- | --- |
| margin | `view-pad` | the number | `--pad pad` |
| dot colour | `view-pointColor` | `#rrggbb` | `--point-color` |
| dot size | `view-pointRadius` | the number | `--point-radius` |
| theme | `view-theme` | the theme's name, or `viewThemeNone` | `--theme theme` |
| background | `view-paper` | `#rrggbb`, or "not set / nie ustawiono" when `''` | `--paper paper` |
| lines | `view-ink` | as above | `--ink ink` |
| highlight colour | `view-highlightColor` | as above | `--highlight-color highlight` |
| palette | `view-palette` | `paletteCount` (`0 / 8`) | `--palette palette` |

The names are the panel rows' own labels (`highlightColorLabel` and the
others). The only new text is "not set": with no theme an unset colour is
the element's default, so "from the theme" would be false.
`hay` carries CLI flags, so the words the glossary retired (`paper`, `ink`)
are searchable there and never shown. A jump to the dot colour or size with
the dots off opens the dependency block through the existing `forced`.

## 3. Tests, documents, delivery

- **Engine.** `lab-report.test.ts` rewrites the expected rows (no `better`,
  the new keys and group). New cases: `rework` reads `—` with `backbite` 0
  and `0 done, 0 gave up` with the knob on and no stall; stall events are the
  sum of sides / 4; `reportDelta` returns `up`/`down` whatever the row;
  `notClosedStatus` with and without heads. `glossary.test.ts` and
  `lab-i18n.test.ts` run over the new texts unchanged.
- **Lab.** `ReportPanel.browser.test.tsx` changes its tokens (`up` → `--ok`,
  `down` → `--error`), the caption and the "longest fell" case (now red
  because it fell, not because longer is better). `StatsTable` draws six
  group names. `Console.jump.browser.test.tsx` jumps to `view-pointColor`
  with the dots off and to `view-highlightColor`, and finds the focus there
  after the next render.
- **Documents.** `lab-review.md`: Gap 4 and the ⌘K row become "fixed on
  `lab/report-parity`", and item 4 of "What is still open" loses both.
- **Gates.** `deno task verify` in `packages/engine` and `packages/cli`,
  `pnpm nx run-many -t verify`, and a live pass in Chrome: two runs with
  different `backbite`, the colours of the deltas, the `?` texts, and every
  new ⌘K row in both languages.
