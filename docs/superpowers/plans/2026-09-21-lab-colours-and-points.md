# Lab colours and the point grid: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the lab controls for the point grid and for the board's paper
and ink, make the frame around the board take the paper's colour, and start
the board store beside the lab.

**Architecture:** The element gains one new outward signal -- a CSS custom
property carrying the paper it actually painted -- and one new export, the
point radius bounds it already clamps to. Everything else is lab work: new
slice fields, new controls built from the console's existing templates, five
new keys in the link, and the repeal of the rule that made a theme and a
custom palette mutually exclusive. The engine is touched only in its
dictionary.

**Tech Stack:** Deno 2.9 (engine, CLI), TypeScript, Lit 3 + WebGL2
(board-element), React 19 + zustand + Vite (lab), vitest with a real Chromium
through Playwright, Nx 23.

**Spec:** `docs/superpowers/specs/2026-09-20-lab-colours-and-points-design.md`

## Global Constraints

- Everything written into the repository is in English: code, comments,
  tests, commit messages. Only the chat with the user is Polish, and only
  `lab-i18n.ts`'s PL half holds Polish strings.
- No `any`, no non-null assertions (`deno.json:31`).
- `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on
  (`deno.json:4-8`). An indexed read is `T | undefined`; an optional property
  cannot be assigned `undefined` unless its type says so. The previous plan in
  this series shipped a test line that did not compile under the first of
  these -- write index reads defensively.
- No attribution lines in commit messages.
- Both gates must pass before the branch is offered: `deno task verify` and
  `pnpm nx run-many -t verify`.
- The lab is bilingual. Every user-visible string is a key in
  `packages/engine/lab-i18n.ts`, present in **both** EN and PL;
  `lab-i18n.test.ts:60-65` compares the key sets and the value kinds.
- `packages/engine` must stay free of DOM and Deno references, and
  `packages/cli` free of DOM (`neutral.test.ts` greps both).

## Commands

| What | Command |
| --- | --- |
| One lab test file | `cd apps/lab && pnpm vitest run src/<path>` |
| One element test file | `cd packages/board-element && pnpm vitest run src/<path>` |
| One engine test file | `deno test --allow-read --allow-write --allow-env --allow-run --allow-net packages/engine/<file>` |
| Whole lab | `pnpm nx test lab` |
| Deno gate | `deno task verify` |
| Node gate | `pnpm nx run-many -t verify` |

The element's browser project runs files one at a time by configuration
(`vitest.config.ts:45`); do not add parallelism to speed a run up.

## File Structure

**`packages/board-element/src`**
- `sanitize.ts` -- gains `POINT_RADIUS_RANGE`, the bounds `drawablePointRadius`
  already enforces, so they stop being literals.
- `mod.ts` -- re-exports it, beside `MIN_POINT_CELL_PX` on `:42`.
- `arrowz-board.ts` -- `:host` reads `--arrowz-paper`; `updated()` writes it.
- `README.md` -- the prose copy of the bound points at the constant.

**`apps/lab/src`**
- `state/view.slice.ts` -- five new fields and their actions; `paletteUpdate`
  stops clearing the theme.
- `console/ViewPanel.tsx` -- a colour field component, reused four times
  (point colour, paper, ink, and the palette rows' existing shape), plus the
  point grid's switch and its own number field.
- `stage/BoardFrame.tsx` -- the conditional colour overrides and the point
  props.
- `state/url.ts`, `state/useUrlHash.ts` -- the five new keys.
- `design/shell.css`, `design/console.css` -- the frame's background, styles
  for the new rows.

**`packages/engine`**
- `lab-i18n.ts` -- new keys in EN and PL; the palette help text loses the
  sentence Ruling 6 falsifies.

**Nx**
- `packages/cli/project.json`, `apps/lab/project.json`.

## Task order and why

T1 and T2 are element work and independent of each other. T3 depends on T2
(there is nothing to read before it is announced). T4 precedes T5, and T6
precedes T7, because a control needs state to drive. T8 depends on T4 and T6.
T9 depends on T4 and T6. T10 depends on nothing.

---

### Task 1: The element exports the point radius bounds

**Files:**
- Modify: `packages/board-element/src/sanitize.ts:45-48`
- Modify: `packages/board-element/src/mod.ts:42`
- Modify: `packages/board-element/README.md:141`
- Test: `packages/board-element/src/sanitize.test.ts`

**Interfaces:**
- Produces: `POINT_RADIUS_RANGE: Readonly<{ min: number; max: number }>`,
  exported from `@arrowz/board-element`. Task 5 reads it.

- [ ] **Step 1: Write the failing test**

Append to `packages/board-element/src/sanitize.test.ts`. This file is a
**vitest** file (`sanitize.test.ts:1` imports `describe`, `expect` and `test`
from `vitest`) and runs in the package's `node` project, not in Chromium:

```ts
describe('POINT_RADIUS_RANGE', () => {
  test('the published bounds are the ones the clamp enforces', () => {
    // 0.5 and 0 are named literally on one side: an assertion reading the
    // constant on both sides would hold for any value it was given.
    expect(drawablePointRadius(1.5, 0.06)).toBe(0.5)
    expect(drawablePointRadius(-1, 0.06)).toBe(0)
    expect(POINT_RADIUS_RANGE).toEqual({ min: 0, max: 0.5 })
  })
})
```

Add `POINT_RADIUS_RANGE` to the existing import from `./sanitize.ts`
(`sanitize.test.ts:2`).

- [ ] **Step 2: Run it and watch it fail**

`cd packages/board-element && pnpm vitest run src/sanitize.test.ts`
Expected: fails to compile -- `POINT_RADIUS_RANGE` is not exported.

- [ ] **Step 3: Implement**

In `sanitize.ts`, above `drawablePointRadius`:

```ts
/**
 * The radius a dot may be given, in cells. Published because the lab draws a
 * field for it and must declare the bounds it is actually held to: the engine's
 * `VIEW_RANGE` covers the CLI's numbers, and the point grid is none of them.
 */
export const POINT_RADIUS_RANGE: Readonly<{ min: number; max: number }> = { min: 0, max: 0.5 }
```

and make the clamp read from it:

```ts
export function drawablePointRadius(radius: number, fallback: number): number {
  return Math.min(Math.max(finite(radius, fallback), POINT_RADIUS_RANGE.min), POINT_RADIUS_RANGE.max)
}
```

In `mod.ts`, beside line 42:

```ts
export { POINT_RADIUS_RANGE } from './sanitize.ts'
```

In `README.md:141`, replace the bare bound with a sentence naming the export,
so the prose copy points at the constant instead of repeating it:

```md
- `point-radius` stays within `POINT_RADIUS_RANGE` (0 to 0.5): above half a cell the dots merge.
```

- [ ] **Step 4: Run it and watch it pass**

Same command. Expected: PASS.

- [ ] **Step 5: Mutation check**

Change `max: 0.5` to `max: 0.4` and re-run. Expected red: **both** the first
assertion (`drawablePointRadius(1.5, 0.06)` now returns 0.4, not 0.5) and the
third (the object no longer equals `{ min: 0, max: 0.5 }`). Revert.

This step is not optional: this task is exactly the shape that invites a test
reading the same constant on both sides of the comparison, which cannot fail.
The literals in the assertion are what make the mutation visible.

- [ ] **Step 6: Commit**

```bash
git add packages/board-element/src/sanitize.ts packages/board-element/src/mod.ts \
        packages/board-element/src/sanitize.test.ts packages/board-element/README.md
git commit -m "Publish the point radius bounds the element already clamps to"
```

---

### Task 2: The element announces the paper it painted

**Files:**
- Modify: `packages/board-element/src/arrowz-board.ts:153` (the `:host` rule)
- Modify: `packages/board-element/src/arrowz-board.ts:437-470` (`updated`)
- Test: `packages/board-element/src/theme.browser.test.ts`

**Interfaces:**
- Produces: the custom property `--arrowz-paper` on the element's own host,
  holding the paper after precedence and sanitising. Task 3 reads it.

- [ ] **Step 1: Write the failing test**

Append to `packages/board-element/src/theme.browser.test.ts` (it already has
`mount()` and `board`):

```ts
test('the host announces the paper it painted, and its own background follows', async () => {
  const el = await mount()
  el.board = board
  await el.updateComplete
  await raf()
  // No theme: the announced value is the element's own default, and the host
  // paints it -- the literal that used to be hard-coded in `:host`.
  expect(el.style.getPropertyValue('--arrowz-paper')).toBe('#f6f6fa')
  expect(getComputedStyle(el).backgroundColor).toBe('rgb(246, 246, 250)')

  el.theme = 'gruvbox-dark'
  await el.updateComplete
  await raf()
  // #282828 is gruvbox-dark's paper, the same value theme.browser.test.ts
  // already reads out of the canvas with readPixels.
  expect(el.style.getPropertyValue('--arrowz-paper')).toBe('#282828')
  expect(getComputedStyle(el).backgroundColor).toBe('rgb(40, 40, 40)')
  el.remove()
})

test('a stated paper beats the theme in what the host announces', async () => {
  const el = await mount()
  el.board = board
  el.theme = 'gruvbox-dark'
  el.view = { ...el.view, paper: '#010203' }
  await el.updateComplete
  await raf()
  expect(el.style.getPropertyValue('--arrowz-paper')).toBe('#010203')
  el.remove()
})
```

Measured beforehand (spec §2.1): `getComputedStyle` on the host does report
the `:host` rule in this package's browser project, so these assertions can
fail rather than passing vacuously.

- [ ] **Step 2: Run it and watch it fail**

`cd packages/board-element && pnpm vitest run src/theme.browser.test.ts`
Expected: FAIL -- `--arrowz-paper` is the empty string, and the background is
`rgb(246, 246, 250)` regardless of the theme (so the first test fails on its
third assertion, the second on its only one).

- [ ] **Step 3: Implement**

`arrowz-board.ts:153`, inside `static styles`:

```css
    :host {
      display: block;
      position: relative;
      overflow: hidden;
      outline: none;
      /* The paper the element actually painted, announced by `updated()`. The
         canvas clears to transparent and the paper quad covers only the board
         plus its margin, so this fills the rest of the frame; the fallback is
         `DEFAULT_VIEW.paper`, so an element that never draws looks unchanged. */
      background: var(--arrowz-paper, #f6f6fa);
    }
```

In `updated()`, immediately after `const view = this.drawView()` (`:451`):

```ts
    // Announced, not painted here: the consumer's own frame (the lab's
    // `.fw-board`) reads the same property, so the colour is resolved once.
    // `drawView()` is the only point where precedence and sanitising have both
    // run, which is why this sits here and not in `render()`.
    this.style.setProperty('--arrowz-paper', view.paper)
```

- [ ] **Step 4: Run it and watch it pass**

Same command. Expected: PASS, and the file's existing `readPixels` cases still
pass.

- [ ] **Step 5: Mutation check**

Move the `setProperty` call above the early return at `:445-448`. Expected
red: `a stated paper beats the theme in what the host announces`, because
`view` is not in scope there -- if it compiles, the mutation is wrong; instead
change the written value to `DEFAULT_VIEW.paper` and expect the first test's
theme assertions to go red. Revert.

- [ ] **Step 6: Commit**

```bash
git add packages/board-element/src/arrowz-board.ts packages/board-element/src/theme.browser.test.ts
git commit -m "Announce the painted paper on the host, and let the host's own background follow it"
```

---

### Task 3: The lab's frame takes the announced paper

**Files:**
- Modify: `apps/lab/src/design/shell.css:190`
- Test: `apps/lab/src/stage/BoardFrame.browser.test.tsx`
- Test: `apps/lab/src/design/shell.test.ts` (create if absent, following
  `apps/lab/src/design/console.test.ts`)

**Interfaces:**
- Consumes: `--arrowz-paper` from Task 2.

- [ ] **Step 1: Write the failing tests**

In `BoardFrame.browser.test.tsx` (it already imports all three stylesheets at
`:11-13`):

```tsx
test('the frame around the board takes the paper the element announces', async () => {
  const screen = await mountFrame()
  const frame = screen.container.querySelector('.fw-board')
  expect(frame).not.toBeNull()
  if (frame === null) return
  // Before any element has drawn, the token is what shows: the fallback.
  expect(getComputedStyle(frame).backgroundColor).toBe('rgb(244, 245, 248)')
  frame.style.setProperty('--arrowz-paper', 'rgb(40, 40, 40)')
  expect(getComputedStyle(frame).backgroundColor).toBe('rgb(40, 40, 40)')
})
```

Note the seam: the property is set on the frame directly rather than by
driving a theme through the element, because the element announces it on
**its own** host, which is a child of `.fw-board` -- a custom property
inherits downward, not up. Task 8's test is what pins the end-to-end path.
**If this test passes before the CSS changes, stop:** it means the rule was
already reading the property, and the assertion is not measuring what it says.

In `apps/lab/src/design/shell.test.ts`:

```ts
import { expect, test } from 'vitest'
import css from './shell.css?raw'

test('the board frame reads the announced paper and keeps a fallback', () => {
  const rule = /\.fw-board\s*\{[^}]*background:\s*var\(--arrowz-paper,\s*var\(--paper\)\)/
  expect(css).toMatch(rule)
})
```

The second test exists because the first cannot see the fallback: a rule that
dropped `var(--paper)` would still satisfy the browser assertion whenever the
property happens to be set.

- [ ] **Step 2: Run them and watch them fail**

```
cd apps/lab && pnpm vitest run src/stage/BoardFrame.browser.test.tsx src/design/shell.test.ts
```
Expected: the browser test fails on its second assertion (background stays
`rgb(244, 245, 248)`); the raw test fails to match.

- [ ] **Step 3: Implement**

`shell.css:190`:

```css
.fw-board {
  position: relative;
  height: 100%;
  min-height: 260px;
  /* The paper `<arrowz-board>` announces, so the letterbox around a board that
     does not fill the frame is the board's own colour rather than a second,
     unrelated light grey. The fallback is the lab's token, for the frames that
     hold no element yet. */
  background: var(--arrowz-paper, var(--paper));
  border: 1px solid var(--border);
  overflow: hidden;
}
```

- [ ] **Step 4: Run them and watch them pass**

Same command. Expected: PASS.

Then run the two files the spec names as possibly affected, because they read
the same selector:
```
cd apps/lab && pnpm vitest run src/routes/LabLayout.browser.test.tsx src/stage/Workspace.browser.test.tsx
```
Expected: PASS -- they measure rectangles, not colour. If either goes red,
report it rather than adjusting it silently.

- [ ] **Step 5: Mutation check**

Delete `, var(--paper)` from the rule. Expected red: `the board frame reads the
announced paper and keeps a fallback` (the raw test) **and** the browser
test's first assertion. Revert.

- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/design/shell.css apps/lab/src/design/shell.test.ts \
        apps/lab/src/stage/BoardFrame.browser.test.tsx
git commit -m "Let the lab's board frame take the paper the element announces"
```

---

### Task 4: The lab's state learns the point grid

**Files:**
- Modify: `apps/lab/src/state/view.slice.ts`
- Test: `apps/lab/src/state/view.slice.test.ts`

**Interfaces:**
- Produces, on `ViewState`: `showPoints: boolean` (added to the `ViewFlag`
  union), `pointColor: string`, `pointRadius: number`,
  `setPointColor(color: string): void`, `setPointRadius(raw: string): void`.
  Tasks 5, 8 and 9 use these.

- [ ] **Step 1: Write the failing test**

Append to `view.slice.test.ts`:

```ts
test('the point grid starts off, in the element\'s own colour and radius', () => {
  expect(declared.showPoints).toBe(false)
  expect(declared.pointColor).toBe(DEFAULT_POINT_COLOR)
  expect(declared.pointRadius).toBe(DEFAULT_POINT_RADIUS)
})

test('the point radius is clamped to what the element draws', () => {
  view().setPointRadius('9')
  expect(view().pointRadius).toBe(POINT_RADIUS_RANGE.max)
  view().setPointRadius('-1')
  expect(view().pointRadius).toBe(POINT_RADIUS_RANGE.min)
})

test('an unreadable point radius falls back to the default, not to zero', () => {
  view().setPointRadius('')
  expect(view().pointRadius).toBe(DEFAULT_POINT_RADIUS)
})
```

Import `DEFAULT_POINT_COLOR`, `DEFAULT_POINT_RADIUS` and `POINT_RADIUS_RANGE`
from `@arrowz/board-element`. Extend the file's `beforeEach` reset with the
three new fields, resetting them by `useStore.setState`, never through the
actions under test (the file's own comment at `:14-19` says why).

- [ ] **Step 2: Run it and watch it fail**

`cd apps/lab && pnpm vitest run src/state/view.slice.test.ts`
Expected: fails to compile -- the fields and actions do not exist.

- [ ] **Step 3: Implement**

In `view.slice.ts`, extend the flag union:

```ts
export type ViewFlag = 'colored' | 'rounded' | 'hilite' | 'voids' | 'showPoints'
```

Add to `ViewState`, after `voids`:

```ts
  /**
   * The point grid. Like `voids`, these are the element's settings and not the
   * engine's: `viewOf` does not carry them, and the CLI has no flag for any of
   * them. The bounds come from the element (`POINT_RADIUS_RANGE`), read at the
   * point of render, never copied.
   */
  showPoints: boolean
  pointColor: string
  pointRadius: number
  setPointColor(color: string): void
  /** Commits the radius from what was typed, tolerant as `setNumber` is. */
  setPointRadius(raw: string): void
```

Starting values, beside `voids: true`:

```ts
    showPoints: false,
    pointColor: DEFAULT_POINT_COLOR,
    pointRadius: DEFAULT_POINT_RADIUS,
```

Actions:

```ts
    setPointColor: (color) => patch({ pointColor: color }),
    setPointRadius: (raw) => {
      const n = Number(raw)
      // An empty or unreadable box is the default, not 0 -- a grid of dots with
      // no radius is a real setting nobody asks for by clearing a field, the
      // same reasoning `viewNumberOf` applies to the engine's numbers.
      const kept = raw.trim() === '' || !Number.isFinite(n) ? DEFAULT_POINT_RADIUS : n
      patch({ pointRadius: Math.min(Math.max(kept, POINT_RADIUS_RANGE.min), POINT_RADIUS_RANGE.max) })
    },
```

`viewOf` is **not** changed: none of the three is a field of the engine's
`View`.

- [ ] **Step 4: Run it and watch it pass**

Same command. Expected: PASS.

- [ ] **Step 5: Mutation check**

Replace the clamp with `patch({ pointRadius: kept })`. Expected red: `the
point radius is clamped to what the element draws`, both assertions. Revert.

- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/state/view.slice.ts apps/lab/src/state/view.slice.test.ts
git commit -m "Teach the lab's view state the point grid's three settings"
```

---

### Task 5: The console grows the point grid's controls

**Files:**
- Modify: `apps/lab/src/console/ViewPanel.tsx`
- Modify: `apps/lab/src/design/console.css`
- Modify: `packages/engine/lab-i18n.ts` (EN and PL)
- Test: `apps/lab/src/console/ViewPanel.browser.test.tsx`
- Test: `packages/engine/lab-i18n.test.ts`

**Interfaces:**
- Consumes: `POINT_RADIUS_RANGE` (Task 1); the slice fields (Task 4).
- Produces: `ColorField`, a component taking
  `{ id: string; label: string; value: string; onChange(color: string): void; onClear?: () => void }`.
  Task 7 reuses it.

- [ ] **Step 1: Write the failing tests**

In `ViewPanel.browser.test.tsx`:

```tsx
test('the panel draws the point grid controls', async () => {
  const screen = await render(<ViewPanel />)
  const grid = screen.getByRole('switch', { name: /show the point grid/i })
  await expect.element(grid).toHaveAttribute('aria-checked', 'false')
  await grid.click()
  expect(view().showPoints).toBe(true)

  const radius = screen.container.querySelector<HTMLInputElement>('#view-point-radius')
  expect(radius).not.toBeNull()
  expect(Number(radius?.min)).toBe(POINT_RADIUS_RANGE.min)
  expect(Number(radius?.max)).toBe(POINT_RADIUS_RANGE.max)
  expect(radius?.checkValidity()).toBe(true)
})
```

Update the two counting tests in the same file, and be explicit about why:

```tsx
test('the panel draws all nine preview controls', async () => {
  const screen = await render(<ViewPanel />)
  // Six numbers now: the five the engine's table covers plus the point radius,
  // whose bounds come from the element instead (spec §4.3).
  expect(screen.container.querySelectorAll('input[type="number"]')).toHaveLength(6)
  expect(screen.container.querySelectorAll('[role="switch"]')).toHaveLength(5)
})
```

and in `every number field declares the bounds the engine actually takes`,
scope the query so the new field is excluded by construction rather than by a
count:

```tsx
  const fields = [...screen.container.querySelectorAll<HTMLInputElement>('.fw-grid > .fw-k input[type="number"]')]
    .filter((input) => input.id !== 'view-point-radius')
  expect(fields).toHaveLength(Object.keys(VIEW_RANGE).length)
```

In `packages/engine/lab-i18n.test.ts`, add the new keys to the list at
`:236-247` so neither language may quietly lose them:
`'showPoints'`, `'pointColorLabel'`, `'pointRadiusLabel'`, `'pointRadiusHelp'`.

- [ ] **Step 2: Run them and watch them fail**

```
cd apps/lab && pnpm vitest run src/console/ViewPanel.browser.test.tsx
deno test --allow-read --allow-write --allow-env --allow-run --allow-net packages/engine/lab-i18n.test.ts
```
Expected: the browser file fails to find the switch; the Deno file fails on
the missing keys.

- [ ] **Step 3: Implement**

`packages/engine/lab-i18n.ts`, in `EN.ui` beside the other view labels:

```ts
    showPoints: 'show the point grid',
    pointColorLabel: 'dot colour',
    pointRadiusLabel: 'dot radius (cells)',
    pointRadiusHelp: 'Half a cell is the most; above that the dots merge into a wash of colour.',
```

and in `PL.ui`:

```ts
    showPoints: 'pokaż siatkę punktów',
    pointColorLabel: 'kolor kropek',
    pointRadiusLabel: 'promień kropki (komórki)',
    pointRadiusHelp: 'Najwięcej pół komórki; powyżej kropki zlewają się w plamę koloru.',
```

The flag's key is `showPoints`, matching the flag's own name: `VIEW_FLAGS`
labels are dictionary keys named exactly after their flags
(`ViewPanel.tsx:11-16` pairs `flag: 'voids'` with `label: 'voids'`), so a key
called `pointsLabel` would break that convention.

Extend both the flag list and the label union in `ViewPanel.tsx:11-16`:

```tsx
export const VIEW_FLAGS: readonly {
  flag: ViewFlag
  label: 'rounded' | 'colored' | 'hilite' | 'voids' | 'showPoints'
}[] = [
  { flag: 'rounded', label: 'rounded' },
  { flag: 'colored', label: 'colored' },
  { flag: 'hilite', label: 'hilite' },
  { flag: 'voids', label: 'voids' },
  { flag: 'showPoints', label: 'showPoints' },
]
```

In `ViewPanel.tsx`, import the bounds straight from the element --
`import { POINT_RADIUS_RANGE, THEMES, themeOf } from '@arrowz/board-element'`,
extending the existing import on `:1`. No local table and no second name for
the same numbers: the field is not in `viewFields.ts` because that table is
keyed by the engine's `ViewNumber` and bounded by `VIEW_RANGE`, and the point
grid is the element's (spec §4.3) -- but it still reads its bounds at the
point of render, which is the rule `viewFields.ts:20-31` states.

Then add the reusable colour field and the radius field:

```tsx
/**
 * One colour, as the palette rows already draw one: a visually hidden label
 * (so `aria-describedby` has something to hang on, and the row stays compact)
 * and a controlled native colour input. `onClear` is offered where the empty
 * value means something -- paper and ink use it to hand the field back to the
 * theme, which a colour input has no way to express on its own.
 */
export function ColorField({
  id,
  label,
  value,
  onChange,
  onClear,
  clearLabel,
}: {
  id: string
  label: string
  value: string
  onChange(color: string): void
  onClear?: (() => void) | undefined
  clearLabel?: string | undefined
}) {
  return (
    <div className="fw-k">
      <div className="row">
        <label className="lab" htmlFor={id}>
          {label}
        </label>
        <span className="fw-colour-cell">
          <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} />
          {onClear === undefined ? null : (
            <button type="button" className="fw-palette-remove" aria-label={clearLabel} onClick={onClear}>
              ×
            </button>
          )}
        </span>
      </div>
    </div>
  )
}
```

and in `ViewPanel`'s `.fw-grid`, after the flags:

```tsx
        <ColorField
          id="view-point-color"
          label={dict.t('pointColorLabel')}
          value={view.pointColor}
          onChange={view.setPointColor}
        />
        <div className="fw-k">
          <div className="top">
            <label className="lab" htmlFor="view-point-radius">
              {dict.t('pointRadiusLabel')}
            </label>
            <input
              type="number"
              id="view-point-radius"
              className="num"
              min={POINT_RADIUS_RANGE.min}
              max={POINT_RADIUS_RANGE.max}
              // A keyboard convenience, not a claim about what is allowed —
              // the same role `step` plays in `viewFields.ts`.
              step={0.01}
              defaultValue={String(view.pointRadius)}
              onBlur={(e) => view.setPointRadius(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') view.setPointRadius(e.currentTarget.value)
              }}
            />
          </div>
          <p className="why">{dict.t('pointRadiusHelp')}</p>
        </div>
```

In `console.css`, beside `.fw-palette-row input[type='color']`:

```css
.fw-colour-cell {
  display: flex;
  align-items: center;
  gap: 2px;
}
.fw-colour-cell input[type='color'] {
  width: 28px;
  height: 22px;
  padding: 1px;
  border: 1px solid var(--border);
  background: var(--void);
}
```

- [ ] **Step 4: Run them and watch them pass**

Both commands from Step 2. Expected: PASS. Then
`cd apps/lab && pnpm vitest run src/simple/SimplePanel.browser.test.tsx`
-- expected PASS untouched, because `SIMPLE_VIEW_FLAGS` is opt-in and
`showPoints` is not in it.

- [ ] **Step 5: Mutation check**

Change `max={POINT_RADIUS_RANGE.max}` to `max={1}`. Expected red: `the panel
draws the point grid controls`, on the `max` assertion. Revert.

- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/console/ViewPanel.tsx \
        apps/lab/src/design/console.css apps/lab/src/console/ViewPanel.browser.test.tsx \
        packages/engine/lab-i18n.ts packages/engine/lab-i18n.test.ts
git commit -m "Give the console the point grid's switch, colour and radius"
```

---

### Task 6: Paper and ink in the state, and the exclusion repealed

**Files:**
- Modify: `apps/lab/src/state/view.slice.ts:97-100` and the interface
- Test: `apps/lab/src/state/view.slice.test.ts`

**Interfaces:**
- Produces: `paper: string`, `ink: string`, `setPaper(color: string): void`,
  `setInk(color: string): void`. `''` means "not set", which is the only value
  that lets a theme through. Tasks 7, 8 and 9 use these.

- [ ] **Step 1: Write the failing test**

```ts
test('paper and ink start unset, so a theme decides them', () => {
  expect(declared.paper).toBe('')
  expect(declared.ink).toBe('')
})

test('a custom colour no longer clears the chosen theme (Ruling 6)', () => {
  view().setTheme('gruvbox-dark')
  view().setPaper('#010203')
  expect(view().theme).toBe('gruvbox-dark')
  expect(view().paper).toBe('#010203')
})

test('a custom palette no longer clears the chosen theme either (Ruling 6)', () => {
  view().setTheme('gruvbox-dark')
  view().setPalette(['#112233'])
  expect(view().theme).toBe('gruvbox-dark')
  expect(view().palette).toEqual(['#112233'])
})

test('choosing a theme no longer discards a custom palette (Ruling 6)', () => {
  view().setPalette(['#112233'])
  view().setTheme('gruvbox-dark')
  expect(view().palette).toEqual(['#112233'])
})

test('the cap survives the repeal', () => {
  view().setPalette(Array.from({ length: 12 }, (_, i) => `#${String(i % 10).repeat(6)}`))
  expect(view().palette).toHaveLength(PALETTE_CAP)
})
```

Invert, do not delete, the assertions the spec lists at §7: `:82`, `:112` and
`:120` of this file state the old exclusion and become the three above.

- [ ] **Step 2: Run it and watch it fail**

`cd apps/lab && pnpm vitest run src/state/view.slice.test.ts`
Expected: FAIL -- `paper` does not exist; the theme is cleared.

- [ ] **Step 3: Implement**

Add to `ViewState`, after `palette`:

```ts
  /**
   * The board's own surface colours, or `''` for "the user has not said", which
   * is the only value that lets a chosen theme supply them. Never handed to the
   * element as `''`: the element sanitises *after* precedence, so a stated empty
   * string would beat the theme and then fall to the element's default, turning
   * a dark theme light (spec §4.4).
   */
  paper: string
  ink: string
  setPaper(color: string): void
  setInk(color: string): void
```

Starting values `paper: ''`, `ink: ''`; actions
`setPaper: (color) => patch({ paper: color })` and the same for `ink`.

Replace `paletteUpdate` (`:97-100`) with a cap-only version, and rewrite the
doc comment that explained the exclusion:

```ts
/**
 * The cap, and only the cap. Ruling 6 repealed the exclusion this used to
 * enforce: a theme and custom colours now coexist, each field overriding the
 * theme's on its own. The picker keeps telling the truth because the theme is
 * still supplying everything the user did not override.
 */
function paletteUpdate(_state: ViewState, colors: string[]): Pick<ViewState, 'palette'> {
  return { palette: colors.slice(0, PALETTE_CAP) }
}
```

and `setTheme` stops clearing the palette:

```ts
    setTheme: (name) => patch({ theme: name }),
```

Leave `addPaletteColor`'s auto-enable of `colored` alone: it is a separate
ruling and still holds.

- [ ] **Step 4: Run it and watch it pass**

Same command, then the whole lab: `pnpm nx test lab`. Expect red in the three
files the spec names, at these exact assertions:

- `ViewPanel.browser.test.tsx:211-230` (adding a colour clears a theme set in
  the picker) and `:271-279` (choosing a theme clears the editor's palette) --
  both become statements that the two survive each other.
- `useUrlHash.browser.test.tsx:340`, `expect(useStore.getState().view.theme).toBe('')`
  -- becomes `toBe('gruvbox-dark')`, and the case's name loses "and clears a
  theme already on screen". Its comment at `:325-328` explains the old rule and
  must be rewritten, not left behind.
- `BoardFrame.browser.test.tsx:237`,
  `expect(element === null || !('palette' in (element.view ?? {}))).toBe(true)`
  -- the palette now survives a theme chosen afterwards, so this asserts the
  key is still `['#ff00ff']`.

**Do not touch `url.test.ts`:** it holds no exclusion assertion, and
`:114-116` (an empty palette is left out of the link) stays exactly as it is.

If more than roughly a dozen assertions across four files need changing, stop
and report rather than widening the change quietly (spec §8).

- [ ] **Step 5: Mutation check**

Put `theme: colors.length > 0 ? '' : state.theme` back into `paletteUpdate`.
Expected red: `a custom palette no longer clears the chosen theme either`.
Revert.

- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/state/view.slice.ts apps/lab/src/state/view.slice.test.ts \
        apps/lab/src/console/ViewPanel.browser.test.tsx \
        apps/lab/src/state/useUrlHash.browser.test.tsx \
        apps/lab/src/stage/BoardFrame.browser.test.tsx
git commit -m "Let a theme and custom colours coexist, each field overriding on its own"
```

---

### Task 7: Paper and ink in the console, and the help text that Ruling 6 falsifies

**Files:**
- Modify: `apps/lab/src/console/ViewPanel.tsx` (`PaletteEditor`)
- Modify: `packages/engine/lab-i18n.ts` (EN and PL)
- Test: `apps/lab/src/console/ViewPanel.browser.test.tsx`

**Interfaces:**
- Consumes: `ColorField` (Task 5); `paper`, `ink`, `setPaper`, `setInk` (Task 6).

- [ ] **Step 1: Write the failing test**

```tsx
test('the editor offers paper and ink, and hands them back to the theme when cleared', async () => {
  const screen = await render(<ViewPanel />)
  const paper = screen.container.querySelector<HTMLInputElement>('#view-paper')
  expect(paper).not.toBeNull()
  if (paper === null) return
  paper.value = '#010203'
  paper.dispatchEvent(new Event('input', { bubbles: true }))
  expect(view().paper).toBe('#010203')

  await screen.getByRole('button', { name: /clear the paper/i }).click()
  // Back to "not set", which is what lets a theme supply it again.
  expect(view().paper).toBe('')
})
```

and update the colour-input counts the spec flags (`:223-224`, `:237-245`):
the panel now has two more colour inputs before any palette colour is added.
Write the count as a named calculation, not a bare number:

```tsx
  // Three colour inputs exist before the user adds anything: the point
  // colour (Task 5), the paper and the ink. Palette rows are added on top.
  const ALWAYS_PRESENT_COLOURS = 3
```

- [ ] **Step 2: Run it and watch it fail**

`cd apps/lab && pnpm vitest run src/console/ViewPanel.browser.test.tsx`
Expected: FAIL -- `#view-paper` is null.

- [ ] **Step 3: Implement**

Dictionary, EN:

```ts
    paperLabel: 'background',
    inkLabel: 'drawing colour',
    paperClear: 'clear the paper, back to the theme',
    inkClear: 'clear the drawing colour, back to the theme',
    paletteHelp: (cap: number) => `Up to ${cap} colours. A chosen theme still supplies everything you do not set.`,
```

PL:

```ts
    paperLabel: 'tło',
    inkLabel: 'kolor rysunku',
    paperClear: 'wyczyść tło, z powrotem do motywu',
    inkClear: 'wyczyść kolor rysunku, z powrotem do motywu',
    paletteHelp: (cap) => `Maksymalnie ${cap} kolorów. Wybrany motyw nadal daje wszystko, czego nie ustawisz.`,
```

The `paletteHelp` rewrite is required, not cosmetic: the old sentence
("Setting one clears the chosen theme" / "Ustawienie choćby jednego czyści
wybrany motyw") states the rule Ruling 6 repealed, so leaving it would make
the UI lie in both languages.

In `PaletteEditor`, above the palette list:

```tsx
      <ColorField
        id="view-paper"
        label={dict.t('paperLabel')}
        value={paper === '' ? DEFAULT_VIEW.paper : paper}
        onChange={setPaper}
        {...(paper === '' ? {} : { onClear: () => setPaper(''), clearLabel: dict.t('paperClear') })}
      />
```

and the same for ink with `DEFAULT_VIEW.ink`. The spread rather than
`onClear={paper === '' ? undefined : ...}` is deliberate:
`exactOptionalPropertyTypes` is on (`deno.json:7`), so an optional prop may not
be handed an explicit `undefined`.

The field shows the element's default while unset, because a native colour
input has no empty state; the clear button is what expresses "not set", and it
is absent when there is nothing to clear.

- [ ] **Step 4: Run it and watch it pass**

Same command, then `pnpm nx test lab` and the Deno dictionary test.

- [ ] **Step 5: Mutation check**

Change `onClear: () => setPaper('')` to `onClear: () => setPaper(DEFAULT_VIEW.paper)`.
Expected red: the new test's final assertion (`''` expected, the default
received). Revert.

- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/console/ViewPanel.tsx apps/lab/src/console/ViewPanel.browser.test.tsx \
        packages/engine/lab-i18n.ts
git commit -m "Offer the board's paper and ink in the console, and correct the palette help text"
```

---

### Task 8: The frame hands the colours and the grid to the element

**Files:**
- Modify: `apps/lab/src/stage/BoardFrame.tsx:57-71,111`
- Test: `apps/lab/src/stage/BoardFrame.browser.test.tsx`

**Interfaces:**
- Consumes: Tasks 4 and 6's slice fields.

- [ ] **Step 1: Write the failing test**

No casts are needed to read the element: `mod.ts:44-47` declares
`arrowz-board` in `HTMLElementTagNameMap`, so `querySelector('arrowz-board')`
is typed, exactly as `BoardFrame.browser.test.tsx:232` already relies on
(`expect(element?.view.palette).toEqual(['#ff00ff'])`).

```tsx
test('an unset paper leaves the theme its own, and a set one overrides it', async () => {
  const screen = await mountFrame()
  await act(async () => finish(finishedRun(1)))
  await act(async () => useStore.getState().view.setTheme('gruvbox-dark'))
  const element = screen.container.querySelector('arrowz-board')
  // Absent, not empty: the element sanitises *after* precedence, so a stated
  // '' would beat the theme and then fall to the element's own default,
  // turning a dark theme light (spec §4.4).
  expect(element === null || !('paper' in (element.view ?? {}))).toBe(true)

  await act(async () => useStore.getState().view.setPaper('#010203'))
  expect(element?.view.paper).toBe('#010203')
  // The theme is still supplying what the user did not override (Ruling 6).
  expect(useStore.getState().view.theme).toBe('gruvbox-dark')
  useStore.getState().view.setTheme('')
  useStore.getState().view.setPaper('')
})

// The same seam as the palette's preview case above: a colour that reaches the
// lab branch and not the library's, for two states the design calls equivalent.
test('the library preview gets the custom colours too', async () => {
  const { meta, file } = storedFixture(2)
  const screen = await mountFrame(`/boards/8x8/${meta.id}`)
  try {
    await act(async () => useStore.getState().view.setPaper('#040506'))
    await act(async () => useStore.getState().result.showPreview({ board: decodeBoard(file), file, meta }))
    const element = screen.container.querySelector('arrowz-board')
    expect(element?.view.paper).toBe('#040506')
    // There is a board under that paper: `labView` carries it too, so a
    // preview that never landed would leave this green on its own.
    expect(element?.board?.W).toBe(8)
  } finally {
    useStore.getState().view.setPaper('')
  }
})

test('the point grid reaches the element', async () => {
  const screen = await mountFrame()
  await act(async () => finish(finishedRun(1)))
  await act(async () => {
    const view = useStore.getState().view
    view.setFlag('showPoints', true)
    view.setPointColor('#0a0b0c')
    view.setPointRadius('0.2')
  })
  const element = screen.container.querySelector('arrowz-board')
  expect(element?.showPoints).toBe(true)
  expect(element?.pointColor).toBe('#0a0b0c')
  expect(element?.pointRadius).toBe(0.2)
  useStore.getState().view.setFlag('showPoints', false)
})
```

`storedFixture`, `decodeBoard`, `finish` and `finishedRun` are already
imported at the top of this file (`:1,7,8`).

- [ ] **Step 2: Run it and watch it fail**

`cd apps/lab && pnpm vitest run src/stage/BoardFrame.browser.test.tsx`
Expected: FAIL -- `paper` never reaches the element, and the point props are
undefined.

- [ ] **Step 3: Implement**

Beside `paletteOverride` (`:57`):

```tsx
  // Each colour is added only when the user set it, for the same reason the
  // palette is: the element's precedence is "stated beats named beats default"
  // and its sanitising runs after the merge, so an empty value here would beat
  // a chosen theme and then fall to the element's own default (spec §4.4).
  const colourOverride = useMemo(
    () => ({
      ...(view.paper === '' ? {} : { paper: view.paper }),
      ...(view.ink === '' ? {} : { ink: view.ink }),
    }),
    [view.paper, view.ink],
  )
```

Spread it into **both** `labView` and the preview branch, beside
`paletteOverride`. Then, on the element (`:111`):

```tsx
        <BoardCanvas
          board={board}
          view={elementView}
          interactive={false}
          lang={lang}
          enableColors
          theme={view.theme}
          showPoints={view.showPoints}
          pointColor={view.pointColor}
          pointRadius={view.pointRadius}
        />
```

- [ ] **Step 4: Run it and watch it pass**

Same command, then `pnpm nx test lab`.

- [ ] **Step 5: Mutation check**

Drop `...colourOverride` from the preview branch only. Expected red: exactly
`the library preview gets the custom colours too`, and nothing else. That the
lab case stays green is the point: it is what proves the two branches are
tested separately.

- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/stage/BoardFrame.tsx apps/lab/src/stage/BoardFrame.browser.test.tsx
git commit -m "Hand the board's custom colours and point grid to the element, on both branches"
```

---

### Task 9: The link carries the five new settings

**Files:**
- Modify: `apps/lab/src/state/url.ts:6-30,117-132`
- Modify: `apps/lab/src/state/useUrlHash.ts:13-28,31-59`
- Test: `apps/lab/src/state/url.test.ts`
- Test: `apps/lab/src/state/useUrlHash.browser.test.tsx`

**Interfaces:**
- Consumes: Tasks 4 and 6's slice fields.

- [ ] **Step 1: Write the failing tests**

In `url.test.ts`:

```ts
it('carries the board colours and the point grid through a round trip', () => {
  const hash = encodeHash({
    params: defaultParams(),
    view: { ...VIEW, paper: '#010203', ink: '#040506', showPoints: true, pointColor: '#070809', pointRadius: 0.2 },
    carried: {},
  })
  const back = decodeHash(hash)?.view
  expect(back?.paper).toBe('#010203')
  expect(back?.ink).toBe('#040506')
  expect(back?.showPoints).toBe(true)
  expect(back?.pointColor).toBe('#070809')
  expect(back?.pointRadius).toBe(0.2)
})

it('reads a link that predates the board colours as naming none', () => {
  const hash = encodeHash({ params: defaultParams(), view: VIEW, carried: {} })
  expect(decodeHash(hash)?.view.paper).toBeUndefined()
  expect(decodeHash(hash)?.view.ink).toBeUndefined()
})

it('drops a hand-edited colour the editor could not show', () => {
  const link = '#' + encodeURIComponent(JSON.stringify({ __view: { paper: 'rebeccapurple' } }))
  expect(decodeHash(link)?.view.paper).toBeUndefined()
})

it('carries a theme and custom colours together (Ruling 6)', () => {
  const hash = encodeHash({
    params: defaultParams(),
    view: { ...VIEW, theme: 'gruvbox-dark', palette: ['#112233'], paper: '#010203' },
    carried: {},
  })
  const back = decodeHash(hash)?.view
  expect(back?.theme).toBe('gruvbox-dark')
  expect(back?.palette).toEqual(['#112233'])
  expect(back?.paper).toBe('#010203')
})
```

In `useUrlHash.browser.test.tsx`, two cases that the **producer and consumer**
are wired, not only the codec. This is the exact gap that shipped a broken
theme in the palette round: the codec was flawless, `url.test.ts` built the
object by hand, and nothing ever called the code that fills it. Both cases
below go through the hook, in the shape the file's existing palette cases use
(`:320-322` for the writer, `:329-341` for the reader):

```tsx
it('writes the board colours and the point grid into the link', async () => {
  await mount(stub().control)
  useStore.getState().view.setPaper('#010203')
  useStore.getState().view.setPointColor('#070809')
  await vi.waitFor(() => {
    expect(decodeHash(location.hash)?.view.paper).toBe('#010203')
    expect(decodeHash(location.hash)?.view.pointColor).toBe('#070809')
  })
  useStore.getState().view.setPaper('')
})

it('opens on the board colours and the point grid the link names', async () => {
  await mount(stub().control)
  location.hash = encodeHash({
    params: defaultParams(),
    view: { ...VIEW, paper: '#010203', ink: '#040506', showPoints: true, pointRadius: 0.2 },
    carried: {},
  }).slice(1)
  await vi.waitFor(() => expect(useStore.getState().view.paper).toBe('#010203'))
  expect(useStore.getState().view.ink).toBe('#040506')
  expect(useStore.getState().view.showPoints).toBe(true)
  expect(useStore.getState().view.pointRadius).toBe(0.2)
})
```

`VIEW` comes from `./url.fixtures` and is already imported (`:9`); extend that
fixture with the new fields if its type requires them.

- [ ] **Step 2: Run them and watch them fail**

```
cd apps/lab && pnpm vitest run src/state/url.test.ts src/state/useUrlHash.browser.test.tsx
```
Expected: FAIL on every new assertion.

- [ ] **Step 3: Implement**

In `url.ts`, extend `HashView`:

```ts
  /** The board's own surface colours. Absent when the link predates them or names none. */
  paper?: string | undefined
  ink?: string | undefined
  /** The point grid. Absent when the link predates it. */
  showPoints?: boolean | undefined
  pointColor?: string | undefined
  pointRadius?: number | undefined
```

Add a single-colour reader beside `palette()`:

```ts
/**
 * One hand-written colour. Same rule as `palette`: the lab's colour inputs can
 * only show `#rrggbb`, so anything else is worse than absent, and a valid value
 * is lower-cased so the hash this page rewrites matches the one pasted in.
 */
function colour(raw: unknown): string | undefined {
  return typeof raw === 'string' && HEX_COLOR.test(raw) ? raw.toLowerCase() : undefined
}
```

and in `decodeHash`'s `view`:

```ts
      paper: colour(raw.paper),
      ink: colour(raw.ink),
      showPoints: raw.showPoints === true,
      pointColor: colour(raw.pointColor),
      pointRadius: num(raw.pointRadius),
```

In `encodeHash`, omit the unset colours exactly as the palette is omitted, so
a link does not grow keys nobody set. Extend the existing destructuring rather
than adding a second pass.

In `useUrlHash.ts`, add the five to `viewFor` (`:13-28`) and to
`applyPayload` (`:31-59`):

```ts
  if (payload.view.paper !== undefined) view.setPaper(payload.view.paper)
  if (payload.view.ink !== undefined) view.setInk(payload.view.ink)
  view.setFlag('showPoints', payload.view.showPoints === true)
  if (payload.view.pointColor !== undefined) view.setPointColor(payload.view.pointColor)
  if (payload.view.pointRadius !== undefined) view.setPointRadius(String(payload.view.pointRadius))
```

While here, revisit the comment at `:53-57`: it explains the theme/palette
ordering as a consequence of the exclusion Ruling 6 repealed. Either delete
the ordering rationale or restate it; do not leave a comment describing a rule
that no longer exists.

- [ ] **Step 4: Run them and watch them pass**

Same command, then `pnpm nx test lab`.

- [ ] **Step 5: Mutation check**

Remove the `paper` line from `viewFor`. Expected red: the
`useUrlHash.browser.test.tsx` case, while every `url.test.ts` case stays
green. That asymmetry is the whole point of the second test -- if both go red
or both stay green, the producer is not actually being exercised.

- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/state/url.ts apps/lab/src/state/useUrlHash.ts \
        apps/lab/src/state/url.test.ts apps/lab/src/state/useUrlHash.browser.test.tsx
git commit -m "Carry the board colours and the point grid in the link"
```

---

### Task 10: `nx serve lab` starts the store

**Files:**
- Modify: `packages/cli/project.json:7-19`
- Modify: `apps/lab/project.json:23-28`
- Modify: `README.md` and `README.pl.md` (the lab section)

**Interfaces:** none; this task is independent of every other.

- [ ] **Step 1: Add the target**

`packages/cli/project.json`, inside `targets`:

```jsonc
    "store": {
      "executor": "nx:run-commands",
      "continuous": true,
      "cache": false,
      "options": { "cwd": "packages/cli", "command": "sh store.sh" }
    },
```

`continuous: true` is what lets a dependent task start beside a process that
never exits. `cache: false` is belt and braces -- `nx.json:24-82` has no
`store` default to inherit -- and says plainly that a server is not cacheable.

Leave `verify` alone: it lists its dependencies explicitly
(`packages/cli/project.json:18`), so the server cannot creep into the gate.

- [ ] **Step 2: Make the lab depend on it**

`apps/lab/project.json:23-28`:

```jsonc
    "serve": {
      "executor": "nx:run-commands",
      "cache": false,
      "dependsOn": ["^build", "cli:store"],
      "options": { "cwd": "apps/lab", "command": "pnpm run serve" }
    },
```

- [ ] **Step 3: Verify by running it**

```
pnpm nx serve lab
```
Expected: the store logs on 8777 and Vite on 8779, both alive. Open
`http://localhost:8779`, go to the saved-boards tab, and confirm the library
loads instead of showing "No store server".

Then stop it and confirm the gate is unaffected:
```
pnpm nx run-many -t verify
```
Expected: 25 tasks, none of them hanging. **If `verify` hangs, the continuous
target has leaked into it** -- stop and report.

- [ ] **Step 4: Note what happens when the port is taken**

Start a second `pnpm nx serve lab` while the first is running and record what
the user sees. `store.sh:9` takes the port as `PORT=${1:-8777}`, but the lab's
end is a literal (`vite.proxy.ts:4`), so a store on another port is not
reachable by the lab without editing that file. Write one sentence about this
in the README section below rather than leaving it to be discovered.

- [ ] **Step 5: Update both READMEs**

The lab section currently tells the reader to run two commands. Replace the
two-terminal instruction with `pnpm nx serve lab` and keep `deno task store`
documented as the way to run the store alone (the CLI does not need it, and
the lab still works without it -- only the library and saving go away).

`packages/cli/readme.test.ts` guards the root README; run the Deno gate after
editing.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/project.json apps/lab/project.json README.md README.pl.md
git commit -m "Start the board store alongside the lab, as a continuous Nx target"
```

---

## Final gate

- [ ] `deno task verify` -- expect green (379+ tests, count will have grown
      with the dictionary keys).
- [ ] `pnpm nx run-many -t verify` -- expect 25 tasks green.
- [ ] A live run in Chrome at 1400×900, both processes up, checking by eye
      what no test can: a dark theme with the frame around the board matching
      the paper, the point grid on and its dots visible at a readable size,
      a custom paper overriding a theme while the theme's arrow colours stay,
      and the whole thing surviving a round trip through a pasted link in a
      fresh tab. The palette round shipped a critical defect that ~800 tests
      and nine task reviews missed and only a branch review caught -- this
      step is not a formality.

## Notes for whoever executes this

- The branch is `lab/colours-and-points`, based on the palette stack. If #87
  and #86 have been merged by the time you start, rebase onto `main` first and
  re-check the line numbers this plan cites before trusting any of them.
- Task 1's mutation step matters more than it looks: it is the one place where
  a test could read the same constant on both sides and pass no matter what.
- Task 6 is the widest change. If it grows past roughly a dozen assertions in
  four files, stop and report instead of widening quietly.
- Every task commits. A task that ends with clean but uncommitted work is not
  finished -- the previous round in this series lost a task's work that way.
