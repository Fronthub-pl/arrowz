# Lab docs: the board element page in full (PR 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/docs/element` carries everything a user of `<arrowz-board>` needs from `packages/board-element/README.md`, in English and Polish: controls, zoom and pan, size and sanitising, the margin, the dot grid, the ride, slots, playing, themes, the WebGL context and every export — with live comparisons where a picture helps, and the export and theme tables built from code.

**Architecture:** Four new `::table` kinds (`element-types`, `element-functions`, `element-constants`, `element-classes`) draw rows kept in `lab-docs.ts` (engine, neutral), held to `packages/board-element/src/mod.ts` both ways by the TypeScript checker in the element's README guard; a constant's value is read from `@arrowz/board-element` at render time, never copied. A fifth, `themes`, draws `THEMES` (`look.ts`) with colour swatches and source links. The page's prose is Markdown with PR 4's `::board`/`:::compare` for the margin, the dot grid and the themes.

**Tech Stack:** React 19, Vitest 5 (`node` + `chromium` projects), TypeScript compiler API 5.9 (in `readme-api.test.ts`), Deno 2.9 for the engine guards, mdast + `micromark-extension-directive` (PR 1's parser).

**Spec:** `docs/superpowers/specs/2026-10-05-lab-docs-from-readmes-design.md` (PR 5 of §6; §1.2 "Board element", §1.4, §2.4 `themes` and `element-constants`, §5.2, §5.3). Bead `arrowz-kkey.5`.

## Decisions this plan takes where the spec is loose

1. **Three live comparisons on the page** (the user's choice, 2026-10-06): the margin (`--pad=0`, default, `--pad=16`), the dot grid (`--points`, and `--points` with thin lines and larger dots) and the themes (three themes, coloured). All eight boards are 12×12, seed 7: they share one `boardId`, so the page generates one board and draws it eight ways.
2. **The whole Exports section is built from code** (the user's choice): besides `element-constants`, the spec's §2.4 grows `element-types`, `element-functions` and `element-classes`. Machine columns (name, package, shape, signature, constructor, members) live in `lab-docs.ts` as rows; the descriptions are translated there.
3. **The guard for the export rows is the element package's README guard**, `packages/board-element/src/readme-api.test.ts`, which already reads `mod.ts` with the TypeScript checker (`exports`, `shapeOf`, `publicMembers`). A second copy of that checker set-up in another file would be thirty lines kept in step by hand. Its header gains one sentence; its local `spell` gives way to `spellValue` from `lab-docs.ts`, which the lab uses too.
4. **A constant's value is not a row field.** `ExportTable` reads it from `import * as boardElement from '@arrowz/board-element'` and spells it with `spellValue`; the compiler refuses a `ConstantKey` the package does not export.
5. **The theme table shows swatches** (the user's choice): background, arrows, highlight, then the palette, as small squares in one `role="img"` group named by the hex values; the theme's name and licence are machine cells; the source is a link out (`target="_blank" rel="noreferrer"`, as a Markdown link out). No description column: the spec says "no prose".
6. **The four export tables sit under `###` subsections of one `## Exports`** and are labelled by that section, as the CLI page's two knob tables share `#knobs`.
7. **`Mono` moves to `TokenSpans.tsx` and `NONE` is exported from `codeTokens.ts`**, so the new table modules use them without importing `DocsTable.tsx`, which imports them back. `DocsTable.tsx` drops its own copy of `NONE`.
8. **Long machine values wrap inside their cell** (`Mono wrap`, `.fw-docs-wrap`), and the four export tables sit in `.fw-docs-scroll`: `DEFAULT_VIEW` alone spells to about 180 characters.
9. **The README note goes** (spec §1.4): the page now holds the long explanations. `infoLabel` stays: other pages' blockquotes are notes.
10. **What stays in the README only:** "Development", "The demo's inspector", the measurement behind the wheel anchor (583 px), `track.ts`, and why `data-board-action` is namespaced — they serve a contributor (spec §1.1).
11. **The prose writes no count that describes the code** ("twelve themes", "six projects"): the tables carry them (PR 4's decision 8).

## Global Constraints

- Everything in the repository is in English; the Polish lives only in `apps/lab/docs-content/pl/`, the `PL` dictionary of `packages/engine/lab-i18n.ts`, and the `PL` table of `packages/engine/lab-docs.ts`.
- No `any`, no non-null assertions; no `Math.min(...arr)` / `Math.max(...arr)` over cells or arrows.
- Comments: say why, once; non-header blocks ≤ 6 lines, module/API headers ≤ 24 lines; cite symbols, never `file.ts:NN`; no PR, task, review or history references (`packages/engine/comments.test.ts`).
- The glossary (`packages/engine/glossary.test.ts`), for every docs page's prose and every description in `lab-docs.ts`: English never piece(s), close/closed, jam, giant(s), probe(s), carve, anticoil, paper, ink, corridor, fragment, absorb…, lateral, jitter, backbite, point grid; no `--flag` outside a code span; never "knob" on this page or in `lab-docs.ts`. Polish never domkn…, zaklin…, zacina/zacię…, sond…, wycię/wycin…, papier, tusz, generacj…, fragment…, siatka punktów, pokrętło; on this page the singular "element" may name the component, the plural forms (elementy, elementów, …) never; in `lab-docs.ts` "element" in any form is refused unless `ALLOWED` names the key, so the new Polish descriptions say "komponent". Field names such as `paper`, `ink`, `pieces` go in code spans. The guard matches substrings: run it, do not trust your eyes.
- `lab-docs.ts` is under `neutral.test.ts`: its text must not contain `document.`, `window.`, `localStorage`, `navigator.`, `HTMLElement` or `Deno.` — descriptions included (so "with `createElement`", never with `document.` before it).
- Markdown rules (PR 1): `#` is the page title, first; every `##` carries `{#id}`, the same in both languages, and both languages have the same number of `###` under each `##`; a literal `<` in prose is `\<` (inside a code span it is not); a colon followed by a letter or digit is `\:` in prose; links are `docs:<page>#<id>` or `https://`; a note (`>`) holds paragraphs only. No link text may be a page's name ("Arrowz", "Lab", "Command line", "Board element").
- `apps/lab` and `packages/board-element` read the engine from `packages/engine/dist/`: after editing `packages/engine/*.ts`, run `pnpm nx build engine` before any lab or element test. On this worktree `pnpm install` is done; run `pnpm nx build engine && pnpm nx build board-element` once before the first lab test.
- Prettier (`printWidth: 120`, no semicolons, single quotes) checks everything in `apps/lab`, its `.md` files included: `pnpm exec prettier --write <files>` from `apps/lab` before each commit. `deno fmt <files>` for `.ts` files under `packages/`; the root `deno.json` excludes `**/*.md`.
- `pnpm run check` and `pnpm run lint` (from `apps/lab`, and from `packages/board-element` when touched) before every such commit; `deno task check` and `deno task lint` (from `packages/engine`, and `packages/cli` when touched) before every engine/CLI commit.
- Tests: `pnpm exec vitest run --project node <files>` and `pnpm exec vitest run --project chromium <files>` from `apps/lab` or `packages/board-element`; `deno test -A <files>` from `packages/engine` or `packages/cli`.
- Never delete or change anything under `packages/cli/boards/`, `dist/` or `node_modules/` — gitignored is not worthless.
- Mutations: commit first, mutate, run, undo by hand — never `git checkout` a file with uncommitted work.
- Every task ends with a commit of exactly the files it lists (`git add <paths>`, never `git add -A`). No attribution lines in commit messages or the PR description; the PR body cites `Bead: arrowz-kkey.5`.
- Jev (`deno task jev:docs`) advises and never gates; its flags are triaged by a person (Task 6).

## Review Focus

1. **A constant changes in the package** (say `MIN_PAD_PX` becomes 20). The page must show the new value with no edit to the docs — Task 3 "every constant shows the value the package exports".
2. **An export is added to or removed from `mod.ts`**, or a function's signature or a type's fields change. The element's README guard must go red naming it — Task 2's tests, with the mutations of Task 2 Step 5.
3. **A phone-width panel (375 px) with the export tables.** `DEFAULT_VIEW`, `THEMES` and the long signatures must not push the panel sideways; a table that is wider scrolls inside its own box — Task 3 "at phone width the export tables scroll inside their boxes, not the panel".
4. **The theme and the dot grid reach the element as the command says.** `--theme=gruvbox-dark` must give the element `theme="gruvbox-dark"`, `--points --point-radius=0.15` its `showPoints` and `pointRadius` — Task 5 "a theme and the dot grid reach the element as the command says".
5. **A language switch on the element page.** Every machine cell (names, types, signatures, values, theme names, licences, swatches) stays; every description changes; nothing is generated again — Task 5 "a language switch changes every description and leaves every machine cell".

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/engine/lab-docs.ts` (+ `lab-docs.test.ts`) | `ELEMENT_TYPES`, `ELEMENT_FUNCTIONS`, `ELEMENT_CONSTANTS`, `ELEMENT_CLASSES`, their row types and keys, `spellValue`; the four description groups and twelve column names in `Docs` (Task 1). |
| `packages/engine/README.md` | The `docs` entry point's new exports (Task 1). |
| `packages/engine/glossary.test.ts`, `packages/cli/scripts/jev-docs.ts` | The four new description groups are read by the glossary and by Jev (Task 1). |
| `packages/board-element/src/readme-api.test.ts` | The Docs tab's export rows held to `mod.ts` both ways; `spellValue` replaces `spell` (Task 2). |
| `apps/lab/src/docs/codeTokens.ts`, `apps/lab/src/docs/TokenSpans.tsx`, `apps/lab/src/docs/DocsTable.tsx` | `NONE` exported, `Mono` moved (with `wrap`), the dispatch to the new tables (Tasks 3, 4). |
| `apps/lab/src/docs/exportTables.ts`, `apps/lab/src/docs/ExportTable.tsx` (+ `ExportTable.browser.test.tsx`) | The four table names (pure, for the content guard) and `::table{of="element-types"|"element-functions"|"element-constants"|"element-classes"}` (Task 3). |
| `apps/lab/src/docs/ThemeTable.tsx` (+ `ThemeTable.browser.test.tsx`) | `::table{of="themes"}` (Task 4). |
| `apps/lab/src/docs/shape.ts` | The five new `of` names (Tasks 3, 4). |
| `apps/lab/src/design/docs.css` | `.fw-docs-wrap`, the swatches (Tasks 3, 4). |
| `apps/lab/docs-content/{en,pl}/element.md` | The page (Task 5). |
| `apps/lab/src/docs/ElementPage.browser.test.tsx`, `apps/lab/src/routes/DocsNav.browser.test.tsx`, `apps/lab/src/docs/DocsBoard.browser.test.tsx` | Tests against the new page (Task 5). |

Suggested models for subagent-driven execution: Sonnet for Tasks 1, 3, 4; Opus for Task 2 (the checker guard) and Task 5 (the longest prose and its claims); Fable for the whole-branch review.

---

### Task 1: The export rows, their descriptions and `spellValue` in the engine

**Files:**
- Modify: `packages/engine/lab-docs.ts`, `packages/engine/lab-docs.test.ts`, `packages/engine/README.md`, `packages/engine/glossary.test.ts`, `packages/cli/scripts/jev-docs.ts`
- Test: `packages/engine/lab-docs.test.ts`, `packages/engine/readme.test.ts`, `packages/engine/glossary.test.ts`, `packages/engine/neutral.test.ts`, `packages/cli/scripts/jev-docs.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (from `@arrowz/engine/docs`):
  - `type ExportSource = '@arrowz/board-element' | '@arrowz/engine'`
  - `interface TypeRow { readonly key: string; readonly from: ExportSource; readonly shape: string }` — `shape` is the fields joined by `', '`, or for a union its members as `'literal'`s joined by `' | '`.
  - `interface FunctionRow { readonly key: string; readonly signature: string }` — `name(params): Return`, as `checker.signatureToString` prints it after the name.
  - `interface ConstantRow { readonly key: string }`
  - `interface ClassRow { readonly key: string; readonly create: string; readonly members: readonly string[] }` — `create` is `new Name(param: Type, …)`; `members` are getters by name and methods as `name(param, …)`; empty for `ArrowzBoard`.
  - `ELEMENT_TYPES` (21 rows), `ELEMENT_FUNCTIONS` (8), `ELEMENT_CONSTANTS` (20), `ELEMENT_CLASSES` (2); `TypeKey`, `FunctionKey`, `ConstantKey`, `ClassKey`.
  - `spellValue(value: unknown): string`
  - `Docs` gains `types`, `functions`, `constants`, `classes` (records by key) and `colFrom`, `colShape`, `colFunction`, `colConstant`, `colValue`, `colClass`, `colCreate`, `colMembers`, `colTheme`, `colColours`, `colSource`, `colLicence`.

- [ ] **Step 1: Write the failing tests**

In `packages/engine/lab-docs.test.ts`, change the import to:

```ts
import {
  type Docs,
  docsFor,
  ELEMENT_CLASSES,
  ELEMENT_CONSTANTS,
  ELEMENT_EVENTS,
  ELEMENT_FUNCTIONS,
  ELEMENT_MEMBERS,
  ELEMENT_PROPS,
  ELEMENT_SLOTS,
  ELEMENT_TYPES,
  spellValue,
} from './lab-docs.ts'
```

and add, after the test `'every lab table description is in both languages, and translated'`:

```ts
// The export tables' rows are held to the element's `mod.ts` by its README guard
// (`readme-api.test.ts`); here only that each description is text, translated.
Deno.test('every export description is in both languages, and translated', () => {
  const en = docsFor('en')
  const pl = docsFor('pl')
  const groups = [
    ['types', ELEMENT_TYPES],
    ['functions', ELEMENT_FUNCTIONS],
    ['constants', ELEMENT_CONSTANTS],
    ['classes', ELEMENT_CLASSES],
  ] as const
  let seen = 0
  for (const [group, rows] of groups) {
    const enRows: Readonly<Record<string, string>> = en[group]
    const plRows: Readonly<Record<string, string>> = pl[group]
    for (const row of rows) {
      seen++
      assert((enRows[row.key] ?? '').trim().length > 0, `EN ${group}.${row.key}`)
      assert((plRows[row.key] ?? '').trim().length > 0, `PL ${group}.${row.key}`)
      assertNotEquals(plRows[row.key], enRows[row.key], `${group}.${row.key} is still English in the Polish docs`)
    }
  }
  assertEquals(seen, 21 + 8 + 20 + 2)
})

Deno.test('spellValue writes a constant as the tables do', () => {
  assertEquals(spellValue(4), '4')
  assertEquals(spellValue(false), 'false')
  assertEquals(spellValue('#c9c9d6'), "'#c9c9d6'")
  assertEquals(spellValue([]), '[]')
  assertEquals(spellValue(['#fff', 2]), "['#fff', 2]")
  assertEquals(spellValue({ min: 0, max: 16 }), '{ min: 0, max: 16 }')
  assertEquals(spellValue({ stroke: 0.5, palette: [] }), '{ stroke: 0.5, palette: [] }')
  // An object of objects is too long to spell: its keys stand for it.
  assertEquals(spellValue({ en: { a: 'x' }, pl: { a: 'y' } }), '{ en, pl }')
})
```

and in the comment above `'the frame around the tables is translated too'`, change "Twenty-one strings exist today (twenty `col*` and `infoLabel`)" to "Thirty-three strings exist today (thirty-two `col*` and `infoLabel`)".

```bash
cd packages/engine && deno test -A lab-docs.test.ts
```

Expected: FAIL — `ELEMENT_TYPES` is not exported.

- [ ] **Step 2: The rows, the keys and `spellValue`**

In `packages/engine/lab-docs.ts`, after `export type SlotKey = …`, add:

```ts
/** The package an exported type is declared in: the element's own, or the engine, which it re-exports. */
export type ExportSource = '@arrowz/board-element' | '@arrowz/engine'

/** One exported type: where it is declared, and its fields — or, for a union, its members as literals. */
export interface TypeRow {
  readonly key: string
  readonly from: ExportSource
  readonly shape: string
}

/** One exported function and its signature, as the compiler prints it. */
export interface FunctionRow {
  readonly key: string
  readonly signature: string
}

/** One exported constant, by name: the lab reads its value from the package itself. */
export interface ConstantRow {
  readonly key: string
}

/** One exported class: how to construct it, and its public members (none listed for the element: its tables come first). */
export interface ClassRow {
  readonly key: string
  readonly create: string
  readonly members: readonly string[]
}

export const ELEMENT_TYPES = [
  { key: 'BoardData', from: '@arrowz/engine', shape: 'W, H, owner, pieces' },
  {
    key: 'BoardView',
    from: '@arrowz/board-element',
    shape: 'stroke, headWidth, headHeight, rounded, colored, top, voids, ink, paper, highlight, palette',
  },
  {
    key: 'BoardViewport',
    from: '@arrowz/board-element',
    shape: 'cellPx, originX, originY, fitted, hostWidth, hostHeight',
  },
  { key: 'BoardColours', from: '@arrowz/engine', shape: 'paper, ink, highlight, palette' },
  { key: 'BoardTheme', from: '@arrowz/engine', shape: 'paper, ink, highlight, palette, source, licence, url' },
  {
    key: 'BoardLabels',
    from: '@arrowz/board-element',
    shape:
      'zoomIn, zoomOut, fit, dragHint, dragPlayHintMac, dragPlayHintOther, dragInspectHintMac, dragInspectHintOther, clickHintMac, clickHintOther, gesturesMac, gesturesOther, gesturesInspectMac, gesturesInspectOther, colors, noWebgl',
  },
  { key: 'BoardLang', from: '@arrowz/board-element', shape: "'en' | 'pl'" },
  { key: 'GestureMode', from: '@arrowz/board-element', shape: "'drag' | 'click'" },
  { key: 'GameEvent', from: '@arrowz/board-element', shape: "'piece-removed' | 'life-lost' | 'finished'" },
  { key: 'GameTarget', from: '@arrowz/board-element', shape: 'animateExit, shake, emit' },
  { key: 'Session', from: '@arrowz/engine', shape: 'board, gone, index, left, status' },
  { key: 'SessionSnapshot', from: '@arrowz/engine', shape: 'v, board, removed, colored' },
  { key: 'PieceClickEvent', from: '@arrowz/board-element', shape: 'pieceId' },
  { key: 'PieceRemovedEvent', from: '@arrowz/board-element', shape: 'pieceId, left' },
  { key: 'LifeLostEvent', from: '@arrowz/board-element', shape: 'pieceId, blockerId, distance' },
  { key: 'FinishedEvent', from: '@arrowz/board-element', shape: 'pieces' },
  {
    key: 'ViewportChangeEvent',
    from: '@arrowz/board-element',
    shape: 'cellPx, originX, originY, fitted, hostWidth, hostHeight',
  },
  { key: 'ColoredChangeEvent', from: '@arrowz/board-element', shape: 'colored' },
  { key: 'ColoredChangeDetail', from: '@arrowz/board-element', shape: 'colored' },
  { key: 'GesturesChangeEvent', from: '@arrowz/board-element', shape: 'mode' },
  { key: 'GesturesChangeDetail', from: '@arrowz/board-element', shape: 'mode' },
] as const satisfies readonly TypeRow[]

export const ELEMENT_FUNCTIONS = [
  { key: 'resolveColours', signature: 'resolveColours(theme: string, stated: Partial<BoardColours>): BoardColours' },
  { key: 'themeOf', signature: 'themeOf(name: string): BoardTheme | null' },
  { key: 'assignPalette', signature: 'assignPalette(board: BoardData, n: number): Int32Array<ArrayBufferLike>' },
  { key: 'hueOf', signature: 'hueOf(id: number): string' },
  { key: 'hueDegrees', signature: 'hueDegrees(id: number): number' },
  { key: 'hueBytes', signature: 'hueBytes(id: number): [number, number, number]' },
  { key: 'boardViewOf', signature: 'boardViewOf(view: View, voids: boolean): Partial<BoardView>' },
  { key: 'labelsFor', signature: 'labelsFor(lang: string | null | undefined): BoardLabels' },
] as const satisfies readonly FunctionRow[]

export const ELEMENT_CONSTANTS = [
  { key: 'DEFAULT_PAD' },
  { key: 'DEFAULT_SHOW_POINTS' },
  { key: 'DEFAULT_POINT_COLOR' },
  { key: 'DEFAULT_POINT_RADIUS' },
  { key: 'PAD_RANGE' },
  { key: 'POINT_RADIUS_RANGE' },
  { key: 'DEFAULT_VIEW' },
  { key: 'THEMES' },
  { key: 'BOARD_LABELS' },
  { key: 'GESTURE_STORAGE_KEY' },
  { key: 'ZOOM_STEP' },
  { key: 'WHEEL_RATE' },
  { key: 'MAX_CELL_PX' },
  { key: 'MIN_PAD_PX' },
  { key: 'MIN_POINT_CELL_PX' },
  { key: 'EXIT_SPEED' },
  { key: 'EXIT_MIN_MS' },
  { key: 'EXIT_MAX_MS' },
  { key: 'SHAKE_MS' },
  { key: 'MIN_SHAKE_CELLS' },
] as const satisfies readonly ConstantRow[]

export const ELEMENT_CLASSES = [
  { key: 'ArrowzBoard', create: 'new ArrowzBoard()', members: [] },
  {
    key: 'GameHost',
    create: 'new GameHost(target: GameTarget)',
    members: ['goneIds', 'board', 'isGone(pieceId)', 'setBoard(board)', 'click(pieceId)', 'save(colored)', 'load(snap)'],
  },
] as const satisfies readonly ClassRow[]

export type TypeKey = (typeof ELEMENT_TYPES)[number]['key']
export type FunctionKey = (typeof ELEMENT_FUNCTIONS)[number]['key']
export type ConstantKey = (typeof ELEMENT_CONSTANTS)[number]['key']
export type ClassKey = (typeof ELEMENT_CLASSES)[number]['key']

/**
 * A constant's value as the Docs tab and the element's README write it: a
 * string quoted, a list in brackets, an object as `{ key: value }`, and an
 * object of objects (`THEMES`, `BOARD_LABELS`) as its keys alone.
 */
export function spellValue(value: unknown): string {
  if (typeof value === 'string') return `'${value}'`
  if (Array.isArray(value)) return `[${value.map(spellValue).join(', ')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
    if (entries.some(([, v]) => typeof v === 'object' && v !== null && !Array.isArray(v))) {
      return `{ ${entries.map(([k]) => k).join(', ')} }`
    }
    return `{ ${entries.map(([k, v]) => `${k}: ${spellValue(v)}`).join(', ')} }`
  }
  return String(value)
}
```

Every row above was printed by the TypeScript checker over `mod.ts` while this plan was written; Task 2's guard holds them.

- [ ] **Step 3: The `Docs` fields**

In `interface Docs`, after `readonly env: Record<EnvVar, string>`, add:

```ts
  /** The export tables' descriptions, by export name. */
  readonly types: Record<TypeKey, string>
  readonly functions: Record<FunctionKey, string>
  readonly constants: Record<ConstantKey, string>
  readonly classes: Record<ClassKey, string>
```

and after `readonly colDetail: string`, add:

```ts
  /** The export tables' columns; the type table's first column is the shared `colType`. */
  readonly colFrom: string
  readonly colShape: string
  readonly colFunction: string
  readonly colConstant: string
  readonly colValue: string
  readonly colClass: string
  readonly colCreate: string
  readonly colMembers: string
  /** The theme table's columns. */
  readonly colTheme: string
  readonly colColours: string
  readonly colSource: string
  readonly colLicence: string
```

In `EN`, after `env: { … },`, add:

```ts
  types: {
    BoardData:
      "What the element draws: the size, the arrow each cell belongs to (`-1` a cell no arrow covers, `-2` a cell the generator left empty) and the arrows. The engine's `Board` is one.",
    BoardView:
      'The drawing options `view` takes: line, arrowhead, rounding, colour, highlight, empty cells and the four colours. Every field is optional on the property.',
    BoardViewport: "The view on screen: pixels per cell, where the board's corner sits, whether it is fitted, and the host's size.",
    BoardColours: 'The four colours a board is drawn in: background, arrows, highlight and the multicolour palette.',
    BoardTheme: 'A built-in theme: its four colours, and the project it comes from with its licence and address.',
    BoardLabels:
      'Every string the element shows: the buttons, the hints for each gesture mode and platform, and the message when there is no WebGL.',
    BoardLang: 'The two languages of those strings.',
    GestureMode: "The rule the mouse and pen follow: with `'drag'` a plain drag pans, with `'click'` a drag with the modifier does.",
    GameEvent:
      'One of the three game events as the game host hands it to its target: a `type` naming the event and the `detail` of that event.',
    GameTarget: 'What `GameHost` drives: the two animations and `emit`. The element is one.',
    Session: 'A game in progress: the board, which arrows have left, how many are still on the board, and whether it is won. `index` is internal.',
    SessionSnapshot: 'A saved game: a version, the board it belongs to (with its fingerprint), the arrows removed and the colour choice.',
    PieceClickEvent: 'The `piece-click` event: its `detail` names the arrow.',
    PieceRemovedEvent: 'The `piece-removed` event: the arrow, and how many are still on the board.',
    LifeLostEvent: 'The `life-lost` event: the arrow, the one that stops it, and how far it gets before it bounces.',
    FinishedEvent: 'The `finished` event: how many arrows the board had.',
    ViewportChangeEvent: 'The `viewport-change` event: the view, as `viewport` reads it.',
    ColoredChangeEvent: 'The `colored-change` event; cancelable.',
    ColoredChangeDetail: "That event's detail: the colour state the button asks for.",
    GesturesChangeEvent: 'The `gestures-change` event: the new gesture mode.',
    GesturesChangeDetail: "That event's detail: the mode now in force.",
  },
  functions: {
    resolveColours: 'The colours a board is drawn with: the defaults, then the named theme, then `stated`, field by field.',
    themeOf: 'The built-in theme of that name, or null. An unknown name is ignored, never thrown on.',
    assignPalette: "A colour index for each arrow: never a neighbour's, and among the free ones the least used so far.",
    hueOf: "An arrow's diagnostic hue as CSS, from its id, not from its place in the list.",
    hueDegrees: "That hue's angle, in degrees.",
    hueBytes: 'That hue as red, green and blue bytes.',
    boardViewOf:
      "The lab's and the command line's `View` as the element takes it; `cell`, a size in the exported SVG, does not apply.",
    labelsFor: 'The strings for a language tag: Polish for `pl` or any `pl-…` tag, English otherwise.',
  },
  constants: {
    DEFAULT_PAD: 'Cells of margin when `pad` is not set.',
    DEFAULT_SHOW_POINTS: 'The dot grid is off unless asked for.',
    DEFAULT_POINT_COLOR: "The dot grid's colour.",
    DEFAULT_POINT_RADIUS: "The dots' radius, in cells.",
    PAD_RANGE: 'The margin a board may be given, in cells.',
    POINT_RADIUS_RANGE: "A dot's radius in cells; past half a cell it would overlap its neighbours.",
    DEFAULT_VIEW: 'What an empty `view` is merged over.',
    THEMES: 'The built-in themes by name, as the theme table shows them.',
    BOARD_LABELS: "The element's strings in each language.",
    GESTURE_STORAGE_KEY: "The key the browser keeps the player's gesture choice under.",
    ZOOM_STEP: 'The factor one button or key press zooms by.',
    WHEEL_RATE: "The wheel's zoom rate: each turn scales by `exp(-deltaY * WHEEL_RATE)`.",
    MAX_CELL_PX: 'The closest zoom, in pixels per cell.',
    MIN_PAD_PX: 'The narrowest margin on screen, in pixels, unless `pad` is 0.',
    MIN_POINT_CELL_PX: 'Below this many pixels per cell the dot grid hides itself.',
    EXIT_SPEED: 'Cells per second a leaving arrow covers.',
    EXIT_MIN_MS: 'The shortest ride off the board, in milliseconds.',
    EXIT_MAX_MS: 'The longest ride off the board, in milliseconds.',
    SHAKE_MS: "How long a blocked arrow's bounce takes, in milliseconds.",
    MIN_SHAKE_CELLS: 'The shortest bounce, in cells, so a blocker right in front still shows.',
  },
  classes: {
    ArrowzBoard: 'The element itself, usually written as a tag in HTML. Its members are in the tables above.',
    GameHost: 'Runs a game on any `GameTarget`, outside the element too.',
  },
```

and after `colDetail: 'Detail',`:

```ts
  colFrom: 'From',
  colShape: 'Shape',
  colFunction: 'Function',
  colConstant: 'Constant',
  colValue: 'Value',
  colClass: 'Class',
  colCreate: 'Created with',
  colMembers: 'Members',
  colTheme: 'Theme',
  colColours: 'Colours',
  colSource: 'Source',
  colLicence: 'Licence',
```

In `PL`, after `env: { … },`, add:

```ts
  types: {
    BoardData:
      'To, co rysuje komponent: rozmiar, strzałka, do której należy każda komórka (`-1` komórka bez strzałki, `-2` komórka, którą generator zostawił pustą), i same strzałki. `Board` z silnika jest takim obiektem.',
    BoardView:
      'Opcje rysowania, które przyjmuje `view`: linia, grot, zaokrąglenie, kolor, wyróżnienie, puste komórki i cztery kolory. We właściwości każde pole jest opcjonalne.',
    BoardViewport: 'Widok na ekranie: piksele na komórkę, położenie rogu planszy, czy jest dopasowana, i rozmiar kontenera.',
    BoardColours: 'Cztery kolory, w których rysuje się plansza: tło, strzałki, wyróżnienie i paleta wielobarwna.',
    BoardTheme: 'Wbudowany motyw: jego cztery kolory oraz projekt, z którego pochodzi, z licencją i adresem.',
    BoardLabels:
      'Każdy napis, który pokazuje komponent: przyciski, podpowiedzi dla każdego trybu gestów i systemu oraz komunikat, gdy brak WebGL.',
    BoardLang: 'Dwa języki tych napisów.',
    GestureMode:
      "Reguła dla myszy i pióra: przy `'drag'` przesuwa zwykłe przeciągnięcie, przy `'click'` przeciągnięcie z klawiszem modyfikującym.",
    GameEvent:
      'Jedno z trzech zdarzeń gry, tak jak host gry przekazuje je celowi: `type` nazywa zdarzenie, a `detail` to jego szczegóły.',
    GameTarget: 'To, czym steruje `GameHost`: dwie animacje i `emit`. Komponent jest jednym z celów.',
    Session: 'Trwająca gra: plansza, które strzałki już wyjechały, ile zostało na planszy i czy gra jest wygrana. `index` jest wewnętrzny.',
    SessionSnapshot: 'Zapisana gra: wersja, plansza, do której należy (z jej odciskiem), usunięte strzałki i wybór koloru.',
    PieceClickEvent: 'Zdarzenie `piece-click`: jego `detail` wskazuje strzałkę.',
    PieceRemovedEvent: 'Zdarzenie `piece-removed`: strzałka i ile ich zostało na planszy.',
    LifeLostEvent: 'Zdarzenie `life-lost`: strzałka, ta, która ją zatrzymuje, i jak daleko dojedzie przed odbiciem.',
    FinishedEvent: 'Zdarzenie `finished`: ile strzałek miała plansza.',
    ViewportChangeEvent: 'Zdarzenie `viewport-change`: widok taki, jaki zwraca `viewport`.',
    ColoredChangeEvent: 'Zdarzenie `colored-change`; można je anulować.',
    ColoredChangeDetail: 'Szczegóły tego zdarzenia: stan koloru, o który prosi przycisk.',
    GesturesChangeEvent: 'Zdarzenie `gestures-change`: nowy tryb gestów.',
    GesturesChangeDetail: 'Szczegóły tego zdarzenia: tryb, który teraz obowiązuje.',
  },
  functions: {
    resolveColours: 'Kolory, w których rysuje się plansza: domyślne, potem nazwany motyw, potem `stated`, pole po polu.',
    themeOf: 'Wbudowany motyw o tej nazwie albo null. Nieznana nazwa jest pomijana i nigdy nie rzuca wyjątku.',
    assignPalette: 'Indeks koloru dla każdej strzałki: nigdy taki jak u sąsiada, a spośród wolnych najrzadziej dotąd użyty.',
    hueOf: 'Odcień diagnostyczny strzałki jako CSS, liczony z jej identyfikatora, nie z miejsca na liście.',
    hueDegrees: 'Kąt tego odcienia, w stopniach.',
    hueBytes: 'Ten odcień jako bajty czerwieni, zieleni i błękitu.',
    boardViewOf:
      'Typ `View` laboratorium i wiersza poleceń w postaci, którą przyjmuje komponent; `cell`, rozmiar w eksportowanym SVG, tu nie ma zastosowania.',
    labelsFor: 'Napisy dla znacznika języka: polskie dla `pl` i każdego `pl-…`, w przeciwnym razie angielskie.',
  },
  constants: {
    DEFAULT_PAD: 'Margines w komórkach, gdy `pad` nie jest ustawione.',
    DEFAULT_SHOW_POINTS: 'Siatka kropek jest wyłączona, dopóki ktoś jej nie zażąda.',
    DEFAULT_POINT_COLOR: 'Kolor siatki kropek.',
    DEFAULT_POINT_RADIUS: 'Promień kropek, w komórkach.',
    PAD_RANGE: 'Margines, jaki można dać planszy, w komórkach.',
    POINT_RADIUS_RANGE: 'Promień kropki w komórkach; powyżej pół komórki nachodziłaby na sąsiednie.',
    DEFAULT_VIEW: 'To, na co nakłada się pusty `view`.',
    THEMES: 'Wbudowane motywy po nazwie, tak jak pokazuje je tabela motywów.',
    BOARD_LABELS: 'Napisy komponentu w każdym języku.',
    GESTURE_STORAGE_KEY: 'Klucz, pod którym przeglądarka trzyma wybór gestu gracza.',
    ZOOM_STEP: 'Krotność powiększenia jednym przyciskiem albo klawiszem.',
    WHEEL_RATE: 'Tempo powiększania kółkiem: każdy obrót skaluje o `exp(-deltaY * WHEEL_RATE)`.',
    MAX_CELL_PX: 'Największe powiększenie, w pikselach na komórkę.',
    MIN_PAD_PX: 'Najwęższy margines na ekranie, w pikselach, chyba że `pad` wynosi 0.',
    MIN_POINT_CELL_PX: 'Poniżej tylu pikseli na komórkę siatka kropek sama się chowa.',
    EXIT_SPEED: 'Ile komórek na sekundę pokonuje wyjeżdżająca strzałka.',
    EXIT_MIN_MS: 'Najkrótszy przejazd poza planszę, w milisekundach.',
    EXIT_MAX_MS: 'Najdłuższy przejazd poza planszę, w milisekundach.',
    SHAKE_MS: 'Ile trwa odbicie zablokowanej strzałki, w milisekundach.',
    MIN_SHAKE_CELLS: 'Najkrótsze odbicie, w komórkach, żeby było widać nawet blokadę tuż przed grotem.',
  },
  classes: {
    ArrowzBoard: 'Sam komponent, zwykle zapisywany jako znacznik w HTML. Jego składowe są w tabelach wyżej.',
    GameHost: 'Prowadzi grę na dowolnym `GameTarget`, także poza komponentem.',
  },
```

and after `colDetail: 'Szczegóły',`:

```ts
  colFrom: 'Skąd',
  colShape: 'Kształt',
  colFunction: 'Funkcja',
  colConstant: 'Stała',
  colValue: 'Wartość',
  colClass: 'Klasa',
  colCreate: 'Tworzenie',
  colMembers: 'Składowe',
  colTheme: 'Motyw',
  colColours: 'Kolory',
  colSource: 'Źródło',
  colLicence: 'Licencja',
```

Check the facts the descriptions state, each against its source, before going on: `Session.left` ("pieces still on the board", `game.ts`); `FinishedEvent.pieces` (`session.board.pieces.length`, `game-host.ts`); `owner` −1/−2 (`types.ts`); `zoomBy`'s and the wheel's clamp (`viewport.ts`); `MIN_PAD_PX` and `pad` 0 (`viewport.ts`); `resolveColours` order (`look.ts`); `themeOf` never throws; `labelsFor` (`i18n.ts`); `GameHost.click` and `load` (`game-host.ts`). Fix the description, not the code, where they differ, and say so in your report.

- [ ] **Step 4: The glossary and Jev read the new groups**

In `packages/engine/glossary.test.ts`, `docsRows`: the group list becomes

```ts
  return ([
    'props',
    'members',
    'events',
    'slots',
    'types',
    'functions',
    'constants',
    'classes',
    'keys',
    'palette',
    'linkFields',
    'env',
  ] as const)
```

In `packages/cli/scripts/jev-docs.ts`, `DESCRIPTION_GROUPS.element` becomes `['props', 'members', 'events', 'slots', 'types', 'functions', 'constants', 'classes']`.

- [ ] **Step 5: The engine README**

In `packages/engine/README.md`, section `### @arrowz/engine/docs`:
- the Function table gains, in alphabetical order, `` | `spellValue` | `(value: unknown) => string` | A constant's value as the Docs tab and the element's README write it: strings quoted, objects as `{ key: value }`, an object of objects as its keys. | ``;
- the Constant table gains `` | `ELEMENT_CLASSES` | 2 `ClassRow`s | The element package's exported classes: how each is constructed, and its members. | ``, `` | `ELEMENT_CONSTANTS` | 20 `ConstantRow`s | The element package's exported constants, by name. | ``, `` | `ELEMENT_FUNCTIONS` | 8 `FunctionRow`s | The element package's exported functions, with their signatures. | ``, `` | `ELEMENT_TYPES` | 21 `TypeRow`s | The element package's exported types: where each is declared, and its fields or members. | ``, keeping the table's order;
- the Type table gains, in alphabetical order among the existing rows:

```md
| `ClassKey` | `(typeof ELEMENT_CLASSES)[number]['key']` | The name of a class row. |
| `ClassRow` | `{ readonly key: string; readonly create: string; readonly members: readonly string[] }` | One exported class: how to construct it, and its public members. |
| `ConstantKey` | `(typeof ELEMENT_CONSTANTS)[number]['key']` | The name of a constant row. |
| `ConstantRow` | `{ readonly key: string }` | One exported constant, by name; the lab reads its value from the package. |
| `ExportSource` | `'@arrowz/board-element' \| '@arrowz/engine'` | The package an exported type is declared in. |
| `FunctionKey` | `(typeof ELEMENT_FUNCTIONS)[number]['key']` | The name of a function row. |
| `FunctionRow` | `{ readonly key: string; readonly signature: string }` | One exported function and its signature. |
| `TypeKey` | `(typeof ELEMENT_TYPES)[number]['key']` | The name of a type row. |
| `TypeRow` | `{ readonly key: string; readonly from: ExportSource; readonly shape: string }` | One exported type: its package, and its fields or members. |
```

- and the `Docs` row's shape gains `readonly types: Record<TypeKey, string>; readonly functions: Record<FunctionKey, string>; readonly constants: Record<ConstantKey, string>; readonly classes: Record<ClassKey, string>;` after `readonly env: Record<EnvVar, string>;`, and the twelve `readonly colFrom: string; …; readonly colLicence: string;` after `readonly colDetail: string;`, in the order Step 3 declares them.

```bash
cd packages/engine && deno test -A readme.test.ts
```

The guard prints the exact cell it expects for every shape it compares; copy it where your row differs.

- [ ] **Step 6: Run the engine's tests**

```bash
cd packages/engine && deno fmt lab-docs.ts lab-docs.test.ts glossary.test.ts && deno test -A lab-docs.test.ts readme.test.ts glossary.test.ts neutral.test.ts comments.test.ts && deno task check && deno task lint
cd ../cli && deno fmt scripts/jev-docs.ts && deno test -A scripts/jev-docs.test.ts && deno task check && deno task lint
```

Expected: PASS. A glossary failure names its path: reword the description, do not add to `ALLOWED`.

- [ ] **Step 7: Commit**

```bash
pnpm nx build engine
git add packages/engine/lab-docs.ts packages/engine/lab-docs.test.ts packages/engine/README.md packages/engine/glossary.test.ts packages/cli/scripts/jev-docs.ts
git commit -m "engine: the board element's export rows and their descriptions for the Docs tab, and spellValue"
```

---

### Task 2: The element's README guard holds the Docs export rows to `mod.ts`

**Files:**
- Modify: `packages/board-element/src/readme-api.test.ts`
- Test: the same file

**Interfaces:**
- Consumes: `ELEMENT_TYPES`, `ELEMENT_FUNCTIONS`, `ELEMENT_CONSTANTS`, `ELEMENT_CLASSES`, `spellValue` from `@arrowz/engine/docs` (Task 1).
- Produces: nothing a later task imports; a red guard when the rows and `mod.ts` disagree.

- [ ] **Step 1: Write the tests**

In `packages/board-element/src/readme-api.test.ts`:

1. Add to the header, after its first paragraph's last sentence, one sentence: "The Docs tab's export tables (`lab-docs.ts` in the engine) are held to the same reading of `mod.ts`, at the end of this file."
2. Add the import `import { ELEMENT_CLASSES, ELEMENT_CONSTANTS, ELEMENT_FUNCTIONS, ELEMENT_TYPES, spellValue } from '@arrowz/engine/docs'`.
3. Delete the local `spell` function and its doc comment; in `'every constant row spells the value the package exports'`, call `spellValue(values[name])`.
4. Append:

```ts
// --- The Docs tab's export tables ------------------------------------------------

const DOCS_TABLES = {
  type: ELEMENT_TYPES,
  function: ELEMENT_FUNCTIONS,
  constant: ELEMENT_CONSTANTS,
  class: ELEMENT_CLASSES,
} as const

/** The table an export belongs in, by its declaration. */
function kindOf(symbol: ts.Symbol): keyof typeof DOCS_TABLES {
  const decl = symbol.declarations?.[0]
  if (decl === undefined) throw new Error(`${symbol.name} has no declaration`)
  if (ts.isFunctionDeclaration(decl)) return 'function'
  if (ts.isVariableDeclaration(decl)) return 'constant'
  if (ts.isClassDeclaration(decl)) return 'class'
  if (ts.isInterfaceDeclaration(decl) || ts.isTypeAliasDeclaration(decl)) return 'type'
  throw new Error(`${symbol.name} is a ${ts.SyntaxKind[decl.kind]}, which no table holds`)
}

test('the Docs tab lists every export once, in the table of its kind, and nothing else', () => {
  const listed = Object.values(DOCS_TABLES).flatMap((rows) => rows.map((row) => row.key))
  const twice = listed.filter((key, i) => listed.indexOf(key) !== i)
  expect(twice, 'listed twice').toEqual([])
  expect(sorted(listed)).toEqual(sorted(exports.keys()))
  for (const [kind, rows] of Object.entries(DOCS_TABLES)) {
    for (const row of rows) {
      const symbol = exports.get(row.key)
      if (symbol === undefined) throw new Error(`${row.key} is not exported`)
      expect(kindOf(symbol), row.key).toBe(kind)
    }
  }
})

/** The package a type is declared in: the engine's resolve to its emitted declarations. */
function packageOf(symbol: ts.Symbol): string {
  const file = symbol.declarations?.[0]?.getSourceFile().fileName ?? ''
  return file.includes('/engine/dist/') ? '@arrowz/engine' : '@arrowz/board-element'
}

/** A Shape cell read back: a union's literals unquoted, or a list of fields. */
function itemsOf(shape: string): { by: 'fields' | 'literals'; values: string[] } {
  if (shape.startsWith("'")) return { by: 'literals', values: shape.split(' | ').map((item) => item.slice(1, -1)) }
  return { by: 'fields', values: shape.split(', ') }
}

test('every Docs type row names its package and spells the shape the type declares', () => {
  for (const row of ELEMENT_TYPES) {
    const symbol = exports.get(row.key)
    if (symbol === undefined) throw new Error(`${row.key} is not exported`)
    expect(row.from, `package of ${row.key}`).toBe(packageOf(symbol))
    const declared = shapeOf(symbol)
    const written = itemsOf(row.shape)
    expect(written.by, `shape of ${row.key}`).toBe(declared.by)
    expect(sorted(written.values), `shape of ${row.key}`).toEqual(sorted(declared.values))
  }
})

test('every Docs function row spells the signature the function declares', () => {
  for (const row of ELEMENT_FUNCTIONS) {
    const decl = exports.get(row.key)?.declarations?.[0]
    if (decl === undefined || !ts.isFunctionDeclaration(decl)) throw new Error(`${row.key} is not a function declaration`)
    const signature = checker.getSignatureFromDeclaration(decl)
    if (signature === undefined) throw new Error(`${row.key} has no signature`)
    expect(row.signature).toBe(`${row.key}${checker.signatureToString(signature)}`)
  }
})

test('every Docs class row spells its constructor and its public members', () => {
  for (const row of ELEMENT_CLASSES) {
    const decl = exports.get(row.key)?.declarations?.[0]
    if (decl === undefined || !ts.isClassDeclaration(decl)) throw new Error(`${row.key} is not a class declaration`)
    const ctor = decl.members.find(ts.isConstructorDeclaration)
    if (ctor === undefined) throw new Error(`${row.key} declares no constructor`)
    const params = ctor.parameters.map((p) => `${p.name.getText()}: ${p.type?.getText() ?? 'unknown'}`)
    expect(row.create, `constructor of ${row.key}`).toBe(`new ${row.key}(${params.join(', ')})`)
    // The element's members have tables of their own, above the export tables.
    if (row.key === 'ArrowzBoard') {
      expect(row.members).toEqual([])
      continue
    }
    const { methods, getters } = publicMembers(decl)
    const spelled = [...getters, ...[...methods].map(([name, names]) => `${name}(${names.join(', ')})`)]
    expect(sorted(row.members), `members of ${row.key}`).toEqual(sorted(spelled))
  }
})
```

`exports`, `checker`, `shapeOf`, `publicMembers` and `sorted` are the file's own, defined above; `kindOf` throws on an export of a kind no table holds, which is the failure a new kind of export should give.

- [ ] **Step 2: Run them**

```bash
pnpm nx build engine
cd packages/board-element && pnpm exec vitest run --project node src/readme-api.test.ts
```

Expected: PASS. A failure here is a row of Task 1 the checker reads otherwise: fix the row in `lab-docs.ts` (rebuild the engine), not the test, and report it.

- [ ] **Step 3: Check that the guard can fail**

Commit nothing yet. For each mutation, edit, rebuild the engine (`pnpm nx build engine`), run Step 2's command, see it fail naming the row, undo by hand:
- `ELEMENT_TYPES`: `GestureMode`'s shape `"'drag' | 'tap'"`;
- `ELEMENT_TYPES`: `BoardTheme`'s `from` `'@arrowz/board-element'`;
- `ELEMENT_FUNCTIONS`: `themeOf`'s signature `'themeOf(name: string): BoardTheme'`;
- `ELEMENT_CONSTANTS`: delete `{ key: 'SHAKE_MS' }`;
- `ELEMENT_CLASSES`: drop `'save(colored)'` from `GameHost`'s members;
- `packages/board-element/src/mod.ts`: export a new `export const DOCS_PROBE = 1` (undo it).

Record the six failures in your report.

- [ ] **Step 4: The rest of the element's gates**

```bash
cd packages/board-element && pnpm exec vitest run --project node && pnpm run check && deno lint && deno fmt --check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/board-element/src/readme-api.test.ts
git commit -m "board-element: the README guard holds the Docs tab's export rows to mod.ts both ways"
```

---

### Task 3: The four export tables

**Files:**
- Create: `apps/lab/src/docs/exportTables.ts`, `apps/lab/src/docs/ExportTable.tsx`, `apps/lab/src/docs/ExportTable.browser.test.tsx`
- Modify: `apps/lab/src/docs/codeTokens.ts` (export `NONE`), `apps/lab/src/docs/TokenSpans.tsx` (gains `Mono`), `apps/lab/src/docs/DocsTable.tsx`, `apps/lab/src/docs/shape.ts`, `apps/lab/src/design/docs.css`

**Interfaces:**
- Consumes: Task 1's rows, keys, `spellValue` and column names, from `@arrowz/engine/docs`.
- Produces:
  - `export const NONE = '—'` in `codeTokens.ts`;
  - `export function Mono({ text, column, wrap }: { text: string; column: CellRole; wrap?: boolean }): ReactElement` in `TokenSpans.tsx`;
  - `EXPORT_TABLES`, `type ExportOf = 'element-types' | 'element-functions' | 'element-constants' | 'element-classes'` and `isExportOf(of: string): of is ExportOf` in `exportTables.ts` — a pure module, because `shape.ts` runs in Vitest's `node` project and must not load `@arrowz/board-element` (Lit) through `ExportTable.tsx`;
  - `ExportTable({ of, labelledBy }: { of: ExportOf; labelledBy?: string | undefined })` in `ExportTable.tsx`;
  - CSS class `fw-docs-wrap` on a machine cell that may wrap.

- [ ] **Step 1: Write the failing tests**

Create `apps/lab/src/docs/ExportTable.browser.test.tsx`:

```tsx
import * as boardElement from '@arrowz/board-element'
import {
  docsFor,
  ELEMENT_CLASSES,
  ELEMENT_CONSTANTS,
  ELEMENT_FUNCTIONS,
  ELEMENT_TYPES,
  spellValue,
} from '@arrowz/engine/docs'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { DocsMarkdown } from './DocsMarkdown'
import { parseDocs } from './markdown'
// The wrap and the scroll box are docs.css's.
import '../design/index.css'

beforeEach(() => useStore.getState().lang.setLang('en'))

const EXPORTS = [
  '# T',
  '## Exports {#exports}',
  '### Types',
  '::table{of="element-types"}',
  '### Functions',
  '::table{of="element-functions"}',
  '### Constants',
  '::table{of="element-constants"}',
  '### Classes',
  '::table{of="element-classes"}',
].join('\n\n')

const show = (width = 720) =>
  render(
    <MemoryRouter initialEntries={['/docs/element']}>
      <div className="fw-docs-body" style={{ width: `${width}px` }}>
        <DocsMarkdown root={parseDocs(EXPORTS)} />
      </div>
    </MemoryRouter>,
  )

const tables = (container: HTMLElement) => [...container.querySelectorAll('table[aria-labelledby="docs-exports"]')]
const rows = (table: Element | undefined) => [...(table?.querySelectorAll('tbody tr') ?? [])]
const texts = (tr: Element) => [...tr.children].map((td) => td.textContent)
const headers = (table: Element | undefined) =>
  [...(table?.querySelectorAll('thead th') ?? [])].map((th) => th.textContent)

test('the four export tables, each a row per export, under their headers', async () => {
  const screen = await show()
  const [types, functions, constants, classes] = tables(screen.container)
  expect(headers(types)).toEqual(['Type', 'From', 'Shape', 'Description'])
  expect(headers(functions)).toEqual(['Function', 'Signature', 'Description'])
  expect(headers(constants)).toEqual(['Constant', 'Value', 'Description'])
  expect(headers(classes)).toEqual(['Class', 'Created with', 'Members', 'Description'])
  expect(rows(types)).toHaveLength(ELEMENT_TYPES.length)
  expect(rows(functions)).toHaveLength(ELEMENT_FUNCTIONS.length)
  expect(rows(constants)).toHaveLength(ELEMENT_CONSTANTS.length)
  expect(rows(classes)).toHaveLength(ELEMENT_CLASSES.length)
})

test('a type row names its package and its shape', async () => {
  const screen = await show()
  const row = rows(tables(screen.container)[0]).find((tr) => tr.children[0]?.textContent === 'GestureMode')
  expect(row && texts(row).slice(0, 3)).toEqual(['GestureMode', '@arrowz/board-element', "'drag' | 'click'"])
})

test('every constant shows the value the package exports', async () => {
  const screen = await show()
  const values: Readonly<Record<string, unknown>> = boardElement
  for (const tr of rows(tables(screen.container)[2])) {
    const name = tr.children[0]?.textContent ?? ''
    expect(tr.children[1]?.textContent, name).toBe(spellValue(values[name]))
  }
  const pad = rows(tables(screen.container)[2]).find((tr) => tr.children[0]?.textContent === 'PAD_RANGE')
  expect(pad?.children[1]?.textContent).toBe('{ min: 0, max: 16 }')
})

test('a class row spells its constructor and members; the element’s has none listed', async () => {
  const screen = await show()
  const [element, host] = rows(tables(screen.container)[3])
  expect(element && texts(element).slice(0, 3)).toEqual(['ArrowzBoard', 'new ArrowzBoard()', '—'])
  expect(host && texts(host).slice(0, 3)).toEqual([
    'GameHost',
    'new GameHost(target: GameTarget)',
    'goneIds, board, isGone(pieceId), setBoard(board), click(pieceId), save(colored), load(snap)',
  ])
})

test('the export tables follow the language, their machine cells do not', async () => {
  const screen = await show()
  const machine = () => [...screen.container.querySelectorAll('tbody td.mono')].map((td) => td.textContent)
  const before = machine()
  await act(async () => useStore.getState().lang.setLang('pl'))
  expect(headers(tables(screen.container)[0])).toEqual(['Typ', 'Skąd', 'Kształt', 'Opis'])
  expect(machine()).toEqual(before)
  const host = rows(tables(screen.container)[3])[1]
  expect(host?.lastElementChild?.textContent).toBe(
    docsFor('pl').classes.GameHost.replace(/`/g, ''),
  )
})

test('at phone width the export tables scroll inside their boxes, not the panel', async () => {
  const screen = await show(343)
  const body = screen.container.querySelector<HTMLElement>('.fw-docs-body')
  if (body === null) throw new Error('no body')
  expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth)
  for (const table of tables(screen.container)) {
    const box = table.parentElement
    expect(box?.classList.contains('fw-docs-scroll')).toBe(true)
    expect(getComputedStyle(box ?? table).overflowX).toBe('auto')
  }
  // A long value wraps in its cell rather than widening the table without end.
  const view = rows(tables(screen.container)[2]).find((tr) => tr.children[0]?.textContent === 'DEFAULT_VIEW')
  expect(view?.children[1]?.classList.contains('fw-docs-wrap')).toBe(true)
})
```

(343 px is a 375 px phone's panel less its padding.)

```bash
cd apps/lab && pnpm exec vitest run --project chromium src/docs/ExportTable.browser.test.tsx
```

Expected: FAIL — `::table{of="element-types"}` renders nothing.

- [ ] **Step 2: `NONE` and `Mono` where both table modules reach them**

In `apps/lab/src/docs/codeTokens.ts`, `const NONE = '—'` becomes `export const NONE = '—'`.

In `apps/lab/src/docs/TokenSpans.tsx`, add `import { type CellRole, cellTokens } from './codeTokens'` (merging with the existing type import) and:

```tsx
/** A machine cell in the code colours; the column says what its text is. `wrap` lets a long value break. */
export function Mono({ text, column, wrap = false }: { text: string; column: CellRole; wrap?: boolean }): ReactElement {
  return (
    <td className={wrap ? 'mono fw-docs-wrap' : 'mono'}>
      <TokenSpans tokens={cellTokens(text, column)} />
    </td>
  )
}
```

In `apps/lab/src/docs/DocsTable.tsx`: delete the local `NONE` and `Mono`; import `NONE` from `./codeTokens` and `Mono` from `./TokenSpans` (drop the now-unused `TokenSpans`/`cellTokens` imports).

- [ ] **Step 3: `ExportTable`**

Create `apps/lab/src/docs/exportTables.ts`:

```ts
/** The `::table` names of the element's export tables. Pure: the content guard reads it in Node. */
export const EXPORT_TABLES = ['element-types', 'element-functions', 'element-constants', 'element-classes'] as const

export type ExportOf = (typeof EXPORT_TABLES)[number]

export function isExportOf(of: string): of is ExportOf {
  return EXPORT_TABLES.some((name) => name === of)
}
```

Create `apps/lab/src/docs/ExportTable.tsx`:

```tsx
/**
 * The element package's export tables: types, functions, constants and
 * classes. The rows are `lab-docs.ts`'s, which the package's README guard
 * holds to its `mod.ts` both ways; a constant's value is read from the package
 * itself and spelled as its README spells it, so the page cannot drift from it.
 */
import * as boardElement from '@arrowz/board-element'
import {
  type ConstantKey,
  ELEMENT_CLASSES,
  ELEMENT_CONSTANTS,
  ELEMENT_FUNCTIONS,
  ELEMENT_TYPES,
  spellValue,
} from '@arrowz/engine/docs'
import type { ReactElement, ReactNode } from 'react'
import { NONE } from './codeTokens'
import type { ExportOf } from './exportTables'
import { InlineMarkdown } from './Inline'
import { Mono } from './TokenSpans'
import { useDocs } from './useDocs'

// The compiler holds every row to an export: a key the package does not export is a type error here.
const VALUES: Readonly<Record<ConstantKey, unknown>> = boardElement

/** Four columns at most, two of them long code: on a phone each table scrolls by itself. */
function Frame({ labelledBy, head, children }: { labelledBy?: string | undefined; head: readonly string[]; children: ReactNode }) {
  return (
    <div className="fw-docs-scroll">
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            {head.map((name) => (
              <th key={name} scope="col">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function ExportTable({ of, labelledBy }: { of: ExportOf; labelledBy?: string | undefined }): ReactElement {
  const docs = useDocs()
  if (of === 'element-types')
    return (
      <Frame labelledBy={labelledBy} head={[docs.colType, docs.colFrom, docs.colShape, docs.colDescription]}>
        {ELEMENT_TYPES.map((row) => (
          <tr key={row.key}>
            <Mono text={row.key} column="type" />
            <Mono text={row.from} column="expr" />
            <Mono text={row.shape} column="expr" wrap />
            <td>
              <InlineMarkdown text={docs.types[row.key]} />
            </td>
          </tr>
        ))}
      </Frame>
    )
  if (of === 'element-functions')
    return (
      <Frame labelledBy={labelledBy} head={[docs.colFunction, docs.colSignature, docs.colDescription]}>
        {ELEMENT_FUNCTIONS.map((row) => (
          <tr key={row.key}>
            <Mono text={row.key} column="method" />
            <Mono text={row.signature} column="sig" wrap />
            <td>
              <InlineMarkdown text={docs.functions[row.key]} />
            </td>
          </tr>
        ))}
      </Frame>
    )
  if (of === 'element-constants')
    return (
      <Frame labelledBy={labelledBy} head={[docs.colConstant, docs.colValue, docs.colDescription]}>
        {ELEMENT_CONSTANTS.map((row) => (
          <tr key={row.key}>
            <Mono text={row.key} column="type" />
            <Mono text={spellValue(VALUES[row.key])} column="expr" wrap />
            <td>
              <InlineMarkdown text={docs.constants[row.key]} />
            </td>
          </tr>
        ))}
      </Frame>
    )
  return (
    <Frame labelledBy={labelledBy} head={[docs.colClass, docs.colCreate, docs.colMembers, docs.colDescription]}>
      {ELEMENT_CLASSES.map((row) => (
        <tr key={row.key}>
          <Mono text={row.key} column="type" />
          <Mono text={row.create} column="sig" />
          <Mono text={row.members.length === 0 ? NONE : row.members.join(', ')} column="method" wrap />
          <td>
            <InlineMarkdown text={docs.classes[row.key]} />
          </td>
        </tr>
      ))}
    </Frame>
  )
}
```

If `const VALUES: Readonly<Record<ConstantKey, unknown>> = boardElement` does not compile because the namespace type carries the element's class and functions too, that is fine for assignability; if the compiler refuses it for another reason, report the error rather than casting.

In `DocsTable.tsx`, at the top of `DocsTable`'s body (after `const dict = …`), add:

```tsx
  if (isExportOf(of)) return <ExportTable of={of} labelledBy={labelledBy} />
```

with `import { ExportTable } from './ExportTable'` and `import { isExportOf } from './exportTables'`.

In `apps/lab/src/docs/shape.ts`, `DIRECTIVES.table.required.of` gains `...EXPORT_TABLES` after `'element-slots'`, with `import { EXPORT_TABLES } from './exportTables'`.

In `apps/lab/src/design/docs.css`, after the `.fw-docs-table .mono` rule (the first one, near `.fw-docs-scroll`), add:

```css
/* A long value — DEFAULT_VIEW, a signature — breaks inside its cell instead of widening the table without end. */
.fw-docs-table .mono.fw-docs-wrap {
  min-width: 16ch;
  white-space: normal;
  overflow-wrap: anywhere;
}
```

- [ ] **Step 4: Run the tests**

```bash
cd apps/lab && pnpm exec vitest run --project chromium src/docs/ExportTable.browser.test.tsx src/docs/DocsMarkdown.browser.test.tsx src/docs/ElementPage.browser.test.tsx
pnpm exec vitest run --project node src/docs
```

Expected: PASS. The `DocsMarkdown` and `ElementPage` cases are the regression for the `Mono` move.

- [ ] **Step 5: Commit**

```bash
cd apps/lab && pnpm exec prettier --write src/docs/exportTables.ts src/docs/ExportTable.tsx src/docs/ExportTable.browser.test.tsx src/docs/TokenSpans.tsx src/docs/DocsTable.tsx src/docs/codeTokens.ts src/docs/shape.ts src/design/docs.css && pnpm run check && pnpm run lint && cd ../..
git add apps/lab/src/docs/exportTables.ts apps/lab/src/docs/ExportTable.tsx apps/lab/src/docs/ExportTable.browser.test.tsx apps/lab/src/docs/TokenSpans.tsx apps/lab/src/docs/DocsTable.tsx apps/lab/src/docs/codeTokens.ts apps/lab/src/docs/shape.ts apps/lab/src/design/docs.css
git commit -m "lab: the Docs tab draws the board element's types, functions, constants and classes from code"
```

---

### Task 4: The theme table, with swatches

**Files:**
- Create: `apps/lab/src/docs/ThemeTable.tsx`, `apps/lab/src/docs/ThemeTable.browser.test.tsx`
- Modify: `apps/lab/src/docs/DocsTable.tsx`, `apps/lab/src/docs/shape.ts`, `apps/lab/src/design/docs.css`

**Interfaces:**
- Consumes: `THEMES` from `@arrowz/engine`; `colTheme`, `colColours`, `colSource`, `colLicence` (Task 1); `Mono` (Task 3).
- Produces: `ThemeTable({ labelledBy }: { labelledBy?: string | undefined }): ReactElement`; `::table{of="themes"}`; CSS `.fw-docs-swatches`, `.fw-docs-swatch`.

- [ ] **Step 1: Write the failing tests**

Create `apps/lab/src/docs/ThemeTable.browser.test.tsx`:

```tsx
import { THEMES } from '@arrowz/engine'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { DocsMarkdown } from './DocsMarkdown'
import { parseDocs } from './markdown'
// The swatches take their size from docs.css.
import '../design/index.css'

beforeEach(() => useStore.getState().lang.setLang('en'))

const show = () =>
  render(
    <MemoryRouter initialEntries={['/docs/element']}>
      <DocsMarkdown root={parseDocs('# T\n\n## Themes {#themes}\n\n::table{of="themes"}')} />
    </MemoryRouter>,
  )

const table = (container: HTMLElement) => container.querySelector('table[aria-labelledby="docs-themes"]')
const rows = (container: HTMLElement) => [...(table(container)?.querySelectorAll('tbody tr') ?? [])]

test('a row per built-in theme, under four headers', async () => {
  const screen = await show()
  expect([...(table(screen.container)?.querySelectorAll('thead th') ?? [])].map((th) => th.textContent)).toEqual([
    'Theme',
    'Colours',
    'Source',
    'Licence',
  ])
  expect(rows(screen.container).map((tr) => tr.children[0]?.textContent)).toEqual(Object.keys(THEMES))
})

test('the swatches are the theme’s colours, in order, named for a screen reader', async () => {
  const screen = await show()
  const mocha = THEMES['catppuccin-mocha']
  if (mocha === undefined) throw new Error('no catppuccin-mocha')
  const colours = [mocha.paper, mocha.ink, mocha.highlight, ...mocha.palette]
  const cell = rows(screen.container)[0]?.children[1]
  const group = cell?.querySelector('[role="img"]')
  expect(group?.getAttribute('aria-label')).toBe(colours.join(', '))
  const swatches = [...(group?.querySelectorAll('.fw-docs-swatch') ?? [])]
  expect(swatches).toHaveLength(colours.length)
  // #1e1e2e: the background, first.
  const first = swatches[0]
  if (first === undefined) throw new Error('no swatch')
  expect(getComputedStyle(first).backgroundColor).toBe('rgb(30, 30, 46)')
  expect(first.getBoundingClientRect().width).toBeGreaterThan(0)
})

test('the source links out, and the licence is the theme’s', async () => {
  const screen = await show()
  const mocha = THEMES['catppuccin-mocha']
  const row = rows(screen.container)[0]
  const link = row?.children[2]?.querySelector('a')
  expect(link?.textContent).toBe(mocha?.source)
  expect(link?.getAttribute('href')).toBe(mocha?.url)
  expect(link?.getAttribute('target')).toBe('_blank')
  expect(link?.getAttribute('rel')).toBe('noreferrer')
  expect(row?.children[3]?.textContent).toBe(mocha?.licence)
})

test('a language switch renames the columns and nothing else', async () => {
  const screen = await show()
  const body = () => table(screen.container)?.querySelector('tbody')?.innerHTML
  const before = body()
  await act(async () => useStore.getState().lang.setLang('pl'))
  expect(table(screen.container)?.querySelector('thead th')?.textContent).toBe('Motyw')
  expect(body()).toBe(before)
})
```

```bash
cd apps/lab && pnpm exec vitest run --project chromium src/docs/ThemeTable.browser.test.tsx
```

Expected: FAIL — `of="themes"` renders nothing.

- [ ] **Step 2: `ThemeTable`**

Create `apps/lab/src/docs/ThemeTable.tsx`:

```tsx
/**
 * The built-in themes, from `THEMES`: name, colours, the project each was
 * ported from and its licence — the attribution the element's README carries,
 * here with the colours themselves. No description column: a theme is its colours.
 */
import { THEMES } from '@arrowz/engine'
import type { ReactElement } from 'react'
import { Mono } from './TokenSpans'
import { useDocs } from './useDocs'

export function ThemeTable({ labelledBy }: { labelledBy?: string | undefined }): ReactElement {
  const docs = useDocs()
  return (
    <div className="fw-docs-scroll">
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col">{docs.colTheme}</th>
            <th scope="col">{docs.colColours}</th>
            <th scope="col">{docs.colSource}</th>
            <th scope="col">{docs.colLicence}</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(THEMES).map(([name, theme]) => {
            const colours = [theme.paper, theme.ink, theme.highlight, ...theme.palette]
            return (
              <tr key={name}>
                <Mono text={name} column="slot" />
                <td>
                  {/* One image for a screen reader, named by its colours; the squares are its pixels. */}
                  <span className="fw-docs-swatches" role="img" aria-label={colours.join(', ')}>
                    {colours.map((colour, i) => (
                      <span key={i} className="fw-docs-swatch" style={{ background: colour }} />
                    ))}
                  </span>
                </td>
                <td>
                  <a href={theme.url} target="_blank" rel="noreferrer">
                    {theme.source}
                  </a>
                </td>
                <Mono text={theme.licence} column="expr" />
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

In `DocsTable.tsx`, after the export dispatch: `if (of === 'themes') return <ThemeTable labelledBy={labelledBy} />` with its import. In `shape.ts`, `of` gains `'themes'`.

In `apps/lab/src/design/docs.css`, after the `.fw-docs-wrap` rule:

```css
/* A theme's colours: background, arrows, highlight, then the palette. The ring keeps a light background visible on the light page. */
.fw-docs-swatches {
  display: inline-flex;
  gap: 2px;
  vertical-align: middle;
}
.fw-docs-swatch {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  box-shadow: inset 0 0 0 1px var(--border);
}
```

(`--border` is the colour inside `--rule` in `apps/lab/src/design/tokens.css`; `--rule` itself is a whole border shorthand and cannot go in a shadow.)

- [ ] **Step 3: Run the tests**

```bash
cd apps/lab && pnpm exec vitest run --project chromium src/docs/ThemeTable.browser.test.tsx src/docs/ExportTable.browser.test.tsx
pnpm exec vitest run --project node src/docs
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd apps/lab && pnpm exec prettier --write src/docs/ThemeTable.tsx src/docs/ThemeTable.browser.test.tsx src/docs/DocsTable.tsx src/docs/shape.ts src/design/docs.css && pnpm run check && pnpm run lint && cd ../..
git add apps/lab/src/docs/ThemeTable.tsx apps/lab/src/docs/ThemeTable.browser.test.tsx apps/lab/src/docs/DocsTable.tsx apps/lab/src/docs/shape.ts apps/lab/src/design/docs.css
git commit -m "lab: the Docs tab's theme table, with each theme's colours as swatches"
```

---

### Task 5: The board element page

**Files:**
- Modify: `apps/lab/docs-content/en/element.md`, `apps/lab/docs-content/pl/element.md`
- Test: `apps/lab/src/docs/ElementPage.browser.test.tsx` (rewritten), `apps/lab/src/routes/DocsNav.browser.test.tsx`, `apps/lab/src/docs/DocsBoard.browser.test.tsx`

**Interfaces:**
- Consumes: every table of Tasks 3–4; `::board`, `:::compare`, `silentQueue`, `answeringWorkers` (PR 4).
- Produces: `/docs/element` with sections `example`, `props`, `members`, `events`, `controls`, `zoom`, `size`, `margin`, `dots`, `track`, `slots`, `play`, `themes`, `webgl`, `exports`, in that order; the first five keep their ids.

- [ ] **Step 1: Write the failing tests**

Rewrite `apps/lab/src/docs/ElementPage.browser.test.tsx`:

```tsx
import { THEMES } from '@arrowz/engine'
import {
  ELEMENT_CLASSES,
  ELEMENT_CONSTANTS,
  ELEMENT_EVENTS,
  ELEMENT_FUNCTIONS,
  ELEMENT_MEMBERS,
  ELEMENT_PROPS,
  ELEMENT_SLOTS,
  ELEMENT_TYPES,
} from '@arrowz/engine/docs'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { contrast, parse } from '../design/contrast'
import { silentQueue } from '../harness/docsWorkers'
import { useStore } from '../state/store'
import { docsPage } from './content'
import { DocsBoardsProvider } from './DocsBoards'
import { DocsPageView } from './DocsPageView'
// The colour cases below read computed style, which a component test only has
// with the sheets imported.
import '../design/index.css'

beforeEach(() => useStore.getState().lang.setLang('en'))
afterEach(() => vi.restoreAllMocks())

// The page's prose and tables: its boards wait on a worker that never answers.
const mount = () =>
  render(
    <MemoryRouter initialEntries={['/docs/element']}>
      <div className="fw-docs-body">
        <DocsBoardsProvider root={null} queue={silentQueue()}>
          <DocsPageView page="element" />
        </DocsBoardsProvider>
      </div>
    </MemoryRouter>,
  )

const firstCode = docsPage('en', 'element').root.children.find((node) => node.type === 'code')
const EXAMPLE = firstCode?.type === 'code' ? firstCode.value : ''

const SECTIONS = [
  'example',
  'props',
  'members',
  'events',
  'controls',
  'zoom',
  'size',
  'margin',
  'dots',
  'track',
  'slots',
  'play',
  'themes',
  'webgl',
  'exports',
]

// `querySelectorAll` hands back `Element`, which has no `cells`: the generic is not decoration.
const rowFor = (container: HTMLElement, key: string) =>
  [...container.querySelectorAll<HTMLTableRowElement>('tbody tr')].find((tr) => tr.cells[0]?.textContent === key)

const DESCRIBED =
  ELEMENT_PROPS.length +
  ELEMENT_MEMBERS.length +
  ELEMENT_EVENTS.length +
  ELEMENT_SLOTS.length +
  ELEMENT_TYPES.length +
  ELEMENT_FUNCTIONS.length +
  ELEMENT_CONSTANTS.length +
  ELEMENT_CLASSES.length

test('the page has its fifteen sections, in order', async () => {
  const screen = await mount()
  expect([...screen.container.querySelectorAll('h3')].map((h) => h.id)).toEqual(SECTIONS.map((id) => `docs-${id}`))
})

test('every documented row reaches the page, the themes included', async () => {
  const screen = await mount()
  expect(screen.container.querySelectorAll('tbody tr')).toHaveLength(DESCRIBED + Object.keys(THEMES).length)
  const pad = rowFor(screen.container, 'pad')
  expect(pad?.cells[1]?.textContent).toBe('number')
  expect(pad?.cells[2]?.textContent).toBe('pad')
  expect(pad?.cells[3]?.textContent).toBe('4')
})

test('a property with no attribute says it has none', async () => {
  const screen = await mount()
  expect(rowFor(screen.container, 'board')?.cells[2]?.textContent).toBe('—')
})

const machine = (container: HTMLElement) => [...container.querySelectorAll('tbody td.mono')].map((c) => c.textContent)
// The last cell of every row but the themes', which have no description.
const described = (container: HTMLElement) =>
  [...container.querySelectorAll('table:not([aria-labelledby="docs-themes"]) tbody td:last-child')].map(
    (c) => c.textContent,
  )

test('a language switch changes every description and leaves every machine cell', async () => {
  const screen = await mount()
  const before = machine(screen.container)
  const helpBefore = described(screen.container)
  expect(helpBefore).toHaveLength(DESCRIBED)
  await act(async () => useStore.getState().lang.setLang('pl'))
  expect(machine(screen.container)).toEqual(before)
  const helpAfter = described(screen.container)
  for (const [i, text] of helpAfter.entries()) expect(text, `description ${i}`).not.toBe(helpBefore[i])
})

// What the Markdown changed: a code span in a description is code, not two backticks.
test('a description shows its code spans as code', async () => {
  const screen = await mount()
  const cell = rowFor(screen.container, 'lang')?.cells[4]
  expect(cell?.querySelector('code')?.textContent).toBe('pl')
  expect(cell?.textContent).not.toContain('`')
})

test('Copy on the example writes the code, not its colouring', async () => {
  const write = vi.fn(() => Promise.resolve())
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText: write } as unknown as Clipboard)
  const screen = await mount()
  const code = screen.container.querySelector('div.fw-docs-block > pre.fw-docs-code > code')
  expect(EXAMPLE).toContain('<arrowz-board')
  expect(code?.textContent).toBe(EXAMPLE)
  expect(code?.querySelectorAll('span[class^="tk-"]').length).toBeGreaterThan(20)
  await screen.getByRole('button', { name: 'Copy: Using it' }).click()
  expect(write).toHaveBeenCalledWith(EXAMPLE)
  await expect.element(screen.getByRole('button', { name: 'Copied: Using it' })).toBeInTheDocument()
})

test('Copy names its section in Polish too', async () => {
  useStore.getState().lang.setLang('pl')
  const screen = await mount()
  const button = screen.getByRole('button', { name: 'Kopiuj: Jak użyć' })
  await expect.element(button).toHaveTextContent('Kopiuj')
})

test('the page no longer sends the reader to the README', async () => {
  const screen = await mount()
  expect(screen.container.querySelector('aside.fw-docs-info')).toBeNull()
  expect(screen.container.textContent).not.toContain('README')
})

test('the slot table follows its lead paragraph, in both languages', async () => {
  const screen = await mount()
  const lead = () => screen.container.querySelector('table[aria-labelledby="docs-slots"]')?.previousElementSibling
  expect(lead()?.tagName).toBe('P')
  const english = lead()?.textContent
  await act(async () => useStore.getState().lang.setLang('pl'))
  expect(lead()?.tagName).toBe('P')
  expect(lead()?.textContent).not.toBe(english)
})

test('the margin, the dot grid and the themes are compared on live boards', async () => {
  const screen = await mount()
  const commands = (id: string) => {
    const heading = screen.container.querySelector(`#docs-${id}`)
    const out: string[] = []
    for (let el = heading?.nextElementSibling; el && el.tagName !== 'H3'; el = el.nextElementSibling)
      for (const pre of el.querySelectorAll('figure.fw-docs-board pre.fw-cmd')) out.push(pre.textContent ?? '')
    return out
  }
  const base = 'deno task carve --width=12 --height=12 --seed=7'
  expect(commands('margin')).toEqual([`${base} --pad=0`, base, `${base} --pad=16`])
  expect(commands('dots')).toEqual([`${base} --points`, `${base} --points --line=0.2 --point-radius=0.15`])
  expect(commands('themes')).toEqual([
    `${base} --theme=gruvbox-dark --colored`,
    `${base} --theme=catppuccin-latte --colored`,
    `${base} --theme=rose-pine-moon --colored`,
  ])
  expect(screen.container.querySelectorAll('figure.fw-docs-board')).toHaveLength(8)
})

/** The computed colour of the one token of `cls` in a machine cell, and its text. */
function token(row: HTMLTableRowElement | undefined, cell: number, cls: string) {
  const span = row?.cells[cell]?.querySelector(`.tk-${cls}`)
  if (span === null || span === undefined) throw new Error(`no .tk-${cls} in cell ${cell}`)
  return { text: span.textContent, color: getComputedStyle(span).color }
}

test('the machine columns wear the colour of what they hold', async () => {
  const screen = await mount()
  const at = (key: string) => rowFor(screen.container, key)
  expect(token(at('pad'), 0, 'prop')).toEqual({ text: 'pad', color: 'rgb(121, 192, 255)' })
  expect(token(at('pad'), 1, 'type')).toEqual({ text: 'number', color: 'rgb(255, 166, 87)' })
  expect(token(at('pad'), 2, 'attr')).toEqual({ text: 'pad', color: 'rgb(121, 192, 255)' })
  expect(token(at('board'), 2, 'pun')).toEqual({ text: '—', color: 'rgb(139, 148, 158)' })
  expect(token(at('board'), 3, 'num')).toEqual({ text: 'null', color: 'rgb(121, 192, 255)' })
  expect(token(at('pointColor'), 3, 'str')).toEqual({ text: "'#c9c9d6'", color: 'rgb(165, 214, 255)' })
  expect(token(at('viewport'), 0, 'prop').text).toBe('viewport')
  expect(token(at('zoomBy'), 0, 'fn')).toEqual({ text: 'zoomBy', color: 'rgb(210, 168, 255)' })
  expect(token(at('zoomBy'), 1, 'param')).toEqual({ text: 'factor', color: 'rgb(255, 166, 87)' })
  expect(token(at('piece-click'), 0, 'str').text).toBe('piece-click')
  expect(token(at('piece-click'), 1, 'prop').text).toBe('pieceId')
  expect(token(at('zoom-in'), 0, 'str').text).toBe('zoom-in')
  expect(token(at('themeOf'), 1, 'fn').text).toBe('themeOf')
  expect(token(at('PAD_RANGE'), 1, 'num').text).toBe('0')
  expect(at('pad')?.cells[4]?.querySelector('[class^="tk-"]')).toBeNull()
})

test('every code colour clears 4.5:1 on --graphite and --void', async () => {
  const screen = await render(<div className="fw" />)
  const probe = document.createElement('span')
  screen.container.append(probe)
  const resolve = (name: string) => {
    probe.style.color = `var(${name})`
    return parse(getComputedStyle(probe).color).rgb
  }
  const planes = ['--graphite', '--void'].map(resolve)
  const names = ['text', 'tag', 'attr', 'str', 'kw', 'fn', 'type', 'prop', 'num', 'param', 'pun'].map(
    (n) => `--code-${n}`,
  )
  for (const name of names) {
    expect(getComputedStyle(document.documentElement).getPropertyValue(name), name).not.toBe('')
    for (const plane of planes) expect(contrast(resolve(name), plane), name).toBeGreaterThanOrEqual(4.5)
  }
})
```

In `apps/lab/src/routes/DocsNav.browser.test.tsx`, the element group of the column becomes the fifteen English titles, each with `'/docs/element'`: `Using it`, `Properties`, `Methods and getters`, `Events`, `Controls`, `Zoom and pan`, `Size, and values the board cannot draw`, `The margin`, `The dot grid`, `Riding the track`, `Slots`, `Playing the board`, `Themes`, `The WebGL context`, `Exports`.

In `apps/lab/src/docs/DocsBoard.browser.test.tsx`, after `'the board looks as its command says, not as the lab is set'`, add:

```tsx
test('a theme and the dot grid reach the element as the command says', async () => {
  const screen = await show(
    '# T\n\n::board[Look]{cmd="--width=12 --height=12 --seed=7 --theme=gruvbox-dark --colored --points --point-radius=0.15"}',
    createDocsQueue(answeringWorkers().make, new Map()),
  )
  await expect.poll(() => element(screen.container)?.board?.W).toBe(12)
  const el = element(screen.container)
  expect(el?.theme).toBe('gruvbox-dark')
  expect(el?.showPoints).toBe(true)
  expect(el?.pointRadius).toBe(0.15)
  expect(el?.colored).toBe(true)
})
```

```bash
cd apps/lab && pnpm exec vitest run --project chromium src/docs/ElementPage.browser.test.tsx src/routes/DocsNav.browser.test.tsx src/docs/DocsBoard.browser.test.tsx
```

Expected: FAIL — the page has five sections (the `DocsBoard` case may already pass: it pins PR 4's path for the props this page relies on).

- [ ] **Step 2: The English page**

Replace `apps/lab/docs-content/en/element.md` with:

````md
# \<arrowz-board>

The board view of Arrowz as a web component. It draws a board, zooms and pans it, animates the moves of a game and reports clicks on arrows. It works in plain HTML and in React, Angular, Svelte or Vue.

The boards on this page are `<arrowz-board>` itself, drawn from the command printed under each one. The command's picture flags are the element's properties under other names: `--pad` is `pad`, `--points` is `showPoints`, `--theme` is `theme`.

## Using it {#example}

Import the package once, which registers the tag. Then give the element a size and a board:

```html
<arrowz-board id="board" interactive lang="pl" style="width: 100%; height: 80vh"></arrowz-board>
<script type="module">
  import '@arrowz/board-element'
  import { defaultParams, generate } from '@arrowz/engine'
  const el = document.getElementById('board')
  el.board = generate({ ...defaultParams(), W: 50, H: 50, seed: 7 }).board
  el.addEventListener('piece-click', (e) => console.log('piece', e.detail.pieceId))
</script>
```

In Angular, add `CUSTOM_ELEMENTS_SCHEMA` to the component and bind `[board]`. In React, wrap the element with `createComponent` from `@lit/react`.

## Properties {#props}

::table{of="element-props"}

The element also tells you the background it actually painted, as the CSS custom property `--arrowz-paper` on its own host. Read it with `getComputedStyle(board).getPropertyValue('--arrowz-paper')`, or use it inside the element's own content. Because it is set on the host itself, you cannot style the element with it from outside, nor override it.

## Methods and getters {#members}

::table{of="element-members"}

## Events {#events}

::table{of="element-events"}

## Controls {#controls}

### Mouse and pen

A plain drag pans the board. A click with ⌘ (Ctrl on Windows and Linux) plays the arrow under it. A plain click does nothing, so a hand that twitches while panning never costs a life.

With `interactive` and without `play`, that click does not play: the element reports the arrow as `piece-click`, and your page decides what to show.

A board that takes clicks — `play` or `interactive` — shows a ☝ switch in its corner. Pressed, it swaps the two: a plain click plays, and a drag with ⌘ or Ctrl pans. The choice belongs to the player. The browser keeps it for the next visit, every board reads it when it is added to the page, and `gestureMode` says which rule is in force. There is no attribute for it. A board that only pans has no switch and always pans with a plain drag.

The cursor shows what the next click will do. By default the board shows the grab hand, and an arrow shows the pointing hand only while ⌘ or Ctrl is held, because only then does a click play. With the switch pressed it is the other way round: the modifier turns the board to the grab hand. On a Mac a Ctrl click is a right click; where it plays, the board keeps the context menu shut.

### Touch

Touch works the same in both modes: one finger pans, two fingers pinch to zoom, and a tap plays.

### Keys and the wheel

The wheel zooms towards the cursor. `+` and `−` zoom, `0` fits the board, and so do the buttons in the corner. With ⌘, Ctrl or Alt held, those keys are left to the browser's own page zoom. The keys act while the board or one of its controls has focus, not while a text field or a nested board inside it does.

A repeated press — a double click, a double tap — does nothing at all. The element reads the second one as a slip of the finger, not as an instruction.

## Zoom and pan {#zoom}

The wheel keeps the point under the cursor where it is: whatever is under the pointer when the wheel turns is still under it afterwards, at every step and anywhere on the board.

That is possible because the view only keeps its centre between the board's two margins. It does not insist that the board fill the view: near an edge, filling the view would mean pulling the board out from under the cursor.

So you may see empty background beside the board, and a board smaller than its host is no longer held in the middle. `fit()`, the `0` key and the corner button bring it back. `zoomBy()` zooms around the centre of the host, since a button has no cursor to zoom towards. The zoom stays between the fitted board and `MAX_CELL_PX` pixels per cell.

## Size, and values the board cannot draw {#size}

The element has no size of its own, like a `<div>`: give it a width and a height, or put it in a parent that has them. The drawing fills the element and takes no part in its layout.

A number or a colour the board cannot draw is replaced, silently and only in the drawing: the property or the attribute keeps what you set. This holds for attributes and for `view` alike.

- A value that is not a finite number becomes its default.
- `stroke` is at most one cell, and zero or less becomes the default.
- Arrowhead sizes are never negative.
- `top` is a whole number.
- `pad` stays within `PAD_RANGE`, and `point-radius` within `POINT_RADIUS_RANGE`: past half a cell the dots would run into each other.
- A colour the browser cannot read becomes the default of its field; in `palette` it is left out.

`zoomBy()` ignores a factor that is not a finite positive number and leaves the view as it was.

## The margin {#margin}

The board is drawn with a margin of `pad` cells on every side, so an arrowhead in an edge cell does not end flush with the edge of the background. The margin is part of what the board is fitted into, and a leaving arrow is clipped to it: the arrow vanishes at the edge of the background instead of floating beside it. Changing `pad` fits the board again.

:::compare
::board[`--pad=0`]{cmd="--width=12 --height=12 --seed=7 --pad=0"}
::board[default (`4`)]{cmd="--width=12 --height=12 --seed=7"}
::board[`--pad=16`]{cmd="--width=12 --height=12 --seed=7 --pad=16"}
:::

A margin measured in cells shrinks with them: on a large board in a small host it would come to a pixel or two. So it is widened until it is `MIN_PAD_PX` pixels on screen. A `pad` of `0` stays `0`: asking for no margin is not asking for a small one.

## The dot grid {#dots}

With `showPoints` the board draws one dot per cell under the arrows, like the ruling of a notebook page. The arrows' lines run from cell centre to cell centre, and the dots are those centres made visible. The grid covers the cells only, not the margin, which stays plain background. `pointColor` and `pointRadius` (in cells) style the dots. The grid is one repeating pattern, so it costs the same on a 10×10 board as on a 1000×1000 one.

A full board shows none of its dots: the arrows cover every cell, and each dot sits under a line, well inside its width. The dots appear cell by cell as arrows leave, or where the generator left a cell empty. If the grid seems to be missing, look for an arrow covering the cell before suspecting anything else. With thin lines and larger dots, they show through:

:::compare
::board[`--points`]{cmd="--width=12 --height=12 --seed=7 --points"}
::board[`--points --line=0.2 --point-radius=0.15`]{cmd="--width=12 --height=12 --seed=7 --points --line=0.2 --point-radius=0.15"}
:::

Below `MIN_POINT_CELL_PX` pixels per cell the grid hides itself, and `showPoints` stays as it is: that close together, the dots would blur into grey rather than read as a grid. Zooming back in brings it back.

## Riding the track {#track}

An arrow never slides sideways off its shape. It drives out along its own track: the head runs straight out in its direction, and every other cell passes through the place of the one ahead of it, so a bent arrow bends its way out instead of moving as one rigid shape. The line, the tail and the head are redrawn every frame from one clock, so they never drift apart.

Every arrow leaves at the same speed, `EXIT_SPEED` cells per second, and a ride takes between `EXIT_MIN_MS` and `EXIT_MAX_MS` milliseconds: a long arrow from the far side does not shoot out faster than a short one at the edge. A blocked arrow's bounce takes `SHAKE_MS`. With `prefers-reduced-motion` set, every ride and every bounce takes no time at all.

## Slots {#slots}

The hint and the buttons in the corner are slot fallback content: a child with `slot` set to one of these names replaces that default, and a slot left empty keeps it.

::table{of="element-slots"}

```html
<arrowz-board play>
  <button slot="fit" data-board-action="fit" aria-label="Show everything">Fit</button>
</arrowz-board>
```

`data-board-action` names what a click on a child, or on anything inside it, does: `zoom-in`, `zoom-out`, `fit`, `colors` (as `toggleColors()`) or `gestures` (as `toggleGestures()`). It works in every slot, at any depth inside a custom `controls`; any other value does nothing. Put it on an element in the page's own markup, not inside another component's shadow root: the element looks for these controls among its own children.

### The bar

The default bar keeps 8 px inside the board. When what it holds — its own controls or yours — does not fit in one row, it wraps upwards: the bottom row keeps what comes first, the hint and then the zoom buttons, and the rest moves above it. A hint wider than the row takes the bottom row alone.

A custom `controls` replaces the bar and its position. The other slots live inside the bar, so a `slot="fit"` child next to a custom bar is not drawn. The element is `position: relative`, so a bar positioned `absolute` is placed against the board; an unpositioned bar sits above the board, in the normal flow.

### What the element keeps in step

On the `colors` and `gestures` controls you project, the element sets and owns two attributes: `aria-pressed`, and `hidden` while the action is unavailable (no `enableColors`; a board that is neither `interactive` nor `play`). `hidden` hides through the browser's own `display: none`, so keep `[hidden] { display: none }` winning over your own `display` rules on these controls. Under a coarse pointer the `hint` and `gestures` slots are not drawn, projected content included; inside a custom `controls` that rule is yours to keep.

The element gives projected controls no role and no name: project a `<button>` with its own accessible name. A control that is not a button still runs its action on click, and nothing more.

## Playing the board {#play}

With `play` the element decides the move itself: a free arrow rides out, a blocked one bounces against the arrow that stops it. The element counts no lives. It reports `life-lost`, your page decides what that costs, and it stops the game by clearing `play`. `saveState()` hands back the game as a small value — the arrows removed, the board's fingerprint and the colour choice — and where you keep it is up to you.

Colours are off unless `enableColors` is set: playing in one colour is part of the puzzle, since telling the arrows apart without colour is the task. With the permission the board grows a ◑ button (or shows your own, see [the slots](docs:element#slots)), and a board may arrive coloured through `view.colored` or through a loaded game. The button announces a cancelable `colored-change` before it acts. A page that does nothing leaves the button in charge; one that calls `preventDefault()` clears the button's own choice — including one made earlier, by a click or by `loadState()` — so `view.colored` decides from that click on.

Assigning `board` always starts a new game and redraws the board in full. So a page that runs a game never takes arrows out of a board and hands it back: it lets `play` run the game and reads what happened from the events.

## Themes {#themes}

`theme` names one of the built-in themes in the table below. Each brings a background, an arrow colour, a highlight and a palette for coloured arrows. A field stated in `view` always wins over the theme's, and the theme wins over the element's own default. A theme paints the background, the arrows and the highlight with or without `enableColors`; only the palette needs that permission, since it colours the arrows one by one.

:::compare
::board[`gruvbox-dark`]{cmd="--width=12 --height=12 --seed=7 --theme=gruvbox-dark --colored"}
::board[`catppuccin-latte`]{cmd="--width=12 --height=12 --seed=7 --theme=catppuccin-latte --colored"}
::board[`rose-pine-moon`]{cmd="--width=12 --height=12 --seed=7 --theme=rose-pine-moon --colored"}
:::

The themes are light and dark versions of open-source editor themes, and the notice of where each comes from, under which licence, travels with them:

::table{of="themes"}

## The WebGL context {#webgl}

A board takes its WebGL context when it is added to the page, not when it is created, and gives it up when it is removed. A page gets about sixteen contexts. If the browser takes one away, the board asks for it back as soon as it is on screen again. More than about sixteen boards on screen at once take each other's contexts in turn.

The boards on this page live by that rule: each exists only while it is near the view.

## Exports {#exports}

Everything `@arrowz/board-element` exports, by kind. Importing the package registers `<arrowz-board>`. Types from `@arrowz/engine` are re-exported, so you need no second import for them.

### Types

::table{of="element-types"}

### Functions

::table{of="element-functions"}

### Constants

::table{of="element-constants"}

### Classes

::table{of="element-classes"}

`GameHost` runs a game on any `GameTarget` — the element is one — so the moves can be played and animated outside `<arrowz-board>`. `board` is the board of the current game, or null, and `goneIds` the arrows that have left. `setBoard()` starts a new game (or ends it, given null); `click()` plays an arrow and resolves once its ride or bounce has settled; `save()` returns a `SessionSnapshot`, or null with no board; `load()` restores one and throws when it belongs to another board.
````

Before going on, check each claim of the page against its source and fix the page, not the source, where they differ; report every difference found, fixed or not:
- the gestures, the ☝ switch, the stored choice, the cursor and the context menu: `gestures.ts`, `arrowz-board.ts` (`onPointerDown`, `refreshCursor`, `onContextMenu`, `GESTURE_STORAGE_KEY`);
- the keys, the modifiers left to the browser, focus, and the repeated press: `arrowz-board.ts` (`onKeyDown`, `takesText`), `gestures.ts`;
- the wheel anchor, the centre between the margins, the clamp of the wheel and of `zoomBy`, and `fit()`: `viewport.ts`;
- `MIN_PAD_PX`, `pad` 0, the clip of a leaving arrow and the refit on `pad`: `viewport.ts`, `gl-layer.ts`, `arrowz-board.ts`;
- the sanitising list: `sanitize.ts`, and whether the zoom methods ignore a bad factor (`zoomBy`);
- the dot grid's pattern, its hiding below `MIN_POINT_CELL_PX`, and that it covers the cells only: `arrowz-board.ts` (`updatePoints`), `viewport.ts`;
- the ride and the reduced motion: `track.ts`, `rides.ts`;
- the bar's wrap and its 8 px, the custom `controls`, `position: relative`, `aria-pressed`/`hidden`, the coarse pointer: `arrowz-board.ts` (`styles`, `syncActions`, `render`);
- the theme precedence and what needs `enableColors`: `look.ts` (`resolveColours`), `arrowz-board.ts`;
- the WebGL context: `arrowz-board.ts` (`connectedCallback`, `disconnectedCallback`, `watchForRevival`);
- `--arrowz-paper`: `arrowz-board.ts`;
- the docs boards mount near the view only: `apps/lab/src/docs/DocsBoard.tsx`, `useNear.ts`.

- [ ] **Step 3: The Polish page**

Write `apps/lab/docs-content/pl/element.md` as a translation of Step 2, keeping: every heading's `{#id}`; the same `###` under the same `##`; every directive line with its attributes character for character (only the `[label]` is translated, and a label that is only code, like `` `--pad=0` ``, stays as it is; ``default (`4`)`` becomes ``domyślnie (`4`)``); both code blocks identical; the same lists, in the same places; the same `docs:` link target. The page's title stays `# \<arrowz-board>`. Section titles: Jak użyć · Właściwości · Metody i gettery · Zdarzenia · Sterowanie · Powiększanie i przesuwanie · Rozmiar i wartości, których plansza nie narysuje · Margines · Siatka kropek · Jazda po torze · Sloty · Rozgrywka · Motywy · Kontekst WebGL · Eksporty; the `###`: Mysz i pióro · Dotyk · Klawisze i kółko · Pasek · Czego komponent pilnuje · Typy · Funkcje · Stałe · Klasy. The terms, as the lab says them: arrow — strzałka; arrowhead — grot; board — plansza; background — tło; the dot grid — siatka kropek; margin — margines; cell — komórka; pan — przesuwać; zoom — powiększać; fit — dopasować; drag — przeciągnięcie; click — kliknięcie; tap — stuknięcie; the ride — przejazd; bounce — odbicie; theme — motyw; palette — paleta; highlight — wyróżnienie; slot — slot; the component — komponent (the singular "element" is allowed on this page, never its plural forms). Check every term against `packages/engine/lab-i18n.ts` (`PL`), `apps/lab/docs-content/pl/cli.md` and the current `pl/element.md` before using it; where they differ from this list, follow the dictionary and say so.

- [ ] **Step 4: Format, then the guards**

```bash
cd apps/lab && pnpm exec prettier --write docs-content/en/element.md docs-content/pl/element.md
pnpm exec vitest run --project node src/docs
cd ../../packages/engine && deno test -A glossary.test.ts
```

Expected: PASS — both languages parse, share one shape, every `cmd` reads, the link lands; no retired word. A glossary failure names its line: reword the sentence, do not add an exception.

- [ ] **Step 5: The page tests**

```bash
cd apps/lab && pnpm exec vitest run --project chromium src/docs src/routes src/AppRoutes.browser.test.tsx src/palette src/shell
```

Expected: PASS (`AppRoutes`, the palette and the tab row open `/docs/element` too; `DocsLayout` scrolls to `#docs-props` and `#docs-members`, which keep their ids).

- [ ] **Step 6: Commit**

```bash
cd apps/lab && pnpm exec prettier --write src/docs/ElementPage.browser.test.tsx src/routes/DocsNav.browser.test.tsx src/docs/DocsBoard.browser.test.tsx && pnpm run check && pnpm run lint && cd ../..
git add apps/lab/docs-content/en/element.md apps/lab/docs-content/pl/element.md apps/lab/src/docs/ElementPage.browser.test.tsx apps/lab/src/routes/DocsNav.browser.test.tsx apps/lab/src/docs/DocsBoard.browser.test.tsx
git commit -m "lab: the Docs page Board element in full, with live comparisons of the margin, the dot grid and the themes"
```

---

### Task 6: Jev on the page, the gates, the live run, the PR

**Files:**
- Modify: the pages or `lab-docs.ts`, only if Jev's triage or the live run changes them.

- [ ] **Step 1: Ask Jev, triage**

```bash
deno task jev:docs element
```

Probe that Jev answered (a stub that counts calls and nulls: "nothing flagged" does not tell a missing answer apart). Triage each flag by hand: a real contradiction with `packages/board-element/README.md` or a real EN/PL difference is fixed in the Markdown or `lab-docs.ts` (re-run Task 5 Step 4, and Task 1 Step 6 for `lab-docs.ts`); anything else goes into the PR body as "seen, kept, because …". The README's own "583 px" measurement and the places this page rewords on purpose (decision 10) are not contradictions.

- [ ] **Step 2: The whole repository**

```bash
cd packages/engine && deno task verify
cd ../cli && deno task verify
cd ../.. && pnpm nx run-many -t verify
```

Expected: all green; the lab's `verify` includes `build`, `smoke` and `worker-smoke.mjs`.

- [ ] **Step 3: Live, in a real browser**

```bash
mkdir -p /tmp/lab-docs-element-store && cp -R packages/cli/boards/. /tmp/lab-docs-element-store/
ARROWZ_BOARDS_DIR=/tmp/lab-docs-element-store pnpm nx serve lab
```

At 1440×900 and 375×812, in English and Polish, on `/docs/element`:
- every section in the column, and a section link scrolls the panel to its heading;
- the margin comparison: three different margins, the `--pad=16` board small in its frame;
- the dot grid comparison: the first board shows no dots, the second shows a dot at every cell centre along the thin lines — if it does not, change the second command (a larger `--point-radius` or a thinner `--line`, in both languages and in `ElementPage.browser.test.tsx`) and say so;
- the themes: three different backgrounds and palettes;
- the export tables: at 375 px each scrolls sideways inside its box and the panel does not; `DEFAULT_VIEW` and `THEMES` wrap;
- the theme table: the swatches visible on the light page (the background swatch of a light theme has its ring), a source link opens a new tab;
- three-across comparisons at 375 px: note whether the element's hint is cut under its buttons (bead `arrowz-op6p`) — record, do not fix here.

Stop the server and kill what it leaves (`ps … | grep -E "lab-docs-element|nx/dist/src/daemon|vite preview"`); remove `/tmp/lab-docs-element-store` and `/tmp/lab-docs-element`.

- [ ] **Step 4: Follow-ups as beads**

Create a bead, with an estimate and links, for each thing found and left: README sentences the page corrected (as `arrowz-0e2l` did for the CLI), anything from the live run that is not this PR's.

- [ ] **Step 5: Bead and PR**

```bash
bd update arrowz-kkey.5 --append-notes "Plan executed; PR body cites Bead: arrowz-kkey.5."
```

Then superpowers:finishing-a-development-branch; the PR body (written to a file, passed as `--body-file` with an absolute path) lists the eleven decisions at the top of this plan, Task 2's six mutations, the Jev triage and the live run's findings, and cites `Bead: arrowz-kkey.5`. When it merges, the epic `arrowz-kkey` is complete.
