# Lab responsive layout (handoff 2, PR 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The lab and the saved boards lay themselves out in five width bands (XL/L/M/S/XS) and a low-window variant, with the run column as a bar under the board at M/S and bottom sheets on a phone.

**Architecture:** CSS owns the layout; every new element is always in the DOM and shown by media queries. JavaScript knows only the band, through one `matchMedia` module (`state/band.ts`) and its hooks (`shell/useLayoutBand.ts`), and uses it for three things: where `PresetStrip` stands, resetting transient state when the band changes, and the settings drawer's start state. New UI state is `ui.sheet` and `ui.menu`; the `…` popover keeps its own state.

**Tech Stack:** React 19, zustand, Vitest 4 (projects `node` and `chromium` with Playwright), plain CSS in `apps/lab/src/design/*.css`, the dictionary in `packages/engine/lab-i18n.ts` (read by the lab from `packages/engine/dist`).

**Spec:** `docs/superpowers/specs/2026-09-23-lab-responsive-design.md`

## Global Constraints

- Everything in the repository is in English; the dictionary carries the Polish strings.
- Every new visible string lives in `packages/engine/lab-i18n.ts` in `EN` and `PL`; after editing it run `pnpm nx build engine` before any lab test or look at the page (the lab reads `dist`).
- No `any`, no non-null assertions (`@typescript-eslint/no-non-null-assertion` is an error in `apps/lab`).
- `react-hooks` recommended rules are on: no `setState` inside an effect body, no ref read during render.
- Bands: XL ≥ 1600, L 1280–1599, M 1024–1279, S 768–1023, XS < 768; low = `(max-height: 699px) and (min-width: 768px)`.
- `.fw.rwd` from the package becomes `.fw`; the `RWD on/off` tweak is not ported.
- Nothing may appear or vanish among `Stage`'s siblings inside `.fw-lab`: a slot that can be empty holds `null` (`routes/Workspace.tsx`, Ruling 6).
- A rule that sets `display` on an element carrying `hidden` goes through `:not([hidden])` or is paired with `[hidden] { display: none }`.
- The switch stays 36×18 with a 44×44 `::before` target under a finger (PR 4); the package's 48×26 is not ported.
- ⌘K's touch label is "command palette" / "paleta poleceń" (contained in its accessible name, WCAG 2.5.3).
- Browser tests do not load stylesheets unless they import them (harness fact 38); only `LayoutInvariants.browser.test.tsx`, `LabLayout`, `DocsLayout`, `Workspace`, `knobgrid` and `touch` import CSS.
- The default test viewport is 414×896 — the XS band after this PR (harness fact 23); `page.viewport` outlives the case that set it (fact 18). Every geometry case sets its own viewport.
- The store is created at import (`vitest.setup.ts` comment), so `createUiSlice`'s start value is read at the iframe's size at import.
- `lab:fmt` only checks (fact 50). Format with `pnpm -C apps/lab exec prettier --write <files>`.
- Gates per task: `pnpm nx run lab:check`, `pnpm nx run lab:lint`, and the named tests; after any CSS change also `pnpm -C apps/lab exec vitest run --project node` (fact 49). In a fresh worktree run `pnpm nx run lab:check` first (it builds `^build`).
- Commit before running a mutation; revert a mutation by hand and confirm `git diff` is empty ([[feedback-plan-cytuje-z-pliku]]). Every mutation names the assertion it turns red.
- No attribution lines in commits.

## Review Focus

1. **Resizing across 1024 with the drawer open, then back.** A person narrowing a desktop window expects the drawer to get out of the board's way, and on widening again to find it as they left it on the desktop. Pinned in Task 3 (`the drawer comes back on widening`), both directions, with storage read afterwards.
2. **A remembered `report: true` on a phone.** Invisible at XS; Escape must not silently flip it, and widening must show it again. Pinned in Task 3 (`Escape at XS closes a sheet and nothing else`).
3. **Solo (`f`) at every band, with a sheet open.** Solo must win: no sheet, no sheet bar, board fills the panel. Pinned in Task 10 (`solo at XS hides the sheet and the sheet bar`) and in the matrix's `solo` state (Task 8).
4. **Polish at 768 and 924×540.** Polish labels are longer than the package assumes (the PR 6 live pass). The M/S bar and the top bar with presets must hold in Polish. Pinned in Task 8 (`LANG_CASES` gains 1024×768, 768×1024, 924×540, 375×812).
5. **Tabbing into a closed `…` popover or a hidden sheet.** A closed popover's switches and exports and a closed sheet's knobs must not take focus at M/S/XS. Pinned in Task 10 (`closed sheets and a closed popover hold no focusable box`).

---

## File map

- Create `apps/lab/src/state/band.ts` — the band queries, `readBand`, `readLow`, `subscribeBand`. No React, no store.
- Create `apps/lab/src/state/band.test.ts` (node) — the no-window fallbacks.
- Create `apps/lab/src/shell/useLayoutBand.ts` — `useBand()`, `useLowWindow()` over `useSyncExternalStore`.
- Create `apps/lab/src/shell/useLayoutBand.browser.test.tsx`.
- Modify `apps/lab/src/state/ui.slice.ts` — `Sheet`, `sheet`, `menu`, start value of `settings`, `closeSettingsForNarrow`, `restoreSettings`.
- Modify `apps/lab/src/state/ui.slice.test.ts`, `apps/lab/src/state/preferences.browser.test.ts`, `apps/lab/src/harness/mountApp.tsx`.
- Modify `apps/lab/src/App.tsx` — `useBandReset`, the XS keys, `menu-open`, presets placement.
- Create `apps/lab/src/shell/bands.browser.test.tsx` — band reset and keys.
- Create `apps/lab/src/shell/SheetBar.tsx`, `apps/lab/src/shell/SheetBar.browser.test.tsx`.
- Modify `apps/lab/src/routes/Workspace.tsx` — sheet class, `presets-top`, `SheetBar`.
- Modify `apps/lab/src/run/RunColumn.tsx`, `apps/lab/src/library/BoardColumn.tsx` — ids, `MoreMenu`.
- Create `apps/lab/src/run/MoreMenu.tsx`, `apps/lab/src/run/MoreMenu.browser.test.tsx`.
- Modify `apps/lab/src/shell/TopBar.tsx`, `apps/lab/src/shell/TopBar.browser.test.tsx`.
- Modify `apps/lab/src/run/PresetStrip.tsx` (focus without scroll), `apps/lab/src/run/PresetStrip.browser.test.tsx`.
- Modify `packages/engine/lab-i18n.ts`.
- Modify `apps/lab/src/harness/invariants.ts`, `apps/lab/src/routes/LayoutInvariants.browser.test.tsx`.
- Modify `apps/lab/src/design/shell.css`, `console.css`, `run.css`, `library.css`, `docs.css`, `touch.browser.test.tsx`.
- Modify `apps/lab/src/routes/LabLayout.browser.test.tsx` (locators that the sheet bar makes ambiguous).

---

### Task 1: The band module and its hooks

Model: Sonnet.

**Files:**
- Create: `apps/lab/src/state/band.ts`
- Create: `apps/lab/src/state/band.test.ts`
- Create: `apps/lab/src/shell/useLayoutBand.ts`
- Create: `apps/lab/src/shell/useLayoutBand.browser.test.tsx`

**Interfaces:**
- Produces: `type Band = 'xl' | 'l' | 'm' | 's' | 'xs'`; `readBand(): Band`; `readLow(): boolean`; `narrow(band: Band): boolean` (true for `s` and `xs`); `subscribeBand(onChange: () => void): () => void` — all from `state/band.ts`. `useBand(): Band` and `useLowWindow(): boolean` from `shell/useLayoutBand.ts`.

- [ ] **Step 1: Write the failing node test**

`apps/lab/src/state/band.test.ts`:

```ts
import { expect, test } from 'vitest'
import { narrow, readBand, readLow } from './band'

// The node project has no `window` at all: the store imports this module, so
// it must answer without one. The widest band keeps a remembered preference
// deciding (spec §4), and no window is never a low one.
test('with no window the band is the widest and the window is not low', () => {
  expect(typeof window).toBe('undefined')
  expect(readBand()).toBe('xl')
  expect(readLow()).toBe(false)
})

test('only S and XS are narrow', () => {
  expect((['xl', 'l', 'm', 's', 'xs'] as const).map(narrow)).toEqual([false, false, false, true, true])
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm -C apps/lab exec vitest run --project node src/state/band.test.ts`
Expected: FAIL — `Failed to resolve import "./band"`.

- [ ] **Step 3: Write `state/band.ts`**

```ts
/**
 * The lab's width bands and its low window (handoff 2, PR 7), read from
 * `matchMedia` so JavaScript agrees with the stylesheets to the pixel: the
 * same queries decide both. XL ≥ 1600, L 1280–1599, M 1024–1279, S 768–1023,
 * XS < 768; low is under 700px tall and at least 768 wide.
 *
 * No React and no store: the ui slice reads the start band from here at
 * import, and the node test project imports the store with no `window`.
 */
export type Band = 'xl' | 'l' | 'm' | 's' | 'xs'

const FLOORS: readonly (readonly [Exclude<Band, 'xs'>, string])[] = [
  ['xl', '(min-width: 1600px)'],
  ['l', '(min-width: 1280px)'],
  ['m', '(min-width: 1024px)'],
  ['s', '(min-width: 768px)'],
]
const LOW = '(max-height: 699px) and (min-width: 768px)'

function media(query: string): MediaQueryList | null {
  return typeof window === 'undefined' || typeof window.matchMedia !== 'function' ? null : window.matchMedia(query)
}

/** The band the window is in now; the widest with no window to ask. */
export function readBand(): Band {
  for (const [band, query] of FLOORS) {
    const list = media(query)
    if (list === null) return 'xl'
    if (list.matches) return band
  }
  return 'xs'
}

/** The window is under 700px tall and at least 768 wide. */
export function readLow(): boolean {
  return media(LOW)?.matches ?? false
}

/** Below 1024px the settings drawer has no room beside the board (spec D3). */
export function narrow(band: Band): boolean {
  return band === 's' || band === 'xs'
}

/** Calls `onChange` whenever any of the band or low queries flips. */
export function subscribeBand(onChange: () => void): () => void {
  const lists = [...FLOORS.map(([, query]) => query), LOW]
    .map(media)
    .filter((list): list is MediaQueryList => list !== null)
  for (const list of lists) list.addEventListener('change', onChange)
  return () => {
    for (const list of lists) list.removeEventListener('change', onChange)
  }
}
```

- [ ] **Step 4: Run the node test**

Run: `pnpm -C apps/lab exec vitest run --project node src/state/band.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing browser test**

`apps/lab/src/shell/useLayoutBand.browser.test.tsx`:

```tsx
import { expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { useBand, useLowWindow } from './useLayoutBand'

function Probe() {
  return <p data-testid="probe">{`${useBand()} ${useLowWindow() ? 'low' : 'tall'}`}</p>
}

// Both sides of every edge the stylesheets use, so an off-by-one query
// (1279 vs 1280) is caught here and not by eye.
test.each([
  [1600, 900, 'xl tall'],
  [1599, 900, 'l tall'],
  [1280, 900, 'l tall'],
  [1279, 900, 'm tall'],
  [1024, 900, 'm tall'],
  [1023, 900, 's tall'],
  [768, 900, 's tall'],
  [767, 900, 'xs tall'],
  [924, 540, 's low'],
  [924, 699, 's low'],
  [924, 700, 's tall'],
  [600, 500, 'xs tall'],
] as const)('%d×%d reads %s', async (w, h, text) => {
  await page.viewport(w, h)
  const screen = await render(<Probe />)
  await expect.element(screen.getByTestId('probe')).toHaveTextContent(text)
})

test('a resize is followed without a remount', async () => {
  await page.viewport(1400, 900)
  const screen = await render(<Probe />)
  await expect.element(screen.getByTestId('probe')).toHaveTextContent('l tall')
  await page.viewport(900, 600)
  await expect.element(screen.getByTestId('probe')).toHaveTextContent('s low')
})
```

- [ ] **Step 6: Run it to see it fail**

Run: `pnpm -C apps/lab exec vitest run --project chromium src/shell/useLayoutBand.browser.test.tsx`
Expected: FAIL — cannot resolve `./useLayoutBand`.

- [ ] **Step 7: Write `shell/useLayoutBand.ts`**

```ts
import { useSyncExternalStore } from 'react'
import { type Band, readBand, readLow, subscribeBand } from '../state/band'

/** The window's band, re-rendering when it changes (state/band.ts). */
export function useBand(): Band {
  return useSyncExternalStore(subscribeBand, readBand, () => 'xl')
}

/** The low window: under 700px tall, at least 768 wide. */
export function useLowWindow(): boolean {
  return useSyncExternalStore(subscribeBand, readLow, () => false)
}
```

- [ ] **Step 8: Run the browser test**

Run: `pnpm -C apps/lab exec vitest run --project chromium src/shell/useLayoutBand.browser.test.tsx`
Expected: PASS (13 tests).

- [ ] **Step 9: Commit**

```bash
git add apps/lab/src/state/band.ts apps/lab/src/state/band.test.ts apps/lab/src/shell/useLayoutBand.ts apps/lab/src/shell/useLayoutBand.browser.test.tsx
git commit -m "Read the lab's width bands and its low window from matchMedia"
```

- [ ] **Step 10: Mutation**

Change `'(min-width: 1280px)'` to `'(min-width: 1279px)'` in `band.ts`. Run the browser test: `1279×900 reads m tall` turns red (reads `l tall`). Revert, `git diff` empty.

---

### Task 2: Sheet, menu and the drawer's start state in the ui slice

Model: Sonnet.

**Files:**
- Modify: `apps/lab/src/state/ui.slice.ts:37-143`
- Modify: `apps/lab/src/state/ui.slice.test.ts`
- Modify: `apps/lab/src/state/preferences.browser.test.ts:54-66`
- Modify: `apps/lab/src/harness/mountApp.tsx:22-43`

**Interfaces:**
- Consumes: `readBand`, `narrow` from `state/band.ts` (Task 1).
- Produces on `UiState`: `sheet: Sheet | null`; `menu: boolean`; `setSheet(sheet: Sheet | null): void`; `toggleSheet(sheet: Sheet): void`; `setMenu(on: boolean): void`; `toggleMenu(): void`; `closeSettingsForNarrow(): void` (closes, writes nothing); `restoreSettings(): void` (reads the remembered value). Exported `type Sheet = 'settings' | 'cli' | 'report'`.

- [ ] **Step 1: Write the failing node tests**

Append to `apps/lab/src/state/ui.slice.test.ts`, inside the existing `describe('the switches the run column owns', …)` block (it defines `slice()`):

```ts
  // Handoff 2, PR 7: the phone's bottom sheets and the top bar's menu. One
  // sheet at a time; the same sheet pressed again closes it.
  it('opens one sheet at a time and closes it on a second press', () => {
    const store = slice()
    expect(store.ui.sheet).toBeNull()
    store.ui.toggleSheet('cli')
    expect(store.ui.sheet).toBe('cli')
    store.ui.toggleSheet('report')
    expect(store.ui.sheet).toBe('report')
    store.ui.toggleSheet('report')
    expect(store.ui.sheet).toBeNull()
    store.ui.setSheet('settings')
    expect(store.ui.sheet).toBe('settings')
  })

  it('opens and closes the top bar menu', () => {
    const store = slice()
    expect(store.ui.menu).toBe(false)
    store.ui.toggleMenu()
    expect(store.ui.menu).toBe(true)
    store.ui.setMenu(false)
    expect(store.ui.menu).toBe(false)
  })

  it('closes the settings drawer for a narrow window and restores it', () => {
    const store = slice()
    expect(store.ui.settings).toBe(true)
    store.ui.closeSettingsForNarrow()
    expect(store.ui.settings).toBe(false)
    // No storage in the node project (`readStored` returns null): the
    // remembered value is the default, open.
    store.ui.restoreSettings()
    expect(store.ui.settings).toBe(true)
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm -C apps/lab exec vitest run --project node src/state/ui.slice.test.ts`
Expected: FAIL — `store.ui.toggleSheet is not a function` (and the two others).

- [ ] **Step 3: Implement in `ui.slice.ts`**

Add the import at the top: `import { narrow, readBand } from './band'`.

After `export type BoardsPanel = 'list' | 'preview'` add:

```ts
/**
 * The phone's bottom sheets (handoff 2, PR 7): the settings drawer, the right
 * column and the report, one at a time over the board. Never remembered, never
 * in the hash.
 */
export type Sheet = 'settings' | 'cli' | 'report'
```

In `UiState`, after `settings: boolean` and its comment, add:

```ts
  /** The open bottom sheet at XS, or none. */
  sheet: Sheet | null
  /** The top bar's menu is open at XS. Never remembered, never in the hash. */
  menu: boolean
```

and after `toggleSettings(): void` add:

```ts
  setSheet(sheet: Sheet | null): void
  toggleSheet(sheet: Sheet): void
  setMenu(on: boolean): void
  toggleMenu(): void
  /** Closes the drawer for a window below 1024px without remembering it (spec D3). */
  closeSettingsForNarrow(): void
  /** Puts the remembered drawer back, for a window 1024px or wider again. */
  restoreSettings(): void
```

Replace the comment and the line `settings: readStored(SETTINGS_KEY) !== 'closed',` with:

```ts
    // Below 1024px the open drawer lies over the board, so a narrow page
    // starts with it closed whatever was remembered on a desktop (spec D3);
    // with no window to ask (the node project) the remembered value decides.
    settings: !narrow(readBand()) && readStored(SETTINGS_KEY) !== 'closed',
    sheet: null,
    menu: false,
```

After the `toggleSettings` action add:

```ts
    setSheet: (sheet) => patch({ sheet }),
    // Read inside the update, like `toggleReport`: a key and a press can both
    // fire before a render.
    toggleSheet: (sheet) =>
      set((state) => ({ ui: { ...state.ui, sheet: state.ui.sheet === sheet ? null : sheet } })),
    setMenu: (menu) => patch({ menu }),
    toggleMenu: () => set((state) => ({ ui: { ...state.ui, menu: !state.ui.menu } })),
    closeSettingsForNarrow: () => patch({ settings: false }),
    restoreSettings: () => patch({ settings: readStored(SETTINGS_KEY) !== 'closed' }),
```

- [ ] **Step 4: Run the node tests**

Run: `pnpm -C apps/lab exec vitest run --project node src/state/ui.slice.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite the preference test against a viewport**

In `apps/lab/src/state/preferences.browser.test.ts` add `import { page } from 'vitest/browser'` and replace the test at lines 54–66 with:

```ts
// The slices below are created after `page.viewport`, so `createUiSlice` reads
// the band the case chose. The harness's default 414×896 is XS since handoff
// 2, PR 7, where the drawer starts closed whatever is remembered (spec D3).
test('the settings drawer is remembered as open or closed, and opens unless closed was stored', async () => {
  await page.viewport(1400, 900)
  useStore.getState().ui.setSettings(false)
  expect(localStorage.getItem('labSettings')).toBe('closed')
  useStore.getState().ui.toggleSettings()
  expect(localStorage.getItem('labSettings')).toBe('open')
  localStorage.setItem('labSettings', 'closed')
  const store: { ui: UiState } = { ui: createUiSlice((fn) => Object.assign(store, fn(store))) }
  expect(store.ui.settings).toBe(false)
  localStorage.setItem('labSettings', 'nonsense')
  const other: { ui: UiState } = { ui: createUiSlice((fn) => Object.assign(other, fn(other))) }
  expect(other.ui.settings).toBe(true)
  localStorage.removeItem('labSettings')
})

test('below 1024px the drawer starts closed and closing it there writes nothing', async () => {
  localStorage.setItem('labSettings', 'open')
  await page.viewport(900, 900)
  const narrowPage: { ui: UiState } = { ui: createUiSlice((fn) => Object.assign(narrowPage, fn(narrowPage))) }
  expect(narrowPage.ui.settings).toBe(false)
  await page.viewport(1400, 900)
  const wide: { ui: UiState } = { ui: createUiSlice((fn) => Object.assign(wide, fn(wide))) }
  expect(wide.ui.settings).toBe(true)
  wide.ui.closeSettingsForNarrow()
  expect(wide.ui.settings).toBe(false)
  expect(localStorage.getItem('labSettings')).toBe('open')
  wide.ui.restoreSettings()
  expect(wide.ui.settings).toBe(true)
  localStorage.removeItem('labSettings')
})
```

- [ ] **Step 6: Reset the new fields in `resetApp`**

In `apps/lab/src/harness/mountApp.tsx`, after `state.ui.setSettings(true)` add:

```ts
  state.ui.setSheet(null)
  state.ui.setMenu(false)
```

(Fact 51: `Workspace.browser.test.tsx` has its own local reset; grep it for `setSettings(true)` and add the same two lines beside it.)

- [ ] **Step 7: Run the browser preference test and the whole suite**

Run: `pnpm -C apps/lab exec vitest run --project chromium src/state/preferences.browser.test.ts`
Expected: PASS.
Run: `pnpm nx run lab:test`
Expected: PASS. A case that now fails because it read `ui.settings` from the store's start value at 414 (not through `resetApp`) is fixed by setting `ui.setSettings(true)` or the viewport in that case, never by changing the slice. List every such case in the commit message.

- [ ] **Step 8: Commit**

```bash
git add apps/lab/src/state apps/lab/src/harness/mountApp.tsx apps/lab/src/routes/Workspace.browser.test.tsx
git commit -m "Hold the phone's sheet and menu in the ui slice, and start the drawer closed below 1024px"
```

- [ ] **Step 9: Mutations**

1. In `ui.slice.ts` replace `!narrow(readBand()) && ` with nothing. Run `preferences.browser.test.ts`: `below 1024px the drawer starts closed…` turns red on `expect(narrowPage.ui.settings).toBe(false)`. Revert.
2. Make `closeSettingsForNarrow` call `writeStored(SETTINGS_KEY, 'closed')` before its patch. Same test turns red on `expect(localStorage.getItem('labSettings')).toBe('open')`. Revert, `git diff` empty.

---

### Task 3: The band reset and the keys at XS

Model: Opus (StrictMode, effect ordering, fact 52).

**Files:**
- Modify: `apps/lab/src/App.tsx:141-172` (`useDrawerKeys`), `:199-256` (`Shell`)
- Create: `apps/lab/src/shell/bands.browser.test.tsx`

**Interfaces:**
- Consumes: `useBand`, `useLowWindow` (Task 1); `readBand`, `narrow` (Task 1); `setSheet`, `toggleSheet`, `setMenu`, `closeSettingsForNarrow`, `restoreSettings`, `menu` (Task 2).
- Produces: `.fw.menu-open` on the shell's root while `ui.menu` is true; `useBandReset()` inside `App.tsx` (not exported).

- [ ] **Step 1: Write the failing tests**

`apps/lab/src/shell/bands.browser.test.tsx`:

```tsx
import { act, StrictMode } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { App } from '../App'
import { loadRunDone, mountApp, resetApp } from '../harness/mountApp'
import { useStore } from '../state/store'

const ui = () => useStore.getState().ui

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  return () => vi.restoreAllMocks()
})

// Review Focus 1: narrowing past 1024 takes the drawer out of the board's
// way without forgetting the desktop's choice; widening puts it back.
test('the drawer closes below 1024 and comes back on widening', async () => {
  await page.viewport(1400, 900)
  await mountApp('advanced')
  await loadRunDone()
  expect(ui().settings).toBe(true)
  await page.viewport(900, 900)
  await expect.poll(() => ui().settings).toBe(false)
  expect(localStorage.getItem('labSettings')).toBe('open')
  await page.viewport(1400, 900)
  await expect.poll(() => ui().settings).toBe(true)
})

test('a band change closes the sheet and the menu', async () => {
  await page.viewport(600, 900)
  await mountApp('advanced')
  await loadRunDone()
  await act(async () => {
    ui().setSheet('cli')
    ui().setMenu(true)
  })
  await page.viewport(375, 812)
  // Same band (XS): nothing moves.
  expect(ui().sheet).toBe('cli')
  await page.viewport(900, 900)
  await expect.poll(() => ui().sheet).toBeNull()
  expect(ui().menu).toBe(false)
})

// StrictMode runs the mount effect twice; the second pass is not a change.
test('mounting under StrictMode is not a band change', async () => {
  await page.viewport(900, 900)
  resetApp('advanced')
  await act(async () => ui().setSheet('report'))
  await render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  await loadRunDone()
  expect(ui().settings).toBe(true)
  expect(ui().sheet).toBe('report')
})

// Review Focus 2: at XS the drawers exist only as sheets.
test('at XS r and s toggle sheets, and Escape closes a sheet and nothing else', async () => {
  await page.viewport(375, 812)
  await mountApp('advanced')
  await loadRunDone()
  await act(async () => ui().setReport(true))
  await userEvent.keyboard('s')
  expect(ui().sheet).toBe('settings')
  await userEvent.keyboard('r')
  expect(ui().sheet).toBe('report')
  await userEvent.keyboard('r')
  expect(ui().sheet).toBeNull()
  await userEvent.keyboard('s')
  await userEvent.keyboard('{Escape}')
  expect(ui().sheet).toBeNull()
  await userEvent.keyboard('{Escape}')
  expect(ui().report).toBe(true)
  expect(ui().settings).toBe(true)
})

test('above XS Escape closes an open sheet before the report', async () => {
  await page.viewport(1400, 900)
  await mountApp('advanced')
  await loadRunDone()
  await act(async () => {
    ui().setReport(true)
    ui().setSheet('cli')
  })
  await userEvent.keyboard('{Escape}')
  expect(ui().sheet).toBeNull()
  expect(ui().report).toBe(true)
  await userEvent.keyboard('{Escape}')
  expect(ui().report).toBe(false)
})

test('the root carries menu-open while the menu is open', async () => {
  await page.viewport(375, 812)
  const screen = await mountApp('advanced')
  await act(async () => ui().setMenu(true))
  expect(screen.container.querySelector('.fw')?.classList.contains('menu-open')).toBe(true)
  await act(async () => ui().setMenu(false))
  expect(screen.container.querySelector('.fw')?.classList.contains('menu-open')).toBe(false)
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm -C apps/lab exec vitest run --project chromium src/shell/bands.browser.test.tsx`
Expected: FAIL — the first case polls `settings` to `false` and times out; the XS key case reads `sheet` as `null` after `s`.

- [ ] **Step 3: Implement the keys**

In `App.tsx` add imports: `import { narrow, readBand } from './state/band'` and `import { useBand, useLowWindow } from './shell/useLayoutBand'`, and `useRef` beside `useEffect` from `react`.

Replace the body of `useDrawerKeys`'s `onKey` (from `const ui = useStore.getState().ui` to the end of the `else if` chain) with:

```ts
      const ui = useStore.getState().ui
      // At XS the drawers are shown only as sheets (handoff 2, PR 7): the
      // keys open the sheets, and a drawer's state is invisible there, so
      // Escape must not change it (Review Focus 2).
      const phone = readBand() === 'xs'
      if (event.key === 'Escape') {
        if (ui.sheet !== null) ui.setSheet(null)
        else if (phone) return
        else if (ui.report) ui.setReport(false)
        else if (ui.settings) ui.setSettings(false)
      } else if (event.key === 'r' || event.key === 'R') {
        if (phone) ui.toggleSheet('report')
        else ui.toggleReport()
      } else if (event.key === 's' || event.key === 'S') {
        if (phone) ui.toggleSheet('settings')
        else ui.toggleSettings()
      }
```

Extend the comment above `useDrawerKeys` with one paragraph: "An open sheet is the first layer Escape closes (handoff 2, PR 7); the menu and the `…` popover consume their own Escape in capture listeners, as the preset panel does."

- [ ] **Step 4: Implement the band reset**

Add above `Shell`:

```ts
/**
 * What a band change resets (handoff 2, PR 7, spec §4): the sheet and the
 * menu, which belong to the band they were opened in; and the settings
 * drawer, which below 1024px would lie over the board — closed without being
 * remembered, and put back from what was remembered on the way up (D3).
 *
 * Compared with the last band seen rather than skipped on the first run:
 * StrictMode runs a mount effect twice, and a "first run" flag would read the
 * second pass as a change.
 */
function useBandReset() {
  const band = useBand()
  const low = useLowWindow()
  const seen = useRef({ band, low })
  useEffect(() => {
    const was = seen.current
    if (was.band === band && was.low === low) return
    seen.current = { band, low }
    const ui = useStore.getState().ui
    ui.setSheet(null)
    ui.setMenu(false)
    if (narrow(band) && !narrow(was.band)) ui.closeSettingsForNarrow()
    else if (!narrow(band) && narrow(was.band)) ui.restoreSettings()
  }, [band, low])
}
```

In `Shell`, call `useBandReset()` after `useDocumentLang()`, subscribe `const menu = useStore((state) => state.ui.menu)`, and change the root to `<div className={menu ? 'fw menu-open' : 'fw'}>`.

- [ ] **Step 5: Run the new tests and the suite**

Run: `pnpm -C apps/lab exec vitest run --project chromium src/shell/bands.browser.test.tsx`
Expected: PASS (6 tests).
Run: `pnpm nx run lab:test`
Expected: PASS. (Fact 52: if a key case elsewhere reads state synchronously after a render, keep the existing idiom of that file.)

- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/App.tsx apps/lab/src/shell/bands.browser.test.tsx
git commit -m "Reset the sheet, the menu and the drawer on a band change, and give the keys to the sheets at XS"
```

- [ ] **Step 7: Mutations**

1. In `useBandReset` replace the compare with a `first` ref that skips only the first run. `mounting under StrictMode is not a band change` turns red on `expect(ui().sheet).toBe('report')`. Revert.
2. Delete `else if (phone) return`. The XS key case turns red on `expect(ui().report).toBe(true)`. Revert.
3. Delete the `restoreSettings()` branch. The first case turns red on the last poll. Revert, `git diff` empty.

---

### Task 4: The sheet bar

Model: Opus (focus return, locator collisions).

**Files:**
- Modify: `packages/engine/lab-i18n.ts` (EN near `runColumn: 'Run'` line 136; PL near `runColumn: 'Generowanie'` line 716)
- Create: `apps/lab/src/shell/SheetBar.tsx`
- Create: `apps/lab/src/shell/SheetBar.browser.test.tsx`
- Modify: `apps/lab/src/routes/Workspace.tsx:58-91`
- Modify: `apps/lab/src/run/RunColumn.tsx:126`, `apps/lab/src/library/BoardColumn.tsx:55,162`
- Modify: `apps/lab/src/routes/LabLayout.browser.test.tsx:69,94,668,675`

**Interfaces:**
- Consumes: `Sheet`, `sheet`, `toggleSheet` (Task 2); `SETTINGS_ID` (`stage/Stage.tsx:8`, `'settings-panel'`, set on `Console`'s root, `console/Console.tsx:26`); `REPORT_ID` (`report/ReportPanel.tsx:11`, `'lab-report'`).
- Produces: `RUN_COLUMN_ID = 'run-column'` (exported from `run/RunColumn.tsx`); `BOARD_COLUMN_ID = 'board-column'` (exported from `library/BoardColumn.tsx`); `SheetBar({ tab }: { tab: WorkspaceTab })`; `.fw-lab.sheet-<name>` while a sheet is open; dictionary keys `sheetBar`, `sheetSettings`, `sheetCli`, `sheetReport`, `sheetBoards`, `sheetBoard`.

- [ ] **Step 1: Add the strings and rebuild the engine**

EN, after `runColumn: 'Run',`:

```ts
    // The phone's bar of bottom sheets (handoff 2, PR 7): its name and its
    // buttons, on the lab and on the saved boards.
    sheetBar: 'Panels',
    sheetSettings: 'Settings',
    sheetCli: 'CLI',
    sheetReport: 'Report',
    sheetBoards: 'Boards',
    sheetBoard: 'Board',
```

PL, after `runColumn: 'Generowanie',`:

```ts
    sheetBar: 'Panele',
    sheetSettings: 'Ustawienia',
    sheetCli: 'CLI',
    sheetReport: 'Raport',
    sheetBoards: 'Plansze',
    sheetBoard: 'Plansza',
```

Run: `pnpm nx build engine && deno task -c packages/engine/deno.json test`
Expected: both pass (`PL: Translation` makes a missing key a type error).

- [ ] **Step 2: Write the failing tests**

`apps/lab/src/shell/SheetBar.browser.test.tsx`:

```tsx
import { beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { App } from '../App'
import { loadRunDone, mountApp, resetApp } from '../harness/mountApp'
import { useStore } from '../state/store'

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  return () => vi.restoreAllMocks()
})

const bar = () => document.querySelector('nav.fw-sheetbar')

test('the lab names its sheets Settings, CLI and Report, each controlling its panel', async () => {
  await page.viewport(375, 812)
  const screen = await mountApp('advanced')
  const nav = screen.getByRole('navigation', { name: 'Panels' })
  await expect.element(nav).toBeInTheDocument()
  const buttons = [...(bar()?.querySelectorAll('button') ?? [])]
  expect(buttons.map((b) => b.textContent)).toEqual(['Settings', 'CLI', 'Report'])
  expect(buttons.map((b) => b.getAttribute('aria-controls'))).toEqual(['settings-panel', 'run-column', 'lab-report'])
  for (const id of ['settings-panel', 'run-column', 'lab-report']) expect(document.getElementById(id)).not.toBeNull()
})

test('the saved boards name them Boards, Board and Report', async () => {
  await page.viewport(375, 812)
  // `arrange`'s idiom (LayoutInvariants.browser.test.tsx): `resetApp` pushes
  // `/` (mountApp.tsx:23), so the route goes in after it and before `render`.
  resetApp('advanced')
  window.history.pushState({}, '', '/boards')
  const screen = await render(<App />)
  await expect.element(screen.getByRole('button', { name: 'Boards', exact: true })).toBeInTheDocument()
  const buttons = [...(bar()?.querySelectorAll('button') ?? [])]
  expect(buttons.map((b) => b.textContent)).toEqual(['Boards', 'Board', 'Report'])
  expect(buttons[1]?.getAttribute('aria-controls')).toBe('board-column')
  expect(document.getElementById('board-column')).not.toBeNull()
})

test('a press opens its sheet, marks it pressed and names it on the lab panel', async () => {
  await page.viewport(375, 812)
  const screen = await mountApp('advanced')
  const cli = screen.getByRole('button', { name: 'CLI', exact: true })
  await cli.click()
  expect(useStore.getState().ui.sheet).toBe('cli')
  await expect.element(cli).toHaveAttribute('aria-pressed', 'true')
  expect(document.querySelector('.fw-lab')?.classList.contains('sheet-cli')).toBe(true)
  await cli.click()
  expect(useStore.getState().ui.sheet).toBeNull()
  expect(document.querySelector('.fw-lab')?.classList.contains('sheet-cli')).toBe(false)
})

test('closing a sheet with the focus inside it hands the focus to its button', async () => {
  await page.viewport(375, 812)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await screen.getByRole('button', { name: 'Report', exact: true }).click()
  const inside = document.getElementById('lab-report')
  if (inside === null) throw new Error('no report')
  inside.tabIndex = -1
  inside.focus()
  await userEvent.keyboard('{Escape}')
  expect(useStore.getState().ui.sheet).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Report', exact: true }).element())
})

test('the docs route has no sheet bar in view', async () => {
  await page.viewport(375, 812)
  resetApp('advanced')
  window.history.pushState({}, '', '/docs/cli')
  await render(<App />)
  expect(bar()?.closest('main')?.hidden ?? true).toBe(true)
})
```

Imports for this file: `render` from `vitest-browser-react`, `App` from `../App`, `resetApp` beside `mountApp`; drop `act` if unused.

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm -C apps/lab exec vitest run --project chromium src/shell/SheetBar.browser.test.tsx`
Expected: FAIL — no navigation named `Panels`.

- [ ] **Step 4: Give both right columns an id**

`run/RunColumn.tsx`: above the component add

```ts
/** The run column's id, which the phone's CLI sheet button controls (handoff 2, PR 7). */
export const RUN_COLUMN_ID = 'run-column'
```

and change line 126 to `<section id={RUN_COLUMN_ID} className="fw-run-col" aria-label={dict.t('runColumn')}>`.

`library/BoardColumn.tsx`: add `export const BOARD_COLUMN_ID = 'board-column'` with the same kind of comment, and put `id={BOARD_COLUMN_ID}` on both `<section className="fw-run-col fw-bcol" …>` (lines 55 and 162).

- [ ] **Step 5: Write `shell/SheetBar.tsx`**

```tsx
import { type ReactElement, useLayoutEffect, useRef } from 'react'
import { useDictionary } from '../i18n'
import { BOARD_COLUMN_ID } from '../library/BoardColumn'
import { REPORT_ID } from '../report/ReportPanel'
import type { WorkspaceTab } from '../routes/Workspace'
import { RUN_COLUMN_ID } from '../run/RunColumn'
import { SETTINGS_ID } from '../stage/Stage'
import { useStore } from '../state/store'
import type { Sheet } from '../state/ui.slice'

const SHEETS: readonly Sheet[] = ['settings', 'cli', 'report']

/**
 * The phone's bar of bottom sheets (handoff 2, PR 7): three buttons under the
 * board, each opening its panel as a sheet over it. Always mounted and shown
 * only at XS by the stylesheet, so nothing appears among the stage's
 * siblings; it sits after `.fw-lab`, not inside it (Workspace.tsx).
 *
 * A focus inside a sheet that closes would fall to <body> once the sheet is
 * `display: none`; it moves to the sheet's button, as the drawers hand theirs
 * to their handles (Stage.tsx).
 */
export function SheetBar({ tab }: { tab: WorkspaceTab }): ReactElement {
  const dict = useDictionary()
  const sheet = useStore((state) => state.ui.sheet)
  const toggleSheet = useStore((state) => state.ui.toggleSheet)
  const lab = tab === 'lab'
  const panels: Record<Sheet, string> = {
    settings: SETTINGS_ID,
    cli: lab ? RUN_COLUMN_ID : BOARD_COLUMN_ID,
    report: REPORT_ID,
  }
  const labels: Record<Sheet, string> = {
    settings: dict.t(lab ? 'sheetSettings' : 'sheetBoards'),
    cli: dict.t(lab ? 'sheetCli' : 'sheetBoard'),
    report: dict.t('sheetReport'),
  }
  const buttons = useRef(new Map<Sheet, HTMLButtonElement>())
  const shown = useRef(sheet)
  useLayoutEffect(() => {
    const was = shown.current
    shown.current = sheet
    if (was === null || was === sheet) return
    const panel = document.getElementById(panels[was])
    const active = document.activeElement
    if (panel !== null && active !== null && panel.contains(active)) buttons.current.get(was)?.focus()
  })
  return (
    <nav className="fw-sheetbar" aria-label={dict.t('sheetBar')}>
      {SHEETS.map((name) => (
        <button
          key={name}
          ref={(node) => {
            if (node === null) buttons.current.delete(name)
            else buttons.current.set(name, node)
          }}
          type="button"
          aria-pressed={sheet === name}
          aria-controls={panels[name]}
          onClick={() => toggleSheet(name)}
        >
          {labels[name]}
        </button>
      ))}
    </nav>
  )
}
```

(The layout effect has no dependency list on purpose: it compares with `shown`, and `panels` is rebuilt per render. `react-hooks/exhaustive-deps` does not flag an effect with no list.)

- [ ] **Step 6: Wire it into `Workspace`**

In `routes/Workspace.tsx` import `SheetBar`, subscribe `const sheet = useStore((state) => state.ui.sheet)`, change the `.fw-lab` class to

```tsx
<div
  className={`fw-lab${lab ? '' : ' library'}${simple ? ' simple' : ''}${solo ? ' solo' : ''}${sheet === null ? '' : ` sheet-${sheet}`}`}
>
```

and render `<SheetBar tab={tab} />` after the closing `</div>` of `.fw-lab`, inside the `<section>`. Add a comment: "After `.fw-lab`, not in it: the lab's children keep their slots (Ruling 6), and the bar is shown only at XS (shell.css)."

- [ ] **Step 7: Run the new tests**

Run: `pnpm -C apps/lab exec vitest run --project chromium src/shell/SheetBar.browser.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 8: Make the report handle's locators exact**

The sheet bar's `Report` and `Settings` buttons are in the DOM on every tab, and a `name` string matches a case-insensitive substring. In `routes/LabLayout.browser.test.tsx` lines 69, 94, 668 and 675 change `{ name: 'report' }` to `{ name: 'report', exact: true }` (the handle's name is `report`, `lab-i18n.ts:398`). Then run the whole suite:

Run: `pnpm nx run lab:test`
Expected: PASS. Any other strict-mode violation ("resolved to 2 elements") gets `exact: true` on its locator — list them in the commit message.

- [ ] **Step 9: Commit**

```bash
pnpm -C apps/lab exec prettier --write src/shell/SheetBar.tsx src/shell/SheetBar.browser.test.tsx src/routes/Workspace.tsx src/run/RunColumn.tsx src/library/BoardColumn.tsx src/routes/LabLayout.browser.test.tsx
git add packages/engine/lab-i18n.ts apps/lab/src
git commit -m "Add the phone's sheet bar: Settings, CLI and Report on the lab, Boards, Board and Report on the saved boards"
```

- [ ] **Step 10: Mutations**

1. Delete the `buttons.current.get(was)?.focus()` call. `closing a sheet with the focus inside it…` turns red on the `activeElement` assertion. Revert.
2. Swap `lab ? RUN_COLUMN_ID : BOARD_COLUMN_ID` to `RUN_COLUMN_ID`. The saved boards case turns red on `aria-controls`. Revert, `git diff` empty.

---

### Task 5: The top bar's menu and the touch label of ⌘K

Model: Sonnet.

**Files:**
- Modify: `packages/engine/lab-i18n.ts` (EN near `cmdOpen` line 252; PL near line 809)
- Modify: `apps/lab/src/shell/TopBar.tsx`
- Modify: `apps/lab/src/shell/TopBar.browser.test.tsx`

**Interfaces:**
- Consumes: `menu`, `setMenu`, `toggleMenu` (Task 2); `TRIGGER_ID = 'cmdk'` (`palette/CommandPalette.tsx:10`).
- Produces: `TOP_MENU_ID = 'top-menu'` on `.fw-top .right`; `.fw-menu-btn`; `#cmdk > .k-key` and `#cmdk > .k-touch`; `TopBar({ presets }: { presets: ReactNode })` (Task 6 passes `presets`; this task passes `null` from `App.tsx`). Dictionary keys `menu`, `cmdTouch`.

- [ ] **Step 1: Strings**

EN after `cmdOpen: 'Command palette (⌘K)',`:

```ts
    // At XS (handoff 2, PR 7) the top bar's right group folds into a menu,
    // and ⌘K reads as words there. The words must stay inside `cmdOpen`, the
    // button's accessible name (WCAG 2.5.3).
    menu: 'menu',
    cmdTouch: 'command palette',
```

PL after `cmdOpen: 'Paleta poleceń (⌘K)',`:

```ts
    menu: 'menu',
    cmdTouch: 'paleta poleceń',
```

Run: `pnpm nx build engine`.

- [ ] **Step 2: Write the failing tests**

Append to `apps/lab/src/shell/TopBar.browser.test.tsx` (read its head first and reuse its render helper and imports; the cases below assume a `renderBar()` that renders `<TopBar presets={null} />` with the store reset — if the file renders differently, follow the file):

```tsx
test('the menu chip controls the right group and toggles the menu', async () => {
  const screen = await renderBar()
  const chip = screen.getByRole('button', { name: 'menu', exact: true })
  await expect.element(chip).toHaveAttribute('aria-controls', 'top-menu')
  await expect.element(chip).toHaveAttribute('aria-expanded', 'false')
  expect(document.getElementById('top-menu')?.classList.contains('right')).toBe(true)
  await chip.click()
  expect(useStore.getState().ui.menu).toBe(true)
  await expect.element(chip).toHaveAttribute('aria-expanded', 'true')
})

test('Escape inside the open menu closes it and returns the focus to the chip', async () => {
  const screen = await renderBar()
  const chip = screen.getByRole('button', { name: 'menu', exact: true })
  await chip.click()
  screen.getByRole('radio', { name: 'PL' }).element().focus()
  await userEvent.keyboard('{Escape}')
  expect(useStore.getState().ui.menu).toBe(false)
  expect(document.activeElement).toBe(chip.element())
})

test('a press outside the open menu closes it', async () => {
  const screen = await renderBar()
  await screen.getByRole('button', { name: 'menu', exact: true }).click()
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  await expect.poll(() => useStore.getState().ui.menu).toBe(false)
})

test('⌘K carries a word for touch inside its accessible name, and closes the menu', async () => {
  const screen = await renderBar()
  await act(async () => useStore.getState().ui.setMenu(true))
  const trigger = screen.getByRole('button', { name: 'Command palette (⌘K)' })
  const el = trigger.element()
  expect(el.querySelector('.k-key')?.textContent).toBe('⌘K')
  const word = el.querySelector('.k-touch')?.textContent ?? ''
  expect(word).toBe('command palette')
  expect((el.getAttribute('aria-label') ?? '').toLowerCase()).toContain(word)
  await trigger.click()
  expect(useStore.getState().ui.menu).toBe(false)
  expect(useStore.getState().ui.palette).toBe(true)
  await act(async () => useStore.getState().ui.closePalette())
})
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm -C apps/lab exec vitest run --project chromium src/shell/TopBar.browser.test.tsx`
Expected: FAIL — no button named `menu`.

- [ ] **Step 4: Implement in `TopBar.tsx`**

Change the signature to `export function TopBar({ presets }: { presets: ReactNode })`, add `import { type ReactNode, useEffect, useRef } from 'react'`, export `export const TOP_MENU_ID = 'top-menu'`, and add inside the component:

```tsx
  const menu = useStore((state) => state.ui.menu)
  const setMenu = useStore((state) => state.ui.setMenu)
  const toggleMenu = useStore((state) => state.ui.toggleMenu)
  const bar = useRef<HTMLElement>(null)
  const chip = useRef<HTMLButtonElement>(null)
  // The menu's keys and presses, installed only while it is open, the way the
  // preset panel installs its own (PresetStrip.tsx): Escape in a capture
  // listener so it is consumed before the drawers' Escape (App.tsx), and only
  // for keys pressed inside the bar.
  useEffect(() => {
    if (!menu) return
    const onPress = (event: PointerEvent) => {
      if (event.target instanceof Node && bar.current?.contains(event.target)) return
      setMenu(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (!(event.target instanceof Node) || !(bar.current?.contains(event.target) ?? false)) return
      event.preventDefault()
      setMenu(false)
      chip.current?.focus()
    }
    document.addEventListener('pointerdown', onPress)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onPress)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [menu, setMenu])
```

Put `ref={bar}` on `<header className="fw-top">`. After `<span className="dims">…</span>` render:

```tsx
      {presets}
      {/* XS only (shell.css): the right group folds into this menu. */}
      <button
        ref={chip}
        type="button"
        className="fw-menu-btn"
        aria-expanded={menu}
        aria-controls={TOP_MENU_ID}
        onClick={toggleMenu}
      >
        {dict.t('menu')}
        <span aria-hidden="true">{menu ? '▲' : '▼'}</span>
      </button>
```

Give the right group `id={TOP_MENU_ID}`. Replace the ⌘K button's `onClick` and content:

```tsx
          onClick={() => {
            const ui = useStore.getState().ui
            ui.setMenu(false)
            ui.togglePalette()
          }}
        >
          <span className="k-key">⌘K</span>
          <span className="k-touch">{dict.t('cmdTouch')}</span>
```

In `App.tsx` change `<TopBar />` to `<TopBar presets={null} />`.

- [ ] **Step 5: Run the tests and the suite**

Run: `pnpm -C apps/lab exec vitest run --project chromium src/shell/TopBar.browser.test.tsx`
Expected: PASS.
Run: `pnpm nx run lab:test`
Expected: PASS. A case pinning the ⌘K button's exact `textContent` to `⌘K` now reads `⌘Kcommand palette` without CSS: read `.k-key` instead, and list it in the commit.

- [ ] **Step 6: Commit**

```bash
pnpm -C apps/lab exec prettier --write src/shell/TopBar.tsx src/shell/TopBar.browser.test.tsx src/App.tsx
git add packages/engine/lab-i18n.ts apps/lab/src
git commit -m "Fold the top bar's right group into a menu chip and give ⌘K a word for touch"
```

- [ ] **Step 7: Mutations**

1. Delete `ui.setMenu(false)` in the menu's `onKey`. `Escape inside the open menu…` turns red on `menu`. Revert. (That the menu *consumes* its Escape, so a sheet does not close on the same press, is pinned in Task 10, `Escape in the open menu closes the menu only` — a sheet needs the stylesheets to be anything.)
2. Delete `ui.setMenu(false)` in the ⌘K handler. `⌘K carries a word…` turns red on `menu` being `true`. Revert, `git diff` empty.

---

### Task 6: The preset strip in the top bar of a low window

Model: Sonnet.

**Files:**
- Modify: `apps/lab/src/App.tsx` (`Shell`)
- Modify: `apps/lab/src/routes/Workspace.tsx`
- Modify: `apps/lab/src/run/PresetStrip.tsx:48`
- Modify: `apps/lab/src/run/PresetStrip.browser.test.tsx`

**Interfaces:**
- Consumes: `useLowWindow` (Task 1); `TopBar({ presets })` (Task 5).
- Produces: `Workspace` prop `presetsInTop: boolean`; `.fw-lab.presets-top` while the strip is in the top bar.

- [ ] **Step 1: Write the failing tests**

Append to `apps/lab/src/run/PresetStrip.browser.test.tsx` (add imports `mountApp` from `../harness/mountApp`, `page` from `vitest/browser`, `act` from `react`, `useStore` if missing, and a `fetch` stub as in Task 4's `beforeEach` if the file has none):

```tsx
const strips = () => document.querySelectorAll('.fw-presets')

// Spec D2: one strip, in the top bar of a low window, in the lab otherwise.
test.each([
  [924, 540, 'advanced', '.fw-top'],
  [924, 900, 'advanced', '.fw-lab'],
  [600, 500, 'advanced', '.fw-lab'],
] as const)('at %d×%d in the %s view the strip stands in %s', async (w, h, mode, parent) => {
  await page.viewport(w, h)
  await mountApp(mode)
  expect(strips()).toHaveLength(1)
  expect(strips()[0]?.parentElement?.closest('.fw-top, .fw-lab')?.matches(parent)).toBe(true)
  expect(document.querySelector('.fw-lab')?.classList.contains('presets-top')).toBe(parent === '.fw-top')
})

test('the simple view has no strip in the top bar of a low window', async () => {
  await page.viewport(924, 540)
  await mountApp('simple')
  expect(strips()).toHaveLength(0)
  expect(document.querySelector('.fw-lab')?.classList.contains('presets-top')).toBe(false)
})

test('opening the panel focuses its row without scrolling anything', async () => {
  await page.viewport(924, 540)
  const screen = await mountApp('advanced')
  const focus = vi.spyOn(HTMLElement.prototype, 'focus')
  await screen.getByRole('button', { name: /^preset/ }).click()
  await expect.poll(() => focus.mock.calls.length).toBeGreaterThan(0)
  expect(focus.mock.calls[0]?.[0]).toEqual({ preventScroll: true })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm -C apps/lab exec vitest run --project chromium src/run/PresetStrip.browser.test.tsx`
Expected: FAIL — at 924×540 the strip's parent is `.fw-lab`.

- [ ] **Step 3: Implement**

`PresetStrip.tsx` line 48: `first?.focus({ preventScroll: true })`, with a comment: "No scroll: in a low window the panel is `position: fixed` under the top bar, and a focus that scrolled `.fw-top` would shift the bar (handoff 2, PR 7)."

`App.tsx`, in `Shell`: import `PresetStrip` from `./run/PresetStrip`; add

```tsx
  // Spec D2: a low window gives the board the preset row's height by standing
  // the strip in the top bar — the lab tab's advanced view only, where the
  // strip exists at all. One instance: the top bar holds it or the lab does.
  const low = useLowWindow()
  const advanced = useStore((state) => state.ui.mode === 'advanced')
  const presetsInTop = low && advanced && tabIndex === 0
```

and render `<TopBar presets={presetsInTop ? <PresetStrip control={control} /> : null} />` and `<Workspace … presetsInTop={presetsInTop} />`.

`Workspace.tsx`: add the prop `presetsInTop: boolean`, render `{lab && !simple && !presetsInTop ? <PresetStrip control={control} /> : null}` (the slot stays `null`), and add ``${lab && !simple && presetsInTop ? ' presets-top' : ''}`` to the `.fw-lab` class. Extend the `library` row-template comment: "`presets-top` (handoff 2, PR 7) is the lab with its strip in the top bar, and takes the simple view's rows for the same reason."

- [ ] **Step 4: Run the tests and the suite**

Run: `pnpm -C apps/lab exec vitest run --project chromium src/run/PresetStrip.browser.test.tsx`
Expected: PASS.
Run: `pnpm nx run lab:test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm -C apps/lab exec prettier --write src/App.tsx src/routes/Workspace.tsx src/run/PresetStrip.tsx src/run/PresetStrip.browser.test.tsx
git add apps/lab/src
git commit -m "Stand the preset strip in the top bar of a low window"
```

- [ ] **Step 6: Mutations**

1. Drop `&& advanced` from `presetsInTop`. `the simple view has no strip…` turns red on `presets-top`. Revert.
2. Drop `{ preventScroll: true }`. The focus case turns red. Revert, `git diff` empty.

---

### Task 7: The `…` popover in both right columns

Model: Sonnet.

**Files:**
- Modify: `packages/engine/lab-i18n.ts`
- Create: `apps/lab/src/run/MoreMenu.tsx`
- Create: `apps/lab/src/run/MoreMenu.browser.test.tsx`
- Modify: `apps/lab/src/run/RunColumn.tsx:150-158`, `apps/lab/src/library/BoardColumn.tsx:182-195`

**Interfaces:**
- Consumes: `useBand` (Task 1).
- Produces: `MoreMenu({ children }: { children: ReactNode })` rendering `button.fw-more` + `div.fw-more-pop` (with `open` class when open); dictionary key `moreOptions`.

- [ ] **Step 1: Strings**

EN after the `sheetBoard` line (Task 4): `moreOptions: 'More options',`. PL: `moreOptions: 'Więcej opcji',`. Run `pnpm nx build engine`.

- [ ] **Step 2: Write the failing tests**

`apps/lab/src/run/MoreMenu.browser.test.tsx`:

```tsx
import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { MoreMenu } from './MoreMenu'

function Column() {
  return (
    <section>
      <MoreMenu>
        <button type="button">Download SVG</button>
      </MoreMenu>
      <button type="button">outside</button>
    </section>
  )
}

test('the button controls the popover and opens it', async () => {
  await page.viewport(1024, 768)
  const screen = await render(<Column />)
  const more = screen.getByRole('button', { name: 'More options' })
  const pop = document.getElementById(more.element().getAttribute('aria-controls') ?? '')
  expect(pop?.classList.contains('fw-more-pop')).toBe(true)
  await expect.element(more).toHaveAttribute('aria-expanded', 'false')
  await more.click()
  await expect.element(more).toHaveAttribute('aria-expanded', 'true')
  expect(pop?.classList.contains('open')).toBe(true)
})

test('Escape inside closes it and returns the focus to the button', async () => {
  await page.viewport(1024, 768)
  const screen = await render(<Column />)
  const more = screen.getByRole('button', { name: 'More options' })
  await more.click()
  screen.getByRole('button', { name: 'Download SVG' }).element().focus()
  await userEvent.keyboard('{Escape}')
  await expect.element(more).toHaveAttribute('aria-expanded', 'false')
  expect(document.activeElement).toBe(more.element())
})

test('a press outside closes it', async () => {
  await page.viewport(1024, 768)
  const screen = await render(<Column />)
  const more = screen.getByRole('button', { name: 'More options' })
  await more.click()
  await screen.getByRole('button', { name: 'outside' }).click()
  await expect.element(more).toHaveAttribute('aria-expanded', 'false')
})

test('it reads as closed in another band than the one it was opened in', async () => {
  await page.viewport(1024, 768)
  const screen = await render(<Column />)
  const more = screen.getByRole('button', { name: 'More options' })
  await more.click()
  await page.viewport(1400, 900)
  await expect.element(more).toHaveAttribute('aria-expanded', 'false')
  await page.viewport(1024, 768)
  await expect.element(more).toHaveAttribute('aria-expanded', 'false')
})
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm -C apps/lab exec vitest run --project chromium src/run/MoreMenu.browser.test.tsx`
Expected: FAIL — cannot resolve `./MoreMenu`.

- [ ] **Step 4: Write `run/MoreMenu.tsx`**

```tsx
import { type ReactElement, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { useDictionary } from '../i18n'
import { useBand } from '../shell/useLayoutBand'
import type { Band } from '../state/band'

/**
 * The right column's `…` (handoff 2, PR 7): at M and S the column is a bar
 * under the board, and the switches and the exports move into a popover over
 * it. Outside M/S the button is `display: none` and the container
 * `display: contents` (run.css), so the column reads as it always has.
 *
 * Open is remembered as the band it was opened in, so a band change reads as
 * closed with no effect writing state; a later return to that band is closed
 * too, because the band change cleared it on the way (the next press sets it
 * again). A disclosure like the preset picker: `aria-expanded` and
 * `aria-controls`, Escape consumed in a capture listener while open.
 */
export function MoreMenu({ children }: { children: ReactNode }): ReactElement {
  const dict = useDictionary()
  const band = useBand()
  const [openIn, setOpenIn] = useState<Band | null>(null)
  const [seenBand, setSeenBand] = useState(band)
  // A band change clears the open state during render, React's documented
  // "adjusting state when a prop changes" pattern, not an effect.
  if (seenBand !== band) {
    setSeenBand(band)
    setOpenIn(null)
  }
  const open = openIn === band
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const inside = (target: EventTarget | null) =>
      target instanceof Node && ((pop.current?.contains(target) ?? false) || (button.current?.contains(target) ?? false))
    const onPress = (event: PointerEvent) => {
      if (!inside(event.target)) setOpenIn(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !inside(event.target)) return
      event.preventDefault()
      setOpenIn(null)
      button.current?.focus()
    }
    document.addEventListener('pointerdown', onPress)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onPress)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={button}
        type="button"
        className="fw-more"
        aria-expanded={open}
        aria-controls={id}
        aria-label={dict.t('moreOptions')}
        onClick={() => setOpenIn(open ? null : band)}
      >
        …
      </button>
      <div ref={pop} id={id} className={open ? 'fw-more-pop open' : 'fw-more-pop'}>
        {children}
      </div>
    </>
  )
}
```

(`setOpenIn` inside the listeners is not an effect body write; `react-hooks/set-state-in-effect` flags only synchronous calls in the effect body.)

- [ ] **Step 5: Use it in both columns**

`RunColumn.tsx`: wrap the `{simple ? null : (<div className="fw-ghost">…</div>)}` block and `<ExportButtons />` in `<MoreMenu>…</MoreMenu>`, keeping both comments inside. `BoardColumn.tsx`: wrap the `<div className="fw-ghost fw-exports" …>…</div>` in `<MoreMenu>…</MoreMenu>`.

- [ ] **Step 6: Run the tests and the suite**

Run: `pnpm -C apps/lab exec vitest run --project chromium src/run/MoreMenu.browser.test.tsx`
Expected: PASS (4 tests).
Run: `pnpm nx run lab:test`
Expected: PASS. Without CSS the popover's content is in the DOM and visible as before, so the export and switch cases do not move; a strict-mode collision on `name: /more/i` gets `exact: true`.

- [ ] **Step 7: Commit**

```bash
pnpm -C apps/lab exec prettier --write src/run/MoreMenu.tsx src/run/MoreMenu.browser.test.tsx src/run/RunColumn.tsx src/library/BoardColumn.tsx
git add packages/engine/lab-i18n.ts apps/lab/src
git commit -m "Put the right column's switches and exports behind a … popover for the bar"
```

- [ ] **Step 8: Mutation**

Replace `const open = openIn === band` with `const open = openIn !== null` and delete the render-time reset. `it reads as closed in another band…` turns red on the first `aria-expanded` read after the resize. Revert, `git diff` empty.

---

### Task 8: The layout harness learns the bands

Model: Opus. No CSS in this task: it teaches the audit the new invariants, widens the matrix to the handoff's sizes, and records today's reds in `KNOWN_RED` (the file's own idiom, `LayoutInvariants.browser.test.tsx:57-63`), which Tasks 9 and 10 then delete as they fix them.

**Files:**
- Modify: `apps/lab/src/harness/invariants.ts`
- Modify: `apps/lab/src/routes/LayoutInvariants.browser.test.tsx`

**Interfaces:**
- Produces: new `Invariant` members `'board-width' | 'bar-row' | 'sheet-fit' | 'sheet-bar' | 'touch-target' | 'top-scroll'`; `audit(root, { board, solo })` (new optional `solo?: boolean`, default `false`).

- [ ] **Step 1: Extend `invariants.ts`**

Add to the `Invariant` union: `'board-width' | 'bar-row' | 'sheet-fit' | 'sheet-bar' | 'touch-target' | 'top-scroll'`. Add these functions before `audit`:

```ts
/**
 * The board keeps a usable width (handoff 2, PR 7): at least 320px from 768
 * up, whatever the drawer does, and edge to edge on a phone (the package
 * measured 359 at 375). Solo is its own case: the board takes the panel.
 */
function boardWidth(root: HTMLElement, solo: boolean): Finding[] {
  const board = root.querySelector('.fw-board')
  if (board === null || !rendered(board) || solo) return []
  const w = board.getBoundingClientRect().width
  const floor = window.innerWidth >= 768 ? 320 : window.innerWidth - 16
  return w + EPS < floor ? [{ invariant: 'board-width', detail: `board ${w.toFixed(0)}px < ${floor}` }] : []
}

/** At M and S the right column is a bar under the board, one or two lines tall. */
function barRow(root: HTMLElement, solo: boolean): Finding[] {
  if (solo || window.innerWidth < 768 || window.innerWidth >= 1280) return []
  const wrap = root.querySelector('.fw-stage > .fw-boardwrap')
  const bars = [...root.querySelectorAll('.fw-stage > .fw-run-col')].filter(rendered)
  if (wrap === null || bars.length === 0) return []
  const out: Finding[] = []
  const bottom = wrap.getBoundingClientRect().bottom
  for (const bar of bars) {
    const r = bar.getBoundingClientRect()
    if (r.top < bottom - EPS) out.push({ invariant: 'bar-row', detail: `${label(bar)} top ${r.top.toFixed(0)} < board ${bottom.toFixed(0)}` })
    if (r.height > 104 + EPS) out.push({ invariant: 'bar-row', detail: `${label(bar)} ${r.height.toFixed(0)}px tall` })
    // M: an open drawer pushes the bar's content as it pushes the board, so
    // nothing in the bar lies under the drawer. S lets the drawer cover both.
    const drawer = root.querySelector('.fw-ldrawer.open')
    if (window.innerWidth >= 1024 && drawer !== null && rendered(drawer)) {
      const start = r.left + Number.parseFloat(getComputedStyle(bar).paddingLeft)
      const edge = drawer.getBoundingClientRect().right
      if (start < edge - EPS)
        out.push({ invariant: 'bar-row', detail: `${label(bar)} content at x=${start.toFixed(0)}, under the drawer to x=${edge.toFixed(0)}` })
    }
  }
  return out
}

/**
 * At XS the sheet bar is on screen on the workspace (unless solo) and a sheet
 * lies inside the viewport, above the bar; from 768 up there is no sheet bar.
 */
function sheets(root: HTMLElement, solo: boolean): Finding[] {
  const out: Finding[] = []
  const bar = root.querySelector('.fw-sheetbar')
  const onWorkspace = bar !== null && bar.closest('main')?.hidden === false
  const phone = window.innerWidth < 768
  const shown = bar !== null && rendered(bar)
  if (onWorkspace && shown !== (phone && !solo))
    out.push({ invariant: 'sheet-bar', detail: `sheet bar ${shown ? 'shown' : 'hidden'} at ${window.innerWidth}` })
  if (!phone || bar === null || !shown) return out
  const top = bar.getBoundingClientRect().top
  for (const sheet of root.querySelectorAll('.fw-ldrawer, .fw-drawer, .fw-stage > .fw-run-col')) {
    if (!rendered(sheet)) continue
    const r = sheet.getBoundingClientRect()
    if (r.left < -EPS || r.right > window.innerWidth + EPS || r.top < -EPS || r.bottom > top + EPS)
      out.push({ invariant: 'sheet-fit', detail: `${label(sheet)} ${r.top.toFixed(0)}..${r.bottom.toFixed(0)} over bar ${top.toFixed(0)}` })
  }
  return out
}

/**
 * At XS every control a thumb reaches in the shell is 44px tall to the
 * finger: its box, or its `::before` where the drawing is smaller (the
 * switch, the menu chip). The knob rows' `?` and chips are 32 by the handoff
 * and are pinned in touch.browser.test.tsx instead.
 */
function touchTargets(root: HTMLElement): Finding[] {
  if (window.innerWidth >= 768) return []
  const out: Finding[] = []
  const scope = '.fw-sheetbar, .fw-top, .fw-tabrow, .fw-presets, .fw-stage > .fw-run-col'
  for (const node of root.querySelectorAll('button, select, a[href], [role="switch"]')) {
    if (node.closest(scope) === null || !rendered(node)) continue
    const own = node.getBoundingClientRect().height
    const before = Number.parseFloat(getComputedStyle(node, '::before').height)
    const hit = Math.max(own, Number.isFinite(before) ? before : 0)
    if (hit + EPS < 44) out.push({ invariant: 'touch-target', detail: `${label(node)} "${node.textContent?.trim() ?? ''}" ${hit.toFixed(0)}px` })
  }
  return out
}

/** Opening a popover in the top bar never scrolls it (the low window's presets). */
function topScroll(root: HTMLElement): Finding[] {
  const bar = root.querySelector('.fw-top')
  return bar !== null && bar.scrollTop !== 0 ? [{ invariant: 'top-scroll', detail: `scrollTop ${bar.scrollTop}` }] : []
}
```

Change existing functions:

- `barClip`: skip a node inside a popover — first line of the loop: `if (node.closest('.fw-pp-panel') !== null || (node.closest('.right') !== null && root.querySelector('.fw.menu-open') !== null)) continue` (the panel and the open menu lie outside the bar by design; `popoverFit` reads them).
- `popoverFit`: select `'.fw-pp-panel, .fw-more-pop.open, .fw.menu-open .fw-top .right'`.
- `drawerFit` and `settingsFit`: first line `if (window.innerWidth < 768) return []` with the comment "At XS the drawers are sheets over the viewport (`sheet-fit`)." Rewrite `settingsFit`'s doc comment's last sentences: "Below 1024 it lies over the board (S), and only the stage bound is read."
- `audit`: signature `audit(root: HTMLElement, { board, solo = false }: { board: boolean; solo?: boolean })`, and append `...boardWidth(root, solo), ...barRow(root, solo), ...sheets(root, solo), ...touchTargets(root), ...topScroll(root)` to the list.

- [ ] **Step 2: Widen the matrix**

In `LayoutInvariants.browser.test.tsx`:

- Replace `SIZES` with the handoff's matrix (spec §7):

```ts
const SIZES: readonly (readonly [number, number])[] = [
  [1920, 1080],
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [924, 540],
  [768, 1024],
  [600, 900],
  [375, 812],
]
```

- Add states `'solo'`, `'sheet-settings'`, `'sheet-cli'`, `'sheet-report'`, `'library-sheet-cli'`, `'menu-open'`, `'more-open'` to `State`. `STATES` (the full matrix) gains `'solo'` only. Add after it:

```ts
/** States that exist only in some bands, each run at its own sizes. */
const BANDED: readonly (readonly [State, number, number])[] = [
  ...(['sheet-settings', 'sheet-cli', 'sheet-report', 'library-sheet-cli', 'menu-open'] as const).flatMap((s) =>
    ([[600, 900], [375, 812]] as const).map(([w, h]) => [s, w, h] as const),
  ),
  ...([[1024, 768], [924, 540], [768, 1024]] as const).map(([w, h]) => ['more-open', w, h] as const),
]
```

- In `arrange`: `'library-sheet-cli'` pushes `/boards/8x8/<id>` with the same fetch stub as `'library-detail'` (extract that stub into a local `stubStoredBoard()` used by both), waits for `.fw-bcol .fw-cmdfig` like `'library-detail'`, then sets the sheet. Inside the existing `act`: `'solo'` → `s.ui.setSolo(true)`; `'sheet-settings' | 'sheet-cli' | 'sheet-report'` → `s.ui.setSheet(state.slice(6) as Sheet)` (import `type Sheet`); `'library-sheet-cli'` → `s.ui.setSheet('cli')`; `'menu-open'` → `s.ui.setMenu(true)`. After the `presets-open` block: `'more-open'` → `await screen.getByRole('button', { name: 'More options' }).click()` and poll `.fw-more-pop.open` not null. Skip `loadRunDone` for `library-sheet-cli` as for `library-detail`.
- In both test bodies pass `solo: state === 'solo'` to `audit`, and add a second `test.each(BANDED)` with the same body as the matrix case.
- `LANG_CASES` becomes `[['board', 420, 900], ['board', 1280, 800], ['board', 1024, 768], ['board', 768, 1024], ['presets-open', 924, 540], ['board', 375, 812], ['more-open', 1024, 768]]` (Review Focus 4). Its `arrange` must run with `lang` set before the click for `more-open`; keep the file's order: arrange, then `setLang('pl')`, then settle — the popover stays open across the language change.

- [ ] **Step 3: Run, and record today's reds**

Run: `pnpm -C apps/lab exec vitest run --project chromium src/routes/LayoutInvariants.browser.test.tsx`
Expected: FAIL in many cases (no band CSS exists yet). For each failing case, add its exact set to `KNOWN_RED` under `${state}@${w}x${h}`, with a trailing comment naming the task that fixes it (`// Task 9` for 768–1599 wide, `// Task 10` for XS and 924×540). Extend `KNOWN_RED` to every other test in the file that calls `audit` — `BANDED`, `LANG_CASES`, `the presets-open state at 420×700` and `the Polish trigger naming Huge…` — by making their bodies compare against it the same way the matrix does (they compare against `[]` today); key the two single cases as `presets-open@420x700` and `huge-pl@420x900`. Re-run until the file is green with the recorded reds.

- [ ] **Step 4: Mutations of the new invariants**

Commit first (Step 5), then, one at a time, each reverted by hand with `git diff` empty after:

1. `boardWidth`: change `320` to `3200`. Every ≥768 case that is not solo turns red with `board-width`.
2. `barRow`: change `104` to `4`. Every M/S case that has a bar turns red with `bar-row`. Then, separately, change `start < edge - EPS` to `start < edge + 9999`: every M case with the drawer open turns red with the "under the drawer" detail (the two checks are two conditions, two runs).
3. `sheets`: invert `shown !== (phone && !solo)` to `===`. Every workspace case turns red with `sheet-bar`.
4. `touchTargets`: change `44` to `440`. Every XS case turns red with `touch-target`.
5. `topScroll`: change `!== 0` to `=== 0`. Every case turns red with `top-scroll`.
6. `barClip`'s skip: delete it. `presets-open@924x540` stays as recorded now (the strip is not in the bar until Task 10) — so this mutation is run again at the end of Task 10, where it must turn `presets-open@924x540` red with `bar-clip`.

- [ ] **Step 5: Commit**

```bash
pnpm -C apps/lab exec prettier --write src/harness/invariants.ts src/routes/LayoutInvariants.browser.test.tsx
git add apps/lab/src/harness/invariants.ts apps/lab/src/routes/LayoutInvariants.browser.test.tsx
git commit -m "Teach the layout audit the bands, the bar, the sheets and a finger's targets, over the handoff's eight sizes"
```

---

### Task 9: CSS for L, M and S, and the saved boards' bar

Model: Opus.

**Files:**
- Modify: `apps/lab/src/design/console.css:1074-1076, 1126-1144`
- Modify: `apps/lab/src/design/run.css`
- Modify: `apps/lab/src/design/library.css`
- Modify: `apps/lab/src/routes/LayoutInvariants.browser.test.tsx` (delete `// Task 9` entries)
- Modify: `apps/lab/src/design/touch.browser.test.tsx`

**Interfaces:**
- Consumes: `.fw-more`, `.fw-more-pop(.open)` (Task 7); the `KNOWN_RED` entries marked `// Task 9` (Task 8).

- [ ] **Step 1: Delete this task's `KNOWN_RED` entries and watch them go red**

Delete every entry marked `// Task 9`. Run the layout file; the deleted cases fail. Keep the output for the commit message.

- [ ] **Step 2: The handle track as a property, and the stopgaps out**

In `console.css` replace the `.fw-lab .fw-stage` rule (line 1074) with:

```css
/* `--hd` is the drawers' handle track: 28px, 44px under a finger (below), so
   every band's template keeps a finger's handle on a touch tablet without
   restating the coarse one (handoff 2, PR 7). */
.fw-lab .fw-stage {
  --hd: 28px;
  grid-template-columns: var(--hd) minmax(160px, 1fr) clamp(16rem, 22vw, 28rem) var(--hd);
}
```

Replace the coarse block at 1139–1143 with:

```css
@media (pointer: coarse) {
  .fw-lab .fw-stage {
    --hd: 44px;
  }
}
```

Delete the `@media (max-width: 1279px)` block (1126–1130) and the `@media (max-width: 900px)` block (1131–1138) that follows it — both are PR 1's stopgaps; the bands below replace them. Leave the `(min-width: 1024px)` push block, the `(max-height: 700px)` rows and the later `(max-width: 900px) .fw-console` rule (it is outranked in the drawer and untouched here).

- [ ] **Step 3: L, M and S stage rules**

Append to `console.css`, after the solo rules (so a later reader finds them together; solo is not affected either way, every band selector carries `:not(.solo)`):

```css
/* The bands (handoff 2, PR 7; spec §2). XL ≥1600 is the stage above. Every
   selector carries `:not(.solo)`, so solo keeps its one track in every band,
   and none carries `:not(.library)`: the saved boards' column
   (`.fw-run-col.fw-bcol`) takes the same bar (D4) — the lab's own run column
   stays hidden there, `(0,5,0)` above against these `(0,4,0)`. */
@media (min-width: 1280px) and (max-width: 1599px) {
  .fw-lab:not(.solo) .fw-stage {
    --ls-w: clamp(24rem, calc(33vw + 100px), 34rem);
    grid-template-columns: var(--hd) minmax(160px, 1fr) 18rem var(--hd);
  }
}
/* M and S: the right column becomes a bar under the board. */
@media (min-width: 768px) and (max-width: 1279px) {
  .fw-lab:not(.solo) .fw-stage {
    grid-template-columns: var(--hd) minmax(0, 1fr) var(--hd);
    grid-template-rows: minmax(0, 1fr) auto;
  }
  .fw-lab:not(.solo) .fw-stage::before {
    grid-row: 1 / -1;
  }
  .fw-lab:not(.solo) .fw-stage > .fw-boardwrap {
    grid-column: 2;
    grid-row: 1;
  }
  .fw-lab:not(.solo) .fw-stage > .fw-run-col {
    grid-column: 2;
    grid-row: 2;
  }
}
/* M: the open drawer pushes the bar as it pushes the board (the push above). */
@media (min-width: 1024px) and (max-width: 1279px) {
  .fw-lab:not(.solo) .fw-stage.ls-open > .fw-run-col {
    padding-left: calc(var(--ls-w) + 12px);
  }
}
/* S: no room to push; the open drawer lies over the board and the bar, and is
   closed at start (spec D3, `ui.slice.ts`). */
@media (min-width: 768px) and (max-width: 1023px) {
  .fw-lab:not(.solo) .fw-stage {
    --ls-w: min(calc(100vw - 112px), 28rem);
  }
  .fw-lab .fw-ldrawer.open {
    box-shadow: 1px 0 0 var(--border-strong);
  }
}
```

- [ ] **Step 4: The bar's contents**

Append to `run.css`:

```css
/* The `…` and its popover (MoreMenu.tsx) exist only in the M/S bar; outside
   it the button is gone and the container is not a box at all. */
.fw .fw-more {
  display: none;
}
.fw-more-pop {
  display: contents;
}
/* M and S (handoff 2, PR 7): the right column is one line under the board —
   CLI [Copy] | the command, one line scrolled sideways | Generate | the three
   alternatives | … — two when the open drawer pushes it. */
@media (min-width: 768px) and (max-width: 1279px) {
  .fw-lab:not(.solo) .fw-stage > .fw-run-col {
    position: relative;
    flex-flow: row wrap;
    align-items: center;
    gap: 8px 12px;
    padding: 8px 12px;
    height: auto;
    overflow: visible;
    background: var(--void);
    transition: padding-left 180ms cubic-bezier(0.2, 0, 0, 1);
  }
  .fw-lab:not(.solo) .fw-stage > .fw-run-col > .fw-cmdfig {
    flex: 1 1 240px;
    min-width: 0;
    min-height: 0;
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }
  .fw-lab:not(.solo) .fw-stage > .fw-run-col .fw-cmdhd {
    align-items: center;
    height: 32px;
    margin: 0;
  }
  /* One line: the flags are `nowrap` spans in ordinary text (CommandText.tsx),
     so `nowrap` on the box keeps them on it and the box scrolls sideways,
     with no bar drawn. */
  .fw-lab:not(.solo) .fw-stage > .fw-run-col .fw-cmd {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    height: 32px;
    padding: 0 8px;
    line-height: 30px;
    white-space: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }
  .fw-lab:not(.solo) .fw-stage > .fw-run-col .fw-cmd::-webkit-scrollbar {
    display: none;
  }
  .fw .fw-lab:not(.solo) .fw-stage > .fw-run-col .fw-go {
    flex: none;
    width: auto;
    height: 32px;
    min-height: 32px;
    margin: 0;
    padding: 0 18px;
  }
  .fw-lab:not(.solo) .fw-stage > .fw-run-col .fw-alt {
    flex-direction: row;
  }
  .fw .fw-lab:not(.solo) .fw-stage > .fw-run-col .fw-alt > button {
    width: auto;
    padding: 0 10px;
  }
  .fw .fw-lab:not(.solo) .fw-stage > .fw-run-col .fw-more {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    min-width: 32px;
    height: 32px;
    border: 1px solid var(--border);
    background: none;
    color: var(--ink);
    cursor: pointer;
  }
  .fw .fw-lab:not(.solo) .fw-stage > .fw-run-col .fw-more:hover,
  .fw .fw-lab:not(.solo) .fw-stage > .fw-run-col .fw-more[aria-expanded='true'] {
    background: var(--surface);
  }
  .fw-lab:not(.solo) .fw-stage > .fw-run-col .fw-more-pop {
    display: none;
  }
  .fw-lab:not(.solo) .fw-stage > .fw-run-col .fw-more-pop.open {
    position: absolute;
    right: 12px;
    bottom: calc(100% + 4px);
    z-index: 12;
    display: grid;
    gap: 12px;
    width: 18rem;
    padding: 12px;
    background: var(--graphite);
    box-shadow: 0 0 0 1px var(--border-strong);
  }
  .fw-lab:not(.solo) .fw-stage > .fw-run-col .fw-more-pop > * {
    margin: 0;
  }
}
/* The bar under a finger: 44px controls, not 32 (spec §5). */
@media (min-width: 768px) and (max-width: 1279px) and (pointer: coarse) {
  .fw .fw-lab:not(.solo) .fw-stage > .fw-run-col :is(.fw-go, .fw-alt > button, .fw-more) {
    height: 44px;
    min-height: 44px;
  }
}
```

(Specificity against what the bar overrides: `.fw .fw-alt button` is `(0,2,1)` and the coarse `height: 44px` on it is `(0,2,1)`; the bar's rules are `(0,5,1)`. `.fw .fw-go` is `(0,2,0)` in shell.css.)

- [ ] **Step 5: The saved boards' column in the bar**

Append to `library.css`:

```css
/* M and S (handoff 2, PR 7): the open board's column is the bar the lab's run
   column is (run.css), and its facts stay out of it — the XS sheet shows them
   again, being the column's own layout. */
@media (min-width: 768px) and (max-width: 1279px) {
  .fw-lab:not(.solo) .fw-bcol .fw-bmeta {
    display: none;
  }
  .fw .fw-lab:not(.solo) .fw-bcol .fw-alt > .danger {
    flex: none;
  }
}
```

- [ ] **Step 6: Run the layout file**

Run: `pnpm -C apps/lab exec vitest run --project chromium src/routes/LayoutInvariants.browser.test.tsx`
Expected: every case green except the entries still marked `// Task 10`. A new red that is not in `KNOWN_RED` is fixed in the CSS, never recorded. Two likely ones, measured before guessing: `bar-row` height over 104 in Polish at 768 (the alternatives wrap; shorten `gap` or let `.fw-alt` wrap onto the command's line) and `board-width` at 1024 with the drawer open (read `--ls-w` there: `clamp(25rem, calc(33vw + 172px), 47rem)` is ~510px at 1024 — if the board falls under 320, give M its own `--ls-w`, and record the measurement in the commit).

- [ ] **Step 7: Pin the coarse bar in the touch test**

Add a row to the `test.each` in `design/touch.browser.test.tsx`:

```ts
  // Handoff 2, PR 7: the M/S bar's controls under a finger.
  [
    'a bar control',
    '<div class="fw-lab"><div class="fw-stage"><section class="fw-run-col"><button class="fw-go">Generate</button></section></div></div>',
    'button',
    44,
  ],
```

`coarseHeight` reads every rule whose condition names `pointer: coarse`, the M/S one included.

- [ ] **Step 8: Node pins and the suite**

Run: `pnpm -C apps/lab exec vitest run --project node` then `pnpm nx run lab:test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
pnpm -C apps/lab exec prettier --write src/design/console.css src/design/run.css src/design/library.css src/design/touch.browser.test.tsx src/routes/LayoutInvariants.browser.test.tsx
git add apps/lab/src
git commit -m "Lay the stage out in the L, M and S bands, with the right column as a bar under the board"
```

- [ ] **Step 10: Mutations**

1. Delete `grid-row: 2;` from the M/S run column rule. `board@1024x768` turns red with `bar-row` (the column falls into row 1 beside the board). Revert.
2. Delete the M push block (`(min-width: 1024px) and (max-width: 1279px)`). `board@1024x768` (the drawer is open in `resetApp`) turns red with `bar-row` "content … under the drawer". Revert, `git diff` empty.

---

### Task 10: CSS for XS, the low window, the sheet bar and the menu

Model: Opus.

**Files:**
- Modify: `apps/lab/src/design/shell.css`, `console.css`, `run.css`, `library.css`
- Modify: `apps/lab/src/routes/LayoutInvariants.browser.test.tsx` (delete `// Task 10` entries)
- Modify: `apps/lab/src/shell/bands.browser.test.tsx`

- [ ] **Step 1: Delete this task's `KNOWN_RED` entries and watch them go red**

- [ ] **Step 2: Top bar, menu and sheet bar (`shell.css`)**

Append:

```css
/* The top bar's menu chip, ⌘K's word for touch and the sheet bar exist only
   at XS (handoff 2, PR 7). */
.fw .fw-top .fw-menu-btn,
.fw-sheetbar,
#cmdk .k-touch {
  display: none;
}
@media (max-width: 767px) {
  .fw-top {
    position: relative;
    z-index: 30;
    overflow: visible;
  }
  .fw-top .right {
    display: none;
  }
  /* A top-bar chip like View and Language: a 1px --ink line and no fill;
     open, the chosen chip's --void. 28px drawn, 44 to the finger. */
  .fw .fw-top .fw-menu-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--ink);
    background: none;
    cursor: pointer;
  }
  .fw .fw-top .fw-menu-btn::before {
    content: '';
    position: absolute;
    inset: -8px -4px;
  }
  .fw .fw-top .fw-menu-btn:hover {
    background: var(--signal-fill-hover);
  }
  .fw .fw-top .fw-menu-btn[aria-expanded='true'] {
    background: var(--void);
    border-color: var(--void);
  }
  /* The right group, out of the flow at all times, so the chip does not move
     when it opens. */
  .fw.menu-open .fw-top .right {
    position: absolute;
    top: 100%;
    right: 0;
    z-index: 60;
    display: grid;
    gap: 12px;
    min-width: 12rem;
    margin: 0;
    padding: 12px;
    background: var(--graphite);
    box-shadow: 0 0 0 1px var(--border-strong);
  }
  .fw.menu-open .fw-top .right > .fw-seg {
    width: 100%;
  }
  .fw.menu-open .fw-top .right > .fw-seg button {
    flex: 1;
    justify-content: center;
    min-height: 44px;
  }
  .fw.menu-open .fw-top #cmdk {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    min-height: 44px;
  }
  #cmdk .k-key {
    display: none;
  }
  #cmdk .k-touch {
    display: inline;
  }
  /* The sheet bar: 56px, the three sheets' buttons, over the page's bottom.
     Not in solo, where the board is all there is (Review Focus 3). */
  .fw-lab:not(.solo) + .fw-sheetbar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 50;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    height: 56px;
    background: var(--void);
    box-shadow: 0 -1px 0 var(--border);
  }
  .fw .fw-sheetbar button {
    border: 0;
    background: none;
    color: var(--mist);
    cursor: pointer;
  }
  .fw .fw-sheetbar button:hover {
    background: var(--surface);
    color: var(--ink);
  }
  .fw .fw-sheetbar button[aria-pressed='true'] {
    background: var(--signal-fill);
    color: var(--ink);
  }
}
/* A low window (handoff 2, PR 7): the preset strip stands in the top bar
   (App.tsx), its panel fixed under the bar at its content's width. */
@media (max-height: 699px) and (min-width: 768px) {
  .fw-top {
    position: relative;
    z-index: 30;
    overflow: visible;
  }
  .fw-top .fw-presets {
    height: 32px;
    padding: 0 0 0 16px;
    border: 0;
    background: none;
  }
  .fw-top .fw-pp-panel {
    position: fixed;
    top: 52px;
    left: 16px;
    width: max-content;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 68px);
    overflow-y: auto;
  }
  .fw-top .fw-pp-edited {
    display: none;
  }
}
```

(`.fw-lab:not(.solo) + .fw-sheetbar`: the bar is `.fw-lab`'s next sibling, `Workspace.tsx` Task 4.)

- [ ] **Step 3: The one-column stage and the sheets (`console.css`)**

Next to `.fw-lab.simple { grid-template-rows: … }` add `.fw-lab.presets-top` to the selector, in both places (the base rule and the `(max-height: 700px)` block). Then append at the end of the file:

```css
/* XS (handoff 2, PR 7): one column; the board edge to edge; the settings
   drawer, the right column and the report as sheets over the board, above
   the sheet bar. The sheet rules carry `:not(.solo)` so solo's
   `display: none` keeps winning (Review Focus 3). */
@media (max-width: 767px) {
  .fw-lab:not(.solo) {
    padding-bottom: 56px;
  }
  .fw-lab .fw-pp-edited {
    display: none;
  }
  .fw-lab:not(.solo) .fw-stage,
  .fw-lab:not(.solo) .fw-stage.ls-open {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }
  .fw-lab:not(.solo) .fw-stage::before {
    display: none;
  }
  .fw-lab:not(.solo) .fw-stage > .fw-boardwrap,
  .fw-lab:not(.solo) .fw-stage.ls-open > .fw-boardwrap {
    grid-column: 1;
    grid-row: 1;
    padding: 0;
  }
  .fw-lab .fw-board {
    border-left: 0;
    border-right: 0;
  }
  .fw-lab .fw-drawer-handle {
    display: none;
  }
  .fw-lab .fw-ldrawer,
  .fw-lab .fw-drawer,
  .fw-lab:not(.solo) .fw-stage > .fw-run-col {
    position: fixed;
    left: 0;
    right: 0;
    top: auto;
    bottom: 56px;
    z-index: 40;
    width: auto;
    max-width: none;
    height: 70vh;
    transform: none;
    transition: none;
    display: none;
    background: var(--void);
    box-shadow: 0 -1px 0 var(--border-strong);
  }
  .fw-lab.sheet-settings:not(.solo) .fw-ldrawer,
  .fw-lab.sheet-report:not(.solo) .fw-drawer {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
  .fw-lab.sheet-settings:not(.solo) .fw-ldrawer > .fw-console,
  .fw-lab.sheet-report:not(.solo) .fw-drawer > .fw-report {
    visibility: visible;
  }
  .fw-lab.sheet-report:not(.solo) .fw-drawer > .fw-report {
    overflow-y: auto;
  }
  /* The lab's run column and the saved boards' column, each on its own tab:
     the lab's is hidden on the saved boards at (0,5,0), which a plain
     `.sheet-cli` rule would tie. */
  .fw-lab.sheet-cli:not(.solo):not(.library) .fw-stage > .fw-run-col,
  .fw-lab.library.sheet-cli:not(.solo) .fw-stage > .fw-bcol {
    display: flex;
    gap: 12px;
    padding: 16px;
    overflow-y: auto;
  }
  /* The settings sheet: the rail as a row of chips over the knobs. */
  .fw-lab .fw-ldrawer > .fw-console,
  .fw-lab.simple:not(.library) .fw-ldrawer > .fw-console {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }
  .fw-lab .fw-ldrawer .fw-rail {
    display: flex;
    flex-direction: row;
    gap: 2px;
    padding: 8px;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .fw-lab .fw-ldrawer .fw-rail .sec {
    display: none;
  }
  .fw .fw-lab .fw-ldrawer .fw-rail button {
    flex: none;
    height: 44px;
    padding: 0 16px;
  }
}
```

Before writing it, read `console.css:16-60` (`.fw-rail`) and confirm the rail's base `display` and its `.sec` class are as assumed; if the saved boards' rail marks its sections differently (PR 6), hide those too and say so in the commit.

- [ ] **Step 4: The phone's preset row and list (`run.css`)**

Delete the `@media (max-width: 600px) { .fw-pp-panel { … } }` block. Append:

```css
/* XS (handoff 2, PR 7): the trigger is the row, full width, 44px; the panel
   is a plain grouped list under it — the level as a sticky header, its modes
   as 48px rows — scrolling inside itself. `:not([hidden])`, never a bare
   `display`, or the closed panel shows (the package's own bug). */
@media (max-width: 767px) {
  .fw-lab .fw-presets {
    height: auto;
    min-width: 0;
    padding: 6px 12px;
    gap: 0;
  }
  .fw .fw-lab .fw-presets .fw-pp-trigger {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    height: 44px;
    padding: 0 12px;
    justify-content: flex-start;
    overflow: hidden;
  }
  .fw-lab .fw-presets .fw-pp-trigger > span:not(.caret):not(.k) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fw-lab .fw-presets .fw-pp-trigger .caret {
    margin-left: auto;
  }
  .fw-lab .fw-pp-panel {
    left: 12px;
    right: 12px;
    width: auto;
    max-width: none;
    margin-top: 0;
    max-height: calc(100vh - 220px);
    padding: 0;
    box-shadow: 0 0 0 1px var(--border-strong);
  }
  .fw-lab .fw-pp-panel:not([hidden]) {
    display: block;
  }
  .fw-lab .fw-pp-col {
    display: block;
    padding: 0;
    background: none;
    box-shadow: none;
  }
  .fw-lab .fw-pp-col h3 {
    position: sticky;
    top: 0;
    z-index: 1;
    margin: 0;
    padding: 14px 16px 6px;
    background: var(--graphite);
    box-shadow: 0 1px 0 var(--border);
  }
  .fw-lab .fw-pp-col + .fw-pp-col h3 {
    padding-top: 20px;
  }
  .fw .fw-lab .fw-pp-col button {
    width: 100%;
    height: 48px;
    padding: 0 16px;
    align-items: center;
    box-shadow: 0 1px 0 var(--border);
  }
}
```

- [ ] **Step 5: Run the layout file**

Run: `pnpm -C apps/lab exec vitest run --project chromium src/routes/LayoutInvariants.browser.test.tsx`
Expected: all green, `KNOWN_RED` empty. The `touch-target` findings at XS are expected until Task 11 extends the coarse sizes: if any remain, move them to `KNOWN_RED` marked `// Task 11` rather than fixing them here.

- [ ] **Step 6: Behaviour cases that need the stylesheets**

Append to `shell/bands.browser.test.tsx` (import the eight stylesheets in `main.tsx` order, as `LayoutInvariants` does — that is what makes `display: none` real here):

```tsx
// Review Focus 3.
test('solo at XS hides the sheet and the sheet bar', async () => {
  await page.viewport(375, 812)
  await mountApp('advanced')
  await loadRunDone()
  await act(async () => ui().setSheet('settings'))
  expect(document.querySelector('.fw-ldrawer')?.checkVisibility()).toBe(true)
  await userEvent.keyboard('f')
  expect(document.querySelector('.fw-ldrawer')?.checkVisibility()).toBe(false)
  expect(document.querySelector('.fw-sheetbar')?.checkVisibility()).toBe(false)
  await userEvent.keyboard('f')
})

// Review Focus 5: nothing hidden takes the focus.
test('closed sheets and a closed popover hold no focusable box', async () => {
  for (const [w, h] of [[375, 812], [1024, 768]] as const) {
    await page.viewport(w, h)
    await mountApp('advanced')
    await loadRunDone()
    const hidden = [...document.querySelectorAll<HTMLElement>('.fw-ldrawer button, .fw-more-pop button, .fw-more-pop [role="switch"]')]
      .filter((el) => !el.checkVisibility({ visibilityProperty: true }))
    for (const el of hidden) {
      el.focus()
      expect(document.activeElement, `${w}: ${el.textContent ?? ''}`).not.toBe(el)
    }
  }
})

// Task 5's gap: the menu consumes its own Escape, so a drawer does not close
// on the same press.
test('Escape in the open menu closes the menu only', async () => {
  await page.viewport(375, 812)
  const screen = await mountApp('advanced')
  await act(async () => ui().setSheet('report'))
  await screen.getByRole('button', { name: 'menu', exact: true }).click()
  await userEvent.keyboard('{Escape}')
  expect(ui().menu).toBe(false)
  expect(ui().sheet).toBe('report')
})
```

Run: `pnpm -C apps/lab exec vitest run --project chromium src/shell/bands.browser.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit, then mutations**

```bash
pnpm -C apps/lab exec prettier --write src/design src/routes/LayoutInvariants.browser.test.tsx src/shell/bands.browser.test.tsx
git add apps/lab/src
git commit -m "Lay the lab out on a phone with bottom sheets, a menu chip and a grouped preset list, and stand the presets in a low window's top bar"
```

1. Replace `.fw-lab .fw-pp-panel:not([hidden])` with `.fw-lab .fw-pp-panel`. `board@375x812` turns red (`popover-fit` or `overlap`: the closed panel shows). Revert.
2. Drop `:not(.solo)` from `.fw-lab:not(.solo) + .fw-sheetbar`. `solo at XS hides…` turns red on the sheet bar. Revert.
3. Delete `event.preventDefault()` in `TopBar`'s menu `onKey`. `Escape in the open menu closes the menu only` turns red on `sheet`. Revert.
4. Task 8's pending mutation 6 (delete `barClip`'s skip): `presets-open@924x540` turns red with `bar-clip`. Revert, `git diff` empty.

---

### Task 11: A finger's sizes at XS

Model: Sonnet.

**Files:**
- Modify: `apps/lab/src/design/shell.css` (coarse blocks at lines 220, 434, 563, 603 before this PR's edits)
- Modify: `apps/lab/src/design/console.css` (coarse blocks at 891, 993, 1251)
- Modify: `apps/lab/src/design/run.css` (coarse blocks at 96, 184, 345), `library.css` (148), `docs.css` (59)
- Modify: `apps/lab/src/design/touch.browser.test.tsx`

- [ ] **Step 1: Write the failing touch rows**

`coarseHeight` asks for rules whose condition names `pointer: coarse`. Add a second reader for the XS query and cases that must hold under both:

```ts
/** As `coarseHeight`, for the rules inside a condition that names `max-width: 767px`. */
function phoneHeight(el: Element): number {
  let best = 0
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (!(rule instanceof CSSMediaRule) || !rule.conditionText.includes('max-width: 767px')) continue
      for (const inner of rule.cssRules) {
        if (!(inner instanceof CSSStyleRule)) continue
        let hit: boolean
        try {
          hit = el.matches(inner.selectorText)
        } catch {
          hit = false
        }
        if (!hit) continue
        for (const prop of ['height', 'min-height'] as const) {
          const px = Number.parseFloat(inner.style.getPropertyValue(prop))
          if (Number.isFinite(px)) best = Math.max(best, px)
        }
      }
    }
  }
  return best
}

// Handoff 2, PR 7: a phone gets a finger's sizes whatever its pointer reports
// — the coarse blocks name the XS width too (spec §5).
test.each([
  ['a knob row value', '<div class="kv-g"><button class="kv-num">1</button></div>', 'button', 44],
  ['a knob row select', '<div class="kv-g"><span class="cc"><select></select></span></div>', 'select', 40],
  ['a dependency header', '<div class="kv-g"><button class="kv-dephd">x</button></div>', 'button', 48],
  ['a run alternative', '<div class="fw-alt"><button>New seed</button></div>', 'button', 44],
  ['a preset row', '<div class="fw-pp-col"><button>x</button></div>', 'button', 44],
  ['a tab', '<div class="fw-tabrow"><button>Lab</button></div>', 'button', 0],
  ['a docs link', '<nav class="fw-docs-nav"><a href="#">CLI</a></nav>', 'a', 44],
  ['Generate', '<section class="fw-run-col"><button class="fw-go">Generate</button></section>', 'button', 44],
] as const)('%s is raised at XS', async (_, html, tag, px) => {
  const screen = await render(<div className="fw" dangerouslySetInnerHTML={{ __html: html }} />)
  const el = screen.container.querySelector(tag)
  if (el === null) throw new Error(`no ${tag}`)
  expect(phoneHeight(el)).toBeGreaterThanOrEqual(px)
})
```

(The tab's floor is 0 because its target comes from padding, which this reader does not see; the layout matrix's `touch-target` measures it. Keep the row so the query list is exercised for `shell.css:220`.)

Also add to the switch test: `expect(phoneHeight(el)).toBe(18)` — the PR 4 ruling holds at XS.

Run: `pnpm -C apps/lab exec vitest run --project chromium src/design/touch.browser.test.tsx`
Expected: FAIL — `phoneHeight` returns 0.

- [ ] **Step 2: Join XS to the size blocks**

Change `@media (pointer: coarse) {` to `@media (pointer: coarse), (max-width: 767px) {` at exactly these blocks: `shell.css` tab row (220), solo button (434), segmented (563), `.fw-btn` (603); `console.css` knob rows (891), knob/palette/switch (993), clamp notice button (1251); `run.css` alternatives/exports/option (96), copy button (184), presets (345); `library.css` (148); `docs.css` (59). Leave alone: `shell.css:39` (scrollbars), `shell.css:308` and `:360` (handle widths — the handles are hidden at XS), and the `--hd` block in `console.css`.

Add to the `console.css` XS block from Task 10 the XS-only rules (spec §5):

```css
  .kv-g .ln {
    font-size: 14px;
  }
  .kv-g .mn,
  .kv-g .mx {
    display: none;
  }
  .fw .fw-run-col .fw-go {
    min-height: 44px;
  }
```

Before adding the `.ln`/`.mn`/`.mx` rules, grep `console.css` for `.kv-g .ln`, `.mn` and `.mx` and confirm the class names exist (PR 2's knob rows); if they differ, use the file's names and say so in the commit.

- [ ] **Step 3: Run the touch test, the layout file and the node pins**

Run: `pnpm -C apps/lab exec vitest run --project chromium src/design/touch.browser.test.tsx src/routes/LayoutInvariants.browser.test.tsx`
Expected: PASS; delete any `// Task 11` entries in `KNOWN_RED` first and watch them go red, then green.
Run: `pnpm -C apps/lab exec vitest run --project node`
Expected: PASS.

- [ ] **Step 4: Commit and mutate**

```bash
pnpm -C apps/lab exec prettier --write src/design
git add apps/lab/src/design
git commit -m "Give a phone a finger's sizes by naming the XS width in the coarse blocks"
```

Mutation: revert the query list on the `run.css` alternatives block only. `a run alternative is raised at XS` turns red, and so does `sheet-cli@375x812` in the layout file, with `touch-target` on New seed / Defaults / Abort (the CLI sheet is the only XS state where they are rendered). Revert, `git diff` empty.

---

### Task 12: Gates, the live pass and the PR

Controller task (not dispatched).

- [ ] **Step 1: Full gates in a clean worktree** ([[feedback-sdd-podzial-modeli]]: `.agents/` breaks fmt in the main checkout)

Run in `.claude/worktrees/responsive`: `pnpm nx run-many -t verify --skip-nx-cache` and `deno task verify`.
Expected: both green; record test counts.

- [ ] **Step 2: Live pass in Chrome**

Per [[arrowz-przepisy-pomiarowe]]: `deno task store` and `pnpm nx serve lab` (ports 8787/8789 with a copy of the store if 8777/8779 are taken). At 1920×1080, 1440×900, 1280×800, 1024×768, 924×540, 768×1024, 600×900 and 375×812, in English and Polish: open and close each drawer, each sheet, the menu, the `…` popover, the presets (at 924×540 from the top bar); resize across 1024 with the drawer open and back; press `f`, `r`, `s`, Escape at XS; do the same on the saved boards with a board open. Every defect found is a new failing test first, then the fix.

- [ ] **Step 3: Record, then the PR**

Update memory ([[arrowz-runda2-handoff]]: PR 7 opened) and the repo's basic-memory session note. Then, with the user's go: `git push -u origin lab/responsive` and `gh pr create --base lab/saved-boards --title "Lab: responsive layout in five bands, a bar under the board and bottom sheets on a phone"` with a body listing D1–D4, the spec's §5 rulings (switch size, ⌘K word), the test counts and the live pass.
