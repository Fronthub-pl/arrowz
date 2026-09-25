# Lab simple view copy: every control explains itself

Branch `lab/simple-copy`, stacked on `lab/report-copy` (PR #112), which is
stacked on `lab/simple-size` (PR #111). The second of three PRs for the "copy
pass" item of `lab-review.md` ("What is still open"): A was the report, B is
the simple view and `start.help` (this spec), C the glossary across the rest
of the lab.

## Goal

A player who starts in the simple view can tell what each control does without
knowing the engine, and knows where to go for a harder board, in English and in
Polish. Today the two sliders and the skeleton switch have no `?`, "skeleton" is
never defined, the slider value is a bare 0–100, "line shape" does not say which
way is which, the Polish labels overflow the track, and nothing mentions
difficulty (`lab-review.md`, "Labels and descriptions", Top 6 and "Simple
view"). Separately, `start.help` drops "Tunnels = harder", the one sentence a
player needs from that knob ("Also found").

## Decisions (agreed 2026-09-25)

1. The two sliders and the skeleton switch get a `?` through the existing
   `useKnobHelp`, like the random switch beside them.
2. The slider keeps its 0–100 number. Its help says the number is the slider's
   position, not a setting's value.
3. The difficulty hint is a sentence at the end of the board section, with no
   new control. The simple view shows no presets (`presetsInTop` needs the
   advanced view, and `Workspace` hides the strip when `simple`), so the hint
   points to the advanced view.
4. The skeleton help says nothing about time. Measured on this branch with
   `simpleParams` at lengths 0.75, shape 0.5 and `generate` under Deno:
   400×400 median 954 ms off / 956 ms on (5 seeds), 1000×1000 11.9 s in both
   (3 seeds), every board complete. The `SKELETON` ranges already stay below
   the measured time tail, so "slower on big boards" would be false.
5. Only the simple view's own strings follow the glossary ("arrow", "winding").
   `start.help` gains its sentence and keeps "piece"; renaming across the lab
   is PR C.

## Dictionary: `lab-i18n.ts`

Changed and new keys in `simple`, both languages. New keys are required in
both dictionaries by the existing type of `PL` (it mirrors `EN`).

| key | EN | PL |
|---|---|---|
| `lengths` | arrow length | dł. strzałek |
| `shape` | winding | krętość |
| `ends.shape` | `['straightest', 'most winding']` | `['najprostsze', 'najbardziej kręte']` |
| `lengthsHelp` (new) | Left: many short arrows. Right: fewer, longer ones. The number is the slider's position from 0 to 100, not a setting; the detailed settings follow from it. | W lewo: dużo krótkich strzałek. W prawo: mniej, ale dłuższych. Liczba to pozycja suwaka od 0 do 100, nie ustawienie; szczegółowe ustawienia wynikają z niej. |
| `shapeHelp` (new) | Left: long straight arrows. Right: arrows that bend and wind a lot. The number is the slider's position from 0 to 100, not a setting; the detailed settings follow from it. | W lewo: długie proste strzałki. W prawo: strzałki, które dużo skręcają i się wiją. Liczba to pozycja suwaka od 0 do 100, nie ustawienie; szczegółowe ustawienia wynikają z niej. |
| `skeletonHelp` (new) | Starts the board with a few very long arrows snaking across it; the rest fills in around them. | Zaczyna planszę od kilku bardzo długich strzałek wijących się przez planszę; reszta wypełnia miejsce wokół nich. |
| `randomizeHelp` | Each Generate picks fresh settings within a safe range for this size and these choices, so you get a new board every time, even with the same seed. See the picked values in Advanced. | Każde „Generuj” dobiera nowe ustawienia w bezpiecznym zakresie dla tego rozmiaru i wyborów, więc za każdym razem dostajesz inną planszę, nawet przy tym samym ziarnie. Wybrane wartości zobaczysz w widoku zaawansowanym. |
| `harder` (new) | Want it harder? In Advanced, pick a tunnels preset, or set the start to tunnels in the difficulty group. | Chcesz trudniej? W widoku zaawansowanym wybierz preset z tunelami albo w grupie trudność ustaw start na tunele. |

`ends.lengths` is unchanged. The PL `randomizeHelp` quotes the Generate
button's own Polish label, `Generuj` (`generate` in `PL`).

`start.help`, both languages, gains one sentence after the tunnels clause:

- EN: `Where the next piece starts: the shallowest line (layers), anywhere (random) or the deepest (tunnels). Tunnels = harder. Mixing starts that fraction of pieces as tunnels.`
- PL: `Skąd startuje kolejny element: najpłytsza linia (warstwy), losowo albo najgłębsza (tunele). Tunele = trudniej. Mieszanie startuje tunelami tę część elementów.`

## Components: `apps/lab/src/simple`

- `PositionSlider`: `useKnobHelp('simple-<slider>-help', label, help)`; the
  button goes into `KnobLine`'s `help`, the paragraph after `KnobLine` inside
  the row, as in `RandomRow`. The track's `aria-describedby` becomes
  `simple-<slider>-ends simple-<slider>-help`, so a screen reader hears both.
  The `simple-` prefix keeps the ids apart from the advanced view's group
  help. The component header loses "with no `?`".
- `SkeletonRow`: the same, with id `simple-skeleton-help`. `Segmented` gains
  an optional `describedBy` prop, set as `aria-describedby` on its group next
  to the existing `labelledBy`; `SkeletonRow` passes the help id.
- `SimplePanel`: a `<p>` with `simple.harder` as the last child of the board
  `Section`, after `RandomRow`, styled like the rows' help text so it reads as
  a note, not a control.

No engine code changes beyond the dictionary; the CLI does not read `simple`.

## Tests

In `SimplePanel.browser.test.tsx`, both languages:

- each of the three new `?` buttons toggles `aria-expanded` and reveals its
  own paragraph with the dictionary text, and no other paragraph opens;
- the slider's `aria-describedby` names both the ends and the help;
- the hint paragraph is in the board section with the dictionary text;
- at the drawer width the Polish labels `dł. strzałek` and `krętość` do not
  overflow their label track (the element needs `min-width: 0`, or the
  overflow check cannot fail).

`start.help` contains "Tunnels = harder" / "Tunele = trudniej" in the
component test that renders `StartKnob`.

Harness: the new `.q` buttons sit in `.kv-g`, which `touchTargets` already
skips, and the `lengths-help-open` state clicks every `.kv-g .q` in the
advanced view only. The plan confirms both by running `LayoutInvariants`
rather than by reading.

## Verification

`deno task verify` and `pnpm nx run-many -t verify` green; a live run in Chrome
against a copy of the store (`ARROWZ_BOARDS_DIR`): Polish at 1440 px and English
at 375 px with touch, opening each `?` and reading the hint.
