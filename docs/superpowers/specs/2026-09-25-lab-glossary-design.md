# Lab glossary: one word per concept, everywhere a player reads

Branch `lab/glossary`, stacked on `lab/simple-copy` (PR #113) ← `lab/report-copy`
(PR #112) ← `lab/simple-size` (PR #111). The third of three PRs for the "copy
pass" item of `lab-review.md` ("What is still open", item 1): A was the report,
B the simple view, C (this spec) the glossary across the knobs, the view panel,
the statuses, the presets, the saved boards' list, the CLI's help and the
READMEs.

## Goal

A player sees one word for each concept, in English and in Polish: "arrow"
rather than piece / line / element, "complete" and "stuck" rather than closed /
jammed, "skeletons" rather than giants, "target length" rather than probe,
"background" and "arrow colour" rather than paper and ink. Knob help stops
warning about values the slider cannot reach. The preset panel says that a
level sets the size only, and what each option changes. A test keeps the old
words from coming back.

## Decisions (agreed 2026-09-25)

1. One PR, including the four extras: the help sentences that warn about
   unreachable values, the preset caption and mode descriptions, the README
   prose sweep, and units that do not inflect.
2. The lab's words win over the READMEs' "Word list" / "Słowniczek" where they
   differ: skeleton (not backbone), path to edge (not lane), arrowhead (tip
   stays as a synonym in the word list), stuck (not jam), cell (not square).
   The READMEs follow; the texts shipped in A and B stay.
3. English knob text changes at its source, `PARAM_TABLE` in `engine.ts`, so
   `--help=knobs` speaks the same glossary. No lab-only English overlay.
4. Keys never change: `giants`, `probe`, `headBias`, `trapBias` and the flags
   stay in code, in links, in the store and on the command line. Only the
   values of the dictionaries and help texts change. Links, stored metas and
   board hashes are unaffected.
5. A sentence that warned about a value outside the knob's range is removed or
   restated at the range's end. No new number enters a help text unless the
   code or a measurement file states it (sources given per row below).
6. The preset panel gets one visible caption; the mode descriptions are
   `title` plus `aria-describedby`, not a second visible line in each button.
7. A new guard, `packages/engine/glossary.test.ts`, lists the retired words
   per language and fails with the dictionary key that carries one.

## Glossary

The table the guard enforces. "In code" names stay as keys, flags and
identifiers.

| concept | EN | PL | retired (EN / PL) | in code |
|---|---|---|---|---|
| a piece of the puzzle | arrow | strzałka | piece, line (for an arrow) / element, linia | `piece` |
| the pointed end | arrowhead | grot | head (in help texts) / głowa | `head` |
| every cell covered | complete, filled | pełna, wypełniona | closed, close / domknięta, domykanie | `closed`, `ok` |
| generator cannot continue | stuck | utknąć | jam, jammed / zacinać, zaklinować | – |
| the generator placing an arrow | lay, place | układać | carve / wycinać | `carve` |
| taking placed arrows back | backtrack (generator group only) | nawrót | – | `maxBack` |
| arrow keeps straight | straightness | prostość | straightness bias / prostota, skłonność do prostej | `pStraight` |
| arrow bends a lot | winding | krętość | line shape / kształt linii | – |
| arrow touches itself | coil, coil penalty | zwój, kara zwojów | anticoil, coiling penalty / antyzwijanie, kara za zwijanie | `anticoil` |
| dead-end pocket | nook | zakamarek | closing off nooks / domykanie zakamarków | `warns` |
| where arrows start | arrow start: layers / random / tunnels / mix | start: warstwy / losowo / tunele / mieszane | piece start, mixing / start elementów, mieszanie | `headBias`, `mix` |
| blocked by exactly one other | trap | pułapka | trap bias / – | `trapBias` |
| arrows with a set length | target length, target share | zadana długość | probe / sonda | `probe`, `probeLen` |
| very long arrows laid first | skeleton, skeleton arrows | szkielet, strzałki szkieletu | giants, backbone, skeleton pieces / elementy szkieletowe | `giants` |
| back-and-forth runs of a skeleton | run, run gap | bieg, przerwa | serpentine step / skok serpentyny | `giantStep` |
| empty leftover area | leftover, empty patch | resztka, pusta łatka | fragment, absorb / fragment, wchłanianie | `absorbLimit` |
| picture unit | cell | komórka (kom.) | grid units, units / podziałki, jedn. | – |
| background colour | background | tło | paper / papier | `paper` |
| single arrow colour | arrow colour | kolor strzałek | ink, drawing colour / tusz, kolor rysunku | `ink` |
| the visual settings | look (rail heading) | wygląd | element / element | `preview` |
| dots under the board | dot grid | siatka kropek | point grid / siatka punktów, punkty | `showPoints` |

## Mechanisms

### Choice words shown in English

`dictionary().choiceText` shows a fixed-choice word in Polish from
`PL.choices` and falls back to the CLI's word in English. The trap choice `off`
has to read "normal" in English while the flag keeps `--trapbias=off`, so
English gets a display table too: `EN_CHOICES` (a module constant beside `EN`,
not a section of `EN`, so `Dictionary` does not change shape), consulted by
`choiceText` for `lang === 'en'` before the fallback. The command box keeps
printing the CLI's word, as it does for Polish today.

| knob | CLI word | EN shown | PL shown |
|---|---|---|---|
| `trapBias` | `avoid` / `off` / `seek` | avoid / **normal** / seek | unikaj / **normalnie** / szukaj |
| `giantSpacing` | `off` / `2` / `3` | = | bez odstępu / 2 / 3 (=) |
| `Lmax` (special) | `auto` | auto | auto |
| `giantStep` (special) | `random` | random | **losowo** |

The special-value chip (`ValueKnob`, the track's minimum spelled as a word)
shows `dict.choiceText(spec.key, special)` instead of the raw word, in its text
and in its `aria-label`; `PL.choices` gains `giantStep: { random: 'losowo' }`
and `Lmax: { auto: 'auto' }`. The view panel's head-width `auto` chip stays
`auto` in both languages.

### Units

`units` keys and the rows that use them (`UNIT_OF` in `knobLayout.ts`,
`VIEW_ROWS` in `viewFields.ts`):

| key (new) | EN | PL | used by | replaces |
|---|---|---|---|---|
| `cells` | cells | kom. | W, H, Lmax, probeLen, giantStep, absorbLimit, **stroke, headWidth, headHeight** | `units` / `jedn.` on the view rows |
| `times` | × | × | backbite, headTries | `tries` / `prób` |
| `arrows` | arrows | strz. | giants, **maxBack**, view `top` | `pieces` / `szt.`; `maxBack`'s `carves` / `wycięć` |
| `sides` | × side | × bok | giantSpan | `sides` / `boki` |
| `px` | px | px | view `cell` | = |

`units`, `tries`, `pieces` and `carves` are deleted. `maxBack` counts arrows
taken back (its help says so), so its unit is `arrows`.

### Head help split

`headHelp` (one text shared by the head width and head height rows) becomes
`headWidthHelp` and `headHeightHelp`; `VIEW_ROWS` points each row at its own.

### Preset panel

- A caption at the top of the preset panel (`run/PresetStrip.tsx`), one line
  across the columns: `presets.caption`.
- Each mode button gets `title` = its mode's description and
  `aria-describedby` = the id of a visually hidden element holding the same
  text, one element per mode in the panel (five), not one per button.
- The button's visible text and its `aria-label` (level, size, mode) stay as
  they are; only the mode word changes where the table below says so.

| key | EN | PL |
|---|---|---|
| `presets.caption` | Levels set the board's size only; the options change how arrows are laid. | Poziomy ustawiają tylko rozmiar planszy; opcje zmieniają sposób układania strzałek. |
| `presets.modes.portrait` | tall | pionowa |
| `presets.modes.square` | square (=) | kwadrat (=) |
| `presets.modes.serpentine` | winding skeleton (=) | kręty szkielet |
| `presets.modeHelp.square` | As wide as it is tall. | Tak szeroka, jak wysoka. |
| `presets.modeHelp.portrait` | Twice as tall as it is wide. | Dwa razy wyższa niż szersza. |
| `presets.modeHelp.tunnels` | Arrows start deep inside, buried behind others: harder. | Strzałki startują w głębi, zakopane za innymi: trudniej. |
| `presets.modeHelp.skeleton` | A few very long arrows snake across the board first. | Najpierw kilka bardzo długich strzałek wije się przez planszę. |
| `presets.modeHelp.serpentine` | A skeleton whose runs keep breaking off: no line goes wall to wall. | Szkielet, którego biegi ciągle się urywają: żadna linia nie idzie od ściany do ściany. |

Sources: tunnels = `headBias: 1` and "Tunnels = harder" (`PARAM_SPEC`
`headBias.help`); serpentine = `giantJitter: 1`, "no line goes wall to wall"
(`lab-presets.ts`, the `huge-400-serpentine` comment). "Size only" holds for
the square and portrait options of every level (`level()` sets `W`/`H` only);
the tunnels and skeleton options are the modes the caption names.

## Generator knobs

English goes into `PARAM_TABLE` (label, help) and `EN.short`; Polish into
`PL.params` and `PL.short`. Short labels stay at 12 characters or fewer (the
existing `lab-i18n.test.ts` check). `=` means unchanged.

### Short labels

| key | EN | PL |
|---|---|---|
| wShort / wMid / Lmax | = | = |
| backbite | tail rework | przeróbki |
| pStraight | straightness (=) | prostość |
| wLateral | sideways | ruch w bok (=) |
| warns | nooks first | zakamarki (=) |
| anticoil | coil penalty | kara zwojów |
| headBias | arrow start | start (=) |
| mix | tunnel share | ile tuneli |
| trapBias | traps | pułapki (=) |
| probe | target share | ile zadanych |
| probeLen | target len | zadana dł. |
| giants | skeletons | szkielety (=) |
| giantSpan | length | długość (=) |
| giantStep | run gap | przerwa |
| giantJitter | cut short | urywanie (=) |
| wGiant | late chance | kolejne |
| giantStraight | straightness (=) | prostość |
| giantAnticoil | coil penalty | kara zwojów |
| giantSpacing | spacing (=) | odstęp (=) |
| headTries | start tries | próby startu (=) |
| absorbLimit | leftover max | resztki do |
| maxBack / restarts | = | = |

### Labels and help

| key | EN label · help | PL label · help |
|---|---|---|
| seed | = · The board's number. The same seed with the same settings always gives the same board; change it for a new board of the same kind. | = · Numer planszy. To samo ziarno przy tych samych ustawieniach daje zawsze tę samą planszę; zmień je, by dostać inną planszę tego samego rodzaju. |
| wShort | share of short arrows (2–6 cells) · How many arrows are short. More = more arrows on the board, but lots of little hooks. Short + medium: at most 0.9 (90%). | udział krótkich (2–6 komórek) (=) · Jaka część strzałek jest krótka. Więcej = więcej strzałek na planszy, ale dużo drobnych haczyków. Krótkie + średnie: najwyżej 0,9 (90%). |
| wMid | share of medium arrows (7–15 cells) · How many arrows are medium. Whatever short and medium leave goes to long arrows. Short + medium: at most 0.9 (90%). | = · Jaka część strzałek jest średnia. Resztę po krótkich i średnich dostają długie. Krótkie + średnie: najwyżej 0,9 (90%). |
| Lmax | longest arrow (auto = 2.5 × longer side) · The longest arrow the generator aims for, in cells. auto = 2.5 × the longer side. 1 to 16 is not allowed: it would cut into the medium and long sizes. | najdłuższa strzałka (auto = 2,5 × dłuższy bok) · Najdłuższa strzałka, do jakiej dąży generator, w komórkach. auto = 2,5 × dłuższy bok. Od 1 do 16 nie wolno: taki limit wcina się w średnie i długie. |
| backbite | tail rework when an arrow gets stuck · When a growing arrow hits a dead end, how many times in a row it may rework its tail and keep growing instead of stopping. 0 = off. More = fewer, longer arrows. | przeróbka ogona, gdy strzałka utknie · Ile razy z rzędu rosnąca strzałka, która trafi w ślepy zaułek, może przerobić swój ogon i rosnąć dalej zamiast się zatrzymać. 0 = wyłączone. Więcej = mniej, ale dłuższych strzałek. |
| pStraight | straightness · How often an arrow keeps going straight instead of turning. Higher = long straight arrows; lower = more bends. Bigger boards need a higher minimum: the mark on the track shows this board's. | prostość · Jak często strzałka jedzie prosto zamiast skręcać. Wyżej = długie proste strzałki; niżej = więcej zakrętów. Większe plansze wymagają wyższego minimum: znacznik na suwaku pokazuje minimum tej planszy. |
| wLateral | sideways step bonus · How much an arrow prefers a step to the side over pushing deeper into the board. 0 = straight pushes and big coils. | premia za krok w bok · Jak bardzo strzałka woli krok w bok niż wchodzenie w głąb planszy. 0 = proste wbicia i duże zwoje. |
| warns | fill nooks first · How strongly an arrow fills small dead-end nooks before moving on. Higher = fewer, longer, more coiled arrows. Below 4 big boards need more straightness. | najpierw zakamarki · Jak mocno strzałka najpierw wypełnia małe ślepe zakamarki. Wyżej = mniej strzałek, dłuższe i bardziej zwinięte. Poniżej 4 duże plansze wymagają większej prostości. |
| anticoil | coil penalty · How strongly an arrow avoids touching itself. 1 = off. Higher = fewer coils, slightly shorter arrows. Above 6 big boards need more straightness. | kara zwojów · Jak mocno strzałka unika dotykania samej siebie. 1 = wyłączone. Wyżej = mniej zwojów, nieco krótsze strzałki. Powyżej 6 duże plansze wymagają większej prostości. |
| headBias | arrow start (-1 layers, 0 random, 1 tunnels) · Where each new arrow starts while the board is built: from the edges inwards (layers, easier, more bends), anywhere (random) or deep inside (tunnels, harder). All three fill boards up to 400×400. | start strzałek (-1 warstwy, 0 losowo, 1 tunele) · Skąd startuje każda nowa strzałka podczas budowania planszy: od krawędzi do środka (warstwy, łatwiej, więcej zakrętów), gdziekolwiek (losowo) albo w głębi (tunele, trudniej). Wszystkie trzy wypełniają plansze do 400×400. |
| mix | share of tunnel starts (mix) · With the mixed start: the share of arrows that start as tunnels, 0.3 to 0.7; the rest start as layers. | udział startów tunelami (mieszane) · Przy starcie mieszanym: jaka część strzałek startuje tunelami, od 0,3 do 0,7; reszta warstwami. |
| trapBias | traps (arrows that look free but are not) · A trap is an arrow blocked by exactly one other: it looks free but is not. Seek = a quarter to a half more traps; avoid = a third to an eighth as many; normal = the generator's own. The report counts them as traps. | pułapki (strzałki, które wyglądają na wolne) · Pułapka to strzałka zablokowana przez dokładnie jedną inną: wygląda na wolną, ale nie jest. „Szukaj” = o ćwierć do połowy więcej pułapek; „unikaj” = od trzech do ośmiu razy mniej; „normalnie” = tyle, ile da generator. Raport liczy je jako pułapki. |
| probe | share of arrows with a target length · How many arrows get a length close to one target (the next row) instead of the short/medium/long mix. 1 with target 12 = a board of short arrows only. | udział strzałek o zadanej długości · Jaka część strzałek dostaje długość bliską jednej zadanej (wiersz niżej) zamiast mieszanki krótkich, średnich i długich. 1 przy długości 12 = plansza z samych krótkich strzałek. |
| probeLen | target length · The target length in cells, give or take half. Short targets (4) triple the number of arrows; long ones (200) give fewer, longer arrows. | zadana długość · Zadana długość w komórkach, plus minus połowa. Krótka (4) potraja liczbę strzałek; długa (200) daje mniej, dłuższych. |
| giants | number of skeleton arrows (0 = no skeleton) · How many very long arrows are laid first, snaking across the board. 0 = no skeleton; 4 is a good start. | liczba strzałek szkieletu (0 = bez szkieletu) · Ile bardzo długich strzałek układa się najpierw, wężykiem przez planszę. 0 = bez szkieletu; 4 to dobry początek. |
| giantSpan | skeleton length (in board sides) · The target length of one skeleton arrow, in board sides. It stops earlier when it runs out of room. | długość szkieletu (w bokach planszy) · Zadana długość jednej strzałki szkieletu, w bokach planszy. Kończy wcześniej, gdy zabraknie miejsca. |
| giantStep | gap between skeleton runs (random = free) · Cells between the back-and-forth runs of a skeleton. Small = tight, regular stripes; large = a few long highways. random = no back and forth: the skeleton grows freely. | przerwa między biegami szkieletu (losowo = swobodnie) · Komórki między kolejnymi biegami szkieletu tam i z powrotem. Mała = gęste, równe pasy; duża = kilka długich autostrad. „losowo” = bez wężyka: szkielet rośnie swobodnie. |
| giantJitter | cutting skeleton runs short · How often a skeleton run turns back before it reaches an obstacle. 0 = straight, regular edges. | urywanie biegów szkieletu · Jak często bieg szkieletu zawraca, zanim dojdzie do przeszkody. 0 = proste, równe brzegi. |
| wGiant | chance of more skeletons later · The chance that an arrow laid later also becomes a skeleton arrow. At the top of the range (0.2) boards get slow, and 1000×1000 may not fill. | szansa na kolejne szkielety · Szansa, że strzałka układana później też stanie się strzałką szkieletu. Przy górnej granicy (0,2) plansze liczą się wolno, a 1000×1000 może się nie wypełnić. |
| giantStraight | skeleton straightness · How often a skeleton arrow keeps straight where it grows freely: all of it when the run gap is random, only its tail otherwise. 0.5 = no preference. | prostość szkieletu · Jak często strzałka szkieletu jedzie prosto tam, gdzie rośnie swobodnie: cała przy przerwie „losowo”, inaczej tylko ogon. 0,5 = bez preferencji. |
| giantAnticoil | skeleton coil penalty · The coil penalty for skeleton arrows only. Whichever is higher, this or the coil penalty in the shape group, applies. | kara zwojów szkieletu · Kara zwojów tylko dla strzałek szkieletu. Obowiązuje wyższa z tej i kary zwojów z grupy „kształt”. |
| giantSpacing | skeleton spacing · How many cells a skeleton keeps from its own earlier runs. off = it may touch them. | odstęp szkieletu · Ile komórek szkielet trzyma od swoich wcześniejszych biegów. „bez odstępu” = może ich dotykać. |
| headTries | start spots tried per direction · How many starting spots the generator tries before it turns to another direction. At 2 the search is shallow for hard settings; from 8 up you usually get the same board as at 4. | próby startu na kierunek · Ile miejsc startu generator sprawdza, zanim zmieni kierunek. Przy 2 szukanie jest płytkie dla trudnych ustawień; od 8 w górę zwykle wychodzi ta sama plansza co przy 4. |
| absorbLimit | merge leftovers up to N cells · An empty patch up to this many cells that no arrow fits into is merged into a neighbouring arrow. Near the bottom of the range leftovers pile up and boards get stuck far more often. | doklejaj resztki do N komórek · Pusta łatka do tylu komórek, w którą nie wejdzie żadna strzałka, zostaje doklejona do sąsiedniej. Blisko dolnej granicy resztki się piętrzą i plansze znacznie częściej utykają. |
| maxBack | backtrack budget · How many placed arrows the generator may take back in one attempt before starting over. 200 is enough; more only delays the answer. | budżet nawrotów · Ile ułożonych strzałek generator może cofnąć w jednej próbie, zanim zacznie od nowa. 200 wystarcza; więcej tylko opóźnia wynik. |
| restarts | allowed restarts · How many fresh attempts after a failed one, each with a seed made from yours. 0 shows how often these settings succeed on their own. | dopuszczalne restarty · Ile nowych prób po nieudanej, każda z ziarnem wyliczonym z Twojego. 0 pokazuje, jak często te ustawienia udają się same. |

W and H keep their texts.

Sources for the numbers: `pStraight`'s mark is the `straightFloor` bound the
slider already draws (`ruleBound`); "below 4" and "above 6" are the
`straightFloor` couplings (`RULE_REASONS.straightFloor`, `straightFloor()`);
the trap factors are the measured 1.24–1.61× (seek) and 0.13–0.31× (avoid) of
`docs/superpowers/measurements/2026-09-12-r1-r2-measurements.md`; `headTries`,
`absorbLimit` and `wGiant` restate the README's own knob table rows, which the
README guard already holds to reachable values. The removed clauses are
`pStraight` "below 0.6 … 0.65 is safe" (0.6 is the minimum and 0.65 is below
the floor past 700), `warns` "below 2", `anticoil` "above 10", `mix` "--start
… -1", `trapBias` "off is today", `giantSpacing` "above 3", `headTries` "1 …
above 16", `absorbLimit` "below 12", `maxBack` "--maxback=auto spells 200",
`restarts` "more than 5" and `giantStraight` "step 0".

### The start control (`start.*`)

| key | EN | PL |
|---|---|---|
| `start.label` | arrow start | start (=) |
| `start.help` | Where each new arrow starts while the board is built. Tunnels: deep inside, so arrows end up buried behind others (harder). Layers: from the edges inwards (easier, more bends). Random: anywhere. Mix: a share of tunnels among layers. | Skąd startuje każda nowa strzałka podczas budowania planszy. Tunele: w głębi, więc strzałki są zakopane za innymi (trudniej). Warstwy: od krawędzi do środka (łatwiej, więcej zakrętów). Losowo: gdziekolwiek. Mieszane: część tuneli wśród warstw. |
| `start.options` | layers / random / tunnels / **mix** | warstwy / losowo / tunele / **mieszane** |
| `simple.harder` | Want it harder? In Advanced, pick a tunnels preset, or set arrow start to tunnels in the “difficulty” group. | = |

### Groups

| key | EN | PL |
|---|---|---|
| `groups.closing` | when stuck | gdy utknie |
| `groupHelp.lengths` | Arrows come in three sizes: short (2–6 cells), medium (7–15) and long (16 up to the longest). Set the shares of short and medium; long gets the rest. | Strzałki są trzech rozmiarów: krótkie (2–6 komórek), średnie (7–15) i długie (od 16 do najdłuższej). Ustaw udział krótkich i średnich; długie dostają resztę. |
| `groupHelp.shape` | How arrows bend while the board is built: straight runs, side steps, coils. The settings multiply, so one extreme value drowns out the rest. | Jak strzałki skręcają podczas budowania planszy: proste odcinki, kroki w bok, zwoje. Ustawienia się mnożą, więc jedna skrajna wartość zagłusza resztę. |
| `groupHelp.difficulty` | How hard the finished puzzle is: where arrows start, how many traps, and a share of arrows with a target length. Some of these change the look too. | Jak trudna będzie gotowa łamigłówka: skąd startują strzałki, ile pułapek i część strzałek o zadanej długości. Część z nich zmienia też wygląd. |
| `groupHelp.skeleton` | A few very long arrows laid first, snaking back and forth across the whole board; the rest fills in around them. The only way to get really long arrows. | Kilka bardzo długich strzałek układanych na początku, wężykiem przez całą planszę; reszta wypełnia miejsce wokół nich. Jedyny sposób na naprawdę długie strzałki. |
| `groupHelp.closing` | What the generator does when it gets stuck. The defaults fill every board up to 400×400; change these only to experiment. | Co robi generator, gdy utknie. Domyślne wypełniają każdą planszę do 400×400; zmieniaj je tylko eksperymentalnie. |

"Some of these change the look too": the start mode changes bends (engine,
the mixing comment in `carve`) and the target share changes lengths.

### Reasons, rules and violations

| key | EN (`INACTIVE_REASONS`, `RULE_REASONS`, `EN.ui`) | PL |
|---|---|---|
| `skeletonOff` | needs skeletons > 0 or late chance > 0 | wymaga: szkielety > 0 albo kolejne > 0 |
| `probeOff` | needs target share > 0 | wymaga: ile zadanych > 0 |
| `stepZero` | no effect while the run gap is random | bez wpływu przy przerwie „losowo” |
| `anticoilWins` | only acts above the shape group's coil penalty | działa dopiero powyżej kary zwojów z grupy „kształt” |
| `sharesSum` | short + medium must be at most 0.9 (90%) | krótkie + średnie najwyżej 0,9 (90%) |
| `lmaxHole` | longest arrow must be auto or at least 17 | najdłuższa strzałka: auto albo co najmniej 17 |
| `startPair` | arrow start and tunnel share do not fit together: a mixed start needs random start and a share of 0.3 to 0.7; any other start needs the share off (-1) | start strzałek i udział tuneli do siebie nie pasują: start mieszany wymaga startu losowego i udziału od 0,3 do 0,7; każdy inny start wymaga wyłączonego udziału (-1) |
| `straightFloor` | straightness is too low for this board: bigger boards, nooks first below 4 or a coil penalty above 6 all need more | za mała prostość jak na tę planszę: większa plansza, zakamarki poniżej 4 albo kara zwojów powyżej 6 wymagają więcej |
| `needsSkeleton` | = `skeletonOff` | = `skeletonOff` |
| `needsProbe` | = `probeOff` | = `probeOff` |
| `depProbe` | target length | zadana długość |
| `mixCap` | short + medium: at most 90% | krótkie + średnie: najwyżej 90% |
| `ruleBound(n)` | Minimum for this board: n | Minimum dla tej planszy: n |
| `rangeViolation` | {label}: {value} — allowed {min} to {max} | {label}: {value} — dozwolone od {min} do {max} |
| `stepViolation` | {label}: {value} is not an allowed step; the nearest are {below} and {above} | {label}: {value} to niedozwolony krok; najbliższe to {below} i {above} |
| `needViolation` | {reason}; this board needs at least {need} (=) | = |
| `cmdBroken` | invalid settings | błędne ustawienia |

`startPair` is reached only by a link or a pasted command (the start control
writes valid pairs); the CLI prints the same text for `--start`.

## View panel

| key | EN | PL |
|---|---|---|
| `railElement` | look | wygląd |
| `preview` | = (Preview) | = (Podgląd) |
| `docsElement` | Board element | Element planszy |
| `previewPoints` | dots | kropki |
| `strokeLabel` | line thickness (cells) | grubość linii (komórki) |
| `viewShortStroke` | thickness | grubość (=) |
| `strokeHelp` | How thick the arrows are, as a share of a cell. 0.2 = a hairline; 0.9 = fills the cell and leaves the arrowhead no room. | Grubość strzałek jako część komórki. 0,2 = cienka kreska; 0,9 = wypełnia komórkę i nie zostawia miejsca na grot. |
| `headWidthLabel` | arrowhead width (cells, auto = fits the line) | szerokość grotu (komórki, auto = do linii) |
| `headWidthHelp` (new) | How wide the arrowhead is, in cells. auto picks a width that suits the line's thickness. An arrowhead narrower than the line is widened to it. | Szerokość grotu w komórkach. auto dobiera szerokość do grubości linii. Grot węższy od linii zostaje do niej poszerzony. |
| `headHeightLabel` | arrowhead length (cells) | długość grotu (komórki) |
| `viewShortHeadHeight` | head length | dł. grotu |
| `headHeightHelp` (new) | How long the arrowhead is, measured along the arrow, in cells. 0 = no arrowhead. | Długość grotu wzdłuż strzałki, w komórkach. 0 = bez grotu. |
| `rounded` | round the corners (and the tail) (=) | = |
| `roundedHelp` | Rounds the corners where an arrow turns, and rounds off its tail. | Zaokrągla rogi, na których strzałka skręca, i zaokrągla jej ogon. |
| `colored` | colour the arrows (each a different colour) | koloruj strzałki (każda innym kolorem) |
| `coloredHelp` | Gives every arrow a colour of its own: from your palette, else from the theme, else automatic colours. | Każda strzałka dostaje własny kolor: z Twojej palety, inaczej z motywu, inaczej automatycznie. |
| `highlightLongest` | highlight the longest arrows | wyróżnij najdłuższe strzałki |
| `viewShortHighlightLongest` | mark longest | najdłuższe (=) |
| `highlightLongestHelp` | Draws the longest arrows in the highlight colour, on top of the rest. | Rysuje najdłuższe strzałki kolorem wyróżnienia, na wierzchu pozostałych. |
| `viewShortTop` | how many | ile najdł. (=) |
| `topHelp` | How many of the longest arrows the highlight marks. 0 marks none. | Ile najdłuższych strzałek zaznacza wyróżnienie. 0 nie zaznacza żadnej. |
| `needsHighlightLongest` | turn on mark longest | włącz „najdłuższe” |
| `voids` | show empty cells | pokaż puste komórki |
| `viewShortVoids` | empty cells | puste kom. |
| `voidsHelp` | Marks the cells left empty when the generator got stuck. You only see them on an incomplete board. | Zaznacza komórki, które zostały puste, gdy generator utknął. Widać je tylko na niepełnej planszy. |
| `showPoints` | show the dot grid | pokaż siatkę kropek |
| `viewShortShowPoints` | dot grid | kropki (=) |
| `showPointsHelp` | Draws one dot per cell under the arrows, like the ruling of a notebook page. | Rysuje po kropce na komórkę pod strzałkami, jak linie w zeszycie. |
| `pointColorHelp` | Colour of the dot grid. | Kolor siatki kropek. |
| `needsPoints` | turn on dot grid | włącz „kropki” |
| `themeHelp` | A ready colour set: background, arrow colour, highlight and the multicolour palette. What you set below overrides it. | Gotowy zestaw kolorów: tło, kolor strzałek, wyróżnienie i paleta wielobarwna. To, co ustawisz niżej, ma pierwszeństwo. |
| `paperHelp` | The board's background colour. Set, it overrides the theme; cleared, the theme's returns. Changes the preview only, not the CLI command or the downloaded file. | Kolor tła planszy. Ustawiony zastępuje motyw; wyczyszczony przywraca kolor z motywu. Zmienia tylko podgląd, nie polecenie CLI ani pobrany plik. |
| `paperClear` | clear the background, back to the theme | wyczyść tło, z powrotem do motywu (=) |
| `inkLabel` | arrow colour | kolor strzałek |
| `viewShortInk` | arrow colour | kolor strz. |
| `inkHelp` | The colour of every arrow while multicolour is off. Set, it overrides the theme; cleared, the theme's returns. Changes the preview only, not the CLI command or the downloaded file. | Kolor wszystkich strzałek, gdy wielobarwne jest wyłączone. Ustawiony zastępuje motyw; wyczyszczony przywraca kolor z motywu. Zmienia tylko podgląd, nie polecenie CLI ani pobrany plik. |
| `inkClear` | clear the arrow colour, back to the theme | wyczyść kolor strzałek, z powrotem do motywu |
| `highlightColorHelp` | The colour of the longest arrows and the empty cells. Set, it overrides the theme; cleared, the theme's returns. Changes the preview only, not the CLI command or the downloaded file. | Kolor najdłuższych strzałek i pustych komórek. Ustawiony zastępuje motyw; wyczyszczony przywraca kolor z motywu. Zmienia tylko podgląd, nie polecenie CLI ani pobrany plik. |
| `paletteHelp(cap)` | Your own colours for multicolour arrows, up to {cap}. A chosen theme still supplies everything you do not set. | Własne kolory dla wielobarwnych strzałek, najwyżej {cap}. Wybrany motyw nadal daje wszystko, czego nie ustawisz. |
| `svgThemeNote` | The downloaded SVG uses its own default colours; the chosen theme is not included. | Pobrany SVG ma własne domyślne kolory; wybrany motyw nie jest w nim uwzględniony. |

To check while implementing, and drop the clause if false: `headHeight` 0
draws no arrowhead (render one board at 0 in the lab); the voids layer draws
nothing on a complete board.

## Statuses, library and the rest

| key | EN | PL |
|---|---|---|
| `closed` | Board complete: every cell filled. | Plansza pełna: wszystkie komórki wypełnione. |
| `notClosedStatus(r, n, l)` | The board could not be filled: at best {r} cells stayed empty, in {n} patches (largest {l}). Try another seed or more straightness. | Nie udało się wypełnić planszy: w najlepszym razie {r} komórek zostało pustych, w {n} łatkach (największa {l}). Spróbuj innego ziarna albo większej prostości. |
| `notClosed` | incomplete | niepełna |
| `notClosedShort` | Board incomplete. | Plansza niepełna. |
| `progress` / `progressRest` | {n} arrows · … (backtracks stays) | {n} strz. · … (nawroty zostają) |
| `piecesShort(n)` | {n} arrows | {n} strz. |
| `longestShort(n)` | = | najdłuższa {n} |
| `inspectHint` | Choose an arrow to inspect it. | Wskaż strzałkę, aby ją zbadać. |
| `pieceFacts` | Arrow #{id} · … | Strzałka #{id} · … |
| `pieceFree` | = | wolna |
| `pieceBlocked` | = | zablokowana przez #{id} … |
| `noStoreServer` | No store server: pnpm nx serve lab starts one, or run deno task store. | Brak serwera magazynu: pnpm nx serve lab uruchamia go sam, albo uruchom deno task store. |
| `generationError` | = | Błąd generowania: |
| `savedBoard` | = | … generowanie {gen}. |
| `title`, `subtitle` | deleted (no reader in `apps/lab/src`; the plan confirms by grep) | deleted |

"Try another seed or more straightness": a different seed and a higher
`pStraight` are the two levers the `straightFloor` rule and `restarts` rest on.

## CLI help (`command.ts`)

| flag | new description |
|---|---|
| `--length=R` | arrow length, 0 = very short, 1 = very long (default 0.75) |
| `--winding=R` | winding, 0 = straightest, 1 = most winding (default 0.5) |
| `--skeleton` | a skeleton of very long arrows first |
| `--count=N` | N complete boards on the seeds from --seed up; a seed whose board does not fill is skipped |
| `--arrow-height=R` | arrowhead length along the arrow, in cells (default …) |
| `--colored` | a different colour for every arrow |
| `--top=N` | highlight the N longest arrows and print their stats |
| `--start` row label | where an arrow starts, and the tunnel share |
| `--start` row help | Where each new arrow starts while the board is built: from the edges inwards (layers, easier), anywhere (random) or deep inside (tunnels, harder). A number in 0.3..0.7 mixes the two instead: the share of arrows that start as tunnels. |
| environment line | CARVE_TIMEOUT_S=N (abort after N seconds; the board built so far is stored as incomplete). |

Out of scope: the CLI's runtime messages (`failed to close board …`, the
trace lines). The README's "When something goes wrong" quotes them verbatim.

## READMEs

- `## Word list` and `## Słowniczek` are rewritten from the glossary table:
  arrow (in code *piece*), arrowhead / grot (the tip; in code *head*), path to
  edge / droga do krawędzi (in code *corridor*), free, seed, skeleton (in code
  *giants*), layers / tunnels, stuck / utknąć (the generator), complete /
  pełna, trap / pułapka, target length / zadana długość (in code *probe*), safe
  range. The sentence "The code and the English text call it a *piece*; the
  Polish text calls it an *element*" goes.
- Prose and the knob and rule tables use the glossary words (piece, closes,
  squares, highway, jam and their Polish counterparts). Flag names, JSON
  fields (`"pieces": 87`), quoted CLI output and error messages stay verbatim.
- The README guard (`packages/cli/readme.test.ts`) stays as it is; the rows'
  warnings keep naming only values their flag takes.

## The guard: `packages/engine/glossary.test.ts`

What it reads:

- every string leaf of `EN` and `PL`, and every function leaf called with
  `fn.length` arguments of `2` (templates only interpolate them);
- `PARAM_SPEC` labels and helps, `INACTIVE_REASONS`, `RULE_REASONS`,
  `PL.params`, `PL.reasons`, `PL.choices`, `EN_CHOICES`;
- `helpText({ knobs: true })` with flag names (`--[a-z-]+`) and environment
  names (`[A-Z_]{3,}`) removed first.

What it refuses (whole words, case-insensitive):

- English: `piece(s)`, `close / closed / closes / closing`, `jam(s/med)`,
  `giant(s)`, `probe(s)`, `carve / carved / carves / carving`, `anticoil`,
  `paper`, `ink`, `grid unit(s)`, `serpentine`, `backbite`, `corridor`,
  `fragment(s)`, `absorb*`, `lateral`, `jitter`, `golden-angle`, `knob(s)`.
- Polish: `element*` (whole word stems: element, elementy, elementów, …),
  `domkn*`, `zaklin*`, `zacina*`, `zacię*`, `sond*`, `wycię*`, `wycin*`,
  `prostota`, `podziałk*`, `papier*`, `tusz*`, `kolor rysunku`, `antyzwij*`,
  `wchłan*`, `serpentyn*`, `kubeł*`, `koszyk*`, `fragment*`, `generacj*`,
  `pokrętł*`.
- In the lab's own strings and `PARAM_SPEC` help (not in `helpText`): any
  `--flag`.

Allowed, listed in the test with one line of reason each: `ui.cmdHintClose`
("close" the palette), `ui.cmdPlaceholder` ("knob" in the palette's search
hint), `ui.docsElement` (PL "Element planszy", the web component's name),
`ui.storeEmpty` (`deno task carve`), `ui.noStoreServer` (task names). A failing
case names the dictionary path (`PL.ui.voidsHelp`) and the word.

The guard runs in `deno task test` like `neutral.test.ts`. A mutation check:
putting "piece" back into one EN help and "element" into one PL help each
turns it red, naming that key.

## Tests

- Tests that pin a changed string are updated to the new text; the plan lists
  them by grep over `packages/` and `apps/lab/src` for each old string.
- `lab-i18n.test.ts`: short labels ≤ 12 characters (existing, now covers the
  new ones); `choiceText('trapBias', 'off')` is "normal" in English and
  "normalnie" in Polish, `choiceText('giantStep', 'random')` is "losowo" in
  Polish; the command text still spells `--trapbias=off`.
- `ValueKnob`: the `giantStep` special chip reads "losowo" in Polish (text and
  `aria-label`), and choosing it still writes 0.
- `viewFields`: head width and head height rows point at different help keys;
  no row uses a deleted unit key (the compiler enforces it once `units` is
  gone).
- `PresetStrip`: the caption is present in both languages; each mode button's
  accessible description is its mode's text; the twenty-six accessible names
  stay distinct; the existing centring test stays green.
- `BoardList`: a row reads "{n} arrows" / "{n} strz.".
- `command.test.ts` / CLI help tests: the updated flag lines.

## Live pass

In Chrome, EN and PL, at 1440×900 and at 375×812 with touch: the preset panel
(caption, a mode's description on hover), the rail with "when stuck" / "gdy
utknie" and "look" / "wygląd", every knob row's short label and unit without
truncation (`× side`, `× bok`, `strz.` in the 44 px value track), the trap
choice reading "normal" / "normalnie", the `giantStep` chip reading "losowo",
the view panel's rows, an incomplete board's status line (a small
`CARVE_TIMEOUT_S`-style abort or a 1000×1000 with restarts 0), and the saved
boards' list. Run against a copy of the store (`ARROWZ_BOARDS_DIR`).

## Out of scope

- The CLI's runtime messages and trace output.
- `ui.reset` "Defaults" (an action label, not a glossary term).
- The preset level names (Easy … Insane) themselves; the caption explains
  them.
- W's timing sentence ("1000×1000 takes about ten"), which is about speed,
  not vocabulary.
