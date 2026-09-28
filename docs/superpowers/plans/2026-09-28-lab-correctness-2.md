# Lab correctness 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The SVG export carries the lab's colours, a view save keeps `aborted` and another board's edit, the generator never hangs after a worker failure, downloads survive a late-resolving engine, and "Load into lab" shows the loaded board.

**Architecture:** The palette assignment moves into the engine so `toSvg` and the board element colour a piece from one source; `toSvg` takes resolved colours (`paper`, `ink`, `highlight`, `palette`), and the element exposes its colour precedence as `resolveColours` for the lab to reuse. The other five fixes are local to one file each (`store.ts`, `useViewSave.ts`, `useGenerator.ts`, `download.ts`, `BoardColumn.tsx`).

**Tech Stack:** Deno 2.9 (engine, CLI), TypeScript, Lit (board element), React + Zustand (lab), Vitest with `node` and `chromium` projects, Nx + pnpm.

**Spec:** `docs/superpowers/specs/2026-09-28-lab-correctness-2-design.md`

## Global Constraints

- Everything in the repository is in English: code, comments, tests, commit messages. User-facing strings live in `packages/engine/lab-i18n.ts` in both EN and PL.
- No `any`, no non-null assertions (`!`); a type fix must never add a value-changing fallback in the engine.
- The engine files (`engine.ts`, `palette.ts`, `colors.ts`, …) know neither Deno nor the DOM; `neutral.test.ts` greps them.
- Never spread arrays proportional to the number of cells or pieces (`Math.min(...arr)`).
- Node consumers (the element, the lab) get the engine from `packages/engine/dist/`: after any engine change run `pnpm nx build engine` before running element or lab tests directly. Never import the engine's `.ts` sources from `apps/`.
- Comments say why, once, in the fewest lines; no history ("used to", "PR", "review") in code comments; cite symbols, never `file.ts:NN`. `packages/engine/comments.test.ts` guards `apps/lab/src`, `packages/board-element/src` and `packages/engine/lab-*.ts`.
- `svg-golden.test.ts` and `fingerprints.test.ts` must pass unchanged: no golden hash moves. If one moves, a default changed — stop and fix the code, never re-record.
- No attribution lines in commit messages.
- Test commands:
  - Engine and CLI (Deno): `deno test --allow-read --allow-write --allow-env --allow-run --allow-net <file>` from the repo root; full: `deno task test`.
  - Element: `cd packages/board-element && pnpm exec vitest run --project node <file>` (or `--project chromium` for `*.browser.test.ts`).
  - Lab: `cd apps/lab && pnpm exec vitest run --project node <file>` for `*.test.ts`, `--project chromium` for `*.browser.test.tsx`.
  - Before a PR: `deno task verify` and `pnpm nx run-many -t verify`.

## Review Focus

1. A theme whose highlight equals its ink (`ayu-light`: both `#5c6166`) with `top > 0`: the highlighted pieces must still be drawn — the highlight group sets no `stroke`, so a highlighted line that omits its own `stroke` attribute is invisible. Pinned in Task 2.
2. A stated colour that equals the ink (a palette entry `#232447` on default ink): the piece is drawn in the ink, as the group's default; bytes may omit the attribute, the picture must not change. Covered by Task 2's per-piece colour test using distinct colours plus the rule in Task 2 Step 3.
3. `colored` off with a custom palette set (the lab's colour switch off): the SVG must be monochrome in the ink, like the screen. Pinned in Task 2.
4. Deleting board A while board B's view edit is pending: B's edit must still be written. Pinned in Task 6.
5. "Load into lab" in the simple view with randomising on: the loaded knobs must not be redrawn. Pinned in Task 9.

---

### Task 1: The palette assignment moves into the engine

Behaviour-preserving move: `assignPalette` from `packages/board-element/src/palette.ts` to `packages/engine/palette.ts`, its tests to Deno, and the element imports it from the engine.

**Files:**
- Create: `packages/engine/palette.ts`
- Create: `packages/engine/palette.test.ts`
- Modify: `packages/engine/mod.ts` (export)
- Modify: `packages/engine/tsconfig.build.json` (`include`)
- Modify: `packages/engine/neutral.test.ts` (`NEUTRAL` list)
- Modify: `packages/board-element/src/gl-layer.ts:17` (import)
- Modify: `packages/board-element/src/mod.ts` (re-export)
- Delete: `packages/board-element/src/palette.ts`, `packages/board-element/src/palette.test.ts`

**Interfaces:**
- Produces: `assignPalette(board: BoardData, n: number): Int32Array`, exported from `@arrowz/engine` (and still from `@arrowz/board-element`).

- [ ] **Step 1: Write the Deno test (port of all six of the element's tests)**

Create `packages/engine/palette.test.ts`:

```ts
import { assert, assertEquals } from '@std/assert'
import { defaultParams, generate } from './engine.ts'
import { assignPalette } from './palette.ts'
import type { BoardData } from './types.ts'

/** Pairs of pieces whose cells touch, each pair once. */
function neighbours(board: BoardData): [number, number][] {
  const seen = new Set<string>()
  const out: [number, number][] = []
  for (let y = 0; y < board.H; y++) {
    for (let x = 0; x < board.W; x++) {
      const a = board.owner[y * board.W + x] ?? -1
      if (a < 0) continue
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        const nx = x + dx, ny = y + dy
        if (nx >= board.W || ny >= board.H) continue
        const b = board.owner[ny * board.W + nx] ?? -1
        if (b < 0 || b === a) continue
        const key = a < b ? `${a}:${b}` : `${b}:${a}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push([a, b])
      }
    }
  }
  return out
}

const board = generate({ ...defaultParams(), W: 40, H: 40, seed: 3 }).board

Deno.test('five colours leave almost no touching pair sharing one', () => {
  const assign = assignPalette(board, 5)
  const pairs = neighbours(board)
  const same = pairs.filter(([a, b]) => assign[a] === assign[b]).length
  // Measured on 300x300: 0.2%. The floor is the graph, not the rule, so this
  // asserts the rule is adjacency-aware at all — `id % n` gives 24.4% here.
  assert(same / pairs.length < 0.05, `${same} of ${pairs.length}`)
})

Deno.test('every colour carries its share, within one piece', () => {
  const n = 5
  const assign = assignPalette(board, n)
  const tally = new Array<number>(n).fill(0)
  for (const pc of board.pieces) {
    const c = assign[pc.id] ?? 0
    tally[c] = (tally[c] ?? 0) + 1
  }
  const share = board.pieces.length / n
  for (const count of tally) assert(Math.abs(count - share) <= 1, `${count} vs ${share}`)
})

Deno.test('the same board and length give the same assignment', () => {
  assertEquals([...assignPalette(board, 4)], [...assignPalette(board, 4)])
})

Deno.test('a palette of one paints every piece with it', () => {
  const assign = assignPalette(board, 1)
  for (const pc of board.pieces) assertEquals(assign[pc.id], 0)
})

// `n <= 0` is public API: the caller may hand this a theme with an empty
// palette, or an explicit 0.
Deno.test('n <= 0 leaves every piece unassigned, not thrown on', () => {
  for (const n of [0, -1]) {
    const assign = assignPalette(board, n)
    for (const pc of board.pieces) assertEquals(assign[pc.id], -1)
  }
})

Deno.test('ids a board file skipped are addressable and untouched', () => {
  const data: BoardData = {
    W: 4,
    H: 2,
    owner: new Int32Array([5, 5, -1, -1, 7, 7, -1, -1]),
    pieces: [
      { id: 5, cells: [{ x: 1, y: 0 }, { x: 0, y: 0 }], dir: 3 },
      { id: 7, cells: [{ x: 1, y: 1 }, { x: 0, y: 1 }], dir: 3 },
    ],
  }
  const assign = assignPalette(data, 2)
  assertEquals(assign.length, 8)
  assert(assign[5] !== assign[7])
  assertEquals(assign[0], -1)
})
```

Before deleting the element's `palette.test.ts`, diff its test names against this file: every one of its six must have a twin here.

- [ ] **Step 2: Run it to see it fail**

Run: `deno test --allow-read packages/engine/palette.test.ts`
Expected: FAIL — module `./palette.ts` not found.

- [ ] **Step 3: Move the module**

`git mv packages/board-element/src/palette.ts packages/engine/palette.ts`, then change its import line from `import type { BoardData } from '@arrowz/engine'` to:

```ts
import type { BoardData } from './types.ts'
```

The rest of the file (header, `adjacency`, `assignPalette`) stays byte for byte.

`git rm packages/board-element/src/palette.test.ts` (its four cases now live in `palette.test.ts` of the engine).

In `packages/engine/mod.ts`, after the `colors.ts` export line add:

```ts
// The palette assignment, for the same reason: the SVG export and the board
// element colour a piece from one assignment.
export { assignPalette } from './palette.ts'
```

In `packages/engine/tsconfig.build.json`, add `"palette.ts",` after `"colors.ts",` in `include`.

In `packages/engine/neutral.test.ts`, add `'palette.ts',` after `'colors.ts',` in `NEUTRAL`.

In `packages/board-element/src/gl-layer.ts`, replace `import { assignPalette } from './palette.ts'` with `import { assignPalette } from '@arrowz/engine'` (merge into an existing `@arrowz/engine` import line if the file has one).

In `packages/board-element/src/mod.ts`, replace `export { assignPalette } from './palette.ts'` with `export { assignPalette } from '@arrowz/engine'`.

Search for any other importer: `grep -rn "from './palette" packages/board-element/src` must print nothing.

In `packages/board-element/src/view.ts`, the `palette` field's comment says "by the assignment of palette.ts"; change it to "by the engine's `assignPalette`".

- [ ] **Step 4: Run the tests**

Run: `deno test --allow-read packages/engine/palette.test.ts packages/engine/neutral.test.ts`
Expected: PASS.

Run: `pnpm nx build engine && cd packages/board-element && pnpm exec vitest run --project node && pnpm exec vitest run --project chromium src/gl-colors.browser.test.ts src/theme.browser.test.ts && pnpm run check`
Expected: PASS (`mod.test.ts` still finds `assignPalette`; the GL colour tests draw the same colours).

Run: `node packages/engine/scripts/node-smoke.mjs`
Expected: every line `ok`.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/palette.ts packages/engine/palette.test.ts packages/engine/mod.ts packages/engine/tsconfig.build.json packages/engine/neutral.test.ts packages/board-element/src/gl-layer.ts packages/board-element/src/mod.ts packages/board-element/src/view.ts
git add -u packages/board-element/src
git commit -m "Engine: the palette assignment lives in the engine, so the SVG and the element share it"
```

---

### Task 2: `toSvg` draws the stated colours

**Files:**
- Modify: `packages/engine/types.ts:225-238` (`SvgOptions`)
- Modify: `packages/engine/engine.ts` (`toSvg`, imports at `:32`)
- Create: `packages/engine/svg-colours.test.ts`

**Interfaces:**
- Consumes: `assignPalette` from `./palette.ts` (Task 1).
- Produces: `SvgOptions.paper?: string`, `SvgOptions.ink?: string`, `SvgOptions.highlight?: string`, `SvgOptions.palette?: string[]`.

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/svg-colours.test.ts`:

```ts
import { assert, assertEquals, assertMatch, assertStringIncludes } from '@std/assert'
import { defaultParams, generate, toSvg } from './engine.ts'
import { assignPalette } from './palette.ts'

const board = generate({ ...defaultParams(), W: 12, H: 12, seed: 4 }).board

/** The `stroke` of every polyline, in drawing order; '' where the line takes the group's. */
function lineColours(svg: string): string[] {
  return [...svg.matchAll(/<polyline points="[^"]*"(?: stroke="([^"]*)")?\/>/g)].map((m) => m[1] ?? '')
}

Deno.test('paper, ink and highlight replace the fixed colours', () => {
  const svg = toSvg(board, { top: 1, paper: '#101010', ink: '#202020', highlight: '#303030' })
  assertMatch(svg, /<rect width="\d+" height="\d+" fill="#101010"\/>/)
  assertStringIncludes(svg, 'stroke="#202020" stroke-width=')
  assertStringIncludes(svg, 'stroke="#303030"')
  assertStringIncludes(svg, '<g fill="#202020">')
  for (const old of ['#f6f6fa', '#232447', '#e8467c']) assert(!svg.includes(old), old)
})

Deno.test('with colours on, each piece takes the colour assignPalette gives it', () => {
  const palette = ['#aa0000', '#00aa00', '#0000aa']
  const svg = toSvg(board, { colored: true, palette })
  const assign = assignPalette(board, palette.length)
  const expected = board.pieces.map((pc) => palette[assign[pc.id] ?? 0])
  assertEquals(lineColours(svg), expected)
})

Deno.test('with colours off, a palette is ignored and the board is drawn in the ink', () => {
  assertEquals(toSvg(board, { palette: ['#aa0000', '#00aa00'] }), toSvg(board, {}))
})

Deno.test('an empty palette keeps the golden angle', () => {
  assertEquals(toSvg(board, { colored: true, palette: [] }), toSvg(board, { colored: true }))
})

// Theme `ayu-light` has its highlight equal to its ink; the highlight group sets
// no stroke, so a highlighted line without its own would not be drawn.
Deno.test('a highlight equal to the ink still draws the highlighted pieces', () => {
  const svg = toSvg(board, { top: 1, ink: '#5c6166', highlight: '#5c6166' })
  assertMatch(svg, /stroke-linejoin="round">\n<polyline points="[^"]*" stroke="#5c6166"\/>\n<\/g>/)
})

Deno.test('a colour is escaped before it goes into an attribute', () => {
  const svg = toSvg(board, { paper: 'a"b<c&' })
  assertStringIncludes(svg, 'fill="a&quot;b&lt;c&amp;"')
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `deno test --allow-read packages/engine/svg-colours.test.ts`
Expected: FAIL — type errors on `paper`/`ink`/`highlight`/`palette` (not in `SvgOptions`).

- [ ] **Step 3: Implement**

In `packages/engine/types.ts`, inside `SvgOptions` after `rounded?: boolean`, add:

```ts
  /** The background; absent = `#f6f6fa`. Any CSS colour; escaped into the attribute. */
  paper?: string
  /** Lines and heads; absent = `#232447`. */
  ink?: string
  /** The `top` longest pieces; absent = `#e8467c`. */
  highlight?: string
  /**
   * Piece colours while `colored` is on, one per piece by `assignPalette`, as
   * the board element draws them; absent or empty keeps the golden angle.
   */
  palette?: string[]
```

In `packages/engine/engine.ts`, add below `import { hueOf } from './colors.ts'`:

```ts
import { assignPalette } from './palette.ts'
```

Above `function toSvg`, add:

```ts
/** A colour as an attribute value: a caller may pass any CSS colour, quotes included. */
const attr = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
```

In `toSvg`:

1. Replace the background line `` `<rect width="${w}" height="${h}" fill="#f6f6fa"/>`, `` with `` `<rect width="${w}" height="${h}" fill="${attr(opts.paper ?? '#f6f6fa')}"/>`, ``.
2. Replace `const INK = '#232447'` with:

```ts
  const INK = attr(opts.ink ?? '#232447')
  const HIGHLIGHT = attr(opts.highlight ?? '#e8467c')
  // Only while colours are on, as on the element.
  const palette = colored ? (opts.palette ?? []).map(attr) : []
  const assign = palette.length > 0 ? assignPalette(board, palette.length) : null
  /** A piece's own colour: its palette entry, or the golden angle when there is no palette. */
  const hue = (id: number): string => {
    if (assign === null) return hueOf(id)
    const i = assign[id] ?? -1
    return palette[i < 0 ? 0 : i % palette.length] ?? hueOf(id)
  }
```

3. In `pieces.forEach`, replace:

```ts
    const col = isLong ? '#e8467c' : colored ? hueOf(pc.id) : INK
```

with:

```ts
    const col = isLong ? HIGHLIGHT : colored ? hue(pc.id) : INK
    // A highlighted piece always states its colour: its group sets no stroke.
    const own = isLong || col !== INK
```

and in the same callback replace both `col === INK ? '' : …` tests with `!own ? '' : …`:

```ts
    const fill = own ? ` fill="${col}"` : ''
```

```ts
    const line = `<polyline points="${s.line.map(pt).join(' ')}"${own ? ` stroke="${col}"` : ''}/>`
```

The void strips keep their literal `#e8467c` (a generator diagnostic, not a board colour; `svg-golden.test.ts` asserts it).

- [ ] **Step 4: Run the tests**

Run: `deno test --allow-read packages/engine/svg-colours.test.ts packages/engine/svg-golden.test.ts packages/engine/fingerprints.test.ts`
Expected: PASS, with every golden hash unchanged.

Mutation (do it, then revert): in `toSvg` replace `const palette = colored ? (opts.palette ?? []).map(attr) : []` with `const palette: string[] = []`. Expected: `with colours on, each piece takes the colour assignPalette gives it` FAILS. Mutation 2: set `const own = col !== INK`. Expected: `a highlight equal to the ink still draws the highlighted pieces` FAILS. Revert both.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/types.ts packages/engine/engine.ts packages/engine/svg-colours.test.ts
git commit -m "Engine: toSvg draws a stated paper, ink, highlight and palette; absent fields keep today's bytes"
```

---

### Task 3: The element's colour precedence as `resolveColours`

**Files:**
- Modify: `packages/board-element/src/themes.ts`
- Modify: `packages/board-element/src/arrowz-board.ts:629-636` (`drawView`)
- Modify: `packages/board-element/src/mod.ts`
- Test: `packages/board-element/src/themes.test.ts`

**Interfaces:**
- Produces: `interface BoardColours { paper: string; ink: string; highlight: string; palette: string[] }` and `resolveColours(theme: string, stated: Partial<BoardColours>): BoardColours`, both exported from `@arrowz/board-element`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/board-element/src/themes.test.ts` (and add `resolveColours` to its import from `./themes.ts`, and `import { DEFAULT_VIEW } from './view.ts'`):

```ts
test('resolveColours: no theme and nothing stated is the element default', () => {
  expect(resolveColours('', {})).toEqual({
    paper: DEFAULT_VIEW.paper,
    ink: DEFAULT_VIEW.ink,
    highlight: DEFAULT_VIEW.highlight,
    palette: DEFAULT_VIEW.palette,
  })
})

test('resolveColours: a theme supplies all four', () => {
  const t = THEMES['gruvbox-dark']
  expect(resolveColours('gruvbox-dark', {})).toEqual({
    paper: t?.paper,
    ink: t?.ink,
    highlight: t?.highlight,
    palette: t?.palette,
  })
})

test('resolveColours: a stated colour beats the theme, field by field', () => {
  const got = resolveColours('gruvbox-dark', { ink: '#abcdef', palette: ['#112233'] })
  expect(got.ink).toBe('#abcdef')
  expect(got.palette).toEqual(['#112233'])
  expect(got.paper).toBe(THEMES['gruvbox-dark']?.paper)
})

test('resolveColours: an unknown theme name is the default, as themeOf', () => {
  expect(resolveColours('no-such-theme', {})).toEqual(resolveColours('', {}))
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/board-element && pnpm exec vitest run --project node src/themes.test.ts`
Expected: FAIL — `resolveColours` is not exported.

- [ ] **Step 3: Implement**

In `packages/board-element/src/themes.ts`, add at the top below the header comment:

```ts
import { DEFAULT_VIEW } from './view.ts'
```

and at the foot:

```ts
/** The four colours a board is drawn in. */
export interface BoardColours {
  paper: string
  ink: string
  highlight: string
  palette: string[]
}

/**
 * The colours the element draws with: its defaults, then the named theme, then
 * whatever the host stated. Stated beats named beats default, field by field;
 * the lab's SVG export resolves through this too, so the file and the screen agree.
 */
export function resolveColours(theme: string, stated: Partial<BoardColours>): BoardColours {
  const t = themeOf(theme)
  const merged: BoardColours = {
    paper: DEFAULT_VIEW.paper,
    ink: DEFAULT_VIEW.ink,
    highlight: DEFAULT_VIEW.highlight,
    palette: DEFAULT_VIEW.palette,
    ...(t === null ? {} : { paper: t.paper, ink: t.ink, highlight: t.highlight, palette: t.palette }),
    ...stated,
  }
  return { paper: merged.paper, ink: merged.ink, highlight: merged.highlight, palette: merged.palette }
}
```

The final pick is there because `stated` may be a whole `Partial<BoardView>` (the element passes its `view`), and only the four colours belong in the result.

In `packages/board-element/src/arrowz-board.ts`, replace the body of `drawView` and its comment with:

```ts
  /** The view the layer draws from; `resolveColours` owns the colour precedence. */
  private drawView(): BoardView {
    return drawableView(
      { ...DEFAULT_VIEW, ...this.view, ...resolveColours(this.theme, this.view), colored: this.colored },
      isCssColor,
    )
  }
```

and change `import { themeOf } from './themes.ts'` to `import { resolveColours } from './themes.ts'` (keep `themeOf` in the import if the file still uses it elsewhere: `grep -n themeOf packages/board-element/src/arrowz-board.ts`).

In `packages/board-element/src/mod.ts`, change the themes lines to:

```ts
export { resolveColours, themeOf, THEMES } from './themes.ts'
export type { BoardColours, BoardTheme } from './themes.ts'
```

- [ ] **Step 4: Run the tests**

Run: `cd packages/board-element && pnpm exec vitest run --project node src/themes.test.ts src/mod.test.ts && pnpm exec vitest run --project chromium src/theme.browser.test.ts src/arrowz-board.browser.test.ts && pnpm run check`
Expected: PASS — the theme browser tests prove the element draws as before.

Mutation (do it, then revert): in `resolveColours` move `...stated,` above the theme spread. Expected: `a stated colour beats the theme, field by field` FAILS.

- [ ] **Step 5: Commit**

```bash
git add packages/board-element/src/themes.ts packages/board-element/src/themes.test.ts packages/board-element/src/arrowz-board.ts packages/board-element/src/mod.ts
git commit -m "Board element: the colour precedence is resolveColours, one function the lab can call"
```

---

### Task 4: The lab exports the colours on screen, and the note goes

**Files:**
- Create: `apps/lab/src/run/exportColours.ts`
- Create: `apps/lab/src/run/exportColours.test.ts`
- Modify: `apps/lab/src/run/ExportButtons.tsx`
- Modify: `apps/lab/src/library/BoardColumn.tsx`
- Modify: `apps/lab/src/design/run.css:90-95` (drop `.fw-export-note`)
- Modify: `packages/engine/lab-i18n.ts:538`, `:1199` (drop `svgThemeNote`), `packages/engine/lab-i18n.test.ts:290`
- Test: `apps/lab/src/run/ExportButtons.browser.test.tsx`, `apps/lab/src/library/BoardColumn.browser.test.tsx`

**Interfaces:**
- Consumes: `resolveColours`, `BoardColours` from `@arrowz/board-element` (Task 3); `SvgOptions` colour fields (Task 2).
- Produces: `exportColours(view: Pick<ViewFields, 'theme' | 'palette' | 'paper' | 'ink' | 'highlightColor'>): BoardColours`.

- [ ] **Step 1: Write the failing tests**

Create `apps/lab/src/run/exportColours.test.ts`:

```ts
import { THEMES } from '@arrowz/board-element'
import { expect, test } from 'vitest'
import { VIEW_DEFAULTS } from '../state/viewSchema'
import { exportColours } from './exportColours'

test('an empty field is "not set" and lets the theme show', () => {
  const got = exportColours({ ...VIEW_DEFAULTS, theme: 'gruvbox-dark' })
  expect(got.paper).toBe(THEMES['gruvbox-dark']?.paper)
  expect(got.palette).toEqual(THEMES['gruvbox-dark']?.palette)
})

test('a set field beats the theme, and highlightColor is the highlight', () => {
  const got = exportColours({
    ...VIEW_DEFAULTS,
    theme: 'gruvbox-dark',
    ink: '#abcdef',
    highlightColor: '#0a0b0c',
    palette: ['#112233'],
  })
  expect(got.ink).toBe('#abcdef')
  expect(got.highlight).toBe('#0a0b0c')
  expect(got.palette).toEqual(['#112233'])
})
```

In `apps/lab/src/run/ExportButtons.browser.test.tsx`, replace the test `the SVG-export note appears only while a theme is chosen` (and its two comment lines above it) with:

```ts
// A real worker: the file is the engine's `toSvg` over the colours on screen.
test('the SVG carries the theme and the stated colours of the board on screen', async () => {
  const initial = useStore.getState().view
  try {
    const screen = await mountButtons()
    await act(async () => finish(ONE))
    await act(async () => useStore.getState().view.apply({ theme: 'gruvbox-dark', ink: '#abcdef' }))
    await screen.getByRole('button', { name: 'Download SVG' }).click()
    await expect.poll(() => downloads.blobs.length, { timeout: 10_000 }).toBe(1)
    const svg = (await downloads.blobs[0]?.text()) ?? ''
    // gruvbox-dark's paper, and the stated ink over the theme's.
    expect(svg).toMatch(/<rect width="\d+" height="\d+" fill="#282828"\/>/)
    expect(svg).toContain('stroke="#abcdef" stroke-width=')
    expect(screen.container.querySelector('.fw-export-note')).toBeNull()
  } finally {
    useStore.setState({ view: initial })
  }
})

test('the SVG carries a custom palette while colours are on', async () => {
  const initial = useStore.getState().view
  try {
    const screen = await mountButtons()
    await act(async () => finish(ONE))
    await act(async () => useStore.getState().view.apply({ palette: ['#112233'], colored: true }))
    await screen.getByRole('button', { name: 'Download SVG' }).click()
    await expect.poll(() => downloads.blobs.length, { timeout: 10_000 }).toBe(1)
    expect((await downloads.blobs[0]?.text()) ?? '').toContain('stroke="#112233"')
  } finally {
    useStore.setState({ view: initial })
  }
})
```

In `apps/lab/src/library/BoardColumn.browser.test.tsx`, add after the test `the board file downloads the stored file under its id` (read that test first and reuse its download spying the same way; if it spies with a helper, use the helper):

```ts
test('the stored board’s SVG carries the page’s theme', async () => {
  const initial = useStore.getState().view
  const blobs: Blob[] = []
  vi.spyOn(URL, 'createObjectURL').mockImplementation((object) => {
    if (object instanceof Blob) blobs.push(object)
    return 'blob:column-under-test'
  })
  const cancel = (event: MouseEvent) => {
    if (event.target instanceof HTMLAnchorElement && event.target.download !== '') event.preventDefault()
  }
  document.addEventListener('click', cancel, true)
  try {
    useStore.getState().view.apply({ theme: 'gruvbox-dark' })
    const screen = await mountDetail()
    await show()
    // No `…` to open: this mount is outside the M/S bar, where `.fw-more` is `display: none`
    // and the exports sit in the column.
    await userEvent.click(screen.getByRole('button', { name: 'Download SVG' }))
    await expect.poll(() => blobs.length, { timeout: 10_000 }).toBe(1)
    expect((await blobs[0]?.text()) ?? '').toMatch(/<rect width="\d+" height="\d+" fill="#282828"\/>/)
  } finally {
    document.removeEventListener('click', cancel, true)
    useStore.setState({ view: initial })
  }
})

test('the stored board’s SVG carries the page’s custom palette while colours are on', async () => {
  const initial = useStore.getState().view
  const blobs: Blob[] = []
  vi.spyOn(URL, 'createObjectURL').mockImplementation((object) => {
    if (object instanceof Blob) blobs.push(object)
    return 'blob:column-under-test'
  })
  const cancel = (event: MouseEvent) => {
    if (event.target instanceof HTMLAnchorElement && event.target.download !== '') event.preventDefault()
  }
  document.addEventListener('click', cancel, true)
  // The stored view decides `colored` for this export, as `BoardFrame` draws it.
  const colouredMeta = { ...stored.meta, view: { ...stored.meta.view, colored: true } }
  try {
    useStore.getState().view.apply({ palette: ['#112233'] })
    const screen = await mountDetail()
    await act(async () =>
      useStore.getState().result.showPreview({ board: decodeBoard(stored.file), file: stored.file, meta: colouredMeta }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Download SVG' }))
    await expect.poll(() => blobs.length, { timeout: 10_000 }).toBe(1)
    expect((await blobs[0]?.text()) ?? '').toContain('stroke="#112233"')
  } finally {
    document.removeEventListener('click', cancel, true)
    useStore.setState({ view: initial })
  }
})
```

In `packages/engine/lab-i18n.test.ts`, delete the line `'svgThemeNote',` from the `words` list.

- [ ] **Step 2: Run them to see them fail**

Build first: the lab resolves `@arrowz/engine` and `@arrowz/board-element` from their `dist/`, and without it the node test fails on package resolution, not on the missing module.

Run: `pnpm nx build engine && pnpm nx build board-element && cd apps/lab && pnpm exec vitest run --project node src/run/exportColours.test.ts`
Expected: FAIL — `./exportColours` not found.

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/run/ExportButtons.browser.test.tsx src/library/BoardColumn.browser.test.tsx`
Expected: FAIL — the SVG has `fill="#f6f6fa"`, not `#282828`, and no `#112233`.

- [ ] **Step 3: Implement**

Create `apps/lab/src/run/exportColours.ts`:

```ts
import { type BoardColours, resolveColours } from '@arrowz/board-element'
import type { ViewFields } from '../state/viewSchema'

/**
 * The colours the board on screen is drawn in, for the SVG export. '' is "not
 * set", as in `BoardFrame`'s overrides, so the theme shows through it.
 */
export function exportColours(
  view: Pick<ViewFields, 'theme' | 'palette' | 'paper' | 'ink' | 'highlightColor'>,
): BoardColours {
  return resolveColours(view.theme, {
    ...(view.palette.length > 0 ? { palette: view.palette } : {}),
    ...(view.paper === '' ? {} : { paper: view.paper }),
    ...(view.ink === '' ? {} : { ink: view.ink }),
    ...(view.highlightColor === '' ? {} : { highlight: view.highlightColor }),
  })
}
```

In `apps/lab/src/run/ExportButtons.tsx`:
- add `import { exportColours } from './exportColours'`;
- delete `const theme = useStore((state) => state.view.theme)`;
- change the options argument to `{ ...svgOptions(viewOf(view)), voids: view.voids, ...exportColours(view) }`;
- delete the note comment and the `{theme === '' ? null : <p className="fw-export-note">…</p>}` line.

In `apps/lab/src/library/BoardColumn.tsx`:
- add `import { exportColours } from '../run/exportColours'`;
- delete `const theme = useStore((state) => state.view.theme)`;
- change the options argument in `exportSvg` to `{ ...svgOptions(meta.view), voids: meta.ok === false, ...exportColours(useStore.getState().view) }`, and extend the comment above `exportSvg` to: `// The board as it is drawn here: its own saved view, the page's colours, and its jammed cells when it did not close, as `BoardFrame` draws them.`;
- delete the note comment and the note line.

In `apps/lab/src/design/run.css`, delete the `.fw-export-note` rule and its comment line.

In `packages/engine/lab-i18n.ts`, delete the `svgThemeNote` line in the EN dictionary and in the PL dictionary.

Check nothing else reads it: `grep -rn "svgThemeNote\|fw-export-note" apps/lab/src packages --include='*.ts' --include='*.tsx' --include='*.css' | grep -v dist | grep -v '\.test\.'` must print nothing (the new ExportButtons test names `.fw-export-note` to assert it is gone).

- [ ] **Step 4: Run the tests**

Run: `deno test --allow-read packages/engine/lab-i18n.test.ts && pnpm nx build engine && cd apps/lab && pnpm exec vitest run --project node src/run/exportColours.test.ts && pnpm exec vitest run --project chromium src/run/ExportButtons.browser.test.tsx src/library/BoardColumn.browser.test.tsx && pnpm run check && pnpm run lint`
Expected: PASS.

Mutation (do it, then revert): in `ExportButtons.tsx` drop `...exportColours(view)` from the options. Expected: `the SVG carries the theme and the stated colours of the board on screen` FAILS. Same in `BoardColumn.tsx`: both `the stored board’s SVG carries the page’s theme` and `…custom palette while colours are on` FAIL.

- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/run/exportColours.ts apps/lab/src/run/exportColours.test.ts apps/lab/src/run/ExportButtons.tsx apps/lab/src/run/ExportButtons.browser.test.tsx apps/lab/src/library/BoardColumn.tsx apps/lab/src/library/BoardColumn.browser.test.tsx apps/lab/src/design/run.css packages/engine/lab-i18n.ts packages/engine/lab-i18n.test.ts
git commit -m "Lab: the SVG export carries the theme, palette, paper, ink and highlight on screen; the note goes"
```

---

### Task 5: A view save keeps `aborted`

**Files:**
- Modify: `packages/cli/store.ts:125`
- Test: `packages/cli/store.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/cli/store.test.ts`, add after `saveBoard without a closing report writes null counts, aborted false and no leftover`:

```ts
// A view edit sends no `aborted`: the run it describes was still cut short.
Deno.test('a save that does not carry aborted keeps the stored one', async () => {
  freshDir()
  await saveBoard(entry({ metrics: { ok: false, pieces: 10, maxLen: 5, genMs: 3, aborted: true } }))
  const edit = await saveBoard(entry({
    view: { ...entry().view, stroke: 0.3 },
    metrics: { ok: false, pieces: 10, maxLen: 5, genMs: null },
  }))
  assertEquals(edit.meta.aborted, true)
  assertEquals(edit.meta.sources[0]?.aborted, true)
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `deno test --allow-read --allow-write --allow-env packages/cli/store.test.ts`
Expected: FAIL — `edit.meta.aborted` is `false`.

- [ ] **Step 3: Implement**

In `packages/cli/store.ts`, in the `recipe` literal replace `aborted: metrics.aborted ?? false,` with:

```ts
    aborted: metrics.aborted ?? replaced?.aborted ?? false,
```

- [ ] **Step 4: Run the tests**

Run: `deno test --allow-read --allow-write --allow-env --allow-net --allow-run packages/cli/` (without `--allow-run` 43 CLI tests fail on spawning `deno`)
Expected: PASS, including `saveBoard without a closing report writes null counts, aborted false and no leftover` (a first save has no `replaced`).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/store.ts packages/cli/store.test.ts
git commit -m "Store: a save that does not carry aborted keeps the stored flag"
```

---

### Task 6: A pending view save is per board

**Files:**
- Modify: `apps/lab/src/library/useViewSave.ts:11-50`
- Modify: `apps/lab/src/library/BoardColumn.tsx` (`remove`: `cancelPendingSave(meta.id)`)
- Test: `apps/lab/src/library/useViewSave.browser.test.tsx`

**Interfaces:**
- Produces: `cancelPendingSave(id?: string): void` — with an id, that board's pending write; without, every one.

- [ ] **Step 1: Write the failing tests**

Append to `apps/lab/src/library/useViewSave.browser.test.tsx`:

```ts
/** The seed and stroke of every POST, in the order they were sent. */
function posted(posts: MockInstance<typeof fetch>) {
  return posts.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([, init]) => {
      const body = JSON.parse(String(init?.body)) as { params: { seed: number }; view: View }
      return [body.params.seed, body.view.stroke]
    })
}

const showOther = () =>
  useStore.getState().result.showPreview({ board: decodeBoard(other.file), file: other.file, meta: other.meta })

// Same fake-timer rules as the first case in this file.
test('an edit of another board leaves the first board’s write pending', async () => {
  const posts = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  const { result } = await renderHook(() => useViewSave(() => {}), { wrapper: at })
  vi.useFakeTimers()
  await act(async () => result.current({ ...stored.meta.view, stroke: 0.8 }))
  await act(async () => showOther())
  await act(async () => result.current({ ...other.meta.view, stroke: 0.3 }))
  await act(async () => await vi.advanceTimersByTimeAsync(350))
  expect(posted(posts)).toEqual([
    [stored.meta.seed, 0.8],
    [other.meta.seed, 0.3],
  ])
})

test('cancelling one board’s save keeps another board’s', async () => {
  const posts = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  const { result } = await renderHook(() => useViewSave(() => {}), { wrapper: at })
  vi.useFakeTimers()
  await act(async () => result.current({ ...stored.meta.view, stroke: 0.8 }))
  await act(async () => showOther())
  await act(async () => result.current({ ...other.meta.view, stroke: 0.3 }))
  cancelPendingSave(stored.meta.id)
  await act(async () => await vi.advanceTimersByTimeAsync(350))
  expect(posted(posts)).toEqual([[other.meta.seed, 0.3]])
})
```

Add `type MockInstance` to the file's `vitest` import: `import { afterEach, beforeEach, expect, type MockInstance, test, vi } from 'vitest'`.

In `apps/lab/src/library/BoardColumn.browser.test.tsx`, add after `deleting cancels a view edit that has not been written yet` (and add `renderHook` to the `vitest-browser-react` import and `useViewSave` to the `./useViewSave` import):

```ts
// The delete drops the deleted board's pending save only: another board's edit
// still reaches the store.
test('deleting one board keeps another board’s pending view edit', async () => {
  const calls = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() => Promise.resolve(new Response('{"deleted":true}', { status: 200 })))
  // An edit of `other`, pending on its timer, made while `other` was on the stage.
  await act(async () =>
    useStore.getState().result.showPreview({ board: decodeBoard(other.file), file: other.file, meta: other.meta }),
  )
  const { result } = await renderHook(() => useViewSave(() => {}), {
    wrapper: ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>,
  })
  await act(async () => result.current({ ...other.meta.view, stroke: 0.3 }))

  const screen = await mountDetail()
  await show()
  await userEvent.click(screen.getByRole('button', { name: /delete from disk/i }))
  await userEvent.click(screen.getByRole('button', { name: /really delete/i }))

  // Past the debounce, so the surviving timer has fired.
  await new Promise((done) => setTimeout(done, 600))
  const seeds = calls.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([, init]) => (JSON.parse(String(init?.body)) as { params: { seed: number } }).params.seed)
  expect(seeds).toEqual([other.meta.seed])
})
```

Before running, read `apps/lab/src/api/boards.ts` `saveBoard` and confirm the POST body is the `StoreRequest` JSON (with `params` and `view` at the top level). If it is wrapped differently, adjust `posted` to read the real shape — the assertion must stay on seed and stroke.

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/library/useViewSave.browser.test.tsx`
Expected: FAIL — the first new case posts only `[other.meta.seed, 0.3]`; the second does not type-check or posts nothing for B, depending on the order.

- [ ] **Step 3: Implement**

In `apps/lab/src/library/useViewSave.ts`, replace the `timer` declaration, its comment, and `cancelPendingSave` with:

```ts
/**
 * Module scope, one per board. Not a ref: the panel is keyed on the address,
 * so choosing another board unmounts it and the timer would die with the
 * edit. Not an effect: a flushing cleanup with fresh-function dependencies
 * runs on every render, so the debounce never fires and each re-render posts
 * again. Keyed by the board's id, so an edit of one board never cancels
 * another's write.
 */
const timers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Drops a write that has not happened yet: that board's, or every one with no
 * id. The delete calls this first: the store treats a board it cannot find as
 * new, so a pending save that survived a delete would write the board back to
 * disk. Tests call it between cases, since no unmount stops a module-scope timer.
 */
export function cancelPendingSave(id?: string): void {
  if (id !== undefined) {
    clearTimeout(timers.get(id))
    timers.delete(id)
    return
  }
  for (const pending of timers.values()) clearTimeout(pending)
  timers.clear()
}
```

In `useViewSave`, replace:

```ts
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void write(refresh, edited, view)
    }, SETTLE_MS)
```

with:

```ts
    const id = edited.meta.id
    clearTimeout(timers.get(id))
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id)
        void write(refresh, edited, view)
      }, SETTLE_MS),
    )
```

In `apps/lab/src/library/BoardColumn.tsx`, in `remove`, change `cancelPendingSave()` to `cancelPendingSave(meta.id)` and its comment to: `// First: this board's view save still waiting on its timer would land after the delete and write the board back to disk.`

- [ ] **Step 4: Run the tests**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/library/useViewSave.browser.test.tsx src/library/BoardColumn.browser.test.tsx src/library/BoardPreview.browser.test.tsx && pnpm run check`
Expected: PASS, including `deleting cancels a view edit that has not been written yet` and `the store is written 350 ms after the last edit, not before` (the debounce is unchanged for one board).

Mutation (do it, then revert): key every timer by the constant `'all'` instead of `edited.meta.id`. Expected: `an edit of another board leaves the first board’s write pending` FAILS. Mutation 2: in `BoardColumn`'s `remove`, call `cancelPendingSave()` with no id. Expected: `deleting one board keeps another board’s pending view edit` FAILS (`seeds` is `[]`).

- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/library/useViewSave.ts apps/lab/src/library/useViewSave.browser.test.tsx apps/lab/src/library/BoardColumn.tsx apps/lab/src/library/BoardColumn.browser.test.tsx
git commit -m "Lab: a pending view save is per board, so another board's edit or delete does not drop it"
```

---

### Task 7: The generator ignores a stale worker and drops a failed one

**Files:**
- Modify: `apps/lab/src/worker/useGenerator.ts:36-74`
- Test: `apps/lab/src/worker/useGenerator.browser.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `apps/lab/src/worker/useGenerator.browser.test.tsx`:

```ts
/** A worker that answers only when a case makes it, and records every one made. */
class HeldWorker {
  static made: HeldWorker[] = []
  onmessage: ((event: MessageEvent<WorkerOut>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  posted = 0
  constructor() {
    HeldWorker.made.push(this)
  }
  postMessage() {
    this.posted++
  }
  terminate() {}
}

/** The hook's handle, captured once it mounts. */
async function mountHandle(): Promise<() => GeneratorHandle> {
  let handle: GeneratorHandle | null = null
  await render(
    <Harness
      drive={(g) => {
        handle = g
      }}
    />,
  )
  return () => {
    if (handle === null) throw new Error('the harness did not mount')
    return handle
  }
}

// `terminate()` empties the port's queue, but a message already queued as a
// task can still arrive; the stub keeps delivering to show the guard holds.
test('a message from a worker already replaced changes nothing', async () => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  HeldWorker.made = []
  vi.stubGlobal('Worker', HeldWorker)
  try {
    const handle = await mountHandle()
    await act(async () => {
      handle().start({ ...defaultParams(), W: 16, H: 16, seed: 5 })
      handle().abort()
      handle().start({ ...defaultParams(), W: 16, H: 16, seed: 6 })
    })
    expect(HeldWorker.made).toHaveLength(2)
    const data: WorkerOut = { type: 'error', message: 'from the old worker' }
    await act(async () => HeldWorker.made[0]?.onmessage?.(new MessageEvent('message', { data })))
    expect(useStore.getState().run.phase).toBe('running')
  } finally {
    vi.unstubAllGlobals()
  }
}, 15_000)

// A module worker whose chunk failed to load answers only `error`, never a message.
test('after a worker error the next run builds a new worker', async () => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  HeldWorker.made = []
  vi.stubGlobal('Worker', HeldWorker)
  try {
    const handle = await mountHandle()
    await act(async () => handle().start({ ...defaultParams(), W: 16, H: 16, seed: 5 }))
    await act(async () => HeldWorker.made[0]?.onerror?.(new ErrorEvent('error', { message: 'chunk 404' })))
    expect(useStore.getState().run.phase).toBe('error')
    await act(async () => handle().start({ ...defaultParams(), W: 16, H: 16, seed: 6 }))
    expect(HeldWorker.made).toHaveLength(2)
    expect(HeldWorker.made[1]?.posted).toBe(1)
  } finally {
    vi.unstubAllGlobals()
  }
}, 15_000)
```

Add `act` to the imports: `import { useEffect, act } from 'react'` (the file imports `useEffect` from `react` today).

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/worker/useGenerator.browser.test.tsx`
Expected: FAIL — the first case ends in `error`; the second makes one worker only.

- [ ] **Step 3: Implement**

In `apps/lab/src/worker/useGenerator.ts`, in `ensure`:

At the top of the `made.onmessage` handler, before `const message = event.data`, add:

```ts
      // A terminated worker's message can still be queued; it belongs to no run now.
      if (worker.current !== made) return
```

Replace the `made.onerror` handler with:

```ts
    made.onerror = (event) => {
      if (worker.current !== made) return
      // Dropped, not kept: a worker that failed to load would take the next run and never answer.
      kill()
      actions().failed(event.message)
    }
```

(`kill()` clears `busy`, so the explicit `busy.current = false` there goes.)

`ensure` now calls `kill`, so its dependency list changes from `}, [])` to `}, [kill])`; without it `react-hooks/exhaustive-deps` warns. `kill` is itself a `useCallback` with `[]`, so `ensure` keeps one identity.

- [ ] **Step 4: Run the tests**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/worker/useGenerator.browser.test.tsx src/run/useRun.browser.test.tsx && pnpm run check && pnpm run lint`
Expected: PASS.

Mutations (each alone, then revert): delete the `onmessage` guard — `a message from a worker already replaced changes nothing` FAILS; replace `kill()` in `onerror` with the old `busy.current = false` — `after a worker error the next run builds a new worker` FAILS on `toHaveLength(2)`. (Deleting `kill()` alone is not a valid mutation: `busy` then stays true, and the next `start()` kills the worker itself.)

- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/worker/useGenerator.ts apps/lab/src/worker/useGenerator.browser.test.tsx
git commit -m "Lab: the generator ignores a replaced worker and drops one that failed"
```

---

### Task 8: Downloads revoke the object URL later

**Files:**
- Modify: `apps/lab/src/run/download.ts`
- Create: `apps/lab/src/run/download.browser.test.ts`

**Interfaces:**
- Produces: `REVOKE_AFTER_MS = 40_000` exported from `download.ts`.

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/run/download.browser.test.ts`:

```ts
import { afterEach, expect, test, vi } from 'vitest'
import { downloadBlob, REVOKE_AFTER_MS } from './download'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

test('the object URL outlives the click and is released afterwards', () => {
  vi.useFakeTimers()
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download-under-test')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  // No file is written: the anchor's click is cancelled.
  const cancel = (event: MouseEvent) => event.preventDefault()
  document.addEventListener('click', cancel, true)
  try {
    downloadBlob(new Blob(['x']), 'x.txt')
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(REVOKE_AFTER_MS - 1)
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(revoke).toHaveBeenCalledWith('blob:download-under-test')
  } finally {
    document.removeEventListener('click', cancel, true)
  }
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/run/download.browser.test.ts`
Expected: FAIL — `REVOKE_AFTER_MS` is not exported.

- [ ] **Step 3: Implement**

Replace `apps/lab/src/run/download.ts` with:

```ts
/**
 * How long an object URL outlives its download. Some engines resolve the
 * download after the click returns; 40 s is FileSaver.js's delay, not measured here.
 */
export const REVOKE_AFTER_MS = 40_000

/**
 * A Blob to a named file, the way a page with no server behind it saves one;
 * shared by both exports. The anchor is in the document for the length of its
 * click, so the click is an ordinary event there; the object URL is released later.
 */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/run/download.browser.test.ts src/run/ExportButtons.browser.test.tsx src/library/BoardColumn.browser.test.tsx`
Expected: PASS.

Mutation (do it, then revert): call `URL.revokeObjectURL(url)` at once again. Expected: the new test FAILS at the first `not.toHaveBeenCalled`.

- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/run/download.ts apps/lab/src/run/download.browser.test.ts
git commit -m "Lab: a download's object URL is released after 40 s, not during the click"
```

---

### Task 9: "Load into lab" starts a run

**Files:**
- Modify: `apps/lab/src/library/BoardColumn.tsx` (props, `loadIntoLab`)
- Modify: `apps/lab/src/routes/Workspace.tsx:88`
- Test: `apps/lab/src/library/BoardColumn.browser.test.tsx`

**Interfaces:**
- Consumes: `RunControl` from `apps/lab/src/run/useRun.ts` (`start(): void`, `abort(): void`, `hold(cancel: () => void): void`).
- Produces: `BoardColumn({ control }: { control: RunControl })`.

- [ ] **Step 1: Write the failing tests**

In `apps/lab/src/library/BoardColumn.browser.test.tsx`:

1. Add `import type { RunControl } from '../run/useRun'`.
2. Above `KeyedColumn`, add:

```ts
/** A run control that records the knobs each start saw. */
function recordingControl() {
  const seeds: number[] = []
  const control: RunControl = {
    start: vi.fn(() => {
      seeds.push(useStore.getState().params.values.seed)
    }),
    abort: vi.fn(),
    hold: vi.fn(),
  }
  return { control, seeds }
}

let run = recordingControl()
```

3. Change `KeyedColumn` to pass it: `return <BoardColumn key={`${open.size ?? ''}/${open.id ?? ''}`} control={run.control} />`, and in `beforeEach` add `run = recordingControl()`.
4. Replace the test `load into lab sets the knobs and the view, goes to the lab, and starts nothing` with:

```ts
test('load into lab sets the knobs and the view, goes to the lab, and starts one run on them', async () => {
  const screen = await mountDetail()
  await show()
  const edits = useStore.getState().params.edits

  await userEvent.click(screen.getByRole('button', { name: /load into lab/i }))

  expect(useStore.getState().params.values.seed).toBe(stored.meta.params.seed)
  expect(useStore.getState().view.stroke).toBe(stored.meta.view.stroke)
  // A stored view's `top` is 0, so the highlight lands off.
  expect(useStore.getState().view.highlightLongest).toBe(false)
  // A machine write: auto-generate is not woken, the one run is the column's.
  expect(useStore.getState().params.edits).toBe(edits)
  expect(run.seeds).toEqual([stored.meta.params.seed])
  await expect.element(screen.getByTestId('address')).toHaveTextContent('/')
})

// `generate()` would draw the knobs first here (`drawIfRandom`) and run on those.
test('load into lab in the simple view with randomising on keeps the loaded knobs', async () => {
  const { ui, recipe } = useStore.getState()
  const mode = ui.mode
  const random = recipe.value.random
  ui.setMode('simple')
  recipe.setRandom(true)
  try {
    const screen = await mountDetail()
    await show()
    await userEvent.click(screen.getByRole('button', { name: /load into lab/i }))
    expect(run.seeds).toEqual([stored.meta.params.seed])
    expect(useStore.getState().params.values).toMatchObject({
      W: stored.meta.params.W,
      H: stored.meta.params.H,
      seed: stored.meta.params.seed,
    })
  } finally {
    useStore.getState().recipe.setRandom(random)
    useStore.getState().ui.setMode(mode)
  }
})
```

Before running, confirm in `apps/lab/src/state/ui.slice.ts` and `recipe.slice.ts` that `ui.mode`, `ui.setMode`, `recipe.value.random` and `recipe.setRandom` are the names (they are at the time of writing: `setMode` in `ui.slice.ts`, `setRandom` in `recipe.slice.ts:62`).

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/library/BoardColumn.browser.test.tsx`
Expected: FAIL — type error on the `control` prop, then `run.seeds` is `[]`.

- [ ] **Step 3: Implement**

In `apps/lab/src/library/BoardColumn.tsx`:
- add `import type { RunControl } from '../run/useRun'`;
- change the signature to `export function BoardColumn({ control }: { control: RunControl }): ReactElement {`;
- replace the two-line comment above `loadIntoLab` with:

```ts
  // The knobs, then the view, then one run and the lab. `start()`, not
  // `generate()`: in the simple view that would draw new knobs over these.
```

- in `loadIntoLab`, add `control.start()` on the line before `void navigate('/')`.

In `apps/lab/src/routes/Workspace.tsx`, change the `side` element to `<BoardColumn key={`${open.size ?? ''}/${open.id ?? ''}`} control={control} />`.

In `apps/lab/src/routes/Workspace.browser.test.tsx`, the test `a stored board can be opened, restyled and loaded back into the lab` pins the old rule (`expect(result.shown).toBe(labBoard)`): with a real run, `shown` becomes the loaded board. Replace its four-line comment above `const labBoard` and the final `expect(useStore.getState().result.shown).toBe(labBoard)` so the block reads:

```ts
    // Load into lab runs the loaded knobs: the lab's board is replaced by a
    // fresh run's, never by the stored file handed over as a result.
    const labBoard = useStore.getState().result.shown
    expect(labBoard).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /load into lab/i }))
    await expect.element(screen.getByRole('tab', { name: 'Lab', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect.poll(() => useStore.getState().result.shown, { timeout: 20_000 }).not.toBe(labBoard)
    const loaded = useStore.getState().result.shown
    expect(loaded?.params.seed).toBe(meta.params.seed)
    expect(loaded?.file).not.toBe(file)
```

(`meta` and `file` are that test's own names for the stored board; check them in the file before editing.)

Search for any other renderer: `grep -rn "<BoardColumn" apps/lab/src` — every one must pass `control`.

- [ ] **Step 4: Run the tests**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/library/ src/routes/ && pnpm run check && pnpm run lint`
Expected: PASS.

Mutation (do it, then revert): replace `control.start()` with `generate(control)` (import it from `../run/actions`). Expected: `load into lab in the simple view with randomising on keeps the loaded knobs` FAILS on `toMatchObject` (W/H become the recipe's 25x50; the recipe draw keeps the seed, so `run.seeds` alone would not catch it). Mutation 2: delete `control.start()`. Expected: `… starts one run on them` FAILS (`run.seeds` is `[]`), and so does the Workspace test above.

- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/library/BoardColumn.tsx apps/lab/src/library/BoardColumn.browser.test.tsx apps/lab/src/routes/Workspace.tsx apps/lab/src/routes/Workspace.browser.test.tsx
git commit -m "Lab: Load into lab starts one run on the loaded knobs, so the loaded board shows without a reload"
```

---

### Task 10: The review file, the other engines, the gates, the live pass

**Files:**
- Modify: `lab-review.md` ("What is still open", the parity table row "SVG with theme / palette / paper / ink / points", and the Correctness findings' status)

- [ ] **Step 1: Safari and Firefox download check**

Check whether Playwright has the engines: `cd apps/lab && pnpm exec playwright --version && ls ~/Library/Caches/ms-playwright/ | grep -E 'webkit|firefox'`. If either is missing, ask the user before running `pnpm exec playwright install webkit firefox` (a download of several hundred MB).

With both present, start the lab on a copy of the store (see the live pass below), then write a throwaway script outside the repo (`/tmp/svg-download-check.mjs`) that, for `webkit` and `firefox` from `playwright`: opens `http://localhost:8779/`, waits for the board, clicks the run column's "Download SVG" with `page.waitForEvent('download')` armed, and prints the suggested file name and the saved file's first 60 characters. Expected in both: `arrowz-…svg` and text starting with `<svg`. If an engine never fires the download, record that; do not rework the export in this PR.

- [ ] **Step 2: Update `lab-review.md`**

- In "What is still open", replace item 2 with: `2. **Smaller correctness items:** done on `lab/correctness-2` (the `aborted` flag, the per-board view save, the worker's stale handlers and failed load, the delayed revoke; the SVG now carries the colours instead of a note). The SVG download from the drawing worker's callback was checked in WebKit and Firefox: <result>.` — with `<result>` replaced by what Step 1 found.
- In item 4 (parity gaps), change `SVG colours (and `pad` and highlight in the SVG)` to `colour flags in the CLI and `pad` in the SVG`.
- In the status table, change the row `| Gap 7: SVG colours | open | Same as the LOW correctness finding |` to `| Gap 7: SVG colours | fixed on `lab/correctness-2` | Points and `pad` in the SVG, and CLI colour flags, remain |`.
- In the parity table row "SVG with theme / palette / paper / ink / points", add at the end of its last cell: ` Fixed on `lab/correctness-2`: `SvgOptions` carries the colours; points and `pad` remain.`
- Under each of the five Correctness findings (`Editing a stored board's view clears its aborted flag`, `A pending view save for board A is dropped`, `SVG export silently drops a custom palette`, `The generator worker's handlers`, `Downloads revoke the object URL synchronously`), add one line: `**Status:** fixed on `lab/correctness-2`.`

- [ ] **Step 3: Full gates**

Run: `deno task verify`
Expected: PASS (check, lint, fmt, test — golden SVGs and fingerprints included).

Run: `pnpm nx run-many -t verify --skip-nx-cache`
Expected: every project PASS.

- [ ] **Step 4: Live pass in Chrome**

Copy the store and serve the lab on it: `cp -R packages/cli/boards /tmp/arrowz-boards-copy && ARROWZ_BOARDS_DIR=/tmp/arrowz-boards-copy pnpm nx serve lab` (it starts the store itself; do not also run `deno task store`). In Chrome at `http://localhost:8779/`:
1. Choose the theme `gruvbox-dark`, download the SVG, open it: dark paper, the theme's ink.
2. Theme none, add a palette of three colours (colours turn on), set a dark paper, download: the three colours and the paper, matching the screen piece by piece in one corner.
3. Saved boards → open one → Load into lab: the lab shows the loaded board after the run, without F5.
4. Saved boards → edit one board's line width, click another board and edit it within a second, wait, reopen the first: its edit is there.

Record anything that differs; fix it test-first before committing.

- [ ] **Step 5: Commit**

```bash
git add lab-review.md
git commit -m "Lab review: the smaller correctness items are done; SVG colours leave the parity gaps"
```
