# Lab refactors 6, 8 and 9 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close refactors 6, 8 and 9 from `lab-review.md`: one command figure with Copy, the stored-board opening as a plain function tested in node, and one roving-focus helper.

**Architecture:** Three independent groups of commits on one branch. A adds `run/CommandFigure.tsx` and moves three copies of the command block onto it. B moves `useStoredBoard`'s effect body into `library/openStoredBoard.ts`, a function that returns its cancel and takes `read` as a parameter. C adds `shell/roving.ts` (`nextIndex`, `useFocusFollowsSelection`) and moves four strips and the palette onto it.

**Tech Stack:** React 19, zustand 5, Vitest 4 (projects `node` for `*.test.ts(x)`, `chromium` for `*.browser.test.tsx`), TypeScript strict, `@arrowz/engine` from `packages/engine/dist`.

**Spec:** `docs/superpowers/specs/2026-09-29-lab-refactors-6-8-9-design.md`

## Global Constraints

- Everything in the repository is in English: code, comments, tests, commits.
- No `any`, no non-null assertions (`x!`).
- Comments say why, once, in the fewest lines. Non-header blocks ≤ 6 lines; headers ≤ 24 lines (`packages/engine/comments.test.ts` guards `apps/lab/src`). No history in comments. Cite symbols, never `file.ts:NN`.
- In tests the test name carries the *what*; a comment only explains arbitrary-looking setup.
- The lab reads the engine from `dist`. In a fresh worktree run `pnpm install` and `pnpm nx run-many -t build -p engine board-element` once before any lab test.
- Run lab tests from `apps/lab`: `npx vitest run <paths>`. Node-project files are `*.test.ts(x)`, browser ones `*.browser.test.tsx`.
- Before each commit in `apps/lab`: `npx prettier --write <changed files>` (eslint does not catch formatting; `lab:fmt` does).
- No attribution lines in commit messages.
- Final gate: `pnpm nx run-many -t verify` from the repository root. Use `set -o pipefail` when piping its output.

## Review Focus

1. **A board opened from disk with no meta** has no command at all. `FileColumn` must keep rendering no figure (and so no Copy) when `meta === null`. The existing test "a file with no meta offers exports, and neither Delete nor Load into lab" covers the buttons; Task 1 adds `.fw-cmdfig` absence to it.
2. **A selection made while the focus is elsewhere** (a link naming a language, a palette jump to a group) must not pull the focus into the strip. Task 4 pins this in `roving.browser.test.tsx`.
3. **A re-render with the same selection** (a violation count changing next to `GroupRail`, the listing refreshing next to `BoardsRail`) must not call `focus()`. Task 4 pins it.
4. **The address moving while a read is in flight** must never let the old answer land. Task 2 pins cancel-then-answer and the A→B→A walk.
5. **A listing refresh on the board already drawn** (a view save refreshes it) must neither re-read nor clear `viewSaved`. Task 2 pins it.

A `CommandPalette` `active` index past the end of the hits is not reachable today (typing resets it to 0, and a hover sets it to a visible row), so it has no browser case; Task 3's table covers the clamp in `nextIndex`.

---

### Task 1: `CommandFigure` and Copy on every command

**Files:**
- Create: `apps/lab/src/run/CommandFigure.tsx`
- Modify: `apps/lab/src/run/LiveCommand.tsx` (whole component)
- Modify: `apps/lab/src/run/useCopy.ts` (header: "Shared by `LiveCommand` and `DocsBlock`")
- Modify: `apps/lab/src/library/BoardColumn.tsx` (`copy`, `copied`, `timer`, the cleanup effect, the `<figure>` block)
- Modify: `apps/lab/src/library/FileColumn.tsx` (the `<figure>` block)
- Test: `apps/lab/src/library/FileColumn.browser.test.tsx`, `apps/lab/src/library/BoardColumn.browser.test.tsx`

**Interfaces:**
- Consumes: `useCopy(): { copied: boolean; copy(text: string): void }` from `run/useCopy.ts`; `CommandText` from `run/CommandText.tsx`.
- Produces: `CommandFigure({ label, caption, command }: { label: string; caption: string; command: string }): ReactElement`.

- [ ] **Step 1: Write the failing tests**

In `apps/lab/src/library/FileColumn.browser.test.tsx`, add after the test "with its meta, the command is shown and there is still no Delete":

```tsx
test('with its meta, Copy puts the command on the clipboard', async () => {
  const write = vi.fn(() => Promise.resolve())
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText: write } as unknown as Clipboard)
  const { board, meta, metaJson } = await fileFixture(1)
  await mountFile([board, meta])
  await userEvent.click(page.getByRole('button', { name: 'Copy' }))
  expect(write).toHaveBeenCalledWith(metaJson.command)
})
```

In the same file, extend the test "a file with no meta offers exports, and neither Delete nor Load into lab" with one last line:

```tsx
  expect(document.querySelector('#board-column .fw-cmdfig')).toBeNull()
```

In `apps/lab/src/library/BoardColumn.browser.test.tsx`, add after the test "there is no command until the address’s board is on the stage":

```tsx
test('Copy puts the saved board’s command on the clipboard', async () => {
  const write = vi.fn(() => Promise.resolve())
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText: write } as unknown as Clipboard)
  const screen = await mountDetail()
  await show()
  await userEvent.click(screen.getByRole('button', { name: 'Copy' }))
  expect(write).toHaveBeenCalledWith(stored.meta.command)
})
```

- [ ] **Step 2: Run the tests; the FileColumn Copy case must fail**

Run: `cd apps/lab && npx vitest run src/library/FileColumn.browser.test.tsx src/library/BoardColumn.browser.test.tsx`
Expected: "with its meta, Copy puts the command on the clipboard" FAILS (no button named Copy); the other two new assertions PASS (they pin behaviour that must survive).

- [ ] **Step 3: Create `run/CommandFigure.tsx`**

```tsx
import type { ReactElement } from 'react'
import { useDictionary } from '../i18n'
import { CommandText } from './CommandText'
import { useCopy } from './useCopy'

/**
 * A CLI command under its caption, with a Copy button: the lab's live command
 * and a library board's command.
 *
 * `<figure>` around the mock's `<pre>`: a `<pre>` has no role and cannot be
 * named, and an unlabelled block of preformatted text is an accessibility gap.
 */
export function CommandFigure({
  label,
  caption,
  command,
}: {
  label: string
  caption: string
  command: string
}): ReactElement {
  const dict = useDictionary()
  const { copied, copy } = useCopy()
  return (
    <figure className="fw-cmdfig" aria-label={label}>
      <figcaption className="fw-cmdhd">
        <span className="caps">{caption}</span>
        <button type="button" onClick={() => copy(command)}>
          {copied ? dict.t('copied') : dict.t('copy')}
        </button>
      </figcaption>
      <pre className="fw-cmd">
        <CommandText command={command} />
      </pre>
    </figure>
  )
}
```

- [ ] **Step 4: Move `LiveCommand` onto it**

Replace the whole of `apps/lab/src/run/LiveCommand.tsx` with:

```tsx
import { buildCommand } from '@arrowz/engine/command'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'
import { CommandFigure } from './CommandFigure'

/**
 * The command that would reproduce what is configured, not what is drawn: the
 * lab is a layer over the CLI and must show exactly what would be run.
 */
export function LiveCommand() {
  const dict = useDictionary()
  const values = useStore((state) => state.params.values)
  const view = useStore((state) => state.view)
  return (
    <CommandFigure
      label={dict.t('commandHead')}
      caption={dict.t('cliLabel')}
      command={buildCommand(values, viewOf(view))}
    />
  )
}
```

In `apps/lab/src/run/useCopy.ts`, change "Shared by `LiveCommand`" to "Shared by `CommandFigure`" in the header (the rest of the sentence stays).

- [ ] **Step 5: Move `BoardColumn` onto it**

In `apps/lab/src/library/BoardColumn.tsx`:
- Delete `const [copied, setCopied] = useState(false)`, `const timer = useRef<…>(undefined)`, the effect `useEffect(() => () => clearTimeout(timer.current), [])` with its two-line comment above it, and the whole `const copy = () => { … }` function.
- Replace the `<figure className="fw-cmdfig" …>…</figure>` block with:

```tsx
      <CommandFigure label={dict.t('boardCommand')} caption={dict.t('cliThisBoard')} command={meta.command} />
```

- Imports: add `import { CommandFigure } from '../run/CommandFigure'`; remove `import { CommandText } from '../run/CommandText'`; the React import becomes `import { type ReactElement, useState } from 'react'` (`timer` and its effect were the only users of `useRef` and `useEffect`; `useState` stays for `armed`).

- [ ] **Step 6: Move `FileColumn` onto it**

In `apps/lab/src/library/FileColumn.tsx`, replace the `<figure className="fw-cmdfig" …>…</figure>` block (inside the `meta === null ? null : (<>…</>)` fragment) with:

```tsx
          <CommandFigure label={dict.t('boardCommand')} caption={dict.t('cliThisBoard')} command={meta.command} />
```

Imports: add `import { CommandFigure } from '../run/CommandFigure'`; remove `import { CommandText } from '../run/CommandText'`.

- [ ] **Step 7: Run the tests**

Run: `cd apps/lab && npx vitest run src/library src/run/LiveCommand.browser.test.tsx src/docs && npx tsc -p tsconfig.json --noEmit && npx eslint src/run src/library`
Expected: all PASS, no type or lint errors.

- [ ] **Step 8: Commit**

```bash
cd apps/lab && npx prettier --write src/run/CommandFigure.tsx src/run/LiveCommand.tsx src/run/useCopy.ts src/library/BoardColumn.tsx src/library/FileColumn.tsx src/library/FileColumn.browser.test.tsx src/library/BoardColumn.browser.test.tsx
git add -A src/run/CommandFigure.tsx src/run/LiveCommand.tsx src/run/useCopy.ts src/library/BoardColumn.tsx src/library/FileColumn.tsx src/library/FileColumn.browser.test.tsx src/library/BoardColumn.browser.test.tsx
git commit -m "Command: one figure with Copy for the lab and the library, a file's command included"
```

---

### Task 2: `openStoredBoard`

**Files:**
- Create: `apps/lab/src/library/openStoredBoard.ts`
- Create: `apps/lab/src/library/openStoredBoard.test.ts` (node project)
- Modify: `apps/lab/src/library/useStoredBoard.ts` (whole file)

**Interfaces:**
- Consumes: `readStoredBoard(size: string, id: string): Promise<FileOutcome>` and `type FileOutcome = { ok: true; file: unknown } | { ok: false; error: string }` from `api/boards.ts`; `type BoardSize` and `decodeBoard` from `@arrowz/engine`; library slice `boardFailed`, `notify`, `clearNotice`; result slice `showPreview`, `clearPreview`, `preview`.
- Produces: `interface BoardAddress { readonly size: string | null; readonly id: string | null; readonly file: boolean }` and `openStoredBoard(address: BoardAddress, metas: BoardSize[] | null, read?: (size: string, id: string) => Promise<FileOutcome>): () => void`.

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/library/openStoredBoard.test.ts`:

```ts
import { type BoardSize, decodeBoard, encodeBoard } from '@arrowz/engine'
import { beforeEach, expect, test } from 'vitest'
import type { FileOutcome } from '../api/boards'
import { storedFixture } from '../state/library.fixtures'
import { useStore } from '../state/store'
import { type BoardAddress, openStoredBoard } from './openStoredBoard'

const first = storedFixture(1)
const second = storedFixture(2)
const sizes = (): BoardSize[] => [{ size: '8x8', W: 8, H: 8, cells: 64, boards: [second.meta, first.meta] }]
const at = (id: string | null): BoardAddress => ({ size: id === null ? null : '8x8', id, file: false })
const AT_FILE: BoardAddress = { size: null, id: null, file: true }
const state = () => useStore.getState()
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** A read the test answers by hand, and the ids it was asked for. */
function manualRead() {
  const asked: string[] = []
  const pending = new Map<string, (outcome: FileOutcome) => void>()
  const read = (_size: string, id: string) => {
    asked.push(id)
    return new Promise<FileOutcome>((resolve) => pending.set(id, resolve))
  }
  const answer = async (id: string, outcome: FileOutcome) => {
    pending.get(id)?.(outcome)
    await settle()
  }
  return { read, asked, answer }
}

function showStored(board: { meta: (typeof first)['meta']; file: unknown }) {
  state().result.showPreview({ origin: 'store', board: decodeBoard(board.file), file: board.file, meta: board.meta })
}

const shownId = () => {
  const preview = state().result.preview
  return preview?.origin === 'store' ? preview.meta.id : null
}

beforeEach(() => {
  state().result.reset()
  state().library.reset()
})

test('reads the named board, says it is loading, then shows it', async () => {
  const io = manualRead()
  openStoredBoard(at(first.meta.id), sizes(), io.read)
  expect(io.asked).toEqual([first.meta.id])
  expect(state().library.notice).toEqual({ kind: 'loading', name: `8x8/${first.meta.id}` })
  await io.answer(first.meta.id, { ok: true, file: first.file })
  expect(state().library.notice).toBeNull()
  expect(shownId()).toBe(first.meta.id)
})

test('a failed read and an undecodable file read alike: empty stage, the reason, no notice', async () => {
  const io = manualRead()
  showStored(second)
  openStoredBoard(at(first.meta.id), sizes(), io.read)
  await io.answer(first.meta.id, { ok: false, error: 'HTTP 404' })
  expect(state().result.preview).toBeNull()
  expect(state().library.notice).toBeNull()
  expect(state().library.boardError).toEqual({ name: `8x8/${first.meta.id}`, reason: 'HTTP 404' })

  showStored(second)
  openStoredBoard(at(first.meta.id), sizes(), io.read)
  await io.answer(first.meta.id, { ok: true, file: { not: 'a board' } })
  expect(state().result.preview).toBeNull()
  expect(state().library.notice).toBeNull()
  expect(state().library.boardError?.name).toBe(`8x8/${first.meta.id}`)
  expect(state().library.boardError?.reason).toMatch(/\S/)
})

test('an answer that arrives after the cancel writes nothing', async () => {
  const io = manualRead()
  const cancel = openStoredBoard(at(first.meta.id), sizes(), io.read)
  cancel()
  await io.answer(first.meta.id, { ok: true, file: first.file })
  expect(state().result.preview).toBeNull()
  expect(state().library.boardError).toBeNull()
})

test('back to the drawn board while another loads: no loading word, no second read, and a viewSaved survives', async () => {
  const io = manualRead()
  openStoredBoard(at(first.meta.id), sizes(), io.read)
  await io.answer(first.meta.id, { ok: true, file: first.file })
  const cancelSecond = openStoredBoard(at(second.meta.id), sizes(), io.read)
  cancelSecond()
  openStoredBoard(at(first.meta.id), sizes(), io.read)
  expect(state().library.notice).toBeNull()
  expect(shownId()).toBe(first.meta.id)
  // A view save refreshes the listing: a new array for the same drawn board.
  state().library.notify({ kind: 'viewSaved', name: `8x8/${first.meta.id}` })
  openStoredBoard(at(first.meta.id), sizes(), io.read)
  expect(state().library.notice).toEqual({ kind: 'viewSaved', name: `8x8/${first.meta.id}` })
  expect(io.asked).toEqual([first.meta.id, second.meta.id])
})

test('waits for the listing before judging an id', () => {
  const io = manualRead()
  openStoredBoard(at(first.meta.id), null, io.read)
  expect(io.asked).toEqual([])
  expect(state().library.boardError).toBeNull()
  expect(state().library.notice).toBeNull()
})

test('an id the listing does not hold empties the stage, names it, and clears a read still loading', () => {
  const io = manualRead()
  showStored(second)
  const cancel = openStoredBoard(at(first.meta.id), sizes(), io.read)
  cancel()
  openStoredBoard(at(first.meta.id), [{ size: '8x8', W: 8, H: 8, cells: 64, boards: [second.meta] }], io.read)
  expect(state().result.preview).toBeNull()
  expect(state().library.boardError).toEqual({ name: `8x8/${first.meta.id}`, reason: null })
  expect(state().library.notice).toBeNull()
})

test('no address clears the stage and a word about the board that left, and keeps a delete’s word', () => {
  showStored(first)
  state().library.notify({ kind: 'saveFailed' })
  state().library.boardFailed({ name: '8x8/x', reason: null })
  openStoredBoard(at(null), sizes())
  expect(state().result.preview).toBeNull()
  expect(state().library.notice).toBeNull()
  expect(state().library.boardError).toBeNull()

  state().library.notify({ kind: 'deleted', name: `8x8/${first.meta.id}` })
  openStoredBoard(at(null), sizes())
  expect(state().library.notice).toEqual({ kind: 'deleted', name: `8x8/${first.meta.id}` })
})

test('an opened file drops a stored preview and a loading word, and keeps its own preview and other words', () => {
  showStored(first)
  state().library.notify({ kind: 'loading', name: `8x8/${first.meta.id}` })
  openStoredBoard(AT_FILE, sizes())
  expect(state().result.preview).toBeNull()
  expect(state().library.notice).toBeNull()

  const board = decodeBoard(first.file)
  state().result.showPreview({
    origin: 'file',
    board,
    file: encodeBoard(board),
    meta: null,
    name: 'mine.board.json',
    id: first.meta.id,
  })
  state().library.notify({ kind: 'viewSaved', name: 'x' })
  openStoredBoard(AT_FILE, sizes())
  expect(state().result.preview?.origin).toBe('file')
  expect(state().library.notice).toEqual({ kind: 'viewSaved', name: 'x' })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/lab && npx vitest run src/library/openStoredBoard.test.ts`
Expected: FAIL, the module `./openStoredBoard` does not exist.

- [ ] **Step 3: Create `library/openStoredBoard.ts`**

The five exits are `useStoredBoard`'s effect body, statement for statement; only the header comment and the `read` parameter are new.

```ts
import { type BoardSize, decodeBoard } from '@arrowz/engine'
import { type FileOutcome, readStoredBoard } from '../api/boards'
import { useStore } from '../state/store'

/** The address `useOpenBoard` reads: a stored board's size and id, or the opened file. */
export interface BoardAddress {
  readonly size: string | null
  readonly id: string | null
  readonly file: boolean
}

const nothing = () => {}

/**
 * Brings the stage and the library's words in line with the address: reads and
 * draws the stored board it names, or clears what no longer belongs. Returns
 * the cancel of a read in flight, which drops its answer; the other exits have
 * nothing to cancel.
 *
 * A board that cannot be read leaves the stage empty, not under the previous
 * board, and says why. Fetch and decode failures read alike: to someone looking
 * at a list, missing and unreadable are one thing.
 */
export function openStoredBoard(
  address: BoardAddress,
  metas: BoardSize[] | null,
  read: (size: string, id: string) => Promise<FileOutcome> = readStoredBoard,
): () => void {
  const { size, id, file } = address
  // A file's preview is set by `openBoardFiles`, not fetched. A stored board
  // left drawn by an earlier address (its fetch already resolved) is cleared
  // here too, or the column would call it gone while the stage still shows it.
  if (file) {
    if (useStore.getState().result.preview?.origin === 'store') useStore.getState().result.clearPreview()
    if (useStore.getState().library.notice?.kind === 'loading') useStore.getState().library.clearNotice()
    return nothing
  }
  if (size === null || id === null) {
    useStore.getState().result.clearPreview()
    useStore.getState().library.boardFailed(null)
    // Clear only a word about the board that just left: a delete navigates
    // here, and an unconditional clear would erase its `deleted` notice.
    // `saveFailed` does not fade, and with its board off screen it would be
    // stranded on an empty stage.
    const kind = useStore.getState().library.notice?.kind
    if (kind === 'loading' || kind === 'saveFailed') useStore.getState().library.clearNotice()
    return nothing
  }
  const meta = metas?.find((entry) => entry.size === size)?.boards.find((board) => board.id === id) ?? null
  if (meta === null) {
    // Before the listing arrives this waits. After, an id not in it is a
    // stale link: the stage is left empty and the reason is shown.
    if (metas !== null) {
      useStore.getState().result.clearPreview()
      useStore.getState().library.boardFailed({ name: `${size}/${id}`, reason: null })
      // A board dropped from the listing while its file was in flight would
      // otherwise leave "Loading …" for good.
      useStore.getState().library.clearNotice()
    }
    return nothing
  }
  // Do not re-read a board already drawn: `listed()` stores a fresh array on
  // every refresh (a view save makes one), and a re-read would bring back the
  // listing's view over an edit in flight and flash `loading` over `viewSaved`.
  const drawn = useStore.getState().result.preview
  if (drawn?.origin === 'store' && drawn.meta.id === id) {
    // A, then B, then back to A while B is in flight: B's cancelled read
    // clears nothing, so "Loading B…" is cleared here. Only `loading`: the
    // `viewSaved` a save's refresh lands on must survive.
    if (useStore.getState().library.notice?.kind === 'loading') useStore.getState().library.clearNotice()
    return nothing
  }
  let cancelled = false
  // The previous board stays on the stage until this read resolves, so the
  // stage does not flash empty between two rows; every outcome below
  // replaces or clears it (`useOpenPreview` guards against that window).
  useStore.getState().library.boardFailed(null)
  useStore.getState().library.notify({ kind: 'loading', name: `${size}/${id}` })
  void (async () => {
    const outcome = await read(size, id)
    if (cancelled) return
    const state = useStore.getState()
    const name = `${size}/${id}`
    if (!outcome.ok) {
      state.library.clearNotice()
      state.result.clearPreview()
      state.library.boardFailed({ name, reason: outcome.error })
      return
    }
    try {
      const board = decodeBoard(outcome.file)
      if (cancelled) return
      state.library.clearNotice()
      state.result.showPreview({ origin: 'store', board, file: outcome.file, meta })
    } catch (err) {
      if (cancelled) return
      state.library.clearNotice()
      state.result.clearPreview()
      state.library.boardFailed({ name, reason: err instanceof Error ? err.message : String(err) })
    }
  })()
  return () => {
    cancelled = true
  }
}
```

- [ ] **Step 4: Run the node test**

Run: `cd apps/lab && npx vitest run src/library/openStoredBoard.test.ts`
Expected: 8 PASS.

- [ ] **Step 5: Make `useStoredBoard` call it**

Replace the whole of `apps/lab/src/library/useStoredBoard.ts` with:

```ts
import { useEffect } from 'react'
import { useStore } from '../state/store'
import { openStoredBoard } from './openStoredBoard'
import { useOpenBoard } from './useOpenBoard'

/**
 * Draws the board the address names (see `openStoredBoard`). The address is
 * the selection, so the slice needs no guard: the effect's cleanup drops an
 * answer that arrives after the address moved or the panel went away (or
 * after StrictMode's first pass).
 */
export function useStoredBoard(): void {
  const { size, id, file } = useOpenBoard()
  const metas = useStore((state) => state.library.sizes)
  useEffect(() => openStoredBoard({ size, id, file }, metas), [size, id, file, metas])
}
```

- [ ] **Step 6: Run the integration tests**

Run: `cd apps/lab && npx vitest run src/library src/routes/Workspace.browser.test.tsx src/routes/LayoutInvariants.browser.test.tsx && npx tsc -p tsconfig.json --noEmit && npx eslint src/library`
Expected: all PASS (13 cases in `useStoredBoard.browser.test.tsx` unchanged).

- [ ] **Step 7: Mutation check (do not commit it)**

Before mutating, `cp src/library/openStoredBoard.ts /tmp/openStoredBoard.ts`. Delete the line `if (useStore.getState().library.notice?.kind === 'loading') useStore.getState().library.clearNotice()` inside the "already drawn" block (the second of its two occurrences; the first is in the `file` exit), run `npx vitest run src/library/openStoredBoard.test.ts`, and expect the test "back to the drawn board while another loads…" to FAIL on `notice` being `loading`. Restore with `cp /tmp/openStoredBoard.ts src/library/openStoredBoard.ts` (`diff /tmp/openStoredBoard.ts src/library/openStoredBoard.ts` must be empty) and re-run: PASS.

- [ ] **Step 8: Commit**

```bash
cd apps/lab && npx prettier --write src/library/openStoredBoard.ts src/library/openStoredBoard.test.ts src/library/useStoredBoard.ts
git add src/library/openStoredBoard.ts src/library/openStoredBoard.test.ts src/library/useStoredBoard.ts
git commit -m "Library: opening a stored board is a function with a cancel, tested in node"
```

---

### Task 3: `nextIndex`

**Files:**
- Create: `apps/lab/src/shell/roving.ts`
- Create: `apps/lab/src/shell/roving.test.ts` (node project)

**Interfaces:**
- Produces: `type RovingAxis = 'horizontal' | 'vertical' | 'both'`; `nextIndex(key: string, current: number, count: number, options: { axis: RovingAxis; wrap: boolean }): number | null`. Task 4 adds `useFocusFollowsSelection` to the same file.

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/shell/roving.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { nextIndex, type RovingAxis } from './roving'

type Case = [key: string, current: number, count: number, axis: RovingAxis, wrap: boolean, expected: number | null]

const CASES: Case[] = [
  ['ArrowRight', 0, 3, 'horizontal', true, 1],
  ['ArrowRight', 2, 3, 'horizontal', true, 0],
  ['ArrowLeft', 0, 3, 'horizontal', true, 2],
  ['ArrowDown', 0, 3, 'horizontal', true, null],
  ['ArrowDown', 1, 3, 'vertical', true, 2],
  ['ArrowUp', 0, 3, 'vertical', true, 2],
  ['ArrowRight', 1, 3, 'vertical', true, null],
  ['ArrowDown', 2, 3, 'both', true, 0],
  ['ArrowLeft', 1, 3, 'both', true, 0],
  ['ArrowDown', 2, 3, 'vertical', false, 2],
  ['ArrowUp', 0, 3, 'vertical', false, 0],
  ['Home', 2, 3, 'vertical', false, 0],
  ['End', 0, 3, 'horizontal', true, 2],
  ['ArrowDown', -1, 3, 'vertical', true, 0],
  ['ArrowUp', -1, 3, 'vertical', true, 2],
  ['ArrowUp', -1, 3, 'vertical', false, 2],
  ['ArrowUp', 9, 3, 'vertical', false, 1],
  ['ArrowDown', 9, 3, 'vertical', false, 2],
  ['ArrowDown', 0, 0, 'vertical', false, null],
  ['Home', 0, 0, 'vertical', false, null],
  ['Enter', 0, 3, 'both', true, null],
]

describe('nextIndex', () => {
  it.each(CASES)('%s from %i of %i on %s (wrap %s) is %s', (key, current, count, axis, wrap, expected) => {
    expect(nextIndex(key, current, count, { axis, wrap })).toBe(expected)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/lab && npx vitest run src/shell/roving.test.ts`
Expected: FAIL, the module `./roving` does not exist.

- [ ] **Step 3: Create `shell/roving.ts`**

```ts
/** Which arrows move along a strip: ← → for a row, ↑ ↓ for a rail, all four for a radio group. */
export type RovingAxis = 'horizontal' | 'vertical' | 'both'

const FORWARD: Record<RovingAxis, readonly string[]> = {
  horizontal: ['ArrowRight'],
  vertical: ['ArrowDown'],
  both: ['ArrowRight', 'ArrowDown'],
}
const BACK: Record<RovingAxis, readonly string[]> = {
  horizontal: ['ArrowLeft'],
  vertical: ['ArrowUp'],
  both: ['ArrowLeft', 'ArrowUp'],
}

/**
 * The index a key moves to in a strip of `count` items, or `null` when the key
 * does not move it (another key, or an empty strip). Home and End jump; the
 * arrows step and, at the ends, wrap or stop. With nothing selected
 * (`current` -1) forward lands on the first item and back on the last; a
 * `current` past the end counts from the last item.
 */
export function nextIndex(
  key: string,
  current: number,
  count: number,
  { axis, wrap }: { axis: RovingAxis; wrap: boolean },
): number | null {
  if (count <= 0) return null
  const last = count - 1
  if (key === 'Home') return 0
  if (key === 'End') return last
  const step = FORWARD[axis].includes(key) ? 1 : BACK[axis].includes(key) ? -1 : 0
  if (step === 0) return null
  if (current < 0) return step === 1 ? 0 : last
  const at = Math.min(current, last) + step
  if (at > last) return wrap ? 0 : last
  if (at < 0) return wrap ? last : 0
  return at
}
```

- [ ] **Step 4: Run it**

Run: `cd apps/lab && npx vitest run src/shell/roving.test.ts`
Expected: 21 PASS.

- [ ] **Step 5: Commit**

```bash
cd apps/lab && npx prettier --write src/shell/roving.ts src/shell/roving.test.ts
git add src/shell/roving.ts src/shell/roving.test.ts
git commit -m "Roving: one function for the index an arrow, Home or End moves to"
```

---

### Task 4: `useFocusFollowsSelection` and the three strips that only swap code

**Files:**
- Modify: `apps/lab/src/shell/roving.ts` (add the hook)
- Create: `apps/lab/src/shell/roving.browser.test.tsx`
- Modify: `apps/lab/src/shell/TabRow.tsx` (`onKeyDown`, the tab's `ref`)
- Modify: `apps/lab/src/console/GroupRail.tsx` (`move`, `jump`, `onKeyDown`, `focusIfSelected`, the tab's `ref`)
- Modify: `apps/lab/src/shell/Segmented.tsx` (`onKeyDown`, the radio's `ref`)

**Interfaces:**
- Consumes: `nextIndex` and `RovingAxis` from Task 3.
- Produces: `useFocusFollowsSelection<T>(selection: T): RefObject<HTMLButtonElement | null>`.

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/shell/roving.browser.test.tsx`:

```tsx
import { afterEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { useFocusFollowsSelection } from './roving'

afterEach(() => {
  vi.restoreAllMocks()
})

/** Three buttons, the selected one carrying the hook's ref; `tick` forces a render with the same selection. */
function Strip({ selected, tick }: { selected: number; tick: number }) {
  const focusRef = useFocusFollowsSelection(selected)
  return (
    <div data-tick={tick}>
      {[0, 1, 2].map((i) => (
        <button key={i} type="button" ref={i === selected ? focusRef : undefined}>
          {`b${i}`}
        </button>
      ))}
    </div>
  )
}

test('the focus follows the selection while the strip holds it, and a render with the same selection does not refocus', async () => {
  const screen = await render(<Strip selected={0} tick={0} />)
  screen.getByRole('button', { name: 'b0' }).element().focus()
  const focus = vi.spyOn(HTMLElement.prototype, 'focus')
  await screen.rerender(<Strip selected={0} tick={1} />)
  expect(focus).not.toHaveBeenCalled()
  await screen.rerender(<Strip selected={2} tick={2} />)
  await expect.element(screen.getByRole('button', { name: 'b2' })).toHaveFocus()
})

test('a selection made while the focus is elsewhere leaves the focus there', async () => {
  const screen = await render(
    <>
      <input aria-label="outside" />
      <Strip selected={0} tick={0} />
    </>,
  )
  screen.getByRole('textbox', { name: 'outside' }).element().focus()
  await screen.rerender(
    <>
      <input aria-label="outside" />
      <Strip selected={1} tick={1} />
    </>,
  )
  await expect.element(screen.getByRole('textbox', { name: 'outside' })).toHaveFocus()
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/lab && npx vitest run src/shell/roving.browser.test.tsx`
Expected: FAIL, `useFocusFollowsSelection` is not exported.

- [ ] **Step 3: Add the hook to `shell/roving.ts`**

Add at the top: `import { type RefObject, useLayoutEffect, useRef } from 'react'`. Append:

```ts
/**
 * A ref for the selected item that moves the focus onto it when the selection
 * changes, but only while the strip already holds the focus: a selection made
 * elsewhere must not pull the focus in. Only on a change: an inline ref
 * callback would refocus on every render.
 */
export function useFocusFollowsSelection<T>(selection: T): RefObject<HTMLButtonElement | null> {
  const ref = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    const node = ref.current
    if (node?.parentElement?.contains(document.activeElement) === true) node.focus()
  }, [selection])
  return ref
}
```

- [ ] **Step 4: Run it**

Run: `cd apps/lab && npx vitest run src/shell/roving.browser.test.tsx`
Expected: 2 PASS.

- [ ] **Step 5: Mutation check (do not commit it)**

In `Strip`, replace `ref={i === selected ? focusRef : undefined}` with the old inline pattern
`ref={(node) => { if (node && i === selected && node.parentElement?.contains(document.activeElement)) node.focus() }}`,
run the file, and expect the first test to FAIL on `focus` having been called. Restore and re-run: PASS.

- [ ] **Step 6: Move `TabRow` onto the helpers**

In `apps/lab/src/shell/TabRow.tsx`:
- Imports: add `import { nextIndex, useFocusFollowsSelection } from './roving'`.
- After `const current = selectedIndex(useLocation().pathname)` add `const focusRef = useFocusFollowsSelection(current)`.
- Replace the body of `onKeyDown` (keep its three-line comment above) with:

```tsx
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const next = nextIndex(event.key, current, TABS.length, { axis: 'horizontal', wrap: true })
    if (next === null) return
    event.preventDefault()
    const tab = TABS[next]
    if (tab) void navigate(tab.path)
  }
```

- Replace the tab's `ref={(node) => { … }}` (with its two-line comment) by `ref={i === current ? focusRef : undefined}`.
- No existing test guards `TabRow`'s focus-follow (its keyboard test passes with the ref removed). Add to `apps/lab/src/shell/TabRow.browser.test.tsx`:

```tsx
test('the focus moves with the selection', async () => {
  const screen = await mount('/')
  await screen.getByRole('tab', { name: 'Lab' }).click()
  await userEvent.keyboard('{ArrowRight}')
  await expect.element(screen.getByRole('tab', { name: 'Saved boards' })).toHaveFocus()
})
```

  Check it is red with `ref={undefined}` in place of `ref={i === current ? focusRef : undefined}`, then restore.

- [ ] **Step 7: Move `GroupRail` onto the helpers**

In `apps/lab/src/console/GroupRail.tsx`:
- Imports: add `import { nextIndex, useFocusFollowsSelection } from '../shell/roving'`.
- After `const counts = countsByGroup(violations)` add `const focusRef = useFocusFollowsSelection(entry)`.
- Replace `move`, `jump` (with its doc comment), `onKeyDown` and `focusIfSelected` (with its doc comment) by:

```tsx
  // The first and last entries come from `ENTRIES` itself: `RAIL_GROUPS` is
  // derived from `PARAM_SPEC`, so no group name is hard-coded here.
  const onKeyDown = (event: React.KeyboardEvent) => {
    const next = nextIndex(event.key, ENTRIES.indexOf(entry), ENTRIES.length, { axis: 'vertical', wrap: true })
    const to = next === null ? undefined : ENTRIES[next]
    if (to === undefined) return
    event.preventDefault()
    select(to)
  }
```

- In `tab`, replace `ref={focusIfSelected(entry === value)}` with `ref={entry === value ? focusRef : undefined}`.

- [ ] **Step 8: Move `Segmented` onto the helpers**

In `apps/lab/src/shell/Segmented.tsx`:
- Imports: add `import { nextIndex, useFocusFollowsSelection } from './roving'`.
- After `const at = options.findIndex(…)` add `const focusRef = useFocusFollowsSelection(value)`.
- Replace the body of `onKeyDown` with:

```tsx
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const next = nextIndex(event.key, at, options.length, { axis: 'both', wrap: true })
    if (next === null) return
    event.preventDefault()
    const option = options[next]
    if (option) onChange(option.value)
  }
```

- Replace the radio's `ref={(node) => { … }}` by `ref={i === at ? focusRef : undefined}`.
- The header comment's last paragraph becomes exactly (wrapped at 80; Prettier does not rewrap comments):

```
 * The keyboard is the radio pattern `TabRow` implements for tabs: the arrows
 * move the choice and wrap, Home and End jump, and only the checked radio is a
 * tab stop. Focus follows the choice as `useFocusFollowsSelection` allows, so a
 * choice made elsewhere (a link naming a language) does not pull the focus into
 * the top bar.
```

- [ ] **Step 9: Run the strips' tests**

Run: `cd apps/lab && npx vitest run src/shell src/console src/routes && npx tsc -p tsconfig.json --noEmit && npx eslint src/shell src/console`
Expected: all PASS, including `TabRow.browser.test.tsx`, `GroupRail.browser.test.tsx` and `Segmented.browser.test.tsx` unchanged.

- [ ] **Step 10: Commit**

```bash
cd apps/lab && npx prettier --write src/shell/roving.ts src/shell/roving.browser.test.tsx src/shell/TabRow.tsx src/shell/TabRow.browser.test.tsx src/console/GroupRail.tsx src/shell/Segmented.tsx
git add src/shell/roving.ts src/shell/roving.browser.test.tsx src/shell/TabRow.tsx src/shell/TabRow.browser.test.tsx src/console/GroupRail.tsx src/shell/Segmented.tsx
git commit -m "Roving: the focus follows a selection only when it changes; tabs, rail and radios share the keys"
```

---

### Task 5: `BoardsRail` and `CommandPalette`, the two with a behaviour change

**Files:**
- Modify: `apps/lab/src/library/BoardsRail.tsx` (`move`, `onKeyDown`, `focusIfSelected`, the tab's `ref`)
- Modify: `apps/lab/src/palette/CommandPalette.tsx` (the arrow/Home/End part of `onKeyDown`)
- Test: `apps/lab/src/library/LibraryFace.browser.test.tsx`, `apps/lab/src/palette/CommandPalette.browser.test.tsx`

**Interfaces:**
- Consumes: `nextIndex`, `useFocusFollowsSelection` from `shell/roving.ts`.

- [ ] **Step 1: Write the failing tests**

In `apps/lab/src/library/LibraryFace.browser.test.tsx`, add after "the arrow keys walk the rail, sizes then Preview, and the focus follows":

```tsx
test('with no tab selected, up goes to the last entry, Preview', async () => {
  const screen = await mountPanel('/boards/10x10/sha256-0')
  await act(async () => useStore.getState().library.listed(sizesFixture()))
  screen.getByRole('tab', { name: /^8×8/ }).element().focus()
  await userEvent.keyboard('{ArrowUp}')
  await expect.element(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true')
  await expect.element(screen.getByRole('tab', { name: 'Preview' })).toHaveFocus()
})
```

In `apps/lab/src/palette/CommandPalette.browser.test.tsx`, add after "filters as it is typed, and says so when nothing matches":

```tsx
  // Read at the document, after React's handler has run on the root.
  it('with nothing matching, the arrows, Home and End are left to the input', async () => {
    const screen = await mount()
    await userEvent.keyboard('seedzzzz')
    expect(screen.container.querySelectorAll('[role="option"]')).toHaveLength(0)
    const prevented: boolean[] = []
    const record = (event: KeyboardEvent) => prevented.push(event.defaultPrevented)
    document.addEventListener('keydown', record)
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{Home}{End}')
    document.removeEventListener('keydown', record)
    expect(prevented).toEqual([false, false, false, false])
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/lab && npx vitest run src/library/LibraryFace.browser.test.tsx src/palette/CommandPalette.browser.test.tsx`
Expected: the BoardsRail case FAILS (the `6×6` tab is selected, not Preview); the palette case FAILS (`[true, true, true, true]`).

- [ ] **Step 3: Move `BoardsRail` onto the helpers**

In `apps/lab/src/library/BoardsRail.tsx`:
- Imports: add `import { nextIndex, useFocusFollowsSelection } from '../shell/roving'`.
- After `const tabbable = selected ?? entries[0]` add `const focusRef = useFocusFollowsSelection(selected)`.
- Replace `move`, `onKeyDown`, and `focusIfSelected` (with its two-line comment) by:

```tsx
  // Preview is the last entry, so End lands on it.
  const onKeyDown = (event: React.KeyboardEvent) => {
    const at = selected === null ? -1 : entries.indexOf(selected)
    const next = nextIndex(event.key, at, entries.length, { axis: 'vertical', wrap: true })
    const to = next === null ? undefined : entries[next]
    if (to === undefined) return
    event.preventDefault()
    choose(to)
  }
```

- In `tab`, replace `ref={focusIfSelected(on)}` with `ref={on ? focusRef : undefined}`.

- [ ] **Step 4: Move the palette's keys onto `nextIndex`**

In `apps/lab/src/palette/CommandPalette.tsx`, replace the block from `const last = hits.length - 1` to `setActive(Math.max(0, next))` with:

```tsx
    // With no hits there is no row to move to, so the keys stay the input's.
    const next = nextIndex(event.key, active, hits.length, { axis: 'vertical', wrap: false })
    if (next === null) return
    event.preventDefault()
    setActive(next)
```

Imports: add `import { nextIndex } from '../shell/roving'`.

- [ ] **Step 5: Run the tests**

Run: `cd apps/lab && npx vitest run src/library src/palette && npx tsc -p tsconfig.json --noEmit && npx eslint src/library src/palette`
Expected: all PASS, including the existing palette arrow cases (`{ArrowDown>30/}` stops at the last row).

- [ ] **Step 6: Commit**

```bash
cd apps/lab && npx prettier --write src/library/BoardsRail.tsx src/palette/CommandPalette.tsx src/library/LibraryFace.browser.test.tsx src/palette/CommandPalette.browser.test.tsx
git add src/library/BoardsRail.tsx src/palette/CommandPalette.tsx src/library/LibraryFace.browser.test.tsx src/palette/CommandPalette.browser.test.tsx
git commit -m "Roving: the boards rail and the palette on nextIndex; up with nothing selected reaches Preview, and an empty palette leaves the keys to the input"
```

---

### Task 6: `lab-review.md` and the gate

**Files:**
- Modify: `lab-review.md` (the "Refactors" status table, item 3 of "What is still open")

- [ ] **Step 1: Update the table**

In the table under `### Refactors`, set:

```markdown
| 6. Library column reuses the run column's pieces | fixed in #129 and on `lab/refactors-6-8-9` | `useSvgDrawing` and `SavedExports` (#129); `CommandFigure` with `useCopy` for the live command and both library columns, a file's command included |
| 8. `useStoredBoard` into a library action | fixed on `lab/refactors-6-8-9` | `openStoredBoard` returns its cancel and takes `read`; `openStoredBoard.test.ts` runs its exits and races in node |
| 9. One roving-focus helper | fixed on `lab/refactors-6-8-9` | `shell/roving.ts`: `nextIndex` for `TabRow`, `GroupRail`, `BoardsRail`, `Segmented` and `CommandPalette`, `useFocusFollowsSelection` for the four strips; `PresetStrip`'s 2-D grid stays apart by decision |
```

In "What is still open", item 3 becomes:

```markdown
3. **Structural refactors:** 5 (the `.fw button` prefix and tokens), 7 and 11.
```

- [ ] **Step 2: Run the full gate**

Run: `cd <repo root> && set -o pipefail && pnpm nx run-many -t verify 2>&1 | tail -15`
Expected: "Successfully ran target verify for 4 projects".

- [ ] **Step 3: Commit**

```bash
git add lab-review.md
git commit -m "Lab review: refactors 6, 8 and 9 are done"
```
