# Lab correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Links and stored boards keep exactly the view they recorded, redirects keep the link, the command palette keeps its keys, a Polish user can type a decimal comma, and no English the lab wrote itself reaches the Polish UI.

**Architecture:** One constant, `VIEW_VERSION`, in the engine's neutral `command.ts` marks a view written after this change, in the URL hash (`__view.viewVersion`) and in a stored meta (`BoardMeta.viewVersion`); readers apply the legacy rules only when it is absent. The other four fixes are local: a redirect component that keeps the fragment, the palette's key and mouse handling, one line in `DraftNumber.commit`, and two dictionary uses.

**Tech Stack:** TypeScript, Deno 2.9 (`packages/engine`, `packages/cli`), React 19 + zustand + react-router 8 (`apps/lab`), Vitest 5 with the `node` and `chromium` projects.

**Spec:** `docs/superpowers/specs/2026-09-25-lab-correctness-design.md`

## Global Constraints

- Everything in the repository is in English: code, comments, tests, commit messages.
- No `any`, no non-null assertions (`!`); `exactOptionalPropertyTypes` is on in the lab.
- The engine files (`command.ts`, `types.ts`, `lab-i18n.ts`) know neither Deno nor the DOM.
- Comments say why, once, in the fewest lines: non-header blocks ≤ 6 lines; no PR, round, task, review or ruling references; cite symbols, never `file.ts:NN`. `packages/engine/comments.test.ts` enforces this over `apps/lab/src` and `packages/engine/lab-*.ts`.
- The lab reads the engine from `packages/engine/dist/`: after any change under `packages/engine`, run `pnpm nx build engine --skip-nx-cache` before a lab test, and grep the new symbol in `packages/engine/dist` (the Nx cache is shared between worktrees).
- Before the first lab test in a fresh worktree: `corepack enable pnpm && pnpm install`, then `pnpm nx build engine --skip-nx-cache && pnpm nx build board-element --skip-nx-cache`.
- Lab test commands, from `apps/lab`: `pnpm vitest run --project node <file>` and `pnpm vitest run --project chromium <file>`. A first `vitest run` in a fresh worktree may fail with "Vitest failed to find the runner"; run it again before treating it as a defect.
- Deno test command, from the repository root: `deno test --allow-read --allow-write --allow-env --allow-run --allow-net <file>`.
- Every mutation step says "undo by hand": never `git checkout` a file with uncommitted work.
- Commit messages carry no attribution lines.

## Review Focus

1. **Links already in circulation.** A link without `viewVersion` (every link shared before this change) must decode exactly as today. The existing legacy cases in `state/url.test.ts` stay; Task 2 moves the "predates" cases, which today build their link with `encodeHash`, onto hand-written legacy JSON so they keep testing legacy links once `encodeHash` writes the version.
2. **Boards already on disk.** A meta without `viewVersion` reads a head height of 0 as the default, in the top-level view and in every recipe, and a later save over it keeps those old recipes at the default. Task 1 pins both.
3. **Typing on after a click in the palette.** After a click on a row or the footer, typed letters must still reach the search box and filter the list, not the page. Task 4's component case types after the clicks.
4. **A language switch after the store refused a board.** The sentence must follow the page's language, because the lab words it at render time. Task 6 switches the language mid-case.
5. **A comma in a whole-number field.** `1,000` in the width must commit nothing, not a 1 clamped to a 4-wide board. Task 5 pins it, and `1,2,3` in a fractional field.

---

### Task 1: The view version, and the store reads a head height of 0 literally

**Files:**
- Modify: `packages/engine/command.ts` (after `DEFAULT_VIEW`)
- Modify: `packages/engine/types.ts` (`BoardMeta`)
- Modify: `packages/cli/store.ts` (`fillView`, `readMeta`, `saveBoard`)
- Test: `packages/cli/store.test.ts`

**Interfaces:**
- Produces: `export const VIEW_VERSION = 2` from `@arrowz/engine/command`; `BoardMeta.viewVersion?: number`. Task 2 imports `VIEW_VERSION`.

- [ ] **Step 1: Add the constant and the meta field (no behaviour yet)**

In `packages/engine/command.ts`, directly after the closing `}` of `export const DEFAULT_VIEW: View = { … }`:

```ts
/**
 * The version a link or a stored meta writes its view with; absent reads as 1.
 * In a version-1 view a head height of 0 meant "automatic" and a missing colour
 * meant "written before the field existed". From 2, 0 is a head of no height
 * and a missing colour is none.
 */
export const VIEW_VERSION = 2
```

In `packages/engine/types.ts`, inside `interface BoardMeta`, after `sources: Recipe[]`:

```ts
  /** `VIEW_VERSION` of the save that wrote this meta; absent in a meta written before it existed. */
  viewVersion?: number
```

- [ ] **Step 2: Write the failing test, and turn the old one into the legacy case**

In `packages/cli/store.test.ts`, change the import on line 4 to:

```ts
import { boardId, buildCommand, COMMAND_PREFIX, DEFAULT_VIEW, VIEW_VERSION } from '@arrowz/engine/command'
```

Replace the whole case `'a board saved when the head height was automatic reads as the new default'` and the two comment lines above it with:

```ts
Deno.test('a board saved with a head height of 0 reads back 0, and its meta carries the view version', async () => {
  const dir = freshDir()
  const { meta } = await saveBoard({ ...entry(), view: { ...DEFAULT_VIEW, headHeight: 0 } })
  assertEquals(readMeta(join(dir, '25x50', `${meta.id}.json`)).viewVersion, VIEW_VERSION)
  const board = listBoards()[0]?.boards[0]
  assertEquals(board?.view.headHeight, 0)
  assertEquals(board?.sources[0]?.view.headHeight, 0, 'the recipe is read the same way')
})

// A meta without the version stored 0 for an automatic head height, which
// would mean "no arrowhead at all" now.
Deno.test('a meta written before the view version reads a head height of 0 as the default', async () => {
  const dir = freshDir()
  const { meta } = await saveBoard({ ...entry(), view: { ...DEFAULT_VIEW, headHeight: 0 } })
  const file = join(dir, '25x50', `${meta.id}.json`)
  const { viewVersion: _, ...legacy } = readMeta(file)
  Deno.writeTextFileSync(file, JSON.stringify(legacy))
  const board = listBoards()[0]?.boards[0]
  // The literal 1, not DEFAULT_VIEW.headHeight: the number is the point.
  assertEquals(board?.view.headHeight, 1)
  assertEquals(board?.sources[0]?.view.headHeight, 1, 'the recipe is read the same way')
  assertEquals(DEFAULT_VIEW.headHeight, 1)
})

// One marker per meta is enough only because a save rewrites every recipe it
// read, already filled by `readMeta`.
Deno.test('a save over a legacy meta keeps its old recipes at the default head height', async () => {
  const dir = freshDir()
  const first = await saveBoard({ ...entry(), view: { ...DEFAULT_VIEW, headHeight: 0 } })
  const file = join(dir, '25x50', `${first.meta.id}.json`)
  const { viewVersion: _, ...legacy } = readMeta(file)
  Deno.writeTextFileSync(file, JSON.stringify(legacy))
  // Another seed carves the same layout here: `entry()` always stores one piece at cell 0.
  await saveBoard({ ...entry({ params: { seed: 8 } }), view: { ...DEFAULT_VIEW, headHeight: 0.5 } })
  const board = listBoards()[0]?.boards[0]
  assertEquals(board?.sources.map((recipe) => recipe.view.headHeight), [1, 0.5])
})
```

- [ ] **Step 3: Run the tests and see the first one fail**

Run: `deno test --allow-read --allow-write --allow-env --allow-run --allow-net packages/cli/store.test.ts`
Expected: the first new case FAILS on `assertEquals(readMeta(…).viewVersion, VIEW_VERSION)` (`undefined` against `2`). The other two pass already: they guard the legacy reading, which must not change.

- [ ] **Step 4: Implement**

In `packages/cli/store.ts`, change the command import to:

```ts
import { boardId, DEFAULT_VIEW, VIEW_VERSION } from '@arrowz/engine/command'
```

Replace the doc comment and body of `fillView` with:

```ts
/**
 * A stored view with the fields a later knob added filled in. A meta written
 * before `VIEW_VERSION` stored 0 for an automatic head height, a mode that no
 * longer exists, so there a 0 reads as the default; from the version on it is
 * literal, as the CLI's `--arrow-height=0` is.
 */
function fillView(view: View, versioned: boolean): View {
  return {
    ...DEFAULT_VIEW,
    ...view,
    ...(versioned || view?.headHeight ? {} : { headHeight: DEFAULT_VIEW.headHeight }),
  }
}
```

In `readMeta`, after `const sources: Recipe[] = …`:

```ts
    const versioned = (meta.viewVersion ?? 1) >= VIEW_VERSION
```

and pass it in both calls: `view: fillView(meta.view, versioned),` and `view: fillView(r.view, versioned)` inside the `sources.map`.

In `saveBoard`, in the `const meta: BoardMeta = { … }` literal, after `sources,`:

```ts
    viewVersion: VIEW_VERSION,
```

- [ ] **Step 5: Run the tests**

Run: `deno test --allow-read --allow-write --allow-env --allow-run --allow-net packages/cli/store.test.ts`
Expected: PASS, all cases.

- [ ] **Step 6: Mutation (undo by hand)**

In `fillView`, change `versioned ||` to `false ||`. Run Step 5's command: the case `'a board saved with a head height of 0 reads back 0…'` must FAIL on `assertEquals(board?.view.headHeight, 0)`. Then change `const versioned = (meta.viewVersion ?? 1) >= VIEW_VERSION` to `const versioned = true`: the case `'a meta written before the view version…'` must FAIL on `assertEquals(board?.view.headHeight, 1)`. Undo both edits by hand and run Step 5 again: PASS.

- [ ] **Step 7: Gate and commit**

Run: `deno fmt packages/cli/store.ts packages/cli/store.test.ts packages/engine/command.ts packages/engine/types.ts && deno task verify`
Expected: check, lint, fmt and test all pass. (`fmt` rewraps the `sources.map(…)` line in `readMeta`, which the new argument pushes over the line width.)

```bash
git add packages/engine/command.ts packages/engine/types.ts packages/cli/store.ts packages/cli/store.test.ts
git commit -m "Store: a meta carries the view version, and from it on a head height of 0 is literal"
```

---

### Task 2: The link carries the view version, clears colours, keeps a head height of 0 and `voids`

**Files:**
- Modify: `apps/lab/src/state/url.ts` (`HashView`, `encodeHash`, `decodeHash`)
- Modify: `apps/lab/src/state/url.fixtures.ts` (`VIEW`)
- Modify: `apps/lab/src/state/useUrlHash.ts` (`viewFor`, `applyPayload`)
- Test: `apps/lab/src/state/url.test.ts`, `apps/lab/src/state/useUrlHash.browser.test.tsx`

**Interfaces:**
- Consumes: `VIEW_VERSION` from `@arrowz/engine/command` (Task 1). Build the engine first: `pnpm nx build engine --skip-nx-cache && grep -c VIEW_VERSION packages/engine/dist/command.js` (expect ≥ 1).
- Produces: `HashView.voids: boolean` (required). For a link with `viewVersion >= 2`, `decodeHash` returns `theme`, `palette`, `paper`, `ink`, `highlightColor` always defined (`''` / `[]` for none).

- [ ] **Step 1: Update the fixture**

Replace the body of `apps/lab/src/state/url.fixtures.ts` with:

```ts
import type { HashView } from './url'

/**
 * A complete view as the lab writes it, so a round trip returns it unchanged:
 * a link written now names "no colour" as `''` / `[]`. The point grid and the
 * margin are left out: `toEqual` treats an absent key and an `undefined` one alike.
 */
export const VIEW: HashView = {
  cell: 12,
  stroke: 0.5,
  headWidth: 0,
  headHeight: 1,
  top: 5,
  rounded: true,
  colored: false,
  highlightLongest: true,
  voids: true,
  lang: 'en',
  theme: '',
  palette: [],
  paper: '',
  ink: '',
  highlightColor: '',
}
```

- [ ] **Step 2: Write the failing codec tests, and move the "predates" cases onto legacy links**

In `apps/lab/src/state/url.test.ts`, add below the imports:

```ts
/** A link as the lab wrote it before the view version: no `viewVersion` key. */
const legacyLink = (view: Record<string, unknown>) => '#' + encodeURIComponent(JSON.stringify({ __view: view }))
```

Replace these four cases (by their names) with the code below, and add the other new cases at the end of the `describe`:
`'leaves the page on its own theme when a link names none'`,
`'reads a link that predates custom palettes as naming no palette'`,
`'reads a link that predates the board colours as naming none'`,
`'reads a link that predates the highlight colour as naming none'`
(and delete the one-line comment `// No \`palette\` key means "the page keeps its own", like \`theme\` above.`).

```ts
  it('leaves the page on its own colours when a legacy link names none', () => {
    const back = decodeHash(legacyLink({ rounded: true }))?.view
    expect(back?.theme).toBeUndefined()
    expect(back?.palette).toBeUndefined()
    expect(back?.paper).toBeUndefined()
    expect(back?.ink).toBeUndefined()
    expect(back?.highlightColor).toBeUndefined()
  })

  it('writes the view version into every link', () => {
    const body = decodeURIComponent(encodeHash({ params: defaultParams(), view: VIEW, carried: {} }).slice(1))
    expect(JSON.parse(body).__view.viewVersion).toBe(VIEW_VERSION)
  })

  it('reads a link written now that names no colours as naming none, not as silent', () => {
    const back = decodeHash(encodeHash({ params: defaultParams(), view: VIEW, carried: {} }))?.view
    expect(back?.theme).toBe('')
    expect(back?.palette).toEqual([])
    expect(back?.paper).toBe('')
    expect(back?.ink).toBe('')
    expect(back?.highlightColor).toBe('')
  })

  it('keeps a head height of 0 in a link written now', () => {
    const hash = encodeHash({ params: defaultParams(), view: { ...VIEW, headHeight: 0 }, carried: {} })
    expect(decodeHash(hash)?.view.headHeight).toBe(0)
  })

  it('drops a theme the element does not have: absent in a legacy link, none in a link written now', () => {
    expect(decodeHash(legacyLink({ theme: 'drak' }))?.view.theme).toBeUndefined()
    const hash = encodeHash({ params: defaultParams(), view: { ...VIEW, theme: 'drak' }, carried: {} })
    expect(decodeHash(hash)?.view.theme).toBe('')
  })

  it('carries the voids switch, and reads a link without it as on', () => {
    const off = encodeHash({ params: defaultParams(), view: { ...VIEW, voids: false }, carried: {} })
    expect(decodeHash(off)?.view.voids).toBe(false)
    expect(decodeHash(legacyLink({}))?.view.voids).toBe(true)
  })
```

Add `import { VIEW_VERSION } from '@arrowz/engine/command'` to the imports.

In the case `'treats a head height of 0 as unset, as the store reader does'`, change its name to `'treats a head height of 0 in a legacy link as unset, as the store reader does'` (its body already builds a legacy link).

- [ ] **Step 3: Write the failing hook tests, and split the two "keeps the page's colour" cases**

In `apps/lab/src/state/useUrlHash.browser.test.tsx`, add below the imports:

```ts
/** A link as the lab wrote it before the view version, for `location.hash =`. */
const legacyFragment = (json: Record<string, unknown>) => encodeURIComponent(JSON.stringify(json))
```

Replace the case `'opens on the palette the link names, and keeps a theme already on screen'` with:

```ts
  it('opens on the palette a legacy link names, and keeps a theme already on screen', async () => {
    await mount(stub().control)
    useStore.getState().view.setTheme('gruvbox-dark')
    location.hash = legacyFragment({ __view: { palette: ['#112233', '#aabbcc'] } })
    await vi.waitFor(() => expect(useStore.getState().view.palette).toEqual(['#112233', '#aabbcc']))
    expect(useStore.getState().view.theme).toBe('gruvbox-dark')
  })

  it('opens on the palette a link written now names, and clears the theme it does not', async () => {
    await mount(stub().control)
    useStore.getState().view.setTheme('gruvbox-dark')
    location.hash = encodeHash({
      params: defaultParams(),
      view: { ...VIEW, palette: ['#112233', '#aabbcc'] },
      carried: {},
    }).slice(1)
    await vi.waitFor(() => expect(useStore.getState().view.palette).toEqual(['#112233', '#aabbcc']))
    expect(useStore.getState().view.theme).toBe('')
  })
```

Replace the case `'keeps the board colours and the margin already on screen when a link names none of them'` with:

```ts
  it('keeps the board colours and the margin on screen when a legacy link names none of them', async () => {
    await mount(stub().control)
    useStore.getState().view.setPaper('#010203')
    useStore.getState().view.setInk('#040506')
    useStore.getState().view.setHighlightColor('#0a0b0c')
    useStore.getState().view.setPad(7)
    location.hash = legacyFragment({ W: 50, __view: {} })
    await vi.waitFor(() => expect(useStore.getState().params.values.W).toBe(50))
    expect(useStore.getState().view.paper).toBe('#010203')
    expect(useStore.getState().view.ink).toBe('#040506')
    expect(useStore.getState().view.highlightColor).toBe('#0a0b0c')
    expect(useStore.getState().view.pad).toBe(7)
  })

  // The margin is a number, and a link written now always states it; `VIEW`
  // leaves it out, which is how an absent number still keeps the page's.
  it('clears the board colours a link written now does not name, and keeps the margin', async () => {
    await mount(stub().control)
    useStore.getState().view.setPaper('#010203')
    useStore.getState().view.setInk('#040506')
    useStore.getState().view.setHighlightColor('#0a0b0c')
    useStore.getState().view.setPad(7)
    location.hash = encodeHash({ params: { ...defaultParams(), W: 50 }, view: VIEW, carried: {} }).slice(1)
    await vi.waitFor(() => expect(useStore.getState().params.values.W).toBe(50))
    expect(useStore.getState().view.paper).toBe('')
    expect(useStore.getState().view.ink).toBe('')
    expect(useStore.getState().view.highlightColor).toBe('')
    expect(useStore.getState().view.pad).toBe(7)
  })
```

Add, at the end of the `describe`:

```ts
  // Entry A is one the hook wrote, so the string it returns to is exactly what
  // a user's Back lands on; the pasted link B brings a theme and a palette.
  it('restores the colours of the entry Back returns to, and leaves that entry as it was', async () => {
    await mount(stub().control)
    useStore.getState().params.set('W', 41)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.params.W).toBe(41))
    const hashA = location.hash
    const hashB = encodeHash({
      params: { ...defaultParams(), W: 42 },
      view: { ...VIEW, theme: 'gruvbox-dark', palette: ['#112233'] },
      carried: {},
    })
    history.pushState(history.state, '', hashB)
    globalThis.dispatchEvent(new HashChangeEvent('hashchange'))
    await vi.waitFor(() => expect(useStore.getState().view.theme).toBe('gruvbox-dark'))

    history.back()
    await vi.waitFor(() => expect(useStore.getState().params.values.W).toBe(41))
    expect(useStore.getState().view.theme).toBe('')
    expect(useStore.getState().view.palette).toEqual([])
    // Wait out the debounced write, which must find entry A already right.
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(location.hash).toBe(hashA)
  })

  it('writes the voids switch into the link, and a link sets it', async () => {
    await mount(stub().control)
    useStore.getState().view.setFlag('voids', false)
    await vi.waitFor(() => expect(decodeHash(location.hash)?.view.voids).toBe(false))
    location.hash = encodeHash({ params: defaultParams(), view: { ...VIEW, cell: 13 }, carried: {} }).slice(1)
    await vi.waitFor(() => expect(useStore.getState().view.cell).toBe(13))
    expect(useStore.getState().view.voids).toBe(true)
  })
```

- [ ] **Step 4: Run both files and see them fail**

Run (from `apps/lab`): `pnpm vitest run --project node src/state/url.test.ts`
Expected FAILs, each on its first assertion:
- `'reads back what it wrote'`: `toEqual(VIEW)` (the decoder returns `theme: undefined` where the fixture now has `''`);
- `'writes the view version into every link'`: `undefined` against `2`;
- `'reads a link written now that names no colours…'`: `expect(back?.theme).toBe('')` gets `undefined`;
- `'keeps a head height of 0 in a link written now'`: `undefined` against `0`;
- `'drops a theme the element does not have…'`: `expect(…theme).toBeUndefined()` gets `'drak'`;
- `'carries the voids switch…'`: `undefined` against `false`.
`'leaves the page on its own colours when a legacy link names none'` passes: it guards the legacy reading.

Run: `pnpm vitest run --project chromium src/state/useUrlHash.browser.test.tsx`
Expected FAILs:
- `'opens on the palette a link written now names, and clears the theme it does not'` on `expect(…theme).toBe('')` (`'gruvbox-dark'`);
- `'clears the board colours a link written now does not name, and keeps the margin'` on `expect(…paper).toBe('')`;
- `'restores the colours of the entry Back returns to…'` on `expect(useStore.getState().view.theme).toBe('')`;
- `'writes the voids switch into the link, and a link sets it'` on the first `vi.waitFor` (`viewFor` does not write `voids`).
The two legacy cases pass: they guard the legacy reading.

- [ ] **Step 5: Implement the codec**

In `apps/lab/src/state/url.ts`, add to the imports:

```ts
import { themeOf } from '@arrowz/board-element'
import { VIEW_VERSION } from '@arrowz/engine/command'
```

In `interface HashView`, after `highlightLongest: boolean`:

```ts
  /** The switch that draws empty cells; a legacy link lacks it and reads as on. */
  voids: boolean
```

and replace the doc comments of `theme`, `palette`, `paper`/`ink` and `highlightColor` with these (the fields themselves stay):

```ts
  /** The board theme by name. Absent only in a legacy link that names none; a link written now says `''`. */
  theme?: string | undefined
  /**
   * The lab's custom palette. Absent (not `[]`) only in a legacy link that
   * names none, so the page keeps its own: `BoardFrame` reads `[]` as "no
   * palette", so only `undefined` spells "the link did not say".
   */
  palette?: string[] | undefined
  /** The board's own surface colours, by the same rule as `theme`. */
  paper?: string | undefined
  ink?: string | undefined
  /** The highlight colour, by the same rule as `theme`. */
  highlightColor?: string | undefined
```

In `encodeHash`, replace the `payload` line with:

```ts
  const payload = { ...input.params, __view: { ...withHighlightColor, viewVersion: VIEW_VERSION, ...input.carried } }
```

In `decodeHash`, after `const raw = …`:

```ts
  // See `VIEW_VERSION`: a link written now names every colour, so there an
  // absent one is "none", and a head height of 0 is literal.
  const versioned = typeof raw.viewVersion === 'number' && raw.viewVersion >= VIEW_VERSION
  const theme = typeof raw.theme === 'string' && themeOf(raw.theme) !== null ? raw.theme : undefined
```

and in the returned `view`, replace the `headHeight`, `theme`, `palette`, `paper`, `ink` and `highlightColor` lines (and the comments right above `headHeight` and `highlightColor`) with:

```ts
      // In a legacy link 0 was "automatic"; the store's own reader makes the same exception.
      headHeight: height !== undefined && (versioned || height > 0) ? height : undefined,
```

```ts
      theme: theme ?? (versioned ? '' : undefined),
      palette: palette(raw.palette) ?? (versioned ? [] : undefined),
      paper: colour(raw.paper) ?? (versioned ? '' : undefined),
      ink: colour(raw.ink) ?? (versioned ? '' : undefined),
      // A link written before the rename carries the old key (`highlight`) instead.
      highlightColor: colour(raw.highlightColor) ?? colour(raw.highlight) ?? (versioned ? '' : undefined),
```

and after the `highlightLongest` line add:

```ts
      voids: raw.voids !== false,
```

- [ ] **Step 6: Implement the hook**

In `apps/lab/src/state/useUrlHash.ts`, in `viewFor`, after `highlightLongest: view.highlightLongest,`:

```ts
    voids: view.voids,
```

In `applyPayload`, after `view.setFlag('highlightLongest', payload.view.highlightLongest)`:

```ts
  view.setFlag('voids', payload.view.voids)
```

and replace the two comments `// Absent keeps the page's own value, as for \`cell\`..\`top\`. A link naming a` / `// theme and a palette keeps both: neither setter touches the other field.` with:

```ts
  // Absent only in a legacy link: the page keeps its own, as for `cell`..`top`.
  // A link written now states every colour (`''` for none), so it clears them.
```

and delete the later one-line comment `// Absent keeps the page's own value, as for the numbers.`

- [ ] **Step 7: Run both files**

Run: `pnpm vitest run --project node src/state/url.test.ts && pnpm vitest run --project chromium src/state/useUrlHash.browser.test.tsx src/run/triggers.browser.test.tsx`
Expected: PASS. (`triggers` also builds links with `VIEW`.)

- [ ] **Step 8: Mutation (undo by hand)**

Remove `view.setFlag('voids', payload.view.voids)` from `applyPayload`: `'writes the voids switch…'` must FAIL on `expect(useStore.getState().view.voids).toBe(true)`. Undo by hand. Change `(versioned || height > 0)` to `(height > 0)`: `'keeps a head height of 0 in a link written now'` must FAIL. Undo by hand. Run Step 7: PASS.

- [ ] **Step 9: Gate and commit**

Run (from the repository root): `pnpm nx run lab:check --skip-nx-cache && pnpm nx run lab:lint --skip-nx-cache && (cd apps/lab && npx prettier --write src) && pnpm nx run lab:fmt --skip-nx-cache`
Expected: all pass.

```bash
git add apps/lab/src/state/url.ts apps/lab/src/state/url.fixtures.ts apps/lab/src/state/useUrlHash.ts apps/lab/src/state/url.test.ts apps/lab/src/state/useUrlHash.browser.test.tsx
git commit -m "Link: carries the view version, so it can clear colours, keep a head height of 0 and carry voids"
```

---

### Task 3: Redirects keep the link

**Files:**
- Create: `apps/lab/src/routes/KeepHashNavigate.tsx`
- Modify: `apps/lab/src/AppRoutes.tsx`, `apps/lab/src/routes/DocsRoute.tsx`
- Test: `apps/lab/src/routes/KeepHashNavigate.browser.test.tsx`

**Interfaces:**
- Produces: `export function KeepHashNavigate({ to }: { to: string }): ReactElement`.

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/routes/KeepHashNavigate.browser.test.tsx`:

```tsx
import { defaultParams } from '@arrowz/engine'
import { afterEach, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { App } from '../App'
import { loadRunDone, resetApp } from '../harness/mountApp'
import { useStore } from '../state/store'
import { encodeHash } from '../state/url'
import { VIEW } from '../state/url.fixtures'

afterEach(() => resetApp('advanced'))

// The whole app, not the redirect alone: the fragment is lost to the order of
// effects between `Navigate` (a child) and `useUrlHash` (in `Shell`, its parent).
const CASES = [
  { from: '/no-such-page', to: '/' },
  { from: '/docs', to: '/docs/element' },
  { from: '/docs/no-such-page', to: '/docs/element' },
]

for (const { from, to } of CASES) {
  it(`opens a link under ${from} on the knobs it names`, async () => {
    resetApp('advanced')
    const link = encodeHash({ params: { ...defaultParams(), W: 44, H: 88 }, view: VIEW, carried: {} })
    history.replaceState(null, '', from + link)
    await render(<App />)
    await expect.poll(() => location.pathname).toBe(to)
    expect(useStore.getState().params.values.W).toBe(44)
    expect(useStore.getState().params.values.H).toBe(88)
    await loadRunDone()
  }, 40_000)
}
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm vitest run --project chromium src/routes/KeepHashNavigate.browser.test.tsx`
Expected: all three FAIL on `expect(useStore.getState().params.values.W).toBe(44)` (`25`: the page opened on its defaults).

- [ ] **Step 3: Implement**

Create `apps/lab/src/routes/KeepHashNavigate.tsx`:

```tsx
import type { ReactElement } from 'react'
import { Navigate, useLocation } from 'react-router'

/**
 * `<Navigate replace>` that keeps the fragment, which is the lab's link
 * (`useUrlHash`). A plain redirect drops it before that hook reads it:
 * `Navigate` replaces the URL in its effect, and a child's effects run first.
 */
export function KeepHashNavigate({ to }: { to: string }): ReactElement {
  const { hash } = useLocation()
  return <Navigate to={{ pathname: to, hash }} replace />
}
```

In `apps/lab/src/AppRoutes.tsx`: import `{ Route, Routes } from 'react-router'` (drop `Navigate`), add `import { KeepHashNavigate } from './routes/KeepHashNavigate'`, and replace both `<Navigate to="/docs/element" replace />` and `<Navigate to="/" replace />` with `<KeepHashNavigate to="/docs/element" />` and `<KeepHashNavigate to="/" />`.

In `apps/lab/src/routes/DocsRoute.tsx`: import `{ useParams } from 'react-router'` (drop `Navigate`), add `import { KeepHashNavigate } from './KeepHashNavigate'`, and replace `return <Navigate to="/docs/element" replace />` with `return <KeepHashNavigate to="/docs/element" />`.

- [ ] **Step 4: Run the test and the docs tests**

Run: `pnpm vitest run --project chromium src/routes/ src/AppRoutes.browser.test.tsx`
Expected: PASS. (`AppRoutes.browser.test.tsx` holds the existing redirect cases.)

- [ ] **Step 5: Mutation (undo by hand)**

In `KeepHashNavigate`, change `{ pathname: to, hash }` to `to`. Run Step 1's file: all three FAIL on `W`. Undo by hand; run again: PASS.

- [ ] **Step 6: Gate and commit**

Run: `pnpm nx run lab:check --skip-nx-cache && pnpm nx run lab:lint --skip-nx-cache && (cd apps/lab && npx prettier --write src) && pnpm nx run lab:fmt --skip-nx-cache`

```bash
git add apps/lab/src/routes/KeepHashNavigate.tsx apps/lab/src/routes/KeepHashNavigate.browser.test.tsx apps/lab/src/AppRoutes.tsx apps/lab/src/routes/DocsRoute.tsx
git commit -m "Routes: a redirect keeps the fragment, so a link under a wrong path opens on its knobs"
```

---

### Task 4: The command palette keeps the focus and its keys

**Files:**
- Modify: `apps/lab/src/palette/CommandPalette.tsx` (the `mousedown` effect, a new `keydown` effect, the row comment)
- Test: `apps/lab/src/palette/CommandPalette.browser.test.tsx`, create `apps/lab/src/palette/PaletteModal.browser.test.tsx`

**Interfaces:** none new. The input keeps its own `onKeyDown` exactly as today.

Three facts about this harness the tests below rely on, each measured:
- Playwright will not click an element with `aria-disabled="true"` (it waits for "enabled" until the timeout), so a press on the disabled Abort row needs `{ force: true }`.
- The default 25×50 carve starts and finishes within about 50 ms, inside `userEvent.keyboard` plus two frames, so `run.phase` read afterwards is `'done'` either way. A carve is detected by recording every phase through `useStore.subscribe`.
- `jsx-a11y/no-noninteractive-element-interactions` matches its exceptions by element type: the `dialog` exception covers a `<dialog>` tag, not a `div` with `role="dialog"`. So the frame's listeners are native, in effects, like the existing `mousedown` one.

- [ ] **Step 1: Write the failing tests**

In `apps/lab/src/palette/CommandPalette.browser.test.tsx`, inside `describe('the palette dialog', …)`, add:

```tsx
  // Typing after the presses shows the keys still reach the search box.
  it('keeps the focus in the input when a disabled row or the footer is pressed', async () => {
    const screen = await mount()
    const input = screen.container.querySelector<HTMLInputElement>('.fw-pal input')
    await expect.poll(() => document.activeElement === input).toBe(true)
    const abort = screen.container.querySelector<HTMLElement>('#cmd-run-abort')
    const foot = screen.container.querySelector<HTMLElement>('.fw-pal .foot')
    if (abort === null || foot === null) throw new Error('no abort row or footer')
    expect(abort.getAttribute('aria-disabled')).toBe('true')
    // `force`: Playwright will not press an `aria-disabled` element.
    await userEvent.click(abort, { force: true })
    expect(document.activeElement).toBe(input)
    await userEvent.click(foot)
    expect(document.activeElement).toBe(input)
    await userEvent.keyboard('seed')
    expect(input?.value).toBe('seed')
    expect(useStore.getState().ui.palette).toBe(true)
  })

  // The focus put on a row by hand: the one way left to move it off the input.
  it('closes on Escape wherever in the dialog the focus is', async () => {
    const screen = await mount()
    const abort = screen.container.querySelector<HTMLElement>('#cmd-run-abort')
    if (abort === null) throw new Error('no abort row')
    abort.focus()
    await userEvent.keyboard('{Escape}')
    expect(useStore.getState().ui.palette).toBe(false)
  })
```

Create `apps/lab/src/palette/PaletteModal.browser.test.tsx`:

```tsx
import { afterEach, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { twoFrames } from '../harness/frames'
import { loadRunDone, mountApp, resetApp } from '../harness/mountApp'
import { useStore } from '../state/store'

afterEach(() => resetApp('advanced'))

/** Every run phase the store passes through while `act` runs; a carve is over within it. */
async function phasesDuring(act: () => Promise<void>): Promise<string[]> {
  const phases: string[] = []
  const unsubscribe = useStore.subscribe((state) => void phases.push(state.run.phase))
  await act()
  await twoFrames()
  unsubscribe()
  return phases
}

/** The page carved, the report drawer open behind the palette, the Abort row on screen. */
async function openOverReport(): Promise<HTMLElement> {
  await page.viewport(1400, 900)
  await mountApp()
  await loadRunDone()
  useStore.getState().ui.setReport(true)
  useStore.getState().ui.openPalette()
  await expect.poll(() => document.querySelector('#cmd-run-abort')).not.toBeNull()
  const abort = document.querySelector<HTMLElement>('#cmd-run-abort')
  if (abort === null) throw new Error('no abort row')
  return abort
}

// Desktop, because at XS `useDrawerKeys` leaves the drawers alone on Escape and
// the Escape half would pass with no fix.
it('a key pressed after a click inside the palette never reaches the page behind it', async () => {
  const abort = await openOverReport()
  // `force`: Playwright will not press an `aria-disabled` element.
  await userEvent.click(abort, { force: true })
  expect(await phasesDuring(() => userEvent.keyboard('g'))).not.toContain('running')
  await userEvent.keyboard('{Escape}')
  expect(useStore.getState().ui.palette).toBe(false)
  expect(useStore.getState().ui.report).toBe(true)
}, 40_000)

// The focus put on a row by hand reaches the frame's own key listener, which a
// press cannot: the `mousedown` listener keeps the focus in the input.
it('a key pressed with the focus on a row goes back to the input, not to the page', async () => {
  const abort = await openOverReport()
  abort.focus()
  expect(await phasesDuring(() => userEvent.keyboard('g'))).not.toContain('running')
  const input = document.querySelector<HTMLInputElement>('.fw-pal input')
  expect(document.activeElement).toBe(input)
  expect(useStore.getState().ui.report).toBe(true)
}, 40_000)
```

- [ ] **Step 2: Run them and see them fail**

Run (from `apps/lab`): `pnpm vitest run --project chromium src/palette/`
Expected FAILs:
- `'keeps the focus in the input…'` on the first `expect(document.activeElement).toBe(input)` (the row took the focus);
- `'closes on Escape wherever…'` on `expect(…palette).toBe(false)`;
- `'a key pressed after a click…'` on `not.toContain('running')` (`g` started a carve behind the palette);
- `'a key pressed with the focus on a row…'` on `not.toContain('running')`.

- [ ] **Step 3: Implement**

In `apps/lab/src/palette/CommandPalette.tsx`, in the `mousedown` effect, replace `if (frame.contains(event.target)) return` with:

```ts
      if (frame.contains(event.target)) {
        // A press inside keeps the focus in the input, where the dialog's keys
        // are handled; a row's click still fires.
        if (event.target !== inputRef.current) event.preventDefault()
        return
      }
```

Directly after that whole `useEffect(() => { … }, [])` block (the `mousedown` one), add:

```ts
  // A key from anywhere in the frame but the input (only a focus moved there by
  // hand) closes on Escape and otherwise goes back to the input, and no further:
  // the document's hotkeys skip a prevented event (`isHotkeyRefused` in `App`).
  // Native, like `mousedown`: jsx-a11y refuses key handlers on a `role="dialog"` div.
  useEffect(() => {
    const frame = frameRef.current
    if (frame === null) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.target === inputRef.current || event.metaKey || event.ctrlKey) return
      event.preventDefault()
      if (event.key === 'Escape') useStore.getState().ui.closePalette()
      else inputRef.current?.focus()
    }
    frame.addEventListener('keydown', onKey)
    return () => frame.removeEventListener('keydown', onKey)
  }, [])
```

(`globalThis.KeyboardEvent`: the file imports React's `KeyboardEvent` type for the input's handler, which is a different type.)

Replace the row comment `// The row is never focusable: every keystroke is the input's, and` / `// \`aria-activedescendant\` carries the active row, so a key handler` / `// here would contradict the design.` with:

```tsx
            // A press never focuses the row (see the `mousedown` effect): every
            // keystroke is the input's, and `aria-activedescendant` carries the row.
```

The input's `onKeyDown` and everything else stay as they are.

- [ ] **Step 4: Run the palette tests**

Run: `pnpm vitest run --project chromium src/palette/ && pnpm vitest run --project node src/palette/`
Expected: PASS, including every existing case (arrows, Enter, Escape from the input).

- [ ] **Step 5: Mutation (undo by hand)**

1. Delete `if (event.target !== inputRef.current) event.preventDefault()` from the `mousedown` effect: `'keeps the focus in the input…'` must FAIL on the first `activeElement` check, and `'a key pressed after a click…'` still passes (the new key listener catches `g` on the row). Undo by hand.
2. Delete the `frame.addEventListener('keydown', onKey)` line: `'closes on Escape wherever…'` and `'a key pressed with the focus on a row…'` must FAIL. Undo by hand.
3. Delete both at once: `'a key pressed after a click…'` must FAIL on `not.toContain('running')`. Undo both by hand; run Step 4: PASS.

- [ ] **Step 6: Gate and commit**

Run (from the repository root): `pnpm nx run lab:check --skip-nx-cache && pnpm nx run lab:lint --skip-nx-cache && (cd apps/lab && npx prettier --write src) && pnpm nx run lab:fmt --skip-nx-cache`
Expected: pass, with no `jsx-a11y` error (no handler was added to the JSX).

```bash
git add apps/lab/src/palette/CommandPalette.tsx apps/lab/src/palette/CommandPalette.browser.test.tsx apps/lab/src/palette/PaletteModal.browser.test.tsx
git commit -m "Palette: a click inside keeps the focus in the input, and no key reaches the page behind"
```

---

### Task 5: A decimal comma, in fractional fields only

**Files:**
- Modify: `apps/lab/src/console/DraftNumber.tsx` (a `decimal` prop, `commit`)
- Modify: `apps/lab/src/console/ValueKnob.tsx` (its `DraftNumber`), `apps/lab/src/console/ViewPanel.tsx` (the two `DraftNumber`s, in `ViewNumberRow` and `ElementNumberRow`)
- Test: `apps/lab/src/console/DraftNumber.browser.test.tsx`, `apps/lab/src/console/ViewPanel.browser.test.tsx`

**Interfaces:**
- Produces: `DraftNumber` prop `decimal?: boolean | undefined` (default `false`): whether a comma may stand for the decimal point.

A whole-number field has no decimal part for a comma to separate, and there a comma could only be read as a thousands separator (`1,000` → 1, clamped up to a 4-wide board). So the comma is accepted only where the field is fractional; a whole-number field commits nothing for it, as today. Which fields are whole: a generator knob whose `spec.step` is an integer (`clampParam` snaps to the step), a view field whose `VIEW_RANGE[field].whole` is true (`cell`, `top`; a view row's `step` is only a keyboard convenience, see `VIEW_FIELDS`), and an element row whose `step` is an integer (the margin).

- [ ] **Step 1: Write the failing tests**

Append to `apps/lab/src/console/DraftNumber.browser.test.tsx`:

```tsx
// A Polish keypad types a decimal comma, and the Polish page shows one.
test('reads a decimal comma as a point in a fractional field', async () => {
  const onCommit = vi.fn()
  const screen = await render(<DraftNumber label="stroke" value={0.5} decimal onCommit={onCommit} />)
  await screen.getByRole('button', { name: 'stroke: 0.5' }).click()
  await userEvent.fill(screen.getByRole('textbox', { name: 'stroke' }), '0,35')
  await userEvent.keyboard('{Enter}')
  expect(onCommit).toHaveBeenCalledExactlyOnceWith(0.35)
})

// Guards: neither passes a comma on to be read as a thousands separator.
test('commits nothing for a comma in a whole-number field, or for two commas', async () => {
  const onCommit = vi.fn()
  const screen = await render(<DraftNumber label="width" value={25} onCommit={onCommit} />)
  await screen.getByRole('button', { name: 'width: 25' }).click()
  await userEvent.fill(screen.getByRole('textbox', { name: 'width' }), '1,000')
  await userEvent.keyboard('{Enter}')
  const fractional = await render(<DraftNumber label="stroke" value={0.5} decimal onCommit={onCommit} />)
  await fractional.getByRole('button', { name: 'stroke: 0.5' }).click()
  await userEvent.fill(fractional.getByRole('textbox', { name: 'stroke' }), '1,2,3')
  await userEvent.keyboard('{Enter}')
  expect(onCommit).not.toHaveBeenCalled()
})
```

In `apps/lab/src/console/ViewPanel.browser.test.tsx`, after the case `'a value being typed is not written until it is committed'`:

```tsx
test('a stroke typed with a decimal comma is written, a cell size with one is not', async () => {
  const screen = await render(<ViewPanel />)
  await screen.getByRole('button', { name: /^stroke:/ }).click()
  await userEvent.fill(screen.getByRole('textbox', { name: 'stroke', exact: true }), '0,35')
  await userEvent.keyboard('{Enter}')
  expect(view().stroke).toBe(0.35)
  await screen.getByRole('button', { name: /^export cell:/ }).click()
  await userEvent.fill(screen.getByRole('textbox', { name: 'export cell', exact: true }), '1,5')
  await userEvent.keyboard('{Enter}')
  expect(view().cell).toBe(12)
})
```

(The file's `beforeEach` sets `cell` to 12; the export cell row is reached the same way as in the file's case `'export cell'` clamping, by `/^export cell:/`.)

- [ ] **Step 2: Run them and see them fail**

Run (from `apps/lab`): `pnpm vitest run --project chromium src/console/DraftNumber.browser.test.tsx src/console/ViewPanel.browser.test.tsx`
Expected: `'reads a decimal comma as a point in a fractional field'` FAILS on `toHaveBeenCalledExactlyOnceWith(0.35)` (not called); the `ViewPanel` case FAILS on `expect(view().stroke).toBe(0.35)` (`0.5`). The whole-number guard passes: it pins today's behaviour.

- [ ] **Step 3: Implement `DraftNumber`**

In `apps/lab/src/console/DraftNumber.tsx`, add to the props (destructuring and type) after `wordOnly`:

```tsx
  decimal = false,
```

```tsx
  /** Whether a comma may stand for the decimal point: a fractional field only, where it cannot be a thousands separator. */
  decimal?: boolean | undefined
```

Replace the lines from `const typed = Number(raw.trim())` to `if (raw.trim() === '' || !Number.isFinite(typed)) return` (keeping the two comment lines between them) with:

```ts
    // One decimal comma, as a Polish keypad types it; `1,2,3` stays unreadable.
    const text = decimal ? raw.trim().replace(',', '.') : raw.trim()
    const typed = Number(text)
    // An unreadable field commits nothing: `clampParam` maps NaN to the knob's
    // default and reports it as a clamp, which is a jump nobody asked for.
    if (text === '' || !Number.isFinite(typed)) return
```

- [ ] **Step 4: Pass `decimal` at the three call sites**

`apps/lab/src/console/ValueKnob.tsx`, on its `<DraftNumber`: add `decimal={!Number.isInteger(spec.step)}`.
`apps/lab/src/console/ViewPanel.tsx`, in `ViewNumberRow`'s `<DraftNumber`: add `decimal={!range.whole}`; in `ElementNumberRow`'s `<DraftNumber`: add `decimal={!Number.isInteger(step)}`.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run --project chromium src/console/ src/simple/`
Expected: PASS.

- [ ] **Step 6: Mutation (undo by hand)**

1. In `commit`, make `text` always `raw.trim().replace(',', '.')`: the whole-number guard FAILS (`onCommit` called with 1). Undo by hand.
2. In `ViewNumberRow`, drop `decimal={!range.whole}`: the `ViewPanel` case FAILS on `stroke`. Undo by hand; run Step 5: PASS.

- [ ] **Step 7: Gate and commit**

Run (from the repository root): `pnpm nx run lab:check --skip-nx-cache && pnpm nx run lab:lint --skip-nx-cache && (cd apps/lab && npx prettier --write src) && pnpm nx run lab:fmt --skip-nx-cache`

```bash
git add apps/lab/src/console/DraftNumber.tsx apps/lab/src/console/ValueKnob.tsx apps/lab/src/console/ViewPanel.tsx apps/lab/src/console/DraftNumber.browser.test.tsx apps/lab/src/console/ViewPanel.browser.test.tsx
git commit -m "Number entry: a decimal comma reads as a point in a fractional field"
```

---

### Task 6: No lab-written English in the Polish UI

**Files:**
- Modify: `packages/engine/lab-i18n.ts` (EN and PL `ui`, next to `boardFileError`)
- Modify: `apps/lab/src/palette/commands.ts` (the view flag rows)
- Modify: `apps/lab/src/state/library.slice.ts` (`BoardError.reason`)
- Modify: `apps/lab/src/library/useStoredBoard.ts` (the stale-id branch)
- Modify: `apps/lab/src/stage/useRunState.ts` (the library line)
- Test: `packages/engine/lab-i18n.test.ts`, `apps/lab/src/palette/commands.test.ts`, `apps/lab/src/stage/RunStatusBar.browser.test.tsx`, `apps/lab/src/library/useStoredBoard.browser.test.tsx`; update `apps/lab/src/stage/BoardFrame.browser.test.tsx` (two calls) and `apps/lab/src/stage/BoardMode.browser.test.tsx` (one call)

**Interfaces:**
- Produces: `ui.boardNotStored(id: string): string` in both dictionaries; `BoardError.reason: string | null` (`null` = the store does not list the board).

- [ ] **Step 1: Write the failing tests**

In `packages/engine/lab-i18n.test.ts`, after the case `'both ui dictionaries explain a board file that cannot be read'`:

```ts
Deno.test('both ui dictionaries say a board is not in the store, naming it', () => {
  for (const d of [EN, PL]) {
    const text = d.ui.boardNotStored('25x50/sha256-abc')
    assert(text.includes('25x50/sha256-abc'), text)
  }
  assert(PL.ui.boardNotStored('x') !== EN.ui.boardNotStored('x'), 'the Polish sentence is Polish')
})
```

In `apps/lab/src/palette/commands.test.ts`, inside `describe('the catalogue', …)`:

```ts
  it('words a view flag row’s value in the page’s language', () => {
    useStore.setState((state) => ({ view: { ...state.view, rounded: true, colored: false } }))
    const rows = buildCommands({ ...deps(), dict: dictionary('pl') }, useStore.getState())
    expect(rows.find((row) => row.id === 'view-rounded')?.value).toBe(dictionary('pl').t('valueOn'))
    expect(rows.find((row) => row.id === 'view-colored')?.value).toBe(dictionary('pl').t('valueOff'))
  })
```

In `apps/lab/src/stage/RunStatusBar.browser.test.tsx`, after the case `'reports a board that could not be read, keeping a colon inside the reason'`:

```tsx
  // The lab words this one itself, so it follows the page's language.
  it('says a board is not in the store in the page’s language, and rewords it on a switch', async () => {
    useStore.getState().library.boardFailed({ name: '8x8/sha256-ab', reason: null })
    const screen = await mountBar('/boards/8x8/sha256-ab')
    const text = () => screen.getByRole('status').element().textContent
    await expect.poll(text).toBe(EN.t('boardNotStored', '8x8/sha256-ab'))
    useStore.getState().lang.setLang('pl')
    await expect.poll(text).toBe(dictionary('pl').t('boardNotStored', '8x8/sha256-ab'))
  })
```

and in that file's `beforeEach`, after `state.library.reset()`, put the language back through `setState` (not through `setLang`, the action a case uses), so a failing case cannot leave the next one in Polish:

```tsx
  useStore.setState((s) => ({ lang: { ...s.lang, lang: 'en' } }))
```

In `apps/lab/src/library/useStoredBoard.browser.test.tsx`, in the case `'an id the listing does not hold is reported, and clears what was shown'`, replace `await expect.poll(() => useStore.getState().library.boardError?.reason).toBe('not in the store')` with:

```tsx
  await expect.poll(() => useStore.getState().library.boardError).toEqual({ name: '8x8/sha256-0', reason: null })
```

- [ ] **Step 2: Run them and see them fail**

Run: `deno test --allow-read packages/engine/lab-i18n.test.ts`
Expected: FAIL at type check (`TS2339: Property 'boardNotStored' does not exist`).

Run (from `apps/lab`): `pnpm vitest run --project node src/palette/commands.test.ts`
Expected: `'words a view flag row’s value…'` FAILS on the first `toBe` (`'on'` against `'wł.'`).

Run: `pnpm vitest run --project chromium src/stage/RunStatusBar.browser.test.tsx src/library/useStoredBoard.browser.test.tsx`
Expected: the new `RunStatusBar` case FAILS on its first poll (the text reads "… cannot be read: null" or the key is missing from `dist`), and the `useStoredBoard` case FAILS on `toEqual` (`reason: 'not in the store'`).

- [ ] **Step 3: Implement the dictionary**

In `packages/engine/lab-i18n.ts`, in the EN `ui`, directly after `boardFileError: …`:

```ts
    boardNotStored: (id: string) => `Board ${id} is not in the store`,
```

and in the PL `ui`, directly after `boardFileError: …`:

```ts
    boardNotStored: (id) => `Planszy ${id} nie ma w magazynie`,
```

Run: `deno test --allow-read packages/engine/lab-i18n.test.ts` — PASS. Then `pnpm nx build engine --skip-nx-cache && grep -c boardNotStored packages/engine/dist/lab-i18n.js` (expect ≥ 1).

- [ ] **Step 4: Implement the lab**

`apps/lab/src/palette/commands.ts`, in the `VIEW_FLAGS` loop, replace `value: state.view[flag.flag] ? 'on' : 'off',` with:

```ts
      value: deps.dict.t(state.view[flag.flag] ? 'valueOn' : 'valueOff'),
```

`apps/lab/src/state/library.slice.ts`, in `interface BoardError`, replace the `reason` field and its comment with:

```ts
  /** The failure as it came (a status line, a decoder's message), or `null`: the store does not list the board. */
  reason: string | null
```

`apps/lab/src/library/useStoredBoard.ts`, replace `useStore.getState().library.boardFailed({ name: \`${size}/${id}\`, reason: 'not in the store' })` with:

```ts
        useStore.getState().library.boardFailed({ name: `${size}/${id}`, reason: null })
```

`apps/lab/src/stage/useRunState.ts`, replace the line `? { text: dict.t('boardFileError', boardError.name, boardError.reason), bad: true }` with:

```ts
        ? {
            // Worded here, not stored: a language switch must reword it.
            text:
              boardError.reason === null
                ? dict.t('boardNotStored', boardError.name)
                : dict.t('boardFileError', boardError.name, boardError.reason),
            bad: true,
          }
```

In `apps/lab/src/stage/BoardFrame.browser.test.tsx` (two calls) and `apps/lab/src/stage/BoardMode.browser.test.tsx` (one call), replace `reason: 'not in the store'` with `reason: null`; those cases need only the error state.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run --project node src/palette/ && pnpm vitest run --project chromium src/stage/ src/library/ src/palette/`
Expected: PASS.

- [ ] **Step 6: Mutation (undo by hand)**

In `useRunState`, change `boardError.reason === null` to `false`: the new `RunStatusBar` case FAILS on its first poll. Undo by hand. In `commands.ts`, put back `'on' : 'off'`: the palette case FAILS. Undo by hand; run Step 5: PASS.

- [ ] **Step 7: Gate and commit**

Run: `deno task verify && pnpm nx run lab:check --skip-nx-cache && pnpm nx run lab:lint --skip-nx-cache && (cd apps/lab && npx prettier --write src) && pnpm nx run lab:fmt --skip-nx-cache`

```bash
git add packages/engine/lab-i18n.ts packages/engine/lab-i18n.test.ts apps/lab/src/palette/commands.ts apps/lab/src/palette/commands.test.ts apps/lab/src/state/library.slice.ts apps/lab/src/library/useStoredBoard.ts apps/lab/src/library/useStoredBoard.browser.test.tsx apps/lab/src/stage/useRunState.ts apps/lab/src/stage/RunStatusBar.browser.test.tsx apps/lab/src/stage/BoardFrame.browser.test.tsx apps/lab/src/stage/BoardMode.browser.test.tsx
git commit -m "Polish UI: palette flag values and a board missing from the store come from the dictionary"
```

---

### Task 7: Full gates, the live pass, and the review's status

**Files:**
- Modify: `lab-review.md` (section "Status after the fixes" and the "Correctness" table)

- [ ] **Step 1: Full gate in a clean worktree**

```bash
git worktree add --detach ../arrowz-correctness-gate lab/correctness
cd ../arrowz-correctness-gate && corepack enable pnpm && pnpm install
pnpm nx run-many -t verify --skip-nx-cache
```

Expected: every project green. Report the test counts. Then `cd - && git worktree remove ../arrowz-correctness-gate`.

- [ ] **Step 2: Live pass in Chrome**

Start the store (`deno task store`, port 8777) and the lab (`pnpm nx serve lab`, port 8779); if either port is taken, use the recipe in memory "Przepisy pomiarowe" (own ports with a copy of the store). Check, and write down what you saw:
1. `http://localhost:8779/no-such-page#<a link with W=44>` (copy a real link from the address bar, change `W`) opens a 44-wide board, and the address becomes `/#…` (Task 3).
2. Paste a link with a theme and a palette, press Back: the colours return to the previous entry's (Task 2).
3. Set the head height to 0, reload: it stays 0; save the board, reopen it from Saved boards: 0 (Tasks 1–2).
4. Switch to PL, open the stroke entry, type `0,35`, Enter: 0.35; open the width knob's entry, type `1,000`, Enter: nothing changes (Task 5).
5. ⌘K, click the disabled Abort row, press `g` and then Escape: no carve, the palette closes, the report drawer stays. Also drag the list's scrollbar and select text in the search box: both still work (Task 4).
6. PL, open `/boards/25x50/sha256-<64 zeros>`: the Polish sentence (Task 6).
At the end remove any device emulation, so the user sees the lab at full size.

- [ ] **Step 3: Update `lab-review.md`**

In the "Correctness" table under "Status after the fixes", change the Status cell of these rows to `fixed in <commit>` with the commit of the task that fixed it, and the Note to one line saying how:
``MEDIUM: `<Navigate>` drops the hash`` (Task 3), `MEDIUM: palette loses Escape, Tab and hotkeys off its input` (Task 4), `MEDIUM: PL decimal comma does nothing` (Task 5), `MEDIUM: link colours cannot clear the page's own` (Task 2), `MEDIUM: head height 0 lost in the hash` (Tasks 1–2: the finding covers the store's `fillView` too), `LOW: palette "on"/"off" in English` and `LOW: English reason in the PL status line` (Task 6), `LOW: unknown theme name stored` and ``LOW: `voids` not in the link`` (Task 2). Copy each row name from the table itself (`grep -n '^| ' lab-review.md`), backticks included.
In "What is still open", item 1, strike what this branch fixed and keep the rest.

```bash
git add lab-review.md
git commit -m "Lab review: the correctness fixes on lab/correctness"
```
