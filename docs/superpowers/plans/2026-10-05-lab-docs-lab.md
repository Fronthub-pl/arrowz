# Lab docs: the Lab page (PR 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new Docs page, Lab (`/docs/lab`), written from `apps/lab/README.md` in English and Polish, whose three tables — the keys, the palette's run and go-to rows, the link's fields — are built from the lab's code.

**Architecture:** The page is Markdown in `apps/lab/docs-content/{en,pl}/lab.md`, drawn by PR 1's renderer. `::table{of=…}` gains `keys`, `palette` and `link-fields`. Their rows come from the lab's code (`WORKSPACE_KEYS` and `COMMAND_KEYS` through a new `shownKeys()`, `buildCommands` through a new `docsPaletteRows()`, `VIEW_KEYS` and `lang`); their descriptions come from `packages/engine/lab-docs.ts`, typed so the compiler keeps EN and PL in step, and a node test holds the descriptions to the code both ways, because the engine cannot import the lab.

**Tech Stack:** React 19, react-router 8, Vitest 5 (`node` + `chromium` projects), mdast (PR 1's parser), Deno 2.9 for the engine and CLI guards.

**Spec:** `docs/superpowers/specs/2026-10-05-lab-docs-from-readmes-design.md` (PR 3 of §6; §1.1, §1.2, §1.3, §2.4, §5.1–§5.4). Bead `arrowz-kkey.3`.

## Decisions this plan takes where the spec is loose

1. **Every table gets a description column from `lab-docs.ts`.** §2.4 gives the keys "the dictionary's key labels" and the palette "the commands' own names" as descriptions, but the lab dictionary has no label for `[` or `Esc`, and a palette name ("Abort") does not say what the row does. The README's tables each have a "Does" column; the page keeps it. All three tables take it from `lab-docs.ts`, as the link fields do in §2.4.
2. **The key table's order is the code's.** `WORKSPACE_KEYS` and `COMMAND_KEYS` are reordered into reading order (G, [, ], R, S, F, Esc, then ⌘G, ⌘S, ⌘K); a lookup by key does not depend on the order.
3. **The palette table is the advanced view with nothing stopping**, in the page's language, whatever the lab is doing (`docsPaletteRows`). The ⌘K rows change with state (Check seeds is absent in the simple view, Abort reads Discard while a run stops); a reference table does not.
4. **The README's "New seed" sentence is fixed.** It says New seed "steps the seed"; the code (`reseed`) draws a random seed and generates, and `[` / `]` (`stepSeed`) step it. The page and the README say what the code does.

## Global Constraints

- Everything in the repository is in English; the Polish lives only in `docs-content/pl/`, in the `PL` dictionary of `packages/engine/lab-i18n.ts`, and in the `PL` table of `packages/engine/lab-docs.ts`.
- No `any`, no non-null assertions; no `Math.min(...arr)` over cells or pieces.
- Comments: say why, once; non-header blocks ≤ 6 lines, module/API headers ≤ 24 lines; cite symbols, never `file.ts:NN`; no PR, task or history references (`packages/engine/comments.test.ts`).
- The glossary (`packages/engine/glossary.test.ts`), for the lab page and for every description in `lab-docs.ts`: never piece, close/closed/closes, jam, carve, paper, ink, point grid, corridor, fragment, knob ("setting" instead), and no `--flag` outside a code span; PL never element/elementy, pokrętło, papier, tusz, generacja, fragment, domknięta, zacięta, sonda, wycięte, siatka punktów. The guard matches substrings: run it, do not trust your eyes.
- `lab-docs.ts` is under `neutral.test.ts`: no `Deno.`, no `localStorage`, no DOM name in it, descriptions included.
- Markdown rules (PR 1): `#` is the page title, first; every `##` carries `{#id}`, the same in both languages; a literal `<` is `\<`; a colon followed by a letter or digit is `\:`; links are `docs:<page>#<id>` or `https://`; a note (`>`) holds paragraphs only. No link in the prose may be named like a page ("Arrowz", "Command line") — whole-app tests look those names up.
- `apps/lab` reads the engine from `packages/engine/dist/`: after editing `packages/engine/*.ts`, run `pnpm nx build engine` before any lab test.
- On a fresh worktree run `pnpm install && pnpm nx build engine && pnpm nx build board-element` once (done for `.claude/worktrees/lab-docs-lab`).
- Prettier (`printWidth: 120`, no semicolons, single quotes) checks everything in `apps/lab`, the `.md` files and the README included: `pnpm exec prettier --write <files>` from `apps/lab` before each commit. `deno fmt <files>` for files under `packages/` and `docs/`.
- `pnpm run check` and `pnpm run lint` (from `apps/lab`) before every lab commit; `deno task check` and `deno task lint` (from `packages/engine`, and `packages/cli` when touched) before every engine/CLI commit.
- Mutations: commit first, mutate, run, undo by hand — never `git checkout` a file with uncommitted work.
- No attribution lines in commit messages or the PR description; the PR body cites `Bead: arrowz-kkey.3`.
- Jev (`deno task jev:docs`) advises and never gates; its flags are triaged by a person (Task 5).

## Review Focus

1. **A reader in the simple view, or with a run stopping.** The palette table must still list Check seeds and say "Abort", not "Discard" — `commands.test.ts` "docsPaletteRows lists the same rows whatever the lab is doing" (Task 2), and the browser case "::table of the palette ignores the view the lab is in" (Task 3).
2. **A language switch on the page.** All three tables, their headers and the palette's own names (`Switch to Polish` becomes `Przełącz na angielski`) follow the language without a reload — DocsMarkdown case "the lab tables follow the language" (Task 3) and LabPage case "in Polish the page, its tables and its palette rows speak Polish" (Task 4).
3. **A phone.** At 375×812 the palette table (three prose columns) and the link table must not scroll the document sideways — the lab page joins the eight-width loop of `DocsLayout.browser.test.tsx` (Task 4).
4. **The example link must be one the lab reads.** A reader who pastes the JSON from the Links section after `#` must get W 40, H 40, seed 7, colour on, Polish — LabPage case "the example link is one the lab reads" runs it through `decodeHash` (Task 4).
5. **The keys keep working after the reorder.** Reordering `WORKSPACE_KEYS` must not change what a key does — the existing `hotkeys` browser tests run unchanged in Task 2, and `hotkeys.test.ts` "the keys as the lab shows them" pins the new order.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/engine/lab-docs.ts` | `LabKey`, `PaletteId`, `LinkField`; the `keys`, `palette`, `linkFields` descriptions and four column names, EN and PL (Tasks 1, 4). |
| `packages/engine/lab-docs.test.ts`, `packages/engine/glossary.test.ts` | The new descriptions are translated and use no retired word (Task 1). |
| `apps/lab/src/shell/hotkeys.ts` (+ `hotkeys.test.ts`) | `keyLabel`, `shownKeys`; keys in reading order (Task 2). |
| `apps/lab/src/palette/commands.ts` (+ `commands.test.ts`) | `docsPaletteRows` (Task 2). |
| `apps/lab/src/docs/tables.test.ts` | The descriptions are exactly the keys, rows and fields the code has (Task 2). |
| `apps/lab/src/readme.test.ts` | Uses `shownKeys` (Task 2). |
| `apps/lab/src/docs/DocsTable.tsx`, `apps/lab/src/docs/shape.ts` | The three tables and their names (Task 3). |
| `apps/lab/docs-content/{en,pl}/lab.md`, `apps/lab/src/docs/content.ts`, `apps/lab/src/docs/pages.ts` | The page (Task 4). |
| `packages/engine/lab-i18n.ts` | `docsLab` (Task 4). |
| `apps/lab/README.md` | Screens, palette row, New seed (Task 4). |
| `packages/cli/scripts/jev-docs.ts` (+ test), `docs/jev-guards.md` | Jev reads the lab page and its descriptions (Tasks 4, 5). |

---

### Task 1: The lab tables' descriptions in the engine

**Files:**
- Modify: `packages/engine/lab-docs.ts`, `packages/engine/README.md` (its export tables are guarded by `packages/engine/readme.test.ts`)
- Test: `packages/engine/lab-docs.test.ts`, `packages/engine/glossary.test.ts`, `apps/lab/src/docs/content.test.ts`

**Interfaces:**
- Produces: `export type LabKey`, `export type PaletteId`, `export type LinkField`; `Docs.keys: Record<LabKey, string>`, `Docs.palette: Record<PaletteId, string>`, `Docs.linkFields: Record<LinkField, string>`, `Docs.colKey`, `Docs.colCommand`, `Docs.colSection`, `Docs.colField` (all `string`). Reached from the lab as `docsFor(lang)` from `@arrowz/engine/docs`.

- [ ] **Step 0: Bead metadata**

```bash
bd update arrowz-kkey.3 --set-metadata plan=lab/docs-lab:docs/superpowers/plans/2026-10-05-lab-docs-lab.md \
  --set-metadata docs=apps/lab/README.md
```

- [ ] **Step 1: Write the failing test**

In `packages/engine/lab-docs.test.ts`, after the test `'no Polish description is a copy of its English source'`, add:

```ts
// The lab's own tables: their rows are the lab's code, which `tables.test.ts`
// in apps/lab compares; here only that each description is text, translated.
Deno.test('every lab table description is in both languages, and translated', () => {
  const en = docsFor('en')
  const pl = docsFor('pl')
  let seen = 0
  for (const group of ['keys', 'palette', 'linkFields'] as const) {
    const plRows: Readonly<Record<string, string>> = pl[group]
    for (const [key, text] of Object.entries(en[group])) {
      seen++
      assert(text.trim().length > 0, `EN ${group}.${key}`)
      assert((plRows[key] ?? '').trim().length > 0, `PL ${group}.${key}`)
      assertNotEquals(plRows[key], text, `${group}.${key} is still English in the Polish docs`)
    }
  }
  assertEquals(seen, 10 + 16 + 19)
})
```

In the same file, in the comment above `'the frame around the tables is translated too'`, replace `Eleven strings exist
// today (ten `col*` and `infoLabel`)` with `Fifteen strings exist
// today (fourteen `col*` and `infoLabel`)`, and change `assert(frame.length > 10,` to `assert(frame.length > 14,`.

- [ ] **Step 2: Run it to see it fail**

```bash
cd packages/engine && deno test -A lab-docs.test.ts
```

Expected: FAIL at type check — `Property 'keys' does not exist on type 'Docs'`.

- [ ] **Step 3: Add the types, the interface fields and the descriptions**

In `packages/engine/lab-docs.ts`, after `export type SlotKey = …`, add:

```ts
/**
 * The lab's own tables on the Docs tab, keyed as the lab's code names them: a
 * key as the lab shows it, a palette row by its id, a link field by its name.
 * The rows come from `apps/lab`, which the engine cannot import, so
 * `docs/tables.test.ts` there holds these keys to that code both ways.
 */
export type LabKey = 'G' | '[' | ']' | 'R' | 'S' | 'F' | 'Esc' | '⌘G' | '⌘S' | '⌘K'
export type PaletteId =
  | 'run-generate'
  | 'run-generate-save'
  | 'run-save'
  | 'run-reseed'
  | 'run-defaults'
  | 'run-abort'
  | 'run-check-seeds'
  | 'run-solo'
  | 'go-lab'
  | 'go-boards'
  | 'go-open-file'
  | 'go-docs-arrowz'
  | 'go-docs-cli'
  | 'go-docs-element'
  | 'go-view'
  | 'go-lang'
export type LinkField =
  | 'cell'
  | 'stroke'
  | 'headWidth'
  | 'headHeight'
  | 'top'
  | 'colored'
  | 'rounded'
  | 'highlightLongest'
  | 'voids'
  | 'showPoints'
  | 'pointColor'
  | 'pointRadius'
  | 'theme'
  | 'palette'
  | 'paper'
  | 'ink'
  | 'highlightColor'
  | 'pad'
  | 'lang'
```

In `interface Docs`, after `readonly slots: Record<SlotKey, string>`, add:

```ts
  readonly keys: Record<LabKey, string>
  readonly palette: Record<PaletteId, string>
  readonly linkFields: Record<LinkField, string>
```

and after `readonly colSlot: string`, add:

```ts
  readonly colKey: string
  readonly colCommand: string
  /** The palette's section a row sits in: run or go to. */
  readonly colSection: string
  readonly colField: string
```

In `EN`, after the `slots: {…}` block, add:

```ts
  keys: {
    'G': 'Generates a board from the settings.',
    '[': 'Steps the seed back by one and generates.',
    ']': 'Steps the seed forward by one and generates.',
    'R': 'Shows or hides the report.',
    'S': 'Shows or hides the settings.',
    'F': 'Full view: the board alone.',
    'Esc': 'Puts away one layer: an open sheet first, then the report, then the settings.',
    '⌘G': 'Generates a board and saves it.',
    '⌘S': 'Saves the board on screen.',
    '⌘K': 'Opens the command palette, on every screen, also from a field.',
  },
  palette: {
    'run-generate': 'Generates a board from the settings.',
    'run-generate-save': 'Generates a board and saves it.',
    'run-save': 'Saves the board on screen.',
    'run-reseed': 'Draws a random seed and generates.',
    'run-defaults': 'Puts every setting back to its default and generates.',
    'run-abort': 'Stops the run and keeps the board made so far; while one is stopping, _Discard_ drops its board.',
    'run-check-seeds': 'Runs the settings over a number of seeds (advanced view only).',
    'run-solo': 'The board alone.',
    'go-lab': 'The settings, the board and the report.',
    'go-boards': 'The saved boards.',
    'go-open-file': 'Opens a board file from disk.',
    'go-docs-arrowz': 'The puzzle, its one rule played on three small boards, and its words.',
    'go-docs-cli': "The command line's documentation.",
    'go-docs-element': 'The documentation of `<arrowz-board>`.',
    'go-view': 'Switches the view; in the simple view the row reads _Advanced view_.',
    'go-lang': 'Switches the language; in Polish the row offers English.',
  },
  linkFields: {
    cell: 'The cell size of an exported SVG, in pixels.',
    stroke: 'The line thickness, in cells.',
    headWidth: "The arrowhead's width in cells; 0 is automatic.",
    headHeight: "The arrowhead's length, in cells.",
    top: 'How many longest arrows are marked.',
    colored: 'One colour per arrow.',
    rounded: 'Rounded turns and a disc tail.',
    highlightLongest: 'Marks the longest arrows.',
    voids: 'Shows the cells the generator left empty.',
    showPoints: 'The dot grid.',
    pointColor: 'The colour of its dots.',
    pointRadius: 'The radius of its dots, in cells.',
    theme: 'A built-in theme by name.',
    palette: 'The arrow colours while `colored` is on.',
    paper: 'The background colour.',
    ink: 'The colour of the arrows.',
    highlightColor: 'The colour of the marked arrows.',
    pad: 'The margin around the board, in cells.',
    lang: "The page's language, `en` or `pl`.",
  },
```

and after `colSlot: 'Slot',`:

```ts
  colKey: 'Key',
  colCommand: 'Command',
  colSection: 'Section',
  colField: 'Field',
```

In `PL`, after its `slots: {…}` block, add:

```ts
  keys: {
    'G': 'Generuje planszę z ustawień.',
    '[': 'Cofa ziarno o jeden i generuje.',
    ']': 'Przesuwa ziarno o jeden naprzód i generuje.',
    'R': 'Pokazuje albo chowa raport.',
    'S': 'Pokazuje albo chowa ustawienia.',
    'F': 'Pełny podgląd: sama plansza.',
    'Esc': 'Chowa jedną warstwę: najpierw otwarty arkusz, potem raport, potem ustawienia.',
    '⌘G': 'Generuje planszę i ją zapisuje.',
    '⌘S': 'Zapisuje planszę z ekranu.',
    '⌘K': 'Otwiera paletę poleceń, na każdym ekranie, także z pola.',
  },
  palette: {
    'run-generate': 'Generuje planszę z ustawień.',
    'run-generate-save': 'Generuje planszę i ją zapisuje.',
    'run-save': 'Zapisuje planszę z ekranu.',
    'run-reseed': 'Losuje ziarno i generuje.',
    'run-defaults': 'Przywraca każdemu ustawieniu wartość domyślną i generuje.',
    'run-abort':
      'Zatrzymuje generowanie i zostawia planszę ułożoną do tej pory; gdy generowanie już się zatrzymuje, _Odrzuć_ porzuca jego planszę.',
    'run-check-seeds': 'Uruchamia ustawienia na wielu ziarnach (tylko w widoku zaawansowanym).',
    'run-solo': 'Sama plansza.',
    'go-lab': 'Ustawienia, plansza i raport.',
    'go-boards': 'Zapisane plansze.',
    'go-open-file': 'Otwiera plik planszy z dysku.',
    'go-docs-arrowz': 'Łamigłówka, jej jedna reguła rozegrana na trzech małych planszach i jej słowa.',
    'go-docs-cli': 'Dokumentacja wiersza poleceń.',
    'go-docs-element': 'Dokumentacja `<arrowz-board>`.',
    'go-view': 'Przełącza widok; w widoku prostym wiersz brzmi _Widok zaawansowany_.',
    'go-lang': 'Przełącza język; po angielsku wiersz proponuje polski.',
  },
  linkFields: {
    cell: 'Rozmiar komórki w eksportowanym SVG, w pikselach.',
    stroke: 'Grubość linii, w komórkach.',
    headWidth: 'Szerokość grotu w komórkach; 0 to wartość automatyczna.',
    headHeight: 'Długość grotu, w komórkach.',
    top: 'Ile najdłuższych strzałek jest wyróżnionych.',
    colored: 'Każda strzałka we własnym kolorze.',
    rounded: 'Zaokrąglone zakręty i okrągły ogon.',
    highlightLongest: 'Wyróżnia najdłuższe strzałki.',
    voids: 'Pokazuje komórki, które generator zostawił puste.',
    showPoints: 'Siatka kropek.',
    pointColor: 'Kolor jej kropek.',
    pointRadius: 'Promień jej kropek, w komórkach.',
    theme: 'Wbudowany motyw, po nazwie.',
    palette: 'Kolory strzałek, gdy `colored` jest włączone.',
    paper: 'Kolor tła.',
    ink: 'Kolor strzałek.',
    highlightColor: 'Kolor wyróżnionych strzałek.',
    pad: 'Margines wokół planszy, w komórkach.',
    lang: 'Język strony, `en` albo `pl`.',
  },
```

and after `colSlot: 'Nazwa slotu',`:

```ts
  colKey: 'Klawisz',
  colCommand: 'Polecenie',
  colSection: 'Sekcja',
  colField: 'Pole',
```

The `go-lang` descriptions differ on purpose: the English table shows the row "Switch to Polish", the Polish one "Przełącz na angielski" (Task 2 builds both in the page's language).

- [ ] **Step 4: The engine README lists the new exports**

`packages/engine/readme.test.ts` compares every export of `@arrowz/engine/docs` and its shape with the README, so in `packages/engine/README.md`, section "### `@arrowz/engine/docs`":
- the `docsFor` row's Behaviour becomes `The Docs tab's descriptions and column names in one language: the board element's tables and the lab's.`;
- in the `Docs` row's Shape, insert `readonly keys: Record<LabKey, string>; readonly palette: Record<PaletteId, string>; readonly linkFields: Record<LinkField, string>; ` after `readonly slots: Record<SlotKey, string>; `, and `readonly colKey: string; readonly colCommand: string; readonly colSection: string; readonly colField: string; ` after `readonly colSlot: string; `;
- add three rows to the Type table, in its alphabetical order (`LabKey` and `LinkField` after `EventRow`, `PaletteId` after `MemberRow`), each Shape the union exactly as in `lab-docs.ts`, on one line, with every `|` escaped as `\|` inside the cell:
  - `LabKey` — shape `'G' \| '[' \| ']' \| 'R' \| 'S' \| 'F' \| 'Esc' \| '⌘G' \| '⌘S' \| '⌘K'`, meaning `A key of the lab's key table, as the lab shows it.`
  - `LinkField` — all nineteen names, none elided, meaning `A field of the lab's link.`
  - `PaletteId` — all sixteen ids, none elided, meaning `A run or go-to row of the lab's command palette, by its id.`

- [ ] **Step 5: Run it to see it pass**

```bash
cd packages/engine && deno test -A lab-docs.test.ts readme.test.ts && deno task check
```

Expected: PASS.

- [ ] **Step 6: The glossary reads the new descriptions too**

In `packages/engine/glossary.test.ts`, replace the body of `docsRows` with:

```ts
  const docs = docsFor(lang)
  return (['props', 'members', 'events', 'slots', 'keys', 'palette', 'linkFields'] as const)
    .flatMap((group) => leaves(docs[group], `${lang}.${group}`, []))
    .map(([path, text]): [string, string] => [path, withoutCode(text)])
```

and change its JSDoc to `/** The descriptions of the Docs tab's tables, the element's and the lab's. */`. Rename the test `'the element reference descriptions use no retired word'` to `'the Docs tables' descriptions use no retired word'`.

Run, then mutate: put the word `knobs` into `EN.palette['run-defaults']`, run again, undo by hand.

```bash
cd packages/engine && deno test -A glossary.test.ts neutral.test.ts
```

Expected: PASS before the mutation; with it, FAIL `en.palette.run-defaults uses a retired word (/\bknobs?\b/i)`; PASS after undoing it.

- [ ] **Step 7: The lab's description guard reads them too**

In `apps/lab/src/docs/content.test.ts`, in the test `'every %s description is plain inline Markdown'`, replace the `texts` line and the floor with:

```ts
  const texts = [docs.props, docs.members, docs.events, docs.slots, docs.keys, docs.palette, docs.linkFields].flatMap(
    (rows) => Object.values(rows),
  )
  expect(texts.length).toBeGreaterThan(75)
```

```bash
pnpm nx build engine
cd apps/lab && pnpm exec vitest run --project node src/docs/content.test.ts
```

Expected: PASS (`<arrowz-board>` is inside a code span, so it is not raw HTML).

- [ ] **Step 8: Commit**

```bash
cd packages/engine && deno task lint && deno fmt lab-docs.ts lab-docs.test.ts glossary.test.ts
cd ../../apps/lab && pnpm exec prettier --write src/docs/content.test.ts && pnpm run check && pnpm run lint
cd ../.. && git add packages/engine/lab-docs.ts packages/engine/README.md packages/engine/lab-docs.test.ts packages/engine/glossary.test.ts apps/lab/src/docs/content.test.ts
git commit -m "engine: the lab's keys, palette rows and link fields have descriptions in both languages"
```

---

### Task 2: The rows from the lab's code

**Files:**
- Modify: `apps/lab/src/shell/hotkeys.ts`, `apps/lab/src/palette/commands.ts`, `apps/lab/src/state/url.ts`, `apps/lab/src/readme.test.ts`
- Create: `apps/lab/src/docs/tables.test.ts`
- Test: `apps/lab/src/shell/hotkeys.test.ts`, `apps/lab/src/palette/commands.test.ts`

**Interfaces:**
- Consumes: `docsFor` (Task 1), `buildCommands`, `WORKSPACE_KEYS`, `COMMAND_KEYS`, `VIEW_KEYS`.
- Produces: `export function keyLabel(key: string): string` and `export function shownKeys(): string[]` in `shell/hotkeys.ts`; `export function docsPaletteRows(dict: Dict, state: Store): Command[]` in `palette/commands.ts`; `export const LINK_FIELDS: readonly string[]` in `state/url.ts`.

- [ ] **Step 1: Write the failing tests**

In `apps/lab/src/shell/hotkeys.test.ts`, add `shownKeys` to the import from `./hotkeys` and add:

```ts
test('the keys as the lab shows them, in the order the docs list them', () => {
  expect(shownKeys()).toEqual(['G', '[', ']', 'R', 'S', 'F', 'Esc', '⌘G', '⌘S', '⌘K'])
})
```

In `apps/lab/src/palette/commands.test.ts`, add `docsPaletteRows` to the import from `./commands` and add at the end:

```ts
describe('docsPaletteRows', () => {
  it('lists the same rows whatever the lab is doing', () => {
    const calm = docsPaletteRows(dictionary('en'), useStore.getState()).map((row) => [row.id, row.name])
    // The simple view drops Check seeds from ⌘K, a stopping run renames Abort,
    // and the store's language names the language row: none may reach the table.
    useStore.setState((state) => ({ ui: { ...state.ui, mode: 'simple' }, run: { ...state.run, stopping: true } }))
    useStore.getState().lang.setLang('pl')
    try {
      expect(docsPaletteRows(dictionary('en'), useStore.getState()).map((row) => [row.id, row.name])).toEqual(calm)
    } finally {
      useStore.getState().lang.setLang('en')
    }
    expect(calm).toContainEqual(['run-check-seeds', 'Check seeds'])
    expect(calm).toContainEqual(['run-abort', 'Abort'])
    expect(calm).toContainEqual(['go-view', 'Simple view'])
    expect(calm).toContainEqual(['go-lang', 'Switch to Polish'])
  })

  it('holds the run and go-to rows only, named in the language asked for', () => {
    const rows = docsPaletteRows(dictionary('pl'), useStore.getState())
    expect(new Set(rows.map((row) => row.section))).toEqual(new Set(['run', 'go']))
    expect(rows.find((row) => row.id === 'go-lang')?.name).toBe('Przełącz na angielski')
  })
})
```

Create `apps/lab/src/docs/tables.test.ts`:

```ts
// The lab's tables on the Docs tab take their rows from the lab's code and
// their descriptions from `lab-docs.ts`, which cannot import that code. Each
// is compared with the code both ways: a key bound without a description fails
// here as surely as a description left behind for a key that is gone. The two
// languages share their keys by type, so English stands for both.
import { docsFor } from '@arrowz/engine/docs'
import { dictionary } from '@arrowz/engine/i18n'
import { expect, test } from 'vitest'
import { docsPaletteRows } from '../palette/commands'
import { shownKeys } from '../shell/hotkeys'
import { useStore } from '../state/store'
import { LINK_FIELDS } from '../state/url'
import { VIEW_KEYS } from '../state/viewSchema'

const sorted = (values: Iterable<string>) => [...values].sort()
const docs = docsFor('en')

test('the key descriptions are the keys the lab binds', () => {
  expect(sorted(Object.keys(docs.keys))).toEqual(sorted(shownKeys()))
})

test('the palette descriptions are the run and go-to rows', () => {
  const ids = docsPaletteRows(dictionary('en'), useStore.getState()).map((row) => row.id)
  expect(sorted(Object.keys(docs.palette))).toEqual(sorted(ids))
})

test('the link field descriptions are the fields a link carries', () => {
  expect(sorted(Object.keys(docs.linkFields))).toEqual(sorted(LINK_FIELDS))
  // The list itself: the preview's fields, then the language a link may name.
  expect(LINK_FIELDS).toEqual([...VIEW_KEYS, 'lang'])
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
cd apps/lab && pnpm exec vitest run --project node src/shell/hotkeys.test.ts src/palette/commands.test.ts src/docs/tables.test.ts
```

Expected: FAIL — `TypeError: shownKeys is not a function` and `docsPaletteRows is not a function` (Vitest does not type-check).

- [ ] **Step 3: `keyLabel` and `shownKeys`, keys in reading order**

In `apps/lab/src/shell/hotkeys.ts`, change `COMMAND_KEYS` to:

```ts
export const COMMAND_KEYS = { generateAndSave: 'g', save: 's', palette: 'k' } as const
```

Reorder the rows of `WORKSPACE_KEYS` (each row moves whole, with its comment) to:

```ts
export const WORKSPACE_KEYS: readonly HotkeyRow[] = [
  { keys: ['g', 'G'], lab: true, run: (control) => generate(control) },
  { keys: ['['], lab: true, run: (control) => stepSeed(control, -1) },
  { keys: [']'], lab: true, run: (control) => stepSeed(control, 1) },
  {
    keys: ['r', 'R'],
    run: () => {
      const ui = useStore.getState().ui
      if (readBand() === 'xs') ui.toggleSheet('report')
      else ui.toggleReport()
    },
  },
  {
    keys: ['s', 'S'],
    run: () => {
      const ui = useStore.getState().ui
      if (readBand() === 'xs') ui.toggleSheet('settings')
      else ui.toggleSettings()
    },
  },
  // Shift is not a modifier here, so `F` too; also with the focus on a button such as Generate.
  { keys: ['f', 'F'], run: () => useStore.getState().ui.toggleSolo() },
  { keys: ['Escape'], run: closeOneLayer },
]
```

After `WORKSPACE_KEYS`, add:

```ts
/** A key as the lab shows it: a letter in capitals, Escape as Esc. */
export function keyLabel(key: string): string {
  return key === 'Escape' ? 'Esc' : key.toUpperCase()
}

/** Every key the lab binds, as it shows them: `WORKSPACE_KEYS` in order, then the ⌘ letters. */
export function shownKeys(): string[] {
  const single = WORKSPACE_KEYS.flatMap((row) => row.keys.map(keyLabel))
  const command = Object.values(COMMAND_KEYS).map((letter) => `⌘${keyLabel(letter)}`)
  return [...new Set([...single, ...command])]
}
```

- [ ] **Step 3b: `LINK_FIELDS`**

In `apps/lab/src/state/url.ts`, after `HashView`, add:

```ts
/** Every field a link's `__view` is read for: the view's own, then the page's language. */
export const LINK_FIELDS: readonly string[] = [...VIEW_KEYS, 'lang']
```

and import `VIEW_KEYS` beside `pickView, readView` from `./viewSchema`.

- [ ] **Step 4: `docsPaletteRows`**

In `apps/lab/src/palette/commands.ts`, after `buildCommands`, add:

```ts
const IDLE: RunControl = { start: () => {}, abort: () => {}, hold: () => {}, checkSeeds: () => {} }

/**
 * The run and go-to rows as the Docs tab lists them: the advanced view, in
 * `dict`'s language, nothing stopping, whatever the lab is doing now. The ⌘K
 * rows change with that state (Check seeds, Discard); a reference table does not.
 */
export function docsPaletteRows(dict: Dict, state: Store): Command[] {
  const fixed: Store = {
    ...state,
    ui: { ...state.ui, mode: 'advanced' },
    lang: { ...state.lang, lang: dict.lang },
    run: { ...state.run, stopping: false },
    series: { ...state.series, stopping: false },
  }
  return buildCommands({ control: IDLE, navigate: () => {}, dict }, fixed).filter(
    (row) => row.section === 'run' || row.section === 'go',
  )
}
```

`RunControl` is already imported as a type (`import { inFlight, type RunControl } from '../run/useRun'`).

- [ ] **Step 5: The README guard uses them**

In `apps/lab/src/readme.test.ts`, replace the `shown` helper and the key test with:

```ts
test('the key table is WORKSPACE_KEYS and COMMAND_KEYS, both ways', () => {
  expect(sorted(firstColumn('## Keys', 'Key'))).toEqual(sorted(shownKeys()))
})
```

change the import `import { COMMAND_KEYS, WORKSPACE_KEYS } from './shell/hotkeys'` to `import { shownKeys } from './shell/hotkeys'`, and replace the first six lines of the file's header comment with (Prettier does not reflow comments):

```ts
// README.md describes the lab as the code defines it, and the code is the
// source of truth: the routes of AppRoutes, the keys the lab binds
// (shownKeys), the palette's run and go-to commands, the fields a link
// carries (LINK_FIELDS), the two ports, the Nx targets, and the screenshots
// of docs/screenshots.json. Each comparison runs both ways, so a row for
// something removed fails as surely as a missing row.
```

Replace the link-table test's `sorted([...VIEW_KEYS, 'lang'])` with `sorted(LINK_FIELDS)`, import `LINK_FIELDS` from `./state/url`, and drop the `VIEW_KEYS` import.

- [ ] **Step 6: Run them to see them pass**

```bash
cd apps/lab && pnpm exec vitest run --project node src/shell/hotkeys.test.ts src/palette/commands.test.ts src/docs/tables.test.ts src/readme.test.ts
pnpm exec vitest run --project chromium src/shell
```

Expected: PASS; the chromium run is the keys' behaviour, unchanged by the reorder.

- [ ] **Step 7: Mutations**

Commit first (Step 8), then one at a time, undoing each by hand:
1. In `docsPaletteRows`, delete the line `ui: { ...state.ui, mode: 'advanced' },` → `lists the same rows whatever the lab is doing` FAILS.
2. Delete `run: { ...state.run, stopping: false },` → same case FAILS (`Discard`).
3. Delete `lang: { ...state.lang, lang: dict.lang },` → same case FAILS (`Przełącz na angielski`).
4. Remove `'⌘K': …` from `EN.keys` and `PL.keys` in `lab-docs.ts`, remove `'⌘K'` from `LabKey`, `pnpm nx build engine` → `the key descriptions are the keys the lab binds` FAILS. Undo, rebuild.

- [ ] **Step 8: Commit**

```bash
cd apps/lab && pnpm exec prettier --write src/state/url.ts src/shell/hotkeys.ts src/shell/hotkeys.test.ts src/palette/commands.ts src/palette/commands.test.ts src/docs/tables.test.ts src/readme.test.ts
pnpm run check && pnpm run lint
cd ../.. && git add apps/lab/src/state/url.ts apps/lab/src/shell/hotkeys.ts apps/lab/src/shell/hotkeys.test.ts apps/lab/src/palette/commands.ts apps/lab/src/palette/commands.test.ts apps/lab/src/docs/tables.test.ts apps/lab/src/readme.test.ts
git commit -m "lab: the keys as shown and the palette rows as the docs list them come from one place each"
```

---

### Task 3: The three tables in the renderer

**Files:**
- Modify: `apps/lab/src/docs/DocsTable.tsx`, `apps/lab/src/docs/shape.ts`
- Test: `apps/lab/src/docs/DocsMarkdown.browser.test.tsx`

**Interfaces:**
- Consumes: `shownKeys` (Task 2), `docsPaletteRows` (Task 2), `VIEW_KEYS`, `docs.keys`/`palette`/`linkFields`/`colKey`/`colCommand`/`colSection`/`colField` (Task 1).
- Produces: `::table{of="keys"}`, `::table{of="palette"}`, `::table{of="link-fields"}`, each a `table.fw-docs-table` labelled by its section.

- [ ] **Step 1: Write the failing tests**

In `apps/lab/src/docs/DocsMarkdown.browser.test.tsx`, add to the imports:

```tsx
import { dictionary } from '@arrowz/engine/i18n'
import { act } from 'react'
import { docsPaletteRows } from '../palette/commands'
import { shownKeys } from '../shell/hotkeys'
import { VIEW_KEYS } from '../state/viewSchema'
```

(`act` is not imported there yet; `useStore` already is.) After the test `'::table draws the reference table its section names'`, add:

```tsx
const cells = (table: Element | null) =>
  [...(table?.querySelectorAll('tbody tr') ?? [])].map((tr) => [...tr.children].map((td) => td.textContent))
const headers = (table: Element | null) => [...(table?.querySelectorAll('thead th') ?? [])].map((th) => th.textContent)

test('::table of keys lists every key the lab binds, with what it does', async () => {
  const screen = await show('# T\n\n## Keys {#keys}\n\n::table{of="keys"}')
  const table = screen.container.querySelector('table[aria-labelledby="docs-keys"]')
  expect(headers(table)).toEqual(['Key', 'Description'])
  expect(cells(table).map(([key]) => key)).toEqual(shownKeys())
  expect(cells(table)[0]).toEqual(['G', 'Generates a board from the settings.'])
  expect(table?.querySelector('tbody kbd')?.textContent).toBe('G')
})

test('::table of the palette ignores the view the lab is in', async () => {
  const mode = useStore.getState().ui.mode
  useStore.setState((state) => ({ ui: { ...state.ui, mode: 'simple' } }))
  try {
    const screen = await show('# T\n\n## Palette {#palette}\n\n::table{of="palette"}')
    const table = screen.container.querySelector('table[aria-labelledby="docs-palette"]')
    expect(headers(table)).toEqual(['Command', 'Section', 'Description'])
    const rows = cells(table)
    expect(rows.map(([name]) => name)).toEqual(
      docsPaletteRows(dictionary('en'), useStore.getState()).map((row) => row.name),
    )
    expect(rows).toContainEqual(['Check seeds', 'run', 'Runs the settings over a number of seeds (advanced view only).'])
    expect(rows).toContainEqual(['Open file…', 'go to', 'Opens a board file from disk.'])
  } finally {
    useStore.setState((state) => ({ ui: { ...state.ui, mode } }))
  }
})

test('::table of link fields lists every field a link carries, its language last', async () => {
  const screen = await show('# T\n\n## Links {#links}\n\n::table{of="link-fields"}')
  const table = screen.container.querySelector('table[aria-labelledby="docs-links"]')
  expect(headers(table)).toEqual(['Field', 'Description'])
  const rows = cells(table)
  expect(rows.map(([field]) => field)).toEqual([...VIEW_KEYS, 'lang'])
  expect(rows.at(-1)).toEqual(['lang', "The page's language, en or pl."])
  // A description is inline Markdown: its code spans are code, not backticks.
  expect(table?.querySelectorAll('tbody tr:last-child code')).toHaveLength(2)
})

test('the lab tables follow the language', async () => {
  const screen = await show('# T\n\n## Keys {#keys}\n\n::table{of="keys"}\n\n## Palette {#palette}\n\n::table{of="palette"}')
  await act(async () => useStore.getState().lang.setLang('pl'))
  const keys = screen.container.querySelector('table[aria-labelledby="docs-keys"]')
  await expect.poll(() => cells(keys)[0]).toEqual(['G', 'Generuje planszę z ustawień.'])
  expect(headers(keys)).toEqual(['Klawisz', 'Opis'])
  const palette = cells(screen.container.querySelector('table[aria-labelledby="docs-palette"]'))
  expect(palette).toContainEqual([
    'Przełącz na angielski',
    'przejdź do',
    'Przełącza język; po angielsku wiersz proponuje polski.',
  ])
})
```

In `apps/lab/src/docs/shape.test.ts`, check that the case `'an unknown value'` still uses `of="knobs"` (it stays unknown in this PR) — no change.

- [ ] **Step 2: Run them to see them fail**

```bash
cd apps/lab && pnpm exec vitest run --project chromium src/docs/DocsMarkdown.browser.test.tsx
```

Expected: the four new cases FAIL — the tables are absent (`DocsTable` returns null).

- [ ] **Step 3: Name the tables**

In `apps/lab/src/docs/shape.ts`, change the `table` entry of `DIRECTIVES` to:

```ts
  table: {
    of: ['element-props', 'element-members', 'element-events', 'element-slots', 'keys', 'palette', 'link-fields'],
  },
```

- [ ] **Step 4: Draw them**

In `apps/lab/src/docs/DocsTable.tsx`, add to the imports:

```tsx
import { useDictionary } from '../i18n'
import { docsPaletteRows } from '../palette/commands'
import { shownKeys } from '../shell/hotkeys'
import { useStore } from '../state/store'
import { LINK_FIELDS } from '../state/url'
```

After the `Mono` component, add:

```tsx
/** A description by the key the code names; `tables.test.ts` fails first on a missing one. */
function described(rows: Readonly<Record<string, string>>, key: string): string {
  return Object.hasOwn(rows, key) ? (rows[key] ?? '') : ''
}

```

Change the header comment of `DocsTable` to:

```tsx
/**
 * One reference table, as `::table{of=…}` names it: the element's, from the
 * shared rows, or the lab's, from the lab's own code. The machine columns are
 * not translated; the last column is, and is inline Markdown. A name
 * `shape.ts` does not list renders nothing, and the content guard fails first.
 */
```

At the top of `DocsTable`, after `const docs = useDocs()`, add `const dict = useDictionary()`, and before the final `return null`, add:

```tsx
  if (of === 'keys')
    return (
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col">{docs.colKey}</th>
            <th scope="col">{docs.colDescription}</th>
          </tr>
        </thead>
        <tbody>
          {shownKeys().map((key) => (
            <tr key={key}>
              <td className="mono">
                <kbd>{key}</kbd>
              </td>
              <td>
                <InlineMarkdown text={described(docs.keys, key)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  if (of === 'palette')
    return (
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col">{docs.colCommand}</th>
            <th scope="col">{docs.colSection}</th>
            <th scope="col">{docs.colDescription}</th>
          </tr>
        </thead>
        <tbody>
          {/* Only the language reaches these rows (`docsPaletteRows` fixes the rest), and `dict` changes with it. */}
          {docsPaletteRows(dict, useStore.getState()).map((row) => (
            <tr key={row.id}>
              <td>{row.name}</td>
              <td>{row.note}</td>
              <td>
                <InlineMarkdown text={described(docs.palette, row.id)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  if (of === 'link-fields')
    return (
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col">{docs.colField}</th>
            <th scope="col">{docs.colDescription}</th>
          </tr>
        </thead>
        <tbody>
          {LINK_FIELDS.map((field) => (
            <tr key={field}>
              <Mono text={field} column="prop" />
              <td>
                <InlineMarkdown text={described(docs.linkFields, field)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
```

- [ ] **Step 5: Run them to see them pass**

```bash
cd apps/lab && pnpm exec vitest run --project chromium src/docs/DocsMarkdown.browser.test.tsx
pnpm exec vitest run --project node src/docs
```

Expected: PASS.

- [ ] **Step 6: Commit, then mutate**

```bash
cd apps/lab && pnpm exec prettier --write src/docs/DocsTable.tsx src/docs/shape.ts src/docs/DocsMarkdown.browser.test.tsx
pnpm run check && pnpm run lint
cd ../.. && git add apps/lab/src/docs/DocsTable.tsx apps/lab/src/docs/shape.ts apps/lab/src/docs/DocsMarkdown.browser.test.tsx
git commit -m "lab: ::table draws the lab's keys, palette rows and link fields from the lab's code"
```

Mutations, each undone by hand: replace `docsPaletteRows(dict, useStore.getState())` with `buildCommands({ control: { start() {}, abort() {}, hold() {}, checkSeeds() {} }, navigate() {}, dict }, useStore.getState()).filter((row) => row.section !== 'knob' && row.section !== 'preset')` → `ignores the view the lab is in` FAILS; replace `dict` in that call with `dictionary('en')` (imported from `@arrowz/engine/i18n`) → `the lab tables follow the language` FAILS.

---

### Task 4: The Lab page

**Files:**
- Create: `apps/lab/docs-content/en/lab.md`, `apps/lab/docs-content/pl/lab.md`, `apps/lab/src/docs/LabPage.browser.test.tsx`
- Modify: `apps/lab/src/docs/pages.ts`, `apps/lab/src/docs/content.ts`, `packages/engine/lab-i18n.ts`, `packages/engine/lab-docs.ts`, `apps/lab/README.md`, `packages/cli/scripts/jev-docs.ts`
- Test: `apps/lab/src/routes/DocsNav.browser.test.tsx`, `apps/lab/src/routes/DocsLayout.browser.test.tsx`, `apps/lab/src/palette/commands.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `DOCS_PAGES = ['arrowz', 'lab', 'cli', 'element']`, `DOCS_PAGE_NAMES.lab = 'docsLab'`, the dictionary key `docsLab`, `PaletteId` `'go-docs-lab'`, `DOCS_SOURCES.lab = 'apps/lab/README.md'`.

- [ ] **Step 1: Write the failing tests**

Create `apps/lab/src/docs/LabPage.browser.test.tsx`:

```tsx
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { decodeHash } from '../state/url'
import { DocsPageView } from './DocsPageView'
import '../design/index.css'

beforeEach(() => useStore.getState().lang.setLang('en'))

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/docs/lab']}>
      <div className="fw-docs-body">
        <DocsPageView page="lab" />
      </div>
    </MemoryRouter>,
  )

test('the page has its title and ten sections, in order', async () => {
  const screen = await mount()
  expect(screen.container.querySelector('h2')?.textContent).toBe('The lab')
  expect([...screen.container.querySelectorAll('h3')].map((h) => h.id)).toEqual([
    'docs-store',
    'docs-views',
    'docs-rules',
    'docs-generating',
    'docs-report',
    'docs-saved',
    'docs-board',
    'docs-keys',
    'docs-palette',
    'docs-links',
  ])
})

test('its three tables sit under Keys, The command palette and Links', async () => {
  const screen = await mount()
  expect([...screen.container.querySelectorAll('table')].map((t) => t.getAttribute('aria-labelledby'))).toEqual([
    'docs-keys',
    'docs-palette',
    'docs-links',
  ])
})

test('its links go to the settings on the command line page and to the one rule', async () => {
  const screen = await mount()
  expect([...screen.container.querySelectorAll('.fw-docs-body p a')].map((a) => a.getAttribute('href'))).toEqual([
    '/docs/cli',
    '/docs/arrowz',
  ])
})

// What a reader would paste after the lab's `#`, as the lab reads a link.
test('the example link is one the lab reads', async () => {
  const screen = await mount()
  // The page's one code block, under Links.
  const blocks = screen.container.querySelectorAll('.fw-docs-block pre')
  expect(blocks).toHaveLength(1)
  const code = blocks.item(0)?.textContent ?? ''
  const read = decodeHash('#' + encodeURIComponent(code))
  expect(read?.params).toEqual({ W: 40, H: 40, seed: 7 })
  expect(read?.view.colored).toBe(true)
  expect(read?.view.lang).toBe('pl')
})

test('in Polish the page, its tables and its palette rows speak Polish', async () => {
  const screen = await mount()
  await act(async () => useStore.getState().lang.setLang('pl'))
  await expect.poll(() => screen.container.querySelector('h2')?.textContent).toBe('Laboratorium')
  expect(screen.container.querySelector('#docs-keys')?.textContent).toBe('Klawisze')
  const palette = screen.container.querySelector('table[aria-labelledby="docs-palette"]')?.textContent ?? ''
  expect(palette).toContain('Przełącz na angielski')
  expect(palette).toContain('Dokumentacja — Laboratorium')
})
```

In `apps/lab/src/routes/DocsNav.browser.test.tsx`, in `'each page lists its sections, as links to that page'`, change `toHaveLength(3)` to `toHaveLength(4)` and insert after the Arrowz group:

```tsx
    [
      ['The board store', '/docs/lab'],
      ['Simple and advanced', '/docs/lab'],
      ['When a setting breaks a rule', '/docs/lab'],
      ['Generating and saving', '/docs/lab'],
      ['The report', '/docs/lab'],
      ['Saved boards and files', '/docs/lab'],
      ['The board', '/docs/lab'],
      ['Keys', '/docs/lab'],
      ['The command palette', '/docs/lab'],
      ['Links', '/docs/lab'],
    ],
```

and in the first test of that file add after the Arrowz line:

```tsx
  await expect.element(screen.getByRole('link', { name: 'Lab', exact: true })).toHaveAttribute('href', '/docs/lab')
```

Two more cases count the column's pages:
- `apps/lab/src/routes/DocsLayout.browser.test.tsx`, `at 375×812 (…) the column stands over the page`: `expect(shown).toHaveLength(3 + 5)` becomes `toHaveLength(4 + 5)`.
- `apps/lab/src/routes/DocsNav.browser.test.tsx`, `a section link keeps the fragment the address carries`: the selector `nav > ul > li:nth-child(2) > ul a` (the CLI page's first section) becomes `nav > ul > li:nth-child(3) > ul a`, since Lab is now second.

In `apps/lab/src/palette/commands.test.ts`, in `'keeps the catalogue order between the rows that all get promoted'`, replace the five `expect` lines with:

```ts
    expect(matches).toEqual(['go-docs-arrowz', 'go-docs-lab', 'go-docs-cli', 'go-docs-element'])
    expect(catalogueOrder.filter((id) => id.startsWith('go-docs-'))).toEqual(matches)
```

In `apps/lab/src/routes/DocsLayout.browser.test.tsx`:
- `openDocs(which: 'arrowz' | 'lab' | 'element' | 'cli')`; after the `cli` click line add
  `if (which === 'lab') await column.getByRole('link', { name: 'Lab', exact: true }).click()`;
  in the marker map add `lab: ['.fw-docs-body table[aria-labelledby="docs-keys"]', 1],` and extend its comment's list with "the Lab page its key table".
- The first `test.each(['arrowz', 'element', 'cli'] as const)` becomes `test.each(['arrowz', 'lab', 'element', 'cli'] as const)`.
- In the eight-width loop, add `['lab', 'a[href="/docs/lab"]'],` after the arrowz entry, and `lab: '.fw-docs-body table[aria-labelledby="docs-keys"]',` to its marker map. The marker is the key table, not any table: the element page has tables too, and a bare `table` would pass before the lab page arrived.

- [ ] **Step 2: Run them to see them fail**

```bash
cd apps/lab && pnpm exec vitest run --project chromium src/docs/LabPage.browser.test.tsx src/routes/DocsNav.browser.test.tsx
pnpm exec vitest run --project node src/palette/commands.test.ts
```

Expected: FAIL — `page="lab"` is not a `DocsPage` (type error at transform is fine) and the column has three pages.

- [ ] **Step 3: Register the page**

`apps/lab/src/docs/pages.ts`:

```ts
export const DOCS_PAGES = ['arrowz', 'lab', 'cli', 'element'] as const
```

```ts
export const DOCS_PAGE_NAMES = {
  arrowz: 'docsArrowz',
  lab: 'docsLab',
  cli: 'docsCli',
  element: 'docsElement',
} as const satisfies Record<DocsPage, UiKey>
```

`packages/engine/lab-i18n.ts`: after `docsArrowz: 'Arrowz',` in `EN.ui` add `docsLab: 'Lab',`; after `docsArrowz: 'Arrowz',` in `PL.ui` add `docsLab: 'Laboratorium',`.

`packages/engine/lab-docs.ts`: in `PaletteId` add `| 'go-docs-lab'` after `'go-docs-arrowz'` (and in the `PaletteId` row of `packages/engine/README.md`, `\| 'go-docs-lab'` at the same place); in `EN.palette` after `'go-docs-arrowz'` add
`'go-docs-lab': 'How the lab works: its views, keys, palette and links.',`
and in `PL.palette`
`'go-docs-lab': 'Jak działa laboratorium: widoki, klawisze, paleta i linki.',`.
In `lab-docs.test.ts` change `assertEquals(seen, 10 + 16 + 19)` to `assertEquals(seen, 10 + 17 + 19)`.

`apps/lab/src/docs/content.ts`: import the two files (`labEn` from `'../../docs-content/en/lab.md?raw'`, `labPl` from `'../../docs-content/pl/lab.md?raw'`, beside the others, alphabetical by path) and add `lab: labEn` / `lab: labPl` to `SOURCES` and `lab: parsed(SOURCES.en.lab)` / `lab: parsed(SOURCES.pl.lab)` to `PAGES`.

`packages/cli/scripts/jev-docs.ts`: in `DOCS_SOURCES` add `lab: 'apps/lab/README.md',` after `arrowz`.

- [ ] **Step 4: Write the English page**

Create `apps/lab/docs-content/en/lab.md`:

````md
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

The settings drawer on the left comes and goes with `S`. `F` hides both and gives the board the whole window.

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
````

- [ ] **Step 5: Write the Polish page**

Create `apps/lab/docs-content/pl/lab.md`:

````md
# Laboratorium

W laboratorium powstają plansze. Wybierasz ustawienia, laboratorium generuje planszę, a Ty widzisz naraz trzy rzeczy: planszę, jej pomiary i polecenie, które zrobi tę samą planszę jeszcze raz. Ma trzy karty, **Laboratorium**, **Zapisane plansze** i **Dokumentacja**, a każdy ekran ma własny adres, więc działają przycisk Wstecz i zakładki przeglądarki.

## Magazyn plansz {#store}

Zapisane plansze trzyma magazyn plansz: mały program, który przechowuje je na dysku, w katalogu, do którego pisze wiersz poleceń. Plansza zapisana w laboratorium jest dostępna dla wiersza poleceń, a plansza zrobiona w wierszu poleceń pojawia się w **Zapisanych planszach**.

Magazyn startuje razem z laboratorium. Jeśli **Zapisane plansze** są puste albo zapis zostaje odrzucony, magazyn nie działa: uruchom go obok laboratorium poleceniem `deno task store`. Cała reszta laboratorium działa bez niego.

## Prosty i zaawansowany {#views}

Widok **Prosty** to ten, w którym laboratorium się otwiera: rozmiar planszy, dwa suwaki (długość strzałek i krętość), przełącznik szkieletu i ziarno. To te same wybory, które daje zwykły wiersz poleceń. Pod nimi są ustawienia podglądu: grubość linii, rozmiar grotu, kolory i motyw.

Widok **Zaawansowany** pokazuje każde ustawienie generatora, w grupach, każde z pomocą, i listę presetów od Łatwy 25×25 do Obłęd 1000×1000. Przełącznik między widokami jest na górnym pasku, obok języka.

W obu widokach laboratorium pokazuje dokładne polecenie, które robi planszę z ekranu, gotowe do skopiowania. Polecenie zostaje na ekranie nawet wtedy, gdy ustawienia są odrzucone, więc nadal można je skopiować.

## Gdy ustawienie łamie regułę {#rules}

Każde ustawienie ma bezpieczny zakres, a o niektórych połączeniach wiadomo, że generator na nich utyka. Ustawienie spoza zakresu albo takie połączenie barwi swoje wiersze na czerwono i pokazuje obok powód. Jego grupa jest oznaczona na liście, a każda złamana reguła jest wypisana na dole ekranu. Laboratorium nie generuje, dopóki tego nie poprawisz.

Zakresy i reguły między ustawieniami są wypisane na [stronie wiersza poleceń](docs:cli#knobs).

## Generowanie i zapisywanie {#generating}

**Generuj** (`G`) robi planszę z ustawień na ekranie. **Nowe ziarno** losuje ziarno i generuje; `[` i `]` zamiast tego przesuwają ziarno o jeden w tył albo naprzód. **Domyślne** przywraca każde ustawienie i generuje. **Przerwij** zatrzymuje generowanie i zostawia planszę ułożoną do tej pory.

Plansza nie trafia do magazynu, dopóki nie użyjesz **Zapisz planszę** (`⌘S`) albo **Generuj i zapisz** (`⌘G`). Z włączonym przełącznikiem _zapisuj każdą planszę_ każde zakończone generowanie jest zapisywane.

W widoku zaawansowanym _generuj od razu po zmianie_ uruchamia generowanie przy każdej zmianie ustawienia, a **Sprawdź ziarna** uruchamia bieżące ustawienia na wielu ziarnach i podaje, ile plansz wyszło pełnych.

**Pobierz SVG** i **Pobierz plik planszy** eksportują planszę z ekranu.

## Raport {#report}

Szuflada raportu po prawej (`R`) wypisuje pomiary: strzałki i ich długości, jak trudno gra się na planszy, jak daleko sięgają strzałki i jaki mają kształt. Przy każdym jest `?`, który go objaśnia, a każda zmiana ma kolor względem poprzedniej planszy.

Szuflada ustawień po lewej pojawia się i znika pod `S`. `F` chowa obie i oddaje planszy całe okno.

## Zapisane plansze i pliki {#saved}

**Zapisane plansze** pokazują magazyn według rozmiaru. Zapisana plansza pokazuje swoje polecenie, ziarno i czas generowania. **Wczytaj do laboratorium** przywraca jej ustawienia, a **Usuń z dysku** ją kasuje.

**Otwórz plik…** otwiera `.board.json` z dysku, razem z plikiem meta, jeśli wybierzesz oba. Laboratorium pokazuje tę planszę, nie zapisując jej.

## Plansza {#board}

Pod planszą **Widok** służy do oglądania: przeciągnij, żeby przesunąć, a powiększaj przyciskami albo kółkiem. **Inspekcja** opisuje wskazaną strzałkę. **Gra** rozgrywa planszę według [jej jednej reguły](docs:arrowz#rule): wolna strzałka odjeżdża, zablokowana się odbija.

## Klawisze {#keys}

Pojedyncze klawisze działają na kartach **Laboratorium** i **Zapisane plansze**, ale nie podczas pisania w polu. Klawisze, które uruchamiają laboratorium, wciśnięte na Zapisanych planszach najpierw je przywołują. Na Windowsie i Linuksie `⌘` to Ctrl.

::table{of="keys"}

## Paleta poleceń {#palette}

`⌘K` otwiera wyszukiwanie wśród wszystkiego, co potrafi laboratorium. Jej wiersze są w sekcjach: _generowanie_ i _przejdź do_, wypisane niżej, a potem wiersz dla każdego ustawienia generatora, każdego ustawienia podglądu i każdego presetu. Wpisanie nazwy ustawienia albo jego flagi z wiersza poleceń (`--seed`) przenosi do niego. Wiersz, którego teraz nie da się uruchomić, zostaje na liście, z powodem w miejscu klawisza.

::table{of="palette"}

## Linki {#links}

Adres laboratorium niesie jego ustawienia, więc link otwiera tę samą planszę i ją generuje. Po `#` jest JSON, zakodowany procentowo: każde ustawienie generatora pod nazwą z silnika na najwyższym poziomie (`W`, `H`, `seed`, `wShort`…), a podgląd pod `__view`:

```json
{ "W": 40, "H": 40, "seed": 7, "__view": { "colored": true, "lang": "pl" } }
```

Pominięte pole przyjmuje wartość domyślną, a wartość, której laboratorium nie umie odczytać, jest pomijana.

::table{of="link-fields"}
````

- [ ] **Step 6: README**

In `apps/lab/README.md`:
- Screens table, row `/docs/:what`: `The documentation: \`arrowz\` for the puzzle and its rule, \`lab\` for the lab itself, \`cli\` for the command line, \`element\` for the board element.`
- Palette table: after the `Docs — Arrowz` row add `| \`Docs — Lab\` | go to | How the lab works: its views, keys, palette and links. |`
- Palette table, row `New seed`: its Does cell `Steps the seed.` becomes `Draws a random seed and generates.`
- "Generating and saving": replace `**New seed**
(\`[\` and \`]\`) steps the seed;` with `**New seed** draws a random seed and generates, while \`[\` and \`]\` step the seed back or forward by one;`.

Then `pnpm exec prettier --write README.md` from `apps/lab` (it re-pads the tables).

- [ ] **Step 7: Run everything the page touches**

```bash
pnpm nx build engine
cd apps/lab && pnpm exec vitest run --project node src
pnpm exec vitest run --project chromium src/docs src/routes src/AppRoutes.browser.test.tsx src/shell
cd ../../packages/engine && deno test -A glossary.test.ts lab-docs.test.ts neutral.test.ts comments.test.ts
cd ../cli && deno test -A scripts/jev-docs.test.ts
```

Expected: PASS. If the glossary flags a word, rewrite the sentence (the substring trap: run the guard, not your eyes); keep EN and PL saying the same thing.

- [ ] **Step 8: Commit**

```bash
cd apps/lab && pnpm exec prettier --write docs-content/en/lab.md docs-content/pl/lab.md README.md src/docs/pages.ts src/docs/content.ts src/docs/LabPage.browser.test.tsx src/routes/DocsNav.browser.test.tsx src/routes/DocsLayout.browser.test.tsx src/palette/commands.test.ts
pnpm run check && pnpm run lint
cd ../../packages/engine && deno fmt lab-i18n.ts lab-docs.ts lab-docs.test.ts && deno test -A readme.test.ts && deno task check && deno task lint
cd ../cli && deno fmt scripts/jev-docs.ts && deno task check
cd ../.. && git add apps/lab/docs-content/en/lab.md apps/lab/docs-content/pl/lab.md apps/lab/README.md \
  apps/lab/src/docs/pages.ts apps/lab/src/docs/content.ts apps/lab/src/docs/LabPage.browser.test.tsx \
  apps/lab/src/routes/DocsNav.browser.test.tsx apps/lab/src/routes/DocsLayout.browser.test.tsx \
  apps/lab/src/palette/commands.test.ts packages/engine/lab-i18n.ts packages/engine/lab-docs.ts \
  packages/engine/lab-docs.test.ts packages/engine/README.md packages/cli/scripts/jev-docs.ts
git commit -m "lab: the Docs tab has a Lab page, its keys, palette and link tables built from the lab's code"
```

---

### Task 5: Jev reads the lab page, and the branch is verified

**Files:**
- Modify: `packages/cli/scripts/jev-docs.ts`, `packages/cli/scripts/jev-docs.test.ts`, `docs/jev-guards.md`

**Interfaces:**
- Consumes: `docsFor(lang).keys/palette/linkFields` (Task 1), `DOCS_SOURCES.lab` (Task 4).

- [ ] **Step 1: Write the failing tests**

In `packages/cli/scripts/jev-docs.test.ts`, after `'checkDocs reads the element descriptions too, in both languages'`, add:

```ts
Deno.test('checkDocs reads the lab descriptions with the lab page, and not the element ones', async () => {
  const { judge, calls } = stubJudge(() => quiet)
  await checkDocs(judge, { page: 'lab', en: PAGE, pl: PAGE, source: 'README' })
  assert(calls.some((c) => c.key === 'lab-docs.ts keys.G'))
  assert(calls.some((c) => c.key === 'lab-docs.ts linkFields.lang'))
  assert(!calls.some((c) => typeof c.key === 'string' && c.key.startsWith('lab-docs.ts props.')))
})
```

and in `'docsPagesOf names the pages a change touches'` change the expectation to `['cli', 'element', 'lab']`.

```bash
cd packages/cli && deno test -A scripts/jev-docs.test.ts
```

Expected: both FAIL.

- [ ] **Step 2: Implement**

In `packages/cli/scripts/jev-docs.ts`, replace `descriptionRows` with:

```ts
/** The description tables each page draws from `lab-docs.ts`. */
const DESCRIPTION_GROUPS = {
  element: ['props', 'members', 'events', 'slots'],
  lab: ['keys', 'palette', 'linkFields'],
} as const

/** A page's reference descriptions, as `key: text` in each language; none for a page without tables. */
function descriptionRows(page: string): { key: string; en: string; pl: string }[] {
  const groups = page === 'element' || page === 'lab' ? DESCRIPTION_GROUPS[page] : []
  const en = docsFor('en')
  const pl = docsFor('pl')
  const rows: { key: string; en: string; pl: string }[] = []
  for (const group of groups) {
    const plRows: Readonly<Record<string, string>> = pl[group]
    for (const [key, text] of Object.entries(en[group])) {
      rows.push({ key: `${group}.${key}`, en: `${key}: ${text}`, pl: `${key}: ${plRows[key] ?? ''}` })
    }
  }
  return rows
}
```

In `checkDocs`, replace the `if (input.page === 'element') { for (const row of descriptionRows()) {` with `for (const row of descriptionRows(input.page)) {` (and drop the closing brace of the `if`). In `docsPagesOf`, replace `if (name === 'packages/engine/lab-docs.ts') pages.add('element')` with:

```ts
    if (name === 'packages/engine/lab-docs.ts') for (const described of Object.keys(DESCRIPTION_GROUPS)) pages.add(described)
```

and change its JSDoc to `… a page's Markdown in either language, or the descriptions in \`lab-docs.ts\`.`

```bash
cd packages/cli && deno test -A scripts/jev-docs.test.ts && deno task check && deno task lint
```

Expected: PASS.

- [ ] **Step 3: The Jev page**

`docs/jev-guards.md` ties `lab-docs.ts` to the element page in four places; edit by meaning, the file's own line wrapping differs from the quotes below:
- the CI list near the top: "`packages/engine/lab-docs.ts` for the element page" → "`packages/engine/lab-docs.ts` for the element and lab pages";
- "Docs pages", first paragraph: "and, for the element page, the property, member, event and slot descriptions in `packages/engine/lab-docs.ts`" → "and the descriptions in `packages/engine/lab-docs.ts` its tables show: the property, member, event and slot descriptions with the element page, the key, palette and link-field descriptions with the lab page";
- the `contradicts` row of the questions table: "every element description" → "every description the page's tables show";
- "(pages: `arrowz`, `element`, `cli`;" → "(pages: `arrowz`, `lab`, `cli`, `element`;", and "or `lab-docs.ts` for the element page." → "or `lab-docs.ts` for the element and lab pages."

Leave the "Measured on jev-1.13.0" paragraph as it is: it says what was measured then. Markdown is outside `deno fmt` (the root `deno.json` excludes `**/*.md`), so there is nothing to format.

- [ ] **Step 4: Commit**

```bash
deno fmt packages/cli/scripts/jev-docs.ts packages/cli/scripts/jev-docs.test.ts
git add packages/cli/scripts/jev-docs.ts packages/cli/scripts/jev-docs.test.ts docs/jev-guards.md
git commit -m "cli: Jev checks the lab page with its key, palette and link-field descriptions"
```

- [ ] **Step 5: Ask Jev about the page, triage**

```bash
deno task jev:docs lab
```

Expected: findings or "nothing flagged". Probe that Jev answered (memory: "nothing flagged" does not tell a missing answer apart). Each finding is triaged by a person: a real contradiction with `apps/lab/README.md` or a real EN/PL difference is fixed in the Markdown or `lab-docs.ts` (re-run Task 4 Step 7), anything else is recorded in the PR body as "seen, kept, because …".

- [ ] **Step 6: The whole repository**

```bash
cd packages/engine && deno task verify
cd ../cli && deno task verify
cd ../.. && pnpm nx run-many -t verify
```

Expected: all green. The lab's `verify` includes `build` and `smoke`.

- [ ] **Step 7: Live, in a real browser**

Copy the store first (memory: the live lab writes to the real store):

```bash
mkdir -p /tmp/lab-docs-lab-store && cp -R packages/cli/boards/. /tmp/lab-docs-lab-store/
ARROWZ_BOARDS_DIR=/tmp/lab-docs-lab-store pnpm nx serve lab
```

Check at 1440×900 and 375×812, in English and Polish: the column lists Lab second; `/docs/lab` shows ten sections and three tables; ⌘K → "Docs — Lab" goes there; switching the language on the page rewrites the tables without a reload; at 375 nothing scrolls sideways. Afterwards stop the server and kill what it leaves (`ps … | grep -E "lab-docs-lab|nx/dist/src/daemon|vite preview"`), and remove `/tmp/lab-docs-lab-store`.

- [ ] **Step 8: Bead and PR**

```bash
bd update arrowz-kkey.3 --append-notes "Plan executed; PR body cites Bead: arrowz-kkey.3."
```

Then superpowers:finishing-a-development-branch; the PR body (written to a file, passed as `--body-file` with an absolute path) lists the four decisions at the top of this plan and cites `Bead: arrowz-kkey.3`.
