# Lab test fixtures (refactor 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The lab's browser tests share one stylesheet barrel, one store reset and one router-plus-root mount, so the cascade in tests is the production cascade and a new store field cannot leak between cases.

**Architecture:** `apps/lab/src/design/index.css` imports the eight sheets in `main.tsx`'s order and becomes the only stylesheet import of `main.tsx` and of every test. `resetApp` replaces the whole store with `useStore.getInitialState()` and then sets the few fields whose initial value reads the environment. `renderAt` in the harness mounts a node inside `MemoryRouter` and the `.fw` root.

**Tech Stack:** React 19, zustand 5 (`getInitialState`), Vitest 5 browser mode (Playwright Chromium), Vite CSS `@import`.

**Spec:** `lab-review.md`, "Refactors worth doing (ranked)" → "7. Test fixtures: CSS barrel, one app reset, one router mount", and "What is still open", item 3.

## Global Constraints

- Everything in the repository is in English: code, comments, test names, commit messages.
- Comments say why, once, in the fewest lines; no history (no "used to", no PR or round numbers); cite symbols, never `file.ts:NN`. `packages/engine/comments.test.ts` sweeps `apps/lab/src`: non-header blocks ≤ 6 lines.
- No `any`, no non-null assertions (`!`).
- Commit by path (`git add <paths>`), never `git add -A`. No attribution lines in commit messages.
- Run lab tests from `apps/lab`: `pnpm exec vitest run --project chromium <files>` and `pnpm exec vitest run --project node <files>`. The final gate is `pnpm nx run-many -t verify` from the repository root.
- A fresh worktree needs `pnpm install --frozen-lockfile` and `pnpm nx run-many -t build -p engine board-element` before the lab tests run.

## Measured before planning (2026-09-29, on `94e2a89`)

- Replacing every test's stylesheet subset with all eight sheets in `main.tsx` order: 992 of 993 browser tests pass. The one failure is `LabLayout.browser.test.tsx` › "the ⌘K button closes the palette it opened, rather than reopening it": with `palette.css` loaded, `.fw-scrim` (`position: fixed; inset: 0; z-index: 40`) covers the top bar, so the second click on the trigger never becomes actionable. Task 3 rewrites that case to what the app does.
- Replacing `resetApp`'s per-slice calls with `useStore.setState(useStore.getInitialState(), true)` plus the four environment-read fields: 993 of 993 pass.
- Initial values that read the environment at import: `lang.lang` (`navigator.language` and storage), `ui.mode`, `ui.report` and `ui.settings` (storage; `settings` also the viewport band). `resetApp` keeps setting those four explicitly after the wholesale reset.

## Review Focus

1. A case that sets a view field and a later case in the same file that reads it: after Task 1 the view slice is reset by `resetApp`, so an assertion that silently depended on a leftover would now read the default. Expect: the whole chromium suite stays green (measured), and `resetApp.browser.test.tsx` pins that the view and recipe are put back.
2. A future ninth stylesheet added to `main.tsx`'s old list or to `design/` without the barrel: Task 3's `index.test.ts` fails, naming the sheet.
3. A test that re-imports a single sheet after the barrel exists (copying an old pattern): Task 3's `index.test.ts` fails, naming the file.
4. The module-scope library timers (`cancelPendingSave`, `cancelNoticeFade`, `cancelFlash`) are not store state; `getInitialState` does not cancel them. Expect: `resetApp` still calls all three (Task 1 keeps them).
5. A press where the ⌘K button sits while the palette is open: the scrim takes it and closes the palette, and it must stay closed (not reopen on the click). Task 3's rewritten case pins it.

---

### Task 1: One store reset, one `mountApp`

**Files:**
- Modify: `apps/lab/src/harness/mountApp.tsx` (`resetApp` body and its doc comment)
- Create: `apps/lab/src/harness/resetApp.browser.test.tsx`
- Modify: `apps/lab/src/routes/Workspace.browser.test.tsx` (delete the local `mountApp`, import the harness one; the StrictMode case uses `resetApp`)

**Interfaces:**
- Consumes: `useStore` from `../state/store` (zustand 5 store: `getInitialState()`, `setState(state, replace)`).
- Produces: `resetApp(mode: ViewMode): void` and `mountApp(mode?: ViewMode)` keep their signatures.

- [ ] **Step 1: Write the failing test**

`apps/lab/src/harness/resetApp.browser.test.tsx`:

```tsx
import { expect, test } from 'vitest'
import { useStore } from '../state/store'
import { resetApp } from './mountApp'

// Written through `setState`, not the slices' own setters, so a broken setter
// cannot make the case pass.
test('resetApp puts back the slices it does not name, the view and the recipe among them', () => {
  const initial = useStore.getInitialState()
  useStore.setState((s) => ({
    view: { ...s.view, pad: s.view.pad + 3 },
    recipe: { ...s.recipe, value: { ...s.recipe.value, lengths: 0.99 } },
  }))
  expect(useStore.getState().view.pad).not.toBe(initial.view.pad)
  resetApp('advanced')
  expect(useStore.getState().view).toEqual(initial.view)
  expect(useStore.getState().recipe).toEqual(initial.recipe)
})

test('resetApp still sets the fields whose first value reads the browser', () => {
  useStore.setState((s) => ({ lang: { ...s.lang, lang: 'pl' }, ui: { ...s.ui, settings: false, report: true } }))
  resetApp('simple')
  const state = useStore.getState()
  expect(state.lang.lang).toBe('en')
  expect(state.ui.mode).toBe('simple')
  expect(state.ui.settings).toBe(true)
  expect(state.ui.report).toBe(false)
})
```

`lengths` is the length slider's position in 0..1 (`Recipe` in `packages/engine/lab-simple.ts`, default 0.75), so 0.99 is a valid value that differs from the initial one.

- [ ] **Step 2: Run it to verify the first case fails**

Run (from `apps/lab`): `pnpm exec vitest run --project chromium src/harness/resetApp.browser.test.tsx`
Expected: the first case FAILS on `expect(useStore.getState().view).toEqual(initial.view)` (today `resetApp` does not reset the view); the second passes.

- [ ] **Step 3: Replace the per-slice calls in `resetApp`**

In `apps/lab/src/harness/mountApp.tsx`, replace the body from `const state = useStore.getState()` through `state.ui.setBoardMode('view')` with:

```tsx
  useStore.setState(useStore.getInitialState(), true)
  // These four read the browser (language, storage, viewport) when the store is
  // created, so the initial state is whatever the first import saw.
  const state = useStore.getState()
  state.lang.setLang('en')
  state.ui.setMode(mode)
  state.ui.setReport(false)
  state.ui.setSettings(true)
```

Keep the address lines and the three `cancel…()` calls above it unchanged (the timers are module scope, not store state). Replace the whole doc comment above `resetApp` with:

```tsx
/**
 * Puts back everything a whole-app case can move. The address first: a case
 * that navigated must not leave the next on /boards, and a leftover fragment
 * would be read as a pasted link; `replaceState` also clears `history.state`,
 * react-router's record. Every slice goes back to its initial state, so a new
 * field needs no line here. The library timers are module scope and outlive
 * their component, so one left armed would post into the next case.
 */
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run --project chromium src/harness/resetApp.browser.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Negative control**

Comment out the line `useStore.setState(useStore.getInitialState(), true)`, run the same command, and confirm the first case FAILS on the `view` assertion. Restore the line.

- [ ] **Step 6: Delete `Workspace.browser.test.tsx`'s own `mountApp`**

In `apps/lab/src/routes/Workspace.browser.test.tsx`:
- Delete the comment block above `async function mountApp()` and the whole function (from `// The real App, address bar and all:` through its closing `}`).
- Change `import { loadRunDone } from '../harness/mountApp'` to `import { loadRunDone, mountApp, resetApp } from '../harness/mountApp'`.
- Every call `await mountApp()` stays as is: the harness default is `'advanced'`, the mode the local one set.
- In the case 'a finished run is offered to the store once per run, and the outcome is appended', replace the lines from `window.history.pushState({}, '', '/')` through `useStore.getState().ui.setBoardMode('view')` (the comment "Not through `mountApp`, which renders `App` bare…" included) with:

```tsx
  // Reset like `mountApp`, but rendered inside StrictMode.
  resetApp('advanced')
```

- Keep every import: `render`, `App`, `StrictMode` (the StrictMode case) and `cancelPendingSave` (a `finally` block) are all still used.

- [ ] **Step 7: Run the whole chromium suite**

Run: `pnpm exec vitest run --project chromium`
Expected: all files pass (993 + 2 new). `CommandPalette.browser.test.tsx` › "moves the active option with the arrows without moving the focus" was seen to fail once under full-suite load in the dry run and pass 3 of 3 alone; that file does not use `resetApp`. If it fails, rerun it alone before chasing it.

- [ ] **Step 8: Commit**

```bash
git add apps/lab/src/harness/mountApp.tsx apps/lab/src/harness/resetApp.browser.test.tsx apps/lab/src/routes/Workspace.browser.test.tsx
git commit -m "Lab tests: resetApp puts every slice back, and Workspace uses it"
```

---

### Task 2: `renderAt`, one router-and-root mount

**Files:**
- Create: `apps/lab/src/harness/renderAt.tsx`
- Create: `apps/lab/src/harness/renderAt.browser.test.tsx`
- Modify (their local mount helper only): `apps/lab/src/library/BoardColumn.browser.test.tsx` (`mountDetail`), `apps/lab/src/library/BoardPreview.browser.test.tsx` (`mountPreview`), `apps/lab/src/library/FileColumn.browser.test.tsx` (`mountFile`), `apps/lab/src/library/LibraryFace.browser.test.tsx` (`mountPanel`), `apps/lab/src/report/ReportPanel.browser.test.tsx` (`mountReport`), `apps/lab/src/stage/BoardFrame.browser.test.tsx` (`mountFrame`), `apps/lab/src/stage/BoardMode.browser.test.tsx` (`mountFrame`)

**Interfaces:**
- Produces: `renderAt(node: ReactNode, options?: { path?: string; style?: CSSProperties }): ReturnType<typeof render>` from `apps/lab/src/harness/renderAt.tsx`. `path` defaults to `'/'`.

Only the pattern `MemoryRouter` › `div.fw` (optional `style`) › node moves. Hook wrappers (`renderHook(…, { wrapper })`) and mounts without the `.fw` root stay as they are.

- [ ] **Step 1: Write the failing test**

`apps/lab/src/harness/renderAt.browser.test.tsx`:

```tsx
import { useLocation } from 'react-router'
import { expect, test } from 'vitest'
import { renderAt } from './renderAt'

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

test('renderAt mounts at the address, inside the .fw root, with the given box', async () => {
  const screen = await renderAt(<Where />, { path: '/boards', style: { width: '300px' } })
  const where = screen.getByTestId('where').element()
  expect(where.textContent).toBe('/boards')
  const root = where.closest('.fw')
  expect(root).not.toBeNull()
  expect(root instanceof HTMLElement ? root.style.width : '').toBe('300px')
})

test('renderAt defaults to the lab, /', async () => {
  const screen = await renderAt(<Where />)
  expect(screen.getByTestId('where').element().textContent).toBe('/')
})
```

The lab's tests import the router from `react-router`.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run --project chromium src/harness/renderAt.browser.test.tsx`
Expected: FAIL, cannot resolve `./renderAt`.

- [ ] **Step 3: Write `renderAt`**

`apps/lab/src/harness/renderAt.tsx`:

```tsx
import type { CSSProperties, ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { render } from 'vitest-browser-react'

/** A node at an address, inside the `.fw` root every lab rule hangs from. */
export function renderAt(node: ReactNode, { path = '/', style }: { path?: string; style?: CSSProperties } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <div className="fw" style={style}>
        {node}
      </div>
    </MemoryRouter>,
  )
}
```


- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run --project chromium src/harness/renderAt.browser.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Move the seven local mounts onto `renderAt`**

Replace each helper's `return render(<MemoryRouter …><div className="fw" …>…</div></MemoryRouter>)` with the lines below, add `import { renderAt } from '../harness/renderAt'` beside the file's other `../harness/…` import (or after the last relative import), and drop the imports left unused: in `BoardPreview`, `FileColumn`, `ReportPanel`, `BoardFrame` and `BoardMode` both `MemoryRouter` and `render`; in `LibraryFace` only `render` (its router import becomes `import { useLocation } from 'react-router'`); `BoardColumn` keeps both (its `renderHook` wrapper and `render(<App />)` use them).

`BoardColumn.browser.test.tsx`, `mountDetail`:
```tsx
  return renderAt(
    <>
      <KeyedColumn />
      <Address />
      {children}
    </>,
    { path },
  )
```

`BoardPreview.browser.test.tsx`, `mountPreview`:
```tsx
  return renderAt(<BoardPreview />, { path })
```

`FileColumn.browser.test.tsx`, `mountFile` (keep the `await openBoardFiles(…)` line above):
```tsx
  return renderAt(<BoardColumn control={control} />, { path: '/boards/file' })
```

`LibraryFace.browser.test.tsx`, `mountPanel`:
```tsx
  return renderAt(
    <>
      <LibraryFace />
      <Address />
    </>,
    { path },
  )
```

`ReportPanel.browser.test.tsx`, `mountReport`:
```tsx
  return renderAt(<ReportPanel />, { path, style: { display: 'grid', width: '352px', height: '600px' } })
```

`BoardFrame.browser.test.tsx`, `mountFrame` (keep the "One row" comment, moved above the `return`):
```tsx
  // One row: `.fw`'s own `48px auto 1fr` rows would give the frame 48px.
  return renderAt(<BoardFrame />, {
    path,
    style: { display: 'grid', gridTemplateRows: '1fr', width: '480px', height: '360px' },
  })
```

`BoardMode.browser.test.tsx`, `mountFrame`:
```tsx
  return renderAt(<BoardFrame />, {
    path,
    style: { display: 'grid', gridTemplateRows: '1fr', width: '480px', height: '360px' },
  })
```

- [ ] **Step 6: Run the seven files and the harness test**

Run: `pnpm exec vitest run --project chromium src/harness/renderAt.browser.test.tsx src/library/BoardColumn.browser.test.tsx src/library/BoardPreview.browser.test.tsx src/library/FileColumn.browser.test.tsx src/library/LibraryFace.browser.test.tsx src/report/ReportPanel.browser.test.tsx src/stage/BoardFrame.browser.test.tsx src/stage/BoardMode.browser.test.tsx`
Expected: all pass, with the same number of tests per file as before the change. Run the same command once before Step 5 and write the counts down.

- [ ] **Step 7: Lint and format**

Run (from the repository root): `pnpm nx run-many -t lint fmt check -p lab`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/lab/src/harness/renderAt.tsx apps/lab/src/harness/renderAt.browser.test.tsx apps/lab/src/library/BoardColumn.browser.test.tsx apps/lab/src/library/BoardPreview.browser.test.tsx apps/lab/src/library/FileColumn.browser.test.tsx apps/lab/src/library/LibraryFace.browser.test.tsx apps/lab/src/report/ReportPanel.browser.test.tsx apps/lab/src/stage/BoardFrame.browser.test.tsx apps/lab/src/stage/BoardMode.browser.test.tsx
git commit -m "Lab tests: one renderAt for a node at an address inside the .fw root"
```

---

### Task 3: One stylesheet barrel, for the app and every test

**Files:**
- Create: `apps/lab/src/design/index.css`
- Create: `apps/lab/src/design/index.test.ts` (node project)
- Modify: `apps/lab/src/main.tsx` (eight stylesheet imports → one)
- Modify (stylesheet imports only): the 25 test files listed in Step 5
- Modify: `apps/lab/src/routes/LabLayout.browser.test.tsx` (the ⌘K case, Step 6)

**Interfaces:**
- Produces: `apps/lab/src/design/index.css`, the only stylesheet a test or `main.tsx` imports.

- [ ] **Step 1: Write the failing guard**

`apps/lab/src/design/index.test.ts`:

```ts
import { expect, test } from 'vitest'
import main from '../main.tsx?raw'
import barrel from './index.css?raw'

const sheets = Object.keys(import.meta.glob('./*.css'))
  .map((path) => path.slice(2))
  .filter((name) => name !== 'index.css')
  .sort()
// `slice(1)`, not `m[1]`: `noUncheckedIndexedAccess` types a group as possibly undefined.
const cssImports = (source: string) => [...source.matchAll(/^import '([^']+\.css)'$/gm)].flatMap((m) => m.slice(1))

test('index.css imports every stylesheet in design/, once each', () => {
  const imported = [...barrel.matchAll(/^@import '\.\/([\w-]+\.css)';$/gm)].map((m) => m[1])
  expect([...imported].sort()).toEqual(sheets)
})

test('main.tsx takes its styles from index.css alone', () => {
  expect(cssImports(main)).toEqual(['./design/index.css'])
})

// A test that loads a subset of the cascade can pass on a page the app never shows.
test('no test imports a stylesheet other than index.css', () => {
  const tests = import.meta.glob('../**/*.test.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
  const offenders = Object.entries(tests).flatMap(([file, source]) =>
    cssImports(String(source))
      .filter((path) => !path.endsWith('/index.css') && path !== './index.css')
      .map((path) => `${file}: ${path}`),
  )
  expect(offenders).toEqual([])
})
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `apps/lab`): `pnpm exec vitest run --project node src/design/index.test.ts`
Expected: FAIL — `./index.css?raw` does not resolve.

- [ ] **Step 3: Write the barrel and point `main.tsx` at it**

`apps/lab/src/design/index.css` (the order is `main.tsx`'s, which the cascade depends on):

```css
/* The lab's whole cascade, in order: main.tsx and every test import this file. */
@import './tokens.css';
@import './shell.css';
@import './console.css';
@import './library.css';
@import './run.css';
@import './report.css';
@import './docs.css';
@import './palette.css';
```

In `apps/lab/src/main.tsx`, replace the eight lines `import './design/tokens.css'` … `import './design/palette.css'` with:

```tsx
import './design/index.css'
```

- [ ] **Step 4: Run the first two guard cases**

Run: `pnpm exec vitest run --project node src/design/index.test.ts`
Expected: the first two PASS; "no test imports a stylesheet other than index.css" FAILS listing the 25 files.

- [ ] **Step 5: Point the 25 test files at the barrel**

In each file, delete every `import '…/<sheet>.css'` line and put one import where the first of them stood. For files in `src/design/`: `import './index.css'`; everywhere else: `import '../design/index.css'`. Keep a comment that sat above the imports if it still says why the file needs the cascade; delete one that lists which sheets it loads.

Files: `src/console/KnobPanel.browser.test.tsx`, `src/console/KnobRow.browser.test.tsx`, `src/console/useFocusRequest.browser.test.tsx`, `src/console/ViewPanel.browser.test.tsx`, `src/design/console.browser.test.tsx`, `src/design/fonts.browser.test.ts`, `src/design/knobgrid.browser.test.tsx`, `src/design/touch.browser.test.tsx`, `src/library/BoardColumn.browser.test.tsx`, `src/library/LibraryFace.browser.test.tsx`, `src/palette/CommandPalette.browser.test.tsx`, `src/report/ReportPanel.browser.test.tsx`, `src/routes/CliDocs.browser.test.tsx`, `src/routes/DocsLayout.browser.test.tsx`, `src/routes/ElementDocs.browser.test.tsx`, `src/routes/LabLayout.browser.test.tsx`, `src/routes/LayoutInvariants.browser.test.tsx`, `src/routes/Workspace.browser.test.tsx`, `src/run/CommandText.browser.test.tsx`, `src/run/ExportButtons.browser.test.tsx`, `src/run/PresetStrip.browser.test.tsx`, `src/run/RunColumn.browser.test.tsx`, `src/shell/bands.browser.test.tsx`, `src/simple/SimplePanel.browser.test.tsx`, `src/stage/BoardFrame.browser.test.tsx`.

A script does it reliably; run it from `apps/lab` and read `git diff --stat` afterwards (25 files):

```bash
python3 - <<'EOF'
import os, re
files = """src/console/KnobPanel.browser.test.tsx src/console/KnobRow.browser.test.tsx src/console/useFocusRequest.browser.test.tsx src/console/ViewPanel.browser.test.tsx src/design/console.browser.test.tsx src/design/fonts.browser.test.ts src/design/knobgrid.browser.test.tsx src/design/touch.browser.test.tsx src/library/BoardColumn.browser.test.tsx src/library/LibraryFace.browser.test.tsx src/palette/CommandPalette.browser.test.tsx src/report/ReportPanel.browser.test.tsx src/routes/CliDocs.browser.test.tsx src/routes/DocsLayout.browser.test.tsx src/routes/ElementDocs.browser.test.tsx src/routes/LabLayout.browser.test.tsx src/routes/LayoutInvariants.browser.test.tsx src/routes/Workspace.browser.test.tsx src/run/CommandText.browser.test.tsx src/run/ExportButtons.browser.test.tsx src/run/PresetStrip.browser.test.tsx src/run/RunColumn.browser.test.tsx src/shell/bands.browser.test.tsx src/simple/SimplePanel.browser.test.tsx src/stage/BoardFrame.browser.test.tsx""".split()
pat = re.compile(r"^import '(?:\.\./design/|\./)[\w-]+\.css'\n", re.M)
for f in files:
    s = open(f).read()
    m = pat.search(s)
    assert m, f
    barrel = "import './index.css'\n" if f.startswith('src/design/') else "import '../design/index.css'\n"
    s = s[:m.start()] + barrel + pat.sub('', s[m.start():])
    open(f, 'w').write(s)
EOF
```

Then read each file's import block (`git diff -U2`) for comments to keep or delete, per the rule above. Two comments name sheets and must be rewritten, not kept:
- `src/routes/CliDocs.browser.test.tsx`: the comment above the import becomes `// A component test loads no stylesheet of its own; without the cascade the overflow assertion below reads \`visible\`.`
- `src/shell/bands.browser.test.tsx`: "The eight stylesheets in `main.tsx` order, as `LayoutInvariants` loads them" becomes `// The real cascade: the solo, focus and menu cases below need \`display: none\` to be real.`

- [ ] **Step 6: Rewrite the ⌘K case to what the app does**

With `palette.css` loaded the open palette's `.fw-scrim` covers the top bar, so the trigger cannot be clicked while the palette is open; a press there lands on the scrim, which closes the palette, and the click that follows reaches the scrim, not the trigger, so nothing reopens it. In `apps/lab/src/routes/LabLayout.browser.test.tsx` replace the comment above and the whole case 'the ⌘K button closes the palette it opened, rather than reopening it' with:

```tsx
// The open palette's scrim covers the top bar: a press where the trigger sits
// lands on the scrim, which closes the palette, and the click after it must not
// reopen it.
test('a press where the ⌘K button sits closes the palette, and it stays closed', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  const trigger = screen.getByRole('button', { name: 'Command palette (⌘K)' })
  await trigger.click()
  await expect.poll(() => useStore.getState().ui.palette).toBe(true)
  const box = trigger.element().getBoundingClientRect()
  const x = box.left + box.width / 2
  const y = box.top + box.height / 2
  const scrim = document.querySelector('.fw-scrim')
  if (!(scrim instanceof HTMLElement)) throw new Error('the open palette has no scrim')
  expect(scrim.contains(document.elementFromPoint(x, y))).toBe(true)
  // `inset: 0`, so the scrim's own coordinates are the viewport's.
  await page.elementLocator(scrim).click({ position: { x, y } })
  await expect.poll(() => useStore.getState().ui.palette).toBe(false)
  await twoFrames()
  expect(useStore.getState().ui.palette).toBe(false)
}, 40_000)
```

`LabLayout.browser.test.tsx` already imports `twoFrames` from `../harness/frames`. If `page.elementLocator(…).click` rejects a `position` option in this Vitest version, use `userEvent.click(scrim, { position: { x, y } })` instead (the Playwright provider forwards it).

- [ ] **Step 7: Negative control for Step 6**

Two controls, each reverted afterwards:
1. Delete `@import './palette.css';` from `index.css`; run `pnpm exec vitest run --project chromium src/routes/LabLayout.browser.test.tsx -t "stays closed"`; it must FAIL on the scrim assertion (nothing covers the trigger). Restore the line.
2. In `apps/lab/src/shell/TopBar.tsx`, change the ⌘K trigger's `onClick` to `onMouseUp` (a trigger that reopens on the release); run the same command; it must FAIL at the poll for `false`. Restore `onClick`.

- [ ] **Step 8: Run everything in the lab**

Run: `pnpm exec vitest run --project node src/design/index.test.ts` → PASS, 3 tests.
Run: `pnpm exec vitest run` (all projects) → all pass.
Run (from the repository root): `pnpm nx run-many -t lint fmt check -p lab` → clean. Vitest does not type-check; `check` is the only step that catches a type error in `index.test.ts`.

- [ ] **Step 9: Commit**

From the repository root:

```bash
git add apps/lab/src/design/index.css apps/lab/src/design/index.test.ts apps/lab/src/main.tsx apps/lab/src/routes/LabLayout.browser.test.tsx $(git diff --name-only -- apps/lab/src | grep '\.test\.tsx\?$')
git commit -m "Lab: one stylesheet barrel for the app and every test"
```

The commit message body must say that the ⌘K case now asserts the scrim path, because the trigger cannot be clicked while the palette is open.

---

### Task 4: Mark refactor 7 done, and the full gate

**Files:**
- Modify: `lab-review.md` ("What is still open" item 3, and the heading of refactor 7 under "Refactors worth doing (ranked)")
- Modify: `docs/` only if a doc names the per-test stylesheet imports (`grep -rn "import '../design/tokens.css'" docs`)

- [ ] **Step 1: Update `lab-review.md`**

In "What is still open", item 3, change `5 (the \`.fw button\` prefix and tokens), 7 and 11.` to `5 (the \`.fw button\` prefix and tokens) and 11; 7 is done on \`lab/test-fixtures\`.` Under "#### 7. Test fixtures: CSS barrel, one app reset, one router mount" add one line after the heading: `**Done on \`lab/test-fixtures\`:** \`design/index.css\`, \`resetApp\` through \`getInitialState\`, \`renderAt\`; the ⌘K case now tests the scrim, since the trigger is covered while the palette is open.`

In the status table under "### Refactors", replace the row starting `| 7. Test fixtures | partly fixed in \`97cc390\` |` with:

```
| 7. Test fixtures | fixed on `lab/test-fixtures` | `design/index.css` for `main.tsx` and every test (a node guard in `design/index.test.ts`), `resetApp` through `getInitialState`, `renderAt` in the harness; `twoFrames` was already one in `harness/frames.ts` |
```

- [ ] **Step 2: Full gate**

Run (from the repository root): `set -o pipefail; pnpm nx run-many -t verify 2>&1 | tail -15`
Expected: "Successfully ran target verify for 4 projects".
Run: `deno task verify` → all pass (it sweeps comments under `apps/lab/src`).

- [ ] **Step 3: Commit**

```bash
git add lab-review.md
git commit -m "lab-review: refactor 7 done"
```

## Out of scope, for the user to decide

- `CommandPalette`'s outside-press handler skips presses on the trigger ("Not the trigger: it toggles on *click*…"). With the scrim covering the top bar that branch is not reached by a mouse in the app; removing it is a product change and is not part of this refactor.
- The six component tests that patch the view with `setState` (`knobgrid`, `useUrlHash`, `SimplePanel`, `BoardFrame`, `LayoutInvariants`, `ViewPanel`) set deliberate non-default values for their case, not a reset; they stay.
- Refactor 5 (the `.fw button` prefix, tokens, the 699/700 breakpoint) is the next PR, planned after this one merges.
- `CommandPalette`'s "Not the trigger" branch (skipping the outside-press close for a click on the trigger itself) now has no test at all: the deleted assertion was its only coverage, and removing the branch leaves the suite green.
- `TopBar.tsx`'s ⌘K trigger `onClick` comment ("...The dialog's own outside-press listener leaves this element alone") describes a press the app cannot reach while `.fw-scrim` covers the trigger.
- `lab-review.md`'s item 7 list of files that patch the view slice through `setState` should say `Console.jump.browser.test.tsx` and `Workspace.browser.test.tsx` were cleaned up on this branch.
