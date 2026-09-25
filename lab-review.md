# Lab review

Reviewed at `b9a5a9d` (`lab/round3-board-gap`, the top of the round 3 stack
#103 ← #104 ← #105 ← #106 ← #107), 2026-09-24. Scope: `apps/lab`, and the
lab-facing parts of `packages/engine` (`lab-*.ts`, `command.ts`) and
`packages/board-element`.

The review was split into five independent passes, each by its own agent,
read-only, with the rule that every claim cites `file:line` and every "not
there" claim shows its grep. No tests or browser runs were made (the review
worktree has no `node_modules`); all findings come from reading the code. The
coordinator re-read the strongest claims of each pass against the code before
merging them here; those are marked **verified** in the summary below.

## Summary

| Area | Headline |
| --- | --- |
| Correctness | 16 findings: 1 HIGH, 6 MEDIUM, 9 LOW (2 plausible) |
| Practices and refactoring | 11 ranked refactors; the first deletes ~350 dead lines (TSX + CSS) |
| Feature parity | All 28 generator knobs and 7 picture flags are covered (drawn from `PARAM_SPEC` / `VIEW_RANGE`); the gaps are the element's interaction/game surface, reading a command back in, and a third of the report metrics |
| Comment prose | 22.9% of non-blank lines are comments; 805 comment lines cite PRs, rounds, rulings or reviews; a rule would cut ~2,300–2,600 lines (28–31%) |
| Labels and help, novice view | The report explains nothing (23 rows, no help, raw codes `f0`, `almost1`, `D`); 2 factual errors; 8 knobs describe values their slider cannot reach; one concept, several names |

## Status after the fixes (2026-09-24)

Branch `lab/review-fixes`, commits `1441fc2..4e9d8eb` (the plan, then the
fixes). The sections below this one are unchanged: they record what
was found at `b9a5a9d`. "Fixed" means a commit on this branch changed the code
and a test pins it; "open" means the code still reads as the finding says.

**Gates.** `pnpm nx run-many -t verify` green (4 projects, 21 tasks) in a clean
worktree at `701e83a`; `lab:test` 1153 passed at `13ff72f` (1145 at `4e9d8eb`,
before D1's fix; 1168 at `b32ba70`, after the follow-ups below, the latest
full run). A live pass in Chrome at `4e9d8eb` passed all seven scenarios
(palette jump in EN and PL, ◑ against the lab switch and in the library,
highlight and margin across a reload, Inspect and Play, report wording,
1280×699 against 1280×700, a phone at 375×812 in PL). It found one new layout
defect, D1 below.

**D1 is fixed**, in `20d50cd` and `13ff72f`: the mode control and its line
moved off the board, into a strip under the board frame; a new `board-cover`
layout invariant fails if any lab overlay intersects the drawn board. The
cost is 45 px more board height for Inspect and Play than View from 768 px of
window width up, and 48 px at XS.

**Comments.** Measured with the guard's extractor (comment-only lines) over the
guard's scope, about 250 files: 8,644 comment lines before (22.3% of non-blank
lines, at `d486dd1`) and 6,466 after (17.7%, at `701e83a`). The guard
`packages/engine/comments.test.ts` is on. It enforces the history markers
(PR, round, Ruling, Task, handoff, R-numbers, harness facts, `file.ts:NN`),
non-header blocks of at most 6 lines and headers of at most 24, over
`apps/lab/src`, `packages/board-element/src` and `packages/engine/lab-*.ts`.
The engine's other files and `packages/cli` were not swept: 25 marker lines in
9 files there, 39 with `scripts/`. (The 22.9% in "Comment prose" below used a
different counter over 237 files; the two numbers are not comparable.)

**Follow-ups requested during the live pass.** After the browser pass at
`4e9d8eb`, four more changes were asked for and committed:

- `e395681` — the longest-pieces highlight was on by default; now off, and a
  link without the key reads as off too, the same rule already used for
  `colored`.
- `9fb6540` — the lab's own names for the highlight fields are now readable:
  `view.hilite` became `highlightLongest`, and the colour field became
  `highlightColor`, across the store, the i18n keys, the DOM ids and the hash
  keys. Old links still open, through a legacy fallback in the decoder. The
  element's own `view.highlight` is unchanged; that rename is left for a
  separate refinement of the component.
- `4a34463`, `ba54d2f` — the saved board's layout hash in the library shows
  in full now, wrapped onto as many lines as it needs, instead of being cut
  with a `title` tooltip. The second commit re-measured the wrap through the
  real app rather than an isolated column, after a review caught that the
  first pass had not.
- `b32ba70` — switching between View, Inspect and Play no longer restarts the
  game: the lab mirrors the element's session (through `piece-removed` and
  the engine's `play()`), so Inspect always describes the board as it now
  stands. A separate Reset button, shown in both Inspect and Play, starts the
  game over.
- `8e723f2` — the saved board's "generated" fact (duration and timestamp) no
  longer clips with an ellipsis at the column width; it wraps at the space
  between the two, never inside a number.

### The findings that matter most

| # | Finding | Status | What changed |
| --- | --- | --- | --- |
| 1 | HIGH: palette jump into a closed block loses the focus | fixed in `08162fa` | A block opened by a jump or a refusal stays open; tested in `Console`, not only `KnobPanel` |
| 2 | Element ◑ takes `colored` away from the lab | fixed in `840bf34`, `5b09695`, `85c7aab`, `078b98e` | The element emits a cancelable `colored-change`; the lab writes its own flag and cancels; a cancelled click hands control back to `view.colored` |
| 3 | "% of perimeter" divides by `W + H` | fixed in `e7de79a`, `6f3517b` | Now "% of width + height" in the lab (EN and PL) and in the CLI report |
| 4 | Difficulty help says "not the look" | fixed in `e7de79a`, `6f3517b` | The group help says what it changes |
| 5 | 699 against 700 breakpoint | fixed in `750b059`, `d750cad` | Every stylesheet uses 699; a node test greps the queries against `band.ts` |
| 6 | Line citations and history in comments | fixed in `0d0d809`, `3728763`, `446c853`, `fcc58af`, `6d60475`, `d0edfd9`, `428be15`, `eed9851`, `fcf0c0a`, `f6c4673`, `ffb4dd1`, `0be63c3`, `5e78da1`, `e7b0d50`, `701e83a`, `4349970` | Comment rule in `CLAUDE.md`, the guard, and the sweep |
| 7 | Dead `KnobSlider` | fixed in `a2f60e0` | Component, `FieldHelp` body, `viewHelpEntries` and the dead CSS deleted; helpers moved to `track.ts` |

### Correctness

| Finding | Status | Note |
| --- | --- | --- |
| HIGH: palette jump loses the focus | fixed in `08162fa` | See above |
| MEDIUM: `<Navigate>` drops the hash | fixed in `13c9acc` | A redirect keeps the fragment, so a link under a wrong path opens on its knobs |
| MEDIUM: palette loses Escape, Tab and hotkeys off its input | fixed in `0211a71` | A click inside keeps the focus in the input; no key reaches the page behind |
| MEDIUM: simple view size rows show the recipe | fixed in `d7f04b4` | The rows show the knobs' size; a size edit writes both sides into the recipe, so the other side stays as shown |
| MEDIUM: PL decimal comma does nothing | fixed in `4a5313a` | `DraftNumber` reads a comma as a point in a fractional field |
| MEDIUM: link colours cannot clear the page's own | fixed in `3dc5ccc` | A versioned link now clears theme, palette, paper and ink it doesn't name; `0a704d5` extends the rule to any version number |
| MEDIUM: head height 0 lost in the hash | fixed in `66f1188, 3dc5ccc` | The view version makes 0 literal in the store's `fillView` and the link decoder; `0a704d5` keeps this true after a later bump |
| LOW: palette "on"/"off" in English | fixed in `feb59ab` | `palette/commands.ts` reads the flag values from the dictionary |
| LOW: English reason in the PL status line | fixed in `feb59ab` | `'not in the store'` now comes from the dictionary too |
| LOW: view edit clears `aborted` in the store | open | `store.ts` unchanged |
| LOW: pending view save dropped for another board | open | Still one module timer |
| LOW: SVG drops palette, paper and ink silently | open | Note still shown only for a theme |
| LOW: unknown theme name stored | fixed in `3dc5ccc` | `themeOf` validates the name; an unknown one is dropped, not stored |
| LOW: `voids` not in the link | fixed in `3dc5ccc` | A versioned link now carries `voids` |
| LOW, PLAUSIBLE: worker handlers and failed load | open | |
| LOW, PLAUSIBLE: synchronous revoke on download | open | |

### Feature parity

| Gap or item | Status | Note |
| --- | --- | --- |
| Gap 1: read a command back in (`parseArgs`) | open | |
| Gap 2: try the board by hand (`play`) | fixed in `30ebd4b`, `74c0290`, `653e185`, `bff6430` | View / Inspect / Play on the frame: piece card in Inspect, a "left · mistakes" line and Restart in Play; the control shows only with a board on stage |
| `interactive` and `piece-click` | fixed in `30ebd4b`, `74c0290` | Inspect turns `interactive` on and listens to `piece-click` |
| Element hint in Inspect said "to play" | fixed in `74c0290` | The element words its own Inspect hint |
| Gap 3: closing rate over N seeds | open | |
| Gap 4: missing report rows (`backbites`, `T2`, `minLen`, …) | open | |
| Gap 5 / Duplication 1: colour-button split | fixed in `840bf34`, `5b09695`, `85c7aab`, `078b98e` | See finding 2 |
| Gap 6: Stop that keeps the partial board | open | |
| Gap 7: SVG colours | open | Same as the LOW correctness finding |
| Gap 8: open a `.board.json` from disk | open | |
| Gap 9: `highlight` colour row | fixed in `b90609e` | |
| Gap 9: `pad` (margin) row | fixed in `0d916c2`, `24bca8b` | Held to the element's new `PAD_RANGE` (`840bf34`) |
| Gap 9: recipes, `fingerprint`, batch fill, point-grid note | open | |
| ⌘K rows for colour and element fields (highlight, pad, …) | open | Found in the final review; the palette has none |
| `pad` and highlight in the SVG | open | `SvgOptions` has neither |
| Element README drift (`pieceCount`, `emit`, `BoardData`) | fixed in `840bf34`, `1b0d079` | |
| Duplication 2: CLI `--top` re-implements `longestSummary` | open | |
| Duplication 3: demo keeps its own view bounds | open | `demo/controls.ts` still has `headHeight` 0.1–1, `top` 0–50 |
| Duplication 4: `colored`/`rounded` defaults hard-coded | open | |

### Labels and descriptions

| Item | Status | Note |
| --- | --- | --- |
| Top 1: the report explains nothing | fixed in `1c5eb26`, `a62d567`, `9201262`, `5681c07` | Every row, the summary and the longest table have a `?`; labels in player's words; depth, traps and free at start say which way is harder |
| Top 2: jargon as visible labels (`prostota`, …) | open | |
| Top 3: help warns about values the slider cannot reach | open | |
| Top 4: one concept, many names | partly fixed in `0d916c2`, `24bca8b` | PL "podświetlenie" is now "wyróżnienie" everywhere; the rest of the glossary is open; the report's rows follow the glossary |
| Top 5: "element" means two things in PL | open | |
| Top 6: Simple view explains least | fixed in `c96adf3`, `1f7d26b`, `bf72ebc` | Both sliders and the skeleton have a `?`; labels say arrow length and winding; the number is explained; a sentence points to a harder board. The skeleton's help claims nothing about time: measured, it costs none. |
| Top 7: presets read as difficulty levels | open | |
| Top 8: status and rule messages speak engine | open | |
| Top 9: CLI details in lab help (`store.sh`, golden-angle, …) | open | |
| Top 10: arrowhead help is a formula | open | |
| Also found: "% of perimeter" | fixed in `e7de79a`, `6f3517b` | The row is now wide (`WIDE_KEYS`) so the PL text fits |
| Also found: difficulty "not the look" | fixed in `e7de79a`, `6f3517b` | |
| Also found: `start.help` drops "Tunnels = harder" | fixed in `c96adf3` | |

### Refactors

| Refactor | Status | Note |
| --- | --- | --- |
| 1. Delete the dead knob layer | fixed in `a2f60e0`, `d486dd1` | `console.test.ts` now pins the live `.kv-g .fw-swatches`; the `.fw-k` branch in `useFocusRequest` is gone |
| 2. One knob-row shell, split `ViewPanel.tsx` | open | |
| 3. One view schema and `view.apply()` | open | |
| 4. One hotkey table and `useDismiss` | open | |
| 5. CSS: `.fw button` tax, tokens, breakpoint | partly fixed in `750b059`, `d750cad` | Breakpoint fixed; the prefix tax and the tokens are open |
| 6. Library column reuses the run column's pieces | open | |
| 7. Test fixtures | partly fixed in `97cc390` | Three copies of `twoFrames` are one in `harness/frames.ts`; the CSS barrel, one reset and `renderAt` are open |
| 8. `useStoredBoard` into a library action | open | |
| 9. One roving-focus helper | open | |
| 10. Symbols instead of `file.ts:NN` | fixed in `0d0d809`, `fcc58af`, `6d60475`, `d0edfd9`, `428be15`, `eed9851`, `fcf0c0a`, `f6c4673`, `ffb4dd1`, `0be63c3`, `5e78da1`, `e7b0d50`, `701e83a` | Swept, and the guard fails on the pattern |
| 11. Try the React Compiler | open | |

### Smaller practice issues and dead code

| Item | Status | Note |
| --- | --- | --- |
| Whole-slice subscriptions | open | |
| `specOf` written four times | open | |
| `MIX_SPEC` exported for no test | fixed in `a2f60e0` | No longer exported |
| `ThemeSwatchStrip` exported for no importer | fixed in `a2f60e0` | |
| Hard-coded `'on' : 'off'` | open | Same as the LOW correctness finding |
| `autoHeadWidth` copies the engine | open | |
| `file: unknown` then `as BoardFile` | open | |
| Locale mapping duplicated | open | |
| Slice boilerplate | open | |
| `paletteUpdate(_state, colors)` | fixed in `a2f60e0` | Parameter dropped |
| `const set = onSet` | fixed in `a2f60e0` | |
| `params.broken` rebuilt on every commit | open | |
| Workspace class string (`cx()`) | open | |
| Very long comments | fixed in `0d0d809`, `3728763`, `fcc58af`, `6d60475`, `d0edfd9`, `428be15`, `eed9851`, `fcf0c0a`, `f6c4673`, `ffb4dd1`, `0be63c3`, `5e78da1`, `e7b0d50`, `701e83a` | No non-header block over 6 lines in scope |
| `BoardFrame` memo keys | open | |
| Circular type import `Console` ↔ `Workspace` | open | |
| Dead code table (`KnobSlider`, `FieldHelp`, `viewHelpEntries`, `ViewField.help`, dead CSS, `console.test.ts`, `.fw-k` selector) | fixed in `a2f60e0` | |

### Fixed as a side effect

- `result.show`, an action nothing called, deleted (`834360a`).
- `.fw-report .fw-delta.better`, a declaration a later rule overrode, deleted (`834360a`).
- Three copies of `twoFrames` in browser tests are one, in `harness/frames.ts` (`97cc390`).
- Polish "podświetlenie" is "wyróżnienie" everywhere, to match the section heading (`0d916c2`, `24bca8b`).
- The report's unblock-distance row is wide, so the longer PL unit fits (`e7de79a`).

### The findings that matter most

1. **[HIGH, verified] A palette jump into a closed dependency block loses the
   focus.** `DependencyBlock` holds the block open through `forced` computed
   only from `ui.focusTarget` (`console/KnobPanel.tsx:70-78`);
   `useFocusRequest` clears that target before focusing
   (`console/useFocusRequest.ts:38`), so the next render collapses the block
   and hides the control that just got focus. See Correctness.
2. **[Bug, verified] The element's own ◑ colour button takes the `colored`
   switch away from the lab.** The lab enables it (`stage/BoardFrame.tsx:128`,
   `enableColors`); a click sets `coloredOverride`
   (`board-element/src/arrowz-board.ts:410`), which wins over `view.colored`
   (`arrowz-board.ts:583`) and is reset only in the constructor (`:282`). After
   one click the lab's switch no longer changes the screen, while the command,
   the stored view and the SVG export still follow it. See Feature parity.
3. **[Copy, verified] The report's "unblock distance" says "% of perimeter"**
   (`engine/lab-i18n.ts:332`) but divides by `W + H`
   (`engine/engine.ts:2192`) — half the perimeter.
4. **[Copy, verified] The difficulty group says "Changes the blocking, not the
   look"** (`engine/lab-i18n.ts:33`) while its knobs change lengths and bends.
5. **[CSS, verified] The low-window breakpoint disagrees with itself at exactly
   700 px:** `max-height: 699px` at `design/shell.css:761` (and `band.ts`),
   `700px` at `design/console.css:1144` and `design/shell.css:443`.
6. **[Comments, verified] Line citations in comments have drifted:**
   `App.tsx:260` cites `useGenerator.ts:89` for code now at line 86; "harness
   fact N" is cited 16 times and defined nowhere in the repo; "Ruling 3" is
   defined separately in seven plans and two specs.
7. **[Dead code, verified] The `KnobSlider` component is imported only by its
   own test;** production takes only `boundOn`/`percent` from the file, and
   `KnobRow.tsx:133` still claims the simple view uses it.

### What is still open

Ranked. This replaces the suggested order of work written at `b9a5a9d`;
steps 3 (dead code, comment rule) and part of 1 and 5 are done (see the status
section above).

1. **The report and the simple view are done (`lab/report-copy`, `lab/simple-copy`); the glossary across the knobs and the view panel is next.** The saved boards' list still says "pieces" (e.g. "120 pieces · longest 69"), which belongs to the glossary pass.
2. **Smaller correctness items:** `aborted` cleared by a view edit, the
   dropped pending view save, the worker's stale handlers and failed load, the
   synchronous revoke, and the SVG note for palette, paper and ink.
3. **Structural refactors 2–4:** one knob-row shell, one view schema with a
   single `view.apply()`, one hotkey table and a `useDismiss` hook. Then 5
   (the `.fw button` prefix and tokens), 6–9 and 11.
4. **Parity gaps, as product decisions:** paste a `carve` command in
   (`parseArgs`), closing rate over N seeds, the missing report rows
   (`backbites` first), Stop that keeps the partial board, opening a
   `.board.json`, SVG colours (and `pad` and highlight in the SVG), ⌘K rows for
   the colour and element fields.
5. **Extend the comment sweep and guard** to the engine's other files and
   `packages/cli` (25 marker lines in 9 files, 39 with `scripts/`).
6. **Observations from the live pass and deferred review minors:** "top" in
   ⌘K lists Abort above "how many longest"; "blocked by #51 at 0 cells" reads
   oddly; the report drawer covers the board's right 45 px (and the Play and ☝
   buttons) at 1440×877, known since round 2; the two low-window height rules
   lack the `min-width: 768px` that `useLowWindow` has; the palette input has
   no `id` or `name`; `gl-color.ts` reads back without `willReadFrequently`;
   the `trapBias` help clause is vague.
7. **Follow-up from D1's fix:** at margin (pad) 0, the annotation (`.fw-anno`)
   covers the board's top-left cells; pre-existing, and no audited case uses
   pad 0, so no invariant catches it today.
8. **D2, found in the follow-up live pass:** at phone width (375×812) the
   board element's own control bar (+ − fit ◑, 44 px touch targets) covers
   about one row of the board's bottom-right cells (measured overlap
   59×8.5 px). It appeared once the mode strip moved under the frame
   (`20d50cd`) and made the frame shorter; the `board-cover` invariant checks
   the lab's own overlays only, not the element's own bar. Options: the lab
   enlarges the margin on narrow screens by the bar's height, or the
   element's fit reserves room for its own bar (a component refinement).
   Deferred by the user's decision.

The simple view's size rows, once first on this list, were fixed on
`lab/simple-size`. The former item 1 before that — the hash lost on `<Navigate>`, the palette's key handling,
the Polish comma in `DraftNumber`, the URL round-trip losses (colours cannot
be cleared, head height 0, unknown theme, `voids`), and the English leaks into
the Polish UI (palette "on"/"off", "not in the store") — was fixed on
`lab/correctness`.

The five passes follow in full.

## Correctness

Reviewed read-only at `/Users/tomek/dev/arrowz-review` (HEAD `b9a5a9d`). No tests were run (no `node_modules` in the worktree). Every finding below was checked against the code quoted. Findings marked PLAUSIBLE are reasoned from code and platform behaviour, not reproduced.

### [HIGH] A palette jump to a knob inside a closed dependency block opens the block for one render, then hides the control it just focused

**Where:** `apps/lab/src/console/KnobRow.tsx:221-223, 238`; `apps/lab/src/console/KnobPanel.tsx:70-78`; `apps/lab/src/console/ViewPanel.tsx:495-499, 509-513`; `apps/lab/src/console/useFocusRequest.ts:36-45`

**What:** `CollapsibleBlock` holds its body open only while `forced` is true:
```ts
const [choice, setChoice] = useState({ on, open: on })
if (choice.on !== on) setChoice({ on, open: on })
const open = choice.open || forced
...
<div id={id} hidden={!open}>
```
For a palette jump, `forced` comes straight from `ui.focusTarget` (`wanted = target === \`knob-${key}\``, KnobPanel.tsx:70-73; `forced={wanted === 'view-top'}`, ViewPanel.tsx:498). The consumer then clears that same field before it focuses:
```ts
useStore.getState().ui.clearFocusRequest()
const node = document.getElementById(target)
...
node.focus()
```
Nothing stores the open state anywhere else. On the next render `forced` is false, `open` goes back to `choice.open` (false while the parent is off), the body gets `hidden`, and HTML's focus fixup moves the focus to `<body>`.

**Failure scenario:** Start from the defaults (`probe`, `giants` and `wGiant` all default to 0, engine.ts:2551/2575/2619). Press ⌘K, type "probe length", press Enter. The difficulty panel opens, the block opens, `#knob-probeLen` gets the focus and flashes, and one render later the block closes and the focus is on `<body>`. The same happens for all six skeleton knobs, for `top` while the highlight is off, and for the point colour and radius while points are off. `KnobPanel.browser.test.tsx:250-256` misses this because it renders `KnobPanel` without `Console`, so nothing ever clears the request.

**Suggested fix:** When `forced` is true, store it in the block's own state, for example `if (forced && !choice.open) setChoice({ on, open: true })`. Alternatively, have `jumpTo` open the block explicitly, or clear the request only after the block has opened.

### [MEDIUM] A link whose path is not a known route loses its knobs: `<Navigate>` drops the hash before the hash hook reads it

**Where:** `apps/lab/src/AppRoutes.tsx:17, 20`; `apps/lab/src/routes/DocsRoute.tsx:22`; `apps/lab/src/state/useUrlHash.ts:120-128`

**What:** `<Route path="*" element={<Navigate to="/" replace />} />`, and the same for `/docs` and `/docs/<unknown>`, redirect to a bare path with no hash. React Router 8.3.1's `Navigate` calls `navigate()` in a `useEffect`, which calls `history.replaceState` synchronously (`react-router/dist/development/lib/components.js:392`, `lib/router/history.js:322`). React runs passive mount effects child-first, and `AppRoutes` is a child of `Shell`. So `Navigate`'s effect replaces the URL with `/` before `useUrlHash`'s read effect runs `decodeHash(location.hash)`. That call then sees `''`, and the page opens on its defaults. The flush effect then writes the defaults' hash over the entry.

**Failure scenario:** Open `https://host/index.html#%7B%22W%22%3A300...%7D` (what a static host shows for a direct file URL), an old `lab.html#…` link (url.ts says links from the deployed lab must keep working), or `/docs#…`. The lab carves the default 25×50 board, and the link's knobs and view are gone.

**Suggested fix:** Keep the hash in the redirects: `<Navigate to={{ pathname: '/', hash: location.hash }} replace />`, using a small wrapper that reads `useLocation()`. Alternatively, have `useUrlHash` read `window.location.hash` in the render phase or in a module-level snapshot taken before the first commit.

### [MEDIUM] The command palette loses Escape, Tab and the hotkeys as soon as the focus leaves its input

**Where:** `apps/lab/src/palette/CommandPalette.tsx:127-138, 189-199`; `apps/lab/src/App.tsx:86-93, 162-176, 199-210`

**What:** All of the dialog's key handling is on the `<input>` (`onKeyDown={onKeyDown}`). Each row is `tabIndex={-1}`, so a mouse click focuses it. Clicking a row that does nothing leaves the focus on that row's `div`: `choose()` returns early for disabled rows, and the palette stays open. Clicking the footer or the empty-state text leaves the focus on `<body>`. A key pressed from either place never reaches the input's handler. It bubbles to the document listeners instead, and `isHotkeyRefused` lets it through because the target is not a field.

**Failure scenario:** With no run in flight, press ⌘K and click the disabled "Abort" row, then press Escape. The palette stays open, and `useDrawerKeys` closes the report drawer or the settings drawer behind it. Pressing `g` starts a carve and `f` toggles solo while an `aria-modal` dialog is on screen, and Tab walks into the page behind the modal.

**Suggested fix:** Add `onMouseDown={e => e.preventDefault()}` on the rows, which keeps the focus in the input. Also move the Escape/Tab handler to the `role="dialog"` frame, or add a `focusin` guard that sends the focus back to the input.

### [MEDIUM] In the simple view the size rows show the recipe, while Generate carves the knobs: the two can disagree

**Where:** `apps/lab/src/simple/SimplePanel.tsx:23-36`; `apps/lab/src/state/ui.slice.ts:129-132`; `apps/lab/src/shell/TopBar.tsx:20-21, 58`; `apps/lab/src/App.tsx:276`; `apps/lab/src/library/BoardColumn.tsx:105-120`

**What:** `SizeRow` displays `state.recipe.value[side]`, but a run uses `params.values` (`useRun.ts:36`). Only the page-load effect writes the recipe into the knobs: `applyRecipe(false)`, and only when the page did not open on a link. `setMode('simple')` just stores the mode, and so do the palette's view toggle, "Load into lab" and a pasted link. None of them brings the recipe and the knobs back into agreement.

**Failure scenario:** In the advanced view, pick the Insane 1000×1000 preset, then switch to Simple. The size rows read 25 and 50 (the recipe), the top bar reads `1000×1000` (the knobs), and Generate carves 1000×1000 with the default "random" setting off. A page that opens on a link in the simple view shows the same disagreement.

**Suggested fix:** When the view switches to simple, either call `applyRecipe(false)`, or show the knobs' own W/H in the size rows (writing a size through the recipe still re-applies it). Pick whichever matches the intended parity with the old lab.

### [MEDIUM] In Polish, typing a decimal with a comma does nothing, and the page itself shows commas

**Where:** `apps/lab/src/console/DraftNumber.tsx:56-60, 86`; `apps/lab/src/console/KnobRow.tsx:116-126`; `packages/engine/command.ts:640-647`

**What:** `commit()` parses with `Number(raw.trim())`, so `Number('0,5')` is `NaN`, and `!Number.isFinite(typed)` returns without committing. Meanwhile the PL page prints the row's ends and its title through `dict.fmt` (`endText`, `rowTitle`), which in Polish shows `0,2`–`0,9`. `inputMode="decimal"` brings up a keypad whose separator follows the locale, which is `,` on a Polish phone.

**Failure scenario:** A Polish user opens the line-width entry, types `0,35` and presses Enter. The value stays where it was, and nothing says why. On a PL mobile keypad no fractional value can be entered at all, for any view field or fractional knob (stroke, head width and height, shares, point radius).

**Suggested fix:** Normalise the input with `raw.trim().replace(',', '.')` before `Number()` in `DraftNumber.commit`. It is the one entry point for every row, so a single change covers them all.

### [MEDIUM] A link's theme, palette, paper and ink cannot clear the page's own on a hash change, so Back or paste shows the wrong colours and rewrites the entry

**Where:** `apps/lab/src/state/url.ts:72-80, 151-154`; `apps/lab/src/state/useUrlHash.ts:55, 60, 64-65, 180-185`

**What:** The encoder writes `theme: ''` for "no theme" and omits an empty palette, paper or ink. The decoder turns `''` into `undefined` and an absent key into `undefined`, and `applyPayload` leaves the store unchanged for `undefined`. A fresh page load is unaffected, because these fields start empty and are never stored. On `hashchange`, though, the page keeps colours the link did not have.

**Failure scenario:** The page shows `#A` (no theme). The user pastes a link `#B` that uses the `dark` theme and a custom palette, which pushes a new entry. Pressing Back fires `hashchange` with `#A`: the knobs return to A, but the theme and palette stay B's. The subscription then rewrites entry A with B's colours through `replaceState`, so A's colours are lost for good. The same happens when a colourless link is pasted into a tab that has a theme.

**Suggested fix:** Decode an explicit `theme: ''` as `''` rather than as absent. On the encoding side, write `palette: []`, `paper: ''` and `ink: ''` explicitly once any colour field has ever been set, or add a version marker, so that "no palette" can be told apart from "the link predates palettes". Then apply those fields on `hashchange`.

### [MEDIUM] A head height of 0, which the slider offers, does not survive the hash (or a reload)

**Where:** `apps/lab/src/state/url.ts:131, 141-143`; `packages/engine/command.ts:626-629`; `packages/cli/store.ts:59-64`

**What:** `VIEW_RANGE.headHeight` is `{ min: 0, max: 1.2 }`, and the comment there says "0 is a tip of no height at all, which the prose documents on purpose", so the slider reaches 0. The decoder drops it: `headHeight: height !== undefined && height > 0 ? height : undefined`. The store's `fillView` does the same.

**Failure scenario:** Set the head height to 0 and reload, or share the link. The page comes back with the default head height (`DEFAULT_HEAD_HEIGHT`), while the command shown before the reload said `--arrow-height=0`. A stored board's view edited to 0 comes back from the store at the default as well.

**Suggested fix:** Mark links written by this lab (for example a version field in `__view`) and apply the "0 means automatic" exception only to unversioned, legacy links. Apply the same rule to store metas, using `updatedAt` or a schema field.

### [LOW] Palette rows show English "on"/"off" in the Polish UI

**Where:** `apps/lab/src/palette/commands.ts:115`

**What:** `value: state.view[flag.flag] ? 'on' : 'off'` is a literal. The dictionary has `valueOn` / `valueOff` (`wł.` / `wył.`, lab-i18n.ts:815-816), and `FlagRow` uses them (ViewPanel.tsx:220).

**Failure scenario:** In PL, ⌘K → "zaokrąglone" shows `on` in the value column.

**Suggested fix:** `deps.dict.t(state.view[flag.flag] ? 'valueOn' : 'valueOff')`.

### [LOW] A lab-authored English reason reaches the Polish status line

**Where:** `apps/lab/src/library/useStoredBoard.ts:48`

**What:** `boardFailed({ name, reason: 'not in the store' })` is a literal that the lab wrote itself, not an error from the server, and it is printed inside `boardFileError`'s Polish sentence.

**Failure scenario:** In PL, a stale `/boards/25x50/sha256-…` link prints a Polish sentence ending in "not in the store".

**Suggested fix:** Add a dictionary key, or a `kind` on `BoardError` that the dictionary renders.

### [LOW] Editing a stored board's view clears its `aborted` flag in the store

**Where:** `apps/lab/src/library/useViewSave.ts:71-76`; `packages/cli/store.ts:138` (`aborted: metrics.aborted ?? false`)

**What:** The store's comment says an absent figure "keeps the stored value", but `aborted` is not kept: it defaults to `false`. The lab cannot send it, because `StoreRequest['metrics']` has no `aborted`.

**Failure scenario:** A CLI run that hit its time budget is stored with `aborted: true`. In the lab, change its line width. The meta is rewritten with `aborted: false`, and the recipe loses the fact that the run was cut short.

**Suggested fix:** Use `metrics.aborted ?? replaced?.aborted ?? false` in `store.ts`.

### [LOW] A pending view save for board A is dropped if board B is edited within 350 ms

**Where:** `apps/lab/src/library/useViewSave.ts:19, 53-57`

**What:** There is one timer for the whole module. `clearTimeout(timer)` for B's edit cancels A's scheduled `write(…, editedA, …)`. The code captures the edited board carefully, but a second board's edit still cancels the first board's write.

**Failure scenario:** Change A's stroke, click B's row (a local store answers quickly) and nudge B's slider within 350 ms. A's edit is never posted. Reopening A shows its old view. PLAUSIBLE in practice: it takes fast hands.

**Suggested fix:** Key the timers by `meta.id`, or flush the pending write immediately when the next edit belongs to another board.

### [LOW] SVG export silently drops a custom palette, paper and ink; the note appears only for a theme

**Where:** `apps/lab/src/run/ExportButtons.tsx:89, 115`; `apps/lab/src/library/BoardColumn.tsx:166, 215`; `packages/engine/command.ts:252-262`

**What:** `svgOptions` carries no colour fields, and the "keeps the golden-angle colours" note is shown only when `theme !== ''`.

**Failure scenario:** With no theme, add a palette of 3 colours and a dark paper, then download the SVG. The file has the default colours, and no note says so.

**Suggested fix:** Show the note whenever `theme !== '' || palette.length > 0 || paper !== '' || ink !== ''`, and widen its wording.

### [LOW] An unknown theme name from a link is stored but shown as "none"

**Where:** `apps/lab/src/state/url.ts:151`; `apps/lab/src/console/ViewPanel.tsx:319-326`; `apps/lab/src/run/ExportButtons.tsx:115`

**What:** The decoder accepts any non-empty string, and the store keeps it. The `<select>` has no matching option, so it shows its first option, "no theme". The export note still appears, because `theme !== ''`, and the hash keeps the bad name forever.

**Failure scenario:** `…"theme":"drak"…` gives a board in default colours, a selector saying "none", and a note about a theme.

**Suggested fix:** Validate against `THEMES` (`themeOf(raw.theme) ? raw.theme : undefined`) in `decodeHash`.

### [LOW] `voids` is a visible switch but is not in the link

**Where:** `apps/lab/src/state/url.ts:6-36`; `apps/lab/src/console/ViewPanel.tsx:507`

**What:** The switch is not written to the hash, so a reload or a shared link turns it back on. The run-triggers plan (Ruling 7) documents this as deliberate, to keep old links compatible. It is listed because it is a real round-trip loss for a control the user can see.

**Suggested fix:** Add `voids` to `__view`, read as absent → `true`, which old links tolerate, or state in the UI that the switch is not shared.

### [LOW, PLAUSIBLE] The generator worker's handlers do not check which worker is speaking, and a failed worker load leaves the page stuck in "running"

**Where:** `apps/lab/src/worker/useGenerator.ts:45-81, 91-95`

**What:** (a) `made.onmessage` never checks `made === worker.current`. The HTML spec's terminate steps empty the port's message queue, but a message already queued as a task when `kill()` runs could still be delivered. A stale `done` would then run `completeRun` against the new run's `params` (the wrong board shown as the new run's), or throw `'a run finished that was never started'` after an abort. (b) `onerror` marks the run failed but keeps the broken worker in `worker.current`. If the module worker failed to load (for example a chunk 404 after a deploy), the next `start()` posts to a dead worker, and the slice stays `running` until Abort is pressed.

**Suggested fix:** Guard both handlers with `if (worker.current !== made) return`, and call `kill()` in `onerror`.

### [LOW, PLAUSIBLE] Downloads revoke the object URL synchronously and start outside the click

**Where:** `apps/lab/src/run/download.ts:13-15`; `apps/lab/src/run/drawSvg.ts:31`

**What:** `anchor.click(); anchor.remove(); URL.revokeObjectURL(url)`. Some engines resolve the download asynchronously, which is why FileSaver.js delays the revoke. The SVG path also calls this from a worker callback, long after the user's click, although ExportButtons.tsx:27-29 itself says "a download has to start in its click". Neither behaviour was reproduced here.

**Suggested fix:** Revoke on a timer (`setTimeout(() => URL.revokeObjectURL(url), 0–1000)`), and test the SVG export in Safari and Firefox.

### Checked and fine

- `useRun` / `useAutoRun`: the single `hold` slot, the recipe "debt", the refused start clearing the timer, and `auto` read both at the edit and at the timer.
- `params.slice`: `set`/`setMany`/`setStart`/`reset` count edits only for hand edits, `clampParam` handles non-finite values and snapping, the indexes are sparse, and `straightFloor`. The `mix` row's `START.mix` bounds agree with `MIX_SHARE` and the `startPair` rule, and the `LengthMix` cap matches the engine's `sharesSum` (0.9 + 1e-9).
- `ChoiceKnob` choices cover every step of `trapBias` and `giantSpacing`.
- `url.ts` / `useUrlHash`: the read happens once under StrictMode, the write is debounced, `hashchange` is idempotent against the store, `history.state` is kept, `carried.tab` makes the round trip, the palette is hex-filtered and lower-cased, and `showPoints` and `pointRadius` make the round trip.
- `result.slice`: late store and export answers are dropped by file identity, and the baseline advances only past a result with metrics. `completeRun` is atomic.
- `useStoredBoard`: cancellation, all five exits that clear `loading`, and no refetch of a board already drawn. `useLibraryList`: a dropped answer ends the wait. `notices.ts` takes back only its own notice. The delete cancels a pending view save and uses the listed directory.
- `ExportButtons`: layout-hash races (the `ignore` flag plus the file comparison), one drawing at a time, and the worker is terminated on unmount.
- `api/boards.ts`: every call resolves (never rejects), the 201 body is guarded, and a 404 on delete counts as an outcome.
- `ReportPanel` / `StatsTable` / `ReportSummary` / `StoredFacts`: routed by the tab, not by whether a preview exists, and deltas are keyed by row index.
- `BoardFrame`: colour overrides are added only when set, the preview is gated on the tab, and the focus moves when solo turns on. `Stage`, `SheetBar`, `RunColumn` and `ClampNotice` land the focus sensibly when a drawer closes or a button is disabled.
- `PresetStrip`, `MoreMenu`, `TopBar`: Escape is consumed in the capture phase only for keys pressed inside them, and the outside-press and focus-out listeners are cleaned up.
- `GroupRail`, `BoardsRail`, `TabRow`, `Segmented`: focus follows the selection only while the list already holds the focus.
- `storage.ts` never throws. `recipe.slice` writes inside the updater. The initial state of the `ui.slice` drawers respects the band.
- A script comparison of `EN` and `PL` string leaves in `lab-i18n.ts` found only intentional loanwords (`CLI`, `menu`, `generator`, `element`, `preset`). Dictionary keys are type-checked.

## Feature parity: engine and arrowz-board vs lab

Audited read-only at `/Users/tomek/dev/arrowz-review` (HEAD `b9a5a9d`). Every path below is relative to that root. When this report says "no", the grep that returned nothing is shown. All greps were run over `apps/lab/src` with test files and fixtures excluded (`grep -rn ... | grep -v '\.test\.\|fixtures'`).

Summary: the lab exposes **every generator knob** and **every picture flag**. The gaps are elsewhere: (a) the board element's interaction and game surface (`play`, `interactive`, events, methods), (b) about a third of the engine's metrics and carver diagnostics, (c) reading a CLI command or a board file back in, and (d) the CLI's batch and measurement modes. One real bug came out of the duplication check: the element's own colour button and the lab's `colored` switch can disagree.

### Engine parameters

All 28 `PARAM_SPEC` rows (`packages/engine/engine.ts:2374-2716`) are drawn generically. `RAIL_GROUPS` comes from `PARAM_SPEC` (`apps/lab/src/state/ui.slice.ts:9`). `KnobPanel` renders every spec of a group (`apps/lab/src/console/KnobPanel.tsx:12-14,112-122`). `Knob` dispatches `choice` vs `number` (`apps/lab/src/console/Knob.tsx:12-16`), and the two `surface: 'start'` knobs become one `StartKnob` (`KnobPanel.tsx:115-116`, `StartKnob.tsx:1-19`). The ⌘K palette also has a row for every spec (`apps/lab/src/palette/commands.ts:65`). Ranges and steps are the engine's own through `clampParam`/`validateParams` (`apps/lab/src/state/params.slice.ts:1-12,33-53`). So the table below is complete by construction.

| Group | Key (CLI flag) | Range / default | In lab? | Where |
|---|---|---|---|---|
| board | `W` (`--width`) | 4..1000 / 25 | yes | Advanced: board group. Simple: `SizeRow side="W"` (`simple/SimplePanel.tsx:139`) |
| board | `H` (`--height`) | 4..1000 / 50 | yes | as above (`SimplePanel.tsx:140`) |
| board | `seed` | 0..2³²−1 / 7 | yes | knob + `SeedRow` (`SimplePanel.tsx:39-42,144`), "New seed" palette command (`palette/commands.ts:171`) |
| lengths | `wShort`, `wMid` | 0..0.9 / 0.2, 0.08 | yes | knobs + `LengthMix` bar (`console/KnobPanel.tsx:29-57`) |
| lengths | `Lmax` | 0(auto)\|17..5000 / 0 | yes | knob with `auto` chip (`console/ValueKnob.tsx` via `wordFor`), release target 17 (`console/knobLayout.ts` `RELEASE_TO`) |
| lengths | `backbite` | 0..8 / 0 | yes | generic knob |
| shape | `pStraight` | 0.6..1 / 0.85 | yes | knob; the moving `straightFloor` is shown as `floor` (`state/params.slice.ts:51`) |
| shape | `wLateral`, `warns`, `anticoil` | see spec | yes | generic knobs |
| difficulty | `headBias` + `mix` (`--start`) | layers/random/tunnels \| 0.3..0.7 | yes | `StartKnob` from `START_CHOICES` (`console/StartKnob.tsx:2,67`) |
| difficulty | `trapBias` | avoid/off/seek | yes | `ChoiceKnob` (`control.kind === 'choice'`) |
| difficulty | `probe`, `probeLen` | 0..1 / 0; 4..200 / 12 | yes | `probeLen` sits in the dependency block (`console/knobLayout.ts` `BLOCKS.difficulty`) |
| skeleton | `giants`, `giantSpan`, `giantStep`, `giantJitter`, `wGiant`, `giantStraight`, `giantAnticoil`, `giantSpacing` | see spec | yes | dependency block with two parents (`knobLayout.ts` `BLOCKS.skeleton`); `giantSpacing` as a choice |
| closing | `headTries`, `absorbLimit`, `maxBack`, `restarts` | see spec | yes | generic knobs |
| — | `INACTIVE_REASONS`, `RULES`/`RULE_REASONS`, `Violation.need` | — | yes | `indexesOf` (`state/params.slice.ts:33-53`); `console/Violations.tsx`, `console/violationCounts.ts` |

Picture flags (`VIEW_RANGE`, `packages/engine/command.ts:608-632`; `PICTURE_FLAGS` `:289-297`):

| CLI flag | View field | In lab? | Where |
|---|---|---|---|
| `--cell` | `cell` | yes | `ViewPanel.tsx:529-530` (Export section). The stored view overrides it with `exportCell` (`App.tsx:54`), which is intentional per the comment at `App.tsx:48-53` |
| `--line` | `stroke` | yes | `ViewPanel.tsx:487` |
| `--arrow-width` | `headWidth` | yes | `ViewPanel.tsx:488` |
| `--arrow-height` | `headHeight` | yes | `ViewPanel.tsx:489`. The URL decoder drops `headHeight=0` although 0 is in range (`state/url.ts:141-143`); the comment there says this is intentional, for legacy links |
| `--colored` | `colored` | yes | `ViewPanel.tsx:491` |
| `--sharp` | `rounded` | yes | `ViewPanel.tsx:490` |
| `--top` | `top` (+ lab-only `hilite`) | yes | `ViewPanel.tsx:494-503`, folded by `viewOf` (`state/view.slice.ts:104-114`) |

Simple-view vocabulary (`packages/engine/lab-simple.ts`):

| Capability | In lab? | Where |
|---|---|---|
| `--length` / `--winding` sliders (`SIMPLE_SLIDERS`) | yes | `PositionSlider slider="lengths"/"shape"` (`simple/SimplePanel.tsx:141-142`) |
| `--skeleton` | yes | `SkeletonRow` over `SIMPLE_CHOICES.skeleton` (`SimplePanel.tsx:46-65`) |
| `--randomized` | yes | `RandomRow` (`SimplePanel.tsx:82-106`), drawn with `Math.random` in `applyRecipe` (`simple/applyRecipe.ts:18`) |
| `drawParams().moved` (notes about knobs the draw moved) | no, intentional | `applyRecipe.ts:14` says "The draw's moves are not reported (Ruling 5)". The CLI prints them (`packages/cli/carve.ts` `noteMoves`) |
| Pins (a knob that wins over its bundle) | n/a | The lab keeps no everyday flags in its state. The advanced view edits the knobs themselves, and `buildCommand` prints knob flags only (`packages/engine/command.ts:510-537`) |

### Engine capabilities beyond parameters

| Capability | Source | In lab? | Where / evidence | Intentional? | Value of adding |
|---|---|---|---|---|---|
| `generate` with `trace` progress | `engine.ts:3003`; `types.ts:49-58` | yes | `worker/generate.worker.ts:24` posts `progress`; status bar | — | — |
| Abort that keeps the partial board (`GenerateAbort` → `aborted: true`, board carved so far) | `engine.ts:2986-2991,3026-3027,3071` | **no** | The lab's Stop terminates the worker (`worker/useGenerator.ts:97-100`), so nothing comes back. `grep -rn "GenerateAbort" apps/lab/src` returns nothing | No decision found. The CLI does keep it (`CARVE_TIMEOUT_S`, `carve.ts:69-88`) | Medium. Seeing where a slow board jammed is the point of a lab. A "Stop and show" could throw `GenerateAbort` from `trace` on a flag the page sets |
| `debug` hook (`GIANT_DEBUG`) | `types.ts:52` | no | `grep -rn "debug" apps/lab/src/worker` returns nothing | Developer-only | Low |
| `voidFrac`, `ruleB`, `unchecked` | `types.ts:50-57` | no | test-only by their own doc comments | yes | none |
| `Metrics` shown: N, maxLen, hist, f0, almost, D, meanCorridorLen, span, spanTop10, spanMax, outDeg, maxOut, blockDist, bends, coil, sharedBorder, multiLine | `lab-report.ts:127-198` | yes | `report/StatsTable.tsx:51`, `report/ReportSummary.tsx`, with deltas through `reportDelta` | — | — |
| `Metrics` not shown: `solvable`, `unsolved`, `T2`, `selfAdj`, `bendsPerCell`, `neighbours`, `longPieces`, `minLen`, `coverage` | `types.ts:169-196` | **no** (`solvable` partially: a deadlock gets its own status line, `stage/useRunState.ts:197`) | `for k in solvable unsolved T2 selfAdj bendsPerCell neighbours longPieces minLen coverage; do grep -rln "\b$k\b" apps/lab/src \| grep -v test; done` finds nothing for any of them. `packages/cli/report.ts` prints all but `unsolved` and `longPieces` (coverage/solvable, `minLen..maxLen`, `T2`, WRAPPING line) | No decision found. `reportRows` was ported from the old lab's 23 rows (lab spec §2.1 row 9), and `report.ts` was never mirrored | Medium. `T2`, `minLen` and the WRAPPING trio are what `report.ts` uses to tune shape. Cheap: add rows to `lab-report.ts` plus i18n keys |
| `CarverStats` shown: `stall`, `got/want`, `absorbs/absorbed` | `lab-report.ts:175-188` | yes | — | — | — |
| `CarverStats` not shown: `backbites`, `backbiteGiveUps`, `stallOwn/Foreign/Edge/Len/SelfTrap`, `strandTrunc/strandLoss`, `headScans/headScanHits`, `absorbScanned` | `types.ts:102-124` | **no** | same grep loop, nothing found. Outside the engine only `engine/scripts/measure-r*.ts` read them; `report.ts` prints `strandTrunc` | Probably an oversight. The `backbite` knob is in the lab, but its effect counter is not | **High for `backbites`/`backbiteGiveUps`**: the lab offers a knob whose effect it cannot report. Medium for the stall breakdown |
| `Stuck` (`remaining`, `sizes`, `heads`) | `types.ts:198-202` | partial | `remaining` and `sizes` in the not-closed status (`stage/useRunState.ts:202-203`); `heads` unused (`grep -rn "\.heads" apps/lab/src` finds nothing). `report.ts` prints the legal heads and a size histogram | No decision found | Low-medium |
| `longestSummary` | `engine.ts:2205-2235` | yes | `report/LongestTable.tsx:19` | — | — |
| `fingerprint` | `engine.ts:3087` | no | `grep -rn "fingerprint" apps/lab/src` finds nothing outside tests. `BoardMeta.fingerprint` is stored but never shown | Low | Low (determinism check against the CLI) |
| `layoutHash` | `board-file.ts:228` | yes | names the board-file download (`run/ExportButtons.tsx`); `meta.id` shown in the library (`library/BoardColumn.tsx:178`) | — | — |
| `encodeBoard` / `decodeBoard` | `board-file.ts:152,333` | yes, but only worker ↔ page and store → page | `worker/generate.worker.ts:1,43`; `library/useStoredBoard.ts` | — | — |
| Opening a `.board.json` from disk | (`decodeBoard` exists) | **no** | `grep -rn 'type="file"\|FileReader\|onDrop' apps/lab/src` finds nothing | Not recorded | Medium. The lab can download a board file (`ExportButtons.tsx`) but cannot open one. A board made elsewhere (`carve --dry-run` does not store) can only be viewed through the store |
| `toSvg` | `engine.ts:2278` | yes | `drawSvg` in its own worker (`run/drawSvg.ts`, `generate.worker.ts:13`) | — | — |
| SVG with theme / palette / paper / ink / points | `SvgOptions` has no colour fields (`types.ts:225-238`) | no | The warning shows **only for a theme**: `theme === '' ? null : svgThemeNote` (`run/ExportButtons.tsx:115`, `library/BoardColumn.tsx:215`) | Theme loss is intentional (colours spec §6: "SVG export still does not reproduce a theme"). A custom palette, paper or ink is lost **silently** | Medium: at least widen the note's condition to `palette.length > 0 \|\| paper !== '' \|\| ink !== ''`. Full fix: a palette/colours field on `SvgOptions` |
| `buildCommand` (live command) | `command.ts:510` | yes | `run/LiveCommand.tsx` |
| `parseArgs` (command → state) | `command.ts:663` | **no** | `grep -rn "parseArgs" apps/lab/src` finds nothing | Not recorded. The header at `command.ts:9-10` says "The lab has to mirror the CLI 1:1, so both sides build **and read** the text with this code" | **High**. Pasting a `deno task carve ...` line (from a stored meta, a terminal, a colleague) into ⌘K or the command box would close the loop. It also comes with the parser's own error messages |
| `helpText` / `KNOB_ROWS` / `RULE_ROWS` | `command.ts:358,412,424` | yes | `/docs` CLI page calls `helpText()` and `helpText({knobs:true})` (`routes/CliDocs.tsx:19-20`) |
| `storeRequest` | `command.ts:543` | yes | `App.tsx:56` (auto-save after each run), `library/useViewSave.ts` |
| Presets `PRESETS` / `findPreset` | `lab-presets.ts:19,64` | yes | `run/PresetStrip.tsx:138`, palette (`palette/commands.ts:127`) |
| Report `reportRows` / `reportDelta` / `genSeconds` / `pct` | `lab-report.ts` | yes | `report/StatsTable.tsx:51-54`, `report/StoredFacts.tsx` |
| Element docs `ELEMENT_PROPS/MEMBERS/EVENTS` | `lab-docs.ts:43-81` | yes | `routes/ElementDocs.tsx` |
| Game reducer `newSession`, `play`, `goneIds`, `saveSession`, `loadSession` | `game.ts:45-155` | **no** | `grep -rn "newSession\|goneIds\|saveSession\|loadSession" apps/lab/src` finds nothing. The element wraps these too, and the lab uses none of them (see next section) | The Angular game (step 4) is out of scope (lab spec §1). Playing a board in the lab was never explicitly refused | See the `play` row below |
| `presetParams` (app entry point) | `lab-simple.ts:443` | n/a | The lab uses `simpleParams` directly (`applyRecipe.ts:18`), which is equivalent | yes | — |
| Board store: list / read / save / delete | `packages/cli/store.ts:109,196,212`; `store-server.ts:262-289` | yes | `api/boards.ts:23,38,48,91` |
| Stored meta not shown: `sources` (recipes), `fingerprint`, `boardBytes`, `aborted`, `updatedAt`, `stuck`, `svg` | `types.ts:303-337` | no | `grep -rn "sources\|boardBytes\|updatedAt" apps/lab/src` finds nothing outside tests and fixtures | **`sources` is intentionally deferred** (lab spec §12 "Recipes in the library"). No decision found for the rest | Medium for `sources` (already planned); low for the rest |

### arrowz-board API

Source: `packages/board-element/src/arrowz-board.ts` and `mod.ts`, plus `README.md:24-70`. The lab's single use site is `apps/lab/src/stage/BoardFrame.tsx:123-133`, through `stage/BoardCanvas.tsx`.

| Kind | Name | In lab? | Where / evidence | Intentional? |
|---|---|---|---|---|
| property | `board` | yes | `BoardFrame.tsx:124` | — |
| property | `view` | yes | `BoardFrame.tsx:125`, built by `boardViewOf` + palette/paper/ink overrides (`:62-83`) | — |
| view field | `stroke`, `headWidth`, `headHeight`, `rounded`, `colored`, `top`, `voids` | yes | via `boardViewOf` (`board-element/src/view.ts:50-60`) | — |
| view field | `ink`, `paper`, `palette` | yes | `BoardFrame.tsx:62-70`; `ViewPanel.tsx:432-456` | — |
| view field | `highlight` (colour of `top` pieces) | **no** (only through a theme) | `grep -n "highlight" apps/lab/src/state/view.slice.ts` finds only a comment (`:101`). The element demo has a control for it (`demo/controls.ts:185-191`) | No decision found. `ink` and `paper` got overrides in the colours spec, `highlight` did not | Low-medium: one more `ColourRow`, same pattern as ink |
| attr/prop | `theme` | yes | `BoardFrame.tsx:129`; `ViewPanel.tsx:319` over `THEMES` | — |
| attr/prop | `enable-colors` | yes, always on | `BoardFrame.tsx:128` | yes |
| attr/prop | `lang` | yes | `BoardFrame.tsx:127` | — |
| attr/prop | `show-points`, `point-color`, `point-radius` | yes | `BoardFrame.tsx:130-132`; `ViewPanel.tsx:508-527`, clamped to `POINT_RADIUS_RANGE` (`state/view.slice.ts:151-158`) | — |
| attr/prop | `pad` | **no** (default 4) | `grep -n "pad" apps/lab/src/stage/BoardFrame.tsx` finds nothing | No decision found | Low |
| attr/prop | `interactive` | explicitly `false` | `BoardFrame.tsx:126` | Contradicts the game spec: "The React lab of step 3 inspects boards this way" (`docs/superpowers/specs/2026-09-10-board-game-design.md:84-87`) | Medium: clicking a piece to see its length, direction and blockers is a natural lab tool |
| attr/prop | `play` | **no** | `grep -rn "play=" apps/lab/src` finds nothing | Not recorded. The game is step 4, but trying a board by hand is a tuning aid, not "the game" | **Medium-high**: difficulty knobs (`trapBias`, `headBias`, probes) are judged by feel, and the element already does all the work (`play`, `life-lost`, `finished`) |
| getter | `viewport` | no | `grep -rn "viewport" apps/lab/src --include=*.tsx`: only the declared event mapping | — | Low |
| getter | `pieceCount`, `gestureMode` | no | `grep -rn "pieceCount\|gestureMode" apps/lab/src` finds nothing | — | none |
| method | `fit()`, `zoomBy()` | no, but the element's own ⤢ / + / − buttons are shown | element chrome (`arrowz-board.ts:398-401`). Lab spec §12 dropped the mock's zoom triplet because the element's bar cannot be hidden | yes | none |
| method | `animateExit`, `shake`, `saveState`, `loadState`, `restart` | no | `grep -rn "saveState\|loadState\|animateExit\|shake(\|restart()" apps/lab/src` finds nothing | Only meaningful with `play` | Follows `play` |
| method | `emit` | no | internal to `GameTarget` | yes | none |
| event | `piece-click` | **mapped but never listened to** | `onPieceClick` declared in `stage/BoardCanvas.tsx:17`, never passed (`grep -rn "onPieceClick" apps/lab/src` finds only that line). It could not fire anyway with `interactive={false}` | Half-built | Follows `interactive` |
| event | `viewport-change` | mapped, never listened to | `BoardCanvas.tsx:18`; no other hit | — | Low (a zoom readout) |
| event | `piece-removed`, `life-lost`, `finished` | no | not mapped in `BoardCanvas.tsx` | Only with `play` | Follows `play` |
| CSS custom property | `--arrowz-paper` (announced, set on the host) | yes | read by the lab frame (`design/shell.css:381-394`; `BoardFrame.tsx` comments) | — | — |
| parts / slots | none exist | — | `grep -rn "part=\|<slot\|::part" packages/board-element/src/*.ts` finds nothing | — | — |
| exports | `THEMES`, `themeOf`, `DEFAULT_VIEW`, `POINT_RADIUS_RANGE`, `DEFAULT_POINT_*`, `boardViewOf` | yes | `console/ViewPanel.tsx:1`, `state/view.slice.ts:1`, `stage/BoardFrame.tsx:1` | — | — |
| exports | `assignPalette`, `labelsFor`/`BOARD_LABELS`, `GameHost`, `EXIT_*`, `MAX_CELL_PX`, `MIN_POINT_CELL_PX`, `GESTURE_STORAGE_KEY` | no | `grep -rn "assignPalette\|labelsFor\|GameHost\|MIN_POINT_CELL_PX" apps/lab/src` finds nothing | Not needed by a host | none, except `MIN_POINT_CELL_PX` (see gap 9) |

Documentation drift, outside the lab: the element README's API tables omit `pieceCount` and `emit`, which `lab-docs.ts:61-73` lists, and type `board` as `Board | null` (`README.md:28`) rather than `BoardData | null`. `lab-docs.ts:44-47` records the second point and leaves it to the element package.

### CLI-only capabilities

| CLI capability | Where | In lab? | Notes |
|---|---|---|---|
| `--count=N`, `--max-seeds=M` (batch of closed boards over seeds) | `command.ts:285-286`; `carve.ts:13-23` | no | Useful for filling the library. Medium value |
| `--dry-run` (one JSON line with metrics, pins, fingerprint) | `carve.ts:500-526` | n/a | The lab's report covers the human side; the fingerprint is not shown |
| `--svg[=path]` writes an SVG preview **into the store** | `carve.ts` `saveBoard({... svg})` | partial | The lab only downloads. Its store writes carry no SVG (`App.tsx:56`, `StoreRequest` has no `svg`, `types.ts` `StoreRequest`), and it never shows a stored `meta.svg` |
| `CARVE_TIMEOUT_S` (abort and keep the partial board) | `carve.ts:69-88` | no | See the `GenerateAbort` row |
| `CARVE_TRACE` | `carve.ts` | yes, as the progress display | — |
| `GIANT_DEBUG` | `carve.ts`, `report.ts:55` | no | developer-only |
| `note: ... is pinned` / `has no effect here` / `moved from` | `carve.ts` pin loop, `noEffect`, `noteMoves` | partial | Inactive reasons: yes. Moves: no (Ruling 5, `applyRecipe.ts:14`) |
| `--top` per-piece printout incl. `cols`, `rows`, `bends` | `carve.ts:539-575` | partial | The lab's `LongestTable` shows `longestSummary` (len, box, span, density, coil) and no bends / cols / rows |
| `deno task report`: levels × formats × `--runs`, averages, STUCK histogram, `--mid`, `--only`, `--square/--portrait`, `--show` (ASCII render) | `packages/cli/report.ts:1-16,108-311` | no | A **closing rate over N seeds** is the one number the lab cannot produce. High value for tuning; the lab measures one seed at a time |
| `deno task report --bench=N` (p50/p90/p99 time, backtracks, failures) | `report.ts:137-183` | no | Medium |

### Gaps worth closing (ranked)

1. **Read a command back in (`parseArgs`)**: paste a `deno task carve …` line into ⌘K or the command box and load it. The engine header already promises this (`command.ts:9-10`). The parser and its error messages exist. Nothing in the lab calls them.
2. **Try the board by hand (`play`)**: turn on `play` (and `interactive`), then listen to `life-lost` and `finished` for a lives/moves readout and offer `restart()`. All of it is already in the element. The lab passes `interactive={false}` (`BoardFrame.tsx:126`) and maps no game events.
3. **Closing rate over N seeds**: a lab version of `report.ts` (run K seeds in the worker, report closed/deadlocked/jammed and mean metrics). Today this is terminal-only, and it is the measurement most tuning decisions rest on.
4. **Report the missing statistics**: `backbites`/`backbiteGiveUps` (the lab has the `backbite` knob but no way to see what it did), `T2`, `minLen`, `coverage`/`solvable`, `bendsPerCell`/`selfAdj`/`neighbours`, and `stuck.heads`. These are extra rows in `lab-report.ts` plus i18n keys. The data already crosses the worker boundary (`WorkerOut.done.stats`, `metrics`).
5. **Fix the colour-button split** (a bug, see Duplication 1).
6. **Stop and show**: abort through `GenerateAbort` in the worker's `trace` so the partial board comes back (`aborted: true`), as `CARVE_TIMEOUT_S` does in the CLI.
7. **Warn on every colour the SVG drops**: widen the export note beyond `theme` (`ExportButtons.tsx:115`, `BoardColumn.tsx:215`). The better fix is to teach `toSvg` the palette, paper and ink.
8. **Open a `.board.json` from disk**: file input or drop → `decodeBoard` → show and optionally store.
9. **Smaller items**: a `highlight` colour row; `pad`; recipes (`BoardMeta.sources`, already deferred in lab spec §12); showing `fingerprint`; a batch "fill library" (`--count`); say in the UI that the point grid hides below `MIN_POINT_CELL_PX` (a known trap, recorded in the colours work).

### Duplication

1. **Two colour toggles that can disagree (real defect, found by reading the code, not reproduced in a browser).** The lab passes `enableColors` (`BoardFrame.tsx:128`), so the element draws its own ◑ button (`arrowz-board.ts:402-412`). Clicking it sets the internal `coloredOverride` (`:410`), and from then on the element's colour comes from `coloredOverride ?? view.colored` (`:583`). `coloredOverride` is reset only in the constructor (`:282`) and by `loadState` (`:555`). The lab never listens to or resets it (`grep -rn "coloredOverride" apps/lab/src` finds only test files, which read the button's `aria-pressed`). After one click on ◑, the lab's own `colored` switch (`ViewPanel.tsx:491`) stops changing the board on screen, while the live command (`LiveCommand.tsx`), the stored view (`App.tsx:54`) and the SVG export (`ExportButtons.tsx`) still follow the lab switch. Fix options: let the element hide its colour button (the "configurable control bar" already deferred in lab spec §12), or have the lab listen for the change and write it back to its state. The element emits no event for it today, so that needs a new event.
2. **The CLI's `--top` printout re-implements `longestSummary`.** `carve.ts:539-575` recomputes the bounding box, density and coiling that `engine.ts:2205-2235` already computes, and adds bends, cols and rows. The two now show different columns for the same "longest pieces" idea. This is CLI-side duplication, not the lab's.
3. **The element demo keeps its own view bounds.** `packages/board-element/demo/controls.ts:124-173` has `stroke` 0.2–0.9, `headWidth` 0–0.9, `headHeight` **0.1–1**, `top` **0–50**, while `VIEW_RANGE` (`command.ts:608-632`) says `headHeight` 0–1.2 and `top` 0–1000. The lab reads `VIEW_RANGE` (`ViewPanel.tsx:76`), so the lab is right. The demo is a third copy that has drifted.
4. **Lab-side constants that repeat an upstream default.** `state/view.slice.ts:136-137` hard-codes `colored: false` and `rounded: true` instead of reading `DEFAULT_VIEW.colored/.rounded`, while the neighbouring fields do read `DEFAULT_VIEW` (`:132-134`). This is harmless today, but `DEFAULT_ROUNDED` exists so it cannot drift.
5. **No duplication found** for validation (`validateParams`/`clampParam`/`straightFloor` are all the engine's, `params.slice.ts:1-53`), knob tables (all from `PARAM_SPEC`), presets, report rows, help text, themes, or `longestSummary` in the lab. In those areas the lab consumes the shared code rather than copying it.

## Labels and descriptions through a novice's eyes

Reviewed at `b9a5a9d` (worktree `/Users/tomek/dev/arrowz-review`), read-only. Sources:

- Knob label/help (EN): `packages/engine/engine.ts:2374-2716` (`PARAM_TABLE`), inactive reasons `engine.ts:2730-2735`, rule reasons `engine.ts:2842-2850`.
- Lab strings EN `packages/engine/lab-i18n.ts:20-464`; PL `lab-i18n.ts:496-1011` (PL knob texts `:524-657`, PL reasons `:505-517`).
- Report rows `packages/engine/lab-report.ts:127-198`; metric meanings `engine.ts:2063-2199`.
- Where the strings show up: the knob row shows the **short** label (`short.*`), the full label goes into the row's `title` tooltip, and the help text is behind `?` (`apps/lab/src/console/ValueKnob.tsx`, `KnobRow.tsx`). The group help is always visible under the group name (`console/KnobPanel.tsx:128-131`). The command palette and error messages use the **full** label (`palette/commands.ts:82`, `lab-i18n.ts:1069-1072`). Report rows have **no help at all** (`report/StatsTable.tsx`, `report/ReportSummary.tsx`).
- The label track is `12ch + 36px` with an ellipsis (`design/console.css:459-485`). A short label longer than about 12-14 characters gets cut.

The novice here is someone who plays arrow puzzles and wants "a board that is bigger, harder, with longer arrows, prettier". They think in **arrows**, **free / blocked**, **hard / easy**, **long / short**, **straight / winding**. The lab's text mostly uses the carver's vocabulary: pieces, carve, close/jam, heads, corridor, nooks, backbite, probe, giants, absorb. The Report uses metric codes.

---

### Top problems

Ranked by how much each would confuse a newcomer.

1. **The Report explains nothing.** Its 23 rows and the 4-figure summary have no tooltip, no `?` and no sentence. A newcomer cannot tell which rows measure difficulty or which direction is harder. Several labels are raw codes: `f0 (free at start)` (`lab-i18n.ts:321`), `almost1 (one blocker)` (`:322`), `D (blocking depth)` (`:323`), and the summary shows a bare `D` (`:445`). `f0` is printed as `0.123` while its neighbours are percentages (`lab-report.ts:150`). The green/red "better/worse" colour (`lab-report.ts:64`, `:133-196`) gives a verdict with no stated goal. More bends, more "shared border" and more "multi-line" count as *better*. `D`, the one number that is closest to "difficulty", is *neutral*. See `### Report`.

2. **Internal jargon is the visible label.** The row shows the short label, and many short labels are engine terms: `backbite` (`lab-i18n.ts:96`), `lateral` (`:98`), `anticoil` (`:100`, `:112`), `trap bias` (`:103`), `probe share` / `probe length` (`:104-105`), `giants` (`:106`), `span` (`:107`), `jitter` (`:109`), `later share` (`:110`), `head tries` (`:114`), `absorb limit` (`:115`). The Polish short labels are cryptic in the same way: `przeróbka` (`:717`), `antyzwijanie` (`:721`, `:733`), `późniejsze` (`:731`), `urywanie` (`:730`), `wchłanianie` (`:736`). Polish `prostota` (`:718`, `:732`) is simply wrong: it means *simplicity*, not *straightness*.

3. **Help texts warn about values the slider cannot reach, and one contradicts the engine's own rule.**
   - `pStraight`: "Below 0.6 big boards stop closing" (min is 0.6). Its "0.65 is safe" is false for boards larger than about 700: `straightFloor` asks for 0.8 at 1000×1000 (`engine.ts:2465` vs `:2755-2756`).
   - `warns`: "Below 2 the rule is off" (min 2, `:2486`).
   - `anticoil`: "Above 10 it jams" (max 10, `:2497`).
   - `wGiant`: "Above 0.2 boards get slow" (max 0.2, `:2621`).
   - `giantSpacing`: "Above 3 it only costs time" (max 3, `:2669`).
   - `headTries`: "1 starves the search… above 16" (range 2..16, `:2681`).
   - `absorbLimit`: "Below 12" (min 12, `:2692`).
   - `restarts`: "more than 5" (max 5, `:2714`).

   The Polish texts copy all of these (`lab-i18n.ts:559`, `:568`, `:573`, `:621`, `:635`, `:640`, `:645`, `:655`). A newcomer reads each one as "there is a dangerous zone somewhere on this slider" and cannot find it.

4. **One concept, many names.**
   - *Arrow*: EN uses piece / arrow / line / element; PL uses element / strzałka / linia.
   - *Board filled*: closed / close / closing / jam / stuck / not closed. PL: domknięta / domykanie / zacina / zaklinowanie.
   - *Winding*: Simple says "line shape" (`:62`). The CLI says `--winding` (`command.ts:274`). The group is "shape". The end words say "most winding".
   - *Arrow colour*: `ink` (`:211`), `drawing colour` (`:192`), "the arrows' colour" (`:239`).
   - *Background*: `background` (`:191`) vs "The board's paper" (`:237`) vs `paperClear` "clear the paper" (`:193`).
   - *Picture unit*: `units` (`:126`), "grid units" (`:160`), `cells` (`:170`); PL `podziałki` (`:769`) vs `jedn.` (`:740`) vs `komórki` (`:780`). The CLI says "fraction of the cell" (`command.ts:291`).
   - *Length bucket*: PL `kubełek` (`:548`) vs `koszyki` (`:659`).
   - *Trap*: the knob `trapBias` "traps" and the report row `almost1 (one blocker)` measure the same thing (`engine.ts:126`), under two unrelated names.
   - *Point grid*: EN `point grid` vs `dot` ×3; PL `siatka punktów` / `kropki` / `punkty` (`:156`, `:803`, `:765`).

5. **"element" means two things in Polish.** In PL every arrow is an *element* (`długość elementów`, `start elementów`, `elem.`). The rail heading for the visual settings is also `element` (`lab-i18n.ts:397` / `:973`, `console/GroupRail.tsx:94`), and so is the docs tab `Element` (`:290` / `:873`). There it means the `<arrowz-board>` web component. In EN "element" is equally opaque to a player. The same panel is then headed "Preview" / "Podgląd" (`ViewPanel.tsx:442`). That gives three names for one panel.

6. **The Simple view is the entry point, but it explains least.**
   - The two sliders and the skeleton switch have no `?` (`simple/PositionSlider.tsx:36`, `SimplePanel.tsx:57`).
   - "skeleton" is never defined.
   - The slider value is a bare `0–100` with no unit (`PositionSlider.tsx:44`).
   - "line shape" does not say which way is which until you read the end words.
   - The PL labels overflow the track: `długość elementów` has 17 characters and `kształt linii` has 13 (`:689-690`).
   - Nothing tells a player how to make the puzzle **harder**, which is the first thing they will want.

7. **Presets look like difficulty levels but are only sizes.**
   - Easy…Insane set W/H only (`lab-presets.ts:7-51`), and no preset has a description.
   - `portrait` / `pion` (`:51`, `:680`), `tunnels` and `skeleton` are unexplained.
   - "Huge" (400×400) sits between "Extreme" and "Insane" as a size word in a row of difficulty words.

8. **Status and rule messages speak engine.**
   - `Board closed 100%.` (`:309`).
   - "At the best moment … remained in N fragments" (`:313`).
   - `Rule bound: 0.7` (`:400`).
   - The `straightFloor` reason: "straightness bias has to rise with the board: more squares, closing off nooks below 4, or a coiling penalty above 6 each raise the floor" (`engine.ts:2849`). Here "squares" means cells, and "floor" is never explained.
   - Ranges are printed as `0..0.9` (`:405`).
   - "sits between the settings 0.5 and 0.55" (`:407`).
   - "needs giants or later share > 0" (`:246`).

9. **Command-line and implementation details leak into lab help.**
   - "--start takes 0.3 to 0.7 here … -1 turns mixing off" (`engine.ts:2522`): the lab's slider is 0.3–0.7 and has no -1.
   - "--maxback=auto spells 200" (`:2703`).
   - "off is today" (`:2541`).
   - "golden-angle colours" (`lab-i18n.ts:463`).
   - "with step 0" (`engine.ts:2637`): the lab shows step 0 as `random`.
   - The special-value chips `auto` / `random` stay English in PL (`ValueKnob.tsx:57`, `ViewPanel.tsx:112`, `:124`).
   - "run sh packages/cli/store.sh" (`:359`): the repo task is `deno task store`.

10. **The arrowhead rows are a formula.**
    - Both head rows share one help text (`viewFields.ts:86-87` → `headHelp`, `lab-i18n.ts:163-164`): "under a stroke of 0.5 an arrow 0.4 + 0.9 stroke wide, from 0.5 a sharpened stick as wide as the line". PL: "zaostrzony kijek" (`:773`).
    - "height" is ambiguous for a head that points sideways.
    - The unit `units` is not a unit a player knows.

Also found (factual, not wording):

- The Report row `unblock distance` prints "`% of perimeter`" (`lab-i18n.ts:332`). The value is divided by `W + H` (`engine.ts:2192`), which is half the perimeter and roughly the longest possible Manhattan distance on the board.
- The difficulty group help says "Changes the blocking, not the look" (`lab-i18n.ts:33`). The same group holds `probe`, which changes arrow lengths, and the start mode, which changes bends (`engine.ts:1114-1115`; `lab-simple.ts:125` says so in a comment).
- The EN and PL `start.help` (`:83`, `:707`) drop "Tunnels = harder". That is the one sentence a player needs, and it is present in `PARAM_SPEC` (`engine.ts:2510`) and PL `params.headBias.help` (`:578`). The lab never shows those two, because `StartKnob` uses `start.help`.

---

### Generator knobs

Current strings: EN "short · label · help" come from `lab-i18n.ts` `short` and `engine.ts` `PARAM_TABLE`. PL comes from `lab-i18n.ts` `short` / `params`. Proposed short labels stay at 12 characters or fewer. `=` means "keep".

| key | current EN | current PL | problem | proposed EN | proposed PL |
|---|---|---|---|---|---|
| group help `lengths` | "Three buckets: short 2–6, medium 7–15, long 16 to the maximum. The long bucket gets the remaining weight." (`lab-i18n.ts:31`) | "Trzy koszyki: … Koszyk długi dostaje resztę wagi." (`:659`) | "bucket" and "weight" are jargon; PL `koszyk` here but `kubełek` in Lmax | "Arrows come in three sizes: short (2–6 cells), medium (7–15) and long (16 up to the maximum). Set the shares of short and medium; long gets the rest." | "Strzałki są trzech rozmiarów: krótkie (2–6 komórek), średnie (7–15) i długie (od 16 do maksimum). Ustaw udział krótkich i średnich; długie dostają resztę." |
| group help `shape` | "Weights for choosing the next cell of a line. They multiply, so one extreme value drowns out the rest." (`:32`) | "Wagi wyboru kolejnej komórki linii. Mnożą się…" (`:660`) | describes the algorithm, not the look | "How arrows bend while the board is built: straight runs, sideways steps, coils. One extreme setting can drown out the others." | "Jak strzałki skręcają podczas budowania planszy: proste odcinki, kroki w bok, zwoje. Jedno skrajne ustawienie potrafi zagłuszyć resztę." |
| group help `difficulty` | "How hard it is to find a piece with a free way out. Changes the blocking, not the look." (`:33`) | "…Zmienia blokowanie, nie wygląd." (`:661`) | false: probe and start mode change lengths and bends | "How hard the finished puzzle is: where arrows start, how many traps, and a share of arrows with a set length. Some of these also change the look." | "Jak trudna będzie gotowa łamigłówka: skąd startują strzałki, ile pułapek i część strzałek o zadanej długości. Część z nich zmienia też wygląd." |
| group help `skeleton` | "The first pieces led as a serpentine across the whole board. The only way to get really long lines." (`:34`) | "Pierwsze elementy prowadzone serpentyną…" (`:662`) | "pieces" / "serpentine" are fine but vague | "A few very long arrows laid first, snaking back and forth across the whole board; the rest fills in around them. The only way to get really long arrows." | "Kilka bardzo długich strzałek układanych na początku, wężykiem przez całą planszę; reszta wypełnia miejsce wokół nich. Jedyny sposób na naprawdę długie strzałki." |
| group `closing` name + help | "closing" · "What to do when no legal carve is found. Defaults close boards up to 400×400; these knobs are for experiments." (`:27`, `:36`) | "domykanie" · "Co robić, gdy nie ma legalnego wycięcia…" (`:503`, `:664`) | "carve", "close" are jargon; the name says nothing | "when stuck" · "What the generator does when it gets stuck. The defaults fill every board up to 400×400; change these only to experiment." | "gdy utknie" · "Co robi generator, gdy utknie. Domyślne wartości wypełniają każdą planszę do 400×400; zmieniaj je tylko eksperymentalnie." |
| `W` | width · width · "Number of columns. Boards up to 400×400 generate in under two seconds; 1000×1000 takes about ten." (`engine.ts:2383`) | szerokość · … (`:527`) | OK | = | = |
| `H` | height · "Number of rows. A tall board is harder than a square one with the same number of cells." (`:2393`) | wysokość (`:531`) | OK | = | = |
| `seed` | seed · "The same seed with the same settings always gives the same board." (`:2408`) | ziarno (`:533`) | does not say what to *do* with it | "The board's number. Same seed + same settings = the same board. Change it for a new board with the same feel." | "Numer planszy. To samo ziarno przy tych samych ustawieniach daje tę samą planszę. Zmień je, by dostać inną planszę o podobnym charakterze." |
| `wShort` | short share · "share of short pieces (2–6 cells)" · "Fraction of short pieces. Higher = more arrowheads, but a mess of little hooks. Short and medium together may not exceed 0.9." (`:2413`, `:2420`) | krótkie · "…Wyżej = więcej grotów, ale sieczka z haczyków…" (`:714`, `:538`) | "more arrowheads" means more arrows. The value shows `0.2` while the mix bar above it shows `20%` (`KnobPanel.tsx:37-57`) | = short · "share of short arrows (2–6 cells)" · "How many arrows are short. More = more arrows on the board, but lots of tiny hooks. Short + medium: at most 0.9 (90%)." | short "krótkie" · "udział krótkich strzałek (2–6 komórek)" · "Jaka część strzałek jest krótka. Więcej = więcej strzałek, ale dużo drobnych haczyków. Krótkie + średnie: najwyżej 0,9 (90%)." |
| `wMid` | medium share · "…Whatever is left after short and medium goes to long pieces…" (`:2431`) | średnie (`:543`) | "pieces" | "How many arrows are medium. Whatever short and medium leave goes to long arrows. Short + medium: at most 0.9 (90%)." | "Jaka część strzałek jest średnia. Resztę po krótkich i średnich dostają długie. Krótkie + średnie: najwyżej 0,9 (90%)." |
| `Lmax` | max length · "maximum length (auto = 2.5 × side)" · "The longest piece the generator tries for. auto = 2.5 x the longer side. Below 17 the cap eats the medium and long buckets, so use auto or 17 and up." (`:2435`, `:2442`) | dł. maks. · "…Poniżej 17 limit zjada kubełek średnich i długich…" (`:548`) | "cap eats buckets"; PL `kubełek` ≠ `koszyk`; `auto` chip untranslated in PL | = short · "longest arrow (auto = 2.5 × longer side)" · "The longest arrow the generator aims for, in cells. auto = 2.5 × the longer side. 1–16 is not allowed: medium and long arrows would come out the same length." | "dł. maks." · "najdłuższa strzałka (auto = 2,5 × dłuższy bok)" · "Najdłuższa strzałka, do jakiej dąży generator, w komórkach. auto = 2,5 × dłuższy bok. Wartości 1–16 są niedozwolone: średnie i długie wyszłyby tej samej długości." Chip: "auto" |
| `backbite` | backbite · "tail rework when a line gets stuck" · "How many times in a row a line that has nowhere left to go may rework its own tail instead of stopping. 0 is off. Higher gives longer pieces and fewer of them." (`:96`, `:2446`, `:2453`) | przeróbka · "przerabianie ogona, gdy linia ugrzęźnie" (`:717`, `:552`) | the short label is the algorithm's name; unit `tries` / `prób` (`:122`, `:740`) is wrong for "2–4" in PL | "tail rework" · = · "When a growing arrow hits a dead end, how many times it may reshape its tail and keep growing instead of stopping. 0 = off. Higher = fewer, longer arrows." · unit "×" | "przeróbki" · "przeróbka ogona, gdy linia utknie" · "Ile razy rosnąca strzałka, która trafi w ślepy zaułek, może przerobić swój ogon i rosnąć dalej zamiast się zatrzymać. 0 = wyłączone. Więcej = mniej, ale dłuższych strzałek." · unit "×" |
| `pStraight` | straightness · "straightness bias" · "How readily a line keeps going straight. Higher = longer straight runs. Below 0.6 big boards stop closing. At 0.6 boards over 500x500 may jam; 0.65 is safe." (`:2458`, `:2465`) | **prostota** · "skłonność do prostej" · "…Poniżej 0,6 duże plansze się nie domykają; przy 0,6 … 0,65 nie." (`:718`, `:559`) | "below 0.6" is unreachable; "0.65 is safe" contradicts `straightFloor` (0.8 at 1000²); PL `prostota` = simplicity | = · = · "How often an arrow keeps going straight instead of turning. Higher = long straight arrows; lower = more bends. Big boards need a higher minimum; the mark on the track shows it." | "prostość" · = · "Jak często strzałka jedzie prosto zamiast skręcać. Wyżej = długie proste strzałki; niżej = więcej zakrętów. Duże plansze wymagają wyższego minimum; pokazuje je znacznik na suwaku." |
| `wLateral` | lateral · "sideways move bonus" · "How much a line prefers turning sideways over going deeper. 0 = straight thrusts and big coils." (`:98`, `:2469`, `:2475`) | ruch w bok (`:719`, `:563`) | "lateral", "thrusts", "deeper" (deeper than what?) | "sideways" · = · "How much an arrow prefers a step to the side over pushing deeper into the board. 0 = straight pushes and big coils; higher = more side-to-side wandering." | "ruch w bok" · = · "Jak bardzo strzałka woli krok w bok niż wchodzenie w głąb planszy. 0 = proste wbicia i duże zwoje; więcej = więcej meandrowania na boki." |
| `warns` | nook closing · "closing off nooks" · "How strongly a line fills nooks with few exits first. Higher = fewer, longer, more coiled pieces. Below 2 the rule is off and boards jam." (`:99`, `:2479`, `:2486`) | zakamarki (`:720`, `:568`) | "closing" collides with board closing; "Below 2" is unreachable; does not say it raises the straightness minimum below 4 | "nooks first" · "fill nooks first" · "How strongly an arrow fills small dead-end nooks before moving on. Higher = fewer, longer, more coiled arrows. Below 4 big boards need more straightness." | "zakamarki" · "najpierw zakamarki" · "Jak mocno strzałka najpierw wypełnia małe ślepe zakamarki. Wyżej = mniej strzałek, dłuższe i bardziej zwinięte. Poniżej 4 duże plansze wymagają większej prostości." |
| `anticoil` | anticoil · "coiling penalty" · "How strongly a line avoids touching itself. 1 = off. Higher = fewer coils, slightly shorter pieces. Above 10 it jams with low straightness." (`:100`, `:2490`, `:2497`) | antyzwijanie · "kara za zwijanie" (`:721`, `:573`) | "anticoil" is jargon; "Above 10" is unreachable (max 10) | "coil penalty" · = · "How strongly an arrow avoids touching itself. 1 = off. Higher = fewer coils, slightly shorter arrows. Above 6 big boards need more straightness." | "kara zwojów" · = · "Jak mocno strzałka unika dotykania samej siebie. 1 = wyłączone. Wyżej = mniej zwojów, nieco krótsze strzałki. Powyżej 6 duże plansze wymagają większej prostości." |
| start (`headBias`, via `start.*`) | piece start · options layers / random / tunnels / mixing · "Where the next piece starts: the shallowest line (layers), anywhere (random) or the deepest (tunnels). Mixing starts that fraction of pieces as tunnels." (`lab-i18n.ts:81-84`) | start · warstwy / losowo / tunele / mieszanie (`:705-708`) | "shallowest/deepest line" is meaningless to a player; the one useful fact ("tunnels = harder") is dropped (it is in `engine.ts:2510`, PL `:578`) | "arrow start" · options "layers (easier)" / "random" / "tunnels (harder)" / "mix" · "Where each new arrow is started while the board is built. Tunnels: deep inside, so arrows end up buried behind others (harder). Layers: from the edges inwards (easier, more bends). Mix: some tunnels among layers." | "start" · "warstwy (łatwiej)" / "losowo" / "tunele (trudniej)" / "mieszane" · "Skąd zaczyna się każda nowa strzałka podczas budowania planszy. Tunele: w głębi, więc strzałki są zakopane za innymi (trudniej). Warstwy: od krawędzi do środka (łatwiej, więcej zakrętów). Mieszane: trochę tuneli wśród warstw." |
| `mix` | mixing · "mixing share (tunnels among layers)" · "Fraction of pieces that start as tunnels, the rest as layers. --start takes 0.3 to 0.7 here, because the extremes leave boards unclosed. -1 turns mixing off." (`:102`, `:2514`, `:2522`) | mieszanie · "…--start przyjmuje tu od 0,3 do 0,7. -1 wyłącza mieszanie." (`:723`, `:583`) | CLI flag and a -1 the slider does not offer | "tunnel share" · "share of tunnel starts" · "With mix: the fraction of arrows started as tunnels (0.3–0.7); the rest start as layers." | "ile tuneli" · "udział startów tunelami" · "Przy starcie mieszanym: jaka część strzałek startuje tunelami (0,3–0,7); reszta warstwami." |
| `trapBias` | trap bias · "traps (arrows that look ready to go)" · choices avoid / off / seek · "Ranks heads whose corridor already holds one piece: such a piece looks ready to leave but is not. seek makes half again as many, avoid a quarter, off is today." (`:103`, `:2526`, `:2541`) | pułapki · unikaj / **bez zmian** / szukaj · "Głowa, w której korytarzu … „Szukaj" daje…" (`:724`, `:522`, `:588`) | "heads", "corridor", "ranks", "off is today"; PL closing quote is ASCII `"`; the Report calls the same thing `almost1` | "traps" · = · choices avoid / **normal** / seek · "A trap is an arrow blocked by exactly one other arrow: it looks free but is not. Seek = about 50% more traps, avoid = about a quarter as many, normal = the generator's default. Counted in the Report as traps." | "pułapki" · = · unikaj / **normalnie** / szukaj · "Pułapka to strzałka zablokowana przez dokładnie jedną inną: wygląda na wolną, ale nie jest. „Szukaj” = ok. o połowę więcej pułapek, „unikaj” = ok. cztery razy mniej, „normalnie” = domyślnie. Raport liczy je jako pułapki." |
| `probe` | probe share · "share of probe pieces" · "Fraction of pieces whose target length is drawn around the probe length instead of the usual mix. At 1 with length 12 the board is all short pieces." (`:104`, `:2546`, `:2553`) | udział sond · "udział elementów-sond" (`:725`, `:593`) | "probe" is a measurement term | "target share" · "share of arrows with a set length" · "How many arrows get a length close to one set target (next row) instead of the short/medium/long mix. 1 with target 12 = a board of short arrows only." | "ile zadanych" · "udział strzałek o zadanej długości" · "Jaka część strzałek dostaje długość bliską jednej zadanej (wiersz niżej) zamiast mieszanki krótkie/średnie/długie. 1 przy długości 12 = plansza z samych krótkich strzałek." |
| `probeLen` | probe length · "Target length of a probe, give or take half. Short probes (4) triple the piece count; long ones (200) give fewer, longer pieces." (`:105`, `:2565`) | dł. sondy (`:726`, `:598`) | "probe" | "target len" · "set length" · "The set length in cells, give or take half. 4 = about three times as many arrows; 200 = fewer, longer ones." | "zadana dł." · "zadana długość" · "Zadana długość w komórkach, plus minus połowa. 4 = ok. trzy razy więcej strzałek; 200 = mniej, dłuższych." |
| `needsProbe` / `probeOff` | "needs probe share > 0" (`:247`) · "only works with probe share > 0" (`engine.ts:2732`) | "wymaga udziału sond > 0" (`:837`, `:507`) | follows the rename | "needs target share > 0" | "wymaga: ile zadanych > 0" |
| `giants` | **giants** · "number of skeleton pieces (0 = no skeleton)" · "How many of the first pieces are long lines crossing the board. 0 = no skeleton; 4 is a good start." (`:106`, `:2570`, `:2576`) | szkielety (`:727`, `:602`) | "giants" is a code name; unit `pieces` | "skeletons" · "number of skeleton arrows (0 = none)" · "How many very long arrows are laid first, snaking across the board. 0 = no skeleton; 4 is a good start." · unit "arrows" | "szkielety" · "liczba strzałek szkieletu (0 = brak)" · "Ile bardzo długich strzałek układa się najpierw, wężykiem przez planszę. 0 = bez szkieletu; 4 to dobry początek." · unit "szt." |
| `giantSpan` | **span** · "skeleton length (in board sides)" · "Target length of one skeleton, in board sides…" (`:107`, `:2580`, `:2587`) | długość · unit `boki` (`:728`, `:740`) | "span" collides with the Report's "span" (reach); PL "30 boki" is ungrammatical | "length" · = · = · unit "× side" | "długość" · = · = · unit "× bok" |
| `giantStep` | step · "serpentine step (random = free growth)" · "Gap between the runs of a skeleton. Small = regular stripes, large = a few highways. random = free growth, with no serpentine at all." (`:108`, `:2591`, `:2599`) | skok · "skok serpentyny (random = wzrost swobodny)" (`:729`, `:610`) | `random` chip untranslated in PL; "run" and "serpentine" need one clause of explanation | "gap" · "gap between skeleton runs (random = free)" · "Cells between the back-and-forth runs of a skeleton. Small = tight regular stripes; large = a few long highways. random = no back-and-forth, the skeleton grows freely." | "odstęp" · "odstęp biegów szkieletu (losowo = swobodnie)" · "Komórki między kolejnymi biegami szkieletu tam i z powrotem. Mały = gęste, równe pasy; duży = kilka długich autostrad. „losowo” = bez wężyka, szkielet rośnie swobodnie." · chip "losowo" |
| `giantJitter` | jitter · "cutting serpentine runs short" · "How often a skeleton run stops short of an obstacle. 0 = straight, regular edges." (`:109`, `:2603`, `:2610`) | urywanie (`:730`, `:614`) | "jitter" is jargon | "cut short" · = · "How often a skeleton run turns back before it reaches an obstacle. 0 = straight, regular edges; 1 = ragged, no wall-to-wall lines." | "urywanie" · "urywanie biegów szkieletu" · "Jak często bieg szkieletu zawraca, zanim dojdzie do przeszkody. 0 = proste, równe brzegi; 1 = poszarpane, żadnej linii od ściany do ściany." |
| `wGiant` | **later share** · "share of skeletons after the start" · "Chance that a piece carved later is also a skeleton. Above 0.2 boards get slow and stop closing at 1000x1000." (`:110`, `:2614`, `:2621`) | późniejsze (`:731`, `:621`) | cryptic short label; "carved"; "Above 0.2" is unreachable (max 0.2) | "late chance" · "chance of more skeletons later" · "Chance that an arrow laid later also becomes a skeleton arrow. Near the top (0.2) boards get slow and the largest may not fill." | "kolejne" · "szansa na kolejne szkielety później" · "Szansa, że strzałka układana później też stanie się szkieletem. Blisko maksimum (0,2) plansze liczą się wolno, a największe mogą się nie wypełnić." |
| `needsSkeleton` / `skeletonOff` | "needs giants or later share > 0" (`:246`) · "requires skeleton pieces > 0" (`engine.ts:2731`) | "wymaga szkieletów lub późniejszych > 0" (`:836`) · "wymaga elementów szkieletowych > 0" (`:506`) | "giants" leaks; the reason forgets the second parent | "needs skeletons > 0 or late chance > 0" | "wymaga: szkielety > 0 lub kolejne > 0" |
| `giantStraight` | straightness · "skeleton straightness" · "How readily a skeleton goes straight where it grows freely: the whole line with step 0, the tail after a serpentine. 0.5 is no preference at all." (`:111`, `:2629`, `:2637`) | **prostota** (`:732`, `:626`) | "step 0" is shown as `random`; PL `prostota` | = · = · "How often a skeleton arrow keeps straight where it grows freely: all of it when the gap is random, only its tail otherwise. 0.5 = no preference." | "prostość" · = · "Jak często strzałka szkieletu jedzie prosto tam, gdzie rośnie swobodnie: cała przy odstępie „losowo”, inaczej tylko ogon. 0,5 = bez preferencji." |
| `stepZero` | "only works with serpentine step > 0" (`engine.ts:2733`) | "działa tylko przy skoku serpentyny > 0" (`:508`) | step 0 is displayed as `random` | "no effect while the gap is random" | "bez wpływu przy odstępie „losowo”" |
| `giantAnticoil` | anticoil · "skeleton coiling penalty" · "Self-touching penalty for the skeleton alone. The higher of this and the general one applies." (`:112`, `:2641`, `:2652`) | antyzwijanie (`:733`, `:630`) | jargon short; "the general one" is unspecified | "coil penalty" · = · "Coil penalty for skeleton arrows only. Whichever is higher, this or the coil penalty on the Shape tab, applies." | "kara zwojów" · = · "Kara za zwoje tylko dla szkieletu. Obowiązuje wyższa z tej i kary za zwoje z zakładki Kształt." |
| `anticoilWins` | "only acts above the general coiling penalty" (`:2734`) | "działa dopiero powyżej ogólnej kary za zwijanie" (`:509`) | OK, uses the renamed term | "only acts above the Shape tab's coil penalty" | "działa dopiero powyżej kary za zwoje z zakładki Kształt" |
| `giantSpacing` | spacing · "skeleton spacing radius" · choices off / 2 / 3 · "How far the skeleton keeps from its own earlier runs, in cells. Above 3 it only costs time." (`:113`, `:2656`, `:2669`) | odstęp · "bez odstępu" / 2 / 3 (`:734`, `:521`, `:635`) | "Above 3" is unreachable | = · "skeleton spacing" · = · "How many cells a skeleton keeps from its own earlier runs. off = it may touch them; 3 is the most, and costs time." | = · "odstęp szkieletu" · = · "Ile komórek szkielet trzyma od swoich wcześniejszych biegów. „bez odstępu” = może ich dotykać; 3 to maksimum i kosztuje czas." |
| `headTries` | head tries · "start attempts per direction" · "Starting spots to try before changing direction. 1 starves the search on hard settings; above 16 only costs time." (`:114`, `:2674`, `:2681`) | próby startu · unit `prób` (`:735`, `:640`) | "head"; both warnings are outside the 2..16 range; PL "2 prób" is ungrammatical | "start tries" · "start spots tried per direction" · "How many starting spots the generator tries before it turns to another direction. Low values can get stuck on hard settings; high ones only cost time." · unit "×" | "próby startu" · "próby startu na kierunek" · "Ile miejsc startu generator sprawdza, zanim zmieni kierunek. Mało może utknąć przy trudnych ustawieniach; dużo tylko kosztuje czas." · unit "×" |
| `absorbLimit` | absorb limit · "leftover absorption up to N cells" · "A fragment up to this size that cannot be carved is glued to a neighbour. Below 12 leftovers pile up and boards jam." (`:115`, `:2685`, `:2692`) | wchłanianie (`:736`, `:645`) | "absorb", "carved", "N"; "Below 12" is unreachable | "leftover max" · "merge leftovers up to this size" · "An empty patch up to this many cells that no arrow fits into is merged into a neighbouring arrow. Lower = more leftovers, and boards get stuck more often." | "resztki do" · "doklejaj resztki do tego rozmiaru" · "Pusta łatka do tylu komórek, w którą nie wejdzie żadna strzałka, zostaje doklejona do sąsiedniej. Mniej = więcej resztek i plansze częściej utykają." |
| `maxBack` | backtracks · "backtrack budget" · "How many carves may be undone in one attempt before starting over. 200 is enough; more only delays the verdict. --maxback=auto spells 200." · unit `carves` (`:116`, `:2696`, `:2703`, `:127`) | nawroty · unit `wycięć` (`:737`, `:650`, `:740`) | "carves", CLI syntax | = · = · "How many placed arrows the generator may take back in one attempt before starting over. 200 is enough; more only delays the answer." · unit "steps" | = · = · "Ile ułożonych strzałek generator może cofnąć w jednej próbie, zanim zacznie od nowa. 200 wystarcza; więcej tylko opóźnia wynik." · unit "kroków" |
| `restarts` | restarts · "allowed restarts" · "How many fresh attempts with a derived seed after a failure. 0 shows the raw success rate; more than 5 almost never helps." (`:117`, `:2706`, `:2714`) | restarty (`:738`, `:655`) | "derived seed", "raw success rate"; "more than 5" is unreachable (max 5) | = · = · "How many fresh attempts after a failed one, each with a seed made from yours. 0 shows how often these settings succeed on their own; the maximum (5) is plenty." | = · = · "Ile nowych prób po nieudanej, każda z ziarnem wyliczonym z Twojego. 0 pokazuje, jak często te ustawienia udają się same; maksimum (5) wystarcza." |
| rule `sharesSum` | "short and medium shares together must stay at or below 0.9" (`engine.ts:2843`) | (`:511`) | OK; the bar says `%` | "short + medium must be at most 0.9 (90%)" | "krótkie + średnie najwyżej 0,9 (90%)" |
| rule `lmaxHole` | "maximum length must be 0 (automatic) or at least 17" (`:2844`) | (`:512`) | "0" is shown as `auto` | "longest arrow must be auto or at least 17" | "najdłuższa strzałka: auto albo co najmniej 17" |
| rule `straightFloor` + `needViolation` | "straightness bias has to rise with the board: more squares, closing off nooks below 4, or a coiling penalty above 6 each raise the floor; this board needs at least 0.75" (`:2849`, `lab-i18n.ts:409`) | "skłonność do prostej musi rosnąć z planszą: więcej kwadratów, …" (`:514`) | "squares" means cells; "floor" | "Straightness is too low for this board: bigger boards, nooks below 4 or a coil penalty above 6 all need more. This board needs at least 0.75." | "Za mała prostość jak na tę planszę: większa plansza, zakamarki poniżej 4 albo kara zwojów powyżej 6 wymagają więcej. Ta plansza wymaga co najmniej 0,75." |
| `ruleBound` | "Rule bound: 0.75" (`:400`) | "Granica reguły: 0,75" (`:974`) | calque, jargon | "Minimum for this board: 0.75" | "Minimum dla tej planszy: 0,75" |
| `rangeViolation` / `stepViolation` | "{label}: 0.95 is outside 0..0.9" · "…sits between the settings 0.5 and 0.55" (`:405`, `:407`) | "…poza zakresem 0..0,9" · "…leży między ustawieniami…" (`:976-977`) | programmer range syntax | "{label}: 0.95 — allowed 0 to 0.9" · "{label}: 0.52 is not an allowed step; nearest are 0.5 and 0.55" | "{label}: 0,95 — dozwolone od 0 do 0,9" · "{label}: 0,52 to niedozwolony krok; najbliższe to 0,5 i 0,55" |
| `mixCap` | "short + medium at most 0.9" (`:255`) | (`:845`) | the bar next to it is in percent | "short + medium: at most 90%" | "krótkie + średnie: najwyżej 90%" |

Also: `units.tries` / `prób` and `units.sides` / `boki` do not inflect with the number (`lab-i18n.ts:740`). An invariant symbol (`×`, `× bok`) avoids "2 prób" and "30 boki".

---

### Simple view

Rendered by `apps/lab/src/simple/SimplePanel.tsx` and `PositionSlider.tsx`. The sliders and the skeleton switch have `help={null}`.

| control | current EN | current PL | problem | proposed EN | proposed PL |
|---|---|---|---|---|---|
| section title | `groups.board` "board" (`SimplePanel.tsx:137`) | "plansza" | OK | = | = |
| length slider | "piece length" · ends "very short" / "very long" · value `0–100`, no unit (`lab-i18n.ts:61`, `:68`) | "długość elementów" (17 chars, truncated) · "bardzo krótkie" / "bardzo długie" (`:689`, `:696`) | "piece"; a bare number; no `?`; PL is too long | "arrow length" · = · add help: "Left: many short arrows. Right: fewer, longer ones. The generator picks the detailed settings for you." | "dł. strzałek" · = · help: "W lewo: dużo krótkich strzałek. W prawo: mniej, ale dłuższych. Szczegółowe ustawienia generator dobiera sam." |
| shape slider | "line shape" · "straightest lines" / "most winding" (`:62`, `:69`) | "kształt linii" (13 chars) · "jak najprostsze linie" / "najbardziej pokręcone" (`:690`, `:697`) | "shape" does not say which way is which; the CLI calls it `--winding`; no `?` | "winding" · "straightest" / "most winding" · help: "Left: long straight arrows. Right: arrows that bend and wind a lot." | "krętość" · "najprostsze" / "najbardziej kręte" · help: "W lewo: długie proste strzałki. W prawo: strzałki, które dużo skręcają i się wiją." |
| skeleton | "skeleton" · "no skeleton" / "with a skeleton" (`:63`, `:65`) | "szkielet" · "bez szkieletu" / "ze szkieletem" | undefined term, no help | = · = · help: "Starts the board with a few very long arrows snaking across it; everything else fills in around them. Slower on big boards." | = · = · help: "Zaczyna planszę od kilku bardzo długich strzałek wijących się przez całą planszę; reszta wypełnia miejsce wokół nich. Na dużych planszach wolniej." |
| seed | PARAM_SPEC help (see knobs) | | see `seed` row | see knobs table | see knobs table |
| randomise | "randomise" · title "randomise the settings on every generate" · help "The knobs are drawn inside a safe range for this size and these choices, so the same seed gives a different board every time. The drawn values show in the advanced view and in the command." (`:71-75`) | "losuj" · "losuj ustawienia przy każdym generowaniu" · "Pokrętła są losowane…" (`:699-702`) | "knobs", "drawn", "the command"; 2 sentences, acceptable | = · = · "Each Generate picks fresh settings within a safe range for this size and these choices, so you get a new board every time, even with the same seed. See the picked values in Advanced." | = · = · "Każde „Generuj” dobiera nowe ustawienia w bezpiecznym zakresie dla tego rozmiaru i wyborów, więc za każdym razem dostajesz inną planszę, nawet przy tym samym ziarnie. Wybrane wartości zobaczysz w widoku zaawansowanym." |
| (missing) difficulty hint | — | — | a player's first wish ("harder") has no control and no pointer | new line under the board section: "Want it harder? Pick a preset at the top, or in Advanced → difficulty choose tunnels and traps." | "Chcesz trudniej? Wybierz preset u góry albo w widoku zaawansowanym → trudność ustaw tunele i pułapki." |

The Simple view's preview section reuses the View-panel rows, so the View-panel findings apply here too.

---

### View panel

Rendered by `apps/lab/src/console/ViewPanel.tsx`; the row map is in `console/viewFields.ts:84-99`.

| row | current EN | current PL | problem | proposed EN | proposed PL |
|---|---|---|---|---|---|
| rail heading / panel title | rail "element" (`:397`) · panel "Preview" (`:152`) | "element" (`:973`) · "Podgląd" (`:762`) | PL "element" = arrow everywhere else; two names for one panel | "look" / title "Look" | "wygląd" / "Wygląd" |
| stroke | "stroke" · "stroke width (grid units)" · unit `units` · "Line width in grid units. Below 0.2 the line thins into the paper; at 0.9 it fills its own square and leaves the tip no room." (`:197`, `:160`, `:225-226`) | "grubość" · "grubość linii (podziałki)" · `jedn.` (`:792`, `:769`, `:818-819`) | "units" / "podziałki" is unclear; the dot radius uses `cells` | "thickness" · "line thickness (cells)" · unit "cell" · "How thick the arrows are, as a share of a cell. 0.2 = hairline; 0.9 = fills the cell and leaves no room for the tip." | "grubość" · "grubość linii (w komórkach)" · unit "kom." · "Grubość strzałek jako część komórki. 0,2 = cienka kreska; 0,9 = wypełnia komórkę i nie zostawia miejsca na grot." |
| head width | "head width" · "arrowhead width (grid units, 0 = automatic)" · shared `headHelp` (`:198`, `:161`, `:163-164`) | "szer. grotu" · shared `headHelp` "…zaostrzony kijek…" (`:793`, `:770`, `:772-773`) | a formula wall shared by two rows; `auto` untranslated | = · "arrowhead width (cells, auto = fits the line)" · "How wide the arrowhead is, in cells. auto picks a width that suits the line thickness. A head narrower than the line is widened to match." | = · "szerokość grotu (komórki, auto = do linii)" · "Szerokość grotu w komórkach. auto dobiera szerokość do grubości linii. Grot węższy od linii zostaje do niej poszerzony." · chip "auto" |
| head height | "head height" · "arrowhead height (grid units)" · shared `headHelp` (`:199`, `:162`) | "wys. grotu" (`:794`) | "height" is ambiguous for a sideways arrow | "head length" · "arrowhead length (cells)" · "How long the tip is, measured along the arrow, in cells. 0 = no tip." | "dł. grotu" · "długość grotu (komórki)" · "Długość grotu wzdłuż strzałki, w komórkach. 0 = bez grotu." |
| rounded | "rounded" · "Rounds the corners a piece turns through, and caps its tail with a disc." (`:204`, `:230`) | "zaokrąglenie" (`:799`, `:823`) | "piece" | = · "Rounds the corners where an arrow turns, and ends its tail with a dot." | = · "Zaokrągla rogi, na których strzałka skręca, i kończy jej ogon kropką." |
| multicolour | "multicolour" · "Draws each piece in a colour of its own: from the custom palette, else the theme, else a hue per piece." (`:205`, `:231-232`) | "wielobarwne" (`:800`, `:824-825`) | OK apart from "piece" | = · "Gives every arrow its own colour: from your palette, else from the theme, else automatic colours." | = · "Każda strzałka dostaje własny kolor: z Twojej palety, inaczej z motywu, inaczej automatycznie." |
| highlight switch + count | "longest" · "top count" · needs "needs longest on" (`:206`, `:200`, `:220`) | "najdłuższe" · "ile najdł." · "wymaga: najdłuższe wł." (`:801`, `:795`, `:813`) | a switch named "longest" does not say what it does; "top count" | "mark longest" · "how many" · "turn on mark longest" | "najdłuższe" · "ile" · "włącz „najdłuższe”" |
| jammed cells | "jammed cells" · "Marks the cells the generator failed to carve, where the board jammed." (`:207`, `:234`) | "zaklinowane" · "…nie zdołał wyciąć…" (`:802`, `:827`) | "carve", "jammed"; does not say it is only visible on an unfinished board | "empty cells" · "Marks the cells left empty when the generator got stuck. You only see them on a board that did not fill completely." | "puste komórki" · "Zaznacza komórki, które zostały puste, gdy generator utknął. Widać je tylko na planszy, która nie wypełniła się do końca." |
| point grid + dot colour/radius | "point grid" / "dot colour" / "dot radius" · section "points" (`:208`, `:203`, `:202`, `:156`) | "kropki" / "kolor kropek" / "promień" · "punkty" / "siatka punktów" (`:803`, `:798`, `:797`, `:765`, `:778`) | three names in PL | "dot grid" (and "dots" in needs) | "siatka kropek" (short "kropki"; needs "włącz „kropki”") |
| theme | "theme" · "A built-in theme: paper, ink, highlight and the colours of the pieces. What you set below wins over it." (`:209`, `:235-236`) | "motyw" · "…papier, tusz, podświetlenie…" (`:804`, `:828-829`) | "paper, ink" | = · "A ready colour set: background, arrow colour, highlight and multicolour palette. Anything you set below overrides it." | = · "Gotowy zestaw kolorów: tło, kolor strzałek, wyróżnienie i paleta wielobarwna. To, co ustawisz niżej, ma pierwszeństwo." |
| background | "background" · "The board's paper. Set, it wins over the theme; cleared, the theme supplies it again." · clear "clear the paper, back to the theme" (`:210`, `:237`, `:193`) | "tło" · "Papier planszy. Ustawiony wygrywa z motywem; wyczyszczony oddaje go motywowi." (`:805`, `:830`, `:791`) | "paper"; clumsy PL calque | = · "The board's background colour. Your colour overrides the theme; × returns to the theme's." · clear "use the theme's background" | = · "Kolor tła planszy. Twój kolor zastępuje motyw; × przywraca kolor z motywu." · clear "użyj tła z motywu" |
| ink | "ink" · "drawing colour" · "The arrows' colour while they are not multicoloured…" (`:211`, `:192`, `:238-239`) | "rysunek" · "kolor rysunku" (`:806`, `:790`, `:831`) | three names | "arrow colour" · "arrow colour" · "The colour of all arrows when multicolour is off. Your colour overrides the theme; × returns to the theme's." | "strzałki" · "kolor strzałek" · "Kolor wszystkich strzałek, gdy wielobarwne jest wyłączone. Twój kolor zastępuje motyw; × przywraca kolor z motywu." |
| palette | "palette" · "Up to 8 colours. A chosen theme still supplies everything you do not set." (`:212`, `:188`) | (`:807`, `:788`) | OK; say what it is for | = · "Your own colours for multicolour arrows, up to 8. The theme still supplies everything you leave unset." | = · "Własne kolory dla wielobarwnych strzałek, do 8. Motyw nadal daje wszystko, czego nie ustawisz." |
| export cell | "export cell" · "cell size in export (px)" · "Affects only the downloaded SVG and the CLI command. No effect on the preview." (`:201`, `:158-159`) | "komórka SVG" (`:796`, `:767-768`) | OK | = | = |
| SVG theme note | "The downloaded SVG keeps the golden-angle colours, not the chosen theme." (`:463`) | "…kolory ze złotego kąta…" (`:1010`) | math jargon | "The downloaded SVG uses its own default colours; the chosen theme is not included." | "Pobrany SVG ma własne domyślne kolory; wybrany motyw nie jest w nim uwzględniony." |
| theme options | slugs like `catppuccin-mocha` (`board-element/src/themes.ts:31-`) | same | brand names, acceptable; `none` / `brak` OK | = | = |

---

### Report

The summary is in `report/ReportSummary.tsx`, the table in `StatsTable.tsx` and the rows in `lab-report.ts:127-198`. None of the rows has an explanation.

**Proposal:**

- Give every row a `title` / `?` with the one-line explanation below, and state the direction ("higher = harder") in it.
- Replace the unexplained better/worse verdict. Either print only ↑/↓, or say the goal in the caption: "Green = closer to a big, interlocked puzzle".

| row (key) | current EN | current PL | problem | proposed EN (label · explanation) | proposed PL |
|---|---|---|---|---|---|
| summary caption | "change against the previous run" (`:444`) | "zmiana wobec poprzedniego przebiegu" (`:997`) | "run"; colours unexplained | "vs. the previous board (green = more interlocked, red = less)" | "wobec poprzedniej planszy (zielone = bardziej splątana, czerwone = mniej)" |
| summary `D` | `D` with abbr title "D (blocking depth)" (`:445`, `ReportSummary.tsx:48`) | "D" | a letter | "depth" | "głębokość" |
| group names | size / blocking / reach / shape / run (`:447-451`) | rozmiar / blokowanie / zasięg / kształt / przebieg (`:1000-1004`) | "run" group is generator internals, not the puzzle | size / **difficulty** / reach / shape / **generator** (tooltip: "how the generator worked; not a property of the puzzle") | rozmiar / **trudność** / zasięg / kształt / **generator** |
| `pieces` | "pieces" (`:316`) | **"elementów"** (genitive, `:895`) | term; PL grammar | "arrows" · "How many arrows the board has. More = longer to play." | "strzałki" · "Ile strzałek ma plansza. Więcej = dłuższa gra." |
| `avgLen` | "average length" | "średnia długość" | no unit | "average length" · "Cells per arrow, on average." | = · "Średnio komórek na strzałkę." |
| `longest` | "longest" · "N cells (x% of the board)" | "najdłuższy" | PL gender follows "element" | = · "The longest arrow." | "najdłuższa" · "Najdłuższa strzałka." |
| `lengths` | "length distribution" · `2–6 · 7–15 · 16–49 · 50+` (`lab-report.ts:145-147`) | "rozkład długości" | buckets differ from the knobs (long = 16+) | "lengths" · "Share of arrows by length: short, medium, long (16–49) and very long (50+)." | "długości" · "Udział strzałek wg długości: krótkie, średnie, długie (16–49) i bardzo długie (50+)." |
| `f0` | "f0 (free at start)" · `0.123` (`:321`, `lab-report.ts:150`) | "f0 (wolne na starcie)" | a code; a fraction where the other rows use percent | "free at start" · show as % · "Arrows you can remove on the very first move. Lower = harder." | "wolne na starcie" · "Strzałki, które można zdjąć w pierwszym ruchu. Mniej = trudniej." |
| `almost` | "almost1 (one blocker)" (`:322`) | "almost1 (jeden bloker)" (`:901`) | a code; the same concept as the `trapBias` knob ("traps") | "traps" · "Arrows blocked by exactly one other: they look free but are not. More = more tempting mistakes. Set with the traps knob." | "pułapki" · "Strzałki zablokowane przez dokładnie jedną inną: wyglądają na wolne, ale nie są. Więcej = więcej kuszących pomyłek." |
| `D` | "D (blocking depth)" (`:323`) | "D (głębokość blokowania)" | the key difficulty number is shown as a letter and marked neutral | "depth" · "The longest chain of arrows waiting on one another: even removing every free arrow at once, clearing takes D + 1 rounds. Higher = harder." | "głębokość" · "Najdłuższy łańcuch strzałek czekających jedna na drugą: nawet zdejmując naraz wszystkie wolne, potrzeba D + 1 rund. Więcej = trudniej." |
| `corridor` | "mean corridor" (`:324`) | "średni korytarz" | "corridor" is jargon | "path to edge" · "Average number of cells between an arrow's head and the edge it points to." | "droga do krawędzi" · "Średnia liczba komórek między grotem a krawędzią, w którą celuje strzałka." |
| `span` | "mean span" (`:325`) | "zasięg średni" | "span"; PL word order differs from "średni korytarz" | "average reach" · "How much of the board's side an arrow stretches across, on average." | "średni zasięg" · "Jaką część boku planszy obejmuje średnio strzałka." |
| `spanTop` | "span of top 10%" | "zasięg górnych 10%" | | "reach, top 10%" · "The same for the 10% widest arrows." | "zasięg, top 10%" |
| `spanMax` | "span of the record holder" | "zasięg rekordzisty" | | "reach, record" | "zasięg, rekord" |
| `outDeg` | "unblocks on average" · "x pieces" (`:328`) | "odblokowania średnio" | imprecise: it counts arrows standing *behind* one (edges), not arrows actually freed | "blocks on average" · "How many arrows each arrow stands in the way of." | "blokuje średnio" · "Ile strzałek każda strzałka zasłania." |
| `maxOut` | "unblocks record" | **"odblokowania rekord"** | word order | "blocks, record" · "The most arrows one arrow stands in the way of." | "blokuje, rekord" |
| `blockDist` | "unblock distance" · "x% **of perimeter**" (`:330`, `:332`) | "dystans odblokowań" · "obwodu" | **wrong:** divided by W+H (`engine.ts:2192`), which is half the perimeter | "blocking distance" · unit "of max." · "How far an arrow is from the arrows it blocks, as a share of the farthest possible distance on the board. Higher = removing one arrow matters across the board." | "dystans blokad" · unit "maks." · "Jak daleko strzałka jest od tych, które blokuje, jako część największej możliwej odległości na planszy." |
| `bends` | "bends per piece" (`:333`), better = up | "skrętów na element" | "piece"; "more bends = better" is taste, unexplained | "bends per arrow" · "Average number of turns in an arrow." | "zakręty na strzałkę" |
| `coil` | "coiling" (`:334`) | "zwinięcie" | undefined | = · "Share of cells where an arrow touches itself on three sides (a clump, not a line). Lower = cleaner arrows." | "zwinięcie" · "Udział komórek, w których strzałka dotyka siebie z trzech stron (kłębek zamiast linii). Mniej = czystsze strzałki." |
| `border` | "shared border" (`:335`) | "wspólna granica" | undefined | "wrapping" · "For arrows of 8+ cells: how much of an arrow runs alongside one neighbour. Higher = arrows wrap around each other." | "oplatanie" · "Dla strzałek od 8 komórek: jak duża część strzałki biegnie wzdłuż jednej sąsiadki. Więcej = strzałki się oplatają." |
| `multi` | "multi-line" (`:336`) | **"wieloliniowych"** (`:915`) | meaningless; PL genitive | "bent arrows" · "Share of arrows that are not one straight line." | "zgięte strzałki" · "Udział strzałek, które nie są jedną prostą." |
| `stall` | "stalls before target" · "x of paths, reaching y of the ordered length" (`:337-338`) | "utyka przed celem" · "…zamówionej długości" (`:916-917`) | "ordered" calque; a verb as a label | "stopped short" · "x of arrows, reaching y of their planned length" | "urwane przed celem" · "x strzałek, osiągają y zaplanowanej długości" |
| `absorbed` | "absorbed leftovers" (`:339`) | "wchłonięte resztki" | "absorbed" | "merged leftovers" · "Small empty patches glued onto neighbouring arrows. Fewer = cleaner board." | "doklejone resztki" |
| `backtracks` | "backtracks / restarts" | "nawroty / restarty" | OK in the generator group | = | = |
| `time` | "generation X s, metrics Y s" | "generacja …, metryki …" (`:922`) | PL "generacja" = a generation (cohort) | = | "generowanie X s, statystyki Y s" |
| longest table | "{n} longest" · help "Span = … Density = … Coiling = … A snake crossing…" (`:344-346`) · column "box" | "{n} najdłuższych" · (`:923-925`) · "prostokąt" | wall of text above the table; "span" | "The {n} longest arrows" · move each sentence into its column's tooltip · columns "length / box (w×h) / reach / density / coiling" | "{n} najdłuższych strzałek" · "długość / prostokąt / zasięg / gęstość / zwinięcie" |

---

### Presets and other strings

| item | current EN | current PL | problem | proposed EN | proposed PL |
|---|---|---|---|---|---|
| levels | Easy / Medium / Hard / Nightmare / Extreme / Huge / Insane (`:40-48`) | Łatwy / Średni / Trudny / Koszmar / Ekstremalny / Ogromny / Obłęd (`:668-676`) | difficulty words that only set the size (`lab-presets.ts:7-51`); "Huge" is a size word | keep the names, and add a column subtitle "25×50 · size only" … "1000×1000 · ~90k arrows, ~30 s" | "25×50 · tylko rozmiar" … "1000×1000 · ~90 tys. strzałek, ~30 s" |
| mode `portrait` | "portrait" (`:51`) | "pion" (`:680`) | photo term; PL is a noun fragment | "tall" · tip "twice as tall as wide: fewer arrows free at once" | "pionowa" · "dwa razy wyższa niż szersza: mniej wolnych strzałek naraz" |
| mode `tunnels` | "tunnels" | "tunele" | unexplained | = · tip "arrows start deep inside: harder" | = · "strzałki startują w głębi: trudniej" |
| mode `skeleton` | "skeleton" | "szkielet" | unexplained | = · tip "a few very long arrows snake across the board first" | = · "najpierw kilka bardzo długich strzałek wije się przez planszę" |
| mode `serpentine` | "winding skeleton" | "szkielet z serpentynami" | OK | = · tip "the skeleton keeps breaking off: no wall-to-wall lines" | "kręty szkielet" · "szkielet ciągle się urywa: żadnej linii od ściany do ściany" |
| `customSettings` / `editedSinceLastPreset` | "custom settings" / "edited since the last preset" (`:418-419`) | OK | OK | = | = |
| status `closed` | "Board closed 100%." (`:309`) | "Plansza domknięta w 100%." (`:888`) | "closed" | "Board complete: every cell filled." | "Plansza gotowa: wszystkie komórki wypełnione." |
| `notClosedStatus` | "Board not closed. At the best moment X cells remained in N fragments (largest L)." (`:313`) | "Nie domknięto planszy. W najlepszym momencie…" (`:892`) | "closed", "fragments", no next step | "The board could not be filled: at best X cells stayed empty, in N patches (largest L). Try another seed or more straightness." | "Nie udało się wypełnić planszy: w najlepszym razie X komórek zostało pustych, w N łatkach (największa L). Spróbuj innego ziarna albo większej prostości." |
| `notClosed` / `notClosedShort` | "not closed" / "Board not closed." (`:361`, `:388`) | "niedomknięta" | | "incomplete" / "Board incomplete." | "niepełna" / "Plansza niepełna." |
| `progress` | "… · backtracks 3 · …" (`:297-304`) | "nawroty" | OK | "… · steps back 3 · …" | = |
| `unsolvable` | "UNSOLVABLE — a generator bug." | OK | OK | = | = |
| `reset` | "Defaults" (`:134`) | "Domyślne" | reads like a label, not an action | "Reset to defaults" | "Przywróć domyślne" |
| `cmdBroken` | "rule broken" (`:283`) | "złamana reguła" | jargon | "invalid settings" | "błędne ustawienia" |
| `noStoreServer` | "No store server — run sh packages/cli/store.sh." (`:359`) | (`:938`) | the task is `deno task store` (`deno.json:57`) | "Saved boards need the local store. Start it with: deno task store" | "Zapisane plansze wymagają lokalnego magazynu. Uruchom: deno task store" |
| `railElement` / `docsElement` | "element" / "Element" (`:397`, `:290`) | "element" / "Element" | PL collision (see Top 5) | "look" / docs tab "Board element" | "wygląd" / "Element planszy" |
| PL typography | `„Szukaj"` (`:588`) | | ASCII closing quote | | `„Szukaj”` |
| dead keys | `title` "Generator lab", `subtitle` "Same engine as carve.ts: engine.ts." (`:130-131`) | | no use in `apps/lab/src` (grep) | remove, or reword if it comes back | |
| PL `generacja` | | "generacja" (`:922`, `:946`, `:964`) | means a cohort | | "generowanie" |

---

### Terminology glossary proposal

One term per concept for everything a player sees. Engine and CLI names can stay internal.

| concept | EN | PL | replaces |
|---|---|---|---|
| a piece of the puzzle | arrow | strzałka | piece, line, element / element, linia |
| the tip | arrowhead, head | grot | head (in helps), głowa |
| board with every cell covered | complete / filled | pełna / wypełniona | closed, close / domknięta, domykanie |
| generator cannot continue | stuck | utknąć | jam, jammed, starve / zacinać, zaklinować |
| the generator placing an arrow | place | układać | carve / wycinać |
| taking placed arrows back | step back | cofnięcie | backtrack (keep "backtracks" only in the generator group) / nawrót |
| number that fixes the board | seed | ziarno | = |
| an adjustable setting | setting | ustawienie | knob / pokrętło (fine in the palette placeholder only) |
| arrow goes straight | straightness | prostość | straightness bias / prostota, skłonność do prostej |
| arrow bends a lot | winding | krętość | line shape / kształt linii |
| arrow touches itself | coil, coil penalty | zwój, kara zwojów | anticoil, coiling penalty / antyzwijanie |
| dead-end pocket | nook | zakamarek | = |
| where arrows start | arrow start: layers / random / tunnels / mix | start: warstwy / losowo / tunele / mieszane | piece start, mixing |
| arrow blocked by exactly one other | trap | pułapka | almost1, one blocker, trap bias |
| arrows with a set length | set length, target share | zadana długość | probe / sonda |
| very long arrows laid first | skeleton, skeleton arrow | szkielet, strzałka szkieletu | giants / elementy szkieletowe |
| back-and-forth runs of a skeleton | run, gap between runs | bieg, odstęp biegów | serpentine step / skok serpentyny |
| distance from head to edge | path to edge | droga do krawędzi | corridor / korytarz |
| minimum rounds of removal | depth (D) | głębokość (D) | blocking depth / głębokość blokowania |
| free on the first move | free at start | wolne na starcie | f0 |
| board-side coverage | reach | zasięg | span |
| empty leftover area | leftover, empty patch | resztka, pusta łatka | fragment, absorb / wchłanianie |
| picture unit | cell | komórka (kom.) | grid units, units / podziałki, jedn. |
| background colour | background | tło | paper / papier |
| single arrow colour | arrow colour | kolor strzałek | ink, drawing colour / tusz, kolor rysunku |
| the visual settings panel | Look | Wygląd | element, Preview / element, Podgląd |
| ready-made settings | preset | preset | = |

## Best practices and refactoring

Scope: `apps/lab` at `b9a5a9d` (worktree `/Users/tomek/dev/arrowz-review`). Every claim below was checked by reading the file. Paths are relative to `apps/lab/src` unless they start with `packages/` or `apps/`.

### Refactors worth doing (ranked)

#### 1. Delete the dead pre-handoff-2 knob layer (TSX + CSS + the test that pins it)

- **Where:** `console/KnobSlider.tsx:32-80` (the `KnobSlider` component), `console/FieldHelp.tsx:3-41` (`HelpEntry`, `FieldHelp`), `console/viewFields.ts:62-67` (`viewHelpEntries`) and the `help` field of `VIEW_FIELDS` (`viewFields.ts:18,35,38`). In CSS: the `.fw-k`, `.fw-kdesc`, `.fw-grid`, `.fw-skeleton` and `.fw-ends` rules in `design/console.css` (68-197, 200-240, 270-315, 360, 420-435, 984-1016, 1307-1320). Also `design/console.test.ts:15-20` and the `.fw-k` branch in `console/useFocusRequest.ts:45`.
- **Why:** None of these is rendered any more.
  - `grep -rnw -e fw-k --include='*.tsx' --include='*.ts' . | grep -v test` returns only a `closest('.kv-row, .fw-k')` string (`useFocusRequest.ts:45`). No component has `className` containing `fw-k`, `fw-grid`, `fw-skeleton` or `fw-ends` (the same grep for each returns nothing). `SimplePanel.browser.test.tsx:81` even asserts `querySelector('.fw-k, .fw-grid, .fw-kdesc')` is `null`.
  - `KnobSlider` is imported only by `console/KnobSlider.browser.test.tsx` (lines 1-110 test it). Production imports only the helpers `percent` and `boundOn` from that file (`KnobRow.tsx:5`, `ValueKnob.tsx:9`). Two comments still claim "The simple view keeps `KnobSlider`" (`KnobRow.tsx:133`, `KnobSlider.browser.test.tsx:114`). That is false: `simple/PositionSlider.tsx:41` uses `KnobTrack`.
  - `FieldHelp` is referenced only for `descId`, and `viewHelpEntries` has no caller: `grep -rn viewHelpEntries .` finds only its own definition.
  - A block-level count of rules whose selectors name only these classes gives about 184 lines, before nested media/container blocks and their comments. That is roughly 15% of `console.css`.
  - `console.test.ts:15-20` asserts that `.fw-k .fw-swatches { display: flex }` still exists. That is the dead rule. The live strip is styled by `.kv-g .fw-swatches` (`console.css:853`), which that test does not guard. So the test protects the wrong thing.
- **Proposal:** Move `percent` and `boundOn` into `KnobRow.tsx` (or a `track.ts`) and delete the `KnobSlider` component and its half of the test file. Keep `descId` and delete the rest of `FieldHelp.tsx` along with `viewHelpEntries` and `ViewField.help`. Delete the CSS blocks listed above. Point `console.test.ts` at `.kv-g .fw-swatches`, or drop it.
- **Size:** S. **Payoff:** high. About 350 lines go and none of them are live; the misleading comments go with them.

#### 2. One knob-row shell, and split `ViewPanel.tsx` into a rows module

- **Where:** Every row repeats the same skeleton: `<div className="kv-row" title=…>`, then `<KnobLine label={<label className="kv-lab" htmlFor=…>} help={button} …/>`, then `{paragraph}`, plus `useKnobHelp(helpId, name, text)`. Instances:
  - `console/ValueKnob.tsx:75-138`
  - `console/ChoiceKnob.tsx:31-60`
  - `console/StartKnob.tsx:43-76`
  - `console/ViewPanel.tsx:79-143` (NumberRow), `:155-190` (PointRadiusRow), `:209-236` (FlagRow), `:265-295` (ColourRow), `:308-332` (ThemeRow), `:349-407` (PaletteRow)
  - `simple/SimplePanel.tsx:51-75` (SkeletonRow), `:88-115` (RandomRow)
  - `simple/PositionSlider.tsx:27-62`

  Specific copies:
  - The "special value chip + last value + release" logic is in both `ValueKnob.tsx:57-69,102-119` and `ViewPanel.tsx:81-89,113-127`. Both have the `useRef` + `useEffect(() => { if (!isX) last.current = value }, …)` pair.
  - `PointRadiusRow` (`ViewPanel.tsx:150-191`) is `NumberRow` with different bounds and keys.
  - `RandomRow` (`SimplePanel.tsx:82-116`) is `FlagRow` (`ViewPanel.tsx:204-237`) with different keys.
- **Why:** `ViewPanel.tsx` (535 lines) is really a library of 10 exported row components (`SimplePanel.tsx:6` and `library/BoardPreview.tsx:4` import them) with a 60-line panel at the end. Any change to the row markup (an aria attribute, a class) has to be made in about 12 places.
- **Proposal:**
  - Add `RowShell({ id, name, title, help, labelFor | labelId, className, why?, children })`, which owns `useKnobHelp`, the label element and the paragraph.
  - Add `useReleasableChip(value, isSpecial, fallback)`.
  - Make `NumberRow` take `bounds`/`step`/`unit` so `PointRadiusRow` becomes one call.
  - Make `FlagRow` take `{ id, name, title, help, on, onToggle }` so `RandomRow` and `OptionSwitch` reuse it.
  - Move the rows to `console/rows/*.tsx` and leave `ViewPanel.tsx` as the panel.
- **Size:** M. **Payoff:** high. About 300 lines less, one place for row a11y, and `ViewPanel.tsx` becomes about 80 lines.

#### 3. One schema for the view, and one `view.apply()` action

- **Where:** The list of view fields is written out by hand in:
  - `state/view.slice.ts:18-95` (state) and `:131-146` (defaults)
  - `state/useUrlHash.ts:13-32` (`viewFor`)
  - `state/url.ts:6-35` (`HashView`) and `:124-150` (`decodeHash`)
  - `state/useUrlHash.ts:35-69` (`applyPayload`)
  - `library/BoardColumn.tsx` `loadIntoLab`, which writes eight fields one by one: `view.setNumber('cell', …)` … `view.setFlag('hilite', saved.top > 0)`.

  Metadata is split across four parallel tables in `console/viewFields.ts`: `VIEW_FIELDS` (34-40), `VIEW_FLAGS` (51-60, where `label` equals `flag` for all five entries), `VIEW_ROWS` (83-89) and `FLAG_ROWS` (92-98).
- **Why:** Adding a view field means editing about seven places. `applyPayload` makes about 15 separate `set` calls, so every non-React subscriber runs 15 times: the hash writer (`useUrlHash.ts:160`) and `useAutoRun`'s `useStore.subscribe`.
- **Proposal:**
  - Add `view.apply(patch: Partial<ViewFields>)`, which does all the clamping in one `set`. Use it in `applyPayload` and `loadIntoLab`.
  - Derive `viewFor` from a field list rather than retyping it.
  - Merge the four metadata tables into one `VIEW_ROWS` record (`{ label, short, help, unit?, auto?, step? }`), keyed by field and flag.
- **Size:** M. **Payoff:** medium-high. New view fields (the point grid and paper/ink each touched all of these places) become one-place changes.

#### 4. `App.tsx`: one hotkey table and one dismiss hook, and move side effects out

- **Where:**
  - Four `document.addEventListener('keydown', …)` hooks: `App.tsx:105-116` (`useSoloKey`), `:130-142` (`usePaletteKey`), `:162-188` (`useDrawerKeys`) and `:199-211` (`useRunKeys`). Three of them share `isHotkeyRefused` and an `onWorkspace` gate.
  - `useStoreSave` (`App.tsx:39-67`) is a store-to-API side effect that has nothing to do with the shell.
  - The "outside press + capture-phase Escape inside + refocus trigger" dismiss logic is hand-written four times: `shell/TopBar.tsx:31-50`, `run/MoreMenu.tsx:34-54`, `run/PresetStrip.tsx:~50-104` and `palette/CommandPalette.tsx:92-108` (on `mousedown`).
- **Why:** The ordering rules between these listeners (Escape precedence, `defaultPrevented`) are documented in comments across five files. A table would make the order visible in one place, and one `useDismiss` would stop the four popovers from drifting.
- **Proposal:**
  - Add `shell/hotkeys.ts` with `isHotkeyRefused` and a `useWorkspaceKeys(control)` that registers one listener over a `{ key, action }` table. Keep ⌘K separate, as its comment argues.
  - Move `useStoreSave` to `library/useStoreSave.ts`.
  - Add `useDismiss({ open, inside: RefObject[], onClose, returnFocus })` and use it in the four popovers.
  - `Shell` then drops to about 60 lines.
- **Size:** S-M. **Payoff:** medium. About 120 lines less and one source of truth for key precedence.

#### 5. CSS: remove the `.fw button` specificity tax, add a few tokens, and fix one breakpoint

- **Where:**
  - `design/shell.css:79-85`: `.fw button { … color: inherit }` has specificity (0,1,1). Because of it, 113 selectors across the files are prefixed with `.fw ` just to win (`grep -cE "^\s*\.fw \."`: console 37, shell 33, run 30, library 11, docs 2). The comments say so: `run.css:19-21` ("Every rule in this file carries the prefix for the same reason"), `console.css:336`, `shell.css:495`.
  - `tokens.css` has only colours and fonts. Repeated raw values: `44px` (touch target) 45×, `28px` 22×, `32px` 18×, `font-size: 11px` 26×, `1px solid var(--border)` 30×. There are 71 distinct `padding` declarations.
  - The low-window breakpoint disagrees by 1px. `state/band.ts:18` and `shell.css:761` use `max-height: 699px`, but `console.css:1144` and `shell.css:443` use `max-height: 700px`. At exactly 700px tall, the board and rows give up their minimum while JS (`useLowWindow`) says "not low".
- **Proposal:**
  - Write the reset as `:where(.fw) button` or put it in `@layer reset`, then strip the `.fw ` prefixes mechanically (the invariant audit and layout tests cover regressions).
  - Add `--touch: 44px`, `--hd`-style size tokens and a 4px spacing scale (the gap values are already 1/2/4/6/8/10/12/16/20/32).
  - Align the 700 and 699 queries, and add a node test that greps the CSS media queries against `band.ts`'s list. This repo already pins CSS text that way (`tokens.test.ts`).
- **Size:** M. **Payoff:** medium. Specificity fights become impossible by construction, and the spacing chaos noted in the 2026-09-22 visual review gets its tokens.

#### 6. Library column: reuse the run column's pieces

- **Where:**
  - `library/BoardColumn.tsx:86-97` (`copy`) is a line-for-line copy of `run/useCopy.ts:17-35`.
  - The SVG export worker state (`drawing` ref, `busy`, error, terminate on unmount, `drawSvg(…, onError, onDone)`) is duplicated between `BoardColumn.tsx:59-72,160-174` and `run/ExportButtons.tsx:43-48,78-97`.
  - The exports markup (`fw-ghost fw-exports`, `svgThemeNote`, `fw-export-error`) is duplicated between `BoardColumn.tsx:204-221` and `ExportButtons.tsx:104-126`.
  - The command figure (`figure.fw-cmdfig > figcaption.fw-cmdhd > copy button + pre.fw-cmd`) is duplicated between `BoardColumn.tsx:185-195` and `run/LiveCommand.tsx:25-35`.
- **Why:** `BoardColumn` (233 lines) mixes clipboard, the delete confirmation, store writes, a worker and formatting. The two columns are meant to look and behave alike, and today they can drift.
- **Proposal:** Use `useCopy`, and add `useSvgExport()`, `<CommandFigure label caption command/>` and `<ExportGroup onSvg onFile busy error note/>`. `loadIntoLab` becomes `view.apply(meta.view)` (see refactor 3).
- **Size:** S-M. **Payoff:** medium.

#### 7. Test fixtures: CSS barrel, one app reset, one router mount

- **Where:**
  - 25 test files import a hand-picked subset of the 8 stylesheets. For example, `routes/LabLayout.browser.test.tsx:7-11` imports 5 of them, and `main.tsx:11-18` is the only complete list. The harness notes say the browser project loads no CSS unless a test imports it.
  - `routes/Workspace.browser.test.tsx:24-60` defines its own `mountApp`. It copies `harness/mountApp.tsx:22-46` (`resetApp`) but misses five of its resets: `cancelPendingSave`, `cancelNoticeFade`, `cancelFlash`, `closePalette` and `clearFocusRequest`. It also shares the harness function's name.
  - The view slice has no reset (`mountApp.tsx:15`), so 6 files patch it through `useStore.setState((s) => ({ view: { ...s.view, … } }))`. Examples: `BoardFrame.browser.test.tsx:27`, `SimplePanel.browser.test.tsx:62`, `LayoutInvariants.browser.test.tsx:110`.
  - 12 files wrap a component in `<MemoryRouter initialEntries={[path]}><div className="fw" style=…>` (for example `BoardFrame.browser.test.tsx:35-44`, `ReportPanel.browser.test.tsx:34-42` and `RunStatusBar.browser.test.tsx:18-24`).
- **Proposal:**
  - Add `design/index.css`, imported by `main.tsx` and by every layout test.
  - Replace `resetApp`'s 20 setter calls with `useStore.setState(useStore.getInitialState(), true)` (zustand v5), or with per-slice `reset()` actions. That covers new fields automatically.
  - Delete the local `mountApp` in `Workspace.browser.test.tsx`.
  - Add `renderAt(node, { path, box })` to the harness.
- **Size:** S-M. **Payoff:** medium. The cascade in tests matches production, and a new UI field cannot leak between cases.

#### 8. Move `useStoredBoard`'s orchestration into a library action

- **Where:** `library/useStoredBoard.ts:23-105` is one effect with five exits, each with its own rule for clearing the `loading` notice. The comments at 49-53 and 62-67 record review rounds that found stranded notices.
- **Proposal:** Add `library.open(size, id, metas)` / `library.close()` as store actions (or plain functions in `library/`) that return a cancel handle. The effect then only calls `open` and returns its cancel. The state machine becomes testable in the fast `node` project instead of only through browser mounts.
- **Size:** M. **Payoff:** medium. This logic has already cost two review rounds.

#### 9. One roving-focus helper

- **Where:** Arrow/Home/End handling is written separately in `shell/TabRow.tsx:30-50`, `console/GroupRail.tsx:40-51`, `library/BoardsRail.tsx:~63-75`, `shell/Segmented.tsx:~36-50`, `palette/CommandPalette.tsx:144-157` and `run/PresetStrip.tsx:78-92` (2-D). The "focus follows selection" ref callback appears in both `TabRow.tsx:65-69` and `GroupRail.tsx:58-60`.
- **Proposal:** Add a pure `nextIndex(key, current, count, { wrap, axis })` plus `useFocusFollowsSelection()`. The ref callbacks are recreated on every render, so today they call `focus()` on every render while the strip has focus.
- **Size:** S. **Payoff:** low-medium.

#### 10. Replace `file.ts:NN` references in comments with symbol names

- **Where:** There are 16 such references in production code. At least 7 are stale:
  - `App.tsx:260,264`: "useGenerator.ts:89 / :94". The cleanup is at `useGenerator.ts:87` and the kill in `start` at `:92`.
  - `stage/useRunState.ts:182`: "useGenerator.ts:67, :77, :82". The `failed()` calls are at 65, 75 and 80.
  - `useRunState.ts:184`: "`workerError` (lab-i18n.ts:125)". It is at `packages/engine/lab-i18n.ts:306`.
  - `run/OptionSwitch.tsx:7`: "`ViewPanel.tsx:9-15`". Those lines are imports and the swatch doc; the switch is at `ViewPanel.tsx:222-231`.
  - `shell.css:394`: "arrowz-board.ts:129-135". Those lines declare `play`, `pad` and `showPoints`, not host styling.
  - `simple/applyRecipe.ts:22`: "arrowz-board.ts:422-428" plus "`Stage` memoises the element's view". Those lines are the gestures button template, and the memo lives in `BoardFrame`. The claimed cost is also gone: `arrowz-board.ts:462-472` now skips a view change whose geometry key is unchanged.
  - `stage/BoardFrame.tsx:16,45`: "arrowz-board.ts:178-185 / 582-594". These point at cursor CSS and the `colored` getter; the precedence doc is at 593.
- **Proposal:** Cite `useGenerator`'s `kill`, `arrowz-board`'s `drawView()` and similar symbols instead of line numbers, and grep for `\.(ts|tsx|css):[0-9]` in review.
- **Size:** S. **Payoff:** low-medium. These comments are what reviewers rely on here.

#### 11. Try the React Compiler

- **Where:** `vite.config.ts` and `vitest.config.ts` run plain `react()`. `babel-plugin-react-compiler` appears in `pnpm-lock.yaml:677` only as an optional peer and is not installed. The lint side is already on: `react-hooks` v7 `flat.recommended` in `eslint.config.js`. Several comments work around its absence, for example `run/useAutoRun.ts:17-19` ("with nothing in `apps/lab` memoised against it") and the whole-slice subscriptions under "Smaller practice issues" below.
- **Proposal:** Enable it behind a flag, run the full browser suite and a drag trace, and keep it if both hold. The code already passes the compiler's lint rules (one `eslint-disable` in all of `src`, at `CommandPalette.tsx:188`, and it is for jsx-a11y).
- **Size:** S to try. **Payoff:** medium if it holds.

### Smaller practice issues

- **Whole-slice subscriptions** re-render on any field change. The worst is `console/ViewPanel.tsx:478`: `const view = useStore((state) => state.view)` re-renders the whole panel on every stroke drag when it only reads `hilite`/`showPoints`/`pointColor`/`setPointColor`. The same pattern is at `ViewPanel.tsx:430` (`ColoursSection`), `run/LiveCommand.tsx:19`, `palette/CommandPalette.tsx:46`, `stage/BoardFrame.tsx:28` (used as a `useMemo` dep at `:75`) and `stage/useRunState.ts:123` (`state.run`, which changes on every progress message). Use field selectors or `useShallow`.
- **`specOf(key)` is written four times:** `state/params.slice.ts:18` (Map-based), `console/KnobPanel.tsx:16`, `simple/SimplePanel.tsx:16` and `console/StartKnob.tsx:17-21` (as `MIX_SPEC`), plus one more in `KnobPanel.browser.test.tsx`. Export one from `params.slice.ts`.
- **`MIX_SPEC` is "Exported for the tests"** (`StartKnob.tsx:14-15`), but no test imports it. Its only use is `StartKnob.tsx:77`.
- **Hard-coded `'on' : 'off'`** in the command palette (`palette/commands.ts:115`), while the same flags read `dict.t(on ? 'valueOn' : 'valueOff')` in `ViewPanel.tsx:220`. This breaks the bilingual-UI rule in `CLAUDE.md`.
- **`autoHeadWidth` copies the engine's rule** (`console/viewFields.ts:108-112`, `0.4 + 0.9 * stroke`) that lives inline at `packages/engine/geometry.ts:104`. The engine should export it, so the two cannot drift.
- **`file: unknown` then `as BoardFile`:** `api/boards.ts:9` returns `file: unknown`, and callers cast it (`library/BoardColumn.tsx:165`, `library/useViewSave.ts:71`) after `decodeBoard` has validated it. A type guard in the API layer, or a narrowing decoder, removes both casts.
- **Locale mapping duplicated with different results:** `lang === 'pl' ? 'pl' : 'en-GB'` at `library/BoardColumn.tsx:176` and `library/BoardList.tsx:43`, but `'en'` at `stage/useRunState.ts:38`. It belongs on `Dict` (for example `dict.locale`).
- **Slice boilerplate:** `type SetStore = …` is redeclared in all 8 slices (`view.slice.ts:97`, `ui.slice.ts:104`, `params.slice.ts:90`, …). `const patch = …` is written 4 times. The toggle-and-persist logic in `ui.slice.ts:142-164` appears twice for `report` and `settings`. `params.slice.ts` `setStart` re-implements `write`'s body. A generic `SliceSet<K, S>` in `store.ts` and a `persistedFlag(key)` helper would cover these.
- **`paletteUpdate(_state, colors)`** (`state/view.slice.ts:122`) no longer reads `_state`: it is left over from the repealed theme exclusion. Drop the parameter at its 4 call sites.
- **`const set = onSet`** (`ViewPanel.tsx:80`) is an alias with no purpose.
- **`params.broken[key]` is rebuilt on every commit** (`params.slice.ts:47-54`), so a knob that stays broken re-renders on every edit anywhere. The "sparse on purpose" argument (`:38-41`) holds only for knobs with nothing to say. A per-key structural compare would fix it if it matters.
- **Workspace class string:** `routes/Workspace.tsx:85` builds its className from five nested template-literal conditionals, and `ValueKnob.tsx:78` and `ChoiceKnob.tsx:33` repeat the pattern. A 5-line `cx()` would make these readable.
- **Very long comments:** `run/RunColumn.tsx:57-117` spends 60 lines of measurement log on a 10-line effect, and `stage/BoardFrame.tsx:30-60` is similar. Keep the rule in the code and move the measurement tables to the spec or harness notes. Long comments are part of this repo's style, but these are the extreme cases and they are where stale line references accumulate (refactor 10).
- **`BoardFrame` memo keys** (`stage/BoardFrame.tsx:69-76`): `labView` depends on the whole `view` object, so theme, point colour or point radius edits rebuild the element's `view` prop. It is harmless today only because of the element's geometry-key guard (`packages/board-element/src/arrowz-board.ts:462-472`). Key the memo on the fields `viewOf` and `voids` actually read.
- **Circular type import:** `console/Console.tsx:2` imports `WorkspaceTab` from `routes/Workspace.tsx`, which imports `Console`. It is type-only, so harmless at runtime, but the type belongs in `state/ui.slice.ts` next to `BoardsPanel`.

### Dead code and CSS

Found with the export scan (for each `export` in a non-test file, `grep -rlw NAME src` minus the defining file and test files) and then checked by hand:

| Item | Evidence |
|---|---|
| `KnobSlider` component (`console/KnobSlider.tsx:32-80`) | Only importer is `console/KnobSlider.browser.test.tsx:6`. Other hits are comments (`useAutoRun.ts:16`, `useUrlHash.ts:89`, `KnobRow.tsx:133`). |
| `FieldHelp`, `HelpEntry` (`console/FieldHelp.tsx:3-41`) | `FieldHelp` has no JSX use anywhere. `HelpEntry` is used only by `viewHelpEntries`. |
| `viewHelpEntries` (`console/viewFields.ts:63`) | `grep -rn viewHelpEntries .` finds only the definition. |
| `ViewField.help` (`viewFields.ts:18`) | `grep -rn "field\.help"` hits only `viewFields.ts:65`, inside the dead function. |
| `MIX_SPEC` export | Only in `StartKnob.tsx:17,77`. |
| `ThemeSwatchStrip` export | Only in `ViewPanel.tsx:25,329`; no other importer. |
| `.fw-k …` rules (about 38 selectors), `.fw-kdesc`, `.fw-grid`, `.fw-skeleton`, `.fw-ends` in `design/console.css` | `grep -rnw -e <class> --include='*.tsx' --include='*.ts' . \| grep -v test` is empty for `fw-grid`, `fw-skeleton` and `fw-ends`. For `fw-k` it finds only the `closest()` string at `useFocusRequest.ts:45`. `fw-kdesc` appears only in the dead `FieldHelp.tsx:32`. |
| `.fw-docs-nav` | Appears only inside a comment (`docs.css:98`); no rule, nothing to delete. |
| `design/console.test.ts:15-20` | Pins the dead `.fw-k .fw-swatches` rule. The live one is `.kv-g .fw-swatches` (`console.css:853`). |
| `useFocusRequest.ts:45` `, .fw-k` | Selector branch that can never match. |

Not dead, although the scan flags them:
- The `tk-*`, `fw-docs-code` and `fw-docs-term` classes are built dynamically (`docs/TokenSpans.tsx:16`, `routes/DocsBlock.tsx:35`).
- `.ts`/`.tsx` hits come from comments.
- Exports used only inside their own file (`indexesOf`, `reportInputOf`, `pageOf`, `WIDE_KEYS`, `luminance`, the storage `*_KEY` constants and a few types) are live code. Only the `export` keyword is unnecessary; low priority.

There is no `!important` anywhere: `grep -c '!important' design/*.css` is 0 for all 8 files.

### What is already good

- **Strict TypeScript:** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `verbatimModuleSyntax` are all on. ESLint enforces `no-explicit-any` and `no-non-null-assertion`, and the `react-hooks` v7 compiler-derived rules pass with a single `eslint-disable` (jsx-a11y) in all of `src`.
- **zustand store design:** one store with named slices, per-key selectors for knobs (`ValueKnob.tsx:43-48`), `getState()` in event handlers and a subscription inside `useEffect` rather than render-time subscriptions for the auto-run and URL writer (`useAutoRun.ts:47`, `useUrlHash.ts:160`). `completeRun` updates two slices in one `set` (`store.ts:51-58`).
- **Derived state instead of effects:** the "adjust state while rendering" pattern is used correctly (`KnobRow.tsx:221-222`, `MoreMenu.tsx:21-29`). `useSyncExternalStore` backs the media-query bands (`shell/useLayoutBand.ts`). Async effects drop late answers with cancellation flags (`useStoredBoard.ts:71-104`, `ExportButtons.tsx:53-67`).
- **Stable node identity:** the arrangement that keeps `<arrowz-board>` and its GL context mounted across routes (`Workspace.tsx:87-100`) is deliberate and well tested.
- **Accessibility:** roving tabindex, the combobox and dialog contract in the palette, focus handoff before `disabled`/`hidden` (`RunColumn.tsx:118-129`, `Stage.tsx:15-25`), and the live region as the single voice.
- **Test harness:** the computed-layout invariant audit (`harness/invariants.ts`) checks what the browser actually rendered, not declared styles. `vitest.config.ts` has a separate node project, a node-integration project and a Chromium project.
- **CSS:** one file per surface and no `!important`. Specificity decisions are commented where they are made.

## Comment prose

Audit of comment length and style in `apps/lab/src` (source and tests, `*.ts`, `*.tsx`, `*.css`), `packages/board-element/src`, and the engine's lab files (`lab-i18n.ts`, `lab-report.ts`, `lab-simple.ts`, `lab-presets.ts`, `lab-docs.ts`). Worktree `/Users/tomek/dev/arrowz-review` at `b9a5a9d`. Read-only. The scripts are `comment_stats.py`, `markers.py` and `estimate.py` in this directory. The raw per-file and per-block data is in `comment_stats.json`.

### Measurements

Method: a line counts as a comment line if everything on it that is not blank is comment (`//…`, inside `/* … */` or JSDoc, JSX `{/* … */}`). Code with a trailing comment counts as code. A block is a run of consecutive comment lines, and a blank line ends it.

**Overall: 8,282 comment lines against 27,849 code lines, so 22.9% of all non-blank lines are comments.** The files span 237 in total.

| slice | files | comment | code | ratio |
|---|---|---|---|---|
| source `ts/tsx` | 128 | 4,091 | 10,690 | **27.7%** |
| tests | 101 | 3,463 | 14,157 | 19.7% |
| CSS | 8 | 728 | 3,002 | 19.5% |
| `apps/lab` | 194 | 6,162 | 19,721 | 23.8% |
| `board-element` | 38 | 1,781 | 6,467 | 21.6% |
| engine `lab-*` | 5 | 339 | 1,661 | 17.0% |

**Block length distribution.** The 304 blocks longer than 6 lines hold 3,278 lines, which is 40% of all comment prose:

| block length | blocks | lines |
|---|---|---|
| 1 | 785 | 785 |
| 2–3 | 822 | 1,924 |
| 4–6 | 475 | 2,295 |
| 7–10 | 194 | 1,548 |
| 11–20 | 96 | 1,301 |
| 21+ | 14 | 429 |

**Narrative markers inside comment lines.** These are regex counts over comment lines only:

| marker | lines | files |
|---|---|---|
| `§N` / "spec" | 266 | 111 |
| `PR n` / `#nn` | 214 | 87 |
| "Ruling N" | 174 | 84 |
| "handoff" | 174 | 72 |
| "measured…" | 166 | 60 |
| `round N` | 111 | 51 |
| "review" / "reviewer" | 98 | 42 |
| "Task N" / "the plan" | 28 | 20 |
| `file.ts:NN` line citations | 34 | — |
| "harness fact N" / "(fact N)" | 10 | 10 |

At least one of these markers appears on 805 distinct comment lines.

**Top 20 files by comment ratio** (only files with at least 20 non-blank lines):

| ratio | comment | code | file |
|---|---|---|---|
| 63% | 29 | 17 | apps/lab/src/console/useFocusRequest.ts |
| 63% | 17 | 10 | apps/lab/src/library/openEntry.ts |
| 57% | 12 | 9 | apps/lab/src/library/useOpenPreview.ts |
| 57% | 25 | 19 | apps/lab/src/simple/applyRecipe.ts |
| 56% | 14 | 11 | apps/lab/src/stage/RunStatusBar.tsx |
| 55% | 11 | 9 | apps/lab/src/harness/storage-a.browser.test.ts |
| 55% | 11 | 9 | apps/lab/src/harness/storage-b.browser.test.ts |
| 55% | 22 | 18 | apps/lab/src/library/notices.ts |
| 55% | 24 | 20 | apps/lab/src/design/tokens.css |
| 54% | 37 | 32 | apps/lab/src/run/useAutoRun.ts |
| 53% | 51 | 45 | apps/lab/src/library/useViewSave.ts |
| 53% | 39 | 35 | apps/lab/src/run/ClampNotice.tsx |
| 52% | 36 | 33 | apps/lab/src/run/actions.ts |
| 50% | 98 | 99 | apps/lab/src/run/RunColumn.tsx |
| 49% | 44 | 45 | apps/lab/src/state/library.slice.ts |
| 49% | 21 | 22 | packages/board-element/src/gl-color.ts |
| 47% | 39 | 44 | packages/board-element/src/docs-api.browser.test.ts |
| 46% | 52 | 60 | apps/lab/src/routes/Workspace.tsx |
| 46% | 11 | 13 | apps/lab/src/state/storage.ts |
| 46% | 92 | 110 | apps/lab/src/stage/useRunState.ts |

Most comment lines in absolute terms: `routes/Workspace.browser.test.tsx` (389), `design/console.css` (280), `board-element/gl-layer.ts` (245, 42%), `board-element/arrowz-board.ts` (220), `board-element/gl-layer.browser.test.ts` (220).

**Top 20 longest blocks:**

| lines | location | opens with |
|---|---|---|
| 61 | apps/lab/src/run/RunColumn.tsx:57 | "Both of these buttons are a landing spot with an expiry date…" |
| 43 | packages/board-element/src/perf.browser.test.ts:1 | "Nightmare 100×100 (915 pieces at seed 7) builds under a budget…" |
| 37 | packages/board-element/src/perf.browser.test.ts:220 | "The project ceiling, measured rather than guarded…" |
| 34 | apps/lab/src/state/useUrlHash.ts:80 | "The URL hash, in both directions…" |
| 31 | apps/lab/src/stage/BoardFrame.tsx:30 | "A stored board is drawn under its own stored view…" |
| 30 | apps/lab/src/run/triggers.browser.test.tsx:20 | "Spec §2.2's table, stated as cases: one per row this PR owns." |
| 30 | packages/board-element/src/perf.browser.test.ts:164 | "A CPU-bound task runner distorts wall-clock frame timing…" |
| 27 | apps/lab/src/run/useAutoRun.ts:11 | "Generate a while after the last knob was typed…" |
| 25 | apps/lab/src/routes/useSectionInView.ts:10 | (JSDoc) |
| 24 | apps/lab/src/console/useFocusRequest.ts:7 | "A jump waiting in `ui.focusTarget`…" |
| 22 | apps/lab/src/App.tsx:250 | "Spec §2.2's last row: the lab opens on a board…" |
| 22 | apps/lab/src/routes/DocsNav.tsx:48 | (JSDoc) |
| 22 | apps/lab/src/run/RunColumn.browser.test.tsx:113 | "The clamp notice parks the focus on Abort…" |
| 21 | apps/lab/src/routes/Workspace.browser.test.tsx:693 | "Ruling 1: the run column is hidden in the library, not replaced." |
| 20 | apps/lab/src/design/palette.css:5 | "The ⌘K trigger. It sits in the top bar…" |
| 20 | apps/lab/src/design/tokens.css:1 | "The Fronthub design system's tokens as the workshop mock declares them…" |
| 20 | apps/lab/src/routes/Workspace.browser.test.tsx:84 | "`getByRole('status', { name: 'Run status' })` and not the bare role…" |
| 20 | apps/lab/src/run/ClampNotice.tsx:35 | "The button dismisses itself, so focus would land on <body>…" |
| 20 | apps/lab/src/run/ExportButtons.tsx:18 | (JSDoc) |
| 20 | packages/board-element/src/gl-layer.ts:587 | "Hands everything back: the GL objects, and then the context itself." |

### What the long comments do

Most long blocks do contain a real WHY, and they are not padding. The trouble is that the WHY sits inside two to five times as much text around it. Across the blocks read (the top 20 plus the densest small files), the prose falls into the following classes.

**(a) WHY and non-obvious constraints. Keep them, but only the constraint itself.** Every long block has one. `RunColumn.tsx:57-117` has one: disabling the focused button drops focus to `<body>`, so the effect moves it to the partner button, and two animation frames are the floor for observing that. `App.tsx:250-271` has one: the effect is deliberately unguarded because StrictMode's cleanup kills the worker. `useUrlHash.ts:80-113` has three solid constraints. `lab-simple.ts:1-19` is a good module header: it explains the slider-as-range model, and nothing in the code says that. `gl-layer.ts:587-606` (`dispose`) is almost all (a). `console.css:239-257` (`.fw-vh`) explains each line of a visually-hidden rule, which is legitimate but longer than the rule needs. The short ones are the model. `RunColumn.tsx:53-54` says "One decimal everywhere the share shows: the label, the fill and the progressbar's value say the same number."

**(b) The code restated.** This class is less common than the others, but it appears in the long blocks as step-by-step retellings of a conditional. `ClampNotice.tsx:41-48` spells out `disabled={running || blocked}` against `disabled={!running}` in prose, when the code beside it states both. `openEntry.ts:10-15` walks through the two branches of a three-line function.

**(c) History and narrative. This is the largest class to cut.** There are 805 comment lines with PR, round, Ruling, handoff, review, task or fact markers. Some examples:
- "Review round 3 deleted this branch from the hook and nothing went red — this is that missing case." (`useStoredBoard.browser.test.tsx:93-94`)
- "this task's review found that deleting its whole `setTimeout` block … left every other case green. Task 8's `deleted` notice leans on this same branch — and the `deleted` fade is the one the plan's own history records as broken once already." (`useViewSave.browser.test.tsx:176-180`)
- "before PR 5b the list fell back to the first size's rows" (`openEntry.ts:6`)
- "`--ok` was the other such token until round 3 of the handoff gave it a use" (`tokens.css:2-4`)
- "the 112px rail below 900px was PR 1's stopgap, deleted in PR 7" (`Workspace.browser.test.tsx:875-877`)
- "Revision 1 asked the opposite question … and that could not be made to work here" (`useUrlHash.ts:95-109`), which is an 11-line post-mortem of a design that is no longer in the code.
- "a review finding once left the preview branch discarding the palette" (`BoardFrame.tsx:58-60`)
- "A later task adds a second `role=\"status\"` region (a clamp notice), so this one gets a name now, ahead of that" (`RunStatusBar.tsx:18-20`). That task has already landed, so the comment is stale.

**Many of these references cannot be followed.** "Ruling N" appears on 174 lines, but seven different plan files under `docs/superpowers/plans/` each define their own `**Ruling 1**` and `**Ruling 3**`. That makes "Ruling 3" in `useAutoRun.ts:21` ambiguous, and only one site writes "Ruling 3 of PR 4a". "harness fact N" (`actions.test.ts:23` "(fact 40)", `palette.test.ts:4` "harness fact 38", and 8 more) is cited in code and plans, but nothing in the repository defines it. The numbering lives in a private note outside the repo.

**File and line citations drift.** There are 34 `file.ts:NN` citations, and all three that were checked have moved:
- `App.tsx:260` cites `useGenerator.ts:89` for the cleanup that terminates the worker. It is now at line 86.
- `App.tsx:264` cites `useGenerator.ts:94` for the busy kill. It is now at line 91.
- `BoardFrame.tsx:45` cites `arrowz-board.ts:582-594` for "stated beats named beats default". That text is at lines 591-596, and lines 582-590 are now the `colored` getter.

**(d) The same explanation in several places.** Some examples:
- The focus-fixup timing study is written four times:
  - `RunColumn.tsx:71-90`, with the full table;
  - the `twoFrames` JSDoc at `RunColumn.browser.test.tsx:51-56`;
  - `RunColumn.browser.test.tsx:113-134`, which has the same numbers in prose ("0/20 … 0–2/20 … 20/20");
  - `RunColumn.browser.test.tsx:150-156`.

  `twoFrames` is also defined a second time at `LabLayout.browser.test.tsx:150`.
- "about sixty times a second during a drag" appears in 6 files: `useUrlHash.ts:90`, `useAutoRun.ts:17`, `applyRecipe.ts:23`, `applyRecipe.test.ts:38`, `useUrlHash.browser.test.tsx:140` and `gl-color.ts:33`.
- `openEntry.ts:24-26` repeats the JSDoc directly above it at lines 10-15, adding "which is what PR 5a's own case asserts".
- `Workspace.browser.test.tsx:87-103` explains the per-test timeouts "for the reason useGenerator.browser.test.tsx records", so the explanation exists twice over.

**(e) Test comments that narrate the mutation which made them fail.** There are 35 comment lines in 24 files, for example `LibraryFace.browser.test.tsx:157-161`, `Workspace.browser.test.tsx:848-852` and `Workspace.browser.test.tsx:701-703`. **Verdict: one clause earns its place, and the rest does not.** A test that looks redundant next to another test needs one sentence saying what only it catches, for example "the slice cases cannot see which outcome `listBoards` hands over". Without that sentence, a future reader deletes the test as a duplicate. The rest of the story belongs in the commit message: who deleted what, in which review round, and how many cases stayed green. The same goes for the rest of the measurement protocol, such as "Chrome 153.0.8010.12, batches of 20, five batches, one of them a reviewer's".

**Measurements in source.** There are 166 "measured" lines. A measured fact that justifies a number (`twoFrames`, a timeout, a budget) is (a), so state the result and keep it. The protocol, the per-sample tables and the environment matrix (`perf.browser.test.ts:15-43` compares three browser environments for a layer that "this branch replaced") are a lab notebook. They belong in `docs/` or in the PR, with a link to them.

### Rewrites (before / after)

Each "after" keeps the constraint a maintainer needs in order not to break the code.

**1. `apps/lab/src/run/RunColumn.tsx:57-117` (61 lines → 9)**

Before (excerpt of the 61 lines):
> // Both of these buttons are a landing spot with an expiry date, because each
> // is disabled by one of the two transitions of `running`, and HTML's focus
> // fixup then hands the focus to `document.body`. …
> // When the fixup runs was measured rather than assumed: batches of 20 samples
> // per sampling point, both transitions, Chrome 153.0.8010.12, the matching
> // branch cut out. The ranges span five batches, one of them a reviewer's:
> //   sampling point                  `document.activeElement` is `<body>`
> //   synchronously after the commit   0/20 …
> // `wasRunning` is redundant against the dependency array as it stands … and it stays because …
> // Only the ending branch can miss. … left open here deliberately rather than answered in passing.

After:
```ts
// Starting a run disables Generate, and ending one disables Abort. HTML's
// focus fixup would then drop a keyboard user's focus on <body>, so hand it
// to the partner button. useLayoutEffect runs before the fixup (two frames
// later, see `twoFrames` in the test), while the focus is still on the
// outgoing button. Act on the transition of `running`, not on its value,
// and only when the focus is on the button being disabled; `wasRunning`
// keeps that true if the dependency list grows. Known gap: if a rule is
// broken when a run ends, Generate stays disabled and the focus is lost.
// Choosing where it goes then is an open design question.
```

**2. `packages/board-element/src/perf.browser.test.ts:1-43` (43 lines → 8)**

Before (excerpt):
> // What these numbers are NOT. There are three environments in play, …
> //   headless shell, dpr 1                pan mean   83 ms   build 1 330 ms
> //   real Chrome engine headless, dpr 2   pan mean  104 ms   build 1 920 ms
> //   Chrome 152 in the foreground, GPU    pan mean 1050 ms   build 2 761 ms
> // … Those three rows are the SVG layer's, not this layer's …

After:
```ts
// Nightmare 100×100 (seed 7) must build under budget and pan 20 frames in
// every `verify` run. Only the build time and the frame count are asserted,
// because they survive CPU contention. The pan budget and the Insane
// (1000×1000) report run only under ARROWZ_MEASURE=1.
// A frame reads max(work, frame interval): ~16.7 ms at 60 Hz means idle,
// not cost. Headless figures are a floor and a regression detector, never
// what a person sees. Foreground-GPU numbers and the old SVG baseline live
// in docs/ (link).
```
The SVG-layer table describes code that no longer exists, so it moves to `docs/` or is deleted.

**3. `apps/lab/src/state/useUrlHash.ts:80-113` (34 lines → 13)**

Before (excerpt of item 3):
> * 3. **The listener compares against the store, not against history.** … Revision 1 asked the opposite question —
> *    "did I write this?" — with a one-shot ref set on every write, and that
> *    could not be made to work here. `replaceState` fires no `hashchange` on
> *    any engine or per the standard's own sentence, so nothing ever spent the
> *    ref; … (edit to `#B`, paste `#C`, Back to `#B` → dropped: address bar B, page C, no run). …

After:
```ts
/**
 * The URL hash, in both directions. Mounted once, in `App`.
 *
 * 1. The link is read once, guarded by a ref (not by `[]`): StrictMode's second
 *    run would decode the hash this hook just wrote and lower the clamp notice.
 * 2. Writes are debounced: a slider drag commits ~60×/s, and browsers throttle
 *    or throw on `replaceState` at that rate.
 * 3. `hashchange` compares the fragment against the store, not against "did I
 *    write this": `replaceState` fires no `hashchange`, so a "mine" flag is never
 *    cleared and would swallow a later Back/Forward onto the same fragment. A
 *    fragment that already matches the store also must not restart a carve.
 * The subscription lives in an effect, not in a render selector (see `useAutoRun`).
 */
```

**4. `apps/lab/src/stage/BoardFrame.tsx:30-60` (31 lines → 8)**

Before (excerpt):
> // While the store kept `view.palette` and
> // `view.theme` mutually exclusive, a live theme and a custom palette could
> // never coexist, so this guard was mostly belt-and-braces; Ruling 6
> // repealed that exclusion, and now that the two DO coexist, this guard is
> // the only thing standing between an empty field and a blanked-out theme. …
> // `labView` alone — a review finding once left the preview branch
> // discarding the palette, …

After:
```ts
// A stored board is drawn under its own saved view (`meta.view`), and only
// while the Boards tab is showing: the preview is cleared one commit after
// the route changes. Colour overrides are added only when the user set them.
// The element treats even an empty field as "stated", so it would beat the
// chosen theme and then sanitise back to the element's default, turning a
// dark theme light. Colour is a viewing preference, so the same overrides
// apply to the lab board and to the preview.
```
This drops the `arrowz-board.ts:582-594` and `view.ts:50-60` citations (the first has already drifted), plus "Ruling 3/O/6", "spec §5.3" and the review anecdote.

**5. `apps/lab/src/run/triggers.browser.test.tsx:20-49` (30 lines → 5)**

Before (excerpt):
> * Spec §2.2's table, stated as cases: one per row this PR owns. Every trigger
> * it names is already built, so this file is a statement of the contract
> * rather than a discovery about it. …
> * All ten rows are here. Cases 1–8 are the advanced view's; cases 9–18 are …

After:
```ts
/**
 * Every run trigger: when it starts a run, and with which knobs. The recorder
 * snapshots params at the call to `start()`, because a trigger that rewrites
 * the knobs (preset, New seed, Defaults) must do so before it runs. Read from
 * the store afterwards, the two orders look the same.
 */
```
Where the file tests something, and why it does not, is information that the test names and imports already carry.

**6. `apps/lab/src/run/useAutoRun.ts:11-37` (27 lines → 10)**

Before (excerpt):
> * the whole shell that often — the cost `useGenerator.ts:16-19` exists to
> * avoid, with nothing in `apps/lab` memoised against it.
> * It watches `params.edits` and not `params.values`, for the reason Ruling 3
> * gives: …
> * leave the other one to fire (Ruling 3 of PR 4a). …

After:
```ts
/**
 * Generate AUTO_DELAY_MS after the last knob or recipe edit. Mounted once, in `App`.
 *
 * - Subscribes inside the effect: a render selector would repaint the shell ~60×/s during a drag.
 * - Watches `params.edits`, not `values`: a preset writes every knob and runs at once.
 * - Reads `ui.auto` both at the edit (switching it on arms the next edit) and in the timer
 *   (switching it off cancels a pending run).
 * - Recipe edits ignore `auto` and leave a run owed until cancelled. One hook owns both,
 *   because `RunControl.hold` has a single cancel slot.
 */
```

**7. `apps/lab/src/App.tsx:250-271` (22 lines → 6)**

Before (excerpt):
> // then the effect again, and `useGenerator`'s own cleanup terminates the
> // worker (useGenerator.ts:89) — so the carve the first pass starts is killed
> // and, with a guard in place, never started again. Measured: the StrictMode
> // case in Workspace.browser.test.tsx sits in `running` until its poll times
> // out. … it kills a busy worker to make room for the next run (useGenerator.ts:94).

After:
```ts
// Open on a board: run once at mount, after `useUrlHash` has read the link
// (effects run in declaration order). Deliberately no run-once ref: StrictMode's
// cleanup terminates the worker, so a guarded second pass would leave no run.
// Starting twice is safe, because `start()` kills a busy worker. In the simple
// view, apply the recipe first unless the page opened on a link.
```
The two citations had already drifted by three lines each.

**8. `apps/lab/src/routes/Workspace.browser.test.tsx:693-713` (21 lines → 5)**

Before (excerpt):
> // Ruling 1: the run column is hidden in the library, not replaced. …
> // 414×896 the ≤900px query already gives `.fw-console` two tracks, so the
> // track assertion below would pass with the library rule deleted. Review
> // round 1 measured exactly that. …
> // before or after the read below is a race, and losing it sets R10's
> // `library.listError`, … lets the case assert what its comment claims.

After:
```ts
// Hidden by class, so reads use querySelector: role locators skip display:none.
// 1400 wide, because at the default 414 the ≤900px rule already yields two
// tracks and the assertion would pass without the library rule. `fetch` is
// mocked: unmocked, a race with `listError` collapses the console to one track.
```

**9. `apps/lab/src/run/ClampNotice.tsx:35-54` (20 lines → 6)**

Before (excerpt):
> // Unless that action is refused: this notice appears exactly when a preset
> // has just started a run, and Generate is disabled while one is in flight
> // (`disabled={running || blocked}` in `RunColumn`) — and `focus()` on a
> // disabled button is a no-op, so dismissing during a long carve dropped the
> // keyboard user on <body> after all. In exactly that state Abort is live: …

After:
```ts
// Dismissing removes the focused button, so move the focus on: to Generate
// (the run the preset was for), or to Abort while a carve is in flight and
// Generate is disabled. If both are disabled (a clamped link that also broke
// a rule), focus this region (tabIndex -1), which outlives the dismissal.
```

**10. `apps/lab/src/design/tokens.css:1-20` (20 lines → 8)**

Before (excerpt):
> /* The Fronthub design system's tokens as the workshop mock declares them,
>    minus `--signal-soft`, which the mock declares and never uses. `--ok` was
>    the other such token until round 3 of the handoff gave it a use: a better
>    change in the report. …
>    The command palette looks like that case and is not one: it is
>    an in-tree child of `.fw` (App.tsx), …

After:
```css
/* Design-system tokens as the mock declares them (minus the unused
   `--signal-soft`). `--error` and `--border-strong` are not in the design
   system's list, as flagged in the spec. Dark only; radius 0 except the
   switch and the ready dot; `--warn` only for a clamped value or a rule bound.
   On `:root`, not `.fw`, so anything mounted on `document.body` (a toast, a
   <dialog>) still resolves the tokens. */
```

**11. Duplicated, `apps/lab/src/library/openEntry.ts:24-26`. Delete it.**

Before:
> // A `mismatch` only when the address *named* a size the listing has not got.
> // An address with no size is not a disagreement: the list shows the first
> // size's rows and its chip says so, which is what PR 5a's own case asserts.

After: nothing. The JSDoc at lines 10-15 already says this. In that JSDoc, also drop "before PR 5b the list fell back … the disagreement spec §5.6 settles" (lines 6-8) and keep "Both halves of the panel ask this one function, so they cannot answer differently."

**12. Stale history, `apps/lab/src/stage/RunStatusBar.tsx:18-20`**

Before:
> // A later task adds a second `role="status"` region (a clamp notice), so
> // this one gets a name now, ahead of that, for a screen reader to tell the
> // two apart.

After:
```tsx
// Named: the clamp notice is a second `status` region.
```

**13. Mutation narrative in tests, `apps/lab/src/library/useViewSave.browser.test.tsx:177-181` and `useStoredBoard.browser.test.tsx:90-94`**

Before:
> // `notices.ts` exists to take an event notice back, and nothing measured that:
> // this task's review found that deleting its whole `setTimeout` block, or
> // inverting its identity guard, left every other case green. Task 8's `deleted`
> // notice leans on this same branch — and the `deleted` fade is the one the
> // plan's own history records as broken once already.

After: no comment at all. The test name `'an event notice fades after 1200 ms, and a kept one never does'` already says what the test does. How the missing test was found belongs in the commit that added it. The same applies to "Review round 3 deleted this branch from the hook and nothing went red — this is that missing case" in `useStoredBoard.browser.test.tsx:93-94`.

**14. Reference that cannot be followed, `apps/lab/src/run/actions.test.ts:22-23`**

Before:
> // Through setState, never through the action under test: a fixture that
> // cleans up by calling a slice method blinds the mutation test (fact 40).

After:
```ts
// Reset via setState, not via a slice action: a reset that calls the action under test hides that action's bugs.
```

### Proposed rule

Proposed for `CLAUDE.md` under a "Comments" heading:

> **Comments say why, once, in the fewest lines.**
> - Comment non-obvious code only: a browser quirk, an ordering constraint, a number that was measured. One line is the default and three is normal. Anything over 6 lines must be a module or API header. Put longer rationale in `docs/` and link to it.
> - No history in code. Do not write PR, round, task, review, handoff, Ruling, "harness fact" or "used to / revision 1" references in comments; that belongs in commit messages and PRs. When a spec constraint matters, state the constraint itself.
> - Cite symbols, never `file.ts:NN`.
> - Say each explanation once, next to the code that enforces it. Other places point to the symbol ("see `twoFrames`").
> - In tests, the test name carries the *what*. A comment explains only setup that looks arbitrary (this viewport, this mock, this wait) or, in one sentence, what this case catches that a similar case cannot. The story of how the test was found (mutations run, review rounds) goes in the commit.
> - For a measured number, write the result and the consequence ("two frames is the floor, don't shorten"), not the protocol or the sample table.

**How to test the rule.** A grep guard in the style of `neutral.test.ts` can enforce the mechanical parts. The guard should fail on these patterns in comment lines of the scoped files:
- `\bPR ?#?\d`
- `\b[Rr]ound \d`
- `\bRuling [0-9A-Z]`
- `harness fact|\(fact \d`
- `[Rr]eview round`
- `\.(ts|tsx|css):\d+`

It should also fail when a comment block runs over 12 lines outside a file-header position. The guard can start by allowing the current count and ratchet down from there.

### Estimated cut

- **Long blocks.** There are 304 blocks with more than 6 lines, totalling 3,278 lines. Trimming each to the larger of 3 lines or 40% of its length removes about 1,950 lines. The rewrites above take the biggest blocks further: 61 → 9, 43 → 8, 34 → 13, 31 → 8 and 30 → 5.
- **Short blocks.** There are 805 comment lines carrying history or reference markers. Some of these overlap with the long blocks. The ones in short blocks add roughly another 300–500 lines, as whole sentences that can be deleted.
- **Duplicates.** Removing them saves about 100 more lines: the focus-fixup study told four times, "sixty times a second" in six files, the second `twoFrames`, and `openEntry`.
- **Total: about 2,300–2,600 of the 8,282 comment lines (28–31%).** The overall comment ratio drops from 22.9% to about 17%. In source files it drops from 27.7% to about 19%, with the biggest drops in `RunColumn.tsx`, `perf.browser.test.ts`, `Workspace.browser.test.tsx`, `useUrlHash.ts` and `BoardFrame.tsx`. No WHY is lost. The measurement protocols and review anecdotes remain available in git history and in `docs/superpowers/plans/`.

