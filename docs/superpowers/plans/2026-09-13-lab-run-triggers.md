# What starts a run in the lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `apps/lab` every remaining way of starting a run — the lifted run column with the live CLI command, New seed, Defaults, Abort, `auto` and `help`, the preset strip, the clamp notice and the URL hash — so that the trigger table of spec §2.2 is complete for the advanced view and a shared link reproduces a board.

**Revision 2**: rewritten after four adversarial reviews. Revision 1 asserted three engine facts instead of checking them and every one was false; it also shipped two real bugs and left four spec-restored features unowned. §Revision 2 records what changed, because most of it is a decision rather than a typo.

**Architecture:** Every trigger funnels through one function, `useRun().start()`, which is where the refusal on a violated rule and the cancellation of a pending debounce live; no trigger can forget either (Ruling 4). The knobs gain an `edits` counter incremented only by the human-edit path (`set`, `setStart`) and never by the machine path (`setMany`, `reset`), so `auto` fires once per typed change and not a second time behind a preset (Ruling 3). Both the debounce and the hash write are driven by `useStore.subscribe` inside an effect rather than by a selector in render, because a range input commits about sixty times a second during a drag and a subscription in render would repaint the whole shell that often (Ruling 11). The run column is a child element of `Console` rather than a sibling, which satisfies both the mock's three-track grid and the spec's "one instance above both consoles" (Ruling 2). The URL hash keeps the old lab's wire format so links cross between the two labs, but is debounced, guarded against its own writes, and mirrors the console rather than the last run (Rulings 5–7).

**Tech Stack:** React 19, zustand 5.0.15, Vite 8, Vitest 5 with `@vitest/browser` 5 and `vitest-browser-react` 2.3 (node + chromium browser mode), `@arrowz/engine` (`PARAM_SPEC`, `defaultParams`, `readParams`, `clampParam`, `validateParams`), `@arrowz/engine/command` (`buildCommand`, `COMMAND_PREFIX`, `VIEW_RANGE`, `viewNumberOf`), `@arrowz/engine/simple` (`exportCell`), `@arrowz/engine/presets` (`PRESETS`, `findPreset`), `@arrowz/engine/i18n`.

**Spec:** `docs/superpowers/specs/2026-09-13-lab-react-app-design.md` — §2.2 (the trigger table, which this PR completes for the advanced view), §2.3, §5.1, §5.3, §5.4, §5.5, §7.1–7.3, §8, §10 row 3 (second half).

**Previous plan:** `docs/superpowers/plans/2026-09-13-lab-parameter-console.md` (PR #65, the first half of spec §10 row 3). This branch stacks on `lab/parameter-console`.

**Branch:** `lab/run-triggers`, based on `lab/parameter-console`. The pull request's base is `lab/parameter-console`, not `main`.

## Global Constraints

- **Everything written to a file is English** — code, comments, tests, docs, branch name, commit messages. Only the conversation with the user is Polish.
- **No `any`, no non-null assertions.** ESLint enforces both in `apps/lab`; `deno lint` does not read `apps/`.
- **Both gates must pass:** `deno task verify` in the repository root and `pnpm nx run-many -t verify`.
- **Never import the engine's `.ts` sources from `apps/`.** `apps/lab` consumes `@arrowz/engine` through `dist/`, which is why every `project.json` target has `dependsOn: ["^build"]`.
- **The mock is not in this repository.** It lives in the Claude Design project *Arrowz workshop* (`7fc443c6-aaf3-4d37-a380-9812f10110b6`), files `Arrowz Workshop v2.dc.html` and `fronthub-workshop-v2.css`. Every CSS rule and every piece of markup this plan quotes was read from there; nothing can be diffed against it later, so the quoted rules are the source of truth from here on.
- **English is the source language in code**, Polish is the translation. A new UI string goes into both tables in `packages/engine/lab-i18n.ts`, and `lab-i18n.test.ts` checks that the key sets match.
- **No attribution lines in commit messages.**
- Commit after every task. Task boundaries are the review boundaries.

### Harness facts, each of which broke a draft of this plan or of the previous one

- **`render` from `vitest-browser-react` is async.** Every browser test writes `const screen = await render(<X />)`.
- **`renderHook` is exported by `vitest-browser-react` and is async too.** It is the right tool for `useRun`, `useAutoRun` and `useUrlHash`; a hand-rolled probe component that captures the hook's return into a `let` does not type-check (see Ruling 12).
- **`toHaveTextContent` is exact equality.** The substring/regex matcher is `toMatchTextContent(/…/)`. `expect.element` is built on `expect.poll`.
- **Vitest 5 isolates browser test files** (`isolate: true` by default, one iframe per file), so the store and `location.hash` do **not** leak between files. They very much leak between cases *within* a file, and no shared `beforeEach` exists: every existing test resets by hand at its top (`ValueKnob.browser.test.tsx:16`, `GroupRail.browser.test.tsx:7-10`, `LabRoute.browser.test.tsx:16-17`). Every new browser file in this plan opens with its own reset.
- **`vitest-browser-react` renders without StrictMode by default**, while `main.tsx:21` and `LabRoute.browser.test.tsx:167` mount with it. A StrictMode bug therefore hides from most tests; Task 12 has one and pays for it with a guard rather than with a test that would not have caught it.
- **`apps/lab` resolves `@arrowz/engine` to `packages/engine/dist/`.** After any edit under `packages/engine`, run `pnpm nx build engine` before running `apps/lab` tests by hand.
- **`exactOptionalPropertyTypes` and `noUnusedLocals` are on**, and ESLint's `no-unused-vars` is an error. An unused import in a test file fails the `check` gate.
- **Vitest does not type-check.** A "run it to see it fail" step that expects a TypeScript error will instead see an assertion failure; every such step below states the runtime failure.
- **`locator.click()` waits for actionability.** A disabled Generate does not fail a click, it stalls it until the timeout — which is how a page-load run turns a wrong assertion into a slow one.
- **Prettier is a gate.** Run `pnpm exec prettier --write .` in `apps/lab` before each commit.

---

## Rulings I made

Decisions this plan takes that the spec left open, or takes differently. An executor must not relitigate them; a reviewer should attack them.

**Ruling 1 — SVG export is not in this PR, and the previous plan was wrong to promise it here.** Ruling 1 of the parameter-console plan listed "exports" among the run column's contents. Spec §10 puts SVG export in row 4, beside the report it shares a worker idiom with. The spec wins. The mock's other ghost button, *Download board file*, exists in no version of the lab (`lab.html` offers only *Download SVG*) and is a mock invention; nothing of today's lab is lost either way.

**Ruling 2 — `RunColumn` is a child element of `Console`, not a sibling of it.** Spec §5.1 says the column is "lifted above `Console` so both consoles share one instance" and draws `Console` as a two-track grid; the mock draws the column as the console grid's own third track. Both hold if the caller constructs the element and the console places it: `LabRoute` renders `<Console>{<RunColumn … />}</Console>`. PR 4's `SimpleConsole` takes the same child and cannot fork it. The alternative — `display: contents` on a wrapper so a sibling reaches the grid — breaks in the 900px media query, where the column must span both tracks.

**Ruling 3 — the human-edit path and the machine path are different slice methods, and only the human path counts.** `params.set` and `params.setStart` increment `edits`; `params.setMany` and `params.reset` do not. `auto` watches `edits`. Without the split, a preset, Defaults, a hash load and New seed would each start a run immediately (as §2.2 requires) *and* schedule a second one 350 ms later, which would terminate the first mid-carve. The consequence a reader will trip over: **New seed writes its seed with `setMany({ seed })`, not `set('seed', …)`**.

**Ruling 4 — every trigger funnels through one `start()`, and that is where the refusal and the debounce cancellation live.** The old lab's `run()` is that function (`lab-page.ts:869`). `LabRoute` today disables Generate on a violation, which is right for a button and useless for `auto` and for a link arriving from another window.

**Ruling 5 — the hash is written with `replaceState`, debounced, and guarded against its own writes.** Three separate corrections to revision 1, which had only the first:
- `replaceState`, not an assignment to `location.hash`: the old lab pushes a history entry per run, harmless in a one-page lab and a regression in a three-route one, where Back would stop returning to `/boards`. The behaviour lost with it — Back as an undo for the last carve — is spec §12's filmstrip, PR 7.
- **Debounced by 250 ms.** `KnobSlider` commits on the range input's `onChange`, roughly sixty times a second during a drag. Chromium silently drops `replaceState` past about two hundred calls in ten seconds and Safari throws `SecurityError` past a hundred in thirty — from inside a zustand `set`, inside the input's handler.
- **Guarded by the last string written.** Revision 1 claimed `replaceState` means the page never fires `hashchange` at itself, and that is false: `hashchange` fires on same-document history traversal whenever the fragment differs, path or no path. With the hook mounted above the routes, `/#…` → `/boards` → Back fires it, the listener starts a run, and `useGenerator` terminates the run in flight — exactly what spec §8 forbids. The old lab's `writtenHash` guard is therefore ported, and the listener additionally ignores a `hashchange` that did not change the fragment's content.

**Ruling 6 — the hash mirrors the console, not the last run, and it survives a route change.** The old lab writes the hash inside `run()` and `redraw()`, so with `auto` off a copied link carries the knobs of the last board rather than the ones on screen. This PR writes it from a store subscription. The reason is the rule the old lab already states for the command string (`lab-page.ts:741`), and a URL disagreeing with the command box beside it is the worse inconsistency. The cost is named: after editing knobs without generating, the link reproduces what is configured, not what is drawn. Because `TabRow` navigates to bare paths, the hook also rewrites the hash after a route change, so leaving the lab and coming back does not empty the address bar.

**Ruling 7 — the hash's wire format does not change, and the two keys this PR does not own are carried through.** The payload stays `#` + `encodeURIComponent(JSON.stringify({ ...params, __view: { … } }))`, so links pass between the deployed Deno lab and this one in both directions. `lang` and `tab` belong to PR 4 and PR 5; a hash carrying them is read into an opaque `carried` field and written back verbatim. `voids` is absent from the format in the old lab and stays absent.

**Ruling 8 — the preset strip lists modes under level labels, and the accessible name carries what the label drops.** `PRESETS` has 26 options in seven levels — five levels of four, then `huge` and `insane` of three each. The old lab hides them in a `<select>` with `<optgroup>`; the mock draws a horizontally scrolling strip. Twenty-six chips reading `25×50 · square` are unreadable, so each level contributes one visual `.lbl` and its options contribute chips named for the mode alone. The label is `aria-hidden`, exactly as `GroupRail.tsx:89-91` already does for a visual group label, and every chip carries an `aria-label` with level, size and mode. Revision 1 put the label in a `::before` over a `display: contents` span; that hid the visible text from find-in-page, from selection, from browser translation and from this repository's own style test, which reads text nodes. The label is a flat sibling span, which is what the mock has.

**Ruling 9 — `help` hides descriptions from the eye and keeps them for a screen reader.** The old lab's `body.nohelp .help { display: none }` hid the description and left the violation behind only because the violation was a `::before` on the hidden element — an accident of CSS a React port cannot reproduce. Revision 1 dropped the description from the tree and made `aria-describedby` conditional. This revision keeps the description mounted under a visually-hidden class instead. Three things follow: the reason is a separate span and is never hidden; `aria-describedby` becomes unconditional, so the whole class of dangling-reference bugs disappears; and a link carrying `help:false` no longer strips every knob's description from the recipient's screen reader. The switch's own label says *show*, which is a visual verb, and this is what it now means.

**Ruling 10 — a preset writes every knob, seed included, and the strip's *edited* marker follows `findPreset`.** `lab-presets.ts` opens by defining an option as "engine defaults + these overrides, so choosing one never inherits knobs left over from the previous experiment", and the old lab implements exactly that. Spec §7.3 lists "applying a preset replaces all values wholesale, wiping unrelated edits" among the mock's pretences, but that sentence is about the mock's `resetAll`/`presetId` inconsistency, not about the engine's contract; the engine wins. The consequence, which the PR body states: **choosing a preset resets the seed**, so two presets cannot be compared on one seed. Separately, `findPreset` compares only the preset's own override keys, so nudging `seed` does *not* make the strip say *edited* — only a knob the preset names does. Revision 1's test asserted the opposite and would have failed forever.

**Ruling 11 — neither the debounce nor the hash writer may subscribe in render.** Both watch state that changes about sixty times a second during a slider drag. `useStore(selector)` in `Shell` would re-render `TopBar`, `TabRow`, `LabRoute`, `Stage`, `Console` and every knob on each tick, which is the cost `useGenerator.ts:16-19` was written to avoid and nothing in `apps/lab` is memoised against. Both hooks therefore hold `useStore.subscribe` inside a `useEffect` with a stable dependency list, compare the field they care about against its previous value, and keep their timers in the effect's closure.

**Ruling 12 — hook tests use `renderHook`, not a probe component.** Revision 1's `let held: T | null = null` captured inside a callback is narrowed to `null` by its initialiser; TypeScript does not widen it from the closure, so after the null check the value is `never` and every call on it is a `check`-gate error. `renderHook` from `vitest-browser-react` returns `{ result }` and is the harness's own answer.

**Ruling 13 — the refusal gets a voice, and a big board gets its warning back.** `useRun` refusing silently is right for the funnel and wrong for the person: `auto` and a pasted link have no disabled button to look at, and on `/boards` there is no `Violations` panel either. `RunStatusBar` therefore prints `generateBlocked` whenever the knobs are refused and the slice is idle, and prints `generatingBig` for a board over 200 000 cells, which the old lab does inside `run()` (`lab-page.ts:882`) and which spec §10 lists among the features the port must restore. Both keys already exist in both dictionaries and are unused today.

**Ruling 14 — the `f` hotkey and the solo view are PR 4's, and this plan says so in writing.** Spec §10 restores them and §5.1 places them in `BoardFrame.tsx`, but no row of §10 names them; they are stage chrome, not a trigger. Task 14 amends the spec's §10 row 4 to name them rather than leaving the gap for a fifth reviewer to find. The preset name in the top bar (§5.1) *is* this PR's, because this PR is what makes a preset knowable.

---

## Revision 2: what the four reviews changed

Recorded because a reviewer of this revision should know which claims were tested and which were merely repaired.

**Three engine facts revision 1 asserted and got wrong.** `{ giants: 4, giantStep: 0 }` is not a violation — `stepZero` is an *inactive reason* on `giantJitter`, and the only rules are `sharesSum`, `lmaxHole`, `startPair` and `straightFloor`; three tests were built on it. `findPreset` ignores knobs a preset does not name, so the *edited* test moved `seed` and proved nothing. `toHaveTextContent` is exact equality, so the command test compared a `<figure>`'s whole text against the command alone. All three are corrected against the sources, and the suite's own violation idiom (`{ wShort: 0.8, wMid: 0.8 }`) is used throughout.

**Two runtime bugs.** `hashchange` on history traversal (Ruling 5) and the StrictMode remount, where the read effect ran twice, decoded the hash it had just written, found nothing to clamp and **lowered the clamp notice the link had raised** — invisible to the tests, because `vitest-browser-react` renders without StrictMode. Both are guarded by refs in Task 12, and the load run gets the same guard in Task 13.

**Two performance faults with a user-visible edge.** The debounce and the hash writer both subscribed in render (Ruling 11), and the hash writer hit the browsers' `replaceState` rate limits during a slider drag (Ruling 5).

**Four features the spec restores and no PR owned.** `generatingBig` and the refusal message (Ruling 13, Task 5); the preset's `cell`, which §2.2 row 2 requires and revision 1 omitted (Task 10); the top bar's preset name (Task 10); the `f` hotkey and solo view (Ruling 14, assigned to PR 4 in writing).

**Six type or lint errors** that would have failed the `check` gate: the probe helper's `never` (Ruling 12), `dict.d.presets.levels[level.id]` indexing a fixed-key object with a `string`, unused imports in two test files, `vi` and `VIEW` used without being imported, and `JSX.Element` written as a global that React 19 no longer provides.

**Eight accessibility and token defects.** A conditionally mounted `aria-live` region announces nothing; `aria-pressed` on 26 chips makes 26 toggle buttons out of one current item; Copy and Dismiss in `--signal` on `--graphite` measure 3.81:1 against the 4.5:1 AA needs and break §7.1's rule that `--signal` carries state and data rather than actions; the *edited* marker in `--warn` breaks the same section's reservation of warn for a clamp or a rule bound; the switch left its visible label unassociated where `ViewPanel.tsx:105-113` shows the established pattern; Dismiss dropped focus to `<body>`; four new controls missed the coarse-pointer rule; and `presetsLabel` was added to both dictionaries and used by nothing.

**Two harness claims that were wrong in the safe direction.** Browser test files are isolated, so revision 1's warnings about a shared page were unnecessary — while the real pollution, between cases inside one file, went unmentioned. And the fallout list for the page-load run named a file that never mounts the shell; the real list is four assertions in `LabRoute.browser.test.tsx`, with line numbers, in Task 13.

**What the reviews confirmed as sound**, so that revision 3 does not re-litigate it: `applyPayload` calling four setters on a captured slice snapshot composes correctly, because every action reads the live state inside its updater; zustand 5's `subscribe` returns an unsubscribe fit for an effect cleanup; the grid places `RunColumn` in track 3 and collapses correctly at 900px; `<section aria-label>` is a `region` and `<figure aria-label>` resolves by role and name; `aria-describedby` accepting `undefined` type-checks; no ref is read or written during render.

---

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `apps/lab/src/run/useRun.ts` | The one funnel: `start()` (cancel the pending debounce, refuse a broken rule, hand the knobs to the worker) and `abort()`. |
| `apps/lab/src/run/useAutoRun.ts` | The 350 ms debounce behind the `auto` switch, driven by a store subscription. |
| `apps/lab/src/run/RunColumn.tsx` | The console's third track: command, Generate, New seed, Defaults, Abort, the two switches. |
| `apps/lab/src/run/LiveCommand.tsx` | `buildCommand` over the current knobs and view, with the copy button and its confirmation. |
| `apps/lab/src/run/PresetStrip.tsx` | The 26 presets as chips under seven level labels, with the *edited* marker. |
| `apps/lab/src/run/ClampNotice.tsx` | The always-mounted status region a preset or a hash fills when it moved a value. |
| `apps/lab/src/run/OptionSwitch.tsx` | The labelled `.fw-sw` switch, used by `auto` and by `help`. |
| `apps/lab/src/state/url.ts` | The hash codec: `encodeHash`, `decodeHash`, the payload types. No DOM. |
| `apps/lab/src/state/url.fixtures.ts` | The one view literal `url.test.ts` and `useUrlHash.browser.test.tsx` share. |
| `apps/lab/src/state/useUrlHash.ts` | The hash's two directions, its debounce, and its two guards. |
| `apps/lab/src/design/run.css` | The run column, the preset strip and the clamp notice, ported from the mock. |

**Modified**

| Path | Change |
|---|---|
| `apps/lab/src/state/ui.slice.ts` | `auto`, `help`, `clamped` and their actions. |
| `apps/lab/src/state/params.slice.ts` | The `edits` counter and the human/machine split. |
| `apps/lab/src/state/view.slice.ts` | `setFlag`, because a link states a flag rather than flipping it. |
| `apps/lab/src/console/Console.tsx` | Accepts and places `children` as the third track. |
| `apps/lab/src/console/KnobPanel.tsx` | The group's help paragraph follows the `help` switch. |
| `apps/lab/src/console/ValueKnob.tsx`, `ChoiceKnob.tsx`, `StartKnob.tsx` | `.why` splits into a reason span and a description span. |
| `apps/lab/src/stage/RunStatusBar.tsx` | The refusal message and the big-board warning. |
| `apps/lab/src/shell/TopBar.tsx` | The preset name beside the size. |
| `apps/lab/src/routes/LabRoute.tsx` | Takes a `RunControl`; renders the strip, the notice and the column; loses Generate from `.fw-bar`. |
| `apps/lab/src/App.tsx` | Builds the control, mounts `useAutoRun` and `useUrlHash`, runs on load. |
| `apps/lab/src/design/console.css`, `shell.css` | The third grid track, the 900px span, `.fw-lab`'s new first row, `.fw-go`'s new home. |
| `apps/lab/src/main.tsx` | Imports `run.css`. |
| `packages/engine/lab-i18n.ts` | Five new `ui` keys in both languages. |
| `docs/superpowers/specs/2026-09-13-lab-react-app-design.md` | §10 row 4 gains the `f` hotkey and the solo view (Ruling 14). |

---

## Task 1: The two switches and the clamp flag in `ui.slice`

**Files:** Modify `apps/lab/src/state/ui.slice.ts`; test `apps/lab/src/state/ui.slice.test.ts`.

**Interfaces:**
- Produces: `UiState` gains `auto: boolean` (starts `false`), `help: boolean` (starts `true`), `clamped: boolean` (starts `false`), `setAuto(on: boolean)`, `setHelp(on: boolean)`, `raiseClamped(on: boolean)`. The setters take a value rather than toggling, because two of the three callers know the answer already: the hash reader writes `help` from the payload and a preset writes `clamped` from what `setMany` returned.

- [ ] **Step 1: Write the failing test**

Append to `apps/lab/src/state/ui.slice.test.ts`, following the self-referencing store idiom the file already uses:

```ts
describe('the switches the run column owns', () => {
  function slice() {
    const store: { ui: UiState } = { ui: createUiSlice((fn) => Object.assign(store, fn(store))) }
    return store
  }

  it('starts with auto off and help on, as the old lab does', () => {
    const store = slice()
    expect(store.ui.auto).toBe(false)
    expect(store.ui.help).toBe(true)
    expect(store.ui.clamped).toBe(false)
  })

  it('sets each switch to what it is given, rather than toggling', () => {
    const store = slice()
    store.ui.setAuto(true)
    store.ui.setAuto(true)
    expect(store.ui.auto).toBe(true)
    store.ui.setHelp(false)
    expect(store.ui.help).toBe(false)
    expect(store.ui.auto).toBe(true)
  })

  it('raises and lowers the clamp notice', () => {
    const store = slice()
    store.ui.raiseClamped(true)
    expect(store.ui.clamped).toBe(true)
    store.ui.raiseClamped(false)
    expect(store.ui.clamped).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx run lab:test -- ui.slice`
Expected: FAIL with `expected undefined to be false` — Vitest does not type-check, so the missing field reads as `undefined` rather than as a type error.

- [ ] **Step 3: Write the implementation**

```ts
export interface UiState {
  entry: RailEntry
  /** Generate 350 ms after a knob is edited. Off at first, as in the old lab. */
  auto: boolean
  /** Show every parameter description. On at first; a link may turn it off. */
  help: boolean
  /** A preset or a link moved a value into range and has not been dismissed. */
  clamped: boolean
  select(entry: RailEntry): void
  setAuto(on: boolean): void
  setHelp(on: boolean): void
  raiseClamped(on: boolean): void
}

export function createUiSlice(set: SetStore): UiState {
  const patch = (next: Partial<UiState>) => set((state) => ({ ui: { ...state.ui, ...next } }))
  return {
    // `board` first: the old lab opens board and skeleton by default, and the
    // mock shows one group at a time (spec §5.2).
    entry: 'board',
    auto: false,
    help: true,
    clamped: false,
    select: (entry) => patch({ entry }),
    setAuto: (auto) => patch({ auto }),
    setHelp: (help) => patch({ help }),
    raiseClamped: (clamped) => patch({ clamped }),
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm nx run lab:test -- ui.slice`
Expected: PASS, with the existing `entry`/`select` cases still green.

- [ ] **Step 5: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src/state
git add apps/lab/src/state/ui.slice.ts apps/lab/src/state/ui.slice.test.ts
git commit -m "Give the ui slice the two switches and the flag the run column needs"
```

---

## Task 2: The counter that tells a typed change from an applied one

**Files:** Modify `apps/lab/src/state/params.slice.ts`; test `apps/lab/src/state/params.slice.test.ts`.

**Interfaces:**
- Produces: `ParamsState` gains `edits: number`, starting at 0, incremented by `set` and `setStart` and left alone by `setMany` and `reset`. Task 8's `useAutoRun` is its only reader.

- [ ] **Step 1: Write the failing test**

Append to `apps/lab/src/state/params.slice.test.ts`, using whatever store helper that file already defines (it has a `params()` accessor):

```ts
describe('the edit counter behind auto-generate', () => {
  it('counts a knob a person committed', () => {
    expect(params().edits).toBe(0)
    params().set('W', 30)
    params().set('H', 40)
    expect(params().edits).toBe(2)
  })

  it('counts the start control, which writes two knobs through one surface', () => {
    params().setStart('tunnels')
    expect(params().edits).toBe(1)
  })

  it('counts the mixing arm of the start control too', () => {
    params().setStart('mixing')
    expect(params().edits).toBe(1)
  })

  it('counts a clamped commit — the knob moved, whatever the value asked for', () => {
    params().set('W', 100000)
    expect(params().edits).toBe(1)
  })

  // The point of the whole counter: a preset, Defaults, New seed and a link
  // all start their run themselves, immediately (spec §2.2). If they bumped
  // this, `auto` would start a second run 350 ms later and terminate the
  // first mid-carve.
  it('does not count what a preset, Defaults or a link applied', () => {
    params().setMany({ W: 30, H: 40 })
    params().reset()
    expect(params().edits).toBe(0)
  })
})
```

Each case needs a fresh slice; follow the file's existing per-case construction rather than sharing one across the block.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx run lab:test -- params.slice`
Expected: FAIL with `expected undefined to be 0`.

- [ ] **Step 3: Write the implementation**

Add the field with the comment that carries the rule:

```ts
  /**
   * How many knobs a person has committed. Only `set` and `setStart` — the
   * two surfaces a hand reaches — move it; `setMany` and `reset` are the
   * machine path (preset, Defaults, New seed, link) and every one of those
   * starts its own run immediately. `useAutoRun` watches this and nothing
   * else, so the two paths cannot both fire for one action (Ruling 3).
   */
  edits: number
```

Thread a flag through `write`:

```ts
  const write = (patch: Partial<Params>, typed: boolean): boolean => {
    let clamped = false
    set((state) => {
      const c = commit(state.params.values, patch)
      clamped = c.clamped
      return {
        params: {
          ...state.params,
          values: c.values,
          edits: typed ? state.params.edits + 1 : state.params.edits,
          ...indexesOf(c.values),
        },
      }
    })
    return clamped
  }
  return {
    values: initial,
    edits: 0,
    ...indexesOf(initial),
    set: (key, value) => write({ [key]: value }, true),
    setMany: (patch) => write(patch, false),
```

`setStart`'s fast arm becomes `write(pair, true)`; its `mixing` arm builds its own object and must add `edits: state.params.edits + 1` to it. `reset` leaves `edits` where it is: the counter is a change signal, not a history.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm nx run lab:test -- params.slice`
Expected: PASS, including the existing clamping and index cases.

- [ ] **Step 5: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src/state
git add apps/lab/src/state/params.slice.ts apps/lab/src/state/params.slice.test.ts
git commit -m "Count the knobs a person edits apart from the ones a preset applies"
```

---

## Task 3: One funnel every trigger goes through

**Files:** Create `apps/lab/src/run/useRun.ts`, `apps/lab/src/run/useRun.browser.test.tsx`; modify `apps/lab/src/App.tsx`, `apps/lab/src/routes/LabRoute.tsx`.

**Interfaces:**

```ts
export interface RunControl {
  /** Starts a run from the knobs as they stand. Refuses while a rule is broken. */
  start(): void
  /** Terminates the worker if one is carving; does nothing otherwise. */
  abort(): void
  /** Registers the cancel of a debounce that has not fired. Task 8 calls it. */
  hold(cancel: () => void): void
}
export function useRun(generator: GeneratorHandle): RunControl
```

`LabRoute`'s prop changes from `generator: GeneratorHandle` to `control: RunControl`.

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/run/useRun.browser.test.tsx`. `renderHook`, not a probe component (Ruling 12); `{ wShort: 0.8, wMid: 0.8 }` is the suite's violation, and it is a real one (`sharesSum`, `engine.ts:2800`):

```tsx
import { renderHook } from 'vitest-browser-react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GeneratorHandle } from '../worker/useGenerator'
import { useStore } from '../state/store'
import { useRun } from './useRun'

function stub() {
  const calls = { start: 0, abort: 0 }
  const generator: GeneratorHandle = {
    start: () => void calls.start++,
    abort: () => void calls.abort++,
  }
  return { generator, started: () => calls.start, aborted: () => calls.abort }
}

beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
})

describe('useRun', () => {
  it('hands the worker the knobs as they stand at the call', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator))
    useStore.getState().params.set('W', 33)
    result.current.start()
    expect(g.started()).toBe(1)
  })

  // The button is disabled too, but `auto` and a link arriving from another
  // window are not buttons, so the refusal lives here (Ruling 4).
  it('refuses while a rule is broken, whoever asked', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator))
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    expect(useStore.getState().params.violations.length).toBeGreaterThan(0)
    result.current.start()
    expect(g.started()).toBe(0)
  })

  it('cancels a debounce that has not fired before starting', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator))
    const cancel = vi.fn()
    result.current.hold(cancel)
    result.current.start()
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  // Cancelling comes first: a refused run must still clear the timer, or the
  // debounce fires 350 ms later into the same refusal.
  it('cancels even when it then refuses', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator))
    const cancel = vi.fn()
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    result.current.hold(cancel)
    result.current.start()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(g.started()).toBe(0)
  })

  it('passes an abort straight through', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator))
    result.current.abort()
    expect(g.aborted()).toBe(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx run lab:test -- useRun`
Expected: FAIL at Vite's import analysis, `Failed to resolve import "./useRun"`.

- [ ] **Step 3: Write the implementation**

```ts
import { useCallback, useMemo, useRef } from 'react'
import { useStore } from '../state/store'
import type { GeneratorHandle } from '../worker/useGenerator'

export interface RunControl {
  start(): void
  abort(): void
  hold(cancel: () => void): void
}

/**
 * The one place a run begins. The old lab says it plainly at `lab-page.ts:869`
 * — "Every way of starting a run (button, auto-generate, preset, URL, reseed)
 * ends here, so this is the one place the envelope is enforced" — and this is
 * the port of that sentence. Seven triggers call `start()`; none of them has
 * to remember to check the rules or to cancel a pending debounce.
 *
 * The knobs are read with `getState()` at the call rather than through a
 * subscription: a run must use the values of the moment it started, and a
 * subscription here would rerender the shell on every drag (Ruling 11).
 */
export function useRun(generator: GeneratorHandle): RunControl {
  const cancel = useRef<(() => void) | null>(null)

  const start = useCallback(() => {
    // Before the refusal, not after: a refused trigger must still clear the
    // timer, or the debounce fires into the same refusal a moment later.
    cancel.current?.()
    const { params } = useStore.getState()
    // Silent here, spoken by `RunStatusBar` (Ruling 13): a funnel that logged
    // its own refusal would be a second voice for the rule `Violations`
    // already states.
    if (params.violations.length > 0) return
    generator.start(params.values)
  }, [generator])

  const abort = useCallback(() => generator.abort(), [generator])
  const hold = useCallback((fn: () => void) => {
    cancel.current = fn
  }, [])

  return useMemo(() => ({ start, abort, hold }), [start, abort, hold])
}
```

- [ ] **Step 4: Rewire the shell and the route**

`App.tsx`'s `Shell`:

```tsx
  const generator = useGenerator()
  const control = useRun(generator)
  …
      <LabRoute control={control} hidden={!onLab} />
```

`LabRoute.tsx` takes `{ control, hidden }: { control: RunControl; hidden: boolean }`, drops its local `start`, and points the button at `control.start`. Its `disabled={running || blocked}` and `title={blocked ? … }` stay exactly as they are — the disabled button is the visible half of the rule `useRun` enforces invisibly, and Task 4 moves both into the column unchanged.

- [ ] **Step 5: Run the whole lab suite**

Run: `pnpm nx run lab:test`
Expected: PASS. `LabRoute.browser.test.tsx` mounts `<App />`, so it exercises the new wiring without being edited.

- [ ] **Step 6: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src/run apps/lab/src/App.tsx apps/lab/src/routes/LabRoute.tsx
git commit -m "Send every way of starting a run through one function"
```

---

## Task 4: The run column, and the console's third track

**Files:** Create `apps/lab/src/run/RunColumn.tsx`, `apps/lab/src/run/RunColumn.browser.test.tsx`, `apps/lab/src/design/run.css`; modify `apps/lab/src/console/Console.tsx`, `apps/lab/src/routes/LabRoute.tsx`, `apps/lab/src/design/console.css`, `apps/lab/src/design/shell.css`, `apps/lab/src/main.tsx`, `packages/engine/lab-i18n.ts`.

**Interfaces:**
- Produces: `RunColumn({ control }: { control: RunControl })`; `Console` accepts `children: ReactNode` and places it as the grid's third child.

- [ ] **Step 1: Add the two dictionary keys**

`EN.ui`: `cliLabel: 'CLI'`, `runColumn: 'Run'`. `PL.ui`: `cliLabel: 'CLI'`, `runColumn: 'Generowanie'` — the Polish table says *generowanie* everywhere a run is named (`generating`, `genShort`), and *bieg* appears nowhere in it. Then `pnpm nx build engine`.

- [ ] **Step 2: Write the failing test**

Create `apps/lab/src/run/RunColumn.browser.test.tsx`. No unused imports — `noUnusedLocals` is on:

```tsx
import { render } from 'vitest-browser-react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import type { RunControl } from './useRun'
import { RunColumn } from './RunColumn'

function stub() {
  const calls = { start: 0, abort: 0 }
  const control: RunControl = { start: () => void calls.start++, abort: () => void calls.abort++, hold: () => {} }
  return { control, started: () => calls.start, aborted: () => calls.abort }
}

beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
  state.ui.setAuto(false)
  state.ui.setHelp(true)
})

describe('RunColumn', () => {
  it('is a region a screen reader can name', async () => {
    const screen = await render(<RunColumn control={stub().control} />)
    await expect.element(screen.getByRole('region', { name: 'Run' })).toBeInTheDocument()
  })

  it('starts a run from the primary action', async () => {
    const g = stub()
    const screen = await render(<RunColumn control={g.control} />)
    await screen.getByRole('button', { name: 'Generate' }).click()
    expect(g.started()).toBe(1)
  })

  it('refuses the primary action while a rule is broken, and says why', async () => {
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    const screen = await render(<RunColumn control={stub().control} />)
    const go = screen.getByRole('button', { name: 'Generate' })
    await expect.element(go).toBeDisabled()
    await expect.element(go).toHaveAttribute('title')
  })

  // Abort is not a second Generate: it is live exactly while a worker is.
  it('offers Abort only while a run is in flight', async () => {
    const g = stub()
    const screen = await render(<RunColumn control={g.control} />)
    await expect.element(screen.getByRole('button', { name: 'Abort' })).toBeDisabled()
    useStore.getState().run.started(useStore.getState().params.values)
    await expect.element(screen.getByRole('button', { name: 'Abort' })).toBeEnabled()
    await screen.getByRole('button', { name: 'Abort' }).click()
    expect(g.aborted()).toBe(1)
  })
})
```

The `beforeEach` is what keeps the fourth case's `run.started(...)` from leaving a phantom run in flight for the next case; revision 1 omitted it and the suite passed only by accident.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm nx run lab:test -- RunColumn`
Expected: FAIL, `Failed to resolve import "./RunColumn"`.

- [ ] **Step 4: Write the component**

`LiveCommand`, the alternative actions and the switches arrive in Tasks 6–8; this task builds the container and moves Generate and Abort into it.

```tsx
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import type { RunControl } from './useRun'

/**
 * The mock's third console track (`.fw-run-col`). It is a child of `Console`
 * rather than a sibling, so PR 4's simple console places the very same element
 * and cannot fork it (Ruling 2).
 *
 * Generate carries the rule twice on purpose: `useRun` refuses silently for
 * the triggers that are not buttons, and the disabled attribute is what a
 * person sees. `RunStatusBar` speaks it (Task 5) and `Violations` spells it out.
 */
export function RunColumn({ control }: { control: RunControl }) {
  const dict = useDictionary()
  const running = useStore((state) => state.run.phase === 'running')
  const blocked = useStore((state) => state.params.violations.length > 0)
  return (
    <section className="fw-run-col" aria-label={dict.t('runColumn')}>
      <button
        type="button"
        className="fw-go"
        onClick={control.start}
        disabled={running || blocked}
        title={blocked ? dict.t('generateBlocked') : undefined}
      >
        {dict.t('generate')}
      </button>
      <div className="fw-alt">
        <button type="button" onClick={control.abort} disabled={!running}>
          {dict.t('abort')}
        </button>
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Let `Console` place it**

```tsx
/**
 * The mock's three-track console: the group rail, one panel, and the run
 * column. The column comes in as a child rather than being built here, so the
 * simple console of PR 4 shows the same instance and a run in flight survives
 * the swap (§5.1, Ruling 2).
 */
export function Console({ children }: { children: ReactNode }) {
  const entry = useStore((state) => state.ui.entry)
  return (
    <div className="fw-console">
      <GroupRail />
      {entry === 'preview' ? <ViewPanel /> : <KnobPanel group={entry} />}
      {children}
    </div>
  )
}
```

- [ ] **Step 6: Move the button out of the bar**

`LabRoute.tsx`: `.fw-bar` keeps `RunStatusBar` alone; the column goes into the console.

```tsx
        <div className="fw-bar">
          <RunStatusBar />
        </div>
        <div className="fw-lab">
          <Stage />
          <Console>
            <RunColumn control={control} />
          </Console>
          <Violations />
        </div>
```

- [ ] **Step 7: Port the CSS**

Create `apps/lab/src/design/run.css`:

```css
/* The run column, ported from `fronthub-workshop-v2.css` (`.fw-run-col`,
   `.fw-alt`, `.fw-ghost`). The mock has no Abort and no switches here; both
   are added under their own comments. */
.fw-run-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 14px;
  background: var(--graphite);
  min-height: 0;
  overflow-y: auto;
}
.fw-alt {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
/* `.fw .fw-alt button` and not a bare selector: the `.fw button` reset in
   shell.css is (0,1,1) and would outrank (0,1,0) on `color`. Every rule in
   this file carries the prefix for the same reason. */
.fw .fw-alt button {
  flex: none;
  height: 32px;
  min-height: 32px;
  white-space: nowrap;
  border: 1px solid var(--border);
  background: none;
  color: var(--ink);
  cursor: pointer;
}
.fw .fw-alt button:hover:not(:disabled) {
  background: var(--surface);
}
/* The mock has no disabled state, because nothing in it can refuse. Half
   opacity is what `.fw .fw-go:disabled` already uses, so the two refusals
   look like one rule. Measured: --ink at 0.5 over --graphite is 4.70:1. */
.fw .fw-alt button:disabled {
  opacity: 0.5;
  cursor: default;
}
.fw-ghost {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 8px;
}
@media (pointer: coarse) {
  .fw .fw-alt button {
    height: 44px;
  }
}
```

`console.css` restores the third track and lets it span when the console collapses:

```css
.fw-console {
  grid-template-columns: 168px minmax(0, 1fr) 216px;
}
@media (max-width: 900px) {
  .fw-console {
    grid-template-columns: 150px minmax(0, 1fr);
  }
  /* A full-width row under the two tracks, which is the mock's own query. */
  .fw-run-col {
    grid-column: 1 / -1;
  }
}
```

`shell.css`: `.fw .fw-go` grows from the bar's 32px to the column's 40px and gains the mock's top margin; the coarse-pointer override stays at 44px.

```css
.fw .fw-go {
  height: 40px;
  min-height: 40px;
  margin-top: 10px;
  padding: 0 16px;
  …
}
```

`main.tsx` imports `./design/run.css` after `console.css`.

- [ ] **Step 8: Run the whole lab suite**

Run: `pnpm nx run lab:test`
Expected: PASS. Existing cases find Generate by role and name, so moving it between containers does not touch them.

- [ ] **Step 9: Look at it**

`pnpm nx run lab:serve`, then at 1400px and 860px check: the column is 216px and grey against the panel, Generate is 40px tall, and below 900px the column becomes a full-width row rather than vanishing.

- [ ] **Step 10: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src packages/engine/lab-i18n.ts
git commit -m "Give the console its third track, and move Generate into it"
```

---

## Task 5: The status line says why a run did not start, and warns before a big one

**Files:** Modify `apps/lab/src/stage/RunStatusBar.tsx`; create `apps/lab/src/stage/RunStatusBar.browser.test.tsx`.

**Interfaces:**
- Consumes: `run.phase`, `run.params`, `params.violations`. No new exports.

Both dictionary keys already exist in both languages and are unused today: `generateBlocked` and `generatingBig(W, H, cells)` (`lab-i18n.ts:118`).

- [ ] **Step 1: Write the failing test**

```tsx
import { dictionary } from '@arrowz/engine/i18n'
import { render } from 'vitest-browser-react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { RunStatusBar } from './RunStatusBar'

const EN = dictionary('en')

beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
})

describe('RunStatusBar', () => {
  // Ruling 13: `auto` and a pasted link have no disabled button to look at,
  // and on /boards there is no Violations panel either.
  it('says the run is refused while a rule is broken', async () => {
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    const screen = await render(<RunStatusBar />)
    await expect.element(screen.getByRole('status')).toMatchTextContent(EN.t('generateBlocked'))
  })

  it('goes back to the prompt when the rule is satisfied again', async () => {
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    const screen = await render(<RunStatusBar />)
    useStore.getState().params.setMany({ wShort: 0.3, wMid: 0.3 })
    await expect.element(screen.getByRole('status')).toMatchTextContent(EN.t('pressGenerate'))
  })

  // The old lab warns before a carve that will take a while (lab-page.ts:882);
  // spec §10 lists it among the features the port must restore.
  it('warns for a board over 200 000 cells, and not for a small one', async () => {
    const state = useStore.getState()
    state.params.setMany({ W: 600, H: 600 })
    state.run.started(useStore.getState().params.values)
    const screen = await render(<RunStatusBar />)
    await expect.element(screen.getByRole('status')).toMatchTextContent(/600×600/)
  })

  it('says only "Generating…" for a board under the threshold', async () => {
    const state = useStore.getState()
    state.params.setMany({ W: 25, H: 25 })
    state.run.started(useStore.getState().params.values)
    const screen = await render(<RunStatusBar />)
    await expect.element(screen.getByRole('status')).toMatchTextContent(EN.t('generating'))
  })
})
```

`<output>` has the implicit role `status`, so `getByRole('status')` finds the existing element without a markup change.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx run lab:test -- RunStatusBar`
Expected: FAIL on cases 1 and 3 — the line reads `Press "Generate".` and `Generating…`.

- [ ] **Step 3: Write the implementation**

Two changes inside the existing `if/else` chain. First, the running branch takes the size from the run's own parameters, not from the knobs on screen:

```tsx
  const blocked = useStore((state) => state.params.violations.length > 0)
  …
  if (run.phase === 'running') {
    const p = run.progress
    if (p === null) {
      // The size is the run's, not the console's: the old lab reads
      // `state` at the moment `run()` fires, and a knob edited during a
      // carve must not rewrite the warning about the carve already going.
      const started = run.params
      const cells = started === null ? 0 : started.W * started.H
      text =
        started !== null && cells > 200000
          ? dict.t('generatingBig', started.W, started.H, dict.fmt(cells))
          : dict.t('generating')
    } else {
      text = dict.t('progress', …).replace(/<\/?b>/g, '')
    }
  } else if (…)
```

Second, the idle branch prefers the refusal to the prompt:

```tsx
  } else if (run.phase !== 'done' || run.report === null) {
    // Idle, and three idles are distinguishable: refused, aborted, fresh.
    // The refusal comes first — a page that says "Press Generate" beside a
    // Generate it has disabled is telling the user to do the impossible.
    text = blocked ? dict.t('generateBlocked') : run.wasAborted ? dict.t('aborted') : dict.t('pressGenerate')
  }
```

- [ ] **Step 4: Run the tests**

Run: `pnpm nx run lab:test -- RunStatusBar LabRoute`
Expected: PASS. `LabRoute.browser.test.tsx:212` sets the same violation; check whether any of its assertions read the status line while blocked, and update the expectation to the refusal rather than weakening it.

- [ ] **Step 5: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src/stage
git commit -m "Say why a run did not start, and warn before a carve that will take a while"
```

---

## Task 6: The live command, and copying it

**Files:** Create `apps/lab/src/run/LiveCommand.tsx`, `apps/lab/src/run/LiveCommand.browser.test.tsx`; modify `apps/lab/src/run/RunColumn.tsx`, `apps/lab/src/design/run.css`.

- [ ] **Step 1: Write the failing test**

`toHaveTextContent` is exact equality, and the `<figure>`'s text is `CLI` + `Copy` + the command; the assertion therefore reads the `<pre>`:

```tsx
import { buildCommand } from '@arrowz/engine/command'
import { render } from 'vitest-browser-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'
import { LiveCommand } from './LiveCommand'

function commandNow() {
  const state = useStore.getState()
  return buildCommand(state.params.values, viewOf(state.view))
}

beforeEach(() => useStore.getState().params.reset())
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('LiveCommand', () => {
  // The lab is a layer over the CLI: the box shows what `carve` would be run
  // with, from the knobs on screen and not from the board drawn.
  it('is exactly what buildCommand builds for the knobs on screen', async () => {
    useStore.getState().params.setMany({ W: 30, H: 60, seed: 7 })
    const screen = await render(<LiveCommand />)
    await expect.poll(() => screen.container.querySelector('.fw-cmd')?.textContent).toBe(commandNow())
  })

  it('follows a preview field, which changes the command without generating', async () => {
    const screen = await render(<LiveCommand />)
    useStore.getState().view.setNumber('stroke', '0.4')
    await expect.element(screen.getByRole('figure')).toMatchTextContent(/--line=0\.4/)
  })

  it('copies the whole command, prefix included', async () => {
    const write = vi.fn(() => Promise.resolve())
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText: write } as unknown as Clipboard)
    const screen = await render(<LiveCommand />)
    const expected = commandNow()
    await screen.getByRole('button', { name: 'Copy' }).click()
    expect(write).toHaveBeenCalledWith(expected)
  })

  it('says it copied, and stops saying so', async () => {
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({
      writeText: () => Promise.resolve(),
    } as unknown as Clipboard)
    const screen = await render(<LiveCommand />)
    await screen.getByRole('button', { name: 'Copy' }).click()
    await expect.element(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    await expect.element(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })
})
```

The last case waits the real 1200 ms rather than faking the clock: `expect.element` polls, and a fake clock without `shouldAdvanceTime` would stop the poll while `shouldAdvanceTime` would make the timing meaningless. 1200 ms is a wait this suite can afford once; the 350 ms boundary in Task 8, which needs the *exact* moment, is the one that earns fake timers.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx run lab:test -- LiveCommand`
Expected: FAIL, `Failed to resolve import "./LiveCommand"`.

- [ ] **Step 3: Write the component**

```tsx
import { buildCommand, COMMAND_PREFIX } from '@arrowz/engine/command'
import { useEffect, useRef, useState } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'

/**
 * The command that would reproduce what is configured — not what is drawn.
 * The old lab states the rule at `lab-page.ts:741`: "The command matches the
 * CURRENT knobs, not the last board: the lab is a layer over the CLI and must
 * show exactly what would be run."
 *
 * `<figure>` around the mock's `<pre>`: a `<pre>` has no role and cannot be
 * named, and an unlabelled block of preformatted text is one of the §7.2 gaps.
 */
export function LiveCommand() {
  const dict = useDictionary()
  const values = useStore((state) => state.params.values)
  const view = useStore((state) => state.view)
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // A component unmounted inside the confirmation window must not write state
  // afterwards; StrictMode makes that happen in tests.
  useEffect(() => () => clearTimeout(timer.current), [])

  const command = buildCommand(values, viewOf(view))
  // The mock draws the flags in `--ink` and the program name in `--ash`. The
  // split is on the prefix the engine exports, so a change to the command's
  // shape cannot leave this cutting in the middle of a word.
  const flags = command.startsWith(COMMAND_PREFIX) ? command.slice(COMMAND_PREFIX.length) : ''
  const head = flags === '' ? command : COMMAND_PREFIX

  const copy = () => {
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1200)
    })
  }

  return (
    <figure className="fw-cmdfig" aria-label={dict.t('commandHead')}>
      <figcaption className="fw-cmdhd">
        <span className="caps">{dict.t('cliLabel')}</span>
        <button type="button" onClick={copy}>
          {copied ? dict.t('copied') : dict.t('copy')}
        </button>
      </figcaption>
      <pre className="fw-cmd">
        {head}
        <b>{flags}</b>
      </pre>
    </figure>
  )
}
```

- [ ] **Step 4: Put it at the top of the column**

In `RunColumn.tsx`, `<LiveCommand />` is the first child of `.fw-run-col`, above Generate — the mock's order.

- [ ] **Step 5: Port the CSS**

```css
/* `<figure>` carries a browser default margin; the mock's box has none, and
   the flex column depends on it. */
.fw-cmdfig {
  flex: 0 1 auto;
  min-height: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
}
.fw-cmdhd {
  flex: none;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  color: var(--ash);
  margin-bottom: 6px;
}
/* The mock paints this button `--signal`, which measures 3.81:1 on
   `--graphite` — under AA at 12px — and spends a colour §7.1 reserves for
   state and data on an action. `--mist` is 8.05:1 and moves to `--ink` on
   hover, the same ash-to-ink move `.fw-tabrow button` already makes. */
.fw .fw-cmdhd button {
  border: 0;
  background: none;
  color: var(--mist);
  cursor: pointer;
  padding: 0;
}
.fw .fw-cmdhd button:hover {
  color: var(--ink);
}
.fw-cmd {
  flex: 0 1 auto;
  min-height: 58px;
  overflow: hidden;
  margin: 0;
  padding: 10px 12px;
  background: var(--void);
  border: 1px solid var(--border);
  color: var(--ash);
  white-space: pre-wrap;
  word-break: break-all;
  font: inherit;
}
.fw-cmd b {
  font-weight: 400;
  color: var(--ink);
}
@media (pointer: coarse) {
  .fw .fw-cmdhd button {
    min-height: 44px;
  }
}
```

The mock declares `white-space` twice in `.fw-cmd`; the duplicate is dropped.

- [ ] **Step 6: Run the tests**

Run: `pnpm nx run lab:test -- LiveCommand RunColumn`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src
git commit -m "Show the command the knobs would run, and let it be copied"
```

---

## Task 7: New seed and Defaults

**Files:** Modify `apps/lab/src/run/RunColumn.tsx`, `apps/lab/src/run/RunColumn.browser.test.tsx`.

- [ ] **Step 1: Write the failing test**

Append to `RunColumn.browser.test.tsx`, adding `import { defaultParams, PARAM_SPEC } from '@arrowz/engine'` at the top:

```tsx
describe('the alternative actions', () => {
  it('draws a new seed and runs at once', async () => {
    const g = stub()
    useStore.getState().params.setMany({ seed: 1 })
    const screen = await render(<RunColumn control={g.control} />)
    await screen.getByRole('button', { name: 'New seed' }).click()
    expect(useStore.getState().params.values.seed).not.toBe(1)
    expect(g.started()).toBe(1)
  })

  // Ruling 3: the seed came from Math.random, not from a hand, so it must not
  // look like an edit — otherwise `auto` starts a second run behind it.
  it('draws that seed through the machine path, leaving the edit count alone', async () => {
    const before = useStore.getState().params.edits
    const screen = await render(<RunColumn control={stub().control} />)
    await screen.getByRole('button', { name: 'New seed' }).click()
    expect(useStore.getState().params.edits).toBe(before)
  })

  it('puts every knob back and runs at once', async () => {
    const g = stub()
    useStore.getState().params.set('W', 77)
    const screen = await render(<RunColumn control={g.control} />)
    await screen.getByRole('button', { name: 'Defaults' }).click()
    expect(useStore.getState().params.values.W).toBe(defaultParams().W)
    expect(g.started()).toBe(1)
  })

  it('keeps a drawn seed inside what the knob accepts', async () => {
    const spec = PARAM_SPEC.find((s) => s.key === 'seed')
    if (spec === undefined) throw new Error('PARAM_SPEC has no seed')
    const screen = await render(<RunColumn control={stub().control} />)
    for (let i = 0; i < 20; i++) await screen.getByRole('button', { name: 'New seed' }).click()
    const seed = useStore.getState().params.values.seed
    expect(seed).toBeGreaterThanOrEqual(spec.min)
    expect(seed).toBeLessThanOrEqual(spec.max)
  })

  // Neither button is disabled by a broken rule, and neither should be: the
  // point of Defaults is to escape one. New seed cannot, and says so through
  // the status line rather than through a dead button (Ruling 13).
  it('leaves Defaults usable while a rule is broken, and it clears the rule', async () => {
    const g = stub()
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    const screen = await render(<RunColumn control={g.control} />)
    await screen.getByRole('button', { name: 'Defaults' }).click()
    expect(useStore.getState().params.violations).toHaveLength(0)
    expect(g.started()).toBe(1)
  })
})
```

The first case's `not.toBe(1)` has a one-in-999999 chance of drawing 1 again; that is accepted rather than seeded, because seeding `Math.random` here would test the seed of the test.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx run lab:test -- RunColumn`
Expected: FAIL, no button named `New seed`.

- [ ] **Step 3: Write the implementation**

```tsx
  const setMany = useStore((state) => state.params.setMany)
  const resetParams = useStore((state) => state.params.reset)

  // `setMany` and not `set`: a seed the machine drew is not a knob a person
  // typed, and only the typed path may wake `auto` (Ruling 3). The range is
  // the old lab's own (`lab-page.ts:919`), and `clampParam` holds it inside
  // PARAM_SPEC's bounds regardless.
  const reseed = () => {
    setMany({ seed: Math.floor(Math.random() * 999999) })
    control.start()
  }
  const defaults = () => {
    resetParams()
    control.start()
  }
```

```tsx
      <div className="fw-alt">
        <button type="button" onClick={reseed}>
          {dict.t('reseed')}
        </button>
        <button type="button" onClick={defaults}>
          {dict.t('reset')}
        </button>
        <button type="button" onClick={control.abort} disabled={!running}>
          {dict.t('abort')}
        </button>
      </div>
```

The mock puts a `<span class="fw-key">]</span>` hint inside New seed. The shortcut it advertises is PR 7's, and a hint for a key that does nothing is worse than no hint, so the span comes back with the shortcut.

- [ ] **Step 4: Run the tests**

Run: `pnpm nx run lab:test -- RunColumn`
Expected: PASS, all nine cases.

- [ ] **Step 5: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src/run
git commit -m "Add the two runs that change the knobs first: a new seed and the defaults"
```

---

## Task 8: `auto`, and the 350 ms that separates a keystroke from a run

**Files:** Create `apps/lab/src/run/useAutoRun.ts`, `apps/lab/src/run/OptionSwitch.tsx`, `apps/lab/src/run/useAutoRun.browser.test.tsx`; modify `apps/lab/src/run/RunColumn.tsx`, `apps/lab/src/App.tsx`, `apps/lab/src/design/run.css`.

**Interfaces:**

```ts
export const AUTO_DELAY_MS = 350
export function useAutoRun(control: RunControl): void
export function OptionSwitch(props: { id: string; label: string; on: boolean; onChange(next: boolean): void }): ReactElement
```

`ReactElement`, not `JSX.Element` — React 19 no longer provides `JSX` as a global.

- [ ] **Step 1: Write the failing test**

Three harness facts shape this file. A zustand write outside React reaches the hook through `useSyncExternalStore`, which re-renders in a microtask, so **every store write is wrapped in `await act(...)`** — without it the subscription's timer has not been set when the clock is advanced, and revision 1's version of this test failed on its own assertion. Fake timers are installed **after** `renderHook` and **without** `shouldAdvanceTime`, because the point is the exact boundary. And every case resets `ui.auto`, because case 3 would otherwise leave it on for case 4.

```tsx
import { act } from 'react'
import { renderHook } from 'vitest-browser-react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import type { RunControl } from './useRun'
import { AUTO_DELAY_MS, useAutoRun } from './useAutoRun'

function stub() {
  const calls = { start: 0 }
  let cancel: (() => void) | null = null
  const control: RunControl = {
    start: () => void calls.start++,
    abort: () => {},
    hold: (fn) => void (cancel = fn),
  }
  return { control, started: () => calls.start, cancelPending: () => cancel?.() }
}

beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
  state.ui.setAuto(false)
})
afterEach(() => vi.useRealTimers())

describe('useAutoRun', () => {
  it('does nothing while the switch is off, however many knobs move', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    vi.useFakeTimers()
    await act(async () => useStore.getState().params.set('W', 31))
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS * 3)
    expect(g.started()).toBe(0)
  })

  it('runs once, 350 ms after the last of a burst of edits', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    useStore.getState().ui.setAuto(true)
    vi.useFakeTimers()
    await act(async () => useStore.getState().params.set('W', 31))
    await vi.advanceTimersByTimeAsync(200)
    await act(async () => useStore.getState().params.set('W', 32))
    await vi.advanceTimersByTimeAsync(349)
    expect(g.started()).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(g.started()).toBe(1)
  })

  // Ruling 3, from the other side: the machine path must be invisible here.
  it('ignores what a preset, Defaults or a link applied', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    useStore.getState().ui.setAuto(true)
    vi.useFakeTimers()
    await act(async () => useStore.getState().params.setMany({ W: 40, H: 40 }))
    await act(async () => useStore.getState().params.reset())
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS * 3)
    expect(g.started()).toBe(0)
  })

  it('does not run on being switched on: the switch arms the next edit', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    vi.useFakeTimers()
    await act(async () => useStore.getState().params.set('W', 33))
    await act(async () => useStore.getState().ui.setAuto(true))
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS * 3)
    expect(g.started()).toBe(0)
  })

  // Switching off with a timer already running must not carve anyway.
  it('does not run when the switch goes off inside the wait', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    useStore.getState().ui.setAuto(true)
    vi.useFakeTimers()
    await act(async () => useStore.getState().params.set('W', 34))
    await vi.advanceTimersByTimeAsync(100)
    await act(async () => useStore.getState().ui.setAuto(false))
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS)
    expect(g.started()).toBe(0)
  })

  it('hands its timer to the control, so any other trigger can cancel it', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    useStore.getState().ui.setAuto(true)
    vi.useFakeTimers()
    await act(async () => useStore.getState().params.set('W', 35))
    g.cancelPending()
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS * 3)
    expect(g.started()).toBe(0)
  })
})
```

Add `vi` to the vitest import; it is used in every case.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx run lab:test -- useAutoRun`
Expected: FAIL, `Failed to resolve import "./useAutoRun"`.

- [ ] **Step 3: Write the hook**

```ts
import { useEffect } from 'react'
import { useStore } from '../state/store'
import type { RunControl } from './useRun'

/** The old lab's own wait (`lab-page.ts:907-910`), named in one place. */
export const AUTO_DELAY_MS = 350

/**
 * Generate a while after the last knob was typed. Mounted once, in `App`.
 *
 * The subscription is inside the effect and not a `useStore(selector)` in
 * render (Ruling 11): `KnobSlider` commits on the range input's `onChange`,
 * about sixty times a second during a drag, and a selector here would repaint
 * the whole shell that often — the cost `useGenerator.ts:16-19` exists to
 * avoid, with nothing in `apps/lab` memoised against it.
 *
 * It watches `params.edits` and not `params.values`, for the reason Ruling 3
 * gives: a preset writes every knob at once and runs immediately, and a
 * watcher on the values could not tell that apart from a hand on a slider.
 *
 * `ui.auto` is read twice, and both readings matter. At the edit, so that
 * turning the switch on arms the *next* edit rather than carving the board
 * already on screen; and inside the timer, so that turning it off during the
 * wait cancels the run rather than merely stopping the next one.
 */
export function useAutoRun(control: RunControl): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const cancel = () => clearTimeout(timer)
    const unsubscribe = useStore.subscribe((state, prev) => {
      if (state.params.edits === prev.params.edits) return
      cancel()
      if (!state.ui.auto) return
      timer = setTimeout(() => {
        if (useStore.getState().ui.auto) control.start()
      }, AUTO_DELAY_MS)
      // Every other trigger calls `control.start()`, which calls this first.
      // That is what stops a preset chosen 100 ms after a keystroke from
      // carving twice (Ruling 4).
      control.hold(cancel)
    })
    return () => {
      cancel()
      unsubscribe()
    }
  }, [control])
}
```

- [ ] **Step 4: Write the switch**

The repository already has five `.fw-sw` switches, labelled with `aria-labelledby` against a sibling span's id (`ViewPanel.tsx:105-113`). This one follows that pattern rather than introducing a second: making the visible label a click target is an improvement worth making, and worth making to all seven at once in a PR of its own rather than to two of them here.

```tsx
/**
 * The mock's `Switch.jsx` track (`.fw-sw`, 44×26 with an 18px travel), used
 * for the two options the mock itself does not have. `role="switch"` on a
 * button and `aria-labelledby` against the visible span: the same shape
 * `ViewPanel`'s five switches already use, so the lab has one switch and not
 * two.
 */
export function OptionSwitch({ id, label, on, onChange }: { id: string; label: string; on: boolean; onChange(next: boolean): void }) {
  return (
    <div className="fw-opt">
      <span className="lab" id={`${id}-label`}>
        {label}
      </span>
      <button
        type="button"
        className="fw-sw"
        role="switch"
        aria-checked={on}
        aria-labelledby={`${id}-label`}
        onClick={() => onChange(!on)}
      />
    </div>
  )
}
```

- [ ] **Step 5: Put both switches in the column and mount the hook**

```tsx
      <div className="fw-ghost">
        <OptionSwitch id="opt-auto" label={dict.t('autoRun')} on={auto} onChange={setAuto} />
        <OptionSwitch id="opt-help" label={dict.t('showHelp')} on={help} onChange={setHelp} />
      </div>
```

with the four selectors above the JSX. `help` is wired here and does its work in Task 9; leaving the switch inert for one task is deliberate, so the two changes are reviewed apart.

In `App.tsx`'s `Shell`: `useAutoRun(control)` after `const control = useRun(generator)`.

- [ ] **Step 6: Style the option row**

```css
/* The mock's `.fw-k .row` shape, outside a knob. */
.fw-opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
}
.fw-opt .lab {
  color: var(--mist);
  min-width: 0;
}
/* The mock's switch is 44×26; the row, not the track, carries the touch
   target, because raising `.fw-sw` itself would move ViewPanel's five as well
   and that belongs in one PR about all seven. */
@media (pointer: coarse) {
  .fw-opt {
    min-height: 44px;
  }
}
```

- [ ] **Step 7: Run the tests**

Run: `pnpm nx run lab:test`
Expected: PASS. If a case in `useAutoRun.browser.test.tsx` hangs, the cause is an `expect.element` under fake timers — this file must use plain `expect`, because `expect.element` polls and the clock is frozen.

- [ ] **Step 8: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src
git commit -m "Generate a moment after the last knob moves, when the switch asks for it"
```

---

## Task 9: `help` hides descriptions from the eye and keeps them for a reader

**Files:** Modify `apps/lab/src/console/ValueKnob.tsx`, `ChoiceKnob.tsx`, `StartKnob.tsx`, `KnobPanel.tsx`, `apps/lab/src/design/console.css`; test `apps/lab/src/console/KnobPanel.browser.test.tsx`.

**Interfaces:** no new exports. The `.why` paragraph becomes a reason span and a description span, the description carrying `fw-vh` when the switch is off, and `aria-describedby` becomes unconditional.

- [ ] **Step 1: Write the failing test**

Append to `KnobPanel.browser.test.tsx`. The file imports `params` today; add `import { dictionary } from '@arrowz/engine/i18n'` and `import { PARAM_SPEC } from '@arrowz/engine'`, and find the spec inline rather than reaching for `specOf`, which lives only in `ValueKnob.browser.test.tsx`.

```tsx
const EN = dictionary('en')
function helpFor(key: ParamKey) {
  const spec = PARAM_SPEC.find((s) => s.key === key)
  if (spec === undefined) throw new Error(`PARAM_SPEC has no ${key}`)
  return EN.paramText(spec).help
}

describe('the help switch', () => {
  it('shows every description while it is on', async () => {
    useStore.getState().ui.setHelp(true)
    const screen = await render(<KnobPanel group="board" />)
    await expect.element(screen.getByText(helpFor('W'))).toBeVisible()
  })

  // Ruling 9: hidden from the eye, kept for a screen reader. `toBeVisible`
  // and not `textContent`, because the text is meant to still be there.
  it('hides the descriptions from the eye when it is off', async () => {
    useStore.getState().ui.setHelp(false)
    const screen = await render(<KnobPanel group="board" />)
    await expect.element(screen.getByText(helpFor('W'))).not.toBeVisible()
  })

  it('keeps the description in the accessibility tree when it is off', async () => {
    useStore.getState().ui.setHelp(false)
    const screen = await render(<KnobPanel group="board" />)
    const described = screen.container.querySelector('#knob-W-why')
    expect(described?.textContent).toContain(helpFor('W'))
  })

  // The whole point of splitting the paragraph. The old lab kept the reason
  // only by accident: `body.nohelp .help { display: none }` hid the element
  // and left its `::before` behind.
  it('keeps a violation visible with the descriptions off', async () => {
    useStore.getState().ui.setHelp(false)
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    const screen = await render(<KnobPanel group="lengths" />)
    await expect.element(screen.getByTestId('knob-wShort-why')).toBeVisible()
    await expect.element(screen.getByText(EN.violation(useStore.getState().params.violations[0]))).toBeVisible()
  })

  it('hides the group description too', async () => {
    useStore.getState().ui.setHelp(false)
    const screen = await render(<KnobPanel group="lengths" />)
    expect(screen.container.textContent).not.toContain(EN.d.groupHelp.lengths)
  })
})
```

The last case uses `textContent` rather than `toBeVisible`, because the group header's help is decoration for the eye with no describing role: it goes out of the tree entirely.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx run lab:test -- KnobPanel`
Expected: FAIL on cases 2, 4 and 5 — the description is visible with the switch off, no `data-testid` exists, and the group help is still rendered.

- [ ] **Step 3: Split the paragraph in `ValueKnob.tsx`**

```tsx
  const showHelp = useStore((state) => state.ui.help)
  …
  const { label, help: description } = dict.paramText(spec)
  …
  // Two spans, not one string. The state must survive the switch: it is the
  // reason the run is refused, and the switch is about descriptions (Ruling
  // 9). The description stays in the tree, visually hidden, so
  // `aria-describedby` never dangles and a link carrying `help:false` does
  // not strip the descriptions from someone else's screen reader.
  const whyId = `knob-${spec.key}-why`
```

```tsx
      <p className="why" id={whyId} data-testid={whyId}>
        {state === null ? null : <span className="state">{`${state}. `}</span>}
        <span className={showHelp ? 'desc' : 'desc fw-vh'}>{description}</span>
      </p>
```

`aria-describedby={whyId}` on the number, the entry and the slider loses its conditional: the paragraph is always present.

- [ ] **Step 4: Make the same split in `ChoiceKnob.tsx`**

It builds `why` in the same shape at line 32; apply the identical change including the `data-testid`.

- [ ] **Step 5: Make the same split in `StartKnob.tsx`**

Its paragraph carries only `start.help` and has no state span:

```tsx
        <p className="why" id="knob-start-why" data-testid="knob-start-why">
          <span className={showHelp ? 'desc' : 'desc fw-vh'}>{start.help}</span>
        </p>
```

- [ ] **Step 6: Make the group header follow**

```tsx
  const showHelp = useStore((state) => state.ui.help)
  …
        {help === undefined || !showHelp ? null : <span>{help}</span>}
```

- [ ] **Step 7: Add the one utility class**

In `console.css`, beside the `.why` rules:

```css
/* Out of sight, in the accessibility tree. Ruling 9: the help switch is
   labelled "show parameter descriptions", and showing is what a screen reader
   does not do. `clip-path` rather than `display: none`, which would take the
   text out of the tree and dangle every `aria-describedby` pointing at it. */
.fw-vh {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
/* A paragraph holding only a hidden description must not reserve a line. */
.fw-k .why:not(:has(> :not(.fw-vh))) {
  margin: 0;
}
```

- [ ] **Step 8: Run the whole console suite**

Run: `pnpm nx run lab:test -- console`
Expected: PASS. Cases in `ValueKnob.browser.test.tsx` asserting the combined string `"…reason. …description"` are the ones this task changes: split their expectation across the two spans rather than deleting it, because the ordering — reason first — is a behaviour.

- [ ] **Step 9: Look at it**

`pnpm nx run lab:serve`: with the switch off the knob grid must lose the description lines and keep its row rhythm, not collapse unevenly. If the `:has` rule does not hold the grid steady, replace it with an explicit `.why.fw-empty` class computed in the component — measured in the browser, not guessed.

- [ ] **Step 10: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src/console apps/lab/src/design
git commit -m "Let the help switch hide a description from the eye without taking it from a reader"
```

---

## Task 10: The preset strip, the clamp notice, and the preset's name in the top bar

**Files:** Create `apps/lab/src/run/PresetStrip.tsx`, `apps/lab/src/run/ClampNotice.tsx`, `apps/lab/src/run/PresetStrip.browser.test.tsx`, `apps/lab/src/run/ClampNotice.browser.test.tsx`; modify `apps/lab/src/run/RunColumn.tsx`, `apps/lab/src/routes/LabRoute.tsx`, `apps/lab/src/shell/TopBar.tsx`, `apps/lab/src/design/run.css`, `apps/lab/src/design/console.css`, `packages/engine/lab-i18n.ts`.

**Interfaces:**
- Produces: `PresetStrip({ control })`, `ClampNotice({ focusOnDismiss })`, and `RunColumn` gains `goRef` so the notice can hand focus back to Generate.

- [ ] **Step 1: Add the three dictionary keys**

`EN.ui`: `presetsLabel: 'Presets'`, `presetsDirty: 'edited'`, `dismiss: 'Dismiss'`.
`PL.ui`: `presetsLabel: 'Presety'` — the Polish table already uses the loanword (`presets.placeholder: 'Preset…'`) — `presetsDirty: 'zmienione'`, `dismiss: 'Zamknij'`. Then `pnpm nx build engine`.

- [ ] **Step 2: Write the failing tests**

`apps/lab/src/run/PresetStrip.browser.test.tsx`:

```tsx
import { PARAM_SPEC } from '@arrowz/engine'
import { exportCell } from '@arrowz/engine/simple'
import { findPreset, PRESETS } from '@arrowz/engine/presets'
import { render } from 'vitest-browser-react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import type { RunControl } from './useRun'
import { PresetStrip } from './PresetStrip'

function stub() {
  const calls = { start: 0 }
  const control: RunControl = { start: () => void calls.start++, abort: () => {}, hold: () => {} }
  return { control, started: () => calls.start }
}

const OPTIONS = PRESETS.flatMap((level) => level.options)

beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
  state.ui.raiseClamped(false)
})

describe('PresetStrip', () => {
  it('offers every preset the engine has, and no others', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    expect(screen.getByRole('button').elements()).toHaveLength(OPTIONS.length)
  })

  // Ruling 8: four chips read `square`, so the name a screen reader hears
  // carries the level and the size the visible label drops.
  it('names each chip in full for a screen reader', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await expect.element(screen.getByRole('button', { name: /Easy.*25×50.*tunnels/ })).toBeInTheDocument()
  })

  // A preset is a full configuration, not a patch (`lab-presets.ts`'s head
  // comment), so an unrelated knob left over from the last experiment goes.
  it('writes every knob, not only the ones the preset names', async () => {
    useStore.getState().params.set('warns', 3)
    const screen = await render(<PresetStrip control={stub().control} />)
    await screen.getByRole('button', { name: /Easy.*square/ }).click()
    const spec = PARAM_SPEC.find((s) => s.key === 'warns')
    if (spec === undefined) throw new Error('PARAM_SPEC has no warns')
    expect(useStore.getState().params.values.warns).toBe(spec.def)
  })

  // §2.2 row 2: "all knobs set from the preset, `cell` from `exportCell`".
  it('sets the export cell size the preset implies', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await screen.getByRole('button', { name: /Medium.*square/ }).click()
    expect(useStore.getState().view.cell).toBe(exportCell(50, 50))
  })

  it('runs at once, and through the machine path', async () => {
    const g = stub()
    const before = useStore.getState().params.edits
    const screen = await render(<PresetStrip control={g.control} />)
    await screen.getByRole('button', { name: /Easy.*square/ }).click()
    expect(g.started()).toBe(1)
    expect(useStore.getState().params.edits).toBe(before)
  })

  // `aria-current`, not `aria-pressed`: this is the current item of a set, not
  // twenty-six toggle buttons of which one never un-presses.
  it('marks the preset the knobs currently spell', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await screen.getByRole('button', { name: /Easy.*square/ }).click()
    expect(findPreset(useStore.getState().params.values)?.id).toBe('easy-square')
    await expect.element(screen.getByRole('button', { name: /Easy.*square/ })).toHaveAttribute('aria-current', 'true')
  })

  // Ruling 10: `findPreset` compares only the preset's own keys, so `seed`
  // cannot break the match and `W` can.
  it('says so when a knob the preset names has moved', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await screen.getByRole('button', { name: /Easy.*square/ }).click()
    useStore.getState().params.set('W', 26)
    await expect.element(screen.getByText('edited')).toBeInTheDocument()
  })

  it('does not say so for a knob no preset names', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await screen.getByRole('button', { name: /Easy.*square/ }).click()
    useStore.getState().params.set('seed', 12)
    expect(screen.container.textContent).not.toContain('edited')
  })
})
```

The store's own defaults are 25×50, which `easy-portrait` spells exactly, so a chip is already current on the first paint; that is correct and the cases above never assume an empty strip.

`apps/lab/src/run/ClampNotice.browser.test.tsx`:

```tsx
import { dictionary } from '@arrowz/engine/i18n'
import { useRef } from 'react'
import { render } from 'vitest-browser-react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { ClampNotice } from './ClampNotice'

const EN = dictionary('en')

function Host() {
  const go = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button type="button" ref={go}>
        Generate
      </button>
      <ClampNotice focusOnDismiss={go} />
    </>
  )
}

beforeEach(() => useStore.getState().ui.raiseClamped(false))

describe('ClampNotice', () => {
  // A live region inserted already-populated announces nothing in most screen
  // readers; the region is mounted from the start and only its content moves,
  // which is what `RunStatusBar` already does.
  it('keeps its region on the page while it has nothing to say', async () => {
    const screen = await render(<Host />)
    await expect.element(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByRole('status').element().textContent).toBe('')
  })

  it('fills the region when a value was pulled into range', async () => {
    const screen = await render(<Host />)
    useStore.getState().ui.raiseClamped(true)
    await expect.element(screen.getByRole('status')).toMatchTextContent(EN.t('clamped'))
  })

  it('empties on dismiss and hands focus back rather than dropping it', async () => {
    const screen = await render(<Host />)
    useStore.getState().ui.raiseClamped(true)
    await screen.getByRole('button', { name: 'Dismiss' }).click()
    expect(useStore.getState().ui.clamped).toBe(false)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Generate' }).element())
  })

  // Replaced by the outcome of the next load, not stacked with it: the old
  // lab's `showClamped(clamped)` takes a boolean for exactly this reason.
  it('is lowered again by a load that had nothing to clamp', async () => {
    const screen = await render(<Host />)
    useStore.getState().ui.raiseClamped(true)
    useStore.getState().ui.raiseClamped(false)
    expect(screen.getByRole('status').element().textContent).toBe('')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm nx run lab:test -- PresetStrip ClampNotice`
Expected: FAIL, `Failed to resolve import` for both components.

- [ ] **Step 4: Write the strip**

```tsx
import { PARAM_SPEC, type Params } from '@arrowz/engine'
import { exportCell } from '@arrowz/engine/simple'
import { findPreset, PRESETS } from '@arrowz/engine/presets'
import { Fragment } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import type { RunControl } from './useRun'

/**
 * Seven levels, twenty-six options, one scrolling strip (Ruling 8). A chip's
 * visible label is its mode alone, because `25×50 · square` twenty-six times
 * over is unreadable; the level name is a flat sibling span, hidden from the
 * accessibility tree exactly as `GroupRail.tsx:89-91` hides its two section
 * headings, and each chip's `aria-label` carries level, size and mode.
 */
export function PresetStrip({ control }: { control: RunControl }) {
  const dict = useDictionary()
  const values = useStore((state) => state.params.values)
  const setMany = useStore((state) => state.params.setMany)
  const setNumber = useStore((state) => state.view.setNumber)
  const raiseClamped = useStore((state) => state.ui.raiseClamped)
  const current = findPreset(values)
  // `PresetLevel.id` is a `string` and the dictionary's `levels` is a
  // fixed-key object, so the index needs narrowing — the same shape
  // `KnobPanel.tsx:22` uses for `groupHelp`.
  const levels = dict.d.presets.levels as Partial<Record<string, string>>

  const apply = (params: Partial<Params>) => {
    // Every knob, not only the ones the preset names: `lab-presets.ts` calls
    // an option "engine defaults + these overrides, so choosing one never
    // inherits knobs left over from the previous experiment". Seed included,
    // which is why two presets cannot be compared on one seed (Ruling 10).
    const full: Partial<Params> = {}
    for (const spec of PARAM_SPEC) full[spec.key] = params[spec.key] ?? spec.def
    // A preset is written for the engine's envelope, not for this board's, so
    // a value can arrive out of range and be pulled in. The notice is how the
    // move stops being silent (spec §5.3).
    raiseClamped(setMany(full))
    // §2.2 row 2: the export cell size follows the preset's size, as the old
    // lab does at `lab-page.ts:490`. It is a view field, so it goes through
    // the view slice's tolerant reader rather than into the knobs.
    const W = params.W ?? 0
    const H = params.H ?? 0
    setNumber('cell', String(exportCell(W, H)))
    control.start()
  }

  return (
    <div className="fw-presets" role="group" aria-label={dict.t('presetsLabel')}>
      {PRESETS.map((level) => {
        const levelName = levels[level.id] ?? level.id
        return (
          <Fragment key={level.id}>
            <span className="lbl caps" aria-hidden="true">
              {levelName}
            </span>
            {level.options.map((option) => {
              const W = option.params.W ?? 0
              const H = option.params.H ?? 0
              const mode = dict.d.presets.modes[option.mode]
              return (
                <button
                  key={option.id}
                  type="button"
                  {...(current?.id === option.id ? { 'aria-current': true } : {})}
                  aria-label={`${levelName} ${W}×${H} ${mode}`}
                  onClick={() => apply(option.params)}
                >
                  {mode}
                </button>
              )
            })}
          </Fragment>
        )
      })}
      {current === null ? <span className="dirty">{dict.t('presetsDirty')}</span> : null}
    </div>
  )
}
```

`modes[option.mode]` needs no fallback: `PresetMode` is the exact key union of that table.

The strip has no visible *Presets* caption of its own, unlike the mock: seven level labels already say what the row is, and an eighth label above them is the "unnecessary typographic label" the design brief names. `presetsLabel` is the group's accessible name instead, which is why it is used and not dead.

- [ ] **Step 5: Write the notice**

```tsx
import type { RefObject } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'

/**
 * A preset or a link moved a value into range — the old lab's `showClamped`
 * as a component (`lab-page.ts:699-703`). The region is mounted from the
 * start and only its content moves: a live region inserted already-populated
 * is not announced by most screen readers, and `RunStatusBar.tsx:67` already
 * sets the pattern this follows.
 *
 * `--warn` and not `--error`: nothing is refused, a value moved, and §7.1
 * reserves warn for exactly that.
 */
export function ClampNotice({ focusOnDismiss }: { focusOnDismiss: RefObject<HTMLButtonElement | null> }) {
  const dict = useDictionary()
  const clamped = useStore((state) => state.ui.clamped)
  const raiseClamped = useStore((state) => state.ui.raiseClamped)
  // The button dismisses itself, so focus would land on <body> and a keyboard
  // user would restart from the top of the document. It goes to the action
  // most likely to come next, which is the run the preset was chosen for.
  const dismiss = () => {
    raiseClamped(false)
    focusOnDismiss.current?.focus()
  }
  return (
    <div role="status" className={clamped ? 'fw-note hold' : undefined}>
      {clamped ? (
        <>
          <b>{dict.t('clamped')}</b>
          <button type="button" onClick={dismiss}>
            {dict.t('dismiss')}
          </button>
        </>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 6: Thread the ref and place both**

`RunColumn` takes `goRef?: RefObject<HTMLButtonElement | null> | undefined` (the `| undefined` is `exactOptionalPropertyTypes`) and puts it on the Generate button. `LabRoute` owns the ref:

```tsx
  const goRef = useRef<HTMLButtonElement>(null)
  …
        <div className="fw-lab">
          <PresetStrip control={control} />
          <Stage />
          <Console>
            <RunColumn control={control} goRef={goRef} />
          </Console>
          <ClampNotice focusOnDismiss={goRef} />
          <Violations />
        </div>
```

- [ ] **Step 7: Put the preset's name in the top bar**

Spec §5.1 gives the bar "mark, preset name, dims"; the preset only becomes knowable in this PR, so this PR owns it.

```tsx
  const values = useStore((state) => state.params.values)
  const preset = findPreset(values)
  const levels = dict.d.presets.levels as Partial<Record<string, string>>
  const name = preset === null ? null : `${levels[preset.id.split('-')[0] ?? ''] ?? ''} ${dict.d.presets.modes[preset.mode]}`.trim()
```

```tsx
      <span className="name">Arrowz</span>
      {name === null ? null : (
        <>
          <span className="sep">/</span>
          <span className="preset">{name}</span>
        </>
      )}
      <span className="sep">/</span>
      <span className="dims">{`${W}×${H}`}</span>
```

The bar now subscribes to the whole `values` object rather than to `W` and `H` alone, which its current comment warns against. That is deliberate and the comment must be rewritten rather than left contradicting the code: the bar shows the preset, the preset depends on six knobs, and `findPreset` over 26 options is cheap. Measure it once in the browser during Step 9 by dragging a slider and watching the profiler, and if the bar is a cost, memoise `findPreset` on `values` rather than reverting the feature.

- [ ] **Step 8: Port the CSS**

```css
/* presets, from the mock's `.fw-presets` — a flat flex row of labels and
   chips, which is exactly the mock's own structure. */
.fw-presets {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 16px;
  height: 38px;
  background: var(--void);
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}
.fw-presets .lbl {
  flex: none;
  margin: 0 10px 0 14px;
  color: var(--ash);
  white-space: nowrap;
}
.fw-presets .lbl:first-child {
  margin-left: 0;
}
.fw .fw-presets button {
  flex: none;
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--border);
  background: none;
  color: var(--mist);
  cursor: pointer;
  white-space: nowrap;
}
.fw .fw-presets button:hover {
  color: var(--ink);
  background: var(--surface);
}
/* The mock keys this off `aria-pressed`; twenty-six toggle buttons of which
   one never un-presses is the wrong state, so the strip uses `aria-current`
   as the group rail does. */
.fw .fw-presets button[aria-current='true'] {
  color: var(--void);
  background: var(--signal);
  border-color: transparent;
}
/* The mock paints this `--warn`, which §7.1 reserves for a clamped value or a
   rule bound; "edited" is neither. `--mist` measures 8.61:1 on `--void`. */
.fw-presets .dirty {
  flex: none;
  margin-left: 10px;
  color: var(--mist);
}
@media (pointer: coarse) {
  .fw-presets {
    height: auto;
    padding: 6px 16px;
  }
  .fw .fw-presets button {
    height: 44px;
  }
}
```

`console.css` gets `.fw-lab`'s new first row and the warn variant of the note:

```css
.fw-lab {
  display: grid;
  grid-template-rows: auto minmax(180px, 1fr) minmax(0, 1fr);
  min-height: 0;
}
/* The clamp notice: a value moved, nothing was refused. `--warn` is reserved
   for exactly this and for a rule bound (§7.1); the refusal note keeps
   `--error`. The empty region has no class at all, so it draws nothing. */
.fw-note.hold {
  border-left-color: var(--warn);
}
.fw-note.hold b {
  color: var(--warn);
}
/* `--mist` for the same reason as the copy button: `--signal` is 3.81:1 here
   and is reserved for state and data. */
.fw .fw-note.hold button {
  margin-left: 12px;
  border: 0;
  background: none;
  color: var(--mist);
  cursor: pointer;
  padding: 0;
}
.fw .fw-note.hold button:hover {
  color: var(--ink);
}
@media (pointer: coarse) {
  .fw .fw-note.hold button {
    min-height: 44px;
  }
}
```

- [ ] **Step 9: Run the tests and look at it**

Run: `pnpm nx run lab:test`, then `pnpm nx run lab:serve`. By eye: the strip scrolls horizontally, the current chip is Signal-filled, choosing *Easy · square* and then nudging W makes *edited* appear in `--mist`, and the top bar reads `Arrowz / Easy square / 25×50`. Drag a slider with the profiler open and confirm the top bar is not the frame's cost.

The strip is 26 buttons inside a route other tests mount; a case counting buttons across the whole page is one this task breaks — scope it to its own container rather than raising the number.

- [ ] **Step 10: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src packages/engine/lab-i18n.ts
git commit -m "Offer the engine's presets as a strip, name the current one, and say when one was pulled into range"
```

---

## Task 11: The hash codec

**Files:** Create `apps/lab/src/state/url.ts`, `apps/lab/src/state/url.fixtures.ts`, `apps/lab/src/state/url.test.ts`.

**Interfaces:**

```ts
export interface HashView {
  cell?: number | undefined
  stroke?: number | undefined
  headWidth?: number | undefined
  headHeight?: number | undefined
  top?: number | undefined
  rounded: boolean
  colored: boolean
  hilite: boolean
  help: boolean
}
/** The two keys this PR does not own, kept so a round trip cannot drop them. */
export interface Carried {
  lang?: unknown
  tab?: unknown
}
export interface HashPayload {
  params: Partial<Record<ParamKey, number>>
  view: HashView
  carried: Carried
}
export function encodeHash(input: { params: Params; view: HashView; carried: Carried }): string
export function decodeHash(hash: string): HashPayload | null
```

`url.fixtures.ts` exports the one `VIEW` literal both test files use, so they cannot drift.

- [ ] **Step 1: Write the fixture and the failing test**

`apps/lab/src/state/url.fixtures.ts`:

```ts
import type { HashView } from './url'

/** A complete view, shared by the codec's test and the hook's. */
export const VIEW: HashView = {
  cell: 12,
  stroke: 0.5,
  headWidth: 0,
  headHeight: 1,
  top: 5,
  rounded: true,
  colored: false,
  hilite: true,
  help: true,
}
```

`apps/lab/src/state/url.test.ts`:

```ts
import { defaultParams } from '@arrowz/engine'
import { describe, expect, it } from 'vitest'
import { decodeHash, encodeHash } from './url'
import { VIEW } from './url.fixtures'

describe('the hash codec', () => {
  it('reads back what it wrote', () => {
    const params = { ...defaultParams(), W: 33, H: 66, seed: 9 }
    const back = decodeHash(encodeHash({ params, view: VIEW, carried: {} }))
    expect(back?.params.W).toBe(33)
    expect(back?.params.seed).toBe(9)
    expect(back?.view).toEqual(VIEW)
  })

  // The format is shared with the deployed Deno lab, which writes the view
  // numbers as the raw strings of its input fields (Ruling 7).
  it('reads a link the old lab wrote, whose numbers are strings', () => {
    const legacy =
      '#' +
      encodeURIComponent(
        JSON.stringify({ W: 40, H: 40, __view: { cell: '18', stroke: '0.6', top: '7', rounded: true } }),
      )
    const back = decodeHash(legacy)
    expect(back?.params.W).toBe(40)
    expect(back?.view.cell).toBe(18)
    expect(back?.view.stroke).toBe(0.6)
    expect(back?.view.top).toBe(7)
  })

  // A head height of 0 meant "automatic" before the height became literal, so
  // every link shared before that change carries one; reading it as a height
  // would draw a headless board from an old link.
  it('treats a head height of 0 as unset, as the store reader does', () => {
    const legacy = '#' + encodeURIComponent(JSON.stringify({ __view: { headHeight: '0' } }))
    expect(decodeHash(legacy)?.view.headHeight).toBeUndefined()
  })

  // A `top` of 0 is legal and means no highlight, so absence and zero are not
  // the same answer for the other four numbers.
  it('keeps a zero that is a value rather than an absence', () => {
    const link = '#' + encodeURIComponent(JSON.stringify({ __view: { top: 0, headWidth: 0 } }))
    expect(decodeHash(link)?.view.top).toBe(0)
    expect(decodeHash(link)?.view.headWidth).toBe(0)
  })

  it('defaults the four flags the way the old lab does', () => {
    const bare = decodeHash('#' + encodeURIComponent(JSON.stringify({ __view: {} })))
    expect(bare?.view.rounded).toBe(true)
    expect(bare?.view.hilite).toBe(true)
    expect(bare?.view.help).toBe(true)
    expect(bare?.view.colored).toBe(false)
  })

  it('carries the language and the tab it does not own', () => {
    const link = '#' + encodeURIComponent(JSON.stringify({ __view: { lang: 'pl', tab: 'library' } }))
    const back = decodeHash(link)
    expect(back?.carried).toEqual({ lang: 'pl', tab: 'library' })
    const round = decodeHash(encodeHash({ params: defaultParams(), view: VIEW, carried: back?.carried ?? {} }))
    expect(round?.carried).toEqual({ lang: 'pl', tab: 'library' })
  })

  it('answers null for an empty or unreadable hash rather than throwing', () => {
    expect(decodeHash('')).toBeNull()
    expect(decodeHash('#')).toBeNull()
    expect(decodeHash('#not-json')).toBeNull()
    expect(decodeHash('#%E0%A4%A')).toBeNull()
  })

  it('reports only the knobs the link actually named', () => {
    const back = decodeHash('#' + encodeURIComponent(JSON.stringify({ W: 40 })))
    expect(back?.params.W).toBe(40)
    expect(back?.params.H).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx run lab:test -- url`
Expected: FAIL, `Failed to resolve import "./url"`.

- [ ] **Step 3: Write the codec**

```ts
import { type ParamKey, type Params, readParams } from '@arrowz/engine'

// … the three interfaces from the Interfaces block above …

/** A JSON value that is an object, which is all the reader can assume. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A view number the old lab may have written as a string. `undefined` means
 * the link did not name it and the page keeps its own value, which is why
 * this is not `Number(raw) || fallback`: a link naming 0 for a field where 0
 * is legal must not read as absent.
 */
function num(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

/**
 * The wire format is the deployed Deno lab's, unchanged, so links pass
 * between the two labs in both directions (Ruling 7): the knobs at the top
 * level and everything else under `__view`.
 */
export function encodeHash(input: { params: Params; view: HashView; carried: Carried }): string {
  const payload = { ...input.params, __view: { ...input.view, ...input.carried } }
  return '#' + encodeURIComponent(JSON.stringify(payload))
}

export function decodeHash(hash: string): HashPayload | null {
  const body = hash.startsWith('#') ? hash.slice(1) : hash
  if (body === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(decodeURIComponent(body))
  } catch {
    // Both throws land here: a percent-escape the decoder rejects, and text
    // that is not JSON. A truncated link is not an error to report; it is a
    // page that opens on its defaults.
    return null
  }
  const raw = isRecord(parsed) && isRecord(parsed.__view) ? parsed.__view : {}
  const height = num(raw.headHeight)
  return {
    // `parsed` and not the narrowed record: the engine's reader takes
    // `unknown` and does its own narrowing, and handing it a pre-narrowed
    // value would leave the two disagreeing about a non-object hash.
    params: readParams(parsed),
    view: {
      cell: num(raw.cell),
      stroke: num(raw.stroke),
      headWidth: num(raw.headWidth),
      // 0 was "automatic" before the height became literal, and the store's
      // own reader makes the same exception.
      headHeight: height !== undefined && height > 0 ? height : undefined,
      top: num(raw.top),
      rounded: raw.rounded !== false,
      colored: raw.colored === true,
      hilite: raw.hilite !== false,
      help: raw.help !== false,
    },
    carried: {
      ...(raw.lang === undefined ? {} : { lang: raw.lang }),
      ...(raw.tab === undefined ? {} : { tab: raw.tab }),
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm nx run lab:test -- url`
Expected: PASS, all eight cases.

- [ ] **Step 5: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src/state
git add apps/lab/src/state/url.ts apps/lab/src/state/url.fixtures.ts apps/lab/src/state/url.test.ts
git commit -m "Read and write the lab's link format, the one the Deno lab already shares"
```

---

## Task 12: The hash on the page — read once, written always, guarded twice

**Files:** Create `apps/lab/src/state/useUrlHash.ts`, `apps/lab/src/state/useUrlHash.browser.test.tsx`; modify `apps/lab/src/state/view.slice.ts`, `apps/lab/src/state/view.slice.test.ts`, `apps/lab/src/App.tsx`.

**Interfaces:**
- Produces: `export function useUrlHash(control: RunControl): void`, and `ViewState` gains `setFlag(flag: ViewFlag, on: boolean): void`, because a link states a flag's value and `toggle` can only flip one.

- [ ] **Step 1: Give the view slice a setter**

```ts
  /** Sets a flag to what it is given. `toggle` flips; a link states. */
  setFlag(flag: ViewFlag, on: boolean): void
```

```ts
    setFlag: (flag, on) => set((state) => ({ view: { ...state.view, [flag]: on } })),
```

with a case in `view.slice.test.ts` asserting that setting the same value twice leaves it set.

- [ ] **Step 2: Write the failing test**

```tsx
import { defaultParams } from '@arrowz/engine'
import { StrictMode } from 'react'
import { render } from 'vitest-browser-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunControl } from '../run/useRun'
import { useStore } from './store'
import { decodeHash, encodeHash } from './url'
import { VIEW } from './url.fixtures'
import { useUrlHash } from './useUrlHash'

function Host({ control }: { control: RunControl }) {
  useUrlHash(control)
  return null
}

function stub() {
  const calls = { start: 0 }
  const control: RunControl = { start: () => void calls.start++, abort: () => {}, hold: () => {} }
  return { control, started: () => calls.start }
}

beforeEach(() => {
  history.replaceState(null, '', location.pathname)
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
  state.ui.raiseClamped(false)
})
afterEach(() => history.replaceState(null, '', location.pathname))

describe('useUrlHash', () => {
  it('opens on the knobs the link names', async () => {
    history.replaceState(null, '', encodeHash({ params: { ...defaultParams(), W: 44, H: 88 }, view: VIEW, carried: {} }))
    await render(<Host control={stub().control} />)
    expect(useStore.getState().params.values.W).toBe(44)
    expect(useStore.getState().params.values.H).toBe(88)
  })

  it('raises the notice when the link named a value that had to move', async () => {
    history.replaceState(null, '', '#' + encodeURIComponent(JSON.stringify({ W: 999999 })))
    await render(<Host control={stub().control} />)
    expect(useStore.getState().ui.clamped).toBe(true)
  })

  // The bug revision 1 shipped: under StrictMode the read effect runs twice,
  // decodes the hash it wrote itself — already clamped — finds nothing to
  // clamp, and lowers the notice the link had raised. Invisible to every
  // other test in this file, because `render` does not use StrictMode.
  it('keeps that notice up when React mounts the effect twice', async () => {
    history.replaceState(null, '', '#' + encodeURIComponent(JSON.stringify({ W: 999999 })))
    await render(
      <StrictMode>
        <Host control={stub().control} />
      </StrictMode>,
    )
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).not.toBe(999999))
    expect(useStore.getState().ui.clamped).toBe(true)
  })

  // Ruling 6: the link follows the console, so it agrees with the command box
  // beside it whether or not a board has been carved.
  it('writes the knobs on screen, without a run', async () => {
    const g = stub()
    await render(<Host control={g.control} />)
    useStore.getState().params.set('W', 51)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).toBe(51))
    expect(g.started()).toBe(0)
  })

  // Ruling 5: three routes share this history, and a run per entry would stop
  // Back from returning to /boards.
  it('replaces the history entry rather than pushing one', async () => {
    await render(<Host control={stub().control} />)
    const before = history.length
    useStore.getState().params.set('W', 52)
    useStore.getState().params.set('W', 53)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).toBe(53))
    expect(history.length).toBe(before)
  })

  // Ruling 5's debounce: a slider drag commits about sixty times a second,
  // and both Chromium and Safari rate-limit replaceState.
  it('writes once for a burst of edits, not once per edit', async () => {
    await render(<Host control={stub().control} />)
    const spy = vi.spyOn(history, 'replaceState')
    for (let w = 60; w < 80; w++) useStore.getState().params.set('W', w)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).toBe(79))
    expect(spy.mock.calls.length).toBeLessThanOrEqual(2)
    spy.mockRestore()
  })

  it('takes a link pasted into the bar and runs it', async () => {
    const g = stub()
    await render(<Host control={g.control} />)
    const started = g.started()
    location.hash = encodeHash({ params: { ...defaultParams(), W: 61 }, view: VIEW, carried: {} }).slice(1)
    await vi.waitFor(() => expect(useStore.getState().params.values.W).toBe(61))
    expect(g.started()).toBe(started + 1)
  })

  it('does not run at itself: its own write is recognised', async () => {
    const g = stub()
    await render(<Host control={g.control} />)
    const started = g.started()
    useStore.getState().params.set('W', 54)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).toBe(54))
    expect(g.started()).toBe(started)
  })

  // The other bug revision 1 shipped. `hashchange` fires on same-document
  // traversal whenever the fragment differs, path or no path, so Back from a
  // route without a hash used to start a carve — and `useGenerator` would
  // terminate the one in flight, which spec §8 forbids.
  it('does not start a run when the user navigates back into the lab', async () => {
    const g = stub()
    await render(<Host control={g.control} />)
    useStore.getState().params.set('W', 55)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).toBe(55))
    const started = g.started()
    history.pushState({}, '', '/boards')
    history.back()
    await vi.waitFor(() => expect(location.pathname).not.toBe('/boards'))
    expect(g.started()).toBe(started)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm nx run lab:test -- useUrlHash`
Expected: FAIL, `Failed to resolve import "./useUrlHash"`.

- [ ] **Step 4: Write the hook**

```ts
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import type { RunControl } from '../run/useRun'
import { useStore } from './store'
import { type Carried, decodeHash, encodeHash, type HashPayload } from './url'
import type { ViewState } from './view.slice'

/** How long a burst of edits is allowed to run before the address bar moves. */
const WRITE_DELAY_MS = 250

/** The view as the link states it, from the slice. */
function viewFor(view: ViewState, help: boolean) {
  return {
    cell: view.cell,
    stroke: view.stroke,
    headWidth: view.headWidth,
    headHeight: view.headHeight,
    top: view.top,
    rounded: view.rounded,
    colored: view.colored,
    hilite: view.hilite,
    help,
  }
}

/** Writes a decoded link into the store. The caller decides whether to run. */
function applyPayload(payload: HashPayload): void {
  const { params, view, ui } = useStore.getState()
  // One `setMany` for every knob the link named: one recompute, one render,
  // and the machine path, so `auto` does not schedule a second run behind the
  // immediate one this trigger owns (Ruling 3).
  ui.raiseClamped(params.setMany(payload.params))
  // A number the link did not name keeps the page's own value; `setNumber` is
  // the tolerant reader, handed the value as text exactly as a field would.
  if (payload.view.cell !== undefined) view.setNumber('cell', String(payload.view.cell))
  if (payload.view.stroke !== undefined) view.setNumber('stroke', String(payload.view.stroke))
  if (payload.view.headWidth !== undefined) view.setNumber('headWidth', String(payload.view.headWidth))
  if (payload.view.headHeight !== undefined) view.setNumber('headHeight', String(payload.view.headHeight))
  if (payload.view.top !== undefined) view.setNumber('top', String(payload.view.top))
  view.setFlag('rounded', payload.view.rounded)
  view.setFlag('colored', payload.view.colored)
  view.setFlag('hilite', payload.view.hilite)
  ui.setHelp(payload.view.help)
}

/**
 * The URL hash, in both directions. Mounted once, in `App`.
 *
 * Three properties, each of which cost a review to find:
 *
 * 1. **The link is read exactly once**, guarded by a ref rather than by an
 *    empty dependency list. StrictMode re-runs mount effects, and a second
 *    read decodes the hash this hook has just written — already clamped — so
 *    `setMany` finds nothing to move and lowers the notice the link raised.
 * 2. **The write is debounced.** `KnobSlider` commits on the range input's
 *    `onChange`, about sixty times a second during a drag; Chromium drops
 *    `replaceState` past roughly two hundred calls in ten seconds and Safari
 *    throws past a hundred in thirty, from inside a zustand `set`.
 * 3. **The listener knows this hook's own writes.** `hashchange` fires on
 *    same-document traversal whenever the fragment differs, whatever the
 *    path, so `replaceState` is not the guard revision 1 thought it was: Back
 *    into the lab would start a carve and terminate the one in flight.
 *
 * The subscription is in an effect and not a selector in render (Ruling 11),
 * for the same reason `useAutoRun`'s is.
 */
export function useUrlHash(control: RunControl): void {
  const carried = useRef<Carried>({})
  const readDone = useRef(false)
  const written = useRef<string | null>(null)
  const { pathname } = useLocation()

  useEffect(() => {
    if (readDone.current) return
    readDone.current = true
    const payload = decodeHash(location.hash)
    if (payload === null) return
    carried.current = payload.carried
    applyPayload(payload)
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const flush = () => {
      if (!readDone.current) return
      const { params, view, ui } = useStore.getState()
      const next = encodeHash({ params: params.values, view: viewFor(view, ui.help), carried: carried.current })
      if (next === location.hash) return
      written.current = next
      history.replaceState(null, '', next)
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(flush, WRITE_DELAY_MS)
    }
    // The hash is written on every route, not only on the lab's: `TabRow`
    // navigates to bare paths, so writing only on `/` would empty the address
    // bar on the way to Boards and leave it empty on the way back. Writing
    // everywhere also means Back between routes finds the same fragment on
    // both entries, and fires no `hashchange` at all.
    flush()
    const unsubscribe = useStore.subscribe(schedule)
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [pathname])

  useEffect(() => {
    const onChange = () => {
      if (location.hash === written.current) return
      const payload = decodeHash(location.hash)
      if (payload === null) return
      carried.current = payload.carried
      applyPayload(payload)
      control.start()
    }
    globalThis.addEventListener('hashchange', onChange)
    return () => globalThis.removeEventListener('hashchange', onChange)
  }, [control])
}
```

- [ ] **Step 5: Mount it**

In `App.tsx`'s `Shell`, after `useAutoRun(control)`: `useUrlHash(control)`.

- [ ] **Step 6: Run the whole lab suite**

Run: `pnpm nx run lab:test`
Expected: PASS. Browser test files are isolated in Vitest 5, so the hash written here does not reach another file; within this file the `beforeEach`/`afterEach` pair is what keeps one case's link out of the next case's mount.

- [ ] **Step 7: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src
git commit -m "Put the settings in the address bar, and take a pasted link as a run"
```

---

## Task 13: The board on load, and the four assertions it costs

**Files:** Modify `apps/lab/src/App.tsx`, `apps/lab/src/routes/LabRoute.browser.test.tsx`.

- [ ] **Step 1: Add the load run**

In `Shell`, after the hash hook so a link has already been applied. The ref guard is the same one Task 12 needed and for the same reason: StrictMode runs the effect twice, and `useGenerator.start` kills the first worker to make room for the second.

```tsx
  useUrlHash(control)
  const loaded = useRef(false)
  // Spec §2.2's last row: the lab opens on a board. The hash hook's read
  // effect is declared above this one and effects run in declaration order,
  // so this uses the link's knobs rather than the defaults. PR 4 puts
  // `applySimple()` in front of it for the simple view, which is the only
  // part of that row still missing.
  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    control.start()
  }, [control])
```

- [ ] **Step 2: Run the suite and watch it go red in one file**

Run: `pnpm nx run lab:test -- LabRoute`
Expected: FAIL in exactly four places. `AppRoutes.browser.test.tsx` renders `<AppRoutes />` inside a `MemoryRouter` and never mounts the shell, so it is untouched — revision 1 claimed otherwise.

- [ ] **Step 3: Fix the four, at the assertion and never by disabling the run**

1. **`:42`** — `toHaveTextContent('Press "Generate".')` right after `mountApp()`. The page no longer has that state on load. Replace it with the §2.2 page-load row proven in the real shell, which is a stronger assertion than the one it replaces:

```tsx
    const screen = await mountApp()
    // §2.2's last row: the lab opens on a board without being asked.
    await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
    await expect.element(screen.getByRole('status'), { timeout: 5_000 }).toMatchTextContent(/^Board closed 100%\./)

    await screen.getByRole('button', { name: 'Generate' }).click()
```

2. **`:182` and `:190`** — `posts()` counts 1 and 2. Do **not** raise them to 2 and 3: the load run's POST is asynchronous and can land inside or outside the spy's window, which is the race the comment at `:266-271` already fights. Instead let the load run finish and save *before* the spy is installed:

```tsx
    const screen = await render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    // The page carves on load now; wait for that run's own save to land
    // before counting, so the numbers below are this test's presses alone.
    await expect.poll(() => useStore.getState().run.saved !== null, { timeout: 30_000 }).toBe(true)
    const fetchSpy = vi.spyOn(window, 'fetch')
```

with the `vi.spyOn(window, 'fetch')` moved out of the top of the test and the `finally { fetchSpy.mockRestore() }` adjusted to match. The two counts stay 1 and 2.

3. **`:272`** — `expect(posts).toHaveLength(1)` in *the saved board carries the view on screen*. Same move: the spy is installed at `:249`, before `mountApp()`. Mount, wait for the load run's save, then install the spy, then set the view and press Generate.

4. **`mountApp` at `:16-17`** resets the run and the params. It now also has to reset what this PR added, or a case that turned `auto` on leaks it into the next: add `state.ui.setAuto(false)`, `state.ui.setHelp(true)`, `state.ui.raiseClamped(false)` and `history.replaceState(null, '', location.pathname)` to the same helper.

- [ ] **Step 4: Watch for the slow-not-red failures**

Six call sites click Generate (`:44`, `:102`, `:172`, `:227`, `:240`, `:264`). `locator.click()` waits for actionability, so while the load run is in flight the button is disabled and the click stalls rather than failing. Any case whose time jumps by roughly the length of a 25×50 carve is telling you it is now waiting on the load run; give it the same `expect.poll` on `run.phase` that fix 1 uses, rather than raising its timeout.

- [ ] **Step 5: Run both gates**

```bash
cd /Users/tomek/dev/arrowz
pnpm nx run-many -t verify
deno task verify
```

Both green. `deno task verify` covers the old lab, which this PR does not touch; if it fails, the cause is `packages/engine/lab-i18n.ts` — the five new keys must be in both language tables or `lab-i18n.test.ts` fails on the key sets.

- [ ] **Step 6: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src
git commit -m "Open the lab on a board, and pay for it in the four assertions that assumed an idle page"
```

The commit body lists the four changed assertions and why each moved, so a reviewer sees that a count went up for one reason rather than that a test was relaxed.

---

## Task 14: The trigger table as a test, the spec amendment, and the pull request

**Files:** Create `apps/lab/src/run/triggers.browser.test.tsx`; modify `docs/superpowers/specs/2026-09-13-lab-react-app-design.md`.

- [ ] **Step 1: Write the trigger table**

One case per row of spec §2.2 that this PR owns. Each asserts the two things the table states — when the run starts, and whether the knobs were rewritten first. The second half matters because three triggers rewrite them, and a run using the old values would draw a board nobody asked for.

The recorder wraps `start` so it snapshots the knobs at the call:

```tsx
function recorder() {
  const seen: Params[] = []
  const control: RunControl = {
    start: () => void seen.push({ ...useStore.getState().params.values }),
    abort: () => {},
    hold: () => {},
  }
  return { control, seen }
}
```

| Case | Trigger | Asserts |
|---|---|---|
| 1 | a knob edit with `auto` on | `seen` empty at 349 ms, one entry at 350 ms; the entry carries the edited value |
| 2 | a knob edit with `auto` off | `seen` empty after three times the delay |
| 3 | a preset | one entry, synchronously; its `W`/`H` are the preset's and `view.cell` is `exportCell(W, H)` |
| 4 | Generate | one entry; every knob equal to what it was before the click |
| 5 | New seed | one entry; its `seed` differs from before the click |
| 6 | Defaults | one entry; it equals `defaultParams()` |
| 7 | an external `hashchange` | one entry; its `W` is the link's |
| 8 | page load | mounting `<App />` puts `run.params` non-null without a click |

Cases 1 and 2 follow Task 8's recipe exactly: `renderHook`, fake timers installed after the render and without `shouldAdvanceTime`, every store write inside `await act(...)`, `await vi.advanceTimersByTimeAsync(...)`, and plain `expect` rather than `expect.element`. Case 8 polls `run.params !== null` rather than reading `run.phase === 'running'` straight after `render`, which is a race against a 25×50 carve.

Write the import list from the cases actually present — `noUnusedLocals` and ESLint's `no-unused-vars` both fail the gate on a spare import, and revision 1's list named five symbols no case used and omitted three that were needed.

The comment at the head of the file states which rows are missing and why: the three simple-view rows and the `applySimple()` half of page load are PR 4's, and PR 4 will also falsify case 4's "rewrites nothing" in simple view with randomising on (`randomOnGenerate`, `lab-page.ts:914`), case 5's for the same reason, and case 6's, where Defaults resets the recipe while keeping `random`.

- [ ] **Step 2: Run it**

Run: `pnpm nx run lab:test -- triggers`
Expected: PASS — every trigger is in place by now, so this file is a statement rather than a discovery. If case 1 fails, the cause is a missing `act` around a store write, not the hook.

- [ ] **Step 3: Amend the spec (Ruling 14)**

In §10's row 4, add the `f` hotkey and the solo view to PR 4's contents. They are stage chrome rather than a trigger, §5.1 places them in `BoardFrame.tsx`, and §10 currently restores them in prose while assigning them to no row — a gap four reviewers found and no PR owns. One line, in the table, so the next planner does not have to.

- [ ] **Step 4: Commit and open the pull request**

```bash
cd /Users/tomek/dev/arrowz
git add apps/lab/src docs/superpowers/specs
git commit -m "State the trigger table as a test, and give the solo view a PR"
git push -u origin lab/run-triggers
gh pr create --base lab/parameter-console --title "The generator lab as a React application: what starts a run" --body-file -
```

The body states, in this order:

- What the PR adds and which spec row it closes (§10 row 3, second half), and that parity with today's lab is still PR 5.
- The fourteen rulings, one line each.
- **The four parity deltas a reviewer must judge rather than skim**: the hash mirrors the console instead of the last run (Ruling 6); `replaceState` instead of a pushed entry, which drops Back-as-undo in favour of PR 7's filmstrip (Ruling 5); `help` hides descriptions from the eye and keeps them for a screen reader, where the old lab hid them from both (Ruling 9); and choosing a preset resets the seed, so two presets cannot be compared on one (Ruling 10).
- The four assertions Task 13 changed and why the load run made each move.
- What is deliberately **not** here: the simple view, the language switch, the report and the SVG export (PR 4, which also now owns the `f` hotkey and the solo view); the library (PR 5); the docs route (PR 6); the filmstrip, the diff strip and ⌘K (PR 7).
- Three hand-offs PR 4 will want: §2.2's page-load row needs "unless the hash carried knobs", and `useUrlHash` currently exposes nothing a caller can read for that; §5.2 hides `auto` and `help` in simple mode, and both switches live in the shared `RunColumn`; and spec §8 asks for the trigger table as node unit tests, while Task 14 writes browser tests, because six of the eight triggers are buttons.

---

## Self-Review

**Spec coverage of §10 row 3, second half.** The lifted run column — Tasks 4, 6, 7, 8. `auto` — Task 8. `help` — Tasks 8 and 9. Abort — Task 4. The live command — Task 6. Presets — Task 10. The clamp notice — Tasks 1 and 10. The hash codec with `hashchange` → run — Tasks 11, 12, 14. The violations panel was PR 3a's and stands. Not covered, deliberately: SVG export (Ruling 1).

**§2.2's ten rows.** Seven are this PR's and are asserted in Task 14 (rows 1, 2, 6, 7, 8, 9, 10), plus the `auto`-off half of row 1. Three are PR 4's: the simple size field, the simple slider and the simple segmented button. Three rows have a simple-view half that PR 4 adds and Task 14's comment names in advance: Generate, New seed and Defaults with randomising on, and the `applySimple()` half of page load.

**Features spec §10 says the port must restore.** `auto` (Task 8), `help` (Tasks 8–9), the clamp notice (Tasks 1, 10), the `generatingBig` warning (Task 5), the store-save outcome (already on main). `libLoad`, `libRefresh`, `libCopy` and the size chips are PR 5's; the report's `keepPrev` baseline is PR 4's; the `f` hotkey and the solo view are assigned to PR 4 in writing by Task 14.

**§5.3's slice table.** `params` and `view` persisted to the hash — Task 12. `ui` gains `auto`, `help`, `clamped` — Task 1. `ui`'s `labView` persistence, `lang` and `recipe` are PR 4's; `library` is PR 5's; the `run` slice's history is PR 7's.

**Type consistency.** `RunControl` is created in Task 3 and consumed by Tasks 4, 7, 8, 10, 12, 13, 14 under that name. `AUTO_DELAY_MS` is exported in Task 8 and read in Task 14. `HashView`, `Carried` and `HashPayload` are defined in Task 11 and consumed in Task 12; `VIEW` lives in `url.fixtures.ts` from Task 11 and is imported by both test files. `params.edits` is added in Task 2, read in Task 8, asserted in Tasks 7, 10 and 14. `ui.raiseClamped` is added in Task 1 and called in Tasks 10 and 12. `view.setFlag` is added in Task 12, the only place it is needed. `goRef` is introduced in Task 10 and threaded `LabRoute` → `RunColumn` → the Generate button.

**Coverage the reviews asked for and this revision adds.** The refusal reaching the status line (Task 5). Defaults usable while blocked (Task 7). `ClampNotice`'s dismiss, focus return and re-lowering (Task 10). The debounce's write count (Task 12). Back-into-the-lab not starting a run (Task 12). StrictMode not lowering the notice (Task 12).

**Coverage still missing, named rather than hidden.** No test drives a real `useGenerator` while a preset or a link starts a second run, so "a new run terminates the one in flight" — Ruling 3's whole justification — is asserted only against a stub. It belongs with the filmstrip in PR 7, where a run's history is what makes the assertion readable; until then `useGenerator.browser.test.tsx` covers replace-by-terminate for the button alone. `OptionSwitch`'s wiring inside `RunColumn` is exercised only through `ui.setHelp` in Task 9, not by clicking the switch; Task 8's Step 5 should add one click-through case if the executor has the budget.

**Known risks, recorded rather than solved.**

1. **Fake timers in browser mode.** Tasks 8 and 14 install them after `renderHook`, without `shouldAdvanceTime`, and use only plain `expect`. `expect.element` polls and would hang against a frozen clock; that is the one combination this plan forbids outright.
2. **The load run raises the suite's worker count** by twelve — eleven `<App />` mounts plus the StrictMode double-invoke. At 25×50 that is milliseconds each, and CI already runs browser files serially under SwiftShader. The visible symptom of getting it wrong is a slow test, not a red one (Task 13 Step 4).
3. **The top bar now subscribes to the whole `values` object** so it can show the preset. `findPreset` over 26 options per render is cheap, but the bar is in the drag path; Task 10 Step 9 measures it in the browser rather than assuming.
4. **`.fw-k .why:not(:has(> :not(.fw-vh)))`** is the one selector in this plan whose support and behaviour are asserted rather than measured. Task 9 Step 9 measures it, with the explicit-class fallback named.
