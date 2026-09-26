# Lab row shell (PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every knob row in the lab renders through one `RowShell`, its ids follow one rule (`<scope>-<field>` plus `-help`/`-label`/`-why`/`-ends`), and the view's rows leave `ViewPanel.tsx` for `console/rows/`.

**Architecture:** A rename-only first commit brings the four odd ids in line with the rule, with the tests. Then `console/rows/RowShell.tsx` (the `kv-row` frame, label, `?`, description, `after` slot) and `rowIds(id)` (the only place a row id is composed) arrive with `useReleasableChip`. The view's rows move out of `ViewPanel.tsx` verbatim, then each family moves onto the shell: numbers (one generic `NumberRow`), switches, colours, theme and palette (one generic `FlagRow`), the knobs, and the simple view's rows. A grep guard keeps `kv-row` and row-id composition inside `RowShell.tsx`.

**Tech Stack:** React 19 + Zustand + Vitest 5 (projects `node` and `chromium`) in `apps/lab`; Nx + pnpm.

**Spec:** `docs/superpowers/specs/2026-09-26-lab-structural-refactors-design.md`, section "PR 2 — one row shell". Read it before Task 1.

## Global Constraints

- Branch `lab/row-shell`, created from `lab/view-schema` (`4c79a92`). Commit after every task; no attribution lines in commit messages. Never push.
- Everything in the repository is English: code, comments, tests, commit messages.
- No `any`, no non-null assertions (`!`). `tsconfig` has `exactOptionalPropertyTypes`: optional props are typed `?: T | undefined`.
- Comments say why, once: one line by default, at most 6 lines unless a module or API header (≤ 24 lines). No history in comments. Cite symbols, never `file.ts:NN`. `packages/engine/comments.test.ts` enforces this for `apps/lab/src`.
- The lab imports the engine and the board element from their `dist/`: if vitest cannot resolve `@arrowz/engine` or `@arrowz/board-element`, run `pnpm nx run-many -t build -p engine board-element`.
- `lab:fmt` is `prettier --check .`: run `cd apps/lab && pnpm exec prettier --write <changed files>` before every commit. Then `pnpm nx run lab:check` and `pnpm nx run lab:lint` (React Compiler and jsx-a11y rules are errors).
- Lab tests: `cd apps/lab && pnpm exec vitest run --project node <file>` for `*.test.ts(x)`, `--project chromium <file>` for `*.browser.test.tsx`; the whole lab suite is `cd apps/lab && pnpm exec vitest run`.
- **The DOM is frozen after Task 1.** Task 1 is the only task that edits existing test assertions, and only to rename ids. From Task 2 on, every existing test passes with no assertion edits; a failing existing test means the refactor changed the DOM — fix the code, never the test.
- `packages/cli/boards/` is gitignored: it is the user's real board store. Never edit, add or commit anything under it.

## Review Focus

1. **A row without a title has no `title` attribute** (the simple view's skeleton row). `title=""` would show an empty tooltip box in some browsers. Pinned in Task 2 ("a row without a title carries no title attribute").
2. **The row's classes keep their order and spelling** (`kv-row choice bad off`): CSS and `closest('.kv-row')` do not care about order, but tests and string comparisons read the class string. Pinned in Task 2 ("the row's classes read kv-row, then choice, bad, off").
3. **Every `aria-describedby`, `aria-controls` and `aria-labelledby` names an element that exists** after the ids move into `rowIds`. The whole lab suite's layout invariants (`harness/invariants.ts`, "Every `aria-describedby` token names an element") run in Task 8; Task 2 pins it for the shell itself ("the `?` controls the description, and the label names the control").
4. **The `auto` and special-value chips still release to the last value the row held**, now through one hook. Pinned in Task 2 (`useReleasableChip` tests), in Task 4 ("the head width's auto chip releases to the width the row held before", new) and by the existing `ValueKnob` chip test. That the hook records after the render, not during it, is guarded by `lab:lint` (`react-hooks/refs`), not by a test.
5. **The `mixing` share row under the start choice keeps its own ids** (`knob-mix`, `knob-mix-help`, `knob-mix-why`), rendered by `ValueKnob` inside `StartKnob`'s fragment. Pinned by the existing `KnobPanel` tests after the Task 1 rename, unedited from Task 2 on.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `apps/lab/src/console/rows/RowShell.tsx` | create | `RowShell`, `rowIds` |
| `apps/lab/src/console/rows/RowShell.browser.test.tsx` | create | the shell's DOM contract |
| `apps/lab/src/console/rows/useReleasableChip.ts` | create | the chip's "last value" memory |
| `apps/lab/src/console/rows/useReleasableChip.browser.test.tsx` | create | its two cases |
| `apps/lab/src/console/rows/NumberRow.tsx` | create (move, then rewrite) | `NumberRow` (generic), `FieldNumberRow`, `ViewNumberRow`, `PointRadiusRow`, `PadRow` |
| `apps/lab/src/console/rows/FlagRow.tsx` | create (move, then rewrite) | `FlagRow` (generic), `FieldFlagRow`, `SwitchRow` |
| `apps/lab/src/console/rows/ColourRow.tsx` | create (move, then rewrite) | `ColourRow` |
| `apps/lab/src/console/rows/ThemeRow.tsx` | create (move, then rewrite) | `ThemeRow`, `ThemeSwatchStrip` |
| `apps/lab/src/console/rows/PaletteRow.tsx` | create (move, then rewrite) | `PaletteRow` |
| `apps/lab/src/console/rows/Section.tsx` | create (move) | `Section` |
| `apps/lab/src/console/rows/ColoursSection.tsx` | create (move) | `ColoursSection` |
| `apps/lab/src/console/rows/rows.guard.test.ts` | create | grep guard |
| `apps/lab/src/console/ViewPanel.tsx` | modify | only `ViewPanel` remains |
| `apps/lab/src/console/ValueKnob.tsx`, `ChoiceKnob.tsx`, `StartKnob.tsx` | modify | on the shell |
| `apps/lab/src/console/FieldHelp.tsx` | delete (Task 6) | replaced by `rowIds` |
| `apps/lab/src/simple/SimplePanel.tsx`, `simple/PositionSlider.tsx` | modify | on the shell, new imports |
| `apps/lab/src/library/BoardPreview.tsx` | modify | new imports and row names |
| existing tests naming `knob-*-desc` and the three kebab view ids | modify (Task 1 only) | the rename |

---

### Task 1: Rename the four odd ids

The only task that edits existing test assertions. Code and tests change together; nothing else is in the commit.

**Files:**
- Modify: `apps/lab/src/console/FieldHelp.tsx`
- Modify: `apps/lab/src/console/ViewPanel.tsx` (`PointRadiusRow`, `ColoursSection`, `ViewPanel`)
- Modify: `apps/lab/src/console/ValueKnob.browser.test.tsx`, `ChoiceKnob.browser.test.tsx`, `StartKnob.browser.test.tsx`, `KnobPanel.browser.test.tsx`, `ViewPanel.browser.test.tsx`

**Interfaces:**
- Produces: the ids `knob-<key>-help` (was `knob-<key>-desc`), `view-pointRadius`, `view-pointColor`, `view-highlightColor` (were `view-point-radius`, `view-point-color`, `view-highlight-color`).

- [ ] **Step 1: Rename in code**

In `apps/lab/src/console/FieldHelp.tsx`, `descId` returns `` `knob-${key}-help` `` (the doc comment stays).

In `apps/lab/src/console/ViewPanel.tsx`:
- `PointRadiusRow`: `id="view-point-radius"` → `id="view-pointRadius"`.
- `ColoursSection`: the highlight `ColourRow` `id="view-highlight-color"` → `id="view-highlightColor"`.
- `ViewPanel`: the point colour `ColourRow` `id="view-point-color"` → `id="view-pointColor"`, and `forced={wanted === 'view-point-color' || wanted === 'view-point-radius'}` → `forced={wanted === 'view-pointColor' || wanted === 'view-pointRadius'}`.

- [ ] **Step 2: Rename in the tests**

```bash
cd "$(git rev-parse --show-toplevel)/apps/lab/src/console"
perl -pi -e 's/(knob-[A-Za-z]+)-desc/$1-help/g; s/view-point-radius/view-pointRadius/g; s/view-point-color/view-pointColor/g; s/view-highlight-color/view-highlightColor/g' \
  ValueKnob.browser.test.tsx ChoiceKnob.browser.test.tsx StartKnob.browser.test.tsx KnobPanel.browser.test.tsx ViewPanel.browser.test.tsx
```

Then check nothing else still names an old id:

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rnE "knob-[A-Za-z]+-desc|view-point-radius|view-point-color|view-highlight-color" apps/lab/src
```

Expected: no output. (`point-color` without `view-` is the board element's attribute and must stay.)

- [ ] **Step 3: Run the tests**

Run: `cd apps/lab && pnpm exec vitest run`
Expected: the whole lab suite passes (1208 tests at `4c79a92`).

Run: `pnpm nx run lab:check && pnpm nx run lab:lint`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add apps/lab/src/console
git commit -m "Lab: row ids follow one rule — knob descriptions end in -help, view ids spell the field"
```

---

### Task 2: `RowShell`, `rowIds` and `useReleasableChip`

**Files:**
- Create: `apps/lab/src/console/rows/RowShell.tsx`
- Create: `apps/lab/src/console/rows/RowShell.browser.test.tsx`
- Create: `apps/lab/src/console/rows/useReleasableChip.ts`
- Create: `apps/lab/src/console/rows/useReleasableChip.browser.test.tsx`

**Interfaces:**
- Consumes: `KnobLine`, `useKnobHelp` from `apps/lab/src/console/KnobRow.tsx`.
- Produces:
  - `rowIds(id: string): { help: string; label: string; why: string; ends: string }` — `${id}-help`, `${id}-label`, `${id}-why`, `${id}-ends`.
  - `RowShell(props)` with props `id: string`, `name: string` (the label's text and the `?`'s subject), `helpText: string`, `labelAs: 'for' | 'span'`, `title?: string | undefined`, `choice?`, `bad?`, `off?: boolean | undefined`, `after?: ReactNode`, plus every `KnobLine` prop except `label` and `help` (`value`, `min`, `control`, `max`, `wide`, `under`).
  - `useReleasableChip(value: number, isSpecial: boolean, fallback: () => number): () => number` — the returned function gives the value a released chip goes to.

- [ ] **Step 1: Write the failing tests**

`apps/lab/src/console/rows/RowShell.browser.test.tsx`:

```tsx
import { render } from 'vitest-browser-react'
import { expect, test } from 'vitest'
import { RowShell, rowIds } from './RowShell'

test('rowIds spells every part of a row from the row’s own id', () => {
  expect(rowIds('view-cell')).toEqual({
    help: 'view-cell-help',
    label: 'view-cell-label',
    why: 'view-cell-why',
    ends: 'view-cell-ends',
  })
})

test('the ? controls the description, and the label names the control', async () => {
  const screen = await render(
    <RowShell id="view-cell" name="square" helpText="how big" labelAs="for" control={<input id="view-cell" />} />,
  )
  const q = screen.container.querySelector('button.q')
  expect(q?.getAttribute('aria-controls')).toBe('view-cell-help')
  expect(screen.container.querySelector('#view-cell-help')?.textContent).toBe('how big')
  expect(screen.container.querySelector('label.kv-lab')?.getAttribute('for')).toBe('view-cell')
})

test('a span label carries the row’s label id', async () => {
  const screen = await render(
    <RowShell id="view-rounded" name="round" helpText="corners" labelAs="span" control={<button type="button" />} />,
  )
  const label = screen.container.querySelector('span.kv-lab')
  expect(label?.id).toBe('view-rounded-label')
  expect(label?.textContent).toBe('round')
})

test('a row without a title carries no title attribute', async () => {
  const screen = await render(<RowShell id="a" name="a" helpText="" labelAs="span" control={null} />)
  expect(screen.container.querySelector('.kv-row')?.hasAttribute('title')).toBe(false)
})

test('the row’s classes read kv-row, then choice, bad, off', async () => {
  const screen = await render(
    <RowShell id="k" name="k" helpText="" labelAs="for" title="t" choice bad off control={null} />,
  )
  const row = screen.container.querySelector('.kv-row')
  expect(row?.className).toBe('kv-row choice bad off')
  expect(row?.getAttribute('title')).toBe('t')
})

test('the after slot sits between the line and the description', async () => {
  const screen = await render(
    <RowShell id="k" name="k" helpText="h" labelAs="for" control={null} after={<p className="kv-why">why</p>} />,
  )
  const children = [...(screen.container.querySelector('.kv-row')?.children ?? [])].map((el) => el.className)
  expect(children).toEqual(['ln', 'kv-why', 'kv-help fw-vh'])
})
```

`apps/lab/src/console/rows/useReleasableChip.browser.test.tsx`:

```tsx
import { useState } from 'react'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { expect, test } from 'vitest'
import { useReleasableChip } from './useReleasableChip'

/** A row that holds `value` and shows where its chip would release to. */
function Probe({ value, special }: { value: number; special: boolean }) {
  const release = useReleasableChip(value, special, () => 99)
  const [shown, setShown] = useState<number | null>(null)
  return (
    <button type="button" onClick={() => setShown(release())}>
      {shown === null ? 'release' : String(shown)}
    </button>
  )
}

test('a released chip goes back to the last value the row held', async () => {
  const screen = await render(<Probe value={7} special={false} />)
  await screen.rerender(<Probe value={0} special />)
  await userEvent.click(screen.getByRole('button'))
  await expect.element(screen.getByRole('button')).toHaveTextContent('7')
})

test('with no value held before, a released chip goes to the fallback', async () => {
  const screen = await render(<Probe value={0} special />)
  await userEvent.click(screen.getByRole('button'))
  await expect.element(screen.getByRole('button')).toHaveTextContent('99')
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/console/rows/`
Expected: FAIL — the two modules do not exist yet.

- [ ] **Step 3: Write the implementation**

`apps/lab/src/console/rows/RowShell.tsx`:

```tsx
import type { ComponentProps, ReactElement, ReactNode } from 'react'
import { KnobLine, useKnobHelp } from '../KnobRow'

/** Every id a row's parts carry, from the row's own id: the one place they are spelled. */
export function rowIds(id: string) {
  return { help: `${id}-help`, label: `${id}-label`, why: `${id}-why`, ends: `${id}-ends` }
}

/**
 * The frame every knob row shares: the `kv-row` element, the label — a
 * `<label>` for a native control, a named `<span>` for a switch, a segmented
 * control or a list — the `?` with its description, and `KnobLine`'s tracks.
 * `after` sits between the line and the description: a knob's state line, the
 * theme's swatches. The caller names the control's own ids through `rowIds`.
 */
export function RowShell({
  id,
  name,
  helpText,
  labelAs,
  title,
  choice = false,
  bad = false,
  off = false,
  after = null,
  ...line
}: {
  id: string
  name: string
  helpText: string
  labelAs: 'for' | 'span'
  title?: string | undefined
  choice?: boolean | undefined
  bad?: boolean | undefined
  off?: boolean | undefined
  after?: ReactNode
} & Omit<ComponentProps<typeof KnobLine>, 'label' | 'help'>): ReactElement {
  const ids = rowIds(id)
  const { button, paragraph } = useKnobHelp(ids.help, name, helpText)
  const label =
    labelAs === 'for' ? (
      <label className="kv-lab" htmlFor={id}>
        {name}
      </label>
    ) : (
      <span className="kv-lab" id={ids.label}>
        {name}
      </span>
    )
  return (
    <div className={`kv-row${choice ? ' choice' : ''}${bad ? ' bad' : ''}${off ? ' off' : ''}`} title={title}>
      <KnobLine label={label} help={button} {...line} />
      {after}
      {paragraph}
    </div>
  )
}
```

`apps/lab/src/console/rows/useReleasableChip.ts`:

```ts
import { useEffect, useRef } from 'react'

/**
 * Where a row's special-value chip (`auto`, a knob's word) releases to: the
 * last other value the row held, recorded after each render rather than during
 * it, else `fallback`. Returns the value; the caller writes it.
 */
export function useReleasableChip(value: number, isSpecial: boolean, fallback: () => number): () => number {
  const last = useRef<number | null>(null)
  useEffect(() => {
    if (!isSpecial) last.current = value
  }, [value, isSpecial])
  return () => last.current ?? fallback()
}
```

If `vitest-browser-react`'s `rerender` is not awaitable in this version, drop the `await` before it and keep the rest.

- [ ] **Step 4: Run the tests**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/console/rows/`
Expected: PASS (8 tests).

Run: prettier on the four files, `pnpm nx run lab:check`, `pnpm nx run lab:lint`.
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/console/rows
git commit -m "Lab: RowShell frames a knob row and rowIds spells its ids; useReleasableChip remembers where a chip releases to"
```

---

### Task 3: Move the view's rows out of `ViewPanel.tsx`, unchanged

A pure move: no line of any component body changes. Only imports and exports move.

**Files:**
- Create: `apps/lab/src/console/rows/Section.tsx`, `NumberRow.tsx`, `FlagRow.tsx`, `ColourRow.tsx`, `ThemeRow.tsx`, `PaletteRow.tsx`, `ColoursSection.tsx`
- Modify: `apps/lab/src/console/ViewPanel.tsx`, `apps/lab/src/simple/SimplePanel.tsx`, `apps/lab/src/library/BoardPreview.tsx`

**Interfaces:**
- Produces (exports, bodies unchanged from `ViewPanel.tsx`):
  - `rows/Section.tsx`: `Section`
  - `rows/NumberRow.tsx`: `ViewNumberRow`, `NumberRow`, `PointRadiusRow`, `PadRow` (`ElementNumberRow` stays module-private)
  - `rows/FlagRow.tsx`: `SwitchRow`, `FlagRow`
  - `rows/ColourRow.tsx`: `ColourRow`
  - `rows/ThemeRow.tsx`: `ThemeRow` (`ThemeSwatchStrip` module-private)
  - `rows/PaletteRow.tsx`: `PaletteRow`
  - `rows/ColoursSection.tsx`: `ColoursSection`
  - `console/ViewPanel.tsx`: `ViewPanel` only

- [ ] **Step 1: Move each component with its doc comment**

Cut each of these from `apps/lab/src/console/ViewPanel.tsx`, verbatim with its doc comment, into its file; add `export` where the list above says so (`PointRadiusRow`, `PadRow`, `ColourRow`, `PaletteRow` were private and become exported, because `ViewPanel` and `ColoursSection` import them now). Each new file imports exactly what its bodies use, with paths one level up: `'../../i18n'`, `'../../state/store'`, `'../../state/view.slice'`, `'../KnobRow'`, `'../DraftNumber'`, `'../viewFields'`, `'@arrowz/engine'`, `'@arrowz/engine/command'`, `'@arrowz/board-element'`, `'react'`, and sibling rows (`'./Section'`, `'./ThemeRow'`, `'./ColourRow'`, `'./PaletteRow'` for `ColoursSection`).

`ViewPanel.tsx` keeps `ViewPanel` and imports `CollapsibleBlock` from `'./KnobRow'`, `panelId`, `tabId` from `'./GroupRail'`, `useDictionary`, `useStore`, and from the rows: `Section`, `ViewNumberRow`, `PadRow`, `PointRadiusRow`, `SwitchRow`, `ColourRow`, `ColoursSection`.

- [ ] **Step 2: Update the two importers**

`apps/lab/src/simple/SimplePanel.tsx`: replace `import { Section, SwitchRow, ThemeRow, ViewNumberRow } from '../console/ViewPanel'` with

```ts
import { SwitchRow } from '../console/rows/FlagRow'
import { ViewNumberRow } from '../console/rows/NumberRow'
import { Section } from '../console/rows/Section'
import { ThemeRow } from '../console/rows/ThemeRow'
```

`apps/lab/src/library/BoardPreview.tsx`: replace `import { ColoursSection, FlagRow, NumberRow, Section } from '../console/ViewPanel'` with

```ts
import { ColoursSection } from '../console/rows/ColoursSection'
import { FlagRow } from '../console/rows/FlagRow'
import { NumberRow } from '../console/rows/NumberRow'
import { Section } from '../console/rows/Section'
```

- [ ] **Step 3: Prove the bodies did not change**

```bash
cd "$(git rev-parse --show-toplevel)"
export LC_ALL=C
git diff -U0 HEAD -- apps/lab/src/console/ViewPanel.tsx | grep '^-' | grep -v '^---' | grep -vE "^-\s*(import|export|\}|$)" | sed 's/^-//' | sort > /tmp/removed.txt
cat apps/lab/src/console/rows/{Section,NumberRow,FlagRow,ColourRow,ThemeRow,PaletteRow,ColoursSection}.tsx | sort > /tmp/added.txt
wc -l < /tmp/removed.txt
comm -23 /tmp/removed.txt /tmp/added.txt
comm -13 /tmp/removed.txt /tmp/added.txt | grep -vE "^\s*(import|export|\}|$)" 
```

Expected: the line count is in the hundreds (0 means the diff ran in the wrong tree); the first `comm` prints exactly the four signature lines that gained `export` (`function ColourRow({`, `function PadRow…`, `function PaletteRow…`, `function PointRadiusRow…`); the second prints nothing. Any other line means a body changed: undo that change.

- [ ] **Step 4: Run the tests**

Run: `cd apps/lab && pnpm exec vitest run`
Expected: the whole lab suite passes, no test edited.

Run: prettier on the changed files, `pnpm nx run lab:check`, `pnpm nx run lab:lint`.

- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/console apps/lab/src/simple/SimplePanel.tsx apps/lab/src/library/BoardPreview.tsx
git commit -m "Lab: the view's rows move to console/rows, bodies unchanged; ViewPanel keeps only the panel"
```

---

### Task 4: One `NumberRow` on the shell

**Files:**
- Modify: `apps/lab/src/console/rows/NumberRow.tsx` (whole file)
- Modify: `apps/lab/src/library/BoardPreview.tsx` (the `NumberRow` import and call)
- Create: `apps/lab/src/console/rows/NumberRow.browser.test.tsx`

**Interfaces:**
- Consumes: `RowShell`, `rowIds` (Task 2); `useReleasableChip` (Task 2); `VIEW_ROWS`, `autoHeadWidth` from `'../viewFields'`.
- Produces:
  - `NumberRow({ id, name, title, help, value, range, step, unit, auto?, onSet })` — generic; `unit` is the unit's text, already in the page's language; `auto?: (() => number) | undefined` is where a released `auto` chip goes, present only for a number whose 0 is automatic.
  - `FieldNumberRow({ field, value, stroke, onSet })` — a view number from `VIEW_ROWS` for any owner (the old `NumberRow` signature).
  - `ViewNumberRow({ field })`, `PointRadiusRow()`, `PadRow()` — unchanged signatures.
  - `ElementNumberRow` is deleted.

- [ ] **Step 1: Pin the view chip's release before the rewrite**

No existing test checks that the head width's `auto` chip goes back to the width the row held (only its fallback). `apps/lab/src/console/rows/NumberRow.browser.test.tsx`:

```tsx
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { afterEach, expect, test } from 'vitest'
import { useStore } from '../../state/store'
import { ViewNumberRow } from './NumberRow'

// The view slice has no reset of its own; restore the module's starting view.
const initialView = useStore.getState().view
afterEach(() => useStore.setState({ view: initialView }))

test("the head width's auto chip releases to the width the row held before", async () => {
  useStore.getState().view.setNumber('headWidth', '0.5')
  const screen = await render(<ViewNumberRow field="headWidth" />)
  const chip = screen.getByRole('button', { name: /^auto \(/ })
  await userEvent.click(chip)
  expect(useStore.getState().view.headWidth).toBe(0)
  await userEvent.click(chip)
  expect(useStore.getState().view.headWidth).toBe(0.5)
})
```

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/console/rows/NumberRow.browser.test.tsx`
Expected: PASS on the moved, unchanged code — it pins behaviour the rewrite must keep. Check it can fail: temporarily make `NumberRow`'s chip release to `autoHeadWidth(...)` directly, see it go red on the second `toBe`, restore.

- [ ] **Step 2: Rewrite the file**

`apps/lab/src/console/rows/NumberRow.tsx`:

```tsx
import { PAD_RANGE, POINT_RADIUS_RANGE } from '@arrowz/board-element'
import type { ViewNumber } from '@arrowz/engine'
import { VIEW_RANGE } from '@arrowz/engine/command'
import type { ReactElement } from 'react'
import { useDictionary } from '../../i18n'
import { useStore } from '../../state/store'
import { DraftNumber } from '../DraftNumber'
import { endText, KnobTrack, rowTitle } from '../KnobRow'
import { autoHeadWidth, VIEW_ROWS } from '../viewFields'
import { RowShell, rowIds } from './RowShell'
import { useReleasableChip } from './useReleasableChip'

/**
 * A number as a knob row, for any owner and any bounds: the value, the range
 * (read by the caller, never copied here), the drawn track and the description
 * on demand. `onSet` gets what was typed or dragged; clamping is the owner's.
 * With `auto`, 0 is the automatic value: a chip in the minimum's track.
 */
export function NumberRow({
  id,
  name,
  title,
  help,
  value,
  range,
  step,
  unit,
  auto,
  onSet,
}: {
  id: string
  name: string
  title: string
  help: string
  value: number
  range: { min: number; max: number }
  step: number
  /** The unit's text, already in the page's language. */
  unit: string
  /** Where a released `auto` chip goes. */
  auto?: (() => number) | undefined
  onSet(next: number): void
}): ReactElement {
  const dict = useDictionary()
  const isAuto = auto !== undefined && value === 0
  const release = useReleasableChip(value, isAuto, () => (auto === undefined ? range.min : auto()))
  const helpId = rowIds(id).help
  const word = isAuto ? 'auto' : null
  return (
    <RowShell
      id={id}
      name={name}
      helpText={help}
      labelAs="for"
      title={title}
      value={
        <span className="kv-val">
          <DraftNumber
            label={name}
            value={value}
            word={word}
            wordOnly
            className="kv-num"
            describedBy={helpId}
            decimal={!Number.isInteger(step)}
            onCommit={onSet}
          />
          <span className="kv-unit">{isAuto ? '' : unit}</span>
        </span>
      }
      min={
        auto === undefined ? (
          <span className="kv-end">{endText(dict, range.min)}</span>
        ) : (
          <button
            type="button"
            className="kv-chip"
            aria-pressed={isAuto}
            aria-label={`auto (${name})`}
            onClick={() => onSet(isAuto ? release() : 0)}
          >
            auto
          </button>
        )
      }
      control={
        <KnobTrack
          id={id}
          value={value}
          bounds={range}
          step={step}
          word={word}
          describedBy={helpId}
          onCommit={onSet}
        />
      }
      max={<span className="kv-end">{endText(dict, range.max)}</span>}
    />
  )
}

/**
 * A view number from `VIEW_ROWS`, for any owner of a view: the lab's slice
 * (`ViewNumberRow`) or a stored board's meta on the saved boards.
 */
export function FieldNumberRow({
  field,
  value,
  stroke,
  onSet,
}: {
  field: ViewNumber
  value: number
  /** The stroke the automatic head width is worked out from. */
  stroke: number
  onSet(next: number): void
}): ReactElement {
  const dict = useDictionary()
  const row = VIEW_ROWS[field]
  const range = VIEW_RANGE[field]
  return (
    <NumberRow
      id={`view-${field}`}
      name={dict.t(row.short)}
      title={rowTitle(dict, dict.t(row.label), range)}
      help={dict.t(row.help)}
      value={value}
      range={range}
      step={row.step}
      unit={dict.d.units[row.unit]}
      auto={row.auto === true ? () => autoHeadWidth(stroke, row.step, range.max) : undefined}
      onSet={onSet}
    />
  )
}

/** A view number bound to the lab's slice, whose reader clamps to `VIEW_RANGE`. */
export function ViewNumberRow({ field }: { field: ViewNumber }): ReactElement {
  const value = useStore((state) => state.view[field])
  const stroke = useStore((state) => state.view.stroke)
  const setNumber = useStore((state) => state.view.setNumber)
  return (
    <FieldNumberRow field={field} value={value} stroke={stroke} onSet={(next) => setNumber(field, String(next))} />
  )
}

/** The point grid's dot radius, bounded by the element (`POINT_RADIUS_RANGE`). */
export function PointRadiusRow(): ReactElement {
  const dict = useDictionary()
  const value = useStore((state) => state.view.pointRadius)
  const setPointRadius = useStore((state) => state.view.setPointRadius)
  return (
    <NumberRow
      id="view-pointRadius"
      name={dict.t('viewShortPointRadius')}
      title={rowTitle(dict, dict.t('pointRadiusLabel'), POINT_RADIUS_RANGE)}
      help={dict.t('pointRadiusHelp')}
      value={value}
      range={POINT_RADIUS_RANGE}
      // A keyboard convenience, not a claim about what is allowed.
      step={0.01}
      unit={dict.d.units.cells}
      onSet={(next) => setPointRadius(String(next))}
    />
  )
}

/** The margin around the board, bounded by the element (`PAD_RANGE`), in whole cells. */
export function PadRow(): ReactElement {
  const dict = useDictionary()
  const value = useStore((state) => state.view.pad)
  const setPad = useStore((state) => state.view.setPad)
  return (
    <NumberRow
      id="view-pad"
      name={dict.t('viewShortPad')}
      title={rowTitle(dict, dict.t('padLabel'), PAD_RANGE)}
      help={dict.t('padHelp')}
      value={value}
      range={PAD_RANGE}
      step={1}
      unit={dict.d.units.cells}
      onSet={setPad}
    />
  )
}
```

Why this keeps the DOM: `decimal={!Number.isInteger(step)}` equals the old `!range.whole` for all five view numbers (`cell` and `top` are whole with step 1; `stroke`, `headWidth`, `headHeight` are fractional with step 0.05), and equals `ElementNumberRow`'s own rule; `word={null}` with `wordOnly` renders what `DraftNumber` rendered without them.

- [ ] **Step 3: Update `BoardPreview`**

In `apps/lab/src/library/BoardPreview.tsx`: import `FieldNumberRow` instead of `NumberRow` from `'../console/rows/NumberRow'`, and in the `STORED_NUMBERS.map`, `<NumberRow` becomes `<FieldNumberRow` (props unchanged).

- [ ] **Step 4: Run the tests**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/console/ViewPanel.browser.test.tsx src/simple/SimplePanel.browser.test.tsx src/library/BoardPreview.browser.test.tsx src/console/rows/`
Expected: PASS, no test edited.

Run: the whole lab suite once, prettier, `lab:check`, `lab:lint`.

- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/console/rows/NumberRow.tsx apps/lab/src/console/rows/NumberRow.browser.test.tsx apps/lab/src/library/BoardPreview.tsx
git commit -m "Lab: one NumberRow on the shell for view numbers, the dot radius and the margin"
```

---

### Task 5: Switches, colours, theme and palette on the shell

**Files:**
- Modify: `apps/lab/src/console/rows/FlagRow.tsx`, `ColourRow.tsx`, `ThemeRow.tsx`, `PaletteRow.tsx` (whole files)
- Modify: `apps/lab/src/library/BoardPreview.tsx` (the two `FlagRow` calls)
- Modify: `apps/lab/src/simple/SimplePanel.tsx` (`RandomRow`)

**Interfaces:**
- Consumes: `RowShell`, `rowIds` (Task 2).
- Produces:
  - `FlagRow({ id, name, title, help, on, onToggle, buttonTitle? })` — generic switch row; `buttonTitle?: string | undefined` is a title on the switch itself.
  - `FieldFlagRow({ flag, on, onToggle })` — a view flag from `VIEW_ROWS` for any owner (the old `FlagRow` signature).
  - `SwitchRow({ flag })` — unchanged.
  - `ColourRow`, `ThemeRow`, `PaletteRow` — signatures unchanged.

- [ ] **Step 1: `FlagRow.tsx`**

```tsx
import type { ReactElement } from 'react'
import { useDictionary } from '../../i18n'
import { useStore } from '../../state/store'
import type { ViewFlag } from '../../state/view.slice'
import { VIEW_ROWS } from '../viewFields'
import { RowShell, rowIds } from './RowShell'

/**
 * A switch as a knob row: its value (`on` / `off`) in the value track, in the
 * numbers' colour, and the switch at the control track's right edge.
 */
export function FlagRow({
  id,
  name,
  title,
  help,
  on,
  onToggle,
  buttonTitle,
}: {
  id: string
  name: string
  title: string
  help: string
  on: boolean
  onToggle(): void
  /** A title on the switch itself, for a row whose control sits apart from its label. */
  buttonTitle?: string | undefined
}): ReactElement {
  const dict = useDictionary()
  const ids = rowIds(id)
  return (
    <RowShell
      id={id}
      name={name}
      helpText={help}
      labelAs="span"
      title={title}
      value={<span className="kv-unit">{dict.t(on ? 'valueOn' : 'valueOff')}</span>}
      control={
        <button
          type="button"
          id={id}
          className="fw-sw"
          role="switch"
          aria-checked={on}
          aria-labelledby={ids.label}
          aria-describedby={ids.help}
          title={buttonTitle}
          onClick={onToggle}
        />
      }
    />
  )
}

/** A view flag from `VIEW_ROWS`, for any owner of a view, as `FieldNumberRow` is. */
export function FieldFlagRow({ flag, on, onToggle }: { flag: ViewFlag; on: boolean; onToggle(): void }): ReactElement {
  const dict = useDictionary()
  const row = VIEW_ROWS[flag]
  return (
    <FlagRow
      id={`view-${flag}`}
      name={dict.t(row.short)}
      title={dict.t(row.label)}
      help={dict.t(row.help)}
      on={on}
      onToggle={onToggle}
    />
  )
}

/** A view flag bound to the lab's slice. */
export function SwitchRow({ flag }: { flag: ViewFlag }): ReactElement {
  const on = useStore((state) => state.view[flag])
  const toggle = useStore((state) => state.view.toggle)
  return <FieldFlagRow flag={flag} on={on} onToggle={() => toggle(flag)} />
}
```

`BoardPreview.tsx`: import `FieldFlagRow` instead of `FlagRow` from `'../console/rows/FlagRow'`; the two `<FlagRow flag=… on=… onToggle=… />` calls become `<FieldFlagRow …/>` with the same props.

`SimplePanel.tsx`: replace `RandomRow`'s body (keep its doc comment) with

```tsx
function RandomRow(): ReactElement {
  const dict = useDictionary()
  const random = useStore((state) => state.recipe.value.random)
  const setRandom = useStore((state) => state.recipe.setRandom)
  return (
    <FlagRow
      id="simple-random"
      name={dict.d.simple.randomizeShort}
      title={dict.d.simple.randomize}
      help={dict.d.simple.randomizeHelp}
      on={random}
      onToggle={() => setRandom(!random)}
      buttonTitle={dict.d.simple.randomize}
    />
  )
}
```

and import `FlagRow` alongside `SwitchRow`: `import { FlagRow, SwitchRow } from '../console/rows/FlagRow'`.

- [ ] **Step 2: `ColourRow.tsx`** — keep the doc comment and the props type; the body becomes

```tsx
  return (
    <RowShell
      id={id}
      name={short}
      helpText={help}
      labelAs="for"
      title={title}
      value={<span className="kv-unit">{value}</span>}
      control={
        <span className="kv-colour">
          {onClear === undefined ? null : (
            <button type="button" className="fw-palette-remove" aria-label={clearLabel} onClick={onClear}>
              ×
            </button>
          )}
          <input
            id={id}
            type="color"
            value={value}
            aria-describedby={rowIds(id).help}
            onChange={(e) => onChange(e.target.value)}
          />
        </span>
      }
    />
  )
```

(imports: `RowShell`, `rowIds` from `'./RowShell'`; `KnobLine` and `useKnobHelp` are no longer imported).

- [ ] **Step 3: `ThemeRow.tsx`** — `ThemeSwatchStrip` unchanged; imports: `RowShell`, `rowIds` from `'./RowShell'` in, `KnobLine` and `useKnobHelp` out; `ThemeRow`'s body becomes

```tsx
  const dict = useDictionary()
  const theme = useStore((state) => state.view.theme)
  const setTheme = useStore((state) => state.view.setTheme)
  return (
    <RowShell
      id="view-theme"
      name={dict.t('viewShortTheme')}
      helpText={dict.t('themeHelp')}
      labelAs="for"
      title={dict.t('themeLabel')}
      control={
        <select
          id="view-theme"
          value={theme}
          aria-describedby={rowIds('view-theme').help}
          onChange={(e) => setTheme(e.target.value)}
        >
          <option value="">{dict.t('viewThemeNone')}</option>
          {Object.keys(THEMES).map((themeName) => (
            <option key={themeName} value={themeName}>
              {themeName}
            </option>
          ))}
        </select>
      }
      after={<ThemeSwatchStrip themeName={theme} />}
    />
  )
```

- [ ] **Step 4: `PaletteRow.tsx`** — keep the doc comment; the function becomes

```tsx
export function PaletteRow(): ReactElement {
  const dict = useDictionary()
  const palette = useStore((state) => state.view.palette)
  const addPaletteColor = useStore((state) => state.view.addPaletteColor)
  const setPaletteColor = useStore((state) => state.view.setPaletteColor)
  const removePaletteColor = useStore((state) => state.view.removePaletteColor)
  const ids = rowIds('view-palette')
  return (
    <RowShell
      id="view-palette"
      name={dict.t('viewShortPalette')}
      helpText={dict.t('paletteHelp', PALETTE_CAP)}
      labelAs="span"
      title={dict.t('paletteLabel')}
      wide
      value={<span className="kv-unit">{dict.t('paletteCount', palette.length, PALETTE_CAP)}</span>}
      control={
        <span className="kv-colour">
          {palette.length === 0 ? null : (
            <ul className="fw-palette-list" aria-labelledby={ids.label}>
              {palette.map((color, index) => (
                // No stable id per colour — a value can repeat, and only its
                // position in the list is unique.
                <li key={index} className="fw-palette-row">
                  <label className="fw-vh" htmlFor={`view-palette-${index}`}>
                    {dict.t('paletteColorLabel', index + 1)}
                  </label>
                  <input
                    id={`view-palette-${index}`}
                    type="color"
                    value={color}
                    onChange={(e) => setPaletteColor(index, e.target.value)}
                  />
                  <button
                    type="button"
                    className="fw-palette-remove"
                    aria-label={dict.t('paletteRemove', index + 1)}
                    onClick={() => removePaletteColor(index)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* `disabled` alone leaves a screen reader saying only "add colour,
              dimmed" at the cap; the description states the cap in words,
              so the refusal is audible too. */}
          <button
            type="button"
            className="kv-chip"
            onClick={addPaletteColor}
            disabled={palette.length >= PALETTE_CAP}
            aria-describedby={ids.help}
          >
            {dict.t('paletteAdd')}
          </button>
        </span>
      }
    />
  )
}
```

(imports: `RowShell`, `rowIds` from `'./RowShell'`; `KnobLine` and `useKnobHelp` are no longer imported).

- [ ] **Step 5: Run the tests**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/console/ViewPanel.browser.test.tsx src/simple/SimplePanel.browser.test.tsx src/library/BoardPreview.browser.test.tsx src/design/`
Expected: PASS, no test edited.

Run: the whole lab suite once, prettier, `lab:check`, `lab:lint`.

- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/console/rows apps/lab/src/library/BoardPreview.tsx apps/lab/src/simple/SimplePanel.tsx
git commit -m "Lab: switches, colours, theme and palette rows on the shell; the simple view's randomise row is a FlagRow"
```

---

### Task 6: The knob rows on the shell

**Files:**
- Modify: `apps/lab/src/console/ValueKnob.tsx`, `ChoiceKnob.tsx`, `StartKnob.tsx`
- Delete: `apps/lab/src/console/FieldHelp.tsx`

**Interfaces:**
- Consumes: `RowShell`, `rowIds`, `useReleasableChip` (Task 2).
- Produces: `ValueKnob`, `ChoiceKnob`, `StartKnob` with unchanged props; no `descId` anywhere.

- [ ] **Step 1: `ValueKnob.tsx`**

Imports: drop `useEffect`, `useRef` and `descId`; drop `KnobLine`, `useKnobHelp` from `'./KnobRow'`; add `import { RowShell, rowIds } from './rows/RowShell'` and `import { useReleasableChip } from './rows/useReleasableChip'`.

Replace the block from `// Where a released chip goes:` through the end of the returned JSX with:

```tsx
  // Where a released chip goes: the last value this row held, else the
  // default, else `RELEASE_TO`, else one step up.
  const release = useReleasableChip(value, isSpecial, () =>
    spec.def !== bounds.min ? spec.def : (RELEASE_TO[spec.key] ?? bounds.min + spec.step),
  )
  const bound = boundOn(floor, bounds)
  const { text, off } = rowState(dict, { broken, inactive, bound, blockReason })
  const id = `knob-${spec.key}`
  const ids = rowIds(id)
  const describedBy = `${ids.why} ${ids.help}`
  const unit = UNIT_OF[spec.key]

  return (
    <RowShell
      id={id}
      name={name}
      helpText={help}
      labelAs="for"
      title={rowTitle(dict, label, bounds)}
      bad={broken !== undefined}
      off={off}
      value={
        <span className="kv-val">
          <DraftNumber
            label={name}
            value={value}
            word={isSpecial ? specialText : null}
            wordOnly
            className="kv-num"
            describedBy={describedBy}
            decimal={!Number.isInteger(spec.step)}
            // Held inside the *passed* bounds first: the mix row's own range
            // is narrower than the knob's, and only it knows that.
            onCommit={(typed) => write(Math.min(bounds.max, Math.max(bounds.min, typed)))}
          />
          <span className="kv-unit">{isSpecial || unit === undefined ? '' : dict.d.units[unit]}</span>
        </span>
      }
      min={
        special === null ? (
          <span className="kv-end">{endText(dict, bounds.min)}</span>
        ) : (
          <button
            type="button"
            className="kv-chip"
            aria-pressed={isSpecial}
            // Not `${name}: ${special}`: that is the value button's name
            // while the knob holds the special value, and two buttons of
            // one name are one button to a screen reader.
            aria-label={`${specialText} (${name})`}
            onClick={() => write(isSpecial ? release() : bounds.min)}
          >
            {specialText}
          </button>
        )
      }
      control={
        <KnobTrack
          id={id}
          value={value}
          bounds={bounds}
          step={spec.step}
          floor={floor}
          word={word}
          describedBy={describedBy}
          onCommit={(next) => write(next)}
        />
      }
      max={<span className="kv-end">{endText(dict, bounds.max)}</span>}
      after={
        <p className="kv-why" id={ids.why} data-testid={ids.why}>
          {text}
        </p>
      }
    />
  )
}
```

Before editing, read the current `ValueKnob`: every line above that is not about the shell, `rowIds` or `useReleasableChip` must match it (the `DraftNumber`, chip and `KnobTrack` props, the two comments). `broken` is `readonly Violation[] | undefined`, so `broken !== undefined` is the old truthiness test.

- [ ] **Step 2: `ChoiceKnob.tsx`**

Imports: drop `descId` and `KnobLine`, `useKnobHelp`; add `import { RowShell, rowIds } from './rows/RowShell'`. The body after `const { text, off } = …` becomes

```tsx
  const id = `knob-${spec.key}`
  const ids = rowIds(id)
  return (
    <RowShell
      id={id}
      name={name}
      helpText={help}
      labelAs="for"
      title={rowTitle(dict, label)}
      choice
      bad={broken !== undefined}
      off={off}
      control={
        <select
          id={id}
          value={value}
          aria-describedby={`${ids.why} ${ids.help}`}
          onChange={(event) => set(spec.key, Number(event.currentTarget.value))}
        >
          {choices.map((choice) => (
            <option key={choice.word} value={choice.value}>
              {dict.choiceText(spec.key, choice.word)}
            </option>
          ))}
        </select>
      }
      after={
        <p className="kv-why" id={ids.why} data-testid={ids.why}>
          {text}
        </p>
      }
    />
  )
```

(`const whyId` goes.)

- [ ] **Step 3: `StartKnob.tsx`**

Imports: drop `descId` and `KnobLine`, `useKnobHelp`; add `import { RowShell, rowIds } from './rows/RowShell'`. The returned fragment becomes

```tsx
  return (
    <>
      <RowShell
        id="knob-start"
        name={name}
        helpText={start.help}
        labelAs="for"
        title={rowTitle(dict, start.label)}
        choice
        control={
          <select
            id="knob-start"
            value={choice}
            aria-describedby={rowIds('knob-start').help}
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
        }
      />
      {choice === 'mixing' ? <ValueKnob spec={MIX_SPEC} bounds={START.mix} /> : null}
    </>
  )
```

(`const { button, paragraph } = …` goes.)

- [ ] **Step 4: Delete `FieldHelp.tsx`**

```bash
git rm apps/lab/src/console/FieldHelp.tsx
grep -rn "descId\|FieldHelp" apps/lab/src
```

Expected: no output.

- [ ] **Step 5: Run the tests**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/console/ValueKnob.browser.test.tsx src/console/ChoiceKnob.browser.test.tsx src/console/StartKnob.browser.test.tsx src/console/KnobPanel.browser.test.tsx src/console/useFocusRequest.browser.test.tsx src/design/`
Expected: PASS, no test edited.

Run: the whole lab suite once, prettier, `lab:check`, `lab:lint`.

- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/console
git commit -m "Lab: the knob rows on the shell; one hook remembers where a special value's chip releases to"
```

---

### Task 7: The simple view's rows on the shell, and the guard

**Files:**
- Modify: `apps/lab/src/simple/SimplePanel.tsx` (`SkeletonRow`), `apps/lab/src/simple/PositionSlider.tsx`
- Create: `apps/lab/src/console/rows/rows.guard.test.ts`

**Interfaces:**
- Consumes: `RowShell`, `rowIds` (Task 2).

- [ ] **Step 1: Write the guard (failing)**

`apps/lab/src/console/rows/rows.guard.test.ts`:

```ts
import { expect, test } from 'vitest'

// Every source under console/ and simple/, as text, tests excluded.
const SOURCES = import.meta.glob<string>(['../../console/**/*.{ts,tsx}', '../../simple/**/*.{ts,tsx}', '!**/*.test.*'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

// `import.meta.glob` keys a file by its shortest path from here.
const OWNER = './RowShell.tsx'

// A `${…}-` composition or a literal id with two dashes: the classes `kv-help`, `kv-why`, `kv-ends` do not count.
const ROW_PART_ID = /(\}|\w-\w+)-(help|why|desc|ends|label)[`'"]/

test('the guard reads the row sources', () => {
  expect(Object.keys(SOURCES)).toContain(OWNER)
  expect(Object.keys(SOURCES).length).toBeGreaterThan(10)
})

test('only RowShell writes the kv-row element or spells a row part’s id', () => {
  const offenders = Object.entries(SOURCES)
    .filter(([path]) => path !== OWNER)
    .flatMap(([path, text]) =>
      text
        .split('\n')
        .map((line, index) => ({ path, line: index + 1, text: line }))
        .filter(({ text: line }) => /className=\{?[`'"]kv-row/.test(line) || ROW_PART_ID.test(line)),
    )
  expect(offenders.map(({ path, line, text }) => `${path}:${line}: ${text.trim()}`)).toEqual([])
})
```

Run: `cd apps/lab && pnpm exec vitest run --project node src/console/rows/rows.guard.test.ts`
Expected: "the guard reads the row sources" PASSES; the second test FAILS, listing `simple/SimplePanel.tsx` (`'simple-skeleton-help'`, `<div className="kv-row">`) and `simple/PositionSlider.tsx` (`` `${id}-help` ``, `` `${id}-ends` ``, `<div className="kv-row"`). If it lists any other file, that file still composes a row id: move it onto `rowIds` in this task.

- [ ] **Step 2: `SkeletonRow`**

In `SimplePanel.tsx`, `SkeletonRow`'s body becomes (doc comment kept):

```tsx
  const dict = useDictionary()
  const skeleton = useStore((state) => state.recipe.value.skeleton)
  const setSkeleton = useStore((state) => state.recipe.setSkeleton)
  const ids = rowIds('simple-skeleton')
  return (
    <RowShell
      id="simple-skeleton"
      name={dict.d.simple.skeleton}
      helpText={dict.d.simple.skeletonHelp}
      labelAs="span"
      wide
      control={
        <Segmented
          label={dict.d.simple.skeleton}
          labelledBy={ids.label}
          describedBy={ids.help}
          value={skeleton}
          options={SIMPLE_CHOICES.skeleton.map((value) => ({ value, label: dict.d.simple.options.skeleton[value] }))}
          onChange={(next) => {
            setSkeleton(next)
            applyRecipe(false)
            control.start()
          }}
        />
      }
    />
  )
```

No `title`: the row has none today. Imports: drop `KnobLine`, `useKnobHelp` from `'../console/KnobRow'`; add `import { RowShell, rowIds } from '../console/rows/RowShell'`.

- [ ] **Step 3: `PositionSlider`**

The body after `const percent = …` becomes (doc comment kept):

```tsx
  const id = `simple-${slider}`
  const ids = rowIds(id)
  return (
    <RowShell
      id={id}
      name={label}
      helpText={dict.d.simple[HELP[slider]]}
      labelAs="for"
      title={label}
      value={
        <span className="kv-val">
          <span className="kv-num">{percent}</span>
        </span>
      }
      control={
        <KnobTrack
          id={id}
          value={percent}
          bounds={{ min: 0, max: 100 }}
          step={1}
          word={null}
          // The number alone says nothing: "20" of what? The ends say.
          describedBy={`${ids.ends} ${ids.help}`}
          onCommit={(next) => {
            setSlider(slider, next / 100)
            applyRecipe(false)
          }}
        />
      }
      under={
        <p className="kv-ends" id={ids.ends}>
          <span>{low}</span>
          <span>{high}</span>
        </p>
      }
    />
  )
```

Imports: `KnobTrack` stays from `'../console/KnobRow'`; drop `KnobLine`, `useKnobHelp`; add `import { RowShell, rowIds } from '../console/rows/RowShell'`.

- [ ] **Step 4: Run the tests**

Run: `cd apps/lab && pnpm exec vitest run --project node src/console/rows/rows.guard.test.ts`
Expected: PASS (2 tests).

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/simple/`
Expected: PASS, no test edited.

Run: the whole lab suite once, prettier, `lab:check`, `lab:lint`, and `deno test --allow-read packages/engine/comments.test.ts` from the repo root.

- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/simple apps/lab/src/console/rows/rows.guard.test.ts
git commit -m "Lab: the simple view's rows on the shell; a guard keeps kv-row and row ids inside RowShell"
```

---

### Task 8: Gates, the live pass and the PR

**Files:** none changed unless a gate fails; then `lab-review.md` (status of refactor 2).

- [ ] **Step 1: Mark refactor 2 in `lab-review.md`**

In the refactors table of the status section, the row "2. One knob-row shell, split `ViewPanel.tsx`" becomes fixed on `lab/row-shell`, in the same wording pattern as the refactor 3 row; in "What is still open", item 3 drops refactor 2. Commit: `Lab review: the row shell is done`.

- [ ] **Step 2: Whole-repo gate in a clean worktree**

```bash
ROOT="$(git rev-parse --show-toplevel)"
git worktree add --detach ../arrowz-row-shell HEAD
cd ../arrowz-row-shell && corepack enable pnpm && pnpm install --frozen-lockfile
pnpm nx run-many -t verify --skip-nx-cache --output-style=static > /tmp/row-shell-nx.log 2>&1; echo "nx=$?"
deno task verify > /tmp/row-shell-deno.log 2>&1; echo "deno=$?"
cd "$ROOT" && git worktree remove ../arrowz-row-shell
```

Expected: `nx=0`, `deno=0`. Record the counts for the PR.

- [ ] **Step 3: Live pass in Chrome on a copy of the store**

If ports 8777/8779 are taken, use 8787/8789: `cp -R packages/cli/boards /tmp/arrowz-boards-copy`, `ARROWZ_BOARDS_DIR=/tmp/arrowz-boards-copy sh packages/cli/store.sh 8787`, and a temporary untracked `apps/lab/vite.pass.config.ts` with `server: { port: 8789, strictPort: true, proxy: labProxy('http://127.0.0.1:8787') }`. Check, in both languages:
1. Advanced view, Difficulty and Preview panels: every row's `?` opens its description; the `auto` chip on head width and a knob's special chip (e.g. `Lmax`'s `auto`) press and release back to the previous value.
2. ⌘K → a knob inside a closed dependency block and "top" under the highlight switch: the row opens and flashes.
3. Simple view: the skeleton segmented control, both position sliders (end words under the track), randomise switch with its tooltip.
4. Saved boards → Preview: the stored arrows' rows edit the stored view.
5. Console: no errors. Afterwards kill only the two pass PIDs (`lsof -tiTCP:8787` / `8789`), delete the config, and confirm `find packages/cli/boards -newer <copy time>` lists nothing.

- [ ] **Step 4: Push and open the PR** (only after the user agrees)

```bash
git push -u origin lab/row-shell
gh pr create --base lab/view-schema --title "Lab row shell: one RowShell for every knob row, one id rule, rows out of ViewPanel" --body-file <file>
```

The body lists the id renames, the new files, the guard, the gate counts and the live pass. No attribution lines.
