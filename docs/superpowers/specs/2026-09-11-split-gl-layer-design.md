# Splitting `gl-layer.ts` by responsibility

Date: 2026-09-11. Status: draft design, awaiting review.

Baseline: `main` at `a186bce` (PRs #33, #34, #35 and #37 merged). Branch
`refactor/split-gl-layer`. This is the second of three passes agreed after
PR #34: (1) rounded arrows, done; (2) this split, a pure refactor; (3) one
round primitive in the fragment shader covering the tail cap and the corners
together. Nothing here changes what the board draws or when.

## 1. Why

`packages/board-element/src/gl-layer.ts` is 1 047 lines holding five
responsibilities that only share a class:

1. **Shaders** — four GLSL sources, `compile`, `link`.
2. **Colours** — a CSS colour resolved to GL floats through a canvas probe,
   and the diagnostic hue.
3. **The context's life** — acquire, lost, restored, restore, dispose, and the
   `devicePixelRatio` watch (reworked by PR #35).
4. **Rides** — the Web Animation clock, riders, cancelling, the exit and the
   shake.
5. **Passes** — paper, dots, voids, the four piece blocks, the riders.

Pass 3 will change the shaders, the attribute layout (`bindAttrs`) and the
tail's tesselation. After this split its diff should land in the shader and
pass modules and leave the context's life, which PR #35 just made correct,
untouched.

One concrete hazard also goes away. The seven GL objects (two programs, five
buffers) are listed by hand three times — in `acquire`, `onLost` and
`dispose` — and pass 3 would make every one of those lists one entry longer.

## 2. The modules

All paths under `packages/board-element/src/`.

| Module | Holds | Depends on |
| --- | --- | --- |
| `gl-shaders.ts` | `VERT`, `FRAG`, `DOT_VERT`, `DOT_FRAG`, `link` (with `compile` private to it) | nothing |
| `gl-color.ts` | `Rgba`, `rgbaOf` and its lazy probe context, `hueRgba` | `view.ts` |
| `gl-resources.ts` | class `GlResources`: the GL objects and every write into them | `gl-shaders.ts`, `tesselate.ts`, `rides.ts` (type only) |
| `gl-passes.ts` | `bindAttrs`, `PASSES`, `setView`, `drawPaper`, `drawDots`, `drawVoids`, `drawPieces`, `drawRiders` — free functions | `gl-resources.ts`, `gl-color.ts`, `viewport.ts`, `tesselate.ts`, `rides.ts` (type only) |
| `rides.ts` | `Rider`, `RideHost`, `reducedMotion`, class `Rides` | `track.ts`, `tesselate.ts`, `view.ts`, `gl-color.ts` (type only) |
| `tesselate.ts` | gains `voidQuads(strips)` | as today |
| `gl-layer.ts` | class `GlLayer`, the facade: canvas, context life, board state, setters, `schedule`/`resize`/`draw` | all of the above |

There are no import cycles: `rides.ts` and `gl-resources.ts` meet only at the
`Rider` type.

Code moves **with its comments**. Any comment that names a method now living
elsewhere is changed to name its new home. The ones known today are
`Rider.start` ("`uploadRiders` owns this"), the `rgbaOf` doc (which names
`setBoard`, `setPoints` and `draw()`), and the `GlLayer` constructor and
`acquire` docs.

### 2.1 `GlLayer`'s public surface does not change

Every public member keeps its name, signature and behaviour: `canvas`,
`onForeignLoss`, `supported`, `restore()`, `board`, `pieceCount`,
`drawsForTest`, `hasColorsForTest`, `voidCountForTest`, `hasPiece()`, `pad`
(get and set), `setBoard()`, `setViewport()`, `setPoints()`, `isExiting()`,
`animateExit()`, `shake()`, `drawNowForTest()`, `dispose()`. Nothing is added.

Acceptance: once the split is done, `git diff main` shows **no change** to
`arrowz-board.ts` or to any existing test, apart from the new `voidQuads`
cases in `tesselate.test.ts`.

### 2.2 The frame's order of GL calls does not change

`draw()` keeps doing what it does today, in the same order: resize (or skip
the frame), count the frame, clear, return if there is no viewport or board,
`useProgram(main)`, the three view uniforms, paper, dots (which switch to the
dot program and back), voids, return if there is no scene, the four piece
blocks, the riders.

## 3. `GlResources`

```ts
export class GlResources {
  readonly gl: WebGL2RenderingContext
  readonly program: WebGLProgram
  readonly dotProgram: WebGLProgram
  /** created eagerly, as `acquire` creates them today */
  posBuffer, quadBuffer
  /** created lazily, where they are created today */
  colorBuffer, voidBuffer, rideBuffer
  voidVertices: number        // from uploadVoids
  // rideScratch: private, grown by uploadRiders

  static create(gl): GlResources          // links both programs, creates pos and quad
  get hasColors(): boolean                // colorBuffer !== null
  upload(scene: Scene | null, colored: boolean): void
  uploadVoids(data: Float32Array): void
  writeRange(scene: Scene, ranges: PieceRanges, visible: boolean): void
  uploadRiders(riders: ReadonlyMap<number, Rider>): void   // walks them twice
  delete(): void                          // deletes every object it holds
}
```

Buffer fields keep the types they have today. Each method's body is the
matching body in `gl-layer.ts` today, with `this.gl` taken from the object:
`upload` is `upload()`, `uploadVoids` is the second half of `uploadVoids()`
(from `voidBuffer ??=` on), `writeRange` is the loop in `setStaticVisible()`,
`uploadRiders` is `uploadRiders()`, and `delete` is the `if (gl)` block of
`dispose()`.

The facade holds `gl: WebGL2RenderingContext | null` (it answers `supported`)
and `res: GlResources | null`:

- `acquire` sets `gl`, the flags and `loseExt` exactly as today, then
  `this.res = GlResources.create(gl)` in place of the two `link` calls and the
  two `createBuffer` calls, then enables blending and watches the ratio as
  today.
- `onLost` sets `this.res = null` in place of the seven `= null` lines.
- `dispose` calls `this.res?.delete()` and then sets `res` and `gl` to null.
- `hasColorsForTest` returns `this.res?.hasColors ?? false`.

A `GlResources` exists only while the context it was made on is live, so
`res !== null` implies `gl !== null`. Every guard in the facade that reads
`!gl || !this.posBuffer` (or similar) becomes `!this.res`.

`voidStripCount` **stays in the facade**. It is counted from the board and
the view, not from the GPU, and `voidCountForTest` must keep answering while
a context is lost.

### 3.1 The facade's `uploadVoids` keeps its early return

Today `uploadVoids(board)` returns before counting when there is no context.
That order is kept:

```ts
private uploadVoids(board: Board | null): void {
  const res = this.res
  if (!res) return
  const strips = board !== null && this.view.voids ? voidStrips(board) : []
  this.voidStripCount = strips.length
  res.uploadVoids(voidQuads(strips))
}
```

### 3.2 The one deliberate difference

Today, a throw from `link` part way through `acquire` leaves a partial set:
`program` linked, `dotProgram` and both buffers still null. After the split,
`create` returns the whole set or throws before `res` is assigned, so the set
is either complete or absent. If the second `link` throws, the first program
is left for the context to take with it, where today `dispose` would have
deleted it. The shaders are constants, so the path cannot be reached short of
a driver that rejects them. It is named here so that no
one has to discover it.

## 4. `Rides` and its host

```ts
export interface RideHost {
  board(): Board | null
  view(): BoardView
  rangesOf(id: number): PieceRanges | null
  setStaticVisible(id: number, visible: boolean): void
  riderColor(id: number, top: boolean): Rgba
  uploadRiders(): void
  schedule(): void
  drop(id: number): void
}

export class Rides {
  constructor(host: RideHost)
  readonly riders: ReadonlyMap<number, Rider>   // read by the upload and the riders pass
  isExiting(id: number): boolean
  animateExit(id: number, dir: number): Promise<void>
  shake(id: number, distance: number): Promise<void>
  cancelAll(): void
}
```

`GlLayer` builds the host as a private field initialised with an object
literal of arrow functions, which close over the layer's own private methods
and fields. `board` and `view` are functions rather than getters because a
getter in an object literal would need `this` aliased (`deno lint`'s
`no-this-alias`). It does
**not** declare `implements RideHost`, because that would make
`setStaticVisible`, `drop` and `uploadRiders` public members of the element's
layer.

`Rides` moves `ride`, `settle`, `cancelRunning`, `pieceOf` and the maps
`riders`, `running` and `exiting` out of `GlLayer` unchanged, with `this.X` of
the layer read through the host. `host.view()` is called inside the per-frame
`draw` closure, as `this.view` is read there today, not captured once at the
ride's start.

`drop`, `dropped`, `pieceTotal`, `riderColor` and `setStaticVisible` stay in
the facade. They are board state, and `setBoard` and `onRestored` use them
without any ride in flight.

### 4.1 The host call sequences

These are today's sequences and must survive exactly. The reviewer of the
task that moves rides checks them line by line against `main`.

- **`cancelRunning(id)`**: cancel the animations; if a rider was deleted,
  `host.uploadRiders()`; then `host.setStaticVisible(id, true)`.
  **No `host.schedule()`.** Merging `uploadRiders` and `schedule` into one
  "changed" call is the natural simplification, and it is wrong: every
  cancel would ask for a frame it does not ask for today, and
  `drawsForTest` counts frames.
- **`cancelAll()`**: `cancelRunning` for every id in `running`; then
  `host.setStaticVisible(id, true)` for every id still in `riders`; clear
  `riders` and `exiting`.
- **`ride(...)`**, at the start: `host.rangesOf(id)` (none: nothing ridden,
  `done` resolves false); `host.riderColor(id, top)`;
  `host.setStaticVisible(id, false)`.
  - Per frame: `tesselatePiece(piece, host.view(), ...)`, the bound check that
    throws, then `host.uploadRiders()` and `host.schedule()`.
  - When it settles and still owns its rider: delete it; if it finished and
    `shift(1) === 0`, `host.setStaticVisible(id, true)`; then
    `host.uploadRiders()` and `host.schedule()`.
- **`animateExit(id, dir)`**: `host.board()` and `pieceOf`; `exitDistance`
  (which may throw, leaving everything as it was); `cancelRunning`; the ride;
  and, if it finished, `host.drop(id)`.
- **`shake(id, distance)`**: `pieceOf`; `cancelRunning`; the ride.

`GlLayer` calls `rides.cancelAll()` in the same three places it calls
`cancelAll()` today: `setBoard`, `onLost` and `dispose`.

## 5. `gl-passes.ts`

Free functions. Each takes the `GlResources` and the state it reads as
explicit arguments; none of them holds state.

```ts
bindAttrs(gl, program, pos, color): void              // unchanged
setView(gl, program, vp, width, height): void         // u_origin, u_scale, u_size
drawPaper(res, board, pad, paper: Rgba): void
drawDots(res, board, vp, width, height, points: { visible: boolean; rgba: Rgba; radius: number }): void
drawVoids(res, highlight: Rgba): void
drawPieces(res, scene, useAttr: boolean, ink: Rgba, highlight: Rgba): void
drawRiders(res, riders: ReadonlyMap<number, Rider>, vp, board, pad, height): void
```

`setView` is the only deduplication in this file. Both programs set the same
three uniforms today, each on itself, and after the split both call
`setView`; the GL calls are the same ones. `drawDots` keeps both of its
refusals, the `visible` flag and `MIN_POINT_CELL_PX`, and still restores the
main program (`res.program`) before it returns.

`drawPieces` is the loop over `PASSES` in `draw()`, with the `bindAttrs` call
before it. The facade computes `useAttr` as `view.colored &&
res.colorBuffer !== null`, as today.

## 6. `voidQuads`

The twelve-float loop in `uploadVoids()` becomes a pure function in
`tesselate.ts`:

```ts
/** Two triangles per void strip, in cells: the pass the voids draw with. */
export function voidQuads(strips: readonly { x: number; y: number; len: number }[]): Float32Array
```

The engine exports no name for a strip (`voidStrips()` returns an inline
`{ x, y, len }[]`), and the split adds none, so the parameter is typed
structurally and the engine is untouched. `tesselate.test.ts` gains cases for no strips and for a
strip of length 3 at (2, 5), asserting every float. The strip test is proven
able to fail before it is committed: move one vertex, watch it go red, and
put it back.

## 7. Verification

- Every existing test passes **unchanged**: `gl-layer.browser.test.ts` (pixel
  readbacks guard the picture, `drawsForTest` guards frame coalescing),
  `arrowz-board.browser.test.ts`, `game.browser.test.ts`,
  `lit.browser.test.ts`, and the `node` project.
- Each task in the plan is one commit, and the suite is green at every one of
  them. The tasks run in sequence because each one cuts code out of the same
  file: the leaves (shaders and colour, `voidQuads`) first, then rides, then
  `GlResources` (which needs the `Rider` type from `rides.ts`), then passes
  (which take a `GlResources`). Whichever commit turns a test red is the
  one that broke it.
- `ARROWZ_MEASURE=1` before the first task and after the last one, in the same
  headless environment. The numbers are relative (the headless shell
  rasterises in software, see `packages/engine/HISTORY.md`, 2026-09-10) and
  must stay within the run-to-run spread.
- `pnpm nx run-many -t verify` before the PR.
- A review of the whole branch, then a manual pass over the demo with a real
  mouse: a click that exits, a blocked click that shakes, two quick exits at
  once, a pan and a zoom, the dot grid on and off, a board with voids, and the
  diagnostic colours.

## 8. Out of scope

- Anything pass 3 needs: a new primitive, new attributes, caching uniform
  locations, a VAO.
- Renaming public members, or changing what any `*ForTest` getter answers.
- The known leak from before PR #35 (`dispose → reconnect → dispose` before
  the lost event leaves `restoreWanted` set). It is in the lifecycle code this
  split moves only as a whole, and it gets its own change.
- `packages/engine/HISTORY.md`, and the earlier specs that describe
  `gl-layer.ts` as one file. They record what was true when they were written.
