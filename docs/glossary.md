# Glossary

Arrowz uses one word for each concept in everything a player reads: the lab,
the board element, the command line's help and the lab's Docs tab, in English
and in Polish. This page lists those words, the names the code uses for them,
and the retired words that must not come back.

## Words

Where the [main README](../README.md#words) or the
[command line's README](../packages/cli/README.md#words) defines a word, the
last column links there. The code keeps its own names: keys, flags, JSON
fields and stored boards never change with the wording.

| English | Polish | In code | Meaning |
|---|---|---|---|
| arrow | strzałka | `piece` | [README](../README.md#words) |
| arrowhead | grot | `head` | [README](../README.md#words) |
| path to edge | droga do krawędzi | `corridor` | [README](../README.md#words) |
| free | wolna | – | [README](../README.md#words) |
| seed | ziarno | `seed` | [README](../README.md#words) |
| cell | komórka (kom.) | – | One square of the board; also the unit of lengths and of the look's sizes. |
| complete, filled | pełna, wypełniona | `ok` | [CLI README](../packages/cli/README.md#words) |
| stuck | utknąć | – | [CLI README](../packages/cli/README.md#words) |
| lay, place | układać | `carve` | What the generator does with each new arrow. |
| backtrack | nawrót | `maxBack` | Taking placed arrows back after getting stuck. |
| skeleton | szkielet | `giants` | [CLI README](../packages/cli/README.md#words) |
| run, run gap | bieg, przerwa | `giantStep` | The back-and-forth stretches of a skeleton arrow, and the cells between them. |
| layers, random, tunnels, mix | warstwy, losowo, tunele, mieszane | `headBias`, `mix` | Where arrows start; see [CLI README](../packages/cli/README.md#words). |
| trap | pułapka | `trapBias` | [CLI README](../packages/cli/README.md#words) |
| target length, target share | zadana długość | `probeLen`, `probe` | [CLI README](../packages/cli/README.md#words) |
| short, medium, long | krótkie, średnie, długie | `wShort`, `wMid` | The three sizes of arrow. |
| straightness | prostość | `pStraight` | How often an arrow goes straight instead of turning. |
| winding | krętość | – | The simple view's shape slider: how much arrows bend. |
| coil penalty | kara zwojów | `anticoil` | Discourages an arrow from curling up against itself. |
| sideways | ruch w bok | `wLateral` | A step along the edge rather than inwards. |
| nook | zakamarek | `warns` | A dead-end pocket the generator fills first. |
| tail rework | przeróbka ogona | `backbite` | A stuck arrow reworks its tail and grows on. |
| cut short | urywanie | `giantJitter` | A skeleton run turning back early. |
| empty patch, leftover | pusta łatka, resztka | `absorbLimit` | Empty cells no new arrow fits; a neighbouring arrow takes them over. |
| safe range | bezpieczny zakres | `PARAM_SPEC` bounds, `RULES` | [CLI README](../packages/cli/README.md#words) |
| setting | ustawienie | – | One control of the generator; the command line says *knob*. |
| look | wygląd | `preview` | The lab's visual settings. |
| background | tło | `paper` | The board's background colour. |
| arrow colour | kolor strzałek | `ink` | The colour of every arrow while multicolour is off. |
| automatic colours | automatycznie | `hueOf` | Colours spread around the colour wheel, one per arrow. |
| dot grid | siatka kropek | `showPoints` | One dot per cell under the arrows. |

## Retired words

A test refuses these words, matched as whole words and in any case. Each one
names something the table above already has a word for.

| Retired (English) | Use instead |
|---|---|
| piece | arrow |
| close, closed, closing | complete, filled |
| jam, jammed | stuck |
| giant | skeleton |
| probe | target length, target share |
| carve | lay, place |
| anticoil | coil penalty |
| paper | background |
| ink | arrow colour |
| grid unit | cell |
| serpentine | winding skeleton, run |
| backbite | tail rework |
| corridor | path to edge |
| fragment | empty patch |
| absorb | take over, merge |
| lateral | sideways |
| jitter | cut short |
| golden-angle | automatic colours |
| point grid | dot grid |
| knob (in the lab only) | setting |

| Retired (Polish) | Use instead |
|---|---|
| element (for an arrow) | strzałka |
| domknięta, domykanie | pełna, wypełniona |
| zaklinować, zacinać, zacięcie | utknąć |
| sonda | zadana długość |
| wycięcie, wycinać | układać, nawrót |
| prostota | prostość |
| podziałka | komórka (kom.) |
| papier | tło |
| tusz, kolor rysunku | kolor strzałek |
| antyzwijanie | kara zwojów |
| wchłanianie | doklejać, zajmować |
| serpentyna | kręty szkielet, bieg |
| kubeł, koszyk | rozmiar: krótkie, średnie, długie |
| fragment | łatka, resztka |
| generacja | generowanie |
| pokrętło | ustawienie |
| siatka punktów | siatka kropek |

## What the test checks

`packages/engine/glossary.test.ts` keeps the retired words out of what a
player reads. It reads:

- every string of the lab's dictionaries, `EN`, `EN_CHOICES` and `PL` in
  `lab-i18n.ts`, with each template called on sample arguments;
- the label and help of every setting in `PARAM_SPEC`, and
  `INACTIVE_REASONS`;
- `RULE_REASONS`, which the command line prints too;
- the command line's help, `helpText({ knobs: true })`;
- the Docs tab: the table descriptions from `docsFor` in `lab-docs.ts` and the
  pages in `apps/lab/docs-content/en` and `pl`.

Code is not prose, so the test blanks it first: code spans, fenced blocks,
heading ids, directive lines and link targets in the Docs pages, and flag,
environment and group names (`--start`, `CARVE_TIMEOUT_S`) in the help. The
command `deno task carve` is a name, not a word: the help and the Docs pages
blank it, and the one dictionary key that quotes it is an exception.

Two words belong to the command line. *Knob* is its word for a setting (its
"Knobs." section and "knob" column), so `RULE_REASONS`, `helpText` and the CLI
Docs page may use it, and the lab's own strings may not; the Polish CLI page
may say *pokrętło* for the same reason. A `--flag` is the command line's
spelling, so the lab's strings and the Docs pages, in either language, never
quote one outside code.

The generator's internal names (`giants`, `probe`, `piece`, `corridor`) stay
in code, flags, JSON fields, board files and the CLI README's
[Words](../packages/cli/README.md#words) section, which names them on purpose.

## Exceptions

An exception names its dictionary path and why, in the test's `ALLOWED` table.
Today they are:

- `ui.cmdHintClose`: "close" the palette, a verb about the dialog.
- `ui.cmdPlaceholder`: "knob" / "pokrętła" in the palette's search hint, where
  a developer types.
- `ui.storeEmpty`: the command `deno task carve`.
- Polish `ui.docsElement` and a few Docs table rows: *element* names the web
  component ("Element planszy"), not an arrow.

On the Polish board element Docs page the singular *element* names the
component too, while the plural forms (elementy, elementów, …) stay refused,
because the component's name never takes them (`plFor` in the test).
