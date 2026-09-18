# The lab's documentation route — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the lab's Docs tab with the element's API and the CLI's help, and
guard both against the code they describe.

**Architecture:** The text lives in one new runtime-neutral engine module,
`packages/engine/lab-docs.ts`, whose machine columns exist once and whose
descriptions exist per language. Two guards keep it honest, each in the
environment that can see what it checks: a Deno test in the engine parses the
element's *declarations* (nothing public may be undocumented, nothing private
may be documented), and a browser test in the element package checks the same
names against the *runtime* class. The lab renders the tables and calls
`helpText()` directly; it generates nothing at build time.

**Tech Stack:** Deno 2.9 + `@std/assert` (engine tests), Vitest 5 browser mode +
Playwright/Chromium (lab and element tests), React 19 + react-router 8
(`NavLink`), Lit 3 (the element), Nx + pnpm.

**Spec:** `docs/superpowers/specs/2026-09-18-lab-docs-route-design.md` (revision 3).

## Global Constraints

- **Branch:** `lab/docs-route`, stacked on `lab/retire-old-lab`. Do not rebase.
- **Language:** everything in the repository is English — code, comments, tests,
  commit messages. Only the chat with the user is Polish. The lab ships
  bilingual UI: English is the source language in code, Polish the translation.
- **No `any`, no non-null assertions** anywhere. A type fix must never add a
  value-changing fallback in the engine.
- **`packages/engine` is runtime-neutral**: no Deno, DOM, Node or process API.
  `packages/engine/neutral.test.ts` greps the *text* of every listed file for
  `/\bDeno\./`, `/\bdocument\./`, `/\bwindow\./`, `/\blocalStorage\b/`,
  `/\bprocess\./`, `/from 'node:/`, `/\bBuffer\./`. **Prose counts.** In
  `lab-docs.ts` never end a sentence with `document`, `window`, `process` or
  `Deno` (in either language — `na Deno.` matches too), and never write
  `localStorage` at all, backticks included. Write "the page", "the DOM",
  "local storage", "Deno 2.9".
- **The lab forbids `node:*` imports** in `apps/lab/src/**/*.test.ts(x)`
  (`apps/lab/eslint.config.js:25`); only `scripts/**/*.mjs` and `*.node.test.ts`
  are exempt. No task here needs one.
- **Never spread arrays proportional to cells or pieces** (`Math.min(...arr)`).
- **Gates:** `deno task verify` at the repository root for the Deno packages,
  and `pnpm nx run-many -t verify` for everything. `apps/lab`'s `verify` runs
  six targets: `check`, `lint`, `fmt`, `test`, `build`, `smoke`.
- **Formatting:** Deno files — no semicolons, single quotes, 120 columns
  (`deno fmt`). `apps/lab` — Prettier (`pnpm --filter @arrowz/lab run fmt`).
  `packages/board-element` lints and formats with **Deno**, not ESLint.
- **Run the lab's type-check through Nx**, as `pnpm nx run lab:check`, or build
  `board-element` first. Measured in a fresh worktree: a bare `pnpm run check`
  prints **33** errors, thirty of them `Cannot find module
  '@arrowz/board-element'` and `Property 'board' does not exist on type
  'Element'`, purely because `packages/board-element/dist` does not exist yet.
  The Nx target carries `dependsOn: ["^build"]`; the npm script does not.
- **The first `vitest run` in a fresh worktree can die** with `Vitest failed to
  find the runner`. Observed, not diagnosed — most likely the cold Vite
  optimizer that bit CI in PR #71 (`f9df57b`), but nobody established that here.
  Run it again before believing it.
- **`pnpm nx build engine` has been seen answering `Cache: 1/1 hit`** from
  another worktree. When that hit is legitimate the restored `dist/` already
  carries the new key, so the log is not lying; what was not established is
  whether it can hit when it should not. Cheap insurance after editing
  `lab-i18n.ts` or `lab-docs.ts`: grep `dist/` for the key you just added.
- **No attribution lines** in commit messages.

---

## File structure

| File | Responsibility |
|---|---|
| `packages/engine/lab-docs.ts` | The only copy of the documentation: machine rows once, descriptions per language, `docsFor(lang)`. |
| `packages/engine/lab-docs.test.ts` | Parity beyond the compiler; the event-map parse; set equality against the element's declarations. |
| `packages/board-element/src/docs-api.browser.test.ts` | Every documented name exists on the runtime class. |
| `apps/lab/src/docs/useDocs.ts` | One `Docs` per language, built once, chosen by the store. |
| `apps/lab/src/routes/DocsRoute.tsx` | Branches on `:what`; redirects the unknown; keeps the tabpanel shell. |
| `apps/lab/src/routes/DocsNav.tsx` | The `<nav>` of two `NavLink`s. |
| `apps/lab/src/routes/ElementDocs.tsx` | The three API tables, and the code examples. |
| `apps/lab/src/routes/CliDocs.tsx` | Both help forms, in a bilingual frame. |
| `apps/lab/src/design/docs.css` | The docs surface: headings, tables, the terminal block. |

---

## Task 1: The engine module, its wiring, and parity

**Files:**
- Create: `packages/engine/lab-docs.ts`
- Create: `packages/engine/lab-docs.test.ts`
- Modify: `packages/engine/deno.json` (exports)
- Modify: `packages/engine/package.json` (exports)
- Modify: `packages/engine/tsconfig.build.json` (include)
- Modify: `packages/engine/neutral.test.ts` (NEUTRAL)
- Modify: `packages/engine/scripts/node-smoke.mjs` (the dist import)
- Modify: `CLAUDE.md` (the neutrality sentence)

**Interfaces:**
- Consumes: `Lang` from `./lab-i18n.ts`.
- Produces: `ELEMENT_PROPS`, `ELEMENT_MEMBERS`, `ELEMENT_EVENTS`,
  `type PropKey`, `type MemberKey`, `type EventKey`, `interface Docs`,
  `docsFor(lang: Lang): Docs`, all from `@arrowz/engine/docs`.

- [ ] **Step 1: Write the failing parity test**

Create `packages/engine/lab-docs.test.ts`:

```ts
// The compiler already guarantees that EN and PL carry the same keys: the
// tables are `as const satisfies`, so a missing description is TS2741 and a
// stray one TS2353. This file therefore asserts only what a type cannot — that
// a description exists as text and was actually translated. A test that
// re-checks the compiler is a test that cannot fail (the lesson of PR 3b).
import { assert, assertNotEquals } from '@std/assert'
import { type Docs, docsFor, ELEMENT_EVENTS, ELEMENT_MEMBERS, ELEMENT_PROPS } from './lab-docs.ts'

Deno.test('every row has a description in both languages, and none is empty', () => {
  const en = docsFor('en')
  const pl = docsFor('pl')
  for (const row of ELEMENT_PROPS) {
    assert(en.props[row.key].trim().length > 0, `EN prop ${row.key}`)
    assert(pl.props[row.key].trim().length > 0, `PL prop ${row.key}`)
  }
  for (const row of ELEMENT_MEMBERS) {
    assert(en.members[row.key].trim().length > 0, `EN member ${row.key}`)
    assert(pl.members[row.key].trim().length > 0, `PL member ${row.key}`)
  }
  for (const row of ELEMENT_EVENTS) {
    assert(en.events[row.key].trim().length > 0, `EN event ${row.key}`)
    assert(pl.events[row.key].trim().length > 0, `PL event ${row.key}`)
  }
})

// A Polish description equal to the English one is an untranslated string that
// the compiler is happy with: same key, same type, wrong language.
Deno.test('no Polish description is a copy of its English source', () => {
  const en = docsFor('en')
  const pl = docsFor('pl')
  for (const row of ELEMENT_PROPS) assert(pl.props[row.key] !== en.props[row.key], `prop ${row.key}`)
  for (const row of ELEMENT_MEMBERS) assert(pl.members[row.key] !== en.members[row.key], `member ${row.key}`)
  for (const row of ELEMENT_EVENTS) assert(pl.events[row.key] !== en.events[row.key], `event ${row.key}`)
})

// The frame around the tables — the leads, the section headings, the column
// labels, the README pointer — is text too, and the three tests above do not
// touch it: they walk rows. Measured during review, every one of those strings
// could have stayed English in the Polish docs with nothing going red.
//
// The key list is derived from the object rather than written out, so a field
// added to `Docs` later cannot slip past this test the way the whole frame
// slipped past the ones above.
Deno.test('the frame around the tables is translated too', () => {
  const en = docsFor('en')
  const pl = docsFor('pl')
  const frame = (Object.keys(en) as (keyof Docs)[]).filter((key) => typeof en[key] === 'string')
  assert(frame.length > 10, `only ${frame.length} frame strings found — the filter is wrong`)
  for (const key of frame) {
    const enText = en[key]
    const plText = pl[key]
    if (typeof enText !== 'string' || typeof plText !== 'string') continue
    assert(enText.trim().length > 0, `EN ${key}`)
    assert(plText.trim().length > 0, `PL ${key}`)
    assertNotEquals(plText, enText, `${key} is still English in the Polish docs`)
  }
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/engine && deno test --allow-read lab-docs.test.ts`
Expected: FAIL with **`Found 4 errors`** — `TS2307 [ERROR]: Cannot find module
'file:///…/lab-docs.ts'`, and three `TS2731 Implicit conversion of a 'symbol' to
a 'string'` on the frame test's `${key}` templates, because `keyof` an
unresolved `Docs` still includes `symbol`. All four go once the module exists.
(Deno type-checks before it runs, so these are compile errors, not a missing
module at run time.)

- [ ] **Step 3: Write the module**

Create `packages/engine/lab-docs.ts`:

```ts
// The documentation the lab's Docs tab prints: the element's API as reference
// rows, and the frame around the CLI help. Pure text; the help itself is not
// here, because `helpText()` in command.ts already produces it and a second
// copy would drift.
//
// The machine columns — key, type, attribute, default, signature — exist once
// and are NOT translated. That is the rule readme.test.ts states for the knob
// tables ("the prose is translated; the machine columns are not"), and it is
// what lets one guard check both languages at once: there is a single copy of
// the machine data to check.
//
// Prose in this file must not end a sentence with `document`, `window`,
// `process` or `Deno`, and must never write the browser's key-value store by
// its API name: neutral.test.ts greps this file's TEXT, not its code, so a
// sentence about the DOM can trip a rule this module does not break. Code
// examples live in apps/lab for the same reason.
import type { Lang } from './lab-i18n.ts'

/** One row of the property table. `attribute` is null when the property has none. */
export interface PropRow {
  readonly key: string
  readonly type: string
  readonly attribute: string | null
  readonly def: string
}

/** One row of the method and getter table. */
export interface MemberRow {
  readonly key: string
  readonly kind: 'method' | 'getter'
  readonly signature: string
}

/** One row of the event table. */
export interface EventRow {
  readonly key: string
  readonly detail: string
}

// `as const satisfies` and not an annotation: an annotation wins over `as
// const` and collapses the key type to `string`, which would let a description
// go missing without the compiler noticing — measured while planning this PR.
export const ELEMENT_PROPS = [
  // `BoardData | null`, which is what the class declares (arrowz-board.ts:109).
  // The element's README says `Board | null` — narrower than the property
  // accepts, since `Board extends BoardData`. The README is the copy that
  // drifted; bringing it under a guard is the element package's work (spec §6).
  { key: 'board', type: 'BoardData | null', attribute: null, def: 'null' },
  { key: 'view', type: 'Partial<BoardView>', attribute: null, def: '{}' },
  { key: 'interactive', type: 'boolean', attribute: 'interactive', def: 'false' },
  { key: 'play', type: 'boolean', attribute: 'play', def: 'false' },
  { key: 'pad', type: 'number', attribute: 'pad', def: '4' },
  { key: 'showPoints', type: 'boolean', attribute: 'show-points', def: 'false' },
  { key: 'pointColor', type: 'string', attribute: 'point-color', def: "'#c9c9d6'" },
  { key: 'pointRadius', type: 'number', attribute: 'point-radius', def: '0.06' },
  { key: 'lang', type: 'string', attribute: 'lang', def: "''" },
  { key: 'enableColors', type: 'boolean', attribute: 'enable-colors', def: 'false' },
] as const satisfies readonly PropRow[]

export const ELEMENT_MEMBERS = [
  { key: 'viewport', kind: 'getter', signature: 'BoardViewport | null' },
  { key: 'pieceCount', kind: 'getter', signature: 'number' },
  { key: 'gestureMode', kind: 'getter', signature: "'drag' | 'click'" },
  { key: 'fit', kind: 'method', signature: 'fit(): void' },
  { key: 'zoomBy', kind: 'method', signature: 'zoomBy(factor: number): void' },
  { key: 'animateExit', kind: 'method', signature: 'animateExit(pieceId: number, dir: number): Promise<void>' },
  { key: 'shake', kind: 'method', signature: 'shake(pieceId: number, distance: number): Promise<void>' },
  { key: 'saveState', kind: 'method', signature: 'saveState(): SessionSnapshot | null' },
  { key: 'loadState', kind: 'method', signature: 'loadState(snap: SessionSnapshot): void' },
  { key: 'restart', kind: 'method', signature: 'restart(): void' },
  { key: 'emit', kind: 'method', signature: 'emit(event: GameEvent): void' },
] as const satisfies readonly MemberRow[]

export const ELEMENT_EVENTS = [
  { key: 'piece-click', detail: '{ pieceId }' },
  { key: 'piece-removed', detail: '{ pieceId, left }' },
  { key: 'life-lost', detail: '{ pieceId, blockerId, distance }' },
  { key: 'finished', detail: '{ pieces }' },
  { key: 'viewport-change', detail: 'BoardViewport' },
] as const satisfies readonly EventRow[]

export type PropKey = (typeof ELEMENT_PROPS)[number]['key']
export type MemberKey = (typeof ELEMENT_MEMBERS)[number]['key']
export type EventKey = (typeof ELEMENT_EVENTS)[number]['key']

/** Everything one language needs to render both documentation pages. */
export interface Docs {
  readonly elementLead: string
  readonly props: Record<PropKey, string>
  readonly members: Record<MemberKey, string>
  readonly events: Record<EventKey, string>
  readonly cliLead: string
  /** Heading above the short usage block. */
  readonly cliShortHead: string
  /** Heading above the knob table block. */
  readonly cliKnobsHead: string
  /** One line saying the block below is the terminal's own text, in English. */
  readonly cliEnglishNote: string
  readonly colProp: string
  readonly colType: string
  readonly colAttr: string
  readonly colDefault: string
  readonly colMember: string
  readonly colSignature: string
  readonly colEvent: string
  /** The event's payload column. */
  readonly colDetail: string
  /** The last column of all three tables: the translated one. */
  readonly colDescription: string
  readonly headProps: string
  readonly headMembers: string
  readonly headEvents: string
  readonly headExample: string
  /** Where the long explanations live, since this page is a reference. */
  readonly readmePointer: string
}

const EN = {
  elementLead:
    'The board view of Arrowz as a web component. It draws a board, owns zoom and pan, animates the two effects of the game reducer, and reports clicks on pieces. Usable from plain HTML, React, Angular, Svelte or Vue.',
  props: {
    board: 'The board to draw. Assigning it always starts a fresh game and redraws in full.',
    view: 'Drawing options merged over the CLI defaults: stroke, head size, rounding, colour, highlight and paper.',
    interactive: 'Reports clicks on pieces without playing them.',
    play: 'Runs the reducer: a free piece rides out, a blocked one bounces. Implies interactivity.',
    pad: 'Margin around the board, in cells. Zero draws the cells edge to edge.',
    showPoints: 'Draws one dot per cell under the pieces, like the ruling of a notebook page.',
    pointColor: 'Colour of the point grid dots.',
    pointRadius: 'Radius of the point grid dots, in cells.',
    lang: 'The standard global language attribute; `pl` selects Polish labels, anything else English.',
    enableColors: 'Permission to colour the board. Without it the element stays monochrome and shows no colour button.',
  },
  members: {
    viewport: 'The view on screen, or null before a board and a host size are both known.',
    pieceCount: "How many pieces the layer is drawing; the board's own count, not the number of nodes.",
    gestureMode: "The rule the mouse and pen follow now: the player's choice on a playable board, panning otherwise.",
    fit: 'Fits the board into the host.',
    zoomBy: 'Zooms around the centre, clamped between the fitted scale and 48 pixels per cell.',
    animateExit: 'Rides the piece off the board along a direction and removes it; resolves when the ride ends.',
    shake: 'Nudges the piece a distance down its own track and back.',
    saveState: 'The game in progress as a value the host can store, or null before a board is set.',
    loadState: 'Restores a game; throws when the snapshot does not belong to this board.',
    restart: 'Drops the game and puts every piece back.',
    emit: 'The seam the game host drives the element through; a host that only renders a board never calls it.',
  },
  events: {
    'piece-click': 'A piece was clicked, while interactive or playing.',
    'piece-removed': 'A free piece started its ride off the board.',
    'life-lost': 'A blocked piece started its bounce against the piece that stops it.',
    'finished': 'The last piece finished its ride.',
    'viewport-change': 'The view changed; at most once per frame.',
  },
  cliLead:
    'The command line carves boards and prints them. This is the help it shows, rendered from the very function the terminal calls, so the two cannot disagree.',
  cliShortHead: 'Everyday help',
  cliKnobsHead: 'Every knob',
  cliEnglishNote: "The blocks below are the terminal's own text and stay in English.",
  colProp: 'Property',
  colType: 'Type',
  colAttr: 'Attribute',
  colDefault: 'Default',
  colMember: 'Member',
  colSignature: 'Signature',
  colEvent: 'Event',
  colDetail: 'Detail',
  colDescription: 'Description',
  headProps: 'Properties',
  headMembers: 'Methods and getters',
  headEvents: 'Events',
  headExample: 'Using it',
  readmePointer:
    'The long explanations — zoom and pan, the point grid, riding the track, playing the board — live in the package README.',
} as const satisfies Docs

const PL = {
  elementLead:
    'Widok planszy Arrowz jako komponent webowy. Rysuje planszę, obsługuje powiększanie i przesuwanie, animuje dwa efekty reduktora gry i zgłasza kliknięcia w elementy. Działa w czystym HTML, w Reakcie, Angularze, Svelte i Vue.',
  props: {
    board: 'Plansza do narysowania. Przypisanie zawsze zaczyna nową grę i przerysowuje całość.',
    view: 'Opcje rysowania nałożone na domyślne z CLI: grubość, rozmiar grotu, zaokrąglenie, kolor, wyróżnienie i tło.',
    interactive: 'Zgłasza kliknięcia w elementy, ale ich nie rozgrywa.',
    play: 'Uruchamia reduktor: wolny element wyjeżdża, zablokowany odbija się. Włącza też interaktywność.',
    pad: 'Margines wokół planszy, w komórkach. Zero rysuje komórki od krawędzi do krawędzi.',
    showPoints: 'Rysuje po kropce na komórkę pod elementami, jak linie w zeszycie.',
    pointColor: 'Kolor kropek siatki punktów.',
    pointRadius: 'Promień kropek siatki punktów, w komórkach.',
    lang: 'Standardowy atrybut języka; `pl` wybiera polskie etykiety, cokolwiek innego angielskie.',
    enableColors:
      'Zgoda na kolorowanie planszy. Bez niej element zostaje monochromatyczny i nie pokazuje przycisku koloru.',
  },
  members: {
    viewport: 'Widok na ekranie albo null, dopóki nie są znane i plansza, i rozmiar kontenera.',
    pieceCount: 'Ile elementów rysuje warstwa; licznik samej planszy, nie liczba węzłów.',
    gestureMode:
      'Reguła, według której działa teraz mysz i pióro: wybór gracza na grywalnej planszy, w przeciwnym razie przesuwanie.',
    fit: 'Dopasowuje planszę do kontenera.',
    zoomBy: 'Powiększa względem środka, w granicach od dopasowania do 48 pikseli na komórkę.',
    animateExit: 'Wyprowadza element z planszy w zadanym kierunku i usuwa go; kończy się wraz z przejazdem.',
    shake: 'Popycha element o zadany dystans po jego własnym torze i z powrotem.',
    saveState: 'Trwająca gra jako wartość, którą host może zapisać, albo null, zanim ustawiono planszę.',
    loadState: 'Przywraca grę; rzuca wyjątkiem, gdy zrzut nie należy do tej planszy.',
    restart: 'Porzuca grę i przywraca wszystkie elementy na miejsca.',
    emit: 'Szew, przez który host gry steruje elementem; host, który tylko rysuje planszę, nie woła go.',
  },
  events: {
    'piece-click': 'Kliknięto element, w trybie interaktywnym albo w grze.',
    'piece-removed': 'Wolny element ruszył w drogę poza planszę.',
    'life-lost': 'Zablokowany element odbił się od tego, który go zatrzymał.',
    'finished': 'Ostatni element zakończył przejazd.',
    'viewport-change': 'Widok się zmienił; najwyżej raz na klatkę.',
  },
  cliLead:
    'Wiersz poleceń wycina plansze i je drukuje. To jest pomoc, którą wypisuje — renderowana z tej samej funkcji, którą woła terminal, więc obie nie mogą się rozjechać.',
  cliShortHead: 'Pomoc na co dzień',
  cliKnobsHead: 'Wszystkie pokrętła',
  cliEnglishNote: 'Bloki poniżej to własny tekst terminala i zostają po angielsku.',
  colProp: 'Właściwość',
  colType: 'Typ',
  colAttr: 'Atrybut',
  colDefault: 'Domyślnie',
  colMember: 'Składowa',
  colSignature: 'Sygnatura',
  colEvent: 'Zdarzenie',
  colDetail: 'Szczegóły',
  colDescription: 'Opis',
  headProps: 'Właściwości',
  headMembers: 'Metody i gettery',
  headEvents: 'Zdarzenia',
  headExample: 'Jak użyć',
  readmePointer:
    'Długie objaśnienia — powiększanie i przesuwanie, siatka punktów, jazda po torze, rozgrywka — są w pliku README pakietu.',
} as const satisfies Docs

/** The documentation in one language. Built by the surface once per language, as the dictionary is. */
export function docsFor(lang: Lang): Docs {
  return lang === 'pl' ? PL : EN
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/engine && deno test --allow-read lab-docs.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire the module into the four places that resolve it**

In `packages/engine/deno.json`, after the `"./report"` line of `exports`:

```json
    "./docs": "./lab-docs.ts"
```

In `packages/engine/package.json`, after the `"./report"` entry of `exports`:

```json
    "./docs": { "types": "./dist/lab-docs.d.ts", "default": "./dist/lab-docs.js" }
```

In `packages/engine/tsconfig.build.json`, add to `include` after `"lab-report.ts"`:

```json
    "lab-docs.ts"
```

In `packages/engine/neutral.test.ts`, add to the `NEUTRAL` array after
`'lab-report.ts',`:

```ts
  'lab-docs.ts',
```

- [ ] **Step 6: Add the Node smoke import**

In `packages/engine/scripts/node-smoke.mjs`, after the `lab-report.js` import:

```js
import { docsFor } from '../dist/lab-docs.js'
```

This script has **no `check` helper** — that one lives in the lab's
`scripts/worker-smoke.mjs`, and a plan that borrows it here fails with
`ReferenceError: check is not defined` (measured). Add the helper after
`let failures = 0`:

```js
/** One more line in the golden-board format: a check that fails counts like a board that differs. */
function check(ok, what) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) failures++
}
```

Then, after the golden-board loop and before the exit code is computed:

```js
// The module has to be in dist/ and it has to evaluate under Node. tsc alone
// proves neither: tsconfig.build.json carries `lib: dom`, so a stray DOM
// reference type-checks and only fails here, on import.
check(docsFor('pl').props.board !== docsFor('en').props.board, 'lab-docs is translated in dist')
```

The script's closing line then reports this failure as "golden board(s)
differ", which is inaccurate for a check that is not a board. That is accepted
rather than fixed: one shared counter is the script's whole design, and the
`FAIL` line above names what actually broke.

- [ ] **Step 7: Run the whole engine gate**

Run: `cd packages/engine && deno check *.ts && deno lint && deno fmt --check && deno test --allow-read --allow-run`
Expected: PASS. `neutral.test.ts` now covers `lab-docs.ts`; if it fails on
`/\bDeno\./` or `/\blocalStorage\b/`, a sentence needs rewording — that is the
constraint, not a bug.

Then: `pnpm nx build engine && pnpm nx smoke engine`
Expected: PASS, with a new line reading `ok` and ending
`lab-docs is translated in dist`. (The helper prints `'ok  '` and the script
adds a separator, so there are three spaces, not two — do not grep for the
two-space form.)

- [ ] **Step 8: Grep the module against all seven neutrality patterns**

Run:

```bash
cd packages/engine && grep -nE "\bDeno\.|\bdocument\.|\bwindow\.|\blocalStorage\b|\bprocess\.|from 'node:|\bBuffer\." lab-docs.ts
```

Expected: no output. (The test asserts the same thing; this is the check to run
*while writing prose*, before the test tells you at the end of a long file.)

- [ ] **Step 9: Update CLAUDE.md**

In `CLAUDE.md`, the neutrality sentence currently reads:

```
- The engine (`packages/engine/engine.ts`) knows neither Deno nor the DOM, and
  so do `command.ts`, `lab-simple.ts`, `lab-presets.ts`, `lab-i18n.ts`: no file
```

Replace the file list so it matches the `NEUTRAL` table it illustrates:

```
- The engine (`packages/engine/engine.ts`) knows neither Deno nor the DOM, and
  so do `command.ts`, `lab-simple.ts`, `lab-presets.ts`, `lab-i18n.ts`,
  `lab-report.ts`, `lab-docs.ts`: no file
```

- [ ] **Step 10: Commit**

```bash
git add packages/engine/lab-docs.ts packages/engine/lab-docs.test.ts \
  packages/engine/deno.json packages/engine/package.json \
  packages/engine/tsconfig.build.json packages/engine/neutral.test.ts \
  packages/engine/scripts/node-smoke.mjs CLAUDE.md
git commit -m "Give the documentation one home in the engine

The machine columns exist once and are not translated, as the knob
tables already are; only the descriptions have two languages. The row
tables are as const satisfies rather than annotated, because an
annotation collapses the key type to string and takes the compiler's
guarantee with it.

The parity test asserts what the compiler cannot: that a description is
non-empty, and that the Polish one is not a copy of the English."
```

---

## Task 2: The declaration guard in the engine

**Files:**
- Modify: `packages/engine/lab-docs.test.ts`

**Interfaces:**
- Consumes: `ELEMENT_PROPS`, `ELEMENT_MEMBERS`, `ELEMENT_EVENTS` from Task 1.
- Produces: nothing other tasks import.

- [ ] **Step 1: Write the failing guard**

Append to `packages/engine/lab-docs.test.ts`:

```ts
import { assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'

// Reading a sibling package from an engine test is established: neutral.test.ts
// walks ../cli the same way, and this package's test target runs with an
// unrestricted --allow-read.
const elementSrc = join(dirname(fromFileUrl(import.meta.url)), '..', 'board-element', 'src')
const modText = Deno.readTextFileSync(join(elementSrc, 'mod.ts'))
const classText = Deno.readTextFileSync(join(elementSrc, 'arrowz-board.ts'))

const sorted = (names: Iterable<string>): string[] => [...names].sort()

/**
 * The body of one `interface X { … }` block. The end is the first closing brace
 * after the header, NOT a brace at some indentation: `mod.ts` declares two
 * interfaces inside one `declare global`, and an indentation rule breaks the
 * moment either of them moves. An unbounded search is worse still — it would
 * swallow `'arrowz-board': ArrowzBoard` from HTMLElementTagNameMap next door.
 */
function interfaceBody(text: string, name: string): string {
  const head = text.indexOf(`interface ${name} {`)
  assert(head >= 0, `no interface ${name}`)
  const open = text.indexOf('{', head)
  const close = text.indexOf('}', open)
  assert(close > open, `interface ${name} is not closed`)
  return text.slice(open + 1, close)
}

Deno.test('the event table is the element event map, both ways', () => {
  const body = interfaceBody(modText, 'HTMLElementEventMap')
  const found = [...body.matchAll(/^\s*'([a-z-]+)'\s*:/gm)].map((m) => m[1] ?? '')
  // A parser that silently matches nothing would compare two empty sets against
  // a documented table and only half of this test would notice.
  assert(found.length > 0, 'the event map parsed to nothing')
  assertEquals(sorted(found), sorted(ELEMENT_EVENTS.map((row) => row.key)))
})

/**
 * The keys of `static properties` that are not internal reactive state. Read
 * from the declaration and not from the class at runtime: Lit rewrites these
 * objects in place when it finalises the class, adding `attribute: false` to
 * every `state` entry, so the runtime shape is not what the author wrote.
 */
function declaredProps(): { key: string; attribute: string | null }[] {
  const body = classText.slice(classText.indexOf('static override properties = {'))
  const block = body.slice(0, body.indexOf('\n  }'))
  const rows: { key: string; attribute: string | null }[] = []
  // Entry by entry rather than line by line. `deno fmt` breaks any entry past
  // 120 columns across several lines, and a line-based reader would then stop
  // seeing that property — silently, since a property it cannot see is a
  // property it cannot report as undocumented. Measured during review:
  // `pointRadius` is already at 94 columns.
  for (const m of block.matchAll(/^\s{4}(\w+):\s*\{([\s\S]*?)\},\s*$/gm)) {
    const [, key, opts] = m
    if (key === undefined || opts === undefined) continue
    if (/\bstate:\s*true\b/.test(opts)) continue
    const named = /attribute:\s*'([a-z-]+)'/.exec(opts)
    const off = /attribute:\s*false/.test(opts)
    rows.push({ key, attribute: off ? null : (named?.[1] ?? key.toLowerCase()) })
  }
  return rows
}

Deno.test('the property table is the element declaration, both ways', () => {
  const declared = declaredProps()
  assert(declared.length > 0, 'the property block parsed to nothing')
  assertEquals(sorted(declared.map((r) => r.key)), sorted(ELEMENT_PROPS.map((r) => r.key)))
  for (const row of ELEMENT_PROPS) {
    const found = declared.find((r) => r.key === row.key)
    assert(found, `no declaration for ${row.key}`)
    assertEquals(row.attribute, found.attribute, `attribute of ${row.key}`)
  }
})

/**
 * Public methods and getters, read as SIGNATURES — a name followed by `(`, or a
 * `get`/`set` accessor. Not "declarations": the class has eleven `declare board:
 * …` lines at the same indentation, and a rule that says "declaration" matches
 * them, along with braces and comments (109 candidates, measured).
 *
 * `private` and `override` are excluded by name. TypeScript erases `private`,
 * so those members are ordinary prototype properties at runtime — which is why
 * this direction has to be read here rather than off the prototype.
 */
function publicSignatures(): string[] {
  const names: string[] = []
  for (const line of classText.split('\n')) {
    const m = /^ {2}(?!private\b|override\b|static\b|constructor\b)(?:async\s+)?(?:(get|set)\s+)?(\w+)\s*\(/.exec(line)
    if (!m) continue
    const name = m[2]
    if (name !== undefined) names.push(name)
  }
  return names
}

Deno.test('the member table is the element public surface, both ways', () => {
  const found = publicSignatures()
  assert(found.length > 0, 'the class parsed to no signatures')
  assertEquals(sorted(found), sorted(ELEMENT_MEMBERS.map((row) => row.key)))
})
```

- [ ] **Step 2: Run the guard to verify it passes on today's code**

Run: `cd packages/engine && deno test --allow-read lab-docs.test.ts`
Expected: PASS, 6 tests. If the member test fails listing names like
`watchForRevival` or `redraw`, the regular expression lost its `private`
exclusion; if it lists `board` or `view`, it is matching `declare` lines.

**Each parser sees exactly one shape, and the element happens to be written in
it.** That is not a flaw to fix here — a full TypeScript parse for three tables
would cost more than it buys — but it is a set of assumptions, so they are
written down. Every case below was constructed and measured during review.

The shapes they see:

- **A property entry** — `key: { … },` inside `static override properties`,
  read entry by entry so a multi-line entry still counts.
- **An event key** — `'name':` in single quotes, letters and hyphens only.
- **A member** — a signature `name(`, at two-space indent, with no `private`,
  `override` or `static` before it and no `<` in the name.

Shapes that produce a **false green** — an undocumented member no one notices:
an event key without quotes (`ready: FinishedEvent`, which is valid TypeScript
and which `deno fmt` will not quote for you); an event key with a digit; a
generic method (`pick<T>(x: T): T`); a public **static** method, excluded by the
same `static` that keeps `properties` and `styles` out; a property entry with a
trailing comment.

One more shape is invisible to **both** guards, which is why the spec asks for it
to be written down rather than assumed away (§3.3): a **public arrow-function
field** (`toggle = (): void => {}`). It lives on the instance, so the prototype
guard never sees it, and it is not a signature, so the source parser never sees
it either. The class has none today; every `readonly … = (` in it is `private`.

Three shapes produce a **false red** instead, which is louder but no more
correct: a helper function outside the class with `  if (` or `  for (` at
two-space indent is reported as a member named `if`; a method written
`public foo()` cannot be documented at all — measured, documenting it turns the
test red, so the word `public`, which changes nothing in TypeScript, changes the
guard's answer; and a property entry whose nested option object `deno fmt` has
put on its own line ending in `},` before `attribute:` is counted, but the
options after that nested object are not read, so the attribute comparison
reddens (measured on a `converter: { fromAttribute, toAttribute }` entry).

An event typed as an object literal truncates the parse, but **loudly**: the
set comparison reddens and names every event after it. There is no arrangement
in which an object literal yields a false green.

**What the sanity assertion does and does not do.** Measured: with the parser
broken so that it matches nothing, the set comparison reddens on its own with a
five-name diff — the assertion adds no redness. What it adds is the cause:
`the event map parsed to nothing` instead of a diff that blames the
documentation. It does not help at all in the dangerous case, a parser that
matches *part* of the list.

- [ ] **Step 3: Mutate the table to prove each direction reddens**

Run each mutation, confirm the named failure, then `git checkout --` the file.

**Each mutation has two stages, and skipping the first proves nothing.**
Measured: mutations 1, 2 and 4 taken as a row edit alone never reach a test —
`deno test` type-checks first, and the row tables drive `Docs`, so adding a row
without its descriptions is `TS2741` **twice** — once per language's description
object — with two `TS2322` behind it, because `docsFor` returns `Docs`:
`Found 4 errors`, not one. Removing a row leaves `TS2353` twice. That is
the compiler doing its half (spec §2.3), and it is worth seeing once. But to
learn whether the *runtime* guard works you must then satisfy the compiler —
add or delete the matching EN and PL descriptions — and run again. Only
mutation 3 changes no types and reaches its assertion directly.

```bash
# 1. A documented name that is private: must fail the member test.
#    (edit lab-docs.ts: add { key: 'redraw', kind: 'method', signature: 'redraw(): void' })
cd packages/engine && deno test --allow-read lab-docs.test.ts
# Expected: FAIL 'the member table is the element public surface, both ways'

# 2. A documented key that is internal state: must fail the property test.
#    (edit lab-docs.ts: add { key: 'chosenMode', type: 'GestureMode', attribute: null, def: "'drag'" })
# Expected: FAIL 'the property table is the element declaration, both ways'

# 3. A swapped attribute column: must fail the per-key comparison.
#    (edit lab-docs.ts: give showPoints attribute 'point-color' and pointColor 'show-points')
# Expected: FAIL 'attribute of showPoints' — the loop walks ELEMENT_PROPS in
#   order and showPoints comes first, so the test stops there and never reaches
#   pointColor. Measured.

# 4. A missing event: must fail the event test.
#    (edit lab-docs.ts: delete the 'finished' row — the Docs type will also
#    complain, which is the compiler doing its half)
# Expected: FAIL 'the event table is the element event map, both ways'
```

Mutation 3 is the one revision 2 of the spec would have passed: comparing the
*sets* of attribute names leaves a swap invisible. Confirm it reddens here.

- [ ] **Step 4: Restore the table and re-run**

Run: `cd packages/engine && git checkout -- lab-docs.ts && deno test --allow-read lab-docs.test.ts`
Expected: PASS, 6 tests. This is the negative control for all four mutations.

`git checkout` works here because Task 1 committed the file in its step 10. If
you are mutating before that commit — a reviewer executing the plan without
committing, say — the file is untracked and `git checkout` answers
`pathspec … did not match`; keep a copy and restore from it instead.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/lab-docs.test.ts
git commit -m "Guard the documentation against the element's declarations

Set equality in both directions, not containment: containment lets the
page document a private member or internal state, because TypeScript
erases private and those members are ordinary prototype properties.

The member rule reads signatures rather than declarations. Written the
other way it matches the eleven declare lines as well, and the braces
and comments with them.

The attribute column is compared per key. Comparing the sets passes a
table that swaps two attributes between rows."
```

---

## Task 3: The runtime guard in the element package

**Files:**
- Create: `packages/board-element/src/docs-api.browser.test.ts`
- Modify: `packages/board-element/src/mod.ts` (re-export `BoardData`)

**Interfaces:**
- Consumes: `ELEMENT_PROPS`, `ELEMENT_MEMBERS` from `@arrowz/engine/docs`;
  `ArrowzBoard` from `./mod.ts`; `PropertyDeclaration` from `lit`, which this
  package depends on and the lab does not.
- Produces: `BoardData` re-exported from `packages/board-element/src/mod.ts`.

**Rebuild the engine before running anything here, and again after every
edit to `lab-docs.ts`.** This test reads the tables from `dist/lab-docs.js`, not
from the source, so without `pnpm nx build engine` an edit is invisible to it
and a mutation "passes" while proving nothing. The engine test of Task 2 reads
the source and needs no rebuild — the two halves of the guard differ here.

- [ ] **Step 1: Write the failing test**

First make the documented type findable. The docs page's `board` row says
`BoardData | null`, and `BoardData` is exported by `@arrowz/engine` — but
`packages/board-element/src/mod.ts` re-exports only `Session` and
`SessionSnapshot` from the engine, so a reader of the element's page would meet
a type name that is not in the public surface of the package they are reading.
Add it beside them:

```ts
export type { BoardData, Session, SessionSnapshot } from '@arrowz/engine'
```

Then create `packages/board-element/src/docs-api.browser.test.ts`:

```ts
// The other half of the documentation guard. Its twin in the engine
// (lab-docs.test.ts) reads the element's declarations and answers "is anything
// public undocumented?"; this one asks the runtime class "does everything
// documented actually exist?" — the question a text parser cannot answer.
//
// Importing the module registers the element, and registration is what makes
// Lit finalise the class, so the accessors are on the prototype from the import
// on. No instance is needed (measured: the name list is identical before and
// after createElement).
import type { PropertyDeclaration } from 'lit'
import { expect, test } from 'vitest'
import { ELEMENT_MEMBERS, ELEMENT_PROPS } from '@arrowz/engine/docs'
import { ArrowzBoard } from './mod.ts'

// `lit` is a dependency of this package, so the declaration type is available
// and no cast through `unknown` is needed. The lab could not have done this.
const declared: Record<string, PropertyDeclaration | undefined> = ArrowzBoard.properties

test('every documented property is declared on the element', () => {
  for (const row of ELEMENT_PROPS) {
    expect(declared[row.key], `property ${row.key}`).toBeDefined()
  }
})

// Per key, and not per set. Comparing the two SETS of attribute names passes a
// table that swaps `show-points` and `point-color` between two rows: the set is
// unchanged while the mapping lies. The spec's own second review measured that
// (§10, round two, item 3), which is the reason this test reads the declaration
// rather than only the observed list. `observedAttributes` stays as a second,
// weaker net that catches an attribute the element answers to and the page
// never mentions.
test('every documented attribute is the one its property declares', () => {
  for (const row of ELEMENT_PROPS) {
    const decl = declared[row.key]
    expect(decl, `property ${row.key}`).toBeDefined()
    // Lit's rule: `false` means no attribute, a string names it, and anything
    // else (a bare `true`, or nothing at all) takes the lower-cased key.
    const attr = decl?.attribute
    const actual = attr === false ? null : typeof attr === 'string' ? attr : row.key.toLowerCase()
    expect(actual, `attribute of ${row.key}`).toBe(row.attribute)
  }
  const observed = [...ArrowzBoard.observedAttributes].sort()
  const documented = ELEMENT_PROPS.map((row) => row.attribute).filter((a) => a !== null).sort()
  expect(observed, 'observedAttributes against the documented attributes').toEqual(documented)
})

test('every documented method and getter is on the element prototype', () => {
  const own = new Set(Object.getOwnPropertyNames(ArrowzBoard.prototype))
  for (const row of ELEMENT_MEMBERS) {
    expect(own.has(row.key), `member ${row.key}`).toBe(true)
  }
})

// Where this file stops. Both loops walk the documentation, so a row DELETED
// from the tables is invisible here — measured: dropping `view`, which has no
// attribute, leaves all three tests green. That direction belongs to the engine
// test of Task 2, which walks the element's declarations instead. Rows with an
// attribute are caught anyway, by the `observedAttributes` comparison above.
```

- [ ] **Step 2: Run it**

Run: `cd packages/board-element && pnpm exec vitest run --project chromium docs-api`
Expected: PASS, 3 tests. If the import of `@arrowz/engine/docs` fails to
resolve, Task 1 step 5 was not completed — build the engine first
(`pnpm nx build engine`).

- [ ] **Step 3: Run this package's other three gates**

Run:

```bash
cd packages/board-element && pnpm run check && deno lint && deno fmt --check
```

Expected: PASS all three. This package formats with Deno, not Prettier: no
semicolons, single quotes, 120 columns.

- [ ] **Step 4: Commit**

```bash
git add packages/board-element/src/docs-api.browser.test.ts packages/board-element/src/mod.ts
git commit -m "Check the documented API against the runtime element

The guard lives here rather than in the lab because this package has lit,
so the declaration type needs no cast, and because a test here reads its
own package's class instead of reaching across a boundary.

Attributes are compared per key, not as sets: a table that swaps two
attributes between rows leaves the set untouched while the mapping lies.
Which names ought to exist at all is still the engine test's question,
since it reads the declarations, where state and private mean something.

BoardData joins the package's re-exports, so the type the board row
names is in the surface of the package that row documents."
```

---

## Task 4: The route, the navigation, and the rewritten test

**Files:**
- Create: `apps/lab/src/routes/DocsNav.tsx`
- Modify: `apps/lab/src/routes/DocsRoute.tsx`
- Modify: `apps/lab/src/AppRoutes.tsx`
- Modify: `apps/lab/src/AppRoutes.browser.test.tsx:44-56`
- Modify: `packages/engine/lab-i18n.ts` (both `ui` sections)
- Create: `apps/lab/src/routes/DocsNav.browser.test.tsx`
- Create: `apps/lab/src/routes/ElementDocs.tsx` and `apps/lab/src/routes/CliDocs.tsx`
  as stubs (step 10), filled in Tasks 5 and 6

**Interfaces:**
- Consumes: `useDictionary` from `../i18n`.
- Produces: `DocsNav` (no props); `DocsRoute` unchanged in signature.

- [ ] **Step 1: Add the navigation's dictionary keys**

In `packages/engine/lab-i18n.ts`, in `EN.ui`, after the `tabsLabel` entry:

```ts
    /** The accessible name of the documentation's own two-page navigation. */
    docsNavLabel: 'Documentation pages',
    docsElement: 'Element',
    docsCli: 'Command line',
```

and in `PL.ui`, after its `tabsLabel: 'Sekcje',`:

```ts
    docsNavLabel: 'Strony dokumentacji',
    docsElement: 'Element',
    docsCli: 'Wiersz poleceń',
```

**Then rebuild the engine.** The lab reads the dictionary from `dist/`, so
without this the new keys do not exist for it:

```bash
pnpm nx build engine
```

Measured what skipping it costs: `dict.t('docsNavLabel')` returns `undefined`,
so the `<nav>` has no accessible name and neither link has one. All three cases
of step 5 then fail on **their own** locator — `link 'Element'`,
`link 'Command line'` and `navigation 'Documentation pages'` — each after about
fifteen seconds of polling. The type-check fails too, with three
`TS2345: Argument of type '"docsNavLabel"' is not assignable to parameter of
type '"viewSaved" | … 115 more …'` at `DocsNav.tsx(24,53)`, `(25,43)` and
`(26,39)`.

- [ ] **Step 2: Write the failing navigation test**

Create `apps/lab/src/routes/DocsNav.browser.test.tsx`:

```tsx
import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { DocsNav } from './DocsNav'

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <DocsNav />
    </MemoryRouter>,
  )

// Real anchors are the whole reason this is a nav and not a radio group: an
// address worth copying, opening in a new tab and middle-clicking. A control
// that merely looks like a link would pass every other assertion here.
test('both pages are real links with addresses', async () => {
  const screen = await at('/docs/element')
  await expect.element(screen.getByRole('link', { name: 'Element' })).toHaveAttribute('href', '/docs/element')
  await expect.element(screen.getByRole('link', { name: 'Command line' })).toHaveAttribute('href', '/docs/cli')
})

// NavLink writes aria-current="page" itself; the test names the behaviour
// rather than the attribute's author, so a hand-rolled link would also have to
// get it right.
test('the current page is the one the address names', async () => {
  const screen = await at('/docs/cli')
  await expect.element(screen.getByRole('link', { name: 'Command line' })).toHaveAttribute('aria-current', 'page')
  expect(screen.container.querySelector('a[href="/docs/element"]')?.getAttribute('aria-current')).toBeNull()
})

test('the navigation carries its own name, beside the tab strip', async () => {
  const screen = await at('/docs/element')
  await expect.element(screen.getByRole('navigation', { name: 'Documentation pages' })).toBeVisible()
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/lab && pnpm exec vitest run --project chromium DocsNav`
Expected: FAIL — cannot resolve `./DocsNav`.

- [ ] **Step 4: Write the navigation**

Create `apps/lab/src/routes/DocsNav.tsx`:

```tsx
import type { ReactElement } from 'react'
import { NavLink } from 'react-router'
import { useDictionary } from '../i18n'

/**
 * The documentation's own two pages. Links, not a radio group and not a second
 * tablist: a documentation page has an address worth copying and opening in a
 * new tab, and only a link gives one.
 *
 * `NavLink` and not a plain `<a href>`: an anchor would reload the document,
 * killing the run in flight and disposing the board's WebGL context, which is
 * the whole point of Ruling 5 and of the comment in AppRoutes.tsx. It is also
 * the lab's first router link — every other navigation here goes through
 * `useNavigate` — so the pattern is new and deliberate.
 *
 * `aria-current="page"` is NavLink's own default for the active link; it is not
 * written by hand. `docs.css` styles `[aria-current='page']`, which does not
 * collide with the lab's `[aria-current='true']` rules for preset chips and
 * library rows.
 */
export function DocsNav(): ReactElement {
  const dict = useDictionary()
  return (
    <nav className="fw-docs-nav" aria-label={dict.t('docsNavLabel')}>
      <NavLink to="/docs/element">{dict.t('docsElement')}</NavLink>
      <NavLink to="/docs/cli">{dict.t('docsCli')}</NavLink>
    </nav>
  )
}
```

- [ ] **Step 5: Run the navigation test**

Run: `cd apps/lab && pnpm exec vitest run --project chromium DocsNav`
Expected: PASS, 3 tests.

- [ ] **Step 6: Rewrite the echoed-segment test**

In `apps/lab/src/AppRoutes.browser.test.tsx`, replace lines **44-56** — the
comment block, the test title, its body *and its closing `})`*, which is line 56
— with the two tests below. Stopping at 55 leaves an orphaned `})` and a syntax
error.

```tsx
// The tabpanel has no accessible name here: it takes "name from author" only
// (no "name from content"), and its aria-labelledby points at the tab strip's
// id, which `AppRoutes` on its own does not render. So this case locates the
// panel by role and checks the wiring instead of the name; the whole-app test
// with the real tab strip is where the accessible name is asserted.
//
// It used to assert `getByText('element')` against the raw route segment the
// route echoed into a <p>. That <p> is gone, and the assertion was never worth
// keeping: `getByText` matches a node's whole text, so it was answering a
// question about the segment, not about the page.
test('/docs/element renders the docs panel, wired to its tab', async () => {
  const screen = await at('/docs/element')
  await expect.element(screen.getByRole('tabpanel')).toBeVisible()
  const panel = screen.container.querySelector('[role="tabpanel"]')
  expect(panel?.getAttribute('aria-labelledby')).toBe('tab-docs-panel')
  await expect.element(screen.getByRole('navigation')).toBeVisible()
})

test('/docs/cli is the same panel, on its own page', async () => {
  const screen = await at('/docs/cli')
  const panel = screen.container.querySelector('[role="tabpanel"]')
  expect(panel?.getAttribute('aria-labelledby')).toBe('tab-docs-panel')
  await expect.element(screen.getByRole('link', { name: 'Command line' })).toHaveAttribute('aria-current', 'page')
})
```

- [ ] **Step 7: Add the redirect cases**

First add the import the last case below needs — the file has `MemoryRouter`,
`render` and `Address` already, but not the tab strip:

```tsx
import { TabRow } from './shell/TabRow'
```

Then append to `apps/lab/src/AppRoutes.browser.test.tsx`:

```tsx
// `/docs` alone fell to the wildcard and landed the reader in the lab, which is
// a surprising answer to a documentation link. An unknown page name lands on
// the element's page too — including an upper-case one, since react-router
// matches paths case-insensitively and `:what` happily captures `CLI`.
test.each(['/docs', '/docs/nowhere', '/DOCS/CLI'])('%s lands on the element page', async (path) => {
  const screen = await render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <Address />
    </MemoryRouter>,
  )
  await expect.element(screen.getByTestId('address')).toHaveTextContent('/docs/element')
})

// Two segments under /docs is not a documentation page; it is a stale link.
test('a deeper docs path is a stale link and goes to the lab', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/docs/cli/extra']}>
      <AppRoutes />
      <Address />
    </MemoryRouter>,
  )
  await expect.element(screen.getByTestId('address')).toHaveTextContent('/')
})

// The spec promises the tab, not only the address: the strip must mark Docs as
// the open section on the CLI page as well, since `selectedIndex` keys on the
// `/docs` prefix rather than on the tab's own path. `TabRow` is mounted here
// rather than the whole shell, because the claim is about the strip.
test('the Docs tab is the selected one on the CLI page', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/docs/cli']}>
      <TabRow />
    </MemoryRouter>,
  )
  await expect.element(screen.getByRole('tab', { name: 'Docs' })).toHaveAttribute('aria-selected', 'true')
  await expect.element(screen.getByRole('tab', { name: 'Lab' })).toHaveAttribute('aria-selected', 'false')
})

// §7's other two promises need the strip and the routes together. After the
// upper-case redirect the tab must agree with the address — `selectedIndex` is
// case-sensitive, so for one frame before the redirect it says Lab. And the
// tab's own path is `/docs/element`, so clicking it from the CLI page goes back
// to the element's page rather than staying put.
test('after the upper-case redirect the address and the tab agree', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/DOCS/CLI']}>
      <TabRow />
      <AppRoutes />
      <Address />
    </MemoryRouter>,
  )
  await expect.element(screen.getByTestId('address')).toHaveTextContent('/docs/element')
  await expect.element(screen.getByRole('tab', { name: 'Docs' })).toHaveAttribute('aria-selected', 'true')
})

test('clicking the Docs tab from the CLI page returns to the element page', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/docs/cli']}>
      <TabRow />
      <AppRoutes />
      <Address />
    </MemoryRouter>,
  )
  await screen.getByRole('tab', { name: 'Docs' }).click()
  await expect.element(screen.getByTestId('address')).toHaveTextContent('/docs/element')
})
```

- [ ] **Step 8: Run the route tests to verify they fail**

Run: `cd apps/lab && pnpm exec vitest run --project chromium AppRoutes`
Expected: **six failed of fourteen** (measured). Count the names rather than the
number, in case a later edit adds a case. The two rewritten `/docs/element` and
`/docs/cli` cases fail because no navigation is rendered yet. The other four
fail for **two different reasons**, and the difference matters because step 9
fixes them differently: `/docs` falls to the wildcard and lands on `/`, while
`/docs/nowhere`, `/DOCS/CLI` and the upper-case redirect case **stay at their
own address** — `/docs/:what` already matches them, so the wildcard never sees
them and nothing redirects them yet.

Three cases **pass from the start** and are here to document behaviour this task
does not change: the deeper-path case, the Docs tab on `/docs/cli`, and the
click that returns to the element page. `selectedIndex` already keys on the
`/docs` prefix and the tab's path is already `/docs/element`. Step 12 mutates
`TabRow` twice and the wildcard route once — one mutation per case — to show
none of the three is vacuous.

- [ ] **Step 9: Add the bare route and the branch**

In `apps/lab/src/AppRoutes.tsx`, add above the `/docs/:what` route:

```tsx
      {/* The bare path is a documentation link too. Route order does not
          matter — react-router ranks matches — but it reads better here. */}
      <Route path="/docs" element={<Navigate to="/docs/element" replace />} />
```

Replace `apps/lab/src/routes/DocsRoute.tsx` with:

```tsx
import type { ReactElement } from 'react'
import { Navigate, useParams } from 'react-router'
import { CliDocs } from './CliDocs'
import { DocsNav } from './DocsNav'
import { ElementDocs } from './ElementDocs'

/**
 * The documentation tab's two pages. The section keeps the id, role and
 * aria-labelledby the tab strip resolves against, and the tabIndex that makes a
 * panel with no focusable content reachable — AppRoutes.browser.test.tsx and
 * Workspace.browser.test.tsx both hold that shell in place.
 *
 * An unknown page name redirects rather than rendering an empty panel: the
 * wildcard route cannot catch it, because `/docs/:what` has already matched.
 */
export function DocsRoute(): ReactElement {
  const { what } = useParams()
  if (what !== 'element' && what !== 'cli') return <Navigate to="/docs/element" replace />
  return (
    <main>
      <section id="docs-panel" role="tabpanel" aria-labelledby="tab-docs-panel" tabIndex={0} className="fw-docs">
        <DocsNav />
        {what === 'element' ? <ElementDocs /> : <CliDocs />}
      </section>
    </main>
  )
}
```

- [ ] **Step 10: Create the two page stubs so the route compiles**

These are filled in Tasks 5 and 6; they exist now only so this task's tests can
run. Create `apps/lab/src/routes/ElementDocs.tsx`:

```tsx
import type { ReactElement } from 'react'
import { useDictionary } from '../i18n'

export function ElementDocs(): ReactElement {
  const dict = useDictionary()
  return <h2>{dict.t('tabDocs')}</h2>
}
```

Create `apps/lab/src/routes/CliDocs.tsx`:

```tsx
import type { ReactElement } from 'react'
import { useDictionary } from '../i18n'

export function CliDocs(): ReactElement {
  const dict = useDictionary()
  return <h2>{dict.t('tabDocs')}</h2>
}
```

- [ ] **Step 11: Run the route tests to verify they pass**

Run: `cd apps/lab && pnpm exec vitest run --project chromium AppRoutes DocsNav`
Expected: PASS, 14 + 3 cases.

- [ ] **Step 12: Mutate the three cases that were green from the start**

Each of the three needs its own mutation — one mutation does not cover them, and
an earlier draft of this step claimed it did. All three were measured; each
produces exactly one failure, and each is restored before the next.

1. `apps/lab/src/shell/TabRow.tsx:15`: `pathname.startsWith('/docs')` →
   `pathname === '/docs/element'`. Fails `the Docs tab is the selected one on
   the CLI page`, `Expected aria-selected="true"` against
   `Received aria-selected="false"`.
2. `apps/lab/src/shell/TabRow.tsx:10`: the Docs tab's `path` →
   `'/docs/cli'`. Fails `clicking the Docs tab from the CLI page returns to the
   element page`, `Expected /docs/element`, `Received /docs/cli`.
3. `apps/lab/src/AppRoutes.tsx`: the wildcard's `<Navigate to="/" replace />` →
   `null`. Fails `a deeper docs path is a stale link and goes to the lab`,
   `Expected /`, `Received /docs/cli/extra` — which also shows that
   `toHaveTextContent('/')` is an equality here, not a substring match.

   Worth noticing while that mutation is in place: the file's older case
   `an unknown path redirects to the root` (`:65`) stays **green** under it. It
   asserts only that no tabpanel is rendered, which is true whether the path
   redirected or simply matched nothing — so it does not test the redirect its
   name promises. Not this PR's to fix; recorded because this mutation is the
   moment anyone would notice.

After restoring all three: 14 + 3 pass again.

- [ ] **Step 13: Commit**

```bash
git add apps/lab/src/routes/DocsNav.tsx apps/lab/src/routes/DocsNav.browser.test.tsx \
  apps/lab/src/routes/DocsRoute.tsx apps/lab/src/routes/ElementDocs.tsx \
  apps/lab/src/routes/CliDocs.tsx apps/lab/src/AppRoutes.tsx \
  apps/lab/src/AppRoutes.browser.test.tsx packages/engine/lab-i18n.ts
git commit -m "Give the docs tab two pages and a way between them

Links rather than a radio group: a documentation page has an address
worth copying, and only a link gives one. NavLink rather than an anchor,
because an anchor would reload the document and take the run and the GL
context with it.

The route also answers /docs, which fell to the wildcard and landed the
reader in the lab, and redirects an unknown page name, which the
wildcard cannot catch once /docs/:what has matched.

The old assertion on the echoed route segment goes with the paragraph
that echoed it."
```

---

## Task 5: The element page

**Files:**
- Create: `apps/lab/src/docs/useDocs.ts`
- Modify: `apps/lab/src/routes/ElementDocs.tsx`
- Create: `apps/lab/src/routes/ElementDocs.browser.test.tsx`
- Create: `apps/lab/src/design/docs.css`
- Modify: `apps/lab/src/main.tsx`

**Interfaces:**
- Consumes: `docsFor`, `ELEMENT_PROPS`, `ELEMENT_MEMBERS`, `ELEMENT_EVENTS`
  from `@arrowz/engine/docs`; `useStore` from `../state/store`.
- Produces: `useDocs(): Docs` from `apps/lab/src/docs/useDocs.ts`.

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/routes/ElementDocs.browser.test.tsx`:

```tsx
import { ELEMENT_EVENTS, ELEMENT_MEMBERS, ELEMENT_PROPS } from '@arrowz/engine/docs'
import { act } from 'react'
import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { ElementDocs } from './ElementDocs'

beforeEach(() => useStore.getState().lang.setLang('en'))

// `querySelectorAll` hands back `Element`, which has no `cells` — the lab's
// `check` gate catches that (TS2339) while vitest does not, so the generic
// argument is not decoration. Same trap as `querySelector` and `.style`.
const rowFor = (container: HTMLElement, key: string) =>
  [...container.querySelectorAll<HTMLTableRowElement>('tbody tr')].find((tr) => tr.cells[0]?.textContent === key)

test('every documented row reaches the page', async () => {
  const screen = await render(<ElementDocs />)
  const rows = screen.container.querySelectorAll('tbody tr')
  expect(rows).toHaveLength(ELEMENT_PROPS.length + ELEMENT_MEMBERS.length + ELEMENT_EVENTS.length)
  // One row spelled out, so the table is not merely the right length: the
  // machine columns are the point of the page.
  const pad = rowFor(screen.container, 'pad')
  expect(pad?.cells[1]?.textContent).toBe('number')
  expect(pad?.cells[2]?.textContent).toBe('pad')
  expect(pad?.cells[3]?.textContent).toBe('4')
})

// A property with no attribute must say so rather than leave a blank the reader
// has to interpret.
test('a property with no attribute says it has none', async () => {
  const screen = await render(<ElementDocs />)
  expect(rowFor(screen.container, 'board')?.cells[2]?.textContent).toBe('—')
})

// The only assertion that the page is wired to the store at all: the machine
// columns stay put, the descriptions change.
test('a language switch changes the descriptions and leaves the machine columns', async () => {
  const screen = await render(<ElementDocs />)
  const cellOf = (key: string, i: number) => rowFor(screen.container, key)?.cells[i]?.textContent
  const englishHelp = cellOf('pad', 4)
  await act(async () => useStore.getState().lang.setLang('pl'))
  expect(cellOf('pad', 1)).toBe('number')
  expect(cellOf('pad', 4)).not.toBe(englishHelp)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/lab && pnpm exec vitest run --project chromium ElementDocs`
Expected: FAIL — no `tbody` rows; the stub renders a heading only.

- [ ] **Step 3: Write the hook**

Create `apps/lab/src/docs/useDocs.ts`:

```ts
import { type Docs, docsFor } from '@arrowz/engine/docs'
import { useStore } from '../state/store'

/**
 * Built once per language, for the reason `i18n.ts` gives for the dictionary:
 * `docsFor()` returns the same object every call today, but a fresh one per
 * render would be a new dependency for every consumer that closes over it.
 */
const DOCS: Record<'en' | 'pl', Docs> = { en: docsFor('en'), pl: docsFor('pl') }

export function useDocs(): Docs {
  return DOCS[useStore((state) => state.lang.lang)]
}
```

- [ ] **Step 4: Write the page**

Replace `apps/lab/src/routes/ElementDocs.tsx`:

```tsx
import { ELEMENT_EVENTS, ELEMENT_MEMBERS, ELEMENT_PROPS } from '@arrowz/engine/docs'
import type { ReactElement } from 'react'
import { useDocs } from '../docs/useDocs'

/** The dash a table cell shows where a property has no attribute at all. */
const NONE = '—'

/**
 * The element's API as three reference tables. The machine columns come from
 * the shared rows and are not translated; only the last column is. The long
 * explanations stay in the package README, which the lead paragraph points at:
 * this page is a reference, and a second copy of the prose would be a second
 * thing to keep true.
 *
 * The code example lives here rather than in the engine module: an example
 * naming the page's global objects would trip `neutral.test.ts`, which greps
 * the text of engine sources.
 */
export function ElementDocs(): ReactElement {
  const docs = useDocs()
  return (
    <>
      <h2>&lt;arrowz-board&gt;</h2>
      <p>{docs.elementLead}</p>

      <h3>{docs.headExample}</h3>
      <pre className="fw-docs-code">
        {`<arrowz-board id="board" interactive lang="pl" style="width: 100%; height: 80vh"></arrowz-board>
<script type="module">
  import '@arrowz/board-element'
  import { defaultParams, generate } from '@arrowz/engine'
  const el = document.getElementById('board')
  el.board = generate({ ...defaultParams(), W: 50, H: 50, seed: 7 }).board
  el.addEventListener('piece-click', (e) => console.log('piece', e.detail.pieceId))
</script>`}
      </pre>

      <h3 id="docs-props">{docs.headProps}</h3>
      <table className="fw-docs-table" aria-labelledby="docs-props">
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
              <td className="mono">{row.key}</td>
              <td className="mono">{row.type}</td>
              <td className="mono">{row.attribute ?? NONE}</td>
              <td className="mono">{row.def}</td>
              <td>{docs.props[row.key]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 id="docs-members">{docs.headMembers}</h3>
      <table className="fw-docs-table" aria-labelledby="docs-members">
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
              <td className="mono">{row.key}</td>
              <td className="mono">{row.signature}</td>
              <td>{docs.members[row.key]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 id="docs-events">{docs.headEvents}</h3>
      <table className="fw-docs-table" aria-labelledby="docs-events">
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
              <td className="mono">{row.key}</td>
              <td className="mono">{row.detail}</td>
              <td>{docs.events[row.key]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>{docs.readmePointer}</p>
    </>
  )
}
```

All three tables end with the same translated column, `docs.colDescription`.
`docs.colDetail` is the event table's *middle* column — the payload shape — and
is not a heading for prose.

- [ ] **Step 5: Write the stylesheet**

Create `apps/lab/src/design/docs.css`:

```css
/* The documentation pages (spec §2.4). Its own file, as report.css explains for
   its own: one file per surface keeps a specificity collision inside the
   surface that caused it. The panel scrolls inside itself, like the report
   column, because the shell has a fixed height and does not scroll. */
.fw-docs {
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px;
}
.fw-docs h2 {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 500;
}
.fw-docs h3 {
  margin: 20px 0 6px;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ash);
}
.fw-docs p {
  max-width: 74ch;
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.6;
}
.fw-docs-nav {
  display: flex;
  gap: 14px;
  margin-bottom: 12px;
}
.fw-docs-nav a {
  font-size: 12px;
  color: var(--ash);
  text-decoration: none;
}
/* `page`, not `true`: a link says which page you are on, and the lab's chips
   and library rows say `true` about a choice. The two never meet. */
.fw-docs-nav a[aria-current='page'] {
  color: var(--ink);
  text-decoration: underline;
}
.fw-docs-table {
  width: 100%;
  margin-bottom: 4px;
  border-collapse: collapse;
  font-size: 12px;
}
.fw-docs-table th,
.fw-docs-table td {
  padding: 3px 10px 3px 0;
  text-align: left;
  vertical-align: top;
}
.fw-docs-table th {
  font-weight: 400;
  color: var(--ash);
}
.fw-docs-table .mono {
  font-family: var(--mono);
  white-space: nowrap;
}
.fw-docs-code {
  max-width: 100%;
  margin: 0 0 8px;
  padding: 10px 12px;
  overflow-x: auto;
  background: var(--graphite);
  color: var(--mist);
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1.5;
}
```

- [ ] **Step 6: Import the stylesheet**

In `apps/lab/src/main.tsx`, after `import './design/report.css'`:

```ts
import './design/docs.css'
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd apps/lab && pnpm exec vitest run --project chromium ElementDocs`
Expected: PASS, 3 tests.

- [ ] **Step 8: Commit**

```bash
git add apps/lab/src/docs/useDocs.ts apps/lab/src/routes/ElementDocs.tsx \
  apps/lab/src/routes/ElementDocs.browser.test.tsx apps/lab/src/design/docs.css \
  apps/lab/src/main.tsx
git commit -m "Render the element's API as three reference tables

The machine columns come from the shared rows, so the page and the guard
read the same data; only the description column is translated, which the
language test holds in place.

The code example lives in the lab. An example naming the page's global
objects would trip the engine's neutrality grep, which reads the text of
a source file and cannot tell a mention from a use."
```

---

## Task 6: The CLI page

**Files:**
- Modify: `apps/lab/src/routes/CliDocs.tsx`
- Create: `apps/lab/src/routes/CliDocs.browser.test.tsx`
- Modify: `apps/lab/src/design/docs.css`

**Interfaces:**
- Consumes: `helpText` from `@arrowz/engine/command`; `useDocs` from Task 5.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/routes/CliDocs.browser.test.tsx`:

```tsx
import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { CliDocs } from './CliDocs'
// A component test loads no stylesheet of its own — `main.tsx` is not in the
// picture — so a test that measures computed style has to import the sheets,
// exactly as `ReportPanel.browser.test.tsx` and `BoardFrame.browser.test.tsx`
// do. `docs.css` is the one the overflow assertion below needs; without it that
// assertion reads `visible` (measured). `tokens.css` carries the custom
// properties the rest of the sheet uses and is imported for the same reason the
// neighbouring test files import it, not because this assertion needs it.
import '../design/tokens.css'
import '../design/docs.css'

beforeEach(() => useStore.getState().lang.setLang('en'))

// Two markers, not one. A page rendering only the long form contains every
// line the short form has but two, so a single "a line only --help=knobs
// prints" assertion passes an implementation that shows one block. These two
// lines were measured: each appears in exactly one form.
const LONG_ONLY = 'Rules (checked together with the ranges):'
const SHORT_ONLY = 'Knobs: --lmax='

test('both help forms are on the page', async () => {
  const screen = await render(<CliDocs />)
  const text = screen.container.textContent ?? ''
  expect(text).toContain(SHORT_ONLY)
  expect(text).toContain(LONG_ONLY)
})

// The long form is a table aligned with padEnd: without `pre` the runs of
// spaces collapse and the columns are gone. `overflow-x: auto` belongs with it
// — the longest line is 296 characters, about 2317px, which would otherwise
// scroll the whole page sideways.
test('the terminal blocks keep their spacing and scroll by themselves', async () => {
  const screen = await render(<CliDocs />)
  const blocks = screen.container.querySelectorAll('pre.fw-docs-term')
  expect(blocks).toHaveLength(2)
  for (const block of blocks) {
    const style = getComputedStyle(block)
    // `white-space: pre` is also the browser's own default for `<pre>`, so this
    // line alone would pass with no stylesheet at all. It stays because the
    // rule declares it and a future `pre-wrap` would be a regression — but
    // `overflow-x` is the one that proves `docs.css` is in force.
    expect(style.whiteSpace).toBe('pre')
    expect(style.overflowX).toBe('auto')
  }
})

// The frame is translated; the help itself is the terminal's own English. The
// `h2` is NOT the thing to compare: `deno task carve` is a command name and is
// the same in both languages. The translated frame is the section headings and
// the lead paragraph.
test('the frame speaks the chosen language and the help does not', async () => {
  const screen = await render(<CliDocs />)
  const english = screen.container.querySelector('h3')?.textContent
  expect(english).toBe('Everyday help')
  useStore.getState().lang.setLang('pl')
  const polish = await render(<CliDocs />)
  expect(polish.container.querySelector('h3')?.textContent).toBe('Pomoc na co dzień')
  expect(polish.container.textContent ?? '').toContain(SHORT_ONLY)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/lab && pnpm exec vitest run --project chromium CliDocs`
Expected: FAIL — the stub has no `pre.fw-docs-term` and neither marker.

- [ ] **Step 3: Write the page**

Replace `apps/lab/src/routes/CliDocs.tsx`:

```tsx
import { helpText } from '@arrowz/engine/command'
import type { ReactElement } from 'react'
import { useDocs } from '../docs/useDocs'

/**
 * The CLI's help, called rather than generated. `helpText()` is a pure string
 * builder over PARAM_SPEC, which this bundle already carries, so the page
 * cannot drift from the knobs it documents — there is no copy to go stale, and
 * nothing to regenerate at build time.
 *
 * Both forms are shown: the everyday block and the full knob table. The text
 * itself stays the terminal's own English; the frame around it is translated.
 */
export function CliDocs(): ReactElement {
  const docs = useDocs()
  return (
    <>
      <h2>deno task carve</h2>
      <p>{docs.cliLead}</p>
      <p>{docs.cliEnglishNote}</p>

      <h3>{docs.cliShortHead}</h3>
      <pre className="fw-docs-term">{helpText()}</pre>

      <h3>{docs.cliKnobsHead}</h3>
      <pre className="fw-docs-term">{helpText({ knobs: true })}</pre>
    </>
  )
}
```

- [ ] **Step 4: Style the terminal blocks**

Append to `apps/lab/src/design/docs.css`:

```css
/* The help is a table aligned with spaces, so the layout IS the content:
   `pre` keeps it, and `overflow-x: auto` keeps the longest line — 296
   characters, about 2317px at this size — from scrolling the whole page.
   `pre-wrap` is not an alternative: it keeps the spaces and breaks the rows. */
.fw-docs-term {
  max-width: 100%;
  margin: 0 0 12px;
  padding: 10px 12px;
  overflow-x: auto;
  white-space: pre;
  background: var(--graphite);
  color: var(--mist);
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1.5;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/lab && pnpm exec vitest run --project chromium CliDocs`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/routes/CliDocs.tsx apps/lab/src/routes/CliDocs.browser.test.tsx \
  apps/lab/src/design/docs.css
git commit -m "Print the CLI's help by calling it

The component calls helpText() at render. The alternative the lab spec
named — a prebuild script writing a file — would put four of the lab's
six targets on a file that has to exist, and two more would inspect it,
though only in some of its shapes: a generated .ts is caught by eslint
and prettier, a .json by prettier alone, a .txt by neither.

Two markers assert that both forms are shown: a single assertion about a
line only the knob table prints is passed by a page that shows only the
knob table."
```

---

## Task 7: The two debts

**Files:**
- Modify: `apps/lab/src/stage/BoardFrame.tsx:88-98`
- Modify: `apps/lab/src/stage/BoardFrame.browser.test.tsx`
- Modify: `apps/lab/src/shell/TopBar.tsx`
- Modify: `apps/lab/src/shell/TopBar.browser.test.tsx`
- Modify: `apps/lab/src/design/shell.css:84-86`
- Modify: `apps/lab/src/report/LongestTable.tsx:20`
- Modify: `apps/lab/src/design/report.css:48`
- Modify: `apps/lab/src/report/ReportPanel.browser.test.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Write the three failing assertions**

In `apps/lab/src/stage/BoardFrame.browser.test.tsx`, inside the test at line
129-141 that already finds the toggle, add after the toggle is located:

```tsx
  // The name says "key F" in prose; this says it to a machine. Both stay: six
  // assertions in this file and LabLayout find the button by that whole name.
  await expect.element(toggle).toHaveAttribute('aria-keyshortcuts', 'f')
```

In `apps/lab/src/shell/TopBar.browser.test.tsx`, add a case inside the
`describe('TopBar', …)` block:

```tsx
  // The lab had no h1 at all, so the report's h3 sat under nothing. The
  // product's name is the document's title, because it is.
  it('names the document once, at the top level', async () => {
    const screen = await render(<TopBar />)
    await expect.element(screen.getByRole('heading', { level: 1, name: 'Arrowz' })).toBeVisible()
  })
```

In `apps/lab/src/report/ReportPanel.browser.test.tsx`, add after the test that
reads `#longest-head`:

```tsx
// The heading moved from h3 to h2 so the document has no level gap, and
// report.css had to follow it. Nothing else in this file would have noticed:
// eight tests pass over a heading rendered at 18px and bold.
test('the longest-pieces heading keeps the report voice after the level change', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  const head = screen.container.querySelector('#longest-head')
  expect(head?.tagName).toBe('H2')
  const style = getComputedStyle(head instanceof HTMLElement ? head : document.body)
  expect(style.fontSize).toBe('11px')
  expect(style.textTransform).toBe('uppercase')
})
```

- [ ] **Step 2: Run the three files to verify they fail**

Run: `cd apps/lab && pnpm exec vitest run --project chromium BoardFrame TopBar ReportPanel`
Expected: FAIL — no `aria-keyshortcuts`, no level-1 heading, `#longest-head` is
an `H3` at 18px.

- [ ] **Step 3: Add the attribute**

In `apps/lab/src/stage/BoardFrame.tsx`, on the solo toggle, after `aria-pressed`:

```tsx
          aria-keyshortcuts="f"
```

- [ ] **Step 4: Make the mark a heading**

In `apps/lab/src/shell/TopBar.tsx`, replace:

```tsx
      <span className="name">Arrowz</span>
```

with:

```tsx
      <h1 className="name">Arrowz</h1>
```

In `apps/lab/src/design/shell.css`, replace the `.fw-top .name` rule:

```css
/* An h1, so the document has a title above the panels' headings. The size was
   already this rule's — a (0,2,0) selector beats the browser's — but the
   weight and the block margins were not, and a bar 48px tall should not depend
   on absorbing them. */
.fw-top .name {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
}
```

- [ ] **Step 5: Move the report heading down one level**

In `apps/lab/src/report/LongestTable.tsx:20`, replace `<h3 id="longest-head">`
with `<h2 id="longest-head">` and its closing tag with `</h2>`.

In `apps/lab/src/design/report.css:48`, replace the selector `.fw-report h3`
with `.fw-report h2`. The declarations are unchanged.

- [ ] **Step 6: Run the three files to verify they pass**

Run: `cd apps/lab && pnpm exec vitest run --project chromium BoardFrame TopBar ReportPanel LabLayout`
Expected: PASS. `LabLayout` is in the run because five of the six assertions
that locate the solo button by name live there — if any of them fails, the
button's name was changed, which this task must not do.

- [ ] **Step 7: Commit**

```bash
git add apps/lab/src/stage/BoardFrame.tsx apps/lab/src/stage/BoardFrame.browser.test.tsx \
  apps/lab/src/shell/TopBar.tsx apps/lab/src/shell/TopBar.browser.test.tsx \
  apps/lab/src/design/shell.css apps/lab/src/report/LongestTable.tsx \
  apps/lab/src/design/report.css apps/lab/src/report/ReportPanel.browser.test.tsx
git commit -m "Announce the solo key, and give the document a title

aria-keyshortcuts joins the button whose name already says 'key F' in
prose. The name stays exactly as it is: six assertions across two files
find that button by the whole string.

The mark becomes the document's h1, so the report's heading can drop to
h2 and the levels stop skipping. report.css follows it: the rule is
keyed on the element, and without the move the heading falls back to the
browser's 18px bold with every gate still green."
```

---

## Task 8: The spec amendments and the whole-branch gate

**Files:**
- Modify: `docs/superpowers/specs/2026-09-13-lab-react-app-design.md:520-527`
  (the docs bullet of §5.2 — the sentence to replace is at `:521-523`) and
  `:1007` (row 6 of §10)

**Interfaces:** none.

- [ ] **Step 1: Amend §5.2 of the lab spec**

In `docs/superpowers/specs/2026-09-13-lab-react-app-design.md`, the docs bullet
of §5.2 runs from `:520` to `:527`. **Replace exactly the span that begins with
`and the CLI's help generated` and ends with the full stop after
`` from `dist/` `` — the leading `and` and that final full stop included.**
The sentence after it, which begins `A test parses …`, stays. Getting the span
wrong in either direction produces `and and the CLI's help` or
`Amended in PR 6.. A test parses`.

The replacement, which supplies its own `and` and its own closing full stop:

```
  and the CLI's help, called from `helpText()` (`command.ts:424`) at render
  rather than generated: the lab already imports `@arrowz/engine/command` at
  runtime (`App.tsx:2`), so a prebuild would add a generated source file that
  four of `apps/lab`'s six targets would fail without — and that `lint` and
  `fmt` would inspect, though only in some of its shapes: measured, a generated
  `.ts` is caught by both, a `.json` by Prettier alone, and a `.txt` by neither.
  Amended in PR 6.
```

- [ ] **Step 2: Amend row 6 of §10**

Replace the row-6 cell with:

```
| 6 | The docs route: the element's API guarded against `mod.ts` and `arrowz-board.ts` — the property, member and event tables, not only the event map, with the "nothing public is undocumented" direction read from the declarations in the engine's Deno test and the "everything documented exists" direction read from the runtime class in the element's browser test — and the CLI help **called** from `helpText()` at render, not generated at build time (plan `2026-09-18-lab-docs-route.md`) |
```

- [ ] **Step 3: Run both gates over the whole branch**

Run:

```bash
cd /Users/tomek/dev/arrowz && deno task verify && pnpm nx run-many -t verify
```

Expected: PASS. If `deno fmt --check` fails on a file this branch touched, run
`deno fmt` on it; if Prettier fails in `apps/lab`, run
`pnpm --filter @arrowz/lab exec prettier --write src`.

- [ ] **Step 4: Check the branch against the neutrality grep once more**

Run:

```bash
cd packages/engine && grep -nE "\bDeno\.|\bdocument\.|\bwindow\.|\blocalStorage\b|\bprocess\.|from 'node:|\bBuffer\." lab-docs.ts
```

Expected: no output. Prose written after Task 1 may have reintroduced a
forbidden spelling; the test would catch it, but this says which line.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-13-lab-react-app-design.md
git commit -m "Amend the lab spec where PR 6 departed from it

The help is called, not generated, and the API guard reaches past the
event map to the properties and members, split across two packages by
what each environment can see."
```

---

## Manual pass before the pull request

The repository's practice is a manual run in a real browser, because it has
caught what tests did not. Run `pnpm nx serve lab` with `deno task store` beside
it, then:

1. `/docs` in the address bar lands on the element page.
2. Both navigation entries are links: middle-click opens a new tab, and the
   current one is underlined.
3. Switch the language in the top bar: the descriptions change, the types do
   not, and the CLI help stays English.
4. The knob table scrolls sideways inside its own block, and the page does not.
5. The board's solo button still says "Full view (key F)"; `f` still toggles.
6. The report's "5 longest" heading is small, uppercase and grey — not large
   and bold.

---

## Self-review

**Spec coverage.** §2.1 → Task 6 (call) and Task 8 (amendment). §2.2 → Task 1
(module, four wiring points, node-smoke, CLAUDE.md, the neutrality constraint).
§2.3 → Task 1 (`as const satisfies`, the row/description split) and Task 1 step
1 (parity asserting what the compiler cannot). §2.4 → Task 4 (routes, redirect,
`NavLink`, the shell, the selected tab on `/docs/cli`, the tab after the
upper-case redirect, and the click that returns to the element page). §3.1 →
Task 2. §3.2 → Task 3, **per key** and not per set. §3.3 → Task 2's parser
rules, Task 1's eleven member rows, and Task 2 step 2's account of the one shape
each parser sees — including the public arrow-function field the spec asks to be
recorded rather than assumed away. §3.4 → Task 1's rows. §4.1 → Task 7. §4.2 →
Task 7. §5 → the file table above. §7 → tests in Tasks 1-7, the manual pass, and
Task 8's gate run.

**What three review rounds changed here.** The figures below come from the
rounds' own reports, not from anything a reader can check in this file.

Round one: five reviewers executed the
plan in separate worktrees. Tasks 1, 2 and 4-6 were run end to end (Tasks 4-6
reaching 482 green tests); Task 3 and Task 7 were read rather than run in that
round, and Task 7 was executed in a round of its own. The three parsers of
Task 2 returned exactly what Task 2 claims. Roughly twenty separate corrections
followed, of which the one worth naming is that Task 3 had regressed to
comparing attribute *sets* — which the spec's own §10 records as overturned —
while keeping the `lit` import that was the fingerprint of the check it no
longer performed.

Round two attacked those corrections. One did not survive: the `rowFor` helper
was broken across three lines, and Prettier wants it on two — the whole
expression on a single line would run to 168 characters. Five held under
named negative controls, and the round added what neither had: the frame around
the tables — headings, column labels, leads — had no translation guard at all,
`declaredProps` could not see a property entry that `deno fmt` had wrapped, and
the note on parser limits claimed a protection the sanity assertion does not
provide.

Round three ran everything round two had added. **No code defect survived it** —
all six new fragments passed on first execution, and the whole lab suite was
green. (The suite totals the rounds report are not comparable with each other:
each round ran a different revision of this plan, so a larger number is not a
better one.) Its ten findings were all in the prose: a `git add` that omitted the file
step 1 of Task 3 edits, a spec amendment that was not a drop-in, and eight
numbers or diagnoses that had been reasoned out rather than measured. The
recurring shape across all three rounds is worth naming for whoever revises this
next: **the expected result is usually right and the explanation of it is
usually wrong.** Step 8 of Task 4 contradicted step 9 of the same task for two
revisions running.

**Placeholders.** One defect found and fixed: Task 5's tables reused
`colDetail` as the heading of two different columns, and the step said so in a
paragraph of thinking-aloud rather than an instruction. `Docs` now carries
`colDescription` (`'Description'` / `'Opis'`), every table's last column uses
it, and `colDetail` means the event payload and nothing else. No other
placeholder patterns remain: every code step carries the code, and no step says
"add error handling" or "similar to Task N".

**Type consistency.** `docsFor` returns `Docs` in Task 1 and is consumed as
`Docs` in Task 5. `ELEMENT_PROPS`/`ELEMENT_MEMBERS`/`ELEMENT_EVENTS` keep their
names in Tasks 1, 2, 3 and 5. `PropRow.attribute` is `string | null` in Task 1
and is compared as `string | null` in both guards: Task 2 reads it from the
declaration's text, Task 3 from Lit's own declaration object, mapping `false` to
`null` rather than skipping it. `Docs` gains `colDescription` in Task 1 and is
consumed in Tasks 5 and 6. `useDocs` is declared in Task 5 and used in Tasks 5
and 6. `BoardData` is named by Task 1's table and re-exported by Task 3.
