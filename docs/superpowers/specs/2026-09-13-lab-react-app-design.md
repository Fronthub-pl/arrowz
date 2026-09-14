# The generator lab as its own application: `apps/lab`

Date: 2026-09-13. Step 3 of the road map fixed in
`docs/superpowers/specs/2026-09-09-monorepo-design.md` §2.

Revision 2: rewritten after two adversarial reviews. What changed and why is
recorded in §11, because several of the corrections are decisions, not typos.

## 1. Why this exists

`<arrowz-board>` is specified as usable from React, Angular, Svelte, Vue and
plain HTML (monorepo design §1), the game will consume it from Angular — and
the element has **no framework consumer at all** today. Its only user is
`packages/cli/lab-page.ts`, which imports it by relative path because Deno
cannot resolve the package name (`lab-page.ts:47-51`), drives it imperatively
and shares one instance across tabs.

A React lab is the cheapest way to prove the `@lit/react` path — object
properties, event mapping, lifecycle under a router, one GL context across
route changes — before the Angular game sits the same exam. That is the reason
for this step. The second reason is smaller but real: `lab-page.ts` is 1668
lines against 59 fixed ids in `lab.html`, and four kinds of state live in the
DOM rather than in a variable (§2.3).

This document designs `apps/lab`: a React application consuming the engine, the
CLI's vocabulary and the board element as packages, wearing the visual layer
designed as *Arrowz Workshop v2* in the Claude Design project
`7fc443c6-aaf3-4d37-a380-9812f10110b6`.

Out of scope: any change to generator behaviour; the Angular game (step 4);
publishing to JSR or npm; a hover hit test in `<arrowz-board>`; making the
element's own control bar hideable. The last two are recorded in §12.

## 2. What the lab does today

### 2.1 Twelve units of responsibility

| # | Unit | Anchor |
|---|---|---|
| 1 | Language switch PL/EN, 101 UI keys | `lab-page.ts:500-545` |
| 2 | Parameter panel built from `PARAM_SPEC`, groups, violations, inactive knobs | `:199-498`, `:778-822` |
| 3 | Presets by level and mode | `:551-593` |
| 4 | Simple view: sizes, 0-100 sliders, segmented choices | `:600-771` |
| 5 | Nine preview/export fields | `:837-861`, `:1055-1060` |
| 6 | Live CLI command with copy | `:866-879` |
| 7 | Worker lifecycle, progress, abort | `:885-1033` |
| 8 | Board display through `<arrowz-board>` | `:64-87`, `:1014-1019` |
| 9 | Report: 23 statistics rows and 4 separators, delta column, longest pieces | `:1535-1657` |
| 10 | SVG download through a throw-away worker | `:1082-1112` |
| 11 | Board store client, POST after each generation | `:1121-1155` |
| 12 | Tabs and the saved-boards library, including view editing and delete | `:1160-1450` |

The knob table has **28 entries** (`PARAM_SPEC.length`), in **six groups**
(`board`, `lengths`, `shape`, `difficulty`, `skeleton`, `closing`). Of those,
two carry `control: { kind: 'choice' }` (`trapBias`, `giantSpacing`), two carry
`surface: 'start'` (the composite `--start` control), and **none is boolean** —
there is no knob with `min: 0, max: 1, step: 1`. The mock's switches are board
element attributes, not generator knobs.

Three engine modules already carry the DOM-neutral half: `lab-simple.ts` (454
lines), `lab-i18n.ts` (540), `lab-presets.ts` (74). `neutral.test.ts` keeps
them free of the DOM.

### 2.2 What starts a run — the behaviour this application must keep

Measured from the source. This table is the lab's contract; it decides
`run.slice`, the draft/commit rule and the debounce.

| Trigger | Timing | Knobs redrawn first | Anchor |
|---|---|---|---|
| Knob edit, advanced view | 350 ms debounce, **only if `auto` is checked** | no | `:256-261`, `:1030-1033` |
| Preset chosen | immediate | all knobs set from the preset, `cell` from `exportCell` | `:580-593` |
| Simple size field | 350 ms debounce | recipe → knobs | `:633-641` |
| Simple slider | 350 ms debounce | recipe → knobs | `:665-672` |
| Simple segmented button | immediate | recipe → knobs | `:696-700` |
| Generate | immediate | in simple view with randomising on: yes | `:1037-1040` |
| New seed | immediate, after a random seed | as above | `:1041-1045` |
| Defaults | immediate | `defaultParams()`; in simple view the recipe resets, keeping `random` | `:1046-1054` |
| External `hashchange` | immediate, after re-reading the hash and the language | no | `:1526-1532` |
| Page load | immediate | `applySimple()` first, unless the hash carried knobs | `:1660-1668` |

Two rules cut across the table:

- **A run refuses to start while a rule is violated** (`:995-998`); Generate is
  disabled and the violations are listed (`refreshActive`, `:457-489`).
- **A new run replaces the one in flight**: `run()` does `if (busy)
  killWorker()` (`:1002`), then `ensureWorker()` builds a fresh worker
  (`:899-902`). An idle worker is reused. What makes this safe is the `busy`
  flag allowing one outstanding request — not the termination.

Editing any of the nine preview fields **redraws without generating**
(`:1055-1060`).

### 2.3 What will not port line by line

1. **Nine preview fields have no variable at all.** `viewOptions()`
   (`:846-857`) and `voidsOn()` (`:859-861`) read `el(id).value` / `.checked`
   on every call; `saveToUrl()` (`:1472-1486`) serialises the raw input
   *strings*, so the URL hash holds `"12"` rather than `12`. The library view
   fields do the same through `libView()` (`:1360-1370`).
2. **View mode is a body class**: `simpleActive()` reads
   `document.body.classList.contains('simple')` (`:748-750`); full screen is the
   `body.solo` class, toggled by a button and the `f` key (`:1062-1072`).
3. **`setParam` consults `document.activeElement`** (`:797`) so that writing
   state does not clobber a seed field under the cursor.
4. **Status is HTML**: `setStatus` assigns `innerHTML` (`:959-961`) and call
   sites wrap dictionary strings in `<span class="bad">` (`:915`, `:926-927`,
   `:988`, `:996`).

## 3. Decisions and rejected alternatives

**Vite 8 + React 19, no framework.** Rejected: *Next.js* — every panel would be
`'use client'` for an application whose entire workload is a Web Worker and
whose store is an existing Deno server; its server runtime would sit beside
`lab-server.ts`, not replace it. Rejected: *Astro islands* — two mental models
in one project. Vite also matches `packages/board-element`, which already runs
Vite 8 and Vitest 5 with Playwright Chromium in CI.

**React Router 8, declarative mode** (`<BrowserRouter>`, `<Routes>`). Rejected:
*framework mode* (its Vite plugin, `routes.ts`, type generation and SSR
machinery solve nothing here); *data mode* (one `fetch` for the board list does
not need loaders); *no router* (loses deep links and the back button).

**ESLint 10 flat config + Prettier 3.9 for `apps/lab`,** with
`typescript-eslint`, `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y`.
Rejected: extending `deno fmt`/`deno lint` over `apps/` — measured to work on
TSX (Deno 2.9.6 formats it and ships `jsx-*` plus `react-rules-of-hooks`), and
it would have kept one formatter in the repository, but the Node-side toolchain
is what a React contributor expects. `deno.json` keeps excluding `apps/`.
`jsx-a11y` is load-bearing: the mock has nine classes of accessibility gap
(§7.2). `apps/lab` pins the same `playwright` version as `board-element` so CI's
cached Chromium is shared.

**`@lit/react` 1.0.8 for the board.** `createComponent` sets properties rather
than attributes and maps `onPieceClick` to `piece-click`; `<arrowz-board>`
takes the board and the view as objects, which React alone would stringify.
One file in the application touches it: `stage/BoardCanvas.tsx`.

**Zustand 5 for state, with per-key selectors and per-key derived indexes.**
Twenty-eight knobs, each of which needs its value, the violations naming it and
its inactive reason. `refreshActive` recomputes all of that for all rows on
every edit today; storing `violations: Violation[]` raw would make every knob
select the array and re-render on every keystroke, which is the cost this
choice exists to avoid. The slice therefore stores **per-key indexes with
stable references**: `byKey: Record<ParamKey, readonly Violation[]>` and
`inactive: Record<ParamKey, InactiveKey | null>`, rebuilt on change and
identity-preserved where a key's entry did not change. Rejected: *context +
`useReducer`* (re-renders the whole grid); *a hand-rolled store on
`useSyncExternalStore`* (same characteristics in ~40 lines and no runtime
dependency, but own code where a standard exists).

**The board store stays `packages/cli/lab-server.ts` behind a Vite proxy.** The
server carries the CSP, the loopback-`Host` check and the cross-origin-`Origin`
refusal (`lab-server.ts:65-75`), and validates every `PARAM_SPEC` key and view
number on write (`:90-127`). **That validation stays exactly as strict as it is**
— see §4.2. Rejected: *a new Node backend* (duplicates tested code);
*OPFS/IndexedDB* (loses the store shared with the CLI).

**Bilingual PL/EN with a switch in the top bar.** The mock is English-only; the
repository rule and `lab-i18n.ts` are not negotiable. The switch sits in the top
bar's right group, beside ⌘K. The URL hash wins over `localStorage` on load,
then the chosen language is persisted — today's precedence.

**The board element keeps its own control bar; the mock's zoom triplet is
dropped.** `arrowz-board.ts:365-401` already renders zoom, fit, a colour toggle
and a gesture switch, and the element has no property to hide them. Adding one
would be a change in a package this step does not touch, inherited by the
Angular game. The visual deviation from the mock is accepted, and the follow-up
is recorded in §12.

**The run filmstrip keeps parameters, metrics and a thumbnail per run — one
decoded board in memory.** A decoded Insane board is an `Int32Array(1e6)` (4 MB)
plus ~10^6 `Cell` objects, on the order of 50 MB; ten of them would be half a
gigabyte in the tab. Keeping only `BoardFile` strings instead would pay
`decodeBoard` over 10^6 cells plus a scene rebuild on every peek, and the rail
mirrors hover onto focus, so keyboard traversal would fire one per run.
Selecting a run therefore reloads it (from the store, or by regenerating from
its parameters and seed), exactly as `lastDone` behaves today. Rejected:
*N decoded boards with a measured cap* (needs a measurement session before PR 6
and a cap to explain in the UI); *dropping the filmstrip* (loses one of the
mock's two distinguishing features for no gain).

**Local development tool.** No public hosting, so no static-export or adapter
constraints.

## 4. Package boundaries

### 4.1 What moves out of the page first (PR 1)

Ten pure fragments, nine into the engine and one into the board element:

| Fragment | Now | Goes to | Note |
|---|---|---|---|
| Report rows (23 rows, 4 separators, delta signs, formatting) | `:1540-1637` | engine, new `lab-report.ts` | needs a sixth subpath export (§4.3) |
| `longestSummary(board, n)` | `:90-120` | engine, beside `analyse` | |
| `clampParam(spec, value)` | `:778-782` | engine, beside `snapToStep` | range and step only — never a rule (§5.4) |
| `readParams(raw)` | `:142-150` | engine, as the page's **tolerant** reader | does **not** replace the server's check (§4.2) |
| `viewNumber` clamp rule | `:837-844` | `command.ts` beside `VIEW_RANGE`, as the page's tolerant reader | as above |
| `violationText(v)` | `:444-456` | `lab-i18n.ts` | gains value imports of `stepsAround`, `PARAM_SPEC`, `INACTIVE_REASONS`, `RULE_REASONS`; no cycle |
| `recipeOf(raw)` | `:605-608` | `lab-simple.ts` beside `normalizeChoice` | |
| `genSeconds(meta)` | `:1258-1260` | engine, exported as a **value** from `mod.ts` | `types.ts` is re-exported with `export type *`; returns the UI string `'—'`, so it takes the dash as a parameter |
| Store request bodies | `:1123-1137`, `:1384-1391` | engine, as the shared store contract | `store.ts`'s `SaveInput` **extends** it with `svg?` and `metrics.aborted?` |
| `boardView(view, voids)` | `:69-79` | `packages/board-element` | `BoardView` is its type (`src/view.ts:5-23`) and it already depends on the engine; the engine cannot import it without inverting that dependency |

Two fragments the first review of this document listed as pure are **not**, and
move in a changed shape:

- **`startChoiceOfState` / `setStart` / `START_CHOICES`** (`:330-385`).
  `setStart` calls `setParam`, which touches `paramRows`, `el('sSeed')`,
  `refreshActive()` and `updateCommand()`; `startChoiceOfState()` reads the
  module-level `state` with no argument; and `START_CHOICES` is derived from
  `EN.start.options`, where `mixing` has no counterpart in `START.words`
  (`command.ts:64-76`). What moves is a pure `startChoiceOf(params)` into
  `command.ts` and the choice list into `lab-i18n.ts` beside the labels that
  define it. `setStart` becomes a store action in the application.
- **Progress `short(n)`** (`:909`) calls `fmt`, so its output depends on the
  page's language. It moves as `short(n, locale)`.

The old lab switches to the moved functions in the same PR. Because none of
these fragments has a test today, PR 1 proves compilation and unchanged
fingerprints, not behaviour — so it **adds** unit tests for each moved
fragment, which is half its value.

### 4.2 Why the server's validation is not a duplicate

The first draft of this document claimed the page's readers could replace
`checkParams` and `checkView` in `lab-server.ts`. They cannot, and the
difference matters:

| | Page (`readParams`, `viewNumber`) | Server (`checkParams`, `checkView`) |
|---|---|---|
| Non-number under a known key | silently dropped, default shows in the field | **400**, `params.<key> must be a number` |
| Envelope violation | shown, Generate disabled | **400**, violations listed |
| View number out of range | clamped into `VIEW_RANGE` | **400** |
| `colored` / `rounded` wrong type | not examined | **400** |

The server's comment says why (`lab-server.ts:86-88`): the seed goes into file
names, and the store must hold only boards the engine would generate.
`lab-server.test.ts:85-106` asserts those refusals. Swapping a rejecting
validator for a clamping reader would be a silent weakening of the store
contract, and would reintroduce exactly the unlogged moves PR #61 removed.

**A page reader is tolerant because a person is typing; a server reader is
strict because it writes to disk under a name derived from the data.** Two
readers on two sides of a trust boundary are defence in depth, not duplication.
What may be shared is the *predicate* — "a finite number under a `PARAM_SPEC`
key" — while each side keeps its own reaction. PR 1 extracts that predicate and
leaves both reactions alone.

### 4.3 What the application consumes

- `@arrowz/engine` and its subpaths `/command`, `/simple`, `/presets`, `/i18n`,
  all declared in `packages/engine/package.json` and emitted by `tsc` into
  `dist/`. `lab-report.ts` needs three additions PR 1 must make: a sixth
  `exports` entry, an entry in `tsconfig.build.json`'s `include`, and a line in
  `scripts/node-smoke.mjs`. `packages/engine/deno.json` needs the matching
  export for the old lab.
- `@arrowz/board-element` **by package name**, which fixes the relative-path
  seam by construction.
- `dist/` is gitignored, so `pnpm nx build engine` runs before `vite dev`.
  `apps/lab/project.json` puts `dependsOn: ["^build"]` on `serve` as well as
  `build`, because `nx.json`'s default has it on `build` alone.

### 4.4 Nx and CI

`apps/lab/project.json` declares `check` (`tsc --noEmit`), `lint` (eslint),
`fmt` (`prettier --check`), `test` (vitest), `build` (vite build), `serve`
(vite, `cache: false`, `dependsOn: ["^build"]`) and `verify` (noop over the
rest) — the shape of `packages/board-element/project.json`. CI runs `nx affected
-t check lint fmt test build smoke bundle`, so the project enters the gate
without touching the workflow.

## 5. Architecture

### 5.1 Component tree

```
apps/lab/src/
  main.tsx                    mount, <BrowserRouter>
  App.tsx                     routes, shell, global hotkeys, and the two things
                              that must outlive a route change: useGenerator
                              and the single <arrowz-board>
  shell/
    TopBar.tsx                mark, preset name, dims, ⌘K, language, simple/advanced
    TabRow.tsx                role="tablist", arrow keys, aria-controls
  routes/
    LabRoute.tsx              /            stage + console
    SavedBoardsRoute.tsx      /boards      list, detail, load into lab
    DocsRoute.tsx             /docs/:what  element | cli
  stage/
    Stage.tsx                 70px + 1fr layout
    BoardCanvas.tsx           createComponent(<arrowz-board>) — the only @lit/react site
    BoardFrame.tsx            paper frame, annotation, solo toggle (button and `f`)
    RunRail.tsx               filmstrip, aria-current, focus mirrors hover
    RunStatusBar.tsx          ready / carving / failed / saved, aria-live="polite"
    RunDiffStrip.tsx          differences against the peeked run
  console/
    Console.tsx               168px rail + knob grid + the run column it is
                              handed as a child (three tracks)
    GroupRail.tsx             six groups plus the element section, violation counts
    KnobPanel.tsx             group header + grid
    Knob.tsx                  dispatch by spec: value | choice | start
    ValueKnob.tsx             number, word, inline entry, local draft
    KnobSlider.tsx            role="slider", keyboard, rule marker (not a clamp)
    ChoiceKnob.tsx            trapBias, giantSpacing — a labelled select
    StartKnob.tsx             the composite --start control; shows mix only when mixing
    ViewPanel.tsx             the nine preview/export fields
  simple/
    SimpleConsole.tsx         sizes, sliders, segmented choices
  run/
    RunColumn.tsx             command, Generate, New seed, Defaults, auto, help,
                              abort, exports — built by the route and handed to
                              whichever console is on screen, so both share one
                              instance
  report/
    StatsTable.tsx            23 rows, 4 separators, delta keyed by metric name
    LongestTable.tsx          longest pieces
  library/
    BoardList.tsx             size chips, rows, refresh
    BoardDetail.tsx           command, view fields, load into lab, two-click delete
  palette/
    CommandPalette.tsx        role="dialog" + combobox, focus trap
  state/
    store.ts                  one store, the slices below
    params.slice.ts           28 knobs, clamping, per-key violation and inactive indexes
    view.slice.ts             the nine preview fields as typed values
    run.slice.ts              the state machine of §5.3, history, triggers of §2.2
    library.slice.ts          sizes, list cache, selection, the stored board's own view
    ui.slice.ts               tab, selected group, palette, mode, solo, help, clamp notice
    lang.slice.ts             PL/EN, localStorage `labLang`
    recipe.slice.ts           the simple view's recipe, localStorage `labSimple`
    url.ts                    hash codec, tolerant reader, hashchange → store → run
  worker/
    generate.worker.ts        imports @arrowz/engine
    useGenerator.ts           start, progress, abort, result — mounted once, in App
  api/
    boards.ts                 GET / POST / DELETE, types from the engine
  design/
    tokens.css                14 colour tokens + 2 font tokens
    fw.css                    the 258 ported lines, dead rules dropped
```

Three corrections to the first draft are visible here. `SwitchKnob` is gone —
no knob is boolean. `ChoiceKnob` and `StartKnob` exist, because two knobs are
choices and two share the composite start control; the traversal rule is
Knob-level, not global: the panel builds the start control where the first
`surface: 'start'` spec would have stood and skips the second (`:418-430`).
`RunColumn` is built by the route and passed to `Console` as a child, so
swapping in `SimpleConsole` cannot fork it; `Console` is therefore the mock's
three-track grid and the column is its third track.

*Amended after PR 3.* The first draft lifted the column out of the console and
placed it as the console's sibling. What it was protecting is the single
instance — a run in flight must survive the simple/advanced swap — and a child
the caller constructs is the same instance whichever console places it, so the
guarantee is unchanged. Placing it inside buys back the mock's own grid
directly: the column is a grid item of `.fw-console`, which is what lets the
≤900px query turn it into a full-width row under the other two tracks
(`console.css:393-401`). A lifted column is not in that grid at all, so the
same rule needs the grid re-parented around both boxes, through a
`display: contents` wrapper that the query then has no box to address. The
tree that shipped is
`LabRoute` → `Console` → `RunColumn`, with the route owning the ref that the
clamp notice hands focus back to.

### 5.2 Reconciling the mock with the lab

- The mock's rail has two sections, *generator* and *element*. The element
  section is the nine preview/export fields (unit 5) — `ViewPanel`, not a new
  concept.
- The mock shows one group at a time; today all six are `<details>` with
  `board` and `skeleton` open (`:208`). The mock's model is kept, and the group
  rail shows a per-group violation count so nothing hides behind a closed
  group. This is a deliberate UX change, recorded as one.
- The mock has no simple view. It swaps `Console` for `SimpleConsole`; the
  stage, filmstrip, status bar and the run column the route hands in are
  untouched. In simple mode `cell`, `voids`, `top`, `auto` and `help` are
  hidden, as `.advonly` does today (`lab.html:52`).
- The mock's `element` tab becomes `docs` with two sections: the element's API,
  and the CLI's help generated at build time from `helpText()`
  (`command.ts:397`) by a prebuild script importing `@arrowz/engine/command`
  from `dist/`. A test parses `board-element/src/mod.ts` for the event map the
  way `readme.test.ts` guards the README tables — the mock's own tables carry
  two incompatible event vocabularies, and the real names are
  `piece-click`, `piece-removed`, `life-lost`, `finished`, `viewport-change`
  (`mod.ts:45-51`).
- The mock has no report. The statistics and longest-pieces tables keep the
  lab's content in the mock's `.fw-tbl` treatment, below the console.

### 5.3 State slices

| Slice | Holds | Persisted |
|---|---|---|
| `params` | 28 knobs, per-key violation and inactive indexes | URL hash |
| `view` | the nine preview fields as typed values | URL hash |
| `run` | `idle \| running \| done \| error`, progress, retries, metrics, the current board, history entries (params, seed, metrics, thumbnail) | no |
| `library` | sizes, list cache, selected board, that board's own view fields | no |
| `ui` | tab, selected group, palette, simple/advanced, solo, `auto`, `help`, clamp notice, flash | `labView` |
| `lang` | `pl \| en` | `labLang` |
| `recipe` | the simple view's recipe | `labSimple` |

Notes the first draft got wrong or left out:

- **`auto` and `help` are state, not decoration.** `auto` is the whole point of
  the advanced view (edit a knob, get a board 350 ms later) and `help` is
  carried in the URL hash; the first draft dropped both.
- **The clamp notice has a home.** A hash link or a preset whose values were
  clamped raises it (`:819-822`); a tolerant reader that clamps silently is a
  reader that lies.
- **The recipe is its own slice, not a view of `params`.** Slider positions are
  not derivable from the knobs they produce (`simpleParams`), and it has its own
  storage key.
- **The library keeps its own view fields.** The stored board is previewed with
  the view saved beside it, edited independently of the lab's, and re-POSTed
  after a 350 ms debounce (`:1359-1417`).
- **`lang` and `tab` precedence:** the hash wins on load, then `lang` is
  persisted; a hash carrying `tab: 'library'` redirects to `/boards`.
- **Three parameter sets exist for a reason** (`:950-953`): the knobs on screen,
  the parameters the current board was made from, and the parameters the export
  names. The board on screen always belongs to `run.current`; the filmstrip
  selects into it.
- **Two delta baselines:** the report compares against the previous completed
  run (`prevStats`, `:956`), the diff strip against the peeked run. They are
  different fields and both are keyed by metric name.
- **Status is structured data** carrying a source (`run` / `store` / `library`),
  so a library message cannot silently overwrite a run's outcome.

### 5.4 The range ceiling and the rule floor are different things

`clampParam` clamps to `spec.min`/`spec.max` and snaps to `spec.step`. That is a
**range**, it is a property of one knob, and clamping it silently is fine: the
field shows the clamped value immediately.

A **rule** bound — `straightFloor(params)` for `pStraight`, which depends on
`W`, `H`, `warns` and `anticoil` — is never clamped. Today the lab paints the
row, lists the violation and disables Generate, and PR #61 has just made silent
moves accountable elsewhere in the system. The slider therefore draws the
rule bound as a **marker with a reason**, and the run refuses; the mock's
ceiling caption ("the run will use 20" under `--lateral=40`) is a mock bug, not
a behaviour.

This also settles a store question: a rule bound depends on four other knobs,
so it cannot come from a per-knob selector. It is computed once per change in
`params.slice` and published in the per-key index, so each knob still selects
only its own entry.

### 5.5 Draft and commit

`ValueKnob`'s inline entry keeps a **local draft string**; the store is written
on blur, Enter, or a committed drag. An external change (slider, preset, hash,
filmstrip) wins over a draft that is not being typed into. `clampParam` runs on
commit, never per keystroke, so typing `0.` does not collapse to `0`. This is
what today's `document.activeElement` guard (`:797`) was working around.

## 6. The worker boundary

**The protocol does not change.** `WorkerIn`/`WorkerOut` (`types.ts:330-354`)
stay as they are, and PR 1 does not touch them.

The reason the first draft gave for adding a `runId` does not hold: `generate()`
is synchronous, so the worker's event loop is blocked for the whole run and a
second `postMessage` queues behind the first; the only interruption is
`terminate()`, after which the worker is gone and can deliver no stale `done`.
With one worker and replace-by-terminate there is never more than one run in
flight, so a `runId` would distinguish nothing. It earns its place only if runs
are queued or several workers run in parallel — and at Insane each run peaks at
410-490 MB, which makes parallel runs the documented OOM line. Since the
filmstrip keeps metrics rather than boards (§3), neither is needed.

One long-lived worker for generation, reused while idle and terminated to
abort; a throw-away worker per SVG export, as today (`:1086`). Under Vite the
worker comes from its TypeScript source:

```ts
new Worker(new URL('./generate.worker.ts', import.meta.url), { type: 'module' })
```

`useGenerator` is mounted **once, in `App`**, so navigating to `/boards` neither
kills a run in flight nor disposes the GL context (`arrowz-board.ts:328-341`
releases it on unmount, and rebuilding the scene at Insane costs on the order of
hundreds of milliseconds).

## 7. The visual layer

### 7.1 Ported verbatim

The 14 colour tokens and 2 font tokens; the grids (`48px auto 1fr`, `70px 1fr`,
the console's rail plus grid, `auto-fill minmax(190px, 1fr)`); 1-2px gutters
over a `--border` ground; zero radius except the switch track/handle and the
ready dot; control heights (40 / 32 / 30 / 28 / 24 px, switch 44×26, palette
input 44, top bar 48, preset strip 38); all interaction states at
`cubic-bezier(.2, 0, 0, 1)` 120 ms with the progress bar at 80 ms linear; the
2px `--signal` focus ring at offset 2; `--warn` exclusively for a clamped value
or a rule bound; `--signal` exclusively for state and data; text on `--signal`
in `--void`; `tabular-nums` on every number; `max-width: 74ch` on prose; the two
breakpoints (900px collapses the console, 700px height releases the board's
minimum).

The mock defines 18 custom properties. `--ok` and `--signal-soft` are defined
and never used, and are dropped. `--error` (the failed run) and
`--border-strong` (the palette frame) are used but absent from the design
system's own token list — flagged for the design system, not resolved here.

### 7.2 Fixed, because the mock does not have it

| Gap in the mock | Correction |
|---|---|
| The slider is a `div` with `onPointerDown`: no role, no keyboard, not focusable | `role="slider"`, `aria-valuenow/min/max/valuetext`, arrows, Home/End, PageUp/Down |
| Tabs carry `aria-selected` on plain buttons, no `role="tab"`, no arrow keys | the full tablist pattern |
| The palette has `div` rows, no combobox semantics, no focus trap, no focus return | `role="dialog" aria-modal`, combobox + listbox + `aria-activedescendant`, focus returns to ⌘K |
| The run diff appears on `onMouseEnter` only | `onFocus` in parallel |
| Run state has no `aria-live`; the progress bar has no role | both added |
| Saved-board rows are clickable `div`s; the `open` button has no handler | real buttons with keyboard paths |
| Inactive knobs are communicated by `opacity: .4` alone | `aria-disabled` plus the reason via `aria-describedby`, from `INACTIVE_REASONS` |
| Glyph-only buttons (⌘K, +, −, ⤢) have no accessible name | `aria-label` from the dictionary |
| Controls are 24-32px where the design system asks for 44px on touch | sizes kept for pointers, `@media (pointer: coarse)` raises them |

### 7.3 What the mock only pretends to do

`generate()` is a `setInterval` (+7% per 90ms, deterministic failure above 62%
when straightness is below 0.6); `took`, `pieces` and `longest` are random; the
readout's piece id and length are hashes of the cursor position; the saved-board
list, the run history and the group counts are literals; generating never
appends a run; five `copy` buttons, both exports, the saved `open` button and
the zoom triplet have no handlers; `flags` emits five flags while the other
knobs never reach the command string; `file` uses a `boardId` that generating
never updates; applying a preset replaces all values wholesale, wiping unrelated
edits; `resetAll` clears values but keeps `presetId`, so the chip re-lights.

Two mock inconsistencies are corrected rather than reproduced: the command
string is built by `buildCommand` from the engine, and the envelope is honoured
as §5.4 describes rather than displayed and then ignored.

## 8. Testing

- **Unit (Vitest, node):** every store slice; the hash codec, including a
  legacy hash whose numbers are strings, and a hash whose values need clamping
  (which must raise the notice); `clampParam` at bounds and steps; the rule
  bound published per key; the report's delta keyed by metric name across a
  language switch; the command string against `buildCommand` for a table of
  parameter sets; the trigger table of §2.2, trigger by trigger.
- **Browser (Vitest browser mode, Playwright Chromium):** the slider's keyboard
  path; the palette's focus trap and return; tab arrow navigation; a full run
  from Generate to a drawn board with **zero console errors**; a route change
  during a run that neither kills it nor disposes the GL context; the element
  receiving object properties through the `@lit/react` wrapper.
- **Fingerprint parity — the successor to `lab-bundle.test.ts`.** That test
  runs the bundled worker and compares the board's fingerprint against
  in-process `generate()` (`lab-bundle.test.ts:61-88`). Zero console errors does
  not prove that the Vite-bundled engine carves the same board, so `apps/lab`
  gets its own fingerprint test over the Vite-built worker, in place before PR 7
  removes the Deno one.
- **Integration:** the board store client against a live `lab-server.ts` —
  list, save, delete, the view-editing re-POST, and load-into-lab.

## 9. Risks and prerequisites

1. **The Vite proxy must rewrite `Origin`, not merely `changeOrigin`.**
   `changeOrigin` rewrites `Host`; the browser still sends `Origin:
   http://localhost:<vite-port>`, and `lab-server.ts:69` compares it against
   its own origin, so every POST would 403. PR 2 needs a `proxyReq` hook
   rewriting or stripping `Origin`, and the proxy must cover `/boards/` (the
   static board files, `:1303`) as well as `/api`. This is a prerequisite, not a
   verification.
2. **`lab-report.ts` is unreachable until PR 1 adds three things** (§4.3): the
   sixth subpath export, the `tsconfig.build.json` entry and the
   `node-smoke.mjs` line. Without them PR 2 does not build.
3. **PR 1 has no behavioural safety net of its own.** None of the moved
   fragments has a test today, so the PR adds them; `fingerprints.test.ts`
   guards `generate()`, not the report or the readers.
4. **The engine's `dist/` is gitignored**, so a fresh clone builds the engine
   before `vite dev` resolves anything; `serve` carries `dependsOn: ["^build"]`
   for that reason.

## 10. Delivery

| PR | Content |
|---|---|
| 1 | Move ten pure fragments (nine engine, one board element) plus `startChoiceOf` and `short(n, locale)` in their corrected shapes; extract the shared "finite number under a `PARAM_SPEC` key" predicate and leave both reactions alone; add the sixth engine export and its tsconfig and smoke entries; add unit tests for every moved fragment; the old lab switches over |
| 2 | `apps/lab` skeleton: Vite, React, ESLint/Prettier, `project.json`, the proxy **with the `Origin` rewrite**, tokens, shell, `App`-level `useGenerator` and the single `BoardCanvas`, and one end-to-end path — generate, draw, save |
| 3 | The console: group rail with violation counts, knob grid with `ValueKnob`, `ChoiceKnob`, `StartKnob`, the keyboard slider with the rule marker, `ViewPanel`, the lifted run column with `auto`, `help` and abort, live command, presets, the violations panel, the clamp notice, and the hash codec with `hashchange` → run |
| 4 | Simple view, language switch, report with both delta baselines, SVG export, and the `f` hotkey with the solo view — stage chrome rather than a trigger, so §5.1 places them in `BoardFrame.tsx` |
| 5 | The library: list, size chips, refresh, detail, its own view fields, copy, **load into lab**, two-click delete. **Parity with today's lab is reached here, not at PR 4** — units 11 and 12 are what the monorepo spec means by parity |
| 6 | The docs route: the element's API guarded by a test against `mod.ts`, and the CLI help generated from `helpText()` at build time |
| 7 | v2 additions: run filmstrip (parameters, metrics, thumbnail; selection reloads), parameter diff with focus parity, ⌘K palette |
| 8 | Retire the old lab. Prerequisites the first draft omitted: `carve.test.ts:456-480` reads `lab.html` and checks its number fields against `VIEW_RANGE`; `packages/cli/deno.json`'s `bundle` task names `lab-page.ts` and `lab-worker.ts`, and both gates plus CI depend on that target; `lab-server.ts:292-297` serves `/lab.html` as its root and `lab-server.test.ts:214,310` fetch it; `neutral.test.ts:3` and `CLAUDE.md:25` state the "dom lib only in `lab-page.ts`" rule; `CLAUDE.md:11,36`, `README.md:819,930,968` and `README.pl.md:820,938,976` name the files. `lab-worker.ts` goes with them; the fingerprint test of §8 must already exist |

Nothing in today's lab is dropped. The features the first draft lost and this
one restores: `auto`, `help`, the clamp notice, `libLoad` ("load into lab"),
`libRefresh`, `libCopy`, the library's size chips, the `f` hotkey for full
screen, the `generatingBig` warning, the store-save outcome in the status line,
and the report's `keepPrev` delta baseline.

## 11. What changed in revision 2

Two adversarial reviews found defects worth recording, because three of them
were decisions dressed as details:

1. **"The server's validation duplicates the page's" was wrong** and would have
   been a security regression: a fractional seed reaching a file name, an
   out-of-envelope board in the store, `lab-server.test.ts` red. §4.2 now states
   the asymmetry and PR 1 extracts only the predicate.
2. **The component tree was drawn from the mock, not from `PARAM_SPEC`.** There
   is no boolean knob, so `SwitchKnob` had nothing to bind; two knobs are
   choices and two share the composite start control, and none of the three had
   a component.
3. **"Envelope ceiling" conflated a range with a rule.** Clamping to a rule
   would have reintroduced the silent moves PR #61 removed. §5.4 separates them.
4. **`runId` was a protocol change for an undecided mechanism.** With one
   synchronous worker and replace-by-terminate it distinguishes nothing; §6
   leaves the protocol alone.
5. **The filmstrip had no memory model.** §3 now keeps metrics rather than
   decoded boards, which is also why no measurement session gates it.
6. **`useGenerator` and the board element had no home above the routes**, so a
   route change would have killed a run and disposed the GL context.
7. **Parity was claimed one PR too early**, and `auto`, `help`, `libLoad`,
   `libRefresh`, `libCopy`, the clamp notice, the `f` hotkey and the
   `generatingBig` warning had silently vanished.
8. **The docs route was in no PR**, though the road map makes it part of step 3.
9. **`lab-bundle.test.ts`'s fingerprint gate had no successor.**
10. **PR 7 (now 8) listed none of the five things that reference the files it
    deletes.**
11. **Counts were wrong**: 28 knobs not 40, 101 UI keys not 85, 23 report rows
    and 4 separators not ~27, 14 colour tokens after two drops not 16.

## 12. Deferred, with their own brainstorming when their turn comes

- **A hover hit test in `<arrowz-board>`**, and the board readout the mock shows
  on top of it. The element emits no hover event; adding one needs browser
  tests and a cost measurement at Insane, where a hit test per mouse move is a
  real frame-rate risk.
- **A configurable control bar in `<arrowz-board>`.** The element's own zoom,
  fit, colour and gesture controls cannot be hidden, which is why the mock's
  zoom triplet is dropped here. The bar has to become configurable eventually —
  the Angular game will want its own chrome too — and that change belongs with
  the hover work, in one board-element PR.
