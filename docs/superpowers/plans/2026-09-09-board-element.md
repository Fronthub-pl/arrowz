# `<arrowz-board>` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `packages/board-element`, the `<arrowz-board>` Lit element that draws a `Board`, owns zoom and pan, animates the game's `exit` and `bounce` effects and emits `piece-click`, with the shared shape arithmetic extracted from the engine's `toSvg` into a `geometry` module.

**Architecture:** A thin `LitElement` renders only the chrome (zoom buttons, pan hint) and hosts one `<svg>` that an imperative `SvgLayer` fills from SVG markup built once per board, keeping a map from piece id to node. Pure modules with no DOM (`viewport.ts`, `gestures.ts`, `i18n.ts`) are tested in Node; the layer and the element are tested in Chromium through Vitest browser mode. The engine gains `geometry.ts`; `toSvg` keeps producing byte-identical output, pinned by SHA-256 golden hashes.

**Tech Stack:** TypeScript 5.9 (`tsc` emission to `dist/`, no decorators), Lit 3.3, Vitest 5 with `@vitest/browser-playwright` (Chromium), Vite 8 for the demo, pnpm 12 workspace, Nx 23 `run-commands`, Deno 2.9 for the engine tests plus repository-wide `deno fmt` and `deno lint`.

**Spec:** `docs/superpowers/specs/2026-09-09-board-element-design.md` (the road map and boundaries: `docs/superpowers/specs/2026-09-09-monorepo-design.md` §11.1; the controls and effects: `docs/superpowers/specs/2026-09-07-arrowz-design.md` §10 and §11).

## Global Constraints

- Everything in the repository is in English (code, comments, tests, docs, commit messages); the chat with the user is Polish. No attribution lines in commits.
- Engine rules: `packages/engine/engine.ts` and every file in `NEUTRAL` of `neutral.test.ts` know neither Deno nor the DOM; no `any`, no non-null assertions (`deno lint` enforces both); never spread arrays proportional to the number of cells or pieces (`Math.min(...arr)`).
- `toSvg` output must stay byte-identical: `packages/cli/carve.test.ts` compares the CLI with the engine, `fingerprints.test.ts` pins the boards, and Task 1 adds `svg-golden.json`. A type fix must never add a value-changing fallback.
- Repository formatting is `deno fmt` (no semicolons, single quotes, line width 120) for every `.ts` file, the new package included; run `deno fmt` from the repository root before each commit.
- Node consumers import the engine from `packages/engine/dist/` (`pnpm nx build engine`), never from its `.ts` sources. The new package imports `@arrowz/engine` (the `package.json` exports).
- Versions: `lit ^3.3.3`, `vitest ^5.0.0`, `@vitest/browser-playwright ^5.0.0`, `playwright ^1.63.0`, `vite ^8.2.0`; Node `>=24`, pnpm `12.3.4` through corepack; TypeScript from the root `devDependencies`.
- Coordinates inside the element are cells: cell `(x, y)` is centred at `(x + 0.5, y + 0.5)`; zoom and pan only change the root `viewBox`. Scale is clamped to `[fit, 48 px per cell]`.
- Visible strings live in `src/i18n.ts` with English as the source and Polish as the translation; `lang="pl"` selects Polish, anything else English.
- Execution branch: `feat/board-element` from `main` after the docs PR (spec + this plan) is merged. Commits per task, `pnpm nx run-many -t verify` green before the PR.
- Every new dependency is added with `pnpm add` from the package directory so `pnpm-lock.yaml` updates; if `pnpm install` reports ignored build scripts, add the package to `allowBuilds` in `pnpm-workspace.yaml` (Task 2 already adds `esbuild`).

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/engine/geometry.ts` | `DIRS`, `pieceShape`, `voidStrips`: the shape arithmetic shared by `toSvg` and the element |
| `packages/engine/geometry.test.ts` | Deno tests of the shapes |
| `packages/engine/svg-golden.ts` | the four golden cases (params, options) shared by the recorder and the test |
| `packages/engine/svg-golden.json` | SHA-256 of `toSvg` output per golden case, recorded before the extraction |
| `packages/engine/svg-golden.test.ts` | asserts the hashes |
| `packages/engine/scripts/record-svg-golden.ts` | writes `svg-golden.json` |
| `packages/board-element/package.json`, `project.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `vite.config.ts` | package manifests and tooling |
| `packages/board-element/src/i18n.ts` | `BOARD_LABELS`, `labelsFor` |
| `packages/board-element/src/viewport.ts` | pure viewport math |
| `packages/board-element/src/gestures.ts` | pure pointer state machine producing intents |
| `packages/board-element/src/svg-layer.ts` | `BoardView`, `DEFAULT_VIEW`, `SvgLayer` (markup, id map, diff, animations) |
| `packages/board-element/src/arrowz-board.ts` | the `ArrowzBoard` element |
| `packages/board-element/src/mod.ts` | public exports and global type augmentation |
| `packages/board-element/src/*.test.ts` | Node tests |
| `packages/board-element/src/*.browser.test.ts` | Chromium tests |
| `packages/board-element/demo/index.html`, `demo/main.ts`, `demo/worker.ts` | the demo with measurements |
| `packages/board-element/README.md` | usage and API |
| `.github/workflows/ci.yml` | Playwright Chromium install with cache |
| `deno.json` (root) | `**/node_modules/` excluded from fmt and lint, demo HTML excluded from fmt |
| `pnpm-workspace.yaml` | `allowBuilds.esbuild` |

---

### Task 1: Engine `geometry` module with golden hashes of `toSvg`

**Files:**
- Create: `packages/engine/svg-golden.ts`, `packages/engine/scripts/record-svg-golden.ts`, `packages/engine/svg-golden.json`, `packages/engine/svg-golden.test.ts`, `packages/engine/geometry.ts`, `packages/engine/geometry.test.ts`
- Modify: `packages/engine/engine.ts` (lines 55–66 `Dir`/`DIRS`, lines 2025–2146 `toSvg`, line 2685 export list), `packages/engine/mod.ts`, `packages/engine/neutral.test.ts:7`, `packages/engine/tsconfig.build.json` (`include`), `packages/engine/package.json` (`sideEffects`)

**Interfaces:**
- Consumes: `Board`, `Piece` from `types.ts`; `generate`, `defaultParams`, `toSvg` from `engine.ts`.
- Produces (imported by the board element through `@arrowz/engine`):
  - `type Dir = { dx: number; dy: number; ch: string }`, `DIRS: readonly Dir[]` (0 up, 1 right, 2 down, 3 left)
  - `interface ShapeOptions { cell: number; pad: number; width: number; headWidth: number; headHeight: number }`
  - `interface PieceShape { line: [number, number][]; head: [number, number][]; tail: { x: number; y: number; r: number } }`
  - `pieceShape(piece: Piece, o: ShapeOptions): PieceShape`
  - `voidStrips(board: Board): { x: number; y: number; len: number }[]` (in cells)

- [ ] **Step 1: Write the golden cases module**

```ts
// packages/engine/svg-golden.ts
// The boards and options whose toSvg output is pinned by svg-golden.json.
// The recorder and the test share this list so they can never disagree.
import { defaultParams } from './engine.ts'
import type { Params, SvgOptions } from './types.ts'

export interface SvgGoldenCase {
  name: string
  params: Params
  unchecked: boolean
  opts: SvgOptions
}

export const SVG_GOLDEN_CASES: readonly SvgGoldenCase[] = [
  { name: 'defaults', params: defaultParams(), unchecked: false, opts: {} },
  {
    name: 'skeleton-top',
    params: { ...defaultParams(), W: 100, H: 200, giants: 4 },
    unchecked: false,
    opts: { cell: 12, top: 5 },
  },
  {
    name: 'colored-stick',
    params: defaultParams(),
    unchecked: false,
    opts: { colored: true, strokeRatio: 0.7, headWidth: 0.9, headHeight: 1.1 },
  },
  {
    name: 'thin-narrow-head',
    params: defaultParams(),
    unchecked: false,
    opts: { strokeRatio: 0.3, headWidth: 0.2 },
  },
  {
    name: 'voids',
    params: { ...defaultParams(), W: 40, H: 40, seed: 1, voidFrac: 0.1 },
    unchecked: true,
    opts: { voids: true, cell: 8 },
  },
]
```

- [ ] **Step 2: Write the recorder script**

```ts
// packages/engine/scripts/record-svg-golden.ts
// Records the SHA-256 of toSvg for every golden case. Run it ONLY on a
// commit whose toSvg is known good; the test then holds every later commit
// to the same bytes.
import { dirname, fromFileUrl, join } from '@std/path'
import { generate, toSvg } from '../engine.ts'
import { SVG_GOLDEN_CASES } from '../svg-golden.ts'

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const hashes: Record<string, string> = {}
for (const c of SVG_GOLDEN_CASES) {
  const r = generate(c.params, { unchecked: c.unchecked })
  hashes[c.name] = await sha256(toSvg(r.board, c.opts))
}
const out = join(dirname(fromFileUrl(import.meta.url)), '..', 'svg-golden.json')
Deno.writeTextFileSync(out, JSON.stringify({ hashes }, null, 2) + '\n')
console.log(`recorded ${Object.keys(hashes).length} hashes to ${out}`)
```

- [ ] **Step 3: Record the hashes on the untouched `toSvg`**

Run from the repository root, BEFORE touching `engine.ts`:

```bash
deno run --allow-read --allow-write packages/engine/scripts/record-svg-golden.ts
cat packages/engine/svg-golden.json
```

Expected: five 64-character hex hashes. Commit this file as recorded; never re-record it later in this task.

- [ ] **Step 4: Write the golden test**

```ts
// packages/engine/svg-golden.test.ts
// toSvg must stay byte-identical: the CLI test, the README images and the
// board element's geometry all assume the shapes it draws never drift.
import { assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { generate, toSvg } from './engine.ts'
import { SVG_GOLDEN_CASES } from './svg-golden.ts'

const golden = JSON.parse(Deno.readTextFileSync(join(dirname(fromFileUrl(import.meta.url)), 'svg-golden.json'))) as {
  hashes: Record<string, string>
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

for (const c of SVG_GOLDEN_CASES) {
  Deno.test(`toSvg golden ${c.name} keeps its recorded hash`, async () => {
    const r = generate(c.params, { unchecked: c.unchecked })
    assertEquals(await sha256(toSvg(r.board, c.opts)), golden.hashes[c.name])
  })
}
```

- [ ] **Step 5: Run the golden test to see it pass on the untouched engine**

```bash
cd packages/engine && deno test --allow-read --allow-run svg-golden.test.ts
```

Expected: 5 passed. (It passes before the extraction; it is the guard for Step 8.)

- [ ] **Step 6: Write the failing geometry tests**

```ts
// packages/engine/geometry.test.ts
import { assert, assertEquals } from '@std/assert'
import { DIRS, pieceShape, voidStrips } from './geometry.ts'
import type { Board, Piece } from './types.ts'

// A three-cell piece heading right: head at (2,0), body at (1,0), tail at (0,0).
const right: Piece = { id: 7, cells: [{ x: 2, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }], dir: 1 }

Deno.test('DIRS is up, right, down, left', () => {
  assertEquals(DIRS.map((d) => [d.dx, d.dy]), [[0, -1], [1, 0], [0, 1], [-1, 0]])
})

Deno.test('a thin line gets a three-point arrow head with the tip 0.48 past the head centre; a stick gets a five-point collar', () => {
  const s = pieceShape(right, { cell: 1, pad: 0, width: 0.5, headWidth: 0, headHeight: 0 })
  // width 0.5 with cell 1 is the "stick" threshold: w >= 0.5*cell, so this is a stick.
  // Use 0.3 for the arrow case.
  const arrow = pieceShape(right, { cell: 1, pad: 0, width: 0.3, headWidth: 0, headHeight: 0 })
  assertEquals(arrow.head[0], [2.5 + 0.48, 0.5])
  assertEquals(arrow.head.length, 3)
  assertEquals(s.head.length, 5) // a stick needs the collar
})

Deno.test('the line starts at the head base plus the overlap and runs through the remaining cells', () => {
  const s = pieceShape(right, { cell: 1, pad: 0, width: 0.3, headWidth: 0, headHeight: 0 })
  const tip = 2.5 + 0.48
  const base = tip - 0.9 // automatic arrow height: 0.9 of a cell
  assertEquals(s.line[0], [base + 0.2 * 0.3, 0.5]) // lap = 0.2 * width
  assertEquals(s.line.slice(1), [[1.5, 0.5], [0.5, 0.5]])
  assertEquals(s.tail, { x: 0.5, y: 0.5, r: 0.15 })
})

Deno.test('cell and pad scale every coordinate the same way', () => {
  const unit = pieceShape(right, { cell: 1, pad: 0, width: 0.3, headWidth: 0, headHeight: 0 })
  const big = pieceShape(right, { cell: 16, pad: 16, width: 4.8, headWidth: 0, headHeight: 0 })
  for (let i = 0; i < unit.line.length; i++) {
    const [ux, uy] = unit.line[i] ?? [NaN, NaN]
    const [bx, by] = big.line[i] ?? [NaN, NaN]
    assert(Math.abs(bx - (16 + ux * 16)) < 1e-9 && Math.abs(by - (16 + uy * 16)) < 1e-9, `line point ${i}`)
  }
})

Deno.test('a head narrower than its line is widened to the line', () => {
  const s = pieceShape(right, { cell: 1, pad: 0, width: 0.3, headWidth: 0.1, headHeight: 0 })
  const [, [sx, sy]] = s.head // the first side point
  assert(Math.abs(Math.abs(sy - 0.5) - 0.15) < 1e-9, `half width is the line's radius, got ${sy}`)
  assert(Number.isFinite(sx))
})

Deno.test('voidStrips merges empty cells into horizontal runs', () => {
  const W = 4, H = 2
  const owner = new Int32Array([0, -1, -1, 0, -1, 1, 1, -1])
  const board: Board = { W, H, owner, pieces: [], stats: { want: 0, got: 0, stall: 0, strandTrunc: 0, strandLoss: 0, n: 0 }, backtracks: 0, remaining: 4 }
  assertEquals(voidStrips(board), [{ x: 1, y: 0, len: 2 }, { x: 0, y: 1, len: 1 }, { x: 3, y: 1, len: 1 }])
})
```

- [ ] **Step 7: Run the geometry tests to verify they fail**

```bash
cd packages/engine && deno test --allow-read --allow-run geometry.test.ts
```

Expected: FAIL, module `./geometry.ts` not found.

- [ ] **Step 8: Create `geometry.ts` and rewrite `toSvg` to call it**

```ts
// packages/engine/geometry.ts
// The shapes of the pieces in output units: what toSvg formats into SVG text
// and what the board element inserts into its own SVG. One source, so the
// CLI export and the interactive board can never draw a head differently.
// Knows neither Deno nor the DOM.
import type { Board, Piece } from './types.ts'

/** One of the four directions; `ch` is the head glyph of `render`. */
export type Dir = { dx: number; dy: number; ch: string }

export const DIRS: readonly Dir[] = [
  { dx: 0, dy: -1, ch: '↑' }, // 0 up
  { dx: 1, dy: 0, ch: '→' }, // 1 right
  { dx: 0, dy: 1, ch: '↓' }, // 2 down
  { dx: -1, dy: 0, ch: '←' }, // 3 left
]

export interface ShapeOptions {
  /** Size of one cell in output units. */
  cell: number
  /** Margin before the first cell, in output units. */
  pad: number
  /** Stroke width of this piece, in output units. */
  width: number
  /** Head width in cells; 0 = automatic. */
  headWidth: number
  /** Head height in cells; 0 = automatic. */
  headHeight: number
}

export interface PieceShape {
  /** Polyline points: the head base first, then the cells after the head. */
  line: [number, number][]
  /** Head polygon: tip, one side, (two collar points when the line is as wide as the head), the other side. */
  head: [number, number][]
  /** The tail rounding: a circle of the line's radius on the last cell. */
  tail: { x: number; y: number; r: number }
}

function at<T>(arr: ArrayLike<T>, i: number): T {
  const v = arr[i]
  if (v === undefined) throw new RangeError(`index ${i} out of ${arr.length}`)
  return v
}

/**
 * The shape of one piece. The arithmetic is the one toSvg had inline, in the
 * same order, so the CLI output stays byte-identical:
 * - a thin line (under half a cell) gets an arrow: an isosceles triangle
 *   0.4 of a cell plus 0.9 of the line width wide, 0.9 of a cell tall;
 * - from half a cell up the line ends as a sharpened stick: a triangle as
 *   wide as the line and 1.4 times as tall, with a collar behind the base;
 * - the tip is always 0.48 past the head centre, so a bigger head grows backwards;
 * - line and head overlap by 0.2 of the line width, so no seam shows.
 */
export function pieceShape(pc: Piece, o: ShapeOptions): PieceShape {
  const { cell, pad, width: w } = o
  const cx = (x: number): number => pad + x * cell + cell / 2
  const cy = (y: number): number => pad + y * cell + cell / 2
  const { dx, dy } = at(DIRS, pc.dir)
  const headCell = at(pc.cells, 0)
  const hx = cx(headCell.x), hy = cy(headCell.y)
  const stick = w >= 0.5 * cell - 1e-9
  const autoWidth = stick ? w : 0.4 * cell + 0.9 * w
  const autoHeight = stick ? 1.4 * w : 0.9 * cell
  const half = Math.max(w, o.headWidth > 0 ? o.headWidth * cell : autoWidth) / 2
  const height = o.headHeight > 0 ? o.headHeight * cell : autoHeight
  const tip = 0.48 * cell
  const tx = hx + dx * tip, ty = hy + dy * tip
  const bx = tx - dx * height, by = ty - dy * height
  const lap = 0.2 * w
  const fits = w / 2 <= half * (1 - lap / height) + 1e-9
  const head: [number, number][] = [[tx, ty], [bx + dy * half, by - dx * half]]
  if (!fits) {
    head.push([bx - dx * lap + dy * half, by - dy * lap - dx * half], [bx - dx * lap - dy * half, by - dy * lap + dx * half])
  }
  head.push([bx - dy * half, by + dx * half])
  const tailCell = at(pc.cells, pc.cells.length - 1)
  const ex = fits ? bx + dx * lap : bx, ey = fits ? by + dy * lap : by
  const line: [number, number][] = [[ex, ey]]
  for (let i = 1; i < pc.cells.length; i++) {
    const c = at(pc.cells, i)
    line.push([cx(c.x), cy(c.y)])
  }
  return { line, head, tail: { x: cx(tailCell.x), y: cy(tailCell.y), r: w / 2 } }
}

/**
 * The cells the generator failed to carve, merged into horizontal runs (in
 * cells). With 55 thousand holes, separate rectangles would produce a
 * document that cannot be displayed.
 */
export function voidStrips(board: Board): { x: number; y: number; len: number }[] {
  const { W, H, owner } = board
  const strips: { x: number; y: number; len: number }[] = []
  for (let y = 0; y < H; y++) {
    let start = -1
    for (let x = 0; x <= W; x++) {
      const empty = x < W && owner[y * W + x] === -1
      if (empty && start < 0) start = x
      if (!empty && start >= 0) {
        strips.push({ x: start, y, len: x - start })
        start = -1
      }
    }
  }
  return strips
}
```

In `engine.ts`:

1. Delete the `Dir` type and the `DIRS` constant (lines 57–66) and add at the top, after the type import:

```ts
import { DIRS, pieceShape, voidStrips } from './geometry.ts'
```

2. Replace the body of `toSvg` so the void strips and each piece come from the module. The full new function:

```ts
function toSvg(board: Board, opts: SvgOptions = {}): string {
  const { cell = 16, colored = false, top = 0, voids = false } = opts
  const { W, H, pieces } = board
  // The set of ids of the N longest pieces — we draw them in red and ON TOP,
  // so that the course of a single line can be traced.
  const longest = new Set(
    [...pieces].sort((a, b) => b.cells.length - a.cells.length).slice(0, top).map((p) => p.id),
  )
  const pad = cell
  const sw = cell * (opts.strokeRatio ?? 0.5)
  const w = W * cell + pad * 2, h = H * cell + pad * 2
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect width="${w}" height="${h}" fill="#f6f6fa"/>`,
  ]

  // Jam preview: cells the generator failed to carve, as horizontal strips.
  if (voids && board.owner) {
    const rects = voidStrips(board).map((s) =>
      `<rect x="${pad + s.x * cell}" y="${pad + s.y * cell}" width="${s.len * cell}" height="${cell}"/>`
    )
    if (rects.length) out.push(`<g fill="#e8467c" fill-opacity=".22">${rects.join('')}</g>`)
  }

  // Lines end flat: the head end hides under the head, and the tail gets its
  // rounding from a circle of the line's radius, drawn with the heads. The
  // default ink is set once per group; only coloured and highlighted pieces
  // carry their own colour (a 1000×1000 board has ~90 000 pieces).
  const INK = '#232447'
  out.push(`<g fill="none" stroke="${INK}" stroke-width="${sw}" stroke-linecap="butt" stroke-linejoin="round">`)
  const heads: string[] = []
  const highlight: string[] = [] // paths of the longest pieces, drawn last
  const highlightHeads: string[] = []
  // In colour mode the pink would blend into the palette, so highlighted
  // pieces are drawn thicker — legible regardless of the neighbours' colours.
  const hiWidth = Number((sw * (colored ? 1.5 : 1.15)).toFixed(2))
  const headWidth = opts.headWidth ?? 0, headHeight = opts.headHeight ?? 0
  const pt = ([x, y]: [number, number]): string => `${x},${y}`
  pieces.forEach((pc, i) => {
    const isLong = longest.has(pc.id)
    const col = isLong ? '#e8467c' : colored ? `hsl(${(i * 137.508) % 360} 62% 42%)` : INK
    const width = isLong ? hiWidth : sw
    const s = pieceShape(pc, { cell, pad, width, headWidth, headHeight })
    const fill = col === INK ? '' : ` fill="${col}"`
    const head = `<polygon points="${s.head.map(pt).join(' ')}"${fill}/>` +
      `<circle cx="${s.tail.x}" cy="${s.tail.y}" r="${s.tail.r}"${fill}/>`
    const line = `<polyline points="${s.line.map(pt).join(' ')}"${col === INK ? '' : ` stroke="${col}"`}/>`
    if (isLong) {
      highlight.push(line)
      highlightHeads.push(head)
    } else {
      out.push(line)
      heads.push(head)
    }
  })
  out.push('</g>')
  if (highlight.length) {
    out.push(`<g fill="none" stroke-width="${hiWidth}" stroke-linecap="butt" stroke-linejoin="round">`)
    out.push(...highlight)
    out.push('</g>')
  }
  out.push(`<g fill="${INK}">${heads.join('')}${highlightHeads.join('')}</g>`, '</svg>')
  return out.join('\n')
}
```

3. The export line at the end of `engine.ts` keeps `DIRS` (now the imported binding): `export { analyse, Carver, DIRS, fingerprint, mulberry32, render, toSvg }` stays as it is. Every other use of `DIRS` and `Dir` inside `engine.ts` keeps working through the import; if `Dir` is referenced as a type anywhere in `engine.ts`, add `import type { Dir } from './geometry.ts'`.

- [ ] **Step 9: Wire the module into the package**

`packages/engine/mod.ts`:

```ts
export * from './engine.ts'
export { pieceShape, voidStrips } from './geometry.ts'
export type { Dir, PieceShape, ShapeOptions } from './geometry.ts'
export type * from './types.ts'
```

`DIRS` keeps coming from `engine.ts` (the export list re-exports the imported binding), because `packages/engine/absorb.test.ts` imports it from `./engine.ts` and `packages/cli/carve.ts` from `@arrowz/engine`; `mod.ts` must not export it a second time from `geometry.ts`, or `export *` and the named export would collide.

`packages/engine/neutral.test.ts:7`:

```ts
const NEUTRAL = ['mod.ts', 'types.ts', 'engine.ts', 'geometry.ts', 'command.ts', 'lab-simple.ts', 'lab-presets.ts', 'lab-i18n.ts']
```

`packages/engine/tsconfig.build.json` `include`: add `"geometry.ts"` after `"types.ts"`.

`packages/engine/package.json`: add `"sideEffects": false,` after `"type": "module",` (deferred from step 1 until a bundler consumer appeared; the board element is one).

- [ ] **Step 10: Run the engine tests, the golden test and the CLI byte-for-byte test**

```bash
deno fmt && deno task check && deno task lint && deno task test
```

Expected: every test passes, in particular `svg-golden.test.ts` (5), `fingerprints.test.ts`, `geometry.test.ts` (6) and `packages/cli/carve.test.ts`. If a golden hash fails, the extraction changed the arithmetic: compare `toSvg` output before and after on the failing case with `diff` and restore the exact expression order; never re-record the hashes.

Then the Node side:

```bash
pnpm nx run-many -t build smoke -p engine
```

Expected: `dist/geometry.js` and `dist/geometry.d.ts` exist, smoke passes.

- [ ] **Step 11: Commit**

```bash
git add packages/engine
git commit -m "Engine: extract the piece shapes into geometry.ts, pin toSvg with golden hashes"
```

---

### Task 2: Package scaffold, Vitest browser mode, Nx targets and CI

**Files:**
- Create: `packages/board-element/package.json`, `project.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `vite.config.ts`, `src/mod.ts` (placeholder export), `src/lit.browser.test.ts`
- Modify: `deno.json` (root), `pnpm-workspace.yaml`, `.github/workflows/ci.yml`, `pnpm-lock.yaml` (through `pnpm add`)

**Interfaces:**
- Produces: the Nx project `board-element` with targets `check`, `lint`, `fmt`, `test`, `build`, `serve`, `verify`; the Vitest projects `node` (`src/**/*.test.ts` minus browser) and `chromium` (`src/**/*.browser.test.ts`).

- [ ] **Step 1: Create the manifests**

`packages/board-element/package.json`:

```json
{
  "name": "@arrowz/board-element",
  "version": "1.0.0-alpha.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "types": "./dist/mod.d.ts", "default": "./dist/mod.js" }
  },
  "sideEffects": ["./dist/arrowz-board.js", "./dist/mod.js"],
  "files": ["dist"],
  "scripts": {
    "check": "tsc -p tsconfig.json --noEmit",
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run",
    "serve": "vite"
  },
  "dependencies": {
    "@arrowz/engine": "workspace:*",
    "lit": "^3.3.3"
  }
}
```

`packages/board-element/tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "target": "es2022",
    "lib": ["es2022", "dom", "dom.iterable"],
    "types": [],
    "noEmit": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true
  },
  "include": ["src", "demo", "vitest.config.ts", "vite.config.ts"]
}
```

`packages/board-element/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

`packages/board-element/vitest.config.ts`:

```ts
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// Two projects: the pure modules run in Node, the element runs in a real
// Chromium (real SVG geometry, real pointer events, real frame timings).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.browser.test.ts'],
        },
      },
      {
        test: {
          name: 'chromium',
          include: ['src/**/*.browser.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
```

`packages/board-element/vite.config.ts`:

```ts
import { defineConfig } from 'vite'

// The demo page only; the package itself is emitted by tsc.
export default defineConfig({
  root: 'demo',
  server: { port: 8778 },
  build: { target: 'es2022' },
})
```

`packages/board-element/project.json`:

```json
{
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "name": "board-element",
  "projectType": "library",
  "sourceRoot": "packages/board-element/src",
  "targets": {
    "check": {
      "executor": "nx:run-commands",
      "dependsOn": ["^build"],
      "options": { "cwd": "packages/board-element", "command": "pnpm run check" }
    },
    "lint": { "executor": "nx:run-commands", "options": { "cwd": "packages/board-element", "command": "deno lint" } },
    "fmt": { "executor": "nx:run-commands", "options": { "cwd": "packages/board-element", "command": "deno fmt --check" } },
    "test": {
      "executor": "nx:run-commands",
      "dependsOn": ["^build"],
      "options": { "cwd": "packages/board-element", "command": "pnpm run test" }
    },
    "build": { "executor": "nx:run-commands", "options": { "cwd": "packages/board-element", "command": "pnpm run build" } },
    "serve": {
      "executor": "nx:run-commands",
      "cache": false,
      "dependsOn": ["^build"],
      "options": { "cwd": "packages/board-element", "command": "pnpm run serve" }
    },
    "verify": { "executor": "nx:noop", "dependsOn": ["check", "lint", "fmt", "test", "build"] }
  }
}
```

`packages/board-element/src/mod.ts` (placeholder until Task 8):

```ts
// Public surface of @arrowz/board-element. Filled in by the element task.
export {}
```

- [ ] **Step 2: Repository-level configuration**

Root `deno.json`: add `"**/node_modules/"` to both `fmt.exclude` and the top-level `exclude` (pnpm creates `packages/board-element/node_modules`, and the existing `node_modules/` pattern covers only the root), and add `"packages/board-element/demo/index.html"` to `fmt.exclude` next to `packages/cli/lab.html`.

`pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*
  - apps/*
allowBuilds:
  nx: true
  esbuild: true
```

- [ ] **Step 3: Install the dependencies**

```bash
cd packages/board-element
pnpm add lit@^3.3.3
pnpm add -D vitest@^5.0.0 @vitest/browser-playwright@^5.0.0 playwright@^1.63.0 vite@^8.2.0
cd ../..
pnpm install
pnpm exec playwright install --only-shell chromium
```

Expected: `pnpm-lock.yaml` updated, `packages/board-element/node_modules/lit` present. If `pnpm install` prints "Ignored build scripts" for any package, add it under `allowBuilds` and rerun. If `pnpm install` leaves the lockfile stale, run `pnpm install --fix-lockfile` (the step-1 gotcha).

- [ ] **Step 4: Write the toolchain smoke test**

```ts
// packages/board-element/src/lit.browser.test.ts
// Proves the toolchain: Lit compiles without decorators, renders in the
// Chromium of Vitest browser mode, and shadow DOM is real.
import { html, LitElement } from 'lit'
import { expect, test } from 'vitest'

class ProbeElement extends LitElement {
  static properties = { label: { type: String } }
  declare label: string
  constructor() {
    super()
    this.label = 'probe'
  }
  override render() {
    return html`<span>${this.label}</span>`
  }
}
customElements.define('arrowz-probe', ProbeElement)

test('a Lit element renders into its shadow root in Chromium', async () => {
  const el = document.createElement('arrowz-probe') as ProbeElement
  document.body.append(el)
  el.label = 'hello'
  await el.updateComplete
  expect(el.shadowRoot?.querySelector('span')?.textContent).toBe('hello')
  expect(typeof SVGSVGElement).toBe('function')
  el.remove()
})
```

- [ ] **Step 5: Run the package targets**

```bash
pnpm nx run-many -t check lint fmt test build -p board-element
```

Expected: check passes (the engine `dist/` is built first through `^build`), lint and fmt pass (run `deno fmt` first if fmt complains), the `chromium` project reports 1 passed and the `node` project reports no test files (Vitest exits 0 for an empty project only with `passWithNoTests`; if it exits 1, add `"passWithNoTests": true` to the `node` project's `test` block and remove it in Task 3), build emits `dist/mod.js`.

- [ ] **Step 6: CI**

In `.github/workflows/ci.yml`, after the `pnpm install --frozen-lockfile` step and before `nrwl/nx-set-shas`:

```yaml
      - name: Cache Playwright browsers
        uses: actions/cache@v5
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}

      - run: pnpm exec playwright install --with-deps --only-shell chromium
```

Check the current major of `actions/cache` with `gh api repos/actions/cache/releases/latest --jq .tag_name` and use that major.

- [ ] **Step 7: Commit**

```bash
deno fmt
git add packages/board-element deno.json pnpm-workspace.yaml pnpm-lock.yaml .github/workflows/ci.yml
git commit -m "Board element: package scaffold with Vitest browser mode, Nx targets and CI browser install"
```

---

### Task 3: Labels dictionary

**Files:**
- Create: `packages/board-element/src/i18n.ts`, `packages/board-element/src/i18n.test.ts`

**Interfaces:**
- Produces:
  - `type BoardLang = 'en' | 'pl'`
  - `interface BoardLabels { zoomIn: string; zoomOut: string; fit: string; panHintMac: string; panHintOther: string }`
  - `BOARD_LABELS: Record<BoardLang, BoardLabels>`
  - `labelsFor(lang: string | null | undefined): BoardLabels` (`'pl'` → Polish, anything else → English; a `pl-PL` style tag matches on its primary subtag)

- [ ] **Step 1: Write the failing test**

```ts
// packages/board-element/src/i18n.test.ts
import { expect, test } from 'vitest'
import { BOARD_LABELS, labelsFor } from './i18n.ts'

test('both dictionaries have the same keys and no empty strings', () => {
  const en = Object.keys(BOARD_LABELS.en).sort()
  const pl = Object.keys(BOARD_LABELS.pl).sort()
  expect(pl).toEqual(en)
  for (const lang of ['en', 'pl'] as const) {
    for (const [key, value] of Object.entries(BOARD_LABELS[lang])) {
      expect(value.trim().length, `${lang}.${key}`).toBeGreaterThan(0)
    }
  }
})

test('labelsFor picks Polish for pl and pl-PL and falls back to English', () => {
  expect(labelsFor('pl')).toBe(BOARD_LABELS.pl)
  expect(labelsFor('pl-PL')).toBe(BOARD_LABELS.pl)
  expect(labelsFor('en')).toBe(BOARD_LABELS.en)
  expect(labelsFor('de')).toBe(BOARD_LABELS.en)
  expect(labelsFor('')).toBe(BOARD_LABELS.en)
  expect(labelsFor(null)).toBe(BOARD_LABELS.en)
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd packages/board-element && pnpm vitest run --project node
```

Expected: FAIL, cannot resolve `./i18n.ts`.

- [ ] **Step 3: Write the dictionary**

```ts
// packages/board-element/src/i18n.ts
// Every visible string of the element. English is the source, Polish the
// translation; the element picks the set from its `lang` attribute.
export type BoardLang = 'en' | 'pl'

export interface BoardLabels {
  zoomIn: string
  zoomOut: string
  fit: string
  panHintMac: string
  panHintOther: string
}

export const BOARD_LABELS: Record<BoardLang, BoardLabels> = {
  en: {
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    fit: 'Fit the board',
    panHintMac: 'Hold ⌘ and drag to pan',
    panHintOther: 'Hold Ctrl and drag to pan',
  },
  pl: {
    zoomIn: 'Powiększ',
    zoomOut: 'Pomniejsz',
    fit: 'Dopasuj planszę',
    panHintMac: 'Przytrzymaj ⌘ i przeciągnij, aby przesunąć',
    panHintOther: 'Przytrzymaj Ctrl i przeciągnij, aby przesunąć',
  },
}

/** The labels for a BCP 47 tag; only the primary subtag matters, and anything but Polish is English. */
export function labelsFor(lang: string | null | undefined): BoardLabels {
  const primary = (lang ?? '').toLowerCase().split('-')[0]
  return primary === 'pl' ? BOARD_LABELS.pl : BOARD_LABELS.en
}
```

- [ ] **Step 4: Run the tests**

```bash
cd packages/board-element && pnpm vitest run --project node
```

Expected: 2 passed. If Task 2 added `passWithNoTests`, remove it now.

- [ ] **Step 5: Commit**

```bash
deno fmt && git add packages/board-element/src/i18n.ts packages/board-element/src/i18n.test.ts packages/board-element/vitest.config.ts
git commit -m "Board element: EN and PL labels with a lang resolver"
```

---

### Task 4: Viewport math

**Files:**
- Create: `packages/board-element/src/viewport.ts`, `packages/board-element/src/viewport.test.ts`

**Interfaces:**
- Consumes: `Cell` from `@arrowz/engine`.
- Produces:
  - `interface ViewportInput { W: number; H: number; hostWidth: number; hostHeight: number }`
  - `interface Viewport extends ViewportInput { cellPx: number; originX: number; originY: number; fitted: boolean }`
  - `MAX_CELL_PX = 48`
  - `fit(v: ViewportInput): Viewport`
  - `zoomAt(v: Viewport, factor: number, px: number, py: number): Viewport`
  - `zoomBy(v: Viewport, factor: number): Viewport` (around the host centre)
  - `panBy(v: Viewport, dxPx: number, dyPx: number): Viewport` (the board follows the pointer)
  - `resize(v: Viewport, hostWidth: number, hostHeight: number): Viewport`
  - `screenToCell(v: Viewport, px: number, py: number): Cell | null`
  - `viewBox(v: Viewport): string`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/board-element/src/viewport.test.ts
import { describe, expect, test } from 'vitest'
import { fit, MAX_CELL_PX, panBy, resize, screenToCell, viewBox, zoomAt, zoomBy } from './viewport.ts'

const input = { W: 100, H: 200, hostWidth: 400, hostHeight: 800 }

describe('fit', () => {
  test('scales the board to the host and starts fitted', () => {
    const v = fit(input)
    expect(v.cellPx).toBeCloseTo(4, 9)
    expect(v.originX).toBeCloseTo(0, 9)
    expect(v.originY).toBeCloseTo(0, 9)
    expect(v.fitted).toBe(true)
    expect(viewBox(v)).toBe('0 0 100 200')
  })

  test('centres the board on the axis with slack', () => {
    const v = fit({ ...input, hostWidth: 800 })
    expect(v.cellPx).toBeCloseTo(4, 9)
    expect(v.originX).toBeCloseTo(-50, 9) // 400 px of slack = 100 cells, half on each side
    expect(v.originY).toBeCloseTo(0, 9)
  })
})

describe('zoomAt', () => {
  test('keeps the world point under the cursor', () => {
    const v = fit(input)
    const before = screenToCell(v, 120, 300)
    const z = zoomAt(v, 2, 120, 300)
    expect(z.cellPx).toBeCloseTo(8, 9)
    expect(screenToCell(z, 120, 300)).toEqual(before)
    expect(z.fitted).toBe(false)
  })

  test('cannot zoom out below the fit scale', () => {
    const z = zoomAt(fit(input), 0.1, 200, 400)
    expect(z.cellPx).toBeCloseTo(4, 9)
    expect(z.fitted).toBe(true)
  })

  test('cannot zoom in past the readability limit', () => {
    let v = fit(input)
    for (let i = 0; i < 20; i++) v = zoomAt(v, 2, 200, 400)
    expect(v.cellPx).toBeCloseTo(MAX_CELL_PX, 9)
  })

  test('a tiny board in a big host keeps fit reachable above the limit', () => {
    const v = fit({ W: 4, H: 4, hostWidth: 400, hostHeight: 400 })
    expect(v.cellPx).toBeCloseTo(100, 9)
    expect(zoomAt(v, 2, 200, 200).cellPx).toBeCloseTo(100, 9)
  })

  test('the board never leaves the view', () => {
    const v = zoomAt(fit(input), 4, 0, 0)
    expect(v.originX).toBeGreaterThanOrEqual(0)
    expect(v.originY).toBeGreaterThanOrEqual(0)
    expect(v.originX + v.hostWidth / v.cellPx).toBeLessThanOrEqual(input.W + 1e-9)
    expect(v.originY + v.hostHeight / v.cellPx).toBeLessThanOrEqual(input.H + 1e-9)
  })
})

describe('zoomBy and panBy', () => {
  test('zoomBy zooms around the host centre', () => {
    const v = fit(input)
    const centre = screenToCell(v, 200, 400)
    expect(screenToCell(zoomBy(v, 3), 200, 400)).toEqual(centre)
  })

  test('panBy moves the board with the pointer and clamps at the edge', () => {
    const v = zoomAt(fit(input), 2, 200, 400) // cellPx 8, view 50×100 cells, origin (25, 50)
    const moved = panBy(v, 80, 0) // drag right by 80 px = 10 cells: the origin goes left
    expect(moved.originX).toBeCloseTo(15, 9)
    const clamped = panBy(v, 10000, 10000)
    expect(clamped.originX).toBeCloseTo(0, 9)
    expect(clamped.originY).toBeCloseTo(0, 9)
  })
})

describe('resize', () => {
  test('refits when fitted', () => {
    const v = resize(fit(input), 800, 800)
    expect(v.cellPx).toBeCloseTo(4, 9)
    expect(v.originX).toBeCloseTo(-50, 9)
    expect(v.fitted).toBe(true)
  })

  test('keeps the scale when zoomed and clamps the origin', () => {
    const z = zoomAt(fit(input), 2, 200, 400)
    const v = resize(z, 200, 200)
    expect(v.cellPx).toBeCloseTo(8, 9)
    expect(v.fitted).toBe(false)
    expect(v.originX + v.hostWidth / v.cellPx).toBeLessThanOrEqual(input.W + 1e-9)
  })
})

describe('screenToCell', () => {
  test('maps pixels to cells and null outside the board', () => {
    const v = fit({ ...input, hostWidth: 800 }) // originX -50
    expect(screenToCell(v, 200, 0)).toEqual({ x: 0, y: 0 })
    expect(screenToCell(v, 203, 799)).toEqual({ x: 0, y: 199 })
    expect(screenToCell(v, 100, 400)).toBeNull()
    expect(screenToCell(v, 600, 400)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
cd packages/board-element && pnpm vitest run --project node viewport
```

Expected: FAIL, cannot resolve `./viewport.ts`.

- [ ] **Step 3: Implement**

```ts
// packages/board-element/src/viewport.ts
// The viewport in pure numbers: no DOM, so it is tested in Node. World units
// are cells; the host is in CSS pixels; `cellPx` ties the two together and
// the SVG viewBox is derived from the three numbers.
import type { Cell } from '@arrowz/engine'

export interface ViewportInput {
  W: number
  H: number
  hostWidth: number
  hostHeight: number
}

export interface Viewport extends ViewportInput {
  cellPx: number
  originX: number
  originY: number
  fitted: boolean
}

/** Above this a cell fills so much of the screen that orientation on the board falls apart. */
export const MAX_CELL_PX = 48

function fitScale(v: ViewportInput): number {
  return Math.min(v.hostWidth / v.W, v.hostHeight / v.H)
}

/**
 * Applies both bounds: the scale stays in [fit, 48 px] (or [fit, fit] when
 * the fit already exceeds 48 px, so `fit` is always reachable), and the board
 * cannot leave the view: on an axis where it is larger than the view the
 * origin stays within the board, where it is smaller the board is centred.
 */
function clamp(v: ViewportInput & { cellPx: number; originX: number; originY: number }): Viewport {
  const f = fitScale(v)
  const cellPx = Math.min(Math.max(v.cellPx, f), Math.max(MAX_CELL_PX, f))
  const viewW = v.hostWidth / cellPx, viewH = v.hostHeight / cellPx
  const originX = viewW >= v.W ? (v.W - viewW) / 2 : Math.min(Math.max(v.originX, 0), v.W - viewW)
  const originY = viewH >= v.H ? (v.H - viewH) / 2 : Math.min(Math.max(v.originY, 0), v.H - viewH)
  return {
    W: v.W,
    H: v.H,
    hostWidth: v.hostWidth,
    hostHeight: v.hostHeight,
    cellPx,
    originX,
    originY,
    fitted: Math.abs(cellPx - f) < 1e-9,
  }
}

export function fit(v: ViewportInput): Viewport {
  return clamp({ ...v, cellPx: fitScale(v), originX: 0, originY: 0 })
}

/** Scales by `factor` keeping the world point under the screen point (px, py) fixed. */
export function zoomAt(v: Viewport, factor: number, px: number, py: number): Viewport {
  const wx = v.originX + px / v.cellPx, wy = v.originY + py / v.cellPx
  const f = fitScale(v)
  const cellPx = Math.min(Math.max(v.cellPx * factor, f), Math.max(MAX_CELL_PX, f))
  return clamp({ ...v, cellPx, originX: wx - px / cellPx, originY: wy - py / cellPx })
}

export function zoomBy(v: Viewport, factor: number): Viewport {
  return zoomAt(v, factor, v.hostWidth / 2, v.hostHeight / 2)
}

/** Drags the board by a screen delta: the content follows the pointer. */
export function panBy(v: Viewport, dxPx: number, dyPx: number): Viewport {
  return clamp({ ...v, originX: v.originX - dxPx / v.cellPx, originY: v.originY - dyPx / v.cellPx })
}

export function resize(v: Viewport, hostWidth: number, hostHeight: number): Viewport {
  const next = { ...v, hostWidth, hostHeight }
  return v.fitted ? fit(next) : clamp(next)
}

export function screenToCell(v: Viewport, px: number, py: number): Cell | null {
  const x = Math.floor(v.originX + px / v.cellPx)
  const y = Math.floor(v.originY + py / v.cellPx)
  return x >= 0 && y >= 0 && x < v.W && y < v.H ? { x, y } : null
}

export function viewBox(v: Viewport): string {
  return `${v.originX} ${v.originY} ${v.hostWidth / v.cellPx} ${v.hostHeight / v.cellPx}`
}
```

- [ ] **Step 4: Run the tests**

```bash
cd packages/board-element && pnpm vitest run --project node viewport
```

Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
deno fmt && git add packages/board-element/src/viewport.ts packages/board-element/src/viewport.test.ts
git commit -m "Board element: pure viewport math with fit, zoom, pan and clamping"
```

---

### Task 5: Gesture state machine

**Files:**
- Create: `packages/board-element/src/gestures.ts`, `packages/board-element/src/gestures.test.ts`

**Interfaces:**
- Produces:
  - `type PointerKind = 'mouse' | 'touch' | 'pen'`
  - `interface PointerSample { id: number; x: number; y: number; kind: PointerKind; modifier: boolean; t: number }` (x, y relative to the SVG's top-left, in CSS px; `modifier` = `metaKey || ctrlKey`; `t` = event timestamp in ms)
  - `type Intent = { type: 'none' } | { type: 'click'; pressX: number; pressY: number; x: number; y: number } | { type: 'pan'; dx: number; dy: number } | { type: 'pinch'; factor: number; x: number; y: number; dx: number; dy: number } | { type: 'fit' }`
  - `TAP_SLOP_PX = 8`, `TAP_MS = 300`, `DOUBLE_TAP_PX = 24`, `DOUBLE_TAP_MS = 300`
  - `class GestureMachine { down(p): Intent; move(p): Intent; up(p): Intent; cancel(id: number): Intent; get panning(): boolean }`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/board-element/src/gestures.test.ts
import { describe, expect, test } from 'vitest'
import { GestureMachine, type PointerSample } from './gestures.ts'

function mouse(x: number, y: number, modifier = false, t = 0): PointerSample {
  return { id: 1, x, y, kind: 'mouse', modifier, t }
}
function touch(id: number, x: number, y: number, t: number): PointerSample {
  return { id, x, y, kind: 'touch', modifier: false, t }
}

describe('mouse', () => {
  test('press and release without a modifier is a click carrying both positions', () => {
    const m = new GestureMachine()
    expect(m.down(mouse(10, 10))).toEqual({ type: 'none' })
    expect(m.move(mouse(12, 11))).toEqual({ type: 'none' })
    expect(m.up(mouse(12, 11))).toEqual({ type: 'click', pressX: 10, pressY: 10, x: 12, y: 11 })
  })

  test('drag with the modifier pans and never clicks', () => {
    const m = new GestureMachine()
    m.down(mouse(10, 10, true))
    expect(m.panning).toBe(true)
    expect(m.move(mouse(15, 12, true))).toEqual({ type: 'pan', dx: 5, dy: 2 })
    expect(m.move(mouse(20, 12, true))).toEqual({ type: 'pan', dx: 5, dy: 0 })
    expect(m.up(mouse(20, 12, true))).toEqual({ type: 'none' })
    expect(m.panning).toBe(false)
  })

  test('drag without the modifier does nothing while moving', () => {
    const m = new GestureMachine()
    m.down(mouse(10, 10))
    expect(m.move(mouse(60, 60))).toEqual({ type: 'none' })
  })
})

describe('touch', () => {
  test('a short tap without movement is a click', () => {
    const m = new GestureMachine()
    m.down(touch(5, 40, 40, 0))
    m.move(touch(5, 43, 41, 50))
    expect(m.up(touch(5, 43, 41, 100))).toEqual({ type: 'click', pressX: 40, pressY: 40, x: 43, y: 41 })
  })

  test('a slow press is not a tap', () => {
    const m = new GestureMachine()
    m.down(touch(5, 40, 40, 0))
    expect(m.up(touch(5, 40, 40, 400))).toEqual({ type: 'none' })
  })

  test('one finger beyond the slop pans, and the release is not a click', () => {
    const m = new GestureMachine()
    m.down(touch(5, 40, 40, 0))
    expect(m.move(touch(5, 44, 40, 20))).toEqual({ type: 'none' }) // within 8 px
    expect(m.move(touch(5, 60, 40, 40))).toEqual({ type: 'pan', dx: 20, dy: 0 })
    expect(m.move(touch(5, 70, 45, 60))).toEqual({ type: 'pan', dx: 10, dy: 5 })
    expect(m.up(touch(5, 70, 45, 80))).toEqual({ type: 'none' })
  })

  test('two taps close in time and place fit the board', () => {
    const m = new GestureMachine()
    m.down(touch(5, 40, 40, 0))
    expect(m.up(touch(5, 40, 40, 50)).type).toBe('click')
    m.down(touch(6, 45, 42, 200))
    expect(m.up(touch(6, 45, 42, 250))).toEqual({ type: 'fit' })
    // The third tap starts a fresh sequence.
    m.down(touch(7, 45, 42, 300))
    expect(m.up(touch(7, 45, 42, 350)).type).toBe('click')
  })

  test('two fingers pinch towards the midpoint and pan with it', () => {
    const m = new GestureMachine()
    m.down(touch(1, 100, 100, 0))
    m.down(touch(2, 200, 100, 0))
    const i = m.move(touch(2, 300, 100, 20))
    expect(i.type).toBe('pinch')
    if (i.type === 'pinch') {
      expect(i.factor).toBeCloseTo(2, 9) // distance 100 -> 200
      expect(i.x).toBeCloseTo(200, 9) // the new midpoint
      expect(i.y).toBeCloseTo(100, 9)
      expect(i.dx).toBeCloseTo(50, 9) // the midpoint moved from 150 to 200
      expect(i.dy).toBeCloseTo(0, 9)
    }
    expect(m.up(touch(2, 300, 100, 40))).toEqual({ type: 'none' })
    // The remaining finger continues as a pan without a click on release.
    expect(m.move(touch(1, 110, 100, 60))).toEqual({ type: 'pan', dx: 10, dy: 0 })
    expect(m.up(touch(1, 110, 100, 80))).toEqual({ type: 'none' })
  })
})

test('cancel resets everything', () => {
  const m = new GestureMachine()
  m.down(mouse(10, 10, true))
  expect(m.cancel(1)).toEqual({ type: 'none' })
  expect(m.panning).toBe(false)
  expect(m.move(mouse(50, 50, true))).toEqual({ type: 'none' })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
cd packages/board-element && pnpm vitest run --project node gestures
```

Expected: FAIL, cannot resolve `./gestures.ts`.

- [ ] **Step 3: Implement**

```ts
// packages/board-element/src/gestures.ts
// Turns raw pointer samples into intents, with no DOM, so the rules of the
// game design (§11) are tested as a table in Node:
// - mouse: click on release (the element checks it is the same piece as on
//   press), pan only with the modifier held on press;
// - touch: tap = short press within the slop; beyond it one finger pans;
//   two fingers pinch; two quick taps fit the board.
export type PointerKind = 'mouse' | 'touch' | 'pen'

export interface PointerSample {
  id: number
  x: number
  y: number
  kind: PointerKind
  /** metaKey || ctrlKey at the time of the sample. */
  modifier: boolean
  /** Event timestamp in ms. */
  t: number
}

export type Intent =
  | { type: 'none' }
  | { type: 'click'; pressX: number; pressY: number; x: number; y: number }
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'pinch'; factor: number; x: number; y: number; dx: number; dy: number }
  | { type: 'fit' }

export const TAP_SLOP_PX = 8
export const TAP_MS = 300
export const DOUBLE_TAP_PX = 24
export const DOUBLE_TAP_MS = 300

const NONE: Intent = { type: 'none' }

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export class GestureMachine {
  private pointers = new Map<number, PointerSample>()
  private press: PointerSample | null = null
  private last: PointerSample | null = null
  private moved = false
  private isPanning = false
  private pinchDist = 0
  private pinchMid: { x: number; y: number } | null = null
  private lastTap: { x: number; y: number; t: number } | null = null

  get panning(): boolean {
    return this.isPanning
  }

  down(p: PointerSample): Intent {
    this.pointers.set(p.id, p)
    if (this.pointers.size === 1) {
      this.press = p
      this.last = p
      this.moved = false
      // A mouse (or pen) pans only with the modifier held from the press on.
      this.isPanning = p.kind !== 'touch' && p.modifier
      return NONE
    }
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      if (a && b) {
        this.pinchDist = dist(a, b)
        this.pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      }
      this.moved = true // a pinch is never a tap
      this.isPanning = false
    }
    return NONE
  }

  move(p: PointerSample): Intent {
    if (!this.pointers.has(p.id)) return NONE
    this.pointers.set(p.id, p)
    if (this.pointers.size >= 2 && this.pinchMid) {
      const [a, b] = [...this.pointers.values()]
      if (!a || !b) return NONE
      const d = dist(a, b)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const intent: Intent = {
        type: 'pinch',
        factor: this.pinchDist > 0 ? d / this.pinchDist : 1,
        x: mid.x,
        y: mid.y,
        dx: mid.x - this.pinchMid.x,
        dy: mid.y - this.pinchMid.y,
      }
      this.pinchDist = d
      this.pinchMid = mid
      return intent
    }
    if (!this.press || !this.last || p.id !== this.press.id) return NONE
    const prev = this.last
    this.last = p
    if (this.press.kind === 'touch') {
      if (!this.moved && dist(p, this.press) > TAP_SLOP_PX) {
        this.moved = true
        this.isPanning = true
        return { type: 'pan', dx: p.x - this.press.x, dy: p.y - this.press.y }
      }
      if (this.isPanning) return { type: 'pan', dx: p.x - prev.x, dy: p.y - prev.y }
      return NONE
    }
    if (this.isPanning) return { type: 'pan', dx: p.x - prev.x, dy: p.y - prev.y }
    return NONE
  }

  up(p: PointerSample): Intent {
    if (!this.pointers.has(p.id)) return NONE
    this.pointers.delete(p.id)
    if (this.pointers.size === 1) {
      // From a pinch back to one finger: it continues as a pan, never a tap.
      const [rest] = [...this.pointers.values()]
      this.press = rest ?? null
      this.last = rest ?? null
      this.pinchMid = null
      this.moved = true
      this.isPanning = true
      return NONE
    }
    if (this.pointers.size > 1) return NONE
    const press = this.press
    const wasPanning = this.isPanning
    const moved = this.moved
    this.reset()
    if (!press || press.id !== p.id) return NONE
    if (press.kind === 'touch') {
      if (moved || p.t - press.t > TAP_MS) return NONE
      const tap = { x: p.x, y: p.y, t: p.t }
      if (this.lastTap && tap.t - this.lastTap.t <= DOUBLE_TAP_MS && dist(tap, this.lastTap) <= DOUBLE_TAP_PX) {
        this.lastTap = null
        return { type: 'fit' }
      }
      this.lastTap = tap
      return { type: 'click', pressX: press.x, pressY: press.y, x: p.x, y: p.y }
    }
    if (wasPanning) return NONE
    return { type: 'click', pressX: press.x, pressY: press.y, x: p.x, y: p.y }
  }

  cancel(id: number): Intent {
    this.pointers.delete(id)
    if (this.pointers.size === 0) this.reset()
    return NONE
  }

  private reset(): void {
    this.pointers.clear()
    this.press = null
    this.last = null
    this.moved = false
    this.isPanning = false
    this.pinchDist = 0
    this.pinchMid = null
  }
}
```

- [ ] **Step 4: Run the tests**

```bash
cd packages/board-element && pnpm vitest run --project node gestures
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
deno fmt && git add packages/board-element/src/gestures.ts packages/board-element/src/gestures.test.ts
git commit -m "Board element: pointer state machine for click, pan, pinch and double tap"
```

---

### Task 6: SVG layer: markup, id map and diffing

**Files:**
- Create: `packages/board-element/src/svg-layer.ts`, `packages/board-element/src/svg-layer.browser.test.ts`

**Interfaces:**
- Consumes: `DIRS`, `pieceShape`, `voidStrips`, `generate`, `defaultParams` and types `Board`, `Piece` from `@arrowz/engine`.
- Produces:
  - `interface BoardView { stroke: number; headWidth: number; headHeight: number; colored: boolean; top: number; voids: boolean; ink: string; paper: string; highlight: string }`
  - `DEFAULT_VIEW: BoardView` = `{ stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0, voids: false, ink: '#232447', paper: '#f6f6fa', highlight: '#e8467c' }`
  - `class SvgLayer { readonly svg: SVGSVGElement; setBoard(board: Board | null, view: BoardView): void; get board(): Board | null; get pieceCount(): number; hasPiece(id: number): boolean; nodesOf(id: number): { line: SVGGElement; head: SVGGElement } | null; isExiting(id: number): boolean; animateExit(id: number, dir: number): Promise<void>; shake(id: number, distance: number): Promise<void> }` (`animateExit`, `shake`, `isExiting` are added in Task 7; this task declares `isExiting` returning `false` and leaves the two animations to Task 7)

- [ ] **Step 1: Write the failing tests**

```ts
// packages/board-element/src/svg-layer.browser.test.ts
import { defaultParams, generate } from '@arrowz/engine'
import type { Board } from '@arrowz/engine'
import { beforeEach, describe, expect, test } from 'vitest'
import { DEFAULT_VIEW, SvgLayer } from './svg-layer.ts'

function board(seed = 7, extra: Partial<Board> = {}): Board {
  const r = generate({ ...defaultParams(), W: 30, H: 30, seed })
  return { ...r.board, ...extra }
}

let layer: SvgLayer
beforeEach(() => {
  document.body.innerHTML = ''
  layer = new SvgLayer()
  document.body.append(layer.svg)
})

describe('build', () => {
  test('draws every piece as a line group and a head group', () => {
    const b = board()
    layer.setBoard(b, DEFAULT_VIEW)
    expect(layer.pieceCount).toBe(b.pieces.length)
    expect(layer.svg.querySelectorAll('g.pieces > g[data-id]').length).toBe(b.pieces.length)
    expect(layer.svg.querySelectorAll('g.heads > g[data-id]').length).toBe(b.pieces.length)
    expect(layer.svg.querySelectorAll('g.heads polygon').length).toBe(b.pieces.length)
    expect(layer.svg.querySelectorAll('g.heads circle').length).toBe(b.pieces.length)
    const paper = layer.svg.querySelector('rect.paper')
    expect(paper?.getAttribute('width')).toBe('30')
    expect(paper?.getAttribute('height')).toBe('30')
    expect(paper?.getAttribute('fill')).toBe('#f6f6fa')
  })

  test('a monochrome board carries no per-piece colour attributes', () => {
    layer.setBoard(board(), DEFAULT_VIEW)
    expect(layer.svg.querySelectorAll('g.pieces [stroke]').length).toBe(0)
    expect(layer.svg.querySelectorAll('g.heads [fill]').length).toBe(0)
    expect(layer.svg.querySelector('g.pieces')?.getAttribute('stroke-width')).toBe('0.5')
  })

  test('colored and top set per-piece colours and put the longest on top', () => {
    const b = board()
    layer.setBoard(b, { ...DEFAULT_VIEW, colored: true, top: 3 })
    expect(layer.svg.querySelectorAll('g.top > g[data-id]').length).toBe(3)
    expect(layer.svg.querySelectorAll('g.pieces > g[data-id]').length).toBe(b.pieces.length - 3)
    expect(layer.svg.querySelectorAll('g.pieces > g[data-id][stroke]').length).toBe(b.pieces.length - 3)
    expect(layer.svg.querySelector('g.top')?.getAttribute('stroke-width')).toBe('0.75') // 0.5 * 1.5
    const longest = [...b.pieces].sort((a, c) => c.cells.length - a.cells.length)[0]
    expect(layer.svg.querySelector(`g.top > g[data-id="${longest?.id}"]`)).not.toBeNull()
  })

  test('voids draws the empty cells as strips only when asked', () => {
    const b = board()
    const owner = new Int32Array(b.owner)
    owner[0] = -1
    owner[1] = -1
    const jammed = { ...b, owner }
    layer.setBoard(jammed, DEFAULT_VIEW)
    expect(layer.svg.querySelectorAll('g.voids rect').length).toBe(0)
    layer.setBoard(jammed, { ...DEFAULT_VIEW, voids: true })
    const strip = layer.svg.querySelector('g.voids rect')
    expect(strip?.getAttribute('x')).toBe('0')
    expect(strip?.getAttribute('width')).toBe('2')
  })

  test('the geometry is in cells: the head tip of a right-facing piece is 0.98 past the cell start', () => {
    const b = board()
    layer.setBoard(b, DEFAULT_VIEW)
    const pc = b.pieces.find((p) => p.dir === 1)
    expect(pc).toBeDefined()
    if (!pc) return
    const head = pc.cells[0]
    const polygon = layer.nodesOf(pc.id)?.head.querySelector('polygon')
    const tip = polygon?.getAttribute('points')?.split(' ')[0]?.split(',').map(Number)
    expect(tip?.[0]).toBeCloseTo((head?.x ?? 0) + 0.5 + 0.48, 9)
    expect(tip?.[1]).toBeCloseTo((head?.y ?? 0) + 0.5, 9)
  })

  test('setBoard(null) empties the layer', () => {
    layer.setBoard(board(), DEFAULT_VIEW)
    layer.setBoard(null, DEFAULT_VIEW)
    expect(layer.pieceCount).toBe(0)
    expect(layer.svg.querySelectorAll('g[data-id]').length).toBe(0)
  })
})

describe('diff', () => {
  test('a board minus one piece keeps the other nodes and drops the removed one', () => {
    const b = board()
    layer.setBoard(b, DEFAULT_VIEW)
    const gone = b.pieces[0]
    const kept = b.pieces[1]
    if (!gone || !kept) throw new Error('need two pieces')
    const keptNode = layer.nodesOf(kept.id)?.line
    const owner = new Int32Array(b.owner)
    for (const c of gone.cells) owner[c.y * b.W + c.x] = -1
    layer.setBoard({ ...b, owner, pieces: b.pieces.slice(1) }, DEFAULT_VIEW)
    expect(layer.pieceCount).toBe(b.pieces.length - 1)
    expect(layer.hasPiece(gone.id)).toBe(false)
    expect(layer.nodesOf(kept.id)?.line).toBe(keptNode) // the same DOM node
  })

  test('a fresh board of the same size with new piece objects rebuilds', () => {
    const a = board(7)
    layer.setBoard(a, DEFAULT_VIEW)
    const first = a.pieces[0]
    if (!first) throw new Error('need a piece')
    const node = layer.nodesOf(first.id)?.line
    const b = board(8)
    layer.setBoard(b, DEFAULT_VIEW)
    expect(layer.pieceCount).toBe(b.pieces.length)
    expect(layer.nodesOf(first.id)?.line).not.toBe(node)
  })

  test('a changed view rebuilds every node', () => {
    const b = board()
    layer.setBoard(b, DEFAULT_VIEW)
    const first = b.pieces[0]
    if (!first) throw new Error('need a piece')
    const node = layer.nodesOf(first.id)?.line
    layer.setBoard(b, { ...DEFAULT_VIEW, stroke: 0.3 })
    expect(layer.nodesOf(first.id)?.line).not.toBe(node)
    expect(layer.svg.querySelector('g.pieces')?.getAttribute('stroke-width')).toBe('0.3')
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
cd packages/board-element && pnpm vitest run --project chromium svg-layer
```

Expected: FAIL, cannot resolve `./svg-layer.ts`.

- [ ] **Step 3: Implement the layer (without animations)**

```ts
// packages/board-element/src/svg-layer.ts
// The board as SVG nodes, built imperatively: one string per group inserted
// in one go, then a map from piece id to its two groups (line and head), so
// a click, an animation or a board update touches one piece, never the
// tree. No Lit template ever sees these nodes: on Insane there are ~86 000
// pieces, and a template diff over them would cost more than the change.
import { DIRS, pieceShape, voidStrips } from '@arrowz/engine'
import type { Board, Piece } from '@arrowz/engine'

export interface BoardView {
  /** Stroke width as a fraction of a cell. */
  stroke: number
  /** Head width in cells; 0 = automatic. */
  headWidth: number
  /** Head height in cells; 0 = automatic. */
  headHeight: number
  /** Per-piece hues: the diagnostic mode of the lab. */
  colored: boolean
  /** How many longest pieces are drawn highlighted and on top. */
  top: number
  /** Draw the cells the generator failed to carve. */
  voids: boolean
  ink: string
  paper: string
  highlight: string
}

export const DEFAULT_VIEW: BoardView = {
  stroke: 0.5,
  headWidth: 0,
  headHeight: 0,
  colored: false,
  top: 0,
  voids: false,
  ink: '#232447',
  paper: '#f6f6fa',
  highlight: '#e8467c',
}

const SVG_NS = 'http://www.w3.org/2000/svg'

interface PieceNodes {
  piece: Piece
  line: SVGGElement
  head: SVGGElement
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  return el
}

function sameView(a: BoardView, b: BoardView): boolean {
  return a.stroke === b.stroke && a.headWidth === b.headWidth && a.headHeight === b.headHeight &&
    a.colored === b.colored && a.top === b.top && a.voids === b.voids && a.ink === b.ink && a.paper === b.paper &&
    a.highlight === b.highlight
}

const pt = ([x, y]: [number, number]): string => `${x},${y}`

export class SvgLayer {
  readonly svg: SVGSVGElement
  private readonly paper: SVGRectElement
  private readonly voidsGroup: SVGGElement
  private readonly piecesGroup: SVGGElement
  private readonly topGroup: SVGGElement
  private readonly headsGroup: SVGGElement
  private nodes = new Map<number, PieceNodes>()
  private current: Board | null = null
  private view: BoardView = DEFAULT_VIEW

  constructor() {
    this.svg = svgEl('svg', { xmlns: SVG_NS, preserveAspectRatio: 'xMidYMid meet' })
    this.paper = svgEl('rect', { class: 'paper', x: '0', y: '0', width: '0', height: '0' })
    this.voidsGroup = svgEl('g', { class: 'voids', 'fill-opacity': '.22' })
    this.piecesGroup = svgEl('g', { class: 'pieces', fill: 'none', 'stroke-linecap': 'butt', 'stroke-linejoin': 'round' })
    this.topGroup = svgEl('g', { class: 'top', fill: 'none', 'stroke-linecap': 'butt', 'stroke-linejoin': 'round' })
    this.headsGroup = svgEl('g', { class: 'heads' })
    this.svg.append(this.paper, this.voidsGroup, this.piecesGroup, this.topGroup, this.headsGroup)
  }

  get board(): Board | null {
    return this.current
  }

  get pieceCount(): number {
    return this.nodes.size
  }

  hasPiece(id: number): boolean {
    return this.nodes.has(id)
  }

  nodesOf(id: number): { line: SVGGElement; head: SVGGElement } | null {
    const n = this.nodes.get(id)
    return n ? { line: n.line, head: n.head } : null
  }

  isExiting(_id: number): boolean {
    return false
  }

  /**
   * Draws a board. Same size, same view and no diagnostic mode: only the
   * pieces whose id or object changed are touched, so the game's next board
   * (the same piece objects minus one) costs one pass over the ids.
   * Anything else rebuilds the tree.
   */
  setBoard(board: Board | null, view: BoardView): void {
    const canDiff = board !== null && this.current !== null && board.W === this.current.W && board.H === this.current.H &&
      sameView(view, this.view) && !view.colored && view.top === 0
    this.view = view
    if (board === null) {
      this.clear()
      this.current = null
      return
    }
    if (canDiff) {
      this.diff(board)
    } else {
      this.rebuild(board)
    }
    this.current = board
    this.drawVoids(board)
  }

  private clear(): void {
    this.piecesGroup.replaceChildren()
    this.topGroup.replaceChildren()
    this.headsGroup.replaceChildren()
    this.voidsGroup.replaceChildren()
    this.nodes.clear()
  }

  private drawVoids(board: Board): void {
    this.voidsGroup.setAttribute('fill', this.view.highlight)
    if (!this.view.voids) {
      this.voidsGroup.replaceChildren()
      return
    }
    this.voidsGroup.innerHTML = voidStrips(board)
      .map((s) => `<rect x="${s.x}" y="${s.y}" width="${s.len}" height="1"/>`)
      .join('')
  }

  private rebuild(board: Board): void {
    const v = this.view
    this.clear()
    this.paper.setAttribute('width', String(board.W))
    this.paper.setAttribute('height', String(board.H))
    this.paper.setAttribute('fill', v.paper)
    this.piecesGroup.setAttribute('stroke', v.ink)
    this.piecesGroup.setAttribute('stroke-width', String(v.stroke))
    // Highlighted pieces are thicker, as in toSvg: 1.15× in monochrome, 1.5× in colour.
    const hiWidth = Number((v.stroke * (v.colored ? 1.5 : 1.15)).toFixed(2))
    this.topGroup.setAttribute('stroke-width', String(hiWidth))
    this.headsGroup.setAttribute('fill', v.ink)
    const longest = new Set(
      [...board.pieces].sort((a, b) => b.cells.length - a.cells.length).slice(0, v.top).map((p) => p.id),
    )
    const lines: string[] = []
    const tops: string[] = []
    const heads: string[] = []
    const topHeads: string[] = []
    board.pieces.forEach((pc, i) => {
      const isLong = longest.has(pc.id)
      const col = isLong ? v.highlight : v.colored ? `hsl(${(i * 137.508) % 360} 62% 42%)` : v.ink
      const width = isLong ? hiWidth : v.stroke
      const [line, head] = this.markup(pc, width, col === v.ink ? null : col)
      if (isLong) {
        tops.push(line)
        topHeads.push(head)
      } else {
        lines.push(line)
        heads.push(head)
      }
    })
    this.piecesGroup.innerHTML = lines.join('')
    this.topGroup.innerHTML = tops.join('')
    this.headsGroup.innerHTML = heads.join('') + topHeads.join('')
    this.index(board)
  }

  /** The two groups of one piece as markup: [line group, head group]. */
  private markup(pc: Piece, width: number, colour: string | null): [string, string] {
    const s = pieceShape(pc, { cell: 1, pad: 0, width, headWidth: this.view.headWidth, headHeight: this.view.headHeight })
    const stroke = colour === null ? '' : ` stroke="${colour}"`
    const fill = colour === null ? '' : ` fill="${colour}"`
    const line = `<g data-id="${pc.id}"${stroke}><polyline points="${s.line.map(pt).join(' ')}"/></g>`
    const head = `<g data-id="${pc.id}"${fill}><polygon points="${s.head.map(pt).join(' ')}"/>` +
      `<circle cx="${s.tail.x}" cy="${s.tail.y}" r="${s.tail.r}"/></g>`
    return [line, head]
  }

  /** Fills the id map from the children of the groups, one pass. */
  private index(board: Board): void {
    const byId = new Map<number, Piece>()
    for (const pc of board.pieces) byId.set(pc.id, pc)
    const lines = new Map<number, SVGGElement>()
    for (const g of [this.piecesGroup, this.topGroup]) {
      for (const child of g.children) {
        if (child instanceof SVGGElement) lines.set(Number(child.dataset.id), child)
      }
    }
    for (const child of this.headsGroup.children) {
      if (!(child instanceof SVGGElement)) continue
      const id = Number(child.dataset.id)
      const line = lines.get(id)
      const piece = byId.get(id)
      if (line && piece) this.nodes.set(id, { piece, line, head: child })
    }
  }

  private diff(board: Board): void {
    const next = new Map<number, Piece>()
    for (const pc of board.pieces) next.set(pc.id, pc)
    for (const [id, n] of this.nodes) {
      if (next.get(id) !== n.piece) {
        n.line.remove()
        n.head.remove()
        this.nodes.delete(id)
      }
    }
    for (const pc of board.pieces) {
      if (this.nodes.has(pc.id)) continue
      const [line, head] = this.markup(pc, this.view.stroke, null)
      this.piecesGroup.insertAdjacentHTML('beforeend', line)
      this.headsGroup.insertAdjacentHTML('beforeend', head)
      const lineEl = this.piecesGroup.lastElementChild
      const headEl = this.headsGroup.lastElementChild
      if (lineEl instanceof SVGGElement && headEl instanceof SVGGElement) {
        this.nodes.set(pc.id, { piece: pc, line: lineEl, head: headEl })
      }
    }
  }
}

// DIRS is used by the animations of the next task; keep the import live.
export const DIRECTIONS = DIRS
```

The `DIRECTIONS` line only keeps `DIRS` imported without an unused-import lint error until Task 7 uses it; Task 7 removes that line.

- [ ] **Step 4: Run the tests**

```bash
cd packages/board-element && pnpm vitest run --project chromium svg-layer
```

Expected: 9 passed. If `innerHTML` on the `<g>` produced elements in the wrong namespace (the `polygon` count would be 0), replace the three `innerHTML` assignments with `insertAdjacentHTML('beforeend', …)` after `replaceChildren()`; both parse in the SVG namespace in Chromium, this is only a fallback.

- [ ] **Step 5: Commit**

```bash
deno fmt && git add packages/board-element/src/svg-layer.ts packages/board-element/src/svg-layer.browser.test.ts
git commit -m "Board element: SVG layer with per-piece groups, an id map and diffing by piece identity"
```

---

### Task 7: Animations: exit and shake

**Files:**
- Modify: `packages/board-element/src/svg-layer.ts`, `packages/board-element/src/svg-layer.browser.test.ts`

**Interfaces:**
- Produces on `SvgLayer`: `animateExit(id: number, dir: number): Promise<void>`, `shake(id: number, distance: number): Promise<void>`, `isExiting(id: number): boolean` (real implementation), and `EXIT_MS = 320`, `SHAKE_MS = 230` exported constants.

- [ ] **Step 1: Add the failing tests**

Append to `svg-layer.browser.test.ts`:

```ts
describe('animations', () => {
  test('animateExit removes the nodes when it resolves and marks the piece as exiting meanwhile', async () => {
    const b = board()
    layer.setBoard(b, DEFAULT_VIEW)
    const pc = b.pieces[0]
    if (!pc) throw new Error('need a piece')
    const p = layer.animateExit(pc.id, pc.dir)
    expect(layer.isExiting(pc.id)).toBe(true)
    await p
    expect(layer.hasPiece(pc.id)).toBe(false)
    expect(layer.isExiting(pc.id)).toBe(false)
    expect(layer.svg.querySelectorAll(`g[data-id="${pc.id}"]`).length).toBe(0)
  })

  test('shake resolves and keeps the piece', async () => {
    const b = board()
    layer.setBoard(b, DEFAULT_VIEW)
    const pc = b.pieces[0]
    if (!pc) throw new Error('need a piece')
    await layer.shake(pc.id, 0.3)
    expect(layer.hasPiece(pc.id)).toBe(true)
  })

  test('unknown ids resolve without throwing', async () => {
    layer.setBoard(board(), DEFAULT_VIEW)
    await expect(layer.animateExit(999999, 0)).resolves.toBeUndefined()
    await expect(layer.shake(999999, 1)).resolves.toBeUndefined()
  })

  test('a rebuild cancels a running animation and its promise still resolves', async () => {
    const b = board()
    layer.setBoard(b, DEFAULT_VIEW)
    const pc = b.pieces[0]
    if (!pc) throw new Error('need a piece')
    const p = layer.animateExit(pc.id, pc.dir)
    layer.setBoard(board(8), DEFAULT_VIEW)
    await expect(p).resolves.toBeUndefined()
    expect(layer.isExiting(pc.id)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
cd packages/board-element && pnpm vitest run --project chromium svg-layer
```

Expected: 4 new failures (`animateExit is not a function`, etc.).

- [ ] **Step 3: Implement**

In `svg-layer.ts`, delete the `DIRECTIONS` line, add the constants after `SVG_NS`:

```ts
export const EXIT_MS = 320
export const SHAKE_MS = 230

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

function at<T>(arr: ArrayLike<T>, i: number): T {
  const v = arr[i]
  if (v === undefined) throw new RangeError(`index ${i} out of ${arr.length}`)
  return v
}
```

Add two fields to the class next to `nodes`:

```ts
  private running = new Map<number, Animation[]>()
  private exiting = new Set<number>()
```

Replace the placeholder `isExiting` and add the animations (inside the class, after `nodesOf`):

```ts
  isExiting(id: number): boolean {
    return this.exiting.has(id)
  }

  /**
   * Slides the piece off the board along `dir` while fading, then removes
   * its nodes. The distance is what it takes to clear the board edge from the
   * head plus the piece's own length, so no tail is left behind. On SVG
   * elements a CSS px in translate() is one user unit, that is one cell.
   */
  animateExit(id: number, dir: number): Promise<void> {
    const n = this.nodes.get(id)
    const board = this.current
    if (!n || !board) return Promise.resolve()
    this.cancelRunning(id)
    this.exiting.add(id)
    const { dx, dy } = at(DIRS, dir)
    const head = at(n.piece.cells, 0)
    const toEdge = dx > 0 ? board.W - head.x : dx < 0 ? head.x + 1 : dy > 0 ? board.H - head.y : head.y + 1
    const distance = toEdge + n.piece.cells.length + 1
    const keyframes: Keyframe[] = [
      { transform: 'translate(0px, 0px)', opacity: 1 },
      { transform: `translate(${dx * distance}px, ${dy * distance}px)`, opacity: 0 },
    ]
    const duration = reducedMotion() ? 0 : EXIT_MS
    const anims = [n.line, n.head].map((el) => el.animate(keyframes, { duration, easing: 'ease-in', fill: 'forwards' }))
    this.running.set(id, anims)
    return this.settle(id, anims).then((finished) => {
      if (!finished) return
      n.line.remove()
      n.head.remove()
      this.nodes.delete(id)
    }).finally(() => {
      this.exiting.delete(id)
    })
  }

  /** Nudges the piece `distance` cells along its own direction and back. */
  shake(id: number, distance: number): Promise<void> {
    const n = this.nodes.get(id)
    if (!n) return Promise.resolve()
    this.cancelRunning(id)
    const { dx, dy } = at(DIRS, n.piece.dir)
    const keyframes: Keyframe[] = [
      { transform: 'translate(0px, 0px)', offset: 0 },
      { transform: `translate(${dx * distance}px, ${dy * distance}px)`, offset: 0.4, easing: 'ease-out' },
      { transform: 'translate(0px, 0px)', offset: 1 },
    ]
    const duration = reducedMotion() ? 0 : SHAKE_MS
    const anims = [n.line, n.head].map((el) => el.animate(keyframes, { duration, easing: 'ease-out' }))
    this.running.set(id, anims)
    return this.settle(id, anims).then(() => undefined)
  }

  /** Resolves true when every animation finished, false when one was cancelled. */
  private settle(id: number, anims: Animation[]): Promise<boolean> {
    return Promise.all(anims.map((a) => a.finished)).then(
      () => {
        if (this.running.get(id) === anims) this.running.delete(id)
        return true
      },
      () => false,
    )
  }

  private cancelRunning(id: number): void {
    const anims = this.running.get(id)
    if (!anims) return
    this.running.delete(id)
    for (const a of anims) a.cancel()
  }
```

In `clear()`, before `this.nodes.clear()`:

```ts
    for (const id of [...this.running.keys()]) this.cancelRunning(id)
    this.exiting.clear()
```

In `diff()`, when a piece's nodes are removed, also call `this.cancelRunning(id)` before `n.line.remove()`.

- [ ] **Step 4: Run the tests**

```bash
cd packages/board-element && pnpm vitest run --project chromium svg-layer
```

Expected: 13 passed (the exit test takes ~0.3 s).

- [ ] **Step 5: Commit**

```bash
deno fmt && git add packages/board-element/src/svg-layer.ts packages/board-element/src/svg-layer.browser.test.ts
git commit -m "Board element: exit and shake animations through the Web Animations API"
```

---

### Task 8: The `<arrowz-board>` element

**Files:**
- Create: `packages/board-element/src/arrowz-board.ts`, `packages/board-element/src/arrowz-board.browser.test.ts`
- Modify: `packages/board-element/src/mod.ts`

**Interfaces:**
- Consumes: `SvgLayer`, `BoardView`, `DEFAULT_VIEW` (Task 6/7); `fit`, `zoomAt`, `zoomBy`, `panBy`, `resize`, `screenToCell`, `viewBox`, `Viewport` (Task 4); `GestureMachine`, `PointerSample`, `Intent` (Task 5); `labelsFor` (Task 3); `Board` from `@arrowz/engine`.
- Produces:
  - `class ArrowzBoard extends LitElement` with properties `board: Board | null`, `view: Partial<BoardView>`, `interactive: boolean`, `lang: string`; methods `animateExit(pieceId, dir): Promise<void>`, `shake(pieceId, distance): Promise<void>`, `fit(): void`, `zoomBy(factor): void`; getter `viewport: BoardViewport | null`
  - `interface BoardViewport { cellPx: number; originX: number; originY: number; fitted: boolean; hostWidth: number; hostHeight: number }`
  - `type PieceClickEvent = CustomEvent<{ pieceId: number }>`, `type ViewportChangeEvent = CustomEvent<BoardViewport>`
  - `ZOOM_STEP = 1.25`, `WHEEL_RATE = 0.0015`
  - the tag `arrowz-board` registered on import of `arrowz-board.ts`
  - `mod.ts` exports all of the above plus `BoardView`, `DEFAULT_VIEW`, `BOARD_LABELS`, `BoardLabels`, `BoardLang`, and augments `HTMLElementTagNameMap` and `HTMLElementEventMap`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/board-element/src/arrowz-board.browser.test.ts
import { defaultParams, generate } from '@arrowz/engine'
import type { Board } from '@arrowz/engine'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { ArrowzBoard, ZOOM_STEP } from './arrowz-board.ts'
import type { PieceClickEvent, ViewportChangeEvent } from './arrowz-board.ts'
import './mod.ts'
import { fit, viewBox, zoomBy } from './viewport.ts'

function makeBoard(seed = 7): Board {
  return generate({ ...defaultParams(), W: 30, H: 30, seed }).board
}

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

let el: ArrowzBoard
async function mount(attrs: Record<string, string> = {}): Promise<ArrowzBoard> {
  el = document.createElement('arrowz-board')
  el.style.width = '300px'
  el.style.height = '300px'
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  document.body.append(el)
  el.board = makeBoard()
  await el.updateComplete
  await raf() // the ResizeObserver delivers the host size on its own frame
  await raf()
  return el
}

function svgOf(e: ArrowzBoard): SVGSVGElement {
  const svg = e.shadowRoot?.querySelector('svg')
  if (!svg) throw new Error('no svg in the shadow root')
  return svg
}

/** Screen coordinates (relative to the svg) of the centre of the head cell of a piece. */
function headPoint(e: ArrowzBoard, pieceId: number): { x: number; y: number } {
  const vp = e.viewport
  const pc = e.board?.pieces.find((p) => p.id === pieceId)
  const head = pc?.cells[0]
  if (!vp || !head) throw new Error('need a viewport and a piece')
  return { x: (head.x + 0.5 - vp.originX) * vp.cellPx, y: (head.y + 0.5 - vp.originY) * vp.cellPx }
}

function pointer(type: string, x: number, y: number, init: Partial<PointerEventInit> = {}): PointerEvent {
  const r = svgOf(el).getBoundingClientRect()
  return new PointerEvent(type, {
    bubbles: true,
    composed: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: r.left + x,
    clientY: r.top + y,
    ...init,
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
})
afterEach(() => {
  el?.remove()
})

describe('mount and viewport', () => {
  test('is registered and draws the board fitted to the host', async () => {
    expect(customElements.get('arrowz-board')).toBe(ArrowzBoard)
    await mount()
    const expected = fit({ W: 30, H: 30, hostWidth: 300, hostHeight: 300 })
    expect(svgOf(el).getAttribute('viewBox')).toBe(viewBox(expected))
    expect(el.viewport?.cellPx).toBeCloseTo(10, 6)
    expect(el.viewport?.fitted).toBe(true)
    expect(svgOf(el).querySelectorAll('g.heads > g[data-id]').length).toBe(el.board?.pieces.length)
  })

  test('zoomBy, fit and the buttons change the viewBox and emit viewport-change', async () => {
    await mount()
    const seen: ViewportChangeEvent[] = []
    document.addEventListener('viewport-change', (e) => seen.push(e as ViewportChangeEvent))
    el.zoomBy(2)
    await raf()
    const expected = zoomBy(fit({ W: 30, H: 30, hostWidth: 300, hostHeight: 300 }), 2)
    expect(svgOf(el).getAttribute('viewBox')).toBe(viewBox(expected))
    expect(seen.at(-1)?.detail.cellPx).toBeCloseTo(20, 6)
    expect(seen.at(-1)?.detail.fitted).toBe(false)
    const buttons = el.shadowRoot?.querySelectorAll('button')
    expect(buttons?.length).toBe(3)
    ;(buttons?.[2] as HTMLButtonElement).click() // fit
    await raf()
    expect(el.viewport?.fitted).toBe(true)
    ;(buttons?.[0] as HTMLButtonElement).click() // zoom in
    await raf()
    expect(el.viewport?.cellPx).toBeCloseTo(10 * ZOOM_STEP, 6)
  })

  test('the wheel zooms towards the cursor and is not passive', async () => {
    await mount()
    const r = svgOf(el).getBoundingClientRect()
    const ev = new WheelEvent('wheel', { deltaY: -500, clientX: r.left, clientY: r.top, bubbles: true, cancelable: true })
    svgOf(el).dispatchEvent(ev)
    await raf()
    expect(ev.defaultPrevented).toBe(true)
    expect(el.viewport?.cellPx).toBeGreaterThan(10)
    expect(el.viewport?.originX).toBeCloseTo(0, 6) // the top-left corner stayed put
  })

  test('keys work when the host is focused', async () => {
    await mount()
    el.focus()
    el.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }))
    await raf()
    expect(el.viewport?.cellPx).toBeCloseTo(10 * ZOOM_STEP, 6)
    el.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }))
    await raf()
    expect(el.viewport?.fitted).toBe(true)
    expect(el.tabIndex).toBe(0)
  })

  test('resizing the host refits when fitted', async () => {
    await mount()
    el.style.width = '600px'
    await raf()
    await raf()
    expect(el.viewport?.hostWidth).toBeCloseTo(600, 6)
    expect(el.viewport?.cellPx).toBeCloseTo(10, 6)
    expect(el.viewport?.originX).toBeCloseTo(-15, 6)
  })
})

describe('clicks', () => {
  test('a press and release on the same piece emits piece-click when interactive', async () => {
    await mount({ interactive: '' })
    const pc = el.board?.pieces[0]
    if (!pc) throw new Error('need a piece')
    const seen: PieceClickEvent[] = []
    document.addEventListener('piece-click', (e) => seen.push(e as PieceClickEvent))
    const p = headPoint(el, pc.id)
    svgOf(el).dispatchEvent(pointer('pointerdown', p.x, p.y))
    svgOf(el).dispatchEvent(pointer('pointerup', p.x, p.y))
    expect(seen.length).toBe(1)
    expect(seen[0]?.detail.pieceId).toBe(pc.id)
    expect(seen[0]?.composed).toBe(true)
  })

  test('no piece-click without interactive, with the modifier, or when released over another piece', async () => {
    await mount()
    const [a, b] = el.board?.pieces ?? []
    if (!a || !b) throw new Error('need two pieces')
    const seen: Event[] = []
    document.addEventListener('piece-click', (e) => seen.push(e))
    const pa = headPoint(el, a.id), pb = headPoint(el, b.id)
    svgOf(el).dispatchEvent(pointer('pointerdown', pa.x, pa.y))
    svgOf(el).dispatchEvent(pointer('pointerup', pa.x, pa.y))
    expect(seen.length).toBe(0)
    el.interactive = true
    await el.updateComplete
    svgOf(el).dispatchEvent(pointer('pointerdown', pa.x, pa.y, { ctrlKey: true }))
    svgOf(el).dispatchEvent(pointer('pointermove', pa.x + 30, pa.y, { ctrlKey: true }))
    svgOf(el).dispatchEvent(pointer('pointerup', pa.x + 30, pa.y, { ctrlKey: true }))
    expect(seen.length).toBe(0)
    svgOf(el).dispatchEvent(pointer('pointerdown', pa.x, pa.y))
    svgOf(el).dispatchEvent(pointer('pointerup', pb.x, pb.y))
    expect(seen.length).toBe(0)
  })

  test('a modifier drag pans', async () => {
    await mount()
    el.zoomBy(3)
    await raf()
    const before = el.viewport?.originX ?? 0
    svgOf(el).dispatchEvent(pointer('pointerdown', 150, 150, { metaKey: true }))
    svgOf(el).dispatchEvent(pointer('pointermove', 120, 150, { metaKey: true }))
    svgOf(el).dispatchEvent(pointer('pointerup', 120, 150, { metaKey: true }))
    await raf()
    expect(el.viewport?.originX ?? 0).toBeCloseTo(before + 1, 6) // 30 px at 30 px per cell
  })
})

describe('effects and labels', () => {
  test('animateExit and shake delegate to the layer', async () => {
    await mount()
    const pc = el.board?.pieces[0]
    if (!pc) throw new Error('need a piece')
    await el.animateExit(pc.id, pc.dir)
    expect(svgOf(el).querySelectorAll(`g[data-id="${pc.id}"]`).length).toBe(0)
    const other = el.board?.pieces[1]
    if (!other) throw new Error('need a second piece')
    await el.shake(other.id, 0.3)
    expect(svgOf(el).querySelectorAll(`g[data-id="${other.id}"]`).length).toBe(2)
  })

  test('lang="pl" switches the button labels, anything else is English', async () => {
    await mount({ lang: 'pl' })
    expect(el.shadowRoot?.querySelector('button')?.getAttribute('title')).toBe('Powiększ')
    el.setAttribute('lang', 'de')
    await el.updateComplete
    expect(el.shadowRoot?.querySelector('button')?.getAttribute('title')).toBe('Zoom in')
  })

  test('a board minus one piece keeps the other nodes', async () => {
    await mount()
    const b = el.board
    const kept = b?.pieces[1]
    if (!b || !kept) throw new Error('need a board with two pieces')
    const node = svgOf(el).querySelector(`g.pieces > g[data-id="${kept.id}"]`)
    el.board = { ...b, pieces: b.pieces.slice(1) }
    await el.updateComplete
    expect(svgOf(el).querySelector(`g.pieces > g[data-id="${kept.id}"]`)).toBe(node)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
cd packages/board-element && pnpm vitest run --project chromium arrowz-board
```

Expected: FAIL, cannot resolve `./arrowz-board.ts`.

- [ ] **Step 3: Implement the element**

```ts
// packages/board-element/src/arrowz-board.ts
// The board element: a Lit shell for the chrome (zoom buttons, pan hint)
// around one <svg> owned by SvgLayer. Lit never renders the pieces; it
// renders the handful of nodes around them. The viewport is pure math from
// viewport.ts, the pointer rules are the state machine of gestures.ts, and
// this file only wires DOM events to both and exposes the public API.
import { css, html, LitElement, type PropertyValues } from 'lit'
import type { Board } from '@arrowz/engine'
import { GestureMachine, type Intent, type PointerSample } from './gestures.ts'
import { labelsFor } from './i18n.ts'
import { type BoardView, DEFAULT_VIEW, SvgLayer } from './svg-layer.ts'
import { fit, panBy, resize, screenToCell, type Viewport, viewBox, zoomAt, zoomBy } from './viewport.ts'

export interface BoardViewport {
  cellPx: number
  originX: number
  originY: number
  fitted: boolean
  hostWidth: number
  hostHeight: number
}

export type PieceClickEvent = CustomEvent<{ pieceId: number }>
export type ViewportChangeEvent = CustomEvent<BoardViewport>

/** One button or key press scales by this factor. */
export const ZOOM_STEP = 1.25
/** Wheel factor per event: exp(-deltaY * WHEEL_RATE), smooth for trackpads and mice alike. */
export const WHEEL_RATE = 0.0015

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

export class ArrowzBoard extends LitElement {
  static properties = {
    board: { attribute: false },
    view: { attribute: false },
    interactive: { type: Boolean, reflect: true },
    lang: { type: String },
  }

  declare board: Board | null
  declare view: Partial<BoardView>
  declare interactive: boolean
  declare lang: string

  static styles = css`
    :host {
      display: block;
      position: relative;
      overflow: hidden;
      outline: none;
      background: #f6f6fa;
    }
    :host(:focus-visible) {
      outline: 2px solid #4a7cff;
      outline-offset: -2px;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }
    :host([interactive]) svg.over-piece {
      cursor: pointer;
    }
    svg.panning {
      cursor: grabbing;
    }
    .chrome {
      position: absolute;
      right: 8px;
      bottom: 8px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .hint {
      font: 12px system-ui, sans-serif;
      color: #232447;
      opacity: 0.7;
      margin-right: 6px;
    }
    button {
      width: 32px;
      height: 32px;
      border: 1px solid #c9c9d6;
      border-radius: 6px;
      background: #fff;
      color: #232447;
      font: 18px/1 system-ui, sans-serif;
      cursor: pointer;
    }
    button:hover {
      background: #eef;
    }
    @media (pointer: coarse) {
      .hint {
        display: none;
      }
    }
  `

  private readonly layer = new SvgLayer()
  private readonly gestures = new GestureMachine()
  private vp: Viewport | null = null
  private observer: ResizeObserver | null = null
  private hostWidth = 0
  private hostHeight = 0
  private changeQueued = false

  constructor() {
    super()
    this.board = null
    this.view = {}
    this.interactive = false
    this.lang = ''
    const svg = this.layer.svg
    svg.addEventListener('pointerdown', this.onPointerDown)
    svg.addEventListener('pointermove', this.onPointerMove)
    svg.addEventListener('pointerup', this.onPointerUp)
    svg.addEventListener('pointercancel', this.onPointerCancel)
    // Not passive: the browser zoom must not fire on Ctrl/⌘ + wheel.
    svg.addEventListener('wheel', this.onWheel, { passive: false })
    svg.addEventListener('dblclick', this.onDoubleClick)
    this.addEventListener('keydown', this.onKeyDown)
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0
    this.observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) this.onResize(entry.contentRect.width, entry.contentRect.height)
    })
    this.observer.observe(this)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.observer?.disconnect()
    this.observer = null
  }

  override render() {
    const l = labelsFor(this.lang)
    return html`
      ${this.layer.svg}
      <div class="chrome">
        <span class="hint">${isMac ? l.panHintMac : l.panHintOther}</span>
        <button type="button" title=${l.zoomIn} aria-label=${l.zoomIn} @click=${() => this.zoomBy(ZOOM_STEP)}>+</button>
        <button type="button" title=${l.zoomOut} aria-label=${l.zoomOut} @click=${() => this.zoomBy(1 / ZOOM_STEP)}>−</button>
        <button type="button" title=${l.fit} aria-label=${l.fit} @click=${() => this.fit()}>⤢</button>
      </div>
    `
  }

  override updated(changed: PropertyValues<this>): void {
    if (changed.has('board') || changed.has('view')) {
      const previous = this.layer.board
      this.layer.setBoard(this.board, { ...DEFAULT_VIEW, ...this.view })
      const sizeChanged = !previous || !this.board || previous.W !== this.board.W || previous.H !== this.board.H
      if (sizeChanged) this.vp = null
      this.syncViewport()
    }
  }

  // --- public API ------------------------------------------------------------

  get viewport(): BoardViewport | null {
    const v = this.vp
    if (!v) return null
    return {
      cellPx: v.cellPx,
      originX: v.originX,
      originY: v.originY,
      fitted: v.fitted,
      hostWidth: v.hostWidth,
      hostHeight: v.hostHeight,
    }
  }

  fit(): void {
    if (!this.vp) return
    this.setViewport(fit(this.vp))
  }

  zoomBy(factor: number): void {
    if (!this.vp) return
    this.setViewport(zoomBy(this.vp, factor))
  }

  animateExit(pieceId: number, dir: number): Promise<void> {
    return this.layer.animateExit(pieceId, dir)
  }

  shake(pieceId: number, distance: number): Promise<void> {
    return this.layer.shake(pieceId, distance)
  }

  // --- viewport --------------------------------------------------------------

  private onResize(width: number, height: number): void {
    this.hostWidth = width
    this.hostHeight = height
    this.syncViewport()
  }

  /** Creates or adapts the viewport once both a board and a host size exist. */
  private syncViewport(): void {
    const board = this.board
    if (!board || this.hostWidth <= 0 || this.hostHeight <= 0) {
      this.vp = null
      this.layer.svg.removeAttribute('viewBox')
      return
    }
    const input = { W: board.W, H: board.H, hostWidth: this.hostWidth, hostHeight: this.hostHeight }
    this.setViewport(this.vp ? resize(this.vp, input.hostWidth, input.hostHeight) : fit(input))
  }

  private setViewport(v: Viewport): void {
    this.vp = v
    this.layer.svg.setAttribute('viewBox', viewBox(v))
    if (this.changeQueued) return
    this.changeQueued = true
    requestAnimationFrame(() => {
      this.changeQueued = false
      const detail = this.viewport
      if (detail) this.dispatchEvent(new CustomEvent('viewport-change', { detail, bubbles: true, composed: true }))
    })
  }

  // --- input -----------------------------------------------------------------

  private sample(e: PointerEvent): PointerSample {
    const r = this.layer.svg.getBoundingClientRect()
    const kind = e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse'
    return { id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top, kind, modifier: e.metaKey || e.ctrlKey, t: e.timeStamp }
  }

  private pieceAt(px: number, py: number): number | null {
    const board = this.board
    if (!board || !this.vp) return null
    const cell = screenToCell(this.vp, px, py)
    if (!cell) return null
    // owner holds the piece id, -1 for an uncarved cell and -2 for a void.
    const id = board.owner[cell.y * board.W + cell.x]
    return id === undefined || id < 0 || this.layer.isExiting(id) ? null : id
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    // Synthetic events in tests have no active pointer; capture is best effort.
    try {
      this.layer.svg.setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    this.apply(this.gestures.down(this.sample(e)))
    this.layer.svg.classList.toggle('panning', this.gestures.panning)
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    const s = this.sample(e)
    this.apply(this.gestures.move(s))
    if (!this.gestures.panning) this.layer.svg.classList.toggle('over-piece', this.pieceAt(s.x, s.y) !== null)
  }

  private readonly onPointerUp = (e: PointerEvent): void => {
    this.apply(this.gestures.up(this.sample(e)))
    this.layer.svg.classList.remove('panning')
  }

  private readonly onPointerCancel = (e: PointerEvent): void => {
    this.gestures.cancel(e.pointerId)
    this.layer.svg.classList.remove('panning')
  }

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    if (!this.vp) return
    const r = this.layer.svg.getBoundingClientRect()
    this.setViewport(zoomAt(this.vp, Math.exp(-e.deltaY * WHEEL_RATE), e.clientX - r.left, e.clientY - r.top))
  }

  private readonly onDoubleClick = (): void => {
    this.fit()
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === '+' || e.key === '=') this.zoomBy(ZOOM_STEP)
    else if (e.key === '-') this.zoomBy(1 / ZOOM_STEP)
    else if (e.key === '0') this.fit()
    else return
    e.preventDefault()
  }

  private apply(intent: Intent): void {
    if (intent.type === 'none') return
    if (intent.type === 'fit') {
      this.fit()
      return
    }
    if (!this.vp) return
    if (intent.type === 'pan') {
      this.setViewport(panBy(this.vp, intent.dx, intent.dy))
      return
    }
    if (intent.type === 'pinch') {
      this.setViewport(panBy(zoomAt(this.vp, intent.factor, intent.x, intent.y), intent.dx, intent.dy))
      return
    }
    if (!this.interactive) return
    const pressed = this.pieceAt(intent.pressX, intent.pressY)
    const released = this.pieceAt(intent.x, intent.y)
    if (pressed === null || pressed !== released) return
    this.dispatchEvent(new CustomEvent('piece-click', { detail: { pieceId: pressed }, bubbles: true, composed: true }))
  }
}

if (!customElements.get('arrowz-board')) customElements.define('arrowz-board', ArrowzBoard)
```

`packages/board-element/src/mod.ts`:

```ts
// Public surface of @arrowz/board-element. Importing this module registers
// <arrowz-board>; the types make the tag and its events known to TypeScript.
import type { ArrowzBoard, PieceClickEvent, ViewportChangeEvent } from './arrowz-board.ts'

export { ArrowzBoard, WHEEL_RATE, ZOOM_STEP } from './arrowz-board.ts'
export type { BoardViewport, PieceClickEvent, ViewportChangeEvent } from './arrowz-board.ts'
export { DEFAULT_VIEW, EXIT_MS, SHAKE_MS } from './svg-layer.ts'
export type { BoardView } from './svg-layer.ts'
export { BOARD_LABELS, labelsFor } from './i18n.ts'
export type { BoardLabels, BoardLang } from './i18n.ts'
export { MAX_CELL_PX } from './viewport.ts'

declare global {
  interface HTMLElementTagNameMap {
    'arrowz-board': ArrowzBoard
  }
  interface HTMLElementEventMap {
    'piece-click': PieceClickEvent
    'viewport-change': ViewportChangeEvent
  }
}
```

- [ ] **Step 4: Run the element tests, then everything**

```bash
cd packages/board-element && pnpm vitest run --project chromium arrowz-board
cd ../.. && pnpm nx run-many -t check lint fmt test build -p board-element
```

Expected: 12 element tests pass; all targets green. Known trouble spots and the fix for each:

- Lit warns that `lang` shadows a native property: harmless, but if the attribute → property flow does not work (the `lang="pl"` test fails), replace the `lang` entry in `static properties` with `lang: { type: String, noAccessor: true }` and override `attributeChangedCallback` to call `this.requestUpdate('lang')` when `name === 'lang'`, adding `'lang'` through `static get observedAttributes() { return [...super.observedAttributes, 'lang'] }`.
- If `deno lint` flags the empty `catch {}` (`no-empty`), keep the comment inside it; the comment satisfies the rule.
- `PointerEvent` constructor in the test needs `clientX/clientY` relative to the page; the helper adds the SVG's bounding rect, do not simplify it.
- ResizeObserver in headless Chromium delivers after layout; the two `raf()` in `mount` cover it. If the fit test is flaky, wait on `el.viewport !== null` in a short loop instead.

- [ ] **Step 5: Commit**

```bash
deno fmt && git add packages/board-element/src
git commit -m "Board element: <arrowz-board> with viewport, gestures, effects and typed events"
```

---

### Task 9: Demo page and the Nightmare render budget test

**Files:**
- Create: `packages/board-element/demo/index.html`, `packages/board-element/demo/main.ts`, `packages/board-element/demo/worker.ts`, `packages/board-element/src/perf.browser.test.ts`

**Interfaces:**
- Consumes: `PRESETS` from `@arrowz/engine/presets`, `generate`, `defaultParams` from `@arrowz/engine`, the element from `../src/mod.ts`.
- Produces: `pnpm nx serve board-element` at `http://localhost:8778/`.

- [ ] **Step 1: Write the perf test (it is the CI guard; the manual numbers come from the demo)**

```ts
// packages/board-element/src/perf.browser.test.ts
// Nightmare 100×100 (~1 900 pieces) must build and pan within a loose
// budget; the times are printed so a regression is visible in the log
// before it breaks the assertion. Insane is measured by hand on the demo.
import { defaultParams, generate } from '@arrowz/engine'
import { expect, test } from 'vitest'
import './mod.ts'

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

test('Nightmare builds under 5 s and pans 20 frames', async () => {
  const board = generate({ ...defaultParams(), W: 100, H: 100, seed: 7 }).board
  const el = document.createElement('arrowz-board')
  el.style.width = '800px'
  el.style.height = '800px'
  document.body.append(el)
  await el.updateComplete
  await raf()
  const t0 = performance.now()
  el.board = board
  await el.updateComplete
  await raf()
  const build = performance.now() - t0
  el.zoomBy(3)
  await raf()
  const svg = el.shadowRoot?.querySelector('svg')
  if (!svg) throw new Error('no svg')
  const r = svg.getBoundingClientRect()
  const ev = (type: string, x: number, init: PointerEventInit = {}) =>
    new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'mouse', clientX: r.left + x, clientY: r.top + 400, ctrlKey: true, ...init })
  svg.dispatchEvent(ev('pointerdown', 400))
  const frames: number[] = []
  for (let i = 1; i <= 20; i++) {
    const t = performance.now()
    svg.dispatchEvent(ev('pointermove', 400 - i * 5))
    await raf()
    frames.push(performance.now() - t)
  }
  svg.dispatchEvent(ev('pointerup', 300))
  const worst = Math.max(...frames)
  const mean = frames.reduce((a, b) => a + b, 0) / frames.length
  console.log(`nightmare: pieces=${board.pieces.length} build=${build.toFixed(1)}ms pan mean=${mean.toFixed(1)}ms worst=${worst.toFixed(1)}ms`)
  expect(build).toBeLessThan(5000)
  expect(frames.length).toBe(20)
  el.remove()
})
```

(`Math.max(...frames)` spreads 20 numbers, not an array proportional to pieces; the repository rule targets the latter.)

- [ ] **Step 2: Run it**

```bash
cd packages/board-element && pnpm vitest run --project chromium perf
```

Expected: 1 passed with a log line like `nightmare: pieces=19xx build=…ms pan mean=…ms worst=…ms`.

- [ ] **Step 3: Write the demo**

`packages/board-element/demo/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>arrowz-board demo</title>
  <style>
    html, body { margin: 0; height: 100%; font: 14px system-ui, sans-serif; color: #232447; }
    body { display: grid; grid-template-rows: auto 1fr; }
    header { display: flex; gap: 12px; align-items: center; padding: 8px 12px; border-bottom: 1px solid #ddd; flex-wrap: wrap; }
    arrowz-board { width: 100%; height: 100%; }
    #stats { font-variant-numeric: tabular-nums; white-space: pre; }
    label { display: inline-flex; gap: 4px; align-items: center; }
  </style>
</head>
<body>
  <header>
    <label>Preset <select id="preset"></select></label>
    <label>Seed <input id="seed" type="number" value="7" min="0" style="width: 6em"></label>
    <button id="generate" type="button">Generate</button>
    <label><input id="interactive" type="checkbox" checked> interactive (click = exit, ⇧ click = shake)</label>
    <label><input id="colored" type="checkbox"> colored</label>
    <label><input id="pl" type="checkbox"> lang=pl</label>
    <button id="measure" type="button">Measure pan and zoom</button>
    <span id="stats">idle</span>
  </header>
  <arrowz-board id="board" interactive></arrowz-board>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

`packages/board-element/demo/worker.ts`:

```ts
// Generation off the main thread: Insane takes tens of seconds.
import { defaultParams, generate } from '@arrowz/engine'
import type { ParamKey } from '@arrowz/engine'

export interface DemoRequest {
  overrides: Partial<Record<ParamKey, number>>
  seed: number
}

self.onmessage = (e: MessageEvent<DemoRequest>) => {
  const t0 = performance.now()
  const r = generate({ ...defaultParams(), ...e.data.overrides, seed: e.data.seed })
  self.postMessage({ board: r.board, ok: r.ok, genMs: performance.now() - t0 })
}
```

`packages/board-element/demo/main.ts`:

```ts
// The demo: a preset picker, generation in a worker, the element with the
// two effects wired to clicks, and the measurements of the spec (§11):
// build time, node count, pan and zoom frame times.
import { PRESETS } from '@arrowz/engine/presets'
import type { Board } from '@arrowz/engine'
import '../src/mod.ts'
import type { ArrowzBoard, PieceClickEvent } from '../src/mod.ts'
import type { DemoRequest } from './worker.ts'

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing #${id}`)
  return el as T
}

const board = $<ArrowzBoard>('board')
const stats = $<HTMLSpanElement>('stats')
const preset = $<HTMLSelectElement>('preset')
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

for (const level of PRESETS) {
  const group = document.createElement('optgroup')
  group.label = level.id
  for (const opt of level.options) {
    const o = document.createElement('option')
    o.value = opt.id
    o.textContent = `${opt.id} (${opt.params.W}×${opt.params.H})`
    group.append(o)
  }
  preset.append(group)
}
preset.value = 'nightmare-square'

function say(text: string): void {
  stats.textContent = text
}

$<HTMLButtonElement>('generate').addEventListener('click', () => {
  const opt = PRESETS.flatMap((l) => l.options).find((o) => o.id === preset.value)
  if (!opt) return
  const req: DemoRequest = { overrides: opt.params, seed: Number($<HTMLInputElement>('seed').value) }
  say('generating…')
  worker.postMessage(req)
})

worker.onmessage = async (e: MessageEvent<{ board: Board; ok: boolean; genMs: number }>) => {
  const t0 = performance.now()
  board.board = e.data.board
  await board.updateComplete
  await raf()
  const build = performance.now() - t0
  const nodes = board.shadowRoot?.querySelectorAll('svg *').length ?? 0
  say(`generated in ${e.data.genMs.toFixed(0)} ms (ok=${e.data.ok}), pieces ${e.data.board.pieces.length}, ` +
    `build ${build.toFixed(0)} ms, svg nodes ${nodes}`)
}

$<HTMLInputElement>('interactive').addEventListener('change', (e) => {
  board.interactive = (e.target as HTMLInputElement).checked
})
$<HTMLInputElement>('colored').addEventListener('change', (e) => {
  board.view = { ...board.view, colored: (e.target as HTMLInputElement).checked }
})
$<HTMLInputElement>('pl').addEventListener('change', (e) => {
  board.setAttribute('lang', (e.target as HTMLInputElement).checked ? 'pl' : 'en')
})

let shiftHeld = false
document.addEventListener('keydown', (e) => {
  if (e.key === 'Shift') shiftHeld = true
})
document.addEventListener('keyup', (e) => {
  if (e.key === 'Shift') shiftHeld = false
})

board.addEventListener('piece-click', async (e: PieceClickEvent) => {
  const b = board.board
  const pc = b?.pieces.find((p) => p.id === e.detail.pieceId)
  if (!b || !pc) return
  if (shiftHeld) {
    await board.shake(pc.id, 0.3)
    return
  }
  await board.animateExit(pc.id, pc.dir)
  const owner = new Int32Array(b.owner)
  for (const c of pc.cells) owner[c.y * b.W + c.x] = -1
  board.board = { ...b, owner, pieces: b.pieces.filter((p) => p !== pc) }
})

/** Scripted pan (60 frames of modifier drag) and zoom (60 frames of zoomBy), reporting mean and worst frame time. */
$<HTMLButtonElement>('measure').addEventListener('click', async () => {
  const svg = board.shadowRoot?.querySelector('svg')
  if (!svg || !board.board) return
  board.fit()
  board.zoomBy(3)
  await raf()
  const r = svg.getBoundingClientRect()
  const ev = (type: string, x: number, y: number) =>
    new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'mouse', clientX: r.left + x, clientY: r.top + y, ctrlKey: true })
  const panFrames: number[] = []
  svg.dispatchEvent(ev('pointerdown', r.width / 2, r.height / 2))
  for (let i = 1; i <= 60; i++) {
    const t = performance.now()
    svg.dispatchEvent(ev('pointermove', r.width / 2 - i * 3, r.height / 2 - i * 2))
    await raf()
    panFrames.push(performance.now() - t)
  }
  svg.dispatchEvent(ev('pointerup', r.width / 2 - 180, r.height / 2 - 120))
  const zoomFrames: number[] = []
  for (let i = 0; i < 60; i++) {
    const t = performance.now()
    board.zoomBy(i % 2 === 0 ? 1.03 : 1 / 1.03)
    await raf()
    zoomFrames.push(performance.now() - t)
  }
  const report = (name: string, f: number[]) => {
    let worst = 0, sum = 0
    for (const x of f) {
      sum += x
      if (x > worst) worst = x
    }
    return `${name} mean ${(sum / f.length).toFixed(1)} ms, worst ${worst.toFixed(1)} ms`
  }
  say(`${stats.textContent}\n${report('pan', panFrames)}; ${report('zoom', zoomFrames)}`)
})
```

- [ ] **Step 4: Run the demo and take the measurements**

```bash
pnpm nx build engine && pnpm nx serve board-element
```

Open `http://localhost:8778/`, generate `nightmare-square` and click "Measure pan and zoom"; then `insane-square` (generation takes ~20–30 s in the worker). Write down, for each: generation time, pieces, build time, SVG node count, pan mean/worst, zoom mean/worst, and the machine (Chrome version, CPU). Try a click (exit) and a ⇧ click (shake) on Nightmare and confirm both animate and the exited piece leaves the board. Check `lang=pl` flips the button titles.

Type check of the demo is part of `pnpm run check` (the `demo` folder is in `tsconfig.json`).

- [ ] **Step 5: Run the package verification and commit**

```bash
pnpm nx run-many -t verify -p board-element
deno fmt && git add packages/board-element/demo packages/board-element/src/perf.browser.test.ts
git commit -m "Board element: demo with presets, effects on click and pan/zoom measurements; Nightmare budget test"
```

---

### Task 10: Documentation, measurements and full verification

**Files:**
- Create: `packages/board-element/README.md`
- Modify: `docs/superpowers/specs/2026-09-09-board-element-design.md` (§15), `packages/engine/HISTORY.md` (append a short entry), `.vscode/settings.json` (no change needed; verify)

- [ ] **Step 1: Write the package README**

```markdown
# @arrowz/board-element

`<arrowz-board>`: the board view of Arrowz as a web component (Lit 3). It
draws a `Board` from `@arrowz/engine`, owns zoom and pan, animates the two
effects of the game reducer and reports clicks on pieces. Usable from plain
HTML, React, Angular, Svelte or Vue.

## Usage

```html
<arrowz-board id="board" interactive lang="pl" style="width: 100%; height: 80vh"></arrowz-board>
<script type="module">
  import '@arrowz/board-element'
  import { defaultParams, generate } from '@arrowz/engine'
  const el = document.getElementById('board')
  el.board = generate({ ...defaultParams(), W: 50, H: 50, seed: 7 }).board
  el.addEventListener('piece-click', (e) => console.log('piece', e.detail.pieceId))
</script>
```

Angular: add `CUSTOM_ELEMENTS_SCHEMA` to the component and bind `[board]`.
React: wrap with `@lit/react` (`createComponent`) in the consumer.

## API

| Property | Type | Default |
|---|---|---|
| `board` | `Board \| null` | `null` |
| `view` | `Partial<BoardView>` (`stroke`, `headWidth`, `headHeight`, `colored`, `top`, `voids`, `ink`, `paper`, `highlight`) | CLI defaults |
| `interactive` | `boolean` (attribute, reflected) | `false` |
| `lang` | `'en' \| 'pl'` (attribute) | `'en'` |

| Method | Behaviour |
|---|---|
| `animateExit(pieceId, dir)` | slides the piece off the board along `dir` (0 up, 1 right, 2 down, 3 left) and removes it; resolves when done |
| `shake(pieceId, distance)` | nudges the piece `distance` cells along its direction and back |
| `fit()` | fits the board into the host |
| `zoomBy(factor)` | zooms around the centre, clamped to `[fit, 48 px per cell]` |
| `viewport` | read-only `{ cellPx, originX, originY, fitted, hostWidth, hostHeight }` |

| Event | `detail` |
|---|---|
| `piece-click` | `{ pieceId }`, only when `interactive` |
| `viewport-change` | the viewport snapshot, at most once per frame |

Controls: click without a modifier plays; drag with ⌘ or Ctrl pans; wheel
zooms towards the cursor; one finger pans, two pinch, a tap plays; `+`, `−`,
`0` and the corner buttons zoom and fit; double click or double tap fits.

## Development

```
pnpm nx serve board-element     # demo at http://localhost:8778 with measurements
pnpm nx test board-element      # Vitest: node project + chromium project
pnpm nx verify board-element    # check, lint, fmt, test, build
```
```

- [ ] **Step 2: Record the measurements**

In the spec, replace the `*(pending)*` of §15 with the numbers from Task 9 Step 4 as a small table (Nightmare and Insane: pieces, SVG nodes, build ms, pan mean/worst ms, zoom mean/worst ms, machine), and state whether the acceptance of §11 holds (Nightmare pan under 16 ms; Insane pan under 50 ms and build under 5 s). If it does not hold, say so and name the next step (virtualisation or Canvas spec); do not start it.

Append to `packages/engine/HISTORY.md` an entry dated 2026-09-09: `toSvg` shapes extracted to `geometry.ts` (byte-identical, five golden hashes), first consumer `<arrowz-board>`, and the same measurement table.

- [ ] **Step 3: Full verification**

```bash
deno fmt && pnpm nx run-many -t verify
deno task verify
```

Expected: every project green (engine, cli, board-element). Then push the branch and open the PR:

```bash
git add packages/board-element/README.md docs/superpowers/specs/2026-09-09-board-element-design.md packages/engine/HISTORY.md
git commit -m "Docs: board element README, measured rendering numbers, engine history"
git push -u origin feat/board-element
gh pr create --title "Board element: <arrowz-board> on Lit (road map step 2)" --body-file /tmp/pr-body.md
```

The PR body lists: what the package is, the engine change and its guards, the measurement table, and the rulings taken during execution. Merging is the user's decision.

---

## Self-review

**Spec coverage.** §3 layout → Tasks 2, 3–9; §4 geometry and golden hashes → Task 1; §5 properties, methods, events, board diffing → Tasks 6, 7, 8; §6 rendering structure → Task 6; §7 viewport rules → Task 4; §8 input table (mouse, modifier, wheel, touch, pinch, double tap, keys, buttons, cursor, hint, focus, ResizeObserver) → Tasks 5 and 8; §9 animations → Task 7; §10 localisation → Task 3 and 8; §11 demo and measurement with acceptance → Tasks 9 and 10; §12 tests → every task; §13 Nx, Deno excludes, CI → Task 2; §14 out of scope respected; §15 numbers → Task 10.

**Type consistency.** `SvgLayer.setBoard(board, view)`, `nodesOf`, `hasPiece`, `pieceCount`, `isExiting`, `animateExit`, `shake` are used with the same names in Tasks 6, 7 and 8. `Viewport` functions `fit`, `zoomAt`, `zoomBy`, `panBy`, `resize`, `screenToCell`, `viewBox` match between Task 4 and 8. `GestureMachine.down/move/up/cancel/panning` and the `Intent` variants (`click` with `pressX/pressY/x/y`, `pan` with `dx/dy`, `pinch` with `factor/x/y/dx/dy`, `fit`, `none`) match between Tasks 5 and 8. `voidStrips` returns `{ x, y, len }` in Tasks 1 and 6. `labelsFor` in Tasks 3 and 8.

**Placeholders.** None: every code step has its content; the only deferred value is the measurement table, which is data produced by Task 9 and recorded by Task 10.
