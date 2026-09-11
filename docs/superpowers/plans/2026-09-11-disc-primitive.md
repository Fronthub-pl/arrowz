# One Disc Primitive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw every tail cap and every rounded corner of `<arrowz-board>` as one instanced disc computed in the fragment shader, and delete the triangle fans that draw them today.

**Architecture:** The tesselator grows a second stream beside its triangles — `discs`, three floats `(cx, cy, r)` a disc, in the same four blocks. The GL layer draws that stream with a new program as instances of a shared unit quad, block by block, interleaved with the triangle blocks so the picture composites as today. Riders carry their own discs the same way. The fans stay until the last code task, so every task leaves the whole suite green, and the pixel tests that make the fans' deletion safe are written before it.

**Tech Stack:** TypeScript, WebGL2 (`drawArraysInstanced`, `vertexAttribDivisor`), GLSL ES 3.00, Vitest (Node project + Chromium browser project via Playwright), Lit element untouched.

**Spec:** `docs/superpowers/specs/2026-09-11-disc-primitive-design.md` — read it before starting any task; this plan argues from it.

## Global Constraints

- Everything in the repository is English: code, comments, tests, commit messages. The chat with the user is Polish.
- No attribution lines in commit messages or PR descriptions.
- No `any`, no non-null assertions (`!`). Index through a checked `at()` helper where the files already do.
- Never spread an array proportional to the number of cells or pieces (`Math.min(...arr)`).
- `packages/engine` and `packages/cli` are not touched; `fingerprints.test.ts` and `packages/engine/scripts/node-smoke.mjs` must not move.
- `GlLayer`'s public API and `<arrowz-board>`'s public API do not change.
- The triangle buffer keeps "two floats a vertex"; discs are `FLOATS_PER_DISC = 3` floats in their own buffer.
- `--sharp` (`view.rounded === false`) draws no discs at all: a square tail of six vertices and extended segments, exactly as today.
- Comments match the surrounding density and voice: full sentences that say why, British spelling ("colour").
- Commit messages follow the repo's style: one descriptive sentence, e.g. "The frame's passes become functions in gl-passes.ts, and draw() is left with the order they run in".
- Gates after every task, from `packages/board-element/`:
  - `pnpm vitest run --project node`
  - `pnpm vitest run --project chromium`
  - `pnpm run check` (needs the engine's `dist/`; if it is missing run `pnpm nx build engine` from the repo root first)
  - `deno fmt` (it rewraps long lines and normalises quotes; commit what it writes), then `deno lint && deno fmt --check`
- Before the PR: `pnpm nx run-many -t verify` and `deno task verify` from the repo root.

## File map

All under `packages/board-element/src/`.

| File | Change |
| --- | --- |
| `tesselate.ts` | Task 1: disc stream, `FLOATS_PER_DISC`, `rideDiscBound`, `PieceRanges.corners/tail`, `tesselatePiece` returns `{ vertices, discs }`, `tesselateColors` returns `{ vertices, discs }`. Task 4: fans deleted. |
| `tesselate.test.ts` | Task 1: disc tests, call sites of the changed returns. Task 4: fan-count tests rewritten. |
| `rides.ts` | Task 1: `Rider.discs/discCount/discStart`, both bounds checked. |
| `gl-shaders.ts` | Task 2: `DISC_VERT`, `DISC_FRAG`. |
| `gl-resources.ts` | Task 1: `tesselateColors(...).vertices`. Task 2: disc program and buffers, `writeRange` on discs. Task 3: `uploadRiders` packs discs. |
| `gl-passes.ts` | Task 2: `drawDiscBlock`, interleaved `drawPieces`. Task 3: `drawRiders` draws discs. |
| `gl-layer.ts` | Task 2: `drawPieces` call gains `vp, width, height`. Task 3: `drawRiders` call gains `width`. Task 5: header comment. |
| `gl-layer.browser.test.ts` | Task 2: disc pixel tests. Task 3: rider disc test. |

---

### Task 1: The tesselator writes a disc stream beside its triangles

The fans stay in this task. The scene gains `discs`; nothing on the GPU reads it yet, so the board looks exactly as it does on `main`.

**Files:**
- Modify: `packages/board-element/src/tesselate.ts`
- Modify: `packages/board-element/src/rides.ts`
- Modify: `packages/board-element/src/gl-resources.ts` (one line)
- Test: `packages/board-element/src/tesselate.test.ts`

**Interfaces:**
- Produces (later tasks rely on these exact names):
  - `export const FLOATS_PER_DISC = 3`
  - `Scene.discs: Float32Array`, `Scene.discBlocks: Readonly<Record<Block, Range>>`
  - `PieceRanges.corners: Range`, `PieceRanges.tail: Range`
  - `export interface Written { vertices: number; discs: number }`
  - `tesselatePiece(piece, view, top, ride, out: Float32Array, discsOut: Float32Array): Written`
  - `export function rideDiscBound(piece: Piece): number`
  - `export interface SceneColors { vertices: Uint8Array; discs: Uint8Array }`, `tesselateColors(scene): SceneColors`
  - `Rider.discs: Float32Array`, `Rider.discCount: number`, `Rider.discStart: number`

- [ ] **Step 1: Write the failing tests**

In `tesselate.test.ts`, extend the import from `./tesselate.ts` with `FLOATS_PER_DISC`, `type Range` and `rideDiscBound`, then add these helpers below `points()`:

```ts
const f32 = (n: number): number => Math.fround(n)

/** Every disc of a range, as [cx, cy, r] triples. */
function discsIn(discs: Float32Array, r: Range): [number, number, number][] {
  const out: [number, number, number][] = []
  for (let i = 0; i < r.count; i++) {
    const o = (r.start + i) * FLOATS_PER_DISC
    const cx = discs[o], cy = discs[o + 1], rad = discs[o + 2]
    if (cx === undefined || cy === undefined || rad === undefined) throw new Error('range runs past the discs')
    out.push([cx, cy, rad])
  }
  return out
}

/** The shape the tesselator draws a piece from, at the default view's widths. */
function shapeOf(pc: Piece) {
  return pieceShape(pc, {
    cell: 1,
    pad: 0,
    width: DEFAULT_VIEW.stroke,
    headWidth: DEFAULT_VIEW.headWidth,
    headHeight: DEFAULT_VIEW.headHeight,
  })
}
```

Add these tests before the `voidQuads` tests:

```ts
test('a rounded piece carries a disc on its corner and one on its tail', () => {
  const scene = tesselateBoard(onlyPiece(BENT), { ...DEFAULT_VIEW, rounded: true }, NONE)
  const r = scene.rangeOf(BENT.id)
  if (!r) throw new Error('BENT is not drawn')
  // BENT turns once, at cells[1]; its straight run merges away and adds no disc.
  expect(r.corners.count).toBe(1)
  expect(r.tail.count).toBe(1)
  // A round join is a whole disc of radius half the stroke, on the vertex.
  const corner = at(BENT.cells, 1)
  expect(discsIn(scene.discs, r.corners)).toEqual([[f32(corner.x + 0.5), f32(corner.y + 0.5), f32(DEFAULT_VIEW.stroke / 2)]])
  const s = shapeOf(BENT)
  expect(discsIn(scene.discs, r.tail)).toEqual([[f32(s.tail.x), f32(s.tail.y), f32(s.tail.r)]])
})

test('a straight piece has only its tail disc, and a sharp piece has none', () => {
  const round = tesselateBoard(onlyPiece(STRAIGHT), { ...DEFAULT_VIEW, rounded: true }, NONE)
  expect(round.rangeOf(STRAIGHT.id)?.corners.count).toBe(0)
  expect(round.rangeOf(STRAIGHT.id)?.tail.count).toBe(1)
  const sharp = tesselateBoard(onlyPiece(ZIGZAG), { ...DEFAULT_VIEW, rounded: false }, NONE)
  expect(sharp.discs.length).toBe(0)
  expect(sharp.rangeOf(ZIGZAG.id)?.corners.count).toBe(0)
  expect(sharp.rangeOf(ZIGZAG.id)?.tail.count).toBe(0)
})

test('the four disc blocks tile the disc buffer, and every piece sits inside its own', () => {
  const scene = tesselateBoard(board(), { ...DEFAULT_VIEW, top: 3 }, NONE)
  const order = ['lines', 'topLines', 'heads', 'topHeads'] as const
  let n = 0
  for (const name of order) {
    expect(scene.discBlocks[name].start).toBe(n)
    n += scene.discBlocks[name].count
  }
  expect(scene.discs.length).toBe(n * FLOATS_PER_DISC)
  const inside = (r: Range, block: Range): boolean =>
    r.start >= block.start && r.start + r.count <= block.start + block.count
  for (const id of scene.drawnIds()) {
    const r = scene.rangeOf(id)
    if (!r) throw new Error(`piece ${id} has no range`)
    expect(inside(r.corners, scene.discBlocks[r.top ? 'topLines' : 'lines'])).toBe(true)
    expect(inside(r.tail, scene.discBlocks[r.top ? 'topHeads' : 'heads'])).toBe(true)
  }
})

test("zeroing one piece's discs leaves its neighbours' discs byte for byte", () => {
  const b = board()
  const scene = tesselateBoard(b, DEFAULT_VIEW, NONE)
  const [victim, witness] = [b.pieces[1], b.pieces[2]]
  if (!victim || !witness) throw new Error('need three pieces')
  const vr = scene.rangeOf(victim.id)
  const wr = scene.rangeOf(witness.id)
  if (!vr || !wr) throw new Error('no ranges')
  const before = [...discsIn(scene.discs, wr.corners), ...discsIn(scene.discs, wr.tail)]
  for (const range of [vr.corners, vr.tail]) {
    scene.discs.fill(0, range.start * FLOATS_PER_DISC, (range.start + range.count) * FLOATS_PER_DISC)
  }
  expect([...discsIn(scene.discs, wr.corners), ...discsIn(scene.discs, wr.tail)]).toEqual(before)
})

test('the colour streams carry hueBytes for every disc of a piece too', () => {
  const scene = tesselateBoard(board(7, { pieces: [BENT] }), { ...DEFAULT_VIEW, colored: true }, NONE)
  const colors = tesselateColors(scene)
  expect(colors.discs.length).toBe((scene.discs.length / FLOATS_PER_DISC) * 4)
  const r = scene.rangeOf(BENT.id)
  if (!r) throw new Error('no range')
  for (const range of [r.corners, r.tail]) {
    const i = range.start * 4
    expect(Array.from(colors.discs.subarray(i, i + 4))).toEqual([...hueBytes(BENT.id), 255])
  }
})

test('a piece at rest writes the discs the board holds for it, corners then tail', () => {
  const scene = tesselateBoard(onlyPiece(BENT), DEFAULT_VIEW, NONE)
  const r = scene.rangeOf(BENT.id)
  if (!r) throw new Error('BENT is not drawn')
  const out = new Float32Array(rideVertexBound(BENT) * 2)
  const discs = new Float32Array(rideDiscBound(BENT) * FLOATS_PER_DISC)
  const w = tesselatePiece(BENT, DEFAULT_VIEW, false, null, out, discs)
  expect(discsIn(discs, { start: 0, count: w.discs })).toEqual([
    ...discsIn(scene.discs, r.corners),
    ...discsIn(scene.discs, r.tail),
  ])
})
```

Update the three existing tests whose calls change shape:

- `'a ridden piece follows trackLine, corners included'`: allocate `const discs = new Float32Array(rideDiscBound(BENT) * FLOATS_PER_DISC)`, call `const w = tesselatePiece(BENT, view, false, { dir: BENT.dir, front, shift: 0.5 }, out, discs)`, replace `expect(count).toBe(want)` with `expect(w.vertices).toBe(want)`, and add `expect(w.discs).toBe(corners + 1)` after it, with the comment `// One disc a corner, and the tail's.`
- `'a ride never writes past the bound the layer allocates'`: replace it whole with:

```ts
test('a ride never writes past either bound the layer allocates', () => {
  const view = DEFAULT_VIEW
  for (const pc of [BENT, ZIGZAG, STRAIGHT]) {
    const bound = rideVertexBound(pc)
    const discBound = rideDiscBound(pc)
    const out = new Float32Array(bound * 2)
    const discs = new Float32Array(discBound * FLOATS_PER_DISC)
    const front = frontOf(pc, view, false, pc.dir)
    for (const shift of [0, 0.01, 0.5, 1, 1.5, 2, 3, 3.99, 4, 10]) {
      const w = tesselatePiece(pc, view, false, { dir: pc.dir, front, shift }, out, discs)
      expect(w.vertices).toBeLessThanOrEqual(bound)
      expect(w.discs).toBeLessThanOrEqual(discBound)
    }
  }
})
```

- `'the colour buffer carries hueBytes for every vertex of a piece'`: `const colors = tesselateColors(scene).vertices` — the rest unchanged.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run --project node src/tesselate.test.ts` (from `packages/board-element/`)
Expected: FAIL — `FLOATS_PER_DISC` / `rideDiscBound` are not exported, `scene.discs` is undefined.

- [ ] **Step 3: Implement the stream in `tesselate.ts`**

Below `MAX_HEAD_POINTS`, add:

```ts
/** Floats a disc takes in `Scene.discs`: its centre, then its radius. */
export const FLOATS_PER_DISC = 3
```

Replace `PieceRanges` and `Scene` with:

```ts
export interface PieceRanges {
  line: Range
  head: Range
  /** The piece's corner discs, inside its line block's discs. */
  corners: Range
  /** The piece's tail disc — one, or none when sharp — inside its head block's discs. */
  tail: Range
  top: boolean
}

export interface Scene {
  /** Triangle vertices, x and y interleaved, in cells. */
  positions: Float32Array
  /** Where each block starts and how long it is, in vertices, in draw order. */
  blocks: Readonly<Record<Block, Range>>
  /** Discs, as cx, cy and r interleaved, in cells: the tail caps and the round joins. */
  discs: Float32Array
  /** Where each block's discs start and how many there are, in discs, in the same order. */
  discBlocks: Readonly<Record<Block, Range>>
  rangeOf(id: number): PieceRanges | null
  drawnIds(): number[]
}

/** How many vertices and discs one piece wrote. */
export interface Written {
  vertices: number
  discs: number
}
```

After `writeSquare`, add the two disc writers:

```ts
/**
 * A disc of radius `half` on every corner of the merged polyline: what
 * `stroke-linejoin="round"` draws. The disc is whole, not the quarter that
 * shows — the other three quarters lie under the two butt-ended segments that
 * meet there, so drawing them changes no pixel.
 */
function writeCorners(out: Float32Array, o: number, raw: readonly [number, number][], half: number): number {
  const line = mergeCollinear(raw)
  for (let i = 1; i < line.length - 1; i++) {
    if (!turnsAt(line, i)) continue
    const p = at(line, i)
    out[o++] = p[0]
    out[o++] = p[1]
    out[o++] = half
  }
  return o
}

/** The tail cap as one disc, where `pieceShape` puts it. */
function writeTailDisc(out: Float32Array, o: number, cx: number, cy: number, r: number): number {
  out[o++] = cx
  out[o++] = cy
  out[o++] = r
  return o
}
```

After `rideVertexBound`, add:

```ts
/**
 * The most discs a ride of this piece can need. `trackLine` emits at most
 * `cells.length + 2` points, so a ride has at most `cells.length` interior
 * points, and so at most that many corners; the tail is one more.
 */
export function rideDiscBound(piece: Piece): number {
  return piece.cells.length + 1
}
```

Above `tesselateBoard`, add the block layout helpers, and replace `tesselateBoard` whole:

```ts
const ORDER: readonly Block[] = ['lines', 'topLines', 'heads', 'topHeads']

/** Blocks laid back to back in draw order, from how long each one is. */
function layOut(size: Readonly<Record<Block, number>>): Record<Block, Range> {
  const out: Record<Block, Range> = {
    lines: { start: 0, count: 0 },
    topLines: { start: 0, count: 0 },
    heads: { start: 0, count: 0 },
    topHeads: { start: 0, count: 0 },
  }
  let start = 0
  for (const name of ORDER) {
    out[name] = { start, count: size[name] }
    start += size[name]
  }
  return out
}

/** Where the last block ends: the length of the whole stream. */
const endOf = (blocks: Readonly<Record<Block, Range>>): number => blocks.topHeads.start + blocks.topHeads.count

/** A write cursor per block, each at its block's start. */
function cursorsOf(blocks: Readonly<Record<Block, Range>>): Record<Block, number> {
  return {
    lines: blocks.lines.start,
    topLines: blocks.topLines.start,
    heads: blocks.heads.start,
    topHeads: blocks.topHeads.start,
  }
}

export function tesselateBoard(board: Board, view: BoardView, omit: ReadonlySet<number>): Scene {
  const tops = topIds(board, view, omit)
  const drawn = board.pieces.filter((pc) => !omit.has(pc.id))

  // Two passes over the pieces, and pieceShape called in both. Once would need
  // the head's point count known in advance, and only pieceShape may decide
  // whether a head has three points or five — deriving it here again is exactly
  // the divergence geometry.ts exists to prevent.
  const counts = new Map<number, { line: number; head: number; corners: number; tail: number }>()
  const size: Record<Block, number> = { lines: 0, topLines: 0, heads: 0, topHeads: 0 }
  const discSize: Record<Block, number> = { lines: 0, topLines: 0, heads: 0, topHeads: 0 }
  for (const pc of drawn) {
    const top = tops.has(pc.id)
    const s = shapeOf(pc, view, top)
    const line = lineVerticesOf(s.line, view.rounded)
    const head = headVertices(s.head.length, view.rounded)
    // A corner disc belongs to its piece's line block and the tail disc to its
    // head block: where the fans that drew them used to live.
    const corners = view.rounded ? cornersIn(mergeCollinear(s.line)) : 0
    const tail = view.rounded ? 1 : 0
    counts.set(pc.id, { line, head, corners, tail })
    size[top ? 'topLines' : 'lines'] += line
    size[top ? 'topHeads' : 'heads'] += head
    discSize[top ? 'topLines' : 'lines'] += corners
    discSize[top ? 'topHeads' : 'heads'] += tail
  }

  const blocks = layOut(size)
  const discBlocks = layOut(discSize)
  const positions = new Float32Array(endOf(blocks) * 2)
  const discs = new Float32Array(endOf(discBlocks) * FLOATS_PER_DISC)
  const cursor = cursorsOf(blocks)
  const discCursor = cursorsOf(discBlocks)
  const ranges = new Map<number, PieceRanges>()
  for (const pc of drawn) {
    const top = tops.has(pc.id)
    const c = counts.get(pc.id)
    if (!c) continue
    const s = shapeOf(pc, view, top)
    const half = strokeOf(view, top) / 2
    const lineBlock: Block = top ? 'topLines' : 'lines'
    const headBlock: Block = top ? 'topHeads' : 'heads'

    const lineStart = cursor[lineBlock]
    writeLine(positions, lineStart * 2, s.line, half, view.rounded)
    cursor[lineBlock] = lineStart + c.line

    const headStart = cursor[headBlock]
    const headEnd = writeFan(positions, headStart * 2, s.head, 0, 0)
    if (view.rounded) writeDisc(positions, headEnd, s.tail.x, s.tail.y, s.tail.r)
    else writeSquare(positions, headEnd, s.tail.x, s.tail.y, s.tail.r)
    cursor[headBlock] = headStart + c.head

    const cornerStart = discCursor[lineBlock]
    const tailStart = discCursor[headBlock]
    if (view.rounded) {
      writeCorners(discs, cornerStart * FLOATS_PER_DISC, s.line, half)
      writeTailDisc(discs, tailStart * FLOATS_PER_DISC, s.tail.x, s.tail.y, s.tail.r)
    }
    discCursor[lineBlock] = cornerStart + c.corners
    discCursor[headBlock] = tailStart + c.tail

    ranges.set(pc.id, {
      line: { start: lineStart, count: c.line },
      head: { start: headStart, count: c.head },
      corners: { start: cornerStart, count: c.corners },
      tail: { start: tailStart, count: c.tail },
      top,
    })
  }

  return {
    positions,
    blocks,
    discs,
    discBlocks,
    rangeOf: (id) => ranges.get(id) ?? null,
    drawnIds: () => [...ranges.keys()],
  }
}
```

Replace `tesselateColors` whole:

```ts
/** The diagnostic colours: four bytes a vertex, and four a disc. */
export interface SceneColors {
  vertices: Uint8Array
  discs: Uint8Array
}

/** Writes one opaque colour over every element of the ranges, four bytes each. */
function paint(bytes: Uint8Array, ranges: readonly Range[], rgb: readonly [number, number, number]): void {
  for (const range of ranges) {
    for (let i = 0; i < range.count; i++) {
      const o = (range.start + i) * 4
      bytes[o] = rgb[0]
      bytes[o + 1] = rgb[1]
      bytes[o + 2] = rgb[2]
      bytes[o + 3] = 255
    }
  }
}

/**
 * The colour of every vertex and every disc, for the diagnostic mode. Built
 * only when colours are switched on (see `GlResources.upload`), so a
 * monochrome board never allocates it.
 */
export function tesselateColors(scene: Scene): SceneColors {
  const vertices = new Uint8Array((scene.positions.length / 2) * 4)
  const discs = new Uint8Array((scene.discs.length / FLOATS_PER_DISC) * 4)
  for (const id of scene.drawnIds()) {
    const r = scene.rangeOf(id)
    if (!r) continue
    const rgb = hueBytes(id)
    paint(vertices, [r.line, r.head], rgb)
    paint(discs, [r.corners, r.tail], rgb)
  }
  return { vertices, discs }
}
```

Replace `tesselatePiece` whole:

```ts
/**
 * One piece's triangles and discs into caller-owned buffers, at rest or part
 * way down its own track. Never writes more than `rideVertexBound(piece)`
 * vertices or `rideDiscBound(piece)` discs.
 */
export function tesselatePiece(
  piece: Piece,
  view: BoardView,
  top: boolean,
  ride: Ride | null,
  out: Float32Array,
  discsOut: Float32Array,
): Written {
  const s = shapeOf(piece, view, top)
  const half = strokeOf(view, top) / 2
  const line = ride === null ? s.line : trackLine(piece.cells, ride.dir, ride.front, ride.shift)
  let o = writeLine(out, 0, line, half, view.rounded)
  const d = ride === null ? { dx: 0, dy: 0 } : at(DIRS, ride.dir)
  const shift = ride === null ? 0 : ride.shift
  o = writeFan(out, o, s.head, d.dx * shift, d.dy * shift)
  const last = piece.cells.length - 1
  const [tx, ty] = ride === null ? [s.tail.x, s.tail.y] : trackPoint(piece.cells, ride.dir, last - shift)
  o = view.rounded ? writeDisc(out, o, tx, ty, s.tail.r) : writeSquare(out, o, tx, ty, s.tail.r)
  let q = 0
  if (view.rounded) {
    q = writeCorners(discsOut, q, line, half)
    q = writeTailDisc(discsOut, q, tx, ty, s.tail.r)
  }
  return { vertices: o / 2, discs: q / FLOATS_PER_DISC }
}
```

- [ ] **Step 4: Keep the two consumers building**

In `gl-resources.ts`, `upload()`: change `tesselateColors(scene)` to `tesselateColors(scene).vertices`. Nothing else in that file changes in this task.

In `rides.ts`:

- import `FLOATS_PER_DISC` and `rideDiscBound` from `./tesselate.ts` beside the existing names;
- replace the `Rider` interface with:

```ts
/**
 * A piece part way down its own track: its triangles and discs in cells, how
 * many of each are live, where they sit in the rider buffers, and the colour
 * they take. `data` and `discs` are allocated to `rideVertexBound(piece)` and
 * `rideDiscBound(piece)` once, at the ride's start, so a frame of a ride
 * allocates nothing.
 */
export interface Rider {
  data: Float32Array
  count: number
  /** Where its vertices begin in the rider buffer; `GlResources.uploadRiders` owns this. */
  start: number
  discs: Float32Array
  discCount: number
  /** Where its discs begin in the rider disc buffer; `GlResources.uploadRiders` owns this. */
  discStart: number
  color: Rgba
}
```

- in `ride()`, replace the `bound`/`rider` lines with:

```ts
    const bound = rideVertexBound(piece)
    const discBound = rideDiscBound(piece)
    const rider: Rider = {
      data: new Float32Array(bound * 2),
      count: 0,
      start: 0,
      discs: new Float32Array(discBound * FLOATS_PER_DISC),
      discCount: 0,
      discStart: 0,
      color: host.riderColor(id, top),
    }
```

- in `draw`, replace the `tesselatePiece` call, the overrun check and `rider.count = count` with the lines below, and change the comment's "`rider.data` is exactly `rideVertexBound(piece)` long" to "`rider.data` and `rider.discs` are exactly their bounds long":

```ts
      const written = tesselatePiece(piece, host.view(), top, track, rider.data, rider.discs)
      if (written.vertices > bound || written.discs > discBound) {
        throw new Error(`gl-layer: piece ${id} rode past its ${bound}-vertex or ${discBound}-disc bound`)
      }
      rider.count = written.vertices
      rider.discCount = written.discs
```

- [ ] **Step 5: Run the gates**

Run, from `packages/board-element/`: `pnpm vitest run --project node`, `pnpm vitest run --project chromium`, `pnpm run check`, `deno lint && deno fmt --check`.
Expected: all PASS. The browser suite is unchanged in behaviour: nothing draws `discs` yet.

- [ ] **Step 6: Commit**

```bash
git add packages/board-element/src/tesselate.ts packages/board-element/src/tesselate.test.ts packages/board-element/src/rides.ts packages/board-element/src/gl-resources.ts
git commit -m "The tesselator writes every tail cap and round join as a disc beside its triangles, and a rider carries its own"
```

---

### Task 2: The static board draws its discs on the GPU

**Files:**
- Modify: `packages/board-element/src/gl-shaders.ts`
- Modify: `packages/board-element/src/gl-resources.ts`
- Modify: `packages/board-element/src/gl-passes.ts`
- Modify: `packages/board-element/src/gl-layer.ts:460` (the `drawPieces` call)
- Test: `packages/board-element/src/gl-layer.browser.test.ts`

**Interfaces:**
- Consumes (Task 1): `Scene.discs`, `Scene.discBlocks`, `PieceRanges.corners/tail`, `FLOATS_PER_DISC`, `SceneColors`.
- Produces (Task 3 relies on these):
  - `GlResources.discProgram: WebGLProgram`, `GlResources.cornerBuffer: WebGLBuffer | null`, `GlResources.discBuffer: WebGLBuffer | null`, `GlResources.discColorBuffer: WebGLBuffer | null`, `GlResources.rideDiscBuffer: WebGLBuffer | null` (declared here, written in Task 3)
  - in `gl-passes.ts`, module-private `drawDiscBlock(res: GlResources, discs: WebGLBuffer, colors: WebGLBuffer | null, range: Range, flat: Rgba): void` — `res.discProgram` must be in use
  - `drawPieces(res, scene, useAttr, ink, highlight, vp: Viewport, width: number, height: number): void`

- [ ] **Step 1: Write the failing browser tests**

In `gl-layer.browser.test.ts`, add `pieceShape` to the `@arrowz/engine` import and `hueBytes` to the `./view.ts` import. Below `show()`, add:

```ts
/** Head at (5,5) facing right, one cell left, then two down: one corner, and a tail at (4.5, 7.5). */
const BENT: Piece = { id: 0, dir: 1, cells: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 4, y: 7 }] }
const INK_ON_PAPER = { ...DEFAULT_VIEW, paper: '#ffffff', ink: '#000000' }

/**
 * Far past MAX_CELL_PX on purpose. The triangle fans this layer used to draw
 * kept each facet's sagitta under half a device pixel at MAX_CELL_PX, so only
 * here does a facet's chord sit measurably inside the true circle — about 38
 * device pixels for a tail at dpr 2, 12 for a corner.
 */
const PROBE_CELL_PX = 4000

/** Shows the board zoomed to PROBE_CELL_PX with the point (x, y), in cells, in the middle of the canvas. */
function probeAt(b: Board, x: number, y: number): void {
  const v = fit({ W: b.W, H: b.H, hostWidth: HOST, hostHeight: HOST, pad: 0 })
  const half = HOST / 2 / PROBE_CELL_PX
  layer.setViewport({ ...v, cellPx: PROBE_CELL_PX, originX: x - half, originY: y - half })
}

/**
 * Two points on the ray from (cx, cy) at `theta`: one halfway between the
 * true circle of radius `r` and the chord of an `n`-gon's facet there, and
 * one three device pixels outside the circle. With `theta` in the middle of a
 * facet, the first is paper under a fan and ink under a disc.
 */
function probes(
  cx: number,
  cy: number,
  r: number,
  theta: number,
  n: number,
): { between: [number, number]; beyond: [number, number] } {
  const sagitta = r * (1 - Math.cos(Math.PI / n))
  const px = 1 / (PROBE_CELL_PX * devicePixelRatio)
  const along = (d: number): [number, number] => [cx + Math.cos(theta) * d, cy + Math.sin(theta) * d]
  return { between: along(r - sagitta / 2), beyond: along(r + 3 * px) }
}

const isInk = ([r, g, b, a]: [number, number, number, number]): boolean => a > 200 && r < 100 && g < 100 && b < 100
const isPaper = ([r, g, b]: [number, number, number, number]): boolean => r > 200 && g > 200 && b > 200

/** BENT's shape, at the default view's widths. */
function bentShape() {
  return pieceShape(BENT, {
    cell: 1,
    pad: 0,
    width: DEFAULT_VIEW.stroke,
    headWidth: DEFAULT_VIEW.headWidth,
    headHeight: DEFAULT_VIEW.headHeight,
  })
}

/**
 * BENT's tail probes. Its line arrives at the tail from above, so the ray
 * points down and a little left: 9π/16 is the middle of the old sixteen-facet
 * fan's facet between π/2 and 5π/8.
 */
function tailProbes(): { between: [number, number]; beyond: [number, number] } {
  const s = bentShape()
  return probes(s.tail.x, s.tail.y, s.tail.r, Math.PI / 2 + Math.PI / 16, 16)
}

/**
 * BENT's corner probes. It turns at (4.5, 5.5) from running left to running
 * down, so the outer side of the turn is up and to the left, and 5π/4 is the
 * middle of that quarter — the middle of the old seven-facet quarter fan's
 * fourth facet, a full turn of 28.
 */
function cornerProbes(): { between: [number, number]; beyond: [number, number] } {
  return probes(4.5, 5.5, DEFAULT_VIEW.stroke / 2, (5 * Math.PI) / 4, 28)
}

const bentBoard = (): Board => ({ ...edgeBoard(30, 30), pieces: [BENT] })
```

Append these tests at the end of the file:

```ts
test('a tail is a true circle: ink where the old fan left a facet of paper', () => {
  const b = bentBoard()
  layer.setBoard(b, INK_ON_PAPER)
  const { between, beyond } = tailProbes()
  probeAt(b, ...between)
  layer.drawNowForTest()
  expect(isInk(centre())).toBe(true)
  probeAt(b, ...beyond)
  layer.drawNowForTest()
  expect(isPaper(centre())).toBe(true)
})

test('a rounded corner is a true arc: ink where the old quarter fan left a facet of paper', () => {
  const b = bentBoard()
  layer.setBoard(b, INK_ON_PAPER)
  const { between, beyond } = cornerProbes()
  probeAt(b, ...between)
  layer.drawNowForTest()
  expect(isInk(centre())).toBe(true)
  probeAt(b, ...beyond)
  layer.drawNowForTest()
  expect(isPaper(centre())).toBe(true)
})

test('a disc takes the diagnostic hue, and a highlighted piece takes the highlight', () => {
  const b = bentBoard()
  const { between } = tailProbes()
  layer.setBoard(b, { ...INK_ON_PAPER, colored: true })
  probeAt(b, ...between)
  layer.drawNowForTest()
  const [r, g, bl] = centre()
  const [hr, hg, hb] = hueBytes(BENT.id)
  expect(Math.abs(r - hr)).toBeLessThanOrEqual(2)
  expect(Math.abs(g - hg)).toBeLessThanOrEqual(2)
  expect(Math.abs(bl - hb)).toBeLessThanOrEqual(2)

  // BENT is the only piece, so top: 1 highlights it, and a highlighted piece
  // is flat whatever the mode: the diagnostic hues never reach it.
  layer.setBoard(b, { ...INK_ON_PAPER, colored: true, top: 1, highlight: '#ff0000' })
  layer.drawNowForTest()
  const [tr, tg, tb] = centre()
  expect([tr > 240, tg < 15, tb < 15]).toEqual([true, true, true])
})

test('a piece that has ridden out leaves no disc behind, even zoomed in on where its tail was', async () => {
  const b = bentBoard()
  layer.setBoard(b, INK_ON_PAPER)
  const { between } = tailProbes()
  probeAt(b, ...between)
  await drawn()
  layer.drawNowForTest()
  expect(isInk(centre())).toBe(true)
  await layer.animateExit(BENT.id, BENT.dir)
  layer.drawNowForTest()
  // The dropped piece's discs are zeroed in the static buffer: r = 0 draws nothing.
  expect(isPaper(centre())).toBe(true)
})

test('a lost context comes back with its discs', async () => {
  const b = bentBoard()
  layer.setBoard(b, INK_ON_PAPER)
  const { between } = tailProbes()
  probeAt(b, ...between)
  await drawn()
  layer.drawNowForTest()
  expect(isInk(centre())).toBe(true)

  const lose = layer.canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')
  if (!lose) throw new Error('WEBGL_lose_context is needed for this test')
  lose.loseContext()
  await drawn()
  lose.restoreContext()
  for (let i = 0; i < 10 && !layer.supported; i++) await frame()
  expect(layer.supported).toBe(true)
  layer.drawNowForTest()
  expect(isInk(centre())).toBe(true)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run --project chromium src/gl-layer.browser.test.ts`
Expected: FAIL on the tail, corner, colour and lost-context tests — the probe `between` reads paper, because only the fans draw and their facet's chord lies outside it. The ridden-out test passes already (nothing draws discs yet); it guards the `writeRange` change below, which would otherwise leave a dropped piece's tail on the board.

- [ ] **Step 3: The disc program**

Append to `gl-shaders.ts`, and change its header comment's second sentence to: "The main program draws every triangle the tesselator makes, in one flat colour or the per-vertex one; the disc program draws every tail cap and round join; the dot program draws the point grid."

```ts
// Every tail cap and every round join, as instances of one unit quad. The
// quad is widened by one device pixel (1 / u_scale, in cells) past the
// disc's radius so its antialiased edge has somewhere to fall. A disc of no
// radius is a removed piece's: every vertex goes to the same clip point, so
// it costs no fragment at all.
export const DISC_VERT = `#version 300 es
in vec2 a_corner;
in vec3 a_disc;
in vec4 a_color;
uniform vec2 u_origin;
uniform float u_scale;
uniform vec2 u_size;
uniform vec4 u_flat;
uniform bool u_useAttr;
out vec2 v_local;
out float v_r;
out vec4 v_color;
void main() {
  float r = a_disc.z;
  v_r = r;
  v_color = u_useAttr ? a_color : u_flat;
  if (r <= 0.0) {
    v_local = vec2(0.0);
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  v_local = a_corner * (r + 1.0 / u_scale);
  vec2 px = (a_disc.xy + v_local - u_origin) * u_scale;
  gl_Position = vec4(px.x / u_size.x * 2.0 - 1.0, 1.0 - px.y / u_size.y * 2.0, 0.0, 1.0);
}`

// Coverage computed here, because the canvas's MSAA does not smooth an edge
// a fragment shader decides: the shader runs once a pixel. The edge ramps
// over one device pixel. A disc under half a pixel in radius is faded by
// 2 * rPx, so it carries about the ink of its own area and not a pixel's
// worth (spec §5.1). highp, unlike the other two fragment shaders: u_scale is
// shared with the vertex shader, which is highp, and GLSL ES will not link a
// uniform declared at two precisions (spec §9).
export const DISC_FRAG = `#version 300 es
precision highp float;
in vec2 v_local;
in float v_r;
in vec4 v_color;
uniform float u_scale;
out vec4 color;
void main() {
  float rPx = v_r * u_scale;
  float dPx = length(v_local) * u_scale - rPx;
  float a = clamp(0.5 - dPx, 0.0, 1.0) * min(1.0, 2.0 * rPx);
  if (a <= 0.0) discard;
  color = vec4(v_color.rgb, v_color.a * a);
}`
```

- [ ] **Step 4: The disc resources**

In `gl-resources.ts`:

- import `DISC_FRAG, DISC_VERT` from `./gl-shaders.ts`, and `FLOATS_PER_DISC, type Range` from `./tesselate.ts` beside the existing names;
- above the class, add:

```ts
/** Two triangles over [-1, 1]²: the six vertices every disc instance is drawn with. */
const UNIT_QUAD = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1])
```

- add the fields, beside the existing ones of the same kind:

```ts
  readonly discProgram: WebGLProgram
  /** The whole board's discs, cx, cy and r each, in cells. */
  readonly discBuffer: WebGLBuffer | null
  /** UNIT_QUAD, written once when the resources are made. */
  readonly cornerBuffer: WebGLBuffer | null
  /** The diagnostic colour of every disc; made alongside `colorBuffer`, and only then. */
  discColorBuffer: WebGLBuffer | null = null
  /** The riders' discs, back to back, rewritten with `rideBuffer`. */
  rideDiscBuffer: WebGLBuffer | null = null
  /** Every rider's discs back to back, for one upload; grown, never rebuilt per frame. */
  private rideDiscScratch = new Float32Array(0)
```

- the private constructor takes and assigns `discProgram`, `discBuffer` and `cornerBuffer` after `quadBuffer`, in that order;
- replace `create`:

```ts
  /**
   * The three programs, the two buffers every frame needs, and the two every
   * disc does. All of it or nothing: a throw from `link` leaves the layer
   * with no resources rather than part of them.
   */
  static create(gl: WebGL2RenderingContext): GlResources {
    const program = link(gl, VERT, FRAG)
    const dotProgram = link(gl, DOT_VERT, DOT_FRAG)
    const discProgram = link(gl, DISC_VERT, DISC_FRAG)
    const cornerBuffer = gl.createBuffer()
    if (cornerBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, UNIT_QUAD, gl.STATIC_DRAW)
    }
    return new GlResources(
      gl,
      program,
      dotProgram,
      gl.createBuffer(),
      gl.createBuffer(),
      discProgram,
      gl.createBuffer(),
      cornerBuffer,
    )
  }
```

- replace `upload`:

```ts
  /** The board's triangles and discs, and their colours when the view asks for them. */
  upload(scene: Scene | null, colored: boolean): void {
    const gl = this.gl
    if (!this.posBuffer) return
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, scene?.positions ?? new Float32Array(0), gl.DYNAMIC_DRAW)
    if (this.discBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.discBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, scene?.discs ?? new Float32Array(0), gl.DYNAMIC_DRAW)
    }
    // The colour buffers are the diagnostic mode's alone: a monochrome board
    // takes its colour from a uniform and allocates nothing (spec §8).
    if (scene && colored) {
      const colors = tesselateColors(scene)
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
  }
```

- replace `writeRange`, and add the helper it uses:

```ts
  /**
   * Collapses one piece in the static buffers, or writes it back from the
   * scene. A collapsed triangle has all three vertices at the origin and a
   * collapsed disc has no radius, so neither covers a fragment.
   */
  writeRange(scene: Scene, r: PieceRanges, visible: boolean): void {
    if (this.posBuffer) this.writeSlices(this.posBuffer, scene.positions, [r.line, r.head], 2, visible)
    if (this.discBuffer) this.writeSlices(this.discBuffer, scene.discs, [r.corners, r.tail], FLOATS_PER_DISC, visible)
  }

  /** The ranges of `source`, `per` floats an element, into `buffer` — or zeroes of the same length. */
  private writeSlices(
    buffer: WebGLBuffer,
    source: Float32Array,
    ranges: readonly Range[],
    per: number,
    visible: boolean,
  ): void {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    for (const range of ranges) {
      if (range.count === 0) continue
      const slice = visible
        ? source.subarray(range.start * per, (range.start + range.count) * per)
        : new Float32Array(range.count * per)
      gl.bufferSubData(gl.ARRAY_BUFFER, range.start * per * Float32Array.BYTES_PER_ELEMENT, slice)
    }
  }
```

- `delete()` also deletes `discProgram`, `discBuffer`, `cornerBuffer`, `discColorBuffer` and `rideDiscBuffer`, each behind the same null check as its neighbours.

- [ ] **Step 5: The disc pass**

In `gl-passes.ts`, import `type Range` from `./tesselate.ts` beside `Block, Scene`, and add below `bindAttrs`:

```ts
/** Bytes a disc takes in a disc buffer, and a disc colour in a colour buffer. */
const DISC_BYTES = 3 * Float32Array.BYTES_PER_ELEMENT
const COLOR_BYTES = 4

/**
 * One block of discs, as instances of the unit quad. WebGL2 has no
 * `baseInstance`, so the block's first disc is reached by pointing the
 * instanced attributes at it. Leaves the attribute state as it found it —
 * divisors back to 0 and its arrays disabled — because every program shares
 * the default vertex array, and a divisor left at 1 on a location the main
 * program uses would draw the board as copies of its first vertex.
 * `res.discProgram` must be the one in use.
 */
function drawDiscBlock(
  res: GlResources,
  discs: WebGLBuffer,
  colors: WebGLBuffer | null,
  range: Range,
  flat: Rgba,
): void {
  if (range.count === 0 || !res.cornerBuffer) return
  const gl = res.gl
  const prog = res.discProgram
  const cornerLoc = gl.getAttribLocation(prog, 'a_corner')
  const discLoc = gl.getAttribLocation(prog, 'a_disc')
  const colorLoc = gl.getAttribLocation(prog, 'a_color')
  gl.bindBuffer(gl.ARRAY_BUFFER, res.cornerBuffer)
  gl.enableVertexAttribArray(cornerLoc)
  gl.vertexAttribPointer(cornerLoc, 2, gl.FLOAT, false, 0, 0)
  gl.bindBuffer(gl.ARRAY_BUFFER, discs)
  gl.enableVertexAttribArray(discLoc)
  gl.vertexAttribPointer(discLoc, 3, gl.FLOAT, false, DISC_BYTES, range.start * DISC_BYTES)
  gl.vertexAttribDivisor(discLoc, 1)
  if (colors) {
    gl.bindBuffer(gl.ARRAY_BUFFER, colors)
    gl.enableVertexAttribArray(colorLoc)
    gl.vertexAttribPointer(colorLoc, 4, gl.UNSIGNED_BYTE, true, COLOR_BYTES, range.start * COLOR_BYTES)
    gl.vertexAttribDivisor(colorLoc, 1)
  } else if (colorLoc !== -1) {
    gl.disableVertexAttribArray(colorLoc)
  }
  gl.uniform1i(gl.getUniformLocation(prog, 'u_useAttr'), colors ? 1 : 0)
  gl.uniform4fv(gl.getUniformLocation(prog, 'u_flat'), flat)
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, range.count)
  gl.vertexAttribDivisor(discLoc, 0)
  gl.disableVertexAttribArray(discLoc)
  gl.disableVertexAttribArray(cornerLoc)
  if (colors) {
    gl.vertexAttribDivisor(colorLoc, 0)
    gl.disableVertexAttribArray(colorLoc)
  }
}
```

Replace `drawPieces`:

```ts
/**
 * The four blocks of the static buffer, in `PASSES` order, each followed by
 * its own discs: the corners after the lines they join, the tails after the
 * heads. That is the order the fans used to be drawn in, block for block, so
 * the picture composites as it always has. `useAttr` is true when the board
 * is drawn in its diagnostic colours and the colour buffers exist.
 */
export function drawPieces(
  res: GlResources,
  scene: Scene,
  useAttr: boolean,
  ink: Rgba,
  highlight: Rgba,
  vp: Viewport,
  width: number,
  height: number,
): void {
  const gl = res.gl
  const program = res.program
  gl.useProgram(res.discProgram)
  setView(gl, res.discProgram, vp, width, height)
  for (const pass of PASSES) {
    // Highlighted pieces take one flat colour, so the diagnostic hues never
    // reach them — the same rule the SVG group carried on its stroke.
    const attr = !pass.highlight && useAttr
    const flat = pass.highlight ? highlight : ink
    const range = scene.blocks[pass.block]
    if (range.count > 0) {
      gl.useProgram(program)
      // Bound again every pass: the disc pass before it left its arrays disabled.
      bindAttrs(gl, program, res.posBuffer, useAttr ? res.colorBuffer : null)
      gl.uniform1i(gl.getUniformLocation(program, 'u_useAttr'), attr ? 1 : 0)
      gl.uniform4fv(gl.getUniformLocation(program, 'u_flat'), flat)
      gl.drawArrays(gl.TRIANGLES, range.start, range.count)
    }
    const discs = scene.discBlocks[pass.block]
    if (discs.count > 0 && res.discBuffer) {
      gl.useProgram(res.discProgram)
      drawDiscBlock(res, res.discBuffer, attr ? res.discColorBuffer : null, discs, flat)
    }
  }
  // Every pass after this one assumes the main program is current.
  gl.useProgram(program)
}
```

In `gl-layer.ts` `draw()`, change the call to:

```ts
    drawPieces(res, scene, this.view.colored && res.colorBuffer !== null, this.inkRgba, this.highlightRgba, vp, width, height)
```

(`deno fmt` will wrap it; let it.)

- [ ] **Step 6: Run the gates**

Run the four gates of Global Constraints.
Expected: all PASS, the five new browser tests included.

- [ ] **Step 7: Commit**

```bash
git add packages/board-element/src/gl-shaders.ts packages/board-element/src/gl-resources.ts packages/board-element/src/gl-passes.ts packages/board-element/src/gl-layer.ts packages/board-element/src/gl-layer.browser.test.ts
git commit -m "The board draws its discs as instances of one quad, each block's after its triangles, with the edge computed in the fragment shader"
```

---

### Task 3: Riders draw their discs

**Files:**
- Modify: `packages/board-element/src/gl-resources.ts` (`uploadRiders`)
- Modify: `packages/board-element/src/gl-passes.ts` (`drawRiders`)
- Modify: `packages/board-element/src/gl-layer.ts:461` (the `drawRiders` call)
- Test: `packages/board-element/src/gl-layer.browser.test.ts`

**Interfaces:**
- Consumes: `Rider.discs/discCount/discStart` (Task 1); `GlResources.rideDiscBuffer`, `GlResources.discProgram`, `drawDiscBlock`, `setView` (Task 2).
- Produces: `drawRiders(res, riders, vp, board, pad, width: number, height: number): void` — `width` is new, before `height`.

- [ ] **Step 1: Write the failing test**

Append to `gl-layer.browser.test.ts`:

```ts
test('a riding piece draws its tail as a true circle too', async () => {
  const b = bentBoard()
  layer.setBoard(b, INK_ON_PAPER)
  const { between } = tailProbes()
  probeAt(b, ...between)
  // Warm the frame clock first, or the ride settles on its first tick (see
  // 'a riding piece is drawn once').
  await drawn()
  layer.drawNowForTest()
  expect(isInk(centre())).toBe(true)
  // A shake of no distance rides the piece to where it already is: the static
  // buffer lets go of it, and only the rider draws it.
  const ride = layer.shake(BENT.id, 0)
  await drawn()
  layer.drawNowForTest()
  const riding = centre()
  await ride
  expect(isInk(riding)).toBe(true)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run --project chromium src/gl-layer.browser.test.ts -t "riding piece draws its tail"`
Expected: FAIL — while riding, the probe reads paper: the rider still draws the fan and nothing uploads or draws its discs.

- [ ] **Step 3: Upload the riders' discs**

Replace `uploadRiders` in `gl-resources.ts`:

```ts
  /**
   * Every rider's triangles and discs into the rider buffers, back to back,
   * and each rider's own slices of them recorded. One upload for all of them
   * rather than one buffer per ride: two pieces can be riding at once — two
   * quick clicks are enough — and a buffer holding only whichever uploaded
   * last would drop the other one for the frame. Takes the map rather than an
   * iterator because it walks the riders twice.
   */
  uploadRiders(riders: ReadonlyMap<number, Rider>): void {
    const gl = this.gl
    let total = 0
    let discTotal = 0
    for (const r of riders.values()) {
      total += r.count
      discTotal += r.discCount
    }
    if (total === 0) return
    if (this.rideScratch.length < total * 2) this.rideScratch = new Float32Array(total * 2)
    if (this.rideDiscScratch.length < discTotal * FLOATS_PER_DISC) {
      this.rideDiscScratch = new Float32Array(discTotal * FLOATS_PER_DISC)
    }
    let at = 0
    let discAt = 0
    for (const r of riders.values()) {
      r.start = at
      this.rideScratch.set(r.data.subarray(0, r.count * 2), at * 2)
      at += r.count
      r.discStart = discAt
      this.rideDiscScratch.set(r.discs.subarray(0, r.discCount * FLOATS_PER_DISC), discAt * FLOATS_PER_DISC)
      discAt += r.discCount
    }
    this.rideBuffer ??= gl.createBuffer()
    if (this.rideBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.rideBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, this.rideScratch.subarray(0, total * 2), gl.DYNAMIC_DRAW)
    }
    if (discTotal === 0) return
    this.rideDiscBuffer ??= gl.createBuffer()
    if (!this.rideDiscBuffer) return
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rideDiscBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.rideDiscScratch.subarray(0, discTotal * FLOATS_PER_DISC), gl.DYNAMIC_DRAW)
  }
```

- [ ] **Step 4: Draw the riders' discs**

Replace `drawRiders` in `gl-passes.ts`:

```ts
/**
 * The pieces part way down their own track, over the resting ones and
 * clipped to the paper: each rider's triangles, then its discs. Only a
 * riding piece is clipped: a scissor over the whole board would cost nothing
 * here, but the rule is the SVG's — a piece leaves at the paper's edge, and
 * nothing else ever reaches it.
 */
export function drawRiders(
  res: GlResources,
  riders: ReadonlyMap<number, Rider>,
  vp: Viewport,
  board: Board,
  pad: number,
  width: number,
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
  gl.useProgram(res.discProgram)
  setView(gl, res.discProgram, vp, width, height)
  for (const r of riders.values()) {
    if (r.count === 0) continue
    gl.useProgram(program)
    // Bound again every rider: the disc pass before it left its arrays disabled.
    bindAttrs(gl, program, res.rideBuffer, null)
    gl.uniform1i(gl.getUniformLocation(program, 'u_useAttr'), 0)
    gl.uniform4fv(gl.getUniformLocation(program, 'u_flat'), r.color)
    gl.drawArrays(gl.TRIANGLES, r.start, r.count)
    if (r.discCount > 0 && res.rideDiscBuffer) {
      gl.useProgram(res.discProgram)
      drawDiscBlock(res, res.rideDiscBuffer, null, { start: r.discStart, count: r.discCount }, r.color)
    }
  }
  gl.useProgram(program)
  gl.disable(gl.SCISSOR_TEST)
}
```

In `gl-layer.ts` `draw()`, change the call to `drawRiders(res, this.rides.riders, vp, board, this.padCells, width, height)`.

- [ ] **Step 5: Run the gates**

Run the four gates of Global Constraints.
Expected: all PASS, including the existing ride tests (`a shake leaves the picture exactly as it found it`, `a riding piece is drawn once`, `two pieces can ride at once`, `a rider is clipped at the paper`) and `rides.browser.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/board-element/src/gl-resources.ts packages/board-element/src/gl-passes.ts packages/board-element/src/gl-layer.ts packages/board-element/src/gl-layer.browser.test.ts
git commit -m "A rider uploads and draws its discs after its triangles, inside the same scissor"
```

---

### Task 4: The fans go

Every rounding is now drawn twice — by its fan and by its disc. This task deletes the fans. The pixel tests of Tasks 2 and 3 are what prove nothing is lost: they read ink where only a disc can put it.

**Files:**
- Modify: `packages/board-element/src/tesselate.ts`
- Test: `packages/board-element/src/tesselate.test.ts`

**Interfaces:**
- Consumes: everything of Task 1.
- Produces: no new names. Deleted: `TAIL_SEGMENTS`, `JOIN_SEGMENTS`, `writeDisc`, `writeJoin`. `lineVerticesOf(line)` loses its `rounded` parameter.

- [ ] **Step 1: Rewrite the fan-count tests so they fail against the fans**

In `tesselate.test.ts`, drop `JOIN_SEGMENTS` and `TAIL_SEGMENTS` from the import, then:

- `'a one-cell piece has no line segments and still has a head and a tail'`: replace the last `expect` with

```ts
  // The head is its fan alone; the tail is a disc, not triangles.
  expect(r?.head.count).toBe(3 * (shape.head.length - 2))
  expect(r?.tail.count).toBe(1)
```

- `'a ridden piece follows trackLine, corners included'`: `const want = 6 * segments + 3 * (shape.head.length - 2)` (the `expect(w.discs).toBe(corners + 1)` of Task 1 stays).
- replace `'a corner costs one fan when rounded and nothing when sharp'` with:

```ts
test('a corner costs one disc when rounded, and no triangles in either mode', () => {
  const sharp = tesselateBoard(onlyPiece(BENT), { ...DEFAULT_VIEW, rounded: false }, NONE)
  const round = tesselateBoard(onlyPiece(BENT), { ...DEFAULT_VIEW, rounded: true }, NONE)
  // BENT turns once. Its segments are six vertices each in both modes; only
  // where they stop at the corner differs.
  expect(round.rangeOf(BENT.id)?.line.count).toBe(sharp.rangeOf(BENT.id)?.line.count)
  expect(round.rangeOf(BENT.id)?.corners.count).toBe(1)
  expect(sharp.rangeOf(BENT.id)?.corners.count).toBe(0)
})
```

- replace `'a rounded corner sits on the outer side of the turn, at radius half'` with:

```ts
test('both segments stop at a rounded corner, so nothing pokes out past its disc', () => {
  const scene = tesselateBoard(onlyPiece(BENT), { ...DEFAULT_VIEW, rounded: true }, NONE)
  const r = scene.rangeOf(BENT.id)
  if (!r) throw new Error('BENT is not drawn')
  // BENT turns at (4.5, 5.5) from running left to running down, so the outer
  // side of the turn is x < 4.5 and y < 5.5 at once. The disc covers that
  // quarter; a segment extended by half a stroke would reach into it with a
  // square corner the disc could never hide.
  const corner = at(BENT.cells, 1)
  const cx = corner.x + 0.5, cy = corner.y + 0.5
  const tol = 1e-6
  for (const [x, y] of points(scene.positions, r.line)) {
    expect(x < cx - tol && y < cy - tol).toBe(false)
  }
})
```

- `'a sharp tail is a square with the same reach as the disc'`: replace its first `expect` and comment with

```ts
  // The square is two triangles in the head block; the disc is none, it is in the disc stream.
  expect(headOf(sharp) - headOf(round)).toBe(6)
```

and after `expect(reach).toBeCloseTo(half, 9)` add

```ts
  const tailDisc = round.rangeOf(BENT.id)?.tail
  if (!tailDisc) throw new Error('no tail disc')
  expect(reach).toBeCloseTo(at(round.discs, tailDisc.start * FLOATS_PER_DISC + 2), 6)
```

- `'merging leaves a piece with no straight run untouched'`: `toBe(6 * (shape.line.length - 1))`, and add `expect(scene.rangeOf(ZIGZAG.id)?.corners.count).toBe(2)`.
- `'BENT keeps its corner and loses its straight run'`: change the comment's last sentence to "Two segments and one corner disc." and the assertion to `toBe(6 * 2)`, then add `expect(scene.rangeOf(BENT.id)?.corners.count).toBe(1)`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run --project node src/tesselate.test.ts`
Expected: FAIL on the count tests (the fans are still in the triangles). `'both segments stop at a rounded corner'` passes: it guards the segment rule, which does not change.

- [ ] **Step 3: Delete the fans from `tesselate.ts`**

- delete `TAIL_SEGMENTS` and `JOIN_SEGMENTS` with their doc comments;
- delete `writeJoin` and `writeDisc` with their doc comments;
- `lineVerticesOf`:

```ts
/** The vertices one polyline takes: its merged segments, six each. */
function lineVerticesOf(line: readonly [number, number][]): number {
  return segmentVertices(mergeCollinear(line).length)
}
```

- `headVertices`:

```ts
/** A head's fan, plus the sharp tail's square; a round tail is a disc, not triangles. */
const headVertices = (points: number, rounded: boolean): number => 3 * (points - 2) + (rounded ? 0 : 6)
```

- `rideVertexBound`: body becomes

```ts
  const points = piece.cells.length + 2
  // The sharp tail's square is the only cap that costs triangles now.
  return segmentVertices(points) + headVertices(MAX_HEAD_POINTS, false)
```

and its doc comment's last clause becomes "the head takes its widest form, and the tail the square."

- `writeSegment`'s doc comment: replace "and the tail is rounded by its own disc, so a square cap out there would reach `0.707 * w` into its corners, past that disc's radius, and bury the disc's triangles under geometry nothing ever shows." with "and the tail is rounded by its own disc, so a square cap out there would reach `0.707 * w` into its corners, past that disc's radius, and show as a square corner the disc cannot hide."
- `writeLine`: delete the trailing fan loop (`if (!rounded) return o` and the `for` after it) so it ends at `return o`; its doc comment's last sentence becomes "A rounded turn is covered by a disc in the scene's disc stream instead (`writeCorners`)." and the inline comment "A rounded corner is filled by its own fan" becomes "A rounded corner is filled by its own disc".
- `tesselateBoard`: `const line = lineVerticesOf(s.line)`; replace the two tail lines after `writeFan` with `if (!view.rounded) writeSquare(positions, headEnd, s.tail.x, s.tail.y, s.tail.r)`.
- `tesselatePiece`: replace the `writeDisc`/`writeSquare` line with `if (!view.rounded) o = writeSquare(out, o, tx, ty, s.tail.r)`.

Then `grep -n "TAIL_SEGMENTS\|JOIN_SEGMENTS\|writeDisc\|writeJoin\|fan" packages/board-element/src/*.ts` and fix every comment still describing a rounding as a fan (the head's fan stays a fan; `writeFan` stays).

- [ ] **Step 4: Run the gates**

Run the four gates of Global Constraints.
Expected: all PASS — in particular the disc pixel tests of Tasks 2 and 3, which now see only discs.

- [ ] **Step 5: Commit**

```bash
git add packages/board-element/src/tesselate.ts packages/board-element/src/tesselate.test.ts
git commit -m "The tail and corner fans are deleted: every rounding on the board is a disc now"
```

---

### Task 5: Comments, measurement, PR (controller, with the user)

Not for a subagent: the measurement needs a foreground Chrome on the user's machine, and the screenshots are the user's judgement (spec §7).

**Files:**
- Modify: `packages/board-element/src/gl-layer.ts:1-5` (header)
- Modify: `docs/superpowers/specs/2026-09-11-disc-primitive-design.md` (status line, measured figures)

- [ ] **Step 1: Comments that count draw calls**

`gl-layer.ts`'s header says "a pan is two uniforms and six draw calls". It is now up to four more (one disc block per non-empty block) plus the riders. Rewrite that sentence to: "a pan is a handful of uniforms and a dozen draw calls at most, so a frame costs what the host has pixels and not what the board has pieces." Check `gl-passes.ts`'s header and `PASSES` doc still read true. Commit: "Comments count the disc passes among a frame's draw calls".

- [ ] **Step 2: Buffer sizes, before and after**

On `main` (a worktree: `git worktree add ../arrowz-main main`) and on this branch, add a temporary line at the end of `GlResources.upload`:

```ts
    console.log(`upload: positions=${scene?.positions.byteLength ?? 0} discs=${scene?.discs.byteLength ?? 0}`)
```

(on `main` only `positions` exists — drop the `discs` term there). Run `ARROWZ_MEASURE=1 pnpm vitest run --project chromium perf --silent=false --reporter=verbose` from `packages/board-element/` in both, read the Insane lines, and remove the log. Expected: `main` ≈ 96 MB positions; branch ≈ 17 MB positions + ≈ 4.3 MB discs. Also record the `build=` and `pan` figures the same run prints.

- [ ] **Step 3: GPU time per frame, before and after**

In both trees, temporarily wrap the body of `GlLayer.draw()` after `this.frameCount++` with a `EXT_disjoint_timer_query_webgl2` query:

```ts
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
    const q = ext ? gl.createQuery() : null
    if (ext && q) gl.beginQuery(ext.TIME_ELAPSED_EXT, q)
    // ... the passes ...
    if (ext && q) {
      gl.endQuery(ext.TIME_ELAPSED_EXT)
      const poll = (): void => {
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return void requestAnimationFrame(poll)
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) console.log(`gpu ${(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6).toFixed(2)} ms`)
        gl.deleteQuery(q)
      }
      requestAnimationFrame(poll)
    }
```

(the early `return`s inside `draw()` must end the query too — put the passes in an inner function and time its call). Serve the demo (`pnpm nx serve board-element`), load Insane seed 7 in a foreground Chrome, pan at fitted zoom and at `MAX_CELL_PX`, three samples each, both trees. Expected: branch no worse than `main` beyond ±0.9 ms. Remove the instrumentation from both trees.

- [ ] **Step 4: Screenshots**

Same demo, same board: fitted zoom and `MAX_CELL_PX`, monochrome and coloured, `main` against the branch, shown to the user side by side. The user rules on them (spec §7, §9).

- [ ] **Step 5: Record and open the PR**

- In the spec, set `Status:` to "implemented on `feat/disc-primitive`" and add a "Measured" paragraph with the figures of Steps 2-3.
- `pnpm nx run-many -t verify` and `deno task verify` from the root: both green.
- Commit the spec, push, and open the PR with `gh pr create --base main` — title "One instanced disc draws every tail cap and round join", body: what changed, the measured figures, the screenshots' verdict, no attribution lines. Merging is the user's (`gh pr merge` needs their `!` command).
- `git worktree remove ../arrowz-main`.

---

### Task 6: Corner discs under half a device pixel are not drawn (added after Task 5's measurement)

Task 5 measured the branch about 1.2 ms a frame slower on the GPU than `main` at the fitted zoom, outside the spec's ±0.9 ms band: 362 k discs of about 0.2 px radius each run the fragment shader and blend, where the fans' tiny triangles mostly hit no MSAA sample. A spike that skipped the corner discs below half a device pixel of radius brought the fitted frame to 6.0 ms (`main` 8.6-9.9 ms) with the fitted screenshot back to `main`'s tone and the 8 px/cell screenshot identical to `main`. Below that size three quarters of a corner disc lie under its segments and the rest is at most a quarter of a pixel. Tails are always drawn: they stick out past the line's end.

**Files:**
- Modify: `packages/board-element/src/tesselate.ts` (`Scene.cornerRadius`, set in `tesselateBoard`)
- Modify: `packages/board-element/src/gl-passes.ts` (`MIN_CORNER_PX`, `cornersTooSmall`, `drawPieces`)
- Modify: `docs/superpowers/specs/2026-09-11-disc-primitive-design.md` (§5.3)
- Test: `packages/board-element/src/tesselate.test.ts`, `packages/board-element/src/gl-layer.browser.test.ts`

**Interfaces:**
- Produces: `Scene.cornerRadius: Readonly<Record<'lines' | 'topLines', number>>`; `export const MIN_CORNER_PX = 0.5` in `gl-passes.ts`.
- Riders are not touched: a rider draws every disc it has (a handful of pieces; its discs are one run of corners then tail).

- [ ] **Step 1: Write the failing tests**

`tesselate.test.ts`, before the `voidQuads` tests:

```ts
test('the scene knows the radius of every corner disc in each line block', () => {
  const view = { ...DEFAULT_VIEW, top: 2 }
  const scene = tesselateBoard(board(), view, NONE)
  // Half the stroke each block is drawn with: highlighted pieces are thicker.
  expect(scene.cornerRadius.lines).toBe(strokeOf(view, false) / 2)
  expect(scene.cornerRadius.topLines).toBe(strokeOf(view, true) / 2)
})
```

`gl-layer.browser.test.ts`: add `MIN_CORNER_PX` to an import from `./gl-passes.ts` (new import line), then append:

```ts
test('corner discs under half a device pixel are not drawn, and tails always are', () => {
  const b = bentBoard()
  const gl = layer.canvas.getContext('webgl2')
  if (!gl) throw new Error('no webgl2')
  // Every instanced draw is a block of discs; record how many discs each one drew.
  const instances: number[] = []
  const draw = gl.drawArraysInstanced.bind(gl)
  gl.drawArraysInstanced = (mode: number, first: number, count: number, n: number): void => {
    instances.push(n)
    draw(mode, first, count, n)
  }
  const v = fit({ W: b.W, H: b.H, hostWidth: HOST, hostHeight: HOST, pad: 0 })
  const half = DEFAULT_VIEW.stroke / 2
  const cellPxFor = (radiusPx: number): number => radiusPx / (half * devicePixelRatio)

  layer.setBoard(b, INK_ON_PAPER)
  // Just under the threshold: BENT's one corner disc is skipped, its tail is not.
  layer.setViewport({ ...v, cellPx: cellPxFor(MIN_CORNER_PX * 0.9) })
  layer.drawNowForTest()
  expect(instances).toEqual([1])

  // Just over it: the corner comes back, drawn before the tail (lines before heads).
  instances.length = 0
  layer.setViewport({ ...v, cellPx: cellPxFor(MIN_CORNER_PX * 1.1) })
  layer.drawNowForTest()
  expect(instances).toEqual([1, 1])

  // Each block measures its own radius: highlighted in colour mode, BENT is
  // 1.5 times thicker, so the zoom that hid its corner above shows it now.
  instances.length = 0
  layer.setBoard(b, { ...INK_ON_PAPER, colored: true, top: 1 })
  layer.setViewport({ ...v, cellPx: cellPxFor(MIN_CORNER_PX * 0.9) })
  layer.drawNowForTest()
  expect(instances).toEqual([1, 1])
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `packages/board-element/`): `pnpm vitest run --project node src/tesselate.test.ts` and `pnpm vitest run --project chromium src/gl-layer.browser.test.ts -t "corner discs under half"`.
Expected: FAIL — `cornerRadius` is undefined; `MIN_CORNER_PX` is not exported, and once it is, the first `expect(instances)` sees `[1, 1]`.

- [ ] **Step 3: Implement**

`tesselate.ts`, in `Scene` after `discBlocks`:

```ts
  /**
   * The radius every corner disc of a line block is drawn with, in cells:
   * half that block's stroke. The disc pass compares it with the zoom, so a
   * whole block of corners too small to see is never drawn.
   */
  cornerRadius: Readonly<Record<'lines' | 'topLines', number>>
```

and in `tesselateBoard`'s returned object, after `discBlocks,`:

```ts
    cornerRadius: { lines: strokeOf(view, false) / 2, topLines: strokeOf(view, true) / 2 },
```

`gl-passes.ts`, below `COLOR_BYTES`:

```ts
/**
 * The smallest corner disc drawn, as a radius in device pixels. Below it,
 * three quarters of a corner disc lie under the two segments it joins and
 * the quarter left over is at most a quarter of a pixel, while 276 k of them
 * on Insane cost the fitted frame more GPU time than every other pass
 * together. Tails are always drawn: they stick out past the line's end.
 */
export const MIN_CORNER_PX = 0.5

/** Whether a block's discs are corners too small to draw at this zoom; a head block's discs are tails, never too small. */
function cornersTooSmall(scene: Scene, block: Block, vp: Viewport): boolean {
  if (block !== 'lines' && block !== 'topLines') return false
  return scene.cornerRadius[block] * vp.cellPx * devicePixelRatio < MIN_CORNER_PX
}
```

and in `drawPieces`, the disc condition becomes:

```ts
    const discs = scene.discBlocks[pass.block]
    if (discs.count > 0 && res.discBuffer && !cornersTooSmall(scene, pass.block, vp)) {
```

Spec §5.3, after the paragraph that ends "every overlap inside a block is between one colour and itself, so nothing shows.", add:

"A line block's discs are skipped outright when its corner radius — half that block's stroke, the same for every corner in it (`Scene.cornerRadius`) — is under `MIN_CORNER_PX`, half a device pixel, at the current zoom. Below that size three quarters of the disc lie under the two segments it joins and the quarter left over is at most a quarter of a pixel; drawing them anyway cost the fitted Insane frame about 1.2 ms of GPU time over `main` (Task 5 of the plan measured it), and skipping them brought the frame to 6.0 ms against `main`'s 8.6-9.9. The decision is one comparison per block on the CPU, so a skipped block costs nothing on the GPU. Head blocks are never skipped: a tail sticks out past the line's end. Riders draw every disc they have."

- [ ] **Step 4: Run the gates** (Global Constraints). Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/board-element/src/tesselate.ts packages/board-element/src/tesselate.test.ts packages/board-element/src/gl-passes.ts packages/board-element/src/gl-layer.browser.test.ts docs/superpowers/specs/2026-09-11-disc-primitive-design.md
git commit -m "Corner discs too small to see are not drawn: a line block's discs are skipped under half a device pixel of radius"
```
