# Lab report copy: every row explains itself

Branch `lab/report-copy`, stacked on `lab/simple-size` (PR #111). The first of
three PRs for the "copy pass" item of `lab-review.md` ("What is still open"):
A is the report (this spec), B the simple view and `start.help`, C the glossary
across the rest of the lab.

## Goal

A player opening the report can tell what each number means and which way is
harder, in English and in Polish, without knowing the engine. Today the 23 rows
and the 4-figure summary carry no explanation, several labels are raw codes
(`f0`, `almost1`, `D`), and the green/red verdict has no stated goal
(`lab-review.md`, "Labels and descriptions", Top 1 and "Report").

## Decisions (agreed 2026-09-25)

1. Every row gets a one- or two-sentence help, behind a `?` button — the same
   `useKnobHelp` the knob rows use — that opens the sentence under the row.
   The summary gets one `?` beside its caption, opening its four figures'
   sentences: at the 352px drawer a figure's column leaves 61px for its term,
   too narrow for a term and a button.
2. The green/red colours stay. The caption says green is better, and each
   row's help says which way is better where there is a way.
3. `D`, `f0` and `almost` stop being neutral: `D` +1 (deeper is harder), `f0`
   −1 (fewer free arrows is harder), `almost` +1 (more traps is harder).
4. Labels follow the glossary of `lab-review.md` ("Terminology glossary
   proposal") for the rows of the report only; the rest of the lab is PR C.
5. The review's proposed texts are the starting point, each checked against
   `analyse` in `engine.ts`. Two departures: `blockDist` keeps its unit
   "of width + height" (`sidesUnit`, already right since `e7de79a`), and
   `lengths` names the buckets the row prints, not "short / medium / long".

## Engine: `lab-report.ts` and `lab-i18n.ts`

- `StatRow` gains `readonly help: string`. `stat()` fills it from
  `dict.t('stat_<key>_help')`; the separator has `''`. The CLI does not read
  `reportRows`, so no CLI change.
- `f0` is shown as `pct(f0)`; its `num` becomes `100 * f0`, like the other
  percentage rows.
- `better`: `f0` −1, `almost` +1, `D` +1. Every other row keeps its value.
- `piecesUnit`: EN `arrows`, PL `strz.`
- Summary: `statSumD` is deleted; the summary shows the row's own label
  ("depth" / "głębokość") and drops the `<abbr>`.
- Group names: `statGroupBlocking` → EN `difficulty`, PL `trudność`;
  `statGroupRun` → EN `generator`, PL `generator`. Keys unchanged.
- `reportSummaryCap`: EN `vs. the previous board: green = better, red = worse; a row's ? says which way is better`;
  PL `wobec poprzedniej planszy: zielone = lepiej, czerwone = gorzej; ? przy wierszu mówi, w którą stronę jest lepiej`.
- `longestHead`: EN `` `The ${n} longest arrows` ``, PL `` `${n} najdłuższych strzałek` ``.
  `longestHelp` keeps its content with "piece/element" replaced by "arrow/strzałka".

### Labels, values and help

What each row measures is taken from `analyse` (`engine.ts`) and
`reportRows` (`lab-report.ts`), not from the old labels.

| key | EN label | EN help | PL label | PL help |
|---|---|---|---|---|
| board | board | Width × height, the number of cells, and the seed that reproduces this board. | plansza | Szerokość × wysokość, liczba komórek i ziarno, które odtwarza tę planszę. |
| pieces | arrows | How many arrows the board has. More arrows = a longer game. | strzałki | Ile strzałek ma plansza. Więcej strzałek = dłuższa gra. |
| avgLen | average length | Cells per arrow, on average. | średnia długość | Średnio komórek na strzałkę. |
| longest | longest | The longest arrow, in cells and as a share of the board. | najdłuższa | Najdłuższa strzałka: w komórkach i jako część planszy. |
| lengths | lengths | Share of arrows by length in cells: 2–6, 7–15, 16–49 and 50 or more. | długości | Udział strzałek według długości w komórkach: 2–6, 7–15, 16–49 i 50 lub więcej. |
| f0 | free at start | Arrows you can remove on the very first move. Lower = harder. | wolne na starcie | Strzałki, które można zdjąć w pierwszym ruchu. Mniej = trudniej. |
| almost | traps | Arrows blocked by exactly one other: they look almost free, but are not. More = more tempting mistakes. | pułapki | Strzałki zablokowane przez dokładnie jedną inną: wyglądają na prawie wolne, ale nie są. Więcej = więcej kuszących pomyłek. |
| D | depth | The longest chain of arrows waiting on one another. Even removing every free arrow at once, clearing the board takes depth + 1 rounds. Higher = harder. | głębokość | Najdłuższy łańcuch strzałek czekających jedna na drugą. Nawet zdejmując naraz wszystkie wolne, potrzeba głębokość + 1 rund. Więcej = trudniej. |
| corridor | path to edge | How many cells, on average, an arrow has to travel in the direction it points to leave the board. | droga do krawędzi | Ile komórek średnio strzałka ma do przebycia w kierunku, w którym wskazuje, żeby opuścić planszę. |
| span | average reach | How much of the board's width or height an arrow stretches across, on average (the larger of the two). | średni zasięg | Jaką część szerokości lub wysokości planszy obejmuje średnio strzałka (większą z nich). |
| spanTop | reach, top 10% | The same, for the 10% of arrows that reach furthest. | zasięg, górne 10% | To samo dla 10% strzałek o największym zasięgu. |
| spanMax | reach, record | The reach of the one arrow that reaches furthest. | zasięg, rekord | Zasięg strzałki, która sięga najdalej. |
| outDeg | blocks on average | How many arrows each arrow stands in the way of, on average. Higher = removing one arrow frees more. | blokuje średnio | Ilu strzałkom średnio każda strzałka stoi na drodze. Więcej = zdjęcie jednej uwalnia więcej. |
| maxOut | blocks, record | The most arrows a single arrow stands in the way of. | blokuje, rekord | Najwięcej strzałek, którym stoi na drodze jedna strzałka. |
| blockDist | blocking distance | How far an arrow's head is from the heads of the arrows it blocks, on average, as a share of width + height. Higher = one move matters across the board. | dystans blokad | Jak daleko średnio grot strzałki jest od grotów strzałek, które blokuje, jako część szerokości + wysokości. Więcej = jeden ruch działa na całą planszę. |
| bends | bends per arrow | How many times an arrow turns, on average. | zakręty na strzałkę | Ile razy średnio skręca strzałka. |
| coil | coiling | Share of cells where an arrow touches itself on three sides: a clump rather than a line. Lower = cleaner arrows. | zwinięcie | Udział komórek, w których strzałka dotyka siebie z trzech stron: kłębek zamiast linii. Mniej = czystsze strzałki. |
| border | wrapping | For arrows of 8 cells or more: how much of an arrow runs alongside a single neighbour. Higher = arrows wrap around each other. | oplatanie | Dla strzałek od 8 komórek: jak duża część strzałki biegnie wzdłuż jednej sąsiadki. Więcej = strzałki się oplatają. |
| multi | bent arrows | Share of arrows that are not one straight line. | zgięte strzałki | Udział strzałek, które nie są jedną prostą. |
| stall | stopped short | How the generator worked: the share of the arrows it laid (taken-back ones included) that stopped before the length it planned for them, and how much of the planned length they reached. Lower = smoother. | urwane przed celem | Jak pracował generator: udział ułożonych strzałek (także cofniętych), które urwały się przed zaplanowaną długością, i jaką część tej długości osiągnęły. Mniej = płynniej. |
| absorbed | merged leftovers | How the generator worked: small empty patches it glued onto neighbouring arrows. Fewer = a cleaner board. | doklejone resztki | Jak pracował generator: małe puste łatki doklejone do sąsiednich strzałek. Mniej = czystsza plansza. |
| backtracks | backtracks / restarts | How the generator worked: how many times it took arrows back, and how many fresh attempts it needed. | nawroty / restarty | Jak pracował generator: ile razy cofał strzałki i ilu nowych prób potrzebował. |
| time | time | How long the board took to generate and to measure. | czas | Ile trwało generowanie planszy i liczenie statystyk. |

Values that change with the labels:

- `stat_stallVal`: EN `` `${pStall} of arrows laid, reaching ${pGot} of the planned length` ``;
  PL `` `${pStall} ułożonych strzałek, osiągają ${pGot} zaplanowanej długości` ``.
- `stat_absorbedVal`: EN `patch`/`patches` by count; PL `łatka`/`łatki`/`łatek` by `plCount`, then `(${cells} komórek)`.
- `stat_timeVal` and `stat_genVal`, PL only: `generowanie … s, statystyki … s` and `generowanie … s`.

## Lab: `apps/lab/src/report`

- `StatsTable`: the row's `<th>` holds the label and `useKnobHelp`'s button;
  the paragraph sits in a fourth cell of the same `<tr>`, spanning the row's
  grid under it (a row stays one `<tr>` for everything that counts them),
  visually hidden while closed (so `aria-controls` always points at
  an element). The help id is derived from the row key (`stat-help-<key>`).
  A hook cannot run inside `map`, so each row is a small `StatRowView`
  component.
- `ReportSummary`: one `?` beside the caption opens a list (`#sum-help`) of
  the four figures' labels and sentences under the figures. The summary's
  rows leave the table, so this is their only help. The figures' inner
  padding narrows so the longest Polish term fits its column.
- `LongestTable`: the `longestHelp` paragraph moves behind a `?` next to the
  heading; the button is named by `longestName` ("the longest arrows").
- CSS: the `?` reuses the knob rows' `.q`; the help row reuses `.kv-help`'s
  type. Rows in `WIDE_KEYS` and the table's grid keep their tracks; the PL
  labels that grow (`droga do krawędzi`, `blokuje, rekord`) must not wrap
  the value column — checked by the report's layout test.

## Tests

- `lab-report.test.ts`: every row of `reportRows` has a non-empty `help`
  in EN and in PL, and no two rows share one; `f0` prints as a percentage;
  `better` of `f0`, `almost`, `D` is −1, +1, +1.
- The i18n parity test already fails on a key missing in PL.
- `ReportPanel.browser.test.tsx`: a row's `?` toggles `aria-expanded` and
  shows its sentence; the same in PL; the summary's one `?` opens the four sentences; the
  longest table's help is closed by default and opens.
- Existing assertions on the old labels (`D (blocking depth)`, `f0 …`,
  `elementów`, …) are updated, not deleted.
- The layout checks that cover the report drawer (`LabLayout.browser.test.tsx`,
  `Workspace.browser.test.tsx`) stay green, and one case opens a row's help in
  PL at the narrowest drawer width.

## Out of scope

The CLI report, the knob and view-panel labels (PR C), the simple view and
`start.help` (PR B), the review's "report rows missing" parity gap
(`backbites`, `T2`, `minLen`).
