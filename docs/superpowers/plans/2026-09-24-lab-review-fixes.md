# Lab review fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the five headline findings of `lab-review.md`, bring the lab's
controls to parity with the `<arrowz-board>` API (highlight colour, margin,
inspect and play modes), delete the dead knob layer, and apply the comment rule
across the lab with a grep guard. Then record in `lab-review.md` what was fixed
and what is still open.

**Architecture:** Bug fixes land where the review located them. The colour
button becomes a controlled component: the element announces a cancelable
`colored-change` event, and the lab cancels it and writes the flag into its
own state, so there is one owner. Parity adds two view fields (`highlight`,
`pad`) that follow the existing `paper`/`ink` and `pointRadius` patterns end to
end, plus one board-mode control (View / Inspect / Play) on the board frame.
The comment sweep runs last, in parallel by directory, and a Deno test in
`packages/engine` then keeps it that way.

**Tech Stack:** React 19 + zustand + Vitest browser (Chromium) in `apps/lab`;
Lit element in `packages/board-element`; Deno 2.9 for `packages/engine`; Nx +
pnpm for the gates.

**Spec:** `lab-review.md` (repo root of this branch). Section references below
("Correctness §HIGH", "Parity: arrowz-board API", "Refactor 1", "Comment prose:
Proposed rule") point into it. Where this plan rules on something the review
leaves open, the ruling is written in the task and repeated under "Rulings".

## Global Constraints

- Everything in files is English. The lab UI is bilingual: every new visible
  string, label, help text and aria label goes into `packages/engine/lab-i18n.ts`
  in both `EN` and `PL` (English is the source).
- No `any`, no non-null assertions, no `Math.min(...arr)`/`Math.max(...arr)`
  over arrays proportional to cells or pieces.
- `packages/engine` stays free of Deno/DOM (`neutral.test.ts`); no engine
  import from `apps/` reaches `.ts` sources, only `@arrowz/engine` (the `dist`).
  After touching `packages/engine/*.ts`, run `pnpm nx build engine --skip-nx-cache`
  before any lab gate, because the lab reads the dictionary from `dist`.
- Board fingerprints must not move: `packages/engine/fingerprints.test.ts` and
  `packages/engine/scripts/node-smoke.mjs` stay green.
- Before writing any lab test, read
  `/Users/tomek/.claude/projects/-Users-tomek-dev-arrowz/memory/arrowz-testy-lab-harness.md`
  (72 facts about this harness; facts 1, 2, 8, 11, 13, 14, 20, 27, 38, 51, 53, 54 bite most often).
- Gates for a task that touches `apps/lab`: `pnpm nx run lab:check --skip-nx-cache`,
  `pnpm nx run lab:lint --skip-nx-cache`, `pnpm nx run lab:fmt --skip-nx-cache`
  (this is `prettier --check`; format with `pnpm --dir apps/lab exec prettier --write <files>`),
  and `pnpm nx run lab:test --skip-nx-cache` (both vitest projects, `node` and `chromium`).
  For `packages/board-element`: `pnpm nx run board-element:verify --skip-nx-cache`.
  For `packages/engine`: `cd packages/engine && deno task verify`.
  The final task runs `pnpm nx run-many -t verify --skip-nx-cache`.
- Every task ends with a commit. Commit messages: English, imperative, no
  attribution lines. Never commit `lab-review.md` changes except in Task 12.
- Do not delete or modify anything under `packages/cli/boards/`, `dist/`,
  `node_modules/`, `.agents/`, `.superpowers/`.
- New comments already follow the comment rule (Task 11): say why, once, in
  the fewest lines; no PR/round/Ruling/review/"harness fact" references; cite
  symbols, never `file.ts:NN`.
- This plan may be wrong about a line number, a key name or a mechanism. If
  the code disagrees with it, trust the code, say so in the report, and do the
  thing the task is *for*. A measured refutation is welcome, not disobedience.

## Rulings

These are decisions the review left open; the plan makes them so executors do
not have to.

- **R1 (focus fix).** `CollapsibleBlock` latches a forced open: once `forced`
  has been true, the block stays open until the parent crosses on/off or the
  header is clicked. That applies to both causes of `forced` (a refusal and a
  palette jump); a block that opened under the user does not snap shut when a
  refusal clears.
- **R2 (colour button).** The element dispatches a cancelable, bubbling,
  composed `colored-change` event (`detail: { colored: boolean }`) before it
  sets `coloredOverride`. If the host calls `preventDefault()`, the element
  does not set the override. Hosts that ignore the event keep today's
  behaviour. The lab always cancels it and writes the flag to the owner of
  what is on screen: the lab's `view.colored` on the lab tab, the stored
  view (through `useViewSave`) when a stored board is previewed in the library.
- **R3 (report copy).** `blockDist` is a share of `W + H`. The unit becomes
  "of width + height" / "szerokości + wysokości"; nothing in the engine changes.
- **R4 (difficulty help).** The false clause ("not the look") is dropped. The
  new sentence is built from what the group's knobs actually do (read the
  `PARAM_SPEC` help of `start`, `trapBias`, `probe`, `probeLen`), in both languages.
- **R5 (low window).** The low window is under 700 px tall: every
  height query in the lab CSS is written `max-height: 699px`, and each keeps the
  width condition it has now. A node test pins every `max-height` query in
  `apps/lab/src/design/*.css` to band.ts's height.
- **R6 (highlight).** `view.highlight` works like `paper`/`ink`: `''` means
  unset (the theme's or the element's own colour applies), a colour row with a
  clear button, carried in the hash as `highlight`, laid over stored previews
  too (it is a viewing preference like the other colours). Its row sits in the
  Colours section after Ink.
- **R7 (margin).** `view.pad` is the element's `pad` in cells. The element
  exports `PAD_RANGE = { min: 0, max: 16 }` and `drawablePad` clamps to it,
  and the lab row reads that export, the same way it reads `POINT_RADIUS_RANGE`.
  Default `DEFAULT_PAD` (4), step 1. The row sits in the Grid section. It is carried in the hash as
  `pad`. It changes the screen only: not the command, not the export, not the stored view. The help says so.
- **R8 (board mode).** One segmented control on the board frame, top edge,
  beside the solo toggle: **View** (today: `interactive=false`, `play=false`),
  **Inspect** (`interactive=true`: clicking a piece shows a one-line card about
  it) and **Play** (`play=true`: the element plays the board; a status line
  counts pieces left and mistakes, a Restart button calls `restart()`, and
  `finished` shows a cleared line). The mode belongs to the session: it is
  not in the hash and not persisted. It applies to whatever board the stage
  shows (lab or stored preview). Counters reset when the board on stage changes and on Restart.
  The inspect card reads: piece id, length (cells), exit direction (arrow glyph + word),
  and either "free" or "blocked by #B at N cells", computed with the engine's
  pure `play(newSession(board), id)` on the full board.
- **R9 (comments).** The rule text is the review's "Proposed rule", added
  to `CLAUDE.md` under `## Comments`. The guard starts at zero markers (no
  ratchet), because the sweep runs first. The block-length limit is 12 lines
  outside a file header, where a file header is the first comment block of the file.

## Review Focus

1. **A palette jump into a closed block, then any unrelated store change** (typing
   in another field, a run finishing): the block must stay open and the focus
   must stay on the knob. Task 1 pins it through a full `Console` mount, not `KnobPanel` alone.
2. **◑ clicked while a stored board is previewed, then back to the lab tab:** the lab's
   own `colored` must be unchanged, and the stored board's view must hold the new
   value after a reload of the list. Task 3 pins both directions.
3. **A link without `highlight`/`pad`** (every link written before this branch): opens
   with the defaults and does not rewrite the colours the page already has on first load. Tasks 6 and 7 pin it.
4. **Play mode, then Generate:** the new board arrives, counters read the new
   board's piece count with zero mistakes, and the mode stays Play. Task 8 pins it.
5. **The comment sweep changing code.** A sweep that removes a line of code or
   alters a string literal looks like a comment edit in a diff. The controller's
   filter in Task 11 (non-comment changed lines must be zero) pins it.

---

### Task 1: A forced dependency block stays open (HIGH)

**Files:**
- Modify: `apps/lab/src/console/KnobRow.tsx` (`CollapsibleBlock`)
- Modify: `apps/lab/src/console/useFocusRequest.ts` (only if its doc comment
  describes the old behaviour)
- Test: `apps/lab/src/console/KnobPanel.browser.test.tsx` or a new
  `apps/lab/src/console/Console.jump.browser.test.tsx`

**Interfaces:** Consumes nothing new. Produces no new API; `CollapsibleBlock` props are unchanged.

- [ ] **Step 1: Write the failing test.** Mount the real `Console` (so
  `useFocusRequest` runs and clears the request) on the lab route, inside a
  `MemoryRouter` at `/` with a `.fw` wrapper, following an existing
  Console/Workspace browser test for the mount. From the defaults (`probe`=0),
  call `useStore.getState().ui` jump action the palette uses (read
  `palette/commands.ts` for `jumpTo` / the `requestFocus` action name), targeting
  `knob-probeLen`. Assert, after `await expect.poll(...)`, that
  `document.activeElement.id === 'knob-probeLen'`, that `#dep-difficulty` is not `hidden`, and
  that both still hold after a later unrelated store write (for example
  `useStore.getState().params.set('seed', 8)`) and two animation frames.
  Add a second case for the view panel: jump to `view-top` with `hilite` off.
- [ ] **Step 2: Run it and see it fail** on the "not hidden after the next render" assertion:
  `pnpm --dir apps/lab exec vitest run --project chromium <file>`.
- [ ] **Step 3: Implement R1.** In `CollapsibleBlock`, next to the existing
  adjust-while-rendering reset, latch the forced open:
  ```tsx
  const [choice, setChoice] = useState({ on, open: on })
  if (choice.on !== on) setChoice({ on, open: on })
  else if (forced && !choice.open) setChoice({ on, open: true })
  const open = choice.open || forced
  ```
  Check that the header click still closes a latched block (it sets `open: !open`).
- [ ] **Step 4: Negative control.** Remove the `else if` line, confirm the new
  test is red and names the `hidden`/focus assertion, then restore it.
- [ ] **Step 5: Run the lab gates** (all four, see Global Constraints). Existing
  tests that pin "the block closes when the refusal clears" are now wrong under R1: update
  them to the new rule and say so in the report.
- [ ] **Step 6: Commit.** `git commit -m "Console: a block opened by a jump or a refusal stays open"`

### Task 2: The element announces the colour button and publishes its margin range

**Files:**
- Modify: `packages/board-element/src/arrowz-board.ts` (colour button click, `colored-change`)
- Modify: `packages/board-element/src/sanitize.ts` (`PAD_RANGE`, `drawablePad` clamps to it)
- Modify: `packages/board-element/mod.ts` (export `PAD_RANGE`, the event detail type)
- Modify: `packages/board-element/README.md` (API tables: event, `PAD_RANGE`; also fix
  the drift the review lists: `pieceCount`, `emit`, `board: BoardData | null`)
- Modify: `packages/engine/lab-docs.ts` (`ELEMENT_EVENTS` gains `colored-change`; `ELEMENT_PROPS`'s `pad` row mentions the range)
- Test: the element's existing test files for the colour button and pad (find them with
  `grep -ln "colors\|coloredOverride\|pad" packages/board-element/src/*.test.ts packages/board-element/test* 2>/dev/null`)

**Interfaces:**
- Produces: `export interface ColoredChangeDetail { colored: boolean }`;
  event name `'colored-change'`, `CustomEvent<ColoredChangeDetail>`, `cancelable: true, bubbles: true, composed: true`.
- Produces: `export const PAD_RANGE: Readonly<{ min: number; max: number }> = { min: 0, max: 16 }`.

- [ ] **Step 1: Failing tests.** (a) Clicking ◑ dispatches `colored-change` with
  `detail.colored` equal to the new value; (b) a listener that calls
  `preventDefault()` leaves `aria-pressed` and the drawn `colored` unchanged,
  and a later `view = { ...view, colored: true }` from the host still takes effect;
  (c) without a listener the old behaviour holds (override set); (d) `pad = 99`
  draws as 16 and `pad = -1` as 0 (use whatever the existing pad test reads:
  `layer.pad` or the viewport margin).
- [ ] **Step 2: Run them red.** `pnpm --dir packages/board-element run test`.
- [ ] **Step 3: Implement.** Replace the inline click handler with a method:
  ```ts
  private readonly toggleColors = (): void => {
    const colored = !this.colored
    const event = new CustomEvent<ColoredChangeDetail>('colored-change', {
      detail: { colored }, bubbles: true, composed: true, cancelable: true,
    })
    if (this.dispatchEvent(event)) this.coloredOverride = colored
  }
  ```
  and clamp in `drawablePad` with `Math.min(Math.max(0, finite(pad, fallback)), PAD_RANGE.max)`
  (`PAD_RANGE.min` for the lower bound).
- [ ] **Step 4: Update README and `lab-docs.ts`**; `pnpm nx build engine --skip-nx-cache`.
  The docs route renders `ELEMENT_EVENTS`: run the lab docs tests too.
- [ ] **Step 5: Gates:** `board-element:verify`, `cd packages/engine && deno task verify`, `lab:test`.
- [ ] **Step 6: Commit.** `git commit -m "Board element: a cancelable colored-change event, and a published margin range"`

### Task 3: The lab owns the colour flag the ◑ button changes

**Files:**
- Modify: `apps/lab/src/stage/BoardCanvas.tsx` (map `onColoredChange: 'colored-change'`)
- Modify: `apps/lab/src/stage/BoardFrame.tsx` (handler)
- Possibly create: `apps/lab/src/stage/useColoredOwner.ts` if the handler needs the library's save hook
- Test: `apps/lab/src/stage/BoardFrame.browser.test.tsx` (or the Stage test that already clicks ◑:
  `grep -rln "aria-pressed" apps/lab/src --include=*.test.tsx`)

**Interfaces:**
- Consumes: Task 2's `colored-change` / `ColoredChangeDetail` (import the type from `@arrowz/board-element`).
- Consumes: `useViewSave` (`library/useViewSave.ts`) and `useOpenPreview` (`library/useOpenPreview.ts`) for the stored-board branch, exactly as `library/BoardPreview.tsx` calls them.

- [ ] **Step 1: Failing tests.** (a) Lab tab: click ◑ in the element's shadow
  root → `useStore.getState().view.colored` flips, and then toggling the
  lab's `colored` switch (or `view.setFlag('colored', …)`) changes the element's
  `aria-pressed` again. That second half is the bug the review describes, so it must go red today.
  (b) Library tab with a stored preview open (reuse the fixtures of
  `library/*.browser.test.tsx` that open a preview with a stubbed store): click ◑ →
  a POST with `view.colored` flipped goes to the store (`useViewSave` debounces, so wait for it),
  and the lab's own `view.colored` is unchanged.
- [ ] **Step 2: Run red.**
- [ ] **Step 3: Implement R2.** In `BoardFrame`, `onColoredChange={(event) => { event.preventDefault(); … }}`:
  on the library route with a preview, `commitView({ ...preview.meta.view, colored: event.detail.colored })`;
  otherwise `useStore.getState().view.setFlag('colored', event.detail.colored)`.
  Read `view.slice.ts` for the exact flag setter name. Delete the stale comment
  claim that the lab never hears the button, if any.
- [ ] **Step 4: Negative control:** drop `preventDefault()` and see (a)'s second half go red again.
- [ ] **Step 5: Lab gates.**
- [ ] **Step 6: Commit.** `git commit -m "Lab: the board's colour button writes the lab's own colour flag"`

### Task 4: Report and help copy (two factual errors)

**Files:**
- Modify: `packages/engine/lab-i18n.ts` (`perimeterUnit` EN+PL; `groupHelp.difficulty` EN+PL)
- Test: `packages/engine/lab-report.test.ts` / `lab-i18n.test.ts` wherever the unit string is pinned
  (`grep -rn "perimeter\|obwodu" packages apps/lab/src`)

- [ ] **Step 1:** Change the pinned test strings first, run `deno task test` in `packages/engine`, and see them red.
- [ ] **Step 2: R3.** `perimeterUnit: 'of width + height'` / `'szerokości + wysokości'`.
  Also rename the key to `sidesUnit` if no other consumer depends on the old name
  (`grep -rn perimeterUnit`); update every consumer.
- [ ] **Step 3: R4.** Read the help of every knob in the difficulty group in
  `PARAM_SPEC` (`packages/engine/engine.ts`, search `group: 'difficulty'`) and in
  `lab-i18n.ts`. Write one or two sentences that are true of all of them, in EN,
  then PL with the same meaning. Keep the first sentence's idea ("how hard it is to find a piece with a free way out") if it is still true.
- [ ] **Step 4:** `deno task verify` in `packages/engine`; `pnpm nx build engine --skip-nx-cache`;
  `lab:test` (docs and report tests read these strings).
- [ ] **Step 5: Commit.** `git commit -m "Report and help copy: unblock distance is a share of W + H; the difficulty group's help says what it changes"`

### Task 5: One low-window breakpoint

**Files:**
- Modify: `apps/lab/src/design/shell.css` (the `max-height: 700px` query and the comment near it that quotes 700px)
- Modify: `apps/lab/src/design/console.css` (the `max-height: 700px` query)
- Modify: `apps/lab/src/state/band.ts` (export the height query piece so a test can read it, for example `export const LOW_MAX_HEIGHT = 699`)
- Create: `apps/lab/src/design/breakpoints.test.ts` (node project, same style as `design/tokens.test.ts`)

- [ ] **Step 1: Failing test.** Read every `design/*.css?raw`, collect each
  `max-height: Npx` inside an `@media` prelude, and assert each N equals
  `LOW_MAX_HEIGHT`. Also build band.ts's `LOW` from `LOW_MAX_HEIGHT` so the two
  cannot drift. Red today on the two 700px queries.
- [ ] **Step 2: R5.** Change both to `max-height: 699px`, keeping each rule's other conditions.
  Update the prose that quotes 700px (`shell.css`, `Workspace.browser.test.tsx`) to 699px or
  to "under 700px tall".
- [ ] **Step 3:** At 1280×700 and 1280×699, the layout tests that probe the low window
  (`grep -rln "700\|699" apps/lab/src --include=*.browser.test.tsx`) stay green; if one
  pinned the old off-by-one, update it and say why in the report.
- [ ] **Step 4: Lab gates.**
- [ ] **Step 5: Commit.** `git commit -m "Lab CSS: the low window starts under 700px in every stylesheet"`

### Task 6: Highlight colour row (parity)

**Files:**
- Modify: `apps/lab/src/state/view.slice.ts` (`highlight: string`, `setHighlight`, default `''`)
- Modify: `apps/lab/src/state/url.ts` (`HashView.highlight`, encode when set, decode with the same hex filter as `paper`/`ink`)
- Modify: `apps/lab/src/state/useUrlHash.ts` (`viewFor`, `applyPayload`)
- Modify: `apps/lab/src/stage/BoardFrame.tsx` (`colourOverride` gains `highlight`)
- Modify: `apps/lab/src/console/ViewPanel.tsx` (`ColoursSection`: a `ColourRow` after Ink, id `view-highlight`)
- Modify: `apps/lab/src/palette/commands.ts` only if the palette lists paper/ink rows (then it lists highlight too)
- Modify: `packages/engine/lab-i18n.ts` (`viewShortHighlight`, `highlightHelp`, `highlightLabel`, `highlightClear`, EN+PL)
- Modify: `apps/lab/src/harness/mountApp.tsx` if the view slice gains a reset there
- Test: `state/url.test.ts`, `state/useUrlHash.browser.test.tsx`, `stage/BoardFrame.browser.test.tsx`, `console/ViewPanel.browser.test.tsx`

**Interfaces:** Produces `view.highlight: string`, `view.setHighlight(color: string): void`, `HashView.highlight?: string`.

- [ ] **Step 1: Failing tests,** one per layer: the slice default and setter;
  url round trip (`#…"highlight":"#ff0000"…` in, same out; an absent key decodes to `undefined`;
  a non-hex value is dropped); the element receives `view.highlight` only when set (read
  `BoardFrame`'s paper/ink test and mirror it, including the "stated but empty beats the theme" trap it guards);
  the row sets it and its clear button restores `''`. Follow fact 20 of the harness notes:
  prove the element *draws* the colour where an existing paper/ink test does.
- [ ] **Step 2: Run red.**
- [ ] **Step 3: Implement R6**, copying the `ink` path at every step (grep `ink` in each file above).
- [ ] **Step 4:** `pnpm nx build engine --skip-nx-cache`, lab gates.
- [ ] **Step 5: Commit.** `git commit -m "Lab: a highlight colour row, as the element offers"`

### Task 7: Margin row (parity)

**Files:**
- Modify: `apps/lab/src/state/view.slice.ts` (`pad: number`, `setPad`, default `DEFAULT_PAD`, clamped to `PAD_RANGE`)
- Modify: `apps/lab/src/state/url.ts`, `apps/lab/src/state/useUrlHash.ts` (`pad` like `pointRadius`)
- Modify: `apps/lab/src/stage/BoardFrame.tsx` (`pad={view.pad}` on `BoardCanvas`)
- Modify: `apps/lab/src/console/ViewPanel.tsx` (a number row in the Grid section, id `view-pad`,
  built the way `PointRadiusRow` is — or, better, generalise `PointRadiusRow` into a
  bounded number row that both use, if that is a small change)
- Modify: `packages/engine/lab-i18n.ts` (`viewShortPad`, `padHelp` stating that the margin
  changes the screen only, `padLabel`, EN+PL)
- Test: as Task 6, plus: the command (`LiveCommand`) does not change when `pad` changes.

**Interfaces:** Consumes `PAD_RANGE`, `DEFAULT_PAD` from `@arrowz/board-element` (Task 2).
Produces `view.pad: number`, `view.setPad(n: number): void`, `HashView.pad?: number`.

- [ ] **Step 1: Failing tests** (slice clamp 0..16 and non-finite → default; url round trip
  including `pad: 0`, which is legal and must survive; element `pad` property follows the row;
  command text unchanged).
- [ ] **Step 2: Run red.**
- [ ] **Step 3: Implement R7.**
- [ ] **Step 4:** engine build, lab gates.
- [ ] **Step 5: Commit.** `git commit -m "Lab: a margin row for the board, as the element offers"`

### Task 8: Board mode — View, Inspect, Play (parity)

**Files:**
- Create: `apps/lab/src/stage/BoardMode.tsx` (the segmented control, the inspect card, the play status line + Restart)
- Create: `apps/lab/src/stage/pieceFacts.ts` (pure: `pieceFacts(board: BoardData, id: number): PieceFacts | null`)
- Create: `apps/lab/src/stage/pieceFacts.test.ts` (node project)
- Modify: `apps/lab/src/state/ui.slice.ts` (`boardMode: 'view' | 'inspect' | 'play'`, `setBoardMode`; not persisted, not in the hash)
- Modify: `apps/lab/src/harness/mountApp.tsx` and the private `mountApp` in `routes/Workspace.browser.test.tsx` (reset `boardMode`)
- Modify: `apps/lab/src/stage/BoardCanvas.tsx` (map `onPieceRemoved: 'piece-removed'`, `onLifeLost: 'life-lost'`, `onFinished: 'finished'`; keep `onPieceClick`; drop `onViewportChange` if nothing uses it)
- Modify: `apps/lab/src/stage/BoardFrame.tsx` (pass `interactive`/`play` from the mode, a ref to the element for `restart()`, render `BoardMode`)
- Modify: `apps/lab/src/design/shell.css` (placement on the frame's top edge next to the solo toggle; the card/status line along the bottom edge, like `.fw-anno`)
- Modify: `packages/engine/lab-i18n.ts` (mode names, aria label of the group, card and status sentences, direction words, Restart, cleared line; EN+PL)
- Test: `apps/lab/src/stage/BoardMode.browser.test.tsx`

**Interfaces:**
- Consumes: `newSession`, `play`, `type BoardData` from `@arrowz/engine`; the element's
  `restart()`, `play`, `interactive`, and the events `piece-click` (`{ pieceId }`),
  `piece-removed` (`{ pieceId, left }`), `life-lost` (`{ pieceId, blockerId, distance }`),
  `finished` (`{ pieces }`); `shell/Segmented.tsx` for the control.
- Produces: `interface PieceFacts { id: number; length: number; dir: 0 | 1 | 2 | 3; blocker: { id: number; distance: number } | null }`.

- [ ] **Step 1: `pieceFacts` test first** (node): a hand-built 3-piece `BoardData`
  (copy the shape of a fixture from `packages/engine/game.test.ts`), one free and one blocked
  piece: length, `dir`, `blocker` null vs `{ id, distance }`; an unknown id → `null`.
  Implement with `play(newSession(board), id)`: `exit` → `blocker: null`, `bounce` → `{ id: move.blockerId, distance: move.distance }`, `ignored` → `null`.
  Memoise `newSession(board)` per board in the component, not per click.
- [ ] **Step 2: Browser tests, red first:**
  (a) the control has three options, View selected, the element has neither `play` nor `interactive`;
  (b) Inspect: dispatch a `piece-click` from the element (`new CustomEvent('piece-click', { detail: { pieceId }, bubbles: true, composed: true })` on the host)
  and see the card's text for that piece in the current language; switching back to View hides it;
  (c) Play: `play` attribute present; dispatch `piece-removed` then `life-lost` and see
  "N left · 1 mistake" (plural rules in PL: 1 błąd, 2 błędy, 5 błędów); Restart calls the element's `restart()` (spy on it) and resets both counters;
  `finished` shows the cleared line; (d) a new board on stage (set `result.shown` to another board) resets counters and keeps Play;
  (e) both languages render every new string (loop `setLang('pl')`, fact 69).
- [ ] **Step 3: Implement R8.** Keep the control out of the element's own bar (the element owns
  the bottom-right chrome); give the group an accessible name; keyboard: the segmented
  control's own arrow keys. Counters live in component state keyed by the board identity
  (reset with the adjust-while-rendering pattern, not an effect: the lint forbids `setState` in effects, fact 65).
- [ ] **Step 4: Layout check.** Run `LayoutInvariants.browser.test.tsx` and the solo/annotation
  tests; nothing may overlap the solo toggle or the annotation at 860×900, 1280×800, 1400×900 (fact 37).
- [ ] **Step 5:** engine build, lab gates.
- [ ] **Step 6: Commit.** `git commit -m "Lab: inspect a piece, or play the board, from the board frame"`

### Task 9: Delete the dead knob layer (refactor 1)

**Files:**
- Modify: `apps/lab/src/console/KnobSlider.tsx` → keep only `percent` and `boundOn`; better, move them to
  `apps/lab/src/console/track.ts` and delete `KnobSlider.tsx`
- Modify: `apps/lab/src/console/KnobSlider.browser.test.tsx` → delete the component's half; move the helpers' cases to `track.test.ts` (node)
- Modify: `apps/lab/src/console/FieldHelp.tsx` → keep `descId` only (or move it next to its users)
- Modify: `apps/lab/src/console/viewFields.ts` → delete `viewHelpEntries`, `ViewField.help` and the `help` values
- Modify: `apps/lab/src/design/console.css` → delete the `.fw-k`, `.fw-kdesc`, `.fw-grid`, `.fw-skeleton`, `.fw-ends` rules
- Modify: `apps/lab/src/design/console.test.ts` → pin `.kv-g .fw-swatches` instead of `.fw-k .fw-swatches`
- Modify: `apps/lab/src/console/useFocusRequest.ts` → `closest('.kv-row')`
- Modify: `apps/lab/src/console/StartKnob.tsx` (`MIX_SPEC` loses `export`), `ViewPanel.tsx` (`ThemeSwatchStrip` loses `export`; `const set = onSet` alias goes), `state/view.slice.ts` (`paletteUpdate` loses `_state` at all call sites)
- Modify: the comments that claim the simple view uses `KnobSlider` (`KnobRow.tsx`, `useAutoRun.ts`, `useUrlHash.ts`)

- [ ] **Step 1: Baseline.** For each symbol and class above, run the review's grep
  (`grep -rnw <name> apps/lab/src | grep -v test`) and record the hits in the report.
  Anything live that the review called dead: stop, keep it, and report.
- [ ] **Step 2: Delete.** CSS: delete a rule only if every selector in it names a dead class; a
  mixed selector list loses only the dead selectors.
- [ ] **Step 3: Prove nothing live moved.** `lab:test` (both projects) plus
  `LayoutInvariants`, and `SimplePanel.browser.test.tsx` still asserts no `.fw-k, .fw-grid, .fw-kdesc`.
- [ ] **Step 4: Lab gates.**
- [ ] **Step 5: Commit.** `git commit -m "Lab: delete the knob layer nothing renders any more"`

### Task 10: The comment guard (red first)

**Files:**
- Create: `packages/engine/comments.test.ts`
- Modify: `CLAUDE.md` (new `## Comments` section with the rule, R9)

- [ ] **Step 1: Write the guard.** Walk `apps/lab/src` (`.ts`, `.tsx`, `.css`),
  `packages/board-element/src` (`.ts`), and `packages/engine/lab-*.ts`. Extract comment
  text only (line comments, block comments, JSX `{/* */}`, CSS `/* */`; code with a trailing
  comment counts only its comment part; ignore string literals). Fail on these patterns in comment text:
  `/\bPR ?#?\d/`, `/\b[Rr]ound \d/`, `/\bRuling [0-9A-Z]/`, `/harness fact|\(fact \d/`,
  `/[Rr]eview round/`, `/\b[\w-]+\.(ts|tsx|css|mjs):\d+/`. Fail on a comment block (consecutive
  comment lines, a blank line ends it) over 12 lines unless it is the file's first block.
  Report every offence as `path:line pattern` so the sweep can use the output as a worklist.
  Assert that the walk found more than 150 files, so a broken walk cannot pass.
- [ ] **Step 2: Run it:** `cd packages/engine && deno test --allow-read comments.test.ts`. It is red,
  and the output is the worklist for Task 11. Save it as `/tmp/comment-worklist.txt`.
- [ ] **Step 3: Add the rule to `CLAUDE.md`** (text from the review's "Proposed rule", with
  "grep guard: `packages/engine/comments.test.ts`" appended).
- [ ] **Step 4: Commit with the guard marked expected-red** by wrapping the two assertions in
  `Deno.test({ name, ignore: Deno.env.get('COMMENT_GUARD') !== '1', fn })`, so `deno task verify`
  stays green until Task 11 removes the `ignore`. Commit:
  `git commit -m "Comment rule in CLAUDE.md, and its guard (off until the sweep lands)"`

### Task 11: The comment sweep (parallel by directory)

Four executors, each owning a disjoint set of files, each in its own worktree branched from
the tip of Task 10, merged back by the controller in order.

- **A:** `apps/lab/src/console`, `apps/lab/src/simple`, `apps/lab/src/palette`
- **B:** `apps/lab/src/run`, `apps/lab/src/stage`, `apps/lab/src/report`, `apps/lab/src/shell`, `apps/lab/src/routes`, `apps/lab/src/docs`
- **C:** every other path under `apps/lab/src` (`state`, `library`, `worker`, `api`, `harness`, `design`, `i18n`, the root files)
- **D:** `packages/board-element/src`, `packages/engine/lab-*.ts`

For each file owned:

- [ ] **Step 1:** Apply the rule (review §"Comment prose": classes a–e, the rewrites as models).
  Keep every WHY; cut history, restatement, duplicates (keep one copy, point at the symbol),
  measurement protocols (keep the result and the consequence). Replace every `file.ts:NN` citation
  with a symbol name, and check that the claim it makes is still true (the review lists seven stale ones).
- [ ] **Step 2:** Change comments only. No code, no string literals, no test names, no blank-line changes inside code.
- [ ] **Step 3:** `COMMENT_GUARD=1 deno test --allow-read packages/engine/comments.test.ts` shows no offence
  in the owned paths; lab gates (or `board-element:verify` + engine verify for D) green.
- [ ] **Step 4: Commit** per executor: `git commit -m "Comments in <area>: the why, once, without history"`

Controller after the merges:
- [ ] Filter the diff for non-comment changes: `git diff <task10-sha>..HEAD -U0 | grep '^[-+][^-+]' | grep -vE '^[-+]\s*(//|\*|/\*|\{/\*|\*/)' | grep -vE '^[-+]\s*$'`
  must print nothing except lines inside CSS or JSDoc blocks the filter cannot tell apart; read every remaining line.
- [ ] Remove the `ignore` from the guard, run `deno task verify` in `packages/engine`, commit:
  `git commit -m "Comment guard on"`.
- [ ] Measure: comment lines before/after with the review's method, for Task 12.

### Task 12: Update the review with what was fixed and what is open

**Files:** Modify: `lab-review.md`

- [ ] **Step 1:** Add a section `## Status after the fixes (2026-09-24)` right after the Summary table:
  a table of every finding and refactor in the review with a status column
  (`fixed in <sha>`, `open`, `superseded`) and one line on what changed. Items fixed as a side effect (for example the
  palette's English on/off, if a task touched it) are marked with their commit too. Keep the original
  sections unchanged below it: they are the record of what was found at `b9a5a9d`.
- [ ] **Step 2:** Update "Suggested order of work" into "What is still open", ranked.
- [ ] **Step 3:** Put in the measured comment numbers from Task 11 (before/after).
- [ ] **Step 4: Commit.** `git commit -m "Lab review: what the fixes closed, and what is still open"`

### Final gate

- [ ] `pnpm nx run-many -t verify --skip-nx-cache` in a clean detached worktree at the branch tip.
- [ ] A live run in Chrome (the recipe in `arrowz-przepisy-pomiarowe.md`): a palette jump to probe length, the ◑ button in the lab and in
  the library, highlight and margin, Inspect and Play on a small board, the low window at 1280×699 and 1280×700, both languages.
