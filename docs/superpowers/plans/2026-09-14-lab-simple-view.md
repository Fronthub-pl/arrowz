# The simple view and the language switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `apps/lab` the old lab's simple view — size, two sliders, a skeleton switch, a seed and randomising, as the view a first visit opens on — and the PL/EN language switch, completing spec §2.2's trigger table for both views.

**Architecture:** Two remembered preferences (`lang`, `ui.mode`) and one recipe slice join the store, all persisted to `localStorage` through a guarded helper. The recipe writes the knobs at once through the machine path (`params.setMany`), so the command and the hash are always what a run would use; one debounce owner, `useAutoRun`, now watches two counters — `params.edits` behind the `auto` switch and `recipe.edits` without it — so every trigger still cancels exactly one pending run (Ruling 3). The console stays one component whose first two tracks swap between the rail with a panel and the simple panel, so the run column keeps its React instance across the swap (Ruling 7).

**Tech Stack:** React 19, zustand 5.0.15, Vite 8, Vitest 5 with `@vitest/browser` 5 and `vitest-browser-react` 2.3 (node + chromium browser mode), `@arrowz/engine` (`PARAM_SPEC`, `defaultParams`), `@arrowz/engine/simple` (`recipeOf`, `defaultChoice`, `simpleParams`, `exportCell`, `SIMPLE_CHOICES`, `Recipe`), `@arrowz/engine/i18n` (`dictionary`, `Lang`, `Dict`).

**Spec:** `docs/superpowers/specs/2026-09-13-lab-react-app-design.md` — §2.1 units 1 and 4, §2.2 (the three simple rows and the simple halves of four more), §3 (bilingual PL/EN), §5.1, §5.2, §5.3 (`ui`, `lang`, `recipe`), §7.1, §7.2, §8, §10 row 4 (first half).

**Previous plan:** `docs/superpowers/plans/2026-09-13-lab-run-triggers.md` (PR #66). This branch stacks on `lab/run-triggers`.

**Branch:** `lab/simple-view`, created from `lab/run-triggers` at `6fab621`. The pull request's base is `lab/run-triggers`, not `main`.

## Global Constraints

- **Everything written to a file is English** — code, comments, tests, docs, commit messages. Only the conversation with the user is Polish.
- **No `any`, no non-null assertions.** ESLint enforces both in `apps/lab`.
- **Both gates must pass before the PR:** `deno task verify` in the repository root and `pnpm nx run-many -t verify`.
- **Never import the engine's `.ts` sources from `apps/`.** After any edit under `packages/engine`, run `pnpm nx build engine` before running `apps/lab` tests by hand.
- **English is the source language in code**, Polish is the translation. A new UI string goes into both tables in `packages/engine/lab-i18n.ts`; `lab-i18n.test.ts` checks the key sets match.
- **No attribution lines in commit messages.**
- **Do not delete or modify anything under `packages/cli/boards/`, any `dist/`, or any `node_modules/`.** Gitignored is not worthless: `boards/` is the user's local board store.
- Commit after every task. Run `pnpm --dir apps/lab exec prettier --write src` before each commit; Prettier is a gate.

### Harness facts, each measured

- **`render` and `renderHook` from `vitest-browser-react` are async.** `const screen = await render(<X />)`.
- **`toHaveTextContent` is exact equality**; substrings and regexes go through `toMatchTextContent(/…/)`.
- **Playwright locators are strict**: a name matching two elements throws. Use `{ exact: true }` where a name is a substring of another.
- **Browser test files are isolated for the store and `location.hash`, but not for `localStorage`**: every file shares one origin. Task 1 clears storage in `vitest.setup.ts`, which runs before a test file's imports (measured 2026-09-14). Cases *within* a file still share everything; every file resets by hand at its top.
- **Chromium takes the machine's locale** (measured `pl-PL` on the maintainer's machine). Task 1 pins `en-US`. The node project sees the machine's locale through `navigator.language` too, so no node test may assert a starting language.
- **`vitest-browser-react` renders without StrictMode** by default; `main.tsx` mounts with it.
- **A store write from outside a React event reaches the DOM on a microtask at the earliest.** Wrap it in `await act(async () => …)` before reading the DOM, or poll.
- **Fake timers:** install after `render`/`renderHook`, never with `shouldAdvanceTime`, wrap every store write in `await act(...)`, advance with `await vi.advanceTimersByTimeAsync(...)`, assert with plain `expect` — `expect.element` polls and hangs on a frozen clock.
- **`locator.click()` waits for actionability**: clicking a disabled button stalls to the timeout instead of failing.
- **`BrowserRouter` commits navigation inside `startTransition`**: poll route-dependent DOM after a tab click.
- **`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals` are on**, and ESLint's `no-unused-vars` is an error: a spare import in a test fails `check`. Vitest does not type-check, so a step expecting a type error sees a runtime failure instead.
- **`locator.element()` returns `HTMLElement | SVGElement`**: reach an input's API through `screen.container.querySelector<HTMLInputElement>(…)`.
- **React 19 has no global `JSX` namespace**: type a component's return as `ReactElement`.

---

## Rulings I made

Decisions this plan takes that the spec left open or states differently. An executor must not relitigate them; a reviewer should attack them. Rulings 1, 2, 3, 5 are the user's decisions from the brainstorming on 2026-09-14.

**Ruling 1 — PR 4 is two pull requests.** 4a (this plan): the language switch and the simple view, which both live in the top bar's right group and both change the page-load run and the hash. 4b: the report with both delta baselines, the SVG export, and solo with the `f` hotkey — stage chrome with no trigger. Task 12 amends §10.

**Ruling 2 — a first visit opens on the simple view**, as the old lab does (`lab-page.ts:1479`: `showView(localStorage.getItem('labView') === 'advanced' ? 'advanced' : 'simple')`). The three test files that mount the whole app set the advanced view in their reset.

**Ruling 3 — one debounce owner.** `useRun.hold()` keeps a single cancel. A second hook with its own timer would overwrite that slot, and Generate would then cancel one of two pending runs while the other fired 350 ms later and terminated the carve Generate started. `useAutoRun` therefore watches `params.edits` (gated by `auto`) and `recipe.edits` (ungated: the old lab's size fields and sliders call `schedule()` unconditionally, `lab-page.ts:527-529`, `:559-561`). A recipe edit leaves a debt that a later knob edit with `auto` off does not erase, and that a cancel does.

**Ruling 4 — the recipe writes the knobs at once, through the machine path.** `applyRecipe` is `simpleParams` → `params.setMany` → `ui.raiseClamped` → `view.cell = exportCell(W, H)`, the old `applySimple` (`lab-page.ts:631-639`). The command box and the hash therefore describe what the next run uses. The simple view's seed field writes with `setMany` too: through `set` it would wake an `auto` left on in the advanced view, which the simple view hides, and the old seed field starts nothing (`lab-page.ts:660`). It commits on Enter or blur (§5.5) where the old field wrote on every keystroke, so the command and the hash follow a typed seed at its commit — a parity delta the PR body names.

**Ruling 5 — the draw's moves are not shown.** `drawParams` reports values it moved to keep `sharesSum`; the old lab calls `simpleParams` and ignores them. Measured over 162 recipes × 200 draws: without randomising nothing ever moves (0/162); with it 320 of 32 400 draws move `wMid` by hundredths at the "very short" end. The command already shows the moved value.

**Ruling 6 — the page owns `lang` in the hash.** It leaves `Carried` and is written on every hash write, as the old `saveToUrl` writes it (`lab-page.ts:1349`); `tab` stays carried until PR 5. A link's language is applied through `setLang`, so it is remembered — the old lab persists in `applyLanguage` (`lab-page.ts:404`). The starting language before any link is read follows `lab-page.ts:108-109`: stored `pl` → Polish; nothing stored and a browser asking for Polish → Polish; anything else → English. The old lab also writes `labLang` on every load, the browser-derived language included (`applyLanguage()` at `lab-page.ts:1476`); this one writes only on a choice, which changes nothing a user sees until the browser's language changes. *Corrected after execution:* a reload writes it too, because the page's own hash carries `lang` and a decoded `lang` goes through `setLang`; only a first visit leaves storage empty (Task 12's browser pass).

**Ruling 7 — one `Console`, two interiors, and §5.1 is amended.** §5.1 says the run column is one instance because the route builds it and hands it to whichever console is on screen. React reconciles by type and position, not by element identity: `<Console>{col}</Console>` replaced by `<SimpleConsole>{col}</SimpleConsole>` is a new parent type, and the column remounts. `Console` instead keeps `{children}` at the third position of its own grid and swaps only the first two — the rail becomes `null`, the panel becomes `SimplePanel`. Task 10 proves the node survives.

**Ruling 8 — a segmented choice is a radio group, and its accessible name is its visible text.** Mutually exclusive choices are radios (a screen reader says "1 of 2"); `aria-pressed` describes independent toggles. Arrow keys, Home and End move the choice and the focus, as `TabRow` does. The language radios read `PL` and `EN`, not "Polski"/"English": a name that does not contain the visible text fails WCAG 2.5.3 for speech input.

**Ruling 9 — the simple view shows the old lab's preview subset.** `lab.html:221-265` marks `cell`, `voids`, `top`, `auto` and `help` as `advonly`; `stroke`, `headWidth`, `headHeight`, `rounded`, `colored` and `hilite` stay. The simple panel draws those six below the recipe; the run column hides its two switches; the preset strip is hidden (`lab.html:52`: `body.simple #presets`).

**Ruling 10 — the simple panel spans the first two tracks, and the lab grid drops the preset row in simple mode.** `.fw-lab` is `auto minmax(180px, 1fr) minmax(0, 1fr)`; with the preset strip absent the stage would be auto-placed into the `auto` row and collapse. `.fw-lab.simple` declares the two remaining rows.

**Ruling 11 — a page "opened from a link" is one whose hash decoded**, whether or not it named a knob. The old `loadFromUrl` returns true once the JSON parses (`lab-page.ts:1355-1358`), and the recipe is then not applied (`:1480`).

**Ruling 12 — the skeleton radios run on arrow keys as well as on clicks.** Radio semantics select on arrow; the old lab's buttons ran on click. Arrowing across two options starts two runs, the second terminating the first — the same as clicking both.

**Ruling 13 — on the top bar's Signal plane the segment inverts, and so does the focus ring.** The unselected option is `--void` text on `--signal` (4.08:1, the pairing `.name` and `.dims` already ship with — the open §7.1 item), the selected one `--ink` on `--void`. The global `:focus-visible` ring is `--signal` and would vanish on that plane, so the top bar's ring is `--void`. Task 12 measures both in the browser.

**Ruling 14 — preferences are read and written through one guarded helper.** The node test project imports the store and has no dependable Web Storage, and a browser may refuse storage; an unreadable preference is the default, never an exception.

---

## Revision 2: what the three reviews changed

Three independent reviews (facts and compilation; whether each test can fail; parity, seams and CSS) ran on revision 1. Recorded so a reviewer of this revision knows which claims were measured.

**Fixed.** `SimplePanel`'s cases asserted absolute `recipe.edits`, which only grows and which `reset()` deliberately leaves alone — the second and third case in file order would have failed for a reason unrelated to their names; every counter assertion is now relative. The stage-height case asserted a 180px floor that an auto-placed stage clears anyway (292px measured at the runner's 414×896); it now compares with the height before the swap. Case 14 claimed to detect the order of the new seed and the draw, which `simpleParams` cannot show; the claim is gone. The StrictMode case in `LabRoute.browser.test.tsx` renders `App` without `mountApp` and would have inherited another case's mode and language; it gets the same resets. Ruling 11 had no case telling "the hash decoded" from "the hash named a knob"; case 18 does. `applyRecipe` replaced the view slice on every slider frame, and the board element redraws everything for a new view; it now writes the cell only when it moves, with a test. Three spec lines still described the rejected design or the old page-load rule; Task 12 amends them. The top bar's and the chip's hover rules could have hidden the selected state by source order alone; they exclude the checked radio. The skeleton card spoke its name twice; `Segmented` takes `labelledBy`. A read-only percent had the text cursor. Four citations and one CSS specificity comment were corrected.

**Rejected after measurement.** One review held that `getByRole('radio', { name: 'PL' })` also matches `Simple`. A probe rendering both radios found one match with and without `exact: true`; the locators stay as written.

**Confirmed, not to be re-litigated.** Every import, export and signature, compiled with the project's `tsc` and ESLint; every old-lab citation; Ruling 7's reconciliation argument and its mutation; the funnel — no simple-view path starts two runs or leaves a debounce behind; Task 4's pass/fail split and its `owed` mutation; node 24 here has no `localStorage` and a `pl-PL` `navigator.language`, so the guarded helper and the no-starting-language rule for node tests are both needed.

## Revision 3: what the second round changed

Two reviews ran on revision 2 — one on its diff, one walking every task as an implementer who sees only that task. Neither found a critical or important defect in the application code or the tests. Changed: Task 6 runs the two engine test files rather than the whole Deno suite, whose `packages/cli` half needs a bundle this task never builds, and formats `lab-i18n.ts` with `deno fmt`; the case 8 comment and the `useAutoRun` head-comment paragraph have exact positions; `PositionSlider` imports React once; `Segmented`'s interface names its `aria-labelledby` branch; the stage-height note says why 292px is bound to the viewport's height. Both reviewers independently re-ran the `PL` locator probe and found one match.

---

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `apps/lab/src/harness/storage-a.browser.test.ts`, `storage-b.browser.test.ts` | Guard the two harness pins: a file inherits no storage, the browser asks for English. |
| `apps/lab/src/state/storage.ts` | `readStored`, `writeStored`: `localStorage` that never throws. |
| `apps/lab/src/state/lang.slice.ts` | `lang`, `setLang`, `initialLang`, `isLang`; key `labLang`. |
| `apps/lab/src/state/recipe.slice.ts` | The simple view's recipe, its debounced-edit counter, key `labSimple`. |
| `apps/lab/src/state/preferences.browser.test.ts` | The three preferences reach `localStorage`. |
| `apps/lab/src/simple/applyRecipe.ts` | `applyRecipe(random)`, `drawIfRandom()`, `resetRecipeIfSimple()`. |
| `apps/lab/src/simple/PositionSlider.tsx` | A 0–100 recipe slider with its two end words. |
| `apps/lab/src/simple/SimplePanel.tsx` | The simple view's cards and its preview subset. |
| `apps/lab/src/console/DraftNumber.tsx` | The §5.5 draft entry, lifted out of `ValueKnob`. |
| `apps/lab/src/shell/Segmented.tsx` | One-of-a-few as a radio group. |
| `apps/lab/src/shell/useDocumentLang.ts` | `<html lang>` follows the store. |

**Modified**

| Path | Change |
|---|---|
| `apps/lab/vitest.config.ts`, `apps/lab/vitest.setup.ts` | Locale pinned to `en-US`; storage cleared per file. |
| `apps/lab/src/state/ui.slice.ts` | `mode`, `setMode`, `modeOf`; key `labView`. |
| `apps/lab/src/state/store.ts` | `lang` and `recipe` slices. |
| `apps/lab/src/i18n.ts` | `useDictionary` reads the `lang` slice. |
| `apps/lab/src/run/useAutoRun.ts` | Watches `recipe.edits` too, with the owed-run rule. |
| `apps/lab/src/console/ValueKnob.tsx` | Uses `DraftNumber`. |
| `apps/lab/src/console/ViewPanel.tsx`, `viewFields.ts` | Export the field and flag controls and the simple subset. |
| `apps/lab/src/console/Console.tsx` | Takes `control`; swaps its first two tracks by mode. |
| `apps/lab/src/shell/TopBar.tsx` | The view and language radio groups. |
| `apps/lab/src/stage/Stage.tsx` | Hands `lang` to the board. |
| `apps/lab/src/state/url.ts`, `url.fixtures.ts`, `useUrlHash.ts` | `lang` owned by the page; `openedFromLink()`. |
| `apps/lab/src/run/RunColumn.tsx` | Hides `auto`/`help` in simple mode; simple halves of Generate, New seed, Defaults. |
| `apps/lab/src/routes/LabRoute.tsx` | Hides the preset strip in simple mode; `.fw-lab.simple`; passes `control` to `Console`. |
| `apps/lab/src/App.tsx` | `useDocumentLang`; the page-load run applies the recipe. |
| `apps/lab/src/design/shell.css`, `console.css` | `.fw-seg`, its top-bar inversion, `.fw-simple`, `.fw-ends`, `.fw-lab.simple`. |
| `packages/engine/lab-i18n.ts` | Five `ui` keys in both languages. |
| Tests beside each of the above, plus `triggers.browser.test.tsx`, `LabRoute.browser.test.tsx`, `RunColumn.browser.test.tsx`, `TopBar.browser.test.tsx` | See each task. |
| `docs/superpowers/specs/2026-09-13-lab-react-app-design.md` | §5.1 tree and instance claim; §10 row 4 split. |

---

## Task 1: Pin the browser's language and forget the previous file's storage

**Files:** Modify `apps/lab/vitest.config.ts`, `apps/lab/vitest.setup.ts`; create `apps/lab/src/harness/storage-a.browser.test.ts`, `apps/lab/src/harness/storage-b.browser.test.ts`.

**Interfaces:**
- Produces: every browser test file starts with an empty `localStorage` and `navigator.language === 'en-US'`. Tasks 2–11 rely on both: the store reads three preferences at import, and a Polish browser would open the lab in Polish.

- [ ] **Step 1: Write the two guard files**

`apps/lab/src/harness/storage-a.browser.test.ts`:

```ts
import { expect, test } from 'vitest'

// Read at import, which is when the store reads the preferences it remembers
// (`labLang`, `labView`, `labSimple`): the setup file must have cleared them
// already, and import time is the only moment that can be checked.
const leftOver = localStorage.getItem('harness-storage')

// There are two copies of this file, a and b, and both write the key. Whichever
// the runner takes second fails if a file inherits the storage of the file
// before it — which every file does without `vitest.setup.ts`'s clear, because
// all browser test files share one origin (measured 2026-09-14).
test('a file starts with nothing its predecessor remembered', () => {
  expect(leftOver).toBeNull()
  localStorage.setItem('harness-storage', 'a')
})

// Vitest's Chromium takes the machine's locale (measured `pl-PL` on the
// maintainer's machine), and the lab opens in Polish for a Polish browser.
// Without the pin, every test that finds a control by its English name passes
// on CI and fails on that machine.
test('the browser asks for English, whatever the machine running it speaks', () => {
  expect(navigator.language).toBe('en-US')
})
```

`apps/lab/src/harness/storage-b.browser.test.ts`: the same file with `'a'` replaced by `'b'` in `setItem`.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm nx run lab:test -- harness`
Expected: FAIL — `expected 'a' to be null` (or `'b'`) in whichever file runs second. On a machine whose locale is not English, also `expected 'pl-PL' to be 'en-US'`; on an English machine that case passes before the change, which is why the storage case is the one to watch.

- [ ] **Step 3: Pin the locale**

In `apps/lab/vitest.config.ts`, replace the `contextOptions` line:

```ts
              // `locale` because Chromium otherwise takes the machine's, and
              // the lab picks its starting language from `navigator.language`
              // (src/harness/storage-a.browser.test.ts).
              contextOptions: { deviceScaleFactor: 2, locale: 'en-US' },
```

- [ ] **Step 4: Clear storage per file**

Replace `apps/lab/vitest.setup.ts` with:

```ts
// Brings vitest-browser-react's matchers and its beforeEach cleanup into every
// browser test file.
import 'vitest-browser-react'

// Every browser test file shares one origin, so `localStorage` outlives a
// file: a key written by one was read by the next (measured 2026-09-14). The
// lab remembers three preferences there and reads them when the store is
// created — at import — so the clear has to run before a test file's own
// imports, which is when a setup file runs (measured the same day: the next
// file read the key back as null at import).
localStorage.clear()
```

- [ ] **Step 5: Run them to verify they pass**

Run: `pnpm nx run lab:test -- harness`
Expected: PASS, both files.

- [ ] **Step 6: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src vitest.config.ts vitest.setup.ts
git add apps/lab/vitest.config.ts apps/lab/vitest.setup.ts apps/lab/src/harness
git commit -m "Start every browser test file in English and with nothing remembered"
```

---

## Task 2: Two remembered preferences — the language and the view

**Files:** Create `apps/lab/src/state/storage.ts`, `apps/lab/src/state/lang.slice.ts`, `apps/lab/src/state/lang.slice.test.ts`, `apps/lab/src/state/preferences.browser.test.ts`; modify `apps/lab/src/state/ui.slice.ts`, `apps/lab/src/state/ui.slice.test.ts`, `apps/lab/src/state/store.ts`, `apps/lab/src/i18n.ts`.

**Interfaces:**
- Consumes: Task 1's clean storage and English browser.
- Produces:
  - `readStored(key: string): string | null`, `writeStored(key: string, value: string): void` from `state/storage.ts`.
  - From `state/lang.slice.ts`: `LANG_KEY = 'labLang'`, `isLang(value: unknown): value is Lang`, `initialLang(stored: string | null, browser: string | undefined): Lang`, `interface LangState { lang: Lang; setLang(lang: Lang): void }`, `createLangSlice(set)`.
  - From `state/ui.slice.ts`: `type ViewMode = 'simple' | 'advanced'`, `MODE_KEY = 'labView'`, `modeOf(stored: string | null): ViewMode`; `UiState` gains `mode: ViewMode` and `setMode(mode: ViewMode): void`.
  - `Store` gains `lang: LangState`. `useDictionary()` returns the dictionary of `state.lang.lang`.

- [ ] **Step 1: Write the failing node tests**

`apps/lab/src/state/lang.slice.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createLangSlice, initialLang, isLang, type LangState } from './lang.slice'

describe('the language a page opens in', () => {
  // The old lab's rule, `lab-page.ts:108-109`: a stored `pl` wins; with
  // nothing stored a Polish browser gets Polish; anything else is English —
  // including a stored value that is not a language at all.
  it.each([
    ['pl', 'en-US', 'pl'],
    ['en', 'pl-PL', 'en'],
    [null, 'pl-PL', 'pl'],
    [null, 'PL', 'pl'],
    [null, 'en-GB', 'en'],
    [null, undefined, 'en'],
    ['de', 'pl-PL', 'en'],
  ] as const)('stored %s, browser %s → %s', (stored, browser, expected) => {
    expect(initialLang(stored, browser)).toBe(expected)
  })

  it('knows the two languages the dictionary has, and nothing else', () => {
    expect(isLang('pl')).toBe(true)
    expect(isLang('en')).toBe(true)
    expect(isLang('de')).toBe(false)
    expect(isLang(undefined)).toBe(false)
  })
})

// No assertion on the slice's starting language: node's `navigator.language`
// is the machine's locale, and `initialLang` above is where the rule lives.
describe('the language slice', () => {
  it('switches when told', () => {
    const store: { lang: LangState } = { lang: createLangSlice((fn) => Object.assign(store, fn(store))) }
    store.lang.setLang('pl')
    expect(store.lang.lang).toBe('pl')
    store.lang.setLang('en')
    expect(store.lang.lang).toBe('en')
  })
})
```

Append to `apps/lab/src/state/ui.slice.test.ts`, and add `modeOf` to the existing import from `./ui.slice`:

```ts
describe('the view a page opens in', () => {
  function slice() {
    const store: { ui: UiState } = { ui: createUiSlice((fn) => Object.assign(store, fn(store))) }
    return store
  }

  // `lab-page.ts:1479`: only a stored `advanced` opens the advanced view.
  it('is the simple view unless the advanced one was chosen last time', () => {
    expect(modeOf(null)).toBe('simple')
    expect(modeOf('simple')).toBe('simple')
    expect(modeOf('advanced')).toBe('advanced')
    expect(modeOf('junk')).toBe('simple')
  })

  it('switches when told', () => {
    const store = slice()
    store.ui.setMode('advanced')
    expect(store.ui.mode).toBe('advanced')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm nx run lab:test -- lang.slice ui.slice`
Expected: FAIL — `lang.slice` cannot be resolved; `modeOf is not a function`.

- [ ] **Step 3: Write `state/storage.ts`**

```ts
/**
 * The page's remembered preferences, through a door that never throws
 * (Ruling 14). The node test project imports the store and has no dependable
 * Web Storage, and a browser may refuse storage outright — a private window, a
 * blocked origin. A preference that cannot be read is the default; one that
 * cannot be written lasts for this page.
 *
 * `typeof` inside the `try`: on an engine whose `localStorage` is a getter that
 * throws, evaluating it at all is the throw.
 */
export function readStored(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStored(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
  } catch {
    // Nothing to do: the preference lasts for this page and no longer.
  }
}
```

- [ ] **Step 4: Write `state/lang.slice.ts`**

```ts
import type { Lang } from '@arrowz/engine/i18n'
import { readStored, writeStored } from './storage'

/** The old lab's key, so a preference set in one lab opens the other in the same language. */
export const LANG_KEY = 'labLang'

export function isLang(value: unknown): value is Lang {
  return value === 'pl' || value === 'en'
}

/**
 * The language a page opens in before any link is read — `lab-page.ts:108-109`.
 * A link's language is not an input here: `useUrlHash` applies it on top, the
 * way it applies the link's knobs (Ruling 6).
 */
export function initialLang(stored: string | null, browser: string | undefined): Lang {
  if (isLang(stored)) return stored
  return stored === null && browser !== undefined && browser.toLowerCase().startsWith('pl') ? 'pl' : 'en'
}

export interface LangState {
  lang: Lang
  /** Switches the page's language and remembers it, whoever asked: the switch or a link. */
  setLang(lang: Lang): void
}

type SetStore = (fn: (state: { lang: LangState }) => { lang: LangState }) => void

export function createLangSlice(set: SetStore): LangState {
  const browser = typeof navigator === 'undefined' ? undefined : navigator.language
  return {
    lang: initialLang(readStored(LANG_KEY), browser),
    setLang: (lang) => {
      writeStored(LANG_KEY, lang)
      set((state) => ({ lang: { ...state.lang, lang } }))
    },
  }
}
```

- [ ] **Step 5: Add the view mode to `state/ui.slice.ts`**

Add the import `import { readStored, writeStored } from './storage'`, and above `UiState`:

```ts
export type ViewMode = 'simple' | 'advanced'

/** The old lab's key and values (`lab-page.ts:655`). */
export const MODE_KEY = 'labView'

/** Only a stored `advanced` opens the advanced view (Ruling 2, `lab-page.ts:1479`). */
export function modeOf(stored: string | null): ViewMode {
  return stored === 'advanced' ? 'advanced' : 'simple'
}
```

In `UiState`, after `clamped`:

```ts
  /** Which console is on screen. Remembered, never in the hash — the old lab keeps it out too. */
  mode: ViewMode
```

and after `raiseClamped(on: boolean): void`:

```ts
  setMode(mode: ViewMode): void
```

In `createUiSlice`'s returned object, after `clamped: false,`:

```ts
    mode: modeOf(readStored(MODE_KEY)),
```

and after `raiseClamped`:

```ts
    setMode: (mode) => {
      writeStored(MODE_KEY, mode)
      patch({ mode })
    },
```

- [ ] **Step 6: Add the slice to the store and the dictionary to it**

`apps/lab/src/state/store.ts`:

```ts
import { create } from 'zustand'
import { createLangSlice, type LangState } from './lang.slice'
import { createParamsSlice, type ParamsState } from './params.slice'
import { createRunSlice, type RunState } from './run.slice'
import { createUiSlice, type UiState } from './ui.slice'
import { createViewSlice, type ViewState } from './view.slice'

/**
 * One store, one named field per slice, so a per-knob selector reaches exactly
 * its own entry. PR 4a adds `lang` and `recipe`; PR 5 adds `library`.
 */
export interface Store {
  run: RunState
  params: ParamsState
  view: ViewState
  ui: UiState
  lang: LangState
}

export const useStore = create<Store>()((set) => ({
  run: createRunSlice(set),
  params: createParamsSlice(set),
  view: createViewSlice(set),
  ui: createUiSlice(set),
  lang: createLangSlice(set),
}))
```

`apps/lab/src/i18n.ts`:

```ts
import { type Dict, dictionary, type Lang } from '@arrowz/engine/i18n'
import { useStore } from './state/store'

/**
 * Built once per language. `dictionary()` returns a fresh object on every call,
 * and a fresh `dict` per render would be a new dependency for every consumer
 * that closes over it.
 */
const DICTS: Record<Lang, Dict> = { en: dictionary('en'), pl: dictionary('pl') }

/**
 * The application's only dictionary access, as PR 3 left it: every component
 * already reads its text through here, so the switch changes this file and
 * nothing that calls it. A language change re-renders every component that
 * shows text, which is all of them — it is a rare, deliberate action.
 */
export function useDictionary(): Dict {
  return DICTS[useStore((state) => state.lang.lang)]
}
```

- [ ] **Step 7: Run the node tests to verify they pass**

Run: `pnpm nx run lab:test -- lang.slice ui.slice`
Expected: PASS.

- [ ] **Step 8: Write the persistence test**

`apps/lab/src/state/preferences.browser.test.ts`:

```ts
import { expect, test } from 'vitest'
import { useStore } from './store'

// First, before anything below writes: the setup file cleared storage before
// this file's imports and the browser is pinned to en-US (Task 1), so the
// store was created with nothing remembered.
test('a fresh page opens in the simple view, in English', () => {
  expect(useStore.getState().ui.mode).toBe('simple')
  expect(useStore.getState().lang.lang).toBe('en')
})

test('a chosen language is remembered under the old lab’s key', () => {
  useStore.getState().lang.setLang('pl')
  expect(localStorage.getItem('labLang')).toBe('pl')
  useStore.getState().lang.setLang('en')
  expect(localStorage.getItem('labLang')).toBe('en')
})

test('a chosen view is remembered under the old lab’s key', () => {
  useStore.getState().ui.setMode('advanced')
  expect(localStorage.getItem('labView')).toBe('advanced')
  useStore.getState().ui.setMode('simple')
  expect(localStorage.getItem('labView')).toBe('simple')
})
```

- [ ] **Step 9: Run it, then the whole lab suite**

Run: `pnpm nx run lab:test -- preferences`
Expected: PASS.

Run: `pnpm nx run lab:test`
Expected: PASS. Nothing renders `mode` yet, and every browser file starts English, so no existing case moves.

- [ ] **Step 10: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src/state apps/lab/src/i18n.ts
git commit -m "Remember the language and the view, and read the dictionary from the store"
```

---

## Task 3: The recipe, and writing it into the knobs

**Files:** Create `apps/lab/src/state/recipe.slice.ts`, `apps/lab/src/state/recipe.slice.test.ts`, `apps/lab/src/simple/applyRecipe.ts`, `apps/lab/src/simple/applyRecipe.test.ts`; modify `apps/lab/src/state/store.ts`, `apps/lab/src/state/preferences.browser.test.ts`.

**Interfaces:**
- Consumes: `readStored`/`writeStored` (Task 2); `ui.mode` (Task 2).
- Produces:
  - From `state/recipe.slice.ts`: `RECIPE_KEY = 'labSimple'`, `type RecipeSide = 'W' | 'H'`, `type RecipeSlider = 'lengths' | 'shape'`, `interface RecipeState { value: Recipe; edits: number; setSide(side: RecipeSide, value: number): void; setSlider(slider: RecipeSlider, position: number): void; setSkeleton(skeleton: Recipe['skeleton']): void; setRandom(on: boolean): void; reset(): void }`, `createRecipeSlice(set)`. `edits` moves only for `setSide` and `setSlider`.
  - `Store` gains `recipe: RecipeState`.
  - From `simple/applyRecipe.ts`: `applyRecipe(random: boolean): void`, `drawIfRandom(): void`, `resetRecipeIfSimple(): void`.

- [ ] **Step 1: Write the failing slice test**

`apps/lab/src/state/recipe.slice.test.ts`:

```ts
import { defaultChoice, recipeOf } from '@arrowz/engine/simple'
import { describe, expect, it } from 'vitest'
import { createRecipeSlice, type RecipeState } from './recipe.slice'

function slice() {
  const store: { recipe: RecipeState } = { recipe: createRecipeSlice((fn) => Object.assign(store, fn(store))) }
  return store
}

describe('the recipe slice', () => {
  // Node has no remembered recipe to read, so the slice starts where
  // `recipeOf` starts for nothing at all.
  it('starts from the default recipe when nothing is remembered', () => {
    expect(slice().recipe.value).toEqual(recipeOf(null))
  })

  // Through `recipeOf` on every write: the engine's reader clamps and rounds a
  // side, so the slice never holds a recipe that reader would change.
  it('holds a size inside the engine range, as a whole number', () => {
    const store = slice()
    store.recipe.setSide('W', 5000)
    expect(store.recipe.value.W).toBe(1000)
    store.recipe.setSide('H', 40.6)
    expect(store.recipe.value.H).toBe(41)
  })

  it('holds a slider position inside 0..1', () => {
    const store = slice()
    store.recipe.setSlider('shape', 1.7)
    expect(store.recipe.value.shape).toBe(1)
    store.recipe.setSlider('lengths', -0.2)
    expect(store.recipe.value.lengths).toBe(0)
  })

  // Spec §2.2: a size field and a slider run after a pause; the skeleton
  // switch runs at once and randomising runs nothing. Only the first two may
  // wake the debounce, or the switch would carve twice (Ruling 3).
  it('counts a size or a slider as a debounced edit, and nothing else', () => {
    const store = slice()
    store.recipe.setSide('W', 30)
    store.recipe.setSlider('lengths', 0.3)
    expect(store.recipe.edits).toBe(2)
    store.recipe.setSkeleton('on')
    store.recipe.setRandom(true)
    store.recipe.reset()
    expect(store.recipe.edits).toBe(2)
  })

  // `lab-page.ts:927`: Defaults resets the recipe and keeps randomising.
  it('puts the default recipe back, keeping random', () => {
    const store = slice()
    store.recipe.setRandom(true)
    store.recipe.setSlider('lengths', 0.1)
    store.recipe.setSkeleton('on')
    store.recipe.reset()
    expect(store.recipe.value).toEqual(recipeOf({ ...defaultChoice(), random: true }))
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx run lab:test -- recipe.slice`
Expected: FAIL — `./recipe.slice` cannot be resolved.

- [ ] **Step 3: Write `state/recipe.slice.ts`**

```ts
import { defaultChoice, type Recipe, recipeOf } from '@arrowz/engine/simple'
import { readStored, writeStored } from './storage'

/** The old lab's key and format, so a recipe survives the move between labs. */
export const RECIPE_KEY = 'labSimple'

export type RecipeSide = 'W' | 'H'
export type RecipeSlider = 'lengths' | 'shape'

export interface RecipeState {
  value: Recipe
  /**
   * How many debounced edits — a size or a slider — the recipe has taken. The
   * skeleton switch runs at once and randomising starts nothing, so neither
   * moves it. `useAutoRun` watches this beside `params.edits`, without the
   * `auto` gate (Ruling 3).
   */
  edits: number
  setSide(side: RecipeSide, value: number): void
  setSlider(slider: RecipeSlider, position: number): void
  setSkeleton(skeleton: Recipe['skeleton']): void
  setRandom(on: boolean): void
  /** The default recipe, keeping `random` — the old lab's Defaults (`lab-page.ts:927`). */
  reset(): void
}

/** What was stored, as `recipeOf` wants it: anything unreadable is nothing. */
function parse(raw: string | null): unknown {
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

type SetStore = (fn: (state: { recipe: RecipeState }) => { recipe: RecipeState }) => void

export function createRecipeSlice(set: SetStore): RecipeState {
  const write = (next: (current: Recipe) => Recipe, debounced: boolean) =>
    set((state) => {
      // Through `recipeOf` on every write: it clamps a side into the engine's
      // range and a position into 0..1, and drops a seed — the seed lives in
      // the knobs (`Recipe`'s own definition).
      const value = recipeOf(next(state.recipe.value))
      // Inside the updater, which zustand calls exactly once and at once:
      // the stored recipe is the one this write produced, not one read around it.
      writeStored(RECIPE_KEY, JSON.stringify(value))
      return {
        recipe: { ...state.recipe, value, edits: debounced ? state.recipe.edits + 1 : state.recipe.edits },
      }
    })
  return {
    value: recipeOf(parse(readStored(RECIPE_KEY))),
    edits: 0,
    setSide: (side, v) => write((current) => ({ ...current, [side]: v }), true),
    setSlider: (slider, position) => write((current) => ({ ...current, [slider]: position }), true),
    setSkeleton: (skeleton) => write((current) => ({ ...current, skeleton }), false),
    setRandom: (random) => write((current) => ({ ...current, random }), false),
    reset: () => write((current) => ({ ...defaultChoice(), random: current.random }), false),
  }
}
```

Add the slice to `state/store.ts`: the import `import { createRecipeSlice, type RecipeState } from './recipe.slice'`, the field `recipe: RecipeState` in `Store`, and `recipe: createRecipeSlice(set),` in the creator.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm nx run lab:test -- recipe.slice`
Expected: PASS.

- [ ] **Step 5: Write the failing `applyRecipe` test**

`apps/lab/src/simple/applyRecipe.test.ts`:

```ts
import { defaultParams } from '@arrowz/engine'
import { exportCell, simpleParams } from '@arrowz/engine/simple'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../state/store'
import { applyRecipe } from './applyRecipe'

const state = () => useStore.getState()

beforeEach(() => {
  state().params.reset()
  state().recipe.reset()
  state().recipe.setRandom(false)
  state().ui.raiseClamped(false)
  state().view.setNumber('cell', '12')
})
afterEach(() => vi.restoreAllMocks())

describe('applyRecipe', () => {
  it('writes every knob the recipe draws, keeping the seed on screen', () => {
    state().params.setMany({ seed: 4242 })
    state().recipe.setSide('W', 120)
    state().recipe.setSlider('lengths', 0.2)
    applyRecipe(false)
    expect(state().params.values).toEqual(simpleParams({ ...state().recipe.value, seed: 4242 }, null))
  })

  // 120×50 and not the defaults: `exportCell` saturates at 18 for every board
  // up to 91 cells on its longer side, and the view slice starts at 12, so
  // only a wide board tells a written cell from a stale one. 1600 / 120 → 13.
  it('sets the export cell from the size it drew', () => {
    state().recipe.setSide('W', 120)
    applyRecipe(false)
    expect(state().view.cell).toBe(exportCell(120, 50))
    expect(state().view.cell).toBe(13)
  })

  // A new view object makes the board element redraw everything, and a slider
  // drag calls this sixty times a second with an unchanged size.
  it('leaves the view alone when the export cell does not move', () => {
    applyRecipe(false)
    const view = state().view
    state().recipe.setSlider('shape', 0.9)
    applyRecipe(false)
    expect(state().view).toBe(view)
  })

  // The page-load run applies the recipe, and StrictMode runs that effect
  // twice (App.tsx); the second application must be the first one.
  it('gives the same knobs twice without the draw', () => {
    state().recipe.setSlider('shape', 0.9)
    applyRecipe(false)
    const first = { ...state().params.values }
    applyRecipe(false)
    expect(state().params.values).toEqual(first)
  })

  // Measured before this plan was written: the default recipe reproduces
  // `defaultParams()` key for key (`lab-simple.ts:69-70` states it).
  it('reproduces the engine defaults from the default recipe', () => {
    state().params.setMany({ W: 77 })
    applyRecipe(false)
    expect(state().params.values).toEqual(defaultParams())
  })

  it('draws with Math.random only when asked', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    applyRecipe(false)
    expect(random).not.toHaveBeenCalled()
    applyRecipe(true)
    expect(random).toHaveBeenCalled()
    const seed = state().params.values.seed
    expect(state().params.values).toEqual(simpleParams({ ...state().recipe.value, seed }, () => 0.99))
  })

  // The old `applySimple` calls `showClamped(clamped)` with whatever this
  // application found (`lab-page.ts:636`): a notice a link raised goes down
  // when the recipe writes values that needed no clamp.
  it('lowers a clamp notice nothing in the recipe moved, as the old lab does', () => {
    state().ui.raiseClamped(true)
    applyRecipe(false)
    expect(state().ui.clamped).toBe(false)
  })

  // The machine path (Ruling 4): applying the recipe must not look like a
  // person typing a knob, or `auto` would carve behind it.
  it('leaves both edit counters alone', () => {
    const typed = state().params.edits
    const shaped = state().recipe.edits
    applyRecipe(false)
    applyRecipe(true)
    expect(state().params.edits).toBe(typed)
    expect(state().recipe.edits).toBe(shaped)
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm nx run lab:test -- applyRecipe`
Expected: FAIL — `./applyRecipe` cannot be resolved.

- [ ] **Step 7: Write `simple/applyRecipe.ts`**

```ts
import { exportCell, simpleParams } from '@arrowz/engine/simple'
import { useStore } from '../state/store'

/**
 * Writes the recipe into the knobs — the old lab's `applySimple`
 * (`lab-page.ts:631-639`). Every knob, through `setMany`: the machine path, so
 * `auto` does not carve behind it (Ruling 4). The seed is the one on screen,
 * because the recipe does not own one.
 *
 * With `random` each ranged knob is drawn afresh inside the recipe's ranges,
 * so the same seed gives a different board. Without it the canonical values
 * are used and two calls give the same knobs — which is what lets the
 * page-load run call this twice under StrictMode.
 *
 * The draw's moves are not reported (Ruling 5).
 */
export function applyRecipe(random: boolean): void {
  const { recipe, params, ui, view } = useStore.getState()
  const drawn = simpleParams({ ...recipe.value, seed: params.values.seed }, random ? Math.random : null)
  ui.raiseClamped(params.setMany(drawn))
  // Only when it moves. `setNumber` always replaces the view slice, `Stage`
  // memoises the element's view on that object, and the element redraws the
  // whole board for a new view (`arrowz-board.ts:422-428`) — which a slider
  // drag would pay sixty times a second for a cell that did not change. The
  // old lab assigned an input's value and redrew nothing.
  const cell = exportCell(drawn.W, drawn.H)
  if (view.cell !== cell) view.setNumber('cell', String(cell))
}

/**
 * Generate and New seed in the simple view with randomising on draw the knobs
 * afresh first; every other trigger keeps them (`lab-page.ts:912-921`).
 */
export function drawIfRandom(): void {
  const { ui, recipe } = useStore.getState()
  if (ui.mode === 'simple' && recipe.value.random) applyRecipe(true)
}

/**
 * Defaults in the simple view also puts the recipe back, keeping `random`, and
 * writes it into the knobs the reset just set (`lab-page.ts:926-929`). The
 * caller resets the knobs first, so the seed the recipe keeps is the default.
 */
export function resetRecipeIfSimple(): void {
  const { ui, recipe } = useStore.getState()
  if (ui.mode !== 'simple') return
  recipe.reset()
  applyRecipe(false)
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `pnpm nx run lab:test -- applyRecipe recipe.slice`
Expected: PASS.

- [ ] **Step 9: Extend the persistence test**

Append to `apps/lab/src/state/preferences.browser.test.ts`, adding `import { recipeOf } from '@arrowz/engine/simple'` at the top:

```ts
test('the recipe is remembered under the old lab’s key, in a form its reader takes back', () => {
  useStore.getState().recipe.setSlider('lengths', 0.3)
  useStore.getState().recipe.setRandom(true)
  const stored = localStorage.getItem('labSimple')
  expect(stored).not.toBeNull()
  expect(recipeOf(JSON.parse(stored ?? 'null'))).toEqual(useStore.getState().recipe.value)
  useStore.getState().recipe.reset()
  useStore.getState().recipe.setRandom(false)
})
```

Run: `pnpm nx run lab:test -- preferences`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src/state apps/lab/src/simple
git commit -m "Keep the simple view's recipe, and write it into the knobs through the machine path"
```

---

## Task 4: One debounce for two kinds of edit

**Files:** Modify `apps/lab/src/run/useAutoRun.ts`, `apps/lab/src/run/useAutoRun.browser.test.tsx`.

**Interfaces:**
- Consumes: `recipe.edits` (Task 3); `RunControl.hold` (PR #66).
- Produces: `useAutoRun(control)` unchanged in signature. A recipe edit (`setSide`, `setSlider`) starts a run `AUTO_DELAY_MS` after the last edit of any kind, whatever `ui.auto` says; a knob edit still needs `auto`. Tasks 9 and 11 rely on this.

- [ ] **Step 1: Write the failing cases**

In `apps/lab/src/run/useAutoRun.browser.test.tsx`, add `state.recipe.reset()` to the existing `beforeEach`, and append:

```ts
describe('the recipe, which does not ask the switch', () => {
  it('runs 350 ms after a slider moves, with auto off', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    vi.useFakeTimers()
    await act(async () => useStore.getState().recipe.setSlider('lengths', 0.3))
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS - 1)
    expect(g.started()).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(g.started()).toBe(1)
  })

  it('runs once for a size and a slider moved inside one wait', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    vi.useFakeTimers()
    await act(async () => useStore.getState().recipe.setSide('W', 30))
    await vi.advanceTimersByTimeAsync(200)
    await act(async () => useStore.getState().recipe.setSlider('shape', 0.7))
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS * 3)
    expect(g.started()).toBe(1)
  })

  // The skeleton switch runs at once through its own handler, and randomising
  // runs nothing; a debounce behind either would carve a second time.
  it('does not run for the skeleton switch or the random switch', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    vi.useFakeTimers()
    await act(async () => useStore.getState().recipe.setSkeleton('on'))
    await act(async () => useStore.getState().recipe.setRandom(true))
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS * 3)
    expect(g.started()).toBe(0)
  })

  // Ruling 3's debt. With one timer for both kinds, a knob edit with auto off
  // restarts the wait; it must not also forget the recipe run it restarted.
  it('keeps a recipe run it owes when a knob edit with auto off lands inside the wait', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    vi.useFakeTimers()
    await act(async () => useStore.getState().recipe.setSide('W', 30))
    await vi.advanceTimersByTimeAsync(200)
    await act(async () => useStore.getState().params.set('W', 31))
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS - 1)
    expect(g.started()).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(g.started()).toBe(1)
  })

  it('lets any other trigger cancel a recipe run it owes', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    vi.useFakeTimers()
    await act(async () => useStore.getState().recipe.setSlider('shape', 0.2))
    g.cancelPending()
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS * 3)
    expect(g.started()).toBe(0)
  })

  // The debt goes with the timer: a Generate that already ran the recipe must
  // not leave it owed to the next knob edit.
  it('does not pay a cancelled debt on the next knob edit with auto off', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    vi.useFakeTimers()
    await act(async () => useStore.getState().recipe.setSlider('shape', 0.2))
    g.cancelPending()
    await act(async () => useStore.getState().params.set('W', 33))
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS * 3)
    expect(g.started()).toBe(0)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm nx run lab:test -- useAutoRun`
Expected: FAIL — the first two and the debt case see `0` where they expect `1`; the other three pass already, because nothing runs yet. The last one is the mutation guard for Step 3's `owed = false` inside `cancel`.

- [ ] **Step 3: Write the implementation**

Replace the body of `useAutoRun` in `apps/lab/src/run/useAutoRun.ts`, and add the paragraph below the code to its head comment as the last paragraph, after the one that begins `` `ui.auto` is read twice ``:

```ts
export function useAutoRun(control: RunControl): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    // A recipe edit is waiting, and it runs whatever `auto` says.
    let owed = false
    const cancel = () => {
      clearTimeout(timer)
      owed = false
    }
    const unsubscribe = useStore.subscribe((state, prev) => {
      const typed = state.params.edits !== prev.params.edits
      const shaped = state.recipe.edits !== prev.recipe.edits
      if (!typed && !shaped) return
      // Not `cancel()`: restarting the wait must not forgive the debt.
      clearTimeout(timer)
      owed = owed || shaped
      if (!owed && !state.ui.auto) return
      timer = setTimeout(() => {
        const run = owed || useStore.getState().ui.auto
        owed = false
        if (run) control.start()
      }, AUTO_DELAY_MS)
      // Every other trigger calls `control.start()`, which calls this first.
      // That is what stops a preset chosen 100 ms after a keystroke from
      // carving twice (Ruling 4 of PR #66) — and, with one timer for both
      // kinds of edit, what stops Generate from leaving a recipe run behind.
      control.hold(cancel)
    })
    return () => {
      cancel()
      unsubscribe()
    }
  }, [control])
}
```

Head-comment paragraph:

```ts
 * It also watches `recipe.edits`, and that one ignores the switch: the simple
 * view has no `auto`, and the old lab's size fields and sliders schedule a run
 * unconditionally (`lab-page.ts:527-529`, `:559-561`). One hook owns both
 * because `RunControl.hold` keeps one cancel; two timers would overwrite each
 * other's slot and Generate would leave the other one to fire (Ruling 3 of
 * PR 4a). A recipe edit leaves a debt: a later knob edit restarts the wait but
 * keeps the run owed, and only a cancel clears it.
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm nx run lab:test -- useAutoRun triggers`
Expected: PASS, the six existing `useAutoRun` cases and cases 1–2 of the trigger table included.

- [ ] **Step 5: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src/run
git commit -m "Let one debounce owe a run to the recipe as well as to a typed knob"
```

---

## Task 5: Lift the draft entry out of `ValueKnob`

**Files:** Create `apps/lab/src/console/DraftNumber.tsx`, `apps/lab/src/console/DraftNumber.browser.test.tsx`; modify `apps/lab/src/console/ValueKnob.tsx`.

**Interfaces:**
- Produces: `DraftNumber({ label, value, word, describedBy, onCommit }: { label: string; value: number; word?: string | null | undefined; describedBy?: string | undefined; onCommit(typed: number): void }): ReactElement`. It renders `button.num` (accessible name `` `${label}: ${word ?? value}` ``) that opens a text entry; Enter or blur calls `onCommit` with the parsed number, a blank or unreadable draft commits nothing, Escape abandons, and the focus returns to the button. It does not clamp: the caller owns its bounds. Task 9's size and seed cards use it.

This is a refactor. `ValueKnob.browser.test.tsx` is the guard and must pass unchanged.

- [ ] **Step 1: Write the failing test**

`apps/lab/src/console/DraftNumber.browser.test.tsx`:

```tsx
import { expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { DraftNumber } from './DraftNumber'

test('opens on the number, commits what was typed on Enter, and hands the focus back', async () => {
  const onCommit = vi.fn()
  const screen = await render(<DraftNumber label="width" value={25} onCommit={onCommit} />)
  await screen.getByRole('button', { name: 'width: 25' }).click()
  await userEvent.fill(screen.getByRole('textbox', { name: 'width' }), '40')
  await userEvent.keyboard('{Enter}')
  expect(onCommit).toHaveBeenCalledExactlyOnceWith(40)
  await expect.element(screen.getByRole('button', { name: 'width: 25' })).toHaveFocus()
})

// No clamp here: a caller with narrower bounds than the knob's (the mix row)
// has to see the number that was typed.
test('hands over a number outside any range untouched', async () => {
  const onCommit = vi.fn()
  const screen = await render(<DraftNumber label="width" value={25} onCommit={onCommit} />)
  await screen.getByRole('button', { name: 'width: 25' }).click()
  await userEvent.fill(screen.getByRole('textbox'), '99999')
  await userEvent.keyboard('{Enter}')
  expect(onCommit).toHaveBeenCalledExactlyOnceWith(99999)
})

test('commits nothing for a blank or unreadable draft, and nothing on Escape', async () => {
  const onCommit = vi.fn()
  const screen = await render(<DraftNumber label="width" value={25} onCommit={onCommit} />)
  for (const typed of ['', 'abc']) {
    await screen.getByRole('button', { name: 'width: 25' }).click()
    await userEvent.fill(screen.getByRole('textbox'), typed)
    await userEvent.keyboard('{Enter}')
  }
  await screen.getByRole('button', { name: 'width: 25' }).click()
  await userEvent.fill(screen.getByRole('textbox'), '12')
  await userEvent.keyboard('{Escape}')
  expect(onCommit).not.toHaveBeenCalled()
})

test('names the value by its word where the CLI has one', async () => {
  const screen = await render(<DraftNumber label="maximum length" value={0} word="auto" onCommit={() => {}} />)
  await expect.element(screen.getByRole('button', { name: 'maximum length: auto' })).toMatchTextContent(/auto0/)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx run lab:test -- DraftNumber`
Expected: FAIL — `./DraftNumber` cannot be resolved.

- [ ] **Step 3: Write `console/DraftNumber.tsx`**

The state, the two refs, the focus effect, `commit` and both branches of the JSX move verbatim from `ValueKnob.tsx`, with their comments; only the store write becomes `onCommit`.

```tsx
import { type ReactElement, useEffect, useRef, useState } from 'react'

/**
 * A number that opens into a text entry. The entry holds a draft string and
 * hands it over on blur or Enter (spec §5.5): clamping per keystroke would turn
 * `0.` into the minimum while someone is still typing `0.85`. Lifted out of
 * `ValueKnob` so the simple view's size and seed fields keep the same rule
 * rather than a second copy of it.
 *
 * No clamp and no store: the caller knows the bounds and where the number goes.
 */
export function DraftNumber({
  label,
  value,
  word = null,
  describedBy,
  onCommit,
}: {
  label: string
  value: number
  word?: string | null | undefined
  describedBy?: string | undefined
  onCommit(typed: number): void
}): ReactElement {
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

  const commit = () => {
    const raw = draft
    setDraft(null)
    if (raw === null) return
    const typed = Number(raw.trim())
    // An unreadable field commits nothing: `clampParam` maps NaN to the knob's
    // default and reports it as a clamp, which is a jump nobody asked for.
    if (raw.trim() === '' || !Number.isFinite(typed)) return
    onCommit(typed)
  }

  return draft === null ? (
    <button
      ref={numRef}
      type="button"
      className="num"
      aria-label={`${label}: ${word ?? value}`}
      aria-describedby={describedBy}
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
      aria-describedby={describedBy}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          // Without this, Chromium delivers the same key's `keypress` to
          // whatever has focus *after* the commit — which, thanks to the
          // effect above, is the number button. It activates, and the entry a
          // user just closed reopens.
          event.preventDefault()
          commit()
        }
        // Escape needs no guard: React does not deliver a blur for an element
        // it is unmounting, so `commit` never runs here.
        if (event.key === 'Escape') setDraft(null)
      }}
    />
  )
}
```

- [ ] **Step 4: Use it in `ValueKnob.tsx`**

Delete from `ValueKnob`: the `useState`/`useRef`/`useEffect` import (keep the file's other imports), the `draft` state, `numRef`, `entryRef`, `edited`, `editing`, the focus effect and `commit`. Update the head comment's last paragraph to: "The inline entry is `DraftNumber` (spec §5.5); the knob only knows its bounds." Replace the whole `{draft === null ? (…) : (…)}` expression inside `.top` with:

```tsx
        <DraftNumber
          label={label}
          value={value}
          word={word}
          // The same paragraph the slider points at. Both surfaces of the
          // value carry it: a knob's reason reaching only one of them is a
          // reason a keyboard user meets half the time.
          describedBy={whyId}
          // Held inside the *passed* bounds first: the mix row's own range is
          // narrower than the knob's, and only it knows that.
          onCommit={(typed) => set(spec.key, Math.min(bounds.max, Math.max(bounds.min, typed)))}
        />
```

and add `import { DraftNumber } from './DraftNumber'`.

- [ ] **Step 5: Run the new test and the guard**

Run: `pnpm nx run lab:test -- DraftNumber ValueKnob StartKnob KnobPanel`
Expected: PASS, every existing `ValueKnob` case unchanged.

- [ ] **Step 6: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src/console
git commit -m "Lift the knob's draft entry into a component the simple view can reuse"
```

---

## Task 6: One of a few, as a radio group

**Files:** Modify `packages/engine/lab-i18n.ts`, `apps/lab/src/design/shell.css`; create `apps/lab/src/shell/Segmented.tsx`, `apps/lab/src/shell/Segmented.browser.test.tsx`.

**Interfaces:**
- Produces:
  - Five `ui` keys in both dictionaries: `modeLabel`, `languageLabel`, `langPl`, `langEn`, `simplePanel`.
  - `interface SegmentedOption<T extends string> { value: T; label: string }` and `Segmented<T extends string>({ label, labelledBy, options, value, onChange }: { label: string; labelledBy?: string | undefined; options: readonly SegmentedOption<T>[]; value: T; onChange(next: T): void }): ReactElement`; with `labelledBy` the group is named by that element instead of `aria-label` from `shell/Segmented.tsx`. Renders `div.fw-seg[role=radiogroup]`, named by `aria-label` or, when `labelledBy` is given, by `aria-labelledby`, of `button[role=radio][aria-checked]`; only the checked radio is a tab stop; ArrowRight/ArrowDown, ArrowLeft/ArrowUp (wrapping), Home and End call `onChange` and the focus follows the checked radio while the group holds it. Tasks 7 and 9 use it three times.

- [ ] **Step 1: Add the dictionary keys**

In `packages/engine/lab-i18n.ts`, in `EN.ui` after `dismiss: 'Dismiss',`:

```ts
    // The top bar's two choices, each a radio group named by what it chooses.
    // The language codes are the visible text and so the accessible name: a
    // name that does not contain what is on screen fails WCAG 2.5.3 for speech
    // input (PR 4a, Ruling 8).
    modeLabel: 'View',
    languageLabel: 'Language',
    langPl: 'PL',
    langEn: 'EN',
    // The simple view's region; its visible heading is only the view's name.
    simplePanel: 'Simple settings',
```

In `PL.ui` after `dismiss: 'Zamknij',`:

```ts
    modeLabel: 'Widok',
    languageLabel: 'Język',
    langPl: 'PL',
    langEn: 'EN',
    simplePanel: 'Proste ustawienia',
```

Run: `deno test --allow-read packages/engine/lab-i18n.test.ts packages/engine/neutral.test.ts` (repository root)
Expected: PASS — `lab-i18n.test.ts` compares the two key sets and `neutral.test.ts` keeps the module free of the DOM. Not `deno task test`: that runs `packages/cli` as well, including a bundle test that needs `deno task bundle` first.

Run: `pnpm nx build engine`
Expected: success; `apps/lab` reads the dictionary from `dist/`.

- [ ] **Step 2: Write the failing test**

`apps/lab/src/shell/Segmented.browser.test.tsx`:

```tsx
import { useState } from 'react'
import { expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { Segmented } from './Segmented'

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
] as const
type Letter = (typeof OPTIONS)[number]['value']

/** The group is controlled; a host owns the value, as the store does on the page. */
function Host({ onChange }: { onChange?: ((next: Letter) => void) | undefined }) {
  const [value, setValue] = useState<Letter>('a')
  return (
    <Segmented
      label="Letters"
      options={OPTIONS}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange?.(next)
      }}
    />
  )
}

test('is one named radio group with the chosen option checked', async () => {
  const screen = await render(<Host />)
  await expect.element(screen.getByRole('radiogroup', { name: 'Letters' })).toBeVisible()
  await expect.element(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute('aria-checked', 'true')
  await expect.element(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('aria-checked', 'false')
})

test('a click chooses', async () => {
  const onChange = vi.fn()
  const screen = await render(<Host onChange={onChange} />)
  await screen.getByRole('radio', { name: 'Beta' }).click()
  expect(onChange).toHaveBeenCalledExactlyOnceWith('b')
  await expect.element(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('aria-checked', 'true')
})

// The radio pattern: the arrows move the choice and the focus together and
// wrap at both ends; Home and End jump.
test('arrow keys move the choice and the focus together, wrapping', async () => {
  const screen = await render(<Host />)
  await screen.getByRole('radio', { name: 'Alpha' }).click()
  await userEvent.keyboard('{ArrowRight}')
  await expect.element(screen.getByRole('radio', { name: 'Beta' })).toHaveFocus()
  await expect.element(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('aria-checked', 'true')
  await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
  await expect.element(screen.getByRole('radio', { name: 'Gamma' })).toHaveFocus()
  await userEvent.keyboard('{Home}')
  await expect.element(screen.getByRole('radio', { name: 'Alpha' })).toHaveFocus()
  await userEvent.keyboard('{End}')
  await expect.element(screen.getByRole('radio', { name: 'Gamma' })).toHaveAttribute('aria-checked', 'true')
})

test('only the chosen option is a tab stop', async () => {
  const screen = await render(<Host />)
  await expect.element(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute('tabindex', '0')
  await expect.element(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('tabindex', '-1')
  await expect.element(screen.getByRole('radio', { name: 'Gamma' })).toHaveAttribute('tabindex', '-1')
})

test('takes its name from a visible label when it is given one', async () => {
  const screen = await render(
    <div>
      <span id="letters-label">Letters shown</span>
      <Segmented label="Letters" labelledBy="letters-label" options={OPTIONS} value="a" onChange={() => {}} />
    </div>,
  )
  await expect.element(screen.getByRole('radiogroup', { name: 'Letters shown' })).toBeVisible()
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm nx run lab:test -- Segmented`
Expected: FAIL — `./Segmented` cannot be resolved.

- [ ] **Step 4: Write `shell/Segmented.tsx`**

```tsx
import type { KeyboardEvent, ReactElement } from 'react'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

/**
 * One of a few, as chips: the language, the view, the skeleton. A radio group
 * and not a row of `aria-pressed` buttons, because the choices exclude each
 * other and a screen reader should say "1 of 2" (PR 4a, Ruling 8).
 *
 * The keyboard is the radio pattern `TabRow` already implements for tabs: the
 * arrows move the choice and wrap, Home and End jump, and only the checked
 * radio is a tab stop. Focus follows the choice only while the group holds the
 * focus, the same guard as `TabRow.tsx`, so a choice made elsewhere — a link
 * naming a language — does not pull the focus into the top bar.
 */
export function Segmented<T extends string>({
  label,
  labelledBy,
  options,
  value,
  onChange,
}: {
  label: string
  /** The id of a visible label; when given it names the group, so the name is not spoken twice. */
  labelledBy?: string | undefined
  options: readonly SegmentedOption<T>[]
  value: T
  onChange(next: T): void
}): ReactElement {
  const at = options.findIndex((option) => option.value === value)

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const last = options.length - 1
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? at >= last
          ? 0
          : at + 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? at <= 0
            ? last
            : at - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (next === null) return
    event.preventDefault()
    const option = options[next]
    if (option) onChange(option.value)
  }

  return (
    <div
      className="fw-seg"
      role="radiogroup"
      aria-label={labelledBy === undefined ? label : undefined}
      aria-labelledby={labelledBy}
    >
      {options.map((option, i) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={i === at}
          // A value no option carries still leaves the group reachable.
          tabIndex={i === at || (at === -1 && i === 0) ? 0 : -1}
          ref={(node) => {
            if (node && i === at && node.parentElement?.contains(document.activeElement)) node.focus()
          }}
          onClick={() => onChange(option.value)}
          onKeyDown={onKeyDown}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Style it**

Append to `apps/lab/src/design/shell.css`:

```css
/* One of a few (Segmented.tsx): the preset strip's chip (run.css) with the
   group rail's selected state, so the lab has one chip and one "chosen". The
   `.fw` prefix for the reason `.fw .fw-go` gives above. */
.fw-seg {
  display: inline-flex;
  flex: none;
  gap: 2px;
}
.fw .fw-seg button {
  flex: none;
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--border);
  background: none;
  color: var(--mist);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 120ms cubic-bezier(0.2, 0, 0, 1),
    color 120ms cubic-bezier(0.2, 0, 0, 1);
}
.fw .fw-seg button:not([aria-checked='true']):hover {
  color: var(--ink);
  background: var(--surface);
}
.fw .fw-seg button[aria-checked='true'] {
  color: var(--void);
  background: var(--signal);
  border-color: transparent;
}
@media (pointer: coarse) {
  .fw .fw-seg button {
    height: 44px;
  }
}
```

- [ ] **Step 6: Run it to verify it passes**

Run: `pnpm nx run lab:test -- Segmented`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
# `packages/engine` is formatted by deno, not Prettier.
deno fmt packages/engine/lab-i18n.ts
git add packages/engine/lab-i18n.ts apps/lab/src/shell apps/lab/src/design/shell.css
git commit -m "Add a radio group for one-of-a-few choices, and the five words it needs"
```

---

## Task 7: The top bar chooses the view and the language

**Files:** Modify `apps/lab/src/shell/TopBar.tsx`, `apps/lab/src/shell/TopBar.browser.test.tsx`, `apps/lab/src/design/shell.css`, `apps/lab/src/stage/Stage.tsx`, `apps/lab/src/App.tsx`, `apps/lab/src/routes/LabRoute.browser.test.tsx`; create `apps/lab/src/shell/useDocumentLang.ts`.

**Interfaces:**
- Consumes: `Segmented` and the five keys (Task 6); `ui.mode`/`setMode`, `lang.lang`/`setLang` (Task 2).
- Produces: the top bar's right group holds a `View` radio group (`Simple`, `Advanced`) and a `Language` radio group (`PL`, `EN`); `useDocumentLang()` keeps `document.documentElement.lang` equal to `state.lang.lang`; the board element receives `lang`. The console does not react to `mode` until Task 10.

- [ ] **Step 1: Write the failing cases**

In `apps/lab/src/shell/TopBar.browser.test.tsx`, replace the `beforeEach` with:

```ts
beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.lang.setLang('en')
  state.ui.setMode('simple')
})
```

The bar's exact text now includes the right group, so update the two existing expectations to `'Arrowz/Easy portrait/25×50SimpleAdvancedPLEN'` and `'Arrowz/26×50SimpleAdvancedPLEN'`, and extend the comment above the first: "The right group's radios are part of the banner's text: `Simple`, `Advanced`, `PL`, `EN`, with no separators, because the gaps between them are `gap` too."

Append inside the `describe`:

```ts
  it('switches the view and remembers the choice', async () => {
    const screen = await render(<TopBar />)
    await screen.getByRole('radio', { name: 'Advanced' }).click()
    expect(useStore.getState().ui.mode).toBe('advanced')
    expect(localStorage.getItem('labView')).toBe('advanced')
    await expect.element(screen.getByRole('radio', { name: 'Advanced' })).toHaveAttribute('aria-checked', 'true')
  })

  // Its own labels are the first to change: the bar reads the dictionary
  // like every other component, so the view's radio is renamed in place.
  it('switches the language, its own labels first, and remembers the choice', async () => {
    const screen = await render(<TopBar />)
    await screen.getByRole('radio', { name: 'PL' }).click()
    expect(useStore.getState().lang.lang).toBe('pl')
    expect(localStorage.getItem('labLang')).toBe('pl')
    await expect.element(screen.getByRole('radiogroup', { name: 'Widok' })).toBeVisible()
    await expect.element(screen.getByRole('radio', { name: 'Zaawansowany' })).toBeVisible()
  })
```

In `apps/lab/src/routes/LabRoute.browser.test.tsx`, add `useStore.getState().lang.setLang('en')` to `mountApp` after the `ui` resets, and the same line to the hand-rolled reset of `a finished run is offered to the store once per run, and the outcome is appended` — the StrictMode case renders `App` without `mountApp`, so only file order would otherwise keep it in English. Then append:

```ts
// The switch reaches three places no component test can see together: the
// document's own `lang` (what a screen reader pronounces with), the board
// element's `lang` (its control bar has its own dictionary), and a label far
// from the top bar.
test('the language switch reaches the document, the board and every label', async () => {
  const screen = await mountApp()
  await screen.getByRole('radio', { name: 'PL' }).click()
  await expect.element(screen.getByRole('button', { name: 'Generuj' })).toBeInTheDocument()
  await vi.waitFor(() => expect(document.documentElement.lang).toBe('pl'))
  // `@lit/react` sets the property, and `HTMLElement.lang` reflects it.
  await vi.waitFor(() => expect(screen.container.querySelector('arrowz-board')?.getAttribute('lang')).toBe('pl'))
  await screen.getByRole('radio', { name: 'EN' }).click()
  await vi.waitFor(() => expect(document.documentElement.lang).toBe('en'))
}, 40_000)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm nx run lab:test -- TopBar LabRoute`
Expected: FAIL — no radio named `Advanced` or `PL`; the two text expectations see `Arrowz/Easy portrait/25×50`.

- [ ] **Step 3: Write `shell/useDocumentLang.ts`**

```ts
import { useEffect } from 'react'
import { useStore } from '../state/store'

/**
 * The document speaks the page's language: `index.html` ships `lang="en"`, and
 * a screen reader pronounces Polish text with English rules until this is
 * moved. The old lab does the same in `applyLanguage` (`lab-page.ts:402`).
 */
export function useDocumentLang(): void {
  const lang = useStore((state) => state.lang.lang)
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
}
```

In `App.tsx`, import it and call `useDocumentLang()` in `Shell` directly after `useStoreSave()`. The subscription re-renders `Shell` on a language change, which re-renders nothing that the dictionary change does not already re-render.

- [ ] **Step 4: Give the board its language**

In `apps/lab/src/stage/Stage.tsx`, add `const lang = useStore((state) => state.lang.lang)` beside the other selectors and pass `lang={lang}` to `BoardCanvas`. The element's control bar (zoom, fit, colours, gestures) has its own dictionary keyed by `lang` (`labelsFor(this.lang)`, `arrowz-board.ts:366`; the attribute is observed at `:276-290`).

- [ ] **Step 5: Put the two groups in the bar**

In `apps/lab/src/shell/TopBar.tsx`, import `Segmented` from `./Segmented`, read four more selectors at the top of the component:

```tsx
  const mode = useStore((state) => state.ui.mode)
  const setMode = useStore((state) => state.ui.setMode)
  const lang = useStore((state) => state.lang.lang)
  const setLang = useStore((state) => state.lang.setLang)
```

and replace the comment and the empty `<div className="right" />` with:

```tsx
      {/* ⌘K joins this group in PR 7. */}
      <div className="right">
        <Segmented
          label={dict.t('modeLabel')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'simple', label: dict.d.simple.viewSimple },
            { value: 'advanced', label: dict.d.simple.viewAdvanced },
          ]}
        />
        <Segmented
          label={dict.t('languageLabel')}
          value={lang}
          onChange={setLang}
          options={[
            { value: 'pl', label: dict.t('langPl') },
            { value: 'en', label: dict.t('langEn') },
          ]}
        />
      </div>
```

Update the component's head comment: the right group now holds the view and language choices.

- [ ] **Step 6: Invert the chip and the focus ring on the Signal plane**

Append to `apps/lab/src/design/shell.css`:

```css
/* The top bar is the Signal plane, where the chip's own colours would vanish:
   `--signal` on `--signal` for the chosen option, and the global focus ring is
   `--signal` too (PR 4a, Ruling 13). The unselected text is `--void` on
   `--signal`, the pairing `.name` and `.dims` already ship (4.08:1, the open
   §7.1 item); the chosen option is `--ink` on `--void`. The base rule ties with
   the chip's checked rule and wins by following it; the checked rule here is
   (0,4,1). */
.fw .fw-top .fw-seg button {
  border-color: var(--void);
  color: var(--void);
}
.fw .fw-top .fw-seg button:not([aria-checked='true']):hover {
  background: none;
  color: var(--void);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.fw .fw-top .fw-seg button[aria-checked='true'] {
  background: var(--void);
  color: var(--ink);
  border-color: var(--void);
}
.fw .fw-top :focus-visible {
  outline-color: var(--void);
}
```

- [ ] **Step 7: Run them to verify they pass**

Run: `pnpm nx run lab:test -- TopBar LabRoute Stage`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src
git commit -m "Choose the view and the language from the top bar, and tell the document and the board"
```

---

## Task 8: The link carries the page's language

**Files:** Modify `apps/lab/src/state/url.ts`, `apps/lab/src/state/url.fixtures.ts`, `apps/lab/src/state/url.test.ts`, `apps/lab/src/state/useUrlHash.ts`, `apps/lab/src/state/useUrlHash.browser.test.tsx`.

**Interfaces:**
- Consumes: `isLang`, `lang.setLang` (Task 2).
- Produces: `HashView` gains `lang?: Lang | undefined` (decoded only when it is `pl` or `en`); `Carried` is `{ tab?: unknown }`. Every hash write carries `lang`; a link's `lang` is applied with `setLang` on load and on `hashchange`.

- [ ] **Step 1: Write the failing cases**

In `apps/lab/src/state/url.fixtures.ts`, add `lang: 'en',` after `help: true,` in `VIEW` — the view the page writes now always names its language.

In `apps/lab/src/state/url.test.ts`, replace the case `'carries the language and the tab it does not own'` with:

```ts
  // Ruling 6 of PR 4a: the language is the page's own now, and only the tab
  // (PR 5's) is carried through untouched.
  it('reads the language as the page’s own, and carries only the tab', () => {
    const link = '#' + encodeURIComponent(JSON.stringify({ __view: { lang: 'pl', tab: 'library' } }))
    const back = decodeHash(link)
    expect(back?.view.lang).toBe('pl')
    expect(back?.carried).toEqual({ tab: 'library' })
    const round = decodeHash(
      encodeHash({ params: defaultParams(), view: back?.view ?? VIEW, carried: back?.carried ?? {} }),
    )
    expect(round?.view.lang).toBe('pl')
    expect(round?.carried).toEqual({ tab: 'library' })
  })

  it('drops a language the dictionary does not have', () => {
    const link = '#' + encodeURIComponent(JSON.stringify({ __view: { lang: 'de' } }))
    expect(decodeHash(link)?.view.lang).toBeUndefined()
  })
```

In `apps/lab/src/state/useUrlHash.browser.test.tsx`, add `state.lang.setLang('en')` to the `beforeEach`, and append inside the `describe`:

```ts
  it('opens in the language the link names, and remembers it', async () => {
    history.replaceState(null, '', encodeHash({ params: defaultParams(), view: { ...VIEW, lang: 'pl' }, carried: {} }))
    await mount(stub().control)
    expect(useStore.getState().lang.lang).toBe('pl')
    expect(localStorage.getItem('labLang')).toBe('pl')
  })

  // The old `saveToUrl` writes `lang` every time (`lab-page.ts:1349`), so a
  // link copied from either lab opens the other in the same language.
  it('writes the language on screen into the link', async () => {
    await mount(stub().control)
    useStore.getState().lang.setLang('pl')
    await vi.waitFor(() => expect(decodeHash(location.hash)?.view.lang).toBe('pl'))
  })

  it('takes a pasted link that changes only the language, and runs it', async () => {
    const g = stub()
    await mount(g.control)
    const started = g.started()
    location.hash = encodeHash({ params: defaultParams(), view: { ...VIEW, lang: 'pl' }, carried: {} }).slice(1)
    await vi.waitFor(() => expect(useStore.getState().lang.lang).toBe('pl'))
    expect(g.started()).toBe(started + 1)
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm nx run lab:test -- url useUrlHash`
Expected: FAIL — `view.lang` is `undefined` and `carried` still holds `lang`; the store stays `en` for both links; the written hash has no `lang`.

- [ ] **Step 3: Own the language in `url.ts`**

Add the imports `import type { Lang } from '@arrowz/engine/i18n'` and `import { isLang } from './lang.slice'`. In `HashView`, after `help: boolean`:

```ts
  /** The page's language. Absent when the link predates it or names one the dictionary lacks. */
  lang?: Lang | undefined
```

Replace `Carried`:

```ts
/** The one key the page does not own yet — the tab, PR 5's — kept so a round trip cannot drop it. */
export interface Carried {
  tab?: unknown
}
```

In `decodeHash`, add `lang: isLang(raw.lang) ? raw.lang : undefined,` after `help: raw.help !== false,`, and make `carried` hold only the tab:

```ts
    carried: raw.tab === undefined ? {} : { tab: raw.tab },
```

`encodeHash` is unchanged: `JSON.stringify` drops an undefined `lang`.

- [ ] **Step 4: Read and write it in `useUrlHash.ts`**

Give `viewFor` a third parameter and the field:

```ts
function viewFor(view: ViewState, help: boolean, lang: Lang) {
  return {
    // … the nine existing fields, unchanged …
    help,
    lang,
  }
}
```

with `import type { Lang } from '@arrowz/engine/i18n'`. In `applyPayload`, destructure `lang` from `useStore.getState()` beside the others and add, after `ui.setHelp(payload.view.help)`:

```ts
  // Through `setLang`, so a link's language is remembered as well as shown —
  // the old lab persists it in `applyLanguage` (`lab-page.ts:404`).
  if (payload.view.lang !== undefined) lang.setLang(payload.view.lang)
```

Both `encodeHash` calls in the hook read `const { params, view, ui, lang } = useStore.getState()` and pass `view: viewFor(view, ui.help, lang.lang)`. The listener's comparison therefore includes the language, so a link differing only in `lang` is a trigger, as it is in the old lab (`lab-page.ts:1392-1398`).

- [ ] **Step 5: Run them to verify they pass**

Run: `pnpm nx run lab:test -- url useUrlHash triggers`
Expected: PASS. Every existing case builds its fragments from `VIEW`, which now carries `lang: 'en'`, and resets the store to `en`, so "a fragment that states what is on screen" still states it.

- [ ] **Step 6: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src/state
git commit -m "Write the page's language into every link and take it from one"
```

---

## Task 9: The simple panel

**Files:** Create `apps/lab/src/simple/PositionSlider.tsx`, `apps/lab/src/simple/SimplePanel.tsx`, `apps/lab/src/simple/SimplePanel.browser.test.tsx`; modify `apps/lab/src/console/ViewPanel.tsx`, `apps/lab/src/console/viewFields.ts`, `apps/lab/src/design/console.css`.

**Interfaces:**
- Consumes: `recipe` (Task 3), `applyRecipe` (Task 3), `DraftNumber` (Task 5), `Segmented` and `simplePanel` (Task 6), `KnobSlider` and `OptionSwitch` (PR #66).
- Produces:
  - `SimplePanel({ control }: { control: RunControl }): ReactElement` — `section.fw-knobs.fw-simple[aria-label=simplePanel]`: width, height, piece length, line shape, skeleton, seed, randomise; then the preview subset. Placed by `Console` in Task 10.
  - From `ViewPanel.tsx`: `export function ViewNumberField({ field }: { field: ViewField })` (already written, now exported), `export function ViewFlagSwitch({ flag, label }: { flag: ViewFlag; label: 'rounded' | 'colored' | 'hilite' | 'voids' })`, `export const VIEW_FLAGS`.
  - From `viewFields.ts`: `SIMPLE_VIEW_FIELDS: readonly ViewNumber[] = ['stroke', 'headWidth', 'headHeight']`, `SIMPLE_VIEW_FLAGS: readonly ViewFlag[] = ['rounded', 'colored', 'hilite']`.

- [ ] **Step 1: Write the failing test**

`apps/lab/src/simple/SimplePanel.browser.test.tsx`:

```tsx
import { simpleParams } from '@arrowz/engine/simple'
import { beforeEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import type { RunControl } from '../run/useRun'
import { useStore } from '../state/store'
import { SimplePanel } from './SimplePanel'

function stub() {
  const calls = { start: 0 }
  const control: RunControl = { start: () => void calls.start++, abort: () => {}, hold: () => {} }
  return { control, started: () => calls.start }
}

const state = () => useStore.getState()

/** The knobs the recipe on screen gives with the seed on screen — what every write below must leave. */
const drawn = () => simpleParams({ ...state().recipe.value, seed: state().params.values.seed }, null)

/**
 * A range input moved the way a drag moves it: the native value setter, then
 * the `input` event React listens to. `fill` does not drive a range input, and
 * a click lands wherever the pointer is.
 */
function slide(input: HTMLInputElement | null, value: number) {
  if (!input) throw new Error('no such slider')
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, String(value))
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  state().params.reset()
  state().recipe.reset()
  state().recipe.setRandom(false)
  state().ui.raiseClamped(false)
})

describe('SimplePanel', () => {
  it('is a region a screen reader can name', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    await expect.element(screen.getByRole('region', { name: 'Simple settings' })).toBeVisible()
  })

  // A size is typed like a knob (§5.5) and moves the recipe, the knobs and the
  // export cell at once; the run is the debounce's (Task 4), so none here.
  it('writes a typed width into the recipe and the knobs, and starts nothing', async () => {
    const g = stub()
    const screen = await render(<SimplePanel control={g.control} />)
    // Relative: `recipe.edits` only grows, and `reset()` leaves it alone on purpose.
    const shaped = state().recipe.edits
    await screen.getByRole('button', { name: /^width/ }).click()
    await userEvent.fill(screen.getByRole('textbox'), '120')
    await userEvent.keyboard('{Enter}')
    expect(state().recipe.value.W).toBe(120)
    expect(state().params.values).toEqual(drawn())
    expect(state().view.cell).toBe(13)
    expect(state().recipe.edits).toBe(shaped + 1)
    expect(g.started()).toBe(0)
  })

  it('moves the recipe and the knobs with a slider, and starts nothing', async () => {
    const g = stub()
    const screen = await render(<SimplePanel control={g.control} />)
    const shaped = state().recipe.edits
    slide(screen.container.querySelector<HTMLInputElement>('#simple-lengths'), 20)
    await expect.poll(() => state().recipe.value.lengths).toBe(0.2)
    expect(state().params.values).toEqual(drawn())
    expect(state().recipe.edits).toBe(shaped + 1)
    expect(g.started()).toBe(0)
  })

  // Spec §2.2: the segmented button is immediate, and the knobs are rewritten
  // before the run reads them.
  it('runs at once when the skeleton is switched, on the knobs it gives', async () => {
    const seen: unknown[] = []
    const control: RunControl = {
      start: () => void seen.push({ ...state().params.values }),
      abort: () => {},
      hold: () => {},
    }
    const shaped = state().recipe.edits
    const screen = await render(<SimplePanel control={control} />)
    await screen.getByRole('radio', { name: 'with a skeleton' }).click()
    expect(state().recipe.value.skeleton).toBe('on')
    expect(seen).toEqual([drawn()])
    expect(state().recipe.edits).toBe(shaped)
  })

  // The machine path (Ruling 4): a seed typed here must not wake an `auto`
  // left on in the advanced view, and the old seed field starts nothing.
  it('writes a typed seed into the knobs without counting it as a knob edit', async () => {
    const g = stub()
    state().ui.setAuto(true)
    const typed = state().params.edits
    const screen = await render(<SimplePanel control={g.control} />)
    await screen.getByRole('button', { name: /^seed/ }).click()
    await userEvent.fill(screen.getByRole('textbox'), '4242')
    await userEvent.keyboard('{Enter}')
    expect(state().params.values.seed).toBe(4242)
    expect(state().params.edits).toBe(typed)
    expect(g.started()).toBe(0)
    state().ui.setAuto(false)
  })

  it('switches randomising without running', async () => {
    const g = stub()
    const screen = await render(<SimplePanel control={g.control} />)
    await screen.getByRole('switch', { name: /randomise the settings/ }).click()
    expect(state().recipe.value.random).toBe(true)
    expect(g.started()).toBe(0)
  })

  // Ruling 9: the old lab's `advonly` marks cell, voids and top.
  it('shows the preview fields the old simple view shows, and only those', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    await expect.element(screen.getByLabelText('stroke width (grid units)')).toBeVisible()
    await expect.element(screen.getByRole('switch', { name: /round the corners/ })).toBeVisible()
    await expect.element(screen.getByRole('switch', { name: /highlight the longest/ })).toBeVisible()
    expect(screen.container.querySelector('#view-cell')).toBeNull()
    expect(screen.container.querySelector('#view-top')).toBeNull()
    expect(screen.getByRole('switch', { name: /show jammed cells/ }).query()).toBeNull()
  })
})
```

The `^width` and `^seed` names are `PARAM_SPEC`'s English labels (`engine.ts:2374`, `:2394`) as `DraftNumber` prints them, `label: value`; anchored, so `height` and the seed's own entry cannot match the width's.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx run lab:test -- SimplePanel`
Expected: FAIL — `./SimplePanel` cannot be resolved.

- [ ] **Step 3: Export the preview controls**

In `apps/lab/src/console/viewFields.ts`, add `import type { ViewFlag } from '../state/view.slice'` and append:

```ts
/**
 * What the simple view keeps of the preview (PR 4a, Ruling 9): `lab.html`
 * marks `cell`, `top` and `voids` `advonly` (lines 221, 259, 260), and the
 * other six stay on screen in both views.
 */
export const SIMPLE_VIEW_FIELDS: readonly ViewNumber[] = ['stroke', 'headWidth', 'headHeight']
export const SIMPLE_VIEW_FLAGS: readonly ViewFlag[] = ['rounded', 'colored', 'hilite']
```

In `apps/lab/src/console/ViewPanel.tsx`: rename `FLAGS` to `VIEW_FLAGS` and export it; add `export` to `function ViewNumberField`; lift the flag card out of the `FLAGS.map` into

```tsx
/** One preview flag as the mock's switch, labelled by its visible text. */
export function ViewFlagSwitch({ flag, label }: { flag: ViewFlag; label: (typeof VIEW_FLAGS)[number]['label'] }) {
  const dict = useDictionary()
  const on = useStore((state) => state.view[flag])
  const toggle = useStore((state) => state.view.toggle)
  return (
    <div className="fw-k">
      <div className="row">
        <span className="lab" id={`view-${flag}-label`}>
          {dict.t(label)}
        </span>
        <button
          type="button"
          className="fw-sw"
          role="switch"
          aria-checked={on}
          aria-labelledby={`view-${flag}-label`}
          onClick={() => toggle(flag)}
        />
      </div>
    </div>
  )
}
```

and render `{VIEW_FLAGS.map(({ flag, label }) => <ViewFlagSwitch key={flag} flag={flag} label={label} />)}` in `ViewPanel`, whose `view` selector then goes. Run `pnpm nx run lab:test -- ViewPanel` — PASS, unchanged.

- [ ] **Step 4: Write `simple/PositionSlider.tsx`**

```tsx
import type React from 'react'
import { useDictionary } from '../i18n'
import type { RecipeSlider } from '../state/recipe.slice'
import { useStore } from '../state/store'
import { applyRecipe } from './applyRecipe'

/**
 * A recipe slider: a wish from one end word to the other, not a knob value
 * (`lab-simple.ts` interpolates the knob ranges between anchors). 0–100 on the
 * mock's `.bar`, because a whole percent is the finest step a person drags.
 * The knobs follow at once; the run waits for the debounce (Task 4).
 */
export function PositionSlider({ slider }: { slider: RecipeSlider }): React.ReactElement {
  const dict = useDictionary()
  const position = useStore((state) => state.recipe.value[slider])
  const setSlider = useStore((state) => state.recipe.setSlider)
  const label = dict.d.simple[slider]
  const [low, high] = dict.d.simple.ends[slider]
  const percent = Math.round(position * 100)
  const id = `simple-${slider}`
  return (
    <div className="fw-k">
      <div className="top">
        <label className="lab" htmlFor={id}>
          {label}
        </label>
        <span className="num">{percent}</span>
      </div>
      <div className="bar">
        <input
          type="range"
          id={id}
          min={0}
          max={100}
          step={1}
          value={percent}
          // The number alone says nothing: "20" of what? The ends say.
          aria-describedby={`${id}-ends`}
          style={{ '--pct': `${percent}%` } as React.CSSProperties}
          onChange={(event) => {
            setSlider(slider, Number(event.currentTarget.value) / 100)
            applyRecipe(false)
          }}
        />
      </div>
      <p className="why fw-ends" id={`${id}-ends`}>
        <span>{low}</span>
        <span>{high}</span>
      </p>
    </div>
  )
}
```

- [ ] **Step 5: Write `simple/SimplePanel.tsx`**

```tsx
import { PARAM_SPEC, type ParamSpec } from '@arrowz/engine'
import { SIMPLE_CHOICES } from '@arrowz/engine/simple'
import type { ReactElement } from 'react'
import { DraftNumber } from '../console/DraftNumber'
import { KnobSlider } from '../console/KnobSlider'
import { VIEW_FLAGS, ViewFlagSwitch, ViewNumberField } from '../console/ViewPanel'
import { SIMPLE_VIEW_FIELDS, SIMPLE_VIEW_FLAGS, VIEW_FIELDS } from '../console/viewFields'
import { useDictionary } from '../i18n'
import { OptionSwitch } from '../run/OptionSwitch'
import type { RunControl } from '../run/useRun'
import { Segmented } from '../shell/Segmented'
import type { RecipeSide } from '../state/recipe.slice'
import { useStore } from '../state/store'
import { applyRecipe } from './applyRecipe'
import { PositionSlider } from './PositionSlider'

function specOf(key: 'W' | 'H' | 'seed'): ParamSpec {
  const spec = PARAM_SPEC.find((s) => s.key === key)
  if (!spec) throw new Error(`PARAM_SPEC has no ${key}`)
  return spec
}

/** A side of the board: typed or dragged, with the engine's own bounds, into the recipe. */
function SizeCard({ side }: { side: RecipeSide }): ReactElement {
  const dict = useDictionary()
  const value = useStore((state) => state.recipe.value[side])
  const setSide = useStore((state) => state.recipe.setSide)
  const spec = specOf(side)
  const { label } = dict.paramText(spec)
  const commit = (next: number) => {
    // `recipeOf` clamps and rounds; the knobs follow; the debounce runs.
    setSide(side, next)
    applyRecipe(false)
  }
  return (
    <div className="fw-k">
      <div className="top">
        <label className="lab" htmlFor={`simple-${side}`}>
          {label}
        </label>
        <DraftNumber label={label} value={value} onCommit={commit} />
      </div>
      <KnobSlider spec={spec} id={`simple-${side}`} value={value} label={label} onCommit={commit} />
    </div>
  )
}

/** Spec §2.2: the segmented button runs at once, after the knobs are rewritten. */
function SkeletonCard({ control }: { control: RunControl }): ReactElement {
  const dict = useDictionary()
  const skeleton = useStore((state) => state.recipe.value.skeleton)
  const setSkeleton = useStore((state) => state.recipe.setSkeleton)
  return (
    <div className="fw-k">
      <div className="top">
        <span className="lab" id="simple-skeleton-label">
          {dict.d.simple.skeleton}
        </span>
      </div>
      <Segmented
        label={dict.d.simple.skeleton}
        labelledBy="simple-skeleton-label"
        value={skeleton}
        options={SIMPLE_CHOICES.skeleton.map((value) => ({ value, label: dict.d.simple.options.skeleton[value] }))}
        onChange={(next) => {
          setSkeleton(next)
          applyRecipe(false)
          control.start()
        }}
      />
    </div>
  )
}

/** The seed lives in the knobs, not in the recipe; typed here through the machine path (Ruling 4). */
function SeedCard(): ReactElement {
  const dict = useDictionary()
  const seed = useStore((state) => state.params.values.seed)
  const setMany = useStore((state) => state.params.setMany)
  const { label } = dict.paramText(specOf('seed'))
  return (
    <div className="fw-k">
      <div className="top">
        <span className="lab">{label}</span>
        <DraftNumber label={label} value={seed} onCommit={(typed) => setMany({ seed: typed })} />
      </div>
    </div>
  )
}

function RandomCard(): ReactElement {
  const dict = useDictionary()
  const random = useStore((state) => state.recipe.value.random)
  const setRandom = useStore((state) => state.recipe.setRandom)
  return (
    <div className="fw-k">
      <OptionSwitch id="simple-random" label={dict.d.simple.randomize} on={random} onChange={setRandom} />
      <p className="why">{dict.d.simple.randomizeHelp}</p>
    </div>
  )
}

/**
 * The simple view (spec §2.1 unit 4): plain choices instead of twenty-eight
 * knobs, translated into a full parameter set by `lab-simple.ts`. It takes the
 * console's first two tracks (Ruling 7), so the run column beside it is the
 * same instance the advanced view shows.
 *
 * Not a tabpanel: in this view there is no rail to label it.
 */
export function SimplePanel({ control }: { control: RunControl }): ReactElement {
  const dict = useDictionary()
  const fields = VIEW_FIELDS.filter((field) => SIMPLE_VIEW_FIELDS.includes(field.field))
  const flags = VIEW_FLAGS.filter(({ flag }) => SIMPLE_VIEW_FLAGS.includes(flag))
  return (
    <section className="fw-knobs fw-simple" aria-label={dict.t('simplePanel')}>
      <div className="fw-khd">
        <b>{dict.d.simple.viewSimple}</b>
      </div>
      <div className="fw-grid">
        <SizeCard side="W" />
        <SizeCard side="H" />
        <PositionSlider slider="lengths" />
        <PositionSlider slider="shape" />
        <SkeletonCard control={control} />
        <SeedCard />
        <RandomCard />
      </div>
      <div className="fw-khd">
        <b>{dict.t('preview')}</b>
      </div>
      <div className="fw-grid">
        {fields.map((field) => (
          <ViewNumberField key={field.field} field={field} />
        ))}
        {flags.map(({ flag, label }) => (
          <ViewFlagSwitch key={flag} flag={flag} label={label} />
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 6: Style it**

Append to `apps/lab/src/design/console.css`:

```css
/* The simple view takes the rail's track and the panel's (PR 4a, Ruling 7),
   and at 900px the same two columns the query leaves. */
.fw-simple {
  grid-column: 1 / 3;
}
.fw-simple .fw-grid + .fw-khd {
  margin-top: 18px;
}
/* A recipe slider's two end words, under the track at either edge. */
.fw-k .fw-ends {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
/* A recipe slider's percent is read, not edited: `.fw-k .num`'s text cursor
   is the knob button's affordance. */
.fw-k span.num {
  cursor: default;
}
```

- [ ] **Step 7: Run it to verify it passes**

Run: `pnpm nx run lab:test -- SimplePanel ViewPanel`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src
git commit -m "Build the simple panel from the mock's cards, over the recipe"
```

---

## Task 10: The console swaps its interior, and the run column follows the view

**Files:** Modify `apps/lab/src/console/Console.tsx`, `apps/lab/src/routes/LabRoute.tsx`, `apps/lab/src/run/RunColumn.tsx`, `apps/lab/src/design/console.css`, `apps/lab/src/routes/LabRoute.browser.test.tsx`, `apps/lab/src/run/RunColumn.browser.test.tsx`, `apps/lab/src/run/triggers.browser.test.tsx`.

**Interfaces:**
- Consumes: `SimplePanel` (Task 9), `drawIfRandom`, `resetRecipeIfSimple` (Task 3), `ui.mode` (Task 2).
- Produces: `Console({ control, children }: { control: RunControl; children: ReactNode })` — its only call site is `LabRoute.tsx:34`. In simple mode: no rail, `SimplePanel` in tracks 1–2, the same `children` node in track 3, no preset strip, no `auto`/`help` switches; Generate and New seed draw first when randomising, Defaults resets the recipe.

- [ ] **Step 1: Put the three whole-app files on the advanced view**

Every existing case in these files was written against the advanced console, and a first visit now opens on the simple one (Ruling 2).

- `LabRoute.browser.test.tsx`, in `mountApp` beside the other `ui` resets: `useStore.getState().ui.setMode('advanced')` — and the same line in the hand-rolled reset of the StrictMode case `a finished run is offered to the store once per run, and the outcome is appended`, which does not call `mountApp`.
- `triggers.browser.test.tsx`, in `beforeEach`: `state.ui.setMode('advanced')` and `state.recipe.reset()` and `state.recipe.setRandom(false)`.
- `RunColumn.browser.test.tsx`, in `beforeEach`: `state.ui.setMode('advanced')`.

- [ ] **Step 2: Write the failing cases**

Append to `apps/lab/src/routes/LabRoute.browser.test.tsx`:

```ts
// Ruling 7, on the real page. The column is looked up once, before the swap,
// and compared by identity after it: a remount would leave an equal-looking
// region that is a different node. What a remount costs is real — the focus a
// keyboard user left on Generate, and the column's `wasRunning` ref.
//
// Mutation that must turn this red: in `Console.tsx`, return
// `<div className="fw-console"><SimplePanel control={control} />{children}</div>`
// for the simple mode, so `children` moves from the third position to the second.
test('the simple view replaces the rail and the presets, and keeps the very same run column', async () => {
  const screen = await mountApp()
  const column = screen.getByRole('region', { name: 'Run' }).element()
  await screen.getByRole('radio', { name: 'Simple' }).click()
  await expect.element(screen.getByRole('region', { name: 'Simple settings' })).toBeVisible()
  expect(screen.getByRole('tablist', { name: 'Parameter groups' }).query()).toBeNull()
  expect(screen.getByRole('group', { name: 'Presets' }).query()).toBeNull()
  expect(screen.getByRole('region', { name: 'Run' }).element()).toBe(column)
  await screen.getByRole('radio', { name: 'Advanced' }).click()
  await expect.element(screen.getByRole('tablist', { name: 'Parameter groups' })).toBeVisible()
  expect(screen.getByRole('region', { name: 'Run' }).element()).toBe(column)
}, 40_000)

// Ruling 9: `auto` and `help` belong to the knobs, and the knobs are not on screen.
test('the simple view hides the two switches only the advanced view has', async () => {
  const screen = await mountApp()
  await screen.getByRole('radio', { name: 'Simple' }).click()
  await expect.element(screen.getByRole('region', { name: 'Simple settings' })).toBeVisible()
  expect(screen.getByRole('switch', { name: 'generate right after a change' }).query()).toBeNull()
  expect(screen.getByRole('switch', { name: 'show parameter descriptions' }).query()).toBeNull()
  await expect.element(screen.getByRole('button', { name: 'Generate' })).toBeInTheDocument()
}, 40_000)

// Ruling 10: without its first row the lab grid would auto-place the stage
// into the `auto` track. Measured on the element the grid actually sizes.
test('the stage keeps its height when the preset strip goes', async () => {
  const screen = await mountApp()
  const stage = () => screen.container.querySelector<HTMLElement>('.fw-stage')?.getBoundingClientRect().height ?? 0
  await expect.poll(stage).toBeGreaterThanOrEqual(180)
  const before = stage()
  await screen.getByRole('radio', { name: 'Simple' }).click()
  await expect.element(screen.getByRole('region', { name: 'Simple settings' })).toBeVisible()
  // Not a 180px floor: at the runner's 414×896 an auto-placed stage still
  // measures 292px (measured in review: the board's 260px min-height plus its
  // padding, which the max-height: 700px rule releases), so the floor could
  // not fail. The
  // strip's row goes to the two remaining rows, so the stage can only grow.
  await expect.poll(stage).toBeGreaterThanOrEqual(before)
}, 40_000)
```

`LabRoute.browser.test.tsx` does not import the stylesheets today; the last case needs the grid, so add at the top, in `main.tsx`'s order:

```ts
import '../design/tokens.css'
import '../design/shell.css'
import '../design/console.css'
import '../design/run.css'
```

and run the whole file once after adding them, before Step 3: the existing cases must stay green with the real cascade loaded. If one does not, stop and report it rather than removing the imports.

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm nx run lab:test -- LabRoute`
Expected: the three new cases FAIL — no region named `Simple settings`; every existing case PASSES.

- [ ] **Step 4: Swap the interior in `Console.tsx`**

```tsx
import type { ReactNode } from 'react'
import type { RunControl } from '../run/useRun'
import { SimplePanel } from '../simple/SimplePanel'
import { useStore } from '../state/store'
import { GroupRail } from './GroupRail'
import { KnobPanel } from './KnobPanel'
import { ViewPanel } from './ViewPanel'

/**
 * The mock's three-track console: the group rail, one panel, and the run
 * column. The column comes in as a child, and it stays the third child in both
 * views — the rail's slot is `null` in the simple one — because React keeps a
 * node by its type and its position among its siblings. Handing the same
 * element to a second console component would be a new parent, and the column
 * would remount (PR 4a, Ruling 7, which corrects spec §5.1).
 */
export function Console({ control, children }: { control: RunControl; children: ReactNode }) {
  const entry = useStore((state) => state.ui.entry)
  const simple = useStore((state) => state.ui.mode === 'simple')
  return (
    <div className="fw-console">
      {simple ? null : <GroupRail />}
      {simple ? <SimplePanel control={control} /> : entry === 'preview' ? <ViewPanel /> : <KnobPanel group={entry} />}
      {children}
    </div>
  )
}
```

- [ ] **Step 5: Hide the strip and keep the grid in `LabRoute.tsx`**

Read the mode with `const simple = useStore((state) => state.ui.mode === 'simple')` (import `useStore`), and change the lab body to:

```tsx
        <div className={simple ? 'fw-lab simple' : 'fw-lab'}>
          {simple ? null : <PresetStrip control={control} />}
          <Stage />
          <Console control={control}>
```

Append to `apps/lab/src/design/console.css`, directly after the `.fw-lab` rule:

```css
/* The simple view has no preset strip (lab.html:52), and an absent first child
   would auto-place the stage into the `auto` row (PR 4a, Ruling 10). */
.fw-lab.simple {
  grid-template-rows: minmax(180px, 1fr) minmax(0, 1fr);
}
```

- [ ] **Step 6: Follow the view in `RunColumn.tsx`**

Import `drawIfRandom` and `resetRecipeIfSimple` from `../simple/applyRecipe`, read `const simple = useStore((state) => state.ui.mode === 'simple')`, and replace the three handlers and the Generate `onClick`:

```tsx
  // Generate and New seed in the simple view with randomising on draw the
  // knobs afresh before the run reads them; in every other state they keep
  // them (`lab-page.ts:912-921`). New seed moves the seed first, as the old
  // lab does; the draw does not read the seed, it only carries it along.
  const generate = () => {
    drawIfRandom()
    control.start()
  }
  const reseed = () => {
    setMany({ seed: Math.floor(Math.random() * 999999) })
    drawIfRandom()
    control.start()
  }
  // The knobs first, then the recipe written over them: its seed is the
  // default the reset just put back (`lab-page.ts:923-930`).
  const defaults = () => {
    resetParams()
    resetRecipeIfSimple()
    control.start()
  }
```

with `onClick={generate}` on Generate (keep the existing comment above `reseed` about the machine path), and wrap the switches:

```tsx
      {/* The knobs' own switches, and the simple view shows no knobs (PR 4a, Ruling 9). */}
      {simple ? null : (
        <div className="fw-ghost">
          <OptionSwitch id="opt-auto" label={dict.t('autoRun')} on={auto} onChange={setAuto} />
          <OptionSwitch id="opt-help" label={dict.t('showHelp')} on={help} onChange={setHelp} />
        </div>
      )}
```

- [ ] **Step 7: Run the three files, then the suite**

Run: `pnpm nx run lab:test -- LabRoute RunColumn triggers`
Expected: PASS — the new cases and every existing one.

Run: `pnpm nx run lab:test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src
git commit -m "Swap the console's interior for the simple view, keeping the run column in place"
```

- [ ] **Step 9: Prove two of the new cases can fail**

After the commit, so that `git checkout` restores the committed file and nothing else:

1. Apply the mutation named in the comment of `the simple view replaces the rail and the presets, and keeps the very same run column`, run `pnpm nx run lab:test -- LabRoute`, see that case fail on the identity assertion, then `git checkout -- apps/lab/src/console/Console.tsx`.
2. Delete the `.fw-lab.simple` rule, run the same command, and see `the stage keeps its height when the preset strip goes` fail; then `git checkout -- apps/lab/src/design/console.css`. Measured in review at the runner's 414×896: 364px with the strip, 292px in simple mode without the rule, so the case goes red on its last line once the poll times out (about a second, not a hang); with the rule the stage grows.

Record both failure lines in the task report. Neither step leaves a change in the tree.

---

## Task 11: The page opens on the recipe, and the trigger table is complete

**Files:** Modify `apps/lab/src/state/useUrlHash.ts`, `apps/lab/src/App.tsx`, `apps/lab/src/run/triggers.browser.test.tsx`.

**Interfaces:**
- Consumes: everything above.
- Produces: `useUrlHash(control): UrlHash`, where `interface UrlHash { openedFromLink(): boolean }` is stable across renders and answers whether the hash decoded at mount (Ruling 11). The page-load run applies the recipe first when the view is simple and the page did not open from a link.

- [ ] **Step 1: Write the failing cases**

In `apps/lab/src/run/triggers.browser.test.tsx`: extend the imports with `defaultChoice, recipeOf, simpleParams` from `@arrowz/engine/simple` (beside `exportCell`), `applyRecipe` from `../simple/applyRecipe` and `SimplePanel` from `../simple/SimplePanel`; change `afterEach` to also call `vi.restoreAllMocks()`; rename case 8 to `'8 · page load, advanced view: a run without a click, on the knobs the page opened with'` and replace the comment line that begins `// The \`applySimple()\` half` (the second of its two closing comment lines) with `// The simple view's half is case 16.`; and replace the head comment's paragraphs from "Seven rows are here." to the end of the bullet list with:

```ts
 * All ten rows are here. Cases 1–8 are the advanced view's; cases 9–18 are
 * the simple view's three rows of its own, and the simple halves of four rows
 * the advanced view shares — Generate and New seed draw the knobs afresh first
 * when randomising (`lab-page.ts:912-921`), Defaults resets the recipe
 * (`:923-930`), and the page opens on the recipe unless it opened on a link
 * (`:1479-1480`).
 *
 * Cases 9 and 10 drive the store the way the size card and the slider do —
 * `setSide`/`setSlider`, then `applyRecipe(false)` — rather than the inputs:
 * fake timers and Playwright's pointer do not mix, and the cards' own wiring is
 * `SimplePanel.browser.test.tsx`'s subject.
```

Append inside the `describe`, after case 8:

```tsx
  // Row 3, simple view. Auto stays off, from `beforeEach`: the row's whole
  // point is that the simple view's debounce does not ask the switch.
  it('9 · a simple size field: once, 350 ms later, with auto off, on the knobs the recipe gives', async () => {
    const r = recorder()
    useStore.getState().ui.setMode('simple')
    await renderHook(() => useAutoRun(r.control))
    vi.useFakeTimers()
    await act(async () => {
      useStore.getState().recipe.setSide('W', 120)
      applyRecipe(false)
    })
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS - 1)
    expect(r.seen).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(r.seen).toHaveLength(1)
    expect(r.seen[0]?.W).toBe(120)
    expect(r.seen[0]).toEqual(simpleParams({ ...useStore.getState().recipe.value, seed: defaultParams().seed }, null))
  })

  // Row 4. `shape` at 0.9 moves `pStraight` off its default, so a run on
  // stale knobs cannot satisfy the equality.
  it('10 · a simple slider: once, 350 ms later, with auto off, on the knobs the recipe gives', async () => {
    const r = recorder()
    useStore.getState().ui.setMode('simple')
    await renderHook(() => useAutoRun(r.control))
    vi.useFakeTimers()
    await act(async () => {
      useStore.getState().recipe.setSlider('shape', 0.9)
      applyRecipe(false)
    })
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS - 1)
    expect(r.seen).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(r.seen).toHaveLength(1)
    expect(r.seen[0]?.pStraight).not.toBe(defaultParams().pStraight)
    expect(r.seen[0]).toEqual(simpleParams({ ...useStore.getState().recipe.value, seed: defaultParams().seed }, null))
  })

  // Row 5: immediate, and the knobs rewritten before the run reads them.
  it('11 · the simple segmented button: at once, on the knobs the new skeleton gives', async () => {
    const r = recorder()
    useStore.getState().ui.setMode('simple')
    const screen = await render(<SimplePanel control={r.control} />)
    await screen.getByRole('radio', { name: 'with a skeleton' }).click()
    expect(r.seen).toHaveLength(1)
    expect(r.seen[0]?.giants).not.toBe(defaultParams().giants)
    expect(r.seen[0]).toEqual(simpleParams({ ...useStore.getState().recipe.value, seed: defaultParams().seed }, null))
  })

  // Row 6, simple view with randomising on. `Math.random` pinned, so the draw
  // is reproducible: the snapshot must be the pinned draw, not the canonical
  // knobs the recipe gives without one.
  it('12 · Generate in the simple view with randomising: at once, on a fresh draw', async () => {
    const r = recorder()
    useStore.getState().ui.setMode('simple')
    useStore.getState().recipe.setRandom(true)
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const screen = await render(<RunColumn control={r.control} />)
    await screen.getByRole('button', { name: 'Generate' }).click()
    expect(r.seen).toHaveLength(1)
    const recipe = useStore.getState().recipe.value
    expect(r.seen[0]).toEqual(simpleParams({ ...recipe, seed: defaultParams().seed }, () => 0.99))
    expect(r.seen[0]).not.toEqual(simpleParams({ ...recipe, seed: defaultParams().seed }, null))
  })

  // The same row without randomising: the simple view alone rewrites nothing.
  it('13 · Generate in the simple view without randomising: at once, rewriting nothing', async () => {
    const r = recorder()
    useStore.getState().ui.setMode('simple')
    useStore.getState().params.setMany({ W: 33, H: 66, seed: 7 })
    const before = { ...useStore.getState().params.values }
    const screen = await render(<RunColumn control={r.control} />)
    await screen.getByRole('button', { name: 'Generate' }).click()
    expect(r.seen).toEqual([before])
  })

  // Row 7, simple view with randomising on. One pinned value feeds both the
  // seed (`Math.floor(0.5 * 999999)`) and the draw. The order of the two is not
  // claimed: `simpleParams` draws without reading the seed and only writes it
  // back, so either order gives this snapshot (verified in review).
  it('14 · New seed in the simple view with randomising: at once, on the new seed and a fresh draw', async () => {
    const r = recorder()
    useStore.getState().ui.setMode('simple')
    useStore.getState().recipe.setRandom(true)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const screen = await render(<RunColumn control={r.control} />)
    await screen.getByRole('button', { name: 'New seed' }).click()
    expect(r.seen).toHaveLength(1)
    expect(r.seen[0]?.seed).toBe(499999)
    expect(r.seen[0]).toEqual(simpleParams({ ...useStore.getState().recipe.value, seed: 499999 }, () => 0.5))
  })

  // Row 8, simple view: the recipe goes back too, keeping `random`, and is
  // written without a draw — the default recipe gives the engine defaults.
  it('15 · Defaults in the simple view: at once, on the defaults, with the recipe reset and random kept', async () => {
    const r = recorder()
    useStore.getState().ui.setMode('simple')
    useStore.getState().params.setMany({ W: 77, seed: 5 })
    useStore.getState().recipe.setSlider('lengths', 0.1)
    useStore.getState().recipe.setRandom(true)
    const random = vi.spyOn(Math, 'random')
    const screen = await render(<RunColumn control={r.control} />)
    await screen.getByRole('button', { name: 'Defaults' }).click()
    expect(r.seen).toEqual([defaultParams()])
    expect(useStore.getState().recipe.value).toEqual(recipeOf({ ...defaultChoice(), random: true }))
    expect(random).not.toHaveBeenCalled()
  })

  // Row 10, simple view, the real control. The recipe is moved before the
  // mount, so a load run on the defaults cannot pass.
  it('16 · page load in the simple view: a run on the knobs the recipe gives', async () => {
    useStore.getState().ui.setMode('simple')
    useStore.getState().recipe.setSlider('lengths', 0.2)
    await render(<App />)
    await expect.poll(() => useStore.getState().run.params !== null, { timeout: 30_000 }).toBe(true)
    const recipe = useStore.getState().recipe.value
    expect(useStore.getState().run.params).toEqual(simpleParams({ ...recipe, seed: defaultParams().seed }, null))
    expect(useStore.getState().run.params).not.toEqual(defaultParams())
  }, 40_000)

  // Ruling 11: a page that opened on a link keeps the link's knobs, and the
  // recipe — moved here so that applying it would show — is not applied.
  it('17 · page load in the simple view from a link: a run on the link’s knobs, not the recipe’s', async () => {
    useStore.getState().ui.setMode('simple')
    useStore.getState().recipe.setSlider('lengths', 0.2)
    history.replaceState(null, '', encodeHash({ params: { ...defaultParams(), W: 61 }, view: VIEW, carried: {} }))
    await render(<App />)
    await expect.poll(() => useStore.getState().run.params !== null, { timeout: 30_000 }).toBe(true)
    expect(useStore.getState().run.params).toEqual({ ...defaultParams(), W: 61 })
  }, 40_000)
  // Ruling 11's other half: a hash that decodes and names no knob is still a
  // link — `loadFromUrl` returns true once the JSON parses. An
  // `openedFromLink` meaning "named a knob" would apply the moved recipe here.
  it('18 · page load in the simple view from a link naming nothing: a run on the defaults, not the recipe’s', async () => {
    useStore.getState().ui.setMode('simple')
    useStore.getState().recipe.setSlider('lengths', 0.2)
    history.replaceState(null, '', '#' + encodeURIComponent('{}'))
    await render(<App />)
    await expect.poll(() => useStore.getState().run.params !== null, { timeout: 30_000 }).toBe(true)
    expect(useStore.getState().run.params).toEqual(defaultParams())
  }, 40_000)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm nx run lab:test -- triggers`
Expected: FAIL in case 16 only — the load run uses `defaultParams()`. Cases 9–15 pass already, because Tasks 3, 4, 9 and 10 built their triggers; cases 17 and 18 pass because nothing applies the recipe on load yet. Case 16 is this task's test; the others are the table's statement.

- [ ] **Step 3: Tell the caller whether the page opened on a link**

In `apps/lab/src/state/useUrlHash.ts`, import `useMemo`, add above the hook:

```ts
export interface UrlHash {
  /**
   * Whether the page opened on a link: the hash decoded at mount, whether or
   * not it named a knob — the old `loadFromUrl` returns true once the JSON
   * parses (`lab-page.ts:1355-1358`). Read after the mount effects, never
   * during render.
   */
  openedFromLink(): boolean
}
```

change the signature to `export function useUrlHash(control: RunControl): UrlHash`, add `const fromLink = useRef(false)` beside `readDone`, set `fromLink.current = true` in the read effect directly after the `if (payload === null) return` line, and end the hook with:

```ts
  // Stable, so `App`'s load effect lists it without ever re-running on it.
  return useMemo(() => ({ openedFromLink: () => fromLink.current }), [])
```

- [ ] **Step 4: Apply the recipe before the load run**

In `apps/lab/src/App.tsx`, import `applyRecipe` from `./simple/applyRecipe`, take the hook's handle with `const hash = useUrlHash(control)`, and replace the load effect with:

```tsx
  useEffect(() => {
    // The old lab's order (`lab-page.ts:1479-1480`): in the simple view, a
    // page that did not open on a link opens on the board its recipe
    // describes. Without the draw, so the second pass StrictMode gives this
    // effect writes the very knobs the first one wrote.
    if (useStore.getState().ui.mode === 'simple' && !hash.openedFromLink()) applyRecipe(false)
    control.start()
  }, [control, hash])
```

and replace the last paragraph of the comment above it ("The old lab also applies the simple view's recipe … still missing.") with: "In the simple view the recipe is written into the knobs first, unless the page opened on a link — the hash hook's read effect has already run and knows."

- [ ] **Step 5: Run them to verify they pass**

Run: `pnpm nx run lab:test -- triggers LabRoute useUrlHash`
Expected: PASS, all eighteen trigger cases.

Run: `pnpm nx run lab:test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src
git commit -m "Open the simple view on its recipe, and state the whole trigger table as a test"
```

---

## Task 12: The browser pass, the spec amendments, the gates and the pull request

**Files:** Modify `docs/superpowers/specs/2026-09-13-lab-react-app-design.md`. No application code unless the browser pass finds a defect, in which case each defect is its own commit with a test.

- [ ] **Step 1: Look at it in a browser**

Run `pnpm nx serve lab` and, in a second shell, `sh packages/cli/lab.sh` — it builds the old lab and serves the board store on `127.0.0.1:8777`, the target `apps/lab/vite.proxy.ts:4` names; without it every save answers 502. Open the lab in Chrome through the chrome-devtools MCP, and use `emulate` with a viewport rather than `resize_page`, which could not grow the window past 1000px on this machine. With `localStorage` cleared, check and record, at `1400x900x1` and at `860x900x1`:

1. The page opens on the simple view, in the browser's language, and draws a board without a click.
2. The simple panel spans the rail's and the panel's tracks at 1400; at 860 it spans both columns and the run column is a full-width row beneath (`console.css`'s 900px query).
3. The stage is at least 180px tall in both views and at both widths.
4. The top bar's radios: measure the contrast of the unselected (`--void` on `--signal`) and selected (`--ink` on `--void`) text by painting each colour into a 1×1 canvas and reading the pixel back — `getComputedStyle().color` returns `oklch(…)` in Chrome and parsing it fails silently. Expect about 4.08:1 and far above 4.5:1; record both.
5. Tab to a top-bar radio: the focus ring is visible (`--void` on `--signal`).
6. A slider drag updates the CLI command live and starts one run about 350ms after release; Generate with randomising on draws a different board each time on one seed.
7. Switching to Polish renames every visible label, including the board element's own control bar, and `document.documentElement.lang` is `pl`; a reload keeps Polish, the view and the recipe.
8. A link copied from the address bar and opened in a new tab reproduces the knobs and the language, and does not apply the recipe.
9. The console shows no errors other than the `favicon.ico` 404.

Anything failing is fixed now, test first, one commit per defect.

- [ ] **Step 2: Amend spec §5.1**

In the component tree, replace the `simple/` block:

```
  simple/
    SimpleConsole.tsx         sizes, sliders, segmented choices
```

with:

```
  simple/
    SimplePanel.tsx           sizes, sliders, skeleton, seed, randomise, the
                              preview subset — tracks 1–2 of the one Console
    PositionSlider.tsx        a 0–100 recipe slider with its two end words
    applyRecipe.ts            the recipe into the knobs; the simple halves of
                              Generate, New seed and Defaults
```

(lines 308–309), add under `console/` (line 297) the line `    DraftNumber.tsx           the §5.5 draft entry, shared by ValueKnob and the simple view`, and under `shell/` (line 283) the lines `    Segmented.tsx             one of a few as a radio group: view, language, skeleton` and `    useDocumentLang.ts        <html lang> follows the store`. Add `    storage.ts                localStorage that never throws` under `state/` (line 329).

Replace the `RunColumn.tsx` entry's description (lines 311–314) with `command, Generate, New seed, Defaults, auto, help, abort, exports — built by the route and handed to Console as its third child, which keeps one instance in both views`, and the `useAutoRun.ts` entry's (line 320) with `the one debounce: a typed knob behind auto, a recipe edit without it — mounted once, in App`.

The two sentences below are wrapped at 80 columns in the spec (§5.1 at lines 355–357, §5.2 at lines 383–385); match them across the line breaks and rewrap the replacement to the same width.

Replace the sentence "`RunColumn` is built by the route and passed to `Console` as a child, so swapping in `SimpleConsole` cannot fork it; `Console` is therefore the mock's three-track grid and the column is its third track." with:

"`RunColumn` is built by the route and passed to `Console` as a child; `Console` is the mock's three-track grid and the column is its third track."

and append after the *Amended after PR 3* paragraph:

"*Amended in PR 4a.* The paragraph above holds only while one component places the column. React keeps a node by its type and its position among its siblings, not by the identity of the element object: handing the same `<RunColumn>` to a second console component is a new parent, and the column remounts — losing a focus a keyboard user left on Generate and the column's own transition ref. The simple view is therefore not a second console. `Console` swaps its first two tracks — the rail becomes nothing and the panel becomes `SimplePanel` — and keeps `children` in the third position in both views, which `LabRoute.browser.test.tsx` checks by node identity."

- [ ] **Step 3: Amend spec §5.2 and §10**

In §2.2's table (line 80), replace "`applySimple()` first, unless the hash carried knobs" with "`applySimple()` first in the simple view, unless the page opened on a link (the hash decoded)" — Ruling 11.

In §5.2, replace "It swaps `Console` for `SimpleConsole`; the stage, filmstrip, status bar and the run column the route hands in are untouched." with "`Console` swaps its rail and panel for `SimplePanel`; the stage, filmstrip, status bar and the run column the route hands in are untouched."

In §10, replace row 4 with two rows:

```
| 4a | Language switch and simple view: `lang` and `recipe` slices, `ui.mode`, the view and language radio groups in the top bar, `<html lang>` and the board's `lang`, the language in the hash, `SimplePanel` in the one `Console`, the simple halves of §2.2 — plan `2026-09-14-lab-simple-view.md` |
| 4b | Report with both delta baselines, SVG export, and the `f` hotkey with the solo view — stage chrome rather than a trigger, so §5.1 places them in `BoardFrame.tsx` |
```

Run: `grep -n "SimpleConsole" docs/superpowers/specs/2026-09-13-lab-react-app-design.md`
Expected: no output.

- [ ] **Step 4: Run both gates**

Run: `deno task verify` (repository root)
Expected: PASS.

Run: `pnpm nx run-many -t verify`
Expected: PASS. A failure is fixed and committed, not skipped; a failure that predates this branch is reported with `git log` evidence rather than assumed.

- [ ] **Step 5: Commit the amendments and write the PR body**

```bash
cd /Users/tomek/dev/arrowz
git add docs/superpowers/specs/2026-09-13-lab-react-app-design.md
git commit -m "Split PR 4 in the spec, and correct what it said about one run column"
```

Write the body to `.superpowers/sdd/2026-09-14-lab-simple-view/pr-body.md` (gitignored). In this order:

- What the PR adds, that it closes §10 row 4a, and that parity with today's lab is still PR 5.
- The fourteen rulings, one line each, with the user's four (1, 2, 3, 5) marked as such.
- **The parity deltas a reviewer must judge rather than skim:** a link's language is remembered (Ruling 6); the skeleton radios run on arrow keys (Ruling 12); a first visit opens the simple view, which the whole-app test files now opt out of (Ruling 2); the simple view's seed commits on Enter or blur rather than per keystroke (Ruling 4); `labLang` is written on a choice, not on every load (Ruling 6).
- The §5.1 correction (Ruling 7), with the mutation that proves the test.
- The two harness facts Task 1 pins, with the measurements.
- The browser pass's nine observations from Task 12 Step 1, with the two contrast figures.
- What is **not** here: the report, the SVG export, the solo view and `f` (4b); the library (PR 5); the docs route (PR 6); the filmstrip, the diff strip and ⌘K (PR 7).

Pushing the branch and opening the pull request are the user's call. When the user approves: `git push -u origin lab/simple-view` and `gh pr create --base lab/run-triggers --title "The generator lab as a React application: the simple view and the language switch" --body-file .superpowers/sdd/2026-09-14-lab-simple-view/pr-body.md`.

---

## Self-Review

**Spec §10 row 4a.** Language switch — Tasks 2, 6, 7, 8. Simple view — Tasks 3, 5, 9, 10, 11. The `lang` and `recipe` slices and `ui.mode` of §5.3 — Tasks 2, 3. `<html lang>` and the board's `lang` — Task 7. The spec amendments — Task 12.

**§2.2's ten rows.** Cases 1–8 stand from PR #66; case 8 is renamed to the advanced view. The three simple rows are cases 9, 10, 11. The simple halves: Generate (12, 13), New seed (14), Defaults (15), page load (16, 17, 18). Row 9, `hashchange`, has no simple half: it keeps the recipe, and case 17 shows a link's knobs winning over the recipe on load.

**Features §10 says the port must restore that belong to 4a.** The simple view's randomising (Tasks 3, 9, 11). The store-save outcome, `generatingBig` and the clamp notice stand from earlier PRs; the clamp notice is now also lowered by the recipe (Task 3, as the old lab does).

**Type consistency.** `RecipeSide`/`RecipeSlider` are defined in Task 3 and used by Tasks 9 (`SizeCard`, `PositionSlider`). `applyRecipe`, `drawIfRandom`, `resetRecipeIfSimple` are defined in Task 3 and used in Tasks 9, 10, 11. `DraftNumber`'s props (Task 5) match its three call sites (`ValueKnob`, `SizeCard`, `SeedCard`). `Segmented<T>` (Task 6) is used with `ViewMode`, `Lang` and `Recipe['skeleton']`. `Console` gains `control` in Task 10 and has one call site. `UrlHash` is defined and consumed in Task 11. `HashView.lang` and the one-key `Carried` are Task 8's and every `encodeHash` call in the tests still passes `carried: {}`. `VIEW_FLAGS`, `ViewFlagSwitch`, `ViewNumberField`, `SIMPLE_VIEW_FIELDS`, `SIMPLE_VIEW_FLAGS` are exported in Task 9 and used in the same task.

**Known risks, recorded rather than solved.**

1. **Task 10's stage-height case** compares with the height before the swap, because review measured an auto-placed stage at 292px — above any fixed floor at the runner's viewport; Step 9 proves the comparison goes red.
2. **Case 12 pins `Math.random` for the whole case**, and the run column's New seed path and the draw share it. Nothing else in the rendered column calls `Math.random`; if a later PR adds a caller, the case's second assertion is where it shows.
3. **The top bar's unselected radio is 4.08:1**, under 4.5:1 for its 12px text. It is the pairing the bar already ships (`.name`, `.dims`) and the open §7.1 decision; Task 12 measures it and the PR body names it.
4. **A language switch re-renders the whole application.** Rare and deliberate, so not measured; if Task 12's pass shows a visible stall at Insane, it goes to the PR body, not into a memoisation this plan does not have a measurement for.
