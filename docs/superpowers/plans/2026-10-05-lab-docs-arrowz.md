# Lab docs: the Arrowz page (PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Docs tab opens on a new first page, Arrowz, written from the root `README.md` in English and Polish, whose rule is played on three small hand-built boards (`::play`); `/docs` goes to `/docs/arrowz`.

**Architecture:** The page is Markdown in `apps/lab/docs-content/{en,pl}/arrowz.md`, drawn by PR 1's renderer. A new leaf directive `::play{board=…}` renders `RulePlay`: an `<arrowz-board>` in `play` mode (through the lab's one `@lit/react` wrapper, `BoardCanvas`) over a board from `ruleBoards.ts`, with one line that answers `piece-removed` and `life-lost`, and Start over. The page list becomes the single source the navigation column, the palette, the tab and the redirects derive from.

**Tech Stack:** React 19, react-router 8, Lit 3 element `@arrowz/board-element` via `@lit/react`, Vitest 5 (`node` + `chromium` projects), mdast (PR 1's parser), Deno 2.9 for the engine and CLI guards.

**Spec:** `docs/superpowers/specs/2026-10-05-lab-docs-from-readmes-design.md` (PR 2 of §6; §1.1, §1.2, §3.3, §4.5, §5.1–§5.4). Bead `arrowz-kkey.2`; its notes carry six pre-flight items from PR 1's final review, all handled here (Task 1: items 1, 2, 3, 6; Task 2: item 5; Task 4: item 4).

## Global Constraints

- Everything in the repository is in English; the Polish lives only in `docs-content/pl/` and in the `PL` dictionary of `packages/engine/lab-i18n.ts`.
- Every visible string of the lab is in the dictionary (`lab-i18n.ts`), English in `EN.ui`, Polish in `PL.ui` — the rule boards' names, line and button included.
- No `any`, no non-null assertions; no `Math.min(...arr)` over cells or pieces.
- Comments: say why, once; non-header blocks ≤ 6 lines, module/API headers ≤ 24 lines; cite symbols, never `file.ts:NN`; no PR, task or history references (`packages/engine/comments.test.ts`).
- The glossary (`packages/engine/glossary.test.ts`): arrow, arrowhead, path to the edge, complete, stuck; never piece, corridor, closed, carve, paper, ink in prose (code spans are blanked); on every page but `cli`, never "knob"; PL strzałka, grot, droga do krawędzi, pełna, utknąć, ziarno, never element/elementy, pokrętło, papier.
- Markdown rules (PR 1): `#` is the page title, first; every `##` carries `{#id}`, the same in both languages; a literal `<` is `\<`; a colon followed by a letter or digit is `\:`; links are `docs:<page>#<id>` or `https://`; a note (`>`) holds paragraphs only.
- `apps/lab` reads the engine from `packages/engine/dist/`: after editing `packages/engine/*.ts`, run `pnpm nx build engine` before any lab test.
- On a fresh worktree run `pnpm install && pnpm nx build engine && pnpm nx build board-element` once.
- Prettier (`printWidth: 120`, no semicolons, single quotes) checks everything in `apps/lab`, the `.md` files and the README included: `pnpm exec prettier --write <files>` from `apps/lab` before each commit. `deno fmt <files>` for files under `packages/` and `docs/`.
- Gates named per task are the minimum; `pnpm run check` and `pnpm run lint` (from `apps/lab`) run before every lab commit, `deno task check` and `deno task lint` before every engine/CLI commit.
- Mutations: commit first, mutate, run, undo by hand — never `git checkout` a file with uncommitted work.
- No attribution lines in commit messages or the PR description; the PR body cites `Bead: arrowz-kkey.2`.
- Jev (`deno task jev:docs`) advises and never gates; its flags are triaged by a person (Task 5).

## Review Focus

The five inputs most likely to bite a reader of this page that the spec implies and no happy-path test would meet; each has its test in the task named.

1. **A language switch in the middle of a game.** `RulePlay` re-renders; if it handed the element a fresh board or view object, the element would start the game over (assigning `board` always does) and the reader's progress would vanish. The board and view are module constants — `RulePlay.browser.test.tsx` "a language switch keeps the game and translates the line" (Task 3).
2. **A player who switched the lab's board to plain clicks (☝).** The choice is stored in `localStorage` (`GESTURE_STORAGE_KEY`) and the spec says the page must not override it; a docs board that forced `drag` would turn the reader's plain click into nothing. Test "the page keeps the player's stored gesture" (Task 3). The prose defers to the board's own hint for the same reason (Task 4).
3. **Playing one board must not touch the others.** Three boards on one page, each with its own line and Start over — `ArrowzPage.browser.test.tsx` "playing one board leaves the others as they were" (Task 4).
4. **A phone.** At 375×812 the three boards and their lines must not scroll the document sideways — the arrowz page joins the eight-width loop of `DocsLayout.browser.test.tsx` (Task 4).
5. **The element registered twice.** The Docs chunk now imports `BoardCanvas`; if the bundler copied the element class into that chunk, `customElements.define('arrowz-board', …)` would run twice and throw when the Docs tab loads. Task 5 Step 2 greps the build for exactly one chunk defining it.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/lab/src/docs/DocsMarkdown.tsx` | Lists loose per list (Task 1); the `::play` directive (Task 3). |
| `apps/lab/src/docs/shape.ts` | `shapeOf` tells a numbered list from a bulleted one (Task 1); `DIRECTIVES.play` (Task 3). |
| `apps/lab/src/design/docs.css` | Prose `h4`, lists and links (Task 1); the rule board (Task 3). |
| `apps/lab/src/docs/content.test.ts` | Descriptions must parse to one paragraph (Task 1); the link check cannot pass empty (Task 4). |
| `apps/lab/src/docs/pages.ts` | The page list, each page's dictionary name, and the docs home (Task 2). |
| `apps/lab/src/routes/DocsNav.tsx`, `palette/commands.ts`, `shell/TabRow.tsx`, `AppRoutes.tsx`, `routes/DocsRoute.tsx` | Derive from `pages.ts` instead of listing pages (Task 2). |
| `packages/cli/scripts/jev-docs.ts` (+ test) | `DOCS_SOURCES` gains `arrowz`; a test ties it to the Markdown on disk (Tasks 2, 4). |
| `apps/lab/src/docs/ruleBoards.ts` (+ node test) | The three hand-built boards (Task 3). |
| `apps/lab/src/docs/RulePlay.tsx` (+ browser test) | One playable rule board with its line and Start over (Task 3). |
| `packages/engine/lab-i18n.ts` | The rule boards' strings (Task 3) and the page name `docsArrowz` (Task 4). |
| `apps/lab/docs-content/{en,pl}/arrowz.md` | The page (Task 4). |
| `apps/lab/src/docs/content.ts` | Imports and parses the new page (Task 4). |
| `apps/lab/README.md`, `apps/lab/docs/screenshots.json`, `apps/lab/docs/screenshots/docs.png`, `docs/jev-guards.md` | The screens and palette tables, the docs screenshot, the Jev page list (Tasks 4, 5). |

---

### Task 1: Prose the next pages need

The Arrowz page is the first with lists and a link; PR 1's review left four gaps in exactly that prose.

**Files:**
- Modify: `apps/lab/src/docs/DocsMarkdown.tsx` (`ListView`)
- Modify: `apps/lab/src/docs/shape.ts` (`shapeOf`)
- Modify: `apps/lab/src/design/docs.css`
- Test: `apps/lab/src/docs/DocsMarkdown.browser.test.tsx`, `apps/lab/src/docs/shape.test.ts`, `apps/lab/src/docs/content.test.ts`

**Interfaces:**
- Consumes: PR 1's `parseDocs`, `inlineOf` (`markdown.ts`), `shapeOf` (`shape.ts`).
- Produces: `shapeOf` emits `list ordered N` / `list bullet N` instead of `list N`.

- [ ] **Step 0: Bead metadata**

```bash
bd update arrowz-kkey.2 --set-metadata plan=lab/docs-arrowz:docs/superpowers/plans/2026-10-05-lab-docs-arrowz.md \
  --set-metadata spec=docs/superpowers/specs/2026-10-05-lab-docs-from-readmes-design.md
```

- [ ] **Step 1: Write the failing tests**

In `apps/lab/src/docs/DocsMarkdown.browser.test.tsx`, extend the case `'a list item with paragraphs apart keeps each as a paragraph'` and add one case after it:

```tsx
test('a list item with paragraphs apart keeps each as a paragraph', async () => {
  const screen = await show('# T\n\n- one\n\n  two\n- three')
  const first = screen.container.querySelector<HTMLElement>('ul > li')
  expect([...(first?.querySelectorAll(':scope > p') ?? [])].map((p) => p.textContent)).toEqual(['one', 'two'])
  // textContent joins block children with nothing; innerText is what a reader sees.
  expect(first?.innerText).not.toBe('onetwo')
  // CommonMark makes the whole list loose, so the item with one paragraph is a paragraph too.
  expect(screen.container.querySelectorAll('ul > li')[1]?.querySelector(':scope > p')?.textContent).toBe('three')
})

test('a list with items apart has every item a paragraph, a tight list none', async () => {
  const screen = await show('# T\n\n- a\n\n- b\n\nBetween.\n\n- c\n- d')
  const lists = [...screen.container.querySelectorAll('ul')]
  expect(lists.map((ul) => ul.querySelectorAll(':scope > li > p').length)).toEqual([2, 0])
})
```

In `apps/lab/src/docs/shape.test.ts`, add a row to the `test.each` of `describe('shapeOf')` (after `'another table size'`):

```ts
    ['another kind of list', '- a\n- b', '1. a\n2. b'],
```

In `apps/lab/src/docs/content.test.ts`, replace the last test (`'every %s description is plain inline Markdown'`) with:

```ts
// Descriptions are drawn through the parser: one that parses into anything but
// a single paragraph of plain inline text would lose words on the page, and
// `inlineOf` shows a non-paragraph as its raw text, so the node types alone
// would not catch it.
test.each(LANGS)('every %s description is plain inline Markdown', (lang) => {
  const docs = docsFor(lang)
  const texts = [docs.props, docs.members, docs.events, docs.slots].flatMap((rows) => Object.values(rows))
  expect(texts.length).toBeGreaterThan(30)
  for (const text of texts) {
    expect(
      parseDocs(text).children.map((node) => node.type),
      text,
    ).toEqual(['paragraph'])
    for (const node of inlineOf(text)) expect(['text', 'inlineCode', 'emphasis', 'strong'], text).toContain(node.type)
  }
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
cd apps/lab
pnpm exec vitest run --project chromium src/docs/DocsMarkdown.browser.test.tsx
pnpm exec vitest run --project node src/docs/shape.test.ts src/docs/content.test.ts
```

Expected: the two list cases FAIL (`three` has no `<p>`; `[0, 0]` instead of `[2, 0]`); `tells another kind of list apart` FAILS (both shapes are `list 2`); the description case PASSES (no description is a block today — it pins the rule for later edits).

- [ ] **Step 3: Implement**

In `apps/lab/src/docs/DocsMarkdown.tsx`, replace `ListView` with:

```tsx
/**
 * A loose list draws every item's text as a paragraph, a tight one as bare
 * text. CommonMark decides per list: blank lines between any two items, or
 * inside any one, make the whole list loose.
 */
function ListView({ node }: { node: List }): ReactElement {
  const loose = node.spread === true || node.children.some((item) => item.spread === true)
  const items = node.children.map((item, i) => (
    <li key={i}>
      {item.children.map((child, j) =>
        child.type === 'paragraph' ? (
          loose ? (
            <p key={j}>
              <Inline nodes={child.children} />
            </p>
          ) : (
            <Inline key={j} nodes={child.children} />
          )
        ) : child.type === 'list' ? (
          <ListView key={j} node={child} />
        ) : null,
      )}
    </li>
  ))
  return node.ordered === true ? <ol>{items}</ol> : <ul>{items}</ul>
}
```

In `apps/lab/src/docs/shape.ts` (`shapeOf`), replace the list line with:

```ts
    if (node.type === 'list') out.push(`list ${node.ordered === true ? 'ordered' : 'bullet'} ${node.children.length}`)
```

In `apps/lab/src/design/docs.css`, insert after the `.fw-docs :is(p, li, td, th) code` rule:

```css
/* Prose beyond paragraphs, in the page body only: the navigation column is
   lists and links too, styled below. A link keeps the text's colour and
   carries --signal in its underline: --signal as text is 4.1:1 on --void. */
.fw-docs-body h4 {
  margin: 16px 0 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--ink);
}
.fw-docs-body :is(ul, ol) {
  max-width: 74ch;
  margin: 0 0 8px;
  padding-left: 20px;
  font-size: 12px;
  line-height: 1.6;
}
.fw-docs-body li + li {
  margin-top: 4px;
}
.fw-docs-body li > p {
  margin-bottom: 4px;
}
.fw-docs-body a {
  color: inherit;
  text-decoration: underline;
  text-decoration-color: var(--signal);
  text-underline-offset: 2px;
}
.fw-docs-body a:hover {
  text-decoration-color: var(--ink);
}
```

- [ ] **Step 4: Run them to see them pass**

```bash
cd apps/lab
pnpm exec vitest run --project chromium src/docs/
pnpm exec vitest run --project node src/docs/
pnpm run check && pnpm run lint
```

Expected: PASS. The two existing pages have no list, so their shape tests are unaffected.

- [ ] **Step 5: Mutation**

Commit first (Step 6), then in `ListView` replace `const loose = node.spread === true || node.children.some((item) => item.spread === true)` with `const loose = false`; run the chromium file: both list cases FAIL. Undo by hand.

- [ ] **Step 6: Commit**

```bash
cd apps/lab && pnpm exec prettier --write src/docs/DocsMarkdown.tsx src/docs/shape.ts src/design/docs.css \
  src/docs/DocsMarkdown.browser.test.tsx src/docs/shape.test.ts src/docs/content.test.ts && cd ../..
git add apps/lab/src/docs/DocsMarkdown.tsx apps/lab/src/docs/shape.ts apps/lab/src/design/docs.css \
  apps/lab/src/docs/DocsMarkdown.browser.test.tsx apps/lab/src/docs/shape.test.ts apps/lab/src/docs/content.test.ts
git commit -m "lab: docs lists are loose per list, their kind is part of a page's shape, and prose lists and links have styles"
```

---

### Task 2: One list of pages

Adding a page today means editing five lists by hand (`DOCS_PAGES`, `PAGES` and `pageOf` in `DocsNav`, the palette's go-to rows, `DOCS_SOURCES` in `jev-docs.ts`) and three redirects (`AppRoutes`, `DocsRoute`, the Docs tab). After this task the pages are `DOCS_PAGES` plus a dictionary name each, and everything else derives from them. The pages stay `element` and `cli` here; Task 4 adds `arrowz` in one place.

**Files:**
- Modify: `apps/lab/src/docs/pages.ts`
- Modify: `apps/lab/src/routes/DocsNav.tsx`, `apps/lab/src/palette/commands.ts`, `apps/lab/src/shell/TabRow.tsx`, `apps/lab/src/AppRoutes.tsx`, `apps/lab/src/routes/DocsRoute.tsx`
- Test: `apps/lab/src/docs/markdown.test.ts`, `packages/cli/scripts/jev-docs.test.ts`

**Interfaces:**
- Consumes: `UiKey` (`@arrowz/engine/i18n`).
- Produces (pages.ts): `DOCS_PAGES` (unchanged in this task), `DOCS_PAGE_NAMES: Record<DocsPage, UiKey>` (`as const satisfies`), `DOCS_HOME: string` (`/docs/<first page>`), `pageOf(pathname: string): DocsPage` (moved here from `DocsNav.tsx`).

- [ ] **Step 1: Write the failing tests**

In `apps/lab/src/docs/markdown.test.ts`, change the import of `./pages` to `import { DOCS_HOME, DOCS_PAGES, isDocsPage, pageOf } from './pages'` and add:

```ts
test('the docs home is the first page, and an address names its page by its second segment', () => {
  expect(DOCS_HOME).toBe(`/docs/${DOCS_PAGES[0]}`)
  expect(pageOf('/docs/cli')).toBe('cli')
  expect(pageOf('/docs/element')).toBe('element')
  expect(pageOf('/docs/climb')).toBe(DOCS_PAGES[0])
})
```

In `packages/cli/scripts/jev-docs.test.ts`, add (import `fromFileUrl` from `@std/path` and `DOCS_SOURCES` from `./jev-docs.ts` if not imported yet):

```ts
// Jev reads a page only through DOCS_SOURCES: a page missing there is never checked.
Deno.test('DOCS_SOURCES names exactly the docs pages on disk', () => {
  const dir = fromFileUrl(new URL('../../../apps/lab/docs-content/en/', import.meta.url))
  const pages = [...Deno.readDirSync(dir)]
    .filter((entry) => entry.name.endsWith('.md'))
    .map((entry) => entry.name.slice(0, -3))
  assertEquals(Object.keys(DOCS_SOURCES).sort(), pages.sort())
})
```

- [ ] **Step 2: Run them**

```bash
cd apps/lab && pnpm exec vitest run --project node src/docs/markdown.test.ts; cd ../..
deno test --allow-read packages/cli/scripts/jev-docs.test.ts
```

Expected: `markdown.test.ts` FAILS (`DOCS_HOME` and `pageOf` are not exported by `pages.ts`); the Deno test PASSES today (two pages, two sources) and is the guard Task 4 must keep green.

- [ ] **Step 3: Implement**

Replace `apps/lab/src/docs/pages.ts` with:

```ts
/**
 * The documentation's pages, in the column's order, and the prefix their
 * section ids take in the DOM. Every list of pages — the column, the
 * palette's go-to rows, the redirects — derives from `DOCS_PAGES`. Light on
 * purpose: the route imports it eagerly, while the parser and the pages load
 * as a chunk of their own (`DocsRoute`).
 */
import type { UiKey } from '@arrowz/engine/i18n'

export const DOCS_PAGES = ['element', 'cli'] as const

export type DocsPage = (typeof DOCS_PAGES)[number]

/** Each page's name in the column and the palette, by its dictionary key. */
export const DOCS_PAGE_NAMES = {
  element: 'docsElement',
  cli: 'docsCli',
} as const satisfies Record<DocsPage, UiKey>

/** Where `/docs`, the Docs tab and an unknown page name go: the first page. */
export const DOCS_HOME = `/docs/${DOCS_PAGES[0]}`

export function isDocsPage(what: string | undefined): what is DocsPage {
  return DOCS_PAGES.some((page) => page === what)
}

/** The page an address names; `DocsRoute` has already redirected anything else. */
export function pageOf(pathname: string): DocsPage {
  const what = pathname.split('/')[2]
  return isDocsPage(what) ? what : DOCS_PAGES[0]
}

/** The panel shares the document with the lab's own ids, so a section's `{#id}` is prefixed. */
export const SECTION_PREFIX = 'docs-'
```

In `apps/lab/src/routes/DocsNav.tsx`:
- delete `const PAGES = [...]` and `export function pageOf(...)` with its comment;
- change the import to `import { DOCS_PAGE_NAMES, DOCS_PAGES, pageOf } from '../docs/pages'` (drop `type DocsPage` if unused);
- replace `{PAGES.map(({ page, name }) => (` with `{DOCS_PAGES.map((page) => (` and `{dict.t(name)}` with `{dict.t(DOCS_PAGE_NAMES[page])}`.

Search for other importers of `pageOf` from `DocsNav` (`grep -rn "pageOf" apps/lab/src`) and point them at `../docs/pages`.

In `apps/lab/src/palette/commands.ts`, add `import { DOCS_PAGE_NAMES, DOCS_PAGES } from '../docs/pages'` and replace the two `goRow(deps, 'go-docs-…')` lines with:

```ts
    ...DOCS_PAGES.map((page) =>
      goRow(deps, `go-docs-${page}`, `${dict.t('tabDocs')} — ${dict.t(DOCS_PAGE_NAMES[page])}`, `/docs/${page}`),
    ),
```

In `apps/lab/src/shell/TabRow.tsx`, import `DOCS_HOME` from `'../docs/pages'` and set the Docs tab's `path: DOCS_HOME`.

In `apps/lab/src/AppRoutes.tsx`, import `DOCS_HOME` from `'./docs/pages'` and render `<KeepHashNavigate to={DOCS_HOME} />` for `/docs`.

In `apps/lab/src/routes/DocsRoute.tsx`, import `DOCS_HOME` with `isDocsPage` and render `<KeepHashNavigate to={DOCS_HOME} />`.

- [ ] **Step 4: Run them to see them pass, and the suites that use the pages**

```bash
cd apps/lab
pnpm exec vitest run --project node src/docs/ src/palette/ src/readme.test.ts
pnpm exec vitest run --project chromium src/routes/ src/docs/ src/shell/TabRow.browser.test.tsx src/AppRoutes.browser.test.tsx
pnpm run check && pnpm run lint
cd ../.. && deno task check && deno task lint
```

Expected: PASS, with no test edited besides Step 1's: the pages, their order and every address are what they were. `DOCS_HOME` is `/docs/element` until Task 4.

- [ ] **Step 5: Commit**

```bash
cd apps/lab && pnpm exec prettier --write src/docs/pages.ts src/routes/DocsNav.tsx src/palette/commands.ts \
  src/shell/TabRow.tsx src/AppRoutes.tsx src/routes/DocsRoute.tsx src/docs/markdown.test.ts && cd ../..
deno fmt packages/cli/scripts/jev-docs.test.ts
git add apps/lab/src/docs/pages.ts apps/lab/src/routes/DocsNav.tsx apps/lab/src/palette/commands.ts \
  apps/lab/src/shell/TabRow.tsx apps/lab/src/AppRoutes.tsx apps/lab/src/routes/DocsRoute.tsx \
  apps/lab/src/docs/markdown.test.ts packages/cli/scripts/jev-docs.test.ts
git commit -m "lab: the docs pages are one list, and the column, the palette, the tab and the redirects follow it"
```

---

### Task 3: The rule, played

**Files:**
- Create: `apps/lab/src/docs/ruleBoards.ts`, `apps/lab/src/docs/ruleBoards.test.ts`
- Create: `apps/lab/src/docs/RulePlay.tsx`, `apps/lab/src/docs/RulePlay.browser.test.tsx`
- Modify: `packages/engine/lab-i18n.ts` (seven keys in `EN.ui` and `PL.ui`)
- Modify: `apps/lab/src/docs/shape.ts` (`DIRECTIVES`), `apps/lab/src/docs/DocsMarkdown.tsx` (`Directive`), `apps/lab/src/design/docs.css`
- Test: `apps/lab/src/docs/shape.test.ts`, `apps/lab/src/docs/DocsMarkdown.browser.test.tsx`

**Interfaces:**
- Consumes: `BoardCanvas` (`stage/BoardCanvas.tsx`: props `board`, `view`, `play`, `enableColors`, `showPoints`, `pad`, `lang`, `onPieceRemoved`, `onLifeLost`, `ref`); `ArrowzBoard`, `GESTURE_STORAGE_KEY` (`@arrowz/board-element`); `newSession`, `play`, `BoardData`, `Piece` (`@arrowz/engine`); `PlainUiKey` (`console/viewFields.ts`).
- Produces: `RULE_BOARD_NAMES = ['rule-free', 'rule-blocked', 'rule-shape'] as const`, `type RuleBoardName`, `isRuleBoard(name: unknown): name is RuleBoardName`, `RULE_BOARDS: Readonly<Record<RuleBoardName, BoardData>>` (ruleBoards.ts); `RulePlay({ name }: { name: RuleBoardName }): ReactElement` (RulePlay.tsx); `DIRECTIVES.play = { board: RULE_BOARD_NAMES }`; dictionary keys `docsRuleFree`, `docsRuleBlocked`, `docsRuleShape`, `docsPlayPrompt`, `docsPlayLeft`, `docsPlayBounced`, `docsPlayRestart`.

The boards copy the README's pictures (`docs/images/rule-*.svg`, 8×6 cells of 40px from (20, 20)): a cell's centre `(40 + 40x, 40 + 40y)`. Arrow ids are their index on the board.

```text
rule-free           rule-blocked        rule-shape
. . . . . . . .     . . . . . . . .     . . . . . . . .
. . . . . . . .     . . . . . . . .     . . 0 0 0>. . .
0 0 0>. . . . .     0 0 0>. 2^. . .     . . 0 1 1>. . .
0 . . . . . . .     0 . . . . 2 . .     . . 0 0 0 . . .
0 . 1 1 1>. . .     0 . 1 1 1>2 . .     . . . . . . . .
. . . . . . . .     . . . . . . . .     . . . . . . . .
```

- [ ] **Step 1: The boards and their test**

Create `apps/lab/src/docs/ruleBoards.test.ts`:

```ts
import { newSession, play } from '@arrowz/engine'
import type { BoardData } from '@arrowz/engine'
import { describe, expect, test } from 'vitest'
import { isRuleBoard, RULE_BOARD_NAMES, RULE_BOARDS } from './ruleBoards'

describe.each(RULE_BOARD_NAMES)('%s', (name) => {
  const board = RULE_BOARDS[name]

  test('every arrow owns its cells and nothing else is owned', () => {
    const owned = board.pieces.flatMap((piece) => piece.cells.map(({ x, y }) => ({ at: y * board.W + x, id: piece.id })))
    expect(new Set(owned.map(({ at }) => at)).size).toBe(owned.length)
    for (const { at, id } of owned) expect(board.owner[at]).toBe(id)
    expect([...board.owner].filter((id) => id >= 0)).toHaveLength(owned.length)
    expect(board.owner).toHaveLength(board.W * board.H)
  })

  test('every arrow is two cells or more, each a step from the last', () => {
    for (const piece of board.pieces) {
      expect(piece.cells.length).toBeGreaterThanOrEqual(2)
      piece.cells.slice(1).forEach((cell, k) => {
        const before = piece.cells[k]
        if (before === undefined) throw new Error('no cell before')
        expect(Math.abs(cell.x - before.x) + Math.abs(cell.y - before.y), `${piece.id}`).toBe(1)
      })
    }
  })
})

const first = (board: BoardData, id: number) => play(newSession(board), id).move

// The verdicts come from the game's own reducer, so the boards say what the
// page says about them by the rule the element plays.
test('on the free board both arrows leave', () => {
  expect(first(RULE_BOARDS['rule-free'], 0).kind).toBe('exit')
  expect(first(RULE_BOARDS['rule-free'], 1).kind).toBe('exit')
})

test('on the blocked board the arrow bounces off the one across its path, which leaves, and then it leaves too', () => {
  const board = RULE_BOARDS['rule-blocked']
  expect(first(board, 0)).toEqual({ kind: 'bounce', pieceId: 0, distance: 2, blockerId: 2 })
  const { next, move } = play(newSession(board), 2)
  expect(move.kind).toBe('exit')
  expect(play(next, 0).move.kind).toBe('exit')
})

test('the horseshoe leaves though another arrow sits inside its bend', () => {
  expect(first(RULE_BOARDS['rule-shape'], 0).kind).toBe('exit')
  expect(first(RULE_BOARDS['rule-shape'], 1).kind).toBe('exit')
})

test('a board name is one of the three', () => {
  expect(isRuleBoard('rule-free')).toBe(true)
  expect(isRuleBoard('rule-nowhere')).toBe(false)
  expect(isRuleBoard(undefined)).toBe(false)
})
```

Run: `cd apps/lab && pnpm exec vitest run --project node src/docs/ruleBoards.test.ts` — Expected: FAIL (`./ruleBoards` does not exist).

Create `apps/lab/src/docs/ruleBoards.ts`:

```ts
/**
 * The three boards the Arrowz page plays its rule on, built by hand after
 * the README's pictures (`docs/images/rule-*.svg`): 8×6 cells, most of them
 * empty. An empty cell (-1) blocks nothing (`scan` in the engine's
 * `game.ts`), so an arrow's fate depends only on the arrows drawn.
 */
import type { BoardData, Piece } from '@arrowz/engine'

export const RULE_BOARD_NAMES = ['rule-free', 'rule-blocked', 'rule-shape'] as const

export type RuleBoardName = (typeof RULE_BOARD_NAMES)[number]

export function isRuleBoard(name: unknown): name is RuleBoardName {
  return RULE_BOARD_NAMES.some((board) => board === name)
}

/** An arrow by its cells as `[x, y]`, arrowhead first; `dir` is 0 up, 1 right, 2 down, 3 left. */
interface Arrow {
  readonly dir: number
  readonly cells: readonly (readonly [number, number])[]
}

const W = 8
const H = 6
const UP = 0
const RIGHT = 1

function boardOf(arrows: readonly Arrow[]): BoardData {
  const owner = new Int32Array(W * H).fill(-1)
  const pieces = arrows.map((arrow, id): Piece => {
    for (const [x, y] of arrow.cells) owner[y * W + x] = id
    return { id, dir: arrow.dir, cells: arrow.cells.map(([x, y]) => ({ x, y })) }
  })
  return { W, H, owner, pieces }
}

/** The arrow the rule is about: up the left edge, then right along row 2 to its arrowhead at (2, 2). */
const HOOK: Arrow = {
  dir: RIGHT,
  cells: [
    [2, 2],
    [1, 2],
    [0, 2],
    [0, 3],
    [0, 4],
  ],
}
/** A short arrow under it. */
const SHORT: Arrow = {
  dir: RIGHT,
  cells: [
    [4, 4],
    [3, 4],
    [2, 4],
  ],
}
/** Parked across row 2 at column 5, pointing up: it stands in the path of both. */
const ACROSS: Arrow = {
  dir: UP,
  cells: [
    [5, 2],
    [5, 3],
    [5, 4],
  ],
}
/** A horseshoe opening right, its arrowhead at (4, 1). */
const HORSESHOE: Arrow = {
  dir: RIGHT,
  cells: [
    [4, 1],
    [3, 1],
    [2, 1],
    [2, 2],
    [2, 3],
    [3, 3],
    [4, 3],
  ],
}
/** A short arrow inside the horseshoe's bend. */
const INSIDE: Arrow = {
  dir: RIGHT,
  cells: [
    [4, 2],
    [3, 2],
  ],
}

export const RULE_BOARDS: Readonly<Record<RuleBoardName, BoardData>> = {
  'rule-free': boardOf([HOOK, SHORT]),
  'rule-blocked': boardOf([HOOK, SHORT, ACROSS]),
  'rule-shape': boardOf([HORSESHOE, INSIDE]),
}
```

Run again — Expected: PASS (ten tests: two per board, four after them).

- [ ] **Step 2: The strings**

In `packages/engine/lab-i18n.ts`, after `docsCli: 'Command line',` in `EN.ui`:

```ts
    /** The rule boards of the Arrowz page: each board's name, the line under it, its button. */
    docsRuleFree: 'An arrow with a clear path to the edge in front of its arrowhead',
    docsRuleBlocked: 'An arrow with another arrow standing in its path to the edge',
    docsRuleShape: 'A horseshoe-shaped arrow with another arrow inside its bend, still free to leave',
    docsPlayPrompt: 'Play any arrow and see what happens.',
    docsPlayLeft: 'It left: its path to the edge was clear.',
    docsPlayBounced: 'It bounced off another arrow.',
    docsPlayRestart: 'Start over',
```

and after `docsCli: 'Wiersz poleceń',` in `PL.ui`:

```ts
    docsRuleFree: 'Strzałka z wolną drogą do krawędzi przed grotem',
    docsRuleBlocked: 'Strzałka, na której drodze do krawędzi stoi inna strzałka',
    docsRuleShape: 'Strzałka w kształcie podkowy z inną strzałką w zagięciu, wciąż wolna',
    docsPlayPrompt: 'Zagraj dowolną strzałką i zobacz, co się stanie.',
    docsPlayLeft: 'Odjechała: jej droga do krawędzi była wolna.',
    docsPlayBounced: 'Odbiła się od innej strzałki.',
    docsPlayRestart: 'Zacznij od nowa',
```

Then:

```bash
deno fmt packages/engine/lab-i18n.ts
deno test --allow-read packages/engine/lab-i18n.test.ts packages/engine/glossary.test.ts packages/engine/neutral.test.ts
deno test --allow-read --allow-write --allow-env --allow-run --allow-net packages/cli/scripts/
pnpm nx build engine
```

Expected: PASS. (The glossary guard reads the Markdown pages, which arrive in Task 4; here it checks the new dictionary strings only.) If a `jev-guard` test that anchors on `PL.ui` string positions fails, re-anchor its indices as `docs/jev-guards.md` ("Limits") says, without changing what it asserts.

- [ ] **Step 3: The failing browser test**

Create `apps/lab/src/docs/RulePlay.browser.test.tsx`:

```tsx
import { type ArrowzBoard, GESTURE_STORAGE_KEY } from '@arrowz/board-element'
import { act } from 'react'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { renderAt } from '../harness/renderAt'
import { useStore } from '../state/store'
import type { RuleBoardName } from './ruleBoards'
import { RulePlay } from './RulePlay'
// The board takes its size from docs.css; without the sheets it has none and no viewport.
import '../design/index.css'

beforeEach(() => useStore.getState().lang.setLang('en'))
afterEach(() => localStorage.removeItem(GESTURE_STORAGE_KEY))

async function mount(name: RuleBoardName) {
  const screen = await renderAt(<RulePlay name={name} />, { style: { width: '400px' } })
  const element = screen.container.querySelector<ArrowzBoard>('arrowz-board')
  if (element === null) throw new Error('no element')
  await expect.poll(() => element.viewport).not.toBeNull()
  return { screen, element }
}

/** A real ⌘/Ctrl-click on a piece's head cell, as in `BoardMode.browser.test.tsx`: the element's own game moves. */
function clickPiece(element: ArrowzBoard, pieceId: number) {
  const vp = element.viewport
  const head = element.board?.pieces.find((p) => p.id === pieceId)?.cells[0]
  const canvas = element.shadowRoot?.querySelector('canvas')
  if (!vp || !head || !canvas) throw new Error('need a viewport, a canvas and a piece')
  const r = canvas.getBoundingClientRect()
  const init = {
    bubbles: true,
    composed: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: r.left + (head.x + 0.5 - vp.originX) * vp.cellPx,
    clientY: r.top + (head.y + 0.5 - vp.originY) * vp.cellPx,
    ctrlKey: true,
    buttons: 1,
  }
  canvas.dispatchEvent(new PointerEvent('pointerdown', init))
  canvas.dispatchEvent(new PointerEvent('pointerup', init))
}

const line = (container: HTMLElement) => container.querySelector('[role="status"]')?.textContent
const removed = (element: ArrowzBoard) => element.saveState()?.removed

test('the blocked arrow bounces, the arrow in its way leaves, and then the first leaves too', async () => {
  const { screen, element } = await mount('rule-blocked')
  expect(line(screen.container)).toBe('Play any arrow and see what happens.')
  clickPiece(element, 0)
  await expect.poll(() => line(screen.container)).toBe('It bounced off another arrow.')
  expect(removed(element)).toEqual([])
  clickPiece(element, 2)
  await expect.poll(() => line(screen.container)).toBe('It left: its path to the edge was clear.')
  clickPiece(element, 0)
  await expect.poll(() => removed(element)).toEqual([0, 2])
})

test.each([
  ['rule-free', 0],
  ['rule-shape', 0],
] as const)('on %s the arrow leaves', async (name, id) => {
  const { screen, element } = await mount(name)
  clickPiece(element, id)
  await expect.poll(() => removed(element)).toEqual([id])
  await expect.poll(() => line(screen.container)).toBe('It left: its path to the edge was clear.')
})

test('Start over puts every arrow back and the line with them', async () => {
  const { screen, element } = await mount('rule-free')
  const restart = screen.getByRole('button', { name: 'Start over' })
  await expect.element(restart).toBeDisabled()
  clickPiece(element, 0)
  await expect.poll(() => removed(element)).toEqual([0])
  await restart.click()
  expect(removed(element)).toEqual([])
  expect(line(screen.container)).toBe('Play any arrow and see what happens.')
  await expect.element(restart).toBeDisabled()
})

test('a language switch keeps the game and translates the line', async () => {
  const { screen, element } = await mount('rule-free')
  clickPiece(element, 0)
  await expect.poll(() => removed(element)).toEqual([0])
  await act(async () => useStore.getState().lang.setLang('pl'))
  await expect.poll(() => line(screen.container)).toBe('Odjechała: jej droga do krawędzi była wolna.')
  expect(removed(element)).toEqual([0])
  expect(element.getAttribute('lang')).toBe('pl')
})

// The element may refuse colour, so the drawn colour is read back from the
// element, not from the property set on it.
test('a rule board is named, coloured and playable', async () => {
  const { screen, element } = await mount('rule-shape')
  await expect
    .element(screen.getByRole('figure', { name: 'A horseshoe-shaped arrow with another arrow inside its bend, still free to leave' }))
    .toBeVisible()
  expect(element.play).toBe(true)
  expect(element.colored).toBe(true)
})

test('the page keeps the player’s stored gesture', async () => {
  localStorage.setItem(GESTURE_STORAGE_KEY, 'click')
  const { element } = await mount('rule-free')
  expect(element.gestureMode).toBe('click')
})
```

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/docs/RulePlay.browser.test.tsx` — Expected: FAIL (`./RulePlay` does not exist).

- [ ] **Step 4: RulePlay**

Create `apps/lab/src/docs/RulePlay.tsx`:

```tsx
/**
 * One of the Arrowz page's rule boards (`::play`), to play. The element in
 * `play` mode decides each move itself; the line under it answers the two
 * events a move raises, and Start over puts the arrows back. The board and the
 * view are module constants: a re-render — a language switch — must never
 * hand the element a new board, which would start its game over. The gesture
 * is the element's, so a player's stored choice stands.
 */
import type { ArrowzBoard } from '@arrowz/board-element'
import { type ReactElement, useRef, useState } from 'react'
import type { PlainUiKey } from '../console/viewFields'
import { useDictionary } from '../i18n'
import { BoardCanvas } from '../stage/BoardCanvas'
import { useStore } from '../state/store'
import { RULE_BOARDS, type RuleBoardName } from './ruleBoards'

/** Each arrow in its own colour, so it is easy to follow; the element draws colour only with `enableColors`. */
const VIEW = { colored: true }

const NAMES: Readonly<Record<RuleBoardName, PlainUiKey>> = {
  'rule-free': 'docsRuleFree',
  'rule-blocked': 'docsRuleBlocked',
  'rule-shape': 'docsRuleShape',
}

type Said = 'prompt' | 'left' | 'bounced'

const LINES: Readonly<Record<Said, PlainUiKey>> = {
  prompt: 'docsPlayPrompt',
  left: 'docsPlayLeft',
  bounced: 'docsPlayBounced',
}

export function RulePlay({ name }: { name: RuleBoardName }): ReactElement {
  const dict = useDictionary()
  const lang = useStore((state) => state.lang.lang)
  const element = useRef<ArrowzBoard>(null)
  const [said, setSaid] = useState<Said>('prompt')
  const restart = () => {
    element.current?.restart()
    setSaid('prompt')
  }
  return (
    <figure className="fw-docs-play" aria-label={dict.t(NAMES[name])}>
      <BoardCanvas
        ref={element}
        board={RULE_BOARDS[name]}
        view={VIEW}
        play
        enableColors
        showPoints
        pad={1}
        lang={lang}
        onPieceRemoved={() => setSaid('left')}
        onLifeLost={() => setSaid('bounced')}
      />
      <div className="fw-docs-playline">
        <span role="status">{dict.t(LINES[said])}</span>
        <button type="button" className="fw-btn" disabled={said === 'prompt'} onClick={restart}>
          {dict.t('docsPlayRestart')}
        </button>
      </div>
    </figure>
  )
}
```

In `apps/lab/src/design/docs.css`, append before the `.fw-docs-info` block:

```css
/* A rule board (`::play`) at the README picture's width: 8×6 cells and a
   cell of margin all round make it 10:8. The line and Start over sit under it. */
.fw-docs-play {
  max-width: 360px;
  margin: 12px 0 16px;
}
.fw-docs-play arrowz-board {
  display: block;
  width: 100%;
  aspect-ratio: 10 / 8;
}
.fw-docs-playline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--mist);
}
```

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/docs/RulePlay.browser.test.tsx` — Expected: PASS (seven tests).

- [ ] **Step 5: The directive**

In `apps/lab/src/docs/shape.test.ts`: in `'a page the renderer can show has none'` add the line `'::play{board="rule-free"}',` after `'::help{form="knobs"}',`; in the `refuses %s` table add:

```ts
    ['an unknown rule board', '# T\n\n::play{board="rule-nowhere"}', 'board="rule-nowhere" is not one of'],
    ['a rule board without its name', '# T\n\n::play', '::play needs board'],
```

In `apps/lab/src/docs/DocsMarkdown.browser.test.tsx` add:

```tsx
test('::play draws the rule board it names, coloured and playable', async () => {
  const screen = await show('# T\n\n::play{board="rule-blocked"}')
  const figure = screen.getByRole('figure', { name: 'An arrow with another arrow standing in its path to the edge' })
  await expect.element(figure).toBeVisible()
  const element = figure.element().querySelector('arrowz-board')
  expect(element?.hasAttribute('play')).toBe(true)
  expect(element?.board?.pieces).toHaveLength(3)
})
```

If `element?.board` does not type-check (`querySelector` returns `Element`), use `querySelector<ArrowzBoard>('arrowz-board')` with `import type { ArrowzBoard } from '@arrowz/board-element'`.

Run both files — Expected: the four new cases FAIL (`::play is not a docs directive` for each shape case; no figure).

In `apps/lab/src/docs/shape.ts`, import `RULE_BOARD_NAMES` from `'./ruleBoards'` and add the row to `DIRECTIVES`:

```ts
  play: { board: RULE_BOARD_NAMES },
```

In `apps/lab/src/docs/DocsMarkdown.tsx`, import `isRuleBoard` from `'./ruleBoards'` and `RulePlay` from `'./RulePlay'`, and replace the body of `Directive` with:

```tsx
  const attributes = node.attributes ?? {}
  if (node.name === 'table') return <DocsTable of={attributes['of'] ?? ''} labelledBy={section?.id} />
  if (node.name === 'play') {
    const board = attributes['board']
    return isRuleBoard(board) ? <RulePlay name={board} /> : null
  }
  if (node.name !== 'help') return null
  const text = helpText({ knobs: attributes['form'] === 'knobs' })
  return (
    <DocsBlock kind="term" section={section?.title ?? ''} text={text}>
      {text}
    </DocsBlock>
  )
```

- [ ] **Step 6: Run everything this task touched**

```bash
cd apps/lab
pnpm exec vitest run --project node src/docs/
pnpm exec vitest run --project chromium src/docs/ src/stage/BoardCanvas.browser.test.tsx
pnpm run check && pnpm run lint
cd ../.. && deno task check && deno task lint && deno task test
```

Expected: PASS.

- [ ] **Step 7: Mutations**

Commit first (Step 8), then one at a time, undoing each by hand:

| Mutation | Expected red |
|---|---|
| in `RulePlay`, delete `onLifeLost={() => setSaid('bounced')}` | `the blocked arrow bounces…` |
| in `RulePlay`, replace `board={RULE_BOARDS[name]}` with `board={{ ...RULE_BOARDS[name], lang }}` (a fresh object per language: the React Compiler memoizes a plain `{ ...RULE_BOARDS[name] }` on `name`, so that one stays green) | `a language switch keeps the game…` |
| in `RulePlay`, delete `enableColors` | `a rule board is named, coloured and playable` |
| in `ruleBoards.ts`, change `ACROSS`'s first cell to `[6, 2]` (and its others to column 6) | `ruleBoards.test.ts` blocked-board case (`distance: 3`) |

Record the four outcomes in the task report.

- [ ] **Step 8: Commit**

```bash
cd apps/lab && pnpm exec prettier --write src/docs/ruleBoards.ts src/docs/ruleBoards.test.ts src/docs/RulePlay.tsx \
  src/docs/RulePlay.browser.test.tsx src/docs/shape.ts src/docs/shape.test.ts src/docs/DocsMarkdown.tsx \
  src/docs/DocsMarkdown.browser.test.tsx src/design/docs.css && cd ../..
git add apps/lab/src/docs/ruleBoards.ts apps/lab/src/docs/ruleBoards.test.ts apps/lab/src/docs/RulePlay.tsx \
  apps/lab/src/docs/RulePlay.browser.test.tsx apps/lab/src/docs/shape.ts apps/lab/src/docs/shape.test.ts \
  apps/lab/src/docs/DocsMarkdown.tsx apps/lab/src/docs/DocsMarkdown.browser.test.tsx apps/lab/src/design/docs.css \
  packages/engine/lab-i18n.ts
git commit -m "lab: ::play shows a hand-built rule board to play, with a line that answers each move and Start over"
```

---

### Task 4: The Arrowz page

**Files:**
- Create: `apps/lab/docs-content/en/arrowz.md`, `apps/lab/docs-content/pl/arrowz.md`
- Create: `apps/lab/src/docs/ArrowzPage.browser.test.tsx`
- Modify: `apps/lab/src/docs/pages.ts`, `apps/lab/src/docs/content.ts`, `packages/engine/lab-i18n.ts` (`docsArrowz`)
- Modify: `packages/cli/scripts/jev-docs.ts` (`DOCS_SOURCES`), `docs/jev-guards.md`
- Modify: `apps/lab/README.md` (screens and palette tables)
- Test (update): `apps/lab/src/docs/content.test.ts`, `apps/lab/src/routes/DocsNav.browser.test.tsx`, `apps/lab/src/routes/DocsLayout.browser.test.tsx`, `apps/lab/src/AppRoutes.browser.test.tsx`, `apps/lab/src/routes/KeepHashNavigate.browser.test.tsx`, `apps/lab/src/palette/commands.test.ts`, `apps/lab/src/routes/DocsRoute.browser.test.tsx` (only if it names the element page as the home)

**Interfaces:**
- Consumes: Task 2's `DOCS_PAGES`, `DOCS_PAGE_NAMES`, `DOCS_HOME`; Task 3's `::play` and dictionary keys.
- Produces: `DOCS_PAGES = ['arrowz', 'cli', 'element']` (the spec's order, §1.1; the Lab page goes after `arrowz` in the next PR), `DOCS_HOME = '/docs/arrowz'`, section ids `puzzle`, `rule`, `promises`, `words`.

- [ ] **Step 1: The page in English**

Create `apps/lab/docs-content/en/arrowz.md`:

```md
# Arrowz

Arrowz is a puzzle. You get a rectangle packed with arrows, and you clear it one arrow at a time, in the right order. The lab is where its boards are made: you pick the settings, the generator lays a board, and you see what came out.

> Arrowz is in alpha: the board generator is done, and the game itself — lives and a score — is designed but not built yet. The small boards on this page already play by its rule.

## The puzzle {#puzzle}

A board is a grid of cells, and every cell is covered by an arrow. An arrow is a line that walks from cell to cell — up, down, left or right, never across itself — with an arrowhead at one end that says which way it goes. Arrows run from two cells to several hundred.

A real board draws every arrow in one colour, because telling the arrows apart by eye is the game. The small boards below give each arrow its own colour, so it is easy to follow.

You win when the board is empty, and lose when you run out of lives. You can never get stuck: while arrows remain, at least one of them is free, so the whole difficulty is in _seeing_ which.

## The one rule {#rule}

You tap an arrow, and it tries to drive straight off the board in the direction its arrowhead points. Only the **path to the edge** matters: the straight strip of cells from the arrowhead to the edge of the board.

**If the path is clear, the arrow leaves.** Try it on the board below. The hint on the board says how to play an arrow: a click with ⌘ held (Ctrl on Windows and Linux) or a tap, unless the board has been switched to plain clicks.

::play{board="rule-free"}

If anything stands in the path, the arrow bumps into it, slides back, and you lose a life. Here a second arrow is parked across the path. Clear it first, and the arrow behind it can leave too.

::play{board="rule-blocked"}

The shape of an arrow does not matter. It travels along its own body, every cell shuffling up into the one in front, so a horseshoe with another arrow inside its bend is still free when its path is clear.

::play{board="rule-shape"}

## What the generator promises {#promises}

Every board the generator hands back has been checked:

- **Nothing is left over.** Every cell belongs to exactly one arrow: no gaps, no overlaps.
- **No arrow is a single cell.** The shortest arrow is two cells, because a single cell would have no direction to point in.
- **The board can always be cleared.** Before it hands a board over, the generator works out which arrow blocks which and proves the puzzle has a solution.
- **It knows at least one solution.** The order in which the generator laid the arrows is itself a winning order.
- **You cannot play yourself into a corner.** Any sequence of legal moves empties the board in the end.
- **The same request gives the same board.** The same settings with the same seed give the identical board, down to the last cell.

What it does not promise is that every request succeeds. On hard settings the generator can get stuck while it lays a board. It then takes some arrows back and tries again, and if that still fails, it starts over from a new seed worked out from yours. When every attempt fails, it says so — the board comes back marked not complete — instead of passing a broken board off as a good one.

The settings that steer the generator, and the safe range of each, are on the [Command line](docs:cli#knobs) page.

## Words {#words}

- **arrow** — one line on the board, from two to several hundred cells long, with an arrowhead at one end. In the code: `piece`.
- **arrowhead** — the pointed end of an arrow; it shows which way the arrow goes. In the code: `head`.
- **path to the edge** — the straight strip of cells from an arrowhead to the edge of the board. When it is clear, the arrow can leave. In the code: `corridor`.
- **free** — an arrow whose path to the edge is clear, so it can leave right now.
- **complete** — a board where every cell is covered by an arrow.
- **seed** — a number that decides which board you get. The same seed with the same settings gives the same board.
```

- [ ] **Step 2: The page in Polish**

Create `apps/lab/docs-content/pl/arrowz.md`:

```md
# Arrowz

Arrowz to łamigłówka. Dostajesz prostokąt wypełniony strzałkami i usuwasz je po jednej, we właściwej kolejności. W laboratorium powstają jej plansze: wybierasz ustawienia, generator układa planszę, a Ty oglądasz, co z tego wyszło.

> Arrowz jest w wersji alfa: generator plansz jest gotowy, a sama gra — życia i wynik — jest zaprojektowana, ale jeszcze nie zbudowana. Małe plansze na tej stronie już grają według jej reguły.

## Łamigłówka {#puzzle}

Plansza to siatka komórek, a każdą komórkę zajmuje strzałka. Strzałka to linia, która idzie od komórki do komórki — w górę, w dół, w lewo albo w prawo, nigdy nie przecinając samej siebie — z grotem na jednym końcu, który mówi, w którą stronę jedzie. Strzałki mają od dwóch do kilkuset komórek.

Prawdziwa plansza rysuje wszystkie strzałki jednym kolorem, bo rozróżnianie ich na oko to właśnie gra. Małe plansze niżej dają każdej strzałce własny kolor, żeby łatwo było ją śledzić.

Wygrywasz, gdy plansza jest pusta, a przegrywasz, gdy skończą Ci się życia. Nigdy nie utkniesz: dopóki zostały strzałki, co najmniej jedna z nich jest wolna, więc cała trudność polega na tym, żeby _zobaczyć_ którą.

## Jedna reguła {#rule}

Stukasz w strzałkę, a ona próbuje wyjechać prosto z planszy w stronę, w którą wskazuje jej grot. Liczy się tylko **droga do krawędzi**: prosty pas komórek od grotu do krawędzi planszy.

**Jeśli droga jest wolna, strzałka odjeżdża.** Spróbuj na planszy niżej. Podpowiedź na planszy mówi, jak zagrać strzałką: kliknięcie z wciśniętym ⌘ (Ctrl w Windows i Linuksie) albo stuknięcie, chyba że plansza jest przełączona na zwykłe kliknięcia.

::play{board="rule-free"}

Jeśli coś stoi na drodze, strzałka w to uderza, cofa się, a Ty tracisz życie. Tu w poprzek drogi stoi druga strzałka. Usuń ją najpierw, a strzałka za nią też odjedzie.

::play{board="rule-blocked"}

Kształt strzałki nie ma znaczenia. Strzałka jedzie po własnym ciele: każda komórka przesuwa się na miejsce tej przed nią, więc podkowa z inną strzałką w zagięciu też jest wolna, gdy jej droga jest wolna.

::play{board="rule-shape"}

## Co obiecuje generator {#promises}

Każda plansza, którą oddaje generator, została sprawdzona:

- **Nic nie zostaje.** Każda komórka należy do dokładnie jednej strzałki: bez dziur i bez nakładania się.
- **Żadna strzałka nie ma jednej komórki.** Najkrótsza strzałka ma dwie komórki, bo pojedyncza komórka nie miałaby kierunku.
- **Planszę zawsze da się wyczyścić.** Zanim odda planszę, generator ustala, która strzałka blokuje którą, i dowodzi, że łamigłówka ma rozwiązanie.
- **Zna co najmniej jedno rozwiązanie.** Kolejność, w jakiej generator układał strzałki, sama jest wygrywającą kolejnością.
- **Nie zapędzisz się w kozi róg.** Każdy ciąg dozwolonych ruchów w końcu opróżnia planszę.
- **To samo żądanie daje tę samą planszę.** Te same ustawienia z tym samym ziarnem dają identyczną planszę, co do komórki.

Generator nie obiecuje natomiast, że każde żądanie się uda. Przy trudnych ustawieniach może utknąć w trakcie układania. Wtedy cofa część strzałek i próbuje jeszcze raz, a jeśli i to zawiedzie, zaczyna od nowa od nowego ziarna wyliczonego z Twojego. Gdy zawiodą wszystkie próby, mówi o tym — plansza wraca oznaczona jako niepełna — zamiast podawać zepsutą planszę jako dobrą.

Ustawienia, które sterują generatorem, i bezpieczny zakres każdego z nich są na stronie [Wiersz poleceń](docs:cli#knobs).

## Słowniczek {#words}

- **strzałka** — jedna linia na planszy, od dwóch do kilkuset komórek, z grotem na jednym końcu. W kodzie: `piece`.
- **grot** — ostry koniec strzałki; pokazuje, w którą stronę strzałka jedzie. W kodzie: `head`.
- **droga do krawędzi** — prosty pas komórek od grotu do krawędzi planszy. Gdy jest wolny, strzałka może odjechać. W kodzie: `corridor`.
- **wolna** — strzałka, której droga do krawędzi jest wolna, więc może odjechać od razu.
- **pełna** — plansza, w której każdą komórkę zajmuje strzałka.
- **ziarno** — liczba, która decyduje, jaką planszę dostajesz. To samo ziarno przy tych samych ustawieniach daje tę samą planszę.
```

- [ ] **Step 3: Write the failing tests**

Create `apps/lab/src/docs/ArrowzPage.browser.test.tsx`:

```tsx
import type { ArrowzBoard } from '@arrowz/board-element'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { DocsPageView } from './DocsPageView'
// The boards take their size from docs.css; without the sheets they have none.
import '../design/index.css'

beforeEach(() => useStore.getState().lang.setLang('en'))

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/docs/arrowz']}>
      <div className="fw-docs-body">
        <DocsPageView page="arrowz" />
      </div>
    </MemoryRouter>,
  )

const figures = (container: HTMLElement) =>
  [...container.querySelectorAll('figure')].map((figure) => figure.getAttribute('aria-label'))

test('the page has its title and four sections, in order', async () => {
  const screen = await mount()
  expect(screen.container.querySelector('h2')?.textContent).toBe('Arrowz')
  expect([...screen.container.querySelectorAll('h3')].map((h) => h.id)).toEqual([
    'docs-puzzle',
    'docs-rule',
    'docs-promises',
    'docs-words',
  ])
})

test('the rule is played on its three boards, in the order the prose takes them', async () => {
  const screen = await mount()
  expect(figures(screen.container)).toEqual([
    'An arrow with a clear path to the edge in front of its arrowhead',
    'An arrow with another arrow standing in its path to the edge',
    'A horseshoe-shaped arrow with another arrow inside its bend, still free to leave',
  ])
  expect(screen.container.querySelectorAll('figure arrowz-board[play]')).toHaveLength(3)
})

test('the promises and the words are lists of six', async () => {
  const screen = await mount()
  expect([...screen.container.querySelectorAll('ul')].map((ul) => ul.children.length)).toEqual([6, 6])
})

test('the settings link goes to the command line page', async () => {
  const screen = await mount()
  await expect.element(screen.getByRole('link', { name: 'Command line' })).toHaveAttribute('href', '/docs/cli')
})

test('in Polish the page and its boards speak Polish', async () => {
  const screen = await mount()
  await act(async () => useStore.getState().lang.setLang('pl'))
  await expect.poll(() => screen.container.querySelector('#docs-rule')?.textContent).toBe('Jedna reguła')
  expect(figures(screen.container)[0]).toBe('Strzałka z wolną drogą do krawędzi przed grotem')
})

test('playing one board leaves the others as they were', async () => {
  const screen = await mount()
  const boards = [...screen.container.querySelectorAll<ArrowzBoard>('figure arrowz-board')]
  const first = boards[0]
  if (first === undefined) throw new Error('no board')
  await expect.poll(() => first.viewport).not.toBeNull()
  await act(async () => {
    first.dispatchEvent(new CustomEvent('piece-removed', { detail: { pieceId: 0, left: 1 }, bubbles: true, composed: true }))
  })
  const lines = [...screen.container.querySelectorAll('figure [role="status"]')].map((s) => s.textContent)
  expect(lines).toEqual([
    'It left: its path to the edge was clear.',
    'Play any arrow and see what happens.',
    'Play any arrow and see what happens.',
  ])
})
```

In `apps/lab/src/docs/content.test.ts`, make the link test unable to pass with no links: inside `'every docs: link in %s names a section that exists'`, count the `docs:` links checked into a `let checked = 0` (increment after the `m === null` guard) and end the test with `expect(checked).toBeGreaterThan(0)`.

Run:

```bash
cd apps/lab
pnpm exec vitest run --project chromium src/docs/ArrowzPage.browser.test.tsx
pnpm exec vitest run --project node src/docs/content.test.ts
```

Expected: FAIL — `arrowz` is not a page yet (`TypeError: Cannot read properties of undefined (reading 'root')`), and the link case fails with `expected 0 to be greater than 0`.

- [ ] **Step 4: Wire the page in**

`packages/engine/lab-i18n.ts`: add `docsArrowz: 'Arrowz',` before `docsElement` in `EN.ui` and `docsArrowz: 'Arrowz',` before `docsElement` in `PL.ui`. Then `deno fmt packages/engine/lab-i18n.ts && pnpm nx build engine`.

`apps/lab/src/docs/pages.ts`:

```ts
export const DOCS_PAGES = ['arrowz', 'cli', 'element'] as const
```

```ts
export const DOCS_PAGE_NAMES = {
  arrowz: 'docsArrowz',
  cli: 'docsCli',
  element: 'docsElement',
} as const satisfies Record<DocsPage, UiKey>
```

`apps/lab/src/docs/content.ts`: import `arrowzEn` from `'../../docs-content/en/arrowz.md?raw'` and `arrowzPl` from `'../../docs-content/pl/arrowz.md?raw'`; add `arrowz: arrowzEn` / `arrowz: arrowzPl` to `SOURCES`, and `arrowz: parsed(SOURCES.en.arrowz)` / `arrowz: parsed(SOURCES.pl.arrowz)` to `PAGES`.

`packages/cli/scripts/jev-docs.ts`: add `arrowz: 'README.md',` as the first entry of `DOCS_SOURCES`. In `docs/jev-guards.md` ("Docs pages"), the sentence is wrapped: replace "(pages: `element`, `cli`; all by⏎default)" with "(pages: `arrowz`, `element`, `cli`;⏎all by default)" (⏎ is the line break).

- [ ] **Step 5: Update the tests that name the pages**

Each change below follows from the new first page or the new order; nothing else in these files changes.

- `routes/DocsNav.browser.test.tsx`: in `'a section link keeps the fragment the address carries'`, the selector `nav > ul > li:last-child > ul a` becomes `nav > ul > li:nth-child(2) > ul a` (the CLI page is second now, the element page last); `'both pages are real links with addresses'` becomes `'every page is a real link with an address'` and also expects `getByRole('link', { name: 'Arrowz' })` with `href` `/docs/arrowz`; in `'each page lists its sections, as links to that page'`, `toHaveLength(3)` and the expected array gains, first, `[['The puzzle', '/docs/arrowz'], ['The one rule', '/docs/arrowz'], ['What the generator promises', '/docs/arrowz'], ['Words', '/docs/arrowz']]`, then the CLI list, then the element list (the column's new order).
- `AppRoutes.browser.test.tsx`: the three redirect cases (`'%s lands on the element page'`, `'after the upper-case redirect…'`, `'clicking the Docs tab from the CLI page returns to…'`) expect `/docs/arrowz`; rename `'%s lands on the element page'` to `'%s lands on the first page'` and its comment's "lands on the element's page" to "lands on the first page"; rename the last case `'clicking the Docs tab from the CLI page returns to the first page'`.
- `routes/KeepHashNavigate.browser.test.tsx`: `CASES` `to: '/docs/arrowz'` for `/docs` and `/docs/no-such-page`.
- `palette/commands.test.ts`: `'keeps the catalogue order between two rows that both get promoted'` — the comment says "The docs rows' names all start with 'docs'"; `matches` equals `['go-docs-arrowz', 'go-docs-cli', 'go-docs-element']`; the two `indexOf` comparisons become `go-docs-arrowz` before `go-docs-cli`, and `go-docs-cli` before `go-docs-element`, in `matches` and in `catalogueOrder`.
- `routes/DocsLayout.browser.test.tsx`:
  - `openDocs(which: 'arrowz' | 'element' | 'cli')`: after the Docs tab click (which now lands on Arrowz), click the page's link in the column — not anywhere on the screen, because the Arrowz page links to "Command line" too and a strict locator would match both:
    ```tsx
    const column = screen.getByRole('navigation', { name: 'Documentation pages' })
    if (which === 'element') await column.getByRole('link', { name: 'Board element' }).click()
    if (which === 'cli') await column.getByRole('link', { name: 'Command line' }).click()
    ```
    The marker and count become `const [marker, count] = ({ arrowz: ['.fw-docs-body arrowz-board', 3], cli: ['pre.fw-docs-term', 2], element: ['pre.fw-docs-code', 1] } as const)[which]` (`as const`, or the pair infers as `(string | number)[]`), with the comment saying the Arrowz page's marker is its three rule boards (the hidden workspace has a board of its own, hence the `.fw-docs-body` scope);
  - the first `test.each(['element', 'cli'] as const)` becomes `test.each(['arrowz', 'element', 'cli'] as const)`;
  - in the eight-width loop, the `for` list gains `['arrowz', 'a[href="/docs/arrowz"]']` first and the marker line becomes the same three-way lookup as `openDocs` (`.fw-docs-body arrowz-board` for `arrowz`);
  - the XS case (`test.each(['en', 'pl'])`) `expect(shown).toHaveLength(2 + 5)` becomes `3 + 5` (three pages, the element page's five sections).

- [ ] **Step 6: The lab README**

In `apps/lab/README.md`:
- the screens table: `/docs` row → `Goes to \`/docs/arrowz\`.`; `/docs/:what` row → `The documentation: \`arrowz\` for the puzzle and its rule, \`cli\` for the command line, \`element\` for the board element.`
- the palette table: before `Docs — Board element`, the rows become, in this order:

```md
| `Docs — Arrowz`        | go to   | The puzzle, its one rule played on three small boards, and its words. |
| `Docs — Command line`  | go to   | The command line's documentation.                                    |
| `Docs — Board element` | go to   | The board element's documentation.                                   |
```

Prettier realigns both tables (`pnpm exec prettier --write README.md` from `apps/lab`).

- [ ] **Step 7: Run every suite the page touches**

```bash
pnpm nx build engine
cd apps/lab
pnpm exec vitest run --project node src/
pnpm exec vitest run --project chromium src/docs/ src/routes/ src/AppRoutes.browser.test.tsx src/shell/ src/palette/
pnpm run check && pnpm run lint
cd ../..
deno test --allow-read packages/engine/glossary.test.ts packages/engine/lab-i18n.test.ts packages/engine/neutral.test.ts packages/engine/comments.test.ts
deno test --allow-read --allow-write --allow-env --allow-run --allow-net packages/cli/scripts/
```

Expected: PASS. If the glossary refuses a line, fix the prose in both languages (the shape test keeps them aligned), not the guard.

- [ ] **Step 8: Mutations**

Commit first (Step 9), then one at a time, undoing each by hand:

| Mutation | Expected red |
|---|---|
| in `pl/arrowz.md`, delete the `::play{board="rule-shape"}` line | `content.test.ts` shape case for `arrowz` |
| in `en/arrowz.md`, change `docs:cli#knobs` to `docs:cli#knob` | `content.test.ts` link case (`problemsOf` accepts the scheme and page; the section does not exist), and the shape case, since a link target is part of the shape |
| in `en/arrowz.md`, write `pieces` in place of `arrows` in the first sentence | `glossary.test.ts` "the docs pages use no retired word" |
| in `pages.ts`, move `'arrowz'` to the end of `DOCS_PAGES` | `markdown.test.ts` home case stays green (it reads `DOCS_PAGES[0]`) but `AppRoutes` (5), `KeepHashNavigate` (2), `DocsNav` (2) and `commands.test.ts`'s catalogue-order case go red |

- [ ] **Step 9: Commit**

```bash
cd apps/lab && pnpm exec prettier --write docs-content/en/arrowz.md docs-content/pl/arrowz.md README.md \
  src/docs/pages.ts src/docs/content.ts src/docs/content.test.ts src/docs/ArrowzPage.browser.test.tsx \
  src/routes/DocsNav.browser.test.tsx src/routes/DocsLayout.browser.test.tsx src/AppRoutes.browser.test.tsx \
  src/routes/KeepHashNavigate.browser.test.tsx src/palette/commands.test.ts && cd ../..
deno fmt packages/engine/lab-i18n.ts packages/cli/scripts/jev-docs.ts docs/jev-guards.md
git add apps/lab/docs-content/en/arrowz.md apps/lab/docs-content/pl/arrowz.md apps/lab/README.md \
  apps/lab/src/docs/pages.ts apps/lab/src/docs/content.ts apps/lab/src/docs/content.test.ts \
  apps/lab/src/docs/ArrowzPage.browser.test.tsx apps/lab/src/routes/DocsNav.browser.test.tsx \
  apps/lab/src/routes/DocsLayout.browser.test.tsx apps/lab/src/AppRoutes.browser.test.tsx \
  apps/lab/src/routes/KeepHashNavigate.browser.test.tsx apps/lab/src/palette/commands.test.ts \
  packages/engine/lab-i18n.ts packages/cli/scripts/jev-docs.ts docs/jev-guards.md
git commit -m "lab: the Docs tab opens on the Arrowz page, the puzzle and its rule played on three boards"
```

Prettier leaves the two Markdown pages as written (measured); it reformats the test files and realigns the README tables.

---

### Task 5: Screenshot, the whole branch, and the pull request

**Files:**
- Modify: `apps/lab/docs/screenshots.json` (the `docs` shot), `apps/lab/docs/screenshots/docs.png`, `apps/lab/README.md` (its caption)

- [ ] **Step 1: The docs screenshot**

In `apps/lab/docs/screenshots.json`, the shot `"out": "docs"`: `"path": "/docs/arrowz"`, `"caption": "The documentation: the puzzle and its rule"`, and `"steps": [{ "click": ".fw-docs-toc >> text=\"The one rule\"" }]` — at 1440×900 the page opens with the rule boards below the fold, so the shot follows the column's link to them. In `apps/lab/README.md` ("Screenshots"), the line becomes `![The documentation: the puzzle and its rule](docs/screenshots/docs.png)`. Then:

```bash
(cd apps/lab && pnpm exec playwright install chromium)   # once, if missing
pnpm nx run lab:screenshots docs
cd apps/lab && pnpm exec vitest run --project node src/readme.test.ts
```

Expected: `docs.png` is rewritten (look at it: the column with "The one rule" marked, the first rule boards drawn with their arrows); `readme.test.ts` PASSES.

- [ ] **Step 2: The element is defined once**

```bash
cd apps/lab && pnpm run build
grep -l "customElements.define" dist/assets/*.js
grep -l "fw-docs-play" dist/assets/*.js
```

Expected: the first grep names exactly one file, and it is not the `DocsBody-*.js` chunk; the second names only `DocsBody-*.js` (the rule boards ride in the Docs chunk, the element stays in the entry). If the element's class shows up in two files, stop: the Docs tab would throw on load.

- [ ] **Step 3: Every gate**

```bash
deno task verify
pnpm nx run-many -t verify
```

Expected: PASS for both.

- [ ] **Step 4: Jev reads the page**

Run: `deno task jev:docs arrowz`. Triage each flag: fix the text in both languages (and rerun), or keep it and write why. The list and its dispositions go into the PR body under "Jev".

- [ ] **Step 5: Look at it, and play it**

`pnpm nx serve lab`, open `http://localhost:8779/docs` in both languages at 1440×900 and 375×812: `/docs` lands on Arrowz; the column lists Arrowz, Command line, Board element; on each rule board ⌘-click (or tap, in the device toolbar) the arrows: on the first both leave, on the second the hooked arrow bounces until the upright one has left, on the third the horseshoe leaves; the line answers each move; Start over brings them back; switching the language mid-game keeps the board as it is.

- [ ] **Step 6: The follow-up note for PR 4**

```bash
bd update arrowz-kkey.4 --append-notes "The Arrowz page (PR 2) left out the README's two board pictures (hero, 40x40 seed 7; tiny-colorized, 8x8 seed 7 --colored): add them as ::board when ::board exists. The CLI page's #knobs id is linked from docs-content/*/arrowz.md; keep it."
```

- [ ] **Step 7: Open the pull request**

```bash
git push -u origin lab/docs-arrowz
gh pr create --title "lab: the Docs tab opens on the Arrowz page, with the rule played on three boards" --body "$(cat <<'EOF'
The Docs tab gets a first page, Arrowz, rewritten from the root README for a reader of the lab in
English and Polish: the puzzle, its one rule, what the generator promises, and the words. `/docs`,
the Docs tab and an unknown page name now go to `/docs/arrowz`.

The rule is played rather than pictured: `::play{board=…}` shows one of three boards built by hand
after the README's pictures (`ruleBoards.ts`), an `<arrowz-board>` in `play` mode with each arrow in
its own colour. One line under each board answers the element's `piece-removed` and `life-lost`, and
Start over calls `restart()`. The board's gesture and its stored choice are the element's own.

The pages are one list now (`DOCS_PAGES` with `DOCS_PAGE_NAMES` and `DOCS_HOME`): the column, the
palette's go-to rows, the tab and both redirects follow it, and a test ties `DOCS_SOURCES` (Jev) to
the Markdown on disk. From PR 1's review: lists are loose per list as CommonMark says, a page's shape
tells numbered lists from bulleted ones, prose lists, subsections and links have styles, and the
description and link checks can no longer pass vacuously.

Jev: <one line per flag from Task 5 Step 4, with what was done; or "nothing flagged">

Second of five PRs in docs/superpowers/specs/2026-10-05-lab-docs-from-readmes-design.md.

Bead: arrowz-kkey.2
EOF
)"
```

Then: `bd update arrowz-kkey.2 --external-ref gh-<N> --add-label pr --set-metadata pr=<N> --set-metadata url=<url>`.

---

## Self-Review

1. **Spec coverage (PR 2 row of §6 and what it touches):** the page (§1.1, §1.2: The puzzle · The one rule · What the generator promises · Words — Task 4); `::play` and the three rule boards (§4.5 — Task 3: coloured, `play` mode, the two event lines, Start over calling `restart()`, the gesture left to the element); `/docs` → `/docs/arrowz` and an unknown name to it (§1.1 — Tasks 2, 4); the column built from the pages with the page name `docsArrowz` (§3.3 — Tasks 2, 4); the palette's "Docs — Arrowz" go-to row (§3.3 — Tasks 2, 4; "Docs — Lab" is PR 3's); the content guard's items 1–6 and 8 for `board` (§5.1 — Tasks 1, 3, 4); the glossary over the new Markdown (§5.2 — automatic, the guard reads the directory; Task 4 Step 8 mutates it); the README's screens and palette tables and the `docs` screenshot (§5.3 — Tasks 4, 5); browser tests of the renderer's new directive and of a rule board (§5.4 — Task 3). Left out on purpose: the README's two board pictures (hero, tiny-colorized) need `::board`, which is PR 4's — Task 5 Step 6 writes that into PR 4's bead. The README's links out (the engine README) are replaced by the promises themselves, written out on the page.
2. **Placeholder scan:** the PR body's "Jev:" line and `<N>` are filled at run time from Task 5's output, by design; no other placeholder.
3. **Type consistency:** `RuleBoardName` is the one name type for `RULE_BOARDS`, `RulePlay`'s prop, `NAMES` and `DIRECTIVES.play.board`; `isRuleBoard` takes `unknown` because directive attributes are `string | null | undefined`. `DOCS_PAGE_NAMES` is `as const satisfies Record<DocsPage, UiKey>`, so `dict.t(DOCS_PAGE_NAMES[page])` resolves to string-valued keys with no arguments. `pageOf` moves from `DocsNav.tsx` to `pages.ts`; Task 2 Step 3 points its importers there.
4. **Checked against the files, 2026-10-05:** `BoardCanvas`'s events (`onPieceRemoved`, `onLifeLost`) and its use with `ref`, `play`, `enableColors`, `showPoints`, `pad`, `lang` (`BoardFrame.tsx`); `restart()`, `saveState().removed`, `gestureMode`, `colored`, `GESTURE_STORAGE_KEY` (`arrowz-board.ts`, `mod.ts`, `game.ts`); `cells[0]` is the head and an uncarved `-1` cell never blocks (`game.ts`, `scan`); the README pictures' coordinates (`docs/images/rule-*.svg`); the ⌘/Ctrl-click helper (`BoardMode.browser.test.tsx`); `localStorage.clear()` per file only (`vitest.setup.ts`), hence the `afterEach` in `RulePlay.browser.test.tsx`; `.fw-btn`'s touch height (`shell.css`); `goRow(deps, id, name, path)` (`commands.ts`); the tests that name `/docs/element` as the home (`AppRoutes`, `KeepHashNavigate`, `DocsLayout`, `DocsNav`, `commands.test.ts`); `DOCS_SOURCES` and its test file (`jev-docs.ts`, `jev-docs.test.ts`); `pnpm nx run lab:screenshots <shot>` (`apps/lab/README.md`, "Development"). Not yet measured, left to the dry run: `play()`'s bounce `distance` for the blocked board (2 by the reading of `scan`), mdast's `list.spread` on `- a\n\n- b`, and whether the screenshot script settles on a page of WebGL boards.
5. **Jev review of this plan (2026-10-05, jev-1.13.0, citation-check pattern):** 37 claims about the code, each judged against a ±25-line span the script read from disk (not quoted by the plan): none contradicted. The six below 0.8 `supports` were read by hand and hold — C11 `localStorage.clear()` runs once per file in `vitest.setup.ts` (0.46), C13 `pageOf` knows only `cli` and `element` (0.59), C14 the two hand-written go-to rows (0.63), C24 "knob" refused on every page but `cli` (0.55), C27 the palette table compared both ways (0.65), C34 the upright arrow at x=240 in `rule-blocked.svg` (0.75). 22 requirements judged against the whole plan: covered 0.57–0.97; the weakest, R10 (the glossary reads the new page, 0.57) and R14 (no history in the prose, 0.65), are carried by Task 4 Step 8's mutation and Task 5 Step 4's `jev:docs`.
6. **Dry run (2026-10-05, a Sonnet subagent executing Tasks 1–5 in a detached worktree from `1224d26`):** every gate passed in the end (`deno task verify` 670; `pnpm nx run-many -t verify`; lab 1664 tests in 133 files). Measured: the bounce is `{ kind: 'bounce', pieceId: 0, distance: 2, blockerId: 2 }`; mdast gives `list.spread` true for `- a\n\n- b` but false with items `[true, false]` for `- one\n\n  two\n- three`, so `ListView` needs both; the build defines the element only in the entry chunk and `fw-docs-play` lives only in `DocsBody-*.js`; lint is clean apart from the existing `CommandPalette.tsx` warning; Prettier leaves the pages alone. Fixed in this revision: "zwycięską" holds the retired `wycię` (PL glossary); the line after a removal is polled, not read at once; `openDocs` clicks inside the column (the page's own "Command line" link made the locator ambiguous) and its marker lookup is `as const`; `DocsNav`'s fragment test selected the CLI page as `li:last-child`; the wrapped sentence in `jev-guards.md`; the board-spread mutation the React Compiler memoized away; the docs screenshot, whose rule boards fell below the fold.
