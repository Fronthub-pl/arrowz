# The lab's documentation, rewritten from the READMEs — design

The Docs tab today has two pages: `/docs/element`, the reference tables of
`<arrowz-board>`, and `/docs/cli`, the raw `--help` and `--help=knobs` blocks.
Everything that explains — the puzzle, the lab itself, what each setting does,
how the element pans, plays and colours — lives only in four READMEs, and the
element page ends with a note pointing there.

This design moves that explanation into the lab, in both languages, rewritten
for a reader rather than copied: four pages that follow the four READMEs, live
boards where the READMEs have pictures, and tables built from code where the
READMEs have tables.

## 1. What the reader gets

### 1.1 Four pages

| Page | Address | Source | Left out (stays in the README only) |
|---|---|---|---|
| Arrowz | `/docs/arrowz` | `README.md` | the repository map, Contributing, Licence |
| Lab | `/docs/lab` | `apps/lab/README.md` | Starting it (ports, Nx), Screenshots, Development |
| Command line | `/docs/cli` | `packages/cli/README.md` | nothing of substance |
| Board element | `/docs/element` | `packages/board-element/README.md` | Development, the demo's inspector |

The audience is someone using the lab, the CLI or the element, not someone
contributing to the repository; what serves only a contributor stays in the
README.

`/docs` goes to `/docs/arrowz` (today `/docs/element`). `/docs/element` and
`/docs/cli` keep their addresses. Any other page name redirects to
`/docs/arrowz`, as an unknown name redirects to `/docs/element` today.

### 1.2 Sections

Each page's `##` headings are its sections, and the navigation column lists
them under the page, in two levels, as today. `###` headings are subsections on
the page and do not appear in the column.

- **Arrowz** — The puzzle · The one rule · What the generator promises · Words.
- **Lab** — The board store · Simple and advanced · When a setting breaks a
  rule · Generating and saving · The report · Saved boards and files · The
  board · Keys · The command palette · Links.
- **Command line** — Getting started (Deno and a first board, from the root
  README's Quick start) · Making boards (a picture, five things to try, many
  boards at once, describing without saving, a board that is not complete, the
  measurements report, asking for something impossible) · Everyday settings ·
  Every knob (when a knob meets an everyday flag, the knob table, what some of
  them look like, combinations that are refused) · Where boards are saved ·
  Environment variables · A standalone program · When something goes wrong ·
  Words · What `--help` prints.
- **Board element** — Using it · Properties · Methods and getters · Events ·
  Controls (mouse, pen, touch) · Zoom and pan · Size, and values the board
  cannot draw · The margin · The dot grid · Riding the track · Slots · Playing
  the board · Themes · The WebGL context · Exports.

### 1.3 Prose

Rewritten, not pasted:

- The glossary of `2026-09-25-lab-glossary-design.md` holds: arrow, arrowhead,
  path to the edge, complete, stuck, skeleton, target length; never piece,
  element (PL), closed, giant, probe in prose. Keys, flags and identifiers keep
  their code names inside code spans.
- Short sentences. A setting is described as what it does, what changes when it
  moves, and when it breaks (`Careful:` / `Uwaga:`), the pattern the knob help
  already follows.
- No history: "the first line used to be the whole story", "five knobs from an
  earlier version" and the like are left out.
- English is the source and Polish the translation, as for the dictionary.

### 1.4 What goes away

- The note "the long explanations live in the package README"
  (`readmePointer` in `lab-docs.ts`): they now live here. It goes with PR 5,
  the one that brings those explanations; until then PR 1 carries it as a
  blockquote (§3.1).
- `DOCS_SECTIONS` in `DocsNav.tsx`: the column is derived from the pages.

The raw help stays, as the CLI page's last section, "What `--help` prints":
both forms, uncoloured, with Copy, rendered from `helpText()` as today.

## 2. The content files

### 2.1 Markdown with directives

The prose lives in Markdown, one file per page and language:

```text
apps/lab/docs-content/en/arrowz.md   apps/lab/docs-content/pl/arrowz.md
apps/lab/docs-content/en/lab.md      apps/lab/docs-content/pl/lab.md
apps/lab/docs-content/en/cli.md      apps/lab/docs-content/pl/cli.md
apps/lab/docs-content/en/element.md  apps/lab/docs-content/pl/element.md
```

The lab imports them as `?raw` and parses each once per session with
`mdast-util-from-markdown`, extended with `micromark-extension-directive` +
`mdast-util-directive` (leaf `::name[label]{attrs}` and container
`:::name … :::`) and `micromark-extension-gfm-table` + `mdast-util-gfm-table`.
These are new dependencies of `apps/lab`; none is in the lockfile today.

The Docs route is loaded with `React.lazy`, so the parser, the content and the
renderer are a chunk of their own and the lab's first load does not grow.

Headings map one level down, because the shell owns `h1`: `#` is the page's
title (`h2`), `##` a section (`h3`), `###` a subsection (`h4`). Deeper is an
error. A literal `<` in prose is written `\<` (an unescaped tag parses as raw
HTML, which the renderer refuses), and a colon followed by a letter or digit
is written `\:` (`10:30` parses as a text directive named `30`; measured with
`micromark-extension-directive` 4.0.0).

### 2.2 Section ids

A heading's directive attributes are not available, so a section carries its id
as a trailing `{#id}` that the renderer strips:

```md
## Everyday settings {#everyday}
```

The id is the same in both languages. It is the target of the navigation
column, the section carried in the router's state (`sectionOf`, unchanged: the
fragment still belongs to the lab's knobs), and the anchor the parity guard
compares (§5.1). A `##` without an id is an error.

### 2.3 Directives

The only non-Markdown in the files. A label in `[…]` is prose and is translated;
every attribute is identical in both languages.

| Directive | Renders |
|---|---|
| `::board[label]{cmd="…" stats="…"}` | one live board (§4) |
| `:::compare{stats="…"}` holding `::board[label]{cmd="…"}` lines | live boards side by side, one stats line under each |
| `::board[label]{cmd="…" manual about="10"}` | a board that waits for a "Generate (about 10 s)" button |
| `::play{board="rule-free"}` | a hand-built board to play (§4.5) |
| `::table{of="…"}` | a table built from code (§2.4) |
| `::help{form="short"}`, `::help{form="knobs"}` | `helpText()`, uncoloured, with Copy |

`cmd` holds the flags only; the page shows them after `deno task carve`
(`COMMAND_PREFIX`).

### 2.4 Tables from code

`::table{of=…}` renders rows from the same sources the READMEs' guards compare
against today. The machine columns are not translated; the description column
is, and it lives in TypeScript dictionaries, not in the Markdown, so the
compiler keeps its EN/PL parity (`as const satisfies Record<Key, string>`).

| `of` | Rows from | Description from |
|---|---|---|
| `knobs` | `KNOB_ROWS` (`command.ts`) | the knob help `dictionary(lang)` gives the lab (English from `PARAM_SPEC`) |
| `rules` | `RULE_ROWS` | the rule reasons `dictionary(lang)` gives the lab (English from `RULE_REASONS`) |
| `env` | a new `ENV_VARS` list in `command.ts`, which `environment()` then joins | `lab-docs.ts` |
| `keys` | `WORKSPACE_KEYS`, `COMMAND_KEYS` (`shell/hotkeys.ts`) | the dictionary's key labels |
| `palette` | `buildCommands(…)`, sections run and go | the commands' own names |
| `link-fields` | `VIEW_KEYS` (`state/viewSchema.ts`) and `lang` | `lab-docs.ts` |
| `element-props`, `element-members`, `element-events`, `element-slots` | `ELEMENT_*` (`lab-docs.ts`) | `lab-docs.ts`, as today |
| `themes` | `THEMES` (`look.ts`) | name, licence and source are machine columns; no prose |
| `element-constants` | the values exported by `@arrowz/board-element` | `lab-docs.ts` |

A description in a table is rendered as inline Markdown, so a code span shows as
code. Today the element tables print the backticks literally (`` `pl` selects
Polish labels ``).

`lab-docs.ts` stays in the engine and under `neutral.test.ts`: its new
descriptions (the environment variables, the link fields, the constants) must
not end a sentence with `Deno` or name the browser's key-value store by its API
name. The Markdown is in `apps/lab` and is not under that rule.

## 3. Rendering

### 3.1 The renderer

Our own, from mdast to React elements: no `innerHTML`, no rehype. It accepts a
fixed set of nodes — heading, paragraph, text, emphasis, strong, inlineCode,
code, list, listItem, table (with row and cell), link, break, blockquote, and
the leaf and container directives of §2.3 — and anything else (raw HTML, a
text directive, an image, a thematic break) is an error the content guard
reports (§5.1), not a silent gap.

A blockquote is a note: the `aside` named "Note" / "Uwaga" with the info glyph
that the element page shows today (`fw-docs-info`).

Links:

- `[…](docs:cli#everyday)` becomes a router `Link` to `/docs/cli`, keeping the
  lab's fragment, with the section in the navigation's state, exactly as the
  column's own links do.
- `https://…` opens in a new tab with `rel="noreferrer"`.
- Anything else is an error.

### 3.2 Colour

The tokens and colours of `codeTokens.ts` (GitHub Dark, `--code-*`) and no new
palette.

| What | Colour |
|---|---|
| ```` ```sh ```` | a new shell scanner: a comment, `deno task carve`, a `--flag`, its `=value`, an `ENV=` prefix |
| ```` ```html ```` | `highlightHtml`, as today |
| ```` ```json ```` | a new JSON scanner: key, string, number, `true`/`false`/`null` |
| ```` ```text ```` and `::help` | none: it is a terminal's output |
| the machine columns of `::table` | `cellTokens`, by the column's role, as today |
| inline code in prose and descriptions | monospace, no colour |
| prose | none |

Every code block keeps `DocsBlock`'s Copy, named after its section, and Copy
writes the source text, not the markup. `codeTokens.test.ts` already holds that
the joined tokens give back the input exactly; the two new scanners join that
test.

### 3.3 The navigation column

`DocsNav` builds its two levels from the parsed pages: each page's name from
the dictionary (`docsArrowz`, `docsLab`, `docsCli`, `docsElement`), its
sections from the `##` headings of the current language. Everything else —
`NavLink` for pages, `Link` with state for sections, `aria-current` in its two
meanings, the single column under 768 — stays as `DocsNav` does it today.
`useSectionInView` is unchanged.

The palette's go-to rows gain "Docs — Arrowz" and "Docs — Lab" beside the two
it has.

## 4. Live boards

### 4.1 From a command to a board

`cmd` goes through `splitCommand` → `parseArgs` → `drawOf`, the path a command
pasted into ⌘K takes, so the page reads flags with the CLI's own code. The view
flags (`--colored`, `--line`, `--arrow-width`, `--arrow-height`, `--sharp`, …)
become a `View`, which `boardViewOf` hands to the element. A board on the page
therefore looks like the CLI's picture of the same command, not like the lab's
current theme.

### 4.2 Generating

A worker of the docs' own (`generate.worker.ts`, the one the lab, the series
and the SVG download already build), apart from the lab's run:

- It never touches the `run` store, so generating on the Docs tab neither stops
  nor replaces the board in the lab.
- A board asks to be generated when its frame comes near the view; requests
  queue in that order, one at a time.
- Results are kept for the session, keyed by `cmd`, so coming back to a page
  shows its boards at once.
- The worker is terminated when the Docs route unmounts.
- `manual` boards (1000×1000, about ten seconds) wait for their button.

### 4.3 Mounting

An `<arrowz-board>` exists only while its frame is in view, with a margin, and
is unmounted when it leaves, which gives up its WebGL context. The CLI page has
about thirty boards and a page gets about sixteen contexts (`<arrowz-board>`
README, "The WebGL context"); mounting on sight is what keeps the page within
that, not an optimisation. The frame takes the board's W:H proportions before
the board exists, so the page does not jump.

A docs board is for looking: it pans and zooms, it does not play.

### 4.4 Under a board

- The label from the Markdown.
- The `stats` named in the directive, as the report drawer shows them: the keys
  are `StatKey`s of `reportRows` (`lab-report.ts`) — `pieces`, `avgLen`,
  `longest`, `f0`, `bends`, `time`, … — with the report's labels and number
  formats. The numbers are measured from the board just made, not written into
  the text.
- The command in `LiveCommand`'s colours, with Copy and **Open in lab**. Open in
  lab goes to `/` with the settings in the lab's link (the same JSON a shared
  link carries) and generates there.
- A board that is not complete says so ("not complete"). A worker that fails
  shows the error and "Try again".

### 4.5 The rule, played

`::play{board=…}` shows one of three boards built by hand in
`apps/lab/src/docs/ruleBoards.ts`, standing in for the hand-drawn
`rule-free`, `rule-blocked` and `rule-shape` pictures:

- `rule-free` — an arrow whose path to the edge is clear;
- `rule-blocked` — the same arrow with another one parked across its path;
- `rule-shape` — a horseshoe around another arrow, still free.

They are coloured and in `play` mode. One line under each answers the element's
events: `piece-removed` → "It left: its path to the edge was clear";
`life-lost` → "It bounced off another arrow". "Start over" calls `restart()`.

The gesture is the element's: a click with ⌘ (Ctrl elsewhere) or a tap, and the
element's own hint says so. The page does not override the player's stored
gesture choice.

## 5. Guards

### 5.1 The content guard

A new `apps/lab/src/docs/content.test.ts` (Vitest, `node` project), per page:

1. Both languages parse, and every node is one the renderer accepts (§3.1).
2. Same `##` ids, in the same order; every `##` has one.
3. The same number of `###` under each section.
4. The same directives, in the same order, with equal attributes; only labels
   differ.
5. Code blocks equal line by line, except lines that are `#` comments in a
   `sh` block, which are prose and translated.
6. The same `docs:` link targets, each naming a page and a section that exist.
7. Every `cmd` parses with no problem (`parseArgs`), carries no `--randomized`
   (a board on the page must be the one its command makes), and a board
   without `manual` is at most 500×500.
8. Every `of`, `board`, `form` and `stats` name exists.

### 5.2 The glossary

`glossary.test.ts` gains two sources it does not read today:

- the prose of the Markdown, code spans and code blocks removed, against the
  retired words of its language. Two exceptions, each the same as one the
  guard already lists: "knob" / "pokrętło" on the CLI page only, the CLI's own
  word (as `ui.cmdPlaceholder`); and on the element page in Polish the
  singular "element", the component's name (as `ui.docsElement`) — the plural
  stays refused, because arrows were the "elementy";
- the descriptions in `lab-docs.ts`, which today say "pieces" and "elementy"
  without anything noticing.

### 5.3 What changes elsewhere

- `apps/lab/src/readme.test.ts` and `apps/lab/README.md`: the screens table
  (`/docs` goes to `/docs/arrowz`; `:what` is `arrowz`, `lab`, `cli` or
  `element`), the palette table (two more go-to rows), the `docs` screenshot.
- `packages/engine/lab-docs.test.ts`: the rows it compares with `mod.ts` are
  unchanged; the frame strings it walks lose `readmePointer` and `infoLabel`.
- The browser tests of `DocsNav`, `DocsLayout`, `ElementDocs` and `CliDocs` are
  rewritten against the renderer.

### 5.4 Browser tests of the new parts

- The renderer: one case per node and per directive.
- The column built from the pages, and a section link that scrolls the panel.
- Scrolling a page with many boards: no more than a fixed number of
  `<arrowz-board>` exist at once, and a board that comes back into view is
  drawn again from the cache, without a second request to the worker.
- Open in lab lands on `/` with the command's settings.
- A rule board: the free arrow leaves, the blocked one bounces, Start over puts
  them back.

## 6. Delivery

Five pull requests, stacked, each with its bead, each worth looking at alone.

1. **The machinery.** Parser, renderer, column from the pages, the lazy route,
   `sh` and `json` colours, `::table` and `::help`, the content guard and the
   glossary over the Markdown and `lab-docs.ts`. The two pages there are today
   move into Markdown with their content as it is, apart from the glossary
   fixes.
2. **Arrowz.** The page, `::play` and the three rule boards; `/docs` goes to
   `/docs/arrowz`.
3. **Lab.** The page, with its keys, palette and link tables from code.
4. **Live boards and the CLI page.** `::board`, `::compare`, the docs worker,
   Open in lab, and the full command-line page.
5. **The element page in full.** Controls, zoom and pan, the margin, the dot
   grid, the track, playing, themes, the WebGL context, the constants.

## 7. Not in this design

- The READMEs are not generated from the lab's content, nor the other way
  round: the prose exists twice, and only the machine facts are tied to code.
- No prose fact is checked against code (a size, a time, a range written in a
  sentence). The tables and the live numbers carry the facts that move.
- No search inside the documentation; ⌘K finds pages, not sentences.
