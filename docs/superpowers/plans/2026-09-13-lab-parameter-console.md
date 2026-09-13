# The lab's parameter console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `apps/lab` the console the old lab's advanced view has — twenty-eight knobs in six groups, the preview fields beside them, every violation and every inactive reason on screen — so a board can be configured in the React lab and Generate refuses exactly what the engine would refuse.

**Architecture:** Three new store slices (`params`, `view`, `ui`) carry what the old lab kept in the DOM. `params.slice` owns the twenty-eight knobs, runs `clampParam` on commit and recomputes two per-key indexes — violations and inactive reasons — once per change, so each knob component subscribes to its own entry and a slider drag redraws one knob rather than the grid. The console itself is the mock's two-track layout: a 168px group rail with per-group violation counts, and a panel that shows one group at a time (or the preview fields, which the mock calls the *element* section). The run column, presets, the live command, `auto` and the URL hash are **not** in this PR; they are the second half of spec §10 row 3 and get their own plan.

**Tech Stack:** React 19, zustand 5, Vite 8, Vitest 5 (node + chromium browser mode), `@arrowz/engine` (`PARAM_SPEC`, `clampParam`, `validateParams`, `straightFloor`, `wordFor`, `START`, `startChoiceOf`, `VIEW_RANGE`, `viewNumberOf`), `@arrowz/board-element` (`boardViewOf`).

**Spec:** `docs/superpowers/specs/2026-09-13-lab-react-app-design.md` — §2.2 (what starts a run), §2.3 (what will not port line by line), §5.1 (component tree), §5.2 (reconciling the mock), §5.3 (state slices), §5.4 (range ceiling vs rule floor), §5.5 (draft and commit), §7 (visual layer), §8 (testing), §10 row 3 (first half).

**Previous plan:** `docs/superpowers/plans/2026-09-13-lab-app-skeleton.md` (PR 2). This branch stacks on `lab/app-skeleton`.

## Global Constraints

- **Everything written to a file is English** — code, comments, tests, docs, branch name, commit messages. Only this conversation is Polish.
- **No `any`, no non-null assertions.** ESLint enforces both in `apps/lab`; `deno lint` does not read `apps/`.
- **Both gates must pass:** `deno task verify` in the repository root and `pnpm nx run-many -t verify`.
- **Never import the engine's `.ts` sources from `apps/`.** `apps/lab` consumes `@arrowz/engine` through `dist/`, which is why every `project.json` target has `dependsOn: ["^build"]`.
- **The mock is not in this repository.** It lives in the Claude Design project *Arrowz workshop* (`7fc443c6-aaf3-4d37-a380-9812f10110b6`), files `Arrowz Workshop v2.dc.html` and `fronthub-workshop-v2.css`. Every CSS rule and every piece of markup this plan quotes was read from there; nothing can be diffed against it later, so the quoted rules are the source of truth from here on.
- **English is the source language in code** (`PARAM_SPEC`, `EN.ui`), Polish is the translation (`PL`). A new UI string goes into both tables in `packages/engine/lab-i18n.ts`, and `lab-i18n.test.ts` checks that the key sets match.
- **No attribution lines in commit messages.**
- Commit after every task. Task boundaries are the review boundaries.

Five facts about this harness, each of which broke an earlier draft of this plan:

- **`render` from `vitest-browser-react` is async.** Every browser test writes
  `const screen = await render(<X />)`. `apps/lab/src/routes/LabRoute.browser.test.tsx`
  has an `async function mountApp()` helper returning `render(<App />)`, so its
  call sites are `await mountApp()` too.
- **`toHaveTextContent` is exact equality**; the substring/regex matcher is
  `toMatchTextContent(/…/)` (`LabRoute.browser.test.tsx:46`). Passing a `RegExp`
  to `toHaveTextContent` does not even type-check.
- **`apps/lab` resolves `@arrowz/engine` to `packages/engine/dist/`.** After any
  edit under `packages/engine`, run `pnpm nx build engine` before running
  `apps/lab` tests by hand; otherwise a new dictionary key is missing from both
  the typings and the runtime. The Nx gate is unaffected (`dependsOn: ["^build"]`).
- **`exactOptionalPropertyTypes` is on.** A prop that receives `T | undefined`
  must be declared `prop?: T | undefined`, not `prop?: T`.
- **Prettier is a gate.** Run `pnpm exec prettier --write .` in `apps/lab`
  before each commit; nested ternaries and long JSX lines are reflowed.

---

## Rulings I made

Decisions this plan takes that the spec left open, or takes differently. An executor must not relitigate them; a reviewer should attack them.

**Ruling 1 — This PR is the first half of spec §10 row 3.** Row 3 names nine subsystems. This plan implements the console: the three slices, the group rail, the five knob components, the preview panel, the violations list and the Generate block. The second plan implements what starts a run: the lifted `RunColumn` (live command, New seed, Defaults, `auto` with its 350 ms debounce, `help`, abort, exports), the presets, the clamp notice and the hash codec. The split is along the §2.2 table: everything in that table is a *trigger*, and this PR adds no new trigger — Generate, already on screen since PR 2, stays the only one. Parity with today's lab is unchanged by the split; it still arrives at PR 5, as §10 says.

**Ruling 2 — The clamp notice moves to the second plan, not because it is cosmetic but because this PR gives it nothing to announce.** §5.3 says a hash link or a preset raises it. Both are in the second plan. A knob typed out of range is the other case, and there the field shows the clamped value in the same frame, which §5.4 explicitly calls fine. `set` and `setMany` still return whether they clamped (a `boolean`), so the second plan wires a notice to a signal that already exists rather than changing the slice.

**Ruling 3 — `KnobSlider` is a styled native `<input type="range">`, not a `div` with `role="slider"`.** §5.1 asks for `role="slider"` and keyboard; a native range input *is* `role="slider"`, and brings arrow keys, Home/End, PageUp/PageDown, touch, pointer capture and the platform's own value announcement with it. The mock's bar is a `div` with `onPointerDown` and no keyboard at all — one of the thirteen accessibility gaps §7.2 says the port must fix, and rebuilding the interaction by hand is how a fourteenth gets made. The mock's look survives: `appearance: none`, a 2px track, a 2×12px thumb, and the rule marker as an absolutely positioned sibling, exactly as `.fw-k .bar u` draws it.

**Ruling 4 — The mock's pointer scrub on the number is dropped.** `.fw-k .num { cursor: ew-resize }` with `onPointerDown="{{ k.scrub }}"` is a mouse-only gesture with no keyboard equivalent and no affordance a screen reader can reach. Its two jobs — fine adjustment and direct entry — are covered by the slider (arrow keys, and the step comes from `PARAM_SPEC`) and by the inline entry, opened from the number. The number keeps `.num` and its colour; it loses `cursor: ew-resize` and gains a button role.

Two costs come with it, and the plan pays one and records the other. Task 7 pays the first explicitly: swapping a button for an input and back moves focus twice. The old lab's knob was a permanent `<input type="number">` that never lost focus, so a port that leaves focus on `<body>` after every commit is worse for a keyboard user than the thing it replaces. Task 7 therefore restores focus to the number on commit, and tests it.

The second is recorded, not paid: on macOS, Safari and Firefox leave `<button>` out of the Tab order at default settings, while an `<input>` is always in it. In those two browsers the entry becomes Option+Tab-only. The lab is a Chrome tool and the slider — a real `<input>` — reaches every knob's value in every browser, so this is a known narrowing rather than a regression to fix here.

**Ruling 5 — The rail has seven entries: six generator groups and one preview entry.** This is the mock's own structure (`.fw-rail` has a `generator` section and an `element` section) reconciled with §5.2: the element section *is* the nine preview fields. Violation counts appear only on the six generator entries — no preview field can violate an engine rule, because `viewNumberOf` clamps and the engine never sees them.

**Ruling 6 — One group at a time, `board` selected first.** §5.2 settles the "one at a time" half (the mock's model wins over today's six `<details>`, two of which — `board` and `skeleton` — start open, `lab-page.ts:136`). `board` is first because it is first in `PARAM_SPEC`, not because the old lab ranks it. The group rail's count is what keeps a violation from hiding behind a group nobody opened.

**Ruling 7 — The violations list lives under the console, not inside the knob panel.** Not for the reason an earlier draft gave: no rule in `RULES` reaches two groups. `straightFloor` names `pStraight`, `warns` and `anticoil` (`engine.ts:2823-2828`), all in `shape`; `sharesSum` and `lmaxHole` are `lengths`; `startPair` is `difficulty`. The real reason is the console's own shape (Ruling 6): **one group is on screen at a time**, so a violation in `lengths` must stay readable while `shape` is open. The rail's count says *where*, the list says *what*, and a list inside the panel would say nothing at all about the group you are not looking at. It sits below `.fw-console` as a `.fw-note`, the mock's own bordered block.

The Generate button keeps the old lab's plain `disabled` (`lab-page.ts:393-398`) and its `title`. It does **not** get `aria-describedby`: a disabled button is not focusable, so the description is reachable only in a screen reader's browse mode, and claiming it as "the reason is reachable" would be ceremony. The pattern that would make it reachable — `aria-disabled="true"` on a focusable button with a no-op click — is a behaviour change the old lab does not have, and it belongs with the run column in the next PR, where this button moves anyway.

**Ruling 8 — The rule floor is published per key, from the slice.** `straightFloor(params)` depends on `W`, `H`, `warns` and `anticoil`; a per-knob selector cannot compute it (§5.4). `params.slice` recomputes a `floor: Partial<Record<ParamKey, number>>` index on every change, and `KnobSlider` reads only its own entry. A **number**, not `{ floor: number }`: an object is a fresh identity per recompute, and a selector comparing identities would rerender every knob on every drag. Today only `pStraight` has a floor; the index is a map so the second one costs nothing.

**Ruling 9 — `Stage` selects the whole view slice and memoises the element's view on its identity.** PR 2 hoisted `VIEW` to a module constant precisely because a new object identity per render reassigns the element's `view` property on every progress message. The slice itself is the right cache key: `run.progressed()` rebuilds `state.run` and leaves `state.view` untouched, so `useStore((s) => s.view)` returns the same object through a whole run, and `useMemo(() => boardViewOf(viewOf(view), view.voids), [view])` recomputes only when a preview field is actually edited. That is also what makes §2.2's last line true — editing a preview field redraws without generating.

**Ruling 10 — `Shell`'s `params` prop goes away, and the browser tests set the knobs through the store.** `LabRoute.browser.test.tsx` uses the prop to start a board big enough to observe in flight. After this PR the parameters come from the slice, so the tests call `useStore.getState().params.setMany({ … })` before pressing Generate.

**Keep the sizes that file already measured.** Its in-flight test uses 600×600 and says why (`LabRoute.browser.test.tsx:82-86`): PR 2 measured 200×200 at 228 ms in Chromium, and the engine emits no progress sooner than 250 ms, so a 200×200 board would win a race while proving nothing. Migrating that test to the slice must not change its numbers — `setMany({ W: 600, H: 600, seed: 9 })`.

The prop is deleted rather than kept as an override, because two sources for one value is a bug waiting to happen. Note what this does *not* fix: the old lab's `document.activeElement` guard (`lab-page.ts:679-681`) protects the **simple view's** second seed field, not the knob row. PR 4 re-creates that surface and will need its own draft; nothing else records that.

**Ruling 11 — The preview fields keep the old lab's narrower bounds, and a test pins them inside `VIEW_RANGE`.** `lab.html` bounds `cell` to 1..40 while `VIEW_RANGE.cell` allows 1..200. Porting the narrow bounds keeps the two surfaces identical, and a unit test asserting `field.min >= VIEW_RANGE[f].min && field.max <= VIEW_RANGE[f].max` carries the check into `apps/lab`, where the fields now live.

Two things this is **not**: it is not the successor to `lab-bundle.test.ts`'s fingerprint gate (that is §8's demand, answered in PR 2 by `worker/parity.browser.test.ts`), and it does not plug a hole — `carve.test.ts:477` asserts the field *exists* (`assert(f, 'lab.html has no number field …')`), so nothing slips through today. It is a prerequisite for §10 row 8, which deletes `lab.html` out from under that test.

**Ruling 12 — `ui.slice` holds only `selectedGroup` in this PR.** §5.3 lists tab, palette, simple/advanced, solo, `auto`, `help`, clamp notice and flash as well. Every one of them belongs to a later PR, and a slice full of fields nothing reads is a slice nobody can review.


**Ruling 13 — The group rail is a vertical `role="tablist"`, not the mock's `<nav>` of buttons with `aria-current`.** Picking an entry replaces the panel beside it and leaves exactly one visible: that is the tab pattern, and the mock's markup describes a set of links to places instead. `TabRow.tsx` already implements the roving tabindex and the arrow keys this needs, so the cost is small and the alternative — a button with `aria-current="true"` and a `div` of knobs with no announced relationship to it — leaves a keyboard user to guess where the content went. Two tablists on one page (horizontal for routes, vertical for groups) is what `aria-orientation` exists for.

**Copy the whole pattern, not half of it.** `TabRow.tsx:65-69` moves focus to the newly selected tab through a `ref` callback, guarded by `node.parentElement?.contains(document.activeElement)` so that clicking a tab does not steal focus back from a panel. Without that line the arrow keys change `aria-selected` and `tabIndex` while focus stays on a button that is now `tabIndex={-1}`: the panel changes, a screen reader announces nothing, and the next Tab leaves from the wrong place. A test that only reads the store cannot see this, so Task 5's test reads `document.activeElement`.
---

## File structure after this PR

```
apps/lab/src/
  state/
    store.ts               + params, view, ui               (modified)
    params.slice.ts        28 knobs, clamping, violation/inactive/bounds indexes   (new)
    view.slice.ts          the nine preview fields as typed values                 (new)
    ui.slice.ts            the selected rail entry                                 (new)
    run.slice.ts           unchanged
  console/
    Console.tsx            the mock's two-track grid: rail + panel                 (new)
    GroupRail.tsx          seven entries, violation counts, roving tabindex        (new)
    KnobPanel.tsx          group header + `.fw-grid`, builds the start control once (new)
    Knob.tsx               dispatch by spec: value | choice                        (new)
    ValueKnob.tsx          label, word, number, inline entry, local draft          (new)
    KnobSlider.tsx         styled native range + rule marker                       (new)
    ChoiceKnob.tsx         trapBias, giantSpacing                                  (new)
    StartKnob.tsx          the composite --start control and the mix row           (new)
    ViewPanel.tsx          the nine preview fields                                 (new)
    Violations.tsx         the list under the console                              (new)
  design/
    console.css            the mock's console rules, ported                        (new)
  routes/LabRoute.tsx      mounts Console and Violations, Generate reads the slice (modified)
  App.tsx                  no `params` prop; the store request carries the view    (modified)
  stage/Stage.tsx          the element's view comes from the view slice            (modified)
packages/engine/lab-i18n.ts   five new UI keys in both languages                   (modified)
```

`console.css` is a second stylesheet rather than more lines in `shell.css` for the reason PR 2's whole-branch review found the hard way: `.fw button { color: inherit }` in one file quietly outranked `.fw-go` in another. One file per surface keeps a specificity collision inside the surface that caused it.

---

### Task 1: The dictionary learns the rail and the rule marker

**Files:**
- Modify: `packages/engine/lab-i18n.ts` (`EN.ui` around `:188`, `PL.ui` around `:538`)
- Test: `packages/engine/lab-i18n.test.ts`

**Interfaces:**
- Produces: five UI keys — `railLabel`, `railGenerator`, `railElement`, `ruleBound(need: number)`, `violationsInGroup(group: string, count: number)` — reachable as `dict.t('railLabel')` and `dict.t('ruleBound', 0.75)`.

The console needs five strings the old lab never had: an accessible name for the rail (the mock's `<nav>` has none), the two caps section headings inside it, the marker's own label (a mark on a track that only sighted users can see is the fourteenth accessibility gap), and a name for a rail entry carrying a count — "lengths 1" announces a digit, not a meaning. Everything else the console says already exists: `violationsTitle`, `generateBlocked`, `inactivePrefix`, the three violation formatters, `preview`, and every knob's label and help through `dict.paramText(spec)`.

- [ ] **Step 1: Write the failing test**

Append to `packages/engine/lab-i18n.test.ts`:

```ts
Deno.test('the console rail names itself and its two sections in both languages', () => {
  for (const lang of ['en', 'pl'] as const) {
    const dict = dictionary(lang)
    const label = dict.t('railLabel')
    assertNotEquals(label, '')
    // The rail's name must not collide with the tab strip's: a screen reader
    // lists both landmarks, and two navigations called the same thing are
    // indistinguishable.
    assertNotEquals(label, dict.t('tabsLabel'))
    assertNotEquals(dict.t('railGenerator'), dict.t('railElement'))
    // A count in a tab's name has to say what it counts.
    const named = dict.t('violationsInGroup', 'shape', 2)
    assertStringIncludes(named, 'shape')
    assertStringIncludes(named, '2')
    assertNotEquals(named, 'shape 2')
  }
})

Deno.test('the rule marker states the bound it marks', () => {
  assertEquals(dictionary('en').t('ruleBound', 0.75), 'Rule bound: 0.75')
  assertEquals(dictionary('pl').t('ruleBound', 0.75), 'Granica reguły: 0,75')
})
```

Note the Polish decimal comma. A `ui` entry is a plain function with no access to the dictionary's `fmt`, so `PL.ui.ruleBound` calls `toLocaleString('pl')` itself. A test asserting `0.75` in Polish would be asserting that the lab prints numbers the Polish reader does not write. Import `assertStringIncludes` alongside the assertions the file already uses.

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd packages/engine && deno test --allow-read lab-i18n.test.ts
```

Expected: FAIL — a type error on `t('railLabel')`, because `UiKey` has no such member yet. That is the failure; `deno test` type-checks before it runs.

- [ ] **Step 3: Add the keys**

In `packages/engine/lab-i18n.ts`, inside `EN.ui`, next to `violationsTitle` (the console block):

```ts
    // The parameter console (apps/lab). The rail is a landmark of its own, so
    // it needs a name the tab strip does not already use.
    railLabel: 'Parameter groups',
    railGenerator: 'generator',
    railElement: 'element',
    // The floor a cross-knob rule puts on a knob: drawn on the slider's track,
    // and named here because a mark is not a message.
    ruleBound: (need: number) => `Rule bound: ${need}`,
    // A rail entry that carries a count names what the count is.
    violationsInGroup: (group: string, count: number) =>
      `${group}, ${count} setting${count === 1 ? '' : 's'} outside the safe range`,
```

and in `PL.ui`, in the same place:

```ts
    railLabel: 'Grupy parametrów',
    railGenerator: 'generator',
    railElement: 'element',
    ruleBound: (need: number) => `Granica reguły: ${need.toLocaleString('pl')}`,
    violationsInGroup: (group: string, count: number) => `${group}, ustawienia poza zakresem: ${count}`,
```

Keep that last one on **one line**. `deno fmt --check` reflows it, and `deno task verify` runs `fmt` before the tests, so a two-line arrow here fails the gate several tasks later with a message about a file nobody is editing any more.

`EN` keeps the plain interpolation: English is the source language and `toLocaleString('en')` of `0.75` is `0.75`.

- [ ] **Step 4: Run the tests**

```bash
cd packages/engine && deno test --allow-read lab-i18n.test.ts
```

Expected: PASS, including the existing test that the two key sets match.

- [ ] **Step 5: Falsify the tests**

Temporarily change `PL.ui.railLabel` to `'Parameter groups'` (the English string) and re-run. The suite must stay green — the test does not check translation, only distinctness — then change `PL.ui.ruleBound` to return `` `Rule bound: ${need}` `` and re-run: the `ruleBound` test must go red. Restore both. A test that cannot go red is not a gate, and PR 2 shipped five of them before this step became routine.

- [ ] **Step 6: Rebuild the engine's `dist/`, or every later task fails on a missing key**

```bash
cd /Users/tomek/dev/arrowz && pnpm nx build engine
```

`apps/lab` resolves `@arrowz/engine/i18n` to `packages/engine/dist/`, not to the source. Skip this and Task 5's rail renders `undefined` as its accessible name while `tsc` reports that `'railLabel'` is not assignable to `UiKey`.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/lab-i18n.ts packages/engine/lab-i18n.test.ts
git commit -m "Name the console rail and the rule marker in both languages"
```

---

### Task 2: The params slice

**Files:**
- Create: `apps/lab/src/state/params.slice.ts`
- Create: `apps/lab/src/state/params.slice.test.ts`
- Modify: `apps/lab/src/state/store.ts`

**Interfaces:**
- Consumes: `PARAM_SPEC`, `defaultParams`, `clampParam`, `validateParams`, `straightFloor`, `type Params`, `type ParamKey`, `type Violation`, `type InactiveKey` from `@arrowz/engine`; `START`, `START_CHOICES`, `MIX_START`, `startChoiceOf`, `type StartChoice` from `@arrowz/engine/command`.
- Produces:

```ts
export interface ParamsState {
  values: Params
  /** Every violation, in the engine's order — the list under the console. */
  violations: readonly Violation[]
  /** The violations naming a knob; `undefined` for a knob none names. */
  broken: Readonly<Partial<Record<ParamKey, readonly Violation[]>>>
  /** Why a knob has no effect at these settings; `undefined` while it has one. */
  inactive: Readonly<Partial<Record<ParamKey, InactiveKey>>>
  /** The floor a cross-knob rule puts on a knob. A number, so a selector can compare it. */
  floor: Readonly<Partial<Record<ParamKey, number>>>
  /** Commits one knob. Returns whether the value had to be clamped. */
  set(key: ParamKey, value: number): boolean
  /** Commits several at once — one recompute, one render. Returns whether anything was clamped. */
  setMany(patch: Partial<Params>): boolean
  /** Writes the two knobs behind `--start`. */
  setStart(choice: StartChoice): void
  reset(): void
}
export function createParamsSlice(set: SetStore): ParamsState
```

This is the slice the whole console hangs off. Three properties decide whether dragging a slider redraws one knob or twenty-eight:

1. **`broken`, `inactive` and `floor` are sparse.** A knob that is fine has no entry, so `state.params.broken[key]` is `undefined` — the same value as last render, and zustand's `Object.is` comparison stops the render there. A dense map with empty arrays would rerender every knob on every keystroke.
2. **`floor` holds a number, not an object.** `{ floor: 0.75 }` is a fresh identity per recompute; `0.75` is not.
3. **`violations` is the shared empty array when there are none.** `validateParams` allocates a new `[]` each call, so the rail — which selects the whole list to count per group — would rerender on every drag of a valid board.

- [ ] **Step 1: Write the failing tests**

Create `apps/lab/src/state/params.slice.test.ts`:

```ts
import { defaultParams, PARAM_SPEC, straightFloor } from '@arrowz/engine'
import { expect, test } from 'vitest'
import { useStore } from './store'

const params = () => useStore.getState().params

function reset() {
  params().reset()
}

test('the slice starts at the engine defaults, with nothing broken', () => {
  reset()
  expect(params().values).toEqual(defaultParams())
  expect(params().violations).toEqual([])
  expect(params().broken.pStraight).toBeUndefined()
})

test('a committed value is clamped to the knob range and reported', () => {
  reset()
  expect(params().set('W', 5000)).toBe(true)
  expect(params().values.W).toBe(1000)
  expect(params().set('W', 300)).toBe(false)
  expect(params().values.W).toBe(300)
})

test('a value off the step grid snaps, because the engine refuses one that does not', () => {
  reset()
  // maxBack steps by 50 from 50; 237 is between two settings.
  expect(params().set('maxBack', 237)).toBe(true)
  expect(params().values.maxBack % 50).toBe(0)
})

test('a broken cross-knob rule names every knob it reads', () => {
  reset()
  params().setMany({ wShort: 0.8, wMid: 0.8 })
  const names = Object.keys(params().broken)
  expect(names).toContain('wShort')
  expect(names).toContain('wMid')
  expect(params().violations.length).toBeGreaterThan(0)
})

test('an untouched knob keeps `undefined`, so its selector does not rerender', () => {
  reset()
  params().setMany({ wShort: 0.8, wMid: 0.8 })
  // Not an empty array: an empty array is a fresh identity on every recompute.
  expect(params().broken.warns).toBeUndefined()
  expect(params().inactive.warns).toBeUndefined()
})

test('a valid board reuses one empty violations array', () => {
  reset()
  const first = params().violations
  params().set('W', 120)
  expect(params().violations).toBe(first)
})

test('the straightness floor is published as a number, for the marker', () => {
  reset()
  params().setMany({ W: 900, H: 900 })
  expect(params().floor.pStraight).toBe(straightFloor(params().values))
  expect(params().floor.pStraight).toBeGreaterThan(0.6)
})

test('the floor is a bound, not a clamp: the knob keeps the value that breaks it', () => {
  reset()
  params().setMany({ W: 900, H: 900, pStraight: 0.6 })
  expect(params().values.pStraight).toBe(0.6)
  expect(params().broken.pStraight?.length).toBeGreaterThan(0)
})

test('the inactive index carries the reason the engine gives', () => {
  reset()
  // The serpentine knobs do nothing while there is no skeleton.
  expect(params().values.giants).toBe(0)
  expect(params().inactive.giantSpan).toBe('skeletonOff')
  params().set('giants', 4)
  expect(params().inactive.giantSpan).toBeUndefined()
})

test('a start word writes both knobs behind --start', () => {
  reset()
  params().setStart('tunnels')
  expect(params().values).toMatchObject(START.words.tunnels)
  params().setStart('layers')
  expect(params().values).toMatchObject(START.words.layers)
})

test('mixing keeps a share already in range and otherwise takes the middle', () => {
  reset()
  params().setStart('mixing')
  expect(params().values.headBias).toBe(0)
  expect(params().values.mix).toBe(MIX_START)
  params().set('mix', 0.4)
  params().setStart('mixing')
  expect(params().values.mix).toBe(0.4)
})

test('every knob in PARAM_SPEC can be committed by key', () => {
  reset()
  // A knob the slice cannot write is a knob the console cannot draw; this is
  // cheaper than twenty-eight assertions that drift from the table.
  for (const spec of PARAM_SPEC) {
    params().set(spec.key, spec.def)
    expect(params().values[spec.key]).toBe(spec.def)
  }
})
```

Add the two imports the last tests need at the top of the file:

```ts
import { MIX_START, START } from '@arrowz/engine/command'
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd apps/lab && pnpm vitest run --project node src/state/params.slice.test.ts
```

Expected: FAIL — `state.params` is `undefined`.

- [ ] **Step 3: Write the slice**

Create `apps/lab/src/state/params.slice.ts`:

```ts
import {
  clampParam,
  defaultParams,
  type InactiveKey,
  type ParamKey,
  type Params,
  type ParamSpec,
  PARAM_SPEC,
  straightFloor,
  validateParams,
  type Violation,
} from '@arrowz/engine'
import { MIX_START, START, type StartChoice } from '@arrowz/engine/command'

const specByKey = new Map<ParamKey, ParamSpec>(PARAM_SPEC.map((s) => [s.key, s]))

/** A knob's spec. Every key here comes from PARAM_SPEC, so a miss is a bug in this file. */
function specOf(key: ParamKey): ParamSpec {
  const spec = specByKey.get(key)
  if (!spec) throw new Error(`unknown parameter ${key}`)
  return spec
}

/**
 * One array for every valid board. `validateParams` returns a fresh `[]` each
 * time, and the rail selects the whole list to count violations per group: a
 * fresh empty array would rerender the rail on every drag of a valid board.
 */
const NO_VIOLATIONS: readonly Violation[] = []

export interface Indexes {
  violations: readonly Violation[]
  broken: Readonly<Partial<Record<ParamKey, readonly Violation[]>>>
  inactive: Readonly<Partial<Record<ParamKey, InactiveKey>>>
  floor: Readonly<Partial<Record<ParamKey, number>>>
}

/**
 * The three per-key indexes, recomputed once per change. Sparse on purpose:
 * a knob with nothing to say has no entry, so its selector reads `undefined`
 * twice running and the component does not render again.
 *
 * `straightFloor` is why this cannot be a per-knob selector at all — it reads
 * W, H, warns and anticoil (spec §5.4).
 */
export function indexesOf(values: Params): Indexes {
  const list = validateParams(values)
  const broken: Partial<Record<ParamKey, Violation[]>> = {}
  for (const v of list) {
    for (const key of v.kind === 'rule' ? v.keys : [v.key]) {
      const seen = broken[key]
      if (seen) seen.push(v)
      else broken[key] = [v]
    }
  }
  const inactive: Partial<Record<ParamKey, InactiveKey>> = {}
  for (const spec of PARAM_SPEC) {
    // A broken knob shows its violation, not its inactive reason: the old lab
    // makes the same choice (`!bad && spec.inactive` in lab-page.ts:369).
    if (broken[spec.key] || !spec.inactive) continue
    const reason = spec.inactive(values)
    if (reason) inactive[spec.key] = reason
  }
  return {
    violations: list.length === 0 ? NO_VIOLATIONS : list,
    broken,
    inactive,
    floor: { pStraight: straightFloor(values) },
  }
}

export interface ParamsState extends Indexes {
  values: Params
  set(key: ParamKey, value: number): boolean
  setMany(patch: Partial<Params>): boolean
  setStart(choice: StartChoice): void
  reset(): void
}

type SetStore = (fn: (state: { params: ParamsState }) => { params: ParamsState }) => void

/** Clamps a patch onto the values, reporting whether anything moved. */
function commit(values: Params, patch: Partial<Params>): { values: Params; clamped: boolean } {
  const next = { ...values }
  let clamped = false
  for (const [key, value] of Object.entries(patch) as [ParamKey, number][]) {
    const c = clampParam(specOf(key), value)
    next[key] = c.value
    clamped = clamped || c.clamped
  }
  return { values: next, clamped }
}

export function createParamsSlice(set: SetStore): ParamsState {
  const initial = defaultParams()
  const write = (patch: Partial<Params>): boolean => {
    let clamped = false
    set((state) => {
      const c = commit(state.params.values, patch)
      clamped = c.clamped
      return { params: { ...state.params, values: c.values, ...indexesOf(c.values) } }
    })
    return clamped
  }
  return {
    values: initial,
    ...indexesOf(initial),
    set: (key, value) => write({ [key]: value }),
    setMany: (patch) => write(patch),
    setStart: (choice) => {
      const pair = choice === 'mixing' ? undefined : START.words[choice]
      if (pair) {
        write(pair)
        return
      }
      // `mixing` is not a word in the table: it is the share itself, and the
      // share already on the knob survives the switch when --start can spell
      // it. Read inside the setter, so it cannot read a value another action
      // has already replaced.
      set((state) => {
        const mix = state.params.values.mix
        const share = mix >= START.mix.min && mix <= START.mix.max ? mix : MIX_START
        const c = commit(state.params.values, { headBias: 0, mix: share })
        return { params: { ...state.params, values: c.values, ...indexesOf(c.values) } }
      })
    },
    reset: () => {
      const values = defaultParams()
      set((state) => ({ params: { ...state.params, values, ...indexesOf(values) } }))
    },
  }
}
```

- [ ] **Step 4: Register the slice**

In `apps/lab/src/state/store.ts`:

```ts
import { create } from 'zustand'
import { createParamsSlice, type ParamsState } from './params.slice'
import { createRunSlice, type RunState } from './run.slice'

/**
 * One store, one named field per slice, so a per-knob selector reaches exactly
 * its own entry. PR 3b adds the hash codec's writer; PR 4 adds lang and
 * recipe; PR 5 adds library.
 */
export interface Store {
  run: RunState
  params: ParamsState
}

export const useStore = create<Store>()((set) => ({
  run: createRunSlice(set),
  params: createParamsSlice(set),
}))
```

- [ ] **Step 5: Run the tests**

```bash
cd apps/lab && pnpm vitest run --project node src/state/params.slice.test.ts
```

Expected: PASS, fourteen tests.

- [ ] **Step 6: Falsify three of them**

- Make `indexesOf` return `violations: list` unconditionally. The "reuses one empty violations array" test must go red.
- Make `broken[key] = []` for every key up front. The "keeps `undefined`" test must go red.
- Make `floor` return `{ pStraight: { need: straightFloor(values) } }` with the type widened. The floor test must go red.

Restore all three. Each of these is a performance claim written as a test; a claim that cannot fail is decoration.

- [ ] **Step 7: Commit**

```bash
git add apps/lab/src/state/params.slice.ts apps/lab/src/state/params.slice.test.ts apps/lab/src/state/store.ts
git commit -m "Hold the twenty-eight knobs in a slice with sparse per-key indexes"
```

---

### Task 3: The view slice — nine preview fields with types

**Files:**
- Create: `apps/lab/src/state/view.slice.ts`
- Create: `apps/lab/src/state/view.slice.test.ts`
- Modify: `apps/lab/src/state/store.ts`

**Interfaces:**
- Consumes: `VIEW_RANGE`, `viewNumberOf`, `DEFAULT_VIEW` from `@arrowz/engine/command`; `type View`, `type ViewNumber` from `@arrowz/engine` — **the root, not `/command`**. `command.ts` imports those two types from `types.ts` and re-exports only `StartChoice` (`command.ts:84`); the root re-exports all of `types.ts` (`mod.ts:39`).
- Produces:

```ts
export type ViewFlag = 'colored' | 'rounded' | 'hilite' | 'voids'
export interface ViewState {
  cell: number
  stroke: number
  headWidth: number
  headHeight: number
  top: number
  colored: boolean
  rounded: boolean
  hilite: boolean
  voids: boolean
  setNumber(field: ViewNumber, raw: string): void
  toggle(flag: ViewFlag): void
}
/** The CLI's view, as `buildCommand`, `storeRequest` and the SVG export take it. */
export function viewOf(state: ViewState): View
```

This is §2.3's first item, the one the spec calls the main trap of the port: today these nine controls have no variable at all, `viewOptions()` reads `el(id).value` on every call, and the URL hash serialises the raw input strings. Here they are typed values, read through `viewNumberOf` exactly once — on commit — which is where the old lab's tolerance lives: an empty or unreadable field is the default, anything outside `VIEW_RANGE` is clamped in.

`hilite` is a flag and `top` is a number, and `viewOf` folds them the way the old lab does (`top: hilite ? top : 0`), because the CLI has no "highlight" flag — zero *is* off.

- [ ] **Step 1: Write the failing tests**

Create `apps/lab/src/state/view.slice.test.ts`:

```ts
import { DEFAULT_VIEW, VIEW_RANGE } from '@arrowz/engine/command'
import { expect, test } from 'vitest'
import { useStore } from './store'
import { viewOf } from './view.slice'

const view = () => useStore.getState().view

test('the fields start where the old lab starts them', () => {
  expect(view().cell).toBe(12)
  expect(view().stroke).toBe(DEFAULT_VIEW.stroke)
  expect(view().rounded).toBe(true)
  expect(view().hilite).toBe(true)
  expect(view().voids).toBe(true)
  expect(view().colored).toBe(false)
  expect(view().top).toBe(5)
})

test('an empty field falls back to the default rather than to zero', () => {
  view().setNumber('headHeight', '')
  // Number('') is 0, and a head of no height is a real setting nobody asks
  // for by clearing a box (command.ts, viewNumberOf).
  expect(view().headHeight).toBe(DEFAULT_VIEW.headHeight)
})

test('a typed-over value is clamped into what the CLI takes', () => {
  view().setNumber('cell', '9999')
  expect(view().cell).toBe(VIEW_RANGE.cell.max)
  view().setNumber('stroke', '-4')
  expect(view().stroke).toBe(VIEW_RANGE.stroke.min)
})

test('a whole field rounds', () => {
  view().setNumber('top', '7.6')
  expect(view().top).toBe(8)
})

test('the highlight flag is what zeroes top, because the CLI has no flag for it', () => {
  view().setNumber('top', '9')
  expect(viewOf(view()).top).toBe(9)
  view().toggle('hilite')
  expect(viewOf(view()).top).toBe(0)
  // The number itself survives the flag, so switching back restores it.
  expect(view().top).toBe(9)
  view().toggle('hilite')
})

test('voids is not part of the view: the CLI has no such flag', () => {
  expect('voids' in viewOf(view())).toBe(false)
})
```

- [ ] **Step 2: Run and watch them fail**

```bash
cd apps/lab && pnpm vitest run --project node src/state/view.slice.test.ts
```

Expected: FAIL — `state.view` is `undefined`.

- [ ] **Step 3: Write the slice**

Create `apps/lab/src/state/view.slice.ts`:

```ts
import type { View, ViewNumber } from '@arrowz/engine'
import { DEFAULT_VIEW, viewNumberOf } from '@arrowz/engine/command'

export type ViewFlag = 'colored' | 'rounded' | 'hilite' | 'voids'

export interface ViewState {
  cell: number
  stroke: number
  headWidth: number
  headHeight: number
  top: number
  colored: boolean
  rounded: boolean
  hilite: boolean
  voids: boolean
  /** Commits a field from what was typed. Tolerant, as `viewNumberOf` is. */
  setNumber(field: ViewNumber, raw: string): void
  toggle(flag: ViewFlag): void
}

type SetStore = (fn: (state: { view: ViewState }) => { view: ViewState }) => void

/**
 * The CLI's view. `top` is the one field with two surfaces: a count and a
 * flag. `carve` has no "highlight" flag — a top of 0 is the absence of one —
 * so the flag folds into the number here and nowhere else.
 */
export function viewOf(state: ViewState): View {
  return {
    cell: state.cell,
    stroke: state.stroke,
    headWidth: state.headWidth,
    headHeight: state.headHeight,
    colored: state.colored,
    rounded: state.rounded,
    top: state.hilite ? state.top : 0,
  }
}

export function createViewSlice(set: SetStore): ViewState {
  const patch = (next: Partial<ViewState>) => set((state) => ({ view: { ...state.view, ...next } }))
  return {
    // The old lab's own starting values (lab.html:223-262), not DEFAULT_VIEW's:
    // `cell` and `top` are the page's, the rest the CLI's.
    cell: 12,
    stroke: DEFAULT_VIEW.stroke,
    headWidth: DEFAULT_VIEW.headWidth,
    headHeight: DEFAULT_VIEW.headHeight,
    top: 5,
    colored: false,
    rounded: true,
    hilite: true,
    voids: true,
    setNumber: (field, raw) => patch({ [field]: viewNumberOf(raw, field) }),
    toggle: (flag) => set((state) => ({ view: { ...state.view, [flag]: !state.view[flag] } })),
  }
}
```

- [ ] **Step 4: Register it in the store**

Add `view: ViewState` to `Store` and `view: createViewSlice(set)` to the creator, beside `params`.

- [ ] **Step 5: Run the tests**

```bash
cd apps/lab && pnpm vitest run --project node src/state/view.slice.test.ts
```

Expected: PASS, seven tests.

- [ ] **Step 6: Falsify the tolerance test**

Change `setNumber` to `patch({ [field]: Number(raw) })` and re-run: the empty-field test and both clamp tests must go red. Restore. This is the one behaviour §2.3 warns about by name, and `Number('')` is the exact shape of the bug.

- [ ] **Step 7: Commit**

```bash
git add apps/lab/src/state/view.slice.ts apps/lab/src/state/view.slice.test.ts apps/lab/src/state/store.ts
git commit -m "Give the nine preview fields a typed home"
```

---

### Task 4: The ui slice — which rail entry is open

**Files:**
- Create: `apps/lab/src/state/ui.slice.ts`
- Create: `apps/lab/src/state/ui.slice.test.ts`
- Modify: `apps/lab/src/state/store.ts`

**Interfaces:**
- Produces:

```ts
/** The rail's seven entries: the six generator groups and the element section. */
export type RailEntry = ParamGroup | 'preview'
export interface UiState {
  entry: RailEntry
  select(entry: RailEntry): void
}
export const RAIL_GROUPS: readonly ParamGroup[]
```

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/state/ui.slice.test.ts`:

```ts
import { PARAM_SPEC } from '@arrowz/engine'
import { expect, test } from 'vitest'
import { RAIL_GROUPS } from './ui.slice'
import { useStore } from './store'

test('the rail opens on the board group, as the old lab does', () => {
  expect(useStore.getState().ui.entry).toBe('board')
})

test('selecting an entry keeps it', () => {
  useStore.getState().ui.select('preview')
  expect(useStore.getState().ui.entry).toBe('preview')
  useStore.getState().ui.select('board')
})

test('the rail lists every group PARAM_SPEC uses, in the table order', () => {
  // Derived, not typed by hand: a seventh group added to the engine must show
  // up in the console rather than hiding its knobs.
  const fromSpec = [...new Set(PARAM_SPEC.map((s) => s.group))]
  expect([...RAIL_GROUPS]).toEqual(fromSpec)
})
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd apps/lab && pnpm vitest run --project node src/state/ui.slice.test.ts
```

Expected: FAIL — no module `./ui.slice`.

- [ ] **Step 3: Write the slice**

Create `apps/lab/src/state/ui.slice.ts`:

```ts
import { type ParamGroup, PARAM_SPEC } from '@arrowz/engine'

/**
 * The groups, in the order PARAM_SPEC introduces them. Derived rather than
 * listed: the console must not be able to hide a group the engine has.
 */
export const RAIL_GROUPS: readonly ParamGroup[] = [...new Set(PARAM_SPEC.map((s) => s.group))]

/** A rail entry: a generator group, or the mock's element section (the preview fields). */
export type RailEntry = ParamGroup | 'preview'

export interface UiState {
  entry: RailEntry
  select(entry: RailEntry): void
}

type SetStore = (fn: (state: { ui: UiState }) => { ui: UiState }) => void

export function createUiSlice(set: SetStore): UiState {
  return {
    // `board` first: the old lab opens board and skeleton by default, and the
    // mock shows one group at a time (spec §5.2).
    entry: 'board',
    select: (entry) => set((state) => ({ ui: { ...state.ui, entry } })),
  }
}
```

- [ ] **Step 4: Register it, run, commit**

Add `ui: UiState` to `Store` and `ui: createUiSlice(set)` to the creator.

```bash
cd apps/lab && pnpm vitest run --project node src/state
git add apps/lab/src/state/ui.slice.ts apps/lab/src/state/ui.slice.test.ts apps/lab/src/state/store.ts
git commit -m "Track which console group is open"
```

Expected: PASS, all three state test files.

---

### Task 5: The group rail

**Files:**
- Create: `apps/lab/src/console/GroupRail.tsx`
- Create: `apps/lab/src/console/GroupRail.browser.test.tsx`
- Create: `apps/lab/src/console/violationCounts.ts`
- Create: `apps/lab/src/console/violationCounts.test.ts`
- Create: `apps/lab/src/design/console.css`

**Interfaces:**
- Consumes: `RAIL_GROUPS`, `type RailEntry` (Task 4), `useStore`, `useDictionary`.
- Produces: `<GroupRail />`; `countsByGroup(violations: readonly Violation[]): Readonly<Partial<Record<ParamGroup, number>>>`; the panel ids `rail-panel-<entry>` and the tab ids `rail-tab-<entry>`, which `KnobPanel` (Task 10) and `ViewPanel` (Task 11) label themselves with.

**Ruling 13 applies here** (see the Rulings section): the rail is a vertical `role="tablist"`, not the mock's plain `<nav>`, and it copies **all** of `TabRow.tsx`'s pattern, focus management included.

Counting rule: a group's count is the number of **violations naming at least one knob in that group**, counted once per group. Every rule the engine has today is single-group — `straightFloor` names `pStraight`, `warns` and `anticoil`, all in `shape` (`engine.ts:2823-2828`) — so the per-group deduplication changes nothing yet. It is written anyway, because a rule that did span two groups is one `RULES` entry away, and the failure mode without it (one problem reported as five) is silent.

- [ ] **Step 1: Write the failing counting test**

Create `apps/lab/src/console/violationCounts.test.ts`:

```ts
import { defaultParams, validateParams, type Violation } from '@arrowz/engine'
import { expect, test } from 'vitest'
import { countsByGroup } from './violationCounts'

test('a range violation counts against the knob it names', () => {
  const v: Violation = { kind: 'range', key: 'warns', value: 99, min: 2, max: 16 }
  expect(countsByGroup([v])).toEqual({ shape: 1 })
})

test('the engine\'s own floor rule counts once, in shape', () => {
  // Not a hand-written violation: the real one, so the test cannot drift from
  // the table. straightFloor names pStraight, warns and anticoil — all shape.
  const real = validateParams({ ...defaultParams(), W: 900, H: 900, pStraight: 0.6 })
  expect(real.some((v) => v.kind === 'rule' && v.key === 'straightFloor')).toBe(true)
  expect(countsByGroup(real)).toEqual({ shape: 1 })
})

test('a rule spanning two groups would count once in each, not once per knob', () => {
  // No rule in RULES spans groups today; this is the guard for the one that
  // does. Without the per-group dedup it would read `{ shape: 3, board: 2 }`.
  const spanning: Violation = {
    kind: 'rule',
    key: 'straightFloor',
    keys: ['pStraight', 'warns', 'anticoil', 'W', 'H'],
    need: 0.75,
  }
  expect(countsByGroup([spanning])).toEqual({ shape: 1, board: 1 })
})

test('a group with nothing wrong has no entry', () => {
  expect(countsByGroup([])).toEqual({})
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/lab && pnpm vitest run --project node src/console/violationCounts.test.ts
```

Expected: FAIL — no module `./violationCounts`.

- [ ] **Step 3: Write the counter**

Create `apps/lab/src/console/violationCounts.ts`:

```ts
import { type ParamGroup, type ParamKey, PARAM_SPEC, type Violation } from '@arrowz/engine'

const groupByKey = new Map<ParamKey, ParamGroup>(PARAM_SPEC.map((s) => [s.key, s.group]))

/**
 * How many violations touch each group. A rule naming five knobs in three
 * groups is one problem, not five, so it counts once per group it reaches —
 * otherwise the rail would report a badly configured board as a dozen faults.
 */
export function countsByGroup(violations: readonly Violation[]): Readonly<Partial<Record<ParamGroup, number>>> {
  const counts: Partial<Record<ParamGroup, number>> = {}
  for (const v of violations) {
    const groups = new Set<ParamGroup>()
    for (const key of v.kind === 'rule' ? v.keys : [v.key]) {
      const group = groupByKey.get(key)
      if (group) groups.add(group)
    }
    for (const group of groups) counts[group] = (counts[group] ?? 0) + 1
  }
  return counts
}
```

- [ ] **Step 4: Write the failing rail test**

Create `apps/lab/src/console/GroupRail.browser.test.tsx`:

```tsx
import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { GroupRail } from './GroupRail'

function reset() {
  useStore.getState().params.reset()
  useStore.getState().ui.select('board')
}

test('the rail is a vertical tablist with the six groups and the preview entry', async () => {
  reset()
  const screen = await render(<GroupRail />)
  await expect.element(screen.getByRole('tablist', { name: 'Parameter groups' })).toHaveAttribute(
    'aria-orientation',
    'vertical',
  )
  // Exact names, not substrings: `/board/` also matches "Saved boards" once
  // this rail sits in the real shell beside the route tabs.
  for (const name of ['board', 'lengths', 'shape', 'difficulty', 'skeleton', 'closing']) {
    await expect.element(screen.getByRole('tab', { name, exact: true })).toBeVisible()
  }
  await expect.element(screen.getByRole('tab', { name: 'Preview', exact: true })).toBeVisible()
})

test('the selected entry is the one the ui slice holds', async () => {
  reset()
  const screen = await render(<GroupRail />)
  await expect.element(screen.getByRole('tab', { name: 'board', exact: true, selected: true })).toBeVisible()
  await screen.getByRole('tab', { name: 'shape', exact: true }).click()
  await expect.element(screen.getByRole('tab', { name: 'shape', exact: true, selected: true })).toBeVisible()
  expect(useStore.getState().ui.entry).toBe('shape')
})

test('the arrow keys move the selection, move the focus with it, and wrap', async () => {
  reset()
  const screen = await render(<GroupRail />)
  await screen.getByRole('tab', { name: 'board', exact: true }).click()
  await userEvent.keyboard('{ArrowDown}')
  expect(useStore.getState().ui.entry).toBe('lengths')
  // Selection without focus is half the pattern: the panel changes and a
  // screen reader is told nothing (Ruling 13).
  expect(document.activeElement?.getAttribute('id')).toBe('rail-tab-lengths')
  expect(document.activeElement?.getAttribute('aria-selected')).toBe('true')
  await userEvent.keyboard('{Home}')
  expect(useStore.getState().ui.entry).toBe('board')
  await userEvent.keyboard('{ArrowUp}')
  // Up from the first entry wraps to the last, which is the preview.
  expect(useStore.getState().ui.entry).toBe('preview')
  expect(document.activeElement?.getAttribute('id')).toBe('rail-tab-preview')
})

test('clicking a tab does not drag focus back from wherever it was', async () => {
  reset()
  const screen = await render(
    <>
      <button type="button">outside</button>
      <GroupRail />
    </>,
  )
  const outside = screen.getByRole('button', { name: 'outside' })
  await outside.click()
  useStore.getState().ui.select('shape')
  // The ref only focuses while the rail already owns focus, as TabRow does.
  await expect.element(outside).toHaveFocus()
})

test('a violated group carries a count that says what it counts', async () => {
  reset()
  useStore.getState().params.setMany({ W: 900, H: 900, pStraight: 0.6 })
  const screen = await render(<GroupRail />)
  // straightFloor is a shape rule; board is not involved (engine.ts:2823).
  await expect
    .element(screen.getByRole('tab', { name: 'shape, 1 setting outside the safe range' }))
    .toBeVisible()
  await expect.element(screen.getByRole('tab', { name: 'board', exact: true })).toBeVisible()
})

test('the preview entry never carries a count', async () => {
  reset()
  useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
  const screen = await render(<GroupRail />)
  await expect.element(screen.getByRole('tab', { name: 'Preview', exact: true })).not.toMatchTextContent(/\d/)
})
```

- [ ] **Step 5: Run and watch it fail**

```bash
cd apps/lab && pnpm vitest run --project chromium src/console/GroupRail.browser.test.tsx
```

Expected: FAIL — no module `./GroupRail`.

- [ ] **Step 6: Write the rail**

Create `apps/lab/src/console/GroupRail.tsx`:

```tsx
import type React from 'react'
import { useDictionary } from '../i18n'
import { type RailEntry, RAIL_GROUPS } from '../state/ui.slice'
import { useStore } from '../state/store'
import { countsByGroup } from './violationCounts'

/** Every entry, in rail order: the generator's groups, then the element's section. */
const ENTRIES: readonly RailEntry[] = [...RAIL_GROUPS, 'preview']

export const tabId = (entry: RailEntry) => `rail-tab-${entry}`
export const panelId = (entry: RailEntry) => `rail-panel-${entry}`

/**
 * The console's left rail. A vertical tablist rather than the mock's plain
 * `<nav>`: picking an entry replaces the panel beside it, and that
 * relationship has to be in the markup, not only in the layout (Ruling 13).
 *
 * The violation count is in the tab's accessible name and says what it counts;
 * the colour only repeats it.
 */
export function GroupRail() {
  const dict = useDictionary()
  const entry = useStore((state) => state.ui.entry)
  const select = useStore((state) => state.ui.select)
  const violations = useStore((state) => state.params.violations)
  const counts = countsByGroup(violations)

  const move = (delta: number) => {
    const at = ENTRIES.indexOf(entry)
    const next = ENTRIES[(at + delta + ENTRIES.length) % ENTRIES.length]
    if (next) select(next)
  }
  const onKeyDown = (event: React.KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      Home: () => select('board'),
      End: () => select('preview'),
    }
    const action = keys[event.key]
    if (!action) return
    event.preventDefault()
    action()
  }

  /**
   * Focus follows the selection, but only while the rail already owns focus —
   * the same guard `TabRow.tsx:65-69` uses, so that selecting a group from
   * elsewhere does not steal focus out of whatever the user was in.
   */
  const focusIfSelected = (selected: boolean) => (node: HTMLButtonElement | null) => {
    if (node && selected && node.parentElement?.contains(document.activeElement)) node.focus()
  }

  const tab = (value: RailEntry, name: string, count?: number) => (
    <button
      key={value}
      type="button"
      role="tab"
      id={tabId(value)}
      aria-selected={entry === value}
      // Pointing at an id that is not in the document is worse than not
      // pointing at all; only the selected panel is rendered.
      {...(entry === value ? { 'aria-controls': panelId(value) } : {})}
      // A bare digit announces "lengths 1". The name says what the 1 is.
      {...(count === undefined ? {} : { 'aria-label': dict.t('violationsInGroup', name, count) })}
      tabIndex={entry === value ? 0 : -1}
      ref={focusIfSelected(entry === value)}
      onKeyDown={onKeyDown}
      onClick={() => select(value)}
    >
      <span>{name}</span>
      {count === undefined ? null : <span className="n">{count}</span>}
    </button>
  )

  return (
    <div className="fw-rail" role="tablist" aria-orientation="vertical" aria-label={dict.t('railLabel')}>
      {/* A tablist owns tabs. The two section headings are a visual grouping,
          so they are hidden from the accessibility tree rather than left in it
          as children the role does not allow; the tab names carry the meaning. */}
      <span className="sec caps" aria-hidden="true">
        {dict.t('railGenerator')}
      </span>
      {RAIL_GROUPS.map((group) => tab(group, dict.d.groups[group], counts[group]))}
      <span className="sec caps" aria-hidden="true">
        {dict.t('railElement')}
      </span>
      {tab('preview', dict.t('preview'))}
    </div>
  )
}
```

- [ ] **Step 7: Write the console stylesheet**

Create `apps/lab/src/design/console.css` with the mock's rail rules, ported verbatim except where a ported rule would carry a mock defect:

```css
/* The console of the workshop mock (fronthub-workshop-v2.css, "console"
   section). Its own file rather than more lines in shell.css: PR 2 shipped a
   specificity collision between two rules written in different tasks, and one
   file per surface keeps such a collision inside the surface that caused it.

   Two tracks, not the mock's three: the run column is lifted above the console
   (spec §5.1) and arrives in the next PR. */
.fw-console {
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr);
  gap: 1px;
  background: var(--border);
  border-top: 1px solid var(--border);
  min-height: 0;
}
.fw-rail {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 8px 0;
  background: var(--graphite);
  min-height: 0;
  overflow-y: auto;
}
.fw-rail .sec {
  flex: none;
  padding: 8px 16px 3px;
  color: var(--ash);
}
.fw-rail .sec + .sec {
  margin-top: 4px;
}
.fw-rail button {
  flex: none;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 5px 16px;
  border: 0;
  text-align: left;
  background: none;
  color: var(--mist);
  cursor: pointer;
  transition: background 120ms cubic-bezier(0.2, 0, 0, 1), color 120ms cubic-bezier(0.2, 0, 0, 1);
}
.fw-rail button .n {
  flex: none;
  color: var(--warn);
}
.fw-rail button:hover {
  color: var(--ink);
  background: var(--surface);
}
/* The mock keys this off `aria-current`; the rail is a tablist, so the state
   lives on `aria-selected` (Ruling 13). */
.fw-rail button[aria-selected='true'] {
  color: var(--void);
  background: var(--signal);
}
.fw-rail button[aria-selected='true'] .n {
  color: var(--void);
}
```

Note the one deliberate drop: the mock dims an inactive count with `opacity: .7` on `--void` over `--signal`, which puts a number the rail exists to show below 3:1. The count keeps full opacity.

The `.n.warn` class the mock uses is gone too — there is one kind of count, and it always means the same thing.

Import it in `apps/lab/src/main.tsx` beside the existing stylesheets.

- [ ] **Step 8: Run both tests**

```bash
cd apps/lab && pnpm vitest run --project node src/console/violationCounts.test.ts && pnpm vitest run --project chromium src/console/GroupRail.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Falsify two things**

Change `countsByGroup` to increment per key instead of per group (drop the `Set`): the "spanning two groups" test must go red, and the rail's count must read 3. Then delete the `ref={focusIfSelected(...)}` line: the arrow-key test must go red on `document.activeElement`, and nothing else must change — which is the point, because that is exactly how this defect survived the first draft. Restore both.

- [ ] **Step 10: Commit**

```bash
git add apps/lab/src/console apps/lab/src/design/console.css apps/lab/src/main.tsx
git commit -m "Draw the console's group rail with per-group violation counts"
```

---

### Task 6: The slider — a knob's range, and the rule floor drawn on it

**Files:**
- Create: `apps/lab/src/console/KnobSlider.tsx`
- Create: `apps/lab/src/console/KnobSlider.browser.test.tsx`
- Modify: `apps/lab/src/design/console.css`

**Interfaces:**
- Produces:

```tsx
export function KnobSlider(props: {
  spec: ParamSpec
  value: number
  /** The input's id, so the knob's `<label>` can point at it. */
  id?: string | undefined
  /** The knob's own range, which is `spec` except for the mix row (Task 9). */
  bounds?: { min: number; max: number }
  /** A rule floor to mark, from `params.floor[key]`. Absent for most knobs. */
  floor?: number | undefined
  /** The id of the paragraph explaining the knob's state, for aria-describedby. */
  describedBy?: string | undefined
  label: string
  onCommit(value: number): void
}): JSX.Element

Three of those are `?: T | undefined` and not `?: T` because `exactOptionalPropertyTypes` is on: the caller reads them out of a sparse index, so it passes `number | undefined`, and `?: number` rejects that.
```

**Ruling 3 applies here:** this is a native `<input type="range">` dressed as the mock's 2px bar. The mock's bar is a `div` with a pointer handler and no keyboard; a native range brings arrow keys, Home/End, PageUp/PageDown, touch and the platform's value announcement for free, and its implicit role *is* `slider`.

The floor is drawn as a marker with a reason, never as a limit: `min` stays `spec.min`, so the slider can still reach a value the rule refuses (spec §5.4 — clamping a rule would reintroduce the silent moves PR #61 removed).

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/console/KnobSlider.browser.test.tsx`:

```tsx
import { PARAM_SPEC } from '@arrowz/engine'
import { expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { KnobSlider } from './KnobSlider'

const specOf = (key: string) => {
  const spec = PARAM_SPEC.find((s) => s.key === key)
  if (!spec) throw new Error(`no spec for ${key}`)
  return spec
}

test('the slider carries the knob range and the current value', async () => {
  const screen = await render(
    <KnobSlider spec={specOf('warns')} value={4} label="closing off nooks" onCommit={() => {}} />,
  )
  const slider = screen.getByRole('slider', { name: 'closing off nooks' })
  await expect.element(slider).toHaveAttribute('min', '2')
  await expect.element(slider).toHaveAttribute('max', '16')
  await expect.element(slider).toHaveAttribute('step', '1')
  await expect.element(slider).toHaveValue('4')
})

test('an arrow key commits one step, because that is what the engine accepts', async () => {
  const onCommit = vi.fn()
  const screen = await render(
    <KnobSlider spec={specOf('warns')} value={4} label="closing off nooks" onCommit={onCommit} />,
  )
  // Focus, not click: clicking a range input commits the value at the pointer,
  // so a click in the middle of a 2..16 track would fire onCommit(9) first and
  // the assertion below would be testing the click, not the key.
  const slider = screen.getByRole('slider').element()
  if (!(slider instanceof HTMLInputElement)) throw new Error('the slider is not an input')
  slider.focus()
  await userEvent.keyboard('{ArrowRight}')
  expect(onCommit).toHaveBeenCalledTimes(1)
  expect(onCommit).toHaveBeenCalledWith(5)
})

test('a knob whose value has a word says the word, not the number', async () => {
  // Lmax 0 is "auto" on the command line; a slider announcing "0" announces
  // a maximum length of zero.
  const screen = await render(<KnobSlider spec={specOf('Lmax')} value={0} label="maximum length" onCommit={() => {}} />)
  await expect.element(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'auto')
})

test('the rule floor is a marker, not a limit', async () => {
  const screen = await render(
    <KnobSlider spec={specOf('pStraight')} value={0.6} floor={0.75} label="straightness" onCommit={() => {}} />,
  )
  // The knob can still be set below the floor: refusing is the run's job.
  await expect.element(screen.getByRole('slider')).toHaveAttribute('min', '0.6')
  // Not `toBeVisible`: the marker is an empty inline element with no box, and
  // browser tests load no stylesheet, so a visibility check would fail on
  // correct markup.
  const marker = screen.container.querySelector('.bar u')
  expect(marker?.getAttribute('title')).toBe('Rule bound: 0.75')
})

test('a knob with no floor draws no marker', async () => {
  const screen = await render(<KnobSlider spec={specOf('warns')} value={4} label="nooks" onCommit={() => {}} />)
  expect(screen.container.querySelectorAll('.bar u')).toHaveLength(0)
})

test('the marker sits where the floor is, as a percentage of the track', async () => {
  const screen = await render(
    <KnobSlider spec={specOf('pStraight')} value={0.6} floor={0.8} label="straightness" onCommit={() => {}} />,
  )
  // pStraight runs 0.6..1, so 0.8 is halfway.
  const marker = screen.container.querySelector('.bar u')
  expect(marker?.getAttribute('style')).toContain('50%')
})

test('a floor outside the knob range marks nothing', async () => {
  // The mix row is bounded to 0.3..0.7; a floor of 0.1 is not a mark on it.
  const screen = await render(
    <KnobSlider spec={specOf('mix')} value={0.5} bounds={{ min: 0.3, max: 0.7 }} floor={0.1} label="share" onCommit={() => {}} />,
  )
  expect(screen.container.querySelectorAll('.bar u')).toHaveLength(0)
})
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd apps/lab && pnpm vitest run --project chromium src/console/KnobSlider.browser.test.tsx
```

Expected: FAIL — no module `./KnobSlider`.

- [ ] **Step 3: Write the slider**

Create `apps/lab/src/console/KnobSlider.tsx`:

```tsx
import type { ParamSpec } from '@arrowz/engine'
import { wordFor } from '@arrowz/engine/command'
import { useDictionary } from '../i18n'

/** Where a value sits on a track, as a percentage. */
function percent(value: number, min: number, max: number): number {
  if (max <= min) return 0
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
}

/**
 * A knob's range as the mock's 2px bar, over a native range input (Ruling 3).
 * The fill and the thumb are the input's own pseudo-elements, driven by the
 * `--pct` custom property; the rule marker is a sibling, because it is not
 * part of the control's value.
 */
export function KnobSlider({
  spec,
  id,
  value,
  bounds = spec,
  floor,
  describedBy,
  label,
  onCommit,
}: {
  spec: ParamSpec
  id?: string | undefined
  value: number
  bounds?: { min: number; max: number }
  floor?: number | undefined
  describedBy?: string | undefined
  label: string
  onCommit: (value: number) => void
}) {
  const dict = useDictionary()
  const word = wordFor(spec.key, value)
  const pct = percent(value, bounds.min, bounds.max)
  // A floor outside the knob's own range marks nothing: the whole track is
  // already below it, and a marker at 0% or 100% would suggest otherwise.
  const markFloor = floor !== undefined && floor > bounds.min && floor < bounds.max ? floor : undefined
  return (
    <div className="bar">
      <input
        type="range"
        id={id}
        min={bounds.min}
        max={bounds.max}
        step={spec.step}
        value={value}
        aria-label={label}
        // The CLI's word for the value, where it has one: a slider announcing
        // "0" for --lmax=auto announces a maximum length of nothing.
        aria-valuetext={word ?? undefined}
        aria-describedby={describedBy}
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
        onChange={(event) => onCommit(Number(event.currentTarget.value))}
      />
      {markFloor === undefined ? null : (
        <u
          title={dict.t('ruleBound', markFloor)}
          style={{ left: `${percent(markFloor, bounds.min, bounds.max)}%` }}
        />
      )}
    </div>
  )
}
```

Import `type React` for `CSSProperties`.

- [ ] **Step 4: Style it**

Append to `apps/lab/src/design/console.css`:

```css
/* The mock draws the bar as a div with a pointer handler and no keyboard.
   This is the same 2px bar over a native range input, so arrow keys, Home,
   End, PageUp/PageDown and touch come from the platform (Ruling 3). */
.fw-k .bar {
  position: relative;
  margin-top: 10px;
  height: 12px;
}
.fw-k .bar input[type='range'] {
  appearance: none;
  -webkit-appearance: none;
  display: block;
  width: 100%;
  height: 12px;
  margin: 0;
  padding: 0;
  /* `border: 0` is load-bearing: `.fw-k input` in Task 7 styles the inline
     entry with a 1px signal border, and both selectors reach this input. */
  border: 0;
  background: none;
  cursor: ew-resize;
}
.fw-k .bar input[type='range']::-webkit-slider-runnable-track {
  height: 2px;
  margin-top: 5px;
  background: linear-gradient(to right, var(--signal) 0 var(--pct), var(--border) var(--pct) 100%);
}
.fw-k .bar input[type='range']::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 2px;
  height: 12px;
  margin-top: -5px;
  border: 0;
  border-radius: 0;
  background: var(--signal);
}
.fw-k .bar input[type='range']::-moz-range-track {
  height: 2px;
  background: var(--border);
}
.fw-k .bar input[type='range']::-moz-range-progress {
  height: 2px;
  background: var(--signal);
}
.fw-k .bar input[type='range']::-moz-range-thumb {
  width: 2px;
  height: 12px;
  border: 0;
  border-radius: 0;
  background: var(--signal);
}
/* The rule floor: a mark with a reason, never a limit (spec §5.4). `--warn`
   is the token reserved for exactly this and for a clamped value. */
.fw-k .bar u {
  position: absolute;
  top: 5px;
  height: 2px;
  width: 0;
  border-left: 1px solid var(--warn);
  text-decoration: none;
  /* No `pointer-events: none`: the mock's marker is decoration, this one
     carries a `title`, and suppressing pointer events suppresses the tooltip
     that is its only surface for a mouse user. The knob's own `.why` states
     the bound in text, for everyone else. */
}
.fw-k .bar u::before {
  content: '';
  position: absolute;
  left: -1px;
  top: -3px;
  width: 1px;
  height: 8px;
  background: var(--warn);
}
```

- [ ] **Step 5: Run the tests**

```bash
cd apps/lab && pnpm vitest run --project chromium src/console/KnobSlider.browser.test.tsx
```

Expected: PASS, seven tests.

- [ ] **Step 6: Falsify the floor test**

Change the input's `min` to `floor ?? bounds.min`. The "marker, not a limit" test must go red — it asserts the slider still reaches 0.6 with a floor of 0.75. Restore. This is the single most important assertion in the task: a slider that clamps to the rule is the silent move the audit removed from the rest of the system.

Then delete `expect(onCommit).toHaveBeenCalledTimes(1)` from the arrow-key test and put `await screen.getByRole('slider').click()` back in place of the focus call: the test still passes, with `onCommit` called twice and the first call carrying the pointer's value. Restore. A test that passes whether or not the key did anything is the failure mode this step exists to show.

- [ ] **Step 7: Commit**

```bash
git add apps/lab/src/console/KnobSlider.tsx apps/lab/src/console/KnobSlider.browser.test.tsx apps/lab/src/design/console.css
git commit -m "Give a knob a slider that marks its rule floor without enforcing it"
```

---

### Task 7: `ValueKnob` — the number, the word, the draft and the reason

**Files:**
- Create: `apps/lab/src/console/ValueKnob.tsx`
- Create: `apps/lab/src/console/ValueKnob.browser.test.tsx`
- Modify: `apps/lab/src/design/console.css`

**Interfaces:**
- Consumes: `KnobSlider` (Task 6), `useStore`, `useDictionary`.
- Produces: `<ValueKnob spec={spec} bounds={bounds?} />`, and the id convention `knob-<key>` (the slider) / `knob-<key>-why` (the explanation paragraph).

This is where §5.5 lives. The inline entry keeps a **local draft string**, and the store is written on blur or Enter, never per keystroke: `clampParam` on every keystroke turns `0.` into `0` while the user is still typing `0.85`.

The spec attributes the old lab's `document.activeElement` guard to this problem; reading the source, that is not what it guards. The knob row's own number box syncs on `input` and writes the raw string straight back (`lab-page.ts:223-224`), so `0.` never collapsed there. The guard at `:679-681` protects the **simple view's** second seed field from being overwritten while someone types into it — a surface PR 4 re-creates, and which will need a draft of its own. The draft here is needed because this port is React: a controlled input re-renders from the store, and the store holds a clamped number.

The knob subscribes to four things, each by its own key: its value, its violations, its inactive reason, its floor. That is the whole reason the store is zustand with per-key indexes — dragging `wLateral` must not rerender twenty-seven other knobs.

An inactive knob is dimmed and explained, but **not** `aria-disabled`, though spec §7.2's table asks for it: the knob still works, still stores its value, and still matters the moment the knob that disabled it moves. Announcing it as disabled would be announcing something false.

Colour: a violation is `--error`, and the rule marker is `--warn`. The token file states the split (`--warn` is reserved for a clamped value or a rule bound), and the mock has no error state for a knob at all — it only ever shows `.hold` in warn. Using warn for both would make "your board will not generate" and "here is a bound" the same colour.

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/console/ValueKnob.browser.test.tsx`:

```tsx
import { PARAM_SPEC } from '@arrowz/engine'
import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { ValueKnob } from './ValueKnob'

const specOf = (key: string) => {
  const spec = PARAM_SPEC.find((s) => s.key === key)
  if (!spec) throw new Error(`no spec for ${key}`)
  return spec
}
const params = () => useStore.getState().params

test('the knob shows its label, its value and what it does', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('warns')} />)
  await expect.element(screen.getByText('closing off nooks')).toBeVisible()
  await expect.element(screen.getByRole('button', { name: /closing off nooks/ })).toMatchTextContent(/4/)
  // The description is not decoration: it is the only thing that says what a
  // knob called "closing off nooks" does, and the old lab prints it (lab-page.ts:165-173).
  await expect.element(screen.getByText(/fills nooks with few exits first/)).toBeVisible()
})

test('a value with a word shows the word beside the number', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('Lmax')} />)
  // toMatchTextContent, not toHaveTextContent: the button reads "auto0".
  await expect.element(screen.getByRole('button', { name: /maximum length/ })).toMatchTextContent(/auto/)
})

test('typing a fraction does not collapse while it is being typed', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('pStraight')} />)
  await screen.getByRole('button', { name: /straightness/ }).click()
  const entry = screen.getByRole('textbox')
  await userEvent.fill(entry, '0.')
  // The store is untouched: a clamp per keystroke would make this 0.6 and the
  // next two characters would be typed into a value that moved.
  expect(params().values.pStraight).toBe(0.85)
  await userEvent.fill(entry, '0.92')
  await userEvent.keyboard('{Enter}')
  expect(params().values.pStraight).toBe(0.92)
})

test('committing returns focus to the number, not to the document', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('warns')} />)
  await screen.getByRole('button', { name: /closing off nooks/ }).click()
  await userEvent.keyboard('12{Enter}')
  // Without this, editing twenty-eight knobs means Tabbing from the top of the
  // document after every commit (Ruling 4).
  await expect.element(screen.getByRole('button', { name: /closing off nooks/ })).toHaveFocus()
})

test('Escape abandons the draft', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('warns')} />)
  await screen.getByRole('button', { name: /closing off nooks/ }).click()
  await userEvent.fill(screen.getByRole('textbox'), '12')
  await userEvent.keyboard('{Escape}')
  expect(params().values.warns).toBe(4)
  await expect.element(screen.getByRole('button', { name: /closing off nooks/ })).toBeVisible()
})

test('an Escape does not eat the edit that comes after it', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('warns')} />)
  await screen.getByRole('button', { name: /closing off nooks/ }).click()
  await userEvent.keyboard('{Escape}')
  // The regression this guards is a flag armed for a blur React never sends:
  // it survives the cancel and swallows the next commit instead.
  await screen.getByRole('button', { name: /closing off nooks/ }).click()
  await userEvent.fill(screen.getByRole('textbox'), '9')
  await userEvent.keyboard('{Enter}')
  expect(params().values.warns).toBe(9)
})

test('Enter closes the entry instead of reopening it', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('warns')} />)
  await screen.getByRole('button', { name: /closing off nooks/ }).click()
  await userEvent.fill(screen.getByRole('textbox'), '7')
  await userEvent.keyboard('{Enter}')
  expect(params().values.warns).toBe(7)
  // Commit focuses the number button; without preventDefault the same key's
  // keypress activates it and the entry is back on screen.
  expect(screen.container.querySelectorAll('input[type="text"]')).toHaveLength(0)
})

test('a committed value out of range is clamped, and the field shows the clamped value', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('warns')} />)
  await screen.getByRole('button', { name: /closing off nooks/ }).click()
  await userEvent.fill(screen.getByRole('textbox'), '99')
  await userEvent.keyboard('{Enter}')
  expect(params().values.warns).toBe(16)
  await expect.element(screen.getByRole('button', { name: /closing off nooks/ })).toMatchTextContent(/16/)
})

test('a value outside the passed bounds is held inside them', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('mix')} bounds={{ min: 0.3, max: 0.7 }} />)
  await screen.getByRole('button', { name: /mixing/i }).click()
  await userEvent.fill(screen.getByRole('textbox'), '0.1')
  await userEvent.keyboard('{Enter}')
  // The knob's own range starts at -1, so `clampParam` alone would store 0.1 —
  // a share `--start` cannot spell (lab-page.ts:280-284).
  expect(params().values.mix).toBe(0.3)
})

test('a typo is refused rather than snapping the knob to its default', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('warns')} />)
  await screen.getByRole('button', { name: /closing off nooks/ }).click()
  await userEvent.fill(screen.getByRole('textbox'), 'abc')
  await userEvent.keyboard('{Enter}')
  // `clampParam` maps NaN to the default with `clamped: true`, which would be
  // an invisible jump nobody asked for.
  expect(params().values.warns).toBe(4)
})

test('an external change wins over a knob nobody is typing into', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('warns')} />)
  params().set('warns', 9)
  await expect.element(screen.getByRole('slider')).toHaveValue('9')
})

test('a violated knob says why, in error colour, and the slider points at the reason', async () => {
  params().reset()
  params().setMany({ wShort: 0.8, wMid: 0.8 })
  const screen = await render(<ValueKnob spec={specOf('wShort')} />)
  const why = screen.container.querySelector('.why')
  expect(why?.textContent ?? '').toContain('0.9')
  expect(screen.container.querySelector('.fw-k')?.className).toContain('bad')
  await expect.element(screen.getByRole('slider')).toHaveAttribute('aria-describedby', 'knob-wShort-why')
})

test('an inactive knob says what would make it do something', async () => {
  params().reset()
  const screen = await render(<ValueKnob spec={specOf('giantSpan')} />)
  // giants is 0, so the serpentine knobs do nothing.
  expect(screen.container.querySelector('.why')?.textContent).toContain('No effect:')
})

test('a knob under a rule floor states the bound in words, not only as a mark', async () => {
  params().reset()
  params().setMany({ W: 900, H: 900 })
  const screen = await render(<ValueKnob spec={specOf('pStraight')} />)
  // 0.85 is above the floor here, so there is no violation — and the marker on
  // the track is the only other place this number appears.
  expect(screen.container.querySelector('.why')?.textContent).toContain('Rule bound')
})
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd apps/lab && pnpm vitest run --project chromium src/console/ValueKnob.browser.test.tsx
```

Expected: FAIL — no module `./ValueKnob`.

- [ ] **Step 3: Write the knob**

Create `apps/lab/src/console/ValueKnob.tsx`:

```tsx
import type { ParamSpec } from '@arrowz/engine'
import { wordFor } from '@arrowz/engine/command'
import { useEffect, useRef, useState } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { KnobSlider } from './KnobSlider'

/**
 * One knob: a label, the value with the word the CLI spells it with, a slider,
 * and one paragraph that always says something — the knob's own description,
 * prefixed by whatever is wrong with it right now.
 *
 * Four subscriptions, all by this knob's key. Dragging another knob changes
 * none of them, so this component does not render: that is what the sparse
 * indexes in `params.slice` are for.
 *
 * The inline entry holds a draft string and writes the store on blur or Enter
 * (spec §5.5). Clamping per keystroke would turn `0.` into the minimum while
 * someone is still typing `0.85`.
 */
export function ValueKnob({ spec, bounds = spec }: { spec: ParamSpec; bounds?: { min: number; max: number } }) {
  const dict = useDictionary()
  const value = useStore((state) => state.params.values[spec.key])
  const broken = useStore((state) => state.params.broken[spec.key])
  const inactive = useStore((state) => state.params.inactive[spec.key])
  const floor = useStore((state) => state.params.floor[spec.key])
  const set = useStore((state) => state.params.set)
  const [draft, setDraft] = useState<string | null>(null)

  const numRef = useRef<HTMLButtonElement>(null)
  const entryRef = useRef<HTMLInputElement>(null)
  /** Whether the entry was ever open, so the first render does not steal focus. */
  const edited = useRef(false)
  const editing = draft !== null

  // Focus follows the swap in both directions. `autoFocus` would do half of
  // this and trip `jsx-a11y/no-autofocus`, which is an error here.
  useEffect(() => {
    if (editing) {
      edited.current = true
      entryRef.current?.focus()
      entryRef.current?.select()
    } else if (edited.current) {
      numRef.current?.focus()
    }
  }, [editing])

  const { label, help } = dict.paramText(spec)
  const word = wordFor(spec.key, value)
  // A floor the knob can actually be moved across; the marker draws the same one.
  const bound = floor !== undefined && floor > bounds.min && floor < bounds.max ? floor : undefined
  const state = broken
    ? broken.map((v) => dict.violation(v)).join('; ')
    : inactive
      ? `${dict.t('inactivePrefix')}${dict.reason(inactive)}`
      : bound === undefined
        ? null
        : dict.t('ruleBound', bound)
  // The description is always present; the state, when there is one, goes in
  // front of it — the shape the old lab builds with `help.dataset.why`.
  const why = state === null ? help : `${state}. ${help}`
  const whyId = `knob-${spec.key}-why`

  const commit = () => {
    const raw = draft
    setDraft(null)
    if (raw === null) return
    const typed = Number(raw.trim())
    // An unreadable field commits nothing: `clampParam` maps NaN to the knob's
    // default and reports it as a clamp, which is a jump nobody asked for.
    if (raw.trim() === '' || !Number.isFinite(typed)) return
    // Held inside the *passed* bounds first: the mix row's own range is
    // narrower than the knob's, and only it knows that.
    set(spec.key, Math.min(bounds.max, Math.max(bounds.min, typed)))
  }

  return (
    <div className={`fw-k${broken ? ' bad' : ''}${inactive ? ' off' : ''}`}>
      <div className="top">
        <label className="lab" htmlFor={`knob-${spec.key}`}>
          {label}
        </label>
        {draft === null ? (
          <button
            ref={numRef}
            type="button"
            className="num"
            aria-label={`${label}: ${word ?? value}`}
            onClick={() => setDraft(String(value))}
          >
            {word === null ? null : <em>{word}</em>}
            {value}
          </button>
        ) : (
          <input
            ref={entryRef}
            type="text"
            // A number, typed on a touch keyboard, with a decimal separator.
            inputMode="decimal"
            value={draft}
            aria-label={label}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                // Without this, Chromium delivers the same key's `keypress` to
                // whatever has focus *after* the commit — which, thanks to the
                // effect above, is the number button. It activates, and the
                // entry a user just closed reopens.
                event.preventDefault()
                commit()
              }
              // Escape needs no guard: React does not deliver a blur for an
              // element it is unmounting, so `commit` never runs here.
              if (event.key === 'Escape') setDraft(null)
            }}
          />
        )}
      </div>
      <KnobSlider
        spec={spec}
        id={`knob-${spec.key}`}
        value={value}
        bounds={bounds}
        floor={floor}
        label={label}
        describedBy={whyId}
        onCommit={(next) => set(spec.key, next)}
      />
      <p className="why" id={whyId}>
        {why}
      </p>
    </div>
  )
}
```

Two things to notice, both measured rather than reasoned. **React does not deliver a `blur` for an element it is unmounting**, so Enter commits exactly once and Escape needs no guard at all — an earlier draft carried an `abandon` ref for a blur that never arrives, and its only effect was to stay armed and swallow the *next* commit. And **Enter must `preventDefault()`**: the commit focuses the number button synchronously, and without it the same keystroke's `keypress` reaches that button and reopens the entry.

`describedBy` is unconditional now, because the paragraph is: a knob always has a description, so the slider always has one.

- [ ] **Step 4: Style it**

Append to `apps/lab/src/design/console.css`:

```css
.fw-k {
  padding: 8px 0;
  min-width: 0;
}
.fw-k .top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.fw-k .lab {
  color: var(--mist);
  min-width: 0;
}
/* The mock's number is a span with `cursor: ew-resize` and a pointer scrub.
   Here it is a button that opens the inline entry: the scrub is a mouse-only
   gesture with no keyboard equivalent (Ruling 4). */
.fw-k .num {
  flex: none;
  padding: 0;
  border: 0;
  background: none;
  color: var(--signal);
  font-variant-numeric: tabular-nums;
  cursor: text;
}
.fw-k .num:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.fw-k .num em {
  font-style: normal;
  color: var(--mist);
  margin-right: 8px;
}
.fw-k input {
  width: 72px;
  padding: 0 4px;
  border: 1px solid var(--signal);
  background: var(--void);
  color: var(--ink);
  font: inherit;
  text-align: right;
}
.fw-k .why {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--ash);
}
/* A knob the engine would refuse. The mock has no such state — its only knob
   state is `.hold` in warn — and `--warn` belongs to the rule bound, so a
   refusal gets `--error` and the two cannot be confused. */
.fw-k.bad .num,
.fw-k.bad .why {
  color: var(--error);
}
.fw-k.bad .bar input[type='range']::-webkit-slider-thumb {
  background: var(--error);
}
.fw-k.bad .bar input[type='range']::-moz-range-thumb {
  background: var(--error);
}
/* A knob that does nothing at these settings. The *control* is dimmed; the
   sentence explaining why is not. The mock dims the whole card at `.4`, and
   the old lab does the same (lab.html:160) — which puts the one line that
   says "No effect: needs skeleton elements > 0" at about 2.3:1. */
.fw-k.off .lab,
.fw-k.off .num,
.fw-k.off select,
.fw-k.off .bar {
  opacity: 0.55;
}
.fw-k.off .num {
  color: var(--mist);
}
```

`--ash` at 11px is already only 5.8:1 on `--void`; blended at `.55` it lands near 3.6:1, under the 4.5:1 that text of that size needs. Dimming the control and leaving `.why` at full strength is the port's chance to fix a contrast defect rather than inherit it.

- [ ] **Step 5: Run the tests**

```bash
cd apps/lab && pnpm vitest run --project chromium src/console/ValueKnob.browser.test.tsx
```

Expected: PASS, twelve tests.

- [ ] **Step 6: Falsify three of them**

- Change `onChange` to `set(spec.key, Number(event.currentTarget.value))` (write per keystroke): the "typing a fraction" test must go red at the first assertion.
- Delete `event.preventDefault()` from the Enter branch: "returns focus to the number" and "a committed value out of range is clamped" must both go red, with the entry back on screen holding what was typed. This is the one an earlier draft of this plan shipped.
- Delete the `else if (edited.current)` branch of the focus effect: the "returns focus to the number" test must go red with focus on `<body>`.

Restore all three. Do **not** add a guard for "the blur that unmounting fires" — measure first: React does not deliver it, and a flag waiting for it stays armed and eats the next commit.

- [ ] **Step 7: Commit**

```bash
git add apps/lab/src/console/ValueKnob.tsx apps/lab/src/console/ValueKnob.browser.test.tsx apps/lab/src/design/console.css
git commit -m "Draw a numeric knob with a draft-and-commit entry"
```

---

### Task 8: `ChoiceKnob` — the two knobs whose values are words

**Files:**
- Create: `apps/lab/src/console/ChoiceKnob.tsx`
- Create: `apps/lab/src/console/ChoiceKnob.browser.test.tsx`
- Modify: `apps/lab/src/design/console.css`

**Interfaces:**
- Produces: `<ChoiceKnob spec={spec} choices={spec.control.choices} />`.

Exactly two knobs have `control.kind === 'choice'`: `trapBias` (avoid/off/seek) and `giantSpacing` (off/2/3). The words are the CLI's own vocabulary, and `dict.choiceText(key, word)` translates them.

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/console/ChoiceKnob.browser.test.tsx`:

```tsx
import { PARAM_SPEC } from '@arrowz/engine'
import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { ChoiceKnob } from './ChoiceKnob'

const trapBias = PARAM_SPEC.find((s) => s.key === 'trapBias')
if (!trapBias || trapBias.control?.kind !== 'choice') throw new Error('trapBias is no longer a choice knob')
const choices = trapBias.control.choices

test('the knob offers exactly the words the flag takes', async () => {
  useStore.getState().params.reset()
  const screen = await render(<ChoiceKnob spec={trapBias} choices={choices} />)
  const select = screen.getByRole('combobox', { name: /trap/i })
  await expect.element(select).toHaveValue('0')
  for (const choice of choices) {
    await expect.element(screen.getByRole('option', { name: choice.word })).toBeInTheDocument()
  }
})

test('choosing a word writes the number behind it', async () => {
  useStore.getState().params.reset()
  const screen = await render(<ChoiceKnob spec={trapBias} choices={choices} />)
  await userEvent.selectOptions(screen.getByRole('combobox'), '1')
  expect(useStore.getState().params.values.trapBias).toBe(1)
})

test('an inactive choice knob says why', async () => {
  useStore.getState().params.reset()
  const spacing = PARAM_SPEC.find((s) => s.key === 'giantSpacing')
  if (!spacing || spacing.control?.kind !== 'choice') throw new Error('giantSpacing is no longer a choice knob')
  const screen = await render(<ChoiceKnob spec={spacing} choices={spacing.control.choices} />)
  expect(screen.container.querySelector('.why')?.textContent).toContain('No effect:')
})

test('a choice knob still says what it does', async () => {
  useStore.getState().params.reset()
  const screen = await render(<ChoiceKnob spec={trapBias} choices={choices} />)
  // There is no slider here, so this paragraph is the knob's only description.
  expect(screen.container.querySelector('.why')?.textContent).toContain(trapBias.help.slice(0, 24))
})
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd apps/lab && pnpm vitest run --project chromium src/console/ChoiceKnob.browser.test.tsx
```

Expected: FAIL — no module `./ChoiceKnob`.

- [ ] **Step 3: Write it**

Create `apps/lab/src/console/ChoiceKnob.tsx`:

```tsx
import type { ParamSpec } from '@arrowz/engine'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'

/**
 * A knob whose values are a fixed list: the words its flag takes, in the
 * field's place. Two knobs are like this — `trapBias` and `giantSpacing` —
 * and the words come from `PARAM_SPEC`, so the console and the CLI cannot
 * drift apart.
 */
export function ChoiceKnob({
  spec,
  choices,
}: {
  spec: ParamSpec
  choices: readonly { value: number; word: string }[]
}) {
  const dict = useDictionary()
  const value = useStore((state) => state.params.values[spec.key])
  const broken = useStore((state) => state.params.broken[spec.key])
  const inactive = useStore((state) => state.params.inactive[spec.key])
  const set = useStore((state) => state.params.set)
  const { label, help } = dict.paramText(spec)
  const state = broken
    ? broken.map((v) => dict.violation(v)).join('; ')
    : inactive
      ? `${dict.t('inactivePrefix')}${dict.reason(inactive)}`
      : null
  // Same shape as ValueKnob: the description always shows, the state goes in
  // front of it. A choice knob has no slider, so this paragraph is the only
  // place either of them can appear.
  const why = state === null ? help : `${state}. ${help}`
  const whyId = `knob-${spec.key}-why`
  return (
    <div className={`fw-k choice${broken ? ' bad' : ''}${inactive ? ' off' : ''}`}>
      <div className="top">
        <label className="lab" htmlFor={`knob-${spec.key}`}>
          {label}
        </label>
        <select
          id={`knob-${spec.key}`}
          value={value}
          aria-describedby={whyId}
          onChange={(event) => set(spec.key, Number(event.currentTarget.value))}
        >
          {choices.map((choice) => (
            <option key={choice.word} value={choice.value}>
              {dict.choiceText(spec.key, choice.word)}
            </option>
          ))}
        </select>
      </div>
      <p className="why" id={whyId}>
        {why}
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Style it**

Append to `apps/lab/src/design/console.css`:

```css
/* The mock has no choice knob; this is its number treatment applied to a
   select, so the two kinds of knob sit on one grid without a seam. */
.fw-k select {
  flex: none;
  max-width: 50%;
  height: 22px;
  padding: 0 4px;
  border: 1px solid var(--border);
  background: var(--void);
  color: var(--signal);
  font: inherit;
}
.fw-k.off select {
  color: var(--mist);
}
.fw-k.bad select {
  color: var(--error);
  border-color: var(--error);
}
```

- [ ] **Step 5: Run, falsify, commit**

```bash
cd apps/lab && pnpm vitest run --project chromium src/console/ChoiceKnob.browser.test.tsx
```

Expected: PASS, four tests. Falsify by hard-coding the option list to `['off']`: the first test must go red.

```bash
git add apps/lab/src/console/ChoiceKnob.tsx apps/lab/src/console/ChoiceKnob.browser.test.tsx apps/lab/src/design/console.css
git commit -m "Draw the two knobs whose values are words"
```

---

### Task 9: `StartKnob` — one control for the two knobs behind `--start`

**Files:**
- Create: `apps/lab/src/console/StartKnob.tsx`
- Create: `apps/lab/src/console/StartKnob.browser.test.tsx`

**Interfaces:**
- Consumes: `START`, `START_CHOICES`, `startChoiceOf`, `isStartChoice`, `type StartChoice` from `@arrowz/engine/command`; `ValueKnob` (Task 7); `params.setStart` (Task 2).
- Produces: `<StartKnob />`, which draws its own control plus the mix row.

One flag writes two knobs: `--start=layers|random|tunnels|R` sets `headBias` and `mix` together. Both stay in `PARAM_SPEC` — they are stored in the board file and hashed into the board id — so the panel builds one control where the first `surface: 'start'` spec would have stood and skips the second (Task 10).

The mix row is an ordinary `ValueKnob` with **`START.mix` as its bounds**, not `spec.min`/`spec.max`: the knob's range is −1..0.7, but only **0.3..0.7** is a share `--start` can spell (`START.mix`, from `MIX_SHARE` at `engine.ts:2369`, which the `startPair` rule enforces). It is visible only while the control stands on `mixing`.

This is also why Task 7's `commit` clamps to the passed `bounds` before calling `set`: the old lab guards the same thing with a dedicated `change` handler on the share field (`lab-page.ts:280-284`), and without it a typed `0.1` is stored unchanged, prints `--start=0.1`, and is refused by `carve` — while a typed `-0.5` flips `startChoiceOf` to `random` and hides the row with the bad value still in the store.

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/console/StartKnob.browser.test.tsx`:

```tsx
import { MIX_START, START } from '@arrowz/engine/command'
import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { StartKnob } from './StartKnob'

const params = () => useStore.getState().params

test('the control offers the four words and follows the two knobs', async () => {
  params().reset()
  const screen = await render(<StartKnob />)
  const select = screen.getByRole('combobox', { name: /piece start/i })
  for (const word of ['layers', 'random', 'tunnels', 'mixing']) {
    await expect.element(screen.getByRole('option', { name: word })).toBeInTheDocument()
  }
  // The defaults are headBias 0 and mix -1, which `--start` spells `random`
  // (command.ts:72) — not `layers`, whose headBias is -1.
  await expect.element(select).toHaveValue('random')
})

test('choosing a word writes both knobs behind the flag', async () => {
  params().reset()
  const screen = await render(<StartKnob />)
  await userEvent.selectOptions(screen.getByRole('combobox'), 'tunnels')
  expect(params().values.headBias).toBe(START.words.tunnels.headBias)
  expect(params().values.mix).toBe(START.words.tunnels.mix)
})

test('the share row appears only on mixing, and only inside what --start spells', async () => {
  params().reset()
  const screen = await render(<StartKnob />)
  expect(screen.container.querySelectorAll('#knob-mix')).toHaveLength(0)
  await userEvent.selectOptions(screen.getByRole('combobox'), 'mixing')
  expect(params().values.mix).toBe(MIX_START)
  const share = screen.container.querySelector('#knob-mix')
  // The knob's own range starts at -1; only 0.3..0.7 is a share.
  expect(share?.getAttribute('min')).toBe(String(START.mix.min))
  expect(share?.getAttribute('max')).toBe(String(START.mix.max))
})

test('switching away and back keeps a share the flag can still spell', async () => {
  params().reset()
  const screen = await render(<StartKnob />)
  await userEvent.selectOptions(screen.getByRole('combobox'), 'mixing')
  params().set('mix', 0.6)
  await userEvent.selectOptions(screen.getByRole('combobox'), 'layers')
  await userEvent.selectOptions(screen.getByRole('combobox'), 'mixing')
  expect(params().values.mix).toBe(MIX_START)
  // layers wrote mix = -1, which is not a share, so mixing takes the middle
  // again rather than printing a command the CLI refuses.
})
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd apps/lab && pnpm vitest run --project chromium src/console/StartKnob.browser.test.tsx
```

Expected: FAIL — no module `./StartKnob`.

- [ ] **Step 3: Write it**

Create `apps/lab/src/console/StartKnob.tsx`:

```tsx
import { PARAM_SPEC, type ParamSpec } from '@arrowz/engine'
import { isStartChoice, START, START_CHOICES, startChoiceOf } from '@arrowz/engine/command'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { ValueKnob } from './ValueKnob'

/**
 * Read once, at module load. A `const` narrowed by a module-level `if` does not
 * stay narrowed inside a function declaration, so the check and the binding are
 * one expression.
 */
const MIX_SPEC: ParamSpec = (() => {
  const spec = PARAM_SPEC.find((s) => s.key === 'mix')
  if (!spec) throw new Error('PARAM_SPEC has no mix')
  return spec
})()

/**
 * The composite `--start` control. One flag writes `headBias` and `mix`, so
 * the panel shows one control in their place: the three words the CLI takes,
 * plus `mixing`, which reveals the share as a knob of its own.
 *
 * The share row is bounded by `START.mix`, not by the knob's own range: the
 * knob runs from −1 (a word, not a share) while only 0.3..0.7 is spellable.
 */
export function StartKnob() {
  const dict = useDictionary()
  // The *word*, not the values object. `values` is rebuilt on every commit, so
  // subscribing to it would rerender this control — and the share row under it
  // — on every tick of every slider in the group, which is the one thing the
  // per-key indexes exist to prevent.
  const choice = useStore((state) => startChoiceOf(state.params.values))
  const setStart = useStore((state) => state.params.setStart)
  const start = dict.d.start
  return (
    <>
      <div className="fw-k choice">
        <div className="top">
          <label className="lab" htmlFor="knob-start">
            {start.label}
          </label>
          <select
            id="knob-start"
            value={choice}
            aria-describedby="knob-start-why"
            onChange={(event) => {
              const word = event.currentTarget.value
              // The options are built from the CLI's own vocabulary, so
              // anything else is a bug in this file.
              if (!isStartChoice(word)) throw new Error(`unknown start choice ${word}`)
              setStart(word)
            }}
          >
            {START_CHOICES.map((word) => (
              <option key={word} value={word}>
                {start.options[word]}
              </option>
            ))}
          </select>
        </div>
        <p className="why" id="knob-start-why">
          {start.help}
        </p>
      </div>
      {choice === 'mixing' ? <ValueKnob spec={MIX_SPEC} bounds={START.mix} /> : null}
    </>
  )
}
```

- [ ] **Step 4: Run the tests**

```bash
cd apps/lab && pnpm vitest run --project chromium src/console/StartKnob.browser.test.tsx
```

Expected: PASS, four tests.

- [ ] **Step 5: Falsify the bounds test**

Drop `bounds={START.mix}` from the `ValueKnob`. The third test must go red on `min`, which would otherwise be `-1`, and the "value outside the passed bounds" test in Task 7 must go red too — a share the CLI refuses, printed into a command that looks valid and stored beside the board.

- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/console/StartKnob.tsx apps/lab/src/console/StartKnob.browser.test.tsx
git commit -m "Show the two knobs behind --start as the one control the flag is"
```

---

### Task 10: `Knob` and `KnobPanel` — one group on screen

**Files:**
- Create: `apps/lab/src/console/Knob.tsx`
- Create: `apps/lab/src/console/KnobPanel.tsx`
- Create: `apps/lab/src/console/KnobPanel.browser.test.tsx`
- Modify: `apps/lab/src/design/console.css`

**Interfaces:**
- Consumes: `ValueKnob`, `ChoiceKnob`, `StartKnob`, `tabId`/`panelId` (Task 5).
- Produces: `<Knob spec={spec} />`; `<KnobPanel group={group} />`, a `role="tabpanel"` with `id={panelId(group)}`.

The traversal rule is per knob, not global (§5.1): the panel walks its group's specs in `PARAM_SPEC` order, builds the start control where the **first** `surface: 'start'` spec would have stood, and skips the second. Both start knobs live in the `difficulty` group, so only that panel is affected — but the rule is written once, in the panel, so a future surface flag does not have to rediscover it.

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/console/KnobPanel.browser.test.tsx`:

```tsx
import { PARAM_SPEC } from '@arrowz/engine'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { KnobPanel } from './KnobPanel'

const params = () => useStore.getState().params

test('a panel draws every knob of its group', async () => {
  params().reset()
  const screen = await render(<KnobPanel group="shape" />)
  // Four knobs in shape: pStraight, wLateral, warns, anticoil.
  expect(screen.container.querySelectorAll('.fw-k')).toHaveLength(4)
  await expect.element(screen.getByText('coiling penalty')).toBeVisible()
})

test('the panel names its group and is the tabpanel the rail points at', async () => {
  params().reset()
  const screen = await render(<KnobPanel group="skeleton" />)
  const panel = screen.getByRole('tabpanel')
  await expect.element(panel).toHaveAttribute('id', 'rail-panel-skeleton')
  await expect.element(panel).toHaveAttribute('aria-labelledby', 'rail-tab-skeleton')
})

test('the difficulty group shows one start control, not two knobs', async () => {
  params().reset()
  const screen = await render(<KnobPanel group="difficulty" />)
  // headBias and mix share --start, so the group's five specs become four
  // controls: the start control, trapBias, probe, probeLen.
  await expect.element(screen.getByRole('combobox', { name: /piece start/i })).toBeVisible()
  expect(screen.container.querySelectorAll('#knob-headBias')).toHaveLength(0)
  expect(screen.container.querySelectorAll('#knob-mix')).toHaveLength(0)
})

test('every knob in PARAM_SPEC is reachable from exactly one panel', async () => {
  params().reset()
  const groups = [...new Set(PARAM_SPEC.map((s) => s.group))]
  const drawn = new Set<string>()
  for (const group of groups) {
    const screen = await render(<KnobPanel group={group} />)
    for (const el of screen.container.querySelectorAll('[id^="knob-"]')) {
      const key = el.id.replace('knob-', '')
      expect(drawn.has(key)).toBe(false)
      drawn.add(key)
    }
  }
  // headBias and mix are behind the start control; mix appears only while
  // mixing is chosen, and the defaults spell `random`.
  const expected = PARAM_SPEC.filter((s) => s.surface !== 'start').map((s) => s.key)
  for (const key of expected) expect(drawn.has(key)).toBe(true)
})

test('a group with help prints it under the heading', async () => {
  params().reset()
  const screen = await render(<KnobPanel group="closing" />)
  await expect.element(screen.getByText(/no legal carve/)).toBeVisible()
})
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd apps/lab && pnpm vitest run --project chromium src/console/KnobPanel.browser.test.tsx
```

Expected: FAIL — no module `./KnobPanel`.

- [ ] **Step 3: Write the dispatcher**

Create `apps/lab/src/console/Knob.tsx`:

```tsx
import type { ParamSpec } from '@arrowz/engine'
import { ChoiceKnob } from './ChoiceKnob'
import { ValueKnob } from './ValueKnob'

/**
 * A knob, drawn as `PARAM_SPEC` says. There is no boolean knob in the table —
 * the mock's switches are element attributes, not generator parameters — so
 * there are exactly two shapes here, and the composite start control is the
 * panel's business, not this dispatcher's.
 */
export function Knob({ spec }: { spec: ParamSpec }) {
  if (spec.control?.kind === 'choice') return <ChoiceKnob spec={spec} choices={spec.control.choices} />
  return <ValueKnob spec={spec} />
}
```

- [ ] **Step 4: Write the panel**

Create `apps/lab/src/console/KnobPanel.tsx`:

```tsx
import { type ParamGroup, PARAM_SPEC } from '@arrowz/engine'
import { useDictionary } from '../i18n'
import { panelId, tabId } from './GroupRail'
import { Knob } from './Knob'
import { StartKnob } from './StartKnob'

/** A group's knobs, in table order. */
function specsOf(group: ParamGroup) {
  return PARAM_SPEC.filter((spec) => spec.group === group)
}

/**
 * One group of knobs. The two knobs behind `--start` share one control, built
 * where the first of them would have stood and skipped for the second — the
 * rule is per knob, so a group with a surface flag in the middle still lays
 * out in table order.
 */
export function KnobPanel({ group }: { group: ParamGroup }) {
  const dict = useDictionary()
  // Five of the six groups have help; `board` has none, and the section is
  // typed by its own keys rather than by ParamGroup.
  const help = (dict.d.groupHelp as Partial<Record<ParamGroup, string>>)[group]
  const specs = specsOf(group)
  // Computed before the JSX, not tracked with a `let` the map mutates:
  // `react-hooks/immutability` rejects reassigning a variable during render,
  // and it is right to — the map is not guaranteed to run once per render.
  const firstStart = specs.findIndex((spec) => spec.surface === 'start')
  // No `tabIndex={0}` on the panel: APG gives a tabpanel a tab stop only when
  // it has no focusable content, and this one is nothing but focusable content.
  return (
    <div className="fw-knobs" role="tabpanel" id={panelId(group)} aria-labelledby={tabId(group)}>
      <div className="fw-khd">
        <b>{dict.d.groups[group]}</b>
        {help === undefined ? null : <span>{help}</span>}
      </div>
      <div className="fw-grid">
        {specs.map((spec, at) => {
          if (spec.surface !== 'start') return <Knob key={spec.key} spec={spec} />
          // The control stands where the first of the pair would have; the
          // second spec draws nothing.
          return at === firstStart ? <StartKnob key="start" /> : null
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Style it**

Append to `apps/lab/src/design/console.css`:

```css
.fw-knobs {
  background: var(--void);
  padding: 14px 20px 18px;
  min-height: 0;
  overflow-y: auto;
}
.fw-khd {
  display: flex;
  align-items: baseline;
  gap: 14px;
  padding-bottom: 10px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.fw-khd b {
  font-weight: 400;
  font-size: 13px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink);
}
.fw-khd span {
  color: var(--ash);
}
.fw-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 0 24px;
  align-content: start;
}
```

- [ ] **Step 6: Run the tests**

```bash
cd apps/lab && pnpm vitest run --project chromium src/console/KnobPanel.browser.test.tsx
```

Expected: PASS, five tests.

- [ ] **Step 7: Falsify the start test**

Change `at === firstStart` to `true`, so both specs draw a control. The third test must go red with two start comboboxes; the fourth must stay green, which tells you the fourth does not cover this — the redundancy is deliberate.

- [ ] **Step 8: Commit**

```bash
git add apps/lab/src/console/Knob.tsx apps/lab/src/console/KnobPanel.tsx apps/lab/src/console/KnobPanel.browser.test.tsx apps/lab/src/design/console.css
git commit -m "Lay out one group of knobs per panel"
```

---

### Task 11: `ViewPanel` — the nine preview fields, and the board that follows them

**Files:**
- Create: `apps/lab/src/console/ViewPanel.tsx`
- Create: `apps/lab/src/console/viewFields.ts`
- Create: `apps/lab/src/console/viewFields.test.ts`
- Create: `apps/lab/src/console/ViewPanel.browser.test.tsx`
- Modify: `apps/lab/src/stage/Stage.tsx`
- Modify: `apps/lab/src/design/console.css`

**Interfaces:**
- Consumes: `view.slice` (Task 3), `boardViewOf` from `@arrowz/board-element`, `VIEW_RANGE` from `@arrowz/engine/command`.
- Produces: `<ViewPanel />` (`role="tabpanel"`, `id="rail-panel-preview"`); `VIEW_FIELDS`, the table of the four number fields with their bounds and their dictionary keys.

Two things happen here. The panel gives the nine fields a surface, and `Stage` starts reading them, so editing a field **redraws without generating** — the behaviour the §2.2 table ends on, and the one a port from the mock would lose, because the mock has no preview fields at all.

The number fields keep the old lab's bounds (Ruling 11), and `viewFields.test.ts` is the successor to `carve.test.ts:456-480`: that test reads `lab.html`, which PR 8 deletes, and its subject — "no surface offers a view number the CLI would refuse" — outlives the file it reads.

- [ ] **Step 1: Write the failing bounds test**

Create `apps/lab/src/console/viewFields.test.ts`:

```ts
import { VIEW_RANGE } from '@arrowz/engine/command'
import { expect, test } from 'vitest'
import { VIEW_FIELDS } from './viewFields'
// `ViewNumber` comes from the root export; `VIEW_RANGE` from /command.

test('no field offers a number the CLI would refuse', () => {
  // The successor to carve.test.ts:456-480, which checks the same thing
  // against lab.html — a file PR 8 deletes.
  for (const field of VIEW_FIELDS) {
    const range = VIEW_RANGE[field.field]
    expect(field.min).toBeGreaterThanOrEqual(range.min)
    expect(field.max).toBeLessThanOrEqual(range.max)
    expect(field.min).toBeLessThan(field.max)
  }
})

test('the table covers every number the view has', () => {
  expect(VIEW_FIELDS.map((f) => f.field).sort()).toEqual(['cell', 'headHeight', 'headWidth', 'stroke', 'top'])
})
```

- [ ] **Step 2: Run and watch it fail, then write the table**

```bash
cd apps/lab && pnpm vitest run --project node src/console/viewFields.test.ts
```

Create `apps/lab/src/console/viewFields.ts`:

```ts
import type { ViewNumber } from '@arrowz/engine'
import type { Dictionary, UiKey } from '@arrowz/engine/i18n'

/**
 * A dictionary key whose entry is a plain string. `dict.t` is generic over
 * every key, and some entries are formatters taking arguments, so a field
 * typed as plain `UiKey` would not type-check at the call site.
 */
type PlainUiKey = { [K in UiKey]: Dictionary['ui'][K] extends string ? K : never }[UiKey]

export interface ViewField {
  field: ViewNumber
  /** The dictionary key of the label, and of the help paragraph where there is one. */
  label: PlainUiKey
  help?: PlainUiKey
  min: number
  max: number
  step: number
}

/**
 * The four (five, with `top`) number fields of the preview, with the bounds
 * the old lab gives them — narrower than `VIEW_RANGE` on purpose: the range
 * is what the CLI accepts, these are what a person is offered. Typing past
 * them still works and still clamps, exactly as it does today.
 */
export const VIEW_FIELDS: readonly ViewField[] = [
  { field: 'cell', label: 'cellLabel', help: 'cellHelp', min: 1, max: 40, step: 1 },
  { field: 'stroke', label: 'strokeLabel', min: 0.2, max: 0.9, step: 0.05 },
  { field: 'headWidth', label: 'headWidthLabel', min: 0, max: 0.9, step: 0.05 },
  { field: 'headHeight', label: 'headHeightLabel', help: 'headHelp', min: 0.1, max: 1, step: 0.05 },
  { field: 'top', label: 'topLabel', min: 1, max: 50, step: 1 },
]
```

Expected after writing: PASS, two tests.

- [ ] **Step 3: Write the failing panel test**

Create `apps/lab/src/console/ViewPanel.browser.test.tsx`:

```tsx
import { beforeEach, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { ViewPanel } from './ViewPanel'

const view = () => useStore.getState().view

// The store outlives a test; every file that writes it puts it back.
beforeEach(() => {
  view().setNumber('cell', '12')
  view().setNumber('stroke', '0.5')
  view().setNumber('top', '5')
  if (!view().rounded) view().toggle('rounded')
  if (view().colored) view().toggle('colored')
})

test('the panel draws all nine preview controls', async () => {
  const screen = await render(<ViewPanel />)
  expect(screen.container.querySelectorAll('input[type="number"]')).toHaveLength(5)
  expect(screen.container.querySelectorAll('[role="switch"]')).toHaveLength(4)
})

test('a switch is a switch, not a checkbox pretending to be one', async () => {
  const screen = await render(<ViewPanel />)
  const rounded = screen.getByRole('switch', { name: /round the corners/i })
  await expect.element(rounded).toHaveAttribute('aria-checked', 'true')
  await rounded.click()
  expect(view().rounded).toBe(false)
})

test('a number field commits on blur, clamped to what the CLI takes', async () => {
  const screen = await render(<ViewPanel />)
  const cell = screen.getByRole('spinbutton', { name: /cell size/i })
  await userEvent.fill(cell, '300')
  await userEvent.tab()
  // 200 is the CLI's ceiling; the field's own max of 40 only stops the arrows.
  expect(view().cell).toBe(200)
  await expect.element(cell).toHaveValue(200)
})

test('a field being typed into is not rewritten under the cursor', async () => {
  const screen = await render(<ViewPanel />)
  const stroke = screen.getByRole('spinbutton', { name: /stroke/i })
  await stroke.click()
  // Digit by digit, the way a person types: after `0.` a controlled number
  // input reads back the empty string, and React would put the default in the
  // box mid-word. The store must not have moved yet either.
  // ControlOrMeta, not Control: on macOS Ctrl+A moves the caret to the line
  // start, so the field would read `080.5` and this test would pass on CI and
  // fail on the machine it was written on.
  await userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}0.')
  expect(view().stroke).toBe(0.5)
  await userEvent.keyboard('8{Enter}')
  expect(view().stroke).toBe(0.8)
})

test('the panel is the tabpanel the rail points at', async () => {
  const screen = await render(<ViewPanel />)
  await expect.element(screen.getByRole('tabpanel')).toHaveAttribute('id', 'rail-panel-preview')
  await expect.element(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'rail-tab-preview')
})
```

- [ ] **Step 4: Write the panel**

Create `apps/lab/src/console/ViewPanel.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import type { ViewFlag } from '../state/view.slice'
import { panelId, tabId } from './GroupRail'
import { VIEW_FIELDS, type ViewField } from './viewFields'

/** The four flags, in the order the old lab lists them. */
const FLAGS: readonly { flag: ViewFlag; label: 'rounded' | 'colored' | 'hilite' | 'voids' }[] = [
  { flag: 'rounded', label: 'rounded' },
  { flag: 'colored', label: 'colored' },
  { flag: 'hilite', label: 'hilite' },
  { flag: 'voids', label: 'voids' },
]

/**
 * One preview number. Uncontrolled on purpose, and it is the same reason the
 * old lab is: a controlled `type="number"` rewrites its own value, and a
 * half-typed `0.` reads back as the empty string — so React would put the
 * default into the box under the cursor. The field owns its text while it is
 * being typed into; the store owns it the rest of the time, which is exactly
 * the `document.activeElement` guard the old lab uses for its second seed
 * field (`lab-page.ts:679-681`), kept where it is actually needed.
 */
function ViewNumberField({ field }: { field: ViewField }) {
  const dict = useDictionary()
  const value = useStore((state) => state.view[field.field])
  const setNumber = useStore((state) => state.view.setNumber)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const node = ref.current
    if (node && document.activeElement !== node) node.value = String(value)
  }, [value])

  const commit = () => {
    const node = ref.current
    if (!node) return
    setNumber(field.field, node.value)
    // The store may have clamped; show what it stored, not what was typed.
    node.value = String(useStore.getState().view[field.field])
  }

  return (
    <div className="fw-k">
      <div className="top">
        <label className="lab" htmlFor={`view-${field.field}`}>
          {dict.t(field.label)}
        </label>
        <input
          ref={ref}
          type="number"
          id={`view-${field.field}`}
          className="num"
          min={field.min}
          max={field.max}
          step={field.step}
          defaultValue={String(value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
          }}
        />
      </div>
      {field.help === undefined ? null : <p className="why">{dict.t(field.help)}</p>}
    </div>
  )
}

/**
 * The mock's *element* section: the nine preview fields. They are not knobs —
 * the engine never sees them — so they carry no violation and no inactive
 * reason, and editing one redraws the board without generating (§2.2).
 *
 * A field commits on blur and on Enter, through `viewNumberOf`: an empty or
 * unreadable field is the default, and anything past what the CLI takes is
 * clamped in.
 */
export function ViewPanel() {
  const dict = useDictionary()
  const view = useStore((state) => state.view)
  return (
    <div className="fw-knobs" role="tabpanel" id={panelId('preview')} aria-labelledby={tabId('preview')}>
      <div className="fw-khd">
        <b>{dict.t('preview')}</b>
      </div>
      <div className="fw-grid">
        {VIEW_FIELDS.map((field) => (
          <ViewNumberField key={field.field} field={field} />
        ))}
        {FLAGS.map(({ flag, label }) => (
          <div className="fw-k" key={flag}>
            <div className="row">
              <span className="lab" id={`view-${flag}-label`}>
                {dict.t(label)}
              </span>
              <button
                type="button"
                className="fw-sw"
                role="switch"
                aria-checked={view[flag]}
                aria-labelledby={`view-${flag}-label`}
                onClick={() => view.toggle(flag)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Style the switch**

Append the mock's switch rules to `apps/lab/src/design/console.css`, verbatim (they encode Switch.jsx's geometry: 44×26 track, 20px handle, 18px travel):

```css
.fw-k .row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.fw-sw {
  justify-self: end;
  position: relative;
  flex: none;
  width: 44px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--ash);
  border-radius: 999px;
  background: var(--surface);
  cursor: pointer;
}
.fw-sw::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: var(--ash);
  transition: transform 120ms cubic-bezier(0.2, 0, 0, 1), background 120ms cubic-bezier(0.2, 0, 0, 1);
}
.fw-sw[aria-checked='true'] {
  background: var(--signal);
  border-color: transparent;
}
.fw-sw[aria-checked='true']::after {
  background: var(--void);
  transform: translateX(18px);
}
/* A preview number is a plain field, not the knob's scrubbable value; it
   keeps the knob's colour and loses the pointer affordance. */
.fw-k input[type='number'].num {
  width: 72px;
  padding: 0 4px;
  border: 1px solid var(--border);
  background: var(--void);
  color: var(--signal);
  font: inherit;
  text-align: right;
}
```

- [ ] **Step 6: Make the board follow the fields**

Rewrite `apps/lab/src/stage/Stage.tsx`:

```tsx
import { boardViewOf } from '@arrowz/board-element'
import { useMemo } from 'react'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'
import { BoardCanvas } from './BoardCanvas'

/**
 * 70px + 1fr: the mock's run rail and the board beside it. The rail is empty
 * until the filmstrip fills it (PR 7); the column stays, so the board's width
 * does not move when it arrives.
 *
 * The element's view is memoised on the *slice's* identity, not rebuilt per
 * render: `run.progressed()` replaces `state.run` and leaves `state.view`
 * alone, so a run's twenty progress messages reassign nothing on the element,
 * while editing a preview field redraws the board without generating.
 */
export function Stage() {
  const board = useStore((state) => state.run.board)
  const view = useStore((state) => state.view)
  const elementView = useMemo(() => boardViewOf(viewOf(view), view.voids), [view])
  return (
    <div className="fw-stage">
      <div className="fw-runs" />
      <div className="fw-boardwrap">
        <div className="fw-board">
          <BoardCanvas board={board} view={elementView} interactive={false} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Write the redraw test**

Create `apps/lab/src/stage/Stage.browser.test.tsx` — its own file, because `BoardCanvas.browser.test.tsx` is about the `@lit/react` wrapper and these two tests are about the memo:

```tsx
import { defaultParams } from '@arrowz/engine'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { Stage } from './Stage'

/**
 * A parent that rerenders on every run message. Without it the second test
 * cannot fail: `Stage` alone has nothing above it to rerender, so the memo is
 * never asked the question the test is about.
 */
function Probe() {
  useStore((state) => state.run.phase)
  useStore((state) => state.run.progress)
  return <Stage />
}

const boardEl = (container: HTMLElement) => container.querySelector('arrowz-board')

test('editing a preview field redraws the board without generating', async () => {
  const screen = await render(<Probe />)
  const element = boardEl(screen.container)
  const before = element?.view
  useStore.getState().view.toggle('colored')
  await expect.poll(() => element?.view?.colored).toBe(true)
  // The run slice never moved: no worker was started.
  expect(useStore.getState().run.phase).toBe('idle')
  expect(element?.view).not.toBe(before)
  useStore.getState().view.toggle('colored')
})

test('a progress message does not reassign the element view', async () => {
  const screen = await render(<Probe />)
  const element = boardEl(screen.container)
  const before = element?.view
  useStore.getState().run.started(defaultParams())
  useStore.getState().run.progressed({ pieces: 1, remaining: 9, backtracks: 0, ms: 12, total: 10 })
  // Let the rerender the probe just subscribed to actually happen.
  await expect.poll(() => useStore.getState().run.progress?.pieces).toBe(1)
  expect(element?.view).toBe(before)
  useStore.getState().run.reset()
})
```

- [ ] **Step 8: Run everything in the console and the stage**

```bash
cd apps/lab && pnpm vitest run --project node src/console/viewFields.test.ts && pnpm vitest run --project chromium src/console src/stage
```

If `src/console/ViewPanel.browser.test.tsx` and `src/stage/Stage.browser.test.tsx` disagree about `colored`, the culprit is store state leaking between files; each of them restores what it toggles, and that is not optional.

Expected: PASS.

- [ ] **Step 9: Falsify the memo test**

Change `useMemo`'s dependency array to `[view.stroke]`: the redraw test must go red for `colored`. Then drop the memo entirely and build the object inline: the "progress does not reassign" test must go red, **and check that it does** — an earlier draft of this plan had this test passing either way, because it rendered `Stage` with no parent to rerender it and asserted synchronously. Restore. These two tests are a pair: one says the board follows the fields, the other says it follows nothing else.

- [ ] **Step 10: Commit**

```bash
git add apps/lab/src/console apps/lab/src/stage apps/lab/src/design/console.css
git commit -m "Give the preview fields a panel and let the board follow them"
```

---

### Task 12: `Console` — the rail and the panel, mounted in the lab route

**Files:**
- Create: `apps/lab/src/console/Console.tsx`
- Modify: `apps/lab/src/routes/LabRoute.tsx`
- Modify: `apps/lab/src/routes/LabRoute.browser.test.tsx`
- Modify: `apps/lab/src/design/console.css`

**Interfaces:**
- Consumes: `GroupRail`, `KnobPanel`, `ViewPanel`, `ui.slice`.
- Produces: `<Console />`, mounted under the stage inside the lab's tabpanel.

- [ ] **Step 1: Write the failing test**

Append to `apps/lab/src/routes/LabRoute.browser.test.tsx`:

```tsx
test('the lab route shows the console under the stage', async () => {
  const screen = await mountApp()
  await expect.element(screen.getByRole('tablist', { name: 'Parameter groups' })).toBeVisible()
  await expect.element(screen.getByRole('tabpanel', { name: 'board' })).toBeVisible()
})

test('picking a rail entry replaces the panel', async () => {
  const screen = await mountApp()
  await screen.getByRole('tab', { name: 'skeleton', exact: true }).click()
  await expect.element(screen.getByText('number of skeleton pieces (0 = no skeleton)')).toBeVisible()
  await screen.getByRole('tab', { name: 'Preview', exact: true }).click()
  await expect.element(screen.getByRole('switch', { name: /round the corners/i })).toBeVisible()
})
```

Two things about those queries. The helper is `mountApp()` and it is **async** (`LabRoute.browser.test.tsx:13`), so it is awaited. And every rail query names its tab exactly: the route strip in the same document has a tab called "Saved boards", so `{ name: /board/ }` resolves to two elements and Playwright's strict mode throws. (`getByRole('tabpanel', { name: 'board' })` is safe — only one panel is called that.)

- [ ] **Step 2: Run and watch it fail**

```bash
cd apps/lab && pnpm vitest run --project chromium src/routes/LabRoute.browser.test.tsx
```

Expected: FAIL — no tablist named "Parameter groups".

- [ ] **Step 3: Write the console**

Create `apps/lab/src/console/Console.tsx`:

```tsx
import { useStore } from '../state/store'
import { GroupRail } from './GroupRail'
import { KnobPanel } from './KnobPanel'
import { ViewPanel } from './ViewPanel'

/**
 * The mock's console with two tracks instead of three: the run column is
 * lifted above the console so both consoles can share one instance (§5.1),
 * and it arrives in the next PR.
 */
export function Console() {
  const entry = useStore((state) => state.ui.entry)
  return (
    <div className="fw-console">
      <GroupRail />
      {entry === 'preview' ? <ViewPanel /> : <KnobPanel group={entry} />}
    </div>
  )
}
```

- [ ] **Step 4: Mount it**

In `apps/lab/src/routes/LabRoute.tsx`, wrap the stage and the console in the mock's lab grid:

```tsx
      <section id="lab-panel" role="tabpanel" aria-labelledby="tab-lab-panel" tabIndex={0} className="fw-view">
        <div className="fw-bar">
          <button type="button" className="fw-go" onClick={() => generator.start(params)} disabled={running}>
            {dict.t('generate')}
          </button>
          <RunStatusBar />
        </div>
        <div className="fw-lab">
          <Stage />
          <Console />
        </div>
      </section>
```

and append the grid to `console.css`:

```css
/* A finger needs more than a 12px track and a text-height number. `shell.css`
   raises the tabs and Generate the same way (spec §7.2). */
@media (pointer: coarse) {
  .fw-k .bar,
  .fw-k .bar input[type='range'] {
    height: 24px;
  }
  .fw-k .bar input[type='range']::-webkit-slider-runnable-track {
    margin-top: 11px;
  }
  .fw-k .bar input[type='range']::-webkit-slider-thumb {
    width: 4px;
    height: 24px;
    margin-top: -11px;
  }
  .fw-k .bar u {
    top: 11px;
  }
  .fw-k .num,
  .fw-k select {
    min-height: 32px;
  }
}

/* The stage takes what it needs, the console the rest, and the board never
   collapses below the height at which it is a picture rather than a strip. */
.fw-lab {
  display: grid;
  grid-template-rows: minmax(180px, 1fr) minmax(0, 1fr);
  min-height: 0;
}
@media (max-width: 900px) {
  .fw-console {
    grid-template-columns: 150px minmax(0, 1fr);
  }
}
```

- [ ] **Step 5: Run the route tests**

```bash
cd apps/lab && pnpm vitest run --project chromium src/routes/LabRoute.browser.test.tsx
```

Expected: PASS, including the tests PR 2 wrote for this file.

- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/console/Console.tsx apps/lab/src/routes/LabRoute.tsx apps/lab/src/routes/LabRoute.browser.test.tsx apps/lab/src/design/console.css
git commit -m "Mount the console under the stage"
```

---

### Task 13: The violations list, and a Generate that says why it is off

**Files:**
- Create: `apps/lab/src/console/Violations.tsx`
- Create: `apps/lab/src/console/Violations.browser.test.tsx`
- Modify: `apps/lab/src/routes/LabRoute.tsx`
- Modify: `apps/lab/src/design/console.css`

**Interfaces:**
- Produces: `<Violations />`, a region with `id="violations"`.

**Ruling 7 applies:** the list sits under the console, not inside the knob panel, because one group is on screen at a time and a violation in a group you are not looking at still has to be readable.

A run refuses to start while a rule is violated (§2.2): Generate is disabled and the reasons are listed. The button keeps the old lab's plain `disabled` and its `title` — it does **not** get `aria-describedby`, because a disabled button cannot be focused and the description would be reachable only in a screen reader's browse mode. Making it reachable means `aria-disabled` on a focusable button with a no-op click, which is a behaviour change the old lab does not have; it belongs with the run column in the next PR, where this button moves.

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/console/Violations.browser.test.tsx`:

```tsx
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { Violations } from './Violations'

const params = () => useStore.getState().params

test('nothing is shown while the settings are valid', async () => {
  params().reset()
  const screen = await render(<Violations />)
  expect(screen.container.querySelectorAll('#violations')).toHaveLength(0)
})

test('a violation is listed with its own text', async () => {
  params().reset()
  params().setMany({ wShort: 0.8, wMid: 0.8 })
  const screen = await render(<Violations />)
  await expect.element(screen.getByRole('region', { name: 'Settings outside the safe range' })).toBeVisible()
  expect(screen.container.querySelectorAll('#violations li').length).toBeGreaterThan(0)
})

test('a computed bound is named in the text, not left to the marker', async () => {
  params().reset()
  params().setMany({ W: 900, H: 900, pStraight: 0.6 })
  const screen = await render(<Violations />)
  // needViolation prints the number the board asks for.
  await expect.element(screen.getByText(/needs at least/)).toBeVisible()
})
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd apps/lab && pnpm vitest run --project chromium src/console/Violations.browser.test.tsx
```

Expected: FAIL — no module `./Violations`.

- [ ] **Step 3: Write it**

Create `apps/lab/src/console/Violations.tsx`:

```tsx
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'

/**
 * Every reason the run would be refused, in one place under the console. Not
 * inside the knob panel: the console shows one group at a time, so a problem
 * in `lengths` has to stay readable while `shape` is open (Ruling 7).
 */
export function Violations() {
  const dict = useDictionary()
  const violations = useStore((state) => state.params.violations)
  if (violations.length === 0) return null
  return (
    <section className="fw-note" id="violations" aria-labelledby="violations-title">
      <b id="violations-title">{dict.t('violationsTitle')}</b>
      <ul>
        {violations.map((violation, at) => (
          <li key={`${violation.kind}-${violation.kind === 'rule' ? violation.key : violation.key}-${at}`}>
            {dict.violation(violation)}
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 4: Wire the button to it**

In `apps/lab/src/routes/LabRoute.tsx`:

```tsx
  const blocked = useStore((state) => state.params.violations.length > 0)
  ...
          <button
            type="button"
            className="fw-go"
            onClick={start}
            disabled={running || blocked}
            title={blocked ? dict.t('generateBlocked') : undefined}
          >
```

and render `<Violations />` after `<Console />`, inside `.fw-lab`.

- [ ] **Step 5: Style it**

Append the mock's note treatment to `apps/lab/src/design/console.css`:

```css
.fw-note {
  padding: 12px;
  border: 1px solid var(--border);
  border-left: 2px solid var(--error);
  background: var(--graphite);
  color: var(--mist);
}
.fw-note b {
  font-weight: 400;
  color: var(--error);
}
.fw-note ul {
  margin: 6px 0 0;
  padding-left: 18px;
}
```

The mock's note is bordered in `--warn`; this one is `--error`, for the reason Task 7 states — warn is the rule bound, error is a refusal.

- [ ] **Step 6: Add the blocked-button test**

Append to `apps/lab/src/routes/LabRoute.browser.test.tsx`:

```tsx
test('Generate is refused while a rule is broken, and the reasons are on screen', async () => {
  const screen = await mountApp()
  useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
  const generate = screen.getByRole('button', { name: 'Generate' })
  await expect.element(generate).toBeDisabled()
  await expect.element(generate).toHaveAttribute('title', 'Fix the settings marked in red to generate')
  await expect.element(screen.getByRole('region', { name: 'Settings outside the safe range' })).toBeVisible()
  useStore.getState().params.reset()
  await expect.element(generate).toBeEnabled()
})
```

- [ ] **Step 7: Run, falsify, commit**

```bash
cd apps/lab && pnpm vitest run --project chromium src/console/Violations.browser.test.tsx src/routes/LabRoute.browser.test.tsx
```

Expected: PASS. Falsify by dropping `blocked` from `disabled`: the new route test must go red on `toBeDisabled`.

```bash
git add apps/lab/src/console/Violations.tsx apps/lab/src/console/Violations.browser.test.tsx apps/lab/src/routes/LabRoute.tsx apps/lab/src/routes/LabRoute.browser.test.tsx apps/lab/src/design/console.css
git commit -m "List every reason a run would be refused, and point Generate at them"
```

---

### Task 14: Generate runs what the console shows

**Files:**
- Modify: `apps/lab/src/App.tsx`
- Modify: `apps/lab/src/routes/LabRoute.tsx`
- Modify: `apps/lab/src/routes/LabRoute.browser.test.tsx`
- Modify: `apps/lab/src/shell/TopBar.tsx` (only if it still takes `W`/`H` as props)

This is the task the PR exists for. Until now the console has been writing to a slice nothing reads; here Generate starts a run from `params.values`, the saved board carries the view actually on screen, and the `params` prop that PR 2 threaded through the shell goes away (Ruling 10).

Three things change together, and they have to: leaving the prop in place beside the slice would give one value two sources, which is the shape of the bug §2.3 describes in the old lab.

- [ ] **Step 1: Write the failing test**

Rewrite the existing end-to-end test in `apps/lab/src/routes/LabRoute.browser.test.tsx` so it configures the run through the store:

```tsx
test('a board carved from the console reaches the element and the store', async () => {
  useStore.getState().params.reset()
  // The sizes this file already measured: 600×600, because PR 2 timed 200×200
  // at 228 ms and the engine emits no progress before 250 ms (see the comment
  // above the in-flight test). Migrating to the slice must not change them.
  useStore.getState().params.setMany({ W: 600, H: 600, seed: 9 })
  const screen = await mountApp()
  await screen.getByRole('button', { name: 'Generate' }).click()
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  expect(useStore.getState().run.params?.W).toBe(600)
})

test('the knobs on screen are the knobs the run used', async () => {
  useStore.getState().params.reset()
  const screen = await mountApp()
  // 'board' exactly: the route strip has a tab called "Saved boards".
  await screen.getByRole('tab', { name: 'board', exact: true }).click()
  // Commit a seed through the console itself, not through the store.
  await screen.getByRole('button', { name: /^seed:/ }).click()
  await userEvent.fill(screen.getByRole('textbox'), '42')
  await userEvent.keyboard('{Enter}')
  await screen.getByRole('button', { name: 'Generate' }).click()
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  expect(useStore.getState().run.params?.seed).toBe(42)
})
```

- [ ] **Step 2: Run and watch the second one fail**

```bash
cd apps/lab && pnpm vitest run --project chromium src/routes/LabRoute.browser.test.tsx
```

Expected: FAIL — the run still carries the prop's parameters (seed 7), not 42.

- [ ] **Step 3: Take the parameters from the slice**

In `apps/lab/src/routes/LabRoute.tsx`, drop the `params` prop and read the slice:

```tsx
export function LabRoute({ generator, hidden }: { generator: GeneratorHandle; hidden: boolean }) {
  const dict = useDictionary()
  const running = useStore((state) => state.run.phase === 'running')
  const blocked = useStore((state) => state.params.violations.length > 0)
  // Read at the click, not through a subscription: the button does not need
  // to rerender on every knob edit, and `getState()` is the value at the
  // moment the run starts — which is exactly what the run must use.
  const start = () => generator.start(useStore.getState().params.values)
```

- [ ] **Step 4: Take the view from the slice when saving**

In `apps/lab/src/App.tsx`, inside `useStoreSave`, replace `DEFAULT_VIEW`:

```ts
    // The stored view is the lab's view with top zeroed, as the old lab stores
    // it (`storeView()` in lab-page.ts): a saved board is a picture, and the
    // highlight is a reading aid for the run that just finished.
    const request = storeRequest(file, runParams, { ...viewOf(useStore.getState().view), top: 0 }, 'lab', {
```

Also fix two things in `LabRoute.browser.test.tsx` that the prop leaves behind: `mountApp()` resets only `run`, so add `useStore.getState().params.reset()` beside it — otherwise the 600×600 the in-flight test commits stays in the store and the StrictMode save test carves two 600×600 boards instead of the defaults. And the comment at `:179-181` still says "Both presses run the shell's one `DEFAULTS` object", which stops being true in this step.

In `App.tsx`, delete the `DEFAULTS` constant, the `params` prop on `Shell`, and the now-unused `defaultParams` **and `DEFAULT_VIEW`** imports — `noUnusedLocals` makes a leftover import a `tsc` error, and `DEFAULT_VIEW` is easy to miss because `storeRequest` still takes a view. `TopBar` takes `W` and `H` from `useStore((state) => state.params.values.W)` and `.H` — two primitive selectors, so the bar does not rerender on unrelated knobs.

- [ ] **Step 5: Run the whole browser suite**

```bash
cd apps/lab && pnpm vitest run --project chromium
```

Expected: PASS. Two failures are expected here and must be fixed rather than worked around: any test still passing a `params` prop, and any test that assumed the default seed.

- [ ] **Step 6: Falsify the second test**

Point `start` back at `defaultParams()`. The "knobs on screen are the knobs the run used" test must go red with seed 7. Restore.

Then check the save path the same way: change `viewOf(useStore.getState().view)` back to `DEFAULT_VIEW` and toggle `colour the arrows` before generating. Nothing goes red — **no test covers it**. Write one: after a run with `colored` on, `useStore.getState().run.saved` is the store's answer and the request carried `colored: true`. Assert it through the store client's own call, the way `App.tsx`'s existing StrictMode test counts POSTs.

- [ ] **Step 7: Commit**

```bash
git add apps/lab/src
git commit -m "Run what the console shows, and save the view it was drawn with"
```

---

### Task 15: Close the PR

**Files:**
- Modify: `README.md`, `README.pl.md` (the `apps/lab` paragraph)
- Verify: everything

- [ ] **Step 1: Both gates, in order**

```bash
cd /Users/tomek/dev/arrowz
(cd apps/lab && pnpm exec prettier --write .)
deno task verify
pnpm nx run-many -t verify
```

Expected: both green. `deno task verify` covers the engine's own tests including the dictionary keys added in Task 1; `nx` covers `apps/lab` (check, lint, fmt, test, build).

- [ ] **Step 2: Open the page and use it with a real mouse**

```bash
cd apps/lab && pnpm run serve
```

Then, in the browser, with the store server running (`deno task lab` in another terminal, for the save path):

**Keyboard only, hands off the mouse, for the first five:**

1. Tab to the rail and arrow through all seven entries. After each arrow the **focus ring must be on the entry that is now selected**, not left behind on the previous one, and the panel beside it must change.
2. Tab into the panel and reach every control of one group without a mouse: the label, the number, the slider. Arrow the slider; the value must move by the knob's own step.
3. Open a knob's entry with Enter, type `12`, press Escape. The value must be unchanged **and focus must be back on the number**, not on the document. Repeat with Enter: same focus, new value.
4. Set `share of short pieces` and `share of medium pieces` to 0.8 each. The rail must show a count on `lengths`, both knobs must turn red, the list must appear under the console, and Generate must go dead with its title explaining why.
5. Set the board to 900×900. The `shape` count appears (**not** `board` — `straightFloor` is a shape rule), the straightness knob states its bound in words under the slider, the marker sits on the track — and the slider still drags below it.

**Then with the mouse:**

6. Hover the rule marker: the tooltip must appear. It is the only surface that label has for a mouse user, and `pointer-events: none` would silently remove it.
7. Switch the rail to Preview and type `0.` into stroke digit by digit, pausing between characters. The box must keep what was typed; finish with `8` and Enter, and the board must redraw without a run starting.
8. Toggle `colour the arrows`, generate a 600×600 board, and confirm the status line ends in "saved" — then check the saved board's stored view carries `colored`, not the defaults.
9. **Open the old lab side by side** (`deno task lab`, `/lab.html`) with the same group open in both. Every knob must say the same thing in both: label, value, word, and the sentence underneath. A knob whose description is missing here looks like a design choice, not a regression.
10. At 1280×800, 1024×640 and below 900px wide: nothing clipped, no horizontal scrollbar, the rail narrows rather than the board vanishing.
11. Switch the browser to Polish (`localStorage.labLang` is PR 4, so pass `?lang=pl` only if it exists — otherwise read `dictionary('pl')` in the console and eyeball the decimal comma in `ruleBound`).
12. Open it once in Firefox. Chromium is the only browser the suite runs, and the slider's fill is `-moz-range-progress` there, a different rule from the `--pct` gradient Chromium uses.

This step is not ceremony. PR 2's whole-branch review found two CSS defects invisible in every individual diff, and the user found a third — no font was loading at all — by looking at the page for ten seconds. Anything found here is a commit in this PR, not a follow-up.

- [ ] **Step 3: Name the console in both READMEs**

Find the `apps/lab` paragraph added by PR 2 and extend it by one sentence in each language, saying that the lab's advanced console — twenty-eight knobs in six groups plus the preview fields — now lives there, and that the run column, presets and the URL hash are still the old lab's. `readme.test.ts` checks the generated tables, not this prose, so keep both files in step by hand.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin lab/parameter-console
gh pr create --base lab/app-skeleton --title "The generator lab as a React application: the parameter console" --body "..."
```

The base is `lab/app-skeleton` — this is the third PR on the stack. When #63 and #64 merge, rebase and `gh pr edit --base main`.

The body states: what the PR adds, the three slices and why they are shaped that way, the seven rulings that matter to a reviewer (the native slider, the dropped scrub, the tablist rail, the violations list's location, the error/warn split, the removed `params` prop, the deferred clamp notice), and what is deliberately **not** here — the run column, `auto`, presets, the live command, the hash — with the note that parity with today's lab is still PR 5, exactly as spec §10 says.

- [ ] **Step 5: Write the session note**

Record in the repository's memory (`memory-arrowz`, folder `sesje/`): what shipped, which rulings survived review and which did not, and anything the live pass in Step 2 caught that the tests did not. That last one is the part worth writing down — it is the third time in three PRs that a live pass has caught something the suite could not.

---

## What this PR does not do

Stated here so a reviewer does not report them as omissions, and so the next plan has its scope written down:

- **No run column**: no live command, no New seed, no Defaults, no export buttons. Generate is still the button PR 2 put in the bar.
- **No `auto`**, and therefore no 350 ms debounce. Every §2.2 trigger except Generate is still missing, which is why this PR adds none of that table's machinery.
- **No presets**, no `findPreset`, no preset chips in the top bar.
- **No URL hash.** Nothing in the console is shareable yet, and `saveToUrl`'s successor has no home.
- **No clamp notice** (Ruling 2), no `help` toggle, no simple view, no language switch, no report, no library, no filmstrip, no palette.
- **The old lab is untouched** and stays the surface with parity until PR 5.
- **Generate stays a plain `disabled` button.** Making its refusal reachable from the keyboard (`aria-disabled` plus a no-op click) is a behaviour change, and the button moves into the run column next PR anyway.
- **Every slider announces its knob's whole help paragraph** through `aria-describedby`, because that paragraph is now unconditional. It is long. The old lab prints the same text under the same knob, so this is parity rather than a regression — but if it turns out to be too much in the live pass, the fix is a shorter `aria-describedby` target, not a silent knob.
- **A violated group's tab is named "shape, 1 setting outside the safe range"**, and its panel inherits that name through `aria-labelledby`. No test queries a violated group by its plain name, but one written later would miss it.
- **`view.setNumber` allocates a new view even when the committed value is unchanged**, so `Stage` recomputes its memo once per commit rather than once per actual change. One object per keystroke-committed field; not worth a guard.
- **`broken` arrays are rebuilt on every write.** Spec §3 describes the per-key indexes as identity-preserving; this plan preserves identity only for the empty case (`NO_VIOLATIONS`). The cost is bounded by the number of knobs currently in violation, which is a small number by construction — a knob nobody has broken still reads `undefined` and still does not rerender.
