# One disc primitive for the tail and the corners

Date: 2026-09-11. Status: draft design, awaiting review.

Baseline: `main` at `f09310a` (PRs #33 to #38 merged). Branch
`feat/disc-primitive`. This is the third of three passes agreed after PR #34:
(1) rounded arrows, done; (2) the `gl-layer.ts` split, done in #38; (3) this
one, a round primitive computed in the fragment shader that draws the tail
cap and the rounded corners alike. It is the "named next step" of §12 and
§13 of `2026-09-10-webgl-board-layer-design.md`.

## 1. Why

On Insane (1000×1000, seed 7, 85 809 pieces) the static buffer holds
12.04 M vertices, 96 MB at two `Float32`s each. Measured in PR #34:

- the tail discs are 48 vertices a piece, **4.12 M** in all;
- the corner fans are 21 vertices a corner, 276 335 corners, **5.80 M**;
- segments and head polygons are the remaining **~2.1 M**.

So about 80 of the 96 MB draw roundings, and at the fitted zoom (a cell is
0.8 px wide) not one facet of them is visible. At the other end of the zoom
range they are polygons: `TAIL_SEGMENTS = 16` and `JOIN_SEGMENTS = 7` are
chosen so that the sagitta stays under half a device pixel at the widest
stroke ever drawn, and a host that sets `view.stroke` past the panel's range
sees facets.

## 2. The observation the design rests on

The export draws the corners with `stroke-linejoin="round"`
(`packages/engine/engine.ts:2039`) and the tail with `<circle>`. By the SVG
definition a round join is **a full disc of radius half the stroke, centred on
the vertex**. So the corner and the tail are the same primitive: a disc
`(cx, cy, r)`.

The quarter fan `writeJoin` draws today is that disc clipped to the only
quadrant that shows. The other three quadrants lie under the two segments
that meet at the corner — each is `2 · half` wide and ends butt at the vertex
— so drawing the whole disc changes no pixel. That is why the full disc is
safe, and why SVG can define the join that way.

## 3. Decisions

- **One primitive everywhere, rides included** (user's call). The fan code is
  deleted outright: `TAIL_SEGMENTS`, `JOIN_SEGMENTS`, `writeDisc`,
  `writeJoin`. There is no second way to draw a rounding left in the tree.
- **Discs are instances** (user's call, approach A). One unit quad shared by
  every disc, and three floats — 12 bytes — per disc. Rejected: a
  six-vertex quad per disc carrying `(x, y, u, v)`, which is 96 bytes a disc
  and gives back half the memory; and widening every vertex of the main
  buffer with local coordinates, which doubles every segment and changes the
  "two floats a vertex" stride that `rides.ts`, `gl-resources.ts` and
  `tesselate.ts` all assume.
- **A second stream, not a wider vertex.** The triangle buffer keeps its
  format to the byte. The discs travel in their own buffer, with their own
  ranges, next to it.
- **`--sharp` does not change.** A sharp tail stays the six-vertex square of
  `writeSquare` in the head block; sharp corners stay the extended segments.
  A sharp board has no discs at all.
- **The engine and the CLI do not change.** `pieceShape` already returns the
  tail as a centre and a radius; the export already draws discs.
- **`<arrowz-board>`'s public API does not change**, nor does `GlLayer`'s.

## 4. The tesselator (`tesselate.ts`)

### 4.1 The scene

```ts
export interface Scene {
  /** Triangle vertices, x and y interleaved, in cells. */
  positions: Float32Array
  /** Where each block starts and how long it is, in vertices, in draw order. */
  blocks: Readonly<Record<Block, Range>>
  /** Discs, as cx, cy and r interleaved, in cells. */
  discs: Float32Array
  /** Where each block's discs start and how many there are, in discs. */
  discBlocks: Readonly<Record<Block, Range>>
  rangeOf(id: number): PieceRanges | null
  drawnIds(): number[]
}

export interface PieceRanges {
  line: Range
  head: Range
  /** The piece's corner discs, inside its line block's discs. */
  corners: Range
  /** The piece's tail disc — one, or none when sharp — inside its head block's discs. */
  tail: Range
  top: boolean
}
```

The disc blocks use the four `Block` names and the same order as the
triangle blocks, so that each block's discs are drawn right after its
triangles (§5.3). A corner disc belongs to the line block of its piece, a
tail disc to the head block — which is where the fans and the tail fan live
today.

### 4.2 What each piece writes

- `writeLine` writes segments only. The segment rule is unchanged: interior
  joins extend by `half` except at a rounded corner, where both segments stop
  butt at the vertex; the polyline's two outer ends never extend.
- A new `writeCorners` writes one disc `(bx, by, half)` for every point of
  the merged polyline where it turns, when `rounded`.
- The tail, when `rounded`, is one disc `(s.tail.x, s.tail.y, s.tail.r)`.
  When sharp it is `writeSquare`, six vertices in the head block, as today.
- `lineVerticesOf` loses the fan term: `segmentVertices(merged.length)`.
- `headVertices(points, rounded)` becomes `3 · (points − 2) + (rounded ? 0 : 6)`.
- `discsOf(line, rounded)` is `rounded ? cornersIn(merged) + 1 : 0` — the
  corners plus the tail.

### 4.3 Rides

```ts
export function tesselatePiece(
  piece: Piece, view: BoardView, top: boolean, ride: Ride | null,
  out: Float32Array, discsOut: Float32Array,
): { vertices: number; discs: number }

export function rideVertexBound(piece: Piece): number // segments + widest head + sharp tail square
export function rideDiscBound(piece: Piece): number   // piece.cells.length + 1
```

`trackLine` emits at most `cells.length + 2` points, so a ride has at most
`cells.length` interior points and so at most that many corners, plus the
tail. `rideVertexBound` drops its fan term: `segmentVertices(points) +
3 · (MAX_HEAD_POINTS − 2) + 6`, the `+ 6` because a sharp tail is the
larger of the two caps in triangles now.

### 4.4 Colours

`tesselateColors(scene)` returns `{ vertices: Uint8Array, discs: Uint8Array }`:
four bytes per vertex as today, and four bytes per disc, both from
`hueBytes(id)`. It is still built only when colours are switched on.

## 5. The GPU side

### 5.1 The disc program (`gl-shaders.ts`)

`DISC_VERT` takes, per instance, `a_disc = (cx, cy, r)` and, optionally,
`a_color`; per vertex, `a_corner` from the unit quad `[-1, 1]²`. It uses the
same `u_origin`, `u_scale`, `u_size`, `u_flat` and `u_useAttr` as the main
program, so `setView` serves all three programs.

- The quad spans `r + f` around the centre, where `f = 1 / u_scale` is one
  device pixel in cells: the antialiased edge needs somewhere to fall.
- A disc of `r <= 0` is emitted as a degenerate quad — every vertex at the
  same clip point, no fragment. This is what removing a piece means for its
  discs (§5.2). The fragment rule below would already give such a disc no
  alpha; collapsing it in the vertex shader means it costs no fragment either.
- It passes `v_local = a_corner · (r + f)` and `v_r = r`, both in cells.

`DISC_FRAG` computes coverage analytically. The canvas has MSAA, but MSAA
does not smooth an edge computed in a fragment shader — the shader runs once
per pixel — so the disc must blend its own edge:

```glsl
float rPx = v_r * u_scale;
float dPx = length(v_local) * u_scale - rPx;
float a = clamp(0.5 - dPx, 0.0, 1.0) * min(1.0, 2.0 * rPx);
if (a <= 0.0) discard;
color = vec4(v_color.rgb, v_color.a * a);
```

No `fwidth`: the zoom is isotropic and the scale is already a uniform.

The `min(1.0, 2.0 * rPx)` factor is for sub-pixel discs. The bare ramp gives
a disc of radius ρ < 0.5 px an ink integral of `π(ρ + 0.5)³ / 3` against its
true area `πρ²` — at the fitted zoom, where a tail is about 0.2 px across in
radius, that is 0.36 px² against 0.13, nearly three times the ink. With the
factor it is 0.14. From ρ = 0.5 px up the factor is 1, so the inside of a
visible disc is fully opaque. Whether the fitted zoom then reads right is
judged on screenshots (§7), as §13 of the WebGL spec already rules for
antialiasing at sub-pixel density.

The blend is the layer's existing `blendFuncSeparate(SRC_ALPHA,
ONE_MINUS_SRC_ALPHA, ONE, ONE_MINUS_SRC_ALPHA)`.

### 5.2 Resources (`gl-resources.ts`)

`GlResources.create` links three programs and makes, beside `posBuffer` and
`quadBuffer`, a `discBuffer` and a `cornerBuffer` — the static unit quad,
written once. It stays all or nothing: a throw from any `link` leaves the
layer with no resources.

Lazily, as today's colour and ride buffers are: `discColorBuffer` (colour
mode only) and `rideDiscBuffer` (the first ride).

- `upload(scene, colored)` writes both streams, and both colour streams when
  colours are on.
- `writeRange(scene, r, visible)` also writes or zeroes `r.corners` and
  `r.tail` in `discBuffer`. A zeroed disc has `r = 0` and draws nothing
  (§5.1).
- `uploadRiders(riders)` packs each rider's discs back to back into
  `rideDiscBuffer`, recording `discStart` the way it records `start`.
- `delete()` deletes the new program and buffers too.

### 5.3 Passes (`gl-passes.ts`)

WebGL2 has no `baseInstance`, so a block of discs is drawn by pointing the
instanced attributes at its first disc:

```ts
gl.vertexAttribPointer(discLoc, 3, gl.FLOAT, false, 12, range.start * 12)
gl.vertexAttribDivisor(discLoc, 1)
// and, in colour mode, the colour attribute at range.start * 4, divisor 1
gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, range.count)
```

`drawPieces` interleaves, keeping today's colour rule for each block
(highlighted blocks flat, diagnostic hues only on the others):

```
lines → lines' discs → topLines → topLines' discs →
heads → heads' discs → topHeads → topHeads' discs
```

This is the order today's fans and tail fans are drawn in, block for block,
so the picture composites the same. Within a block, discs now follow all of
the block's triangles rather than each piece's own; every overlap inside a
block is between one colour and itself, so nothing shows.

A disc pass switches to the disc program and back; like `drawDots`, it ends
with `gl.useProgram(res.program)`, which every later pass assumes. The
instanced attributes' divisors are reset to 0 on the way out, so the main
program's attribute state is never left instanced.

`drawRiders` draws each rider's triangles and then its discs, inside the
same scissor.

## 6. Rides (`rides.ts`)

```ts
export interface Rider {
  data: Float32Array
  count: number
  start: number
  discs: Float32Array
  discCount: number
  /** Where its discs begin in the rider disc buffer; `GlResources.uploadRiders` owns this. */
  discStart: number
  color: Rgba
}
```

Both arrays are allocated once, at the start of a ride, from
`rideVertexBound` and `rideDiscBound`, so a frame of a ride allocates
nothing. The overrun check covers both counts. `RideHost` does not change.

## 7. Testing and measurement

TDD throughout; `deno task test` and the Vitest browser suite green after
every task, `deno task verify` and `pnpm nx run-many -t verify` before the PR.

**Node (`tesselate.test.ts`)** — tests that pin fan counts are rewritten, not
deleted, so each rule keeps a test:

- a rounded piece has `corners(merged) + 1` discs, a straight one exactly
  one, a sharp one none;
- a corner disc sits on the vertex with `r = half`; the tail disc is
  `pieceShape`'s tail;
- a sharp tail is still the square with the disc's reach;
- the disc blocks tile `discs` with no gap and no overlap, and every piece's
  `corners` and `tail` fall inside its own blocks;
- zeroing one piece leaves its neighbours' discs byte for byte;
- a ride never writes past either bound, on the worst tracks the existing
  bound test uses;
- the colour streams carry `hueBytes` for every vertex and every disc.

**Browser (`gl-layer.browser.test.ts`)**, pixels read back as today:

- a tail is round: a pixel on its diagonal just inside `r` is inked, the
  corner of its bounding square is paper;
- a corner's outer arc: a pixel just inside the arc is inked, the square
  corner outside it is paper;
- a piece that has ridden out leaves no dot where its discs were (the
  `r = 0` rule);
- a disc takes the diagnostic hue in colour mode and the flat highlight on a
  top piece;
- a rider draws its discs;
- a lost and restored context draws discs again.

`fingerprints.test.ts` and `node-smoke.mjs` must not move: the engine is not
touched.

**Measurement, before and after, Insane seed 7, foreground Chrome on the M1:**

- GPU time per frame with `EXT_disjoint_timer_query_webgl2` around every
  draw call, three samples. This is the only instrument that separates
  variants; the demo's "Measure pan and zoom" button reports
  `max(work, frame interval)` and cannot rank them.
- Buffer sizes, by a temporary log of `byteLength` in `upload`, removed
  before the PR — as §13 of the WebGL spec was measured.
- Screenshots at the fitted zoom and at `MAX_CELL_PX`, against `main`.

**Acceptance:** the monochrome static data falls as §1 predicts, from about
96 MB to about 21 MB (≈2.1 M vertices at 8 B plus ≈362 k discs at 12 B); GPU
time per frame is no worse than `main` beyond the ±0.9 ms noise band; the
screenshots show no regression the user objects to. The figures go into the
PR description.

## 8. Out of scope

- Segments as instanced capsules — the "instanced-geometry variant" of §12 of
  the WebGL spec. It would touch every line on the board; this pass touches
  the roundings only.
- The head polygon, which stays a triangle fan.
- `alpha-to-coverage` as an alternative to analytic alpha. Analytic alpha is
  what the dot grid already does and does not depend on the sample count.

## 9. Risks

- **Seams between an MSAA edge and an analytic one.** Along a corner's outer
  arc the disc's analytic edge meets the segments' multisampled edges at the
  tangent points; both are partial there, and blending one over the other
  can darken those pixels by a fraction. The ink is opaque, so a pixel that
  both cover partially ends up slightly more inked than either alone — a
  sub-pixel effect at the tangent points only. Ruled acceptable in advance;
  only the screenshots of §7 can overturn that, and if they do, it comes back
  to the user as a finding rather than being fixed inside this pass.
- **Attribute state leaking between programs.** A divisor left at 1 on a
  location the main program reuses would draw the board as instances of its
  first vertex. §5.3 resets divisors on the way out, and the browser suite's
  existing pixel tests after a coloured frame catch a leak.
- **Precision.** `DISC_FRAG` is `highp`, unlike `FRAG` and `DOT_FRAG`. Two
  reasons: `u_scale` is declared in both disc shaders, and GLSL ES refuses
  to link a uniform declared at two precisions (the vertex shader is `highp`
  by default); and where `mediump` is a real fp16 — phones — its step at a
  few thousand device pixels is about two pixels, which the browser tests of
  §7, zoomed far past `MAX_CELL_PX` to make a facet measurable, would feel.
  GLSL ES 3.00 guarantees `highp` in fragment shaders.
- **Translucent ink composites twice under a corner disc.** §2's "drawing the
  whole disc changes no pixel" and §5.3's "every overlap inside a block is
  between one colour and itself" hold for opaque ink only. With an `rgba`
  `view.ink`, the three quarters of a corner disc that lie under the two
  segments are drawn twice and read darker than the segments; the SVG's
  round join, being part of one stroke, is not. `main` already did this at
  every tail (half the tail fan lay under the last segment); this branch
  extends it to corners. The default ink is opaque. A fix, if the user wants
  one, is a quadrant mask per corner disc in the shader, which changes the
  disc format; ruled out of this pass, and put to the user with the
  screenshots of §7.
