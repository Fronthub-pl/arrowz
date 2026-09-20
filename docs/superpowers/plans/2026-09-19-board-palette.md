# Board palette implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `<arrowz-board>` draws its pieces in colours the host chooses — an array on the view or the name of a theme that ships with the element — and re-colours without rebuilding its geometry.

**Architecture:** A pure module assigns a palette index to every piece over the board's adjacency graph (neighbours differ, usage stays even). A second pure module holds twelve themes ported from open-source editor themes. The GL layer gains a colour-only entry beside `setBoard`, so a colour change re-uploads two byte buffers instead of re-tesselating. The element merges an explicit `view` over a named theme over its own defaults, and picks the cheap path when only colours moved. The lab gets a picker; the engine gets one documentation row and nothing else.

**Tech Stack:** TypeScript, Lit 3, WebGL2, Vitest 5 (node + Chromium projects), Deno 2.9 for the engine's own tests, Nx for the workspace.

**Spec:** `docs/superpowers/specs/2026-09-19-board-palette-design.md`

## Global Constraints

- **Branch:** `board-element/palettes`, stacked on the unmerged PR #86 (`engine/one-palette`). Do not rebase onto `main`; `packages/engine/colors.ts` comes from that PR.
- **Language:** every identifier, comment, test name, commit message and document in the repository is English. Only the chat with the user is Polish.
- **No `any`, no non-null assertions.** `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on; read indexes through `at()` from `@arrowz/engine` or a local guard.
- **Never spread an array proportional to the number of cells or pieces** (`Math.min(...arr)`): it overflows the worker stack in Chrome.
- **The engine's export path is out of scope.** `toSvg`, `SvgOptions`, `View`, the board file and `svg-golden.json` must not change. The only engine edit in this plan is one row plus two descriptions in `packages/engine/lab-docs.ts`.
- **`enableColors` stays the gate.** Without it the board is monochrome whatever a theme says.
- **Node consumers read the engine from `packages/engine/dist/`.** After any engine edit run `pnpm nx build engine` before the element's tests.
- **Gates before a PR:** `deno task verify` and `pnpm nx run-many -t verify`, both green.
- **No attribution lines in commit messages.**

---

### Task 1: The palette assignment

**Files:**
- Create: `packages/board-element/src/palette.ts`
- Test: `packages/board-element/src/palette.test.ts`

**Interfaces:**
- Consumes: `BoardData`, `Piece` from `@arrowz/engine`.
- Produces: `assignPalette(board: BoardData, n: number): Int32Array` — index into a palette of `n` colours, addressed **by piece id**, so `assign[piece.id]` is the piece's colour index. Length is `maxId + 1`; ids a board file left unused hold `-1`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/board-element/src/palette.test.ts
import { expect, test } from 'vitest'
import { defaultParams, generate } from '@arrowz/engine'
import type { BoardData } from '@arrowz/engine'
import { assignPalette } from './palette.ts'

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

test('five colours leave almost no touching pair sharing one', () => {
  const assign = assignPalette(board, 5)
  const pairs = neighbours(board)
  const same = pairs.filter(([a, b]) => assign[a] === assign[b]).length
  // Measured on 300x300: 0.2%. The floor is the graph, not the rule, so this
  // asserts the rule is adjacency-aware at all — `id % n` gives 20% here.
  expect(same / pairs.length).toBeLessThan(0.05)
})

test('every colour carries its share, within one piece', () => {
  const n = 5
  const assign = assignPalette(board, n)
  const tally = new Array<number>(n).fill(0)
  for (const pc of board.pieces) {
    const c = assign[pc.id] ?? 0
    tally[c] = (tally[c] ?? 0) + 1
  }
  const share = board.pieces.length / n
  for (const count of tally) expect(Math.abs(count - share)).toBeLessThanOrEqual(1)
})

test('the same board and length give the same assignment', () => {
  expect([...assignPalette(board, 4)]).toEqual([...assignPalette(board, 4)])
})

test('a palette of one paints every piece with it', () => {
  const assign = assignPalette(board, 1)
  for (const pc of board.pieces) expect(assign[pc.id]).toBe(0)
})

test('ids a board file skipped are addressable and untouched', () => {
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
  expect(assign.length).toBe(8)
  expect(assign[5]).not.toBe(assign[7])
  expect(assign[0]).toBe(-1)
})
```

Execution note: `'every colour carries its share, within one piece'` above
originally read `tally[assign[pc.id] ?? 0] += 1`, which is TS2532 under this
repository's `noUncheckedIndexedAccess` — a read and a write through the same
computed index, with only the read guarded. It had to be rewritten to read
`tally[c]` once into a local before writing it back, which is the form shown
above and the one that shipped in `palette.test.ts`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/board-element && pnpm exec vitest run --project node src/palette.test.ts`
Expected: FAIL — cannot resolve `./palette.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/board-element/src/palette.ts
// Which palette colour each piece is drawn in. Pure and DOM-free: the board is
// a graph of pieces that touch, and a palette is a colouring of it.
//
// The assignment is over EVERY piece of the board, never over the pieces
// currently drawn. A game removes pieces, and an assignment over the drawn
// subset would repaint the whole board after each move — the failure the
// id-based hue was introduced to avoid.
import type { BoardData } from '@arrowz/engine'

/** Pieces that touch, by id. Built from the owner grid in one pass over the cells. */
function adjacency(board: BoardData): Map<number, Set<number>> {
  const { W, H, owner } = board
  const adj = new Map<number, Set<number>>()
  const link = (a: number, b: number): void => {
    let set = adj.get(a)
    if (set === undefined) {
      set = new Set<number>()
      adj.set(a, set)
    }
    set.add(b)
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = owner[y * W + x] ?? -1
      if (a < 0) continue
      const right = x + 1 < W ? owner[y * W + x + 1] ?? -1 : -1
      if (right >= 0 && right !== a) link(a, right), link(right, a)
      const down = y + 1 < H ? owner[(y + 1) * W + x] ?? -1 : -1
      if (down >= 0 && down !== a) link(a, down), link(down, a)
    }
  }
  return adj
}

/**
 * A colour index per piece id: never a neighbour's, and among the free ones the
 * least used so far. The second half is what keeps the palette even — plain
 * greedy colouring gave one colour 34% of a board and left others unused.
 */
export function assignPalette(board: BoardData, n: number): Int32Array {
  let maxId = -1
  for (const pc of board.pieces) if (pc.id > maxId) maxId = pc.id
  const assign = new Int32Array(maxId + 1).fill(-1)
  if (n <= 0) return assign
  const adj = adjacency(board)
  const tally = new Int32Array(n)
  for (const pc of board.pieces) {
    const taken = new Set<number>()
    for (const nb of adj.get(pc.id) ?? []) {
      const c = assign[nb] ?? -1
      if (c >= 0) taken.add(c)
    }
    let pick = -1
    let fewest = Infinity
    for (let c = 0; c < n; c++) {
      const used = tally[c] ?? 0
      if (!taken.has(c) && used < fewest) {
        fewest = used
        pick = c
      }
    }
    if (pick < 0) {
      // Every colour is on a neighbour: the graph is denser than the palette.
      pick = 0
      for (let c = 1; c < n; c++) if ((tally[c] ?? 0) < (tally[pick] ?? 0)) pick = c
    }
    assign[pc.id] = pick
    tally[pick] = (tally[pick] ?? 0) + 1
  }
  return assign
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/board-element && pnpm exec vitest run --project node src/palette.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Prove the adjacency assertion can fail**

Temporarily replace the body of the `pick` search with `pick = pc.id % n`, re-run, and confirm **two** tests redden, not one: "five colours leave almost no touching pair" (the assertion this step names) and "ids a board file skipped are addressable and untouched" — that test's fixture assigns with `n = 2`, and ids 5 and 7 are both odd, so `id % 2` collides them and `assign[5]` no longer differs from `assign[7]`. Restore the code.

- [ ] **Step 6: Commit**

```bash
git add packages/board-element/src/palette.ts packages/board-element/src/palette.test.ts
git commit -m "Assign palette colours over the board's adjacency graph"
```

---

### Task 2: The twelve themes

**Files:**
- Create: `packages/board-element/src/themes.ts`
- Test: `packages/board-element/src/themes.test.ts`

**Interfaces:**
- Produces: `interface BoardTheme { paper: string; ink: string; highlight: string; palette: string[]; source: string; licence: string; url: string }`, `const THEMES: Readonly<Record<string, BoardTheme>>`, `themeOf(name: string): BoardTheme | null`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/board-element/src/themes.test.ts
import { expect, test } from 'vitest'
import { THEMES, themeOf } from './themes.ts'

const srgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
function luminance(hex: string): number {
  const [r, g, b] = srgb(hex).map(lin)
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

test('twelve themes, six of them light', () => {
  expect(Object.keys(THEMES)).toHaveLength(12)
  const light = Object.values(THEMES).filter((t) => luminance(t.paper) > 0.5)
  expect(light).toHaveLength(6)
})

test('every colour is a six-digit hex, so nothing needs parsing to compare', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    for (const c of [t.paper, t.ink, t.highlight, ...t.palette]) {
      expect(c, `${name}: ${c}`).toMatch(/^#[0-9a-f]{6}$/)
    }
  }
})

test('every arrow colour clears 3:1 against its own paper', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    for (const c of t.palette) expect(contrast(c, t.paper), `${name} ${c}`).toBeGreaterThanOrEqual(3)
  }
})

test('every ink clears 4.5:1, because a monochrome board is all ink', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    expect(contrast(t.ink, t.paper), name).toBeGreaterThanOrEqual(4.5)
  }
})

test('the highlight is readable and is never one of the arrow colours', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    expect(contrast(t.highlight, t.paper), name).toBeGreaterThanOrEqual(3)
    expect(t.palette, name).not.toContain(t.highlight)
  }
})

test('every theme names where it came from and under what licence', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    expect(t.source, name).not.toBe('')
    expect(t.licence, name).toMatch(/MIT|ISC|Apache-2\.0/)
    expect(t.url, name).toMatch(/^https:\/\//)
  }
})

test('themeOf takes a name and refuses anything else', () => {
  expect(themeOf('gruvbox-dark')?.paper).toBe('#282828')
  expect(themeOf('no-such-theme')).toBeNull()
  expect(themeOf('')).toBeNull()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/board-element && pnpm exec vitest run --project node src/themes.test.ts`
Expected: FAIL — cannot resolve `./themes.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/board-element/src/themes.ts
// Themes ported from open-source editor themes. Each project ships a light and
// a dark variant authored together, so no half is invented here.
//
// Per theme: paper and ink are the project's own background and foreground; an
// accent becomes an arrow colour only above 3:1 against that paper (WCAG 1.4.11
// for graphical objects — a stroke half a cell wide is one); the highlight is
// reserved before the arrows are chosen, so the marker for the longest pieces
// can never be an ordinary colour. `everforest-light` and `ayu-light` carry one
// arrow colour: their accents are built for thin glyphs on near-white paper and
// only one of each clears the floor. See the design doc, §5.

export interface BoardTheme {
  paper: string
  ink: string
  highlight: string
  /** Arrow colours; may be a single colour, which paints a monochrome board. */
  palette: string[]
  /** The upstream project these values come from. */
  source: string
  licence: string
  url: string
}

const CATPPUCCIN = { source: 'Catppuccin', licence: 'MIT', url: 'https://github.com/catppuccin/catppuccin' }
const GRUVBOX = { source: 'gruvbox', licence: 'MIT', url: 'https://github.com/morhetz/gruvbox' }
const TOKYONIGHT = { source: 'Tokyo Night', licence: 'Apache-2.0', url: 'https://github.com/folke/tokyonight.nvim' }
const EVERFOREST = { source: 'Everforest', licence: 'MIT', url: 'https://github.com/sainnhe/everforest' }
const ROSE_PINE = { source: 'Rosé Pine', licence: 'MIT', url: 'https://github.com/rose-pine/rose-pine-theme' }
const AYU = { source: 'Ayu', licence: 'MIT', url: 'https://github.com/ayu-theme/ayu-colors' }

export const THEMES: Readonly<Record<string, BoardTheme>> = {
  'catppuccin-mocha': {
    paper: '#1e1e2e',
    ink: '#cdd6f4',
    highlight: '#a6e3a1',
    palette: ['#f5e0dc', '#cba6f7', '#f38ba8', '#89dceb', '#fab387'],
    ...CATPPUCCIN,
  },
  'gruvbox-dark': {
    paper: '#282828',
    ink: '#ebdbb2',
    highlight: '#d3869b',
    palette: ['#fabd2f', '#83a598', '#fb4934', '#fe8019', '#8ec07c'],
    ...GRUVBOX,
  },
  'tokyonight-storm': {
    paper: '#24283b',
    ink: '#c0caf5',
    highlight: '#1abc9c',
    palette: ['#7dcfff', '#ff9e64', '#9ece6a', '#9d7cd8', '#f7768e'],
    ...TOKYONIGHT,
  },
  'everforest-dark': {
    paper: '#2d353b',
    ink: '#d3c6aa',
    highlight: '#d699b6',
    palette: ['#dbbc7f', '#7fbbb3', '#e67e80', '#a7c080', '#e69875'],
    ...EVERFOREST,
  },
  'rose-pine-moon': {
    paper: '#232136',
    ink: '#e0def4',
    highlight: '#c4a7e7',
    palette: ['#f6c177', '#3e8fb0', '#eb6f92', '#9ccfd8', '#ea9a97'],
    ...ROSE_PINE,
  },
  'ayu-dark': {
    paper: '#10141c',
    ink: '#bfbdb6',
    highlight: '#aad94c',
    palette: ['#95e6cb', '#ff8f40', '#d2a6ff', '#59c2ff', '#f07178'],
    ...AYU,
  },
  'catppuccin-latte': {
    paper: '#eff1f5',
    ink: '#4c4f69',
    highlight: '#179299',
    palette: ['#d20f39', '#1e66f5', '#8839ef', '#e64553'],
    ...CATPPUCCIN,
  },
  'gruvbox-light': {
    paper: '#fbf1c7',
    ink: '#3c3836',
    highlight: '#8f3f71',
    palette: ['#9d0006', '#076678', '#79740e', '#427b58', '#b57614'],
    ...GRUVBOX,
  },
  'tokyonight-day': {
    paper: '#e1e2e7',
    ink: '#3760bf',
    highlight: '#f52a65',
    palette: ['#7847bd', '#b15c00', '#118c74', '#007197', '#8c6c3e'],
    ...TOKYONIGHT,
  },
  'everforest-light': {
    paper: '#fdf6e3',
    ink: '#5c6a72',
    highlight: '#3a94c5',
    palette: ['#f85552'],
    ...EVERFOREST,
  },
  'rose-pine-dawn': {
    paper: '#faf4ed',
    ink: '#464261',
    highlight: '#b4637a',
    palette: ['#286983', '#907aa9', '#56949f'],
    ...ROSE_PINE,
  },
  'ayu-light': {
    paper: '#fcfcfc',
    // This theme has no accent to spare: its highlight is the ink, which stands
    // far enough from the one arrow colour for the longest pieces to read.
    ink: '#5c6166',
    highlight: '#5c6166',
    palette: ['#a37acc'],
    ...AYU,
  },
}

/** The theme of that name, or null — an unknown name is ignored, never thrown on. */
export function themeOf(name: string): BoardTheme | null {
  return Object.hasOwn(THEMES, name) ? THEMES[name] ?? null : null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/board-element && pnpm exec vitest run --project node src/themes.test.ts`
Expected: PASS, 7 tests.

Note: `ayu-light` has `highlight === ink`, which the "never one of the arrow colours" test allows and the ink test covers.

- [ ] **Step 5: Prove the contrast gate bites**

Temporarily change `gruvbox-light`'s `#b57614` to `#f2e5bc`, re-run, and confirm the 3:1 test names that theme and colour. Restore.

- [ ] **Step 6: Commit**

```bash
git add packages/board-element/src/themes.ts packages/board-element/src/themes.test.ts
git commit -m "Ship twelve themes ported from open-source editor themes"
```

---

### Task 3: `palette` joins the view, and its validation

**Files:**
- Modify: `packages/board-element/src/view.ts:7-40`
- Modify: `packages/board-element/src/sanitize.ts:21-33`
- Test: `packages/board-element/src/sanitize.test.ts`
- Test: `packages/board-element/src/view.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces: `BoardView.palette: string[]`, `DEFAULT_VIEW.palette === []`, `drawableView` keeps only entries `isColor` accepts.

- [ ] **Step 1: Write the failing tests**

```ts
// append to packages/board-element/src/sanitize.test.ts
test('the palette keeps the colours a browser accepts and drops the rest', () => {
  const isColor = (css: string) => css === 'red' || css.startsWith('#')
  const v = drawableView({ ...DEFAULT_VIEW, palette: ['red', 'garbage', '#123456', ''] }, isColor)
  expect(v.palette).toEqual(['red', '#123456'])
})

test('a palette of nothing usable behaves as no palette at all', () => {
  const isColor = () => false
  expect(drawableView({ ...DEFAULT_VIEW, palette: ['nonsense'] }, isColor).palette).toEqual([])
})
```

```ts
// append to packages/board-element/src/view.test.ts
test('a board starts with no palette, which is the golden angle', () => {
  expect(DEFAULT_VIEW.palette).toEqual([])
})

test('boardViewOf still carries no palette: the lab sets it separately', () => {
  expect('palette' in boardViewOf(CLI_VIEW, false)).toBe(false)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/board-element && pnpm exec vitest run --project node src/sanitize.test.ts src/view.test.ts`
Expected: FAIL — `palette` is not a property of `BoardView`.

- [ ] **Step 3: Write the implementation**

In `packages/board-element/src/view.ts`, add the field to `BoardView` after `highlight`:

```ts
  ink: string
  paper: string
  highlight: string
  /**
   * Colours the pieces are drawn in when `colored` is on, one per piece by the
   * assignment of palette.ts. Empty keeps the golden angle over the piece id,
   * which is what every board drew before themes existed.
   */
  palette: string[]
```

and to `DEFAULT_VIEW` after `highlight: '#e8467c',`:

```ts
  palette: [],
```

In `packages/board-element/src/sanitize.ts`, inside the object `drawableView` returns:

```ts
    highlight: drawableColor(view.highlight, DEFAULT_VIEW.highlight, isColor),
    // Entry by entry: one unusable colour must not cost the others, and an
    // empty result is the same thing as no palette.
    palette: view.palette.filter((c) => typeof c === 'string' && isColor(c)),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/board-element && pnpm exec vitest run --project node src/sanitize.test.ts src/view.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/board-element/src/view.ts packages/board-element/src/sanitize.ts packages/board-element/src/sanitize.test.ts packages/board-element/src/view.test.ts
git commit -m "Take a palette on the view, and validate it colour by colour"
```

---

### Task 4: The scene takes its colours from a function

**Files:**
- Modify: `packages/board-element/src/tesselate.ts:437-453`
- Modify: `packages/board-element/src/gl-resources.ts:99-124`
- Test: `packages/board-element/src/tesselate.test.ts`

**Interfaces:**
- Consumes: `Scene` (`tesselate.ts:41-58`), `SceneColors` (`tesselate.ts:419-422`).
- Produces: `tesselateColors(scene: Scene, colorOf: (id: number) => readonly [number, number, number]): SceneColors`, and `GlResources.upload(scene, colored, colorOf)` taking the same function.

- [ ] **Step 1: Write the failing test**

```ts
// append to packages/board-element/src/tesselate.test.ts
test('the colour buffer carries whatever colour the caller gives a piece', () => {
  const scene = tesselateBoard(onlyPiece(BENT), DEFAULT_VIEW, NONE)
  const colors = tesselateColors(scene, () => [1, 2, 3])
  const r = scene.rangeOf(BENT.id)
  expect(r).not.toBeNull()
  const i = (r?.line.start ?? 0) * 4
  expect([colors.vertices[i], colors.vertices[i + 1], colors.vertices[i + 2]]).toEqual([1, 2, 3])
})
```

`BENT` (line 34), `NONE` (line 26) and `onlyPiece` (line 42) are the file's own
fixtures — reuse them rather than making new ones. The file's existing colour
tests at lines 306 and 459 (not 302 and 457, as an earlier draft of this plan
had it) call `tesselateColors(scene)`; they gain a second argument, `hueBytes`,
which keeps them asserting exactly what they assert today.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/board-element && pnpm exec vitest run --project node src/tesselate.test.ts`
Expected: FAIL — `tesselateColors` takes one argument.

- [ ] **Step 3: Write the implementation**

In `tesselate.ts`, change the import of `hueBytes` to a type-only import of `BoardView` if `hueBytes` becomes unused, and rewrite:

```ts
/**
 * The colour of every vertex and every disc, for the diagnostic mode. The
 * colour per piece comes in as a function: the layer decides whether that is a
 * palette entry or the golden angle, and this file stays about geometry.
 */
export function tesselateColors(
  scene: Scene,
  colorOf: (id: number) => readonly [number, number, number],
): SceneColors {
  const vertices = new Uint8Array((scene.positions.length / 2) * 4)
  const discs = new Uint8Array((scene.discs.length / FLOATS_PER_DISC) * 4)
  for (const id of scene.drawnIds()) {
    const r = scene.rangeOf(id)
    if (!r) continue
    const rgb = colorOf(id)
    paint(vertices, [r.line, r.head], rgb)
    paint(discs, [r.corners, r.tail], rgb)
  }
  return { vertices, discs }
}
```

`paint`'s third parameter becomes `readonly [number, number, number]`.

In `gl-resources.ts`, thread the function through and split the colour upload so the layer can redo it alone:

```ts
  /** The board's triangles and discs, and their colours when the view asks for them. */
  upload(scene: Scene | null, colored: boolean, colorOf: (id: number) => readonly [number, number, number]): void {
    const gl = this.gl
    if (!this.posBuffer) return
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, scene?.positions ?? new Float32Array(0), gl.DYNAMIC_DRAW)
    if (this.discBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.discBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, scene?.discs ?? new Float32Array(0), gl.DYNAMIC_DRAW)
    }
    this.uploadColors(scene, colored, colorOf)
  }

  /**
   * The colour buffers alone, over a scene already uploaded. Measured on the
   * 1000x1000 board: 23.3 ms against 184.5 ms for the rebuild `setBoard` does.
   */
  uploadColors(
    scene: Scene | null,
    colored: boolean,
    colorOf: (id: number) => readonly [number, number, number],
  ): void {
    const gl = this.gl
    // The colour buffers are the diagnostic mode's alone: a monochrome board
    // takes its colour from a uniform and allocates nothing (spec §8).
    if (!scene || !colored) return
    const colors = tesselateColors(scene, colorOf)
    this.colorBuffer ??= gl.createBuffer()
    this.discColorBuffer ??= gl.createBuffer()
    if (this.colorBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, colors.vertices, gl.STATIC_DRAW)
    }
    if (this.discColorBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.discColorBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, colors.discs, gl.STATIC_DRAW)
    }
  }
```

Execution note: there is no call at `gl-layer.ts:299` to edit — the real site
is the private `upload()` helper, which calls `this.res?.upload(...)`. There,
pass the function the layer already has: `this.res?.upload(this.scene, this.view.colored)`
becomes `this.res?.upload(this.scene, this.view.colored, (id) => this.pieceBytes(id))`
— `pieceBytes` arrives in Task 5; until then use `hueBytes`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/board-element && pnpm exec vitest run --project node src/tesselate.test.ts`
Expected: PASS, including the file's existing colour tests at lines 306 and 459, which now pass `hueBytes` explicitly.

- [ ] **Step 5: Commit**

```bash
git add packages/board-element/src/tesselate.ts packages/board-element/src/gl-resources.ts packages/board-element/src/tesselate.test.ts
git commit -m "Let the caller decide a piece's colour when the scene is painted"
```

---

### Task 5: The layer repaints without re-tesselating

**Files:**
- Modify: `packages/board-element/src/gl-layer.ts:286-302, 359-362`
- Create: `packages/board-element/src/gl-colors.browser.test.ts`

**Interfaces:**
- Consumes: `assignPalette` (Task 1), `uploadColors` (Task 4).
- Produces: `GlLayer.setColors(view: BoardView): void`, and a layer that colours pieces from `view.palette` when it has one.

- [ ] **Step 1: Write the failing test**

```ts
// packages/board-element/src/gl-colors.browser.test.ts
// The cheap path, asserted on what it does rather than on how long it takes:
// a CI runner without a GPU cannot be timed, but it can be asked whether the
// geometry was rebuilt. The counter is a test seam like `drawsForTest` and
// `hasColorsForTest` beside it — spying on the module would not work, because
// `gl-layer.ts` binds `tesselateBoard` at import.
import { expect, test } from 'vitest'
import { defaultParams, generate } from '@arrowz/engine'
import { GlLayer } from './gl-layer.ts'
import { fit } from './viewport.ts'
import { DEFAULT_VIEW } from './view.ts'

const HOST = 300
const board = generate({ ...defaultParams(), W: 20, H: 20, seed: 5 }).board
const coloured = { ...DEFAULT_VIEW, colored: true, palette: ['#ff0000', '#00ff00', '#0000ff'] }

function mounted(): GlLayer {
  const layer = new GlLayer()
  layer.canvas.style.width = `${HOST}px`
  layer.canvas.style.height = `${HOST}px`
  document.body.append(layer.canvas)
  layer.restore()
  layer.setViewport(fit({ W: board.W, H: board.H, hostWidth: HOST, hostHeight: HOST, pad: 0 }))
  return layer
}

test('setColors leaves the geometry alone', () => {
  const layer = mounted()
  layer.setBoard(board, coloured)
  const built = layer.scenesBuiltForTest
  layer.setColors({ ...coloured, palette: ['#111111', '#222222', '#333333'] })
  expect(layer.scenesBuiltForTest).toBe(built)
  expect(layer.hasColorsForTest).toBe(true)
  layer.dispose()
})

test('a rider takes its palette colour, not the golden angle', () => {
  const layer = mounted()
  layer.setBoard(board, coloured)
  const first = board.pieces[0]
  expect(first).toBeDefined()
  const rgba = layer.riderColorForTest(first?.id ?? 0, false)
  const wanted = coloured.palette.map((c) => c.toLowerCase())
  const asHex = '#' + rgba.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
  expect(wanted).toContain(asHex)
  layer.dispose()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/board-element && pnpm exec vitest run --project chromium src/gl-colors.browser.test.ts`
Expected: FAIL — `setColors` and `riderColorForTest` do not exist.

- [ ] **Step 3: Write the implementation**

In `gl-layer.ts`, add imports and two private members:

```ts
import { assignPalette } from './palette.ts'
import { hueBytes } from './view.ts'
```

```ts
  /** Colour index per piece id for the current board and palette length; empty when there is no palette. */
  private assign: Int32Array = new Int32Array(0)
  /** `view.palette` as bytes, resolved once per palette rather than per piece. */
  private paletteBytes: [number, number, number][] = []
```

A helper beside `riderColor`:

```ts
  /** A piece's colour as bytes: its palette entry, or the golden angle when there is no palette. */
  private pieceBytes(id: number): readonly [number, number, number] {
    if (this.paletteBytes.length === 0) return hueBytes(id)
    const i = this.assign[id] ?? -1
    return this.paletteBytes[i < 0 ? 0 : i % this.paletteBytes.length] ?? hueBytes(id)
  }

  /** Resolves the palette and the assignment. Cheap to call: it walks the pieces once. */
  private resolvePalette(): void {
    this.paletteBytes = this.view.palette.map((c) => {
      const [r, g, b] = rgbaOf(c)
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
    })
    this.assign = this.current && this.paletteBytes.length > 0
      ? assignPalette(this.current, this.paletteBytes.length)
      : new Int32Array(0)
  }
```

In `setBoard`, after `this.view = view` and the board assignment, call `this.resolvePalette()` before `this.upload()`, and pass the function to the resources.

Then the new entry, beside `setPoints`:

```ts
  /**
   * New colours over the scene already tesselated. The element calls this
   * instead of `setBoard` when only colours moved: ink, paper, highlight and
   * the palette. Measured on the 1000x1000 board, 23.3 ms against 184.5.
   */
  setColors(view: BoardView): void {
    this.view = view
    this.inkRgba = rgbaOf(view.ink)
    this.paperRgba = rgbaOf(view.paper)
    this.highlightRgba = rgbaOf(view.highlight)
    this.resolvePalette()
    const res = this.res
    if (res && this.scene) res.uploadColors(this.scene, view.colored, (id) => this.pieceBytes(id))
    this.schedule()
  }
```

`riderColor` takes the palette:

```ts
  private riderColor(id: number, top: boolean): Rgba {
    if (top) return this.highlightRgba
    if (!this.view.colored) return this.inkRgba
    const [r, g, b] = this.pieceBytes(id)
    return [r / 255, g / 255, b / 255, 1]
  }

  /** The rider rule, for the browser test; the private one stays private. */
  riderColorForTest(id: number, top: boolean): Rgba {
    return this.riderColor(id, top)
  }
```

Two more members, beside `drawsForTest` (`gl-layer.ts:252`), so the cheap path
can be asserted on rather than timed:

```ts
  /** How many scenes `setBoard` has tesselated; `setColors` must never move it. */
  private scenesBuilt = 0

  get scenesBuiltForTest(): number {
    return this.scenesBuilt
  }
```

with `this.scenesBuilt += 1` in `setBoard`, beside the `tesselateBoard` call.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/board-element && pnpm exec vitest run --project chromium src/gl-colors.browser.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Run the whole element suite**

Run: `cd packages/board-element && pnpm exec vitest run`
Expected: every existing test still passes (275 before this plan).

- [ ] **Step 6: Commit**

```bash
git add packages/board-element/src/gl-layer.ts packages/board-element/src/gl-colors.browser.test.ts
git commit -m "Repaint a board's colours without rebuilding its geometry"
```

---

### Task 6: The element takes a theme

**Files:**
- Modify: `packages/board-element/src/arrowz-board.ts:95-130, 414-442, 536-543`
- Test: `packages/board-element/src/theme.browser.test.ts`

**Interfaces:**
- Consumes: `THEMES`, `themeOf` (Task 2), `GlLayer.setColors` (Task 5).
- Produces: property `theme: string` with attribute `theme`, default `''`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/board-element/src/theme.browser.test.ts
import { expect, test } from 'vitest'
import { defaultParams, generate } from '@arrowz/engine'
import './mod.ts'
import type { ArrowzBoard } from './mod.ts'
import { THEMES } from './themes.ts'

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
const board = generate({ ...defaultParams(), W: 20, H: 20, seed: 5 }).board

async function mount(): Promise<ArrowzBoard> {
  const el = document.createElement('arrowz-board')
  el.style.width = '300px'
  el.style.height = '300px'
  document.body.append(el)
  await el.updateComplete
  await raf()
  await raf()
  return el
}

test('a named theme paints its own paper', async () => {
  const el = await mount()
  el.enableColors = true
  el.theme = 'gruvbox-dark'
  el.board = board
  await el.updateComplete
  await raf()
  const canvas = el.shadowRoot?.querySelector('canvas')
  const gl = canvas?.getContext('webgl2')
  expect(gl).toBeTruthy()
  const bytes = new Uint8Array(4)
  gl?.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
  // #282828 is gruvbox-dark's paper.
  expect([bytes[0], bytes[1], bytes[2]]).toEqual([0x28, 0x28, 0x28])
  el.remove()
})

test('an explicit view field beats the theme', async () => {
  const el = await mount()
  el.enableColors = true
  el.theme = 'gruvbox-dark'
  el.view = { paper: '#ff00ff' }
  el.board = board
  await el.updateComplete
  await raf()
  const canvas = el.shadowRoot?.querySelector('canvas')
  const gl = canvas?.getContext('webgl2')
  const bytes = new Uint8Array(4)
  gl?.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
  expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xff, 0x00, 0xff])
  el.remove()
})

test('an unknown theme is ignored, not thrown on', async () => {
  const el = await mount()
  el.board = board
  el.theme = 'no-such-theme'
  await el.updateComplete
  await raf()
  expect(el.pieceCount).toBe(board.pieces.length)
  el.remove()
})

test('the twelve names are the ones the element answers to', async () => {
  const el = await mount()
  el.enableColors = true
  el.board = board
  for (const name of Object.keys(THEMES)) {
    el.theme = name
    await el.updateComplete
    await raf()
    expect(el.pieceCount, name).toBe(board.pieces.length)
  }
  el.remove()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/board-element && pnpm exec vitest run --project chromium src/theme.browser.test.ts`
Expected: FAIL — `theme` is not a property.

- [ ] **Step 3: Write the implementation**

In the `properties` block, after `enableColors`:

```ts
    theme: { type: String, reflect: true },
```

and beside the other declares:

```ts
  /** Name of a built-in theme (see THEMES); '' selects none. */
  declare theme: string
```

In the constructor, beside `this.enableColors = false`:

```ts
    this.theme = ''
```

`redraw()` merges the three sources in one place:

```ts
  /** Draws the board as the session now stands. */
  private redraw(): void {
    this.layer.setBoard(this.board, this.drawView(), this.game.goneIds)
  }

  /**
   * The view the layer draws from: the element's defaults, then the named
   * theme, then whatever the host stated explicitly. Stated beats named beats
   * default, and nothing else in the file has to know themes exist.
   */
  private drawView(): BoardView {
    const t = themeOf(this.theme)
    const named = t === null
      ? {}
      : { paper: t.paper, ink: t.ink, highlight: t.highlight, palette: t.palette }
    return drawableView(
      { ...DEFAULT_VIEW, ...named, ...this.view, colored: this.colored },
      isCssColor,
    )
  }
```

In `updated()`, take the cheap path when only colours moved. Add a field
`private lastColors = ''` and replace the early-return block:

```ts
    if (
      !changed.has('board') && !changed.has('view') && !changed.has('pad') &&
      !changed.has('coloredOverride') && !changed.has('enableColors') && !changed.has('theme')
    ) return
    // Colours alone never move a vertex, and re-tesselating for them costs
    // 184.5 ms on the largest board where a repaint costs 23.3.
    const view = this.drawView()
    const colors = [view.ink, view.paper, view.highlight, view.palette.join(','), String(view.colored)].join('|')
    const onlyColors = !changed.has('board') && !changed.has('pad') &&
      this.layer.board === this.board && this.geometryKey === geometryKeyOf(view)
    if (onlyColors && colors !== this.lastColors) {
      this.lastColors = colors
      this.layer.setColors(view)
      return
    }
    this.lastColors = colors
    this.geometryKey = geometryKeyOf(view)
```

with a module-level helper beside the file's other small functions:

```ts
/** Everything about a view that moves a vertex. Two views with the same key need no new geometry. */
function geometryKeyOf(view: BoardView): string {
  return [view.stroke, view.headWidth, view.headHeight, view.rounded, view.top, view.voids].join('|')
}
```

and `private geometryKey = ''` beside `lastColors`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/board-element && pnpm exec vitest run --project chromium src/theme.browser.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Run the whole element suite**

Run: `cd packages/board-element && pnpm exec vitest run`
Expected: PASS. `docs-api.browser.test.ts` **fails** on the undocumented `theme` — that is Task 7 and is expected here; note it and continue.

- [ ] **Step 6: Commit**

```bash
git add packages/board-element/src/arrowz-board.ts packages/board-element/src/theme.browser.test.ts
git commit -m "Take a theme by name, with a stated view winning over it"
```

---

### Task 7: The documentation row the guards demand

**Files:**
- Modify: `packages/engine/lab-docs.ts:48-57` (the row), `:121-132` (English), and the Polish twin near `:188`
- Test: `packages/engine/lab-docs.test.ts` (existing), `packages/board-element/src/docs-api.browser.test.ts` (existing)

**Interfaces:**
- Consumes: the `theme` property (Task 6).
- Produces: `ELEMENT_PROPS` gains `{ key: 'theme', type: 'string', attribute: 'theme', def: "''" }`.

- [ ] **Step 1: Run the guards to see them fail**

Run: `deno test --allow-read --allow-run packages/engine/lab-docs.test.ts` and
`cd packages/board-element && pnpm exec vitest run --project chromium src/docs-api.browser.test.ts`
Expected: FAIL — the element declares a property the page does not list, and `observedAttributes` carries `theme` where the documented list does not.

- [ ] **Step 2: Write the row and both descriptions**

In `packages/engine/lab-docs.ts`, after the `enableColors` row:

```ts
  { key: 'theme', type: 'string', attribute: 'theme', def: "''" },
```

In the English `props` block:

```ts
    theme: 'Name of a built-in theme — paper, ink, highlight and the colours of the pieces. An empty name selects none, and anything stated in `view` wins over it.',
```

In the Polish twin, in the same position:

```ts
    theme: 'Nazwa wbudowanego motywu — papier, tusz, podświetlenie i kolory elementów. Pusta nazwa nie wybiera żadnego, a to, co podano w `view`, ma pierwszeństwo.',
```

- [ ] **Step 3: Run the guards to verify they pass**

Run: `pnpm nx build engine && deno test --allow-read --allow-run packages/engine/lab-docs.test.ts`
Then: `cd packages/board-element && pnpm exec vitest run --project chromium src/docs-api.browser.test.ts`
Expected: PASS. The build is required: the element reads the engine from `dist/`.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/lab-docs.ts
git commit -m "Document the theme attribute in both languages"
```

---

### Task 8: The package's public surface

**Files:**
- Modify: `packages/board-element/src/mod.ts:34-35`
- Test: `packages/board-element/src/mod.test.ts` (create)

**Interfaces:**
- Produces: `THEMES`, `themeOf`, `assignPalette` and the type `BoardTheme` exported from `@arrowz/board-element`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/board-element/src/mod.test.ts
import { expect, test } from 'vitest'
import { assignPalette, THEMES, themeOf } from './mod.ts'

test('a consumer can reach the themes and the assignment', () => {
  expect(Object.keys(THEMES)).toHaveLength(12)
  expect(themeOf('rose-pine-dawn')?.palette.length).toBe(3)
  expect(typeof assignPalette).toBe('function')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/board-element && pnpm exec vitest run --project node src/mod.test.ts`
Expected: FAIL — no such exports.

- [ ] **Step 3: Write the implementation**

In `packages/board-element/src/mod.ts`, after the `view.ts` exports:

```ts
export { THEMES, themeOf } from './themes.ts'
export type { BoardTheme } from './themes.ts'
export { assignPalette } from './palette.ts'
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/board-element && pnpm exec vitest run --project node src/mod.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/board-element/src/mod.ts packages/board-element/src/mod.test.ts
git commit -m "Publish the themes and the assignment from the package"
```

---

### Task 9: The lab picks a theme

**Files:**
- Modify: `apps/lab/src/state/view.slice.ts:4-59`
- Modify: `apps/lab/src/state/url.ts:5-17, 76-89`
- Modify: `apps/lab/src/console/ViewPanel.tsx:128-150`
- Modify: `apps/lab/src/stage/BoardFrame.tsx:41-44`
- Modify: `packages/engine/lab-i18n.ts` (both dictionaries)
- Test: `apps/lab/src/state/url.test.ts` (existing), `apps/lab/src/console/ViewPanel.browser.test.tsx` (existing)

**Interfaces:**
- Consumes: `THEMES` (Task 2), the `theme` property (Task 6).
- Produces: `ViewState.theme: string` and `setTheme(name: string)`, `HashView.theme?: string`, a `<select>` in the preview panel.

- [ ] **Step 1: Write the failing tests**

```ts
// append inside the `describe('the hash codec', …)` block of apps/lab/src/state/url.test.ts
  it('carries the chosen theme through a round trip', () => {
    const hash = encodeHash({ params: defaultParams(), view: { ...VIEW, theme: 'gruvbox-dark' }, carried: {} })
    expect(decodeHash(hash)?.view.theme).toBe('gruvbox-dark')
  })

  it('leaves the page on its own theme when a link names none', () => {
    const hash = encodeHash({ params: defaultParams(), view: VIEW, carried: {} })
    expect(decodeHash(hash)?.view.theme).toBeUndefined()
  })
```

`VIEW` is the shared fixture in `apps/lab/src/state/url.fixtures.ts`; add
`theme: undefined` to it, or the codec's existing "reads back what it wrote"
case fails on the new key.

```tsx
// append to apps/lab/src/console/ViewPanel.browser.test.tsx
test('the theme picker lists every theme and writes the store', async () => {
  const screen = await render(<ViewPanel />)
  const picker = screen.getByRole('combobox')
  await expect.element(picker).toBeInTheDocument()
  await userEvent.selectOptions(picker, 'gruvbox-dark')
  expect(useStore.getState().view.theme).toBe('gruvbox-dark')
})
```

The file's `beforeEach` puts the store back after each test; add
`view().setTheme('')` to it, since this test leaves a theme selected.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/lab && pnpm exec vitest run --project node src/state/url.test.ts` and
`pnpm exec vitest run --project chromium src/console/ViewPanel.browser.test.tsx`
Expected: FAIL — no `theme` on the view, no combobox.

- [ ] **Step 3: Write the implementation**

`view.slice.ts` — add to `ViewState` after `voids: boolean`:

```ts
  /** Name of a built-in board theme; '' draws the element's own colours. */
  theme: string
```

to the interface's methods:

```ts
  setTheme(name: string): void
```

to `createViewSlice`'s returned object:

```ts
    theme: '',
    setTheme: (name) => patch({ theme: name }),
```

`url.ts` — add to `HashView`:

```ts
  /** The board theme by name. Absent when the link predates themes. */
  theme?: string | undefined
```

and to the `view` object `decodeHash` builds:

```ts
      theme: typeof raw.theme === 'string' && raw.theme !== '' ? raw.theme : undefined,
```

`ViewPanel.tsx` — after the flag switches, a picker driven by the element's own table:

```tsx
import { THEMES } from '@arrowz/board-element'
```

```tsx
        <div className="fw-k">
          <div className="row">
            <label htmlFor="view-theme">{dict.t('themeLabel')}</label>
            <select
              id="view-theme"
              value={view.theme}
              onChange={(e) => view.setTheme(e.target.value)}
            >
              <option value="">{dict.t('themeNone')}</option>
              {Object.keys(THEMES).map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
        </div>
```

`BoardFrame.tsx` — pass the name through to the element:

```tsx
        <BoardCanvas board={board} view={elementView} interactive={false} lang={lang} enableColors theme={view.theme} />
```

`packages/engine/lab-i18n.ts` — in the English `ui` block beside `colored`:

```ts
    themeLabel: 'theme',
    themeNone: 'none (default colours)',
```

and in the Polish twin:

```ts
    themeLabel: 'motyw',
    themeNone: 'brak (kolory domyślne)',
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/lab && pnpm exec vitest run`
Expected: PASS.

- [ ] **Step 5: Both gates**

Run: `pnpm nx build engine && deno task verify` then `pnpm nx run-many -t verify`
Expected: both green.

- [ ] **Step 6: Commit**

```bash
git add apps/lab packages/engine/lab-i18n.ts
git commit -m "Pick a board theme in the lab, and carry it in the link"
```

---

## Self-review

**Spec coverage.** §3.1 → Tasks 3, 6, 8. §3.2 → Task 1. §3.3 → Tasks 4, 5. §3.4 → Task 5. §3.5 → Task 3. §4 → Task 2. §5 (provenance and the guards over the table) → Task 2. §6 → Task 9. §7 → Task 7. §8 (tests) → the test step of every task. §9 is out of scope and no task touches `toSvg`, `View`, `SvgOptions` or the board file.

**Placeholders.** None: every step carries the code or the command it asks for.

**Type consistency.** `assignPalette(board, n): Int32Array` (Task 1) is called in Task 5 only. `tesselateColors(scene, colorOf)` (Task 4) is called by `uploadColors` (Task 4) and nowhere else. `BoardTheme` (Task 2) is consumed by `drawView()` (Task 6) and re-exported in Task 8. `setColors(view)` (Task 5) is called by `updated()` (Task 6). `ViewState.theme` / `setTheme` (Task 9) match the picker's use.

**Known ordering cost.** Task 6 leaves `docs-api.browser.test.ts` red until Task 7 adds the row; the plan says so in Task 6 Step 5 rather than letting an executor think they broke something.

**What checking the files against the plan caught.** Three snippets were written
from memory of the code and would not have compiled, so they were corrected
before this plan was committed:

- `tesselate.test.ts` has no `BOARD` fixture. Its fixtures are `BENT`, `DOT`,
  `STRAIGHT`, `ZIGZAG`, `NONE` and the helper `onlyPiece`.
- `GlLayer.setViewport` takes a whole `Viewport` — `W`, `H`, `hostWidth`,
  `hostHeight`, `pad`, `cellPx`, `originX`, `originY`, `fitted` — which the
  existing browser test builds with `fit(...)` from `viewport.ts`. A literal of
  three fields does not type-check.
- The lab's codec test shares the fixture `VIEW` from `url.fixtures.ts` and is
  written with `describe`/`it`; `render` from `vitest-browser-react` returns a
  screen the queries hang off, rather than a global `page`.

The lesson is the repository's own: a plan quotes from the file, not from
recollection of it.

**What execution caught that this self-review did not.** Four more defects,
found only once the tasks were run rather than read: Task 1's balance test
had a `noUncheckedIndexedAccess` violation this plan's own snippet did not
catch (see the execution note after Task 1's test code); Task 1 Step 5's
mutation reddens two tests, not the one predicted, for a reason involving the
specific ids in the unused-ids fixture rather than the rule the step is
demonstrating; Task 4 Step 3 named a call site (`gl-layer.ts:299`) that does
not exist, the real one being the private `upload()` helper; and Task 4's two
line references to `tesselate.test.ts` were off by four lines. None of these
were the kind of error "quote from the file" alone prevents — they are about
what a test proves and where code moved between the plan being written and
the file it names, not about whether a snippet was copied correctly.
