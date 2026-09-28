# View Look Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The lab's live command reproduces the SVG the lab exports: theme, colours, point grid and margin travel through `View`, the CLI flags, the store and `toSvg`.

**Architecture:** The look's data (themes, colour defaults, pad and point bounds) moves from `packages/board-element` into a new neutral engine file `look.ts`, which the element re-exports. `View` grows nine fields; `svgOptions(view)` resolves them for `toSvg`, which learns a margin and a point grid. The CLI parser, `buildCommand`, the store's `checkView` and the lab's `viewOf` carry the new fields.

**Tech Stack:** Deno 2.9 (engine, CLI, `@std/assert`), TypeScript strict, Vite + React + Vitest browser mode (lab), Lit (board element), Nx + pnpm.

**Spec:** `docs/superpowers/specs/2026-09-28-view-look-parity-design.md`

## Global Constraints

- Everything in the repository is in English: code, comments, tests, docs, commit messages. No attribution lines in commits.
- `packages/engine/look.ts` knows neither Deno nor the DOM, and is listed in `neutral.test.ts`'s `NEUTRAL`.
- No `any`, no non-null assertions (`!`), no value-changing fallback in the engine.
- `toSvg` called without `pad` or `points` draws exactly what it draws today: `svg-golden.test.ts` and `fingerprints.test.ts` stay green with no re-recording.
- Colours are `#rrggbb` only, stored lower-case; a palette holds at most `PALETTE_CAP` = 8.
- `DEFAULT_PAD` = 4, `PAD_RANGE` = 0..16 (whole), `DEFAULT_POINT_COLOR` = `#c9c9d6`, `DEFAULT_POINT_RADIUS` = 0.06, `POINT_RADIUS_RANGE` = 0..0.5, `DEFAULT_SHOW_POINTS` = false.
- `''` in `paper`, `ink`, `highlight` means "not stated": it never overrides a theme.
- Comments follow `CLAUDE.md` "Comments": why, once, one line by default, ≤ 6 lines outside a header; no history, no `file.ts:NN`.
- Gates: `deno task test` after every engine/CLI change; `deno task verify` and `pnpm nx run-many -t verify` before the branch is done. In shell pipelines use `set -o pipefail` so a gate's exit code is not `tail`'s.

## Review Focus

1. An old stored meta (no look fields) read by the store and loaded into the lab: it must read with the defaults and "Load into lab" must set the lab to the default look, not crash or keep `undefined` fields. Pinned in Task 5 (store) and Task 6 (lab).
2. An empty stated colour under a dark theme: `svgOptions` must draw the theme's colour, not `''` and not the light default. Pinned in Task 3.
3. A mixed-case colour from the command line (`--ink=#ABCDEF`) or a POST: stored and printed lower-case, so the round trip and the lab's `hex` reader agree. Pinned in Task 4 and Task 5.
4. `--palette=` with an empty value, a trailing comma or nine colours: refused by name, never a silent empty palette. Pinned in Task 4.
5. A stored board exported from the library after the lab's look changed: the file draws the stored shape in the current look, as the preview does. Pinned in Task 6.

---

### Task 0: Workspace

**Files:** none.

- [ ] **Step 1: Install and check the base is green**

The worktree is `.claude/worktrees/view-look` on branch `engine/view-look` (spec already committed).

Run:
```bash
cd /Users/tomek/dev/arrowz/.claude/worktrees/view-look
corepack enable pnpm && pnpm install
set -o pipefail; deno task test 2>&1 | tail -3
```
Expected: `ok | N passed | 0 failed`.

---

### Task 1: `look.ts` in the engine; the element re-exports it

**Files:**
- Create: `packages/engine/look.ts`, `packages/engine/look.test.ts`
- Modify: `packages/engine/mod.ts`, `packages/engine/tsconfig.build.json` (`include`), `packages/engine/neutral.test.ts` (`NEUTRAL`), `CLAUDE.md` (the neutral-files sentence)
- Modify: `packages/board-element/src/themes.ts` (becomes a re-export), `packages/board-element/src/arrowz-board.ts` (the four `DEFAULT_*` constants), `packages/board-element/src/sanitize.ts` (the two ranges), `packages/board-element/src/view.ts` (colour defaults)
- Delete: `packages/board-element/src/themes.test.ts` (ported to `look.test.ts`)

**Interfaces:**
- Produces (all exported from `packages/engine/look.ts` and from `@arrowz/engine`):
  - `interface BoardTheme`, `interface BoardColours`, `THEMES`, `themeOf(name: string): BoardTheme | null`, `resolveColours(theme: string, stated: Partial<BoardColours>): BoardColours` — unchanged behaviour
  - `DEFAULT_COLOURS: Readonly<BoardColours>` = `{ paper: '#f6f6fa', ink: '#232447', highlight: '#e8467c', palette: [] }`
  - `DEFAULT_PAD = 4`, `DEFAULT_SHOW_POINTS = false`, `DEFAULT_POINT_COLOR = '#c9c9d6'`, `DEFAULT_POINT_RADIUS = 0.06`
  - `PAD_RANGE = { min: 0, max: 16 }`, `POINT_RADIUS_RANGE = { min: 0, max: 0.5 }`, `PALETTE_CAP = 8`
  - `isHexColour(c: unknown): c is string` — true for `#` + six hex digits, either case

- [ ] **Step 1: Port the theme tests to Deno (failing: no `look.ts` yet)**

Create `packages/engine/look.test.ts`. It is `packages/board-element/src/themes.test.ts` translated from Vitest to `@std/assert`, reading from `./look.ts`, plus three new cases:

```ts
import { assert, assertEquals, assertGreaterOrEqual, assertMatch } from '@std/assert'
import { DEFAULT_COLOURS, isHexColour, PAD_RANGE, POINT_RADIUS_RANGE, resolveColours, themeOf, THEMES } from './look.ts'

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

Deno.test('twelve themes, six of them light', () => {
  assertEquals(Object.keys(THEMES).length, 12)
  assertEquals(Object.values(THEMES).filter((t) => luminance(t.paper) > 0.5).length, 6)
})

Deno.test('every colour is a six-digit hex, so nothing needs parsing to compare', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    for (const c of [t.paper, t.ink, t.highlight, ...t.palette]) assertMatch(c, /^#[0-9a-f]{6}$/, `${name}: ${c}`)
  }
})

Deno.test('every arrow colour clears 3:1 against its own paper', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    for (const c of t.palette) assertGreaterOrEqual(contrast(c, t.paper), 3, `${name} ${c}`)
  }
})

Deno.test('every ink clears 4.5:1, because a monochrome board is all ink', () => {
  for (const [name, t] of Object.entries(THEMES)) assertGreaterOrEqual(contrast(t.ink, t.paper), 4.5, name)
})

Deno.test('the highlight is readable and is never one of the arrow colours', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    assertGreaterOrEqual(contrast(t.highlight, t.paper), 3, name)
    assert(!t.palette.includes(t.highlight), name)
  }
})

Deno.test('every theme names where it came from and under what licence', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    assert(t.source !== '', name)
    assertMatch(t.licence, /^(MIT|ISC|Apache-2\.0)$/, name)
    assertMatch(t.url, /^https:\/\//, name)
  }
})

Deno.test('themeOf takes a name and refuses anything else', () => {
  assertEquals(themeOf('gruvbox-dark')?.paper, '#282828')
  assertEquals(themeOf('no-such-theme'), null)
  assertEquals(themeOf(''), null)
})

// Without `Object.hasOwn` a prototype name reads through, and resolveColours
// would spread its undefined colours over the defaults.
Deno.test('themeOf refuses a name that only Object.prototype owns', () => {
  for (const name of ['toString', 'constructor', 'hasOwnProperty']) assertEquals(themeOf(name), null, name)
})

Deno.test('resolveColours: no theme and nothing stated is the default', () => {
  assertEquals(resolveColours('', {}), { ...DEFAULT_COLOURS })
})

Deno.test('resolveColours: a theme supplies all four', () => {
  const t = THEMES['gruvbox-dark']
  assertEquals(resolveColours('gruvbox-dark', {}), {
    paper: t?.paper,
    ink: t?.ink,
    highlight: t?.highlight,
    palette: t?.palette,
  })
})

Deno.test('resolveColours: a stated colour beats the theme, field by field', () => {
  const got = resolveColours('gruvbox-dark', { ink: '#abcdef', palette: ['#112233'] })
  assertEquals(got.ink, '#abcdef')
  assertEquals(got.palette, ['#112233'])
  assertEquals(got.paper, THEMES['gruvbox-dark']?.paper)
})

Deno.test('resolveColours: an unknown theme name is the default, as themeOf', () => {
  assertEquals(resolveColours('no-such-theme', {}), resolveColours('', {}))
})

Deno.test('the defaults are the colours toSvg draws without options', () => {
  assertEquals(DEFAULT_COLOURS, { paper: '#f6f6fa', ink: '#232447', highlight: '#e8467c', palette: [] })
})

Deno.test('isHexColour takes #rrggbb in either case and nothing else', () => {
  for (const c of ['#abcdef', '#ABCDEF', '#012345']) assert(isHexColour(c), c)
  for (const c of ['', '#abc', 'abcdef', '#abcdefa', 'red', '#ghijkl', 12, null, undefined]) {
    assert(!isHexColour(c), String(c))
  }
})

Deno.test('the pad and point bounds are the element’s', () => {
  assertEquals(PAD_RANGE, { min: 0, max: 16 })
  assertEquals(POINT_RADIUS_RANGE, { min: 0, max: 0.5 })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `deno test packages/engine/look.test.ts`
Expected: FAIL, type check: `TS2307 … Cannot find module '…/look.ts'`.

- [ ] **Step 3: Create `look.ts` from the element's `themes.ts`**

```bash
cp packages/board-element/src/themes.ts packages/engine/look.ts
```

Then edit `packages/engine/look.ts`:

1. Delete the line `import { DEFAULT_VIEW } from './view.ts'` together with the blank line after it (the file imports nothing).
2. Replace the file's first comment line `// Themes ported from open-source editor themes. Each project ships a light and` with these two lines, keeping the rest of that header block as it is:
```ts
// How a board looks, shared by the SVG export, the CLI and the board element.
// Themes ported from open-source editor themes. Each project ships a light and
```
3. Move `export interface BoardColours { … }` (today below `themeOf`) above `export const THEMES`, and add after it:
```ts
/** What a board is drawn in when nothing names a colour; `toSvg` without options draws the same. */
export const DEFAULT_COLOURS: Readonly<BoardColours> = {
  paper: '#f6f6fa',
  ink: '#232447',
  highlight: '#e8467c',
  palette: [],
}

/** Cells of margin unless a view says otherwise: with none an arrowhead in an edge cell ends two hundredths of a cell from the paper's edge. */
export const DEFAULT_PAD = 4
/** The point grid is off unless a view asks for it. */
export const DEFAULT_SHOW_POINTS = false
/** The point grid's dot colour. */
export const DEFAULT_POINT_COLOR = '#c9c9d6'
/** The point grid's dot radius, in cells. */
export const DEFAULT_POINT_RADIUS = 0.06

/** The margin a view may ask for, in whole cells: a margin, not a board dimension. */
export const PAD_RANGE: Readonly<{ min: number; max: number }> = { min: 0, max: 16 }
/** A dot's radius in cells; past half a cell it overlaps its neighbours. */
export const POINT_RADIUS_RANGE: Readonly<{ min: number; max: number }> = { min: 0, max: 0.5 }
/** Arrow colours a view may state. */
export const PALETTE_CAP = 8

/** A colour as a view stores it: `#rrggbb`, which a colour input can show and a CLI can type. */
export function isHexColour(c: unknown): c is string {
  return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)
}
```
4. In `resolveColours`, replace the four `DEFAULT_VIEW.…` reads with `DEFAULT_COLOURS.paper`, `DEFAULT_COLOURS.ink`, `DEFAULT_COLOURS.highlight`, `DEFAULT_COLOURS.palette`. The function's comment says "The colours the element draws with"; change it to "The colours a board is drawn with".

- [ ] **Step 4: Export, build and neutrality lists**

`packages/engine/mod.ts`, after the `assignPalette` export:
```ts
// The look, for the same reason: the SVG export, the CLI and the element read one set of themes and bounds.
export {
  DEFAULT_COLOURS,
  DEFAULT_PAD,
  DEFAULT_POINT_COLOR,
  DEFAULT_POINT_RADIUS,
  DEFAULT_SHOW_POINTS,
  isHexColour,
  PAD_RANGE,
  PALETTE_CAP,
  POINT_RADIUS_RANGE,
  resolveColours,
  themeOf,
  THEMES,
} from './look.ts'
export type { BoardColours, BoardTheme } from './look.ts'
```
`packages/engine/tsconfig.build.json`: add `"look.ts",` after `"palette.ts",` in `include`.
`packages/engine/neutral.test.ts`: add `'look.ts',` after `'palette.ts',` in `NEUTRAL`.
`CLAUDE.md`: in "The engine (`packages/engine/engine.ts`) knows neither Deno nor the DOM, and so do `command.ts`, …", add `` `look.ts`, `` after `` `command.ts`, ``.

- [ ] **Step 5: Run the engine tests**

Run: `set -o pipefail; deno test --allow-read packages/engine/look.test.ts packages/engine/neutral.test.ts 2>&1 | tail -3`
Expected: all pass.

- [ ] **Step 6: The element reads the engine's look**

`packages/board-element/src/themes.ts` — replace the whole file with:
```ts
// The themes are the engine's (`look.ts`): the SVG export and the CLI draw from the same table.
export { resolveColours, themeOf, THEMES } from '@arrowz/engine'
export type { BoardColours, BoardTheme } from '@arrowz/engine'
```
Delete `packages/board-element/src/themes.test.ts` (`git rm`); its cases run in `look.test.ts`.

`packages/board-element/src/arrowz-board.ts` — delete the declarations and doc comments of `DEFAULT_PAD`, `DEFAULT_SHOW_POINTS`, `DEFAULT_POINT_COLOR`, `DEFAULT_POINT_RADIUS` (the block after `WHEEL_RATE`), and add below the imports:
```ts
import { DEFAULT_PAD, DEFAULT_POINT_COLOR, DEFAULT_POINT_RADIUS, DEFAULT_SHOW_POINTS } from '@arrowz/engine'
export { DEFAULT_PAD, DEFAULT_POINT_COLOR, DEFAULT_POINT_RADIUS, DEFAULT_SHOW_POINTS }
```
(`mod.ts` keeps exporting them from `./arrowz-board.ts`, so nothing else changes.)

`packages/board-element/src/sanitize.ts` — delete the `PAD_RANGE` and `POINT_RADIUS_RANGE` declarations with their doc comments, and add to the imports:
```ts
import { PAD_RANGE, POINT_RADIUS_RANGE } from '@arrowz/engine'
export { PAD_RANGE, POINT_RADIUS_RANGE }
```

`packages/board-element/src/view.ts` — import `DEFAULT_COLOURS` from `@arrowz/engine` (add it to the existing value import of `DEFAULT_HEAD_HEIGHT, DEFAULT_ROUNDED`) and in `DEFAULT_VIEW` write:
```ts
  ink: DEFAULT_COLOURS.ink,
  paper: DEFAULT_COLOURS.paper,
  highlight: DEFAULT_COLOURS.highlight,
  palette: [],
```

- [ ] **Step 7: Build and test the element**

Run:
```bash
set -o pipefail
pnpm nx build engine 2>&1 | tail -2
pnpm nx run-many -t check,test -p board-element 2>&1 | tail -5
pnpm nx run-many -t fmt,lint -p board-element 2>&1 | tail -3
deno task test 2>&1 | tail -3
```
Expected: all green. `theme.browser.test.ts` still imports `./themes.ts` and passes through the re-export.

- [ ] **Step 8: Commit**

```bash
deno fmt packages/ && deno task fmt
git add packages/engine/look.ts packages/engine/look.test.ts packages/engine/mod.ts packages/engine/tsconfig.build.json packages/engine/neutral.test.ts CLAUDE.md packages/board-element/src/themes.ts packages/board-element/src/arrowz-board.ts packages/board-element/src/sanitize.ts packages/board-element/src/view.ts
git rm -q packages/board-element/src/themes.test.ts
git commit -m "Engine: the look (themes, defaults, pad and point bounds) moves in from the element"
```

---

### Task 2: `toSvg` draws a margin and a point grid

**Files:**
- Modify: `packages/engine/types.ts` (`SvgOptions`), `packages/engine/engine.ts` (`toSvg`)
- Test: `packages/engine/svg-look.test.ts` (create)

**Interfaces:**
- Produces: `SvgOptions.pad?: number` (cells; absent = 1) and `SvgOptions.points?: { color: string; radius: number }` (absent = no dots).

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/svg-look.test.ts`:
```ts
import { assert, assertEquals, assertMatch, assertStringIncludes } from '@std/assert'
import { defaultParams, generate, toSvg } from './engine.ts'

const board = generate({ ...defaultParams(), W: 12, H: 8, seed: 4 }).board

function size(svg: string): [number, number] {
  const m = svg.match(/^<svg [^>]*width="(\d+)" height="(\d+)"/)
  return [Number(m?.[1]), Number(m?.[2])]
}

Deno.test('without pad the margin is one cell, as before', () => {
  assertEquals(size(toSvg(board, { cell: 10 })), [140, 100])
  assertEquals(toSvg(board, { cell: 10, pad: 1 }), toSvg(board, { cell: 10 }))
})

Deno.test('pad is the margin in cells on every side', () => {
  assertEquals(size(toSvg(board, { cell: 10, pad: 4 })), [200, 160])
  assertEquals(size(toSvg(board, { cell: 10, pad: 0 })), [120, 80])
  // The first piece moves with the margin: its line starts pad cells further in.
  const at = (pad: number) => toSvg(board, { cell: 10, pad }).match(/<polyline points="([\d.]+),/)?.[1]
  assertEquals(Number(at(4)) - Number(at(1)), 30)
})

Deno.test('points: one pattern and one rect over the cells alone, whatever the size', () => {
  const svg = toSvg(board, { cell: 10, pad: 2, points: { color: '#c9c9d6', radius: 0.06 } })
  assertEquals(svg.match(/<pattern /g)?.length, 1)
  assertStringIncludes(
    svg,
    '<pattern id="arrowz-points" x="20" y="20" width="10" height="10" patternUnits="userSpaceOnUse">' +
      '<circle cx="5" cy="5" r="0.6" fill="#c9c9d6"/></pattern>',
  )
  assertStringIncludes(svg, '<rect x="20" y="20" width="120" height="80" fill="url(#arrowz-points)"/>')
  const big = generate({ ...defaultParams(), W: 60, H: 60, seed: 4 }).board
  assertEquals(toSvg(big, { points: { color: '#c9c9d6', radius: 0.06 } }).match(/<pattern |<rect /g)?.length, 3)
})

Deno.test('points sit above the paper and below the pieces', () => {
  const svg = toSvg(board, { points: { color: '#c9c9d6', radius: 0.1 } })
  const paper = svg.indexOf('<rect width=')
  const dots = svg.indexOf('fill="url(#arrowz-points)"')
  const lines = svg.indexOf('<g fill="none"')
  assert(paper < dots && dots < lines, `${paper} ${dots} ${lines}`)
})

Deno.test('without points no pattern is drawn', () => {
  assert(!toSvg(board, {}).includes('<pattern'))
})

Deno.test('a point colour is escaped and a radius keeps three decimals', () => {
  const svg = toSvg(board, { cell: 7, points: { color: 'a"b', radius: 0.06 } })
  assertStringIncludes(svg, 'fill="a&quot;b"')
  assertMatch(svg, /<circle cx="3.5" cy="3.5" r="0.42" /)
})
```

- [ ] **Step 2: Run to see them fail**

Run: `deno test packages/engine/svg-look.test.ts`
Expected: FAIL (type errors on `pad` and `points`, then wrong sizes).

- [ ] **Step 3: Add the options**

`packages/engine/types.ts`, inside `interface SvgOptions`, after `palette?: string[]`:
```ts
  /** The margin in cells; absent = 1. */
  pad?: number
  /** A dot in the centre of every cell, as the element's point grid; absent draws none. */
  points?: { color: string; radius: number }
```

`packages/engine/engine.ts`, in `toSvg`:
- replace `const pad = cell` with `const pad = (opts.pad ?? 1) * cell`;
- right after the paper `<rect …/>` entry of `out` is created (the `const out: string[] = [ … ]` statement), add:
```ts
  // One pattern tile and one rect: two nodes on any board, over the cells alone.
  if (opts.points) {
    const r = Number((opts.points.radius * cell).toFixed(3))
    const half = cell / 2
    out.push(
      `<defs><pattern id="arrowz-points" x="${pad}" y="${pad}" width="${cell}" height="${cell}" patternUnits="userSpaceOnUse">` +
        `<circle cx="${half}" cy="${half}" r="${r}" fill="${attr(opts.points.color)}"/></pattern></defs>`,
      `<rect x="${pad}" y="${pad}" width="${W * cell}" height="${H * cell}" fill="url(#arrowz-points)"/>`,
    )
  }
```

- [ ] **Step 4: Run the new tests and the goldens**

Run: `set -o pipefail; deno test --allow-read packages/engine/svg-look.test.ts packages/engine/svg-golden.test.ts packages/engine/svg-colours.test.ts packages/engine/fingerprints.test.ts 2>&1 | tail -3`
Expected: all pass; `svg-golden.test.ts` unchanged proves the default bytes did not move.

- [ ] **Step 5: Commit**

```bash
deno fmt packages/ && deno task fmt
git add packages/engine/types.ts packages/engine/engine.ts packages/engine/svg-look.test.ts
git commit -m "Engine: toSvg takes a margin and draws the point grid"
```

---

### Task 3: `View` carries the look; `svgOptions` resolves it

**Files:**
- Modify: `packages/engine/types.ts` (`View`), `packages/engine/command.ts` (`DEFAULT_VIEW`, `svgOptions`, imports)
- Modify (compile fixes, found by a trial compile): `packages/engine/command.test.ts:58-78` and `:242`, `packages/cli/store.test.ts:65` and `:281`, `packages/cli/store-server.test.ts:60`, `:229`, `:341`, `packages/cli/carve.test.ts:99-110`
- Test: `packages/engine/svg-options.test.ts` (create)

**Interfaces:**
- Consumes: `resolveColours`, `DEFAULT_PAD`, `DEFAULT_SHOW_POINTS`, `DEFAULT_POINT_COLOR`, `DEFAULT_POINT_RADIUS` from `./look.ts` (Task 1); `SvgOptions.pad/points` (Task 2).
- Produces: `View` with `theme: string; palette: string[]; paper: string; ink: string; highlight: string; pad: number; showPoints: boolean; pointColor: string; pointRadius: number`; `DEFAULT_VIEW` with `theme: ''`, `palette: []`, `paper: ''`, `ink: ''`, `highlight: ''`, `pad: 4`, `showPoints: false`, `pointColor: '#c9c9d6'`, `pointRadius: 0.06`; `svgOptions(view: View): SvgOptions` returning `paper`, `ink`, `highlight`, `palette` (resolved), `pad`, and `points` when `showPoints`.

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/svg-options.test.ts`:
```ts
import { assertEquals } from '@std/assert'
import { DEFAULT_VIEW, svgOptions } from './command.ts'
import { THEMES } from './look.ts'

Deno.test('the default view draws the default colours, a margin of 4 and no points', () => {
  const o = svgOptions(DEFAULT_VIEW)
  assertEquals([o.paper, o.ink, o.highlight, o.palette], ['#f6f6fa', '#232447', '#e8467c', []])
  assertEquals(o.pad, 4)
  assertEquals(o.points, undefined)
})

Deno.test('an empty stated colour lets the theme show; a stated one beats it', () => {
  const dark = THEMES['gruvbox-dark']
  const o = svgOptions({ ...DEFAULT_VIEW, theme: 'gruvbox-dark', ink: '', paper: '#010203' })
  assertEquals(o.ink, dark?.ink)
  assertEquals(o.paper, '#010203')
  assertEquals(o.highlight, dark?.highlight)
  assertEquals(o.palette, dark?.palette)
})

Deno.test('a stated palette beats the theme’s; an empty one lets it show', () => {
  assertEquals(svgOptions({ ...DEFAULT_VIEW, theme: 'gruvbox-dark', palette: ['#112233'] }).palette, ['#112233'])
  assertEquals(svgOptions({ ...DEFAULT_VIEW, theme: 'gruvbox-dark', palette: [] }).palette, THEMES['gruvbox-dark']?.palette)
})

Deno.test('the stated highlight colour is the highlight', () => {
  assertEquals(svgOptions({ ...DEFAULT_VIEW, highlight: '#0a0b0c' }).highlight, '#0a0b0c')
})

Deno.test('points go through only while the grid is on', () => {
  const on = { ...DEFAULT_VIEW, showPoints: true, pointColor: '#070809', pointRadius: 0.15, pad: 7 }
  assertEquals(svgOptions(on).points, { color: '#070809', radius: 0.15 })
  assertEquals(svgOptions(on).pad, 7)
  assertEquals(svgOptions({ ...on, showPoints: false }).points, undefined)
})
```

- [ ] **Step 2: Run to see them fail**

Run: `deno test packages/engine/svg-options.test.ts`
Expected: FAIL, type check (`'theme' does not exist in type 'View'`).

- [ ] **Step 3: Grow `View` and `DEFAULT_VIEW`; resolve in `svgOptions`**

`packages/engine/types.ts`, `interface View` after `rounded: boolean`:
```ts
  /** A name from `THEMES`; '' is none. */
  theme: string
  /** Arrow colours while `colored` is on; empty lets the theme's palette show. */
  palette: string[]
  /** '' is "not stated": the theme, or the default, decides. */
  paper: string
  ink: string
  highlight: string
  /** Margin in whole cells. */
  pad: number
  showPoints: boolean
  pointColor: string
  /** In cells. */
  pointRadius: number
```

`packages/engine/command.ts`:
- add an import: `import { DEFAULT_PAD, DEFAULT_POINT_COLOR, DEFAULT_POINT_RADIUS, DEFAULT_SHOW_POINTS, resolveColours } from './look.ts'` and `import type { BoardColours } from './look.ts'`;
- `DEFAULT_VIEW` gains, after `rounded: DEFAULT_ROUNDED,`:
```ts
  theme: '',
  palette: [],
  paper: '',
  ink: '',
  highlight: '',
  pad: DEFAULT_PAD,
  showPoints: DEFAULT_SHOW_POINTS,
  pointColor: DEFAULT_POINT_COLOR,
  pointRadius: DEFAULT_POINT_RADIUS,
```
- `svgOptions` becomes (its header comment keeps both paragraphs; append to the first: "The look is resolved here too: the theme under the stated colours, as the element resolves it."):
```ts
export function svgOptions(view: View): SvgOptions {
  // An empty field is "not stated"; passed on, it would beat the theme.
  const stated: Partial<BoardColours> = {
    ...(view.paper === '' ? {} : { paper: view.paper }),
    ...(view.ink === '' ? {} : { ink: view.ink }),
    ...(view.highlight === '' ? {} : { highlight: view.highlight }),
    ...(view.palette.length === 0 ? {} : { palette: view.palette }),
  }
  const colours = resolveColours(view.theme, stated)
  return {
    cell: view.cell,
    colored: view.colored,
    strokeRatio: view.stroke,
    headWidth: view.headWidth,
    headHeight: view.headHeight,
    top: view.top,
    rounded: view.rounded,
    paper: colours.paper,
    ink: colours.ink,
    highlight: colours.highlight,
    palette: colours.palette,
    pad: view.pad,
    ...(view.showPoints ? { points: { color: view.pointColor, radius: view.pointRadius } } : {}),
  }
}
```

- [ ] **Step 4: Fix the literals the grown type breaks**

Each of these builds a full `View` by hand; spread `DEFAULT_VIEW` under it instead (import `DEFAULT_VIEW` from `@arrowz/engine/command` in the CLI tests where it is not imported yet):
- `packages/cli/store.test.ts:65` → `view: { ...DEFAULT_VIEW, cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0, rounded: true },`
- `packages/cli/store.test.ts:281` → the same `{ ...DEFAULT_VIEW, … }` form around its literal.
- `packages/cli/store-server.test.ts:60`, `:229`, `:341` → `{ ...DEFAULT_VIEW, …the same fields… }`.
- `packages/engine/command.test.ts:242` → `assertEquals(r.view, { ...DEFAULT_VIEW, …the same fields… })`.
- `packages/engine/command.test.ts:58-78` (round trip): `const v = { ...DEFAULT_VIEW, cell: 7, stroke: 0.4, headWidth: 0.8, headHeight: 1.2, colored: true, top: 5, rounded: true }` (the assertion on the command's tail still holds: the look is at its defaults and prints nothing yet).
- `packages/cli/carve.test.ts:99-110`: the CLI now draws through `svgOptions`, so the expected file is `toSvg(generate(params).board, svgOptions({ ...DEFAULT_VIEW, ...view }))` (import `svgOptions`), which pins the 4-cell margin the CLI now draws.

Only the three typed `saveBoard` calls in `store-server.test.ts` (and the other listed lines) change. The POST bodies (`validBody` and the literals without `rounded`, at 37, 73, 193, 257) stay as they are: they cross as `unknown`, and Task 5 relies on them carrying no look field.

Then run: `NO_COLOR=1 deno task check 2>&1 | grep -E "^ +at file" ; echo done`
Expected: `done` with no `at file` line.

- [ ] **Step 5: Run the whole engine and CLI suite**

Run: `set -o pipefail; deno task test 2>&1 | tail -3`
Expected: all pass. A failure outside the files above is a real finding: stop and report it, do not widen a test.

- [ ] **Step 6: Commit**

```bash
deno fmt packages/ && deno task fmt
git add packages/engine/types.ts packages/engine/command.ts packages/engine/svg-options.test.ts packages/engine/command.test.ts packages/cli/store.test.ts packages/cli/store-server.test.ts packages/cli/carve.test.ts
git commit -m "Engine: the view carries the look, and svgOptions resolves it"
```

---

### Task 4: The CLI reads and writes the look

**Files:**
- Modify: `packages/engine/command.ts` (`PICTURE_FLAGS`, `buildCommand`, `parseArgs`)
- Test: `packages/engine/command.test.ts`

**Interfaces:**
- Consumes: `View` look fields and `DEFAULT_VIEW` (Task 3); `THEMES`, `themeOf`, `isHexColour`, `PALETTE_CAP`, `PAD_RANGE`, `POINT_RADIUS_RANGE`, `DEFAULT_PAD`, `DEFAULT_POINT_COLOR`, `DEFAULT_POINT_RADIUS` (Task 1).
- Produces: flags `--theme=NAME`, `--palette=#a,#b,…`, `--paper=`, `--ink=`, `--highlight-color=`, `--pad=N`, `--points`, `--point-color=`, `--point-radius=R`; `buildCommand` appends them in that order after `--sharp`.

- [ ] **Step 1: Write the failing tests** (append to `packages/engine/command.test.ts`; add `THEMES` from `./look.ts` to the imports)

```ts
const LOOK = {
  theme: 'gruvbox-dark',
  palette: ['#112233', '#445566'],
  paper: '#010203',
  ink: '#040506',
  highlight: '#0a0b0c',
  pad: 7,
  showPoints: true,
  pointColor: '#070809',
  pointRadius: 0.15,
}

Deno.test('the look round-trips through the command', () => {
  const p = { ...defaultParams(), W: 30, H: 20, seed: 3 }
  const views = [
    { ...DEFAULT_VIEW, ...LOOK },
    { ...DEFAULT_VIEW, pad: 0 },
    { ...DEFAULT_VIEW, pad: 16, pointRadius: 0.5 },
    { ...DEFAULT_VIEW, showPoints: true },
    { ...DEFAULT_VIEW, pointColor: '#abcdef', showPoints: false },
    ...Object.keys(THEMES).map((theme) => ({ ...DEFAULT_VIEW, theme })),
  ]
  for (const v of views) {
    const view = { ...v, cell: exportCell(30, 20) }
    const back = parseArgs(argvOf(buildCommand(p, view)))
    assertEquals(back.errors, [], JSON.stringify(v))
    assertEquals(back.view, view)
  }
})

Deno.test('buildCommand prints the look after --sharp, in a fixed order, and nothing at the defaults', () => {
  const p = { ...defaultParams(), W: 30, H: 20, seed: 3 }
  assertEquals(buildCommand(p, DEFAULT_VIEW).includes('--pad'), false)
  const cmd = buildCommand(p, { ...DEFAULT_VIEW, ...LOOK, rounded: false })
  assertMatch(
    cmd,
    / --sharp --theme=gruvbox-dark --palette=#112233,#445566 --paper=#010203 --ink=#040506 --highlight-color=#0a0b0c --pad=7 --points --point-color=#070809 --point-radius=0.15$/,
  )
})

Deno.test('a colour flag stores lower case', () => {
  const r = parseArgs(['--width=10', '--height=10', '--ink=#ABCDEF', '--palette=#AA0000,#00bb00'])
  assertEquals(r.errors, [])
  assertEquals(r.view.ink, '#abcdef')
  assertEquals(r.view.palette, ['#aa0000', '#00bb00'])
})

Deno.test('a bad look value is refused by its flag’s name', () => {
  const cases: [string, string][] = [
    ['--theme=nope', '--theme=nope is not a theme: '],
    ['--theme', '--theme is not a theme: '],
    ['--ink=abcdef', '--ink=abcdef is not a #rrggbb colour'],
    ['--paper=#abc', '--paper=#abc is not a #rrggbb colour'],
    ['--highlight-color=red', '--highlight-color=red is not a #rrggbb colour'],
    ['--point-color=', '--point-color= is not a #rrggbb colour'],
    ['--palette=', '--palette= is not a list of #rrggbb colours'],
    ['--palette=#aa0000,', '--palette=#aa0000, is not a list of #rrggbb colours'],
    [`--palette=${Array(9).fill('#aa0000').join(',')}`, 'more than 8 colours'],
    ['--pad=17', '--pad=17 is outside 0..16'],
    ['--pad=2.5', '--pad=2.5 is not a whole number'],
    ['--pad=x', '--pad=x is not a number'],
    ['--point-radius=0.6', '--point-radius=0.6 is outside 0..0.5'],
    ['--points=1', '--points=1 takes no value'],
  ]
  for (const [flag, message] of cases) {
    const r = parseArgs(['--width=10', '--height=10', flag])
    assertEquals(r.errors.length, 1, flag)
    assertStringIncludes(r.errors[0] ?? '', message, flag)
  }
})

Deno.test('helpText lists the look flags', () => {
  const text = helpText()
  for (const flag of ['--theme=NAME', '--palette=', '--paper=', '--ink=', '--highlight-color=', '--pad=N', '--points', '--point-color=', '--point-radius=R']) {
    assertStringIncludes(text, flag)
  }
})
```

- [ ] **Step 2: Run to see them fail**

Run: `deno test packages/engine/command.test.ts`
Expected: FAIL, e.g. `unknown flag --theme`.

- [ ] **Step 3: Help rows**

`packages/engine/command.ts`, `PICTURE_FLAGS`, after the `--top=N` row:
```ts
  ['--theme=NAME', 'a built-in colour theme, e.g. gruvbox-dark (an unknown name lists them all)'],
  ['--palette=#RRGGBB,...', `arrow colours while --colored is on, up to ${PALETTE_CAP}; replaces the theme's`],
  ['--paper=#RRGGBB', `background colour (default: the theme's, or ${DEFAULT_COLOURS.paper})`],
  ['--ink=#RRGGBB', `line and arrowhead colour (default: the theme's, or ${DEFAULT_COLOURS.ink})`],
  ['--highlight-color=#RRGGBB', `colour of the --top arrows (default: the theme's, or ${DEFAULT_COLOURS.highlight})`],
  ['--pad=N', `margin around the board in cells, ${PAD_RANGE.min}..${PAD_RANGE.max} (default ${DEFAULT_PAD})`],
  ['--points', 'a dot in the centre of every cell, as the lab draws its dot grid'],
  ['--point-color=#RRGGBB', `dot colour (default ${DEFAULT_POINT_COLOR})`],
  ['--point-radius=R', `dot radius in cells, ${POINT_RADIUS_RANGE.min}..${POINT_RADIUS_RANGE.max} (default ${DEFAULT_POINT_RADIUS})`],
```
Extend the `./look.ts` import with `DEFAULT_COLOURS`, `isHexColour`, `PAD_RANGE`, `PALETTE_CAP`, `POINT_RADIUS_RANGE`, `THEMES`, `themeOf`.

- [ ] **Step 4: `buildCommand`**

After `if (!v.rounded) parts.push('--sharp')`:
```ts
  if (v.theme !== '') parts.push(`--theme=${v.theme}`)
  if (v.palette.length > 0) parts.push(`--palette=${v.palette.join(',')}`)
  if (v.paper !== '') parts.push(`--paper=${v.paper}`)
  if (v.ink !== '') parts.push(`--ink=${v.ink}`)
  if (v.highlight !== '') parts.push(`--highlight-color=${v.highlight}`)
  if (v.pad !== DEFAULT_VIEW.pad) parts.push(`--pad=${v.pad}`)
  if (v.showPoints) parts.push('--points')
  if (v.pointColor !== DEFAULT_VIEW.pointColor) parts.push(`--point-color=${v.pointColor}`)
  if (v.pointRadius !== DEFAULT_VIEW.pointRadius) parts.push(`--point-radius=${v.pointRadius}`)
```

- [ ] **Step 5: `parseArgs`**

Above `parseArgs`, next to `VIEW_FLAG`:
```ts
/** The look's colour flags and the view field each writes. */
const COLOUR_FLAG = new Map<string, 'paper' | 'ink' | 'highlight' | 'pointColor'>([
  ['paper', 'paper'],
  ['ink', 'ink'],
  ['highlight-color', 'highlight'],
  ['point-color', 'pointColor'],
])
/** The look's two numbers and their bounds, kept apart from VIEW_RANGE: its keys are the lab's panel rows. */
const LOOK_NUMBER = new Map<string, { field: 'pad' | 'pointRadius'; range: { min: number; max: number }; whole: boolean }>([
  ['pad', { field: 'pad', range: PAD_RANGE, whole: true }],
  ['point-radius', { field: 'pointRadius', range: POINT_RADIUS_RANGE, whole: false }],
])
```
In the flag loop, after the `sharp` branch and before `const field2 = VIEW_NUMBER.get(name)`:
```ts
    if (name === 'points') {
      if (switchOn(a, raw)) view.showPoints = true
      continue
    }
    if (name === 'theme') {
      if (raw === null || themeOf(raw) === null) {
        errors.push(`${a} is not a theme: ${Object.keys(THEMES).join(', ')}`)
        continue
      }
      view.theme = raw
      continue
    }
    const colour = COLOUR_FLAG.get(name)
    if (colour) {
      if (!isHexColour(raw)) {
        errors.push(`${a} is not a #rrggbb colour`)
        continue
      }
      view[colour] = raw.toLowerCase()
      continue
    }
    if (name === 'palette') {
      const list = raw === null ? [] : raw.split(',')
      if (list.length === 0 || !list.every(isHexColour)) {
        errors.push(`${a} is not a list of #rrggbb colours`)
        continue
      }
      if (list.length > PALETTE_CAP) {
        errors.push(`${a} has more than ${PALETTE_CAP} colours`)
        continue
      }
      view.palette = list.map((c) => c.toLowerCase())
      continue
    }
    const look = LOOK_NUMBER.get(name)
    if (look) {
      const n = numberOf(raw)
      if (n === null) {
        errors.push(`${a} is not a number`)
        continue
      }
      if (look.whole && !Number.isInteger(n)) {
        errors.push(`${a} is not a whole number`)
        continue
      }
      if (n < look.range.min || n > look.range.max) {
        errors.push(`${a} is outside ${look.range.min}..${look.range.max}`)
        continue
      }
      view[look.field] = n
      continue
    }
```
(`''.split(',')` is `['']`, which fails `isHexColour`, so `--palette=` and a trailing comma are refused by the same line.)

- [ ] **Step 6: Run the command tests, then everything**

Run: `set -o pipefail; deno test packages/engine/command.test.ts 2>&1 | tail -3 && deno task test 2>&1 | tail -3`
Expected: all pass (`readme.test.ts`'s "every documented picture is still a command" included).

- [ ] **Step 7: Commit**

```bash
deno fmt packages/ && deno task fmt
git add packages/engine/command.ts packages/engine/command.test.ts
git commit -m "CLI: flags for the theme, the colours, the point grid and the margin"
```

---

### Task 5: The store checks and fills the look

**Files:**
- Modify: `packages/cli/store-server.ts` (`checkView`)
- Test: `packages/cli/store-server.test.ts` (and a check of `packages/cli/store.test.ts`)

**Interfaces:**
- Consumes: `View` look fields (Task 3); `themeOf`, `isHexColour`, `PALETTE_CAP`, `PAD_RANGE`, `POINT_RADIUS_RANGE` from `@arrowz/engine` (Task 1).
- Produces: `checkView` accepts a full look, refuses each bad field with `view.<field> …`, and takes the default for an absent one.

- [ ] **Step 1: Write the failing tests**

In `packages/cli/store-server.test.ts`, extend the `cases` table of the test that holds `[{ ...b, view: { ...b.view, colored: 'yes' } }, 'view.colored']` with:
```ts
      [{ ...b, view: { ...b.view, theme: 'nope' } }, 'view.theme'],
      [{ ...b, view: { ...b.view, palette: ['red'] } }, 'view.palette'],
      [{ ...b, view: { ...b.view, palette: Array(9).fill('#aa0000') } }, 'view.palette'],
      [{ ...b, view: { ...b.view, ink: 'red' } }, 'view.ink'],
      [{ ...b, view: { ...b.view, pointColor: '' } }, 'view.pointColor'],
      [{ ...b, view: { ...b.view, pad: 17 } }, 'view.pad must be a whole number in 0..16'],
      [{ ...b, view: { ...b.view, pad: 1.5 } }, 'view.pad must be a whole number in 0..16'],
      [{ ...b, view: { ...b.view, pointRadius: 0.6 } }, 'view.pointRadius must be a number in 0..0.5'],
      [{ ...b, view: { ...b.view, showPoints: 'yes' } }, 'view.showPoints'],
```
and add a test beside it (`post`, `withServer`, `emptyFile` and `validBody` are the file's own helpers; the two bodies use different sizes because two empty boards of one size are one layout):
```ts
Deno.test('a posted look is stored lower-case, and a view without one takes the default look', () =>
  withServer(async (base) => {
    const b = validBody()
    const withLook = { ...b, view: { ...b.view, ink: '#ABCDEF', theme: 'gruvbox-dark', pad: 7, showPoints: true } }
    const first = await post(base, withLook)
    assertEquals(first.status, 201)
    const looked: BoardMeta = await first.json()
    assertEquals(
      [looked.view.ink, looked.view.theme, looked.view.pad, looked.view.showPoints],
      ['#abcdef', 'gruvbox-dark', 7, true],
    )
    const bare = { ...b, board: emptyFile(12, 12), params: { ...b.params, W: 12, H: 12 } }
    const second = await post(base, bare)
    assertEquals(second.status, 201)
    const plain: BoardMeta = await second.json()
    assertEquals(plain.view, { ...DEFAULT_VIEW, ...b.view, rounded: true })
  }))
```
(`b.view` has no `rounded` and no look key; `DEFAULT_VIEW` supplies both. Import `DEFAULT_VIEW` from `@arrowz/engine/command` if the file does not already.)

`packages/cli/store.test.ts` needs nothing new here: its test `listBoards fills a legacy view without arrowhead fields with the defaults` compares the whole view, and Task 3 already rewrote its expected value to `{ ...DEFAULT_VIEW, … }`, which pins the legacy meta reading with `pad` 4, no points and no stated colours. Check that it does; if Task 3 wrote it any other way, make it that.

- [ ] **Step 2: Run to see them fail**

Run: `deno test --allow-all packages/cli/store-server.test.ts`
Expected: FAIL (the bad looks are accepted; `view.theme` etc. not in errors).

- [ ] **Step 3: `checkView` checks the look**

`packages/cli/store-server.ts`: add `isHexColour, PAD_RANGE, PALETTE_CAP, POINT_RADIUS_RANGE, themeOf` to the value import from `@arrowz/engine` (the one that already imports `decodeBoard`, …). Above `checkView`:
```ts
/** The look fields of a view: each is optional, so a body posted before they existed still stores. */
function checkLook(v: Record<string, unknown>, view: View): string | null {
  if (v.theme !== undefined) {
    if (typeof v.theme !== 'string' || (v.theme !== '' && themeOf(v.theme) === null)) {
      return 'view.theme must be a built-in theme or empty'
    }
    view.theme = v.theme
  }
  if (v.palette !== undefined) {
    const list: unknown = v.palette
    if (!Array.isArray(list) || list.length > PALETTE_CAP || !list.every(isHexColour)) {
      return `view.palette must be at most ${PALETTE_CAP} #rrggbb colours`
    }
    view.palette = list.map((c: string) => c.toLowerCase())
  }
  for (const k of ['paper', 'ink', 'highlight'] as const) {
    const c = v[k]
    if (c === undefined) continue
    if (c !== '' && !isHexColour(c)) return `view.${k} must be a #rrggbb colour or empty`
    view[k] = c === '' ? '' : c.toLowerCase()
  }
  if (v.pointColor !== undefined) {
    if (!isHexColour(v.pointColor)) return 'view.pointColor must be a #rrggbb colour'
    view.pointColor = v.pointColor.toLowerCase()
  }
  if (v.pad !== undefined) {
    if (!isFiniteNumber(v.pad) || !Number.isInteger(v.pad) || v.pad < PAD_RANGE.min || v.pad > PAD_RANGE.max) {
      return `view.pad must be a whole number in ${PAD_RANGE.min}..${PAD_RANGE.max}`
    }
    view.pad = v.pad
  }
  if (v.pointRadius !== undefined) {
    const r = POINT_RADIUS_RANGE
    if (!isFiniteNumber(v.pointRadius) || v.pointRadius < r.min || v.pointRadius > r.max) {
      return `view.pointRadius must be a number in ${r.min}..${r.max}`
    }
    view.pointRadius = v.pointRadius
  }
  if (v.showPoints !== undefined) {
    if (typeof v.showPoints !== 'boolean') return 'view.showPoints must be true or false'
    view.showPoints = v.showPoints
  }
  return null
}
```
In `checkView`, before `return { ok: view }`:
```ts
  const look = checkLook(v, view)
  if (look !== null) return { error: look }
```
If `c.toLowerCase()` does not type-check after `isHexColour(c)` narrowing inside the `for` (the `c !== ''` guard can widen it), write the branch as `if (c === '') view[k] = ''; else if (isHexColour(c)) view[k] = c.toLowerCase(); else return …`. No `as`, no `!`.

`store.ts`'s `fillView` already spreads `DEFAULT_VIEW` under a stored view; leave it.

- [ ] **Step 4: Run the CLI tests, then everything**

Run: `set -o pipefail; deno task test 2>&1 | tail -3`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
deno fmt packages/ && deno task fmt
git add packages/cli/store-server.ts packages/cli/store-server.test.ts
git commit -m "Store: the view's look is checked on the way in and filled on the way out"
```

---

### Task 6: The lab carries the look

**Files:**
- Modify: `apps/lab/src/state/view.slice.ts` (`viewOf`, new `lookOf`), `apps/lab/src/state/viewSchema.ts` (`PALETTE_CAP`, `HEX_COLOR` → engine), `apps/lab/src/run/ExportButtons.tsx`, `apps/lab/src/library/BoardColumn.tsx` (`exportSvg`, `loadIntoLab`)
- Delete: `apps/lab/src/run/exportColours.ts`, `apps/lab/src/run/exportColours.test.ts`
- Test: `apps/lab/src/state/view.slice.test.ts`, `apps/lab/src/run/ExportButtons.browser.test.tsx`, `apps/lab/src/library/BoardColumn.browser.test.tsx`

**Interfaces:**
- Consumes: `View` look fields, `svgOptions` (Task 3); `PALETTE_CAP`, `isHexColour` from `@arrowz/engine` (Task 1, via `pnpm nx build engine`).
- Produces: `viewOf(state): View` with the nine look fields (`highlightColor` → `highlight`); `lookOf(view: ViewFields): Look` where `type Look = Pick<View, 'theme' | 'palette' | 'paper' | 'ink' | 'highlight' | 'pad' | 'showPoints' | 'pointColor' | 'pointRadius'>`.

- [ ] **Step 1: Write the failing tests**

`apps/lab/src/state/view.slice.test.ts` (import `lookOf` beside `viewOf`):
```ts
test('viewOf carries the look, with highlightColor as the highlight', () => {
  view().apply({ theme: 'gruvbox-dark', ink: '#040506', highlightColor: '#0a0b0c', pad: 7, showPoints: true })
  const v = viewOf(view())
  expect(v).toMatchObject({ theme: 'gruvbox-dark', ink: '#040506', highlight: '#0a0b0c', pad: 7, showPoints: true })
  expect('highlightColor' in v).toBe(false)
  expect(lookOf(view())).toEqual({
    theme: v.theme,
    palette: v.palette,
    paper: v.paper,
    ink: v.ink,
    highlight: v.highlight,
    pad: v.pad,
    showPoints: v.showPoints,
    pointColor: v.pointColor,
    pointRadius: v.pointRadius,
  })
  view().apply({ theme: '', ink: '', highlightColor: '', pad: 4, showPoints: false })
})
```

`apps/lab/src/run/ExportButtons.browser.test.tsx`, beside the two colour tests:
```ts
test('the SVG carries the point grid and the margin of the board on screen', async () => {
  const initial = useStore.getState().view
  try {
    const screen = await mountButtons()
    await act(async () => finish(ONE))
    await act(async () => useStore.getState().view.apply({ showPoints: true, pointColor: '#070809', pad: 6 }))
    await screen.getByRole('button', { name: 'Download SVG' }).click()
    await expect.poll(() => downloads.blobs.length, { timeout: 10_000 }).toBe(1)
    const svg = (await downloads.blobs[0]?.text()) ?? ''
    const cell = useStore.getState().view.cell
    expect(svg).toContain('fill="url(#arrowz-points)"')
    expect(svg).toContain('fill="#070809"')
    expect(svg).toContain(`<rect x="${6 * cell}" y="${6 * cell}"`)
  } finally {
    useStore.setState({ view: initial })
  }
})
```

`apps/lab/src/library/BoardColumn.browser.test.tsx`: replace the test `load into lab leaves the view fields a stored board does not carry` with:
```ts
// A stored board carries its look; loading it brings the look along. `voids` is the lab's own and stays.
test('load into lab restores the stored look and keeps voids', async () => {
  const initial = useStore.getState().view
  const look = {
    theme: 'gruvbox-dark',
    palette: ['#112233'],
    paper: '#010203',
    ink: '#040506',
    highlight: '#0a0b0c',
    pad: 7,
    showPoints: true,
    pointColor: '#070809',
    pointRadius: 0.15,
  }
  const withLook = { ...stored.meta, view: { ...stored.meta.view, ...look } }
  const screen = await mountDetail()
  useStore.getState().view.apply({ voids: false, theme: 'ayu-dark' })
  await act(async () =>
    useStore.getState().result.showPreview({ board: decodeBoard(stored.file), file: stored.file, meta: withLook }),
  )
  let viewChanges = 0
  let last = useStore.getState().view
  const stop = useStore.subscribe((state) => {
    if (state.view !== last) viewChanges++
    last = state.view
  })
  try {
    await userEvent.click(screen.getByRole('button', { name: /load into lab/i }))
    const after = useStore.getState().view
    const { highlight, ...rest } = look
    expect(after).toMatchObject({ ...rest, highlightColor: highlight, voids: false })
    expect(viewChanges).toBe(1)
  } finally {
    stop()
    useStore.setState({ view: initial })
  }
})

// A board saved before the look existed reads with the default look (the store fills it), and loading it sets that.
test('load into lab of a board without a look sets the default look', async () => {
  const initial = useStore.getState().view
  const screen = await mountDetail()
  useStore.getState().view.apply({ theme: 'ayu-dark', pad: 9 })
  await act(async () =>
    useStore.getState().result.showPreview({ board: decodeBoard(stored.file), file: stored.file, meta: stored.meta }),
  )
  try {
    await userEvent.click(screen.getByRole('button', { name: /load into lab/i }))
    expect(useStore.getState().view).toMatchObject({ theme: '', pad: 4, showPoints: false })
  } finally {
    useStore.setState({ view: initial })
  }
})
```
(`stored.meta.view` is `{ ...DEFAULT_VIEW, top: 0 }` from `library.fixtures.ts`, which after Task 3 carries the default look — the shape the store's `fillView` gives an old meta.)

And a library export case, beside `the stored board’s SVG carries the page’s theme`:
```ts
test('the stored board’s SVG draws its own shape in the page’s look, not the look it was saved with', async () => {
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
  const savedLook = { ...stored.meta, view: { ...stored.meta.view, theme: 'gruvbox-dark', pad: 9 } }
  try {
    useStore.getState().view.apply({ theme: 'ayu-dark', pad: 2 })
    const screen = await mountDetail()
    await act(async () =>
      useStore.getState().result.showPreview({ board: decodeBoard(stored.file), file: stored.file, meta: savedLook }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Download SVG' }))
    await expect.poll(() => blobs.length, { timeout: 10_000 }).toBe(1)
    const svg = (await blobs[0]?.text()) ?? ''
    const cell = stored.meta.view.cell
    expect(svg).toMatch(new RegExp(`<rect width="\\d+" height="\\d+" fill="${THEMES['ayu-dark']?.paper}"/>`))
    expect(svg).toContain(`<svg xmlns="http://www.w3.org/2000/svg" width="${(8 + 4) * cell}"`)
  } finally {
    document.removeEventListener('click', cancel, true)
    useStore.setState({ view: initial })
  }
})
```
(Import `THEMES` from `@arrowz/board-element`. The fixture board is 8×8, so a margin of 2 cells makes the width `(8 + 2·2) · cell`.)

- [ ] **Step 2: Run to see them fail**

Run:
```bash
set -o pipefail
pnpm nx build engine 2>&1 | tail -1
pnpm nx test lab -- src/state/view.slice.test.ts src/run/ExportButtons.browser.test.tsx src/library/BoardColumn.browser.test.tsx 2>&1 | tail -15
```
Expected: FAIL (`lookOf` not exported; the export has no pattern; load keeps the old look). Every SVG export case in `ExportButtons.browser.test.tsx` also fails until Step 3: since Task 3, `svgOptions` reads `palette` from a `viewOf` that has none.

- [ ] **Step 3: `viewOf` and `lookOf`**

`apps/lab/src/state/view.slice.ts`:
```ts
/** The look alone: what the lab lays over a stored board's own shape, colour being a viewing preference. */
export type Look = Pick<
  View,
  'theme' | 'palette' | 'paper' | 'ink' | 'highlight' | 'pad' | 'showPoints' | 'pointColor' | 'pointRadius'
>

export function lookOf(view: ViewFields): Look {
  return {
    theme: view.theme,
    palette: view.palette,
    paper: view.paper,
    ink: view.ink,
    highlight: view.highlightColor,
    pad: view.pad,
    showPoints: view.showPoints,
    pointColor: view.pointColor,
    pointRadius: view.pointRadius,
  }
}
```
and `viewOf` returns `{ …the seven fields as today…, ...lookOf(state) }`. Import `ViewFields` from `./viewSchema` if not imported.

- [ ] **Step 4: `viewSchema.ts` reads the engine's rule and cap**

Replace `export const PALETTE_CAP = 8` with `export { PALETTE_CAP } from '@arrowz/engine'` plus `import { isHexColour, PALETTE_CAP } from '@arrowz/engine'` for the local uses; delete `const HEX_COLOR = …`; `hex` becomes:
```ts
function hex(raw: unknown): string | undefined {
  return isHexColour(raw) ? raw.toLowerCase() : undefined
}
```
Replace the comment above `showPoints` in `ViewFields` (`/** The point grid: the element's settings, not the engine's, like \`voids\`. */`) with `/** The point grid; \`viewOf\` carries it with the rest of the look (\`lookOf\`). */`. Keep the comment above `PALETTE_CAP` only if it still holds; the cap is now the engine's, so write `/** The engine's cap, shared with the CLI and the store. */`.

- [ ] **Step 5: The two exports and "Load into lab"**

`apps/lab/src/run/ExportButtons.tsx`: the options become `{ ...svgOptions(viewOf(view)), voids: view.voids }`; remove the `exportColours` import.

`apps/lab/src/library/BoardColumn.tsx`:
- `exportSvg` options become `{ ...svgOptions({ ...meta.view, ...lookOf(useStore.getState().view) }), voids: meta.ok === false }`; import `lookOf` from `../state/view.slice`; remove the `exportColours` import. Its comment becomes: `// The board as it is drawn here: its own saved shape in the page's look, and its jammed cells when it did not close, as \`BoardFrame\` draws them.`
- `loadIntoLab`'s `view.apply({ … })` gains, after the `top` line:
```ts
      theme: saved.theme,
      palette: saved.palette,
      paper: saved.paper,
      ink: saved.ink,
      highlightColor: saved.highlight,
      pad: saved.pad,
      showPoints: saved.showPoints,
      pointColor: saved.pointColor,
      pointRadius: saved.pointRadius,
```

`git rm apps/lab/src/run/exportColours.ts apps/lab/src/run/exportColours.test.ts` (their two cases are `svg-options.test.ts`'s second and fourth).

- [ ] **Step 6: Run the lab**

Run:
```bash
set -o pipefail
pnpm nx run-many -t check,lint,fmt,test -p lab 2>&1 | tail -15
```
Expected: all green. A failing browser test outside the three files above is a finding: report it with its message before changing it.

- [ ] **Step 7: Commit**

```bash
git add apps/lab/src/state/view.slice.ts apps/lab/src/state/view.slice.test.ts apps/lab/src/state/viewSchema.ts apps/lab/src/run/ExportButtons.tsx apps/lab/src/run/ExportButtons.browser.test.tsx apps/lab/src/library/BoardColumn.tsx apps/lab/src/library/BoardColumn.browser.test.tsx
git rm -q apps/lab/src/run/exportColours.ts apps/lab/src/run/exportColours.test.ts
git commit -m "Lab: the view carries the look into the command, the store and the SVG"
```

---

### Task 7: Documentation and the README pictures

**Files:**
- Modify: `README.md`, `README.pl.md` (section "How the picture is drawn" / its Polish counterpart), `lab-review.md`, `docs/images/*` (rebuilt)

- [ ] **Step 1: README sections**

In `README.md`, "How the picture is drawn" opens with "These five change nothing about the puzzle — only how it looks on screen." Change "These five" to "These fourteen" (the section's flag count: five plus the nine look flags); in `README.pl.md` "Te pięć" becomes "Te czternaście". Then append after the last picture flag paragraph of that section:

```markdown
**`--theme`** paints the board in one of the lab's twelve colour themes
(`--theme=gruvbox-dark`, `--theme=catppuccin-latte`, …); an unknown name is
refused with the list. **`--paper`**, **`--ink`** and **`--highlight-color`**
set one colour each as `#rrggbb` and win over the theme's; **`--palette`**
gives the arrow colours for `--colored`, up to eight, comma-separated.

**`--pad`** is the margin around the board, in cells, 0 to 16 (default 4, as
the lab draws it). **`--points`** puts a dot in the centre of every cell, the
lab's dot grid; **`--point-color`** and **`--point-radius`** (in cells, up to
0.5) change the dot.

The lab's live command carries all of these, so copying it reproduces the
picture the lab exports.
```

In `README.pl.md`, in the matching section, append:

```markdown
**`--theme`** maluje planszę jednym z dwunastu motywów kolorów labu
(`--theme=gruvbox-dark`, `--theme=catppuccin-latte`, …); nieznana nazwa jest
odrzucana razem z listą. **`--paper`**, **`--ink`** i **`--highlight-color`**
ustawiają po jednym kolorze jako `#rrggbb` i wygrywają z kolorami motywu;
**`--palette`** podaje kolory strzałek dla `--colored`, najwyżej osiem, po
przecinku.

**`--pad`** to margines wokół planszy w komórkach, od 0 do 16 (domyślnie 4, jak
rysuje go lab). **`--points`** stawia kropkę w środku każdej komórki, jak siatka
kropek labu; **`--point-color`** i **`--point-radius`** (w komórkach, najwyżej
0.5) zmieniają kropkę.

Komenda na żywo z labu niesie je wszystkie, więc skopiowana odtwarza obrazek,
który lab eksportuje.
```

- [ ] **Step 2: Rebuild the pictures**

Run: `set -o pipefail; deno task docs 2>&1 | tail -5`
Expected: every entry rebuilt; `git status --short docs/images` lists changed `.svg`/`.png` files only (the margin grew from 1 to 4 cells).
Open two of them (`docs/images/seed-7.png`, `docs/images/colorized.png`) and confirm by eye that only the margin changed.

- [ ] **Step 3: `lab-review.md`**

- the row `| Gap 7: SVG colours | fixed on \`lab/correctness-2\` | Points and \`pad\` in the SVG, and CLI colour flags, remain |` → third cell `Points, \`pad\` and CLI colour flags fixed on \`engine/view-look\``;
- the row `| \`pad\` in the SVG | open | \`SvgOptions\` has none |` → `| \`pad\` in the SVG | fixed on \`engine/view-look\` | \`SvgOptions.pad\`, from the view |`;
- item 4 of "What is still open": replace the lines `` `.board.json`, colour flags in the CLI and points and `pad` in the SVG,`` / `` ⌘K rows for the colour and element fields.`` with `` `.board.json`, and ⌘K rows for the colour and element fields.``

- [ ] **Step 4: Gates and commit**

Run: `set -o pipefail; deno task test 2>&1 | tail -3` (the README tests read both files).
Expected: pass.

```bash
git add README.md README.pl.md lab-review.md docs/images
git commit -m "Docs: the look flags, and the pictures with the margin the CLI now draws"
```

---

### Task 8: Full gate and the live pass (controller)

- [ ] **Step 1: Full gate in a clean worktree**

```bash
set -o pipefail
deno task verify 2>&1 | tail -3
pnpm nx run-many -t verify 2>&1 | tail -8
```
Expected: both green.

- [ ] **Step 2: Live pass — byte equality**

Start the lab on its own ports with a copy of the store (see the measuring recipes memory: `ARROWZ_BOARDS_DIR=<copy>`, ports 8787/8789). In Chrome: generate a 30×20 board, set theme `gruvbox-dark`, ink `#abcdef`, points on, `pad` 6; press "Download SVG"; copy the live command; run it with `--svg=/tmp/view-look-cli.svg` and `ARROWZ_BOARDS_DIR` pointing at a scratch directory; `cmp` the two files.
Expected: identical. If not, `diff` them, find the field that differs, fix it in this branch with a test that pins it, and repeat.

- [ ] **Step 3: Library behaviour by hand**

Open the stored board in the Boards tab with a different theme chosen: the preview draws the stored shape in the current theme; "Load into lab" switches the lab to the stored theme and margin.
