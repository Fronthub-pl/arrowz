# The lab's documentation route — design

Row 6 of the delivery table in
`docs/superpowers/specs/2026-09-13-lab-react-app-design.md` §10: "the docs
route: the element's API guarded by a test against `mod.ts`, and the CLI help
generated from `helpText()` at build time".

The route, the tab, the panel and their tests have existed since PR 5a.
`apps/lab/src/routes/DocsRoute.tsx` is fifteen lines and says so in a comment:
`{/* PR 6 fills this: the element's API, and the CLI help from helpText(). */}`.
What is missing is the content, and the guards that keep it true.

**Revision 3.** Revision 1 was reviewed by five agents, which overturned twenty
claims; revision 2's *corrections* were then attacked by five more, which
overturned nine of them — including one the review round itself had introduced.
§10 records the corrections and which of them were themselves wrong, so nothing
is quietly absorbed.

## 1. What this delivers

Two pages under the Docs tab:

- `/docs/element` — the API of `<arrowz-board>`: properties, methods, getters
  and events, as reference tables.
- `/docs/cli` — the help `deno task carve` prints, in both its forms.

Plus two debts: `aria-keyshortcuts` on the solo toggle, and a heading hierarchy
the lab does not have. Their provenance, and how this spec widens them, is §9.

## 2. Decisions

### 2.1 The CLI help is called, not generated

**The lab spec §5.2 says the help is "generated at build time … by a prebuild
script importing `@arrowz/engine/command` from `dist/`". That is amended: the
component calls `helpText()` at render.**

The proof that this is safe in a browser is not a list but running code.
`apps/lab/src/App.tsx:2` imports `storeRequest` from `@arrowz/engine/command` —
a value import resolved to `dist/command.js` — and the worker's build-output
smoke imports from the same subpath (`apps/lab/scripts/worker-smoke.mjs:15`).
Measured: a grep of the whole of `packages/engine/dist/` for `Deno.`,
`process.`, `import.meta`, `globalThis`, `navigator`, `window.` and `document.`
is **empty**, and `helpText()` produces byte-identical output from `dist/` under
Node and from source under Deno (SHA-256 equal).

Two precisions the reviews added. First, the code genuinely new to the browser
is small: `KNOB_ROWS` (`command.ts:358`) and `RULE_ROWS` (`:412`) are
module-level IIFEs, so `rangeText → refusedAlone → validateParams` **already
runs in the browser** on every page load today. What `helpText` adds is its own
body, `list`, `cellAt` and `environment()` — and `environment()` (`:502-507`) is
a **text literal that reads no environment variable**. Second, what does *not*
prove any of this is `packages/engine/neutral.test.ts`: it greps seven patterns
over one file's text (`:23-31`), walks no imports, and matches neither
`import.meta` nor `navigator`. Its own header claims "the compiler keeps DOM out
of them", which is false for the Node build — `tsconfig.build.json:9` is
`"lib": ["es2022", "dom"]`.

Measured output: `helpText()` is 36 lines / 2129 characters,
`helpText({ knobs: true })` is 88 lines / 9898 characters, neither with a
trailing newline. **Characters, not bytes**: the long form holds five non-ASCII
glyphs (`×`, `–`), so it is 9905 bytes, and `deno task carve --help=knobs | wc -c`
reports 9906 with `console.log`'s newline. A test must compare strings.

**What a prebuild would cost.** `apps/lab/project.json:35` makes `verify` depend
on six targets — `check`, `lint`, `fmt`, `test`, `build`, `smoke`. Without the
generated file, **four** go red, not three: the three that read it (`check`,
`test`, `build`) and `smoke`, which inherits `dependsOn: ["build"]` from
`nx.json`'s `targetDefaults` — a dependency `project.json` does not show. Two
more would *inspect* the file, but only in one of its possible shapes: measured,
a generated `.ts` is caught by both `eslint` and `prettier`, a `.json` by
`prettier` alone, and a `.txt` — the natural shape for terminal text — **by
neither**. And nothing would order the prebuild: `dependsOn: ["^build"]`
(`project.json:9,14,20`) builds *dependencies*, so a prebuild would need a step
of its own.

**"Cannot go stale" needs its qualifier.** The lab reads `dist/`, the terminal
reads source, so editing `command.ts` without rebuilding does make them differ —
as it does for every other engine function the lab uses. The true and stronger
statement: the help cannot drift from the `PARAM_SPEC` the lab itself renders
from, because `dist/command.js` and the lab's worker import the same
`dist/engine.js`. There is no drift through `COMMAND_PREFIX` (one constant,
`command.ts:39`) and none through locale (`padEnd`, `String(n)` are
locale-independent; the SHA-256 equality above measures it).

This also removes the only reason the CLI page would need a guard of its own:
there is no copy to compare.

### 2.2 The text lives in a new engine module

`CLAUDE.md` names `packages/engine/lab-i18n.ts` as the dictionary. That file is
708 lines of short labels; this is reference rows and prose, and a lot of it.

It goes into **`packages/engine/lab-docs.ts`**, exported as
`@arrowz/engine/docs`: the fifth member of the `lab-*` family
(`lab-simple.ts`, `lab-presets.ts`, `lab-i18n.ts`, `lab-report.ts`).
`CLAUDE.md`'s neutrality sentence — which names four files and already omits
`lab-report.ts` — gains `lab-docs.ts` too, so the list stops drifting from the
`NEUTRAL` table it illustrates.

**Wiring, and what each omission costs.** Measured, one variable at a time,
with a green control each time:

| File | What to add | If forgotten |
|---|---|---|
| `packages/engine/package.json` | `"./docs"` → `dist/lab-docs.{js,d.ts}` | **loud, three consumers**: `TS2307` and `vite build` failure in the lab, and the same in `packages/board-element`, which §3.2 makes import this subpath |
| `packages/engine/tsconfig.build.json` | `"lab-docs.ts"` in `include` | **loud, two gates**: the same `TS2307`, and `node-smoke.mjs` with `ERR_MODULE_NOT_FOUND` |
| `packages/engine/deno.json` | `"./docs": "./lab-docs.ts"` | **silent**: no Deno consumer imports these subpaths (measured: `packages/cli` uses only `.`, `./command`, `./simple`) |
| `packages/engine/neutral.test.ts` | `'lab-docs.ts'` in `NEUTRAL` | **silent**: the list is hand-written |

`packages/engine/svg-golden.ts`, absent from both `NEUTRAL` and
`tsconfig.build.json` with nothing failing, is evidence for the silent pair
only; it has no Node consumer and so never tests the loud one.

`scripts/node-smoke.mjs` gains a `lab-docs` import — and not merely "for parity"
with `lab-report` (`:9`). Measured, that one line is a gate nothing else
provides: `tsconfig.build.json` carries `lib: dom`, so `tsc` accepts
`document.title` in engine code, and it is Node's `ReferenceError` on import
that catches it.

**The constraint the module inherits from `NEUTRAL`, in full.** The test greps
*text*, so a module whose subject is the browser can trip a rule it does not
break. Measured against real prose, the practical prohibitions are wider than
revision 2 said:

- ending a sentence with `document`, `window`, `process` or **`Deno`** — in
  English *and* in Polish (`…na Deno.` matches `/\bDeno\./`), which bears
  directly on the CLI page;
- **`localStorage` anywhere at all**, including inside backticks, because
  `/\blocalStorage\b/` has no full stop to write around. This is exactly the
  word `gestureMode` needs: the element stores the gesture choice there
  (`arrowz-board.ts:53,61`), and the element's own README says so in prose
  (`README.md:69`).

Therefore: **code examples live in the lab's components**, and the module's
prose writes "the page", "the DOM", "local storage", "runs on Deno 2.9" with the
version attached. Machine columns are safe — measured, the types, attribute
names, event names and member names produce zero matches. The plan greps the
module against all seven patterns before the commit that adds it to `NEUTRAL`.

One honest note, since it is a cost we are choosing to pay: for *code*,
`/\bdocument\./` and `/\bwindow\./` are redundant — `deno check` already refuses
them in engine sources (measured: `TS2584`, because the repo config sets no DOM
lib). In `lab-docs.ts` those two patterns therefore constrain nothing but prose.
We keep them rather than carve out an exception, because an exception in a
neutrality test is how the rule that `neutral.test.ts:42-44` describes was lost
the first time.

**How the lab reads it.** `Dict` (`lab-i18n.ts:633-644`) has no room for
documentation. `lab-docs.ts` exports `docsFor(lang)`, and the lab wraps it in a
hook beside `useDictionary`, **built once per language exactly as `DICTS` is**
(`apps/lab/src/i18n.ts:9`) — a fresh object per render would be a new dependency
for every consumer. UI chrome around the content — the navigation's labels and
its group name — stays in `lab-i18n.ts`'s `ui` section, because it is chrome.

### 2.3 Machine columns exist once, and the notation matters

A row is `{ key, type, attribute, def }` in **one** shared table; the
description lives in a per-language map keyed by `key`.

**The notation is load-bearing, and revision 2 got it wrong.** Written as a type
annotation — `ELEMENT_PROPS: readonly PropRow[] = [...] as const` — the
annotation wins and `PropKey` degenerates to `string`: measured, an arbitrary
key type-checks, a missing description type-checks, and
`noUncheckedIndexedAccess` adds `| undefined`, pushing `docsFor` toward the
value-changing fallback `CLAUDE.md` forbids in the engine. The shape must be:

```
const ELEMENT_PROPS = [...] as const satisfies readonly PropRow[]
type PropKey = (typeof ELEMENT_PROPS)[number]['key']
const EN = { props: { … } } as const satisfies { props: Record<PropKey, string> }
```

Measured under the engine's three flags: a missing description is **TS2741**, an
extra key is **TS2353**, and `d.props[key]` is `string` with no `| undefined`.

This is the rule `packages/cli/readme.test.ts:7-9` states verbatim — "The prose
is translated; the machine columns … are not, and this test is what says so" —
and it is what makes "one guard checks both languages" literally true: there is
one copy of the machine data.

It also settles two questions. `Widen` (`lab-i18n.ts:251`) is not exported, and
is not needed: it binds PL to EN, never to the table, which is the binding this
module requires. And **the EN/PL parity test must not duplicate the compiler**
(§3.1): with the shape above, a missing or extra key can never reach runtime, so
a test asserting it is a test that cannot fail.

### 2.4 Two sub-pages, switched by real links

`/docs/:what` already matches `/docs/cli`; measured with `matchRoutes` on
react-router 8.3.1, and route **order is irrelevant** — matching is by rank, so
adding `/docs` is safe in any position. `AppRoutes` gains `/docs` →
`/docs/element`: today the bare path falls to `*` and lands the reader in the
lab, a surprising answer to a link. `/docs/cli/extra` keeps falling to `*`.
`/DOCS/CLI` matches `:what = 'CLI'` (matching is case-insensitive by default),
which is unknown and redirects to `/docs/element`. Today `/docs/anything`
renders the heading and the raw segment (`DocsRoute.tsx:10-12`), not an empty
panel.

**Navigation is a `<nav>` of two `NavLink`s.** Revision 1 chose `Segmented` on
the false ground that "two tablists would be a puzzle" — the lab renders two
today (`shell/TabRow.tsx:53`, `console/GroupRail.tsx:85`), and
`GroupRail.tsx:14-16` records Ruling 13, which chose a tablist deliberately.
With that gone, links win on their merit: a documentation page has an address
worth copying, opening in a new tab and middle-clicking.

**The component must be named, because the three ways to write "a link" differ
violently here.** The lab has no router link today — measured, zero `<Link>` and
zero `<NavLink>`; every navigation goes through `useNavigate`. So:

- a plain `<a href>` would **reload the page**, killing the run in flight and
  disposing the board's GL context — precisely what Ruling 5 and
  `AppRoutes.tsx:7-11` exist to prevent;
- `<Link>` never sets `aria-current`, so it would need one computed by hand;
- **`NavLink` sets `aria-current="page"` itself when active** — verified in the
  installed package, `react-router/dist/development/lib/dom/lib.js:372,407`,
  where the prop defaults to `"page"`.

`NavLink` it is, and the plan states that this is the lab's first router link.
Two cautions from the same source: `end` defaults to `false`, so a `NavLink`
pointing at `/docs` would be active on `/docs/cli` as well — both our targets
are siblings, so this does not arise, but the spec adds a `/docs` route and the
temptation is now in reach. And `aria-current` is not written by hand: `docs.css`
selects `[aria-current='page']`, which does not collide with the lab's existing
`[aria-current='true']` rules (`run.css:220`, `library.css:83`), those being
scoped by class and by a different value.

`selectedIndex` (`TabRow.tsx:15`) returns 2 for anything under `/docs`, so the
Docs tab stays selected on both pages with no change — with one measured edge:
`startsWith('/docs')` **is** case-sensitive, so on `/DOCS/CLI` the Lab tab is
selected for the one frame before the redirect. The test therefore asserts the
state *after* the redirect, not merely that a panel is present.

Clicking the Docs tab while on `/docs/cli` returns to `/docs/element`, since the
tab's path is `/docs/element` (`TabRow.tsx:10`). That is a decision — the tab
means "the documentation", and its first page is the element's.

**`DocsRoute` keeps its shell**: `<main>` around
`<section id="docs-panel" role="tabpanel" aria-labelledby="tab-docs-panel"
tabIndex={0}>`, asserted by `AppRoutes.browser.test.tsx:52-54,72-79` and polled
by `Workspace.browser.test.tsx:645`. Measured: adding a `<nav>` inside that
section breaks none of them.

## 3. The guards

Split by what each environment can see. "Nothing public is undocumented" is a
question about *declarations*, which only the source answers. "Everything
documented exists" is a question about *runtime*, which only the browser
answers.

### 3.1 In the engine, under Deno: `packages/engine/lab-docs.test.ts`

Reads the element's sources as text. The precedent is direct:
`neutral.test.ts:49-50` already walks a sibling package with
`join(dirname(fromFileUrl(import.meta.url)), '..', 'cli')`, and
`packages/engine/project.json:12` runs the engine's tests with an unrestricted
`--allow-read`.

1. **EN/PL parity, asserting what the compiler cannot** (§2.3): every
   description non-empty, and no PL description identical to its EN source —
   which is what `lab-i18n.test.ts` already does. Presence and absence of keys
   are compile errors and are not re-tested here.
2. **The event map**, parsed from `packages/board-element/src/mod.ts`, bounded
   to the body of `interface HTMLElementEventMap`. **Bound it by the first `}`
   after the header, not by indentation**: measured, an indentation-based end
   breaks if the block ever leaves `declare global`, and the unbounded pattern
   swallows `'arrowz-board': ArrowzBoard` from the neighbouring
   `HTMLElementTagNameMap` (`mod.ts:42-43`), making the guard permanently red.
   A sanity assertion requires at least one name. Set equality, both ways; the
   five names are at `mod.ts:45-51`.
3. **Set equality against the declarations** in
   `packages/board-element/src/arrowz-board.ts` — equality, not containment, and
   this is the correction that matters most:
   - **property rows**: the keys of `static properties` (`:84-107`) whose
     declaration lacks `state: true` — ten of twelve — together with the
     `attribute` each declares;
   - **method and getter rows**: **signatures** — a name followed by `(`, or a
     `get`/`set` accessor — at the class's two-space indent, excluding
     `private`, `override` and the constructor.

**Why "signatures" and not "declarations".** Measured: the rule as revision 2
worded it yields 109 candidates, not 11. Among them are eleven `declare board:
…` lines, which are declarations at two-space indent, are not `private`, are not
`override` and are not the constructor. A parser requiring a signature returns
exactly the eleven of §3.3. Do not key the parser on `declare` either: `lang`
has a `properties` entry and **no** `declare` line, so a `declare`-based parser
finds nine rows where there are ten.

**Why equality and not containment.** Measured: with containment, a table
documenting `redraw` and `pieceAt` — both `private`, both on the prototype — is
green, and so is one documenting `chosenMode`, which is internal state. Neither
guard protests. Equality reddens both, because neither name is in the set of
public signatures or in the set of non-`state` keys.

`dist/` is not the source here. Not because it is gitignored — §3.2 reads from
`dist/` quite happily — but because the event map is a type that does not
survive to JavaScript, and `dist/mod.d.ts` is a copy of the very text this guard
is about.

### 3.2 In the element, under Chromium: `packages/board-element/src/docs-api.browser.test.ts`

Imports the tables from `@arrowz/engine/docs` and checks that what they name
exists at runtime:

- every documented property key is a key of `ArrowzBoard.properties`;
- **per key**, the documented `attribute` agrees with the declaration Lit holds:
  `false` → no attribute, a string → that string, absent → the key lower-cased.
  Revision 2 compared the *sets* instead, and measured, that passes a table
  which swaps `show-points` and `point-color` between rows — the set is
  unchanged while the mapping lies. `ArrowzBoard.observedAttributes` (measured:
  the eight names) remains a useful cross-check, but it cannot be the only one.
- every documented method and getter is an own property name of
  `ArrowzBoard.prototype`.

Typing is not an obstacle **here**: `lit` is a dependency of
`packages/board-element`, so `const decls: Record<string, PropertyDeclaration |
undefined> = ArrowzBoard.properties` type-checks with no cast under the
package's `types: []`. Revision 2 justified a weaker check by the lab's lack of
`lit` — an argument that stopped applying the moment the test moved.

What must still be avoided is reading `state` at runtime: Lit mutates the
declaration objects in place, so `properties.coloredOverride` reads
`{ state: true, attribute: false }` after import. §3.1 reads `state` from the
declaration, where it says what the author wrote.

**The accessors exist from import, with no instance.** `createProperty` defines
each declared property on the prototype — `@lit/reactive-element@2.1.2`,
`development/reactive-element.js:254-262`, the call at `:262`; the production
build does the same. Finalization is reached through `static get
observedAttributes`, which `customElements.define` reads synchronously, and
`arrowz-board.ts:810` calls it at module evaluation. Measured: the prototype's
name list is identical before and after `document.createElement`, and a fresh
`LitElement` subclass that is never defined has no accessors at all.

### 3.3 The arithmetic, and the trap under it

Measured twice — in Chromium against `src/mod.ts`, in Node against the
`dist/mod.js` the lab consumes, with identical results —
`Object.getOwnPropertyNames(ArrowzBoard.prototype)` holds **45** names:

```
45 − 6 (constructor + attributeChangedCallback, connectedCallback,
        disconnectedCallback, render, updated)
   − 11 (accessors Lit defined; `lang` has none, being `noAccessor: true`)
   − 17 (members declared `private`)
   = 11 public: viewport, pieceCount, gestureMode,
       fit, zoomBy, animateExit, shake, saveState, loadState, restart, emit
```

The seventeen are the trap: `private` is erased at compile time and the class
uses no `#` fields, so `watchForRevival`, `syncSession`, `redraw`, `pieceAt` and
thirteen others are ordinary prototype properties at runtime. A guard written as
revision 1 described it — "no exception list beyond the lifecycle" — would be
**red today** with seventeen false findings, reading as a documentation hole
rather than as a fact about TypeScript.

Two precisions for the parser. If it ever subtracts property names it must
subtract **all twelve** keys, not the ten of §3.2: the two `state: true` entries
get accessors like the rest. And `^  private ` matches **43** lines, not 17 —
the surplus are instance fields and arrow-function properties, which never reach
the prototype; subtracting an absent name is a no-op, so the over-match is safe,
but the count is not a check.

One shape falls between both guards: a **public** arrow-function field would be
on the instance (invisible to §3.2) and is not a signature (invisible to §3.1).
None exists today — every `readonly … = (` in the class is `private` — and the
plan records that a future one needs a rule rather than assuming it never comes.

### 3.4 What is documented

`packages/board-element/README.md` describes nine of the eleven and mentions
neither `pieceCount` nor `emit` (measured: zero occurrences of each). The docs
page documents all eleven, so §3.1 needs no exception list beyond `private` and
`override`:

- `pieceCount` is a read-only getter a host can use; it was never written down.
- `emit(event)` is the `GameTarget` seam (`game-host.ts:16-20`) through which
  `GameHost` drives the element (`arrowz-board.ts:232,563`). Public, so
  documented as what it is.

**The element's zoom keys are not documented here.** Revision 2 said the page
would name `+`, `=`, `-` and `0` (`arrowz-board.ts:773-775`); it is dropped.
They have no row in §2.3's shape, no guard in §3, and nothing in §1 promises
them — they would be the one fragment of this page that could silently go wrong.
The page points at the element's README for them.

## 4. The two debts

### 4.1 `aria-keyshortcuts`

`f` toggles solo (`App.tsx:74-92`'s `useSoloKey`, measured to be the lab's only
`keydown` listener on `document`). The attribute goes on the solo toggle in
`stage/BoardFrame.tsx:93-95`, with the value `"f"`.

Two corrections. **The key is already announced**: the button's accessible name
is `fullView` — `lab-i18n.ts:118` `'Full view (key F)'` and `:517`
`'Pełny podgląd (klawisz F)'`. The attribute adds a machine-readable form beside
it. And **nothing in the repository carries the attribute except this file** —
which is how §9 puts it and how §4 must too: a bare "the grep is empty" is false
the moment the document itself spells the word.

**The name must not be "tidied".** Six assertions locate that button by the
whole string `Full view (key F)` — `stage/BoardFrame.browser.test.tsx:131` and
`routes/LabLayout.browser.test.tsx:147,150,167,204,265`, a list measured to be
complete, with no Polish variant among them — and PR #68's description quotes it
as well. Removing `(key F)` would break every one.

### 4.2 Heading levels

Today the whole lab has two headings — `report/LongestTable.tsx:20` (`h3`) and
`DocsRoute.tsx:10` (`h2`) — and **no `h1`**; `apps/lab/index.html` carries only
a `<title>`.

- `shell/TopBar.tsx`'s `<span className="name">Arrowz</span>` becomes an `h1`
  with the same class. Measured, an `h1` there does **not** arrive at `2em`:
  `.fw-top .name` has specificity (0,2,0) and already wins the size, so the
  element renders at 13px. What changes is `font-weight` (to 700) and margins
  (8.71px top and bottom), which the 48px bar absorbs. The rule still gains
  `margin: 0` and an explicit weight, so the bar does not depend on a coincidence.
  Note for whoever looks before and after: `shell.css:35` sets
  `font-synthesis: none`, so a missing bold face is simply not synthesised.
- `LongestTable`'s `h3` becomes an `h2`; `id="longest-head"` and the table's
  `aria-labelledby` stay (`ReportPanel.browser.test.tsx:122` finds it by id).
- **`report.css:48`'s `.fw-report h3` rule moves to `.fw-report h2`.** Measured
  both ways: it is the only heading rule in the lab's CSS, no structural
  selector depends on a heading's type, and no reset touches `h1` — so moving it
  suffices. Without the move the heading renders at 18px/700 instead of
  11px/400, and **every gate stays green**: the report's eight browser tests
  pass over the regression.
- The docs pages use `h2` for the page title and `h3` for sections, styled by
  `design/docs.css`.

Regions named by `aria-label` keep their names; the debt is about levels.
Measured: `<header>` remains the `banner` landmark with an `h1` inside it, and
`TopBar.browser.test.tsx` passes unchanged — which is exactly why §7 adds an
assertion for the `h1`, since **no existing test would notice it**.

## 5. Files

```
packages/engine/
  lab-docs.ts                     shared rows + EN/PL descriptions + docsFor(lang)
  lab-docs.test.ts                §3.1: parity, event map, set equality
  deno.json                       + ./docs
  package.json                    + ./docs
  tsconfig.build.json             + lab-docs.ts
  neutral.test.ts                 + lab-docs.ts
  scripts/node-smoke.mjs          + the dist import
  lab-i18n.ts                     + ui keys for the docs navigation

packages/board-element/
  src/docs-api.browser.test.ts    §3.2: documented names exist at runtime

apps/lab/src/
  AppRoutes.tsx                   + /docs → /docs/element
  AppRoutes.browser.test.tsx      the echoed-segment test rewritten (§7)
  routes/DocsRoute.tsx            branches on :what, redirects the unknown
  routes/DocsNav.tsx              <nav> of two NavLinks
  routes/ElementDocs.tsx          the API tables; the code examples live here
  routes/CliDocs.tsx              both help forms, in a bilingual frame
  docs/useDocs.ts                 docsFor(lang), built once per language
  design/docs.css                 imported by main.tsx after report.css
  main.tsx                        + the docs stylesheet
  shell/TopBar.tsx                the h1
  shell/TopBar.browser.test.tsx   + the h1 assertion
  design/shell.css                .fw-top .name gains margin and weight
  stage/BoardFrame.tsx            aria-keyshortcuts="f"
  report/LongestTable.tsx         h3 → h2
  design/report.css               .fw-report h3 → .fw-report h2

CLAUDE.md                         lab-docs.ts joins the neutrality sentence
docs/superpowers/specs/2026-09-13-lab-react-app-design.md   the two amendments of §8
```

`packages/board-element` lints and formats with **Deno** (`deno lint`,
`deno fmt --check`) and type-checks with `tsc` under `types: []`; measured, a new
`*.browser.test.ts` there passes all four of its gates.

## 6. Out of scope

- **Row 7 of the lab spec** — the filmstrip, the parameter diff and the ⌘K
  palette. Escape stays unbound.
- **A guard for `packages/board-element/README.md`**, which is still a second,
  unguarded copy of the same API. That is the element package's work.
- **Translating `helpText()`.** The help stays the terminal's own English.
- **`useSoloKey` without `isComposing`/`defaultPrevented`** (`App.tsx:74-92`) —
  unclaimed by any PR *in the repository*; the memory note of §9 puts it against
  row 7.

## 7. Testing

**In the engine** — `lab-docs.test.ts`, the three duties of §3.1.

**In the element** — `docs-api.browser.test.ts`, the three checks of §3.2.

**In the lab:**

- Both pages render; `NavLink`s are real anchors with `href`, since that is the
  whole argument for choosing them, and the current one carries
  `aria-current="page"`.
- `/docs`, an unknown `:what` and an upper-case one all land on `/docs/element`;
  `/docs/cli/extra` lands on `/`. The upper-case case asserts the state **after**
  the redirect — address and selected tab — because `selectedIndex` is
  case-sensitive and the Lab tab is selected for the frame before it.
- The Docs tab stays selected on `/docs/cli`, and clicking it returns to
  `/docs/element`.
- `DocsRoute` keeps `<main>` + the tabpanel wiring of §2.4.
- A language switch changes the descriptions on the page — the only assertion
  that `docsFor` is wired to the store at all.
- **Both help forms are shown.** Two assertions, not one: revision 2's single
  "a line only `--help=knobs` prints" is passed by an implementation rendering
  only the long form. Measured markers — `Rules (checked together with the
  ranges):` appears only in the long form, `Knobs: --lmax=` only in the short.
  Beware the traps measured alongside them: `--help=knobs`, `Environment:` and
  `A knob flag is its key in lower case` appear in **both**.
- **The long form keeps the terminal's layout**, measured in the browser rather
  than asserted about CSS text: `white-space: pre` **and `overflow-x: auto`**.
  The longest line is 296 characters ≈ 2317px at 13px monospace — with `pre`
  alone the whole page scrolls sideways, and at the 414px viewport the lab's
  whole-app tests use it is 5.6× the screen. `pre-wrap` keeps the spaces but
  breaks the table rows, so it is not an alternative.
  When asserting text inside that block, remember `getByText` normalises
  whitespace: assert on lines with single spaces, never on a padded table row.
- **`aria-keyshortcuts="f"` is asserted**, and so is the `h1`
  (`getByRole('heading', { level: 1, name: 'Arrowz' })`), and so is the report
  heading's computed style after the move — measured, none of these has an
  existing test that would notice.

**One existing test is rewritten, and not only its assertion.**
`AppRoutes.browser.test.tsx:55` is
`await expect.element(screen.getByText('element')).toBeVisible()`, resting on the
`<p>{what}</p>` that goes. Both previous revisions predicted its failure mode
wrongly, from a type signature rather than from the runtime: in Vitest 5
`browser.locators.exact` defaults to **`true`**
(`vitest/dist/chunks/index.B89dZ0-N.js:14620`, against a `@default false` in the
types), so `getByText` matches a node's **whole** text, case-sensitively.
Measured: with `<a>Element</a>` and `<p>element</p>` both present the test
**passes**. So after the rebuild it fails with `Cannot find element` — unless
some node's entire text is exactly `element`, in which case it passes while
proving nothing, or two such nodes exist, in which case it is a strict-mode
violation. It is rewritten because it asserts an echoed route segment, whatever
the outcome would be; its title (`:50`) and comment (`:44-49`) go with it.

**Gates**: `deno task verify` for the engine, `pnpm nx run-many -t verify` for
the repository — six targets for `apps/lab`, `smoke` included.

## 8. Amendments to the lab spec

`docs/superpowers/specs/2026-09-13-lab-react-app-design.md` gets two:

1. §5.2's docs bullet: the help is called at render, not generated by a prebuild
   script (§2.1).
2. §10's row 6: the same correction, and the guards the row did not anticipate —
   the API surface rather than only the event map, split across two packages.

## 9. Provenance of the two debts

Neither debt is written down in the repository: measured across `docs/`,
`.superpowers/`, the code and `git log`, the only occurrences of
`aria-keyshortcuts` and `isComposing` are **in this file**. PR #68's "Not here"
section lists three items — the library (PR 5), the docs route (PR 6), and the
filmstrip, diff strip and ⌘K (PR 7) — and none of them is a debt.

They come from the repository's memory, the session note of **2026-09-15**:
`[odłożone] useSoloKey bez isComposing/defaultPrevented (PR 7), aria-keyshortcuts,
poziomy nagłówków raportu (PR 6), …`. Two differences from that note are
deliberate, and named rather than smuggled: the heading debt was recorded about
the **report**, and this spec extends it to the document's missing `h1` (§4.2);
and `aria-keyshortcuts` carried no PR number there at all, so §1's "two debts"
means two debts this PR adopts, not two the note assigned to row 6.

## 10. What the two review rounds changed

**Round one** attacked revision 1 and overturned twenty claims. Two changed a
decision rather than a sentence:

1. The prototype guard would have been **red** on today's code, from seventeen
   `private` members TypeScript erases (§3.3).
2. The guards left the lab. There they met three walls at once — ESLint forbids
   `node:*` in the lab's test files, a `?raw` import would have crossed a package
   boundary, and the property read would not type-check without `lit`. Split
   between the engine's Deno test and the element's browser test, all three go.

The rest corrected reasons, not decisions: `NEUTRAL` does not prove browser
safety (§2.1); two of four wiring points are loud (§2.2); prose about the DOM can
trip the neutrality grep (§2.2); "two tablists would be a puzzle" was false
(§2.4); the solo key is already announced (§4.1); `report.css` would regress
silently (§4.2); the debts were attributed to a PR that does not record them
(§9).

**Round two** attacked those corrections and overturned nine of them:

1. §3.1's parser rule, taken literally, yields **109** candidates, not 11 —
   `declare` lines qualify. It now says "signatures".
2. Containment let a table document `private` members and internal state, both
   green. It is now **set equality**.
3. The attribute **set** equality passes a table that swaps two attributes
   between rows. It is now a per-key check — which type-checks without a cast,
   because the test moved to a package that has `lit`.
4. §2.3's notation, written as an annotation, **disarmed the guarantee it
   existed for**; it is now `as const satisfies`.
5. Which in turn made the EN/PL parity test one that cannot fail. It now asserts
   what the compiler cannot.
6. The forbidden-word list was understated: `localStorage` anywhere, and a
   sentence ending in `Deno` — in Polish too.
7. Four gates go red without a generated file, not three (`smoke` inherits
   `dependsOn` from `nx.json`), and `lint`/`fmt` would inspect it only in some of
   its shapes. "Cannot go stale" needed its qualifier.
8. "A line only `--help=knobs` prints" is a one-sided assertion; two markers are
   needed, and they are measured.
9. **The rewritten-test mechanism was wrong in both revisions.** Revision 1 said
   it would pass silently; revision 2 "corrected" that to a strict-mode
   violation; measured, it fails with `Cannot find element` — and revision 1's
   outcome is the one that occurs under a condition this page can easily meet
   (§7). A correction is not right merely because it followed a review.

Round two also named what neither round had: the navigation had no **component**
(§2.4), and `<a href>` would have killed the run and the GL context; `h1` and
`aria-keyshortcuts` had no test (§7); and the element's zoom keys had no guard,
which is why they are now out of scope (§3.4).
