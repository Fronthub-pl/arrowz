# The lab's documentation route — design

Row 6 of the delivery table in
`docs/superpowers/specs/2026-09-13-lab-react-app-design.md` §10: "the docs
route: the element's API guarded by a test against `mod.ts`, and the CLI help
generated from `helpText()` at build time".

The route, the tab, the panel and their tests have existed since PR 5a.
`apps/lab/src/routes/DocsRoute.tsx` is fifteen lines and says so in a comment:
`{/* PR 6 fills this: the element's API, and the CLI help from helpText(). */}`.
What is missing is the content, and the guards that keep it true.

**Revision 2**, after five reviews that overturned twenty claims of revision 1.
§10 lists what changed and why, so the corrections are not silently absorbed.

## 1. What this delivers

Two pages under the Docs tab:

- `/docs/element` — the API of `<arrowz-board>`: properties, methods, getters
  and events, as reference tables.
- `/docs/cli` — the help `deno task carve` prints, in both its forms.

Plus two debts recorded against this row: `aria-keyshortcuts` on the solo
toggle, and a heading hierarchy the lab does not have. Their provenance is §9.

## 2. Decisions, and what each one overrules

### 2.1 The CLI help is called, not generated

**The lab spec §5.2 says the help is "generated at build time … by a prebuild
script importing `@arrowz/engine/command` from `dist/`". That is amended: the
component calls `helpText()` at render.**

The proof that this is safe in a browser is not a list but a fact already in
production: **`dist/command.js` executes in the browser today.**
`apps/lab/src/App.tsx:2` is `import { storeRequest } from '@arrowz/engine/command'`,
a value import resolved through `packages/engine/package.json`'s `"./command"`
entry to `./dist/command.js`; the worker's build-output smoke imports
`DEFAULT_VIEW` and `svgOptions` from the same subpath
(`apps/lab/scripts/worker-smoke.mjs:15`). `helpText` sits in that same emitted
file (`packages/engine/dist/command.js`, declared at `dist/command.d.ts:113`),
and its body is string work only: `padEnd`, joins, and `Math.max` over flag
lists of ten to thirty entries — not over cells or pieces, as the comment at
`command.ts:461-462` already records.

**What does *not* prove it** — and what revision 1 wrongly leaned on — is
`packages/engine/neutral.test.ts`. That test greps seven patterns over the text
of the file itself (`neutral.test.ts:23-31`). It does not walk imports, and it
does not match `import.meta`, `globalThis.Deno`, `navigator` or `fetch`. Its own
header claims "the compiler keeps DOM out of them", which is false for the Node
build: `packages/engine/tsconfig.build.json:9` is `"lib": ["es2022", "dom"]`.
`NEUTRAL` is a useful net; it is not a proof of browser safety.

Measured (`deno eval`, in `packages/engine`): `helpText()` is 36 lines / 2129
characters, `helpText({ knobs: true })` is 88 lines / 9898 characters, neither
with a trailing newline. Both are built from `PARAM_SPEC`, which the bundle
already carries — `dist/command.js` imports it itself, so `App.tsx:2` alone puts
it there, independently of `console/KnobPanel.tsx:1`.

**The cost a prebuild would carry.** `apps/lab/project.json:35` makes `verify`
depend on **six** targets — `check`, `lint`, `fmt`, `test`, `build`, `smoke` —
not five. Of those, three would fail without the generated file on disk
(`check`, `test`, `build`); `smoke` reads only the built worker chunk. The
other two are worse than blocking: `lint` (`eslint .`) and `fmt`
(`prettier --check .`) would **inspect** the generated file, so the generator
would have to emit ESLint- and Prettier-clean text, or the file would need an
entry in `apps/lab/.prettierignore` (today: `dist` alone). And nothing would
order the prebuild before the three: `dependsOn: ["^build"]`
(`project.json:9,14,20`) builds *dependencies*, not a local step — a prebuild
would need a target of its own.

A call has none of this, and cannot go stale. It also removes the only reason
the CLI page would need a guard: there is no copy to compare.

### 2.2 The text lives in a new engine module

`CLAUDE.md` names `packages/engine/lab-i18n.ts` as the dictionary. That file is
708 lines of short labels. The documentation is reference rows and prose — a
different kind of text, and a large amount of it.

It goes into **`packages/engine/lab-docs.ts`**, exported as
`@arrowz/engine/docs`: the fifth member of the `lab-*` family
(`lab-simple.ts`, `lab-presets.ts`, `lab-i18n.ts`, `lab-report.ts`).

`CLAUDE.md`'s neutrality sentence names `command.ts`, `lab-simple.ts`,
`lab-presets.ts` and `lab-i18n.ts`. It is illustrative rather than exhaustive —
it already omits `lab-report.ts`, which is neutral and on `NEUTRAL` — so adding
`lab-docs.ts` there is a courtesy, not a requirement.

**Wiring, and which parts are actually silent.** Revision 1 called all four
points unenforced. Two of them are not:

| File | What to add | If forgotten |
|---|---|---|
| `packages/engine/package.json` | `"./docs"` → `dist/lab-docs.{js,d.ts}` | **loud**: the lab's `tsc` and `vite build` fail on an unresolved subpath |
| `packages/engine/tsconfig.build.json` | `"lab-docs.ts"` in `include` | **loud**: no `dist/lab-docs.js` to resolve to |
| `packages/engine/deno.json` | `"./docs": "./lab-docs.ts"` | **silent**: no Deno consumer imports these subpaths |
| `packages/engine/neutral.test.ts` | `'lab-docs.ts'` in `NEUTRAL` | **silent**: the list is hand-written |

The two loud ones are loud because `apps/lab/project.json:9,14,20` makes `check`,
`test` and `build` depend on `^build`, which builds the engine's `dist/` from
`tsconfig.build.json`. `packages/engine/svg-golden.ts` — absent from both
`NEUTRAL` and `tsconfig.build.json` with nothing failing — is evidence only for
the silent pair: it has no Node consumer, so it never tests the loud pair.

`packages/engine/scripts/node-smoke.mjs` already asserts that `lab-report`
reached `dist/` (`:9`). `lab-docs` gets the same one-line import there, for
parity with the family member before it.

**A constraint the module inherits from `NEUTRAL`.** `neutral.test.ts` greps
*text*, so a module whose subject is the DOM can trip a rule it does not break:
`/\bdocument\./` matches an example like `document.getElementById('board')` and
also an English sentence ending in "…the document." The rule therefore is:
**code examples live in the lab's components, not in `lab-docs.ts`**, and the
module's prose spells the forbidden words around (`the page`, `the DOM`). Code
examples are code, not translatable prose, so this costs the dictionary nothing.
The plan greps the module against the seven patterns before the commit that adds
it to `NEUTRAL`.

**How the lab reads it.** `Dict` (`lab-i18n.ts:633-644`) has no room for
documentation and is not widened to make room. `lab-docs.ts` exports its own
factory, `docsFor(lang)`, which the lab calls through a small hook beside
`useDictionary`. UI chrome around the content — the navigation's labels and its
group name — stays in `lab-i18n.ts`'s `ui` section, because it is chrome.

### 2.3 Machine columns exist once, help is per language

A row is `{ key, type, attribute, default }` and lives in **one** shared table.
The description lives in a per-language map keyed by `key`:

```
ELEMENT_PROPS: readonly { key, type, attribute: string | null, def }[]
EN.props: Record<PropKey, string>   PL.props: Record<PropKey, string>
```

This is the rule `packages/cli/readme.test.ts:7-9` states verbatim — "The prose
is translated; the machine columns — flag, range, step, default — are not, and
this test is what says so" — and it is what makes "one guard checks both
languages at once" literally true: there is only one copy of the machine data to
check. Revision 1 left this ambiguous, and the obvious reading (full rows per
language) would have duplicated exactly the columns the rule protects.

It also removes a dependency revision 1 assumed: `Widen` is **not** exported
from `lab-i18n.ts` (`:251`, no `export`). With machine data shared, the only
per-language shape is a `Record` keyed by the row keys, which needs no widening
helper at all.

### 2.4 Two sub-pages, and how they are switched

`/docs/:what` already matches `/docs/cli`; no new route is needed for it
(verified with `matchRoutes` on the installed react-router 8.3.1). The component
branches on `what`, and an unknown value redirects to `/docs/element`. Today
`/docs/anything` renders the heading and the raw segment
(`DocsRoute.tsx:10-12`), not an empty panel.

`AppRoutes` also gains `/docs` → `/docs/element`: the bare path falls through to
`*` today and lands the reader in the lab, which is a surprising answer to a
link. `/docs/cli/extra` keeps falling to `*`; a two-segment docs path is not a
thing. `/DOCS/CLI` matches `:what = 'CLI'`, which is unknown and so redirects to
`/docs/element`; the test says so rather than pretending case does not arise.

**Navigation is a `<nav>` of two links with `aria-current="page"`**, not a
radio group. Revision 1 justified `Segmented` with "two tablists would be a
puzzle" — **false**: the lab already renders two at once, `shell/TabRow.tsx:53`
and `console/GroupRail.tsx:85`, and `GroupRail.tsx:14-16` records Ruling 13,
which chose a tablist deliberately. With that argument withdrawn, links win on
their own merit: a documentation page has an address worth copying, opening in a
new tab and middle-clicking, and a radio group has none. `aria-current` is
already the lab's idiom for "the current one of a set"
(`run/PresetStrip.tsx:65`, `library/BoardList.tsx:70`). Note the value differs:
those two render `aria-current="true"` and are styled by
`[aria-current='true']` (`run.css:220`, `library.css:83`), while links take
`"page"` — so `docs.css` selects `[aria-current='page']`.

`selectedIndex` (`TabRow.tsx:15`) returns 2 for anything under `/docs`, so the
Docs tab stays selected on both pages with no change. Clicking that tab while on
`/docs/cli` returns to `/docs/element`, because the tab's path is
`/docs/element` (`TabRow.tsx:10`). That is a decision, not a defect: the tab
means "the documentation", and its first page is the element's.

**`DocsRoute` keeps its shell.** `<main>` wrapping
`<section id="docs-panel" role="tabpanel" aria-labelledby="tab-docs-panel"
tabIndex={0}>` is asserted by `AppRoutes.browser.test.tsx:52-54,72-79`, and
`Workspace.browser.test.tsx` polls `main[hidden] [role=tabpanel]`. The rebuild
happens inside that section.

## 3. The guards

Three duties, split by what each environment can see. The split is what makes
them cheap: the direction "nothing public is undocumented" is a question about
*declarations*, which only the source answers; the direction "everything
documented really exists" is a question about *runtime*, which only the browser
answers.

### 3.1 In the engine, under Deno: `packages/engine/lab-docs.test.ts`

Reads the element's sources as text. The precedent is direct:
`neutral.test.ts:49-50` already walks a sibling package with
`join(dirname(fromFileUrl(import.meta.url)), '..', 'cli')` and
`Deno.readTextFileSync`, and `packages/engine/project.json:12` runs the engine's
tests with an unrestricted `--allow-read`.

It asserts:

1. **EN/PL parity** — one description per row key in both languages, no stale
   keys, modelled on `lab-i18n.test.ts`.
2. **The event map**, parsed from `packages/board-element/src/mod.ts`, **bounded
   to the body of `interface HTMLElementEventMap`**. The bound is not tidiness:
   the same `declare global` block holds `HTMLElementTagNameMap` with
   `'arrowz-board': ArrowzBoard` (`mod.ts:43`), which an unbounded `'name': Type`
   pattern would swallow, making the guard permanently red. A sanity assertion
   requires at least one name parsed, so a reformatting that defeats the parser
   fails loudly rather than comparing two empty sets. Both directions.
   The five names are `piece-click`, `piece-removed`, `life-lost`, `finished`,
   `viewport-change` (`mod.ts:45-51`).
3. **Nothing public is undocumented**, parsed from
   `packages/board-element/src/arrowz-board.ts`:
   - property rows: the keys of `static properties` (`:84-107`) whose
     declaration does not carry `state: true` — ten of the twelve, since
     `coloredOverride` (`:105`) and `chosenMode` (`:106`) are internal reactive
     state;
   - method and getter rows: declarations at the class's two-space indent that
     are neither `private` nor `override` nor the constructor.

`dist/` is not the source for any of this. The reason is **not** that it is
gitignored — §3.2 reads from `dist/` quite happily — but that the event map is a
type and does not survive to JavaScript at all, and that `dist/mod.d.ts` is a
copy of the very text this guard is about.

### 3.2 In the element, under Chromium: `packages/board-element/src/docs-api.browser.test.ts`

Imports the tables from `@arrowz/engine/docs` and checks only that what they
name exists at runtime:

- every documented property key is a key of `ArrowzBoard.properties`;
- the set of non-null `attribute` values in the table equals
  `ArrowzBoard.observedAttributes` — measured, that is
  `['interactive','play','pad','show-points','point-color','point-radius','lang','enable-colors']`,
  exactly the eight attributes the ten documented properties carry;
- every documented method and getter is an own property name of
  `ArrowzBoard.prototype`.

**Why membership only, and never the shape of an entry.** Lit mutates the
declaration objects in place at finalization: measured,
`properties.coloredOverride` reads `{ state: true, attribute: false }` after
import, not `{ state: true }` as written. A test filtering by
`attribute === false` would catch four entries (`board`, `view` and the two
state ones), not two. Reading `state` at runtime is therefore avoided
altogether — §3.1 reads it from the declaration, where it says what the author
wrote. This also sidesteps a typing problem: `dist/arrowz-board.d.ts` types
`properties` as a literal, so `Object.entries(...)` yields a union and
`v.attribute` does not type-check without a widening the lab could not supply
(`lit` is not a dependency of `apps/lab`).

**The accessors exist from import, with no instance.** `createProperty` defines
each declared property on the prototype —
`node_modules/.pnpm/@lit+reactive-element@2.1.2/node_modules/@lit/reactive-element/development/reactive-element.js:254-262`,
the call being `defineProperty(this.prototype, name, descriptor)` at `:262`;
the production build does the same (`e(this.prototype,t,h)`, where `e` is
`Object.defineProperty`). Finalization is reached through
`static get observedAttributes`, which `customElements.define` reads
synchronously, and `arrowz-board.ts:810` calls `customElements.define` at module
evaluation. Measured: the prototype's name list is identical before and after
`document.createElement('arrowz-board')`, and a fresh `LitElement` subclass that
is never defined has no accessors at all.

### 3.3 The arithmetic revision 1 got wrong

Revision 1 said the prototype leaves "eleven members" after subtracting the
constructor, the lifecycle overrides and the declared property names. The eleven
is right; the path was not. Measured, twice — in Chromium against `src/mod.ts`
and in Node against the `dist/mod.js` the lab consumes, with identical results —
`Object.getOwnPropertyNames(ArrowzBoard.prototype)` holds **45** names:

```
45 − 6 (constructor + attributeChangedCallback, connectedCallback,
        disconnectedCallback, render, updated)
   − 11 (accessors Lit defined; `lang` has none, being `noAccessor: true`)
   − 17 (members declared `private`)
   = 11 public: viewport, pieceCount, gestureMode,
       fit, zoomBy, animateExit, shake, saveState, loadState, restart, emit
```

The seventeen are the trap. `private` is a compile-time annotation that TypeScript
erases, and the class uses no `#` fields, so `watchForRevival`, `syncSession`,
`redraw`, `pieceAt`, `refreshCursor` and twelve others are ordinary own
properties of the prototype at runtime. A guard written as revision 1 described
it — "needs no exception list beyond the lifecycle" — would be **red today**,
naming seventeen undocumented methods, and would read as a documentation hole
rather than as a fact about TypeScript.

This is why the "nothing public is undocumented" direction lives in §3.1, over
the source, where `private` and `override` are visible. §3.2 never enumerates
the prototype; it only asks whether a documented name is on it.

Two further precisions for whoever writes §3.1's parser:

- **Subtraction, if a parser ever needs it, must cover all twelve property
  keys**, not the ten of §3.2: the two `state: true` entries get accessors on
  the prototype exactly like the rest.
- **`^  private ` matches 43 lines, not 17.** The surplus are instance fields
  (`layer`, `vp`, `hostWidth`) and arrow-function properties
  (`toggleGestures`), which live on the instance and never reach the prototype.
  The count is not a check; it is only safe because subtracting a name that is
  absent is a no-op.

### 3.4 What is documented, and the two members that were not

`packages/board-element/README.md` describes nine of the eleven and mentions
neither `pieceCount` nor `emit` (`grep -c` is 0 for both). The docs page
documents all eleven, so §3.1 needs no exception list beyond `private` and
`override`:

- `pieceCount` is a read-only getter a host can use; it was never written down.
- `emit(event)` is the `GameTarget` seam (`game-host.ts:16-20`) through which
  `GameHost` pushes events into the element (`arrowz-board.ts:232,563`). It is
  public, so it is documented as what it is rather than excused.

The element's own README stays a second, unguarded copy; bringing it under a
guard is the element package's work (§6).

## 4. The two debts

### 4.1 `aria-keyshortcuts`

`f` toggles solo (`App.tsx:74-92`'s `useSoloKey`, the lab's only `keydown`
listener on `document`). A grep for `aria-keyshortcuts` across the repository is
empty, and the attribute goes on the solo toggle in `stage/BoardFrame.tsx:93-95`
with the value `"f"`.

**What is not true is that nothing announces the key today.** The button's
accessible name already does: `lab-i18n.ts:118` is
`fullView: 'Full view (key F)'` and `:517` is `'Pełny podgląd (klawisz F)'`.
The attribute adds a machine-readable form beside it.

**The name must not be "tidied".** Six assertions locate that button by the
whole string `Full view (key F)` — `stage/BoardFrame.browser.test.tsx:131` and
`routes/LabLayout.browser.test.tsx:147,150,167,204,265` — and PR #68's
description quotes it as well. Removing `(key F)` as newly redundant would break
every one of them.

The element's own zoom keys belong to the element and are not the lab's to
announce. Where the docs page names them, they are `+` (and `=`), `-` — ASCII
hyphen — and `0` (`arrowz-board.ts:773-775`).

### 4.2 Heading levels

Today the whole lab has two headings — `report/LongestTable.tsx:20` (`h3`) and
`DocsRoute.tsx:10` (`h2`) — and **no `h1`**; `apps/lab/index.html` carries only
a `<title>`.

- `shell/TopBar.tsx`'s `<span className="name">Arrowz</span>` becomes an `h1`
  with the same class. `.fw-top .name` sets only `font-size: 13px`
  (`shell.css:84-86`), so the rule gains `margin: 0` and a weight — an `h1`
  otherwise arrives at `2em` and bold.
- `LongestTable`'s `h3` becomes an `h2`. Its `id="longest-head"` and the table's
  `aria-labelledby` stay; `ReportPanel.browser.test.tsx:122` finds it by id and
  survives.
- **`report.css:48`'s `.fw-report h3` rule moves to `.fw-report h2`.** Without
  this the selector stops matching and the heading falls back to the browser's
  `h2` — 1.5em and bold, against the 11px, 400-weight, letter-spaced rule it
  had. No test measures that style, so every gate would stay green over a
  visible regression.
- The docs pages use `h2` for the page title and `h3` for sections within it,
  styled by `design/docs.css`.

Regions named by `aria-label` — the report, the list, the detail — keep their
names. Turning them into visible headings would change accessible names that
existing tests assert and that PR 5b settled (lab spec §7.2, which covers the
library's three regions).

**This is an extension.** What was recorded was the report's heading levels;
the `h1` is added because a document without one is a real defect and because
the docs pages need a root above their `h2`s. §9 has the provenance.

## 5. Files

```
packages/engine/
  lab-docs.ts                     shared rows + EN/PL descriptions + docsFor(lang)
  lab-docs.test.ts                parity; the event map; nothing public undocumented
  deno.json                       + ./docs
  package.json                    + ./docs
  tsconfig.build.json             + lab-docs.ts
  neutral.test.ts                 + lab-docs.ts
  scripts/node-smoke.mjs          + the dist import, as lab-report has
  lab-i18n.ts                     + ui keys for the docs navigation

packages/board-element/
  src/docs-api.browser.test.ts    everything documented exists at runtime

apps/lab/src/
  AppRoutes.tsx                   + /docs → /docs/element
  routes/DocsRoute.tsx            branches on :what, redirects the unknown
  routes/DocsNav.tsx              <nav> of two links, aria-current="page"
  routes/ElementDocs.tsx          the API tables; the code examples live here
  routes/CliDocs.tsx              both help forms, in a bilingual frame
  design/docs.css                 imported by main.tsx after report.css
  shell/TopBar.tsx                the h1
  stage/BoardFrame.tsx            aria-keyshortcuts="f"
  report/LongestTable.tsx         h3 → h2
  design/report.css               .fw-report h3 → .fw-report h2
```

`packages/board-element` lints and formats with **Deno**
(`project.json`: `deno lint`, `deno fmt --check`), unlike the lab; its `check` is
`tsc` with `types: []`. The new test file answers to those.

## 6. Out of scope

- **Row 7 of the lab spec** — the filmstrip, the parameter diff and the ⌘K
  palette, with the five reservations the code holds. Escape stays unbound.
- **A guard for `packages/board-element/README.md`.** It deserves what
  `readme.test.ts` gives the CLI's, but that is the element package's work.
- **Translating `helpText()`.** The help stays the terminal's own English; the
  frame around it is bilingual.
- **`useSoloKey` without `isComposing`/`defaultPrevented`** (`App.tsx:74-92`) —
  still unfixed, still unclaimed by any PR.

## 7. Testing

- `packages/engine/lab-docs.test.ts` — §3.1's three duties.
- `packages/board-element/src/docs-api.browser.test.ts` — §3.2.
- Route tests: both pages render; the nav links navigate and mark the current
  page; `/docs`, an unknown `:what` and an upper-case one all land on
  `/docs/element`; the Docs tab stays selected on `/docs/cli`; `DocsRoute` keeps
  `<main>` + the tabpanel wiring of §2.4.
- **The CLI page shows both forms.** An implementation rendering only
  `helpText()` would pass every test named above while §1 promises two, so the
  page is asserted to contain a line only `--help=knobs` prints.
- **The long form keeps the terminal's layout.** Its 88 lines are a table
  aligned with `padEnd` (`command.ts:463-477`); `docs.css` gives the block
  `white-space: pre` and a monospace face, or the columns collapse.
- **One existing test must be rewritten, and not only its assertion.**
  `AppRoutes.browser.test.tsx:55` is
  `await expect.element(screen.getByText('element')).toBeVisible()`, resting on
  the `<p>{what}</p>` that goes. Revision 1 predicted it would then pass while
  proving nothing; that is wrong. `getByText` matches substrings
  case-insensitively and `expect.element` is strict, so a page whose nav, title
  and prose all contain "element" resolves to several nodes and the test **fails
  on a strict-mode violation**. Its title (`:50`, "the segment reaches the
  page") and the comment above it (`:44-49`) describe the echoed segment too,
  and go with it.
- Gates: `deno task verify` for the engine, `pnpm nx run-many -t verify` for the
  repository — which for `apps/lab` means six targets, `smoke` included.

## 8. Amendments to the lab spec

`docs/superpowers/specs/2026-09-13-lab-react-app-design.md` gets two:

1. §5.2's docs bullet: the help is called at render, not generated by a prebuild
   script, for the reason in §2.1.
2. §10's row 6: the same correction, and the guards the row did not anticipate —
   the API surface, not only the event map, and split across two packages.

## 9. Provenance of the two debts

Neither debt is written down in the repository. PR #68's "Not here" section
names only the docs route and row 7's additions; a grep for `keyshortcut`,
`isComposing` or heading levels across `docs/` and `.superpowers/` finds nothing
but this file.

They come from the repository's memory, the session note of **2026-09-15**:
`[odłożone] useSoloKey bez isComposing/defaultPrevented (PR 7), aria-keyshortcuts,
poziomy nagłówków raportu (PR 6)`. Two differences from that note are deliberate
and named here rather than smuggled: the heading debt was recorded about the
**report**, and this spec extends it to the document's missing `h1` (§4.2); and
`aria-keyshortcuts` carried no PR number in the note at all.

## 10. What the reviews overturned

Five reviews of revision 1, by domain. Twenty claims fell; the ones that changed
a decision rather than a sentence:

1. **The prototype guard would have been red** on today's code, from seventeen
   `private` members that TypeScript erases (§3.3). Measured.
2. **The guards moved out of the lab.** Put there, they met three walls at once:
   ESLint forbids `node:*` in the lab's `*.test.ts` (`eslint.config.js:25`,
   exempting only `scripts/**/*.mjs` and `*.node.test.ts`); `?raw` would have
   crossed a package boundary; and the property read would not type-check
   without `lit`, which the lab does not depend on. Split between the engine's
   Deno test and the element's browser test, all three vanish.
3. **`NEUTRAL` does not prove browser safety** (§2.1); the running code does.
4. **Two of the four wiring points are loud, not silent** (§2.2), and
   `svg-golden.ts` was evidence only for the other two.
5. **The docs module can trip `neutral.test.ts` with prose** about `document.`
   (§2.2), which is why examples live in the lab.
6. **"Two tablists would be a puzzle" was false** (§2.4) — the lab renders two
   today, by Ruling 13.
7. **The solo key is already announced** by the button's name (§4.1), and four
   places depend on that name.
8. **`report.css` would have regressed silently** under the heading fix (§4.2).
9. **The `<p>{what}</p>` test fails rather than passes** after the rebuild
   (§7).
10. **The debts were attributed to a PR that does not record them** (§9).
