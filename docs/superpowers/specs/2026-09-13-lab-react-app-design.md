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

*Amended in PR 4b.* The anchors in §2 and in the first draft's sections are to
`lab-page.ts` as it was before PR 1 (1668 lines) and are left as written; every
amendment from PR 4b cites the file at `1ffb0d6`, where solo is `:938-949` and
the SVG download `:959-989`.

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
| Page load | immediate | `applySimple()` first in the simple view, unless the page opened on a link (the hash decoded) | `:1660-1668` |

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

*Amended in PR 4b.* The first row promised the delta signs and formatting as
well, and they did not move: PR 1 took the rows, and the delta stayed inline in
the page's `report()` (`lab-page.ts:1439-1449` at `1ffb0d6`). PR 4b moves it as
`reportDelta(num, prev, better)` beside `reportRows` — the text with its sign
and precision, and whether the change is better, worse or neutral, or `null`
when either number is missing or they differ by no more than 1e-9, where the
old lab printed an empty cell (`lab-page.ts:1441`, `:1451` at `1ffb0d6`) — adds its unit tests, and
switches the old lab over.

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
  App.tsx                     routes, shell, global hotkeys (the solo `f`
                              listener), and the two things that must outlive a
                              route change: useGenerator, and the workspace
                              mounted on every route and hidden off it, which
                              holds the single <arrowz-board> (from PR 5a hidden
                              under /docs alone: the library shows it too)
  shell/
    TopBar.tsx                mark, preset name, dims, ⌘K, language, simple/advanced
    TabRow.tsx                role="tablist", arrow keys, aria-controls
    Segmented.tsx             one of a few as a radio group: view, language, skeleton
    useDocumentLang.ts        <html lang> follows the store
  routes/
    Workspace.tsx             / and /boards   the one stage, and the console
                              whose third face is the library (PR 5a; the file
                              is LabRoute.tsx until then)
    DocsRoute.tsx             /docs/:what  element | cli
  stage/
    Stage.tsx                 70px + 1fr + the report column
    BoardCanvas.tsx           createComponent(<arrowz-board>) — the only @lit/react site
    BoardFrame.tsx            paper frame, annotation of the board on screen, solo
                              toggle button (the `f` listener is App's)
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
    DraftNumber.tsx           the §5.5 draft entry, shared by ValueKnob and the simple view
    KnobSlider.tsx            role="slider", keyboard, rule marker (not a clamp)
    ChoiceKnob.tsx            trapBias, giantSpacing — a labelled select
    StartKnob.tsx             the composite --start control; shows mix only when mixing
    ViewPanel.tsx             the nine preview/export fields
  simple/
    SimplePanel.tsx           sizes, sliders, skeleton, seed, randomise, the
                              preview subset — tracks 1–2 of the one Console
    PositionSlider.tsx        a 0–100 recipe slider with its two end words
    applyRecipe.ts            the recipe into the knobs; the simple halves of
                              Generate, New seed and Defaults
  run/
    RunColumn.tsx             command, Generate, New seed, Defaults, auto, help,
                              abort, exports — built by the route and handed to
                              Console as its third child, which keeps one
                              instance in both views
    LiveCommand.tsx           the CLI line for the knobs on screen, and its copy
    PresetStrip.tsx           seven levels, twenty-six chips; a chip clamps and runs
    ClampNotice.tsx           role="status"; dismiss hands focus back to the column
    OptionSwitch.tsx          the switch `auto` and `help` share with ViewPanel's four
    useRun.ts                 the one funnel every trigger of §2.2 starts through
    useAutoRun.ts             the one debounce: a typed knob behind auto, a
                              recipe edit without it — mounted once, in App
    ExportButtons.tsx         SVG and board-file downloads of the board on screen
    download.ts               a Blob to a named file, shared by both exports
  report/
    ReportPanel.tsx           the stage's third column: both tables of the result on screen
    StatsTable.tsx            23 rows in five groups, delta against the baseline by row index
    LongestTable.tsx          longest pieces, memoised on (board, top); gone when the
                              highlight is off
  library/
    SizeChips.tsx             the console's rail in the library: a chip per size
    BoardList.tsx             the console's panel in the library: rows, refresh
    BoardDetail.tsx           command, view fields, load into lab, two-click delete
    useLibraryList.ts         the store's listing, fetched on entry and on Refresh
    useOpenBoard.ts           which board the address names
    useInLibrary.ts           which of the two tabs is on screen
    useStoredBoard.ts         the board an address names: fetch, decode, show
  palette/
    CommandPalette.tsx        role="dialog" + combobox, focus trap
  state/
    store.ts                  one store, the slices below, and `completeRun`, the one
                              action spanning two slices
    params.slice.ts           28 knobs, clamping, per-key violation and inactive indexes
    view.slice.ts             the nine preview fields as typed values
    run.slice.ts              the process: phase, the parameters in flight, progress, history
    result.slice.ts           the product: the run's board, its file, report and
                              parameters, the store's answer, the delta baseline —
                              and beside it the stored board a preview shows (§5.3)
    library.slice.ts          sizes and the list cache; the selection is the address
    ui.slice.ts               tab, selected group, palette, mode, solo, help, clamp notice
    lang.slice.ts             PL/EN, localStorage `labLang`
    recipe.slice.ts           the simple view's recipe, localStorage `labSimple`
    storage.ts                localStorage that never throws
    url.ts                    hash codec and tolerant reader — a pure module
    useUrlHash.ts             read once, debounced write, hashchange → store → run
  worker/
    generate.worker.ts        imports @arrowz/engine
    useGenerator.ts           start, progress, abort, done — mounted once, in App
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
`RunColumn` is built by the route and passed to `Console` as a child; `Console`
is the mock's three-track grid and the column is its third track.

*Amended after PR 3.* The first draft lifted the column out of the console and
placed it as the console's sibling. What it was protecting is the single
instance — a run in flight must survive the simple/advanced swap — and a child
the caller constructs is the same instance whichever console places it, so the
guarantee is unchanged. Placing it inside buys back the mock's own grid
directly: the column is a grid item of `.fw-console`, which is what lets the
≤900px query turn it into a full-width row under the other two tracks
(`console.css:398-406` at `1ffb0d6`). A lifted column is not in that grid at all, so the
same rule needs the grid re-parented around both boxes, through a
`display: contents` wrapper that the query then has no box to address. The
tree that shipped is
`LabRoute` → `Console` → `RunColumn`, with the route owning the two refs the
clamp notice hands focus back to — Generate, and Abort for the state in which
Generate is refused.

*Amended in PR 4a.* The paragraph above holds only while one component places
the column. React keeps a node by its type and its position among its siblings,
not by the identity of the element object: handing the same `<RunColumn>` to a
second console component is a new parent, and the column remounts — losing a
focus a keyboard user left on Generate and the column's own transition ref. The
simple view is therefore not a second console. `Console` swaps its first two
tracks — the rail becomes nothing and the panel becomes `SimplePanel` — and
keeps `children` in the third position in both views, which
`LabRoute.browser.test.tsx` checks by node identity.

*Amended in PR 4b.* The stage gains a third column, `ReportPanel`, and
`BoardFrame` comes out of `Stage` carrying the element, the annotation and the
solo toggle. Solo hides by a class on `.fw-lab` — presets, run rail, report
column, console, violations and clamp notice — and redefines both grids, because
a track keeps its size when its only item is `display: none`: `.fw-lab`'s rows
become the one stage track (`minmax(0, 1fr)`), in both `.fw-lab` and `.fw-lab.simple` (the rule
follows the simple variant, which has the same specificity), and `.fw-stage`'s
columns — and its ≤900px rows — become the one board track, as the old lab's
`body.solo .cols` does (`lab.html:140`). The annotation and the toggle are absolutely positioned inside `.fw-board`,
which is already `position: relative` (`shell.css:171`), so they take no height
from the element, and they come after the element in DOM order: the element's
host is itself `position: relative` with an opaque background and
`z-index: auto` (`arrowz-board.ts:129-135`), so tree order decides what paints
on top, and a colour test would pass on an annotation hidden under the paper.
The toggle takes the top-right corner and the annotation the top-left; the
bottom edge belongs to the element's own bar (`arrowz-board.ts:178-185`). The
old lab's `#solo` is fixed to the viewport (`lab.html:141`) and is not the
model. The browser test sets its viewport — no
test does today, so Vitest's default would apply — and asserts, at 1400px and
860px wide and in both views, that `.fw-boardwrap`'s box equals `.fw-lab`'s and
that `<arrowz-board>`'s box is 34px narrower and 34px shorter (16px padding and
1px border on each side), not merely that nodes are hidden; the 34px hold
whenever `.fw-lab` is at least 292px tall (the board's 260px minimum, its
border included under `border-box`, plus the wrap's 32px padding) and at any
height below 700px, where `shell.css:234-238` releases the minimum. It unmounts nothing, for the
reason every earlier swap in this tree keeps a node: the GL context, the run
column's focus and a draft being typed all live in nodes a remount would
replace. The top bar, tabs and run status stay, so a carve in flight is still
reported. The `f` key is the application's first global hotkey: `f` and `F`
alike, as the old lab reads both (`lab-page.ts:944`) — Shift is not a modifier
here — and it ignores Ctrl, ⌘ and Alt (the old lab toggled on ⌘F and opened the browser's find as
well), key repeat, `input`, `textarea`, `select` and `contenteditable`, and any
route but the lab; a focus inside what solo hides moves to the toggle. Escape
does not leave solo — the old lab has no such key, and the palette of PR 7
owns Escape. The element needs no change for any of this: `resize()` refits a
fitted view and keeps a zoomed one (`viewport.ts`).

*Amended in PR 5a.* The library is not a second stage. `LabRoute` becomes
`Workspace`: one panel, mounted under `/` and `/boards` alike and hidden only
under `/docs`, whose `.fw-lab` rows stay what they are — the preset strip (the
lab's, `null` in the library), the one `Stage`, and `Console`. `Console` gains a
third face — `SizeChips` in the rail and `BoardList` in the panel, which in PR
5a is all the panel holds — the way PR 4a gave it a second and for the same
reason: the stage above it must keep its node, and with it the `<arrowz-board>`
a remount would dispose. The library takes two of the console's three tracks
(`.fw-console`, `console.css`): the size chips the rail, the list the panel. The
third is not reused — handing that position a different child replaces
`RunColumn`, and a remount there is what PR 4a's Ruling 7 forbids: the column
holds a keyboard focus on Generate and its own transition ref, and a carve
started in the lab can still be running when the library is opened. The column
therefore stays mounted and is hidden by class, as the old lab hides its
lab-only controls (`lab.html`: `body.tab-library .labonly`), and
`.fw-console.library` drops to two tracks, a hidden grid item taking none. PR
5b's detail goes under the list, in the panel (plan
`2026-09-16-lab-board-library.md`, Ruling 1).

*Amended in PR 5b.* The panel's track becomes a `LibraryPanel` of two grid
rows — `minmax(0, 1fr)` for the list, `auto` for `BoardDetail` — and the
scrolling moves off `.fw-lib-list` onto the list row, so the detail stays on
screen while the rows scroll under it. This is a deliberate departure from the
old lab, which scatters the detail across three places: the command box and the
view fields sit in the aside (`lab.html`'s `libCommandBox` and `libView`, both
`libonly`) while Load and Delete sit beside the list (`libDetail`). One block
under the list is what Ruling 1 left room for, and a detail that scrolled away
below twenty rows would be worse than either. `LibraryPanel` is a container, not
a fourth face: the rail is still `SizeChips` and the list is still `BoardList`.
It is also where `useLibraryList` is called — once, with `refresh` handed down
to both children. The hook's guard only stops a second fetch *after* an answer
has arrived, so two components calling it against an empty cache would both
fetch. `AppRoutes` therefore renders
`null` for `/boards` as it does for `/`, and `SavedBoardsRoute` is gone. One
`<section role="tabpanel">` serves both tabs and renames itself with the
route — `lab-panel` under `/`, `boards-panel` under `/boards` — because
`TabRow` resolves `aria-controls` to that id; two parallel sections could not
both hold the one stage. Solo follows the panel rather than the lab, because
the old lab's full view works on both tabs (`lab-page.ts:1027-1029`): `f` and
the toggle are live wherever the stage is, and the class still lands on
`.fw-lab`. The console's view fields and the detail's are never mounted at
once, so the duplicate `view-*` ids PR 4a's follow-ups predicted do not arise;
a browser test asserting a single `#view-stroke` in the document holds that
line, rather than an id prefix added against a collision that the swap makes
impossible.

### 5.2 Reconciling the mock with the lab

- The mock's rail has two sections, *generator* and *element*. The element
  section is the nine preview/export fields (unit 5) — `ViewPanel`, not a new
  concept.
- The mock shows one group at a time; today all six are `<details>` with
  `board` and `skeleton` open (`:208`). The mock's model is kept, and the group
  rail shows a per-group violation count so nothing hides behind a closed
  group. This is a deliberate UX change, recorded as one.
- The mock has no simple view. `Console` swaps its rail and panel for
  `SimplePanel`; the stage, filmstrip, status bar and the run column the route
  hands in are untouched. In simple mode `cell`, `voids`, `top`, `auto` and
  `help` are hidden, as `.advonly` does today (`lab.html:52`).
- The mock's `element` tab becomes `docs` with two sections: the element's API,
  and the CLI's help, called from `helpText()` (`command.ts:424`) at render
  rather than generated: the lab already imports `@arrowz/engine/command` at
  runtime (`App.tsx:2`), so a prebuild would add a generated source file that
  four of `apps/lab`'s six targets would fail without — and that `lint` and
  `fmt` would inspect, though only in some of its shapes: measured, a generated
  `.ts` is caught by both, a `.json` by Prettier alone, and a `.txt` by neither.
  Amended in PR 6. A test parses `board-element/src/mod.ts` for the event map the
  way `readme.test.ts` guards the README tables — the mock's own tables carry
  two incompatible event vocabularies, and the real names are
  `piece-click`, `piece-removed`, `life-lost`, `finished`, `viewport-change`
  (`mod.ts:45-51`).
- The mock has no report. *Amended in PR 4b:* the first draft placed the
  tables below the console in the mock's `.fw-tbl` treatment, but `.fw-tbl` is
  the element documentation's span grid, not a table, and nothing in the mock
  sits below the console — the shell has a fixed height and does not scroll.
  The report is the stage's third column instead, beside the board, as the old
  lab's `#side` column is (`lab.html:280-282`): real `<table>`s, the four
  separators as the boundaries of five `<tbody>` groups, visible in both views.
  The column is 22rem wide on `--graphite`, never on `--paper`, and scrolls
  inside itself (`overflow-y: auto`, as `.fw-runs` and `.fw-run-col` do) in
  both layouts: at ≤900px it moves under the board as a row spanning the rail as
  well (`grid-column: 1 / -1`) in a row sized by the stage itself —
  `minmax(0, 1fr)` under the board's `minmax(min(292px, 100%), 2fr)`, chosen by
  measuring at 860 wide from 650 to 1100 high (plan
  `2026-09-15-lab-report-export.md`, Ruling 2), where a fixed `max-height`
  clipped the board at every height below 900 and a bare 292px minimum pushed
  the board over the console — and the board keeps its own minimum except below
  700px of height, where `shell.css:234-238` releases it and the row's 292px
  with it. The layout is kept by a browser test asserting that at least one row
  of knobs stays visible below the stage and that `.fw-board`'s box is at least
  260px tall and lies inside `.fw-boardwrap`'s content box — its rect less 16px
  on each side, which the rect gives directly because the wrap has no border
  (`shell.css:163-169`); the wrap clips (`shell.css:167`), so the board's rect
  alone proves nothing, and a `minmax(0, …)` board row does not guarantee it.
- The mock's run column ends in two ghost buttons without handlers, *Export
  SVG* and *Download board file* (`.fw-ghost`). In the application
  `.fw-ghost` already holds the `auto` and `help` switches and is absent in the
  simple view (`RunColumn.tsx:173-177`), so the exports are a second
  `.fw-ghost` group after it, rendered in both views. The board file goes
  beyond parity — the old lab only downloads the SVG — and is kept because it
  costs no worker: it is the same `JSON.stringify` of the file under the same
  `<boardId>.board.json` name that the store server writes
  (`packages/cli/store.ts:94,118`), after its own round trip through the
  request. The SVG is drawn in a throw-away worker, as today; an export error
  is shown beside the buttons, not in the run status (§5.3). Every new string —
  the board-file button, the export error, the hidden *better* and *worse*, the
  annotation — goes into `lab-i18n.ts` in both languages.
- The mock's ⤢ is the third button of its zoom triplet — *fit*, which the
  element's own bar already has — and the mock has no solo. The solo toggle is a
  separate glyph, `⛶`, in the frame's top-right corner, named by `fullView`. The
  frame's annotation carries the size and seed of the board on screen, which
  during a run is the previous one.

### 5.3 State slices

| Slice | Holds | Persisted |
|---|---|---|
| `params` | 28 knobs, per-key violation and inactive indexes | URL hash |
| `view` | the nine preview fields as typed values | URL hash |
| `run` | `idle \| running \| done \| error`, the parameters in flight, progress, history entries (params, seed, metrics, thumbnail) | no |
| `result` | the board on screen, its file, report and the parameters it was made from; the store's answer for that file; the delta baseline | no |
| `library` | sizes, the list cache, the two failure kinds, and (*PR 5b*) the notice a library action leaves in the status line (*amended in PR 5a*: the selection is the address, §5.6, and a stored board's view fields are its meta's, not a field here) | no |
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
  after a 350 ms debounce (`saveLibView` in `lab-page.ts`). *Settled in PR 5b:*
  they are not a slice of their own. `BoardFrame` already draws a stored board
  from `preview.meta.view`, so that meta is what an edit has to move, and
  `result` grows one action — `previewView(view)` — which replaces the view
  inside `preview.meta` and leaves the board and its file alone. A second slice
  would be a second truth beside the one the stage already reads. The lab's own
  `view` slice is untouched, which is why returning to the lab needs no
  restoring.
- **`lang` and `tab` precedence:** the hash wins on load, then `lang` is
  persisted; a hash carrying `tab: 'library'` redirects to `/boards`.
- **Three parameter sets exist for a reason** (`:950-953`): the knobs on screen,
  the parameters the current board was made from, and the parameters the export
  names. On the lab route the board on screen belongs to `result.shown`; the
  filmstrip selects into it.
- **A run in flight does not clear the result** (*amended in PR 4b*). The old
  lab replaces its board and report only when a run is done
  (`lab-page.ts:811-816` at `1ffb0d6`) and keeps the parameters of the board on
  screen apart from the run's (`:828-830`); the skeleton's `run.started()`
  cleared the board, which left the stage empty for a whole carve. The product
  therefore has its own slice, and `run` holds only the process: the phase, the
  parameters in flight, progress, the last message and whether the idle phase
  follows an abort (`RunState`, `run.slice.ts:12-30`). `result.shown` is one
  field holding the board, its file, report and parameters (`ShownResult`,
  `result.slice.ts:10-16`); beside it the slice holds the delta baseline, the
  store's answer for that file and why that file's last SVG export failed
  (`exportError`), and a `reset()`, as the run slice has, for
  the tests' resets, which call both. `started`, `aborted` and `failed` never
  touch the result slice, and the report, both exports, the annotation, the run
  status and the store save read it. A finished run is committed by one
  store-level action, `completeRun(done)` (`store.ts:48-55`), the only writer
  that sees both slices, which the worker's `done` handler calls with the
  decoded board, its file and the report (`useGenerator.ts:72`). It applies the
  run slice's done transition (`runDone`) and the result slice's show
  transition (`showResult`), each exported as a pure function of its own slice
  state, in one `set`: the slices keep their narrowed `SetStore`, and no render
  sees `phase: 'done'` beside the previous board. The board is shown under the
  run's own parameters, `run.params`; a `done` for a run that was never started
  has none, and `completeRun` throws rather than invent them (plan
  `2026-09-15-lab-report-export.md`, Ruling 6). `showResult` sets the store's
  answer and the export error back to null — without that the next board would
  read "closed — saved" until its own POST answered, and an export error would
  describe a board no longer on screen — and `result.stored(file, outcome)` and
  `result.exported(file, error)` are dropped unless `file` is still
  `shown.file`, an identity guard inside the slice (`stored` and `exported` in
  `createResultSlice`). `useStoreSave` (`App.tsx:33-61`) therefore
  subscribes to `result.shown` and compares nothing when the answer arrives;
  its posted-once ref, which StrictMode's double-invoked mount effect needs,
  keys on the file object. `result.show()` is `showResult` as a single-slice
  action, kept for a writer that is not a run; in 4b nothing calls it, and a
  finished run is the only way a board reaches the screen. PR 5's *load into
  lab* is not such a writer: it sets the knobs and the view without generating
  (`lab-page.ts:1191-1215`: "Loading sets the knobs and the view but does NOT
  generate"), leaving the shown result where it was, but *load into lab* is not
  the only library path to the board: the library's detail draws a stored board
  into the one shared element (`openBoard`, `lab-page.ts:1144-1186`, through
  `showLibBoard` at `:1237-1238`) and the old lab restores the lab's board on
  return (`:1053-1054`). Whether PR 5's preview passes through `result.shown`
  with a `library` source beside a kept lab result, or the `/boards` route
  holds its own, is PR 5's plan to decide — against this tree, not the old
  lab's: here the element lives inside `LabRoute`'s hidden `<main>`
  (`LabRoute.tsx:29-36`, and within it `BoardFrame.tsx:49-51`), so the first
  option lifts it out of the lab route and the second is a second
  `<arrowz-board>` and GL context beside PR 2's single `BoardCanvas`. Whichever
  non-run writer comes first — PR 5's preview or PR 7's reload from the store —
  passes `show()` a source which the run status and the store save read, or the
  status would call a stored board "closed — saved" and the save would re-POST
  it (the structured-status note below). Keeping the parameters beside the
  board also retires an old-lab defect: a language switch during a run
  re-rendered the report with the new run's parameters beside the old board's
  metrics.
- **The preview is a second field, not a second source** (*decided in PR 5a*).
  The question the paragraph above leaves open is answered against the types.
  `ShownResult.report` is a `ReportInput`, and a stored board has neither
  `stats: CarverStats` nor the run's counters (`lab-report.ts`, the interface):
  its meta carries `pieces`, `maxLen`, `genMs`, `ok`, `restarts` and
  `backtracks`, and nothing else. Passing a stored board through `shown` would
  mean inventing the rest, or loosening a type PR 4b tightened. The slice grows
  `preview: StoredBoard | null` instead — `board`, `file` and `meta` — written
  by the library and read by the stage, while `shown` stays the run's product
  and its readers (`ReportPanel`, `ExportButtons`, `useStoreSave`, the baseline)
  are untouched. Three consequences are the point of the split: leaving the
  library restores the lab's board because nothing overwrote it, where the old
  lab has to redraw it (`:1053-1054`); `useStoreSave`, which posts every new
  `shown.file`, cannot post a board it has just read out of the store, because
  it never sees one; and a board without metrics cannot pretend to a report.
  `show()` therefore gains no `source` argument, against what the paragraph
  above expected of it: the run status and the store save go on reading `shown`
  alone, and the library writes `preview`.
  `BoardFrame` shows `preview` while the route is the library and `shown`
  otherwise, and its annotation reads the meta's `W`, `H` and `seed`. A stored
  board's status line is the old lab's `showBoardStatus` — the `savedBoard`
  words — and the store's answer (`saved`) is a fact about `shown`, so it never
  joins that line. The report column is empty in the library, as `lab.html`'s
  `body.tab-library #stats, body.tab-library #topTable` leaves it:
  `longestSummary` sorts every piece, about 90 000 at Insane, and parity does
  not ask for the table.
- **One metric baseline, and a parameter diff** (*amended in PR 4b*). The report
  compares against the previous shown result that had metrics (`prevStats`,
  `lab-page.ts:833`), kept as its `ReportInput` and parameters. The type has no
  board file, but the worker's `done` message satisfies it structurally while
  carrying one, so `show()` copies the `ReportInput` fields rather than keeping
  the message — otherwise the baseline would hold a second multi-megabyte string
  — and a unit test asserts the baseline has no `board`. Both reports' rows are
  built at render in the current language and compared by row index, which a
  language switch does not move; the old lab's `keepPrev` flag has nothing left
  to guard, because rendering no longer moves the baseline — only `show()` does.
  A result without metrics shows no statistics table, keeps the longest-pieces
  table (the old lab's `showLabBoard()` redraws it after `report()` clears both,
  `lab-page.ts:814-816`), and leaves the baseline where it was, as the old lab
  returns before its swap (`:1425-1429`). The diff strip of PR 7 compares
  *parameters* against the peeked run; it is not a second metric baseline, as
  the first draft had it.
- **Status is structured data** carrying a source (`run` / `store` / `library`),
  so a library message cannot silently overwrite a run's outcome. *Amended in
  PR 5a:* the field is not needed for the library. `RunStatusBar` reads
  `preview` first and the run's own state otherwise, so which of the two the
  line is speaking for is a question about the route and the slice, not a tag
  a writer could set wrongly; the store's answer stays welded to `shown`.
  *Amended in PR 5b:* a source tag is still not needed, but a **notice** is.
  `savedBoard` describes a state — the board the address names — while
  `loadingBoard`, `viewSaved`, `deletedBoard` and `deleteFailed` report
  *events*, and a line computed from state alone has nowhere to put an event.
  The old lab needed no such distinction because `setStatus` overwrites. So
  `library` grows `notice`, read by `RunStatusBar` ahead of the `preview`
  branch. Three of the five fade after about 1.2 s, because what they report is
  over: `viewSaved`, `deletedBoard` and `deleteFailed`. The timer lives beside
  the raiser but writes only the store, and it takes back only the notice it
  put up — it must not be cancelled when its raiser unmounts, since the raiser
  of `deletedBoard` is the detail, which the navigation it performs unmounts.
  The other two describe a **state** and are cleared by their outcome instead:
  `loadingBoard` while a board file is in flight, which fills the silence PR 5a
  left deliberately, and the failed save, which says the picture on the stage
  is not what the store holds — true until a save lands or another board is
  opened, and a sentence that faded would leave the stage and the command box
  disagreeing with nothing to explain them.

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

### 5.6 The store's own path, and a board's own address

*Added in PR 5a.* The server serves stored files under `/boards/`
(`lab-server.ts`, the static areas) and the application's library route is
`/boards`. The prefixes collide: Vite matches proxy keys by prefix, which is why
`vite.proxy.ts` has to spell its key with the trailing slash today, and an
address of the form `/boards/<size>/<id>` would leave the application for the
store. PR 5a moves the HTTP path to `/store/` — the server's area and the
comment at the head of the file, the proxy key, the old lab's fetch of a stored
board file (`lab-page.ts:1168`), and the escape test that proves a normalised
path stays inside its base (`lab-server.test.ts:224`). `STORE_CSP` follows the
path unchanged. **The directory on disk keeps its name**: `packages/cli/boards/`,
`ARROWZ_BOARDS_DIR` and both READMEs describe a folder, not a URL, and none of
them moves. `/api/boards` does not move either — it is the list, the save and
the delete, and serves no file.

The freed address is the library's: `/boards` lists, and `/boards/:size/:id`
opens one layout. `selectedIndex` already reads the whole prefix as the library
tab (`TabRow.tsx`), so the strip needs nothing. The chosen board is the route
and not a second copy of the selection — the rule `TabRow` set for the tabs
themselves. An id no longer on disk leaves the stage empty and says so in the
status line, in the words the old lab uses for a file it cannot read
(`boardFileError`) — the status line is the one live region on the page, and a
message about the board on the stage belongs beside the stage, while the detail
is PR 5b's and did not exist when PR 5a shipped (plan
`2026-09-16-lab-board-library.md`, Ruling 8). The list beside it still loads.
The row shows the whole 71-character id, clipped by `text-overflow` as the old
lab clips it (`lab.html`, `.boardrow .id`), so the hash can still be selected
and copied; a hash shortened in code could not.

*Added in PR 5b.* Two consequences of "the address is the selection" that PR 5a
left open are settled here. **A size the store does not list**
(`/boards/10x10/<id>` against a store holding only `8x8`) must not be read one
way by the chips and another by the list: they answer through one function, so
either both fall back to the first size or neither does, rather than the list
falling back while no chip is pressed. And **a deleted board leaves the address
by replacing it** — `navigate('/boards', { replace: true })` — because the row
it named is gone from disk: keeping it in history would make Back a trap that
answers "not in the store". This is the one place the address is written rather
than followed, and it is written because the thing it addressed no longer
exists.

Older design documents describe the path as it was before this move —
`2026-09-07-lab-board-store-design.md`, `2026-09-11-board-data-model-design.md`
and `2026-09-11-security-hardening-design.md` all say `/boards/`, the last of
them about the sandbox CSP. They are records of what was decided when, and are
left as written; `/store/` is the path from PR 5a on.

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

*Amended in PR 4b.* The report's delta is coloured `--ink` when better,
`--error` when worse and `--ash` when neutral, and always prints its sign, so
colour is never the only carrier; a screen reader hears a visually hidden
*better* or *worse*. `--signal` was the obvious colour for *better* and is not
used: `--void` on `--signal` measured 4.08:1 in PR 4a, under AA for 12px text,
and the pair is this section's open token question rather than something a
report should settle. For the same reason the frame's annotation inverts the
mock's `--void` on `--signal` to `--ink` on `--void`. Each of these pairs, and
the export buttons' `--ash` on `--graphite`, is asserted by a browser test that
reads the computed colours, not by arithmetic in a comment.

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
| Three regions of the library answer to one name, "Saved boards": the size chips, the list, and the tab (PR 5a used `tabLibrary` for all three) | each is named for what it is, from three new dictionary entries — the size group, the rows, and the open board's detail; PR 5b adds them, being the PR that already writes to both `ui` tables |

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

- **Unit (Vitest, node):** every store slice; the hash codec, including a legacy
  hash whose numbers are strings, and a hash whose values need clamping (which
  must raise the notice); `clampParam` at bounds and steps; the rule bound
  published per key; the report's delta compared by row index — `reportDelta` in
  the engine, and the row alignment unmoved by a language switch in
  `ReportPanel.browser.test.tsx`, where the dictionary switch is real;
  `reportDelta` in the engine's own tests, its `null` cases included; the result
  slice — a baseline without `board`, moved only by a result with metrics, the
  store's answer cleared by `show()` and dropped for a file no longer shown,
  `completeRun` writing both slices in one update; the run slice's case that a
  new run clears the board (`run.slice.test.ts:72-82` at `1ffb0d6`) replaced by a store-level
  case — `completeRun`, then `run.started()`, leaves `result.shown` — and
  `result.reset()` beside `run.reset()` wherever a test resets; the command
  string against `buildCommand` for a table of parameter sets; the trigger table
  of §2.2, trigger by trigger.
- **Browser (Vitest browser mode, Playwright Chromium):** the slider's keyboard
  path; the palette's focus trap and return; tab arrow navigation; a full run
  from Generate to a drawn board with **zero console errors**; a route change
  during a run that neither kills it nor disposes the GL context; the element
  receiving object properties through the `@lit/react` wrapper; *from PR 4b:*
  the board, report and exports of the last result kept through a run in flight;
  the SVG download's name and type and the board file's text; solo's board box
  filling the lab in both views and at both widths, with the GL canvas and the
  run column kept by node identity; `f` ignored with a modifier, in a field and
  off the lab route; the computed colours of the delta, the annotation and the
  export buttons; the command box at 860×900 in both views and at 1400×900 in
  the advanced view, measured before and after its fix; a focus inside what solo
  hides moved to the toggle, key repeat ignored, Escape not leaving solo; at
  860×900 a knob row visible under the report row and the board unclipped at no
  less than its minimum (§5.2).
- **Fingerprint parity — the successor to `lab-bundle.test.ts`.** That test
  runs the bundled worker and compares the board's fingerprint against
  in-process `generate()` (`lab-bundle.test.ts:61-88`). Zero console errors does
  not prove that the Vite-bundled engine carves the same board, so `apps/lab`
  gets its own fingerprint test over the Vite-built worker, in place before PR 8
  removes the Deno one.

  *Settled in PR 8, by measurement.* Two tests are needed, not one, and only
  the second is new. `parity.browser.test.ts` already asks the worker for both
  messages and compares the answers with the engine in the same process — but
  it does so over the engine **as Vitest transforms it**, which is not the
  artefact anyone runs. That artefact is a chunk of its own: `vite build` emits
  `dist/assets/generate.worker-<hash>.js`, 43 kB, and measuring it on
  2026-09-17 settled how to reach it. The chunk touches no DOM and no network —
  three references to `self.` and one to `performance.now()`, nothing else — so
  it loads in plain Node once `globalThis.self` is `globalThis` and
  `globalThis.postMessage` collects the answers; after the import
  `globalThis.onmessage` is a function, and both messages answer as the engine
  does: the board's fingerprint, the fingerprint carried inside the board file,
  the piece count, and the SVG byte for byte. The successor is therefore a Node
  script under `apps/lab/scripts/`, shaped like
  `packages/engine/scripts/node-smoke.mjs` and run by a `smoke` target — not a
  browser test over `vite preview`, which is what this section implied before
  anyone tried. Two consequences for whoever writes it. The chunk's name
  carries a content hash, so it is found by its `generate.worker` prefix and
  the script must assert that **exactly one** file matches: a second worker and
  a silent pick would leave the test passing over the wrong artefact. And
  `apps/lab/eslint.config.js` forbids `node:*` imports outside
  `**/*.node.test.ts`, so the script needs an exemption of its own or `lint`
  refuses it before it ever runs.
- **Integration:** the board store client against a live `lab-server.ts` —
  list, save, delete, the view-editing re-POST, and load-into-lab.

## 9. Risks and prerequisites

1. **The Vite proxy must rewrite `Origin`, not merely `changeOrigin`.**
   `changeOrigin` rewrites `Host`; the browser still sends `Origin:
   http://localhost:<vite-port>`, and `lab-server.ts:69` compares it against
   its own origin, so every POST would 403. **Both halves of this were wrong,
   and both were corrected by measurement.** PR 2 measured that `changeOrigin`
   is the cause of the 403 and not the cure — forwarding the browser's own
   `Host` keeps `Host` and `Origin` consistent by construction, so the proxy is
   a target and nothing else, and no `proxyReq` hook is needed
   (`vite.proxy.ts`, and `boards.node.test.ts` holds the line). PR 5a moved the
   static board files to `/store/` (§5.6), so that is the second key the proxy
   carries; `/boards` is the application's own route and no proxy key may begin
   with it.
2. **`lab-report.ts` is unreachable until PR 1 adds three things** (§4.3): the
   sixth subpath export, the `tsconfig.build.json` entry and the
   `node-smoke.mjs` line. Without them PR 2 does not build.
3. **PR 1 has no behavioural safety net of its own.** None of the moved
   fragments has a test today, so the PR adds them; `fingerprints.test.ts`
   guards `generate()`, not the report or the readers.
4. **The engine's `dist/` is gitignored**, so a fresh clone builds the engine
   before `vite dev` resolves anything; `serve` carries `dependsOn: ["^build"]`
   for that reason.
5. **Retiring the old lab has exactly one prerequisite, and §8 now measures
   it**: the build-output smoke. The rest of what the first draft feared is
   bookkeeping. `nx` exits 0 with "No tasks were run" when no project owns the
   target it is asked for (measured 2026-09-17), so removing `cli`'s `bundle`
   cannot redden CI even in the moment before `ci.yml` stops naming it; and
   `nx.json` already carries `targetDefaults.smoke` with `dependsOn: ["build"]`
   and `production` inputs, so the new target needs a `project.json` entry, a
   `package.json` script and a place in the lab's explicit `verify` list — and
   no new wiring.

## 10. Delivery

| PR | Content |
|---|---|
| 1 | Move ten pure fragments (nine engine, one board element) plus `startChoiceOf` and `short(n, locale)` in their corrected shapes; extract the shared "finite number under a `PARAM_SPEC` key" predicate and leave both reactions alone; add the sixth engine export and its tsconfig and smoke entries; add unit tests for every moved fragment; the old lab switches over |
| 2 | `apps/lab` skeleton: Vite, React, ESLint/Prettier, `project.json`, the proxy **with the `Origin` rewrite**, tokens, shell, `App`-level `useGenerator` and the single `BoardCanvas`, and one end-to-end path — generate, draw, save |
| 3 | The console: group rail with violation counts, knob grid with `ValueKnob`, `ChoiceKnob`, `StartKnob`, the keyboard slider with the rule marker, `ViewPanel`, the run column with `auto`, `help` and abort, live command, presets, the violations panel, the clamp notice, and the hash codec with `hashchange` → run |
| 4a | Language switch and simple view: `lang` and `recipe` slices, `ui.mode`, the view and language radio groups in the top bar, `<html lang>` and the board's `lang`, the language in the hash, `SimplePanel` in the one `Console`, the simple halves of §2.2 — plan `2026-09-14-lab-simple-view.md` |
| 4b | The `result` slice, so a run in flight keeps the board, report and exports of the last result (§5.3); the report as the stage's third column — statistics with the delta against the baseline, longest pieces — and `reportDelta` into `lab-report.ts` (§4.1); the SVG export through a throw-away worker and the board-file download in the run column; `BoardFrame` with the annotation and the solo toggle, button and `f` (§5.1); and the command box that collapses at ≤900px — PR #67's browser pass at 860px measured `.fw-cmdfig` (`flex: 0 1 auto`) shrinking to 8px while its `<pre>` keeps `min-height: 58px` and paints behind Generate, in both views — taken into 4b because the exports lengthen the same column; measured, the same collapse appears above 900px once the exports join the column (66.9px over Generate at 1400×900 in the advanced view), so the fix — a floor on the figure — applies at every width and keeps the ruling of `run.css:147-158`: the box scrolls, and Generate does not move as the command grows — plan `2026-09-15-lab-report-export.md` |
| 5a | The workspace and the list: `LabRoute` becomes `Workspace` over `/` and `/boards`, `Console` gains its third face and solo works on both tabs (§5.1); `result.preview` beside `shown`, and `library.slice` (§5.3); the store's HTTP path moves to `/store/` and `/boards/:size/:id` becomes a board's address (§5.6); size chips, the list, refresh, and the preview itself — fetch, `decodeBoard`, and the stored board's status line |
| 5b | The detail under the list, in a `LibraryPanel` of two rows (§5.1): the stored command with copy, the three view fields **through `ViewNumberField` rather than a second set of number inputs** — the commitment recorded in PR #65, which is also how their ranges come from `VIEW_RANGE` — and the two flags through `ViewFlagSwitch` beside them, because the old lab stores `libRounded` and `libColored` with the numbers and a parity that could not colour a saved board would not be one; both components lose their store reads and take a value and a callback, which is what lets one field serve two owners. Then their 350ms write back to the store through `previewView` and the meta (§5.3), **load into lab** (`setMany`, and no run: `lab-page.ts`'s `libLoad` handler says so in as many words), and the two-click delete, with `deleteBoard` joining the store client and the address replaced rather than pushed (§5.6). It also clears what PR 5a's review recorded against it: the `loadingBoard` silence, the chips and list disagreeing about an unlisted size, and the three regions sharing one accessible name (§7.2). **Parity with today's lab is reached here, not at PR 4** — units 11 and 12 are what the monorepo spec means by parity |
| 6 | The docs route: the element's API guarded against `mod.ts` and `arrowz-board.ts` — the property, member and event tables, not only the event map, with the "nothing public is undocumented" direction read from the declarations in the engine's Deno test and the "everything documented exists" direction read from the runtime class in the element's browser test — and the CLI help **called** from `helpText()` at render, not generated at build time (plan `2026-09-18-lab-docs-route.md`) |
| 7 | v2 additions: run filmstrip (parameters, metrics, thumbnail; selection reloads), parameter diff with focus parity, ⌘K palette |
| 8 | Retire the old lab, which PR 5b made possible by reaching parity. **Deleted:** `lab.html`, `lab-page.ts`, `lab-worker.ts` and `lab-bundle.test.ts`; the `bundle` task in `packages/cli/deno.json` and in the root `deno.json`, together with the `&& deno task bundle` of the root `verify`; the `bundle` target in `packages/cli/project.json` and its place in that project's `verify`, plus `bundle` in `ci.yml`'s target list; `packages/cli/lab.html` in the root `fmt.exclude`; and `carve.test.ts`'s "every picture field of the lab stays inside the CLI range". That last deletion costs no coverage: it parsed `min`/`max` out of HTML with a regular expression, while `ViewNumberField` in `apps/lab/src/console/ViewPanel.tsx` reads each bound from `VIEW_RANGE` at the point of render and `ViewPanel.browser.test.tsx` holds the rendered `min`/`max` of every field against that table (`viewFields.test.ts` guards the table's key coverage and each field's step, not its bounds) — the guard by construction that the regex only imitated. **Kept, and renamed for what it becomes:** `lab-server.ts` → `store-server.ts`, with its test file, the `lab` task → `store`, `lab.sh` → `store.sh` and the comment in `vite.proxy.ts`. It serves `/api/` and `/store/` and nothing else: the page and `/dist/` areas of the router go, and with them `LAB_CSP` (what remains answers JSON and static store files, so it gets a policy that says so) and the MIME entries no stored file can have. The script loses the bundle, the `--watch`, the `open` and the Lit check; what is left starts the server, and its read permission can narrow from the package directory to the store. **Added:** the build-output smoke of §8. **The rule that loses its exception:** with `lab-page.ts` gone, no file in `packages/cli` knows the DOM, so `neutral.test.ts` gains a second, DOM-only pattern set applied to `packages/cli/*.ts` — `Deno.` cannot be among those patterns, the CLI being Deno — and `CLAUDE.md` states the rule without naming a file that no longer exists. **Documentation:** README's "The web page" section and its Polish twin come to describe the one lab; the "a second lab is being built beside it" paragraph goes, as do the `lab.html`/`lab-page.ts` rows of both file tables. Out of scope, each with its own brainstorming when its turn comes: narrowing `VIEW_RANGE`, and moving the store into the Node world so the lab needs no Deno process at all |

Nothing in today's lab is dropped. The features the first draft lost and this
one restores: `auto`, `help`, the clamp notice, `libLoad` ("load into lab"),
`libRefresh`, `libCopy`, the library's size chips, the `f` hotkey for full
screen, the `generatingBig` warning, the store-save outcome in the status line,
and the report's delta baseline, unmoved by a language switch.

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
- **Recipes in the library.** A stored layout remembers every seed and
  parameter set that produced it (`BoardMeta.sources`, added by the layout-hash
  PR), and nothing shows them: PR 5b's detail prints the meta's own `command`,
  as today's lab does. Listing the recipes, and removing one of them — which
  needs a route the store server does not have — is PR 7's or later, with its
  own brainstorming. PR 5 is parity, and parity is one command.
