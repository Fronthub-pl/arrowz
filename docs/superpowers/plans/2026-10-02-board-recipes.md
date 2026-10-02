# Board Recipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The lab says whether a run landed on a layout the library already had, lists a stored board's recipes when it has two or more (each loadable), and the armed Delete names how many recipes go with the board.

**Architecture:** The store server's `POST /api/boards` answers with the two flags `saveBoard` already computes. The lab's save outcome carries them to the run's status line. `BoardColumn` renders a new `RecipeList` from `meta.sources`, which the listing already holds, and picks the armed Delete text by the recipe count.

**Tech Stack:** Deno 2.9 (`packages/cli`, `packages/engine`), React 19 + Vite + Vitest 5 browser mode (`apps/lab`), Nx.

**Spec:** `docs/superpowers/specs/2026-10-02-board-recipes-design.md`

Branch `lab/board-recipes`, worktree `../arrowz-board-recipes`, base `main` at `9b48343`. Bead `arrowz-200`.

## Global Constraints

- Everything in the repository is English; the lab's visible strings live in `packages/engine/lab-i18n.ts`, English in `EN.ui`, Polish in `PL.ui`. `lab-i18n.test.ts` fails when the two `ui` objects differ in keys or value kinds.
- Comments say why, once: a non-header comment is at most 6 lines, no history (no PR, task or review references), cite symbols, never `file.ts:NN` (`packages/engine/comments.test.ts`).
- No `any`, no non-null assertions; a type change in the engine must not change a value.
- After any edit under `packages/engine`, run `pnpm nx build engine --skip-nx-cache` before running lab tests: the lab reads the engine from `packages/engine/dist/`.
- Format: `deno fmt <files>` under `packages/`, `npx prettier --write <files>` in `apps/lab` (`lab:fmt` only checks).
- Whole-app browser cases pass their own timeout (`40_000`); geometry cases set their own viewport and put `414×896` back.
- Commit by explicit paths; no attribution lines. The PR body cites `Bead: arrowz-200`.

## Review Focus

1. **Two recipes with the same seed**, the usual case (one seed rerun with another limit): the list must tell them apart by number, not by seed. Task 5 asserts two distinct, separately clickable load buttons on a same-seed fixture.
2. **A 201 body without the flags** (a store server from an older checkout, or a broken answer) must come back as a readable failure, not a crash or a wrong "saved". Task 2 tests it.
3. **Loading a recipe whose knob already equals the lab's value** would pass without loading anything. The fixture's recipes use `restarts` 5 and 1, both off the default 3, and Task 5's case checks the knob moved.
4. **Generate twice on one seed**, the commonest save after this change, must read "recipe updated". Task 1 pins the server's flags for it and Task 3 the line.
5. **A recipe with no timing or no date** (`genMs: null`, `updatedAt: ''`) must show "—" and no stray separator. Task 5 asserts the facts line of such a recipe.

---

### Task 1: The store server reports what the save did

**Files:**
- Modify: `packages/cli/store-server.ts` (the `POST /api/boards` branch of the request handler)
- Test: `packages/cli/store-server.test.ts`

**Interfaces:**
- Consumes: `saveBoard(input): Promise<SaveResult>` from `packages/cli/store.ts`, where `SaveResult = { meta: BoardMeta; layoutExisted: boolean; recipeExisted: boolean }`.
- Produces: `POST /api/boards` answers `201` with JSON `{ meta: BoardMeta, layoutExisted: boolean, recipeExisted: boolean }`.

- [ ] **Step 1: Write the failing test**

In `packages/cli/store-server.test.ts`, below the `validBody` helper, add the answer type:

```ts
/** The body of a 201 from POST /api/boards. */
type Answer = { meta: BoardMeta; layoutExisted: boolean; recipeExisted: boolean }
```

Then add this case after `'POST refuses fields the store would write or the page would show unchecked'`:

```ts
Deno.test('POST answers with the meta and whether the layout and the recipe were already stored', () =>
  withServer(async (base) => {
    const body = validBody()
    const first: Answer = await (await post(base, body)).json()
    assertEquals([first.layoutExisted, first.recipeExisted], [false, false])
    const again: Answer = await (await post(base, body)).json()
    assertEquals([again.layoutExisted, again.recipeExisted], [true, true])
    // `restarts` is a knob, so it is another recipe; the empty board is the same layout.
    const other: Answer = await (await post(base, { ...body, params: { ...body.params, restarts: 1 } })).json()
    assertEquals([other.layoutExisted, other.recipeExisted], [true, false])
    assertEquals(other.meta.id, first.meta.id)
    assertEquals(other.meta.sources.length, 2)
  }))
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/cli && deno test -A store-server.test.ts --filter "whether the layout"`
Expected: FAIL. `first.layoutExisted` is `undefined`, because the body is the meta itself.

- [ ] **Step 3: Implement**

In `packages/cli/store-server.ts`, replace

```ts
        return send(201, JSON.stringify((await saveBoard(checked.ok)).meta))
```

with

```ts
        const saved = await saveBoard(checked.ok)
        // The flags let the lab tell a new board from a layout it already had.
        return send(
          201,
          JSON.stringify({ meta: saved.meta, layoutExisted: saved.layoutExisted, recipeExisted: saved.recipeExisted }),
        )
```

- [ ] **Step 4: Move the existing cases onto the new body**

Four cases read the meta straight from the body. Replace each `const meta: BoardMeta = await resp.json()` and `const meta: BoardMeta = await r.json()` with the destructured form, keeping the variable they read from:

```ts
    const { meta }: Answer = await resp.json()
```

```ts
    const { meta }: Answer = await r.json()
```

They are in the cases `'POST /api/boards saves, GET lists, the board file is served from the store'`, `'POST passes metrics.aborted through to the stored meta'`, `'POST keeps only the knobs of PARAM_SPEC'`, and the case that posts a board with a `junk` key. Find them with `rg -n "const meta: BoardMeta = await" packages/cli/store-server.test.ts`; all four must change.

- [ ] **Step 5: Run the file**

Run: `cd packages/cli && deno test -A store-server.test.ts`
Expected: PASS, every case.

- [ ] **Step 6: Gates and commit**

```bash
cd packages/cli && deno fmt store-server.ts store-server.test.ts && cd ../.. && deno task verify
git add packages/cli/store-server.ts packages/cli/store-server.test.ts
git commit -m "store server: answer a POST with the save's two flags

POST /api/boards answered with the meta alone, so the lab could not
tell a new board from a layout the store already had. It now answers
{ meta, layoutExisted, recipeExisted }, the flags saveBoard computes."
```

---

### Task 2: The lab's save outcome carries the flags

**Files:**
- Modify: `apps/lab/src/api/boards.ts` (`SaveOutcome`, `saveBoard`)
- Modify (stubs answering a POST with the meta alone): `apps/lab/src/routes/Workspace.browser.test.tsx`, `apps/lab/src/library/useViewSave.browser.test.tsx`
- Test: `apps/lab/src/api/boards.node.test.ts`

**Interfaces:**
- Consumes: Task 1's 201 body.
- Produces: `export type SaveOutcome = { ok: true; meta: BoardMeta; layoutExisted: boolean; recipeExisted: boolean } | { ok: false; error: string }` in `apps/lab/src/api/boards.ts`.

- [ ] **Step 1: Write the failing tests**

In `apps/lab/src/api/boards.node.test.ts`, change the body read in `'a POST through the proxy is accepted, Origin and all'`:

```ts
  expect(r.status).toBe(201)
  const answer = (await r.json()) as { meta: { id: string }; layoutExisted: boolean; recipeExisted: boolean }
  expect(answer.meta.id).toMatch(/^sha256-[0-9a-f]{64}$/)
  expect([answer.layoutExisted, answer.recipeExisted]).toEqual([false, false])
```

Add two cases at the end of the file. The first goes through the real proxy on a size no other case uses, and removes its board again so the listing cases keep their counts:

```ts
test('saveBoard says when the store already had the layout and the recipe', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (...args: Parameters<typeof fetch>) => original(new URL(String(args[0]), VITE_ORIGIN), args[1])
  try {
    const params = { ...defaultParams(), W: 14, H: 14, seed: 6 }
    const request = storeRequest(encodeBoard(generate(params).board), params, DEFAULT_VIEW, 'lab')
    const first = await saveBoard(request)
    const again = await saveBoard(request)
    if (!first.ok || !again.ok) throw new Error('the store refused the board this case needs')
    expect([first.layoutExisted, first.recipeExisted]).toEqual([false, false])
    expect([again.layoutExisted, again.recipeExisted]).toEqual([true, true])
    await deleteBoard('14x14', first.meta.id)
  } finally {
    globalThis.fetch = original
  }
})

// A store server from an older checkout answers with the meta alone.
test('saveBoard refuses a 201 without the meta and the two flags', async () => {
  const original = globalThis.fetch
  globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({ id: 'sha256-00' }), { status: 201 }))
  try {
    const params = { ...defaultParams(), W: 8, H: 8, seed: 1 }
    const outcome = await saveBoard(storeRequest(encodeBoard(generate(params).board), params, DEFAULT_VIEW, 'lab'))
    expect(outcome).toEqual({ ok: false, error: 'the store answered 201 without the meta and the two save flags' })
  } finally {
    globalThis.fetch = original
  }
})
```

Check that every name these cases use (`defaultParams`, `generate`, `encodeBoard`, `storeRequest`, `DEFAULT_VIEW`, `deleteBoard`, `saveBoard`, `VITE_ORIGIN`) is already imported at the top of the file, as the `deleteBoard` case uses them; add any that is not.

- [ ] **Step 2: Run them to verify they fail**

Run, from `apps/lab`: `pnpm vitest run --project node-integration src/api/boards.node.test.ts`
Expected: FAIL. `answer.meta` is undefined, `first.layoutExisted` is undefined, and the last case gets `ok: true`.

- [ ] **Step 3: Implement**

In `apps/lab/src/api/boards.ts`, replace the `SaveOutcome` line with:

```ts
export type SaveOutcome =
  | { ok: true; meta: BoardMeta; layoutExisted: boolean; recipeExisted: boolean }
  | { ok: false; error: string }
```

Add, above `saveBoard`:

```ts
/** The store server's 201 body for POST /api/boards. */
interface SaveAnswer {
  meta: BoardMeta
  layoutExisted: boolean
  recipeExisted: boolean
}

function isSaveAnswer(body: unknown): body is SaveAnswer {
  if (typeof body !== 'object' || body === null) return false
  const { meta, layoutExisted, recipeExisted } = body as Record<string, unknown>
  return typeof meta === 'object' && meta !== null && typeof layoutExisted === 'boolean' &&
    typeof recipeExisted === 'boolean'
}
```

and in `saveBoard` replace

```ts
      return { ok: true, meta: (await response.json()) as BoardMeta }
```

with

```ts
      const body: unknown = await response.json()
      if (!isSaveAnswer(body)) return { ok: false, error: 'the store answered 201 without the meta and the two save flags' }
      return { ok: true, meta: body.meta, layoutExisted: body.layoutExisted, recipeExisted: body.recipeExisted }
```

- [ ] **Step 4: Move the stubs onto the new body**

These stubs answer a POST with the meta alone and would now read as failures:

- `apps/lab/src/routes/Workspace.browser.test.tsx`, case `'a stored board can be opened, restyled and loaded back into the lab'`:
  `new Response(JSON.stringify(meta), { status: 201 })` → `new Response(JSON.stringify({ meta, layoutExisted: true, recipeExisted: true }), { status: 201 })`
- `apps/lab/src/library/useViewSave.browser.test.tsx`, three stubs:
  `new Response(JSON.stringify(saved), { status: 201 })` (twice) → `new Response(JSON.stringify({ meta: saved, layoutExisted: true, recipeExisted: true }), { status: 201 })`
  `new Response(JSON.stringify(stored.meta), { status: 201 })` → `new Response(JSON.stringify({ meta: stored.meta, layoutExisted: true, recipeExisted: true }), { status: 201 })`

`useStoreSave.browser.test.tsx` answers `'{}'`; its cases check the request only, so leave them. Confirm with `rg -n "status: 201" apps/lab/src` that no other stub answers a POST with a meta.

- [ ] **Step 5: Run the touched files**

Run, from `apps/lab`:
`pnpm vitest run --project node-integration src/api/boards.node.test.ts`
`pnpm vitest run --project chromium src/library/useViewSave.browser.test.tsx src/routes/Workspace.browser.test.tsx src/library/useStoreSave.browser.test.tsx`
Expected: PASS.

- [ ] **Step 6: Gates and commit**

```bash
cd apps/lab && npx prettier --write src/api/boards.ts src/api/boards.node.test.ts src/routes/Workspace.browser.test.tsx src/library/useViewSave.browser.test.tsx && cd ../..
pnpm nx run lab:check --skip-nx-cache && pnpm nx run lab:lint --skip-nx-cache
git add apps/lab/src/api/boards.ts apps/lab/src/api/boards.node.test.ts apps/lab/src/routes/Workspace.browser.test.tsx apps/lab/src/library/useViewSave.browser.test.tsx
git commit -m "lab: read the save's two flags from the store's answer

SaveOutcome carries layoutExisted and recipeExisted. A 201 without them
(an older store server) is a failure with its own reason rather than a
meta that is not one."
```

---

### Task 3: The run's status line says when the layout was already stored

**Files:**
- Modify: `packages/engine/lab-i18n.ts` (two keys in `EN.ui` and `PL.ui`)
- Modify: `apps/lab/src/stage/useRunState.ts` (the appended store answer)
- Test: `apps/lab/src/stage/RunStatusBar.browser.test.tsx`

**Interfaces:**
- Consumes: `SaveOutcome` from Task 2.
- Produces: dictionary keys `savedKnownLayout: string`, `savedKnownRecipe: string`.

- [ ] **Step 1: Write the failing tests**

In `apps/lab/src/stage/RunStatusBar.browser.test.tsx`, inside `describe('RunStatusBar', …)`, add:

```ts
  // The three answers a save can give; the two for a known layout differ in
  // whether this run's knobs were a recipe the layout already had.
  it.each([
    [false, false, 'saved'],
    [true, false, 'savedKnownLayout'],
    [true, true, 'savedKnownRecipe'],
  ] as const)(
    'after a save with layoutExisted %s and recipeExisted %s the line ends in %s',
    async (layoutExisted, recipeExisted, key) => {
      const state = useStore.getState()
      state.run.started(state.params.values)
      state.completeRun({ board: RESULT.board, file: CLOSED.board, report: CLOSED })
      state.result.stored(CLOSED.board, { ok: true, meta: storedFixture(1).meta, layoutExisted, recipeExisted })
      const screen = await mountBar()
      await expect.element(screen.getByRole('status')).toMatchTextContent(`${EN.t('closed')} — ${EN.t(key)}`)
    },
  )

  it('says in Polish that the layout was already stored', async () => {
    const PL = dictionary('pl')
    useStore.setState((s) => ({ lang: { ...s.lang, lang: 'pl' } }))
    const state = useStore.getState()
    state.run.started(state.params.values)
    state.completeRun({ board: RESULT.board, file: CLOSED.board, report: CLOSED })
    state.result.stored(CLOSED.board, { ok: true, meta: storedFixture(1).meta, layoutExisted: true, recipeExisted: false })
    const screen = await mountBar()
    await expect.element(screen.getByRole('status')).toMatchTextContent(`${PL.t('closed')} — ${PL.t('savedKnownLayout')}`)
  })
```

(`beforeEach` already puts the language back to `en`.)

- [ ] **Step 2: Run them to verify they fail**

Run, from `apps/lab`: `pnpm vitest run --project chromium src/stage/RunStatusBar.browser.test.tsx`
Expected: the `saved` row passes (it is today's text) and the other three cases FAIL: the two keys do not exist yet, and the line reads "— saved" whatever the flags say.

- [ ] **Step 3: Add the words**

In `packages/engine/lab-i18n.ts`, in `EN.ui` right after `notSaved: 'not saved (no store server)',`:

```ts
    savedKnownLayout: 'already in the library; recipe added',
    savedKnownRecipe: 'already in the library; recipe updated',
```

In `PL.ui` right after `notSaved: 'nie zapisano (brak serwera magazynu)',`:

```ts
    savedKnownLayout: 'już w bibliotece; dopisano przepis',
    savedKnownRecipe: 'już w bibliotece; zaktualizowano przepis',
```

- [ ] **Step 4: Pick the words from the flags**

In `apps/lab/src/stage/useRunState.ts`, add the import:

```ts
import type { SaveOutcome } from '../api/boards'
```

Add, below `noticeText`:

```ts
/** The store's answer for a run's board: new to the library, or a layout it already had. */
function saveText(dict: Dict, saved: SaveOutcome): string {
  if (!saved.ok) return dict.t('notSaved')
  if (!saved.layoutExisted) return dict.t('saved')
  return dict.t(saved.recipeExisted ? 'savedKnownRecipe' : 'savedKnownLayout')
}
```

and replace

```ts
  const answer = !reportsRun || saved === null ? '' : ` — ${saved.ok ? dict.t('saved') : dict.t('notSaved')}`
```

with

```ts
  const answer = !reportsRun || saved === null ? '' : ` — ${saveText(dict, saved)}`
```

- [ ] **Step 5: Run the tests**

```bash
pnpm nx build engine --skip-nx-cache
cd apps/lab && pnpm vitest run --project chromium src/stage/RunStatusBar.browser.test.tsx
```

Expected: PASS, the new cases and the existing "not saved" ones.

- [ ] **Step 6: Gates and commit**

```bash
deno fmt packages/engine/lab-i18n.ts && (cd packages/engine && deno test -A lab-i18n.test.ts)
cd apps/lab && npx prettier --write src/stage/useRunState.ts src/stage/RunStatusBar.browser.test.tsx && cd ../..
pnpm nx run lab:check --skip-nx-cache
git add packages/engine/lab-i18n.ts apps/lab/src/stage/useRunState.ts apps/lab/src/stage/RunStatusBar.browser.test.tsx
git commit -m "lab: say after a run when its layout was already in the library

The store's answer appended to the run's line reads 'already in the
library; recipe added' or '... recipe updated' when the layout was
stored before, and 'saved' only for a new one."
```

---

### Task 4: A two-recipe fixture, and the two helpers take a recipe

**Files:**
- Modify: `packages/engine/lab-report.ts` (`genSeconds`)
- Modify: `apps/lab/src/library/loadIntoLab.ts`
- Modify: `apps/lab/src/state/library.fixtures.ts` (new `twoRecipesFixture`)

**Interfaces:**
- Produces:
  - `genSeconds(meta: Pick<BoardMeta, 'genMs'>, dash: string): string`
  - `loadIntoLab(source: Pick<BoardMeta, 'params' | 'view'>, control: RunControl, navigate: (path: string) => void): void`
  - `twoRecipesFixture(seed?: number): { meta: BoardMeta; file: BoardFile }`: `storedFixture(seed)` with two recipes of one seed, `restarts` 5 (first, older) and 1 (second, latest). The top-level fields copy the second.

This task changes no behaviour: two type narrowings and a fixture. Its check is the type gate; Task 5's tests are its consumers.

- [ ] **Step 1: Narrow `genSeconds`**

In `packages/engine/lab-report.ts` replace

```ts
export function genSeconds(meta: BoardMeta, dash: string): string {
```

with

```ts
export function genSeconds(meta: Pick<BoardMeta, 'genMs'>, dash: string): string {
```

- [ ] **Step 2: Narrow `loadIntoLab`**

In `apps/lab/src/library/loadIntoLab.ts` replace the doc comment and signature

```ts
/**
 * The knobs, then the view, then one run and the lab. `start()`, not
 * `generate()`: in the simple view that would draw new knobs over these.
 */
export function loadIntoLab(meta: BoardMeta, control: RunControl, navigate: (path: string) => void): void {
```

with

```ts
/**
 * The knobs, then the view, then one run and the lab, from a stored board or
 * one of its recipes. `start()`, not `generate()`: in the simple view that
 * would draw new knobs over these.
 */
export function loadIntoLab(
  source: Pick<BoardMeta, 'params' | 'view'>,
  control: RunControl,
  navigate: (path: string) => void,
): void {
```

and in its body replace `meta.params` with `source.params` and `meta.view` with `source.view`.

- [ ] **Step 3: Add the fixture**

In `apps/lab/src/state/library.fixtures.ts`, change the first import to also take `Params` and `Recipe`, add `boardId` to the second:

```ts
import {
  type BoardFile,
  type BoardMeta,
  type BoardSize,
  defaultParams,
  encodeBoard,
  generate,
  type Params,
  type Recipe,
} from '@arrowz/engine'
import { boardId, DEFAULT_VIEW } from '@arrowz/engine/command'
```

and append:

```ts
/**
 * `storedFixture` as a second save of the same seed with another `restarts`
 * leaves it: two recipes, the second the latest, which the top-level fields
 * copy. Both values differ from the knob's default (3), so loading either
 * one moves the knob.
 */
export function twoRecipesFixture(seed = 1): { meta: BoardMeta; file: BoardFile } {
  const { meta, file } = storedFixture(seed)
  const recipe = (restarts: number, at: string): Recipe => {
    const params: Params = { ...meta.params, restarts }
    return {
      id: boardId(params),
      params,
      view: meta.view,
      command: `deno task carve --width=${meta.W} --height=${meta.H} --seed=${seed} --restarts=${restarts}`,
      source: 'lab',
      createdAt: at,
      updatedAt: at,
      genMs: meta.genMs,
      restarts: meta.restarts,
      backtracks: meta.backtracks,
      aborted: false,
    }
  }
  const older = recipe(5, '2026-09-16T10:00:00.000Z')
  const latest = recipe(1, '2026-09-17T10:00:00.000Z')
  return {
    meta: { ...meta, params: latest.params, command: latest.command, updatedAt: latest.updatedAt, sources: [older, latest] },
    file,
  }
}
```

- [ ] **Step 4: Type gates**

```bash
deno fmt packages/engine/lab-report.ts && deno task check
pnpm nx build engine --skip-nx-cache
cd apps/lab && npx prettier --write src/library/loadIntoLab.ts src/state/library.fixtures.ts && cd ../..
pnpm nx run lab:check --skip-nx-cache
```

Expected: both checks pass; `BoardColumn` and `FileColumn` still pass a whole meta to `loadIntoLab`, which satisfies the narrower type.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/lab-report.ts apps/lab/src/library/loadIntoLab.ts apps/lab/src/state/library.fixtures.ts
git commit -m "lab: let genSeconds and loadIntoLab take a recipe

Both read two or three fields of a meta; narrowed to those, a Recipe
passes as it is. Adds a two-recipe fixture for the recipe list."
```

---

### Task 5: The recipe list in the board's column

**Files:**
- Create: `apps/lab/src/library/RecipeList.tsx`
- Modify: `apps/lab/src/library/BoardColumn.tsx` (render the list after the facts)
- Modify: `apps/lab/src/design/library.css` (the list's styles and the S/M band rule)
- Modify: `packages/engine/lab-i18n.ts` (seven keys in `EN.ui` and `PL.ui`)
- Test: `apps/lab/src/library/BoardColumn.browser.test.tsx`

**Interfaces:**
- Consumes: `twoRecipesFixture`, `loadIntoLab(source, …)`, `genSeconds(Pick<…,'genMs'>, …)` from Task 4; `boardId` from `@arrowz/engine/command`; `CommandFigure({ label, caption, command })` from `apps/lab/src/run/CommandFigure.tsx`.
- Produces: `RecipeList({ meta, control }: { meta: BoardMeta; control: RunControl }): ReactElement | null`, rendering `section.fw-recipes`, one `li.fw-recipe` per recipe with `p.fw-rhead` and `p.fw-rfacts`.

- [ ] **Step 1: Write the failing tests**

In `apps/lab/src/library/BoardColumn.browser.test.tsx`, import the fixture beside `storedFixture`:

```ts
import { storedFixture, twoRecipesFixture } from '../state/library.fixtures'
```

and add, after the `show` helper:

```ts
const two = twoRecipesFixture(1)

/** Puts the two-recipe board on the stage; its id is `stored`'s, so `mountDetail`'s address names it. */
async function showTwo(meta = two.meta) {
  await act(async () =>
    useStore
      .getState()
      .result.showPreview({ origin: 'store', board: decodeBoard(two.file), file: two.file, meta }),
  )
}
```

Then add these cases at the end of the file:

```ts
// One recipe, not `stored`'s empty `sources`: a list drawn from one recipe up would pass on an empty one.
test('a board with one recipe lists none: the column’s command is that recipe', async () => {
  const screen = await mountDetail()
  await showTwo({ ...two.meta, sources: two.meta.sources.slice(1) })
  await expect.element(screen.getByRole('button', { name: /^load into lab$/i })).toBeVisible()
  expect(screen.container.querySelector('.fw-recipes')).toBeNull()
})

test('a board with two recipes lists both, numbered, the latest marked', async () => {
  const screen = await mountDetail()
  await showTwo()
  await expect.element(screen.getByText('Recipes (2)')).toBeVisible()
  const heads = [...screen.container.querySelectorAll('.fw-recipe .fw-rhead')].map((p) => p.textContent)
  expect(heads).toEqual(['Recipe 1', 'Recipe 2 · latest'])
  await expect
    .element(screen.getByRole('figure', { name: 'Command of recipe 1' }))
    .toMatchTextContent(/--restarts=5/)
  await expect
    .element(screen.getByRole('figure', { name: 'Command of recipe 2' }))
    .toMatchTextContent(/--restarts=1/)
})

// Both recipes share the seed, so only the number tells their buttons apart.
test('Load into lab on the older recipe sets that recipe’s knobs and goes to the lab', async () => {
  const screen = await mountDetail()
  await showTwo()
  await userEvent.click(screen.getByRole('button', { name: 'Load into lab: recipe 1' }))
  expect(useStore.getState().params.values.restarts).toBe(5)
  expect(run.seeds).toEqual([two.meta.seed])
  await expect.element(screen.getByTestId('address')).toHaveTextContent('/')
})

test('a recipe with no timing and no date says so without a stray separator', async () => {
  const [older, latest] = two.meta.sources
  if (older === undefined || latest === undefined) throw new Error('the fixture has two recipes')
  const screen = await mountDetail()
  await showTwo({ ...two.meta, sources: [{ ...older, genMs: null, updatedAt: '' }, latest] })
  const facts = screen.container.querySelector('.fw-recipe .fw-rfacts')?.textContent
  expect(facts).toBe('seed 1 · lab · — s')
})
```

- [ ] **Step 2: Run them to verify they fail**

```bash
pnpm nx build engine --skip-nx-cache
cd apps/lab && pnpm vitest run --project chromium src/library/BoardColumn.browser.test.tsx
```

Expected: the first new case passes (nothing renders a list yet; its value is shown by the mutation in Step 7). The other three FAIL: no "Recipes (2)" text, no "Load into lab: recipe 1" button, no `.fw-rfacts`.

- [ ] **Step 3: Add the words**

In `packages/engine/lab-i18n.ts`, `EN.ui`, right after `factEmpty: 'empty cells',`:

```ts
    recipesTitle: (n: number) => `Recipes (${n})`,
    recipeName: (i: number) => `Recipe ${i}`,
    recipeLatest: 'latest',
    recipeStopped: 'stopped',
    recipeCommand: (i: number) => `Command of recipe ${i}`,
    recipeCaption: 'CLI · this recipe',
    recipeLoad: (i: number) => `Load into lab: recipe ${i}`,
```

`PL.ui`, right after `factEmpty: 'puste pola',`:

```ts
    recipesTitle: (n) => `Przepisy (${n})`,
    recipeName: (i) => `Przepis ${i}`,
    recipeLatest: 'ostatni',
    recipeStopped: 'zatrzymany',
    recipeCommand: (i) => `Komenda przepisu ${i}`,
    recipeCaption: 'CLI · ten przepis',
    recipeLoad: (i) => `Wczytaj do laboratorium: przepis ${i}`,
```

`recipeLoad` starts with the visible button text (`loadIntoLab`), so the accessible name contains the label a person sees.

- [ ] **Step 4: Write the component**

Create `apps/lab/src/library/RecipeList.tsx`:

```tsx
import type { BoardMeta } from '@arrowz/engine'
import { boardId } from '@arrowz/engine/command'
import { genSeconds } from '@arrowz/engine/report'
import { type ReactElement, useId } from 'react'
import { useNavigate } from 'react-router'
import { useDictionary } from '../i18n'
import { CommandFigure } from '../run/CommandFigure'
import type { RunControl } from '../run/useRun'
import { loadIntoLab } from './loadIntoLab'

/**
 * Every recipe of a stored layout, when it has more than one: with one, the
 * column's own command is that recipe. Numbered, because a layout's recipes
 * usually share a seed. The latest is the one the meta's top-level fields copy.
 */
export function RecipeList({ meta, control }: { meta: BoardMeta; control: RunControl }): ReactElement | null {
  const dict = useDictionary()
  const navigate = useNavigate()
  const titleId = useId()
  if (meta.sources.length < 2) return null
  const latest = boardId(meta.params)
  return (
    <section className="fw-recipes" aria-labelledby={titleId}>
      <p id={titleId} className="caps">
        {dict.t('recipesTitle', meta.sources.length)}
      </p>
      <ol>
        {meta.sources.map((recipe, at) => {
          const n = at + 1
          const head = [
            dict.t('recipeName', n),
            recipe.id === latest ? dict.t('recipeLatest') : '',
            recipe.aborted ? dict.t('recipeStopped') : '',
          ]
          const date = recipe.updatedAt ? new Date(recipe.updatedAt).toLocaleString(dict.locale) : ''
          const facts = [
            `${dict.t('factSeed')} ${recipe.params.seed}`,
            recipe.source,
            date,
            `${genSeconds(recipe, '—')} s`,
          ]
          return (
            <li key={recipe.id} className="fw-recipe">
              <p className="fw-rhead">{head.filter((part) => part !== '').join(' · ')}</p>
              <p className="fw-rfacts">{facts.filter((part) => part !== '').join(' · ')}</p>
              <CommandFigure
                label={dict.t('recipeCommand', n)}
                caption={dict.t('recipeCaption')}
                command={recipe.command}
              />
              <div className="fw-alt">
                <button
                  type="button"
                  aria-label={dict.t('recipeLoad', n)}
                  onClick={() => loadIntoLab(recipe, control, (path) => void navigate(path))}
                >
                  {dict.t('loadIntoLab')}
                </button>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
```

- [ ] **Step 5: Render it and style it**

In `apps/lab/src/library/BoardColumn.tsx` import it beside `OpenFileButton`:

```ts
import { RecipeList } from './RecipeList'
```

and render it right after the closing `</dl>` of `.fw-bmeta`, still inside the `<section>`:

```tsx
      <RecipeList meta={meta} control={control} />
```

In `apps/lab/src/design/library.css`, after the `.fw-bmeta dd.wrap-text` rule, add:

```css
/* A board's recipes, at the facts' type size: one block each, a rule above. */
.fw-recipes {
  margin: 12px 0 0;
  font-size: 11px;
}
.fw-recipes ol {
  display: grid;
  gap: 12px;
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}
.fw-recipe {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding-top: 6px;
  box-shadow: 0 -1px 0 var(--border);
}
.fw-recipe p {
  margin: 0;
}
.fw-rfacts {
  color: var(--ash);
  overflow-wrap: anywhere;
}
```

and extend the S/M band rule at the end of the file so the list leaves the bar with the facts:

```css
@media (min-width: 768px) and (max-width: 1279px) {
  .fw-lab:not(.solo) .fw-bcol .fw-bmeta,
  .fw-lab:not(.solo) .fw-bcol .fw-recipes {
    display: none;
  }
}
```

Update that rule's comment from "its facts stay out of it" to "its facts and recipes stay out of it".

- [ ] **Step 6: Run the tests**

```bash
pnpm nx build engine --skip-nx-cache
cd apps/lab && pnpm vitest run --project chromium src/library/BoardColumn.browser.test.tsx
```

Expected: PASS, every case in the file.

- [ ] **Step 7: Prove the one-recipe case**

Temporarily change `if (meta.sources.length < 2) return null` to `if (meta.sources.length < 1) return null`, run the file, and confirm `'a board with one recipe lists none…'` FAILS. Revert the mutation and rerun: PASS.

- [ ] **Step 8: Gates and commit**

```bash
deno fmt packages/engine/lab-i18n.ts && (cd packages/engine && deno test -A lab-i18n.test.ts)
cd apps/lab && npx prettier --write src/library/RecipeList.tsx src/library/BoardColumn.tsx src/library/BoardColumn.browser.test.tsx src/design/library.css && cd ../..
pnpm nx run lab:check --skip-nx-cache && pnpm nx run lab:lint --skip-nx-cache
git add packages/engine/lab-i18n.ts apps/lab/src/library/RecipeList.tsx apps/lab/src/library/BoardColumn.tsx apps/lab/src/library/BoardColumn.browser.test.tsx apps/lab/src/design/library.css
git commit -m "lab: list a stored board's recipes when it has two or more

Each recipe shows its number, seed, source, date and generation time,
its command and a Load into lab of its own. The latest, which the meta's
top-level fields copy, is marked. Hidden in the S and M bands with the
facts."
```

---

### Task 6: The armed Delete names the recipe count

**Files:**
- Modify: `packages/engine/lab-i18n.ts` (one key)
- Modify: `apps/lab/src/library/BoardColumn.tsx` (the armed text)
- Test: `apps/lab/src/library/BoardColumn.browser.test.tsx`

**Interfaces:**
- Consumes: `showTwo` and `two` from Task 5's test additions.
- Produces: dictionary key `confirmDeleteRecipes: (n: number) => string`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/lab/src/library/BoardColumn.browser.test.tsx`:

```ts
test('armed, Delete names how many recipes go with a board that has two', async () => {
  const screen = await mountDetail()
  await showTwo()
  await userEvent.click(screen.getByRole('button', { name: 'Delete from disk' }))
  await expect
    .element(screen.getByRole('button', { name: 'Really delete? Its 2 recipes go too.' }))
    .toBeVisible()
})

test('armed, Delete of a one-recipe board asks as before', async () => {
  const screen = await mountDetail()
  await show()
  await userEvent.click(screen.getByRole('button', { name: 'Delete from disk' }))
  await expect.element(screen.getByRole('button', { name: 'Really delete?' })).toBeVisible()
})
```

- [ ] **Step 2: Run them to verify the first fails**

Run, from `apps/lab`: `pnpm vitest run --project chromium src/library/BoardColumn.browser.test.tsx -t "armed, Delete"`
Expected: the first FAILS (the button reads "Really delete?"); the second passes on `main` and pins today's text.

- [ ] **Step 3: Add the words**

`EN.ui`, right after `confirmDelete: 'Really delete?',`:

```ts
    confirmDeleteRecipes: (n: number) => `Really delete? Its ${n} recipes go too.`,
```

`PL.ui`, right after `confirmDelete: 'Na pewno usunąć?',`:

```ts
    confirmDeleteRecipes: (n) => `Na pewno usunąć? Razem z przepisami (${n}).`,
```

- [ ] **Step 4: Pick the armed text by the count**

In `apps/lab/src/library/BoardColumn.tsx`, replace

```tsx
          {armed ? dict.t('confirmDelete') : dict.t('deleteBoard')}
```

with

```tsx
          {!armed
            ? dict.t('deleteBoard')
            : meta.sources.length >= 2
              ? dict.t('confirmDeleteRecipes', meta.sources.length)
              : dict.t('confirmDelete')}
```

- [ ] **Step 5: Run the file**

```bash
pnpm nx build engine --skip-nx-cache
cd apps/lab && pnpm vitest run --project chromium src/library/BoardColumn.browser.test.tsx
```

Expected: PASS. The existing delete cases find the armed button with `/really delete/i`, which both texts match.

- [ ] **Step 6: Gates and commit**

```bash
deno fmt packages/engine/lab-i18n.ts && (cd packages/engine && deno test -A lab-i18n.test.ts)
cd apps/lab && npx prettier --write src/library/BoardColumn.tsx src/library/BoardColumn.browser.test.tsx && cd ../..
git add packages/engine/lab-i18n.ts apps/lab/src/library/BoardColumn.tsx apps/lab/src/library/BoardColumn.browser.test.tsx
git commit -m "lab: say how many recipes an armed Delete removes

Deleting a layout removes every recipe in it. With two or more the armed
button names the count; with one it asks as before."
```

---

### Task 7: The list's geometry, the full gate and a live look

**Files:**
- Modify: `apps/lab/src/library/BoardColumn.browser.test.tsx` (`stubStore` and `openLibraryDetail` take a meta; two geometry cases)

**Interfaces:**
- Consumes: `twoRecipesFixture`, `openLibraryDetail(w, h, sheet)` and `stubStore()` already in the file.

- [ ] **Step 1: Let the whole-app helpers take a meta**

In `apps/lab/src/library/BoardColumn.browser.test.tsx`, give `stubStore` and `openLibraryDetail` a `meta` parameter defaulting to today's fixture, and use it for the listing:

```ts
function stubStore(meta: BoardMeta = stored.meta) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    if (url.includes('/api/boards'))
      return Promise.resolve(Response.json([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [meta] }]))
    if (url.includes('/store/')) return Promise.resolve(Response.json(stored.file))
    return Promise.resolve(new Response('{}', { status: 404 }))
  })
}
```

```ts
async function openLibraryDetail(w: number, h: number, sheet = false, meta: BoardMeta = stored.meta) {
  await page.viewport(w, h)
  resetApp('advanced')
  stubStore(meta)
  window.history.pushState({}, '', `/boards/8x8/${meta.id}`)
```

(the rest of the helper unchanged). Import `type BoardMeta` from `@arrowz/engine` next to `decodeBoard`.

- [ ] **Step 2: Write the geometry cases**

```ts
// 1400 is the L band and 375 the phone's Board sheet: the two places the list is on screen.
test.each([
  [1400, 900, false],
  [375, 812, true],
] as const)(
  'at %dx%d the recipe list fits the column',
  async (w, h, sheet) => {
    try {
      const screen = await openLibraryDetail(w, h, sheet, two.meta)
      const column = screen.container.querySelector<HTMLElement>('#board-column')
      const list = screen.container.querySelector<HTMLElement>('#board-column .fw-recipes')
      if (column === null || list === null) throw new Error('no recipe list in the column')
      expect(getComputedStyle(list).display).not.toBe('none')
      expect(column.scrollWidth).toBeLessThanOrEqual(column.clientWidth)
      for (const item of list.querySelectorAll<HTMLElement>('.fw-recipe'))
        expect(item.scrollWidth).toBeLessThanOrEqual(item.clientWidth)
    } finally {
      await page.viewport(414, 896)
    }
  },
  40_000,
)

test('at 860x900 the recipe list stays off the bar, with the facts', async () => {
  try {
    const screen = await openLibraryDetail(860, 900, false, two.meta)
    const list = screen.container.querySelector<HTMLElement>('#board-column .fw-recipes')
    if (list === null) throw new Error('the list is not rendered')
    expect(getComputedStyle(list).display).toBe('none')
  } finally {
    await page.viewport(414, 896)
  }
}, 40_000)
```

- [ ] **Step 3: Run them, then prove the band case**

Run, from `apps/lab`: `pnpm vitest run --project chromium src/library/BoardColumn.browser.test.tsx -t "recipe list"`
Expected: PASS. Then remove the `.fw-recipes` selector from the S/M rule in `library.css`, rerun, and confirm the 860 case FAILS; put the selector back.

- [ ] **Step 4: The full gate**

```bash
deno task verify
pnpm nx run-many -t verify --skip-nx-cache
```

Expected: both pass, `LayoutInvariants` included. If a `LayoutInvariants` floor moves, the list is not the cause (its fixtures have one recipe); investigate before touching a number.

- [ ] **Step 5: Live look**

Start a store on a scratch directory and the lab against it (never the real `packages/cli/boards`):

```bash
export ARROWZ_BOARDS_DIR=$(mktemp -d /tmp/arrowz-recipes-XXXX)
pnpm nx serve lab
```

In the lab (`http://localhost:8779`): generate a small board (for example 12×12, seed 3), then the same seed again, then again with `restarts` changed. Check:

- the status line: "— saved", then "— already in the library; recipe updated", then "— … recipe added";
- on Saved boards, the board's column at 1440 wide: "Recipes (2)", "Recipe 2 · latest", each command, and "Load into lab" on recipe 1 brings back the first `restarts`;
- the armed Delete: "Really delete? Its 2 recipes go too.";
- the same in Polish after switching the language.

Stop the servers and remove the scratch directory by its exact path.

- [ ] **Step 6: Commit**

```bash
cd apps/lab && npx prettier --write src/library/BoardColumn.browser.test.tsx && cd ../..
git add apps/lab/src/library/BoardColumn.browser.test.tsx
git commit -m "lab: pin the recipe list's geometry in the bands that show it

At 1400 and in the phone's Board sheet the list fits the column; at 860
it leaves the bar with the facts."
```
