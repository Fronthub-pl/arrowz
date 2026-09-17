# The lab's documentation route — design

Row 6 of the delivery table in
`docs/superpowers/specs/2026-09-13-lab-react-app-design.md` §10: "the docs
route: the element's API guarded by a test against `mod.ts`, and the CLI help
generated from `helpText()` at build time".

The route, the tab, the panel and their tests have existed since PR 5a.
`apps/lab/src/routes/DocsRoute.tsx` is fifteen lines and says so in a comment:
`{/* PR 6 fills this: the element's API, and the CLI help from helpText(). */}`.
What is missing is the content, and the guards that keep it true.

## 1. What this delivers

Two pages under the Docs tab:

- `/docs/element` — the API of `<arrowz-board>`: properties, methods, getters
  and events, as reference tables.
- `/docs/cli` — the help `deno task carve` prints, in both its forms.

Plus the two debts PR 4b recorded against this row: `aria-keyshortcuts` on the
solo toggle, and a heading hierarchy the lab does not have.

## 2. Decisions, and what each one overrules

### 2.1 The CLI help is called, not generated

**The lab spec §5.2 says the help is "generated at build time … by a prebuild
script importing `@arrowz/engine/command` from `dist/`". That is amended: the
component calls `helpText()` at render.**

The sentence was written before the lab imported the engine's command module at
runtime. It does now: `apps/lab/src/App.tsx:2` is
`import { storeRequest } from '@arrowz/engine/command'` — the same package, the
same `exports` entry, the same `dist/`. `command.ts` is on `neutral.test.ts`'s
`NEUTRAL` list, so it reaches for no Deno, DOM, Node or process API and is safe
in a browser bundle.

Measured, the output is 36 lines / 2129 characters for `helpText()` and 88
lines / 9898 characters for `helpText({ knobs: true })`, built from
`PARAM_SPEC`, which the bundle already carries (`console/KnobPanel.tsx`
imports it). A prebuild would save that text at the cost of the repository's
first generated source file — one that five gates (`check`, `lint`, `fmt`,
`test`, `build`) would each have to find on disk before running, and that could
go stale against its source. A call cannot go stale.

This also removes the only reason the docs pages would need a guard of their
own for the CLI side: there is no copy to compare.

### 2.2 The text lives in a new engine module, not in `lab-i18n.ts`

`CLAUDE.md` names `packages/engine/lab-i18n.ts` as the dictionary. That file is
708 lines of short labels and help strings. The documentation is prose and
reference rows — a different kind of text and a large amount of it.

It goes into **`packages/engine/lab-docs.ts`**, exported as
`@arrowz/engine/docs`: the fifth member of the `lab-*` family
(`lab-simple.ts`, `lab-presets.ts`, `lab-i18n.ts`, `lab-report.ts`). Same shape
as the dictionary — `EN` as the source language in code, `PL` as the
translation, widened types, and a parity test modelled on `lab-i18n.test.ts`.

`CLAUDE.md`'s neutrality sentence names `command.ts`, `lab-simple.ts`,
`lab-presets.ts` and `lab-i18n.ts`. It is illustrative rather than exhaustive —
it already omits `lab-report.ts`, which is neutral and on `NEUTRAL` — so adding
`lab-docs.ts` there is a courtesy, not a requirement. The requirement is the
`NEUTRAL` list itself, below.

**Four wiring points, none of them enforced by any test:**

| File | What to add |
|---|---|
| `packages/engine/deno.json` | `"./docs": "./lab-docs.ts"` in `exports` |
| `packages/engine/package.json` | `"./docs": { "types": "./dist/lab-docs.d.ts", "default": "./dist/lab-docs.js" }` |
| `packages/engine/tsconfig.build.json` | `"lab-docs.ts"` in `include` |
| `packages/engine/neutral.test.ts` | `'lab-docs.ts'` in `NEUTRAL` |

That none of these is checked is not a guess: `packages/engine/svg-golden.ts`
is in neither `NEUTRAL` nor `tsconfig.build.json`, and nothing fails. Forgetting
one is silent, so the plan names all four as separate, verifiable steps.

### 2.3 Machine columns are not translated

A row is `{ name, type, attribute, default, help }`. Only `help` is
translated. This is the rule `packages/cli/readme.test.ts` already recorded for
the knob tables — "the prose is translated; the machine columns — flag, range,
step, default — are not, and this test is what says so" — and it is what lets
one guard check both languages at once.

### 2.4 Two sub-pages, not two sections

`/docs/:what` already matches `/docs/cli`; `AppRoutes.tsx` needs no new route.
The component branches on `what`, and an unknown value redirects to
`/docs/element` — today `/docs/anything` renders an empty panel, because the
`*` route cannot catch a path the `:what` route matched.

Navigation is the existing `shell/Segmented.tsx` (a radio group with the arrow,
Home and End keys already right), not a second `role="tablist"`: `TabRow` is
the page's tab strip, and two of them would be a puzzle. `selectedIndex` in
`TabRow.tsx` returns 2 for anything starting with `/docs`, so the Docs tab stays
selected on both pages with no change.

## 3. The guards

Three, each in the vitest project that can run it. The lab's `vitest.config.ts`
has `node` (`src/**/*.test.ts`), `node-integration` (`*.node.test.ts`) and
`chromium` (`*.browser.test.*`).

### 3.1 Events — parsed from `mod.ts`, in the `node` project

The five event names are the lab spec's own ask, and the mock got them wrong:
it carried two incompatible event vocabularies. The real ones are
`piece-click`, `piece-removed`, `life-lost`, `finished`, `viewport-change`.

They must be parsed from the text of `packages/board-element/src/mod.ts`,
because `HTMLElementEventMap` is a `declare global` block — a type, with no
runtime existence. `dist/` is not an option either: it is in `.gitignore`, and
its `.d.ts` is an artefact of the source this guard is about.

The check runs both ways: every name in the interface appears in the
documentation's event rows, and every documented event name appears in the
interface.

### 3.2 Properties — read from the class, in the `chromium` project

`ArrowzBoard` declares `static override properties` as a plain object
(`arrowz-board.ts:84`), so the browser test imports `@arrowz/board-element` and
reads it. **Entries with `state: true` are excluded**: `coloredOverride` and
`chosenMode` are internal reactive state, which is why the declaration marks
them.

That leaves ten — `board`, `view`, `interactive`, `play`, `pad`, `showPoints`,
`pointColor`, `pointRadius`, `lang`, `enableColors` — and the documentation
must carry exactly those, both ways. The `attribute` field of each entry is
checked too, so `show-points`, `point-color`, `point-radius` and
`enable-colors` cannot drift in the table.

### 3.3 Methods and getters — read from the prototype, in the `chromium` project

The rule: every own property of `ArrowzBoard.prototype`, minus the constructor,
minus the Lit and DOM lifecycle overrides, minus the declared property names,
must appear in the documentation, and nothing else may.

**The subtraction of property names is not tidiness, it is required.** Lit
defines an accessor on the prototype for every declared property that is not
`noAccessor` — `@lit/reactive-element`'s `createProperty` ends in
`defineProperty(this.prototype, name, descriptor)` (verified in
`node_modules/.pnpm/@lit+reactive-element@2.1.2/.../reactive-element.js:253-265`).
Without the subtraction, `board`, `view` and `pad` would present themselves as
undocumented methods. `lang` is declared `noAccessor: true` and so gets none;
subtracting by name covers both cases.

The lifecycle exclusions, named with their reason rather than pattern-matched:
`constructor`, `attributeChangedCallback`, `connectedCallback`,
`disconnectedCallback`, `render`, `updated`. `observedAttributes` and `styles`
are static and never on the prototype.

What remains is eleven members: getters `viewport`, `pieceCount`,
`gestureMode`, and methods `fit`, `zoomBy`, `animateExit`, `shake`,
`saveState`, `loadState`, `restart`, `emit`.

**Two of them are undocumented today.** `packages/board-element/README.md`
describes nine and mentions neither `pieceCount` nor `emit` (grep is empty for
both). The docs page documents all eleven, so the guard needs no exception list
beyond the lifecycle:

- `pieceCount` is a read-only getter a host can use; it was simply never
  written down.
- `emit(event)` is the `GameTarget` seam (`game-host.ts:16-20`) through which
  `GameHost` pushes events into the element. It is public, so it is documented
  as what it is, rather than excused.

The element's own README is a second, unguarded copy of the same API — it has no
test of its own, unlike the CLI's. Bringing it under a guard is out of scope
here (§6), but these three tests mean the lab's copy cannot be the one that
drifts.

## 4. The two debts

### 4.1 `aria-keyshortcuts`

`f` toggles solo (`App.tsx`'s `useSoloKey`), and nothing announces it: a grep
for `aria-keyshortcuts` across the repository is empty. It goes on the solo
toggle in `stage/BoardFrame.tsx`, which already carries `aria-label`, `title`
and `aria-pressed`. The value is `"f"`.

This is the lab's only global hotkey. The element's own keys (`+`, `−`, `0`)
belong to the element and are not the lab's to announce.

### 4.2 Heading levels

Today the whole lab has two headings — `report/LongestTable.tsx`'s `h3` and
`DocsRoute`'s `h2` — and **no `h1` at all**.

- `shell/TopBar.tsx`'s `<span className="name">Arrowz</span>` becomes an `h1`
  with the same class. The product's name is the document's title, because it
  is. `.fw-top .name` sets only `font-size: 13px`, so the rule gains a
  `margin: 0` and a weight: an `h1` otherwise arrives at `2em` and bold.
- `LongestTable`'s `h3` becomes an `h2`, under that `h1` and with nothing
  skipped. Its `id="longest-head"` and the `aria-labelledby` on the table stay
  as they are.
- The docs pages use `h2` for the page title and `h3` for the sections within
  it.

The regions named by `aria-label` — the report, the list, the detail — keep
their names. Turning them into visible headings would change accessible names
that existing tests assert and that PR 5b settled deliberately (§7.2 of the lab
spec); the debt is about levels, not about renaming.

## 5. Files

```
packages/engine/
  lab-docs.ts               EN source, PL translation, the rows and the prose
  lab-docs.test.ts          parity: same keys, same shapes, no stale rows
  deno.json                 + ./docs
  package.json              + ./docs
  tsconfig.build.json       + lab-docs.ts
  neutral.test.ts           + lab-docs.ts

apps/lab/src/
  routes/DocsRoute.tsx      branches on :what, redirects the unknown
  routes/ElementDocs.tsx    the API tables
  routes/CliDocs.tsx        the two help texts, in a bilingual frame
  routes/docsEvents.test.ts the mod.ts event guard (node project)
  routes/docsApi.browser.test.tsx  the properties and prototype guards
  design/docs.css           imported by main.tsx after report.css
  shell/TopBar.tsx          the h1
  stage/BoardFrame.tsx      aria-keyshortcuts
  report/LongestTable.tsx   h3 → h2
```

## 6. Out of scope

- **Row 7 of the lab spec** — the run filmstrip, the parameter diff and the ⌘K
  palette, with the five reservations the code holds for them. Escape stays
  deliberately unbound.
- **A guard for `packages/board-element/README.md`.** It deserves the treatment
  `readme.test.ts` gives the CLI's, but that is the element package's work, not
  the lab's.
- **Translating `helpText()`.** The help stays the terminal's own English; the
  frame around it is bilingual. Giving the engine's help a language would reach
  into `command.ts`, the CLI, `readme.test.ts` and both README tables.
- **`useSoloKey` without `isComposing`/`defaultPrevented`** — PR 4b filed it
  against row 7, and a grep for both names is still empty.

## 7. Testing

- `packages/engine/lab-docs.test.ts` — EN/PL parity, no stale keys.
- `apps/lab/src/routes/docsEvents.test.ts` — the event map, both ways.
- `apps/lab/src/routes/docsApi.browser.test.tsx` — properties and prototype,
  both ways, with the Lit subtraction of §3.3.
- Route tests: both pages render, the segmented control navigates, an unknown
  `:what` redirects, the Docs tab stays selected on `/docs/cli`.
- **One existing assertion must be rewritten.**
  `apps/lab/src/AppRoutes.browser.test.tsx:55` is
  `await expect.element(screen.getByText('element')).toBeVisible()` — it asserts
  the raw route segment that `DocsRoute` echoes as `<p>{what}</p>`. That `<p>`
  goes. The word would still be found in the navigation's label, so the test
  would pass while proving nothing: it must assert real content instead.
- Gates: `deno task verify` for the engine, `pnpm nx run-many -t verify` for
  the repository.

## 8. Amendments to the lab spec

`docs/superpowers/specs/2026-09-13-lab-react-app-design.md` gets two:

1. §5.2's docs bullet: the help is called at render, not generated by a
   prebuild script — with the reason of §2.1 here.
2. §10's row 6: the same correction, and the two guards the row did not
   anticipate (properties and prototype, not only the event map).
