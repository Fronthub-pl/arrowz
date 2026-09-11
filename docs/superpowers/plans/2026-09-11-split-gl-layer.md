# Split gl-layer.ts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut `packages/board-element/src/gl-layer.ts` (1 047 lines) into
modules by responsibility, without changing what the board draws or when.

**Architecture:**
- `GlLayer` stays the only thing the element sees, and its public surface does
  not change.
- It becomes a facade over:
  - `gl-shaders.ts` and `gl-color.ts` (leaves);
  - `rides.ts` (the ride clock, behind a `RideHost` interface);
  - `gl-resources.ts` (every GL object and every write into one);
  - `gl-passes.ts` (the frame's passes as free functions).
- The void strips' geometry moves to the DOM-free `tesselate.ts` as
  `voidQuads`.

**Tech Stack:**
- TypeScript in `packages/board-element`.
- Vitest: a `node` project, and a `chromium` project through Playwright.
- WebGL2.

**Spec:** `docs/superpowers/specs/2026-09-11-split-gl-layer-design.md`. Read it
before any task. Its §4.1 (the host call sequences) and §3.1 (the early
return in `uploadVoids`) are binding.

## Global Constraints

- **A pure refactor.** Every existing test passes, and none of them is
  edited. `src/arrowz-board.ts` is not edited.
  - Check at the end of every task:
    `git diff main --stat -- packages/board-element/src/arrowz-board.ts 'packages/board-element/src/*.test.ts'`
    lists nothing but `tesselate.test.ts`.
- **`GlLayer`'s public members are exactly these:** `canvas`,
  `onForeignLoss`, `supported`, `restore()`, `board`, `pieceCount`,
  `drawsForTest`, `hasColorsForTest`, `voidCountForTest`, `hasPiece()`, `pad`
  (get and set), `setBoard()`, `setViewport()`, `setPoints()`, `isExiting()`,
  `animateExit()`, `shake()`, `drawNowForTest()`, `dispose()`. None is added,
  removed, renamed or re-typed.
- **Code moves with its comments.** A comment that names a method now living
  elsewhere is changed to name its new home. Nothing else about a moved
  comment changes.
- **Error message strings keep their `gl-layer:` prefix** wherever they end
  up. They name the component, not the file.
- **English only** in code, comments and commit messages.
- **Types and style:**
  - No `any`, no non-null assertions (`!`).
  - Lint rules are the root `deno.json`'s "recommended" set, which includes
    `no-this-alias`.
  - Never spread arrays proportional to pieces or cells.
- **Commits:**
  - One commit per task, subject a plain English sentence in the style of
    `git log` (e.g. "The shaders and the colour parser leave gl-layer.ts").
  - No attribution lines, no `feat:` or `refactor:` prefixes.
- **Branch:** `refactor/split-gl-layer`. Never commit to `main`.
- **Commands** run from `packages/board-element`:
  - Node tests: `pnpm vitest run --project node <file>`
  - Browser tests: `pnpm vitest run --project chromium <file>`
  - All tests: `pnpm run test`. Baseline on `main` `a186bce`: **16 files, 247
    passed, 4 skipped**. The 4 skipped are the `ARROWZ_MEASURE` perf cases.
  - Types: `pnpm run check`
  - Lint and format: `deno lint && deno fmt --check`. Run `deno fmt <file>` to
    fix formatting, and accept whatever it produces.
- **Order:** the tasks run strictly in order. Each one cuts code out of the
  same `gl-layer.ts`, so no two of them can run in parallel.

## File map

| File | Responsibility | Task |
| --- | --- | --- |
| `src/gl-shaders.ts` (new) | GLSL sources, `link` | 1 |
| `src/gl-color.ts` (new) | `Rgba`, `rgbaOf`, `hueRgba` | 1 |
| `src/tesselate.ts` | gains `voidQuads` | 2 |
| `src/tesselate.test.ts` | gains three `voidQuads` cases | 2 |
| `src/rides.ts` (new) | `Rider`, `RideHost`, `Rides` | 3 |
| `src/gl-resources.ts` (new) | `GlResources` | 4 |
| `src/gl-passes.ts` (new) | `bindAttrs`, `setView`, the five draw passes | 5 |
| `src/gl-layer.ts` | shrinks to the facade | 1–5 |

## Models (for the controller)

| Task | Implementer | Reviewer | Why |
| --- | --- | --- | --- |
| 1 | Haiku | Sonnet | full file contents given, transcription |
| 2 | Sonnet | Sonnet | TDD, small |
| 3 | Opus | Opus | the one seam that can change behaviour silently (spec §4.1) |
| 4 | Opus | Opus | the context's lifecycle, three call sites |
| 5 | Sonnet | Opus | full code given, but the frame's call order must survive |
| Whole branch | — | Fable | seams between tasks |

## Before Task 1 (controller)

- [ ] Record the perf baseline in the ledger. From `packages/board-element`:

```bash
ARROWZ_MEASURE=1 pnpm vitest run --project chromium src/perf.browser.test.ts 2>&1 | tee /tmp/split-perf-before.txt
```

The figures are headless and relative (see the header of
`perf.browser.test.ts`). They matter only when compared with the same run
after Task 5.

---

### Task 1: The shaders and the colour parser leave gl-layer.ts

**Files:**
- Create: `packages/board-element/src/gl-shaders.ts`
- Create: `packages/board-element/src/gl-color.ts`
- Modify: `packages/board-element/src/gl-layer.ts`:
  - delete lines 23–73 (the four shader sources);
  - delete line 75 (`type Rgba`);
  - delete lines 95–165 (`hueRgba`, `probeCtx`, `probe`, `rgbaOf`, `compile`,
    `link`);
  - rewrite the imports.

**Interfaces:**
- Produces:
  - `gl-shaders.ts`: `VERT`, `FRAG`, `DOT_VERT`, `DOT_FRAG` (each a
    `string`), and `link(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram`.
  - `gl-color.ts`: `type Rgba = [number, number, number, number]`,
    `hueRgba(id: number): Rgba`, and `rgbaOf(css: string): Rgba`.

- [ ] **Step 1: Create `src/gl-shaders.ts`** with exactly this content:

```ts
// The GLSL the layer draws with, and how a pair of sources becomes a program.
// The main program draws every triangle the tesselator makes, in one flat
// colour or the per-vertex one; the dot program draws the point grid.

export const VERT = `#version 300 es
in vec2 a_pos;
in vec4 a_color;
uniform vec2 u_origin;
uniform float u_scale;
uniform vec2 u_size;
uniform vec4 u_flat;
uniform bool u_useAttr;
out vec4 v_color;
void main() {
  vec2 px = (a_pos - u_origin) * u_scale;
  gl_Position = vec4(px.x / u_size.x * 2.0 - 1.0, 1.0 - px.y / u_size.y * 2.0, 0.0, 1.0);
  v_color = u_useAttr ? a_color : u_flat;
}`

export const FRAG = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 color;
void main() { color = v_color; }`

// The dot grid's own program: its fragment shader is the pattern the SVG
// layer tiles as a one-cell <pattern> holding one circle, expressed with no
// geometry at all — one quad over the cells, coloured per fragment.
export const DOT_VERT = `#version 300 es
in vec2 a_pos;
uniform vec2 u_origin;
uniform float u_scale;
uniform vec2 u_size;
out vec2 v_world;
void main() {
  v_world = a_pos;
  vec2 px = (a_pos - u_origin) * u_scale;
  gl_Position = vec4(px.x / u_size.x * 2.0 - 1.0, 1.0 - px.y / u_size.y * 2.0, 0.0, 1.0);
}`

// One dot per cell, at the cell's centre. u_feather is one device pixel in
// cells, so the edge is antialiased at any zoom.
export const DOT_FRAG = `#version 300 es
precision mediump float;
in vec2 v_world;
uniform vec4 u_dot;
uniform float u_radius;
uniform float u_feather;
out vec4 color;
void main() {
  float d = length(fract(v_world) - 0.5);
  float a = 1.0 - smoothstep(u_radius - u_feather, u_radius + u_feather, d);
  if (a <= 0.0) discard;
  color = vec4(u_dot.rgb, u_dot.a * a);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)
  if (!sh) throw new Error('gl-layer: createShader failed')
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`gl-layer: ${gl.getShaderInfoLog(sh) ?? 'shader did not compile'}`)
  }
  return sh
}

export function link(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const p = gl.createProgram()
  if (!p) throw new Error('gl-layer: createProgram failed')
  const vs = compile(gl, gl.VERTEX_SHADER, vert)
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag)
  gl.attachShader(p, vs)
  gl.attachShader(p, fs)
  gl.linkProgram(p)
  const ok = gl.getProgramParameter(p, gl.LINK_STATUS)
  const log = gl.getProgramInfoLog(p)
  // Once a program is linked, its shaders can be released immediately — the
  // normal WebGL idiom, and it keeps every program built here from leaking
  // its two shader objects.
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!ok) throw new Error(`gl-layer: ${log ?? 'program did not link'}`)
  return p
}
```

- [ ] **Step 2: Create `src/gl-color.ts`** with exactly this content:

```ts
// Colours as the GL wants them: four floats, alpha unmultiplied. A CSS colour
// is parsed by the browser through a one-pixel canvas; a diagnostic hue comes
// straight from view.ts's bytes.
import { hueBytes } from './view.ts'

export type Rgba = [number, number, number, number]

/** A piece's diagnostic hue as GL floats, without going through CSS and a canvas. */
export function hueRgba(id: number): Rgba {
  const [r, g, b] = hueBytes(id)
  return [r / 255, g / 255, b / 255, 1]
}

/**
 * A single 2D context, reused by every `rgbaOf` call rather than one canvas
 * created per call. Lazy so importing this module never touches the DOM.
 */
let probeCtx: CanvasRenderingContext2D | null | undefined

function probe(): CanvasRenderingContext2D | null {
  if (probeCtx === undefined) probeCtx = document.createElement('canvas').getContext('2d')
  return probeCtx
}

/**
 * A CSS colour as GL floats. The browser does the parsing, so anything a
 * consumer may put in `view.ink` works — names, hex of either length, hsl(),
 * the colour functions of tomorrow — without this file owning a parser.
 *
 * Resolved once per `BoardView`, in `GlLayer.setBoard` (and per point colour,
 * in `GlLayer.setPoints`) — never from the draw loop. A frame draws up to
 * three colours, and each call here is a canvas readback; paid once per board
 * or view change, it is free, paid sixty times a second it is not.
 */
export function rgbaOf(css: string): Rgba {
  const ctx = probe()
  if (!ctx) return [0, 0, 0, 1]
  // The one pixel is cleared first: `fillRect` composites, so a half
  // transparent colour would otherwise be read over whatever the previous
  // call left there and come back opaque.
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = '#000'
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  const d = ctx.getImageData(0, 0, 1, 1).data
  const [r, g, b, a] = [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, d[3] ?? 255]
  return [r / 255, g / 255, b / 255, a / 255]
}
```

- [ ] **Step 3: Cut the moved code out of `src/gl-layer.ts`.** Delete:
  - the four shader constants and their two comments (from `const VERT` down
    to the closing backtick of `DOT_FRAG`);
  - `type Rgba = [number, number, number, number]`;
  - `hueRgba`, the `probeCtx` comment and variable, `probe`, the `rgbaOf`
    comment and function, `compile`, and `link`.

  Keep `reducedMotion`, the `Rider` interface, `PASSES` and everything below
  them. Then replace the import block at the top of the file (the lines after
  the five-line header comment) with:

```ts
import { voidStrips } from '@arrowz/engine'
import type { Board, Piece } from '@arrowz/engine'
import { hueRgba, type Rgba, rgbaOf } from './gl-color.ts'
import { DOT_FRAG, DOT_VERT, FRAG, link, VERT } from './gl-shaders.ts'
import { exitDistance, exitMs, shakeShift } from './track.ts'
import {
  type Block,
  frontOf,
  type PieceRanges,
  type Ride,
  rideVertexBound,
  type Scene,
  tesselateBoard,
  tesselateColors,
  tesselatePiece,
} from './tesselate.ts'
import { type BoardView, DEFAULT_VIEW, SHAKE_MS } from './view.ts'
import { MIN_POINT_CELL_PX, type Viewport } from './viewport.ts'
```

  (`hueBytes` is no longer imported here; `gl-color.ts` imports it.)

- [ ] **Step 4: Types, lint, format**

Run: `pnpm run check && deno lint && deno fmt --check`
Expected: no errors.

- [ ] **Step 5: The whole suite**

Run: `pnpm run test`
Expected: 16 files, 247 passed, 4 skipped.

- [ ] **Step 6: The purity check**

Run: `git diff main --stat -- src/arrowz-board.ts 'src/*.test.ts'`
Expected: empty output.

- [ ] **Step 7: Commit**

```bash
git add src/gl-shaders.ts src/gl-color.ts src/gl-layer.ts
git commit -m "The shaders and the colour parser leave gl-layer.ts for files of their own"
```

---

### Task 2: The voids' geometry becomes a tested function in tesselate.ts

**Files:**
- Modify: `packages/board-element/src/tesselate.ts`: append `voidQuads` at
  the end of the file.
- Modify: `packages/board-element/src/tesselate.test.ts`: add `voidQuads` to
  the import from `./tesselate.ts`, and append three tests.
- Modify: `packages/board-element/src/gl-layer.ts`: `uploadVoids` calls
  `voidQuads`, and `voidQuads` joins the `./tesselate.ts` import.

**Interfaces:**
- Consumes: nothing new.
- Produces:
  `voidQuads(strips: readonly { x: number; y: number; len: number }[]): Float32Array`,
  twelve floats (two triangles) per strip, in cells.

- [ ] **Step 1: Write the failing tests.** Add `voidQuads,` to the existing
  `import { ... } from './tesselate.ts'` in `src/tesselate.test.ts`, keeping
  the list alphabetical (after `TAIL_SEGMENTS`, `tesselateBoard`,
  `tesselateColors`, `tesselatePiece`). Then append:

```ts
test('voidQuads is empty when there are no strips', () => {
  expect(voidQuads([])).toEqual(new Float32Array(0))
})

test('voidQuads covers a strip with two triangles, in cells', () => {
  // Three cells from (2,5): x runs 2 to 5, y runs 5 to 6.
  expect(Array.from(voidQuads([{ x: 2, y: 5, len: 3 }]))).toEqual([2, 5, 5, 5, 5, 6, 2, 5, 5, 6, 2, 6])
})

test('voidQuads puts strips back to back, twelve floats each', () => {
  const q = voidQuads([{ x: 0, y: 0, len: 1 }, { x: 4, y: 2, len: 2 }])
  expect(q.length).toBe(24)
  expect(Array.from(q.subarray(12))).toEqual([4, 2, 6, 2, 6, 3, 4, 2, 6, 3, 4, 3])
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run --project node src/tesselate.test.ts`
Expected: FAIL. `voidQuads` is not exported, so either the type check in the
transform or the three tests fail.

- [ ] **Step 3: Implement.** Append to the end of `src/tesselate.ts`:

```ts
/**
 * The cells the generator failed to carve, as two triangles per strip, in
 * cells: the geometry of the voids pass. The strips are static, so the layer
 * builds this once per board and never per frame.
 */
export function voidQuads(strips: readonly { x: number; y: number; len: number }[]): Float32Array {
  const data = new Float32Array(strips.length * 12)
  let o = 0
  for (const s of strips) {
    const x0 = s.x, y0 = s.y, x1 = s.x + s.len, y1 = s.y + 1
    data[o++] = x0
    data[o++] = y0
    data[o++] = x1
    data[o++] = y0
    data[o++] = x1
    data[o++] = y1
    data[o++] = x0
    data[o++] = y0
    data[o++] = x1
    data[o++] = y1
    data[o++] = x0
    data[o++] = y1
  }
  return data
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm vitest run --project node src/tesselate.test.ts`
Expected: PASS, all of them.

- [ ] **Step 5: Prove the strip test can fail.** In `voidQuads`, temporarily
  change the fourth write from `data[o++] = y0` to `data[o++] = y1`. Run the
  same command and confirm that "covers a strip with two triangles" and "back
  to back" both FAIL. Undo the change and confirm they PASS again. Say in your
  report that you did this and what you saw.

- [ ] **Step 6: Use it in the layer.** In `src/gl-layer.ts`, add `voidQuads`
  to the `./tesselate.ts` import (alphabetically, after `tesselatePiece`).
  Keep the doc comment above `uploadVoids` as it is, and replace the method's
  body so the whole method reads:

```ts
  private uploadVoids(board: Board | null): void {
    const gl = this.gl
    if (!gl) return
    this.voidBuffer ??= gl.createBuffer()
    const strips = board !== null && this.view.voids ? voidStrips(board) : []
    this.voidStripCount = strips.length
    const data = voidQuads(strips)
    this.voidVertices = strips.length * 6
    if (this.voidBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.voidBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    }
  }
```

- [ ] **Step 7: Types, lint, format, and the whole suite**

Run: `pnpm run check && deno lint && deno fmt --check && pnpm run test`
Expected: no errors. 16 files, **250** passed, 4 skipped.

- [ ] **Step 8: The purity check**

Run: `git diff main --stat -- src/arrowz-board.ts 'src/*.test.ts'`
Expected: only `src/tesselate.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add src/tesselate.ts src/tesselate.test.ts src/gl-layer.ts
git commit -m "The voids' two triangles per strip are built by voidQuads in tesselate.ts, where a test can pin them"
```

---

### Task 3: Rides leave the layer, and reach it only through a host

**Files:**
- Create: `packages/board-element/src/rides.ts`
- Modify: `packages/board-element/src/gl-layer.ts`

**Interfaces:**
- Consumes: `Rgba` from `gl-color.ts` (Task 1).
- Produces:
  - `interface Rider { data: Float32Array; count: number; start: number; color: Rgba }`
  - `interface RideHost`, exactly as in Step 1.
  - `class Rides`, with:
    - `constructor(host: RideHost)`
    - `get riders(): ReadonlyMap<number, Rider>`
    - `isExiting(id: number): boolean`
    - `animateExit(id: number, dir: number): Promise<void>`
    - `shake(id: number, distance: number): Promise<void>`
    - `cancelAll(): void`

**The rule this task exists to keep (spec §4.1):** `host.uploadRiders()` and
`host.schedule()` stay two calls. `cancelRunning` calls `uploadRiders` and
never `schedule`. Do not merge them, and do not add a `schedule()` anywhere
the current code has none. `drawsForTest` counts frames.

- [ ] **Step 1: Create `src/rides.ts`** with exactly this content:

```ts
// The pieces part way down their own track. A ride is a Web Animation clock
// driving `tesselatePiece` once a frame into its rider's own triangles. The
// layer owns the GPU and the frame, so a ride reaches either only through its
// host.
import type { Board, Piece } from '@arrowz/engine'
import type { Rgba } from './gl-color.ts'
import { frontOf, type PieceRanges, type Ride, rideVertexBound, tesselatePiece } from './tesselate.ts'
import { exitDistance, exitMs, shakeShift } from './track.ts'
import { type BoardView, SHAKE_MS } from './view.ts'

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * A piece part way down its own track: its triangles in cells, how many of
 * them are live, where they sit in the rider buffer, and the colour they take.
 * `data` is allocated to `rideVertexBound(piece)` once, at the ride's start,
 * so a frame of a ride allocates nothing.
 */
export interface Rider {
  data: Float32Array
  count: number
  /** Where its vertices begin in the rider buffer; `GlLayer.uploadRiders` owns this. */
  start: number
  color: Rgba
}

/**
 * What a ride needs from the layer it runs on. Uploading and scheduling are
 * two calls, not one: cancelling a ride uploads the riders that are left
 * without asking for a frame, and the layer counts the frames it draws.
 */
export interface RideHost {
  /** The board being drawn, or null before there is one. */
  board(): Board | null
  /** The view the board was tesselated with; read on every frame of a ride. */
  view(): BoardView
  /** Where a piece's triangles are, or null once it has ridden off for good. */
  rangesOf(id: number): PieceRanges | null
  /** Collapses a piece's triangles in the static buffer, or writes them back. */
  setStaticVisible(id: number, visible: boolean): void
  /** The colour a rider takes: the rule of the static passes, for one piece. */
  riderColor(id: number, top: boolean): Rgba
  /** Every rider's triangles into the rider buffer. */
  uploadRiders(): void
  /** Asks for a frame, coalesced with any other asked for before it. */
  schedule(): void
  /** Takes a piece off the board for good. */
  drop(id: number): void
}

export class Rides {
  private readonly host: RideHost
  /** The pieces part way down their own track, by id. */
  private readonly byId = new Map<number, Rider>()
  /** The animations of every ride in flight, by piece id. */
  private readonly running = new Map<number, Animation[]>()
  /** The animations of the exits in flight; what `isExiting` answers from. */
  private readonly exiting = new Map<number, Animation[]>()

  constructor(host: RideHost) {
    this.host = host
  }

  /** The pieces part way down their own track; read by the rider upload and the riders pass. */
  get riders(): ReadonlyMap<number, Rider> {
    return this.byId
  }

  /** True only while an exit is in flight; a piece that shakes is not leaving. */
  isExiting(id: number): boolean {
    return this.exiting.has(id)
  }

  /**
   * Rides the piece off the board head first and drops it. The head runs
   * straight out along `dir`, every other cell passes through the place of the
   * one ahead of it, and the ride is long enough for the tail to clear the
   * edge too. Resolves when the ride ends: if it finished, the piece is gone
   * for good, and if it was superseded, the piece belongs to whatever
   * superseded it.
   */
  animateExit(id: number, dir: number): Promise<void> {
    const board = this.host.board()
    const piece = this.pieceOf(id)
    if (!board || !piece) return Promise.resolve()
    // Resolved before anything is marked or cancelled: a bad `dir` throws here
    // and leaves the piece exactly as it was.
    const distance = exitDistance(piece.cells, dir, board.W, board.H)
    this.cancelRunning(id)
    const duration = reducedMotion() ? 0 : exitMs(distance)
    const { anims, done } = this.ride(id, piece, dir, duration, (p) => p * distance)
    this.exiting.set(id, anims)
    return done.then((finished) => {
      if (finished) this.host.drop(id)
    }).finally(() => {
      // Only the exit that owns the mark may clear it: a superseding exit has
      // already replaced the entry, and its piece is still on its way out.
      if (this.exiting.get(id) === anims) this.exiting.delete(id)
    })
  }

  /** Nudges the piece `distance` cells down its own track and back. */
  shake(id: number, distance: number): Promise<void> {
    const piece = this.pieceOf(id)
    if (!piece) return Promise.resolve()
    this.cancelRunning(id)
    const duration = reducedMotion() ? 0 : SHAKE_MS
    return this.ride(id, piece, piece.dir, duration, (p) => shakeShift(p, distance)).done.then(() => undefined)
  }

  /** Stops every ride in flight, each piece back where it was. */
  cancelAll(): void {
    for (const id of [...this.running.keys()]) this.cancelRunning(id)
    // A ride whose clock has settled but whose promise chain has not run yet
    // has left `running` and still holds its rider, so the loop above misses
    // it. Its piece is written back here rather than dropped: what is thrown
    // away is the rider, and the static buffer is all that would be left to
    // draw the piece.
    for (const id of [...this.byId.keys()]) this.host.setStaticVisible(id, true)
    this.byId.clear()
    this.exiting.clear()
  }

  /**
   * The piece behind an id, or null when the board never drew it or it has
   * ridden off. One scan of the pieces per ride, never per frame: the scene
   * knows where a piece's triangles are but not the cells they came from.
   */
  private pieceOf(id: number): Piece | null {
    if (!this.host.rangesOf(id)) return null
    return this.host.board()?.pieces.find((p) => p.id === id) ?? null
  }

  /**
   * Drives the piece down its own track, `shift(progress)` cells at a time,
   * and registers the ride so a later one can cancel it.
   *
   * The clock is a Web Animation over nothing at all: it gives the ride a
   * `finished` promise and a `cancel()`, so everything built on those keeps
   * working, while the drawing happens per frame. It has to, because a piece
   * on a bent track does not move as one — its line bends through the corners
   * while the head runs straight out — and no interpolated transform can do
   * that. Head, line and tail come out of one `tesselatePiece` call, so they
   * cannot drift apart.
   */
  private ride(
    id: number,
    piece: Piece,
    dir: number,
    duration: number,
    shift: (p: number) => number,
  ): { anims: Animation[]; done: Promise<boolean> } {
    const host = this.host
    const ranges = host.rangesOf(id)
    if (!ranges) return { anims: [], done: Promise.resolve(false) }
    const top = ranges.top
    const front = frontOf(piece, host.view(), top, dir)
    const bound = rideVertexBound(piece)
    const rider: Rider = { data: new Float32Array(bound * 2), count: 0, start: 0, color: host.riderColor(id, top) }
    // The rider takes the piece over from here: the static buffer holds its
    // collapsed triangles until the ride is cancelled, or for good if it ends
    // anywhere but where it started.
    host.setStaticVisible(id, false)
    this.byId.set(id, rider)

    const draw = (shifted: number): void => {
      const track: Ride = { dir, front, shift: shifted }
      const count = tesselatePiece(piece, host.view(), top, track, rider.data)
      // `rider.data` is exactly `rideVertexBound(piece)` long, and a write past
      // the end of a typed array is dropped rather than raised: the bound holds
      // (tesselate.test.ts pins it), and if it ever stopped holding, the piece
      // would come out silently truncated instead of loudly wrong. This runs
      // inside the frame callback, so it does not reject the ride's promise —
      // it lands where an unhandled error lands, which is enough to see it,
      // and the only place the count exists to be checked at all.
      if (count > bound) throw new Error(`gl-layer: piece ${id} rode past its ${bound}-vertex bound`)
      rider.count = count
      host.uploadRiders()
      host.schedule()
    }

    const clock = new Animation(new KeyframeEffect(null, null, { duration, fill: 'forwards' }), document.timeline)
    const anims = [clock]
    const tick = (): void => {
      // Cancelled rides stop here; the last frame of a finished one is not
      // drawn by the loop but by `done`, so that a caller awaiting the ride
      // never sees the piece a frame short of where the ride leaves it.
      if (clock.playState !== 'running') return
      const p = clock.effect?.getComputedTiming().progress
      draw(shift(typeof p === 'number' ? p : 0))
      requestAnimationFrame(tick)
    }
    this.running.set(id, anims)
    clock.play()
    requestAnimationFrame(tick)
    const done = this.settle(id, anims).then((finished) => {
      // A superseding ride has already put this rider away and installed its
      // own; this one must touch neither it nor the piece it now owns.
      if (this.byId.get(id) !== rider) return finished
      this.byId.delete(id)
      // A ride that ends where it started is put back rather than drawn there,
      // so rounding cannot leave the piece a hair off its resting shape. One
      // that ends anywhere else leaves it collapsed, for its caller to drop.
      if (finished && shift(1) === 0) host.setStaticVisible(id, true)
      host.uploadRiders()
      host.schedule()
      return finished
    })
    return { anims, done }
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

  /**
   * Stops the ride of a piece and writes its triangles back into the static
   * buffer at once. Here and not in the cancelled ride's own settling, which
   * cannot know whether the piece is wanted back: a superseding ride collapses
   * it again on the very next line, while a `setBoard` or a `dispose` has no
   * next ride to draw it, and the piece would be gone from the board for as
   * long as it stayed.
   */
  private cancelRunning(id: number): void {
    const anims = this.running.get(id)
    this.running.delete(id)
    if (anims) { for (const a of anims) a.cancel() }
    if (this.byId.delete(id)) this.host.uploadRiders()
    this.host.setStaticVisible(id, true)
  }
}
```

- [ ] **Step 2: Cut the rides out of `src/gl-layer.ts`.** Delete:
  - `function reducedMotion()`;
  - the `Rider` interface and its doc comment;
  - the fields `riders`, `running` and `exiting`, with their doc comments;
  - the methods `pieceOf`, `ride`, `settle`, `cancelRunning` and `cancelAll`,
    with their doc comments.

- [ ] **Step 3: Give the layer its `Rides`.** Directly after the
  `onForeignLoss` field, insert:

```ts
  /**
   * Every ride in flight. Its host is arrow functions over the layer's own
   * private members, so none of them becomes a member the element can reach.
   */
  private readonly rides = new Rides({
    board: () => this.current,
    view: () => this.view,
    rangesOf: (id) => this.rangesOf(id),
    setStaticVisible: (id, visible) => this.setStaticVisible(id, visible),
    riderColor: (id, top) => this.riderColor(id, top),
    uploadRiders: () => this.uploadRiders(),
    schedule: () => this.schedule(),
    drop: (id) => this.drop(id),
  })
```

- [ ] **Step 4: Delegate the three public ride methods.** Replace
  `isExiting`, `animateExit` and `shake`, with their doc comments, by:

```ts
  /** True only while an exit is in flight; a piece that shakes is not leaving. */
  isExiting(id: number): boolean {
    return this.rides.isExiting(id)
  }

  /** Rides the piece off the board head first and drops it; see `Rides.animateExit`. */
  animateExit(id: number, dir: number): Promise<void> {
    return this.rides.animateExit(id, dir)
  }

  /** Nudges the piece `distance` cells down its own track and back. */
  shake(id: number, distance: number): Promise<void> {
    return this.rides.shake(id, distance)
  }
```

- [ ] **Step 5: Point the rest of the layer at `this.rides`.** Every one of
  these is a one-token change:
  - `setBoard`, `onLost` and `dispose`: `this.cancelAll()` becomes
    `this.rides.cancelAll()`.
  - `uploadRiders`: both `this.riders.values()` become
    `this.rides.riders.values()`.
  - `drawRiders`: `this.riders.size` becomes `this.rides.riders.size`, and
    `this.riders.values()` becomes `this.rides.riders.values()`.
  - The doc comment of `onLost`: "cancelled through `cancelAll`" becomes
    "cancelled through `rides.cancelAll()`".
  - The doc comment of `onRestored`: "nothing in `riders` to re-upload here"
    becomes "nothing in `rides.riders` to re-upload here".

  Then fix the imports:
  - Delete the `./track.ts` import.
  - Delete `SHAKE_MS` from the `./view.ts` import.
  - Delete `frontOf`, `type Ride`, `rideVertexBound` and `tesselatePiece`
    from the `./tesselate.ts` import.
  - Change `import type { Board, Piece }` to `import type { Board }`.
  - Add `import { Rides } from './rides.ts'` after the `./gl-shaders.ts`
    import.

  `drop`, `riderColor`, `rangesOf` and `setStaticVisible` stay in the layer,
  unchanged.

- [ ] **Step 6: Types, lint, format**

Run: `pnpm run check && deno lint && deno fmt --check`
Expected: no errors. If `deno lint` reports `no-this-alias` or an unused
import, fix that, not the rule.

- [ ] **Step 7: The ride-heavy browser tests, then the whole suite**

Run: `pnpm vitest run --project chromium src/gl-layer.browser.test.ts src/game.browser.test.ts src/arrowz-board.browser.test.ts`
Expected: PASS.

Run: `pnpm run test`
Expected: 16 files, 250 passed, 4 skipped.

- [ ] **Step 8: The purity check**

Run: `git diff main --stat -- src/arrowz-board.ts 'src/*.test.ts'`
Expected: only `src/tesselate.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add src/rides.ts src/gl-layer.ts
git commit -m "Rides leave the layer for rides.ts and reach it only through a host of eight calls"
```

**For the reviewer of Task 3:**
- Compare every method of `Rides` against the same method on `main`
  (`git show main:packages/board-element/src/gl-layer.ts`), line by line,
  using spec §4.1.
- Then find out whether the test suite guards the `schedule` rule:
  1. Add `this.host.schedule()` as the last line of `cancelRunning`.
  2. Run the three browser files from Step 7.
  3. Report which tests went red. If none did, report exactly that.
  4. Revert the line.

  This step is a measurement, not a fix: do not add a test.

---

### Task 4: One GlResources holds every GL object the layer makes

**Files:**
- Create: `packages/board-element/src/gl-resources.ts`
- Modify: `packages/board-element/src/gl-layer.ts`
- Modify: `packages/board-element/src/rides.ts`: one comment
  (`Rider.start`).

**Interfaces:**
- Consumes:
  - `link`, `VERT`, `FRAG`, `DOT_VERT`, `DOT_FRAG` (Task 1);
  - `Rider` (Task 3);
  - `Scene`, `PieceRanges` and `tesselateColors` from `tesselate.ts`.
- Produces: `class GlResources`, with:
  - `static create(gl: WebGL2RenderingContext): GlResources`
  - `readonly gl`, `readonly program`, `readonly dotProgram`
  - `readonly posBuffer: WebGLBuffer | null`, `readonly quadBuffer: WebGLBuffer | null`
  - `colorBuffer`, `voidBuffer`, `rideBuffer`: each `WebGLBuffer | null`,
    written only by this class
  - `voidVertices: number`, written only by this class
  - `get hasColors(): boolean`
  - `upload(scene: Scene | null, colored: boolean): void`
  - `uploadVoids(data: Float32Array): void`
  - `writeRange(scene: Scene, r: PieceRanges, visible: boolean): void`
  - `uploadRiders(riders: ReadonlyMap<number, Rider>): void`
  - `delete(): void`

- [ ] **Step 1: Create `src/gl-resources.ts`** with exactly this content:

```ts
// Every GL object the layer makes, and every write into one. An instance
// lives exactly as long as the context it was made on: a loss drops the whole
// object and a restore makes a new one, so what the layer holds on the GPU is
// listed once, here, rather than once each for taking, losing and handing
// back a context.
import { DOT_FRAG, DOT_VERT, FRAG, link, VERT } from './gl-shaders.ts'
import type { Rider } from './rides.ts'
import { type PieceRanges, type Scene, tesselateColors } from './tesselate.ts'

export class GlResources {
  readonly gl: WebGL2RenderingContext
  readonly program: WebGLProgram
  readonly dotProgram: WebGLProgram
  /** The whole board's triangles, in cells. */
  readonly posBuffer: WebGLBuffer | null
  /**
   * Scratch storage for whatever single quad the current pass is drawing —
   * the paper's, then the dot grid's. Each pass re-uploads its own quad into
   * it with `bufferData` before drawing, so its contents are never valid
   * across passes: a pass added later must not assume what it holds coming
   * in, only what it writes itself.
   */
  readonly quadBuffer: WebGLBuffer | null
  /** The diagnostic mode's per-vertex colours; a monochrome board never creates it. */
  colorBuffer: WebGLBuffer | null = null
  voidBuffer: WebGLBuffer | null = null
  voidVertices = 0
  /** The riders' own buffer, rewritten whole every frame one of them moves. */
  rideBuffer: WebGLBuffer | null = null
  /** Every rider's triangles back to back, for one upload; grown, never rebuilt per frame. */
  private rideScratch = new Float32Array(0)

  private constructor(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    dotProgram: WebGLProgram,
    posBuffer: WebGLBuffer | null,
    quadBuffer: WebGLBuffer | null,
  ) {
    this.gl = gl
    this.program = program
    this.dotProgram = dotProgram
    this.posBuffer = posBuffer
    this.quadBuffer = quadBuffer
  }

  /**
   * Both programs and the two buffers every frame needs, in the order the
   * layer has always made them. All of it or nothing: a throw from `link`
   * leaves the layer with no resources rather than half of them.
   */
  static create(gl: WebGL2RenderingContext): GlResources {
    const program = link(gl, VERT, FRAG)
    const dotProgram = link(gl, DOT_VERT, DOT_FRAG)
    return new GlResources(gl, program, dotProgram, gl.createBuffer(), gl.createBuffer())
  }

  /** Whether the diagnostic colour buffer exists at all; spec §8 says a monochrome board allocates none. */
  get hasColors(): boolean {
    return this.colorBuffer !== null
  }

  /** The board's triangles, and its colours when the view asks for them. */
  upload(scene: Scene | null, colored: boolean): void {
    const gl = this.gl
    if (!this.posBuffer) return
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, scene?.positions ?? new Float32Array(0), gl.DYNAMIC_DRAW)
    // The colour buffer is the diagnostic mode's alone: a monochrome board
    // takes its colour from a uniform and allocates nothing (spec §8).
    if (scene && colored) {
      this.colorBuffer ??= gl.createBuffer()
      if (this.colorBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, tesselateColors(scene), gl.STATIC_DRAW)
      }
    }
  }

  /** The void strips' triangles, as `voidQuads` built them. */
  uploadVoids(data: Float32Array): void {
    const gl = this.gl
    this.voidBuffer ??= gl.createBuffer()
    this.voidVertices = data.length / 2
    if (this.voidBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.voidBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    }
  }

  /**
   * Collapses one piece's triangles in the static buffer, or writes them back
   * from the scene. A collapsed triangle has all three vertices at the origin,
   * so it covers no fragment at all.
   */
  writeRange(scene: Scene, r: PieceRanges, visible: boolean): void {
    const gl = this.gl
    if (!this.posBuffer) return
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer)
    for (const range of [r.line, r.head]) {
      if (range.count === 0) continue
      const slice = visible
        ? scene.positions.subarray(range.start * 2, (range.start + range.count) * 2)
        : new Float32Array(range.count * 2)
      gl.bufferSubData(gl.ARRAY_BUFFER, range.start * 2 * Float32Array.BYTES_PER_ELEMENT, slice)
    }
  }

  /**
   * Every rider's triangles into the rider buffer, back to back, and each
   * rider's own slice of it recorded. One upload for all of them rather than
   * one buffer per ride: two pieces can be riding at once — two quick clicks
   * are enough — and a buffer holding only whichever uploaded last would drop
   * the other one for the frame. Takes the map rather than an iterator because
   * it walks the riders twice.
   */
  uploadRiders(riders: ReadonlyMap<number, Rider>): void {
    const gl = this.gl
    let total = 0
    for (const r of riders.values()) total += r.count
    if (total === 0) return
    if (this.rideScratch.length < total * 2) this.rideScratch = new Float32Array(total * 2)
    let at = 0
    for (const r of riders.values()) {
      r.start = at
      this.rideScratch.set(r.data.subarray(0, r.count * 2), at * 2)
      at += r.count
    }
    this.rideBuffer ??= gl.createBuffer()
    if (!this.rideBuffer) return
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rideBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.rideScratch.subarray(0, total * 2), gl.DYNAMIC_DRAW)
  }

  /** Deletes every object this holds; the layer drops the instance straight after. */
  delete(): void {
    const gl = this.gl
    gl.deleteProgram(this.program)
    gl.deleteProgram(this.dotProgram)
    if (this.posBuffer) gl.deleteBuffer(this.posBuffer)
    if (this.colorBuffer) gl.deleteBuffer(this.colorBuffer)
    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer)
    if (this.rideBuffer) gl.deleteBuffer(this.rideBuffer)
    if (this.voidBuffer) gl.deleteBuffer(this.voidBuffer)
  }
}
```

- [ ] **Step 2: In `src/rides.ts`**, change the `Rider.start` comment to:

```ts
  /** Where its vertices begin in the rider buffer; `GlResources.uploadRiders` owns this. */
```

- [ ] **Step 3: The layer's fields.** In `src/gl-layer.ts`, delete the fields
  and their doc comments: `program`, `dotProgram`, `posBuffer`,
  `colorBuffer`, `quadBuffer`, `rideBuffer`, `rideScratch`, `voidBuffer`
  and `voidVertices`. Keep `voidStripCount`: spec §3 requires it to stay
  here. Directly after `private gl: WebGL2RenderingContext | null = null`,
  insert:

```ts
  /** Every GL object the layer holds; null exactly when `gl` is, or when making them threw. */
  private res: GlResources | null = null
```

- [ ] **Step 4: `acquire`.** Replace these four lines:

```ts
    this.program = link(gl, VERT, FRAG)
    this.dotProgram = link(gl, DOT_VERT, DOT_FRAG)
    this.posBuffer = gl.createBuffer()
    this.quadBuffer = gl.createBuffer()
```

with:

```ts
    this.res = GlResources.create(gl)
```

  Also, in `acquire`'s doc comment, change "builds both programs and the two
  buffers every frame needs" to "makes the `GlResources` every frame needs".

- [ ] **Step 5: `onLost`.** Replace these seven lines:

```ts
    this.program = null
    this.dotProgram = null
    this.posBuffer = null
    this.colorBuffer = null
    this.quadBuffer = null
    this.voidBuffer = null
    this.rideBuffer = null
```

with:

```ts
    this.res = null
```

  `this.gl = null` stays where it is, directly above.

- [ ] **Step 6: `hasColorsForTest`.** Its body becomes
  `return this.res?.hasColors ?? false`. Its doc comment stays.

- [ ] **Step 7: The four writers.** Keep each method's doc comment, and
  replace the method itself with:

```ts
  private setStaticVisible(id: number, visible: boolean): void {
    const scene = this.scene
    // Only a piece still on the board is written back, while collapsing reads
    // the raw range: `drop` collapses a piece on its way to taking its range
    // away, and a dropped piece must never come back.
    const r = visible ? this.rangesOf(id) : (scene?.rangeOf(id) ?? null)
    if (!scene || !r || !this.res) return
    this.res.writeRange(scene, r, visible)
  }
```

```ts
  private uploadRiders(): void {
    this.res?.uploadRiders(this.rides.riders)
  }
```

```ts
  private upload(): void {
    this.res?.upload(this.scene, this.view.colored)
  }
```

```ts
  private uploadVoids(board: Board | null): void {
    const res = this.res
    if (!res) return
    const strips = board !== null && this.view.voids ? voidStrips(board) : []
    this.voidStripCount = strips.length
    res.uploadVoids(voidQuads(strips))
  }
```

  The doc comments of `upload` and `uploadRiders` moved into
  `GlResources`. Replace them in the layer with:
  - above `upload`: `/** The scene into the static buffers; see `GlResources.upload`. */`
  - above `uploadRiders`: `/** Every rider's triangles into the rider buffer; see `GlResources.uploadRiders`. */`

- [ ] **Step 8: `draw` and its passes read the buffers from `res`.** The
  pass bodies stay in the layer until Task 5; only where they get their GL
  objects changes. Replace `draw`, `drawRiders`, `drawPaper`, `drawDots` and
  `drawVoids` (keep each one's doc comment) with:

```ts
  private draw(): void {
    const gl = this.gl
    const res = this.res
    if (!gl || !res) return
    const program = res.program
    if (!this.resize()) return
    this.frameCount++
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    const vp = this.vp
    const scene = this.scene
    const board = this.current
    if (!vp || !board) return

    gl.useProgram(program)
    const loc = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(program, name)
    gl.uniform2f(loc('u_origin'), vp.originX, vp.originY)
    gl.uniform1f(loc('u_scale'), vp.cellPx * devicePixelRatio)
    gl.uniform2f(loc('u_size'), this.canvas.width, this.canvas.height)

    this.drawPaper(res, board)
    this.drawDots(res, board, vp)
    this.drawVoids(res)
    if (!scene) return

    const useAttr = this.view.colored && res.colorBuffer !== null
    this.bindAttrs(gl, program, res.posBuffer, useAttr ? res.colorBuffer : null)

    for (const pass of PASSES) {
      const range = scene.blocks[pass.block]
      if (range.count === 0) continue
      // Highlighted pieces take one flat colour, so the diagnostic hues never
      // reach them — the same rule the SVG group carried on its stroke.
      gl.uniform1i(loc('u_useAttr'), !pass.highlight && useAttr ? 1 : 0)
      gl.uniform4fv(loc('u_flat'), pass.highlight ? this.highlightRgba : this.inkRgba)
      gl.drawArrays(gl.TRIANGLES, range.start, range.count)
    }

    this.drawRiders(res, vp, board)
  }
```

```ts
  private drawRiders(res: GlResources, vp: Viewport, board: Board): void {
    if (this.rides.riders.size === 0 || !res.rideBuffer) return
    const gl = res.gl
    const program = res.program
    const s = vp.cellPx * devicePixelRatio
    const p = this.padCells
    // All four edges are rounded, and the size is taken from the rounded edges
    // rather than rounded on its own: a width rounded apart from its left edge
    // lands the right edge up to a pixel off the paper's, which is a visible
    // slice of a piece appearing or disappearing as it rides out at the edge.
    const left = Math.round((-p - vp.originX) * s)
    const top = Math.round((-p - vp.originY) * s)
    const right = Math.round((board.W + p - vp.originX) * s)
    const bottom = Math.round((board.H + p - vp.originY) * s)
    gl.enable(gl.SCISSOR_TEST)
    // The scissor box counts from the bottom left, the viewport maths from the top.
    gl.scissor(left, this.canvas.height - bottom, right - left, bottom - top)
    this.bindAttrs(gl, program, res.rideBuffer, null)
    gl.uniform1i(gl.getUniformLocation(program, 'u_useAttr'), 0)
    const flat = gl.getUniformLocation(program, 'u_flat')
    for (const r of this.rides.riders.values()) {
      if (r.count === 0) continue
      gl.uniform4fv(flat, r.color)
      gl.drawArrays(gl.TRIANGLES, r.start, r.count)
    }
    gl.disable(gl.SCISSOR_TEST)
  }
```

```ts
  private drawPaper(res: GlResources, board: Board): void {
    if (!res.quadBuffer) return
    const gl = res.gl
    const p = this.padCells
    const x0 = -p, y0 = -p, x1 = board.W + p, y1 = board.H + p
    const quad = new Float32Array([x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1])
    gl.bindBuffer(gl.ARRAY_BUFFER, res.quadBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW)
    this.bindAttrs(gl, res.program, res.quadBuffer, null)
    gl.uniform1i(gl.getUniformLocation(res.program, 'u_useAttr'), 0)
    gl.uniform4fv(gl.getUniformLocation(res.program, 'u_flat'), this.paperRgba)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }
```

```ts
  private drawDots(res: GlResources, board: Board, vp: Viewport): void {
    const prog = res.dotProgram
    if (!res.quadBuffer) return
    if (!this.pointsVisible || vp.cellPx < MIN_POINT_CELL_PX) return
    const gl = res.gl
    const quad = new Float32Array([0, 0, board.W, 0, board.W, board.H, 0, 0, board.W, board.H, 0, board.H])
    gl.useProgram(prog)
    gl.bindBuffer(gl.ARRAY_BUFFER, res.quadBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW)
    this.bindAttrs(gl, prog, res.quadBuffer, null)
    const scale = vp.cellPx * devicePixelRatio
    const loc = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(prog, name)
    gl.uniform2f(loc('u_origin'), vp.originX, vp.originY)
    gl.uniform1f(loc('u_scale'), scale)
    gl.uniform2f(loc('u_size'), this.canvas.width, this.canvas.height)
    gl.uniform4fv(loc('u_dot'), this.pointRgba)
    gl.uniform1f(loc('u_radius'), this.pointRadius)
    gl.uniform1f(loc('u_feather'), 1 / scale)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    // Restores the main program: every pass after this one — the voids and
    // the piece blocks — assumes it is the active program and current.
    gl.useProgram(res.program)
  }
```

```ts
  private drawVoids(res: GlResources): void {
    if (res.voidVertices === 0 || !res.voidBuffer) return
    const gl = res.gl
    this.bindAttrs(gl, res.program, res.voidBuffer, null)
    gl.uniform1i(gl.getUniformLocation(res.program, 'u_useAttr'), 0)
    const [r, g, b, a] = this.highlightRgba
    gl.uniform4fv(gl.getUniformLocation(res.program, 'u_flat'), [r, g, b, a * 0.22])
    gl.drawArrays(gl.TRIANGLES, 0, res.voidVertices)
  }
```

- [ ] **Step 9: `dispose`.** Replace everything from `const gl = this.gl`
  down to and including `this.gl = null` with:

```ts
    const gl = this.gl
    this.res?.delete()
    this.res = null
    this.gl = null
```

  The `if (gl && !gl.isContextLost() && this.loseExt)` block after it stays
  exactly as it is.

- [ ] **Step 10: Imports.**
  - Delete the `./gl-shaders.ts` import.
  - Delete `tesselateColors` from the `./tesselate.ts` import.
  - Add `import { GlResources } from './gl-resources.ts'` after the
    `./gl-color.ts` import.

- [ ] **Step 11: Nothing else names a GL object on the layer**

Run: `rg -n "this\.(program|dotProgram|posBuffer|colorBuffer|quadBuffer|rideBuffer|voidBuffer|voidVertices|rideScratch)\b" src/gl-layer.ts`
Expected: no output.

- [ ] **Step 12: Types, lint, format, the whole suite**

Run: `pnpm run check && deno lint && deno fmt --check && pnpm run test`
Expected: no errors. 16 files, 250 passed, 4 skipped.

- [ ] **Step 13: The purity check**

Run: `git diff main --stat -- src/arrowz-board.ts 'src/*.test.ts'`
Expected: only `src/tesselate.test.ts`.

- [ ] **Step 14: Commit**

```bash
git add src/gl-resources.ts src/gl-layer.ts src/rides.ts
git commit -m "One GlResources holds every GL object the layer makes, so taking, losing and handing back a context name them once"
```

**For the reviewer of Task 4:** check the three lifecycle sites against
`main`:
- `acquire`: the flags, `loseExt` and blending are unchanged, and their order
  relative to the resources is the same.
- `onLost`: `rides.cancelAll()` still runs before `gl` and `res` are nulled.
- `dispose`: the resources are deleted before the context is given up.

Also confirm that `voidStripCount` and `voidCountForTest` are untouched, and
that §3.1's early return is in place.

---

### Task 5: The frame's passes become functions in gl-passes.ts

**Files:**
- Create: `packages/board-element/src/gl-passes.ts`
- Modify: `packages/board-element/src/gl-layer.ts`

**Interfaces:**
- Consumes:
  - `GlResources` (Task 4);
  - `Rider` (Task 3);
  - `Rgba` (Task 1);
  - `Scene` and `Block` from `tesselate.ts`;
  - `MIN_POINT_CELL_PX` and `Viewport` from `viewport.ts`.
- Produces, all exported from `gl-passes.ts`:
  - `bindAttrs(gl, program, pos, color): void`
  - `setView(gl, program, vp, width, height): void`
  - `interface Points { visible: boolean; rgba: Rgba; radius: number }`
  - `drawPaper(res, board, pad, paper): void`
  - `drawDots(res, board, vp, width, height, points): void`
  - `drawVoids(res, highlight): void`
  - `drawPieces(res, scene, useAttr, ink, highlight): void`
  - `drawRiders(res, riders, vp, board, pad, height): void`

  Exact types are in Step 1.

**The rule this task exists to keep (spec §2.2):** the GL calls of a frame
come out in the same order as on `main`.

- [ ] **Step 1: Create `src/gl-passes.ts`** with exactly this content:

```ts
// What a frame draws, pass by pass. Each pass is a function of the GL objects
// and of the state it is handed, and keeps none of its own, so the order of a
// frame is written in one place: `GlLayer.draw`.
import type { Board } from '@arrowz/engine'
import type { Rgba } from './gl-color.ts'
import type { GlResources } from './gl-resources.ts'
import type { Rider } from './rides.ts'
import type { Block, Scene } from './tesselate.ts'
import { MIN_POINT_CELL_PX, type Viewport } from './viewport.ts'

/** The blocks in draw order, with where each takes its colour from. */
const PASSES: readonly { block: Block; highlight: boolean }[] = [
  { block: 'lines', highlight: false },
  { block: 'topLines', highlight: true },
  { block: 'heads', highlight: false },
  { block: 'topHeads', highlight: true },
]

/** The point grid as the layer was last told to show it. */
export interface Points {
  visible: boolean
  rgba: Rgba
  radius: number
}

/**
 * Binds `pos` to `a_pos`, and either binds `color` to `a_color` or
 * disables it. Every pass on the main program — the paper and the four
 * piece blocks today, plus the voids — routes through here instead of
 * repeating the six lines by hand, so a pass that would hand a colour
 * buffer sized for a different position buffer has to say so explicitly at
 * its own call site, rather than the mismatch surviving because of the
 * order passes happen to run in.
 *
 * Takes the program explicitly so the dot pass's program — which has no
 * `a_color` at all — can share it too: `getAttribLocation` returns -1 for
 * an attribute a program does not declare, and disabling a negative
 * location is a GL error, so that case is a no-op rather than a call.
 */
export function bindAttrs(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  pos: WebGLBuffer | null,
  color: WebGLBuffer | null,
): void {
  const posLoc = gl.getAttribLocation(program, 'a_pos')
  gl.bindBuffer(gl.ARRAY_BUFFER, pos)
  gl.enableVertexAttribArray(posLoc)
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
  const colorLoc = gl.getAttribLocation(program, 'a_color')
  if (colorLoc === -1) return
  if (color) {
    gl.bindBuffer(gl.ARRAY_BUFFER, color)
    gl.enableVertexAttribArray(colorLoc)
    gl.vertexAttribPointer(colorLoc, 4, gl.UNSIGNED_BYTE, true, 0, 0)
  } else {
    gl.disableVertexAttribArray(colorLoc)
  }
}

/**
 * The three uniforms both programs place the board with: the view's top left
 * in cells, a cell's size in device pixels, and the drawing buffer's size.
 * `program` must be the one in use.
 */
export function setView(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  vp: Viewport,
  width: number,
  height: number,
): void {
  gl.uniform2f(gl.getUniformLocation(program, 'u_origin'), vp.originX, vp.originY)
  gl.uniform1f(gl.getUniformLocation(program, 'u_scale'), vp.cellPx * devicePixelRatio)
  gl.uniform2f(gl.getUniformLocation(program, 'u_size'), width, height)
}

/** The paper: one quad over the cells plus the margin. */
export function drawPaper(res: GlResources, board: Board, pad: number, paper: Rgba): void {
  if (!res.quadBuffer) return
  const gl = res.gl
  const p = pad
  const x0 = -p, y0 = -p, x1 = board.W + p, y1 = board.H + p
  const quad = new Float32Array([x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1])
  gl.bindBuffer(gl.ARRAY_BUFFER, res.quadBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW)
  bindAttrs(gl, res.program, res.quadBuffer, null)
  gl.uniform1i(gl.getUniformLocation(res.program, 'u_useAttr'), 0)
  gl.uniform4fv(gl.getUniformLocation(res.program, 'u_flat'), paper)
  gl.drawArrays(gl.TRIANGLES, 0, 6)
}

/**
 * The grid over the cells alone: 0,0 to W,H, the margin left blank, shown
 * only once a cell is big enough to hold a dot — below MIN_POINT_CELL_PX a
 * dense raster of dots moirés instead of reading as dots. The element
 * decides that, because only it knows `cellPx`; the pass refuses on its own
 * as well, so a viewport handed straight to the layer cannot get past it.
 */
export function drawDots(
  res: GlResources,
  board: Board,
  vp: Viewport,
  width: number,
  height: number,
  points: Points,
): void {
  const prog = res.dotProgram
  if (!res.quadBuffer) return
  if (!points.visible || vp.cellPx < MIN_POINT_CELL_PX) return
  const gl = res.gl
  const quad = new Float32Array([0, 0, board.W, 0, board.W, board.H, 0, 0, board.W, board.H, 0, board.H])
  gl.useProgram(prog)
  gl.bindBuffer(gl.ARRAY_BUFFER, res.quadBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW)
  bindAttrs(gl, prog, res.quadBuffer, null)
  setView(gl, prog, vp, width, height)
  gl.uniform4fv(gl.getUniformLocation(prog, 'u_dot'), points.rgba)
  gl.uniform1f(gl.getUniformLocation(prog, 'u_radius'), points.radius)
  gl.uniform1f(gl.getUniformLocation(prog, 'u_feather'), 1 / (vp.cellPx * devicePixelRatio))
  gl.drawArrays(gl.TRIANGLES, 0, 6)
  // Restores the main program: every pass after this one — the voids and
  // the piece blocks — assumes it is the active program and current.
  gl.useProgram(res.program)
}

/** The cells the generator failed to carve, in the highlight colour at .22 opacity — the SVG group's fill-opacity. */
export function drawVoids(res: GlResources, highlight: Rgba): void {
  if (res.voidVertices === 0 || !res.voidBuffer) return
  const gl = res.gl
  bindAttrs(gl, res.program, res.voidBuffer, null)
  gl.uniform1i(gl.getUniformLocation(res.program, 'u_useAttr'), 0)
  const [r, g, b, a] = highlight
  gl.uniform4fv(gl.getUniformLocation(res.program, 'u_flat'), [r, g, b, a * 0.22])
  gl.drawArrays(gl.TRIANGLES, 0, res.voidVertices)
}

/**
 * The four blocks of the static buffer, in `PASSES` order. `useAttr` is true
 * when the board is drawn in its diagnostic colours and the colour buffer
 * exists.
 */
export function drawPieces(res: GlResources, scene: Scene, useAttr: boolean, ink: Rgba, highlight: Rgba): void {
  const gl = res.gl
  const program = res.program
  bindAttrs(gl, program, res.posBuffer, useAttr ? res.colorBuffer : null)
  for (const pass of PASSES) {
    const range = scene.blocks[pass.block]
    if (range.count === 0) continue
    // Highlighted pieces take one flat colour, so the diagnostic hues never
    // reach them — the same rule the SVG group carried on its stroke.
    gl.uniform1i(gl.getUniformLocation(program, 'u_useAttr'), !pass.highlight && useAttr ? 1 : 0)
    gl.uniform4fv(gl.getUniformLocation(program, 'u_flat'), pass.highlight ? highlight : ink)
    gl.drawArrays(gl.TRIANGLES, range.start, range.count)
  }
}

/**
 * The pieces part way down their own track, over the resting ones and
 * clipped to the paper. Only a riding piece is clipped: a scissor over the
 * whole board would cost nothing here, but the rule is the SVG's — a piece
 * leaves at the paper's edge, and nothing else ever reaches it.
 */
export function drawRiders(
  res: GlResources,
  riders: ReadonlyMap<number, Rider>,
  vp: Viewport,
  board: Board,
  pad: number,
  height: number,
): void {
  if (riders.size === 0 || !res.rideBuffer) return
  const gl = res.gl
  const program = res.program
  const s = vp.cellPx * devicePixelRatio
  const p = pad
  // All four edges are rounded, and the size is taken from the rounded edges
  // rather than rounded on its own: a width rounded apart from its left edge
  // lands the right edge up to a pixel off the paper's, which is a visible
  // slice of a piece appearing or disappearing as it rides out at the edge.
  const left = Math.round((-p - vp.originX) * s)
  const top = Math.round((-p - vp.originY) * s)
  const right = Math.round((board.W + p - vp.originX) * s)
  const bottom = Math.round((board.H + p - vp.originY) * s)
  gl.enable(gl.SCISSOR_TEST)
  // The scissor box counts from the bottom left, the viewport maths from the top.
  gl.scissor(left, height - bottom, right - left, bottom - top)
  bindAttrs(gl, program, res.rideBuffer, null)
  gl.uniform1i(gl.getUniformLocation(program, 'u_useAttr'), 0)
  const flat = gl.getUniformLocation(program, 'u_flat')
  for (const r of riders.values()) {
    if (r.count === 0) continue
    gl.uniform4fv(flat, r.color)
    gl.drawArrays(gl.TRIANGLES, r.start, r.count)
  }
  gl.disable(gl.SCISSOR_TEST)
}
```

- [ ] **Step 2: Cut the passes out of `src/gl-layer.ts`.** Delete, with their
  doc comments:
  - the `PASSES` constant;
  - the methods `bindAttrs`, `drawRiders`, `drawPaper`, `drawDots` and
    `drawVoids`.

- [ ] **Step 3: `draw` becomes the frame's order.** Replace `draw` (it has no
  doc comment) with:

```ts
  /** One frame: the passes of `gl-passes.ts`, in the order they have always run. */
  private draw(): void {
    const gl = this.gl
    const res = this.res
    if (!gl || !res) return
    if (!this.resize()) return
    this.frameCount++
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    const vp = this.vp
    const scene = this.scene
    const board = this.current
    if (!vp || !board) return
    const { width, height } = this.canvas

    gl.useProgram(res.program)
    setView(gl, res.program, vp, width, height)
    drawPaper(res, board, this.padCells, this.paperRgba)
    drawDots(res, board, vp, width, height, {
      visible: this.pointsVisible,
      rgba: this.pointRgba,
      radius: this.pointRadius,
    })
    drawVoids(res, this.highlightRgba)
    if (!scene) return
    drawPieces(res, scene, this.view.colored && res.colorBuffer !== null, this.inkRgba, this.highlightRgba)
    drawRiders(res, this.rides.riders, vp, board, this.padCells, height)
  }
```

- [ ] **Step 4: Imports.** The layer's import block becomes exactly:

```ts
import { voidStrips } from '@arrowz/engine'
import type { Board } from '@arrowz/engine'
import { hueRgba, type Rgba, rgbaOf } from './gl-color.ts'
import { drawDots, drawPaper, drawPieces, drawRiders, drawVoids, setView } from './gl-passes.ts'
import { GlResources } from './gl-resources.ts'
import { Rides } from './rides.ts'
import { type PieceRanges, type Scene, tesselateBoard, voidQuads } from './tesselate.ts'
import { type BoardView, DEFAULT_VIEW } from './view.ts'
import type { Viewport } from './viewport.ts'
```

  If `pnpm run check` or `deno lint` reports a name here as unused or
  missing, trust the tool and adjust the list. Then say so in the report.

- [ ] **Step 5: The header comment.** The five-line comment at the top of
  `gl-layer.ts` stays, and gains one paragraph after it:

```ts
//
// This file is the layer's life: the context taken, lost, handed back and
// given up, the board and view it draws, and the order of a frame. What a
// frame draws is gl-passes.ts, the GL objects are gl-resources.ts, and a ride
// is rides.ts.
```

- [ ] **Step 6: Types, lint, format, the whole suite**

Run: `pnpm run check && deno lint && deno fmt --check && pnpm run test`
Expected: no errors. 16 files, 250 passed, 4 skipped.

- [ ] **Step 7: The purity check, and the size**

Run: `git diff main --stat -- src/arrowz-board.ts 'src/*.test.ts'`
Expected: only `src/tesselate.test.ts`.

Run: `wc -l src/gl-layer.ts src/gl-shaders.ts src/gl-color.ts src/gl-resources.ts src/gl-passes.ts src/rides.ts`
Expected: `gl-layer.ts` under 500 lines. Put the numbers in the report.

- [ ] **Step 8: Commit**

```bash
git add src/gl-passes.ts src/gl-layer.ts
git commit -m "The frame's passes become functions in gl-passes.ts, and draw() is left with the order they run in"
```

**For the reviewer of Task 5:**
- Write out the sequence of GL calls one frame makes on `main` (from
  `git show main:packages/board-element/src/gl-layer.ts`), and the sequence it
  makes now. They must match call for call, including the order of the
  `getUniformLocation` and `uniform*` calls within a pass.
- The only permitted difference: `drawDots` sets its three view uniforms
  through `setView`, and computes `1 / (vp.cellPx * devicePixelRatio)` where
  it used to reuse `scale`.

---

## After Task 5 (controller)

- [ ] **Perf, after.** Run the same command as before Task 1, into
  `/tmp/split-perf-after.txt`. Compare it with the "before" figures and
  record both in the ledger. Any gap beyond the run-to-run spread gets
  investigated before the PR.
- [ ] **The whole repository:** from the root, `pnpm nx run-many -t verify`.
- [ ] **The whole-branch review** (Fable), against
  `git diff main...refactor/split-gl-layer`. Point it at spec §2.1, §2.2,
  §3.1 and §4.1, and at anything the per-task reviews could not see:
  - a comment naming something that moved;
  - a doc comment left behind on the wrong side of a seam;
  - an import that only type-checks by accident.
- [ ] **The demo, with a real mouse:** `pnpm nx serve board-element`. Try:
  - a click that exits;
  - a blocked click that shakes;
  - two quick exits at once;
  - a pan and a zoom;
  - the dot grid on and off;
  - a board with voids;
  - the diagnostic colours.
- [ ] **The PR** against `main`, titled "Split gl-layer.ts by responsibility".
  The body points at the spec, lists the modules and the one deliberate
  difference (spec §3.2), and gives the perf before and after. Merging is the
  user's call.
