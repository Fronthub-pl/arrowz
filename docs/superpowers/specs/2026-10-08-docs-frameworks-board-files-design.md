# Framework tabs and board files on the Element page — design

Bead: `arrowz-k1p2`.

The Element page of the lab's Docs shows one example, plain HTML with a module
script, and two sentences on Angular and React. A reader using Angular, React,
Vue or Svelte has to work out the binding alone, and two of the four bind in a
way that silently loses the board (section 2.2). Nothing on the page says what
a `.board.json` is or how a file fetched from a server or read from a database
becomes the element's `board`: the element takes a `BoardData`, whose `owner`
is an `Int32Array` that JSON cannot carry, so the file has to be decoded first.

This design adds both, in English and Polish:

- the example becomes a tab group, one tab per framework, remembered across
  visits and shared by every framework tab group on the page;
- a new section, Board files, describes the file and the steps from a fetched
  file to a drawn board, with the same framework tabs.

## 1. What the reader gets

### 1.1 Using it `{#example}`

The lead sentence stays. The example becomes `::::tabs{group="framework"}`
with five tabs, in this order: HTML, Angular, React, Vue, Svelte. Each holds a
minimal example that works as written, with a file name over each block when a
tab holds more than one file:

| Tab | Blocks | What it shows |
|---|---|---|
| HTML | the current example (`html`) | unchanged |
| Angular | `board.component.ts` (`ts`) | standalone component, `schemas: [CUSTOM_ELEMENTS_SCHEMA]`, `[board]`, `(piece-click)` with `$event.detail.pieceId`, the package imported in `afterNextRender` |
| React | `arrowz-board.d.ts` (`ts`), `Board.tsx` (`tsx`) | `JSX.IntrinsicElements` augmented in `declare module 'react'`; the component renders `<arrowz-board>` only once `import('@arrowz/board-element')` has resolved; `onpiece-click` |
| Vue | `vite.config.ts` (`ts`), `Board.vue` (`vue`) | `isCustomElement` in the Vue plugin's compiler options; `v-if="ready"`, `:board`, `@piece-click` |
| Svelte | `Board.svelte` (`svelte`) | `onMount` with `import()`, `{board}`, `onpiece-click` |

Each tab adds at most two sentences of prose: Angular, that a type import from
the package (`import type { ArrowzBoard } from '@arrowz/board-element'`) is
what types `$event.detail` under `strictTemplates`; React, that `@lit/react`
is optional, since React 19 binds custom elements itself.

Under the tabs, one paragraph states the rule every framework shares (2.2):
define the element before the framework first sets `board`; never pass
`interactive={false}` to an element not yet defined; import the package only
in the browser, since the element draws with WebGL.

The current sentence "In Angular, add `CUSTOM_ELEMENTS_SCHEMA`… In React, wrap
the element with `createComponent` from `@lit/react`." goes: the tabs replace
it.

### 1.2 Board files `{#files}`

A new section right after Using it. The page has sixteen sections.

1. **What a board file is.** A `.board.json`, written by the command line, by
   the lab's board store and by `encodeBoard`: a JSON object a person can read
   — the counts and the fingerprint — around a packed `body` that only
   `decodeBoard` reads. Then `::table{of="board-file"}`: the fields of
   `BoardFile`, their types from code (1.3), their descriptions from the
   dictionary.
2. **Why the file is not the board.** `board` takes a `BoardData`, whose
   `owner` is an `Int32Array`; JSON has no such type (`JSON.stringify` turns
   it into an object of numbered keys). The file is the form a board travels
   and is stored in, `BoardData` the form it is drawn from.
3. **After the download**, as a numbered list:
   1. Have the file as an object: `await response.json()` from a server; a
      JSON or JSONB column usually arrives as an object already; a text column
      needs `JSON.parse`.
   2. Call `decodeBoard(file)` from `@arrowz/engine`, where the element is. It
      takes `unknown` and checks everything, the fingerprint last, so data from
      outside needs no schema of its own. `decodeBoardFile` returns the header
      as well, typed.
   3. Catch `BoardFileError`: its `message` says what is wrong with the file.
   4. Assign the result to `board`.
4. **The same steps per framework:** `::::tabs{group="framework"}`, five tabs,
   each fetching a file, decoding it and handing it to the element, with an
   error shown on `BoardFileError`. The tab chosen in Using it is already
   chosen here.
5. **Keeping files.** A server or a database keeps the file as it is and sends
   it as it is; decoding there would only have to be undone to send the board
   on. The header is readable without decoding: `W`, `H` and `pieces` for a
   list, `fingerprint` to tell boards apart. The command line names a file by
   `layoutHash`. To store a board you have, `encodeBoard(board)` and
   `JSON.stringify`.
6. **A game is not a file.** One sentence: a game in progress is
   `saveState()`/`loadState()`, kept separately (link to `docs:element#play`).

### 1.3 The fields table

`::table{of="board-file"}` has three columns, Field, Type, Description, one row
per field of `BoardFile` in its declared order: `format`, `v`, `W`, `H`,
`pieces`, `voids`, `unfilled`, `fingerprint`, `body`. The keys and types are
`BOARD_FILE_FIELDS` in `packages/engine/lab-docs.ts`; the descriptions are a
new `boardFile` record in the `Docs` dictionary, English and Polish.

### 1.4 The README

`packages/board-element/README.md`, under Usage: the two sentences on Angular
and React become a list, one line per framework (how it binds `board`, how it
listens to `piece-click`, when to import). A short paragraph, Board files:
`decodeBoard` from `@arrowz/engine`, `BoardFileError`, decode where the element
is. The README is prose here; its API tables and their guard do not change.

## 2. Facts the examples rest on

Checked on 2026-10-08 against the documentation and the source of each
framework, and for React, Vue and Svelte by running the binding in jsdom. The
implementation compiles or runs every example again (5.4).

### 2.1 Versions

React 19.3, Vue 3.5, Svelte 5.57, Angular 22.2, Lit 3.3.

### 2.2 How each binds

| Framework | `board` | `piece-click` | On an element not yet defined |
|---|---|---|---|
| Angular | `[board]` always sets the property (compiles to `ɵɵdomProperty`) | `(piece-click)`; `$event.detail` is typed only once the package's `HTMLElementEventMap` augmentation is loaded | property kept; Lit picks it up at definition |
| React 19 | property when `'board' in el`, otherwise an attribute | `onpiece-click`: the name after `on`, case and dashes kept; `onPieceClick` listens to `PieceClick` | **`board="[object Object]"` as an attribute, which the element ignores: the board is lost** |
| Vue 3 | property when `'board' in el` (`shouldSetAsProp`); `.prop` forces it | `@piece-click` | **as React**, unless `:board.prop` |
| Svelte 5 | property when the element has a setter for it | `onpiece-click`, case-sensitive | an object is assigned as a property; other values become attributes |

Booleans: in Vue and Svelte, `false` on an element not yet defined is written
as `interactive="false"`, which Lit's Boolean converter reads as `true`. React
removes the attribute for `false`; Angular sets the property.

So every example defines the element before it renders it — React and Vue
render it only after the import resolves — and imports the package in the
browser only: Angular `afterNextRender`, React `useEffect`, Vue `onMounted`,
Svelte `onMount`.

Sources: react.dev React 19 release notes and "Custom HTML elements"
(`react-dom/components`); vuejs.org "Vue and Web Components"; svelte.dev
"Basic markup" (event attributes) and `set_custom_element_data` in the Svelte
source; angular.dev `afterNextRender` and component `schemas`.

Left unverified, so the page does not claim it: that `@lit/react` is deprecated
(the page says only that React 19 does not need it); Nuxt's configuration key
for `isCustomElement` (the page shows Vite only); whether an Angular template
listener returning `false` cancels the event (the examples call
`preventDefault()` explicitly).

## 3. Tabs

### 3.1 Markdown

```md
::::tabs{group="framework"}
:::tab{id="react"}
One or two sentences.

```ts arrowz-board.d.ts
…
```

```tsx Board.tsx
…
```
:::
::::
```

- `tabs` takes one attribute, `group`, a key of `TAB_GROUPS`.
- A `tabs` holds only `tab` containers: every tab of its group, once each, in
  the group's order. A page may not leave a framework out.
- A `tab` takes one attribute, `id`, one of its group's tabs; it stands only
  directly inside a `tabs`. A `tabs` does not nest.
- A panel holds paragraphs, lists and fenced code, no headings: a heading in a
  panel would be a section the navigation lists and the reader cannot see.
- A code block's meta, the word after its language, is its file name, at most
  one word. Inside one panel the file names differ, and at most one block has
  none.

`TAB_GROUPS` lives in a new `apps/lab/src/docs/tabs.ts`, pure, so the content
guard reads it in Node: `{ framework: [{ id: 'html', label: 'HTML' }, { id:
'angular', label: 'Angular' }, { id: 'react', label: 'React' }, { id: 'vue',
label: 'Vue' }, { id: 'svelte', label: 'Svelte' }] }`. The labels are names and
are not translated. One group, because one is what the page needs.

`shape.ts` adds the two containers to `CONTAINERS`, the four languages to
`CODE_LANGS` (3.4), and the rules above to `problemsOf`. `content.test.ts`
already requires both languages to share a page's shape; the shape includes
each `tabs` with its group and each `tab` with its id, so a tab the Polish page
lacks fails there.

### 3.2 The component

`DocsTabs.tsx` follows the WAI-ARIA tabs pattern the way `shell/TabRow.tsx`
does:

- a `div role="tablist"` named by the dictionary (`docsTabsFramework`: EN
  "Framework", PL "Framework");
- one `button role="tab"` per tab, `aria-selected`, roving `tabIndex` (0 on the
  selected tab, -1 on the rest), `aria-controls` on the selected tab only;
- ← and → move the selection and the focus and wrap, Home and End jump:
  `nextIndex` with `{ axis: 'horizontal', wrap: true }` and
  `useFocusFollowsSelection` from `shell/roving.ts`;
- only the selected panel is in the document, `role="tabpanel"`,
  `aria-labelledby` its tab. The panel's blocks render through the same
  `Block` as the page's, so a code block keeps its colours and its Copy.

Ids are unique per group instance: the tabs carry the index of the `tabs` on
the page.

### 3.3 State

`ui.docsTabs: Readonly<Record<TabGroup, string>>` in `ui.slice.ts`, with
`setDocsTab(group, id)`. Every group on the page reads it, so choosing Angular
in one group chooses it in all. It is written to `localStorage` under
`labDocsTabs` as JSON, through `state/storage.ts`, and read back at start; a
missing, unreadable or unknown value gives the group's first tab.

### 3.4 Copy and the file name

A code block with a file name shows it as a caption over the block
(`.fw-docs-file`), and its Copy is named after the file: `Copy: Board.tsx`. A
block without one inside a panel is named after its section and its tab:
`Copy: Using it, React`. Outside tabs nothing changes.

### 3.5 Colour

`codeTokens.ts` gains four languages, built from the scanners it has:

- `ts`: the JavaScript scanner with TypeScript's words added to its keywords
  (`type`, `interface`, `declare`, `namespace`, `module`, `as`, `satisfies`,
  `readonly`, `if`, `void`, `true`, `false`, `null`, `undefined`);
- `tsx`: `ts`, plus JSX elements read by the HTML tag scanner, with `{…}` in an
  attribute or in children scanned as `ts`, braces counted;
- `vue`: the HTML scanner; `<script>` content as `ts`; the value of an
  attribute starting with `:`, `@` or `v-` as `ts`;
- `svelte`: the HTML scanner; `<script>` content as `ts`; `{…}` as `ts`.

The invariant stays: joining the tokens gives back the input exactly. Its test
runs over every code block of every page in both languages, not over chosen
samples.

### 3.6 Narrow screens

The tab strip scrolls sideways inside its own box rather than widening the
panel: at 280 px the page does not scroll sideways (the lesson of the Element
page's tables).

## 4. The fields table from code

`BOARD_FILE_FIELDS` in `packages/engine/lab-docs.ts`: `{ key, type }` per
field, typed `keyof BoardFile`. `lab-docs.test.ts` reads `BoardFile` through
`deno doc --json` and requires the same fields, in the same order, with the
same type text, both ways. `DocsTable` renders `board-file` as the other code
tables do (`Mono` for the key and the type, `InlineMarkdown` for the
description).

## 5. Guards and tests

### 5.1 Unit

- `shape.test.ts`: a `tabs` with an unknown group, a `tab` with an unknown id,
  a tab missing, repeated or out of order, a heading in a panel, a `tab`
  outside a `tabs`, nested `tabs`, two blocks without a file name in a panel,
  a file name repeated in a panel.
- `codeTokens.test.ts`: each language's colours on a short input; the
  round-trip over every block of every page.
- `lab-docs.test.ts`: the fields guard; a field added to `BoardFile` and not to
  the rows fails it.
- `ui.slice.test.ts`: `setDocsTab` writes, the start reads, an unknown value
  falls back.

### 5.2 Browser

`DocsTabs.browser.test.tsx`: the roles and names; the arrows, Home and End;
a click in one group selects the same tab in another; the choice survives a
remount; Copy writes the selected panel's code and is named after its file;
at 280 px the panel does not scroll sideways. `ElementPage.browser.test.tsx`:
sixteen sections; the board-file table reaches the page in both languages.

### 5.3 Gates

`deno task verify` in the engine and the CLI, `pnpm nx run-many -t verify`,
`comments.test.ts`, `glossary.test.ts` (the Polish prose), and
`deno task jev:docs element` as advice.

### 5.4 The examples themselves

Outside the repository, in `/tmp`, the implementation compiles the Angular
example with `ngc --strictTemplates`, type-checks the React example with `tsc`,
and runs the React, Vue and Svelte examples against the built element, checking
that `board` arrives as a property and that `piece-click` reaches the handler.
The Board files tabs are checked the same way with a real `.board.json`. An
example that fails is fixed before the page ships.

### 5.5 Live

The page at 375 px and at 1440 px, in English and in Polish: the tabs by mouse
and by keyboard, the choice carried between the two groups and over a reload,
Copy on a panel.

## 6. Delivery

One pull request from `lab/docs-frameworks`. Afterwards, a follow-up bead to
bring the tabs into the Claude Design project of the lab.

## 7. Not in this design

- A tab chosen through the address, or a link to one tab.
- Tab groups other than `framework`.
- Panels with headings, boards or tables.
- Nuxt, Next.js and SvelteKit beyond the one rule that the element is imported
  in the browser.
- A page of its own for the engine's board-file API: the engine's README keeps
  the reference, the Element page the use.
