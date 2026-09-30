# Lab practice issues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Narrow the lab's whole-slice subscriptions where a component reads a few fields, give the slices one template, and keep one source for each rule the lab writes twice.

**Architecture:** Engine first (three additive exports, no value changes), then the lab consumers, then the slice template, then the narrowed subscriptions with tests that count a pure child's calls, then `params.broken` and the class string, then the docs and the full gate.

**Tech Stack:** Deno 2.9 (engine), TypeScript, React 19, Zustand 5 (`useShallow` from `zustand/react/shallow`), Vitest 5 browser mode (Playwright Chromium), Nx, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-30-lab-practice-issues-design.md`

## Global Constraints

- Everything in the repository is in English: code, comments, tests, commit messages.
- No `any`, no non-null assertions (`!`). `as` is allowed only where this plan puts it (the one in `only` in `state/slice.ts`).
- The engine (`packages/engine/*.ts` except tests and scripts) knows neither Deno nor the DOM (`neutral.test.ts`).
- No value-changing fallback in the engine: `fingerprints.test.ts`, `svg-golden.test.ts` and `scripts/node-smoke.mjs` stay green unchanged.
- The lab reads the engine from `packages/engine/dist/`. After any engine change: `pnpm nx build engine --skip-nx-cache`, then grep the new export in `packages/engine/dist/`. The Nx cache is shared across worktrees; always `--skip-nx-cache`.
- Comments say why, once, in the fewest lines; no history (no PR, task, review, "used to"); cite symbols, never `file.ts:NN`. `packages/engine/comments.test.ts` guards `apps/lab/src` and `packages/engine/lab-*.ts`: non-header blocks ≤ 6 lines, headers ≤ 24.
- No attribution lines in commit messages.
- `pnpm` comes through corepack; if `corepack enable pnpm` is blocked in a sandbox, check `pnpm --version` first (it is often already on PATH).
- Lab formatting: `npx prettier --write <files>` in `apps/lab`, then `pnpm run fmt` as the check (`fmt` only checks). Engine formatting: `deno fmt <files>`, then `deno task fmt`.
- Every lab task runs all of `pnpm run check`, `pnpm run lint`, `pnpm run fmt` in `apps/lab`: Vitest does not type-check, and `tsc` failures (`noUnusedLocals`, `exactOptionalPropertyTypes`) only show in `check`.
- Browser tests: `render` is async; every browser case sets up its own state; `resetApp('advanced')` (from `src/harness/mountApp.tsx`) resets the whole store; `vitest-browser-react` unmounts between `test`s, not within one.
- The first `vitest run` in a fresh worktree may fail with "Vitest failed to find the runner" or fail to collect after a new dependency import; rerun once before treating it as a defect.

## Review Focus

1. **A size edit under a broken floor must show the new bound.** `straightFloor`'s `need` moves with `W`/`H`; keeping the previous `broken` array by `kind`/`key` alone would print a stale "Minimum for this board". Pinned in Task 6 (`a changed bound replaces the array`).
2. **The drawers must still remember and restore across reloads.** `report` defaults closed, `settings` defaults open and starts closed on a narrow band; `persistedFlag` must not move those reads. Pinned by the existing `state/preferences.browser.test.ts` and `shell/bands.browser.test.tsx`, which Task 4 runs unchanged.
3. **Saving a stored board's view must send the file it was read with.** `decodeBoardFile` must return the same object; a rebuilt one could drop a field. Pinned in Task 1 (`returns the object it was given`) and by the existing `library/useViewSave.browser.test.tsx`, run in Task 2.
4. **A palette jump into `ViewPanel`'s closed blocks must still open and focus.** `ViewPanel` reads `ui.focusTarget` separately from the narrowed view fields. Pinned by the existing `console/Console.jump.browser.test.tsx` and `console/ViewPanel.browser.test.tsx`, run in Task 5.
5. **Dates and one-decimal numbers must keep their form in both languages.** English moves from `'en'` to `'en-GB'` in `oneDecimal` and `dict.fmt`; digits and grouping must not change, and Polish keeps its comma. Pinned in Task 1 (engine) and Task 2 (`oneDecimal`).

---

### Task 1: Engine — `autoHeadWidth`, `decodeBoardFile`, `Dict.locale`

**Files:**
- Modify: `packages/engine/geometry.ts` (`pieceShape`, new `autoHeadWidth` above it)
- Modify: `packages/engine/board-file.ts` (new `assertBoardFile`, `decodeBoardFile` after `decodeBoard`)
- Modify: `packages/engine/lab-i18n.ts` (`Dict`, `dictionary`)
- Modify: `packages/engine/mod.ts` (exports)
- Test: `packages/engine/geometry.test.ts`, `packages/engine/board-file.test.ts`, `packages/engine/lab-i18n.test.ts`

**Interfaces:**
- Produces: `autoHeadWidth(width: number, cell: number): number` from `@arrowz/engine`; `decodeBoardFile(file: unknown): { board: BoardData; file: BoardFile }` from `@arrowz/engine`; `Dict.locale: 'pl' | 'en-GB'` from `@arrowz/engine/i18n`.

- [ ] **Step 1: Write the failing engine tests**

Append to `packages/engine/geometry.test.ts` (and add `autoHeadWidth` to its import from `./geometry.ts`):

```ts
Deno.test('autoHeadWidth is the head width pieceShape draws when the width is left automatic', () => {
  assertEquals(autoHeadWidth(30, 100), 0.4 * 100 + 0.9 * 30)
  assertEquals(autoHeadWidth(50, 100), 50)
  assertEquals(autoHeadWidth(80, 100), 80)
  // At cell 1 the width is already in cells, so stating it back is exact.
  for (const stroke of [0.2, 0.3, 0.45, 0.5, 0.8]) {
    const o = { cell: 1, pad: 0, width: stroke, headHeight: 1 }
    const auto = pieceShape(right, { ...o, headWidth: 0 })
    const stated = pieceShape(right, { ...o, headWidth: autoHeadWidth(stroke, 1) })
    assertEquals(stated.head, auto.head)
  }
})
```

Append to `packages/engine/board-file.test.ts` (add `decodeBoardFile` to the import from `./board-file.ts`):

```ts
Deno.test('decodeBoardFile returns the object it was given, with the board decodeBoard reads from it', () => {
  const carved = generate({ ...defaultParams(), W: 8, H: 8, seed: 1 }).board
  const file: unknown = JSON.parse(JSON.stringify(encodeBoard(carved)))
  const got = decodeBoardFile(file)
  assert(got.file === file, 'the same object, not a rebuilt one')
  assertSameBoard(got.board, decodeBoard(file))
})

Deno.test('decodeBoardFile throws what decodeBoard throws', () => {
  const bad = { format: BOARD_FORMAT, v: BOARD_FILE_VERSION + 1 }
  const want = assertThrows(() => decodeBoard(bad), BoardFileError)
  assertThrows(() => decodeBoardFile(bad), BoardFileError, want.message)
})
```

Append to `packages/engine/lab-i18n.test.ts`:

```ts
Deno.test('locale is the tag the lab formats dates and numbers in', () => {
  assertEquals(dictionary('en').locale, 'en-GB')
  assertEquals(dictionary('pl').locale, 'pl')
  // en-GB groups and rounds as en does, so moving the English tag changes no figure.
  const one = { minimumFractionDigits: 1, maximumFractionDigits: 1 }
  assertEquals((1234.5).toLocaleString('en-GB', one), (1234.5).toLocaleString('en', one))
  assertEquals((41.3).toLocaleString('pl', one), '41,3')
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/engine && deno test --allow-read --allow-run geometry.test.ts board-file.test.ts lab-i18n.test.ts`
Expected: type-check errors naming `autoHeadWidth`, `decodeBoardFile` (not exported) and `locale` (not on `Dict`).

- [ ] **Step 3: Implement**

In `packages/engine/geometry.ts`, directly above the `pieceShape` header comment, add:

```ts
/**
 * The head width drawn when it is left automatic (headWidth 0), in the units
 * of `width` and `cell`: a stick as wide as the line from half a cell up, else
 * 0.4 of a cell plus 0.9 of the line. The 1e-9 is float tolerance in drawing
 * units. See `pieceShape` for why these numbers.
 */
export function autoHeadWidth(width: number, cell: number): number {
  return width >= 0.5 * cell - 1e-9 ? width : 0.4 * cell + 0.9 * width
}
```

and in `pieceShape` replace

```ts
  const stick = w >= 0.5 * cell - 1e-9
  const autoWidth = stick ? w : 0.4 * cell + 0.9 * w
  const half = Math.max(w, o.headWidth > 0 ? o.headWidth * cell : autoWidth) / 2
```

with

```ts
  const half = Math.max(w, o.headWidth > 0 ? o.headWidth * cell : autoHeadWidth(w, cell)) / 2
```

(`stick` has no other use; check with `grep -n "stick" geometry.ts` that only comments remain.)

In `packages/engine/board-file.ts`, directly after `decodeBoard`'s closing brace, add:

```ts
/** Narrows what `readHeader` accepts: it checks every field a `BoardFile` has. */
function assertBoardFile(file: unknown): asserts file is BoardFile {
  readHeader(file)
}

/**
 * `decodeBoard`, and the very object it was given, typed as the file it was
 * checked to be: a caller that sends the file back sends it untouched.
 */
export function decodeBoardFile(file: unknown): { board: BoardData; file: BoardFile } {
  const board = decodeBoard(file)
  assertBoardFile(file)
  return { board, file }
}
```

In `packages/engine/lab-i18n.ts`, in `interface Dict` after `readonly lang: Lang`, add:

```ts
  /** The tag dates and numbers are formatted in: British English, so a date reads day first. */
  readonly locale: 'pl' | 'en-GB'
```

In `dictionary`, replace

```ts
  const fmt = (n: number) => n.toLocaleString(lang === 'pl' ? 'pl' : 'en')
```

with

```ts
  const locale = lang === 'pl' ? 'pl' : 'en-GB'
  const fmt = (n: number) => n.toLocaleString(locale)
```

and in the returned object add `locale,` right after `lang,`.

In `packages/engine/mod.ts`, change

```ts
export { DEFAULT_HEAD_HEIGHT, DEFAULT_ROUNDED, pieceShape, voidStrips } from './geometry.ts'
```

to

```ts
export { autoHeadWidth, DEFAULT_HEAD_HEIGHT, DEFAULT_ROUNDED, pieceShape, voidStrips } from './geometry.ts'
```

and add `decodeBoardFile` to the `./board-file.ts` export list (alphabetical, after `decodeBoard`).

- [ ] **Step 4: Run the tests and the engine gate**

Run: `cd packages/engine && deno fmt geometry.ts board-file.ts lab-i18n.ts mod.ts geometry.test.ts board-file.test.ts lab-i18n.test.ts && deno test --allow-read --allow-run geometry.test.ts board-file.test.ts lab-i18n.test.ts`
Expected: PASS.

Run: `cd /Users/tomek/dev/arrowz && deno task verify`
Expected: PASS, including `fingerprints.test.ts`, `svg-golden.test.ts`, `neutral.test.ts`, `comments.test.ts` (it sweeps `lab-i18n.ts`).

Run: `pnpm nx build engine --skip-nx-cache && pnpm nx run engine:smoke --skip-nx-cache && grep -c "autoHeadWidth\|decodeBoardFile" packages/engine/dist/mod.js && grep -c "locale" packages/engine/dist/lab-i18n.js`
Expected: build and smoke pass; both greps print a count ≥ 1.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/geometry.ts packages/engine/board-file.ts packages/engine/lab-i18n.ts packages/engine/mod.ts packages/engine/geometry.test.ts packages/engine/board-file.test.ts packages/engine/lab-i18n.test.ts
git commit -m "Engine: export autoHeadWidth and decodeBoardFile, and the dictionary's locale"
```

---

### Task 2: Lab consumers of the engine exports

**Files:**
- Modify: `apps/lab/src/console/viewFields.ts` (`autoHeadWidth` → `autoHeadChip`)
- Modify: `apps/lab/src/console/rows/NumberRow.tsx` (import and call)
- Modify: `apps/lab/src/console/viewFields.test.ts`
- Modify: `apps/lab/src/stage/useRunState.ts` (`oneDecimal`)
- Modify: `apps/lab/src/library/BoardColumn.tsx`, `apps/lab/src/library/BoardList.tsx` (locale; the cast)
- Modify: `apps/lab/src/library/openStoredBoard.ts`, `apps/lab/src/state/result.slice.ts` (`StoredBoard.file`), `apps/lab/src/library/useViewSave.ts`, `apps/lab/src/state/library.fixtures.ts`
- Create: `apps/lab/src/stage/oneDecimal.test.ts`

**Interfaces:**
- Consumes: Task 1's `autoHeadWidth`, `decodeBoardFile`, `Dict.locale` (through `packages/engine/dist`; build it first if this worktree has not).
- Produces: `autoHeadChip(stroke: number, step: number, max: number): number` in `console/viewFields.ts`; `StoredBoard.file: BoardFile`; `storedFixture(...)` returning `{ meta: BoardMeta; file: BoardFile }`.

- [ ] **Step 1: Write the failing tests**

In `apps/lab/src/console/viewFields.test.ts`, change the import to `import { autoHeadChip, VIEW_FLAGS, VIEW_NUMBERS, VIEW_ROWS } from './viewFields'` and replace every `autoHeadWidth(` call in the file with `autoHeadChip(` (the two tests at the end; their names stay).

Create `apps/lab/src/stage/oneDecimal.test.ts`:

```ts
import { dictionary } from '@arrowz/engine/i18n'
import { expect, test } from 'vitest'
import { oneDecimal } from './useRunState'

test('one decimal reads 41.3 in English and 41,3 in Polish', () => {
  expect(oneDecimal(dictionary('en'), 41.25)).toBe('41.3')
  expect(oneDecimal(dictionary('pl'), 41.25)).toBe('41,3')
})
```

- [ ] **Step 2: Run to verify**

Run: `cd apps/lab && pnpm vitest run --project node src/console/viewFields.test.ts src/stage/oneDecimal.test.ts`
Expected: `viewFields.test.ts` FAILS (`autoHeadChip` is not exported). `oneDecimal.test.ts` PASSES already: it pins the form before the locale moves, so it must stay green after Step 3.

- [ ] **Step 3: Implement**

`apps/lab/src/console/viewFields.ts`: add `import { autoHeadWidth } from '@arrowz/engine'` and replace the whole `autoHeadWidth` function and its header with:

```ts
/**
 * Where the automatic head width's chip lands when it is released and the row
 * held no width before: the width the element draws at 0 for this stroke
 * (`autoHeadWidth`, in cells), snapped to the field's step and held in its
 * range, so the head does not jump.
 */
export function autoHeadChip(stroke: number, step: number, max: number): number {
  const width = autoHeadWidth(stroke, 1)
  // `toFixed` against the float tail a multiple of 0.05 picks up (12 × 0.05).
  return Math.min(max, Number((Math.round(width / step) * step).toFixed(6)))
}
```

`apps/lab/src/console/rows/NumberRow.tsx`: import `autoHeadChip` instead of `autoHeadWidth` from `'../viewFields'`, and call `autoHeadChip(stroke, row.step, range.max)`.

`apps/lab/src/stage/useRunState.ts`, in `oneDecimal`: replace `dict.lang === 'pl' ? 'pl' : 'en'` with `dict.locale`.

`apps/lab/src/library/BoardColumn.tsx`: replace `toLocaleString(lang === 'pl' ? 'pl' : 'en-GB')` with `toLocaleString(dict.locale)`; delete `const lang = useStore((state) => state.lang.lang)` (no other use); replace `file={stored.file as BoardFile}` with `file={stored.file}`; delete `import type { BoardFile } from '@arrowz/engine'`.

`apps/lab/src/library/BoardList.tsx`: replace `toLocaleString(lang === 'pl' ? 'pl' : 'en-GB', {` with `toLocaleString(dict.locale, {`; delete `const lang = useStore((state) => state.lang.lang)`; if `useStore` has no other use in the file, delete its import (`check` will say).

`apps/lab/src/state/result.slice.ts`, in `interface StoredBoard`: `readonly file: unknown` → `readonly file: BoardFile` (`BoardFile` is already imported).

`apps/lab/src/library/openStoredBoard.ts`: import `decodeBoardFile` instead of `decodeBoard`, and replace

```ts
      const board = decodeBoard(outcome.file)
      if (cancelled) return
      state.library.clearNotice()
      state.result.showPreview({ origin: 'store', board, file: outcome.file, meta })
```

with

```ts
      const { board, file } = decodeBoardFile(outcome.file)
      if (cancelled) return
      state.library.clearNotice()
      state.result.showPreview({ origin: 'store', board, file, meta })
```

`apps/lab/src/library/useViewSave.ts`: delete the comment line `// Held as \`unknown\`; \`decodeBoard\` accepted it at load, and it goes back untouched.`, replace `storeRequest(file as BoardFile,` with `storeRequest(file,`, and drop `BoardFile` from the type import (keep `View`).

`apps/lab/src/state/library.fixtures.ts`: add `type BoardFile` to the `@arrowz/engine` import and change the return type to `{ meta: BoardMeta; file: BoardFile }`.

- [ ] **Step 4: Type-check and fix the test call sites `tsc` names**

Run: `cd apps/lab && pnpm run check`
Expected: PASS, or errors only in test files that build a `StoredBoard` from an `unknown` file. For each, take the file from `storedFixture` (already `BoardFile`) or from `decodeBoardFile(x).file`; never add `as BoardFile`. Rerun until PASS.

- [ ] **Step 5: Run the gates**

Run: `cd apps/lab && npx prettier --write src && pnpm run lint && pnpm run fmt && pnpm vitest run --project node && pnpm vitest run --project chromium src/library src/stage src/console/rows src/console/ViewPanel.browser.test.tsx`
Expected: all PASS.

Run: `grep -rn "as BoardFile\|'en-GB'\|=== 'pl' ? 'pl'" apps/lab/src`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add apps/lab/src
git commit -m "Lab: head chip, locale and stored board file from the engine's exports"
```

---

### Task 3: One `specOf`, `WorkspaceTab` in the ui slice

**Files:**
- Modify: `apps/lab/src/state/params.slice.ts` (export `specOf`)
- Modify: `apps/lab/src/console/KnobPanel.tsx`, `apps/lab/src/simple/SimplePanel.tsx`, `apps/lab/src/console/StartKnob.tsx`
- Modify: `apps/lab/src/state/ui.slice.ts` (add `WorkspaceTab`), `apps/lab/src/routes/Workspace.tsx`, `apps/lab/src/console/Console.tsx`, `apps/lab/src/shell/SheetBar.tsx`
- Test: `apps/lab/src/state/params.slice.test.ts`

**Interfaces:**
- Produces: `specOf(key: ParamKey): ParamSpec` exported from `state/params.slice.ts`; `WorkspaceTab = 'lab' | 'library'` exported from `state/ui.slice.ts`.

- [ ] **Step 1: Write the failing test**

Append to `apps/lab/src/state/params.slice.test.ts` (extend the import from `./params.slice` with `specOf`):

```ts
test('specOf is the PARAM_SPEC row for a key', () => {
  for (const spec of PARAM_SPEC) expect(specOf(spec.key)).toBe(spec)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/lab && pnpm vitest run --project node src/state/params.slice.test.ts`
Expected: FAIL (`specOf` is not exported).

- [ ] **Step 3: Implement**

`state/params.slice.ts`: `function specOf(` → `export function specOf(` (its header stays).

`console/KnobPanel.tsx`: delete the local `specOf` function; add `import { specOf } from '../state/params.slice'`; remove `ParamKey` and `ParamSpec` from the `@arrowz/engine` import if `check` reports them unused.

`simple/SimplePanel.tsx`: delete the local `specOf`; add `import { specOf } from '../state/params.slice'`; remove the `@arrowz/engine` import of `PARAM_SPEC, type ParamSpec` if nothing else uses them.

`console/StartKnob.tsx`: replace the `MIX_SPEC` block (the header comment starting "Read once, at module load" and the IIFE) with

```ts
const MIX_SPEC = specOf('mix')
```

import `specOf` from `'../state/params.slice'`, and drop the `@arrowz/engine` import if it becomes empty.

`state/ui.slice.ts`: directly above the `BoardsPanel` header comment, add

```ts
/** The two tabs `Workspace` serves: the lab and the saved boards. */
export type WorkspaceTab = 'lab' | 'library'
```

`routes/Workspace.tsx`: delete `export type WorkspaceTab = 'lab' | 'library'` and import the type: `import type { WorkspaceTab } from '../state/ui.slice'` (merge with an existing import from that module if there is one).

`console/Console.tsx` and `shell/SheetBar.tsx`: change `import type { WorkspaceTab } from '../routes/Workspace'` to `import type { WorkspaceTab } from '../state/ui.slice'`.

- [ ] **Step 4: Run the gates**

Run: `cd apps/lab && npx prettier --write src && pnpm run check && pnpm run lint && pnpm run fmt && pnpm vitest run --project node && pnpm vitest run --project chromium src/console src/simple src/shell src/routes`
Expected: all PASS.

Run: `grep -rn "function specOf\|PARAM_SPEC.find\|from '../routes/Workspace'" apps/lab/src | grep -v test`
Expected: only `state/params.slice.ts:… export function specOf`.

- [ ] **Step 5: Commit**

```bash
git add apps/lab/src
git commit -m "Lab: one specOf from the params slice; WorkspaceTab lives in the ui slice"
```

---

### Task 4: One slice template

**Files:**
- Create: `apps/lab/src/state/slice.ts`, `apps/lab/src/state/slice.test.ts`
- Modify: all nine slices: `state/{lang,library,params,recipe,result,run,series,ui,view}.slice.ts`

**Interfaces:**
- Produces: `SliceSet<K extends string, S>`, `patcher(set, key)`, `persistedFlag(set, key, field, storageKey)` from `state/slice.ts`.

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/state/slice.test.ts`:

```ts
import { expect, test } from 'vitest'
import { patcher, persistedFlag, type SliceSet } from './slice'

interface Box {
  a: number
  list: number[]
  open: boolean
}

function store(box: Box) {
  const held: { box: Box } = { box }
  const set: SliceSet<'box', Box> = (fn) => Object.assign(held, fn(held))
  return { held, set }
}

test('patcher replaces the named fields and keeps the others by reference', () => {
  const list = [1, 2]
  const { held, set } = store({ a: 1, list, open: false })
  patcher(set, 'box')({ a: 2 })
  expect(held.box.a).toBe(2)
  expect(held.box.list).toBe(list)
})

test('a persisted flag sets, and toggles from the value in the store', () => {
  const { held, set } = store({ a: 1, list: [], open: false })
  const flag = persistedFlag(set, 'box', 'open', 'slice-test-flag')
  flag.set(true)
  expect(held.box.open).toBe(true)
  flag.toggle()
  flag.toggle()
  expect(held.box.open).toBe(true)
  flag.toggle()
  expect(held.box.open).toBe(false)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/lab && pnpm vitest run --project node src/state/slice.test.ts`
Expected: FAIL (cannot resolve `./slice`).

- [ ] **Step 3: Implement `state/slice.ts`**

```ts
import { writeStored } from './storage'

/**
 * The `set` a slice receives: it reads and returns its own field only. The
 * store hands in Zustand's `set`, which accepts this; a slice never names
 * `Store`, because the store imports the slices.
 */
export type SliceSet<K extends string, S> = (fn: (state: Record<K, S>) => Record<K, S>) => void

/** The keys of `S` whose values are booleans. */
type FlagKey<S> = { [P in keyof S]-?: S[P] extends boolean ? P : never }[keyof S]

/** `{ [key]: value }`, typed: a computed key widens to `string`, and this record has exactly the one key. */
function only<K extends string, S>(key: K, value: S): Record<K, S> {
  return { [key]: value } as Record<K, S>
}

/** Merges a partial into slice `key`. */
export function patcher<K extends string, S>(setSlice: SliceSet<K, S>, key: K): (next: Partial<S>) => void {
  return (next) => setSlice((state) => only(key, { ...state[key], ...next }))
}

/**
 * A boolean field remembered as `open` or `closed` under `storageKey`. The
 * toggle reads inside the update: a button and a key can both fire before a render.
 */
export function persistedFlag<K extends string, S>(
  setSlice: SliceSet<K, S>,
  key: K,
  field: FlagKey<S>,
  storageKey: string,
): { set(on: boolean): void; toggle(): void } {
  const write = (state: Record<K, S>, on: boolean): Record<K, S> => {
    writeStored(storageKey, on ? 'open' : 'closed')
    return only(key, { ...state[key], [field]: on })
  }
  return {
    set: (on) => setSlice((state) => write(state, on)),
    toggle: () => setSlice((state) => write(state, !state[key][field])),
  }
}
```

Run: `cd apps/lab && pnpm vitest run --project node src/state/slice.test.ts && pnpm run check`
Expected: PASS. If `tsc` rejects the spread `{ ...state[key], [field]: on }` as not assignable to `S`, write it as `only(key, Object.assign({}, state[key], { [field]: on }))`; do not add a second `as`.

- [ ] **Step 4: Move the nine slices onto the template**

In each of `lang`, `library`, `params`, `recipe`, `result`, `run`, `series`, `ui`, `view` (`state/<name>.slice.ts`):

1. Delete the line `type SetStore = (fn: (state: { <name>: <Name>State }) => { <name>: <Name>State }) => void`.
2. Add `import type { SliceSet } from './slice'`, or `import { patcher, type SliceSet } from './slice'` (and `persistedFlag` in `ui`) where the values are used below.
3. Change `export function create<Name>Slice(set: SetStore): <Name>State` to `export function create<Name>Slice(set: SliceSet<'<name>', <Name>State>): <Name>State`.

In `library`, `run`, `series`, `ui`, `view`, replace the hand-written

```ts
  const patch = (next: Partial<<Name>State>) => set((state) => ({ <name>: { ...state.<name>, ...next } }))
```

with

```ts
  const patch = patcher(set, '<name>')
```

In `ui.slice.ts`, below `const patch = patcher(set, 'ui')`, add

```ts
  const report = persistedFlag(set, 'ui', 'report', REPORT_KEY)
  const settings = persistedFlag(set, 'ui', 'settings', SETTINGS_KEY)
```

and replace `setReport`, `toggleReport`, `setSettings`, `toggleSettings` (with the two `// Read inside the update, like \`toggleSolo\`.` comments above the toggles) by:

```ts
    setReport: report.set,
    toggleReport: report.toggle,
    setSettings: settings.set,
    toggleSettings: settings.toggle,
```

The initial `report:` and `settings:` reads stay as they are. `writeStored` stays imported only if `setMode` still uses it (it does).

- [ ] **Step 5: Run the gates**

Run: `cd apps/lab && npx prettier --write src && pnpm run check && pnpm run lint && pnpm run fmt && pnpm vitest run --project node && pnpm vitest run --project chromium src/state src/shell src/harness`
Expected: all PASS, `state/preferences.browser.test.ts` and `shell/bands.browser.test.tsx` included and unchanged.

Run: `grep -rn "type SetStore\|const patch = (next" apps/lab/src`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/state
git commit -m "Lab: one slice template (SliceSet, patcher, persistedFlag)"
```

---

### Task 5: Narrowed subscriptions, counted

**Files:**
- Create: `apps/lab/src/state/subscriptions.browser.test.tsx`
- Modify: `apps/lab/src/console/ViewPanel.tsx`, `apps/lab/src/console/rows/ColoursSection.tsx`, `apps/lab/src/report/SeriesSection.tsx`
- Modify: `apps/lab/vitest.config.ts` (`optimizeDeps.include`)
- Modify (one comment line each): `apps/lab/src/run/LiveCommand.tsx`, `apps/lab/src/stage/useRunState.ts` (`useRunLine`)

**Interfaces:**
- Consumes: `resetApp` from `src/harness/mountApp.tsx`, `renderAt` from `src/harness/renderAt.tsx`, `twoFrames` from `src/harness/frames.ts`.
- Produces: the test file Task 6 extends; the helper `callsDuring` inside it.

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/state/subscriptions.browser.test.tsx`:

```tsx
import { defaultParams, type SeedRun } from '@arrowz/engine'
import type { ReactNode } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'
import { ViewPanel } from '../console/ViewPanel'
import { ColoursSection } from '../console/rows/ColoursSection'
import { Section } from '../console/rows/Section'
import { twoFrames } from '../harness/frames'
import { resetApp } from '../harness/mountApp'
import { renderAt } from '../harness/renderAt'
import { SeriesSection } from '../report/SeriesSection'
import { StatRowView } from '../report/StatRowView'
import type { RunControl } from '../run/useRun'
import { useStore } from './store'

// Every export calls through. A pure child (no store hook) renders only when
// its parent does, so its calls count the parent's renders; a Profiler cannot,
// since it counts commits of the whole subtree, the row that reads the field included.
vi.mock('../console/rows/Section', { spy: true })
vi.mock('../report/StatRowView', { spy: true })

/** The calls `child` gets from `edit`, once `node` has mounted and settled. */
async function callsDuring(node: ReactNode, child: { mock: { calls: unknown[] } }, edit: () => void) {
  await renderAt(node)
  await twoFrames()
  const before = child.mock.calls.length
  edit()
  await twoFrames()
  return child.mock.calls.length - before
}

const control: RunControl = { start: vi.fn(), abort: vi.fn(), hold: vi.fn(), checkSeeds: vi.fn() }

function seriesDone() {
  const s = useStore.getState().series
  s.started({ ...defaultParams(), seed: 10 }, 2)
  const runs: SeedRun[] = [
    { seed: 10, outcome: 'complete', pieces: 10, maxLen: 20, genMs: 5, remaining: 0 },
    { seed: 11, outcome: 'incomplete', pieces: 9, maxLen: 9, genMs: 9, remaining: 312 },
  ]
  for (const run of runs) s.answered(run)
  s.finished()
}

beforeEach(() => {
  vi.clearAllMocks()
  resetApp('advanced')
})

test('a stroke edit does not re-render the preview panel', async () => {
  const calls = await callsDuring(<ViewPanel />, vi.mocked(Section), () =>
    useStore.getState().view.setNumber('stroke', '0.3'),
  )
  expect(calls).toBe(0)
})

test('turning the point grid on re-renders the preview panel, which reads it', async () => {
  const calls = await callsDuring(<ViewPanel />, vi.mocked(Section), () => useStore.getState().view.toggle('showPoints'))
  expect(calls).toBeGreaterThan(0)
})

test('a stroke edit does not re-render the colours section', async () => {
  const calls = await callsDuring(<ColoursSection />, vi.mocked(Section), () =>
    useStore.getState().view.setNumber('stroke', '0.3'),
  )
  expect(calls).toBe(0)
})

test('a paper edit re-renders the colours section, which reads it', async () => {
  const calls = await callsDuring(<ColoursSection />, vi.mocked(Section), () =>
    useStore.getState().view.setPaper('#112233'),
  )
  expect(calls).toBeGreaterThan(0)
})

test('committing the seed count does not re-render the series section', async () => {
  seriesDone()
  const calls = await callsDuring(<SeriesSection control={control} />, vi.mocked(StatRowView), () =>
    useStore.getState().series.setCount(7),
  )
  expect(calls).toBe(0)
})

test('a new answer re-renders the series section, which reads the runs', async () => {
  seriesDone()
  const calls = await callsDuring(<SeriesSection control={control} />, vi.mocked(StatRowView), () =>
    useStore.getState().series.answered({ seed: 12, outcome: 'complete', pieces: 8, maxLen: 7, genMs: 4, remaining: 0 }),
  )
  expect(calls).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Run to verify the three narrowing cases fail**

Run: `cd apps/lab && pnpm vitest run --project chromium src/state/subscriptions.browser.test.tsx`
Expected: the three `does not re-render` cases FAIL with `expected 5 to be 0`, `expected 1 to be 0`, `expected 3 to be 0` (measured on `7230418`); the three positive controls PASS. (`answered` appends to `runs` after `finished()` too, so the series control renders.) Write the three red counts into the commit message.

- [ ] **Step 3: Narrow the three components**

`console/ViewPanel.tsx`: add `import { useShallow } from 'zustand/react/shallow'` and replace `const view = useStore((state) => state.view)` with

```tsx
  const view = useStore(
    useShallow((state) => ({
      highlightLongest: state.view.highlightLongest,
      showPoints: state.view.showPoints,
      pointColor: state.view.pointColor,
      setPointColor: state.view.setPointColor,
    })),
  )
```

`console/rows/ColoursSection.tsx`: add the same import and replace its `const view = useStore((state) => state.view)` with

```tsx
  const view = useStore(
    useShallow((state) => ({
      paper: state.view.paper,
      ink: state.view.ink,
      highlightColor: state.view.highlightColor,
      setPaper: state.view.setPaper,
      setInk: state.view.setInk,
      setHighlightColor: state.view.setHighlightColor,
    })),
  )
```

`report/SeriesSection.tsx`: add the same import and replace `const series = useStore((state) => state.series)` with

```tsx
  const series = useStore(
    useShallow((state) => ({
      params: state.series.params,
      runs: state.series.runs,
      error: state.series.error,
      phase: state.series.phase,
    })),
  )
```

`apps/lab/vitest.config.ts`, in the chromium project: `optimizeDeps: { include: ['react-dom/client'] }` → `optimizeDeps: { include: ['react-dom/client', 'zustand/react/shallow'] }`, and extend the comment above it by one sentence: `` `zustand/react/shallow` is named for the same reason: a first run after its import failed to collect. ``

`run/LiveCommand.tsx`: above `const view = useStore((state) => state.view)` add `` // The whole slice: the command reads every field but `voids` through `viewOf`. ``

`stage/useRunState.ts`, in `useRunLine`: above `const run = useStore((state) => state.run)` add `` // The whole slice: the line shows `run.progress`, which is what every progress message replaces. ``

(`palette/CommandPalette.tsx` and `stage/BoardFrame.tsx` already say why they hold the whole `view`: the palette's dependency comment and `BoardFrame`'s header. Leave them.)

- [ ] **Step 4: Run the tests and the gates**

Run: `cd apps/lab && npx prettier --write src vitest.config.ts && pnpm run check && pnpm run lint && pnpm run fmt && pnpm vitest run --project chromium src/state/subscriptions.browser.test.tsx src/console src/report src/series src/palette src/run`
Expected: all PASS; the subscriptions file 6/6.

Mutation check (revert by hand afterwards): put `useStore((state) => state.view)` back in `ViewPanel.tsx` only; rerun the subscriptions file; expected exactly one failure (`a stroke edit does not re-render the preview panel`), and the colours case still passes because `ColoursSection` is not mounted inside the panel in its own case. Restore the narrowed selector; `git diff --stat` must show only the intended files.

- [ ] **Step 5: Commit**

```bash
git add apps/lab/src apps/lab/vitest.config.ts
git commit -m "Lab: panels subscribe to the view and series fields they read

Counted through a pure child's calls: on main a stroke edit re-rendered
the preview panel (5 Section calls) and the colours section (1), and a
seed-count commit re-rendered the series section (3 StatRowView calls)."
```

(Replace the three counts with the ones Step 2 printed if they differ.)

---

### Task 6: `params.broken` keeps equal arrays; the Workspace class string

**Files:**
- Modify: `apps/lab/src/state/params.slice.ts` (`indexesOf`, its callers in `createParamsSlice`)
- Modify: `apps/lab/src/routes/Workspace.tsx` (the `fw-lab` className)
- Test: `apps/lab/src/state/params.slice.test.ts`, `apps/lab/src/state/subscriptions.browser.test.tsx`

**Interfaces:**
- Consumes: `callsDuring` and the `beforeEach` of Task 5's test file.
- Produces: `indexesOf(values: Params, prev?: Indexes): Indexes`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/lab/src/state/params.slice.test.ts`:

```ts
test('a knob that stays broken keeps its violation array when another knob is edited', () => {
  reset()
  params().set('Lmax', 5)
  const before = params().broken.Lmax
  expect(before).toBeDefined()
  params().set('W', 31)
  expect(params().broken.Lmax).toBe(before)
})

test('a changed bound replaces the array, so the row prints the new need', () => {
  reset()
  params().setMany({ W: 900, H: 900, pStraight: 0.6 })
  const before = params().broken.pStraight
  params().setMany({ W: 1000, H: 1000 })
  const after = params().broken.pStraight
  expect(after).not.toBe(before)
  const rule = after?.find((v) => v.kind === 'rule')
  expect(rule?.kind === 'rule' ? rule.need : undefined).toBe(straightFloor(params().values))
})
```

Before relying on the second case, print `straightFloor` at 900×900 and 1000×1000 with `pStraight: 0.6` (a one-off `node -e` over `packages/engine/dist/mod.js`, or a temporary `console.log` thrown as an error) and confirm the two differ and that 0.6 is below both; if not, pick two sizes where both hold and use them.

Append to `apps/lab/src/state/subscriptions.browser.test.tsx` (add `import { KnobTrack } from '../console/KnobRow'`, `import { ValueKnob } from '../console/ValueKnob'`, `import { specOf } from './params.slice'`, and `vi.mock('../console/KnobRow', { spy: true })` beside the other two mocks):

```tsx
test('a knob that stays broken does not re-render when another knob is edited', async () => {
  useStore.getState().params.set('Lmax', 5)
  const calls = await callsDuring(<ValueKnob spec={specOf('Lmax')} />, vi.mocked(KnobTrack), () =>
    useStore.getState().params.set('W', 31),
  )
  expect(calls).toBe(0)
})

test('a valid knob does not re-render when another knob is edited', async () => {
  const calls = await callsDuring(<ValueKnob spec={specOf('W')} />, vi.mocked(KnobTrack), () =>
    useStore.getState().params.set('H', 31),
  )
  expect(calls).toBe(0)
})

test('editing a broken knob re-renders it', async () => {
  useStore.getState().params.set('Lmax', 5)
  const calls = await callsDuring(<ValueKnob spec={specOf('Lmax')} />, vi.mocked(KnobTrack), () =>
    useStore.getState().params.set('Lmax', 6),
  )
  expect(calls).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Run to verify**

Run: `cd apps/lab && pnpm vitest run --project node src/state/params.slice.test.ts && pnpm vitest run --project chromium src/state/subscriptions.browser.test.tsx`
Expected: `keeps its violation array` FAILS (a fresh array each commit); `a changed bound replaces the array` PASSES (it guards the fix); `a knob that stays broken does not re-render` FAILS with `expected 1 to be 0` (measured); the valid-knob and edited-knob cases PASS.

- [ ] **Step 3: Implement**

In `state/params.slice.ts`, add above `indexesOf`:

```ts
/** Field by field, `value` and `need` included: the row prints both, and `need` moves with the board size. */
function sameViolations(a: readonly Violation[], b: readonly Violation[]): boolean {
  return a.length === b.length && a.every((v, i) => JSON.stringify(v) === JSON.stringify(b[i]))
}
```

Change `export function indexesOf(values: Params): Indexes {` to `export function indexesOf(values: Params, prev?: Indexes): Indexes {`, and extend its header's last sentence with ` A key whose violations did not change keeps \`prev\`'s array, so its knob does not re-render.` Then replace the block that builds `broken`:

```ts
  const broken: Partial<Record<ParamKey, Violation[]>> = {}
  for (const v of list) {
    for (const key of v.kind === 'rule' ? v.keys : [v.key]) {
      const seen = broken[key]
      if (seen) seen.push(v)
      else broken[key] = [v]
    }
  }
```

with

```ts
  const found: Partial<Record<ParamKey, Violation[]>> = {}
  for (const v of list) {
    for (const key of v.kind === 'rule' ? v.keys : [v.key]) {
      const seen = found[key]
      if (seen) seen.push(v)
      else found[key] = [v]
    }
  }
  const broken: Partial<Record<ParamKey, readonly Violation[]>> = {}
  for (const key of Object.keys(found) as ParamKey[]) {
    const now = found[key]
    if (!now) continue
    const was = prev?.broken[key]
    broken[key] = was && sameViolations(was, now) ? was : now
  }
```

(`Object.keys(...) as ParamKey[]` follows the file's existing `Object.entries(patch) as [ParamKey, number][]`: a key list, not a value.) The `inactive` loop below reads `broken[spec.key]` unchanged.

In `createParamsSlice`, pass the previous indexes at the four places that call `indexesOf` on an update: `...indexesOf(c.values, state.params)` in `write` and in `setStart`, and `...indexesOf(values, state.params)` in `reset`. The initial `...indexesOf(initial)` stays.

In `routes/Workspace.tsx`, replace the `className={`fw-lab…`}` template with

```tsx
          className={[
            'fw-lab',
            lab ? '' : 'library',
            simple ? 'simple' : '',
            lab && !simple && presetsInTop ? 'presets-top' : '',
            solo ? 'solo' : '',
            sheet === null ? '' : `sheet-${sheet}`,
          ]
            .filter(Boolean)
            .join(' ')}
```

- [ ] **Step 4: Run the tests and the gates**

Run: `cd apps/lab && npx prettier --write src && pnpm run check && pnpm run lint && pnpm run fmt && pnpm vitest run --project node && pnpm vitest run --project chromium src/state src/console src/routes src/shell`
Expected: all PASS.

Mutation check (revert by hand afterwards): make `sameViolations` compare only `v.kind` and `v.key`; rerun `src/state/params.slice.test.ts`; expected exactly `a changed bound replaces the array` to fail. Restore.

- [ ] **Step 5: Commit**

```bash
git add apps/lab/src
git commit -m "Lab: a knob that stays broken keeps its violations, and the lab's class list is an array

On main a broken Lmax knob re-rendered on every edit of another knob
(1 KnobTrack call per edit)."
```

---

### Task 7: Docs and the full gate

**Files:**
- Modify: `lab-review.md` (the "Smaller practice issues and dead code" table)

- [ ] **Step 1: Update the table rows**

In `lab-review.md`, under `### Smaller practice issues and dead code`, set these rows (Status | Note):

- `Whole-slice subscriptions` → `fixed on \`lab/practice-issues\`` | `ViewPanel`, `ColoursSection` and `SeriesSection` read their fields through `useShallow`, counted in `state/subscriptions.browser.test.tsx`; `LiveCommand`, `CommandPalette`, `BoardFrame` and `useRunLine` read every field they subscribe to`
- `` `specOf` written four times `` → `fixed on \`lab/practice-issues\`` | `One, exported from \`state/params.slice.ts\``
- `` Hard-coded `'on' : 'off'` `` → `fixed in \`feb59ab\`` | `The palette reads \`valueOn\`/\`valueOff\``
- `` `autoHeadWidth` copies the engine `` → `fixed on \`lab/practice-issues\`` | `The engine exports \`autoHeadWidth\`; the lab's \`autoHeadChip\` snaps it`
- `` `file: unknown` then `as BoardFile` `` → `fixed on \`lab/practice-issues\`` | `\`decodeBoardFile\` returns the file typed`
- `Locale mapping duplicated` → `fixed on \`lab/practice-issues\`` | `\`dict.locale\``
- `Slice boilerplate` → `fixed on \`lab/practice-issues\`` | `\`state/slice.ts\`: \`SliceSet\`, \`patcher\`, \`persistedFlag\``
- `` `params.broken` rebuilt on every commit `` → `fixed on \`lab/practice-issues\`` | `Measured: a broken knob re-rendered on every other edit; equal violations keep their array`
- `Workspace class string (`cx()`)` → `fixed on \`lab/practice-issues\`` | `One site left, an array joined; no helper`
- `` `BoardFrame` memo keys `` → `obsolete` | `\`viewOf\` carries the look, so \`labView\` reads every field it depends on`
- `` Circular type import `Console` ↔ `Workspace` `` → `fixed on \`lab/practice-issues\`` | `\`WorkspaceTab\` lives in \`state/ui.slice.ts\``

In "What is still open", item 3, change `**Structural refactors:** 11; 5 and 7 are done.` to `**Structural refactors:** 11; 5 and 7 are done. The smaller practice issues are done on \`lab/practice-issues\`.`

- [ ] **Step 2: The full gate, in a clean worktree**

```bash
cd /Users/tomek/dev/arrowz
git worktree add --detach ../arrowz-gate HEAD
cd ../arrowz-gate && pnpm install --frozen-lockfile
set -o pipefail
deno task verify 2>&1 | tail -5
pnpm nx run-many -t verify --skip-nx-cache 2>&1 | tail -25
```

Expected: both PASS (read the result from the Nx summary, not from `$?` after a pipe).

Run: `deno task jev comments apps/lab/src/state/slice.ts apps/lab/src/state/subscriptions.browser.test.tsx packages/engine/geometry.ts packages/engine/board-file.ts` (advisory only; silent without the key). Act on a flag only if it names a real history marker or an unclear sentence.

Then remove the worktree: `cd /Users/tomek/dev/arrowz && git worktree remove ../arrowz-gate`.

- [ ] **Step 3: Commit**

```bash
git add lab-review.md
git commit -m "lab-review: the smaller practice issues are done"
```
