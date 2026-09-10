# The board draws on the GPU: a WebGL2 layer in place of SVG

Date: 2026-09-10. Status: approved design, awaiting the implementation plan.

Baseline: `main` at `dc86796` (PR #31, the demo inspector). Supersedes the
rendering decision of `docs/superpowers/specs/2026-09-09-board-element-design.md`
§6 and answers the follow-up its §11 asked for. PR #32
(`fix/perf-test-real-chrome`) is open against the same baseline and changes the
measuring environment; this work assumes it lands, but does not depend on it.

## 1. Why

§11 of the board-element design set the acceptance for keeping SVG: Nightmare
under 16 ms a frame, Insane under 50 ms with a build under 5 s. Insane failed,
and the section named the next step as "a spec for virtualisation or Canvas,
with the per-piece `<g>` removed first".

A throwaway spike measured four renderers on one board (Insane 1000×1000 seed
7, 85 809 pieces), with one shared geometry pass and the same scripted
movement, in a foreground Chrome 152 on an M1, host 800×800 at
devicePixelRatio 2:

| renderer | preparation | pan mean | pan worst |
| --- | --- | --- | --- |
| SVG, as shipped | 2 761 ms, 429 055 nodes | 1 050.5 ms | 1 289.1 ms |
| Canvas 2D, culled to the view | 62 ms | 490.9 ms | 649.0 ms |
| Canvas 2D, one retained `Path2D` | 25 488 ms | 34.7 ms | 86.7 ms |
| **WebGL2, one static buffer** | **158 ms** | **16.5 ms** | **18.5 ms** |

Three of those numbers decided this design.

**Culling is not the lever; retention is.** The culled Canvas drew 12 900 of
85 809 pieces — 15% — and cost fourteen times more than the Canvas that drew
all of them, because it rebuilt its path every frame and Skia re-tessellated
~150k segments on the CPU each time. Virtualisation, the other candidate §11
named, would have bought nothing on its own.

**WebGL2 pans the whole board with no culling at all,** at the display's
refresh rate, because a frame is two uniforms and one `drawArrays`. Its cost
stops being a function of the piece count and becomes a function of the pixel
count, which is fixed by the host.

**Removing the per-piece `<g>` is moot.** It would have taken 429 055 nodes to
roughly 257 000 — a renderer whose frame cost is proportional to the node count
would still have been an order of magnitude short.

WebAssembly was considered and rejected on the same measurements: our own
JavaScript on the drawing path is 48 ms, once (`pieceShape` over 85 809
pieces). The second and more of the frame is spent inside Blink walking a
retained tree. There is almost no code of ours there to speed up.

## 2. Decisions

1. **One renderer for every board size.** No SVG for small boards and GPU for
   large ones. A threshold would mean two code paths, two sets of bugs and two
   visual results for one product; the maintenance cost outweighs any gain on a
   board that is fast either way.
2. **WebGL2, not WebGL1 or WebGPU.** WebGL2 is available in every browser the
   project targets and needs no extensions for what this layer does. WebGPU is
   still uneven across browsers and would buy nothing here: the bottleneck was
   never the draw submission.
3. **Geometry keeps coming from `pieceShape()`.** The tesselator consumes its
   output rather than deriving the shapes again. `packages/engine/geometry.ts`
   exists precisely so the CLI export and the interactive board cannot draw a
   head differently; a second derivation would reopen that.
4. **The static buffer holds the whole board; riding pieces get their own.**
   See §6.
5. **Visual fidelity is judged by eye, not by a golden image.** MSAA plus the
   same geometry; differences in antialiasing at sub-pixel density are expected
   and tuned by looking at screenshots. No image-comparison test.
6. **Accessibility is not regressed, because there is none to regress.** The
   SVG carries no roles or labels, and the keyboard handler
   (`arrowz-board.ts:562`) does zoom and fit only — there is no per-piece
   keyboard navigation today. Every accessible control lives in the chrome
   buttons, which are ordinary DOM and are untouched. Adding board
   accessibility is a separate piece of work and is out of scope here.
7. **The public API of `<arrowz-board>` does not change, and gains one
   read-only property.** Attributes, events, `saveState`/`loadState` stay
   exactly as they are, so the React lab and the Angular game are unaffected.
   The addition is `pieceCount`, because counting drawn pieces is a reasonable
   thing to ask a board and, once the pieces are not DOM nodes, there is no
   other way to ask it — `perf.browser.test.ts:161` counts them today by
   querying `g.heads > g[data-id]`. An addition breaks no consumer.
8. **The CLI export stays SVG.** `toSvg`, `geometry.ts` and the golden hashes
   in `svg-golden.json` are untouched. A file on disk and a canvas on screen
   have different requirements, and only the second one had a problem.

## 3. Module layout

The split follows one line: what can be tested in Node without a GPU.

```
packages/board-element/src/
  view.ts          BoardView, DEFAULT_VIEW, hueOf, SHAKE_MS  (moved out of svg-layer.ts)
  tesselate.ts     pure: Board + BoardView -> typed arrays + ranges   (new)
  gl-layer.ts      canvas, context, buffers, draw calls, animation    (new)
  svg-layer.ts     deleted
```

`view.ts` exists so that `mod.ts` can keep exporting `BoardView`,
`DEFAULT_VIEW`, `hueOf` and `SHAKE_MS` from a module that has nothing to do
with a renderer. Without it the public surface would move when the layer did.

`tesselate.ts` joins `viewport.ts` and `track.ts` as a DOM-free module tested
by the `node` Vitest project. It must not import anything from `gl-layer.ts`;
`neutral.test.ts` already greps for the DOM lib and this module is expected to
stay out of it.

## 4. The tesselator (`tesselate.ts`, pure)

```ts
export interface Scene {
  /** Triangle vertices, x and y interleaved, in cells. */
  positions: Float32Array
  /** RGBA8 per vertex, four bytes each; only built for the coloured mode (§8). */
  colors: Uint8Array | null
  /** Where each block starts and how long it is, in vertices. */
  blocks: Readonly<Record<Block, Range>>
  /** Where one piece's vertices sit, so a removal or a ride can zero them. */
  rangeOf(id: number): { line: Range; head: Range } | null
}

export type Block = 'lines' | 'topLines' | 'heads' | 'topHeads'
export interface Range { start: number; count: number }

/** Where a piece is along its own track; null means at rest. */
export interface Ride { dir: number; front: number; shift: number }

export function tesselateBoard(board: Board, view: BoardView, omit: ReadonlySet<number>): Scene
export function tesselatePiece(piece: Piece, view: BoardView, ride: Ride | null, out: Float32Array): number
```

`Ride` carries exactly what `trackLine(cells, dir, front, shift)` needs, and
nothing else: the tesselator computes no timing and holds no state, so the
whole of it stays a function of its arguments and testable in Node.

Four blocks, laid out in one buffer in draw order (§5). Splitting them at
build time means the draw order costs nothing at run time and a highlighted
piece needs no per-vertex flag: its colour arrives as a uniform of its own
pass.

A line is expanded segment by segment into two triangles, each quad extended
by half the stroke width at both ends so the joins and caps fill without
mitring; measured on Insane this produced 2 085 809 triangles for the whole
board. A head polygon (four points, or five when the line is as wide as the
head) becomes a fan.

The tail rounding is a fan too, of a segment count fixed at build time. Eight
segments is the starting value: the rounding is half a stroke wide, so at
`MAX_CELL_PX` (48) it spans 24 device pixels at dpr 1, where eight segments
already read as round. **The spike did not tesselate the tails**, so the
triangle count above and the memory figure in §13 are both slightly low; the
plan must re-measure once the fan is in, and §13 says so.

`tesselatePiece` writes into a caller-owned buffer and returns the vertex
count, so a ride allocates nothing per frame. Its upper bound is known and
must be asserted: `trackLine` emits at most two points more than the resting
line, because a moving piece can hold a partial segment at each end.

## 5. Draw order

One frame is six calls, in the order of today's SVG groups — the SVG is the
specification of what the picture looks like, so the order is copied, not
reinvented:

1. **paper** — one quad over the cells plus the margin, colour from a uniform;
2. **point grid** — one quad over `0,0..W,H`, the pattern computed in the
   fragment shader from `fract(world) - 0.5` against the radius, smoothstepped
   for antialiasing. This is exactly the definition of today's one-cell
   `<pattern>` holding one circle, with no geometry at all. Drawn only when
   `showPoints` and `cellPx >= MIN_POINT_CELL_PX`;
3. **voids** — quads from `voidStrips(board)`;
4. **lines**, then **top lines** — the static buffer, two ranges;
5. **heads**, then **top heads** — the same buffer, two more ranges;
6. **riders** — the dynamic buffer, with `gl.scissor` set to the paper
   rectangle in device pixels, because today only a riding piece is clipped.

## 6. Buffers and the frame loop

Two vertex buffers.

The **static** one holds the board: positions and ids, uploaded once per
rebuild (69 ms to tesselate and 41 ms to upload at the ceiling). Removing a
piece writes zeroes over its range with `bufferSubData`, collapsing its
triangles to nothing — the cost is proportional to one piece, never to the
board, which is the property that made the SVG layer's `diff()` worth having
and must survive.

The **dynamic** one holds the pieces currently riding, which is at most a
handful: the game plays one exit or one shake at a time. It is sized to the
longest piece on the board and grown if that is ever not enough.

Pan and zoom no longer write an attribute. The element hands the layer a
`Viewport`; the layer stores it and **schedules a redraw on
`requestAnimationFrame`**, so several changes inside one frame — a pinch is
a zoom and a pan at once — cost one draw. The canvas is sized to
`host × devicePixelRatio` and resized when either changes.

`viewport.ts` is untouched except that `viewBox()` goes: it existed only to
feed the SVG attribute. Its three assertions in `viewport.test.ts` go with it,
and the two in `arrowz-board.browser.test.ts` that read the attribute switch
to the public `viewport` property — which is what they meant to test.

## 7. Animation

`ride()` keeps its present shape: a `Animation` over an empty effect as the
clock, driving a per-frame draw. The clock earns its place by giving the ride
a `finished` promise and a `cancel()`, which `game-host.ts` and the game tests
are built on, and the per-frame draw is not optional — `trackLine` bends the
line through the corners while the head runs straight out, so no interpolated
transform can express the movement.

What changes is only what a tick does. Instead of writing SVG attributes it
calls `tesselatePiece` into a scratch buffer and uploads that range. The
piece's range in the static buffer is zeroed when the ride starts and written
back when it is cancelled; an exit leaves it zeroed and drops the piece.

## 8. Colour

Monochrome needs no per-vertex colour at all: the pass sets `view.ink` as a
uniform. The coloured mode gets a second buffer of `RGBA8` per vertex, filled
on the CPU from `hueOf()`.

The hue is deliberately **not** computed in the shader. GLSL works in float32,
and `id * 137.508` for an id around 86 000 lands near 11.8 million, past
2^23, where the unit in the last place is already 2 — the hues would quantise
to every other degree and stop matching `hueOf()`, which the element exports
to consumers. Keeping the arithmetic on the CPU keeps one source of the
colour.

Because the coloured mode is the lab's diagnostic view rather than the game's,
the buffer is **built lazily, the first time colours are switched on**, and
kept afterwards. A default monochrome board therefore carries no colour buffer
at all, which is what drops the ceiling figure in §13 from about 73 MB to
47.7 MB. The first toggle costs one tesselation pass and one upload; every
toggle after it is a uniform, still an improvement on the SVG layer, where it
is a full rebuild.

Highlighted pieces need no per-vertex flag, because they occupy their own
blocks and their pass sets `view.highlight` as a uniform. Their stroke is
thicker (1.15× in monochrome, 1.5× in colour, as in `toSvg`), which is
geometry rather than colour, so a change to `view.top` rebuilds — exactly as
today, where `canDiff` already refuses to diff whenever `top > 0`.

## 9. Context loss and no WebGL2

A WebGL context is not permanent: a driver reset or a GPU sleep takes it away
on a machine where WebGL2 is fully supported. This is a failure mode, not a
second rendering standard.

- `webglcontextlost`: `preventDefault()`, stop the frame loop, mark the layer
  dead.
- `webglcontextrestored`: recreate the program and both buffers from the
  `Board`, `BoardView` and omit set the layer already holds, and resume. Rides
  in flight are cancelled; their promises resolve as cancelled, which
  `game-host.ts` already handles.
- No WebGL2 at all: the layer reports it, and the element shows a message from
  `i18n.ts`, Polish and English, per the repository's bilingual rule.

## 10. Tests

The layer-level tests as they stand (`svg-layer.browser.test.ts`, 493 lines)
assert on DOM nodes and cannot survive. They are replaced by a split along the
module boundary of §3.

**Node (`tesselate.test.ts`)**, where most of the logic now lives:

- vertex counts per piece, and the four blocks' ranges covering the buffer
  exactly, with no gaps and no overlap;
- the range map: every drawn piece resolves, an omitted one does not;
- zeroing a range collapses it and leaves its neighbours byte-for-byte intact;
- a ridden piece's geometry against `trackLine()` for a straight piece, an L
  and a one-cell piece;
- the head fan for both the four-point and the five-point case, matching
  `pieceShape` output;
- the asserted upper bound on a rider's vertex count.

**Browser (`gl-layer.browser.test.ts`)**, small on purpose because `readPixels`
is synchronous and slow:

- a board draws: a pixel inside the paper is not the page background;
- a removed piece's pixels become the paper colour;
- the coloured mode changes a pixel that monochrome left as ink;
- the point grid appears only above `MIN_POINT_CELL_PX`;
- a simulated context loss and restore (via `WEBGL_lose_context`) redraws the
  same picture.

**Unchanged in intent:** `game.browser.test.ts` and
`arrowz-board.browser.test.ts` test behaviour and events, not markup, and stay
— except the two `viewBox` assertions of §6 and any query for `g[data-id]`,
which `perf.browser.test.ts:161` also uses to count pieces and which becomes
`layer.pieceCount`.

## 11. Verification

`pnpm nx run-many -t verify` green across all three projects, which includes
`deno task test` for the engine (untouched, and expected to stay untouched —
if an engine test moves, something has gone wrong). The measurement of
`perf.browser.test.ts` is re-recorded on the new layer, and the ceiling case is
looked at by eye in a foreground Chrome, since §2.5 makes that the fidelity
gate.

## 12. Out of scope

- Board accessibility (§2.6): roles, labels, per-piece keyboard navigation.
- The instanced-geometry variant, which would cut GPU memory roughly fivefold
  by deriving line quads from unit segments instead of from `pieceShape`
  output. Rejected here for §2.3, and recorded because it is the known answer
  if §13's memory figure ever becomes a problem.
- The generator's own cost. Insane takes 12-24 s to generate, which is a
  larger number than anything in this document, and a different problem.
- Any change to `packages/engine` or `packages/cli`.

## 13. Risks

**GPU memory at the ceiling: 47.7 MB monochrome, about 73 MB once colours are
switched on, and both figures are low.** The positions were measured; the
colour buffer adds roughly 25 MB when §8 builds it. But the spike that
measured the positions drew no tail roundings (§4), so the real totals are
higher by their fans. The plan re-measures on the finished layer rather than
carrying these estimates forward. Acceptable on a laptop, unproven on a phone;
the escape route is §12's instanced variant.

**Antialiasing at sub-pixel density.** At the fitted scale a cell is 0.8 px
wide, so the whole board is finer than the raster. MSAA may moiré differently
from the SVG's analytic antialiasing, better or worse. §2.5 makes this a
judgement call on screenshots rather than a test, so it must actually be
looked at before the branch is finished.

**`readPixels` is slow and synchronous.** Kept to the handful of cases in §10;
a browser test suite that grows pixel assertions will get slow quietly.

**The tesselator is a new source of truth for a picture that already exists.**
Its output must match what `pieceShape` describes, and the Node tests of §10
are what stop it drifting. A bug there shows up as "something looks wrong"
rather than as a failure, which is the failure mode this spec is most exposed
to.
