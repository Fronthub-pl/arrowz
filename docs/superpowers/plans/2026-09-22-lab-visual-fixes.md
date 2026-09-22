# Lab Visual Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the ten visual defects of the 2026-09-22 implementation review, adopt its knob-panel layout, decide the Signal-plane contrast, and put a layout-invariant test in front of all of it.

**Architecture:** One whole-app browser test (`LayoutInvariants.browser.test.tsx`) mounts the lab over a matrix of states × viewports and records which invariants fail. It starts with every failure it finds listed against a defect id. Each later task deletes its own entries from that list and then fixes the defect. Most fixes are CSS. Three touch JSX: the edited marker moves to the top bar, descriptions move from the knob cards to the panel heading, and the preview panel is split into four sections.

**Tech Stack:** React 19, zustand 5, react-router 8, Vitest 5 (`node` and `chromium` projects, Playwright Chromium), Deno 2.9 for the engine's dictionary.

**Spec:** `docs/superpowers/specs/2026-09-22-lab-visual-fixes-design.md`. Read its §2 table before any task. The review behind it was written against a static reconstruction, and three of its claims were corrected.

## Global Constraints

- **Everything in the repository is English.** Only the chat with the user is Polish. Every user-facing string is written in both PL and EN in `packages/engine/lab-i18n.ts`, with English as the source.
- **No `any`, no non-null assertions.** `exactOptionalPropertyTypes` is on: an optional prop taking `T | undefined` is written `prop?: T | undefined`.
- **`apps/lab` reads the engine from `packages/engine/dist/`.** After Task 12 changes the dictionary, run `pnpm nx build engine` before running any lab test by hand. On a fresh worktree also run `pnpm nx build board-element` first.
- **Run lab tests through Nx or from `apps/lab`**: `pnpm nx run lab:test`, or from `apps/lab` `pnpm vitest run --project chromium <file>` for one browser file. Run `pnpm nx run lab:check` after every test file you touch. `vitest` does not type-check, so a TS error only shows up in `lab:check`.
- **Harness facts that break plans** (memory `arrowz-testy-lab-harness`). The browser project loads **no stylesheet**: a test that measures styling imports the CSS itself. `page.viewport` outlives the case, so every geometry case sets its own. The default viewport is 414×896, where the ≤900px media queries already apply. Every whole-app case gets a `40_000` timeout. `getByText` matches the whole text exactly. `render` is async.
- **Measure effects, not declarations.** A "does not scroll" check compares `scrollHeight` with `clientHeight`. It never reads `overflow`.
- **Lint is part of `verify`**, and so are `jsx-a11y/no-autofocus` and `react-hooks/immutability`. An unused import in a test file fails `verify`.
- **Never `git add -A`.** `.claude/settings.json` and `skills-lock.json` are dirty and not ours. Add exactly the paths each step names.
- **No attribution lines** in commit messages.
- Branch: `lab/visual-fixes`, from `main` = `72fd81c`, no upstream set. The spec and this plan are the branch's first commit.
- **Stop and report instead of widening scope** if a task's red run shows a failure that its defect id does not explain.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/lab/src/harness/invariants.ts` | pure DOM checks: document scroll, board clip, sibling overlap, UA buttons, dangling `aria-describedby`, low contrast (create) |
| `apps/lab/src/routes/LayoutInvariants.browser.test.tsx` | the state × viewport matrix and the known-red list (create) |
| `apps/lab/src/design/tokens.css`, `tokens.test.ts` | the three `--signal-fill*` tokens (modify) |
| `apps/lab/src/design/shell.css` | top bar, Generate, segmented, `.fw-btn`, stage columns, board background (modify) |
| `apps/lab/src/design/console.css` | knob layout, `.fw-kdesc`, flags and colours cards, lab rows, containing block, empty library (modify) |
| `apps/lab/src/design/run.css`, `library.css`, `report.css`, `palette.css`, `docs.css` | their surfaces' fixes (modify) |
| `apps/lab/src/design/touch.browser.test.tsx` | coarse-pointer coverage (create) |
| `apps/lab/src/shell/TopBar.tsx` (+ test) | the edited marker, narrow-width classes (modify) |
| `apps/lab/src/run/PresetStrip.tsx` | loses the marker (modify) |
| `apps/lab/src/console/FieldHelp.tsx` | the heading's description list (create) |
| `apps/lab/src/console/KnobPanel.tsx`, `ValueKnob.tsx`, `ChoiceKnob.tsx`, `StartKnob.tsx` (+ tests) | descriptions out of the cards (modify) |
| `apps/lab/src/console/ViewPanel.tsx` (+ test), `viewFields.ts` | four sections, flags card, colours card (modify) |
| `apps/lab/src/simple/SimplePanel.tsx` | heading help for `headHeight` (modify) |
| `apps/lab/src/console/Console.tsx` | `empty` class on the library console (modify) |
| `apps/lab/src/library/BoardList.tsx`, `BoardDetail.tsx` (+ test) | `.fw-btn`, detail rows (modify) |
| `packages/engine/lab-i18n.ts`, `lab-i18n.test.ts` | four section titles (modify) |

---

### Task 0: Commit the spec and the plan

- [ ] **Step 1:**

```bash
git add docs/superpowers/specs/2026-09-22-lab-visual-fixes-design.md docs/superpowers/plans/2026-09-22-lab-visual-fixes.md
git commit -m "Specify and plan the lab visual fixes from the implementation review"
```

---

### Task 1: The layout-invariant test, with today's failures listed

**Files:**
- Create: `apps/lab/src/harness/invariants.ts`
- Create: `apps/lab/src/routes/LayoutInvariants.browser.test.tsx`

**Interfaces:**
- Consumes: `resetApp`, `loadRunDone` (`src/harness/mountApp.tsx`); `contrast`, `shown` (`src/design/contrast.ts`); `App` (`src/App.tsx`).
- Produces: `type Finding = { invariant: Invariant; detail: string }`, `type Invariant = 'scroll' | 'board-clip' | 'overlap' | 'ua-button' | 'describedby' | 'contrast'`, `function audit(root: HTMLElement, opts: { board: boolean }): Finding[]`, and in the test file `const KNOWN_RED: Partial<Record<string, readonly Invariant[]>>` keyed `` `${state}@${w}x${h}` ``. Every later task edits `KNOWN_RED`.

- [ ] **Step 1: Write the checks**

`apps/lab/src/harness/invariants.ts`:

```ts
import { contrast, shown } from '../design/contrast'

// The review's measurements (2026-09-22) as assertions. Every one of them
// reads an effect the browser computed, never a declared property: a panel
// that declares `overflow: auto` and never scrolls passes a declaration test
// (harness fact 36).

export type Invariant = 'scroll' | 'board-clip' | 'overlap' | 'ua-button' | 'describedby' | 'contrast'
export interface Finding {
  invariant: Invariant
  detail: string
}

const EPS = 0.5

function label(node: Element): string {
  const cls = typeof node.className === 'string' && node.className !== '' ? `.${node.className.split(' ').join('.')}` : ''
  return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${cls}`
}

function rendered(node: Element): boolean {
  return node.checkVisibility({ visibilityProperty: true, opacityProperty: false })
}

/** The document scrolls on neither axis. */
function scroll(): Finding[] {
  const root = document.scrollingElement
  if (root === null) throw new Error('no scrolling element')
  const out: Finding[] = []
  if (root.scrollHeight > root.clientHeight + EPS)
    out.push({ invariant: 'scroll', detail: `y ${root.scrollHeight} > ${root.clientHeight}` })
  if (root.scrollWidth > root.clientWidth + EPS)
    out.push({ invariant: 'scroll', detail: `x ${root.scrollWidth} > ${root.clientWidth}` })
  return out
}

/** The board lies inside the wrap's content box: the wrap clips (`overflow: hidden`). */
function boardClip(root: HTMLElement): Finding[] {
  const wrap = root.querySelector('.fw-boardwrap')
  const board = root.querySelector('.fw-board')
  if (wrap === null || board === null || !rendered(board)) return []
  const w = wrap.getBoundingClientRect()
  const b = board.getBoundingClientRect()
  const pad = Number.parseFloat(getComputedStyle(wrap).paddingBottom)
  const below = b.bottom - (w.bottom - pad)
  return below > EPS ? [{ invariant: 'board-clip', detail: `board ${below.toFixed(1)}px below the wrap` }] : []
}

/** Rendered children of each grid named here do not intersect. */
function overlap(root: HTMLElement): Finding[] {
  const out: Finding[] = []
  for (const parent of root.querySelectorAll('.fw-lab, .fw-lib-detail')) {
    const kids = [...parent.children].filter(rendered).filter((k) => k.getBoundingClientRect().height > 0)
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i]?.getBoundingClientRect()
        const b = kids[j]?.getBoundingClientRect()
        if (a === undefined || b === undefined) continue
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (x > EPS && y > EPS)
          out.push({ invariant: 'overlap', detail: `${label(kids[i] as Element)} × ${label(kids[j] as Element)}` })
      }
    }
  }
  return out
}

/** No button keeps the user agent's look (review P9: `2px outset`). */
function uaButtons(root: HTMLElement): Finding[] {
  return [...root.querySelectorAll('button')]
    .filter((b) => rendered(b) && getComputedStyle(b).borderTopStyle === 'outset')
    .map((b) => ({ invariant: 'ua-button' as const, detail: `${label(b)} "${b.textContent?.trim() ?? ''}"` }))
}

/** Every `aria-describedby` token names an element in the document. */
function describedBy(root: HTMLElement): Finding[] {
  const out: Finding[] = []
  for (const node of root.querySelectorAll('[aria-describedby]')) {
    for (const id of (node.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)) {
      if (document.getElementById(id) === null)
        out.push({ invariant: 'describedby', detail: `${label(node)} → #${id}` })
    }
  }
  return out
}

/**
 * Every visible run of text clears 4.5:1. Exempt, as WCAG exempts them:
 * disabled controls. Skipped as not visible: anything visually hidden by
 * `.fw-vh` (clip-path inset 50%) or not rendered.
 */
function lowContrast(root: HTMLElement): Finding[] {
  const out: Finding[] = []
  for (const node of root.querySelectorAll('*')) {
    const own = [...node.childNodes].some((c) => c.nodeType === Node.TEXT_NODE && c.textContent?.trim())
    if (!own || !rendered(node)) continue
    if (node.closest('.fw-vh, [aria-hidden="true"], :disabled, [aria-disabled="true"]') !== null) continue
    const { front, back } = shown(node)
    const ratio = contrast(front, back)
    if (ratio < 4.5)
      out.push({ invariant: 'contrast', detail: `${label(node)} "${node.textContent?.trim().slice(0, 20)}" ${ratio.toFixed(2)}` })
  }
  return out
}

export function audit(root: HTMLElement, { board }: { board: boolean }): Finding[] {
  return [
    ...scroll(),
    ...(board ? boardClip(root) : []),
    ...overlap(root),
    ...uaButtons(root),
    ...describedBy(root),
    ...lowContrast(root),
  ]
}
```

- [ ] **Step 2: Write the matrix**

`apps/lab/src/routes/LayoutInvariants.browser.test.tsx`:

```tsx
import { act } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { App } from '../App'
import { audit, type Invariant } from '../harness/invariants'
import { loadRunDone, resetApp } from '../harness/mountApp'
import { useStore } from '../state/store'
import '../design/tokens.css'
import '../design/shell.css'
import '../design/console.css'
import '../design/library.css'
import '../design/run.css'
import '../design/report.css'
import '../design/docs.css'
import '../design/palette.css'

// Spec R1: the review's four measurements plus two of its findings, over
// every state it found a defect in. The same import order as `main.tsx`.

type State = 'board' | 'preview-palette' | 'lengths-help-off' | 'violations' | 'simple' | 'library-empty' | 'docs'
const STATES: readonly State[] = [
  'board',
  'preview-palette',
  'lengths-help-off',
  'violations',
  'simple',
  'library-empty',
  'docs',
]
const SIZES: readonly (readonly [number, number])[] = [
  [1400, 900],
  [1280, 800],
  [1024, 768],
  [860, 900],
  [420, 900],
]

/**
 * What fails today, by defect id (spec §2). A task that fixes a defect
 * deletes its entries here *first*, watches the case go red, then fixes it.
 * The comparison is exact, so an entry left behind after its fix is red too.
 */
const KNOWN_RED: Partial<Record<string, readonly Invariant[]>> = {
  // Filled in Step 4 from the first run, one line per case, each invariant
  // commented with its defect id, e.g.:
  // 'preview-palette@1280x800': ['scroll', 'contrast'], // P1, Signal
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
})

afterEach(() => {
  // The view slice has no reset (mountApp.tsx); put back what a case moved,
  // through `setState` and not through a slice action (harness fact 40).
  useStore.setState((s) => ({ view: { ...s.view, palette: [] } }))
  vi.restoreAllMocks()
})

async function arrange(state: State) {
  resetApp(state === 'simple' ? 'simple' : 'advanced')
  if (state === 'library-empty') {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('no store'))
    window.history.pushState({}, '', '/boards')
  }
  if (state === 'docs') window.history.pushState({}, '', '/docs/cli')
  const screen = await render(<App />)
  if (state !== 'library-empty' && state !== 'docs') await loadRunDone()
  await act(async () => {
    const s = useStore.getState()
    if (state === 'preview-palette') {
      s.ui.select('preview')
      for (let i = 0; i < 8; i++) s.view.addPaletteColor()
    }
    if (state === 'lengths-help-off') {
      s.ui.select('lengths')
      s.ui.setHelp(false)
    }
    if (state === 'violations') {
      s.params.setMany({ wShort: 0.8, wMid: 0.8 })
      s.ui.raiseClamped(true)
    }
  })
  return screen
}

test.each(STATES.flatMap((state) => SIZES.map(([w, h]) => [state, w, h] as const)))(
  'the %s state at %d×%d keeps every layout invariant',
  async (state, w, h) => {
    await page.viewport(w, h)
    const screen = await arrange(state)
    // One frame for the layout that followed the last store write.
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const board = state !== 'library-empty' && state !== 'docs'
    const findings = audit(screen.container, { board })
    const failing = [...new Set(findings.map((f) => f.invariant))].sort()
    const expected = [...(KNOWN_RED[`${state}@${w}x${h}`] ?? [])].sort()
    expect(failing, findings.map((f) => `${f.invariant}: ${f.detail}`).join('\n')).toEqual(expected)
  },
  40_000,
)
```

- [ ] **Step 3: Run it and read the failures**

Run (from `apps/lab`): `pnpm vitest run --project chromium src/routes/LayoutInvariants.browser.test.tsx`
Expected: a mix of green and red. The failure message of each red case lists its findings.

- [ ] **Step 4: Attribute every red case, and write `KNOWN_RED`**

For each red case, name the defect behind each failing invariant from the spec. Write it into `KNOWN_RED` with a trailing comment:
- `scroll` in preview-palette, or with help off → **P1**
- `board-clip`, and `overlap` inside `.fw-lab`, under violations → **P2**
- `scroll` on the x axis at 420 → **P8**
- `ua-button` → **P9**
- `contrast` on the top bar, a selected rail tab, a chip, Generate, a knob value, or a palette value → **Signal** (spec §5)
- `overlap` inside `.fw-lib-detail` → **P6** (not expected here: no state in this matrix opens a stored board)

A red case the list above does not explain, or a crash in `arrange`: **stop and report it to the controller**. Do not fix it and do not list it.

If P1 or P2 does **not** show up anywhere, write that down in the report, because the review predicted both. Do not invent a state to force them.

- [ ] **Step 5: Run to green**

Run the same command. Expected: PASS, 35 cases. Then run `pnpm nx run lab:check` and expect it to pass.

- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/harness/invariants.ts apps/lab/src/routes/LayoutInvariants.browser.test.tsx
git commit -m "Assert the lab's layout invariants over a matrix of states and sizes"
```

---

### Task 2: P1 — hidden text no longer scrolls the shell

**Files:**
- Modify: `apps/lab/src/design/console.css` (`.fw-knobs` at :350, the `.fw-vh` comment at :193-209)
- Modify: `apps/lab/src/design/report.css` (`.fw-report` at :6)
- Test: `apps/lab/src/routes/LayoutInvariants.browser.test.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Remove every `// P1` entry from `KNOWN_RED`.** If that empties a case's list, delete the key.
- [ ] **Step 2: Run the matrix.** Expected: FAIL, only in the cases whose entries you just removed, each with a `scroll` finding.
- [ ] **Step 3: Fix.** In `console.css`, change `.fw-knobs` to:

```css
/* `position: relative` makes the panel the containing block of every `.fw-vh`
   inside it (spec R3). Without it the 1px box resolved against the initial
   containing block, at its static position far below the fold, and grew the
   document: 1077px at 1280×800 in the review's measurement (P1). */
.fw-knobs {
  position: relative;
  background: var(--void);
  padding: 14px 20px 18px;
  min-height: 0;
  overflow-y: auto;
}
```

In the `.fw-vh` comment, add this line after the `position: absolute` bullet:

```css
     It needs a positioned ancestor inside the scroller: `.fw-knobs` and
     `.fw-report` are that ancestor (P1).
```

In `report.css`, add `position: relative;` as the first declaration of `.fw-report`, with the comment `/* The containing block of the delta's hidden word (StatsTable.tsx), for the reason .fw-knobs gives. */`.
- [ ] **Step 4: Run the matrix.** Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/design/console.css apps/lab/src/design/report.css apps/lab/src/routes/LayoutInvariants.browser.test.tsx
git commit -m "Contain visually hidden text in its scrolling panel"
```

---

### Task 3: P2 — the notice and the violations get their own rows

**Files:**
- Modify: `apps/lab/src/design/console.css:458-479` (`.fw-lab`, `.fw-lab.simple`)
- Test: `LayoutInvariants.browser.test.tsx`, `apps/lab/src/routes/LabLayout.browser.test.tsx` (must stay green)

- [ ] **Step 1: Remove every `// P2` entry from `KNOWN_RED`.**
- [ ] **Step 2: Run the matrix.** Expected: FAIL in the violations cases, on `board-clip` and/or `overlap`.
- [ ] **Step 3: Fix.** Replace the `.fw-lab` and `.fw-lab.simple` rules (keep `.fw-lab.library` unchanged) and insert the media block **directly after `.fw-lab.library`, before the solo rules**. The solo selectors are (0,2,0) and (0,3,0) and must keep winning:

```css
/* Five rows, one per child Workspace.tsx can mount (spec R4): the preset
   strip, the stage, the console, the clamp region (always mounted, empty when
   nothing was clamped) and the violations (mounted only when there are some).
   Before, the last two fell into implicit rows and took their height from the
   two 1fr rows, and the board — 260px plus 32px of padding — was cut at the
   bottom: 33px at 1280×800 with two violations (review P2). The stage row's
   floor is that 292px now; the notes are capped and scroll inside themselves. */
.fw-lab {
  display: grid;
  grid-template-rows: auto minmax(292px, 1fr) minmax(0, 1fr) auto auto;
  min-height: 0;
}
/* The simple view has no preset strip, and an absent first child would
   auto-place the stage into the `auto` row (PR 4a, Ruling 10). */
.fw-lab.simple {
  grid-template-rows: minmax(292px, 1fr) minmax(0, 1fr) auto auto;
}
```

```css
/* Below 700px of height the board gives up its minimum (shell.css), so its row
   gives up the 292px too. */
@media (max-height: 700px) {
  .fw-lab {
    grid-template-rows: auto minmax(180px, 1fr) minmax(0, 1fr) auto auto;
  }
  .fw-lab.simple {
    grid-template-rows: minmax(180px, 1fr) minmax(0, 1fr) auto auto;
  }
}
/* Two violations are 90px already, and six knobs out of range grow the list
   past any row the console could spare (review P2). */
.fw-lab > .fw-note {
  max-height: 96px;
  overflow-y: auto;
}
```

- [ ] **Step 4: Run the matrix, then `LabLayout.browser.test.tsx`.** Expected: both PASS. If a `LabLayout` case goes red on the console's knob row at 860×900, the 292px floor is starving the console. Report the measured row heights and do not lower the floor on your own.
- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/design/console.css apps/lab/src/routes/LayoutInvariants.browser.test.tsx
git commit -m "Give the clamp notice and the violations their own rows under the console"
```

---

### Task 4: P9 — the four undressed buttons

**Files:**
- Modify: `apps/lab/src/design/shell.css` (new `.fw .fw-btn` block after `.fw .fw-seg`'s rules, before the top-bar Signal block at :391)
- Modify: `apps/lab/src/design/console.css:336-349` (`.fw-palette-remove`)
- Modify: `apps/lab/src/design/library.css:128-134` (armed Delete)
- Modify: `apps/lab/src/console/ViewPanel.tsx:214`, `apps/lab/src/library/BoardList.tsx:46`, `apps/lab/src/library/BoardDetail.tsx:168,171`
- Test: `LayoutInvariants.browser.test.tsx`, and a new case in `apps/lab/src/library/BoardDetail.browser.test.tsx`

- [ ] **Step 1: Remove every `// P9` entry from `KNOWN_RED`**, then add this failing case to `BoardDetail.browser.test.tsx`, which already imports `tokens.css`, `console.css` and `library.css`. Add `import '../design/shell.css'` next to them, because the new class lives there:

```tsx
// Review P9: neither detail button was dressed, so both kept the browser's
// `2px outset` border. Delete was dressed only once armed, and even then only
// its border *colour*, on a border with no width or style.
test('both detail buttons wear the console button, armed or not', async () => {
  await show()
  const screen = await mountDetail()
  const buttons = [...screen.container.querySelectorAll<HTMLButtonElement>('.fw-lib-buttons button')]
  expect(buttons).toHaveLength(2)
  for (const b of buttons) {
    expect(getComputedStyle(b).borderTopStyle).toBe('solid')
    expect(getComputedStyle(b).borderTopWidth).toBe('1px')
  }
  const del = buttons[1]
  if (del === undefined) throw new Error('no delete button')
  await userEvent.click(del)
  expect(del.className).toContain('armed')
  expect(getComputedStyle(del).borderTopStyle).toBe('solid')
})
```

`show()` puts a stored board on the stage (see its definition near the top of the file). Call it the way the neighbouring cases do. If they call `mountDetail` first, keep their order.

- [ ] **Step 2: Run both files.** Expected: FAIL. The matrix shows `ua-button` findings (at least in library-empty, which has Refresh), and the new case reads `outset`.
- [ ] **Step 3: Fix the CSS.** In `shell.css`:

```css
/* The console's plain button (spec R6): Refresh, Load into lab, Delete, add
   colour. `.fw button` above normalises type and never paints, so a button
   with no class of its own kept the browser's grey `2px outset` look (review
   P9). A class, not a context selector, because "add colour" moves between
   cards. (0,2,0) outranks `.fw button`. */
.fw .fw-btn {
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
.fw .fw-btn:hover:not(:disabled) {
  color: var(--ink);
  background: var(--surface);
}
.fw .fw-btn:disabled {
  cursor: default;
}
@media (pointer: coarse) {
  .fw .fw-btn {
    height: 44px;
  }
}
```

In `console.css`, change the two selectors `.fw-palette-remove` and `.fw-palette-remove:hover` to `.fw .fw-palette-remove` and `.fw .fw-palette-remove:hover`. Add this comment above them: `/* `.fw` because `.fw button`'s `color: inherit` (0,1,1) outranked the bare class and the mist never applied. */`

In `library.css`, replace the armed rule with:

```css
.fw .fw-lib-buttons .fw-btn.danger.armed {
  border-color: var(--error);
  background: var(--error);
  color: var(--void);
}
```

- [ ] **Step 4: Fix the JSX.** Add `className="fw-btn"` to the add-colour button (`ViewPanel.tsx:214`), to Refresh (`BoardList.tsx:46`) and to Load (`BoardDetail.tsx:168`). Change Delete's className to ``className={armed ? 'fw-btn danger armed' : 'fw-btn danger'}``.
- [ ] **Step 5: Run the matrix, `BoardDetail.browser.test.tsx`, `BoardList.browser.test.tsx` and `ViewPanel.browser.test.tsx`.** Expected: PASS.

  A test that looked a button up by `className === 'danger armed'` needs the new string, so update that assertion only. A test that asserted `disabled` on "add colour" still holds. The rule no longer dims disabled buttons, because WCAG does not require a contrast level for them and the `disabled` attribute already carries the state.
- [ ] **Step 6: `pnpm nx run lab:check`, then commit**

```bash
git add apps/lab/src/design/shell.css apps/lab/src/design/console.css apps/lab/src/design/library.css apps/lab/src/console/ViewPanel.tsx apps/lab/src/library/BoardList.tsx apps/lab/src/library/BoardDetail.tsx apps/lab/src/library/BoardDetail.browser.test.tsx apps/lab/src/routes/LayoutInvariants.browser.test.tsx
git commit -m "Dress the console's four plain buttons with one class"
```

---

### Task 5: The Signal plane — no text in or on `--signal`

**Files:**
- Modify: `apps/lab/src/design/tokens.css`, `tokens.test.ts`
- Modify: `apps/lab/src/design/shell.css` (`.fw-top` :81-122, `.fw .fw-go` :321-348, `.fw .fw-seg button[aria-checked]` :380-384, top-bar Signal block :391-415)
- Modify: `apps/lab/src/design/console.css` (:55-63 rail selected, :161 `.num`, :267 select, :429 number field)
- Modify: `apps/lab/src/design/run.css:222-229` (current preset chip)
- Modify: `apps/lab/src/design/palette.css:5-35` (⌘K trigger), `:79-82` (`.v`)
- Test: `tokens.test.ts`, `LayoutInvariants.browser.test.tsx`

**Interfaces:**
- Produces: tokens `--signal-fill` (#4c57be), `--signal-fill-hover` (#5561c8), `--signal-fill-press` (#434eb0). **Removed:** `--signal-hover`, `--signal-press`.

- [ ] **Step 1: Write the failing tests.** In `tokens.test.ts`, replace the list and title:

```ts
// The mock declares eighteen custom properties. Spec §7.1 kept sixteen; the
// Signal-plane decision (2026-09-22 spec §5) swaps `--signal-hover` and
// `--signal-press` for three fills that carry `--ink` text at AA.
test('tokens.css declares the seventeen tokens the spec keeps, in order', () => {
  expect(declared).toEqual([
    '--void',
    '--graphite',
    '--surface',
    '--border',
    '--border-strong',
    '--ash',
    '--mist',
    '--ink',
    '--paper',
    '--signal',
    '--signal-fill',
    '--signal-fill-hover',
    '--signal-fill-press',
    '--warn',
    '--error',
    '--ui',
    '--mono',
  ])
})
```

Remove every `// Signal` entry from `KNOWN_RED`.
- [ ] **Step 2: Run `tokens.test.ts` (node project) and the matrix.** Expected: both FAIL. The matrix's contrast findings name the top bar and the chosen chips, among others.
- [ ] **Step 3: Tokens.** In `tokens.css`, replace the two lines `--signal-hover` and `--signal-press` with:

```css
  /* Planes that carry text (spec 2026-09-22 §5): `--ink` on them is 5.31,
     4.61 and 6.13:1, where neither `--ink` (4.05) nor `--void` (4.08) clears
     AA on `--signal` itself. `--signal` stays for what carries no text. */
  --signal-fill: #4c57be;
  --signal-fill-hover: #5561c8;
  --signal-fill-press: #434eb0;
```

In the head comment, change "`--signal` carries state and data only" to "`--signal` carries state without text; a plane with text on it is `--signal-fill`".
- [ ] **Step 4: Apply the ruling rule by rule.**
  - `shell.css` `.fw-top`: `background: var(--signal-fill); color: var(--ink);`. Delete the `opacity` declarations from `.fw-top .sep`, `.fw-top .preset` and `.fw-top .dims`, and delete the rules left empty (`.sep`, `.preset`). Replace the long comment above `.preset` with `/* Full strength: the bar's dimming was what put .dims and .preset at 3.35:1 (review, spec §5). */`.
  - `shell.css` `.fw .fw-go`: `background: var(--signal-fill); color: var(--ink);`, hover `var(--signal-fill-hover)`, active `var(--signal-fill-press)`. Rewrite the comment's contrast sentence to: `leaving the button \`--ash\` on the fill`.
  - `shell.css` `.fw .fw-seg button[aria-checked='true']`: `color: var(--ink); background: var(--signal-fill);`
  - `shell.css` top-bar block: `.fw .fw-top .fw-seg button { border-color: var(--ink); color: var(--ink); }`, the hover `color: var(--ink)`, checked unchanged (`--void` background, `--ink` text), and `.fw .fw-top :focus-visible { outline-color: var(--ink); }`. Rewrite the comment: the unselected text is now `--ink` on `--signal-fill` (5.31:1).
  - `console.css` `.fw-rail button[aria-selected='true']`: `color: var(--ink); background: var(--signal-fill);`, and its `.n`: `color: var(--ink);`
  - `console.css` `.fw-k .num`, `.fw-k select` and `.fw-k input[type='number'].num`: `color: var(--ink);`
  - `run.css` `.fw .fw-presets button[aria-current='true']`: `color: var(--ink); background: var(--signal-fill);`
  - `palette.css` trigger: `border: 1px solid rgba(237, 238, 242, 0.4); color: var(--ink);`, hover `background: rgba(237, 238, 242, 0.12);`. In the comment, replace "`--void` at low alpha, because the bar is the Signal plane" with "`--ink` at low alpha, the bar's text colour".
  - `palette.css` `.fw-pal .row .v`: `color: var(--mist);`
  - Search for `--signal-hover` and `--signal-press` under `apps/lab/src`. Both must return nothing: `grep -rn "signal-hover\|signal-press" apps/lab/src`.
  - Search `grep -rn "color: var(--void)" apps/lab/src/design` and check each hit. `--void` text on `--error` (armed Delete, 4.90:1) and on `--signal-fill` must not remain. Anything else that sits on a light surface stays.
- [ ] **Step 5: Run `tokens.test.ts`, the matrix, `console.browser.test.tsx`, `BoardFrame.browser.test.tsx`, `ExportButtons.browser.test.tsx`, `ReportPanel.browser.test.tsx` and `Segmented.browser.test.tsx`.** Expected: PASS.

  If a contrast finding remains that §5 does not cover (for example a `--ash` label on `--surface`), **stop and report it**. Do not choose a colour for it.
- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/design/tokens.css apps/lab/src/design/tokens.test.ts apps/lab/src/design/shell.css apps/lab/src/design/console.css apps/lab/src/design/run.css apps/lab/src/design/palette.css apps/lab/src/routes/LayoutInvariants.browser.test.tsx
git commit -m "Put text on a darker Signal fill and take it out of Signal itself"
```

---

### Task 6: P4 — the edited marker moves to the top bar

**Files:**
- Modify: `apps/lab/src/shell/TopBar.tsx:45-52`, `apps/lab/src/shell/TopBar.browser.test.tsx`
- Modify: `apps/lab/src/run/PresetStrip.tsx:58`, `apps/lab/src/design/run.css:230-248`

- [ ] **Step 1: Change the test.** In `TopBar.browser.test.tsx`, replace the second case:

```tsx
  // The other branch: one knob off a preset and no preset spells the knobs,
  // so the bar says so where the name stood (spec R5). The preset strip used
  // to carry this word as a sticky chip that covered its last chips (review P4).
  it('says the values are edited, where the name stood, when no preset spells the knobs', async () => {
    const screen = await render(<TopBar />)
    await act(async () => useStore.getState().params.set('W', 26))
    await expect.element(screen.getByRole('banner')).toHaveTextContent('Arrowz/edited/26×50⌘KSimpleAdvancedPLEN')
  })
```

- [ ] **Step 2: Run it.** Expected: FAIL. The actual text is `Arrowz/26×50…`.
- [ ] **Step 3: Implement.** In `TopBar.tsx`, replace the conditional fragment:

```tsx
      <span className="sep">/</span>
      <span className={name === null ? 'preset edited' : 'preset'}>{name ?? dict.t('presetsDirty')}</span>
```

In `PresetStrip.tsx`, delete line 58. In `run.css`, delete the `.fw-presets .dirty` rule and its comment.
- [ ] **Step 4: Run `TopBar.browser.test.tsx`, `PresetStrip.browser.test.tsx` and the matrix.** Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/shell/TopBar.tsx apps/lab/src/shell/TopBar.browser.test.tsx apps/lab/src/run/PresetStrip.tsx apps/lab/src/design/run.css
git commit -m "Say edited in the top bar instead of over the last preset chips"
```

---

### Task 7: P3 — the report column grows with the window

**Files:**
- Modify: `apps/lab/src/design/shell.css:164-170`, `apps/lab/src/design/report.css:29-41`
- Test: `apps/lab/src/routes/LabLayout.browser.test.tsx`

- [ ] **Step 1: Write the failing test.** Append to `LabLayout.browser.test.tsx`:

```tsx
// Review P3: the report was a fixed 22rem at every width, so three of its
// first five rows wrapped at 2560px as at 1024. It keeps 22rem as a floor and
// grows to 24vw, up to 32rem.
test.each([
  [1280, 800, 352],
  [1920, 1080, 460.8],
  [2560, 1200, 512],
] as const)('at %d×%d the report column is %dpx wide', async (w, h, px) => {
  await page.viewport(w, h)
  const screen = await mountApp('advanced')
  await loadRunDone()
  expect(rect(screen.container, '.fw-report').width).toBeCloseTo(px, 0)
}, 40_000)
```

- [ ] **Step 2: Run it.** Expected: FAIL at 1920 and 2560, which read 352.
- [ ] **Step 3: Fix.** `shell.css` `.fw-stage`: `grid-template-columns: 70px minmax(0, 1fr) clamp(22rem, 24vw, 32rem);`. In `report.css`, add:

```css
/* The value sits against its delta rather than across the column from it
   (review P3): the delta column shrinks to its content, the value aligns to
   its right edge. */
.fw-report td.num {
  text-align: right;
}
.fw-report .fw-delta {
  width: 1%;
}
```

- [ ] **Step 4: Run `LabLayout.browser.test.tsx`, `ReportPanel.browser.test.tsx` and the matrix.** Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/design/shell.css apps/lab/src/design/report.css apps/lab/src/routes/LabLayout.browser.test.tsx
git commit -m "Let the report column grow with the window and keep deltas by their values"
```

---

### Task 8: P6 and P7 — the saved-boards face

**Files:**
- Modify: `apps/lab/src/design/library.css:70-82, 104-126`, `apps/lab/src/design/console.css:518-523`
- Modify: `apps/lab/src/console/Console.tsx:28-36`
- Test: `apps/lab/src/library/BoardDetail.browser.test.tsx`, `LayoutInvariants.browser.test.tsx`

- [ ] **Step 1: Write the failing tests.** In `BoardDetail.browser.test.tsx`, add a case modelled on `the detail keeps its buttons on screen while the list scrolls`, using the same mount, fixtures and `listed(...)` call, but with the frame height set to `'300px'`. Then assert:

```tsx
  // Review P6: the buttons were sticky over the scrolling detail and lay on
  // whatever scrolled under them. With explicit rows nothing needs to stick,
  // and nothing overlaps.
  const detail = screen.container.querySelector<HTMLElement>('.fw-lib-detail')
  const fields = screen.container.querySelector<HTMLElement>('.fw-lib-detail > .fw-grid')
  const cmd = screen.container.querySelector<HTMLElement>('.fw-cmdfig')
  if (detail === null || fields === null || cmd === null) throw new Error('the detail is missing a part')
  const b = buttons.getBoundingClientRect()
  expect(b.top).toBeGreaterThanOrEqual(fields.getBoundingClientRect().bottom - 0.5)
  expect(fields.getBoundingClientRect().top).toBeGreaterThanOrEqual(cmd.getBoundingClientRect().bottom - 0.5)
  expect(b.bottom).toBeLessThanOrEqual(detail.getBoundingClientRect().bottom + 0.5)
  expect(getComputedStyle(buttons).position).toBe('static')
```

In the matrix, add a second assertion to the `library-empty` state by adding this test after the matrix:

```tsx
// Review P7: an unreachable store left the chips' 168px track standing empty.
test('an unreachable store drops the saved-boards console to one column', async () => {
  await page.viewport(1280, 800)
  const screen = await arrange('library-empty')
  await expect.poll(() => useStore.getState().library.listError).not.toBeNull()
  const chips = screen.container.querySelector('.fw-lib-chips')
  const list = screen.container.querySelector('.fw-lib-list')
  const console_ = screen.container.querySelector('.fw-console')
  if (chips === null || list === null || console_ === null) throw new Error('library face missing')
  expect(chips.checkVisibility()).toBe(false)
  expect(list.getBoundingClientRect().width).toBeCloseTo(console_.getBoundingClientRect().width, 0)
}, 40_000)
```

- [ ] **Step 2: Run both files.** Expected: FAIL. `position` reads `sticky`, and the chips are visible.
- [ ] **Step 3: Fix the detail.** In `library.css`, give `.fw-lib-detail` the declaration `grid-template-rows: auto minmax(0, 1fr) auto;` and change its `overflow-y: auto` to `overflow: hidden`. Add this rule:

```css
/* The fields scroll, the command and the buttons stay (spec §2 P6). Ruling 16
   pinned the buttons with `sticky`, which kept them on screen and laid them
   over whatever scrolled beneath; explicit rows keep them on screen and over
   nothing. */
.fw-lib-detail > .fw-grid {
  min-height: 0;
  overflow-y: auto;
}
```

Reduce `.fw-lib-buttons` to `display: flex; gap: 8px; padding-top: 8px;` by dropping `position`, `bottom` and `background`, and update its comment to say the rows replaced the stickiness. Delete `border-radius: 5px;` from `.fw-lib-row`. The design system has zero radius except on the switch and the ready dot (`tokens.css` head).
- [ ] **Step 4: Fix the empty face.** In `Console.tsx`:

```tsx
  // Spec R10: no sizes to list — none yet, or no store to ask — and the chips'
  // track would stand empty beside one sentence (review P7).
  const emptyStore = useStore((state) =>
    state.library.sizes === null ? state.library.listError !== null : state.library.sizes.length === 0,
  )
```

and ``className={`fw-console${library ? ' library' : ''}${library && emptyStore ? ' empty' : ''}`}``. In `console.css`, after `.fw-console.library > .fw-run-col`:

```css
.fw-console.library.empty {
  grid-template-columns: minmax(0, 1fr);
}
.fw-console.library.empty > .fw-lib-chips {
  display: none;
}
```

It has specificity (0,3,0), so it outranks the ≤900px media rule's `.fw-console.library`.
- [ ] **Step 5: Run `BoardDetail.browser.test.tsx`, `BoardList.browser.test.tsx`, `SizeChips.browser.test.tsx` (if present), `Workspace.browser.test.tsx` and the matrix.** Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/design/library.css apps/lab/src/design/console.css apps/lab/src/console/Console.tsx apps/lab/src/library/BoardDetail.browser.test.tsx apps/lab/src/routes/LayoutInvariants.browser.test.tsx
git commit -m "Lay out the board detail in rows and drop the empty size rail"
```

---

### Task 9: P8 and P10 — a narrow top bar, and one dead declaration

**Files:**
- Modify: `apps/lab/src/design/shell.css` (`.fw-top` block, `.fw-board` :186-203)
- Test: `LayoutInvariants.browser.test.tsx`

- [ ] **Step 1: Remove every `// P8` entry from `KNOWN_RED`.** Run the matrix and expect it to FAIL at 420 with `scroll x`.
- [ ] **Step 2: Fix P8.** In `shell.css`, add `min-width: 0; overflow: hidden;` to `.fw-top`, and then:

```css
/* The bar gives way before the document does (spec R2: 420px is the narrowest
   width the lab supports). Review P8 measured the shell at 472px minimum —
   572 with a preset named — because every child of this flex row kept its
   width. The name of the preset goes first, then the gaps. */
.fw-top .name,
.fw-top .sep {
  flex: none;
}
.fw-top .preset,
.fw-top .dims {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (max-width: 560px) {
  .fw-top .preset,
  .fw-top .sep:has(+ .preset) {
    display: none;
  }
}
@media (max-width: 480px) {
  .fw-top,
  .fw-top .right {
    gap: 8px;
  }
  .fw-top {
    padding: 0 8px;
  }
}
```

- [ ] **Step 3: Run the matrix.** Expected: PASS. Then check by hand at 420×900 that nothing in `.fw-top .right` is clipped: in the failing case's `arrange`, `right` of the last `.fw-seg` ≤ `right` of `.fw-top`.

  If the language switch is clipped, **stop and report the measured overflow**. Do not hide a control.
- [ ] **Step 4: Fix P10.** Replace the `.fw-board` background declaration and its ten-line comment with:

```css
  /* The element paints its own letterbox (`:host`, arrowz-board.ts); the frame
     only shows through before it upgrades. */
  background: var(--paper);
```

- [ ] **Step 5: Run the matrix, `LabLayout.browser.test.tsx` and `BoardFrame.browser.test.tsx`.** Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/design/shell.css apps/lab/src/routes/LayoutInvariants.browser.test.tsx
git commit -m "Let the top bar give way at narrow widths and drop a dead background"
```

---

### Task 10: The knob grid — one rhythm, one axis (review changes 1–3, 5; P5)

**Files:**
- Modify: `apps/lab/src/design/console.css` (`.fw-k` :139-148, `.fw-k .num` :156, `.fw-k input` :178, `.fw-k .why` :187, `.fw-k select` :260-269, `.fw-khd` :356-374, `.fw-grid` :375-386, `.fw-simple .fw-grid + .fw-khd` :587)
- Test: create `apps/lab/src/design/knobgrid.browser.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { PARAM_SPEC } from '@arrowz/engine'
import { beforeEach, expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { KnobPanel } from '../console/KnobPanel'
import { useStore } from '../state/store'
import './tokens.css'
import './shell.css'
import './console.css'

beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.ui.setHelp(true)
})

const centre = (el: Element) => {
  const r = el.getBoundingClientRect()
  return r.top + r.height / 2
}

// Review P5: `.top` was flex on `baseline`, so a label wrapping to three lines
// kept its value beside the first. One grid, centred, keeps the pair together.
test('a knob value sits level with the middle of its label, however it wraps', async () => {
  await page.viewport(1024, 768)
  const screen = await render(
    <div className="fw" style={{ width: '520px' }}>
      <KnobPanel group="lengths" />
    </div>,
  )
  const tops = [...screen.container.querySelectorAll('.fw-k .top')]
  expect(tops.length).toBeGreaterThan(2)
  for (const top of tops) {
    const lab = top.querySelector('.lab')
    const num = top.querySelector('.num, select')
    if (lab === null || num === null) throw new Error('a knob without a label or a value')
    expect(Math.abs(centre(lab) - centre(num))).toBeLessThan(1)
  }
})

// Review change 3: every value ends on one axis per column.
test('values in one grid column end on one x', async () => {
  await page.viewport(1024, 768)
  const screen = await render(
    <div className="fw" style={{ width: '520px' }}>
      <KnobPanel group="lengths" />
    </div>,
  )
  const cards = [...screen.container.querySelectorAll<HTMLElement>('.fw-grid > .fw-k')]
  const left = Math.min(...cards.slice(0, 1).map((c) => c.getBoundingClientRect().left))
  const firstColumn = cards.filter((c) => Math.abs(c.getBoundingClientRect().left - left) < 1)
  const ends = firstColumn.map((c) => c.querySelector('.num, select')?.getBoundingClientRect().right ?? Number.NaN)
  expect(ends.length).toBeGreaterThan(1)
  for (const end of ends) expect(end).toBeCloseTo(ends[0] ?? Number.NaN, 0)
})

// Review change 1: 18px between rows of cards, from one declaration.
test('rows of cards are 18px apart', async () => {
  await page.viewport(1024, 768)
  const screen = await render(
    <div className="fw" style={{ width: '520px' }}>
      <KnobPanel group="lengths" />
    </div>,
  )
  const grid = screen.container.querySelector('.fw-grid')
  if (grid === null) throw new Error('no grid')
  expect(getComputedStyle(grid).rowGap).toBe('18px')
  expect(PARAM_SPEC.filter((s) => s.group === 'lengths').length).toBeGreaterThan(2)
})
```

`Math.min(...cards.slice(0, 1)…)` spreads a one-element array. That is safe; the CLAUDE.md rule is about arrays proportional to cells or pieces.

- [ ] **Step 2: Run it.** Expected: FAIL on the centring (baseline) and on the 0px row gap.
- [ ] **Step 3: Fix.** Edit the rules in place. Do not append an overlay.

```css
.fw-k {
  min-width: 0;
}
/* One regime for both shapes of card (review changes 2 and 3): a label column
   and a control column whose floor is the 88px number box, centred, so a
   wrapped label keeps its value beside its middle (P5) and every control in a
   grid column ends on one x. */
.fw-k .top,
.fw-k .row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(88px, auto);
  align-items: center;
  gap: 12px;
}
```

- `.fw-k .num`: drop `flex: none`, add `justify-self: end;`.
- `.fw-k button.num` (new, after `.fw-k button.num:hover`): `width: 88px; text-align: right;`.
- `.fw-k input`: `width: 88px;`.
- `.fw-k input[type='number'].num`: `width: 88px; justify-self: end;`.
- `.fw-k .why`: `margin: 6px 0 0;`.
- `.fw-k select`: replace `flex: none; max-width: 50%;` with `justify-self: end; width: auto; min-width: 88px; max-width: 100%;`.
- `.fw-grid`: `gap: 18px 24px; align-items: start;` (keep `align-content: start`).
- `.fw-khd`: `display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; padding-bottom: 8px; margin-bottom: 12px;` (keep the border). Add `max-width: 74ch;` to `.fw-khd span`.
- Replace `.fw-simple .fw-grid + .fw-khd { margin-top: 18px; }` with `.fw-knobs .fw-grid + .fw-khd { margin-top: 28px; }`, using the comment `/* 12 in a card, 18 between cards, 28 between sections (review change 1). */`.
- `.fw-sw` keeps its own `justify-self: end`.
- `.fw-colour-cell`: add `justify-self: end;`. `ColorField` puts this span, not an input, in the control column.

- [ ] **Step 4: Run the new file, `KnobPanel`, `ValueKnob`, `ChoiceKnob`, `StartKnob`, `ViewPanel`, `SimplePanel`, `console.browser.test.tsx`, `LabLayout` and the matrix.** Expected: PASS.

  `LabLayout`'s knob-row case measures `.fw-console .fw-k .top`, which is still present.
- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/design/console.css apps/lab/src/design/knobgrid.browser.test.tsx
git commit -m "Give knob cards one rhythm and one control axis"
```

---

### Task 11: Descriptions move from the cards to the panel heading (R7)

**Files:**
- Create: `apps/lab/src/console/FieldHelp.tsx`
- Modify: `apps/lab/src/console/KnobPanel.tsx`, `ValueKnob.tsx`, `ChoiceKnob.tsx`, `StartKnob.tsx`
- Modify: `apps/lab/src/design/console.css` (`.fw-kdesc`, `.fw-k .why:empty`)
- Test: `KnobPanel.browser.test.tsx`, `ValueKnob.browser.test.tsx`, `ChoiceKnob.browser.test.tsx`, `StartKnob.browser.test.tsx`

**Interfaces:**
- Produces: `interface HelpEntry { id: string; label: string; text: string }`, `function FieldHelp({ entries, hidden }: { entries: readonly HelpEntry[]; hidden?: boolean | undefined }): ReactElement | null`, `function descId(key: string): string` (returns `` `knob-${key}-desc` ``). From `StartKnob.tsx`: `export const MIX_SPEC`.

- [ ] **Step 1: Rewrite the tests that pin the old place.** In `KnobPanel.browser.test.tsx`, inside `describe('the help switch')`:
  - `keeps the description in the accessibility tree when it is off`: change `#knob-W-why` to `#knob-W-desc`.
  - Replace `keeps a violation visible with the descriptions off` with:

```tsx
  // Ruling 9 of 2026-09-13 survives the move (spec R7): turning descriptions
  // off never takes the reason a run is refused off with them, and the card's
  // paragraph now holds the reason alone.
  it('keeps a violation in the card, visible, with the descriptions off', async () => {
    useStore.getState().ui.setHelp(false)
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    const screen = await render(<KnobPanel group="lengths" />)
    const why = screen.getByTestId('knob-wShort-why')
    await expect.element(why).toBeVisible()
    const violation = useStore.getState().params.violations[0]
    if (violation === undefined) throw new Error('expected a violation')
    await expect.element(why.getByText(EN.violation(violation))).toBeVisible()
    expect(why.element().querySelector('.desc')).toBeNull()
  })

  it('lists each knob description once, under the heading, named by its knob', async () => {
    const screen = await render(<KnobPanel group="board" />)
    const list = screen.container.querySelector('.fw-khd .fw-kdesc')
    if (list === null) throw new Error('no description list under the heading')
    expect(list.querySelector('#knob-W-desc')?.textContent).toBe(helpFor('W'))
    expect(screen.container.querySelectorAll('.fw-k .desc')).toHaveLength(0)
  })

  it('points each control at its reason and its description', async () => {
    const screen = await render(<KnobPanel group="board" />)
    await expect.element(screen.getByRole('slider', { name: /width/i })).toHaveAttribute(
      'aria-describedby',
      'knob-W-why knob-W-desc',
    )
  })
```

  If `name: /width/i` matches more than one slider, use the label `PARAM_SPEC` gives `W` (read it with `EN.paramText(spec).label`) and `{ exact: true }`.
  - In `ValueKnob.browser.test.tsx`, change the three `aria-describedby` expectations (`:140`, `:163`, `:165`) to `'knob-wShort-why knob-wShort-desc'` and `'knob-giantSpan-why knob-giantSpan-desc'`. In `ChoiceKnob.browser.test.tsx:63`, change to `'knob-trapBias-why knob-trapBias-desc'`. `StartKnob`: its select points at `knob-start-desc` alone, so update any expectation that reads `knob-start-why`.
- [ ] **Step 2: Run the four files.** Expected: FAIL. The `.fw-kdesc` list is missing and the attributes still hold the old value.
- [ ] **Step 3: Create `FieldHelp.tsx`**

```tsx
import type { ReactElement } from 'react'

/** One control's description, as the panel heading lists it (spec R7). */
export interface HelpEntry {
  /** The id controls name in `aria-describedby`. */
  id: string
  label: string
  text: string
}

/** The id a knob's description carries, for every knob shape alike. */
export function descId(key: string): string {
  return `knob-${key}-desc`
}

/**
 * The descriptions of a panel's controls, under its heading rather than in
 * each card: in the cards the longest paragraph set the height of its whole
 * row (review, knob layout). `hidden` hides them from the eye only — `.fw-vh`,
 * never `display: none` — so every `aria-describedby` still resolves (Ruling 9
 * of 2026-09-13-lab-run-triggers).
 */
export function FieldHelp({
  entries,
  hidden = false,
}: {
  entries: readonly HelpEntry[]
  hidden?: boolean | undefined
}): ReactElement | null {
  if (entries.length === 0) return null
  return (
    <dl className={hidden ? 'fw-kdesc fw-vh' : 'fw-kdesc'}>
      {entries.map((entry) => (
        <div key={entry.id}>
          <dt>{entry.label}</dt>
          <dd id={entry.id}>{entry.text}</dd>
        </div>
      ))}
    </dl>
  )
}
```

- [ ] **Step 4: The cards.**
  - `ValueKnob.tsx`: delete the `showHelp` subscription. Pass ``describedBy={`${whyId} ${descId(spec.key)}`}`` to both `DraftNumber` and `KnobSlider`. The paragraph becomes:

```tsx
      <p className="why" id={whyId} data-testid={whyId}>
        {state === null ? null : <span className="state">{state}</span>}
      </p>
```

  Rewrite the comment above `whyId` so it says the description lives in the panel heading (`FieldHelp`) and this paragraph holds only the state, which the help switch never hides.
  - `ChoiceKnob.tsx`: the same, with ``aria-describedby={`${whyId} ${descId(spec.key)}`}`` on the select.
  - `StartKnob.tsx`: export `MIX_SPEC`, delete the `showHelp` subscription and the `why` paragraph, and set `aria-describedby={descId('start')}` on the select.
- [ ] **Step 5: The heading.** In `KnobPanel.tsx`:

```tsx
  const mixing = useStore((state) => startChoiceOf(state.params.values) === 'mixing')
  // One entry per control drawn below, in the same order; the start pair is
  // one control, and the share joins it only while it is on screen.
  const entries: HelpEntry[] = specs.flatMap((spec, at) => {
    if (spec.surface !== 'start') {
      const text = dict.paramText(spec)
      return [{ id: descId(spec.key), label: text.label, text: text.help }]
    }
    if (at !== firstStart) return []
    const start = { id: descId('start'), label: dict.d.start.label, text: dict.d.start.help }
    if (!mixing) return [start]
    const mix = dict.paramText(MIX_SPEC)
    return [start, { id: descId('mix'), label: mix.label, text: mix.help }]
  })
```

Render `<FieldHelp entries={entries} hidden={!showHelp} />` as the last child of `.fw-khd`. Import `startChoiceOf` from `@arrowz/engine/command`, and `MIX_SPEC` from `./StartKnob`.
- [ ] **Step 6: CSS.** In `console.css`, **before** `.fw-vh`, add:

```css
/* A panel's control descriptions, under its heading (spec R7): the control's
   name, then what it does. */
.fw-kdesc {
  display: grid;
  grid-template-columns: minmax(0, 16em) minmax(0, 1fr);
  gap: 2px 16px;
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
}
.fw-kdesc > div {
  display: contents;
}
.fw-kdesc dt {
  color: var(--mist);
}
.fw-kdesc dd {
  margin: 0;
  color: var(--ash);
}
```

Replace `.fw-k .why:not(:has(> :not(.fw-vh))) { margin: 0; }` with `.fw-k .why:empty { margin: 0; }` and the comment `/* A card with nothing wrong reserves no line. */`.
- [ ] **Step 7: Run the four files, `knobgrid.browser.test.tsx`, `console.browser.test.tsx`, `palette/*.browser.test.tsx` (the palette flashes knobs by id) and the matrix.** Expected: PASS. The matrix's `describedby` invariant now also covers the new ids.
- [ ] **Step 8: `pnpm nx run lab:check`, then commit**

```bash
git add apps/lab/src/console/FieldHelp.tsx apps/lab/src/console/KnobPanel.tsx apps/lab/src/console/ValueKnob.tsx apps/lab/src/console/ChoiceKnob.tsx apps/lab/src/console/StartKnob.tsx apps/lab/src/console/KnobPanel.browser.test.tsx apps/lab/src/console/ValueKnob.browser.test.tsx apps/lab/src/console/ChoiceKnob.browser.test.tsx apps/lab/src/console/StartKnob.browser.test.tsx apps/lab/src/design/console.css
git commit -m "List knob descriptions under the panel heading, not inside each card"
```

---

### Task 12: The preview in four sections (R8; review changes 5–8)

**Files:**
- Modify: `packages/engine/lab-i18n.ts` (EN `ui` after `preview`, PL `ui` after `preview`), `packages/engine/lab-i18n.test.ts`
- Modify: `apps/lab/src/console/viewFields.ts`, `apps/lab/src/console/ViewPanel.tsx`, `apps/lab/src/simple/SimplePanel.tsx`
- Modify: `apps/lab/src/design/console.css`
- Test: `apps/lab/src/console/ViewPanel.browser.test.tsx`, `SimplePanel.browser.test.tsx`

**Interfaces:**
- Consumes: `FieldHelp`, `HelpEntry` (Task 11).
- Produces: UiKeys `previewGeometry`, `previewDrawing`, `previewPoints`, `previewColours`. From `viewFields.ts`: `export type PlainUiKey`, `export const DRAWING_FLAGS` (rounded, colored, hilite, voids), `export function viewHelpEntries(fields: readonly ViewField[], t: (key: PlainUiKey) => string): HelpEntry[]`. From `ViewPanel.tsx`: `ViewFlagSwitch` gains `bare?: boolean | undefined`. `ColoursCard` replaces `PaletteEditor`.

- [ ] **Step 1: Dictionary test.** Append to `packages/engine/lab-i18n.test.ts`:

```ts
// The preview's four section titles (2026-09-22 spec R8).
Deno.test('both ui dictionaries carry the preview section titles', () => {
  for (const d of [EN, PL]) {
    for (const k of ['previewGeometry', 'previewDrawing', 'previewPoints', 'previewColours'] as const) {
      assertEquals(typeof d.ui[k], 'string', k)
      assert(d.ui[k].length > 0, k)
    }
  }
})
```

Use the names this file already imports for the two dictionaries and the asserts. Read its head first; the palette plan's test used `EN`, `PL`, `assert` and `assertEquals`.

Run `cd packages/engine && deno test --allow-read lab-i18n.test.ts`. Expected: FAIL (type error: not a `UiKey`).
- [ ] **Step 2: Dictionary.** In EN `ui`, after `preview: 'Preview',`:

```ts
    // The preview's sections (2026-09-22 spec R8); the heading prints them in caps.
    previewGeometry: 'geometry',
    previewDrawing: 'drawing',
    previewPoints: 'points',
    previewColours: 'colours',
```

In PL `ui`, after `preview: 'Podgląd',`:

```ts
    previewGeometry: 'geometria',
    previewDrawing: 'rysunek',
    previewPoints: 'punkty',
    previewColours: 'kolory',
```

Run the Deno test (PASS), then `pnpm nx build engine`.
- [ ] **Step 3: Write the failing lab tests.** In `ViewPanel.browser.test.tsx`, add the following. The file's existing `beforeEach` and render helper stay; import `'../design/console.css'` only if the file does not already.

```tsx
// Spec R8: four sections instead of one grid of fourteen cards.
test('the preview is four titled sections, in order', async () => {
  const screen = await render(<ViewPanel />)
  const titles = [...screen.container.querySelectorAll('.fw-khd b')].map((b) => b.textContent)
  expect(titles).toEqual(['geometry', 'drawing', 'points', 'colours'])
})

test('no card sits inside another card', async () => {
  useStore.getState().view.addPaletteColor()
  const screen = await render(<ViewPanel />)
  expect(screen.container.querySelectorAll('.fw-k .fw-k')).toHaveLength(0)
})

test('the four drawing flags are one card, the point grid is with the points', async () => {
  const screen = await render(<ViewPanel />)
  const flags = screen.container.querySelector('.fw-k.fw-flags')
  expect(flags?.querySelectorAll('[role="switch"]')).toHaveLength(4)
  expect(flags?.querySelector('#view-showPoints')).toBeNull()
})

test('the colours card holds the theme, both surface colours and the palette', async () => {
  const screen = await render(<ViewPanel />)
  const card = screen.container.querySelector('.fw-k.fw-colours')
  if (card === null) throw new Error('no colours card')
  for (const id of ['#view-theme', '#view-paper', '#view-ink']) expect(card.querySelector(id)).not.toBeNull()
  expect(card.querySelector('button.fw-btn')?.getAttribute('aria-describedby')).toBe('view-palette-help')
})

test('a field with help points at it under its section heading', async () => {
  const screen = await render(<ViewPanel />)
  const cell = screen.container.querySelector('#view-cell')
  expect(cell?.getAttribute('aria-describedby')).toBe('view-cell-help')
  expect(screen.container.querySelector('.fw-khd #view-cell-help')?.textContent).toBe(EN.t('cellHelp'))
  expect(screen.container.querySelectorAll('.fw-k .why')).toHaveLength(0)
})
```

`EN` here is `dictionary('en')` from `@arrowz/engine/i18n`. Add the import if the file lacks it. Clear the palette colour in the file's reset the way that file already does.

In `SimplePanel.browser.test.tsx`, add:

```tsx
test('head height points at its help under the preview heading', async () => {
  const screen = await render(/* the file's existing SimplePanel mount */)
  expect(screen.container.querySelector('#view-headHeight')?.getAttribute('aria-describedby')).toBe('view-headHeight-help')
  expect(document.getElementById('view-headHeight-help')).not.toBeNull()
})
```

Use the file's existing mount expression in place of the comment.

Run both files. Expected: FAIL.
- [ ] **Step 4: `viewFields.ts`.** Export `PlainUiKey`. Add:

```ts
/** The drawing flags, one card in the preview (spec R8); `showPoints` belongs to the points. */
export const DRAWING_FLAGS = VIEW_FLAGS.filter(({ flag }) => flag !== 'showPoints')

/** The heading's entries for the fields that have help (spec R7). */
export function viewHelpEntries(fields: readonly ViewField[], t: (key: PlainUiKey) => string): HelpEntry[] {
  return fields.flatMap((field) =>
    field.help === undefined ? [] : [{ id: `view-${field.field}-help`, label: t(field.label), text: t(field.help) }],
  )
}
```

and `import type { HelpEntry } from './FieldHelp'`.
- [ ] **Step 5: `ViewPanel.tsx`.**
  - `ViewNumberField`: delete the `<p className="why">` line. On the input, add ``aria-describedby={field.help === undefined ? undefined : `view-${field.field}-help`}``.
  - `ViewFlagSwitch`: add `bare?: boolean | undefined`. When `bare` is set, return the `.row` element alone, without the `.fw-k` wrapper.
  - Split `ColorField` into `ColorCell` (the `.fw-colour-cell` span, same props) and `ColorField` (card + row + label + `ColorCell`, unchanged output). Add `ColorRow` (fragment: `label.lab` + `div.val` > `ColorCell`) for the colours card.
  - Replace `PaletteEditor` with `ColoursCard`. It uses the same store subscriptions and rewrites its JSDoc: console-only, the cap lives in the store. It renders:

```tsx
    <div className="fw-k fw-colours">
      <label className="lab" htmlFor="view-theme">
        {dict.t('themeLabel')}
      </label>
      <div className="val">
        <select id="view-theme" value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="">{dict.t('themeNone')}</option>
          {Object.keys(THEMES).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <ThemeSwatchStrip themeName={theme} />
      </div>
      <ColorRow
        id="view-paper"
        label={dict.t('paperLabel')}
        value={paper === '' ? DEFAULT_VIEW.paper : paper}
        onChange={setPaper}
        {...(paper === '' ? {} : { onClear: () => setPaper(''), clearLabel: dict.t('paperClear') })}
      />
      <ColorRow
        id="view-ink"
        label={dict.t('inkLabel')}
        value={ink === '' ? DEFAULT_VIEW.ink : ink}
        onChange={setInk}
        {...(ink === '' ? {} : { onClear: () => setInk(''), clearLabel: dict.t('inkClear') })}
      />
      <span className="lab" id="view-palette-label">
        {dict.t('paletteLabel')}
      </span>
      <div className="val">
        {palette.length === 0 ? null : (
          <ul className="fw-palette-list" aria-labelledby="view-palette-label">
            {/* the existing <li> rows, unchanged */}
          </ul>
        )}
        <button
          type="button"
          className="fw-btn"
          onClick={addPaletteColor}
          disabled={palette.length >= PALETTE_CAP}
          aria-describedby="view-palette-help"
        >
          {dict.t('paletteAdd')}
        </button>
      </div>
    </div>
```

  Carry the palette `<li>` rows over verbatim from `PaletteEditor`. Keep the "Finding 9" comment on the button.
  - `ViewPanel` body: four heading + grid pairs, each grid a `role="group"` labelled by its heading's `<b id>`:

```tsx
    <div className="fw-knobs" role="tabpanel" id={panelId('preview')} aria-labelledby={tabId('preview')}>
      <div className="fw-khd">
        <b id="view-sec-geometry">{dict.t('previewGeometry')}</b>
        <FieldHelp entries={viewHelpEntries(VIEW_FIELDS, (key) => dict.t(key))} />
      </div>
      <div className="fw-grid" role="group" aria-labelledby="view-sec-geometry">
        {/* VIEW_FIELDS.map(ViewNumberField), unchanged */}
      </div>
      <div className="fw-khd">
        <b id="view-sec-drawing">{dict.t('previewDrawing')}</b>
      </div>
      <div className="fw-grid" role="group" aria-labelledby="view-sec-drawing">
        <div className="fw-k fw-flags">
          {DRAWING_FLAGS.map(({ flag, label }) => (
            <ViewFlagSwitch key={flag} bare flag={flag} label={label} on={view[flag]} onToggle={() => view.toggle(flag)} />
          ))}
        </div>
      </div>
      <div className="fw-khd">
        <b id="view-sec-points">{dict.t('previewPoints')}</b>
        <FieldHelp
          entries={[{ id: 'view-point-radius-help', label: dict.t('pointRadiusLabel'), text: dict.t('pointRadiusHelp') }]}
        />
      </div>
      <div className="fw-grid" role="group" aria-labelledby="view-sec-points">
        <ViewFlagSwitch flag="showPoints" label="showPoints" on={view.showPoints} onToggle={() => view.toggle('showPoints')} />
        {/* the point-colour ColorField and the point-radius card, unchanged, except:
            the radius card loses its <p className="why"> and its input gains
            aria-describedby="view-point-radius-help" */}
      </div>
      <div className="fw-khd">
        <b id="view-sec-colours">{dict.t('previewColours')}</b>
        <FieldHelp
          entries={[{ id: 'view-palette-help', label: dict.t('paletteLabel'), text: dict.t('paletteHelp', PALETTE_CAP) }]}
        />
      </div>
      <div className="fw-grid" role="group" aria-labelledby="view-sec-colours">
        <ColoursCard />
      </div>
    </div>
```

  If `(key) => dict.t(key)` does not type-check because `dict.t` is overloaded over formatter keys, type the lambda parameter as `PlainUiKey` explicitly. Update the stale JSDoc "the eleven preview fields".
- [ ] **Step 6: `SimplePanel.tsx`.** Add `<FieldHelp entries={viewHelpEntries(fields, (key) => dict.t(key))} />` as the last child of the preview `.fw-khd` (the second heading).
- [ ] **Step 7: CSS.** In `console.css`, after the palette rules:

```css
/* The four drawing flags as one card (review change 6). */
.fw-k.fw-flags {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 12px 24px;
}
/* The colours card (review change 7): five colour objects sat on five
   different x in four cards. One card, a label column and a control column,
   everything starting on one x and growing right. */
.fw-k.fw-colours {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: center;
  gap: 12px 24px;
}
.fw-k.fw-colours > .val {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
}
.fw-k.fw-colours .fw-swatches,
.fw-k.fw-colours .fw-palette-list {
  margin: 0;
}
.fw-k.fw-colours select {
  justify-self: start;
}
/* Outside the colours card (the simple view) the strip belongs to the select
   above it, on its right edge. */
.fw-k .fw-swatches {
  width: max-content;
  margin-left: auto;
}
/* The remove cross weighed as much as the swatch it removes (review change 8):
   no border, `--ash`, until hover or focus makes it a button. */
.fw .fw-palette-row .fw-palette-remove {
  border-color: transparent;
  color: var(--ash);
}
.fw .fw-palette-row:hover .fw-palette-remove,
.fw .fw-palette-row .fw-palette-remove:focus-visible {
  border-color: var(--border);
  color: var(--mist);
}
.fw .fw-palette-remove {
  width: 22px;
  height: 22px;
}
```

Check that `.fw .fw-palette-remove { width: 22px; height: 22px }` does not stand next to Task 4's `.fw .fw-palette-remove` rule as a duplicate. Merge the sizes into that rule instead.
- [ ] **Step 8: Run `ViewPanel`, `SimplePanel`, `BoardDetail`, `knobgrid`, the `palette/` tests, `useUrlHash.browser.test.tsx` (it drives palette and theme through the DOM) and the matrix.** Expected: PASS.

  Tests that referenced `PaletteEditor` by name, or found the theme select inside a plain `.fw-k .row`, pinned the old structure. Update their lookups and keep what they assert about behaviour.
- [ ] **Step 9: `pnpm nx run lab:check` and `pnpm nx run lab:lint`, then commit**

```bash
git add packages/engine/lab-i18n.ts packages/engine/lab-i18n.test.ts apps/lab/src/console/viewFields.ts apps/lab/src/console/ViewPanel.tsx apps/lab/src/console/ViewPanel.browser.test.tsx apps/lab/src/simple/SimplePanel.tsx apps/lab/src/simple/SimplePanel.browser.test.tsx apps/lab/src/design/console.css
git commit -m "Split the preview into geometry, drawing, points and colours"
```

Add to the `git add` line any other test file Step 8 made you touch, by its exact path.

---

### Task 13: Touch targets (spec §6)

**Files:**
- Modify: `apps/lab/src/design/console.css` (the coarse block at :436-456), `library.css`, `docs.css`
- Test: create `apps/lab/src/design/touch.browser.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import './tokens.css'
import './shell.css'
import './console.css'
import './library.css'
import './run.css'
import './docs.css'

// Spec §6 / §7.2: 44px where there is no hover. The runner cannot emulate a
// coarse pointer, so this asks the cascade instead: of the rules inside
// `(pointer: coarse)` that *match* each element, the tallest height or
// min-height it declares. Matching elements rather than selector strings keeps
// the test indifferent to how a rule is spelled.
function coarseHeight(el: Element): number {
  let best = 0
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (!(rule instanceof CSSMediaRule) || !rule.conditionText.includes('pointer: coarse')) continue
      for (const inner of rule.cssRules) {
        if (!(inner instanceof CSSStyleRule)) continue
        let hit = false
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

test.each([
  ['a knob value', '<div class="fw-k"><div class="top"><button class="num">1</button></div></div>', 'button', 44],
  ['a knob choice', '<div class="fw-k"><div class="top"><select></select></div></div>', 'select', 44],
  ['a palette remove', '<ul><li class="fw-palette-row"><button class="fw-palette-remove">x</button></li></ul>', 'button', 44],
  ['a switch', '<button class="fw-sw" role="switch"></button>', 'button', 32],
  ['a size chip', '<div class="fw-lib-chips"><button>8x8</button></div>', 'button', 44],
  ['a board row', '<button class="fw-lib-row">row</button>', 'button', 44],
  ['a plain button', '<button class="fw-btn">Refresh</button>', 'button', 44],
  ['a docs link', '<nav class="fw-docs-nav"><a href="#">CLI</a></nav>', 'a', 44],
] as const)('%s is raised for a finger', async (_, html, tag, px) => {
  const screen = await render(<div className="fw" dangerouslySetInnerHTML={{ __html: html }} />)
  const el = screen.container.querySelector(tag)
  if (el === null) throw new Error(`no ${tag}`)
  expect(coarseHeight(el)).toBeGreaterThanOrEqual(px)
})
```

- [ ] **Step 2: Run it.** Expected: FAIL for the value and the choice (32), the palette remove, the switch, the chip, the row and the docs link (0). The plain button passes (Task 4).
- [ ] **Step 3: Fix.**
  - `console.css`, inside the existing coarse block: change `.fw-k .num, .fw-k select { min-height: 32px }` to `44px`, and add:

```css
  .fw .fw-palette-remove {
    width: 44px;
    height: 44px;
  }
  /* 32px and not 44: the row the switch sits in is the target (run.css keeps
     the same reasoning for its own switches); this lifts the track itself. */
  .fw-sw {
    height: 32px;
    width: 52px;
  }
  .fw-sw::after {
    width: 26px;
    height: 26px;
  }
  .fw-sw[aria-checked='true']::after {
    transform: translateX(20px);
  }
```

  - `library.css`, at the end:

```css
/* §7.2: the saved-boards face had no coarse rule at all (review, touch). */
@media (pointer: coarse) {
  .fw .fw-lib-chips button,
  .fw-lib-row {
    min-height: 44px;
  }
}
```

  - `docs.css`, after `.fw-docs-nav a[aria-current='page']`:

```css
@media (pointer: coarse) {
  .fw-docs-nav a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
  }
}
```

  - `run.css:103-105`: the comment that defers the switches "to one PR about all six" now points here. Change it to: `The track is raised in console.css's coarse block (2026-09-22 spec §6); the row still carries the rest of the 44px.`
- [ ] **Step 4: Run it, then the matrix.** Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/design/touch.browser.test.tsx apps/lab/src/design/console.css apps/lab/src/design/library.css apps/lab/src/design/docs.css apps/lab/src/design/run.css
git commit -m "Raise the remaining controls to touch size on a coarse pointer"
```

---

### Task 14: Gates, a live pass, and the hand-off

- [ ] **Step 1: `KNOWN_RED` must be empty.** Delete the constant's remaining comment example, keep the object literal `{}` with a one-line comment saying later regressions are listed there with a defect id, and run the matrix. Expected: PASS, 35 cases.
- [ ] **Step 2: Both gates, uncached.** Run `deno task verify` in `packages/engine`, and `pnpm nx run-many -t verify --skip-nx-cache` at the root. Expected: both green. Paste the summaries into the report.
- [ ] **Step 3: Live pass in Chrome** (memory `arrowz-przepisy-pomiarowe`: `deno task store` and `pnpm nx serve lab`, port 8779). At 1280×800 and 1024×768 check:
  - Preview with eight palette colours: no document scrollbar.
  - Two violations plus the clamp notice: the board is whole.
  - The edited marker appears in the top bar after a knob move.
  - The report's deltas sit beside their values.
  - The saved-boards face with the store stopped shows one column.
  - The top bar at 420px wide.
  - The preview's four sections, with no card inside a card.

  Take one screenshot per check, and leave `labView`/`labLang` in localStorage as `advanced`/`en`.
- [ ] **Step 4: Stop.** Report to the user in Polish: what changed, the gate outputs, and the live-pass findings. Opening the PR and pushing need the user's go-ahead.
