# Command Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the lab a ⌘K command palette over the actions, routes, knobs and presets it already has, plus the three hotkeys its footer advertises.

**Architecture:** A pure catalogue module (`palette/commands.ts`) turns the store and the dictionary into typed command rows; a dialog component renders them as a combobox over a listbox and owns the keyboard; a jump writes a focus request into `ui` that the console consumes after its render. Nothing in the palette performs new behaviour — every row calls a function the lab already ships, three of which move out of `RunColumn` into `run/actions.ts` so two callers can reach them.

**Tech Stack:** React 19, zustand 5, react-router 8, Vitest 5 (`node` and `chromium` projects), Deno 2.9 for the engine's dictionary.

**Spec:** `docs/superpowers/specs/2026-09-21-lab-command-palette-design.md`

## Global Constraints

- **Everything in the repository is English** — code, comments, tests, docs, commit messages. Only the chat with the user is Polish. User-facing strings ship in **both** PL and EN through `packages/engine/lab-i18n.ts`, English being the source language.
- **No `any`, no non-null assertions.** `exactOptionalPropertyTypes` is on: an optional prop taking `T | undefined` must be written `prop?: T | undefined`.
- **`apps/lab` reads the engine from `packages/engine/dist/`**, not from source. After Task 1 run `pnpm nx build engine` before any manual lab test run. `pnpm nx run lab:test` carries `dependsOn: ["^build"]`; a bare `pnpm vitest` does not.
- **Two gates must be green before the PR:** `deno task verify` (engine and CLI) and `pnpm nx run-many -t verify` (25 targets).
- **Lint is part of `verify`**: `jsx-a11y/no-autofocus` (set focus with a ref in an effect, never the attribute) and `react-hooks/immutability` (no `let` mutated inside a `.map()` in JSX). An unused import in a test file fails `verify`.
- **Never `git add -A`.** Another session may hold unrelated changes (`.claude/settings.json` is dirty right now). Add the exact paths each step names.
- **No attribution lines** in commit messages.
- Branch: `lab/command-palette`, based on `main` = `7c231bf`. The spec is already committed there as `de5989a`.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/engine/lab-i18n.ts` | the palette's words, EN and PL (modify) |
| `packages/engine/lab-i18n.test.ts` | their guard (modify) |
| `apps/lab/src/state/ui.slice.ts` | `palette` and `focusTarget`, and their actions (modify) |
| `apps/lab/src/harness/mountApp.tsx` | reset the two new fields and the flash timer (modify) |
| `apps/lab/src/run/actions.ts` | Generate, New seed, Defaults, seed step — one home, two callers (create) |
| `apps/lab/src/run/RunColumn.tsx` | calls those four instead of holding them (modify) |
| `apps/lab/src/palette/commands.ts` | the catalogue and the matcher — pure, no DOM (create) |
| `apps/lab/src/palette/CommandPalette.tsx` | the dialog: combobox, listbox, keyboard, focus (create) |
| `apps/lab/src/console/flash.ts` | the 1200 ms outline and its cancel (create) |
| `apps/lab/src/console/useFocusRequest.ts` | consumes a jump after the console's render (create) |
| `apps/lab/src/console/Console.tsx` | mounts that hook (modify) |
| `apps/lab/src/console/ViewPanel.tsx` | an id on each flag switch (modify) |
| `apps/lab/src/shell/TopBar.tsx` | the ⌘K trigger (modify) |
| `apps/lab/src/App.tsx` | the global ⌘K, and `g` / `[` / `]` beside `f` (modify) |
| `apps/lab/src/design/palette.css` | the mock's figures (create) |
| `apps/lab/src/main.tsx` | imports that stylesheet (modify) |

---

### Task 1: The palette's words, in both languages

**Files:**
- Modify: `packages/engine/lab-i18n.ts` (EN `ui` section, PL `ui` section)
- Test: `packages/engine/lab-i18n.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `UiKey`s `cmdOpen`, `cmdTitle`, `cmdPlaceholder`, `cmdEmpty(query: string)`, `cmdSecRun`, `cmdSecGo`, `cmdSecPreset`, `cmdHintMove`, `cmdHintChoose`, `cmdHintClose`, `cmdHintGenerate`, `cmdHintSeed`, `cmdNoRun`, `cmdBroken`, `cmdViewSimple`, `cmdViewAdvanced`, `cmdLangToPl`, `cmdLangToEn` — all read through `dict.t(...)`.

**Why the `cmd` prefix, and not `palette…`:** `paletteLabel`, `paletteAdd`, `paletteRemove` and `paletteHelp` are **taken** — they belong to the editable *colour* palette (`lab-i18n.ts:118-133`). Two unrelated subsystems must not share a key family.

- [ ] **Step 1: Write the failing test**

Append to `packages/engine/lab-i18n.test.ts`:

```ts
// The command palette's own words. The key-set test above fails for a key
// present in one language only; this one fails for a key missing from both,
// which that test cannot see. The `cmd` prefix is deliberate: `palette*` keys
// belong to the editable colour palette and must not be extended here.
Deno.test('both ui dictionaries carry the command palette words', () => {
  const dictionaries: Dictionary[] = [EN, PL]
  const words: UiKey[] = [
    'cmdOpen',
    'cmdTitle',
    'cmdPlaceholder',
    'cmdSecRun',
    'cmdSecGo',
    'cmdSecPreset',
    'cmdHintMove',
    'cmdHintChoose',
    'cmdHintClose',
    'cmdHintGenerate',
    'cmdHintSeed',
    'cmdNoRun',
    'cmdBroken',
    'cmdViewSimple',
    'cmdViewAdvanced',
    'cmdLangToPl',
    'cmdLangToEn',
  ]
  for (const d of dictionaries) {
    for (const k of words) {
      assertEquals(typeof d.ui[k], 'string', k)
      assert(String(d.ui[k]).length > 0, k)
    }
    // The empty note repeats what was typed, so a reader knows which query found nothing.
    assertStringIncludes(d.ui.cmdEmpty('zzz'), 'zzz')
  }
  // The trigger's accessible name names the shortcut, because the button shows
  // a glyph and nothing else.
  for (const lang of ['en', 'pl'] as const) assertStringIncludes(dictionary(lang).t('cmdOpen'), '⌘K')
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/engine && deno test --allow-read lab-i18n.test.ts`
Expected: FAIL — TypeScript rejects `'cmdOpen'` as a `UiKey`, because `UiKey` is `keyof Dictionary['ui']` and the key does not exist yet.

- [ ] **Step 3: Add the English entries**

In `packages/engine/lab-i18n.ts`, inside `EN.ui`, immediately after the `tabsLabel` entry:

```ts
    // The command palette (spec 2026-09-21). `cmd…`, not `palette…`: the
    // `palette*` keys above belong to the editable colour palette.
    cmdOpen: 'Command palette (⌘K)',
    cmdTitle: 'Commands',
    cmdPlaceholder: 'jump to a knob, an action or a preset',
    cmdEmpty: (query: string) => `nothing matches ${query}`,
    cmdSecRun: 'run',
    cmdSecGo: 'go to',
    cmdSecPreset: 'preset',
    cmdHintMove: 'move',
    cmdHintChoose: 'choose',
    cmdHintClose: 'close',
    cmdHintGenerate: 'generate',
    cmdHintSeed: 'seed',
    cmdNoRun: 'nothing running',
    cmdBroken: 'rule broken',
    cmdViewSimple: 'Simple view',
    cmdViewAdvanced: 'Advanced view',
    cmdLangToPl: 'Switch to Polish',
    cmdLangToEn: 'Switch to English',
```

- [ ] **Step 4: Add the Polish twins**

In `PL.ui`, at the matching place (after its own `tabsLabel`):

```ts
    cmdOpen: 'Paleta poleceń (⌘K)',
    cmdTitle: 'Polecenia',
    cmdPlaceholder: 'skocz do pokrętła, akcji albo presetu',
    cmdEmpty: (query: string) => `nic nie pasuje do ${query}`,
    cmdSecRun: 'generowanie',
    cmdSecGo: 'przejdź do',
    cmdSecPreset: 'preset',
    cmdHintMove: 'ruch',
    cmdHintChoose: 'wybór',
    cmdHintClose: 'zamknij',
    cmdHintGenerate: 'generuj',
    cmdHintSeed: 'ziarno',
    cmdNoRun: 'nic się nie generuje',
    cmdBroken: 'złamana reguła',
    cmdViewSimple: 'Widok prosty',
    cmdViewAdvanced: 'Widok zaawansowany',
    cmdLangToPl: 'Przełącz na polski',
    cmdLangToEn: 'Przełącz na angielski',
```

- [ ] **Step 5: Run the dictionary tests**

Run: `cd packages/engine && deno test --allow-read lab-i18n.test.ts`
Expected: PASS, including the pre-existing `EN and PL ui dictionaries have the same keys and the same value kinds`.

- [ ] **Step 6: Rebuild the engine, because the lab reads `dist`**

Run: `pnpm nx build engine`
Expected: success. Skipping this makes every later task fail with the old dictionary.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/lab-i18n.ts packages/engine/lab-i18n.test.ts
git commit -m "Give the command palette its words in both languages"
```

---

### Task 2: Two fields in the ui slice, and their reset

**Files:**
- Modify: `apps/lab/src/state/ui.slice.ts`
- Modify: `apps/lab/src/harness/mountApp.tsx:21-38`
- Test: `apps/lab/src/state/ui.slice.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: on `UiState` — `palette: boolean`, `focusTarget: string | null`, `openPalette(): void`, `closePalette(): void`, `togglePalette(): void`, `requestFocus(id: string): void`, `clearFocusRequest(): void`. `focusTarget` holds a DOM id such as `knob-seed` or `view-stroke`.

- [ ] **Step 1: Write the failing test**

Append to `apps/lab/src/state/ui.slice.test.ts`:

```ts
// Spec §8: neither field is ever remembered — no localStorage, no hash — so
// each is asserted against a freshly built slice rather than the live store,
// which a reset could have written (harness fact 41).
describe('the command palette', () => {
  function slice() {
    const store: { ui: UiState } = { ui: createUiSlice((fn) => Object.assign(store, fn(store))) }
    return store
  }

  it('starts closed, with no jump waiting', () => {
    const store = slice()
    expect(store.ui.palette).toBe(false)
    expect(store.ui.focusTarget).toBe(null)
  })

  it('opens, closes, and toggles from whatever it is', () => {
    const store = slice()
    store.ui.openPalette()
    store.ui.openPalette()
    expect(store.ui.palette).toBe(true)
    store.ui.closePalette()
    expect(store.ui.palette).toBe(false)
    store.ui.togglePalette()
    expect(store.ui.palette).toBe(true)
    store.ui.togglePalette()
    expect(store.ui.palette).toBe(false)
  })

  it('carries a jump request until its consumer clears it', () => {
    const store = slice()
    store.ui.requestFocus('knob-seed')
    expect(store.ui.focusTarget).toBe('knob-seed')
    store.ui.requestFocus('view-stroke')
    expect(store.ui.focusTarget).toBe('view-stroke')
    store.ui.clearFocusRequest()
    expect(store.ui.focusTarget).toBe(null)
  })

  it('writes nothing to storage, unlike the view mode', () => {
    localStorage.clear()
    const store = slice()
    store.ui.openPalette()
    store.ui.requestFocus('knob-seed')
    expect(localStorage.length).toBe(0)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/lab && pnpm vitest run --project node src/state/ui.slice.test.ts`
Expected: FAIL — `Property 'palette' does not exist on type 'UiState'` at type-check, and `store.ui.openPalette is not a function` at runtime.

- [ ] **Step 3: Declare the fields on the interface**

In `apps/lab/src/state/ui.slice.ts`, inside `interface UiState`, after `solo`:

```ts
  /** The command palette is on screen (spec §8). Never remembered, never in the hash. */
  palette: boolean
  /**
   * The DOM id of a control a palette jump asked for — `knob-<key>` or
   * `view-<field>` — waiting for the render that puts it in the tree. The
   * console's `useFocusRequest` consumes it and clears it, so a later render
   * cannot steal the focus a second time (spec §6).
   */
  focusTarget: string | null
```

and, after `toggleSolo()`:

```ts
  openPalette(): void
  closePalette(): void
  togglePalette(): void
  requestFocus(id: string): void
  clearFocusRequest(): void
```

- [ ] **Step 4: Implement them in the factory**

In `createUiSlice`, beside `solo: false`:

```ts
    palette: false,
    focusTarget: null,
```

and after `toggleSolo`:

```ts
    openPalette: () => patch({ palette: true }),
    closePalette: () => patch({ palette: false }),
    // Read inside the update, like `toggleSolo`: the hotkey and the trigger
    // can both fire before a render.
    togglePalette: () => set((state) => ({ ui: { ...state.ui, palette: !state.ui.palette } })),
    requestFocus: (focusTarget) => patch({ focusTarget }),
    clearFocusRequest: () => patch({ focusTarget: null }),
```

- [ ] **Step 5: Run the test**

Run: `cd apps/lab && pnpm vitest run --project node src/state/ui.slice.test.ts`
Expected: PASS.

- [ ] **Step 6: Put both fields into the harness reset**

In `apps/lab/src/harness/mountApp.tsx`, inside `resetApp`, after `state.ui.setSolo(false)`:

```ts
  state.ui.closePalette()
  state.ui.clearFocusRequest()
```

A reset that does not know a field is how a case inherits the previous one's state (harness fact 27).

- [ ] **Step 7: Type-check and commit**

Run: `pnpm nx run lab:check`
Expected: no errors.

```bash
git add apps/lab/src/state/ui.slice.ts apps/lab/src/state/ui.slice.test.ts apps/lab/src/harness/mountApp.tsx
git commit -m "Hold the palette's open state and a pending jump in the ui slice"
```

---

### Task 3: One home for Generate, New seed, Defaults — and the seed step

**Files:**
- Create: `apps/lab/src/run/actions.ts`
- Modify: `apps/lab/src/run/RunColumn.tsx:127-150`
- Modify: `apps/lab/src/run/PresetStrip.tsx:28-46`
- Test: `apps/lab/src/run/actions.test.ts`

**Interfaces:**
- Consumes: `RunControl` from `apps/lab/src/run/useRun.ts` — `{ start(): void; abort(): void; hold(cancel: () => void): void }`.
- Produces: `generate(control: RunControl): void`, `reseed(control: RunControl): void`, `defaults(control: RunControl): void`, `stepSeed(control: RunControl, delta: number): void`, `applyPreset(control: RunControl, params: Partial<Params>): void`.

**Why `setMany` and not `set`:** `set` is the hand-typed surface that moves `edits`, which is the only thing `useAutoRun` watches; `setMany` is the machine path, and "every one of those starts its own run immediately" (`apps/lab/src/state/params.slice.ts:73-79`, Ruling 3). A key that wrote through `set` *and* started a run would fire two runs for one press.

**Why `stepSeed` carries no bounds of its own:** `setMany` clamps to `PARAM_SPEC` and reports it (`params.slice.ts:83-84`). A ceiling written here would be a second copy of `seed`'s `max: 2 ** 32 - 1` (`packages/engine/engine.ts:2405`) and copies drift.

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/run/actions.test.ts`:

```ts
import { PARAM_SPEC } from '@arrowz/engine'
import { PRESETS } from '@arrowz/engine/presets'
import { exportCell } from '@arrowz/engine/simple'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import type { RunControl } from './useRun'
import { applyPreset, defaults, generate, reseed, stepSeed } from './actions'

function fakeControl(): RunControl & { started: number } {
  const control = {
    started: 0,
    start: () => {
      control.started += 1
    },
    abort: () => {},
    hold: () => {},
  }
  return control
}

beforeEach(() => {
  // Through setState, never through the action under test: a fixture that
  // cleans up by calling a slice method blinds the mutation test (fact 40).
  useStore.setState((state) => ({ ui: { ...state.ui, mode: 'advanced', auto: false } }))
  useStore.getState().params.reset()
})

describe('the run actions, which the column and the palette share', () => {
  it('generates from the knobs as they stand', () => {
    const control = fakeControl()
    generate(control)
    expect(control.started).toBe(1)
  })

  it('draws a new seed and runs', () => {
    const control = fakeControl()
    const before = useStore.getState().params.values.seed
    reseed(control)
    expect(useStore.getState().params.values.seed).not.toBe(before)
    expect(control.started).toBe(1)
  })

  it('puts every knob back and runs', () => {
    const control = fakeControl()
    useStore.getState().params.set('W', 42)
    defaults(control)
    expect(useStore.getState().params.values.W).not.toBe(42)
    expect(control.started).toBe(1)
  })

  it('steps the seed by one in each direction and runs each time', () => {
    const control = fakeControl()
    useStore.getState().params.setMany({ seed: 100 })
    stepSeed(control, 1)
    expect(useStore.getState().params.values.seed).toBe(101)
    stepSeed(control, -1)
    expect(useStore.getState().params.values.seed).toBe(100)
    expect(control.started).toBe(2)
  })

  it('stops at the bounds the engine has, rather than wrapping', () => {
    const control = fakeControl()
    useStore.getState().params.setMany({ seed: 0 })
    stepSeed(control, -1)
    expect(useStore.getState().params.values.seed).toBe(0)
    useStore.getState().params.setMany({ seed: 2 ** 32 - 1 })
    stepSeed(control, 1)
    expect(useStore.getState().params.values.seed).toBe(2 ** 32 - 1)
  })

  // Spec D6: the chip and the palette row are the same action, so it is one
  // function. Every knob is written, not only the ones the option names.
  it('writes a whole preset, follows it with the export cell size, and runs', () => {
    const control = fakeControl()
    useStore.getState().params.set('giantStep', 3)
    const option = PRESETS[0]?.options[0]
    expect(option).toBeDefined()
    if (option === undefined) return
    applyPreset(control, option.params)
    const values = useStore.getState().params.values
    expect(values.W).toBe(option.params.W)
    // A knob the option does not name goes back to its default rather than
    // surviving from the previous experiment.
    const giantStep = PARAM_SPEC.find((spec) => spec.key === 'giantStep')
    expect(values.giantStep).toBe(giantStep?.def)
    expect(useStore.getState().view.cell).toBe(exportCell(values.W, values.H))
    expect(control.started).toBe(1)
  })

  // Ruling 3: the machine path must not also wake auto-generate, or one press
  // would carve twice — once here, once 350 ms later.
  it('leaves the edit counter alone, so auto-generate does not fire a second run', () => {
    const control = fakeControl()
    const before = useStore.getState().params.edits
    stepSeed(control, 1)
    reseed(control)
    expect(useStore.getState().params.edits).toBe(before)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/lab && pnpm vitest run --project node src/run/actions.test.ts`
Expected: FAIL — `Failed to resolve import "./actions"`.

- [ ] **Step 3: Write the module**

Create `apps/lab/src/run/actions.ts`:

```ts
import { PARAM_SPEC, type Params } from '@arrowz/engine'
import { exportCell } from '@arrowz/engine/simple'
import { drawIfRandom, resetRecipeIfSimple } from '../simple/applyRecipe'
import { useStore } from '../state/store'
import type { RunControl } from './useRun'

/**
 * The four things a person can ask the generator for, in one place because two
 * surfaces ask: the run column's buttons and the command palette (spec §5).
 * They were closures inside `RunColumn`, where nothing else could reach them.
 *
 * Every one of them writes through `setMany` or `reset` — the machine path —
 * and starts its own run, which is exactly the contract `params.slice.ts:73-79`
 * states: only `set` and `setStart` move `edits`, and only `edits` wakes
 * auto-generate (Ruling 3).
 */

/** Generate from the knobs as they stand. In the simple view with randomising on, they are drawn first. */
export function generate(control: RunControl): void {
  drawIfRandom()
  control.start()
}

/** A seed the machine drew, over the knob's whole 32-bit range, then a run. */
export function reseed(control: RunControl): void {
  // `?? 0` is unreachable — the call fills the array it is handed — and is
  // here because an index into a typed array is `number | undefined` under
  // `noUncheckedIndexedAccess`.
  useStore.getState().params.setMany({ seed: crypto.getRandomValues(new Uint32Array(1))[0] ?? 0 })
  drawIfRandom()
  control.start()
}

/** Every knob back to its default, the recipe over them in the simple view, then a run. */
export function defaults(control: RunControl): void {
  useStore.getState().params.reset()
  resetRecipeIfSimple()
  control.start()
}

/**
 * The `[` and `]` keys: the neighbouring seed, then a run — the experimenter's
 * loop of flipping through boards from one setting.
 *
 * No bounds of its own on purpose. `setMany` clamps to `PARAM_SPEC`, whose
 * `seed` runs 0..2**32-1, so a ceiling written here would be a second copy of
 * that number and a copy drifts.
 */
export function stepSeed(control: RunControl, delta: number): void {
  const params = useStore.getState().params
  params.setMany({ seed: params.values.seed + delta })
  drawIfRandom()
  control.start()
}

/**
 * A preset, from the strip's chip or from the palette's row — one function, so
 * the two surfaces cannot drift (spec D6).
 *
 * Every knob is written, not only the ones the option names: `lab-presets.ts`
 * calls an option "engine defaults + these overrides", so choosing one never
 * inherits a knob left over from the previous experiment. A preset is written
 * for the engine's envelope rather than this board's, so a value can arrive
 * out of range and be pulled in — the notice is how that move stops being
 * silent. The export cell size follows the size (§2.2 row 2) through the view
 * slice's tolerant reader, because it is a view field and not a knob.
 */
export function applyPreset(control: RunControl, params: Partial<Params>): void {
  const state = useStore.getState()
  const full: Partial<Params> = {}
  for (const spec of PARAM_SPEC) full[spec.key] = params[spec.key] ?? spec.def
  state.ui.raiseClamped(state.params.setMany(full))
  state.view.setNumber('cell', String(exportCell(params.W ?? 0, params.H ?? 0)))
  control.start()
}
```

- [ ] **Step 4: Run the test**

Run: `cd apps/lab && pnpm vitest run --project node src/run/actions.test.ts`
Expected: PASS, all six cases.

- [ ] **Step 5: Make the run column and the preset strip call them**

In `apps/lab/src/run/RunColumn.tsx`, delete the three closures at `:127-150` and replace their bodies with calls. The import line joins the existing ones:

```ts
import { defaults, generate, reseed } from './actions'
```

and the three definitions become:

```tsx
  const onGenerate = () => generate(control)
  const onReseed = () => reseed(control)
  const onDefaults = () => defaults(control)
```

with the three `onClick` handlers renamed to match (`onClick={onGenerate}`, `onClick={onReseed}`, `onClick={onDefaults}`). Remove the now-unused `setMany` and `resetParams` selectors and the `drawIfRandom` / `resetRecipeIfSimple` imports — `noUnusedLocals` is a gate.

In `apps/lab/src/run/PresetStrip.tsx`, delete the local `apply` at `:28-46` and its body, and call the shared one instead:

```tsx
import { applyPreset } from './actions'
```

```tsx
  const apply = (params: Partial<Params>) => applyPreset(control, params)
```

The strip's own selectors for `setMany`, `setNumber` and `raiseClamped` go with it; `values` stays, because the strip still marks the chip the knobs spell (`findPreset`). `PARAM_SPEC` and `exportCell` become unused imports there — remove both.

- [ ] **Step 6: Prove the column still behaves**

Run: `cd apps/lab && pnpm vitest run --project chromium src/run/RunColumn.browser.test.tsx src/run/triggers.browser.test.tsx src/run/PresetStrip.browser.test.tsx`
Expected: PASS — this is the regression proof for the move; nothing in those three files changes.

- [ ] **Step 7: Commit**

```bash
git add apps/lab/src/run/actions.ts apps/lab/src/run/actions.test.ts apps/lab/src/run/RunColumn.tsx apps/lab/src/run/PresetStrip.tsx
git commit -m "Move the four run actions where two callers can reach them"
```

---

### Task 4: The catalogue, and the matcher

**Files:**
- Create: `apps/lab/src/palette/commands.ts`
- Modify: `apps/lab/src/console/viewFields.ts` (the flag table moves in)
- Modify: `apps/lab/src/console/ViewPanel.tsx:11` (it moves out)
- Modify: `apps/lab/src/simple/SimplePanel.tsx:7-8` (its import follows)
- Test: `apps/lab/src/palette/commands.test.ts`

**Interfaces:**
- Consumes: `generate`, `reseed`, `defaults`, `applyPreset` from `run/actions.ts`; `RunControl`; `Store` from `state/store.ts`; `Dict` from `@arrowz/engine/i18n`; `VIEW_FIELDS` and `VIEW_FLAGS` from `console/viewFields.ts`.
- Produces:

```ts
export type CommandSection = 'run' | 'go' | 'knob' | 'preset'
export interface Command {
  readonly id: string
  readonly section: CommandSection
  readonly name: string
  readonly note: string
  readonly value: string
  readonly hay: string
  readonly disabled: boolean
  run(): void
}
export interface CommandDeps {
  readonly control: RunControl
  readonly navigate: (path: string) => void
  readonly dict: Dict
}
export function buildCommands(deps: CommandDeps, state: Store): Command[]
export function matchCommands(commands: readonly Command[], query: string): Command[]
```

The three columns of a row are `name`, `note` and `value` — the mock's `.lab`, `.g` and `.v`. `hay` is searchable text that is not shown: a knob's CLI flag.

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/palette/commands.test.ts`:

```ts
import { PARAM_SPEC } from '@arrowz/engine'
import { dictionary } from '@arrowz/engine/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import type { RunControl } from '../run/useRun'
import { buildCommands, type CommandDeps, matchCommands } from './commands'

const control: RunControl = { start: () => {}, abort: () => {}, hold: () => {} }

function deps(): CommandDeps & { went: string[] } {
  const went: string[] = []
  return { control, navigate: (path) => went.push(path), dict: dictionary('en'), went }
}

beforeEach(() => {
  useStore.setState((state) => ({ ui: { ...state.ui, mode: 'advanced', entry: 'board', palette: false } }))
  useStore.getState().params.reset()
  useStore.getState().run.reset()
  useStore.getState().result.reset()
})

describe('the catalogue', () => {
  it('opens with the run actions, then navigation, then knobs, then presets', () => {
    const rows = buildCommands(deps(), useStore.getState())
    const sections = [...new Set(rows.map((row) => row.section))]
    expect(sections).toEqual(['run', 'go', 'knob', 'preset'])
  })

  it('carries every knob the engine has, the start pair as one row', () => {
    const rows = buildCommands(deps(), useStore.getState()).filter((row) => row.section === 'knob')
    const starts = PARAM_SPEC.filter((spec) => spec.surface === 'start')
    expect(starts).toHaveLength(2)
    const ids = rows.map((row) => row.id)
    expect(ids).toContain('knob-seed')
    expect(ids).toContain('knob-start')
    for (const start of starts) expect(ids).not.toContain(`knob-${start.key}`)
    // The five preview numbers and the five preview flags travel with them.
    expect(ids).toContain('view-stroke')
    expect(ids).toContain('view-colored')
  })

  it('shows a knob its current value and hides its flag in the search text', () => {
    useStore.getState().params.setMany({ seed: 123 })
    const seed = buildCommands(deps(), useStore.getState()).find((row) => row.id === 'knob-seed')
    expect(seed?.value).toBe('123')
    expect(seed?.hay).toContain('--seed')
  })

  // Spec D7: an unavailable command stays listed and says why, because a
  // command that vanishes is one nobody can find.
  it('lists Abort with a reason while nothing is running, and enables it during a run', () => {
    const idle = buildCommands(deps(), useStore.getState()).find((row) => row.id === 'run-abort')
    expect(idle?.disabled).toBe(true)
    expect(idle?.value).toBe('nothing running')
    useStore.getState().run.started(useStore.getState().params.values)
    const running = buildCommands(deps(), useStore.getState()).find((row) => row.id === 'run-abort')
    expect(running?.disabled).toBe(false)
  })

  it('refuses Generate against a broken rule, and says which way it is broken', () => {
    // wShort + wMed above 0.9 breaks `sharesSum`, the rule the envelope states.
    useStore.getState().params.setMany({ wShort: 0.9, wMed: 0.9 })
    expect(useStore.getState().params.violations.length).toBeGreaterThan(0)
    const go = buildCommands(deps(), useStore.getState()).find((row) => row.id === 'run-generate')
    expect(go?.disabled).toBe(true)
    expect(go?.value).toBe('rule broken')
  })

  it('navigates through the deps it was handed, not through the address bar', () => {
    const handed = deps()
    const rows = buildCommands(handed, useStore.getState())
    rows.find((row) => row.id === 'go-boards')?.run()
    expect(handed.went).toEqual(['/boards'])
  })

  it('offers every preset option under its level', () => {
    const rows = buildCommands(deps(), useStore.getState()).filter((row) => row.section === 'preset')
    expect(rows.length).toBe(26)
    expect(rows[0]?.note.length).toBeGreaterThan(0)
  })
})

describe('the matcher', () => {
  it('returns everything for an empty query, which is what the palette opens on', () => {
    const rows = buildCommands(deps(), useStore.getState())
    expect(matchCommands(rows, '')).toHaveLength(rows.length)
    expect(matchCommands(rows, '   ')).toHaveLength(rows.length)
  })

  it('matches a name, a note and a CLI flag, ignoring case', () => {
    const rows = buildCommands(deps(), useStore.getState())
    expect(matchCommands(rows, 'SEED').map((row) => row.id)).toContain('knob-seed')
    expect(matchCommands(rows, '--seed').map((row) => row.id)).toContain('knob-seed')
    expect(matchCommands(rows, 'board').length).toBeGreaterThan(0)
  })

  it('returns nothing for a query nothing carries', () => {
    const rows = buildCommands(deps(), useStore.getState())
    expect(matchCommands(rows, 'zzzzz')).toEqual([])
  })

  // Spec D4: the mock's `slice(0, 40)` is dropped, and this is the assertion
  // that keeps it dropped — at 40 rows exactly, a cap would be invisible.
  it('caps nothing', () => {
    const rows = buildCommands(deps(), useStore.getState())
    expect(rows.length).toBeGreaterThan(60)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/lab && pnpm vitest run --project node src/palette/commands.test.ts`
Expected: FAIL — `Failed to resolve import "./commands"`.

- [ ] **Step 3: Write the catalogue**

Create `apps/lab/src/palette/commands.ts`:

```ts
import { PARAM_SPEC } from '@arrowz/engine'
import { flagOf, wordFor } from '@arrowz/engine/command'
import type { Dict } from '@arrowz/engine/i18n'
import { PRESETS } from '@arrowz/engine/presets'
import { VIEW_FIELDS, VIEW_FLAGS } from '../console/viewFields'
import { applyPreset, defaults, generate, reseed } from '../run/actions'
import type { RunControl } from '../run/useRun'
import { type Store, useStore } from '../state/store'

export type CommandSection = 'run' | 'go' | 'knob' | 'preset'

/**
 * One row of the palette. The three visible columns are the mock's own
 * (`.lab`, `.g`, `.v`); `hay` is text that is searched and not shown, which is
 * how `--seed` finds the seed knob.
 *
 * `disabled` does not remove a row (spec D7): it is listed with its reason
 * where a value would be, because a command that disappears when unavailable
 * is a command nobody can find and nobody can be told about.
 */
export interface Command {
  readonly id: string
  readonly section: CommandSection
  readonly name: string
  readonly note: string
  readonly value: string
  readonly hay: string
  readonly disabled: boolean
  run(): void
}

export interface CommandDeps {
  readonly control: RunControl
  readonly navigate: (path: string) => void
  readonly dict: Dict
}

/** A jump: the panel that holds the control, then the control itself (spec §6). */
function jumpTo(entry: Parameters<Store['ui']['select']>[0], id: string): void {
  const ui = useStore.getState().ui
  // The knobs do not exist in the simple view, so the jump has to bring the
  // console that has them.
  if (useStore.getState().ui.mode === 'simple') ui.setMode('advanced')
  ui.select(entry)
  ui.requestFocus(id)
  ui.closePalette()
}

function knobRows(deps: CommandDeps, state: Store): Command[] {
  const rows: Command[] = []
  let startDone = false
  for (const spec of PARAM_SPEC) {
    if (spec.surface === 'start') {
      // One control for the pair, exactly as `KnobPanel` draws it.
      if (startDone) continue
      startDone = true
      rows.push({
        id: 'knob-start',
        section: 'knob',
        name: deps.dict.d.start.label,
        note: deps.dict.d.groups[spec.group],
        value: '--start',
        hay: '--start',
        disabled: false,
        run: () => jumpTo(spec.group, 'knob-start'),
      })
      continue
    }
    const { label } = deps.dict.paramText(spec)
    const value = state.params.values[spec.key]
    rows.push({
      id: `knob-${spec.key}`,
      section: 'knob',
      name: label,
      note: deps.dict.d.groups[spec.group],
      // The CLI's word where the value has one, so a slider reading `auto`
      // does not offer a bare 0.
      value: wordFor(spec.key, value) ?? String(value),
      hay: flagOf(spec.key),
      disabled: false,
      run: () => jumpTo(spec.group, `knob-${spec.key}`),
    })
  }
  for (const field of VIEW_FIELDS) {
    rows.push({
      id: `view-${field.field}`,
      section: 'knob',
      name: deps.dict.t(field.label),
      note: deps.dict.t('preview'),
      value: String(state.view[field.field]),
      hay: field.field,
      disabled: false,
      run: () => jumpTo('preview', `view-${field.field}`),
    })
  }
  for (const flag of VIEW_FLAGS) {
    rows.push({
      id: `view-${flag.flag}`,
      section: 'knob',
      name: deps.dict.t(flag.label),
      note: deps.dict.t('preview'),
      value: state.view[flag.flag] ? 'on' : 'off',
      hay: flag.flag,
      disabled: false,
      run: () => jumpTo('preview', `view-${flag.flag}`),
    })
  }
  return rows
}

function presetRows(deps: CommandDeps): Command[] {
  const levels = deps.dict.d.presets.levels as Partial<Record<string, string>>
  const rows: Command[] = []
  for (const level of PRESETS) {
    for (const option of level.options) {
      const W = option.params.W ?? 0
      const H = option.params.H ?? 0
      rows.push({
        id: `preset-${option.id}`,
        section: 'preset',
        name: deps.dict.d.presets.modes[option.mode],
        note: levels[level.id] ?? level.id,
        value: `${W}×${H}`,
        hay: option.id,
        disabled: false,
        run: () => {
          applyPreset(deps.control, option.params)
          useStore.getState().ui.closePalette()
        },
      })
    }
  }
  return rows
}

/** Every row the palette can show, in the order it shows them (spec §4). */
export function buildCommands(deps: CommandDeps, state: Store): Command[] {
  const { dict } = deps
  const running = state.run.phase === 'running'
  const broken = state.params.violations.length > 0
  const run: Command[] = [
    {
      id: 'run-generate',
      section: 'run',
      name: dict.t('generate'),
      note: dict.t('cmdSecRun'),
      value: broken ? dict.t('cmdBroken') : 'g',
      hay: 'generate',
      disabled: running || broken,
      run: () => {
        generate(deps.control)
        state.ui.closePalette()
      },
    },
    {
      id: 'run-reseed',
      section: 'run',
      name: dict.t('reseed'),
      note: dict.t('cmdSecRun'),
      value: '[ ]',
      hay: 'seed',
      disabled: running,
      run: () => {
        reseed(deps.control)
        state.ui.closePalette()
      },
    },
    {
      id: 'run-defaults',
      section: 'run',
      name: dict.t('reset'),
      note: dict.t('cmdSecRun'),
      value: '',
      hay: 'defaults reset',
      disabled: running,
      run: () => {
        defaults(deps.control)
        state.ui.closePalette()
      },
    },
    {
      id: 'run-abort',
      section: 'run',
      name: dict.t('abort'),
      note: dict.t('cmdSecRun'),
      value: running ? '' : dict.t('cmdNoRun'),
      hay: 'abort stop',
      disabled: !running,
      run: () => {
        deps.control.abort()
        state.ui.closePalette()
      },
    },
    {
      id: 'run-solo',
      section: 'run',
      name: dict.t('fullView'),
      note: dict.t('cmdSecRun'),
      value: 'f',
      hay: 'solo full',
      disabled: false,
      run: () => {
        state.ui.toggleSolo()
        state.ui.closePalette()
      },
    },
  ]
  const go: Command[] = [
    goRow(deps, 'go-lab', dict.t('tabLab'), '/'),
    goRow(deps, 'go-boards', dict.t('tabLibrary'), '/boards'),
    goRow(deps, 'go-docs-element', `${dict.t('tabDocs')} — ${dict.t('docsElement')}`, '/docs/element'),
    goRow(deps, 'go-docs-cli', `${dict.t('tabDocs')} — ${dict.t('docsCli')}`, '/docs/cli'),
    {
      id: 'go-view',
      section: 'go',
      name: state.ui.mode === 'simple' ? dict.t('cmdViewAdvanced') : dict.t('cmdViewSimple'),
      note: dict.t('cmdSecGo'),
      value: '',
      hay: 'view mode simple advanced',
      disabled: false,
      run: () => {
        state.ui.setMode(state.ui.mode === 'simple' ? 'advanced' : 'simple')
        state.ui.closePalette()
      },
    },
    {
      id: 'go-lang',
      section: 'go',
      name: state.lang.lang === 'pl' ? dict.t('cmdLangToEn') : dict.t('cmdLangToPl'),
      note: dict.t('cmdSecGo'),
      value: state.lang.lang === 'pl' ? 'EN' : 'PL',
      hay: 'language polski english',
      disabled: false,
      run: () => {
        state.lang.setLang(state.lang.lang === 'pl' ? 'en' : 'pl')
        state.ui.closePalette()
      },
    },
  ]
  // The two exports are deliberately not here (spec §4): each is a closure
  // inside `ExportButtons` holding a worker or a per-board hash, and a palette
  // row could reach them only by clicking their button through the DOM.
  return [...run, ...go, ...knobRows(deps, state), ...presetRows(deps)]
}

function goRow(deps: CommandDeps, id: string, name: string, path: string): Command {
  return {
    id,
    section: 'go',
    name,
    note: deps.dict.t('cmdSecGo'),
    value: '',
    hay: path,
    disabled: false,
    run: () => {
      deps.navigate(path)
      useStore.getState().ui.closePalette()
    },
  }
}

/**
 * A case-insensitive substring over what a row shows and what it hides. The
 * mock searches the label and the group; the flag joins them because the lab's
 * whole vocabulary is the CLI's, and the live command line is on the same
 * screen.
 */
export function matchCommands(commands: readonly Command[], query: string): Command[] {
  const q = query.trim().toLowerCase()
  if (q === '') return [...commands]
  return commands.filter((command) =>
    `${command.name} ${command.note} ${command.hay}`.toLowerCase().includes(q),
  )
}
```

- [ ] **Step 4: Run the test**

Run: `cd apps/lab && pnpm vitest run --project node src/palette/commands.test.ts`
Expected: PASS.

This needs the flag table where a module with no DOM can read it. `VIEW_FLAGS` is declared in `apps/lab/src/console/ViewPanel.tsx:11` today, and `commands.ts` must not import a component file: the `node` project has no React plugin, and a pure catalogue pulling in JSX is the wrong dependency anyway. Move the literal — the whole `export const VIEW_FLAGS: readonly { flag: ViewFlag; label: … }[]` declaration — into `apps/lab/src/console/viewFields.ts`, beside `VIEW_FIELDS` and `SIMPLE_VIEW_FLAGS`, which already import `ViewFlag`. Then fix its two readers: `ViewPanel.tsx` imports it from `./viewFields` (it already imports `VIEW_FIELDS` from there), and `SimplePanel.tsx:7-8` moves `VIEW_FLAGS` out of its `../console/ViewPanel` import into the `../console/viewFields` one it already has. One table, read by the panel and by the catalogue alike.

- [ ] **Step 5: Check and lint**

Run: `pnpm nx run lab:check && pnpm nx run lab:lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/palette/commands.ts apps/lab/src/palette/commands.test.ts apps/lab/src/console/viewFields.ts apps/lab/src/console/ViewPanel.tsx apps/lab/src/simple/SimplePanel.tsx
git commit -m "Build the palette's catalogue out of what the lab already does"
```

---

### Task 5: The dialog

**Files:**
- Create: `apps/lab/src/palette/CommandPalette.tsx`
- Create: `apps/lab/src/design/palette.css`
- Create: `apps/lab/src/design/palette.test.ts`
- Modify: `apps/lab/src/main.tsx`
- Test: `apps/lab/src/palette/CommandPalette.browser.test.tsx`

**Interfaces:**
- Consumes: `buildCommands`, `matchCommands`, `Command` from `./commands`; `RunControl`.
- Produces: `CommandPalette({ control }: { control: RunControl })` — renders nothing while `ui.palette` is false.

**The closing click is handled on the document, not on the backdrop.** A click handler on a plain `div` trips `jsx-a11y/no-static-element-interactions`, which is a gate here; a `mousedown` listener that closes when the press lands outside the frame is both lint-clean and more robust (a press that starts inside and ends outside does not close it).

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/palette/CommandPalette.browser.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { MemoryRouter } from 'react-router'
import type { RunControl } from '../run/useRun'
import { useStore } from '../state/store'
import { CommandPalette } from './CommandPalette'
import '../design/tokens.css'
import '../design/palette.css'

const control: RunControl = { start: () => {}, abort: () => {}, hold: () => {} }

function mount() {
  return render(
    <MemoryRouter>
      <CommandPalette control={control} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useStore.setState((state) => ({
    ui: { ...state.ui, palette: true, mode: 'advanced', entry: 'board', focusTarget: null },
    lang: { ...state.lang, lang: 'en' },
  }))
  useStore.getState().params.reset()
  useStore.getState().run.reset()
  useStore.getState().result.reset()
})

describe('the palette dialog', () => {
  it('is a modal dialog over a combobox and a listbox', async () => {
    const screen = await mount()
    await expect.element(screen.getByRole('dialog', { name: 'Commands' })).toBeVisible()
    const input = screen.container.querySelector<HTMLInputElement>('.fw-pal input')
    expect(input?.getAttribute('role')).toBe('combobox')
    expect(input?.getAttribute('aria-expanded')).toBe('true')
    await expect.element(screen.getByRole('listbox', { name: 'Commands' })).toBeVisible()
  })

  it('renders nothing at all while it is closed', async () => {
    useStore.setState((state) => ({ ui: { ...state.ui, palette: false } }))
    const screen = await mount()
    expect(screen.container.querySelector('.fw-pal')).toBe(null)
  })

  it('takes the focus into the input when it opens', async () => {
    const screen = await mount()
    const input = screen.container.querySelector<HTMLInputElement>('.fw-pal input')
    await expect.poll(() => document.activeElement === input).toBe(true)
  })

  // Spec §7: the arrows move the active option, and the focus never leaves the
  // input — that is what lets a screen reader read the row while typing goes on.
  it('moves the active option with the arrows without moving the focus', async () => {
    const screen = await mount()
    const input = screen.container.querySelector<HTMLInputElement>('.fw-pal input')
    await expect.poll(() => document.activeElement === input).toBe(true)
    const first = input?.getAttribute('aria-activedescendant')
    await userEvent.keyboard('{ArrowDown}')
    const second = input?.getAttribute('aria-activedescendant')
    expect(second).not.toBe(first)
    expect(document.activeElement).toBe(input)
    const active = screen.container.querySelector(`#${CSS.escape(second ?? '')}`)
    expect(active?.getAttribute('aria-selected')).toBe('true')
  })

  it('filters as it is typed, and says so when nothing matches', async () => {
    const screen = await mount()
    const before = screen.container.querySelectorAll('[role="option"]').length
    expect(before).toBeGreaterThan(60)
    await userEvent.keyboard('seed')
    const after = screen.container.querySelectorAll('[role="option"]').length
    expect(after).toBeLessThan(before)
    expect(after).toBeGreaterThan(0)
    await userEvent.keyboard('zzzz')
    expect(screen.container.querySelectorAll('[role="option"]')).toHaveLength(0)
    await expect.element(screen.getByText('nothing matches seedzzzz')).toBeVisible()
  })

  // Spec D4: the mock caps the list at 40 rows; that cap is dropped, and the
  // list scrolls instead. Measured as an effect, not as a declared property
  // (harness fact 36): `overflow-y: auto` on a box nothing constrains scrolls
  // nothing.
  it('scrolls its list rather than cutting it off', async () => {
    await page.viewport(1280, 800)
    const screen = await mount()
    const list = screen.container.querySelector<HTMLElement>('.fw-pal .list')
    expect(list).not.toBe(null)
    expect(list?.scrollHeight ?? 0).toBeGreaterThan(list?.clientHeight ?? 0)
  })

  it('runs the active command on Enter and closes', async () => {
    await mount()
    await userEvent.keyboard('Saved boards')
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => useStore.getState().ui.palette).toBe(false)
  })

  it('closes on Escape', async () => {
    await mount()
    await userEvent.keyboard('{Escape}')
    await expect.poll(() => useStore.getState().ui.palette).toBe(false)
  })

  // D7: unavailable commands stay in the list, carry their reason, and do
  // nothing when chosen.
  it('lists an unavailable command with its reason and refuses to run it', async () => {
    const screen = await mount()
    await userEvent.keyboard('Abort')
    const row = screen.container.querySelector('[role="option"]')
    expect(row?.getAttribute('aria-disabled')).toBe('true')
    expect(row?.textContent).toContain('nothing running')
    await userEvent.keyboard('{Enter}')
    expect(useStore.getState().ui.palette).toBe(true)
  })

  it('keeps Tab inside itself', async () => {
    const screen = await mount()
    const input = screen.container.querySelector<HTMLInputElement>('.fw-pal input')
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement).toBe(input)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/lab && pnpm vitest run --project chromium src/palette/CommandPalette.browser.test.tsx`
Expected: FAIL — `Failed to resolve import "./CommandPalette"`.

- [ ] **Step 3: Write the stylesheet**

Create `apps/lab/src/design/palette.css`:

```css
/* The command palette, with the mock's own figures (spec §9). No transition
   and no blur touches any of these selectors: that is the design system's
   rule, not an omission. */
.fw-scrim {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(14, 15, 18, 0.72);
  display: grid;
  justify-items: center;
  align-content: start;
  padding-top: 12vh;
}
.fw-pal {
  width: min(560px, calc(100vw - 32px));
  background: var(--graphite);
  border: 1px solid var(--border-strong);
}
.fw-pal input {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: var(--void);
  color: var(--ink);
  font: inherit;
}
.fw-pal input::placeholder {
  color: var(--ash);
}
.fw-pal .list {
  max-height: 46vh;
  overflow-y: auto;
}
.fw-pal .row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: baseline;
  padding: 8px 14px;
  cursor: pointer;
}
.fw-pal .row .g {
  color: var(--ash);
}
.fw-pal .row .v {
  color: var(--signal);
  font-variant-numeric: tabular-nums;
}
.fw-pal .row[aria-selected='true'] {
  background: var(--surface);
}
.fw-pal .row[aria-selected='true'] .lab {
  color: var(--ink);
}
.fw-pal .row[aria-disabled='true'] .lab {
  color: var(--ash);
}
.fw-pal .empty {
  padding: 14px;
  color: var(--ash);
}
.fw-pal .foot {
  display: flex;
  gap: 16px;
  padding: 8px 14px;
  border-top: 1px solid var(--border);
  color: var(--ash);
}
.fw-pal .foot b {
  font-weight: 400;
  color: var(--mist);
}
```

Add its import to `apps/lab/src/main.tsx`, after `./design/docs.css`:

```ts
import './design/palette.css'
```

- [ ] **Step 4: Pin the two rules the browser project cannot see**

Create `apps/lab/src/design/palette.test.ts`:

```ts
import { expect, test } from 'vitest'
import css from './palette.css?raw'

// The browser project loads no stylesheet (harness fact 38), so a
// `getComputedStyle` assertion over there passes with this file missing
// entirely. These two rules are what make the palette a palette: a frame the
// mock sizes, and a list that scrolls instead of growing.
test('the frame keeps the mock width and the strong border', () => {
  const rule = /\.fw-pal\s*\{([^}]*)\}/.exec(css)
  expect(rule, '.fw-pal rule not found').not.toBeNull()
  expect(rule?.[1]).toContain('min(560px, calc(100vw - 32px))')
  expect(rule?.[1]).toContain('var(--border-strong)')
})

test('the list is bounded, which is what makes it scroll', () => {
  const rule = /\.fw-pal \.list\s*\{([^}]*)\}/.exec(css)
  expect(rule, '.fw-pal .list rule not found').not.toBeNull()
  expect(rule?.[1]).toContain('max-height: 46vh')
  expect(rule?.[1]).toContain('overflow-y: auto')
})
```

- [ ] **Step 5: Write the dialog**

Create `apps/lab/src/palette/CommandPalette.tsx`:

```tsx
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useDictionary } from '../i18n'
import type { RunControl } from '../run/useRun'
import { useStore } from '../state/store'
import { buildCommands, type Command, matchCommands } from './commands'

/** The id of the trigger, so closing can hand the focus back to it (spec §7). */
export const TRIGGER_ID = 'cmdk'

/**
 * The palette (spec §7). Closed, it renders nothing and holds no state, so
 * every opening starts on an empty query — the mock's behaviour, and the one
 * a reader expects from a palette.
 */
export function CommandPalette({ control }: { control: RunControl }): ReactElement | null {
  const open = useStore((state) => state.ui.palette)
  if (!open) return null
  return <PaletteDialog control={control} />
}

function PaletteDialog({ control }: { control: RunControl }): ReactElement {
  const dict = useDictionary()
  const navigate = useNavigate()
  // Named selectors rather than the whole store: a progress message during a
  // carve must not rebuild seventy rows.
  const values = useStore((state) => state.params.values)
  const violations = useStore((state) => state.params.violations)
  const phase = useStore((state) => state.run.phase)
  const mode = useStore((state) => state.ui.mode)
  const lang = useStore((state) => state.lang.lang)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  const commands = useMemo(
    () => buildCommands({ control, navigate: (path) => void navigate(path), dict }, useStore.getState()),
    // The snapshot is read inside, but these are what make it stale: every
    // field a row shows or is disabled by.
    [control, navigate, dict, values, violations, phase, mode, lang],
  )
  const hits = useMemo(() => matchCommands(commands, query), [commands, query])
  const current = hits[Math.min(active, hits.length - 1)]

  // The focus goes in on mount and comes back out on unmount. `jsx-a11y`
  // forbids the `autoFocus` attribute, and the return is spec §7.2's row.
  useEffect(() => {
    inputRef.current?.focus()
    return () => document.getElementById(TRIGGER_ID)?.focus()
  }, [])

  // Closing on a press outside the frame, rather than a handler on the
  // backdrop: a click handler on a plain div trips
  // `jsx-a11y/no-static-element-interactions`, and a press that begins inside
  // and ends outside should not close the dialog either.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const frame = frameRef.current
      if (frame !== null && event.target instanceof Node && !frame.contains(event.target)) {
        useStore.getState().ui.closePalette()
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const choose = (command: Command | undefined) => {
    if (command === undefined || command.disabled) return
    command.run()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      useStore.getState().ui.closePalette()
      return
    }
    // Nothing else in the frame takes the focus, so Tab has nowhere to go: the
    // trap is one line rather than a ring of sentinels.
    if (event.key === 'Tab') {
      event.preventDefault()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      choose(current)
      return
    }
    const last = hits.length - 1
    const next =
      event.key === 'ArrowDown'
        ? Math.min(active + 1, last)
        : event.key === 'ArrowUp'
          ? Math.max(active - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (next === null) return
    event.preventDefault()
    setActive(Math.max(0, next))
  }

  const rowId = (command: Command) => `cmd-${command.id}`
  const title = dict.t('cmdTitle')
  return (
    <div className="fw-scrim">
      <div className="fw-pal" role="dialog" aria-modal="true" aria-label={title} ref={frameRef}>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="cmd-list"
          aria-label={title}
          {...(current === undefined ? {} : { 'aria-activedescendant': rowId(current) })}
          placeholder={dict.t('cmdPlaceholder')}
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
        />
        <div className="list" id="cmd-list" role="listbox" aria-label={title}>
          {hits.map((command, at) => (
            <div
              key={command.id}
              id={rowId(command)}
              role="option"
              aria-selected={command === current}
              {...(command.disabled ? { 'aria-disabled': true } : {})}
              className="row"
              onMouseEnter={() => setActive(at)}
              onClick={() => choose(command)}
            >
              <span className="lab">{command.name}</span>
              <span className="g">{command.note}</span>
              <span className="v">{command.value}</span>
            </div>
          ))}
          {hits.length === 0 ? <p className="empty">{dict.t('cmdEmpty', query)}</p> : null}
        </div>
        <div className="foot">
          <span>
            <b>↑↓</b> {dict.t('cmdHintMove')}
          </span>
          <span>
            <b>↵</b> {dict.t('cmdHintChoose')}
          </span>
          <span>
            <b>esc</b> {dict.t('cmdHintClose')}
          </span>
          <span>
            <b>g</b> {dict.t('cmdHintGenerate')}
          </span>
          <span>
            <b>[ ]</b> {dict.t('cmdHintSeed')}
          </span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run both test files**

Run: `cd apps/lab && pnpm vitest run --project node src/design/palette.test.ts && pnpm vitest run --project chromium src/palette/CommandPalette.browser.test.tsx`
Expected: PASS.

- [ ] **Step 7: Lint, because this file is where the a11y rules bite**

Run: `pnpm nx run lab:lint && pnpm nx run lab:check`
Expected: clean. If `jsx-a11y` objects to `onClick` on the option row, give the row `tabIndex={-1}` — never a keyboard handler, because the keyboard is the input's (§7).

- [ ] **Step 8: Commit**

```bash
git add apps/lab/src/palette/CommandPalette.tsx apps/lab/src/palette/CommandPalette.browser.test.tsx apps/lab/src/design/palette.css apps/lab/src/design/palette.test.ts apps/lab/src/main.tsx
git commit -m "Draw the palette as a modal combobox over a listbox"
```

---

### Task 6: The ⌘K trigger and the global shortcut

**Files:**
- Modify: `apps/lab/src/shell/TopBar.tsx:52`
- Modify: `apps/lab/src/App.tsx` (mount the palette, add the hotkey)
- Test: `apps/lab/src/shell/TopBar.browser.test.tsx`
- Test: `apps/lab/src/routes/LabLayout.browser.test.tsx:185-207` (the Escape guard, split)

**Interfaces:**
- Consumes: `CommandPalette`, `TRIGGER_ID` from `../palette/CommandPalette`.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing tests**

In `apps/lab/src/shell/TopBar.browser.test.tsx`, add:

```tsx
  // Spec §9: the mock's trigger is a glyph and nothing else, so its name comes
  // from the dictionary and says what the glyph means.
  it('offers the palette under an accessible name that states the shortcut', async () => {
    const screen = await render(<TopBar />)
    const trigger = screen.getByRole('button', { name: 'Command palette (⌘K)' })
    await expect.element(trigger).toBeVisible()
    await trigger.click()
    expect(useStore.getState().ui.palette).toBe(true)
  })
```

Then replace the Escape case in `apps/lab/src/routes/LabLayout.browser.test.tsx` — the one reading `test('f toggles solo, and a modifier, a repeat or Escape does nothing', …)` — by keeping it as it stands **minus** its final Escape assertions, and adding two cases after it:

```tsx
// The reservation this splits was written when nothing owned Escape
// ("The palette of PR 7 owns Escape; nothing else binds it"). Both halves
// still matter: solo must not answer Escape, and the palette must.
test('Escape with the palette closed still leaves solo alone', async () => {
  await page.viewport(1400, 900)
  await mountApp('advanced')
  await loadRunDone()
  await userEvent.keyboard('f')
  expect(solo()).toBe(true)
  await userEvent.keyboard('{Escape}')
  expect(solo()).toBe(true)
  expect(useStore.getState().ui.palette).toBe(false)
  await userEvent.keyboard('f')
  expect(solo()).toBe(false)
}, 40_000)

test('⌘K opens the palette anywhere, Escape closes it, and solo is untouched either way', async () => {
  await page.viewport(1400, 900)
  await mountApp('advanced')
  await loadRunDone()
  await userEvent.keyboard('{Meta>}k{/Meta}')
  await expect.poll(() => useStore.getState().ui.palette).toBe(true)
  expect(solo()).toBe(false)
  await userEvent.keyboard('{Escape}')
  await expect.poll(() => useStore.getState().ui.palette).toBe(false)
  expect(solo()).toBe(false)
}, 40_000)

// The palette's search box is a field, and the `f` guard refuses fields — so
// typing `f` into the palette must not take the board full screen.
test('f typed into the palette is text, not a toggle', async () => {
  await page.viewport(1400, 900)
  await mountApp('advanced')
  await loadRunDone()
  await userEvent.keyboard('{Meta>}k{/Meta}')
  await expect.poll(() => useStore.getState().ui.palette).toBe(true)
  await userEvent.keyboard('f')
  expect(solo()).toBe(false)
}, 40_000)
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/lab && pnpm vitest run --project chromium src/shell/TopBar.browser.test.tsx src/routes/LabLayout.browser.test.tsx`
Expected: FAIL — no button by that name; ⌘K does nothing.

- [ ] **Step 3: Put the trigger in the bar**

In `apps/lab/src/shell/TopBar.tsx`, replace the comment `{/* ⌘K joins this group in PR 7. */}` and open the right group with the button:

```tsx
      <div className="right">
        <button
          type="button"
          id={TRIGGER_ID}
          aria-label={dict.t('cmdOpen')}
          onClick={() => useStore.getState().ui.openPalette()}
        >
          ⌘K
        </button>
```

with `import { TRIGGER_ID } from '../palette/CommandPalette'` added to the imports.

- [ ] **Step 4: Mount the palette and bind the shortcut**

In `apps/lab/src/App.tsx`, add a hook beside `useSoloKey`:

```tsx
/**
 * ⌘K, the application's one global shortcut in the literal sense: every route,
 * the documentation included, because navigation is half of what the palette
 * is for (spec §7). It differs from `f` in refusing nothing but a missing
 * modifier — it has to open while a knob is being typed into — and the
 * modifier is what keeps it from colliding with any typing at all.
 *
 * `<arrowz-board>` cannot swallow it: its own key handler returns at once on
 * `metaKey || ctrlKey || altKey` (arrowz-board.ts:832).
 */
function usePaletteKey() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'k' && event.key !== 'K') return
      if (!event.metaKey && !event.ctrlKey) return
      if (event.altKey || event.repeat || event.defaultPrevented) return
      event.preventDefault()
      useStore.getState().ui.togglePalette()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}
```

Call it in `Shell` beside the others (`usePaletteKey()`), and render the dialog as the last child of the shell's div, after `<AppRoutes />`:

```tsx
      <CommandPalette control={control} />
```

with `import { CommandPalette } from './palette/CommandPalette'` added.

- [ ] **Step 5: Run the tests**

Run: `cd apps/lab && pnpm vitest run --project chromium src/shell/TopBar.browser.test.tsx src/routes/LabLayout.browser.test.tsx`
Expected: PASS.

- [ ] **Step 6: Prove the guard can still fail**

Temporarily change `if (event.key !== 'k' && event.key !== 'K') return` to `if (event.key !== 'k') return` and run the LabLayout file again: the ⌘K case still passes (userEvent sends a lowercase `k`), which tells you that branch is **not** covered — then add `await userEvent.keyboard('{Meta>}K{/Meta}')` to the ⌘K case, watch it fail, and restore the condition. Revert the mutation before committing.

- [ ] **Step 7: Commit**

```bash
git add apps/lab/src/shell/TopBar.tsx apps/lab/src/shell/TopBar.browser.test.tsx apps/lab/src/App.tsx apps/lab/src/routes/LabLayout.browser.test.tsx
git commit -m "Open the palette from the bar and from anywhere with Cmd+K"
```

---

### Task 7: The jump — focus, then flash

**Files:**
- Create: `apps/lab/src/console/flash.ts`
- Create: `apps/lab/src/console/useFocusRequest.ts`
- Modify: `apps/lab/src/console/Console.tsx`
- Modify: `apps/lab/src/console/ViewPanel.tsx` (an id on each flag switch)
- Modify: `apps/lab/src/design/console.css` (the flash rule)
- Modify: `apps/lab/src/harness/mountApp.tsx` (cancel the flash timer)
- Test: `apps/lab/src/console/useFocusRequest.browser.test.tsx`

**Interfaces:**
- Consumes: `ui.focusTarget`, `ui.clearFocusRequest` (Task 2).
- Produces: `flash(node: Element | null): void`, `cancelFlash(): void`, `useFocusRequest(): void`.

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/console/useFocusRequest.browser.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { loadRunDone, mountApp } from '../harness/mountApp'
import { useStore } from '../state/store'
import { cancelFlash } from './flash'

beforeEach(() => {
  cancelFlash()
})

describe('a jump from the palette', () => {
  it('brings the knob group, focuses the control and outlines it', async () => {
    await page.viewport(1400, 900)
    const screen = await mountApp('advanced')
    await loadRunDone()
    await userEvent.keyboard('{Meta>}k{/Meta}')
    await userEvent.keyboard('seed')
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => useStore.getState().ui.palette).toBe(false)
    await expect.poll(() => document.activeElement?.id).toBe('knob-seed')
    // The request is consumed, so a later render cannot steal the focus again.
    expect(useStore.getState().ui.focusTarget).toBe(null)
    const knob = screen.container.querySelector('#knob-seed')?.closest('.fw-k')
    expect(knob?.classList.contains('flash')).toBe(true)
  }, 40_000)

  it('leaves the simple view for the one that has knobs', async () => {
    await page.viewport(1400, 900)
    await mountApp('simple')
    await loadRunDone()
    await userEvent.keyboard('{Meta>}k{/Meta}')
    await userEvent.keyboard('seed')
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => useStore.getState().ui.mode).toBe('advanced')
    await expect.poll(() => document.activeElement?.id).toBe('knob-seed')
  }, 40_000)

  it('reaches a preview field and a preview switch, which live in the other panel', async () => {
    await page.viewport(1400, 900)
    await mountApp('advanced')
    await loadRunDone()
    await userEvent.keyboard('{Meta>}k{/Meta}')
    await userEvent.keyboard('stroke width')
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => document.activeElement?.id).toBe('view-stroke')
    await userEvent.keyboard('{Meta>}k{/Meta}')
    await userEvent.keyboard('colour the arrows')
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => document.activeElement?.id).toBe('view-colored')
  }, 40_000)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/lab && pnpm vitest run --project chromium src/console/useFocusRequest.browser.test.tsx`
Expected: FAIL — `Failed to resolve import "./flash"`.

- [ ] **Step 3: Write the flash**

Create `apps/lab/src/console/flash.ts`:

```ts
/** How long a jumped-to knob keeps its outline — the mock's own figure. */
const FLASH_MS = 1200

/**
 * Module scope, like `library/notices.ts`'s fade and for the same reason
 * (Ruling 12): the timer outlives the component that armed it, and a
 * `clearTimeout` on unmount would cancel an outline the jump had just started.
 * It touches one class on one node and takes back only what it put there.
 */
let timer: ReturnType<typeof setTimeout> | undefined
let lit: Element | null = null

export function flash(node: Element | null): void {
  cancelFlash()
  if (node === null) return
  lit = node
  node.classList.add('flash')
  timer = setTimeout(() => {
    lit?.classList.remove('flash')
    lit = null
    timer = undefined
  }, FLASH_MS)
}

/** For tests, which must not leak an outline into the case after them. */
export function cancelFlash(): void {
  clearTimeout(timer)
  timer = undefined
  lit?.classList.remove('flash')
  lit = null
}
```

- [ ] **Step 4: Write the consumer**

Create `apps/lab/src/console/useFocusRequest.ts`:

```ts
import { useEffect } from 'react'
import { useStore } from '../state/store'
import { flash } from './flash'

/**
 * A jump waiting in `ui.focusTarget`, spent after the render that put its
 * control in the tree (spec §6). Mounted by `Console`, which is on screen for
 * both faces of the workspace: React commits the DOM and runs a parent's
 * effect after its children's, so the panel the jump asked for is already
 * there when this runs.
 *
 * The request is cleared whether or not the node was found — a target that no
 * longer exists must not sit in the store waiting to hijack the next render.
 */
export function useFocusRequest(): void {
  const target = useStore((state) => state.ui.focusTarget)
  useEffect(() => {
    if (target === null) return
    useStore.getState().ui.clearFocusRequest()
    const node = document.getElementById(target)
    if (node === null) return
    node.focus()
    // The focus ring alone is easy to lose among twenty-eight controls, which
    // is why the mock outlines the whole knob box as well.
    flash(node.closest('.fw-k'))
  }, [target])
}
```

- [ ] **Step 5: Mount it, give the switches ids, and add the rule**

In `apps/lab/src/console/Console.tsx`, inside `Console`, before the `return`:

```ts
  // The jump's consumer sits here rather than in a panel: the panels swap, and
  // a hook in the outgoing one would never see the request (spec §6).
  useFocusRequest()
```

In `apps/lab/src/console/ViewPanel.tsx`, inside `ViewFlagSwitch`, give the button its own id beside the label it already points at:

```tsx
        <button
          type="button"
          id={`view-${flag}`}
          className="fw-sw"
```

In `apps/lab/src/design/console.css`, beside the other `.fw-k` rules:

```css
/* A knob the palette jumped to, for 1200 ms (flash.ts). The outline is the
   mock's, and it sits outside the box so it cannot move the layout. */
.fw-k.flash {
  outline: 1px solid var(--signal);
  outline-offset: 4px;
}
```

In `apps/lab/src/harness/mountApp.tsx`, add `cancelFlash()` beside `cancelNoticeFade()` and import it from `../console/flash`.

- [ ] **Step 6: Run the test**

Run: `cd apps/lab && pnpm vitest run --project chromium src/console/useFocusRequest.browser.test.tsx`
Expected: PASS, all three cases.

- [ ] **Step 7: Prove the flash test can fail**

Comment out the `flash(node.closest('.fw-k'))` line and run the first case: it must go red on the `classList.contains('flash')` assertion. Restore it.

- [ ] **Step 8: Commit**

```bash
git add apps/lab/src/console/flash.ts apps/lab/src/console/useFocusRequest.ts apps/lab/src/console/useFocusRequest.browser.test.tsx apps/lab/src/console/Console.tsx apps/lab/src/console/ViewPanel.tsx apps/lab/src/design/console.css apps/lab/src/harness/mountApp.tsx
git commit -m "Land a palette jump on the control itself, and outline it"
```

---

### Task 8: `g`, `[` and `]`

**Files:**
- Modify: `apps/lab/src/App.tsx`
- Test: `apps/lab/src/routes/LabLayout.browser.test.tsx`

**Interfaces:**
- Consumes: `generate`, `stepSeed` from `run/actions.ts` (Task 3); `RunControl`.
- Produces: nothing.

**These are the footer's promise made real (spec D5).** They carry every guard `useSoloKey` earned, and they live where `f` lives — the workspace, not the documentation.

- [ ] **Step 1: Write the failing test**

Append to `apps/lab/src/routes/LabLayout.browser.test.tsx`:

```tsx
// Spec D5. The same guard set as `f`, and each refusal is followed by the very
// same event without the thing refused, so a listener ignoring synthetic
// events could not pass.
test('g generates, and refuses a modifier, a repeat, a cancelled event and a field', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  const seedBefore = useStore.getState().params.values.seed

  for (const refused of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true }]) {
    press(document.body, { key: 'g', ...refused })
  }
  expect(useStore.getState().run.phase).toBe('done')

  press(document.body, { key: 'g' })
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  expect(useStore.getState().params.values.seed).toBe(seedBefore)

  // Typed into a knob's own entry, `g` is text.
  await screen.getByRole('tab', { name: 'board', exact: true }).click()
  await screen.getByRole('button', { name: /^seed:/ }).click()
  const runs = useStore.getState().run.phase
  await userEvent.keyboard('g')
  expect(useStore.getState().run.phase).toBe(runs)
}, 60_000)

test('] and [ step the seed by one and carve it', async () => {
  await page.viewport(1400, 900)
  await mountApp('advanced')
  await loadRunDone()
  const before = useStore.getState().params.values.seed

  press(document.body, { key: ']' })
  expect(useStore.getState().params.values.seed).toBe(before + 1)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')

  press(document.body, { key: '[' })
  expect(useStore.getState().params.values.seed).toBe(before)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')

  // Ruling 3: the machine path must not also wake auto-generate.
  const edits = useStore.getState().params.edits
  press(document.body, { key: ']' })
  expect(useStore.getState().params.edits).toBe(edits)
}, 60_000)

test('the run keys are the workspace’s, like f: the documentation route has none of them', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await screen.getByRole('tab', { name: 'Docs' }).click()
  await expect.poll(() => window.location.pathname).toBe('/docs/element')
  const seed = useStore.getState().params.values.seed
  press(document.body, { key: ']' })
  expect(useStore.getState().params.values.seed).toBe(seed)
}, 40_000)
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/lab && pnpm vitest run --project chromium src/routes/LabLayout.browser.test.tsx`
Expected: FAIL — the seed does not move.

- [ ] **Step 3: Write the hook**

In `apps/lab/src/App.tsx`, beside `useSoloKey`:

```tsx
/**
 * The two hotkeys the palette's footer advertises (spec D5): `g` generates and
 * `[` / `]` step the seed and carve it — the experimenter's loop of flipping
 * through boards from one setting.
 *
 * Every guard `f` carries, for the same reasons: no Ctrl/⌘/Alt (those belong
 * to the platform), no key repeat, nothing mid-composition in an IME, nothing
 * already handled by someone closer to the keystroke, and nothing typed into a
 * field — which is also what silences these keys while the palette is open,
 * its search box being an `<input>`.
 *
 * A refused run says nothing here: `useRun` refuses a broken rule silently and
 * `RunStatusBar` is the one voice (Ruling 13).
 */
function useRunKeys(onWorkspace: boolean, control: RunControl) {
  useEffect(() => {
    if (!onWorkspace) return
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
      if (event.isComposing || event.defaultPrevented) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select') !== null)
      ) {
        return
      }
      if (event.key === 'g' || event.key === 'G') generate(control)
      else if (event.key === ']') stepSeed(control, 1)
      else if (event.key === '[') stepSeed(control, -1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onWorkspace, control])
}
```

with `import { generate, stepSeed } from './run/actions'` and `import type { RunControl } from './run/useRun'` added, and `useRunKeys(onWorkspace, control)` called in `Shell` beside `useSoloKey(onWorkspace)`.

- [ ] **Step 4: Run the tests**

Run: `cd apps/lab && pnpm vitest run --project chromium src/routes/LabLayout.browser.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run both gates**

Run: `deno task verify`
Expected: PASS (the dictionary change of Task 1 is what this covers).

Run: `pnpm nx run-many -t verify`
Expected: 25 targets, all green.

- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/App.tsx apps/lab/src/routes/LabLayout.browser.test.tsx
git commit -m "Make the footer's two promised hotkeys real"
```

---

### Task 9: Retire the reservations that this work spent

**Files:**
- Modify: `apps/lab/src/stage/Stage.tsx:6`
- Modify: `apps/lab/src/design/tokens.css:13`
- Modify: `apps/lab/src/App.tsx` (the `useSoloKey` docblock)
- Modify: `docs/superpowers/specs/2026-09-13-lab-react-app-design.md:1012`

**Why this is a task and not a chore:** five comments in the tree promise "PR 7". Three of those promises are now kept and two are not, and a comment that describes a delivery which already happened is worse than no comment — it sends the next reader looking for work that is done. Nothing here changes behaviour, so it carries no test of its own; the gates are the proof that it changed nothing.

- [ ] **Step 1: Rewrite the three spent reservations**

`apps/lab/src/stage/Stage.tsx` — the rail is still empty, but the palette is no longer what fills it:

```tsx
/**
 * 70px + 1fr: the mock's run rail and the board beside it. The rail is empty
 * until the run filmstrip fills it — still undelivered, row 7 of the lab
 * spec's §10, with the command palette split out of that row and shipped; the
 * column stays, so the board's width does not move when it arrives. The report
 * is the third track above 900px and a row under both below it (shell.css).
 */
```

`apps/lab/src/design/tokens.css:13` — the dialog exists now:

```
   On `:root` and not on `.fw`: anything rendered outside the shell's own div —
   the document reset in shell.css, or the command palette's own scrim, which
   sits over the whole viewport — would otherwise resolve every `var(--…)` to
   nothing.
```

`apps/lab/src/App.tsx`, in `useSoloKey`'s docblock, replace "Escape is not handled: the palette of PR 7 owns it." with:

```
 * Escape is not handled here: the command palette owns it, and closes on it
 * (`usePaletteKey`, and the dialog's own handler).
```

- [ ] **Step 2: Mark the spec's row 7 as partly delivered**

In `docs/superpowers/specs/2026-09-13-lab-react-app-design.md`, row 7 of the §10 table becomes:

```
| 7 | v2 additions. **The ⌘K palette is delivered** (`docs/superpowers/specs/2026-09-21-lab-command-palette-design.md`), together with the `g` and `[` `]` hotkeys its footer advertises. Still open: the run filmstrip (parameters, metrics, thumbnail; selection reloads) and the parameter diff with focus parity |
```

- [ ] **Step 3: Check that nothing in the tree still promises what shipped**

Run: `grep -rn "PR 7" apps/lab/src packages`
Expected: exactly two hits, both about the filmstrip — `Stage.tsx` (rewritten above, so adjust the grep expectation if your wording drops the phrase) and `LabLayout.browser.test.tsx:201`'s successor, which Task 6 already rewrote. Anything else is a promise this work kept but did not withdraw.

- [ ] **Step 4: Run both gates one last time**

Run: `deno task verify && pnpm nx run-many -t verify`
Expected: green, both.

- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/stage/Stage.tsx apps/lab/src/design/tokens.css apps/lab/src/App.tsx docs/superpowers/specs/2026-09-13-lab-react-app-design.md
git commit -m "Withdraw the reservations this work spent, and keep the two it did not"
```

---

## Before the PR

- **A live run in Chrome**, as every lab PR in this repo has had: two processes — `deno task store` (port 8777) and `pnpm nx serve lab` (8779). Read the port from the server's own output, never from memory: a `TaskStop` that reports success can leave a vite process alive, and the next server quietly takes 8780 while you measure the old `dist`.
- Check by hand, at 1280×800: ⌘K opens from the lab, the library and the docs; the input has the focus; typing filters; ↑↓ moves the highlight; Enter on a knob lands the focus on that control with the outline visible; Escape closes and the ring returns to the ⌘K button; a preset row carves; `g` carves; `]` and `[` walk the seed; the console stays silent throughout.
- Both gates green **without cache**: `deno task verify` and `pnpm nx run-many -t verify --skip-nx-cache`.
