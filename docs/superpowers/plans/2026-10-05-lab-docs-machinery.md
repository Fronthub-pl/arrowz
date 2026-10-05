# Lab docs machinery (PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The lab's Docs tab renders its two existing pages (Board element, Command line) from Markdown files in both languages, through a parser, a renderer and guards that the next four PRs build on — with no visible change beyond the glossary fixes and code spans in descriptions.

**Architecture:** Markdown with directives lives in `apps/lab/docs-content/{en,pl}/*.md`, imported `?raw` and parsed once to mdast (`mdast-util-from-markdown` + directive and GFM table extensions). A React renderer of our own walks the tree; `::table` and `::help` directives render the existing reference tables and `helpText()`. The navigation column is derived from the pages' `##` headings. The parser and pages load as a lazy chunk inside an eager panel, so the tab strip's wiring is unchanged.

**Tech Stack:** React 19, react-router 8, Vite 8, Vitest 5 (node + chromium projects), mdast-util-from-markdown 2.1, micromark-extension-directive 4, mdast-util-directive 3.1, micromark-extension-gfm-table 2.1, mdast-util-gfm-table 2.0; Deno 2.9 for the engine guards.

**Spec:** `docs/superpowers/specs/2026-10-05-lab-docs-from-readmes-design.md` (PR 1 of §6). Bead `arrowz-kkey.1`.

## Global Constraints

- Everything in the repository is in English; the Markdown in `docs-content/pl/` is the only Polish, plus `lab-docs.ts`'s PL table.
- No `any`, no non-null assertions (`@typescript-eslint/no-explicit-any`, `no-non-null-assertion`).
- Comments: non-header blocks ≤ 6 lines, module/API headers ≤ 24 lines; cite symbols, never `file.ts:NN`; no PR or history references (`comments.test.ts` walks `apps/lab/src` and `packages/engine`).
- `lab-docs.ts` prose must not end a sentence with `document`, `window`, `process` or `Deno`, nor name the browser's key-value store by its API name (`neutral.test.ts`).
- The glossary: arrow, arrowhead, background, arrow colour, dot grid, lay/make (not carve); PL strzałka, grot, tło, kolor strzałek, siatka kropek, układać.
- Headings: `#` → `h2` (page title, first node), `##` → `h3` with `{#id}` → DOM id `docs-<id>`, `###` → `h4`; deeper is refused.
- A literal `<` in prose is `\<`; a colon followed by a letter or digit is `\:`.
- Machine columns are not translated; descriptions are, and live in `lab-docs.ts`.
- `apps/lab` reads the engine from `packages/engine/dist/`: after editing `packages/engine/*.ts`, run `pnpm nx build engine` before any lab test.
- On a fresh worktree run `pnpm install && pnpm nx build engine && pnpm nx build board-element` once before `pnpm run check` in `apps/lab`.
- Prettier (`printWidth: 120`, no semicolons, single quotes) checks everything in `apps/lab`, the new `.md` files included: run `pnpm exec prettier --write <files>` from `apps/lab` before each commit.
- Mutations: commit first, mutate, run, and undo by hand (or with the inverse `sed`) — never `git checkout` a file with uncommitted work.

## Review Focus

1. **A colon in prose silently becomes a directive.** `At 10:30` parses as text `At 10` + a text directive named `30` (measured, micromark-extension-directive 4.0.0); the reader would see "At 10." — `problemsOf` refuses `textDirective` (Task 2), `markdown.test.ts` pins the parse (Task 1), and `content.test.ts` runs every page and every description through it (Task 6).
2. **A description that is not plain inline Markdown** (a `*`, a `<`, a colon) renders differently from the string in `lab-docs.ts` once descriptions go through the parser — `content.test.ts` checks every description's node types (Task 6).
3. **The lazy chunk's first load on a cold optimizer** reloads the page mid-session in dev and kills the browser test run in CI (the mechanism `vitest.config.ts` records for `react-dom/client`) — `DOCS_DEPS` goes into both `optimizeDeps.include` lists (Task 1), and Task 8 runs the chromium project once with `node_modules/.vite` deleted.
4. **A `docs:` link to a section that does not exist** (renamed `{#id}`, or a page name typo) — `problemsOf` checks the scheme and page, `content.test.ts` checks the section exists in both languages (Tasks 2, 6).
5. **An address opened straight on `/docs/cli` reads the panel before the chunk arrives** — the `main` and `section#docs-panel` stay eager (Task 7), so `AppRoutes.browser.test.tsx`, which reads the panel synchronously after `render`, keeps passing unchanged; `LayoutInvariants` waits for the column before auditing the docs state (Task 7).

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/lab/docs-content/{en,pl}/element.md`, `cli.md` | The two pages' prose and directives (Task 6). |
| `apps/lab/src/docs/pages.ts` | The page names and the DOM id prefix; light, imported eagerly by the route. |
| `apps/lab/src/docs/markdown.ts` | `parseDocs`, section ids, `sectionsOf`, `plainText`, `inlineOf`, `DOCS_LINK`. |
| `apps/lab/src/docs/shape.ts` | `problemsOf` (what the renderer accepts) and `shapeOf` (what EN and PL share). |
| `apps/lab/src/docs/content.ts` | The pages imported `?raw`, parsed once per language; `docsPage`, `SOURCES`. |
| `apps/lab/src/docs/Inline.tsx` | Phrasing content and `docs:` links; `InlineMarkdown` for descriptions. |
| `apps/lab/src/docs/DocsTable.tsx` | The four element reference tables (moved out of `ElementDocs.tsx`). |
| `apps/lab/src/docs/DocsMarkdown.tsx` | The block renderer: headings, paragraphs, code, lists, tables, the note, directives. |
| `apps/lab/src/docs/DocsPageView.tsx` | A page in the language on screen. |
| `apps/lab/src/docs/codeTokens.ts` | Gains `highlightSh` and `highlightJson`. |
| `apps/lab/src/routes/DocsBody.tsx` | The lazy chunk's root: column + page, and the section in view. |
| `apps/lab/src/routes/DocsRoute.tsx` | Eager: validates the page, renders `main` + panel, suspends the body. |
| `apps/lab/src/routes/DocsNav.tsx` | Sections from the parsed pages instead of `DOCS_SECTIONS`. |
| `apps/lab/src/routes/useSectionInView.ts` | Takes the sections, not a page name. |
| `packages/engine/lab-docs.ts` | Keeps descriptions, column names and `infoLabel`; loses the prose that moved. |
| `packages/engine/glossary.test.ts` | Gains the element descriptions and the Markdown pages. |
| Deleted | `routes/ElementDocs.tsx`, `routes/CliDocs.tsx`, `docs/elementExample.ts` and the two tests of the first two (replaced by `docs/ElementPage.browser.test.tsx`, `docs/CliPage.browser.test.tsx`). |

---

### Task 1: Dependencies, page names and the parser

**Files:**
- Modify: `apps/lab/package.json` (via pnpm), `pnpm-lock.yaml`
- Modify: `apps/lab/vite.config.ts`, `apps/lab/vitest.config.ts`
- Create: `apps/lab/src/docs/pages.ts`, `apps/lab/src/docs/markdown.ts`
- Test: `apps/lab/src/docs/markdown.test.ts`

**Interfaces:**
- Produces: `DOCS_PAGES`, `type DocsPage = 'element' | 'cli'`, `isDocsPage(what: string | undefined): what is DocsPage`, `SECTION_PREFIX = 'docs-'` (pages.ts); `interface DocsSection { readonly id: string; readonly title: string }`, `parseDocs(markdown: string): Root`, `sectionIdOf(heading: Heading): string | undefined`, `sectionsOf(root: Root): DocsSection[]`, `plainText(nodes: readonly PhrasingContent[]): string`, `inlineOf(text: string): PhrasingContent[]`, `DOCS_LINK: RegExp` (markdown.ts); `DOCS_DEPS: string[]` (vite.config.ts).

- [ ] **Step 0: Branch and bead**

```bash
git branch -m docs/lab-docs-spec lab/docs-machinery
bd update arrowz-kkey.1 --claim --set-metadata branch=lab/docs-machinery \
  --set-metadata plan=lab/docs-machinery:docs/superpowers/plans/2026-10-05-lab-docs-machinery.md
bd update arrowz-kkey --set-metadata branch=lab/docs-machinery
pnpm install && pnpm nx build engine && pnpm nx build board-element
```

- [ ] **Step 1: Add the dependencies**

From the repository root:

```bash
pnpm --filter @arrowz/lab add mdast-util-from-markdown@^2.1.0 micromark-extension-directive@^4.0.0 \
  mdast-util-directive@^3.1.1 micromark-extension-gfm-table@^2.1.2 mdast-util-gfm-table@^2.0.0
pnpm --filter @arrowz/lab add -D @types/mdast@^4.0.4
```

Expected: `apps/lab/package.json` lists the five under `dependencies` and `@types/mdast` under `devDependencies`; `pnpm-lock.yaml` changes.

- [ ] **Step 2: Write the failing test**

Create `apps/lab/src/docs/markdown.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { inlineOf, parseDocs, plainText, sectionIdOf, sectionsOf } from './markdown'
import { isDocsPage } from './pages'

describe('a page', () => {
  const root = parseDocs('# Title\n\n## Using it {#example}\n\nText.\n\n### Detail\n\n## Slots {#slots}\n')

  test('a ## heading gives up its {#id}, and the reader never sees it', () => {
    const headings = root.children.filter((node) => node.type === 'heading')
    expect(headings.map((h) => plainText(h.children))).toEqual(['Title', 'Using it', 'Detail', 'Slots'])
    expect(headings.map((h) => sectionIdOf(h))).toEqual([undefined, 'example', undefined, 'slots'])
  })

  test('the sections are the ## headings, by DOM id and title', () => {
    expect(sectionsOf(root)).toEqual([
      { id: 'docs-example', title: 'Using it' },
      { id: 'docs-slots', title: 'Slots' },
    ])
  })

  test('directives and tables parse', () => {
    const page = parseDocs('::table{of="element-props"}\n\n| a | b |\n|---|---|\n| 1 | 2 |\n')
    expect(page.children.map((node) => node.type)).toEqual(['leafDirective', 'table'])
  })
})

// Why prose writes `\:` and `\<`: unescaped, both parse as something the
// renderer does not show, and the words go missing.
describe('the two escapes', () => {
  const types = (markdown: string) => {
    const first = parseDocs(markdown).children[0]
    return first?.type === 'paragraph' ? first.children.map((node) => node.type) : []
  }

  test('a colon before a digit is a text directive unless escaped', () => {
    expect(types('At 10:30 sharp.')).toContain('textDirective')
    expect(types('At 10\\:30 sharp.')).toEqual(['text'])
  })

  test('a tag is raw HTML unless escaped', () => {
    expect(types('The <arrowz-board> element.')).toContain('html')
    expect(types('The \\<arrowz-board> element.')).toEqual(['text'])
  })
})

test('a description is one line of inline Markdown', () => {
  expect(inlineOf('`pl` selects *Polish*').map((node) => node.type)).toEqual(['inlineCode', 'text', 'emphasis'])
  expect(plainText(inlineOf('`pl` selects *Polish*'))).toBe('pl selects Polish')
})

test('a page name is one of the pages, case and all', () => {
  expect(isDocsPage('cli')).toBe(true)
  expect(isDocsPage('CLI')).toBe(false)
  expect(isDocsPage(undefined)).toBe(false)
})
```

- [ ] **Step 3: Run it to see it fail**

Run: `cd apps/lab && pnpm exec vitest run --project node src/docs/markdown.test.ts`
Expected: FAIL — `Failed to resolve import "./markdown"`.

- [ ] **Step 4: Write `pages.ts`**

```ts
/**
 * The documentation's pages, in the column's order, and the prefix their
 * section ids take in the DOM. Light on purpose: the route imports it eagerly,
 * while the parser and the pages load as a chunk of their own (`DocsRoute`).
 */
export const DOCS_PAGES = ['element', 'cli'] as const

export type DocsPage = (typeof DOCS_PAGES)[number]

export function isDocsPage(what: string | undefined): what is DocsPage {
  return DOCS_PAGES.some((page) => page === what)
}

/** The panel shares the document with the lab's own ids, so a section's `{#id}` is prefixed. */
export const SECTION_PREFIX = 'docs-'
```

- [ ] **Step 5: Write `markdown.ts`**

```ts
/**
 * The documentation's Markdown: CommonMark with GFM tables and directives
 * (`::name[label]{attrs}`, `:::name … :::`), parsed to mdast. A `##` heading
 * names its section with a trailing `{#id}`, which the parse takes off the
 * heading's text; `sectionIdOf` reads it back. What a page may contain is
 * `shape.ts`; how it is drawn is `DocsMarkdown.tsx`.
 */
import type { Heading, PhrasingContent, Root } from 'mdast'
import { directiveFromMarkdown } from 'mdast-util-directive'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmTableFromMarkdown } from 'mdast-util-gfm-table'
import { directive } from 'micromark-extension-directive'
import { gfmTable } from 'micromark-extension-gfm-table'
import { SECTION_PREFIX } from './pages'

export interface DocsSection {
  /** The heading's DOM id: its `{#id}` behind SECTION_PREFIX. */
  readonly id: string
  readonly title: string
}

/** A link to a section of a page: `docs:<page>#<id>`. */
export const DOCS_LINK = /^docs:([a-z]+)#([a-z][a-z0-9-]*)$/

const ID_SUFFIX = /\s*\{#([a-z][a-z0-9-]*)\}$/

// Beside the tree rather than in `heading.data`: mdast's `data` is typed for
// its own utilities, and widening it would mean augmenting the module.
const ids = new WeakMap<Heading, string>()

export function parseDocs(markdown: string): Root {
  const root = fromMarkdown(markdown, {
    extensions: [directive(), gfmTable()],
    mdastExtensions: [directiveFromMarkdown(), gfmTableFromMarkdown()],
  })
  for (const node of root.children) {
    if (node.type !== 'heading') continue
    const last = node.children.at(-1)
    if (last?.type !== 'text') continue
    const m = ID_SUFFIX.exec(last.value)
    if (m?.[1] === undefined) continue
    last.value = last.value.slice(0, m.index)
    ids.set(node, m[1])
  }
  return root
}

/** The `{#id}` a heading carried, without SECTION_PREFIX. */
export function sectionIdOf(heading: Heading): string | undefined {
  return ids.get(heading)
}

/** What a reader sees of phrasing content: the text and the code spans, without the markup. */
export function plainText(nodes: readonly PhrasingContent[]): string {
  return nodes
    .map((node) => ('value' in node ? node.value : 'children' in node ? plainText(node.children) : ''))
    .join('')
}

export function sectionsOf(root: Root): DocsSection[] {
  const out: DocsSection[] = []
  for (const node of root.children) {
    if (node.type !== 'heading' || node.depth !== 2) continue
    const id = sectionIdOf(node)
    if (id !== undefined) out.push({ id: SECTION_PREFIX + id, title: plainText(node.children) })
  }
  return out
}

/** One line of inline Markdown as phrasing: how a reference table's description is written. */
export function inlineOf(text: string): PhrasingContent[] {
  const first = parseDocs(text).children[0]
  return first?.type === 'paragraph' ? first.children : [{ type: 'text', value: text }]
}
```

- [ ] **Step 6: Run the test to see it pass**

Run: `cd apps/lab && pnpm exec vitest run --project node src/docs/markdown.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7: Name the new packages for the optimizer**

In `apps/lab/vite.config.ts`, after `reactPlugins()`, add:

```ts
// The docs' parser loads with the Docs tab's own chunk (`DocsRoute`). Named, so
// a cold optimizer bundles it on the first pass instead of discovering it on
// the first visit and reloading the page (see the chromium project in
// vitest.config.ts for what that reload does to a test run).
export const DOCS_DEPS = [
  'mdast-util-from-markdown',
  'micromark-extension-directive',
  'mdast-util-directive',
  'micromark-extension-gfm-table',
  'mdast-util-gfm-table',
]
```

and in its `defineConfig({ … })` add the line `optimizeDeps: { include: DOCS_DEPS },` after `build: { target: 'es2022' },`.

In `apps/lab/vitest.config.ts`, change the import to `import { DOCS_DEPS, ISOLATION, reactPlugins } from './vite.config.ts'` and the chromium project's line to:

```ts
        optimizeDeps: { include: ['react-dom/client', 'zustand/react/shallow', ...DOCS_DEPS] },
```

- [ ] **Step 8: Gates and commit**

```bash
cd apps/lab && pnpm exec prettier --write src/docs/pages.ts src/docs/markdown.ts src/docs/markdown.test.ts vite.config.ts vitest.config.ts
pnpm run check && pnpm run lint
git add package.json ../../pnpm-lock.yaml vite.config.ts vitest.config.ts src/docs/pages.ts src/docs/markdown.ts src/docs/markdown.test.ts
git commit -m "lab: parse the docs' Markdown, with directives, tables and section ids"
```

Expected: `check` and `lint` print no errors.

---

### Task 2: What a page may contain, and what both languages share

**Files:**
- Create: `apps/lab/src/docs/shape.ts`
- Test: `apps/lab/src/docs/shape.test.ts`

**Interfaces:**
- Consumes: `parseDocs`, `sectionIdOf`, `DOCS_LINK` (Task 1).
- Produces: `DIRECTIVES: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>`, `CODE_LANGS: readonly string[]`, `problemsOf(root: Root, pages: readonly string[]): string[]`, `shapeOf(root: Root): string[]`.

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/docs/shape.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { parseDocs } from './markdown'
import { problemsOf, shapeOf } from './shape'

const PAGES = ['element', 'cli']
const problems = (markdown: string) => problemsOf(parseDocs(markdown), PAGES)

describe('problemsOf', () => {
  test('a page the renderer can show has none', () => {
    const ok = [
      '# Title',
      'Lead with `code`, *em*, **strong** and [a link](docs:cli#knobs) and [out](https://example.com).',
      '> A note.',
      '## Part {#part}',
      '### Detail',
      '- one\n- two',
      '| a | b |\n|---|---|\n| 1 | 2 |',
      '```sh\ndeno task carve --width=4\n```',
      '::table{of="element-props"}',
      '::help{form="knobs"}',
    ].join('\n\n')
    expect(problems(ok)).toEqual([])
  })

  test.each([
    ['raw HTML', '# T\n\nThe <b>bold</b> way.', 'html is not shown'],
    ['a text directive', '# T\n\nAt 10:30 sharp.', 'textDirective is not shown'],
    ['a ## without an id', '# T\n\n## Part', '## needs a {#id}'],
    ['an id on a ###', '# T\n\n### Part {#part}', 'only ## carries a {#id}'],
    ['an id twice', '# T\n\n## A {#a}\n\n## B {#a}', '{#a} twice'],
    ['a heading too deep', '# T\n\n#### Deep', 'deeper than ###'],
    ['a second title', '# T\n\n# U', '# is the page title'],
    ['no title', 'Text.', 'opens with its # title'],
    ['code without a language', '# T\n\n```\nx\n```', 'code needs one of'],
    ['a link to an unknown page', '# T\n\n[x](docs:nowhere#a)', 'is neither'],
    ['a relative link', '# T\n\n[x](cli.md)', 'is neither'],
    ['an unknown directive', '# T\n\n::video{src="x"}', '::video is not a docs directive'],
    ['an unknown attribute', '# T\n\n::table{of="element-props" wide}', '::table takes no wide'],
    ['an unknown value', '# T\n\n::table{of="knobs"}', 'of="knobs" is not one of'],
    ['a missing attribute', '# T\n\n::help', '::help needs form'],
    ['a label', '# T\n\n::help[Help]{form="short"}', '::help takes no label'],
    ['a block in a note', '# T\n\n> - a list', 'a note holds paragraphs only'],
  ])('refuses %s', (_, markdown, message) => {
    expect(problems(markdown).join('\n')).toContain(message)
  })
})

describe('shapeOf', () => {
  test('a translation has the same shape', () => {
    const en = '# Board\n\nLead.\n\n## Using it {#example}\n\n```sh\n# make one\ndeno task carve --width=4  # small\n```\n\n::table{of="element-props"}\n\nSee [the knobs](docs:cli#knobs).'
    const pl = '# Plansza\n\nWstęp.\n\n## Jak użyć {#example}\n\n```sh\n# zrób jedną\ndeno task carve --width=4  # mała\n```\n\n::table{of="element-props"}\n\nZobacz [pokrętła](docs:cli#knobs).'
    expect(shapeOf(parseDocs(pl))).toEqual(shapeOf(parseDocs(en)))
  })

  test.each([
    ['another id', '## A {#a}', '## A {#b}'],
    ['another directive value', '::table{of="element-props"}', '::table{of="element-slots"}'],
    ['another command', '```sh\ndeno task carve --width=4\n```', '```sh\ndeno task carve --width=5\n```'],
    ['another link target', '[x](docs:cli#a)', '[x](docs:cli#b)'],
    ['a missing note', '> Note.\n\nText.', 'Text.'],
    ['another table size', '| a |\n|---|\n| 1 |', '| a |\n|---|\n| 1 |\n| 2 |'],
  ])('tells %s apart', (_, a, b) => {
    expect(shapeOf(parseDocs(`# T\n\n${a}`))).not.toEqual(shapeOf(parseDocs(`# T\n\n${b}`)))
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/lab && pnpm exec vitest run --project node src/docs/shape.test.ts`
Expected: FAIL — `Failed to resolve import "./shape"`.

- [ ] **Step 3: Write `shape.ts`**

```ts
/**
 * The rules a documentation page keeps, as data a test can compare.
 * `problemsOf` lists what the renderer would not show (`DocsMarkdown.tsx`
 * handles exactly these node types); `shapeOf` is a page with its prose taken
 * out, which both languages must share. `content.test.ts` runs both over every
 * page.
 */
import type { Nodes, Root } from 'mdast'
import type { LeafDirective } from 'mdast-util-directive'
import { DOCS_LINK, sectionIdOf } from './markdown'

/** Each directive by name, and the values each of its attributes may take. */
export const DIRECTIVES: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  table: { of: ['element-props', 'element-members', 'element-events', 'element-slots'] },
  help: { form: ['short', 'knobs'] },
}

/** Fenced code is coloured as its language; `text` is a terminal's output and stays plain. */
export const CODE_LANGS: readonly string[] = ['html', 'sh', 'json', 'text']

const SHOWN = new Set([
  'root',
  'heading',
  'paragraph',
  'text',
  'emphasis',
  'strong',
  'inlineCode',
  'code',
  'list',
  'listItem',
  'table',
  'tableRow',
  'tableCell',
  'link',
  'break',
  'blockquote',
  'leafDirective',
])

function directiveProblems(node: LeafDirective, at: string): string[] {
  const allowed = DIRECTIVES[node.name]
  if (allowed === undefined) return [`${at}: ::${node.name} is not a docs directive`]
  const out: string[] = []
  const attributes = node.attributes ?? {}
  for (const [key, value] of Object.entries(attributes)) {
    const values = allowed[key]
    if (values === undefined) out.push(`${at}: ::${node.name} takes no ${key}`)
    else if (!values.includes(value ?? '')) out.push(`${at}: ${key}="${value ?? ''}" is not one of ${values.join(', ')}`)
  }
  for (const key of Object.keys(allowed)) if (!(key in attributes)) out.push(`${at}: ::${node.name} needs ${key}`)
  if (node.children.length > 0) out.push(`${at}: ::${node.name} takes no label`)
  return out
}

/** What in this page the renderer would not show, one message per finding; none is a page that ships. */
export function problemsOf(root: Root, pages: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const walk = (node: Nodes): void => {
    const at = `line ${node.position?.start.line ?? '?'}`
    if (!SHOWN.has(node.type)) out.push(`${at}: ${node.type} is not shown by the docs renderer`)
    if (node.type === 'heading') {
      const id = sectionIdOf(node)
      if (node.depth > 3) out.push(`${at}: a heading deeper than ###`)
      if (node.depth === 1 && node !== root.children[0]) out.push(`${at}: # is the page title and comes first`)
      if (node.depth === 2 && id === undefined) out.push(`${at}: ## needs a {#id}`)
      if (node.depth !== 2 && id !== undefined) out.push(`${at}: only ## carries a {#id}`)
      if (id !== undefined && seen.has(id)) out.push(`${at}: {#${id}} twice`)
      if (id !== undefined) seen.add(id)
    }
    if (node.type === 'code' && !CODE_LANGS.includes(node.lang ?? ''))
      out.push(`${at}: code needs one of ${CODE_LANGS.join(', ')}`)
    if (node.type === 'link' && !node.url.startsWith('https://')) {
      const page = DOCS_LINK.exec(node.url)?.[1]
      if (page === undefined || !pages.includes(page))
        out.push(`${at}: ${node.url} is neither docs:<page>#<section> nor https://`)
    }
    if (node.type === 'blockquote' && !node.children.every((child) => child.type === 'paragraph'))
      out.push(`${at}: a note holds paragraphs only`)
    if (node.type === 'listItem' && !node.children.every((child) => child.type === 'paragraph' || child.type === 'list'))
      out.push(`${at}: a list item holds paragraphs and lists only`)
    if (node.type === 'leafDirective') out.push(...directiveProblems(node, at))
    if ('children' in node) for (const child of node.children) walk(child)
  }
  const first = root.children[0]
  if (first?.type !== 'heading' || first.depth !== 1) out.push('line 1: a page opens with its # title')
  walk(root)
  return out
}

/** A `sh` block without its comments, which are prose and are translated. */
const codeOf = (lang: string | null | undefined, value: string): string =>
  lang === 'sh'
    ? value
        .split('\n')
        .map((line) => line.replace(/(^|\s+)#.*$/, ''))
        .join('\n')
    : value

const attributesOf = (attributes: LeafDirective['attributes']): string =>
  Object.entries(attributes ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value ?? ''}`)
    .join(' ')

/** A page with its prose taken out: headings, code, directives, links, notes, tables and lists. */
export function shapeOf(root: Root): string[] {
  const out: string[] = []
  const walk = (node: Nodes): void => {
    if (node.type === 'heading') out.push(node.depth === 2 ? `## {#${sectionIdOf(node) ?? ''}}` : '#'.repeat(node.depth))
    if (node.type === 'code') out.push(`code ${node.lang ?? ''}: ${codeOf(node.lang, node.value)}`)
    if (node.type === 'leafDirective') out.push(`::${node.name}{${attributesOf(node.attributes)}}`)
    if (node.type === 'link') out.push(`link ${node.url}`)
    if (node.type === 'blockquote') out.push('note')
    if (node.type === 'list') out.push(`list ${node.children.length}`)
    if (node.type === 'table') out.push(`table ${node.children.length}×${node.children[0]?.children.length ?? 0}`)
    if ('children' in node) for (const child of node.children) walk(child)
  }
  walk(root)
  return out
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `cd apps/lab && pnpm exec vitest run --project node src/docs/shape.test.ts`
Expected: PASS, 1 + 17 + 1 + 6 = 25 tests.

- [ ] **Step 5: Prove the whitelist can fail**

Commit first (Step 6 below without the commit message change is fine: `git add` + commit), then delete `'blockquote',` from `SHOWN`, rerun. Expected: FAIL in `a page the renderer can show has none` (the `> A note.` line reports `blockquote is not shown`). Put the line back by hand and rerun: PASS.

- [ ] **Step 6: Gates and commit**

```bash
cd apps/lab && pnpm exec prettier --write src/docs/shape.ts src/docs/shape.test.ts
pnpm run check && pnpm run lint
git add src/docs/shape.ts src/docs/shape.test.ts
git commit -m "lab: state what a docs page may contain and what its translation shares"
```

---

### Task 3: Shell and JSON colours

**Files:**
- Modify: `apps/lab/src/docs/codeTokens.ts` (append after `highlightHtml`)
- Test: `apps/lab/src/docs/codeTokens.test.ts` (append two `describe` blocks)

**Interfaces:**
- Consumes: the module's `push`, `CodeToken`, `TokenClass`.
- Produces: `highlightSh(code: string): CodeToken[]`, `highlightJson(code: string): CodeToken[]`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/lab/src/docs/codeTokens.test.ts`, and add `highlightJson, highlightSh` to its import from `./codeTokens`:

```ts
describe('a shell block', () => {
  const SH = 'CARVE_TIMEOUT_S=60 deno task carve --width=1000 --theme=gruvbox-dark --svg   # stops after a minute\n./carve -h'
  const tokens = highlightSh(SH)

  test('reads back exactly as written', () => {
    expect(joined(tokens)).toBe(SH)
  })

  test('colours the variable, the task, the flags, their values and the comment', () => {
    expect(inColour(tokens, 'type')).toEqual(['CARVE_TIMEOUT_S'])
    expect(inColour(tokens, 'fn')).toEqual(['deno task carve'])
    expect(inColour(tokens, 'attr')).toEqual(['--width', '--theme', '--svg', '-h'])
    expect(inColour(tokens, 'num')).toEqual(['60', '1000'])
    expect(inColour(tokens, 'str')).toEqual(['gruvbox-dark'])
    expect(inColour(tokens, 'com')).toEqual(['# stops after a minute'])
  })

  // A colour value starts with `#`, and it is a value, not a comment.
  test('a # inside a value is not a comment', () => {
    expect(inColour(highlightSh('deno task carve --paper=#f6f6fa'), 'com')).toEqual([])
  })
})

describe('a JSON block', () => {
  const JSON_TEXT = '{\n  "W": 30, "ok": true,\n  "pinned": [],\n  "command": "deno task carve --width=30"\n}'
  const tokens = highlightJson(JSON_TEXT)

  test('reads back exactly as written', () => {
    expect(joined(tokens)).toBe(JSON_TEXT)
  })

  test('a key is a property, a value a string or a constant', () => {
    expect(inColour(tokens, 'prop')).toEqual(['"W"', '"ok"', '"pinned"', '"command"'])
    expect(inColour(tokens, 'num')).toEqual(['30', 'true'])
    expect(inColour(tokens, 'str')).toEqual(['"deno task carve --width=30"'])
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/lab && pnpm exec vitest run --project node src/docs/codeTokens.test.ts`
Expected: FAIL — `highlightSh is not a function` (the import is undefined).

- [ ] **Step 3: Append the two scanners to `codeTokens.ts`**

```ts
// Sticky. The groups, in order: a comment, `deno task <name>`, a variable with
// `=` and its value, a flag with an optional `=` and value, a quoted string,
// whitespace, any other word. A token starts where the last one ended, so `#`
// opens a comment only at the start of a word.
const SH_TOKEN =
  /(#.*)|(deno task [a-z]+)|([A-Z_][A-Z0-9_]*)(=)(\S*)|(--?[a-z][\w-]*)(?:(=)(\S*))?|('[^']*'|"[^"]*")|(\s+)|(\S+)/y
const NUMBER = /^-?\d+(?:\.\d+)?$/

const valueClass = (value: string): TokenClass => (NUMBER.test(value) ? 'num' : 'str')

/** Shell lines as the CLI's pages write them. Not a shell parser: commands of one line each. */
export function highlightSh(code: string): CodeToken[] {
  const out: CodeToken[] = []
  let i = 0
  while (i < code.length) {
    SH_TOKEN.lastIndex = i
    const m = SH_TOKEN.exec(code)
    if (m === null) {
      push(out, null, code.charAt(i))
      i++
      continue
    }
    const [all, comment, task, env, envEq = '', envValue = '', flag, flagEq = '', flagValue = '', str] = m
    if (comment !== undefined) push(out, 'com', all)
    else if (task !== undefined) push(out, 'fn', all)
    else if (env !== undefined) {
      push(out, 'type', env)
      push(out, 'pun', envEq)
      push(out, valueClass(envValue), envValue)
    } else if (flag !== undefined) {
      push(out, 'attr', flag)
      push(out, 'pun', flagEq)
      push(out, valueClass(flagValue), flagValue)
    } else if (str !== undefined) push(out, 'str', all)
    else push(out, null, all)
    i += all.length
  }
  return out
}

// The groups, in order: a string and, when a colon follows, the colon that
// makes it a key; a number; a constant; punctuation; whitespace; any other
// character. The last one matches anywhere, so the matches tile the input.
const JSON_TOKEN =
  /("(?:[^"\\\n]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],])|(\s+)|([\s\S])/g

/** JSON as the CLI prints it, in the colours `cellTokens` gives a type's constants. */
export function highlightJson(code: string): CodeToken[] {
  const out: CodeToken[] = []
  for (const m of code.matchAll(JSON_TOKEN)) {
    const [all, str, colon, num, constant, pun] = m
    if (str !== undefined && colon !== undefined) {
      push(out, 'prop', str)
      push(out, null, colon.slice(0, -1))
      push(out, 'pun', ':')
    } else if (str !== undefined) push(out, 'str', str)
    else if (num !== undefined || constant !== undefined) push(out, 'num', all)
    else if (pun !== undefined) push(out, 'pun', all)
    else push(out, null, all)
  }
  return out
}
```

Then update the module header's first sentence in `codeTokens.ts` from "Syntax colours for the documentation: the element page's one example and the machine columns of its three tables" to "Syntax colours for the documentation: its `html`, `sh` and `json` blocks and the machine columns of its reference tables". Read the whole header and keep the rest true: its last paragraph ("two small scanners cover them") becomes "four small scanners cover them".

- [ ] **Step 4: Run them to see them pass**

Run: `cd apps/lab && pnpm exec vitest run --project node src/docs/codeTokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
cd apps/lab && pnpm exec prettier --write src/docs/codeTokens.ts src/docs/codeTokens.test.ts
pnpm run check && pnpm run lint
git add src/docs/codeTokens.ts src/docs/codeTokens.test.ts
git commit -m "lab: colour shell and JSON blocks in the docs"
```

---

### Task 4: The element descriptions speak the glossary

**Files:**
- Modify: `packages/engine/lab-docs.ts` (the `EN` and `PL` objects' `props`, `members`, `events` only)
- Modify: `packages/engine/glossary.test.ts`

**Interfaces:**
- Produces (glossary.test.ts, module-private): `PL_ELEMENT`, `PL_KNOB`, `PL_ELEMENTS`, `plFor(page: string): RegExp[]`, `withoutCode(text: string): string` — Task 6 uses `plFor` and `withoutCode`.

- [ ] **Step 1: Write the failing test**

In `packages/engine/glossary.test.ts`:

1. Add `import { docsFor } from './lab-docs.ts'` beside the other imports.
2. Above `const PL_RETIRED = [`, add:

```ts
// Named, so a docs page can lift the one that is the right word there (`plFor`).
const PL_ELEMENT = /\belement(?:y|u|ów|em|ami|ach|ie|owi)?\b/i
const PL_KNOB = /pokrętł/i
```

3. In `PL_RETIRED`, replace the entry `/\belement(?:y|u|ów|em|ami|ach|ie|owi)?\b/i,` with `PL_ELEMENT,` and the entry `/pokrętł/i,` with `PL_KNOB,`.
4. After the `ALLOWED` table, add:

```ts
/** The arrows' old Polish name, in the plural forms the component's name never takes. */
const PL_ELEMENTS = /\belement(?:y|ów|om|ami|ach)\b/i

/**
 * The Polish list for one docs page. On the CLI page "pokrętło" is the CLI's
 * own word, as in `ui.cmdPlaceholder`; on the element page the singular
 * "element" names the component, as `ui.docsElement` does.
 */
function plFor(page: string): RegExp[] {
  const lifted = page === 'cli' ? PL_KNOB : page === 'element' ? PL_ELEMENT : null
  return [...PL_RETIRED.filter((re) => re !== lifted), ...(page === 'element' ? [PL_ELEMENTS] : [])]
}

/** Code spans blanked: a key or a flag in backticks is code, not a word. */
const withoutCode = (text: string): string => text.replace(/`[^`]*`/g, ' ')

/** The element's reference descriptions, the rows of the Docs tab's tables. */
function docsRows(lang: 'en' | 'pl'): [string, string][] {
  const docs = docsFor(lang)
  return [
    ...leaves(docs.props, `${lang}.props`, []),
    ...leaves(docs.members, `${lang}.members`, []),
    ...leaves(docs.events, `${lang}.events`, []),
    ...leaves(docs.slots, `${lang}.slots`, []),
  ].map(([path, text]): [string, string] => [path, withoutCode(text)])
}
```

5. At the end of the file, add:

```ts
Deno.test('the element reference descriptions use no retired word', () => {
  refuse(docsRows('en'), [...EN_RETIRED, LAB_ONLY_KNOB, LAB_ONLY_FLAG])
  refuse(docsRows('pl'), [...plFor('element'), LAB_ONLY_FLAG])
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `deno test --allow-read packages/engine/glossary.test.ts`
Expected: FAIL in `the element reference descriptions use no retired word` with `en.props.view uses a retired word (/\bpaper\b/i)` (the first EN row to break a rule, measured 2026-10-05).

- [ ] **Step 3: Reword the descriptions**

In `packages/engine/lab-docs.ts`, replace these values exactly (everything else in `EN` and `PL` stays as it is):

`EN.props`:
```ts
    view: 'Drawing options merged over the CLI defaults: stroke, arrowhead size, rounding, colour, highlight and background.',
    interactive: 'Reports clicks on arrows without playing them.',
    play: 'Runs the reducer: a free arrow rides out, a blocked one bounces. Implies interactivity.',
    showPoints: 'Draws one dot per cell under the arrows, like the ruling of a notebook page.',
    pointColor: 'Colour of the dot grid.',
    pointRadius: 'Radius of the dots in the dot grid, in cells.',
    theme:
      'Name of a built-in theme: background, arrow colour, highlight and the multicolour palette. An empty name selects none, and anything stated in `view` wins over it.',
```

`EN.members`:
```ts
    pieceCount: "How many arrows the layer is drawing; the board's own count, not the number of nodes.",
    animateExit: 'Rides the arrow off the board along a direction and removes it; resolves when the ride ends.',
    shake: 'Nudges the arrow a distance down its own track and back.',
    restart: 'Drops the game and puts every arrow back.',
```

`EN.events`:
```ts
    'piece-click': 'An arrow was clicked, while interactive or playing.',
    'piece-removed': 'A free arrow started its ride off the board.',
    'life-lost': 'A blocked arrow started its bounce against the arrow that stops it.',
    'finished': 'The last arrow finished its ride.',
```

`PL.props`:
```ts
    interactive: 'Zgłasza kliknięcia w strzałki, ale ich nie rozgrywa.',
    play: 'Uruchamia reduktor: wolna strzałka wyjeżdża, zablokowana się odbija. Włącza też interaktywność.',
    showPoints: 'Rysuje po kropce na komórkę pod strzałkami, jak linie w zeszycie.',
    pointColor: 'Kolor siatki kropek.',
    pointRadius: 'Promień kropek w siatce kropek, w komórkach.',
    theme:
      'Nazwa wbudowanego motywu: tło, kolor strzałek, wyróżnienie i paleta wielobarwna. Pusta nazwa nie wybiera żadnego, a to, co podano w `view`, ma pierwszeństwo.',
```

`PL.members`:
```ts
    pieceCount: 'Ile strzałek rysuje warstwa; licznik samej planszy, nie liczba węzłów.',
    animateExit: 'Wyprowadza strzałkę z planszy w zadanym kierunku i usuwa ją; kończy się wraz z przejazdem.',
    shake: 'Popycha strzałkę o zadany dystans po jej własnym torze i z powrotem.',
    restart: 'Porzuca grę i przywraca wszystkie strzałki na miejsca.',
```

`PL.events`:
```ts
    'piece-click': 'Kliknięto strzałkę, w trybie interaktywnym albo w grze.',
    'piece-removed': 'Wolna strzałka ruszyła w drogę poza planszę.',
    'life-lost': 'Zablokowana strzałka odbiła się od tej, która ją zatrzymała.',
    'finished': 'Ostatnia strzałka zakończyła przejazd.',
```

The PL rows that keep "element" in the singular — `enableColors`, `emit`, `slots.colors`, `slots.gestures` — name the component and stay.

- [ ] **Step 4: Run the engine tests**

Run: `deno test --allow-read packages/engine/glossary.test.ts packages/engine/lab-docs.test.ts packages/engine/neutral.test.ts`
Expected: PASS. Then `deno task verify` from the root: PASS.

- [ ] **Step 5: Prove the plural guard holds**

After committing (Step 6), change `PL.members.restart` to `'Porzuca grę i przywraca wszystkie elementy na miejsca.'`, rerun Step 4's first command. Expected: FAIL naming `pl.members.restart` and `/\belement(?:y|ów|om|ami|ach)\b/i`. Undo by hand, rerun: PASS.

- [ ] **Step 6: Build and commit**

```bash
pnpm nx build engine
git add packages/engine/lab-docs.ts packages/engine/glossary.test.ts
git commit -m "engine: the element's reference descriptions speak the glossary, and a guard keeps them to it"
```

---

### Task 5: The renderer

**Files:**
- Create: `apps/lab/src/docs/Inline.tsx`, `apps/lab/src/docs/DocsTable.tsx`, `apps/lab/src/docs/DocsMarkdown.tsx`
- Modify: `apps/lab/src/design/docs.css` (one rule, see Step 6)
- Test: `apps/lab/src/docs/DocsMarkdown.browser.test.tsx`

**Interfaces:**
- Consumes: `parseDocs`, `sectionIdOf`, `plainText`, `inlineOf`, `DOCS_LINK`, `DocsSection` (Task 1); `SECTION_PREFIX` (Task 1); `highlightHtml`, `highlightSh`, `highlightJson`, `cellTokens`, `CellRole`, `CodeToken` (Task 3 and existing); `DocsBlock` (`routes/DocsBlock.tsx`, props `kind: 'code' | 'term'`, `section: string`, `text: string`, `children`); `TokenSpans`; `useDocs`; `helpText` (`@arrowz/engine/command`).
- Produces: `Inline({ nodes })`, `InlineMarkdown({ text })` (Inline.tsx); `DocsTable({ of, labelledBy })` (DocsTable.tsx); `DocsMarkdown({ root }: { root: Root })` (DocsMarkdown.tsx).

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/docs/DocsMarkdown.browser.test.tsx`:

```tsx
import { helpText } from '@arrowz/engine/command'
import { ELEMENT_SLOTS } from '@arrowz/engine/docs'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { DocsMarkdown } from './DocsMarkdown'
import { parseDocs } from './markdown'

beforeEach(() => useStore.getState().lang.setLang('en'))

/** Where a link took the router, printed where a case can read it. */
function Where() {
  const location = useLocation()
  return <output data-testid="where">{`${location.pathname} ${JSON.stringify(location.state)}`}</output>
}

const show = (markdown: string, path = '/docs/element') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <DocsMarkdown root={parseDocs(markdown)} />
      <Where />
    </MemoryRouter>,
  )

test('headings move one level down, and a section keeps its id but not its {#id}', async () => {
  const screen = await show('# Title\n\n## Part {#part}\n\n### Detail')
  const tags = [...screen.container.querySelectorAll('h2, h3, h4')].map((h) => [h.tagName, h.id, h.textContent])
  expect(tags).toEqual([
    ['H2', '', 'Title'],
    ['H3', 'docs-part', 'Part'],
    ['H4', '', 'Detail'],
  ])
})

test('inline markup becomes elements, never markup text', async () => {
  const screen = await show('# T\n\nA *b* **c** `d` e.')
  const p = screen.container.querySelector('p')
  expect(p?.querySelector('em')?.textContent).toBe('b')
  expect(p?.querySelector('strong')?.textContent).toBe('c')
  expect(p?.querySelector('code')?.textContent).toBe('d')
  expect(p?.textContent).toBe('A b c d e.')
})

// The renderer builds elements from the tree; raw HTML in the source reaches
// the page as nothing at all, not as a tag.
test('raw HTML does not reach the page', async () => {
  const screen = await show('# T\n\nThe <b>bold</b> way.')
  expect(screen.container.querySelector('b')).toBeNull()
})

// The fragment is the lab's knobs, as on the column's own links (`DocsNav`).
test('a docs link goes to its page, keeps the fragment and names the section in the state', async () => {
  const screen = await show('# T\n\nSee [the knobs](docs:cli#knobs).', '/docs/element#{"W":25}')
  const link = screen.getByRole('link', { name: 'the knobs' })
  await expect.element(link).toHaveAttribute('href', '/docs/cli#{"W":25}')
  await link.click()
  await expect.element(screen.getByTestId('where')).toHaveTextContent('/docs/cli {"docsSection":"docs-knobs"}')
})

test('a link out of the lab opens in a new tab', async () => {
  const screen = await show('# T\n\nThe [source](https://github.com/catppuccin/catppuccin).')
  const link = screen.getByRole('link', { name: 'source' })
  await expect.element(link).toHaveAttribute('target', '_blank')
  await expect.element(link).toHaveAttribute('rel', 'noreferrer')
})

test('code in a known language is coloured, text is not, and each Copy names its section', async () => {
  const screen = await show('# T\n\n## Run {#run}\n\n```sh\ndeno task carve --width=4\n```\n\n```text\nok\n```')
  const sh = screen.container.querySelector('pre.fw-docs-code > code')
  expect(sh?.textContent).toBe('deno task carve --width=4')
  expect(sh?.querySelector('.tk-attr')?.textContent).toBe('--width')
  const term = screen.container.querySelector('pre.fw-docs-term')
  expect(term?.textContent).toBe('ok')
  expect(term?.querySelector('[class^="tk-"]')).toBeNull()
  expect(screen.container.querySelectorAll('button[aria-label="Copy: Run"]')).toHaveLength(2)
})

test('a blockquote is the named note, its glyph hidden', async () => {
  const screen = await show('# T\n\n> Read this.')
  const note = screen.getByRole('complementary', { name: 'Note' })
  await expect.element(note).toHaveTextContent('Read this.')
  expect(note.element().querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
})

test('a prose table has a header row and body rows', async () => {
  const screen = await show('# T\n\n| Word | Means |\n|---|---|\n| **arrow** | One line. |')
  expect([...screen.container.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Word', 'Means'])
  expect([...screen.container.querySelectorAll('tbody td')].map((td) => td.textContent)).toEqual(['arrow', 'One line.'])
})

test('lists keep their kind and their items', async () => {
  const screen = await show('# T\n\n- one\n- two\n\n1. first')
  expect([...screen.container.querySelectorAll('ul > li')].map((li) => li.textContent)).toEqual(['one', 'two'])
  expect([...screen.container.querySelectorAll('ol > li')].map((li) => li.textContent)).toEqual(['first'])
})

test('::table draws the reference table its section names', async () => {
  const screen = await show('# T\n\n## Slots {#slots}\n\n::table{of="element-slots"}')
  const table = screen.container.querySelector('table[aria-labelledby="docs-slots"]')
  expect(table?.querySelectorAll('tbody tr')).toHaveLength(ELEMENT_SLOTS.length)
})

test('::help draws the terminal text, plain', async () => {
  const screen = await show('# T\n\n## Help {#help}\n\n::help{form="short"}')
  expect(screen.container.querySelector('pre.fw-docs-term')?.textContent).toBe(helpText())
  expect(screen.container.querySelectorAll('button[aria-label="Copy: Help"]')).toHaveLength(1)
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/docs/DocsMarkdown.browser.test.tsx`
Expected: FAIL — `Failed to resolve import "./DocsMarkdown"`.

- [ ] **Step 3: Write `Inline.tsx`**

```tsx
import type { Link as MdLink, PhrasingContent } from 'mdast'
import { type ReactElement, type ReactNode, useMemo } from 'react'
import { Link, useLocation } from 'react-router'
import { DOCS_LINK, inlineOf } from './markdown'
import { SECTION_PREFIX } from './pages'

/** Phrasing content as the page shows it; `problemsOf` (shape.ts) refuses every type not handled here. */
export function Inline({ nodes }: { nodes: readonly PhrasingContent[] }): ReactElement {
  return (
    <>
      {nodes.map((node, i) => (
        <Phrase key={i} node={node} />
      ))}
    </>
  )
}

function Phrase({ node }: { node: PhrasingContent }): ReactNode {
  switch (node.type) {
    case 'text':
      return node.value
    case 'inlineCode':
      return <code>{node.value}</code>
    case 'emphasis':
      return (
        <em>
          <Inline nodes={node.children} />
        </em>
      )
    case 'strong':
      return (
        <strong>
          <Inline nodes={node.children} />
        </strong>
      )
    case 'break':
      return <br />
    case 'link':
      return <DocsLink node={node} />
    default:
      return null
  }
}

/**
 * A `docs:` link is the navigation column's kind of link: its page's address,
 * the lab's fragment kept, the section in the router's state (`sectionOf` in
 * DocsNav says why). Any other link leaves the lab, in a new tab.
 */
function DocsLink({ node }: { node: MdLink }): ReactElement {
  const { hash } = useLocation()
  const children = <Inline nodes={node.children} />
  const m = DOCS_LINK.exec(node.url)
  if (m === null)
    return (
      <a href={node.url} target="_blank" rel="noreferrer">
        {children}
      </a>
    )
  return (
    <Link to={{ pathname: `/docs/${m[1] ?? ''}`, hash }} state={{ docsSection: SECTION_PREFIX + (m[2] ?? '') }}>
      {children}
    </Link>
  )
}

/** One line of inline Markdown: a reference table's description. */
export function InlineMarkdown({ text }: { text: string }): ReactElement {
  const nodes = useMemo(() => inlineOf(text), [text])
  return <Inline nodes={nodes} />
}
```

- [ ] **Step 4: Write `DocsTable.tsx`**

The four tables of `routes/ElementDocs.tsx` (which Task 7 deletes), selected by name, with the description column through `InlineMarkdown`:

```tsx
import { ELEMENT_EVENTS, ELEMENT_MEMBERS, ELEMENT_PROPS, ELEMENT_SLOTS } from '@arrowz/engine/docs'
import type { ReactElement } from 'react'
import { type CellRole, cellTokens } from './codeTokens'
import { InlineMarkdown } from './Inline'
import { TokenSpans } from './TokenSpans'
import { useDocs } from './useDocs'

/** The dash a table cell shows where a property has no attribute at all. */
const NONE = '—'

/** A machine cell in the code colours; the column says what its text is. */
function Mono({ text, column }: { text: string; column: CellRole }): ReactElement {
  return (
    <td className="mono">
      <TokenSpans tokens={cellTokens(text, column)} />
    </td>
  )
}

/**
 * One reference table of `<arrowz-board>`, as `::table{of=…}` names it. The
 * machine columns come from the shared rows and are not translated; the last
 * column is, and is inline Markdown. A name `shape.ts` does not list renders
 * nothing, and the content guard fails first.
 */
export function DocsTable({ of, labelledBy }: { of: string; labelledBy?: string | undefined }): ReactElement | null {
  const docs = useDocs()
  if (of === 'element-props')
    return (
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col">{docs.colProp}</th>
            <th scope="col">{docs.colType}</th>
            <th scope="col">{docs.colAttr}</th>
            <th scope="col">{docs.colDefault}</th>
            <th scope="col">{docs.colDescription}</th>
          </tr>
        </thead>
        <tbody>
          {ELEMENT_PROPS.map((row) => (
            <tr key={row.key}>
              <Mono text={row.key} column="prop" />
              <Mono text={row.type} column="type" />
              <Mono text={row.attribute ?? NONE} column="attr" />
              <Mono text={row.def} column="expr" />
              <td>
                <InlineMarkdown text={docs.props[row.key]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  if (of === 'element-members')
    return (
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col">{docs.colMember}</th>
            <th scope="col">{docs.colSignature}</th>
            <th scope="col">{docs.colDescription}</th>
          </tr>
        </thead>
        <tbody>
          {ELEMENT_MEMBERS.map((row) => (
            <tr key={row.key}>
              {/* A getter's signature is its type; a method's names itself. */}
              <Mono text={row.key} column={row.kind === 'getter' ? 'prop' : 'method'} />
              <Mono text={row.signature} column={row.kind === 'getter' ? 'type' : 'sig'} />
              <td>
                <InlineMarkdown text={docs.members[row.key]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  if (of === 'element-events')
    return (
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col">{docs.colEvent}</th>
            <th scope="col">{docs.colDetail}</th>
            <th scope="col">{docs.colDescription}</th>
          </tr>
        </thead>
        <tbody>
          {ELEMENT_EVENTS.map((row) => (
            <tr key={row.key}>
              <Mono text={row.key} column="event" />
              <Mono text={row.detail} column="expr" />
              <td>
                <InlineMarkdown text={docs.events[row.key]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  if (of === 'element-slots')
    return (
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col">{docs.colSlot}</th>
            <th scope="col">{docs.colDescription}</th>
          </tr>
        </thead>
        <tbody>
          {ELEMENT_SLOTS.map((row) => (
            <tr key={row.key}>
              <Mono text={row.key} column="slot" />
              <td>
                <InlineMarkdown text={docs.slots[row.key]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  return null
}
```

- [ ] **Step 5: Write `DocsMarkdown.tsx`**

```tsx
/**
 * A parsed documentation page as React elements, block by block: no HTML
 * string reaches the DOM. The node types handled here are the ones
 * `problemsOf` (shape.ts) lets a page use; anything else renders nothing, and
 * the content guard fails before such a page ships. Headings move one level
 * down, because the shell owns `h1`.
 */
import { helpText } from '@arrowz/engine/command'
import type { Blockquote, Code, Heading, List, Root, RootContent, Table } from 'mdast'
import type { LeafDirective } from 'mdast-util-directive'
import type { ReactElement } from 'react'
import { DocsBlock } from '../routes/DocsBlock'
import { type CodeToken, highlightHtml, highlightJson, highlightSh } from './codeTokens'
import { DocsTable } from './DocsTable'
import { Inline } from './Inline'
import { type DocsSection, plainText, sectionIdOf } from './markdown'
import { SECTION_PREFIX } from './pages'
import { TokenSpans } from './TokenSpans'
import { useDocs } from './useDocs'

interface Placed {
  readonly node: RootContent
  /** The section the block sits in: Copy is named after it, a table labelled by it. */
  readonly section: DocsSection | null
}

function placed(root: Root): Placed[] {
  const out: Placed[] = []
  let section: DocsSection | null = null
  for (const node of root.children) {
    const id = node.type === 'heading' && node.depth === 2 ? sectionIdOf(node) : undefined
    if (node.type === 'heading' && id !== undefined)
      section = { id: SECTION_PREFIX + id, title: plainText(node.children) }
    out.push({ node, section })
  }
  return out
}

export function DocsMarkdown({ root }: { root: Root }): ReactElement {
  return (
    <>
      {placed(root).map((block, i) => (
        <Block key={i} node={block.node} section={block.section} />
      ))}
    </>
  )
}

function Block({ node, section }: Placed): ReactElement | null {
  switch (node.type) {
    case 'heading':
      return <HeadingView node={node} />
    case 'paragraph':
      return (
        <p>
          <Inline nodes={node.children} />
        </p>
      )
    case 'code':
      return <CodeView node={node} section={section} />
    case 'list':
      return <ListView node={node} />
    case 'table':
      return <ProseTable node={node} />
    case 'blockquote':
      return <Note node={node} />
    case 'leafDirective':
      return <Directive node={node} section={section} />
    default:
      return null
  }
}

function HeadingView({ node }: { node: Heading }): ReactElement {
  const text = <Inline nodes={node.children} />
  const id = sectionIdOf(node)
  if (node.depth === 1) return <h2>{text}</h2>
  if (node.depth === 2) return <h3 id={id === undefined ? undefined : SECTION_PREFIX + id}>{text}</h3>
  return <h4>{text}</h4>
}

function tokensOf(lang: string | null | undefined, code: string): CodeToken[] | null {
  if (lang === 'html') return highlightHtml(code)
  if (lang === 'sh') return highlightSh(code)
  if (lang === 'json') return highlightJson(code)
  return null
}

function CodeView({ node, section }: { node: Code; section: DocsSection | null }): ReactElement {
  const tokens = tokensOf(node.lang, node.value)
  const title = section?.title ?? ''
  if (tokens === null)
    return (
      <DocsBlock kind="term" section={title} text={node.value}>
        {node.value}
      </DocsBlock>
    )
  return (
    <DocsBlock kind="code" section={title} text={node.value}>
      <code>
        <TokenSpans tokens={tokens} />
      </code>
    </DocsBlock>
  )
}

function ListView({ node }: { node: List }): ReactElement {
  const items = node.children.map((item, i) => (
    <li key={i}>
      {item.children.map((child, j) =>
        child.type === 'paragraph' ? (
          <Inline key={j} nodes={child.children} />
        ) : child.type === 'list' ? (
          <ListView key={j} node={child} />
        ) : null,
      )}
    </li>
  ))
  return node.ordered === true ? <ol>{items}</ol> : <ul>{items}</ul>
}

function ProseTable({ node }: { node: Table }): ReactElement {
  const [head, ...body] = node.children
  return (
    <table className="fw-docs-table">
      <thead>
        <tr>
          {head?.children.map((cell, i) => (
            <th key={i} scope="col">
              <Inline nodes={cell.children} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {body.map((row, r) => (
          <tr key={r}>
            {row.children.map((cell, i) => (
              <td key={i}>
                <Inline nodes={cell.children} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The note's mark, a drawn info glyph. Decoration only: the note is named by its `aside`. */
function InfoIcon(): ReactElement {
  return (
    <svg className="i" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v4" />
      <circle cx="8" cy="4.9" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

function Note({ node }: { node: Blockquote }): ReactElement {
  const docs = useDocs()
  return (
    <aside className="fw-docs-info" aria-label={docs.infoLabel}>
      <InfoIcon />
      {node.children.map((child, i) =>
        child.type === 'paragraph' ? (
          <p key={i}>
            <Inline nodes={child.children} />
          </p>
        ) : null,
      )}
    </aside>
  )
}

function Directive({ node, section }: { node: LeafDirective; section: DocsSection | null }): ReactElement | null {
  const attributes = node.attributes ?? {}
  if (node.name === 'table') return <DocsTable of={attributes['of'] ?? ''} labelledBy={section?.id} />
  if (node.name !== 'help') return null
  const text = helpText({ knobs: attributes['form'] === 'knobs' })
  return (
    <DocsBlock kind="term" section={section?.title ?? ''} text={text}>
      {text}
    </DocsBlock>
  )
}
```

- [ ] **Step 6: Inline code in prose**

In `apps/lab/src/design/docs.css`, directly after the `.fw-docs p { … }` rule (before `.fw-docs-table {`), add:

```css
/* Inline code in prose and descriptions: the code font at the text's size, and
   no colour — colour belongs to blocks and machine columns. */
.fw-docs :is(p, li, td, th) code {
  font-family: var(--mono);
  font-size: inherit;
}
```

- [ ] **Step 7: Run the test to see it pass**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/docs/DocsMarkdown.browser.test.tsx`
Expected: PASS, 11 tests.

- [ ] **Step 8: Gates and commit**

```bash
cd apps/lab && pnpm exec prettier --write src/docs/Inline.tsx src/docs/DocsTable.tsx src/docs/DocsMarkdown.tsx src/docs/DocsMarkdown.browser.test.tsx src/design/docs.css
pnpm run check && pnpm run lint
git add src/docs/Inline.tsx src/docs/DocsTable.tsx src/docs/DocsMarkdown.tsx src/docs/DocsMarkdown.browser.test.tsx src/design/docs.css
git commit -m "lab: render the docs' Markdown, its tables and the CLI help as React elements"
```

---

### Task 6: The two pages in Markdown, and their guards

**Files:**
- Create: `apps/lab/docs-content/en/element.md`, `apps/lab/docs-content/en/cli.md`, `apps/lab/docs-content/pl/element.md`, `apps/lab/docs-content/pl/cli.md`
- Create: `apps/lab/src/docs/content.ts`, `apps/lab/src/docs/DocsPageView.tsx`
- Test: `apps/lab/src/docs/content.test.ts`, `apps/lab/src/docs/ElementPage.browser.test.tsx`, `apps/lab/src/docs/CliPage.browser.test.tsx`
- Modify: `packages/engine/glossary.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 5; `plFor`, `withoutCode`, `refuse`, `EN_RETIRED`, `LAB_ONLY_KNOB`, `LAB_ONLY_FLAG` (glossary.test.ts, Task 4).
- Produces: `SOURCES: Record<Lang, Record<DocsPage, string>>`, `interface ParsedPage { readonly root: Root; readonly sections: readonly DocsSection[] }`, `docsPage(lang: Lang, page: DocsPage): ParsedPage` (content.ts); `DocsPageView({ page }: { page: DocsPage })` (DocsPageView.tsx).

- [ ] **Step 1: Write the pages**

`apps/lab/docs-content/en/element.md` — the code block is `ELEMENT_EXAMPLE` from `docs/elementExample.ts`, character for character:

````md
# \<arrowz-board>

The board view of Arrowz as a web component. It draws a board, owns zoom and pan, animates the two effects of the game reducer, and reports clicks on arrows. Usable from plain HTML, React, Angular, Svelte or Vue.

> The long explanations — zoom and pan, the dot grid, riding the track, playing the board — live in the package README.

## Using it {#example}

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

## Properties {#props}

::table{of="element-props"}

## Methods and getters {#members}

::table{of="element-members"}

## Events {#events}

::table{of="element-events"}

## Slots {#slots}

A child with `slot` set to one of these names replaces that default; a slot left empty keeps it. `data-board-action` on a child — `zoom-in`, `zoom-out`, `fit`, `colors` or `gestures` — makes a click on it do what that control does.

::table{of="element-slots"}
````

`apps/lab/docs-content/pl/element.md`:

````md
# \<arrowz-board>

Widok planszy Arrowz jako komponent webowy. Rysuje planszę, obsługuje powiększanie i przesuwanie, animuje dwa efekty reduktora gry i zgłasza kliknięcia w strzałki. Działa w czystym HTML, w Reakcie, Angularze, Svelte i Vue.

> Długie objaśnienia — powiększanie i przesuwanie, siatka kropek, jazda po torze, rozgrywka — są w pliku README pakietu.

## Jak użyć {#example}

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

## Właściwości {#props}

::table{of="element-props"}

## Metody i gettery {#members}

::table{of="element-members"}

## Zdarzenia {#events}

::table{of="element-events"}

## Sloty {#slots}

Dziecko z `slot` ustawionym na jedną z tych nazw zastępuje domyślną zawartość; pusty slot ją zachowuje. `data-board-action` na dziecku — `zoom-in`, `zoom-out`, `fit`, `colors` albo `gestures` — sprawia, że kliknięcie robi to samo co ten przycisk.

::table{of="element-slots"}
````

`apps/lab/docs-content/en/cli.md`:

```md
# deno task carve

The command line makes boards and prints them. This is the help it shows, rendered from the very function the terminal calls, so the two cannot disagree.

The blocks below are the terminal's own text and stay in English.

## Everyday help {#short}

::help{form="short"}

## Every knob {#knobs}

::help{form="knobs"}
```

`apps/lab/docs-content/pl/cli.md`:

```md
# deno task carve

Wiersz poleceń układa plansze i je drukuje. To jest pomoc, którą wypisuje — renderowana z tej samej funkcji, którą woła terminal, więc obie nie mogą się rozjechać.

Bloki poniżej to własny tekst terminala i zostają po angielsku.

## Pomoc na co dzień {#short}

::help{form="short"}

## Wszystkie pokrętła {#knobs}

::help{form="knobs"}
```

Then: `cd apps/lab && pnpm exec prettier --write docs-content` and `git diff --stat docs-content` — expected: no change (none of the four has a table; measured, Prettier leaves directives, `{#id}` and `\<` as written).

- [ ] **Step 2: Write the failing node test**

Create `apps/lab/src/docs/content.test.ts`:

```ts
import { docsFor } from '@arrowz/engine/docs'
import type { Nodes } from 'mdast'
import { describe, expect, test } from 'vitest'
import { docsPage, SOURCES } from './content'
import { DOCS_LINK, inlineOf, parseDocs } from './markdown'
import { DOCS_PAGES, SECTION_PREFIX } from './pages'
import { problemsOf, shapeOf } from './shape'

const LANGS = ['en', 'pl'] as const

describe.each(DOCS_PAGES)('the %s page', (page) => {
  test.each(LANGS)('in %s holds only what the renderer shows', (lang) => {
    expect(problemsOf(parseDocs(SOURCES[lang][page]), DOCS_PAGES)).toEqual([])
  })

  test('has the same shape in both languages', () => {
    expect(shapeOf(docsPage('pl', page).root)).toEqual(shapeOf(docsPage('en', page).root))
  })
})

function linksOf(node: Nodes, out: string[] = []): string[] {
  if (node.type === 'link') out.push(node.url)
  if ('children' in node) for (const child of node.children) linksOf(child, out)
  return out
}

test.each(LANGS)('every docs: link in %s names a section that exists', (lang) => {
  for (const page of DOCS_PAGES) {
    for (const url of linksOf(docsPage(lang, page).root)) {
      const m = DOCS_LINK.exec(url)
      if (m === null) continue
      const target = DOCS_PAGES.find((name) => name === m[1])
      expect(target, url).toBeDefined()
      if (target === undefined) continue
      expect(docsPage(lang, target).sections.map((s) => s.id), url).toContain(SECTION_PREFIX + (m[2] ?? ''))
    }
  }
})

// Descriptions are drawn through the parser now: one that parses into
// anything but plain inline text would lose words on the page.
test.each(LANGS)('every %s description is plain inline Markdown', (lang) => {
  const docs = docsFor(lang)
  const texts = [docs.props, docs.members, docs.events, docs.slots].flatMap((rows) => Object.values(rows))
  expect(texts.length).toBeGreaterThan(30)
  for (const text of texts)
    for (const node of inlineOf(text)) expect(['text', 'inlineCode', 'emphasis', 'strong'], text).toContain(node.type)
})
```

Run: `cd apps/lab && pnpm exec vitest run --project node src/docs/content.test.ts`
Expected: FAIL — `Failed to resolve import "./content"`.

- [ ] **Step 3: Write `content.ts` and `DocsPageView.tsx`**

`apps/lab/src/docs/content.ts`:

```ts
/**
 * The documentation's pages in both languages, parsed once when the Docs
 * chunk loads: they are fixed for the life of the page, and the renderer and
 * the navigation column read them on every render.
 */
import type { Lang } from '@arrowz/engine/i18n'
import type { Root } from 'mdast'
import { type DocsSection, parseDocs, sectionsOf } from './markdown'
import type { DocsPage } from './pages'
import cliEn from '../../docs-content/en/cli.md?raw'
import elementEn from '../../docs-content/en/element.md?raw'
import cliPl from '../../docs-content/pl/cli.md?raw'
import elementPl from '../../docs-content/pl/element.md?raw'

export interface ParsedPage {
  readonly root: Root
  readonly sections: readonly DocsSection[]
}

/** The Markdown of every page, as written: what the content guard parses afresh. */
export const SOURCES: Readonly<Record<Lang, Readonly<Record<DocsPage, string>>>> = {
  en: { element: elementEn, cli: cliEn },
  pl: { element: elementPl, cli: cliPl },
}

function parsed(markdown: string): ParsedPage {
  const root = parseDocs(markdown)
  return { root, sections: sectionsOf(root) }
}

const PAGES: Readonly<Record<Lang, Readonly<Record<DocsPage, ParsedPage>>>> = {
  en: { element: parsed(SOURCES.en.element), cli: parsed(SOURCES.en.cli) },
  pl: { element: parsed(SOURCES.pl.element), cli: parsed(SOURCES.pl.cli) },
}

export function docsPage(lang: Lang, page: DocsPage): ParsedPage {
  return PAGES[lang][page]
}
```

`apps/lab/src/docs/DocsPageView.tsx`:

```tsx
import type { ReactElement } from 'react'
import { useStore } from '../state/store'
import { docsPage } from './content'
import { DocsMarkdown } from './DocsMarkdown'
import type { DocsPage } from './pages'

/** A documentation page in the language on screen. */
export function DocsPageView({ page }: { page: DocsPage }): ReactElement {
  const lang = useStore((state) => state.lang.lang)
  return <DocsMarkdown root={docsPage(lang, page).root} />
}
```

Run Step 2's command again. Expected: PASS, 2 × 3 + 2 + 2 = 10 tests.

- [ ] **Step 4: Prove the shape guard tells a translation apart**

Commit first (Step 9's `git add` + a WIP commit is fine, amended later). Change `{#members}` to `{#member}` in `docs-content/pl/element.md`, rerun. Expected: FAIL in `the element page > has the same shape in both languages`. Undo by hand; rerun: PASS. Then change `pl/cli.md`'s `form="knobs"` to `form="short"`, rerun: the same test fails for `cli`. Undo by hand.

- [ ] **Step 5: Write the page tests**

Create `apps/lab/src/docs/ElementPage.browser.test.tsx` — the cases of `routes/ElementDocs.browser.test.tsx`, mounted on the Markdown page:

```tsx
import { ELEMENT_EVENTS, ELEMENT_MEMBERS, ELEMENT_PROPS, ELEMENT_SLOTS } from '@arrowz/engine/docs'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { contrast, parse } from '../design/contrast'
import { useStore } from '../state/store'
import { docsPage } from './content'
import { DocsPageView } from './DocsPageView'
// The colour cases below read computed style, which a component test only has
// with the sheets imported.
import '../design/index.css'

beforeEach(() => useStore.getState().lang.setLang('en'))
afterEach(() => vi.restoreAllMocks())

// No wrapper element: the MemoryRouter renders none, so the page's blocks are
// the container's children, as they are the body's in the panel.
const mount = () =>
  render(
    <MemoryRouter initialEntries={['/docs/element']}>
      <DocsPageView page="element" />
    </MemoryRouter>,
  )

const firstCode = docsPage('en', 'element').root.children.find((node) => node.type === 'code')
const EXAMPLE = firstCode?.type === 'code' ? firstCode.value : ''

// `querySelectorAll` hands back `Element`, which has no `cells`: the generic is not decoration.
const rowFor = (container: HTMLElement, key: string) =>
  [...container.querySelectorAll<HTMLTableRowElement>('tbody tr')].find((tr) => tr.cells[0]?.textContent === key)

test('every documented row reaches the page', async () => {
  const screen = await mount()
  const rows = screen.container.querySelectorAll('tbody tr')
  expect(rows).toHaveLength(
    ELEMENT_PROPS.length + ELEMENT_MEMBERS.length + ELEMENT_EVENTS.length + ELEMENT_SLOTS.length,
  )
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
const described = (container: HTMLElement) =>
  [...container.querySelectorAll('tbody td:not(.mono)')].map((c) => c.textContent)

test('a language switch changes every description and leaves every machine cell', async () => {
  const screen = await mount()
  const before = machine(screen.container)
  const helpBefore = described(screen.container)
  expect(before).toHaveLength(
    ELEMENT_PROPS.length * 4 + ELEMENT_MEMBERS.length * 2 + ELEMENT_EVENTS.length * 2 + ELEMENT_SLOTS.length,
  )
  expect(helpBefore).toHaveLength(
    ELEMENT_PROPS.length + ELEMENT_MEMBERS.length + ELEMENT_EVENTS.length + ELEMENT_SLOTS.length,
  )
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

test('the README note stands under the lead, named, before the first section', async () => {
  const screen = await mount()
  const note = screen.getByRole('complementary', { name: 'Note' })
  await expect.element(note).toMatchTextContent(/live in the package README\.$/)
  const aside = note.element()
  expect(aside.previousElementSibling?.tagName).toBe('P')
  expect(aside.nextElementSibling?.tagName).toBe('H3')
  expect(aside.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  // Nothing trails the last table.
  expect(screen.container.lastElementChild?.tagName).toBe('TABLE')
})

test('the slot table opens with how a host fills a slot, in both languages', async () => {
  const screen = await mount()
  const table = screen.container.querySelector('table[aria-labelledby="docs-slots"]')
  expect(table?.previousElementSibling?.textContent).toMatch(/^A child with slot set to one of these names/)
  await act(async () => useStore.getState().lang.setLang('pl'))
  const after = screen.container.querySelector('table[aria-labelledby="docs-slots"]')
  expect(after?.previousElementSibling?.textContent).toMatch(/^Dziecko z slot ustawionym/)
})

test('the note is named in Polish too', async () => {
  useStore.getState().lang.setLang('pl')
  const screen = await mount()
  await expect.element(screen.getByRole('complementary', { name: 'Uwaga' })).toBeVisible()
})

test('every section heading carries the id the navigation names', async () => {
  const screen = await mount()
  const ids = [...screen.container.querySelectorAll('h3')].map((h) => h.id)
  expect(ids).toEqual(['docs-example', 'docs-props', 'docs-members', 'docs-events', 'docs-slots'])
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

Create `apps/lab/src/docs/CliPage.browser.test.tsx` — the cases of `routes/CliDocs.browser.test.tsx`:

```tsx
import { helpText } from '@arrowz/engine/command'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { DocsPageView } from './DocsPageView'
// A component test loads no stylesheet of its own; without the cascade the
// overflow assertion below reads `visible`.
import '../design/index.css'

beforeEach(() => useStore.getState().lang.setLang('en'))
afterEach(() => vi.restoreAllMocks())

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/docs/cli']}>
      <DocsPageView page="cli" />
    </MemoryRouter>,
  )

// The long form contains every line of the short form but two, so one marker
// would pass a page showing a single block.
const LONG_ONLY = 'Rules (checked together with the ranges):'
const SHORT_ONLY = 'Knobs: --lmax='

test('both help forms are on the page', async () => {
  const screen = await mount()
  const text = screen.container.textContent ?? ''
  expect(text).toContain(SHORT_ONLY)
  expect(text).toContain(LONG_ONLY)
})

// Measured, not only declared: `overflow-x: auto` holds on a block that can never scroll.
test('the terminal blocks keep their spacing and scroll by themselves', async () => {
  const screen = await mount()
  const blocks = screen.container.querySelectorAll('div.fw-docs-block > pre.fw-docs-term')
  expect(blocks).toHaveLength(2)
  for (const block of blocks) {
    const style = getComputedStyle(block)
    expect(style.whiteSpace).toBe('pre')
    expect(style.overflowX).toBe('auto')
  }
  const knobs = blocks.item(1)
  if (knobs === null) throw new Error('the knob block is not on the page')
  expect(knobs.scrollWidth).toBeGreaterThan(knobs.clientWidth)
})

test('the frame speaks the chosen language and the help does not', async () => {
  const screen = await mount()
  expect(screen.container.querySelector('h3')?.textContent).toBe('Everyday help')
  useStore.getState().lang.setLang('pl')
  const polish = await mount()
  expect(polish.container.querySelector('h3')?.textContent).toBe('Pomoc na co dzień')
  expect(polish.container.textContent ?? '').toContain(SHORT_ONLY)
})

test('each help block copies its own text', async () => {
  const write = vi.fn(() => Promise.resolve())
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText: write } as unknown as Clipboard)
  const screen = await mount()
  await screen.getByRole('button', { name: 'Copy: Every knob' }).click()
  expect(write).toHaveBeenLastCalledWith(helpText({ knobs: true }))
  await screen.getByRole('button', { name: 'Copy: Everyday help' }).click()
  expect(write).toHaveBeenLastCalledWith(helpText())
})

test('the help blocks stay uncoloured', async () => {
  const screen = await mount()
  expect(screen.container.querySelectorAll('pre.fw-docs-term [class^="tk-"]')).toHaveLength(0)
})

test('both section headings carry the ids the navigation names', async () => {
  const screen = await mount()
  const ids = [...screen.container.querySelectorAll('h3')].map((h) => h.id)
  expect(ids).toEqual(['docs-short', 'docs-knobs'])
})
```

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/docs/ElementPage.browser.test.tsx src/docs/CliPage.browser.test.tsx`
Expected: PASS, 12 + 6 tests.

- [ ] **Step 6: The glossary reads the pages — failing first**

Append to `packages/engine/glossary.test.ts` (add `import { dirname, fromFileUrl, join } from '@std/path'` beside the other imports):

```ts
const DOCS_CONTENT = join(dirname(fromFileUrl(import.meta.url)), '..', '..', 'apps', 'lab', 'docs-content')

/** A docs page's prose, line by line: code, directive attributes and link targets blanked, lines kept. */
function proseLines(lang: string, page: string): [string, string][] {
  const text = withoutCode(
    Deno.readTextFileSync(join(DOCS_CONTENT, lang, `${page}.md`)).replace(/^```[\s\S]*?^```/gm, (block) =>
      block.replace(/[^\n]/g, '')
    ),
  )
    .replace(/\{[^}\n]*\}/g, ' ')
    .replace(/\]\([^)\n]*\)/g, ']')
  return text.split('\n').map((line, i): [string, string] => [`docs-content/${lang}/${page}.md:${i + 1}`, line])
}

Deno.test('the docs pages use no retired word', () => {
  const pages = [...Deno.readDirSync(join(DOCS_CONTENT, 'en'))]
    .filter((entry) => entry.name.endsWith('.md'))
    .map((entry) => entry.name.slice(0, -3))
  assert(pages.length >= 2, `only ${pages.length} docs pages found — the path is wrong`)
  for (const page of pages) {
    refuse(proseLines('en', page), [...EN_RETIRED, ...(page === 'cli' ? [] : [LAB_ONLY_KNOB]), LAB_ONLY_FLAG])
    refuse(proseLines('pl', page), [...plFor(page), LAB_ONLY_FLAG])
  }
})
```

Run: `deno fmt packages/engine/glossary.test.ts && deno test --allow-read packages/engine/glossary.test.ts`
Expected: PASS (the pages were written in the glossary). Then prove it can fail: commit (Step 9), change "reports clicks on arrows" in `docs-content/en/element.md` to "reports clicks on pieces", rerun. Expected: FAIL naming `docs-content/en/element.md:3` and `/\bpieces?\b/i`. Undo by hand; rerun: PASS. Then put "elementy" for "strzałki" in `pl/element.md`'s lead: FAIL naming `/\belement(?:y|ów|om|ami|ach)\b/i`. Undo by hand.

- [ ] **Step 7: Run every Deno gate**

Run from the root: `deno task verify`
Expected: PASS.

- [ ] **Step 8: Lab gates**

```bash
cd apps/lab && pnpm exec prettier --write docs-content src/docs/content.ts src/docs/DocsPageView.tsx src/docs/content.test.ts src/docs/ElementPage.browser.test.tsx src/docs/CliPage.browser.test.tsx
pnpm run check && pnpm run lint && pnpm exec prettier --check .
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/lab/docs-content apps/lab/src/docs/content.ts apps/lab/src/docs/DocsPageView.tsx \
  apps/lab/src/docs/content.test.ts apps/lab/src/docs/ElementPage.browser.test.tsx \
  apps/lab/src/docs/CliPage.browser.test.tsx packages/engine/glossary.test.ts
git commit -m "lab: write the element and CLI docs pages in Markdown, guarded for shape and glossary"
```

---

### Task 7: Wire the route to the Markdown and retire the old pages

**Files:**
- Create: `apps/lab/src/routes/DocsBody.tsx`
- Modify: `apps/lab/src/routes/DocsRoute.tsx` (whole file), `apps/lab/src/routes/DocsNav.tsx` (whole file), `apps/lab/src/routes/useSectionInView.ts` (signature and imports)
- Modify: `apps/lab/src/docs/codeTokens.test.ts` (the example's source), `apps/lab/src/routes/LayoutInvariants.browser.test.tsx` (one wait)
- Modify: `packages/engine/lab-docs.ts` (the prose that moved)
- Delete: `apps/lab/src/routes/ElementDocs.tsx`, `apps/lab/src/routes/CliDocs.tsx`, `apps/lab/src/routes/ElementDocs.browser.test.tsx`, `apps/lab/src/routes/CliDocs.browser.test.tsx`, `apps/lab/src/docs/elementExample.ts`

**Interfaces:**
- Consumes: `docsPage`, `DocsPageView`, `DocsSection`, `DocsPage`, `isDocsPage`.
- Produces: `DocsBody({ page, panel })`; `useSectionInView(panel: RefObject<HTMLElement | null>, sections: readonly DocsSection[]): string`; `Docs` without `elementLead`, `slotsLead`, `cliLead`, `cliShortHead`, `cliKnobsHead`, `cliEnglishNote`, `headProps`, `headMembers`, `headEvents`, `headSlots`, `headExample`, `readmePointer`.

- [ ] **Step 1: The section hook takes the sections**

In `apps/lab/src/routes/useSectionInView.ts`:

- replace `import { DOCS_SECTIONS, type DocsPage, sectionOf } from './DocsNav'` with `import type { DocsSection } from '../docs/markdown'` and `import { sectionOf } from './DocsNav'`;
- change the signature to `export function useSectionInView(panel: RefObject<HTMLElement | null>, sections: readonly DocsSection[]): string {`;
- delete the line `const sections: readonly { readonly id: string }[] = DOCS_SECTIONS[page]`.

The `sections` array comes from `docsPage`, built once per language at module load, so its identity is stable between renders and changes only with the language — which is when the effect that observes the headings must run again.

- [ ] **Step 2: `DocsNav.tsx` reads the pages**

Replace the whole file with:

```tsx
import type { ReactElement } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { docsPage } from '../docs/content'
import type { DocsPage } from '../docs/pages'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'

const PAGES = [
  { page: 'element', name: 'docsElement' },
  { page: 'cli', name: 'docsCli' },
] as const satisfies readonly { page: DocsPage; name: string }[]

/**
 * The section a navigation asked for, carried in the router's state rather
 * than in the address: the fragment is the lab's own — `useUrlHash` writes the
 * knobs there on every route — so a section id in it would be overwritten at
 * once and, pasted, would read as a broken lab link.
 */
export function sectionOf(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('docsSection' in state)) return null
  return typeof state.docsSection === 'string' ? state.docsSection : null
}

/** The page an address names; DocsRoute has already redirected anything else. */
export function pageOf(pathname: string): DocsPage {
  return pathname.startsWith('/docs/cli') ? 'cli' : 'element'
}

/**
 * The documentation's navigation, one column in two levels: every page, and
 * under each the `##` sections of its Markdown in the language on screen.
 * Links, not a radio group or a second tablist: a documentation page has an
 * address worth copying, and only a link gives one. A section's link is its
 * page's address, keeping the lab's fragment, with the section in the
 * navigation's state (`sectionOf`); `useSectionInView` scrolls the panel to it.
 *
 * `NavLink` and `Link`, not a plain `<a href>`: an anchor would reload the
 * document, killing the run in flight and disposing the board's WebGL context.
 *
 * Two kinds of "current": `aria-current="page"` is NavLink's own default for
 * the page on screen; `aria-current="true"` marks the section in view. Neither
 * collides with the lab's `[aria-current='true']` rules: `docs.css` scopes its own.
 *
 * Under 768 the column stands over the page and lists the sections of the
 * page on screen only; `on` is the class that tells the sheet which.
 */
export function DocsNav({ section }: { section?: string | undefined }): ReactElement {
  const dict = useDictionary()
  const lang = useStore((state) => state.lang.lang)
  const location = useLocation()
  const current = pageOf(location.pathname)
  return (
    <nav className="fw-docs-toc" aria-label={dict.t('docsNavLabel')}>
      <ul>
        {PAGES.map(({ page, name }) => (
          <li key={page} className={page === current ? 'pg on' : 'pg'}>
            <NavLink to={`/docs/${page}`}>{dict.t(name)}</NavLink>
            <ul>
              {docsPage(lang, page).sections.map(({ id, title }) => (
                <li key={id}>
                  <Link
                    to={{ pathname: `/docs/${page}`, hash: location.hash }}
                    state={{ docsSection: id }}
                    aria-current={page === current && id === section ? 'true' : undefined}
                  >
                    {title}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  )
}
```

`dict.t(name)` takes a `UiKey`: if `pnpm run check` reports `name` as `string` (the `satisfies` widening), change the element type to `{ page: DocsPage; name: 'docsElement' | 'docsCli' }`.

- [ ] **Step 3: The lazy body and the eager panel**

Create `apps/lab/src/routes/DocsBody.tsx`:

```tsx
import type { ReactElement, RefObject } from 'react'
import { docsPage } from '../docs/content'
import { DocsPageView } from '../docs/DocsPageView'
import type { DocsPage } from '../docs/pages'
import { useStore } from '../state/store'
import { DocsNav } from './DocsNav'
import { useSectionInView } from './useSectionInView'

/**
 * The documentation panel's contents: the navigation column beside the page,
 * and under 768 over it. The root of the Docs tab's own chunk (`DocsRoute`):
 * the Markdown parser alone is 78 KB minified, 22 KB gzipped, which the lab's
 * first load does not carry.
 */
export function DocsBody({ page, panel }: { page: DocsPage; panel: RefObject<HTMLElement | null> }): ReactElement {
  const lang = useStore((state) => state.lang.lang)
  const section = useSectionInView(panel, docsPage(lang, page).sections)
  return (
    <div className="fw-docs-grid">
      <DocsNav section={section} />
      <div className="fw-docs-body">
        <DocsPageView page={page} />
      </div>
    </div>
  )
}
```

Replace `apps/lab/src/routes/DocsRoute.tsx` with:

```tsx
import { lazy, type ReactElement, Suspense, useRef } from 'react'
import { useParams } from 'react-router'
import { type DocsPage, isDocsPage } from '../docs/pages'
import { KeepHashNavigate } from './KeepHashNavigate'

const DocsBody = lazy(() => import('./DocsBody').then((module) => ({ default: module.DocsBody })))

/**
 * The documentation tab's pages. An unknown page name redirects rather than
 * rendering an empty panel: the wildcard route cannot catch it, because
 * `/docs/:what` has already matched.
 */
export function DocsRoute(): ReactElement {
  const { what } = useParams()
  if (!isDocsPage(what)) return <KeepHashNavigate to="/docs/element" />
  return <DocsPanel page={what} />
}

/**
 * The section keeps the id, role and aria-labelledby the tab strip resolves
 * against, and the tabIndex that makes a panel with no focusable content
 * reachable. It renders at once; only its contents wait for the chunk, so the
 * tab strip's wiring never points at a panel that is not there yet.
 */
function DocsPanel({ page }: { page: DocsPage }): ReactElement {
  const panel = useRef<HTMLElement>(null)
  return (
    <main>
      <section
        ref={panel}
        id="docs-panel"
        role="tabpanel"
        aria-labelledby="tab-docs-panel"
        tabIndex={0}
        className="fw-docs"
      >
        <Suspense fallback={null}>
          <DocsBody page={page} panel={panel} />
        </Suspense>
      </section>
    </main>
  )
}
```

- [ ] **Step 4: Retire the old pages**

```bash
git rm apps/lab/src/routes/ElementDocs.tsx apps/lab/src/routes/CliDocs.tsx \
  apps/lab/src/routes/ElementDocs.browser.test.tsx apps/lab/src/routes/CliDocs.browser.test.tsx \
  apps/lab/src/docs/elementExample.ts
```

In `apps/lab/src/docs/codeTokens.test.ts`, replace `import { ELEMENT_EXAMPLE } from './elementExample'` with:

```ts
import { docsPage } from './content'

const firstCode = docsPage('en', 'element').root.children.find((node) => node.type === 'code')
/** The element page's example, as its Markdown writes it. */
const ELEMENT_EXAMPLE = firstCode?.type === 'code' ? firstCode.value : ''
```

and add, as the first case of `describe('the example', …)`:

```ts
  // The cases below would pass on an empty string.
  test('is the element page’s example', () => {
    expect(ELEMENT_EXAMPLE).toContain('<arrowz-board id="board"')
  })
```

- [ ] **Step 5: The audit waits for the docs body**

In `apps/lab/src/routes/LayoutInvariants.browser.test.tsx`, directly after `const screen = await render(<App />)`, add:

```ts
  // The docs body is a chunk of its own (`DocsRoute`): audit it once it is there.
  if (state === 'docs') await expect.poll(() => screen.container.querySelector('.fw-docs-toc')).not.toBeNull()
```

- [ ] **Step 6: `lab-docs.ts` loses the prose that moved**

In `packages/engine/lab-docs.ts`:

1. From `interface Docs`, delete the fields `elementLead`, `slotsLead` (with its doc comment), `cliLead`, `cliShortHead`, `cliKnobsHead`, `cliEnglishNote` (each with its doc comment), `headProps`, `headMembers`, `headEvents`, `headSlots`, `headExample`, `readmePointer` (with its doc comment). Keep `props`, `members`, `events`, `slots`, the ten `col*` fields and `infoLabel`; change `infoLabel`'s doc comment to `/** The accessible name of a page's note, a blockquote in its Markdown. */`. Change the interface's doc comment to `/** What the Docs tab's reference tables need in one language: descriptions, column names, the note's name. */`.
2. Delete the same keys from `EN` and `PL`.
3. Replace the file's first paragraph (the four lines from `// The documentation the lab's Docs tab prints` to `// copy would drift.`) with:

```ts
// The descriptions in the reference tables of the lab's Docs tab, the tables'
// column names and the name of a page's note. The pages' prose is Markdown in
// apps/lab/docs-content; these stay here because each is keyed by a row of
// code, so the compiler keeps the two languages in step.
```

4. In the third paragraph, delete the sentence `Code examples live in apps/lab for the same reason.` and read the whole paragraph after the edit: it must still say only what the file does (no examples remain in it).

Run: `deno task verify` from the root.
Expected: PASS — `lab-docs.test.ts`'s frame test still finds eleven strings (`col*` and `infoLabel`), above its floor of ten; `node-smoke.mjs` reads `props.board`, which stays.

Then `pnpm nx build engine`.

- [ ] **Step 7: The whole lab suite**

```bash
cd apps/lab && pnpm exec prettier --write src/routes src/docs
pnpm run check && pnpm run lint && pnpm exec prettier --check . && pnpm run test
```

Expected: everything passes, including the unchanged `routes/DocsNav.browser.test.tsx` (its section names — "Metody i gettery", "Wszystkie pokrętła" — now come from the Markdown headings), `routes/DocsLayout.browser.test.tsx`, `AppRoutes.browser.test.tsx` and `routes/KeepHashNavigate.browser.test.tsx`. A grep that must come back empty outside comments: `grep -rn "DOCS_SECTIONS\|ElementDocs\|CliDocs\|elementExample\|readmePointer\|headExample" apps/lab/src packages/engine --include='*.ts' --include='*.tsx'`.

- [ ] **Step 8: Commit**

```bash
git add -A apps/lab/src packages/engine/lab-docs.ts
git commit -m "lab: the Docs tab renders its pages from Markdown, its body in a chunk of its own"
```

---

### Task 8: Verify the branch

**Files:** none changed unless a gate fails.

- [ ] **Step 1: Every gate**

```bash
deno task verify
pnpm nx run-many -t verify
```

Expected: PASS for both.

- [ ] **Step 2: The parser is in its own chunk**

```bash
cd apps/lab && pnpm run build
grep -l "containerDirective" dist/assets/*.js
```

Expected: exactly one file, and its name does not start with `index-` (the string literal belongs to `mdast-util-directive`; the entry chunk must not carry it).

- [ ] **Step 3: A cold optimizer does not reload the test page**

```bash
cd apps/lab && rm -rf node_modules/.vite && pnpm exec vitest run --project chromium src/routes/DocsLayout.browser.test.tsx
```

Expected: PASS, with no "new dependencies optimized" reload in the output. If it reloads, the package it names goes into `DOCS_DEPS`.

- [ ] **Step 4: Look at it**

`pnpm nx serve lab`, open `http://localhost:8779/docs/element` and `/docs/cli` in both languages at 1440×900 and 375×812: the pages read as before, descriptions show code spans as code, the column lists the same sections, a section link scrolls the panel. Compare with `apps/lab/docs/screenshots/docs.png`.

- [ ] **Step 5: Open the pull request**

```bash
git push -u origin lab/docs-machinery
gh pr create --title "lab: the Docs tab renders its pages from Markdown" --body "$(cat <<'EOF'
The Docs tab's two pages move into Markdown (`apps/lab/docs-content/{en,pl}`), parsed with
`mdast-util-from-markdown` plus directives and GFM tables and drawn by a renderer of our own.
`::table` and `::help` render the element's reference tables and `helpText()`; the navigation
column is derived from the pages' `##` headings. The parser and pages load as a lazy chunk
inside an eager panel.

Guards: `shape.ts` states what a page may contain and what its translation shares, and
`content.test.ts` runs both over every page; the glossary guard now reads the Markdown and the
element's descriptions, which said "pieces" and "elementy".

First of five PRs in docs/superpowers/specs/2026-10-05-lab-docs-from-readmes-design.md.

Bead: arrowz-kkey.1
EOF
)"
```

---

## Self-Review

1. **Spec coverage (PR 1 row of §6):** parser (Task 1), renderer (Task 5), column from the pages (Task 7), lazy route (Task 7), `sh`/`json` colours (Task 3), `::table` and `::help` (Tasks 2, 5), content guard (Tasks 2, 6), glossary over the Markdown and `lab-docs.ts` (Tasks 4, 6), the two pages moved with their content as it is apart from the glossary fixes (Tasks 4, 6). §5.1 items 7 and 8's `cmd`/`board`/`stats` arrive with their directives in PRs 2 and 4. §1.4's removal of the README note is PR 5's; the note stays here as a blockquote. §2.4's tables other than the element's arrive with their pages.
2. **Placeholder scan:** none; every code step carries its code.
3. **Type consistency:** `DocsSection.id` is the prefixed DOM id everywhere (`sectionsOf`, `placed`, `DocsNav`, `useSectionInView`); `sectionIdOf` returns the bare id. `docsPage(lang, page)` takes `Lang` from `@arrowz/engine/i18n`, which is the store's `'en' | 'pl'`. `DocsTable`'s `labelledBy` is `string | undefined`, as `section?.id` gives.
4. **Checked against the files, 2026-10-05:** `DocsBlock`'s props (`routes/DocsBlock.tsx`), `useDocs` (`docs/useDocs.ts`), the dictionary keys `docsNavLabel`, `docsElement`, `docsCli`, `copy`, `copied`, `Lang` in `lab-i18n.ts`, `leaves`/`refuse`/`EN_RETIRED`/`LAB_ONLY_KNOB`/`LAB_ONLY_FLAG`/`ALLOWED` in `glossary.test.ts`, `@std/path` in the root import map, `optimizeDeps` in `vitest.config.ts`, `expect` imported by `LayoutInvariants.browser.test.tsx`, the `AppRoutes.browser.test.tsx` cases that read the panel synchronously (kept passing by the eager panel). The glossary violations Task 4 rewrites were listed by running the guard's patterns over `docsFor` (2026-10-05); `en.props.view` is the first EN row. Parser and Prettier behaviour (escapes, text directives, tables reformatted, directives kept) were measured on a scratch copy of the five packages at the versions pinned in Task 1, not on the lab itself.
