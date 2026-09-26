# Lab hotkeys and dismiss (PR 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The workspace's single-key shortcuts live in one table behind one listener, the three popovers close through one `useDismiss` hook, and `App.tsx`'s shell keeps only the hook calls and the layout.

**Architecture:** `shell/hotkeys.ts` takes `isHotkeyRefused`, `usePaletteKey` and a `WORKSPACE_KEYS` table read by `useWorkspaceKeys`, replacing three `document` listeners whose keys are disjoint. `shell/useDismiss.ts` holds the outside press, the capture-phase Escape and the optional focus-out rule that `TopBar`, `MoreMenu` and `PresetStrip` each write by hand today; `useEffectEvent` keeps the listeners registered once per opening although callers pass inline callbacks. `useStoreSave` and `useBandReset` move to their own files.

**Tech Stack:** React 19.3 (`useEffectEvent`) + Zustand + Vitest 5 (projects `node` and `chromium`) in `apps/lab`; Nx + pnpm.

**Spec:** `docs/superpowers/specs/2026-09-26-lab-structural-refactors-design.md`, section "PR 3 — hotkeys, dismiss, side effects". Read it before Task 1.

## Global Constraints

- Branch `lab/hotkeys-dismiss`, created from `lab/row-shell` (`a80bca7`). Commit after every task; no attribution lines. Never push.
- Everything in the repository is English: code, comments, tests, commit messages.
- No `any`, no non-null assertions (`!`). `tsconfig` has `exactOptionalPropertyTypes`: optional props are typed `?: T | undefined`.
- Comments say why, once: one line by default, ≤ 6 lines unless a module or API header (≤ 24). No history. Cite symbols, never `file.ts:NN`. `packages/engine/comments.test.ts` enforces this for `apps/lab/src`.
- If vitest cannot resolve `@arrowz/engine` or `@arrowz/board-element`, run `pnpm nx run-many -t build -p engine board-element`.
- `lab:fmt` is `prettier --check .`: run `cd apps/lab && pnpm exec prettier --write <changed files>` before every commit, then `pnpm nx run lab:check` and `pnpm nx run lab:lint` (React Compiler, `react-hooks` and jsx-a11y rules are errors).
- Lab tests: `cd apps/lab && pnpm exec vitest run --project node <file>` for `*.test.ts`, `--project chromium <file>` for `*.browser.test.tsx`; the whole suite is `cd apps/lab && pnpm exec vitest run`. `src/routes/LabLayout.browser.test.tsx > closing the drawer keeps the report on screen for the slide, then hides it` is load-flaky: if only it fails in a full run, re-run it alone and report both results.
- **Behaviour does not change.** Every existing test passes with no assertion edit. A test comment that names a removed hook (`useRunKeys`, `useDrawerKeys`) may be reworded; its assertions may not change.
- `packages/cli/boards/` is gitignored: the user's real board store. Never edit, add or commit anything under it.
- Run shell commands from the repo root (`cd "$(git rev-parse --show-toplevel)"`), never from a hard-coded path.

## Review Focus

1. **Escape closes one layer only, and a popover's Escape wins.** With the preset panel, the `…` popover or the top menu open over an open report, one Escape closes the popover and leaves the report. Pinned by the existing `LabLayout` test "Escape closes the report, but not while the palette or the preset panel has it", `bands` "Escape in the open menu closes the menu only" and the `TopBar`/`MoreMenu`/`PresetStrip` Escape tests, all unedited.
2. **Focus moving between two elements outside the preset strip does not close it.** The strip's focus-out rule only ever saw focus leaving the strip itself; a document-level listener must keep that. Pinned in Task 2 ("focus moving between two outside elements leaves it open").
3. **A key typed in a field is not a hotkey, but ⌘K is.** Pinned by the existing `LabLayout` refusal tests and the ⌘K-in-a-field test, unedited.
4. **The popover listeners register once per opening,** not on every render, although callers pass inline callbacks. Pinned in Task 2 ("a re-render while open does not register the listeners again").
5. **No key belongs to two rows of the table** — the one way merging three listeners could change which action a key runs. Pinned in Task 1 (node test), with a mutation check.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `apps/lab/src/shell/hotkeys.ts` | create | `isHotkeyRefused`, `usePaletteKey`, `WORKSPACE_KEYS`, `useWorkspaceKeys` |
| `apps/lab/src/shell/hotkeys.test.ts` | create | the table's keys are disjoint |
| `apps/lab/src/shell/useDismiss.ts` | create | outside press, capture Escape, optional focus-out |
| `apps/lab/src/shell/useDismiss.browser.test.tsx` | create | the hook's contract |
| `apps/lab/src/shell/useBandReset.ts` | create (move) | band change closes sheet and menu |
| `apps/lab/src/library/useStoreSave.ts` | create (move) | a shown result is offered to the store once |
| `apps/lab/src/App.tsx` | modify | only the shell: hook calls and layout |
| `apps/lab/src/shell/TopBar.tsx`, `run/MoreMenu.tsx`, `run/PresetStrip.tsx` | modify | dismiss through `useDismiss` |
| `apps/lab/src/palette/CommandPalette.tsx`, `routes/LabLayout.browser.test.tsx`, `palette/PaletteModal.browser.test.tsx` | modify (comments only) | name the new hook |
| `lab-review.md` | modify (Task 5) | refactor 4 status |

---

### Task 1: One hotkey table

**Files:**
- Create: `apps/lab/src/shell/hotkeys.ts`
- Create: `apps/lab/src/shell/hotkeys.test.ts`
- Modify: `apps/lab/src/App.tsx` (delete `isHotkeyRefused`, `useSoloKey`, `usePaletteKey`, `useDrawerKeys`, `useRunKeys`; their calls in `Shell`)
- Modify (comments only): `apps/lab/src/palette/CommandPalette.tsx`, `apps/lab/src/routes/LabLayout.browser.test.tsx`, `apps/lab/src/palette/PaletteModal.browser.test.tsx`

**Interfaces:**
- Produces:
  - `interface HotkeyRow { keys: readonly string[]; run(control: RunControl): void }`
  - `const WORKSPACE_KEYS: readonly HotkeyRow[]`
  - `function useWorkspaceKeys(onWorkspace: boolean, control: RunControl): void`
  - `function usePaletteKey(): void`
  - `isHotkeyRefused` stays module-private.

- [ ] **Step 1: Write the failing test**

`apps/lab/src/shell/hotkeys.test.ts`:

```ts
import { expect, test } from 'vitest'
import { WORKSPACE_KEYS } from './hotkeys'

// One listener runs the first row naming a key; a key in two rows would silently lose its second action.
test('no key belongs to two rows of the workspace table', () => {
  const keys = WORKSPACE_KEYS.flatMap((row) => row.keys)
  expect(keys.length).toBeGreaterThan(0)
  expect(new Set(keys).size).toBe(keys.length)
})

test('the table holds every workspace key the lab advertises', () => {
  expect(WORKSPACE_KEYS.flatMap((row) => row.keys).sort()).toEqual(
    ['Escape', 'F', 'G', 'R', 'S', '[', ']', 'f', 'g', 'r', 's'].sort(),
  )
})
```

Run: `cd apps/lab && pnpm exec vitest run --project node src/shell/hotkeys.test.ts`
Expected: FAIL — the module does not exist yet.

- [ ] **Step 2: Write `shell/hotkeys.ts`**

```ts
import { useEffect } from 'react'
import { generate, stepSeed } from '../run/actions'
import type { RunControl } from '../run/useRun'
import { readBand } from '../state/band'
import { useStore } from '../state/store'

/**
 * The workspace's single-key shortcuts and ⌘K.
 *
 * Escape precedence: the preset panel, the `…` popover and the top menu take
 * their Escape in the capture phase (`useDismiss`), the command palette at its
 * own target, all with `preventDefault`. `WORKSPACE_KEYS` comes last, in the
 * bubble phase, and `isHotkeyRefused` skips a prevented event, so one Escape
 * closes one layer.
 */

/**
 * Nothing with Ctrl, ⌘ or Alt (the platform's), no key repeat, nothing typed
 * into a field or an editable region; a composing IME key is text too. A
 * cancelled event was consumed closer to the target. `usePaletteKey` does not
 * use this guard.
 */
function isHotkeyRefused(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return true
  if (event.isComposing || event.defaultPrevented) return true
  const target = event.target
  return (
    target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select') !== null)
  )
}

/** Escape closes one layer: an open sheet, then the report (it lies over the board), then the settings. */
function closeOneLayer(): void {
  const ui = useStore.getState().ui
  if (ui.sheet !== null) ui.setSheet(null)
  // At XS the drawers exist only as sheets; Escape must not change a drawer state that is invisible there.
  else if (readBand() === 'xs') return
  else if (ui.report) ui.setReport(false)
  else if (ui.settings) ui.setSettings(false)
}

export interface HotkeyRow {
  keys: readonly string[]
  run(control: RunControl): void
}

/**
 * Bound wherever the stage is (the lab and the saved boards), which share each
 * drawer's state. `r` and `s` open the sheets at XS, the drawers above it.
 * `g`, `[` and `]` are the palette footer's; a refused run says nothing here,
 * `RunStatusBar` is the one voice for a broken rule.
 */
export const WORKSPACE_KEYS: readonly HotkeyRow[] = [
  // Shift is not a modifier here, so `F` too; also with the focus on a button such as Generate.
  { keys: ['f', 'F'], run: () => useStore.getState().ui.toggleSolo() },
  { keys: ['Escape'], run: closeOneLayer },
  {
    keys: ['r', 'R'],
    run: () => {
      const ui = useStore.getState().ui
      if (readBand() === 'xs') ui.toggleSheet('report')
      else ui.toggleReport()
    },
  },
  {
    keys: ['s', 'S'],
    run: () => {
      const ui = useStore.getState().ui
      if (readBand() === 'xs') ui.toggleSheet('settings')
      else ui.toggleSettings()
    },
  },
  { keys: ['g', 'G'], run: (control) => generate(control) },
  { keys: [']'], run: (control) => stepSeed(control, 1) },
  { keys: ['['], run: (control) => stepSeed(control, -1) },
]

/** One bubble-phase listener for `WORKSPACE_KEYS`, while a workspace tab is shown. */
export function useWorkspaceKeys(onWorkspace: boolean, control: RunControl): void {
  useEffect(() => {
    if (!onWorkspace) return
    const onKey = (event: KeyboardEvent) => {
      if (isHotkeyRefused(event)) return
      WORKSPACE_KEYS.find((row) => row.keys.includes(event.key))?.run(control)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onWorkspace, control])
}

/**
 * ⌘K on every route, docs included: navigation is half of what the palette is
 * for. It must open while a knob is being typed into, so it refuses only a
 * missing modifier, Alt, a repeat and a consumed key. `<arrowz-board>`'s
 * `onKeyDown` ignores modified keys, so it cannot swallow it.
 */
export function usePaletteKey(): void {
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

If the comment guard (`packages/engine/comments.test.ts`) refuses the module header or a doc block, shorten it; it must still state the Escape precedence once.

- [ ] **Step 3: Wire it into `App.tsx`**

- Delete `isHotkeyRefused`, `useSoloKey`, `usePaletteKey`, `useDrawerKeys` and `useRunKeys` with their doc comments.
- In `Shell`, the four calls `useSoloKey(onWorkspace)`, `useDrawerKeys(onWorkspace)`, `useRunKeys(onWorkspace, control)`, `usePaletteKey()` become two, at the same place:

```ts
  useWorkspaceKeys(onWorkspace, control)
  usePaletteKey()
```

- Imports: add `import { usePaletteKey, useWorkspaceKeys } from './shell/hotkeys'`; remove `generate`, `stepSeed` (`./run/actions`), the `RunControl` type import, and `readBand` from `./state/band` (keep `narrow`, still used by `useBandReset` until Task 4). Let `lab:lint` confirm nothing unused remains.

- [ ] **Step 4: Point the comments at the new names**

- `apps/lab/src/palette/CommandPalette.tsx`, the JSX comment near the footer that names `useRunKeys` and `useDrawerKeys`: name `useWorkspaceKeys` instead (keep the sentence's meaning: the palette opens everywhere, the workspace keys only on the workspace).
- `apps/lab/src/routes/LabLayout.browser.test.tsx`, the comments that name `useRunKeys`'s guard (~line 470): name `useWorkspaceKeys`.
- `apps/lab/src/palette/PaletteModal.browser.test.tsx`, the comment that names `useDrawerKeys` (~line 32): name `useWorkspaceKeys`' Escape.

Then `grep -rn "useRunKeys\|useDrawerKeys\|useSoloKey" apps/lab/src` must print nothing.

- [ ] **Step 5: Run the tests**

Run: `cd apps/lab && pnpm exec vitest run --project node src/shell/hotkeys.test.ts`
Expected: PASS (2 tests).

Mutation check: add `'f'` to the `g` row's `keys`, confirm "no key belongs to two rows" goes red, restore.

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/routes/LabLayout.browser.test.tsx src/shell/bands.browser.test.tsx src/palette/`
Expected: PASS, no assertion edited.

Run: the whole lab suite once, prettier, `lab:check`, `lab:lint`.

- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/shell/hotkeys.ts apps/lab/src/shell/hotkeys.test.ts apps/lab/src/App.tsx \
  apps/lab/src/palette/CommandPalette.tsx apps/lab/src/routes/LabLayout.browser.test.tsx apps/lab/src/palette/PaletteModal.browser.test.tsx
git commit -m "Lab: the workspace keys live in one table behind one listener; ⌘K beside them"
```

---

### Task 2: `useDismiss`

**Files:**
- Create: `apps/lab/src/shell/useDismiss.ts`
- Create: `apps/lab/src/shell/useDismiss.browser.test.tsx`

**Interfaces:**
- Produces: `useDismiss({ open, inside, onClose, refocus?, closeOnFocusOut? }): void` with
  - `open: boolean`
  - `inside: readonly RefObject<Element | null>[]` — every element that counts as the popover (the panel, and the trigger where a press on it must not close)
  - `onClose(): void`
  - `refocus?: RefObject<HTMLElement | null> | undefined` — focused after an Escape close only
  - `closeOnFocusOut?: boolean | undefined`

- [ ] **Step 1: Write the failing tests**

`apps/lab/src/shell/useDismiss.browser.test.tsx`:

```tsx
import { useRef, useState } from 'react'
import { render } from 'vitest-browser-react'
import { expect, test, vi } from 'vitest'
import { useDismiss } from './useDismiss'

/** A trigger, a popover holding one button, and one button outside; open at mount. */
function Probe({ focusOut = false }: { focusOut?: boolean }) {
  const [open, setOpen] = useState(true)
  const [renders, setRenders] = useState(0)
  const trigger = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  useDismiss({ open, inside: [pop, trigger], onClose: () => setOpen(false), refocus: trigger, closeOnFocusOut: focusOut })
  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen(true)}>
        trigger
      </button>
      <div ref={pop} data-testid="pop" data-open={String(open)}>
        <button type="button" onClick={() => setRenders((n) => n + 1)}>
          inside
        </button>
      </div>
      <button type="button">outside</button>
      <button type="button">elsewhere</button>
      <output data-testid="renders">{renders}</output>
    </>
  )
}

const button = (name: string) => {
  const found = [...document.querySelectorAll('button')].find((b) => b.textContent === name)
  if (found === undefined) throw new Error(`no button ${name}`)
  return found
}

const escape = (target: Element) => {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

test('a press outside closes it without moving the focus', async () => {
  const screen = await render(<Probe />)
  button('inside').focus()
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  await expect.element(screen.getByTestId('pop')).toHaveAttribute('data-open', 'false')
  expect(document.activeElement).toBe(button('inside'))
})

test('a press inside or on the trigger leaves it open', async () => {
  const screen = await render(<Probe />)
  button('inside').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  button('trigger').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  await expect.element(screen.getByTestId('pop')).toHaveAttribute('data-open', 'true')
})

test('Escape inside closes it, is consumed, and returns the focus to the trigger', async () => {
  const screen = await render(<Probe />)
  button('inside').focus()
  const event = escape(button('inside'))
  expect(event.defaultPrevented).toBe(true)
  await expect.element(screen.getByTestId('pop')).toHaveAttribute('data-open', 'false')
  expect(document.activeElement).toBe(button('trigger'))
})

test('Escape outside leaves it open and is not consumed', async () => {
  const screen = await render(<Probe />)
  button('outside').focus()
  const event = escape(button('outside'))
  expect(event.defaultPrevented).toBe(false)
  await expect.element(screen.getByTestId('pop')).toHaveAttribute('data-open', 'true')
})

test('focus leaving the popover closes it only with closeOnFocusOut', async () => {
  const without = await render(<Probe />)
  button('inside').focus()
  button('outside').focus()
  await expect.element(without.getByTestId('pop')).toHaveAttribute('data-open', 'true')
  without.unmount()

  const withOption = await render(<Probe focusOut />)
  button('inside').focus()
  button('outside').focus()
  await expect.element(withOption.getByTestId('pop')).toHaveAttribute('data-open', 'false')
})

test('focus moving between two outside elements leaves it open', async () => {
  const screen = await render(<Probe focusOut />)
  button('outside').focus()
  button('elsewhere').focus()
  await expect.element(screen.getByTestId('pop')).toHaveAttribute('data-open', 'true')
})

test('a re-render while open does not register the listeners again', async () => {
  const add = vi.spyOn(document, 'addEventListener')
  const screen = await render(<Probe />)
  const before = add.mock.calls.filter(([type]) => type === 'pointerdown').length
  button('inside').click()
  await expect.element(screen.getByTestId('renders')).toHaveTextContent('1')
  expect(add.mock.calls.filter(([type]) => type === 'pointerdown').length).toBe(before)
  add.mockRestore()
})
```

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/shell/useDismiss.browser.test.tsx`
Expected: FAIL — the module does not exist yet.

- [ ] **Step 2: Write `shell/useDismiss.ts`**

```ts
import { type RefObject, useEffect, useEffectEvent } from 'react'

/**
 * How a popover closes, while `open`: a press outside every `inside` element
 * closes it and leaves the focus alone; Escape pressed inside is consumed in
 * the capture phase, so it reaches no drawer (see `WORKSPACE_KEYS`), closes it
 * and focuses `refocus`; with `closeOnFocusOut`, focus leaving the popover for
 * an element outside closes it too. A key pressed outside is left alone: an
 * Escape in a knob entry discards that entry's draft.
 */
export function useDismiss({
  open,
  inside,
  onClose,
  refocus,
  closeOnFocusOut = false,
}: {
  open: boolean
  inside: readonly RefObject<Element | null>[]
  onClose(): void
  refocus?: RefObject<HTMLElement | null> | undefined
  closeOnFocusOut?: boolean | undefined
}): void {
  // Effect events: callers pass fresh callbacks and ref arrays each render, and the listeners must not re-register.
  const isInside = useEffectEvent(
    (target: EventTarget | null) =>
      target instanceof Node && inside.some((ref) => ref.current?.contains(target) ?? false),
  )
  const close = useEffectEvent((viaEscape: boolean) => {
    onClose()
    if (viaEscape) refocus?.current?.focus()
  })
  useEffect(() => {
    if (!open) return
    const onPress = (event: PointerEvent) => {
      if (!isInside(event.target)) close(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isInside(event.target)) return
      event.preventDefault()
      close(true)
    }
    // A `null` `relatedTarget` is focus to nowhere, a press on the page's body, which `onPress` handles.
    const onFocusOut = (event: FocusEvent) => {
      if (!isInside(event.target)) return
      const next = event.relatedTarget
      if (next instanceof Node && !isInside(next)) close(false)
    }
    document.addEventListener('pointerdown', onPress)
    document.addEventListener('keydown', onKey, true)
    if (closeOnFocusOut) document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('pointerdown', onPress)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [open, closeOnFocusOut])
}
```

If `lab:lint` (`react-hooks`) or `lab:check` refuses `useEffectEvent` (for example the installed `@types/react` lacks it), stop and report NEEDS_CONTEXT with the exact message; do not replace it with a ref written during render.

- [ ] **Step 3: Run the tests**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/shell/useDismiss.browser.test.tsx`
Expected: PASS (7 tests).

Mutation checks, each restored after: (a) drop `event.preventDefault()` → "Escape inside … is consumed" goes red; (b) call `close(true)` from `onPress` → "a press outside closes it without moving the focus" goes red; (c) drop the `if (!isInside(event.target)) return` line of `onFocusOut` → "focus moving between two outside elements" goes red; (d) put `onClose` in the effect's dependency array and call it directly → "a re-render while open" goes red (lint may object first; that also counts, record it).

Run: prettier, `lab:check`, `lab:lint`.

- [ ] **Step 4: Commit**

```bash
git add apps/lab/src/shell/useDismiss.ts apps/lab/src/shell/useDismiss.browser.test.tsx
git commit -m "Lab: useDismiss closes a popover on an outside press, an Escape inside, or focus leaving it"
```

---

### Task 3: The three popovers close through `useDismiss`

**Files:**
- Modify: `apps/lab/src/shell/TopBar.tsx` (the menu's effect)
- Modify: `apps/lab/src/run/MoreMenu.tsx` (the popover's effect)
- Modify: `apps/lab/src/run/PresetStrip.tsx` (the panel's effect, split in three)

**Interfaces:**
- Consumes: `useDismiss` (Task 2).

- [ ] **Step 1: `TopBar`**

Replace the comment above the menu's `useEffect` and the effect itself (from `// The menu's keys and presses` through `}, [menu, setMenu])`) with:

```tsx
  // The whole bar counts as inside: the chip toggles the menu itself.
  useDismiss({ open: menu, inside: [bar], onClose: () => setMenu(false), refocus: chip })
```

Imports: `useEffect` goes from `'react'`; add `import { useDismiss } from './useDismiss'`.

- [ ] **Step 2: `MoreMenu`**

Replace the `useEffect` (from `useEffect(() => {` through `}, [open])`) with:

```tsx
  useDismiss({ open, inside: [pop, button], onClose: () => setOpenIn(null), refocus: button })
```

Imports: `useEffect` goes; add `import { useDismiss } from '../shell/useDismiss'`. In the component's doc comment, "Escape consumed in a capture listener while open" becomes "closed by `useDismiss`".

- [ ] **Step 3: `PresetStrip`**

The one effect keyed on `open` becomes three pieces, in this order, replacing it from `useEffect(() => {` through `}, [open])`:

```tsx
  useDismiss({ open, inside: [root], onClose: () => setOpen(false), refocus: trigger, closeOnFocusOut: true })

  useEffect(() => {
    if (!open) return
    const panel = root.current?.querySelector('.fw-pp-panel')
    const first =
      panel?.querySelector<HTMLButtonElement>('button[aria-current="true"]') ??
      panel?.querySelector<HTMLButtonElement>('button')
    // No scroll: in a low window the panel is `position: fixed` under the top
    // bar, and a focus that scrolled `.fw-top` would shift the bar.
    first?.focus({ preventScroll: true })
  }, [open])

  useEffect(() => {
    if (!open) return
    // The panel's grid keys, only for keys pressed inside the strip; Escape is `useDismiss`'s.
    const onKey = (event: KeyboardEvent) => {
      if (!(event.target instanceof Node) || !(root.current?.contains(event.target) ?? false)) return
      const at = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-col]') : null
      if (at === null) return
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
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open])
```

Keep `close(refocus)` and `choose` unchanged. Add `import { useDismiss } from '../shell/useDismiss'`. The component's doc comment: its sentence "Its keys are a capture-phase document listener, installed only while open, so it runs before the drawer's Escape, which it consumes. It acts only on keys pressed inside the strip, and focus leaving the strip closes it." becomes "It closes through `useDismiss` (an outside press, an Escape inside, or focus leaving the strip), before the drawer's Escape; its arrow, Home and End keys act only inside the strip." The old comment about an Escape in a knob entry now lives in `useDismiss`'s header; do not repeat it.

- [ ] **Step 4: Run the tests**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/shell/TopBar.browser.test.tsx src/run/MoreMenu.browser.test.tsx src/run/PresetStrip.browser.test.tsx src/shell/bands.browser.test.tsx src/routes/LabLayout.browser.test.tsx`
Expected: PASS, no assertion edited.

Run: the whole lab suite once, prettier, `lab:check`, `lab:lint`.

- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/shell/TopBar.tsx apps/lab/src/run/MoreMenu.tsx apps/lab/src/run/PresetStrip.tsx
git commit -m "Lab: the top menu, the … popover and the preset panel close through useDismiss"
```

---

### Task 4: Side effects out of `App.tsx`

A move: the two hooks' bodies and doc comments do not change.

**Files:**
- Create: `apps/lab/src/library/useStoreSave.ts`, `apps/lab/src/shell/useBandReset.ts`
- Modify: `apps/lab/src/App.tsx`

**Interfaces:**
- Produces: `export function useStoreSave(): void` in `library/useStoreSave.ts`; `export function useBandReset(): void` in `shell/useBandReset.ts`.

- [ ] **Step 1: Move the two hooks**

Cut `useStoreSave` (with its doc comment) from `App.tsx` into `apps/lab/src/library/useStoreSave.ts` as an `export function`; its imports: `BoardFile` (type) from `'@arrowz/engine'`, `storeRequest` from `'@arrowz/engine/command'`, `exportCell` from `'@arrowz/engine/simple'`, `useEffect`, `useRef` from `'react'`, `saveBoard` from `'../api/boards'`, `useStore` from `'../state/store'`, `viewOf` from `'../state/view.slice'`.

Cut `useBandReset` (with its doc comment) into `apps/lab/src/shell/useBandReset.ts` as an `export function`; its imports: `useEffect`, `useRef` from `'react'`, `narrow` from `'../state/band'`, `useStore` from `'../state/store'`, `useBand`, `useLowWindow` from `'./useLayoutBand'`.

In `App.tsx`, import them (`'./library/useStoreSave'`, `'./shell/useBandReset'`) and drop every import only they used: `BoardFile`, `storeRequest`, `exportCell`, `useRef`, `saveBoard`, `narrow`, `useBand`, `viewOf`. `useEffect` and `useLowWindow` stay (`Shell` uses both). The calls in `Shell` stay where they are.

- [ ] **Step 2: Prove the bodies did not change**

```bash
cd "$(git rev-parse --show-toplevel)"
git diff --color-moved=plain --color-moved-ws=allow-indentation-change HEAD -- apps/lab/src/App.tsx apps/lab/src/library/useStoreSave.ts apps/lab/src/shell/useBandReset.ts | cat
```

Every `-` / `+` line that is not shown as moved must be an `import` line or a `function` → `export function` signature. Anything else is a body change: undo it.

- [ ] **Step 3: Run the tests**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/routes/Workspace.browser.test.tsx src/shell/bands.browser.test.tsx`
Expected: PASS, no assertion edited ("a finished run is offered to the store once per run" pins `useStoreSave`).

Run: the whole lab suite once, prettier, `lab:check`, `lab:lint`, and from the repo root `deno test --allow-read packages/engine/comments.test.ts packages/engine/neutral.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/lab/src/App.tsx apps/lab/src/library/useStoreSave.ts apps/lab/src/shell/useBandReset.ts
git commit -m "Lab: the store save and the band reset leave App.tsx; the shell keeps its hooks and layout"
```

---

### Task 5: Status, gates, the live pass and the PR

- [ ] **Step 1: Mark refactor 4 in `lab-review.md`**

In the refactors table of the status section, the row for refactor 4 (`| 4. … | open | |`; read its exact text first) becomes fixed on `lab/hotkeys-dismiss` with the commit range, in the same pattern as the rows for refactors 2 and 3 (what now exists: `shell/hotkeys.ts` with `WORKSPACE_KEYS` behind one listener, `useDismiss` for the top menu, the `…` popover and the preset panel, `CommandPalette` apart by decision, `useStoreSave` and `useBandReset` out of `App.tsx`). In "What is still open", item 3 drops refactor 4 and starts at refactor 5. Commit: `Lab review: the hotkeys and dismiss refactor is done`.

- [ ] **Step 2: Whole-repo gate in a clean worktree**

```bash
ROOT="$(git rev-parse --show-toplevel)"
git worktree add --detach ../arrowz-hotkeys HEAD
cd ../arrowz-hotkeys && corepack enable pnpm && pnpm install --frozen-lockfile
pnpm nx run-many -t verify --skip-nx-cache --output-style=static > /tmp/hotkeys-nx.log 2>&1; echo "nx=$?"
deno task verify > /tmp/hotkeys-deno.log 2>&1; echo "deno=$?"
cd "$ROOT" && git worktree remove ../arrowz-hotkeys
```

Expected: `nx=0`, `deno=0`. Record the counts.

- [ ] **Step 3: Live pass in Chrome on a copy of the store**

Use 8787/8789 if 8777/8779 are taken (a copy of `packages/cli/boards` in `/tmp`, `ARROWZ_BOARDS_DIR=… sh packages/cli/store.sh 8787`, an untracked `apps/lab/vite.pass.config.ts` with `server: { port: 8789, strictPort: true, proxy: labProxy('http://127.0.0.1:8787') }`). Check:
1. `f`, `g`, `[`, `]`, `r`, `s` on the lab and the saved boards; none in a knob entry; ⌘K in a knob entry opens the palette.
2. Report open, then the preset panel open: Escape closes the panel only; a second Escape closes the report; a third the settings.
3. Preset panel: arrows, Home, End move; Tab out of the strip closes it; a click on the board closes it.
4. At 375 px: the top menu opens, Escape inside closes it and focuses the chip; `r` opens the report sheet, Escape closes it. At a M/S width: the `…` popover opens, an outside press closes it, Escape inside closes it and focuses `…`.
5. Console: no errors. Afterwards kill only the two pass PIDs, delete the config, reset any `emulate`/viewport change, and confirm nothing under `packages/cli/boards` is newer than the copy.

- [ ] **Step 4: Push and open the PR** (only after the user agrees)

```bash
git push -u origin lab/hotkeys-dismiss
gh pr create --base lab/row-shell --title "Lab hotkeys and dismiss: one key table, one useDismiss, side effects out of App" --body-file <file>
```

The body lists the new files, the unchanged behaviour, the gate counts and the live pass. No attribution lines.
