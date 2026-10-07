# Framework tabs and board files on the Element page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The lab's Docs page for `<arrowz-board>` shows the element in plain HTML, Angular, React, Vue and Svelte as one remembered tab group, and gains a Board files section that explains `.board.json` and the steps from a fetched file to a drawn board, in English and Polish.

**Architecture:** A new Markdown container pair, `::::tabs{group}` › `:::tab{id}`, is checked by the content guard (`shape.ts`) and drawn by a new `DocsTabs` component on the ARIA tabs pattern `TabRow` already uses; the chosen tab lives in `ui.docsTabs`, remembered in Web Storage, so every group on the page follows one choice. The code scanners in `codeTokens.ts` grow `ts`, `tsx`, `vue` and `svelte` from the JavaScript and HTML scanners they already have. The board file's field table comes from `BOARD_FILE_FIELDS` in the engine, held to `BoardFile` by the engine's README guard.

**Tech Stack:** React 19 + Vite + Vitest 5 browser (Playwright Chromium) in `apps/lab`; Deno 2.9 in `packages/engine`; mdast + `micromark-extension-directive`; Zustand.

**Spec:** `docs/superpowers/specs/2026-10-08-docs-frameworks-board-files-design.md` (bead `arrowz-k1p2`).

## Global Constraints

- Everything in the repository is in English; the Polish page `apps/lab/docs-content/pl/element.md` and the `PL` dictionary are the only Polish.
- Tab order of the `framework` group, ids and labels: `html` HTML, `angular` Angular, `react` React, `vue` Vue, `svelte` Svelte. Labels are not translated.
- Web Storage key: `labDocsTabs`, value JSON `{"framework":"<id>"}`.
- Code languages after this plan: `html`, `sh`, `json`, `text`, `ts`, `tsx`, `vue`, `svelte`.
- A code block's meta (the word after its language) is its file name: one word, `/^[\w.-]+$/`.
- The page has sixteen `##` sections; Board files is `{#files}`, right after `{#example}`.
- Comments: why, once, fewest lines; non-header blocks ≤ 6 lines, headers ≤ 24 (`packages/engine/comments.test.ts`); cite symbols, never `file.ts:NN`; no history in code.
- No `any`, no non-null assertions. `exactOptionalPropertyTypes` is on: an optional prop that may receive `undefined` is `prop?: T | undefined`.
- English docs prose and dictionary text may not use the retired words of `packages/engine/glossary.test.ts` outside code spans: among them `piece(s)`, `close(d)`, `carve`, `paper`, `ink`, `fragment`. Polish may not use `papier`, `tusz`, `fragment`, `generacj…`, `pokrętł…`, and on the element page the plural `elementy/elementów/…`.
- `deno fmt` formats `packages/*`; Prettier formats `apps/lab` (`npx prettier --write src` in `apps/lab`; `nx run lab:fmt` only checks).
- No attribution lines in commits.

## Before the first task

The worktree is `.claude/worktrees/docs-frameworks` on branch `lab/docs-frameworks`. Run every command from it: each `bash` block starts at the worktree root, and a block that `cd`s into `apps/lab` returns with `cd ../..` before any `git` line — if a chain stops midway, `cd` back to the root before committing.

```bash
corepack enable pnpm 2>/dev/null || pnpm --version
pnpm install --frozen-lockfile
pnpm nx build engine --skip-nx-cache && pnpm nx build board-element --skip-nx-cache
```

Facts that bite in this repo (from the lab's test harness notes):

- `apps/lab` reads the engine from `packages/engine/dist/`. After any change under `packages/engine`, run `pnpm nx build engine --skip-nx-cache` before the lab's tests, and grep the new symbol in `packages/engine/dist` to see it arrived (the Nx cache is shared between worktrees).
- `render` from `vitest-browser-react` is async: `const screen = await render(...)`.
- `toHaveTextContent` is exact equality; `toMatchTextContent(/…/)` matches a part.
- Locators are strict: two matches throw. Use `.first()` / `.last()`, or query the DOM.
- The browser project does not load stylesheets unless the test imports `../design/index.css`.
- `lab:check` (`tsc`) catches what `vitest run` does not; run it after every test edit.
- A mutation step means: break the code by hand, run the test, see it fail, undo the edit **by hand** (never `git checkout` a file with uncommitted work).

## Review Focus

1. **A reader's framework renders the element before it is defined** (React or Vue with a lazy import): the board silently never appears. Task 6 runs each example and checks that `board` arrived as a property, not an attribute.
2. **Web Storage holds something old or foreign** (`{"framework":"solid"}`, `[]`, not JSON, a number): the page must open on HTML, not crash. Task 4 pins every case.
3. **Two tab groups on one page**: choosing Angular in Using it must choose it in Board files too, and the keyboard focus must move only in the group being used. Task 5 pins both.
4. **A phone**: five tab labels wider than the page must scroll inside their strip, not push the page sideways. Task 5 measures it at 200 px, Task 7 at 280 px on the real page.
5. **A code block inside a tab that contains a line `:::`** closes the tab early (measured with the parser). The guard reports it as prose in `::::tabs`; Task 3 pins that message.

---

### Task 1: The engine — board-file rows, their descriptions and their guard

**Files:**
- Modify: `packages/engine/lab-docs.ts` (new `FieldRow`, `BOARD_FILE_FIELDS`, `BoardFileField`; `Docs` gains `boardFile` and `frameworkLabel`; `EN` and `PL` gain both)
- Modify: `packages/engine/readme.test.ts` (new guard)
- Modify: `packages/engine/lab-docs.test.ts` (descriptions exist and are translated)
- Modify: `packages/engine/glossary.test.ts` (`docsRows` reads `boardFile`)
- Modify: `packages/engine/README.md` (section `` ### `@arrowz/engine/docs` ``)

**Interfaces:**
- Produces: `BOARD_FILE_FIELDS: readonly { key: keyof BoardFile; type: string }[]` (9 rows, `BoardFile`'s order), `type BoardFileField`, `interface FieldRow`, `Docs.boardFile: Record<BoardFileField, string>`, `Docs.frameworkLabel: string` — all from `@arrowz/engine/docs`.

- [ ] **Step 1: Write the failing guard** in `packages/engine/readme.test.ts`; `symbolsOf`, `only` and `render` are that file's own helpers. Add `BOARD_FILE_FIELDS` to the imports at the top (`import { BOARD_FILE_FIELDS } from './lab-docs.ts'`), and append before the `// --- Development` block:

```ts
// --- The Docs tab's board-file table ----------------------------------------------

Deno.test("the Docs tab's board-file table is BoardFile's fields, in order, with their types", () => {
  const symbol = symbolsOf('mod.ts').find((s) => s.name === 'BoardFile')
  const decl = symbol === undefined ? undefined : only(symbol)
  if (decl?.kind !== 'interface') throw new Error('@arrowz/engine exports no interface BoardFile')
  const declared = (decl.def.properties ?? []).map((p) => `${p.name}: ${p.tsType === undefined ? '' : render(p.tsType)}`)
  assertEquals(BOARD_FILE_FIELDS.map((row) => `${row.key}: ${row.type}`), declared)
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `deno test --allow-read --allow-write --allow-env --allow-run --allow-net packages/engine/readme.test.ts`
Expected: FAIL to type-check — `Module './lab-docs.ts' has no exported member 'BOARD_FILE_FIELDS'`.

- [ ] **Step 3: Add the rows** to `packages/engine/lab-docs.ts`. Add `import type { BoardFile } from './types.ts'` beside the other type imports. After `export type ClassKey = …`, add:

```ts
/** One field of the board file, as `BoardFile` declares it. */
export interface FieldRow {
  readonly key: keyof BoardFile
  readonly type: string
}

/** The fields of a board file, in `BoardFile`'s order: the Element page's `board-file` table. */
export const BOARD_FILE_FIELDS = [
  { key: 'format', type: "'arrowz-board'" },
  { key: 'v', type: '1' },
  { key: 'W', type: 'number' },
  { key: 'H', type: 'number' },
  { key: 'pieces', type: 'number' },
  { key: 'voids', type: 'number' },
  { key: 'unfilled', type: 'number' },
  { key: 'fingerprint', type: 'string' },
  { key: 'body', type: 'string' },
] as const satisfies readonly FieldRow[]

export type BoardFileField = (typeof BOARD_FILE_FIELDS)[number]['key']
```

In `interface Docs`, right after `readonly classes: Record<ClassKey, string>`, add:

```ts
  /** The board file's fields, by name (`BOARD_FILE_FIELDS`). */
  readonly boardFile: Record<BoardFileField, string>
```

and right after `readonly infoLabel: string`:

```ts
  /** The accessible name of a page's framework tabs. */
  readonly frameworkLabel: string
```

In `const EN`, right after its `classes: { … },` record, add:

```ts
  boardFile: {
    format: "Always `'arrowz-board'`: what tells a board file from any other JSON.",
    v: 'The version of the format. This engine writes and reads `1` (`BOARD_FILE_VERSION`).',
    W: 'Width of the board, in cells.',
    H: 'Height of the board, in cells.',
    pieces: 'How many arrows the board holds.',
    voids: 'How many cells are holes left on purpose (`-2` in `owner`), where no arrow goes.',
    unfilled: 'How many cells no arrow filled (`-1` in `owner`), which `voids` in the view shows; `0` on a complete board.',
    fingerprint: "The board's `fingerprint()`: the same board always has the same one. `decodeBoard` checks it last.",
    body: 'The arrows and the holes, packed, in base64. Only `decodeBoard` reads it.',
  },
```

and after `infoLabel: 'Note',`: `frameworkLabel: 'Framework',`.

In `const PL`, at the same two places:

```ts
  boardFile: {
    format: "Zawsze `'arrowz-board'`: po tym plik planszy odróżnia się od innego JSON-a.",
    v: 'Wersja formatu. Ten silnik zapisuje i czyta `1` (`BOARD_FILE_VERSION`).',
    W: 'Szerokość planszy w komórkach.',
    H: 'Wysokość planszy w komórkach.',
    pieces: 'Ile strzałek ma plansza.',
    voids: 'Ile komórek to dziury zostawione celowo (`-2` w `owner`), gdzie nie ma strzałki.',
    unfilled:
      'Ile komórek nie wypełniła żadna strzałka (`-1` w `owner`); pokazuje je `voids` w widoku. `0` na pełnej planszy.',
    fingerprint: 'Odcisk planszy, `fingerprint()`: ta sama plansza ma zawsze ten sam. `decodeBoard` sprawdza go na końcu.',
    body: 'Strzałki i dziury, spakowane, w base64. Czyta je tylko `decodeBoard`.',
  },
```

and after `infoLabel: 'Uwaga',`: `frameworkLabel: 'Wybór frameworka',`. (The test "the frame around the tables is translated too" requires every frame string to differ between the languages.)

The file header forbids naming the browser's key-value store by its API name in prose (`neutral.test.ts`); none of the strings above does.

- [ ] **Step 4: Run the guard to see it pass**

Run: `deno test --allow-read --allow-write --allow-env --allow-run --allow-net packages/engine/readme.test.ts`
Expected: the new case PASSES; the `@arrowz/engine/docs` cases FAIL — the README does not list `BOARD_FILE_FIELDS`, `BoardFileField`, `FieldRow`, and its `Docs` shape lacks the two fields. That failure is Step 5's job.

- [ ] **Step 5: Bring the README to the code.** In `packages/engine/README.md`, section `` ### `@arrowz/engine/docs` ``:

Constant table, first row (the rows are alphabetical):

```md
| `BOARD_FILE_FIELDS` | 9 `FieldRow`s | The fields of a board file in `BoardFile`'s order, with their types: the Element page's board-file table. |
```

Type table, first row:

```md
| `BoardFileField` | `(typeof BOARD_FILE_FIELDS)[number]['key']` | The name of a board-file field row. |
```

Type table, between `ExportSource` and `FunctionKey`:

```md
| `FieldRow` | `{ readonly key: keyof BoardFile; readonly type: string }` | One field of the board file and its type. |
```

In the `Docs` row's shape, insert `readonly boardFile: Record<BoardFileField, string>; ` right after `readonly classes: Record<ClassKey, string>; `, and append `; readonly frameworkLabel: string` after `readonly infoLabel: string`. Change its Meaning cell to: `What the Docs tab's reference tables need in one language: a description per row, the column names, the name of a page's note and of its framework tabs.`

- [ ] **Step 6: The descriptions exist and are translated.** In `packages/engine/lab-docs.test.ts`, add `BOARD_FILE_FIELDS` to the import list and append:

```ts
Deno.test('every board-file field is described in both languages, and translated', () => {
  const en = docsFor('en')
  const pl = docsFor('pl')
  for (const row of BOARD_FILE_FIELDS) {
    assert(en.boardFile[row.key].trim().length > 0, `EN ${row.key}`)
    assert(pl.boardFile[row.key].trim().length > 0, `PL ${row.key}`)
    assertNotEquals(pl.boardFile[row.key], en.boardFile[row.key], `${row.key} is still English in the Polish docs`)
  }
})
```

In the same file, the comment above `the frame around the tables is translated too` counts the frame strings; change its last two lines to:

```ts
// object, so a field added to `Docs` later is covered too. Thirty-four strings exist
// today (thirty-two `col*`, `infoLabel` and `frameworkLabel`); the floor catches a filter that finds none.
```

In `packages/engine/glossary.test.ts`, function `docsRows`, add `'boardFile',` after `'classes',` in the list of groups.

- [ ] **Step 7: Run the engine's tests**

Run: `deno task test`
Expected: PASS (all engine and CLI tests). `deno fmt` in Step 9 may rewrap the longer strings; commit what it writes.

- [ ] **Step 8: Mutation.** In `BOARD_FILE_FIELDS` change `{ key: 'v', type: '1' }` to `{ key: 'v', type: 'number' }`; run `deno test --allow-read --allow-write --allow-env --allow-run --allow-net packages/engine/readme.test.ts`; expect the board-file case to FAIL naming `v: number` against `v: 1`. Undo the edit by hand. Then swap the `W` and `H` rows; expect FAIL; undo by hand.

- [ ] **Step 9: Build and format**

```bash
deno fmt packages/engine && deno task verify
pnpm nx build engine --skip-nx-cache && grep -c BOARD_FILE_FIELDS packages/engine/dist/*.js | grep -v ':0'
```

Expected: `verify` PASS; the grep prints at least one file.

- [ ] **Step 10: Commit**

```bash
git add packages/engine/lab-docs.ts packages/engine/lab-docs.test.ts packages/engine/readme.test.ts packages/engine/glossary.test.ts packages/engine/README.md
git commit -m "engine: the board file's fields as Docs rows, held to BoardFile, described in both languages"
```

---

### Task 2: The code scanners — `ts`, `tsx`, `vue` and `svelte`

**Files:**
- Modify: `apps/lab/src/docs/codeTokens.ts`
- Modify: `apps/lab/src/docs/codeTokens.test.ts`

**Interfaces:**
- Produces: `highlight(lang: string | null | undefined, code: string): CodeToken[] | null` — the colours of a fenced block by its language (`html`, `vue`, `svelte`, `ts`, `tsx`, `sh`, `json`), `null` for any other (`text`). `highlightHtml`, `highlightSh`, `highlightJson`, `cellTokens`, `NONE`, `CodeToken`, `TokenClass`, `CellRole` stay exported unchanged.

- [ ] **Step 1: Write the failing tests.** In `apps/lab/src/docs/codeTokens.test.ts`:

Replace the import line from `./codeTokens` with:

```ts
import {
  cellTokens,
  type CodeToken,
  highlight,
  highlightHtml,
  highlightJson,
  highlightSh,
  type TokenClass,
} from './codeTokens'
```

Add `import type { Code, Nodes } from 'mdast'` and `import { DOCS_PAGES } from './pages'`. Replace the lines that find `firstCode` and `ELEMENT_EXAMPLE` (with the doc comment between them) with:

```ts
/** Every fenced block of a page, the ones inside tabs included. */
function codeBlocks(node: Nodes, out: Code[] = []): Code[] {
  if (node.type === 'code') out.push(node)
  if ('children' in node) for (const child of node.children) codeBlocks(child, out)
  return out
}

/** The element page's example, as its Markdown writes it: its first `html` block. */
const ELEMENT_EXAMPLE = codeBlocks(docsPage('en', 'element').root).find((block) => block.lang === 'html')?.value ?? ''
```

Append:

```ts
// The promise Copy rests on, for every block a reader can copy.
describe.each(DOCS_PAGES)('every block of the %s page', (page) => {
  test.each(['en', 'pl'] as const)('in %s reads back exactly as written', (lang) => {
    for (const block of codeBlocks(docsPage(lang, page).root)) {
      const tokens = highlight(block.lang, block.value)
      if (tokens !== null) expect(joined(tokens), `${block.lang ?? ''} ${block.meta ?? ''}`).toBe(block.value)
    }
  })
})

describe('a TypeScript block', () => {
  const TS = [
    "import type { BoardData } from '@arrowz/engine'",
    "declare module 'react' {",
    '  interface X { board?: BoardData | null }',
    '}',
    'export const ok = true',
  ].join('\n')
  const tokens = highlight('ts', TS) ?? []

  test('reads back exactly as written', () => {
    expect(joined(tokens)).toBe(TS)
  })

  test('colours the words TypeScript adds, its types and its constants', () => {
    expect(inColour(tokens, 'kw')).toEqual(['import', 'type', 'from', 'declare', 'module', 'interface', 'export', 'const'])
    expect(inColour(tokens, 'type')).toEqual(['BoardData', 'X', 'BoardData'])
    expect(inColour(tokens, 'num')).toEqual(['null', 'true'])
    expect(inColour(tokens, 'str')).toEqual(["'@arrowz/engine'", "'react'"])
  })
})

describe('a TSX block', () => {
  const TSX = [
    'export function Board() {',
    '  if (!ready) return null',
    "  return <arrowz-board board={board} style={{ height: '80vh' }} onpiece-click={(e) => log(e.detail.pieceId)} />",
    '}',
  ].join('\n')
  const tokens = highlight('tsx', TSX) ?? []

  test('reads back exactly as written', () => {
    expect(joined(tokens)).toBe(TSX)
  })

  test('colours the element as markup and its braces as script', () => {
    expect(inColour(tokens, 'tag')).toEqual(['arrowz-board'])
    expect(inColour(tokens, 'attr')).toEqual(['board', 'style', 'onpiece-click'])
    expect(inColour(tokens, 'kw')).toEqual(['export', 'function', 'if', 'return', 'return'])
    expect(inColour(tokens, 'fn')).toEqual(['Board', 'log'])
    expect(inColour(tokens, 'prop')).toEqual(['height', 'detail', 'pieceId'])
    expect(inColour(tokens, 'str')).toEqual(["'80vh'"])
  })

  // A self-closing element ends at its `/>`: the script after it is script again.
  test('a self-closing element ends at its slash', () => {
    const tokens = highlight('tsx', 'const a = <b />\nconst c = 1') ?? []
    expect(inColour(tokens, 'kw')).toEqual(['const', 'const'])
    expect(inColour(tokens, 'num')).toEqual(['1'])
  })

  // A `<` after a name is a type argument, not an element.
  test('a type argument is not an element', () => {
    const generic = highlight('tsx', 'const [a, b] = useState<string | null>(null)') ?? []
    expect(inColour(generic, 'tag')).toEqual([])
    expect(joined(generic)).toBe('const [a, b] = useState<string | null>(null)')
  })
})

describe('a Vue block', () => {
  const VUE = [
    '<script setup lang="ts">',
    "import { ref } from 'vue'",
    'const ready = ref(false)',
    '</script>',
    '',
    '<template>',
    '  <arrowz-board v-if="ready" :board="board" interactive @piece-click="onPiece" />',
    '</template>',
  ].join('\n')
  const tokens = highlight('vue', VUE) ?? []

  test('reads back exactly as written', () => {
    expect(joined(tokens)).toBe(VUE)
  })

  test('colours the script, the markup, and the bound values as script', () => {
    expect(inColour(tokens, 'tag')).toEqual(['script', 'script', 'template', 'arrowz-board', 'template'])
    expect(inColour(tokens, 'attr')).toEqual(['setup', 'lang', 'v-if', ':board', 'interactive', '@piece-click'])
    expect(inColour(tokens, 'kw')).toEqual(['import', 'from', 'const'])
    expect(inColour(tokens, 'fn')).toEqual(['ref'])
    expect(inColour(tokens, 'num')).toEqual(['false'])
    expect(inColour(tokens, 'str')).toEqual(['"ts"', "'vue'"])
  })
})

describe('a Svelte block', () => {
  const SVELTE = [
    '<script lang="ts">',
    "  import { onMount } from 'svelte'",
    '  let { url }: { url: string } = $props()',
    '</script>',
    '',
    '{#if problem}',
    '  <p role="alert">{problem}</p>',
    '{:else}',
    '  <arrowz-board {board} onpiece-click={onPiece}></arrowz-board>',
    '{/if}',
  ].join('\n')
  const tokens = highlight('svelte', SVELTE) ?? []

  test('reads back exactly as written', () => {
    expect(joined(tokens)).toBe(SVELTE)
  })

  test('colours the script, the markup and every brace as script', () => {
    expect(inColour(tokens, 'tag')).toEqual(['script', 'script', 'p', 'p', 'arrowz-board', 'arrowz-board'])
    expect(inColour(tokens, 'attr')).toEqual(['lang', 'role', 'onpiece-click'])
    expect(inColour(tokens, 'kw')).toEqual(['import', 'from', 'let', 'if', 'else', 'if'])
    expect(inColour(tokens, 'fn')).toEqual(['$props'])
    expect(inColour(tokens, 'str')).toEqual(['"ts"', "'svelte'", '"alert"'])
  })
})

// A module script uses TypeScript's word list too: `if` and `catch` are words, not calls.
test("an HTML script's try, catch, if, instanceof and throw are keywords", () => {
  const script =
    highlight('html', '<script type="module">\ntry { go() } catch (e) { if (!(e instanceof Err)) throw e }\n</script>') ?? []
  expect(inColour(script, 'kw')).toEqual(['try', 'catch', 'if', 'instanceof', 'throw'])
})

test('a language the page shows plain has no colours', () => {
  expect(highlight('text', 'x')).toBeNull()
  expect(highlight(undefined, 'x')).toBeNull()
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/lab && pnpm vitest run --project node src/docs/codeTokens.test.ts`
Expected: FAIL — `TypeError: highlight is not a function`.

- [ ] **Step 3: Implement.** In `apps/lab/src/docs/codeTokens.ts`:

Replace the module header's first sentence and its "No library" paragraph so the header reads:

```ts
/**
 * Syntax colours for the documentation: its `html`, `vue`, `svelte`, `ts`,
 * `tsx`, `sh` and `json` blocks and the machine columns of its reference
 * tables, in GitHub Dark's colours (`--code-*`).
 *
 * Tokens, not markup: each is a run of the source text with the class of its
 * colour, or none for plain text. Joining the texts gives back the input
 * exactly, so Copy and a selection read the code as written;
 * `codeTokens.test.ts` holds that for every block the pages show.
 *
 * No library: the blocks are short examples, commands, a little JSON and type
 * expressions in table cells, so a script scanner, a tag scanner and three
 * small ones cover them. The script and type scanners follow the design
 * mock's `highlight()` and `tsTokens()`, with one correction noted where it
 * is made.
 */
```

After `const JS_KEYWORDS = …`, add:

```ts
/** TypeScript's words on top of JavaScript's, for the framework examples. */
const TS_KEYWORDS = new Set([
  ...JS_KEYWORDS,
  'type',
  'interface',
  'declare',
  'namespace',
  'module',
  'as',
  'satisfies',
  'readonly',
  'if',
  'else',
  'try',
  'catch',
  'throw',
  'typeof',
  'keyof',
  'extends',
  'class',
  'default',
  'void',
  'in',
  'of',
  'instanceof',
])
```

Replace `TAG_PART` with (an attribute may now start with `@`, as Vue's do):

```ts
const TAG_PART = /^(\s+)|^([a-zA-Z_:@][\w:.@-]*)|^(=)|^("[^"]*"|'[^']*')/
```

Replace the whole of `highlightHtml` (its doc comment included) with the following, placed where it was. `TS_CONSTANT` is declared further down the file; the functions read it only when called, after the module has loaded.

```ts
/** Where a script ends short of the end of the code. */
interface ScriptEnd {
  /** Text that ends it, left unread: `</script`, or the quote around an attribute's value. */
  readonly until?: string
  /** An unmatched `}` ends it, left unread: an expression inside markup. */
  readonly brace?: boolean
  /** A `<` where an expression may start opens a JSX element. */
  readonly jsx?: boolean
}

// What may stand right before a `<` that opens JSX rather than compares or
// starts a type argument: `return <p>`, `(<p>`, `=> <p>`, `? <a> : <b>`.
const JSX_AFTER = new Set(['', '(', ',', '=', '=>', '?', ':', '{', '[', '&', '|', 'return'])

/**
 * A name's colour. The one correction to the mock: a name before `:` is an
 * object key, so `W: 50` colours `W` as a property, not as a type for being a capital.
 */
function nameClass(code: string, at: number, id: string, keywords: ReadonlySet<string>): TokenClass | null {
  if (keywords.has(id)) return 'kw'
  if (TS_CONSTANT.has(id)) return 'num'
  if (code.charAt(at - 1) === '.' || nextVisible(code, at + id.length) === ':') return 'prop'
  return /^[A-Z]/.test(id) ? 'type' : null
}

/** Script from `start` until `end` says it stops; returns where it stopped. */
function scanScript(
  code: string,
  start: number,
  out: CodeToken[],
  keywords: ReadonlySet<string>,
  end: ScriptEnd,
): number {
  let i = start
  let depth = 0
  let last = ''
  while (i < code.length) {
    if (end.until !== undefined && code.startsWith(end.until, i)) return i
    const ch = code.charAt(i)
    if (end.brace === true && ch === '}' && depth === 0) return i
    const tag = end.jsx === true && JSX_AFTER.has(last) ? TAG_OPEN.exec(code.slice(i)) : null
    if (tag !== null && tag[1] === '') {
      i = scanJsx(code, i, out, keywords)
      last = ')'
      continue
    }
    JS_TOKEN.lastIndex = i
    const m = JS_TOKEN.exec(code)
    if (m === null) {
      push(out, null, ch)
      if (ch.trim() !== '') last = ch
      i++
      continue
    }
    const [all, comment, str, num, fn, id, pun] = m
    if (comment !== undefined) push(out, 'com', all)
    else if (str !== undefined) push(out, 'str', all)
    else if (num !== undefined) push(out, 'num', all)
    else if (fn !== undefined) push(out, keywords.has(fn) ? 'kw' : 'fn', all)
    else if (id !== undefined) push(out, nameClass(code, i, id, keywords), all)
    else if (pun !== undefined) {
      if (pun === '{') depth++
      if (pun === '}') depth--
      push(out, 'pun', pun)
    }
    if (comment === undefined) last = all
    i += all.length
  }
  return i
}

/** How one markup flavour reads what is not markup inside its tags. */
interface TagScripts {
  readonly keywords: ReadonlySet<string>
  /** `{…}` in a tag is script: JSX and Svelte. */
  readonly braces: boolean
  /** JSX may open inside those braces. */
  readonly jsx: boolean
  /** A quoted value that is script: Vue's `:x`, `@x` and `v-` attributes. */
  readonly quoted: (attr: string) => boolean
}

interface Tag {
  /** Just past the tag's `>`, or the end of the code. */
  readonly end: number
  readonly name: string
  readonly closing: boolean
  /** `<x … />` */
  readonly empty: boolean
}

/** A `{…}` from its `{`; returns just past its `}`, or the end of the code. */
function scanBraces(code: string, start: number, out: CodeToken[], keywords: ReadonlySet<string>, jsx: boolean): number {
  push(out, 'pun', '{')
  const stop = scanScript(code, start + 1, out, keywords, { brace: true, jsx })
  if (code.charAt(stop) !== '}') return stop
  push(out, 'pun', '}')
  return stop + 1
}

/** One tag from its `<`, which `open` (a `TAG_OPEN` match at `start`) has read. */
function scanTag(code: string, start: number, open: RegExpExecArray, out: CodeToken[], scripts: TagScripts): Tag {
  const [whole, slash = '', name = ''] = open
  push(out, 'pun', `<${slash}`)
  push(out, 'tag', name)
  let i = start + whole.length
  let attr = ''
  let empty = false
  while (i < code.length && code.charAt(i) !== '>') {
    const ch = code.charAt(i)
    if (ch === '{' && scripts.braces) {
      i = scanBraces(code, i, out, scripts.keywords, scripts.jsx)
      continue
    }
    if (ch === '/') {
      empty = code.charAt(i + 1) === '>'
      push(out, 'pun', '/')
      i++
      continue
    }
    const part = TAG_PART.exec(code.slice(i))
    if (part === null) {
      push(out, null, ch)
      i++
      continue
    }
    const [text, space, attrName, eq, value] = part
    if (value !== undefined && scripts.quoted(attr)) {
      const quote = value.charAt(0)
      push(out, 'pun', quote)
      const stop = scanScript(code, i + 1, out, scripts.keywords, { until: quote })
      if (code.charAt(stop) === quote) push(out, 'pun', quote)
      i = code.charAt(stop) === quote ? stop + 1 : stop
      continue
    }
    if (attrName !== undefined) attr = attrName
    push(out, space !== undefined ? null : attrName !== undefined ? 'attr' : eq !== undefined ? 'pun' : 'str', text)
    i += text.length
  }
  if (i < code.length) {
    push(out, 'pun', '>')
    i++
  }
  return { end: i, name, closing: slash === '/', empty }
}

/** Plain text from `start` to the next of `stops` after it; returns where it ended. */
function plainText(code: string, start: number, out: CodeToken[], stops: string): number {
  let end = code.length
  for (const stop of stops) {
    const at = code.indexOf(stop, start + 1)
    if (at >= 0 && at < end) end = at
  }
  push(out, null, code.slice(start, end))
  return end
}

/** One JSX element from its `<` past its closing tag: attributes, children and `{…}`. */
function scanJsx(code: string, start: number, out: CodeToken[], keywords: ReadonlySet<string>): number {
  const scripts: TagScripts = { keywords, braces: true, jsx: true, quoted: () => false }
  const first = TAG_OPEN.exec(code.slice(start))
  if (first === null) return plainText(code, start, out, '<{')
  const open = scanTag(code, start, first, out, scripts)
  if (open.closing || open.empty) return open.end
  let i = open.end
  while (i < code.length) {
    const tag = TAG_OPEN.exec(code.slice(i))
    if (tag !== null && tag[1] === '/') return scanTag(code, i, tag, out, scripts).end
    if (tag !== null) i = scanJsx(code, i, out, keywords)
    else if (code.charAt(i) === '{') i = scanBraces(code, i, out, keywords, true)
    else i = plainText(code, i, out, '<{')
  }
  return i
}

type Flavour = 'html' | 'vue' | 'svelte'

const SCRIPTS: Record<Flavour, TagScripts> = {
  // TypeScript's words in HTML too: a module script uses `if`, `try` and `catch` like any other.
  html: { keywords: TS_KEYWORDS, braces: false, jsx: false, quoted: () => false },
  vue: { keywords: TS_KEYWORDS, braces: false, jsx: false, quoted: (attr) => /^(?::|@|v-)/.test(attr) },
  svelte: { keywords: TS_KEYWORDS, braces: true, jsx: false, quoted: () => false },
}

/**
 * Markup with scripts in it: tags outside `<script>`, script inside, and in
 * Vue and Svelte the expressions their attributes and braces hold. Enough for
 * the pages' examples, not a parser — a `>` inside a quoted attribute value
 * would end the tag early, and the examples have none.
 */
function highlightMarkup(code: string, flavour: Flavour): CodeToken[] {
  const scripts = SCRIPTS[flavour]
  const out: CodeToken[] = []
  let i = 0
  while (i < code.length) {
    if (scripts.braces && code.charAt(i) === '{') {
      i = scanBraces(code, i, out, scripts.keywords, false)
      continue
    }
    const open = TAG_OPEN.exec(code.slice(i))
    if (open === null) {
      i = plainText(code, i, out, scripts.braces ? '<{' : '<')
      continue
    }
    const tag = scanTag(code, i, open, out, scripts)
    i = tag.end
    if (!tag.closing && !tag.empty && tag.name === 'script')
      i = scanScript(code, i, out, scripts.keywords, { until: '</script' })
  }
  return out
}

/** The page's HTML example: markup, and JavaScript inside its module script. */
export function highlightHtml(code: string): CodeToken[] {
  return highlightMarkup(code, 'html')
}
```

At the end of the file add:

```ts
/** A fenced block's colours by its language, or null for a language the page shows plain (`text`). */
export function highlight(lang: string | null | undefined, code: string): CodeToken[] | null {
  if (lang === 'html' || lang === 'vue' || lang === 'svelte') return highlightMarkup(code, lang)
  if (lang === 'ts' || lang === 'tsx') {
    const out: CodeToken[] = []
    scanScript(code, 0, out, TS_KEYWORDS, { jsx: lang === 'tsx' })
    return out
  }
  if (lang === 'sh') return highlightSh(code)
  if (lang === 'json') return highlightJson(code)
  return null
}
```

`TAG_OPEN` stays as it is (`/^<(\/?)([a-zA-Z][\w-]*)/`).

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd apps/lab && pnpm vitest run --project node src/docs/codeTokens.test.ts`
Expected: PASS, the existing `the example` cases included — the HTML example's colours do not change.

- [ ] **Step 5: Mutation.** In `JSX_AFTER` delete `'return'`; run the TSX case; expect FAIL (no `arrowz-board` tag). Undo by hand. In `SCRIPTS.vue.quoted` return `false`; expect the Vue case to FAIL (`ready` and `onPiece` lose their script scan, `"ready"` turns up as `str`). Undo by hand. In `scanTag` never set `empty`; expect "a self-closing element ends at its slash" to FAIL. Undo by hand. Set `SCRIPTS.html.keywords` to `JS_KEYWORDS`; expect "an HTML script's try, catch, if, instanceof and throw are keywords" to FAIL. Undo by hand.

- [ ] **Step 6: Type-check, lint, format** (Prettier rewraps some of the plan's long lines; commit what it writes)

```bash
cd apps/lab && npx prettier --write src/docs/codeTokens.ts src/docs/codeTokens.test.ts && cd ../.. && pnpm nx run lab:check --skip-nx-cache && pnpm nx run lab:lint --skip-nx-cache
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/lab/src/docs/codeTokens.ts apps/lab/src/docs/codeTokens.test.ts
git commit -m "lab: the docs colour TypeScript, TSX, Vue and Svelte blocks, and every block reads back as written"
```

---

### Task 3: The grammar — `::::tabs` and `:::tab` in the content guard

**Files:**
- Create: `apps/lab/src/docs/tabs.ts`
- Create: `apps/lab/src/docs/tabs.test.ts`
- Modify: `apps/lab/src/docs/shape.ts`
- Modify: `apps/lab/src/docs/shape.test.ts`

**Interfaces:**
- Produces (`tabs.ts`): `TAB_GROUPS` (`{ framework: readonly [{ id: 'html'; label: 'HTML' }, …] }`, `as const`), `type TabGroup = keyof typeof TAB_GROUPS`, `isTabGroup(name: string | null | undefined): name is TabGroup`, `TAB_IDS: readonly string[]`, `type DocsTabs = Readonly<Record<TabGroup, string>>`, `docsTabsOf(stored: string | null): DocsTabs`.
- Produces (`shape.ts`): `CONTAINERS.tabs`, `CONTAINERS.tab`, `CODE_LANGS` with the four new languages; `shapeOf` lists a code block's file name.

- [ ] **Step 1: Write the failing tests.** Create `apps/lab/src/docs/tabs.test.ts`:

```ts
import { expect, test } from 'vitest'
import { docsTabsOf, isTabGroup, TAB_GROUPS, TAB_IDS } from './tabs'

test('the framework group is HTML, Angular, React, Vue and Svelte, in that order', () => {
  expect(TAB_GROUPS.framework.map((tab) => tab.label)).toEqual(['HTML', 'Angular', 'React', 'Vue', 'Svelte'])
  expect(TAB_IDS).toEqual(['html', 'angular', 'react', 'vue', 'svelte'])
})

test('a group is known by its name only', () => {
  expect(isTabGroup('framework')).toBe(true)
  expect(isTabGroup('toString')).toBe(false)
  expect(isTabGroup(undefined)).toBe(false)
})

// What the page may find stored: nothing, damage, an older or a foreign choice.
test.each([
  [null, 'html'],
  ['', 'html'],
  ['not json', 'html'],
  ['[]', 'html'],
  ['3', 'html'],
  ['{"framework":"solid"}', 'html'],
  ['{"framework":3}', 'html'],
  ['{"framework":"vue"}', 'vue'],
  ['{"framework":"svelte","other":"x"}', 'svelte'],
])('stored %j opens on %s', (stored, id) => {
  expect(docsTabsOf(stored)).toEqual({ framework: id })
})
```

In `apps/lab/src/docs/shape.test.ts`, append:

```ts
describe('tab directives', () => {
  // `DOCS_PAGES` is already imported at the top of this file.
  const inPage = (md: string) => problemsOf(parseDocs(`# T\n\n## A {#a}\n\n${md}`), DOCS_PAGES)
  const tab = (id: string, body = 'Prose.') => `:::tab{id="${id}"}\n${body}\n:::`
  const group = (...tabs: string[]) => `::::tabs{group="framework"}\n${tabs.join('\n')}\n::::`
  const ALL = ['html', 'angular', 'react', 'vue', 'svelte']
  const all = (body = 'Prose.') => group(...ALL.map((id) => tab(id, body)))

  test('a group with every tab in order, prose, lists and named code is fine', () => {
    const react = tab('react', 'Prose.\n\n```ts a.d.ts\nx\n```\n\n```tsx\ny\n```')
    const vue = tab('vue', '- a list')
    expect(inPage(group(tab('html'), tab('angular'), react, vue, tab('svelte')))).toEqual([])
  })

  test.each([
    ['an unknown group', all().replace('framework', 'os'), 'group="os" is not one of framework'],
    ['a missing tab', group(...ALL.slice(0, 4).map((id) => tab(id))), 'needs the tabs html, angular, react, vue, svelte'],
    ['tabs out of order', group(...[...ALL].reverse().map((id) => tab(id))), 'needs the tabs'],
    ['a tab twice', group(...[...ALL, 'html'].map((id) => tab(id))), 'needs the tabs'],
    ['an unknown tab', group(...ALL.map((id) => tab(id === 'svelte' ? 'solid' : id))), 'id="solid" is not one of'],
    ['prose straight in the group', all().replace('::::tabs{group="framework"}', '::::tabs{group="framework"}\nLoose.'), 'holds tabs only'],
    ['a heading in a tab', all('### Heading'), 'a tab holds paragraphs, lists and code only'],
    ['a group in a tab', all(all()), 'a tab holds paragraphs, lists and code only'],
    ['a tab on its own', tab('html'), 'stands only in a ::::tabs'],
    ['a tab with a label', all().replace(':::tab{id="react"}', ':::tab[React]{id="react"}'), ':::tab takes no label'],
    ['an empty tab', all().replace(':::tab{id="vue"}\nProse.\n:::', ':::tab{id="vue"}\n:::'), 'an empty tab'],
    ['two unnamed blocks in a tab', all('```ts\nx\n```\n\n```ts\ny\n```'), 'names every code block but one by its file'],
    ['one file name twice in a tab', all('```ts a.ts\nx\n```\n\n```ts a.ts\ny\n```'), 'a file name twice'],
    ['a meta of two words', all('```ts a b\nx\n```'), "a code block's meta is one file name"],
    // The parser closes a tab at a `:::` line, even inside a fenced block.
    ['a ::: line inside a block', all('```html\n:::\n```'), 'holds tabs only'],
  ])('refuses %s', (_, md, needle) => {
    expect(inPage(md).join(' | ')).toContain(needle)
  })

  test('a code block takes a language of the framework examples', () => {
    for (const lang of ['ts', 'tsx', 'vue', 'svelte']) expect(inPage(`\`\`\`${lang}\nx\n\`\`\``)).toEqual([])
  })
})
```

The `:::` case rests on a parser probe: the line closes the tab and leaves a code block straight in the group. If the guard reports it with another message, print `inPage(md)` and pin the message it does produce; the case must stay red without the guard.

and inside the existing `describe('shapeOf', …)`, append two cases:

```ts
  test('tells another file name apart', () => {
    expect(shapeOf(parseDocs('# T\n\n```ts a.ts\nx\n```'))).not.toEqual(shapeOf(parseDocs('# T\n\n```ts b.ts\nx\n```')))
  })

  test('a translated // comment keeps the shape of a script block', () => {
    const en = '# T\n\n```ts\nconst a = 1 // one\n// the rest\nconst url = \'https://x\'\n```'
    const pl = '# T\n\n```ts\nconst a = 1 // jeden\n// reszta\nconst url = \'https://x\'\n```'
    expect(shapeOf(parseDocs(pl))).toEqual(shapeOf(parseDocs(en)))
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/lab && pnpm vitest run --project node src/docs/tabs.test.ts src/docs/shape.test.ts`
Expected: FAIL — `./tabs` does not exist; the shape cases fail on unknown directives.

- [ ] **Step 3: Create `apps/lab/src/docs/tabs.ts`:**

```ts
/**
 * The tab groups a docs page may hold, `::::tabs{group}`, and their tabs in
 * order. A label is a name and is not translated. Pure: the content guard
 * reads it in Node, and the store reads the remembered choice through
 * `docsTabsOf`.
 */
export const TAB_GROUPS = {
  framework: [
    { id: 'html', label: 'HTML' },
    { id: 'angular', label: 'Angular' },
    { id: 'react', label: 'React' },
    { id: 'vue', label: 'Vue' },
    { id: 'svelte', label: 'Svelte' },
  ],
} as const

export type TabGroup = keyof typeof TAB_GROUPS

/** The chosen tab of every group, by id. */
export type DocsTabs = Readonly<Record<TabGroup, string>>

export function isTabGroup(name: string | null | undefined): name is TabGroup {
  return typeof name === 'string' && Object.hasOwn(TAB_GROUPS, name)
}

export const TAB_IDS: readonly string[] = Object.values(TAB_GROUPS).flatMap((tabs) => tabs.map((tab) => tab.id))

/** The remembered choice, as stored JSON; anything missing, damaged or unknown is the group's first tab. */
export function docsTabsOf(stored: string | null): DocsTabs {
  let saved: unknown = null
  try {
    saved = stored === null ? null : JSON.parse(stored)
  } catch {
    saved = null
  }
  const pick = (group: TabGroup): string => {
    const value = typeof saved === 'object' && saved !== null ? Reflect.get(saved, group) : undefined
    const tabs = TAB_GROUPS[group]
    return tabs.find((tab) => tab.id === value)?.id ?? tabs[0].id
  }
  return { framework: pick('framework') }
}
```

- [ ] **Step 4: Teach `shape.ts` the containers.** In `apps/lab/src/docs/shape.ts`:

Add `import { isTabGroup, TAB_GROUPS, TAB_IDS } from './tabs'`.

Replace `CONTAINERS` with:

```ts
/**
 * `:::compare` holds boards side by side; its `stats` speak for every board in
 * it. `::::tabs` holds one `:::tab` per tab of its group (`TAB_GROUPS`).
 */
export const CONTAINERS: Readonly<Record<string, DirectiveRule>> = {
  compare: { label: false, required: {}, optional: { stats: statsProblem } },
  tabs: { label: false, required: { group: Object.keys(TAB_GROUPS) }, optional: {} },
  tab: { label: false, required: { id: TAB_IDS }, optional: {} },
}
```

Replace `CODE_LANGS` with:

```ts
/** Fenced code is coloured as its language; `text` is a terminal's output and stays plain. */
export const CODE_LANGS: readonly string[] = ['html', 'sh', 'json', 'text', 'ts', 'tsx', 'vue', 'svelte']

/** A code block's meta: the one file name it is shown under. */
const FILE_NAME = /^[\w.-]+$/

/** What a tab holds: no heading, which would be a section the reader cannot see, and no directive. */
const PANEL = new Set(['paragraph', 'list', 'code'])
```

Replace `containerProblems` with:

```ts
function containerProblems(node: ContainerDirective, at: string, parent: Nodes | null): string[] {
  const rule = Object.hasOwn(CONTAINERS, node.name) ? CONTAINERS[node.name] : undefined
  if (rule === undefined) return [`${at}: :::${node.name} is not a docs directive`]
  const out = attributeProblems(node, rule, at)
  if (node.name === 'tabs') return [...out, ...tabsProblems(node, at)]
  if (node.name === 'tab') return [...out, ...tabProblems(node, at, parent)]
  const boards = node.children.filter((child) => child.type === 'leafDirective' && child.name === 'board')
  if (boards.length !== node.children.length) out.push(`${at}: :::${node.name} holds boards only`)
  if (boards.length < 2) out.push(`${at}: :::${node.name} needs two boards or more`)
  for (const child of boards)
    if (child.type === 'leafDirective' && 'stats' in (child.attributes ?? {}))
      out.push(`${at}: a board in :::${node.name} takes its stats from the comparison`)
  return out
}

/** Every tab of the group, once each, in the group's order: a page may not leave a framework out. */
function tabsProblems(node: ContainerDirective, at: string): string[] {
  const out: string[] = []
  const tabs = node.children.filter((child) => child.type === 'containerDirective' && child.name === 'tab')
  if (tabs.length !== node.children.length) out.push(`${at}: ::::tabs holds tabs only`)
  const group = node.attributes?.['group']
  if (!isTabGroup(group)) return out
  const want = TAB_GROUPS[group].map((tab) => tab.id)
  const got = tabs.map((tab) => (tab.type === 'containerDirective' ? (tab.attributes?.['id'] ?? '') : ''))
  if (got.join(' ') !== want.join(' '))
    out.push(`${at}: ::::tabs{group="${group}"} needs the tabs ${want.join(', ')}, in that order`)
  return out
}

function tabProblems(node: ContainerDirective, at: string, parent: Nodes | null): string[] {
  const out: string[] = []
  if (parent?.type !== 'containerDirective' || parent.name !== 'tabs') out.push(`${at}: :::tab stands only in a ::::tabs`)
  // A `[label]` parses as a first paragraph flagged `directiveLabel`, which the page would show as prose.
  if (node.children.some((child) => child.type === 'paragraph' && child.data?.directiveLabel === true))
    out.push(`${at}: :::tab takes no label`)
  if (node.children.length === 0) out.push(`${at}: an empty tab`)
  if (!node.children.every((child) => PANEL.has(child.type)))
    out.push(`${at}: a tab holds paragraphs, lists and code only`)
  const names = node.children.flatMap((child) => (child.type === 'code' ? [child.meta ?? null] : []))
  if (names.filter((name) => name === null).length > 1)
    out.push(`${at}: a tab names every code block but one by its file`)
  const named = names.filter((name) => name !== null)
  if (new Set(named).size !== named.length) out.push(`${at}: a file name twice in one tab`)
  return out
}
```

In `problemsOf`, give `walk` the parent: change `const walk = (node: Nodes): void => {` to `const walk = (node: Nodes, parent: Nodes | null): void => {`, the recursion line to `if ('children' in node) for (const child of node.children) walk(child, node)`, the call at the end to `walk(root, null)`, and the container line to `if (node.type === 'containerDirective') out.push(...containerProblems(node, at, parent))`. After the `CODE_LANGS` check add:

```ts
    if (node.type === 'code' && node.meta != null && !FILE_NAME.test(node.meta))
      out.push(`${at}: a code block's meta is one file name`)
```

Replace `codeOf` with (a script's `//` comments are prose and are translated, as a shell block's `#` comments are):

```ts
/** What a translation may change in a block: its comments, which are prose. */
const COMMENT: Readonly<Record<string, RegExp>> = {
  sh: /(^|\s+)#.*$/,
  ts: /(^|\s+)\/\/.*$/,
  tsx: /(^|\s+)\/\/.*$/,
  vue: /(^|\s+)\/\/.*$/,
  svelte: /(^|\s+)\/\/.*$/,
}

/** A block without its comments. */
const codeOf = (lang: string | null | undefined, value: string): string => {
  const comment = lang != null && Object.hasOwn(COMMENT, lang) ? COMMENT[lang] : undefined
  return comment === undefined
    ? value
    : value
        .split('\n')
        .map((line) => line.replace(comment, ''))
        .join('\n')
}
```

In `shapeOf`, change the code line to:

```ts
    if (node.type === 'code')
      out.push(`code ${node.lang ?? ''}${node.meta == null ? '' : ` ${node.meta}`}: ${codeOf(node.lang, node.value)}`)
```

Update the module header's first sentence only if it no longer holds; it names `DIRECTIVES` and `CONTAINERS`, which still hold the rules.

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd apps/lab && pnpm vitest run --project node src/docs/tabs.test.ts src/docs/shape.test.ts src/docs/content.test.ts`
Expected: PASS. `content.test.ts` passes untouched: no page uses tabs yet, and a block without meta has the shape it had.

- [ ] **Step 6: Mutation.** In `tabProblems` delete the `parent` check; the case "a tab on its own" FAILS. Undo by hand. In `tabsProblems` compare `got` and `want` as sorted lists; the case "tabs out of order" FAILS. Undo by hand.

- [ ] **Step 7: Check, lint, format, commit**

```bash
cd apps/lab && npx prettier --write src/docs/tabs.ts src/docs/tabs.test.ts src/docs/shape.ts src/docs/shape.test.ts && cd ../.. && pnpm nx run lab:check --skip-nx-cache && pnpm nx run lab:lint --skip-nx-cache
git add apps/lab/src/docs/tabs.ts apps/lab/src/docs/tabs.test.ts apps/lab/src/docs/shape.ts apps/lab/src/docs/shape.test.ts
git commit -m "lab: docs pages may hold framework tabs, every tab in order, and name a code block by its file"
```

---

### Task 4: The remembered choice — `ui.docsTabs`

**Files:**
- Modify: `apps/lab/src/state/ui.slice.ts`
- Modify: `apps/lab/src/state/ui.slice.test.ts`

**Interfaces:**
- Consumes: `docsTabsOf`, `DocsTabs`, `TabGroup` from `../docs/tabs` (Task 3).
- Produces: `UiState.docsTabs: DocsTabs`, `UiState.setDocsTab(group: TabGroup, id: string): void`, `DOCS_TABS_KEY = 'labDocsTabs'`.

- [ ] **Step 1: Write the failing test.** In `apps/lab/src/state/ui.slice.test.ts`, append:

```ts
describe('the docs tabs', () => {
  function slice() {
    const store: { ui: UiState } = { ui: createUiSlice((fn) => Object.assign(store, fn(store))) }
    return store
  }

  it('a choice reaches every group of its name', () => {
    const store = slice()
    store.ui.setDocsTab('framework', 'vue')
    expect(store.ui.docsTabs).toEqual({ framework: 'vue' })
  })

  it('two choices before a render keep the last', () => {
    const store = slice()
    store.ui.setDocsTab('framework', 'vue')
    store.ui.setDocsTab('framework', 'react')
    expect(store.ui.docsTabs.framework).toBe('react')
  })
})
```

Whether the choice survives a reload needs Web Storage, which the node project does not have; Task 5 tests it in the browser.

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/lab && pnpm vitest run --project node src/state/ui.slice.test.ts`
Expected: FAIL — `setDocsTab` is not a function.

- [ ] **Step 3: Implement.** In `apps/lab/src/state/ui.slice.ts`:

Add `import { type DocsTabs, docsTabsOf, type TabGroup } from '../docs/tabs'`.

After `SETTINGS_KEY`, add:

```ts
/** Where the docs' chosen tabs are remembered: one id per group, as JSON. */
export const DOCS_TABS_KEY = 'labDocsTabs'
```

In `interface UiState`, after `boardMode: BoardMode`, add:

```ts
  /** The chosen tab of each docs tab group, shared by every group of that name. Remembered, never in the hash. */
  docsTabs: DocsTabs
```

and after `setBoardMode(mode: BoardMode): void`:

```ts
  setDocsTab(group: TabGroup, id: string): void
```

In `createUiSlice`'s returned object, after `boardMode: 'view',`:

```ts
    docsTabs: docsTabsOf(readStored(DOCS_TABS_KEY)),
```

and after `setBoardMode: …,`:

```ts
    // Read inside the update, like `toggleSolo`: a click and a key can both land before a render.
    setDocsTab: (group, id) =>
      set((state) => {
        const docsTabs = { ...state.ui.docsTabs, [group]: id }
        writeStored(DOCS_TABS_KEY, JSON.stringify(docsTabs))
        return { ui: { ...state.ui, docsTabs } }
      }),
```

`resetApp` (`harness/mountApp.tsx`) needs no line: it restores `useStore.getInitialState()`, and the setup file empties Web Storage before the store is created, so the initial state is the first tab.

- [ ] **Step 4: Run, check, commit**

```bash
cd apps/lab && pnpm vitest run --project node src/state/ui.slice.test.ts && npx prettier --write src/state/ui.slice.ts src/state/ui.slice.test.ts && cd ../.. && pnpm nx run lab:check --skip-nx-cache
git add apps/lab/src/state/ui.slice.ts apps/lab/src/state/ui.slice.test.ts
git commit -m "lab: the store remembers the docs' chosen framework tab"
```

Expected: PASS, no type errors.

---

### Task 5: Drawing the tabs, the file names and the board-file table

**Files:**
- Create: `apps/lab/src/docs/DocsTabs.tsx`
- Create: `apps/lab/src/docs/DocsTabs.browser.test.tsx`
- Modify: `apps/lab/src/docs/DocsMarkdown.tsx`
- Modify: `apps/lab/src/routes/DocsBlock.tsx`
- Modify: `apps/lab/src/docs/DocsTable.tsx`
- Modify: `apps/lab/src/docs/shape.ts` (`DIRECTIVES.table.required.of` gains `'board-file'`)
- Modify: `apps/lab/src/design/docs.css`
- Modify: `apps/lab/src/design/touch.browser.test.tsx`

**Interfaces:**
- Consumes: `highlight` (Task 2); `TAB_GROUPS`, `isTabGroup` (Task 3); `ui.docsTabs`, `ui.setDocsTab`, `DOCS_TABS_KEY` (Task 4); `BOARD_FILE_FIELDS`, `Docs.boardFile`, `Docs.frameworkLabel` from `@arrowz/engine/docs` (Task 1 — rebuild the engine first).
- Produces: `DocsTabs({ node, panel })`; `DocsBlock` gains `file?: string | undefined`; `::table{of="board-file"}`.

- [ ] **Step 1: Write the failing browser test.** Create `apps/lab/src/docs/DocsTabs.browser.test.tsx`:

```tsx
import { act } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { renderAt } from '../harness/renderAt'
import { createUiSlice, DOCS_TABS_KEY } from '../state/ui.slice'
import { useStore } from '../state/store'
import { DocsMarkdown } from './DocsMarkdown'
import { parseDocs } from './markdown'
import { TAB_GROUPS } from './tabs'
// The narrow-width case measures the strip's own scrolling, which only the sheets give it.
import '../design/index.css'

/** One framework group; the React tab holds a named and an unnamed block, the rest one line each. */
const group = (word: string) =>
  [
    '::::tabs{group="framework"}',
    ...TAB_GROUPS.framework.map((tab) =>
      tab.id === 'react'
        ? `:::tab{id="react"}\n${word} react.\n\n\`\`\`ts a.d.ts\nconst a = 1\n\`\`\`\n\n\`\`\`tsx\nconst b = 2\n\`\`\`\n:::`
        : `:::tab{id="${tab.id}"}\n${word} ${tab.id}.\n:::`,
    ),
    '::::',
  ].join('\n')

const PAGE = parseDocs(['# T', '## Part {#part}', group('one'), 'Between.', group('two')].join('\n\n'))

// `.fw-docs` as on the page: its paragraph rule competes with the caption's.
const mount = (width?: number) =>
  renderAt(
    <section className="fw-docs">
      <div className="fw-docs-body" style={width === undefined ? undefined : { width: `${width}px` }}>
        <DocsMarkdown root={PAGE} />
      </div>
    </section>,
  )

const selected = (container: HTMLElement) =>
  [...container.querySelectorAll('[role="tab"][aria-selected="true"]')].map((tab) => tab.textContent)

beforeEach(() => {
  localStorage.clear()
  useStore.setState(useStore.getInitialState(), true)
  useStore.getState().lang.setLang('en')
})
afterEach(() => vi.restoreAllMocks())

test('each group is a tablist named Framework, five tabs, the first chosen', async () => {
  const screen = await mount()
  const lists = [...screen.container.querySelectorAll('[role="tablist"]')]
  expect(lists).toHaveLength(2)
  for (const list of lists) {
    expect(list.getAttribute('aria-label')).toBe('Framework')
    expect([...list.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual([
      'HTML',
      'Angular',
      'React',
      'Vue',
      'Svelte',
    ])
  }
  expect(selected(screen.container)).toEqual(['HTML', 'HTML'])
})

test('only the chosen panel is in the document, labelled by its tab', async () => {
  const screen = await mount()
  const panels = [...screen.container.querySelectorAll('[role="tabpanel"]')]
  expect(panels.map((panel) => panel.textContent)).toEqual(['one html.', 'two html.'])
  for (const panel of panels) {
    const tab = document.getElementById(panel.getAttribute('aria-labelledby') ?? '')
    expect(tab?.getAttribute('aria-selected')).toBe('true')
    expect(tab?.getAttribute('aria-controls')).toBe(panel.id)
  }
  expect(screen.container.querySelectorAll('[role="tab"][aria-controls]')).toHaveLength(2)
  // A panel with no control of its own is a Tab stop, so the keyboard reaches its text.
  for (const panel of panels) expect(panel.getAttribute('tabindex')).toBe('0')
})

test('every id on the page is unique, and each panel belongs to its own group', async () => {
  const screen = await mount()
  const ids = [...screen.container.querySelectorAll('[id]')].map((el) => el.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const panel of screen.container.querySelectorAll('[role="tabpanel"]')) {
    const tab = document.getElementById(panel.getAttribute('aria-labelledby') ?? '')
    expect(tab?.closest('.fw-docs-tabs')).toBe(panel.closest('.fw-docs-tabs'))
  }
})

// Unhandled, an arrow key would scroll the page sideways under the strip.
test('an arrow key on a tab is the strip\'s, not the page\'s', async () => {
  const screen = await mount()
  const tab = screen.container.querySelector<HTMLElement>('[role="tab"]')
  if (tab === null) throw new Error('no tab')
  const key = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
  await act(async () => tab.dispatchEvent(key))
  expect(key.defaultPrevented).toBe(true)
})

test('choosing a tab in one group chooses it in every group', async () => {
  const screen = await mount()
  await screen.getByRole('tab', { name: 'React' }).last().click()
  await expect.poll(() => selected(screen.container)).toEqual(['React', 'React'])
  expect(screen.container.textContent).toContain('one react.')
  expect(screen.container.textContent).toContain('two react.')
})

test('the arrows move the choice and the focus and wrap, Home and End jump', async () => {
  const screen = await mount()
  const first = screen.getByRole('tab', { name: 'HTML' }).first()
  await first.click()
  await userEvent.keyboard('{ArrowLeft}')
  await expect.element(screen.getByRole('tab', { name: 'Svelte' }).first()).toHaveFocus()
  expect(selected(screen.container)).toEqual(['Svelte', 'Svelte'])
  await userEvent.keyboard('{Home}')
  await expect.element(screen.getByRole('tab', { name: 'HTML' }).first()).toHaveFocus()
  await userEvent.keyboard('{End}')
  await expect.element(screen.getByRole('tab', { name: 'Svelte' }).first()).toHaveFocus()
  await userEvent.keyboard('{ArrowRight}')
  await expect.element(screen.getByRole('tab', { name: 'HTML' }).first()).toHaveFocus()
  // The other group follows the choice, never the focus.
  expect(document.activeElement?.closest('[role="tablist"]')).toBe(
    screen.container.querySelectorAll('[role="tablist"]')[0],
  )
})

test('only the chosen tab is in the tab order', async () => {
  const screen = await mount()
  const list = screen.container.querySelector('[role="tablist"]')
  expect([...(list?.querySelectorAll('[role="tab"]') ?? [])].map((tab) => tab.getAttribute('tabindex'))).toEqual([
    '0',
    '-1',
    '-1',
    '-1',
    '-1',
  ])
})

test('the choice is remembered for the next visit', async () => {
  const screen = await mount()
  await screen.getByRole('tab', { name: 'Vue' }).first().click()
  await expect.poll(() => localStorage.getItem(DOCS_TABS_KEY)).toBe('{"framework":"vue"}')
  // A store made now reads what the next page load would.
  expect(createUiSlice(() => {}).docsTabs).toEqual({ framework: 'vue' })
})

test('a block is captioned and copied by its file name, or by its section and tab', async () => {
  const write = vi.fn(() => Promise.resolve())
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText: write } as unknown as Clipboard)
  const screen = await mount()
  await screen.getByRole('tab', { name: 'React' }).first().click()
  await expect.element(screen.getByRole('button', { name: 'Copy: a.d.ts' }).first()).toBeVisible()
  await expect.element(screen.getByRole('button', { name: 'Copy: Part, React' }).first()).toBeVisible()
  expect([...screen.container.querySelectorAll('.fw-docs-file')].map((p) => p.textContent)).toEqual([
    'a.d.ts',
    'a.d.ts',
  ])
  const caption = screen.container.querySelector('.fw-docs-file')
  if (caption === null) throw new Error('no caption')
  expect(getComputedStyle(caption).marginBottom).toBe('6px')
  expect(getComputedStyle(caption).fontSize).toBe('12px')
  await screen.getByRole('button', { name: 'Copy: a.d.ts' }).first().click()
  expect(write).toHaveBeenCalledWith('const a = 1')
})

test('Copy names its tab in Polish too', async () => {
  useStore.getState().lang.setLang('pl')
  const screen = await mount()
  await act(async () => useStore.getState().ui.setDocsTab('framework', 'react'))
  await expect.element(screen.getByRole('button', { name: 'Kopiuj: Part, React' }).first()).toBeVisible()
})

// 200 px is narrower than the five labels: the strip must scroll, the page must not.
test('at a narrow width the strip scrolls by itself and the page does not', async () => {
  const screen = await mount(200)
  const body = screen.container.querySelector<HTMLElement>('.fw-docs-body')
  const strip = screen.container.querySelector<HTMLElement>('[role="tablist"]')
  if (body === null || strip === null) throw new Error('no body or strip')
  expect(strip.scrollWidth).toBeGreaterThan(strip.clientWidth)
  expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth)
})
```

In `apps/lab/src/design/touch.browser.test.tsx`, add to the first table (raised for a finger), after the `a docs section link` entry:

```tsx
  ['a docs tab', '<div class="fw-docs-tablist"><button>React</button></div>', 'button', 44],
```

and the same line to the second table (raised at XS), after its `a docs section link` entry.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm nx build engine --skip-nx-cache && cd apps/lab && pnpm vitest run --project chromium src/docs/DocsTabs.browser.test.tsx src/design/touch.browser.test.tsx`
Expected: every case FAILS but the unique-id one (vacuously green with no tabs drawn) — the renderer draws nothing for `tabs` — and the two docs-tab touch cases read 0.

- [ ] **Step 3: The component.** Create `apps/lab/src/docs/DocsTabs.tsx`:

```tsx
/**
 * A tab group of a docs page: `::::tabs{group}` with one `:::tab{id}` per tab
 * of its group (`TAB_GROUPS`), checked by `shape.ts`. Every group of the same
 * name follows one remembered choice, `ui.docsTabs`. The keyboard is
 * `TabRow`'s: the arrows wrap, Home and End jump, and only the chosen panel
 * is in the document. `panel` draws a tab's blocks, so this file does not
 * import the renderer that imports it.
 */
import type { ContainerDirective } from 'mdast-util-directive'
import { type KeyboardEvent, type ReactElement, type ReactNode, useId } from 'react'
import { nextIndex, useFocusFollowsSelection } from '../shell/roving'
import { useStore } from '../state/store'
import { isTabGroup, TAB_GROUPS } from './tabs'
import { useDocs } from './useDocs'

export function DocsTabs({
  node,
  panel,
}: {
  node: ContainerDirective
  panel: (tab: ContainerDirective, label: string) => ReactNode
}): ReactElement | null {
  const docs = useDocs()
  const base = useId()
  const group = node.attributes?.['group']
  const chosen = useStore((state) => (isTabGroup(group) ? state.ui.docsTabs[group] : null))
  const setDocsTab = useStore((state) => state.ui.setDocsTab)
  const focusRef = useFocusFollowsSelection(chosen)
  if (!isTabGroup(group)) return null
  const tabs = TAB_GROUPS[group]
  const current = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === chosen),
  )
  // `current` is already inside the tuple; `?? tabs[0]` only satisfies the index type.
  const selected = tabs[current] ?? tabs[0]
  const content = node.children.find(
    (child) => child.type === 'containerDirective' && child.name === 'tab' && child.attributes?.['id'] === selected.id,
  )

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const next = nextIndex(event.key, current, tabs.length, { axis: 'horizontal', wrap: true })
    const tab = next === null ? undefined : tabs[next]
    if (tab === undefined || !isTabGroup(group)) return
    event.preventDefault()
    setDocsTab(group, tab.id)
  }

  return (
    <div className="fw-docs-tabs">
      <div className="fw-docs-tablist" role="tablist" aria-label={docs.frameworkLabel}>
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${base}-${tab.id}`}
            aria-selected={i === current}
            // Only the chosen panel is in the document; pointing at an absent id is worse than not pointing.
            {...(i === current ? { 'aria-controls': `${base}-panel` } : {})}
            tabIndex={i === current ? 0 : -1}
            ref={i === current ? focusRef : undefined}
            onClick={() => setDocsTab(group, tab.id)}
            onKeyDown={onKeyDown}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        className="fw-docs-tabpanel"
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-${selected.id}`}
        // A panel of prose has no control of its own; as in `Workspace`, the panel is the Tab stop.
        tabIndex={0}
      >
        {content?.type === 'containerDirective' ? panel(content, selected.label) : null}
      </div>
    </div>
  )
}
```

`useFocusFollowsSelection` moves the focus only while the focus is already in the strip, so choosing in one group never pulls the focus into the other.

- [ ] **Step 4: The block's file name.** Replace `apps/lab/src/routes/DocsBlock.tsx`'s component with:

```tsx
/**
 * One block of a documentation page with its Copy button. The button comes
 * after the `pre` in the DOM and stands in a column of its own beside it
 * (`docs.css`), out of the box that scrolls, so it never covers a line.
 *
 * `text` is what Copy writes, `children` what the block shows: the example is
 * coloured spans, and the clipboard must get the code, not the markup.
 *
 * The name says what is copied — `Copy: Using it`, `Copy: Board.tsx` —
 * because a page has many of these buttons and "Copy" alone tells a screen
 * reader user nothing. It starts with the visible label, so speech input that
 * says "Copy" still reaches it. A block with a `file` shows the name over it.
 */
export function DocsBlock({
  kind,
  section,
  text,
  file,
  children,
}: {
  kind: 'code' | 'term'
  /** What the block is named after: its file, or its section (and tab). */
  section: string
  text: string
  file?: string | undefined
  children: ReactNode
}): ReactElement {
  const dict = useDictionary()
  const { copied, copy } = useCopy()
  const label = copied ? dict.t('copied') : dict.t('copy')
  return (
    <>
      {file === undefined ? null : <p className="fw-docs-file">{file}</p>}
      <div className="fw-docs-block">
        <pre className={`fw-docs-pre fw-docs-${kind}`}>{children}</pre>
        <button type="button" className="fw-docs-copy" aria-label={`${label}: ${section}`} onClick={() => copy(text)}>
          {label}
        </button>
      </div>
    </>
  )
}
```

- [ ] **Step 5: The renderer.** In `apps/lab/src/docs/DocsMarkdown.tsx`:

Replace the `codeTokens` import with `import { highlight } from './codeTokens'` and add `import { DocsTabs } from './DocsTabs'`. Delete `tokensOf`.

Give `Placed` an optional tab:

```ts
interface Placed {
  readonly node: RootContent
  /** The section the block sits in: a table is labelled by it. */
  readonly section: DocsSection | null
  /** The nearest heading above the block, `##` or `###`: Copy is named after it. */
  readonly title: string
  /** The tab the block is drawn in, by its label. */
  readonly tab?: string | undefined
}
```

Change `function Block({ node, section, title }: Placed)` to `function Block({ node, section, title, tab }: Placed)`, its `case 'code':` to `return <CodeView node={node} title={title} tab={tab} />`, and its `case 'containerDirective':` to:

```tsx
    case 'containerDirective':
      if (node.name === 'compare') return <DocsCompare node={node} />
      if (node.name !== 'tabs') return null
      return (
        <DocsTabs
          node={node}
          panel={(panel, label) =>
            panel.children.map((child, i) => (
              <Block key={i} node={child} section={section} title={title} tab={label} />
            ))
          }
        />
      )
```

Replace `CodeView` with:

```tsx
/** A block's Copy is named after its file, or after its section and, in a tab, the tab. */
function CodeView({ node, title, tab }: { node: Code; title: string; tab?: string | undefined }): ReactElement {
  const tokens = highlight(node.lang, node.value)
  const file = node.meta ?? undefined
  const name = file ?? (tab === undefined ? title : `${title}, ${tab}`)
  if (tokens === null)
    return (
      <DocsBlock kind="term" section={name} text={node.value} file={file}>
        {node.value}
      </DocsBlock>
    )
  return (
    <DocsBlock kind="code" section={name} text={node.value} file={file}>
      <code>
        <TokenSpans tokens={tokens} />
      </code>
    </DocsBlock>
  )
}
```

Update the module header's list of directives: "the `::table`, `::play`, `::help` and `::board` leaf directives and the `:::compare` and `::::tabs` containers included".

- [ ] **Step 6: The table.** In `apps/lab/src/docs/shape.ts`, add `'board-file',` after `'element-slots',` in `DIRECTIVES.table.required.of`. In `apps/lab/src/docs/DocsTable.tsx`, add `BOARD_FILE_FIELDS` to the `@arrowz/engine/docs` import, and in `tableOf` before `if (of === 'keys')`:

```tsx
  if (of === 'board-file')
    return (
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col">{docs.colField}</th>
            <th scope="col">{docs.colType}</th>
            <th scope="col">{docs.colDescription}</th>
          </tr>
        </thead>
        <tbody>
          {BOARD_FILE_FIELDS.map((row) => (
            <tr key={row.key}>
              <Mono text={row.key} column="prop" />
              <Mono text={row.type} column="type" />
              <td>
                <InlineMarkdown text={docs.boardFile[row.key]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
```

Add `'board-file'` to the `DocsTable` header comment's list only if the comment lists tables by name (it lists them by owner: "the element's, from the shared rows" covers it — leave it).

- [ ] **Step 7: The styles.** In `apps/lab/src/design/docs.css`, insert right after the `.fw-docs-copy:hover { … }` block and before `@media (max-width: 1023px)` (a rule appended after a media block wins by order — keep the variant rules above the queries):

```css
/* A tab group over its panel. The strip scrolls sideways by itself, so five
   names on a phone never widen the page; the selected tab's bar is drawn
   inside the button, since a negative margin would make the strip scroll
   vertically too. */
.fw-docs-tabs {
  margin: 8px 0 24px;
}
.fw-docs-tablist {
  display: flex;
  gap: 20px;
  margin-bottom: 16px;
  overflow-x: auto;
  box-shadow: inset 0 -1px 0 var(--border);
}
.fw-docs-tablist button {
  flex: none;
  padding: 8px 0 6px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--ash);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.fw-docs-tablist button:hover {
  color: var(--ink);
}
.fw-docs-tablist button[aria-selected='true'] {
  color: var(--ink);
  border-bottom-color: var(--signal);
}
/* `p.` because `.fw-docs p` sets every paragraph's margin and size. */
.fw-docs p.fw-docs-file {
  margin: 0 0 6px;
  color: var(--ash);
  font-family: var(--mono);
  font-size: 12px;
}
/* The design system asks for 44px targets where there is no hover. */
@media (pointer: coarse), (max-width: 767px) {
  .fw-docs-tablist button {
    min-height: var(--touch);
  }
}
```

- [ ] **Step 8: Run the tests to see them pass**

```bash
cd apps/lab && pnpm vitest run --project chromium src/docs/DocsTabs.browser.test.tsx src/design/touch.browser.test.tsx src/docs/ElementPage.browser.test.tsx src/docs/DocsMarkdown.browser.test.tsx && pnpm vitest run --project node src/docs
```

Expected: PASS. `ElementPage` passes untouched: its page has no tabs and no named block yet.

- [ ] **Step 9: Mutation.** (a) In `DocsTabs` read `chosen` from a `useState` local to the component instead of the store; "choosing a tab in one group chooses it in every group" FAILS. Undo by hand. (b) Delete `overflow-x: auto` from `.fw-docs-tablist`; the narrow-width case FAILS. Undo by hand. (c) In `CodeView` name every block after `title` alone; the Copy case FAILS. Undo by hand. (d) Make `base` a constant string; the unique-id case FAILS. Undo by hand. (e) Drop `p` from `.fw-docs p.fw-docs-file`; the caption case FAILS on `16px`. Undo by hand. (f) Remove `event.preventDefault()` from `onKeyDown`; the arrow-key case FAILS. Undo by hand.

- [ ] **Step 10: Check, lint, format, commit**

```bash
cd apps/lab && npx prettier --write src/docs src/routes/DocsBlock.tsx src/design/docs.css src/design/touch.browser.test.tsx && cd ../.. && pnpm nx run lab:check --skip-nx-cache && pnpm nx run lab:lint --skip-nx-cache && pnpm nx run lab:fmt --skip-nx-cache && cd apps/lab && pnpm vitest run --project node
git add apps/lab/src/docs/DocsTabs.tsx apps/lab/src/docs/DocsTabs.browser.test.tsx apps/lab/src/docs/DocsMarkdown.tsx apps/lab/src/routes/DocsBlock.tsx apps/lab/src/docs/DocsTable.tsx apps/lab/src/docs/shape.ts apps/lab/src/design/docs.css apps/lab/src/design/touch.browser.test.tsx
git commit -m "lab: docs tabs draw one remembered choice, a block shows its file name, and the board file has its table"
```

The `--project node` run covers `design/*.test.ts`, which pin CSS values (`docs.css` changed).

---

### Task 6: Prove every example in a real project, outside the repository

**Executed in plan review round 1 at `5a44025` for every example (all PASSED as written) and for the React, Vue and Svelte controls (each showed the failure the prose describes); the Angular control was rewritten afterwards and verified in round 2 with a single-file program (see Step 2).** Re-run it during execution only if Task 7's code blocks change. Harness notes from that run: jsdom has no `ResizeObserver` (stub it, or the element's `connectedCallback` throws an unhandled error while the tests still pass); Svelte under Vitest needs `resolve.conditions: ['browser']`, or `mount()` throws `lifecycle_function_unavailable`.

This task changes no file in the repository. It builds the element, installs it into one throwaway project per framework under `/tmp/arrowz-docs-examples`, and proves each example of Task 7 as written there. Its deliverable is a report: for each example, PASS, or the exact change it needed. An example that needs a change is changed in this plan's Task 7 text by the controller before Task 7 starts.

**Files:** none in the repository. Scratch: `/tmp/arrowz-docs-examples/{packs,angular,react,vue,svelte}/`.

**Interfaces:**
- Consumes: the example sources in Task 7, Steps 2 and 3 (copy them exactly).
- Produces: a report listing every example and its verdict, with the command output that proves it.

- [ ] **Step 1: Pack the two packages.**

```bash
pnpm nx build engine --skip-nx-cache && pnpm nx build board-element --skip-nx-cache
mkdir -p /tmp/arrowz-docs-examples/packs
(cd packages/engine && pnpm pack --pack-destination /tmp/arrowz-docs-examples/packs)
(cd packages/board-element && pnpm pack --pack-destination /tmp/arrowz-docs-examples/packs)
ls /tmp/arrowz-docs-examples/packs
```

`pnpm pack` rewrites `workspace:*` to the version, which `npm pack` would not. Expected: two `.tgz` files. Install both tarballs in every project below.

- [ ] **Step 2: Angular 22 — compile under strict templates.** In `/tmp/arrowz-docs-examples/angular`: `npm init -y`, then `npm i @angular/core@22 @angular/common@22 @angular/compiler@22 @angular/compiler-cli@22 @angular/platform-browser@22 rxjs typescript@~6.0 ../packs/*.tgz`. Write `tsconfig.json` with `"strict": true`, `"module": "es2022"`, `"moduleResolution": "bundler"`, `"target": "es2022"`, `"lib": ["es2022", "dom"]`, `"angularCompilerOptions": { "strictTemplates": true }`, `"files"` naming the two component files. Put `board.component.ts` (Task 7 Step 2) and `stored-board.component.ts` with `load-board.ts` (Task 7 Step 3) beside it. Run `npx ngc -p tsconfig.json`.
Expected: exit 0. Control for the sentence on the Angular tab, in a program holding `board.component.ts` alone (`"files": ["board.component.ts"]`; with `stored-board.component.ts` present, its own import of the package brings the event types in and the control cannot fail): replace the `import type` line with a local `type PieceClickEvent = CustomEvent<{ pieceId: number }>` and `type BoardData = unknown`, keep the `import()`, and expect exit 0 (the dynamic import alone types `$event`); then also remove the `afterNextRender` line and expect `TS2345` (`Event` is not assignable to `PieceClickEvent`). Restore the file.

- [ ] **Step 3: React 19 — type-check, then run.** In `/tmp/arrowz-docs-examples/react`: `npm i react@19 react-dom@19 @types/react@19 @types/react-dom@19 typescript@~6.0 jsdom vitest ../packs/*.tgz`. Put `arrowz-board.d.ts` and `Board.tsx` (Task 7 Step 2), `load-board.ts` and `StoredBoard.tsx` (Task 7 Step 3) in `src/`. Type-check with `npx tsc --noEmit --strict --jsx react-jsx --module esnext --moduleResolution bundler --target es2022 --lib es2022,dom src/*.ts src/*.tsx`. Expected: exit 0.
Then a vitest test in jsdom (`// @vitest-environment jsdom`) that renders `<Board />` with `react-dom/client` inside `act`, waits until `document.querySelector('arrowz-board')` exists, and asserts: `customElements.get('arrowz-board')` is defined; `el.board` is an object with `W === 50`; `el.hasAttribute('board') === false`; `el.interactive === true`; dispatching `new CustomEvent('piece-click', { detail: { pieceId: 3 } })` on it reaches the handler (spy on `console.log`, expect `('piece', 3)`). For `StoredBoard`, stub `globalThis.fetch` to answer the JSON of `encodeBoard(generate({ ...defaultParams(), W: 12, H: 12, seed: 7 }).board)` and assert `el.board.W === 12`; stub it to answer `{ "format": "x" }` and assert a `role="alert"` paragraph whose text starts with `not a board file`.
Control: move the `if (!ready) return null` line away so the tag renders before the import; expect `el.hasAttribute('board') === true` and no `board` property — the rule on the page rests on this. Put the line back.

- [ ] **Step 4: Vue 3.5 — type-check, then run.** In `/tmp/arrowz-docs-examples/vue`: `npm i vue@3 @vitejs/plugin-vue vite vue-tsc typescript@~6.0 jsdom vitest @vue/test-utils ../packs/*.tgz`. Put `vite.config.ts`, `Board.vue`, `StoredBoard.vue`, `load-board.ts` (Task 7) in place; `npx vue-tsc --noEmit` with a `tsconfig.json` including them. Expected: exit 0. A vitest test (jsdom, the same `vite.config.ts` so `isCustomElement` applies) mounts `Board`, flushes promises until the tag exists, and asserts the same five facts as React; plus that Vue printed no "Failed to resolve component" warning. `StoredBoard` as in React.
Control: remove `v-if="ready"`; expect `board` to land as the attribute `[object Object]`. Put it back.
Also check `interactive` (written without a value) arrives as `el.interactive === true`.
Also confirm, from the Vue documentation (Context7: `resolve-library-id` "vue", then `query-docs` "shallowRef deep reactivity"), the sentence on the Vue tab: `shallowRef` makes only `.value` reactive, so Vue does not wrap the board's arrows in proxies. Quote the doc line in the report.

- [ ] **Step 5: Svelte 5 — check, then run.** In `/tmp/arrowz-docs-examples/svelte`: `npm i svelte@5 svelte-check @sveltejs/vite-plugin-svelte vite typescript@~6.0 jsdom vitest ../packs/*.tgz`. Put `Board.svelte`, `StoredBoard.svelte`, `load-board.ts` (Task 7) in place; `npx svelte-check`. Expected: 0 errors. A vitest test (jsdom, the Svelte plugin) mounts `Board` with `mount()` from `svelte`, awaits `tick()` and the import, and asserts the same five facts. `StoredBoard` as in React, the `url` prop passed.
Also confirm, from the Svelte documentation (Context7 "svelte", query "$state.raw"), that `$state.raw` state is not made deeply reactive. Quote the doc line.

- [ ] **Step 6: Plain HTML.** In `/tmp/arrowz-docs-examples/html`: `npm i vite ../packs/*.tgz`; put the two HTML examples of Task 7 as `index.html` and `stored.html`, and `public/boards/demo.board.json` holding `JSON.stringify(encodeBoard(generate({ ...defaultParams(), W: 12, H: 12, seed: 7 }).board))`. Start `npx vite --port 5199` in the background, open both pages with the Playwright Chromium from `apps/lab/node_modules` (a short Node script copied into `apps/lab` and deleted after, since only there does `playwright` resolve), and assert in the page: the element's `board` is set (`W` 50 and 12), and no `pageerror`. Then replace `demo.board.json` with `{"format":"x"}`; expect `#problem` visible with text starting `not a board file`. Stop the server.

- [ ] **Step 7: Report.** One line per example — `board.component.ts`, `stored-board.component.ts`, `arrowz-board.d.ts`, `Board.tsx`, `StoredBoard.tsx`, `vite.config.ts`, `Board.vue`, `StoredBoard.vue`, `Board.svelte`, `StoredBoard.svelte`, `load-board.ts`, both HTML pages — with PASS or the exact diff it needed, the controls' results, and the two quoted doc lines. Delete `/tmp/arrowz-docs-examples`. No commit.

---

### Task 7: The Element page in both languages, its tests, and the element's README

**Files:**
- Modify: `apps/lab/docs-content/en/element.md`
- Modify: `apps/lab/docs-content/pl/element.md`
- Modify: `apps/lab/src/docs/ElementPage.browser.test.tsx`
- Modify: `apps/lab/src/docs/content.test.ts`
- Modify: `packages/board-element/README.md`

**Interfaces:**
- Consumes: everything above; the examples as Task 6 proved them.

- [ ] **Step 1: Write the failing page tests.** In `apps/lab/src/docs/ElementPage.browser.test.tsx`:

Add `BOARD_FILE_FIELDS` to the `@arrowz/engine/docs` import and `import type { Code, Nodes } from 'mdast'`. Replace the `firstCode` and `EXAMPLE` lines with:

```ts
function codeBlocks(node: Nodes, out: Code[] = []): Code[] {
  if (node.type === 'code') out.push(node)
  if ('children' in node) for (const child of node.children) codeBlocks(child, out)
  return out
}
/** The HTML tab of Using it: the page's first `html` block. */
const EXAMPLE = codeBlocks(docsPage('en', 'element').root).find((block) => block.lang === 'html')?.value ?? ''
```

Insert `'files',` after `'example',` in `SECTIONS`; rename the test `'the page has its fifteen sections, in order'` to `'the page has its sixteen sections, in order'`. Add `BOARD_FILE_FIELDS.length +` as the first term of the sum in `DESCRIBED`. In `'Copy on the example writes the code, not its colouring'`, change the two names to `'Copy: Using it, HTML'` and `'Copied: Using it, HTML'`; in `'Copy names its section in Polish too'`, change the name to `'Kopiuj: Jak użyć, HTML'`. Append:

```ts
test('the board-file table lists the fields of a board file, under Board files', async () => {
  const screen = await mount()
  const table = screen.container.querySelector('table[aria-labelledby="docs-files"]')
  expect([...(table?.querySelectorAll('tbody tr') ?? [])].map((tr) => tr.querySelector('td')?.textContent)).toEqual(
    BOARD_FILE_FIELDS.map((row) => row.key),
  )
  expect(rowFor(screen.container, 'fingerprint')?.cells[1]?.textContent).toBe('string')
})

test('the page has two framework groups, and both follow one choice', async () => {
  const screen = await mount()
  expect(screen.container.querySelectorAll('[role="tablist"]')).toHaveLength(2)
  await screen.getByRole('tab', { name: 'Angular' }).first().click()
  await expect
    .poll(() => [...screen.container.querySelectorAll('[role="tab"][aria-selected="true"]')].map((t) => t.textContent))
    .toEqual(['Angular', 'Angular'])
  await expect.element(screen.getByRole('button', { name: 'Copy: board.component.ts' })).toBeVisible()
  await expect.element(screen.getByRole('button', { name: 'Copy: stored-board.component.ts' })).toBeVisible()
})
```

Last in the file, because a viewport set by `page.viewport` outlives its case (add `import { page } from 'vitest/browser'`):

```ts
// The effect, not the declared overflow: the document itself must not scroll sideways.
test('at 280 px the page does not scroll sideways', async () => {
  await page.viewport(280, 800)
  await mount()
  const root = document.scrollingElement
  if (root === null) throw new Error('no root')
  expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth)
})
```

In `apps/lab/src/docs/content.test.ts`, test `'every %s description is plain inline Markdown'`, add `docs.boardFile,` after `docs.env,`.

Run: `pnpm nx build engine --skip-nx-cache && cd apps/lab && pnpm vitest run --project chromium src/docs/ElementPage.browser.test.tsx`
Expected: FAIL — fifteen sections, no `docs-files` table, no tablist.

- [ ] **Step 2: Using it, English.** In `apps/lab/docs-content/en/element.md`, replace the section from `## Using it {#example}` up to (not including) `## Properties {#props}` with the following. Take every code block from Task 6's report where it changed one.

`````md
## Using it {#example}

Import the package once, which registers the tag. Then give the element a size and a board. The tabs show the same board in plain HTML and in four frameworks; the one you choose is chosen in every tab group of these pages.

::::tabs{group="framework"}
:::tab{id="html"}
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
:::
:::tab{id="angular"}
Any import of the package, the `import()` included, brings its event types into the program, so under `strictTemplates` the template's `$event` is a `PieceClickEvent`; the type import only names it for the method.

```ts board.component.ts
import { afterNextRender, Component, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core'
import type { BoardData, PieceClickEvent } from '@arrowz/board-element'
import { defaultParams, generate } from '@arrowz/engine'

@Component({
  selector: 'app-board',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<arrowz-board [board]="board()" interactive lang="pl" style="height: 80vh"
    (piece-click)="onPiece($event)"></arrowz-board>`,
})
export class BoardComponent {
  readonly board = signal<BoardData | null>(generate({ ...defaultParams(), W: 50, H: 50, seed: 7 }).board)

  constructor() {
    afterNextRender(() => void import('@arrowz/board-element'))
  }

  onPiece(e: PieceClickEvent) {
    console.log('piece', e.detail.pieceId)
  }
}
```
:::
:::tab{id="react"}
React 19 binds a custom element by itself, so `@lit/react` is optional. The declaration file types the tag in JSX.

```ts arrowz-board.d.ts
import type { ArrowzBoard, PieceClickEvent } from '@arrowz/board-element'
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'arrowz-board': DetailedHTMLProps<HTMLAttributes<ArrowzBoard>, ArrowzBoard> & {
        board?: ArrowzBoard['board']
        interactive?: boolean
        'onpiece-click'?: (e: PieceClickEvent) => void
      }
    }
  }
}
```

```tsx Board.tsx
import { defaultParams, generate } from '@arrowz/engine'
import { useEffect, useMemo, useState } from 'react'

export function Board() {
  const [ready, setReady] = useState(false)
  const board = useMemo(() => generate({ ...defaultParams(), W: 50, H: 50, seed: 7 }).board, [])
  useEffect(() => {
    void import('@arrowz/board-element').then(() => setReady(true))
  }, [])
  if (!ready) return null
  return (
    <arrowz-board board={board} interactive lang="pl" style={{ height: '80vh' }}
      onpiece-click={(e) => console.log('piece', e.detail.pieceId)} />
  )
}
```
:::
:::tab{id="vue"}
`shallowRef` keeps Vue from wrapping every arrow of the board in a reactive proxy.

```ts vite.config.ts
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === 'arrowz-board' } } })],
})
```

```vue Board.vue
<script setup lang="ts">
import type { PieceClickEvent } from '@arrowz/board-element'
import { defaultParams, generate } from '@arrowz/engine'
import { onMounted, ref, shallowRef } from 'vue'

const board = shallowRef(generate({ ...defaultParams(), W: 50, H: 50, seed: 7 }).board)
const ready = ref(false)
onMounted(async () => {
  await import('@arrowz/board-element')
  ready.value = true
})
const onPiece = (e: PieceClickEvent) => console.log('piece', e.detail.pieceId)
</script>

<template>
  <arrowz-board v-if="ready" :board="board" interactive lang="pl" style="height: 80vh" @piece-click="onPiece" />
</template>
```
:::
:::tab{id="svelte"}
```svelte Board.svelte
<script lang="ts">
  import type { PieceClickEvent } from '@arrowz/board-element'
  import { defaultParams, generate } from '@arrowz/engine'
  import { onMount } from 'svelte'

  const board = generate({ ...defaultParams(), W: 50, H: 50, seed: 7 }).board
  onMount(() => {
    void import('@arrowz/board-element')
  })
  const onPiece = (e: PieceClickEvent) => console.log('piece', e.detail.pieceId)
</script>

<arrowz-board {board} interactive lang="pl" style="height: 80vh" onpiece-click={onPiece}></arrowz-board>
```
:::
::::

Whatever the framework, three rules hold. Define the element before the framework first sets `board`: React and Vue hand an object to a property only when the element already has that property, and otherwise write it as an attribute, which the element ignores. That is why the examples render the tag only once the import has resolved. Do not pass `false` to `interactive` or `play` before the element is defined: Vue and Svelte then write the attribute `interactive="false"`, and a boolean attribute that is present reads as on. And import the package in the browser only, never during server rendering: the element draws with WebGL.

## Board files {#files}

A board travels and is kept as a board file, `.board.json`: the command line writes one, the lab's board store keeps them, and `encodeBoard` makes one from any board. It is a JSON object you can read — the size, the counts and the fingerprint — around a packed `body` that only `decodeBoard` reads.

::table{of="board-file"}

The file is not the board. `board` takes a `BoardData`, whose `owner` is an `Int32Array`, and JSON has no such type: `JSON.stringify` would turn it into an object with numbered keys. The file is the form a board travels and is kept in; `BoardData` is the form the element draws from. So a file fetched from a server or read from a database takes four steps to reach the element:

1. Have the file as an object. From a server that is `await response.json()`. A JSON or JSONB column usually arrives as an object already; a text column needs `JSON.parse`.
2. Pass it to `decodeBoard` from `@arrowz/engine`, in the browser, where the element is. It takes any value and checks all of it, the fingerprint last, so data from outside needs no schema of its own. `decodeBoardFile` also hands back the file, typed.
3. Catch `BoardFileError`: its `message` says what is wrong with the file.
4. Assign the result to `board`.

```ts load-board.ts
import { type BoardData, decodeBoard } from '@arrowz/engine'

export async function loadBoard(url: string): Promise<BoardData> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return decodeBoard(await response.json())
}
```

The same steps in each framework, with the reason shown when the file cannot be read:

::::tabs{group="framework"}
:::tab{id="html"}
```html
<arrowz-board id="board" style="width: 100%; height: 80vh"></arrowz-board>
<p id="problem" hidden></p>
<script type="module">
  import '@arrowz/board-element'
  import { BoardFileError, decodeBoard } from '@arrowz/engine'
  const el = document.getElementById('board')
  const problem = document.getElementById('problem')
  const response = await fetch('/boards/demo.board.json')
  try {
    el.board = decodeBoard(await response.json())
  } catch (e) {
    if (!(e instanceof BoardFileError)) throw e
    problem.textContent = e.message
    problem.hidden = false
  }
</script>
```
:::
:::tab{id="angular"}
```ts stored-board.component.ts
import { afterNextRender, Component, CUSTOM_ELEMENTS_SCHEMA, input, signal } from '@angular/core'
import type { BoardData } from '@arrowz/board-element'
import { loadBoard } from './load-board'

@Component({
  selector: 'app-stored-board',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    @if (problem(); as text) {
      <p role="alert">{{ text }}</p>
    } @else {
      <arrowz-board [board]="board()" style="height: 80vh"></arrowz-board>
    }
  `,
})
export class StoredBoardComponent {
  readonly url = input.required<string>()
  readonly board = signal<BoardData | null>(null)
  readonly problem = signal<string | null>(null)

  constructor() {
    afterNextRender(() => {
      void import('@arrowz/board-element')
      loadBoard(this.url()).then(
        (board) => this.board.set(board),
        (e: unknown) => this.problem.set(e instanceof Error ? e.message : String(e)),
      )
    })
  }
}
```
:::
:::tab{id="react"}
```tsx StoredBoard.tsx
import type { BoardData } from '@arrowz/engine'
import { useEffect, useState } from 'react'
import { loadBoard } from './load-board'

export function StoredBoard({ url }: { url: string }) {
  const [ready, setReady] = useState(false)
  const [board, setBoard] = useState<BoardData | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    void import('@arrowz/board-element').then(() => setReady(true))
  }, [])
  useEffect(() => {
    let live = true
    loadBoard(url).then(
      (loaded) => {
        if (live) setBoard(loaded)
      },
      (e: unknown) => {
        if (live) setProblem(e instanceof Error ? e.message : String(e))
      },
    )
    return () => {
      live = false
    }
  }, [url])
  if (problem !== null) return <p role="alert">{problem}</p>
  if (!ready) return null
  return <arrowz-board board={board} style={{ height: '80vh' }} />
}
```
:::
:::tab{id="vue"}
```vue StoredBoard.vue
<script setup lang="ts">
import type { BoardData } from '@arrowz/engine'
import { onMounted, ref, shallowRef } from 'vue'
import { loadBoard } from './load-board'

const props = defineProps<{ url: string }>()
const ready = ref(false)
const board = shallowRef<BoardData | null>(null)
const problem = ref<string | null>(null)
onMounted(async () => {
  await import('@arrowz/board-element')
  ready.value = true
  try {
    board.value = await loadBoard(props.url)
  } catch (e) {
    problem.value = e instanceof Error ? e.message : String(e)
  }
})
</script>

<template>
  <p v-if="problem" role="alert">{{ problem }}</p>
  <arrowz-board v-else-if="ready" :board="board" style="height: 80vh" />
</template>
```
:::
:::tab{id="svelte"}
`$state.raw` keeps Svelte from wrapping the board in a reactive proxy.

```svelte StoredBoard.svelte
<script lang="ts">
  import type { BoardData } from '@arrowz/engine'
  import { onMount } from 'svelte'
  import { loadBoard } from './load-board'

  let { url }: { url: string } = $props()
  let board = $state.raw<BoardData | null>(null)
  let problem = $state<string | null>(null)
  onMount(() => {
    void import('@arrowz/board-element')
    loadBoard(url).then(
      (loaded) => (board = loaded),
      (e: unknown) => (problem = e instanceof Error ? e.message : String(e)),
    )
  })
</script>

{#if problem}
  <p role="alert">{problem}</p>
{:else}
  <arrowz-board {board} style="height: 80vh"></arrowz-board>
{/if}
```
:::
::::

A server or a database keeps the file as it is and sends it as it is: decoding it there would only have to be undone to send the board on. The header can be read without decoding — `W`, `H` and `pieces` for a list, `fingerprint` to tell boards apart — and the command line names each file by `layoutHash`, a name that stays the same for the same arrows. To store a board you have, send `JSON.stringify(encodeBoard(board))`.

A game in progress is not part of the file: `saveState()` and `loadState()` keep it apart ([playing the board](docs:element#play)).

`````

(The outer five-backtick fence above belongs to this plan only; the page has none.)

- [ ] **Step 3: The same section, Polish.** In `apps/lab/docs-content/pl/element.md`, replace from `## Jak użyć {#example}` up to (not including) `## Właściwości {#props}`. Build it from the English section of Step 2: copy it whole, then swap only the prose lines for the Polish below, so every directive, code block and list stays byte-identical. Every code block, its language and its file name are **identical** to Step 2 (the shape guard compares them); only the prose changes:

- Lead: `Zaimportuj pakiet raz, a import zarejestruje znacznik. Potem nadaj komponentowi rozmiar i daj mu planszę. Zakładki pokazują tę samą planszę w czystym HTML i w czterech frameworkach; wybór obowiązuje we wszystkich grupach zakładek na tych stronach.`
- Angular tab: `Każdy import pakietu, także ten przez `import()`, wprowadza do programu jego typy zdarzeń, więc przy `strictTemplates` `$event` w szablonie ma typ `PieceClickEvent`; import typu służy tylko do nazwania go w sygnaturze metody.`
- React tab: `React 19 sam wiąże komponenty webowe, więc `@lit/react` nie jest potrzebne. Plik deklaracji nadaje znacznikowi typ w JSX.`
- Vue tab: `` `shallowRef` sprawia, że Vue nie opakowuje każdej strzałki planszy w reaktywne proxy. ``
- After the first `::::`: `Bez względu na framework obowiązują trzy reguły. Zdefiniuj komponent, zanim framework pierwszy raz ustawi `board`: React i Vue przekazują obiekt do właściwości tylko wtedy, gdy komponent już ją ma, a w przeciwnym razie zapisują go jako atrybut, który komponent pomija. Dlatego przykłady renderują znacznik dopiero po zakończeniu importu. Nie przekazuj `false` do `interactive` ani `play`, zanim komponent zostanie zdefiniowany: Vue i Svelte zapiszą wtedy atrybut `interactive="false"`, a obecny atrybut logiczny znaczy „włączone”. I importuj pakiet tylko w przeglądarce, nigdy przy renderowaniu na serwerze: komponent rysuje przez WebGL.`
- Heading: `## Pliki planszy {#files}`
- `Plansza podróżuje i leży w magazynie jako plik planszy, `.board.json`: zapisuje go wiersz poleceń, trzyma go magazyn plansz laboratorium, a `encodeBoard` robi go z każdej planszy. To obiekt JSON, który da się przeczytać — rozmiar, liczniki i odcisk — wokół spakowanego `body`, które czyta tylko `decodeBoard`.`
- `::table{of="board-file"}`
- `Plik to nie plansza. `board` przyjmuje `BoardData`, którego `owner` to `Int32Array`, a JSON nie ma takiego typu: `JSON.stringify` zrobiłby z niego obiekt z numerowanymi kluczami. Plik to postać, w której plansza podróżuje i leży w magazynie, a `BoardData` to postać, z której rysuje komponent. Plik pobrany z serwera albo odczytany z bazy danych potrzebuje więc czterech kroków, żeby trafić do komponentu:`
- The list, four items:
  1. `Zacznij od pliku jako obiektu. Z serwera to `await response.json()`. Kolumna JSON albo JSONB zwykle przychodzi już jako obiekt, a kolumna tekstowa wymaga `JSON.parse`.`
  2. `Przekaż go do `decodeBoard` z `@arrowz/engine`, w przeglądarce, tam gdzie jest komponent. Funkcja przyjmuje dowolną wartość i sprawdza ją całą, odcisk na końcu, więc dane z zewnątrz nie potrzebują własnego schematu. `decodeBoardFile` oddaje też sam plik, z typem.`
  3. `Złap `BoardFileError`: jego `message` mówi, co jest nie tak z plikiem.`
  4. `Przypisz wynik do `board`.`
- The `load-board.ts` block.
- `Te same kroki w każdym frameworku, z powodem pokazanym, gdy pliku nie da się odczytać:`
- The second tab group; its Svelte tab's sentence: `` `$state.raw` sprawia, że Svelte nie opakowuje planszy w reaktywne proxy. ``
- `Serwer albo baza danych trzyma plik takim, jaki jest, i takim go wysyła: dekodowanie po ich stronie trzeba by cofnąć, żeby przesłać planszę dalej. Nagłówek da się czytać bez dekodowania — `W`, `H` i `pieces` do listy, `fingerprint`, żeby odróżnić plansze — a wiersz poleceń nadaje każdemu plikowi nazwę z `layoutHash`, która dla tych samych strzałek jest zawsze ta sama. Żeby zapisać planszę, którą masz, wyślij `JSON.stringify(encodeBoard(board))`.`
- `Gra w toku nie jest częścią pliku: trzymają ją osobno `saveState()` i `loadState()` ([rozgrywka](docs:element#play)).`

- [ ] **Step 4: The element's README.** In `packages/board-element/README.md`, replace the two lines after the Usage example (`Angular: add …` and `React: wrap …`) with:

```md
`board` has no attribute, so a framework must set it as a property:

- **Angular**: `schemas: [CUSTOM_ELEMENTS_SCHEMA]`, `[board]="board"`, `(piece-click)="…"`; a type
  import from this package types `$event.detail`.
- **React 19**: `<arrowz-board board={board} onpiece-click={…}>`, rendered only once the package
  is imported; `@lit/react` is optional.
- **Vue 3**: `isCustomElement` for the tag, `:board="board"` from a `shallowRef`, `@piece-click`;
  render the tag once the package is imported.
- **Svelte 5**: `{board}`, `onpiece-click={…}`.

Import the package in the browser only: the element draws with WebGL. The lab's Docs tab, page
Element, has a full example for each.

### Board files

A board stored or sent over the network is a `.board.json` (`BoardFile`), not a `BoardData`:
decode it with `decodeBoard` from `@arrowz/engine` where the element is, catch `BoardFileError`,
and assign the result to `board`.
```

- [ ] **Step 5: Run the page's guards**

```bash
cd apps/lab && pnpm vitest run --project node src/docs && pnpm vitest run --project chromium src/docs && cd ../.. && deno test --allow-read --allow-write --allow-env --allow-run --allow-net packages/engine/glossary.test.ts && pnpm nx run board-element:test --skip-nx-cache
```

Expected: PASS — the shape of both languages agrees, every block reads back, the glossary finds no retired word, the element's README guard is untouched by prose.

- [ ] **Step 6: Mutation.** In the Polish page, delete the `:::tab{id="vue"}` … `:::` of the second group; `content.test.ts` FAILS (shape and `needs the tabs`). Undo by hand. In the English page change the file name `Board.tsx` to `board.tsx`; the shape test FAILS. Undo by hand.

- [ ] **Step 7: Commit**

```bash
cd apps/lab && npx prettier --write src/docs/ElementPage.browser.test.tsx src/docs/content.test.ts && cd ../..
git add apps/lab/docs-content/en/element.md apps/lab/docs-content/pl/element.md apps/lab/src/docs/ElementPage.browser.test.tsx apps/lab/src/docs/content.test.ts packages/board-element/README.md
git commit -m "lab: the Element page shows the element in five frameworks and explains board files, in both languages"
```

---

### Task 8: Gates, Jev and the page in a real browser (controller)

- [ ] **Step 1: Every gate, uncached**

```bash
deno task verify
pnpm nx run-many -t verify --skip-nx-cache
```

Expected: PASS in full. Read the Nx log for failures rather than the exit of a piped `head` (exit 141 is SIGPIPE).

- [ ] **Step 2: Jev, as advice.** `deno task jev:docs element`. Read any flag against the code and the README; fix a sentence only when the flag is right. Record the result in the PR description.

- [ ] **Step 3: Live.** `deno task store` and `pnpm nx serve lab` (port 8779), Chrome via DevTools MCP (`emulate` for sizes). `/docs/element` at 375 px and 1440 px, English and Polish:
  - tabs by mouse and by keyboard (Tab into the strip, arrows, Home, End);
  - choosing Vue in Using it shows Vue in Board files; a reload keeps Vue;
  - Copy on `Board.tsx` and on the HTML tab;
  - at 375 px the strip scrolls sideways and the page does not;
  - the board-file table and both groups render with colours.
  Stop both servers afterwards.

- [ ] **Step 4: Follow-up bead.** `bd create "Claude Design: bring the docs framework tabs into the lab's design project" -t chore -l lab -l design --silent`, estimate 2 SP, size S, risk low, with `docs=` pointing at `apps/lab/src/docs/DocsTabs.tsx,apps/lab/src/design/docs.css`.
