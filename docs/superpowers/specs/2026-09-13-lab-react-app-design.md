# The generator lab as its own application: `apps/lab`

Date: 2026-09-13. Step 3 of the road map fixed in
`docs/superpowers/specs/2026-09-09-monorepo-design.md` §2.

## 1. What this is

The generator lab lives inside the CLI package today: `packages/cli/lab-page.ts`
is 1668 lines of imperative DOM against 60-odd fixed ids in
`packages/cli/lab.html`. It is the only consumer of `<arrowz-board>` and the
proving ground for every knob the engine exposes, and it has outgrown the
package that hosts it.

This document designs its replacement: `apps/lab`, a React application that
consumes the engine, the CLI's vocabulary and the board element as published
packages, and wears the visual layer designed as *Arrowz Workshop v2* in the
Claude Design project `7fc443c6-aaf3-4d37-a380-9812f10110b6`.

Out of scope: any change to generator behaviour; the Angular game (step 4);
publishing to JSR or npm; a hover hit test in `<arrowz-board>` (§9).

## 2. What the lab does today

Twelve units of responsibility, measured against the source:

| # | Unit | Anchor |
|---|---|---|
| 1 | Language switch PL/EN, 85 UI keys | `lab-page.ts:500-545` |
| 2 | Parameter panel built from `PARAM_SPEC`, groups, violations, inactive knobs | `:199-498`, `:778-822` |
| 3 | Presets by level and mode | `:551-593` |
| 4 | Simple view: sizes, 0-100 sliders, segmented choices | `:600-771` |
| 5 | Nine preview/export fields | `:837-861` |
| 6 | Live CLI command with copy | `:866-879` |
| 7 | Worker lifecycle, progress, abort | `:885-1033` |
| 8 | Board display through `<arrowz-board>` | `:64-87`, `:1014-1019` |
| 9 | Report: ~27 statistics rows with a delta column, longest pieces | `:1535-1657` |
| 10 | SVG download through a throw-away worker | `:1082-1116` |
| 11 | Board store client, POST after each generation | `:1121-1155` |
| 12 | Tabs and the saved-boards library, including view editing and delete | `:1160-1450` |

Three engine modules already carry the DOM-neutral half of this: `lab-simple.ts`
(454 lines), `lab-i18n.ts` (540), `lab-presets.ts` (74). `neutral.test.ts`
keeps them free of the DOM.

### 2.1 What will not port line by line

The lab keeps state in the DOM in four places, and each one has to become
ordinary state before it can be rendered by React:

1. **Nine preview fields have no variable at all.** `viewOptions()`
   (`:846-857`) and `voidsOn()` (`:859-861`) read `el(id).value` / `.checked`
   on every call; `saveToUrl()` (`:1472-1486`) serialises the raw input
   *strings*, so the URL hash holds `"12"` rather than `12`. The library view
   fields do the same through `libView()` (`:1360-1370`).
2. **View mode is a body class**: `simpleActive()` reads
   `document.body.classList.contains('simple')` (`:748-750`); full screen is
   the `body.solo` class (`:1062-1064`).
3. **`setParam` consults `document.activeElement`** (`:797`) so that writing
   state does not clobber a seed field under the cursor.
4. **Status is HTML**: `setStatus` assigns `innerHTML` (`:959-961`) and call
   sites wrap dictionary strings in `<span class="bad">` (`:915`, `:923`,
   `:987`, `:995`).

## 3. Decisions and rejected alternatives

**Vite 8 + React 19, no framework.** Rejected: *Next.js* — every panel would be
`'use client'` for an application whose entire workload is a Web Worker and
whose store is an existing Deno server; its server runtime would sit beside
`lab-server.ts`, not replace it. Rejected: *Astro islands* — two mental models
in one project. Vite also matches `packages/board-element`, which already runs
Vite 8 and Vitest 5 with Playwright Chromium in CI.

**React Router 8, declarative mode** (`<BrowserRouter>`, `<Routes>`). Three
routes and a deep link to a saved board. Rejected: *framework mode* (its Vite
plugin, `routes.ts`, type generation and SSR machinery solve nothing here);
*data mode* (one `fetch` for the board list does not need loaders); *no router*
(loses deep links and the back button between tabs).

**ESLint 10 flat config + Prettier 3.9 for `apps/lab`,** with
`typescript-eslint`, `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y`.
Rejected: extending `deno fmt`/`deno lint` over `apps/` — measured to work on
TSX (Deno 2.9.6 formats it and ships `jsx-*` plus `react-rules-of-hooks`), and
it would have kept one formatter in the repository, but the Node-side toolchain
is what a React contributor expects. `deno.json` keeps excluding `apps/`.
`jsx-a11y` is load-bearing, not decoration: the mock has thirteen known
accessibility gaps (§7.2).

**`@lit/react` 1.0.8 for the board.** `createComponent` sets properties rather
than attributes and maps `onPieceClick` to `piece-click`; `<arrowz-board>`
takes the board and the view as objects, which React alone would stringify.
One file in the application touches it: `lab/stage/BoardCanvas.tsx`.

**Zustand 5 for state, with per-knob selectors.** Rejected: *context +
`useReducer`* — every knob edit would re-render the whole 40-knob grid, which
is visible while dragging a slider; *a hand-rolled store on
`useSyncExternalStore`* — same characteristics in ~40 lines and no runtime
dependency, but own code where a standard exists.

**The board store stays `packages/cli/lab-server.ts` behind a Vite proxy.** The
server already carries the CSP, the loopback-`Host` check and the
cross-origin-`Origin` refusal (`lab-server.ts:65-75`), and validates every
`PARAM_SPEC` key and view number on write (`:90-127`). Rejected: *a new Node
backend* (duplicates tested code); *OPFS/IndexedDB* (loses the store shared
with the CLI).

**Bilingual PL/EN with a switch in the top bar.** The mock is English-only; the
repository rule and `lab-i18n.ts` are not negotiable. The switch sits in the
top bar's right group, beside ⌘K.

**Local development tool.** No public hosting, so no static-export or adapter
constraints.

## 4. Package boundaries

### 4.1 What moves out of the page first (PR 1)

Twelve pure fragments live in `lab-page.ts` and belong behind a package
boundary — eleven in the engine, one in the board element. Two of them are
duplicated on the server today, which is why this is a separate PR rather than
a rewrite inside the new application:

| Fragment | Now | Goes to |
|---|---|---|
| Report rows (~27 rows, delta signs, formatting) | `:1540-1637` | engine, new `lab-report.ts` |
| `longestSummary(board, n)` | `:90-120` | engine, beside `analyse` |
| `clampParam(spec, value)` | `:778-782` | engine, beside `snapToStep` |
| `readParams(raw)` | `:142-150` | engine — **replaces** `checkParams` in `lab-server.ts:90-101` |
| `viewNumber` clamp rule | `:837-844` | `command.ts` beside `VIEW_RANGE` — **replaces** `checkView` in `lab-server.ts:106-127` |
| `startChoiceOfState`, `setStart`, `MIX_START`, `START_CHOICES` | `:331-385` | `command.ts` beside `START` |
| `violationText(v)` | `:444-456` | `lab-i18n.ts` (engine has English-only `formatViolation`) |
| `recipeOf(raw)` | `:605-608` | `lab-simple.ts` beside `normalizeChoice` |
| `boardView(view, voids)` | `:69-79` | `packages/board-element` — `BoardView` is its type (`src/view.ts:5-22`), and it already depends on the engine, so the mapping cannot live in the engine without inverting that dependency |
| `genSeconds(meta)` | `:1258-1260` | engine, beside `BoardMeta` |
| Progress `short(n)` | `:908` | engine, beside `t('progress')` |
| Store request bodies | `:1123-1137`, `:1384-1391` | engine, as the shared store contract; `packages/cli/store.ts` narrows its `SaveInput` to that type instead of declaring its own |

The old lab switches to the moved functions in the same PR, so `deno task
verify` and `fingerprints.test.ts` prove the move changed no behaviour.

### 4.2 What the application consumes

- `@arrowz/engine` and its subpaths `/command`, `/simple`, `/presets`, `/i18n`
  — all five already declared in `packages/engine/package.json`, all emitted by
  `tsc` into `dist/`, which is gitignored, so `pnpm nx build engine` must run
  first. Nx handles that with `dependsOn: ["^build"]`.
- `@arrowz/board-element` **by package name**. The old lab imports
  `../board-element/src/mod.ts` by relative path because Deno cannot resolve
  the Node name; the new application fixes that seam by construction.

### 4.3 Nx and CI

`apps/lab/project.json` declares `check` (`tsc --noEmit`), `lint` (eslint),
`fmt` (prettier --check), `test` (vitest), `build` (vite build), `serve` (vite,
`cache: false`) and `verify` (noop depending on the rest) — the same shape as
`packages/board-element/project.json`. CI runs `nx affected -t check lint fmt
test build smoke bundle`, so the new project enters the gate without touching
the workflow.

## 5. Component architecture

No file exceeds ~150 lines of JSX; no component holds logic that belongs in the
store or the engine.

```
apps/lab/src/
  main.tsx                    mount, <BrowserRouter>
  App.tsx                     routes, shell, global hotkeys
  shell/
    TopBar.tsx                mark, preset name, dims, ⌘K, language, simple/advanced
    TabRow.tsx                role="tablist", arrow keys, aria-controls
  routes/
    LabRoute.tsx              /            stage + console
    SavedBoardsRoute.tsx      /boards      list and detail
    DocsRoute.tsx             /docs/:what  element | cli
  lab/
    PresetStrip.tsx           chips, aria-pressed, "edited" marker
    stage/
      Stage.tsx               70px + 1fr layout
      RunRail.tsx             filmstrip, aria-current, focus mirrors hover
      RunStatusBar.tsx        ready / carving / failed, aria-live="polite"
      BoardStage.tsx          paper frame, annotation, zoom
      BoardCanvas.tsx         createComponent(<arrowz-board>) — the only @lit/react site
    RunDiffStrip.tsx          differences against the peeked run
    console/
      Console.tsx             168 / 1fr / 216 layout
      GroupRail.tsx           generator and element sections, counts, amber flag
      KnobPanel.tsx           group header + grid
      Knob.tsx                switch / value branch
      ValueKnob.tsx           number, word, inline entry
      KnobSlider.tsx          role="slider", keyboard, envelope ceiling
      SwitchKnob.tsx          role="switch"
      RunColumn.tsx           command, Generate, new seed, reset, exports
    simple/
      SimpleConsole.tsx       sizes, sliders, segmented choices
    report/
      StatsTable.tsx          ~27 rows, delta keyed by metric name
      LongestTable.tsx        longest pieces
  palette/
    CommandPalette.tsx        role="dialog" + combobox, focus trap
  state/
    store.ts                  one store, the slices below
    params.slice.ts           40 knobs, clamping, violations, inactivity
    view.slice.ts             the nine preview fields — state, not DOM
    run.slice.ts              run state machine + history
    ui.slice.ts               tab, group, palette, mode, solo
    lang.slice.ts             PL/EN, localStorage `labLang`
    url.ts                    hash codec, tolerant reader
  worker/
    generate.worker.ts        imports @arrowz/engine, protocol with runId
    useGenerator.ts           start, progress, abort, result
  api/
    boards.ts                 GET / POST / DELETE, types from the engine
  design/
    tokens.css                the 16 Fronthub tokens
    fw.css                    the 258 ported lines, dead rules dropped
```

### 5.1 Reconciling the mock with the lab

- The mock's rail has two sections, *generator* and *element*. The element
  section is the lab's nine preview/export fields (unit 5), not a new concept.
- The mock has no simple view. It becomes a swap of the console region only:
  `Console` → `SimpleConsole`, with the stage, filmstrip, status bar and run
  column unchanged. The toggle sits beside the language switch.
- The mock's `element` tab becomes `docs` with two sections: the element's API
  and the CLI's help, the latter generated from `helpText()` at build time as
  step 3 of the road map requires. The mock's own API tables contain two
  incompatible event vocabularies (`piece-enter`/`solved`/`view-change` against
  `piece-click`/`piece-removed`/`life-lost`/`finished`/`viewport-change`); the
  real names come from `packages/board-element/src/mod.ts:47-53`, and a test
  guards the generated tables against that augmentation, the way
  `readme.test.ts` guards the README tables.
- The mock has no report. The statistics and longest-pieces tables keep the
  lab's content, in the mock's `.fw-tbl` treatment, below the console.

### 5.2 State slices

| Slice | Holds | Persisted |
|---|---|---|
| `params` | 40 knobs, sparse overrides over `PARAM_SPEC` defaults, violations, inactive keys | URL hash |
| `view` | the nine preview fields as typed values | URL hash |
| `run` | `idle \| running \| done \| error`, progress, retries, metrics, history | no |
| `ui` | tab, selected group, palette, simple/advanced, solo, flash | `labView` |
| `lang` | `pl \| en` | `labLang` |
| simple recipe | inside `params`, normalised by `normalizeChoice` | `labSimple` |

`dirty` (the mock stores it, `W:488`) is derived, not stored: values differ
from the preset's. The mock's `resetAll` clears values but keeps `presetId`, so
the chip re-lights as active — that is a mock bug, not a behaviour to port.

Storage keys keep their current names (`labLang`, `labSimple`, `labView`) so an
existing browser profile carries over while both labs coexist. The URL hash
keeps its key names and gains a tolerant reader: numbers are written as
numbers, strings are still accepted, so links already shared keep working.

Status becomes structured data rather than an HTML string; the dictionaries in
`lab-i18n.ts` are plain text and the markup was added at call sites.

## 6. The worker boundary

The protocol (`types.ts:330-354`) is one message in, one non-`progress` message
out, with no request identifier — safe today only because the page terminates
the worker before every run (`:979-983`). The filmstrip keeps several runs, so
`WorkerIn` and `WorkerOut` gain an **optional** `runId`; the old lab ignores it
and keeps working until PR 7.

Deno-specific parts of `lab-worker.ts` are two reference directives
(`deno.worker`) and the bundled `./lab-worker.js` URL. Under Vite the worker is
instantiated from its TypeScript source:

```ts
new Worker(new URL('./generate.worker.ts', import.meta.url), { type: 'module' })
```

Generation uses one long-lived worker; the SVG export keeps its own
throw-away worker, as today (`:1086`).

## 7. The visual layer

### 7.1 Ported verbatim

The 16 tokens; the grids (`48px auto 1fr`, `70px 1fr`, `168 1fr 216`,
`auto-fill minmax(190px, 1fr)`); 1-2px gutters over a `--border` ground; zero
radius except the switch track/handle and the ready dot; control heights (40 /
32 / 30 / 28 / 24 px, switch 44×26, palette input 44, top bar 48, preset strip
38); all interaction states at `cubic-bezier(.2, 0, 0, 1)` 120 ms with the
progress bar at 80 ms linear; the 2px `--signal` focus ring at offset 2;
`--warn` exclusively for a clamped value; `--signal` exclusively for state and
data; text on `--signal` in `--void`; `tabular-nums` on every number;
`max-width: 74ch` on prose; the two breakpoints (900px collapses the console,
700px height releases the board's minimum).

Dropped: `--ok` and `--signal-soft` (defined, never used). Kept: `--error` (the
failed run) and `--border-strong` (the palette frame), neither of which is in
the design system's own token list — flagged, not resolved.

### 7.2 Fixed, because the mock does not have it

The mock is a mock; these gaps are corrected in the port rather than copied:

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

Fourteen placeholders, taken from the mock's own source and replaced by real
behaviour: `generate()` is a `setInterval` (+7% per 90ms, deterministic failure
above 62% when straightness is below 0.6); `took`, `pieces` and `longest` are
random; the readout's piece id and length are hashes of the cursor position;
the saved-board list, the run history and the group counts are literals;
generating never appends a run; five `copy` buttons, both exports, the saved
`open` button and the zoom triplet have no handlers; `flags` emits five flags
while the other ~25 knobs never reach the command string.

Two mock inconsistencies are corrected rather than reproduced:

1. **The envelope clamp is display-only in the mock.** It shows amber and a
   ceiling marker while `flags` prints the raw value — `--lateral=40` under a
   caption saying the run will use 20. In the application the value is clamped
   on commit through `clampParam`, and the command prints the clamped value.
2. **The command string is built by `buildCommand`** from the engine, not by
   hand from five flags.

## 8. Testing

- **Unit (Vitest, node):** every store slice; the hash codec, including a
  string-valued legacy hash; `clampParam` behaviour at bounds and steps; the
  report's delta keyed by metric name across a language switch; the command
  string against `buildCommand` for a table of parameter sets.
- **Browser (Vitest browser mode, Playwright Chromium):** the slider's keyboard
  path; the palette's focus trap and return; tab arrow navigation; a full run
  from Generate to a drawn board with **zero console errors**; the board
  element receiving object properties through the `@lit/react` wrapper.
- **Integration:** the board store client against a live `lab-server.ts` —
  list, save, delete, and the view-editing re-POST.
- The existing `lab-bundle.test.ts` keeps guarding the old lab until PR 7
  removes both.

## 9. Risks, and what gets measured before it is built

1. **The hover readout is not implementable today.** `<arrowz-board>` emits
   `piece-click`, `viewport-change`, `piece-removed`, `life-lost` and
   `finished` — there is no hover event. The readout is therefore **out of
   scope**; adding a hit test to `packages/board-element` is its own change,
   with its own browser tests and a cost measurement on an Insane board.
2. **The mock's zoom triplet duplicates the element's own chrome.**
   `arrowz-board.ts:365-401` already renders zoom, fit, a colour toggle and a
   gesture switch. The three `.fw-zoom` buttons map onto `zoomBy()` and
   `fit()`, but whether the element's own bar can be hidden has to be checked
   before PR 2 draws two sets of the same controls.
3. **The proxy and `Origin`.** `lab-server.ts:65-75` refuses writes from a
   foreign `Origin`. Vite's `changeOrigin: true` is expected to pass and is
   verified live in PR 2, not assumed.
4. **`packages/engine/dist/` is gitignored**, so a fresh clone must build the
   engine before `vite dev` resolves anything. Covered by Nx `dependsOn`, and
   worth one line in the app's README.

## 10. Delivery

| PR | Content |
|---|---|
| 1 | Move the twelve pure fragments out of the page — eleven into the engine, one into `packages/board-element`; delete the server's duplicate validation; the old lab switches to the moved functions |
| 2 | `apps/lab` skeleton: Vite, React, ESLint/Prettier, `project.json`, the proxy, tokens, shell, and one end-to-end path — generate and draw |
| 3 | The console: group rail, knob grid, keyboard slider, run column, live command, presets |
| 4 | Simple view, language switch, report, SVG export — parity with today's lab |
| 5 | The saved-boards library: list, detail, view editing, two-click delete |
| 6 | v2 additions: run filmstrip with `runId`, parameter diff, ⌘K palette |
| 7 | Remove `lab-page.ts`, `lab.html`, `lab-bundle.test.ts`; point `lab.sh` and `deno task lab` at the new application |

Deferred, with its own brainstorming when its turn comes: a hover hit test in
`<arrowz-board>` and the board readout that depends on it.
