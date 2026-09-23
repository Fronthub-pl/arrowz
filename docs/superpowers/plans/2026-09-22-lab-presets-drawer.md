# Lab preset picker, report drawer and run column — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry the design handoff's five lab changes into `apps/lab`: a preset picker in place of the 26-chip strip, the report as a drawer over the board, a wider run column with a command that wraps between flags and a mono Generate, a filled hover in the top bar, and thin scrollbars.

**Architecture:** React 19 components in `apps/lab/src`, one stylesheet per surface in `apps/lab/src/design/`, state in the zustand store's slices (`apps/lab/src/state/`), strings in `packages/engine/lab-i18n.ts` (read by the lab from `packages/engine/dist`). Every layout claim is pinned by the invariant matrix `routes/LayoutInvariants.browser.test.tsx` (5 window sizes) or by a geometry case in `routes/LabLayout.browser.test.tsx`.

**Tech Stack:** React 19, zustand, react-router 8, Vitest 5 browser mode (Playwright Chromium), Deno 2.9 for the engine, Nx + pnpm.

**Spec:** `docs/superpowers/specs/2026-09-22-lab-presets-drawer-design.md` — read it before your task. Where this plan and the spec disagree, stop and report; do not pick one.

## Global Constraints

- Everything written into the repository is English: code, comments, tests, commit messages. Polish appears only in `PL` of `packages/engine/lab-i18n.ts`.
- Every visible string lives in the dictionary, English in `EN`, Polish in `PL` (`PL: Translation` makes a missing key a type error).
- No `any`, no non-null assertions (`!`). No `Math.min(...arr)` over arrays sized by cells or pieces.
- No attribution lines in commit messages.
- The lab reads the engine from `packages/engine/dist`: after touching `packages/engine`, run `pnpm nx build engine` before running lab tests by hand (harness fact 4: the symptom is an old value, not a missing key).
- Before lab tests in a fresh worktree: `pnpm nx build engine && pnpm nx build board-element`.
- Run one lab test file: `pnpm --dir apps/lab exec vitest run --project chromium <path relative to apps/lab>`; a node-project file: `--project node`. Type check: `pnpm nx run lab:check`. Lint: `pnpm nx run lab:lint`. `vitest run` does not type-check, so every task ends with `lab:check` too.
- The browser test project loads **no stylesheet** unless the test file imports it (harness fact 38). Geometry and computed-style tests import the sheets they measure, in `main.tsx` order: `tokens, shell, console, library, run, report, docs, palette`.
- `page.viewport(w, h)` outlives the case that sets it (harness fact 18): every geometry case sets its own.
- `getByText`/`getByRole` names match exactly and case-sensitively unless `{ exact: false }` or a RegExp is given (harness facts 3, 33). `toHaveTextContent` is exact equality; use `toMatchTextContent` for a fragment.
- Reset state in `beforeEach` through `useStore.setState` or the helpers in `harness/mountApp.tsx`, never through the action a test is about (harness fact 40).
- Whole-app cases pass their own timeout (`40_000`); the chromium project has none (harness fact 26).
- `jsx-a11y/no-autofocus`: focus with a ref in an effect. `react-hooks/immutability`: no `let` mutated inside `.map()` in JSX.
- Commit after every task, by path (`git add <paths>`), never `git add -A`: the working tree carries unrelated changes (`.claude/settings.json`, `skills-lock.json`, `.agents/`).

## File map

| File | Change |
|---|---|
| `packages/engine/lab-i18n.ts` | new keys `preset`, `customSettings`, `editedSinceLastPreset`, `reportHandle`, `cmdHintReport`; `presetsDirty` removed (Task 5) |
| `apps/lab/src/run/CommandText.tsx` | **new**: renders a command as prefix + one `span.ln` per flag |
| `apps/lab/src/run/LiveCommand.tsx`, `apps/lab/src/library/BoardDetail.tsx` | render through `CommandText` |
| `apps/lab/src/run/PresetStrip.tsx` | rewritten: trigger + panel |
| `apps/lab/src/shell/TopBar.tsx` | preset name and "edited" removed |
| `apps/lab/src/state/ui.slice.ts`, `apps/lab/src/harness/mountApp.tsx` | `report` state, remembered |
| `apps/lab/src/stage/Stage.tsx`, `apps/lab/src/report/ReportPanel.tsx` | drawer + handle, `REPORT_ID` |
| `apps/lab/src/App.tsx` | `useReportKey` |
| `apps/lab/src/palette/CommandPalette.tsx` | footer hint `R` |
| `apps/lab/src/design/run.css` | `.fw-cmd`, `.fw-cmdfig`, `.fw-presets` / `.fw-pp-*` |
| `apps/lab/src/design/shell.css` | `.fw-stage`, `.fw-drawer*`, `.fw .fw-go`, top-bar P8 rules, segmented hover, scrollbars |
| `apps/lab/src/design/console.css` | third console track, solo hides the drawer |
| `apps/lab/src/design/palette.css` | ⌘K hover token |
| `apps/lab/src/harness/invariants.ts` | invariants `popover-fit`, `drawer-fit` |
| tests | listed per task |

---

### Task 1: Dictionary keys

**Files:**
- Modify: `packages/engine/lab-i18n.ts` (EN `ui` block near `presetsLabel`, `:274`, and near `cmdHintSeed`, `:161`; PL block near `:604` and `:704`)
- Test: `packages/engine/lab-i18n.test.ts`

**Interfaces:**
- Produces: `dict.t('preset')`, `dict.t('customSettings')`, `dict.t('editedSinceLastPreset')`, `dict.t('reportHandle')`, `dict.t('cmdHintReport')` — all zero-argument strings.

- [ ] **Step 1: Write the failing test** — append to `packages/engine/lab-i18n.test.ts` (match the file's existing import of `dictionary`; add it if absent):

```ts
Deno.test('the preset picker and the report drawer speak both languages', () => {
  const en = dictionary('en')
  const pl = dictionary('pl')
  const want: Record<string, [string, string]> = {
    preset: ['preset', 'preset'],
    customSettings: ['custom settings', 'własne ustawienia'],
    editedSinceLastPreset: ['edited since the last preset', 'zmienione od ostatniego presetu'],
    reportHandle: ['report', 'raport'],
    cmdHintReport: ['report', 'raport'],
  }
  for (const [key, [e, p]] of Object.entries(want)) {
    assertEquals(en.t(key as UiKey), e, key)
    assertEquals(pl.t(key as UiKey), p, key)
  }
})
```

First check how the file already imports its assertions and `UiKey` (`grep -n "^import" packages/engine/lab-i18n.test.ts`) and use the same modules; if the file uses a different test style (`describe`/`it`), write the case in that style instead.

- [ ] **Step 2: Run it and see it fail**

Run: `cd packages/engine && deno test lab-i18n.test.ts`
Expected: FAIL — type error or `assertEquals` on `undefined` for `preset`.

- [ ] **Step 3: Add the keys.** In `EN.ui`, after `presetsDirty: 'edited',`:

```ts
    // The preset picker (spec §3): the trigger's caps label, what it says when
    // no preset spells the knobs, and the note beside it in that state.
    preset: 'preset',
    customSettings: 'custom settings',
    editedSinceLastPreset: 'edited since the last preset',
    // The report drawer's handle (spec §4.1), its visible and accessible name.
    reportHandle: 'report',
```

and after `cmdHintSeed: 'seed',`:

```ts
    cmdHintReport: 'report',
```

In `PL.ui`, the same keys at the matching places:

```ts
    preset: 'preset',
    customSettings: 'własne ustawienia',
    editedSinceLastPreset: 'zmienione od ostatniego presetu',
    reportHandle: 'raport',
```

```ts
    cmdHintReport: 'raport',
```

- [ ] **Step 4: Run it and see it pass**

Run: `cd packages/engine && deno test lab-i18n.test.ts && deno task check`
Expected: PASS.

- [ ] **Step 5: Build the engine for the lab**

Run: `pnpm nx build engine`
Expected: success; `packages/engine/dist/lab-i18n.js` contains `editedSinceLastPreset`.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/lab-i18n.ts packages/engine/lab-i18n.test.ts
git commit -m "Add the dictionary keys for the preset picker and the report drawer"
```

---

### Task 2: One command renderer, wrapping only between flags

**Files:**
- Create: `apps/lab/src/run/CommandText.tsx`
- Create: `apps/lab/src/run/CommandText.browser.test.tsx`
- Modify: `apps/lab/src/run/LiveCommand.tsx` (the `<pre>` at the end, and the `flags`/`head` lines above it)
- Modify: `apps/lab/src/library/BoardDetail.tsx:144`
- Modify: `apps/lab/src/design/run.css` (`.fw-cmd` and `.fw-cmd b`, `:152-181`)

**Interfaces:**
- Produces: `export function CommandText({ command }: { command: string }): ReactElement` — prefix in a bare `span.ln`, then for each space-separated token a `' '` text node and a `span.ln` holding `span.f` (`--name=`) + `b` (value), or a lone `b` for a token without `=`.

- [ ] **Step 1: Write the failing tests** — `apps/lab/src/run/CommandText.browser.test.tsx`:

```tsx
import { COMMAND_PREFIX } from '@arrowz/engine/command'
import { render } from 'vitest-browser-react'
import { expect, test } from 'vitest'
import { CommandText } from './CommandText'
// The selection case measures rendered text, which needs the real cascade.
import '../design/tokens.css'
import '../design/shell.css'
import '../design/run.css'

const COMMAND = `${COMMAND_PREFIX} --width=137 --height=251 --seed=987654 --pstraight=0.83 --colored --sharp`

test('splits the command into the prefix and one span per flag', async () => {
  const screen = await render(
    <pre className="fw-cmd">
      <CommandText command={COMMAND} />
    </pre>,
  )
  const lines = [...screen.container.querySelectorAll('.fw-cmd > .ln')]
  expect(lines.map((l) => l.textContent)).toEqual([
    COMMAND_PREFIX,
    '--width=137',
    '--height=251',
    '--seed=987654',
    '--pstraight=0.83',
    '--colored',
    '--sharp',
  ])
  expect(lines[1]?.querySelector('.f')?.textContent).toBe('--width=')
  expect(lines[1]?.querySelector('b')?.textContent).toBe('137')
  // A flag without a value is one bold run, not a name with an empty value.
  expect(lines[5]?.querySelector('.f')).toBeNull()
  expect(lines[5]?.querySelector('b')?.textContent).toBe('--colored')
  // The DOM text is the command itself, spaces included (LiveCommand's own
  // test compares textContent to buildCommand exactly).
  expect(screen.container.querySelector('.fw-cmd')?.textContent).toBe(COMMAND)
})

test('leaves a command without the program prefix whole', async () => {
  const screen = await render(
    <pre className="fw-cmd">
      <CommandText command="carve --width=8" />
    </pre>,
  )
  expect(screen.container.querySelectorAll('.ln')).toHaveLength(0)
  expect(screen.container.querySelector('.fw-cmd')?.textContent).toBe('carve --width=8')
})

// Spec §5.2: wrapped lines break only between flags, and a selection of the
// box reads back as the command with its spaces — the property a flex box
// would lose, because white space between flex items is not rendered.
test('breaks lines only between flags, and a selection keeps the spaces', async () => {
  const screen = await render(
    <div className="fw" style={{ width: '220px' }}>
      <pre className="fw-cmd">
        <CommandText command={COMMAND} />
      </pre>
    </div>,
  )
  const pre = screen.container.querySelector<HTMLElement>('.fw-cmd')
  if (pre === null) throw new Error('no command box')
  for (const line of pre.querySelectorAll('.ln')) {
    // One rendered line per flag: a flag broken inside itself has two rects.
    expect(line.getClientRects(), line.textContent ?? '').toHaveLength(1)
  }
  // The box did wrap, or the case above proved nothing.
  expect(pre.querySelectorAll('.ln')[0]?.getBoundingClientRect().top).toBeLessThan(
    pre.querySelectorAll('.ln')[6]?.getBoundingClientRect().top ?? 0,
  )
  const selection = window.getSelection()
  if (selection === null) throw new Error('no selection')
  selection.selectAllChildren(pre)
  expect(selection.toString().replace(/\s+/g, ' ').trim()).toBe(COMMAND)
})
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/run/CommandText.browser.test.tsx`
Expected: FAIL — cannot resolve `./CommandText`.

- [ ] **Step 3: Write `CommandText.tsx`**

```tsx
import { COMMAND_PREFIX } from '@arrowz/engine/command'
import { Fragment, type ReactElement } from 'react'

/**
 * A `deno task carve` command as the lab shows it (spec §5.2): the program in
 * `--ash`, each flag in a `span.ln` that never breaks inside itself, the flag's
 * name in `--ash` and its value in `--ink`. The flags are separated by real
 * spaces in the DOM, so the box (run.css, `.fw-cmd`) can break a line only
 * there and a selection reads back as the one-line command. A string that is
 * not a carve command — a hand-edited store entry — is shown as it is.
 */
export function CommandText({ command }: { command: string }): ReactElement {
  if (!command.startsWith(`${COMMAND_PREFIX} `)) return <>{command}</>
  const tokens = command.slice(COMMAND_PREFIX.length + 1).split(' ')
  return (
    <>
      <span className="ln">{COMMAND_PREFIX}</span>
      {tokens.map((token, i) => {
        const eq = token.indexOf('=')
        return (
          // A token may repeat in a hand-written command; its position may not.
          <Fragment key={`${i}:${token}`}>
            {' '}
            <span className="ln">
              {eq < 0 ? (
                <b>{token}</b>
              ) : (
                <>
                  <span className="f">{token.slice(0, eq + 1)}</span>
                  <b>{token.slice(eq + 1)}</b>
                </>
              )}
            </span>
          </Fragment>
        )
      })}
    </>
  )
}
```

- [ ] **Step 4: Replace the `.fw-cmd` rules in `run.css`.** Replace the comment above `.fw-cmd` and the rules `.fw-cmd { … }` and `.fw-cmd b { … }` (`run.css:152-181`, up to but not including the `@media (pointer: coarse)` block) with:

```css
/* `overflow: auto` and not the mock's `hidden`: the box scrolls inside itself
   rather than clipping what would be run (LiveCommand.tsx), and rather than
   growing and walking the controls under it down the column.

   Wrapping (spec §5.2): the box is ordinary inline text and every flag is a
   `nowrap` `.ln` (CommandText.tsx), so a line breaks only at the real spaces
   between flags — never inside `--height=250`, which `word-break: break-all`
   used to do. Not the handoff's flex-wrap box: white space between flex items
   is not rendered, so a selection of the command read back with its flags
   glued together. */
.fw-cmd {
  flex: 0 1 auto;
  min-height: 58px;
  overflow: auto;
  margin: 0;
  padding: 10px 12px;
  background: var(--void);
  border: 1px solid var(--border);
  color: var(--ash);
  font: inherit;
  line-height: 1.6;
  white-space: normal;
  font-variant-numeric: tabular-nums;
}
.fw-cmd .ln {
  white-space: nowrap;
}
.fw-cmd b {
  font-weight: 400;
  color: var(--ink);
}
```

(`font: inherit` before `line-height`: the shorthand resets `line-height`.)

- [ ] **Step 5: Use it in both places.** In `LiveCommand.tsx` delete the `flags` and `head` constants and their comment, import `CommandText` from `./CommandText`, and render:

```tsx
      <pre className="fw-cmd">
        <CommandText command={command} />
      </pre>
```

Drop the `COMMAND_PREFIX` import if nothing else uses it. In `BoardDetail.tsx:144`:

```tsx
        <pre className="fw-cmd">
          <CommandText command={meta.command} />
        </pre>
```

with `import { CommandText } from '../run/CommandText'`.

- [ ] **Step 6: Run the new file and the two consumers**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/run/CommandText.browser.test.tsx src/run/LiveCommand.browser.test.tsx src/library/BoardDetail.browser.test.tsx src/run/RunColumn.browser.test.tsx src/routes/LabLayout.browser.test.tsx`
Expected: PASS. `LiveCommand`'s "is exactly what buildCommand builds" still compares `textContent` to the command exactly — if it fails, the spaces are missing from the DOM, and Step 3 is wrong, not the test.

- [ ] **Step 7: Negative control** — temporarily change `.fw-cmd .ln { white-space: nowrap }` to `normal`, rerun `CommandText.browser.test.tsx`: the "breaks lines only between flags" case must fail on a `getClientRects` length of 2. Put it back and rerun green.

- [ ] **Step 8: Type check, lint, commit**

Run: `pnpm nx run lab:check && pnpm nx run lab:lint`

```bash
git add apps/lab/src/run/CommandText.tsx apps/lab/src/run/CommandText.browser.test.tsx apps/lab/src/run/LiveCommand.tsx apps/lab/src/library/BoardDetail.tsx apps/lab/src/design/run.css
git commit -m "Wrap the command only between flags, in the lab and in a saved board"
```

---

### Task 3: A wider run column, a growing command box, a mono Generate

**Files:**
- Modify: `apps/lab/src/design/console.css:7-14` (`.fw-console` tracks)
- Modify: `apps/lab/src/design/run.css` (`.fw-cmdfig` block and its comment, `:109-128`)
- Modify: `apps/lab/src/design/shell.css:365-398` (`.fw .fw-go` and its coarse block)
- Test: `apps/lab/src/routes/LabLayout.browser.test.tsx`

**Interfaces:**
- Consumes: Task 2's `.fw-cmd` rules.
- Produces: nothing new in code; `.fw-run-col` is `clamp(20rem, 22vw, 28rem)` wide above 900px.

- [ ] **Step 1: Write the failing cases** — append to `LabLayout.browser.test.tsx`:

```tsx
// Spec §5.1: the run column is about as wide as the report drawer, so the
// lab's right edge reads as one column. 22vw at 1400 is 308, under the 20rem
// floor; at 1920 it is 422.4; at 2560 the 28rem cap holds.
test.each([
  [1400, 900, 320],
  [1920, 1080, 422.4],
  [2560, 1200, 448],
] as const)(
  'at %d×%d the run column is %dpx wide',
  async (w, h, px) => {
    await page.viewport(w, h)
    const screen = await mountApp('advanced')
    await loadRunDone()
    expect(rect(screen.container, '.fw-run-col').width).toBeCloseTo(px, 0)
  },
  40_000,
)

// Spec §5.3: the primary action in the UI's own face, heavier than the
// buttons under it, and a full touch target at every pointer.
test('Generate is set in JetBrains Mono, 500, 13px, 44px high', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  const go = screen.getByRole('button', { name: 'Generate' }).element()
  const style = getComputedStyle(go)
  expect(style.fontFamily).toContain('JetBrains Mono')
  expect(style.fontWeight).toBe('500')
  expect(style.fontSize).toBe('13px')
  expect(go.getBoundingClientRect().height).toBeCloseTo(44, 0)
}, 40_000)
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/routes/LabLayout.browser.test.tsx -t "run column|Generate is set"`
Expected: FAIL — run column 216, font Archivo, height 40.

- [ ] **Step 3: The console track.** In `console.css:9`:

```css
  grid-template-columns: 168px minmax(0, 1fr) clamp(20rem, 22vw, 28rem);
```

Leave `.fw-console.library` and the `@media (max-width: 900px)` block as they are.

- [ ] **Step 4: The growing box, run column only.** Replace the comment above `.fw-cmdfig` (`run.css:109-120`) with the one below and add the two run-column rules right after the `.fw-cmdfig { … }` block (keep that block's `min-height` floor — the library's detail and a short column rely on it):

```css
/* `<figure>` carries a browser default margin; the mock's box has none, and
   the flex column depends on it. The floor is the caption's line, its 6px
   margin and the box's own 58px (PR 4b, Ruling 1): below it the box would
   shrink under its own content and paint behind Generate. */
```

```css
/* In the run column the figure takes every pixel the column has left (spec
   §5.2): Generate then moves with the column's height and never with the
   command's length, because the figure's size is the column less the fixed
   controls, whatever the command holds. The library's detail places the
   figure in an `auto` grid row instead (library.css) and is left alone. */
.fw-run-col > .fw-cmdfig {
  flex: 1 1 auto;
}
.fw-run-col .fw-cmd {
  flex: 1 1 auto;
}
```

- [ ] **Step 5: Generate.** Replace `.fw .fw-go { … }` in `shell.css` with the block below, add the focus rule after `.fw .fw-go:disabled { … }`, and delete the `@media (pointer: coarse) { .fw .fw-go { height: 44px; } }` block (44px is now the height everywhere):

```css
.fw .fw-go {
  flex: none;
  height: 44px;
  min-height: 44px;
  margin-top: 12px;
  padding: 0 16px;
  border: 0;
  background: var(--signal-fill);
  color: var(--ink);
  /* Mono like the rest of the UI (the design project's decision); 500 so it
     outweighs the 400 buttons under it; `flex: none` so the growing command
     box above never squeezes it (spec §5.3). */
  font-family: var(--mono);
  font-weight: 500;
  font-size: 13px;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background 120ms cubic-bezier(0.2, 0, 0, 1);
}
```

```css
.fw .fw-go:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: -4px;
}
```

- [ ] **Step 6: Run the new cases and every case that measures the column**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/routes/LabLayout.browser.test.tsx src/run/RunColumn.browser.test.tsx src/library/BoardDetail.browser.test.tsx src/routes/LayoutInvariants.browser.test.tsx`
Expected: PASS, including "the command box paints nothing over Generate, and Generate does not follow the command" at 860 and 1400. If that case fails, report the measured numbers; do not loosen it.

- [ ] **Step 7: Negative control** — remove `.fw-run-col > .fw-cmdfig { flex: 1 1 auto; }` and measure by hand in the same file (a temporary `console.log(rect(screen.container, '.fw-cmdfig').height)` in the 1400×900 case): the figure falls back to its content height. Restore the rule, remove the log.

- [ ] **Step 8: Type check, lint, commit**

```bash
git add apps/lab/src/design/console.css apps/lab/src/design/run.css apps/lab/src/design/shell.css apps/lab/src/routes/LabLayout.browser.test.tsx
git commit -m "Widen the run column, let the command take its height, and set Generate in mono"
```

---

### Task 4: The preset picker

**Files:**
- Modify: `apps/lab/src/harness/invariants.ts` (new invariant `popover-fit`)
- Modify: `apps/lab/src/routes/LayoutInvariants.browser.test.tsx` (new state `presets-open`)
- Rewrite: `apps/lab/src/run/PresetStrip.tsx`
- Modify: `apps/lab/src/design/run.css` (replace the `.fw-presets` block, `:187-238`)
- Rewrite: `apps/lab/src/run/PresetStrip.browser.test.tsx`
- Modify: `apps/lab/src/run/triggers.browser.test.tsx:145` (open the panel before choosing)
- Modify: `apps/lab/src/design/palette.test.ts:22-26` (comment: `.fw .fw-presets button` → `.fw .fw-pp-col button`)

**Interfaces:**
- Consumes: Task 1's `preset`, `customSettings`, `editedSinceLastPreset`.
- Produces: `PresetStrip({ control }: { control: RunControl }): ReactElement` (same signature). DOM: `.fw-presets` > `button.fw-pp-trigger[aria-expanded][aria-controls]`, optional `span.fw-pp-edited`, `div.fw-pp-panel[role=group][hidden?]` > `div.fw-pp-col[role=group]` > `h3` + `button[data-col][data-row]`. The trigger's accessible name starts with `preset`. Rows keep the name `${levelName} ${W}×${H} ${mode}`.

- [ ] **Step 1: The invariant.** In `harness/invariants.ts` add `'popover-fit'` to the `Invariant` union, and:

```ts
/**
 * A rendered popover lies inside the viewport on both axes (spec §3.4). The
 * preset panel is absolutely positioned under its 38px row, so it can run past
 * the window without the document ever growing — `scroll` would not see it.
 */
function popoverFit(root: HTMLElement): Finding[] {
  const out: Finding[] = []
  for (const panel of root.querySelectorAll('.fw-pp-panel')) {
    if (!rendered(panel)) continue
    const r = panel.getBoundingClientRect()
    if (r.left < -EPS || r.top < -EPS || r.right > window.innerWidth + EPS || r.bottom > window.innerHeight + EPS)
      out.push({
        invariant: 'popover-fit',
        detail: `${label(panel)} ${r.left.toFixed(0)},${r.top.toFixed(0)} to ${r.right.toFixed(0)},${
          r.bottom.toFixed(0)
        } in ${window.innerWidth}×${window.innerHeight}`,
      })
  }
  return out
}
```

and `...popoverFit(root),` in `audit`, after `...panelOverflow(root),`.

- [ ] **Step 2: The state.** In `LayoutInvariants.browser.test.tsx` add `'presets-open'` to `State` and to `STATES` (after `'board'`), and at the end of `arrange`, before `return screen`:

```tsx
  if (state === 'presets-open') {
    await screen.getByRole('button', { name: /^preset/ }).click()
    await expect.poll(() => screen.container.querySelector('.fw-pp-panel:not([hidden])')).not.toBeNull()
  }
```

- [ ] **Step 3: Rewrite `PresetStrip.browser.test.tsx`.** Keep the file's imports, `stub()`, `OPTIONS`, and `beforeEach`; add `import { userEvent } from 'vitest/browser'` and `import '../design/tokens.css'` stays. Replace the `describe` with:

```tsx
/** Opens the panel the way a person does. */
async function open(screen: Awaited<ReturnType<typeof render>>) {
  await screen.getByRole('button', { name: /^preset/ }).click()
  await expect.element(screen.getByRole('group', { name: 'Presets' })).toBeVisible()
}

describe('PresetStrip', () => {
  it('names the preset the knobs spell on its trigger, with its size', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    // The store's defaults are 25×50, which `easy-portrait` spells exactly.
    await expect.element(screen.getByRole('button', { name: /^preset/ })).toHaveTextContent('presetEasy portrait25×50▼')
    expect(screen.container.querySelector('.fw-pp-edited')).toBeNull()
  })

  it('says custom settings, and edited beside it, when no preset spells the knobs', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await act(async () => useStore.getState().params.set('W', 26))
    await expect.element(screen.getByRole('button', { name: /^preset/ })).toHaveTextContent('presetcustom settings▼')
    await expect.element(screen.getByText('edited since the last preset')).toBeVisible()
  })

  it('is closed at first, and says so', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await expect.element(screen.getByRole('button', { name: /^preset/ })).toHaveAttribute('aria-expanded', 'false')
    await expect.element(screen.getByRole('group', { name: 'Presets' })).not.toBeInTheDocument()
    const panel = screen.container.querySelector('.fw-pp-panel')
    const id = screen.getByRole('button', { name: /^preset/ }).element().getAttribute('aria-controls')
    expect(panel?.id).toBe(id)
  })

  it('offers every preset the engine has, and no others, in one column per level', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await open(screen)
    const rows = screen.container.querySelectorAll('.fw-pp-panel button')
    expect(rows).toHaveLength(OPTIONS.length)
    expect(screen.container.querySelectorAll('.fw-pp-col')).toHaveLength(PRESETS.length)
    await expect.element(screen.getByRole('group', { name: 'Easy', exact: true })).toBeVisible()
  })

  // A row's visible text is the mode and the size; four rows read `square`,
  // so the accessible name carries the level too — the same name the strip's
  // chips had, so every case that chooses a preset by name still finds it.
  it('names each row in full, twenty-six names and no two the same', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await open(screen)
    await expect.element(screen.getByRole('button', { name: /Easy.*25×50.*tunnels/ })).toBeVisible()
    const names = [...screen.container.querySelectorAll('.fw-pp-panel button')].map((b) => b.getAttribute('aria-label'))
    expect(new Set(names).size).toBe(OPTIONS.length)
    const row = screen.getByRole('button', { name: /Easy.*25×50.*tunnels/ }).element()
    expect(row.textContent).toBe('tunnels25×50')
  })

  it('writes every knob, not only the ones the preset names', async () => {
    useStore.getState().params.set('warns', 3)
    const screen = await render(<PresetStrip control={stub().control} />)
    await open(screen)
    await screen.getByRole('button', { name: /Easy.*square/ }).click()
    const spec = PARAM_SPEC.find((s) => s.key === 'warns')
    if (spec === undefined) throw new Error('PARAM_SPEC has no warns')
    expect(useStore.getState().params.values.warns).toBe(spec.def)
  })

  // Hard 75×150: `exportCell` saturates at 18 up to 91 cells on the longer
  // side, so a small preset would pass on a stale 18. 75×150 gives 11.
  it('sets the export cell size the preset implies', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await open(screen)
    await screen.getByRole('button', { name: /Hard.*portrait/ }).click()
    expect(useStore.getState().view.cell).toBe(exportCell(75, 150))
  })

  it('runs at once, through the machine path, and closes with the focus back on the trigger', async () => {
    const g = stub()
    const before = useStore.getState().params.edits
    const screen = await render(<PresetStrip control={g.control} />)
    await open(screen)
    await screen.getByRole('button', { name: /Easy.*square/ }).click()
    expect(g.started()).toBe(1)
    expect(useStore.getState().params.edits).toBe(before)
    await expect.element(screen.getByRole('button', { name: /^preset/ })).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^preset/ }).element())
  })

  it('marks the preset the knobs currently spell, and drops the mark when a knob it names moves', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await open(screen)
    await screen.getByRole('button', { name: /Easy.*square/ }).click()
    expect(findPreset(useStore.getState().params.values)?.id).toBe('easy-square')
    await open(screen)
    await expect.element(screen.getByRole('button', { name: /Easy.*square/ })).toHaveAttribute('aria-current', 'true')
    await act(async () => useStore.getState().params.set('W', 26))
    await expect.element(screen.getByRole('button', { name: /Easy.*square/ })).not.toHaveAttribute('aria-current')
  })

  // Ruling 10: `findPreset` compares only the preset's own keys, so `seed`
  // cannot break the match.
  it('does not call a seed change an edit', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await act(async () => useStore.getState().params.set('seed', 12))
    expect(screen.container.querySelector('.fw-pp-edited')).toBeNull()
  })

  it('opens on the current preset, or on the first row when there is none', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await open(screen)
    await expect.poll(() => document.activeElement?.getAttribute('aria-label')).toMatch(/Easy.*25×50.*portrait/)
    await userEvent.keyboard('{Escape}')
    await act(async () => useStore.getState().params.set('W', 26))
    await open(screen)
    await expect.poll(() => document.activeElement?.getAttribute('aria-label')).toMatch(/Easy.*25×25.*square/)
  })

  it('moves by arrows within and across levels, and Home and End go to the ends of a level', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await act(async () => useStore.getState().params.set('W', 26))
    await open(screen)
    const at = () => document.activeElement?.getAttribute('aria-label') ?? ''
    await userEvent.keyboard('{ArrowDown}')
    expect(at()).toMatch(/^Easy.*portrait/)
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    expect(at()).toMatch(/^Easy.*square/)
    await userEvent.keyboard('{End}')
    expect(at()).toMatch(/^Easy.*skeleton/)
    await userEvent.keyboard('{ArrowRight}')
    expect(at()).toMatch(/^Medium.*skeleton/)
    await userEvent.keyboard('{Home}{ArrowLeft}')
    expect(at()).toMatch(/^Easy.*square/)
    await userEvent.keyboard('{ArrowLeft}')
    expect(at()).toMatch(/^Easy.*square/)
  })

  it('closes on Escape with the focus back on the trigger, and on a press outside without taking the focus', async () => {
    const screen = await render(
      <>
        <PresetStrip control={stub().control} />
        <button type="button">elsewhere</button>
      </>,
    )
    await open(screen)
    await userEvent.keyboard('{Escape}')
    await expect.element(screen.getByRole('button', { name: /^preset/ })).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^preset/ }).element())
    await open(screen)
    await screen.getByRole('button', { name: 'elsewhere' }).click()
    await expect.element(screen.getByRole('button', { name: /^preset/ })).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'elsewhere' }).element())
  })

  // Spec §3.2: the drawer's Escape (Task 8) must not also fire.
  it('consumes the Escape it closes on', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await open(screen)
    let prevented: boolean | null = null
    const seen = (event: KeyboardEvent) => {
      prevented = event.defaultPrevented
    }
    document.addEventListener('keydown', seen)
    try {
      await userEvent.keyboard('{Escape}')
    } finally {
      document.removeEventListener('keydown', seen)
    }
    expect(prevented).toBe(true)
  })
})
```

The trigger's text in the first two cases is the DOM text with no spaces, because the gaps are CSS `gap`, and it includes the caret: confirm the caret glyphs `▼`/`▲` against Step 5's code before running.

- [ ] **Step 4: Run and see them fail**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/run/PresetStrip.browser.test.tsx src/routes/LayoutInvariants.browser.test.tsx -t "presets-open|PresetStrip"`
Expected: FAIL — no button named `/^preset/`.

- [ ] **Step 5: Rewrite `PresetStrip.tsx`**

```tsx
import type { Params } from '@arrowz/engine'
import { findPreset, PRESETS } from '@arrowz/engine/presets'
import { type ReactElement, useEffect, useId, useRef, useState } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { applyPreset } from './actions'
import type { RunControl } from './useRun'

/** The last row index of level `col`, for the arrow keys' clamp. */
function lastRow(col: number): number {
  return (PRESETS[col]?.options.length ?? 1) - 1
}

/**
 * The preset picker (spec §3): one trigger in the 38px row, naming the preset
 * the knobs spell and its size, and under it a panel with one column per level.
 * A disclosure, not a menu: the trigger carries `aria-expanded` and
 * `aria-controls`, and the panel is a group of buttons — `aria-haspopup="menu"`
 * would promise a `role="menu"` and menu keyboarding this panel does not have.
 *
 * The panel is always mounted and `hidden` while closed, so `aria-controls`
 * always names an element in the document. Its keys are a capture-phase
 * listener on the document, installed only while it is open: capture so it
 * runs before the drawer's Escape (App.tsx), which it consumes.
 */
export function PresetStrip({ control }: { control: RunControl }): ReactElement {
  const dict = useDictionary()
  const values = useStore((state) => state.params.values)
  const current = findPreset(values)
  // `PresetLevel.id` is a `string` and the dictionary's `levels` a fixed-key
  // object, so the index needs narrowing (the same shape `KnobPanel.tsx` uses).
  const levels = dict.d.presets.levels as Partial<Record<string, string>>
  const level = current === null ? undefined : PRESETS.find((entry) => entry.options.includes(current))
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const panel = root.current?.querySelector('.fw-pp-panel')
    const first =
      panel?.querySelector<HTMLButtonElement>('button[aria-current="true"]') ??
      panel?.querySelector<HTMLButtonElement>('button')
    first?.focus()

    const onPress = (event: PointerEvent) => {
      if (event.target instanceof Node && root.current?.contains(event.target)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        trigger.current?.focus()
        return
      }
      const at = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-col]') : null
      if (at === null || !(root.current?.contains(at) ?? false)) return
      const col = Number(at.dataset.col)
      const row = Number(at.dataset.row)
      let c = col
      let r = row
      if (event.key === 'ArrowDown') r = Math.min(row + 1, lastRow(col))
      else if (event.key === 'ArrowUp') r = Math.max(row - 1, 0)
      else if (event.key === 'ArrowRight') c = Math.min(col + 1, PRESETS.length - 1)
      else if (event.key === 'ArrowLeft') c = Math.max(col - 1, 0)
      else if (event.key === 'Home') r = 0
      else if (event.key === 'End') r = lastRow(col)
      else return
      event.preventDefault()
      r = Math.min(r, lastRow(c))
      root.current?.querySelector<HTMLButtonElement>(`[data-col="${c}"][data-row="${r}"]`)?.focus()
    }
    document.addEventListener('pointerdown', onPress)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onPress)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  // The chip and the palette row are the same action (spec D6): `applyPreset`
  // writes every knob, follows it with the export cell size, and starts the run.
  const choose = (params: Partial<Params>) => {
    applyPreset(control, params)
    close(true)
  }

  return (
    <div className="fw-presets" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="fw-pp-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
      >
        <span className="k">{dict.t('preset')}</span>
        {current === null || level === undefined ? (
          <span className="none">{dict.t('customSettings')}</span>
        ) : (
          <>
            <span>{`${levels[level.id] ?? level.id} ${dict.d.presets.modes[current.mode]}`}</span>
            <span className="d">{`${current.params.W ?? 0}×${current.params.H ?? 0}`}</span>
          </>
        )}
        <span className="caret" aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </button>
      {current === null ? <span className="fw-pp-edited">{dict.t('editedSinceLastPreset')}</span> : null}
      <div className="fw-pp-panel" id={panelId} role="group" aria-label={dict.t('presetsLabel')} hidden={!open}>
        {PRESETS.map((entry, c) => {
          const levelName = levels[entry.id] ?? entry.id
          const headingId = `${panelId}-${entry.id}`
          return (
            <div key={entry.id} className="fw-pp-col" role="group" aria-labelledby={headingId}>
              <h3 id={headingId}>{levelName}</h3>
              {entry.options.map((option, r) => {
                const W = option.params.W ?? 0
                const H = option.params.H ?? 0
                const mode = dict.d.presets.modes[option.mode]
                return (
                  <button
                    key={option.id}
                    type="button"
                    data-col={c}
                    data-row={r}
                    {...(current?.id === option.id ? { 'aria-current': true } : {})}
                    aria-label={`${levelName} ${W}×${H} ${mode}`}
                    onClick={() => choose(option.params)}
                  >
                    <span>{mode}</span>
                    <span className="d">{`${W}×${H}`}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Replace the `.fw-presets` block in `run.css`** (`:187-238`, from the `/* presets, from the mock's …` comment to the end of its `@media (pointer: coarse)` block) with:

```css
/* The preset picker (spec §3): one trigger in the 38px row, a panel of level
   columns under it. Replaces the scrolling strip of 26 chips. `overflow:
   visible` and a z-index so the panel lies over the stage. */
.fw-presets {
  position: relative;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  height: 38px;
  background: var(--void);
  border-bottom: 1px solid var(--border);
}
.fw .fw-presets .fw-pp-trigger {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--border);
  background: var(--void);
  color: var(--ink);
  cursor: pointer;
  white-space: nowrap;
}
.fw .fw-presets .fw-pp-trigger:hover,
.fw .fw-presets .fw-pp-trigger[aria-expanded='true'] {
  background: var(--surface);
  border-color: var(--mist);
}
.fw-pp-trigger .k {
  color: var(--ash);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-size: 11px;
}
.fw-pp-trigger .d,
.fw-pp-trigger .none {
  color: var(--mist);
  font-variant-numeric: tabular-nums;
}
.fw-pp-trigger .caret {
  color: var(--ash);
  font-size: 10px;
}
.fw-pp-edited {
  min-width: 0;
  color: var(--mist);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* The panel's own `display: grid` would beat the user agent's `[hidden] {
   display: none }`, so the closed state is stated here. `max-height` is not in
   the handoff: at 420×900 seven levels in two columns run past the window; the
   `popover-fit` invariant (LayoutInvariants) pins it. */
.fw-pp-panel {
  position: absolute;
  top: 100%;
  left: 16px;
  margin-top: 4px;
  width: max-content;
  max-width: calc(100% - 32px);
  max-height: calc(100dvh - 12rem);
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  padding: 1px;
  background: var(--graphite);
}
.fw-pp-panel[hidden] {
  display: none;
}
/* 7 × 201px (the widest row, "winding skeleton 400×400", plus padding) +
   gaps + 32px of margin ≈ 1447px. Recompute when a mode's name or the font
   changes. */
@media (max-width: 1479px) {
  .fw-pp-panel {
    grid-template-columns: repeat(4, 1fr);
  }
}
@media (max-width: 600px) {
  .fw-pp-panel {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
/* Lines as a shadow on the columns, not the panel's background showing
   through: an empty grid cell would paint as a grey block. */
.fw-pp-col {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 8px 10px;
  background: var(--graphite);
  box-shadow: 0 0 0 1px var(--border);
}
.fw-pp-col h3 {
  margin: 0 4px 8px;
  font: inherit;
  font-size: 11px;
  color: var(--ash);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.fw .fw-pp-col button {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  height: 28px;
  padding: 0 8px;
  border: 0;
  background: none;
  color: var(--mist);
  text-align: left;
  cursor: pointer;
}
.fw .fw-pp-col button:hover {
  background: var(--surface);
  color: var(--ink);
}
.fw .fw-pp-col button[aria-current='true'] {
  background: var(--signal-fill);
  color: var(--ink);
}
/* The size never shrinks or wraps; the mode gives way with an ellipsis if a
   column is ever narrower than its content. */
.fw-pp-col button > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fw-pp-col button .d {
  flex: none;
  white-space: nowrap;
  color: var(--ash);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.fw-pp-col button[aria-current='true'] .d {
  color: var(--ink);
}
@media (pointer: coarse) {
  .fw-presets {
    height: auto;
    padding: 6px 16px;
  }
  .fw .fw-pp-col button,
  .fw .fw-presets .fw-pp-trigger {
    height: 44px;
  }
}
```

- [ ] **Step 7: Run the strip's file green, then prove the max-height**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/run/PresetStrip.browser.test.tsx`
Expected: PASS.

Then delete the `max-height` and `overflow-y` lines from `.fw-pp-panel` and run
`pnpm --dir apps/lab exec vitest run --project chromium src/routes/LayoutInvariants.browser.test.tsx -t presets-open`.
Expected: FAIL with `popover-fit` at `420×900` (record which other sizes go red). Put both lines back and rerun: PASS at all five sizes. If a size stays red with the lines back, tune the `max-height` value against the test, and report the value you chose.

- [ ] **Step 8: The other callers.** In `triggers.browser.test.tsx`, case "3 · a preset", before the click on `/Hard.*portrait/` add:

```tsx
    await screen.getByRole('button', { name: /^preset/ }).click()
```

In `design/palette.test.ts`, the comment listing button families: replace `` `.fw .fw-presets button` `` with `` `.fw .fw-pp-col button` ``.

- [ ] **Step 9: Run everything that renders the strip**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/run src/routes/Workspace.browser.test.tsx src/routes/LayoutInvariants.browser.test.tsx && pnpm --dir apps/lab exec vitest run --project node src/design`
Expected: PASS. `Workspace.browser.test.tsx:636-641` checks only `.fw-presets`, which stays.

- [ ] **Step 10: Type check, lint, commit**

```bash
git add apps/lab/src/harness/invariants.ts apps/lab/src/routes/LayoutInvariants.browser.test.tsx apps/lab/src/run/PresetStrip.tsx apps/lab/src/run/PresetStrip.browser.test.tsx apps/lab/src/run/triggers.browser.test.tsx apps/lab/src/design/run.css apps/lab/src/design/palette.test.ts
git commit -m "Replace the preset strip with a picker grouped by level"
```

---

### Task 5: The top bar no longer names the preset

**Files:**
- Modify: `apps/lab/src/shell/TopBar.tsx`
- Modify: `apps/lab/src/shell/TopBar.browser.test.tsx` (first three cases)
- Modify: `apps/lab/src/design/shell.css:118-160` (P8 rules)
- Modify: `apps/lab/src/routes/LayoutInvariants.browser.test.tsx` (the Polish case's cluster selector)
- Modify: `packages/engine/lab-i18n.ts` (remove `presetsDirty` from `EN` and `PL`, fix the comment above it)

**Interfaces:**
- Consumes: Task 4 (the name now lives on the trigger).
- Produces: the bar's left cluster is `mark, h1.name, .sep, .dims`.

- [ ] **Step 1: Rewrite the first three `TopBar` cases** as:

```tsx
  // Spec §3.3: the preset's name and the "edited" mark live on the preset
  // picker now; the bar keeps the mark, the name of the product and the size.
  // The whole text is asserted, separators and all; the spaces a reader sees
  // are `gap`, not characters.
  it('names the product and the size, and no preset', async () => {
    const screen = await renderBar()
    await expect.element(screen.getByRole('banner')).toHaveTextContent('Arrowz/25×50⌘KSimpleAdvancedPLEN')
  })

  it('says nothing of an edit on the advanced lab face', async () => {
    useStore.getState().ui.setMode('advanced')
    const screen = await renderBar()
    await act(async () => useStore.getState().params.set('W', 26))
    await expect.element(screen.getByRole('banner')).toHaveTextContent('Arrowz/26×50⌘KSimpleAdvancedPLEN')
    expect(screen.container.querySelector('.preset')).toBeNull()
  })
```

(two cases replace three: the simple-face case is now the same assertion as the first).

- [ ] **Step 2: Run and see them fail**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/shell/TopBar.browser.test.tsx`
Expected: FAIL — the banner text still contains `Easy portrait/` and `edited/`.

- [ ] **Step 3: `TopBar.tsx`.** Delete the `isLabRoute`/`advancedLab` lines and their comment, the `values`/`preset`/`level`/`levels`/`name`/`showPreset` lines and their comments, and the `{showPreset ? … : null}` block. Read the size with two selectors:

```tsx
  const W = useStore((state) => state.params.values.W)
  const H = useStore((state) => state.params.values.H)
```

Remove the now unused imports (`findPreset`, `PRESETS`, `useLocation`, `selectedIndex`); `lab:lint` fails on any left. Update the component's doc comment: "the mark and the size (spec §5.1; the preset's name moved to the picker, spec §3.3)".

- [ ] **Step 4: `shell.css` P8 rules.** Replace the block from the comment `/* The bar gives way before the document does …` through the end of `@media (max-width: 560px) { … }` with:

```css
/* The bar gives way before the document does (spec R2: 420px is the narrowest
   width the lab supports). Review P8 measured the shell at 472px minimum,
   because every child of this flex row kept its width. The size is the text
   that gives way. */
.fw-top .name,
.fw-top .sep {
  flex: none;
}
.fw-top .dims {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

In the `@media (max-width: 480px)` block, rewrite the two comments that mention the preset: "the first thing to give" (drop "below the size the size and preset already gave up theirs") and "the same `:has(+ …)` shape" (drop "the preset's own sep already uses above"). Keep every rule in that block.

- [ ] **Step 5: The dictionary.** Remove `presetsDirty` from `EN` and `PL`; in the comment above `presetsLabel`, drop "the mark for a knob moved since a preset was chosen". Run `grep -rn presetsDirty apps packages --include=*.ts --include=*.tsx | grep -v dist` → no output. Then `pnpm nx build engine`.

- [ ] **Step 6: The Polish case.** In `LayoutInvariants.browser.test.tsx`, the selector `'.name, .sep, .preset, .dims'` becomes `'.name, .sep, .dims'`, and its comment's "(mark, name, seps, preset, dims)" becomes "(mark, name, seps, dims)".

- [ ] **Step 7: Run**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/shell src/routes/LayoutInvariants.browser.test.tsx src/palette && cd packages/engine && deno task test`
Expected: PASS, including `bar-clip` and the Polish cases at 420×900.

- [ ] **Step 8: Type check, lint, commit**

```bash
git add apps/lab/src/shell/TopBar.tsx apps/lab/src/shell/TopBar.browser.test.tsx apps/lab/src/design/shell.css apps/lab/src/routes/LayoutInvariants.browser.test.tsx packages/engine/lab-i18n.ts
git commit -m "Leave the preset's name to the picker and keep the size in the top bar"
```

---

### Task 6: The report drawer's state, remembered

**Files:**
- Modify: `apps/lab/src/state/ui.slice.ts`
- Modify: `apps/lab/src/harness/mountApp.tsx` (`resetApp`)
- Test: `apps/lab/src/state/ui.slice.test.ts`, `apps/lab/src/state/preferences.browser.test.ts`

**Interfaces:**
- Produces: `REPORT_KEY = 'labReport'`; `UiState.report: boolean`; `setReport(on: boolean): void`; `toggleReport(): void`. Stored values `'open'` / `'closed'`; anything else reads as closed.

- [ ] **Step 1: Failing tests.** In `ui.slice.test.ts`, inside `describe('the switches the run column owns', …)` (it has the `slice()` helper):

```ts
  it('keeps the report drawer closed at first, sets it as given, and toggles it', () => {
    const store = slice()
    expect(store.ui.report).toBe(false)
    store.ui.setReport(true)
    store.ui.setReport(true)
    expect(store.ui.report).toBe(true)
    store.ui.toggleReport()
    expect(store.ui.report).toBe(false)
  })
```

In `preferences.browser.test.ts`, add `import { createUiSlice, type UiState } from './ui.slice'` and append:

```ts
test('the report drawer is remembered as open or closed, and read back', () => {
  useStore.getState().ui.setReport(true)
  expect(localStorage.getItem('labReport')).toBe('open')
  useStore.getState().ui.toggleReport()
  expect(localStorage.getItem('labReport')).toBe('closed')
  // A fresh slice reads what was stored (harness fact 41: the start value is
  // asserted on a new slice, not on the live store a reset may have written).
  localStorage.setItem('labReport', 'open')
  const store: { ui: UiState } = { ui: createUiSlice((fn) => Object.assign(store, fn(store))) }
  expect(store.ui.report).toBe(true)
  localStorage.setItem('labReport', 'nonsense')
  const other: { ui: UiState } = { ui: createUiSlice((fn) => Object.assign(other, fn(other))) }
  expect(other.ui.report).toBe(false)
  localStorage.removeItem('labReport')
})
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm --dir apps/lab exec vitest run --project node src/state/ui.slice.test.ts && pnpm --dir apps/lab exec vitest run --project chromium src/state/preferences.browser.test.ts`
Expected: FAIL — `report` is undefined / `setReport` is not a function.

- [ ] **Step 3: The slice.** In `ui.slice.ts`, after `MODE_KEY`:

```ts
/** Where the report drawer's state is remembered (spec §4.2). */
export const REPORT_KEY = 'labReport'
```

In `UiState`, after `palette`:

```ts
  /** The report drawer is open (spec §4.2). Remembered, never in the hash. */
  report: boolean
```

and after `togglePalette(): void`:

```ts
  setReport(on: boolean): void
  toggleReport(): void
```

In `createUiSlice`, after `palette: false,`:

```ts
    report: readStored(REPORT_KEY) === 'open',
```

and after `togglePalette`:

```ts
    setReport: (report) => {
      writeStored(REPORT_KEY, report ? 'open' : 'closed')
      patch({ report })
    },
    // Read inside the update, like `toggleSolo`: the key and the handle can
    // both fire before a render.
    toggleReport: () =>
      set((state) => {
        const report = !state.ui.report
        writeStored(REPORT_KEY, report ? 'open' : 'closed')
        return { ui: { ...state.ui, report } }
      }),
```

- [ ] **Step 4: `resetApp`.** After `state.ui.setSolo(false)` add `state.ui.setReport(false)`.

- [ ] **Step 5: Run green, type check, lint, commit**

Run the two commands of Step 2 again → PASS; then `pnpm nx run lab:check && pnpm nx run lab:lint`.

```bash
git add apps/lab/src/state/ui.slice.ts apps/lab/src/state/ui.slice.test.ts apps/lab/src/state/preferences.browser.test.ts apps/lab/src/harness/mountApp.tsx
git commit -m "Remember whether the report drawer is open"
```

---

### Task 7: The report as a drawer over the board

**Files:**
- Modify: `apps/lab/src/report/ReportPanel.tsx` (export `REPORT_ID`, set it on the section; update the doc comment)
- Modify: `apps/lab/src/stage/Stage.tsx`
- Modify: `apps/lab/src/design/shell.css` (`.fw-stage` `:198-204`; delete `:280-320` — the comment block ending "clipped the board at every height below 900." and both `@media (max-width: 900px)` stage rules; add the drawer rules)
- Modify: `apps/lab/src/design/console.css:674-682` (solo hides `.fw-drawer`)
- Modify: `apps/lab/src/harness/invariants.ts` (new invariant `drawer-fit`)
- Modify: `apps/lab/src/routes/LayoutInvariants.browser.test.tsx` (new state `report-open`)
- Modify: `apps/lab/src/routes/LabLayout.browser.test.tsx` (the three report cases)

**Interfaces:**
- Consumes: Task 6's `ui.report`, `ui.toggleReport`; Task 1's `reportHandle`.
- Produces: `export const REPORT_ID = 'lab-report'`; DOM `.fw-stage` > `.fw-runs`, `.fw-boardwrap`, `div.fw-drawer(.open)` > `button.fw-drawer-handle[aria-expanded][aria-controls=lab-report][aria-keyshortcuts=R]` + `section.fw-report#lab-report`.

First read the exact lines to delete: `sed -n 270,325p apps/lab/src/design/shell.css`. The comment that explains the `min(292px, 100%)` floor starts a few lines above `@media (max-width: 900px)`; delete from that comment's first line through the end of the `(max-width: 900px) and (max-height: 700px)` block. Do not delete anything above that comment.

- [ ] **Step 1: The invariant.** In `harness/invariants.ts` add `'drawer-fit'` to `Invariant`, and:

```ts
/** A rendered drawer lies inside its stage (spec §4.1): open, it slides over the board, never past the stage's edge onto the console. */
function drawerFit(root: HTMLElement): Finding[] {
  const out: Finding[] = []
  for (const drawer of root.querySelectorAll('.fw-drawer')) {
    const stage = drawer.closest('.fw-stage')
    if (stage === null || !rendered(drawer)) continue
    const d = drawer.getBoundingClientRect()
    const s = stage.getBoundingClientRect()
    if (d.left < s.left - EPS || d.right > s.right + EPS || d.top < s.top - EPS || d.bottom > s.bottom + EPS)
      out.push({ invariant: 'drawer-fit', detail: `${label(drawer)} outside ${label(stage)}` })
  }
  return out
}
```

and `...drawerFit(root),` in `audit` after `...popoverFit(root),`.

- [ ] **Step 2: The state.** In `LayoutInvariants.browser.test.tsx` add `'report-open'` to `State` and `STATES` (after `'presets-open'`), and in `arrange`'s `act` block:

```tsx
    if (state === 'report-open') s.ui.setReport(true)
```

In the `afterEach`, after the `lang` line:

```tsx
  useStore.setState((s) => ({ ui: { ...s.ui, report: false } }))
```

- [ ] **Step 3: Rewrite the three report cases in `LabLayout.browser.test.tsx`.** Replace "at 860×900 the report is a row under the board…", "above 900px the report is the third column beside the board…" and "at %d×%d the report column is %dpx wide" with:

```tsx
async function settleTransitions(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(resolve))
  await Promise.all(
    document
      .getAnimations()
      .filter((a) => a instanceof CSSTransition)
      .map((a) => a.finished.catch(() => undefined)),
  )
}

// Spec §4.1: closed, the report is its 28px handle in the stage's third track
// and nothing more — at 860 as at 1400, where it used to take a row under the
// board or a third of the stage beside it. The report itself is hidden, out of
// the tab order and the accessibility tree.
test.each([
  [860, 900, 'advanced'],
  [860, 900, 'simple'],
  [1400, 900, 'advanced'],
] as const)(
  'at %i×%i (%s) the closed report leaves only its handle beside the board',
  async (w, h, mode) => {
    await page.viewport(w, h)
    const screen = await mountApp(mode)
    await loadRunDone()
    const stage = rect(screen.container, '.fw-stage')
    const wrap = rect(screen.container, '.fw-boardwrap')
    const handle = rect(screen.container, '.fw-drawer-handle')
    expect(handle.width).toBeCloseTo(28, 0)
    expect(handle.right).toBeCloseTo(stage.right, 0)
    expect(handle.height).toBeCloseTo(stage.height, 0)
    // The board's track ends at the handle's track: 28px plus the 1px gap.
    expect(stage.right - wrap.right).toBeCloseTo(29, 0)
    expect(wrap.height).toBeCloseTo(stage.height, 0)
    const report = screen.container.querySelector('.fw-report')
    expect(report?.checkVisibility({ visibilityProperty: true })).toBe(false)
  },
  40_000,
)

// Open, the report is as wide as the column it used to be, clamp(22rem, 24vw,
// 32rem), and it lies over the board rather than moving it (P3 kept).
test.each([
  [1280, 800, 352],
  [1920, 1080, 460.8],
  [2560, 1200, 512],
] as const)(
  'at %d×%d the open report is %dpx wide, over a board that does not move',
  async (w, h, px) => {
    await page.viewport(w, h)
    const screen = await mountApp('advanced')
    await loadRunDone()
    const before = rect(screen.container, '.fw-boardwrap')
    await screen.getByRole('button', { name: 'report' }).click()
    await settleTransitions()
    const report = rect(screen.container, '.fw-report')
    const stage = rect(screen.container, '.fw-stage')
    expect(report.width).toBeCloseTo(px, 0)
    expect(report.right).toBeCloseTo(stage.right, 0)
    // Field by field: a DOMRect's fields are prototype getters, so
    // `toEqual` on two rects compares no own properties and always passes.
    const after = rect(screen.container, '.fw-boardwrap')
    for (const side of ['left', 'top', 'width', 'height'] as const) expect(after[side], side).toBeCloseTo(before[side], 1)
    await expect.element(screen.getByRole('region', { name: 'Report' })).toBeVisible()
  },
  40_000,
)
```

Check the report section's accessible name first: `grep -n "reportPanel" packages/engine/lab-i18n.ts` — use that English string in `{ name: … }`.

- [ ] **Step 4: Run and see them fail**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/routes/LabLayout.browser.test.tsx src/routes/LayoutInvariants.browser.test.tsx -t "report|handle"`
Expected: FAIL — `.fw-drawer-handle is not on the page`.

- [ ] **Step 5: `ReportPanel.tsx`.** Add above the component:

```tsx
/** The report's id, for the drawer handle's `aria-controls` (Stage.tsx). */
export const REPORT_ID = 'lab-report'
```

set `id={REPORT_ID}` on the `<section>`, and change the doc comment's first line to "The report drawer's content (spec §4.1): the report of the result on screen, …" and "empties the column" to "empties the report".

- [ ] **Step 6: `Stage.tsx`**

```tsx
import { type ReactElement, useLayoutEffect, useRef } from 'react'
import { useDictionary } from '../i18n'
import { REPORT_ID, ReportPanel } from '../report/ReportPanel'
import { useStore } from '../state/store'
import { BoardFrame } from './BoardFrame'

/**
 * 70px + 1fr + the report's handle: the mock's run rail, the board, and the
 * report as a drawer on the stage's right edge (spec §4.1). The rail is empty
 * until the run filmstrip fills it — still undelivered, row 7 of the lab
 * spec's §10; the column stays, so the board's width does not move when it
 * arrives. The drawer is toggled by its class, never remounted, or the slide
 * would not animate; closed, the report is `visibility: hidden` (shell.css).
 */
export function Stage(): ReactElement {
  const dict = useDictionary()
  const open = useStore((state) => state.ui.report)
  const toggle = useStore((state) => state.ui.toggleReport)
  const handle = useRef<HTMLButtonElement>(null)

  // A focus inside the report would fall to <body> once the report turns
  // hidden; it moves to the handle, which is how the report comes back — the
  // pattern BoardFrame.tsx uses for solo.
  useLayoutEffect(() => {
    const button = handle.current
    if (open || button === null) return
    const report = document.getElementById(REPORT_ID)
    const active = document.activeElement
    if (report !== null && active !== null && report.contains(active)) button.focus()
  }, [open])

  return (
    <div className="fw-stage">
      <div className="fw-runs" />
      <BoardFrame />
      <div className={open ? 'fw-drawer open' : 'fw-drawer'}>
        <button
          ref={handle}
          type="button"
          className="fw-drawer-handle"
          aria-expanded={open}
          aria-controls={REPORT_ID}
          aria-keyshortcuts="R"
          onClick={toggle}
        >
          <span className="t">{dict.t('reportHandle')}</span>
          <span className="c" aria-hidden="true">
            {open ? '▶' : '◀'}
          </span>
        </button>
        <ReportPanel />
      </div>
    </div>
  )
}
```

- [ ] **Step 7: `shell.css`.** `.fw-stage` becomes:

```css
.fw-stage {
  position: relative;
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr) 28px;
  gap: 1px;
  background: var(--border);
  min-height: 0;
  overflow: hidden;
}
```

Delete the block named at the top of this task. After `.fw-stage`'s rule add:

```css
/* The report as a drawer on the stage's right edge (spec §4.1). Closed, only
   its 28px handle shows, in the stage's third track, so the board takes the
   width the report column used to hold; open, it slides over the board. Below
   900px the same: the report no longer drops to a row under the board. */
.fw-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 5;
  width: calc(clamp(22rem, 24vw, 32rem) + 28px);
  max-width: calc(100% - 70px);
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  transform: translateX(calc(100% - 28px));
  transition: transform 180ms cubic-bezier(0.2, 0, 0, 1);
}
.fw-drawer.open {
  transform: none;
  box-shadow: -1px 0 0 var(--border);
}
@media (prefers-reduced-motion: reduce) {
  .fw-drawer {
    transition: none;
  }
}
.fw .fw-drawer-handle {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding: 12px 0;
  border: 0;
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
  background: var(--void);
  color: var(--mist);
  cursor: pointer;
}
.fw .fw-drawer-handle:hover {
  background: var(--surface);
  color: var(--ink);
}
.fw .fw-drawer-handle:focus-visible {
  outline-offset: -2px;
}
.fw-drawer-handle .t {
  writing-mode: vertical-rl;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.fw-drawer-handle .c {
  font-size: 10px;
  color: var(--ash);
}
.fw-drawer > .fw-report {
  min-width: 0;
}
/* Hidden, not merely off screen: out of the tab order and the accessibility
   tree while closed. */
.fw-drawer:not(.open) > .fw-report {
  visibility: hidden;
}
@media (pointer: coarse) {
  .fw-stage {
    grid-template-columns: 70px minmax(0, 1fr) 44px;
  }
  .fw-drawer {
    grid-template-columns: 44px minmax(0, 1fr);
    width: calc(clamp(22rem, 24vw, 32rem) + 44px);
    transform: translateX(calc(100% - 44px));
  }
}
```

Check whether `report.css` sets a width or grid placement on `.fw-report` that assumed the old column (`sed -n 1,30p apps/lab/src/design/report.css`); `width: 100%` is fine, a `grid-column` is not — remove it and say so in the commit body.

- [ ] **Step 8: Solo.** In `console.css`, `.fw-lab.solo .fw-report` in the `display: none` rule becomes `.fw-lab.solo .fw-drawer`, and `.fw-lab.solo .fw-stage` keeps `grid-template-columns: minmax(0, 1fr)`.

- [ ] **Step 9: Run**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/routes src/stage src/report`
Expected: PASS, including the solo cases ("solo gives the board the whole lab", which measures `.fw-report` at height 0) and every `report-open` state of the matrix. At 420×900 the open drawer is `100% - 70px` wide; if `panel-overflow` goes red on `.fw-report` there, report the numbers — do not add a `KNOWN_RED` entry without the controller's ruling.

- [ ] **Step 10: Negative control** — remove `max-width: calc(100% - 70px)` from `.fw-drawer` and run `-t "report-open"`: `drawer-fit` must go red at 420×900. Restore.

- [ ] **Step 11: Type check, lint, commit**

```bash
git add apps/lab/src/report/ReportPanel.tsx apps/lab/src/stage/Stage.tsx apps/lab/src/design/shell.css apps/lab/src/design/console.css apps/lab/src/design/report.css apps/lab/src/harness/invariants.ts apps/lab/src/routes/LayoutInvariants.browser.test.tsx apps/lab/src/routes/LabLayout.browser.test.tsx
git commit -m "Turn the report column into a drawer over the board"
```

(Leave `report.css` out of `git add` if Step 7 did not change it.)

---

### Task 8: R toggles the report, Escape closes it, the palette says so

**Files:**
- Modify: `apps/lab/src/App.tsx` (new `useReportKey`, called beside `useSoloKey` at `:208`)
- Modify: `apps/lab/src/palette/CommandPalette.tsx:222-232` (footer)
- Test: `apps/lab/src/routes/LabLayout.browser.test.tsx` (hotkey cases live there beside `f`), `apps/lab/src/palette/CommandPalette.browser.test.tsx:145-161`

**Interfaces:**
- Consumes: Task 6's `ui.report`, `setReport`, `toggleReport`; Task 1's `cmdHintReport`; Task 4's capture-phase Escape.

- [ ] **Step 1: Failing cases** — append to `LabLayout.browser.test.tsx` (it already has `press` and `solo`):

```tsx
const report = () => useStore.getState().ui.report

// Spec §4.3: `r` and `R` toggle the drawer under the same guard as `f`; each
// refusal is followed by the same event without the thing refused.
test('r toggles the report, and a modifier, a repeat or a field does nothing', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await userEvent.keyboard('r')
  expect(report()).toBe(true)
  await userEvent.keyboard('R')
  expect(report()).toBe(false)
  for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true }]) {
    press(document.body, { key: 'r', ...modifier })
    expect(report(), JSON.stringify(modifier)).toBe(false)
  }
  press(document.body, { key: 'r' })
  expect(report()).toBe(true)
  await screen.getByRole('tab', { name: 'board', exact: true }).click()
  await screen.getByRole('button', { name: /^seed:/ }).click()
  await userEvent.keyboard('r')
  expect(report()).toBe(true)
}, 40_000)

test('Escape closes the report, but not while the palette or the preset panel has it', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await userEvent.keyboard('r')
  await userEvent.keyboard('{Escape}')
  expect(report()).toBe(false)

  await userEvent.keyboard('r')
  await userEvent.keyboard('{Meta>}k{/Meta}')
  await expect.poll(() => useStore.getState().ui.palette).toBe(true)
  await userEvent.keyboard('{Escape}')
  await expect.poll(() => useStore.getState().ui.palette).toBe(false)
  expect(report()).toBe(true)

  await screen.getByRole('button', { name: /^preset/ }).click()
  await userEvent.keyboard('{Escape}')
  await expect.element(screen.getByRole('button', { name: /^preset/ })).toHaveAttribute('aria-expanded', 'false')
  expect(report()).toBe(true)
  await userEvent.keyboard('{Escape}')
  expect(report()).toBe(false)
}, 40_000)

test('r does nothing on the docs route', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await screen.getByRole('tab', { name: 'Docs', exact: true }).click()
  await expect
    .poll(() => screen.container.querySelector('#lab-panel')?.closest('main')?.hasAttribute('hidden'))
    .toBe(true)
  await userEvent.keyboard('r')
  expect(report()).toBe(false)
}, 40_000)

test('closing the report with the focus inside it moves the focus to the handle', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await screen.getByRole('button', { name: 'report' }).click()
  const inside = document.getElementById('lab-report')
  if (inside === null) throw new Error('no report')
  inside.tabIndex = -1
  inside.focus()
  await userEvent.keyboard('{Escape}')
  expect(report()).toBe(false)
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'report' }).element())
}, 40_000)
```

In `CommandPalette.browser.test.tsx`, the workspace case: rename to 'names all six hotkeys on the workspace, where every one of them is bound', add `expect(footer(screen)).toContain('report')`, count `6`; the docs case: add `expect(footer(screen)).not.toContain('report')`, count stays `3`.

- [ ] **Step 2: Run and see them fail**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/routes/LabLayout.browser.test.tsx src/palette/CommandPalette.browser.test.tsx -t "report|hotkeys"`
Expected: FAIL — `r` does nothing; the footer has 5 spans.

- [ ] **Step 3: `useReportKey` in `App.tsx`**, after `useSoloKey`:

```tsx
/**
 * The report drawer's keys (spec §4.3): `r` / `R` toggles it, Escape closes it,
 * both refused by `isHotkeyRefused` like `f`, and bound wherever the stage is.
 * Escape reaches this listener last: the palette consumes its own Escape in
 * its React handler and the preset panel in a capture-phase listener, and a
 * consumed event is refused here as `defaultPrevented`.
 */
function useReportKey(onWorkspace: boolean) {
  useEffect(() => {
    if (!onWorkspace) return
    const onKey = (event: KeyboardEvent) => {
      if (isHotkeyRefused(event)) return
      const ui = useStore.getState().ui
      if (event.key === 'Escape') {
        if (ui.report) ui.setReport(false)
      } else if (event.key === 'r' || event.key === 'R') {
        ui.toggleReport()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onWorkspace])
}
```

and `useReportKey(onWorkspace)` after `useSoloKey(onWorkspace)` in `Shell`.

- [ ] **Step 4: The footer.** In `CommandPalette.tsx`, inside the `onWorkspace ? (<>…</>)` branch after the `[ ]` span:

```tsx
              <span>
                <b>r</b> {dict.t('cmdHintReport')}
              </span>
```

and extend the comment above the branch: "`r` is bound by `useReportKey`, gated on the workspace the same way."

- [ ] **Step 5: Run green**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/routes/LabLayout.browser.test.tsx src/palette`
Expected: PASS, including the existing "Escape with the palette closed still leaves solo alone".

- [ ] **Step 6: Negative control** — in the preset panel's `onKey` (PresetStrip.tsx) comment out `event.preventDefault()` in the Escape branch and rerun the "Escape closes the report, but not while…" case: it must fail at `expect(report()).toBe(true)` after the preset Escape. Restore.

- [ ] **Step 7: Type check, lint, commit**

```bash
git add apps/lab/src/App.tsx apps/lab/src/palette/CommandPalette.tsx apps/lab/src/palette/CommandPalette.browser.test.tsx apps/lab/src/routes/LabLayout.browser.test.tsx
git commit -m "Toggle the report with R, close it with Escape, and list R in the palette"
```

---

### Task 9: A filled hover in the top bar, and thin scrollbars

**Files:**
- Modify: `apps/lab/src/design/shell.css` (`:484-489` top-bar segmented hover; scrollbars after the `html { color-scheme: dark }` rule)
- Modify: `apps/lab/src/design/palette.css:33-35` (⌘K hover)
- Test: `apps/lab/src/routes/LabLayout.browser.test.tsx`

**Interfaces:** none.

- [ ] **Step 1: Failing cases** — append to `LabLayout.browser.test.tsx`, adding `import '../design/palette.css'` to the file's imports and `import { contrast, shown } from '../design/contrast'`:

```tsx
// Spec §6: the bar's hover is a fill, like every other chip in the lab, and a
// fill `--ink` still reads on — the handoff's 12% ink measured about 4.2:1.
test('a hovered choice in the top bar is filled, not underlined, and still reads at AA', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  // Two locators written out: `getByRole` takes the ARIA role union, so a
  // role held in a `string` variable fails `lab:check`.
  const controls = [
    ['Simple', screen.getByRole('radio', { name: 'Simple' })],
    ['⌘K', screen.getByRole('button', { name: 'Command palette (⌘K)' })],
  ] as const
  for (const [name, control] of controls) {
    await userEvent.hover(control)
    const el = control.element()
    const style = getComputedStyle(el)
    expect(style.textDecorationLine, name).toBe('none')
    expect(style.backgroundColor, name).toBe('rgb(85, 97, 200)')
    const { front, back } = shown(el)
    expect(contrast(front, back), name).toBeGreaterThanOrEqual(4.5)
  }
}, 40_000)

// Spec §6: thin scrollbars in the lab's own colours.
test('the lab scrolls with thin scrollbars in the border colour', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  const knobs = screen.container.querySelector('.fw-knobs')
  if (knobs === null) throw new Error('no knob panel')
  const style = getComputedStyle(knobs)
  expect(style.scrollbarWidth).toBe('thin')
  expect(style.scrollbarColor).toBe('rgb(58, 62, 71) rgba(0, 0, 0, 0)')
}, 40_000)
```

`rgb(85, 97, 200)` is `--signal-fill-hover` (#5561c8) and `rgb(58, 62, 71)` is `--border-strong` (#3a3e47), both from `tokens.css`. If Chromium serialises `scrollbarColor` differently (for example `transparent` for the track), print the computed value once and match that spelling — the two colours are the assertion, not their notation. Read `design/contrast.ts` for `shown`'s exact signature before running; if it takes other arguments, adapt the call, not the threshold.

- [ ] **Step 2: Run and see them fail**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/routes/LabLayout.browser.test.tsx -t "hovered|scrollbars"`
Expected: FAIL — `underline`; scrollbar width `auto`.

- [ ] **Step 3: The hover.** Replace `.fw .fw-top .fw-seg button:not([aria-checked='true']):hover { … }` in `shell.css` with:

```css
/* The same hover as every other chip in the lab — a fill, no underline — in
   the bar's own terms (spec §6). `--signal-fill-hover`, not the handoff's 12%
   `--ink` over the plane: that blend measured about 4.2:1 under `--ink`. */
.fw .fw-top .fw-seg button:not([aria-checked='true']):hover {
  background: var(--signal-fill-hover);
  color: var(--ink);
}
```

and in `palette.css`:

```css
.fw-top .right > button:hover {
  background: var(--signal-fill-hover);
}
```

- [ ] **Step 4: The scrollbars**, in `shell.css` right after the `html { color-scheme: dark; }` rule:

```css
/* Scrollbars (spec §6): thin, square, on the surface they scroll — the thumb
   `--border-strong` at rest and `--ash` under the pointer, no track, no
   arrows. Firefox and current Chromium read `scrollbar-*`; WebKit and older
   Chromium the pseudo-elements. Full width where there is no hover. */
.fw,
.fw * {
  scrollbar-width: thin;
  scrollbar-color: var(--border-strong) transparent;
}
.fw ::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.fw ::-webkit-scrollbar-track,
.fw ::-webkit-scrollbar-corner {
  background: transparent;
}
.fw ::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border: 2px solid transparent;
  background-clip: padding-box;
}
.fw ::-webkit-scrollbar-thumb:hover {
  background-color: var(--ash);
}
.fw ::-webkit-scrollbar-button {
  display: none;
}
@media (pointer: coarse) {
  .fw,
  .fw * {
    scrollbar-width: auto;
  }
}
```

- [ ] **Step 5: Run green, and the whole matrix once more**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/routes src/shell`
Expected: PASS.

- [ ] **Step 6: Type check, lint, commit**

```bash
git add apps/lab/src/design/shell.css apps/lab/src/design/palette.css apps/lab/src/routes/LabLayout.browser.test.tsx
git commit -m "Fill the top bar's hover and thin the lab's scrollbars"
```

---

### Task 10: Gates and the live pass

**Files:** none unless a finding needs a fix (each fix is its own commit with a test first).

- [ ] **Step 1: The whole repository**

Run: `pnpm nx run-many -t verify --skip-nx-cache` and `cd packages/engine && deno task verify`
Expected: both green. Report the test counts.

- [ ] **Step 2: Live pass in Chrome with a real mouse** — two processes: `deno task store` (port 8777) and `pnpm nx serve lab` (port 8779); `pnpm nx build engine` first. At 1440×900, 860×900 and 420×900, in English and in Polish:
  - open the preset picker by mouse, choose a preset (the board carves, the trigger names it, the panel closes); open it with the keyboard (Tab to the trigger, Enter), move with the arrows, Escape;
  - move one knob: the trigger says "custom settings" and "edited since the last preset" appears; the top bar shows only `Arrowz / W×H`;
  - open and close the report by its handle, by R and by Escape; reload the page — the drawer comes back as it was left; solo (F) hides the drawer;
  - Copy the command, paste it into a terminal: one line, flags separated by spaces; set a long command (many knobs) and watch that Generate stays put;
  - hover the Simple/Advanced and PL/EN chips and ⌘K: a fill, no underline;
  - the open item from the handoff: in the board panel, do the sliders show their track? If not, open an issue-sized note in the PR description; do not fix it in this branch.

- [ ] **Step 3: Record what the pass found** in the PR description draft (for the controller), with the sizes and the language of each finding.
